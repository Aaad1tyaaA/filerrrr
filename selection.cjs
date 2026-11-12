const fs=require('fs').promises,path=require('path'),F=require('./formats.js');
async function expand(paths){
  const files=[],seen=new Set();let folders=0,skipped=0;
  function add(file){const key=file.toLowerCase();if(!seen.has(key)){seen.add(key);files.push(file);}if(files.length>1000)throw new Error('Choose at most 1,000 files at a time');}
  for(const input of paths){
    const stat=await fs.lstat(input).catch(()=>null);
    if(stat?.isDirectory()&&!stat.isSymbolicLink()){
      folders++;
      for(const entry of (await fs.readdir(input,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
        if(entry.isFile()&&F.kindOfExt(F.extOf(entry.name))!=='other')add(path.join(input,entry.name));else skipped++;
      }
    }else add(input);
  }
  if(!files.length)throw new Error('No supported files in this folder. Subfolders are not included.');
  return {paths:files,folders,skipped};
}
module.exports={expand};
