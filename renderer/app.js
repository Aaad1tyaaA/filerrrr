// Main window: last conversion, recent files, drop anywhere → palette, settings.
const { rgbVar, css } = Dots;
const $ = id => document.getElementById(id);

// ---------- helpers ----------
const base = p => p.split(/[\\/]/).pop();
const folder = p => { const parts = p.split(/[\\/]/); return parts.length > 2 ? '…\\' + parts.slice(-3, -1).join('\\') : parts.slice(0, -1).join('\\'); };
const bytes = b => { const u = ['B', 'KB', 'MB', 'GB']; let i = 0; while (b >= 1024 && i < 3) { b /= 1024; i++; } return (i ? b.toFixed(b < 10 ? 1 : 0) : b) + ' ' + u[i]; };
function ago(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 45) return 'just now'; if (s < 3600) return `${Math.round(s / 60)} min ago`; if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function delta(before, after) {
  if (!before || !after) return { text: '', cls: '' };
  if (after < before) return { text: `${Math.round((1 - after / before) * 100)}% smaller`, cls: 'down' };
  const k = after / before;
  return { text: k < 1.05 ? 'About the same size' : `${k < 10 ? k.toFixed(1) : Math.round(k)}× larger`, cls: '' };
}
const ICONS = {
  image: '<path d="M4 5h16v14H4z"/><circle cx="9" cy="10" r="1.8"/><path d="m4 17 5-5 4 4 2-2 5 5"/>',
  video: '<path d="M4 6h11v12H4zM15 10l5-3v10l-5-3"/>',
  audio: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  doc: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
  folder: '<path d="M3 7h6l2 2h10v10H3z"/>',
  archive: '<path d="M4 4h16v4H4zM5 8v12h14V8M10 12h4"/>',
};
const iconKind = p => { const k = Formats.kindOfExt(Formats.norm(Formats.extOf(p))); return !Formats.extOf(p) ? 'folder' : ICONS[k] ? k : k === 'archive' ? 'archive' : 'doc'; };
const iconHtml = p => `<div class="kind"><svg class="i" viewBox="0 0 24 24">${ICONS[iconKind(p)]}</svg></div>`;
const GONE = '<div class="gone"><svg class="i" viewBox="0 0 24 24"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12l4 4M14 12l-4 4"/></svg>Moved or deleted</div>';
async function fillThumb(box, file, exists = true) {
  box.dataset.file=file;
  if (!exists) { box.innerHTML = GONE; return; }
  box.innerHTML = iconHtml(file);
  if (settings.features?.thumbnails === false) return;
  const url = await api.thumb(file);
  if (url && settings.features?.thumbnails !== false) { const img = new Image(); img.alt = ''; img.src = url; img.decode().then(() => { if (settings.features?.thumbnails !== false&&box.dataset.file===file&&box.isConnected) box.replaceChildren(img); }, () => {}); }
}
let toastT;
function toast(text, bad = false) {
  if (!bad && settings.features?.successMessages === false) return;
  const t = $('toast'); t.querySelector('span').textContent = text; t.classList.toggle('bad', bad); t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), bad ? 6000 : 3000);
}
const transition = fn => document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches ? document.startViewTransition(fn) : fn();

// ---------- theme + mark ----------
function drawMark() { // the only dots outside the palette: the dot-matrix F
  const g = $('mark').getContext('2d'); g.clearRect(0, 0, 40, 40);
  ['####', '#...', '###*', '#...', '#...'].forEach((row, y) => [...row].forEach((cell, x) => {
    g.fillStyle = cell === '*' ? `rgb(${rgbVar('--acc')})` : css('--ink'); g.globalAlpha = cell === '.' ? .16 : 1;
    g.beginPath(); g.arc(9 + x * 7.4, 5.2 + y * 7.4, 2.7, 0, 7); g.fill();
  }));
  g.globalAlpha = 1;
}
function setTheme(t) { document.documentElement.dataset.theme = t; drawMark(); }
api.onTheme(setTheme);

// segmented controls with a sliding thumb
function seg(el, value, onPick) {
  const thumb = el.querySelector('.thumb');
  const place = () => { const b = el.querySelector('[aria-pressed=true]'); if (b && thumb) { thumb.style.left = b.offsetLeft + 'px'; thumb.style.width = b.offsetWidth + 'px'; } };
  const set = v => { el.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === v)); place(); };
  el.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { set(b.dataset.v); onPick(b.dataset.v); } });
  set(value); new ResizeObserver(place).observe(el);
  return set;
}

// ---------- settings ----------
let settings = {};
const sw = (id, v) => $(id).setAttribute('aria-checked', String(v));
let setThemeSeg;
function showSettings(s) {
  settings = s; setTheme(s.effectiveTheme);
  sw('automaticUpdates',s.automaticUpdates!==false);renderUpdates(s.updates);
  sw('gestureBtn', !s.paused); sw('sGesture', !s.paused); sw('sMenu', s.contextMenu); sw('sLogin', s.openAtLogin);
  setThemeSeg && setThemeSeg(s.theme);
  $('rowMenu').hidden = s.platform !== 'win32';
  const t = s.topMenu || {};
  $('rowTop').hidden = !t.available;
  $('topBtn').disabled = !!t.busy;
  $('topBtn').textContent = t.busy ? 'Waiting…' : t.registered ? 'Remove' : 'Add';
  $('topNote').textContent = t.registered ? 'Shown at the top of the right-click menu.'
    : 'Puts “Convert with Filerrrr” at the top of the right-click menu. Unsigned builds need administrator approval once.';
  $('offer').hidden = !t.available || t.registered || s.menuOffered;
  $('ver').textContent = `Filerrrr ${s.version}`;
  document.body.dataset.sizeComparison = String(s.features?.sizeComparison !== false);
  FeatureSettings.update(s);
  updatePreferences(s);
  offerEngines(s);
  showWhatsNew(s);
  Workflows.update(s);
  render();
}
api.onSettings(showSettings);
const toggle = (id, key, invert = false) => $(id).addEventListener('click', e => {
  e.preventDefault();
  const on = $(id).getAttribute('aria-checked') !== 'true';
  api.setSettings({ [key]: invert ? !on : on }).then(showSettings);
});
toggle('gestureBtn', 'paused', true); toggle('sGesture', 'paused', true); toggle('sMenu', 'contextMenu'); toggle('sLogin', 'openAtLogin');
async function setTopMenu(on) {
  const r = await api.setTopMenu(on); showSettings(r);
  if (r.topMenuResult === 'added') toast('“Convert with Filerrrr” is now in the right-click menu');
  else if (r.topMenuResult === 'removed') toast('Removed from the right-click menu');
  else if (r.topMenuResult === 'declined') toast('Windows needs administrator approval to add it', true);
  else if (r.topMenuResult === 'failed') toast("Couldn't change the right-click menu. Details are in the log.", true);
}
$('topBtn').onclick = () => setTopMenu(!settings.topMenu.registered);
$('offerAdd').onclick = () => setTopMenu(true);
$('offerLater').onclick = () => api.setSettings({ menuOffered: true }).then(showSettings);
const drawer = on => {
  $('drawer').classList.toggle('on', on); $('drawer').hidden = !on; $('homePage').hidden = on; $('settingsBtn').hidden = on;
  scrollTo(0, 0);
  if (on) { setThemeSeg && setThemeSeg(settings.theme); $('drawerClose').focus(); }
  else $('settingsBtn').focus();
};
$('settingsBtn').onclick = () => drawer(true);
$('drawerClose').onclick = () => drawer(false);
function settingsPage(catalogue){$('everydaySettings').hidden=catalogue;$('catalogue').hidden=!catalogue;$('settingsTab').setAttribute('aria-pressed',String(!catalogue));$('formatsTab').setAttribute('aria-pressed',String(catalogue));$('settingsTitle').textContent=catalogue?'Formats & tools':'Settings';$('settingsSubtitle').textContent=catalogue?'Explore supported routes and hide what you do not use.':'Set your defaults. The palette stays focused on your files.';}
$('settingsTab').onclick=()=>settingsPage(false);$('formatsTab').onclick=()=>settingsPage(true);
const preferenceFields={destination:'destination',collision:'collision',imageQuality:'image',videoQuality:'video',videoResolution:'resolution',audioBitrate:'audio',trigger:'trigger',shortcut:'shortcut'};
function updatePreferences(s){const p=s.preferences||{};for(const [id,key] of Object.entries(preferenceFields))if(p[key]!==undefined)$(id).value=p[key];for(const [id,key] of [['openFolder','openFolder'],['learnPicks','learn'],['favouriteRing','favourites']])sw(id,p[key]!==false&&(key!=='openFolder'||p[key]===true));$('folderRow').hidden=p.destination!=='chosen';$('outputFolder').textContent=p.folder||'No folder chosen';$('shortcutNote').textContent=s.shortcut?.value!=='off'&&!s.shortcut?.registered?'Shortcut unavailable. Choose another shortcut.':'Opens a file picker when Explorer has no selection';renderEngines(s);const name=({ctrl:'Ctrl + drag',alt:'Alt + drag',shift:'Shift + drag',right:'Right drag'})[p.trigger]||'Ctrl + drag';$('gestureBtn').previousElementSibling.textContent=name;$('ctrlHint').textContent=` · ${name} in Explorer`;}
for(const [id,key] of Object.entries(preferenceFields))$(id).onchange=()=>api.setSettings({preferences:{[key]:key==='audio'?+$(id).value:$(id).value}}).then(showSettings).catch(e=>toast(e.message,true));
for(const [id,key] of [['openFolder','openFolder'],['learnPicks','learn'],['favouriteRing','favourites']])$(id).onclick=()=>api.setSettings({preferences:{[key]:$(id).getAttribute('aria-checked')!=='true'}}).then(showSettings);
$('chooseFolder').onclick=async()=>{const folder=await api.pickFolder();if(folder)showSettings(await api.setSettings({preferences:{folder,destination:'chosen'}}));};
$('forgetPicks').onclick=()=>api.clearPicks().then(showSettings);
$('importEngines').onclick=async()=>{const b=$('importEngines');b.disabled=true;$('engineMessage').textContent='Checking engine pack…';try{showSettings(await api.importEngines());$('engineMessage').textContent='Engine installed.';}catch(e){$('engineMessage').textContent=e.message;}finally{b.disabled=false;}};
// ---------- engines: one row per optional pack ----------
const mb=bytes=>`${Math.max(1,Math.round(bytes/1048576))} MB`;
const engineState={};// id → fraction while downloading
function renderEngines(s){
  const host=$('engineList');if(!host)return;host.replaceChildren();
  for(const pack of s.engines?.packs||[]){
    const row=document.createElement('div'),text=document.createElement('div'),title=document.createElement('b'),note=document.createElement('small'),button=document.createElement('button');
    row.className='row engine-row';row.dataset.engine=pack.id;title.textContent=pack.name;const busy=pack.id in engineState;
    note.textContent=busy?`Downloading… ${Math.round(engineState[pack.id]*100)}%`:pack.builtIn?`${pack.detail} Built into this copy.`:pack.system?`${pack.detail} Found on this PC and in use: ${pack.system}`:pack.installed?`${pack.detail} Installed · ${mb(pack.size)} on disk.`:`${pack.detail} ${mb(pack.download)} download.`;
    if(pack.system&&!busy)note.title=pack.system;
    button.className='btn sm'+(!pack.installed&&!busy?' primary':'');button.disabled=pack.builtIn;
    button.textContent=busy?'Cancel':pack.builtIn?'Built in':pack.system?`Use own copy · ${mb(pack.download)}`:pack.installed?'Remove':`Install · ${mb(pack.download)}`;
    button.title=pack.system?'Download the version Filerrrr is tested with instead of the copy on this PC':'';
    button.onclick=()=>busy?api.cancelEngine(pack.id):pack.system?installEngine(pack.id):pack.installed?removeEngine(pack):installEngine(pack.id);
    text.append(title,note);row.append(text,button);host.append(row);
  }
}
async function installEngine(id){
  if(id in engineState)return;engineState[id]=0;renderEngines(settings);
  try{const next=await api.downloadEngine(id);delete engineState[id];showSettings(next);toast(`${next.engines.packs.find(p=>p.id===id).name} installed`);}
  catch(e){delete engineState[id];renderEngines(settings);toast(String(e.message||e).replace(/^Error invoking remote method '[^']+': (Error: )?/,''),true);}
}
async function removeEngine(pack){
  try{const next=await api.removeEngine(pack.id);showSettings(next);toast(next.restartNeeded?`${pack.name} will be removed when Filerrrr restarts`:`${pack.name} removed`);}
  catch(e){toast(String(e.message||e).replace(/^Error invoking remote method '[^']+': (Error: )?/,''),true);}
}
// progress for every download, including the ones the installer asked for; null means it ended
api.onEngineProgress(({id,fraction})=>{if(fraction===null){delete engineState[id];return;}const fresh=!(id in engineState);engineState[id]=fraction;const note=document.querySelector(`[data-engine="${id}"] small`);if(fresh&&settings)renderEngines(settings);else if(note)note.textContent=`Downloading… ${Math.round(fraction*100)}%`;});
// after an update: what changed, once
let whatsNewShown=false;
function showWhatsNew(s){
  if(whatsNewShown||!s.whatsNew||$('enginePicker').open)return;whatsNewShown=true;
  $('whatsNewTitle').textContent=`What’s new in Filerrrr ${s.whatsNew.version}`;
  $('whatsNewList').replaceChildren(...s.whatsNew.notes.map(note=>{const li=document.createElement('li');li.textContent=note;return li;}));
  $('whatsNew').onclose=async()=>showSettings(await api.setSettings({whatsNewSeen:true}));$('whatsNew').showModal();
}
// first run: ask once which optional engines to add
let pickerShown=false;
function offerEngines(s){
  if(pickerShown||!s.enginePicker)return;pickerShown=true;
  const list=$('enginePickList');list.replaceChildren();
  for(const pack of s.engines.packs.filter(p=>!p.installed&&!p.builtIn)){const label=document.createElement('label'),box=document.createElement('input'),text=document.createElement('span');label.className='workflow-check engine-pick';box.type='checkbox';box.value=pack.id;text.innerHTML='';const b=document.createElement('b');b.textContent=`${pack.name} · ${mb(pack.download)}`;const small=document.createElement('small');small.textContent=pack.detail;text.append(b,small);label.append(box,text);list.append(label);}
  $('enginePicker').onclose=async()=>{const chosen=$('enginePicker').returnValue==='install'?[...list.querySelectorAll('input:checked')].map(box=>box.value):[];showSettings(await api.setSettings({enginesOffered:true}));for(const id of chosen)installEngine(id);};
  $('enginePicker').showModal();
}
FeatureSettings.init(showSettings);
Workflows.init({saved:showSettings,toast,run:(files,pick)=>{if(pal.isOpen)return;pending=files;cx=innerWidth/2;cy=Math.min(innerHeight/2,380);palEl.style.left=cx-Palette.CENTER+'px';palEl.style.top=cy-Palette.CENTER+'px';pal.open({mode:'click',label:files.length>1?`${files.length} FILES`:(Formats.extOf(files[0])||'FILE').toUpperCase(),targets:[],tools:[]});pal.disc.progress(0);convert(pick);}});
function renderUpdates(value){const state=value||{phase:'blocked',manual:true,message:'Updates are manual. Download the latest installer from Releases.'};$('updateStatus').textContent=state.message;$('automaticUpdatesRow').hidden=state.manual===true;$('checkUpdates').hidden=state.manual===true;$('checkUpdates').disabled=['blocked','checking','downloading','ready'].includes(state.phase);$('downloadUpdate').hidden=state.phase!=='available';$('installUpdate').hidden=state.phase!=='ready';$('updateProgress').hidden=state.phase!=='downloading';$('updateProgress').value=state.percent||0;}
api.onUpdates(renderUpdates);
$('automaticUpdates').onclick=()=>api.setSettings({automaticUpdates:!settings.automaticUpdates}).then(showSettings);
for(const [id,action]of [['checkUpdates','checkUpdates'],['downloadUpdate','downloadUpdate'],['installUpdate','installUpdate']])$(id).onclick=async()=>{try{const state=await api[action]();if(state)renderUpdates(state);}catch(error){toast(error.message,true);}};
$('openReleases').onclick=()=>api.openReleases();
$('clearBtn').onclick = async () => { hist = await api.clearHistory(); render(); drawer(false); toast('History cleared'); };
$('pruneBtn').onclick=async()=>{const result=await api.pruneHistory();hist=result.history;render();toast(result.removed?`Removed ${result.removed} missing history entries`:'No missing history entries');};

// ---------- history ----------
let hist = { items: [] }, kindFilter = 'all', query = '', freshCount = 0,selecting=false;
const selectedHistory=new Set();
const selectHistoryButton=document.createElement('button');selectHistoryButton.className='btn sm';selectHistoryButton.textContent='Select';selectHistoryButton.id='selectHistory';selectHistoryButton.onclick=()=>{selecting=!selecting;selectedHistory.clear();renderGallery();};$('recentHead').querySelector('.filters').append(selectHistoryButton);
function updateSelection(){const selected=hist.items.filter(item=>selectedHistory.has(item.output));$('historySelection').hidden=!selecting;$('selectedCount').textContent=`${selected.length} selected`;$('convertSelected').disabled=$('removeSelected').disabled=!selected.length;selectHistoryButton.setAttribute('aria-pressed',String(selecting));}
$('cancelSelection').onclick=()=>{selecting=false;selectedHistory.clear();renderGallery();};
$('convertSelected').onclick=e=>{const files=[...new Set(hist.items.filter(item=>selectedHistory.has(item.output)).map(item=>item.input))];openPalette(files,e.clientX,e.clientY);};
$('removeSelected').onclick=async()=>{hist=await api.removeHistory([...selectedHistory]);selectedHistory.clear();render();};
const KIND_GROUP = { image: 'image', video: 'video', audio: 'audio', pdf: 'docs', doc: 'docs', sheet: 'docs', data: 'docs', subtitle: 'docs', archive: 'docs' };
const describe = x => {
  const ext = Formats.norm(Formats.extOf(x.input));
  return { ...x, group: KIND_GROUP[Formats.kindOfExt(ext)] || 'docs', from: x.count > 1 ? `${x.count} files` : ext.toUpperCase(),
    to: x.face === 'tools' ? Formats.TOOL_NAMES[x.pick] || x.pick : x.pick };
};

let spotRequest=0,spotKey='';
async function renderSpot() {
  const request=++spotRequest,items=hist.items;
  const found=items.length?await api.existing(items.map(item=>item.output)):[];
  if(request!==spotRequest)return;
  const latest=items.find((_item,index)=>found[index]),x=latest&&describe(latest);
  $('spot').hidden = !x;
  $('well').classList.toggle('big', !x); $('demo').hidden = !!x; $('recentHead').hidden = !items.length; $('ctrlHint').hidden = !x;
  const trigger=({ctrl:'Ctrl + drag',alt:'Alt + drag',shift:'Shift + drag',right:'Right-button drag'})[settings.preferences?.trigger]||'Ctrl + drag';
  $('wellTitle').textContent = x ? 'Drop more files anywhere in this window' : `${trigger} a file from Explorer, or browse below`;
  $('gestureBtn').setAttribute('aria-label',`${trigger} gesture`);$('gestureBtn').closest('label').title=`Use ${trigger} in Explorer to open the palette`;
  if (!x) return;
  $('spot').classList.remove('missing');
  fillThumb($('pv'), x.output, true);
  if (x.extra) $('pv').insertAdjacentHTML('beforeend', `<span class="more">+${x.extra} more</span>`);
  $('pvWhen').textContent = `Converted ${ago(x.at)} · ${folder(x.output)}`;
  $('pvName').textContent = base(x.output);
  const tag = (t, cls) => { const s = document.createElement('span'); s.className = 'tag ' + cls; s.textContent = t; return s; };
  $('pvRoute').replaceChildren(tag(x.from, ''), '→', tag(x.to, 'to'), document.createTextNode(` from ${base(x.input)}`));
  const max = Math.max(x.before, x.after, 1);
  const key=`${x.output}:${x.at}`;
  if(spotKey!==key){spotKey=key;$('bBefore').style.width = $('bAfter').style.width = '0';
    requestAnimationFrame(() => requestAnimationFrame(() => { $('bBefore').style.width = `${x.before / max * 100}%`; $('bAfter').style.width = `${x.after / max * 100}%`; }));}
  $('sBefore').textContent = bytes(x.before); $('sAfter').textContent = bytes(x.after);
  const d = delta(x.before, x.after); $('pvDelta').textContent = d.text; $('pvDelta').className = 'delta ' + d.cls;
  $('openBtn').onclick = () => api.open(x.output);
  $('folderBtn').onclick = () => api.reveal(x.output);
  $('againBtn').onclick = e => openPalette([x.input], e.clientX, e.clientY);
}

function renderGallery() {
  updateSelection();
  const q = query.toLowerCase();
  const items = hist.items.map(describe).filter(x => (kindFilter === 'all' || x.group === kindFilter) && (!q || (base(x.output) + ' ' + x.from + ' ' + x.to).toLowerCase().includes(q)));
  $('count').textContent = hist.items.length ? String(hist.items.length) : '';
  const g = $('gallery'); g.innerHTML = '';
  if (!hist.items.length) return;
  if (!items.length) { g.innerHTML = '<div class="none">Nothing matches.</div>'; return; }
  const tiles = [];
  let group='';const today=new Date();today.setHours(0,0,0,0);const yesterday=new Date(today);yesterday.setDate(yesterday.getDate()-1);
  items.slice(0, 120).forEach((x, i) => {
    const date=x.at>=+today?'Today':x.at>=+yesterday?'Yesterday':'Earlier';if(date!==group){group=date;const heading=document.createElement('h3');heading.className='history-group';heading.textContent=date;g.append(heading);}
    const t = document.createElement('div');
    t.className = 'tile' + (i < freshCount ? ' new' : ''); t.tabIndex = 0; t.style.setProperty('--k', Math.min(i, 14));
    t.title = x.output;
    if(selecting){t.classList.toggle('selected',selectedHistory.has(x.output));t.setAttribute('role','checkbox');t.setAttribute('aria-checked',String(selectedHistory.has(x.output)));}
    t.innerHTML = `<div class="thumb"></div>
      <div class="acts"><button title="Show in folder" aria-label="Show in folder"><svg class="i" viewBox="0 0 24 24">${ICONS.folder}</svg></button>
        <button title="Convert again" aria-label="Convert again"><svg class="i" viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4"/></svg></button></div>
      <div class="meta"><div class="name"></div><div class="sub"><span></span><span class="delta"></span></div></div>`;
    t.querySelector('.name').textContent = base(x.output);
    t.querySelector('.sub span').textContent = `${x.from} → ${x.to} · ${ago(x.at)}`;
    const d = delta(x.before, x.after), de = t.querySelector('.sub .delta');
    de.textContent = d.cls ? `−${d.text.replace(' smaller', '')}` : ''; de.className = 'delta ' + d.cls;
    const [revealB, againB] = t.querySelectorAll('.acts button');
    revealB.onclick = e => { e.stopPropagation(); api.reveal(x.output); };
    againB.onclick = e => { e.stopPropagation(); openPalette([x.input], e.clientX, e.clientY); };
    const act=()=>{if(selecting){selectedHistory.has(x.output)?selectedHistory.delete(x.output):selectedHistory.add(x.output);renderGallery();}else api.open(x.output);};
    t.onclick = act;
    t.onkeydown = e => { if (e.key === 'Enter'||e.key===' '){e.preventDefault();act();} };
    g.appendChild(t);
    tiles.push([t, x.output]);
  });
  // one round trip for every tile: moved or deleted files get a clear state instead of an empty preview
  api.existing(tiles.map(([, p]) => p)).then(found => tiles.forEach(([t, p], i) => {
    const here = found[i] !== false;
    t.classList.toggle('missing', !here);
    if (!here) t.title = `${p}
This file has been moved or deleted`;
    fillThumb(t.querySelector('.thumb'), p, here);
  }));
}
const render = () => { renderSpot(); renderGallery(); freshCount = 0; };
$('q').addEventListener('input', e => { query = e.target.value; renderGallery(); });
seg($('kindSeg'), 'all', v => { kindFilter = v; renderGallery(); });
setThemeSeg = seg($('themeSeg'), 'system', v => api.setSettings({ theme: v }).then(showSettings));
api.onHistory(h => { freshCount = Math.max(0, h.items.length - hist.items.length) || 1; hist = h; transition(render); });
addEventListener('scroll', () => $('bar').classList.toggle('scrolled', scrollY > 4), { passive: true });

// ---------- palette (drop or browse in this window) ----------
const palEl = $('pal');
let pending = null, cx = 0, cy = 0;
const pal = new Palette(palEl, { onCommit: pick => convert(pick), onCancel: () => { pending = null; }, onOpen: p => api.open(p), onReveal: p => api.reveal(p),onAbort:()=>api.cancelConversion(),onUndo:token=>api.undo(token),onRetry:(paths,pick)=>{pending=paths;convert(pick);} });
api.onUndone(result=>pal.applyUndo(result.token,result));
let selectionRequest = 0;
async function openPalette(paths, x, y) {
  if (!paths.length || pal.isOpen) return;
  pending = paths;
  const request = ++selectionRequest;
  const o = Features.choicesFor(paths.map(Formats.extOf), settings.features);
  cx = Math.min(Math.max(x, 240), innerWidth - 240); cy = Math.min(Math.max(y, 240), innerHeight - 370);
  palEl.style.left = cx - Palette.CENTER + 'px'; palEl.style.top = cy - Palette.CENTER + 'px';
  pal.open({ mode: 'click', label: paths.length > 1 ? `${paths.length} FILES` : (Formats.extOf(paths[0]) || 'FILE').toUpperCase(),
    targets: [], tools: [], choices: o.choices.map(choice => ({ ...choice, reason: 'Checking files…' })), checking: true,
    note: 'Checking readability and available conversions…', features: settings.features });
  try {
    const result = await api.inspect(paths);
    if (request === selectionRequest && pal.isOpen && !pal.busy && !pal.disc.closingAt){pending=result.paths||paths;pal.setFiles(result);}
  } catch (error) {
    if (request === selectionRequest && pal.isOpen && !pal.disc.closingAt) pal.setFiles({ targets: [], tools: [],
      choices: o.choices.map(choice => ({ ...choice, reason: 'Could not check this selection' })), note: String(error.message || error) });
  }
}
async function convert(pick) {
  pal.start(pending, pick);
  const off = api.onProgress(f => pal.progress(f));
  let results;
  try { results = await api.convert(pending, pick.face, pick.value, pick.options); }
  catch (e) { results = [{ error: String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') }]; }
  off(); pending = null;
  const failed = results.filter(r => r.error&&!r.cancelled),cancelled=results.filter(r=>r.cancelled), ok = results.length - failed.length-cancelled.length;
  if(cancelled.length)toast(ok?`Cancelled. ${ok} completed files kept.`:'Cancelled. Unfinished outputs removed.');
  else if (failed.length) toast(`${failed.length} of ${results.length} failed: ${failed[0].error}`, true);
  else toast(ok === 1 ? `Saved ${base(results[0].output)}` : `${ok} files converted`);
  await pal.finish(results);
}

// drop anywhere
let dragDepth = 0;
addEventListener('dragenter', e => { e.preventDefault(); if (++dragDepth === 1 && !pal.isOpen) $('scrim').classList.add('on'); });
addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('scrim').classList.remove('on'); } });
addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
addEventListener('drop', e => {
  e.preventDefault(); dragDepth = 0; $('scrim').classList.remove('on');
  openPalette([...e.dataTransfer.files].map(f => api.pathFor(f)).filter(Boolean), e.clientX, e.clientY);
});
async function pickFiles() {
  const paths = await api.pickFiles();
  openPalette(paths, innerWidth / 2, Math.min(innerHeight / 2, 380));
}
$('pickBtn').onclick = pickFiles;
const folderButton=document.createElement('button');folderButton.className='btn sm';folderButton.textContent='Browse folder';folderButton.id='pickFolderBtn';folderButton.onclick=async()=>openPalette(await api.pickInputFolder(),innerWidth/2,Math.min(innerHeight/2,380));$('pickBtn').after(folderButton);

addEventListener('pointermove', e => { if (pal.isOpen) pal.aim(e.clientX - cx, e.clientY - cy); });
addEventListener('pointerdown', e => {
  if (!pal.isOpen || pal.busy || e.target.closest('.chip, .pal-export-options, .pal-presets')) return;
  e.preventDefault(); e.stopPropagation();
  Math.hypot(e.clientX - cx, e.clientY - cy) < 120 ? pal.commit() : pal.cancel();
}, true);
addEventListener('click', e => { if (pal.isOpen && !e.target.closest('.pal-work-actions, .pal-export-options, .pal-presets')) e.stopPropagation(); }, true);
addEventListener('wheel', e => { if (pal.isOpen && !e.target.closest('.pal-export-options')) { e.preventDefault(); pal.step(e.deltaY > 0 ? 1 : -1); } }, { passive: false });
addEventListener('keydown', e => {
  if(e.target.closest?.('.chip')&&['Enter',' '].includes(e.key))return;
  if (e.target.closest?.('.pal-export-options') && e.key !== 'Escape') return;
  if (pal.isOpen) { if (pal.key(e.key)) e.preventDefault(); return; }
  if (e.key === 'Escape' && $('drawer').classList.contains('on')) return drawer(false);
  if (['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)) { if (e.key === 'Escape') document.activeElement.blur(); return; }
  if(!$('drawer').hidden)return;
  if (e.key === '/') { e.preventDefault(); $('q').focus(); }
  else if (e.key.toLowerCase() === 'o' && !e.ctrlKey && !e.altKey && !e.metaKey) pickFiles();
});

// ---------- start ----------
setInterval(render, 60000); // keep "min ago" fresh
addEventListener('blur',()=>document.body.classList.add('inactive'));addEventListener('focus',()=>document.body.classList.remove('inactive'));
(async () => {
  showSettings(await api.settings());
  hist = await api.history();
  render();
})();
