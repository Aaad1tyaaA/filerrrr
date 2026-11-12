// Documents, e-books and e-mail. Every input is read into HTML first (DOCX: mammoth, Markdown: marked,
// EPUB: its chapters, EML: postal-mime, PDF: its text), then written as PDF (Chromium, scripts off), DOCX
// (html-to-docx), Markdown (turndown), text, HTML or EPUB (built here with jszip).
const fsp = require('fs').promises, path = require('path');
const { tmpDir, esc } = require('./common.cjs');

const PAGE_CSS = `
  @page { size: A4; margin: 18mm 16mm; }
  html { font: 11pt/1.55 "Segoe UI", system-ui, sans-serif; color: #1a1a1a; }
  body { margin: 0; }
  h1, h2, h3 { line-height: 1.25; margin: 1.2em 0 .5em; } h1 { font-size: 22pt; } h2 { font-size: 16pt; } h3 { font-size: 13pt; }
  p, ul, ol, table, pre, blockquote { margin: 0 0 .8em; }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 9.5pt; }
  td, th { border: 1px solid #ccc; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #f3f3f3; }
  pre, code { font-family: "Cascadia Mono", Consolas, monospace; font-size: 9.5pt; }
  pre { white-space: pre-wrap; word-wrap: break-word; background: #f6f6f6; padding: 8px 10px; border-radius: 4px; }
  blockquote { border-left: 3px solid #ccc; padding-left: 10px; color: #555; }
  .mail-head { border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-bottom: 14px; font-size: 10pt; color: #444; }
  .mail-head b { color: #111; }`;
const page = (body, title) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PAGE_CSS}</style></head><body>${body}</body></html>`;
const bodyOf = html => (/<body[^>]*>([\s\S]*)<\/body>/i.exec(html) || [, html])[1];
const titleOf = (html, fallback) => (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [, fallback])[1].trim() || fallback;
const textToHtml = text => text.replace(/\r\n?/g, '\n').split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('\n');

// ---------- readers: file → { title, body } ----------
async function readEpub(input) {
  const JSZip = require('jszip'), { XMLParser } = require('fast-xml-parser');
  const zip = await JSZip.loadAsync(await fsp.readFile(input));
  const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
  const container = xml.parse(await zip.file('META-INF/container.xml').async('string'));
  const rootfiles = [].concat(container.container.rootfiles.rootfile);
  const opfPath = rootfiles[0]['full-path'], base = path.posix.dirname(opfPath);
  const opf = xml.parse(await zip.file(opfPath).async('string')).package;
  const items = Object.fromEntries([].concat(opf.manifest.item).map(i => [i.id, i]));
  const title = [].concat(opf.metadata?.['dc:title'] ?? '')[0];
  const chapters = [];
  for (const ref of [].concat(opf.spine.itemref)) {
    const item = items[ref.idref]; if (!item || !/x?html/.test(item['media-type'])) continue;
    const file = path.posix.join(base, decodeURIComponent(item.href)), dir = path.posix.dirname(file);
    let body = bodyOf(await zip.file(file)?.async('string') || '');
    // pictures are files inside the book; inline them so the result stands alone
    for (const m of [...body.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)]) {
      const pic = zip.file(path.posix.normalize(path.posix.join(dir, decodeURIComponent(m[1]))));
      if (pic) body = body.replace(m[1], `data:image/${/\.png$/i.test(m[1]) ? 'png' : /\.svg$/i.test(m[1]) ? 'svg+xml' : /\.gif$/i.test(m[1]) ? 'gif' : 'jpeg'};base64,${await pic.async('base64')}`);
    }
    chapters.push(body);
  }
  return { title: typeof title === 'object' ? title['#text'] : title, body: chapters.join('\n<hr>\n') };
}

async function readEml(input) {
  const PostalMime = require('postal-mime').default || require('postal-mime');
  const mail = await PostalMime.parse(await fsp.readFile(input));
  const who = a => [].concat(a || []).map(x => x.name ? `${x.name} <${x.address}>` : x.address).join(', ');
  const rows = [['From', who(mail.from)], ['To', who(mail.to)], ['Cc', who(mail.cc)], ['Date', mail.date ? new Date(mail.date).toLocaleString() : ''], ['Subject', mail.subject]]
    .filter(r => r[1]).map(([k, v]) => `<div><b>${k}:</b> ${esc(v)}</div>`).join('');
  const files = (mail.attachments || []).filter(a => a.disposition !== 'inline').map(a => esc(a.filename || 'attachment'));
  const content = mail.html ? bodyOf(mail.html).replace(/<script[\s\S]*?<\/script>/gi, '') : textToHtml(mail.text || '');
  return { title: mail.subject || 'E-mail', body: `<div class="mail-head">${rows}${files.length ? `<div><b>Attachments:</b> ${files.join(', ')}</div>` : ''}</div>${content}` };
}

async function read(input, ext, onProgress, options) {
  const name = path.basename(input, path.extname(input));
  if (ext === 'docx') return { title: name, body: (await require('mammoth').convertToHtml({ path: input })).value };
  if (ext === 'epub') { const r = await readEpub(input); return { title: r.title || name, body: r.body }; }
  if (ext === 'eml') return readEml(input);
  if (ext === 'pdf') return { title: name, body: await require('./pdf.cjs').toHtmlBody(input, onProgress, options) };
  const text = await fsp.readFile(input, 'utf8');
  if (ext === 'md') { const { marked } = require('marked'); return { title: name, body: marked.parse(text, { async: false }) }; }
  if (ext === 'txt') return { title: name, body: textToHtml(text) };
  if (ext === 'html') return { title: titleOf(text, name), body: bodyOf(text).replace(/<script[\s\S]*?<\/script>/gi, '') };
  throw new Error(`Can't read .${ext}`);
}

// ---------- writers ----------
function htmlToText(html) {
  const ents = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return html.replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h[1-6]|li|tr|blockquote|pre|section|article)>/gi, '\n').replace(/<li[^>]*>/gi, '• ').replace(/<hr[^>]*>/gi, '\n---\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(parseInt(e.slice(e[1] === 'x' || e[1] === 'X' ? 2 : 1), e[1] === 'x' || e[1] === 'X' ? 16 : 10)) : ents[e.toLowerCase()] ?? m)
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
const toMarkdown = html => {
  const TurndownService = require('turndown');
  return new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' }).remove(['script', 'style']).turndown(html) + '\n';
};
async function toDocx(body, title, out) {
  const HTMLtoDOCX = require('html-to-docx');
  await fsp.writeFile(out, await HTMLtoDOCX(page(body, title), null, { title, table: { row: { cantSplit: true } }, footer: false, pageNumber: false }));
}

// Prints an HTML file to PDF with Chromium. Only available inside the Electron app.
async function printPdf(htmlFile, out) {
  const Job=require('./job.cjs'),signal=Job.currentSignal();Job.check();
  let electron; try { electron = require('electron'); } catch { /* plain Node */ }
  if (!electron || typeof electron !== 'object' || !electron.BrowserWindow) throw new Error('PDF printing needs the Filerrrr app');
  const win = new electron.BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true, images: true } });
  const abort=()=>{if(!win.isDestroyed())win.destroy();};signal?.addEventListener('abort',abort,{once:true});
  try {
    if(signal?.aborted)abort();Job.check();
    await win.loadFile(htmlFile);
    await fsp.writeFile(out, await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true }));
  } finally { signal?.removeEventListener('abort',abort);if(!win.isDestroyed())win.destroy(); }
}
async function htmlToPdf(html, out) {
  const dir = await tmpDir(), file = path.join(dir, 'page.html');
  try { await fsp.writeFile(file, html); await printPdf(file, out); } finally { await fsp.rm(dir, { recursive: true, force: true }); }
}

// HTML → well-formed XHTML for EPUB (void tags closed, named entities made numeric).
function xhtml(html) {
  const named = { nbsp: 160, copy: 169, reg: 174, mdash: 8212, ndash: 8211, hellip: 8230, lsquo: 8216, rsquo: 8217, ldquo: 8220, rdquo: 8221, laquo: 171, raquo: 187, deg: 176, middot: 183, bull: 8226, trade: 8482, euro: 8364 };
  return html
    .replace(/<(br|hr|img|input|meta|link|col|area|source|wbr)\b([^>]*?)\s*\/?>/gi, '<$1$2/>')
    .replace(/&(\w+);/g, (m, n) => ['amp', 'lt', 'gt', 'quot', 'apos'].includes(n) ? m : named[n] ? `&#${named[n]};` : `&amp;${n};`)
    .replace(/&(?!#?\w+;)/g, '&amp;');
}
async function toEpub(body, title, out) {
  const JSZip = require('jszip'), zip = new JSZip(), id = `urn:uuid:${require('crypto').randomUUID()}`;
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' }); // must be first and uncompressed
  zip.file('META-INF/container.xml', '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">${id}</dc:identifier><dc:title>${esc(title)}</dc:title><dc:language>en</dc:language><meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>`);
  zip.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${esc(title)}</title></head><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">${esc(title)}</a></li></ol></nav></body></html>`);
  zip.file('OEBPS/chapter.xhtml', `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${esc(title)}</title><style>${PAGE_CSS.replace(/@page[^}]*}/, '')}</style></head><body>${xhtml(body)}</body></html>`);
  await fsp.writeFile(out, await zip.generateAsync({ type: 'nodebuffer', mimeType: 'application/epub+zip', compression: 'DEFLATE' }));
}

async function convert(input, ext, T, out, onProgress = () => {}, options) {
  if (ext === 'html' && T === 'PDF') return printPdf(input, out); // printed in place so relative pictures and styles resolve
  if (ext === 'docx' && T === 'TXT') return fsp.writeFile(out, (await require('mammoth').extractRawText({ path: input })).value.replace(/\n{3,}/g, '\n\n'));
  if (ext === 'txt' && T === 'MD') return fsp.copyFile(input, out); // plain text is already valid Markdown
  onProgress(0, { stage: `Reading ${ext.toUpperCase()}`, indeterminate: true });
  const { title, body } = await read(input, ext, (f, detail) => onProgress(f * .85, detail), options);
  onProgress(.85, { stage: `Writing ${T}`, indeterminate: true });
  switch (T) {
    case 'HTML': await fsp.writeFile(out, page(body, title)); break;
    case 'PDF': await htmlToPdf(page(body, title), out); break;
    case 'DOCX': await toDocx(body, title, out); break;
    case 'MD': await fsp.writeFile(out, toMarkdown(body)); break;
    case 'TXT': await fsp.writeFile(out, htmlToText(body)); break;
    case 'EPUB': await toEpub(body, title, out); break;
    default: throw new Error(`Can't convert .${ext} to ${T}`);
  }
  onProgress(1, { stage: 'File saved', indeterminate: false });
}

module.exports = { convert, read, htmlToPdf, htmlToText, page, toEpub, xhtml };
