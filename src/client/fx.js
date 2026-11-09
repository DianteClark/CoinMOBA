// Particles, projectiles, telegraphs, aim indicators and the event-to-effect mapping.
// Everything private lives in the closure below; only FX, FX_CAP and fxEvent are shared.
const FX_CAP = q => q >= 2 ? 150 : q === 1 ? 96 : 50;
const { FX, fxEvent } = (() => {
  // Energy by caster: heroes pale gold and white, villains crimson with a touch of acid, neutrals ember.
  const HERO = { out: '#b8934e', mid: '#f0dfb0', core: '#ffffff', spark: '#f0dfb0', spark2: '#ffffff', chip: '#e6d19c', ring: '#f0dfb0', dots: '#f0dfb0', lines: '#ffffff', imp: '#f0dfb0', imp2: '#ffffff', aim: '240,223,176' };
  const VILL = { out: '#8e1224', mid: '#ff4a5a', core: '#ffe2e4', spark: '#ff4a5a', spark2: '#c8ef5a', chip: '#c8243a', ring: '#ff4a5a', dots: '#ff4a5a', lines: '#ffd0d4', imp: '#ff4a5a', imp2: '#ffe2e4', aim: '190,235,70' };
  const NEUT = { out: '#b05a1c', mid: '#ffb26a', core: '#fff0d8', spark: '#ffb26a', spark2: '#ffe0b0', chip: '#d8863c', ring: '#ffb26a', dots: '#ffb26a', lines: '#ffe0b0', imp: '#ffb26a', imp2: '#fff0d8', aim: '255,170,90' };
  const palT = t => t === 0 ? HERO : t === 1 ? VILL : NEUT;
  // Anything aimed at you is drawn in this palette, whichever side threw it.
  const DANGER = { out: '#d81f24', mid: '#ff5a44', core: '#ffe9d8', aim: '255,62,40' };
  const GOLD = '#f0d38a', SPARKY = '#fff4d8', INK = Art.INK, HEAL = '#b6e5a8';
  const SPARK = 0, PUFF = 1, SHARD = 2, COIN = 3, RING = 4, SLASH = 5, GHOST = 6, LEAF = 7, RISE = 8, DROP = 9, DISC = 10, CIV = 11, CHIP = 12, PILLAR = 13;
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

  function reset() { P = []; cursor = 0; trails = new Map(); flyers = []; OV = []; panel = null; readyFx = []; prevCd = []; zoneTeam = new Map(); falls = []; arrive = []; DUST.length = 0; dustN = 0; lastKill = -9; G.text = []; G.tAim = null; }

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
  function shatter(spr, R, x, y) {
    const list = Art.shardsOf(spr), k = R / spr.R;
    for (const s of list) {
      const p = add(SHARD, x + Math.cos(s.a) * R * .35, y + Math.sin(s.a) * R * .35, 34, rnd(.8, 1.15));
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

  // ---------- simulation of particles ----------
  function step(dt) {
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i]; p.life -= dt;
      if (p.life <= 0) { const l = P.pop(); if (i < P.length) P[i] = l; continue; }
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
      const X = sx(p.x), Y = sy(p.y) - p.z * Z, bigM = p.k === RING || p.k === SLASH || p.k === PILLAR ? 420 : m;
      if (X < -bigM || X > VW + bigM || Y < -bigM || Y > VH + bigM) continue;
      const f = p.life / p.max, e = 1 - f;
      switch (p.k) {
        case SPARK: {
          const sp = Art.sparkSp(p.col), wy = p.vy * TILT - p.vz, l = Math.hypot(p.vx, wy) || 1, ux = p.vx / l, uy = wy / l, k = .45 + f * .55, len = p.size * Z * (1 + Math.min(1.5, l / 260)) * k, w = p.size * Z * .42 * k;
          ctx.globalAlpha = Math.min(1, f * 3); ctx.setTransform(dpr * ux, dpr * uy, -dpr * uy, dpr * ux, dpr * X, dpr * Y); ctx.drawImage(sp, -len, -w * .55, len * 2, w * 1.1); resetT(); break;
        }
        case PUFF: {
          const pop = f < .3 ? f / .3 : 1, r = p.size * Z * (.75 + outCub(e) * .95) * pop, c = Math.cos(p.rot) * r, sn = Math.sin(p.rot) * r;
          ctx.globalAlpha = Math.min(.9, f * 1.8); ctx.setTransform(dpr * c, dpr * sn * .72, -dpr * sn, dpr * c * .72, dpr * X, dpr * Y); ctx.drawImage(Art.dustCel(p.ph, p.v), -1, -1, 2, 2); resetT(); break;
        }
        case COIN: { const sp = coinSp(), r = p.size * Z, c = Math.max(.14, Math.abs(Math.cos(p.ph))); ctx.globalAlpha = Math.min(1, f * 3); ctx.drawImage(sp.c, X - r * c * 1.2, Y - r * 1.2, 2.4 * r * c, 2.4 * r); break; }
        case CHIP: { const s = p.size * Z * 15, c = Math.cos(p.rot) * s, sn = Math.sin(p.rot) * s; ctx.globalAlpha = Math.min(1, f * 4); ctx.setTransform(dpr * c, dpr * sn, -dpr * sn, dpr * c, dpr * X, dpr * Y); ctx.drawImage(Art.chip(p.col, p.v), -.5, -.5, 1, 1); resetT(); break; }
        case SHARD: { const s = p.size * Z, w = p.spr.width * s, c = Math.cos(p.rot), sn = Math.sin(p.rot); ctx.globalAlpha = Math.min(1, f * 3); ctx.setTransform(dpr * c, dpr * sn, -dpr * sn, dpr * c, dpr * X, dpr * Y); ctx.drawImage(p.spr, -w / 2 - p.dx * Z, -w / 2 - p.dy * Z, w, w); resetT(); break; }
        case LEAF: { const c = Math.cos(p.rot) * p.size * Z, sn = Math.sin(p.rot) * p.size * Z; ctx.globalAlpha = Math.min(1, f * 4); ctx.setTransform(dpr * c, dpr * sn, -dpr * sn, dpr * c, dpr * X, dpr * Y); ctx.drawImage(p.spr, -8, -5); resetT(); break; }
        case GHOST: { const sp = p.spr, w = (p.R * Z) / sp.R * sp.S, c = Math.max(.12, Math.abs(p.ph)); ctx.globalAlpha = p.alpha * f; ctx.drawImage(sp.c, X - w * c / 2, Y - w * .42, w * c, w * .84); break; }
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
  }

  // ---------- projectiles ----------
  // [ribbon life, width, alpha]. Minion shots have no trail at all.
  const TRAIL = { snipe: [.13, 8, .95], snipeFull: [.2, 14, 1], deadeye: [.32, 22, 1], orb: [.2, 16, .8], ray: [.1, 9, .8], bolt: [.12, 5, .7], tower: [.2, 8, .8] };
  const ROUTINE = { bolt: 1, mbolt: 1, tower: 1 };
  // Reads an owner or target that may be a live unit, a bare id or absent, as it can be on a guest.
  const unitRef = r => r === undefined || r === null ? null : typeof r === 'object' ? r : unitById(r);
  // 0 routine and quiet, 1 an ally's spell, 2 your own, 3 aimed at you or an enemy spell.
  function projClass(p) {
    const me = G.me, o = unitRef(p.owner); if (o === me || (o && o.id === me.id)) return 2;
    if (ROUTINE[p.fx]) { const t = unitRef(p.target); return t && t.id === me.id ? 3 : 0; }
    return p.team === me.team ? 1 : 3;
  }
  const palOf = (team, cls) => cls === 3 ? DANGER : palT(team);

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
      const pal = palOf(p.team, cls), tw = p.fx === 'tower' && cls !== 3 && (p.team === 0 || p.team === 1);
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
    const pal = palOf(p.team, cls), glow = Art.glow, hot = cls >= 2;
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
    if (!r) return; const X = sx(x), Y = sy(y); ctx.strokeStyle = rgba(col, alpha + .25); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(X, Y, r * Z, r * Z * TILT, 0, 0, TAU); ctx.stroke();
  }

  const ENEMY = '255,62,40';
  const NOAB = {};
  const fracOf = (t, total) => total ? 1 - t / total : 1;
  function telegraphs(a) {
    const s = G.s, me = G.me, pulse = .85 + Math.sin(G.t * 14) * .15, zones = s.zones || EMPTY_LIST, champs = s.champs || EMPTY_LIST;
    for (const z of zones) {
      zoneTeam.set(z.x + '|' + z.y, z.team); if (zoneTeam.size > 40) { const k = zoneTeam.keys().next().value; zoneTeam.delete(k); }
      if (!onScreen(z.x, z.y, z.r * Z + 60)) continue;
      const friendly = z.team === me.team, pal = palT(z.team);
      if (!friendly && !litAt(z.x, z.y, z.r)) continue;
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
      if (z.team === me.team || z.fx === 'heal' || z.kind === 'dome' || !onScreen(z.x, z.y, z.r * Z + 60) || !litAt(z.x, z.y, z.r)) continue;
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
  const FONT_AT = [], GOLD_FALLBACK = { x: 64, y: 58 };
  function textLayer(dt) {
    // flashes and speed lines behind the numbers
    for (let i = OV.length - 1; i >= 0; i--) { if ((OV[i].t += dt) >= OV[i].life) OV.splice(i, 1); }
    for (const o of OV) {
      const X = sx(o.x), Y = sy(o.y) - o.z * Z, a = o.t / o.life;
      if (o.kind === 0) { const r = o.r * Z * (.55 + outBack(Math.min(1, a * 1.6)) * .6), c = Math.cos(o.rot) * r, sn = Math.sin(o.rot) * r; ctx.globalAlpha = a > .55 ? (1 - a) / .45 : 1; ctx.setTransform(dpr * c, dpr * sn, -dpr * sn, dpr * c, dpr * X, dpr * Y); ctx.drawImage(o.spr, -1, -1, 2, 2); resetT(); }
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
      ctx.font = FONT_AT[size | 0] || (FONT_AT[size | 0] = '700 ' + (size | 0) + 'px "Barlow Semi Condensed",sans-serif'); ctx.globalAlpha = Math.min(1, f * 3.4);
      ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.strokeText(t.s, X, Y); ctx.fillStyle = t.col; ctx.fillText(t.s, X, Y);
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
    ring(x, y, core ? 300 : 210, '#ffffff', .34, 14); ring(x, y, core ? 170 : 120, GOLD, .26, 28);
    overlay(0, x, y, H * .55, .16, { spr: Art.impact(NEUT.imp, NEUT.imp2, 2), r: core ? 130 : 90 });
    if (quality >= 1) overlay(2, x, y, H * .5, .3, { spr: Art.speedLines('#ffe0b0', 2), r: core ? 420 : 300, ink: null });
    spark(x, y, core ? 14 : 9, GOLD, 420, .5, 16, H * .5);
    const cr = Terrain.towerCrown(team, core), p = add(SHARD, x, y, H, 1.2); p.spr = cr.c; p.size = cr.w / cr.c.width; p.vz = 540; p.vx = rnd(-110, 110); p.vy = rnd(-40, 40); p.vr = rnd(-6, 6); p.bounce = 1;
    if (near) { hitStop(.07); slowMo(.34, .5); G.shake = Math.max(G.shake, core ? 11 : 8); G.punch = Math.max(G.punch, core ? .07 : .05); }
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
            if (u && on) shatter(worldSprite(u), artR(u), ex, ey);
            if (on) { coins(ex, ey, iKilled ? 8 : 3, { sp: 300, vz: 620 }); spark(ex, ey, 10, iKilled ? GOLD : '#ffffff', 340, .42, 12, 22); ring(ex, ey, 150, iKilled ? GOLD : '#ff5a44', .38); burst(ex, ey, 20, pal, 1, iKilled); }
            killSplash(e, u, by, iDied);
            G.punch = Math.max(G.punch, .05); G.shake = Math.max(G.shake, 7);
          } else if (on) { if (u) corpse(worldSprite(u), artR(u), ex, ey); ring(ex, ey, 84, u && u.team === me.team ? '#58a6e6' : '#ff6a54', .26); flash(ex, ey, 18, pal, 34); }
        } else if (e.kind === 'tower') {
          if (u) { const v = visOf(u); v.fallT = 0; }
          if (on) towerFall(ex, ey, u ? u.team : 0, !!(u && u.sub === 'core'), Math.hypot(ex - me.x, ey - me.y) < 800);
        } else if (on) {
          const quietOne = !iKilled;
          if (u) corpse(worldSprite(u), artR(u), ex, ey);
          if (!quietOne) coins(ex, ey, e.kind === 'monster' ? 6 : 2, { sp: 150, vz: 420 });
          if (u && u.boss) { burst(ex, ey, 50, NEUT, 1.6, true); ring(ex, ey, 300, GOLD, .5); coins(ex, ey, 14, { sp: 300, vz: 640 }); if (iKilled) G.shake = Math.max(G.shake, 9); }
        }
        break;
      }
      case 'gold': {
        if (e.u === me.id) { if (onScreen(me.x, me.y, 40)) number(me.x, me.y - 8, 46, '+' + e.a, GOLD, false, .75, undefined, 58); flyGold(e.a); }
        break;
      }
      case 'boom': {
        const on = onScreen(e.x, e.y, (e.r || 100) + 120) && litAt(e.x, e.y, e.r || 100); if (!on) return;
        const t = teamOfBoom(e), pal = palT(t), huge = e.r >= 150, own = ownBlast(e, t);
        if (own) {
          ring(e.x, e.y, e.r, pal.ring, .4); ring(e.x, e.y, e.r * .62, pal.core, .24, 6);
          spark(e.x, e.y, huge ? 12 : 6, pal.spark, e.r * 2.2, .42, 16, 16); chips(e.x, e.y, huge ? 4 : 2, pal.chip, e.r * 2, 20);
          dustRing(e.x, e.y, e.r * .7, huge ? 6 : 3);
          if (huge) burst(e.x, e.y, 20, pal, 1, true);
          G.shake = Math.max(G.shake, huge ? 6 : 2.5); G.punch = Math.max(G.punch, huge ? .03 : .012);
        } else ring(e.x, e.y, e.r, t === me.team ? '#7fb6e6' : '#ff5a3c', .3);
        break;
      }
      case 'phit': {
        if (!onScreen(e.x, e.y, 120) || !litAt(e.x, e.y, 80)) break;
        const hit = trailNear(e), t = hit ? hit.team : teamOfPhit(e), pal = palT(t), ult = e.fx === 'deadeye', own = hit ? hit.cls === 2 : (t === me.team && PHIT_KIT[e.fx] && PHIT_KIT[e.fx].includes(me.champ));
        if (own) { spark(e.x, e.y, ult ? 10 : 4, pal.spark, ult ? 420 : 220, .26, ult ? 18 : 12, 24); if (ult) { ring(e.x, e.y, 130, pal.ring, .3, 16); burst(e.x, e.y, 22, pal, 1.2, true); G.shake = Math.max(G.shake, 5); } else if (e.fx === 'snipeFull') ring(e.x, e.y, 84, pal.ring, .22, 16); }
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
      case 'cast': {
        const u = unitById(e.u); if (!u) return; const v = visOf(u), own = u === me, enemy = u.team !== me.team;
        if (enemy && !seesU(u)) return;
        if (enemy) v.spin = .5; // a quick half-turn tells you an enemy is casting
        if (!onScreen(u.x, u.y, 160)) return;
        const pal = palT(u.team), dx = e.dx || u.fx || 1, dy = e.dy || u.fy || 0;
        if (own) {
          // Crisp cast feedback: the coin kicks, a tight ring snaps out, a flash leaves the muzzle.
          v.squash = Math.max(v.squash, 1); ring(u.x, u.y, 74, pal.ring, .2);
          flash(u.x + dx * 40, u.y + dy * 40, 18, pal, 24);
          G.punch = Math.max(G.punch, .008);
          if (e.fx === 'slash') { slash(u.x, u.y, dx, dy, 160, pal.mid, .22); G.shake = Math.max(G.shake, 1.6); }
          else if (e.fx === 'stomp') { ring(u.x, u.y, 150, pal.ring, .36); dustRing(u.x, u.y, 90, 5); G.shake = Math.max(G.shake, 3); }
          else if (e.fx === 'dash') { dustAt(u.x, u.y, 22, .36, -dx * 60, -dy * 60); overlay(2, u.x, u.y, 18, .18, { spr: Art.speedLines(pal.lines, 1), r: 170, ink: null }); G.shake = Math.max(G.shake, 1.6); }
          else if (e.fx === 'deadeye') { ring(u.x, u.y, 120, pal.ring, .36, 18); overlay(2, u.x, u.y, 20, .26, { spr: Art.speedLines(pal.lines, 2), r: 220, ink: null }); G.shake = Math.max(G.shake, 4); G.punch = Math.max(G.punch, .03); }
          else if (e.fx === 'dome') ring(u.x, u.y, 120, pal.ring, .4);
          else if (e.fx === 'parry') ring(u.x, u.y, 90, pal.ring, .3);
        } else if (e.fx === 'slash') slash(u.x, u.y, dx, dy, 150, enemy ? '#ff6a4a' : pal.mid, .16);
        break;
      }
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
      case 'atk': case 'matk': {
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

  return { FX: { reset, spark, puff, dust, drawDust, coins, ring, slash, ghost, ghostLine, corpse, shatter, leaves, splash, rise, popCoin, chips, pillar, burst, draw, projectiles, telegraphs, danger, textLayer, tickWarn, towerFall, finale }, fxEvent };
})();
