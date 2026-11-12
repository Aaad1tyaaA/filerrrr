const fs=require('fs').promises,path=require('path'),{randomUUID}=require('crypto');
const TTL=30000; // long enough to read the result card or notification and change your mind
async function fingerprint(output){
  const rows=[];
  async function visit(file,relative){
    const s=await fs.lstat(file);
    rows.push([relative,s.isDirectory()?'dir':s.isSymbolicLink()?'link':'file',s.dev,s.ino,s.size,s.mtimeMs,s.ctimeMs,s.birthtimeMs]);
    if(s.isDirectory())for(const name of (await fs.readdir(file)).sort())await visit(path.join(file,name),path.join(relative,name));
  }
  await visit(output,'');return JSON.stringify(rows);
}
function createUndo({trash,now=Date.now}){
  const records=new Map();
  async function register(results,owner){
    const inputs=new Set(results.map(result=>path.resolve(result.input).toLowerCase()));
    const outputs=[...new Set(results.filter(result=>!result.error&&!result.cancelled).flatMap(result=>result.outputs||[result.output]).filter(Boolean).map(output=>path.resolve(output)))];
    const files=[];
    for(const output of outputs){
      if(inputs.has(output.toLowerCase()))continue;
      try{files.push({output,fingerprint:await fingerprint(output)});}catch{/* Missing outputs cannot be undone. */}
    }
    if(!files.length)return null;
    const token=randomUUID(),expiresAt=now()+TTL;
    const timer=setTimeout(()=>records.delete(token),TTL+100);timer.unref?.();
    records.set(token,{owner,files,expiresAt,timer,busy:false});
    return {token,expiresAt};
  }
  async function undo(token,owner){
    const record=records.get(token);
    if(!record||record.owner!==owner||now()>record.expiresAt)return {undone:[],skipped:[],error:'Undo expired or is unavailable'};
    if(record.busy)return {undone:[],skipped:[],error:'Undo is already running'};
    record.busy=true;const undone=[],skipped=[];
    try{
      for(const file of record.files){
        try{
          if(await fingerprint(file.output)!==file.fingerprint){skipped.push({output:file.output,reason:'File changed since conversion; kept it'});continue;}
          await trash(file.output);undone.push(file.output);
        }catch(error){skipped.push({output:file.output,reason:error.code==='ENOENT'?'File already moved or deleted':'Could not move this output to the Recycle Bin'});}
      }
      return {undone,skipped};
    }finally{clearTimeout(record.timer);records.delete(token);}
  }
  return {register,undo};
}
module.exports={createUndo,TTL};
