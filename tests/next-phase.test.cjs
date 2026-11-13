const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path');
const {run}=require('../convert.cjs'),Preferences=require('../preferences.cjs'),Picks=require('../picks.cjs'),Selection=require('../selection.cjs');
let dir;test.before(()=>dir=fs.mkdtempSync(path.join(os.tmpdir(),'filerrrr-next-')));test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
test('preferences migrate safely and persist only supported output, quality and trigger values',()=>{
  const {createStore}=require('../store.cjs'),file=path.join(dir,'prefs.json'),store=createStore(file);
  assert.equal(store.data.preferences.destination,'original');
  store.set({preferences:Preferences.sanitize({destination:'chosen',folder:dir,image:'best',audio:320,trigger:'alt',shortcut:'off',collision:'replace'})});store.flush();
  const saved=createStore(file).data.preferences;assert.equal(saved.folder,dir);assert.equal(saved.trigger,'alt');
  assert.equal(Preferences.sanitize({folder:'../escape',audio:Infinity,image:'invalid'}).folder,'');assert.equal(Preferences.sanitize({audio:Infinity}).audio,320);
});
test('folder expansion is shallow, deterministic, deduplicated, and ignores unsupported files and linked folders',async()=>{
  const folder=path.join(dir,'input');fs.mkdirSync(folder);fs.writeFileSync(path.join(folder,'b.json'),'{}');fs.writeFileSync(path.join(folder,'a.csv'),'x\n1');fs.writeFileSync(path.join(folder,'unknown.xyz'),'x');fs.mkdirSync(path.join(folder,'nested'));fs.writeFileSync(path.join(folder,'nested','deep.txt'),'x');
  const result=await Selection.expand([folder,path.join(folder,'a.csv')]);assert.equal(result.folders,1);assert.equal(result.skipped,2);assert.deepEqual(result.paths.map(file=>path.basename(file)),['a.csv','b.json']);
  const empty=path.join(dir,'empty');fs.mkdirSync(empty);await assert.rejects(Selection.expand([empty]),/No supported/);
});
test('chosen and Converted destinations keep originals safe and reserve names across a batch',async()=>{
  const input=path.join(dir,'source.json');fs.writeFileSync(input,'{"answer":42}');
  const [converted]=await run([input],'formats','YAML',()=>{},{preferences:{destination:'converted'}});assert.ok(!converted.error,converted.error);assert.equal(path.dirname(converted.output),path.join(dir,'Converted'));
  const folder=path.join(dir,'chosen'),results=await run([input,input],'formats','YAML',()=>{},{preferences:{destination:'chosen',folder}});
  assert.equal(new Set(results.map(result=>result.output)).size,2);assert.ok(results.every(result=>path.dirname(result.output)===folder));assert.equal(fs.readFileSync(input,'utf8'),'{"answer":42}');
});
test('Replace recycles the previous output and restores it if recycling fails',async()=>{
  const input=path.join(dir,'replace.json'),output=path.join(dir,'replace.yaml'),bin=path.join(dir,'recycled.yaml');fs.writeFileSync(input,'{"new":1}');fs.writeFileSync(output,'previous');
  let called;const [result]=await run([input],'formats','YAML',()=>{},{preferences:{collision:'replace'},recycle:async file=>{called=path.basename(file);fs.renameSync(file,bin);}});
  assert.ok(!result.error,result.error);assert.equal(result.output,output);assert.equal(called,'replace.yaml');assert.equal(fs.readFileSync(bin,'utf8'),'previous');assert.match(fs.readFileSync(output,'utf8'),/new: 1/);
  fs.writeFileSync(output,'must survive');const [failed]=await run([input],'formats','YAML',()=>{},{preferences:{collision:'replace'},recycle:async()=>{throw new Error('Recycle Bin unavailable');}});
  assert.match(failed.error,/Recycle/);assert.equal(fs.readFileSync(output,'utf8'),'must survive');assert.equal(fs.readFileSync(input,'utf8'),'{"new":1}');
  assert.ok(!fs.readdirSync(dir).some(name=>name.startsWith('.filerrrr-')));
});
test('Replace never overwrites another selected original',async()=>{
  const input=path.join(dir,'keep.json'),other=path.join(dir,'keep.yaml');fs.writeFileSync(input,'{"a":1}');fs.writeFileSync(other,'a: 2');
  const results=await run([input,other],'formats','YAML',()=>{},{preferences:{collision:'replace'},recycle:async()=>{throw new Error('Must not recycle an original');}});
  assert.ok(!results[0].error,results[0].error);assert.notEqual(results[0].output,other);assert.equal(fs.readFileSync(other,'utf8'),'a: 2');
});
test('learning records only successful routes, offers the last target first and limits the compact ring',()=>{
  const data=Picks.record({},[{input:'photo.png'},{input:'bad.png',error:'bad'}],'formats','JPG');assert.equal(data.png.counts.JPG,1);
  const options={targets:['WEBP','JPG','AVIF','PDF','SVG','GIF','TIFF','BMP','ICO','TGA','QOI']},result=Picks.apply(options,['photo.png'],data,{learn:true,favourites:true});
  assert.equal(result.targets[0],'JPG');assert.equal(result.lastUsed,'JPG');assert.equal(result.favourites.length,7);assert.ok(result.favourites.includes('JPG'));
  assert.deepEqual(Picks.apply(options,['photo.png'],data,{learn:false,favourites:false}).targets,options.targets);
  assert.deepEqual(Picks.sanitize({png:{last:'EXE',counts:{EXE:5,JPG:-1}}}),{png:{last:'',counts:{}}});
});
test('a chosen-folder junction cannot bypass original protection in Replace mode',async()=>{
  const folder=path.join(dir,'real'),alias=path.join(dir,'alias');fs.mkdirSync(folder);fs.symlinkSync(folder,alias,'junction');
  const source=path.join(folder,'same.json'),other=path.join(folder,'same.yaml');fs.writeFileSync(source,'{"new":1}');fs.writeFileSync(other,'original: 2');
  const results=await run([source,other],'formats','YAML',()=>{},{preferences:{destination:'chosen',folder:alias,collision:'replace'},recycle:async()=>{throw new Error('Do not recycle selected originals');}});
  assert.ok(!results[0].error,results[0].error);assert.equal(fs.readFileSync(other,'utf8'),'original: 2');
});
test('image presets change encoded size and media presets preserve lossless audio and limit resolution',async()=>{
  const sharp=require('sharp'),input=path.join(dir,'quality.png'),pixels=Buffer.alloc(256*256*3);for(let i=0;i<pixels.length;i++)pixels[i]=(i*73+(i>>8)*31)%256;
  await sharp(pixels,{raw:{width:256,height:256,channels:3}}).png().toFile(input);
  const [small]=await run([input],'formats','JPG',()=>{},{preferences:{image:'small'}}),[best]=await run([input],'formats','JPG',()=>{},{preferences:{image:'best'}});
  assert.ok(!small.error&&!best.error);assert.ok(fs.statSync(small.output).size<fs.statSync(best.output).size);
  const {argsFor}=require('../engines/media.cjs'),mp4=argsFor('MP4',{video:'small',resolution:'720',audio:128});assert.equal(mp4[mp4.indexOf('-crf')+1],'30');assert.match(mp4[mp4.indexOf('-vf')+1],/720/);assert.equal(mp4[mp4.indexOf('-b:a')+1],'128k');
  assert.ok(!argsFor('FLAC',{audio:320}).includes('-b:a'));assert.ok(!argsFor('WAV',{audio:320}).includes('-b:a'));
  for(const T of ['OPUS','OGG','WEBM']){const a=argsFor(T,{audio:320});assert.equal(a[a.indexOf('-b:a')+1],'256k',`${T} caps Opus at 256 kbps so mono sources still encode`);}
  assert.equal((a=>a[a.indexOf('-b:a')+1])(argsFor('MP3',{audio:320})),'320k');
});
test('engine packs reject unapproved manifests and checksum mismatches before publishing executables',async()=>{
  const packs=require('../engine-packs.cjs'),JSZip=require('jszip'),zip=new JSZip(),root=path.join(dir,'engines');packs.configure(root);
  zip.file('filerrrr-engine-pack.json',JSON.stringify({version:2,platform:'win32-x64',pack:'media',files:[]}));const bad=path.join(dir,'bad-pack.zip');fs.writeFileSync(bad,await zip.generateAsync({type:'nodebuffer'}));
  await assert.rejects(packs.install(bad),/does not match/);assert.ok(!fs.existsSync(path.join(root,'ffmpeg.exe')));
  const expected=require('../engine-pack-manifest.json').packs.media,tampered=new JSZip();tampered.file('filerrrr-engine-pack.json',JSON.stringify({version:2,platform:'win32-x64',pack:'media',files:expected.files}));tampered.file(expected.files[0].path,'tampered');fs.writeFileSync(bad,await tampered.generateAsync({type:'nodebuffer'}));
  await assert.rejects(packs.install(bad),/checksum/);assert.ok(!fs.existsSync(path.join(root,'ffmpeg.exe')));
});
test('engine packs download one at a time, verify the whole ZIP, install and remove',async()=>{
  const packs=require('../engine-packs.cjs'),http=require('http'),root=path.join(dir,'engines-dl');packs.configure(root);
  const manifest=require('../engine-pack-manifest.json'),name=manifest.packs.render.sources[0].url.split('/').pop();// the official npm tarball, served locally
  let body=fs.readFileSync(path.join(__dirname,'..','release','engines','official',name));
  const server=http.createServer((req,res)=>{if(!req.url.endsWith(name)){res.writeHead(404);return res.end();}res.writeHead(200,{'content-length':body.length});res.end(body);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));process.env.FILERRRR_ENGINE_BASE_URL=`http://127.0.0.1:${server.address().port}/`;
  try{
    const seen=[];const status=await packs.download('render',{onProgress:f=>seen.push(f)});
    assert.ok(fs.existsSync(path.join(root,'canvas','skia.win32-x64-msvc.node')));assert.equal(seen.at(-1),1);
    assert.ok(status.packs.find(p=>p.id==='render').size>0);
    const builtIn=status.packs.find(p=>p.id==='render').builtIn;// a development checkout ships the engine inside node_modules
    const removed=builtIn?(await assert.rejects(packs.remove('render'),/built into/),{restartNeeded:true}):await packs.remove('render');assert.ok(!fs.existsSync(path.join(root,'canvas'))||removed.restartNeeded);
    body=Buffer.from(body);body[body.length-10]^=0xff;// one flipped byte must be refused
    await assert.rejects(packs.download('render'),/damaged/);assert.ok(!fs.existsSync(path.join(root,'canvas','skia.win32-x64-msvc.node'))||removed.restartNeeded);
    await assert.rejects(packs.download('nope'),/Unknown/);
  }finally{delete process.env.FILERRRR_ENGINE_BASE_URL;server.close();}
});
