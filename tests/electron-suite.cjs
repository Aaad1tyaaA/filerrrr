// Runs inside Electron (npm run test:electron): PDF printing uses Chromium, which plain Node doesn't have.
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('assert'), fs = require('fs'), path = require('path');

const out = process.env.FILERRRR_TEST_OUT; // Windows doesn't always pipe Electron's stdout, so results also go here
const log = s => { console.log(s); if (out) fs.appendFileSync(out, s + '\n'); };
process.on('uncaughtException', e => { log(`✖ crashed: ${e.stack || e}`); app.exit(1); });
app.on('window-all-closed', () => {}); // the hidden print windows come and go; don't quit with them

app.whenReady().then(async () => {
  const { makeFixtures } = require('./fixtures.cjs');
  const { run } = require('../convert.cjs');
  const { PDFDocument } = require('pdf-lib');
  log('ready'); const fx = await makeFixtures(); log('fixtures made');
  let failed = 0;
  const check = async (name, fn) => {
    try { await fn(); log(`✔ ${name}`); } catch (e) { failed++; log(`✖ ${name}\n  ${e.stack || e}`); }
  };
  const pdf = async file => {
    log('converting ' + file); const [r] = await run([fx.p(file)], 'formats', 'PDF');
    assert.ok(!r.error, `${file}: ${r.error}`);
    assert.equal(fs.readFileSync(r.output).subarray(0, 4).toString(), '%PDF');
    assert.ok((await PDFDocument.load(fs.readFileSync(r.output))).getPageCount() >= 1);
    return r.output;
  };
  await check('DOCX → PDF', () => pdf('report.docx'));
  await check('Markdown → PDF', () => pdf('notes.md'));
  await check('Text → PDF', () => pdf('plain.txt'));
  await check('HTML → PDF (scripts stay off)', () => pdf('page.html'));
  await check('XLSX → PDF', () => pdf('book.xlsx'));
  await check('CSV → PDF', () => pdf('people.csv'));
  await check('EPUB → PDF', async () => {
    const [e] = await run([fx.p('notes.md')], 'formats', 'EPUB');
    require('fs').renameSync(e.output, fx.p('book.epub'));
    await pdf('book.epub');
  });
  await check('E-mail → PDF', async () => {
    fs.writeFileSync(fx.p('mail.eml'), 'From: a@example.com\r\nSubject: Hi\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>Hello <b>there</b></p>\r\n');
    await pdf('mail.eml');
  });
  await check('TSV → PDF', async () => { fs.writeFileSync(fx.p('t.tsv'), 'a\tb\r\n1\t2\r\n'); await pdf('t.tsv'); });
  await check('PDF text survives the round trip', async () => {
    const [t] = await run([await pdf('report.docx')], 'formats', 'TXT');
    assert.match(fs.readFileSync(t.output, 'utf8'), /Quarterly numbers look good/);
  });
  await check('PDF graphics render to JPG and PNG inside Electron', async () => {
    const input = await pdf('report.docx');
    const sharp = require('sharp');
    for (const pick of ['JPG', 'PNG']) {
      const [result] = await run([input], 'formats', pick);
      assert.ok(!result.error, result.error);
      const image = await sharp(result.output).metadata();
      assert.equal(image.format, pick === 'JPG' ? 'jpeg' : 'png');
      assert.ok(image.width > 500);
    }
  });
  for (const mode of ['click', 'drag']) await check(`Escape closes the native overlay in ${mode} mode`, async () => {
    ipcMain.handle('inspect', (_event, paths) => require('../capabilities.cjs').inspect(paths, { 'convert.image': false, 'tool.ROT': false }));
    const win = new BrowserWindow({ show: false, webPreferences: {
      preload: path.resolve(__dirname, '../preload.cjs'), sandbox: true, contextIsolation: true, backgroundThrottling: false,
    } });
    let timeout, listener;
    try {
      await win.loadFile(path.resolve(__dirname, '../renderer/overlay.html'));
      const features = { 'convert.image': false, 'tool.ROT': false, 'input.keyboard': false };
      if (mode === 'click') win.webContents.send('overlay:click', { paths: [fx.p('pic.png')], theme: 'dark', features });
      else win.webContents.send('overlay:drag', { theme: 'dark', features });
      await win.webContents.executeJavaScript('new Promise(resolve => setTimeout(resolve, 100))');
      if (mode === 'drag') await win.webContents.executeJavaScript(`
        const transfer = new DataTransfer();
        transfer.items.add(new File(['image'], 'pic.png', { type: 'image/png' }));
        document.dispatchEvent(new DragEvent('dragenter', { dataTransfer: transfer, bubbles: true }));
      `);
      assert.equal(await win.webContents.executeJavaScript('pal.isOpen'), true);
      assert.equal(await win.webContents.executeJavaScript('pal.disc.targets.length'), 0);
      assert.equal(await win.webContents.executeJavaScript("pal.disc.tools.includes('ROT')"), false);
      const hidden = new Promise((resolve, reject) => {
        listener = event => { if (event.sender === win.webContents) resolve(); };
        ipcMain.on('overlay:hide', listener);
        timeout = setTimeout(() => reject(new Error('The overlay never requested its native window to hide')), 5000);
      });
      if (mode === 'click') await win.webContents.executeJavaScript("dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))");
      else win.webContents.send('overlay:hook', 'key', 'Escape');
      await hidden;
      assert.equal(await win.webContents.executeJavaScript('pal.isOpen'), false);
      assert.equal(await win.webContents.executeJavaScript('mode'), null);
    } finally {
      clearTimeout(timeout);
      if (listener) ipcMain.removeListener('overlay:hide', listener);
      ipcMain.removeHandler('inspect');
      win.destroy();
    }
  });
  await check('feature settings render, persist, filter the palette and restore all features', () => require('./feature-page.cjs')(fx));
  await check('conversion progress, persistent results, folder actions and readable failures', () => require('./progress-page.cjs')(fx));
  await check('presets, watch rules, editors, tutorial and notices render and save through the sandboxed UI',()=>require('./workflow-page.cjs')(fx));
  if(process.platform==='win32')await check('native drop target registers through the Electron window handle',async()=>{
    const win=new BrowserWindow({show:false});const errors=[],drop=require('../native-drop.cjs').create({event:()=>{},log:(...args)=>errors.push(args)});
    try{assert.ok(drop,'native DLL is available');assert.equal(drop.install(win),true);drop.enable(win,true);drop.enable(win,false);drop.remove(win);assert.deepEqual(errors,[]);}finally{win.destroy();}
  });
  fs.rmSync(fx.dir, { recursive: true, force: true });
  log(failed ? `${failed} failed` : 'ok: all Electron checks passed');
  app.exit(failed ? 1 : 0);
});
