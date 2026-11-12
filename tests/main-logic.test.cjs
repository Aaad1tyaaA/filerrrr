const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), os = require('os');
const { createGesture } = require('../gesture.cjs');
const cm = require('../contextmenu.cjs');
const { createStore, sanitize, DEFAULTS } = require('../store.cjs');

const P = (x, y) => ({ x, y });

test('gesture: opens past the threshold only with Ctrl, and only while the button is held', () => {
  const g = createGesture({ threshold: 6 });
  assert.equal(g.move(P(10, 10), P(10, 10), true, false), null, 'no press yet');
  g.down(100, 100);
  assert.equal(g.move(P(104, 100), P(104, 100), true, false), null, 'inside the threshold');
  assert.equal(g.move(P(120, 100), P(120, 100), false, false), null, 'no Ctrl, no palette');
  assert.deepEqual(g.move(P(121, 100), P(60, 50), true, false), { type: 'open', center: { x: 60, y: 50 } }, 'late Ctrl opens, at the DIP point');
  assert.equal(g.move(P(130, 100), P(70, 50), true, false), null, 'inside the leash nothing moves');
});

test('gesture: paused never opens', () => {
  const g = createGesture(); g.down(0, 0);
  assert.equal(g.move(P(50, 0), P(50, 0), true, true), null);
});

test('gesture: the leash pulls the centre so the cursor stays within reach', () => {
  const g = createGesture({ leash: 100 }); g.down(0, 0);
  g.move(P(10, 0), P(0, 0), true, false);
  const a = g.move(P(300, 0), P(250, 0), true, false);
  assert.equal(a.type, 'place');
  assert.deepEqual(a.center, { x: 150, y: 0 });
  assert.equal(Math.hypot(250 - a.center.x, 0), 100);
});

test('gesture: letting go of Ctrl steps aside once; release only counts while open', () => {
  const g = createGesture(); g.down(0, 0);
  g.move(P(20, 0), P(20, 0), true, false);
  assert.deepEqual(g.move(P(30, 0), P(30, 0), false, false), { type: 'step-aside' });
  assert.equal(g.move(P(40, 0), P(40, 0), false, false), null);
  assert.equal(g.up(), null, 'stepped aside: the drop is not ours');
  g.closed(); g.down(0, 0); g.move(P(20, 0), P(20, 0), true, false);
  assert.deepEqual(g.up(), { type: 'release' });
  g.closed();
  assert.equal(g.up(), null, 'a click without a palette is nothing');
});

test('gesture: Ctrl pressed again after stepping aside reopens', () => {
  const g = createGesture(); g.down(0, 0);
  g.move(P(20, 0), P(20, 0), true, false);
  g.move(P(30, 0), P(30, 0), false, false);
  g.closed();
  assert.equal(g.move(P(40, 0), P(40, 0), true, false).type, 'open');
});

test('context menu: command line and registry entries', () => {
  assert.equal(cm.command({ exe: 'C:\\A\\Filerrrr.exe' }), '"C:\\A\\Filerrrr.exe" --convert "%1"');
  assert.equal(cm.command({ exe: 'C:\\e.exe', appPath: 'D:\\app' }), '"C:\\e.exe" "D:\\app" --convert "%1"');
  const cmds = cm.regCommands({ exe: 'C:\\A\\Filerrrr.exe' });
  assert.ok(cmds.every(c => c[0] === 'add' && c.includes('/f')));
  assert.ok(cmds.some(c => c.includes('MultiSelectModel') && c.includes('Player')));
  assert.equal(cmds.at(-1)[1], `${cm.KEY}\\command`);
  assert.match(cm.KEY, /^HKCU\\Software\\Classes\\\*\\shell\\/);
});

test('context menu: files from the command line', () => {
  assert.deepEqual(cm.pathsFromArgv(['electron.exe', 'D:\\app', '--convert', 'C:\\a.png', 'C:\\b c.jpg']), ['C:\\a.png', 'C:\\b c.jpg']);
  assert.deepEqual(cm.pathsFromArgv(['Filerrrr.exe', '--hidden']), []);
  assert.deepEqual(cm.pathsFromArgv(['x', '--convert', '--allow-file-access', 'C:\\a.png']), ['C:\\a.png']);
});

test('store: damaged or hostile files fall back to safe values', () => {
  assert.deepEqual(sanitize(null), DEFAULTS);
  const s = sanitize({ paused: 'yes', theme: 'neon', converted: -4, history: [{ output: 1 }, { output: 'a', input: 'b' }, 'x'] });
  assert.equal(s.paused, false); assert.equal(s.theme, 'system'); assert.equal(s.converted, 0);
  assert.equal(s.history.length, 1);
});

test('store: writes are atomic and survive a reload', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'filerrrr-store-')), file = path.join(dir, 's.json');
  fs.writeFileSync(file, '{ not json');
  const a = createStore(file);
  assert.equal(a.data.theme, 'system', 'broken file → defaults');
  a.set({ theme: 'dark', paused: true }); a.flush();
  assert.ok(!fs.existsSync(file + '.tmp'));
  const b = createStore(file);
  assert.equal(b.data.theme, 'dark'); assert.equal(b.data.paused, true);
  fs.rmSync(dir, { recursive: true });
});

test('Windows 11 menu: elevated registration script', () => {
  const tm = require('../topmenu.cjs');
  assert.equal(tm.supported('10.0.19045'), false, 'Windows 10 has no top-level menu');
  if (process.platform === 'win32') assert.equal(tm.supported('10.0.22631'), true);
  const s = tm.registerScript("C:\\Users\\O'Neil\\Filerrrr");
  assert.match(s, /-Verb RunAs/);
  const inner = Buffer.from(/'-EncodedCommand','([^']+)'/.exec(s)[1], 'base64').toString('utf16le');
  assert.ok(inner.includes("Add-AppxPackage -Path 'C:\\Users\\O''Neil\\Filerrrr\\Filerrrr.ExplorerMenu.msix' -ExternalLocation 'C:\\Users\\O''Neil\\Filerrrr' -AllowUnsigned -ErrorAction Stop"), inner);
  assert.equal(tm.available('C:\nowhere'), false);
});

test('Windows 11 menu: checks activation and repairs a broken existing registration without elevation', async () => {
  const vm = require('vm');
  const source = fs.readFileSync(path.join(__dirname, '..', 'topmenu.cjs'), 'utf8');
  const load = outputs => {
    const calls = [], module = { exports: {} };
    const context = vm.createContext({ module, process: { platform: 'win32' }, Buffer,
      require: name => name === 'child_process' ? { execFile: (_exe, args, _opts, callback) => {
        calls.push(args.at(-1)); callback(null, outputs.shift() || '');
      } } : name === 'fs' ? { existsSync: () => true } : name === 'os' ? { release: () => '10.0.26100' } : require(name) });
    new vm.Script(source).runInContext(context);
    return { menu: module.exports, calls };
  };
  // calls: 1 activation check · 2 is the package there · 3 re-register · 4 activation check again
  const healthy = load(['Ok']);
  assert.deepEqual({ ...await healthy.menu.repair('C:\\Apps\\Filerrrr') }, { ok: true, present: true, repaired: false, detail: '' });
  assert.equal(healthy.calls.length, 1, 'a functioning handler needs no re-registration');
  assert.match(healthy.calls[0], /Activator.*GetTypeFromCLSID/);

  const broken = load(['', 'Ok', '', 'Ok']);
  assert.deepEqual({ ...await broken.menu.repair("C:\\O'Neil\\Filerrrr") }, { ok: true, present: true, repaired: true, detail: '' });
  assert.equal(broken.calls.length, 4, 'verify activation again after repair');
  assert.match(broken.calls[2], /Get-AppxPackage -Name Filerrrr.ExplorerMenu.*ForEach-Object.*Add-AppxPackage -Register/);
  assert.ok(broken.calls[2].includes("-ExternalLocation 'C:\\O''Neil\\Filerrrr' -ErrorAction Stop"));
  assert.doesNotMatch(broken.calls[2], /RunAs|AllowUnsigned|Remove-AppxPackage/);

  const absent = load(['', '']);
  const a = await absent.menu.repair('C:\\Apps\\Filerrrr');
  assert.equal(a.ok, false); assert.equal(a.present, false, 'never added (or removed on purpose): nothing to repair');
  assert.equal(absent.calls.length, 2);
  assert.ok(absent.calls.every(c => !/Add-AppxPackage/.test(c)), 'never installs an unrequested package');

  const stuck = load(['', 'Ok', '', '']);
  const s = await stuck.menu.repair('C:\\Apps\\Filerrrr');
  assert.equal(s.ok, false); assert.equal(s.present, true);
  assert.ok(s.detail.length > 0, 'a failed repair says why');
});
