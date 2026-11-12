const fs=require('fs'),path=require('path'),{run,tmpDir}=require('./common.cjs');
const candidates={office:[path.join(process.env.ProgramFiles||'','LibreOffice/program/soffice.exe')],books:[path.join(process.env.ProgramFiles||'','Calibre2/ebook-convert.exe')],image:[],cad:[],hwp:[]};
let custom={};
function configure(value){custom=value||{};}
function status(){const out={};for(const key of Object.keys(candidates)){const file=custom[key]||candidates[key].find(file=>fs.existsSync(file));out[key]={ready:!!file&&fs.existsSync(file),path:file||''};}return out;}
function requirement(ext,target){
  if(ext==='pptx'&&status().office.ready&&target==='PDF')return 'office';
  if(['doc','xls','ppt','odt','ods','odp','rtf'].includes(ext))return 'office';
  if(['mobi','azw','azw3'].includes(ext))return 'books';
  if(['heic','jxl'].includes(target.toLowerCase())||['cr2','cr3','nef','arw','dng','orf','rw2','jxl'].includes(ext))return 'image';
  if(['dwg','step','stp','iges','igs','3mf','fbx','gltf','glb'].includes(ext))return 'cad';
  if(ext==='hwp')return 'hwp';return null;
}
async function convert(input,target,out){
  const ext=require('../formats.js').extOf(input),key=requirement(ext,target),tool=status()[key];if(!tool?.ready)throw new Error(`Configure the ${key||'required'} converter in Settings → Additional formats`);
  const dir=await tmpDir();try{
    if(key==='office'){
      const {pathToFileURL}=require('url');await run(tool.path,['-env:UserInstallation='+pathToFileURL(path.join(dir,'profile')).href,'--headless','--convert-to',path.extname(out).slice(1),'--outdir',dir,input]);
      const generated=path.join(dir,path.basename(input,path.extname(input))+path.extname(out));await fs.promises.copyFile(generated,out);
    }else if(key==='books')await run(tool.path,[input,out]);
    else if(key==='image')await run(tool.path,[input+'[0]',out]);
    else if(key==='hwp'){if(target!=='TXT')throw new Error('The configured HWP converter currently supports text extraction');const bytes=await run(tool.path,['text',input]);await fs.promises.writeFile(out,bytes);}
    else throw new Error('This CAD backend has no verified conversion route yet');
  }finally{await fs.promises.rm(dir,{recursive:true,force:true});}
}
module.exports={status,configure,requirement,convert};
