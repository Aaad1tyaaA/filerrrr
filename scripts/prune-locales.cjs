const fs=require('fs'),path=require('path');
const root=fs.realpathSync(path.resolve(__dirname,'..')),target=path.resolve(process.argv[2]||'');
const allowed=['release/win-unpacked','release-core/win-unpacked'].map(relative=>path.join(root,relative));
if(!allowed.includes(target))throw new Error('Expected an owned packaged app folder');
const folder=fs.realpathSync(path.join(target,'locales'));if(path.relative(target,folder).startsWith('..'))throw new Error('Locales folder escapes packaged app');
let removed=0,bytes=0;for(const file of fs.readdirSync(folder))if(file.endsWith('.pak')&&!['en-US.pak','en-GB.pak'].includes(file)){const name=path.join(folder,file);bytes+=fs.lstatSync(name).size;fs.unlinkSync(name);removed++;}
console.log(JSON.stringify({target,removed,bytes}));
