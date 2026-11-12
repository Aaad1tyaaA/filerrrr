const fs = require('fs'), path = require('path');
const {Worker} = require('worker_threads');
const {unpacked} = require('./common.cjs');
const Job = require('./job.cjs');
const workerFile = unpacked(require.resolve('./ocr-engine-worker.cjs'));
const Packs=require('../engine-packs.cjs');
const brokerFile = unpacked(require.resolve('./ocr-worker.cjs'));
const available = () => Packs.status().ocr&&[workerFile,brokerFile].every(file=>fs.existsSync(file));
const workers=new Set(), waiting=[];
let active=0,stopping=false;
async function reserve(signal) {
  Job.check(signal); if(stopping) throw Job.cancelled();
  if(active<2){active++;return;}
  await new Promise((resolve,reject)=>{
    const entry={resolve:()=>{signal?.removeEventListener('abort',abort);resolve();},reject};
    const abort=()=>{const i=waiting.indexOf(entry);if(i>=0)waiting.splice(i,1);reject(Job.cancelled());};
    waiting.push(entry);signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted)abort();
  });
}
function release(){const next=waiting.shift();if(next)next.resolve();else active--;}
async function create(report=()=>{}) {
  const signal=Job.currentSignal(); Job.check(signal);
  if(!available())throw new Error('The local English OCR files are missing. Reinstall Filerrrr to restore them.');
  report({stage:'Waiting for local OCR',indeterminate:true});await reserve(signal);
  let worker, pending, timer, closed=false, terminalError;
  const fail=error=>{terminalError=error;clearTimeout(timer);const current=pending;pending=null;current?.reject(error);};
  const abort=()=>{fail(Job.cancelled());worker?.terminate().catch(()=>{});};
  const close=async()=>{
    if(closed)return;closed=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);
    try {if(worker)await worker.terminate();}finally{workers.delete(worker);release();}
  };
  const expect=(type,ms)=>new Promise((resolve,reject)=>{
    if(terminalError)return reject(terminalError);
    pending={type,resolve,reject};timer=setTimeout(()=>{fail(new Error('OCR took too long. Try a clearer or smaller scan.'));worker?.terminate().catch(()=>{});},ms);
  });
  try {
    const modelFile=Packs.file('model');require('zlib').gunzipSync(await fs.promises.readFile(modelFile));Job.check(signal);
    report({stage:'Loading English OCR',indeterminate:true});
    worker=new Worker(brokerFile,{workerData:{workerPath:workerFile,langPath:path.dirname(modelFile)}});workers.add(worker);
    worker.on('message',message=>{
      if(message.type==='error')return fail(new Error(message.error));
      if(message.type==='progress'){report({stage:'Recognizing text (English)',progress:message.progress});return;}
      if(message.type===pending?.type){clearTimeout(timer);const current=pending;pending=null;current.resolve(message);}
    });
    worker.on('error',fail);worker.on('exit',()=>{if(!closed&&!terminalError)fail(new Error('OCR worker stopped unexpectedly'));});
    signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
    await expect('ready',30000);Job.check(signal);
    return {
      async recognize(png){
        Job.check(signal);const result=expect('text',120000);worker.postMessage({type:'recognize',png});
        return (await result).text;
      },
      close,
    };
  }catch(error){await close();throw error;}
}
function killAll(){stopping=true;waiting.splice(0).forEach(job=>job.reject(Job.cancelled()));workers.forEach(worker=>worker.terminate().catch(()=>{}));}
module.exports={available,create,killAll};
