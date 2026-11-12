const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path');
const Job=require('../engines/job.cjs'),common=require('../engines/common.cjs');
const {run}=require('../convert.cjs');
let dir;
test.before(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'filerrrr-job-test-'));});
test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));

test('cancelling a child waits for exit and leaves another job running',async()=>{
  const controller=new AbortController(),mark=path.join(dir,'child.txt');
  const stopped=Job.withJob(controller.signal,()=>common.run(process.execPath,['-e',
    "require('fs').writeFileSync(process.argv[1],'started');process.stderr.write('ready');setTimeout(()=>require('fs').writeFileSync(process.argv[1],'leaked'),1500)",mark],
    {onStderr:()=>controller.abort()}));
  const other=Job.withJob(new AbortController().signal,()=>common.run(process.execPath,['-e',"setTimeout(()=>process.stdout.write('still running'),300)"]));
  await assert.rejects(stopped,error=>error.code==='CANCELLED');
  assert.equal((await other).toString(),'still running');
  assert.equal(fs.readFileSync(mark,'utf8'),'started');
});

test('cancelling a PDF export removes staged pages and leaves the original untouched',async()=>{
  const {PDFDocument}=require('pdf-lib'),pdf=await PDFDocument.create();
  for(let i=0;i<4;i++)pdf.addPage([160,160]);
  const input=path.join(dir,'pages.pdf'),bytes=await pdf.save();fs.writeFileSync(input,bytes);
  const controller=new AbortController();
  const [result]=await run([input],'formats','PNG',(_fraction,detail)=>{if(detail.stage==='Exporting PNG')controller.abort();},{signal:controller.signal});
  assert.equal(result.cancelled,true);assert.equal(result.output,undefined);
  assert.deepEqual(fs.readFileSync(input),Buffer.from(bytes));
  assert.ok(!fs.readdirSync(dir).some(name=>name.startsWith('.filerrrr-')||/^pages-p\d/.test(name)));
});

test('cancelling after a saved file keeps finished outputs and cancels the queued remainder',async()=>{
  const inputs=[];
  for(let i=0;i<8;i++){const file=path.join(dir,`data-${i}.json`);fs.writeFileSync(file,'{"hello":1}');inputs.push(file);}
  const controller=new AbortController();let saved;
  const results=await run(inputs,'formats','YAML',(_fraction,detail)=>{if(detail.stage==='File saved'&&!saved){saved=detail.input;controller.abort();}},{signal:controller.signal});
  const completed=results.filter(result=>!result.error);
  assert.ok(completed.length>=1&&completed.length<8);
  assert.ok(results.some(result=>result.cancelled));
  for(const result of completed)assert.match(fs.readFileSync(result.output,'utf8'),/hello: 1/);
  assert.ok(!fs.readdirSync(dir).some(name=>name.startsWith('.filerrrr-')));
  assert.ok(inputs.every(input=>fs.readFileSync(input,'utf8')==='{"hello":1}'));
});

test('publication rechecks a name created by another app while conversion was running',async()=>{
  const {PDFDocument}=require('pdf-lib'),pdf=await PDFDocument.create();pdf.addPage([100,100]);
  const input=path.join(dir,'collision.pdf'),occupied=path.join(dir,'collision.png');fs.writeFileSync(input,await pdf.save());
  const [result]=await run([input],'formats','PNG',(_fraction,detail)=>{if(detail.stage==='Exporting PNG')fs.writeFileSync(occupied,'another application');});
  assert.ok(!result.error,result.error);assert.notEqual(result.output,occupied);
  assert.equal(fs.readFileSync(occupied,'utf8'),'another application');assert.ok(fs.existsSync(result.output));
});
