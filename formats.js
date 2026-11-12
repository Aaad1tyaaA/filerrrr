// Format tables shared by the main process (require) and the pages (<script>).
// A target is a short code (max 4 characters, so the disc can spell it); NAMES gives a longer label for chips
// and EXT the file extension when it isn't the code in lower case.
(function (root) {
  const KINDS = {
    image: ['jpg', 'jpeg', 'jfif', 'png', 'webp', 'avif', 'tif', 'tiff', 'gif', 'heic', 'heif', 'bmp', 'ico', 'svg', 'psd',
      'tga', 'ppm', 'pgm', 'pbm', 'pcx', 'jp2', 'dds', 'exr', 'hdr', 'qoi', 'sgi','jxl','cr2','cr3','nef','arw','dng','orf','rw2'],
    video: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'wmv', 'flv', 'mpg', 'mpeg', '3gp', 'ts', 'mts', 'm2ts', 'ogv', 'vob'],
    audio: ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'opus', 'wma', 'aiff', 'aif', 'ac3', 'amr', 'm4b', 'mka'],
    pdf: ['pdf'],
    doc: ['docx', 'md', 'markdown', 'txt', 'html', 'htm', 'epub', 'eml','doc','odt','rtf','pptx','ppt','odp','mobi','azw','azw3','hwp','hwpx'],
    sheet: ['xlsx', 'csv', 'tsv','xls','ods'],
    data: ['json', 'yaml', 'yml', 'toml', 'xml', 'jsonl', 'ndjson', 'vcf'],
    subtitle: ['srt', 'vtt', 'ass', 'ssa', 'lrc'],
    archive: ['zip', 'rar', '7z', 'tar', 'tgz', 'gz', 'bz2', 'xz', 'tbz2', 'txz', 'iso', 'cab'],
    font: ['ttf', 'otf', 'woff', 'woff2', 'eot'],
    geo: ['geojson', 'kml', 'gpx','dxf','obj','stl','step','stp','iges','igs','dwg','3mf','fbx','gltf','glb'],
  };
  const ALIAS = { jpeg: 'jpg', jfif: 'jpg', tif: 'tiff', heif: 'heic', markdown: 'md', htm: 'html', yml: 'yaml', aif: 'aiff', mpeg: 'mpg',
    mts: 'ts', m2ts: 'ts', ndjson: 'jsonl', ssa: 'ass', m4b: 'm4a', tbz2: 'bz2', txz: 'xz' };
  const norm = ext => ALIAS[ext] || ext;
  const NAMES = { WOF2: 'WOFF2', JSNL: 'JSONL', GEO: 'GeoJSON', TGZ: 'TAR.GZ', MD: 'Markdown', TXT: 'Text' };
  const EXT = { WOF2: 'woff2', JSNL: 'jsonl', GEO: 'geojson', TGZ: 'tar.gz',HEIC:'heic' };
  const extFor = code => EXT[code] || code.toLowerCase();
  const nameFor = code => NAMES[code] || code;

  // What each kind, or a specific extension, can become.
  const ARCH = ['ZIP', '7Z', 'TAR', 'TGZ'];
  const TARGETS = {
    image: ['JPG', 'PNG', 'WEBP', 'AVIF', 'PDF', 'SVG', 'GIF', 'TIFF', 'BMP', 'ICO', 'TGA', 'QOI','HEIC','JXL'],
    video: ['MP4', 'MOV', 'MKV', 'WEBM', 'AVI', 'WMV', 'MPG', 'FLV', 'GIF', 'MP3', 'WAV', 'M4A'],
    audio: ['MP3', 'WAV', 'FLAC', 'M4A', 'OGG', 'OPUS', 'AAC', 'AIFF', 'WMA', 'AC3'],
    pdf: ['PNG', 'JPG', 'TXT', 'DOCX', 'HTML', 'MD'],
    docx: ['PDF', 'HTML', 'MD', 'TXT', 'EPUB'], md: ['PDF', 'DOCX', 'HTML', 'TXT', 'EPUB'], txt: ['PDF', 'DOCX', 'HTML', 'MD', 'EPUB'],
    html: ['PDF', 'DOCX', 'MD', 'TXT', 'EPUB'], epub: ['PDF', 'DOCX', 'HTML', 'MD', 'TXT'], eml: ['PDF', 'HTML', 'TXT'],
    xlsx: ['CSV', 'TSV', 'JSON', 'HTML', 'PDF'], csv: ['XLSX', 'TSV', 'JSON', 'HTML', 'PDF'], tsv: ['CSV', 'XLSX', 'JSON', 'HTML', 'PDF'],
    json: ['YAML', 'TOML', 'XML', 'CSV', 'XLSX', 'JSNL'], yaml: ['JSON', 'TOML', 'XML'], toml: ['JSON', 'YAML', 'XML'], xml: ['JSON', 'YAML'],
    jsonl: ['JSON', 'CSV', 'XLSX'], vcf: ['CSV', 'JSON'],
    srt: ['VTT', 'ASS', 'LRC'], vtt: ['SRT', 'ASS', 'LRC'], ass: ['SRT', 'VTT', 'LRC'], lrc: ['SRT', 'VTT', 'ASS'],
    zip: ARCH, rar: ARCH, '7z': ARCH, tar: ARCH, tgz: ARCH, gz: ARCH, bz2: ARCH, xz: ARCH, iso: ARCH, cab: ARCH,
    ttf: ['WOFF', 'WOF2', 'EOT', 'SVG'], otf: ['TTF', 'WOFF', 'WOF2', 'EOT'], woff: ['TTF', 'WOF2', 'EOT'], woff2: ['TTF', 'WOFF', 'EOT'], eot: ['TTF', 'WOFF', 'WOF2'],
    geojson: ['KML', 'GPX'], kml: ['GEO', 'GPX'], gpx: ['GEO', 'KML'],
    doc:['PDF','DOCX','TXT'],odt:['PDF','DOCX','TXT'],rtf:['PDF','DOCX','TXT'],ppt:['PDF'],odp:['PDF'],pptx:['PDF','TXT'],xls:['XLSX','CSV','PDF'],ods:['XLSX','CSV','PDF'],
    mobi:['EPUB','PDF','TXT'],azw:['EPUB','PDF','TXT'],azw3:['EPUB','PDF','TXT'],hwp:['TXT'],hwpx:['TXT'],obj:['STL'],stl:['OBJ'],dxf:['SVG'],step:[],stp:[],iges:[],igs:[],dwg:[],fbx:[],gltf:[],glb:[],'3mf':[],
  };
  const EXTRA = { gif: ['MP4', 'WEBM'] };
  // Most likely wish first: phone photos want JPG, PNGs usually want WEBP, and so on.
  const FIRST = { heic: 'JPG', avif: 'JPG', webp: 'PNG', png: 'WEBP', tiff: 'JPG', bmp: 'PNG', svg: 'PNG', ico: 'PNG', psd: 'PNG', tga: 'PNG',
    gif: 'MP4', mov: 'MP4', mkv: 'MP4', avi: 'MP4', wmv: 'MP4', flv: 'MP4', webm: 'MP4', mpg: 'MP4', ts: 'MP4', ogv: 'MP4', vob: 'MP4', '3gp': 'MP4',
    wav: 'MP3', flac: 'MP3', m4a: 'MP3', aiff: 'MP3', wma: 'MP3', ac3: 'MP3', amr: 'MP3', mka: 'MP3', ogg: 'MP3', opus: 'MP3', aac: 'MP3',
    pdf: 'DOCX', docx: 'PDF', md: 'PDF', txt: 'PDF', html: 'PDF', epub: 'PDF', eml: 'PDF',
    xlsx: 'CSV', csv: 'XLSX', tsv: 'CSV', json: 'YAML', yaml: 'JSON', toml: 'JSON', xml: 'JSON', jsonl: 'JSON', vcf: 'CSV',
    srt: 'VTT', vtt: 'SRT', ass: 'SRT', lrc: 'SRT', rar: 'ZIP', '7z': 'ZIP', tar: 'ZIP', ttf: 'WOF2', otf: 'TTF', woff: 'TTF', woff2: 'TTF',
    kml: 'GEO', gpx: 'GEO', geojson: 'KML' };

  const TOOLS = {
    image: ['MRG', 'HALF', 'DBL', 'SQR', 'MINI', 'ROT', 'FLIP', 'GRAY', 'CLN', 'ZIP'],
    video: ['MINI', '720P', 'MUTE', 'THMB', 'FRMS', 'ROT', 'GRAY', 'ZIP'],
    audio: ['MINI', 'NORM', 'ZIP'],
    pdf: ['MRG', 'SPLT', 'ROT', 'NUP2', 'NUM', 'ZIP'],
    archive: ['XTR'],
  };
  const TOOL_NAMES = { MRG: 'Merge to PDF', HALF: 'Half size', DBL: 'Upscale 2×', SQR: 'Square crop', MINI: 'Compress', ROT: 'Rotate', FLIP: 'Flip',
    GRAY: 'Grayscale', CLN: 'Clean metadata', ZIP: 'Zip', MUTE: 'Mute', '720P': 'To 720p', THMB: 'Thumbnail', FRMS: 'Frames (1/s)',
    NORM: 'Even out volume', SPLT: 'Split pages', NUP2: '2 pages per sheet', NUM: 'Page numbers', XTR: 'Extract' };
  const BATCH_TOOLS = ['MRG', 'ZIP']; // every file goes into one output

  // During an OS drag the page only sees MIME types, not names.
  const MIME_EXT = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/tiff': 'tiff', 'image/gif': 'gif',
    'image/heic': 'heic', 'image/heif': 'heic', 'image/bmp': 'bmp', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico', 'image/svg+xml': 'svg',
    'image/vnd.adobe.photoshop': 'psd', 'image/x-tga': 'tga', 'image/jp2': 'jp2',
    'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/x-matroska': 'mkv', 'video/webm': 'webm', 'video/x-msvideo': 'avi', 'video/avi': 'avi',
    'video/x-ms-wmv': 'wmv', 'video/mpeg': 'mpg', 'video/x-flv': 'flv', 'video/3gpp': '3gp', 'video/mp2t': 'ts', 'video/ogg': 'ogv',
    'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/flac': 'flac', 'audio/x-flac': 'flac',
    'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/opus': 'opus', 'audio/x-ms-wma': 'wma', 'audio/aiff': 'aiff',
    'audio/x-aiff': 'aiff', 'audio/ac3': 'ac3', 'audio/amr': 'amr',
    'application/pdf': 'pdf', 'text/plain': 'txt', 'text/markdown': 'md', 'text/html': 'html', 'text/csv': 'csv', 'text/tab-separated-values': 'tsv',
    'application/json': 'json', 'application/xml': 'xml', 'text/xml': 'xml', 'application/toml': 'toml', 'application/x-yaml': 'yaml', 'text/yaml': 'yaml',
    'text/vcard': 'vcf', 'text/x-vcard': 'vcf', 'message/rfc822': 'eml', 'application/epub+zip': 'epub',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/zip': 'zip', 'application/x-zip-compressed': 'zip', 'application/x-rar-compressed': 'rar', 'application/vnd.rar': 'rar',
    'application/x-7z-compressed': '7z', 'application/x-tar': 'tar', 'application/gzip': 'gz', 'application/x-gzip': 'gz', 'application/x-iso9660-image': 'iso',
    'text/vtt': 'vtt', 'application/x-subrip': 'srt', 'font/ttf': 'ttf', 'font/otf': 'otf', 'font/woff': 'woff', 'font/woff2': 'woff2',
    'application/vnd.ms-fontobject': 'eot', 'application/geo+json': 'geojson', 'application/vnd.google-earth.kml+xml': 'kml', 'application/gpx+xml': 'gpx',
  };

  function extOf(p) {
    const m = /\.([^.\\/]+)$/.exec(p || ''); if (!m) return '';
    const e = m[1].toLowerCase();
    return e === 'gz' && /\.tar\.gz$/i.test(p) ? 'tgz' : e;
  }
  function kindOfExt(ext) {
    ext = (ext || '').toLowerCase();
    for (const [k, list] of Object.entries(KINDS)) if (list.includes(ext)) return k;
    return 'other';
  }
  const extOfMime = mime => MIME_EXT[(mime || '').toLowerCase()] || '';
  function kindOfAll(kinds) { const u = [...new Set(kinds)]; return u.length === 1 ? u[0] : 'other'; }

  function targetsFor(kind, ext) {
    const e = norm((ext || '').toLowerCase());
    const base = TARGETS[e] || (['image', 'video', 'audio', 'pdf'].includes(kind) ? TARGETS[kind] : []);
    const list = [...new Set([...base, ...(EXTRA[e] || [])])].filter(t => extFor(t) !== e && !(e === 'tgz' && t === 'TGZ'));
    const first = FIRST[e];
    return first && list.includes(first) ? [first, ...list.filter(t => t !== first)] : list;
  }
  // Tools for a selection: one kind gets its own tools; images and PDFs together can still be merged or zipped.
  function toolsFor(kinds) {
    const u = [...new Set(kinds)];
    if (u.length === 1) return TOOLS[u[0]] || ['ZIP'];
    return u.every(k => k === 'image' || k === 'pdf') ? ['MRG', 'ZIP'] : ['ZIP'];
  }
  function optionsFor(exts) {
    const kinds = exts.map(e => kindOfExt(norm(e)));
    const kind = kindOfAll(kinds);
    const targets = kind === 'other' ? [] : targetsFor(kind, exts[0])
      .filter(target => exts.every(ext => targetsFor(kind, ext).includes(target)));
    return { kind, targets, tools: toolsFor(kinds) };
  }

  const all = new Set([...Object.values(KINDS).flat(), ...Object.values(TARGETS).flat().map(extFor)]);
  const api = { KINDS, TARGETS, TOOLS, TOOL_NAMES, BATCH_TOOLS, NAMES, norm, extOf, extFor, nameFor, kindOfExt, extOfMime, kindOfAll, targetsFor,
    toolsFor, optionsFor, count: all.size };
  if (typeof module !== 'undefined') module.exports = api; else root.Formats = api;
})(this);
