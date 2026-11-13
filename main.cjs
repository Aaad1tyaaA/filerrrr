// Filerrrr main process: tray, main window, the palette overlay (opened by Ctrl + drag or the right-click menu),
// conversions and settings.
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, shell, dialog, nativeImage, nativeTheme, Notification,globalShortcut } = require('electron');
const fs = require('fs'), path = require('path');
if(process.argv.includes('--engine-worker')){require('./conversion-worker.cjs');return;}
const testProfile=require('./test-profile.cjs').prepare(process.env.FILERRRR_TEST_DATA_DIR);
if(testProfile)app.setPath('userData',testProfile);

if (!app.requestSingleInstanceLock()) { app.quit(); return; }

const { run, killAll } = require('./conversion-client.cjs');
const { createStore } = require('./store.cjs');
const Features = require('./features.js'), Formats = require('./formats.js');
const { createGesture } = require('./gesture.cjs');
const contextMenu = require('./contextmenu.cjs');
const topMenu = require('./topmenu.cjs');
const Preferences=require('./preferences.cjs'),Picks=require('./picks.cjs');
const Selection=require('./selection.cjs');
const {createUndo}=require('./undo.cjs');
const undoManager=createUndo({trash:file=>shell.trashItem(file)});
const activeJobs=new Map(),sessionFiles=new Set();
const Recipes=require('./recipes.cjs');let watcher,updates;

const R = f => path.join(__dirname, 'renderer', f);
const ICON_PNG = path.join(__dirname, 'build', 'icon.png');
const ICON_ICO = path.join(__dirname, 'build', 'icon.ico');
let win, overlay, tray, store, quitting = false;

// ---------- logging: errors to <userData>/filerrrr.log; FILERRRR_DEBUG=<file> adds a gesture trace ----------
let logFile;
function log(...a) {
  try {
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 1e6) fs.renameSync(logFile, logFile + '.old');
    fs.appendFileSync(logFile, `${new Date().toISOString()} ${a.map(x => x instanceof Error ? x.stack : String(x)).join(' ')}\n`);
  } catch { /* nowhere to log */ }
}
const dbg = (...a) => process.env.FILERRRR_DEBUG && fs.appendFileSync(process.env.FILERRRR_DEBUG, `${Date.now() % 100000} ${a.join(' ')}\n`);
process.on('uncaughtException', e => log('uncaught', e));
process.on('unhandledRejection', e => log('unhandled', e));

// ---------- history ----------
const historyView = () => ({ converted: store.data.converted, saved: store.data.saved, items: store.data.history });
const historyOutputs = item => [...new Set([item.output,...(Array.isArray(item.outputs)?item.outputs:[])].filter(file=>typeof file==='string'&&path.isAbsolute(file)))];
function record(results, face, pick) {
  const ok = results.filter(r => !r.error&&!r.cancelled);
  for(const result of ok)for(const output of result.outputs||[result.output])if(output){sessionFiles.add(output);if(sessionFiles.size>1000)sessionFiles.delete(sessionFiles.values().next().value);}
  if (!ok.length) return;
  store.set({
    picks:store.data.preferences.learn?Picks.record(store.data.picks,results,face,pick):store.data.picks,
    converted: store.data.converted + ok.reduce((n, r) => n + r.count, 0),
    saved: store.data.saved + ok.reduce((n, r) => n + Math.max(0, r.before - r.after), 0),
    history: store.data.features.history ? [...ok.map(r => ({ output: r.output, outputs:r.outputs, input: r.input, count: r.count, extra: r.outputs.length - 1, face, pick, before: r.before, after: r.after, at: Date.now() })), ...store.data.history].slice(0, 200) : store.data.history,
  });
  send(win, 'history', historyView());
}
const send = (w, ch, ...a) => w && !w.isDestroyed() && w.webContents.send(ch, ...a);

// ---------- theme ----------
const effectiveTheme = () => store.data.theme === 'system' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : store.data.theme;
function applyTheme() {
  const t = effectiveTheme();
  if (win) win.setTitleBarOverlay({ color: '#00000000', symbolColor: t === 'light' ? '#191918' : '#ededec' });
  send(win, 'theme', t);
}

// ---------- windows ----------
const secure = { preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false };
function createWindow() {
  win = new BrowserWindow({
    width: 1200, height: 860, minWidth: 720, minHeight: 600, show: false, icon: ICON_PNG,
    backgroundColor: effectiveTheme() === 'light' ? '#f4f3f0' : '#0e0e0f',
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#00000000', symbolColor: effectiveTheme() === 'light' ? '#191918' : '#ededec', height: 48 },
    webPreferences: secure,
  });
  win.loadFile(R('index.html'));
  win.once('ready-to-show', () => { if (!process.argv.includes('--hidden') && !pendingFromArgv) win.show(); });
  const created=win;
  win.on('close', e => { if (!quitting&&activeJobs.has(created.webContents.id)) { e.preventDefault(); created.hide(); } });
  win.on('closed',()=>{if(win===created)win=null;thumbs.clear();thumbnailAbort.abort();thumbnailAbort=new AbortController();});
  win.on('focus', () => { send(win, 'focus'); recheckTopMenu(); });
}

const OW = 540, OH = 600, OCX = 270, OCY = 230; // room below the disc for conversion progress and results
function createOverlay() {
  overlay = new BrowserWindow({
    width: OW, height: OH, show: false, frame: false, transparent: true, resizable: false, movable: false, minimizable: false,
    maximizable: false, fullscreenable: false, skipTaskbar: true, hasShadow: false, alwaysOnTop: true,
    focusable: false, // during a drag it must never take focus, or Explorer's drag would break
    // never focused, so Chromium would throttle its animations; it is small and only shown briefly
    webPreferences: { ...secure, backgroundThrottling: false },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.loadFile(R('overlay.html'));
}
function placeOverlay(c) { overlay.setBounds({ x: Math.round(c.x - OCX), y: Math.round(c.y - OCY), width: OW, height: OH }); }
function hideOverlay() {
  if(!overlay||overlay.isDestroyed())return;
  overlay.hide();
  overlay.setIgnoreMouseEvents(false);
  if (overlayMode === 'click') overlay.setFocusable(false);
  overlayMode = null; overlayResult = false; gesture.closed(); dbg('hide');
  nativeDrop?.enable(overlay,false);
  const closed=overlay;setTimeout(()=>{if(overlay===closed&&!overlayMode&&!activeJobs.has(closed.webContents.id)){nativeDrop?.remove(closed);closed.destroy();overlay=null;}},12000).unref?.();
}
// overlayResult: the overlay only shows a finished conversion. Then it is click-through except for its card,
// and a new Ctrl + drag replaces it instead of being blocked by it.
let overlayMode = null, overlayResult = false;
function showResultOverlay(on) {
  overlayResult = !!on;
  overlay.setIgnoreMouseEvents(overlayResult, { forward: true });
  if (!overlayResult) return;
  gesture.closed(); // the drag that opened this palette is over; the next Ctrl + drag starts a new one
  // the drag is over, so the card can move fully onto the screen (the palette may have opened near an edge)
  const b = overlay.getBounds(), area = screen.getDisplayMatching(b).workArea;
  overlay.setBounds({ ...b, x: Math.min(Math.max(b.x, area.x), area.x + area.width - b.width), y: Math.min(Math.max(b.y, area.y), area.y + area.height - b.height) });
}

// ---------- Ctrl + drag ----------
const gesture = createGesture();
const toDip = (x, y) => process.platform === 'win32' ? screen.screenToDipPoint({ x, y }) : { x, y };
// The hook's own Ctrl flag goes stale when it misses a key event (e.g. while an elevated window has focus),
// so on Windows ask the OS directly.
const ctrlHeld = (() => {
  if (process.platform !== 'win32') return e => e.ctrlKey;
  const GetAsyncKeyState = require('koffi').load('user32.dll').func('short __stdcall GetAsyncKeyState(int vk)');
  return e => {const trigger=store.data.preferences.trigger;if(trigger==='right')return gesture.state.held;const [flag,vk]=({alt:['altKey',0x12],shift:['shiftKey',0x10],ctrl:['ctrlKey',0x11]})[trigger];return e[flag]||(GetAsyncKeyState(vk)&0x8000)!==0;};
})();
const KEY_NAMES = {};
function startHook() {
  const { uIOhook, UiohookKey } = require('uiohook-napi');
  for (const [name, code] of Object.entries(UiohookKey)) {
    if (/^[A-Z0-9]$/.test(name) || ['Tab', 'Escape', 'Enter', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(name)) KEY_NAMES[code] = name;
  }
  const dragging = () => overlayMode === 'drag';
  uIOhook.on('mousedown', e => {
    if (e.button !== (store.data.preferences.trigger==='right'?2:1) || (overlayMode === 'click' && !overlayResult)) return;
    gesture.down(e.x, e.y);
    // the idle overlay is destroyed to save memory; start rebuilding it now so the palette is ready by the drag threshold
    if (!store.data.paused && (store.data.preferences.trigger==='right' || ctrlHeld(e))) awaitOverlay();
  });
  uIOhook.on('mousemove', e => {
    if (overlayMode === 'click' && !overlayResult) return;
    const a = gesture.move({ x: e.x, y: e.y }, toDip(e.x, e.y), ctrlHeld(e), store.data.paused);
    if (!a) return;
    dbg(a.type, Math.round(a.center?.x ?? 0), Math.round(a.center?.y ?? 0));
    if (a.type === 'open') { awaitOverlay().then(()=>{
      if (overlayResult) { overlay.setIgnoreMouseEvents(false); overlay.setFocusable(false); overlayResult = false; } // a new drag replaces the old result
      if(!gesture.state.held||gesture.state.stepped||store.data.paused)return;overlayMode = 'drag';nativeDrop?.enable(overlay,true); placeOverlay(a.center); overlay.showInactive(); send(overlay, 'overlay:drag', { theme: effectiveTheme(), features: store.data.features }); });}
    else if (a.type === 'place') placeOverlay(a.center);
    else if (a.type === 'step-aside') send(overlay, 'overlay:hook', 'step-aside');
  });
  uIOhook.on('mouseup', e => { if (e.button === (store.data.preferences.trigger==='right'?2:1)) { const a = gesture.up(); if (a && dragging()) send(overlay, 'overlay:hook', 'release'); } });
  uIOhook.on('wheel', e => dragging() && send(overlay, 'overlay:hook', 'wheel', e.rotation > 0 ? 1 : -1));
  uIOhook.on('keydown', e => dragging() && KEY_NAMES[e.keycode] && send(overlay, 'overlay:hook', 'key', KEY_NAMES[e.keycode]));
  uIOhook.start();
  app.on('will-quit', () => { try { uIOhook.stop(); } catch { /* stopped */ } });
}

// ---------- right-click menu / Send To: files arrive as arguments ----------
let pendingFromArgv = false, incoming = [], incomingTimer = null;
function receivePaths(paths) {
  const files = paths.filter(p => { try { return path.isAbsolute(p) && (fs.statSync(p).isFile()||fs.statSync(p).isDirectory()); } catch { return false; } });
  if (!files.length) return;
  incoming.push(...files);
  clearTimeout(incomingTimer); // Explorer starts one process per file; gather them
  incomingTimer = setTimeout(() => { const list = [...new Set(incoming)]; incoming = []; openClickPalette(list); }, 350);
}
async function openClickPalette(paths) {
  await awaitOverlay();
  if(activeJobs.has(overlay.webContents.id)){overlay.show();overlay.focus();return;}
  if (overlayMode === 'drag') return;
  const cur = screen.getCursorScreenPoint(), area = screen.getDisplayNearestPoint(cur).workArea;
  const c = { x: Math.min(Math.max(cur.x, area.x + OCX), area.x + area.width - (OW - OCX)), y: Math.min(Math.max(cur.y, area.y + OCY), area.y + area.height - (OH - OCY)) };
  overlayMode = 'click';
  nativeDrop?.enable(overlay,false);
  placeOverlay(c);
  overlay.setFocusable(true); overlay.show(); overlay.focus();
  send(overlay, 'overlay:click', { paths, theme: effectiveTheme(), features: store.data.features });
}
const appArgs = () => app.isPackaged ? [] : [app.getAppPath()];
const menuOpts = () => ({ exe: process.execPath, appPath: app.isPackaged ? '' : app.getAppPath(), icon: app.isPackaged ? process.execPath : ICON_ICO });
const sendToLink = () => path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'SendTo', 'Filerrrr.lnk');
async function syncShellIntegration() {
  if(testProfile)return;
  if (process.platform !== 'win32') return;
  try {
    await contextMenu.sync(menuOpts(), store.data.contextMenu);
    if (store.data.contextMenu) {
      shell.writeShortcutLink(sendToLink(), { target: process.execPath, args: [...appArgs().map(a => `"${a}"`), '--convert'].join(' '),
        icon: menuOpts().icon, iconIndex: 0, description: 'Convert with Filerrrr' });
    } else fs.rmSync(sendToLink(), { force: true });
  } catch (e) { log('shell integration', e); }
}

// Windows 11 top-level menu (needs the DLL + package from the installer next to Filerrrr.exe)
const exeDir = () => path.dirname(process.execPath);
let topMenuState = { available: false, present: false, registered: false, busy: false };
// After an update Windows can refuse to load the menu handler (E_ACCESSDENIED) until the package is re-registered.
// Repair at startup, again a little later (Windows may still be settling right after the installer), and when the
// window comes up while it is still broken. Every outcome is logged.
const REPAIR_RETRIES = [15e3, 60e3, 5 * 60e3];
let repairTimer = null, repairAttempt = 0, lastRepair = 0, repairing = null;
async function refreshTopMenu(repair = false) {
  if(testProfile){topMenuState={available:false,present:false,registered:false,busy:false};return;}
  const available = app.isPackaged && topMenu.available(exeDir());
  let present = topMenuState.present;
  if (available && repair) {
    repairing ||= topMenu.repair(exeDir()).finally(() => { repairing = null; });
    const r = await repairing;
    lastRepair = Date.now(); present = r.present;
    if (r.repaired) log('top menu', `repaired the Explorer menu registration (attempt ${repairAttempt + 1})`);
    else if (r.present && !r.ok) log('top menu', `repair attempt ${repairAttempt + 1} failed: ${r.detail}`);
    clearTimeout(repairTimer);
    if (r.present && !r.ok && repairAttempt < REPAIR_RETRIES.length) {
      repairTimer = setTimeout(() => refreshTopMenu(true).catch(e => log('top menu retry', e)), REPAIR_RETRIES[repairAttempt++]);
    } else if (r.ok) repairAttempt = 0;
  } else present = available && await topMenu.isPresent(); // after Add / Remove
  if (!present) { clearTimeout(repairTimer); repairAttempt = 0; } // removed on purpose: stop retrying
  topMenuState = { available, present: !!present, registered: available && await topMenu.isRegistered(), busy: false };
  send(win, 'settings', settingsView());
}
// Opening the window (or Settings) re-checks a broken menu, at most once a minute.
function recheckTopMenu() {
  if (topMenuState.available && topMenuState.present && !topMenuState.registered && !repairing && Date.now() - lastRepair > 60e3) {
    refreshTopMenu(true).catch(e => log('top menu recheck', e));
  }
}
async function changeTopMenu(on) {
  if (!topMenuState.available || topMenuState.busy) return settingsView();
  topMenuState.busy = true; send(win, 'settings', settingsView());
  let result = 'failed';
  try { result = on ? await topMenu.add(exeDir()) : (await topMenu.remove()) ? 'removed' : 'failed'; } catch (e) { log('top menu', e); }
  if (result === 'failed') log('top menu', on ? 'add failed' : 'remove failed');
  store.set({ menuOffered: true });
  await refreshTopMenu();
  return { ...settingsView(), topMenuResult: result };
}

// ---------- tray ----------
function trayMenu() {
  return Menu.buildFromTemplate([
    { label: 'Open Filerrrr', click: showWindow },
    {label:'Convert files…',click:chooseAndConvert},
    ...store.data.history.filter(item=>fs.existsSync(item.output)).slice(0,3).map(item=>({label:path.basename(item.output).slice(0,55),click:()=>shell.showItemInFolder(item.output)})),
    { type: 'separator' },
    { label: 'Pause drag gesture', type: 'checkbox', checked: store.data.paused, click: m => setSettings({ paused: m.checked }) },
    { type: 'separator' },
    { label: 'Quit Filerrrr', click: () => { quitting = true; app.quit(); } },
  ]);
}
function showWindow() { if (!win||win.isDestroyed())createWindow();if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
let overlayReady;
function awaitOverlay(){
  if(overlay&&!overlay.isDestroyed())return overlayReady||Promise.resolve();
  createOverlay();overlayReady=new Promise(resolve=>overlay.webContents.once('did-finish-load',()=>{nativeDrop?.install(overlay);resolve();}));return overlayReady;
}
async function chooseAndConvert(){const {filePaths}=await dialog.showOpenDialog({properties:['openFile','multiSelections']});if(filePaths.length)await openClickPalette(filePaths);}
let shortcutState={registered:false,value:'off'};
function registerShortcut(){
  if((testProfile&&process.env.FILERRRR_TEST_SHORTCUT!=='1')||!globalShortcut)return;globalShortcut.unregisterAll();const value=store.data.preferences.shortcut;
  shortcutState={value,registered:value!=='off'&&globalShortcut.register(value,async()=>{const paths=nativeDrop?.selected()||[];paths.length?openClickPalette(paths):chooseAndConvert();})};
}
let nativeDrop;

// ---------- what's new: shown once after an update, never on a fresh install ----------
function whatsNew(){const seen=store.data.lastVersion,version=app.getVersion();if(!seen||seen===version)return null;let notes=[];try{notes=require('./whats-new.json')[version]||[];}catch{/* no notes */}return notes.length?{version,notes}:null;}
function markFirstRunVersion(){
  // a profile that has never recorded a version: a fresh install, unless it already has history from an older Filerrrr
  if(store.data.lastVersion)return;const used=store.data.converted>0||store.data.history.length>0||store.data.onboarding;
  store.set({lastVersion:used?'0.0.0':app.getVersion()});
}
// ---------- settings ----------
const settingsView = () => ({ paused: store.data.paused, theme: store.data.theme, effectiveTheme: effectiveTheme(), contextMenu: store.data.contextMenu,
  openAtLogin: app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin, platform: process.platform, version: app.getVersion(),automaticUpdates:store.data.automaticUpdates,updates:updates?.view(),
  topMenu: topMenuState, menuOffered: store.data.menuOffered, features: store.data.features,preferences:store.data.preferences,shortcut:shortcutState,engines:require('./engine-packs.cjs').status(),recipes:store.data.recipes,watchFolders:store.data.watchFolders,watchStatus:watcher?.view()||[],onboarding:store.data.onboarding,autoTutorial:!testProfile,whatsNew:whatsNew(),enginePicker:(!testProfile||process.env.FILERRRR_TEST_ENGINE_PICKER==='1')&&!store.data.enginesOffered&&require('./engine-packs.cjs').status().packs.some(pack=>!pack.installed),extended:require('./engines/extended.cjs').status() });
function setSettings(patch) {
  const next = {};
  if (typeof patch.paused === 'boolean') next.paused = patch.paused;
  if(typeof patch.automaticUpdates==='boolean'){next.automaticUpdates=patch.automaticUpdates;updates?.start(next.automaticUpdates&&!testProfile);}
  if (['system', 'light', 'dark'].includes(patch.theme)) next.theme = patch.theme;
  if (typeof patch.contextMenu === 'boolean') next.contextMenu = patch.contextMenu;
  if (patch.menuOffered === true) next.menuOffered = true;
  if (patch.features && typeof patch.features === 'object') next.features = Features.sanitize(patch.features, store.data.features);
  if(patch.preferences&&typeof patch.preferences==='object')next.preferences=Preferences.sanitize(patch.preferences,store.data.preferences);
  if(Array.isArray(patch.recipes))next.recipes=Recipes.sanitize(patch.recipes);
  if(Array.isArray(patch.watchFolders))next.watchFolders=require('./watch-folders.cjs').sanitize(patch.watchFolders);
  if(patch.onboarding===true)next.onboarding=true;
  if(patch.enginesOffered===true)next.enginesOffered=true;
  if(patch.whatsNewSeen===true)next.lastVersion=app.getVersion();
  store.set(next);
  if (!testProfile&&typeof patch.openAtLogin === 'boolean') app.setLoginItemSettings({ openAtLogin: patch.openAtLogin, args: ['--hidden'] });
  if ('contextMenu' in next) syncShellIntegration();
  if ('theme' in next) applyTheme();
  if('preferences' in next)registerShortcut();
  tray && tray.setContextMenu(trayMenu());
  send(win, 'settings', settingsView());
  send(overlay, 'settings', settingsView());
  return settingsView();
}

// ---------- result notification ----------
// Drag and right-click conversions end in a Windows notification as well as on the palette: it stays in the
// notification centre, so it's clear afterwards whether a file was converted. Errors are always shown.
const notifications = new Set(); // keep them referenced, or their click handler can be collected
function notifyResult(results,undo,owner) {
  if (testProfile||!Notification?.isSupported?.()) return;
  const ok = results.filter(r => !r.error&&!r.cancelled), failed = results.filter(r => r.error&&!r.cancelled),cancelled=results.filter(r=>r.cancelled);
  if (!failed.length && store.data.features?.successMessages === false) return;
  const name = p => path.basename(String(p || ''));
  const outputs = ok.flatMap(r => r.outputs || [r.output]).filter(Boolean);
  let title, body;
  if(cancelled.length&&!failed.length){title='Conversion cancelled';body=ok.length?`${outputs.length} completed files kept. Unfinished outputs removed.`:'Unfinished outputs removed. Your originals are unchanged.';}
  else if (!ok.length) {
    title = failed.length === 1 ? `Couldn't convert ${name(failed[0].input)}` : `${failed.length} files couldn't be converted`;
    body = failed[0].error;
  } else if (failed.length) {
    title = `${ok.length} converted · ${failed.length} failed`;
    body = `${name(failed[0].input)}: ${failed[0].error}`;
  } else {
    title = ok.length === 1 && outputs.length === 1 ? `${name(ok[0].input)} → ${name(outputs[0])}` : `${outputs.length} files saved`;
    body = `Saved in ${path.dirname(outputs[0])}. Click to show the file.`;
  }
  const n = new Notification({ title, body: String(body).slice(0, 240), icon: ICON_PNG, timeoutType: failed.length ? 'never' : 'default',
    actions:undo?[{type:'button',text:'Undo'}]:[] });
  notifications.add(n);
  const forget = () => notifications.delete(n);
  n.on('click', () => { forget(); if (outputs[0] && fs.existsSync(outputs[0])) shell.showItemInFolder(outputs[0]); });
  if(undo){
    n.on('action',(_event,index)=>{if(index===0)performUndo(undo.token,owner).catch(error=>log('undo notification',error));});
    const expires=setTimeout(()=>n.close(),Math.max(0,undo.expiresAt-Date.now()));expires.unref?.();
  }
  n.on('close', forget); n.on('failed', forget);
  n.show();
}

// ---------- IPC (every argument is checked: renderers are not trusted) ----------
const isFileList = v => Array.isArray(v) && v.length > 0 && v.length <= 1000 && v.every(p => typeof p === 'string' && path.isAbsolute(p));
ipcMain.handle('inspect', async (_event, paths) => {
  if (!isFileList(paths)) throw new Error('Bad input list');
  const selection=await Selection.expand(paths),options=await require('./capabilities.cjs').inspect(selection.paths, store.data.features);
  return {...Picks.apply(options,selection.paths,store.data.picks,store.data.preferences),recipes:store.data.recipes.filter(recipe=>Recipes.applicable(recipe,selection.paths,store.data.features)),paths:selection.paths,folderCount:selection.folders,
    note:selection.folders?`${selection.paths.length} supported files in ${selection.folders} folders. ${selection.skipped} subfolders or unsupported entries skipped. ${options.note}`:options.note};
});
ipcMain.handle('convert', async (e, paths, face, pick, conversionOptions) => {
  const owner=e.sender.id;
  if(activeJobs.has(owner))throw new Error('A conversion is already running in this window');
  if (!isFileList(paths) || typeof pick !== 'string') throw new Error('Bad request');
  let recipe;if(face==='preset'){recipe=store.data.recipes.find(item=>item.id===pick);if(!recipe||!Recipes.applicable(recipe,paths,store.data.features))throw new Error('This preset is unavailable for the selected files');face='formats';pick=recipe.target;}
  const edit=require('./edits.cjs').sanitize(recipe?Recipes.options(recipe).edit:conversionOptions?.edit);
  const options = Features.optionsFor(paths.map(Formats.extOf), store.data.features);
  const editing=face==='formats'&&Object.keys(edit).length&&paths.every(file=>Formats.norm(Formats.extOf(file))===Formats.extFor(pick)&&['image','video','audio','pdf'].includes(Formats.kindOfExt(Formats.extOf(file))))&&paths.every(file=>store.data.features[`convert.${Formats.kindOfExt(Formats.extOf(file))}`]!==false);
  if (!editing&&!(face === 'formats' ? options.targets : face === 'tools' ? options.tools : []).includes(pick))
    throw new Error('This option is unavailable for these files. Check Features & settings.');
  if (e.sender === overlay?.webContents) {
    nativeDrop?.enable(overlay,false);
    overlayMode = 'click'; overlay.setFocusable(true); overlay.focus();
  }
  const exportOptions = face === 'formats' && options.kind === 'pdf'
    ? require('./engines/pdf.cjs').exportOptions(conversionOptions) : {};
  exportOptions.ocr = store.data.features.ocr !== false && conversionOptions?.ocr !== false;
  const controller=new AbortController();activeJobs.set(owner,controller);
  const destroyed=()=>controller.abort();e.sender.once?.('destroyed',destroyed);
  try{
    if((await Promise.all(paths.map(file=>fs.promises.lstat(file).then(s=>s.isDirectory(),()=>false)))).some(Boolean))throw new Error('Inspect folders first and confirm the file count');
    if(controller.signal.aborted)return paths.map(input=>({input,error:'Cancelled',cancelled:true}));
    const results = await run(paths, face, pick, (fraction, detail) => { send(BrowserWindow.fromWebContents(e.sender), 'convert:progress', { fraction, ...detail }); taskbar(fraction, detail); }, {...exportOptions,...(recipe?Recipes.options(recipe):{}),edit,external:store.data.external,preferences:recipe?.preferences||store.data.preferences,recycle:file=>shell.trashItem(file),signal:controller.signal});
    results.filter(r => r.error&&!r.cancelled).forEach(r => log('convert failed', r.input, face, pick, r.error));
    record(results, face, pick);
    tray?.setContextMenu(trayMenu());
    const undo=await undoManager.register(results,owner);
    if(store.data.preferences.openFolder&&results.some(result=>result.output))shell.showItemInFolder(results.find(result=>result.output).output);
    taskbar(null);
    const away = !win || win.isDestroyed() || !win.isVisible() || !win.isFocused();
    if (e.sender === overlay?.webContents || away) notifyResult(results,undo,owner);
    if (e.sender === win?.webContents && away && !win.isDestroyed()) win.flashFrame(true); // taskbar button blinks until the window is focused
    return results.map(({ input, output, outputs, error, cancelled, before, after, count }) => ({ input, output, outputs, error, cancelled, before, after, count,undo }));
  }finally{activeJobs.delete(owner);if(!activeJobs.size)taskbar(null);e.sender.removeListener?.('destroyed',destroyed);}
});
// conversion progress on the taskbar button, so a running or finished job is visible even when Filerrrr is behind other windows
function taskbar(fraction, detail) {
  if (!win || win.isDestroyed()) return;
  if (fraction === null) win.setProgressBar(-1);
  else win.setProgressBar(detail?.indeterminate ? 2 : Math.max(0.02, Math.min(1, fraction || 0)), { mode: detail?.indeterminate ? 'indeterminate' : 'normal' });
}
ipcMain.handle('convert:cancel',e=>{const job=activeJobs.get(e.sender.id);if(!job)return false;job.abort();return true;});
async function performUndo(token,owner){
  const result=await undoManager.undo(token,owner);
  const removed=new Set(result.undone);
  if(removed.size){
    removed.forEach(file=>{sessionFiles.delete(file);thumbs.delete(file);});
    const history=store.data.history.flatMap(item=>{
      const outputs=historyOutputs(item).filter(file=>!removed.has(file));
      return outputs.length?[{...item,output:outputs[0],outputs,extra:outputs.length-1}]:[];
    });
    store.set({history});send(win,'history',historyView());
  }
  const target=[win,overlay].find(window=>window?.webContents.id===owner);send(target,'convert:undone',{token,...result});
  return result;
}
ipcMain.handle('convert:undo',(e,token)=>typeof token==='string'?performUndo(token,e.sender.id):{undone:[],skipped:[],error:'Invalid Undo request'});
ipcMain.on('overlay:hide', hideOverlay);
ipcMain.on('overlay:result', (e, on) => { if (e.sender === overlay?.webContents && overlayMode) showResultOverlay(on === true); });
ipcMain.on('overlay:interactive', (e, on) => { if (e.sender === overlay?.webContents && overlayResult) overlay.setIgnoreMouseEvents(on !== true, { forward: true }); });
ipcMain.on('overlay:choose', (event, paths) => {
  if (event.sender !== overlay?.webContents || !isFileList(paths)) return;
  gesture.closed(); overlayMode = null;
  openClickPalette(paths);
});
ipcMain.on('log', (_e, s) => dbg('overlay:', String(s).slice(0, 300)));
ipcMain.on('renderer-error', (_e, s) => log('renderer', String(s).slice(0, 2000)));
ipcMain.handle('history:get', () => historyView());
ipcMain.handle('history:clear', () => { store.set({ history: [] }); send(win, 'history', historyView()); return historyView(); });
ipcMain.handle('history:remove',(_event,list)=>{if(!Array.isArray(list)||list.length>200||list.some(file=>typeof file!=='string'))throw new Error('Invalid history selection');const removed=new Set(list);store.set({history:store.data.history.filter(item=>!removed.has(item.output))});send(win,'history',historyView());return historyView();});
ipcMain.handle('history:prune',async()=>{
  const checked=new Map();
  for(const item of store.data.history){
    const outputs=[];
    for(const file of historyOutputs(item))if(await fs.promises.access(file).then(()=>true,()=>false))outputs.push(file);
    checked.set(item,outputs.length?{...item,output:outputs[0],outputs,extra:outputs.length-1}:null);
  }
  const before=store.data.history.length;
  const history=store.data.history.flatMap(item=>checked.has(item)?checked.get(item)?[checked.get(item)]:[]:[item]);
  store.set({history});send(win,'history',historyView());return {history:historyView(),removed:before-history.length};
});
ipcMain.handle('settings:get', () => { recheckTopMenu(); return settingsView(); });
ipcMain.handle('settings:set', (_e, patch) => setSettings(patch && typeof patch === 'object' ? patch : {}));
ipcMain.handle('topmenu:set', (_e, on) => changeTopMenu(on === true));
const known = p => typeof p === 'string' && (sessionFiles.has(p)||store.data.history.some(h => h.input === p || historyOutputs(h).includes(p)));
ipcMain.on('reveal', (_e, p) => { if (known(p)) fs.existsSync(p) ? shell.showItemInFolder(p) : shell.openPath(path.dirname(p)); });
ipcMain.on('open', (_e, p) => { if (known(p) && fs.existsSync(p)) shell.openPath(p); });
// which history files still exist (only paths the history knows about)
ipcMain.handle('existing', (_e, list) => Array.isArray(list) ? list.slice(0, 300).map(p => known(p) && fs.existsSync(p)) : []);
ipcMain.handle('pick-files', async () => (await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'] })).filePaths);
ipcMain.handle('pick-folder',async()=> (await dialog.showOpenDialog({properties:['openDirectory','createDirectory']})).filePaths[0]||null);
ipcMain.handle('pick-input-folder',async()=> (await dialog.showOpenDialog({properties:['openDirectory']})).filePaths);
ipcMain.handle('picks:clear',()=>{store.set({picks:{}});return settingsView();});
// engine packs: download on request (one at a time per pack), with progress pushed to the window
const engineJobs=new Map();
// One download per engine; progress (and fraction null when it ends) goes to the window whoever started it.
async function downloadEngine(id){
  const Packs=require('./engine-packs.cjs');if(!Packs.PACKS[id])throw new Error('Unknown engine');if(engineJobs.has(id))return engineJobs.get(id).done;
  const controller=new AbortController();let last=0;
  const done=(async()=>{
    try{await Packs.download(id,{fetch:(url,options)=>require('electron').net.fetch(url,options),signal:controller.signal,onProgress:f=>{const now=Date.now();if(now-last>120||f>=1){last=now;send(win,'engines:progress',{id,fraction:f});}}});}
    catch(error){log('engine download',id,error);throw new Error(controller.signal.aborted?'Download cancelled':String(error.message||error));}
    finally{engineJobs.delete(id);send(win,'engines:progress',{id,fraction:null});send(win,'settings',settingsView());send(overlay,'settings',settingsView());}
  })();
  engineJobs.set(id,{abort:()=>controller.abort(),done});return done;
}
ipcMain.handle('engines:download',async(_e,id)=>{await downloadEngine(id);return settingsView();});
// Engines picked in the installer download when Filerrrr first starts, in the background, one after another.
async function installChosenEngines(){
  const choiceFile=path.join(app.getPath('userData'),'engine-choice.json');let ids=[];
  try{ids=JSON.parse(fs.readFileSync(choiceFile,'utf8')).install;fs.rmSync(choiceFile,{force:true});}catch{return;}
  store.set({enginesOffered:true});send(win,'settings',settingsView());
  const Packs=require('./engine-packs.cjs'),wanted=(Array.isArray(ids)?ids:[]).filter(id=>Packs.PACKS[id]&&!Packs.status().packs.find(p=>p.id===id)?.installed);
  for(const id of wanted){
    const name=Packs.PACKS[id].name;
    try{await downloadEngine(id);if(!testProfile&&Notification.isSupported())new Notification({title:`${name} is ready`,body:'Downloaded, checked and installed.',icon:ICON_PNG}).show();}
    catch(error){if(!testProfile&&Notification.isSupported())new Notification({title:`${name} could not be downloaded`,body:`${error.message} Try again in Settings → Engines.`,icon:ICON_PNG}).show();}
  }
}
ipcMain.handle('engines:cancel',(_e,id)=>{engineJobs.get(id)?.abort();return true;});
ipcMain.handle('engines:remove',async(_e,id)=>{if(activeJobs.size)throw new Error('Wait for the running conversion to finish');const r=await require('./engine-packs.cjs').remove(id);return {...settingsView(),restartNeeded:r.restartNeeded};});
ipcMain.handle('engines:import',async()=>{const file=(await dialog.showOpenDialog({properties:['openFile'],filters:[{name:'Filerrrr engine pack',extensions:['zip']}]})).filePaths[0];if(file)await require('./engine-packs.cjs').install(file);return settingsView();});
ipcMain.handle('watch:status',()=>watcher?.view()||[]);
ipcMain.handle('updates:status',()=>updates?.view());
ipcMain.handle('updates:check',()=>updates?.check());
ipcMain.handle('updates:download',()=>updates?.download());
ipcMain.handle('updates:install',()=>{if(activeJobs.size||watcher?.view().some(rule=>rule.status==='Converting'))throw new Error('Wait for conversions to finish before restarting');updates?.install();});
ipcMain.handle('updates:releases',()=>shell.openExternal(require('./updates.cjs').releaseUrl));
ipcMain.handle('external:choose',async(_event,key)=>{const names={office:'soffice.exe',books:'ebook-convert.exe',image:'magick.exe',hwp:'rhwp.exe'};if(!names[key])throw new Error('Unknown converter');const file=(await dialog.showOpenDialog({title:`Choose ${names[key]}`,properties:['openFile'],filters:[{name:names[key],extensions:['exe']}]})).filePaths[0];if(file){if(path.basename(file).toLowerCase()!==names[key])throw new Error(`Choose ${names[key]}`);store.set({external:{...store.data.external,[key]:file}});require('./engines/extended.cjs').configure(store.data.external);}return settingsView();});
ipcMain.handle('support:log',async()=>{try{const handle=await fs.promises.open(logFile,'r');try{const stat=await handle.stat(),size=Math.min(stat.size,256*1024),buffer=Buffer.alloc(size);await handle.read(buffer,0,size,stat.size-size);return buffer.toString('utf8');}finally{await handle.close();}}catch{return 'No errors have been logged.';}});
ipcMain.handle('support:notices',async()=>{try{return await fs.promises.readFile(path.join(__dirname,'THIRD-PARTY-NOTICES.txt'),'utf8');}catch{return 'Third-party notices are not generated in this development checkout. Run npm run notices.';}});
ipcMain.handle('tutorial:sample',async()=>{const folder=await fs.promises.mkdtemp(path.join(app.getPath('temp'),'filerrrr-tutorial-')),file=path.join(folder,'Try Filerrrr.txt');await fs.promises.writeFile(file,'Hello from Filerrrr!\nConvert this sample to HTML, then try Undo. Your own files are never used in this tutorial.\n');return file;});
ipcMain.handle('editor:preview',async(_event,file)=>{if(typeof file!=='string'||!path.isAbsolute(file)||Formats.kindOfExt(Formats.extOf(file))!=='image')throw new Error('Choose an image');const results=await run([file],'image-preview','PNG');return results[0];});
// Windows' own thumbnail providers: pictures, video frames, PDF pages.
const thumbs = new Map();let thumbnailAbort=new AbortController(),previewTail=Promise.resolve();
ipcMain.handle('thumb', (_e, p) => {
  if (!store.data.features.thumbnails) return null;
  if (!known(p)) return null;
  if (!thumbs.has(p)) {
    const previewSignal=thumbnailAbort.signal;
    if (thumbs.size >= 64) thumbs.delete(thumbs.keys().next().value);
    const viaPdf = () => {
      if(!/\.pdf$/i.test(p))return null;
      const signal=previewSignal,work=previewTail.then(()=>signal.aborted?null:run([p],'preview','PNG',()=>{},{signal}).then(results=>results[0].dataUrl));
      previewTail=work.catch(()=>{});return work;
    };
    thumbs.set(p, nativeImage.createThumbnailFromPath(p, { width: 640, height: 480 })
      .then(img => img.isEmpty() ? viaPdf() : img.toDataURL(), viaPdf).catch(() => null));
  }
  return thumbs.get(p);
});

// ---------- app ----------
app.on('web-contents-created', (_e, wc) => {
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', e => e.preventDefault());
});
app.on('window-all-closed', () => {}); // the tray keeps the app alive; hidden print windows come and go
app.on('second-instance', (_e, argv) => {
  const paths = contextMenu.pathsFromArgv(argv);
  paths.length ? receivePaths(paths) : showWindow();
});
app.on('before-quit', () => { quitting = true;updates?.stop();watcher?.stop();activeJobs.forEach(job=>job.abort());killAll(); try { store.flush(); } catch { /* best effort */ } });

app.whenReady().then(() => {
  app.setAppUserModelId('com.filerrrr.app');
  logFile = path.join(app.getPath('userData'), 'filerrrr.log');
  store = createStore(path.join(app.getPath('userData'), 'filerrrr.json'));
  updates=require('./updates.cjs').create({packaged:app.isPackaged,config:require('./updates.cjs').readConfig(process.resourcesPath),notify:state=>send(win,'updates:status',state),log});updates.start(store.data.automaticUpdates&&!testProfile);
  require('./engine-packs.cjs').configure(path.join(app.getPath('userData'),'engines'));
  require('./engines/extended.cjs').configure(store.data.external);
  watcher=require('./watch-folders.cjs').create({rules:()=>store.data.watchFolders,recipes:()=>store.data.recipes,run:async(input,recipe,signal)=>{const results=await run([input],'formats',recipe.target,()=>{},{...Recipes.options(recipe),external:store.data.external,signal});record(results,'formats',recipe.target);results.filter(result=>result.error).forEach(result=>log('watch folder',result.input,result.error));return results;},onUpdate:status=>send(win,'watch:status',status)});
  nativeDrop=require('./native-drop.cjs').create({event:data=>{if(overlayMode==='drag'&&overlay){const p=toDip(data.x,data.y),b=overlay.getBounds();send(overlay,'overlay:native',{...data,x:p.x-b.x,y:p.y-b.y});}},log});
  const startPaths = contextMenu.pathsFromArgv(process.argv);
  pendingFromArgv = startPaths.length > 0;
  if((testProfile&&process.env.FILERRRR_TEST_WINDOW==='1')||(!process.argv.includes('--hidden')&&!pendingFromArgv))createWindow();
  tray = new Tray(nativeImage.createFromPath(ICON_PNG).resize({ width: 16, height: 16, quality: 'best' }));
  tray.setToolTip('Filerrrr'); tray.setContextMenu(trayMenu()); tray.on('click', showWindow);
  nativeTheme.on('updated', () => store.data.theme === 'system' && applyTheme());
  if(!(testProfile&&process.env.FILERRRR_TEST_NO_HOOK==='1'))startHook();
  registerShortcut();
  syncShellIntegration();
  refreshTopMenu(true).catch(e => log('top menu startup', e));
  if (pendingFromArgv) receivePaths(startPaths);
  markFirstRunVersion();
  installChosenEngines().catch(error=>log('chosen engines',error));
}).catch(e => log('startup', e));
