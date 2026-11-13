// The only bridge between the pages and the main process (pages run sandboxed, without Node).
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = ch => fn => { const h = (_e, ...a) => fn(...a); ipcRenderer.on(ch, h); return () => ipcRenderer.off(ch, h); };

contextBridge.exposeInMainWorld('api', {
  pathFor: file => webUtils.getPathForFile(file),
  convert: (paths, face, pick, options) => ipcRenderer.invoke('convert', paths, face, pick, options),
  cancelConversion:()=>ipcRenderer.invoke('convert:cancel'),
  undo:token=>ipcRenderer.invoke('convert:undo',token),
  onUndone:on('convert:undone'),
  inspect: paths => ipcRenderer.invoke('inspect', paths),
  onProgress: on('convert:progress'),
  // overlay
  onDrag: on('overlay:drag'),
  onClick: on('overlay:click'),
  onHook: on('overlay:hook'),
  onNativeDrop:on('overlay:native'),
  hideOverlay: () => ipcRenderer.send('overlay:hide'),
  showingResult: on => ipcRenderer.send('overlay:result', on),
  resultInteractive: on => ipcRenderer.send('overlay:interactive', on),
  chooseAfterDrop: paths => ipcRenderer.send('overlay:choose', paths),
  log: (...a) => ipcRenderer.send('log', a.join(' ')),
  // main window
  history: () => ipcRenderer.invoke('history:get'),
  clearHistory: () => ipcRenderer.invoke('history:clear'),
  removeHistory:list=>ipcRenderer.invoke('history:remove',list),
  pruneHistory:()=>ipcRenderer.invoke('history:prune'),
  onHistory: on('history'),
  settings: () => ipcRenderer.invoke('settings:get'),
  setSettings: patch => ipcRenderer.invoke('settings:set', patch),
  setTopMenu: on => ipcRenderer.invoke('topmenu:set', on),
  onSettings: on('settings'),
  onTheme: on('theme'),
  onFocus: on('focus'),
  reveal: p => ipcRenderer.send('reveal', p),
  open: p => ipcRenderer.send('open', p),
  thumb: p => ipcRenderer.invoke('thumb', p),
  existing: list => ipcRenderer.invoke('existing', list),
  pickFiles: () => ipcRenderer.invoke('pick-files'),
  pickFolder:()=>ipcRenderer.invoke('pick-folder'),
  pickInputFolder:()=>ipcRenderer.invoke('pick-input-folder'),
  clearPicks:()=>ipcRenderer.invoke('picks:clear'),
  importEngines:()=>ipcRenderer.invoke('engines:import'),
  downloadEngine:id=>ipcRenderer.invoke('engines:download',id),cancelEngine:id=>ipcRenderer.invoke('engines:cancel',id),removeEngine:id=>ipcRenderer.invoke('engines:remove',id),onEngineProgress:on('engines:progress'),
  watchStatus:()=>ipcRenderer.invoke('watch:status'),onWatchStatus:on('watch:status'),
  readLog:()=>ipcRenderer.invoke('support:log'),notices:()=>ipcRenderer.invoke('support:notices'),
  tutorialSample:()=>ipcRenderer.invoke('tutorial:sample'),imagePreview:file=>ipcRenderer.invoke('editor:preview',file),
  chooseExternal:key=>ipcRenderer.invoke('external:choose',key),
  updateStatus:()=>ipcRenderer.invoke('updates:status'),checkUpdates:()=>ipcRenderer.invoke('updates:check'),downloadUpdate:()=>ipcRenderer.invoke('updates:download'),installUpdate:()=>ipcRenderer.invoke('updates:install'),openReleases:()=>ipcRenderer.invoke('updates:releases'),onUpdates:on('updates:status'),
});

addEventListener('error', e => ipcRenderer.send('renderer-error', `${e.message} @ ${e.filename}:${e.lineno}`));
addEventListener('unhandledrejection', e => ipcRenderer.send('renderer-error', String(e.reason && e.reason.stack || e.reason)));
