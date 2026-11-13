// Prepares website images in docs/assets from transparent screenshots of the palette (see README for how they were taken)
// and from the app icon. Usage: node scripts/site-images.cjs <folder with site-palette.png and site-result.png>
const sharp = require('sharp'), path = require('path');
const [shots] = process.argv.slice(2), out = path.join(__dirname, '..', 'docs', 'assets');
(async () => {
  for (const [src, name] of [['site-palette.png', 'palette.png'], ['site-result.png', 'result.png']]) {
    const { data, info } = await sharp(path.join(shots, src)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (let i = 3; i < data.length; i += 4) if (data[i] <= 3) data[i] = 0; // the overlay's 0.4% drop-catching layer becomes fully transparent
    const trimmed = await sharp(data, { raw: info }).trim({ threshold: 0 }).png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
    await sharp(trimmed.data).toFile(path.join(out, name)); console.log(name, `${trimmed.info.width}x${trimmed.info.height}`);
  }
  const icon = path.join(__dirname, '..', 'build', 'icon.png');
  await sharp(icon).resize(192).png().toFile(path.join(out, 'icon.png'));
  await sharp(icon).resize(32).png().toFile(path.join(out, 'favicon.png'));
  console.log('icon.png, favicon.png');
})();
