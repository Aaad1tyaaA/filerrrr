// Dot-matrix drawing shared by the main window and the overlay: a 5x7 font, small dot labels, and the Matrix Disc.
(function (root) {
  const FONT = {
    A:[14,17,17,31,17,17,17], B:[30,17,17,30,17,17,30], C:[14,17,16,16,16,17,14], D:[30,17,17,17,17,17,30], E:[31,16,16,30,16,16,31],
    F:[31,16,16,30,16,16,16], G:[14,17,16,23,17,17,15], H:[17,17,17,31,17,17,17], I:[14,4,4,4,4,4,14], J:[7,2,2,2,2,18,12],
    K:[17,18,20,24,20,18,17], L:[16,16,16,16,16,16,31], M:[17,27,21,21,17,17,17], N:[17,17,25,21,19,17,17], O:[14,17,17,17,17,17,14],
    P:[30,17,17,30,16,16,16], Q:[14,17,17,17,21,18,13], R:[30,17,17,30,20,18,17], S:[15,16,16,14,1,1,30], T:[31,4,4,4,4,4,4],
    U:[17,17,17,17,17,17,14], V:[17,17,17,17,17,10,4], W:[17,17,17,21,21,21,10], X:[17,17,10,4,10,17,17], Y:[17,17,10,4,4,4,4],
    Z:[31,1,2,4,8,16,31], 0:[14,17,19,21,25,17,14], 1:[4,12,4,4,4,4,14], 2:[14,17,1,2,4,8,31], 3:[31,2,4,2,1,17,14],
    4:[2,6,10,18,31,2,2], 5:[31,16,30,1,1,17,14], 6:[6,8,16,30,17,17,14], 7:[31,1,2,4,8,8,8], 8:[14,17,17,14,17,17,14],
    9:[14,17,17,15,1,2,12], '.':[0,0,0,0,0,12,12], '+':[0,4,4,31,4,4,0], '?':[14,17,1,2,4,0,4], ' ':[0,0,0,0,0,0,0],
  };
  const GLYPHS = {
    check: ['........#', '.......##', '#.....##.', '##...##..', '.##.##...', '..###....', '...#.....'],
    cross: ['##.....##', '.##...##.', '..##.##..', '...###...', '..##.##..', '.##...##.', '##.....##'],
  };

  function textCells(str, cols, row0) {
    const w = str.length * 6 - 1, x0 = Math.floor((cols - w) / 2), out = [];
    [...str].forEach((ch, i) => (FONT[ch] || FONT['?']).forEach((bits, r) => {
      for (let c = 0; c < 5; c++) if (bits & (16 >> c)) out.push([row0 + r, x0 + i * 6 + c]);
    }));
    return out;
  }
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const rgbVar = n => css(n).split(/\s+/).join(',');

  function dotText(cv, str, pitch, color) {
    const dpr = devicePixelRatio || 1, w = str.length * 6 - 1, h = 7;
    cv.width = w * pitch * dpr; cv.height = h * pitch * dpr;
    cv.style.width = w * pitch + 'px'; cv.style.height = h * pitch + 'px';
    const g = cv.getContext('2d'); g.scale(dpr, dpr);
    const lit = new Set(textCells(str, w, 0).map(([r, c]) => r * 100 + c)), dim = `rgba(${rgbVar('--fg')},.07)`;
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      const on = lit.has(r * 100 + c);
      g.fillStyle = on ? color : dim;
      g.beginPath(); g.arc(c * pitch + pitch / 2, r * pitch + pitch / 2, pitch * (on ? .36 : .22), 0, 7); g.fill();
    }
  }

  // ---------- Matrix Disc ----------
  const N = 25, MID = 12, DP = 9, SZ = 270, C = SZ / 2;
  const CELLS = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const dx = c - MID, dy = r - MID, d = Math.hypot(dx, dy);
    if (d <= 12.2) CELLS.push({ r, c, d, ang: ((Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2), tw: Math.random() * 6.28 });
  }
  const litText = str => new Set(textCells(str, N, 9).map(([r, c]) => r * 100 + c));
  const litGlyph = rows => new Set(rows.flatMap((row, r) => [...row].map((ch, c) => ch === '#' ? (r + 9) * 100 + (c + 8) : -1)).filter(v => v >= 0));

  class Disc {
    constructor(canvas, onChange = () => {}) {
      this.cv = canvas; this.onChange = onChange; this.isOpen = false;
      canvas.width = SZ * 2; canvas.height = SZ * 2;
    }
    // targets: format names for the files, or null while the files aren't known yet; tools: tool codes for them
    open(targets, tools = ['ZIP']) {
      this.colors = { acc: rgbVar('--acc'), mint: rgbVar('--ok-rgb'), rose: rgbVar('--bad-rgb') };
      Object.assign(this, { isOpen: true, inside: true, phase: 'pick', face: 'formats', idx: 0, query: '', frac: 0,
        openedAt: performance.now(), closingAt: 0, flipAt: 0, scrambleUntil: 0, onClosed: null, cancelled: false });
      this.setTargets(targets, tools);
      if (!this.raf) this.raf = requestAnimationFrame(t => this.frame(t));
    }
    setTargets(targets, tools = this.tools || ['ZIP']) {
      this.targets = targets; this.tools = tools;
      this.face = targets && !targets.length ? 'tools' : 'formats'; // nothing to convert to: only the tools fit
      this.idx = 0; this.relabel(false); this.onChange();
    }
    get waiting() { return !this.targets; }
    options() { return this.face === 'tools' ? this.tools : (this.targets || []); }
    select(i) { if (this.canPick() && i !== this.idx && i >= 0 && i < this.options().length) { this.idx = i; this.query = ''; this.relabel(); this.onChange(); } }
    value() { return this.options()[this.idx]; }
    relabel(scramble = true) {
      this.lit = this.waiting ? new Set() : litText(this.value() || '?');
      if (scramble) this.scrambleUntil = performance.now() + 230;
    }
    step(d) { if (!this.canPick()) return; const n = this.options().length; if (!n) return; this.idx = (this.idx + d + n) % n; this.query = ''; this.relabel(); this.onChange(); }
    type(ch) {
      if (!this.canPick()) return;
      const q = this.query + ch.toUpperCase(), list = this.options();
      let i = list.findIndex(f => f.startsWith(q)); if (i < 0) i = list.findIndex(f => f.includes(q));
      this.query = q;
      if (i >= 0 && i !== this.idx) { this.idx = i; this.relabel(); }
      this.onChange();
    }
    backspace() { this.query = this.query.slice(0, -1); this.onChange(); }
    flip() { if (this.canPick() && (this.targets.length || this.hasFormats) && this.tools.length) { this.flipAt = performance.now(); this.flipSwapped = false; } }
    setInside(v) { if (v !== this.inside) { this.inside = v; this.onChange(); } }
    canPick() { return this.isOpen && this.phase === 'pick' && !this.closingAt && !this.waiting; }
    progress(f) { if (this.phase === 'pick') { this.phase = 'progress'; this.progressAt = performance.now(); } this.frac = Math.max(this.frac, f); this.onChange(); }
    finish(ok,cancelled=false) { this.phase = 'done'; this.ok = ok;this.cancelled=cancelled; this.frac = 1; this.lit = cancelled?litText('STOP'):litGlyph(ok ? GLYPHS.check : GLYPHS.cross); this.onChange(); }
    close(onClosed) { if (!this.isOpen || this.closingAt) return; this.closingAt = performance.now(); this.onClosed = onClosed; }

    frame(t) {
      this.raf = 0;
      if (!this.isOpen) return;
      if (!this.lastFrame || t - this.lastFrame >= 30) { this.draw(t); this.lastFrame = t; }
      if (this.closingAt && t - this.closingAt > 380) {
        this.isOpen = false; this.cv.getContext('2d').clearRect(0, 0, SZ * 2, SZ * 2);
        const cb = this.onClosed; this.onClosed = null; cb && cb(); return;
      }
      this.raf = requestAnimationFrame(t2 => this.frame(t2));
    }

    draw(t) {
      const g = this.cv.getContext('2d'); g.setTransform(2, 0, 0, 2, 0, 0); g.clearRect(0, 0, SZ, SZ);
      const fg = '255,255,255', { acc, mint, rose } = this.colors; // the disc is an LED screen: always dark
      let sx = 1;
      if (this.flipAt) { // squash, swap faces at the midpoint, grow back
        const k = (t - this.flipAt) / 300;
        if (k >= .5 && !this.flipSwapped) {
          this.flipSwapped = true; this.face = this.face === 'tools' ? 'formats' : 'tools';
          this.idx = 0; this.query = ''; this.relabel(false); this.onChange();
        }
        if (k >= 1) this.flipAt = 0; else sx = Math.max(.04, Math.abs(Math.cos(k * Math.PI)));
      }
      g.translate(C, C); g.scale(sx, 1); g.translate(-C, -C);

      let lit = this.lit;
      if (t < this.scrambleUntil) {
        if (!this.noise || t - this.noiseAt > 45) { this.noise = new Set(CELLS.filter(() => Math.random() < .28).map(p => p.r * 100 + p.c)); this.noiseAt = t; }
        lit = this.noise;
      }
      const spin = this.waiting ? (t / 1100) % 1 : -1; // waiting for files: a lit arc runs round the rim
      const dim = this.phase === 'pick' && !this.inside ? .45 : 1;
      const endCol = this.phase === 'done' ? (this.cancelled?'176,176,169':this.ok ? mint : rose) : null;
      for (const p of CELLS) {
        const wake = Math.min(1, Math.max(0, (t - this.openedAt - p.d * 14) / 170));
        const gone = this.closingAt ? 1 - Math.min(1, Math.max(0, (t - this.closingAt - (12 - p.d) * 9) / 140)) : 1;
        const vis = wake * gone; if (vis <= 0) continue;
        const x = C + (p.c - MID) * DP, y = C + (p.r - MID) * DP, on = lit.has(p.r * 100 + p.c);
        let col, rad = 2, glow = 0;
        if (on) { col = endCol ? `rgba(${endCol},${vis})` : `rgba(${fg},${vis * dim})`; rad = 3.3; glow = this.phase === 'progress' ? 0 : 9; }
        else if (spin >= 0 && p.d > 10.5 && ((p.ang - spin + 1) % 1) < .22) { col = `rgba(${acc},${(1 - ((p.ang - spin + 1) % 1) / .22) * vis})`; rad = 2.6; }
        else col = `rgba(${fg},${(.1 + .06 * Math.sin(t / 700 + p.tw)) * vis * dim})`;
        g.shadowBlur = glow; g.shadowColor = endCol ? `rgb(${endCol})` : `rgba(${acc},.9)`;
        g.fillStyle = col; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
      }
      g.shadowBlur = 0;
    }

    // Caption under the disc: { cls, html }
    caption(fromLabel) {
      const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
      if (this.phase === 'progress') return { cls: 'route', html: `WORKING · <em>${Math.round(this.frac * 100)}%</em>` };
      if (this.phase === 'done') return this.cancelled?{cls:'route',html:'Cancelled'}:this.ok ? { cls: 'route', html: '<em>DONE</em> · files saved' } : { cls: 'route cancel', html: esc(this.failText || 'FAILED') };
      if (this.waiting) return { cls: 'route', html: 'BRING FILES HERE' };
      if (!this.inside) return { cls: 'route cancel', html: 'RELEASE TO CANCEL' };
      const n = this.options().length, typed = this.query ? `  “${esc(this.query.toLowerCase())}”` : '';
      if (!n) return { cls: 'route', html: 'No enabled options · check Features &amp; settings' };
      return this.face === 'tools'
        ? { cls: 'route', html: `TOOL · <em>${Formats.TOOL_NAMES[this.value()]}</em>  ${this.idx + 1}/${n}${typed}` }
        : { cls: 'route', html: `${esc(fromLabel)} → <em>${this.value()}</em>  ${this.idx + 1}/${n}${typed}` };
    }
  }
  Disc.SIZE = SZ;
  Disc.RADIUS = 122;

  root.Dots = { textCells, dotText, rgbVar, css, Disc };
})(this);
