// Turns raw screenshots (taken from the real app with a demo profile) into the website's assets in docs/assets/shots.
// Usage: node scripts/site-shots.cjs <folder with the raw captures>
const sharp = require('sharp'), path = require('path'), fs = require('fs');
sharp.cache(false);
const [raw] = process.argv.slice(2), out = path.join(__dirname, '..', 'docs', 'assets', 'shots');
fs.mkdirSync(out, { recursive: true });
const webp = img => img.webp({ quality: 86, effort: 6 });
// [source, output, crop {left, top, width, height} or null]
const jobs = [
  ['home.png', 'home', null],
  ['engines.png', 'engines', { left: 0, top: 0, width: 1502, height: 820 }],
  ['formats.png', 'formats', null],
  ['picker.png', 'picker', { left: 400, top: 250, width: 702, height: 580 }],
  ['progress-win.png', 'progress', { left: 470, top: 240, width: 560, height: 580 }],
  ['result-win.png', 'result', { left: 470, top: 240, width: 560, height: 650 }],
  ['explorer-palette.png', 'explorer-palette', { left: 18, top: 18, width: 1368, height: 846 }], // trims the desktop showing around the window edge
  ['explorer-done.png', 'explorer-done', { left: 18, top: 18, width: 1368, height: 846 }],
  ['setup-engines.png', 'setup-engines', null],
  ['setup-finish.png', 'setup-finish', null],
];
(async () => {
  for (const [src, name, crop] of jobs) {
    let img = sharp(path.join(raw, src)); if (crop) img = img.extract(crop);
    const info = await webp(img).toFile(path.join(out, `${name}.webp`)); console.log(name, `${info.width}x${info.height}`, `${Math.round(info.size / 1024)} KB`);
  }
  // palette faces keep their transparency
  for (const [src, name] of [['pal-formats.png', 'palette-formats'], ['pal-tools.png', 'palette-tools']]) {
    const { data, info } = await sharp(path.join(raw, src)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 3; i < data.length; i += 4) if (data[i] <= 3) data[i] = 0;
    const trimmed = await sharp(data, { raw: info }).trim({ threshold: 0 }).png().toBuffer();
    const r = await webp(sharp(trimmed)).toFile(path.join(out, `${name}.webp`)); console.log(name, `${r.width}x${r.height}`);
  }
  // right-click menu with the Filerrrr entry outlined
  const menu = path.join(raw, 'rightclick-menu.png'), { width, height } = await sharp(menu).metadata();
  const mark = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect x="246" y="526" width="404" height="38" rx="8" fill="rgba(255,92,56,.16)" stroke="#ff5c38" stroke-width="2.5"/></svg>`);
  const m = await webp(sharp(menu).composite([{ input: mark }])).toFile(path.join(out, 'right-click.webp')); console.log('right-click', `${m.width}x${m.height}`);
  for (const f of ['demo.mp4', 'demo.gif']) fs.copyFileSync(path.join(raw, f), path.join(out, f));
  console.log('demo.mp4, demo.gif');
})();
