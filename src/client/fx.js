// Particles, projectiles, telegraphs, aim indicators and the event-to-effect mapping.
// Everything private lives in the closure below; only FX, FX_CAP and fxEvent are shared.
const FX_CAP = q => q >= 2 ? 320 : q === 1 ? 170 : 70;
const { FX, fxEvent } = (() => {
  const FXCOL = { snipe: '#dcd7ff', snipeFull: '#b8a9ff', deadeye: '#ffd777', orb: '#7ff0df', ray: '#ffe69a', chain: '#d7b593', bolt: '#fff1c4', mbolt: '#d7e6f0', rupture: '#7ff0df', crash: '#ffc06a', heal: '#ffe69a', stomp: '#d7b593', dome: '#b6f0ff', break: '#ff9de2', dash: '#fff1c4', parry: '#fff5c6', slash: '#efe2ff' };
  const GOLD = '#ffd777', SPARKY = '#fff0c8';
  const SPARK = 0, PUFF = 1, SHARD = 2, COIN = 3, RING = 4, SLASH = 5, GHOST = 6, LEAF = 7, RISE = 8, DROP = 9, DISC = 10, CIV = 11;
  const LEAVES = ['#7fb36a', '#4f8f5e', '#c9a24a'];

  let P = [], cursor = 0, trails = new Map(), flyers = [], frameId = 0;
  const buf = new Float64Array(96);
  const nq = n => quality >= 2 ? n : quality === 1 ? Math.ceil(n * .6) : Math.ceil(n * .35);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const resetT = () => ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const coinSp = () => Art.coin('fxgold', 16, null, ['#ffe9a8', '#b8862a'], -1, -1);
  const minionBolt = team => Art.coin('fxm' + team, 16, null, Art.METAL['minion' + (team === 1 ? 1 : 0)], -1, -1);
  const towerSp = team => Art.coin('fxt' + team, 30, 'boss', Art.METAL['minion' + team], team, -1);

  let linkC = null;
  function link() {
    if (linkC) return linkC;
    const c = Art.cv(20, 12), g = c.getContext('2d');
    g.strokeStyle = '#3c2a1e'; g.lineWidth = 4; g.beginPath(); g.ellipse(10, 6, 7, 3.4, 0, 0, TAU); g.stroke();
    g.strokeStyle = '#d7b593'; g.lineWidth = 2; g.beginPath(); g.ellipse(10, 6, 7, 3.4, 0, 0, TAU); g.stroke();
    return linkC = c;
  }

  function reset() { P = []; cursor = 0; trails = new Map(); flyers = []; G.text = []; G.tAim = null; }

  function add(k, x, y, z, life) {
    const cap = FX_CAP(quality); let p;
    if (P.length < cap) { p = {}; P.push(p); }
    else { cursor = (cursor + 1) % P.length; p = P[cursor]; }
    p.k = k; p.x = x; p.y = y; p.z = z; p.vx = p.vy = p.vz = 0; p.life = p.max = life;
    p.size = 8; p.col = '#fff'; p.rot = 0; p.vr = 0; p.spr = null; p.ph = 0; p.R = 0; p.dx = 0; p.dy = 0; p.bounce = 0; p.alpha = 1; p.flip = false;
    return p;
  }

  function spark(x, y, n, col = SPARKY, sp = 200, life = .4, size = 11, z = 18) {
    n = nq(n);
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = sp * rnd(.3, 1), p = add(SPARK, x, y, z, life * rnd(.7, 1.1)); p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; p.vz = rnd(80, 260); p.size = size * rnd(.6, 1.2); p.col = col; }
  }
  function puff(x, y, n, shade = 0, size = 26, life = .55, z = 6, sp = 30) {
    n = nq(n);
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = sp * rnd(.2, 1), p = add(PUFF, x + rnd(-8, 8), y + rnd(-6, 6), z, life * rnd(.75, 1.2)); p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; p.vz = rnd(10, 40); p.size = size * rnd(.7, 1.2); p.ph = shade; }
  }
  const dust = (x, y, k = 1) => puff(x, y, 2, 0, 15 * k, .42, 3, 34);
  function coins(x, y, n, o = {}) {
    n = nq(n);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = rnd(o.spMin || 70, o.sp || 240), p = add(COIN, x, y, o.z || 22, rnd(.7, o.life || 1.1));
      p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; p.vz = rnd(o.vzMin || 240, o.vz || 520); p.size = rnd(6, o.size || 11); p.ph = Math.random() * TAU; p.vr = rnd(9, 18); p.bounce = 2;
    }
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
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, d = Math.random() * spread, p = add(RISE, x + Math.cos(a) * d, y + Math.sin(a) * d * .6, rnd(4, 30), life * rnd(.65, 1.15)); p.vz = rnd(70, 190); p.size = size * rnd(.6, 1.2); p.col = col; p.ph = Math.random() * TAU; }
  }
  function popCoin(team, x, y, z) {
    const p = add(DISC, x, y, z, 1); const a = Math.random() * TAU, v = rnd(90, 200);
    p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v; p.vz = rnd(260, 420); p.vr = rnd(10, 18); p.ph = Math.random() * TAU; p.size = 20; p.bounce = 1; p.spr = Art.discSprite(team, 34); p.flip = true;
    spark(x, y, 6, GOLD, 170, .32, 9, z);
    coins(x, y, 2, { z, sp: 150, vz: 360, size: 8, life: .8 });
  }

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
        case SHARD: case COIN: case DISC:
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
    // normal blend first
    for (const p of P) {
      if (p.k === SPARK || p.k === RISE || p.k === DROP || p.k === RING || p.k === SLASH) continue;
      const X = sx(p.x), Y = sy(p.y) - p.z * Z; if (X < -m || X > VW + m || Y < -m || Y > VH + m) continue;
      const f = p.life / p.max;
      switch (p.k) {
        case PUFF: { const r = p.size * Z * (1.7 - f * .9), sp = p.ph ? Art.puff(60, 66, 62, .9) : Art.puff(205, 196, 170, .85); ctx.globalAlpha = f * .62; ctx.drawImage(sp, X - r, Y - r * .72, r * 2, r * 1.44); break; }
        case COIN: { const sp = coinSp(), r = p.size * Z, c = Math.max(.14, Math.abs(Math.cos(p.ph))); ctx.globalAlpha = Math.min(1, f * 3); ctx.drawImage(sp.c, X - r * c * 1.2, Y - r * 1.2, 2.4 * r * c, 2.4 * r); break; }
        case SHARD: { const s = p.size * Z, w = p.spr.width * s, c = Math.cos(p.rot), sn = Math.sin(p.rot); ctx.globalAlpha = Math.min(1, f * 3); ctx.setTransform(dpr * c, dpr * sn, -dpr * sn, dpr * c, dpr * X, dpr * Y); ctx.drawImage(p.spr, -w / 2 - p.dx * Z, -w / 2 - p.dy * Z, w, w); resetT(); break; }
        case LEAF: { const c = Math.cos(p.rot) * p.size * Z, sn = Math.sin(p.rot) * p.size * Z; ctx.globalAlpha = Math.min(1, f * 4); ctx.setTransform(dpr * c, dpr * sn, -dpr * sn, dpr * c, dpr * X, dpr * Y); ctx.drawImage(p.spr, -8, -5); resetT(); break; }
        case GHOST: { const sp = p.spr, w = (p.R * Z) / sp.R * sp.S, c = Math.max(.12, Math.abs(p.ph)); ctx.globalAlpha = p.alpha * f; ctx.drawImage(sp.c, X - w * c / 2, Y - w * .42, w * c, w * .84); break; }
        case CIV: { const sp = p.spr, w = p.size * Z / sp.R * sp.S; ctx.globalAlpha = Math.min(1, f * 3.5); ctx.drawImage(Art.shadow(), X - w * .4, sy(p.y) - w * .18, w * .8, w * .36); ctx.drawImage(sp.c, X - w / 2, Y - w * .46, w, w * .92); break; }
        case DISC: { const d = p.spr, k = Z, w = d.c.width * k, h = d.c.height * k, c = Math.max(.2, Math.abs(Math.cos(p.ph))); ctx.globalAlpha = Math.min(1, f * 3); ctx.drawImage(d.c, X - w * c / 2, Y - h / 2, w * c, h); break; }
      }
    }
    ctx.globalAlpha = 1;
    // additive layer
    ctx.globalCompositeOperation = 'lighter';
    for (const p of P) {
      if (p.k !== SPARK && p.k !== RISE && p.k !== DROP && p.k !== RING && p.k !== SLASH) continue;
      const X = sx(p.x), Y = sy(p.y) - p.z * Z, bigM = p.k === RING || p.k === SLASH ? 420 : m;
      if (X < -bigM || X > VW + bigM || Y < -bigM || Y > VH + bigM) continue;
      const f = p.life / p.max;
      if (p.k === RING) {
        const R = p.R * Z * (1.05 - f * .75); ctx.strokeStyle = p.col; ctx.globalAlpha = f; ctx.lineWidth = 1.5 + f * 5; ctx.beginPath(); ctx.ellipse(X, Y, R, R * TILT, 0, 0, TAU); ctx.stroke();
      } else if (p.k === SLASH) {
        const an = Math.atan2(p.dy, p.dx), R = p.R * Z; ctx.save(); ctx.translate(X, Y); ctx.scale(1, TILT); ctx.strokeStyle = p.col; ctx.globalAlpha = f; ctx.lineCap = 'round'; ctx.lineWidth = 16 * f * Z + 2; ctx.beginPath(); ctx.arc(0, 0, R, an - .75, an + .75); ctx.stroke(); ctx.restore();
      } else {
        const r = p.size * Z * (p.k === SPARK ? (.45 + f * .55) : f); ctx.globalAlpha = p.k === RISE ? f * (.5 + .5 * Math.sin(p.ph + p.life * 14)) : Math.min(1, f * 1.6);
        ctx.drawImage(glow(p.col), X - r, Y - r, r * 2, r * 2);
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  // ---------- projectiles ----------
  const TRAIL = { snipe: [.09, 7, '#cfc7ff', .75], snipeFull: [.14, 11, '#b8a9ff', .9], deadeye: [.24, 22, '#ffd777', .85], orb: [.16, 20, '#7ff0df', .55], ray: [.08, 9, '#ffe69a', .6], bolt: [.11, 6, '#ffe2a0', .5], mbolt: [.09, 4, '#d7e6f0', .4], tower: [.17, 15, '#ffe2a0', .6] };

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
    if (!t) { t = { pts: [], life: cfg[0], w: cfg[1], col: p.fx === 'tower' && p.team !== undefined ? TEAM[p.team] : cfg[2], a: cfg[3], seen: frameId, ox: p.x, oy: p.y }; trails.set(p.id, t); }
    t.seen = frameId;
    if (dt > 0) t.pts.push({ x: X, y: Y, z: Z0, age: 0 });
    return t;
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
      if (t && quality >= 1) { ctx.globalCompositeOperation = 'lighter'; ribbon(t, t.w, t.col, t.a); ctx.globalCompositeOperation = 'source-over'; }
      else if (t) { const q = t.pts[0]; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = t.a * .6; ctx.strokeStyle = t.col; ctx.lineWidth = t.w * Z * .5; ctx.beginPath(); ctx.moveTo(sx(q.x), sy(q.y) - q.z * Z); ctx.lineTo(X, Y); ctx.stroke(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
      head(p, x, y, X, Y, z, a);
    }
    // age trails; finish off those whose projectile has gone
    for (const [id, t] of trails) {
      for (const q of t.pts) q.age += dt;
      while (t.pts.length && t.pts[0].age > t.life) t.pts.shift();
      if (t.pts.length > 48) t.pts.splice(0, t.pts.length - 48);
      if (t.seen !== frameId) {
        if (!t.pts.length) { trails.delete(id); continue; }
        if (quality >= 1) { ctx.globalCompositeOperation = 'lighter'; ribbon(t, t.w, t.col, t.a * .8); ctx.globalCompositeOperation = 'source-over'; }
      }
    }
  }

  function head(p, x, y, X, Y, z, a) {
    const col = FXCOL[p.fx] || '#fff', glow = Art.glow;
    const v = p.homing ? null : [p.vx, p.vy * TILT], l = v ? Math.hypot(v[0], v[1]) || 1 : 1, ux = v ? v[0] / l : 1, uy = v ? v[1] / l : 0;
    const add_ = () => ctx.globalCompositeOperation = 'lighter', norm_ = () => ctx.globalCompositeOperation = 'source-over';
    switch (p.fx) {
      case 'bolt': case 'mbolt': {
        const sp = p.fx === 'bolt' ? coinSp() : minionBolt(p.team), R = (p.fx === 'bolt' ? 9 : 7) * Z, c = Math.max(.16, Math.abs(Math.cos(p.age * 26)));
        ctx.drawImage(sp.c, X - R * c * 1.2, Y - R * 1.2, 2.4 * R * c, 2.4 * R); break;
      }
      case 'tower': {
        add_(); const g = 26 * Z; ctx.globalAlpha = .9; ctx.drawImage(glow(TEAM[p.team]), X - g, Y - g, g * 2, g * 2); ctx.globalAlpha = 1; norm_();
        const sp = towerSp(p.team), R = 15 * Z, c = Math.max(.25, Math.abs(Math.cos(p.age * 12))); ctx.drawImage(sp.c, X - R * c * 1.1, Y - R * 1.1, 2.2 * R * c, 2.2 * R); break;
      }
      case 'snipe': case 'snipeFull': {
        const full = p.fx === 'snipeFull', L = (full ? 150 : 90) * Z; add_(); ctx.lineCap = 'butt';
        ctx.strokeStyle = col; ctx.lineWidth = (full ? 6 : 3.6) * Z; ctx.globalAlpha = .85; ctx.beginPath(); ctx.moveTo(X - ux * L, Y - uy * L); ctx.lineTo(X + ux * 8 * Z, Y + uy * 8 * Z); ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = (full ? 2.4 : 1.4) * Z; ctx.globalAlpha = 1; ctx.beginPath(); ctx.moveTo(X - ux * L * .7, Y - uy * L * .7); ctx.lineTo(X + ux * 10 * Z, Y + uy * 10 * Z); ctx.stroke();
        const g = (full ? 22 : 12) * Z; ctx.globalAlpha = full ? .9 : .6; ctx.drawImage(glow(col), X - g, Y - g, g * 2, g * 2); ctx.globalAlpha = 1; norm_(); ctx.lineCap = 'round'; break;
      }
      case 'deadeye': {
        add_(); const g = 40 * Z; ctx.globalAlpha = .85; ctx.drawImage(glow('#ffd777'), X - g, Y - g, g * 2, g * 2); ctx.globalAlpha = 1; norm_();
        ctx.setTransform(dpr * ux, dpr * uy, -dpr * uy, dpr * ux, dpr * X, dpr * Y);
        ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.ellipse(-10 * Z, 0, 26 * Z, 8.5 * Z, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#b8862a'; ctx.beginPath(); ctx.ellipse(-20 * Z, 2 * Z, 15 * Z, 4.5 * Z, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff7da'; ctx.beginPath(); ctx.ellipse(4 * Z, -2 * Z, 10 * Z, 3 * Z, 0, 0, TAU); ctx.fill();
        resetT(); break;
      }
      case 'orb': {
        add_(); const g = 30 * Z, t = p.age * 9; ctx.globalAlpha = .9; ctx.drawImage(glow('#7ff0df'), X - g, Y - g, g * 2, g * 2); const c = 13 * Z; ctx.globalAlpha = 1; ctx.drawImage(glow('#eafff9'), X - c, Y - c, c * 2, c * 2);
        for (let i = 0; i < 4; i++) { const an = t + i * TAU / 4, ox = Math.cos(an) * 26 * Z, oy = Math.sin(an) * 14 * Z, r = 7 * Z; ctx.drawImage(glow('#bff7ee'), X + ox - r, Y + oy - r, r * 2, r * 2); }
        norm_(); break;
      }
      case 'ray': {
        const o = p.owner, ox = sx(lerp(o.px, o.x, a)), oy = sy(lerp(o.py, o.y, a)) - 26 * Z; add_(); ctx.lineCap = 'round';
        ctx.strokeStyle = '#e8b347'; ctx.globalAlpha = .4; ctx.lineWidth = 22 * Z; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(X, Y); ctx.stroke();
        ctx.strokeStyle = '#ffe69a'; ctx.globalAlpha = .8; ctx.lineWidth = 9 * Z; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(X, Y); ctx.stroke();
        ctx.strokeStyle = '#fffbe8'; ctx.globalAlpha = 1; ctx.lineWidth = 3 * Z; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(X, Y); ctx.stroke();
        const g = 30 * Z; ctx.drawImage(glow('#ffe69a'), X - g, Y - g, g * 2, g * 2); norm_(); break;
      }
      default: { add_(); const g = p.w * Z; ctx.drawImage(glow(col), X - g, Y - g, g * 2, g * 2); norm_(); }
    }
  }

  function chain(p, x, y, a) {
    const o = p.owner, ax = sx(lerp(o.px, o.x, a)), ay = sy(lerp(o.py, o.y, a)) - 24 * Z, X = sx(x), Y = sy(y) - 24 * Z, dx = X - ax, dy = Y - ay, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    const sp = link(), step = 13 * Z, n = Math.min(70, Math.floor(d / step)), s = Z * .95;
    for (let i = 0; i <= n; i++) {
      const X0 = ax + ux * i * step, Y0 = ay + uy * i * step, odd = i % 2, cs = odd ? -uy : ux, sn = odd ? ux : uy, sw = odd ? .55 : 1;
      ctx.setTransform(dpr * cs * s * sw, dpr * sn * s * sw, -dpr * sn * s, dpr * cs * s, dpr * X0, dpr * Y0);
      ctx.drawImage(sp, -10, -6);
    }
    ctx.setTransform(dpr * ux * Z, dpr * uy * Z, -dpr * uy * Z, dpr * ux * Z, dpr * X, dpr * Y);
    ctx.lineCap = 'round'; ctx.strokeStyle = '#3c2a1e'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(10, 0); ctx.arc(10, 11, 11, -Math.PI / 2, 1.0, false); ctx.lineTo(12, 22); ctx.stroke();
    ctx.strokeStyle = '#e0c9a8'; ctx.lineWidth = 3.6; ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(10, 0); ctx.arc(10, 11, 11, -Math.PI / 2, 1.0, false); ctx.lineTo(12, 22); ctx.stroke();
    ctx.fillStyle = '#e0c9a8'; ctx.beginPath(); ctx.moveTo(10, 24); ctx.lineTo(23, 15); ctx.lineTo(19, 26); ctx.closePath(); ctx.fill();
    resetT();
  }

  // ---------- telegraphs ----------
  function dashed(on, gap, speed) { ctx.setLineDash([on, gap]); ctx.lineDashOffset = -G.t * speed; }
  const undash = () => { ctx.setLineDash([]); ctx.lineDashOffset = 0; };

  function lineShape(x, y, dx, dy, len, w, col, alpha, f, arrow) {
    const X = sx(x), Y = sy(y), EX = sx(x + dx * len), EY = sy(y + dy * len), px = -(EY - Y), py = EX - X, l = Math.hypot(px, py) || 1, hw = w / 2 * Z, nx = px / l * hw, ny = py / l * hw;
    const path = () => { ctx.beginPath(); ctx.moveTo(X + nx, Y + ny); ctx.lineTo(EX + nx, EY + ny); ctx.lineTo(EX - nx, EY - ny); ctx.lineTo(X - nx, Y - ny); ctx.closePath(); };
    ctx.fillStyle = `rgba(${col},${alpha * .2})`; path(); ctx.fill();
    if (f !== undefined) { const FX_ = X + (EX - X) * f, FY = Y + (EY - Y) * f; ctx.fillStyle = `rgba(${col},${alpha * .42})`; ctx.beginPath(); ctx.moveTo(X + nx, Y + ny); ctx.lineTo(FX_ + nx, FY + ny); ctx.lineTo(FX_ - nx, FY - ny); ctx.lineTo(X - nx, Y - ny); ctx.closePath(); ctx.fill(); }
    ctx.strokeStyle = `rgba(${col},${alpha})`; ctx.lineWidth = 2; dashed(10 * Z + 2, 8 * Z + 2, 42); path(); ctx.stroke(); undash();
    if (arrow) {
      const ux = (EX - X) / (l || 1), uy = (EY - Y) / (l || 1), a = Math.max(hw * 1.2, 15 * Z), b = a * 1.1;
      ctx.fillStyle = `rgba(${col},${Math.min(1, alpha + .1)})`; ctx.beginPath(); ctx.moveTo(EX + ux * b, EY + uy * b); ctx.lineTo(EX - uy * a, EY + ux * a); ctx.lineTo(EX + uy * a, EY - ux * a); ctx.closePath(); ctx.fill();
    }
  }
  function circleShape(x, y, r, col, alpha, f) {
    const X = sx(x), Y = sy(y), R = r * Z, Ry = R * TILT;
    ctx.fillStyle = `rgba(${col},${alpha * .16})`; ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, 0, TAU); ctx.fill();
    if (f !== undefined) { ctx.fillStyle = `rgba(${col},${alpha * .4})`; ctx.beginPath(); ctx.ellipse(X, Y, R * f, Ry * f, 0, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = `rgba(${col},${alpha})`; ctx.lineWidth = 2.2; dashed(11 * Z + 2, 8 * Z + 2, 34); ctx.beginPath(); ctx.ellipse(X, Y, R, Ry, 0, 0, TAU); ctx.stroke(); undash();
  }
  function rangeRing(x, y, r, col, alpha) {
    if (!r) return; ctx.strokeStyle = `rgba(${col},${alpha})`; ctx.lineWidth = 1.5; ctx.setLineDash([7 * Z + 2, 8 * Z + 2]); ctx.lineDashOffset = 0; ctx.beginPath(); ctx.ellipse(sx(x), sy(y), r * Z, r * Z * TILT, 0, 0, TAU); ctx.stroke(); undash();
  }

  function telegraphs(a) {
    const s = G.s, me = G.me, pulse = .72 + Math.sin(G.t * 12) * .28;
    for (const z of s.zones) {
      if (!onScreen(z.x, z.y, z.r * Z + 60)) continue;
      const friendly = z.team === me.team;
      if (z.kind === 'dome') {
        const X = sx(z.x), Y = sy(z.y), R = z.r * Z;
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .34; ctx.drawImage(Art.glow('#b6f0ff'), X - R * 1.05, Y - R * 1.05 * TILT, R * 2.1, R * 2.1 * TILT); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = 'rgba(214,247,255,.8)'; ctx.lineWidth = 2; dashed(14 * Z + 2, 6 * Z + 2, 22); ctx.beginPath(); ctx.ellipse(X, Y, R, R * TILT, 0, 0, TAU); ctx.stroke(); undash();
      } else {
        const col = z.fx === 'heal' ? '255,230,154' : friendly ? '120,235,220' : '255,96,66', f = 1 - z.t / z.total;
        circleShape(z.x, z.y, z.r, col, friendly ? .9 : pulse, f);
      }
    }
    for (const c of s.champs) {
      if (!c.alive || !Sim.canSee(s, me.team, c)) continue;
      const fr = c.team === me.team, col = fr ? '150,210,255' : '255,96,66', alpha = fr ? .7 : pulse, q = pos(c, a);
      if (c.chan && c.chan.kind === 'line') lineShape(q.x, q.y, c.chan.dx, c.chan.dy, c.chan.len, c.chan.w, col, alpha, 1 - c.chan.t / c.chan.total, true);
      if (c.charge && !(c === me && Ctl.aim)) {
        const ab = c.kit[c.charge.slot] || {}, f = Math.min(1, c.charge.t / (ab.charge || 1.1)), mn = ab.minRange || 0, len = mn + ((ab.range || 700) - mn) * f;
        lineShape(q.x, q.y, c.charge.dx, c.charge.dy, len, ab.w || 30, col, alpha * .85, f, true);
      }
    }
    const held = Ctl.atk !== null && Ctl.atk !== undefined && Ctl.atk !== false;
    if (held && me.alive) { const q = pos(me, a); ctx.strokeStyle = 'rgba(255,240,190,.32)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(sx(q.x), sy(q.y), me.range * Z, me.range * Z * TILT, 0, 0, TAU); ctx.stroke(); }
    if (Ctl.aim && me.alive) ownAim(a);
    towerWarning(a);
  }

  function ownAim(a) {
    const A = Ctl.aim, me = G.me, ab = me.kit[A.slot]; if (!ab) return;
    const ad = aimDir() || { dx: me.fx, dy: me.fy, target: null };
    const drag = Math.hypot(A.dx, A.dy), cancel = !!A.cancelHot || (A.moved && drag < 16), p = pos(me, a);
    const col = cancel ? '255,108,88' : '255,240,190', alpha = cancel ? .55 : .9;
    const dx = ad.dx, dy = ad.dy;
    rangeRing(p.x, p.y, ab.range || ab.r || 0, col, cancel ? .45 : .34);
    if (!A.moved && ad.target) {
      const t = ad.target, q = pos(t, a), X = sx(q.x), Y = sy(q.y), R = (drawR(t) + 16 + Math.sin(G.t * 9) * 4) * Z;
      ctx.strokeStyle = 'rgba(255,226,140,.95)'; ctx.lineWidth = 2.6; dashed(8 * Z + 2, 5 * Z + 2, 60); ctx.beginPath(); ctx.ellipse(X, Y, R, R * TILT, 0, 0, TAU); ctx.stroke(); undash();
    }
    if (ab.shape === 'line' || ab.shape === 'dash') {
      let len = ab.range || 400; if (ab.charge && me.charge) { const f = Math.min(1, me.charge.t / ab.charge), mn = ab.minRange || 0; len = mn + ((ab.range || 700) - mn) * f; }
      lineShape(p.x, p.y, dx, dy, len, ab.w || 40, col, alpha, undefined, true);
    } else if (ab.shape === 'circle') {
      circleShape(ad.tx === undefined ? p.x + dx * (ab.range || 0) * .7 : ad.tx, ad.ty === undefined ? p.y + dy * (ab.range || 0) * .7 : ad.ty, ab.r || 80, col, alpha);
    } else if (ab.shape === 'cone') {
      const an = Math.atan2(dy, dx), R = (ab.range || 300) * Z;
      ctx.save(); ctx.translate(sx(p.x), sy(p.y)); ctx.scale(1, TILT); ctx.fillStyle = `rgba(${col},.24)`; ctx.strokeStyle = `rgba(${col},${alpha})`; ctx.lineWidth = 2; dashed(10 * Z + 2, 8 * Z + 2, 42); ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, an - .76, an + .76); ctx.closePath(); ctx.fill(); ctx.stroke(); undash(); ctx.restore();
    }
  }

  function towerWarning(a) {
    const w = G.tAim; if (!w) return;
    const t = unitById(w.id), me = G.me;
    if (!t || !t.alive || !me.alive || Math.hypot(t.x - me.x, t.y - me.y) > (t.range || 400) + 40) { G.tAim = null; return; }
    const q = pos(me, a), H = t.sub === 'core' ? 150 : 104, x0 = sx(t.x), y0 = sy(t.y) - H * Z, x1 = sx(q.x), y1 = sy(q.y) - 22 * Z, pulse = .55 + Math.sin(G.t * 18) * .45;
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(255,84,56,${.28 + pulse * .3})`; ctx.lineWidth = 7 * Z; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = `rgba(255,190,160,${.55 + pulse * .4})`; ctx.lineWidth = 2; dashed(12, 8, 130); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); undash();
  }

  // ---------- floating numbers and flying coins, drawn over the lighting ----------
  function textLayer(dt) {
    const list = G.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (let i = list.length - 1; i >= 0; i--) if ((list[i].t -= dt) <= 0) list.splice(i, 1);
    for (const t of list) {
      const f = t.t / t.max, age = 1 - f, grow = age < .16 ? .55 + (age / .16) * .85 : age < .3 ? 1.4 - ((age - .16) / .14) * .4 : 1, size = (t.big ? 21 : 14) * grow;
      const X = sx(t.x), Y = sy(t.y) - (t.z + (1 - f * f) * 52) * Z;
      if (X < -60 || X > VW + 60) continue;
      ctx.font = `700 ${size | 0}px "Barlow Semi Condensed",sans-serif`; ctx.globalAlpha = Math.min(1, f * 2.6);
      ctx.lineWidth = t.big ? 4 : 3; ctx.strokeStyle = 'rgba(8,24,22,.88)'; ctx.strokeText(t.s, X, Y); ctx.fillStyle = t.col; ctx.fillText(t.s, X, Y);
    }
    ctx.globalAlpha = 1;
    const sp = coinSp(), A = G.goldAnchor || { x: 64, y: 58 };
    for (const f of flyers) {
      if (f.t < 0) continue;
      const k = clamp01(f.t / f.dur), e = k * k * (3 - 2 * k), up = Math.sin(k * Math.PI), X = lerp(f.x0, A.x, e) + f.mx * up, Y = lerp(f.y0, A.y, e) + f.my * up, r = 9 * (1 - k * .35), c = Math.max(.18, Math.abs(Math.cos(f.ph)));
      ctx.drawImage(sp.c, X - r * c * 1.2, Y - r * 1.2, r * c * 2.4, r * 2.4);
    }
  }

  // ---------- simulation events ----------
  function fxEvent(e) {
    const s = G.s, me = G.me;
    switch (e.e) {
      case 'hit': {
        const u = unitById(e.u); if (!u) return; const v = visOf(u); v.flash = 1;
        const by = e.by ? unitById(e.by) : null, on = onScreen(u.x, u.y, 140), mine = e.by === me.id, big = e.sk || e.crit;
        if (by && u.kind !== 'tower') { const dx = u.x - by.x, dy = u.y - by.y, l = Math.hypot(dx, dy) || 1, k = u.boss ? 3 : e.sk ? 18 : 9; v.rx += dx / l * k; v.ry += dy / l * k; }
        if (on) {
          spark(u.x, u.y, big ? 7 : 3, e.crit ? '#ffb45e' : SPARKY, big ? 260 : 150, .34, big ? 13 : 9, 26);
          if (u.kind === 'champ' || mine) number(u.x, u.y, 58, String(e.a), u.team === me.team && u.kind === 'champ' ? '#ff8b78' : e.crit ? '#ffc96a' : '#fff6e2', !!big, big ? 1 : .75);
        }
        if (u === me) { G.flash = .5; G.shake = Math.max(G.shake, 6); }
        else if (mine && big) { G.shake = Math.max(G.shake, 4); G.punch = Math.max(G.punch, .025); if (e.a >= 100 || e.crit) hitStop(.05); }
        break;
      }
      case 'heal': { const u = unitById(e.u); if (u && onScreen(u.x, u.y, 140)) { number(u.x, u.y, 62, '+' + e.a, '#a7f0a2', true, .95); rise(u.x, u.y, 8, '#b6f5a8', 40, .75, 9); } break; }
      case 'die': {
        const u = unitById(e.u), on = onScreen(e.x, e.y, 180);
        if (e.kind === 'champ') {
          if (u && on) { const spr = spriteOf(u); shatter(spr, drawR(u), e.x, e.y); }
          if (on) { coins(e.x, e.y, 16, { sp: 320, vz: 640 }); spark(e.x, e.y, 18, GOLD, 320, .55, 13, 30); ring(e.x, e.y, 170, GOLD, .55); }
          const inv = e.u === me.id || e.by === me.id;
          if (inv) { slowMo(.35); G.punch = Math.max(G.punch, .07); G.shake = Math.max(G.shake, 14); }
        } else if (e.kind === 'tower') {
          if (on) { coins(e.x, e.y, 34, { sp: 340, vz: 760, z: 80 }); spark(e.x, e.y, 26, GOLD, 360, .65, 15, 60); ring(e.x, e.y, 230, GOLD, .65); puff(e.x, e.y, 10, 1, 46, .9, 20, 90); G.shake = Math.max(G.shake, 16); G.punch = Math.max(G.punch, .05); }
        } else if (on) {
          if (u) corpse(spriteOf(u), drawR(u), e.x, e.y);
          coins(e.x, e.y, e.kind === 'monster' ? 8 : 3, { sp: 150, vz: 420 });
        }
        break;
      }
      case 'gold': {
        if (e.u === me.id) { if (onScreen(me.x, me.y, 40)) number(me.x + 24, me.y - 8, 48, '+' + e.a, GOLD, false, .85); flyGold(e.a); }
        break;
      }
      case 'boom': {
        const col = FXCOL[e.fx] || '#fff', on = onScreen(e.x, e.y, e.r + 120); if (!on) return;
        ring(e.x, e.y, e.r, col, .42); spark(e.x, e.y, e.r > 150 ? 20 : 10, col, e.r * 2, .5, 14, 16); puff(e.x, e.y, e.r > 150 ? 5 : 2, 0, 34, .7, 10, 70);
        G.shake = Math.max(G.shake, e.r > 150 ? 10 : 5);
        if (e.r > 150) G.punch = Math.max(G.punch, .03);
        break;
      }
      case 'phit': { if (onScreen(e.x, e.y, 120)) { spark(e.x, e.y, 5, FXCOL[e.fx] || '#fff', 200, .3, 11, 24); } break; }
      case 'blink': { if (onScreen(e.x, e.y, 120)) { ring(e.x, e.y, 76, '#d9c9ff', .3); spark(e.x, e.y, 10, '#d9c9ff', 220, .4, 11, 22); puff(e.x, e.y, 2, 1, 26, .5, 16, 30); } break; }
      case 'parry': {
        const u = unitById(e.u); if (!u) return;
        if (onScreen(u.x, u.y, 140)) { ring(u.x, u.y, 140, '#fff5c6', .34); spark(u.x, u.y, 18, '#fff5c6', 380, .4, 13, 24); number(u.x, u.y, 86, 'Parried', '#fff5c6', true, 1); }
        if (u === me) { hitStop(.05); G.shake = Math.max(G.shake, 8); G.punch = Math.max(G.punch, .04); }
        break;
      }
      case 'cast': {
        const u = unitById(e.u); if (!u) return; const v = visOf(u); v.spin = 1;
        if (!onScreen(u.x, u.y, 160)) return;
        if (e.fx === 'slash') slash(u.x, u.y, e.dx || u.fx || 1, e.dy || u.fy || 0, 150, '#efe2ff', .22);
        else if (e.fx === 'parry') ring(u.x, u.y, 74, '#fff5c6', .5);
        else if (e.fx === 'dome') ring(u.x, u.y, 90, '#b6f0ff', .5);
        else if (e.fx === 'stomp') { ring(u.x, u.y, 110, '#d7b593', .45); puff(u.x, u.y, 4, 0, 30, .6, 6, 60); }
        break;
      }
      case 'level': {
        const u = unitById(e.u); if (!u || !onScreen(u.x, u.y, 140)) return; ring(u.x, u.y, 96, '#ffe69a', .55); rise(u.x, u.y, 18, '#ffe69a', 46, 1, 9);
        break;
      }
      case 'spawn': { const u = unitById(e.u); if (u && onScreen(u.x, u.y, 140)) { ring(u.x, u.y, 84, TEAM[u.team] || '#fff', .5); rise(u.x, u.y, 8, TEAM[u.team] || '#fff', 34, .7, 9); } break; }
      case 'civ': {
        if (!onScreen(e.x, e.y, 200)) return;
        const hero = e.team === 0;
        civRun(e.x, e.y, 6, !hero);
        ring(e.x, e.y, 150, hero ? '#ffe69a' : '#ff6a3c', .6);
        number(e.x, e.y, 96, hero ? 'Rescued' : 'Seized', hero ? '#ffe69a' : '#ff8b6a', true, 1.3);
        if (hero) { rise(e.x, e.y, 16, '#ffe69a', 90, 1.1, 10); coins(e.x, e.y, 6, { sp: 140, vz: 420, size: 8 }); }
        else { puff(e.x, e.y, 7, 1, 40, 1, 12, 70); spark(e.x, e.y, 10, '#ff6a3c', 240, .45, 11, 20); }
        G.shake = Math.max(G.shake, 4);
        break;
      }
      case 'tower': break;
      case 'forge': { const u = unitById(e.u); if (u && onScreen(u.x, u.y, 140)) { ring(u.x, u.y, 80, GOLD, .45); rise(u.x, u.y, 10, GOLD, 34, .8, 8); } break; }
      case 'tshot': { if (e.t === me.id) G.tAim = { id: e.u, t: 1.25 }; break; }
      case 'atk': case 'matk': {
        const u = unitById(e.u); if (!u) return; const v = visOf(u), t = e.t ? unitById(e.t) : null;
        const dx = t ? t.x - u.x : (u.fx || 0), dy = t ? t.y - u.y : (u.fy || 0), l = Math.hypot(dx, dy) || 1, k = u.kind === 'champ' ? 12 : 8;
        v.rx += dx / l * k; v.ry += dy / l * k;
        if (u.kind === 'champ' && u.range < 200 && t && onScreen(u.x, u.y, 120)) slash(u.x, u.y, dx / l, dy / l, 100, '#fff0c8', .16);
        break;
      }
      case 'stun': { const u = unitById(e.u); if (u && onScreen(u.x, u.y, 140)) spark(u.x, u.y, 5, '#ffe89e', 120, .35, 8, 44); break; }
      case 'mark': { const u = unitById(e.u); if (u && onScreen(u.x, u.y, 140)) ring(u.x, u.y, 60, '#ff9de2', .35, 20); break; }
      case 'cancelled': { const u = unitById(e.u); if (u && onScreen(u.x, u.y, 140)) puff(u.x, u.y, 3, 1, 18, .35, 16, 30); break; }
    }
  }

  function tickWarn(dt) { if (G.tAim && (G.tAim.t -= dt) <= 0) G.tAim = null; }

  return { FX: { reset, spark, puff, dust, coins, ring, slash, ghost, ghostLine, corpse, shatter, leaves, splash, rise, popCoin, draw, projectiles, telegraphs, textLayer, tickWarn }, fxEvent };
})();
