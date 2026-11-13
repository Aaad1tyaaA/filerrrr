// Real conversions on real files (no mocks). PDF printing is covered by electron.test.cjs.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const sharp = require('sharp');
const { run } = require('../convert.cjs');
const data = require('../engines/data.cjs');
const { makeFixtures } = require('./fixtures.cjs');

let fx;
test.before(async () => { fx = await makeFixtures(); });
test.after(() => fs.rmSync(fx.dir, { recursive: true, force: true }));

const head = (p, n) => fs.readFileSync(p).subarray(0, n).toString('latin1');
async function ok(file, face, pick) {
  const [r] = await run([fx.p(file)], face, pick);
  assert.ok(!r.error, `${file} -> ${pick}: ${r.error}`);
  assert.equal(path.dirname(r.output), fx.dir, 'saved next to the original');
  return r;
}

test('images to every image target, with the right signature', async () => {
  const magic = { JPG: '\xff\xd8', WEBP: 'RIFF', PDF: '%PDF', ICO: '\0\0\x01\0', GIF: 'GIF8', TIFF: 'II', BMP: 'BM' };
  for (const T of ['JPG', 'WEBP', 'AVIF', 'PDF', 'GIF', 'TIFF', 'BMP', 'ICO']) {
    const r = await ok('pic.png', 'formats', T);
    if (magic[T]) assert.equal(head(r.output, magic[T].length), magic[T], T);
  }
  assert.equal((await sharp((await ok('logo.svg', 'formats', 'PNG')).output).metadata()).format, 'png');
  assert.equal((await sharp((await ok('old.bmp', 'formats', 'PNG')).output).metadata()).width, 32);
  assert.equal(head((await ok('anim.gif', 'formats', 'MP4')).output, 12).slice(4, 8), 'ftyp');
});

test('the original is never touched and names never collide', async () => {
  const before = fs.readFileSync(fx.p('pic.png'));
  const a = await ok('pic.png', 'formats', 'PNG' === 'x' ? '' : 'JPG');
  const b = await ok('pic.png', 'formats', 'JPG');
  assert.notEqual(a.output, b.output);
  assert.match(path.basename(b.output), /^pic \(\d\)\.jpg$/);
  assert.ok(before.equals(fs.readFileSync(fx.p('pic.png'))));
  const many = await run([fx.p('pic.png'), fx.p('pic.png'), fx.p('pic.png')], 'formats', 'WEBP');
  assert.equal(new Set(many.map(r => r.output)).size, 3, 'parallel jobs get distinct names');
});

test('image tools', async () => {
  const meta = async r => sharp(r.output).metadata();
  assert.equal((await meta(await ok('pic.png', 'tools', 'ROT'))).width, 40);
  assert.equal((await meta(await ok('pic.png', 'tools', 'HALF'))).width, 32);
  assert.match(path.basename((await ok('pic.png', 'tools', 'FLIP')).output), /-flipped\.png$/);
  assert.match(path.basename((await ok('pic.png', 'tools', 'CLN')).output), /-clean\.png$/);
  const gray = await sharp((await ok('pic.png', 'tools', 'GRAY')).output).raw().toBuffer();
  assert.equal(gray[0], gray[1]); assert.equal(gray[1], gray[2]);
});

test('merge pictures and PDFs into one PDF, zip a selection', async () => {
  const [m] = await run([fx.p('pic.png'), fx.p('doc.pdf'), fx.p('second.png')], 'tools', 'MRG');
  assert.ok(!m.error, m.error);
  const { PDFDocument } = require('pdf-lib');
  assert.equal((await PDFDocument.load(fs.readFileSync(m.output))).getPageCount(), 4);
  assert.match(path.basename(m.output), /pic \+ 2 more\.pdf/);
  const [z] = await run([fx.p('pic.png'), fx.p('plain.txt')], 'tools', 'ZIP');
  assert.ok(!z.error, z.error); assert.equal(head(z.output, 2), 'PK');
});

test('a bad file fails alone and leaves nothing behind', async () => {
  fs.writeFileSync(fx.p('broken.jpg'), 'not a picture');
  const res = await run([fx.p('broken.jpg'), fx.p('pic.png')], 'formats', 'AVIF');
  assert.ok(res[0].error); assert.ok(!fs.existsSync(fx.p('broken.avif')));
  assert.ok(res[1].output);
  const [wrong] = await run([fx.p('tone.wav')], 'tools', 'ROT');
  assert.match(wrong.error, /doesn't work/);
  const [bad] = await run([fx.p('pic.png')], 'formats', 'MP3');
  assert.match(bad.error, /Can't convert/);
  await assert.rejects(run(['relative.png'], 'formats', 'JPG'), /Bad input/);
});

test('audio and video', async () => {
  for (const T of ['MP3', 'OGG', 'FLAC', 'M4A', 'OPUS']) await ok('tone.wav', 'formats', T);
  let last = 0;
  const [mp4] = await run([fx.p('clip.mov')], 'formats', 'MP4', f => last = f);
  assert.ok(!mp4.error, mp4.error); assert.equal(last, 1, 'progress reaches 100%');
  for (const T of ['MKV', 'WEBM', 'AVI', 'GIF', 'WAV']) await ok('clip.mov', 'formats', T);
  for (const t of ['MINI', 'ROT', 'GRAY', 'MUTE']) await ok('clip.mov', 'tools', t);
  await ok('tone.wav', 'tools', 'MINI');
});

test('PDF pages to pictures and text', async () => {
  const [r] = await run([fx.p('doc.pdf')], 'formats', 'PNG');
  assert.equal(r.outputs.length, 2);
  assert.deepEqual(r.outputs.map(o => path.basename(o)), ['doc-p1.png', 'doc-p2.png']);
  assert.equal((await sharp(r.outputs[0]).metadata()).width, 1250); // 300 dpi by default
  await ok('doc.pdf', 'formats', 'JPG');
  const txt = fs.readFileSync((await ok('doc.pdf', 'formats', 'TXT')).output, 'utf8');
  assert.match(txt, /Hello page one/); assert.match(txt, /Second page/);
});

test('documents to HTML, Markdown and text', async () => {
  assert.match(fs.readFileSync((await ok('report.docx', 'formats', 'HTML')).output, 'utf8'), /<h1>Report<\/h1>/);
  assert.match(fs.readFileSync((await ok('report.docx', 'formats', 'TXT')).output, 'utf8'), /Quarterly numbers/);
  assert.match(fs.readFileSync((await ok('report.docx', 'formats', 'MD')).output, 'utf8'), /Report/);
  assert.match(fs.readFileSync((await ok('notes.md', 'formats', 'HTML')).output, 'utf8'), /<strong>bold<\/strong>/);
  assert.match(fs.readFileSync((await ok('notes.md', 'formats', 'TXT')).output, 'utf8'), /• one/);
  assert.match(fs.readFileSync((await ok('plain.txt', 'formats', 'HTML')).output, 'utf8'), /Line &lt;two&gt; &amp; three/);
  const t = fs.readFileSync((await ok('page.html', 'formats', 'TXT')).output, 'utf8');
  assert.match(t, /Hi & bye/); assert.doesNotMatch(t, /alert|color:red/);
});

test('spreadsheets and data', async () => {
  const csv = await run([fx.p('book.xlsx')], 'formats', 'CSV');
  assert.deepEqual(csv[0].outputs.map(o => path.basename(o)), ['book-Sales.csv', 'book-Notes.csv']);
  assert.match(fs.readFileSync(csv[0].outputs[0], 'utf8'), /ink,6/);
  const json = JSON.parse(fs.readFileSync((await ok('book.xlsx', 'formats', 'JSON')).output, 'utf8'));
  assert.deepEqual(json.Sales[1], { item: 'ink', qty: 6 });
  const people = JSON.parse(fs.readFileSync((await ok('people.csv', 'formats', 'JSON')).output, 'utf8'));
  assert.deepEqual(people[0], { name: 'Ada', age: '36', note: 'likes "math", tea' });
  const ExcelJS = require('exceljs'); const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile((await ok('people.csv', 'formats', 'XLSX')).output);
  assert.equal(wb.worksheets[0].getCell('B2').value, 36, 'numbers stay numbers');
  assert.match(fs.readFileSync((await ok('data.json', 'formats', 'YAML')).output, 'utf8'), /- a: 1/);
  assert.equal(fs.readFileSync((await ok('data.json', 'formats', 'CSV')).output, 'utf8'), '﻿a,b,c\r\n1,x,\r\n2,,true\r\n');
  assert.deepEqual(JSON.parse(fs.readFileSync((await ok('conf.yaml', 'formats', 'JSON')).output, 'utf8')), { name: 'test', list: [1, 2] });
});

test('subtitles both ways', async () => {
  assert.match(fs.readFileSync((await ok('subs.srt', 'formats', 'VTT')).output, 'utf8'), /^WEBVTT\n\n1\n00:00:01\.000 --> 00:00:02\.500/);
  const srt = fs.readFileSync((await ok('subs2.vtt', 'formats', 'SRT')).output, 'utf8');
  assert.match(srt, /^1\n00:00:01,000 --> 00:00:02,500\nHi\n\n2\n00:00:03,000 --> 00:00:04,000\nThere/);
});

test('archives: repack as zip and extract', async () => {
  const z = await ok('bundle.7z', 'formats', 'ZIP');
  assert.equal(head(z.output, 2), 'PK');
  const x = await ok('bundle.7z', 'tools', 'XTR');
  assert.ok(fs.statSync(x.output).isDirectory());
  assert.deepEqual(fs.readdirSync(x.output).sort(), ['notes.md', 'plain.txt']);
});

test('csv parser edge cases', () => {
  assert.deepEqual(data.parseCsv('a;b\n1;"x;y"\n'), [['a', 'b'], ['1', 'x;y']]);
  assert.deepEqual(data.parseCsv('a\tb\r\n1\t2'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(data.parseCsv('"multi\nline",z\n'), [['multi\nline', 'z']]);
  assert.equal(data.stringifyCsv([['a,b', 'q"x']]), '"a,b","q""x"\r\n');
  assert.throws(() => data.objectsToRows([1, 2]), /no rows/);
});

test('PDF first page renders for thumbnails', async () => {
  const png = await require('../engines/pdf.cjs').firstPagePng(fx.p('doc.pdf'), 300);
  assert.equal((await sharp(png).metadata()).width, 300);
});
