// PDF in: pages to pictures (pdf.js + @napi-rs/canvas), text, and page tools (pdf-lib).
// PDF merging lives in image.cjs.
const fsp = require('fs').promises, path = require('path');
const { pathToFileURL } = require('url');
const sharp = require('sharp');
const { unpacked, esc } = require('./common.cjs');
const Job = require('./job.cjs');

const pkg = unpacked(path.dirname(require.resolve('pdfjs-dist/package.json')));
// PDF.js loads its canvas from outside ASAR. Use that same module so Path2D brands match in packaged builds.
let canvasModule;
let pdfjs;
// Returns pdf.js's loading task: await .promise for the document, end with .destroy().
async function open(input) {
  Job.check();
  pdfjs ||= await import(pathToFileURL(path.join(pkg, 'legacy', 'build', 'pdf.mjs')).href);
  const data = new Uint8Array(await fsp.readFile(input));
  return pdfjs.getDocument({ data, isEvalSupported: false, verbosity: 0, standardFontDataUrl: path.join(pkg, 'standard_fonts').replace(/\\/g, '/') + '/' });
}

async function renderPage(page, scale) {
  Job.check(); const signal=Job.currentSignal(); let render;
  if(!require('../engine-packs.cjs').status().canvas)throw new Error('Import the engine pack in Settings for PDF image rendering');
  canvasModule||=require(unpacked(require.resolve('@napi-rs/canvas')));const { createCanvas } = canvasModule;
  const base = page.getViewport({ scale: 1 });
  scale = Math.min(scale, Math.sqrt(24000000 / (base.width * base.height)), 16000 / Math.max(base.width, base.height));
  const vp = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height)), ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); // pages without a background stay white
  try {
    render=page.render({canvas,canvasContext:ctx,viewport:vp});
    const stop=()=>render.cancel();signal?.addEventListener('abort',stop,{once:true});
    try {if(signal?.aborted)stop();await render.promise;Job.check();return await canvas.encode('png');}
    finally{signal?.removeEventListener('abort',stop);}
  } finally { canvas.width = canvas.height = 0; }
}

// One picture per page at 144 dpi: name.png for a single page, name-p1.png … for more.
function exportOptions(options = {}) {
  return { dpi: [72, 144, 216, 300].includes(options?.dpi) ? options.dpi : 144,
    quality: Number.isInteger(options?.quality) && options.quality >= 50 && options.quality <= 100 ? options.quality : 90,
    ocr: options?.ocr !== false };
}
async function toImages(input, T, alloc, onProgress, options) {
  const { dpi, quality } = exportOptions(options);
  const task = await open(input), doc = await task.promise;
  try {
    const n = doc.numPages;
    for (let i = 1; i <= n; i++) {
      Job.check();
      const page = await doc.getPage(i), png = await renderPage(page, dpi / 72);
      const out = await alloc(T.toLowerCase(), n > 1 ? `-p${i}` : '');
      await (T === 'JPG' ? sharp(png).jpeg({ quality, mozjpeg: true }) : sharp(png).png({ compressionLevel: 6 })).toFile(out);
      page.cleanup(); onProgress && onProgress(i / n, {stage:`Exporting ${T}`,page:i,pages:n});
    }
  } finally { await task.destroy(); }
}

// First page as a PNG, for thumbnails where Windows has no PDF thumbnail provider.
async function firstPagePng(input, width = 480) {
  const task = await open(input), doc = await task.promise;
  try { const page = await doc.getPage(1); return await renderPage(page, width / page.getViewport({ scale: 1 }).width); } // await: finally must not close it mid-render
  finally { await task.destroy(); }
}

// The text of every page (a PDF has no paragraphs, only positioned text runs).
async function pagesText(input, onProgress = () => {}, options = {}) {
  const task = await open(input), doc = await task.promise;
  let recognizer, currentPage = 1;
  try {
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      Job.check();
      currentPage = i;
      const page = await doc.getPage(i), { items } = await page.getTextContent();
      let text = items.map(it => it.str + (it.hasEOL ? '\n' : '')).join('').trim();
      if (!text && options.ocr !== false) {
        const report = detail => onProgress((currentPage-1 + Math.min(1,Math.max(0,detail.progress || 0))) / doc.numPages,
          {page:currentPage,pages:doc.numPages,...detail});
        recognizer ||= await require('./ocr.cjs').create(report);
        report({stage:'Rendering scan for OCR',indeterminate:true});
        text = await recognizer.recognize(await renderPage(page,3));
      }
      pages.push(text); page.cleanup();
      onProgress(i / doc.numPages, { stage: 'Reading PDF', page: i, pages: doc.numPages, stageFraction: i / doc.numPages });
    }
    return pages;
  } finally { try { await recognizer?.close(); } finally { await task.destroy(); } }
}
async function inspect(input) {
  const task = await open(input), doc = await task.promise;
  try {
    let textPages = 0;
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i), text = await page.getTextContent();
      if (text.items.some(item => item.str?.trim())) textPages++;
      page.cleanup();
    }
    return { pages: doc.numPages, textPages };
  } finally { await task.destroy(); }
}
const requireText = (pages, options) => {
  if (!pages.some(text => text.trim())) throw new Error(options?.ocr === false
    ? 'This PDF has no selectable text. Enable English scan recognition in Features & settings, or choose JPG / PNG.'
    : 'No readable English text was found, even with OCR. Try a clearer scan or export JPG / PNG.');
  return pages;
};
async function toText(input, out, onProgress = () => {}, options = {}) {
  const pages = requireText(await pagesText(input, (f, detail) => onProgress(f * .9, detail), options),options);
  onProgress(.9, { stage: 'Writing TXT', indeterminate: true });
  await fsp.writeFile(out, pages.join('\n\n') + '\n', 'utf8');
}
// Paragraphs are runs of lines between blank lines; pages are separated by a rule.
async function toHtmlBody(input, onProgress, options = {}) {
  return requireText(await pagesText(input, onProgress, options), options).map(t => t.split(/\n\s*\n/).filter(Boolean).map(p => `<p>${esc(p).replace(/\n/g, ' ')}</p>`).join('')).join('<hr>');
}

// ---------- page tools ----------
async function loadDoc(input) { const { PDFDocument } = require('pdf-lib'); return PDFDocument.load(await fsp.readFile(input), { ignoreEncryption: true }); }
async function split(input, alloc) {
  const { PDFDocument } = require('pdf-lib');
  const src = await loadDoc(input), n = src.getPageCount();
  for (let i = 0; i < n; i++) {
    Job.check();
    const one = await PDFDocument.create();
    one.addPage((await one.copyPages(src, [i]))[0]);
    await fsp.writeFile(await alloc('pdf', `-p${i + 1}`), await one.save());
  }
}
async function rotate(input, out) {
  const { degrees } = require('pdf-lib');
  const doc = await loadDoc(input);
  doc.getPages().forEach(p => p.setRotation(degrees((p.getRotation().angle + 90) % 360)));
  await fsp.writeFile(out, await doc.save());
}
// Two pages side by side on landscape A4 sheets, scaled to fit; text stays vector.
async function twoUp(input, out) {
  const { PDFDocument } = require('pdf-lib');
  const src = await loadDoc(input), doc = await PDFDocument.create();
  const pages = await doc.embedPages(src.getPages());
  const W = 842, H = 595, half = W / 2, pad = 18;
  for (let i = 0; i < pages.length; i += 2) {
    const sheet = doc.addPage([W, H]);
    [pages[i], pages[i + 1]].forEach((p, k) => {
      if (!p) return;
      const s = Math.min((half - pad * 2) / p.width, (H - pad * 2) / p.height), w = p.width * s, h = p.height * s;
      sheet.drawPage(p, { x: k * half + (half - w) / 2, y: (H - h) / 2, width: w, height: h });
    });
  }
  await fsp.writeFile(out, await doc.save());
}
async function number(input, out) {
  const { StandardFonts, rgb } = require('pdf-lib');
  const doc = await loadDoc(input), font = await doc.embedFont(StandardFonts.Helvetica), pages = doc.getPages();
  pages.forEach((p, i) => {
    const label = `${i + 1} / ${pages.length}`, size = 9, w = font.widthOfTextAtSize(label, size);
    p.drawText(label, { x: (p.getWidth() - w) / 2, y: 18, size, font, color: rgb(.35, .35, .35) });
  });
  await fsp.writeFile(out, await doc.save());
}

async function selectPages(input,out,selection){const {PDFDocument}=require('pdf-lib'),src=await loadDoc(input),doc=await PDFDocument.create();const indices=require('../edits.cjs').pages(selection,src.getPageCount());Job.check();for(const page of await doc.copyPages(src,indices))doc.addPage(page);await fsp.writeFile(out,await doc.save());}
module.exports = { toImages, toText, toHtmlBody, pagesText, inspect, exportOptions, split, rotate, twoUp, number, firstPagePng,selectPages };
