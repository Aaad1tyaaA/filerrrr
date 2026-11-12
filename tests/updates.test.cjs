const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const Updates=require('../updates.cjs'),config={...Updates.release,publisherName:['CN=Test Publisher, C=IN']};
class FakeUpdater extends EventEmitter {checks=0;downloads=0;installs=0;async checkForUpdates(){this.checks++;this.emit('checking-for-update');this.emit('update-available',{version:'9.0.0'});}async downloadUpdate(){this.downloads++;this.emit('download-progress',{percent:51});this.emit('update-downloaded',{version:'9.0.0'});}quitAndInstall(){this.installs++;}}
test('unsigned builds offer manual releases without loading an updater or requesting a certificate',async()=>{let loads=0;const service=Updates.create({packaged:true,config:null,load:()=>loads++});service.start(true);assert.equal(service.view().manual,true);assert.match(service.view().message,/Updates are manual/);assert.doesNotMatch(service.view().message,/certificate|sign.in|pay/i);assert.equal(service.view().releaseUrl,'https://github.com/Aaad1tyaaA/filerrrr-releases/releases');await service.check();await service.download();service.stop();assert.equal(loads,0);});
test('updates require a packaged app, the expected release host and a publisher identity',async()=>{
  for(const invalid of [null,{...config,publisherName:[]},{...config,owner:'other'},{...config,publisherName:['Test']}]){let loads=0;const service=Updates.create({packaged:true,config:invalid,load:()=>loads++});assert.equal((await service.check()).phase,'blocked');await service.download();assert.equal(loads,0);assert.throws(()=>service.install(),/verified/);}
  assert.equal((await Updates.create({packaged:false,config}).check()).phase,'blocked');
});
test('signed update flow checks, downloads and restarts only through explicit actions',async()=>{
  const fake=new FakeUpdater(),states=[],service=Updates.create({packaged:true,config,load:()=>fake,notify:state=>states.push(state)});service.start(false);assert.equal(service.view().phase,'idle');
  await service.check();assert.equal(service.view().phase,'available');assert.equal(fake.autoDownload,false);assert.equal(fake.autoInstallOnAppQuit,false);assert.equal(fake.allowDowngrade,false);assert.equal(fake.installs,0);assert.equal(fake.verifyUpdateCodeSignature,Updates.verifySignature);
  await service.download();assert.equal(service.view().phase,'ready');assert.ok(states.some(state=>state.percent===51));await service.check();assert.equal(fake.checks,1);service.install();assert.equal(fake.installs,1);service.stop();
});
test('update download and verification failure never reaches the install state',async()=>{
  const fake=new FakeUpdater(),service=Updates.create({packaged:true,config,load:()=>fake});fake.downloadUpdate=async()=>{throw new Error('Bad signature');};await service.check();await service.download();assert.equal(service.view().phase,'error');assert.throws(()=>service.install(),/verified/);assert.equal(fake.installs,0);
});
test('Windows signature verification rejects errors, invalid JSON, untrusted and different publishers',async()=>{
  const run=reply=>Updates.verifySignature(config.publisherName,"C:\\O'Neil\\Update.exe",(_exe,args,options,callback)=>{assert.equal(options.windowsHide,true);assert.ok(args.at(-1).includes("O''Neil"));callback(...reply);});
  assert.equal(await run([null,JSON.stringify({status:0,subject:config.publisherName[0]}),'']),null);
  for(const reply of [[new Error('PowerShell blocked'),'',''],[null,'invalid',''],[null,JSON.stringify({status:1,subject:config.publisherName[0]}),''],[null,JSON.stringify({status:0,subject:'CN=Other Publisher, C=IN'}),''],[null,JSON.stringify({status:0,subject:config.publisherName[0]}),'warning']])assert.equal(typeof await run(reply),'string');
});
test('signed Explorer registration uses normal user registration before unsigned fallback',()=>{const script=require('../topmenu.cjs').registerScript('C:\\Filerrrr');assert.match(script,/Get-AuthenticodeSignature/);assert.match(script,/Status -eq 'Valid'/);const signed=script.slice(0,script.indexOf('} else'));assert.doesNotMatch(signed,/RunAs|AllowUnsigned/);});
