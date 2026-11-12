const fs=require('fs'),path=require('path');
function create({event,log}){
  if(process.platform!=='win32')return null;
  try{
    const file=[path.join(path.dirname(process.execPath),'filerrrr_drop.dll'),path.join(__dirname,'build','filerrrr_drop.dll')].find(file=>fs.existsSync(file));if(!file)return null;
    const lib=require('koffi').load(file),install=lib.func('long InstallTarget(uintptr_t)'),enable=lib.func('void EnableTarget(uintptr_t,int)'),remove=lib.func('void RemoveTarget(uintptr_t)'),read=lib.func('int ReadEvent(void*,int)'),selected=lib.func('int SelectedFiles(void*,int)');
    const handle=window=>window.getNativeWindowHandle().readBigUInt64LE(),buffer=Buffer.alloc(2*1024*1024);let timer;
    return {enable(window,on){enable(handle(window),on?1:0);},install(window){const hr=install(handle(window));if(hr<0){log('native drop registration',hr);return false;}if(!timer){timer=setInterval(()=>{for(let i=0;i<60;i++){const n=read(buffer,buffer.length/2);if(n<=0)break;try{event(JSON.parse(buffer.toString('utf16le',0,n*2)));}catch(error){log('native drop',error);}}},16);timer.unref();}return true;},remove(window){remove(handle(window));},selected(){const n=selected(buffer,buffer.length/2);return n>0?JSON.parse(buffer.toString('utf16le',0,n*2)):[];}};
  }catch(error){log('native drop unavailable',error);return null;}
}
module.exports={create};
