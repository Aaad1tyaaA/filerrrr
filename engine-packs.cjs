// Optional engines, installed per pack so people only download what they convert:
//   media  → FFmpeg (video, audio, a few image formats)
//   render → canvas (PDF pages to images, Photoshop files)
//   ocr    → Tesseract core + English model (scanned text)
// A pack is a ZIP whose files are pinned by size and SHA256 in engine-pack-manifest.json, generated with this build.
// Development and older full builds may still carry the engines inside node_modules ("built in").
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const MANIFEST = require('./engine-pack-manifest.json');
let root = process.env.FILERRRR_ENGINE_ROOT || '';
const unpack = file => file.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
const resolve = (fn) => { try { return fn(); } catch { return ''; } };
const bundled = {
  media: resolve(() => unpack(require('ffmpeg-static'))),
  model: resolve(() => path.join(path.dirname(unpack(require.resolve('@tesseract.js-data/eng/package.json'))), '4.0.0_best_int', 'eng.traineddata.gz')),
  core: resolve(() => path.dirname(unpack(require.resolve('tesseract.js-core/package.json')))),
  canvas: resolve(() => path.join(path.dirname(unpack(require.resolve('@napi-rs/canvas-win32-x64-msvc/package.json'))), 'skia.win32-x64-msvc.node')),
};
const names = { media: 'ffmpeg.exe', model: 'eng.traineddata.gz', core: 'tesseract.js-core', canvas: path.join('canvas', 'skia.win32-x64-msvc.node') };
const PACKS = {
  media: { name: 'Video & audio', detail: 'Convert, compress, trim and extract video and audio. Also BMP, TGA and QOI images.', tops: ['ffmpeg.exe'] },
  render: { name: 'PDF pages & Photoshop', detail: 'Turn PDF pages into JPG or PNG and open PSD files.', tops: ['canvas'] },
  ocr: { name: 'Scanned text recognition', detail: 'Read English text from scans and photos of documents.', tops: ['tesseract.js-core', 'eng.traineddata.gz'] },
};
const ALLOWED = /^(ffmpeg\.exe|eng\.traineddata\.gz|canvas\/(skia\.win32-x64-msvc\.node|icudtl\.dat)|tesseract\.js-core\/(package\.json|LICENSE|index\.js|tesseract-core[-a-z]*\.(wasm|js|wasm\.js)))$/;
const exists = file => !!file && fs.existsSync(file);
const pendingFile = () => path.join(root, 'pending-removal.json');

function configure(folder) {
  root = folder; process.env.FILERRRR_ENGINE_ROOT = folder;
  // packs removed while their engine was loaded are deleted on the next start
  try { for (const top of JSON.parse(fs.readFileSync(pendingFile(), 'utf8'))) if (Object.values(PACKS).some(p => p.tops.includes(top))) fs.rmSync(path.join(root, top), { recursive: true, force: true }); fs.rmSync(pendingFile(), { force: true }); } catch { /* nothing pending */ }
  if (!exists(bundled.canvas) && exists(file('canvas'))) process.env.NAPI_RS_NATIVE_LIBRARY_PATH = file('canvas');
}
// An FFmpeg already on this PC (on PATH, e.g. from winget or Chocolatey) is used when Filerrrr has none of its own,
// as long as it has the encoders Filerrrr's presets need. Checked once per process.
let systemFfmpeg;
function findSystemFfmpeg() {
  if (systemFfmpeg !== undefined || process.env.FILERRRR_NO_SYSTEM_ENGINES === '1') return systemFfmpeg || null;
  systemFfmpeg = null;
  for (const dir of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(dir.replace(/^"|"$/g, ''), 'ffmpeg.exe');
    if (!exists(candidate)) continue;
    try {
      const out = require('child_process').spawnSync(candidate, ['-hide_banner', '-encoders'], { encoding: 'utf8', timeout: 5000, windowsHide: true }).stdout || '';
      if (['libx264', 'libmp3lame', 'libopus', 'libvpx-vp9'].every(name => out.includes(name))) { systemFfmpeg = candidate; break; }
    } catch { /* not runnable */ }
  }
  return systemFfmpeg;
}
function file(kind) {
  if (kind === 'media' && !exists(bundled.media) && !exists(path.join(root || '.', names.media)) && findSystemFfmpeg()) return systemFfmpeg; return exists(kind === 'core' ? path.join(bundled[kind] || '', 'tesseract-core-lstm.wasm.js') : bundled[kind]) ? bundled[kind] : path.join(root || '.', names[kind]); }
const ready = { media: () => exists(file('media')), render: () => exists(file('canvas')), ocr: () => exists(file('model')) && exists(path.join(file('core'), 'tesseract-core-lstm.wasm.js')) };
const builtIn = { media: () => exists(bundled.media), render: () => exists(bundled.canvas), ocr: () => exists(bundled.model) && exists(path.join(bundled.core, 'tesseract-core-lstm.wasm.js')) };
function status() {
  return {
    media: ready.media(), canvas: ready.render(), ocr: ready.ocr(), bundled: builtIn.media(), root,
    packs: Object.entries(PACKS).map(([id, pack]) => ({ id, name: pack.name, detail: pack.detail, installed: ready[id](), builtIn: builtIn[id](),
      system: id === 'media' && !builtIn.media() && !exists(path.join(root || '.', names.media)) && findSystemFfmpeg() || '',
      download: (MANIFEST.packs?.[id]?.sources || []).reduce((n, src) => n + src.size, 0) || MANIFEST.packs?.[id]?.size || 0, size: (MANIFEST.packs?.[id]?.files || []).reduce((n, f) => n + f.size, 0) })),
  };
}

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
// Checks every file of a pack against this build's manifest, stages them, then swaps them in.
async function commit(id, read) {
  const expected = MANIFEST.packs?.[id];
  if (!expected || !root) throw new Error('Unknown engine pack');
  await fs.promises.mkdir(root, { recursive: true });
  const stage = await fs.promises.mkdtemp(path.join(root, '.install-'));
  try {
    for (const item of expected.files) {
      if (!ALLOWED.test(item.path)) throw new Error('Engine pack contains an unexpected file');
      const bytes = await read(item.path); if (!bytes) throw new Error('Engine pack is incomplete');
      if (bytes.length !== item.size || sha(bytes) !== item.sha256) throw new Error('Engine checksum failed; nothing was installed');
      const output = path.join(stage, item.path); await fs.promises.mkdir(path.dirname(output), { recursive: true }); await fs.promises.writeFile(output, bytes);
    }
    for (const top of PACKS[id].tops) {
      const target = path.join(root, top);
      await fs.promises.rm(target, { recursive: true, force: true });
      await fs.promises.rename(path.join(stage, top), target);
    }
  } finally { await fs.promises.rm(stage, { recursive: true, force: true }); }
  configure(root); return status();
}

// Installs a Filerrrr pack ZIP copied by hand (for PCs without internet).
async function install(zipFile) {
  if (!root) throw new Error('Engine storage is not configured');
  const JSZip = require('jszip'), zip = await JSZip.loadAsync(await fs.promises.readFile(zipFile));
  const inner = JSON.parse(await zip.file('filerrrr-engine-pack.json')?.async('string') || 'null');
  const expected = MANIFEST.packs?.[inner?.pack];
  if (inner?.version !== 2 || inner.platform !== MANIFEST.platform || !expected) throw new Error('Not a Filerrrr engine pack for this PC');
  if (JSON.stringify(inner.files) !== JSON.stringify(expected.files)) throw new Error('This engine pack does not match this version of Filerrrr');
  return commit(inner.pack, name => zip.file(name)?.async('nodebuffer'));
}

// Reads the regular files of a tar archive (npm packages are plain ustar).
function untar(buffer) {
  const files = new Map(); let offset = 0, longName = null;
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512); if (header.every(b => b === 0)) break;
    const field = (start, length) => header.toString('utf8', start, start + length).replace(/\0.*$/s, '');
    const size = parseInt(field(124, 12).trim() || '0', 8), type = field(156, 1) || '0';
    const name = longName || ((field(345, 155) ? field(345, 155) + '/' : '') + field(0, 100)); longName = null;
    const body = buffer.subarray(offset + 512, offset + 512 + size);
    if (type === 'L') longName = body.toString('utf8').replace(/\0.*$/s, '');
    else if (type === '0' || type === '7') files.set(name, body);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

// Downloads one archive into memory, refusing anything larger than pinned or with another checksum.
async function fetchPinned(source, { fetch, signal, onBytes }) {
  const url = process.env.FILERRRR_ENGINE_BASE_URL ? new URL(path.posix.basename(new URL(source.url).pathname), process.env.FILERRRR_ENGINE_BASE_URL).href : source.url;
  const response = await fetch(url, { signal, redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}). Check your connection and try again.`);
  const chunks = [], hash = crypto.createHash('sha256'); let received = 0;
  for await (const chunk of response.body) {
    received += chunk.length; if (received > source.size) throw new Error('Download is larger than expected; it was discarded');
    hash.update(chunk); chunks.push(Buffer.from(chunk)); onBytes(chunk.length);
  }
  if (received !== source.size || hash.digest('hex') !== source.sha256) throw new Error('Download was damaged or changed; it was discarded');
  return Buffer.concat(chunks);
}

// Downloads a pack from the engines' official sources (pinned by size and SHA256), unpacks the files it needs and installs them.
async function download(id, { fetch = globalThis.fetch, onProgress = () => {}, signal } = {}) {
  const pack = MANIFEST.packs?.[id];
  if (!pack?.sources || !root) throw new Error('Unknown engine pack');
  const zlib = require('zlib'), total = pack.sources.reduce((n, s) => n + s.size, 0), files = new Map(); let done = 0;
  for (const source of pack.sources) {
    const bytes = await fetchPinned(source, { fetch, signal, onBytes: n => { done += n; onProgress(done / total); } });
    const unpacked = zlib.gunzipSync(bytes, { maxOutputLength: 512 * 1048576 });
    if (source.kind === 'gz') files.set(Object.values(source.map)[0], unpacked);
    else { const entries = untar(unpacked); for (const [from, to] of Object.entries(source.map)) if (entries.has(from)) files.set(to, entries.get(from)); }
  }
  return commit(id, name => files.get(name));
}

// Removes a pack. An engine that is loaded right now (the PDF renderer) is deleted on the next start.
async function remove(id) {
  const pack = PACKS[id]; if (!pack || !root) throw new Error('Unknown engine pack');
  if (builtIn[id]()) throw new Error('This engine is built into this copy of Filerrrr');
  const later = [];
  for (const top of pack.tops) { try { await fs.promises.rm(path.join(root, top), { recursive: true, force: true }); } catch { later.push(top); } }
  if (later.length) { let list = []; try { list = JSON.parse(fs.readFileSync(pendingFile(), 'utf8')); } catch { /* none yet */ } fs.writeFileSync(pendingFile(), JSON.stringify([...new Set([...list, ...later])])); }
  return { ...status(), restartNeeded: later.length > 0 };
}
module.exports = { configure, file, status, install, download, remove, untar, PACKS };
