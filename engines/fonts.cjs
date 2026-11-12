// Fonts: TTF / OTF / WOFF / WOFF2 / EOT → each other (and SVG font) with fonteditor-core. OTF outlines become TrueType.
const fsp = require('fs').promises;

const TYPE = { ttf: 'ttf', otf: 'otf', woff: 'woff', woff2: 'woff2', eot: 'eot' };
const OUT = { TTF: 'ttf', WOFF: 'woff', WOF2: 'woff2', EOT: 'eot', SVG: 'svg' };
let ready;

async function convert(input, ext, T, out) {
  const { Font, woff2 } = require('fonteditor-core');
  if (ext === 'woff2' || T === 'WOF2') await (ready ||= woff2.init());
  const read = await fsp.readFile(input);
  // a Buffer that owns its memory: pooled buffers sit at an offset inside a shared one, which the parser doesn't expect
  const buf = Buffer.alloc(read.length); read.copy(buf);
  // kerning stays off: with it, fonteditor-core writes WOFF2 files that it (and browsers) can't read back
  const font = Font.create(buf, { type: TYPE[ext], hinting: true });
  const data = font.write({ type: OUT[T], hinting: true });
  await fsp.writeFile(out, typeof data === 'string' ? data : Buffer.from(data));
}

module.exports = { convert };
