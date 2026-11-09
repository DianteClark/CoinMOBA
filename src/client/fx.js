// Particles, projectiles, telegraphs, aim indicators and the event-to-effect mapping.
// Everything private lives in the closure below; only FX, FX_CAP and fxEvent are shared.
const FX_CAP = q => q >= 2 ? 150 : q === 1 ? 96 : 50;
const { FX, fxEvent } = (() => {
  // Energy by caster: heroes pale gold and white, villains crimson with a touch of acid, neutrals ember.
  const HERO = { out: '#b8934e', mid: '#f0dfb0', core: '#ffffff', spark: '#f0dfb0', spark2: '#ffffff', chip: '#e6d19c', ring: '#f0dfb0', dots: '#f0dfb0', lines: '#ffffff', imp: '#f0dfb0', imp2: '#ffffff', aim: '240,223,176' };
  const VILL = { out: '#8e1224', mid: '#ff4a5a', core: '#ffe2e4', spark: '#ff4a5a', spark2: '#c8ef5a', chip: '#c8243a', ring: '#ff4a5a', dots: '#ff4a5a', lines: '#ffd0d4', imp: '#ff4a5a', imp2: '#ffe2e4', aim: '190,235,70' };
  const NEUT = { out: '#b05a1c', mid: '#ffb26a', core: '#fff0d8', spark: '#ffb26a', spark2: '#ffe0b0', chip: '#d8863c', ring: '#ffb26a', dots: '#ffb26a', lines: '#ffe0b0', imp: '#ffb26a', imp2: '#fff0d8', aim: '255,170,90' };
  const palT = t => t === 0 ? HERO : t === 1 ? VILL : NEUT;
  // Every kit has its own colour, so abilities read apart even at a glance. Telegraphs and danger stay red.
  const kitTone = (base, mid, out, spark, core) => ({ ...base, mid, out, spark, core: core || base.core, ring: mid, dots: mid, imp: mid, chip: mid, lines: mid });
  const KIT_PAL = {
    vesper: kitTone(HERO, '#f4e4b8', '#b8934e', '#ffffff'), kade: kitTone(HERO, '#bfe0ff', '#3f6ea8', '#ffffff'), ione: kitTone(HERO, '#9fd8ff', '#2f6fb8', '#d8f0ff'), solenne: kitTone(HERO, '#ffd890', '#c8821f', '#fff3c8'), sable: kitTone(HERO, '#c8b4ff', '#5a3fb0', '#e8dcff'), gravel: kitTone(HERO, '#f0b478', '#9a5a2a', '#ffd8b0'),
    deadbolt: kitTone(VILL, '#c8ef5a', '#6a8a18', '#e8ff9a', '#f4ffd0'), duelist: kitTone(VILL, '#ff5a66', '#8e1224', '#ffb0b8'), hex: kitTone(VILL, '#b6ec3a', '#4a2a8a', '#d8a8ff', '#e8ffb0'), plague: kitTone(VILL, '#b6ec3a', '#4a6a14', '#dfff70'), shiv: kitTone(VILL, '#ff7a6a', '#7a1c2c', '#ffffff'), ironjaw: kitTone(VILL, '#ffa44a', '#8e4a14', '#ffd090'),
  };
  const palK = u => (u && KIT_PAL[u.champ]) || palT(u ? u.team : -1);
  const FX_KIT = { rupture: 'ione', break: 'ione', crash: 'gravel', stomp: 'gravel', heal: 'solenne', tripwire: 'deadbolt', feint: 'duelist', coven: 'hex', demolish: 'ironjaw', orb: 'ione', ray: 'solenne', chain: 'gravel', ricochet: 'deadbolt', hexbolt: 'hex', polymorph: 'hex', snipe: 'vesper', snipeFull: 'vesper', deadeye: 'vesper', dome: 'solenne', lockdown: 'deadbolt' };
  const palFx = (fx, t) => KIT_PAL[FX_KIT[fx]] || palT(t);
  // Anything aimed at you is drawn in this palette, whichever side threw it.
  const DANGER = { out: '#d81f24', mid: '#ff5a44', core: '#ffe9d8', aim: '255,62,40' };
  const GOLD = '#f0d38a', SPARKY = '#fff4d8', INK = Art.INK, HEAL = '#b6e5a8';
  const SPARK = 0, PUFF = 1, SHARD = 2, COIN = 3, RING = 4, SLASH = 5, GHOST = 6, LEAF = 7, RISE = 8, DROP = 9, DISC = 10, CIV = 11, CHIP = 12, PILLAR = 13, BEAMK = 14, SIGILK = 15, BOLTK = 16, CUTK = 17, IMP = 18;
  const LEAVES = ['#2d6a56', '#3f7a64', '#245a4a'];
  // which kits make which area blast, for working out a blast's side when the event doesn't say
  const BOOM_KIT = { crash: ['kade', 'gravel'], stomp: ['gravel'], rupture: ['ione'], break: ['ione'], heal: ['solenne'] };
  const PHIT_KIT = { snipe: ['vesper'], snipeFull: ['vesper'], deadeye: ['vesper'], orb: ['ione'], ray: ['solenne'], chain: ['gravel'] };
  const OV_R = { champ: 44, minion: 26, monster: 34 };

  let P = [], cursor = 0, trails = new Map(), flyers = [], frameId = 0, OV = [], panel = null, readyFx = [], lastKill = -9, prevCd = [], zoneTeam = new Map(), falls = [], arrive = [], dustN = 0;
  const DUST = [], DUST_CAP = 14, TP = [];
  const buf = new Float64Array(96);
  const nq = n => quality >= 2 ? n : quality === 1 ? Math.ceil(n * .6) : Math.ceil(n * .35);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const pick = a => a[Math.random() * a.length | 0];
  const resetT = () => ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // snappy easing
  const outExpo = t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
  const outBack = t => { const u = t - 1; return 1 + 2.9 * u * u * u + 1.9 * u * u; };
  const outCub = t => 1 - (1 - t) * (1 - t) * (1 - t);

  const PINGS = [], ZST = new Map(), GW = [], LATER = []; let CINE = null;
  let coinS = null; const mboltS = [null, null], towerS = [null, null];
  const coinSp = () => coinS || (coinS = Art.coin('fxgold', 16, null, ['#ecd9a6', '#8a6f3e'], -1, -1));
  const minionBolt = team => mboltS[team ? 1 : 0] || (mboltS[team ? 1 : 0] = Art.coin('fxm' + team, 16, null, team === 1 ? ['#ff4a5a', '#7a1020'] : ['#f0dfb0', '#8a6f3e'], -1, -1));
  const towerSp = team => towerS[team ? 1 : 0] || (towerS[team ? 1 : 0] = Art.coin('fxt' + team, 30, 'boss', team === 1 ? ['#c8243a', '#4a0a14'] : ['#e6d19c', '#6a5428'], team, -1));

  const linkC = [null, null, null];
  function link(team) {
    const k = team === 0 ? 0 : team === 1 ? 1 : 2; if (linkC[k]) return linkC[k];
    const c = Art.cv(20, 12), g = c.getContext('2d'), p = palT(team);
    g.strokeStyle = p.mid; g.lineWidth = 1.6; g.beginPath(); g.ellipse(10, 6, 7, 3.4, 0, 0, TAU); g.stroke();
    return linkC[k] = c;
  }

  function reset() { PINGS.length = 0; ZST.clear(); P = []; cursor = 0; trails = new Map(); flyers = []; OV = []; panel = null; readyFx = []; prevCd = []; zoneTeam = new Map(); falls = []; arrive = []; DUST.length = 0; dustN = 0; lastKill = -9; GW.length = 0; LATER.length = 0; CINE = null; G.text = []; G.tAim = null; }

  function add(k, x, y, z, life) {
    const cap = FX_CAP(quality); let p;
    if (P.length < cap) { p = {}; P.push(p); }
    else { cursor = (cursor + 1) % P.length; p = P[cursor]; }
    p.k = k; p.x = x; p.y = y; p.z = z; p.vx = p.vy = p.vz = 0; p.life = p.max = life;
    p.size = 8; p.col = '#fff'; p.rot = 0; p.vr = 0; p.spr = null; p.ph = 0; p.R = 0; p.dx = 0; p.dy = 0; p.bounce = 0; p.alpha = 1; p.flip = false; p.v = 0;
    return p;
  }

  function spark(x, y, n, col = SPARKY, sp = 200, life = .4, size = 11, z = 18) {
    n = nq(n);
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = sp * rnd(.35, 1.15), p = add(SPARK, x, y, z, life * rnd(.65, 1.1)); p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; p.vz = rnd(60, 300); p.size = size * rnd(.7, 1.35); p.col = col; }
  }
  function puff(x, y, n, shade = 0, size = 26, life = .55, z = 6, sp = 30) {
    n = nq(n);
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = sp * rnd(.2, 1), p = add(PUFF, x + rnd(-8, 8), y + rnd(-6, 6), z, life * rnd(.75, 1.2)); p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; p.vz = rnd(10, 40); p.size = size * rnd(.7, 1.2); p.ph = shade; p.v = i; p.rot = Math.random() * TAU; p.vr = rnd(-2, 2); }
  }
  // Dust lives on the ground layer, under the coins, so it can never sit on a portrait.
  function dustAt(x, y, size, life, vx, vy) {
    let d; if (DUST.length < DUST_CAP) DUST.push(d = {}); else { dustN = (dustN + 1) % DUST_CAP; d = DUST[dustN]; }
    d.x = x; d.y = y; d.vx = vx; d.vy = vy; d.size = size; d.life = d.max = life; d.rot = Math.random() * TAU; d.v = dustN & 3;
  }
  const dust = (x, y, k = 1) => dustAt(x + rnd(-6, 6), y + rnd(-3, 3), 11 * k, .3, 0, 0);
  function dustRing(x, y, R, n) { for (let i = 0; i < n; i++) { const a = i / n * TAU + rnd(-.2, .2), c = Math.cos(a), sn = Math.sin(a); dustAt(x + c * R * .5, y + sn * R * .5, rnd(22, 34), rnd(.45, .7), c * R * 1.1, sn * R * 1.1); } }
  function drawDust(dt) {
    for (const d of DUST) {
      if (d.life <= 0) continue;
      d.life -= dt; d.x += d.vx * dt; d.y += d.vy * dt; d.vx *= .92; d.vy *= .92; if (d.life <= 0) continue;
      const f = d.life / d.max, r = d.size * Z * (.7 + outCub(1 - f) * .7), c = Math.cos(d.rot) * r, sn = Math.sin(d.rot) * r;
      ctx.globalAlpha = Math.min(.8, f * 1.4); ctx.setTransform(dpr * c, dpr * sn * .62, -dpr * sn, dpr * c * .62, dpr * sx(d.x), dpr * sy(d.y)); ctx.drawImage(Art.dustCel(0, d.v), -1, -1, 2, 2);
    }
    resetT(); ctx.globalAlpha = 1;
    if (GW.length) drawWaves(dt);
  }
  // ---------- big-moment machinery ----------
  // Shockwaves run along the ground under the units, so they can be huge without hiding anyone.
  function wave(x, y, R, col, life = .6) { if (GW.length >= 6) GW.shift(); GW.push({ x, y, R, col, t: 0, life }); }
  function drawWaves(dt) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = GW.length - 1; i >= 0; i--) {
      const w = GW[i]; w.t += dt; const a = w.t / w.life; if (a >= 1) { GW.splice(i, 1); continue; }
      const r = w.R * Z * (.16 + .94 * outExpo(a)); ctx.globalAlpha = Math.min(.8, (1 - a) * 1.4); ctx.drawImage(Art.shock(w.col), sx(w.x) - r, sy(w.y) - r * TILT, r * 2, r * 2 * TILT);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  // Run something a moment from now. Big moments are short sequences, not single frames.
  const later = (d, fn) => { if (LATER.length < 48) LATER.push({ d, fn }); };
  // Letterbox: two black bars slide in and the world holds its breath for a beat.
  function cine(life = .6, k = 1) { if (!calm) CINE = { t: 0, life, k }; }
  function drawCine(dt) {
    if (!CINE) return; CINE.t += dt; const a = CINE.t / CINE.life; if (a >= 1) { CINE = null; return; }
    const io = a < .18 ? outExpo(a / .18) : a > .78 ? 1 - outCub((a - .78) / .22) : 1, h = Math.round(Math.min(34, VH * .09) * CINE.k * io);
    if (a < .35) { ctx.globalAlpha = .26 * CINE.k * (1 - a / .35); ctx.fillStyle = '#02030a'; ctx.fillRect(0, 0, VW, VH); ctx.globalAlpha = 1; }
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, VW, h); ctx.fillRect(0, VH - h, VW, h);
  }
  function coins(x, y, n, o = {}) {
    n = nq(n);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = rnd(o.spMin || 70, o.sp || 240), p = add(COIN, x, y, o.z || 22, rnd(.7, o.life || 1.1));
      p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; p.vz = rnd(o.vzMin || 240, o.vz || 520); p.size = rnd(6, o.size || 11); p.ph = Math.random() * TAU; p.vr = rnd(9, 18); p.bounce = 2;
    }
  }
  function chips(x, y, n, col, sp = 280, z = 26) {
    n = nq(n);
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = rnd(.35, 1) * sp, p = add(CHIP, x, y, z, rnd(.4, .7)); p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; p.vz = rnd(180, 460); p.vr = rnd(-16, 16); p.rot = Math.random() * TAU; p.size = rnd(.5, 1.05); p.col = col; p.v = i; p.bounce = 1; }
  }
  function ring(x, y, r, col = '#fff', life = .4, z = 0) { const p = add(RING, x, y, z, life); p.R = r; p.col = col; }
  function slash(x, y, dx, dy, r = 150, col = '#efe2ff', life = .2) { const p = add(SLASH, x, y, 16, life); p.dx = dx; p.dy = dy; p.R = r; p.col = col; }
  function ghost(spr, R, x, y, z = 14, life = .28, spin = 1) { const p = add(GHOST, x, y, z, life); p.spr = spr; p.R = R; p.alpha = .42; p.ph = spin; return p; }
  function ghostLine(spr, R, x0, y0, x1, y1) { const n = Math.min(3, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 140)); for (let i = 0; i < n; i++) { const f = i / n; ghost(spr, R, lerp(x0, x1, f), lerp(y0, y1, f), 14, .2 + f * .16); } }
  function corpse(spr, R, x, y) { const p = ghost(spr, R, x, y, 14, .7, 1); p.flip = true; p.alpha = 1; p.vz = 330; p.vr = 12; }
  // The whole coin bursts; with `gold` each shard turns to loose change partway through its arc.
  function shatter(spr, R, x, y, gold) {
    if (!spr || !spr.c) return; // a turntable whose first frame hasn't baked yet
    const list = Art.shardsOf(spr), k = R / spr.R;
    for (const s of list) {
      const p = add(SHARD, x + Math.cos(s.a) * R * .35, y + Math.sin(s.a) * R * .35, 34, rnd(.8, 1.15)); p.gold = !!gold;
      const v = rnd(170, 360); p.vx = Math.cos(s.a) * v; p.vy = Math.sin(s.a) * v; p.vz = rnd(300, 560); p.vr = rnd(-11, 11); p.spr = s.c; p.size = k; p.bounce = 2; p.dx = Math.cos(s.a) * spr.S * .3 * k; p.dy = Math.sin(s.a) * spr.S * .3 * k;
    }
  }
  function leaves(x, y, n = 6) {
    n = nq(n);
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = rnd(30, 120), p = add(LEAF, x + rnd(-16, 16), y + rnd(-10, 10), rnd(18, 42), rnd(.7, 1.2)); p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; p.vz = rnd(60, 170); p.rot = Math.random() * TAU; p.vr = rnd(-7, 7); p.spr = Art.leaf(LEAVES[i % 3]); p.size = rnd(.8, 1.3); }
  }
  function splash(x, y, k = 1) {
    const n = nq(5);
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = rnd(40, 130) * k, p = add(DROP, x, y, 4, rnd(.3, .5)); p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; p.vz = rnd(130, 280) * k; p.size = rnd(3, 5.5); p.col = '#dff6fb'; }
    ring(x, y, 40 * k, '#dff6fb', .42);
  }
  function rise(x, y, n, col = '#ffe69a', spread = 44, life = .85, size = 8) {
    n = nq(n);
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, d = Math.random() * spread, p = add(RISE, x + Math.cos(a) * d, y + Math.sin(a) * d * .6, rnd(4, 30), life * rnd(.65, 1.15)); p.vz = rnd(70, 190); p.size = size * rnd(.7, 1.5); p.col = col; p.ph = Math.random() * TAU; }
  }
  function popCoin(team, x, y, z) {
    const p = add(DISC, x, y, z, 1); const a = Math.random() * TAU, v = rnd(90, 200);
    p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; p.vz = rnd(260, 420); p.vr = rnd(10, 18); p.ph = Math.random() * TAU; p.size = 20; p.bounce = 1; p.spr = Terrain.towerCoin(team === 1 ? 1 : 0, 38); p.v = .5; p.flip = true;
    spark(x, y, 2, GOLD, 170, .28, 9, z);
  }
  function pillar(x, y, col, col2, life = .8) { const p = add(PILLAR, x, y, 0, life); p.spr = Art.pillar(col, col2); }
  // A straight beam between two world points, white at the heart. Lives on one frame's worth of allocation.
  function beam(x0, y0, x1, y1, col, width, life, z = 20) { const p = add(BEAMK, x0, y0, z, life); p.dx = x1; p.dy = y1; p.R = width; p.col = col; return p; }
  // A flat engraved circle on the ground, popped in and turned once.
  function sigil(name, x, y, r, col, life, spin = 1.2, z = 2) { const p = add(SIGILK, x, y, z, life); p.spr = Art.sigil(name, col); p.R = r; p.vr = spin; p.rot = Math.random() * TAU; return p; }
  // Forked lightning, drawn as one flickering line.
  function arcs(x0, y0, z0, x1, y1, z1, col, life = .14, jag = 16) {
    const p = add(BOLTK, x0, y0, z0, life), d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(3, Math.min(9, Math.ceil(d / 40))), pts = [];
    for (let i = 0; i <= n; i++) { const f = i / n, off = i && i < n ? rnd(-jag, jag) : 0, nx = -(y1 - y0) / (d || 1), ny = (x1 - x0) / (d || 1); pts.push(x0 + (x1 - x0) * f + nx * off, y0 + (y1 - y0) * f + ny * off, z0 + (z1 - z0) * f + (i && i < n ? rnd(-jag, jag) : 0)); }
    p.pts = pts; p.col = col; return p;
  }
  // A clean straight cut, the mark of a fast blade.
  function cut(x, y, an, len, col, life = .16, z = 20) { const p = add(CUTK, x, y, z, life); p.rot = an; p.R = len; p.col = col; return p; }

  // Civilians leaving a site: rescued ones skip away cheering, seized ones bolt in panic. Nobody is hurt.
  function civRun(x, y, n, panic) {
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + rnd(-.3, .3), v = panic ? rnd(250, 340) : rnd(110, 170), p = add(CIV, x + Math.cos(a) * 40, y + Math.sin(a) * 40, 6, panic ? rnd(.9, 1.2) : rnd(1.3, 1.7));
      p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; p.spr = Art.civCoin(i % 4); p.size = 15; p.ph = Math.random() * TAU; p.flip = panic;
    }
  }
  function flyGold(amount) {
    const me = G.me, x0 = sx(me.x), y0 = sy(me.y) - 40 * Z, n = Math.min(6, 1 + Math.ceil(amount / 50));
    for (let i = 0; i < n; i++) flyers.push({ x0: x0 + rnd(-14, 14), y0: y0 + rnd(-8, 8), mx: rnd(-54, 54), my: rnd(-58, -22), t: -i * .055, dur: rnd(.56, .72), ph: Math.random() * TAU });
  }
  // Hits on one target in quick succession add up in place instead of stacking a pile of numbers.
  function number(x, y, z, val, col, big, life = .8, key, side) {
    const list = G.text;
    if (key !== undefined && typeof val === 'number') for (const t of list) if (t.key === key && G.t - t.born < .45) { t.val += val; t.s = String(t.val); t.t = t.max = life; t.big = t.big || big; return; }
    if (list.length >= 12) list.shift();
    list.push({ x: x + (side || 0), y, z, s: String(val), val, col, big, t: life, max: life, key, born: G.t });
  }

  // ---------- overlays, drawn above the fog and the units so they stay at full brightness ----------
  const OV_CAP = () => quality >= 2 ? 8 : quality === 1 ? 6 : 4;
  function overlay(kind, x, y, z, life, o) { if (OV.length >= OV_CAP()) OV.shift(); o.kind = kind; o.x = x; o.y = y; o.z = z; o.t = 0; o.life = life; o.rot = Math.random() * TAU; OV.push(o); }
  // The heavy beat: a hard white flash with thin radial slashes, and fine speed lines only on request.
  function burst(x, y, z, pal, k = 1, lines = true) {
    overlay(0, x, y, z, .12, { spr: Art.impact(pal.imp, pal.imp2, 1 + (Math.random() * 3 | 0)), r: 74 * k });
    if (lines && quality >= 1) overlay(2, x, y, z, .18, { spr: Art.speedLines(pal.lines, 1 + (Math.random() * 3 | 0)), r: 150 * k, ink: null });
  }
  // A small sharp flash for an everyday confirmed hit.
  function flash(x, y, z, pal, r = 42) { overlay(0, x, y, z, .09, { spr: Art.impact(pal.imp, pal.imp2, 1 + (Math.random() * 3 | 0)), r }); }
  // Your hit confirm: four ticks snap out around the target. It frames the coin rather than covering it.
  function hitMark(u, col) { const r = (OV_R[u.kind] || 30) * (u.boss ? 1.6 : 1); overlay(3, u.x, u.y, u.kind === 'champ' ? 20 : 14, .18, { r, col }); }

  // A footsoldier landing a blow: one short star of impact where it connects. Melee quick and small, heavy a thud you can see.
  function minionHit(type, x, y, team, v) {
    if (!litAt(x, y, 30)) return;
    const pal = palT(team), heavy = type === 'heavy', p = add(IMP, x, y, heavy ? 12 : 16, heavy ? .16 : .1); p.spr = Art.impact(pal.imp, pal.imp2, 1 + (Math.random() * 3 | 0)); p.R = heavy ? 34 : 15; p.rot = Math.random() * TAU;
    if (heavy) { dustRing(x, y, 46, 4); ring(x, y, 62, pal.ring, .22); chips(x, y, 3, pal.chip, 180, 10); const d = Math.hypot(x - G.me.x, y - G.me.y); if (d < 420) G.shake = Math.max(G.shake, 1.6); }
  }

  // ---------- simulation of particles ----------
  function step(dt) {
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i]; p.life -= dt;
      if (p.life <= 0) { const l = P.pop(); if (i < P.length) P[i] = l; continue; }
      if (p.gold && p.life < p.max * .62) { const x = p.x, y = p.y, z = p.z; p.gold = false; p.life = .05; coins(x, y, 2, { z: Math.max(8, z), sp: 150, vzMin: 180, vz: 420, size: 10, life: 1 }); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += p.vr * dt;
      switch (p.k) {
        case SPARK: case DROP: p.vz -= 900 * dt; if (p.z < 1) p.life = 0; break;
        case PUFF: p.vx *= .94; p.vy *= .94; p.vz *= .94; break;
        case CIV: p.ph += dt * (p.flip ? 22 : 13); p.z = 6 + Math.abs(Math.sin(p.ph)) * (p.flip ? 9 : 22); if (p.flip) { p.vx += Math.sin(p.ph * .6) * 900 * dt; p.vy += Math.cos(p.ph * .5) * 700 * dt; } break;
        case RISE: p.vz *= .98; break;
        case LEAF: p.vz -= 120 * dt; p.vx *= .985; p.vy *= .985; if (p.z < 2) p.life = Math.min(p.life, .14), p.vz = 0, p.vr = 0; break;
        case GHOST: if (p.flip) { p.vz -= 900 * dt; p.ph = Math.cos(p.rot); if (p.z < 2) { p.z = 2; p.vz = 0; p.vr *= .6; } } break;
        case SHARD: case COIN: case DISC: case CHIP:
          p.vz -= 900 * dt; p.ph += p.vr * dt;
          if (p.z < 2) { p.z = 2; if (p.bounce > 0) { p.bounce--; p.vz = -p.vz * .5; p.vx *= .55; p.vy *= .55; } else { p.vz = 0; p.vx = p.vy = 0; p.vr = 0; } }
          break;
      }
    }
    for (let i = LATER.length - 1; i >= 0; i--) { const L = LATER[i]; if ((L.d -= dt) <= 0) { LATER.splice(i, 1); L.fn(); } }
    for (let i = flyers.length - 1; i >= 0; i--) {
      const f = flyers[i]; f.t += dt; f.ph += dt * 13;
      if (f.t >= f.dur) { flyers[i] = flyers[flyers.length - 1]; flyers.pop(); G.goldBump = 1; if (arrive.length < 3) arrive.push(0); }
    }
    for (let i = falls.length - 1; i >= 0; i--) {
      const f = falls[i]; f.t += dt;
      // The stack erupts coin by coin, rising up the column, then the ground answers.
      while (f.i < f.n && f.t > f.i * .036) {
        const p = add(DISC, f.x + rnd(-10, 10), f.y + rnd(-6, 6), 24 + f.i / f.n * f.H, 1.05), a = Math.random() * TAU, v = rnd(110, 280);
        p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; p.vz = rnd(320, 620); p.vr = rnd(10, 20); p.ph = Math.random() * TAU; p.size = 20; p.bounce = 1; p.spr = Terrain.towerCoin(f.team === 1 ? 1 : 0, 38); p.v = rnd(.42, .62); p.flip = true; f.i++;
      }
      if (!f.boom && f.t > .3) { f.boom = true; ring(f.x, f.y, f.core ? 430 : 310, GOLD, .55); dustRing(f.x, f.y, f.core ? 170 : 120, 8); coins(f.x, f.y, f.core ? 24 : 15, { sp: 300, vz: 720, z: 50, size: 11 }); }
      if (f.boom && f.i >= f.n) { falls[i] = falls[falls.length - 1]; falls.pop(); }
    }
  }

  function draw(dt) {
    if (dt > 0) step(dt);
    const glow = Art.glow, m = 60;
    // normal blend first: inked, comic pieces
    for (const p of P) {
      if (p.k === RISE || p.k === DROP) continue;
      const X = sx(p.x), Y = sy(p.y) - p.z * Z, bigM = p.k === RING || p.k === SLASH || p.k === PILLAR || p.k === BEAMK || p.k === SIGILK || p.k === CUTK ? 500 : m;
      if (X < -bigM || X > VW + bigM || Y < -bigM || Y > VH + bigM) continue;
      const f = p.life / p.max, e = 1 - f;
      switch (p.k) {
        case SPARK: {
          const sp = Art.sparkSp(p.col), wy = p.vy * TILT - p.vz, l = Math.hypot(p.vx, wy) || 1, ux = p.vx / l, uy = wy / l, k = .45 + f * .55, len = p.size * Z * (1 + Math.min(1.5, l / 260)) * k, w = p.size * Z * .42 * k;
          ctx.globalAlpha = Math.min(1, f * 3); ctx.setTransform(dpr * ux, dpr * uy, -dpr * uy, dpr * ux, dpr * X, dpr * Y); ctx.drawImage(sp, -len, -w * .55, len * 2, w * 1.1); resetT(); break;
        }
        case PUFF: {
          const pop = f < .3 ? f / .3 : 1, r = p.size * Z * (.75 + outCub(e) * .95) * pop, c = Math.cos(p.rot) * r, sn = Math.sin(p.rot) * r;
          ctx.globalAlpha = Math.min(p.ph === 2 ? .5 : .9, f * 1.8); ctx.setTransform(dpr * c, dpr * sn * .72, -dpr * sn, dpr * c * .72, dpr * X, dpr * Y); if (p.ph === 2) ctx.drawImage(Art.puff(150, 205, 50), -1, -1, 2, 2); else ctx.drawImage(Art.dustCel(p.ph, p.v), -1, -1, 2, 2); resetT(); break;
        }
        case COIN: { const sp = coinSp(), r = p.size * Z, c = Math.max(.14, Math.abs(Math.cos(p.ph))); ctx.globalAlpha = Math.min(1, f * 3); ctx.drawImage(sp.c, X - r * c * 1.2, Y - r * 1.2, 2.4 * r * c, 2.4 * r); break; }
        case IMP: { const r = p.R * Z * (.55 + outExpo(e) * .55), c = Math.cos(p.rot) * r, sn = Math.sin(p.rot) * r; ctx.globalAlpha = Math.min(1, f * 2.4); ctx.setTransform(dpr * c, dpr * sn, -dpr * sn, dpr * c, dpr * X, dpr * Y); ctx.drawImage(p.spr, -1, -1, 2, 2); resetT(); break; }
        case CHIP: { const s = p.size * Z * 15, c = Math.cos(p.rot) * s, sn = Math.sin(p.rot) * s; ctx.globalAlpha = Math.min(1, f * 4); ctx.setTransform(dpr * c, dpr * sn, -dpr * sn, dpr * c, dpr * X, dpr * Y); ctx.drawImage(Art.chip(p.col, p.v), -.5, -.5, 1, 1); resetT(); break; }
        case SHARD: { const s = p.size * Z, w = p.spr.width * s, c = Math.cos(p.rot), sn = Math.sin(p.rot); ctx.globalAlpha = Math.min(1, f * 3); ctx.setTransform(dpr * c, dpr * sn, -dpr * sn, dpr * c, dpr * X, dpr * Y); ctx.drawImage(p.spr, -w / 2 - p.dx * Z, -w / 2 - p.dy * Z, w, w); resetT(); break; }
        case LEAF: { const c = Math.cos(p.rot) * p.size * Z, sn = Math.sin(p.rot) * p.size * Z; ctx.globalAlpha = Math.min(1, f * 4); ctx.setTransform(dpr * c, dpr * sn, -dpr * sn, dpr * c, dpr * X, dpr * Y); ctx.drawImage(p.spr, -8, -5); resetT(); break; }
        case GHOST: { const sp = p.spr; if (!sp.c) break; const w = (p.R * Z) / sp.R * sp.S, c = Math.max(.12, Math.abs(p.ph)); ctx.globalAlpha = p.alpha * f; ctx.drawImage(sp.c, X - w * c / 2, Y - w * .42, w * c, w * .84); break; }
        case CIV: { const sp = p.spr, w = p.size * Z / sp.R * sp.S; ctx.globalAlpha = Math.min(1, f * 3.5); ctx.drawImage(Art.shadow(), X - w * .4, sy(p.y) - w * .18, w * .8, w * .36); ctx.drawImage(sp.c, X - w / 2, Y - w * .46, w, w * .92); break; }
        case DISC: { const d = p.spr, k = Z * (p.v || 1), w = (d.w || d.c.width) * k, h = (d.h || d.c.height) * k, c = Math.max(.2, Math.abs(Math.cos(p.ph))); ctx.globalAlpha = Math.min(1, f * 3); ctx.drawImage(d.c, X - w * c / 2, Y - h / 2, w * c, h); break; }
        case RING: {
          const R = p.R * Z * (.22 + .85 * outExpo(e)), lw = (1 + f * f * 5) * Z, Ry = R * TILT;
          ctx.strokeStyle = p.col; ctx.globalAlpha = Math.min(.85, f * 1.9); ctx.lineWidth = lw; ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, 0, TAU); ctx.stroke(); break;
        }
        case SLASH: {
          // a single tapered arc of light, white at the heart
          const an = Math.atan2(p.dy, p.dx), R = p.R * Z * (.72 + .28 * outExpo(e)), sw = .9 * Math.min(1, e * 5 + .35), w = (14 * f + 2) * Z, ca = Math.cos(an), sa = Math.sin(an);
          ctx.save(); ctx.translate(X, Y); ctx.scale(1, TILT); ctx.globalAlpha = Math.min(1, f * 2.4); ctx.fillStyle = p.col;
          ctx.beginPath(); ctx.arc(0, 0, R, an - sw, an + sw); ctx.arc(-ca * w * 1.1, -sa * w * 1.1, R + w * .4, an + sw * .98, an - sw * .98, true); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, 0, R, an - sw * .55, an + sw * .55); ctx.arc(-ca * w * .4, -sa * w * .4, R + w * .1, an + sw * .55, an - sw * .55, true); ctx.closePath(); ctx.fill();
          ctx.restore(); break;
        }
        case BEAMK: {
          const X1 = sx(p.dx), Y1 = sy(p.dy) - p.z * Z, w = p.R * Z * (e < .18 ? .4 + e / .18 * .6 : f * 1.25); ctx.lineCap = 'round'; ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = p.col; ctx.globalAlpha = Math.min(.85, f * 2.2); ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X1, Y1); ctx.stroke();
          ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = Math.min(1, f * 3); ctx.lineWidth = w * .36; ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X1, Y1); ctx.stroke();
          ctx.globalCompositeOperation = 'source-over'; break;
        }
        case SIGILK: {
          const R = p.R * Z * (e < .22 ? outBack(e / .22) : 1 + (e - .22) * .05), c = Math.cos(p.rot), sn = Math.sin(p.rot), Y0 = sy(p.y) - p.z * Z;
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(p.R > 200 ? .42 : .8, f * 2.2); ctx.setTransform(dpr * c * R, dpr * sn * R * TILT, -dpr * sn * R, dpr * c * R * TILT, dpr * X, dpr * Y0); ctx.drawImage(p.spr, -1, -1, 2, 2); resetT(); ctx.globalCompositeOperation = 'source-over'; break;
        }
        case BOLTK: {
          if ((frameId + p.v) % 2) break; ctx.lineCap = 'round'; const pts = p.pts; ctx.beginPath(); for (let i = 0; i < pts.length; i += 3) { const px2 = sx(pts[i]), py2 = sy(pts[i + 1]) - pts[i + 2] * Z; if (i) ctx.lineTo(px2, py2); else ctx.moveTo(px2, py2); }
          ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = p.col; ctx.globalAlpha = Math.min(.9, f * 2); ctx.lineWidth = 3.2 * Z + 1; ctx.stroke(); ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 1; ctx.lineWidth = 1.1; ctx.stroke(); ctx.globalCompositeOperation = 'source-over'; break;
        }
        case CUTK: {
          const c = Math.cos(p.rot), sn = Math.sin(p.rot), L = p.R * Z * (.4 + .6 * outExpo(Math.min(1, e * 2.5))), w = (5 * f + 1.2) * Z;
          ctx.globalAlpha = Math.min(1, f * 3); ctx.fillStyle = p.col; ctx.beginPath(); ctx.moveTo(X - c * L, Y - sn * L * TILT); ctx.lineTo(X - sn * w * .5, Y + c * w * .5 * TILT); ctx.lineTo(X + c * L, Y + sn * L * TILT); ctx.lineTo(X + sn * w * .5, Y - c * w * .5 * TILT); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(X - c * L * .65, Y - sn * L * .65 * TILT); ctx.lineTo(X - sn * w * .2, Y + c * w * .2 * TILT); ctx.lineTo(X + c * L * .65, Y + sn * L * .65 * TILT); ctx.lineTo(X + sn * w * .2, Y - c * w * .2 * TILT); ctx.closePath(); ctx.fill(); break;
        }
        case PILLAR: {
          const h = 300 * Z, w = 58 * Z * (e < .14 ? outBack(e / .14) : e < .6 ? 1 : 1 - outCub((e - .6) / .4) * .92), yy = sy(p.y);
          { const gap = 66 * Z, sh = p.spr.height * (1 - gap / h); ctx.globalAlpha = Math.min(.8, f * 2); ctx.drawImage(p.spr, 0, 0, p.spr.width, sh, X - w / 2, yy - h, w, h - gap); } break;
        }
      }
    }
    ctx.globalAlpha = 1;
    // additive layer: only the soft sparkle kinds
    ctx.globalCompositeOperation = 'lighter';
    for (const p of P) {
      if (p.k !== RISE && p.k !== DROP) continue;
      const X = sx(p.x), Y = sy(p.y) - p.z * Z;
      if (X < -m || X > VW + m || Y < -m || Y > VH + m) continue;
      const f = p.life / p.max;
      if (p.k === RISE) { const r = p.size * Z * (.55 + f * .6) * (.75 + .25 * Math.sin(p.ph + p.life * 14)); ctx.globalAlpha = Math.min(1, f * 2.5); ctx.drawImage(Art.glint(p.col), X - r, Y - r, r * 2, r * 2); }
      else { const r = p.size * Z * f; ctx.globalAlpha = Math.min(1, f * 1.6); ctx.drawImage(glow(p.col), X - r, Y - r, r * 2, r * 2); }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    if (PINGS.length) drawPings(dt);
  }

  // ---------- projectiles ----------
  // [ribbon life, width, alpha]. Minion shots have no trail at all.
  const TRAIL = { ricochet: [.1, 7, .9], hexbolt: [.16, 9, .8], polymorph: [.14, 7, .8], snipe: [.13, 8, .95], snipeFull: [.2, 14, 1], deadeye: [.32, 22, 1], orb: [.2, 16, .8], ray: [.1, 9, .8], bolt: [.12, 5, .7], tower: [.2, 8, .8] };
  const ROUTINE = { bolt: 1, mbolt: 1, tower: 1 };
  // Reads an owner or target that may be a live unit, a bare id or absent, as it can be on a guest.
  const unitRef = r => r === undefined || r === null ? null : typeof r === 'object' ? r : unitById(r);
  // 0 routine and quiet, 1 an ally's spell, 2 your own, 3 aimed at you or an enemy spell.
  function projClass(p) {
    const me = G.me, o = unitRef(p.owner); if (o === me || (o && o.id === me.id)) return 2;
    if (ROUTINE[p.fx]) { const t = unitRef(p.target); return t && t.id === me.id ? 3 : 0; }
    return p.team === me.team ? 1 : 3;
  }
  const palOf = (team, cls, p) => { if (cls === 3) return DANGER; const o = p && unitRef(p.owner); return (o && KIT_PAL[o.champ]) || palT(team); };

  function ribbon(t, W0, col, alpha) {
    const pts = t.pts, n = Math.min(pts.length, 48); if (n < 2) return;
    for (let i = 0; i < n; i++) { const q = pts[pts.length - n + i]; buf[i * 2] = sx(q.x); buf[i * 2 + 1] = sy(q.y) - q.z * Z; }
    ctx.fillStyle = col; ctx.globalAlpha = alpha; ctx.beginPath();
    for (let side = 0; side < 2; side++) {
      for (let j = 0; j < n; j++) {
        const i = side ? n - 1 - j : j, ax = buf[Math.max(0, i - 1) * 2], ay = buf[Math.max(0, i - 1) * 2 + 1], bx = buf[Math.min(n - 1, i + 1) * 2], by = buf[Math.min(n - 1, i + 1) * 2 + 1];
        const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1, w = W0 * Z * (i / (n - 1)) * .5 * (side ? -1 : 1), x = buf[i * 2] - dy / l * w, y = buf[i * 2 + 1] + dx / l * w;
        if (side === 0 && j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
    }
    ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
  }

  function trailFor(p, X, Y, Z0, dt, cls) {
    const cfg = TRAIL[p.fx]; if (!cfg || p.id === undefined || cls === 0) return;
    let t = trails.get(p.id);
    if (!t) {
      const pal = palOf(p.team, cls, p), tw = p.fx === 'tower' && cls !== 3 && (p.team === 0 || p.team === 1);
      t = { pts: [], life: cfg[0], w: cfg[1], a: cfg[2], out: tw ? TEAM[p.team] : pal.out, mid: pal.mid, core: pal.core, fx: p.fx, team: p.team, cls, seen: frameId, ox: p.x, oy: p.y, lx: X, ly: Y, at: G.t }; trails.set(p.id, t);
    }
    t.seen = frameId; t.lx = X; t.ly = Y; t.at = G.t;
    if (dt > 0) { const q = TP.pop() || { x: 0, y: 0, z: 0, age: 0 }; q.x = X; q.y = Y; q.z = Z0; q.age = 0; t.pts.push(q); }
    return t;
  }
  function paintTrail(t, fade) {
    const a = t.a * fade;
    if (t.cls === 1) { ribbon(t, t.w * .7, t.mid, a * .55); return; } // an ally's spell is a single quiet ribbon
    ribbon(t, t.w, t.out, a);
    ribbon(t, t.w * .34, t.core, a);
  }

  function projectiles(a, dt) {
    frameId++;
    const s = G.s, list = s.proj || EMPTY_LIST;
    ctx.lineCap = 'round';
    for (const p of list) {
      const q = posNow(p, a), x = q.x, y = q.y, cls = projClass(p), vis = onScreen(x, y, 220) && (p.team === G.me.team || litAt(x, y, 70));
      if (p.fx === 'chain') { if (vis) chain(p, x, y, a, cls); continue; }
      let z = 26;
      if (p.homing && (p.fx === 'bolt' || p.fx === 'mbolt')) {
        const tg = unitRef(p.target), rem = tg ? Math.hypot(tg.x - x, tg.y - y) : 0, t0 = p.id === undefined ? null : trails.get(p.id), org = t0 ? Math.hypot(x - t0.ox, y - t0.oy) : 0, ft = org + rem > 1 ? org / (org + rem) : 0;
        z = 24 + Math.sin(ft * Math.PI) * 34;
      } else if (p.fx === 'tower') z = 52 - Math.min(1, (p.age || 0) * 2) * 22;
      const t = trailFor(p, x, y, z, dt, cls);
      if (!vis) continue;
      const X = sx(x), Y = sy(y) - z * Z;
      if (t) paintTrail(t, 1);
      head(p, x, y, X, Y, z, a, cls);
    }
    // age trails; finish off those whose projectile has gone
    for (const [id, t] of trails) {
      for (const q of t.pts) q.age += dt;
      while (t.pts.length && t.pts[0].age > t.life) TP.push(t.pts.shift());
      while (t.pts.length > 48) TP.push(t.pts.shift());
      if (t.seen !== frameId) {
        if (!t.pts.length) { trails.delete(id); continue; }
        if (quality >= 1) paintTrail(t, .8);
      }
    }
  }

  // layered disc with an ink edge
  const blob = (X, Y, r, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X, Y, r, 0, TAU); ctx.fill(); };
  const lighter = (spr, X, Y, g, al) => { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = al; ctx.drawImage(spr, X - g, Y - g, g * 2, g * 2); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; };
  function stroke1(X0, Y0, X1, Y1, c, w) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(X0, Y0); ctx.lineTo(X1, Y1); ctx.stroke(); }
  function lance(X, Y, ux, uy, L, w, pal) {
    ctx.lineCap = 'butt'; const X0 = X - ux * L, Y0 = Y - uy * L, X1 = X + ux * w * .9, Y1 = Y + uy * w * .9;
    stroke1(X0, Y0, X1, Y1, pal.out, w * .9); stroke1(X0, Y0, X1, Y1, pal.core, w * .3); ctx.lineCap = 'round';
  }
  function head(p, x, y, X, Y, z, a, cls) {
    const pal = palOf(p.team, cls, p), glow = Art.glow, hot = cls >= 2;
    let ux = 1, uy = 0; if (!p.homing && p.vx !== undefined) { const vx = p.vx, vy = p.vy * TILT, l = Math.hypot(vx, vy) || 1; ux = vx / l; uy = vy / l; }
    // A hard, slim needle along the line of travel.
    const dart = (L, w, col) => { ctx.setTransform(dpr * ux, dpr * uy, -dpr * uy, dpr * ux, dpr * X, dpr * Y); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(L, 0); ctx.lineTo(-L * .35, w); ctx.lineTo(-L * .7, 0); ctx.lineTo(-L * .35, -w); ctx.closePath(); ctx.fill(); resetT(); };
    switch (p.fx) {
      case 'bolt': case 'mbolt': {
        if (cls === 0) { const r = (p.fx === 'bolt' ? 2.6 : 2) * Z + 1; blob(X, Y, r, pal.mid); break; }
        const R = 7 * Z; dart(R * 2.2, R * .55, pal.out); dart(R * 1.5, R * .28, pal.core); if (hot) lighter(glow(pal.mid), X, Y, R * 1.8, .7); break;
      }
      case 'tower': {
        const c = cls === 3 ? DANGER.mid : (TEAM[p.team] || pal.out), R = (cls === 3 ? 9 : 6) * Z;
        if (cls === 3) lighter(glow(c), X, Y, 20 * Z, .75);
        blob(X, Y, R, c); blob(X, Y, R * .45, '#ffffff'); break;
      }
      case 'snipe': case 'snipeFull': {
        const full = p.fx === 'snipeFull', w = (full ? 7 : 4.5) * Z * (cls === 1 ? .7 : 1), L = (full ? 160 : 100) * Z; lance(X, Y, ux, uy, L, w, pal);
        if (hot) lighter(glow(pal.mid), X, Y, (full ? 18 : 12) * Z, .85);
        dart(w * 3.6, w * .8, pal.core); break;
      }
      case 'deadeye': {
        lighter(glow(pal.mid), X, Y, 34 * Z, .85); dart(46 * Z, 10 * Z, pal.out); dart(34 * Z, 4.5 * Z, pal.core); break;
      }
      case 'orb': {
        const R = (cls === 1 ? 9 : 13) * Z, c = Math.cos((p.age || 0) * 7), sn = Math.sin((p.age || 0) * 7);
        if (hot) lighter(glow(pal.mid), X, Y, 24 * Z, .7);
        // a turning lozenge of energy
        const lz = (r, w, col) => { ctx.setTransform(dpr * c, dpr * sn, -dpr * sn, dpr * c, dpr * X, dpr * Y); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(w, 0); ctx.lineTo(0, r); ctx.lineTo(-w, 0); ctx.closePath(); ctx.fill(); resetT(); };
        lz(R, R * .62, pal.out); lz(R * .72, R * .4, pal.mid); lz(R * .4, R * .2, pal.core);
        break;
      }
      case 'ray': {
        const o = unitRef(p.owner); if (!o) { blob(X, Y, 6 * Z, pal.mid); break; }
        const op = posNow(o, a), ox = sx(op.x), oy = sy(op.y) - 18 * Z, k = cls === 1 ? .55 : 1, pul = 1 + Math.sin(G.t * 50) * .08; ctx.lineCap = 'butt';
        stroke1(ox, oy, X, Y, pal.out, 8 * Z * pul * k); stroke1(ox, oy, X, Y, pal.core, 2.4 * Z * k);
        blob(X, Y, 7 * Z * k, pal.mid); blob(X, Y, 3.4 * Z * k, pal.core); break;
      }
      case 'ricochet': {
        // a flat spinning razor
        const R = (cls === 1 ? 7 : 10) * Z, an = (p.age || 0) * 34, c = Math.cos(an), sn = Math.sin(an);
        if (hot) lighter(glow(pal.mid), X, Y, R * 2.2, .75);
        ctx.setTransform(dpr * c, dpr * sn, -dpr * sn, dpr * c, dpr * X, dpr * Y); ctx.fillStyle = pal.mid; ctx.beginPath(); for (let i = 0; i < 6; i++) { const a0 = i / 6 * TAU, q = i % 2 ? R * .45 : R; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a0) * q, Math.sin(a0) * q * .7); } ctx.closePath(); ctx.fill(); ctx.fillStyle = pal.core; ctx.beginPath(); ctx.arc(0, 0, R * .28, 0, TAU); ctx.fill(); resetT(); break;
      }
      case 'hexbolt': {
        const R = (cls === 1 ? 9 : 12) * Z, an = (p.age || 0) * 9, c = Math.cos(an), sn = Math.sin(an);
        if (hot) lighter(glow(pal.mid), X, Y, R * 2.1, .8);
        const hx = (r, col) => { ctx.fillStyle = col; ctx.beginPath(); for (let i = 0; i < 6; i++) { const a0 = i / 6 * TAU; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a0) * r, Math.sin(a0) * r); } ctx.closePath(); ctx.fill(); };
        ctx.setTransform(dpr * c, dpr * sn, -dpr * sn, dpr * c, dpr * X, dpr * Y); hx(R, pal.out); hx(R * .68, pal.mid); hx(R * .32, pal.core); resetT(); break;
      }
      case 'polymorph': {
        // a real gold coin, tumbling
        const spr = coinSp(), r = (cls === 1 ? 10 : 13) * Z, cz = Math.max(.15, Math.abs(Math.cos((p.age || 0) * 15)));
        lighter(glow('#ffe6a8'), X, Y, r * 1.9, .55); ctx.drawImage(spr.c, X - r * cz * 1.2, Y - r * 1.2, r * 2.4 * cz, r * 2.4); break;
      }
      default: if (hot) lighter(glow(pal.mid), X, Y, (p.w || 30) * Z * .7, 1);
    }
  }

  function chain(p, x, y, a, cls) {
    const o = unitRef(p.owner); if (!o) return;
    const op = posNow(o, a), ax = sx(op.x), ay = sy(op.y) - 24 * Z, X = sx(x), Y = sy(y) - 24 * Z, dx = X - ax, dy = Y - ay, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, pal = palOf(p.team, cls);
    const sp = link(cls === 3 ? 2 : p.team), step = 13 * Z, n = Math.min(70, Math.floor(d / step)), s = Z * 1.25;
    for (let i = 0; i <= n; i++) {
      const X0 = ax + ux * i * step, Y0 = ay + uy * i * step, odd = i % 2, cs = odd ? -uy : ux, sn = odd ? ux : uy, sw = odd ? .55 : 1;
      ctx.setTransform(dpr * cs * s * sw, dpr * sn * s * sw, -dpr * sn * s, dpr * cs * s, dpr * X0, dpr * Y0);
      ctx.drawImage(sp, -10, -6);
    }
    ctx.setTransform(dpr * ux * Z * 1.3, dpr * uy * Z * 1.3, -dpr * uy * Z * 1.3, dpr * ux * Z * 1.3, dpr * X, dpr * Y);
    ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(10, 0); ctx.lineTo(19, 8); ctx.lineTo(16, 20); ctx.strokeStyle = pal.mid; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = pal.mid; ctx.beginPath(); ctx.moveTo(11, 25); ctx.lineTo(23, 16); ctx.lineTo(19, 26); ctx.closePath(); ctx.fill();
    resetT();
  }

  // ---------- telegraphs ----------
  // Colour strings are built once per colour and alpha step, not once per frame.
  const RGBA = new Map();
  function rgba(col, a) { const k = Math.round(clamp01(a) * 24); let arr = RGBA.get(col); if (!arr) RGBA.set(col, arr = new Array(25)); return arr[k] || (arr[k] = 'rgba(' + col + ',' + (k / 24) + ')'); }
  const INK_A = a => rgba('20,10,30', Math.min(.9, a));
  const DASH = [0, 0], NODASH = [];
  function dashed(on, gap, speed) { DASH[0] = on; DASH[1] = gap; ctx.setLineDash(DASH); ctx.lineDashOffset = -G.t * speed; }
  const undash = () => { ctx.setLineDash(NODASH); ctx.lineDashOffset = 0; };

  function chevrons(X, Y, ux, uy, L, hw, col, alpha) {
    const gap = Math.max(34 * Z, 18), n = Math.min(14, Math.floor(L / gap)), ph = (G.t * 2.6) % 1, h = Math.min(hw * .6, 14 * Z), d = h * .7;
    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter'; ctx.strokeStyle = rgba(col, alpha * .9); ctx.lineWidth = Math.max(1.2, 1.8 * Z); ctx.beginPath();
    for (let i = 0; i < n; i++) { const s = (i + ph) * gap; if (s > L - d) continue; const x = X + ux * s, y = Y + uy * s; ctx.moveTo(x - ux * d - uy * h, y - uy * d + ux * h); ctx.lineTo(x + ux * d * .4, y + uy * d * .4); ctx.lineTo(x - ux * d + uy * h, y - uy * d - ux * h); }
    ctx.stroke();
  }
  // Where a line from this point is stopped by the first wall. Everyone reads the true reach, friend or foe.
  function reach(x, y, dx, dy, len) { try { return Sim.rayWall ? Math.max(0, Math.min(len, Sim.rayWall(x, y, dx, dy, len))) : len; } catch (e) { return len; } }
  // A hard stop mark where a line meets a wall.
  function stopTick(EX, EY, ux, uy, hw, col, alpha) { ctx.strokeStyle = rgba(col, alpha); ctx.lineWidth = Math.max(2, 3 * Z); ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(EX - uy * hw * 1.25, EY + ux * hw * 1.25); ctx.lineTo(EX + uy * hw * 1.25, EY - ux * hw * 1.25); ctx.stroke(); }
  // Ground layer of a telegraph, under the units. An enemy's bold outline is added later by danger(), above everything.
  function lineShape(x, y, dx, dy, len, w, col, alpha, f, arrow, enemy, ally) {
    const full = len, L0 = reach(x, y, dx, dy, len), cut = L0 < full - 1; len = L0;
    const X = sx(x), Y = sy(y), EX = sx(x + dx * len), EY = sy(y + dy * len), px = -(EY - Y), py = EX - X, l = Math.hypot(px, py) || 1, hw = w / 2 * Z, nx = px / l * hw, ny = py / l * hw, ux = (EX - X) / l, uy = (EY - Y) / l;
    ctx.fillStyle = rgba(col, alpha * (enemy ? .24 : ally ? .08 : .14)); ctx.beginPath(); ctx.moveTo(X + nx, Y + ny); ctx.lineTo(EX + nx, EY + ny); ctx.lineTo(EX - nx, EY - ny); ctx.lineTo(X - nx, Y - ny); ctx.closePath(); ctx.fill();
    if (f !== undefined && f === f) { const FX_ = X + (EX - X) * f, FY = Y + (EY - Y) * f; ctx.fillStyle = rgba(col, alpha * (ally ? .18 : .4)); ctx.beginPath(); ctx.moveTo(X + nx, Y + ny); ctx.lineTo(FX_ + nx, FY + ny); ctx.lineTo(FX_ - nx, FY - ny); ctx.lineTo(X - nx, Y - ny); ctx.closePath(); ctx.fill(); }
    if (enemy) return;
    ctx.lineJoin = 'miter'; ctx.beginPath(); ctx.moveTo(X + nx, Y + ny); ctx.lineTo(EX + nx, EY + ny); ctx.moveTo(X - nx, Y - ny); ctx.lineTo(EX - nx, EY - ny);
    if (ally) { ctx.strokeStyle = rgba(col, alpha * .45); ctx.lineWidth = 1.2; ctx.stroke(); return; }
    ctx.strokeStyle = rgba(col, alpha + .1); ctx.lineWidth = 1.8; ctx.stroke();
    chevrons(X, Y, ux, uy, l, hw, col, alpha);
    if (cut) stopTick(EX, EY, ux, uy, hw, col, alpha);
    else if (arrow) {
      const a = Math.min(20 * Z, Math.max(hw, 11 * Z)), b = a * 1.25;
      ctx.fillStyle = rgba(col, alpha + .15); ctx.beginPath(); ctx.moveTo(EX + ux * b, EY + uy * b); ctx.lineTo(EX - uy * a, EY + ux * a); ctx.lineTo(EX + uy * a, EY - ux * a); ctx.closePath(); ctx.fill();
    }
  }
  function circleShape(x, y, r, col, alpha, f, enemy, ally) {
    const X = sx(x), Y = sy(y), R = r * Z, Ry = R * TILT;
    ctx.fillStyle = rgba(col, alpha * (enemy ? .2 : ally ? .08 : .13)); ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, 0, TAU); ctx.fill();
    if (f !== undefined && f === f && !ally) { const k = enemy ? outCub(f) : f; ctx.fillStyle = rgba(col, alpha * .4); ctx.beginPath(); ctx.ellipse(X, Y, R * k, Ry * k, 0, 0, TAU); ctx.fill(); }
    if (enemy) return;
    ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, 0, TAU);
    ctx.strokeStyle = rgba(col, ally ? alpha * .5 : alpha + .1); ctx.lineWidth = ally ? 1.2 : 1.8; ctx.stroke();
  }
  function rangeRing(x, y, r, col, alpha) {
    if (!r) return; const X = sx(x), Y = sy(y), R = r * Z, Ry = R * TILT; ctx.strokeStyle = INK_A(.5); ctx.lineWidth = 3.4; ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = rgba(col, Math.min(1, alpha + .45)); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, 0, TAU); ctx.stroke();
    // eight small ticks turning slowly, so the edge is unmistakable against any ground
    ctx.lineWidth = 2.2; ctx.beginPath(); for (let i = 0; i < 8; i++) { const a0 = G.t * .5 + i * TAU / 8, c = Math.cos(a0), sn = Math.sin(a0); ctx.moveTo(X + c * R, Y + sn * Ry); ctx.lineTo(X + c * (R - 8), Y + sn * (Ry - 8 * TILT)); } ctx.stroke();
  }

  const ENEMY = '255,62,40';
  const NOAB = {};
  const fracOf = (t, total) => total ? 1 - t / total : 1;
  const rdt_ = () => { const last = G.fxLastT === undefined ? G.t : G.fxLastT, d = G.t - last; G.fxLastT = G.t; return d > 0 ? Math.min(.05, d) : 0; };
  function telegraphs(a) {
    const s = G.s, me = G.me, pulse = .85 + Math.sin(G.t * 14) * .15, zones = s.zones || EMPTY_LIST, champs = s.champs || EMPTY_LIST;
    for (const z of zones) {
      zoneTeam.set(z.x + '|' + z.y, z.team); if (zoneTeam.size > 40) { const k = zoneTeam.keys().next().value; zoneTeam.delete(k); }
      if (!onScreen(z.x, z.y, z.r * Z + 60)) continue;
      const friendly = z.team === me.team, pal = palT(z.team);
      if (!friendly && !litAt(z.x, z.y, z.r)) continue;
      if (zoneArt(z, friendly, pal, rdt_())) continue;
      if (z.kind === 'dome') {
        const X = sx(z.x), Y = sy(z.y), R = z.r * Z, Ry = R * TILT;
        ctx.fillStyle = friendly ? 'rgba(90,170,255,.1)' : 'rgba(255,62,40,.12)'; ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = friendly ? pal.mid : '#ff3e28'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, 0, TAU); ctx.stroke();
      } else {
        const heal = z.fx === 'heal', col = heal ? '240,223,176' : friendly ? pal.aim : ENEMY;
        circleShape(z.x, z.y, z.r, col, friendly || heal ? .9 : pulse, fracOf(z.t, z.total), !friendly && !heal, friendly || heal);
      }
    }
    for (const c of champs) {
      if (!isUp(c) || !seesU(c)) continue;
      const fr = c.team === me.team, mine = c === me, col = fr ? palT(c.team).aim : ENEMY, alpha = fr ? .8 : pulse, q = posNow(c, a), qx = q.x, qy = q.y;
      if (c.chan && c.chan.kind === 'line') lineShape(qx, qy, c.chan.dx, c.chan.dy, c.chan.len, c.chan.w, col, alpha, fracOf(c.chan.t, c.chan.total), true, !fr, fr && !mine);
      if (c.charge && !(mine && Ctl.aim)) {
        const ab = (c.kit && c.kit[c.charge.slot]) || NOAB, f = Math.min(1, c.charge.t / (ab.charge || 1.1)), mn = ab.minRange || 0, len = mn + ((ab.range || 700) - mn) * f;
        lineShape(qx, qy, c.charge.dx, c.charge.dy, len, ab.w || 30, col, alpha, f, true, !fr, fr && !mine);
      }
    }
    const held = Ctl.atk !== null && Ctl.atk !== undefined && Ctl.atk !== false;
    if (held && isUp(me)) { const q = posNow(me, a); rangeRing(q.x, q.y, me.range, palT(me.team).aim, .1); }
    if (Ctl.aim && isUp(me)) ownAim(a);
  }

  // Danger sits above the whole picture: one solid red outline over black, nothing else to parse. It flares if you are standing in it.
  function dangerLine(x, y, dx, dy, len, w, f, inside) {
    const full = len, L0 = reach(x, y, dx, dy, len), cut = L0 < full - 1; len = L0;
    const X = sx(x), Y = sy(y), EX = sx(x + dx * len), EY = sy(y + dy * len), px = -(EY - Y), py = EX - X, l = Math.hypot(px, py) || 1, hw = w / 2 * Z, nx = px / l * hw, ny = py / l * hw, ux = (EX - X) / l, uy = (EY - Y) / l, p = inside ? .5 + Math.sin(G.t * 22) * .5 : 0;
    ctx.lineJoin = 'miter'; ctx.beginPath(); ctx.moveTo(X + nx, Y + ny); ctx.lineTo(EX + nx, EY + ny); ctx.lineTo(EX - nx, EY - ny); ctx.lineTo(X - nx, Y - ny); ctx.closePath();
    ctx.strokeStyle = INK_A(.85); ctx.lineWidth = 4.4; ctx.stroke(); ctx.strokeStyle = '#ff3e28'; ctx.lineWidth = 2.4; ctx.stroke();
    if (inside) { ctx.strokeStyle = rgba('255,255,255', .5 + p * .5); ctx.lineWidth = 1; ctx.stroke(); }
    if (cut) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(EX - uy * hw * 1.1, EY + ux * hw * 1.1); ctx.lineTo(EX + uy * hw * 1.1, EY - ux * hw * 1.1); ctx.stroke(); return; }
    const a = Math.min(18 * Z, Math.max(hw, 10 * Z)), b = a * 1.2;
    ctx.fillStyle = '#ff3e28'; ctx.beginPath(); ctx.moveTo(EX + ux * b, EY + uy * b); ctx.lineTo(EX - uy * a, EY + ux * a); ctx.lineTo(EX + uy * a, EY - ux * a); ctx.closePath(); ctx.fill();
  }
  function dangerCircle(x, y, r, f, inside) {
    const X = sx(x), Y = sy(y), R = r * Z, Ry = R * TILT, k = outCub(clamp01(f === f ? f : 1)), p = inside ? .5 + Math.sin(G.t * 22) * .5 : 0;
    ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, 0, TAU); ctx.strokeStyle = INK_A(.85); ctx.lineWidth = 4.4; ctx.stroke(); ctx.strokeStyle = '#ff3e28'; ctx.lineWidth = 2.4; ctx.stroke();
    if (inside) { ctx.strokeStyle = rgba('255,255,255', .5 + p * .5); ctx.lineWidth = 1; ctx.stroke(); }
    if (k < .985) { ctx.beginPath(); ctx.ellipse(X, Y, R * k, Ry * k, 0, 0, TAU); ctx.strokeStyle = '#ffd0b8'; ctx.lineWidth = 1.5; ctx.stroke(); }
    if (inside && R > 26) { const spr = Art.hazard(), h = Math.min(30, R * .55) * (.92 + p * .1); ctx.drawImage(spr.c, X - h / 2, Y - h / 2 - 6, h, h); }
  }
  function danger(a) {
    const s = G.s, me = G.me, zones = s.zones || EMPTY_LIST, champs = s.champs || EMPTY_LIST, alive = isUp(me), mx = me.x, my = me.y;
    for (const z of zones) {
      if (z.team === me.team || z.fx === 'heal' || z.kind === 'dome' || z.line || z.kind === 'tether' || z.kind === 'orbit' || z.kind === 'ring' || z.kind === 'decoy' || !onScreen(z.x, z.y, z.r * Z + 60) || !litAt(z.x, z.y, z.r)) continue;
      dangerCircle(z.x, z.y, z.r, fracOf(z.t, z.total), alive && Math.hypot(mx - z.x, my - z.y) < z.r + 28);
    }
    for (const c of champs) {
      if (c.team === me.team || !isUp(c) || !seesU(c)) continue;
      const hasLine = c.chan && c.chan.kind === 'line'; if (!hasLine && !c.charge) continue;
      const q = posNow(c, a), qx = q.x, qy = q.y;
      const line = (dx, dy, len, w, f) => { const rx = mx - qx, ry = my - qy, t = rx * dx + ry * dy, perp = Math.abs(rx * dy - ry * dx); dangerLine(qx, qy, dx, dy, len, w, f, alive && t > 0 && t < len && perp < w / 2 + 28); };
      if (hasLine) line(c.chan.dx, c.chan.dy, c.chan.len, c.chan.w, fracOf(c.chan.t, c.chan.total));
      if (c.charge) { const ab = (c.kit && c.kit[c.charge.slot]) || NOAB, f = Math.min(1, c.charge.t / (ab.charge || 1.1)), mn = ab.minRange || 0; line(c.charge.dx, c.charge.dy, mn + ((ab.range || 700) - mn) * f, ab.w || 30, f); }
    }
    towerWarning(a);
  }

  // Kade's Crash and Sable's Echo and Reap are the abilities that cross walls.
  const CROSSES = { kade: [false, false, true], sable: [false, true, true] };
  const crossesWalls = (c, slot) => { const ab = c.kit && c.kit[slot]; if (ab && (ab.overWalls || ab.ignoresWalls)) return true; return !!(CROSSES[c.champ] && CROSSES[c.champ][slot]); };
  function lineFree(x, y, dx, dy, len, w, col, alpha) {
    const X = sx(x), Y = sy(y), EX = sx(x + dx * len), EY = sy(y + dy * len), px = -(EY - Y), py = EX - X, l = Math.hypot(px, py) || 1, hw = w / 2 * Z, nx = px / l * hw, ny = py / l * hw, ux = (EX - X) / l, uy = (EY - Y) / l;
    ctx.fillStyle = rgba(col, alpha * .14); ctx.beginPath(); ctx.moveTo(X + nx, Y + ny); ctx.lineTo(EX + nx, EY + ny); ctx.lineTo(EX - nx, EY - ny); ctx.lineTo(X - nx, Y - ny); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgba(col, alpha + .1); ctx.lineWidth = 1.8; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.moveTo(X + nx, Y + ny); ctx.lineTo(EX + nx, EY + ny); ctx.moveTo(X - nx, Y - ny); ctx.lineTo(EX - nx, EY - ny); ctx.stroke(); ctx.setLineDash(NODASH);
    chevrons(X, Y, ux, uy, l, hw, col, alpha);
  }
  function ownAim(a) {
    const A = Ctl.aim, me = G.me, ab = me.kit && me.kit[A.slot]; if (!ab) return;
    const ad = aimDir() || { dx: me.fx, dy: me.fy, target: null };
    const drag = Math.hypot(A.dx, A.dy), cancel = !!A.cancelHot || (A.moved && drag < 16), p0 = posNow(me, a), p = { x: p0.x, y: p0.y }, pal = palT(me.team);
    const col = cancel ? '255,108,88' : pal.aim, alpha = cancel ? .6 : 1;
    const dx = ad.dx, dy = ad.dy;
    rangeRing(p.x, p.y, ab.range || ab.r || 0, col, .25);
    if (!A.moved && ad.target) {
      const t = ad.target, q = posNow(t, a), X = sx(q.x), Y = sy(q.y), R = (artR(t) + 10 + Math.sin(G.t * 9) * 4) * Z, Ry = R * TILT, rot = G.t * 3;
      ctx.lineCap = 'round';
      for (let pass = 0; pass < 2; pass++) { ctx.strokeStyle = pass ? rgba(col, 1) : INK_A(.9); ctx.lineWidth = pass ? 2 : 3.8; ctx.beginPath(); for (let i = 0; i < 4; i++) { const a0 = rot + i * TAU / 4, a1 = a0 + .9; ctx.moveTo(X + Math.cos(a0) * R, Y + Math.sin(a0) * Ry); ctx.ellipse(X, Y, R, Ry, 0, a0, a1); } ctx.stroke(); }
    }
    if (ab.shape === 'line' || ab.shape === 'dash') {
      let len = ab.range || 400; if (ab.charge && me.charge) { const f = Math.min(1, me.charge.t / ab.charge), mn = ab.minRange || 0; len = mn + ((ab.range || 700) - mn) * f; }
      if (crossesWalls(me, A.slot)) {
        // a blink or leap ignores walls, so its line is shown at full length
        lineFree(p.x, p.y, dx, dy, len, ab.w || 40, col, alpha);
      } else lineShape(p.x, p.y, dx, dy, len, ab.w || 40, col, alpha, undefined, true, false);
    } else if (ab.shape === 'circle') {
      // A ground-targeted circle lands at the last point its caster can see, unless it can cross walls.
      let tx = ad.tx === undefined ? p.x + dx * (ab.range || 0) * .7 : ad.tx, ty = ad.ty === undefined ? p.y + dy * (ab.range || 0) * .7 : ad.ty;
      if (!crossesWalls(me, A.slot)) { const wd = Math.hypot(tx - p.x, ty - p.y); if (wd > 1) { const ux = (tx - p.x) / wd, uy = (ty - p.y) / wd, wl = reach(p.x, p.y, ux, uy, wd); if (wl < wd - 1) { tx = p.x + ux * wl; ty = p.y + uy * wl; } } }
      circleShape(tx, ty, ab.r || 80, col, alpha, undefined, false);
    } else if (ab.shape === 'cone') {
      const an = Math.atan2(dy, dx), R = (ab.range || 300) * Z;
      ctx.save(); ctx.translate(sx(p.x), sy(p.y)); ctx.scale(1, TILT); ctx.lineJoin = 'round';
      const path = () => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, an - .76, an + .76); ctx.closePath(); };
      ctx.fillStyle = rgba(col, .16); path(); ctx.fill();
      ctx.strokeStyle = rgba(col, 1); ctx.lineWidth = 1.8; path(); ctx.stroke(); ctx.restore();
    }
  }

  function towerWarning(a) {
    const w = G.tAim; if (!w) return;
    const t = unitById(w.id), me = G.me;
    if (!t || !isUp(t) || !isUp(me) || Math.hypot(t.x - me.x, t.y - me.y) > (t.range || 400) + 40) { G.tAim = null; return; }
    const q = posNow(me, a), H = t.sub === 'core' ? 150 : 104, x0 = sx(t.x), y0 = sy(t.y) - H * Z, x1 = sx(q.x), y1 = sy(q.y) - 22 * Z, pulse = .55 + Math.sin(G.t * 18) * .45;
    ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    ctx.strokeStyle = INK_A(.75); ctx.lineWidth = 8 * Z; ctx.stroke();
    ctx.strokeStyle = rgba(ENEMY, .65 + pulse * .35); ctx.lineWidth = 4.2 * Z; ctx.stroke(); ctx.lineCap = 'round';
  }

  // ---------- takedown card: two badges either side of one clean diagonal cut ----------
  let panelC = null;
  const PW = 380, PH = 92;
  function buildPanel(killer, victim, died, side) {
    if (!panelC) panelC = Art.cv(PW * 2, PH * 2);
    const g = panelC.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, PW * 2, PH * 2); g.scale(2, 2); g.lineJoin = 'miter';
    const plate = () => { g.beginPath(); g.moveTo(26, 8); g.lineTo(PW - 8, 8); g.lineTo(PW - 26, PH - 8); g.lineTo(8, PH - 8); g.closePath(); };
    plate(); g.fillStyle = '#0a0d14'; g.fill();
    g.save(); plate(); g.clip();
    g.fillStyle = side ? '#1c1216' : '#121f36'; g.beginPath(); g.moveTo(0, 0); g.lineTo(PW * .54, 0); g.lineTo(PW * .46, PH); g.lineTo(0, PH); g.closePath(); g.fill();
    g.restore();
    plate(); g.strokeStyle = 'rgba(150,164,184,.6)'; g.lineWidth = 1.2; g.stroke();
    const acc = died ? '#ff4a5a' : side ? '#ff4a5a' : '#f0dfb0'; g.strokeStyle = acc; g.lineWidth = 2; g.beginPath(); g.moveTo(PW * .56, 2); g.lineTo(PW * .44, PH - 2); g.stroke();
    const coin = (spr, x) => { const r = 34, w = spr.S * r / spr.R; g.drawImage(spr.c, x - w / 2, PH / 2 - w / 2, w, w); };
    if (killer) coin(killer, 76);
    if (victim) coin(Art.koCoin(victim), PW - 76);
  }
    // Only for your own kill or your own death, under 0.4 s, high above the fight.
  function killSplash(e, u, by, died) {
    const t = G.t; if (t - lastKill < .5) return; lastKill = t;
    const kSpr = by ? (by.kind === 'tower' ? towerSp(by.team === 1 ? 1 : 0) : spriteOf(by)) : null, vSpr = u ? spriteOf(u) : null;
    buildPanel(kSpr, vSpr, died, by ? by.team : 2);
    panel = { t: 0, life: .38 };
    if (died) hitStop(.05); else { hitStop(.05); slowMo(.22, .45); }
  }
  function drawPanel() {
    if (!panel) return;
    const a = panel.t / panel.life;
    if (a >= 1) { panel = null; return; }
    const inn = Math.min(1, a / .3), out = a > .74 ? (a - .74) / .26 : 0, base = Math.min(.46, VW / 1200), k = base, w = PW * k, h = PH * k, x = VW / 2 + (1 - outExpo(inn)) * -60 + outCub(out) * 60, y = Math.max(86, VH * .22);
    ctx.globalAlpha = Math.min(1, inn * 2) * (1 - outCub(out)); ctx.drawImage(panelC, x - w / 2, y - h / 2, w, h); ctx.globalAlpha = 1;
  }

  // ---------- floating numbers and flying coins, drawn over the lighting ----------
  const FONT_AT = [], GOLD_FALLBACK = { x: 64, y: 58 }, NUMS = new Map();
  function numSprite(str, col, big) {
    const ready = !document.fonts || document.fonts.status === 'loaded' ? 1 : 0, id = str + col + (big ? 'B' : 's') + ready; let n = NUMS.get(id); if (n) return n;
    if (NUMS.size > 180) NUMS.clear();
    const fs = big ? 24 : 18, S = Math.ceil(dpr * 1.5), font = '700 ' + fs + 'px "Barlow Semi Condensed",sans-serif', m = Art.cv(2, 2).getContext('2d'); m.font = font;
    const w = Math.ceil(m.measureText(str).width) + 8, h = fs + 8, c = Art.cv(w * S, h * S), g = c.getContext('2d');
    g.scale(S, S); g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineWidth = 4; g.strokeStyle = INK; g.strokeText(str, w / 2, h / 2); g.fillStyle = col; g.fillText(str, w / 2, h / 2);
    NUMS.set(id, n = { c, w, h, fs }); return n;
  }
  function textLayer(dt) {
    // flashes and speed lines behind the numbers
    for (let i = OV.length - 1; i >= 0; i--) { if ((OV[i].t += dt) >= OV[i].life) OV.splice(i, 1); }
    drawCine(dt);
    for (const o of OV) {
      const X = sx(o.x), Y = sy(o.y) - o.z * Z, a = o.t / o.life;
      if (o.kind === 4) { const r = o.r * Z * (a < .3 ? outBack(a / .3) * .9 : .9 + (a - .3) * .24), tilt = o.rot % .3 - .15, c = Math.cos(tilt) * r, sn = Math.sin(tilt) * r; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a > .55 ? (1 - a) / .45 : 1; ctx.setTransform(dpr * c, dpr * sn, -dpr * sn, dpr * c, dpr * X, dpr * Y); ctx.drawImage(o.spr, -1, -1, 2, 2); resetT(); ctx.globalCompositeOperation = 'source-over'; }
      else if (o.kind === 0) { const r = o.r * Z * (.55 + outBack(Math.min(1, a * 1.6)) * .6), c = Math.cos(o.rot) * r, sn = Math.sin(o.rot) * r; ctx.globalAlpha = a > .55 ? (1 - a) / .45 : 1; ctx.setTransform(dpr * c, dpr * sn, -dpr * sn, dpr * c, dpr * X, dpr * Y); ctx.drawImage(o.spr, -1, -1, 2, 2); resetT(); }
      else if (o.kind === 3) {
        const r = o.r * Z * (1 + outExpo(a) * .34), d = 12 * Z * (1 - a * .6), al = 1 - a * a, c = Math.SQRT1_2;
        ctx.globalAlpha = al; ctx.lineCap = 'round';
        for (let pass = 0; pass < 2; pass++) {
          ctx.strokeStyle = pass ? o.col : INK; ctx.lineWidth = pass ? 2 : 3.8; ctx.beginPath();
          for (let i = 0; i < 4; i++) { const sxx = i < 2 ? -1 : 1, syy = i % 2 ? -1 : 1, x0 = X + sxx * r * c, y0 = Y + syy * r * c * .82; ctx.moveTo(x0, y0); ctx.lineTo(x0 + sxx * d * c, y0 + syy * d * c * .82); }
          ctx.stroke();
        }
      }
      else {
        const r = o.r * Z * (.8 + outExpo(a) * .5), jit = (G.t * 30 | 0) % 7 * .9, c = Math.cos(o.rot + jit), sn = Math.sin(o.rot + jit);
        ctx.setTransform(dpr * c * r, dpr * sn * r, -dpr * sn * r, dpr * c * r, dpr * X, dpr * Y);
        ctx.globalAlpha = (1 - a) * .5; if (o.ink) ctx.drawImage(o.ink, -1.03, -1.03, 2.06, 2.06);
        ctx.globalAlpha = (1 - a) * .85; ctx.drawImage(o.spr, -1, -1, 2, 2); resetT();
      }
    }
    ctx.globalAlpha = 1;
    const list = G.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (let i = list.length - 1; i >= 0; i--) if ((list[i].t -= dt) <= 0) list.splice(i, 1);
    for (const t of list) {
      const f = t.t / t.max, age = 1 - f, grow = age < .12 ? .55 + outBack(age / .12) * .75 : age < .26 ? 1.3 - ((age - .12) / .14) * .3 : 1, size = (t.big ? 19 : 13.5) * grow;
      const X = sx(t.x), Y = sy(t.y) - (t.z + (1 - f * f) * 52) * Z;
      if (X < -60 || X > VW + 60) continue;
      // Each string is drawn once and reused: a stroked line of text is by far the slowest thing a frame could ask for.
      const spr = numSprite(t.s, t.col, !!t.big), w = spr.w * size / spr.fs, h = spr.h * size / spr.fs; ctx.globalAlpha = Math.min(1, f * 3.4); ctx.drawImage(spr.c, X - w / 2, Y - h / 2, w, h);
    }
    ctx.globalAlpha = 1;
    if (panel) { panel.t += dt; drawPanel(); }
    const sp = coinSp(), A = G.goldAnchor || GOLD_FALLBACK;
    for (const f of flyers) {
      if (f.t < 0) continue;
      // A coin hops out, hangs for a beat, then is pulled to the counter.
      const k = clamp01(f.t / f.dur), e = k < .3 ? outCub(k / .3) * .12 : .12 + .88 * Math.pow((k - .3) / .7, 2.6), up = Math.sin(Math.min(1, k * 1.3) * Math.PI), X = lerp(f.x0, A.x, e) + f.mx * up, Y = lerp(f.y0, A.y, e) + f.my * up, r = 10 * (1 - k * .4), c = Math.max(.18, Math.abs(Math.cos(f.ph)));
      ctx.drawImage(sp.c, X - r * c * 1.2, Y - r * 1.2, r * c * 2.4, r * 2.4);
    }
    for (let i = arrive.length - 1; i >= 0; i--) {
      arrive[i] += dt; const a = arrive[i] / .22; if (a >= 1) { arrive[i] = arrive[arrive.length - 1]; arrive.pop(); continue; }
      const r = 7 + outCub(a) * 18; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1 - a; ctx.drawImage(Art.glint('#ffe69a'), A.x - r, A.y - r, r * 2, r * 2); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    drawReady(dt);
  }

  // ability-ready glints on the button rims (the button itself is drawn after this, so they sit on its edge)
  function drawReady(dt) {
    for (let i = readyFx.length - 1; i >= 0; i--) if ((readyFx[i].t += dt) >= .62) readyFx.splice(i, 1);
    if (!readyFx.length || typeof Hud === 'undefined' || !Hud.ui || !Hud.ui.ab) return;
    const pal = palT(G.me.team), sp = Art.glint(pal.mid);
    for (const f of readyFx) {
      const B = Hud.ui.ab[f.i]; if (!B) continue;
      const a = f.t / .62, r0 = B.r + 2, n = quality >= 1 ? 7 : 4;
      for (let k = 0; k < n; k++) { const an = k / n * TAU + a * 2.2, d = r0 + outCub(a) * 18, s = (k % 2 ? 7 : 12) * (a < .2 ? outBack(a / .2) : 1 - (a - .2) / .8 * .9); if (s <= .5) continue; ctx.drawImage(sp, B.x + Math.cos(an) * d - s, B.y + Math.sin(an) * d - s, s * 2, s * 2); }
    }
  }

  // Work out which side an area blast belongs to, since the event carries only its position and kind.
  function teamOfBoom(e) {
    const z = zoneTeam.get(e.x + '|' + e.y); if (z !== undefined) return z;
    const kits = BOOM_KIT[e.fx]; let best = null, bd = 1e12;
    for (const c of G.s.champs) { if (!c.alive || (kits && !kits.includes(c.champ))) continue; const d = Math.hypot(c.x - e.x, c.y - e.y); if (d < bd) { bd = d; best = c; } }
    return best && bd < (e.r || 100) + 420 ? best.team : 2;
  }
  function teamOfPhit(e) {
    let best = null, bd = 1e12;
    for (const t of trails.values()) { if (t.fx !== e.fx || G.t - t.at > .4) continue; const d = Math.hypot(t.lx - e.x, t.ly - e.y); if (d < bd) { bd = d; best = t; } }
    if (best) return best.team;
    const kits = PHIT_KIT[e.fx]; let c0 = null; bd = 1e12;
    for (const c of G.s.champs) { if (!c.alive || (kits && !kits.includes(c.champ))) continue; const d = Math.hypot(c.x - e.x, c.y - e.y); if (d < bd) { bd = d; c0 = c; } }
    return c0 ? c0.team : 2;
  }

  // ---------- moments ----------
  function towerFall(x, y, team, core, near) {
    for (const f of falls) if (f.x === x && f.y === y) return;
    const H = core ? 150 : 104;
    falls.push({ x, y, team, core, t: 0, n: core ? 18 : 12, i: 0, H, boom: false });
    wave(x, y, core ? 820 : 560, GOLD, .7); wave(x, y, core ? 460 : 320, '#ffd9a0', .45); dustRing(x, y, core ? 220 : 160, 10);
    ring(x, y, core ? 300 : 210, '#ffffff', .34, 14); ring(x, y, core ? 170 : 120, GOLD, .26, 28);
    overlay(0, x, y, H * .55, .16, { spr: Art.impact(NEUT.imp, NEUT.imp2, 2), r: core ? 130 : 90 });
    if (quality >= 1) overlay(2, x, y, H * .5, .3, { spr: Art.speedLines('#ffe0b0', 2), r: core ? 420 : 300, ink: null });
    spark(x, y, core ? 14 : 9, GOLD, 420, .5, 16, H * .5);
    const cr = Terrain.towerCrown(team, core), p = add(SHARD, x, y, H, 1.2); p.spr = cr.c; p.size = cr.w / cr.c.width; p.vz = 540; p.vx = rnd(-110, 110); p.vy = rnd(-40, 40); p.vr = rnd(-6, 6); p.bounce = 1;
    if (near) { hitStop(.07); slowMo(.34, .5); cine(core ? 1.1 : .7, core ? 1 : .7); G.shake = Math.max(G.shake, core ? 11 : 8); G.punch = Math.max(G.punch, core ? .07 : .05); }
  }
  function finale(won, x, y) { if (won) { const pal = palT(G.me.team); burst(x, y, 90, pal, 2, true); ring(x, y, 420, pal.ring, .9); } }

  // ---------- simulation events ----------
  // Rule of the house: your own actions and what happens to you get the show. Everyone else's routine is nearly silent.
  function ownBlast(e, team) {
    const me = G.me, kits = BOOM_KIT[e.fx]; if (team !== me.team || !kits || !kits.includes(me.champ)) return false;
    const d = Math.hypot(me.x - e.x, me.y - e.y);
    for (const c of G.s.champs) if (c !== me && c.team === me.team && isUp(c) && kits.includes(c.champ) && Math.hypot(c.x - e.x, c.y - e.y) < d) return false;
    return d < (e.r || 100) + 900;
  }
  // ---------- ability recipes ----------
  // Every kit reads differently: a recipe per ability for cast, area blast and projectile hit.
  const muzzle = (u, dx, dy, pal, r) => { flash(u.x + dx * 34, u.y + dy * 34, 22, pal, r); };
  const pose = (d, a, back, lunge, lift, yaw, sq) => ({ d, a, back, lunge, lift, yaw, sq });
  // How a cast moves the coin: anticipation (a), a fast snap (back, then lunge), and a settle.
  const POSES = {
    snipe: pose(.22, .18, -5, -15, 2, .22, .55), snipeFull: pose(.3, .16, -7, -24, 2, .3, .7), deadeye: pose(.46, .3, -4, -38, 8, .5, .9),
    orb: pose(.28, .22, 8, -4, 12, TAU * .5, .45), rupture: pose(.32, .32, 4, 8, 16, .3, .6), ray: pose(.26, .24, 8, -6, 8, .3, .4), dome: pose(.3, .34, 0, 0, 16, .4, .6), heal: pose(.5, .4, 0, 0, 34, TAU * .5, .9),
    slash: pose(.22, .16, 6, 16, 4, -.9, .55), blink: pose(.24, .12, 0, 0, 0, TAU * .5, .4), dash: pose(.22, .1, 8, 18, 2, .5, .8), parry: pose(.28, .18, -2, 0, 2, .5, .9), crash: pose(.3, .16, 0, 0, 22, .3, .9), stomp: pose(.34, .4, 0, 0, 30, 0, 1.1), chain: pose(.26, .22, 7, -14, 4, .4, .55),
    tripwire: pose(.26, .32, 6, 6, 4, .3, .4), ricochet: pose(.2, .16, -4, -12, 2, .25, .5), lockdown: pose(.42, .36, 0, 0, 20, TAU * .5, .7),
    flourish: pose(.22, .12, 5, 16, 2, .8, .5), feint: pose(.22, .1, 0, 16, 0, .9, .35), salute: pose(.44, .4, -4, 10, 4, .7, .75),
    hexbolt: pose(.26, .24, 8, -8, 12, .5, .4), polymorph: pose(.28, .28, 10, -6, 10, TAU * .5, .4), coven: pose(.48, .4, 0, 0, 30, TAU, .8),
    miasma: pose(.3, .34, 4, 2, 10, .3, .4), leech: pose(.3, .3, 6, -8, 2, .3, .4), quarantine: pose(.44, .4, 0, 0, 22, .3, .7),
    shank: pose(.2, .1, 6, 22, 2, .7, .6), vanish: pose(.26, .2, 0, 0, 6, TAU * .5, .3), cuts: pose(.4, .2, 0, 0, 12, TAU, .6),
    wrecking: pose(.32, .3, 0, 0, 6, TAU * .5, .8), grab: pose(.3, .22, 10, 22, 2, .3, .8), demolish: pose(.5, .44, 0, 0, 44, 0, 1.3),
  };
  const DEF_POSE = pose(.22, .2, 4, 6, 4, .3, .4);
  function poseStart(v, fx, dx, dy, u) { const P_ = POSES[fx] || DEF_POSE; if (u.kind !== 'champ') return; v.pose = P_; v.poseT = 0; v.poseDx = dx; v.poseDy = dy; v.oyawD = P_.yaw; }
  function poseTick(v, dt) {
    const P_ = v.pose; if (!P_) { v.ox = v.oy = v.oz = v.osq = v.oyaw = 0; return; }
    v.poseT += dt;
    const t = v.poseT / P_.d; if (t >= 1) { v.pose = null; v.ox = v.oy = v.oz = v.osq = v.oyaw = 0; return; }
    let off, oz, sq, yaw;
    if (t < P_.a) { const f = t / P_.a; off = -P_.back * f * (2 - f); oz = P_.lift * .1 * f; sq = -.28 * f; yaw = -P_.yaw * .18 * f; }
    else {
      const g = (t - P_.a) / (1 - P_.a), snap = Math.min(1, g * 3.2), set = Math.max(0, (g - .3) / .7);
      off = -P_.back + (P_.back + P_.lunge) * outExpo(snap); off *= 1 - set * set * (3 - 2 * set);
      oz = P_.lift * Math.sin(Math.min(1, g * 1.15) * Math.PI);
      sq = P_.sq * (1 - Math.min(1, g * 1.6));
      yaw = P_.yaw * outExpo(g);
      if (Math.abs(P_.yaw) > 1.5) yaw = P_.yaw * g; // spins finish their turn
    }
    v.ox = v.poseDx * off; v.oy = v.poseDy * off; v.oz = oz; v.osq = sq; v.oyaw = yaw;
  }
  const lineAlong = (u, dx, dy, L, col, w, life) => beam(u.x + dx * 22, u.y + dy * 22, u.x + dx * L, u.y + dy * L, col, w, life, 22);
  // Each cast is one signature gesture. Heroes are bright metal and light; villains are toxic, ragged and red.
  const CASTFX = {
    snipe(u, dx, dy, p, own, k) { muzzle(u, dx, dy, p, 30 * k); if (own) lineAlong(u, dx, dy, 110, p.mid, 7, .1); },
    snipeFull(u, dx, dy, p, own, k) { muzzle(u, dx, dy, p, 44 * k); lineAlong(u, dx, dy, 170, p.mid, 11, .13); ring(u.x, u.y, 80, p.ring, .22); if (own) { G.shake = Math.max(G.shake, 3); G.punch = Math.max(G.punch, .014); } },
    deadeye(u, dx, dy, p, own) { ring(u.x, u.y, 120, p.ring, .36, 18); overlay(2, u.x, u.y, 20, .3, { spr: Art.speedLines(p.lines, 2), r: 240, ink: null }); if (own) { G.shake = Math.max(G.shake, 5); G.punch = Math.max(G.punch, .036); hitStop(.04); } lineAlong(u, dx, dy, 280, p.mid, 16, .22); burst(u.x + dx * 40, u.y + dy * 40, 24, p, 1.1, true); },
    orb(u, dx, dy, p, own, k) { sigil('mark', u.x, u.y, 58 * k + 18, p.mid, .3, 5); ring(u.x, u.y, 60, p.ring, .2, 14); spark(u.x, u.y, own ? 4 : 2, p.spark, 160, .26, 9, 24); },
    rupture(u, dx, dy, p, own, k) { ring(u.x, u.y, 52, p.ring, .18, 12); spark(u.x, u.y, own ? 3 : 2, p.spark, 200, .24, 10, 18); },
    ray(u, dx, dy, p, own, k) { muzzle(u, dx, dy, p, 28 * k); lineAlong(u, dx, dy, 90, p.mid, 8, .12); rise(u.x, u.y, own ? 5 : 2, HEAL, 26, .5, 9); },
    dome(u, dx, dy, p, own) { ring(u.x, u.y, 100, p.ring, .3); rise(u.x, u.y, own ? 6 : 3, p.mid, 30, .5, 9); },
    heal(u, dx, dy, p, own, k) { ring(u.x, u.y, 340, p.ring, .5); pillar(u.x, u.y, p.out, p.mid, .7); rise(u.x, u.y, nq(16), HEAL, 170, 1, 14); if (own) { G.punch = Math.max(G.punch, .03); G.shake = Math.max(G.shake, 3); } },
    slash(u, dx, dy, p, own, k) { slash(u.x, u.y, dx, dy, 170, own ? p.mid : '#ff6a4a', .2); slash(u.x, u.y, dx, dy, 120, p.core, .13); if (own) G.shake = Math.max(G.shake, 1.8); },
    blink(u, dx, dy, p, own) { burstOut(u, p, own); },
    dash(u, dx, dy, p, own, k) { const dark = u.champ === 'vesper' || u.champ === 'sable'; if (u.champ === 'gravel') { chips(u.x, u.y, own ? 6 : 3, '#c6a78a', 260); dustRing(u.x, u.y, 70, 4); lineAlong(u, dx, dy, 160, p.out, 22, .18); if (own) G.shake = Math.max(G.shake, 4); return; } puff(u.x, u.y, own ? 6 : 3, dark ? 1 : 0, 26, .36, 12, 50); if (u.champ === 'kade') slash(u.x, u.y, dx, dy, 120, p.mid, .16); overlay(2, u.x, u.y, 18, .18, { spr: Art.speedLines(p.lines, 1), r: 170, ink: null }); if (own) G.shake = Math.max(G.shake, 1.6); },
    parry(u, dx, dy, p, own) { ring(u.x, u.y, 80, p.core, .2, 18); sigil('dome', u.x, u.y, 56, p.mid, .36, 4, 14); if (own) G.punch = Math.max(G.punch, .012); },
    crash(u, dx, dy, p, own) { pillar(u.x, u.y, p.out, p.mid, .4); ring(u.x, u.y, 120, p.ring, .3); if (own) G.punch = Math.max(G.punch, .02); },
    stomp(u, dx, dy, p, own) { sigil('stomp', u.x, u.y, 170, p.mid, .36, 0); ring(u.x, u.y, 150, p.ring, .36); dustRing(u.x, u.y, 90, 5); if (own) G.shake = Math.max(G.shake, 3); },
    chain(u, dx, dy, p, own, k) { muzzle(u, dx, dy, p, 26 * k); spark(u.x + dx * 30, u.y + dy * 30, own ? 4 : 2, '#d8d2c2', 200, .22, 9, 24); },
    // ---- villains
    tripwire(u, dx, dy, p, own) { spark(u.x, u.y, own ? 3 : 2, '#c8ef5a', 160, .22, 9, 18); },
    ricochet(u, dx, dy, p, own, k) { muzzle(u, dx, dy, p, 26 * k); lineAlong(u, dx, dy, 90, '#c8ef5a', 6, .1); },
    lockdown(u, dx, dy, p, own) { ring(u.x, u.y, 100, p.ring, .34, 18); overlay(2, u.x, u.y, 20, .24, { spr: Art.speedLines('#ff3a20', 2), r: 200, ink: null }); arcs(u.x, u.y, 28, u.x + dx * 110, u.y + dy * 110, 28, '#ff3a20', .16); if (own) { G.punch = Math.max(G.punch, .024); G.shake = Math.max(G.shake, 3); } },
    flourish(u, dx, dy, p, own, k, v) { const now = G.t, n = v.floT && now - v.floT < 2.4 ? ((v.floN || 0) + 1) % 3 : 0; v.floT = now; v.floN = n; const an = Math.atan2(dy, dx); if (n === 0) { slash(u.x, u.y, dx, dy, 180, p.mid, .2); cut(u.x + dx * 80, u.y + dy * 80, an + 1.2, 90, p.core, .16); } else if (n === 1) { slash(u.x, u.y, dx, dy, 200, p.spark2, .2); cut(u.x + dx * 80, u.y + dy * 80, an - 1.2, 96, '#ffffff', .16); } else { slash(u.x, u.y, dx, dy, 230, p.mid, .24); cut(u.x + dx * 90, u.y + dy * 90, an, 150, p.core, .22); burst(u.x + dx * 90, u.y + dy * 90, 24, p, .8, true); spark(u.x, u.y, 8, p.spark, 300, .34, 14, 30); if (own) { G.shake = Math.max(G.shake, 3.5); G.punch = Math.max(G.punch, .018); } } },
    feint(u, dx, dy, p, own) { puff(u.x, u.y, 5, 1, 28, .34, 18, 50); ring(u.x, u.y, 56, p.ring, .2); if (own) overlay(2, u.x, u.y, 18, .16, { spr: Art.speedLines(p.lines, 3), r: 140, ink: null }); },
    salute(u, dx, dy, p, own) { cut(u.x + dx * 30, u.y + dy * 30, Math.atan2(dy, dx) + Math.PI / 2, 100, p.core, .2, 28); burst(u.x, u.y, 28, p, .7, false); if (own) { G.punch = Math.max(G.punch, .02); hitStop(.03); } },
    hexbolt(u, dx, dy, p, own, k) { sigil('hex', u.x, u.y, 48, '#c8ef5a', .24, 6, 14); muzzle(u, dx, dy, p, 22 * k); },
    polymorph(u, dx, dy, p, own, k) { sigil('hex', u.x, u.y, 56, '#ffd78a', .28, -6, 14); coins(u.x + dx * 26, u.y + dy * 26, own ? 2 : 1, { sp: 90, vz: 240, life: .5 }); },
    coven(u, dx, dy, p, own) { pillar(u.x, u.y, '#2a5a10', '#c8ef5a', .55); sigil('coven', u.x, u.y, 80, '#c8ef5a', .4, -3, 14); if (own) G.punch = Math.max(G.punch, .02); },
    miasma(u, dx, dy, p, own) { spark(u.x, u.y, own ? 3 : 2, '#b6ec3a', 120, .3, 9, 20); },
    leech(u, dx, dy, p, own) { spark(u.x, u.y, own ? 3 : 2, '#ff5a44', 180, .22, 9, 20); },
    quarantine(u, dx, dy, p, own) { ring(u.x, u.y, 100, p.ring, .3, 16); },
    shank(u, dx, dy, p, own, k) { const an = Math.atan2(dy, dx); cut(u.x + dx * 40, u.y + dy * 40, an, 130, p.mid, .2); lineAlong(u, dx, dy, 140, p.out, 8, .18); if (own) { dust(u.x, u.y, 1.2); G.shake = Math.max(G.shake, 2); } },
    vanish(u, dx, dy, p, own) { puff(u.x, u.y, 6, 1, 34, .42, 18, 80); sigil('mark', u.x, u.y, 70, p.mid, .3, 6, 12); },
    cuts(u, dx, dy, p, own) { burst(u.x, u.y, 18, p, .7, false); },
    wrecking(u, dx, dy, p, own) { ring(u.x, u.y, 170, p.ring, .26); dustRing(u.x, u.y, 70, 3); if (own) G.punch = Math.max(G.punch, .012); },
    grab(u, dx, dy, p, own) { const an = Math.atan2(dy, dx); slash(u.x, u.y, dx, dy, 190, p.mid, .22); for (const s of [-.55, 0, .55]) cut(u.x + Math.cos(an + s) * 150, u.y + Math.sin(an + s) * 150, an + s, 60, p.spark2, .2); if (own) G.shake = Math.max(G.shake, 2.5); },
    demolish(u, dx, dy, p, own) { dustRing(u.x, u.y, 110, 5); if (own) G.punch = Math.max(G.punch, .022); chips(u.x, u.y, 6, '#c8a080', 240); },
  };
  function burstOut(u, p, own) { const X = u.x, Y = u.y; ring(X, Y, 90, p.ring, .26); puff(X, Y, own ? 6 : 3, 1, 28, .32, 14, 80); sigil('mark', X, Y, 70, p.mid, .26, -6); cut(X, Y, -Math.PI / 2, 80, p.core, .16, 26); if (own) overlay(2, X, Y, 22, .18, { spr: Art.speedLines(p.lines, 3), r: 120, ink: null }); }
  const shakeIf = (own, s, k) => { if (own) { G.shake = Math.max(G.shake, s); G.punch = Math.max(G.punch, k); } };
  const BOOM = {
    rupture(e, t, p, own) { sigil('rupture', e.x, e.y, e.r, p.mid, .36, 1.4); ring(e.x, e.y, e.r, p.ring, .34); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + rnd(-.2, .2), d = e.r * rnd(.3, .9); beam(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d * .9, e.x + Math.cos(a) * d, e.y + Math.sin(a) * d * .9, p.mid, 8, .26, 60); } spark(e.x, e.y, 10, p.spark, e.r * 2.2, .42, 16, 16); shakeIf(own, 2.5, .012); },
    break(e, t, p) { flash(e.x, e.y, 20, p, 60); spark(e.x, e.y, 8, p.spark, 300, .3, 14, 22); sigil('mark', e.x, e.y, 70, p.core, .3, 8); },
    crash(e, t, p, own, huge) { sigil('crash', e.x, e.y, e.r, p.mid, .5, 0, 2); ring(e.x, e.y, e.r * 1.1, p.ring, .4); ring(e.x, e.y, e.r * .6, p.core, .24, 8); dustRing(e.x, e.y, e.r * .7, 7); chips(e.x, e.y, 8, p.chip, e.r * 2.4, 24); spark(e.x, e.y, 12, p.spark, e.r * 2.4, .4, 16, 24); burst(e.x, e.y, 22, p, 1.1, true); shakeIf(own, 7, .04); },
    stomp(e, t, p, own) { sigil('stomp', e.x, e.y, e.r, p.mid, .4, 0); dustRing(e.x, e.y, e.r * .7, 5); chips(e.x, e.y, 5, p.chip, e.r * 2, 16); shakeIf(own, 4, .02); },
    heal(e, t, p, own) { sigil('heal', e.x, e.y, e.r, p.mid, .6, .6); ring(e.x, e.y, e.r, p.ring, .6); rise(e.x, e.y, 14, HEAL, e.r * .8, 1, 14); shakeIf(own, 3, .02); },
    tripwire(e, t, p) { sigil('root', e.x, e.y, 70, '#c8ef5a', .32, 0); spark(e.x, e.y, 8, '#c8ef5a', 240, .32, 12, 14); arcs(e.x - 40, e.y, 16, e.x + 40, e.y, 16, '#c8ef5a', .18); },
    feint(e, t, p) { puff(e.x, e.y, 8, 1, 32, .4, 20, 100); ring(e.x, e.y, e.r, p.ring, .3); spark(e.x, e.y, 6, p.spark2, 240, .3, 12, 22); },
    coven(e, t, p, own) { ring(e.x, e.y, e.r * .4, '#c8ef5a', .22, 20); sigil('coven', e.x, e.y, e.r, '#c8ef5a', .4, -9); burst(e.x, e.y, 20, p, 1.5, true); spark(e.x, e.y, 16, '#c8ef5a', e.r * 2.2, .5, 16, 24); pillar(e.x, e.y, '#2a5a10', '#c8ef5a', .6); shakeIf(own, 7, .04); },
    demolish(e, t, p, own) { const x1 = e.x2 === undefined ? e.x : e.x2, y1 = e.y2 === undefined ? e.y : e.y2, x0 = e.x, y0 = e.y; for (let i = 0; i <= 7; i++) { const f = i / 7, X = lerp(x0, x1, f), Y = lerp(y0, y1, f); dustRing(X, Y, 60, 2); chips(X, Y, 3, '#c8a080', 340, 22); spark(X, Y, 2, p.spark, 220, .3, 12, 16); } beam(x0, y0, x1, y1, p.mid, 26, .3, 4); arcs(x0, y0, 10, x1, y1, 10, p.spark2, .24, 26); shakeIf(own, 8, .045); },
  };
  const PHIT = {
    snipeFull(e, t, p, own) { flash(e.x, e.y, 22, p, 54); ring(e.x, e.y, 84, p.ring, .22, 16); spark(e.x, e.y, own ? 7 : 3, p.spark, 340, .26, 14, 22); },
    deadeye(e, t, p, own) { burst(e.x, e.y, 22, p, 1.3, true); ring(e.x, e.y, 150, p.ring, .34, 14); spark(e.x, e.y, 14, p.spark, 460, .32, 18, 24); shakeIf(own, 6, .03); },
    orb(e, t, p) { sigil('mark', e.x, e.y, 66, p.mid, .3, 6, 16); spark(e.x, e.y, 5, p.spark, 240, .26, 12, 22); },
    ray(e, t, p) { rise(e.x, e.y, 4, HEAL, 30, .5, 10); flash(e.x, e.y, 22, p, 34); },
    chain(e, t, p) { chips(e.x, e.y, 3, '#d8d2c2', 220); spark(e.x, e.y, 3, p.spark, 240, .22, 10, 22); },
    dome(e, t, p) { sigil('dome', e.x, e.y, 54, p.mid, .3, 4, 22); flash(e.x, e.y, 26, p, 40); },
    ricochet(e, t, p) { arcs(e.x, e.y, 22, e.x + rnd(-60, 60), e.y + rnd(-40, 40), 26, '#c8ef5a', .12); spark(e.x, e.y, 5, '#c8ef5a', 280, .24, 11, 22); },
    hexbolt(e, t, p) { sigil('hex', e.x, e.y, 60, '#c8ef5a', .3, 3, 14); spark(e.x, e.y, 5, '#c8ef5a', 220, .28, 11, 20); },
    polymorph(e, t, p) { sigil('hex', e.x, e.y, 70, '#ffd78a', .34, 2, 12); coins(e.x, e.y, 5, { sp: 180, vz: 360 }); },
    lockdown(e, t, p) { arcs(e.x, e.y, 160, e.x, e.y, 16, '#ff3a20', .1); flash(e.x, e.y, 20, p, 30); },
  };

  // ---------- zones on the ground: sigils and dressed lines, under the units ----------
  function zst(z) { let v = ZST.get(z.id); if (!v) { v = { t: 0, x: z.x, y: z.y }; if (ZST.size > 60) ZST.delete(ZST.keys().next().value); ZST.set(z.id, v); } return v; }
  function drawSig(name, X, Y, R, col, al, rot) { const sp = Art.sigil(name, col), c = Math.cos(rot), sn = Math.sin(rot); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = al * .62; ctx.setTransform(dpr * c * R, dpr * sn * R * TILT, -dpr * sn * R, dpr * c * R * TILT, dpr * X, dpr * Y); ctx.drawImage(sp, -1, -1, 2, 2); resetT(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
  function lineBetween(x0, y0, x1, y1, col, w) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(sx(x0), sy(y0)); ctx.lineTo(sx(x1), sy(y1)); ctx.stroke(); }
  function zoneArt(z, friendly, pal, dt) {
    const X = sx(z.x), Y = sy(z.y), R = z.r * Z, Ry = R * TILT, life = z.total ? clamp01(z.t / z.total) : 1, T = G.t, st = zst(z), col = friendly ? pal.mid : '#ff3e28', fade = clamp01((1 - life) * 8) * clamp01(z.t * 5);
    switch (z.kind) {
      case 'tripline': {
        // The wire: taut, thin, one moving glint. Enemies see it only as a faint scratch.
        const a = friendly ? 1 : .45, x0 = z.x1, y0 = z.y1, x1 = z.x2, y1 = z.y2, Xa = sx(x0), Ya = sy(y0), Xb = sx(x1), Yb = sy(y1), g = (T * .7 + z.id * .13) % 1;
        ctx.globalAlpha = fade * a; lineBetween(x0, y0, x1, y1, INK, 3); lineBetween(x0, y0, x1, y1, friendly ? '#c8ef5a' : '#ff8870', 1.2);
        for (const [q, w] of [[Xa, Ya], [Xb, Yb]]) { ctx.fillStyle = friendly ? '#c8ef5a' : '#ff6a54'; ctx.fillRect(q - 1.6, w - 10 * Z, 3.2, 12 * Z); }
        if (friendly || quality >= 1) { const G2 = Art.glint('#ffffff'), sz = 8 * Z + 2; ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(G2, lerp(Xa, Xb, g) - sz, lerp(Ya, Yb, g) - sz, sz * 2, sz * 2); ctx.globalCompositeOperation = 'source-over'; }
        ctx.globalAlpha = 1; return true;
      }
      case 'lockdown': {
        drawSig('lockdown', X, Y, R, col, fade * .9, T * .4);
        // the sweep: a thin radar arm
        ctx.globalAlpha = fade * .75; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); const an = T * 2.8; ctx.moveTo(X, Y); ctx.lineTo(X + Math.cos(an) * R, Y + Math.sin(an) * Ry); ctx.stroke(); ctx.globalAlpha = 1; return true;
      }
      case 'coven': {
        const n = (1 - life); drawSig('coven', X, Y, R * (1 - n * .28), friendly ? '#c8ef5a' : '#ff3e28', fade * .85, -T * (1.4 + n * 5));
        ctx.fillStyle = rgba(friendly ? '200,239,90' : '255,62,40', .1); ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, 0, TAU); ctx.fill();
        if (dt > 0 && (st.t -= dt) <= 0 && quality >= 1) { st.t = .05; const a = Math.random() * TAU, d = z.r * rnd(.7, 1); const p = add(RISE, z.x + Math.cos(a) * d, z.y + Math.sin(a) * d * .7, rnd(6, 22), .36); p.vx = -Math.cos(a) * d * 2.4; p.vy = -Math.sin(a) * d * 2.4 * .7; p.size = 9; p.col = friendly ? '#c8ef5a' : '#ff6a54'; }
        return true;
      }
      case 'miasma': {
        const isSmoke = z.fx === 'smoke', crash = z.fx === 'crash', tint = isSmoke ? 1 : 0;
        if (crash) { drawSig('crash', X, Y, R, friendly ? pal.mid : '#ff3e28', fade * .4, 0); return true; }
        ctx.fillStyle = rgba(isSmoke ? '120,126,140' : friendly ? '182,236,58' : '255,110,60', .11 * fade + (friendly ? 0 : .05)); ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, 0, TAU); ctx.fill();
        if (dt > 0 && (st.t -= dt) <= 0) { st.t = quality >= 2 ? .08 : .14; const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * z.r, p = add(PUFF, z.x + Math.cos(a) * d, z.y + Math.sin(a) * d * .9, rnd(6, 20), rnd(.8, 1.2)); p.vz = rnd(10, 30); p.vx = rnd(-14, 14); p.vy = rnd(-10, 10); p.size = rnd(30, 52); p.ph = isSmoke ? 1 : 2; p.v = (Math.random() * 3) | 0; p.rot = Math.random() * TAU; p.vr = rnd(-.8, .8); void tint; }
        if (!friendly) { ctx.strokeStyle = rgba('255,62,40', .55 * fade); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, 0, TAU); ctx.stroke(); }
        return true;
      }
      case 'quarantine': {
        drawSig('quarantine', X, Y, R, col, fade * .9, T * .22);
        if (quality >= 1) { const n = 14, h = 34 * Z; ctx.strokeStyle = rgba(friendly ? '230,120,90' : '255,62,40', .55 * fade); ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i < n; i++) { const a = i / n * TAU + T * .3; const x0 = X + Math.cos(a) * R, y0 = Y + Math.sin(a) * Ry; ctx.moveTo(x0, y0); ctx.lineTo(x0, y0 - h * (.5 + .5 * Math.sin(T * 4 + i))); } ctx.stroke(); }
        return true;
      }
      case 'ring': {
        drawSig('salute', X, Y, R, col, fade * .95, T * .55);
        ctx.strokeStyle = col; ctx.globalAlpha = fade; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
        return true;
      }
      case 'tether': {
        const o = unitRef(z.owner), t = unitRef(z.tgt); if (!o || !t) return true; const ax = sx(o.x), ay = sy(o.y) - 24 * Z, bx = sx(t.x), by = sy(t.y) - 22 * Z, Tl = (T * 2.4) % 1;
        ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 6 * Z + 1; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 - 18 * Z, bx, by); ctx.stroke();
        ctx.strokeStyle = friendly ? '#b6ec3a' : '#ff6a44'; ctx.lineWidth = 3.4 * Z; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 - 18 * Z, bx, by); ctx.stroke();
        // fat pips travelling back along the line
        ctx.fillStyle = '#ffffff'; for (let i = 0; i < 4; i++) { const f = 1 - ((Tl + i / 4) % 1), mx0 = (ax + bx) / 2, my0 = (ay + by) / 2 - 18 * Z, x = (1 - f) * (1 - f) * bx + 2 * (1 - f) * f * mx0 + f * f * ax, y = (1 - f) * (1 - f) * by + 2 * (1 - f) * f * my0 + f * f * ay; ctx.beginPath(); ctx.arc(x, y, 2.4 * Z + .6, 0, TAU); ctx.fill(); }
        return true;
      }
      case 'orbit': {
        const o = unitRef(z.owner), ang = z.ang || 0, rad = z.orbit || 170; if (!o) return true; const px0 = o.x, py0 = o.y, q = (typeof posNow === 'function') ? posNow(o, Math.min(1, (G.acc || 0) / DT)) : o, ox = q.x, oy = q.y, Xb = ox + Math.cos(ang) * rad, Yb = oy + Math.sin(ang) * rad; void px0; void py0;
        ctx.strokeStyle = rgba(friendly ? '230,209,156' : '255,62,40', .3); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(sx(ox), sy(oy), rad * Z, rad * Z * TILT, 0, 0, TAU); ctx.stroke();
        lineBetween(ox, oy, Xb, Yb, INK, 5 * Z + 1); lineBetween(ox, oy, Xb, Yb, '#9aa3b2', 2.2 * Z);
        const W = 34 * Z, spin = (z.ang || 0) * 1.5, c0 = Math.cos(spin) * W, s0 = Math.sin(spin) * W, BX = sx(Xb), BY = sy(Yb) - 14 * Z; ctx.drawImage(Art.shadow(), BX - W * 1.1, sy(Yb) - W * .4, W * 2.2, W * .9); ctx.setTransform(dpr * c0, dpr * s0, -dpr * s0, dpr * c0, dpr * BX, dpr * BY); ctx.drawImage(Art.spikeBall(), -1, -1, 2, 2); resetT();
        return true;
      }
      case 'fissure': {
        const x0 = z.x1 === undefined ? z.x : z.x1, y0 = z.y1 === undefined ? z.y : z.y1, x1 = z.x2 === undefined ? z.x : z.x2, y1 = z.y2 === undefined ? z.y : z.y2, a = fracOf(z.t, z.total);
        lineBetween(x0, y0, lerp(x0, x1, a), lerp(y0, y1, a), INK, 10 * Z); lineBetween(x0, y0, lerp(x0, x1, a), lerp(y0, y1, a), friendly ? pal.mid : '#ff3e28', 4 * Z); return true;
      }
      case 'decoy': {
        const o = unitRef(z.owner); if (!o || (!friendly && !litAt(z.x, z.y, 40))) return true; const sp = worldSprite(o), hasF = sp.T ? sp.T.ready : true; if (!hasF) return true; const v = 22 + Math.abs(Math.sin(T * 10)) * 5, W = artR(o) * Z, Xd = sx(z.x), Yd = sy(z.y);
        ctx.globalAlpha = .55 + Math.sin(T * 16) * .1; ctx.drawImage(sp.T ? Art.frameAt(sp.T, Math.sin(T * 12) * .6) : sp.c, Xd - W / sp.R * sp.S / 2, Yd - v * Z - W / sp.R * sp.S / 2, W / sp.R * sp.S, W / sp.R * sp.S); ctx.globalAlpha = 1; return true;
      }
    }
    return false;
  }

  // ---------- pings ----------
  const PING_COL = { attack: '#ff5a44', retreat: '#ffc24a', omw: '#6ec0ff', help: '#f4ead0', danger: '#ff8a3c' };
  function pingAt(e) {
    const u = e.u ? unitById(e.u) : null; if (u && u.team !== G.me.team) return;
    const kind = PING_COL[e.kind] ? e.kind : 'danger'; PINGS.push({ x: e.x, y: e.y, kind, t: 0, life: 2.2 });
    if (PINGS.length > 6) PINGS.shift();
    ring(e.x, e.y, 90, PING_COL[kind], .34);
  }
  function drawPings(dt) {
    for (let i = PINGS.length - 1; i >= 0; i--) { PINGS[i].t += dt; if (PINGS[i].t > PINGS[i].life) PINGS.splice(i, 1); }
    for (const p of PINGS) {
      if (!onScreen(p.x, p.y, 80)) continue;
      const col = PING_COL[p.kind], a = p.t / p.life, X = sx(p.x), Y = sy(p.y), pop = a < .1 ? outBack(a / .1) : 1, fade = a > .8 ? (1 - a) / .2 : 1, k = 22 * pop, top = Y - 46 * Z - Math.sin(p.t * 5) * 3, ph = (p.t * 1.1) % 1;
      ctx.globalAlpha = fade; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(X, Y, 36 * Z * (1 + ph * .7), 36 * Z * TILT * (1 + ph * .7), 0, 0, TAU); ctx.globalAlpha = fade * (1 - ph) * .9; ctx.stroke(); ctx.globalAlpha = fade;
      ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(X, Y - 2); ctx.lineTo(X + 4, top + k * .9); ctx.lineTo(X - 4, top + k * .9); ctx.closePath(); ctx.fill();
      // the badge: an ink lozenge with a simple icon, drawn in place so there is no text to lay out
      ctx.fillStyle = 'rgba(7,9,14,.9)'; ctx.beginPath(); ctx.moveTo(X, top - k); ctx.lineTo(X + k, top); ctx.lineTo(X, top + k); ctx.lineTo(X - k, top); ctx.closePath(); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; const u = k * .5;
      ctx.beginPath();
      if (p.kind === 'attack') { ctx.moveTo(X - u, top - u); ctx.lineTo(X + u, top + u); ctx.moveTo(X + u, top - u); ctx.lineTo(X - u, top + u); }
      else if (p.kind === 'retreat') { ctx.moveTo(X + u * .6, top - u); ctx.lineTo(X - u * .4, top); ctx.lineTo(X + u * .6, top + u); ctx.moveTo(X + u * .1, top - u); ctx.lineTo(X - u * .9, top); ctx.lineTo(X + u * .1, top + u); }
      else if (p.kind === 'omw') { ctx.moveTo(X - u, top); ctx.lineTo(X + u, top); ctx.moveTo(X + u * .3, top - u * .7); ctx.lineTo(X + u, top); ctx.lineTo(X + u * .3, top + u * .7); }
      else if (p.kind === 'help') { ctx.moveTo(X, top - u); ctx.lineTo(X, top + u); ctx.moveTo(X - u, top); ctx.lineTo(X + u, top); }
      else { ctx.moveTo(X, top - u); ctx.lineTo(X, top + u * .2); ctx.moveTo(X, top + u * .8); ctx.lineTo(X, top + u * .85); }
      ctx.stroke(); ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
    }
    ctx.globalAlpha = 1;
  }

  // ---------- trails and recalls ----------
  function cosmeticTick(c, v, px, py, dt, sp) {
    if (quality < 1 && c !== G.me) return;
    if (!isUp(c) || !onScreen(px, py, 80) || (c.team !== G.me.team && !seesU(c))) return;
    const trail = cosOf(c, 'trail');
    if (trail && sp > 40 && !c.air) {
      v.trailD = (v.trailD || 0) + sp * dt;
      if (v.trailD > (trail === 'prism' || trail === 'halo' ? 22 : 32)) {
        v.trailD = 0;
        const bx = px - (c.fx || 0) * 22, by = py - (c.fy || 0) * 22, id = trail;
        if (id === 'embers') { const p = add(SPARK, bx + rnd(-8, 8), by + rnd(-6, 6), rnd(8, 18), .5); p.vz = rnd(40, 90); p.size = 7; p.col = '#ff9a3c'; }
        else if (id === 'frost') { rise(bx, by, 1, '#bfe8ff', 14, .55, 8); }
        else if (id === 'ticker') { const p = add(CHIP, bx, by, 20, .7); p.vx = rnd(-30, 30); p.vy = rnd(-20, 20); p.vz = rnd(60, 120); p.vr = rnd(-16, 16); p.size = .5; p.col = pick(['#f4ead0', '#ecd9a6', '#c8ef5a']); p.v = 0; p.bounce = 0; }
        else if (id === 'static') { arcs(bx, by, 16, bx + rnd(-28, 28), by + rnd(-20, 20), rnd(12, 26), '#bfe0ff', .12, 8); }
        else if (id === 'ink') { puff(bx, by, 1, 1, 22, .55, 8, 10); }
        else if (id === 'petals') { const p = add(LEAF, bx, by, 20, .9); p.vx = rnd(-20, 20); p.vz = rnd(10, 40); p.rot = Math.random() * TAU; p.vr = rnd(-6, 6); p.spr = Art.leaf('#f0d38a'); p.size = 1; }
        else if (id === 'halo') { ring(bx, by, 26, '#ffe6a8', .3); rise(bx, by, 1, '#ffe6a8', 8, .45, 8); }
        else if (id === 'prism') { const col = ['#ff7ac0', '#ffd78a', '#c8ef5a', '#7dffd8', '#bfd8ff', '#d9b8ff'][((G.t * 8 | 0) + (c.slot | 0)) % 6]; const p = add(SPARK, bx, by, rnd(6, 18), .55); p.vz = rnd(40, 90); p.size = 9; p.col = col; rise(bx, by, 1, col, 12, .4, 7); }
        else rise(bx, by, 1, palT(c.team).mid, 12, .4, 7);
      }
    }
    // Recall: pick a look, then spawn its beats on a timer; the final jump is the sim's blink.
    if (c.chan && c.chan.recall && c.chan.total) {
      const id = cosOf(c, 'recall') || 'default', prog = 1 - c.chan.t / c.chan.total, p = palT(c.team);
      v.recT = (v.recT || 0) - dt;
      if (v.recT <= 0) {
        v.recT = id === 'storm' ? .22 : id === 'ascend' ? .1 : .14;
        const R = 54 + prog * 12;
        switch (id) {
          case 'lift': rise(px, py, 2, p.mid, 40, 1, 12); if (prog > .5) rise(px, py, 2, p.core, 26, .8, 10); break;
          case 'vault': sigil('rupture', px, py, 64, p.mid, .3, 3); coins(px, py, 1, { sp: 70, vz: 200, life: .5 }); break;
          case 'storm': { const a = Math.random() * TAU; arcs(px + Math.cos(a) * 40, py + Math.sin(a) * 28, 90, px + Math.cos(a) * 8, py + Math.sin(a) * 6, 14, '#bfe0ff', .14, 16); ring(px, py, 50, '#bfe0ff', .14); break; }
          case 'inkwell': puff(px, py, 1, 1, 34, .6, 6, 30); if (Math.random() < .4) sigil('mark', px, py, 60, '#3a3550', .4, -1); break;
          case 'heraldic': sigil('salute', px, py, 74, p.mid, .35, 1); rise(px, py, 1, GOLD, 40, .6, 10); break;
          case 'ascend': { const col = ['#d9b8ff', '#bfe8ff', '#ffd78a', '#7dffd8'][(G.t * 10 | 0) % 4]; rise(px, py, 2, col, 44, .9, 12); ring(px, py, R, col, .18); if (prog > .7) pillar(px, py, '#7a5cff', col, .16); break; }
          default: rise(px, py, 1, p.mid, 30, .7, 9); ring(px, py, R, p.ring, .14);
        }
      }
      // A clean hop of the coin itself, so the channel reads even without a look.
      v.recallYaw = (v.recallYaw || 0) + dt * (4 + prog * 8);
      v.yaw += (v.recallYaw - v.yaw) * .4;
    } else v.recallYaw = 0;
  }

  // ---------- finishers ----------
  // A unique last word per champion. ux,uy runs from the killer through the victim. k is 1 for your own kills and deaths and about .6 for a kill you merely witness.
  const seal = (kit, x, y, r, col, life = .34) => overlay(4, x, y, 34, life, { spr: Art.seal(kit, col), r });
  const FIN = {
    vesper(x, y, ux, uy, p, k) { sigil('mark', x, y, 170 * k, p.mid, .36, 3); later(.07, () => { beam(x - ux * 1400, y - uy * 1400, x + ux * 340, y + uy * 340, p.mid, 12, .26, 30); ring(x, y, 130 * k, p.ring, .26, 20); spark(x, y, 8, p.spark, 460, .3, 15, 28); }); },
    kade(x, y, ux, uy, p, k) { const a0 = Math.atan2(uy, ux); cut(x, y, a0 + .8, 200 * k, p.mid, .2, 26); later(.08, () => cut(x, y, a0 - .8, 200 * k, p.mid, .2, 26)); later(.17, () => { beam(x - ux * 210, y - uy * 210, x + ux * 220, y + uy * 220, '#ffffff', 7, .16, 26); spark(x, y, 9, p.spark, 400, .32, 16, 26); ring(x, y, 120 * k, p.ring, .22, 20); }); },
    ione(x, y, ux, uy, p, k) { for (let i = 0; i < 6; i++) later(i * .05, () => { const ax = x + rnd(-110, 110) * k, ay = y + rnd(-60, 60) * k; beam(ax + 130, ay - 220, ax, ay, p.mid, 8, .15, 12); ring(ax, ay, 40, p.ring, .2); spark(ax, ay, 3, p.spark, 240, .26, 12, 12); }); },
    solenne(x, y, ux, uy, p, k) { pillar(x, y, p.out, p.mid, .75); sigil('heal', x, y, 200 * k, p.mid, .55, 1); rise(x, y, 14, p.mid, 80, 1, 14); ring(x, y, 150 * k, p.ring, .36); },
    sable(x, y, ux, uy, p, k) { puff(x, y, 9, 1, 40, .5, 22, 120); const a = Math.atan2(uy, ux); slash(x, y, Math.cos(a + 1.3), Math.sin(a + 1.3), 150 * k, p.mid, .22); later(.09, () => { slash(x, y, Math.cos(a - 1.3), Math.sin(a - 1.3), 170 * k, '#ffffff', .22); spark(x, y, 7, p.spark, 340, .3, 14, 28); }); },
    gravel(x, y, ux, uy, p, k) { sigil('stomp', x, y, 210 * k, p.mid, .4, .6); wave(x, y, 330 * k, p.mid, .55); dustRing(x, y, 120 * k, 8); chips(x, y, 8, p.chip, 340, 24); later(.12, () => ring(x, y, 180 * k, p.ring, .3)); },
    deadbolt(x, y, ux, uy, p, k) { sigil('lockdown', x, y, 190 * k, p.mid, .42, -2.4); for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + rnd(-.2, .2); arcs(x, y, 30, x + Math.cos(a) * 170 * k, y + Math.sin(a) * 170 * k, 6, p.spark, .2, 20); } later(.14, () => { ring(x, y, 110 * k, p.ring, .24, 20); spark(x, y, 8, p.spark, 360, .3, 14, 26); }); },
    duelist(x, y, ux, uy, p, k) { const a = Math.atan2(uy, ux); [-.5, .2, .85].forEach((o, i) => later(i * .06, () => cut(x, y, a + o, 170 * k, p.mid, .2, 26))); later(.2, () => { const n = nq(10); for (let i = 0; i < n; i++) { const an = Math.random() * TAU, v = rnd(60, 220), q = add(LEAF, x, y, rnd(20, 50), rnd(.7, 1.2)); q.vx = Math.cos(an) * v; q.vy = Math.sin(an) * v; q.vz = rnd(120, 300); q.rot = Math.random() * TAU; q.vr = rnd(-9, 9); q.spr = Art.leaf(i % 2 ? '#ff4a5a' : '#c8243a'); q.size = rnd(.9, 1.5); } ring(x, y, 110 * k, p.ring, .24, 20); }); },
    hex(x, y, ux, uy, p, k) { sigil('hex', x, y, 190 * k, p.mid, .46, 3.2); puff(x, y, 8, 2, 34, .5, 24, 90); later(.12, () => { const dp = add(DISC, x, y, 34, .5); dp.spr = { c: coinSp().c, w: 32, h: 32 }; dp.vz = 520; dp.vr = 26; dp.v = 1.3; }); },
    plague(x, y, ux, uy, p, k) { puff(x, y, 12, 2, 54, .9, 16, 130); rise(x, y, 12, p.mid, 90, 1, 12); sigil('quarantine', x, y, 170 * k, p.mid, .5, .5); wave(x, y, 240 * k, p.mid, .6); },
    shiv(x, y, ux, uy, p, k) { for (let i = 0; i < 7; i++) later(i * .035, () => { const a = Math.random() * Math.PI, X_ = x + rnd(-30, 30), Y_ = y + rnd(-22, 22); cut(X_, Y_, a, 118 * k, i % 2 ? '#ffffff' : p.mid, .13, 26); spark(X_, Y_, 2, p.spark, 300, .2, 12, 24); }); },
    ironjaw(x, y, ux, uy, p, k) { const b = add(DISC, x, y, 620, .32); b.spr = { c: Art.spikeBall(), w: 96, h: 96 }; b.vz = -1900; b.v = 1; b.bounce = 0; later(.3, () => { wave(x, y, 360 * k, p.mid, .6); ring(x, y, 190 * k, p.ring, .32); dustRing(x, y, 130 * k, 8); chips(x, y, 9, p.chip, 360, 26); spark(x, y, 8, p.spark, 400, .34, 16, 20); G.shake = Math.max(G.shake, 6); }); },
  };
  function finisher(u, by, x, y, own) {
    const kit = by && by.champ, F = FIN[kit], dx = by ? x - by.x : 1, dy = by ? y - by.y : 0, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, p = palK(by || u), k = own ? 1 : .62;
    if (F) F(x, y, ux, uy, p, k);
    if (kit) seal(kit, x, y, (own ? 150 : 96), p.mid);
    wave(x, y, own ? 300 : 180, p.mid, .5);
  }
  // Fireworks over a win. Launched in a short volley.
  function fireworks(x, y, col, n) {
    const m = quality >= 2 ? n : quality === 1 ? Math.ceil(n * .7) : Math.ceil(n * .4);
    for (let i = 0; i < m; i++) later(i * .22 + rnd(0, .12), () => {
      const bx = x + rnd(-280, 280), by = y + rnd(-180, 120), z = rnd(150, 300), q = add(SPARK, bx, by, 40, .32); q.vz = (z - 40) / .32; q.col = col; q.size = 12;
      later(.3, () => { ring(bx, by, rnd(110, 170), col, .4, z); spark(bx, by, 16, col, 340, .55, 13, z); });
    });
  }
  // A boss goes down: its colour takes the whole screen for a moment.
  function bossFall(x, y, kind, near) {
    const col = Art.BOSS_COL[kind] || GOLD;
    wave(x, y, 680, col, .8); wave(x, y, 380, '#ffe6c0', .45);
    ring(x, y, 360, col, .5, 8); ring(x, y, 220, GOLD, .4, 20);
    overlay(0, x, y, 40, .18, { spr: Art.impact(col, '#ffffff', 2), r: 170 }); if (quality >= 1) overlay(2, x, y, 40, .32, { spr: Art.speedLines(col, 2), r: 440, ink: null });
    pillar(x, y, col, '#fff4d8', .9); dustRing(x, y, 200, 10);
    coins(x, y, 26, { sp: 340, vz: 820, z: 40, size: 12, life: 1.5 }); spark(x, y, 18, col, 520, .6, 18, 40);
    if (near) { hitStop(.09); slowMo(.5, .4); cine(1, 1); G.shake = Math.max(G.shake, 11); G.punch = Math.max(G.punch, .07); }
  }

  function fxEvent(e) {
    const s = G.s, me = G.me; if (!s || !me) return;
    switch (e.e) {
      case 'hit': {
        const u = unitById(e.u); if (!u) return; const v = visOf(u);
        if (u.team !== me.team && u.kind !== 'tower' && !seesU(u)) return;
        const by = e.by ? unitById(e.by) : null, on = onScreen(u.x, u.y, 140), mine = e.by === me.id, onMe = u === me, skill = !!e.sk, big = skill || e.crit, heavy = e.a >= 110 || e.crit, pal = palT(by ? by.team : -1);
        v.flash = Math.max(v.flash, mine ? 1 : onMe ? .6 : big && u.kind === 'champ' ? .6 : .28);
        if (by && u.kind !== 'tower') { const dx = u.x - by.x, dy = u.y - by.y, l = Math.hypot(dx, dy) || 1, k = u.boss ? 3 : mine && skill ? 16 : mine || onMe ? 8 : 3; v.rx += dx / l * k; v.ry += dy / l * k; }
        if (on) {
          const side = (u.kind === 'champ' ? 44 : 26) * (u.x >= me.x ? 1 : -1);
          if (mine && skill) {
            hitMark(u, heavy ? GOLD : '#ffffff'); spark(u.x, u.y, heavy ? 7 : 4, pal.spark, 300, .26, 14, 20); chips(u.x, u.y, heavy ? 3 : 1, pal.chip, 260);
            number(u.x, u.y, 46, e.a, e.crit ? '#ffd08a' : '#fff6e2', true, .8, u.id, side);
            if (u.kind !== 'tower' && u.kind !== 'minion') flash(u.x, u.y, 18, pal, heavy ? 58 : 40);
          } else if (mine) {
            spark(u.x, u.y, e.crit ? 4 : 2, SPARKY, 170, .2, 9, 18); if (e.crit) { hitMark(u, GOLD); flash(u.x, u.y, 16, pal, 40); }
            number(u.x, u.y, 42, e.a, e.crit ? '#ffd08a' : '#fff6e2', !!e.crit, .6, u.id, side);
          } else if (onMe) {
            number(u.x, u.y, 44, e.a, '#ff7a62', !!big, .8, 'me', 44);
            if (big) spark(u.x, u.y, 3, DANGER.mid, 200, .22, 11, 30);
          }
        }
        if (onMe) { if (e.a >= 100) G.shake = Math.max(G.shake, 4.5); }
        else if (mine && skill) { G.shake = Math.max(G.shake, heavy ? 3.5 : 1.8); G.punch = Math.max(G.punch, heavy ? .022 : .01); if (heavy) hitStop(.035); }
        break;
      }
      case 'heal': { const u = unitById(e.u); if (u === me && onScreen(u.x, u.y, 140)) { number(u.x, u.y, 58, e.a, '#a7f0a2', false, .8, 'meheal', -64); rise(u.x, u.y, 3, HEAL, 34, .6, 8); } break; }
      case 'die': {
        const u = unitById(e.u), ex = e.x !== undefined ? e.x : u ? u.x : 0, ey = e.y !== undefined ? e.y : u ? u.y : 0, by = e.by ? unitById(e.by) : null, iKilled = e.by === me.id, iDied = e.u === me.id, on = onScreen(ex, ey, 180) && (iKilled || iDied || e.kind === 'tower' || litAt(ex, ey, 60));
        if (e.kind === 'champ') {
          const pal = palT(by ? by.team : -1);
          if (iKilled || iDied) {
            if (u && on) shatter(worldSprite(u), artR(u), ex, ey, true);
            if (on) { coins(ex, ey, iKilled ? 14 : 6, { sp: 320, vz: 680, size: 12 }); spark(ex, ey, 10, iKilled ? GOLD : '#ffffff', 340, .42, 12, 22); ring(ex, ey, 150, iKilled ? GOLD : '#ff5a44', .38); burst(ex, ey, 20, pal, 1, iKilled); finisher(u, by && by.kind === 'champ' ? by : null, ex, ey, true); cine(iKilled ? .62 : .5, .8); }
            killSplash(e, u, by, iDied);
            G.punch = Math.max(G.punch, .05); G.shake = Math.max(G.shake, 7);
          } else if (on) { if (u && by && by.kind === 'champ') { shatter(worldSprite(u), artR(u), ex, ey, true); finisher(u, by, ex, ey, false); } else if (u) corpse(worldSprite(u), artR(u), ex, ey); ring(ex, ey, 84, u && u.team === me.team ? '#58a6e6' : '#ff6a54', .26); flash(ex, ey, 18, pal, 34); }
        } else if (e.kind === 'tower') {
          if (u) { const v = visOf(u); v.fallT = 0; }
          if (on) towerFall(ex, ey, u ? u.team : 0, !!(u && u.sub === 'core'), Math.hypot(ex - me.x, ey - me.y) < 800);
        } else if (on) {
          const quietOne = !iKilled;
          if (u) corpse(worldSprite(u), artR(u), ex, ey);
          if (!quietOne) coins(ex, ey, e.kind === 'monster' ? 6 : 2, { sp: 150, vz: 420 });
          if (u && u.boss) { burst(ex, ey, 50, NEUT, 1.6, true); bossFall(ex, ey, u.bossKind || 'colossus', Math.hypot(ex - me.x, ey - me.y) < 900); if (iKilled) G.shake = Math.max(G.shake, 9); }
        }
        break;
      }
      case 'gold': {
        if (e.u === me.id) { if (onScreen(me.x, me.y, 40)) number(me.x, me.y - 8, 46, '+' + e.a, GOLD, false, .75, undefined, 58); flyGold(e.a); }
        break;
      }
      case 'boom': {
        const on = onScreen(e.x, e.y, (e.r || 100) + 120) && litAt(e.x, e.y, e.r || 100); if (!on) return;
        const t = teamOfBoom(e), pal = palFx(e.fx, t), huge = e.r >= 150, own = ownBlast(e, t), R = BOOM[e.fx];
        if (R) R(e, t, pal, own, huge);
        else if (own) { ring(e.x, e.y, e.r, pal.ring, .4); ring(e.x, e.y, e.r * .62, pal.core, .24, 6); spark(e.x, e.y, huge ? 12 : 6, pal.spark, e.r * 2.2, .42, 16, 16); chips(e.x, e.y, huge ? 4 : 2, pal.chip, e.r * 2, 20); dustRing(e.x, e.y, e.r * .7, huge ? 6 : 3); if (huge) burst(e.x, e.y, 20, pal, 1, true); G.shake = Math.max(G.shake, huge ? 6 : 2.5); G.punch = Math.max(G.punch, huge ? .03 : .012); }
        else ring(e.x, e.y, e.r, t === me.team ? '#7fb6e6' : '#ff5a3c', .3);
        break;
      }
      case 'phit': {
        if (!onScreen(e.x, e.y, 120) || !litAt(e.x, e.y, 80)) break;
        const hit = trailNear(e), t = hit ? hit.team : teamOfPhit(e), pal = palFx(e.fx, t), ult = e.fx === 'deadeye', own = hit ? hit.cls === 2 : (t === me.team && PHIT_KIT[e.fx] && PHIT_KIT[e.fx].includes(me.champ)), R = PHIT[e.fx];
        if (R) R(e, t, pal, own);
        else if (own) { spark(e.x, e.y, ult ? 10 : 4, pal.spark, ult ? 420 : 220, .26, ult ? 18 : 12, 24); if (ult) { ring(e.x, e.y, 130, pal.ring, .3, 16); burst(e.x, e.y, 22, pal, 1.2, true); G.shake = Math.max(G.shake, 5); } else if (e.fx === 'snipeFull') ring(e.x, e.y, 84, pal.ring, .22, 16); }
        else if (ult) ring(e.x, e.y, 120, t === me.team ? '#7fb6e6' : '#ff5a3c', .28, 16);
        break;
      }
      case 'blink': { if (onScreen(e.x, e.y, 120) && litAt(e.x, e.y, 40)) { const t = teamNear(e.x, e.y), pal = palT(t), near = Math.hypot(e.x - me.x, e.y - me.y) < 40; if (near) { ring(e.x, e.y, 90, pal.ring, .3); spark(e.x, e.y, 6, pal.spark, 240, .3, 13, 22); overlay(2, e.x, e.y, 22, .18, { spr: Art.speedLines(pal.lines, 3), r: 120, ink: null }); } else ring(e.x, e.y, 56, t === me.team ? '#7fb6e6' : '#ff5a3c', .22); } break; }
      case 'parry': {
        const u = unitById(e.u); if (!u) return;
        const pal = palT(u.team);
        if (u === me) { if (onScreen(u.x, u.y, 140)) { ring(u.x, u.y, 110, pal.ring, .3); spark(u.x, u.y, 10, pal.spark, 420, .36, 16, 20); flash(u.x, u.y, 18, pal, 60); } hitStop(.05); G.shake = Math.max(G.shake, 4); G.punch = Math.max(G.punch, .03); }
        else if (onScreen(u.x, u.y, 140)) ring(u.x, u.y, 80, pal.ring, .22);
        break;
      }
      case 'cast': case 'fire': {
        const u = unitById(e.u); if (!u) return; const v = visOf(u), own = u === me, enemy = u.team !== me.team;
        if (enemy && !seesU(u)) return;
        const dx = e.dx || u.fx || 1, dy = e.dy || u.fy || 0, pal = palK(u), fx = e.fx || 'bolt';
        poseStart(v, fx, dx, dy, u);
        if (enemy) v.spin = Math.max(v.spin, .5); // a quick half-turn tells you an enemy is casting
        if (!onScreen(u.x, u.y, 180) && !(e.e === 'fire')) return;
        const R = CASTFX[fx], k = own ? 1 : .55;
        if (R) R(u, dx, dy, pal, own, k, v);
        else if (own) { ring(u.x, u.y, 74, pal.ring, .2); flash(u.x + dx * 40, u.y + dy * 40, 18, pal, 24); G.punch = Math.max(G.punch, .008); }
        break;
      }
      case 'ping': if (e.team === undefined || e.team === G.me.team) pingAt(e); break;
      case 'poly': { const u = unitById(e.u); if (!u || !onScreen(u.x, u.y, 140)) return; sigil('hex', u.x, u.y, 80, '#c8ef5a', .4, 3); puff(u.x, u.y, 6, 0, 26, .4, 22, 60); coins(u.x, u.y, 4, { sp: 160, vz: 340 }); visOf(u).squash = 1; break; }
      case 'knock': { const u = unitById(e.u); if (u && u === me && onScreen(u.x, u.y, 140)) G.shake = Math.max(G.shake, 3.5); if (u && onScreen(u.x, u.y, 140)) { ring(u.x, u.y, 70, '#ffe89e', .2, 8); dust(u.x, u.y, 1.2); } break; }
      case 'root': { const u = unitById(e.u); if (!u || !onScreen(u.x, u.y, 140)) return; sigil('root', u.x, u.y, 62, '#c8ef5a', .3, 0); spark(u.x, u.y, 3, '#c8ef5a', 120, .25, 10, 6); break; }
      case 'stealth': { const u = unitById(e.u); if (!u || !onScreen(u.x, u.y, 140) || (u.team !== me.team && !litAt(u.x, u.y, 30))) return; if (e.on) { puff(u.x, u.y, 5, 1, 30, .36, 18, 60); ring(u.x, u.y, 70, palT(u.team).ring, .22); } else { ring(u.x, u.y, 60, '#ffffff', .18); spark(u.x, u.y, 3, '#ffffff', 200, .22, 10, 20); } break; }
      case 'curse': { const u = unitById(e.u); if (u && onScreen(u.x, u.y, 140)) sigil('hex', u.x, u.y, 44 + (e.n || 1) * 8, '#c8ef5a', .3, 2); break; }
      case 'shield': { const u = unitById(e.u); if (u && onScreen(u.x, u.y, 140)) ring(u.x, u.y, 58, '#bfe8ff', .24, 14); break; }
      case 'level': {
        const u = unitById(e.u); if (!u || !onScreen(u.x, u.y, 140)) return;
        const pal = palT(u.team);
        if (u === me) { visOf(u).squash = 1; ring(u.x, u.y, 130, pal.ring, .5); ring(u.x, u.y, 76, pal.core, .3); pillar(u.x, u.y, pal.out, pal.mid, .6); rise(u.x, u.y, 8, pal.mid, 50, .9, 12); G.punch = Math.max(G.punch, .022); G.shake = Math.max(G.shake, 2); }
        else ring(u.x, u.y, 70, pal.ring, .26);
        break;
      }
      case 'spawn': { const u = unitById(e.u); if (u === me && onScreen(u.x, u.y, 140)) { const pal = palT(u.team); ring(u.x, u.y, 96, pal.ring, .4); rise(u.x, u.y, 6, pal.mid, 34, .6, 10); } break; }
      case 'civ': {
        if (!onScreen(e.x, e.y, 200)) return;
        const hero = e.team === 0, pal = palT(e.team), close = Math.hypot(e.x - me.x, e.y - me.y) < 240;
        civRun(e.x, e.y, 5, !hero); ring(e.x, e.y, 140, pal.ring, .42);
        if (close && e.team === me.team) { flash(e.x, e.y, 24, pal, 70); rise(e.x, e.y, 8, pal.mid, 90, 1, 11); G.punch = Math.max(G.punch, .015); }
        break;
      }
      case 'tower': break;
      case 'forge': { const u = unitById(e.u); if (u === me && onScreen(u.x, u.y, 140)) { ring(u.x, u.y, 90, GOLD, .4); rise(u.x, u.y, 8, GOLD, 34, .7, 10); } break; }
      case 'tshot': { if (e.t === me.id) G.tAim = { id: e.u, t: 1.25 }; break; }
      case 'matk': {
        const u = unitById(e.u); if (!u) return; const v = visOf(u);
        let t = null, bd = 1e12; const reach = (u.range || 140) + 90, foe = (a, b) => { if (!b || b.alive === false || b.team === u.team || b.delay > 0) return a; const d = Math.hypot(b.x - u.x, b.y - u.y); return d < bd && d < reach ? (bd = d, b) : a; };
        for (const m of s.minions) t = foe(t, m); for (const c of s.champs) t = foe(t, c); for (const w of s.towers) t = foe(t, w);
        const dx = t ? t.x - u.x : (u.fx || (u.team ? -1 : 1)), dy = t ? t.y - u.y : (u.fy || 0), l = Math.hypot(dx, dy) || 1;
        v.adx = dx / l; v.ady = dy / l; v.atkT = 0;
        if (t) { const r = t.r || 15; v.hitX = t.x - v.adx * r * .7; v.hitY = t.y - v.ady * r * .7; } else { v.hitX = u.x + v.adx * 34; v.hitY = u.y + v.ady * 34; }
        break;
      }
      case 'boss': { G.cheer = Math.max(G.cheer, 3); for (const c of s.champs) if (c.alive && c.team === e.team && onScreen(c.x, c.y, 140)) { const col = Art.BOSS_COL[e.kind] || GOLD; ring(c.x, c.y, 76, col, .4, 10); rise(c.x, c.y, 5, col, 34, .7, 10); } break; }
      case 'bossup': { const b = (s.bosses || []).find(q => q.kind === e.kind); if (b && onScreen(b.x, b.y, 300)) { const col = Art.BOSS_COL[e.kind] || GOLD; pillar(b.x, b.y, col, '#fff4d8', .8); wave(b.x, b.y, 440, col, .7); ring(b.x, b.y, 240, col, .5, 8); dustRing(b.x, b.y, 150, 8); G.shake = Math.max(G.shake, 5); G.punch = Math.max(G.punch, .03); } break; }
      case 'mapevent': {
        const on = e.x !== undefined && onScreen(e.x, e.y, 320), near = on && Math.hypot(e.x - me.x, e.y - me.y) < 900;
        if (e.phase === 'end' && e.team >= 0) {
          G.cheer = Math.max(G.cheer, e.team === 0 ? 6 : 0);
          if (on) { const pal = palT(e.team), col = e.team === 0 ? '#ffe08a' : '#ff5a4a'; wave(e.x, e.y, 680, col, .75); ring(e.x, e.y, 320, pal.ring, .5, 6); coins(e.x, e.y, 20, { sp: 320, vz: 760, z: 30, size: 11, life: 1.4 }); fireworks(e.x, e.y, col, 7); if (e.kind === 'heist' && e.team === 1) spark(e.x, e.y, 14, GOLD, 480, .6, 15, 60); civRun(e.x, e.y, 5, e.team === 1); if (near) { slowMo(.34, .55); cine(.8, .8); G.shake = Math.max(G.shake, 6); G.punch = Math.max(G.punch, .04); } }
        } else if (e.phase === 'warn' && on) { const col = '#ffe08a'; ring(e.x, e.y, 260, col, .5, 4); wave(e.x, e.y, 360, col, .55); }
        else if (e.phase === 'start' && on && e.kind === 'drop') { wave(e.x, e.y, 320, '#ffe08a', .45); dustRing(e.x, e.y, 90, 6); chips(e.x, e.y, 4, GOLD, 200, 12); G.shake = Math.max(G.shake, 3); }
        break;
      }
      case 'fund': { const u = unitById(e.u); if (u === me) { G.cheer = Math.max(G.cheer, 2); if (onScreen(u.x, u.y, 140)) { coins(u.x, u.y, 8, { sp: 180, vz: 620, z: 30, size: 11 }); ring(u.x, u.y, 110, GOLD, .4, 12); rise(u.x, u.y, 8, GOLD, 40, .8, 11); } } break; }
      case 'buyback': { const u = unitById(e.u); if (u && onScreen(u.x, u.y, 140)) { const col = GOLD; wave(u.x, u.y, 260, col, .5); pillar(u.x, u.y, '#8a6f3e', col, .6); ring(u.x, u.y, 130, col, .4, 10); coins(u.x, u.y, 10, { sp: 220, vz: 640, z: 30, size: 11 }); if (u === me) { G.punch = Math.max(G.punch, .03); G.shake = Math.max(G.shake, 3); } } break; }
      case 'consume': { const u = unitById(e.u); if (u === me && onScreen(u.x, u.y, 140)) { ring(u.x, u.y, 70, HEAL, .3, 10); rise(u.x, u.y, 5, HEAL, 26, .6, 9); } break; }
      case 'atk': {
        const u = unitById(e.u); if (!u) return; const v = visOf(u), t = e.t ? unitById(e.t) : null;
        const dx = t ? t.x - u.x : (u.fx || 0), dy = t ? t.y - u.y : (u.fy || 0), l = Math.hypot(dx, dy) || 1, k = u === me ? 12 : u.kind === 'champ' ? 6 : 3;
        v.rx += dx / l * k; v.ry += dy / l * k;
        if (u.kind === 'champ' && (u.range || 0) < 200 && t && (u === me || t === me) && onScreen(u.x, u.y, 120)) slash(u.x, u.y, dx / l, dy / l, 110, u === me ? palT(u.team).mid : '#ff6a4a', .14);
        break;
      }
      case 'stun': { const u = unitById(e.u); if (u === me && onScreen(u.x, u.y, 140)) ring(u.x, u.y, 70, '#ffe89e', .24, 30); break; }
      case 'mark': { const u = unitById(e.u); if (u && (u === me || u.team !== me.team) && onScreen(u.x, u.y, 140)) ring(u.x, u.y, 66, '#ff2d9b', .26, 20); break; }
      case 'cancelled': break;
    }
  }
  // The live projectile this hit came from, if there is one still known. Trail positions are in world units.
  function trailNear(e) { let best = null, bd = 260; for (const t of trails.values()) { if (t.fx !== e.fx || G.t - t.at > .4) continue; const d = Math.hypot(t.lx - e.x, t.ly - e.y); if (d < bd) { bd = d; best = t; } } return best; }
  const teamNear = (x, y) => { let b = null, d = 1e12; for (const c of G.s.champs) { if (!c.alive) continue; const q = Math.hypot(c.x - x, c.y - y); if (q < d) { d = q; b = c; } } return b && d < 700 ? b.team : 2; };

  // Ability-ready detection lives here so the sparkle fires even if the HUD is rebuilt.
  function tickWarn(dt) {
    if (G.tAim && (G.tAim.t -= dt) <= 0) G.tAim = null;
    const me = G.me; if (!me || !me.cd) return;
    for (let i = 0; i < me.cd.length; i++) {
      const c = me.cd[i], was = prevCd[i] || 0;
      if (c <= 0 && was > 0 && !(i === 2 && me.lvl < 3) && isUp(me)) { readyFx.push({ i, t: 0 }); rise(me.x, me.y, 2, palT(me.team).mid, 26, .4, 8); }
      prevCd[i] = c;
    }
  }

  const goldCoin = () => coinSp();
  return { FX: { minionHit, wave, cine, later, fireworks, bossFall, finisher, goldCoin, poseStart, poseTick, cosmeticTick, sigil, beam, arcs, cut, reset, spark, puff, dust, drawDust, coins, ring, slash, ghost, ghostLine, corpse, shatter, leaves, splash, rise, popCoin, chips, pillar, burst, draw, projectiles, telegraphs, danger, textLayer, tickWarn, towerFall, finale }, fxEvent };
})();
