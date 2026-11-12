const {app,BrowserWindow}=require('electron'),fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'filerrrr-idle-'));
process.env.FILERRRR_TEST_DATA_DIR=path.join(root,'profile');process.env.FILERRRR_TEST_NO_HOOK=process.env.FILERRRR_IDLE_HOOK==='1'?'0':'1';process.argv.push('--hidden');
require(process.env.FILERRRR_SMOKE_ARCHIVE?path.join(process.env.FILERRRR_SMOKE_ARCHIVE,'main.cjs'):'../main.cjs');
app.whenReady().then(()=>setTimeout(()=>{
  try{assert.equal(BrowserWindow.getAllWindows().length,0);assert.ok(!Object.keys(require.cache).some(file=>/node_modules[\\/]sharp[\\/]lib/.test(file)));const metrics=app.getAppMetrics();
    console.log(JSON.stringify({windows:0,workingSetMiB:Math.round(metrics.reduce((n,p)=>n+p.memory.workingSetSize,0)/1024),processes:metrics.map(p=>({type:p.type,workingSetMiB:Math.round(p.memory.workingSetSize/1024)}))}));app.exit(0);
  }catch(error){console.error(error);app.exit(1);}
},2000));
