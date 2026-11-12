const {spawn}=require('child_process'),fs=require('fs'),fsp=fs.promises,os=require('os'),path=require('path');
const jobs=new Set();
async function run(inputs,face,pick,onProgress=()=>{},options={}){
  if(options.signal?.aborted)return inputs.map(input=>({input,error:'Cancelled',cancelled:true}));
  const profile=await fsp.mkdtemp(path.join(os.tmpdir(),'filerrrr-engine-'));
  const {signal,recycle,...serializable}=options;
  await fsp.writeFile(path.join(profile,'job.json'),JSON.stringify({inputs,face,pick,options:serializable}));
  const env={...process.env,FILERRRR_WORKER_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
  const args=require('electron').app.isPackaged?['--engine-worker']:[path.join(__dirname,'conversion-worker.cjs')];
  return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,args,{env,stdio:'ignore',windowsHide:true});let error,last=-1,polling=false,closing=false;
    const abort=()=>{try{fs.writeFileSync(path.join(profile,'abort'),'');}catch{}};
    jobs.add(abort);options.signal?.addEventListener('abort',abort,{once:true});if(options.signal?.aborted)abort();
    const timer=setInterval(async()=>{if(polling||closing)return;polling=true;try{const progress=JSON.parse(await fsp.readFile(path.join(profile,'progress.json'),'utf8'));if(progress.sequence!==last&&!closing){last=progress.sequence;onProgress(progress.fraction,progress.detail);}}catch{}finally{polling=false;}},40);
    child.on('error',cause=>{error=cause;});
    child.on('close',async(code)=>{
      closing=true;clearInterval(timer);jobs.delete(abort);options.signal?.removeEventListener('abort',abort);
      let result;try{result=JSON.parse(await fsp.readFile(path.join(profile,'result.json'),'utf8'));}catch{}
      await fsp.rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:100}).catch(()=>{});
      if(error)reject(error);else if(result?.error)reject(new Error(result.error));else if(result?.results)resolve(result.results);else reject(new Error(`Conversion worker stopped unexpectedly (${code})`));
    });
  });
}
function killAll(){for(const abort of jobs)abort();}
module.exports={run,killAll};
