// A disposable OCR broker lets the parent cancel model loading as well as recognition.
const {parentPort,workerData} = require('worker_threads');
const {createWorker,OEM,PSM} = require('tesseract.js');
let engine;
const fail = error => parentPort.postMessage({type:'error',error:String(error?.message || error).slice(0,220)});
(async()=>{
  engine = await createWorker('eng',OEM.LSTM_ONLY,{
    workerPath:workerData.workerPath,langPath:workerData.langPath,cacheMethod:'none',gzip:true,
    logger:message=>{ if(message.status==='recognizing text') parentPort.postMessage({type:'progress',progress:message.progress}); },
    errorHandler:fail,
  });
  await engine.setParameters({tessedit_pageseg_mode:PSM.AUTO,user_defined_dpi:'216',preserve_interword_spaces:'1'});
  parentPort.postMessage({type:'ready'});
  parentPort.on('message',async message=>{
    if(message.type!=='recognize') return;
    try { const result=await engine.recognize(message.png); parentPort.postMessage({type:'text',text:result.data.text.trim()}); }
    catch(error){fail(error);}
  });
})().catch(fail);
