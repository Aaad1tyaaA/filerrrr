const { BrowserWindow, ipcMain } = require('electron');
const assert = require('assert/strict'), fs = require('fs'), path = require('path');
const Features = require('../features.js');
const { createStore } = require('../store.cjs');

module.exports = async function featurePage(fx) {
  const file = fx.p('feature-settings.json'), store = createStore(file), errors = [];
  const settings = { paused: false, theme: 'dark', contextMenu: true, openAtLogin: false, platform: 'win32',
    version: '1.0.0', topMenu: { available: false }, menuOffered: true };
  const view = () => ({ ...settings, effectiveTheme: settings.theme === 'light' ? 'light' : 'dark', features: store.data.features,preferences:store.data.preferences,engines:{media:true,ocr:true} });
  ipcMain.handle('settings:get', view);
  ipcMain.handle('history:get', () => ({ converted: 0, saved: 0, items: [] }));
  ipcMain.handle('existing',(_event,files)=>files.map(file=>fs.existsSync(file)));
  ipcMain.handle('thumb',()=>null);
  ipcMain.handle('inspect', (_event, paths) => require('../capabilities.cjs').inspect(paths, store.data.features));
  ipcMain.handle('settings:set', (_event, patch) => {
    if (patch.features) store.set({ features: Features.sanitize(patch.features, store.data.features) });
    if(patch.preferences)store.set({preferences:require('../preferences.cjs').sanitize(patch.preferences,store.data.preferences)});
    if (patch.theme) settings.theme = patch.theme;
    store.flush(); return view();
  });
  const reportError = (_event, message) => errors.push(message);
  ipcMain.on('renderer-error', reportError);
  const win = new BrowserWindow({ show: false, width: 1200, height: 960, webPreferences: {
    preload: path.resolve(__dirname, '../preload.cjs'), sandbox: true, contextIsolation: true, backgroundThrottling: false, offscreen: true,
  } });
  const js = source => win.webContents.executeJavaScript(source);
  const wait = async expression => {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await js(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error(`Timed out waiting for ${expression}. Renderer errors: ${errors.join('\n')}`);
  };
  const toggle = async id => {
    await js(`document.querySelector('[data-feature="${id}"] button').click()`);
    await wait(`settings.features[${JSON.stringify(id)}] === false`);
  };
  const capture = async name => {
    if (!process.env.FILERRRR_FEATURE_SHOTS) return;
    await new Promise(resolve => setTimeout(resolve, 450));
    await js('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    fs.mkdirSync(process.env.FILERRRR_FEATURE_SHOTS, { recursive: true });
    const image = await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
    fs.writeFileSync(path.join(process.env.FILERRRR_FEATURE_SHOTS, name), image.toPNG());
  };
  try {
    await win.loadFile(path.resolve(__dirname, '../renderer/index.html'));
    await wait(`document.querySelectorAll('.feature-item').length === ${Features.all.length} && document.body.dataset.sizeComparison === 'true'`);
    await js("document.getElementById('settingsBtn').click()");
    assert.equal(await js("document.getElementById('catalogue').hidden&&!document.getElementById('everydaySettings').hidden"),true,'everyday settings open first');
    assert.equal(await js("document.getElementById('imageQuality').value"),'balanced');
    assert.equal(await js("document.getElementById('audioBitrate').value"),'192');
    await js("document.getElementById('destination').value='converted';document.getElementById('destination').dispatchEvent(new Event('change'))");
    await wait("settings.preferences.destination==='converted'");
    assert.equal(createStore(file).data.preferences.destination,'converted','output control saves through IPC');
    await js("document.getElementById('trigger').value='alt';document.getElementById('trigger').dispatchEvent(new Event('change'))");
    await wait("settings.preferences.trigger==='alt'");
    assert.equal(await js("document.getElementById('gestureBtn').previousElementSibling.textContent"),'Alt + drag');
    await js("document.getElementById('formatsTab').click()");
    assert.equal(await js("document.getElementById('homePage').hidden && !document.getElementById('drawer').hidden"), true);
    assert.equal(await js("document.querySelectorAll('.feature-item [aria-checked=true]').length"), Features.all.length);
    assert.equal(await js("document.getElementById('sLogin').getAttribute('aria-checked')"), 'false', 'system settings keep their real state');
    await toggle('ocr');
    assert.equal(createStore(file).data.features.ocr,false,'scan recognition preference persists');
    await capture('features-dark.png');
    await toggle('convert.image');
    assert.equal(createStore(file).data.features['convert.image'], false, 'the UI change persisted');
    await toggle('tool.ROT');
    for (const id of ['input.wheel', 'input.typing', 'input.keyboard']) await toggle(id);
    await js(`openPalette([${JSON.stringify(fx.p('pic.png'))}], 400, 350)`);
    assert.equal(await js('pal.disc.targets.length'), 0);
    assert.equal(await js("pal.disc.tools.includes('ROT')"), false);
    const index = await js('pal.disc.idx');
    await js("pal.step(1); pal.key('ArrowRight'); pal.key('Z')");
    assert.equal(await js('pal.disc.idx'), index, 'disabled selection controls do not change the pick');
    assert.equal(await js('pal.disc.query'), '');
    await js("pal.key('Escape')"); await wait('!pal.isOpen');
    const off = Object.fromEntries(Features.all.map(item => [item.id, false]));
    await js(`api.setSettings({features:${JSON.stringify(off)}}).then(showSettings)`);
    await js(`openPalette([${JSON.stringify(fx.p('pic.png'))}], 400, 350)`);
    await js("pal.disc.step(1); pal.key('Enter')");
    assert.equal(await js('pal.disc.idx'), 0);
    assert.equal(await js('pal.busy'), false);
    assert.match(await js("document.querySelector('#pal .pal-route').textContent"), /No enabled options/);
    await js("pal.key('Escape')"); await wait('!pal.isOpen');
    await js("document.getElementById('enableAll').click()");
    await wait('Object.values(settings.features).every(Boolean)');
    assert.deepEqual(createStore(file).data.features, Features.defaults);
    await js("const search = document.getElementById('featureSearch'); search.value = 'Even out volume'; search.dispatchEvent(new Event('input'))");
    assert.equal(await js("document.querySelectorAll('#catalogue .feature-item:not([hidden])').length"), 1);
    await js("document.getElementById('featureSearch').value='Wheel selection';document.getElementById('featureSearch').dispatchEvent(new Event('input'))");
    assert.equal(await js("document.getElementById('featureEmpty').hidden"),false,'catalogue search excludes controls on the Settings page');
    assert.equal(await js("document.querySelector('[data-feature=\"input.wheel\"]').hidden"),false,'catalogue search cannot hide Settings controls');
    await js("document.querySelector('.feature-nav a[href=\"#conversionFeatures\"]').click()");
    assert.equal(await js('scrollY > 100'), true, 'section navigation scrolls to the requested feature group');
    await capture('features-conversions.png');
    await js("document.getElementById('settingsTab').click();document.querySelector('#themeSeg [data-v=light]').click()");
    await wait("document.documentElement.dataset.theme === 'light'");
    await js('scrollTo(0, 0)'); await capture('features-light.png');
    win.setContentSize(780, 900);
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(await js('document.documentElement.scrollWidth <= innerWidth'), true, 'the page fits a narrow window');
    await capture('features-narrow.png');
    await js("document.getElementById('drawerClose').click()");
    assert.equal(await js("document.getElementById('drawer').hidden && !document.getElementById('homePage').hidden"), true);
    await js(`openPalette([${JSON.stringify(fx.p('doc.pdf'))}], 400, 350)`);
    await js(`pal.el.classList.add('committed'); pal.start([${JSON.stringify(fx.p('doc.pdf'))}], {face:'formats',value:'DOCX'});
      pal.finish([{output:${JSON.stringify(fx.p('doc.docx'))}}]); void 0;`);
    await js("document.querySelector('.pal-work-actions [data-action=close]').click()");
    await wait('!pal.isOpen');
    assert.equal(await js("document.querySelector('.pal-work').hidden"), true, 'main-window click interception permits result actions');
    const present=fx.p('pic.png'),gone=fx.p('gone.png');
    await js(`hist={items:[{input:${JSON.stringify(gone)},output:${JSON.stringify(gone)},pick:'PNG',face:'formats'},
      {input:${JSON.stringify(present)},output:${JSON.stringify(present)},pick:'PNG',face:'formats'}]};renderSpot();`);
    await wait(`document.getElementById('pvName').textContent==='pic.png'`);
    assert.equal(await js("document.getElementById('spot').hidden"),false,'spotlight falls back to the newest existing file');
    await js(`hist={items:[{input:${JSON.stringify(gone)},output:${JSON.stringify(gone)},pick:'PNG',face:'formats'}]};renderSpot();`);
    await wait("document.getElementById('spot').hidden");
    assert.equal(await js("document.getElementById('recentHead').hidden"),false,'missing entries remain available to clean up');
    assert.deepEqual(errors, []);
  } finally {
    win.destroy();
    for (const channel of ['settings:get', 'settings:set', 'history:get', 'inspect','existing','thumb']) ipcMain.removeHandler(channel);
    ipcMain.removeListener('renderer-error', reportError);
  }
};
