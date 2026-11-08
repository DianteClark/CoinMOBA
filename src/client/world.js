// The world renderer: ground, cartoon water, weather, the lightmap, scenery, units, ambient life, intro and outro.
// Private helpers stay inside the closure so nothing collides with the other client files.
let shX = 0, shY = 0;
const sx = x => (x - G.cam.x) * Z + VW / 2 + shX;
const sy = y => (y - G.cam.y) * TILT * Z + VH / 2 + shY;
const onScreen = (x, y, m = 90) => { const X = sx(x), Y = sy(y); return X > -m && X < VW + m && Y > -m - 40 && Y < VH + m + 60; };

const { initWorld, render, introTick, outroStart, outroTick, drawCoin, visOf } = (() => {
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const AURA = { 3: '#ffe28a', 4: '#c5f4ff', 5: '#d9b8ff' };
  const INTRO_LEN = 2.6, FALL = .6;
  const INK = Terrain.INK;
  // On-screen size of each unit class. drawR stays the gameplay-facing radius; these only scale the painted coin.
  const SIZE_CHAMP = 1.25, SIZE_MINION = 1.2, SIZE_MONSTER = 1.12;
  const TOWER_ART = { n: 8, R: 46, crown: 100 }, CORE_ART = { n: 9, R: 66, crown: 150 };
  const STEP = .34;
  const artOf = t => t.sub === 'core' ? CORE_ART : TOWER_ART;

  function visOf(u) {
    let v = G.vis.get(u.id);
    if (!v) { v = { flash: 0, spin: 0, hop: Math.random() * TAU, rx: 0, ry: 0, lean: 0, squash: 0, sheen: -rnd(1, 6), ghostT: 0, br: -1, hpLag: 1, lx: undefined, ly: undefined, stack: -1, phase: Math.floor(Math.random() * 1e3) }; G.vis.set(u.id, v); }
    return v;
  }

  // ---------- setup ----------
  function initWorld(g) {
    const s = g.s, map = s.map, GS = quality >= 2 ? 1.25 : 1;
    g.ground = Terrain.paint(map, s.towers, GS, s.sites || []);
    g.vis = new Map();
    g.text = []; g.punch = 0; g.lead = { x: 0, y: 0 }; g.goldBump = 0; g.goldAnchor = g.goldAnchor || null;
    g.hopeS = s.hope === undefined ? 50 : s.hope;
    // The side you were dealt sets the opening: heroes wake at dawn, villains arrive at dusk under cloud.
    g.villain = g.me.team === 1; g.skyStart = g.villain ? .66 : .03;
    g.rain = g.villain ? .55 : 0; g.rainT = 0; g.rainNext = 95 + Math.random() * 40; g.bolt = 0; g.boltPts = null; g.thunderIn = 0; g.drops = []; g.ripples = [];
    g.clouds = Array.from({ length: 5 }, (_, i) => ({ x: Math.random() * Sim.W, y: Math.random() * Sim.H, v: rnd(22, 40), r: rnd(380, 620), k: i % 3 }));
    g.motes = Array.from({ length: 26 }, () => ({ x: Math.random() * Sim.W, y: Math.random() * Sim.H, p: Math.random() * 6 }));
    g.drift = Array.from({ length: 12 }, (_, i) => ({ x: Math.random() * Sim.W, y: Math.random() * Sim.H, z: rnd(20, 120), p: Math.random() * 6, rot: Math.random() * TAU, col: ['#7fb36a', '#4f8f5e', '#c9a24a'][i % 3] }));
    g.decor = buildDecor(g);
    g.brushes = map.brush.map((b, i) => ({ b, i, spr: Terrain.brush(b, i % 3 + 1), fade: 1, shake: 0 }));
    g.walls = map.walls.filter(w => !w.big).map(w => ({ w, spr: Terrain.cliff(w) }));
    g.lamps = g.decor.filter(d => d.light);
    g.houses = g.decor.filter(d => d.kind === 2);
    buildWater(g); buildLife(g);
    g.introIdx = new Map(s.champs.map((c, i) => [c.id, i])); g.introLanded = new Set();
    g.tAim = null;
    FX.reset();
  }

  function buildDecor(g) {
    const s = g.s, map = s.map, r = Art.seeded(4177), out = [], W = Sim.W, H = Sim.H, TAU2 = TAU;
    const tree = (x, y) => {
      const q = r(), v = q < .08 ? 3 : q < .14 ? 4 : x > W * .62 && q < .3 ? 5 : Math.floor(r() * 3), spr = Terrain.tree(v);
      out.push({ x, y, spr, kind: 0, fade: true, half: spr.w * .42, tall: spr.h * .9, al: 1 });
    };
    for (const w of map.walls) if (w.big) for (let i = 0; i < 24; i++) tree(w.x + 26 + r() * (w.w - 52), w.y + 20 + r() * (w.h - 40));
    for (let x = 340; x < W - 340; x += 58 + r() * 48) { tree(x, 34 + r() * 60); tree(x, H - 12 - r() * 48); }
    for (let y = 340; y < H - 340; y += 66 + r() * 46) { tree(8 + r() * 24, y); tree(W - 8 - r() * 24, y); }
    // lanterns on the road shoulders, kept off the river, the towers and the walls
    const lan = Terrain.lantern(g.me.team === 1), lanCol = g.me.team === 1 ? '#ff5a3c' : '#ffcf85';
    for (const lane of map.lanes) {
      const pts = Terrain.spline(lane, 16); let run = 200, side = 1;
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i], d = Math.hypot(bx - ax, (by - ay) * TILT); run += d; if (run < 260) continue; run = 0; side = -side;
        const dx = bx - ax, dy = (by - ay) * TILT, l = Math.hypot(dx, dy) || 1, nx = -dy / l * side, ny = dx / l * side, x = bx + nx * 112, y = by + ny * 112 / TILT;
        if (Math.abs(x - g.ground.riverX(y)) < 250) continue;
        if (s.towers.some(t => Math.hypot(t.x - x, t.y - y) < 150)) continue;
        if (map.walls.some(w => x > w.x - 30 && x < w.x + w.w + 30 && y > w.y - 30 && y < w.y + w.h + 30)) continue;
        out.push({ x, y, spr: lan, kind: 0, light: { r: 170, col: lanCol, z: lan.lightY, a: .55 }, ph: r() * 6 });
      }
    }
    // The town: houses ring each civilian square and line the roads. Clear of roads, river, plazas and play spaces.
    const roadPts = map.lanes.flatMap(l => Terrain.spline(l, 8)), sites = s.sites || [], placed = [];
    const clear = (x, y) => {
      if (x < 70 || x > W - 70 || y < 150 || y > H - 150) return false;
      if (Math.abs(x - g.ground.riverX(y)) < 190 || Math.hypot(x - 1600, y - 950) < 340 || Math.hypot(x - 210, y - 950) < 450 || Math.hypot(x - (W - 210), y - 950) < 450) return false;
      if (roadPts.some(([rx, ry]) => Math.hypot(x - rx, (y - ry) * TILT) < 140)) return false;
      if (map.walls.some(w => x > w.x - 70 && x < w.x + w.w + 70 && y > w.y - 50 && y < w.y + w.h + 90)) return false;
      if (s.towers.some(t => Math.hypot(t.x - x, t.y - y) < 180) || map.brush.some(b => Math.hypot(b.x - x, b.y - y) < b.r + 70)) return false;
      if ((s.camps || []).some(c => Math.hypot(c.x - x, c.y - y) < 170) || sites.some(c => Math.hypot(c.x - x, c.y - y) < 185)) return false;
      return !placed.some(p => Math.hypot(p.x - x, (p.y - y) * TILT) < 112);
    };
    const house = (x, y) => {
      if (!clear(x, y)) return false;
      const side = x > W / 2 ? 1 : 0, v = Math.floor(r() * 8), spr = Terrain.house(v, side); placed.push({ x, y });
      out.push({ x, y, spr, kind: 2, fade: true, half: 62, tall: spr.h * .9, al: 1, ph: r() * 6, smk: r() * 2 });
      if (spr.shop) out.push({ x: x + (r() > .5 ? 66 : -66), y: y + 6, spr: Terrain.sign(v), kind: 1, ph: r() * 6, sway: 1, z: 76 });
      return true;
    };
    for (const site of sites) { let n = 0; const a0 = r() * TAU2; for (let i = 0; i < 16 && n < 7; i++) { const a = a0 + i * TAU2 / 16, d = 205 + r() * 60; if (house(site.x + Math.cos(a) * d, site.y + Math.sin(a) * d)) n++; } }
    for (const lane of map.lanes) { const pts = Terrain.spline(lane, 16); for (let i = 5; i < pts.length; i += 6) { const [x, y] = pts[i], q = pts[i + 1] || pts[i], dx = q[0] - x, dy = (q[1] - y) * TILT, l = Math.hypot(dx, dy) || 1; for (const sd of [-1, 1]) { const o = 168 + r() * 56; house(x - dy / l * sd * o, y + dx / l * sd * o / TILT); } } }
    // Fill the open meadows so the whole map reads as a town.
    for (let y = 200; y < H - 200; y += 136) for (let x = 380; x < W - 380; x += 150) if (r() < .62) house(x + (r() - .5) * 70, y + (r() - .5) * 60);
    // Headquarters stand at both ends of each base plaza, so one is in view from the spawn and from either lane.
    for (const team of [0, 1]) for (const y of [706, 1262]) {
      const spr = Terrain.hq(team), x = team ? W - 112 : 112;
      out.push({ x, y, spr, kind: 3, fade: true, half: 132, tall: spr.h * .8, al: 1, ph: r() * 6, light: { r: 300, col: team ? '#8dff2a' : '#ffe27a', z: 170, a: .55 } });
    }
    const pil = Terrain.pillar();
    for (let i = 0; i < 8; i++) { const a = i * TAU2 / 8 + TAU2 / 16; out.push({ x: 1600 + Math.cos(a) * 248, y: 950 + Math.sin(a) * 248, spr: pil, kind: 0, light: { r: 210, col: '#ffd27a', z: pil.lightY, a: .5 }, ph: r() * 6 }); }
    for (const team of [0, 1]) for (const a of [-1.05, -.4, .4, 1.05]) { const cx = team ? W - 210 : 210, dir = team ? -1 : 1; out.push({ x: cx + Math.cos(a) * 372 * dir, y: 950 + Math.sin(a) * 372, spr: Terrain.banner(team), kind: 1, ph: r() * 6, flag: 1 }); }
    return out;
  }

  function buildWater(g) {
    const gd = g.ground, F = gd.flow, H0 = Terrain.HALF;
    g.waves = Array.from({ length: quality >= 2 ? 120 : quality === 1 ? 76 : 40 }, (_, i) => ({ s: Math.random() * (F.length - 1), o: rnd(-.8, .8) * H0, v: rnd(1.5, 2.6), k: i % 3, ph: Math.random() * 6 }));
    const foam = [], add = (x, y) => foam.push({ x, y, k: foam.length % 3, ph: Math.random() * 6 });
    for (let i = 0; i < F.length; i += 2) for (const sd of [-1, 1]) { const p = F[i], x = p.x + p.nx * sd * (H0 - 6), y = p.y + p.ny * sd * (H0 - 6); if (gd.water(x, y)) add(x, y); }
    for (const b of gd.bridges) for (const o of [-1, 1]) for (let x = b.x - H0 - 40; x <= b.x + H0 + 40; x += 34) { const y = b.y + o * (gd.ROAD + 22) / TILT; if (Math.abs(x - gd.riverX(y)) < H0 - 6) add(x, y); }
    for (let a = 0; a < TAU; a += .16) { const x = gd.plaza.x + Math.cos(a) * (gd.plaza.r + 10), y = gd.plaza.y + Math.sin(a) * (gd.plaza.r + 10); if (Math.abs(x - gd.riverX(y)) < H0 - 6) add(x, y); }
    g.foam = foam;
    g.sparks = Array.from({ length: quality >= 2 ? 14 : quality === 1 ? 8 : 0 }, () => ({ x: 0, y: 0, t: 0, max: 0 }));
  }
  function buildLife(g) {
    g.smoke = [];
    g.birds = Array.from({ length: quality >= 2 ? 14 : quality === 1 ? 8 : 0 }, () => ({ x: 0, y: -999, z: 0, st: 2, t: Math.random() * 2, vx: 0, vy: 0, vz: 0, ph: 0 }));
  }

  // ---------- drawing a coin ----------
  const ONE = {};
  function drawCoin(spr, X, Y, z, R, opt = ONE) {
    const Rp = R * Z, alpha = opt.alpha === undefined ? 1 : opt.alpha, spin = opt.spin === undefined ? 1 : Math.max(.09, Math.abs(opt.spin)), sq = opt.squash || 0, lean = opt.lean || 0;
    if (!opt.noshadow) { ctx.globalAlpha = alpha * (opt.shadow === undefined ? 1 : opt.shadow); ctx.drawImage(Art.shadow(), X - Rp * 1.25, Y - Rp * .66 + 3, Rp * 2.5, Rp * 1.4); }
    ctx.globalAlpha = alpha;
    const kx = spin * (1 + sq * .24), ky = 1 - sq * .28, cy = -z * Z - sq * Rp * .03;
    ctx.setTransform(dpr, 0, -lean * dpr, dpr, dpr * X, dpr * Y);
    // One dark inked silhouette under the rim and face, so every coin pops off the ground.
    if (opt.ink !== false) { const w = Math.max(2.2, Rp * .085); ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(0, cy + Rp * .11 * ky, (Rp + w) * kx + 1, (Rp * .95 + w) * ky, 0, 0, TAU); ctx.fill(); }
    const re = Art.reed(opt.edge || '#6b4e28'), ke = Rp / re.R0;
    ctx.drawImage(re.c, -(re.R0 + 1) * ke * kx, cy - (re.ry + 1) * ke * ky, re.c.width * ke * kx, re.c.height * ke * ky);
    const k = Rp / spr.R;
    ctx.drawImage(spr.c, -spr.S * k * kx / 2, cy - spr.S * k * ky * .42, spr.S * k * kx, spr.S * k * ky * .84);
    if (opt.sheen >= 0 && opt.sheen < 1) {
      const fr = Art.sheen(), f = Rp / 44; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha * .5;
      ctx.drawImage(fr[Math.min(fr.length - 1, Math.floor(opt.sheen * fr.length))], -48 * f * kx, cy - 48 * f * ky * .84, 96 * f * kx, 96 * f * ky * .84);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (opt.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = opt.flash * .72 * alpha; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, cy, Rp * kx * .97, Rp * ky * .82, 0, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1;
    return Y - z * Z;
  }
  const bar = (x, y, w, h, f, col) => { ctx.fillStyle = 'rgba(6,20,18,.85)'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2); ctx.fillStyle = col; ctx.fillRect(x, y, w * f, h); };

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
      if (onScreen(c.x, c.y, 120)) { FX.ring(c.x, c.y, 90, TEAM[c.team], .45); FX.dust(c.x, c.y, 1.6); FX.coins(c.x, c.y, 3, { sp: 120, vz: 300, size: 8, life: .7 }); G.shake = Math.max(G.shake, 5); G.punch = Math.max(G.punch, .015); Sound.play('clink'); }
    }
  }
  function outroStart() {
    const o = G.outro; G.punch = .22; G.shake = 30; G.outroN = 0; G.outroB = 0;
    FX.ring(o.x, o.y, 460, '#ffd777', .95); FX.ring(o.x, o.y, 260, '#fff5c6', .6); FX.spark(o.x, o.y, 34, '#ffd777', 520, .8, 16, 60); FX.puff(o.x, o.y, 12, 1, 60, 1.2, 24, 120);
  }
  function outroTick(dt) {
    const o = G.outro;
    G.shake = Math.max(G.shake, 6 * (1 - o.t / 2.6));
    G.outroN += dt * (quality >= 2 ? 130 : quality === 1 ? 80 : 40);
    while (G.outroN >= 1) { G.outroN--; FX.coins(o.x, o.y, 1, { z: 70, spMin: 30, sp: 260, vzMin: 540, vz: 1180, size: 12, life: 1.7 }); }
    if ((G.outroB -= dt) <= 0) { G.outroB = .38; FX.ring(o.x, o.y, rnd(180, 340), '#ffd777', .55); FX.spark(o.x, o.y, 14, '#ffe69a', 420, .55, 13, 70); }
  }

  // ---------- camera ----------
  function camera(dt, a) {
    const me = G.me, p = pos(me, a); let tx = p.x, ty = p.y;
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
    if (!calm && G.shake > .1) { shX = (Math.random() - .5) * G.shake; shY = (Math.random() - .5) * G.shake; G.shake *= Math.exp(-dt * 9); }
    else { shX = shY = 0; G.shake = calm ? 0 : G.shake; }
  }

  // ---------- ground and water ----------
  function ground() {
    const gd = G.ground, gs = gd.scale;
    let sw = VW / Z * gs, sh = VH / Z * gs, x = (G.cam.x - VW / 2 / Z - shX / Z) * gs, y = (G.cam.y * TILT - VH / 2 / Z - shY / Z) * gs, dx = 0, dy = 0, dw = VW, dh = VH;
    const kX = dw / sw, kY = dh / sh;
    if (x < 0) { dx = -x * kX; dw += x * kX; sw += x; x = 0; }
    if (y < 0) { dy = -y * kY; dh += y * kY; sh += y; y = 0; }
    if (x + sw > gd.c.width) { const o = x + sw - gd.c.width; sw -= o; dw -= o * kX; }
    if (y + sh > gd.c.height) { const o = y + sh - gd.c.height; sh -= o; dh -= o * kY; }
    ctx.imageSmoothingEnabled = true;
    if (sw > 0 && sh > 0) ctx.drawImage(gd.c, x, y, sw, sh, dx, dy, dw, dh);
  }
  // Cartoon river: the bands are painted into the ground; only white shapes move, so there is no clipping or pattern fill.
  function water(dt) {
    const gd = G.ground, cx = G.cam.x, cy = G.cam.y, hw = VW / 2 / Z + 90, hh = VH / 2 / (Z * TILT) + 90;
    if (cx + hw < 1300 || cx - hw > 1900) return;
    const F = G.ground.flow, n = F.length - 1, t = G.t;
    for (const w of G.waves) {
      w.s += w.v * dt; if (w.s >= n) w.s -= n;
      const p = F[w.s | 0], x = p.x + p.nx * w.o, y = p.y + p.ny * w.o; if (Math.abs(x - cx) > hw || Math.abs(y - cy) > hh || !gd.water(x, y)) continue;
      const spr = Terrain.wave(w.k), l = Math.max(.08, Math.sin(t * .9 + w.ph) * .5 + .62) * Z, c = Math.cos(p.a) * l, s = Math.sin(p.a) * l;
      ctx.setTransform(dpr * c, dpr * s, -dpr * s, dpr * c, dpr * sx(x), dpr * sy(y)); ctx.drawImage(spr.c, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const f of G.foam) {
      if (Math.abs(f.x - cx) > hw || Math.abs(f.y - cy) > hh) continue;
      const spr = Terrain.foam(f.k), k = (.82 + Math.sin(t * 2.1 + f.ph) * .16) * Z, w = spr.w * k, h = spr.h * k;
      ctx.drawImage(spr.c, sx(f.x) - w / 2, sy(f.y) - h / 2, w, h);
    }
  }
  function waterSparkles(dt) {
    const cx = G.cam.x, cy = G.cam.y, hw = VW / 2 / Z + 40, hh = VH / 2 / (Z * TILT) + 40; if (cx + hw < 1300 || cx - hw > 1900) return;
    const F = G.ground.flow, spr = Terrain.spark(); ctx.globalCompositeOperation = 'lighter';
    for (const s of G.sparks) {
      s.t -= dt;
      if (s.t <= 0) { const p = F[Math.random() * F.length | 0], o = rnd(-.8, .8) * Terrain.HALF; s.x = p.x + p.nx * o; s.y = p.y + p.ny * o; s.max = s.t = rnd(.5, 1.1); if (Math.abs(s.x - cx) > hw || Math.abs(s.y - cy) > hh || !G.ground.water(s.x, s.y)) { s.t = rnd(.05, .2); s.max = 0; } continue; }
      if (!s.max) continue;
      const f = Math.sin(s.t / s.max * Math.PI), R = 13 * f * Z; ctx.globalAlpha = f * .95; ctx.drawImage(spr.c, sx(s.x) - R, sy(s.y) - R, R * 2, R * 2);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  // ---------- sky ----------
  // Multiply colours by time of day. Dawn is rose gold, dusk is ember and violet, night is deep blue. Nothing is ever lifted toward white.
  const SKY = [[0, 255, 182, 158], [.1, 255, 226, 192], [.22, 255, 253, 244], [.5, 255, 251, 236], [.6, 255, 216, 152], [.68, 255, 136, 112], [.76, 152, 112, 196], [.84, 50, 62, 150], [.95, 50, 62, 150], [1, 255, 182, 158]];
  const skyOut = { r: 255, g: 255, b: 255, dawn: 0, dusk: 0, night: 0, lights: 0, up: 0, low: 0 };
  function sky() {
    const p = (G.s.t / 780 + G.skyStart) % 1;
    for (let i = 0; i < SKY.length - 1; i++) if (p <= SKY[i + 1][0]) { const A = SKY[i], B = SKY[i + 1], t = (p - A[0]) / (B[0] - A[0]); skyOut.r = lerp(A[1], B[1], t); skyOut.g = lerp(A[2], B[2], t); skyOut.b = lerp(A[3], B[3], t); break; }
    const dDawn = Math.min(p, 1 - p);
    skyOut.dawn = clamp01(1 - dDawn / .14); skyOut.dusk = clamp01(1 - Math.abs(p - .68) / .1); skyOut.night = clamp01(1 - Math.abs(p - .89) / .1);
    const h = (G.hopeS - 50) / 50; skyOut.up = Math.max(0, h); skyOut.low = Math.max(0, -h);
    // High hope pulls the grade to clear gold; lost hope sinks it toward bruised violet. The floor keeps the fight readable.
    const up = skyOut.up * .6 * (1 - skyOut.night * .65), low = skyOut.low;
    skyOut.r = Math.max(50, lerp(skyOut.r, 255, up) * (1 - low * .3)); skyOut.g = Math.max(56, lerp(skyOut.g, 240, up) * (1 - low * .46)); skyOut.b = Math.max(118, lerp(skyOut.b, 186, up) * (1 - low * .12));
    skyOut.lights = clamp01((1 - (skyOut.r * .3 + skyOut.g * .59 + skyOut.b * .11) / 255) / .3);
    return skyOut;
  }

  function weather(dt, sk) {
    G.rainNext -= dt;
    if (G.rainNext <= 0) { G.rainT = 32 + Math.random() * 18; G.rainNext = G.rainT + 90 + Math.random() * 60; }
    if (G.rainT > 0) G.rainT -= dt;
    // Hope owns the weather: high hope clears the sky, low hope brings a storm that overrides the schedule.
    const opening = G.villain ? clamp01(1 - G.s.t / 70) * .7 : 0, storm = clamp01((sk.low - .2) / .5), passing = (G.rainT > 0 ? 1 : 0) * (1 - clamp01(sk.up / .35));
    const target = Math.max(storm, opening, passing), rate = target > G.rain ? .35 : .25;
    G.rain += clamp01(rate * dt / Math.max(.001, Math.abs(target - G.rain))) * (target - G.rain);
    G.bolt = Math.max(0, G.bolt - dt * 3.2);
    if (G.rain > .5 && dt > 0 && Math.random() < dt * .05) {
      G.bolt = 1; G.thunderIn = rnd(.2, .55);
      const pts = []; let x = rnd(VW * .1, VW * .9), y = -10; const ground_ = rnd(VH * .55, VH * .9);
      while (y < ground_) { pts.push(x, y); x += rnd(-36, 36); y += rnd(22, 54); }
      pts.push(x, ground_); G.boltPts = pts;
    }
    if (G.thunderIn > 0 && (G.thunderIn -= dt) <= 0) Sound.play('thunder');
    if (G.rain > .02 && dt > 0 && G.ripples.length < 60) {
      const k = G.rain * dt * (quality >= 2 ? 90 : 40), hw = VW / 2 / Z, hh = VH / 2 / (Z * TILT);
      let n = Math.floor(k) + (Math.random() < k % 1 ? 1 : 0);
      while (n-- > 0) { const x = G.cam.x + rnd(-hw, hw), y = G.cam.y + rnd(-hh, hh), gm = G.s.map, i = x / 40 | 0, j = y / 40 | 0; if (x < 0 || y < 0 || i >= gm.cols || j >= gm.rows || gm.grid[j * gm.cols + i]) continue; const wet = G.ground.water(x, y); G.ripples.push({ x, y, t: wet ? .55 : .32, max: wet ? .55 : .32, wet }); }
    }
  }

  function groundWeather(dt, sk) {
    // rain rings on the ground
    if (G.ripples.length) {
      ctx.lineWidth = 1.1;
      for (let i = G.ripples.length - 1; i >= 0; i--) {
        const r = G.ripples[i]; r.t -= dt; if (r.t <= 0) { G.ripples[i] = G.ripples[G.ripples.length - 1]; G.ripples.pop(); continue; }
        const f = r.t / r.max, R = (r.wet ? 24 : 10) * (1 - f) * Z + 1, X = sx(r.x), Y = sy(r.y);
        if (r.wet) { ctx.strokeStyle = 'rgba(224,244,250,.55)'; ctx.globalAlpha = f; ctx.beginPath(); ctx.ellipse(X, Y, R, R * TILT, 0, 0, TAU); ctx.stroke(); }
        else { ctx.fillStyle = 'rgba(214,232,240,.55)'; ctx.globalAlpha = f * .85; ctx.fillRect(X - R, Y - .5, R * .7, 1.1); ctx.fillRect(X + R * .3, Y - .5, R * .7, 1.1); ctx.fillRect(X - .5, Y - R * .55, 1.1, R * .4); }
      }
      ctx.globalAlpha = 1;
    }
  }

  // Comic cloud shadows slide over the ground, under the units, so coins always stay bright.
  function clouds(dt, sk) {
    if (quality < 1) return;
    const a = (.13 + G.rain * .17 + sk.low * .13) * (1 - sk.up * .85) * (1 - sk.night * .8);
    for (const c of G.clouds) {
      c.x += c.v * dt; if (c.x > Sim.W + c.r) c.x = -c.r;
      const R = c.r * Z; if (a < .01 || !onScreen(c.x, c.y, R + 40)) continue;
      ctx.globalAlpha = a; ctx.drawImage(Terrain.cloudShadow(c.k).c, sx(c.x) - R, sy(c.y) - R * .5, R * 2, R);
    }
    ctx.globalAlpha = 1;
  }

  function driftLeaves(dt) {
    if (quality < 1) return;
    const hw = VW / 2 / Z + 40, hh = VH / 2 / (Z * TILT) + 60, cx = G.cam.x, cy = G.cam.y, n = quality >= 2 ? G.drift.length : 6;
    for (let i = 0; i < n; i++) {
      const d = G.drift[i]; d.p += dt; d.x += (60 + Math.sin(d.p) * 34) * dt; d.y += Math.cos(d.p * .7) * 20 * dt; d.rot += dt * 2.4;
      if (d.x > cx + hw || d.x < cx - hw || d.y > cy + hh || d.y < cy - hh) { d.x = cx - hw + 2; d.y = cy + rnd(-hh, hh); }
      const X = sx(d.x), Y = sy(d.y) - d.z * Z, c = Math.cos(d.rot) * Z, sn = Math.sin(d.rot) * Z;
      ctx.setTransform(dpr * c, dpr * sn, -dpr * sn, dpr * c, dpr * X, dpr * Y); ctx.drawImage(Art.leaf(d.col), -8, -5);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---------- lighting ----------
  // The grade is a low-res lightmap multiplied over the frame: lights reveal true colour instead of adding white, so nothing bleaches.
  let LM = null, LX = null, LK = 0;
  function pool(x, y, z, r, col, a) {
    const R = r * Z, X = sx(x), Y = sy(y) - z * Z; if (X < -R || X > VW + R || Y < -R || Y > VH + R) return;
    LX.globalAlpha = a; LX.drawImage(Terrain.pool(col), X - R, Y - R * .76, R * 2, R * 1.52);
  }
  function grade(a, sk) {
    const rain = G.rain, r = sk.r * (1 - rain * .3) | 0, g = sk.g * (1 - rain * .24) | 0, b = sk.b * (1 - rain * .05) | 0;
    const storm = clamp01(Math.max(rain * .9, sk.low * .85)), col = `rgb(${r},${g},${b})`;
    if (sk.lights < .03 && storm < .03) { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = col; ctx.fillRect(0, 0, VW, VH); ctx.globalCompositeOperation = 'source-over'; return; }
    const k = quality >= 2 ? 4 : quality === 1 ? 5 : 8, w = Math.ceil(VW / k) + 1, h = Math.ceil(VH / k) + 1;
    if (!LM || LK !== k || LM.width !== w || LM.height !== h) { LM = Art.cv(w, h); LX = LM.getContext('2d'); LK = k; }
    LX.setTransform(1, 0, 0, 1, 0, 0); LX.globalAlpha = 1; LX.globalCompositeOperation = 'source-over'; LX.fillStyle = col; LX.fillRect(0, 0, w, h);
    if (storm >= .03) { LX.globalCompositeOperation = 'multiply'; LX.globalAlpha = storm; LX.drawImage(Terrain.ramp(['#7a5ac8', '#d8c8f0', '#9fd8a0']), 0, 0, w, h); }
    LX.globalCompositeOperation = 'lighter';
    // Comic sun rays at dawn and dusk, hard-edged, part of the grade.
    const rays = Math.max(sk.dawn, sk.dusk) * (1 - G.rain);
    if (rays > .04 && quality >= 1) {
      const c = Math.cos(.5), s = Math.sin(.5); LX.fillStyle = sk.dusk > sk.dawn ? '#ffc070' : '#fff0c0';
      for (let i = 0; i < 4; i++) { const X = VW * (.15 + i * .25) + Math.sin(G.t * .13 + i * 2.3) * 60, W = 110 + i * 34; LX.globalAlpha = rays * (.17 + Math.sin(G.t * .4 + i) * .05); LX.setTransform(c / k, s / k, -s / k, c / k, X / k, -40 / k); LX.fillRect(-W / 2, 0, W, VH * 1.7); }
    }
    LX.setTransform(1 / k, 0, 0, 1 / k, 0, 0);
    // Daytime storms keep their mood: lamps still burn, but the pools no longer lift the whole scene back to bright.
    const n = sk.lights * (1 - .55 * storm * (1 - sk.night)), st = G.s, me = G.me;
    if (n > .03) {
      for (const t of st.towers) if (t.alive) { const v = artOf(t); pool(t.x, t.y, v.n * v.R * STEP * .6, t.sub === 'core' ? 330 : 260, TEAM[t.team], .62 * n); }
      for (const d of G.lamps) { if (!onScreen(d.x, d.y, d.light.r * Z)) continue; const fl = .92 + Math.sin(G.t * 7 + d.ph) * .06 + Math.sin(G.t * 13.3 + d.ph * 2) * .04; pool(d.x, d.y, d.light.z, d.light.r, d.light.col, Math.min(1, d.light.a * 1.5) * n * fl); }
      if (litNow > .05) for (const d of G.houses) if (onScreen(d.x, d.y, 120)) pool(d.x, d.y, 46, 118, d.spr.glass, .7 * n * litNow);
      pool(1600, 950, 10, 330, '#ffd27a', .34 * n);
      // Units carry their own light, so they keep their full colour at night.
      const c0 = pos(me, a); pool(c0.x, c0.y, 0, 470, '#ffe9c4', .36 * n);
      for (const c of st.champs) if (c.alive && Sim.canSee(st, me.team, c)) { const q = pos(c, a); pool(q.x, q.y, 24, 150, c === me ? '#fff2d0' : TEAM[c.team], .75 * n); }
      if (quality >= 1) for (const m of st.minions) { if (m.alive === false || m.delay > 0) continue; const q = pos(m, a); if (onScreen(q.x, q.y, 80)) pool(q.x, q.y, 16, 76, '#fff0d8', .55 * n); }
    }
    ctx.imageSmoothingEnabled = true; ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(LM, 0, 0, VW, VH); ctx.globalCompositeOperation = 'source-over';
  }
  function rainStreaks(dt) {
    if (G.rain <= .01) return;
    const n = Math.floor((quality >= 2 ? 170 : quality === 1 ? 90 : 44) * G.rain), d = G.drops;
    while (d.length < n) d.push({ x: Math.random() * VW * 1.2, y: Math.random() * VH, v: 0, near: Math.random() < .35 });
    const col = 'rgba(224,214,255,';
    for (const near of [false, true]) {
      ctx.beginPath(); const sp = near ? 1500 : 960, len = near ? 24 : 12;
      for (let i = 0; i < n; i++) {
        const p = d[i]; if (p.near !== near) continue;
        p.y += sp * dt * (.9 + (i % 5) * .05); p.x -= sp * .12 * dt;
        if (p.y > VH + 10) { p.y = -24; p.x = Math.random() * VW * 1.2; }
        if (p.x < -20) p.x = VW * 1.1;
        ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + len * .16, p.y - len);
      }
      ctx.strokeStyle = col + (near ? .52 : .24) + ')'; ctx.lineWidth = near ? 2 : 1.1; ctx.stroke();
    }
  }
  // Night brings fireflies; high hope fills the air with golden motes. Both are small and sit above the grade.
  function fireflies(dt, sk) {
    const gold = sk.up * (1 - sk.night) * (1 - G.rain), al0 = Math.max(sk.night, gold); if (al0 < .05 || quality < 1) return;
    const hw = VW / 2 / Z + 40, hh = VH / 2 / (Z * TILT) + 40, night = sk.night > gold, sp = night ? Art.glow('#d9f79e') : Terrain.spark().c, n = quality >= 2 ? G.motes.length : 12; ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const m = G.motes[i]; m.p += dt; m.x += Math.sin(m.p * .9 + i) * 20 * dt; m.y += Math.cos(m.p * .7 + i * 2) * 18 * dt;
      if (Math.abs(m.x - G.cam.x) > hw || Math.abs(m.y - G.cam.y) > hh) { m.x = G.cam.x + rnd(-hw, hw); m.y = G.cam.y + rnd(-hh, hh); }
      const r = night ? 7 : 6; ctx.globalAlpha = al0 * (.3 + .7 * Math.max(0, Math.sin(m.p * 2.4 + i)));
      ctx.drawImage(sp, sx(m.x) - r, sy(m.y) - 34 * Z - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  function lightning() {
    if (G.bolt <= 0) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(214,206,255,${G.bolt * .2})`; ctx.fillRect(0, 0, VW, VH);
    if (G.boltPts && G.bolt > .35) {
      const p = G.boltPts; ctx.beginPath(); ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
      ctx.lineCap = 'round'; ctx.lineJoin = 'miter'; ctx.strokeStyle = `rgba(190,120,255,${G.bolt * .85})`; ctx.lineWidth = 9; ctx.stroke(); ctx.strokeStyle = `rgba(190,255,150,${G.bolt})`; ctx.lineWidth = 5; ctx.stroke(); ctx.strokeStyle = `rgba(255,255,255,${G.bolt})`; ctx.lineWidth = 2.4; ctx.stroke(); ctx.lineJoin = 'round';
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------- civilian sites ----------
  const CIV_AT = [[-46, -28], [30, -38], [-12, 2], [52, 14], [-58, 26]].sort((p, q) => p[1] - q[1]);
  function siteRings() {
    const list = G.s.sites; if (!list) return;
    for (const c of list) {
      if (!onScreen(c.x, c.y, 200)) continue;
      const X = sx(c.x), Y = sy(c.y), R = 130 * Z, Ry = R * TILT, need = c.need || 1;
      const lead = !c.prog ? -1 : c.prog[0] > c.prog[1] ? 0 : c.prog[1] > c.prog[0] ? 1 : -1, busy = c.alive && lead >= 0;
      // tinted floor, so the capture area reads at a glance
      ctx.fillStyle = busy ? TEAM[lead] : '#ffe9a8'; ctx.globalAlpha = c.alive ? (busy ? .26 + Math.sin(G.t * 9) * .08 : .14) : .05;
      ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = c.alive ? 1 : .35;
      ctx.strokeStyle = INK; ctx.lineWidth = 6.5; ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, 0, TAU); ctx.stroke();
      ctx.strokeStyle = '#fff3cc'; ctx.lineWidth = 3.4; ctx.setLineDash([12 * Z + 3, 8 * Z + 2]); ctx.lineDashOffset = -G.t * 14;
      ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.globalAlpha = 1;
      if (!c.alive || !c.prog) continue;
      const top = -Math.PI / 2, a0 = pct(c.prog[0], need), a1 = pct(c.prog[1], need); ctx.lineCap = 'round';
      const arc = (col, f, ccw) => { if (f <= 0) return; const end = top + (ccw ? -f : f) * TAU; ctx.strokeStyle = INK; ctx.lineWidth = 12; ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, top, end, ccw); ctx.stroke(); ctx.strokeStyle = col; ctx.lineWidth = 7.5; ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, top, end, ccw); ctx.stroke(); };
      arc(TEAM[0], a0, false); arc(TEAM[1], a1, true); ctx.lineCap = 'butt';
    }
  }
  function drawCivilians(c) {
    const contested = c.prog && (c.prog[0] > 0 || c.prog[1] > 0), sp = contested ? 2.2 : 1;
    CIV_AT.forEach(([ox, oy], i) => {
      const spr = Art.civCoin((i + c.id) % 4), wx = c.x + ox, wy = c.y + oy, X = sx(wx), Y = sy(wy), ph = G.t * 3.4 * sp + i * 1.7 + c.id, z = (5 + Math.abs(Math.sin(ph)) * 9) * Z, w = 20 * Z / spr.R * spr.S, side = i % 2 ? 1 : -1;
      ctx.drawImage(Art.shadow(), X - w * .42, Y - w * .2, w * .84, w * .4);
      const wave = Math.sin(G.t * 9 * sp + i * 2) * 4 * Z, hx = X + side * w * .36, hy = Y - z - w * .3;
      ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 5 * Z; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + side * 6 * Z + wave, hy - 15 * Z); ctx.stroke();
      ctx.strokeStyle = '#f2c9a0'; ctx.lineWidth = 2.4 * Z; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + side * 6 * Z + wave, hy - 15 * Z); ctx.stroke();
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(hx + side * 6 * Z + wave, hy - 17 * Z, 4.6 * Z, 0, TAU); ctx.fill(); ctx.fillStyle = '#f2c9a0'; ctx.beginPath(); ctx.arc(hx + side * 6 * Z + wave, hy - 17 * Z, 3 * Z, 0, TAU); ctx.fill();
      ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(X, Y - z - w * .04, w * .4, w * .37, 0, 0, TAU); ctx.fill();
      ctx.drawImage(spr.c, X - w / 2, Y - z - w * .46, w, w * .92);
    });
    // A call for help over the group, bobbing faster when someone is taking the site.
    const b = Terrain.bubble(), bob = Math.abs(Math.sin(G.t * 3 * sp + c.id)) * 7 * Z, bw = b.w * Z * .9, bh = b.h * Z * .9;
    ctx.drawImage(b.c, sx(c.x) - bw / 2, sy(c.y) - (74 * Z) - bh - bob, bw, bh);
  }

  // ---------- per-frame unit state ----------
  function tickVis(u, v, p, dt, sp, ms) {
    v.flash = Math.max(0, v.flash - dt * 8); v.spin = Math.max(0, v.spin - dt * 2.7); v.squash = Math.max(0, v.squash - dt * 5.5);
    const d = Math.exp(-dt * 13); v.rx *= d; v.ry *= d;
    const moving = sp > 20, nx = moving && u.vx ? u.vx / sp : 0;
    v.lean += (clamp01(sp / ms) * nx * .42 - v.lean) * (1 - Math.exp(-dt * 11));
    const before = Math.floor(v.hop / Math.PI);
    v.hop += dt * (moving ? 9.5 : 1.3);
    const landed = moving && Math.floor(v.hop / Math.PI) !== before;
    if (landed) v.squash = Math.max(v.squash, 1);
    if (v.sheen < 1) v.sheen += dt * (v.sheen < 0 ? 1 : 2.2); else v.sheen = -rnd(3, 7);
    return landed;
  }

  function tickChamp(c, a, dt) {
    const v = visOf(c), p = pos(c, a), sp = Math.hypot(c.vx || 0, c.vy || 0), me = G.me;
    const landed = tickVis(c, v, p, dt, sp, c.msBase || 300);
    if (!c.alive) { v.lx = undefined; v.br = -1; return v; }
    if (dt > 0 && v.lx !== undefined) { const d = Math.hypot(p.x - v.lx, p.y - v.ly); if (d > 120 && d < 1300 && Sim.canSee(G.s, me.team, c)) FX.ghostLine(spriteOf(c), drawR(c) * SIZE_CHAMP, v.lx, v.ly, p.x, p.y); }
    v.lx = p.x; v.ly = p.y;
    if (dt > 0 && (c.dash || c.leap) && Sim.canSee(G.s, me.team, c)) { if ((v.ghostT -= dt) <= 0) { v.ghostT = .036; FX.ghost(spriteOf(c), drawR(c) * SIZE_CHAMP, p.x, p.y, 16 + (c.z || 0)); } }
    if (dt > 0 && c.inBrush !== v.br) {
      if (c.inBrush >= 0 && Sim.canSee(G.s, me.team, c) && onScreen(p.x, p.y, 60)) { FX.leaves(p.x, p.y, 7); const bo = G.brushes[c.inBrush]; if (bo) bo.shake = 1; }
      v.br = c.inBrush;
    }
    if (landed && onScreen(p.x, p.y, 60) && !c.air) {
      if (G.ground.water(p.x, p.y)) FX.splash(p.x, p.y, 1); else if (Sim.canSee(G.s, me.team, c)) FX.dust(p.x, p.y, 1);
    }
    return v;
  }

  function tickMinion(m, a, dt) {
    const v = visOf(m), p = pos(m, a), sp = Math.hypot(m.vx || 0, m.vy || 0), landed = tickVis(m, v, p, dt, sp, m.ms || 215);
    if (landed && onScreen(p.x, p.y, 40) && quality >= 1 && Math.random() < .5) { if (G.ground.water(p.x, p.y)) FX.splash(p.x, p.y, .6); else FX.dust(p.x, p.y, .7); }
    return v;
  }

  // ---------- draw entries ----------
  const DL = []; let dn = 0;
  function push(y, k, o, px, py, v) { const e = DL[dn] || (DL[dn] = { y: 0, k: 0, o: null, px: 0, py: 0, v: null }); dn++; e.y = y; e.k = k; e.o = o; e.px = px; e.py = py; e.v = v; }

  let litNow = 1, litGrade = 0;
  function drawDecor(o, me, dt) {
    const X = sx(o.x), Y = sy(o.y), spr = o.spr;
    if (o.fade && me.alive) {
      const rear = o.y - me.y > 0 && o.y - me.y < o.tall / TILT && Math.abs(me.x - o.x) < o.half;
      o.al += ((rear ? .42 : 1) - o.al) * (1 - Math.exp(-dt * 9));
      ctx.globalAlpha = o.al;
    }
    if (o.kind === 1) {
      const sh = o.sway ? Math.sin(G.t * 2.6 + o.ph) * .16 : Math.sin(G.t * 1.9 + o.ph) * .04, img = spr.frames ? spr.frames[Math.floor(G.t * 7 + o.ph) % spr.frames.length] : spr.c, lift = (o.z || 0) * Z;
      ctx.setTransform(dpr * Z, 0, -dpr * Z * sh, dpr * Z, dpr * X, dpr * (Y - lift)); ctx.drawImage(img, -spr.ax, -spr.ay, spr.w, spr.h); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    } else ctx.drawImage(spr.c, X - spr.ax * Z, Y - spr.ay * Z, spr.w * Z, spr.h * Z);
    if (spr.L && o.kind >= 2) {
      const on = o.kind === 3 ? 1 : litNow;
      if (on > .02) { const al = ctx.globalAlpha; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = al * on * (.28 + litGrade * .72) * (.86 + Math.sin(G.t * 2.3 + o.ph) * .1); ctx.drawImage(spr.L, X - spr.ax * Z, Y - spr.ay * Z, spr.w * Z, spr.h * Z); ctx.globalCompositeOperation = 'source-over'; }
    }
    ctx.globalAlpha = 1;
  }
  function drawWall(w) { const sp = w.spr, wl = w.w; ctx.drawImage(sp.c, sx(wl.x) - sp.P * Z, sy(wl.y) - (sp.lift + sp.P) * Z, sp.w * Z, sp.h * Z); }
  function drawBrush(o, me, dt) {
    const sp = o.spr, b = o.b, inside = me.alive && me.inBrush === o.i;
    o.fade += ((inside ? .42 : 1) - o.fade) * (1 - Math.exp(-dt * 10));
    o.shake = Math.max(0, o.shake - dt * 1.9);
    const shear = Math.sin(G.t * 1.5 + o.i) * .018 + Math.sin(G.t * 26) * o.shake * .09;
    ctx.globalAlpha = o.fade; ctx.setTransform(dpr * Z, 0, -dpr * Z * shear, dpr * Z, dpr * sx(b.x), dpr * sy(b.y));
    ctx.drawImage(sp.c, -sp.ax, -sp.ay, sp.w, sp.h); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1;
  }
  function drawChamp(c, v, px, py, a, me) {
    const X = sx(px + v.rx), Y = sy(py + v.ry), sp = Math.hypot(c.vx || 0, c.vy || 0), moving = sp > 20, hopH = moving ? 15 : 2;
    const izf = introZ(c), air = Math.abs(Math.sin(v.hop)), z = 14 + air * hopH + (c.z || 0) + izf, R = drawR(c) * SIZE_CHAMP;
    const spin = v.spin > 0 ? Math.cos(v.spin * TAU) : 1, ringR = (R + 11) * Z, col = c === me ? '#ffe27a' : TEAM[c.team];
    // Team ring: a tinted floor, an inked band and a bright core stroke.
    ctx.fillStyle = col; ctx.globalAlpha = .3; ctx.beginPath(); ctx.ellipse(X, Y, ringR, ringR * TILT, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = INK; ctx.lineWidth = c === me ? 7.5 : 6.5; ctx.beginPath(); ctx.ellipse(X, Y, ringR, ringR * TILT, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = c === me ? 4 : 3.2; ctx.beginPath(); ctx.ellipse(X, Y, ringR, ringR * TILT, 0, 0, TAU); ctx.stroke();
    if (c.tier >= 3) { const gl = Art.glow(AURA[c.tier]), r = (62 + (c.tier - 3) * 7) * Z; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .3 + Math.sin(G.t * 3 + v.phase) * .09; ctx.drawImage(gl, X - r, Y - z * Z - r, r * 2, r * 2); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
    const alpha = c.inBrush >= 0 ? (c.team === me.team ? .78 : 1) : 1;
    const top = drawCoin(spriteOf(c), X, Y, z, R, { spin, flash: v.flash, alpha, lean: v.lean, squash: v.squash - (moving ? air * .2 : 0), sheen: v.sheen, shadow: clamp01(1 - izf / 900) });
    if (c.tier === 5 && quality >= 1) { ctx.globalCompositeOperation = 'lighter'; const gl = Art.glow('#ecdcff'); for (let i = 0; i < 3; i++) { const an = G.t * 2.6 + i * TAU / 3, r = 7 * Z; ctx.drawImage(gl, X + Math.cos(an) * 44 * Z - r, top + Math.sin(an) * 26 * Z - r, r * 2, r * 2); } ctx.globalCompositeOperation = 'source-over'; }
    if (c.parryT > 0) { ctx.strokeStyle = '#fff5c6'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(X, top, 46 * Z, 40 * Z, 0, 0, TAU); ctx.stroke(); }
    if (c.markT > 0) { ctx.save(); ctx.translate(X, top); ctx.rotate(G.t * 2); ctx.strokeStyle = '#ff9de2'; ctx.lineWidth = 3; for (let i = 0; i < 3; i++) { ctx.rotate(TAU / 3); ctx.beginPath(); ctx.arc(0, 0, 44 * Z, 0, 1.1); ctx.stroke(); } ctx.restore(); }
    if (c.stunT > 0) for (let i = 0; i < 3; i++) { const an = G.t * 7 + i * TAU / 3; ctx.fillStyle = '#ffe89e'; ctx.beginPath(); ctx.arc(X + Math.cos(an) * 26 * Z, top - 38 * Z + Math.sin(an) * 7, 3.6, 0, TAU); ctx.fill(); }
    if (c.chan && c.chan.recall) { ctx.strokeStyle = TEAM[c.team]; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(X, top, 46 * Z, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - c.chan.t / c.chan.total)); ctx.stroke(); }
    if (c.echo && c.recast[1] > 0 && c.team === me.team) drawCoin(spriteOf(c), sx(c.echo.x), sy(c.echo.y), 14, R, { alpha: .4 });
  }

  // A stack of real coins with a crown piece. The stack loses coins as HP falls and the crown rides it down.
  function drawTower(t, v) {
    const art = artOf(t), n = art.n, R = art.R, shown = Math.max(1, Math.ceil(n * pct(t.hp, t.maxHp))), core = t.sub === 'core';
    const X = sx(t.x), Y = sy(t.y), k = Z, step = R * STEP * k, open = Sim.towerOpen(G.s, t), d = Terrain.towerCoin(t.team, R);
    ctx.fillStyle = 'rgba(8,30,50,.42)'; ctx.beginPath(); ctx.ellipse(X + 6 * k, Y + 8 * k, R * 1.42 * k, R * .78 * k, 0, 0, TAU); ctx.fill();
    for (let i = 0; i < shown; i++) { const taper = 1 - i / n * .17, q = k * taper, off = Math.sin(i * 7.3) * 2.2 * k; ctx.drawImage(d.c, X - d.cx * q + off, Y - d.cy * q - i * step, d.w * q, d.h * q); }
    const topY = Y - (shown - 1) * step, crown = Terrain.towerCrown(t.team, core), bob = Math.sin(G.t * 2 + t.x) * 2.5 * k;
    ctx.drawImage(crown.c, X - crown.ax * k, topY - crown.ay * k - d.cy * .16 * k + bob, crown.w * k, crown.h * k);
    if (v.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = v.flash * .5; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(X, Y - shown * step * .5, R * k, (shown * step + R * k * .7) * .55, 0, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
    // Team glow behind the crown: above the units' heads, so it can't wash anyone out.
    const gl = Art.glow(t.team ? '#8dff2a' : '#ffe27a'), gr = (core ? 70 : 54) * k, gy = topY - (core ? 84 : 60) * k; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = open ? .6 + Math.sin(G.t * 3) * .15 : .3; ctx.drawImage(gl, X - gr, gy - gr, gr * 2, gr * 2); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    if (core) drawCoin(Art.coin('corecoin' + t.team, 56, 'boss', Art.METAL['minion' + t.team], t.team, 3), X, topY - 112 * k, 0, 34, { spin: Math.cos(G.t * 1.3), noshadow: true, edge: '#8a5d0c' });
  }
  function tickTower(t, dt) {
    const v = visOf(t), art = artOf(t); v.flash = Math.max(0, v.flash - dt * 8);
    const shown = Math.ceil(art.n * pct(t.hp, t.maxHp));
    if (v.stack < 0) v.stack = shown;
    if (shown < v.stack) { if (onScreen(t.x, t.y, 200)) for (let i = shown; i < v.stack; i++) FX.popCoin(t.team, t.x, t.y, 20 + i * art.R * STEP); }
    v.stack = shown;
  }

  // ---------- ambient life ----------
  function placeBird(b) {
    const m = G.s.map, hw = VW / 2 / Z, hh = VH / 2 / (Z * TILT);
    for (let i = 0; i < 6; i++) {
      const sd = Math.random() < .5 ? -1 : 1, x = G.cam.x + sd * rnd(hw * .25, hw + 90), y = G.cam.y + rnd(-hh - 40, hh + 40), ci = x / 40 | 0, cj = y / 40 | 0;
      if (x < 60 || y < 60 || x > Sim.W - 60 || y > Sim.H - 60 || ci < 0 || cj < 0 || ci >= m.cols || cj >= m.rows || m.grid[cj * m.cols + ci] || G.ground.water(x, y) || Terrain.nearRoad(m, x, y) < 124) continue;
      b.x = x; b.y = y; b.z = 0; b.st = 0; b.t = rnd(4, 16); b.ph = Math.random() * 6; return;
    }
    b.st = 2; b.t = rnd(1, 3);
  }
  function tickBirds(dt) {
    const hw = VW / 2 / Z + 150, hh = VH / 2 / (Z * TILT) + 150;
    for (const b of G.birds) {
      if (b.st === 2) { if ((b.t -= dt) <= 0) placeBird(b); continue; }
      if (b.st === 0) {
        b.t -= dt; let scare = b.t <= 0;
        if (!scare) for (const c of G.s.champs) if (c.alive && Math.hypot(c.x - b.x, c.y - b.y) < 150) { scare = true; break; }
        if (scare) { const a = Math.random() * TAU; b.st = 1; b.vx = Math.cos(a) * 190; b.vy = Math.sin(a) * 120; b.vz = 150; }
        else if (Math.abs(b.x - G.cam.x) > hw || Math.abs(b.y - G.cam.y) > hh) placeBird(b);
        continue;
      }
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.z > 620 || Math.abs(b.x - G.cam.x) > hw + 200 || Math.abs(b.y - G.cam.y) > hh + 200) placeBird(b);
    }
  }
  function drawBirds(state) {
    for (const b of G.birds) {
      if (b.st !== state) continue;
      const X = sx(b.x), Y = sy(b.y) - b.z * Z; if (X < -40 || X > VW + 40 || Y < -40 || Y > VH + 40) continue;
      const peck = state === 0 ? Math.max(0, Math.sin(G.t * 5 + b.ph)) * 3 * Z : 0, spr = Terrain.bird(state === 1 ? Math.floor(G.t * 14 + b.ph) & 1 : 1), w = spr.w * Z * .85, h = spr.h * Z * .85;
      if (state === 1) { ctx.fillStyle = 'rgba(8,30,50,.3)'; ctx.beginPath(); ctx.ellipse(X, sy(b.y), 10 * Z, 4 * Z, 0, 0, TAU); ctx.fill(); }
      ctx.drawImage(spr.c, X - w / 2, Y - h + peck, w, h);
    }
  }
  function tickSmoke(dt) {
    if (quality < 1 || dt <= 0) return;
    const dark = clamp01((34 - G.hopeS) / 20);
    for (const d of G.houses) { if (!onScreen(d.x, d.y, 120)) continue; d.smk -= dt * (.7 + dark * 1.4); if (d.smk <= 0 && G.smoke.length < 48) { d.smk = rnd(1, 2.1); G.smoke.push({ x: d.x + d.spr.chimX, y: d.y, z: d.spr.chimZ, t: 0, max: rnd(2.2, 3.4), dark: Math.random() < dark, ph: Math.random() * 6 }); } }
    for (let i = G.smoke.length - 1; i >= 0; i--) { const s = G.smoke[i]; s.t += dt; s.z += dt * 34; if (s.t >= s.max) { G.smoke[i] = G.smoke[G.smoke.length - 1]; G.smoke.pop(); } }
  }
  function drawSmoke() {
    for (const s of G.smoke) {
      const f = s.t / s.max, spr = Terrain.smoke(s.dark), R = (9 + f * 26) * Z, X = sx(s.x + Math.sin(s.t * 1.3 + s.ph) * 10 + f * 16), Y = sy(s.y) - s.z * Z;
      ctx.globalAlpha = f > .65 ? (1 - f) / .35 * .92 : .92; ctx.drawImage(spr.c, X - R, Y - R, R * 2, R * 2);
    }
    ctx.globalAlpha = 1;
  }

  const BARS = [], VIS_CHAMPS = [];
  function hpBars(a) {
    const me = G.me;
    ctx.textBaseline = 'middle';
    for (const b of BARS) {
      const u = b.u, X = sx(b.px), Y = sy(b.py) - (u.z || 0) * Z, f = pct(u.hp, u.maxHp);
      if (u.kind === 'champ') {
        const w = 70 * Z, x = X - w / 2, y = Y - 90 * Z, v = b.v; v.hpLag = Math.max(f, v.hpLag - .018);
        ctx.fillStyle = 'rgba(6,20,18,.85)'; ctx.fillRect(x - 1, y - 1, w + 2, 8.5); ctx.fillStyle = u === me ? '#8ee07f' : u.team === me.team ? '#58a6e6' : '#e4573f'; ctx.fillRect(x, y, w * f, 6.5);
        if (v.hpLag > f) { ctx.fillStyle = 'rgba(255,240,200,.85)'; ctx.fillRect(x + w * f, y, w * (v.hpLag - f), 6.5); }
        ctx.fillStyle = '#fff6e2'; ctx.font = '700 12px "Barlow Semi Condensed",sans-serif'; ctx.textAlign = 'right'; ctx.fillText(u.lvl, x - 3, y + 3);
        if (u !== me) { ctx.textAlign = 'left'; ctx.font = '600 11.5px "Barlow Semi Condensed",sans-serif'; ctx.fillStyle = 'rgba(255,246,226,.85)'; ctx.fillText(Sim.charOf ? Sim.charOf(u.team, u.champ).name : Sim.KITS[u.champ].name, x, y - 7); }
      } else if (u.kind === 'tower') {
        const art = artOf(u), open = Sim.towerOpen(G.s, u), y = Y - (art.n * art.R * STEP + art.crown) * Z;
        if (u.hp < u.maxHp || open) bar(X - 42 * Z, y, 84 * Z, 6, f, open ? (u.team === me.team ? '#58a6e6' : '#e4573f') : 'rgba(170,180,175,.7)');
      } else if (u.hp < u.maxHp) {
        if (u.kind === 'minion') bar(X - 20 * Z, Y - 52 * Z, 40 * Z, 3.5, f, u.team === me.team ? '#58a6e6' : '#e4573f');
        else { const r = drawR(u); bar(X - r * Z, Y - (r + 34) * Z, r * 2 * Z, u.boss ? 7 : 4, f, '#e0b552'); }
      }
    }
  }

  function minionRing(u, X, Y) {
    const R = drawR(u) * SIZE_MINION * 1.16 * Z, col = TEAM[u.team];
    ctx.strokeStyle = INK; ctx.lineWidth = 4.2; ctx.beginPath(); ctx.ellipse(X, Y, R, R * TILT, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.ellipse(X, Y, R, R * TILT, 0, 0, TAU); ctx.stroke();
  }

  // ---------- the frame ----------
  function render(dt) {
    if (G.s.hope !== undefined) G.hopeS += (G.s.hope - G.hopeS) * (1 - Math.exp(-dt * 1.2));
    const s = G.s, me = G.me, a = Math.min(1, G.acc / DT), wdt = G.intro > 0 || G.outro ? dt : dt * (G.stop > 0 ? .1 : G.timeScale);
    G.punch *= Math.exp(-dt * (G.outro ? 1.2 : 8));
    let zoom = 1; if (G.intro > 0) { const k = clamp01(1 - G.intro / INTRO_LEN), e = 1 - Math.pow(1 - k, 3); zoom = lerp(.8, 1, e); }
    Z = ZB * (1 + G.punch) * zoom;
    camera(dt, a);
    G.flash = Math.max(0, (G.flash || 0) - dt * 2.6);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#12704a'; ctx.fillRect(0, 0, VW, VH);
    ground();
    water(dt);
    const sk = sky();
    litGrade = sk.lights;
    weather(dt, sk);
    clouds(dt, sk);
    groundWeather(dt, sk);
    siteRings();
    tickBirds(wdt); drawBirds(0);
    FX.tickWarn(wdt);
    FX.telegraphs(a);

    dn = 0; BARS.length = 0; VIS_CHAMPS.length = 0;
    const m = 190;
    litNow = clamp01((G.hopeS - 18) / 22);
    tickSmoke(wdt);
    if (s.sites) for (const c of s.sites) if (c.alive && onScreen(c.x, c.y, 120)) push(c.y, 7, c);
    for (const d of G.decor) if (onScreen(d.x, d.y, m)) push(d.y, 0, d);
    for (const w of G.walls) if (onScreen(w.w.x + w.w.w / 2, w.w.y + w.w.h / 2, Math.max(w.w.w, w.w.h) * Z + 120)) push(w.w.y + w.w.h, 1, w);
    for (const b of G.brushes) if (onScreen(b.b.x, b.b.y, b.b.r * Z + 90)) push(b.b.y + b.b.r * .4, 2, b);
    for (const t of s.towers) { const v = visOf(t); if (t.alive) { tickTower(t, wdt); if (onScreen(t.x, t.y, 200)) { push(t.y, 3, t, 0, 0, v); BARS.push({ u: t, px: t.x, py: t.y, v }); } } }
    for (const q of s.minions) { if (q.alive === false || q.delay > 0) continue; const v = tickMinion(q, a, wdt), p = pos(q, a); if (onScreen(p.x, p.y, 70)) { push(p.y, 4, q, p.x, p.y, v); BARS.push({ u: q, px: p.x, py: p.y, v }); } }
    for (const q of s.monsters) { if (q.alive === false) continue; const v = visOf(q), p = pos(q, a), sp = Math.hypot(q.vx || 0, q.vy || 0); tickVis(q, v, p, wdt, sp, q.ms || 260); if (onScreen(p.x, p.y, 120)) { push(p.y, 5, q, p.x, p.y, v); BARS.push({ u: q, px: p.x, py: p.y, v }); } }
    for (const c of s.champs) {
      const v = tickChamp(c, a, wdt);
      if (!c.alive || !Sim.canSee(s, me.team, c)) continue;
      const p = pos(c, a); if (!onScreen(p.x, p.y, 100)) continue;
      push(p.y, 6, c, p.x, p.y, v); BARS.push({ u: c, px: p.x + v.rx, py: p.y + v.ry, v }); VIS_CHAMPS.push(p.x, p.y, c);
    }
    const order = DL.slice(0, dn).sort((p, q) => p.y - q.y);
    for (const e of order) switch (e.k) {
      case 0: drawDecor(e.o, me, dt); break;
      case 1: drawWall(e.o); break;
      case 2: drawBrush(e.o, me, dt); break;
      case 3: drawTower(e.o, e.v); break;
      case 4: { const u = e.o, v = e.v, z = 8 + Math.abs(Math.sin(v.hop)) * (u.vx || u.vy ? 10 : 1); minionRing(u, sx(e.px + v.rx), sy(e.py + v.ry)); drawCoin(spriteOf(u), sx(e.px + v.rx), sy(e.py + v.ry), z, drawR(u) * SIZE_MINION, { flash: v.flash, edge: u.team ? '#6a2c20' : '#2a4f70', lean: v.lean, squash: v.squash }); break; }
      case 5: { const u = e.o, v = e.v, z = u.boss ? 22 + Math.sin(G.t * 1.8) * 5 : 8 + Math.abs(Math.sin(v.hop)) * 4; drawCoin(spriteOf(u), sx(e.px + v.rx), sy(e.py + v.ry), z, drawR(u) * (u.boss ? 1 : SIZE_MONSTER), { flash: v.flash, spin: u.boss ? (.72 + Math.sin(G.t * .9) * .28) : 1, edge: u.boss ? '#8a5d0c' : '#3a2f1c', lean: v.lean, squash: v.squash }); break; }
      case 6: drawChamp(e.o, e.v, e.px, e.py, a, me); break;
      case 7: drawCivilians(e.o); break;
    }
    // A coin behind a cliff still shows as a faint silhouette.
    for (let i = 0; i < VIS_CHAMPS.length; i += 3) {
      const x = VIS_CHAMPS[i], y = VIS_CHAMPS[i + 1], c = VIS_CHAMPS[i + 2];
      for (const o of G.walls) { const w = o.w; if (x > w.x - 8 && x < w.x + w.w + 8 && y < w.y + 6 && y > w.y - 92) { drawCoin(spriteOf(c), sx(x), sy(y), 14, drawR(c) * SIZE_CHAMP, { alpha: c === me ? .5 : .3, noshadow: true, ink: false }); break; } }
    }
    drawSmoke();
    drawBirds(1);
    driftLeaves(dt);

    // Grade the world, then draw effects on top so spells stay bright at night and in storms.
    grade(a, sk);
    FX.projectiles(a, wdt);
    FX.draw(wdt);
    rainStreaks(dt);
    waterSparkles(dt);
    fireflies(dt, sk);
    lightning();
    ctx.drawImage(Art.vignette(VW | 0, VH | 0), 0, 0, VW, VH);
    hpBars(a);
    FX.textLayer(dt);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    hudDraw(dt);
  }

  return { initWorld, render, introTick, outroStart, outroTick, drawCoin, visOf };
})();
