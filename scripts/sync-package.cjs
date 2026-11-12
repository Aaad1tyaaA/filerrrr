const fs=require('fs'),path=require('path');const root=path.resolve(__dirname,'..'),target=path.resolve(process.argv[2]||'');
const allowed=['release/win-unpacked','release-core/win-unpacked'].map(folder=>path.join(root,folder));if(!allowed.includes(target))throw new Error('Expected an owned prepared app folder');
const app=path.join(target,'resources','app');if(!fs.existsSync(path.join(app,'package.json')))throw new Error('Build the prepared package first');
for(const name of fs.readdirSync(root))if(/\.(cjs|js)$/.test(name)||['engine-pack-manifest.json','THIRD-PARTY-NOTICES.txt'].includes(name))fs.copyFileSync(path.join(root,name),path.join(app,name));
for(const folder of ['engines','renderer'])fs.cpSync(path.join(root,folder),path.join(app,folder),{recursive:true});
const meta=JSON.parse(fs.readFileSync(path.join(app,'package.json'),'utf8'));meta.version=require('../package.json').version;fs.writeFileSync(path.join(app,'package.json'),JSON.stringify(meta,null,2));
fs.copyFileSync(path.join(root,'build','filerrrr_drop.dll'),path.join(target,'filerrrr_drop.dll'));
// electron-builder caches payloads using the prepared folder's timestamp.
const now=new Date();fs.utimesSync(target,now,now);console.log('Synchronized runtime and invalidated package cache: '+target);
