// Optional engine packs live outside the application archive.
const path=require('path'),fs=require('fs'),Module=require('module');
const core=path.join(process.env.FILERRRR_ENGINE_ROOT||'','tesseract.js-core');
if(fs.existsSync(path.join(core,'package.json'))){
  const resolve=Module._resolveFilename;
  Module._resolveFilename=function(request,...rest){return request.startsWith('tesseract.js-core/')?path.join(core,`${request.slice('tesseract.js-core/'.length)}.js`):resolve.call(this,request,...rest);};
}
require('tesseract.js/src/worker-script/node/index.js');
