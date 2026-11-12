// Feature definitions shared by the settings page, main process and overlay.
(function (root) {
  const F = typeof module !== 'undefined' ? require('./formats.js') : root.Formats;
  const families = [
    ['image', 'Images', 'Convert photos, flattened PSDs and SVGs. Includes HEIC decoding and raster-to-SVG tracing.'],
    ['video', 'Video', 'Change video containers and codecs, make GIFs or extract audio.'],
    ['audio', 'Audio', 'Convert music and recordings between compressed and lossless formats.'],
    ['pdf', 'PDFs', 'Export every page to an image, extract text or turn text into editable documents.'],
    ['doc', 'Documents & e-books', 'Convert Word, Markdown, text, HTML, EPUB and e-mail. Document layout may change.'],
    ['sheet', 'Spreadsheets', 'Convert workbooks and delimited tables. Multi-sheet CSV and TSV exports create one file per sheet.'],
    ['data', 'Structured data & contacts', 'Change data serialization, export rows to spreadsheets and turn vCards into contact tables.'],
    ['subtitle', 'Subtitles', 'Convert subtitle files between SRT, WebVTT, ASS and LRC.'],
    ['archive', 'Archives', 'Repack ZIP, RAR, 7Z, TAR and other supported archives. RAR is read-only.'],
    ['font', 'Fonts', 'Convert supported desktop and web fonts. Available outputs depend on the source font.'],
    ['geo', 'Map data', 'Convert geographic features between GeoJSON, KML and GPX.'],
  ].map(([kind, name, description]) => ({ id: `convert.${kind}`, kind, name, description }));
  const toolDetails = {
    MRG: 'Combine selected images and PDFs into one PDF, in selection order.',
    HALF: 'Resize an image to half its width and proportional height.',
    DBL: 'Enlarge images with Lanczos resizing and sharpening, up to 16,000 pixels wide.',
    SQR: 'Crop an image to a square around the visually busy area.',
    MINI: 'Re-encode images, video or audio with smaller-file settings. Size reduction depends on the input.',
    ROT: 'Rotate images, video or PDF pages 90 degrees clockwise.',
    FLIP: 'Mirror an image horizontally.',
    GRAY: 'Remove color from images or video.',
    CLN: 'Re-encode an image without EXIF or GPS metadata.',
    ZIP: 'Put the selected files into one ZIP archive.',
    MUTE: 'Remove audio tracks from a video while copying its picture stream.',
    '720P': 'Convert video to MP4 with a height of at most 720 pixels.',
    THMB: 'Save a representative video frame as a JPG.',
    FRMS: 'Export one video frame per second into a new folder.',
    NORM: 'Normalize audio loudness using FFmpeg loudnorm.',
    SPLT: 'Create a separate PDF for every page.',
    NUP2: 'Place two PDF pages side by side on landscape A4 sheets.',
    NUM: 'Add a page number and total page count to each PDF page.',
    XTR: 'Extract an archive into a folder using your output settings.',
  };
  const tools = Object.keys(F.TOOL_NAMES).map(tool => ({
    id: `tool.${tool}`, tool, name: F.TOOL_NAMES[tool], description: toolDetails[tool],
    kinds: Object.entries(F.TOOLS).filter(([, list]) => list.includes(tool)).map(([kind]) => kind),
  }));
  const controls = [
    ['ocr', 'English scan recognition', 'Recognize image-only PDF pages locally before exporting Word, text, HTML or Markdown. Requires the English OCR engine pack in the core edition.'],
    ['input.wheel', 'Wheel selection', 'Scroll to move between palette choices.'],
    ['input.typing', 'Type to find a format', 'Type a format name on the palette. Backspace edits the search.'],
    ['input.keyboard', 'Keyboard selection', 'Use arrow keys to choose, Tab to switch to tools and Enter to convert. Escape always closes the palette.'],
    ['history', 'Save conversion history', 'Record new conversions locally, keeping the most recent 200 entries.'],
    ['thumbnails', 'Thumbnail previews', 'Show image, video and PDF previews in conversion history.'],
    ['sizeComparison', 'File size comparison', 'Show before-and-after sizes and the size difference in history.'],
    ['successMessages', 'Success messages', 'Show a confirmation toast after successful conversions. Errors are always shown.'],
  ].map(([id, name, description]) => ({ id, name, description }));
  const all = [...families, ...tools, ...controls];
  const defaults = Object.fromEntries(all.map(item => [item.id, true]));
  function sanitize(values, base = defaults) {
    return Object.fromEntries(all.map(({ id }) => [id, typeof values?.[id] === 'boolean' ? values[id] : base[id] !== false]));
  }
  function optionsFor(exts, flags = defaults) {
    const options = F.optionsFor(exts);
    if (exts.some(ext => flags[`convert.${F.kindOfExt(F.norm(ext))}`] === false)) options.targets = [];
    options.tools = options.tools.filter(tool => flags[`tool.${tool}`] !== false);
    return options;
  }
  function choicesFor(exts, flags = defaults) {
    const options = optionsFor(exts, flags), raw = F.optionsFor(exts);
    const kinds = exts.map(ext => F.kindOfExt(F.norm(ext)));
    const candidates = [...new Set([...raw.targets, ...kinds.flatMap(kind => kind === 'pdf'
      ? ['DOCX', 'JPG', 'PNG', 'TXT', 'HTML', 'MD', 'PDF', 'EPUB', 'SVG', 'TIFF']
      : [...(F.TARGETS[kind] || []), ...(F.KINDS[kind] || []).flatMap(ext => F.TARGETS[F.norm(ext)] || [])])])].slice(0, 16);
    const choices = candidates.map(value => ({ value, reason: options.targets.includes(value) ? '' : raw.targets.includes(value)
      ? 'Disabled in Features & settings' : exts.some(ext => F.norm(ext) === F.extFor(value))
        ? 'Already this format' : 'No conversion route for this selection' }));
    return { ...options, choices:choices.filter(choice=>!['Already this format','No conversion route for this selection'].includes(choice.reason)) };
  }
  const api = { families, tools, controls, all, defaults, sanitize, optionsFor, choicesFor };
  if (typeof module !== 'undefined') module.exports = api; else root.Features = api;
})(this);
