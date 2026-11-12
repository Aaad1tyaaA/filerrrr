const fs=require('fs').promises,{esc}=require('./common.cjs');
async function convert(input,ext,target,out){
  if(ext==='hwpx'){
    const zip=await require('jszip').loadAsync(await fs.readFile(input));const files=Object.keys(zip.files).filter(name=>/^Contents\/section\d+\.xml$/.test(name)).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    const text=[];for(const file of files){const xml=await zip.file(file).async('string');text.push([...xml.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(m=>m[1].replace(/<[^>]*>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&')).join('\n'));}if(!text.length)throw new Error('No text sections in this HWPX');await fs.writeFile(out,text.join('\n\n'));return;
  }
  if(ext==='dxf'){
    const tokens=(await fs.readFile(input,'utf8')).split(/\r?\n/),pairs=[];for(let i=0;i+1<tokens.length;i+=2)pairs.push([tokens[i].trim(),tokens[i+1].trim()]);
    const shapes=[];let entity;for(const [code,value]of [...pairs,['0','EOF']]){if(code==='0'){if(entity){const n=k=>Number(entity[k]||0);if(entity.type==='LINE')shapes.push({type:'line',x:n('10'),y:n('20'),x2:n('11'),y2:n('21')});if(entity.type==='CIRCLE')shapes.push({type:'circle',x:n('10'),y:n('20'),r:n('40')});}entity={type:value};}else if(entity)entity[code]=value;}
    if(!shapes.length)throw new Error('This DXF contains no supported LINE or CIRCLE entities');
    const xs=[],ys=[];for(const s of shapes){xs.push(s.x-(s.r||0),s.type==='line'?s.x2:s.x+s.r);ys.push(s.y-(s.r||0),s.type==='line'?s.y2:s.y+s.r);}if([...xs,...ys].some(n=>!Number.isFinite(n)))throw new Error('Invalid DXF coordinates');
    const minX=Math.min(...xs)-1,minY=Math.min(...ys)-1,w=Math.max(...xs)-minX+1,h=Math.max(...ys)-minY+1;
    await fs.writeFile(out,`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${w} ${h}"><g fill="none" stroke="black" stroke-width="${Math.max(w,h)/500}">${shapes.map(s=>s.type==='line'?`<line x1="${s.x}" y1="${s.y}" x2="${s.x2}" y2="${s.y2}"/>`:`<circle cx="${s.x}" cy="${s.y}" r="${s.r}"/>`).join('')}</g></svg>`);return;
  }
  let vertices=[],faces=[];
  const bytes=await fs.readFile(input);
  if(ext==='obj'){
    for(const line of bytes.toString('utf8').split(/\r?\n/)){const parts=line.trim().split(/\s+/);if(parts[0]==='v')vertices.push(parts.slice(1,4).map(Number));if(parts[0]==='f'){const ids=parts.slice(1).map(part=>{const n=parseInt(part);return n<0?vertices.length+n:n-1;});for(let i=1;i+1<ids.length;i++)faces.push([ids[0],ids[i],ids[i+1]]);}}
  }else if(ext==='stl'){
    if(bytes.length>=84&&84+bytes.readUInt32LE(80)*50===bytes.length){for(let i=0;i<bytes.readUInt32LE(80);i++){const ids=[];for(let j=0;j<3;j++){const offset=84+i*50+12+j*12;ids.push(vertices.length);vertices.push([0,4,8].map(n=>bytes.readFloatLE(offset+n)));}faces.push(ids);}}
    else {const text=bytes.toString('utf8');for(const m of text.matchAll(/vertex\s+([-+\deE.]+)\s+([-+\deE.]+)\s+([-+\deE.]+)/g)){vertices.push(m.slice(1).map(Number));if(vertices.length%3===0)faces.push([vertices.length-3,vertices.length-2,vertices.length-1]);}}
  }
  if(!faces.length||vertices.length>3000000||vertices.some(v=>v.length!==3||v.some(n=>!Number.isFinite(n)))||faces.some(f=>f.some(n=>!vertices[n])))throw new Error('Invalid or unsupported mesh; choose a triangle STL or OBJ');
  if(target==='OBJ')await fs.writeFile(out,vertices.map(v=>'v '+v.join(' ')).join('\n')+'\n'+faces.map(f=>'f '+f.map(n=>n+1).join(' ')).join('\n')+'\n');
  else await fs.writeFile(out,'solid Filerrrr\n'+faces.map(f=>'facet normal 0 0 0\nouter loop\n'+f.map(n=>'vertex '+vertices[n].join(' ')).join('\n')+'\nendloop\nendfacet').join('\n')+'\nendsolid Filerrrr\n');
}
module.exports={convert};
