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

  function rim(g, R, tier) {
    const seg = (r, w, cols, n = 64) => { g.lineWidth = w; for (let i = 0; i < n; i++) { g.strokeStyle = cols(i / n); g.beginPath(); g.arc(0, 0, r, i / n * TAU - .01, (i + 1) / n * TAU + .01); g.stroke(); } };
    const shine = (a, b) => t => mix(a, b, Math.abs(Math.sin(t * Math.PI * 2 + .8)));
    const w = R * .15, r = R * .925;
    if (tier === 0) { seg(r, w * .72, shine('#7c4a2c', '#c58357')); }
    else if (tier === 1) { seg(r, w, shine('#6f4a1e', '#cf9c52')); for (let i = 0; i < 16; i++) { g.save(); g.rotate(i / 16 * TAU); g.fillStyle = '#4a2f12'; g.fillRect(-R * .02, -R, R * .04, w * .9); g.restore(); } }
    else if (tier === 2) { seg(r, w, shine('#7a8590', '#f0f4f7')); for (let i = 0; i < 60; i++) { g.save(); g.rotate(i / 60 * TAU); g.fillStyle = 'rgba(40,52,64,.55)'; g.fillRect(-R * .007, -R, R * .014, w * .85); g.restore(); } }
    else if (tier === 3) { seg(r, w * 1.05, shine('#a06f12', '#ffe48a')); for (let i = 0; i < 24; i++) { g.save(); g.rotate(i / 24 * TAU); g.fillStyle = '#fff3c0'; g.beginPath(); g.arc(0, -r, R * .036, 0, TAU); g.fill(); g.fillStyle = '#8a5d0c'; g.beginPath(); g.arc(R * .008, -r + R * .012, R * .016, 0, TAU); g.fill(); g.restore(); } }
    else if (tier === 4) { seg(r, w * 1.1, shine('#6f8b99', '#f5fdff')); seg(r - w * .4, R * .015, () => '#30454f'); for (let i = 0; i < 8; i++) { g.save(); g.rotate(i / 8 * TAU); g.fillStyle = '#b6f0ff'; g.beginPath(); g.moveTo(0, -R * 1.0); g.lineTo(R * .07, -r); g.lineTo(0, -R * .84); g.lineTo(-R * .07, -r); g.closePath(); g.fill(); g.restore(); } }
    else { seg(r, w * 1.2, t => `hsl(${t * 360 + 200},90%,${64 + Math.sin(t * 25) * 10}%)`, 96); seg(r + w * .5, R * .012, () => 'rgba(255,255,255,.8)'); for (let i = 0; i < 12; i++) { g.save(); g.rotate(i / 12 * TAU); g.fillStyle = '#fff'; star2(g, 0, -r, R * .085); g.restore(); } }
  }
  function star2(g, x, y, r) { g.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, l = i % 2 ? r * .3 : r; g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * l, y + Math.sin(a) * l); } g.closePath(); g.fill(); }
  function hex(c) { const n = parseInt(c.slice(1), 16); return [n >> 16, n >> 8 & 255, n & 255]; }
  function mix(a, b, t) { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; }

  const cache = new Map();
  function coin(key, R, emblem, metal, team, tier = -1, emblemScale = .56) {
    const id = `${key}|${R}|${team}|${tier}`; if (cache.has(id)) return cache.get(id);
    const P = 3, S = R * 2 + P * 2, c = cv(S, S), g = c.getContext('2d');
    g.translate(S / 2, S / 2);
    // field
    const inner = tier >= 0 ? R * .84 : R * .9;
    if (tier >= 0) rim(g, R, tier);
    else { const e = g.createLinearGradient(-R, -R, R, R); e.addColorStop(0, metal[0]); e.addColorStop(1, metal[1]); g.fillStyle = e; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill(); }
    if (team !== null && team !== undefined && team >= 0) { g.strokeStyle = TEAM[team]; g.lineWidth = R * .085; g.beginPath(); g.arc(0, 0, inner - R * .01, 0, TAU); g.stroke(); }
    const f = g.createRadialGradient(-R * .3, -R * .35, R * .05, 0, 0, inner);
    f.addColorStop(0, metal[0]); f.addColorStop(1, metal[1]);
    g.fillStyle = f; g.beginPath(); g.arc(0, 0, inner - R * .05, 0, TAU); g.fill();
    // minted inner bevel
    g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = R * .03; g.beginPath(); g.arc(R * .01, R * .015, inner - R * .11, 0, TAU); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.28)'; g.beginPath(); g.arc(-R * .01, -R * .015, inner - R * .11, 0, TAU); g.stroke();
    // emblem struck into the metal
    const E = EMBLEM[emblem], sc = R * emblemScale;
    const pass = (dx, dy, col) => { g.save(); g.translate(dx, dy); g.scale(sc, sc); g.fillStyle = col; g.strokeStyle = col; E(g); g.restore(); };
    if (E) { pass(R * .028, R * .035, 'rgba(255,255,255,.5)'); pass(-R * .026, -R * .03, 'rgba(0,0,0,.45)'); pass(0, 0, mix(metal[1], '#14100a', .55)); }
    // sheen
    g.save(); g.beginPath(); g.arc(0, 0, inner - R * .06, 0, TAU); g.clip();
    const sh = g.createLinearGradient(-R, -R, R * .4, R * .4); sh.addColorStop(0, 'rgba(255,255,255,.3)'); sh.addColorStop(.46, 'rgba(255,255,255,.04)'); sh.addColorStop(.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,.14)');
    g.fillStyle = sh; g.fillRect(-R, -R, R * 2, R * 2); g.restore();
    const out = { c, R, P, S }; cache.set(id, out); return out;
  }
  const champCoin = (id, team, tier, R = 52) => coin(id, R, id, METAL[id], team, tier);
  const minionCoin = (team, ranged) => coin('m' + (ranged ? 'r' : 'm') + team, 30, ranged ? 'minionRanged' : 'minionMelee', METAL['minion' + team], -1, -1, .5);
  const monsterCoin = (big, boss) => boss ? coin('boss', 104, 'boss', METAL.boss, -1, 3, .6) : big ? coin('big', 60, 'big', METAL.big, -1, 1, .58) : coin('mon', 34, 'monster', METAL.monster, -1, -1, .52);

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

  // ---------- ground ----------
  const TILT = .74;
  function seeded(s) { return () => (s = (s * 16807) % 2147483647) / 2147483647; }

  function paintGround(map) {
    const W = map.W, H = Math.ceil(map.H * TILT), c = cv(W, H), g = c.getContext('2d'), r = seeded(4242);
    const Y = y => y * TILT;
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#1d4a3e'); bg.addColorStop(.5, '#27604c'); bg.addColorStop(1, '#1d4a3e');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // mottled grass
    for (let i = 0; i < 900; i++) { g.fillStyle = r() > .5 ? `rgba(90,150,104,${.03 + r() * .05})` : `rgba(6,30,28,${.04 + r() * .06})`; g.beginPath(); g.ellipse(r() * W, r() * H, 30 + r() * 150, (30 + r() * 150) * TILT, 0, 0, TAU); g.fill(); }
    g.lineCap = 'round';
    for (let i = 0; i < 5200; i++) { const x = r() * W, y = r() * H, l = 3 + r() * 7; g.strokeStyle = r() > .4 ? `rgba(140,190,120,${.12 + r() * .16})` : `rgba(10,40,34,${.2})`; g.lineWidth = 1 + r() * .8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - .5) * 4, y - l); g.stroke(); }

    // river running top to bottom through the centre
    const riverPts = [[1540, 0], [1680, 300], [1500, 620], [1600, 950], [1700, 1280], [1520, 1600], [1660, 1900]];
    const river = () => { g.beginPath(); g.moveTo(riverPts[0][0], Y(riverPts[0][1])); for (let i = 1; i < riverPts.length; i++) { const a = riverPts[i - 1], b = riverPts[i], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; g.quadraticCurveTo(a[0], Y(a[1]), mx, Y(my)); } g.lineTo(riverPts[6][0], Y(riverPts[6][1])); };
    g.lineJoin = 'round';
    for (const [w, col] of [[250, '#2a5a48'], [212, '#556e58'], [186, '#1f6a7c'], [130, '#2889a0'], [64, '#3ba5b8']]) { g.strokeStyle = col; g.lineWidth = w; river(); g.stroke(); }

    // lanes
    const lane = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, Y(y))); };
    for (const L of map.lanes) {
      for (const [w, col] of [[206, 'rgba(70,86,66,.5)'], [176, '#83795c'], [150, '#9b8f6e']]) { g.strokeStyle = col; g.lineWidth = w; lane(L); g.stroke(); }
      // cobbles
      for (let i = 1; i < L.length; i++) { const [ax, ay] = L[i - 1], [bx, by] = L[i], d = Math.hypot(bx - ax, by - ay); for (let k = 0; k < d / 5; k++) { const t = r(), a = r() * TAU, rr = r() * 74; g.fillStyle = r() > .5 ? 'rgba(60,52,38,.12)' : 'rgba(225,212,170,.1)'; g.beginPath(); g.ellipse(ax + (bx - ax) * t + Math.cos(a) * rr, Y(ay + (by - ay) * t + Math.sin(a) * rr), 5 + r() * 9, (5 + r() * 9) * TILT, 0, 0, TAU); g.fill(); } }
    }
    // bridge rails where lanes cross the river
    for (const y of [240, 1660]) { g.strokeStyle = 'rgba(40,34,26,.5)'; g.lineWidth = 5; for (const o of [-84, 84]) { g.beginPath(); g.moveTo(1490, Y(y + o)); g.lineTo(1710, Y(y + o)); g.stroke(); } g.strokeStyle = 'rgba(240,226,180,.3)'; g.lineWidth = 2; for (const o of [-87, 81]) { g.beginPath(); g.moveTo(1490, Y(y + o)); g.lineTo(1710, Y(y + o)); g.stroke(); } }

    // struck coin medallions: bases and centre
    const medallion = (x, y, R, tint) => {
      g.save(); g.translate(x, Y(y)); g.scale(1, TILT);
      g.fillStyle = '#6e6650'; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
      g.fillStyle = '#8b8064'; g.beginPath(); g.arc(0, 0, R * .94, 0, TAU); g.fill();
      for (let i = 0; i < 96; i++) { g.save(); g.rotate(i / 96 * TAU); g.fillStyle = 'rgba(40,34,24,.34)'; g.fillRect(-1.6, -R, 3.2, R * .05); g.restore(); }
      g.strokeStyle = 'rgba(40,34,24,.42)'; g.lineWidth = 5; for (const k of [.84, .6]) { g.beginPath(); g.arc(0, 0, R * k, 0, TAU); g.stroke(); }
      g.strokeStyle = tint; g.lineWidth = 7; g.beginPath(); g.arc(0, 0, R * .72, 0, TAU); g.stroke();
      for (let i = 0; i < 12; i++) { g.save(); g.rotate(i / 12 * TAU); g.fillStyle = tint; g.fillRect(-3, -R * .71, 6, R * .11); g.restore(); }
      g.restore();
    };
    medallion(210, 950, 380, 'rgba(88,166,230,.55)'); medallion(W - 210, 950, 380, 'rgba(228,87,63,.55)');
    medallion(1600, 950, 260, 'rgba(255,214,120,.5)');
    // fountain pools
    for (const [x, col] of [[95, '#58a6e6'], [W - 95, '#e4573f']]) { const gl = g.createRadialGradient(x, Y(950), 10, x, Y(950), 190); gl.addColorStop(0, col); gl.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = .55; g.fillStyle = gl; g.beginPath(); g.ellipse(x, Y(950), 190, 190 * TILT, 0, 0, TAU); g.fill(); g.globalAlpha = 1; }
    // brush bed
    for (const b of map.brush) { g.fillStyle = 'rgba(8,34,28,.55)'; g.beginPath(); g.ellipse(b.x, Y(b.y), b.r * 1.08, b.r * 1.08 * TILT, 0, 0, TAU); g.fill(); }
    // wall contact shadows
    for (const w of map.walls) { const sh = g.createLinearGradient(0, Y(w.y + w.h), 0, Y(w.y + w.h) + 34); sh.addColorStop(0, 'rgba(4,16,14,.55)'); sh.addColorStop(1, 'rgba(4,16,14,0)'); g.fillStyle = sh; g.fillRect(w.x - 8, Y(w.y + w.h), w.w + 16, 34); }
    return { c, W, H };
  }

  function wallSprite(w) {
    const id = `w${w.w}x${w.h}`; if (cache.has(id)) return cache.get(id);
    const lift = 58, tw = w.w, th = w.h * TILT, c = cv(tw + 8, th + lift + 8), g = c.getContext('2d'), r = seeded(w.w * 13 + w.h * 7 + 1);
    const rr = (x, y, ww, hh, rad) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, ww, hh, rad) : g.rect(x, y, ww, hh); };
    const f = g.createLinearGradient(0, th, 0, th + lift); f.addColorStop(0, '#45544b'); f.addColorStop(1, '#232f2b');
    g.fillStyle = f; rr(4, 14, tw, th + lift - 12, 12); g.fill();
    // masonry courses
    g.strokeStyle = 'rgba(8,16,14,.35)'; g.lineWidth = 1.5; for (let y = th + 22; y < th + lift; y += 16) { g.beginPath(); g.moveTo(8, y); g.lineTo(tw, y); g.stroke(); }
    const t = g.createLinearGradient(0, 0, 0, th); t.addColorStop(0, '#7d8e7c'); t.addColorStop(1, '#5e7063');
    g.fillStyle = t; rr(4, 4, tw, th, 12); g.fill();
    g.strokeStyle = 'rgba(214,226,200,.4)'; g.lineWidth = 2; rr(5, 5, tw - 2, th - 2, 11); g.stroke();
    const n = (tw * th) / 240; for (let i = 0; i < n; i++) { g.fillStyle = r() > .55 ? `rgba(60,110,70,${.2 + r() * .35})` : 'rgba(30,40,34,.2)'; g.beginPath(); g.ellipse(10 + r() * (tw - 12), 9 + r() * (th - 10), 3 + r() * 11, 2 + r() * 6, 0, 0, TAU); g.fill(); }
    const out = { c, lift }; cache.set(id, out); return out;
  }

  function treeSprite(v) {
    const id = 't' + v; if (cache.has(id)) return cache.get(id);
    const R = 46 + v * 12, c = cv(R * 2 + 8, R * 2.7 + 8), g = c.getContext('2d'), cx = c.width / 2;
    const cols = [['#17382f', '#0e2822'], ['#225243', '#143a30'], ['#2f6f58', '#1c4a3b']];
    const base = c.height - R * .75 - 4;
    g.fillStyle = '#3a2c20'; g.fillRect(cx - 5, base - 14, 10, 24);
    [[1, 0], [.76, .62], [.5, 1.16]].forEach(([k, up], i) => {
      const y = base - R * up - 8, rx = R * k, ry = rx * .72;
      g.fillStyle = cols[i][1]; g.beginPath(); g.ellipse(cx, y + 9, rx, ry, 0, 0, TAU); g.fill();
      const f = g.createRadialGradient(cx - rx * .3, y - ry * .4, 2, cx, y, rx); f.addColorStop(0, cols[i][0] === '#17382f' ? '#2a5c4a' : '#4c977a'); f.addColorStop(1, cols[i][0]);
      g.fillStyle = f; g.beginPath(); g.ellipse(cx, y, rx, ry, 0, 0, TAU); g.fill();
    });
    const out = { c, ax: cx, ay: base + R * .5 }; cache.set(id, out); return out;
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

  return { TEAM, TEAM_DARK, METAL, TILT, TAU, champCoin, minionCoin, monsterCoin, coin, glow, shadow, drawEmblemIcon, paintGround, wallSprite, treeSprite, brushSprite, discSprite, mix, cv };
})();
