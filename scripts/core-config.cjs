const fs=require('fs'),path=require('path'),{build}=require('../package.json');
const config={...build,compression:'maximum',directories:{...build.directories,output:'release-core'},nsis:{...build.nsis,differentialPackage:false,artifactName:'Filerrrr-Core-Setup-${version}.${ext}'},files:[...build.files,
  '!node_modules/@napi-rs/canvas-win32-x64-msvc/*.node','!node_modules/@napi-rs/canvas-win32-x64-msvc/icudtl.dat',
  '!node_modules/**/.v8-cache/**','!node_modules/**/docimages/**','!node_modules/**/.yarn/**','!node_modules/**/test/**','!node_modules/**/tests/**',
  '!node_modules/exceljs/dist/**','!node_modules/pdf-lib/dist/**','!node_modules/ag-psd/dist/**','!node_modules/libheif-js/libheif-wasm/**',
  '!node_modules/ffmpeg-static/ffmpeg.exe','!node_modules/@tesseract.js-data/eng/**/*.traineddata.gz',
  '!node_modules/tesseract.js-core/tesseract-core*','!node_modules/pdfjs-dist/web/**','!node_modules/pdfjs-dist/legacy/web/**',
  '!node_modules/pdfjs-dist/build/**','!node_modules/pdfjs-dist/types/**','!node_modules/**/*.map']};
const output=path.resolve(__dirname,'../build/core-builder.json');fs.writeFileSync(output,JSON.stringify(config,null,2));console.log(output);
