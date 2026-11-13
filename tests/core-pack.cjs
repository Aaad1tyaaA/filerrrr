process.env.FILERRRR_NO_SYSTEM_ENGINES='1'; // this PC may have its own FFmpeg on PATH
const {app}=require('electron'),fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert/strict'),{createRequire}=require('module');
const archive=path.resolve(__dirname,'../release/win-unpacked/resources/app'),packed=createRequire(path.join(archive,'main.cjs'));
app.whenReady().then(async()=>{
  const work=fs.mkdtempSync(path.join(os.tmpdir(),'filerrrr-core-check-'));let failed=false;
  try{
    const packs=packed('./engine-packs.cjs');packs.configure(path.join(work,'engines'));
    assert.equal(packs.status().media,false);assert.equal(packs.status().ocr,false);assert.equal(packs.status().canvas,false);
    const input=path.join(work,'source.json');fs.writeFileSync(input,'{"core":true}');const [base]=await packed('./convert.cjs').run([input],'formats','YAML');assert.ok(!base.error,base.error);
    const {PDFDocument,StandardFonts}=packed('pdf-lib'),doc=await PDFDocument.create();doc.addPage().drawText('Plain text PDF',{x:50,y:700,size:14,font:await doc.embedFont(StandardFonts.Helvetica)});
    const textPdf=path.join(work,'text.pdf');fs.writeFileSync(textPdf,await doc.save());
    const textCaps=await packed('./capabilities.cjs').inspect([textPdf]);// text PDFs convert to documents with no engines installed
    for(const target of ['DOCX','MD','TXT','HTML'])assert.equal(textCaps.choices.find(choice=>choice.value===target).reason,'',`${target} must be available for a text PDF`);
    const [md]=await packed('./convert.cjs').run([textPdf],'formats','MD');assert.match(fs.readFileSync(md.output,'utf8'),/Plain text PDF/);
    const preflightScan=await require('./ocr-fixture.cjs')(path.join(work,'scan.pdf'));
    const checked=await packed('./capabilities.cjs').inspect([preflightScan]);assert.match(checked.choices.find(choice=>choice.value==='DOCX').reason,/Settings → Engines/);
    for(const id of ['media','render','ocr'])await packs.install(path.resolve(__dirname,'../release/engines',require('../engine-pack-manifest.json').packs[id].zip));
    assert.equal(packs.status().media,true);assert.equal(packs.status().ocr,true);
    const canvas=packed('@napi-rs/canvas').createCanvas(20,20),png=path.join(work,'picture.png');fs.writeFileSync(png,canvas.toBuffer('image/png'));
    const [bmp]=await packed('./convert.cjs').run([png],'formats','BMP');assert.ok(!bmp.error,bmp.error);assert.equal(fs.readFileSync(bmp.output).subarray(0,2).toString(),'BM');
    const scan=preflightScan;
    const [word]=await packed('./convert.cjs').run([scan],'formats','DOCX');assert.ok(!word.error,word.error);assert.match((await packed('mammoth').extractRawText({path:word.output})).value,/48291/);
    console.log('PASS: core edition works without optional engines; approved pack import restores FFmpeg and offline OCR');
  }catch(error){failed=true;console.error(error.stack||error);}
  finally{for(const name of fs.readdirSync(work))if(name!=='engines')fs.rmSync(path.join(work,name),{recursive:true,force:true,maxRetries:5,retryDelay:100});console.log(`Engine test folder (native DLL is locked until process exit): ${work}`);app.exit(failed?1:0);}
});
