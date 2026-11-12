const fs=require('fs'),os=require('os'),path=require('path'),{spawn}=require('child_process'),assert=require('assert/strict');
(async()=>{
  const work=fs.mkdtempSync(path.join(os.tmpdir(),'filerrrr-photo-bench-')),input=path.join(work,'photo.jpg'),profile=path.join(work,'profile');fs.mkdirSync(profile);
  const pixels=Buffer.alloc(1600*1000*3);let seed=1;for(let i=0;i<pixels.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;pixels[i]=seed>>>24;}
  await require('sharp')(pixels,{raw:{width:1600,height:1000,channels:3}}).jpeg({quality:90}).toFile(input);
  fs.writeFileSync(path.join(profile,'job.json'),JSON.stringify({inputs:[input],face:'formats',pick:'WEBP',options:{preferences:{image:'balanced'}}}));
  const started=performance.now(),child=spawn(path.resolve(__dirname,'../release/win-unpacked/Filerrrr.exe'),['--engine-worker'],{env:{...process.env,FILERRRR_WORKER_DATA:profile},stdio:'ignore',windowsHide:true});
  await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error(`Worker exited ${code}`)));});
  const elapsedMs=Math.round(performance.now()-started),result=JSON.parse(fs.readFileSync(path.join(profile,'result.json'),'utf8')).results[0];assert.ok(!result.error,result.error);assert.ok(fs.existsSync(result.output));
  console.log(JSON.stringify({fixture:'1.6 MP synthetic noise JPEG to balanced WEBP',elapsedMs,inputBytes:fs.statSync(input).size,outputBytes:fs.statSync(result.output).size}));fs.rmSync(work,{recursive:true,force:true,maxRetries:5,retryDelay:100});
})().catch(error=>{console.error(error);process.exitCode=1;});
