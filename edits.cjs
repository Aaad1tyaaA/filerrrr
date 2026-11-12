function pages(value,total){
  if(typeof value!=='string'||value.length>2000)throw new Error('Enter page numbers such as 1,3-5');const result=[];
  for(const token of value.split(',')){const m=/^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(token);if(!m)throw new Error('Use page numbers such as 1,3-5');const start=+m[1],end=+(m[2]||m[1]);if(start<1||end<start||end>total)throw new Error(`Pages must be between 1 and ${total}`);for(let i=start;i<=end;i++){if(!result.includes(i-1))result.push(i-1);if(result.length>10000)throw new Error('Too many pages');}}
  if(!result.length)throw new Error('Select at least one page');return result;
}
function sanitize(value){
  if(!value||typeof value!=='object')return {};
  const out={};if(Number.isInteger(value.resize)&&value.resize>=16&&value.resize<=16000)out.resize=value.resize;
  if(typeof value.stripMetadata==='boolean')out.stripMetadata=value.stripMetadata;
  if(value.crop){const c=value.crop;if(!['left','top','width','height'].every(key=>Number.isInteger(c[key])&&c[key]>=0)||!c.width||!c.height||c.width>16000||c.height>16000)throw new Error('Enter a valid crop rectangle');out.crop={left:c.left,top:c.top,width:c.width,height:c.height};}
  if(value.trim){const {start,end}=value.trim;if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>86400)throw new Error('Trim end must be after start, within 24 hours');out.trim={start,end};}
  if(typeof value.pages==='string'&&value.pages.length<=2000)out.pages=value.pages;
  return out;
}
module.exports={pages,sanitize};
