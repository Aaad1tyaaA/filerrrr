const fs=require('fs'),os=require('os'),path=require('path'),{spawn}=require('child_process'),assert=require('assert/strict');
(async()=>{
  const work=fs.mkdtempSync(path.join(os.tmpdir(),'filerrrr-real-worker-')),input=path.join(work,'source.json');fs.writeFileSync(input,'{"packaged":true}');
  const exe=process.env.FILERRRR_SMOKE_EXE||path.resolve(__dirname,'../release/win-unpacked/Filerrrr.exe');
  const profile=path.join(work,'profile');fs.mkdirSync(profile);fs.writeFileSync(path.join(profile,'job.json'),JSON.stringify({inputs:[input],face:'formats',pick:'YAML',options:{}}));
  const child=spawn(exe,['--engine-worker'],{env:{...process.env,FILERRRR_WORKER_DATA:profile},stdio:'ignore',windowsHide:true});
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});assert.equal(code,0);
  const result=JSON.parse(fs.readFileSync(path.join(profile,'result.json'),'utf8')).results[0];assert.ok(!result.error,result.error);assert.match(fs.readFileSync(result.output,'utf8'),/packaged: true/);assert.equal(fs.readFileSync(input,'utf8'),'{"packaged":true}');
  fs.rmSync(work,{recursive:true,force:true,maxRetries:5,retryDelay:100});console.log('PASS: real packaged executable runs an isolated conversion worker and preserves the original');
})().catch(error=>{console.error(error);process.exitCode=1;});
