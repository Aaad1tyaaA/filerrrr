// Text data: CSV parsing/writing, JSON <-> YAML <-> CSV, SRT <-> WebVTT.
const fsp = require('fs').promises;
const yaml = require('js-yaml');

// RFC 4180 CSV with quoted fields, CRLF/LF, a BOM, and comma / semicolon / tab detected from the first line.
function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const first = text.slice(0, text.search(/\r?\n|$/));
  const delim = [',', ';', '\t'].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c;
    } else if (c === '"' && field === '') q = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
const cell = v => { const s = v == null ? '' : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const stringifyCsv = rows => rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';

function rowsToObjects(rows) {
  const [head = [], ...body] = rows;
  const keys = head.map((h, i) => (h || `column${i + 1}`).trim());
  return body.filter(r => r.some(v => v !== '' && v != null)).map(r => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ''])));
}
function objectsToRows(data) {
  const list = Array.isArray(data) ? data : [data];
  if (list.every(Array.isArray)) return list;
  if (!list.every(x => x && typeof x === 'object')) throw new Error('This JSON has no rows to put in a table');
  const keys = [...new Set(list.flatMap(Object.keys))];
  return [keys, ...list.map(o => keys.map(k => typeof o[k] === 'object' && o[k] !== null ? JSON.stringify(o[k]) : o[k]))];
}

// Structured data: anything that parses to a value can become JSON, YAML, TOML or XML; tables become CSV / XLSX.
async function parse(input, ext) {
  const text = (await fsp.readFile(input, 'utf8')).replace(/^﻿/, '');
  switch (ext) {
    case 'json': return JSON.parse(text);
    case 'yaml': return yaml.load(text);
    case 'toml': return require('smol-toml').parse(text);
    case 'xml': { const { XMLParser } = require('fast-xml-parser'); return new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', parseTagValue: true }).parse(text); }
    case 'jsonl': return text.split(/\r?\n/).filter(l => l.trim()).map((l, i) => { try { return JSON.parse(l); } catch { throw new Error(`Line ${i + 1} isn't valid JSON`); } });
    case 'vcf': return parseVcf(text);
  }
  throw new Error(`Can't read .${ext}`);
}

// vCard: one object per card with the common fields (name, phones, e-mails, org, title, address, note).
function parseVcf(text) {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/); // unfold continuation lines
  const cards = []; let c = null;
  for (const line of lines) {
    if (/^BEGIN:VCARD/i.test(line)) { c = {}; continue; }
    if (/^END:VCARD/i.test(line)) { if (c) cards.push(c); c = null; continue; }
    if (!c) continue;
    const m = /^([^:;]+)((?:;[^:]*)?):(.*)$/.exec(line); if (!m) continue;
    const key = m[1].toUpperCase().replace(/^item\d+\./i, ''), val = m[3].replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
    const add = (k, v) => { if (v) c[k] = c[k] ? `${c[k]}; ${v}` : v; };
    if (key === 'FN') add('name', val);
    else if (key === 'N' && !c.name) add('name', val.split(';').filter(Boolean).reverse().join(' '));
    else if (key === 'TEL') add('phone', val);
    else if (key === 'EMAIL') add('email', val);
    else if (key === 'ORG') add('organization', val.replace(/;/g, ' '));
    else if (key === 'TITLE') add('title', val);
    else if (key === 'ADR') add('address', val.split(';').filter(Boolean).join(', '));
    else if (key === 'NOTE') add('note', val);
    else if (key === 'BDAY') add('birthday', val);
    else if (key === 'URL') add('url', val);
  }
  return cards;
}

function serialize(value, T) {
  switch (T) {
    case 'JSON': return JSON.stringify(value, null, 2) + '\n';
    case 'YAML': return yaml.dump(value, { lineWidth: 120, noRefs: true });
    case 'TOML': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) value = { items: value }; // TOML needs a table at the top
      return require('smol-toml').stringify(value);
    }
    case 'XML': {
      const { XMLBuilder } = require('fast-xml-parser');
      const root = value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 1 ? value : { root: Array.isArray(value) ? { item: value } : value };
      return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@', format: true, indentBy: '  ' }).build(root);
    }
    case 'JSNL': return (Array.isArray(value) ? value : [value]).map(v => JSON.stringify(v)).join('\n') + '\n';
    case 'CSV': return '﻿' + stringifyCsv(objectsToRows(value));
  }
  throw new Error(`Can't write ${T}`);
}

async function convert(input, ext, T, out) {
  if (ext === 'srt' && T === 'VTT') return fsp.writeFile(out, srtToVtt(await fsp.readFile(input, 'utf8')));
  if (ext === 'vtt' && T === 'SRT') return fsp.writeFile(out, vttToSrt(await fsp.readFile(input, 'utf8')));
  const value = await parse(input, ext);
  if (T === 'XLSX') return require('./sheets.cjs').writeXlsx([{ name: 'Sheet1', rows: objectsToRows(value) }], out);
  return fsp.writeFile(out, serialize(value, T));
}

function srtToVtt(text) {
  return 'WEBVTT\n\n' + text.replace(/^﻿/, '').replace(/\r/g, '').trim()
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2') + '\n';
}
function vttToSrt(text) {
  const blocks = text.replace(/^﻿/, '').replace(/\r/g, '').split(/\n{2,}/).filter(b => b.includes('-->'));
  return blocks.map((b, i) => {
    const lines = b.split('\n'), at = lines.findIndex(l => l.includes('-->'));
    const time = lines[at].replace(/(\d{2}:\d{2})\.(\d{3})/g, '$1,$2').replace(/(^|\s)(\d{2}:\d{2},\d{3})/g, '$100:$2').replace(/\s+(align|line|position|size|vertical|region):\S+/g, '');
    return `${i + 1}\n${time}\n${lines.slice(at + 1).join('\n')}`;
  }).join('\n\n') + '\n';
}

module.exports = { parseCsv, stringifyCsv, rowsToObjects, objectsToRows, convert, parse, serialize, parseVcf, srtToVtt, vttToSrt };
