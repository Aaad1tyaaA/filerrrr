const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), os = require('os');
const Features = require('../features.js'), Formats = require('../formats.js');
const { createStore, sanitize } = require('../store.cjs');

test('all conversion families and tools have enabled feature definitions', () => {
  assert.deepEqual(Features.families.map(item => item.kind).sort(), Object.keys(Formats.KINDS).sort());
  assert.deepEqual(Features.tools.map(item => item.tool).sort(), Object.keys(Formats.TOOL_NAMES).sort());
  assert.equal(new Set(Features.all.map(item => item.id)).size, Features.all.length);
  for (const item of Features.all) {
    assert.ok(item.name && item.description, item.id);
    assert.equal(Features.defaults[item.id], true);
  }
  assert.deepEqual(sanitize({ theme: 'dark' }).features, Features.defaults, 'existing profiles enable the new features');
});

test('feature flags filter conversions and tools, including mixed selections', () => {
  assert.deepEqual(Features.optionsFor(['png']).targets, Formats.optionsFor(['png']).targets);
  assert.deepEqual(Features.optionsFor(['png'], { 'convert.image': false }).targets, []);
  assert.ok(Features.optionsFor(['png'], { 'convert.image': false }).tools.includes('ROT'));
  assert.deepEqual(Features.optionsFor(['json', 'xml']).targets, ['YAML']);
  assert.ok(!Features.optionsFor(['png', 'pdf'], { 'tool.MRG': false }).tools.includes('MRG'));
  assert.ok(!Features.optionsFor(['png'], { 'tool.ROT': false }).tools.includes('ROT'));
  assert.ok(!Features.optionsFor(['pdf'], { 'tool.ROT': false }).tools.includes('ROT'));
  const off = Object.fromEntries(Features.all.map(item => [item.id, false]));
  for (const ext of Object.values(Formats.KINDS).flat()) {
    assert.deepEqual(Features.optionsFor([ext], off).targets, [], ext);
    assert.deepEqual(Features.optionsFor([ext], off).tools, [], ext);
  }
});

test('feature preferences persist and reject unknown or invalid flags', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'filerrrr-feature-store-'));
  try {
    const file = path.join(dir, 'settings.json'), store = createStore(file);
    const flags = Features.sanitize({ 'convert.image': false, 'tool.ROT': false, thumbnails: 'off', unknown: false });
    store.set({ features: flags }); store.flush();
    const restored = createStore(file).data.features;
    assert.equal(restored['convert.image'], false);
    assert.equal(restored['tool.ROT'], false);
    assert.equal(restored.thumbnails, true);
    assert.ok(!('unknown' in restored));
    assert.equal(Features.sanitize({ history: false }, restored)['tool.ROT'], false);
    store.set({ features: Features.defaults }); store.flush();
    assert.deepEqual(createStore(file).data.features, Features.defaults);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the app IPC saves feature settings and enforces them before conversion or thumbnail work', async () => {
  const vm = require('vm'), { createRequire } = require('module');
  const appRoot = path.resolve(__dirname, '..'), appRequire = createRequire(path.join(appRoot, 'main.cjs'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'filerrrr-feature-ipc-'));
  const store = createStore(path.join(dir, 'settings.json')), handlers = new Map(),events=new Map(),opened=[],recycled=[];
  let conversions = 0,block=false;
  const input = path.join(dir, 'image.png'), output = path.join(dir, 'image.jpg');
  const electron = {
    app: { requestSingleInstanceLock: () => true, on() {}, whenReady: () => new Promise(() => {}),
      getLoginItemSettings: () => ({ openAtLogin: false }), getVersion: () => '1.0.0' },
    ipcMain: { handle: (name, handler) => handlers.set(name, handler), on:(name,handler)=>events.set(name,handler) },
    shell:{openPath:p=>opened.push(p),showItemInFolder:p=>opened.push(p),trashItem:async p=>{recycled.push(p);fs.renameSync(p,`${p}.recycled`);}},
    nativeTheme: { shouldUseDarkColors: true },
    BrowserWindow: { fromWebContents: () => null },
    nativeImage: { createThumbnailFromPath: () => { throw new Error('Disabled thumbnail work ran'); } },
  };
  const load = name => {
    if (name === 'electron') return electron;
    if (name === 'koffi') return { load: () => ({ func: () => () => 0 }) };
    if (name === './conversion-client.cjs') return { killAll() {}, run: async (_paths,_face,_pick,_progress,options) => {
      conversions++;
      if(block)return new Promise(resolve=>options.signal.addEventListener('abort',()=>resolve([{input,error:'Cancelled',cancelled:true}]),{once:true}));
      return [{ input, output, outputs: [output], count: 1, before: 10, after: 5 }];
    } };
    return appRequire(name);
  };
  try {
    const source = fs.readFileSync(path.join(appRoot, 'main.cjs'), 'utf8');
    const context = vm.createContext({ testStore: store, process: { platform: 'win32', env: {}, argv: [], on() {} }, AbortController,setTimeout, clearTimeout, console, Buffer });
    const boot = new vm.Script(`(function(require, __dirname) { ${source}\nstore = testStore; })`).runInContext(context);
    boot(load, appRoot);
    const set = patch => handlers.get('settings:set')({}, patch);
    const scan = await require('./ocr-fixture.cjs')(path.join(dir,'scan.pdf'));
    assert.ok((await handlers.get('inspect')({},[scan])).targets.includes('DOCX'));
    set({features:{ocr:false}});
    assert.ok(!(await handlers.get('inspect')({},[scan])).targets.includes('DOCX'));
    set({features:{ocr:true}});
    const convert = () => handlers.get('convert')({ sender: {} }, [input], 'formats', 'JPG');
    set({ features: { 'convert.image': false } });
    await assert.rejects(convert(), /unavailable/);
    assert.equal(conversions, 0);
    set({ features: { 'convert.image': true, 'tool.ROT': false } });
    await convert(); assert.equal(conversions, 1);
    await assert.rejects(handlers.get('convert')({ sender: {} }, [input], 'tools', 'ROT'), /unavailable/);
    assert.equal(conversions, 1);
    const savedHistory = store.data.history.length;
    set({ features: { history: false, thumbnails: false } });
    await convert();
    assert.equal(store.data.history.length, savedHistory);
    assert.equal(await handlers.get('thumb')({}, output), null);
    assert.equal(handlers.get('settings:get')().features['tool.ROT'], false, 'partial updates preserve other preferences');
    fs.writeFileSync(input,'original');fs.writeFileSync(output,'output');
    handlers.get('history:clear')();
    const [receipt]=await handlers.get('convert')({sender:{id:1}},[input],'formats','JPG');
    assert.equal(store.data.history.length,0,'history-disabled conversion stays private');
    events.get('open')({},output);assert.deepEqual(opened,[output],'new outputs can open even with history off');
    const wrong=await handlers.get('convert:undo')({sender:{id:2}},receipt.undo.token);assert.ok(wrong.error);
    const undone=await handlers.get('convert:undo')({sender:{id:1}},receipt.undo.token);
    assert.deepEqual([...undone.undone],[output]);assert.deepEqual(recycled,[output]);assert.equal(fs.readFileSync(input,'utf8'),'original');

    block=true;const running=handlers.get('convert')({sender:{id:5}},[input],'formats','JPG');
    await assert.rejects(handlers.get('convert')({sender:{id:5}},[input],'formats','JPG'),/already running/);
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.equal(handlers.get('convert:cancel')({sender:{id:6}}),false,'another renderer cannot cancel this job');
    assert.equal(handlers.get('convert:cancel')({sender:{id:5}}),true);assert.equal((await running)[0].cancelled,true);
    assert.equal(handlers.get('convert:cancel')({sender:{id:5}}),false,'finished jobs are removed');block=false;

    const live=path.join(dir,'live.txt'),missing=path.join(dir,'missing.txt');fs.writeFileSync(live,'kept');
    store.set({history:[{input,output:missing,outputs:[missing,live]},{input,output:missing,outputs:'invalid legacy value'}]});
    const pruned=await handlers.get('history:prune')();
    assert.equal(pruned.removed,1);assert.equal(pruned.history.items[0].output,live);assert.ok(fs.existsSync(live),'pruning only edits metadata');
    store.flush();
    assert.equal(createStore(path.join(dir, 'settings.json')).data.features.history, false);
  } finally {
    store.flush();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
