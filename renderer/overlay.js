// The overlay window. Two ways in:
//  drag  – Ctrl + drag in Explorer. The OS drag owns the mouse, so the window never takes focus; aiming comes from
//          dragover, wheel and keys from the global hook, and letting go drops the files here.
//  click – "Convert with Filerrrr" in the right-click menu. The window takes focus and works like a normal popup.
const CX = Palette.CENTER + 40, CY = Palette.CENTER; // the palette sits 40px in from the window's left edge
let mode = null, paths = null, dropped = false, releaseTimer = 0;
let featureFlags = {};
api.onSettings(s => { featureFlags = s.features || {}; });

const pal = new Palette(document.getElementById('pal'), {
  onCommit: pick => convert(pick),
  onCancel: () => hide(),
  onOpen: p => api.open(p), onReveal: p => api.reveal(p),
  onAbort:()=>api.cancelConversion(),onUndo:token=>api.undo(token),
  onRetry:(list,pick)=>{paths=list;stopResult();convert(pick);},
});
api.onUndone(result=>pal.applyUndo(result.token,result));
const hide = () => { mode = null; paths = null; document.body.className = ''; api.hideOverlay(); };
const closeNow = () => pal.close(hide);

function label(list) { return list.length > 1 ? `${list.length} FILES` : (Formats.extOf(list[0]) || 'FILE').toUpperCase(); }
function optionsForPaths(list) { return { label: label(list), ...Features.choicesFor(list.map(Formats.extOf), featureFlags) }; }
let selectionRequest = 0;
let exactCheck=null,exactResult=null;
api.onNativeDrop(async data=>{
  if(mode!=='drag')return;
  if(data.type==='over'){pal.aim(data.x-CX,data.y-CY);return;}
  if(data.type==='leave'){pal.disc.setInside(false);return;}
  if(data.type==='enter'){
    const request=++selectionRequest;paths=data.paths;exactResult=null;
    pal.checking=true;pal.note.textContent=paths.length?'Checking dragged files…':'This drag has no local files';
    exactCheck=paths.length?api.inspect(paths):Promise.resolve(null);
    try{const result=await exactCheck;if(request!==selectionRequest||mode!=='drag'||!result)return;exactResult=result;
      const names=data.paths.slice(0,3).map(file=>file.split(/[\\/]/).pop()).join(', ');paths=result.paths||data.paths;
      pal.setFiles({...result,label:label(paths),note:`${names}${data.paths.length>3?'…':''}. ${result.note}`});
    }catch(error){if(request===selectionRequest){pal.checking=false;pal.note.textContent=String(error.message||error);}}
    return;
  }
  if(data.type==='drop'){
    dropped=true;clearTimeout(releaseTimer);
    try{await exactCheck;}catch{return api.chooseAfterDrop(data.paths);}
    const result=exactResult;
    if(!result||result.folderCount||pal.moreAimed||!pal.disc.options().length)return api.chooseAfterDrop(data.paths);
    paths=result.paths||data.paths;pal.commit();
  }
});

// ---------- drag mode ----------
api.onDrag(data => {
  selectionRequest++;
  mode = 'drag'; dropped = false; paths = null;exactCheck=null;exactResult=null; clearTimeout(releaseTimer);
  const theme = typeof data === 'string' ? data : data.theme;
  featureFlags = data.features || {};
  document.documentElement.dataset.theme = theme; document.body.className = 'drag';
  pal.open({ mode: 'drag', targets: null, features: featureFlags });
});

// Names aren't readable until the drop, only MIME types, so the options are guessed from those.
function guessFromDrag(dt) {
  const items = [...dt.items].filter(i => i.kind === 'file');
  if (!items.length) return { label: 'FILES', targets: [], tools: ['ZIP'] };
  const exts = items.map(i => Formats.extOfMime(i.type));
  const o = Features.choicesFor(exts.map(e => e || 'unknown'), featureFlags);
  return { ...o, label: items.length > 1 ? `${items.length} FILES` : (exts[0] || 'FILE').toUpperCase() };
}
document.addEventListener('dragenter', e => {
  e.preventDefault();
  if (mode !== 'drag') return;
  api.log('dragenter', [...e.dataTransfer.items].map(i => i.type).join(','));
  if (pal.disc.waiting) pal.setFiles(guessFromDrag(e.dataTransfer));
});
document.addEventListener('dragover', e => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy'; // always COPY: MOVE would make Explorer delete the originals
  if (mode === 'drag') pal.aim(e.clientX - CX, e.clientY - CY);
});
document.addEventListener('drop', async e => {
  e.preventDefault(); dropped = true; clearTimeout(releaseTimer);
  const list = [...e.dataTransfer.files].map(f => api.pathFor(f)).filter(Boolean);
  api.log('drop', list.length);
  if (mode !== 'drag' || !list.length || pal.disc.waiting) return closeNow();
  paths = list;
  // the guess came from MIME types; if the real files can't do the pick, fall back to what they can do
  const d = pal.disc, face = d.face, pick = d.value();
  pal.checking = true; pal.note.textContent = 'Checking this file before converting…';
  try {
    const real = await api.inspect(list);
    if (!pal.isOpen || d.closingAt) return;
    pal.setFiles({ ...real, label: label(list) });
    paths=real.paths||list;
    if(real.folderCount)return api.chooseAfterDrop(list);
    if (!pal.blockedChoice && (face === 'formats' ? real.targets : real.tools).includes(pick)) {
      d.face = face; d.select(d.options().indexOf(pick)); pal.commit();
    } else api.chooseAfterDrop(list);
  } catch { pal.checking = false; api.chooseAfterDrop(list); }
});

api.onHook((type, data) => {
  if (mode !== 'drag' || !pal.isOpen) return;
  api.log('hook', type, data || '');
  if (type === 'step-aside') { if (!pal.busy) { pal.vanish(); hide(); } }
  else if (type === 'release') { // the drop event follows the mouse release; no drop means it landed elsewhere
    if (!dropped && !pal.busy) releaseTimer = setTimeout(() => !dropped && closeNow(), 450);
  } else if (type === 'wheel') pal.step(data);
  else if (type === 'key') pal.key(data);
});

// ---------- click mode ----------
api.onClick(async ({ paths: list, theme, features = {} }) => {
  const request = ++selectionRequest;
  featureFlags = features;
  mode = 'click'; paths = list; document.documentElement.dataset.theme = theme; document.body.className = '';
  const o = optionsForPaths(list);
  pal.open({ mode: 'click', label: label(list), targets: [], tools: [], choices: o.choices.map(choice => ({ ...choice, reason: 'Checking files…' })),
    checking: true, note: 'Checking readability and available conversions…', features: featureFlags });
  try {
    const result = await api.inspect(list);
    if (request === selectionRequest && pal.isOpen && !pal.busy && !pal.disc.closingAt){paths=result.paths||list;pal.setFiles(result);}
  } catch (error) {
    if (request === selectionRequest && pal.isOpen && !pal.disc.closingAt) pal.setFiles({ targets: [], tools: [],
      choices: o.choices.map(choice => ({ ...choice, reason: 'Could not check this selection' })), note: String(error.message || error) });
  }
});
addEventListener('mousemove', e => { if (mode === 'click') pal.aim(e.clientX - CX, e.clientY - CY); });
addEventListener('pointerdown', e => {
  if (mode !== 'click' || pal.busy || e.target.closest('.chip, .pal-export-options, .pal-presets')) return;
  Math.hypot(e.clientX - CX, e.clientY - CY) < 120 ? pal.commit() : closeNow();
});
addEventListener('wheel', e => { if (mode === 'click' && !e.target.closest('.pal-export-options')) { e.preventDefault(); pal.step(e.deltaY > 0 ? 1 : -1); } }, { passive: false });
addEventListener('keydown', e => { if(e.target.closest?.('.chip')&&['Enter',' '].includes(e.key))return;if (e.target.closest?.('.pal-export-options') && e.key !== 'Escape') return; if (mode === 'click' && pal.key(e.key)) e.preventDefault(); });
addEventListener('blur', () => { if (mode === 'click' && !pal.busy) closeNow(); });

// ---------- result card ----------
// After a conversion the card stays where you can see it. Everything around it lets clicks through, a success
// closes itself after a few seconds (not while the mouse is on it), and a failure stays until it's dismissed.
// A new Ctrl + drag simply replaces it.
const SUCCESS_STAYS_MS = 10000;
let resultTimer = 0, resultOk = false, overCard = false;
const card = document.querySelector('.pal-work');
function armResultTimer() {
  clearTimeout(resultTimer);
  card.classList.remove('counting'); void card.offsetWidth; // restart the countdown bar
  if (resultOk && !overCard) { card.style.setProperty('--stay', `${SUCCESS_STAYS_MS}ms`); card.classList.add('counting'); resultTimer = setTimeout(() => pal.close(), SUCCESS_STAYS_MS); }
}
function stopResult() { clearTimeout(resultTimer); resultTimer = 0; overCard = false; card.classList.remove('counting'); }
card.addEventListener('mouseenter', () => { overCard = true; clearTimeout(resultTimer); card.classList.remove('counting'); api.resultInteractive(true); });
card.addEventListener('mouseleave', () => { overCard = false; api.resultInteractive(false); armResultTimer(); });
api.onDrag(stopResult); api.onClick(stopResult);

// ---------- convert ----------
async function convert(pick) {
  mode = 'click'; document.body.className = '';
  pal.start(paths, pick);
  const off = api.onProgress(f => pal.progress(f));
  let results;
  try { results = await api.convert(paths, pick.face, pick.value, pick.options); }
  catch (e) { results = [{ error: String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') }]; }
  off();
  const shown = pal.finish(results);
  resultOk = results.every(r => !r.error&&!r.cancelled);
  api.showingResult(true); armResultTimer();
  await shown;
  stopResult();
  if (!pal.isOpen) hide();
}
