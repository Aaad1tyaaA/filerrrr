// Settings + history in one JSON file. Writes are batched and atomic (temp file + rename),
// and a damaged file falls back to defaults instead of breaking the app.
const fs = require('fs');
const Features = require('./features.js');
const Preferences=require('./preferences.cjs'),Picks=require('./picks.cjs');

const DEFAULTS = { paused: false, theme: 'system', contextMenu: true, menuOffered: false, converted: 0, saved: 0, history: [], features: Features.defaults,preferences:Preferences.defaults,picks:{},recipes:[],watchFolders:[],onboarding:false,enginesOffered:false,qualityBest:true,lastVersion:'',external:{},automaticUpdates:true };

function sanitize(raw) {
  const d = { ...DEFAULTS };
  d.features = Features.sanitize(raw?.features);
  d.preferences=Preferences.sanitize(raw?.preferences);
  // one-time move to Best quality for copies still on the old untouched defaults (Balanced, Balanced, 192 kbps)
  const p=raw?.preferences;if(raw&&raw.qualityBest!==true&&p&&p.image==='balanced'&&p.video==='balanced'&&p.audio===192)d.preferences={...d.preferences,image:'best',video:'best',audio:320};d.picks=Picks.sanitize(raw?.picks);
  d.recipes=require('./recipes.cjs').sanitize(raw?.recipes);d.watchFolders=require('./watch-folders.cjs').sanitize(raw?.watchFolders);d.onboarding=raw?.onboarding===true;
  d.external=Object.fromEntries(['office','books','image','hwp'].filter(key=>typeof raw?.external?.[key]==='string'&&require('path').isAbsolute(raw.external[key])).map(key=>[key,raw.external[key]]));
  if (!raw || typeof raw !== 'object') return d;
  if (typeof raw.paused === 'boolean') d.paused = raw.paused;
  if (raw.enginesOffered === true) d.enginesOffered = true;
  if (typeof raw.lastVersion === 'string' && /^\d+\.\d+\.\d+$/.test(raw.lastVersion)) d.lastVersion = raw.lastVersion;
  if(typeof raw.automaticUpdates==='boolean')d.automaticUpdates=raw.automaticUpdates;
  if (['system', 'light', 'dark'].includes(raw.theme)) d.theme = raw.theme;
  if (typeof raw.contextMenu === 'boolean') d.contextMenu = raw.contextMenu;
  if (typeof raw.menuOffered === 'boolean') d.menuOffered = raw.menuOffered;
  if (Number.isFinite(raw.converted) && raw.converted >= 0) d.converted = raw.converted;
  if (Number.isFinite(raw.saved) && raw.saved >= 0) d.saved = raw.saved;
  if (Array.isArray(raw.history)) d.history = raw.history.filter(h => h && typeof h.output === 'string' && typeof h.input === 'string').slice(0, 200);
  return d;
}

function createStore(file, onError = () => {}) {
  let data;
  try { data = sanitize(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { data = sanitize(null); }
  let timer = null;
  const flush = () => {
    clearTimeout(timer); timer = null;
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
  };
  return {
    get data() { return data; },
    set(patch) { data = sanitize({ ...data, ...patch }); clearTimeout(timer); timer = setTimeout(() => { try { flush(); } catch (error) { onError(error); /* retried on next change and on quit */ } }, 200); },
    flush,
  };
}

module.exports = { createStore, sanitize, DEFAULTS };
