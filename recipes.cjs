const F=require('./formats.js'),P=require('./preferences.cjs');
const targets=new Set(Object.values(F.TARGETS).flat());
function sanitize(raw){if(!Array.isArray(raw))return [];const ids=new Set();return raw.slice(0,40).flatMap(item=>{
  if(!item||typeof item.id!=='string'||!/^[a-zA-Z0-9-]{1,50}$/.test(item.id)||ids.has(item.id)||!targets.has(item.target)||typeof item.name!=='string'||!item.name.trim())return [];
  ids.add(item.id);const width=Number.isInteger(item.width)&&item.width>=16&&item.width<=16000?item.width:0;
  return [{id:item.id,name:item.name.trim().slice(0,60),target:item.target,width,stripMetadata:item.stripMetadata!==false,prefix:typeof item.prefix==='string'?item.prefix.replace(/[<>:"/\\|?*\x00-\x1f]/g,'').trim().slice(0,40):'',preferences:P.sanitize(item.preferences)}];
});}
function applicable(recipe,paths,flags){const Features=require('./features.js');return Features.optionsFor(paths.map(F.extOf),flags).targets.includes(recipe.target)||(recipe.width>0&&paths.every(file=>F.kindOfExt(F.extOf(file))==='image'&&F.norm(F.extOf(file))===F.extFor(recipe.target))&&flags?.['convert.image']!==false);}
function options(recipe){return {preferences:recipe.preferences,edit:{resize:recipe.width||0,stripMetadata:recipe.stripMetadata},prefix:recipe.prefix};}
module.exports={sanitize,applicable,options};
