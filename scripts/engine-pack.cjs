// Builds one ZIP per optional engine and pins every file (and each ZIP) by size + SHA256 in engine-pack-manifest.json.
// Upload the ZIPs to the release named in MANIFEST.base; the app downloads them from there when a user asks.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), JSZip = require('jszip');
const FIXED = { date: new Date(Date.UTC(2026, 0, 1)), createFolders: false }; // fixed timestamps: the same engines always give the same ZIP and checksum
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
// Official places each engine is published. The app downloads from here; every file inside must match what Filerrrr is tested with.
const versions = { ffmpeg: require('ffmpeg-static/package.json')['ffmpeg-static']['binary-release-tag'], canvas: require('@napi-rs/canvas-win32-x64-msvc/package.json').version,
  core: require('tesseract.js-core/package.json').version, eng: require('@tesseract.js-data/eng/package.json').version };
const OFFICIAL = {
  media: [{ url: `https://github.com/eugeneware/ffmpeg-static/releases/download/${versions.ffmpeg}/ffmpeg-win32-x64.gz`, kind: 'gz', map: () => ({ 'ffmpeg-win32-x64': 'ffmpeg.exe' }) }],
  render: [{ url: `https://registry.npmjs.org/@napi-rs/canvas-win32-x64-msvc/-/canvas-win32-x64-msvc-${versions.canvas}.tgz`, kind: 'tgz',
    map: () => ({ 'package/skia.win32-x64-msvc.node': 'canvas/skia.win32-x64-msvc.node', 'package/icudtl.dat': 'canvas/icudtl.dat' }) }],
  ocr: [{ url: `https://registry.npmjs.org/tesseract.js-core/-/tesseract.js-core-${versions.core}.tgz`, kind: 'tgz',
    map: files => Object.fromEntries(files.filter(f => f.path.startsWith('tesseract.js-core/')).map(f => [`package/${f.path.slice('tesseract.js-core/'.length)}`, f.path])) },
    { url: `https://registry.npmjs.org/@tesseract.js-data/eng/-/eng-${versions.eng}.tgz`, kind: 'tgz', map: () => ({ 'package/4.0.0_best_int/eng.traineddata.gz': 'eng.traineddata.gz' }) }],
};
async function pinSources(id, files) {
  const cache = path.join(path.resolve(__dirname, '..'), 'release', 'engines', 'official'), { untar } = require('../engine-packs.cjs'), zlib = require('zlib');
  fs.mkdirSync(cache, { recursive: true });
  const pinned = [], found = new Map();
  for (const source of OFFICIAL[id]) {
    const file = path.join(cache, path.basename(new URL(source.url).pathname));
    if (!fs.existsSync(file)) { const r = await fetch(source.url); if (!r.ok) throw new Error(`${source.url}: ${r.status}`); fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); }
    const bytes = fs.readFileSync(file), map = source.map(files), unpacked = zlib.gunzipSync(bytes);
    if (source.kind === 'gz') found.set(Object.values(map)[0], unpacked);
    else { const entries = untar(unpacked); for (const [from, to] of Object.entries(map)) if (entries.has(from)) found.set(to, entries.get(from)); }
    pinned.push({ url: source.url, kind: source.kind, size: bytes.length, sha256: sha(bytes), map });
  }
  for (const f of files) { const b = found.get(f.path); if (!b || sha(b) !== f.sha256) throw new Error(`${id}: ${f.path} from the official download differs from the tested copy`); }
  return pinned;
}
(async () => {
  const app = path.resolve(__dirname, '..'), out = path.join(app, 'release', 'engines');
  const canvas = path.dirname(require.resolve('@napi-rs/canvas-win32-x64-msvc/package.json'));
  const core = path.dirname(require.resolve('tesseract.js-core/package.json'));
  const sources = {
    media: [[require('ffmpeg-static'), 'ffmpeg.exe']],
    render: [[path.join(canvas, 'skia.win32-x64-msvc.node'), 'canvas/skia.win32-x64-msvc.node'], [path.join(canvas, 'icudtl.dat'), 'canvas/icudtl.dat']],
    ocr: [[require.resolve('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'), 'eng.traineddata.gz'],
      ...fs.readdirSync(core).sort().filter(f => /^(package\.json|LICENSE|index\.js|tesseract-core[-a-z]*\.(js|wasm|wasm\.js))$/.test(f)).map(f => [path.join(core, f), `tesseract.js-core/${f}`])],
  };
  const notices = {
    media: 'FFmpeg, built by ffmpeg-static. Licence: GPL-3.0-or-later (see https://ffmpeg.org/legal.html).',
    render: '@napi-rs/canvas (MIT) with Skia (BSD-3-Clause) and ICU data (Unicode licence).',
    ocr: 'Tesseract.js core (Apache-2.0) and the English trained model (Apache-2.0).',
  };
  fs.mkdirSync(out, { recursive: true });
  const manifest = { version: 2, platform: 'win32-x64', packs: {} };
  for (const [id, list] of Object.entries(sources)) {
    const zip = new JSZip(), files = [];
    for (const [source, name] of list) { const bytes = fs.readFileSync(source); files.push({ path: name, size: bytes.length, sha256: sha(bytes) }); zip.file(name, bytes, FIXED); }
    zip.file('filerrrr-engine-pack.json', JSON.stringify({ version: 2, platform: manifest.platform, pack: id, files }), FIXED);
    zip.file('NOTICE.txt', `Filerrrr optional engine "${id}": ${notices[id]}`, FIXED);
    const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
    const name = `Filerrrr-Engine-${id}-win-x64.zip`; fs.writeFileSync(path.join(out, name), bytes);
    manifest.packs[id] = { zip: name, size: bytes.length, sha256: sha(bytes), files, sources: await pinSources(id, files) };
    console.log(`${name}: ${(bytes.length / 1048576).toFixed(1)} MB, ${files.length} files`);
  }
  fs.writeFileSync(path.join(app, 'engine-pack-manifest.json'), JSON.stringify(manifest, null, 2));
  // download sizes for the installer's engine page (build/installer.nsh)
  const mbOf = id => Math.max(1, Math.round(manifest.packs[id].sources.reduce((n, src) => n + src.size, 0) / 1048576));
  const EOL = String.fromCharCode(13, 10); // NSIS include files use Windows line endings
  fs.writeFileSync(path.join(app, 'build', 'engine-sizes.nsh'), Object.keys(manifest.packs).map(id => `!define ENGINE_${id.toUpperCase()}_MB "${mbOf(id)}"`).join(EOL) + EOL);
})().catch(error => { console.error(error); process.exitCode = 1; });
