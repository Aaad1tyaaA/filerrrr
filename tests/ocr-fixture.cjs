// A raster-only invoice and a mixed PDF; no PDF text objects exist on the scanned page.
module.exports = async function makeOcrFixture(file, load = require, mixed = false) {
  const fs = require('fs');
  const { createCanvas } = load('@napi-rs/canvas');
  const { PDFDocument, StandardFonts } = load('pdf-lib');
  const canvas = createCanvas(1400,800), context = canvas.getContext('2d');
  context.fillStyle = '#fff'; context.fillRect(0,0,1400,800);
  context.fillStyle = '#111'; context.font = 'bold 54px Arial';
  context.fillText('SCANNED INVOICE',90,135);
  context.font = '42px Arial';
  context.fillText('Account number 48291',90,255);
  context.fillText('Total amount 1250.00',90,355);
  context.fillText('Thank you for your payment.',90,480);
  const png = await canvas.encode('png'); canvas.width = canvas.height = 0;
  const doc = await PDFDocument.create(), image = await doc.embedPng(png);
  doc.addPage([700,400]).drawImage(image,{x:0,y:0,width:700,height:400});
  if (mixed) {
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.addPage([700,400]).drawText('Existing text remains intact.',{x:50,y:200,size:20,font});
  }
  fs.writeFileSync(file,await doc.save()); return file;
};
