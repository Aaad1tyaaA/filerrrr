// Pictures: sharp (libvips) for most; heic-decode for HEIC; ag-psd for Photoshop; FFmpeg decodes the older formats
// (BMP, ICO, TGA, PPM, PCX, JPEG 2000, DDS, EXR, HDR, QOI, SGI) and writes BMP, TGA and QOI; imagetracerjs traces to SVG.
const fsp = require('fs').promises;
const sharp = require('sharp');
const { ffmpeg } = require('./common.cjs');
const F = require('../formats.js');

const VIA_FFMPEG = ['bmp', 'ico', 'tga', 'ppm', 'pgm', 'pbm', 'pcx', 'jp2', 'dds', 'exr', 'hdr', 'qoi', 'sgi'];

async function load(input, { animated = false } = {}) {
  const ext = F.norm(F.extOf(input));
  if (ext === 'heic') {
    const decode = require('heic-decode');
    const { width, height, data } = await decode({ buffer: await fsp.readFile(input) });
    return sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), { raw: { width, height, channels: 4 } });
  }
  if (ext === 'psd') {
    const agPsd = require('ag-psd');
    agPsd.initializeCanvas((w, h) => require('@napi-rs/canvas').createCanvas(w, h)); // ag-psd asks for one even for the flat picture
    const psd = agPsd.readPsd(await fsp.readFile(input), { skipLayerImageData: true, skipThumbnail: true, useImageData: true });
    if (!psd.imageData) throw new Error('This PSD has no flattened picture saved in it (turn on "Maximize compatibility" in Photoshop)');
    const { width, height, data } = psd.imageData;
    return sharp(Buffer.from(data.buffer, data.byteOffset, data.byteLength), { raw: { width, height, channels: 4 } });
  }
  if (VIA_FFMPEG.includes(ext)) return sharp(await ffmpeg(['-i', input, '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', 'pipe:1']));
  if (ext === 'svg') return sharp(input, { density: 192 });
  return sharp(input, { autoOrient: true, animated: animated && (ext === 'gif' || ext === 'webp'), limitInputPixels: 268402689 });
}

function icoFromPng(png) { // ICO container holding one 256 px PNG
  const h = Buffer.alloc(22);
  h.writeUInt16LE(1, 2); h.writeUInt16LE(1, 4); h.writeUInt16LE(1, 10); h.writeUInt16LE(32, 12);
  h.writeUInt32LE(png.length, 14); h.writeUInt32LE(22, 18);
  return Buffer.concat([h, png]);
}

// Raster → SVG paths (colour tracing). Big pictures are scaled down first: tracing time grows with the pixel count.
async function trace(img, out) {
  const { data, info } = await img.resize(1200, 1200, { fit: 'inside', withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const ImageTracer = require('imagetracerjs');
  const svg = ImageTracer.imagedataToSVG({ width: info.width, height: info.height, data: new Uint8ClampedArray(data) },
    { numberofcolors: 24, pathomit: 4, ltres: 1, qtres: 1, roundcoords: 1, viewbox: true, strokewidth: 0 });
  await fsp.writeFile(out, svg);
}

async function encode(img, T, out, quality = 82) {
  const viaPng = async codec => ffmpeg(['-f', 'png_pipe', '-i', 'pipe:0', '-c:v', codec, out], null, await img.png().toBuffer());
  switch (T) {
    case 'JPG': return img.flatten({ background: '#ffffff' }).jpeg({ quality, mozjpeg: true }).toFile(out);
    case 'PNG': return img.png({ compressionLevel: 9, palette: quality < 80 }).toFile(out);
    case 'WEBP': return img.webp({ quality }).toFile(out);
    case 'AVIF': return img.avif({ quality: Math.round(quality * .65) }).toFile(out);
    case 'TIFF': return img.tiff({ compression: 'lzw' }).toFile(out);
    case 'GIF': return img.gif().toFile(out);
    case 'BMP': return viaPng('bmp');
    case 'TGA': return viaPng('targa');
    case 'QOI': return viaPng('qoi');
    case 'SVG': return trace(img, out);
    case 'ICO': return fsp.writeFile(out, icoFromPng(await img.resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()));
    case 'PDF': return imagesToPdf([img], out);
  }
  throw new Error(`Can't write ${T}`);
}

async function convert(input, T, out,options={},edit={}) {
  let img=await load(input, { animated: T === 'GIF' || T === 'WEBP' });
  if(edit.crop){const m=await img.metadata(),c=edit.crop;if(c.left+c.width>(m.autoOrient?.width||m.width)||c.top+c.height>(m.autoOrient?.height||m.height))throw new Error('Crop rectangle extends outside the image');img=img.extract(c);}
  if(edit.resize)img=img.resize({width:edit.resize,withoutEnlargement:true});if(edit.stripMetadata===false)img=img.keepMetadata();
  return encode(img,T,out,({small:60,balanced:82,best:95})[options.image]||82);
}

const SAME = { jpg: 'JPG', png: 'PNG', webp: 'WEBP', avif: 'AVIF', tiff: 'TIFF', gif: 'GIF', bmp: 'BMP', tga: 'TGA', qoi: 'QOI' };
const toolFormat = input => SAME[F.norm(F.extOf(input))] || 'PNG'; // HEIC, SVG, PSD, ICO … come back as PNG
async function tool(input, pick, out) {
  let img = await load(input);
  const m = ['HALF', 'DBL', 'SQR'].includes(pick) ? await img.metadata() : null;
  const w = m && (m.autoOrient?.width || m.width), h = m && (m.autoOrient?.height || m.height);
  if (pick === 'ROT') img = img.rotate(90);
  if (pick === 'FLIP') img = img.flop();
  if (pick === 'GRAY') img = img.grayscale();
  if (pick === 'HALF') img = img.resize(Math.max(1, Math.round(w / 2)));
  if (pick === 'DBL') img = img.resize(Math.min(w * 2, 16000), null, { kernel: 'lanczos3' }).sharpen({ sigma: .6 });
  if (pick === 'SQR') { const s = Math.min(w, h); img = img.resize(s, s, { fit: 'cover', position: 'attention' }); } // keeps the busiest part
  // sharp drops EXIF/GPS unless asked to keep it, so every tool also cleans metadata; CLN re-encodes at high quality
  return encode(img, toolFormat(input), out, pick === 'MINI' ? 60 : pick === 'CLN' ? 92 : 82);
}

// pages: sharp images or { pdf: bytes } for PDF inputs
async function imagesToPdf(items, out) {
  const { PDFDocument } = require('pdf-lib');
  const doc = await PDFDocument.create();
  for (const item of items) {
    if (item && item.pdf) {
      const src = await PDFDocument.load(item.pdf, { ignoreEncryption: true });
      (await doc.copyPages(src, src.getPageIndices())).forEach(p => doc.addPage(p));
      continue;
    }
    const { data, info } = await item.flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });
    const jpg = await doc.embedJpg(data), w = info.width * .75, h = info.height * .75; // 96 dpi pixels → points
    doc.addPage([w, h]).drawImage(jpg, { x: 0, y: 0, width: w, height: h });
  }
  await fsp.writeFile(out, await doc.save());
}

module.exports = { load, convert, tool, toolFormat, imagesToPdf };
