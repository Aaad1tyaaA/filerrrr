// Full main + sandboxed preload smoke test, confined to a separate profile with OS integrations disabled.
const {app,BrowserWindow,nativeImage}=require('electron');
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict');
const work=fs.mkdtempSync(path.join(os.tmpdir(),'filerrrr-app-control-'));
process.env.FILERRRR_TEST_DATA_DIR=path.join(work,'profile');process.env.FILERRRR_TEST_NO_HOOK='1';process.env.FILERRRR_TEST_WINDOW='1';process.argv.push('--hidden');
const childProcess=require('child_process'),originalSpawn=childProcess.spawn;let workerStarts=0;
childProcess.spawn=function(...args){if(args[1]?.some(arg=>String(arg).includes('conversion-worker.cjs')||arg==='--engine-worker'))workerStarts++;return originalSpawn.apply(this,args);};
require(process.env.FILERRRR_SMOKE_ARCHIVE?path.join(process.env.FILERRRR_SMOKE_ARCHIVE,'main.cjs'):'../main.cjs');
app.whenReady().then(async()=>{
  let failed=false;
  const timeout=setTimeout(()=>{console.error('FAIL: app control smoke timed out');app.exit(1);},45000);
  try{
    assert.equal(fs.realpathSync(app.getPath('userData')),fs.realpathSync(process.env.FILERRRR_TEST_DATA_DIR));
    assert.equal(fs.realpathSync(app.getPath('sessionData')),fs.realpathSync(process.env.FILERRRR_TEST_DATA_DIR));
    if(process.env.FILERRRR_IMPORT_PACK){
      const loaded=require('module').createRequire(path.join(process.env.FILERRRR_SMOKE_ARCHIVE,'main.cjs'));await loaded('./engine-packs.cjs').install(process.env.FILERRRR_IMPORT_PACK);
    }
    const main=BrowserWindow.getAllWindows().find(window=>!window.isAlwaysOnTop());assert.ok(main);
    if(main.webContents.isLoadingMainFrame())await new Promise(resolve=>main.webContents.once('did-finish-load',resolve));
    const js=source=>main.webContents.executeJavaScript(source),input=path.join(work,'job.json');fs.writeFileSync(input,'{"works":true}');
    const updateState=await js('api.updateStatus()');assert.equal(updateState.manual,true);assert.match(updateState.message,/Updates are manual/);
    assert.equal(await js("document.getElementById('automaticUpdatesRow').hidden"),true);assert.equal(await js("document.getElementById('checkUpdates').hidden"),true);assert.equal(await js("document.getElementById('openReleases').textContent"),'Open releases');
    await js('api.setSettings({features:{history:false}})');
    const [result]=await js(`api.convert([${JSON.stringify(input)}],'formats','YAML')`);
    assert.ok(result.undo?.token);assert.ok(fs.existsSync(result.output));assert.equal((await js('api.history()')).items.length,0);
    assert.deepEqual(await js(`api.existing([${JSON.stringify(result.output)}])`),[true]);
    const undo=await js(`api.undo(${JSON.stringify(result.undo.token)})`);
    assert.deepEqual(undo.undone,[result.output]);assert.ok(!fs.existsSync(result.output));assert.ok(fs.existsSync(input));
    const recipe={id:'integration-data',name:'Integration data',target:'YAML',prefix:'preset-',preferences:{destination:'converted'}};
    await js(`api.setSettings({recipes:[${JSON.stringify(recipe)}]})`);
    const checked=await js(`api.inspect([${JSON.stringify(input)}])`);assert.equal(checked.recipes[0].id,recipe.id);
    const [preset]=await js(`api.convert([${JSON.stringify(input)}],'preset','integration-data')`);assert.ok(!preset.error,preset.error);assert.equal(path.basename(preset.output),'preset-job.yaml');
    const watchFolder=path.join(work,'watch');fs.mkdirSync(watchFolder);
    await js(`api.setSettings({watchFolders:[{id:'integration-watch',folder:${JSON.stringify(watchFolder)},recipe:'integration-data',enabled:true,existing:false}]})`);
    await new Promise(resolve=>setTimeout(resolve,1400));const watched=path.join(watchFolder,'arrived.json');fs.writeFileSync(watched,'{"watched":true}');
    const watchOutput=path.join(watchFolder,'Converted','preset-arrived.yaml');for(let i=0;i<120&&!fs.existsSync(watchOutput);i++)await new Promise(resolve=>setTimeout(resolve,100));assert.ok(fs.existsSync(watchOutput),'real GUI-configured watch rule produces an output through a worker');
    await js('api.setSettings({watchFolders:[]})');assert.match(await js('api.notices()'),/third-party/);assert.equal(typeof await js('api.readLog()'),'string');

    const scan=await require('./ocr-fixture.cjs')(path.join(work,'scan.pdf'));
    const stopped=await js(`(async()=>{const off=api.onProgress(detail=>{if(detail.stage==='Recognizing text (English)')api.cancelConversion();});
      try{return await api.convert([${JSON.stringify(scan)}],'formats','DOCX')}finally{off()}})()`);
    assert.equal(stopped[0].cancelled,true);assert.ok(!fs.readdirSync(work).some(name=>name.startsWith('.filerrrr-')));
    assert.ok(!fs.existsSync(path.join(work,'scan.docx')));assert.equal((await js('api.history()')).items.length,0);
    const pruned=await js('api.pruneHistory()');assert.equal(pruned.removed,0);
    const text=path.join(work,'worker-print.txt');fs.writeFileSync(text,'Separate worker prints this document');
    const [printed]=await js(`api.convert([${JSON.stringify(text)}],'formats','PDF')`);assert.ok(!printed.error,printed.error);assert.equal(fs.readFileSync(printed.output).subarray(0,4).toString(),'%PDF');
    const client=process.env.FILERRRR_SMOKE_ARCHIVE?require('module').createRequire(path.join(process.env.FILERRRR_SMOKE_ARCHIVE,'main.cjs'))('./conversion-client.cjs'):require('../conversion-client.cjs');
    const [preview]=await client.run([printed.output],'preview','PNG');assert.match(preview.dataUrl,/^data:image\/png;base64,/);
    assert.ok(!Object.keys(require.cache).some(file=>/node_modules[\\/]sharp[\\/]lib/.test(file)),'app process does not retain conversion engines');
    const originalThumbnail=nativeImage.createThumbnailFromPath;let rejectThumbnail;
    nativeImage.createThumbnailFromPath=()=>new Promise((_resolve,reject)=>rejectThumbnail=reject);
    const pendingThumbnail=js(`api.thumb(${JSON.stringify(printed.output)})`).catch(()=>null);
    for(let i=0;i<100&&!rejectThumbnail;i++)await new Promise(resolve=>setTimeout(resolve,10));assert.ok(rejectThumbnail);
    const startsBeforeClose=workerStarts,closed=new Promise(resolve=>main.once('closed',resolve));main.close();await closed;
    rejectThumbnail(new Error('No Windows thumbnail provider'));await new Promise(resolve=>setTimeout(resolve,120));nativeImage.createThumbnailFromPath=originalThumbnail;
    assert.equal(workerStarts,startsBeforeClose,'a late native thumbnail failure cannot start a worker after the window closes');
    assert.equal(BrowserWindow.getAllWindows().length,0,'closing the idle main window releases its renderer');
    console.log('PASS: isolated app startup, real sandboxed conversion/cancel/Undo IPC, history-off actions and native Recycle Bin');
  }catch(error){failed=true;console.error(error.stack||error);}
  finally{
    clearTimeout(timeout);
    for(const file of fs.readdirSync(work))if(file!=='profile')fs.rmSync(path.join(work,file),{recursive:true,force:true});
    console.log(`Test profile: ${work}`);app.exit(failed?1:0);
  }
});
