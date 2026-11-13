// Shared by every engine: running FFmpeg / tar, free output names next to the original, temp folders.
const fs = require('fs'), fsp = fs.promises, path = require('path'), os = require('os');
const { spawn } = require('child_process');
const {currentSignal,check,cancelled} = require('./job.cjs');

const unpacked = p => p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
const FFMPEG = unpacked(require('ffmpeg-static'));
// bsdtar ships with Windows 10 1803+ and macOS: it writes zip and reads zip, rar, 7z and tar.
const TAR = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';

const children = new Set();
function run(cmd, args, { input, onStderr } = {}) {
  const signal = currentSignal(); check(signal);
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true });
    children.add(p);
    const stop = () => p.kill();
    signal?.addEventListener('abort',stop,{once:true});
    if (signal?.aborted) stop();
    const out = []; let tail = '';
    p.stdout.on('data', d => out.push(d));
    p.stderr.on('data', d => { const s = d.toString(); tail = (tail + s).slice(-4000); onStderr && onStderr(s); });
    p.on('error', e => { children.delete(p); signal?.removeEventListener('abort',stop); reject(e); });
    p.on('close', code => {
      children.delete(p);
      signal?.removeEventListener('abort',stop);
      if (signal?.aborted) return reject(cancelled());
      if (code === 0) return resolve(Buffer.concat(out));
      // FFmpeg ends with a generic "Conversion failed!"; the line that names the cause comes earlier
      const lines = tail.trim().split(/\r?\n/).filter(Boolean).map(line => line.replace(/^\[[^\]]+\]\s*/, ''));
      const cause = lines.find(line => /error|invalid|unsupported|not supported|no such|denied/i.test(line) && !/^conversion failed/i.test(line));
      reject(new Error(cause || lines.pop() || `${path.basename(cmd)} failed (${code})`));
    });
    if (input) { p.stdin.on('error', () => {}); p.stdin.end(input); }
  });
}
const killAll = () => { for (const p of children) p.kill(); };

const secs = m => +m[1] * 3600 + +m[2] * 60 + +m[3];
function ffmpeg(args, onProgress, input) {
  let dur = 0;
  const binary=require('../engine-packs.cjs').file('media');
  if(!fs.existsSync(binary))throw new Error('Video & audio is not installed. Install it in Settings → Engines.');
  return run(binary, ['-hide_banner', ...(input ? [] : ['-nostdin']), '-y', ...args], {
    input,
    onStderr: s => {
      const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(s); if (m) dur = secs(m);
      const t = /time=(\d+):(\d+):([\d.]+)/.exec(s); if (t && dur && onProgress) onProgress(Math.min(1, secs(t) / dur));
    },
  });
}
const tar = args => run(TAR, args);

// ---------- output names: never the original, never one another conversion holds ----------
const reserved = new Set(),reservationKeys=new Map();
async function free(p) { try { await fsp.access(p); return false; } catch { return true; } }
async function allocate(input, ext, suffix = '',options={}) {
  check();
  const dir = options.directory||path.dirname(input), base = (typeof options.prefix==='string'?options.prefix.replace(/[<>:"/\\|?*\x00-\x1f]/g,'').slice(0,40):'')+path.basename(input, path.extname(input)).replace(/\.tar$/i, '') + suffix;
  const originals=new Set((options.originals||await Promise.all([input,...(options.inputs||[])].map(file=>fsp.realpath(file).catch(()=>path.resolve(file))))).map(file=>file.toLowerCase()));
  const realDirectory=await fsp.realpath(dir);
  for (let i = 0; ; i++) {
    const p = path.join(dir, (i ? `${base} (${i})` : base) + (ext ? `.${ext}` : '')), key = path.join(realDirectory,path.basename(p)).toLowerCase();
    if (originals.has(key) || reserved.has(key)) continue;
    reserved.add(key); // claim it before the disk check so parallel jobs can't both take it
    if (options.replace||await free(p)){reservationKeys.set(p.toLowerCase(),key);return p;}
    reserved.delete(key);
  }
}
const release = p => {const alias=p.toLowerCase(),key=reservationKeys.get(alias)||alias;reservationKeys.delete(alias);return reserved.delete(key);};

const tmpDir = () => fsp.mkdtemp(path.join(os.tmpdir(), 'filerrrr-'));
const size = async p => { try { const s = await fsp.stat(p); return s.isDirectory() ? 0 : s.size; } catch { return 0; } };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

module.exports = { FFMPEG, TAR, run, ffmpeg, tar, killAll, allocate, release, tmpDir, size, esc, unpacked };
