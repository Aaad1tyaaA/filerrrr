const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto'),asar=require('@electron/asar');
const root=path.resolve(__dirname,'..'),archive=path.resolve(process.argv[2]||path.join(root,'release/win-unpacked/resources/app'));
const files=fs.readdirSync(root).filter(name=>/\.(cjs|js)$/.test(name));files.push('engine-pack-manifest.json','THIRD-PARTY-NOTICES.txt');
for(const folder of ['engines','renderer'])for(const name of fs.readdirSync(path.join(root,folder)))if(/\.(cjs|js|html|css)$/.test(name))files.push(`${folder}/${name}`);
const directory=fs.statSync(archive).isDirectory();
if(directory)assert.equal(JSON.parse(fs.readFileSync(path.join(archive,'package.json'),'utf8')).version,require('../package.json').version);
for(const file of files)assert.ok(fs.readFileSync(path.join(root,file)).equals(directory?fs.readFileSync(path.join(archive,file)):asar.extractFile(archive,file)),`Packaged source differs: ${file}`);
const dll=path.resolve(path.dirname(archive),'../filerrrr_drop.dll');assert.ok(fs.readFileSync(dll).equals(fs.readFileSync(path.join(root,'build/filerrrr_drop.dll'))),'native drop DLL matches source build');
const digest=crypto.createHash('sha256');for(const file of files){digest.update(file);digest.update(fs.readFileSync(path.join(root,file)));}console.log(JSON.stringify({archive,sourceFiles:files.length,runtimeSha256:digest.digest('hex')}));
