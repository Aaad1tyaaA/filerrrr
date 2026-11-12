const { BrowserWindow } = require('electron');
const assert = require('node:assert/strict'), fs = require('fs'), path = require('path');

module.exports = async fx => {
  const win = new BrowserWindow({ show: false, width: 540, height: 600, useContentSize: true,
    webPreferences: { offscreen: true, backgroundThrottling: false } });
  const js = source => win.webContents.executeJavaScript(source);
  const capture = async name => {
    if (!process.env.FILERRRR_PROGRESS_QA) return;
    await js('new Promise(resolve=>setTimeout(resolve,400))');
    fs.mkdirSync(process.env.FILERRRR_PROGRESS_QA, { recursive: true });
    fs.writeFileSync(path.join(process.env.FILERRRR_PROGRESS_QA, name), (await win.webContents.capturePage()).toPNG());
  };
  try {
    // The shared palette needs only its format catalog, disc and CSS, without app IPC.
    await win.loadFile(path.resolve(__dirname, '../renderer/overlay.html'));
    await js(`globalThis.opened = []; globalThis.revealed = [];
      globalThis.progressPal = new Palette(document.getElementById('pal'), {
        onCommit: pick => globalThis.picked = pick,
        onOpen: p => opened.push(p), onReveal: p => revealed.push(p)
      });
      progressPal.open({ label: 'PDF', targets: ['DOCX'], tools: [] });
      progressPal.commit();
      progressPal.start([${JSON.stringify(fx.p('doc.pdf'))}], { face: 'formats', value: 'DOCX' });`);
    assert.equal(await js("document.querySelector('.pal-meter').hasAttribute('aria-valuenow')"), false);
    assert.equal(await js("document.querySelector('.pal-meter').classList.contains('indeterminate')"), true);
    await js(`progressPal.progress({ fraction: .425, stageFraction: .5, stage: 'Reading PDF', page: 1, pages: 2,
      input: ${JSON.stringify(fx.p('doc.pdf'))}, total: 1, completed: 0 });`);
    assert.equal(await js("document.querySelector('.pal-meter').getAttribute('aria-valuenow')"), '43');
    assert.equal(await js("document.querySelector('.pal-meter').hasAttribute('hidden')"), false);
    assert.equal(await js("document.querySelector('.pal-work').getBoundingClientRect().width <= 280"), true, 'status display stays as narrow as the disc');
    assert.equal(await js("document.querySelector('.pal-work-bar')"), null, 'progress lives around the disc');
    assert.equal(await js("document.querySelector('.pal-work-stage').textContent"), 'Reading PDF · page 1 of 2');
    await js('new Promise(resolve => setTimeout(resolve, 350))');
    await capture('progress.png');
    await js(`progressPal.progress({ fraction: .85, stage: 'Writing DOCX', indeterminate: true });`);
    assert.equal(await js("document.querySelector('.pal-work-percent').textContent"), 'Working…');
    await js(`globalThis.resultClosed = false;
      progressPal.finish([{ output: ${JSON.stringify(fx.p('doc.docx'))}, outputs: [${JSON.stringify(fx.p('doc.docx'))}] }]).then(() => resultClosed = true); void 0;`);
    await js('new Promise(resolve => setTimeout(resolve, 1200))');
    assert.equal(await js('progressPal.isOpen && !resultClosed'), true, 'success remains until dismissed');
    assert.equal(await js("document.querySelector('.pal-work-title').textContent"), 'Conversion complete');
    assert.equal(await js("document.querySelector('.pal-work').getBoundingClientRect().bottom <= innerHeight"), true, 'results fit the native overlay');
    await capture('success.png');
    await js("document.querySelector('[data-action=folder]').click()");
    await js('new Promise(resolve => setTimeout(resolve, 500))');
    assert.deepEqual(await js('revealed'), [fx.p('doc.docx')]);
    assert.equal(await js('resultClosed && !progressPal.isOpen'), true);

    await js(`progressPal.open({ label: 'PDF', targets: ['DOCX'], tools: [] }); progressPal.commit();
      progressPal.finish([{error:'Cannot read <img src=x onerror=alert(1)>'}]); void 0;`);
    assert.equal(await js("document.querySelector('.pal-work-title').textContent"), 'Conversion failed');
    assert.equal(await js("document.querySelector('[data-action=open]').hidden"), true);
    assert.equal(await js("document.querySelector('.pal-route img')"), null, 'errors render as text');
    await js('new Promise(resolve => setTimeout(resolve, 350))');
    await capture('failure.png');
    await js("progressPal.key('Escape')");
    await js('new Promise(resolve => setTimeout(resolve, 500))');
    assert.equal(await js('progressPal.isOpen'), false);

    await js(`progressPal.open({ label:'PDF', targets:['JPG','PNG'], tools:['ZIP'], choices:[
      {value:'DOCX',reason:'No selectable text. OCR required'}, {value:'JPG',reason:''}, {value:'PNG',reason:''},
      {value:'PDF',reason:'Already this format'}], note:'Scanned PDF: JPG / PNG available.' });`);
    await js('new Promise(resolve => setTimeout(resolve, 350))');
    assert.equal(await js("document.querySelectorAll('.chip:disabled').length"), 2);
    assert.match(await js("document.querySelector('.chip:disabled').getAttribute('aria-label')"), /OCR required/);
    await js("progressPal.key('ArrowRight'); progressPal.key('D')");
    assert.equal(await js("progressPal.disc.value()"), 'PNG', 'keyboard only selects enabled routes');
    assert.equal(await js("document.querySelector('.pal-export-options').hidden"), false);
    await js("document.querySelector('.pal-dpi').value = '300'");
    await js('new Promise(resolve => setTimeout(resolve, 350))');
    await capture('scanned-options.png');
    await js("progressPal.aim(0,-168); progressPal.commit()");
    assert.equal(await js('progressPal.busy'), false, 'aiming at a disabled route cannot commit a different route');
    await js("progressPal.key('ArrowLeft'); progressPal.key('Enter')");
    assert.deepEqual(await js('picked.options'), {dpi:300,quality:90});

    await js(`globalThis.aborts=0;progressPal.onAbort=()=>{aborts++};progressPal.key('Escape');progressPal.key('Escape');`);
    assert.equal(await js('aborts'),1,'Escape cancels only once while the job cleans up');
    assert.equal(await js("document.querySelector('[data-action=cancel]').disabled"),true);
    assert.match(await js("document.querySelector('.pal-work-stage').textContent"),/Stopping/);
    await capture('cancelling.png');
    await js(`progressPal.finish([{input:'source.pdf',cancelled:true,error:'Cancelled'}]);void 0;`);
    assert.equal(await js("document.querySelector('.pal-work-title').textContent"),'Conversion cancelled');
    assert.equal(await js("document.querySelector('[data-action=cancel]').hidden"),true);
    await capture('cancelled.png');

    await js(`globalThis.oldSettled=false;progressPal.finishResolve=()=>oldSettled=true;
      progressPal.open({label:'PDF',targets:['DOCX'],tools:[]});progressPal.commit();
      progressPal.onUndo=async token=>({undone:['new.docx'],skipped:[]});
      progressPal.finish([{output:'new.docx',undo:{token:'receipt',expiresAt:Date.now()+10000}}]);void 0;`);
    assert.equal(await js('oldSettled'),true,'opening a new palette settles the previous result');
    assert.equal(await js("document.querySelector('[data-action=undo]').hidden"),false);
    assert.equal(await js("progressPal.work.getBoundingClientRect().bottom<=innerHeight"),true,'Undo actions fit beneath the disc');
    assert.equal(await js("progressPal.work.scrollWidth<=progressPal.work.clientWidth"),true,'result actions fit the card');
    await capture('undo-ready.png');
    await js("document.querySelector('[data-action=undo]').click();new Promise(resolve=>setTimeout(resolve,30))");
    assert.equal(await js("document.querySelector('.pal-work-title').textContent"),'Conversion undone');
    assert.equal(await js("document.querySelector('[data-action=open]').hidden"),true);

    await js(`globalThis.closingSettled=false;progressPal.finishResolve=()=>closingSettled=true;progressPal.close();
      progressPal.open({label:'PNG',targets:['JPG'],tools:[]});new Promise(resolve=>setTimeout(resolve,450));`);
    assert.equal(await js('progressPal.work.hidden'),true);
    assert.equal(await js('closingSettled&&progressPal.isOpen'),true,'a replacement during close is kept open');

    await js(`progressPal.commit();progressPal.finish([{output:'expires.docx',undo:{token:'short',expiresAt:Date.now()+50}}]);
      new Promise(resolve=>setTimeout(resolve,100));`);
    assert.equal(await js("document.querySelector('[data-action=undo]').hidden"),true,'Undo expires independently of result dismissal');
    await js(`progressPal.open({label:'PNG',targets:['WEBP','JPG','AVIF','PDF','SVG','GIF','TIFF','BMP','ICO','TGA','QOI'],tools:[],
      favourites:['WEBP','JPG','AVIF','PDF','SVG','GIF','TIFF'],lastUsed:'JPG'});`);
    assert.equal(await js("document.querySelectorAll('.chip').length"),8,'compact ring contains seven formats and More');
    assert.equal(await js("document.querySelector('.chip.last-used').textContent"),'JPG');
    await capture('favourites.png');
    await js("document.querySelector('[data-more=more]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));new Promise(resolve=>setTimeout(resolve,250))");
    assert.equal(await js("document.querySelectorAll('.chip').length"),12,'More reveals every allowed format');
    await js(`progressPal.commit();progressPal.finish([
      {input:'first.png',output:'first.jpg',outputs:['first.jpg'],undo:{token:'batch',expiresAt:Date.now()+10000}},
      {input:'bad.png',error:'Damaged image. Please choose another file.'}]);void 0;`);
    await js('new Promise(resolve=>setTimeout(resolve,450))');
    assert.equal(await js('progressPal.work.getBoundingClientRect().bottom<=innerHeight'),true,'batch actions fit the window');
    await js("document.querySelector('[data-action=details]').click()");
    assert.equal(await js("document.querySelectorAll('.pal-batch-row').length"),2);
    assert.match(await js("document.querySelectorAll('.pal-batch-row')[1].textContent"),/Damaged image/);
    await capture('batch-results.png');
    await js("globalThis.retried=null;progressPal.onRetry=(files,pick)=>retried={files,pick};document.querySelector('[data-action=retry]').click()");
    assert.deepEqual(await js('retried.files'),['bad.png'],'retry excludes completed inputs');
  } finally { win.destroy(); }
};
