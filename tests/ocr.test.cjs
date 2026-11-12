const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('fs'), os = require('os'), path = require('path');
const { run } = require('../convert.cjs');
const { inspect } = require('../capabilities.cjs');
const pdf = require('../engines/pdf.cjs');
let dir, scan, mixed;
test.before(async()=>{
  dir = fs.mkdtempSync(path.join(os.tmpdir(),'filerrrr-ocr-test-'));
  const make = require('./ocr-fixture.cjs');
  scan = await make(path.join(dir,'scan.pdf'));
  mixed = await make(path.join(dir,'mixed.pdf'),require,true);
});
test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
test('scanned PDF recognition enables editable routes and recovers actual invoice text', async()=>{
  const checked = await inspect([scan]);
  assert.equal(checked.files[0].textPages,0);
  assert.equal(checked.ocr,true); assert.ok(checked.targets.includes('DOCX'));
  assert.match(checked.note,/English OCR/);
  const progress = [];
  const [result] = await run([scan],'formats','DOCX',(fraction,detail)=>progress.push({fraction,...detail}));
  assert.ok(!result.error,result.error);
  const text = (await require('mammoth').extractRawText({path:result.output})).value;
  assert.match(text,/SCANNED INVOICE/i); assert.match(text,/48291/); assert.match(text,/1250[.,]00/);
  assert.ok(progress.some(p=>p.stage==='Recognizing text (English)'&&p.page===1&&p.pages===1));
  assert.equal(progress.at(-1).fraction,1);
  assert.ok(progress.every((p,i)=>!i||p.fraction>=progress[i-1].fraction));
});
test('mixed PDFs OCR image-only pages and preserve existing text without recognizing it again', async()=>{
  const stages = [];
  const pages = await pdf.pagesText(mixed,(_fraction,detail)=>stages.push(detail));
  assert.match(pages[0],/48291/); assert.match(pages[1],/Existing text remains intact/);
  assert.ok(stages.filter(p=>p.stage==='Recognizing text (English)').every(p=>p.page===1));
  const off = await pdf.pagesText(mixed,()=>{},{ocr:false});
  assert.equal(off[0],''); assert.match(off[1],/Existing text/);
});
test('OCR also supplies plain text and an unreadable blank scan leaves no empty document', async()=>{
  const [txt] = await run([scan],'formats','TXT');
  assert.ok(!txt.error,txt.error); assert.match(fs.readFileSync(txt.output,'utf8'),/48291/);
  const {PDFDocument} = require('pdf-lib'), blank = await PDFDocument.create();
  blank.addPage([200,200]); const input = path.join(dir,'blank.pdf'); fs.writeFileSync(input,await blank.save());
  const [result] = await run([input],'formats','DOCX');
  assert.match(result.error,/No readable English text/); assert.ok(!fs.existsSync(path.join(dir,'blank.docx')));
});
test('a queued batch of scans completes and reserves a distinct output for every file', async()=>{
  const results = await run([scan,scan,scan],'formats','TXT');
  assert.equal(results.length,3);
  assert.ok(results.every(result=>!result.error),JSON.stringify(results.filter(result=>result.error)));
  assert.equal(new Set(results.map(result=>result.output)).size,3);
  for (const result of results) assert.match(fs.readFileSync(result.output,'utf8'),/48291/);
});

test('OCR can be cancelled during loading and recognition without poisoning the next job',async()=>{
  for(const stage of ['Loading English OCR','Recognizing text (English)']){
    const controller=new AbortController();let reached=false;
    const [result]=await run([scan],'formats','DOCX',(_fraction,detail)=>{
      if(detail.stage===stage){reached=true;controller.abort();}
    },{signal:controller.signal});
    assert.equal(reached,true,stage);assert.equal(result.cancelled,true,JSON.stringify(result));
    assert.ok(!fs.readdirSync(dir).some(name=>name.startsWith('.filerrrr-')));
  }
  const [next]=await run([scan],'formats','TXT');assert.ok(!next.error,next.error);
  assert.match(fs.readFileSync(next.output,'utf8'),/48291/);
});

test('cancelling a queued OCR request does not interrupt either active recognizer',async()=>{
  const Job=require('../engines/job.cjs'),ocr=require('../engines/ocr.cjs');
  const workers=await Promise.all([ocr.create(),ocr.create()]);
  try{
    const controller=new AbortController(),queued=Job.withJob(controller.signal,()=>ocr.create());
    controller.abort();await assert.rejects(queued,error=>error.code==='CANCELLED');
    const png=await pdf.firstPagePng(scan,1200);
    const texts=await Promise.all(workers.map(worker=>worker.recognize(png)));
    assert.ok(texts.every(text=>/48291/.test(text)));
  }finally{await Promise.all(workers.map(worker=>worker.close()));}
});
