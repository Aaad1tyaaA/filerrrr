const test = require('node:test'), assert = require('node:assert/strict');
const F = require('../formats.js');

test('kinds and aliases', () => {
  assert.equal(F.kindOfExt('JPEG'), 'image');
  assert.equal(F.kindOfExt('mov'), 'video');
  assert.equal(F.kindOfExt('docx'), 'doc');
  assert.equal(F.kindOfExt('yml'), 'data');
  assert.equal(F.kindOfExt('exe'), 'other');
  assert.equal(F.extOf('C:\\a.b\\Photo.HEIC'), 'heic');
  assert.equal(F.extOf('C:\\folder\\noext'), '');
});

test('targets put the likely wish first and never the same format', () => {
  assert.equal(F.targetsFor('image', 'heic')[0], 'JPG');
  assert.equal(F.targetsFor('image', 'png')[0], 'WEBP');
  assert.ok(!F.targetsFor('image', 'png').includes('PNG'));
  assert.ok(!F.targetsFor('image', 'jpeg').includes('JPG'), 'aliases count as the same format');
  assert.deepEqual(F.targetsFor('image', 'gif').slice(0, 1), ['MP4']);
  assert.deepEqual(F.targetsFor('doc', 'docx'), ['PDF', 'HTML', 'MD', 'TXT', 'EPUB']);
  assert.deepEqual(F.targetsFor('archive', 'zip'), ['7Z', 'TAR', 'TGZ']);
  assert.deepEqual(F.targetsFor('archive', 'rar'), ['ZIP', '7Z', 'TAR', 'TGZ']);
  assert.deepEqual(F.targetsFor('archive', 'tgz'), ['ZIP', '7Z', 'TAR'], 'tar.gz is not offered as itself');
  assert.equal(F.extOf('C:\a\b.tar.gz'), 'tgz');
  assert.equal(F.extFor('WOF2'), 'woff2'); assert.equal(F.nameFor('GEO'), 'GeoJSON');
  assert.deepEqual(F.targetsFor('other', 'exe'), []);
});

test('tools follow the selection', () => {
  assert.ok(F.toolsFor(['image']).includes('ROT'));
  assert.deepEqual(F.toolsFor(['image', 'pdf']), ['MRG', 'ZIP']);
  assert.deepEqual(F.toolsFor(['image', 'video']), ['ZIP']);
  assert.deepEqual(F.toolsFor(['archive']), ['XTR']);
  assert.deepEqual(F.toolsFor(['other']), ['ZIP']);
  for (const t of Object.values(F.TOOLS).flat()) assert.ok(F.TOOL_NAMES[t], `${t} has a name`);
  for (const t of Object.values(F.TOOLS).flat()) assert.ok(t.length <= 4, `${t} fits the disc`);
});

test('options for a mixed or unknown selection fall back to tools', () => {
  assert.deepEqual(F.optionsFor(['png', 'mp4']).targets, []);
  assert.equal(F.optionsFor(['png', 'jpg']).kind, 'image');
  assert.equal(F.optionsFor(['exe']).tools[0], 'ZIP');
  assert.equal(F.extOfMime('image/heic'), 'heic');
  assert.equal(F.extOfMime(''), '');
});

test('every target label fits the dot matrix', () => {
  for (const list of Object.values(F.TARGETS)) for (const t of list) assert.ok(t.length <= 4, t);
});

test('a selection only offers targets supported by every file', () => {
  assert.deepEqual(F.optionsFor(['json', 'xml']).targets, ['YAML']);
  assert.deepEqual(F.optionsFor(['xml', 'json']).targets, ['YAML']);
  assert.deepEqual(F.optionsFor(['png', 'jpg']).targets, ['WEBP', 'AVIF', 'PDF', 'SVG', 'GIF', 'TIFF', 'BMP', 'ICO', 'TGA', 'QOI','HEIC','JXL']);
  assert.ok(!F.optionsFor(['gif', 'png']).targets.includes('MP4'));
  assert.deepEqual(F.optionsFor(['md', 'markdown']).targets, F.optionsFor(['md']).targets);
  assert.deepEqual(F.optionsFor([]).targets, []);
});
