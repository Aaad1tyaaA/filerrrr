const path=require('path');
const defaults={destination:'original',folder:'',collision:'number',openFolder:false,image:'best',video:'best',resolution:'keep',audio:320,trigger:'ctrl',shortcut:'Control+Alt+C',learn:true,favourites:true};
function sanitize(raw={},base=defaults){
  const out={...base};
  for(const [key,values] of Object.entries({destination:['original','converted','chosen'],collision:['number','replace'],image:['small','balanced','best'],video:['small','balanced','best'],resolution:['keep','1080','720'],audio:[96,128,192,256,320],trigger:['ctrl','alt','shift','right'],shortcut:['Control+Alt+C','Control+Shift+Space','Alt+Shift+C','off']}))if(values.includes(raw?.[key]))out[key]=raw[key];
  for(const key of ['openFolder','learn','favourites'])if(typeof raw?.[key]==='boolean')out[key]=raw[key];
  if(typeof raw?.folder==='string'&&(raw.folder===''||path.isAbsolute(raw.folder)))out.folder=raw.folder;
  return out;
}
module.exports={defaults,sanitize};
