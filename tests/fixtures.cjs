// Builds small real files of every kind in a temp folder for the engine tests.
const fs = require('fs'), path = require('path'), os = require('os');
const { spawnSync } = require('child_process');
const sharp = require('sharp');
const { FFMPEG, TAR } = require('../engines/common.cjs');

const ff = (...a) => { const r = spawnSync(FFMPEG, ['-v', 'error', '-y', ...a]); if (r.status) throw new Error(String(r.stderr)); };

async function makeFixtures() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'filerrrr-test-'));
  const p = n => path.join(dir, n);
  await sharp({ create: { width: 64, height: 40, channels: 3, background: '#3366ff' } }).png().toFile(p('pic.png'));
  await sharp({ create: { width: 30, height: 20, channels: 4, background: { r: 255, g: 0, b: 0, alpha: .5 } } }).png().toFile(p('second.png'));
  fs.writeFileSync(p('logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="18" fill="#f50"/></svg>');
  ff('-f', 'lavfi', '-i', 'color=c=green:s=32x24', '-frames:v', '1', p('old.bmp'));
  ff('-f', 'lavfi', '-i', 'sine=d=1', p('tone.wav'));
  ff('-f', 'lavfi', '-i', 'testsrc=d=1:s=161x91', '-f', 'lavfi', '-i', 'sine=d=1', '-shortest', p('clip.mov'));
  ff('-f', 'lavfi', '-i', 'testsrc=d=1:s=80x60:r=10', p('anim.gif'));

  const { PDFDocument, StandardFonts } = require('pdf-lib');
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([300, 200]).drawText('Hello page one', { x: 20, y: 100, size: 18, font });
  doc.addPage([300, 200]).drawText('Second page', { x: 20, y: 100, size: 18, font });
  fs.writeFileSync(p('doc.pdf'), await doc.save());

  fs.writeFileSync(p('notes.md'), '# Title\n\nSome **bold** text.\n\n- one\n- two\n');
  fs.writeFileSync(p('plain.txt'), 'Line one\nLine <two> & three\n');
  fs.writeFileSync(p('page.html'), '<html><head><style>p{color:red}</style><script>alert(1)</script></head><body><h1>Hi &amp; bye</h1><p>Para</p></body></html>');
  fs.writeFileSync(p('people.csv'), '﻿name,age,note\r\nAda,36,"likes ""math"", tea"\r\nLinus,28,\r\n');
  fs.writeFileSync(p('data.json'), JSON.stringify([{ a: 1, b: 'x' }, { a: 2, c: true }]));
  fs.writeFileSync(p('conf.yaml'), 'name: test\nlist:\n  - 1\n  - 2\n');
  fs.writeFileSync(p('subs.srt'), '1\n00:00:01,000 --> 00:00:02,500\nHello\n\n2\n00:00:03,000 --> 00:00:04,000\nWorld\n');
  fs.writeFileSync(p('subs2.vtt'), 'WEBVTT\n\n00:01.000 --> 00:02.500 align:start\nHi\n\n00:00:03.000 --> 00:00:04.000\nThere\n');

  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sales'); ws.addRow(['item', 'qty']); ws.addRow(['pen', 3]); ws.addRow(['ink', { formula: 'B2*2', result: 6 }]);
  wb.addWorksheet('Notes').addRow(['hello']);
  await wb.xlsx.writeFile(p('book.xlsx'));

  // a minimal real DOCX: three XML parts zipped
  const dx = path.join(dir, 'docx-src'); fs.mkdirSync(path.join(dx, '_rels'), { recursive: true }); fs.mkdirSync(path.join(dx, 'word'));
  fs.writeFileSync(path.join(dx, '[Content_Types].xml'), '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  fs.writeFileSync(path.join(dx, '_rels', '.rels'), '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  fs.writeFileSync(path.join(dx, 'word', 'document.xml'), '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Report</w:t></w:r></w:p><w:p><w:r><w:t>Quarterly numbers look good.</w:t></w:r></w:p></w:body></w:document>');
  spawnSync(TAR, ['-a', '-cf', p('report.zip'), '-C', dx, '[Content_Types].xml', '_rels', 'word']);
  fs.renameSync(p('report.zip'), p('report.docx'));
  fs.rmSync(dx, { recursive: true });

  spawnSync(TAR, ['-a', '-cf', p('bundle.7z'), '-C', dir, 'plain.txt', 'notes.md']);
  return { dir, p };
}

module.exports = { makeFixtures };
