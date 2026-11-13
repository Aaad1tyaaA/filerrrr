// Renders build/icon.png (512 px) and build/icon.ico: Filerrrr's mark, a dot-matrix F (4 x 5 grid) with one accent dot.
const sharp = require('sharp'), path = require('path'), fs = require('fs');
const S = 512, GAP = 80, R = 27, X0 = S / 2 - 1.5 * GAP, Y0 = S / 2 - 2 * GAP;
const F = ['####', '#...', '###*', '#...', '#...']; // # lit, * accent, . unlit
const dots = F.flatMap((row, y) => [...row].map((cell, x) => `<circle cx="${X0 + x * GAP}" cy="${Y0 + y * GAP}" r="${R}" fill="${cell === '*' ? '#ff5c38' : '#ededec'}" opacity="${cell === '.' ? .13 : 1}"/>`));
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
