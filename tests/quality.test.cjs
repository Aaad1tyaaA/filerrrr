// Best quality must not lose detail: lossless sources stay lossless in WEBP, JPG keeps full colour resolution.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), os = require('os'), path = require('path');
const sharp = require('sharp'), image = require('../engines/image.cjs');
sharp.cache(false); // Windows: cached handles would block deleting the temp folder

test('best quality keeps screenshots lossless in WEBP and full colour in JPG', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'filerrrr-quality-')), src = path.join(dir, 'shot.png');
  try {
    await sharp({ create: { width: 64, height: 64, channels: 3, background: '#ffffff' } })
      .composite([{ input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect x="8" y="8" width="20" height="40" fill="#e0301e"/><rect x="36" y="8" width="20" height="40" fill="#2a5bd7"/></svg>') }]).png().toFile(src);
    const webp = path.join(dir, 'best.webp'); await image.convert(src, 'WEBP', webp, { image: 'best' });
    const [a, b] = await Promise.all([src, webp].map(f => sharp(f).removeAlpha().raw().toBuffer()));
    assert.ok(a.equals(b), 'PNG → WEBP on Best must be pixel-identical');
    const jpg = path.join(dir, 'best.jpg'); await image.convert(src, 'JPG', jpg, { image: 'best' });
    assert.strictEqual((await sharp(jpg).metadata()).chromaSubsampling, '4:4:4');
    const balanced = path.join(dir, 'balanced.jpg'); await image.convert(src, 'JPG', balanced, { image: 'balanced' });
    assert.strictEqual((await sharp(balanced).metadata()).chromaSubsampling, '4:2:0');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
