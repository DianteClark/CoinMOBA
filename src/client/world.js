// The world renderer: ground, water, weather, fog of war, scenery, units, ambient life, intro and outro.
// Private helpers stay inside the closure so nothing collides with the other client files.
let shX = 0, shY = 0;
const sx = x => (x - G.cam.x) * Z + VW / 2 + shX;
const sy = y => (y - G.cam.y) * TILT * Z + VH / 2 + shY;
const onScreen = (x, y, m = 90) => { const X = sx(x), Y = sy(y); return X > -m && X < VW + m && Y > -m - 40 && Y < VH + m + 60; };
// A guest rebuilds state from snapshots, so these read defensively. posNow returns one shared object: use its values at once, never keep it.
const WP = { x: 0, y: 0 };
function posNow(u, a) { const px = u.px === undefined ? u.x : u.px, py = u.py === undefined ? u.y : u.py; WP.x = px + (u.x - px) * a; WP.y = py + (u.y - py) * a; return WP; }
const isUp = u => u.alive !== false;
const seesU = c => { try { return Sim.canSee(G.s, G.me.team, c); } catch (e) { return true; } };
const towerOpenU = t => { try { return Sim.towerOpen(G.s, t); } catch (e) { return true; } };
// Read by relation, never by side: you are gold, friends are blue, enemies are red.
const REL_COL = { me: '#ffe08a', ally: '#58b0ff', enemy: '#ff3f3a', allyName: '#a9d0f2', enemyName: '#ff9c92' };
const EMPTY_LIST = [];
// A seat's cosmetics travel in cfg; the sim may also put them on the unit. Yours can fall back to your saved choices.
function cosOf(u, key) {
  if (u[key]) return u[key];
  const seats = G.cfg && G.cfg.teams && G.cfg.teams[u.team], seat = seats && seats[u.slot];
  if (seat && seat[key]) return seat[key];
  if (u === G.me && save.equip && save.equip[key]) return save.equip[key];
  return null;
}
// The camera sits this far out: about 1350 world units across the screen width.
const CAM_SPAN = 1350;
// How large a unit is painted: its hit radius with a little extra for the rim, and never smaller than can be read.
const artR = u => u.kind === 'champ' ? Math.max(24, (u.r || 26) * 1.04) : u.kind === 'minion' ? (u.r || 15) * 1.02 : u.boss ? (u.r || 58) * 1.08 : (u.r || 22) * 1.06;
// Vision circles for this frame, and a quick test for whether a world point is lit. Used to hide enemy effects in the dark.
let VIS_SRC = EMPTY_LIST;
function litAt(x, y, m = 0) { for (let i = 0; i < VIS_SRC.length; i++) { const v = VIS_SRC[i], dx = v.x - x, dy = v.y - y, R = v.r + m; if (dx * dx + dy * dy < R * R) return true; } return false; }

const { initWorld, render, introTick, outroStart, outroTick, drawCoin, visOf, worldSprite } = (() => {
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const AURA = { 3: '#ffe28a', 4: '#c5f4ff', 5: '#d9b8ff' };
  const INTRO_LEN = 2.6, FALL = .6;
  const INK = Terrain.INK;
  const TOWER_ART = { n: 7, R: 38, crown: 92 }, CORE_ART = { n: 6, R: 54, crown: 120 };
  const STEP = .3;
  const artOf = t => t.sub === 'core' ? CORE_ART : TOWER_ART;

  function visOf(u) {
    let v = G.vis.get(u.id);
    if (!v) { v = { flash: 0, spin: 0, hop: Math.random() * TAU, rx: 0, ry: 0, lean: 0, squash: 0, sheen: -rnd(1, 6), ghostT: 0, br: -1, hpLag: 1, lx: undefined, ly: undefined, stack: -1, phase: Math.floor(Math.random() * 1e3) }; G.vis.set(u.id, v); }
    return v;
  }

  // ---------- setup ----------
  function initWorld(g) {
    const s = g.s, map = s.map, GS = quality >= 2 ? 1.2 : 1;
    ZB = VW / CAM_SPAN; Z = ZB;
    g.ground = Terrain.paint(map, s.towers, GS, s.sites || [], g.me.team === 1 ? 1 : 0);
    g.vis = new Map();
    g.text = []; g.punch = 0; g.punchS = 0; g.lead = { x: 0, y: 0 }; g.goldBump = 0; g.goldAnchor = g.goldAnchor || null;
    g.hopeS = s.hope === undefined ? 50 : s.hope;
    // The side you were dealt sets the mood: heroes under a cool pre-dawn, villains under a blood-red dusk.
    g.villain = g.me.team === 1;
    g.rain = g.villain ? .5 : 0; g.rainT = 0; g.rainNext = 95 + Math.random() * 40; g.bolt = 0; g.boltPts = null; g.thunderIn = 0; g.drops = []; g.ripples = [];
    g.motes = Array.from({ length: 8 }, () => ({ x: Math.random() * Sim.W, y: Math.random() * Sim.H, p: Math.random() * 6 }));
    g.decor = buildDecor(g);
    g.brushes = map.brush.map((b, i) => ({ b, i, on: 0 }));
    g.walls = map.walls.filter(w => !w.big).map(w => ({ w, spr: Terrain.cliff(w) }));
    g.houses = g.decor.filter(d => d.kind === 2);
    // Light that never changes is painted into the ground once.
    const lampCol = g.villain ? '#ff4a58' : '#ffcf8a', pools = [];
    for (const d of g.decor) if (d.light) pools.push({ x: d.x, y: d.y, r: d.light.r, col: d.light.col, a: d.light.a });
    for (const t of s.towers) pools.push({ x: t.x, y: t.y, r: t.sub === 'core' ? 360 : 260, col: t.team ? '#c8243a' : '#e6c98e', a: .26 });
    if (map.center) pools.push({ x: map.center.x, y: map.center.y, r: 460, col: lampCol, a: .14 });
    for (const f of map.fountains || []) pools.push({ x: f.x, y: f.y, r: 420, col: f.x > Sim.W / 2 ? '#ff4a5c' : '#ffdf9e', a: .24 });
    Terrain.bake(g.ground, pools);
    buildWater(g); buildLife(g);
    preBake(g);
    resetFog();
    g.introIdx = new Map(s.champs.map((c, i) => [c.id, i])); g.introLanded = new Set();
    g.tAim = null;
    FX.reset();
  }

  // Everything that will be seen right away is cut now, under the versus splash. The turntable's in-between frames follow, a few per frame.
  function preBake(g) {
    const s = g.s;
    worldSprite(g.me); for (const c of s.champs) worldSprite(c);
    for (const t of [0, 1]) for (const ranged of [false, true]) worldSprite({ kind: 'minion', team: t, ranged, r: ranged ? 14 : 17 });
    for (const m of [[false, false], [true, false], [false, true]]) worldSprite({ kind: 'monster', team: 2, big: m[0], boss: m[1], r: m[1] ? 58 : m[0] ? 32 : 19 });
    for (const t of s.towers) { const a = artOf(t); Terrain.towerCoin(t.team, a.R); Terrain.towerCrown(t.team, t.sub === 'core'); }
  }
  function buildDecor(g) {
    const s = g.s, map = s.map, r = Art.seeded(4177), out = [], W = map.W, H = map.H, centre = map.center || { x: W / 2, y: H / 2 }, gd = g.ground, plazas = map.plazas || [];
    const inRiver = (x, y, m) => Math.abs(x - gd.riverX(y)) < m;
    const tree = (x, y) => { if (inRiver(x, y, Terrain.HALF + 80)) return; const spr = Terrain.tree(Math.floor(r() * 4)); out.push({ x, y, spr, kind: 0, fade: true, half: spr.w * .4, tall: spr.h * .9, al: 1 }); };
    // Forests stand on the impassable corners; a thin line of trees marks the far edges.
    for (const w of map.walls) if (w.big) { const n = Math.ceil(w.w * w.h / 19000); for (let i = 0; i < n; i++) tree(w.x + 18 + r() * Math.max(1, w.w - 36), w.y + 20 + r() * Math.max(1, w.h - 30)); }
    for (let x = 300; x < W - 300; x += 170 + r() * 120) tree(x, H - 14 - r() * 26);
    for (let y = 300; y < H - 300; y += 170 + r() * 120) { tree(14 + r() * 16, y); tree(W - 14 - r() * 16, y); }
    // The skyline: deco towers along the north edge, behind everything you can walk on.
    for (let x = 260; x < W - 200; x += 150 + r() * 130) {
      if (inRiver(x, 90, Terrain.HALF + 70)) continue;
      const spr = Terrain.house(Math.floor(r() * 8) * 2 + 1 + (r() > .5 ? 2 : 0), x > W / 2 ? 1 : 0), y = 58 + r() * 40;
      out.push({ x, y, spr, kind: 2, half: 60, tall: spr.h * .9, al: 1, ph: r() * 6, smk: r() * 2, sky: 1 });
    }
    // Street lights on the road shoulders.
    const lan = Terrain.lantern(g.villain), lanCol = g.villain ? '#ff4a58' : '#ffcf8a';
    const isClear = (x, y, m) => !map.walls.some(w => x > w.x - m && x < w.x + w.w + m && y > w.y - m && y < w.y + w.h + m);
    for (const lane of map.lanes) {
      const pts = Terrain.spline(lane, 16); let run = 120, side = 1;
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i], d = Math.hypot(bx - ax, (by - ay) * TILT); run += d; if (run < 540) continue; run = 0; side = -side;
        const dx = bx - ax, dy = (by - ay) * TILT, l = Math.hypot(dx, dy) || 1, nx = -dy / l * side, ny = dx / l * side, x = bx + nx * 150, y = by + ny * 150 / TILT;
        if (inRiver(x, y, Terrain.HALF + 60) || s.towers.some(t => Math.hypot(t.x - x, t.y - y) < 150) || !isClear(x, y, 34)) continue;
        out.push({ x, y, spr: lan, kind: 0, fade: true, half: 16, tall: lan.h * .95, al: 1, light: { r: 210, col: lanCol, a: .42 }, ph: r() * 6 });
      }
    }
    // Town buildings stand clear of the roads, river, plazas and open squares.
    const roadPts = map.lanes.flatMap(l => Terrain.spline(l, 8)), sites = s.sites || [], placed = [];
    const clear = (x, y) => {
      if (x < 70 || x > W - 70 || y < 150 || y > H - 150) return false;
      if (inRiver(x, y, Terrain.HALF + 110) || plazas.some(p => Math.hypot(x - p.x, y - p.y) < p.r + 60)) return false;
      if (roadPts.some(([rx, ry]) => Math.hypot(x - rx, (y - ry) * TILT) < 190) || !isClear(x, y, 70)) return false;
      if (s.towers.some(t => Math.hypot(t.x - x, t.y - y) < 190) || map.brush.some(b => Math.hypot(b.x - x, b.y - y) < b.r + 110)) return false;
      if ((s.camps || []).some(c => Math.hypot(c.x - x, c.y - y) < 200) || sites.some(c => Math.hypot(c.x - x, c.y - y) < 235)) return false;
      return !placed.some(p => Math.hypot(p.x - x, (p.y - y) * TILT) < 300);
    };
    const house = (x, y) => {
      if (!clear(x, y)) return false;
      const spr = Terrain.house(Math.floor(r() * 4) * 2, x > W / 2 ? 1 : 0); placed.push({ x, y });
      out.push({ x, y, spr, kind: 2, fade: true, half: 54, tall: spr.h * .9, al: 1, ph: r() * 6, smk: r() * 2 });
      return true;
    };
    for (const site of sites) { let n = 0; const a0 = r() * TAU; for (let i = 0; i < 16 && n < 2; i++) { const a = a0 + i * TAU / 16, d = 250 + r() * 70; if (house(site.x + Math.cos(a) * d, site.y + Math.sin(a) * d)) n++; } }
    // Headquarters stand on the impassable ground at both ends of each base, so one is in view from the spawn.
    for (const f of map.fountains || []) {
      const team = f.x > W / 2 ? 1 : 0, spr = Terrain.hq(team), x = team ? W - 105 : 105;
      for (const y of [f.y - 620, f.y + 620]) out.push({ x, y, spr, kind: 3, fade: true, half: 120, tall: spr.h * .8, al: 1, ph: r() * 6, light: { r: 320, col: team ? '#ff4a5c' : '#ffdf9e', a: .3 } });
    }
    const pil = Terrain.pillar(), cp = plazas.find(p => p.kind === 'centre'), R = cp ? cp.r - 26 : 340;
    for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + TAU / 16; out.push({ x: centre.x + Math.cos(a) * R, y: centre.y + Math.sin(a) * R, spr: pil, kind: 0, fade: true, half: 22, tall: pil.h * .95, al: 1, light: { r: 180, col: lanCol, a: .32 }, ph: r() * 6 }); }
    for (const p of plazas) if (p.kind === 'base') for (const a of [-1.05, -.4, .4, 1.05]) { const dir = p.team ? -1 : 1; out.push({ x: p.x + Math.cos(a) * (p.r - 34) * dir, y: p.y + Math.sin(a) * (p.r - 34), spr: Terrain.banner(p.team), kind: 1, fade: true, half: 26, tall: 120, al: 1, ph: r() * 6, flag: 1 }); }
    return out;
  }

  function buildWater(g) {
    const F = g.ground.flow, H0 = Terrain.HALF;
    g.waves = Array.from({ length: quality >= 2 ? 16 : quality === 1 ? 10 : 6 }, (_, i) => ({ s: Math.random() * (F.length - 1), o: rnd(-.8, .8) * H0, v: rnd(1.5, 2.6), spr: Terrain.wave(i % 3), ph: Math.random() * 6 }));
    g.flowX = [Math.min(...F.map(p => p.x)) - H0, Math.max(...F.map(p => p.x)) + H0];
  }
  function buildLife(g) { g.smoke = []; }

  // ---------- drawing a coin ----------
  const ONE = {};
  function drawCoin(spr, X, Y, z, R, opt = ONE) {
    const Rp = R * Z, alpha = opt.alpha === undefined ? 1 : opt.alpha, spin = opt.spin === undefined ? 1 : Math.max(.09, Math.abs(opt.spin)), sq = opt.squash || 0, lean = opt.lean || 0;
    if (!opt.noshadow) { ctx.globalAlpha = alpha * (opt.shadow === undefined ? 1 : opt.shadow); ctx.drawImage(Art.shadow(), X - Rp * 1.12, Y - Rp * .5 + 2, Rp * 2.24, Rp * 1.06); }
    ctx.globalAlpha = alpha;
    if (spr.T) {
      // A real turning coin: the frame is picked by angle, so thickness and the moving highlight are simply in the picture.
      const yaw = opt.yaw || 0, k = Rp / spr.R, w = spr.S * k, sqx = 1 + sq * .1, sqy = 1 - sq * .12, cyT = -z * Z - sq * Rp * .02, img = spr.T.ready ? Art.frameAt(spr.T, yaw) : null;
      ctx.setTransform(dpr * sqx, 0, -lean * dpr, dpr * sqy, dpr * X, dpr * Y);
      if (img) ctx.drawImage(img, -w / 2, cyT - w / 2, w, w);
      else { ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(0, cyT + Rp * .08, Rp + 1, Rp * .9, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#6d7a8c'; ctx.beginPath(); ctx.ellipse(0, cyT, Rp * .93, Rp * .8, 0, 0, TAU); ctx.fill(); }
      if (opt.flash > 0) { const wide = Math.abs(Math.cos(yaw)); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = opt.flash * .58 * alpha; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, cyT, Rp * Math.max(.12, wide) * .97, Rp * .82, 0, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1;
      return Y - z * Z;
    }
    const kx = spin * (1 + sq * .1), ky = 1 - sq * .12, cy = -z * Z - sq * Rp * .02;
    ctx.setTransform(dpr, 0, -lean * dpr, dpr, dpr * X, dpr * Y);
    if (opt.ink !== false) { const w = Math.max(1, Rp * .055); ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(0, cy + Rp * .08 * ky, (Rp + w) * kx + .5, (Rp * .9 + w) * ky, 0, 0, TAU); ctx.fill(); }
    const re = Art.reed(opt.edge || '#3a3f4a'), ke = Rp / re.R0;
    ctx.drawImage(re.c, -(re.R0 + 1) * ke * kx, cy - (re.ry + 1) * ke * ky, re.c.width * ke * kx, re.c.height * ke * ky);
    const k = Rp / spr.R;
    ctx.drawImage(spr.c, -spr.S * k * kx / 2, cy - spr.S * k * ky * .42, spr.S * k * kx, spr.S * k * ky * .84);
    if (opt.sheen >= 0 && opt.sheen < 1) {
      const fr = Art.sheen(), f = Rp / 44; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha * .4;
      ctx.drawImage(fr[Math.min(fr.length - 1, Math.floor(opt.sheen * fr.length))], -48 * f * kx, cy - 48 * f * ky * .84, 96 * f * kx, 96 * f * ky * .84);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (opt.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = opt.flash * .58 * alpha; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, cy, Rp * kx * .97, Rp * ky * .82, 0, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1;
    return Y - z * Z;
  }
  // One reused options object: coins are drawn hundreds of times a second and must not allocate.
  const OPT = {};
  function coinOpt(spin, flash, lean, squash, sheen, alpha, shadow, edge, noshadow, yaw) { OPT.yaw = yaw || 0; OPT.spin = spin; OPT.flash = flash; OPT.lean = lean; OPT.squash = squash; OPT.sheen = sheen; OPT.alpha = alpha; OPT.shadow = shadow; OPT.edge = edge; OPT.noshadow = noshadow; OPT.ink = undefined; return OPT; }
  // Baked close to their on-screen size in device pixels, a touch larger for camera kicks, so an emblem is never resampled soft.
  const spriteR0 = u => Math.min(u.boss ? 110 : 80, Math.max(11, Math.ceil(artR(u) * (VW / CAM_SPAN) * dpr * 1.08)));
  function worldSprite(u) {
    if (u.kind === 'champ') return Art.champTurn(u.champ, u.team, u.tier | 0, spriteR0(u), cosOf(u, 'finish'));
    if (u.kind === 'minion') return Art.minionTurn(u.team, u.ranged, spriteR0(u));
    return Art.monsterTurn(u.big, u.boss, spriteR0(u));
  }
  function sprOf(u, v) { const k = (u.tier | 0) * 100 + (dpr * 2 | 0); if (!v.spr || v.sprK !== k) { v.spr = worldSprite(u); v.sprK = k; } return v.spr; }
  const bar = (x, y, w, h, f, col) => { ctx.fillStyle = 'rgba(4,6,10,.9)'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2); ctx.fillStyle = col; ctx.fillRect(x, y, w * f, h); };

  // ---------- intro and outro ----------
  function introZ(c) {
    if (G.intro <= 0) return 0;
    const t = INTRO_LEN - G.intro - (.2 + G.introIdx.get(c.id) * .1);
    if (t < 0) return 1400;
    if (t < FALL) { const f = t / FALL; return 900 * (1 - f * f); }
    const b = t - FALL; return Math.abs(Math.sin(b * 8)) * 46 * Math.exp(-b * 3.4);
  }
  function introTick() {
    for (const c of G.s.champs) {
      if (G.introLanded.has(c.id)) continue;
      const t = INTRO_LEN - G.intro - (.2 + G.introIdx.get(c.id) * .1);
      if (t < FALL) continue;
      G.introLanded.add(c.id);
      visOf(c).squash = 1;
      if (onScreen(c.x, c.y, 120)) { const mine = c === G.me; FX.ring(c.x, c.y, mine ? 110 : 70, mine ? REL_COL.me : c.team === G.me.team ? REL_COL.ally : REL_COL.enemy, mine ? .5 : .32); FX.dust(c.x, c.y, mine ? 1.6 : 1); if (mine) { FX.coins(c.x, c.y, 3, { sp: 120, vz: 300, size: 8, life: .7 }); G.shake = Math.max(G.shake, 3); G.punch = Math.max(G.punch, .012); } Sound.play('clink'); }
    }
  }
  function outroStart() {
    const o = G.outro; G.punch = .1; G.shake = 11; G.outroN = 0; G.outroB = 0;
    FX.ring(o.x, o.y, 460, '#ffd777', .95); FX.ring(o.x, o.y, 260, '#fff5c6', .6); FX.spark(o.x, o.y, 34, '#ffd777', 520, .8, 16, 60); FX.towerFall(o.x, o.y, G.s.over && G.s.over.winner === 0 ? 1 : 0, true, true); FX.finale(!!(G.s.over && G.s.over.winner === G.me.team), o.x, o.y);
  }
  function outroTick(dt) {
    const o = G.outro;
        G.outroN += dt * (quality >= 2 ? 56 : quality === 1 ? 36 : 18);
    while (G.outroN >= 1) { G.outroN--; FX.coins(o.x, o.y, 1, { z: 70, spMin: 30, sp: 260, vzMin: 540, vz: 1180, size: 12, life: 1.7 }); }
    if ((G.outroB -= dt) <= 0) { G.outroB = .55; FX.ring(o.x, o.y, rnd(180, 340), '#ffd777', .55); FX.spark(o.x, o.y, 8, '#ffe69a', 420, .55, 13, 70); }
  }

  // ---------- camera ----------
  function camera(dt, a) {
    const me = G.me, p = posNow(me, a); let tx = p.x, ty = p.y;
    const L = G.lead; let lx = (me.vx || 0) * .16, ly = (me.vy || 0) * .16;
    if (Ctl.aim && me.alive) { const ad = aimDir(); if (ad) { lx += ad.dx * 130; ly += ad.dy * 84; } }
    const kl = 1 - Math.exp(-dt * 4); L.x += (lx - L.x) * kl; L.y += (ly - L.y) * kl; tx += L.x; ty += L.y;
    if (G.intro > 0) { const k = 1 - G.intro / INTRO_LEN; ty -= (1 - k) * (1 - k) * 120; }
    if (G.outro) { tx = G.outro.x; ty = G.outro.y; }
    const k = 1 - Math.exp(-dt * (G.outro ? 2.6 : 9));
    G.cam.x += (tx - G.cam.x) * k; G.cam.y += (ty - G.cam.y) * k;
    const hw = VW / 2 / Z, hh = VH / 2 / (Z * TILT);
    G.cam.x = hw * 2 >= Sim.W ? Sim.W / 2 : Math.max(hw, Math.min(Sim.W - hw, G.cam.x));
    G.cam.y = hh * 2 >= Sim.H ? Sim.H / 2 : Math.max(hh, Math.min(Sim.H - hh, G.cam.y));
    if (!calm && G.shake > .1) { G.shake = Math.min(G.shake, 12); shX = (Math.sin(G.t * 71) + Math.sin(G.t * 43.7)) * .3 * G.shake; shY = (Math.sin(G.t * 63.3 + 1) + Math.sin(G.t * 37.1 + 2)) * .3 * G.shake; G.shake *= Math.exp(-dt * 10); }
    else { shX = shY = 0; G.shake = calm ? 0 : G.shake; }
  }

  // ---------- ground and water ----------
  function ground() {
    const gd = G.ground, gs = gd.scale, vx = G.cam.x - VW / 2 / Z - shX / Z, vy = G.cam.y * TILT - VH / 2 / Z - shY / Z, vw = VW / Z, vh = VH / Z;
    ctx.imageSmoothingEnabled = true;
    for (const t of gd.tiles) {
      const x0 = Math.max(vx, t.x), y0 = Math.max(vy, t.y), x1 = Math.min(vx + vw, t.x + t.w), y1 = Math.min(vy + vh, t.y + t.h);
      if (x1 > x0 && y1 > y0) ctx.drawImage(t.c, (x0 - t.x) * gs, (y0 - t.y) * gs, (x1 - x0) * gs, (y1 - y0) * gs, (x0 - vx) * Z, (y0 - vy) * Z, (x1 - x0) * Z, (y1 - y0) * Z);
    }
  }
  // Moonlight sliding down the river: thin strokes only, painted over a still surface.
  function water(dt) {
    const gd = G.ground, cx = G.cam.x, cy = G.cam.y, hw = VW / 2 / Z + 90, hh = VH / 2 / (Z * TILT) + 90;
    if (cx + hw < G.flowX[0] || cx - hw > G.flowX[1]) return;
    const F = G.ground.flow, n = F.length - 1, t = G.t;
    ctx.globalAlpha = .28; ctx.globalCompositeOperation = 'lighter';
    for (const w of G.waves) {
      w.s += w.v * dt; if (w.s >= n) w.s -= n;
      const p = F[w.s | 0], x = p.x + p.nx * w.o, y = p.y + p.ny * w.o; if (Math.abs(x - cx) > hw || Math.abs(y - cy) > hh || !gd.water(x, y)) continue;
      const spr = w.spr, l = Math.max(.08, Math.sin(t * .9 + w.ph) * .5 + .62) * Z, c = Math.cos(p.a + Math.PI / 2) * l, s = Math.sin(p.a + Math.PI / 2) * l;
      ctx.setTransform(dpr * c, dpr * s, -dpr * s, dpr * c, dpr * sx(x), dpr * sy(y)); ctx.drawImage(spr.c, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  // ---------- mood ----------
  const skyOut = { up: 0, low: 0 };
  function sky() { const h = (G.hopeS - 50) / 50; skyOut.up = Math.max(0, h); skyOut.low = Math.max(0, -h); return skyOut; }
  // Hope grades the ground only, under the units, so coins and danger always keep their full brightness.
  function groundGrade(sk) {
    const dark = sk.low * .34 + G.rain * .1;
    if (dark > .015) { ctx.globalAlpha = dark; ctx.fillStyle = G.villain ? '#1a0408' : '#05060e'; ctx.fillRect(0, 0, VW, VH); ctx.globalAlpha = 1; }
    if (sk.up > .05 && quality >= 1) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = sk.up * .05; ctx.fillStyle = '#e6c98e'; ctx.fillRect(0, 0, VW, VH); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
  }
  // Two tall shafts of light raked across the street: pale gold for heroes, blood for villains.
  let SHAFT = null, SHAFTK = -1;
  function lightShafts() {
    if (quality < 1) return;
    const k = G.villain ? 1 : 0;
    if (SHAFTK !== k) {
      SHAFT = Art.cv(160, 420); SHAFTK = k;
      const g = SHAFT.getContext('2d'), col = k ? '170,44,62' : '226,204,150', v = g.createLinearGradient(0, 0, 0, 420);
      v.addColorStop(0, `rgba(${col},.26)`); v.addColorStop(.7, `rgba(${col},.08)`); v.addColorStop(1, `rgba(${col},0)`); g.fillStyle = v; g.fillRect(0, 0, 160, 420);
      g.globalCompositeOperation = 'destination-in'; const m = g.createLinearGradient(0, 0, 160, 0); m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(.3, 'rgba(0,0,0,1)'); m.addColorStop(.7, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = m; g.fillRect(0, 0, 160, 420);
    }
    const dim = 1 - clamp01(G.rain) * .7, c = Math.cos(.62), s = Math.sin(.62);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 2; i++) {
      const X = VW * (.2 + i * .52) + Math.sin(G.t * .11 + i * 2.3) * 50, W = VW * (.15 + i * .08), al = dim * (.3 + Math.sin(G.t * .4 + i) * .05);
      ctx.globalAlpha = al; ctx.setTransform(dpr * c * W / 160, dpr * s * W / 160, -dpr * s * VH * 1.7 / 420, dpr * c * VH * 1.7 / 420, dpr * X, -30 * dpr); ctx.drawImage(SHAFT, -80, 0);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  function weather(dt, sk) {
    G.rainNext -= dt;
    if (G.rainNext <= 0) { G.rainT = 32 + Math.random() * 18; G.rainNext = G.rainT + 90 + Math.random() * 60; }
    if (G.rainT > 0) G.rainT -= dt;
    // Hope owns the weather: high hope clears the sky, low hope brings a storm that overrides the schedule.
    const opening = G.villain ? clamp01(1 - G.s.t / 70) * .6 : 0, storm = clamp01((sk.low - .2) / .5), passing = (G.rainT > 0 ? 1 : 0) * (1 - clamp01(sk.up / .35));
    const target = Math.max(storm, opening, passing), rate = target > G.rain ? .35 : .25;
    G.rain += clamp01(rate * dt / Math.max(.001, Math.abs(target - G.rain))) * (target - G.rain);
    G.bolt = Math.max(0, G.bolt - dt * 3.2);
    if (G.rain > .5 && dt > 0 && Math.random() < dt * .03) {
      G.bolt = 1; G.thunderIn = rnd(.2, .55);
      const pts = []; let x = rnd(VW * .1, VW * .9), y = -10; const ground_ = rnd(VH * .55, VH * .9);
      while (y < ground_) { pts.push(x, y); x += rnd(-36, 36); y += rnd(22, 54); }
      pts.push(x, ground_); G.boltPts = pts;
    }
    if (G.thunderIn > 0 && (G.thunderIn -= dt) <= 0) Sound.play('thunder');
  }
  function rainStreaks(dt) {
    if (G.rain <= .01) return;
    const n = Math.floor((quality >= 2 ? 48 : quality === 1 ? 28 : 14) * G.rain), d = G.drops;
    while (d.length < n) d.push({ x: Math.random() * VW * 1.2, y: Math.random() * VH });
    const sp = 1100, len = 15;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const p = d[i]; p.y += sp * dt * (.9 + (i % 5) * .05); p.x -= sp * .2 * dt;
      if (p.y > VH + 10) { p.y = -24; p.x = Math.random() * VW * 1.2; }
      if (p.x < -20) p.x = VW * 1.1;
      ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + len * .2, p.y - len);
    }
    ctx.strokeStyle = 'rgba(190,204,226,.18)'; ctx.lineWidth = 1; ctx.stroke();
  }
  // High hope fills the air with a few fine gold motes, above the fog.
  function motes(dt, sk) {
    const gold = sk.up * (1 - G.rain); if (gold < .08 || quality < 1) return;
    const hw = VW / 2 / Z + 40, hh = VH / 2 / (Z * TILT) + 40, sp = Terrain.spark().c, n = quality >= 2 ? G.motes.length : 5; ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const m = G.motes[i]; m.p += dt; m.x += Math.sin(m.p * .9 + i) * 20 * dt; m.y += Math.cos(m.p * .7 + i * 2) * 18 * dt;
      if (Math.abs(m.x - G.cam.x) > hw || Math.abs(m.y - G.cam.y) > hh) { m.x = G.cam.x + rnd(-hw, hw); m.y = G.cam.y + rnd(-hh, hh); }
      ctx.globalAlpha = gold * (.3 + .7 * Math.max(0, Math.sin(m.p * 2.4 + i))); ctx.drawImage(sp, sx(m.x) - 5, sy(m.y) - 26 * Z - 5, 10, 10);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  function lightning() {
    if (G.bolt <= 0) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = G.bolt * .06; ctx.fillStyle = '#c8d2e6'; ctx.fillRect(0, 0, VW, VH); ctx.globalAlpha = 1;
    if (G.boltPts && G.bolt > .35) {
      const p = G.boltPts; ctx.beginPath(); ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
      ctx.lineJoin = 'miter'; ctx.strokeStyle = `rgba(190,206,240,${G.bolt * .6})`; ctx.lineWidth = 3; ctx.stroke(); ctx.strokeStyle = `rgba(255,255,255,${G.bolt})`; ctx.lineWidth = 1.2; ctx.stroke(); ctx.lineJoin = 'round';
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------- fog of war ----------
  // A small offscreen mask redrawn once per frame: never-seen ground is near black, explored ground is dimmed, lit ground is clear.
  let fogC = null, fogG = null, edgeC = null, edgeG = null, fogKNow = 0, exC = null, exG = null, exT = 0, HOLE = null, RIM = null, RIMK = -1;
  const EX = 16; // one explored-map pixel covers this many ground units
  function makeHole() {
    const c = Art.cv(128, 128), g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(.76, 'rgba(0,0,0,1)'); gr.addColorStop(.92, 'rgba(0,0,0,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return c;
  }
  // A flat disc in the team's rim colour, used to trace the outline of everything your team can see.
  function makeRim(k) {
    const c = Art.cv(128, 128), g = c.getContext('2d'); g.fillStyle = k ? '#e0705f' : '#cfe2ff'; g.beginPath(); g.arc(64, 64, 62, 0, TAU); g.fill(); return c;
  }
  function resetFog() { fogC = edgeC = null; fogKNow = 0; exC = Art.cv(Math.ceil(Sim.W / EX), Math.ceil(Sim.H * TILT / EX)); exG = exC.getContext('2d'); exT = 0; VIS_SRC = EMPTY_LIST; }
  function drawFog(dt) {
    const s = G.s, me = G.me, team = me.team, k = quality >= 2 ? 3 : quality === 1 ? 4 : 6, w = Math.ceil(VW / k) + 2, h = Math.ceil(VH / k) + 2;
    if (!HOLE) HOLE = makeHole();
    if (!fogC || fogKNow !== k || fogC.width !== w || fogC.height !== h) { fogC = Art.cv(w, h); fogG = fogC.getContext('2d'); edgeC = Art.cv(w, h); edgeG = edgeC.getContext('2d'); fogKNow = k; }
    let list = EMPTY_LIST; try { list = Sim.visionSources(s, team) || EMPTY_LIST; } catch (e) { list = EMPTY_LIST; }
    VIS_SRC = list;
    // Remember what has been seen, a few times a second.
    if ((exT -= dt) <= 0) {
      exT = .22;
      for (const v of list) { const R = v.r / EX * .96; exG.drawImage(HOLE, v.x / EX - R, v.y * TILT / EX - R * TILT, R * 2, R * 2 * TILT); }
    }
    fogG.setTransform(1, 0, 0, 1, 0, 0); fogG.globalCompositeOperation = 'source-over'; fogG.globalAlpha = 1; fogG.clearRect(0, 0, w, h);
    fogG.fillStyle = 'rgba(4,6,12,.9)'; fogG.fillRect(0, 0, w, h);
    const ox = (-G.cam.x * Z + VW / 2 + shX) / k, oy = (-G.cam.y * TILT * Z + VH / 2 + shY) / k, q = EX * Z / k;
    fogG.globalCompositeOperation = 'destination-out'; fogG.imageSmoothingEnabled = true;
    fogG.globalAlpha = .34; fogG.drawImage(exC, ox, oy, exC.width * q, exC.height * q);
    fogG.globalAlpha = 1;
    const ZK = Z / k;
    for (const v of list) { const R = v.r * ZK, X = (sx(v.x)) / k, Y = (sy(v.y)) / k, Ry = R * TILT; if (X + R < 0 || X - R > w || Y + Ry < 0 || Y - Ry > h) continue; fogG.drawImage(HOLE, X - R, Y - Ry, R * 2, Ry * 2); }
    ctx.imageSmoothingEnabled = true; ctx.drawImage(fogC, 0, 0, w * k, h * k);
    // The vision edge: every circle, grown a little and then cut by the same circles shrunk, leaves one line around their union.
    if (quality >= 1) {
      const cl = team === 1 ? 1 : 0; if (RIMK !== cl) { RIM = makeRim(cl); RIMK = cl; }
      edgeG.setTransform(1, 0, 0, 1, 0, 0); edgeG.globalCompositeOperation = 'source-over'; edgeG.clearRect(0, 0, w, h);
      const d0 = .985, d1 = .965;
      for (const v of list) { const R = v.r * ZK * d0, X = sx(v.x) / k, Y = sy(v.y) / k, Ry = R * TILT; if (X + R < 0 || X - R > w || Y + Ry < 0 || Y - Ry > h) continue; edgeG.drawImage(RIM, X - R, Y - Ry, R * 2, Ry * 2); }
      edgeG.globalCompositeOperation = 'destination-out';
      for (const v of list) { const R = v.r * ZK * d1, X = sx(v.x) / k, Y = sy(v.y) / k, Ry = R * TILT; if (X + R < 0 || X - R > w || Y + Ry < 0 || Y - Ry > h) continue; edgeG.drawImage(RIM, X - R, Y - Ry, R * 2, Ry * 2); }
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .3; ctx.drawImage(edgeC, 0, 0, w * k, h * k); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  }

  // ---------- civilian sites ----------
  const CIV_AT = [[-38, -24], [26, -32], [-10, 2], [44, 12], [-48, 22]].sort((p, q) => p[1] - q[1]);
  function siteArc(X, Y, R, Ry, col, f, ccw) {
    if (f <= 0) return; const top = -Math.PI / 2, end = top + (ccw ? -f : f) * TAU;
    ctx.strokeStyle = INK; ctx.lineWidth = 6.5; ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, top, end, ccw); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 3.8; ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, top, end, ccw); ctx.stroke();
  }
  const NO_DASH = [], DASH2 = [0, 0];
  function siteRings() {
    const list = G.s.sites; if (!list) return;
    for (const c of list) {
      if (!onScreen(c.x, c.y, 200)) continue;
      const X = sx(c.x), Y = sy(c.y), R = 130 * Z, Ry = R * TILT, need = c.need || 1;
      const lead = !c.prog ? -1 : c.prog[0] > c.prog[1] ? 0 : c.prog[1] > c.prog[0] ? 1 : -1, busy = c.alive && lead >= 0;
      if (busy) { ctx.fillStyle = TEAM[lead]; ctx.globalAlpha = .14 + Math.sin(G.t * 9) * .05; ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = c.alive ? .7 : .22;
      ctx.strokeStyle = '#d9cfb4'; ctx.lineWidth = 1.5; DASH2[0] = 10 * Z + 2; DASH2[1] = 9 * Z + 2; ctx.setLineDash(DASH2); ctx.lineDashOffset = -G.t * 6;
      ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, 0, TAU); ctx.stroke(); ctx.setLineDash(NO_DASH); ctx.lineDashOffset = 0; ctx.globalAlpha = 1;
      if (!c.alive || !c.prog) continue;
      ctx.lineCap = 'butt'; siteArc(X, Y, R, Ry, TEAM[0], pct(c.prog[0], need), false); siteArc(X, Y, R, Ry, TEAM[1], pct(c.prog[1], need), true);
    }
  }
  function drawCivilians(c) {
    const contested = c.prog && (c.prog[0] > 0 || c.prog[1] > 0), sp = contested ? 2.2 : 1;
    ctx.lineCap = 'butt'; ctx.lineWidth = Math.max(1.3, 2.2 * Z);
    for (let i = 0; i < CIV_AT.length; i++) {
      const ox = CIV_AT[i][0], oy = CIV_AT[i][1], spr = Art.civCoin((i + c.id) % 4), X = sx(c.x + ox), Y = sy(c.y + oy), ph = G.t * 3.4 * sp + i * 1.7 + c.id, z = (3 + Math.abs(Math.sin(ph)) * 4) * Z, rw = 13 * Z, w = rw / spr.R * spr.S, side = i % 2 ? 1 : -1;
      ctx.drawImage(Art.shadow(), X - rw * 1.1, Y - rw * .4, rw * 2.2, rw * .9);
      const wave = Math.sin(G.t * 8 * sp + i * 2) * 3 * Z, hx = X + side * rw * .8, hy = Y - z - rw * .5;
      ctx.strokeStyle = '#d8d2c2'; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + side * 5 * Z + wave, hy - 11 * Z); ctx.stroke();
      ctx.drawImage(spr.c, X - w / 2, Y - z - w * .46, w, w * .92);
    }
    // A pale diamond above the group shows people are waiting here.
    const b = Terrain.bubble(), bob = Math.abs(Math.sin(G.t * 3 * sp + c.id)) * 4 * Z, bw = b.w * Z * .62, bh = b.h * Z * .62;
    ctx.drawImage(b.c, sx(c.x) - bw / 2, sy(c.y) - (58 * Z) - bh - bob, bw, bh);
  }

  // ---------- per-frame unit state ----------
  function tickVis(u, v, p, dt, sp, ms) {
    v.flash = Math.max(0, v.flash - dt * 8); v.spin = Math.max(0, v.spin - dt * 2.7); v.squash = Math.max(0, v.squash - dt * 5.5);
    const d = Math.exp(-dt * 13); v.rx *= d; v.ry *= d;
    const moving = sp > 20, nx = moving && u.vx ? u.vx / sp : 0;
    v.lean += (clamp01(sp / ms) * nx * .42 - v.lean) * (1 - Math.exp(-dt * 11));
    const before = Math.floor(v.hop / Math.PI);
    v.hop += dt * (moving ? 6.5 : 1.1);
    const landed = moving && Math.floor(v.hop / Math.PI) !== before;
    if (landed) v.squash = Math.max(v.squash, 1);
    if (v.sheen < 1) v.sheen += dt * (v.sheen < 0 ? 1 : 1.6); else v.sheen = -rnd(3, 8);
    // Turning: lean into the direction of travel, breathe at rest, and every few seconds catch the light on purpose.
    const toward = moving ? nx * (.32 + clamp01(sp / ms) * .4) : Math.sin(G.t * .9 + v.phase) * .07, glint = v.sheen > 0 && v.sheen < 1 ? Math.sin(v.sheen * Math.PI) * .62 * (v.phase % 2 ? 1 : -1) : 0;
    v.yaw = (v.yaw || 0) + (toward + glint - (v.yaw || 0)) * (1 - Math.exp(-dt * 10));
    FX.poseTick(v, dt);
    return landed;
  }

  function tickChamp(c, a, dt) {
    const v = visOf(c), p = posNow(c, a), px = p.x, py = p.y, sp = Math.hypot(c.vx || 0, c.vy || 0), me = G.me, mine = c === me;
    const landed = tickVis(c, v, p, dt, sp, c.msBase || 300);
    if (!isUp(c)) { v.lx = undefined; v.br = -1; return v; }
    if (dt > 0) FX.cosmeticTick(c, v, px, py, dt, sp);
    const inBr = c.inBrush === undefined ? -1 : c.inBrush;
    if (dt > 0 && v.lx !== undefined) { const d = Math.hypot(px - v.lx, py - v.ly); if (d > 120 && d < 1300 && seesU(c)) FX.ghostLine(sprOf(c, v), artR(c), v.lx, v.ly, px, py); }
    v.lx = px; v.ly = py;
    if (dt > 0 && (c.dash || c.leap) && seesU(c)) { if ((v.ghostT -= dt) <= 0) { v.ghostT = mine ? .05 : .1; FX.ghost(sprOf(c, v), artR(c), px, py, 8 + (c.z || 0)); } }
    if (dt > 0 && inBr !== v.br) {
      if (inBr >= 0 && mine && onScreen(px, py, 60)) FX.leaves(px, py, 4);
      v.br = inBr;
    }
    // Only your own footfalls leave a mark; everyone else moves quietly.
    if (landed && mine && !c.air && onScreen(px, py, 60)) { if (G.ground.water(px, py)) FX.splash(px, py, .6); else FX.dust(px - (c.vx || 0) * .07, py - (c.vy || 0) * .07, .8); }
    return v;
  }

  function tickMinion(m, a, dt) {
    const v = visOf(m), p = posNow(m, a), px = p.x, py = p.y; tickVis(m, v, p, dt, Math.hypot(m.vx || 0, m.vy || 0), m.ms || 215); WP.x = px; WP.y = py;
    return v;
  }

  // ---------- draw entries ----------
  const DL = []; let dn = 0;
  function push(y, k, o, px, py, v) { const e = DL[dn] || (DL[dn] = { y: 0, k: 0, o: null, px: 0, py: 0, v: null }); dn++; e.y = y; e.k = k; e.o = o; e.px = px; e.py = py; e.v = v; }

  let litNow = 1, litGrade = 0;
  // Whatever stands between the camera and a champion lets them be seen.
  function hides(x0, half, y0, tallW) {
    for (let i = 0; i < VIS_CHAMPS.length; i += 3) { const dy = y0 - VIS_CHAMPS[i + 1]; if (dy > -14 && dy < tallW && Math.abs(VIS_CHAMPS[i] - x0) < half + 44) return true; }
    return false;
  }
  // How far anything tall leans away from the centre of the screen. This is the parallax: a strip of shear per frame.
  const leanAt = X => (X / VW - .5) * .9;
  function drawDecor(o, me, dt) {
    const X = sx(o.x), Y = sy(o.y), spr = o.spr;
    if (o.fade) {
      const rear = hides(o.x, o.half, o.y, o.tall / TILT);
      o.al += ((rear ? .3 : 1) - o.al) * (1 - Math.exp(-dt * 10));
      if (o.al < .995) ctx.globalAlpha = o.al;
    }
    const lean = leanAt(X);
    if (o.kind === 1) {
      const sh = (o.sway ? Math.sin(G.t * 2.6 + o.ph) * .1 : Math.sin(G.t * 1.9 + o.ph) * .03) + lean * .5, img = spr.frames ? spr.frames[Math.floor(G.t * 5 + o.ph) % spr.frames.length] : spr.c, lift = (o.z || 0) * Z;
      ctx.setTransform(dpr * Z, 0, -dpr * Z * sh, dpr * Z, dpr * X, dpr * (Y - lift)); ctx.drawImage(img, -spr.ax, -spr.ay, spr.w, spr.h); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    } else {
      const shear = -lean * (o.kind >= 2 ? .6 : .34);
      ctx.setTransform(dpr * Z, 0, dpr * Z * shear, dpr * Z, dpr * X, dpr * Y);
      if (o.kind >= 2) {
        // Extrusion: the same silhouette, offset up and toward the centre of the screen, a few slices deep. Lit from the side it faces.
        const back = Terrain.backOf(spr, o.kind === 3 ? '#04060a' : '#060910', '#222c3c'), d = (o.kind === 3 ? 26 : 16), bx = -lean * d * 2.4, by = -d * .9, al = ctx.globalAlpha;
        ctx.globalAlpha = al * .98; for (let i = 3; i >= 1; i--) { const f = i / 3; ctx.drawImage(back, -spr.ax + bx * f, -spr.ay + by * f, spr.w, spr.h); } ctx.globalAlpha = al;
      }
      ctx.drawImage(spr.c, -spr.ax, -spr.ay, spr.w, spr.h);
      if (spr.L && o.kind >= 2) {
        const on = o.kind === 3 ? 1 : litNow;
        if (on > .02) { const al = ctx.globalAlpha; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = al * on * (.82 + Math.sin(G.t * 2.3 + o.ph) * .1); ctx.drawImage(spr.L, -spr.ax, -spr.ay, spr.w, spr.h); ctx.globalCompositeOperation = 'source-over'; }
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    ctx.globalAlpha = 1;
  }
  function drawWall(o, dt) {
    const sp = o.spr, wl = o.w, rear = hides(wl.x + wl.w / 2, wl.w / 2 + 16, wl.y + 2, (sp.lift + 74) / TILT);
    o.al = o.al === undefined ? 1 : o.al + ((rear ? .36 : 1) - o.al) * (1 - Math.exp(-dt * 10));
    if (o.al < .995) ctx.globalAlpha = o.al;
    { const Xw = sx(wl.x + wl.w / 2), lean = leanAt(Xw) * .34; ctx.setTransform(dpr * Z, 0, -dpr * Z * lean, dpr * Z, dpr * (sx(wl.x) - sp.P * Z + lean * sp.h * Z), dpr * (sy(wl.y) - (sp.lift + sp.P) * Z)); ctx.drawImage(sp.c, 0, 0, sp.w, sp.h); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    ctx.globalAlpha = 1;
  }
  // Brush is painted into the ground, so the only per-frame cost is this outline while you are inside it.
  function brushHint(dt) {
    const me = G.me;
    for (const o of G.brushes) {
      const inside = isUp(me) && me.inBrush === o.i; o.on += ((inside ? 1 : 0) - o.on) * (1 - Math.exp(-dt * 10));
      if (o.on < .02) continue;
      ctx.globalAlpha = o.on * .8; ctx.strokeStyle = '#a8f0d0'; ctx.lineWidth = 1.6; DASH2[0] = 8 * Z + 2; DASH2[1] = 6 * Z + 2; ctx.setLineDash(DASH2); ctx.lineDashOffset = -G.t * 16;
      ctx.beginPath(); ctx.ellipse(sx(o.b.x), sy(o.b.y), o.b.r * Z, o.b.r * Z * TILT, 0, 0, TAU); ctx.stroke(); ctx.setLineDash(NO_DASH); ctx.lineDashOffset = 0; ctx.globalAlpha = 1;
    }
  }
  // A pool of light under every champion, so they stand out of the dark before anything else.
  function spotlight(X, Y, R, col, a) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a; const sp = Terrain.pool(col), W = R * 3.4; ctx.drawImage(sp, X - W, Y - W * TILT, W * 2, W * TILT * 2); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
  // Your marker: a clean gold ring, three thin arcs orbiting it, and a chevron over your head.
  function meMarker(X, Y, ringR) {
    const col = REL_COL.me, br = 1 + Math.sin(G.t * 4) * .03, R = ringR * br, Ry = R * TILT, O = R * 1.2, Oy = O * TILT, rot = G.t * 1.6;
    ctx.strokeStyle = INK; ctx.lineWidth = 4.6; ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, 0, TAU); ctx.stroke();
    ctx.lineCap = 'butt'; ctx.strokeStyle = '#fff4d2'; ctx.lineWidth = 1.6; ctx.beginPath();
    for (let i = 0; i < 3; i++) { const a0 = rot + i * TAU / 3; ctx.moveTo(X + Math.cos(a0) * O, Y + Math.sin(a0) * Oy); ctx.ellipse(X, Y, O, Oy, 0, a0, a0 + .8); }
    ctx.stroke();
  }
  function meChevron(X, Y) {
    const s = 7, bob = Math.abs(Math.sin(G.t * 3.4)) * 3, y = Y - bob;
    const tri = k => { ctx.beginPath(); ctx.moveTo(X - s * k, y - s * k * .9); ctx.lineTo(X, y + s * k * .55); ctx.lineTo(X + s * k, y - s * k * .9); ctx.lineTo(X, y - s * k * .35); ctx.closePath(); ctx.fill(); };
    ctx.fillStyle = INK; tri(1.35); ctx.fillStyle = REL_COL.me; tri(1);
  }
  function teamRing(X, Y, ringR, ally) {
    const col = ally ? REL_COL.ally : REL_COL.enemy, Ry = ringR * TILT;
    ctx.strokeStyle = INK; ctx.lineWidth = 3.6; ctx.beginPath(); ctx.ellipse(X, Y, ringR, Ry, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(X, Y, ringR, Ry, 0, 0, TAU); ctx.stroke();
    if (!ally) { // enemies also differ in shape: four ticks, so the read never depends on colour alone
      for (let pass = 0; pass < 2; pass++) {
        ctx.strokeStyle = pass ? col : INK; ctx.lineWidth = pass ? 2 : 3.8; ctx.beginPath();
        for (let i = 0; i < 4; i++) { const an = Math.PI / 4 + i * Math.PI / 2, c = Math.cos(an), s = Math.sin(an); ctx.moveTo(X + c * ringR, Y + s * Ry); ctx.lineTo(X + c * (ringR + 8 * Z), Y + s * (Ry + 8 * Z * TILT)); }
        ctx.stroke();
      }
    }
  }
  // Status marks are small and sit on the coin, so a fight stays readable.
  function statusMarks(c, v, X, top, me, Rp) {
    if (c.parryT > 0) { ctx.strokeStyle = '#fff4d2'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.ellipse(X, top, 38 * Z, 33 * Z, 0, 0, TAU); ctx.stroke(); }
    if (c.markT > 0) { const rot = G.t * 2; ctx.strokeStyle = '#ff7ac0'; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i < 3; i++) { const a0 = rot + i * TAU / 3, r = 36 * Z; ctx.moveTo(X + Math.cos(a0) * r, top + Math.sin(a0) * r); ctx.arc(X, top, r, a0, a0 + 1.1); } ctx.stroke(); }
    if (c.stunT > 0) for (let i = 0; i < 3; i++) { const an = G.t * 7 + i * TAU / 3; ctx.fillStyle = '#ffe89e'; ctx.fillRect(X + Math.cos(an) * 20 * Z - 2, top - 30 * Z + Math.sin(an) * 5 - 2, 4, 4); }
    if (c.rootT > 0) { ctx.strokeStyle = 'rgba(200,239,90,.9)'; ctx.lineWidth = Math.max(1.4, 2.2 * Z); ctx.beginPath(); for (let i = 0; i < 3; i++) { const an = -Math.PI / 2 + i * TAU / 3 + G.t * 1.2; ctx.moveTo(X + Math.cos(an) * Rp * 1.4, sy(c.y) + Math.sin(an) * Rp * 1.05); ctx.lineTo(X + Math.cos(an) * Rp * .75, top + Math.sin(an) * Rp * .5); } ctx.stroke(); }
    if (c.shieldT > 0 && c.shieldHp > 0) { ctx.strokeStyle = 'rgba(190,232,255,.9)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(X, top, Rp * 1.34, Rp * 1.22, 0, 0, TAU); ctx.stroke(); }
    if (c.curseT > 0 && c.curseN > 0) { const n = c.curseN | 0, rr = Rp * 1.34; for (let i = 0; i < n; i++) { const an = G.t * 2.4 + i * TAU / n, s0 = 3 * Z + 1, x0 = X + Math.cos(an) * rr, y0 = top + Math.sin(an) * rr * .5; ctx.fillStyle = '#c8ef5a'; ctx.beginPath(); ctx.moveTo(x0, y0 - s0); ctx.lineTo(x0 + s0, y0); ctx.lineTo(x0, y0 + s0); ctx.lineTo(x0 - s0, y0); ctx.closePath(); ctx.fill(); } }
    if ((c.poisonT > 0 || c.bleedT > 0) && (c === me || c.team !== me.team)) { const col = c.poisonT > 0 ? '#b6ec3a' : '#ff5a44'; for (let i = 0; i < 2; i++) { const ph = (G.t * 1.6 + i * .5 + v.phase) % 1; ctx.globalAlpha = 1 - ph; ctx.fillStyle = col; ctx.fillRect(X + Math.sin(i * 7 + v.phase) * Rp * .9 - 1.5, top - ph * 22 * Z - Rp * .5 - 1.5, 3, 3); } ctx.globalAlpha = 1; }
  }
  function drawChamp(c, v, px, py, a, me) {
    const X = sx(px + v.rx + (v.ox || 0)), Y = sy(py + v.ry + (v.oy || 0)), sp = Math.hypot(c.vx || 0, c.vy || 0), moving = sp > 20, hopH = moving ? 4 : 1, mine = c === me, ally = c.team === me.team;
    const izf = introZ(c), air = Math.abs(Math.sin(v.hop)), knockZ = c.knockT > 0 && !c.z ? Math.sin(Math.min(1, 1 - c.knockT / (c.knockMax || c.knockT)) * Math.PI) * 54 : 0, z = 9 + air * hopH + (c.z || 0) + izf + (v.oz || 0) + knockZ, R = artR(c);
    const spinAng = v.spin > 0 ? v.spin * TAU : 0, ringR = (R + 6) * Z, Rp = R * Z;
    spotlight(X, Y, R * Z, mine ? '#fff0c8' : ally ? '#8ec2f2' : '#ff6a5a', mine ? .42 : .3);
    if (mine) meMarker(X, Y, ringR); else teamRing(X, Y, ringR, ally);
    if (c.tier >= 3 && mine) { const gl = Art.glow(AURA[c.tier]), r = (40 + (c.tier - 3) * 5) * Z; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .18 + Math.sin(G.t * 3 + v.phase) * .05; ctx.drawImage(gl, X - r, Y - z * Z - r, r * 2, r * 2); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
    // Stealth: you and your friends see a shimmer of the coin; enemies have nothing to see unless the sim says so.
    const hidden = c.stealthT > 0 ? (.32 + Math.sin(G.t * 7 + v.phase) * .12) : 1, alpha = (c.inBrush >= 0 ? (ally ? .82 : 1) : 1) * hidden;
    // Polymorphed: for a moment this is just a plain spinning coin.
    let top;
    if (c.polyT > 0) top = drawCoin(FX.goldCoin(), X, Y, z, R * .9, coinOpt(Math.cos(G.t * 14), v.flash, 0, 0, undefined, 1, .9, '#6a5428'));
    else top = drawCoin(sprOf(c, v), X, Y, z, R, coinOpt(1, v.flash, v.lean, Math.max(v.squash, 0) * .9 + (v.osq || 0) - (moving ? air * .1 : 0), undefined, alpha, clamp01(1 - izf / 900) * .9, undefined, undefined, v.yaw + (v.oyaw || 0) + spinAng));
    statusMarks(c, v, X, top, me, Rp);
    if (c.chan && c.chan.recall && c.chan.total) { ctx.strokeStyle = TEAM[c.team]; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(X, top, 36 * Z, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - c.chan.t / c.chan.total)); ctx.stroke(); }
    if (c.echo && c.recast && c.recast[1] > 0 && ally) drawCoin(sprOf(c, v), sx(c.echo.x), sy(c.echo.y), 9, R, coinOpt(1, 0, 0, 0, undefined, .4));
    if (mine) b_meTop = 1;
  }
  let b_meTop = 0;

  // A stack of real coins with a crown piece. The stack loses coins as HP falls and the crown rides it down.
  let rdt = 0;
  function drawTower(t, v) {
    const art = artOf(t), n = art.n, R = art.R, shown = Math.max(1, Math.ceil(n * pct(t.hp === undefined ? t.maxHp : t.hp, t.maxHp || 1))), core = t.sub === 'core';
    const X = sx(t.x), Y = sy(t.y), k = Z, step = R * STEP * k, open = towerOpenU(t), d = Terrain.towerCoin(t.team, R), stackS = v.stackS === undefined ? shown : v.stackS;
    // A tall stack must never hide a champion standing behind it.
    const rear = hides(t.x, R * .9, t.y, (shown * R * STEP + art.crown) / TILT); v.al = v.al === undefined ? 1 : v.al + ((rear ? .66 : 1) - v.al) * (1 - Math.exp(-rdt * 10)); const al = v.al;
    ctx.globalAlpha = al;
    ctx.drawImage(Art.shadow(), X - R * 1.3 * k, Y - R * .6 * k, R * 2.6 * k, R * 1.3 * k);
    const lean = leanAt(X) * .6; for (let i = 0; i < shown; i++) { const taper = 1 - i / n * .17, q = k * taper, off = Math.sin(i * 7.3) * 2.2 * k + i * step * lean; ctx.drawImage(d.c, X - d.cx * q + off, Y - d.cy * q - i * step, d.w * q, d.h * q); }
    // The crown rides the stack down smoothly instead of snapping a coin lower.
    const topY = Y - (stackS - 1) * step, crown = Terrain.towerCrown(t.team, core), bob = Math.sin(G.t * 2 + t.x) * 2.5 * k;
    ctx.setTransform(dpr * k, 0, -dpr * k * lean * 1.1, dpr * k, dpr * (X + (shown - 1) * step * lean), dpr * (topY - d.cy * .16 * k + bob * .4)); ctx.drawImage(crown.c, -crown.ax, -crown.ay, crown.w, crown.h); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    if (v.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = v.flash * .4 * al; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(X, Y - shown * step * .5, R * k, (shown * step + R * k * .7) * .55, 0, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
    if (open) { const gl = Art.glow(t.team ? '#ff4a5c' : '#ffdf9e'), gr = (core ? 44 : 32) * k, gy = topY - (core ? 74 : 54) * k, X_ = X + (shown - 1) * step * lean; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (.32 + Math.sin(G.t * 3) * .08) * al; ctx.drawImage(gl, X_ - gr, gy - gr, gr * 2, gr * 2); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
    if (core) drawCoin(v.coreS || (v.coreS = Art.coin('corecoin' + t.team, 56, 'boss', Art.METAL['minion' + t.team], t.team, 3)), X + (shown - 1) * step * lean, topY - 96 * k, 0, 24, coinOpt(Math.cos(G.t * 1.3), 0, 0, 0, undefined, al, undefined, '#6a5428', true));
  }
  // What's left after a tower falls: a low, dark pile on its plinth.
  const PILE = [[-22, 2, .62], [20, 6, .58], [-2, -5, .7]];
  function drawFallen(t, v) {
    const art = artOf(t), d = Terrain.towerCoin(t.team, art.R), X = sx(t.x), Y = sy(t.y), k = Z, f = clamp01((v.fallT - .3) / .35), e = f * f * (3 - 2 * f); if (e <= 0) return;
    ctx.globalAlpha = e;
    for (let i = 0; i < 3; i++) { const q = k * PILE[i][2]; ctx.drawImage(d.c, X + PILE[i][0] * k - d.cx * q, Y + PILE[i][1] * k - d.cy * q, d.w * q, d.h * q); }
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#6a6a78'; ctx.beginPath(); ctx.ellipse(X, Y, art.R * 1.1 * k, art.R * .7 * k, 0, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  function tickTower(t, dt) {
    const v = visOf(t), art = artOf(t); v.flash = Math.max(0, v.flash - dt * 8);
    const shown = Math.ceil(art.n * pct(t.hp === undefined ? t.maxHp : t.hp, t.maxHp || 1));
    if (v.stack < 0) v.stack = shown;
    if (v.stackS === undefined) v.stackS = shown;
    if (shown < v.stack && onScreen(t.x, t.y, 200)) for (let i = shown; i < v.stack; i++) FX.popCoin(t.team, t.x, t.y, 20 + i * art.R * STEP);
    v.stack = shown; v.stackS += (shown - v.stackS) * (1 - Math.exp(-dt * 11));
  }

  // ---------- ambient life ----------
  function tickSmoke(dt) {
    if (quality < 1 || dt <= 0) return;
    const dark = clamp01((34 - G.hopeS) / 20);
    for (const d of G.houses) { if (!onScreen(d.x, d.y, 120)) continue; d.smk -= dt * (.7 + dark * 1.4); if (d.smk <= 0 && G.smoke.length < 14) { d.smk = rnd(2.4, 4.2); G.smoke.push({ x: d.x + d.spr.chimX, y: d.y, z: d.spr.chimZ, t: 0, max: rnd(2.2, 3.4), dark: Math.random() < dark, ph: Math.random() * 6 }); } }
    for (let i = G.smoke.length - 1; i >= 0; i--) { const s = G.smoke[i]; s.t += dt; s.z += dt * 34; if (s.t >= s.max) { G.smoke[i] = G.smoke[G.smoke.length - 1]; G.smoke.pop(); } }
  }
  function drawSmoke() {
    for (const s of G.smoke) {
      const f = s.t / s.max, spr = Terrain.smoke(s.dark), R = (s.dark ? 8 + f * 24 : 5 + f * 13) * Z, X = sx(s.x + Math.sin(s.t * 1.3 + s.ph) * 10 + f * 16), Y = sy(s.y) - s.z * Z;
      { const top = s.dark ? .62 : .3; ctx.globalAlpha = f > .65 ? (1 - f) / .35 * top : top; } ctx.drawImage(spr.c, X - R, Y - R, R * 2, R * 2);
    }
    ctx.globalAlpha = 1;
  }

  // Bars read as one simple strip per unit. Names and levels are prerendered, so a frame draws no text.
  const TAGS = new Map();
  function nameTag(name, lvl, col) {
    const ready = !document.fonts || document.fonts.status === 'loaded' ? 1 : 0, id = name + '|' + lvl + '|' + col + '|' + ready;
    let t = TAGS.get(id); if (t) return t;
    const font = '600 11px "Barlow Semi Condensed",sans-serif', m = Art.cv(4, 4).getContext('2d'); m.font = font;
    const w = Math.ceil(m.measureText(name).width) + 10, S = 2, c = Art.cv(w * S, 16 * S), g = c.getContext('2d');
    g.scale(S, S); g.font = font; g.textBaseline = 'middle'; g.textAlign = 'left'; g.lineJoin = 'round'; g.lineWidth = 2.4; g.strokeStyle = INK; g.strokeText(name, 5, 8); g.fillStyle = col; g.fillText(name, 5, 8);
    t = { c, w, h: 16 }; if (TAGS.size > 240) TAGS.clear(); TAGS.set(id, t); return t;
  }
  function lvlTag(lvl) {
    const ready = !document.fonts || document.fonts.status === 'loaded' ? 1 : 0, id = '#' + lvl + '|' + ready;
    let t = TAGS.get(id); if (t) return t;
    const S = 2, W = 13, c = Art.cv(W * S, W * S), g = c.getContext('2d'); g.scale(S, S); g.fillStyle = INK; g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W, W / 2); g.lineTo(W / 2, W); g.lineTo(0, W / 2); g.closePath(); g.fill();
    g.fillStyle = '#f4ead0'; g.font = '700 9.5px "Barlow Semi Condensed",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(lvl, W / 2, W / 2 + .5);
    t = { c, w: W, h: W }; TAGS.set(id, t); return t;
  }
  const charName = u => { try { if (Sim.charOf) return Sim.charOf(u.team, u.champ).name; return Sim.KITS[u.champ].name; } catch (e) { return ''; } };
  const BARS = [], VIS_CHAMPS = [], VIS_UNITS = [], ORDER = []; let bn = 0;
  function pushBar(u, px, py, v) { const b = BARS[bn] || (BARS[bn] = { u: null, px: 0, py: 0, v: null }); bn++; b.u = u; b.px = px; b.py = py; b.v = v; }
  const byDepth = (p, q) => p.y - q.y;
  function hpBars(dt) {
    const me = G.me;
    for (let i = 0; i < bn; i++) {
      const b = BARS[i], u = b.u, X = sx(b.px), Y = sy(b.py) - (u.z || 0) * Z, f = pct(u.hp === undefined ? (u.maxHp || 1) : u.hp, u.maxHp || 1), ally = u.team === me.team;
      if (u.kind === 'champ') {
        const mine = u === me, w = 46, h = 4.5, x = X - w / 2, y = Y - (artR(u) * 1.9 + 8) * Z - 10, v = b.v;
        if (!(v.hpShow >= 0)) v.hpShow = f;
        v.hpShow += (f - v.hpShow) * (1 - Math.exp(-dt * 22));
        v.hpLag = v.hpLag < f ? f : Math.max(f, v.hpLag - dt * .75);
        ctx.fillStyle = INK; ctx.fillRect(x - 1.2, y - 1.2, w + 2.4, h + 2.4);
        if (mine) { ctx.fillStyle = REL_COL.me; ctx.fillRect(x - 1.2, y - 2, w + 2.4, 1); }
        if (v.hpLag > v.hpShow) { ctx.fillStyle = '#f2e6c8'; ctx.fillRect(x + w * v.hpShow, y, w * (v.hpLag - v.hpShow), h); }
        ctx.fillStyle = ally ? REL_COL.ally : REL_COL.enemy; ctx.fillRect(x, y, w * v.hpShow, h);
        const lt = lvlTag(u.lvl | 0); ctx.drawImage(lt.c, x - lt.w + 2, y + h / 2 - lt.h / 2, lt.w, lt.h);
        if (!mine && !ally) { const nm = charName(u); if (nm) { const t = nameTag(nm, 0, REL_COL.enemyName); ctx.drawImage(t.c, x - 5, y - 15, t.w, t.h); } }
        else if (mine && b_meTop) meChevron(X, y - 9);
      } else if (u.kind === 'tower') {
        const art = artOf(u), open = towerOpenU(u), y = Y - (art.n * art.R * STEP + art.crown) * Z - 6;
        if (u.hp < u.maxHp || open) bar(X - 34 * Z, y, 68 * Z, 5, f, open ? (ally ? REL_COL.ally : REL_COL.enemy) : 'rgba(150,158,170,.7)');
      } else if (u.hp < u.maxHp) {
        if (u.kind === 'minion') { const w = 22 * Z, x = X - w / 2, y = Y - (artR(u) * 1.9 + 7) * Z; ctx.fillStyle = 'rgba(4,6,10,.85)'; ctx.fillRect(x - .5, y - .5, w + 1, 3); ctx.fillStyle = ally ? '#58b0ff' : '#ff4a44'; ctx.fillRect(x, y, w * f, 2); }
        else { const r = artR(u); bar(X - r * Z, Y - (r * 1.9 + 8) * Z, r * 2 * Z, u.boss ? 6 : 3.5, f, '#d9b86a'); }
      }
    }
  }

  // A vision beacon: a small brass mast, a turning lamp and one thin sweep on the ground.
  const BEACON_SPR = [null, null];
  function beaconSprite(team) {
    if (BEACON_SPR[team]) return BEACON_SPR[team];
    const S = 2, W = 44, H = 76, c = Art.cv(W * S, H * S), g = c.getContext('2d'), col = team ? '#ff4a5c' : '#ffdf9e', dk = team ? '#2a1820' : '#1a2c4a', mt = team ? '#a8b0bc' : '#e6d19c';
    g.scale(S, S); g.fillStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.ellipse(22, 68, 15, 5, 0, 0, TAU); g.fill();
    g.fillStyle = dk; g.beginPath(); g.moveTo(12, 68); g.lineTo(32, 68); g.lineTo(27, 60); g.lineTo(17, 60); g.closePath(); g.fill();
    g.fillStyle = mt; g.fillRect(20, 22, 4, 40); g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(22, 22, 2, 40);
    g.fillStyle = dk; g.fillRect(14, 15, 16, 8); g.fillStyle = mt; g.fillRect(14, 22, 16, 1.5);
    g.fillStyle = col; g.beginPath(); g.moveTo(22, 2); g.lineTo(29, 13); g.lineTo(15, 13); g.closePath(); g.fill();
    return BEACON_SPR[team] = c;
  }
  function drawBeacon(b) {
    const X = sx(b.x), Y = sy(b.y), R = 26 * Z, ally = b.team === G.me.team, col = ally ? 'rgba(170,220,255,' : 'rgba(255,110,90,', life = b.t && b.total ? b.t / b.total : 1, fade = clamp01(life * 8);
    ctx.globalAlpha = fade;
    ctx.strokeStyle = col + '.8)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(X, Y, R, R * TILT, 0, 0, TAU); ctx.stroke();
    const an = G.t * 1.6 + b.x * .01, sw = (R + 34 * Z); ctx.strokeStyle = col + '.5)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(X, Y, sw, sw * TILT, 0, an, an + .9); ctx.stroke();
    const spr = beaconSprite(b.team === 1 ? 1 : 0); ctx.drawImage(spr, X - 22 * Z, Y - 68 * Z, 44 * Z, 76 * Z);
    const gl = Art.glow(ally ? '#bfe0ff' : '#ff8070'), r = (14 + Math.sin(G.t * 3 + b.x) * 2) * Z; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = fade * .7; ctx.drawImage(gl, X - r, Y - 60 * Z - r, r * 2, r * 2); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    if (b.hp !== undefined && b.maxHp && b.hp < b.maxHp) bar(X - 14 * Z, Y - 78 * Z, 28 * Z, 3, b.hp / b.maxHp, ally ? REL_COL.ally : REL_COL.enemy);
  }

  function minionRing(u, X, Y) {
    const R = (artR(u) + 3) * Z; ctx.strokeStyle = u.team === G.me.team ? 'rgba(88,176,255,.65)' : 'rgba(255,63,58,.7)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(X, Y, R, R * TILT, 0, 0, TAU); ctx.stroke();
  }

  function render(dt) {
    const s = G.s, me = G.me; if (!s || !me) return;
    rdt = dt;
    Art.pump(paused || G.intro > 0 ? 9 : 2.5);
    if (s.hope !== undefined) G.hopeS += (s.hope - G.hopeS) * (1 - Math.exp(-dt * 1.2));
    const a = Math.min(1, (G.acc || 0) / DT), wdt = G.intro > 0 || G.outro ? dt : dt * (G.stop > 0 ? .1 : (G.timeScale || 1));
    G.punch *= Math.exp(-dt * (G.outro ? 1.2 : 8));
    // Zoom kicks are eased in as well as out, so no impact ever snaps the camera.
    G.punchS = (G.punchS || 0) + (G.punch - (G.punchS || 0)) * (1 - Math.exp(-dt * 32));
    let zoom = 1; if (G.intro > 0) { const k = clamp01(1 - G.intro / INTRO_LEN), e = 1 - Math.pow(1 - k, 3); zoom = lerp(.84, 1, e); }
    ZB = VW / CAM_SPAN;
    Z = ZB * (1 + G.punchS) * zoom;
    camera(dt, a);
    G.flash = Math.max(0, (G.flash || 0) - dt * 2.6);
    const champs = s.champs || EMPTY_LIST, minions = s.minions || EMPTY_LIST, monsters = s.monsters || EMPTY_LIST, towers = s.towers || EMPTY_LIST;

    // Everything visible is gathered first: fading needs to know where the units are.
    dn = 0; bn = 0; VIS_CHAMPS.length = 0; VIS_UNITS.length = 0; b_meTop = 0;
    const m = 190;
    litNow = clamp01((G.hopeS - 18) / 22);
    tickSmoke(wdt);
    if (s.sites) for (const c of s.sites) if (c.alive && onScreen(c.x, c.y, 120)) push(c.y, 7, c);
    for (const d of G.decor) if (onScreen(d.x, d.y, m + (d.sky ? 260 : 0))) push(d.y, 0, d);
    for (const w of G.walls) if (onScreen(w.w.x + w.w.w / 2, w.w.y + w.w.h / 2, Math.max(w.w.w, w.w.h) * Z + 120)) push(w.w.y + w.w.h, 1, w);
    for (const t of towers) {
      const v = visOf(t);
      if (isUp(t)) { tickTower(t, wdt); if (onScreen(t.x, t.y, 200)) { push(t.y, 3, t, 0, 0, v); pushBar(t, t.x, t.y, v); } }
      else if (v.fallT !== undefined) { v.fallT += wdt; if (onScreen(t.x, t.y, 200)) push(t.y, 8, t, 0, 0, v); }
    }
    // Enemies only exist on screen where your team can see them.
    for (const q of minions) { if (!isUp(q) || q.delay > 0) continue; const v = tickMinion(q, a, wdt), px = WP.x, py = WP.y; if (onScreen(px, py, 70) && seesU(q)) { push(py - 40, 4, q, px, py, v); pushBar(q, px, py, v); VIS_UNITS.push(px, py); } }
    for (const q of monsters) { if (!isUp(q)) continue; const v = visOf(q), p = posNow(q, a), px = p.x, py = p.y, sp = Math.hypot(q.vx || 0, q.vy || 0); tickVis(q, v, p, wdt, sp, q.ms || 260); if (onScreen(px, py, 120) && seesU(q)) { push(py, 5, q, px, py, v); pushBar(q, px, py, v); VIS_UNITS.push(px, py); } }
    if (s.beacons) for (const b of s.beacons) { if (onScreen(b.x, b.y, 120) && (b.team === me.team || litAt(b.x, b.y, 40))) push(b.y, 9, b); }
    for (const c of champs) {
      const v = tickChamp(c, a, wdt);
      if (!isUp(c) || !seesU(c)) continue;
      const p = posNow(c, a), px = p.x, py = p.y; if (!onScreen(px, py, 100)) continue;
      push(py, 6, c, px, py, v); pushBar(c, px + v.rx, py + v.ry, v); VIS_CHAMPS.push(px, py, c);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#05070b'; ctx.fillRect(0, 0, VW, VH);
    ground();
    const sk = sky();
    groundGrade(sk);
    water(dt);
    lightShafts();
    weather(dt, sk);
    siteRings();
    brushHint(dt);
    FX.tickWarn(wdt);
    FX.drawDust(wdt);
    FX.telegraphs(a);

    ORDER.length = dn; for (let i = 0; i < dn; i++) ORDER[i] = DL[i];
    ORDER.sort(byDepth);
    for (let i = 0; i < dn; i++) {
      const e = ORDER[i];
      switch (e.k) {
        case 0: drawDecor(e.o, me, dt); break;
        case 1: drawWall(e.o, dt); break;
        case 3: drawTower(e.o, e.v); break;
        case 4: { const u = e.o, v = e.v, z = 5 + Math.abs(Math.sin(v.hop)) * (u.vx || u.vy ? 3 : .5), X = sx(e.px + v.rx), Y = sy(e.py + v.ry); minionRing(u, X, Y); drawCoin(sprOf(u, v), X, Y, z, artR(u), coinOpt(1, v.flash, v.lean, v.squash, undefined, undefined, .8, u.team ? '#3a1a22' : '#22324c', undefined, v.yaw || 0)); break; }
        case 5: { const u = e.o, v = e.v, z = u.boss ? 16 + Math.sin(G.t * 1.8) * 3 : 6 + Math.abs(Math.sin(v.hop)) * 3; drawCoin(sprOf(u, v), sx(e.px + v.rx), sy(e.py + v.ry), z, artR(u), coinOpt(1, v.flash, v.lean, v.squash, undefined, undefined, undefined, u.boss ? '#5a3f22' : '#3a3226', undefined, u.boss ? Math.sin(G.t * .9) * .26 : (v.yaw || 0))); break; }
        case 6: drawChamp(e.o, e.v, e.px, e.py, a, me); break;
        case 7: drawCivilians(e.o); break;
        case 8: drawFallen(e.o, e.v); break;
        case 9: drawBeacon(e.o); break;
      }
    }
    drawSmoke();

    // Fog goes over the world; effects and readouts sit above it so nothing important is dimmed.
    drawFog(dt);
    FX.projectiles(a, wdt);
    FX.draw(wdt);
    rainStreaks(dt);
    motes(dt, sk);
    lightning();
    if (quality >= 1) ctx.drawImage(Art.vignette(VW | 0, VH | 0), 0, 0, VW, VH);
    FX.danger(a);
    hpBars(dt);
    FX.textLayer(dt);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    hudDraw(dt);
  }

  return { initWorld, render, introTick, outroStart, outroTick, drawCoin, visOf, worldSprite };
})();
