const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os');
const Recipes=require('../recipes.cjs'),Watch=require('../watch-folders.cjs'),{run}=require('../convert.cjs');let dir;
test.before(()=>dir=fs.mkdtempSync(path.join(os.tmpdir(),'filerrrr-workflows-')));test.after(async()=>{require('sharp').cache(false);await new Promise(resolve=>setTimeout(resolve,100));await fs.promises.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
test('preset validation rejects hostile names and persists reusable image transforms',async()=>{
  const recipes=Recipes.sanitize([{id:'web',name:'Web photos',target:'WEBP',width:40,prefix:'web-../',preferences:{destination:'converted'}},{id:'../../bad',name:'bad',target:'EXE'}]);assert.equal(recipes.length,1);assert.equal(recipes[0].prefix,'web-..');
  const input=path.join(dir,'preset.png');await require('sharp')({create:{width:80,height:50,channels:3,background:'#36f'}}).png().toFile(input);
  assert.ok(Recipes.applicable(recipes[0],[input]));const [result]=await run([input],'formats',recipes[0].target,()=>{},Recipes.options(recipes[0]));assert.ok(!result.error,result.error);assert.equal(path.basename(result.output),'web-..preset.webp');assert.equal((await require('sharp')(result.output).metadata()).width,40);assert.ok(fs.existsSync(input));
});
test('crop checks bounds and PDF page selection preserves explicit order',async()=>{
  const input=path.join(dir,'crop.png');await require('sharp')({create:{width:100,height:80,channels:3,background:'#f63'}}).png().toFile(input);
  const [good]=await run([input],'formats','PNG',()=>{},{edit:{crop:{left:10,top:10,width:40,height:20}}});assert.ok(!good.error,good.error);assert.equal((await require('sharp')(good.output).metadata()).height,20);
  const [bad]=await run([input],'formats','PNG',()=>{},{edit:{crop:{left:90,top:0,width:40,height:20}}});assert.match(bad.error,/outside/);assert.ok(!fs.readdirSync(dir).some(name=>name.startsWith('.filerrrr-')));
  const {PDFDocument}=require('pdf-lib'),doc=await PDFDocument.create();for(const width of [100,200,300])doc.addPage([width,100]);const pdf=path.join(dir,'pages.pdf');fs.writeFileSync(pdf,await doc.save());
  const [selected]=await run([pdf],'formats','PDF',()=>{},{edit:{pages:'3,1-2'}});assert.ok(!selected.error,selected.error);assert.deepEqual((await PDFDocument.load(fs.readFileSync(selected.output))).getPages().map(p=>p.getWidth()),[300,100,200]);
  assert.throws(()=>require('../edits.cjs').pages('0,9',3),/between/);assert.throws(()=>require('../edits.cjs').sanitize({trim:{start:10,end:2}}),/after/);
});
test('trim uses a new output and respects the requested interval',async()=>{
  const {ffmpeg}=require('../engines/common.cjs'),input=path.join(dir,'tone.wav');await ffmpeg(['-f','lavfi','-i','sine=d=3',input]);
  const [result]=await run([input],'formats','WAV',()=>{},{edit:{trim:{start:1,end:2}}});assert.ok(!result.error,result.error);assert.notEqual(result.output,input);assert.ok(fs.statSync(result.output).size<fs.statSync(input).size*.5);
});
test('watch folders settle writes, skip old files, avoid output loops and do not reconvert unchanged files',async()=>{
  const folder=path.join(dir,'watch');fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'old.json'),'{}');let clock=0,calls=0;
  const recipe=Recipes.sanitize([{id:'data',name:'Data',target:'YAML'}])[0],rules=[{id:'rule',folder,recipe:'data',enabled:true,existing:false}],watch=Watch.create({rules:()=>rules,recipes:()=>[recipe],now:()=>clock,interval:100000,settleMs:20,run:async(input,preset)=>{calls++;return run([input],'formats',preset.target,()=>{},Recipes.options(preset));}});
  try{await watch.tick();clock=30;await watch.tick();assert.equal(calls,0);const file=path.join(folder,'new.json');fs.writeFileSync(file,'{"new":1}');await watch.tick();clock=60;await watch.tick();assert.equal(calls,1);assert.ok(fs.existsSync(path.join(folder,'Converted','new.yaml')));clock=100;await watch.tick();assert.equal(calls,1);
    fs.writeFileSync(file,'{"new":123456}');await watch.tick();clock=130;await watch.tick();assert.equal(calls,2);assert.ok(fs.existsSync(path.join(folder,'Converted','new (1).yaml')));
  }finally{watch.stop();}
});
test('pausing a watch rule aborts its own active conversion',async()=>{
  const folder=path.join(dir,'pause-watch');fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'input.json'),'{}');let time=0,aborted=false,started;
  const ready=new Promise(resolve=>started=resolve),recipe=Recipes.sanitize([{id:'p',name:'P',target:'YAML'}])[0],rules=[{id:'r',folder,recipe:'p',enabled:true,existing:true}],watch=Watch.create({rules:()=>rules,recipes:()=>[recipe],now:()=>time,interval:100000,settleMs:1,run:async(_file,_preset,signal)=>new Promise(resolve=>{started();signal.addEventListener('abort',()=>{aborted=true;resolve([{error:'Cancelled',cancelled:true}]);});})});
  try{await watch.tick();time=2;const running=watch.tick();await ready;rules[0].enabled=false;await watch.tick();await running;assert.equal(aborted,true);}finally{watch.stop();}
});
test('native mesh, DXF and HWPX routes produce real outputs',async()=>{
  const obj=path.join(dir,'triangle.obj');fs.writeFileSync(obj,'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n');const [stl]=await run([obj],'formats','STL');assert.ok(!stl.error,stl.error);assert.match(fs.readFileSync(stl.output,'utf8'),/facet normal/);const [roundtrip]=await run([stl.output],'formats','OBJ');assert.ok(!roundtrip.error,roundtrip.error);assert.match(fs.readFileSync(roundtrip.output,'utf8'),/f 1 2 3/);
  const dxf=path.join(dir,'line.dxf');fs.writeFileSync(dxf,'0\nSECTION\n2\nENTITIES\n0\nLINE\n10\n0\n20\n0\n11\n10\n21\n20\n0\nENDSEC\n0\nEOF\n');const [svg]=await run([dxf],'formats','SVG');assert.ok(!svg.error,svg.error);assert.match(fs.readFileSync(svg.output,'utf8'),/<line/);
  const zip=new(require('jszip'))();zip.file('Contents/section0.xml','<hp:p><hp:t>Hello HWPX</hp:t></hp:p>');const hwpx=path.join(dir,'sample.hwpx');fs.writeFileSync(hwpx,await zip.generateAsync({type:'nodebuffer'}));const [txt]=await run([hwpx],'formats','TXT');assert.ok(!txt.error,txt.error);assert.match(fs.readFileSync(txt.output,'utf8'),/Hello HWPX/);
});
test('presentation export reads real slide text and emits a PDF; missing engines explain the dependency',async()=>{
  const zip=new(require('jszip'))();zip.file('ppt/slides/slide1.xml','<p:sld><a:p><a:r><a:t>Quarterly report</a:t></a:r></a:p></p:sld>');const input=path.join(dir,'slides.pptx');fs.writeFileSync(input,await zip.generateAsync({type:'nodebuffer'}));const [txt]=await run([input],'formats','TXT');assert.match(fs.readFileSync(txt.output,'utf8'),/Quarterly report/);const [pdf]=await run([input],'formats','PDF');assert.ok(!pdf.error,pdf.error);assert.equal((await require('pdf-lib').PDFDocument.load(fs.readFileSync(pdf.output))).getPageCount(),1);
  const fake=path.join(dir,'old.doc');fs.writeFileSync(fake,'fixture');const options=await require('../capabilities.cjs').inspect([fake]);assert.ok(options.choices.every(choice=>/office/.test(choice.reason)));assert.deepEqual(options.targets,[]);
});
