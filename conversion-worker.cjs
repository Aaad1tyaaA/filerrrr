const {app,shell}=require('electron'),fs=require('fs'),path=require('path');
const profile=require('./test-profile.cjs').prepare(process.env.FILERRRR_WORKER_DATA);
if(!profile)throw new Error('Worker needs an isolated profile');
app.setPath('userData',profile);app.setPath('sessionData',profile);
const controller=new AbortController();let sequence=0;
app.on('window-all-closed',()=>{});
function write(name,value){const file=path.join(profile,name);fs.writeFileSync(file+'.tmp',JSON.stringify(value));fs.renameSync(file+'.tmp',file);}
const abortTimer=setInterval(()=>{if(fs.existsSync(path.join(profile,'abort')))controller.abort();try{process.kill(process.ppid,0);}catch{controller.abort();}},25);
app.whenReady().then(async()=>{
  try{
    const message=JSON.parse(fs.readFileSync(path.join(profile,'job.json'),'utf8'));
    require('./engine-packs.cjs').configure(process.env.FILERRRR_ENGINE_ROOT||path.join(profile,'engines'));
    require('./engines/extended.cjs').configure(message.options?.external);
    if(message.face==='preview'){
      const bytes=await require('./engines/job.cjs').withJob(controller.signal,()=>require('./engines/pdf.cjs').firstPagePng(message.inputs[0],480));
      write('result.json',{results:[{dataUrl:'data:image/png;base64,'+bytes.toString('base64')}]});return;
    }
    if(message.face==='image-preview'){
      const image=await require('./engines/image.cjs').load(message.inputs[0]),metadata=await image.metadata(),bytes=await image.resize({width:1000,height:700,fit:'inside',withoutEnlargement:true}).png().toBuffer();write('result.json',{results:[{width:metadata.autoOrient?.width||metadata.width,height:metadata.autoOrient?.height||metadata.height,dataUrl:'data:image/png;base64,'+bytes.toString('base64')}]});return;
    }
    const results=await require('./convert.cjs').run(message.inputs,message.face,message.pick,(fraction,detail)=>{
      try{write('progress.json',{sequence:++sequence,fraction,detail});}catch(error){if(!['EPERM','EACCES','EBUSY'].includes(error.code))throw error;}
    },{...message.options,signal:controller.signal,recycle:file=>shell.trashItem(file)});
    write('result.json',{results});
  }catch(error){write('result.json',{error:String(error.message||error)});}
  finally{clearInterval(abortTimer);app.exit(0);}
});
