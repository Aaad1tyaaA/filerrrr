// The palette: the Matrix Disc in the middle and every option for the files laid out around it.
// Pick by aiming at an option, scrolling, or typing; the disc spells the current pick in dots.
(function (root) {
  const SIZE = 460, C = SIZE / 2, CHIP_R = 168, AIM_DEAD = 62;

  const HTML = `
    <div class="pal-ring"></div>
    <div class="pal-disc"><div class="plate"></div><canvas></canvas></div>
    <div class="pal-pointer" aria-hidden="true"></div>
    <svg class="pal-meter" viewBox="0 0 260 260" role="progressbar" aria-label="Conversion progress" aria-valuemin="0" aria-valuemax="100" hidden><circle class="meter-track" cx="130" cy="130" r="123" pathLength="100"/><circle class="meter-value" cx="130" cy="130" r="123" pathLength="100"/></svg>
    <div class="pal-chips" role="listbox"></div>
    <div class="pal-presets" hidden><label>Preset <select aria-label="Saved preset"></select></label><button type="button">Use preset</button></div>
    <div class="pal-export-options" hidden><label>Resolution <select class="pal-dpi" aria-label="PDF image resolution"><option value="72">72 dpi</option><option value="144" selected>144 dpi</option><option value="216">216 dpi</option><option value="300">300 dpi</option></select></label><label class="pal-quality-label">JPG quality <select class="pal-quality" aria-label="JPG quality"><option value="70">70%</option><option value="80">80%</option><option value="90" selected>90%</option><option value="100">100%</option></select></label></div>
    <div class="pal-cap"><div class="pal-route"></div><div class="pal-hint"></div><div class="pal-note" role="status" aria-live="polite"></div></div>
    <section class="pal-work" aria-label="Conversion progress" hidden>
      <div class="pal-work-head"><strong class="pal-work-title" role="status" aria-live="polite"></strong><span class="pal-work-percent"></span></div>
      <div class="pal-work-file"></div>
      <div class="pal-work-stage" role="status" aria-live="polite"></div>
      <div class="pal-work-meta"><span class="pal-work-count"></span><span class="pal-work-time"></span></div>
      <div class="pal-batch" hidden><div class="pal-batch-list"></div></div>
      <div class="pal-work-actions" hidden><button type="button" data-action="open">Open file</button><button type="button" data-action="folder">Show in folder</button><button type="button" data-action="undo" hidden>Undo</button><button type="button" data-action="details" hidden>Results</button><button type="button" data-action="retry" hidden>Retry failed</button><button type="button" data-action="cancel" hidden>Cancel</button><button type="button" data-action="close">Done</button></div>
    </section>`;

  // routine notes that say nothing new are left out; warnings and reasons stay
  const quiet = note => /^Conversion routes checked/i.test(note || '') ? '' : (note || '');

  class Palette {
    // el: an empty element; mode: 'drag' (an OS drag is under way) or 'click'
    constructor(el, { onCommit = () => {}, onCancel = () => {}, onOpen = () => {}, onReveal = () => {},onAbort=()=>{},onUndo=async()=>({error:'Undo unavailable'}),onRetry=()=>{} } = {}) {
      this.el = el; el.classList.add('palette'); el.innerHTML = HTML;
      this.chips = el.querySelector('.pal-chips'); this.route = el.querySelector('.pal-route'); this.hint = el.querySelector('.pal-hint');
      this.onCommit = onCommit; this.onCancel = onCancel;
      this.onAbort=onAbort;this.onUndo=onUndo;
      this.onRetry=onRetry;
      this.presetBox=el.querySelector('.pal-presets');this.presetBox.querySelector('button').onclick=()=>{const id=this.presetBox.querySelector('select').value;if(id&&!this.busy&&!this.checking){this.disc.progress(0);this.el.classList.add('committed');this.onCommit({face:'preset',value:id});}};
      this.work = el.querySelector('.pal-work');
      this.workTitle = el.querySelector('.pal-work-title'); this.workFile = el.querySelector('.pal-work-file');
      this.workBar = el.querySelector('.pal-meter'); this.workPercent = el.querySelector('.pal-work-percent');
      this.meterValue = el.querySelector('.meter-value'); this.note = el.querySelector('.pal-note');
      this.exportOptions = el.querySelector('.pal-export-options'); this.dpi = el.querySelector('.pal-dpi'); this.quality = el.querySelector('.pal-quality');
      this.workStage = el.querySelector('.pal-work-stage'); this.workCount = el.querySelector('.pal-work-count');
      this.workTime = el.querySelector('.pal-work-time'); this.workActions = el.querySelector('.pal-work-actions');
      this.workActions.addEventListener('click', async e => {
        const action = e.target.closest('button')?.dataset.action; if (!action) return;
        e.stopPropagation();
        if(action==='cancel'){this.abort();return;}
        if(action==='details'){this.el.classList.toggle('batch-expanded');this.el.querySelector('.pal-batch').hidden=!this.el.classList.contains('batch-expanded');return;}
        if(action==='retry'){const files=this.results.filter(result=>result.error&&!result.cancelled&&result.input).map(result=>result.input);if(!files.length)return;this.finishResolve?.();this.finishResolve=null;this.onRetry(files,this.lastPick);return;}
        if(action==='undo'){
          const token=this.undoToken;if(!token)return;
          e.target.disabled=true;this.workStage.textContent='Moving converted files to the Recycle Bin…';
          try{this.applyUndo(token,await this.onUndo(token));}catch(error){this.applyUndo(token,{undone:[],skipped:[],error:String(error.message||error)});}return;
        }
        const output = this.output;
        this.close(() => { if (output && action === 'open') onOpen(output); else if (output && action === 'folder') onReveal(output); });
      });
      this.disc = new Dots.Disc(el.querySelector('canvas'), () => this.sync());
      this.chips.addEventListener('pointerdown', e => {
        const b = e.target.closest('.chip'); if (!b || b.disabled || this.checking || this.mode !== 'click') return;
        e.preventDefault(); e.stopPropagation();
        if(b.dataset.more){this.allFormats=b.dataset.more==='more';this.moreAimed=false;this.shown=null;this.sync();return;}
        this.blockedChoice = null;
        this.disc.select(+b.dataset.i); this.commit();
      });
    }
    // key hints as keycaps; a reason (why an option is unavailable) replaces them as plain text
    setHint(reason) {
      this.hint.classList.toggle('reason', !!reason);
      if (reason) { this.hint.textContent = reason; return; }
      this.hint.innerHTML = this.mode === 'drag'
        ? '<span><kbd>Wheel</kbd> or aim</span><span><kbd>A–Z</kbd> type</span><span><kbd>Tab</kbd> tools</span><span>release <kbd>Ctrl</kbd> to cancel</span>'
        : '<span><kbd>Click</kbd> convert</span><span><kbd>Wheel</kbd> or <kbd>A–Z</kbd> pick</span><span><kbd>Tab</kbd> tools</span><span><kbd>Esc</kbd> close</span>';
    }
    get isOpen() { return this.disc.isOpen; }
    get busy() { return this.disc.phase !== 'pick'; }

    // targets null = files not known yet (an OS drag that hasn't reached us)
    open({ label = '', kind, targets = null, tools = ['ZIP'], mode = 'click', features = {}, choices, note = '', checking = false,favourites=null,lastUsed=null }) {
      this.presetBox.hidden=true;
      clearTimeout(this.undoTimer);this.undoToken=null;clearTimeout(this.swapT);
      // a new palette replaces a result card still on screen: let the conversion that showed it finish now
      const replaced = this.finishResolve; this.finishResolve = null; replaced?.();
      this.features = features;
      this.favourites=favourites;this.lastUsed=lastUsed;this.allFormats=false;this.moreAimed=false;
      this.blockedChoice = null;
      this.kind = kind || (label === 'PDF' ? 'pdf' : '');
      this.choices = choices; this.checking = checking; this.note.textContent = quiet(note); this.el.classList.toggle('checking', checking);
      this.workBar.setAttribute('hidden', ''); this.workBar.classList.remove('indeterminate');
      this.el.removeAttribute('data-result');
      clearInterval(this.clockTimer); this.work.hidden = true; this.workActions.hidden = true; this.output = null;
      this.label = label; this.mode = mode; this.shown = null; this.lastAim = null;
      this.el.classList.remove('closing', 'committed'); this.el.classList.add('on'); this.el.dataset.mode = mode;
      this.setHint();
      this.disc.open(targets, tools);
      if (mode === 'click') this.disc.inside = true; // no "release to cancel" outside a drag: the mouse is free here
      this.sync();
    }
    setFiles({ label = this.label, kind, targets, tools, choices, note = '',favourites=null,lastUsed=null,paths,recipes=[] }) {
      this.presetBox.querySelector('select').replaceChildren(...recipes.map(recipe=>new Option(recipe.name,recipe.id)));this.presetBox.hidden=!recipes.length;
      this.favourites=favourites;this.lastUsed=lastUsed;this.allFormats=false;this.moreAimed=false;
      if(paths?.length){this.label=label=paths.length>1?`${paths.length} FILES`:(Formats.extOf(paths[0])||'FILE').toUpperCase();}
      this.label = label; this.choices = choices; this.checking = false; this.note.textContent = quiet(note); this.el.classList.remove('checking');
      this.kind = kind || (label === 'PDF' ? 'pdf' : '');
      this.disc.setTargets(targets, tools); this.sync();
    }
    faceChoices() { let choices=this.disc.face === 'formats' && this.choices ? this.choices : this.disc.options().map(value => ({ value, reason: '' }));
      if(this.disc.face==='formats'&&this.favourites?.length&&!this.checking){choices=this.allFormats?choices:[...choices.filter(choice=>this.favourites.includes(choice.value))];choices=[...choices,{value:this.allFormats?'__LESS':'__MORE',reason:''}];}return choices; }

    sync() {
      const d = this.disc;
      if (this.checking || (this.choices?.length && !d.targets?.length && !d.tools?.length)) d.face = 'formats';
      if(this.favourites&&d.phase==='pick'&&d.face==='formats'&&d.value()&&!this.favourites.includes(d.value()))this.allFormats=true;
      const c = d.caption(this.label);
      this.exportOptions.hidden = this.checking || d.phase !== 'pick' || this.kind !== 'pdf' || d.face !== 'formats' || !['JPG','PNG'].includes(d.value());
      this.el.querySelector('.pal-quality-label').hidden = d.value() !== 'JPG';
      d.hasFormats = !!this.choices?.length;
      this.route.className = 'pal-route ' + c.cls.replace('route', ''); this.route.innerHTML = c.html;
      this.el.classList.toggle('waiting', d.waiting);
      this.el.classList.toggle('inside', d.inside);
      if (this.checking) this.route.textContent = 'Checking files…';
      const key = d.waiting ? 'wait' : `${d.face}:${this.faceChoices().map(o => `${o.value}:${o.reason}`).join(',')}`;
      if (key !== this.shown) this.layout(key);
      this.markPick();
    }

    // highlights the current pick and turns the rim pointer to it (the short way round)
    markPick() {
      const d = this.disc; let picked = null;
      this.chips.querySelectorAll('.chip').forEach(b => { const on = !b.disabled && +b.dataset.i === d.idx && d.phase === 'pick'; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); if (on) picked = b; });
      this.el.classList.toggle('has-pick', !!picked);
      if (picked) {
        const target = parseFloat(picked.style.getPropertyValue('--a')), prev = this.selAngle ?? target;
        this.selAngle = prev + ((((target - prev) % 360) + 540) % 360 - 180);
        this.el.style.setProperty('--sel', `${this.selAngle}deg`);
      }
    }

    layout(key) {
      const first = this.shown === null; this.shown = key;
      const d = this.disc, opts = d.waiting ? [] : this.faceChoices(), n = opts.length;
      const build = () => {
        this.chips.innerHTML = '';
        opts.forEach(({ value: o, reason }, i) => {
          const a = -Math.PI / 2 + i * 2 * Math.PI / Math.max(n, 1);
          const b = document.createElement('button');
          b.className = 'chip' + (d.face === 'tools' ? ' tool' : '')+(o===this.lastUsed?' last-used':''); b.type = 'button'; b.tabIndex = 0; b.dataset.i = d.options().indexOf(o);
          if(o==='__MORE'||o==='__LESS'){b.dataset.more=o==='__MORE'?'more':'less';}
          b.disabled = !!reason; b.setAttribute('aria-disabled', String(!!reason)); b.title = reason || `Convert to ${Formats.nameFor(o)}`;
          b.setAttribute('aria-label', `${d.face === 'tools' ? Formats.TOOL_NAMES[o] : Formats.nameFor(o)}${reason ? `: ${reason}` : ''}`);
          b.setAttribute('role', 'option');
          b.style.setProperty('--a', `${(a * 180 / Math.PI).toFixed(2)}deg`); b.style.setProperty('--i', i);
          b.textContent = o==='__MORE'?'More':o==='__LESS'?'Favourites':d.face === 'tools' ? Formats.TOOL_NAMES[o] : Formats.nameFor(o);
          if(b.dataset.more){b.title=o==='__MORE'?'Show all formats':'Show favourites';b.setAttribute('aria-label',b.title);}
          if(o===this.lastUsed){b.title+=' · Last used';b.setAttribute('aria-label',`${b.getAttribute('aria-label')}, last used`);}
          b.onclick=e=>{if(e.detail===0){e.preventDefault();if(b.dataset.more){this.allFormats=b.dataset.more==='more';this.shown=null;this.sync();}else{this.disc.select(+b.dataset.i);this.commit();}}};
          this.chips.appendChild(b);
        });
        this.markPick(); // rebuilt chips need the highlight too
        requestAnimationFrame(() => requestAnimationFrame(() => this.chips.classList.add('out')));
      };
      if (first || !this.chips.children.length) { this.chips.classList.remove('out'); build(); return; }
      this.chips.classList.remove('out'); // fold the old ring in, then fan the new one out
      clearTimeout(this.swapT); this.swapT = setTimeout(build, 150);
    }

    // dx, dy: pointer offset from the palette centre
    aim(dx, dy) {
      const d = this.disc; if (this.checking || !d.canPick()) return;
      // dragover repeats while the mouse rests; only real movement re-aims, so a scroll or typed pick sticks
      if (this.lastAim && Math.hypot(dx - this.lastAim[0], dy - this.lastAim[1]) < 6) return;
      this.lastAim = [dx, dy];
      const dist = Math.hypot(dx, dy);
      if (this.mode === 'drag') d.setInside(dist < SIZE / 2 + 20);
      if (dist < AIM_DEAD) { this.blockedChoice = null; return; }
      const opts = this.faceChoices(), n = opts.length; if (!n) return;
      const a = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 4) % (Math.PI * 2);
      const choice = opts[Math.round(a / (2 * Math.PI / n)) % n];
      this.moreAimed=choice.value==='__MORE'||choice.value==='__LESS';if(this.moreAimed){this.route.textContent=choice.value==='__MORE'?'More formats':'Favourite formats';return;}
      this.blockedChoice = choice.reason || null;
      this.setHint(choice.reason);
      if (!choice.reason) d.select(d.options().indexOf(choice.value));
    }
    step(k) { if (this.features['input.wheel'] !== false) { this.moreAimed=false;this.blockedChoice = null; this.disc.step(k); } }
    type(ch) { this.moreAimed=false;this.disc.type(ch); }
    backspace() { this.disc.backspace(); }
    flip() { this.disc.flip(); }

    commit() {
      if(this.moreAimed){this.allFormats=!this.allFormats;this.moreAimed=false;this.shown=null;this.sync();return;}
      const d = this.disc; if (this.checking || this.blockedChoice || !d.canPick() || !d.options().length) return;
      const pick = { face: d.face, value: d.value(), options: { dpi: +this.dpi.value, quality: +this.quality.value } };
      d.progress(0); this.el.classList.add('committed');
      this.start([], pick);
      this.onCommit(pick);
    }
    start(paths, pick) {
      this.presetBox.hidden=true;
      this.lastPick=pick;this.el.classList.remove('batch-expanded');this.el.querySelector('.pal-batch').hidden=true;
      clearTimeout(this.undoTimer);this.undoToken=null;this.disc.phase='progress';this.disc.frac=0;this.disc.progress(0);
      this.startedAt = performance.now(); this.work.hidden = false; this.work.dataset.state = 'working'; this.workActions.hidden = false;this.cancelling=false;
      this.el.classList.remove('cancelling');
      this.workActions.querySelectorAll('button').forEach(button=>{button.hidden=button.dataset.action!=='cancel';button.disabled=false;});
      this.workActions.querySelector('[data-action=cancel]').textContent='Cancel';
      this.workBar.removeAttribute('hidden');
      this.workTitle.textContent = pick.face==='preset'?'Running saved preset':pick.face === 'formats' ? `Converting to ${Formats.nameFor(pick.value)}` : Formats.TOOL_NAMES[pick.value];
      clearInterval(this.clockTimer);
      const tick = () => { this.workTime.textContent = `${Math.floor((performance.now() - this.startedAt) / 1000)}s elapsed`; };
      tick(); this.clockTimer = setInterval(tick, 1000);
      this.progress({ fraction: 0, input: paths[0], total: paths.length, completed: 0, stage: 'Starting conversion…', indeterminate: true });
    }
    progress(value) {
      if(this.cancelling)return;
      const p = typeof value === 'number' ? { fraction: value } : value || {};
      const fraction = Number.isFinite(p.fraction) ? Math.min(1, Math.max(0, p.fraction)) : 0;
      const shown = fraction;
      this.disc.progress(fraction);
      this.workBar.classList.toggle('indeterminate', p.indeterminate === true);
      if (p.indeterminate) this.workBar.removeAttribute('aria-valuenow');
      else this.workBar.setAttribute('aria-valuenow', Math.round(shown * 100));
      this.meterValue.style.strokeDasharray = `${p.indeterminate ? 18 : fraction * 100} 100`;
      this.workPercent.textContent = p.indeterminate ? 'Working…' : `${Math.round(shown * 100)}%`;
      if (p.input) { this.workFile.textContent = String(p.input).split(/[\\/]/).pop(); this.workFile.title = p.input; }
      this.workStage.textContent = `${p.stage || 'Converting'}${p.pages ? ` · page ${p.page} of ${p.pages}` : ''}`;
      this.workBar.setAttribute('aria-valuetext', p.indeterminate ? this.workStage.textContent : `${Math.round(shown * 100)}% · ${this.workStage.textContent}`);
      if (p.total) this.workCount.textContent = `${p.completed || 0} of ${p.total} ${p.total === 1 ? 'file' : 'files'} processed`;
    }
    finish(results) {
      this.results=results;
      const failed = results.filter(r => r.error&&!r.cancelled),cancelled=results.filter(r=>r.cancelled);
      const ok = results.filter(r => !r.error&&!r.cancelled), outputs = ok.flatMap(r => r.outputs || (r.output ? [r.output] : []));
      clearInterval(this.clockTimer);
      this.output = outputs[0];this.outputs=outputs; this.work.dataset.state = cancelled.length?'cancelled':failed.length ? 'failed' : 'success';
      this.el.classList.remove('cancelling');
      this.workTitle.textContent = cancelled.length?'Conversion cancelled':failed.length ? ok.length ? `${ok.length} saved · ${failed.length} failed` : 'Conversion failed' : 'Conversion complete';
      this.workBar.classList.remove('indeterminate'); this.meterValue.style.strokeDasharray = '100 100';
      this.el.dataset.result = cancelled.length?'cancelled':failed.length ? 'failed' : 'success';
      this.workBar.setAttribute('aria-valuenow', '100'); this.workBar.setAttribute('aria-valuetext', this.workTitle.textContent);
      this.workPercent.textContent = cancelled.length?'Stopped':failed.length ? '!' : '✓ Saved';
      this.workStage.textContent = cancelled.length?`${outputs.length?`${outputs.length} completed outputs kept. `:''}Unfinished outputs removed. Originals unchanged.`:failed.length ? failed.map(r => r.error).join(' · ') : 'Files saved. Your originals are unchanged.';
      this.workStage.title = this.workStage.textContent;
      if (this.output) { this.workFile.textContent = this.output.split(/[\\/]/).pop(); this.workFile.title = this.output; }
      this.workCount.textContent = `${outputs.length} ${outputs.length === 1 ? 'output file' : 'output files'}${failed.length ? ` · ${failed.length} failed` : ''}`;
      this.workActions.hidden = false;
      this.workActions.querySelector('[data-action=cancel]').hidden=true;
      this.workActions.querySelector('[data-action=close]').hidden=false;
      this.workActions.querySelector('[data-action=details]').hidden=results.length<2;
      this.workActions.querySelector('[data-action=details]').textContent=`Results (${results.length})`;
      this.workActions.querySelector('[data-action=retry]').hidden=!failed.some(result=>result.input);
      const list=this.el.querySelector('.pal-batch-list');list.replaceChildren();
      for(const result of results){const row=document.createElement('div'),name=document.createElement('strong'),status=document.createElement('span');row.className='pal-batch-row';name.textContent=String(result.input||'File').split(/[\\/]/).pop();name.title=result.input||'';status.textContent=result.cancelled?'Stopped':result.error?`✕ ${result.error}`:`✓ ${result.outputs?.length||1} saved`;row.dataset.state=result.error?'failed':'success';row.append(name,status);list.append(row);}
      const undo=results.find(result=>result.undo)?.undo,undoButton=this.workActions.querySelector('[data-action=undo]');
      clearTimeout(this.undoTimer);this.undoToken=undo?.token;undoButton.hidden=!undo||undo.expiresAt<=Date.now();undoButton.disabled=false;undoButton.textContent='Undo';
      if(!undoButton.hidden){
        undoButton.title='Send new outputs to the Recycle Bin (30 seconds)';
        this.undoTimer=setTimeout(()=>{undoButton.hidden=true;this.undoToken=null;},Math.max(0,undo.expiresAt-Date.now()));
      }
      this.workActions.querySelector('[data-action=open]').hidden = !this.output;
      this.workActions.querySelector('[data-action=open]').textContent = outputs.length > 1 ? 'Open first file' : 'Open file';
      this.workActions.querySelector('[data-action=folder]').hidden = !this.output;
      this.workActions.querySelector('[data-action=close]').textContent = failed.length||cancelled.length ? 'Close' : 'Done';
      this.disc.failText = failed.length ? `${failed.length === results.length ? 'FAILED' : `${failed.length} FAILED`} · ${failed[0].error}`.slice(0, 64) : '';
      this.disc.finish(ok.length>0&&!cancelled.length,!!cancelled.length);
      return new Promise(res => { this.finishResolve = res; });
    }
    close(done = () => {}) {
      if (!this.disc.isOpen) return done();
      clearInterval(this.clockTimer);clearTimeout(this.undoTimer);
      const resolve = this.finishResolve;
      this.el.classList.add('closing'); this.chips.classList.remove('out');
      this.disc.close(() => { if(this.finishResolve===resolve)this.finishResolve=null;this.el.classList.remove('on', 'closing', 'committed'); this.chips.innerHTML = ''; this.shown = null; this.work.hidden = true; this.workBar.setAttribute('hidden', ''); resolve?.(); done(); });
    }
    abort(){
      if(this.disc.phase!=='progress'||this.cancelling)return;
      this.cancelling=true;this.el.classList.add('cancelling');
      this.workStage.textContent='Stopping and removing unfinished outputs…';
      const button=this.workActions.querySelector('[data-action=cancel]');button.disabled=true;button.textContent='Stopping…';
      Promise.resolve(this.onAbort()).catch(error=>{this.workStage.textContent=String(error.message||error);});
    }
    applyUndo(token,result){
      if(this.undoToken!==token)return;
      clearTimeout(this.undoTimer);this.undoToken=null;this.workActions.querySelector('[data-action=undo]').hidden=true;
      const removed=new Set(result.undone||[]);this.outputs=(this.outputs||[]).filter(file=>!removed.has(file));this.output=this.outputs[0];
      if(removed.size)this.workCount.textContent=this.outputs.length?`${this.outputs.length} ${this.outputs.length===1?'output file':'output files'} kept`:'No output files kept';
      if(!this.output)this.workFile.textContent='';
      this.workTitle.textContent=result.error?'Undo unavailable':result.skipped?.length?'Undo kept changed files':'Conversion undone';
      this.workStage.textContent=result.error||result.skipped?.[0]?.reason||`${removed.size} ${removed.size===1?'output':'outputs'} moved to the Recycle Bin. Originals unchanged.`;
      this.workActions.querySelector('[data-action=open]').hidden=!this.output;this.workActions.querySelector('[data-action=folder]').hidden=!this.output;
      this.workPercent.textContent=removed.size?'Undone':'Kept';
    }
    cancel() { if (this.disc.isOpen && !this.busy) this.close(() => this.onCancel()); }
    // closes at once, no animation (used when the OS drag continues elsewhere)
    vanish() { clearInterval(this.clockTimer); this.disc.isOpen = false; this.el.classList.remove('on', 'closing', 'committed'); this.chips.innerHTML = ''; this.shown = null; this.work.hidden = true; }

    // keyboard (click mode, or keys the global hook forwards during a drag)
    key(k) {
      if(this.disc.isOpen&&this.disc.phase==='progress'&&k==='Escape'){this.abort();return true;}
      if (this.disc.isOpen && this.disc.phase === 'done' && k === 'Escape') { this.close(); return true; }
      if (!this.disc.isOpen || this.busy) return false;
      if (this.checking && k !== 'Escape') return false;
      if (k !== 'Enter'){this.blockedChoice = null;this.moreAimed=false;}
      if (k === 'Escape') this.cancel();
      else if (/^[a-z0-9]$/i.test(k)) { if (this.features['input.typing'] !== false) this.type(k); }
      else if (k === 'Backspace') { if (this.features['input.typing'] !== false) this.backspace(); }
      else if (this.features['input.keyboard'] === false) return false;
      else if (k === 'Tab') this.flip();
      else if (k === 'Enter') this.commit();
      else if (k === 'ArrowDown' || k === 'ArrowRight') this.disc.step(1);
      else if (k === 'ArrowUp' || k === 'ArrowLeft') this.disc.step(-1);
      else return false;
      return true;
    }
  }
  Palette.SIZE = SIZE; Palette.CENTER = C;
  root.Palette = Palette;
})(this);
