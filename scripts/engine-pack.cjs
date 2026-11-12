const fs=require('fs'),path=require('path'),crypto=require('crypto'),JSZip=require('jszip');
(async()=>{
  const app=path.resolve(__dirname,'..'),zip=new JSZip(),files=[];
  async function add(source,name){const bytes=await fs.promises.readFile(source);files.push({path:name,size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});zip.file(name,bytes);}
  await add(require('ffmpeg-static'),'ffmpeg.exe');await add(require.resolve('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'),'eng.traineddata.gz');
  const canvas=path.dirname(require.resolve('@napi-rs/canvas-win32-x64-msvc/package.json'));await add(path.join(canvas,'skia.win32-x64-msvc.node'),'canvas/skia.win32-x64-msvc.node');await add(path.join(canvas,'icudtl.dat'),'canvas/icudtl.dat');
  const core=path.dirname(require.resolve('tesseract.js-core/package.json'));
  for(const file of fs.readdirSync(core).sort())if(/^(package\.json|LICENSE|index\.js|tesseract-core[-a-z]*\.(js|wasm|wasm\.js))$/.test(file))await add(path.join(core,file),`tesseract.js-core/${file}`);
  const manifest={version:1,platform:'win32-x64',files};fs.writeFileSync(path.join(app,'engine-pack-manifest.json'),JSON.stringify(manifest,null,2));
  zip.file('filerrrr-engine-pack.json',JSON.stringify(manifest));
  zip.file('NOTICE.txt','Filerrrr optional engines: FFmpeg (see ffmpeg-static/LICENSE and upstream ffmpeg.org), Tesseract.js core (Apache-2.0), English trained data (Apache-2.0). Files are pinned by SHA256 in this Filerrrr build.');
  for(const [source,name] of [['ffmpeg-static/LICENSE','licenses/ffmpeg-static-LICENSE'],['@tesseract.js-data/eng/package.json','licenses/eng-package.json']])zip.file(name,fs.readFileSync(require.resolve(source)));
  await fs.promises.mkdir(path.join(app,'release'),{recursive:true});const output=path.join(app,'release','Filerrrr-Engines-win-x64.zip');
  fs.writeFileSync(output,await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}}));console.log(`Engine pack: ${output} (${files.length} pinned files)`);
})().catch(error=>{console.error(error);process.exitCode=1;});
