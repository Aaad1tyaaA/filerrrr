const {app,Notification}=require('electron'),fs=require('fs'),path=require('path'),os=require('os');const work=fs.mkdtempSync(path.join(os.tmpdir(),'filerrrr-notification-'));app.setPath('userData',path.join(work,'profile'));app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
  const input=path.join(work,'Notification sample.json');fs.writeFileSync(input,'{"notification":"test"}');const [result]=await require('../convert.cjs').run([input],'formats','YAML');if(result.error)throw new Error(result.error);
  app.setAppUserModelId('com.filerrrr.app');const notification=new Notification({title:'Filerrrr: sample conversion complete',body:'Notification sample.yaml was saved. This is a local test fixture.',icon:path.resolve(__dirname,'../build/icon.png'),actions:[{type:'button',text:'Show in folder'}]});
  notification.on('show',()=>console.log('PASS: Windows accepted the native result notification'));notification.on('failed',(_event,error)=>console.error('FAIL: notification',error));notification.show();setTimeout(()=>{notification.close();app.exit(0);},15000);
}).catch(error=>{console.error(error);app.exit(1);});
