const fs=require('fs'),os=require('os'),path=require('path');
function prepare(value){
  if(!value)return null;
  if(!path.isAbsolute(value))throw new Error('Test profile must be an absolute temporary path');
  const root=path.resolve(os.tmpdir()),folder=path.resolve(value),relative=path.relative(root,folder);
  if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||!/^filerrrr-/i.test(relative.split(path.sep)[0]))
    throw new Error('Test profile must be inside a filerrrr-* temporary folder');
  let ancestor=folder;while(!fs.existsSync(ancestor))ancestor=path.dirname(ancestor);
  const realRoot=fs.realpathSync(root),target=path.resolve(fs.realpathSync(ancestor),path.relative(ancestor,folder)),realRelative=path.relative(realRoot,target);
  if(!realRelative||realRelative.startsWith('..')||path.isAbsolute(realRelative)||!/^filerrrr-/i.test(realRelative.split(path.sep)[0]))
    throw new Error('Test profile cannot escape through a link');
  fs.mkdirSync(target,{recursive:true});return target;
}
module.exports={prepare};
