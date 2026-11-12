const fs=require('fs'),path=require('path'),{execFile}=require('child_process');
const release={provider:'github',owner:'Aaad1tyaaA',repo:'filerrrr-releases'};
const releaseUrl=`https://github.com/${release.owner}/${release.repo}/releases`;
function policy(config){return config?.provider===release.provider&&config.owner===release.owner&&config.repo===release.repo&&Array.isArray(config.publisherName)&&config.publisherName.length>0&&config.publisherName.every(name=>typeof name==='string'&&name.startsWith('CN=')&&name.length<2000);}
function readConfig(resources){try{const value=require('js-yaml').load(fs.readFileSync(path.join(resources,'app-update.yml'),'utf8'));if(typeof value?.publisherName==='string')value.publisherName=[value.publisherName];return value;}catch{return null;}}
// Fail closed if Windows cannot validate the signature; the updater's legacy fallback is not used.
function verifySignature(names,file,execute=execFile){return new Promise(resolve=>{
  if(!Array.isArray(names)||!names.length||typeof file!=='string')return resolve('Missing publisher identity');
  const quoted=file.replace(/'/g,"''"),command=`$ErrorActionPreference='Stop'; $s=Get-AuthenticodeSignature -LiteralPath '${quoted}'; [pscustomobject]@{status=[int]$s.Status;subject=$s.SignerCertificate.Subject} | ConvertTo-Json -Compress`;
  execute('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,timeout:30000},(error,out,err)=>{
    if(error||String(err||'').trim())return resolve('Windows could not verify the update signature');
    try{const signature=JSON.parse(out);resolve(signature.status===0&&typeof signature.subject==='string'&&names.some(name=>name.toLowerCase()===signature.subject.toLowerCase())?null:'Update is not signed by the configured publisher');}catch{resolve('Invalid signature-verification response');}
  });
});}
function create({packaged,config,load=()=>require('electron-updater').autoUpdater,notify=()=>{},log=()=>{}}){
  const ready=packaged&&policy(config);
  let updater,state={phase:ready?'idle':'blocked',manual:!ready,message:ready?'Ready to check for signed updates.':'Updates are manual. Download the latest installer from Releases.'},timer,first,checking=false;
  const send=patch=>{state={...state,...patch};notify(view());},view=()=>({...state,releaseUrl});
  function prepare(){if(!packaged||!policy(config))return false;if(updater)return true;updater=load();updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.allowPrerelease=false;updater.allowDowngrade=false;updater.verifyUpdateCodeSignature=verifySignature;
    updater.on('checking-for-update',()=>send({phase:'checking',message:'Checking for updates…'}));
    updater.on('update-not-available',()=>send({phase:'latest',message:'You have the latest signed release.'}));
    updater.on('update-available',info=>send({phase:'available',version:info.version,message:`Version ${info.version} is available. Download when ready.`}));
    updater.on('download-progress',info=>send({phase:'downloading',percent:Math.max(0,Math.min(100,Math.round(info.percent||0))),message:`Downloading update: ${Math.round(info.percent||0)}%`}));
    updater.on('update-downloaded',info=>send({phase:'ready',version:info.version,message:`Version ${info.version} is ready. Restart when your work is finished.`}));
    updater.on('error',error=>{log('updater',error);send({phase:'error',message:'Update failed. Try again or open Releases.'});});
    send({phase:'idle',message:'Signed updates are ready to check.'});return true;
  }
  async function check(){if(!prepare()||checking||['downloading','ready'].includes(state.phase))return view();checking=true;try{await updater.checkForUpdates();}catch(error){log('updater check',error);send({phase:'error',message:'Could not check for updates. Try again or open Releases.'});}finally{checking=false;}return view();}
  async function download(){if(!prepare()||state.phase!=='available')return view();send({phase:'downloading',percent:0,message:'Downloading update…'});try{await updater.downloadUpdate();}catch(error){log('updater download',error);send({phase:'error',message:'Download or signature verification failed. No update was installed.'});}return view();}
  function stop(){clearInterval(timer);clearTimeout(first);}
  function start(enabled){stop();if(enabled&&prepare()){first=setTimeout(()=>check(),15000);timer=setInterval(()=>check(),12*60*60*1000);first.unref?.();timer.unref?.();}}
  return {view,check,download,start,stop,install(){if(!prepare()||state.phase!=='ready')throw new Error('No verified update is ready');updater.quitAndInstall(false,true);}};
}
module.exports={release,releaseUrl,policy,readConfig,verifySignature,create};
