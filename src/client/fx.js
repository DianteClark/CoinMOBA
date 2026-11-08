// Particles, projectiles, telegraphs, aim indicators and the event-to-effect mapping.
// Everything private lives in the closure below; only FX, FX_CAP and fxEvent are shared.
const FX_CAP = q => q >= 2 ? 320 : q === 1 ? 170 : 70;
const { FX, fxEvent } = (() => {
  // Energy by caster: heroes clean white-gold, villains sickly green-violet, neutrals molten.
  const HERO = { out: '#ffb400', mid: '#ffe65a', core: '#ffffff', spark: '#ffe65a', spark2: '#ffffff', chip: '#ffd21a', ring: '#ffe65a', word: 'hero', zap: 'zap', dots: '#ffe14a', lines: '#ffffff', imp: '#ffe14a', imp2: '#ffffff', aim: '255,226,70' };
  const VILL = { out: '#7a1fd6', mid: '#a6ff2a', core: '#efffb0', spark: '#b6ff3a', spark2: '#c77bff', chip: '#8a2ae0', ring: '#a6ff2a', word: 'vill', zap: 'hex', dots: '#a6ff2a', lines: '#e6ffa0', imp: '#8a2ae0', imp2: '#d8ff5a', aim: '166,255,42' };
  const NEUT = { out: '#ff5a14', mid: '#ffb02a', core: '#fff0b0', spark: '#ffb02a', spark2: '#ffe08a', chip: '#ff7a1a', ring: '#ff9a1f', word: 'neut', zap: 'neut', dots: '#ff9a1f', lines: '#ffe08a', imp: '#ff5a14', imp2: '#ffe08a', aim: '255,150,40' };
  const palT = t => t === 0 ? HERO : t === 1 ? VILL : NEUT;
  const GOLD = '#ffd777', SPARKY = '#fff0c8', INK = Art.INK, HEAL = '#b6f5a8';
  const SPARK = 0, PUFF = 1, SHARD = 2, COIN = 3, RING = 4, SLASH = 5, GHOST = 6, LEAF = 7, RISE = 8, DROP = 9, DISC = 10, CIV = 11, CHIP = 12, PILLAR = 13;
  const LEAVES = ['#7fb36a', '#4f8f5e', '#c9a24a'];
  // which kits make which area blast, for working out a blast's side when the event doesn't say
  const BOOM_KIT = { crash: ['kade', 'gravel'], stomp: ['gravel'], rupture: ['ione'], break: ['ione'], heal: ['solenne'] };
  const PHIT_KIT = { snipe: ['vesper'], snipeFull: ['vesper'], deadeye: ['vesper'], orb: ['ione'], ray: ['solenne'], chain: ['gravel'] };
  const KIT_WORDS = {
    vesper: ['CRACK!', 'ZING!', 'BLAM!', 'KRAK!'], kade: ['SHING!', 'CLANG!', 'SLASH!', 'KRAK!'], ione: ['ZAP!', 'FZZT!', 'ZWOOSH!', 'ZAP!'],
    solenne: ['FWOOM!', 'SIZZLE!', 'ZAP!'], sable: ['SHNK!', 'SWIP!', 'KRAK!', 'SLICE!'], gravel: ['WHAM!', 'KRUNCH!', 'THUD!', 'BOOM!'],
  };
  const ENERGY = { ione: 1, solenne: 1 };
  const CRIT_WORDS = ['POW!', 'BAM!', 'WHAM!'], BEAST_WORDS = ['CHOMP!', 'SMASH!', 'RAWR!'];
  const BOOM_WORDS = { crash: 'KA-BOOM!', stomp: 'WHOMP!', rupture: 'FWOOM!', break: 'SHATTER!' };
  const PHIT_WORDS = { deadeye: 'KA-BLAM!', snipeFull: 'KRAK!', snipe: 'CRACK!', orb: 'ZAP!', ray: 'SIZZLE!', chain: 'CLINK!' };

  let P = [], cursor = 0, trails = new Map(), flyers = [], frameId = 0, OV = [], words = [], panel = null, readyFx = [], lastAny = -9, lastMine = -9, lastKill = -9, lastBig = -9, prevCd = [], zoneTeam = new Map();
  const lastOn = new Map();
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

  const coinSp = () => Art.coin('fxgold', 16, null, ['#ffd21a', '#b8701a'], -1, -1);
  const minionBolt = team => Art.coin('fxm' + team, 16, null, team === 1 ? ['#b6ff3a', '#7a1fd6'] : ['#ffe65a', '#2348ff'], -1, -1);
  const towerSp = team => Art.coin('fxt' + team, 30, 'boss', team === 1 ? ['#ff8a4a', '#7e2a1e'] : ['#7fc0ff', '#1d3fe6'], team, -1);

  const linkC = [null, null, null];
  function link(team) {
    const k = team === 0 ? 0 : team === 1 ? 1 : 2; if (linkC[k]) return linkC[k];
    const c = Art.cv(20, 12), g = c.getContext('2d'), p = palT(team);
    g.strokeStyle = INK; g.lineWidth = 5; g.beginPath(); g.ellipse(10, 6, 7, 3.4, 0, 0, TAU); g.stroke();
    g.strokeStyle = p.mid; g.lineWidth = 2.6; g.beginPath(); g.ellipse(10, 6, 7, 3.4, 0, 0, TAU); g.stroke();
    return linkC[k] = c;
  }

  function reset() { P = []; cursor = 0; trails = new Map(); flyers = []; OV = []; words = []; panel = null; readyFx = []; prevCd = []; zoneTeam = new Map(); lastOn.clear(); lastAny = lastMine = lastKill = lastBig = -9; G.text = []; G.tAim = null; }

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
  const dust = (x, y, k = 1) => puff(x, y, 2, 0, 9 * k, .36, 2, 34);
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
  function ghostLine(spr, R, x0, y0, x1, y1) { const n = Math.min(6, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 70)); for (let i = 0; i < n; i++) { const f = i / n; ghost(spr, R, lerp(x0, x1, f), lerp(y0, y1, f), 14, .22 + f * .22); } }
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
    p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; p.vz = rnd(260, 420); p.vr = rnd(10, 18); p.ph = Math.random() * TAU; p.size = 20; p.bounce = 1; p.spr = Art.discSprite(team, 34); p.flip = true;
    spark(x, y, 6, GOLD, 170, .32, 9, z);
    coins(x, y, 2, { z, sp: 150, vz: 360, size: 8, life: .8 });
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
    const me = G.me, x0 = sx(me.x), y0 = sy(me.y) - 40 * Z, n = Math.min(8, 2 + Math.ceil(amount / 40));
    for (let i = 0; i < n; i++) flyers.push({ x0: x0 + rnd(-22, 22), y0: y0 + rnd(-14, 14), mx: rnd(-46, 46), my: rnd(-74, -26), t: -i * .05, dur: rnd(.5, .68), ph: Math.random() * TAU });
  }
  function number(x, y, z, s, col, big, life = .8) {
    if (G.text.length > 26) G.text.shift();
    G.text.push({ x: x + rnd(-16, 16), y, z, s, col, big, t: life, max: life });
  }

  // ---------- comic overlays, drawn over the colour grade so they stay at full punch ----------
  const OV_CAP = () => quality >= 2 ? 16 : quality === 1 ? 9 : 5;
  const WORD_CAP = () => quality >= 2 ? 6 : quality === 1 ? 4 : 2;
  function overlay(kind, x, y, z, life, o) { if (OV.length >= OV_CAP()) OV.shift(); OV.push(Object.assign({ kind, x, y, z, t: 0, life, rot: Math.random() * TAU }, o)); }
  // A heavy beat: starburst, halftone ring and radial speed lines together. `k` scales the whole thing.
  function burst(x, y, z, pal, k = 1, lines = true) {
    overlay(0, x, y, z, .15, { spr: Art.impact(pal.imp, pal.imp2, 1 + (Math.random() * 3 | 0)), r: 74 * k });
    if (quality >= 1 || k >= 1.4) overlay(1, x, y, z, .3, { spr: Art.halftone(pal.dots), r: 130 * k });
    if (lines && (quality >= 1 || k >= 1.4)) overlay(2, x, y, z, .24, { spr: Art.speedLines(pal.lines, 1 + (Math.random() * 3 | 0)), r: 190 * k, ink: Art.speedLines(INK, 2) });
  }
  // Word pops are rate-limited globally, per target, and by how much the player cares.
  function wordAt(x, y, z, text, style, o = {}) {
    if (G.me.alive && Math.hypot(x - G.me.x, y - G.me.y) < 130) { y -= 120; x += G.me.x <= x ? 90 : -90; } // never cover your own coin
    const t = G.t, mine = !!o.mine, force = !!o.force;
    if (!force) {
      if (mine ? t - lastMine < .13 : t - lastAny < .5) return false;
      if (o.key !== undefined) { const l = lastOn.get(o.key); if (l !== undefined && t - l < (mine ? .2 : .6)) return false; lastOn.set(o.key, t); if (lastOn.size > 60) lastOn.clear(); }
    } else if (t - lastBig < .16) return false;
    if (words.length >= WORD_CAP()) { if (!mine && !force) return false; words.shift(); }
    lastAny = t; if (mine) lastMine = t; if (force) lastBig = t;
    const spr = Art.word(text, style, 1 + (Math.random() * 3 | 0), o.burst !== false);
    words.push({ x: x + rnd(-14, 14), y: y + rnd(-6, 6), z, spr, t: 0, life: o.life || .62, H: o.size || (mine ? 74 : 56), rot: rnd(-.14, .14) });
    return true;
  }

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
      if (f.t >= f.dur) { flyers[i] = flyers[flyers.length - 1]; flyers.pop(); G.goldBump = 1; }
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
          ctx.globalAlpha = Math.min(1, f * 3); ctx.setTransform(dpr * ux, dpr * uy, -dpr * uy, dpr * ux, dpr * X, dpr * Y); ctx.drawImage(sp, -len, -w, len * 2, w * 2); resetT(); break;
        }
        case PUFF: {
          const pop = f < .3 ? f / .3 : 1, r = p.size * Z * (.75 + outCub(e) * .95) * pop, c = Math.cos(p.rot) * r, sn = Math.sin(p.rot) * r;
          ctx.globalAlpha = .95; ctx.setTransform(dpr * c, dpr * sn * .72, -dpr * sn, dpr * c * .72, dpr * X, dpr * Y); ctx.drawImage(Art.dustCel(p.ph, p.v), -1, -1, 2, 2); resetT(); break;
        }
        case COIN: { const sp = coinSp(), r = p.size * Z, c = Math.max(.14, Math.abs(Math.cos(p.ph))); ctx.globalAlpha = Math.min(1, f * 3); ctx.drawImage(sp.c, X - r * c * 1.2, Y - r * 1.2, 2.4 * r * c, 2.4 * r); break; }
        case CHIP: { const s = p.size * Z * 15, c = Math.cos(p.rot) * s, sn = Math.sin(p.rot) * s; ctx.globalAlpha = Math.min(1, f * 4); ctx.setTransform(dpr * c, dpr * sn, -dpr * sn, dpr * c, dpr * X, dpr * Y); ctx.drawImage(Art.chip(p.col, p.v), -.5, -.5, 1, 1); resetT(); break; }
        case SHARD: { const s = p.size * Z, w = p.spr.width * s, c = Math.cos(p.rot), sn = Math.sin(p.rot); ctx.globalAlpha = Math.min(1, f * 3); ctx.setTransform(dpr * c, dpr * sn, -dpr * sn, dpr * c, dpr * X, dpr * Y); ctx.drawImage(p.spr, -w / 2 - p.dx * Z, -w / 2 - p.dy * Z, w, w); resetT(); break; }
        case LEAF: { const c = Math.cos(p.rot) * p.size * Z, sn = Math.sin(p.rot) * p.size * Z; ctx.globalAlpha = Math.min(1, f * 4); ctx.setTransform(dpr * c, dpr * sn, -dpr * sn, dpr * c, dpr * X, dpr * Y); ctx.drawImage(p.spr, -8, -5); resetT(); break; }
        case GHOST: { const sp = p.spr, w = (p.R * Z) / sp.R * sp.S, c = Math.max(.12, Math.abs(p.ph)); ctx.globalAlpha = p.alpha * f; ctx.drawImage(sp.c, X - w * c / 2, Y - w * .42, w * c, w * .84); break; }
        case CIV: { const sp = p.spr, w = p.size * Z / sp.R * sp.S; ctx.globalAlpha = Math.min(1, f * 3.5); ctx.drawImage(Art.shadow(), X - w * .4, sy(p.y) - w * .18, w * .8, w * .36); ctx.drawImage(sp.c, X - w / 2, Y - w * .46, w, w * .92); break; }
        case DISC: { const d = p.spr, k = Z, w = d.c.width * k, h = d.c.height * k, c = Math.max(.2, Math.abs(Math.cos(p.ph))); ctx.globalAlpha = Math.min(1, f * 3); ctx.drawImage(d.c, X - w * c / 2, Y - h / 2, w * c, h); break; }
        case RING: {
          const R = p.R * Z * (.22 + .85 * outExpo(e)), lw = (2 + f * f * 11) * Z, Ry = R * TILT;
          if (quality >= 1) { ctx.strokeStyle = INK; ctx.globalAlpha = Math.min(1, f * 1.6) * .85; ctx.lineWidth = lw + 4; ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, 0, TAU); ctx.stroke(); }
          ctx.strokeStyle = p.col; ctx.globalAlpha = Math.min(1, f * 2.2); ctx.lineWidth = lw; ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, 0, TAU); ctx.stroke(); break;
        }
        case SLASH: {
          const an = Math.atan2(p.dy, p.dx), R = p.R * Z * (.72 + .28 * outExpo(e)), sw = .95 * Math.min(1, e * 5 + .35), w = 26 * f * Z + 3;
          ctx.save(); ctx.translate(X, Y); ctx.scale(1, TILT); ctx.lineCap = 'round'; ctx.globalAlpha = Math.min(1, f * 2.4);
          for (const [c, lw] of [[INK, w + 7], [p.col, w], ['#ffffff', w * .42]]) { ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.beginPath(); ctx.arc(0, 0, R, an - sw, an + sw); ctx.stroke(); }
          ctx.restore(); break;
        }
        case PILLAR: {
          const h = 420 * Z, w = 96 * Z * (e < .14 ? outBack(e / .14) : e < .6 ? 1 : 1 - outCub((e - .6) / .4) * .92), yy = sy(p.y);
          ctx.globalAlpha = Math.min(1, f * 3); ctx.drawImage(p.spr, X - w / 2, yy - h, w, h); break;
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
  // [ribbon life, width, alpha]
  const TRAIL = { snipe: [.13, 15, .95], snipeFull: [.2, 26, 1], deadeye: [.32, 48, 1], orb: [.24, 36, .9], ray: [.1, 18, .85], bolt: [.15, 11, .85], mbolt: [.1, 7, .65], tower: [.22, 24, .9] };

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

  function trailFor(p, X, Y, Z0, dt) {
    const cfg = TRAIL[p.fx]; if (!cfg) return;
    let t = trails.get(p.id);
    if (!t) {
      const pal = palT(p.team), tw = p.fx === 'tower' && (p.team === 0 || p.team === 1);
      t = { pts: [], life: cfg[0], w: cfg[1], a: cfg[2], out: tw ? TEAM[p.team] : pal.out, mid: pal.mid, core: pal.core, fx: p.fx, team: p.team, seen: frameId, ox: p.x, oy: p.y }; trails.set(p.id, t);
    }
    t.seen = frameId; t.lx = X; t.ly = Y; t.at = G.t;
    if (dt > 0) t.pts.push({ x: X, y: Y, z: Z0, age: 0 });
    return t;
  }
  // Three hard layers per trail: ink, colour, then a hot core.
  function paintTrail(t, fade) {
    const a = t.a * fade;
    if (quality >= 2) ribbon(t, t.w * 1.35, INK, a * .6);
    ribbon(t, t.w, t.out, a);
    if (quality >= 1) ribbon(t, t.w * .62, t.mid, a);
    ctx.globalCompositeOperation = 'lighter'; ribbon(t, t.w * .26, t.core, a); ctx.globalCompositeOperation = 'source-over';
  }

  function projectiles(a, dt) {
    frameId++;
    const s = G.s;
    ctx.lineCap = 'round';
    for (const p of s.proj) {
      const x = lerp(p.px, p.x, a), y = lerp(p.py, p.y, a), vis = onScreen(x, y, 220);
      if (p.fx === 'chain') { if (vis) chain(p, x, y, a); continue; }
      let z = 26;
      if (p.homing && (p.fx === 'bolt' || p.fx === 'mbolt')) {
        const tg = p.target, rem = tg ? Math.hypot(tg.x - x, tg.y - y) : 0, t0 = trails.get(p.id), org = t0 ? Math.hypot(x - t0.ox, y - t0.oy) : 0, ft = org + rem > 1 ? org / (org + rem) : 0;
        z = 24 + Math.sin(ft * Math.PI) * 34;
      } else if (p.fx === 'tower') z = 52 - Math.min(1, p.age * 2) * 22;
      const t = trailFor(p, x, y, z, dt);
      if (!vis) continue;
      const X = sx(x), Y = sy(y) - z * Z;
      if (t) paintTrail(t, 1);
      head(p, x, y, X, Y, z, a);
    }
    // age trails; finish off those whose projectile has gone
    for (const [id, t] of trails) {
      for (const q of t.pts) q.age += dt;
      while (t.pts.length && t.pts[0].age > t.life) t.pts.shift();
      if (t.pts.length > 48) t.pts.splice(0, t.pts.length - 48);
      if (t.seen !== frameId) {
        if (!t.pts.length) { trails.delete(id); continue; }
        if (quality >= 1) paintTrail(t, .8);
      }
    }
  }

  // layered disc with an ink edge
  const blob = (X, Y, r, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X, Y, r, 0, TAU); ctx.fill(); };
  function head(p, x, y, X, Y, z, a) {
    const pal = palT(p.team), glow = Art.glow;
    const v = p.homing ? null : [p.vx, p.vy * TILT], l = v ? Math.hypot(v[0], v[1]) || 1 : 1, ux = v ? v[0] / l : 1, uy = v ? v[1] / l : 0;
    const add_ = () => ctx.globalCompositeOperation = 'lighter', norm_ = () => ctx.globalCompositeOperation = 'source-over';
    const lance = (L, w) => { ctx.lineCap = 'butt'; for (const [c, k] of [[INK, 1.7], [pal.out, 1.15], [pal.mid, .7], [pal.core, .3]]) { ctx.strokeStyle = c; ctx.lineWidth = w * k; ctx.beginPath(); ctx.moveTo(X - ux * L, Y - uy * L); ctx.lineTo(X + ux * w * .9, Y + uy * w * .9); ctx.stroke(); } ctx.lineCap = 'round'; };
    switch (p.fx) {
      case 'bolt': case 'mbolt': {
        const big = p.fx === 'bolt', sp = big ? coinSp() : minionBolt(p.team), R = (big ? 11 : 8) * Z, c = Math.max(.2, Math.abs(Math.cos(p.age * 26)));
        blob(X, Y, R * 1.25, INK); blob(X, Y, R * 1.05, big ? pal.mid : pal.out);
        ctx.drawImage(sp.c, X - R * c, Y - R, 2 * R * c, 2 * R); break;
      }
      case 'tower': {
        const c = TEAM[p.team] || pal.out, R = 16 * Z, pul = 1 + Math.sin(p.age * 40) * .12;
        add_(); const g = 34 * Z * pul; ctx.globalAlpha = .9; ctx.drawImage(glow(c), X - g, Y - g, g * 2, g * 2); ctx.globalAlpha = 1; norm_();
        blob(X, Y, R * 1.15, INK); blob(X, Y, R * .98, c); blob(X - R * .18, Y - R * .22, R * .55, '#ffffff'); break;
      }
      case 'snipe': case 'snipeFull': {
        const full = p.fx === 'snipeFull', w = (full ? 13 : 8) * Z, L = (full ? 190 : 120) * Z; lance(L, w);
        add_(); const g = (full ? 30 : 18) * Z; ctx.globalAlpha = .95; ctx.drawImage(glow(pal.mid), X - g, Y - g, g * 2, g * 2); ctx.globalAlpha = 1; norm_();
        ctx.setTransform(dpr * ux, dpr * uy, -dpr * uy, dpr * ux, dpr * X, dpr * Y);
        ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(w * 2.6, 0); ctx.lineTo(-w * .5, w * 1.1); ctx.lineTo(-w * .5, -w * 1.1); ctx.closePath(); ctx.fill();
        ctx.fillStyle = pal.core; ctx.beginPath(); ctx.moveTo(w * 1.9, 0); ctx.lineTo(-w * .2, w * .6); ctx.lineTo(-w * .2, -w * .6); ctx.closePath(); ctx.fill();
        resetT(); break;
      }
      case 'deadeye': {
        add_(); const g = 62 * Z; ctx.globalAlpha = .95; ctx.drawImage(glow(pal.mid), X - g, Y - g, g * 2, g * 2); ctx.globalAlpha = 1; norm_();
        ctx.setTransform(dpr * ux, dpr * uy, -dpr * uy, dpr * ux, dpr * X, dpr * Y);
        const t = G.t * 26 % 1;
        for (let i = 0; i < 3; i++) { const xx = (-38 - i * 30 + t * 30) * Z; ctx.strokeStyle = i % 2 ? pal.core : pal.mid; ctx.lineWidth = 6 * Z; ctx.beginPath(); ctx.moveTo(xx - 12 * Z, -26 * Z); ctx.lineTo(xx + 10 * Z, 0); ctx.lineTo(xx - 12 * Z, 26 * Z); ctx.stroke(); }
        ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(40 * Z, 0); ctx.lineTo(-24 * Z, 18 * Z); ctx.lineTo(-40 * Z, 0); ctx.lineTo(-24 * Z, -18 * Z); ctx.closePath(); ctx.fill();
        ctx.fillStyle = pal.out; ctx.beginPath(); ctx.moveTo(33 * Z, 0); ctx.lineTo(-22 * Z, 13 * Z); ctx.lineTo(-33 * Z, 0); ctx.lineTo(-22 * Z, -13 * Z); ctx.closePath(); ctx.fill();
        ctx.fillStyle = pal.core; ctx.beginPath(); ctx.moveTo(26 * Z, 0); ctx.lineTo(-14 * Z, 6 * Z); ctx.lineTo(-20 * Z, 0); ctx.lineTo(-14 * Z, -6 * Z); ctx.closePath(); ctx.fill();
        resetT(); break;
      }
      case 'orb': {
        const t = p.age * 11, R = 21 * Z * (1 + Math.sin(p.age * 30) * .06);
        add_(); const g = 46 * Z; ctx.globalAlpha = .9; ctx.drawImage(glow(pal.mid), X - g, Y - g, g * 2, g * 2); ctx.globalAlpha = 1; norm_();
        blob(X, Y, R * 1.16, INK); blob(X, Y, R, pal.out); blob(X - R * .1, Y - R * .12, R * .68, pal.mid); blob(X - R * .24, Y - R * .3, R * .3, pal.core);
        ctx.strokeStyle = pal.core; ctx.lineWidth = 3 * Z; ctx.beginPath(); ctx.ellipse(X, Y, R * 1.55, R * .72, t * .4, t, t + 3.8); ctx.stroke();
        for (let i = 0; i < 3; i++) { const an = t + i * TAU / 3, ox = Math.cos(an) * 34 * Z, oy = Math.sin(an) * 19 * Z, r = 6 * Z; blob(X + ox, Y + oy, r * 1.3, INK); blob(X + ox, Y + oy, r, pal.mid); }
        break;
      }
      case 'ray': {
        const o = p.owner, ox = sx(lerp(o.px, o.x, a)), oy = sy(lerp(o.py, o.y, a)) - 26 * Z, pul = 1 + Math.sin(G.t * 50) * .14; ctx.lineCap = 'round';
        for (const [c, w] of [[INK, 25], [pal.out, 19], [pal.mid, 11], [pal.core, 4.5]]) { ctx.strokeStyle = c; ctx.lineWidth = w * Z * pul; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(X, Y); ctx.stroke(); }
        if (quality >= 1) { const dx = X - ox, dy = Y - oy, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d, n = Math.min(10, d / (46 * Z) | 0); ctx.strokeStyle = pal.core; ctx.lineWidth = 3 * Z; ctx.beginPath(); ctx.moveTo(ox, oy); for (let i = 1; i <= n; i++) { const f = i / n, j = (i < n ? (Math.random() - .5) * 26 * Z : 0); ctx.lineTo(ox + dx * f + nx * j, oy + dy * f + ny * j); } ctx.stroke(); }
        blob(X, Y, 22 * Z, INK); blob(X, Y, 17 * Z, pal.mid); blob(X, Y, 9 * Z, pal.core); break;
      }
      default: { add_(); const g = (p.w || 30) * Z; ctx.drawImage(glow(pal.mid), X - g, Y - g, g * 2, g * 2); norm_(); }
    }
  }

  function chain(p, x, y, a) {
    const o = p.owner, ax = sx(lerp(o.px, o.x, a)), ay = sy(lerp(o.py, o.y, a)) - 24 * Z, X = sx(x), Y = sy(y) - 24 * Z, dx = X - ax, dy = Y - ay, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, pal = palT(p.team);
    const sp = link(p.team), step = 13 * Z, n = Math.min(70, Math.floor(d / step)), s = Z * 1.25;
    for (let i = 0; i <= n; i++) {
      const X0 = ax + ux * i * step, Y0 = ay + uy * i * step, odd = i % 2, cs = odd ? -uy : ux, sn = odd ? ux : uy, sw = odd ? .55 : 1;
      ctx.setTransform(dpr * cs * s * sw, dpr * sn * s * sw, -dpr * sn * s, dpr * cs * s, dpr * X0, dpr * Y0);
      ctx.drawImage(sp, -10, -6);
    }
    ctx.setTransform(dpr * ux * Z * 1.3, dpr * uy * Z * 1.3, -dpr * uy * Z * 1.3, dpr * ux * Z * 1.3, dpr * X, dpr * Y);
    const hook = () => { ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(10, 0); ctx.arc(10, 11, 11, -Math.PI / 2, 1.0, false); ctx.lineTo(12, 22); ctx.stroke(); };
    ctx.lineCap = 'round'; ctx.strokeStyle = INK; ctx.lineWidth = 10; hook();
    ctx.strokeStyle = pal.mid; ctx.lineWidth = 5; hook();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(8, 27); ctx.lineTo(27, 13); ctx.lineTo(21, 30); ctx.closePath(); ctx.fill();
    ctx.fillStyle = pal.mid; ctx.beginPath(); ctx.moveTo(11, 25); ctx.lineTo(23, 16); ctx.lineTo(19, 26); ctx.closePath(); ctx.fill();
    resetT();
  }

  // ---------- telegraphs ----------
  const INK_A = a => `rgba(20,10,30,${Math.min(.9, a)})`;
  function dashed(on, gap, speed) { ctx.setLineDash([on, gap]); ctx.lineDashOffset = -G.t * speed; }
  const undash = () => { ctx.setLineDash([]); ctx.lineDashOffset = 0; };

  function chevrons(X, Y, ux, uy, L, hw, col, alpha) {
    const gap = Math.max(34 * Z, 22), n = Math.min(14, Math.floor(L / gap)), ph = (G.t * 2.6) % 1, h = Math.min(hw * .72, 22 * Z), d = h * .55;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      ctx.strokeStyle = pass ? `rgba(${col},${alpha})` : INK_A(alpha * .8); ctx.lineWidth = (pass ? 3.2 : 6.2) * Math.max(.7, Z); ctx.beginPath();
      for (let i = 0; i < n; i++) { const s = (i + ph) * gap; if (s > L - d) continue; const x = X + ux * s, y = Y + uy * s; ctx.moveTo(x - ux * d - uy * h, y - uy * d + ux * h); ctx.lineTo(x + ux * d * .4, y + uy * d * .4); ctx.lineTo(x - ux * d + uy * h, y - uy * d - ux * h); }
      ctx.stroke();
    }
  }
  function lineShape(x, y, dx, dy, len, w, col, alpha, f, arrow, enemy) {
    const X = sx(x), Y = sy(y), EX = sx(x + dx * len), EY = sy(y + dy * len), px = -(EY - Y), py = EX - X, l = Math.hypot(px, py) || 1, hw = w / 2 * Z, nx = px / l * hw, ny = py / l * hw, ux = (EX - X) / l, uy = (EY - Y) / l;
    const path = () => { ctx.beginPath(); ctx.moveTo(X + nx, Y + ny); ctx.lineTo(EX + nx, EY + ny); ctx.lineTo(EX - nx, EY - ny); ctx.lineTo(X - nx, Y - ny); ctx.closePath(); };
    ctx.fillStyle = `rgba(${col},${alpha * (enemy ? .3 : .22)})`; path(); ctx.fill();
    if (f !== undefined) { const FX_ = X + (EX - X) * f, FY = Y + (EY - Y) * f; ctx.fillStyle = `rgba(${col},${alpha * .6})`; ctx.beginPath(); ctx.moveTo(X + nx, Y + ny); ctx.lineTo(FX_ + nx, FY + ny); ctx.lineTo(FX_ - nx, FY - ny); ctx.lineTo(X - nx, Y - ny); ctx.closePath(); ctx.fill(); }
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK_A(alpha); ctx.lineWidth = enemy ? 7 : 5.6; path(); ctx.stroke();
    ctx.strokeStyle = `rgba(${col},${Math.min(1, alpha + .1)})`; ctx.lineWidth = enemy ? 4 : 3.2; dashed(13 * Z + 3, 8 * Z + 3, enemy ? 110 : 76); path(); ctx.stroke(); undash();
    chevrons(X, Y, ux, uy, l, hw, col, alpha);
    if (arrow) {
      const a = Math.min(34 * Z, Math.max(hw * 1.25, 18 * Z)), b = a * 1.25, tip = (s, wd, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(EX + ux * b * s, EY + uy * b * s); ctx.lineTo(EX - uy * wd, EY + ux * wd); ctx.lineTo(EX + uy * wd, EY - ux * wd); ctx.closePath(); ctx.fill(); };
      tip(1.25, a * 1.25, INK_A(alpha)); tip(1, a, `rgba(${col},${Math.min(1, alpha + .15)})`);
    }
  }
  function circleShape(x, y, r, col, alpha, f, enemy) {
    const X = sx(x), Y = sy(y), R = r * Z, Ry = R * TILT;
    ctx.fillStyle = `rgba(${col},${alpha * (enemy ? .26 : .18)})`; ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, 0, TAU); ctx.fill();
    if (f !== undefined) {
      const k = enemy ? outCub(f) : f;
      ctx.fillStyle = `rgba(${col},${alpha * .55})`; ctx.beginPath(); ctx.ellipse(X, Y, R * k, Ry * k, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(${col},${Math.min(1, alpha + .2)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(X, Y, R * k, Ry * k, 0, 0, TAU); ctx.stroke();
    }
    ctx.strokeStyle = INK_A(alpha); ctx.lineWidth = enemy ? 7 : 5.6; ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = `rgba(${col},${Math.min(1, alpha + .1)})`; ctx.lineWidth = enemy ? 4 : 3.2; dashed(13 * Z + 3, 8 * Z + 3, enemy ? 90 : 60); ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, 0, TAU); ctx.stroke(); undash();
    if (enemy && R > 34) { const spr = Art.word('!', 'pain', 2, false), k = (.9 + Math.sin(G.t * 12) * .12), h = Math.min(58, R * .9) * k, w = spr.w / spr.h * h; ctx.globalAlpha = Math.min(1, alpha + .2); ctx.drawImage(spr.c, X - w / 2, Y - h / 2, w, h); ctx.globalAlpha = 1; }
  }
  function rangeRing(x, y, r, col, alpha) {
    if (!r) return; ctx.strokeStyle = INK_A(alpha); ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(sx(x), sy(y), r * Z, r * Z * TILT, 0, 0, TAU); ctx.stroke();
    ctx.strokeStyle = `rgba(${col},${Math.min(1, alpha + .35)})`; ctx.lineWidth = 2; ctx.setLineDash([9 * Z + 3, 8 * Z + 3]); ctx.lineDashOffset = -G.t * 22; ctx.beginPath(); ctx.ellipse(sx(x), sy(y), r * Z, r * Z * TILT, 0, 0, TAU); ctx.stroke(); undash();
  }

  const ENEMY = '255,62,28';
  function telegraphs(a) {
    const s = G.s, me = G.me, pulse = .78 + Math.sin(G.t * 14) * .22;
    for (const z of s.zones) {
      zoneTeam.set(z.x + '|' + z.y, z.team); if (zoneTeam.size > 40) { const k = zoneTeam.keys().next().value; zoneTeam.delete(k); }
      if (!onScreen(z.x, z.y, z.r * Z + 60)) continue;
      const friendly = z.team === me.team, pal = palT(z.team);
      if (z.kind === 'dome') {
        const X = sx(z.x), Y = sy(z.y), R = z.r * Z, Ry = R * TILT, sp = Art.halftone(pal.dots);
        ctx.fillStyle = z.team === 1 ? 'rgba(122,31,214,.2)' : 'rgba(255,226,70,.2)'; ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = .55; ctx.drawImage(sp, X - R, Y - Ry, R * 2, Ry * 2); ctx.globalAlpha = 1;
        ctx.strokeStyle = INK_A(.85); ctx.lineWidth = 7; ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, 0, TAU); ctx.stroke();
        ctx.strokeStyle = pal.mid; ctx.lineWidth = 4; dashed(16 * Z + 3, 6 * Z + 3, 40); ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, 0, TAU); ctx.stroke(); undash();
      } else {
        const col = z.fx === 'heal' ? '255,230,120' : friendly ? pal.aim : ENEMY, f = 1 - z.t / z.total;
        circleShape(z.x, z.y, z.r, col, friendly ? .92 : Math.min(1, pulse + .1), f, !friendly);
      }
    }
    for (const c of s.champs) {
      if (!c.alive || !Sim.canSee(s, me.team, c)) continue;
      const fr = c.team === me.team, col = fr ? palT(c.team).aim : ENEMY, alpha = fr ? .8 : Math.min(1, pulse + .08), q = pos(c, a);
      if (c.chan && c.chan.kind === 'line') lineShape(q.x, q.y, c.chan.dx, c.chan.dy, c.chan.len, c.chan.w, col, alpha, 1 - c.chan.t / c.chan.total, true, !fr);
      if (c.charge && !(c === me && Ctl.aim)) {
        const ab = c.kit[c.charge.slot] || {}, f = Math.min(1, c.charge.t / (ab.charge || 1.1)), mn = ab.minRange || 0, len = mn + ((ab.range || 700) - mn) * f;
        lineShape(q.x, q.y, c.charge.dx, c.charge.dy, len, ab.w || 30, col, alpha, f, true, !fr);
      }
    }
    const held = Ctl.atk !== null && Ctl.atk !== undefined && Ctl.atk !== false;
    if (held && me.alive) { const q = pos(me, a); rangeRing(q.x, q.y, me.range, palT(me.team).aim, .28); }
    if (Ctl.aim && me.alive) ownAim(a);
    towerWarning(a);
  }

  function ownAim(a) {
    const A = Ctl.aim, me = G.me, ab = me.kit[A.slot]; if (!ab) return;
    const ad = aimDir() || { dx: me.fx, dy: me.fy, target: null };
    const drag = Math.hypot(A.dx, A.dy), cancel = !!A.cancelHot || (A.moved && drag < 16), p = pos(me, a), pal = palT(me.team);
    const col = cancel ? '255,108,88' : pal.aim, alpha = cancel ? .6 : 1;
    const dx = ad.dx, dy = ad.dy;
    rangeRing(p.x, p.y, ab.range || ab.r || 0, col, cancel ? .4 : .4);
    if (!A.moved && ad.target) {
      const t = ad.target, q = pos(t, a), X = sx(q.x), Y = sy(q.y), R = (drawR(t) + 16 + Math.sin(G.t * 9) * 4) * Z, Ry = R * TILT, rot = G.t * 3;
      ctx.lineCap = 'round';
      for (let pass = 0; pass < 2; pass++) { ctx.strokeStyle = pass ? `rgb(${col})` : INK_A(.9); ctx.lineWidth = pass ? 3.4 : 6.5; ctx.beginPath(); for (let i = 0; i < 4; i++) { const a0 = rot + i * TAU / 4, a1 = a0 + .9; ctx.moveTo(X + Math.cos(a0) * R, Y + Math.sin(a0) * Ry); ctx.ellipse(X, Y, R, Ry, 0, a0, a1); } ctx.stroke(); }
    }
    if (ab.shape === 'line' || ab.shape === 'dash') {
      let len = ab.range || 400; if (ab.charge && me.charge) { const f = Math.min(1, me.charge.t / ab.charge), mn = ab.minRange || 0; len = mn + ((ab.range || 700) - mn) * f; }
      lineShape(p.x, p.y, dx, dy, len, ab.w || 40, col, alpha, undefined, true, false);
    } else if (ab.shape === 'circle') {
      circleShape(ad.tx === undefined ? p.x + dx * (ab.range || 0) * .7 : ad.tx, ad.ty === undefined ? p.y + dy * (ab.range || 0) * .7 : ad.ty, ab.r || 80, col, alpha, undefined, false);
    } else if (ab.shape === 'cone') {
      const an = Math.atan2(dy, dx), R = (ab.range || 300) * Z;
      ctx.save(); ctx.translate(sx(p.x), sy(p.y)); ctx.scale(1, TILT); ctx.lineJoin = 'round';
      const path = () => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, an - .76, an + .76); ctx.closePath(); };
      ctx.fillStyle = `rgba(${col},.3)`; path(); ctx.fill();
      ctx.strokeStyle = INK_A(.9); ctx.lineWidth = 5.6; path(); ctx.stroke();
      ctx.strokeStyle = `rgb(${col})`; ctx.lineWidth = 3.2; dashed(13 * Z + 3, 8 * Z + 3, 76); path(); ctx.stroke(); undash(); ctx.restore();
    }
  }

  function towerWarning(a) {
    const w = G.tAim; if (!w) return;
    const t = unitById(w.id), me = G.me;
    if (!t || !t.alive || !me.alive || Math.hypot(t.x - me.x, t.y - me.y) > (t.range || 400) + 40) { G.tAim = null; return; }
    const q = pos(me, a), H = t.sub === 'core' ? 150 : 104, x0 = sx(t.x), y0 = sy(t.y) - H * Z, x1 = sx(q.x), y1 = sy(q.y) - 22 * Z, pulse = .55 + Math.sin(G.t * 18) * .45;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = INK_A(.8); ctx.lineWidth = 11 * Z; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = `rgba(${ENEMY},${.6 + pulse * .35})`; ctx.lineWidth = 6.5 * Z; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = '#fff3c0'; ctx.lineWidth = 2.4; dashed(14, 10, 220); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); undash(); ctx.lineCap = 'round';
    const R = (44 + pulse * 6) * Z; ctx.strokeStyle = INK_A(.85); ctx.lineWidth = 7; ctx.beginPath(); ctx.ellipse(sx(q.x), sy(q.y), R, R * TILT, 0, 0, TAU); ctx.stroke(); ctx.strokeStyle = `rgba(${ENEMY},1)`; ctx.lineWidth = 3.6; ctx.beginPath(); ctx.ellipse(sx(q.x), sy(q.y), R, R * TILT, 0, 0, TAU); ctx.stroke();
  }

  // ---------- kill splash: a short comic panel with both coins ----------
  let panelC = null;
  const PW = 430, PH = 104;
  function buildPanel(killer, victim, word, leftPal, rightPal) {
    if (!panelC) panelC = Art.cv(PW * 2, PH * 2);
    const g = panelC.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, PW * 2, PH * 2); g.scale(2, 2); g.lineJoin = 'round';
    const shape = (g2) => { g2.beginPath(); g2.moveTo(30, 8); g2.lineTo(PW - 8, 4); g2.lineTo(PW - 30, PH - 8); g2.lineTo(8, PH - 4); g2.closePath(); };
    shape(g); g.fillStyle = INK; g.fill(); g.strokeStyle = INK; g.lineWidth = 8; g.stroke();
    g.save(); shape(g); g.clip();
    g.fillStyle = leftPal; g.fillRect(0, 0, PW, PH);
    g.fillStyle = rightPal; g.beginPath(); g.moveTo(PW * .62, 0); g.lineTo(PW, 0); g.lineTo(PW, PH); g.lineTo(PW * .46, PH); g.lineTo(PW * .54, PH * .62); g.lineTo(PW * .47, PH * .55); g.closePath(); g.fill();
    g.drawImage(Art.halftone('#ffffff'), -60, -80, 260, 260); g.drawImage(Art.halftone('#000000'), PW - 200, -70, 260, 260);
    g.restore();
    g.strokeStyle = '#ffffff'; g.lineWidth = 2.5; shape(g); g.stroke();
    const coin = (spr, x, r, rot) => { const w = spr.S * r / spr.R; g.save(); g.translate(x, PH / 2); g.rotate(rot); g.drawImage(spr.c, -w / 2, -w / 2, w, w); g.restore(); };
    if (killer) coin(killer, 74, 38, -.08);
    if (victim) coin(Art.koCoin(victim), PW - 74, 38, .1);
    const spr = Art.word(word, 'pain', 2, false), h = 62, w = spr.w / spr.h * h; g.drawImage(spr.c, PW / 2 - w / 2, PH / 2 - h / 2, w, h);
  }
  function killSplash(e, u, by, big) {
    const t = G.t, me = G.me; if (t - lastKill < .7) return; lastKill = t;
    const kSpr = by ? (spriteOf(by) || towerSp(by.team === 1 ? 1 : 0)) : null, vSpr = u ? spriteOf(u) : null, lP = by && by.team === 1 ? '#5c1eb0' : by && by.team === 0 ? '#2348ff' : '#a83f08', rP = u && u.team === 1 ? '#3fa014' : '#e0a20c';
    const word = e.u === me.id ? 'DOWN!' : by === me ? 'K.O.!' : 'KO!';
    buildPanel(kSpr, vSpr, word, lP, rP);
    panel = { t: 0, life: big ? .56 : .46 };
    if (big) { hitStop(.07); slowMo(.42, .3); overlay(2, e.x, e.y, 34, .3, { spr: Art.speedLines(palT(by ? by.team : -1).lines, 2), r: 460, ink: Art.speedLines(INK, 1) }); }
    else { hitStop(.03); slowMo(.2, .55); }
  }
  function drawPanel() {
    if (!panel) return;
    const a = panel.t / panel.life;
    if (a >= 1) { panel = null; return; }
    const inn = Math.min(1, a / .22), out = a > .78 ? (a - .78) / .22 : 0, k = (.72 + .28 * outBack(inn)) * (1 - outCub(out) * .1), x = VW / 2 + (1 - outExpo(inn)) * -VW * .55 + outCub(out) * VW * .5, y = Math.max(PH * .72, VH * .305), w = PW * k * Math.min(.86, VW / 640), h = PH * k * Math.min(.86, VW / 640);
    ctx.globalAlpha = 1 - outCub(out); ctx.drawImage(panelC, x - w / 2, y - h / 2, w, h); ctx.globalAlpha = 1;
  }

  // ---------- floating numbers and flying coins, drawn over the lighting ----------
  function textLayer(dt) {
    // bursts and speed lines behind the words
    for (let i = OV.length - 1; i >= 0; i--) { if ((OV[i].t += dt) >= OV[i].life) OV.splice(i, 1); }
    for (const o of OV) {
      const X = sx(o.x), Y = sy(o.y) - o.z * Z, a = o.t / o.life;
      if (o.kind === 0) { const r = o.r * Z * (.55 + outBack(Math.min(1, a * 1.6)) * .6), c = Math.cos(o.rot) * r, sn = Math.sin(o.rot) * r; ctx.globalAlpha = a > .55 ? (1 - a) / .45 : 1; ctx.setTransform(dpr * c, dpr * sn, -dpr * sn, dpr * c, dpr * X, dpr * Y); ctx.drawImage(o.spr, -1, -1, 2, 2); resetT(); }
      else if (o.kind === 1) { const r = o.r * Z * (.45 + outExpo(a) * .85); ctx.globalAlpha = (1 - a) * .9; ctx.drawImage(o.spr, X - r, Y - r * .86, r * 2, r * 1.72); }
      else {
        const r = o.r * Z * (.8 + outExpo(a) * .5), jit = (G.t * 30 | 0) % 7 * .9, c = Math.cos(o.rot + jit), sn = Math.sin(o.rot + jit);
        ctx.setTransform(dpr * c * r, dpr * sn * r, -dpr * sn * r, dpr * c * r, dpr * X, dpr * Y);
        ctx.globalAlpha = (1 - a) * .55; if (o.ink) ctx.drawImage(o.ink, -1.03, -1.03, 2.06, 2.06);
        ctx.globalAlpha = (1 - a) * .95; ctx.drawImage(o.spr, -1, -1, 2, 2); resetT();
      }
    }
    ctx.globalAlpha = 1;
    const list = G.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (let i = list.length - 1; i >= 0; i--) if ((list[i].t -= dt) <= 0) list.splice(i, 1);
    for (const t of list) {
      const f = t.t / t.max, age = 1 - f, grow = age < .14 ? .5 + outBack(age / .14) * .95 : age < .3 ? 1.45 - ((age - .14) / .16) * .45 : 1, size = (t.big ? 28 : 19) * grow;
      const X = sx(t.x), Y = sy(t.y) - (t.z + (1 - f * f) * 52) * Z;
      if (X < -60 || X > VW + 60) continue;
      ctx.font = `${size | 0}px ${Art.FONT}`; ctx.globalAlpha = Math.min(1, f * 3.4);
      ctx.lineWidth = t.big ? 6.5 : 5; ctx.strokeStyle = INK; ctx.strokeText(t.s, X + 1, Y + 1.5); ctx.fillStyle = t.col; ctx.fillText(t.s, X, Y);
    }
    ctx.globalAlpha = 1;
    // comic words on top of the numbers
    for (let i = words.length - 1; i >= 0; i--) if ((words[i].t += dt) >= words[i].life) words.splice(i, 1);
    for (const w of words) {
      const a = w.t / w.life, pop = a < .14 ? .3 + outBack(a / .14) * 1.02 : a < .26 ? 1.32 - (a - .14) / .12 * .32 : a > .76 ? 1 - (a - .76) / .24 * .22 : 1, hgt = w.H * pop, wdt = w.spr.w / w.spr.h * hgt;
      const X = Math.max(wdt * .36, Math.min(VW - wdt * .36, sx(w.x))), Y = Math.max(hgt * .42, Math.min(VH - hgt * .42, sy(w.y) - (w.z + a * a * 26) * Z)), rt = w.rot + (a < .14 ? (1 - a / .14) * -.28 : 0), c = Math.cos(rt), sn = Math.sin(rt);
      ctx.globalAlpha = a > .78 ? Math.max(0, (1 - a) / .22) : 1;
      ctx.setTransform(dpr * c, dpr * sn, -dpr * sn, dpr * c, dpr * X, dpr * Y); ctx.drawImage(w.spr.c, -wdt / 2, -hgt / 2, wdt, hgt); resetT();
    }
    ctx.globalAlpha = 1;
    if (panel) { panel.t += dt; drawPanel(); }
    const sp = coinSp(), A = G.goldAnchor || { x: 64, y: 58 };
    for (const f of flyers) {
      if (f.t < 0) continue;
      const k = clamp01(f.t / f.dur), e = k * k * (3 - 2 * k), up = Math.sin(k * Math.PI), X = lerp(f.x0, A.x, e) + f.mx * up, Y = lerp(f.y0, A.y, e) + f.my * up, r = 9 * (1 - k * .35), c = Math.max(.18, Math.abs(Math.cos(f.ph)));
      ctx.drawImage(sp.c, X - r * c * 1.2, Y - r * 1.2, r * c * 2.4, r * 2.4);
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

  // ---------- simulation events ----------
  function fxEvent(e) {
    const s = G.s, me = G.me;
    switch (e.e) {
      case 'hit': {
        const u = unitById(e.u); if (!u) return; const v = visOf(u); v.flash = 1;
        const by = e.by ? unitById(e.by) : null, on = onScreen(u.x, u.y, 140), mine = e.by === me.id, big = e.sk || e.crit, heavy = e.a >= 110 || e.crit, pal = palT(by ? by.team : -1);
        if (by && u.kind !== 'tower') { const dx = u.x - by.x, dy = u.y - by.y, l = Math.hypot(dx, dy) || 1, k = u.boss ? 3 : e.sk ? 18 : 9; v.rx += dx / l * k; v.ry += dy / l * k; }
        if (on) {
          spark(u.x, u.y, big ? 12 : 5, big ? pal.spark : SPARKY, big ? 340 : 190, .36, big ? 18 : 11, 26);
          if (big) { spark(u.x, u.y, 5, pal.spark2, 260, .26, 13, 30); chips(u.x, u.y, heavy ? 8 : 3, pal.chip, 300); ring(u.x, u.y, heavy ? 118 : 74, pal.ring, .3, 18); if (heavy) coins(u.x, u.y, 2, { sp: 200, vz: 400, size: 8, life: .7 }); puff(u.x, u.y, 2, 0, 16, .32, 10, 70); }
          if (mine && big || u === me && e.a >= 40) burst(u.x, u.y, 34, u === me ? palT(by ? by.team : -1) : pal, heavy ? 1.2 : .8, heavy || mine);
          else if (heavy && u.kind === 'champ') burst(u.x, u.y, 34, pal, .7, false);
          if (u.kind === 'champ' || mine) number(u.x, u.y, 58, String(e.a), u.team === me.team && u.kind === 'champ' ? '#ff7a62' : e.crit ? '#ffc96a' : '#fff6e2', !!big, big ? 1 : .75);
          const interesting = (big || e.a >= 70) && by && u.kind !== 'tower' && (mine || u === me || u.kind === 'champ' || (by.kind === 'monster' && by.boss));
          if (interesting) {
            let word;
            if (by.kind === 'champ') word = e.crit && !e.sk ? pick(CRIT_WORDS) : pick(KIT_WORDS[by.champ] || CRIT_WORDS);
            else if (by.kind === 'monster') word = pick(BEAST_WORDS);
            else word = pick(CRIT_WORDS);
            const style = by.kind === 'champ' && ENERGY[by.champ] ? pal.zap : pal.word;
            wordAt(u.x, u.y, 60, word, style, { mine, key: u.id, size: heavy && mine ? 88 : undefined });
          }
        }
        if (u === me) { G.flash = .5; G.shake = Math.max(G.shake, e.a >= 100 ? 11 : 6); }
        else if (mine && big) { G.shake = Math.max(G.shake, heavy ? 8 : 5); G.punch = Math.max(G.punch, heavy ? .04 : .025); if (e.a >= 100 || e.crit) hitStop(.05); }
        break;
      }
      case 'heal': { const u = unitById(e.u); if (u && onScreen(u.x, u.y, 140)) { number(u.x, u.y, 62, '+' + e.a, '#a7f0a2', true, .95); rise(u.x, u.y, 8, HEAL, 40, .75, 9); } break; }
      case 'die': {
        const u = unitById(e.u), on = onScreen(e.x, e.y, 180), by = e.by ? unitById(e.by) : null;
        if (e.kind === 'champ') {
          const pal = palT(by ? by.team : -1);
          if (u && on) { const spr = spriteOf(u); shatter(spr, drawR(u), e.x, e.y); }
          if (on) {
            coins(e.x, e.y, 16, { sp: 320, vz: 640 }); spark(e.x, e.y, 24, GOLD, 380, .55, 16, 30); spark(e.x, e.y, 12, pal.spark, 420, .45, 20, 34); chips(e.x, e.y, 12, pal.chip, 420, 34);
            ring(e.x, e.y, 200, GOLD, .55); ring(e.x, e.y, 120, pal.ring, .4, 8); puff(e.x, e.y, 4, 1, 34, .6, 14, 90); burst(e.x, e.y, 34, pal, 1.5, true);
          }
          const inv = e.u === me.id || e.by === me.id, near = Math.hypot(e.x - me.x, e.y - me.y) < 640;
          if (inv || near) killSplash(e, u, by, inv);
          if (inv) { G.punch = Math.max(G.punch, .07); G.shake = Math.max(G.shake, 14); }
        } else if (e.kind === 'tower') {
          if (on) { coins(e.x, e.y, 34, { sp: 340, vz: 760, z: 80 }); spark(e.x, e.y, 30, GOLD, 420, .65, 18, 60); chips(e.x, e.y, 16, u && u.team === 1 ? '#e4573f' : '#58a6e6', 420, 80); ring(e.x, e.y, 260, GOLD, .65); ring(e.x, e.y, 160, '#ffffff', .4, 20); puff(e.x, e.y, 10, 1, 46, .9, 20, 90); burst(e.x, e.y, 90, NEUT, 1.9, true); wordAt(e.x, e.y, 110, 'KA-BOOM!', 'neut', { force: true, size: 110, life: .8 }); G.shake = Math.max(G.shake, 16); G.punch = Math.max(G.punch, .05); }
        } else if (on) {
          if (u) corpse(spriteOf(u), drawR(u), e.x, e.y);
          coins(e.x, e.y, e.kind === 'monster' ? 8 : 3, { sp: 150, vz: 420 });
          chips(e.x, e.y, e.kind === 'monster' ? 6 : 3, '#ffc81f', 220, 20);
          if (u && u.boss) { burst(e.x, e.y, 50, NEUT, 2, true); wordAt(e.x, e.y, 90, 'KRA-KOOM!', 'neut', { force: true, size: 110, life: .9 }); G.shake = Math.max(G.shake, 18); }
        }
        break;
      }
      case 'gold': {
        if (e.u === me.id) { if (onScreen(me.x, me.y, 40)) number(me.x + 24, me.y - 8, 48, '+' + e.a, GOLD, false, .85); flyGold(e.a); }
        break;
      }
      case 'boom': {
        const on = onScreen(e.x, e.y, e.r + 120); if (!on) return;
        const t = teamOfBoom(e), pal = palT(t), huge = e.r >= 150, mineSide = t === me.team;
        ring(e.x, e.y, e.r, pal.ring, .42); ring(e.x, e.y, e.r * .62, pal.core, .26, 6);
        spark(e.x, e.y, huge ? 28 : 12, pal.spark, e.r * 2.4, .5, 18, 16); spark(e.x, e.y, huge ? 12 : 5, pal.spark2, e.r * 1.7, .36, 13, 20);
        puff(e.x, e.y, huge ? 8 : 3, 0, 36, .6, 10, 110); chips(e.x, e.y, huge ? 10 : 4, pal.chip, e.r * 2, 20);
        burst(e.x, e.y, 24, pal, huge ? 1.7 : .9, true);
        G.shake = Math.max(G.shake, huge ? 12 : 6);
        if (huge) G.punch = Math.max(G.punch, .04);
        wordAt(e.x, e.y, 70, BOOM_WORDS[e.fx] || 'BOOM!', e.fx === 'rupture' || e.fx === 'break' ? pal.zap : pal.word, { force: huge, mine: mineSide && !huge, size: huge ? 96 : 72 });
        break;
      }
      case 'phit': {
        if (!onScreen(e.x, e.y, 120)) break;
        const pal = palT(teamOfPhit(e)), ult = e.fx === 'deadeye';
        spark(e.x, e.y, ult ? 18 : 7, pal.spark, ult ? 460 : 240, .3, ult ? 20 : 13, 24); if (ult) { ring(e.x, e.y, 150, pal.ring, .34, 16); burst(e.x, e.y, 28, pal, 1.5, true); wordAt(e.x, e.y, 60, PHIT_WORDS[e.fx], pal.word, { force: true, size: 104 }); G.shake = Math.max(G.shake, 9); }
        else if (e.fx === 'snipeFull') { ring(e.x, e.y, 84, pal.ring, .24, 16); burst(e.x, e.y, 28, pal, .8, true); }
        break;
      }
      case 'blink': { if (onScreen(e.x, e.y, 120)) { const pal = palT(teamNear(e.x, e.y)); ring(e.x, e.y, 90, pal.ring, .3); spark(e.x, e.y, 14, pal.spark, 280, .36, 14, 22); puff(e.x, e.y, 3, 1, 26, .42, 16, 40); overlay(2, e.x, e.y, 22, .2, { spr: Art.speedLines(pal.lines, 3), r: 120, ink: null }); } break; }
      case 'parry': {
        const u = unitById(e.u); if (!u) return;
        const pal = palT(u.team);
        if (onScreen(u.x, u.y, 140)) { ring(u.x, u.y, 150, pal.ring, .34); spark(u.x, u.y, 22, pal.spark, 460, .4, 17, 24); chips(u.x, u.y, 6, pal.chip, 320); burst(u.x, u.y, 34, pal, 1.1, true); wordAt(u.x, u.y, 80, 'PARRY!', pal.word, { force: true, size: 90 }); }
        if (u === me) { hitStop(.05); G.shake = Math.max(G.shake, 9); G.punch = Math.max(G.punch, .05); }
        break;
      }
      case 'cast': {
        const u = unitById(e.u); if (!u) return; const v = visOf(u); v.spin = 1;
        if (!onScreen(u.x, u.y, 160)) return;
        const pal = palT(u.team), own = u === me;
        if (e.fx === 'slash') { const dx = e.dx || u.fx || 1, dy = e.dy || u.fy || 0; slash(u.x, u.y, dx, dy, 160, pal.mid, .24); spark(u.x + dx * 80, u.y + dy * 80, 6, pal.spark, 240, .24, 13, 22); if (own) G.shake = Math.max(G.shake, 4); }
        else if (e.fx === 'parry') { ring(u.x, u.y, 90, pal.ring, .4); rise(u.x, u.y, 6, pal.mid, 30, .4, 9); }
        else if (e.fx === 'dome') { ring(u.x, u.y, 120, pal.ring, .5); rise(u.x, u.y, 8, pal.mid, 60, .6, 9); }
        else if (e.fx === 'stomp') { ring(u.x, u.y, 150, pal.ring, .4); puff(u.x, u.y, 6, 0, 34, .55, 6, 110); }
        else if (e.fx === 'dash') { ring(u.x, u.y, 70, pal.ring, .26); puff(u.x, u.y, 4, 0, 24, .4, 6, 100); overlay(2, u.x, u.y, 18, .22, { spr: Art.speedLines(pal.lines, 1), r: own ? 200 : 130, ink: Art.speedLines(INK, 3) }); if (own) G.shake = Math.max(G.shake, 4); }
        else if (e.fx === 'deadeye') { ring(u.x, u.y, 120, pal.ring, .4, 18); spark(u.x, u.y, 14, pal.spark, 380, .36, 18, 30); overlay(2, u.x, u.y, 26, .3, { spr: Art.speedLines(pal.lines, 2), r: 330, ink: Art.speedLines(INK, 1) }); if (own) { G.shake = Math.max(G.shake, 7); G.punch = Math.max(G.punch, .04); } }
        else if (e.fx === 'snipeFull' || e.fx === 'orb' || e.fx === 'ray' || e.fx === 'chain') { spark(u.x + (e.dx || 0) * 40, u.y + (e.dy || 0) * 40, 5, pal.spark, 220, .24, 12, 28); }
        break;
      }
      case 'level': {
        const u = unitById(e.u); if (!u || !onScreen(u.x, u.y, 140)) return;
        const pal = palT(u.team);
        ring(u.x, u.y, 120, pal.ring, .5); ring(u.x, u.y, 70, pal.core, .3); pillar(u.x, u.y, pal.out, pal.mid, .85); rise(u.x, u.y, 22, pal.mid, 50, 1, 12); spark(u.x, u.y, 12, pal.spark, 260, .4, 15, 12);
        if (u === me) { wordAt(u.x, u.y, 96, 'LEVEL UP!', pal.word, { force: true, size: 82, life: .95 }); G.shake = Math.max(G.shake, 4); }
        break;
      }
      case 'spawn': { const u = unitById(e.u); if (u && onScreen(u.x, u.y, 140)) { const pal = palT(u.team); ring(u.x, u.y, 96, pal.ring, .45); rise(u.x, u.y, 10, pal.mid, 34, .7, 10); } break; }
      case 'civ': {
        if (!onScreen(e.x, e.y, 200)) return;
        const hero = e.team === 0, pal = palT(e.team);
        civRun(e.x, e.y, 6, !hero);
        ring(e.x, e.y, 170, pal.ring, .6); burst(e.x, e.y, 60, pal, 1.1, true);
        wordAt(e.x, e.y, 90, hero ? 'RESCUED!' : 'SEIZED!', pal.word, { force: true, size: 84, life: 1 });
        if (hero) { rise(e.x, e.y, 18, pal.mid, 90, 1.1, 11); coins(e.x, e.y, 6, { sp: 140, vz: 420, size: 8 }); }
        else { puff(e.x, e.y, 7, 1, 40, 1, 12, 70); spark(e.x, e.y, 12, pal.spark2, 280, .45, 13, 20); }
        G.shake = Math.max(G.shake, 4);
        break;
      }
      case 'tower': break;
      case 'forge': { const u = unitById(e.u); if (u && onScreen(u.x, u.y, 140)) { const pal = palT(u.team); ring(u.x, u.y, 90, GOLD, .42); rise(u.x, u.y, 14, GOLD, 34, .8, 10); spark(u.x, u.y, 6, pal.spark, 160, .3, 11, 20); } break; }
      case 'tshot': { if (e.t === me.id) G.tAim = { id: e.u, t: 1.25 }; break; }
      case 'atk': case 'matk': {
        const u = unitById(e.u); if (!u) return; const v = visOf(u), t = e.t ? unitById(e.t) : null;
        const dx = t ? t.x - u.x : (u.fx || 0), dy = t ? t.y - u.y : (u.fy || 0), l = Math.hypot(dx, dy) || 1, k = u.kind === 'champ' ? 12 : 8;
        v.rx += dx / l * k; v.ry += dy / l * k;
        if (u.kind === 'champ' && u.range < 200 && t && onScreen(u.x, u.y, 120)) slash(u.x, u.y, dx / l, dy / l, 110, palT(u.team).mid, .16);
        break;
      }
      case 'stun': { const u = unitById(e.u); if (u && onScreen(u.x, u.y, 140)) { spark(u.x, u.y, 7, '#ffe89e', 140, .35, 11, 44); rise(u.x, u.y, 4, '#ffe89e', 26, .5, 9); if (e.u === me.id) wordAt(u.x, u.y, 84, 'DAZED!', 'pain', { force: true, size: 70 }); } break; }
      case 'mark': { const u = unitById(e.u); if (u && onScreen(u.x, u.y, 140)) { ring(u.x, u.y, 70, '#ff2d9b', .32, 20); rise(u.x, u.y, 4, '#ff2d9b', 24, .4, 8); } break; }
      case 'cancelled': { const u = unitById(e.u); if (u && onScreen(u.x, u.y, 140)) puff(u.x, u.y, 3, 1, 18, .35, 16, 30); break; }
    }
  }
  const teamNear = (x, y) => { let b = null, d = 1e12; for (const c of G.s.champs) { if (!c.alive) continue; const q = Math.hypot(c.x - x, c.y - y); if (q < d) { d = q; b = c; } } return b && d < 700 ? b.team : 2; };

  // Ability-ready detection lives here so the sparkle fires even if the HUD is rebuilt.
  function tickWarn(dt) {
    if (G.tAim && (G.tAim.t -= dt) <= 0) G.tAim = null;
    const me = G.me; if (!me || !me.cd) return;
    for (let i = 0; i < me.cd.length; i++) {
      const c = me.cd[i], was = prevCd[i] || 0;
      if (c <= 0 && was > 0 && !(i === 2 && me.lvl < 3) && me.alive) { readyFx.push({ i, t: 0 }); rise(me.x, me.y, 5, palT(me.team).mid, 26, .5, 9); }
      prevCd[i] = c;
    }
  }

  return { FX: { reset, spark, puff, dust, coins, ring, slash, ghost, ghostLine, corpse, shatter, leaves, splash, rise, popCoin, chips, pillar, burst, draw, projectiles, telegraphs, textLayer, tickWarn }, fxEvent };
})();
