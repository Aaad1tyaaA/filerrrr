const fs=require('fs'),path=require('path'),crypto=require('crypto');
let root=process.env.FILERRRR_ENGINE_ROOT||'';
const unpack=file=>file.replace(`app.asar${path.sep}`,`app.asar.unpacked${path.sep}`);
const bundled={media:unpack(require('ffmpeg-static')),model:path.join(path.dirname(unpack(require.resolve('@tesseract.js-data/eng/package.json'))),'4.0.0_best_int','eng.traineddata.gz'),core:path.dirname(unpack(require.resolve('tesseract.js-core/package.json'))),canvas:path.join(path.dirname(unpack(require.resolve('@napi-rs/canvas-win32-x64-msvc/package.json'))),'skia.win32-x64-msvc.node')};
const names={media:'ffmpeg.exe',model:'eng.traineddata.gz',core:'tesseract.js-core',canvas:path.join('canvas','skia.win32-x64-msvc.node')};
function configure(folder){root=folder;process.env.FILERRRR_ENGINE_ROOT=folder;if(!fs.existsSync(bundled.canvas)&&fs.existsSync(file('canvas')))process.env.NAPI_RS_NATIVE_LIBRARY_PATH=file('canvas');}
function file(kind){return fs.existsSync(kind==='core'?path.join(bundled[kind],'tesseract-core-lstm.wasm.js'):bundled[kind])?bundled[kind]:path.join(root||'.',names[kind]);}
function status(){return {media:fs.existsSync(file('media')),canvas:fs.existsSync(file('canvas')),ocr:fs.existsSync(file('model'))&&fs.existsSync(path.join(file('core'),'tesseract-core-lstm.wasm.js')),bundled:fs.existsSync(bundled.media),root};}
async function install(zipFile){
  if(!root)throw new Error('Engine storage is not configured');
  const JSZip=require('jszip'),zip=await JSZip.loadAsync(await fs.promises.readFile(zipFile));
  const manifest=JSON.parse(await zip.file('filerrrr-engine-pack.json')?.async('string')||'null');
  if(manifest?.version!==1||manifest.platform!=='win32-x64'||!Array.isArray(manifest.files)||manifest.files.length>80)throw new Error('Not a Windows x64 Filerrrr engine pack');
  const expected=require('./engine-pack-manifest.json');
  if(JSON.stringify(manifest)!==JSON.stringify(expected))throw new Error('This engine pack is not approved for this Filerrrr build');
  await fs.promises.mkdir(root,{recursive:true});const stage=await fs.promises.mkdtemp(path.join(root,'.install-'));
  try{
    for(const item of manifest.files){
      if(typeof item.path!=='string'||!(/^(ffmpeg\.exe|eng\.traineddata\.gz|canvas\/(skia\.win32-x64-msvc\.node|icudtl\.dat)|tesseract\.js-core\/(package\.json|LICENSE|index\.js|tesseract-core[-a-z]*\.(wasm|js|wasm\.js)))$/).test(item.path)||!/^[a-f0-9]{64}$/.test(item.sha256)||!Number.isInteger(item.size)||item.size<0||item.size>150*1048576)throw new Error('Engine pack contains an invalid file');
      const entry=zip.file(item.path);if(!entry)throw new Error('Engine pack is incomplete');
      const bytes=await entry.async('nodebuffer');if(bytes.length!==item.size||crypto.createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw new Error('Engine pack checksum failed');
      const output=path.join(stage,item.path);await fs.promises.mkdir(path.dirname(output),{recursive:true});await fs.promises.writeFile(output,bytes);
    }
    const skip=new Set();for(const name of ['ffmpeg.exe','eng.traineddata.gz','tesseract.js-core','canvas'])if(fs.existsSync(path.join(stage,name))){
      const target=path.join(root,name);if(fs.existsSync(target)){for(const item of manifest.files.filter(item=>item.path===name||item.path.startsWith(name+'/'))){const bytes=await fs.promises.readFile(path.join(root,item.path)).catch(()=>null);if(!bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw new Error('An older engine is already installed. Remove the old pack while Filerrrr is closed before replacing it.');}skip.add(name);}
    }
    for(const name of ['ffmpeg.exe','eng.traineddata.gz','tesseract.js-core','canvas'])if(!skip.has(name)&&fs.existsSync(path.join(stage,name)))await fs.promises.rename(path.join(stage,name),path.join(root,name));
  }finally{await fs.promises.rm(stage,{recursive:true,force:true});}
  configure(root);return status();
}
module.exports={configure,file,status,install};
