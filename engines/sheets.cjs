// Spreadsheets: XLSX (exceljs), CSV and TSV to CSV / TSV / XLSX / JSON / HTML / PDF.
const fsp = require('fs').promises, path = require('path');
const { parseCsv, stringifyCsv, rowsToObjects } = require('./data.cjs');
const { esc } = require('./common.cjs');

function cellText(v) {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().replace(/T00:00:00\.000Z$/, '');
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(r => r.text).join('');
    if ('result' in v) return cellText(v.result);
    if (v.text) return String(v.text);
    if (v.error) return v.error;
    return '';
  }
  return v;
}

// [{ name, rows: string[][] }]
async function readSheets(input, ext) {
  if (ext === 'csv' || ext === 'tsv') return [{ name: 'Sheet1', rows: parseCsv(await fsp.readFile(input, 'utf8')) }];
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(input);
  return wb.worksheets.filter(ws => ws.state !== 'hidden').map(ws => {
    const rows = [];
    ws.eachRow({ includeEmpty: true }, (row, i) => { rows[i - 1] = row.values.slice(1).map(cellText); });
    return { name: ws.name, rows: Array.from(rows, r => r || []) };
  });
}

const safe = s => String(s).replace(/[\\/:*?"<>|[\]]+/g, '_').slice(0, 31) || 'Sheet1';
async function writeXlsx(sheets, out) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  for (const s of sheets) {
    const ws = wb.addWorksheet(safe(s.name));
    // numbers stay numbers so Excel can sum them
    s.rows.forEach(r => ws.addRow(r.map(c => typeof c === 'string' && /^-?\d+(\.\d+)?$/.test(c.trim()) && c.length < 16 ? Number(c) : c)));
    ws.getRow(1).font = { bold: true };
  }
  await wb.xlsx.writeFile(out);
}
const table = rows => `<table>${rows.map((r, i) => `<tr>${r.map(c => i ? `<td>${esc(c)}</td>` : `<th>${esc(c)}</th>`).join('')}</tr>`).join('')}</table>`;
const tsv = rows => rows.map(r => r.map(c => String(c ?? '').replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\r\n') + '\r\n';

async function convert(input, ext, T, alloc) {
  const sheets = await readSheets(input, ext), title = path.basename(input, path.extname(input));
  const many = sheets.length > 1, suffix = s => many ? `-${safe(s.name)}` : '';
  if (T === 'CSV' || T === 'TSV') {
    for (const s of sheets) await fsp.writeFile(await alloc(T.toLowerCase(), suffix(s)), T === 'CSV' ? '﻿' + stringifyCsv(s.rows) : tsv(s.rows));
    return;
  }
  if (T === 'JSON') {
    const data = many ? Object.fromEntries(sheets.map(s => [s.name, rowsToObjects(s.rows)])) : rowsToObjects(sheets[0].rows);
    return fsp.writeFile(await alloc('json'), JSON.stringify(data, null, 2) + '\n');
  }
  if (T === 'XLSX') return writeXlsx(sheets, await alloc('xlsx'));
  const { htmlToPdf, page } = require('./docs.cjs');
  const html = page(sheets.map(s => `${many ? `<h2>${esc(s.name)}</h2>` : ''}${table(s.rows)}`).join(''), title).replace('size: A4;', 'size: A4 landscape;');
  if (T === 'HTML') return fsp.writeFile(await alloc('html'), html);
  if (T === 'PDF') return htmlToPdf(html, await alloc('pdf'));
  throw new Error(`Can't convert .${ext} to ${T}`);
}

module.exports = { convert, readSheets, writeXlsx };
