// Verify the files inside the finished NSIS installer, including cached-payload regressions.
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict'),crypto=require('crypto'),{spawnSync}=require('child_process');
(async()=>{
  const installer=path.resolve(process.argv[2]||''),root=path.resolve(__dirname,'..');
  assert.ok(installer.startsWith(root+path.sep)&&installer.endsWith('.exe'),'Expected a workspace installer');
  const work=fs.mkdtempSync(path.join(os.tmpdir(),'filerrrr-installer-payload-'));
  const files=fs.readdirSync(root).filter(name=>/\.(cjs|js)$/.test(name));files.push('package.json','engine-pack-manifest.json','THIRD-PARTY-NOTICES.txt');
  for(const folder of ['engines','renderer'])for(const name of fs.readdirSync(path.join(root,folder)))if(/\.(cjs|js|html|css)$/.test(name))files.push(`${folder}/${name}`);
  const archive=await require('app-builder-lib/out/toolsets/7zip').getPath7za();
  const extract=spawnSync(archive,['x',installer,`-o${work}`,'-y',...files.map(file=>path.join('resources','app',file)),'filerrrr_drop.dll'],{windowsHide:true,encoding:'utf8',maxBuffer:4*1024*1024});
  assert.ok(extract.status===0||extract.status===1,extract.stderr||extract.stdout);
  const verify=spawnSync(process.execPath,[path.join(__dirname,'package-sources.cjs'),path.join(work,'resources','app')],{encoding:'utf8',windowsHide:true});
  assert.equal(verify.status,0,verify.stderr||verify.stdout);
  const bytes=fs.readFileSync(installer);console.log(JSON.stringify({installer,bytes:bytes.length,MiB:+(bytes.length/1048576).toFixed(2),sha256:crypto.createHash('sha256').update(bytes).digest('hex'),payload:JSON.parse(verify.stdout),extractedEvidence:work}));
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
