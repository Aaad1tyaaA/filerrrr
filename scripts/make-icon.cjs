// Renders build/icon.png (512 px) and build/icon.ico: Filerrrr's mark, a ring of 12 dots with 4 lit in the accent.
const sharp = require('sharp'), path = require('path'), fs = require('fs');
const S = 512, c = S / 2, dots = [];
for (let i = 0; i < 12; i++) {
  const a = i / 12 * Math.PI * 2 - Math.PI / 2, on = i < 4;
  dots.push(`<circle cx="${(c + Math.cos(a) * 158).toFixed(1)}" cy="${(c + Math.sin(a) * 158).toFixed(1)}" r="${on ? 38 : 28}" fill="${on ? '#ff5c38' : '#ededec'}" opacity="${on ? 1 : .6}"/>`);
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
  <rect width="${S}" height="${S}" rx="116" fill="#141416"/>${dots.join('')}</svg>`;
fs.mkdirSync(path.join(__dirname, '..', 'build'), { recursive: true });
const out = f => path.join(__dirname, '..', 'build', f);
(async () => {
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  fs.writeFileSync(out('icon.png'), png);
  // icon.ico: one 256 px PNG inside an ICO container (used by the right-click menu when unpackaged)
  const p256 = await sharp(png).resize(256, 256).png().toBuffer(), h = Buffer.alloc(22);
  h.writeUInt16LE(1, 2); h.writeUInt16LE(1, 4); h.writeUInt16LE(1, 10); h.writeUInt16LE(32, 12); h.writeUInt32LE(p256.length, 14); h.writeUInt32LE(22, 18);
  fs.writeFileSync(out('icon.ico'), Buffer.concat([h, p256]));
  console.log('build/icon.png, build/icon.ico');
})();
