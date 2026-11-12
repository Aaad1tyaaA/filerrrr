const F=require('./formats.js');
function sanitize(raw){const out={};if(!raw||typeof raw!=='object')return out;
  for(const [ext,item] of Object.entries(raw).slice(0,200)){
    if(!/^[a-z0-9]{1,12}$/.test(ext)||!item||typeof item!=='object')continue;
    const counts={};for(const [target,count] of Object.entries(item.counts||{}))if(F.targetsFor(F.kindOfExt(ext),ext).includes(target)&&Number.isFinite(count)&&count>0)counts[target]=Math.min(100000,Math.floor(count));
    out[ext]={last:counts[item.last]?item.last:'',counts};
  }return out;
}
function record(raw,results,face,pick){const out=sanitize(raw);if(face!=='formats')return out;
  for(const result of results)if(!result.error&&!result.cancelled){const ext=F.norm(F.extOf(result.input));if(!/^[a-z0-9]{1,12}$/.test(ext))continue;const item=out[ext]||{counts:{}};item.last=pick;item.counts[pick]=Math.min(100000,(item.counts[pick]||0)+1);out[ext]=item;}return out;
}
function apply(options,paths,data,prefs){
  const exts=[...new Set(paths.map(file=>F.norm(F.extOf(file))))],last=exts.length===1&&prefs.learn?data?.[exts[0]]?.last:null;
  const targets=[...options.targets];if(targets.includes(last)){targets.splice(targets.indexOf(last),1);targets.unshift(last);}
  const counts={};for(const ext of exts)for(const [target,n] of Object.entries(data?.[ext]?.counts||{}))counts[target]=(counts[target]||0)+n;
  const ranked=[...targets].sort((a,b)=>(b===last)-(a===last)||(counts[b]||0)-(counts[a]||0)||targets.indexOf(a)-targets.indexOf(b));
  return {...options,targets,lastUsed:targets.includes(last)?last:null,favourites:prefs.favourites&&targets.length>8?ranked.slice(0,7):null};
}
module.exports={sanitize,record,apply};
