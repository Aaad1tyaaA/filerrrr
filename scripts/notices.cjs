const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),visited=new Set(),rows=[];
function scan(folder){if(!fs.existsSync(folder))return;for(const name of fs.readdirSync(folder).sort()){if(name.startsWith('.'))continue;const dir=path.join(folder,name);if(!fs.statSync(dir).isDirectory())continue;if(name.startsWith('@')){scan(dir);continue;}const packageFile=path.join(dir,'package.json');if(!fs.existsSync(packageFile))continue;
  const pkg=JSON.parse(fs.readFileSync(packageFile,'utf8')),key=`${pkg.name}@${pkg.version}`;if(!visited.has(key)){visited.add(key);const files=fs.readdirSync(dir).filter(file=>/^(licen[cs]e|copying|notice)([.-].*)?$/i.test(file)&&fs.statSync(path.join(dir,file)).isFile());
    rows.push(`${key}\nDeclared licence: ${typeof pkg.license==='string'?pkg.license:JSON.stringify(pkg.license||'See upstream licence')}\n${pkg.homepage||pkg.repository?.url||''}\n`+files.map(file=>`\n--- ${file} ---\n${fs.readFileSync(path.join(dir,file),'utf8')}`).join('\n'));}
  scan(path.join(dir,'node_modules'));
}}
scan(path.join(root,'node_modules'));fs.writeFileSync(path.join(root,'THIRD-PARTY-NOTICES.txt'),'Filerrrr third-party notices\n\nThis distribution contains independent third-party libraries and engines. Their respective licence terms follow. Optional external converters remain separate installations. No licence grants for third-party converters are implied.\n\n'+rows.join('\n\n'+'='.repeat(72)+'\n\n'));
console.log(`Generated notices for ${rows.length} dependency versions`);
