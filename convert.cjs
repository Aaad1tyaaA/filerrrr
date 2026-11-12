// Routes a conversion to the right engine. Outputs go next to the original under free names;
// a failed file never stops the others and never leaves a half-written output behind.
const fs = require('fs'), fsp = fs.promises, path = require('path'), os = require('os');
const F = require('./formats.js');
const { allocate, release, size, killAll: killProcesses } = require('./engines/common.cjs');
const killAll = () => { killProcesses(); require('./engines/ocr.cjs').killAll(); };
const image = new Proxy({}, {get:(_target,key)=>require('./engines/image.cjs')[key]});
const media = new Proxy({}, {get:(_target,key)=>require('./engines/media.cjs')[key]});
const Job = require('./engines/job.cjs');

// One file (or one batch) of work with its own output bookkeeping.
function workspace(input,options={}) {
  const prefs=options.preferences||{};
  const directory=prefs.destination==='chosen'?prefs.folder:prefs.destination==='converted'?path.join(path.dirname(input),'Converted'):path.dirname(input);
  const made = []; let staging, stagingPromise;
  const alloc = async (ext, suffix = '') => {
    Job.check();
    if(!directory||!path.isAbsolute(directory))throw new Error('Choose an output folder in Settings first');
    staging = await (stagingPromise ||= fsp.mkdir(directory,{recursive:true}).then(()=>fsp.mkdtemp(path.join(directory,'.filerrrr-'))));
    const output = await allocate(input,ext,suffix,{directory,prefix:options.prefix,replace:prefs.collision==='replace',inputs:options.inputs,originals:options.originals}), file = path.join(staging,path.basename(output));
    made.push({output,file,ext,suffix,published:false}); return file;
  };
  const cleanStage = async () => { if (staging) await fsp.rm(staging,{recursive:true,force:true}); };
  const done = async () => {
    const outputs = [];
    for (const item of made) {
      Job.check();
      let stat; try { stat = await fsp.stat(item.file); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      for (;;) {
        try {
          if(prefs.collision==='replace'&&!item.backup&&await fsp.lstat(item.output).then(()=>true,()=>false)){
            if(typeof options.recycle!=='function')throw new Error('Replace needs the Recycle Bin. Choose numbered names instead.');
            item.backup=path.join(staging,'previous',path.basename(item.output));await fsp.mkdir(path.dirname(item.backup),{recursive:true});await fsp.rename(item.output,item.backup);
          }
          if (stat.isDirectory()) {
            await fsp.rename(item.file,item.output); item.published = true;
          } else {
            try { await fsp.link(item.file,item.output); }
            catch (error) {
              if (!['ENOSYS','ENOTSUP','EPERM','EXDEV'].includes(error.code)) throw error;
              await fsp.copyFile(item.file,item.output,fs.constants.COPYFILE_EXCL);
            }
            item.published = true;
          }
          break;
        } catch (error) {
          const exists = ['EEXIST','ENOTEMPTY','EPERM'].includes(error.code) && await fsp.lstat(item.output).then(()=>true,()=>false);
          if (!exists || item.published) throw error;
          release(item.output); item.output = await allocate(input,item.ext,item.suffix,{directory,inputs:options.inputs,originals:options.originals});
        }
      }
      Job.check(); outputs.push(item.output);
    }
    Job.check();
    for(const item of made)if(item.backup){await options.recycle(item.backup);item.backup=null;}
    await cleanStage(); made.forEach(item=>release(item.output));
    return outputs;
  };
  const undo = async () => {
    try { for (const item of made){if (item.published) await fsp.rm(item.output,{recursive:true,force:true});if(item.backup){
      const restore=await fsp.lstat(item.output).then(()=>false,()=>true)?item.output:await allocate(input,item.ext,`${item.suffix}-previous`,{directory,inputs:options.inputs,originals:options.originals});
      try{await fsp.rename(item.backup,restore);}finally{release(restore);}item.backup=null;
    }} }
    finally { made.forEach(item=>release(item.output)); await cleanStage(); }
  };
  return { alloc, done, undo };
}

const engine = name => require(`./engines/${name}.cjs`);
const SUFFIX = { ROT: '-rotated', FLIP: '-flipped', HALF: '-half', DBL: '-2x', SQR: '-square', MINI: '-small', GRAY: '-gray', CLN: '-clean',
  MUTE: '-muted', '720P': '-720p', THMB: '-thumb', FRMS: '-frames', NORM: '-even', NUP2: '-2up', NUM: '-numbered' };

async function runTool(input, kind, pick, ws, onProgress) {
  const suffix = SUFFIX[pick] || '';
  if (kind === 'image') return image.tool(input, pick, await ws.alloc(image.toolFormat(input).toLowerCase(), suffix));
  if (kind === 'video' || kind === 'audio') {
    const t = media.tool(input, pick, kind, onProgress);
    if (t.dir) { const dir = await ws.alloc('', suffix); await fsp.mkdir(dir); return t.run(dir); }
    return t.run(await ws.alloc(t.ext, suffix));
  }
  if (kind === 'pdf') {
    const pdf = engine('pdf');
    if (pick === 'SPLT') return pdf.split(input, ws.alloc);
    return ({ ROT: pdf.rotate, NUP2: pdf.twoUp, NUM: pdf.number })[pick](input, await ws.alloc('pdf', suffix));
  }
  if (pick === 'XTR') return engine('archive').extract(input, await ws.alloc('', ''));
}

async function runFormat(input, kind, ext, pick, ws, onProgress, options) {
  const out = () => ws.alloc(F.extFor(pick));
  const extended=engine('extended');if(extended.requirement(ext,pick))return extended.convert(input,pick,await out());
  if(ext==='pptx')return engine('slides').convert(input,pick,await out());
  if(['hwpx','dxf','obj','stl'].includes(ext))return engine('vector').convert(input,ext,pick,await out());
  if(options.edit?.pages&&kind==='pdf'&&pick==='PDF')return engine('pdf').selectPages(input,await out(),options.edit.pages);
  if (kind === 'image' && !(ext === 'gif' && (pick === 'MP4' || pick === 'WEBM'))) return image.convert(input, pick, await out(),options.preferences,options.edit);
  if (kind === 'image' || kind === 'video' || kind === 'audio' || kind === 'subtitle') {
    if (kind === 'subtitle' && ((ext === 'srt' && pick === 'VTT') || (ext === 'vtt' && pick === 'SRT'))) return engine('data').convert(input, ext, pick, await out());
    return media.convert(input, pick, await out(), onProgress,options.preferences,options.edit);
  }
  if (kind === 'pdf') {
    if (pick === 'PNG' || pick === 'JPG') return engine('pdf').toImages(input, pick, ws.alloc, onProgress, options);
    if (pick === 'TXT') return engine('pdf').toText(input, await out(), onProgress, options);
    return engine('docs').convert(input, 'pdf', pick, await out(), onProgress, options);
  }
  if (kind === 'doc') return engine('docs').convert(input, ext, pick, await out(), onProgress);
  if (kind === 'sheet') return engine('sheets').convert(input, ext, pick, ws.alloc);
  if (kind === 'data') return engine('data').convert(input, ext, pick, await out());
  if (kind === 'archive') return engine('archive').repack(input, await out());
  if (kind === 'font') return engine('fonts').convert(input, ext, pick, await out());
  if (kind === 'geo') return engine('geo').convert(input, ext, pick, await out());
  throw new Error(`Can't convert .${ext} files`);
}

async function convertOne(input, face, pick, onProgress, options) {
  const ext = F.norm(F.extOf(input)), kind = F.kindOfExt(ext), ws = workspace(input,options);
  try {
    Job.check();
    if (face === 'tools') {
      if (!F.toolsFor([kind]).includes(pick)) throw new Error(`${F.TOOL_NAMES[pick] || pick} doesn't work on .${ext} files`);
      await runTool(input, kind, pick, ws, onProgress);
    } else {
      if (!(options.edit&&F.extFor(pick)===ext) && !F.targetsFor(kind, ext).includes(pick)) throw new Error(`Can't convert .${ext} to ${F.nameFor(pick)}`);
      await runFormat(input, kind, ext, pick, ws, onProgress, options);
    }
    const outputs = await ws.done();
    if (!outputs.length) throw new Error('Nothing was written');
    return outputs;
  } catch (e) { await ws.undo(); throw e; }
}

async function batch(inputs, pick,options) {
  const ws = workspace(inputs[0],options), more = inputs.length > 1 ? ` + ${inputs.length - 1} more` : '';
  try {
    Job.check();
    if (pick === 'ZIP') await engine('archive').zip(inputs, await ws.alloc('zip', more));
    else if (pick === 'MRG') {
      const pages = await Promise.all(inputs.map(async f => F.kindOfExt(F.norm(F.extOf(f))) === 'pdf' ? { pdf: await fsp.readFile(f) } : image.load(f)));
      await image.imagesToPdf(pages, await ws.alloc('pdf', more || '-merged'));
    }
    return await ws.done();
  } catch (e) { await ws.undo(); throw e; }
}

const friendly = e => {
  const m = String(e && e.message || e).split('\n')[0];
  if (/ENOENT|no such file/i.test(m)) return 'The file is gone';
  if (/EACCES|EPERM/i.test(m)) return 'No permission to write in this folder';
  if (/ENOSPC/i.test(m)) return 'The disk is full';
  if (/unsupported image format|Input file contains unsupported|Invalid data found/i.test(m)) return 'This file looks damaged or isn\'t what its name says';
  return m.slice(0, 160);
};

// inputs: absolute paths. Returns one result per file (or one for a batch tool).
async function runWork(inputs, face, pick, onProgress, options) {
  if (!Array.isArray(inputs) || !inputs.length || inputs.some(p => typeof p !== 'string' || !path.isAbsolute(p))) throw new Error('Bad input list');
  if (face !== 'formats' && face !== 'tools') throw new Error('Bad face');
  options.originals=[...inputs,...await Promise.all(inputs.map(input=>fsp.realpath(input).catch(()=>path.resolve(input)))),...await Promise.all(inputs.map(async input=>path.join(await fsp.realpath(path.dirname(input)).catch(()=>path.dirname(input)),path.basename(input))))];
  const total = async list => (await Promise.all(list.map(size))).reduce((a, b) => a + b, 0);
  if (face === 'tools' && F.BATCH_TOOLS.includes(pick)) {
    onProgress(0, { input: inputs[0], total: inputs.length, completed: 0, stage: pick === 'ZIP' ? 'Creating ZIP' : 'Merging files', indeterminate: true });
    try {
      const outputs = await batch(inputs, pick,options);
      onProgress(1, { input: inputs[0], total: inputs.length, completed: inputs.length, stage: 'Files saved', indeterminate: false });
      return [{ input: inputs[0], count: inputs.length, outputs, output: outputs[0], before: await total(inputs), after: await total(outputs) }];
    } catch (e) {
      onProgress(1, { input: inputs[0], total: inputs.length, completed: inputs.length, stage: 'Conversion failed', indeterminate: false });
      return [{ input: inputs[0], count: inputs.length, error: Job.currentSignal()?.aborted || Job.isCancelled(e) ? 'Cancelled' : friendly(e), cancelled: Job.currentSignal()?.aborted || Job.isCancelled(e) }];
    }
  }
  const frac = inputs.map(() => 0), results = new Array(inputs.length);
  const report = detail => onProgress(frac.reduce((a, b) => a + b, 0) / inputs.length,
    { total: inputs.length, completed: results.filter(Boolean).length, ...detail });
  let next = 0;
  const worker = async () => {
    while (next < inputs.length) {
      const i = next++, input = inputs[i];
      report({ input, stage: 'Converting', indeterminate: true });
      try {
        Job.check();
        const outputs = await convertOne(input, face, pick, (f, detail) => {
          if (Number.isFinite(f)) frac[i] = Math.max(frac[i], Math.min(1, Math.max(0, f)));
          report({ input, indeterminate: false, ...detail });
        }, options);
        results[i] = { input, count: 1, outputs, output: outputs[0], before: await size(input), after: await total(outputs) };
      } catch (e) { const cancelled = Job.currentSignal()?.aborted || Job.isCancelled(e); results[i] = { input, count: 1, error: cancelled ? 'Cancelled' : friendly(e), cancelled: !!cancelled }; }
      frac[i] = 1; report({ input, stage: results[i].error ? 'File failed' : 'File saved', indeterminate: false });
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(3, os.cpus().length - 1, inputs.length)) }, worker));
  return results;
}
async function run(inputs,face,pick,onProgress = () => {},options = {}) {
  return Job.withJob(options.signal,()=>runWork(inputs,face,pick,onProgress,{...options,inputs}));
}

module.exports = { run, killAll };
