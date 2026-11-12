// The Ctrl + drag gesture as a pure state machine (no Electron, no hook): easy to test.
//  - left button down, Ctrl held (before or during the drag), moved past `threshold` px  → open the palette there
//  - while open, the palette stays put so options can be aimed at, but follows on a leash:
//    if the cursor gets further than `leash` from its centre, the centre is pulled along
//  - letting go of Ctrl mid-drag → step aside (the drag continues as a normal drop)
//  - button up → release (the drop lands on the palette)
function createGesture({ threshold = 6, leash = 190 } = {}) {
  const s = { held: false, press: null, open: false, stepped: false, center: null };
  return {
    state: s,
    down(x, y) { s.held = true; s.press = { x, y }; },
    up() { const was = s.held && s.open && !s.stepped; s.held = false; s.press = null; return was ? { type: 'release' } : null; },
    // raw: cursor in physical pixels (for the threshold); p: cursor in the palette's coordinates (DIP)
    move(raw, p, ctrl, paused) {
      if (!s.held || !s.press || paused) return null;
      if (s.open) {
        if (s.stepped) return null;
        if (!ctrl) { s.stepped = true; return { type: 'step-aside' }; }
        const dx = p.x - s.center.x, dy = p.y - s.center.y, d = Math.hypot(dx, dy);
        if (d <= leash) return null;
        const k = (d - leash) / d;
        s.center = { x: s.center.x + dx * k, y: s.center.y + dy * k };
        return { type: 'place', center: { ...s.center } };
      }
      if (ctrl && (Math.abs(raw.x - s.press.x) > threshold || Math.abs(raw.y - s.press.y) > threshold)) {
        s.open = true; s.stepped = false; s.center = { ...p };
        return { type: 'open', center: { ...s.center } };
      }
      return null;
    },
    closed() { s.open = false; s.stepped = false; s.center = null; },
  };
}

module.exports = { createGesture };
