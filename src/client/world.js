// The world renderer: ground, water, weather, lighting, scenery, units, intro and outro.
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
  let waterA = null, waterB = null, patCtx = null;

  function visOf(u) {
    let v = G.vis.get(u.id);
    if (!v) { v = { flash: 0, spin: 0, hop: Math.random() * TAU, rx: 0, ry: 0, lean: 0, squash: 0, sheen: -rnd(1, 6), ghostT: 0, br: -1, hpLag: 1, lx: undefined, ly: undefined, stack: -1, phase: Math.floor(Math.random() * 1e3) }; G.vis.set(u.id, v); }
    return v;
  }

  // ---------- setup ----------
  function initWorld(g) {
    const s = g.s, map = s.map, GS = quality >= 2 ? 1.25 : 1;
    g.ground = Terrain.paint(map, s.towers, GS, s.sites || []);
    waterA = waterB = null; patCtx = null;
    g.vis = new Map();
    g.text = []; g.punch = 0; g.lead = { x: 0, y: 0 }; g.goldBump = 0; g.goldAnchor = g.goldAnchor || null;
    g.hopeS = s.hope === undefined ? 50 : s.hope;
    // The side you were dealt sets the opening: heroes wake at dawn, villains arrive at dusk under cloud.
    g.villain = g.me.team === 1; g.skyStart = g.villain ? .66 : .03;
    g.rain = g.villain ? .55 : 0; g.rainT = 0; g.rainNext = 95 + Math.random() * 40; g.bolt = 0; g.boltPts = null; g.thunderIn = 0; g.drops = []; g.ripples = [];
    g.fog = Array.from({ length: 8 }, () => ({ x: Math.random() * Sim.W, y: Math.random() * Sim.H, r: rnd(320, 560), v: rnd(8, 18) }));
    g.clouds = Array.from({ length: 5 }, (_, i) => ({ x: Math.random() * Sim.W, y: Math.random() * Sim.H, v: rnd(16, 30), r: rnd(420, 640), k: i % 3 }));
    g.motes = Array.from({ length: 26 }, () => ({ x: Math.random() * Sim.W, y: Math.random() * Sim.H, p: Math.random() * 6 }));
    g.drift = Array.from({ length: 12 }, (_, i) => ({ x: Math.random() * Sim.W, y: Math.random() * Sim.H, z: rnd(20, 120), p: Math.random() * 6, rot: Math.random() * TAU, col: ['#7fb36a', '#4f8f5e', '#c9a24a'][i % 3] }));
    g.decor = buildDecor(g);
    g.brushes = map.brush.map((b, i) => ({ b, i, spr: Art.brushSprite(b, i % 3 + 1), fade: 1, shake: 0 }));
    g.walls = map.walls.filter(w => !w.big).map(w => ({ w, spr: Terrain.cliff(w) }));
    g.lamps = g.decor.filter(d => d.light);
    g.houses = g.decor.filter(d => d.kind === 2);
    g.introIdx = new Map(s.champs.map((c, i) => [c.id, i])); g.introLanded = new Set();
    g.tAim = null;
    FX.reset();
  }

  function buildDecor(g) {
    const s = g.s, map = s.map, r = Art.seeded(4177), out = [], W = Sim.W, H = Sim.H, TAU2 = TAU;
    const tree = (x, y) => {
      const v = r() < .1 ? 3 : Math.floor(r() * 3), spr = Terrain.tree(v);
      out.push({ x, y, spr, kind: 0, fade: true, half: spr.c.width * .42, tall: spr.c.height * .9, al: 1 });
    };
    for (const w of map.walls) if (w.big) for (let i = 0; i < 24; i++) tree(w.x + 26 + r() * (w.w - 52), w.y + 20 + r() * (w.h - 40));
    for (let x = 340; x < W - 340; x += 58 + r() * 48) { tree(x, 34 + r() * 60); tree(x, H - 12 - r() * 48); }
    for (let y = 340; y < H - 340; y += 66 + r() * 46) { tree(8 + r() * 24, y); tree(W - 8 - r() * 24, y); }
    // lanterns on the road shoulders, kept off the river, the towers and the walls
    const lan = Terrain.lantern(g.me.team === 1), lanCol = g.me.team === 1 ? '#ff5a3c' : '#ffcf85';
    for (const lane of map.lanes) {
      const pts = Terrain.spline(lane, 16); let run = 200, side = 1;
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i], d = Math.hypot(bx - ax, (by - ay) * TILT); run += d; if (run < 330) continue; run = 0; side = -side;
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
      return !placed.some(p => Math.hypot(p.x - x, (p.y - y) * TILT) < 118);
    };
    const house = (x, y) => { if (!clear(x, y)) return false; const spr = Terrain.house(Math.floor(r() * 4)); placed.push({ x, y }); out.push({ x, y, spr, kind: 2, fade: true, half: 54, tall: 120, al: 1, ph: r() * 6 }); return true; };
    for (const site of sites) { let n = 0; const a0 = r() * TAU2; for (let i = 0; i < 10 && n < 4; i++) { const a = a0 + i * TAU2 / 10, d = 205 + r() * 50; if (house(site.x + Math.cos(a) * d, site.y + Math.sin(a) * d)) n++; } }
    for (const lane of map.lanes) { const pts = Terrain.spline(lane, 16); for (let i = 6; i < pts.length; i += 11) { const [x, y] = pts[i], q = pts[i + 1] || pts[i], dx = q[0] - x, dy = (q[1] - y) * TILT, l = Math.hypot(dx, dy) || 1; for (const sd of [-1, 1]) { const o = 175 + r() * 40; house(x - dy / l * sd * o, y + dx / l * sd * o / TILT); } } }
    for (const team of [0, 1]) { const spr = Terrain.hq(team), x = team ? W - 118 : 118; out.push({ x, y: 560, spr, kind: 0, fade: true, half: 118, tall: 280, al: 1 }); }
    const pil = Terrain.pillar();
    for (let i = 0; i < 8; i++) { const a = i * TAU2 / 8 + TAU2 / 16; out.push({ x: 1600 + Math.cos(a) * 248, y: 950 + Math.sin(a) * 248, spr: pil, kind: 0, light: { r: 210, col: '#ffd27a', z: pil.lightY, a: .5 }, ph: r() * 6 }); }
    for (const team of [0, 1]) for (const a of [-1.05, -.4, .4, 1.05]) { const cx = team ? W - 210 : 210, dir = team ? -1 : 1; out.push({ x: cx + Math.cos(a) * 372 * dir, y: 950 + Math.sin(a) * 372, spr: Terrain.banner(team), kind: 1, ph: r() * 6 }); }
    return out;
  }

  // ---------- drawing a coin ----------
  const ONE = {};
  function drawCoin(spr, X, Y, z, R, opt = ONE) {
    const Rp = R * Z, alpha = opt.alpha === undefined ? 1 : opt.alpha, spin = opt.spin === undefined ? 1 : Math.max(.09, Math.abs(opt.spin)), sq = opt.squash || 0, lean = opt.lean || 0;
    if (!opt.noshadow) { ctx.globalAlpha = alpha * (opt.shadow === undefined ? 1 : opt.shadow); ctx.drawImage(Art.shadow(), X - Rp * 1.25, Y - Rp * .66 + 3, Rp * 2.5, Rp * 1.4); }
    ctx.globalAlpha = alpha;
    const kx = spin * (1 + sq * .14), ky = 1 - sq * .17, cy = -z * Z - sq * Rp * .03;
    ctx.setTransform(dpr, 0, -lean * dpr, dpr, dpr * X, dpr * Y);
    const re = Art.reed(opt.edge || '#6b4e28'), ke = Rp / re.R0;
    ctx.drawImage(re.c, -(re.R0 + 1) * ke * kx, cy - (re.ry + 1) * ke * ky, re.c.width * ke * kx, re.c.height * ke * ky);
    const k = Rp / spr.R;
    ctx.drawImage(spr.c, -spr.S * k * kx / 2, cy - spr.S * k * ky * .42, spr.S * k * kx, spr.S * k * ky * .84);
    if (opt.sheen >= 0 && opt.sheen < 1) {
      const fr = Art.sheen(), f = Rp / 44; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = alpha * .75;
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
  function water() {
    if (quality < 1) return;
    const gd = G.ground, cx = G.cam.x, hw = VW / 2 / Z + 40;
    if (cx + hw < 1320 || cx - hw > 1880) return;
    if (!waterA || patCtx !== ctx) { const c = Art.caustic(); waterA = ctx.createPattern(c, 'repeat'); waterB = ctx.createPattern(c, 'repeat'); patCtx = ctx; }
    const viewX = cx - VW / 2 / Z, viewY = G.cam.y * TILT - VH / 2 / Z, vw = VW / Z, vh = VH / Z, t = G.t;
    ctx.save();
    ctx.setTransform(dpr * Z, 0, 0, dpr * Z, dpr * (VW / 2 + shX - cx * Z), dpr * (VH / 2 + shY - G.cam.y * TILT * Z));
    ctx.clip(gd.river); ctx.clip(gd.dry, 'evenodd');
    ctx.globalCompositeOperation = 'lighter';
    const layer = (pat, scale, ox, oy, alpha) => {
      ctx.save(); ctx.scale(scale, scale * TILT); ctx.translate(ox, oy); ctx.globalAlpha = alpha; ctx.fillStyle = pat;
      ctx.fillRect(viewX / scale - ox - 2, viewY / (scale * TILT) - oy - 2, vw / scale + 4, vh / (scale * TILT) + 4); ctx.restore();
    };
    layer(waterA, 1.5, t * 11, t * 26, .2); layer(waterB, 1, -t * 15, t * 37, .14);
    ctx.globalCompositeOperation = 'source-over';
    const lap = Math.sin(t * 1.4);
    ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(226,247,250,.62)'; ctx.lineWidth = 7 + lap * 2.5; ctx.setLineDash([30, 22, 12, 26]); ctx.lineDashOffset = t * 16 + lap * 9; ctx.stroke(gd.edges);
    ctx.strokeStyle = 'rgba(190,232,240,.34)'; ctx.lineWidth = 15 - lap * 3; ctx.setLineDash([54, 38]); ctx.lineDashOffset = -t * 10; ctx.stroke(gd.edges);
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
    ctx.restore();
  }

  // ---------- sky ----------
  const SKY = [[0, 255, 214, 176], [.16, 255, 252, 244], [.5, 255, 250, 238], [.68, 255, 186, 128], [.84, 120, 140, 205], [.95, 120, 140, 205], [1, 255, 214, 176]];
  const skyOut = { r: 255, g: 255, b: 255, dawn: 0, dusk: 0, night: 0, lights: 0, up: 0, low: 0 };
  function sky() {
    const p = (G.s.t / 780 + G.skyStart) % 1;
    for (let i = 0; i < SKY.length - 1; i++) if (p <= SKY[i + 1][0]) { const A = SKY[i], B = SKY[i + 1], t = (p - A[0]) / (B[0] - A[0]); skyOut.r = lerp(A[1], B[1], t); skyOut.g = lerp(A[2], B[2], t); skyOut.b = lerp(A[3], B[3], t); break; }
    const dDawn = Math.min(p, 1 - p);
    skyOut.dawn = clamp01(1 - dDawn / .14); skyOut.dusk = clamp01(1 - Math.abs(p - .68) / .1); skyOut.night = clamp01(1 - Math.abs(p - .88) / .13);
    const h = (G.hopeS - 50) / 50; skyOut.up = Math.max(0, h); skyOut.low = Math.max(0, -h);
    // Bright hope lifts the grade toward clear daylight, lost hope sinks it. The floor keeps the fight readable.
    const up = skyOut.up * .4, low = skyOut.low;
    skyOut.r = Math.max(92, lerp(skyOut.r, 255, up) * (1 - low * .2)); skyOut.g = Math.max(100, lerp(skyOut.g, 250, up) * (1 - low * .3)); skyOut.b = Math.max(136, lerp(skyOut.b, 236, up) * (1 - low * .18));
    skyOut.lights = clamp01((1 - (skyOut.r * .3 + skyOut.g * .59 + skyOut.b * .11) / 255) / .38);
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
    // low fog: only at dawn and in rain, kept below the units and faint
    const fogA = Math.max(sk.dawn * .9 * (G.villain ? .4 : 1), G.rain * .75, sk.low * .65);
    if (fogA > .03 && quality >= 1) {
      const sp = Art.puff(218, 234, 228, .85); ctx.globalAlpha = fogA * .15;
      for (const f of G.fog) { f.x += f.v * dt; if (f.x > Sim.W + 500) f.x = -500; if (!onScreen(f.x, f.y, f.r * Z)) continue; const R = f.r * Z; ctx.drawImage(sp, sx(f.x) - R, sy(f.y) - R * .46, R * 2, R * .92); }
      ctx.globalAlpha = 1;
    }
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

  function clouds(dt, sk) {
    if (quality < 1) return;
    const a = (.22 + G.rain * .1 + sk.low * .14) * (1 - sk.up * .75) * (1 - sk.night * .7);
    for (const c of G.clouds) {
      c.x += c.v * dt; if (c.x > Sim.W + c.r) c.x = -c.r;
      const R = c.r * Z; if (!onScreen(c.x, c.y, R + 40)) continue;
      ctx.globalAlpha = a; ctx.drawImage(Art.cloud(c.k), sx(c.x) - R, sy(c.y) - R * .4, R * 2, R * .8);
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
  function glowAt(x, y, z, r, col, a) {
    const R = r * Z, X = sx(x), Y = sy(y) - z * Z; if (X < -R || X > VW + R || Y < -R || Y > VH + R) return;
    ctx.globalAlpha = a; ctx.drawImage(Art.glow(col), X - R, Y - R * .8, R * 2, R * 1.6);
  }
  function lights(a, sk) {
    if (sk.lights < .03) return;
    const n = sk.lights, s = G.s, me = G.me;
    ctx.globalCompositeOperation = 'lighter';
    for (const t of s.towers) if (t.alive) glowAt(t.x, t.y, 70, t.sub === 'core' ? 300 : 240, TEAM[t.team], .22 * n);
    for (const d of G.lamps) { if (!onScreen(d.x, d.y, d.light.r * Z)) continue; const fl = .92 + Math.sin(G.t * 7 + d.ph) * .06 + Math.sin(G.t * 13.3 + d.ph * 2) * .04; glowAt(d.x, d.y, d.light.z, d.light.r, d.light.col, d.light.a * .6 * n * fl); }
    for (const c of s.champs) if (c.alive && Sim.canSee(s, me.team, c)) { const q = pos(c, a); glowAt(q.x, q.y, 24, c === me ? 210 : 165, c === me ? '#ffe6b0' : TEAM[c.team], (c === me ? .18 : .14) * n); }
    glowAt(1600, 950, 10, 300, '#ffd27a', .18 * n);
    if (litNow > .05) for (const d of G.houses) if (onScreen(d.x, d.y, 120)) glowAt(d.x, d.y, 44, 96, '#ffcf85', .3 * n * litNow);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  function shafts(sk) {
    const s = Math.max(sk.dawn, sk.dusk) * (1 - G.rain); if (s < .04 || quality < 1) return;
    const sp = Art.shaft(), col = sk.dusk > sk.dawn ? .8 : .6; ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const X = (VW * (.15 + i * .25) + Math.sin(G.t * .13 + i * 2.3) * 60), W = 150 + i * 30, H = VH * 1.5;
      ctx.globalAlpha = s * (.13 + Math.sin(G.t * .4 + i) * .05) * col;
      const an = .5, c = Math.cos(an), sn = Math.sin(an);
      ctx.setTransform(dpr * c, dpr * sn, -dpr * sn, dpr * c, dpr * X, -40 * dpr); ctx.drawImage(sp, -W / 2, 0, W, H);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  function rainStreaks(dt) {
    if (G.rain <= .01) return;
    const n = Math.floor((quality >= 2 ? 150 : quality === 1 ? 80 : 40) * G.rain), d = G.drops;
    while (d.length < n) d.push({ x: Math.random() * VW * 1.2, y: Math.random() * VH, v: 0, near: Math.random() < .35 });
    const col = 'rgba(208,230,242,';
    for (const near of [false, true]) {
      ctx.beginPath(); const sp = near ? 1500 : 960, len = near ? 24 : 12;
      for (let i = 0; i < n; i++) {
        const p = d[i]; if (p.near !== near) continue;
        p.y += sp * dt * (.9 + (i % 5) * .05); p.x -= sp * .12 * dt;
        if (p.y > VH + 10) { p.y = -24; p.x = Math.random() * VW * 1.2; }
        if (p.x < -20) p.x = VW * 1.1;
        ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + len * .16, p.y - len);
      }
      ctx.strokeStyle = col + (near ? .52 : .24) + ')'; ctx.lineWidth = near ? 1.5 : .9; ctx.stroke();
    }
  }
  function fireflies(dt, sk) {
    if (sk.night < .05 || quality < 1) return;
    const hw = VW / 2 / Z + 40, hh = VH / 2 / (Z * TILT) + 40, sp = Art.glow('#d9f79e'), n = quality >= 2 ? G.motes.length : 12; ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const m = G.motes[i]; m.p += dt; m.x += Math.sin(m.p * .9 + i) * 20 * dt; m.y += Math.cos(m.p * .7 + i * 2) * 18 * dt;
      if (Math.abs(m.x - G.cam.x) > hw || Math.abs(m.y - G.cam.y) > hh) { m.x = G.cam.x + rnd(-hw, hw); m.y = G.cam.y + rnd(-hh, hh); }
      const al = sk.night * (.35 + .65 * Math.max(0, Math.sin(m.p * 2.4 + i))); const r = 7;
      ctx.globalAlpha = al; ctx.drawImage(sp, sx(m.x) - r, sy(m.y) - 26 * Z - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  function lightning() {
    if (G.bolt <= 0) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(226,236,255,${G.bolt * .22})`; ctx.fillRect(0, 0, VW, VH);
    if (G.boltPts && G.bolt > .35) {
      const p = G.boltPts; ctx.beginPath(); ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
      ctx.lineCap = 'round'; ctx.strokeStyle = `rgba(190,214,255,${G.bolt * .55})`; ctx.lineWidth = 7; ctx.stroke(); ctx.strokeStyle = `rgba(255,255,255,${G.bolt})`; ctx.lineWidth = 2.2; ctx.stroke();
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
      ctx.strokeStyle = c.alive ? 'rgba(241,232,208,.7)' : 'rgba(241,232,208,.2)'; ctx.lineWidth = 2; ctx.setLineDash([9 * Z + 2, 8 * Z + 2]); ctx.lineDashOffset = -G.t * 12;
      ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
      if (!c.alive || !c.prog) continue;
      ctx.lineCap = 'round'; ctx.lineWidth = 6.5;
      const top = -Math.PI / 2, a0 = pct(c.prog[0], need), a1 = pct(c.prog[1], need);
      if (a0 > 0) { ctx.strokeStyle = TEAM[0]; ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, top, top + a0 * TAU); ctx.stroke(); }
      if (a1 > 0) { ctx.strokeStyle = TEAM[1]; ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, top, top - a1 * TAU, true); ctx.stroke(); }
      ctx.lineCap = 'butt';
    }
  }
  function drawCivilians(c) {
    const contested = c.prog && (c.prog[0] > 0 || c.prog[1] > 0), sp = contested ? 2.2 : 1;
    CIV_AT.forEach(([ox, oy], i) => {
      const spr = Art.civCoin((i + c.id) % 4), wx = c.x + ox, wy = c.y + oy, X = sx(wx), Y = sy(wy), ph = G.t * 3.4 * sp + i * 1.7 + c.id, z = (5 + Math.abs(Math.sin(ph)) * 7) * Z, w = 15 * Z / spr.R * spr.S, side = i % 2 ? 1 : -1;
      ctx.drawImage(Art.shadow(), X - w * .42, Y - w * .2, w * .84, w * .4);
      const wave = Math.sin(G.t * 9 * sp + i * 2) * 4 * Z, hx = X + side * w * .36, hy = Y - z - w * .3;
      ctx.strokeStyle = '#3a2c20'; ctx.lineWidth = 2.4 * Z; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + side * 5 * Z + wave, hy - 12 * Z); ctx.stroke();
      ctx.fillStyle = '#f2c9a0'; ctx.beginPath(); ctx.arc(hx + side * 5 * Z + wave, hy - 13 * Z, 2.8 * Z, 0, TAU); ctx.fill();
      ctx.drawImage(spr.c, X - w / 2, Y - z - w * .46, w, w * .92);
    });
  }

  // ---------- per-frame unit state ----------
  function tickVis(u, v, p, dt, sp, ms) {
    v.flash = Math.max(0, v.flash - dt * 8); v.spin = Math.max(0, v.spin - dt * 2.7); v.squash = Math.max(0, v.squash - dt * 6);
    const d = Math.exp(-dt * 13); v.rx *= d; v.ry *= d;
    const moving = sp > 20, nx = moving && u.vx ? u.vx / sp : 0;
    v.lean += (clamp01(sp / ms) * nx * .26 - v.lean) * (1 - Math.exp(-dt * 11));
    const before = Math.floor(v.hop / Math.PI);
    v.hop += dt * (moving ? 9.5 : 1.3);
    const landed = moving && Math.floor(v.hop / Math.PI) !== before;
    if (landed) v.squash = Math.max(v.squash, .75);
    if (v.sheen < 1) v.sheen += dt * (v.sheen < 0 ? 1 : 2.2); else v.sheen = -rnd(3, 7);
    return landed;
  }

  function tickChamp(c, a, dt) {
    const v = visOf(c), p = pos(c, a), sp = Math.hypot(c.vx || 0, c.vy || 0), me = G.me;
    const landed = tickVis(c, v, p, dt, sp, c.msBase || 300);
    if (!c.alive) { v.lx = undefined; v.br = -1; return v; }
    if (dt > 0 && v.lx !== undefined) { const d = Math.hypot(p.x - v.lx, p.y - v.ly); if (d > 120 && d < 1300 && Sim.canSee(G.s, me.team, c)) FX.ghostLine(spriteOf(c), drawR(c), v.lx, v.ly, p.x, p.y); }
    v.lx = p.x; v.ly = p.y;
    if (dt > 0 && (c.dash || c.leap) && Sim.canSee(G.s, me.team, c)) { if ((v.ghostT -= dt) <= 0) { v.ghostT = .036; FX.ghost(spriteOf(c), drawR(c), p.x, p.y, 16 + (c.z || 0)); } }
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

  let litNow = 1;
  function drawDecor(o, me, dt) {
    const X = sx(o.x), Y = sy(o.y), spr = o.spr;
    if (o.fade && me.alive) {
      const rear = o.y - me.y > 0 && o.y - me.y < o.tall / TILT && Math.abs(me.x - o.x) < o.half;
      o.al += ((rear ? .42 : 1) - o.al) * (1 - Math.exp(-dt * 9));
      ctx.globalAlpha = o.al;
    }
    if (o.kind === 1) {
      const sh = Math.sin(G.t * 1.9 + o.ph) * .05;
      ctx.setTransform(dpr * Z, 0, -dpr * Z * sh, dpr * Z, dpr * X, dpr * Y); ctx.drawImage(spr.c, -spr.ax, -spr.ay); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    } else ctx.drawImage(spr.c, X - spr.ax * Z, Y - spr.ay * Z, spr.c.width * Z, spr.c.height * Z);
    if (o.kind === 2 && litNow > .02) { const al = ctx.globalAlpha; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = al * litNow * (.82 + Math.sin(G.t * 2.3 + o.ph) * .1); ctx.drawImage(spr.L, X - spr.ax * Z, Y - spr.ay * Z, spr.c.width * Z, spr.c.height * Z); ctx.globalCompositeOperation = 'source-over'; }
    ctx.globalAlpha = 1;
  }
  function drawWall(w) { const sp = w.spr, wl = w.w; ctx.drawImage(sp.c, sx(wl.x) - sp.P * Z, sy(wl.y) - (sp.lift + sp.P) * Z, sp.c.width * Z, sp.c.height * Z); }
  function drawBrush(o, me, dt) {
    const sp = o.spr, b = o.b, inside = me.alive && me.inBrush === o.i;
    o.fade += ((inside ? .42 : 1) - o.fade) * (1 - Math.exp(-dt * 10));
    o.shake = Math.max(0, o.shake - dt * 1.9);
    const shear = Math.sin(G.t * 1.5 + o.i) * .018 + Math.sin(G.t * 26) * o.shake * .09;
    ctx.globalAlpha = o.fade; ctx.setTransform(dpr * Z, 0, -dpr * Z * shear, dpr * Z, dpr * sx(b.x), dpr * sy(b.y));
    ctx.drawImage(sp.c, -sp.ax, -sp.ay); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1;
  }
  function drawChamp(c, v, px, py, a, me) {
    const X = sx(px + v.rx), Y = sy(py + v.ry), sp = Math.hypot(c.vx || 0, c.vy || 0), moving = sp > 20, hopH = moving ? 9 : 2;
    const izf = introZ(c), z = 14 + Math.abs(Math.sin(v.hop)) * hopH + (c.z || 0) + izf;
    const spin = v.spin > 0 ? Math.cos(v.spin * TAU) : 1;
    ctx.strokeStyle = c === me ? '#fff4cf' : TEAM[c.team]; ctx.lineWidth = c === me ? 2.6 : 2; ctx.globalAlpha = .9; ctx.beginPath(); ctx.ellipse(X, Y, 42 * Z, 42 * Z * TILT, 0, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
    if (c.tier >= 3) { const gl = Art.glow(AURA[c.tier]), r = (62 + (c.tier - 3) * 7) * Z; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .3 + Math.sin(G.t * 3 + v.phase) * .09; ctx.drawImage(gl, X - r, Y - z * Z - r, r * 2, r * 2); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
    const alpha = c.inBrush >= 0 ? (c.team === me.team ? .78 : 1) : 1;
    const top = drawCoin(spriteOf(c), X, Y, z, drawR(c), { spin, flash: v.flash, alpha, lean: v.lean, squash: v.squash, sheen: v.sheen, shadow: clamp01(1 - izf / 900) });
    if (c.tier === 5 && quality >= 1) { ctx.globalCompositeOperation = 'lighter'; const gl = Art.glow('#ecdcff'); for (let i = 0; i < 3; i++) { const an = G.t * 2.6 + i * TAU / 3, r = 7 * Z; ctx.drawImage(gl, X + Math.cos(an) * 44 * Z - r, top + Math.sin(an) * 26 * Z - r, r * 2, r * 2); } ctx.globalCompositeOperation = 'source-over'; }
    if (c.parryT > 0) { ctx.strokeStyle = '#fff5c6'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(X, top, 46 * Z, 40 * Z, 0, 0, TAU); ctx.stroke(); }
    if (c.markT > 0) { ctx.save(); ctx.translate(X, top); ctx.rotate(G.t * 2); ctx.strokeStyle = '#ff9de2'; ctx.lineWidth = 3; for (let i = 0; i < 3; i++) { ctx.rotate(TAU / 3); ctx.beginPath(); ctx.arc(0, 0, 44 * Z, 0, 1.1); ctx.stroke(); } ctx.restore(); }
    if (c.stunT > 0) for (let i = 0; i < 3; i++) { const an = G.t * 7 + i * TAU / 3; ctx.fillStyle = '#ffe89e'; ctx.beginPath(); ctx.arc(X + Math.cos(an) * 26 * Z, top - 38 * Z + Math.sin(an) * 7, 3.6, 0, TAU); ctx.fill(); }
    if (c.chan && c.chan.recall) { ctx.strokeStyle = TEAM[c.team]; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(X, top, 46 * Z, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - c.chan.t / c.chan.total)); ctx.stroke(); }
    if (c.echo && c.recast[1] > 0 && c.team === me.team) drawCoin(spriteOf(c), sx(c.echo.x), sy(c.echo.y), 14, drawR(c), { alpha: .4 });
  }

  function drawTower(t, v) {
    const n = t.sub === 'core' ? 11 : 8, R = t.sub === 'core' ? 74 : 50, shown = Math.ceil(n * pct(t.hp, t.maxHp));
    const X = sx(t.x), Y = sy(t.y), d = Art.discSprite(t.team, R), k = Z, step = R * .24 * k, open = Sim.towerOpen(G.s, t);
    ctx.drawImage(Art.shadow(), X - R * 1.5 * k, Y - R * .8 * k, R * 3 * k, R * 1.6 * k);
    const fl = v.flash; if (fl > 0) ctx.globalAlpha = 1;
    for (let i = 0; i < shown; i++) { const off = Math.sin(i * 7.3) * 2.5 * k; ctx.drawImage(d.c, X - d.cx * k + off, Y - d.cy * k - i * step, d.c.width * k, d.c.height * k); }
    const topY = Y - shown * step;
    if (fl > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = fl * .4; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(X, Y - shown * step * .5, R * k, (shown * step + R * k * .7) * .55, 0, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
    const gl = Art.glow(TEAM[t.team]); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = open ? .65 + Math.sin(G.t * 3) * .15 : .24; ctx.drawImage(gl, X - 44 * k, topY - 60 * k, 88 * k, 88 * k); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    if (t.sub === 'core') drawCoin(Art.coin('corecoin' + t.team, 56, 'boss', Art.METAL['minion' + t.team], t.team, 3), X, topY, 40 + Math.sin(G.t * 2) * 4, 40, { spin: Math.cos(G.t * 1.3), noshadow: true, edge: '#8a5d0c' });
    else { ctx.fillStyle = TEAM[t.team]; ctx.beginPath(); ctx.moveTo(X, topY - 34 * k); ctx.lineTo(X + 10 * k, topY - 20 * k); ctx.lineTo(X, topY - 6 * k); ctx.lineTo(X - 10 * k, topY - 20 * k); ctx.closePath(); ctx.fill(); }
  }
  function tickTower(t, dt) {
    const v = visOf(t); v.flash = Math.max(0, v.flash - dt * 8);
    const n = t.sub === 'core' ? 11 : 8, R = t.sub === 'core' ? 74 : 50, shown = Math.ceil(n * pct(t.hp, t.maxHp));
    if (v.stack < 0) v.stack = shown;
    if (shown < v.stack) { if (onScreen(t.x, t.y, 200)) for (let i = shown; i < v.stack; i++) FX.popCoin(t.team, t.x, t.y, 20 + i * R * .24); }
    v.stack = shown;
  }

  const BARS = [], VIS_CHAMPS = [];
  function hpBars(a) {
    const me = G.me;
    ctx.textBaseline = 'middle';
    for (const b of BARS) {
      const u = b.u, X = sx(b.px), Y = sy(b.py) - (u.z || 0) * Z, f = pct(u.hp, u.maxHp);
      if (u.kind === 'champ') {
        const w = 66 * Z, x = X - w / 2, y = Y - 76 * Z, v = b.v; v.hpLag = Math.max(f, v.hpLag - .018);
        ctx.fillStyle = 'rgba(6,20,18,.85)'; ctx.fillRect(x - 1, y - 1, w + 2, 8.5); ctx.fillStyle = u === me ? '#8ee07f' : u.team === me.team ? '#58a6e6' : '#e4573f'; ctx.fillRect(x, y, w * f, 6.5);
        if (v.hpLag > f) { ctx.fillStyle = 'rgba(255,240,200,.85)'; ctx.fillRect(x + w * f, y, w * (v.hpLag - f), 6.5); }
        ctx.fillStyle = '#fff6e2'; ctx.font = '700 12px "Barlow Semi Condensed",sans-serif'; ctx.textAlign = 'right'; ctx.fillText(u.lvl, x - 3, y + 3);
        if (u !== me) { ctx.textAlign = 'left'; ctx.font = '600 11.5px "Barlow Semi Condensed",sans-serif'; ctx.fillStyle = 'rgba(255,246,226,.85)'; ctx.fillText(Sim.charOf ? Sim.charOf(u.team, u.champ).name : Sim.KITS[u.champ].name, x, y - 7); }
      } else if (u.kind === 'tower') {
        const n = u.sub === 'core' ? 11 : 8, R = u.sub === 'core' ? 74 : 50, open = Sim.towerOpen(G.s, u), y = Y - (n * R * .24 + 56) * Z;
        if (u.hp < u.maxHp || open) bar(X - 42 * Z, y, 84 * Z, 6, f, open ? (u.team === me.team ? '#58a6e6' : '#e4573f') : 'rgba(170,180,175,.7)');
      } else if (u.hp < u.maxHp) {
        if (u.kind === 'minion') bar(X - 18 * Z, Y - 46 * Z, 36 * Z, 3.5, f, u.team === me.team ? '#58a6e6' : '#e4573f');
        else { const r = drawR(u); bar(X - r * Z, Y - (r + 34) * Z, r * 2 * Z, u.boss ? 7 : 4, f, '#e0b552'); }
      }
    }
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
    ctx.fillStyle = '#0f3029'; ctx.fillRect(0, 0, VW, VH);
    ground();
    water();
    const sk = sky();
    weather(dt, sk);
    groundWeather(dt, sk);
    siteRings();
    FX.tickWarn(wdt);
    FX.telegraphs(a);

    dn = 0; BARS.length = 0; VIS_CHAMPS.length = 0;
    const m = 190;
    litNow = clamp01((G.hopeS - 18) / 22);
    const smoke = clamp01((34 - G.hopeS) / 20);
    if (smoke > 0 && wdt > 0) for (const d of G.houses) if (onScreen(d.x, d.y, 120) && Math.random() < wdt * 2.4 * smoke) FX.puff(d.x + d.spr.chimX, d.y, 1, 1, 15, 1.5, d.spr.chimY, 10);
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
      case 4: { const u = e.o, v = e.v, z = 8 + Math.abs(Math.sin(v.hop)) * (u.vx || u.vy ? 6 : 1); drawCoin(spriteOf(u), sx(e.px + v.rx), sy(e.py + v.ry), z, drawR(u), { flash: v.flash, edge: u.team ? '#6a2c20' : '#2a4f70', lean: v.lean, squash: v.squash }); break; }
      case 5: { const u = e.o, v = e.v, z = u.boss ? 22 + Math.sin(G.t * 1.8) * 5 : 8 + Math.abs(Math.sin(v.hop)) * 4; drawCoin(spriteOf(u), sx(e.px + v.rx), sy(e.py + v.ry), z, drawR(u), { flash: v.flash, spin: u.boss ? Math.cos(G.t * .7) : 1, edge: u.boss ? '#8a5d0c' : '#3a2f1c', lean: v.lean, squash: v.squash }); break; }
      case 6: drawChamp(e.o, e.v, e.px, e.py, a, me); break;
      case 7: drawCivilians(e.o); break;
    }
    // A coin behind a cliff still shows as a faint silhouette.
    for (let i = 0; i < VIS_CHAMPS.length; i += 3) {
      const x = VIS_CHAMPS[i], y = VIS_CHAMPS[i + 1], c = VIS_CHAMPS[i + 2];
      for (const o of G.walls) { const w = o.w; if (x > w.x - 8 && x < w.x + w.w + 8 && y < w.y + 6 && y > w.y - 92) { drawCoin(spriteOf(c), sx(x), sy(y), 14, drawR(c), { alpha: c === me ? .5 : .3, noshadow: true }); break; } }
    }
    FX.projectiles(a, wdt);
    FX.draw(wdt);
    driftLeaves(dt);
    clouds(dt, sk);

    // Colour grade by multiplying, so darks stay dark and nothing goes milky.
    const rain = G.rain;
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgb(${sk.r * (1 - rain * .24) | 0},${sk.g * (1 - rain * .17) | 0},${sk.b * (1 - rain * .06) | 0})`;
    ctx.fillRect(0, 0, VW, VH);
    ctx.globalCompositeOperation = 'source-over';

    lights(a, sk);
    shafts(sk);
    rainStreaks(dt);
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
