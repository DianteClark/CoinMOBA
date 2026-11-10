// The world renderer: ground, water, weather, fog of war, scenery, units, ambient life, intro and outro.
// Private helpers stay inside the closure so nothing collides with the other client files.
Art.setPalette(!!save.cb); // save.cb: colorblind palette, applied before the first sprite is drawn
let shX = 0, shY = 0;
const sx = x => (x - G.cam.x) * Z + VW / 2 + shX;
const sy = y => (y - G.cam.y) * TILT * Z + VH / 2 + shY;
const onScreen = (x, y, m = 90) => { const X = sx(x), Y = sy(y); return X > -m && X < VW + m && Y > -m - 40 && Y < VH + m + 60; };
// A guest rebuilds state from snapshots, so these read defensively. posNow returns one shared object: use its values at once, never keep it.
const WP = { x: 0, y: 0 };
function posNow(u, a) { const px = u.px === undefined ? u.x : u.px, py = u.py === undefined ? u.y : u.py; WP.x = px + (u.x - px) * a; WP.y = py + (u.y - py) * a; return WP; }
const isUp = u => u.alive !== false;
const seesU = c => { if (G.spectator) return true; try { return Sim.canSee(G.s, G.me.team, c); } catch (e) { return true; } };
const towerOpenU = t => { try { return Sim.towerOpen(G.s, t); } catch (e) { return true; } };
// Read by relation, never by side: you are gold, friends are blue, enemies are red.
const REL_COL = { me: '#ffe08a', ally: '#58b0ff', enemy: '#ff3f3a', allyName: '#a9d0f2', enemyName: '#ff9c92' };
Art.onCB(on => Object.assign(REL_COL, on ? { ally: Art.PAL.ally, enemy: Art.PAL.enemy, enemyName: '#ffe08a' } : { ally: '#58b0ff', enemy: '#ff3f3a', enemyName: '#ff9c92' }));
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
// A minion's type survives on a network guest through its flags as well as its name.
const typeOf = u => u.type || (u.heavy ? 'heavy' : u.ranged ? 'ranged' : 'melee');
const artR = u => u.kind === 'champ' ? Math.max(24, (u.r || 26) * 1.04) : u.kind === 'minion' ? (u.r || 15) * 1.02 : u.boss ? (u.r || 58) * 1.08 : (u.r || 22) * 1.06;
// Vision circles for this frame, and a quick test for whether a world point is lit. Used to hide enemy effects in the dark.
let VIS_SRC = EMPTY_LIST;
function litAt(x, y, m = 0) { if (G.spectator) return true; for (let i = 0; i < VIS_SRC.length; i++) { const v = VIS_SRC[i], dx = v.x - x, dy = v.y - y, R = v.r + m; if (dx * dx + dy * dy < R * R) return true; } return false; }

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
    Terrain.setTheme && Terrain.setTheme(map.kind === 'brawl' && map.band ? 'brawl' : '');
    g.ground = Terrain.paint(map, s.towers, GS, s.sites || [], g.me.team === 1 ? 1 : 0, s.camps || [], s.districts || []);
    g.vis = new Map();
    g.text = []; g.punch = 0; g.punchS = 0; g.lead = { x: 0, y: 0 }; g.goldBump = 0; g.goldAnchor = g.goldAnchor || null;
    g.hopeS = s.hope === undefined ? 50 : s.hope;
    // The side you were dealt sets the mood: heroes under a cool pre-dawn, villains under a blood-red dusk.
    g.villain = g.me.team === 1;
    g.rain = g.villain ? .5 : 0; g.rainT = 0; g.rainNext = 95 + Math.random() * 40; g.bolt = 0; g.boltPts = null; g.thunderIn = 0; g.drops = []; g.ripples = [];
    g.dv = new Map(); g.moodK = 0; g.moodT = 0;
    g.evv = null; g.black = 0; g.cheer = 0; g.helis = []; g.heliNext = 28 + Math.random() * 30; g.spotK = [0, 0];
    g.motes = Array.from({ length: 8 }, () => ({ x: Math.random() * Sim.W, y: Math.random() * Sim.H, p: Math.random() * 6 }));
    const wallStyle = w => { const cx = w.x + w.w / 2, cy = w.y + w.h / 2; return Terrain.nearRoad(map, cx, cy) < 250 || (map.lanes.length < 3 && Math.abs(cy - map.H / 2) < 200) || (map.plazas || []).some(p => p.kind === 'base' && Math.hypot(cx - p.x, cy - p.y) < p.r + 140) ? 1 : 0; };
    g.walls = map.walls.filter(w => !w.big).map(w => { const style = wallStyle(w); return { w, spr: Terrain.cliff(w, style, w.x + w.w / 2 > map.W / 2 ? 1 : 0) }; });
    g.decor = buildDecor(g);
    // A precinct is paved: nothing planted may stand on one, and every landmark bakes during the load, not mid-fight.
    if (s.districts) {
      g.decor = g.decor.filter(d => d.kind === 3 || !s.districts.some(q => Math.hypot(d.x - q.x, d.y - q.y) < (q.r || 200) + 16));
      for (const d of s.districts) { const k = distKind(d), spr = Terrain.landmark(k); for (let o = -1; o < 2; o++) Terrain.landLit(spr, ownCol(o)); Terrain.landLit(spr, '#ff3038'); Terrain.landLit(spr, '#ffe6a8'); Terrain.landRuin(spr, k); Terrain.districtFlag(ownCol(0)); Terrain.districtFlag(ownCol(1)); }
      Terrain.districtScar();
    }
    g.brushes = map.brush.map((b, i) => ({ b, i, on: 0 }));
    g.houses = g.decor.filter(d => d.kind === 2);
    // Light that never changes is painted into the ground once.
    const lampCol = g.villain ? '#ffc0a0' : '#ffe0a8', pools = [];
    for (const d of g.decor) if (d.light) pools.push({ x: d.x, y: d.y, r: d.light.r, col: d.light.col, a: d.light.a });
    for (const a of map.arenas || []) pools.push({ x: a.x, y: a.y, r: (a.r || 240) * 1.2, col: Art.BOSS_COL[a.kind] || '#ffb04a', a: .05 });
    for (const t of s.towers) pools.push({ x: t.x, y: t.y, r: t.sub === 'core' ? 340 : 260, col: t.team ? (Art.cb ? Art.PAL.towerLight[1] : '#d83048') : '#f0d8a0', a: .17 });
    if (map.center) pools.push({ x: map.center.x, y: map.center.y, r: 460, col: lampCol, a: .12 });
    for (const f of map.fountains || []) pools.push({ x: f.x, y: f.y, r: 420, col: f.x > Sim.W / 2 ? '#ff4a5c' : '#ffdf9e', a: .12 });
    const mirrors = g.decor.filter(d => d.kind === 2 || d.kind === 3).map(d => ({ x: d.x, y: d.y, spr: d.spr, a: d.kind === 3 ? .9 : .5 }));
    for (const o of g.walls) if (o.spr.L) mirrors.push({ x: o.w.x + o.w.w / 2, y: o.w.y + o.w.h, a: .8, spr: { c: o.spr.c, L: o.spr.L, w: o.spr.w, h: o.spr.h, ax: o.spr.w / 2, ay: o.spr.h - o.spr.P - 8 } });
    Terrain.bake(g.ground, pools, mirrors);
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
    for (const t of [0, 1]) for (const type of ['melee', 'ranged', 'heavy']) worldSprite({ kind: 'minion', team: t, type, ranged: type === 'ranged', r: type === 'ranged' ? 14 : type === 'heavy' ? 22 : 17 });
    for (const m of [[false, false], [true, false]]) worldSprite({ kind: 'monster', team: 2, big: m[0], boss: m[1], r: m[1] ? 58 : m[0] ? 32 : 19 });
    for (const b of s.bosses || []) worldSprite({ kind: 'monster', team: 2, boss: true, bossKind: b.kind, r: b.r || 60 });
    for (const t of s.towers) { const a = artOf(t); Terrain.towerCoin(t.team, a.R); Terrain.towerCrown(t.team, t.sub === 'core'); }
    // Every building's depth sweep is cut now too; none of it should ever land on a playing frame.
    for (const d of g.decor) if (d.kind >= 2 && d.kind !== 5) { if (d.kind === 3) Terrain.backOf(d.spr, '#04060a', '#222c3c', 26 * .9); Terrain.litOf(d.spr); }
    for (const o of g.walls) Terrain.litOf(o.spr);
  }
  function buildDecor(g) {
    const s = g.s, map = s.map, r = Art.seeded(4177), out = [], W = map.W, H = map.H, centre = map.center || { x: W / 2, y: H / 2 }, gd = g.ground, plazas = map.plazas || [];
    const inRiver = (x, y, m) => Math.abs(x - gd.riverX(y)) < m;
    const tree = (x, y) => { if (inRiver(x, y, Terrain.HALF + 80)) return; const spr = Terrain.tree(Math.floor(r() * 4)); out.push({ x, y, spr, kind: 0, fade: true, half: spr.w * .4, tall: spr.h * .9, al: 1 }); };
    // The built-up corners behind each capital: rows of real towers, tallest at the back, trees along their feet.
    for (const w of map.walls) if (w.big) { for (let y = w.y + 50; y < w.y + w.h - 10; y += 180 + r() * 50) for (let x = w.x + 70; x < w.x + w.w - 30; x += 190 + r() * 60) { if (inRiver(x, y, Terrain.HALF + 80)) continue; const spr = Terrain.house(Math.floor(r() * 4) * 2 + 1 + (y < w.y + w.h / 2 ? 2 : 0), x > W / 2 ? 1 : 0); out.push({ x, y, spr, kind: 2, fade: true, half: 62, tall: spr.h * .9, al: 1, ph: r() * 6, smk: r() * 2 }); } }
    // The jungle's own trees grow on the terraces, which are solid ground in every sense.
    for (const o of g.walls) if (o.spr.style === 0) { const w = o.w, n = Math.max(1, Math.round(w.w * w.h / 34000)); for (let i = 0; i < n; i++) tree(w.x + 14 + r() * Math.max(1, w.w - 28), w.y + w.h - 6 - r() * Math.min(w.h * .4, 40)); }
    const sea = Terrain.theme && Terrain.theme() === 'brawl'; // Main Street: no park trees on the map edges
    if (!sea) for (let x = 240; x < W - 240; x += 200 + r() * 160) { if (inRiver(x, H - 30, Terrain.HALF + 80)) continue; if (r() > .4) { const spr = Terrain.house(Math.floor(r() * 2) * 2, x > W / 2 ? 1 : 0); out.push({ x, y: H - 24 - r() * 14, spr, kind: 2, fade: true, half: 62, tall: spr.h * .9, al: 1, ph: r() * 6, smk: r() * 2 }); } else tree(x, H - 14 - r() * 26); }
    if (!sea) for (let y = 300; y < H - 300; y += 170 + r() * 120) { tree(14 + r() * 16, y); tree(W - 14 - r() * 16, y); }
    // The skyline: deco towers along the north edge, behind everything you can walk on.
    for (let x = 240; x < W - 160; x += 190 + r() * 110) {
      if (inRiver(x, 90, Terrain.HALF + 70)) continue;
      const spr = Terrain.house(Math.floor(r() * 8) * 2 + 1, x > W / 2 ? 1 : 0), y = 58 + r() * 40;
      out.push({ x, y, spr, kind: 2, half: 60, tall: spr.h * .9, al: 1, ph: r() * 6, smk: r() * 2, sky: 1 });
    }
    // Street lights on the road shoulders.
    const lan = Terrain.lantern(g.villain), lanCol = g.villain ? '#ffc0a0' : '#ffe0a8';
    const isClear = (x, y, m) => !map.walls.some(w => x > w.x - m && x < w.x + w.w + m && y > w.y - m && y < w.y + w.h + m);
    for (const lane of map.lanes) {
      const pts = Terrain.spline(lane, 16); let run = 120, side = 1;
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i], d = Math.hypot(bx - ax, (by - ay) * TILT); run += d; if (run < 400) continue; run = 0; side = -side;
        const dx = bx - ax, dy = (by - ay) * TILT, l = Math.hypot(dx, dy) || 1, nx = -dy / l * side, ny = dx / l * side, x = bx + nx * 150, y = by + ny * 150 / TILT;
        if (inRiver(x, y, Terrain.HALF + 60) || s.towers.some(t => Math.hypot(t.x - x, t.y - y) < 150) || !isClear(x, y, 34)) continue;
        out.push({ x, y, spr: lan, kind: 0, fade: true, half: 16, tall: lan.h * .95, al: 1, light: { r: 240, col: lanCol, a: .36 }, ph: r() * 6 });
      }
    }
    const sites = s.sites || [];
    // Headquarters stand on the impassable ground at both ends of each base, so one is in view from the spawn.
    for (const f of map.fountains || []) {
      const team = f.x > W / 2 ? 1 : 0, spr = Terrain.hq(team), x = team ? W - 105 : 105;
      for (const y of [f.y - 620, f.y + 620]) out.push({ x, y, spr, kind: 3, fade: true, half: 170, tall: spr.h * .78, al: 1, ph: r() * 6, light: { r: 360, col: team ? '#ff4a5c' : '#ffdf9e', a: .16 } });
    }
    const pil = Terrain.pillar(), cp = plazas.find(p => p.kind === 'centre'), R = cp ? cp.r - 26 : 340;
    for (let i = 0; i < 8 && !(map.arenas || []).some(q => q.kind === 'colossus'); i++) { const a = i * TAU / 8 + TAU / 16; out.push({ x: centre.x + Math.cos(a) * R, y: centre.y + Math.sin(a) * R, spr: pil, kind: 0, fade: true, half: 22, tall: pil.h * .95, al: 1, light: { r: 180, col: lanCol, a: .32 }, ph: r() * 6 }); }
    for (const p of plazas) if (p.kind === 'base') for (const a of [-1.05, -.4, .4, 1.05]) { const dir = p.team ? -1 : 1; out.push({ x: p.x + Math.cos(a) * (p.r - 34) * dir, y: p.y + Math.sin(a) * (p.r - 34), spr: Terrain.banner(p.team), kind: 1, fade: true, half: 26, tall: 120, al: 1, ph: r() * 6, flag: 1 }); }
    // Bystanders behind a rail: at the edge of every civilian square, and in ones and twos along the road shoulders.
    const crowdOK = (x, y) => x > 90 && x < W - 90 && y > 150 && y < H - 150 && !inRiver(x, y, Terrain.HALF + 70) && isClear(x, y, 50) && !plazas.some(p => Math.hypot(x - p.x, y - p.y) < p.r + 20) && !s.towers.some(t => Math.hypot(t.x - x, t.y - y) < 170) && !(map.arenas || []).some(a => Math.hypot(a.x - x, a.y - y) < (a.r || 240) + 40);
    const crowd = (x, y, th) => { if (!crowdOK(x, y)) return false; out.push({ x, y, spr: Terrain.crowd(out.length), kind: 5, half: 70, tall: 44, al: 1, ph: r() * 6, th }); return true; };
    for (const site of sites) { crowd(site.x, site.y - 178, 16 + r() * 14); crowd(site.x + (r() > .5 ? 200 : -200), site.y - 60, 24 + r() * 18); }
    for (const lane of map.lanes) { const pts = Terrain.spline(lane, 16); let run = 0; for (let i = 1; i < pts.length; i++) { run += Math.hypot(pts[i][0] - pts[i - 1][0], (pts[i][1] - pts[i - 1][1]) * TILT); if (run < 760) continue; run = 0; const [x, y] = pts[i]; crowd(x + (r() - .5) * 120, y - 176, 22 + r() * 22); } }
    // Boss arenas are ringed with lamps in the boss's colour; the floor itself is painted into the ground.
    for (const a of map.arenas || []) { const R = (a.r || 240) - 8; const prop = Terrain.arenaProp(a.kind), n = a.kind === 'colossus' ? 8 : 4; for (let i = 0; i < n; i++) { const an = i / n * TAU + TAU / (n * 2), px = a.x + Math.cos(an) * R, py = a.y + Math.sin(an) * R; if ((map.arenas || []).some(q => q !== a && Math.hypot(q.x - px, q.y - py) < (q.r || 240) + 90)) continue; out.push({ x: px, y: py, spr: prop, kind: 1, fade: true, half: 26, tall: prop.h * .9, al: 1, ph: r() * 6, light: { r: 130, col: Art.BOSS_COL[a.kind] || '#ffb04a', a: .14 } }); } }
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
    if (u.kind === 'minion') return Art.minionTurn(u.team, typeOf(u), spriteR0(u));
    if (u.bossKind && u.bossKind !== 'colossus') return Art.bossTurn(u.bossKind, spriteR0(u));
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
      const t = INTRO_LEN - G.intro - (.2 + G.introIdx.get(c.id) * .1), mine = c === G.me;
      // 13.0 entrance: your landing spot is lit a beat before you hit it.
      if (mine && t >= FALL - .3 && !G.introCue) { G.introCue = 1; if (onScreen(c.x, c.y, 120)) FX.entranceCue(c); }
      if (t < FALL) continue;
      G.introLanded.add(c.id);
      visOf(c).squash = 1;
      if (onScreen(c.x, c.y, 120)) {
        FX.ring(c.x, c.y, mine ? 110 : 70, mine ? REL_COL.me : c.team === G.me.team ? REL_COL.ally : REL_COL.enemy, mine ? .5 : .32); FX.dust(c.x, c.y, mine ? 1.6 : 1);
        if (mine || c.team === G.me.team) FX.entrance(c, mine);
        Sound.play('clink'); if (mine) Sound.play('entrance');
      }
    }
  }
  function outroStart() {
    const o = G.outro; G.punch = .1; G.shake = 11; G.outroN = 0; G.outroB = 0;
    // 13.0 photo finish: the winning blow plays out in slow motion behind a shutter flash, then the city celebrates at full speed.
    G.photoT = 0; FX.photoStart(); Sound.play('photo');
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
    // 13.0 lead: the view leans toward where you're heading. It builds quickly when you move, holds steady
    // through small corrections, and settles back when you stop, so the space ahead of you is always on screen.
    const L = G.lead, sp = Math.hypot(me.vx || 0, me.vy || 0), up = isUp(me) && !G.outro;
    let lx = 0, ly = 0;
    if (up && sp > 30) { const k = Math.min(1, sp / 380), n = 1 / sp; lx = (me.vx || 0) * n * 190 * k; ly = (me.vy || 0) * n * 120 * k; }
    if (Ctl.aim && up) { const ad = aimDir(); if (ad) { lx = lx * .4 + ad.dx * 150; ly = ly * .4 + ad.dy * 96; } }
    const moving = lx * lx + ly * ly > 1, kl = 1 - Math.exp(-dt * (moving ? 5.5 : 2.6)); L.x += (lx - L.x) * kl; L.y += (ly - L.y) * kl;
    // Holding the minimap looks around (UI sets G.look = {x, y}); letting go snaps straight back.
    const look = G.look && !G.outro ? G.look : null;
    G.lookK = (G.lookK || 0) + ((look ? 1 : 0) - (G.lookK || 0)) * (1 - Math.exp(-dt * (look ? 14 : 18)));
    if (look) { G.lookX = look.x; G.lookY = look.y; }
    tx += L.x; ty += L.y;
    if (G.lookK > .002 && G.lookX !== undefined) { tx += (G.lookX - tx) * G.lookK; ty += (G.lookY - ty) * G.lookK; }
    if (G.intro > 0) { const k = 1 - G.intro / INTRO_LEN; ty -= (1 - k) * (1 - k) * 120; }
    if (G.outro) { tx = G.outro.x; ty = G.outro.y; }
    // Follow is tight (the coin never drifts off-centre while you steer); the look jump is near-instant both ways.
    const k = 1 - Math.exp(-dt * (G.outro ? 2.6 : G.lookK > .05 ? 16 : 12));
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

  // The wet city is baked into the ground. What moves on it gets a small streak of its own light, only where the surface is actually wet.
  function reflection() {
    const gd = G.ground; if (quality < 1 || !gd.wet) return;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < VIS_CHAMPS.length; i += 3) { const px = VIS_CHAMPS[i], py = VIS_CHAMPS[i + 1], c = VIS_CHAMPS[i + 2]; if (!gd.wet(px, py)) continue; const R = 40 * Z; ctx.globalAlpha = .3; ctx.drawImage(Terrain.pool(c === G.me ? '#ffe9b0' : c.team === G.me.team ? '#7cc0ff' : '#ff6650'), sx(px) - R, sy(py) - R * .1, R * 2, R * 2.6); }
    for (const t of G.s.towers) { if (!isUp(t) || !onScreen(t.x, t.y, 120)) continue; const R = (t.sub === 'core' ? 96 : 66) * Z; ctx.globalAlpha = .26; ctx.drawImage(Terrain.pool(t.team ? '#ff4a5c' : '#ffe2a0'), sx(t.x) - R, sy(t.y) - R * .1, R * 2, R * 3.2); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  // ---------- mood ----------
  const skyOut = { up: 0, low: 0 };
  function sky() { const h = (G.hopeS - 50) / 50; skyOut.up = Math.max(0, h); skyOut.low = Math.max(0, -h); return skyOut; }
  // Hope grades the ground only, under the units, so coins and danger always keep their full brightness.
  function groundGrade(sk) {
    const dark = Math.min(.84, sk.low * .34 + G.rain * .1 + G.black * .58);
    if (dark > .015) { ctx.globalAlpha = dark; ctx.fillStyle = G.black > .5 ? '#02030a' : G.villain ? '#1a0408' : '#05060e'; ctx.fillRect(0, 0, VW, VH); ctx.globalAlpha = 1; }
    if (sk.up > .05 && quality >= 1) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = sk.up * .05; ctx.fillStyle = '#e6c98e'; ctx.fillRect(0, 0, VW, VH); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
  }
  // ---------- 13.0: three acts ----------
  // Laning is the city as it was. City War puts both searchlights up for good. Final Hour turns the sky: a crimson grade on the
  // ground, a burning horizon at the top of the frame, embers in the air, red searchlights and dry lightning.
  function actNow() { const s = G.s; return Math.max(s.act | 0, G.actN | 0, 1); }
  function actTick(dt) {
    const n = actNow();
    G.act2K = (G.act2K || 0) + ((n >= 2 ? 1 : 0) - (G.act2K || 0)) * (1 - Math.exp(-dt * 1.4));
    G.act3K = (G.act3K || 0) + ((n >= 3 ? 1 : 0) - (G.act3K || 0)) * (1 - Math.exp(-dt * (n >= 3 ? .9 : 3)));
    if (G.act3K < .002) G.act3K = 0;
    G.spotSnap = Math.max(0, (G.spotSnap || 0) - dt * 2.2);
    if (G.act3K > .6 && dt > 0 && G.bolt <= 0 && Math.random() < dt * .045 * G.act3K) {
      G.bolt = 1; G.thunderIn = rnd(.25, .6); const pts = []; let x = rnd(VW * .1, VW * .9), y = -10; const g_ = rnd(VH * .3, VH * .6);
      while (y < g_) { pts.push(x, y); x += rnd(-30, 30); y += rnd(22, 50); } pts.push(x, g_); G.boltPts = pts; G.boltRed = 1;
    }
  }
  let horizC = null, horizH = 0;
  function actGrade() {
    const k = G.act3K || 0; if (k < .01) return;
    ctx.globalAlpha = k * .26; ctx.fillStyle = '#1c0410'; ctx.fillRect(0, 0, VW, VH);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = k * (.05 + Math.sin(G.t * 1.3) * .012); ctx.fillStyle = '#ff3020'; ctx.fillRect(0, 0, VW, VH);
    // The horizon: a band of fire light across the top, one cached gradient.
    if (!horizC || horizH !== VH) { horizH = VH; horizC = Art.cv(4, 128); const g = horizC.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,90,40,.9)'); gr.addColorStop(.25, 'rgba(200,30,40,.45)'); gr.addColorStop(.6, 'rgba(90,10,40,.12)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 4, 128); }
    ctx.globalAlpha = k * (.55 + Math.sin(G.t * .7) * .08); ctx.drawImage(horizC, 0, 0, VW, VH * .34);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  const EMBERS = [];
  function embers(dt) {
    const k = G.act3K || 0; if (k < .05 || quality < 1) return;
    const n = quality >= 2 ? 26 : 14; while (EMBERS.length < n) EMBERS.push({ x: Math.random() * VW, y: Math.random() * VH, v: rnd(30, 80), ph: Math.random() * 6, s: rnd(2, 4.5) });
    const gl = Art.glow('#ff8a3a'); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const p = EMBERS[i]; p.y -= p.v * dt; p.x += (Math.sin(G.t * 1.1 + p.ph) * 22 + 18) * dt; p.ph += dt;
      if (p.y < -10 || p.x > VW + 10) { p.y = VH + rnd(0, 40); p.x = Math.random() * VW; }
      const r = p.s * (1 + Math.sin(p.ph * 5) * .3); ctx.globalAlpha = k * (.4 + .5 * Math.max(0, Math.sin(p.ph * 2.3))); ctx.drawImage(gl, p.x - r * 2, p.y - r * 2, r * 4, r * 4);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  // Searchlights over the city. They sweep the streets while the people have hope, turn red when they don't, and die in a blackout.
  // A live event pulls the first beam onto it.
  const SWEEP = [{ a: .17, b: .29, ph: 0 }, { a: .13, b: .23, ph: 2.1 }];
  function searchlights() {
    if (quality < 1) return;
    const off = G.black; if (off > .92) return;
    const h = G.hopeS, a3 = (G.act3K || 0) > .5, red = h < 38 || a3, on = red || (G.act2K || 0) > .5 ? 2 : h > 62 ? 2 : 1, col = red ? '#ff3a3e' : G.villain ? '#ffc890' : '#ffe6b8', spr = Terrain.pool(col), bm = Terrain.beam(col), ev = G.evv, hw = VW / 2 / Z, hh = VH / 2 / (Z * TILT);
    const flicker = off > .02 ? (Math.sin(G.t * 53) > .2 ? 1 - off : (1 - off) * .4) : 1;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < on; i++) {
      const q = SWEEP[i], lock = i === 0 && ev && !ev.ended && ev.kind !== 'blackout' && onScreen(ev.x, ev.y, 100);
      G.spotK[i] += ((lock ? 1 : 0) - G.spotK[i]) * .05;
      const sp = a3 ? 1.8 : 1, k = G.spotK[i], wx0 = G.cam.x + Math.sin(G.t * q.a * sp + q.ph) * hw * .8, wy0 = G.cam.y + Math.cos(G.t * q.b * sp + q.ph * 1.7) * hh * .66, wx = k > .01 && ev ? wx0 + (ev.x - wx0) * k : wx0, wy = k > .01 && ev ? wy0 + (ev.y - wy0) * k : wy0;
      const X = sx(wx), Y = sy(wy), R = 118 * Z * (1 - k * .15), X0 = VW * (.16 + i * .68) + Math.sin(G.t * .07 + i * 3) * 34, Y0 = -26, dx = X - X0, dy = Y - Y0, L = Math.hypot(dx, dy) || 1, c = dy / L, sn = -dx / L, w = R * 1.9;
      const snap = 1 + (G.spotSnap || 0) * 1.4; ctx.globalAlpha = Math.min(1, .42 * flicker * snap); ctx.drawImage(spr, X - R, Y - R * TILT, R * 2, R * 2 * TILT);
      ctx.globalAlpha = Math.min(1, .16 * flicker * snap); ctx.setTransform(dpr * c, dpr * -sn, dpr * sn, dpr * c, dpr * X0, dpr * Y0); ctx.drawImage(bm, -w / 2, 0, w, L + R * .4); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
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
      pts.push(x, ground_); G.boltPts = pts; G.boltRed = 0;
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
    ctx.globalAlpha = G.bolt * .06; ctx.fillStyle = G.boltRed ? '#ff8a70' : '#c8d2e6'; ctx.fillRect(0, 0, VW, VH); ctx.globalAlpha = 1;
    if (G.boltPts && G.bolt > .35) {
      const p = G.boltPts; ctx.beginPath(); ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
      ctx.lineJoin = 'miter'; ctx.strokeStyle = G.boltRed ? `rgba(255,110,90,${G.bolt * .6})` : `rgba(190,206,240,${G.bolt * .6})`; ctx.lineWidth = 3; ctx.stroke(); ctx.strokeStyle = `rgba(255,255,255,${G.bolt})`; ctx.lineWidth = 1.2; ctx.stroke(); ctx.lineJoin = 'round';
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
  // Slow weather for the unseen city: a tileable bank of cloud in your side's night colour, baked once.
  let CLOUD = null, CLOUDK = -1;
  function makeCloud(cl) {
    const S2 = 256, c = Art.cv(S2, S2), g = c.getContext('2d'), r = Art.seeded(5150), sp = Terrain.pool(cl ? '#7a2a62' : '#34508e');
    for (let i = 0; i < 90; i++) { const x = r() * S2, y = r() * S2, R = 22 + r() * 56; g.globalAlpha = .08 + r() * .24; for (const dx of [-S2, 0, S2]) for (const dy of [-S2, 0, S2]) g.drawImage(sp, x + dx - R, y + dy - R, R * 2, R * 2); }
    return c;
  }
  function fogLayer(x, y, T, a) {
    const w = fogC.width, h = fogC.height; let X = ((x % T) + T) % T - T; fogG.globalAlpha = a;
    for (; X < w; X += T) { let Y = ((y % T) + T) % T - T; for (; Y < h; Y += T) fogG.drawImage(CLOUD, X, Y, T + 1, T + 1); }
  }
  function resetFog() { fogC = edgeC = null; fogKNow = 0; exC = Art.cv(Math.ceil(Sim.W / EX), Math.ceil(Sim.H * TILT / EX)); exG = exC.getContext('2d'); exT = 0; VIS_SRC = EMPTY_LIST; }
  function drawFog(dt) {
    if (G.spectator) return; // a spectator holds no seat and sees the whole map
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
    // A blackout thickens the dark and makes the map forget what it has seen.
    const black = G.black; fogG.fillStyle = black > .01 ? `rgba(2,3,8,${.93 + black * .05})` : G.villain ? 'rgba(14,5,16,.93)' : 'rgba(5,8,22,.93)'; fogG.fillRect(0, 0, w, h);
    if (quality >= 1 && black < .6) {
      const cl = G.villain ? 1 : 0; if (CLOUDK !== cl) { CLOUD = makeCloud(cl); CLOUDK = cl; }
      const Zk = Z / k, wx = (VW / 2 - G.cam.x * Z) / k, wy = (VH / 2 - G.cam.y * TILT * Z) / k;
      fogG.globalCompositeOperation = 'source-over'; fogLayer(wx + G.t * 9 * Zk, wy + G.t * 3 * Zk, 760 * Zk, .55 * (1 - black)); fogLayer(wx * .74 - G.t * 14 * Zk, wy * .74 + G.t * 5 * Zk, 1180 * Zk, .4 * (1 - black)); fogG.globalAlpha = 1;
    }
    const ox = (-G.cam.x * Z + VW / 2 + shX) / k, oy = (-G.cam.y * TILT * Z + VH / 2 + shY) / k, q = EX * Z / k;
    fogG.globalCompositeOperation = 'destination-out'; fogG.imageSmoothingEnabled = true;
    fogG.globalAlpha = .34 * (1 - black * .75); fogG.drawImage(exC, ox, oy, exC.width * q, exC.height * q);
    fogG.globalAlpha = 1;
    const ZK = Z / k;
    for (const v of list) { const R = v.r * ZK, X = (sx(v.x)) / k, Y = (sy(v.y)) / k, Ry = R * TILT; if (X + R < 0 || X - R > w || Y + Ry < 0 || Y - Ry > h) continue; fogG.drawImage(HOLE, X - R, Y - Ry, R * 2, Ry * 2); }
    // The vision edge: every circle, grown a little and then cut by the same circles shrunk, leaves one line around their union.
    // It and the vignette are composited into this small mask, so the frame pays for one full-screen layer instead of three.
    fogG.globalCompositeOperation = 'source-over';
    if (quality >= 1) {
      const cl = team === 1 ? 1 : 0; if (RIMK !== cl) { RIM = makeRim(cl); RIMK = cl; }
      edgeG.setTransform(1, 0, 0, 1, 0, 0); edgeG.globalCompositeOperation = 'source-over'; edgeG.clearRect(0, 0, w, h);
      const d0 = .985, d1 = .965;
      for (const v of list) { const R = v.r * ZK * d0, X = sx(v.x) / k, Y = sy(v.y) / k, Ry = R * TILT; if (X + R < 0 || X - R > w || Y + Ry < 0 || Y - Ry > h) continue; edgeG.drawImage(RIM, X - R, Y - Ry, R * 2, Ry * 2); }
      edgeG.globalCompositeOperation = 'destination-out';
      for (const v of list) { const R = v.r * ZK * d1, X = sx(v.x) / k, Y = sy(v.y) / k, Ry = R * TILT; if (X + R < 0 || X - R > w || Y + Ry < 0 || Y - Ry > h) continue; edgeG.drawImage(RIM, X - R, Y - Ry, R * 2, Ry * 2); }
      fogG.globalAlpha = .5; fogG.drawImage(edgeC, 0, 0); fogG.globalAlpha = 1;
      fogG.drawImage(Art.vignette(VW | 0, VH | 0), 0, 0, w, h);
    }
    ctx.imageSmoothingEnabled = true; ctx.drawImage(fogC, 0, 0, w * k, h * k);
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
      if (c.d === undefined || c.d < 0 || busy) {
        ctx.globalAlpha = c.alive ? .7 : .22;
        ctx.strokeStyle = '#d9cfb4'; ctx.lineWidth = 1.5; DASH2[0] = 10 * Z + 2; DASH2[1] = 9 * Z + 2; ctx.setLineDash(DASH2); ctx.lineDashOffset = -G.t * 6;
        ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, 0, TAU); ctx.stroke(); ctx.setLineDash(NO_DASH); ctx.lineDashOffset = 0; ctx.globalAlpha = 1;
      }
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
    if (v.atkT >= 0) atkPose(m, v, dt, px, py);
    return v;
  }
  // A footsoldier's attack. Melee rears back and drives in, heavy heaves up and slams, ranged kicks back as it looses.
  const MIN_ATK = { melee: { d: .36, hit: .4 }, ranged: { d: .26, hit: 0 }, heavy: { d: .52, hit: .56 } };
  function atkPose(m, v, dt, px, py) {
    const type = typeOf(m), A = MIN_ATK[type] || MIN_ATK.melee;
    v.atkT += dt;
    const f = v.atkT / A.d, was = (v.atkT - dt) / A.d;
    if (f >= 1) { v.atkT = -1; v.lgo = v.lgz = v.lgb = 0; return; }
    const ease = x => 1 - Math.pow(2, -9 * x);
    let off = 0, lz = 0, blade = 0;
    if (type === 'melee') {
      if (f < .3) off = -7 * (f / .3); else if (f < .52) off = -7 + 31 * ease((f - .3) / .22); else off = 24 * Math.pow(1 - (f - .52) / .48, 2);
      blade = f < .3 ? .3 * (f / .3) : f < .52 ? .3 + .7 * ease((f - .3) / .22) : 1 - (f - .52) / .48;
    } else if (type === 'heavy') {
      if (f < .56) { const u = f / .56; off = -5 * u; lz = 26 * Math.sin(u * Math.PI / 2) * (u > .86 ? 1 - (u - .86) / .14 : 1); } else off = 12 * Math.pow(1 - (f - .56) / .44, 2);
    } else off = -9 * Math.pow(1 - f, 2);
    v.lgo = off; v.lgz = lz; v.lgb = blade;
    if (was <= A.hit && f > A.hit && v.hitX !== undefined && onScreen(px, py, 60)) FX.minionHit(type, v.hitX, v.hitY, m.team, v);
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
  const hqOrLean = o => quality >= 2 && o.kind === 3;
  function drawDecor(o, me, dt) {
    const X = sx(o.x), Y = sy(o.y), spr = o.spr;
    if (o.fade) {
      const rear = hides(o.x, o.half, o.y, o.tall / TILT);
      o.al += ((rear ? .3 : 1) - o.al) * (1 - Math.exp(-dt * 10));
      if (o.al < .995) ctx.globalAlpha = o.al;
    }
    if (o.kind === 5) {
      // The crowd thins with the people bar and vanishes at the worst of it; a win nearby sets them cheering.
      const show = clamp01((G.hopeS - (o.th || 20)) / 14) * (1 - G.black * .8); if (show < .03) { ctx.globalAlpha = 1; return; }
      const cheer = G.cheer > 0 ? 9 : 1.4 + clamp01((G.hopeS - 50) / 50) * 3, fr = spr.frames[(G.t * cheer + o.ph | 0) % 2], k = Z * .92;
      ctx.globalAlpha = (o.al < .995 ? o.al : 1) * show; ctx.drawImage(fr, X - spr.ax * k, Y - spr.ay * k, spr.w * k, spr.h * k); ctx.globalAlpha = 1; return;
    }
    const lean = leanAt(X);
    if (o.kind === 1) {
      const sh = (o.sway ? Math.sin(G.t * 2.6 + o.ph) * .1 : Math.sin(G.t * 1.9 + o.ph) * .03) + lean * .5, img = spr.frames ? spr.frames[Math.floor(G.t * 5 + o.ph) % spr.frames.length] : spr.c, lift = (o.z || 0) * Z;
      ctx.setTransform(dpr * Z, 0, -dpr * Z * sh, dpr * Z, dpr * X, dpr * (Y - lift)); ctx.drawImage(img, -spr.ax, -spr.ay, spr.w, spr.h); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    } else {
      const shear = -lean * (o.kind >= 2 ? .6 : .34);
      ctx.setTransform(dpr * Z, 0, dpr * Z * shear, dpr * Z, dpr * X, dpr * Y);
      if (o.kind >= 2) {
        // Extrusion only away from screen centre, where a side wall can actually be seen.
        if (hqOrLean(o)) {
        // Extrusion: the silhouette swept up in one image, sheared toward the centre of the screen. Lit from the side it faces.
        const hq = o.kind === 3, d = hq ? 26 : 16, up = d * .9, back = Terrain.backOf(spr, hq ? '#04060a' : '#060910', '#222c3c', up), bx = -lean * d * 2.4;
        // The side wall opens toward the top: a touch of offset at the foot, the rest as shear up the full height.
        ctx.setTransform(dpr * Z, 0, dpr * Z * (shear - bx * .65 / spr.h), dpr * Z, dpr * (X + bx * .35 * Z), dpr * Y);
        ctx.drawImage(back.c, -spr.ax, -spr.ay - back.up, spr.w, back.h);
        ctx.setTransform(dpr * Z, 0, dpr * Z * shear, dpr * Z, dpr * X, dpr * Y);
        }
      }
      if (spr.L && o.kind >= 2) {
        // Each building answers the people bar at its own threshold, so a street goes dark window by window. Steady state is a single image.
        if (o.th === undefined) { o.th = o.kind === 3 ? -999 : 8 + ((o.ph || 0) * 7.3 % 1) * 40; o.lit = 1; }
        const target = o.kind === 3 ? 1 : clamp01((G.hopeS - o.th) / 8) * (1 - G.black);
        o.lit += (target - o.lit) * (1 - Math.exp(-dt * 3));
        const lit = Terrain.litOf(spr);
        if (o.lit > .97) ctx.drawImage(lit, -spr.ax, -spr.ay, spr.w, spr.h);
        else { ctx.drawImage(spr.c, -spr.ax, -spr.ay, spr.w, spr.h); if (o.lit > .03) { const al = ctx.globalAlpha; ctx.globalAlpha = al * o.lit; ctx.drawImage(lit, -spr.ax, -spr.ay, spr.w, spr.h); ctx.globalAlpha = al; } }
      } else ctx.drawImage(spr.c, -spr.ax, -spr.ay, spr.w, spr.h);
      // The capitals throw light into the sky: gold searchlights from the sunburst, a poison flare off the reactor.
      if (o.kind === 3 && quality >= 2 && G.black < .5) {
        const vil = o.x > Sim.W / 2, bm = Terrain.beam(vil ? '#b6ec3a' : '#ffe6b8'), tip = spr.ay - (vil ? 32 : 22); ctx.globalCompositeOperation = 'lighter'; ctx.translate(0, -tip);
        for (let i = 0; i < 2; i++) { const a = Math.PI + Math.sin(G.t * (vil ? .9 : .42) + i * 2.4 + o.ph) * (vil ? .14 : .42) + (i ? .24 : -.24); ctx.save(); ctx.rotate(a); ctx.globalAlpha = (o.al < .995 ? o.al : 1) * .22 * (1 - G.black); ctx.drawImage(bm, -60, 0, 120, 560); ctx.restore(); }
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    ctx.globalAlpha = 1;
  }
  function drawWall(o, dt) {
    const sp = o.spr, wl = o.w, rear = hides(wl.x + wl.w / 2, wl.w / 2 + 16, wl.y + 2, (sp.lift + 74) / TILT);
    o.al = o.al === undefined ? 1 : o.al + ((rear ? .36 : 1) - o.al) * (1 - Math.exp(-dt * 10));
    if (o.al < .995) ctx.globalAlpha = o.al;
    { const Xw = sx(wl.x + wl.w / 2), lean = leanAt(Xw) * .34; ctx.setTransform(dpr * Z, 0, -dpr * Z * lean, dpr * Z, dpr * (sx(wl.x) - sp.P * Z + lean * sp.h * Z), dpr * (sy(wl.y) - (sp.lift + sp.P) * Z)); if (sp.L) { if (o.th === undefined) { o.th = 8 + ((wl.x * 7.3 + wl.y) % 40); o.lit = 1; } const lt = clamp01((G.hopeS - o.th) / 8) * (1 - G.black); o.lit += (lt - o.lit) * (1 - Math.exp(-dt * 3)); const lit = Terrain.litOf(sp); if (o.lit > .97) ctx.drawImage(lit, 0, 0, sp.w, sp.h); else { ctx.drawImage(sp.c, 0, 0, sp.w, sp.h); if (o.lit > .03) { const al = ctx.globalAlpha; ctx.globalAlpha = al * o.lit; ctx.drawImage(lit, 0, 0, sp.w, sp.h); ctx.globalAlpha = al; } } } else ctx.drawImage(sp.c, 0, 0, sp.w, sp.h); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
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
    spotlight(X, Y, R * Z, mine ? '#fff0c8' : ally ? '#8ec2f2' : (Art.cb ? Art.PAL.enemy : '#ff6a5a'), mine ? .42 : .3);
    const wl = wantedLv(c); if (wl >= 0) wantedLight(c, v, X, Y, R, wl);
    if (mine) meMarker(X, Y, ringR); else teamRing(X, Y, ringR, ally);
    if (c.tier >= 3 && mine) { const gl = Art.glow(AURA[c.tier]), r = (40 + (c.tier - 3) * 5) * Z; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .18 + Math.sin(G.t * 3 + v.phase) * .05; ctx.drawImage(gl, X - r, Y - z * Z - r, r * 2, r * 2); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
    // Stealth: you and your friends see a shimmer of the coin; enemies have nothing to see unless the sim says so.
    const hidden = c.stealthT > 0 ? (.32 + Math.sin(G.t * 7 + v.phase) * .12) : 1, alpha = (c.inBrush >= 0 ? (ally ? .82 : 1) : 1) * hidden;
    // Polymorphed: for a moment this is just a plain spinning coin.
    let top;
    if (c.polyT > 0) top = drawCoin(FX.goldCoin(), X, Y, z, R * .9, coinOpt(Math.cos(G.t * 14), v.flash, 0, 0, undefined, 1, .9, '#6a5428'));
    else top = drawCoin(sprOf(c, v), X, Y, z, R, coinOpt(1, v.flash, v.lean, Math.max(v.squash, 0) * .9 + (v.osq || 0) - (moving ? air * .1 : 0), undefined, alpha, clamp01(1 - izf / 900) * .9, undefined, undefined, v.yaw + (v.oyaw || 0) + spinAng));
    statusMarks(c, v, X, top, me, Rp);
    if (evading(c, v)) evadeShimmer(c, v, X, top, Rp);
    // A price on their head: a small seal pinned to the upper rim, bigger and brighter as the bounty grows.
    if (c.bounty >= BOUNTY_AT[0] && !c.polyT) { const grade = c.bounty >= BOUNTY_AT[2] ? 2 : c.bounty >= BOUNTY_AT[1] ? 1 : 0, b = Art.bountyMark(grade), w = (15 + grade * 2) * (1 + Math.max(0, Math.sin(G.t * 4 + v.phase)) * .08), bx = X + Rp * .72, by = top - Rp * 1.02; ctx.globalAlpha = hidden; ctx.drawImage(b.c, bx - w / 2, by - w / 2, w, w); ctx.globalAlpha = 1; }
    if (c.chan && c.chan.recall && c.chan.total) { ctx.strokeStyle = TEAM[c.team]; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(X, top, 36 * Z, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - c.chan.t / c.chan.total)); ctx.stroke(); }
    if (c.echo && c.recast && c.recast[1] > 0 && ally) drawCoin(sprOf(c, v), sx(c.echo.x), sy(c.echo.y), 9, R, coinOpt(1, 0, 0, 0, undefined, .4));
    if (mine) b_meTop = 1;
  }
  let b_meTop = 0;
  const BOUNTY_AT = [1, 300, 600];

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
    if (open) { const gl = Art.glow(Art.PAL.towerLight[t.team ? 1 : 0]), gr = (core ? 44 : 32) * k, gy = topY - (core ? 74 : 54) * k, X_ = X + (shown - 1) * step * lean; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = (.32 + Math.sin(G.t * 3) * .08) * al; ctx.drawImage(gl, X_ - gr, gy - gr, gr * 2, gr * 2); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
    if (standOn(t.team)) overcharge(t, X + (shown - 1) * step * lean, topY, core, al);
    if (core) drawCoin(v.coreS || (v.coreS = Art.coin('corecoin' + t.team, 56, 'boss', Art.METAL['minion' + t.team], t.team, 3)), X + (shown - 1) * step * lean, topY - 96 * k, 0, 24, coinOpt(Math.cos(G.t * 1.3), 0, 0, 0, undefined, al, undefined, '#6a5428', true));
  }
  // What's left of a tower. While it falls the stack sinks into its own footing; after that there's only flat rubble on the ground layer.
  function drawFallen(t, v) {
    const art = artOf(t), f = clamp01(v.fallT / .34); if (f >= 1) return;
    const n = art.n, d = Terrain.towerCoin(t.team, art.R), X = sx(t.x), Y = sy(t.y), k = Z, step = art.R * STEP * k * (1 - f * f), sink = f * f * 34 * k;
    ctx.globalAlpha = 1 - f * f;
    for (let i = 0; i < n; i++) { const q = k * (1 - i / n * .17), jit = Math.sin(i * 7.3 + v.fallT * 40) * (2 + f * 8) * k; ctx.drawImage(d.c, X - d.cx * q + jit, Y - d.cy * q - i * step + sink, d.w * q, d.h * q); }
    ctx.globalAlpha = 1;
  }
  const RUB = []; let rubN = 0;
  function drawRubble() {
    for (let i = 0; i < rubN; i += 2) {
      const t = RUB[i], v = RUB[i + 1], f = clamp01((v.fallT - .18) / .34), e = f * f * (3 - 2 * f); if (e <= 0) continue;
      const spr = Terrain.rubble(t.team, t.sub === 'core'), w = spr.w * Z, h = spr.h * Z;
      ctx.globalAlpha = e; ctx.drawImage(spr.c, sx(t.x) - w / 2, sy(t.y) - h / 2, w, h);
    }
    ctx.globalAlpha = 1;
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
        { const wl = wantedLv(u); if (wl >= 0) wantedPlaque(u, v, X, y - (!mine && !ally ? 17 : mine ? 18 : 4), wl, dt); }
      } else if (u.kind === 'tower') {
        const art = artOf(u), open = towerOpenU(u), y = Y - (art.n * art.R * STEP + art.crown) * Z - 6;
        if (u.hp < u.maxHp || open) bar(X - 34 * Z, y, 68 * Z, 5, f, open ? (ally ? REL_COL.ally : REL_COL.enemy) : 'rgba(150,158,170,.7)');
      } else if (u.hp < u.maxHp) {
        if (u.kind === 'minion') { const w = 22 * Z, x = X - w / 2, y = Y - (artR(u) * 1.9 + 7) * Z; ctx.fillStyle = 'rgba(4,6,10,.85)'; ctx.fillRect(x - .5, y - .5, w + 1, 3); ctx.fillStyle = ally ? '#58b0ff' : (Art.cb ? Art.PAL.enemy : '#ff4a44'); ctx.fillRect(x, y, w * f, 2); }
        else { const r = artR(u); bar(X - r * Z, Y - (r * 1.9 + 8) * Z, r * 2 * Z, u.boss ? 6 : 3.5, f, '#d9b86a'); }
      }
    }
  }

  // Minion rings are gathered up and stroked as two paths, on the ground under everything.
  const MRING = new Float32Array(240); let minRingN = 0;
  function minionRings() {
    for (let pass = 0; pass < 2; pass++) {
      let any = false; ctx.beginPath();
      for (let i = 0; i < minRingN; i += 4) { if (MRING[i + 3] !== pass) continue; const X = MRING[i], Y = MRING[i + 1], R = MRING[i + 2]; ctx.moveTo(X + R, Y); ctx.ellipse(X, Y, R, R * TILT, 0, 0, TAU); any = true; }
      if (any) { ctx.strokeStyle = pass ? 'rgba(255,63,58,.7)' : 'rgba(88,176,255,.65)'; ctx.lineWidth = 1.2; ctx.stroke(); }
    }
  }
  function drawMinion(u, v, px, py) {
    const type = typeOf(u), off = v.lgo || 0, dx = v.adx || 0, dy = v.ady || 0, hover = type === 'ranged' ? 7 : 0, z = 5 + hover + (v.lgz || 0) + Math.abs(Math.sin(v.hop)) * (u.vx || u.vy ? 3 : .5), X = sx(px + v.rx + dx * off), Y = sy(py + v.ry + dy * off), R = artR(u), Rp = R * Z;
    if (type === 'heavy') { const g = Art.minionGear(u.team, 'heavy'), k = R / 21 * Z; ctx.drawImage(g.c, X - g.ax * k, Y - (z + 7) * Z - g.ay * k, g.w * k, g.h * k); }
    drawCoin(sprOf(u, v), X, Y, z, R, coinOpt(1, v.flash, v.lean, v.squash, undefined, undefined, .8, u.team ? '#3a1a22' : '#22324c', undefined, v.yaw || 0));
    if (type === 'melee') {
      // The blade rides out from the rim toward whatever it's fighting, so a lane reads as a fight even at this size.
      let fx = dx, fy = dy; if (!fx && !fy) { fx = u.fx || 0; fy = u.fy || 0; } const L = Math.hypot(fx, fy * TILT) || 1, ux = fx / L || (u.team ? -1 : 1), uy = fy * TILT / L, g = Art.minionGear(u.team, 'melee'), k = Z * .7, reach = Rp * .72 + (v.lgb || 0) * 11 * Z, cy = Y - z * Z;
      ctx.setTransform(dpr * ux * k, dpr * uy * k, -dpr * uy * k, dpr * ux * k, dpr * (X + ux * reach), dpr * (cy + uy * reach)); ctx.drawImage(g.c, -g.ax, -g.ay, g.w, g.h); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    } else if (type === 'ranged' && v.atkT >= 0) { const gl = Art.glow(u.team ? '#ff9a7a' : '#ffe6a8'), r = 12 * Z * (1 - v.atkT / .26); if (r > 1) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(gl, X + dx * Rp - r, Y - z * Z + dy * Rp * TILT - r, r * 2, r * 2); ctx.globalCompositeOperation = 'source-over'; } }
  }
  // Boss presence: the kind's own ring turns slowly under it. Everything loud happens when it dies.
  const BOSS_SIG = { warlord: 'crash', foreman: 'stomp', sentinel: 'hex', colossus: 'rupture' };
  function drawMonster(u, v, px, py) {
    const lift = u.boss ? bossLift(u) : 0, X = sx(px + v.rx), Y = sy(py + v.ry), z = u.boss ? 16 + Math.sin(G.t * 1.8) * 3 + lift : 6 + Math.abs(Math.sin(v.hop)) * 3, R = artR(u);
    if (u.boss) {
      bossWatch(u, v);
      // Later phases turn the ring faster and hotter; the last one burns.
      const ph = Math.max(1, u.phase | 0), kind = u.bossKind || 'colossus', bc = Art.BOSS_COL[kind] || '#ffb04a', sig = Art.sigil(BOSS_SIG[kind] || 'mark', ph >= 3 ? '#ff4a2a' : bc), rr = (R + 44 + (ph - 1) * 10) * Z, rot = G.t * (.4 + (ph - 1) * .5), c = Math.cos(rot) * rr, sn = Math.sin(rot) * rr;
      v.roar = Math.max(0, (v.roar || 0) - rdt * 2.4);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .55 + v.roar * .4; ctx.setTransform(dpr * c, dpr * sn * TILT, -dpr * sn, dpr * c * TILT, dpr * X, dpr * Y); ctx.drawImage(sig, -1, -1, 2, 2); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (ph >= 3 || v.roar > 0) { const gr = R * Z * (1.7 + v.roar * .8), al = (ph >= 3 ? .28 + Math.sin(G.t * 8) * .08 : 0) + v.roar * .4; ctx.globalAlpha = Math.min(1, al); ctx.drawImage(Art.glow(ph >= 3 ? '#ff5a2a' : bc), X - gr, Y - (z + R * .9) * Z - gr, gr * 2, gr * 2); }
      if (lift > 2) { const sh = Art.shadow(), w = R * Z * (1.5 - lift / 140); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = .5; ctx.drawImage(sh, X - w, Y - w * .32, w * 2, w * .64); }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    const top = drawCoin(sprOf(u, v), X, Y, z, R, coinOpt(1, v.flash, v.lean, v.squash, undefined, undefined, undefined, u.boss ? '#5a3f22' : '#3a3226', undefined, u.boss ? Math.sin(G.t * .9) * .26 : (v.yaw || 0)));
    if (u.shellT > 0) { const rr = R * Z * (1.28 + Math.sin(G.t * 6) * .02), col = '#a8f0ff'; ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + G.t * .6, x0 = X + Math.cos(a) * rr, y0 = top + Math.sin(a) * rr * .86; if (i) ctx.lineTo(x0, y0); else ctx.moveTo(x0, y0); } ctx.closePath(); ctx.stroke(); }
  }

  // ---------- districts ----------
  // Art reads only s.districts: owner flips are noticed here, so hosts and guests see the same thing whatever events arrive.
  const DIST_BACK = { subway: 40 };
  const BANK_BACK = 118, LAND_K = { hospital: .74, bank: .7, power: .74, comms: .82, armory: .76, subway: 1 };
  // Mine or theirs, the same blue and red as unit rings and the minimap. Hero and villain differ in how a place is taken, not in this colour.
  const ownCol = o => o < 0 ? '#aab8cc' : o === G.me.team ? REL_COL.ally : Art.cb ? Art.PAL.enemy : REL_COL.enemy;
  function distKind(d) { const k = String(d.kind || '').toLowerCase(); return /hosp/.test(k) ? 'hospital' : /bank/.test(k) ? 'bank' : /power/.test(k) ? 'power' : /comm/.test(k) ? 'comms' : /armo/.test(k) ? 'armory' : /sub|metro/.test(k) ? 'subway' : 'comms'; }
  const distOwner = d => d.owner === 0 || d.owner === 1 ? d.owner : -1;
  function distVis(d) {
    let v = G.dv.get(d.id); if (v) return v;
    const kind = distKind(d), own = distOwner(d);
    v = { kind, k: LAND_K[kind] || 1, own, scar: clamp01(d.scar || 0), h: 0, b: 0, fade: 1, flip: 0, ph: (d.x * 7 + d.y * 3) % 6.28, smk: 1, fxT: 0, back: kind === 'bank' ? BANK_BACK : DIST_BACK[kind] !== undefined ? DIST_BACK[kind] : Math.min((d.r || 200) * .62, 118) };
    G.dv.set(d.id, v); return v;
  }
  function distCap(d, v, dt) {
    const f = clamp01(d.prog || 0), by = d.by, k = 1 - Math.exp(-dt * 8);
    v.h += ((by === 0 ? f : 0) - v.h) * k; v.b += ((by === 1 ? f : 0) - v.b) * k;
  }
  const distDark = own => { const b = G.s.blackT; return !!b && own >= 0 && b[own] > 0; };
  function districtsTick(dt) {
    const list = G.s.districts; if (!list) return;
    for (let i = 0; i < list.length; i++) {
      const d = list[i], v = distVis(d), own = distOwner(d);
      if (own !== v.own) { const was = v.own; v.own = own; v.flip = 1; if (!G.replay && onScreen(d.x, d.y, 260)) FX.districtFlip(d, was, own, v.kind); }
      v.flip = Math.max(0, v.flip - dt * .9);
      distCap(d, v, dt);
      { const hurt = clamp01(d.scar || 0); v.scar += (hurt - v.scar) * (1 - Math.exp(-dt * (hurt > v.scar ? 2.2 : 1.5))); }
      if (!onScreen(d.x, d.y, 300)) continue;
      if (v.h > .01 || v.b > .01) FX.districtWork(d, v, dt);
      push(d.y - v.back, 11, d);
      if (quality >= 1 && v.scar > .5 && dt > 0 && (v.smk -= dt) <= 0 && G.smoke.length < 14) { v.smk = rnd(1.1, 2); G.smoke.push({ x: d.x + rnd(-70, 70), y: d.y - v.back, z: 90, t: 0, max: rnd(2.2, 3.2), dark: true, ph: rnd(0, 6) }); }
    }
  }
  function districtGround() {
    const list = G.s.districts; if (!list) return;
    ctx.lineCap = 'butt';
    for (let i = 0; i < list.length; i++) {
      const d = list[i], r = d.r || 200; if (!onScreen(d.x, d.y, (r + 60) * Z)) continue;
      const v = distVis(d), X = sx(d.x), Y = sy(d.y), own = v.own, pad = Terrain.districtPad(v.kind), Rp = r * Z * (pad.w / 2 / pad.R), Hp = Rp * TILT, Rr = r * Z, Ry = Rr * TILT;
      if (v.scar > .02) { ctx.globalAlpha = v.scar; ctx.drawImage(Terrain.districtScar().c, X - Rp, Y - Hp, Rp * 2, Hp * 2); ctx.globalAlpha = 1; }
      if (own >= 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .17 + v.flip * .4; { const Rg = Rr * .72, Yg = Ry * .72; ctx.drawImage(Terrain.pool(ownCol(own)), X - Rg, Y - Yg, Rg * 2, Yg * 2); } ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
      ctx.beginPath(); ctx.ellipse(X, Y, Rr, Ry, 0, 0, TAU);
      if (d.contested) { ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.stroke(); ctx.strokeStyle = ownCol((G.t * 5 | 0) % 2); ctx.lineWidth = 3.2; ctx.stroke(); }
      else if (own >= 0) { ctx.strokeStyle = INK; ctx.lineWidth = 6; ctx.stroke(); ctx.strokeStyle = ownCol(own); ctx.lineWidth = 3.2; ctx.stroke(); }
      else { ctx.strokeStyle = 'rgba(217,207,180,.42)'; ctx.lineWidth = 1.6; ctx.stroke(); }
      if (v.h > .01 || v.b > .01) { const R2 = Rr * .92, Y2 = Ry * .92; siteArc(X, Y, R2, Y2, ownCol(0), v.h, false); siteArc(X, Y, R2, Y2, ownCol(1), v.b, true); }
      if (v.kind === 'comms' && own >= 0 && quality >= 1 && !distDark(own)) { const a = G.t * .9 + v.ph; ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = ownCol(own); ctx.globalAlpha = .55; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.ellipse(X, Y, Rr * .82, Ry * .82, 0, a, a + .8); ctx.stroke(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    }
  }
  function districtSpark(x0, y0, x1, y1, seed) {
    ctx.moveTo(x0, y0);
    const dx = x1 - x0, dy = y1 - y0;
    for (let i = 1; i < 6; i++) { const f = i / 6, o = Math.sin(seed * 13.7 + i * 5.3) * 15 * Z; ctx.lineTo(x0 + dx * f, y0 + dy * f + o); }
    ctx.lineTo(x1, y1);
  }
  function drawDistrict(d) {
    const v = G.dv.get(d.id); if (!v) return;
    const spr = Terrain.landmark(v.kind), wy = d.y - v.back, X = sx(d.x), Y = sy(wy), own = v.own, ev = G.evv, K = v.k, Zk = Z * K, rear = hides(d.x, spr.half * K, wy, spr.top * K / TILT);
    v.fade += ((rear ? .32 : 1) - v.fade) * (1 - Math.exp(-rdt * 10));
    let al = v.fade;
    // During a Heist the event draws this same bank at this same spot, with its own door.
    const swap = v.kind === 'bank' && ev && !ev.ended && ev.kind === 'heist' && ev.host;
    if (swap) al *= 1 - clamp01(ev.al); if (al < .02) return;
    const shear = v.kind === 'subway' ? 0 : -leanAt(X) * .6;
    ctx.globalAlpha = al; ctx.setTransform(dpr * Zk, 0, dpr * Zk * shear, dpr * Zk, dpr * X, dpr * Y); ctx.drawImage(spr.c, -spr.ax, -spr.ay, spr.w, spr.h);
    if (v.kind === 'bank') { const door = Terrain.vaultDoor(); ctx.drawImage(door.c, -door.ax, spr.src.doorY - spr.ay - 54 - door.ay, door.w, door.h); }
    if (v.scar > .02) { ctx.globalAlpha = al * v.scar; ctx.drawImage(Terrain.landRuin(spr, v.kind), -spr.ax, -spr.ay, spr.w, spr.h); }
    // Lights: owner's colour; neutral buildings stay dim; damage makes them stutter; panic overrides them all.
    const panic = G.moodK < 0 && G.moodT > 0, rally = G.moodK > 0 && G.moodT > 0, on = (own < 0 ? .3 : .85) * (distDark(own) ? .18 : 1) * (1 - G.black * .85) * (v.scar > .5 && (G.t * 7 + v.ph | 0) % 5 === 0 ? .35 : 1) + v.flip * .4 + (rally ? .3 : 0);
    const col = panic && (G.t * 6 | 0) % 2 ? '#ff3038' : rally ? '#ffe6a8' : ownCol(own);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, on) * al; ctx.drawImage(Terrain.landLit(spr, col), -spr.ax, -spr.ay, spr.w, spr.h);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = al;
    if (own >= 0 && spr.flag) { const f = Terrain.districtFlag(ownCol(own)); ctx.drawImage(f.frames[(G.t * 5 + v.ph | 0) % 2], spr.flag[0] - f.ax, -spr.flag[1] - f.ay, f.w, f.h); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Only a couple of things move, and only on a live building.
    ctx.globalCompositeOperation = 'lighter';
    if (v.kind === 'power' && (own >= 0 || G.black > .05) && quality >= 1) {
      const blackout = G.black > .05, tick = G.t * (blackout ? 30 : 16) | 0;
      if (blackout || tick % 3 !== 0) { const [a, b] = spr.coils; ctx.strokeStyle = blackout || own < 0 ? '#d8ecff' : ownCol(own); ctx.globalAlpha = al * .9; ctx.lineWidth = 2.2; ctx.beginPath(); districtSpark(X + (a[0] - shear * a[1]) * Zk, Y - a[1] * Zk, X + (b[0] - shear * b[1]) * Zk, Y - b[1] * Zk, tick); ctx.stroke(); }
    } else if (v.kind === 'comms' && own >= 0 && !distDark(own)) {
      const tip = Y - spr.tip * Zk, p = (G.t * .7 + v.ph) % 1, R = (10 + p * 90) * Z; ctx.strokeStyle = ownCol(own); ctx.globalAlpha = al * (1 - p) * .7; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.ellipse(X - shear * spr.tip * Zk, tip, R, R * .5, 0, 0, TAU); ctx.stroke();
    } else if (v.kind === 'subway') {
      const me = G.me, ready = own === me.team && me.alive && Math.hypot(me.x - d.x, me.y - d.y) < (d.r || 110) + 20;
      if (ready) { const R = (46 + Math.sin(G.t * 5) * 6) * Z; ctx.globalAlpha = .75; ctx.drawImage(Art.glow(Terrain.DIST_COL.subway), X - R, Y - 24 * Z - R, R * 2, R * 2); }
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  // ---------- map events: the set pieces ----------
  function eventTick(dt) {
    const e = G.s.event; let v = G.evv;
    if (e && (!v || v.kind !== e.kind || v.ended)) { v = G.evv = { kind: e.kind, x: e.x, y: e.y, al: 0, ended: false, face: 1, door: 0, e, lastX: e.x, host: false }; if (e.kind === 'blackout' || e.kind === 'heist') for (const d of G.s.districts || EMPTY_LIST) if (distKind(d) === (e.kind === 'heist' ? 'bank' : 'power') && Math.hypot(d.x - e.x, d.y - e.y) < (d.r || 200) + 60) v.host = true; }
    if (v) {
      if (e && e.kind === v.kind) { const dx = e.x - v.lastX; if (Math.abs(dx) > .4) v.face = dx < 0 ? -1 : 1; v.lastX = e.x; v.x = e.x; v.y = e.y; v.e = e; v.al = Math.min(1, v.al + dt * 3); v.door += (clamp01(e.prog ? e.prog[1] : 0) - v.door) * (1 - Math.exp(-dt * 6)); }
      else { v.ended = true; v.al -= dt * .8; if (v.al <= 0) { G.evv = null; v = null; } }
    }
    const blackOn = (e && e.kind === 'blackout' && e.phase === 'live') || (G.s.blackT && G.s.blackT[G.me.team] > 0) ? 1 : 0;
    G.black += (blackOn - G.black) * (1 - Math.exp(-dt * (blackOn ? 2.4 : 1.2))); if (G.black < .002) G.black = 0;
    G.cheer = Math.max(0, G.cheer - dt);
    if (v && !v.ended && v.kind !== 'blackout' && !G.helis.some(h => h.event) && quality >= 1) G.helis.push({ x: v.x - 900, y: v.y - 80, z: 190, vx: 240, vy: 0, event: true });
  }
  function eventRing(v, e, R) {
    const X = sx(v.x), Y = sy(v.y), Rw = (R || e.r || 180) * Z, Ry = Rw * TILT;
    ctx.globalAlpha = v.al * .8; ctx.strokeStyle = '#e6d19c'; ctx.lineWidth = 1.6; DASH2[0] = 12 * Z + 2; DASH2[1] = 10 * Z + 2; ctx.setLineDash(DASH2); ctx.lineDashOffset = -G.t * 14;
    ctx.beginPath(); ctx.ellipse(X, Y, Rw, Ry, 0, 0, TAU); ctx.stroke(); ctx.setLineDash(NO_DASH); ctx.lineDashOffset = 0; ctx.globalAlpha = v.al;
    if (e && e.prog) { ctx.lineCap = 'butt'; siteArc(X, Y, Rw, Ry, TEAM[0], clamp01(e.prog[0]), false); siteArc(X, Y, Rw, Ry, TEAM[1], clamp01(e.prog[1]), true); }
    ctx.globalAlpha = 1;
  }
  // Alternating red and blue, for anything with a siren on it.
  function siren(X, Y, r, phase) {
    const blue = Math.sin(G.t * 11 + phase) > 0, gl = Art.glow(blue ? '#4a86ff' : '#ff3038'); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .9; ctx.drawImage(gl, X - r, Y - r, r * 2, r * 2); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  function sirenWash(X, Y, R) {
    const blue = Math.sin(G.t * 5.5) > 0, p = Terrain.pool(blue ? '#3a70ff' : '#ff2c34'); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .42; ctx.drawImage(p, X - R, Y - R * TILT, R * 2, R * 2 * TILT); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  function drawEvent(v) {
    const e = v.e, X = sx(v.x), Y = sy(v.y), live = !v.ended, al = clamp01(v.al);
    if (v.kind === 'heist') {
      const spr = Terrain.bank(), bY = Y - (v.host ? BANK_BACK : 86) * Z * TILT, lift = v.host ? 0 : (1 - al) * 26 * Z, k = v.host ? Z * LAND_K.bank : Z, rear = v.host && hides(v.x, 146 * LAND_K.bank, v.y - BANK_BACK, 240 * LAND_K.bank / TILT);
      v.rear = (v.rear === undefined ? 1 : v.rear) + ((rear ? .32 : 1) - (v.rear === undefined ? 1 : v.rear)) * (1 - Math.exp(-rdt * 10));
      if (live) { sirenWash(X, bY, 330 * Z); eventRing(v, e); }
      ctx.globalAlpha = Math.max(al * v.rear, .001);
      ctx.drawImage(spr.c, X - spr.ax * k, bY - spr.ay * k + lift, spr.w * k, spr.h * k);
      // Lit windows, then a vault door that swings aside as the villains get in.
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = al * v.rear * (live ? 1 : .4); ctx.drawImage(spr.L, X - spr.ax * k, bY - spr.ay * k + lift, spr.w * k, spr.h * k); ctx.globalCompositeOperation = 'source-over';
      const d = Terrain.vaultDoor(), dx = X + v.door * 54 * k, dy = bY + (spr.doorY - spr.ay - 54) * k + lift, sq = Math.max(.25, 1 - v.door * .75);
      ctx.globalAlpha = al * v.rear; ctx.drawImage(d.c, dx - d.ax * k * sq, dy - d.ay * k, d.w * k * sq, d.h * k); ctx.globalAlpha = 1;
      if (live) { const R = 16 * Z; for (const [sx0, top] of spr.sirens) siren(X + sx0 * k, bY - top * k + lift, R, sx0 > 0 ? 0 : Math.PI); }
    } else if (v.kind === 'convoy') {
      const spr = Terrain.convoy(), img = spr.frames[(G.t * 12 | 0) % 2], bob = Math.abs(Math.sin(G.t * 9)) * 1.4 * Z, k = Z * .9;
      if (live) { sirenWash(X, Y, 240 * Z); eventRing(v, e, e.r || 150); }
      ctx.globalAlpha = al; ctx.setTransform(dpr * k * v.face, 0, 0, dpr * k, dpr * X, dpr * (Y - bob)); ctx.drawImage(img, -spr.ax, -spr.ay, spr.w, spr.h); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1;
      if (live) { siren(X + (spr.siren[0] - spr.ax) * k * v.face, Y - bob + (spr.siren[1] - spr.ay) * k, 15 * Z, 0); if (e.hp !== undefined) bar(X - 42 * Z, Y - (spr.h + 14) * k, 84 * Z, 4.5, clamp01(e.hp / 100), '#ffe08a'); }
    } else if (v.kind === 'blackout') {
      // The generator: the one thing still sparking in a dark city, until someone restarts it.
      const spr = Terrain.generator(), k = Z, on = e && e.prog ? clamp01(Math.max(e.prog[0], e.prog[1])) : 0, X0 = X, Y0 = Y;
      if (live) eventRing(v, e, e.r || 170);
      if (!v.host) { ctx.globalAlpha = al; ctx.drawImage(spr.c, X0 - spr.ax * k, Y0 - spr.ay * k, spr.w * k, spr.h * k); ctx.globalAlpha = 1; }
      if (live && !v.host && (G.t * 9 | 0) % 3 !== 0) { const R = (22 + on * 18) * Z; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .8; ctx.drawImage(Art.glow('#8ad8ff'), X0 - R, Y0 - spr.ay * k + 10 * k - R, R * 2, R * 2); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    } else if (v.kind === 'drop') {
      const landed = e.phase === 'live' || !live, chute = Terrain.parachute(), box = Terrain.crate(!live), k = Z * .82, frac = !landed && e.total ? clamp01(e.t / e.total) : 0, h = frac * 340 * Z, sway = frac ? Math.sin(G.t * 1.6) * 16 * Z : 0, sh = Art.shadow(), s0 = (1.4 - frac * .5) * 44 * Z;
      if (live) eventRing(v, e, e.r || 140);
      ctx.globalAlpha = al * (.9 - frac * .4); ctx.drawImage(sh, X - s0, Y - s0 * .5, s0 * 2, s0); ctx.globalAlpha = al;
      if (live && !landed) { const pr = (46 + Math.sin(G.t * 6) * 5) * Z; ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(X, Y, pr, pr * TILT, 0, 0, TAU); ctx.stroke(); }
      if (frac > 0) ctx.drawImage(chute.c, X + sway - chute.ax * k, Y - h - 62 * Z - chute.ay * k + 22 * Z, chute.w * k, chute.h * k);
      ctx.drawImage(box.c, X + sway - box.ax * k, Y - h - box.ay * k, box.w * k, box.h * k);
      ctx.globalAlpha = 1;
    }
  }
  // Helicopters: one crosses the sky now and then, and one comes to look at any live event. They fly above everything, so they cost nothing to the fog.
  function tickHelis(dt) {
    if (quality < 1) { G.helis.length = 0; return; }
    if (dt > 0 && (G.heliNext -= dt) <= 0) {
      G.heliNext = (55 + Math.random() * 50) * ((G.act2K || 0) > .5 ? .5 : 1); const dir = Math.random() < .5 ? 1 : -1, hw = VW / 2 / Z + 260;
      G.helis.push({ x: G.cam.x - dir * hw, y: G.cam.y - 140 + Math.random() * 280, z: 210, vx: dir * 300, vy: rnd(-30, 30) });
    }
    const list = G.helis, ev = G.evv, hw = VW / 2 / Z;
    for (let i = list.length - 1; i >= 0; i--) {
      const h = list[i];
      if (h.event && ev && !ev.ended && ev.kind !== 'blackout') { const tx = ev.x + Math.sin(G.t * .5) * 180, ty = ev.y - 60 + Math.cos(G.t * .37) * 60; h.vx += (tx - h.x - h.vx * .8) * dt * 1.2; h.vy += (ty - h.y - h.vy * .8) * dt * 1.2; h.lock = true; }
      else if (h.event) { h.event = false; h.lock = false; h.vx = h.x > G.cam.x ? 320 : -320; h.vy = 0; }
      h.x += h.vx * dt; h.y += h.vy * dt;
      if (!h.event && Math.abs(h.x - G.cam.x) > hw + 420) { list[i] = list[list.length - 1]; list.pop(); }
    }
  }
  function drawHelis() {
    const off = G.black;
    for (const h of G.helis) {
      if (!onScreen(h.x, h.y, 240)) continue;
      const spr = Terrain.heli(), X = sx(h.x), gy = sy(h.y), Y = gy - h.z * Z, k = Z * .86, dir = h.vx < 0 ? -1 : 1, bank = clamp01(Math.abs(h.vx) / 320) * .05 * dir, sw = 48 * Z;
      ctx.globalAlpha = .3; ctx.drawImage(Art.shadow(), X - sw, gy - sw * .34, sw * 2, sw * .68); ctx.globalAlpha = 1;
      if (off < .9 && h.lock) { const lx = X + (spr.lampX - spr.ax) * k * dir, ly = Y + (spr.lampY - spr.ay) * k, ev = G.evv, tx = ev ? sx(ev.x) : X, ty = ev ? sy(ev.y) : gy + 40, dx = tx - lx, dy = ty - ly, L = Math.hypot(dx, dy) || 1, c = dy / L, sn = -dx / L, w = 120 * Z, bm = Terrain.beam('#fff0cc'); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .24 * (1 - off); ctx.setTransform(dpr * c, dpr * -sn, dpr * sn, dpr * c, dpr * lx, dpr * ly); ctx.drawImage(bm, -w / 2, 0, w, L + 10); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
      ctx.setTransform(dpr * k * dir, dpr * k * dir * bank, 0, dpr * k, dpr * X, dpr * Y); ctx.drawImage(spr.frames[(G.t * 26 | 0) % 2], -spr.ax, -spr.ay, spr.w, spr.h); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  // ---------- 13.0: Main Street (Brawl) ----------
  // Festival lights strung across the street from roof to roof: the place's signature, drawn above the fight but faint.
  const BULB = ['#ffd890', '#ff7ab8', '#7ad8ff', '#ffe6b8'];
  function streetLights() {
    const band = G.s.map && G.s.map.band; if (!band || quality < 1) return;
    const hw = VW / 2 / Z + 200, x0 = Math.ceil((G.cam.x - hw) / 520) * 520, red = (G.act3K || 0) > .5, off = G.black;
    if (off > .9) return;
    ctx.lineCap = 'round';
    for (let x = x0; x < G.cam.x + hw; x += 520) {
      if ((G.s.map.plazas || EMPTY_LIST).some(p => p.kind === 'base' && Math.abs(p.x - x) < p.r + 120)) continue;
      const sl = ((x / 520) | 0) % 2 ? 90 : -90, ax = x - sl, bx = x + sl, Ya = sy(band.y0) - 190 * Z, Yb = sy(band.y1) - 190 * Z, Xa = sx(ax), Xb = sx(bx), Xm = (Xa + Xb) / 2, Ym = (Ya + Yb) / 2 + 40 * Z;
      ctx.globalAlpha = .55; ctx.strokeStyle = '#05070b'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(Xa, Ya); ctx.quadraticCurveTo(Xm, Ym + 30 * Z, Xb, Yb); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 1; i < 14; i++) {
        const t = i / 14, u = 1 - t, X = u * u * Xa + 2 * u * t * Xm + t * t * Xb, Y = u * u * Ya + 2 * u * t * (Ym + 30 * Z) + t * t * Yb;
        const on = red ? (Math.sin(G.t * 9 + i * 1.7 + x) > -.2) : 1, col = red ? '#ff4a3a' : BULB[(i + (x / 520 | 0)) % 4], r = (5 + Math.sin(G.t * 2 + i) * 1) * Z + 2;
        ctx.globalAlpha = .5 * on * (1 - off); ctx.drawImage(Art.glow(col), X - r * 2, Y - r * 2, r * 4, r * 4);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }

  // ---------- 13.0: wanted ----------
  // c.wanted from the sim: true, a level, or a bounty in gold. Read as a grade 0..3.
  function wantedLv(c) {
    const w = c.wanted; if (!w || c.polyT > 0) return -1;
    if (w === true) return 0; if (typeof w === 'object') return Math.min(3, Math.max(0, (w.lv || w.n || w.level || 1) - 1));
    return w > 20 ? Math.min(3, (w / 300) | 0) : Math.min(3, Math.max(0, (w | 0) - 1));
  }
  // The city hunts them: a red searchlight from the top of the frame stays on the coin, wider and brighter as the bounty grows.
  function wantedLight(c, v, X, Y, R, lv) {
    if (G.black > .9) return;
    const col = Art.cb ? Art.PAL.enemy : '#ff3a3e', k = 1 + lv * .14, Rw = (R + 30) * Z * k, sway = Math.sin(G.t * 1.7 + v.phase) * 6 * Z, X0 = X * .7 + VW * .15 + Math.sin(G.t * .3 + v.phase) * 40, Y0 = -30;
    const dx = X + sway - X0, dy = Y - Y0, L = Math.hypot(dx, dy) || 1, cs = dy / L, sn = -dx / L, w = Rw * 1.8;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = .4 + lv * .06; ctx.drawImage(Terrain.pool(col), X + sway - Rw * 1.4, Y - Rw * 1.4 * TILT, Rw * 2.8, Rw * 2.8 * TILT);
    if (quality >= 1) { ctx.globalAlpha = .14 + lv * .03; ctx.setTransform(dpr * cs, dpr * -sn, dpr * sn, dpr * cs, dpr * X0, dpr * Y0); ctx.drawImage(Terrain.beam(col), -w / 2, 0, w, L + Rw * .3); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    // A crosshair turns on the ground under them.
    const Rr = (R + 22) * Z * k, Ry = Rr * TILT, rot = G.t * 1.2; ctx.lineCap = 'butt';
    for (let pass = 0; pass < 2; pass++) { ctx.strokeStyle = pass ? col : INK; ctx.lineWidth = pass ? 1.8 : 3.6; ctx.beginPath(); for (let i = 0; i < 4; i++) { const an = rot + i * Math.PI / 2, c0 = Math.cos(an), s0 = Math.sin(an); ctx.moveTo(X + c0 * Rr * .78, Y + s0 * Ry * .78); ctx.lineTo(X + c0 * Rr * 1.14, Y + s0 * Ry * 1.14); } ctx.stroke(); }
    ctx.lineCap = 'round';
  }
  function wantedPlaque(u, v, X, y, lv, dt) {
    v.wantedIn = Math.min(1, (v.wantedIn === undefined ? 1 : v.wantedIn) + dt / .22);
    const e = v.wantedIn, pop = e < 1 ? 1 + (1 - e) * (1 - e) * .9 : 1 + Math.max(0, Math.sin(G.t * 3.2 + v.phase)) * .04, m = Art.wantedMark(lv, Art.cb ? Art.PAL.enemy : '#ff3f3a'), w = m.w * (.82 + lv * .08) * pop, h = m.h * (.82 + lv * .08) * pop;
    ctx.globalAlpha = Math.min(1, e * 2); ctx.drawImage(m.c, X - w / 2, y - h, w, h); ctx.globalAlpha = 1;
  }

  // ---------- 13.0: evade ----------
  // While a coin is untouchable it reads as glass: a cold rim and a short trail of afterimages.
  const evading = (c, v) => c.evadeT > 0 || c.evT > 0 || c.dodgeT > 0 || c.iframeT > 0 || c.invulnT > 0 || v.evadeT > 0;
  function evadeShimmer(c, v, X, top, Rp) {
    v.evadeT = Math.max(0, (v.evadeT || 0) - rdt);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .7; ctx.strokeStyle = '#cfefff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(X, top, Rp * 1.18, Rp * 1.08, 0, 0, TAU); ctx.stroke();
    ctx.globalAlpha = .35; ctx.drawImage(Art.glow('#bfe8ff'), X - Rp * 1.6, top - Rp * 1.6, Rp * 3.2, Rp * 3.2);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    if ((v.evGhost = (v.evGhost || 0) - rdt) <= 0 && rdt > 0) { v.evGhost = .035; FX.ghost(worldSprite(c), artR(c), c.x, c.y, 12, .18, 1); }
  }

  // ---------- 13.0: last stand ----------
  // On from the event for a while, or as long as the sim says (s.lastStand / s.standT per team, seconds).
  function standOn(team) {
    const s = G.s, a = s.stand || s.lastStand; if (a && typeof a === 'object' && a[team] !== undefined && typeof a[team] === 'number') return a[team] > 0;
    return !!(G.standAt && G.stand && G.stand[team] && G.t - G.standAt[team] < 15);
  }
  // Towers overcharge: a hot core of light in the crown, arcs crawling down the stack, a beam into the sky.
  function overcharge(t, X, topY, core, al) {
    const col = t.team === 0 ? '#ffe08a' : (Art.cb ? Art.PAL.enemy : '#ff4a5a'), k = Z, flick = .75 + Math.sin(G.t * 23 + t.x) * .25, gy = topY - (core ? 80 : 60) * k, gr = (core ? 90 : 64) * k;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .5 * flick * al; ctx.drawImage(Art.glow(col), X - gr, gy - gr, gr * 2, gr * 2);
    if (quality >= 1) { const w = (core ? 70 : 46) * k, bm = Terrain.beam(col); ctx.globalAlpha = .22 * al; ctx.setTransform(dpr, 0, 0, -dpr, dpr * X, dpr * gy); ctx.drawImage(bm, -w / 2, 0, w, gy + 40); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    // two jagged arcs, re-cut every few frames
    const seed = (G.t * 14 | 0); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4; ctx.globalAlpha = .85 * al; ctx.beginPath();
    for (let j = 0; j < 2; j++) { let x = X + (j ? 1 : -1) * 18 * k, y = gy; ctx.moveTo(x, y); for (let i = 0; i < 5; i++) { const h = Math.sin(seed * 12.9898 + i * 78.233 + j * 3) * 43758.5453; x += ((h - Math.floor(h)) - .5) * 26 * k; y += 18 * k; ctx.lineTo(x, y); } }
    ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  // ---------- 13.0: nemesis duel spotlight ----------
  // Everything else dims; the two of them stand in white light with a ring drawn around their fight.
  function duelSpot(dt, a) {
    const D = G.duel || (G.s.duel && (G.s.duel.u || G.s.duel.a) ? { u: G.s.duel.u || G.s.duel.a, v: G.s.duel.v || G.s.duel.b, live: true } : null);
    let on = 0, A = null, B = null;
    if (D) { if (D.t !== undefined) D.t += dt; A = unitById(D.u); B = unitById(D.v); on = A && B && isUp(A) && isUp(B) && !D.end && !(D.t > 14) ? 1 : 0; if (!on && D.t !== undefined && !D.end) D.end = G.t; }
    G.duelK = (G.duelK || 0) + (on - (G.duelK || 0)) * (1 - Math.exp(-dt * (on ? 9 : 3)));
    if (D && !on && G.duelK < .01 && G.duel === D) G.duel = null;
    if (G.duelK < .01 || !A || !B) return;
    const pa = posNow(A, a), ax = pa.x, ay = pa.y, pb = posNow(B, a), bx = pb.x, by = pb.y; if (!onScreen(ax, ay, 300) && !onScreen(bx, by, 300)) return;
    const k = G.duelK, mine = A === G.me || B === G.me;
    ctx.globalAlpha = k * (mine ? .34 : .24); ctx.fillStyle = '#04050a'; ctx.fillRect(0, 0, VW, VH);
    ctx.globalCompositeOperation = 'lighter';
    for (const [x, y, u] of [[ax, ay, A], [bx, by, B]]) {
      const X = sx(x), Y = sy(y), R = 120 * Z, col = u.team === 0 ? '#fff0c8' : '#ffd0c8';
      ctx.globalAlpha = k * .5; ctx.drawImage(Terrain.pool(col), X - R * 1.6, Y - R * 1.6 * TILT, R * 3.2, R * 3.2 * TILT);
      if (quality >= 1) { const X0 = X + (u.team === 0 ? -1 : 1) * VW * .18, Y0 = -30, dx = X - X0, dy = Y - Y0, L = Math.hypot(dx, dy) || 1, cs = dy / L, sn = -dx / L, w = R * 1.6; ctx.globalAlpha = k * .18; ctx.setTransform(dpr * cs, dpr * -sn, dpr * sn, dpr * cs, dpr * X0, dpr * Y0); ctx.drawImage(Terrain.beam(col), -w / 2, 0, w, L + R * .3); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    }
    ctx.globalCompositeOperation = 'source-over';
    // The ring: hero gold on one half, villain red on the other, turning.
    const mx = (ax + bx) / 2, my = (ay + by) / 2, Rr = (Math.hypot(ax - bx, ay - by) / 2 + 150) * Z, X = sx(mx), Y = sy(my), rot = G.t * .5;
    ctx.globalAlpha = k; ctx.lineCap = 'butt';
    ctx.strokeStyle = INK; ctx.lineWidth = 4.4; ctx.beginPath(); ctx.ellipse(X, Y, Rr, Rr * TILT, 0, 0, TAU); ctx.stroke();
    ctx.lineWidth = 2.2; ctx.strokeStyle = '#f0dfb0'; ctx.beginPath(); ctx.ellipse(X, Y, Rr, Rr * TILT, 0, rot, rot + Math.PI); ctx.stroke();
    ctx.strokeStyle = Art.cb ? Art.PAL.enemy : '#ff4a5a'; ctx.beginPath(); ctx.ellipse(X, Y, Rr, Rr * TILT, 0, rot + Math.PI, rot + TAU); ctx.stroke();
    ctx.globalAlpha = 1; ctx.lineCap = 'round';
  }

  // ---------- 13.0: bosses ----------
  // The sim's phase (u.phase) is watched here, so guests and hosts both see the turn even without the event.
  function bossWatch(u, v) {
    const ph = u.phase | 0; if (!ph) return;
    if (v.bph === undefined) v.bph = ph; else if (ph > v.bph) { v.bph = ph; fxEvent({ e: 'bossphase', u: u.id, n: ph }); }
  }
  // A pending slam lifts the boss off the ground, then drops it as the blast lands.
  function bossLift(u) {
    const zs = G.s.zones || EMPTY_LIST; let best = null, bd = 1e12;
    for (const z of zs) { if (z.kind !== 'blast' || z.team !== 2) continue; const o = z.owner, oid = o && typeof o === 'object' ? o.id : o; if (oid === u.id) { best = z; break; } const d = Math.hypot(z.x - u.x, z.y - u.y); if (oid === undefined && d < 520 && d < bd) { bd = d; best = z; } }
    const v = visOf(u); let f;
    if (v.slamAt !== undefined && G.t - v.slamAt < v.slamT + .05) f = clamp01((G.t - v.slamAt) / v.slamT);
    else if (!best || !best.total) return 0; else f = clamp01(1 - best.t / best.total);
    return f < .82 ? 46 * (1 - Math.pow(1 - f / .82, 3)) : 46 * (1 - (f - .82) / .18);
  }

  // ---------- 13.0: attack lock ----------
  // The champion your attack is locked onto. An explicit lock from the sim wins; while attack is held without one,
  // the marker shows who a tap would go to, so holding attack always tells you who you're hitting.
  const LOCK = { id: 0, t: 1, x: 0, y: 0 };
  function lockTarget() {
    const me = G.me; if (!isUp(me) || G.spectator) return null;
    const ids = [G.lockId, me.lockId];
    for (const id of ids) { if (!id) continue; const u = typeof id === 'object' ? id : unitById(id); if (u && u.kind === 'champ' && isUp(u) && u.team !== me.team && seesU(u)) return u; }
    const held = (Ctl.atk !== null && Ctl.atk !== undefined && Ctl.atk !== false) && (Ctl.atkMode || 'champ') === 'champ';
    if (!held) return null;
    try { return Sim.quickTarget ? Sim.quickTarget(G.s, me, (me.range || 160) + 60) : null; } catch (e) { return null; }
  }
  function lockMarker(a, dt) {
    const t = lockTarget();
    if (!t) { LOCK.id = 0; return; }
    if (t.id !== LOCK.id) { LOCK.id = t.id; LOCK.t = 0; }
    LOCK.t += dt;
    const q = posNow(t, a), v = visOf(t), X = sx(q.x + v.rx), Y = sy(q.y + v.ry), R0 = (artR(t) + 14) * Z, e = clamp01(LOCK.t / .13), k = e >= 1 ? 1 : 1 + (1 - e) * (1 - e) * 1.1;
    const R = R0 * k * (1 + Math.max(0, Math.sin(G.t * 9)) * .03), Ry = R * TILT, col = Art.cb ? Art.PAL.enemy : '#ff3f3a', rot = Math.PI / 4 + (1 - e) * .9, arm = .55;
    ctx.globalAlpha = Math.min(1, e * 2.2); ctx.lineCap = 'butt';
    // Four bracket corners on the ground, snapping in from wide.
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? col : INK; ctx.lineWidth = pass ? 3.2 : 6; ctx.beginPath();
      for (let i = 0; i < 4; i++) { const a0 = rot + i * Math.PI / 2 - arm / 2; ctx.moveTo(X + Math.cos(a0) * R, Y + Math.sin(a0) * Ry); ctx.ellipse(X, Y, R, Ry, 0, a0, a0 + arm); }
      ctx.stroke();
    }
    // The lock lands with one quick flash ring.
    if (e < 1) { ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 1 - e; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(X, Y, R0 * (.6 + e * .6), R0 * (.6 + e * .6) * TILT, 0, 0, TAU); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.lineCap = 'round';
  }

  // Photo finish time curve: a hard drop to a crawl, held, then a quick ease back to full speed.
  const photoScale = t => t < .9 ? .14 : t < 1.5 ? .14 + .86 * (1 - Math.pow(1 - (t - .9) / .6, 3)) : 1;
  function render(dt) {
    const s = G.s, me = G.me; if (!s || !me) return;
    rdt = dt;
    Art.pump(paused || G.intro > 0 ? 9 : 2.5);
    if (s.hope !== undefined) G.hopeS += (s.hope - G.hopeS) * (1 - Math.exp(-dt * 1.2));
    if (G.outro && G.photoT !== undefined) G.photoT += dt;
    const photo = G.outro ? photoScale(G.photoT || 0) : 1;
    const a = Math.min(1, (G.acc || 0) / DT), wdt = G.intro > 0 || G.outro ? dt * photo : dt * (G.stop > 0 ? .1 : (G.timeScale || 1));
    G.punch *= Math.exp(-dt * (G.outro ? 1.2 : 8));
    // Zoom kicks are eased in as well as out, so no impact ever snaps the camera.
    G.punchS = (G.punchS || 0) + (G.punch - (G.punchS || 0)) * (1 - Math.exp(-dt * 32));
    let zoom = 1; if (G.intro > 0) { const k = clamp01(1 - G.intro / INTRO_LEN), e = 1 - Math.pow(1 - k, 3); zoom = lerp(.84, 1, e); }
    if (G.outro) { const pt = G.photoT || 0; zoom *= 1 + .08 * (1 - Math.pow(1 - clamp01(pt / 1.1), 3)) - .05 * clamp01((pt - 1.5) / .8); }
    ZB = VW / CAM_SPAN;
    Z = ZB * (1 + G.punchS) * zoom;
    camera(dt, a);
    G.flash = Math.max(0, (G.flash || 0) - dt * 2.6);
    const champs = s.champs || EMPTY_LIST, minions = s.minions || EMPTY_LIST, monsters = s.monsters || EMPTY_LIST, towers = s.towers || EMPTY_LIST;

    // Everything visible is gathered first: fading needs to know where the units are.
    dn = 0; bn = 0; VIS_CHAMPS.length = 0; VIS_UNITS.length = 0; b_meTop = 0; rubN = 0; minRingN = 0;
    const m = 190;
    litNow = clamp01((G.hopeS - 18) / 22);
    tickSmoke(wdt);
    eventTick(wdt); tickHelis(wdt); districtsTick(wdt); actTick(wdt);
    if (G.moodT > 0) G.moodT -= wdt;
    if (s.sites) for (const c of s.sites) if (c.alive && onScreen(c.x, c.y, 120)) push(c.y, 7, c);
    for (const d of G.decor) if (onScreen(d.x, d.y, m + (d.sky ? 260 : 0))) push(d.y, 0, d);
    for (const w of G.walls) if (onScreen(w.w.x + w.w.w / 2, w.w.y + w.w.h / 2, Math.max(w.w.w, w.w.h) * Z + 120)) push(w.w.y + w.w.h, 1, w);
    for (const t of towers) {
      const v = visOf(t);
      if (isUp(t)) { tickTower(t, wdt); if (onScreen(t.x, t.y, 200)) { push(t.y, 3, t, 0, 0, v); pushBar(t, t.x, t.y, v); } }
      else {
        // A tower already down when we arrived (a guest rejoining) simply is rubble.
        if (v.fallT === undefined) v.fallT = 9;
        v.fallT += wdt;
        if (onScreen(t.x, t.y, 200)) { RUB[rubN++] = t; RUB[rubN++] = v; if (v.fallT < .4) push(t.y, 8, t, 0, 0, v); }
      }
    }
    // Enemies only exist on screen where your team can see them.
    for (const q of minions) { if (!isUp(q) || q.delay > 0) continue; const v = tickMinion(q, a, wdt), px = WP.x, py = WP.y; if (onScreen(px, py, 70) && seesU(q)) { push(py - 40, 4, q, px, py, v); pushBar(q, px, py, v); VIS_UNITS.push(px, py); if (minRingN < 236) { MRING[minRingN++] = sx(px + v.rx); MRING[minRingN++] = sy(py + v.ry); MRING[minRingN++] = (artR(q) + 3) * Z; MRING[minRingN++] = q.team === me.team ? 0 : 1; } } }
    for (const q of monsters) { if (!isUp(q)) continue; const v = visOf(q), p = posNow(q, a), px = p.x, py = p.y, sp = Math.hypot(q.vx || 0, q.vy || 0); tickVis(q, v, p, wdt, sp, q.ms || 260); if (onScreen(px, py, 120) && seesU(q)) { push(py, 5, q, px, py, v); pushBar(q, px, py, v); VIS_UNITS.push(px, py); } }
    if (G.evv && onScreen(G.evv.x, G.evv.y, 420)) push(G.evv.y - (G.evv.kind === 'heist' ? (G.evv.host ? BANK_BACK : 60) : 0), 10, G.evv);
    for (const c of champs) {
      const v = tickChamp(c, a, wdt);
      if (!isUp(c) || !seesU(c)) continue;
      const p = posNow(c, a), px = p.x, py = p.y; if (!onScreen(px, py, 100)) continue;
      push(py, 6, c, px, py, v); pushBar(c, px + v.rx, py + v.ry, v); VIS_CHAMPS.push(px, py, c);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    // Only the edge of the world can show through: a clamped camera mid-map has the ground covering every pixel.
    { const hw = VW / 2 / Z + 16, hh = VH / 2 / Z + 16, cy = G.cam.y * TILT; if (G.cam.x - hw < 0 || G.cam.x + hw > Sim.W || cy - hh < 0 || cy + hh > Sim.H * TILT) { ctx.fillStyle = '#05070b'; ctx.fillRect(0, 0, VW, VH); } }
    ground();
    const sk = sky();
    groundGrade(sk);
    actGrade();
    reflection();
    water(dt);
    searchlights();
    weather(dt, sk);
    siteRings();
    districtGround();
    brushHint(dt);
    drawRubble();
    minionRings();
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
        case 4: drawMinion(e.o, e.v, e.px, e.py); break;
        case 5: drawMonster(e.o, e.v, e.px, e.py); break;
        case 6: drawChamp(e.o, e.v, e.px, e.py, a, me); break;
        case 7: drawCivilians(e.o); break;
        case 8: drawFallen(e.o, e.v); break;
        case 10: drawEvent(e.o); break;
        case 11: drawDistrict(e.o); break;
      }
    }
    drawSmoke();

    // Fog goes over the world; effects and readouts sit above it so nothing important is dimmed.
    drawFog(dt);
    duelSpot(wdt, a);
    FX.projectiles(a, wdt);
    FX.draw(wdt);
    drawHelis();
    streetLights();
    rainStreaks(dt);
    motes(dt, sk);
    embers(wdt);
    lightning();
    FX.danger(a);
    lockMarker(a, dt);
    hpBars(dt);
    FX.textLayer(dt);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    hudDraw(dt);
    if (G.replay) { const R = G.replay, I = R.info || {}; Art.potg(ctx, VW, VH, { t: R.t, dur: R.dur, name: I.name, champ: I.kit, team: I.team, label: I.label }); }
  }

  return { initWorld, render, introTick, outroStart, outroTick, drawCoin, visOf, worldSprite };
})();
