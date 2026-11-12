const fs = require('fs').promises, path = require('path');
const Features = require('./features.js'), Formats = require('./formats.js');
const cache = new Map();
const TEXT = new Set(['DOCX', 'TXT', 'HTML', 'MD']);

async function inspectFile(input) {
  try {
    const stat = await fs.stat(input);
    if (!stat.isFile()) throw new Error('Select a file, not a folder');
    await fs.access(input, require('fs').constants.R_OK);
    if (!stat.size) throw new Error('This file is empty');
    if (Formats.kindOfExt(Formats.extOf(input)) !== 'pdf') return {};
    if(!require('./engine-packs.cjs').status().canvas){const doc=await require('pdf-lib').PDFDocument.load(await fs.readFile(input));return {pages:doc.getPageCount(),textPages:0,requiresRenderEngine:true};}
    const key = `${input}:${stat.size}:${stat.mtimeMs}`;
    if (!cache.has(key)) {
      if (cache.size >= 32) cache.delete(cache.keys().next().value);
      const pending = require('./engines/pdf.cjs').inspect(input).catch(error => { cache.delete(key); throw error; });
      cache.set(key, pending);
    }
    return await cache.get(key);
  } catch (error) {
    if (error.code === 'ENOENT') return { error: 'This file no longer exists' };
    if (/password/i.test(error.message)) return { error: 'This PDF is password protected. Unlock it first.' };
    if (/invalid pdf|pdf structure|pdf header/i.test(error.message)) return { error: 'This PDF is damaged or is not a PDF file' };
    return { error: error.message.slice(0, 180) };
  }
}

async function inspect(paths, flags) {
  const ocr = flags?.ocr !== false && require('./engines/ocr.cjs').available();
  const ocrHelp=flags?.ocr===false?'Enable English scan recognition in Settings.':'Import the English OCR engine pack in Settings.';
  const options = Features.choicesFor(paths.map(Formats.extOf), flags), files = new Array(paths.length);
  const extended=require('./engines/extended.cjs'),engines=extended.status();
  const mediaAvailable=require('./engine-packs.cjs').status().media;
  const canvasAvailable=require('./engine-packs.cjs').status().canvas;
  const needsMedia=paths.some(file=>['video','audio','subtitle'].includes(Formats.kindOfExt(Formats.extOf(file)))||['bmp','ico','tga','ppm','pgm','pbm','pcx','jp2','dds','exr','hdr','qoi','sgi'].includes(Formats.extOf(file)));
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, paths.length) }, async () => {
    while (next < paths.length) { const i = next++; files[i] = { name: path.basename(paths[i]), ...await inspectFile(paths[i]) }; }
  }));
  const error = files.find(file => file.error);
  const scanned = files.some(file => file.pages && !file.textPages);
  options.choices = options.choices.map(choice => ({ ...choice, reason: choice.reason || (!mediaAvailable&&(needsMedia||['BMP','TGA','QOI','MP4','WEBM'].includes(choice.value))&&!(paths.every(file=>['srt','vtt'].includes(Formats.extOf(file)))&&['SRT','VTT'].includes(choice.value))?'Import the media engine pack in Settings to use this format.':error
    ? `${error.name}: ${error.error}` : scanned && !ocr && TEXT.has(choice.value) ? `No selectable text. ${ocrHelp}` : '') }));
  options.choices=options.choices.map(choice=>{const needed=paths.map(file=>extended.requirement(Formats.extOf(file),choice.value)).find(key=>key&&!engines[key]?.ready);return needed?{...choice,reason:`Configure the ${needed} converter in Settings → Additional formats`}:choice;});
  if(!canvasAvailable&&paths.some(file=>Formats.extOf(file)==='pdf'))options.choices=options.choices.map(choice=>['PNG','JPG'].includes(choice.value)?{...choice,reason:'Import the engine pack in Settings for PDF image rendering'}:choice);
  options.targets = options.targets.filter(value => !options.choices.find(choice => choice.value === value)?.reason);
  if (error) options.tools = [];
  if(!mediaAvailable&&needsMedia)options.tools=options.tools.filter(tool=>tool==='ZIP');
  const pdfPages = files.reduce((n,file)=>n+(file.pages||0),0), scannedPages = files.reduce((n,file)=>n+(file.pages ? file.pages-file.textPages : 0),0);
  return { ...options, files, ocr, note: error ? `${error.name}: ${error.error}` : scannedPages && ocr
    ? `${scannedPages} image-only ${scannedPages === 1 ? 'page' : 'pages'}: English OCR runs locally for document outputs. Review recognized text.`
    : scanned ? `Scanned PDF: JPG / PNG available. ${ocrHelp}` : pdfPages
      ? `${pdfPages} PDF pages checked.${scannedPages ? ' Scan recognition is off; image-only pages have no text.' : ' Existing text will be preserved.'}`
      : paths.some(file=>Formats.extOf(file)==='pptx')?'Built-in presentation export preserves slide text. Configure LibreOffice for full visual fidelity.':'Conversion routes checked for this selection.' };
}
module.exports = { inspect };
