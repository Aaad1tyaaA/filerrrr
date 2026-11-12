const fs=require('fs').promises,path=require('path'),F=require('./formats.js');
function sanitize(raw){if(!Array.isArray(raw))return [];const ids=new Set();return raw.slice(0,20).flatMap(rule=>{
  if(!rule||typeof rule.id!=='string'||!/^[a-zA-Z0-9-]{1,50}$/.test(rule.id)||ids.has(rule.id)||typeof rule.folder!=='string'||!path.isAbsolute(rule.folder)||typeof rule.recipe!=='string')return [];
  ids.add(rule.id);return [{id:rule.id,folder:rule.folder,recipe:rule.recipe,enabled:rule.enabled===true,existing:rule.existing===true}];
});}
function create({rules,recipes,run,onUpdate=()=>{},interval=1000,settleMs=2000,now=Date.now}){
  const states=new Map(),active=new Map();let ticking=false,stopped=false;
  function view(){return [...states].map(([id,state])=>({id,status:state.status,last:state.last||'',error:state.error||''}));}
  async function tick(){const latest=sanitize(rules());for(const [id,controller]of active)if(stopped||!latest.some(rule=>rule.id===id&&rule.enabled))controller.abort();if(ticking||stopped)return;ticking=true;
    try{
      const list=sanitize(rules());for(const [id,controller]of active)if(!list.some(rule=>rule.id===id&&rule.enabled))controller.abort();
      for(const id of states.keys())if(!list.some(rule=>rule.id===id))states.delete(id);
      for(const rule of list){
        const recipe=recipes().find(item=>item.id===rule.recipe);let state=states.get(rule.id);
        const key=JSON.stringify(rule)+JSON.stringify(recipe);if(!state||state.key!==key){active.get(rule.id)?.abort();state={key,seen:new Map(),status:'Starting',initial:true};states.set(rule.id,state);}
        if(!rule.enabled){state.status='Paused';continue;}if(!recipe){state.status='Preset missing';continue;}if(active.has(rule.id))continue;
        try{
          if(recipe.preferences.destination==='chosen'&&!recipe.preferences.folder)throw new Error('Choose an output folder for this preset first');
          const folder=await fs.realpath(rule.folder),output=recipe.preferences.destination==='chosen'?await fs.realpath(recipe.preferences.folder).catch(()=>path.resolve(recipe.preferences.folder)):path.join(folder,'Converted');
          if(path.relative(folder,output)==='')throw new Error('Watch output must use a different folder');
          const entries=await fs.readdir(folder,{withFileTypes:true});if(entries.filter(entry=>entry.isFile()).length>1000)throw new Error('Keep each watch folder below 1,000 files');const found=new Set();
          for(const entry of entries){if(!entry.isFile()||entry.name.startsWith('.')||F.kindOfExt(F.extOf(entry.name))==='other')continue;
            const input=path.join(folder,entry.name);found.add(input);const s=await fs.stat(input);const fingerprint=`${s.size}:${s.mtimeMs}`,old=state.seen.get(input);
            if(!old||old.fingerprint!==fingerprint){state.seen.set(input,{fingerprint,since:now(),done:state.initial&&!rule.existing,retries:0});continue;}
            if(old.done||!s.size||now()-old.since<settleMs)continue;
            if(!require('./recipes.cjs').applicable(recipe,[input])){old.done=true;continue;}
            const controller=new AbortController();active.set(rule.id,controller);state.status='Converting';state.last=entry.name;onUpdate(view());
            try{const results=await run(input,{...recipe,preferences:{...recipe.preferences,destination:'chosen',folder:output,collision:'number',openFolder:false}},controller.signal);
              const failed=results.find(result=>result.error);if(failed)throw new Error(failed.error);old.done=true;state.error='';state.status='Watching';
            }catch(error){state.error=String(error.message||error).slice(0,200);state.status='Error';old.retries++;old.since=now()+Math.min(30000,old.retries*5000);if(old.retries>=3)old.done=true;}
            finally{active.delete(rule.id);}break;
          }
          for(const input of state.seen.keys())if(!found.has(input))state.seen.delete(input);
          state.initial=false;if(state.status!=='Error')state.status='Watching';
        }catch(error){state.status='Error';state.error=String(error.message||error).slice(0,200);}
      }onUpdate(view());
    }finally{ticking=false;}
  }
  const timer=setInterval(()=>tick().catch(()=>{}),interval);timer.unref?.();
  return {tick,view,stop(){stopped=true;clearInterval(timer);active.forEach(controller=>controller.abort());}};
}
module.exports={sanitize,create};
