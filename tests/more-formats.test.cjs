// The wider format set: old image formats, SVG tracing, more audio/video, PDF tools, documents, e-books, e-mail,
// data files, fonts, map data, subtitles and archives. Real files, real conversions.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { spawnSync } = require('child_process');
const sharp = require('sharp');
const { run } = require('../convert.cjs');
const { FFMPEG } = require('../engines/common.cjs');
const { makeFixtures } = require('./fixtures.cjs');

let fx;
const ff = (...a) => { const r = spawnSync(FFMPEG, ['-v', 'error', '-y', ...a]); if (r.status) throw new Error(String(r.stderr)); };
test.before(async () => {
  fx = await makeFixtures();
  const p = fx.p;
  ff('-f', 'lavfi', '-i', 'color=c=red:s=40x30', '-frames:v', '1', p('old.tga'));
  ff('-f', 'lavfi', '-i', 'color=c=blue:s=40x30', '-frames:v', '1', p('scan.pcx'));
  ff('-i', p('subs.srt'), p('styled.ass'));
  const psd = require('ag-psd');
  const w = 20, h = 10, data = new Uint8ClampedArray(w * h * 4).fill(200);
  fs.writeFileSync(p('art.psd'), Buffer.from(psd.writePsd({ width: w, height: h, imageData: { width: w, height: h, data }, children: [] }, { generateThumbnail: false })));
  fs.copyFileSync('C:/Windows/Fonts/segoeui.ttf', p('ui.ttf'));
  fs.writeFileSync(p('conf.toml'), 'title = "x"\n[owner]\nname = "Ada"\nlevels = [1, 2]\n');
  fs.writeFileSync(p('feed.xml'), '<?xml version="1.0"?><feed><entry id="1"><title>A</title></entry><entry id="2"><title>B</title></entry></feed>');
  fs.writeFileSync(p('rows.jsonl'), '{"a":1,"b":"x"}\n{"a":2,"b":"y"}\n');
  fs.writeFileSync(p('people.vcf'), 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Ada Lovelace\r\nTEL;TYPE=CELL:+44 123\r\nEMAIL:ada@example.com\r\nNOTE:likes\\, math\r\nEND:VCARD\r\nBEGIN:VCARD\r\nN:Torvalds;Linus;;;\r\nEMAIL:l@example.com\r\nEND:VCARD\r\n');
  fs.writeFileSync(p('mail.eml'), 'From: Ada <ada@example.com>\r\nTo: bob@example.com\r\nSubject: Hello there\r\nDate: Tue, 10 Nov 2026 10:00:00 +0000\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nFirst line.\r\n\r\nSecond paragraph.\r\n');
  fs.writeFileSync(p('route.geojson'), JSON.stringify({ type: 'FeatureCollection', features: [
    { type: 'Feature', properties: { name: 'Home' }, geometry: { type: 'Point', coordinates: [8.5, 47.3] } },
    { type: 'Feature', properties: { name: 'Walk' }, geometry: { type: 'LineString', coordinates: [[8.5, 47.3], [8.6, 47.4]] } }] }));
});
test.after(() => fs.rmSync(fx.dir, { recursive: true, force: true }));

test('PDF to DOCX reports real page progress, writing and saved state', async () => {
  const updates = [];
  const [result] = await run([fx.p('doc.pdf')], 'formats', 'DOCX', (fraction, detail) => updates.push({ fraction, ...detail }));
  assert.ok(!result.error, result.error);
  const pages = updates.filter(p => p.stage === 'Reading PDF' && p.page);
  assert.deepEqual(pages.map(p => p.page), [1, 2]);
  assert.ok(pages.every(p => p.pages === 2 && p.input === fx.p('doc.pdf')));
  assert.ok(updates.some(p => p.stage === 'Writing DOCX' && p.indeterminate));
  assert.equal(updates.at(-1).fraction, 1);
  assert.equal(updates.at(-1).completed, 1);
  assert.equal(updates.at(-1).stage, 'File saved');
  assert.ok(updates.every((p, i) => p.fraction >= 0 && p.fraction <= 1 && (!i || p.fraction >= updates[i - 1].fraction)));
  assert.match((await require('mammoth').extractRawText({ path: result.output })).value, /Hello page one/);
});

const read = r => fs.readFileSync(r.output, 'utf8');
async function ok(file, face, pick) {
  const res = await run([fx.p(file)], face, pick);
  assert.ok(!res[0].error, `${file} -> ${pick}: ${res[0].error}`);
  return res[0];
}

test('old image formats in, TGA / QOI / SVG out', async () => {
  for (const f of ['old.tga', 'scan.pcx', 'art.psd']) assert.equal((await sharp((await ok(f, 'formats', 'PNG')).output).metadata()).format, 'png', f);
  assert.equal((await sharp((await ok('art.psd', 'formats', 'PNG')).output).metadata()).width, 20);
  for (const T of ['TGA', 'QOI']) assert.ok(fs.statSync((await ok('pic.png', 'formats', T)).output).size > 0);
  assert.equal(fs.readFileSync((await ok('pic.png', 'formats', 'QOI')).output).subarray(0, 4).toString(), 'qoif');
  const svg = read(await ok('logo.svg' === 'x' ? 'x' : 'pic.png', 'formats', 'SVG'));
  assert.match(svg, /^<svg[^>]*viewBox/); assert.match(svg, /<path/);
});

test('new image tools', async () => {
  const meta = async r => sharp(r.output).metadata();
  assert.equal((await meta(await ok('pic.png', 'tools', 'DBL'))).width, 128);
  const sq = await meta(await ok('pic.png', 'tools', 'SQR')); assert.equal(sq.width, sq.height);
});

test('more audio and video formats, and the new tools', async () => {
  for (const T of ['AAC', 'AIFF', 'WMA', 'AC3']) await ok('tone.wav', 'formats', T);
  for (const T of ['WMV', 'MPG', 'FLV']) await ok('clip.mov', 'formats', T);
  await ok('tone.wav', 'tools', 'NORM');
  await ok('clip.mov', 'tools', '720P');
  assert.equal((await sharp((await ok('clip.mov', 'tools', 'THMB')).output).metadata()).format, 'jpeg');
  const frames = await ok('clip.mov', 'tools', 'FRMS');
  assert.ok(fs.statSync(frames.output).isDirectory()); assert.ok(fs.readdirSync(frames.output).length >= 1);
});

test('subtitles between SRT, VTT, ASS and LRC', async () => {
  assert.match(read(await ok('subs.srt', 'formats', 'ASS')), /\[Events\]/);
  assert.match(read(await ok('styled.ass', 'formats', 'SRT')), /00:00:01,000 --> 00:00:02,500/);
  assert.match(read(await ok('subs.srt', 'formats', 'LRC')), /\[00:01\.00\]Hello/);
});

test('PDF page tools', async () => {
  const { PDFDocument } = require('pdf-lib');
  const pages = async r => (await PDFDocument.load(fs.readFileSync(r.output))).getPageCount();
  const split = await run([fx.p('doc.pdf')], 'tools', 'SPLT');
  assert.equal(split[0].outputs.length, 2);
  assert.equal(await pages(await ok('doc.pdf', 'tools', 'NUP2')), 1, 'two pages on one sheet');
  assert.equal(await pages(await ok('doc.pdf', 'tools', 'NUM')), 2);
  const rot = await PDFDocument.load(fs.readFileSync((await ok('doc.pdf', 'tools', 'ROT')).output));
  assert.equal(rot.getPage(0).getRotation().angle, 90);
});

test('PDF image export includes every page beyond page 500', async () => {
  const { PDFDocument } = require('pdf-lib');
  const doc = await PDFDocument.create();
  for (let i = 0; i < 501; i++) doc.addPage([8, 8]);
  const input = fx.p('long.pdf'), source = Buffer.from(await doc.save());
  fs.writeFileSync(input, source);
  for (const target of ['PNG', 'JPG']) {
    const [result] = await run([input], 'formats', target);
    assert.ok(!result.error, result.error);
    assert.equal(result.outputs.length, 501, target);
    assert.ok(result.outputs.some(p => p.endsWith(`-p501.${target.toLowerCase()}`)));
    for (const output of result.outputs) assert.ok(fs.statSync(output).size > 0);
  }
  assert.deepEqual(fs.readFileSync(input), source, 'the input PDF stays intact');
});

test('PDF and documents to Word, Markdown, HTML and EPUB', async () => {
  const mammoth = require('mammoth');
  const docxText = async r => (await mammoth.extractRawText({ path: r.output })).value;
  assert.match(await docxText(await ok('doc.pdf', 'formats', 'DOCX')), /Hello page one/);
  assert.match(await docxText(await ok('notes.md', 'formats', 'DOCX')), /Some bold text/);
  assert.match(await docxText(await ok('plain.txt', 'formats', 'DOCX')), /Line one/);
  assert.match(read(await ok('page.html', 'formats', 'MD')), /# Hi & bye/);
  assert.match(read(await ok('report.docx', 'formats', 'MD')), /Report/);
  assert.match(read(await ok('doc.pdf', 'formats', 'MD')), /Hello page one/);
  const epub = await ok('notes.md', 'formats', 'EPUB');
  const JSZip = require('jszip'), zip = await JSZip.loadAsync(fs.readFileSync(epub.output));
  assert.equal(Object.keys(zip.files)[0], 'mimetype', 'mimetype comes first');
  // round trip: our EPUB reads back
  fs.renameSync(epub.output, fx.p('book.epub'));
  assert.match(read(await ok('book.epub', 'formats', 'TXT')), /Some bold text/);
  assert.match(read(await ok('book.epub', 'formats', 'HTML')), /<strong>bold<\/strong>/);
});

test('e-mail to HTML and text', async () => {
  const html = read(await ok('mail.eml', 'formats', 'HTML'));
  assert.match(html, /Hello there/); assert.match(html, /Ada &lt;ada@example\.com&gt;/); assert.match(html, /Second paragraph/);
  assert.match(read(await ok('mail.eml', 'formats', 'TXT')), /Subject: Hello there/);
});

test('data formats', async () => {
  assert.deepEqual(JSON.parse(read(await ok('conf.toml', 'formats', 'JSON'))), { title: 'x', owner: { name: 'Ada', levels: [1, 2] } });
  assert.match(read(await ok('conf.yaml', 'formats', 'TOML')), /name = "test"/);
  const feed = JSON.parse(read(await ok('feed.xml', 'formats', 'JSON')));
  assert.equal(feed.feed.entry[1].title, 'B'); assert.equal(feed.feed.entry[0]['@id'], '1', 'attribute values stay text');
  assert.match(read(await ok('data.json', 'formats', 'XML')), /<root>/);
  assert.equal(read(await ok('data.json', 'formats', 'JSNL')).trim().split('\n').length, 2);
  assert.deepEqual(JSON.parse(read(await ok('rows.jsonl', 'formats', 'JSON'))), [{ a: 1, b: 'x' }, { a: 2, b: 'y' }]);
  const cards = JSON.parse(read(await ok('people.vcf', 'formats', 'JSON')));
  assert.deepEqual(cards[0], { name: 'Ada Lovelace', phone: '+44 123', email: 'ada@example.com', note: 'likes, math' });
  assert.equal(cards[1].name, 'Linus Torvalds');
  const ExcelJS = require('exceljs'), wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile((await ok('data.json', 'formats', 'XLSX')).output);
  assert.equal(wb.worksheets[0].getCell('A3').value, 2);
});

test('spreadsheets to TSV and HTML', async () => {
  const tsv = await run([fx.p('book.xlsx')], 'formats', 'TSV');
  assert.match(fs.readFileSync(tsv[0].outputs[0], 'utf8'), /^item\tqty/);
  assert.match(read(await ok('people.csv', 'formats', 'HTML')), /<th>name<\/th>/);
});

test('fonts', async () => {
  const { Font, woff2 } = require('fonteditor-core'); await woff2.init();
  for (const T of ['WOFF', 'WOF2', 'EOT']) {
    const r = await ok('ui.ttf', 'formats', T);
    assert.ok(r.output.endsWith(T === 'WOF2' ? '.woff2' : `.${T.toLowerCase()}`));
  }
  const back = await ok('ui.woff2', 'formats', 'TTF');
  assert.ok(Font.create(fs.readFileSync(back.output), { type: 'ttf' }).get().glyf.length > 100);
});

test('map data: GeoJSON ↔ KML ↔ GPX', async () => {
  const kml = await ok('route.geojson', 'formats', 'KML');
  assert.match(read(kml), /<name>Home<\/name>/);
  fs.renameSync(kml.output, fx.p('back.kml'));
  const gj = JSON.parse(read(await ok('back.kml', 'formats', 'GEO')));
  assert.equal(gj.features.length, 2); assert.deepEqual(gj.features[0].geometry.coordinates.slice(0, 2), [8.5, 47.3]);
  const gpx = read(await ok('route.geojson', 'formats', 'GPX'));
  assert.match(gpx, /<wpt lat="47.3" lon="8.5"><name>Home<\/name><\/wpt>/); assert.match(gpx, /<trkpt lat="47.4" lon="8.6">/);
});

test('archives between zip, 7z, tar and tar.gz', async () => {
  const [z] = await run([fx.p('pic.png'), fx.p('plain.txt')], 'tools', 'ZIP');
  fs.renameSync(z.output, fx.p('pack.zip'));
  const tgz = await ok('pack.zip', 'formats', 'TGZ');
  assert.match(path.basename(tgz.output), /^pack\.tar\.gz$/);
  const sz = await ok('pack.tar.gz', 'formats', '7Z');
  assert.match(path.basename(sz.output), /^pack\.7z$/, 'tar.gz input names its output without .tar');
  const x = await ok('pack.7z', 'tools', 'XTR');
  assert.deepEqual(fs.readdirSync(x.output).sort(), ['pic.png', 'plain.txt']);
});
