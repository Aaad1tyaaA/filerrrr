// After packaging: electron tests/packaged-pdf.cjs. Source-only tests cannot catch ASAR canvas-brand mismatches.
const { app, shell } = require('electron');
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert/strict');
const { createRequire } = require('module');
const archive = process.env.FILERRRR_SMOKE_ARCHIVE || path.resolve(__dirname, '../release/win-unpacked/resources/app');
const packaged = createRequire(path.join(archive, 'main.cjs'));
app.whenReady().then(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'filerrrr-packaged-pdf-'));
  let failed = false;
  try {
    const { PDFDocument, StandardFonts } = packaged('pdf-lib');
    const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
    for (let i = 1; i <= 20; i++) doc.addPage([200,200]).drawText(`Page ${i}`,{font,x:20,y:100});
    const input = path.join(dir,'text.pdf'); fs.writeFileSync(input,await doc.save());
    const options = await packaged('./capabilities.cjs').inspect([input]);
    assert.ok(options.targets.includes('DOCX'));
    assert.equal(options.files[0].pages,20);
    const png = await packaged('./engines/pdf.cjs').firstPagePng(input,300);
    assert.equal((await packaged('sharp')(png).metadata()).format,'png');
    const [jpg] = await packaged('./convert.cjs').run([input],'formats','JPG');
    assert.ok(!jpg.error,jpg.error); assert.equal(jpg.outputs.length,20);
    const scan = path.join(dir,'scan.pdf'), scanned = await PDFDocument.create();
    scanned.addPage([200,200]).drawRectangle({x:30,y:30,width:70,height:70}); fs.writeFileSync(scan,await scanned.save());
    const scanOptions = await packaged('./capabilities.cjs').inspect([scan],{ocr:false});
    assert.ok(!scanOptions.targets.includes('DOCX')); assert.ok(scanOptions.targets.includes('PNG'));
    const [image] = await packaged('./convert.cjs').run([scan],'formats','PNG',()=>{},{dpi:72});
    assert.ok(!image.error,image.error); assert.equal((await packaged('sharp')(image.output).metadata()).width,200);
    const invoice = await require('./ocr-fixture.cjs')(path.join(dir,'invoice.pdf'),packaged,true);
    const enabled = await packaged('./capabilities.cjs').inspect([invoice]);
    assert.equal(enabled.ocr,true); assert.ok(enabled.targets.includes('DOCX'));
    const controller=new AbortController();
    const [cancelled]=await packaged('./convert.cjs').run([invoice],'formats','DOCX',(_fraction,detail)=>{
      if(detail.stage==='Recognizing text (English)')controller.abort();
    },{signal:controller.signal});
    assert.equal(cancelled.cancelled,true);assert.ok(!fs.readdirSync(dir).some(name=>name.startsWith('.filerrrr-')));
    const stages = [];
    const [word] = await packaged('./convert.cjs').run([invoice],'formats','DOCX',(_fraction,detail)=>stages.push(detail));
    assert.ok(!word.error,word.error);
    const recognized = (await packaged('mammoth').extractRawText({path:word.output})).value;
    assert.match(recognized,/48291/); assert.match(recognized,/Existing text remains intact/);
    assert.ok(stages.some(stage=>stage.stage==='Recognizing text (English)'&&stage.page===1));
    const undo=packaged('./undo.cjs').createUndo({trash:file=>shell.trashItem(file)}),receipt=await undo.register([word],1);
    const undone=await undo.undo(receipt.token,1);assert.deepEqual([...undone.undone],[word.output]);
    assert.ok(!fs.existsSync(word.output));assert.ok(fs.existsSync(invoice));
    console.log('PASS: packaged PDF rendering, export settings, offline scan-to-Word OCR, OCR cancellation and native Recycle Bin Undo');
  } catch (error) { failed = true; console.error(error.stack || error); }
  finally {
    assert.equal(path.dirname(dir),os.tmpdir());
    fs.rmSync(dir,{recursive:true,force:true}); app.exit(failed ? 1 : 0);
  }
});
