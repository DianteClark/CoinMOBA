// Coin art. Everything is generated in code and cached to offscreen canvases.
const Art = (() => {
  const TEAM = ['#58a6e6', '#e4573f'], TEAM_DARK = ['#1f4f7d', '#7e2a1e'];
  const METAL = {
    vesper: ['#cfcbe8', '#6a6498'], kade: ['#efcd77', '#9a6a2a'], ione: ['#a9e6dd', '#3b8a8a'],
    solenne: ['#f9e4ae', '#cc8d4c'], sable: ['#9ea3b2', '#3f4250'], gravel: ['#d3a583', '#6e4a38'],
    minion0: ['#a9cdea', '#3f6f9c'], minion1: ['#efa694', '#9a4230'], monster: ['#a39a78', '#544c34'], big: ['#b7905f', '#5b3b22'], boss: ['#ffe08a', '#b07a1e'],
  };
  const cv = (w, h) => { const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; };
  const TAU = Math.PI * 2;

  // Emblems are drawn in a -1..1 box using the current fill and stroke.
  const star = (g, r1, r2, n, rot = 0) => { g.beginPath(); for (let i = 0; i < n * 2; i++) { const r = i % 2 ? r2 : r1, a = rot + i / (n * 2) * TAU; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); };
  const poly = (g, p) => { g.beginPath(); p.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.closePath(); g.fill(); };
  const EMBLEM = {
    vesper(g) { g.lineWidth = .13; g.beginPath(); g.arc(0, 0, .62, 0, TAU); g.stroke(); g.lineCap = 'round'; for (let i = 0; i < 4; i++) { const a = i * TAU / 4, c = Math.cos(a), s = Math.sin(a); g.beginPath(); g.moveTo(c * .34, s * .34); g.lineTo(c * .98, s * .98); g.stroke(); } g.beginPath(); g.arc(0, 0, .13, 0, TAU); g.fill(); },
    kade(g) { for (const s of [1, -1]) { g.save(); g.rotate(s * .72); poly(g, [[0, -1.02], [.14, -.72], [.11, .46], [.3, .5], [.3, .6], [.1, .62], [.1, .96], [-.1, .96], [-.1, .62], [-.3, .6], [-.3, .5], [-.11, .46], [-.14, -.72]]); g.restore(); } },
    ione(g) { g.lineWidth = .1; g.beginPath(); g.arc(0, 0, .8, 0, TAU); g.stroke(); for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * TAU / 3; g.save(); g.translate(Math.cos(a) * .46, Math.sin(a) * .46); g.rotate(a + Math.PI / 2); poly(g, [[0, -.3], [.19, 0], [0, .3], [-.19, 0]]); g.restore(); } g.beginPath(); g.arc(0, 0, .12, 0, TAU); g.fill(); },
    solenne(g) { g.beginPath(); g.arc(0, 0, .42, 0, TAU); g.fill(); for (let i = 0; i < 8; i++) { g.save(); g.rotate(i * TAU / 8); poly(g, [[-.11, -.55], [0, i % 2 ? -.86 : -1.04], [.11, -.55]]); g.restore(); } },
    sable(g) { g.beginPath(); g.arc(-.08, 0, .86, -1.25, 1.25); g.arc(-.58, 0, .86, .86, -.86, true); g.closePath(); g.fill(); g.save(); g.rotate(.62); poly(g, [[-.42, -.74], [-.26, -.42], [-.28, .3], [-.14, .34], [-.14, .42], [-.28, .44], [-.28, .72], [-.5, .72], [-.5, .44], [-.64, .42], [-.64, .34], [-.5, .3], [-.52, -.42]]); g.restore(); },
    gravel(g) { poly(g, [[-.95, -.55], [.6, -.55], [.98, -.32], [.5, -.12], [.34, .18], [.5, .5], [.72, .78], [-.56, .78], [-.34, .5], [-.2, .18], [-.26, -.1], [-.7, -.14]]); },
    minionMelee(g) { poly(g, [[0, -.9], [.72, -.1], [.72, .34], [0, -.34], [-.72, .34], [-.72, -.1]]); poly(g, [[0, .1], [.5, .58], [.5, .9], [0, .5], [-.5, .9], [-.5, .58]]); },
    minionRanged(g) { g.lineWidth = .2; g.beginPath(); g.arc(0, 0, .66, 0, TAU); g.stroke(); g.beginPath(); g.arc(0, 0, .22, 0, TAU); g.fill(); },
    monster(g) { for (const s of [-1, 1]) poly(g, [[s * .2, -.9], [s * .86, -.3], [s * .2, .3]]); g.beginPath(); g.arc(0, .46, .22, 0, TAU); g.fill(); },
    big(g) { for (const s of [-1, 1]) poly(g, [[s * .12, -.34], [s * 1, -.98], [s * .8, .1], [s * .3, .4]]); poly(g, [[-.34, .2], [.34, .2], [0, .96]]); },
    boss(g) { poly(g, [[-.92, .55], [-.98, -.5], [-.46, -.05], [0, -.92], [.46, -.05], [.98, -.5], [.92, .55]]); poly(g, [[-.82, .68], [.82, .68], [.8, .9], [-.8, .9]]); },
  };

  function star2(g, x, y, r) { g.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, l = i % 2 ? r * .3 : r; g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * l, y + Math.sin(a) * l); } g.closePath(); g.fill(); }
  function hex(c) { const n = parseInt(c.slice(1), 16); return [n >> 16, n >> 8 & 255, n & 255]; }
  function mix(a, b, t) { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; }
  const cache = new Map();

  // ---------- comic drawing kit: every shape gets a hard shadow, a hard highlight and an inked edge ----------
  const INK = '#140a1e', SH = '#241050';
  const SKIN = ['#ffd2a6', '#d98f58', '#8f5430'];
  let gx = null; // the context the kit below is drawing into; prerender only
  // Fills a traced shape, then cuts a hard shade and highlight by re-tracing it slightly offset.
  function cel(trace, col, o = {}) {
    const g = gx, sh = o.sh === undefined ? .085 : o.sh, lw = o.lw === undefined ? .07 : o.lw;
    g.save(); g.beginPath(); trace(); g.fillStyle = col; g.fill();
    if (sh > 0 || o.hi > 0) {
      g.clip();
      if (sh > 0) { g.save(); g.translate(-sh * .75, -sh); g.beginPath(); g.rect(-5, -5, 10, 10); trace(); g.fillStyle = mix(col, SH, o.dark || .5); g.fill('evenodd'); g.restore(); }
      if (o.hi > 0) { g.save(); g.translate(o.hi, o.hi * 1.2); g.beginPath(); g.rect(-5, -5, 10, 10); trace(); g.fillStyle = mix(col, '#ffffff', .6); g.fill('evenodd'); g.restore(); }
    }
    g.restore();
    if (lw > 0) { g.beginPath(); trace(); g.strokeStyle = o.ink || INK; g.lineWidth = lw; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }
  }
  const polyT = p => () => { p.forEach(([x, y], i) => gx[i ? 'lineTo' : 'moveTo'](x, y)); gx.closePath(); };
  const pg = (p, col, o) => cel(polyT(p), col, o);
  const ov = (x, y, rx, ry, col, o) => cel(() => { gx.moveTo(x + rx, y); gx.ellipse(x, y, rx, ry, 0, 0, TAU); }, col, o);
  const spot = (x, y, rx, ry, col) => { gx.beginPath(); gx.ellipse(x, y, rx, ry, 0, 0, TAU); gx.fillStyle = col; gx.fill(); };
  const line = (p, col = INK, w = .06) => { gx.beginPath(); p.forEach(([x, y], i) => gx[i ? 'lineTo' : 'moveTo'](x, y)); gx.strokeStyle = col; gx.lineWidth = w; gx.lineCap = 'round'; gx.lineJoin = 'round'; gx.stroke(); };
  const curve = (x0, y0, cx, cy, x1, y1, col = INK, w = .06) => { gx.beginPath(); gx.moveTo(x0, y0); gx.quadraticCurveTo(cx, cy, x1, y1); gx.strokeStyle = col; gx.lineWidth = w; gx.lineCap = 'round'; gx.stroke(); };
  // a head with a real jaw: domed on top, tapering to the chin
  const jaw = (cx, cy, w, h, ch = .62) => () => { const g = gx; g.moveTo(cx - w, cy - h * .12); g.bezierCurveTo(cx - w, cy - h * 1.2, cx + w, cy - h * 1.2, cx + w, cy - h * .12); g.bezierCurveTo(cx + w, cy + h * .52, cx + w * ch, cy + h, cx, cy + h); g.bezierCurveTo(cx - w * ch, cy + h, cx - w, cy + h * .52, cx - w, cy - h * .12); g.closePath(); };
  const bust = (col, w = 1.25, top = .66, o = { sh: .14 }) => cel(() => { const g = gx; g.moveTo(-w, 1.4); g.bezierCurveTo(-w, top + .12, -.6, top, -.34, top - .08); g.lineTo(.34, top - .08); g.bezierCurveTo(.6, top, w, top + .12, w, 1.4); g.closePath(); }, col, o);
  const head = (skin, w = .58, h = .68, y = 0, ch = .62) => cel(jaw(0, y, w, h, ch), skin, { sh: .11, hi: .03 });
  const grin = (y = .36, w = .25, d = .3) => { cel(() => { const g = gx; g.moveTo(-w, y); g.quadraticCurveTo(0, y + .05, w, y); g.quadraticCurveTo(0, y + d, -w, y); g.closePath(); }, '#ffffff', { sh: 0, lw: .06 }); };
  const sneer = (y = .38, w = .26) => { pg([[-w, y + .08], [-.04, y + .02], [w, y - .1], [w * .8, y + .08], [-.02, y + .16]], '#ffffff', { sh: 0, lw: .055 }); };
  // bright glowing eyes used on masks: slanted almonds, angry when `mean`
  const eyes = (y, col, mean, x = .23, w = .2, h = .12) => { for (const s of [-1, 1]) { const tilt = mean ? .13 : .03; pg([[s * (x - w), y + (mean ? h * .9 : h * .2)], [s * x, y - h - tilt * .6], [s * (x + w), y - tilt], [s * x, y + h]], col, { sh: 0, lw: .05 }); } };
  const brows = (y, x = .24, w = .22, angry = .14, lw = .1) => { for (const s of [-1, 1]) line([[s * (x - w), y + angry], [s * (x + w), y - angry]], INK, lw); };
  const pupils = (y, x = .23, r = .07, dx = 0) => { for (const s of [-1, 1]) { spot(s * x + dx, y, r, r, INK); spot(s * x + dx - r * .3, y - r * .3, r * .32, r * .32, '#ffffff'); } };
  const rivet = (x, y, r = .06, col = '#d7dce8') => ov(x, y, r, r, col, { sh: .03, lw: .03 });
  const star4 = (x, y, r, col, lw = .03) => pg([[x, y - r], [x + r * .24, y - r * .24], [x + r, y], [x + r * .24, y + r * .24], [x, y + r], [x - r * .24, y + r * .24], [x - r, y], [x - r * .24, y - r * .24]], col, { sh: 0, lw });

  // Draws into a transparent layer and returns it wrapped in a solid keyline, so a figure lifts off any field.
  function sticker(S, unit, paint, outlines) {
    const c = cv(S, S), l = c.getContext('2d'); l.translate(S / 2, S / 2); l.scale(unit, unit); paint(l);
    const out = cv(S, S), o = out.getContext('2d');
    for (const [col, w, ox = 0, oy = 0] of outlines) {
      const t = cv(S, S), m = t.getContext('2d'); m.drawImage(c, 0, 0); m.globalCompositeOperation = 'source-in'; m.fillStyle = col; m.fillRect(0, 0, S, S);
      if (w <= 0) o.drawImage(t, ox, oy); else for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; o.drawImage(t, ox + Math.cos(a) * w, oy + Math.sin(a) * w); }
    }
    o.drawImage(c, 0, 0);
    return out;
  }

  // ---------- fields behind a portrait; all in the unit where the field radius is about 1 ----------
  function rays(g, n, a, b, cy = .08, spin = .12) {
    g.fillStyle = a; g.fillRect(-1.4, -1.4, 2.8, 2.8); g.fillStyle = b;
    for (let i = 0; i < n; i++) { const a0 = i / n * TAU + spin, a1 = a0 + TAU / (2 * n); g.beginPath(); g.moveTo(0, cy); g.lineTo(Math.cos(a0) * 2.2, cy + Math.sin(a0) * 2.2); g.lineTo(Math.cos(a1) * 2.2, cy + Math.sin(a1) * 2.2); g.closePath(); g.fill(); }
  }
  // Ben-Day dots that swell toward the bottom edge
  function benday(g, col, top = .15, cell = .15, max = .46) {
    g.fillStyle = col; let row = 0;
    for (let y = top; y < 1.25; y += cell * .86, row++) for (let x = -1.25 + (row % 2 ? cell / 2 : 0); x < 1.25; x += cell) { const k = (y - top) / (1.25 - top), r = cell * max * k; if (r > .004) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); } }
  }
  function cracks(g, col, n = 7, w = .05, seed = 5) {
    const r = seeded(seed * 77 + 9); g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'miter'; g.lineCap = 'butt';
    for (let i = 0; i < n; i++) { const a = i / n * TAU + r() * .4; g.beginPath(); g.moveTo(Math.cos(a) * 1.25, Math.sin(a) * 1.25); let q = 1.25; for (let k = 0; k < 4; k++) { q -= .15 + r() * .1; const o = (k % 2 ? 1 : -1) * (.08 + r() * .1); g.lineTo(Math.cos(a + o) * q, Math.sin(a + o) * q); } g.stroke(); }
  }
  const FLD = {
    sun(g) { rays(g, 13, '#ffd21a', '#ffab00'); benday(g, '#e8690a', .25); },
    ultra(g) { rays(g, 13, '#1d3fe6', '#3f70ff', .08, .3); benday(g, '#0f1f8c', .25); },
    toxic(g) { rays(g, 11, '#86e822', '#5bbd14', .08, .2); benday(g, '#2c7410', .3); cracks(g, '#3a0e78', 8, .06, 3); },
    violet(g) { rays(g, 11, '#4a14a8', '#6d26da', .08, .45); benday(g, '#260a60', .3); cracks(g, '#a6ff2a', 8, .05, 8); },
    plain(g) { g.fillStyle = '#fff6df'; g.fillRect(-1.4, -1.4, 2.8, 2.8); benday(g, '#f0d9a8', .35, .17); },
    deputy(g) { rays(g, 11, '#ffe15a', '#ffc21a', .08, .1); },
    goon(g) { rays(g, 9, '#56179e', '#7a2ad6', .08, .3); },
    wild(g) { rays(g, 10, '#0f7f7a', '#14a493', .08, .2); benday(g, '#07494f', .3); },
    brute(g) { rays(g, 9, '#a3461a', '#cf6420', .08, .4); benday(g, '#4f1c08', .25); },
    hell(g) { rays(g, 12, '#200c26', '#531a1e', .05, .16); benday(g, '#ff5a14', .55, .13, .34); cracks(g, '#ffa126', 10, .05, 13); },
  };

  // ---------- mastery rims, unit radius 1. Each tier changes the silhouette, not just the colour ----------
  const RIMC = [['#e78350'], ['#8d5a1a'], ['#d9e4ee'], ['#ffc81f'], ['#c6f5ff'], null];
  const TOOTH = [[0, 0], [14, .04], [24, .035], [16, .085], [8, .15], [18, .17]];
  // outer edge as [angle, radius] pairs; villains get raked, saw-cut teeth
  function edge(tier, villain) {
    let [n, amp] = TOOTH[tier]; const out = [], base = tier >= 4 ? .94 : .955;
    if (villain && tier < 3) { n = 22; amp = Math.max(amp, .06); }
    if (!n) { for (let i = 0; i < 96; i++) out.push([i / 96 * TAU, .975]); return out; }
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU - Math.PI / 2, st = TAU / n;
      if (villain) { out.push([a, base]); out.push([a + st * .78, base + amp * (i % 2 ? 1 : .8)]); out.push([a + st * .86, base]); }
      else if (tier === 1) { out.push([a, base]); out.push([a + st * .08, base + amp]); out.push([a + st * .5, base + amp]); out.push([a + st * .58, base]); }
      else if (tier === 5) { out.push([a, base]); out.push([a + st * .5, base + (i % 2 ? amp * .55 : amp)]); }
      else { out.push([a, base]); out.push([a + st * .5, base + amp]); }
    }
    return out;
  }
  const edgeT = e => () => { e.forEach(([a, r], i) => gx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r)); gx.closePath(); };
  function rim(g, R, tier, villain) {
    g.save(); g.scale(R, R); gx = g;
    const e = edge(tier, villain), T = edgeT(e);
    if (tier === 5) {
      g.save(); g.beginPath(); T(); g.clip();
      const bands = ['#ff2d6f', '#ff9a1f', '#ffe14a', '#3fe07a', '#1fd7ff', '#7a5cff'];
      for (let i = 0; i < 36; i++) { const a = i / 36 * TAU; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 1.4, a - .005, a + TAU / 36 + .005); g.closePath(); g.fillStyle = bands[(i + (i >> 2)) % 6]; g.fill(); }
      g.translate(-.04, -.05); g.beginPath(); g.rect(-5, -5, 10, 10); T(); g.fillStyle = 'rgba(30,10,90,.5)'; g.fill('evenodd'); g.translate(.09, .11); g.beginPath(); g.rect(-5, -5, 10, 10); T(); g.fillStyle = 'rgba(255,255,255,.75)'; g.fill('evenodd');
      g.restore();
      g.beginPath(); T(); g.strokeStyle = INK; g.lineWidth = .05; g.lineJoin = 'miter'; g.stroke();
    } else cel(T, RIMC[tier][0], { sh: .05, hi: tier >= 2 ? .03 : 0, lw: tier >= 3 ? .05 : .055, dark: tier === 2 || tier === 4 ? .34 : .5 });
    const each = (n, f, off = 0) => { for (let i = 0; i < n; i++) { const a = (i + off) / n * TAU - Math.PI / 2; g.save(); g.rotate(a + Math.PI / 2); f(i); g.restore(); } };
    if (tier === 0) { g.beginPath(); g.arc(0, 0, .9, 0, TAU); g.strokeStyle = '#a4522a'; g.lineWidth = .02; g.stroke(); }
    else if (tier === 1) each(14, () => { spot(0, -.895, .036, .036, '#5a3608'); spot(-.01, -.905, .018, .018, '#ffd27a'); });
    else if (tier === 2) { each(24, () => line([[0, -.95], [0, -.86]], '#6b7f92', .018)); for (const a of [-2.3, -2.05, .9]) { g.save(); g.rotate(a); pg([[.86, -.05], [.96, -.05], [.96, .05], [.86, .05]], '#ffffff', { sh: 0, lw: 0 }); g.restore(); } each(4, () => ov(0, -.895, .05, .05, '#58b4ff', { sh: .02, lw: .025 })); }
    else if (tier === 3) each(16, () => ov(0, -.895, .045, .045, '#fff6c0', { sh: .022, lw: .028 }), .5);
    else if (tier === 4) { g.beginPath(); g.arc(0, 0, .885, 0, TAU); g.strokeStyle = '#3d7a94'; g.lineWidth = .022; g.stroke(); each(8, () => { pg([[0, -.99], [.075, -.895], [0, -.81], [-.075, -.895]], '#2fd9ff', { sh: .03, hi: .02, lw: .03 }); spot(-.018, -.9, .02, .024, '#ffffff'); }, .5); }
    else { g.beginPath(); g.arc(0, 0, .885, 0, TAU); g.strokeStyle = '#ffffff'; g.lineWidth = .03; g.stroke(); each(8, () => { star4(0, -.89, .12, '#ffffff', .028); spot(0, -.89, .028, .028, '#ffe14a'); }, .5); each(18, i => { if (!(i % 2)) star4(0, -1.05, .05, '#fffbe0', .018); }); }
    g.restore();
  }
  // Cross-cut at the inner edge: heroes are round, villains jagged
  function fieldEdge(villain, r) {
    const n = 26, out = []; for (let i = 0; i < (villain ? n : 96); i++) { const a = i / (villain ? n : 96) * TAU; out.push([a, villain ? r + (i % 2 ? .035 : -.055) : r]); } return out;
  }

  function comic(key, R0, team, tier, field, draw, o = {}) {
    const id = `${key}|${R0}|${team}|${tier}`; if (cache.has(id)) return cache.get(id);
    const ss = R0 < 60 ? 2 : R0 < 130 ? 1.5 : 1, R = Math.round(R0 * ss), P = Math.ceil(R * .2) + 2, S = R * 2 + P * 2, c = cv(S, S), g = c.getContext('2d');
    g.translate(S / 2, S / 2);
    const villain = team === 1 || !!o.jag, band = o.band || (team === 1 ? '#ff4a14' : team === 0 ? '#2348ff' : '#3a2a18'), rr = o.face || .79;
    if (o.rim) { g.save(); g.scale(R, R); gx = g; o.rim(g); g.restore(); }
    else if (tier >= 0) rim(g, R, tier, villain);
    else { g.save(); g.scale(R, R); gx = g; cel(edgeT(villain ? fieldEdge(true, .97) : edge(0, false)), o.rimCol || '#3a3a3a', { sh: .05, hi: .02, lw: .06 }); g.restore(); }
    g.scale(R, R); gx = g;
    // team band, then the field clipped to a round or saw-toothed window
    ov(0, 0, .845, .845, band, { sh: 0, hi: .02, lw: .045 });
    const FE = edgeT(fieldEdge(villain, rr));
    g.save(); g.beginPath(); FE(); g.clip(); g.save(); g.scale(rr, rr); field(g); g.restore(); g.restore(); gx = g;
    g.beginPath(); FE(); g.strokeStyle = INK; g.lineWidth = .04; g.lineJoin = 'miter'; g.stroke();
    // portrait is keylined, and may break the frame at the top
    const layer = sticker(S, R, l => { gx = l; l.scale(rr, rr); l.translate(0, .05); draw(); }, [[o.key || (team === 1 ? '#efff9a' : '#ffffff'), Math.max(1.2, R * .03)], [INK, 0, R * .012, R * .02]]);
    gx = g;
    g.save(); g.beginPath(); FE(); g.moveTo(Math.cos(Math.PI * 1.14) * .975, Math.sin(Math.PI * 1.14) * .975); g.arc(0, 0, .975, Math.PI * 1.14, Math.PI * 1.86); g.closePath(); g.clip();
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(layer, 0, 0); g.restore();
    gx = g;
    // one hard glint
    g.save(); g.beginPath(); FE(); g.clip(); g.fillStyle = 'rgba(255,255,255,.13)'; g.beginPath(); g.moveTo(-1, -.5); g.lineTo(-.4, -1); g.lineTo(.05, -1); g.lineTo(-1, .06); g.closePath(); g.fill(); g.restore();
    const out = { c, R, P, S }; cache.set(id, out); return out;
  }

  // ---------- 12 original characters. Each owns a colour, a silhouette and one instantly readable feature ----------
  const FACE = {
    hero: {
      // Longshot: ace pilot. Leather flying helmet, huge brass goggles with a sniper reticle, red scarf whipping out
      vesper() {
        pg([[.12, .46], [1.34, .1], [1.02, .42], [1.36, .62], [1, .72], [1.26, 1.06], [.26, .92]], '#ec2b1f', { sh: .12, hi: .03 });
        bust('#9a5526');
        for (let i = -3; i <= 3; i++) ov(i * .19, .78 - Math.abs(i) * .03, .17, .13, '#fff1cf', { sh: .05, lw: .05 });
        head(SKIN[0], .58, .66);
        cel(() => { const g = gx; g.moveTo(-.74, .4); g.bezierCurveTo(-.92, -1.08, .92, -1.08, .74, .4); g.lineTo(.5, .44); g.lineTo(.5, -.24); g.quadraticCurveTo(0, -.46, -.5, -.24); g.lineTo(-.5, .44); g.closePath(); }, '#b5602a', { sh: .13, hi: .04 });
        line([[0, -.82], [0, -.5]], '#6d3514', .05);
        line([[-.62, -.1], [-.62, .3]], '#6d3514', .05); line([[.62, -.1], [.62, .3]], '#6d3514', .05);
        line([[-.08, -.16], [.08, -.16]], INK, .13);
        for (const s of [-1, 1]) { ov(s * .3, -.16, .31, .31, '#ffd21a', { sh: .06, hi: .03 }); ov(s * .3, -.16, .205, .205, '#2fe6ff', { sh: .08, lw: .055 }); spot(s * .3 - .08, -.25, .055, .04, '#ffffff'); }
        line([[.3, -.36], [.3, .04]], '#ff2a1f', .05); line([[.1, -.16], [.5, -.16]], '#ff2a1f', .05);
        grin(.34, .27, .26);
      },
      // Captain Riposte: swashbuckler. Crossed rapiers, golden quiff, scarlet domino mask, huge heroic grin
      kade() {
        for (const s of [-1, 1]) { gx.save(); gx.rotate(s * .78); pg([[-.05, -1.35], [.05, -1.35], [.07, .7], [-.07, .7]], '#eef6ff', { sh: .03, lw: .05 }); pg([[-.3, .62], [.3, .62], [.24, .76], [-.24, .76]], '#ffd21a', { sh: .04, lw: .05 }); gx.restore(); }
        bust('#fff6e6'); pg([[-.72, .82], [-.36, .6], [.72, 1.3], [.26, 1.3]], '#ec2b1f', { sh: .06 });
        pg([[-.5, .66], [-.72, .34], [-.38, .42]], '#ffd21a', { sh: .04 }); pg([[.5, .66], [.72, .34], [.38, .42]], '#ffd21a', { sh: .04 });
        head(SKIN[0], .56, .66);
        // swooping gold quiff
        cel(() => { const g = gx; g.moveTo(-.62, -.02); g.bezierCurveTo(-.86, -.88, -.3, -1.2, .22, -1.08); g.bezierCurveTo(.66, -1.06, .92, -.72, .7, -.34); g.bezierCurveTo(.62, -.6, .42, -.7, .3, -.62); g.bezierCurveTo(.1, -.56, -.3, -.56, -.5, -.3); g.closePath(); }, '#ffcb1f', { sh: .1, hi: .05 });
        curve(-.38, -.78, .1, -.98, .52, -.72, '#c97800', .05);
        // domino mask
        cel(() => { const g = gx; g.moveTo(-.74, -.32); g.quadraticCurveTo(-.3, -.42, 0, -.22); g.quadraticCurveTo(.3, -.42, .74, -.32); g.quadraticCurveTo(.6, .06, .28, .08); g.quadraticCurveTo(.08, .08, 0, -.04); g.quadraticCurveTo(-.08, .08, -.28, .08); g.quadraticCurveTo(-.6, .06, -.74, -.32); g.closePath(); }, '#e0241c', { sh: .07, hi: .025 });
        eyes(-.14, '#ffffff', false, .28, .17, .1);
        grin(.32, .32, .3);
        curve(-.08, .63, 0, .68, .08, .63, INK, .04);
      },
      // Starling: bird-mage. Great fan of magenta and teal feathers, gold beak-visor, a star on the brow
      ione() {
        const n = 9; for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i - (n - 1) / 2) * .34, c = i % 2 ? '#ff2d9b' : '#10b8c4'; gx.save(); gx.rotate(a + Math.PI / 2); cel(() => { const g = gx; g.moveTo(0, -.3); g.quadraticCurveTo(.26, -.82, 0, -1.32); g.quadraticCurveTo(-.26, -.82, 0, -.3); g.closePath(); }, c, { sh: .06, hi: .025, lw: .055 }); spot(0, -1.05, .05, .09, '#ffffff'); gx.restore(); }
        bust('#0f97a8'); curve(-.5, .86, 0, 1.18, .5, .86, '#ff2d9b', .14);
        head(SKIN[1], .54, .64);
        cel(() => { const g = gx; g.moveTo(-.62, .08); g.bezierCurveTo(-.74, -.98, .74, -.98, .62, .08); g.lineTo(.3, -.04); g.lineTo(0, .3); g.lineTo(-.3, -.04); g.closePath(); }, '#10b8c4', { sh: .1, hi: .04 });
        pg([[-.16, -.08], [.16, -.08], [0, .4]], '#ffc21a', { sh: .05, hi: .02, lw: .055 });
        eyes(-.17, '#ffffff', false, .3, .18, .11); pupils(-.17, .3, .055);
        star4(0, -.56, .2, '#ffffff', .045);
        curve(-.17, .47, 0, .57, .17, .47, INK, .06);
      },
      // Dawnbringer: radiant healer. Blazing halo of sun rays, white hood, glowing eyes
      solenne() {
        const n = 13; for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i - (n - 1) / 2) * .36; gx.save(); gx.rotate(a + Math.PI / 2); pg([[-.17, -.74], [0, i % 2 ? -1.14 : -1.36], [.17, -.74]], i % 2 ? '#ff9a1f' : '#ffe14a', { sh: .04, lw: .05 }); gx.restore(); }
        ov(0, -.08, .84, .84, '#ffe14a', { sh: .06, hi: .03, lw: .06 });
        bust('#fff8ea'); pg([[-.26, .62], [.26, .62], [0, 1.2]], '#ffc21a', { sh: .05 });
        cel(() => { const g = gx; g.moveTo(-.78, .86); g.bezierCurveTo(-.98, -.86, .98, -.86, .78, .86); g.lineTo(.5, .76); g.lineTo(.5, -.1); g.quadraticCurveTo(0, -.5, -.5, -.1); g.lineTo(-.5, .76); g.closePath(); }, '#fffdf5', { sh: .12 });
        head(SKIN[2], .5, .62, .03);
        pg([[-.5, -.26], [-.18, -.42], [0, -.68], [.18, -.42], [.5, -.26], [.48, -.14], [0, -.32], [-.48, -.14]], '#ffc21a', { sh: .04, hi: .02, lw: .05 });
        ov(0, -.44, .085, .085, '#ff3a14', { sh: .03, lw: .035 });
        eyes(-.04, '#fff6b8', false, .22, .17, .1);
        curve(-.17, .34, 0, .47, .17, .34, '#2a1206', .06);
      },
      // Nightfall: guardian of the dusk. Deep indigo hood whose tip droops aside, gold crescent, white eyes above a mask
      sable() {
        cel(() => { const g = gx; g.moveTo(-1.3, 1.4); g.bezierCurveTo(-1.2, .5, -.8, .4, -.5, .4); g.lineTo(.5, .4); g.bezierCurveTo(.8, .4, 1.2, .5, 1.3, 1.4); g.closePath(); }, '#2a2388', { sh: .15 });
        cel(() => { const g = gx; g.moveTo(-.82, .72); g.bezierCurveTo(-1.04, -.7, -.3, -1.02, .3, -1.1); g.bezierCurveTo(.5, -1.28, .92, -1.26, 1.12, -1.02); g.bezierCurveTo(.92, -1.04, .78, -.92, .72, -.7); g.bezierCurveTo(1.02, -.2, .94, .4, .82, .72); g.closePath(); }, '#3a2fb4', { sh: .13, hi: .04 });
        cel(jaw(0, .02, .55, .62, .7), '#0f0c3a', { sh: 0, lw: .06 });
        cel(() => { const g = gx; g.moveTo(-.55, .02); g.quadraticCurveTo(0, -.08, .55, .02); g.bezierCurveTo(.5, .46, .28, .64, 0, .66); g.bezierCurveTo(-.28, .64, -.5, .46, -.55, .02); g.closePath(); }, '#8e6cff', { sh: .08, hi: .03 });
        line([[0, .08], [0, .6]], '#4a30b0', .04);
        eyes(-.17, '#ffffff', true, .25, .2, .12);
        cel(() => { const g = gx; g.moveTo(.07, -.8); g.arc(-.02, -.62, .25, -.75, 2.2, true); g.quadraticCurveTo(-.08, -.6, .07, -.8); g.closePath(); }, '#ffd21a', { sh: .03, hi: .015, lw: .045 });
      },
      // Bulwark: living fortress. Enormous pauldrons, castle-crown helm, blazing T-visor
      gravel() {
        for (const s of [-1, 1]) ov(s * .86, .72, .56, .5, '#ff7a1a', { sh: .13, hi: .04 });
        for (const s of [-1, 1]) { rivet(s * .6, .5); rivet(s * .96, .36); rivet(s * 1.14, .62); }
        bust('#c9d2dc', 1.05, .7);
        pg([[-.72, .62], [-.72, -.62], [-.5, -.62], [-.5, -1.06], [-.24, -1.06], [-.24, -.72], [-.13, -.72], [-.13, -1.06], [.13, -1.06], [.13, -.72], [.24, -.72], [.24, -1.06], [.5, -1.06], [.5, -.62], [.72, -.62], [.72, .62], [.42, .86], [-.42, .86]], '#ff7a1a', { sh: .13, hi: .045 });
        pg([[-.72, -.62], [.72, -.62], [.72, -.44], [-.72, -.44]], '#c9d2dc', { sh: .04, lw: .05 });
        pg([[-.62, -.3], [.62, -.3], [.62, -.08], [.15, -.08], [.15, .42], [-.15, .42], [-.15, -.08], [-.62, -.08]], '#141026', { sh: 0, lw: .05 });
        pg([[-.54, -.25], [.54, -.25], [.54, -.13], [.09, -.13], [.09, .34], [-.09, .34], [-.09, -.13], [-.54, -.13]], '#ffe14a', { sh: 0, hi: .02, lw: 0 });
        for (const s of [-1, 1]) { rivet(s * .55, .1, .065); rivet(s * .42, .6, .065); rivet(s * .62, -.53, .05); }
      },
    },
    villain: {
      // Deadbolt: vault-door head, a glowing keyhole for a face, steel bars through the temples
      vesper() {
        for (const s of [-1, 1]) { pg([[s * .55, -.2], [s * 1.34, -.2], [s * 1.34, .08], [s * .55, .08]], '#c0c7d4', { sh: .07, hi: .03 }); pg([[s * 1.12, -.28], [s * 1.26, -.28], [s * 1.26, .16], [s * 1.12, .16]], '#ff6a1f', { sh: .04 }); }
        bust('#3a2a66');
        ov(0, -.04, .76, .78, '#6e7690', { sh: .12, hi: .04 });
        ov(0, -.04, .57, .59, '#9098ae', { sh: .08, hi: .02, lw: .055 });
        for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; rivet(Math.cos(a) * .67, -.04 + Math.sin(a) * .69, .058, '#dfe5ef'); }
        cel(() => { const g = gx; g.moveTo(-.15, .46); g.lineTo(-.09, .06); g.arc(0, -.1, .19, Math.PI * .68, Math.PI * .32); g.lineTo(.15, .46); g.closePath(); }, '#a6ff2a', { sh: .05, hi: .02, lw: .06 });
        line([[-.5, -.46], [-.14, -.3]], INK, .15); line([[.5, -.46], [.14, -.3]], INK, .15);
        pg([[-.5, -.28], [-.2, -.2], [-.28, -.08], [-.46, -.14]], '#ff5a14', { sh: 0, lw: .045 }); pg([[.5, -.28], [.2, -.2], [.28, -.08], [.46, -.14]], '#ff5a14', { sh: 0, lw: .045 });
      },
      // The Duelist: blood-red bicorne, black mask, waxed moustache like two hooks
      kade() {
        bust('#1b0f2e'); pg([[-.3, .6], [.3, .6], [.12, 1.2], [-.12, 1.2]], '#fff0dc', { sh: .05 });
        head('#f5dfc8', .52, .66, .04, .5);
        cel(() => { const g = gx; g.moveTo(-.52, -.26); g.quadraticCurveTo(0, -.42, .52, -.26); g.lineTo(.46, .08); g.lineTo(.14, .04); g.lineTo(0, .16); g.lineTo(-.14, .04); g.lineTo(-.46, .08); g.closePath(); }, '#1a1024', { sh: 0, hi: .025 });
        eyes(-.12, '#d8ff5a', true, .25, .18, .11);
        cel(() => { const g = gx; g.moveTo(0, .28); g.bezierCurveTo(.3, .18, .5, .34, .62, .06); g.bezierCurveTo(.72, .44, .36, .5, 0, .42); g.bezierCurveTo(-.36, .5, -.72, .44, -.62, .06); g.bezierCurveTo(-.5, .34, -.3, .18, 0, .28); g.closePath(); }, '#1a1024', { sh: 0, hi: .02, lw: .04 });
        pg([[-.1, .52], [.1, .52], [0, .84]], '#1a1024', { sh: 0, lw: .04 });
        cel(() => { const g = gx; g.moveTo(-1.26, -.3); g.bezierCurveTo(-.92, -.46, -.5, -.52, -.5, -.34); g.quadraticCurveTo(0, -.5, .5, -.34); g.bezierCurveTo(.5, -.52, .92, -.46, 1.26, -.3); g.bezierCurveTo(1, -.72, .52, -1.04, 0, -1.2); g.bezierCurveTo(-.52, -1.04, -1, -.72, -1.26, -.3); g.closePath(); }, '#e0241c', { sh: .12, hi: .04 });
        curve(-1.02, -.42, 0, -1.2, 1.02, -.42, '#ffd21a', .06);
        ov(0, -.72, .16, .16, '#ffd21a', { sh: .05, lw: .045 }); spot(0, -.72, .07, .07, '#a6ff2a');
      },
      // Madame Hex: towering crooked hat, lilac skin, burning magenta eyes, a hexagon on the band
      ione() {
        for (const s of [-1, 1]) cel(() => { const g = gx; g.moveTo(s * .44, -.5); g.bezierCurveTo(s * 1.06, -.1, s * .98, .6, s * .82, 1.1); g.lineTo(s * .4, .9); g.closePath(); }, '#ff2d9b', { sh: .1, hi: .03 });
        bust('#3a1278');
        head('#e9ccff', .5, .62, .04, .55);
        cel(() => { const g = gx; g.moveTo(-.46, -.42); g.bezierCurveTo(-.3, -.9, -.2, -1.24, .08, -1.5); g.bezierCurveTo(.22, -1.3, .6, -1.26, .78, -1.32); g.bezierCurveTo(.52, -1.1, .4, -.84, .46, -.42); g.closePath(); }, '#6d26da', { sh: .12, hi: .04 });
        cel(() => { const g = gx; g.moveTo(-1.26, -.32); g.quadraticCurveTo(0, -.72, 1.26, -.32); g.quadraticCurveTo(0, -.16, -1.26, -.32); g.closePath(); }, '#4a14a8', { sh: .06, hi: .025 });
        pg([[-.47, -.56], [.47, -.56], [.46, -.42], [-.46, -.42]], '#a6ff2a', { sh: .03, lw: .05 });
        const hx = []; for (let i = 0; i < 6; i++) hx.push([Math.cos(i / 6 * TAU) * .17, -.49 + Math.sin(i / 6 * TAU) * .17]); pg(hx, '#ff6a1f', { sh: .04, lw: .05 });
        brows(-.2, .25, .2, .16, .09);
        eyes(-.05, '#ff2d9b', true, .25, .2, .12);
        pg([[-.22, .32], [0, .28], [.26, .22], [.14, .42], [-.06, .46]], '#7a1fd6', { sh: 0, lw: .05 });
      },
      // The Plague Doctor: enormous bone beak, round toxic lenses, wide black hat
      solenne() {
        bust('#1a2b24');
        ov(0, -.1, .58, .6, '#e6dab4', { sh: .1, hi: .03 });
        cel(() => { const g = gx; g.moveTo(-.34, .1); g.bezierCurveTo(.1, .3, .7, .78, 1.12, 1.24); g.bezierCurveTo(.5, 1.02, -.1, .86, -.34, .5); g.closePath(); }, '#f2e8c6', { sh: .1, hi: .03 });
        curve(-.28, .32, .3, .6, 1.02, 1.14, '#8a7a4e', .05);
        for (const s of [-1, 1]) { ov(s * .27, -.14, .25, .25, '#2a3a1e', { sh: 0, lw: .07 }); ov(s * .27, -.14, .17, .17, '#a6ff2a', { sh: .06, lw: .04 }); spot(s * .27 - .06, -.2, .045, .035, '#f5ffe0'); }
        cel(() => { const g = gx; g.moveTo(-1.3, -.42); g.quadraticCurveTo(0, -.72, 1.3, -.42); g.quadraticCurveTo(0, -.24, -1.3, -.42); g.closePath(); }, '#15131c', { sh: 0, hi: .03 });
        cel(() => { const g = gx; g.moveTo(-.54, -.5); g.lineTo(-.46, -1.2); g.quadraticCurveTo(0, -1.3, .46, -1.2); g.lineTo(.54, -.5); g.closePath(); }, '#1f1c2a', { sh: .08, hi: .04 });
        pg([[-.54, -.68], [.54, -.68], [.54, -.5], [-.54, -.5]], '#a6ff2a', { sh: .03, lw: .05 });
      },
      // Shiv: ragged black hood, white face, wide stitched grin, one blazing eye, a knife behind the shoulder
      sable() {
        gx.save(); gx.rotate(.5); pg([[.5, -1.62], [.72, -.88], [.3, -.88]], '#eef2f8', { sh: .05, hi: .02 }); pg([[.22, -.92], [.8, -.92], [.8, -.78], [.22, -.78]], '#ff5a14', { sh: .04 }); pg([[.42, -.78], [.6, -.78], [.6, -.2], [.42, -.2]], '#3a2a18', { sh: .04 }); gx.restore();
        bust('#14121a');
        pg([[-.84, .86], [-.96, .3], [-.8, .36], [-.94, -.24], [-.72, -.16], [-.76, -.72], [-.42, -.76], [-.34, -1.1], [-.06, -.92], [.24, -1.16], [.38, -.78], [.76, -.76], [.72, -.18], [.96, -.24], [.8, .36], [.96, .3], [.84, .86]], '#1e1b26', { sh: .1, hi: .035 });
        head('#f7f2e2', .52, .62, .03, .68);
        pg([[-.42, -.34], [-.1, -.14], [-.2, .02], [-.42, -.08]], '#ff5a14', { sh: 0, lw: .05 }); spot(-.26, -.13, .05, .05, INK);
        line([[.12, -.3], [.42, -.02]], INK, .09); line([[.42, -.3], [.12, -.02]], INK, .09);
        cel(() => { const g = gx; g.moveTo(-.46, .2); g.quadraticCurveTo(0, .4, .46, .14); g.quadraticCurveTo(.24, .62, 0, .6); g.quadraticCurveTo(-.26, .62, -.46, .2); g.closePath(); }, '#ffffff', { sh: 0, lw: .06 });
        for (let i = -4; i <= 4; i++) { const x = i * .1; line([[x, .22 + (1 - Math.abs(i) / 4) * .1], [x, .36 + (1 - Math.abs(i) / 4) * .22]], INK, .04); }
        curve(-.46, .3, 0, .52, .46, .26, INK, .04);
      },
      // Ironjaw: bull-necked bald brute, huge bolted underbite with tusks, one red targeting eye
      gravel() {
        bust('#5a2a14', 1.3, .56);
        for (const s of [-1, 1]) ov(s * .66, -.1, .13, .2, '#e8894e', { sh: .05 });
        ov(0, -.26, .62, .62, '#e8894e', { sh: .1, hi: .04 });
        line([[-.5, -.46], [-.08, -.26]], INK, .15); line([[.5, -.46], [.08, -.26]], INK, .15);
        ov(-.25, -.2, .12, .09, '#ffffff', { sh: 0, lw: .045 }); spot(-.22, -.19, .05, .05, INK);
        ov(.27, -.2, .16, .15, '#3a4150', { sh: 0, lw: .05 }); ov(.27, -.2, .1, .09, '#ff2a1f', { sh: 0, hi: .02, lw: .035 });
        line([[-.26, -.74], [-.14, -.46], [-.28, -.42]], '#b24e20', .045);
        pg([[-.86, .14], [.86, .14], [.72, .74], [.42, .96], [-.42, .96], [-.72, .74]], '#aeb6c6', { sh: .12, hi: .045 });
        pg([[-.66, .32], [.66, .32], [.58, .62], [-.58, .62]], '#1a1422', { sh: 0, lw: .05 });
        for (let i = -3; i <= 3; i++) pg([[i * .17 - .07, .6], [i * .17, .36], [i * .17 + .07, .6]], '#ffffff', { sh: 0, lw: .03 });
        for (const s of [-1, 1]) { pg([[s * .42, .18], [s * .3, -.14], [s * .22, .18]], '#fff4d2', { sh: .03, lw: .05 }); rivet(s * .76, .28, .07); rivet(s * .56, .82, .07); }
      },
    },
  };
  const FIELD = { hero: { vesper: 'sun', kade: 'ultra', ione: 'sun', solenne: 'ultra', sable: 'sun', gravel: 'ultra' }, villain: { vesper: 'toxic', kade: 'violet', ione: 'toxic', solenne: 'violet', sable: 'toxic', gravel: 'violet' } };
  function champCoin(id, team, tier, R = 52) {
    const side = team === 1 ? 'villain' : 'hero';
    return comic(`hv${side}${id}`, R, team === 1 ? 1 : 0, tier, FLD[FIELD[side][id]], FACE[side][id]);
  }
  const MINION = {
    // Deputies: ultramarine patrol cap and a big gold badge; ranged ones wear a yellow visor and a whistle
    deputy(ranged) {
      bust('#2348ff', 1.15, .68);
      head(SKIN[0], .56, .62, .08);
      if (ranged) { pg([[-.7, -.1], [.7, -.1], [.62, -.72], [0, -.96], [-.62, -.72]], '#ffc21a', { sh: .1, hi: .04, lw: .08 }); pg([[-.62, -.1], [.62, -.1], [.54, .1], [-.54, .1]], '#2fe6ff', { sh: .05, lw: .07 }); }
      else { cel(() => { const g = gx; g.moveTo(-.74, -.24); g.quadraticCurveTo(0, -.46, .74, -.24); g.lineTo(.6, -.86); g.quadraticCurveTo(0, -1.08, -.6, -.86); g.closePath(); }, '#2348ff', { sh: .1, hi: .04, lw: .08 }); pg([[-.8, -.22], [.8, -.22], [.6, -.02], [-.6, -.02]], '#10205e', { sh: 0, lw: .07 }); ov(0, -.64, .2, .2, '#ffd21a', { sh: .05, hi: .02, lw: .06 }); }
      for (const s of [-1, 1]) spot(s * .24, ranged ? .22 : .16, .09, .1, INK);
      curve(-.2, .42, 0, .56, .2, .42, INK, .08);
    },
    // Goons: violet beanie and toxic bandana for brawlers; orange cap and eye patch for the shooters
    goon(ranged) {
      bust('#2a1540', 1.2, .66);
      head('#d9a077', .58, .62, .08, .74);
      if (ranged) { pg([[-.64, -.24], [.66, -.24], [.58, -.84], [-.56, -.86]], '#ff6a1f', { sh: .1, hi: .04, lw: .08 }); pg([[.56, -.26], [1.14, -.14], [.62, -.06]], '#ff6a1f', { sh: .06, lw: .07 }); pg([[-.46, -.16], [-.02, -.1], [-.02, .28], [-.44, .24]], INK, { sh: 0, lw: 0 }); line([[-.62, -.3], [.6, .1]], INK, .08); spot(.26, .12, .11, .11, '#ffe14a'); spot(.26, .12, .05, .05, INK); curve(-.22, .5, .05, .42, .28, .5, INK, .09); }
      else { cel(() => { const g = gx; g.moveTo(-.68, -.22); g.bezierCurveTo(-.74, -1.02, .74, -1.02, .68, -.22); g.closePath(); }, '#7a2ad6', { sh: .12, hi: .04, lw: .08 }); pg([[-.72, -.32], [.72, -.32], [.68, -.1], [-.68, -.1]], '#4a14a8', { sh: 0, lw: .07 }); pg([[-.62, .24], [.62, .24], [.44, .72], [0, .96], [-.44, .72]], '#a6ff2a', { sh: .08, hi: .03, lw: .08 }); line([[-.44, -.02], [-.12, .14]], INK, .12); line([[.44, -.02], [.12, .14]], INK, .12); }
    },
  };
  // Minions sit a step behind champions: the same art with some colour taken out, done once on the cached sprite.
  const quieted = new WeakSet();
  function quiet(spr, amt) {
    if (!spr || !spr.c || quieted.has(spr.c)) return spr; quieted.add(spr.c);
    const c = spr.c, g = c.getContext('2d'), keep = cv(c.width, c.height); keep.getContext('2d').drawImage(c, 0, 0);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = amt; g.fillStyle = '#868686'; g.globalCompositeOperation = 'saturation';
    if (g.globalCompositeOperation === 'saturation') { g.fillRect(0, 0, c.width, c.height); g.globalCompositeOperation = 'destination-in'; g.globalAlpha = 1; g.drawImage(keep, 0, 0); }
    else { g.globalCompositeOperation = 'source-atop'; g.globalAlpha = amt * .6; g.fillRect(0, 0, c.width, c.height); }
    g.restore(); return spr;
  }
  function minionCoin(team, ranged) {
    const hero = team === 0;
    return quiet(comic(`mn${team}${ranged ? 'r' : 'm'}`, 30, hero ? 0 : 1, -1, hero ? FLD.deputy : FLD.goon, () => MINION[hero ? 'deputy' : 'goon'](ranged), { rimCol: hero ? '#1d3fe6' : '#ff4a14', band: hero ? '#ffffff' : '#ffb01f', face: .82 }), .34);
  }
  // Civilians are deliberately plain: a soft cream disc, a round friendly face and everyday colours.
  function civCoin(v) {
    v = v % 4; const clothes = ['#ef8f2a', '#49b86a', '#ec5f7a', '#4a8fe0'][v], skin = SKIN[v % 3], hair = ['#3f2410', '#c98a2a', '#b9b4c0', '#7a3a18'][v];
    return comic('civ' + v, 20, -1, -1, FLD.plain, () => {
      bust(clothes, 1.1, .7); head(skin, .58, .62, .08);
      cel(() => { const g = gx; g.moveTo(-.66, .02); g.bezierCurveTo(-.74, -.96, .74, -.96, .66, .02); g.quadraticCurveTo(.3, -.42, -.1, -.34); g.quadraticCurveTo(-.46, -.3, -.66, .02); g.closePath(); }, hair, { sh: .07, hi: .03, lw: .08 });
      for (const s of [-1, 1]) spot(s * .22, .08, .085, .1, INK);
      curve(-.22, .36, 0, .54, .22, .36, INK, .08);
    }, { rimCol: '#7a6a50', band: '#fff0cf', key: '#ffffff', face: .84 });
  }
  // Neutral beasts, then the Colossus: a burning stone titan far bigger and meaner than anything else on the map
  const BEAST = {
    mon() {
      for (const s of [-1, 1]) pg([[s * .4, -.2], [s * 1.2, -.86], [s * 1.1, -.08], [s * .6, .18]], '#ffb01f', { sh: .08, hi: .03 });
      ov(0, .08, .72, .7, '#ffb01f', { sh: .12, hi: .04 });
      for (const s of [-1, 1]) { pg([[s * .08, -.14], [s * .54, -.32], [s * .5, .08], [s * .14, .1]], '#ffffff', { sh: 0, lw: .06 }); spot(s * .3, -.1, .1, .1, '#e0241c'); spot(s * .3, -.1, .045, .045, INK); }
      pg([[-.5, .36], [.5, .36], [.3, .68], [-.3, .68]], '#3a0e18', { sh: 0, lw: .06 });
      pg([[-.34, .36], [-.2, .62], [-.08, .36]], '#ffffff', { sh: 0, lw: .04 }); pg([[.34, .36], [.2, .62], [.08, .36]], '#ffffff', { sh: 0, lw: .04 });
    },
    big() {
      for (const s of [-1, 1]) cel(() => { const g = gx; g.moveTo(s * .5, -.42); g.bezierCurveTo(s * 1.2, -.42, s * 1.34, -1.02, s * .86, -1.36); g.bezierCurveTo(s * .96, -.98, s * .72, -.84, s * .36, -.76); g.closePath(); }, '#f2e8c6', { sh: .08, hi: .03 });
      bust('#7a2f12', 1.3, .6);
      pg([[-.76, -.46], [-.44, -.86], [.44, -.86], [.76, -.46], [.8, .34], [.5, .86], [-.5, .86], [-.8, .34]], '#d95a1c', { sh: .13, hi: .045 });
      pg([[-.62, -.4], [-.08, -.1], [-.12, .1], [-.62, -.12]], '#3a1006', { sh: 0, lw: .05 }); pg([[.62, -.4], [.08, -.1], [.12, .1], [.62, -.12]], '#3a1006', { sh: 0, lw: .05 });
      pg([[-.48, -.26], [-.16, -.08], [-.2, .02], [-.48, -.12]], '#ffe14a', { sh: 0, lw: .03 }); pg([[.48, -.26], [.16, -.08], [.2, .02], [.48, -.12]], '#ffe14a', { sh: 0, lw: .03 });
      pg([[-.52, .36], [.52, .36], [.42, .72], [-.42, .72]], '#2a0a06', { sh: 0, lw: .06 });
      for (const s of [-1, 1]) pg([[s * .4, .74], [s * .36, .14], [s * .18, .74]], '#fff4d2', { sh: .04, lw: .05 });
      ov(0, .22, .1, .08, '#ffb01f', { sh: .03, lw: .04 });
    },
    boss() {
      for (const s of [-1, 1]) { cel(() => { const g = gx; g.moveTo(s * .56, -.64); g.bezierCurveTo(s * 1.3, -.7, s * 1.5, -1.1, s * 1.16, -1.56); g.bezierCurveTo(s * 1.08, -1.2, s * .84, -1.06, s * .34, -.94); g.closePath(); }, '#2a2436', { sh: .1, hi: .04, lw: .08 }); line([[s * 1.26, -1.14], [s * .9, -1.0]], '#ff8a1f', .04); }
      for (const s of [-1, 1]) ov(s * .98, .74, .62, .56, '#37304a', { sh: .14, hi: .04, lw: .08 });
      pg([[-.9, -.5], [-.56, -.98], [.56, -.98], [.9, -.5], [1, .26], [.72, 1.04], [-.72, 1.04], [-1, .26]], '#4a4260', { sh: .15, hi: .05, lw: .085 });
      pg([[-.34, -.98], [-.18, -1.32], [0, -1.04], [.18, -1.32], [.34, -.98]], '#ff5a14', { sh: .05, hi: .03, lw: .07 });
      const seam = p => { line(p, INK, .13); line(p, '#ffa126', .06); };
      seam([[-.84, -.32], [-.62, -.5], [-.66, -.74]]); seam([[.86, .1], [.62, .24], [.72, .48], [.54, .62]]); seam([[-.82, .3], [-.56, .46], [-.7, .72]]); seam([[.16, -.92], [.1, -.7], [.24, -.6]]);
      pg([[-.86, -.46], [-.1, -.08], [-.1, .16], [-.82, -.14]], '#231d30', { sh: 0, hi: .04, lw: .07 });
      pg([[.86, -.46], [.1, -.08], [.1, .16], [.82, -.14]], '#231d30', { sh: 0, hi: .04, lw: .07 });
      for (const s of [-1, 1]) { pg([[s * .7, -.34], [s * .16, -.04], [s * .22, .12], [s * .66, -.08]], '#ff3a14', { sh: 0, lw: .045 }); pg([[s * .58, -.25], [s * .24, -.05], [s * .28, .05], [s * .55, -.1]], '#ffe14a', { sh: 0, lw: 0 }); }
      pg([[-.64, .3], [.64, .3], [.54, .86], [-.54, .86]], '#ff5a14', { sh: 0, lw: .08 });
      pg([[-.58, .42], [.58, .42], [.5, .78], [-.5, .78]], '#17101e', { sh: 0, lw: 0 });
      for (let i = -3; i <= 3; i++) { pg([[i * .165 - .075, .3], [i * .165, .6], [i * .165 + .075, .3]], '#fff4d2', { sh: .025, lw: .04 }); pg([[i * .165 - .07, .86], [i * .165, .62], [i * .165 + .07, .86]], '#fff4d2', { sh: .025, lw: .04 }); }
    },
  };
  // heavy spiked iron collar for the beasts
  const beastRim = (n, amp, col, inner) => g => {
    const e = []; for (let i = 0; i < n; i++) { const a = i / n * TAU - Math.PI / 2, st = TAU / n; e.push([a, .92]); e.push([a + st * .2, .92 + amp * .3]); e.push([a + st * .5, .92 + amp]); e.push([a + st * .8, .92 + amp * .3]); }
    cel(edgeT(e), col, { sh: .06, hi: .035, lw: .06 });
    if (inner) { g.beginPath(); g.arc(0, 0, .885, 0, TAU); g.strokeStyle = inner; g.lineWidth = .05; g.stroke(); }
  };
  const monsterCoin = (big, boss) => boss
    ? comic('boss', 104, -1, -1, FLD.hell, BEAST.boss, { rim: beastRim(14, .19, '#2a2436', '#ff5a14'), band: '#ff5a14', key: '#ffb01f', face: .84, jag: true })
    : big ? comic('big', 60, -1, -1, FLD.brute, BEAST.big, { rim: beastRim(10, .13, '#6a3a1a', '#ffb01f'), band: '#ffb01f', key: '#ffe9b0', face: .84, jag: true })
      : comic('mon', 34, -1, -1, FLD.wild, BEAST.mon, { rim: beastRim(8, .11, '#2e6b5e'), band: '#ffb01f', key: '#ffffff', face: .84, jag: true });

  // Generic struck coin (gold pickups, core tops, the title and wipe coins).
  function coin(key, R0, emblem, metal, team, tier = -1, emblemScale = .56) {
    const id = `${key}|${R0}|${team}|${tier}`; if (cache.has(id)) return cache.get(id);
    const R = R0, P = 3 + Math.ceil(R * .14), S = R * 2 + P * 2, c = cv(S, S), g = c.getContext('2d');
    g.translate(S / 2, S / 2);
    if (tier >= 0) rim(g, R, tier, false);
    g.scale(R, R); gx = g;
    const inner = tier >= 0 ? .82 : .98, bright = metal[0], deep = metal[1];
    if (team !== null && team !== undefined && team >= 0) ov(0, 0, inner, inner, TEAM[team], { sh: 0, lw: .05 });
    const fr = team >= 0 && team !== undefined && team !== null ? inner - .08 : inner;
    ov(0, 0, fr, fr, bright, { sh: .11, hi: .04, lw: .055 });
    g.save(); g.beginPath(); g.arc(0, 0, fr * .98, 0, TAU); g.clip(); g.fillStyle = deep; g.globalAlpha = .22; g.save(); g.scale(fr, fr); benday(g, deep, .2, .14); g.restore(); g.globalAlpha = 1; g.restore();
    const E = EMBLEM[emblem];
    if (E) {
      const layer = sticker(S, R, l => { l.scale(emblemScale, emblemScale); l.fillStyle = mix(deep, INK, .55); l.strokeStyle = l.fillStyle; E(l); }, [['#ffffff', Math.max(.8, R * .022)]]);
      g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(layer, 0, 0);
    }
    const out = { c, R, P, S }; cache.set(id, out); return out;
  }

  // soft dot and shadow sprites
  function glow(color) {
    const id = 'g' + color; if (cache.has(id)) return cache.get(id);
    const c = cv(64, 64), g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, color); r.addColorStop(.3, color); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = .9; g.fillStyle = r; g.fillRect(0, 0, 64, 64); cache.set(id, c); return c;
  }
  let shadowC = null;
  function shadow() { if (shadowC) return shadowC; const c = cv(128, 128), g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 8, 64, 64, 64); r.addColorStop(0, 'rgba(4,16,14,.62)'); r.addColorStop(.62, 'rgba(4,16,14,.34)'); r.addColorStop(1, 'rgba(4,16,14,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); return shadowC = c; }

  function drawEmblemIcon(g, name, x, y, r, col) { g.save(); g.translate(x, y); g.scale(r, r); g.fillStyle = col; g.strokeStyle = col; EMBLEM[name](g); g.restore(); }

  const TILT = .74;
  function seeded(s) { return () => (s = (s * 16807) % 2147483647) / 2147483647; }

  // One unique struck icon per ability.
  const ln = (g, ...p) => { g.beginPath(); for (let i = 0; i < p.length; i += 2) g[i ? 'lineTo' : 'moveTo'](p[i], p[i + 1]); g.stroke(); };
  const arc = (g, x, y, r, a = 0, b = TAU) => { g.beginPath(); g.arc(x, y, r, a, b); g.stroke(); };
  const dot = (g, x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
  const ICON = {
    vesper: [
      g => { ln(g, -.8, .8, .1, -.1); poly(g, [[.9, -.9], [.48, -.68], [.22, -.42], [.42, -.22], [.68, -.48]]); ln(g, -.75, .25, -.3, -.2); ln(g, -.25, .75, .2, .3); },
      g => { for (const o of [-.5, .05]) ln(g, o - .2, -.68, o + .45, 0, o - .2, .68); arc(g, -.72, .55, .22); arc(g, -.5, .82, .13); },
      g => { g.beginPath(); g.moveTo(-.95, 0); g.quadraticCurveTo(0, -.85, .95, 0); g.quadraticCurveTo(0, .85, -.95, 0); g.stroke(); dot(g, 0, 0, .28); ln(g, 0, -.95, 0, -.6); ln(g, 0, .6, 0, .95); },
    ],
    kade: [
      g => { poly(g, [[.95, -.6], [.1, .28], [-.2, -.02], [.62, -.92]]); ln(g, -.3, -.3, .3, .3); ln(g, -.55, .05, -.05, .6); ln(g, -.85, .35, -.45, .78); },
      g => poly(g, [[0, -.95], [.78, -.65], [.72, .15], [0, .95], [-.72, .15], [-.78, -.65]]),
      g => { poly(g, [[-.2, -.95], [.2, -.95], [.2, -.2], [.48, -.2], [0, .3], [-.48, -.2], [-.2, -.2]]); g.beginPath(); g.ellipse(0, .55, .9, .3, 0, 0, Math.PI); g.stroke(); ln(g, -.9, .55, -.55, .4); ln(g, .9, .55, .55, .4); },
    ],
    ione: [
      g => { dot(g, 0, 0, .42); g.save(); g.scale(1, .42); arc(g, 0, 0, .9); g.restore(); dot(g, .72, -.3, .1); },
      g => { poly(g, [[0, -.95], [.62, 0], [.08, .02], [.24, .4], [0, .95], [-.62, 0], [-.08, -.02], [-.24, -.4]]); },
      g => { arc(g, -.62, .55, .3); arc(g, 0, 0, .3); arc(g, .62, -.55, .3); dot(g, -.62, .55, .1); dot(g, 0, 0, .1); dot(g, .62, -.55, .1); },
    ],
    solenne: [
      g => { poly(g, [[-.17, -.7], [.17, -.7], [.17, -.25], [.62, -.25], [.62, .1], [.17, .1], [.17, .55], [-.17, .55], [-.17, .1], [-.62, .1], [-.62, -.25], [-.17, -.25]]); ln(g, -.85, .88, .85, .88); },
      g => { g.beginPath(); g.arc(0, .55, .92, Math.PI, 0); g.stroke(); arc(g, 0, .55, .5, Math.PI, 0); ln(g, -1, .6, 1, .6); },
      g => { g.beginPath(); g.arc(0, .42, .5, Math.PI, 0); g.closePath(); g.fill(); for (let i = 0; i < 7; i++) { const a = Math.PI + (i + .0) / 6 * Math.PI; ln(g, Math.cos(a) * .68, .42 + Math.sin(a) * .68, Math.cos(a) * .98, .42 + Math.sin(a) * .98); } ln(g, -1, .68, 1, .68); },
    ],
    sable: [
      g => { g.lineWidth = .24; g.lineCap = 'round'; arc(g, -.65, .65, 1.25, -1.5, -.08); g.lineWidth = .1; arc(g, -.65, .65, .82, -1.4, -.18); },
      g => { dot(g, -.5, .05, .34); arc(g, .5, .05, .34); g.beginPath(); g.arc(0, -.15, .68, 3.5, 5.9); g.stroke(); poly(g, [[.5, -.86], [.82, -.48], [.38, -.42]]); },
      g => { ln(g, -.62, .95, .28, -.72); g.beginPath(); g.moveTo(.28, -.72); g.quadraticCurveTo(-.4, -1, -.98, -.38); g.quadraticCurveTo(-.45, -.62, .08, -.34); g.closePath(); g.fill(); },
    ],
    gravel: [
      g => { ln(g, 0, -.95, 0, .1); g.lineWidth = .22; g.lineCap = 'round'; g.beginPath(); g.arc(-.25, .15, .55, -.25, 2.85); g.stroke(); poly(g, [[-.75, .42], [-.9, -.2], [-.4, .02]]); },
      g => { arc(g, 0, 0, .24); g.save(); g.scale(1, .5); arc(g, 0, 0, .58); arc(g, 0, 0, .98); g.restore(); ln(g, 0, -.85, 0, -.5); },
      g => { poly(g, [[.15, -.72], [.74, -.42], [.86, .2], [.42, .72], [-.25, .66], [-.48, .1], [-.32, -.45]]); ln(g, -.95, -.34, -.58, -.34); ln(g, -1, .08, -.72, .08); ln(g, -.92, .5, -.62, .5); },
    ],
  };
  // moving light band that sweeps across a coin
  function sheen() {
    if (cache.has('sheen')) return cache.get('sheen');
    const frames = []; for (let f = 0; f < 12; f++) { const c = cv(96, 96), g = c.getContext('2d'); g.beginPath(); g.arc(48, 48, 44, 0, TAU); g.clip(); const o = -60 + f * 18, gr = g.createLinearGradient(o, o, o + 44, o + 44); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 96, 96); frames.push(c); }
    cache.set('sheen', frames); return frames;
  }
  function caustic() {
    if (cache.has('caustic')) return cache.get('caustic');
    const S = 128, c = cv(S, S), g = c.getContext('2d'), im = g.createImageData(S, S), W = TAU / S;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const v = Math.abs(Math.sin(x * W * 3 + Math.sin(y * W * 2) * 1.5) + Math.sin(y * W * 4 + Math.sin(x * W) * 1.7)), b = Math.pow(Math.max(0, 1 - v * 2), 2), i = (y * S + x) * 4;
      im.data[i] = 190; im.data[i + 1] = 245; im.data[i + 2] = 255; im.data[i + 3] = b * 255;
    }
    g.putImageData(im, 0, 0); cache.set('caustic', c); return c;
  }
  function vignette(w, h) {
    const id = `v${w}x${h}`; if (cache.has(id)) return cache.get(id);
    const c = cv(w / 2, h / 2), g = c.getContext('2d'), gr = g.createRadialGradient(w / 4, h / 4, h * .3, w / 4, h / 4, w * .34); gr.addColorStop(0, 'rgba(4,18,16,0)'); gr.addColorStop(1, 'rgba(4,18,16,.5)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h); cache.set(id, c); return c;
  }
  function shaft() {
    if (cache.has('shaft')) return cache.get('shaft');
    const c = cv(120, 400), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 400); gr.addColorStop(0, 'rgba(255,236,190,.55)'); gr.addColorStop(1, 'rgba(255,236,190,0)'); g.fillStyle = gr; g.fillRect(0, 0, 120, 400);
    g.globalCompositeOperation = 'destination-in'; const m = g.createLinearGradient(0, 0, 120, 0); m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(.5, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = m; g.fillRect(0, 0, 120, 400);
    cache.set('shaft', c); return c;
  }
  function brushSprite(b, seed) {
    const id = 'b' + seed + 'r' + b.r; if (cache.has(id)) return cache.get(id);
    const P = 14, h = 56, w = b.r * 2 + P * 2, ht = b.r * 2 * TILT + h + P, c = cv(w, ht), g = c.getContext('2d'), r = seeded(seed * 31 + 3), cx = w / 2, cy = h + b.r * TILT;
    const items = []; for (let i = 0; i < b.r * 1.8; i++) { const a = r() * TAU, d = Math.sqrt(r()) * b.r; items.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * TILT, 15 + r() * 15, r()]); }
    items.sort((p, q) => p[1] - q[1]);
    g.lineCap = 'round';
    for (const [x, y, l, v] of items) for (let k = -2; k <= 2; k++) { g.strokeStyle = v > .66 ? '#3f8a62' : v > .33 ? '#2e7152' : '#215a44'; g.lineWidth = 3.2; g.beginPath(); g.moveTo(x + k * 2.2, y); g.quadraticCurveTo(x + k * 3, y - l * .6, x + k * 6, y - l); g.stroke(); }
    const out = { c, ax: cx, ay: cy }; cache.set(id, out); return out;
  }

  // Reeded edge drawn under a coin face. Scaled per coin, tinted per metal.
  function reed(col = '#5a4426') {
    const id = 'reed' + col; if (cache.has(id)) return cache.get(id);
    const R0 = 56, ry = R0 * .84, T = R0 * .22, c = cv(R0 * 2 + 2, ry * 2 + T + 2), g = c.getContext('2d');
    g.translate(R0 + 1, ry + 1); g.fillStyle = col; g.beginPath(); g.ellipse(0, T, R0, ry, 0, 0, TAU); g.fill(); g.fillRect(-R0, 0, R0 * 2, T);
    for (let i = 0; i <= 60; i++) { const a = i / 60 * Math.PI, x = Math.cos(a) * R0, y = Math.sin(a) * ry, w = Math.max(.6, 2.4 * Math.sin(a)); g.fillStyle = i % 2 ? 'rgba(255,232,186,.42)' : 'rgba(10,6,2,.34)'; g.fillRect(x - w / 2, y + 1, w, T - 1.5); }
    const sh = g.createLinearGradient(0, 0, 0, ry + T); sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,.3)'); g.globalCompositeOperation = 'source-atop'; g.fillStyle = sh; g.fillRect(-R0, -ry, R0 * 2, ry * 2 + T);
    const out = { c, R0, ry, T }; cache.set(id, out); return out;
  }
  // Soft puff that fades to its own colour, so normal-blend smoke and fog have no dark fringe.
  function puff(r, g0, b, a = 1) {
    const id = `pf${r},${g0},${b},${a}`; if (cache.has(id)) return cache.get(id);
    const c = cv(64, 64), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${r},${g0},${b},${a})`); gr.addColorStop(.45, `rgba(${r},${g0},${b},${a * .55})`); gr.addColorStop(1, `rgba(${r},${g0},${b},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); cache.set(id, c); return c;
  }
  function cloud(v = 0) {
    const id = 'cl' + v; if (cache.has(id)) return cache.get(id);
    const c = cv(256, 128), g = c.getContext('2d'), r = seeded(v * 97 + 11);
    for (let i = 0; i < 9; i++) { const x = 50 + r() * 156, y = 36 + r() * 56, R = 26 + r() * 30, gr = g.createRadialGradient(x, y, 0, x, y, R); gr.addColorStop(0, 'rgba(8,26,34,.55)'); gr.addColorStop(1, 'rgba(8,26,34,0)'); g.fillStyle = gr; g.fillRect(x - R, y - R, R * 2, R * 2); }
    cache.set(id, c); return c;
  }
  function leaf(col) {
    const id = 'lf' + col; if (cache.has(id)) return cache.get(id);
    const c = cv(16, 10), g = c.getContext('2d'); g.fillStyle = col; g.beginPath(); g.moveTo(1, 5); g.quadraticCurveTo(8, -3, 15, 5); g.quadraticCurveTo(8, 13, 1, 5); g.fill(); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(2, 5); g.lineTo(14, 5); g.stroke();
    cache.set(id, c); return c;
  }
  // Wedges cut from a real coin sprite, so a shattered champion breaks into its own face.
  function shardsOf(spr, n = 7) {
    if (spr.shards) return spr.shards;
    const out = [], R = spr.S / 2;
    for (let i = 0; i < n; i++) {
      const c = cv(spr.S, spr.S), g = c.getContext('2d'), a0 = i / n * TAU, a1 = (i + 1) / n * TAU, am = (a0 + a1) / 2;
      g.beginPath(); g.moveTo(R + Math.cos(am) * R * .08, R + Math.sin(am) * R * .08); g.lineTo(R + Math.cos(a0) * R * 1.04, R + Math.sin(a0) * R * 1.04); g.lineTo(R + Math.cos(am) * R * 1.12, R + Math.sin(am) * R * 1.12); g.lineTo(R + Math.cos(a1) * R * 1.04, R + Math.sin(a1) * R * 1.04); g.closePath(); g.clip(); g.drawImage(spr.c, 0, 0);
      out.push({ c, a: am });
    }
    return spr.shards = out;
  }

  function discSprite(team, R) {
    const id = `d${team}${R}`; if (cache.has(id)) return cache.get(id);
    const T = R * .24, c = cv(R * 2 + 4, R * 1.5 + T + 4), g = c.getContext('2d'), cx = R + 2, cy = R * .74 + 2, ry = R * .72;
    const dark = team >= 0 ? TEAM_DARK[team] : '#6e5a2c', mid = team >= 0 ? (team ? '#c7806a' : '#7da6c7') : '#d9b765';
    g.fillStyle = dark; g.beginPath(); g.ellipse(cx, cy + T, R, ry, 0, 0, TAU); g.fill(); g.fillRect(cx - R, cy, R * 2, T);
    for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI; g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(cx + Math.cos(a) * R * .985 - 1, cy + Math.sin(a) * ry + 1, 2, T - 1); }
    const f = g.createLinearGradient(cx - R, cy - ry, cx + R, cy + ry); f.addColorStop(0, '#f2e8cf'); f.addColorStop(.55, mid); f.addColorStop(1, dark);
    g.fillStyle = f; g.beginPath(); g.ellipse(cx, cy, R, ry, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 2; g.beginPath(); g.ellipse(cx, cy, R * .8, ry * .8, 0, 0, TAU); g.stroke();
    const out = { c, cx, cy, T }; cache.set(id, out); return out;
  }

  // ---------- ability buttons ----------
  const ABPAL = { vesper: ['#1d3fe6', '#5f7bff'], kade: ['#d81f1f', '#ff6b3d'], ione: ['#00909c', '#23d4c8'], solenne: ['#f28a00', '#ffc81f'], sable: ['#5a17c4', '#9a4dff'], gravel: ['#a83f08', '#f07a14'] };
  const VILPAL = { vesper: ['#5a1fc0', '#3a1188'], kade: ['#7a1f9e', '#4c1266'], ione: ['#3f8a1e', '#245c10'], solenne: ['#5f7a12', '#3c4e0a'], sable: ['#2c1a5e', '#180d3a'], gravel: ['#a8431a', '#6e2a0f'] };
  function abilityCoin(champ, slot, on, R0 = 40, team = 0) {
    const id = `ab${champ}${slot}${on}${R0}${team}`; if (cache.has(id)) return cache.get(id);
    const R = R0 * 2, P = Math.round(R * .075), S = R * 2 + P * 2, c = cv(S, S), g = c.getContext('2d'), [a, b] = on ? (team ? VILPAL[champ] : ABPAL[champ]) : ['#39405a', '#4b5372'], ult = slot === 2;
    g.translate(S / 2, S / 2); g.scale(R, R); gx = g;
    // rim: ultimates wear a spiked gold crown
    if (ult && on) { const e = []; for (let i = 0; i < 16; i++) { const an = i / 16 * TAU; e.push([an, .9]); e.push([an + TAU / 32, 1.04]); } cel(edgeT(e), team ? '#8dff2e' : '#ffd21a', { sh: .05, hi: .03, lw: .06 }); }
    else ov(0, 0, .97, .97, on ? '#ffffff' : '#7b84a0', { sh: .05, lw: .06 });
    ov(0, 0, .83, .83, a, { sh: 0, lw: .05 });
    g.save(); g.beginPath(); g.arc(0, 0, .81, 0, TAU); g.clip();
    if (slot === 1) { g.fillStyle = a; g.fillRect(-1.2, -1.2, 2.4, 2.4); g.fillStyle = b; for (let i = -6; i < 7; i++) { g.save(); g.rotate(-.7); g.fillRect(-1.6, i * .24, 3.2, .12); g.restore(); } }
    else rays(g, ult ? 18 : 11, a, b, 0, slot * .3);
    if (on) { g.save(); g.scale(.81, .81); benday(g, mix(a, INK, .5), .2, .14); g.restore(); }
    g.restore(); gx = g;
    const k = .56;
    const layer = sticker(S, R, l => { l.scale(k, k); l.fillStyle = l.strokeStyle = on ? '#ffffff' : '#a9b0c6'; l.lineWidth = .17; l.lineCap = 'round'; l.lineJoin = 'round'; ICON[champ][slot](l); }, [[on ? INK : '#1c2134', R * .055], [on ? INK : '#1c2134', 0, R * .03, R * .05]]);
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(layer, 0, 0);
    if (on) { g.translate(S / 2, S / 2); g.scale(R, R); g.beginPath(); g.moveTo(-.74, -.34); g.quadraticCurveTo(-.44, -.76, 0, -.8); g.lineTo(-.06, -.68); g.quadraticCurveTo(-.4, -.64, -.62, -.28); g.closePath(); g.fillStyle = 'rgba(255,255,255,.72)'; g.fill(); }
    cache.set(id, c); return c;
  }
  function iconURL(champ, slot, team = 0) { return abilityCoin(champ, slot, true, 40, team).toDataURL(); }

  // ---------- comic effect sprites, all prerendered once ----------
  const FONT = '"Bangers",Impact,sans-serif';
  let fontAsked = false;
  function fontReady() {
    if (!document.fonts || !document.fonts.check) return true;
    if (!fontAsked) { fontAsked = true; try { document.fonts.load('60px Bangers'); } catch (e) { } }
    try { return document.fonts.check('60px Bangers'); } catch (e) { return true; }
  }
  const WORDPAL = {
    hero: { top: '#fff36b', bot: '#ff9a1f', edge: '#ffffff', burst: '#2348ff', burst2: '#ffe14a', dots: '#10207a' },
    zap: { top: '#ffffff', bot: '#4fd2ff', edge: '#ffe14a', burst: '#ffc21a', burst2: '#ffffff', dots: '#d27800' },
    vill: { top: '#e2ff6a', bot: '#3fc81c', edge: '#ffffff', burst: '#5c1eb0', burst2: '#a6ff2a', dots: '#260a60' },
    hex: { top: '#ffc6ff', bot: '#bd3cff', edge: '#d8ff5a', burst: '#2ea812', burst2: '#d8ff5a', dots: '#125208' },
    neut: { top: '#ffe08a', bot: '#ff5a14', edge: '#ffffff', burst: '#3a1204', burst2: '#ff9a1f', dots: '#7a2a08' },
    pain: { top: '#ffffff', bot: '#ff4a2c', edge: '#14081e', burst: '#ffe14a', burst2: '#ffffff', dots: '#e0701a' },
  };
  function spikes(g, cx, cy, rx, ry, n, depth, r) {
    g.beginPath(); for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * TAU, k = i % 2 ? depth * (.8 + r() * .35) : 1 + r() * .22; g[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k); } g.closePath();
  }
  // Each letter is cut individually: its own tilt, size and bounce, then a block shadow, ink, keyline and a two-tone fill.
  function word(text, style = 'hero', seed = 1, withBurst = true) {
    const ready = fontReady(), id = `wd${text}|${style}|${seed}|${withBurst}|${ready}`; if (cache.has(id)) return cache.get(id);
    const pal = WORDPAL[style] || WORDPAL.hero, r = seeded(seed * 131 + text.length * 17 + 7), fs = 84, m = cv(4, 4).getContext('2d'); m.font = `${fs}px ${FONT}`;
    const L = [...text].map((ch, i) => { const big = i === 0 ? 1.2 : 1 + (r() - .5) * .2; return { ch, big, rot: (r() - .5) * .3, dy: (r() - .5) * fs * .2, w: m.measureText(ch).width * big }; });
    const tw = L.reduce((a, l) => a + l.w * .94, 0), W = Math.ceil(tw + fs * (withBurst ? 1.5 : .7)), H = Math.ceil(fs * (withBurst ? 2.25 : 1.6)), c = cv(W, H), g = c.getContext('2d');
    if (withBurst) {
      g.save(); spikes(g, W / 2, H / 2, W * .47, H * .46, 11 + (r() * 4 | 0), .68, r); g.fillStyle = INK; g.fill(); g.restore();
      spikes(g, W / 2, H / 2, W * .445, H * .42, 11, .7, seeded(seed + 3)); g.fillStyle = pal.burst; g.fill();
      g.save(); g.clip(); g.fillStyle = pal.dots; const cell = 13; for (let y = 0, row = 0; y < H; y += cell * .86, row++) for (let x = row % 2 ? cell / 2 : 0; x < W; x += cell) { const d = Math.hypot((x - W / 2) / (W * .45), (y - H / 2) / (H * .42)); if (d > .5) { g.beginPath(); g.arc(x, y, Math.min(5, (d - .5) * 9), 0, TAU); g.fill(); } } g.restore();
      spikes(g, W / 2, H / 2, W * .36, H * .3, 9, .76, seeded(seed + 8)); g.fillStyle = pal.burst2; g.globalAlpha = .9; g.fill(); g.globalAlpha = 1;
    }
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const place = (fn) => { let x = (W - tw) / 2; for (const l of L) { g.save(); g.translate(x + l.w * .47, H / 2 + l.dy + fs * .04); g.rotate(l.rot); g.font = `${Math.round(fs * l.big)}px ${FONT}`; fn(l); g.restore(); x += l.w * .94; } };
    place(l => { g.fillStyle = g.strokeStyle = INK; g.lineWidth = 20; g.strokeText(l.ch, 7, 8); g.fillText(l.ch, 7, 8); });
    place(l => { g.strokeStyle = pal.edge; g.lineWidth = 15; g.strokeText(l.ch, 0, 0); });
    place(l => { g.strokeStyle = INK; g.lineWidth = 7.5; g.strokeText(l.ch, 0, 0); });
    place(l => { g.fillStyle = pal.top; g.fillText(l.ch, 0, 0); const h = fs * l.big; g.save(); g.beginPath(); g.rect(-l.w, h * .04, l.w * 2, h); g.clip(); g.fillStyle = pal.bot; g.fillText(l.ch, 0, 0); g.restore(); });
    const out = { c, w: W, h: H }; cache.set(id, out); return out;
  }
  // jagged two-colour starburst for the instant of impact
  function impact(col, col2, seed = 1) {
    const id = `imp${col}${col2}${seed}`; if (cache.has(id)) return cache.get(id);
    const S = 256, c = cv(S, S), g = c.getContext('2d'), r = seeded(seed * 53 + 19);
    spikes(g, 128, 128, 120, 120, 12, .55, r); g.fillStyle = INK; g.fill();
    const r2 = seeded(seed * 53 + 19); spikes(g, 128, 128, 108, 108, 12, .55, r2); g.fillStyle = col; g.fill();
    const r3 = seeded(seed * 29 + 3); spikes(g, 128, 128, 72, 72, 10, .6, r3); g.fillStyle = col2; g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(128, 128, 24, 0, TAU); g.fill();
    cache.set(id, c); return c;
  }
  // radial speed lines with an open centre
  function speedLines(col, seed = 1) {
    const id = `sl${col}${seed}`; if (cache.has(id)) return cache.get(id);
    const S = 512, c = cv(S, S), g = c.getContext('2d'), r = seeded(seed * 41 + 23), n = 64;
    g.translate(S / 2, S / 2); g.fillStyle = col;
    for (let i = 0; i < n; i++) { if (r() < .22) continue; const a = i / n * TAU + r() * .05, w = .012 + r() * .03, in0 = 120 + r() * 96; g.beginPath(); g.moveTo(Math.cos(a) * in0, Math.sin(a) * in0); g.lineTo(Math.cos(a - w) * 256, Math.sin(a - w) * 256); g.lineTo(Math.cos(a + w) * 256, Math.sin(a + w) * 256); g.closePath(); g.fill(); }
    cache.set(id, c); return c;
  }
  // Ben-Day ring: dots peak mid-radius and vanish at both edges
  function halftone(col) {
    const id = 'ht' + col; if (cache.has(id)) return cache.get(id);
    const S = 256, c = cv(S, S), g = c.getContext('2d'), cell = 15; g.fillStyle = col;
    for (let y = 0, row = 0; y < S; y += cell * .86, row++) for (let x = row % 2 ? cell / 2 : 0; x < S; x += cell) { const d = Math.hypot(x - 128, y - 128) / 128; if (d > .98) continue; const k = Math.max(0, 1 - Math.abs(d - .62) * 2.6), rad = cell * .48 * k; if (rad > .5) { g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill(); } }
    cache.set(id, c); return c;
  }
  // inked streak, oriented along its travel by the caller
  function sparkSp(col) {
    const id = 'sp' + col; if (cache.has(id)) return cache.get(id);
    const c = cv(48, 16), g = c.getContext('2d'), d = (x, w, f) => { g.fillStyle = f; g.beginPath(); g.moveTo(1, 8); g.lineTo(x, 8 - w); g.lineTo(47, 8); g.lineTo(x, 8 + w); g.closePath(); g.fill(); };
    d(30, 7, INK); d(31, 4.6, col); g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(14, 8); g.lineTo(33, 6.2); g.lineTo(44, 8); g.lineTo(33, 9.8); g.closePath(); g.fill();
    cache.set(id, c); return c;
  }
  function dustCel(dark, v = 0) {
    const id = `dc${dark ? 1 : 0}${v % 3}`; if (cache.has(id)) return cache.get(id);
    const S = 96, c = cv(S, S), g = c.getContext('2d'), r = seeded(v * 37 + (dark ? 91 : 13)), lobes = [];
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + r() * .5; lobes.push([48 + Math.cos(a) * 22, 48 + Math.sin(a) * 18, 15 + r() * 8]); } lobes.push([48, 48, 26]);
    const pass = (f, grow, ox, oy) => { g.fillStyle = f; for (const [x, y, q] of lobes) { g.beginPath(); g.arc(x + ox, y + oy, q + grow, 0, TAU); g.fill(); } };
    pass(INK, 3.5, 0, 0); pass(dark ? '#3d3350' : '#c9a772', 0, 0, 0); pass(dark ? '#5f5478' : '#f7e4b8', -3.5, -3, -4);
    cache.set(id, c); return c;
  }
  function chip(col, v = 0) {
    const id = `ch${col}${v % 3}`; if (cache.has(id)) return cache.get(id);
    const c = cv(24, 24), g = c.getContext('2d'), P_ = [[[2, 4], [22, 8], [8, 22]], [[4, 2], [21, 15], [3, 21]], [[12, 1], [23, 19], [1, 17]]][v % 3];
    g.beginPath(); P_.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.closePath(); g.fillStyle = col; g.fill(); g.strokeStyle = INK; g.lineWidth = 2.6; g.lineJoin = 'round'; g.stroke();
    g.fillStyle = 'rgba(255,255,255,.65)'; g.beginPath(); g.moveTo(P_[0][0] + 3, P_[0][1] + 2); g.lineTo(P_[1][0] - 7, P_[1][1] - 1); g.lineTo(P_[0][0] + 5, P_[0][1] + 7); g.closePath(); g.fill();
    cache.set(id, c); return c;
  }
  function glint(col) {
    const id = 'gl' + col; if (cache.has(id)) return cache.get(id);
    const c = cv(48, 48), g = c.getContext('2d'), t = (r, f) => { g.fillStyle = f; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU - Math.PI / 2, l = i % 2 ? r * .2 : r; g[i ? 'lineTo' : 'moveTo'](24 + Math.cos(a) * l, 24 + Math.sin(a) * l); } g.closePath(); g.fill(); };
    t(23, INK); t(19, col); t(10, '#ffffff'); cache.set(id, c); return c;
  }
  // level-up column, hard bands from core to edge
  function pillar(col, col2) {
    const id = 'pil' + col + col2; if (cache.has(id)) return cache.get(id);
    const c = cv(128, 512), g = c.getContext('2d'), band = (w, f) => { g.fillStyle = f; g.beginPath(); g.moveTo(64 - w, 512); g.lineTo(64 - w * .55, 0); g.lineTo(64 + w * .55, 0); g.lineTo(64 + w, 512); g.closePath(); g.fill(); };
    band(62, INK); band(56, col); band(34, col2); band(14, '#ffffff');
    g.globalCompositeOperation = 'destination-out'; const m = g.createLinearGradient(0, 0, 0, 512); m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(.5, 'rgba(0,0,0,.05)'); m.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = m; g.fillRect(0, 0, 128, 512);
    cache.set(id, c); return c;
  }
  // knocked-out copy of a coin: drained of colour, cracked, stamped with an X
  function koCoin(spr) {
    if (spr.ko) return spr.ko;
    const S = spr.S, c = cv(S, S), g = c.getContext('2d'), k = spr.R;
    g.drawImage(spr.c, 0, 0);
    g.globalCompositeOperation = 'saturation'; g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = 'destination-in'; g.drawImage(spr.c, 0, 0);
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(30,20,60,.3)'; g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = 'source-over'; g.translate(S / 2, S / 2); g.scale(k, k); gx = g;
    line([[-.5, -.9], [-.14, -.42], [-.36, -.1], [.06, .3], [-.1, .9]], INK, .05);
    for (const [col, w] of [[INK, .3], ['#ff3a14', .17]]) { line([[-.62, -.62], [.62, .62]], col, w); line([[.62, -.62], [-.62, .62]], col, w); }
    return spr.ko = { c, S, R: spr.R, P: spr.P };
  }

  return { TEAM, TEAM_DARK, METAL, TILT, TAU, INK, FONT, champCoin, minionCoin, monsterCoin, coin, glow, shadow, drawEmblemIcon, brushSprite, discSprite, civCoin, abilityCoin, iconURL, sheen, caustic, vignette, shaft, seeded, mix, cv, reed, puff, cloud, leaf, shardsOf, word, impact, speedLines, halftone, sparkSp, dustCel, chip, glint, pillar, koCoin, fontReady };
})();
