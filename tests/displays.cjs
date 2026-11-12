const {app,BrowserWindow,screen}=require('electron'),fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'filerrrr-displays-'));app.setPath('userData',profile);
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{let failed=false;const rows=[];try{
  for(const display of screen.getAllDisplays()){
    const area=display.workArea,width=Math.min(540,area.width),height=Math.min(600,area.height),x=area.x+Math.floor((area.width-width)/2),y=area.y+Math.floor((area.height-height)/2);
    const win=new BrowserWindow({show:false,x,y,width,height,frame:false,transparent:true,webPreferences:{backgroundThrottling:false}});
    try{
      await win.loadFile(path.resolve(__dirname,'../renderer/overlay.html'));await win.webContents.executeJavaScript(`globalThis.p=new Palette(document.getElementById('pal'));p.open({label:'PDF',targets:['DOCX'],tools:[]});p.commit();p.finish([{input:'sample.pdf',output:'sample.docx',undo:{token:'display',expiresAt:Date.now()+10000}}]);void 0;`);
      const bounds=win.getBounds();assert.ok(bounds.x>=area.x&&bounds.y>=area.y&&bounds.x+bounds.width<=area.x+area.width&&bounds.y+bounds.height<=area.y+area.height);
      const fit=await win.webContents.executeJavaScript("document.querySelector('.pal-work').getBoundingClientRect().bottom<=innerHeight");assert.equal(fit,true);
      rows.push({scaleFactor:display.scaleFactor,workArea:area,window:bounds,cardFits:fit});
    }finally{win.destroy();}
  }console.log(JSON.stringify({pass:true,displays:rows}));
}catch(error){failed=true;console.error(error);}finally{app.exit(failed?1:0);}});
