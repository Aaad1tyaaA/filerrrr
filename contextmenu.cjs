// "Convert with Filerrrr" in File Explorer's right-click menu (per user, no admin rights needed).
// On Windows 11 it sits under "Show more options"; the top-level menu needs a packaged COM extension.
const { execFile } = require('child_process');

const KEY = 'HKCU\\Software\\Classes\\*\\shell\\Filerrrr';
const LABEL = 'Convert with Filerrrr';

// exe: the program; appPath: the app folder when running unpackaged (electron.exe <app>)
const command = ({ exe, appPath }) => `"${exe}"${appPath ? ` "${appPath}"` : ''} --convert "%1"`;

function regCommands(opts) {
  return [
    ['add', KEY, '/ve', '/d', LABEL, '/f'],
    ['add', KEY, '/v', 'Icon', '/d', opts.icon || opts.exe, '/f'],
    ['add', KEY, '/v', 'MultiSelectModel', '/d', 'Player', '/f'],
    ['add', `${KEY}\\command`, '/ve', '/d', command(opts), '/f'],
  ];
}

const reg = args => new Promise((res, rej) => execFile('reg.exe', args, { windowsHide: true }, (e, out) => e ? rej(e) : res(out)));

async function register(opts) { for (const args of regCommands(opts)) await reg(args); }
async function unregister() { try { await reg(['delete', KEY, '/f']); } catch { /* wasn't there */ } }
async function current() {
  try { return /REG_SZ\s+(.*)\r?\n/.exec(await reg(['query', `${KEY}\\command`, '/ve']))?.[1].trim() || null; } catch { return null; }
}
// Registers (again) when missing or pointing at another install.
async function sync(opts, enabled) {
  if (!enabled) return unregister();
  if ((await current()) !== command(opts)) await register(opts);
}

// Arguments after --convert, as Explorer / Send To pass them.
function pathsFromArgv(argv) {
  const i = argv.indexOf('--convert');
  return i < 0 ? [] : argv.slice(i + 1).filter(a => a && !a.startsWith('--'));
}

module.exports = { KEY, LABEL, command, regCommands, register, unregister, current, sync, pathsFromArgv };
