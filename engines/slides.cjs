// A readable slide-text export; detailed Office rendering uses the configured LibreOffice backend.
const fs=require('fs').promises;
async function convert(input,target,out){
  const zip=await require('jszip').loadAsync(await fs.readFile(input)),names=Object.keys(zip.files).filter(name=>/^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  if(!names.length)throw new Error('No slides found in this presentation');
  const {XMLParser}=require('fast-xml-parser'),parser=new XMLParser({ignoreAttributes:false,processEntities:true});const pages=[];
  function texts(node,list){if(Array.isArray(node)){node.forEach(item=>texts(item,list));return;}if(!node||typeof node!=='object')return;for(const [key,value]of Object.entries(node)){if(key==='a:t')list.push(typeof value==='object'?value['#text']||'':String(value));else texts(value,list);}}
  for(const name of names){const list=[];texts(parser.parse(await zip.file(name).async('string')),list);pages.push(list.join('\n'));}
  if(target==='TXT'){await fs.writeFile(out,pages.map((page,i)=>`Slide ${i+1}\n${page}`).join('\n\n'));return;}
  const {PDFDocument,StandardFonts}=require('pdf-lib'),doc=await PDFDocument.create(),font=await doc.embedFont(StandardFonts.Helvetica);
  for(let i=0;i<pages.length;i++){const page=doc.addPage([960,540]);let y=490;page.drawText(`Slide ${i+1}`,{x:40,y,font,size:14});y-=36;const text=pages[i].replace(/[^\x20-\x7e\n]/g,'?');for(const line of text.split('\n').flatMap(line=>line.match(/.{1,90}/g)||['']).slice(0,19)){page.drawText(line,{x:40,y,font,size:18});y-=22;}}
  await fs.writeFile(out,await doc.save());
}
module.exports={convert};
