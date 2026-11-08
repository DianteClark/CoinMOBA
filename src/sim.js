// Mintfall simulation. No DOM in this file, so it can run on a phone today
// and inside a Cloudflare Durable Object later without changes.
const Sim = (() => {
  const W = 3200, H = 1900, TICK = 30, DT = 1 / TICK;
  const TEAM_NAMES = ['Azure', 'Cinnabar'];
  const TIERS = [
    { name: 'Copper', at: 0 }, { name: 'Bronze', at: 300 }, { name: 'Silver', at: 900 },
    { name: 'Gold', at: 2000 }, { name: 'Platinum', at: 4000 }, { name: 'Aether', at: 7500 },
  ];
  const FORGE_COST = [250, 450, 700];
  const DIFF = {
    easy: { react: .55, err: .28, dodge: .15, aggr: .8, gap: .9, lead: .55 },
    normal: { react: .32, err: .13, dodge: .45, aggr: 1, gap: .5, lead: .85 },
    hard: { react: .16, err: .05, dodge: .8, aggr: 1.15, gap: .25, lead: 1 },
  };

  // ---------- helpers ----------
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const norm = (x, y) => { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l, l }; };
  function rng(s) { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const segDist = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
    const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
    return Math.hypot(px - ax - dx * t, py - ay - dy * t);
  };

  // ---------- map ----------
  function buildMap() {
    const quad = [[690, 480, 340, 64], [1170, 480, 250, 64], [1040, 700, 64, 170], [1260, 690, 190, 64], [560, 640, 80, 200]];
    const corner = [[0, 0, 330, 330]];
    const walls = [];
    const add = (r, solid) => {
      const [x, y, w, h] = r;
      for (const [mx, my] of [[0, 0], [1, 0], [0, 1], [1, 1]])
        walls.push({ x: mx ? W - x - w : x, y: my ? H - y - h : y, w, h, big: solid });
    };
    quad.forEach(r => add(r, false)); corner.forEach(r => add(r, true));
    const brush = [];
    for (const [x, y, r] of [[1000, 405, 95], [1470, 610, 105], [850, 620, 90]])
      for (const [mx, my] of [[0, 0], [1, 0], [0, 1], [1, 1]])
        brush.push({ x: mx ? W - x : x, y: my ? H - y : y, r });
    const top = [[250, 950], [430, 520], [800, 300], [1600, 240], [2400, 300], [2770, 520], [2950, 950]];
    const lanes = [top, top.map(([x, y]) => [x, H - y])];
    const cols = Math.ceil(W / 40), rows = Math.ceil(H / 40);
    const grid = new Uint8Array(cols * rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const px = i * 40 + 20, py = j * 40 + 20;
      let b = px < 50 || py < 120 || px > W - 50 || py > H - 120;
      for (const w of walls) if (px > w.x - 34 && px < w.x + w.w + 34 && py > w.y - 34 && py < w.y + w.h + 34) b = true;
      grid[j * cols + i] = b ? 1 : 0;
    }
    return { W, H, walls, brush, lanes, cols, rows, grid };
  }

  function blocked(m, x, y) {
    const i = x / 40 | 0, j = y / 40 | 0;
    if (i < 0 || j < 0 || i >= m.cols || j >= m.rows) return true;
    return !!m.grid[j * m.cols + i];
  }
  function los(m, ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / 26);
    for (let k = 0; k <= n; k++) { const t = n ? k / n : 0; if (blocked(m, ax + (bx - ax) * t, ay + (by - ay) * t)) return false; }
    return true;
  }
  function nearestFree(m, x, y) {
    if (!blocked(m, x, y)) return { x, y };
    for (let r = 40; r < 400; r += 40) for (let a = 0; a < 12; a++) {
      const nx = x + Math.cos(a / 12 * 6.283) * r, ny = y + Math.sin(a / 12 * 6.283) * r;
      if (!blocked(m, nx, ny)) return { x: nx, y: ny };
    }
    return { x, y };
  }
  function findPath(m, ax, ay, bx, by) {
    const s0 = nearestFree(m, ax, ay), e0 = nearestFree(m, bx, by);
    const c = m.cols, st = (s0.y / 40 | 0) * c + (s0.x / 40 | 0), en = (e0.y / 40 | 0) * c + (e0.x / 40 | 0);
    const g = new Map([[st, 0]]), from = new Map(), heap = [[0, st]];
    const hOf = n => Math.hypot((n % c) - (en % c), (n / c | 0) - (en / c | 0));
    const push = it => { heap.push(it); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break;[heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let i = 0; for (; ;) { let a = 2 * i + 1, b = a + 1, m2 = i; if (a < heap.length && heap[a][0] < heap[m2][0]) m2 = a; if (b < heap.length && heap[b][0] < heap[m2][0]) m2 = b; if (m2 === i) break;[heap[m2], heap[i]] = [heap[i], heap[m2]]; i = m2; } } return top; };
    let found = false, guard = 0;
    while (heap.length && guard++ < 6000) {
      const [, n] = pop(); if (n === en) { found = true; break; }
      const x = n % c, y = n / c | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue; const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= c || ny >= m.rows) continue;
        const k = ny * c + nx; if (m.grid[k]) continue;
        if (dx && dy && (m.grid[y * c + nx] || m.grid[ny * c + x])) continue;
        const ng = g.get(n) + (dx && dy ? 1.414 : 1);
        if (ng < (g.has(k) ? g.get(k) : 1e9)) { g.set(k, ng); from.set(k, n); push([ng + hOf(k), k]); }
      }
    }
    if (!found) return [{ x: bx, y: by }];
    const raw = []; for (let n = en; n !== undefined; n = from.get(n)) raw.unshift({ x: n % c * 40 + 20, y: (n / c | 0) * 40 + 20 });
    const out = []; let i = 0;
    while (i < raw.length - 1) { let j = raw.length - 1; while (j > i + 1 && !los(m, raw[i].x, raw[i].y, raw[j].x, raw[j].y)) j--; out.push(raw[j]); i = j; }
    if (!out.length) out.push({ x: e0.x, y: e0.y });
    return out;
  }

  function pushOut(m, u) {
    for (const w of m.walls) {
      const cx = clamp(u.x, w.x, w.x + w.w), cy = clamp(u.y, w.y, w.y + w.h);
      let dx = u.x - cx, dy = u.y - cy, d = Math.hypot(dx, dy);
      if (d < u.r) {
        if (d < .01) {
          const l = u.x - w.x, r = w.x + w.w - u.x, t = u.y - w.y, b = w.y + w.h - u.y, mn = Math.min(l, r, t, b);
          if (mn === l) u.x = w.x - u.r; else if (mn === r) u.x = w.x + w.w + u.r; else if (mn === t) u.y = w.y - u.r; else u.y = w.y + w.h + u.r;
        } else { u.x = cx + dx / d * u.r; u.y = cy + dy / d * u.r; }
      }
    }
    u.x = clamp(u.x, 40, W - 40); u.y = clamp(u.y, 110, H - 110);
  }

  // ---------- champion kits ----------
  const pow = c => (1 + .09 * (c.lvl - 1)) * (1 + .13 * c.up.edge) * (c.buffT > 0 ? 1.2 : 1);

  function fire(s, c, aim, o) {
    s.proj.push({
      id: s.nid++, x: c.x, y: c.y, px: c.x, py: c.y, vx: aim.dx * o.speed, vy: aim.dy * o.speed, left: o.range, w: o.w,
      team: c.team, owner: c, fx: o.fx, pierce: o.pierce, hits: new Set(), filter: o.filter || 'units', hit: o.hit, skill: true, counted: false, age: 0,
    });
    s.ev.push({ e: 'cast', u: c.id, fx: o.fx });
  }
  function dashDir(c, dx, dy, d, speed, o = {}) { c.dash = Object.assign({ vx: dx * speed, vy: dy * speed, t: d / speed, hits: new Set() }, o); }
  function blast(s, c, x, y, r, delay, fn, fx) { s.zones.push({ id: s.nid++, kind: 'blast', x, y, r, t: delay, total: delay, team: c.team, owner: c, fn, fx, counted: false }); }
  function eachEnemy(s, c, x, y, r, fn, withMinions = true) {
    let n = 0; const test = u => { if (u.alive && !u.air && u.team !== c.team && Math.hypot(u.x - x, u.y - y) <= r + u.r) { fn(u); n++; } };
    s.champs.forEach(test); if (withMinions) { s.minions.forEach(test); s.monsters.forEach(test); }
    return n;
  }
  const stun = (s, t, d) => { if (t.kind === 'tower' || t.boss) return; t.stunT = Math.max(t.stunT || 0, d); if (t.dash && !t.dash.unstop && !t.dash.forced) t.dash = null; t.chan = null; s.ev.push({ e: 'stun', u: t.id }); };
  const slow = (t, a, d) => { t.slowA = Math.max(t.slowT > 0 ? t.slowA : 0, a); t.slowT = Math.max(t.slowT || 0, d); };
  const skillHit = (c, carrier) => { if (carrier && !carrier.counted) { carrier.counted = true; c.stats.skillHits++; } };
  const nearChamp = (s, c, x, y, maxD) => { let b = null, bd = maxD; for (const e of s.champs) { if (!e.alive || e.air || e.team === c.team || !canSee(s, c.team, e)) continue; const d = Math.hypot(e.x - x, e.y - y); if (d < bd) { b = e; bd = d; } } return b; };

  // bot aim helpers
  function lead(s, c, b, t, speed) {
    const d = dist(c, t), tt = speed ? d / speed : 0; const f = b.sk.lead * (.75 + s.rand() * .25);
    let x = t.x + t.vx * tt * f, y = t.y + t.vy * tt * f;
    const a = Math.atan2(y - c.y, x - c.x) + (s.rand() - .5) * b.sk.err, l = Math.hypot(x - c.x, y - c.y);
    return { tx: c.x + Math.cos(a) * l, ty: c.y + Math.sin(a) * l };
  }
  const cmd = (c, o) => c.q.push(o);

  const KITS = {
    vesper: {
      name: 'Vesper', role: 'Sniper', blurb: 'Charge your shot while they try to read it.',
      hp: 520, hpG: 72, dmg: 56, dmgG: 7, armor: 16, armG: 3, range: 430, as: 1.0, ms: 305, forge: ['edge', 'haste', 'guard'], pref: 390,
      kit: [
        { name: 'Long Shot', d: 'Hold to charge. A full charge pierces.', cd: 6, range: 900, shape: 'line', w: 34, charge: 1.1,
          cast(s, c, a) {
            const f = c.charge ? clamp(c.charge.t / 1.1, 0, 1) : 0; c.charge = null;
            fire(s, c, a, { speed: 1600, range: 560 + 340 * f, w: 28 + 8 * f, fx: f >= 1 ? 'snipeFull' : 'snipe', pierce: f >= 1, filter: 'units',
              hit(s, c, t, p) { hurt(s, c, t, (70 + 120 * f) * pow(c), { skill: 1 }); if (t.kind === 'champ') skillHit(c, p); } });
          },
          ai(s, c, b, t, d) { if (d > 780) return false; if (!b.chargeT) { cmd(c, { t: 'charge', slot: 0 }); b.chargeT = s.t + .55 + s.rand() * .55; return true; } return false; } },
        { name: 'Smoke Step', d: 'Dash. Your next basic attack hits harder.', cd: 9, range: 270, shape: 'dash', w: 60,
          cast(s, c, a) { dashDir(c, a.dx, a.dy, 270, 1200); c.empowerT = 3; s.ev.push({ e: 'cast', u: c.id, fx: 'dash' }); },
          ai(s, c, b, t, d) { if (d > 300 && c.hp / c.maxHp > .4) return false; const n = norm(c.x - t.x, c.y - t.y); cmd(c, { t: 'cast', slot: 1, tx: c.x + n.x * 270 - n.y * 90, ty: c.y + n.y * 270 + n.x * 90 }); return true; } },
        { name: 'Deadeye', d: 'A map-crossing shot. Everyone sees it coming.', cd: 50, range: 1900, shape: 'line', w: 50,
          cast(s, c, a) {
            c.chan = { t: .85, total: .85, kind: 'line', dx: a.dx, dy: a.dy, len: 1900, w: 50, fn(s, c) {
              fire(s, c, a, { speed: 2600, range: 1900, w: 50, fx: 'deadeye', filter: 'champ', hit(s, c, t, p) { hurt(s, c, t, 260 * pow(c), { skill: 1 }); skillHit(c, p); p.left = 0; } });
            } };
          },
          ai(s, c, b, t, d) { if (d > 1300 || t.hp / t.maxHp > .55 || Math.hypot(t.vx, t.vy) > 330) return false; const p = lead(s, c, b, t, 2200); cmd(c, { t: 'cast', slot: 2, tx: p.tx, ty: p.ty }); return true; } },
      ],
    },
    kade: {
      name: 'Kade', role: 'Duelist', blurb: 'Time the parry and the fight is yours.',
      hp: 640, hpG: 95, dmg: 64, dmgG: 8, armor: 28, armG: 4, range: 150, as: .95, ms: 325, forge: ['edge', 'guard', 'haste'], pref: 100, melee: true,
      kit: [
        { name: 'Lunge', d: 'Dash through a line. Hit a champion and you can dash again.', cd: 7, range: 290, shape: 'dash', w: 80,
          cast(s, c, a) { const car = {}; dashDir(c, a.dx, a.dy, 290, 1100, { dmg: 62, onHit(s, c, t) { hurt(s, c, t, 62 * pow(c), { skill: 1 }); if (t.kind === 'champ') { skillHit(c, car); c.recast[0] = 2.5; } } }); s.ev.push({ e: 'cast', u: c.id, fx: 'dash' }); },
          recast(s, c, a) { dashDir(c, a.dx, a.dy, 260, 1100, { dmg: 62, onHit(s, c, t) { hurt(s, c, t, 62 * pow(c), { skill: 1 }); } }); s.ev.push({ e: 'cast', u: c.id, fx: 'dash' }); },
          ai(s, c, b, t, d) { if (d > 320) return false; cmd(c, { t: 'cast', slot: 0, tx: t.x, ty: t.y }); return true; } },
        { name: 'Parry', d: 'Half a second of perfect block. Catch a hit to stun the attacker.', cd: 11, range: 0, shape: 'self',
          cast(s, c) { c.parryT = .5; s.ev.push({ e: 'cast', u: c.id, fx: 'parry' }); },
          ai(s, c, b, t, d) { if (!b.threat) return false; cmd(c, { t: 'cast', slot: 1, tx: c.x, ty: c.y }); return true; } },
        { name: 'Crash', d: 'Leap, untouchable, and land with a stun at the centre.', cd: 45, range: 640, shape: 'circle', r: 190,
          cast(s, c, a) {
            c.air = .55; c.leap = { sx: c.x, sy: c.y, tx: a.tx, ty: a.ty, t: 0, total: .55, fn(s, c) {
              s.ev.push({ e: 'boom', x: c.x, y: c.y, r: 190, fx: 'crash' });
              let hit = false;
              eachEnemy(s, c, c.x, c.y, 190, t => { hurt(s, c, t, 185 * pow(c), { skill: 1 }); if (t.kind === 'champ') { hit = true; if (Math.hypot(t.x - c.x, t.y - c.y) < 110 + t.r) stun(s, t, 1); else slow(t, .4, 1.5); } });
              if (hit) c.stats.skillHits++;
            } };
          },
          ai(s, c, b, t, d) { if (d > 620 || d < 200) return false; if (b.power < b.danger * .8) return false; const p = lead(s, c, b, t, 1100); cmd(c, { t: 'cast', slot: 2, tx: p.tx, ty: p.ty }); return true; } },
      ],
    },
    ione: {
      name: 'Ione', role: 'Mage', blurb: 'Mark them, then break the mark.',
      hp: 500, hpG: 68, dmg: 50, dmgG: 5, armor: 14, armG: 3, range: 400, as: .85, ms: 300, forge: ['edge', 'haste', 'guard'], pref: 400,
      kit: [
        { name: 'Sigil Orb', d: 'Marks the first enemy it hits.', cd: 4, range: 730, shape: 'line', w: 42,
          cast(s, c, a) { fire(s, c, a, { speed: 950, range: 730, w: 42, fx: 'orb', filter: 'units', hit(s, c, t, p) { hurt(s, c, t, 82 * pow(c), { skill: 1 }); t.markT = 4; s.ev.push({ e: 'mark', u: t.id }); if (t.kind === 'champ') skillHit(c, p); p.left = 0; } }); },
          ai(s, c, b, t, d) { if (d > 700) return false; const p = lead(s, c, b, t, 950); cmd(c, { t: 'cast', slot: 0, tx: p.tx, ty: p.ty }); return true; } },
        { name: 'Rupture', d: 'Ground blast. Breaks marks for double damage and a stun.', cd: 6.5, range: 650, shape: 'circle', r: 115,
          cast(s, c, a) { const car = {}; blast(s, c, a.tx, a.ty, 115, .55, (s, z) => { eachEnemy(s, c, z.x, z.y, 115, t => { const m = t.markT > 0; hurt(s, c, t, (m ? 165 : 75) * pow(c), { skill: 1 }); if (m) { t.markT = 0; if (t.kind === 'champ') stun(s, t, 1); s.ev.push({ e: 'boom', x: t.x, y: t.y, r: 60, fx: 'break' }); } if (t.kind === 'champ') skillHit(c, car); }); }, 'rupture'); },
          ai(s, c, b, t, d) { if (d > 630 || (t.markT <= 0 && s.rand() < .5)) return false; const p = lead(s, c, b, t, 0); const f = .55 * b.sk.lead; cmd(c, { t: 'cast', slot: 1, tx: t.x + t.vx * f, ty: t.y + t.vy * f }); return true; } },
        { name: 'Cascade', d: 'Three blasts walk forward. Each one marks.', cd: 46, range: 760, shape: 'line', w: 200,
          cast(s, c, a) { [.42, .72, 1.02].forEach((dl, i) => { const k = 260 + i * 240, car = {}; blast(s, c, c.x + a.dx * k, c.y + a.dy * k, 135, dl, (s, z) => { eachEnemy(s, c, z.x, z.y, 135, t => { hurt(s, c, t, 115 * pow(c), { skill: 1 }); t.markT = 4; if (t.kind === 'champ') skillHit(c, car); }); }, 'rupture'); }); },
          ai(s, c, b, t, d) { if (d > 760) return false; cmd(c, { t: 'cast', slot: 2, tx: t.x, ty: t.y }); return true; } },
      ],
    },
    solenne: {
      name: 'Solenne', role: 'Support', blurb: 'Every heal is a shot you can miss.',
      hp: 540, hpG: 76, dmg: 46, dmgG: 5, armor: 20, armG: 3.5, range: 390, as: .85, ms: 310, forge: ['haste', 'guard', 'edge'], pref: 420, support: true,
      kit: [
        { name: 'Mending Ray', d: 'Heals the first ally it hits, or burns the first enemy.', cd: 5, range: 790, shape: 'line', w: 46,
          cast(s, c, a) { fire(s, c, a, { speed: 1150, range: 790, w: 46, fx: 'ray', filter: 'allchamp', hit(s, c, t, p) { if (t.team === c.team) { heal(s, c, t, 120 * pow(c)); } else { hurt(s, c, t, 72 * pow(c), { skill: 1 }); slow(t, .3, 1.5); } skillHit(c, p); p.left = 0; } }); },
          ai(s, c, b, t, d) {
            const ally = lowAlly(s, c, 760); if (ally) { const p = lead(s, c, b, ally, 1150); cmd(c, { t: 'cast', slot: 0, tx: p.tx, ty: p.ty }); return true; }
            if (d > 760) return false; const p = lead(s, c, b, t, 1150); cmd(c, { t: 'cast', slot: 0, tx: p.tx, ty: p.ty }); return true; } },
        { name: 'Aegis', d: 'Place a dome that destroys enemy projectiles.', cd: 12, range: 520, shape: 'circle', r: 135,
          cast(s, c, a) { s.zones.push({ id: s.nid++, kind: 'dome', x: a.tx, y: a.ty, r: 135, t: 2.6, total: 2.6, team: c.team, owner: c }); s.ev.push({ e: 'cast', u: c.id, fx: 'dome' }); },
          ai(s, c, b, t, d) { if (!b.threat) return false; cmd(c, { t: 'cast', slot: 1, tx: c.x, ty: c.y }); return true; } },
        { name: 'Daybreak', d: 'Heals allies around you, cleanses stuns and throws enemies back.', cd: 52, range: 0, shape: 'self', r: 340,
          cast(s, c) { blast(s, c, c.x, c.y, 340, .4, (s, z) => {
            for (const e of s.champs) if (e.alive && Math.hypot(e.x - z.x, e.y - z.y) < 340) {
              if (e.team === c.team) { heal(s, c, e, 230 * pow(c)); e.stunT = 0; e.slowT = 0; }
              else { const n = norm(e.x - z.x, e.y - z.y); hurt(s, c, e, 90 * pow(c), { skill: 1 }); dashDir(e, n.x, n.y, 210, 800, { forced: true }); }
            }
            c.stats.skillHits++;
          }, 'heal'); },
          ai(s, c, b, t, d) { let n = 0; for (const e of s.champs) if (e.alive && e.team === c.team && dist(e, c) < 320 && e.hp / e.maxHp < .55) n++; if (n < 1) return false; cmd(c, { t: 'cast', slot: 2, tx: c.x, ty: c.y }); return true; } },
      ],
    },
    sable: {
      name: 'Sable', role: 'Assassin', blurb: 'Strike from behind, then be somewhere else.',
      hp: 510, hpG: 74, dmg: 66, dmgG: 8, armor: 18, armG: 3, range: 145, as: 1.05, ms: 335, forge: ['edge', 'haste', 'guard'], pref: 100, melee: true,
      kit: [
        { name: 'Rend', d: 'Short slash. Hits half again as hard from behind.', cd: 3.5, range: 240, shape: 'cone', w: 180,
          cast(s, c, a) { let hit = false; s.ev.push({ e: 'cast', u: c.id, fx: 'slash', dx: a.dx, dy: a.dy });
            eachEnemy(s, c, c.x, c.y, 240, t => { const n = norm(t.x - c.x, t.y - c.y); if (n.x * a.dx + n.y * a.dy < .72) return; const back = (t.fx || 0) * -n.x + (t.fy || 0) * -n.y < -.25; hurt(s, c, t, 92 * pow(c) * (back ? 1.5 : 1), { skill: 1, crit: back }); if (t.kind === 'champ') hit = true; });
            if (hit) c.stats.skillHits++; },
          ai(s, c, b, t, d) { if (d > 225) return false; cmd(c, { t: 'cast', slot: 0, tx: t.x, ty: t.y }); return true; } },
        { name: 'Echo', d: 'Blink away and leave an echo. Cast again to snap back.', cd: 10, range: 320, shape: 'dash', w: 60,
          cast(s, c, a) { c.echo = { x: c.x, y: c.y }; const f = nearestFree(s.map, a.tx, a.ty); s.ev.push({ e: 'blink', x: c.x, y: c.y }); c.x = f.x; c.y = f.y; c.recast[1] = 3.5; s.ev.push({ e: 'blink', x: c.x, y: c.y }); },
          recast(s, c) { if (!c.echo) return; s.ev.push({ e: 'blink', x: c.x, y: c.y }); c.x = c.echo.x; c.y = c.echo.y; c.echo = null; s.ev.push({ e: 'blink', x: c.x, y: c.y }); },
          ai(s, c, b, t, d) { if (c.recast[1] > 0) { if (c.hp / c.maxHp < .5 || d > 500) { cmd(c, { t: 'cast', slot: 1, tx: c.x, ty: c.y }); return true; } return false; } if (d > 420 || d < 150) return false; const n = norm(t.x - c.x, t.y - c.y); cmd(c, { t: 'cast', slot: 1, tx: t.x + n.x * 90, ty: t.y + n.y * 90 }); return true; } },
        { name: 'Reap', d: 'Blink behind a champion. Execute damage. A kill resets it.', cd: 40, range: 580, shape: 'circle', r: 90,
          cast(s, c, a) { const t = nearChamp(s, c, a.tx, a.ty, 220); if (!t || dist(c, t) > 640) return false; const n = { x: t.fx || 1, y: t.fy || 0 }; s.ev.push({ e: 'blink', x: c.x, y: c.y }); const f = nearestFree(s.map, t.x - n.x * 90, t.y - n.y * 90); c.x = f.x; c.y = f.y; c.fx = n.x; c.fy = n.y; c.reap = { id: t.id, t: 2 }; hurt(s, c, t, (125 * pow(c)) + (t.maxHp - t.hp) * .35, { skill: 1, crit: 1 }); c.stats.skillHits++; s.ev.push({ e: 'blink', x: c.x, y: c.y }); },
          ai(s, c, b, t, d) { if (d > 560 || t.hp / t.maxHp > .5) return false; cmd(c, { t: 'cast', slot: 2, tx: t.x, ty: t.y }); return true; } },
      ],
    },
    gravel: {
      name: 'Gravel', role: 'Tank', blurb: 'One good hook moves the whole fight.',
      hp: 720, hpG: 112, dmg: 54, dmgG: 6, armor: 34, armG: 5, range: 150, as: .8, ms: 305, forge: ['guard', 'haste', 'edge'], pref: 110, melee: true,
      kit: [
        { name: 'Chain', d: 'Hook the first enemy it hits and drag them to you.', cd: 9, range: 700, shape: 'line', w: 50,
          cast(s, c, a) { fire(s, c, a, { speed: 1050, range: 700, w: 50, fx: 'chain', filter: 'chainable', hit(s, c, t, p) { hurt(s, c, t, 64 * pow(c), { skill: 1 }); const n = norm(c.x - t.x, c.y - t.y), l = Math.max(0, n.l - 90); dashDir(t, n.x, n.y, l, 1300, { forced: true }); t.stunT = Math.max(t.stunT || 0, l / 1300 + .15); if (t.kind === 'champ') skillHit(c, p); p.left = 0; } }); },
          ai(s, c, b, t, d) { if (d > 670 || d < 170) return false; const p = lead(s, c, b, t, 1050); cmd(c, { t: 'cast', slot: 0, tx: p.tx, ty: p.ty }); return true; } },
        { name: 'Stomp', d: 'Slow everyone around you and harden for a moment.', cd: 8, range: 0, shape: 'self', r: 215,
          cast(s, c) { let hit = false; s.ev.push({ e: 'boom', x: c.x, y: c.y, r: 215, fx: 'stomp' }); eachEnemy(s, c, c.x, c.y, 215, t => { hurt(s, c, t, 62 * pow(c), { skill: 1 }); slow(t, .4, 1.5); if (t.kind === 'champ') hit = true; }); c.drT = 2.5; if (hit) c.stats.skillHits++; },
          ai(s, c, b, t, d) { if (d > 220) return false; cmd(c, { t: 'cast', slot: 1, tx: c.x, ty: c.y }); return true; } },
        { name: 'Avalanche', d: 'Unstoppable charge. Stuns around the first champion you hit.', cd: 48, range: 800, shape: 'line', w: 110,
          cast(s, c, a) { dashDir(c, a.dx, a.dy, 800, 1000, { unstop: true, champOnly: true, onHit(s, c, t) { c.dash = null; s.ev.push({ e: 'boom', x: c.x, y: c.y, r: 180, fx: 'crash' }); eachEnemy(s, c, c.x, c.y, 180, e => { hurt(s, c, e, 165 * pow(c), { skill: 1 }); if (e.kind === 'champ') stun(s, e, 1.25); }, true); c.stats.skillHits++; } }); s.ev.push({ e: 'cast', u: c.id, fx: 'dash' }); },
          ai(s, c, b, t, d) { if (d > 700 || b.power < b.danger * .8) return false; const p = lead(s, c, b, t, 1000); cmd(c, { t: 'cast', slot: 2, tx: p.tx, ty: p.ty }); return true; } },
      ],
    },
  };

  function lowAlly(s, c, r) { let b = null, m = .72; for (const e of s.champs) { if (e === c || !e.alive || e.team !== c.team || dist(e, c) > r) continue; const f = e.hp / e.maxHp; if (f < m) { m = f; b = e; } } return b; }

  // ---------- match ----------
  function createMatch(cfg) {
    const s = {
      t: 0, tick: 0, nid: 1, rand: rng(cfg.seed || 7), map: buildMap(), champs: [], minions: [], towers: [], monsters: [], proj: [], zones: [], ev: [], over: null,
      diff: cfg.diff || 'normal', nextWave: 8, wave: 0, bossAt: 240, kills: [0, 0], buff: [0, 0], camps: [], gaps: {},
    };
    const fountains = [{ x: 95, y: 950 }, { x: W - 95, y: 950 }]; s.fountains = fountains;
    const mir = (x, team) => team ? W - x : x;
    [0, 1].forEach(team => {
      const mk = (x, y, kind, lane, tier) => {
        const hp = kind === 'core' ? 2800 : tier === 0 ? 1500 : 1900;
        s.towers.push({ id: s.nid++, kind: 'tower', sub: kind, team, x: mir(x, team), y, px: mir(x, team), py: y, r: kind === 'core' ? 70 : 46, hp, maxHp: hp, armor: 30, range: kind === 'core' ? 400 : 370, alive: true, cd: 0, lane, tier, stack: 0, last: null, vx: 0, vy: 0 });
      };
      for (const lane of [0, 1]) { const f = y => lane ? H - y : y; mk(1130, f(320), 'tower', lane, 0); mk(640, f(432), 'tower', lane, 1); }
      mk(250, 950, 'core', -1, 2);
    });
    // Jungle: four quadrants, each with a small trio and one heavy
    for (const [mx, my] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const px = x => mx ? W - x : x, py = y => my ? H - y : y;
      s.camps.push({ id: s.camps.length, x: px(850), y: py(780), big: false, at: 30, alive: false, side: mx });
      s.camps.push({ id: s.camps.length, x: px(1210), y: py(615), big: true, at: 45, alive: false, side: mx });
    }
    cfg.teams.forEach((list, team) => list.forEach((p, i) => {
      const k = KITS[p.champ];
      const c = {
        id: s.nid++, kind: 'champ', team, slot: i, champ: p.champ, pname: p.name, tier: p.tier || 0, human: !!p.human,
        x: mir(135, team), y: 880 + i * 46, r: 34, lvl: 1, xp: 0, gold: 300, up: { edge: 0, guard: 0, haste: 0 },
        hp: k.hp, maxHp: k.hp, armor: k.armor, dmgBase: k.dmg, range: k.range, msBase: k.ms, as: k.as, kit: k.kit,
        alive: true, respawn: 0, atkCd: 0, lock: 0, fx: team ? -1 : 1, fy: 0, cd: [0, 0, 0], recast: [0, 0, 0], q: [], mv: { x: 0, y: 0 }, atk: false,
        stunT: 0, slowT: 0, slowA: 0, markT: 0, parryT: 0, drT: 0, air: 0, buffT: 0, empowerT: 0, revealT: 0, vx: 0, vy: 0, assist: {}, charge: null, chan: null, dash: null, leap: null, inBrush: -1, recentHit: 0,
        stats: { casts: 0, skillHits: 0, parries: 0, kills: 0, deaths: 0, assists: 0, dmg: 0 },
      };
      c.px = c.x; c.py = c.y;
      if (!p.human) {
        const dutyList = ['top', 'bot', 'bot', 'jungle'];
        c.bot = { sk: DIFF[s.diff], duty: dutyList[i], lane: i === 0 ? 0 : 1, next: i * .05, path: null, pi: 0, pt: 0, goal: null, chargeT: 0, castAt: 0, power: 1, danger: 0, threat: false, dodgeT: 0, dx: 0, dy: 0, state: 'lane', wig: s.rand() * 6 };
      }
      s.champs.push(c);
    }));
    return s;
  }

  const towerOpen = (s, t) => {
    if (t.sub === 'core') return s.towers.some(o => o.team === t.team && o.sub === 'tower' && o.tier === 1 && !o.alive);
    if (t.tier === 1) return !s.towers.some(o => o.team === t.team && o.lane === t.lane && o.tier === 0 && o.alive);
    return true;
  };

  function canSee(s, team, u) {
    if (u.team === team || u.inBrush === undefined || u.inBrush < 0 || u.revealT > 0) return true;
    for (const c of s.champs) if (c.team === team && c.alive && c.inBrush === u.inBrush) return true;
    return false;
  }

  function heal(s, src, t, amt) { const a = Math.min(amt, t.maxHp - t.hp); t.hp += a; s.ev.push({ e: 'heal', u: t.id, a: Math.round(amt) }); }

  function hurt(s, src, t, amt, o = {}) {
    if (!t.alive || t.air) return 0;
    if (t.kind === 'tower' && !towerOpen(s, t)) return 0;
    if (t.parryT > 0) {
      t.parryT = 0; t.stats.parries++; t.cd[1] = Math.min(t.cd[1], 2);
      s.ev.push({ e: 'parry', u: t.id }); if (src && src.kind !== 'tower' && src.alive && !src.boss) stun(s, src, .9);
      return 0;
    }
    let a = amt * 100 / (100 + (t.armor || 0));
    if (t.drT > 0) a *= .7;
    for (const z of s.zones) if (z.kind === 'dome' && z.team === t.team && Math.hypot(z.x - t.x, z.y - t.y) < z.r) { a *= .75; break; }
    // Structures weaken late so a match always reaches an ending.
    if (t.kind === 'tower') a *= 1 + Math.max(0, s.t - 480) / 200;
    if (t.kind === 'monster' && src && src.kind === 'champ') { t.hitAt = s.t; if (!t.tgt) t.tgt = src; }
    t.hp -= a;
    if (t.chan && t.chan.recall) t.chan = null;
    if (src && src.kind === 'champ') { src.stats.dmg += a; src.revealT = 1.2; if (t.kind === 'champ') { t.assist[src.id] = s.t; src.recentHit = s.t; } }
    s.ev.push({ e: 'hit', u: t.id, a: Math.round(a), sk: o.skill ? 1 : 0, crit: o.crit ? 1 : 0, by: src ? src.id : 0 });
    if (t.hp <= 0) kill(s, src, t);
    return a;
  }

  function giveXp(s, c, xp) {
    if (c.lvl >= 10) return; c.xp += xp;
    while (c.lvl < 10 && c.xp >= xpNeed(c.lvl)) { c.xp -= xpNeed(c.lvl); c.lvl++; applyStats(c, true); s.ev.push({ e: 'level', u: c.id }); }
  }
  const xpNeed = l => 180 + 110 * (l - 1);
  function applyStats(c, keepFrac) {
    const k = KITS[c.champ], f = c.hp / c.maxHp;
    c.maxHp = k.hp + k.hpG * (c.lvl - 1) + c.up.guard * 180;
    c.armor = k.armor + k.armG * (c.lvl - 1) + c.up.guard * 14;
    c.dmgBase = (k.dmg + k.dmgG * (c.lvl - 1)) * (1 + .13 * c.up.edge);
    c.msBase = k.ms + c.up.haste * 10;
    if (keepFrac) c.hp = Math.max(1, c.maxHp * f);
  }
  const teamNear = (s, team, x, y, r) => s.champs.filter(c => c.team === team && c.alive && Math.hypot(c.x - x, c.y - y) < r);

  function kill(s, src, t) {
    t.alive = false; t.hp = 0;
    s.ev.push({ e: 'die', u: t.id, kind: t.kind, x: t.x, y: t.y, by: src ? src.id : 0 });
    if (src && src.reap && src.reap.id === t.id && src.reap.t > 0) { src.cd[2] = 0; src.reap = null; }
    const et = 1 - t.team;
    if (t.kind === 'champ') {
      t.deaths = (t.deaths || 0) + 1; t.stats.deaths++; t.respawn = 5 + t.lvl * 1.6 + s.t / 120; t.chan = t.dash = t.charge = t.leap = null; t.air = 0;
      s.kills[et]++;
      if (src && src.kind === 'champ') { src.gold += 260; src.stats.kills++; giveXp(s, src, 120 + 16 * t.lvl); s.ev.push({ e: 'gold', u: src.id, a: 260 }); }
      for (const id in t.assist) if (s.t - t.assist[id] < 9 && (!src || +id !== src.id)) { const a = s.champs.find(c => c.id === +id); if (a) { a.gold += 130; a.stats.assists++; giveXp(s, a, 70); } }
      t.assist = {};
      s.ev.push({ e: 'feed', a: src ? src.id : 0, b: t.id });
    } else if (t.kind === 'minion') {
      const near = teamNear(s, et, t.x, t.y, 850);
      near.forEach(c => { giveXp(s, c, 42 / Math.max(1, near.length * .7)); if (c !== src) c.gold += 7; });
      if (src && src.kind === 'champ') { src.gold += 22; s.ev.push({ e: 'gold', u: src.id, a: 22 }); }
    } else if (t.kind === 'monster') {
      if (t.boss) {
        s.buff[src ? src.team : 0] = 1; const team = src ? src.team : 0;
        s.champs.filter(c => c.team === team).forEach(c => { c.buffT = 90; c.gold += 120; giveXp(s, c, 160); });
        s.bossAt = s.t + 210; s.ev.push({ e: 'boss', team });
      } else {
        const near = teamNear(s, src ? src.team : 0, t.x, t.y, 700);
        near.forEach(c => { giveXp(s, c, (t.big ? 130 : 44)); c.gold += t.big ? 95 : 32; });
        const camp = s.camps[t.camp]; camp.left--; if (camp.left <= 0) { camp.alive = false; camp.at = s.t + 70; }
      }
    } else if (t.kind === 'tower') {
      s.champs.filter(c => c.team === et).forEach(c => { c.gold += 140; giveXp(s, c, 70); });
      s.ev.push({ e: 'tower', team: t.team, sub: t.sub });
      if (t.sub === 'core') s.over = { winner: et, t: s.t };
    }
  }

  function spawnWave(s) {
    s.wave++;
    const scale = 1 + s.wave * .035;
    for (const team of [0, 1]) for (const lane of [0, 1]) for (let i = 0; i < 4; i++) {
      const path = team ? [...s.map.lanes[lane]].reverse() : s.map.lanes[lane];
      const ranged = i === 3, x = path[0][0] + (s.rand() - .5) * 30, y = path[0][1] + (s.rand() - .5) * 30 + i * 8;
      const hp = (ranged ? 270 : 400) * scale;
      s.minions.push({ id: s.nid++, kind: 'minion', team, lane, x, y, px: x, py: y, r: ranged ? 18 : 22, hp, maxHp: hp, armor: 10, dmg: (ranged ? 28 : 22) * scale, range: ranged ? 300 : 95, ranged, ms: 215, as: .9, alive: true, cd: 0, wp: 1, path, stunT: 0, slowT: 0, slowA: 0, markT: 0, vx: 0, vy: 0, delay: i * .45, fx: team ? -1 : 1, fy: 0 });
    }
  }
  function spawnCamp(s, camp) {
    camp.alive = true; const n = camp.big ? 1 : 3; camp.left = n;
    for (let i = 0; i < n; i++) {
      const a = i * 2.1, off = camp.big ? 0 : 55, hp = (camp.big ? 1050 : 400) * (1 + s.t / 900);
      const x = camp.x + Math.cos(a) * off, y = camp.y + Math.sin(a) * off;
      s.monsters.push({ id: s.nid++, kind: 'monster', team: 2, camp: camp.id, big: camp.big, x, y, px: x, py: y, hx: x, hy: y, r: camp.big ? 42 : 24, hp, maxHp: hp, armor: 18, dmg: (camp.big ? 52 : 24) * (1 + s.t / 900), range: 110, ms: 260, as: .9, alive: true, cd: 0, tgt: null, stunT: 0, slowT: 0, slowA: 0, markT: 0, vx: 0, vy: 0, fx: 1, fy: 0 });
    }
  }
  function spawnBoss(s) {
    const hp = 7000 * (1 + s.t / 1200), x = W / 2, y = H / 2;
    s.monsters.push({ id: s.nid++, kind: 'monster', team: 2, boss: true, x, y, px: x, py: y, hx: x, hy: y, r: 74, hp, maxHp: hp, armor: 45, dmg: 150, range: 170, ms: 170, as: .7, alive: true, cd: 0, slam: 3, tgt: null, stunT: 0, slowT: 0, slowA: 0, markT: 0, vx: 0, vy: 0, fx: 1, fy: 0 });
    s.bossUp = true; s.ev.push({ e: 'bossup' });
  }

  function homing(s, src, t, dmg, speed, fx, extra) { s.proj.push(Object.assign({ id: s.nid++, x: src.x, y: src.y, px: src.x, py: src.y, target: t, speed, dmg, team: src.team, owner: src, fx, w: 14, homing: true, age: 0 }, extra)); }

  function nearestFoe(s, u, r, opts = {}) {
    let best = null, bd = r;
    const list = opts.champsOnly ? s.champs : (opts.noChamps ? [...s.minions, ...s.monsters] : [...s.champs, ...s.minions, ...s.monsters, ...(opts.towers ? s.towers : [])]);
    for (const e of list) {
      if (!e.alive || e.air || e.team === u.team || (e.kind === 'champ' && !canSee(s, u.team, e))) continue;
      if (e.kind === 'tower' && !towerOpen(s, e)) continue;
      const d = dist(u, e) - e.r;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function autoTarget(s, c) {
    // Champion first when one is in range, then minions and monsters, then structures.
    const r = c.range;
    const structure = () => { let b = null, bd = r; for (const t of s.towers) if (t.alive && t.team !== c.team && towerOpen(s, t)) { const d = dist(c, t) - t.r; if (d < bd) { bd = d; b = t; } } return b; };
    const champ = nearestFoe(s, c, r, { champsOnly: true }); if (champ) return champ;
    if (c.preferTower) { const t = structure(); if (t) return t; }
    return nearestFoe(s, c, r, { noChamps: true }) || structure();
  }

  function tryCast(s, c, q) {
    const a = c.kit[q.slot]; if (!a || c.stunT > 0 || c.air || c.chan) return;
    if (c.dash && !c.dash.forced && !a.recast) return;
    if (c.dash && c.dash.forced) return;
    if (q.slot === 2 && c.lvl < 3) return;
    const n = norm(q.tx - c.x, q.ty - c.y);
    const hasDir = n.l > 1;
    const dx = hasDir ? n.x : c.fx, dy = hasDir ? n.y : c.fy;
    const r = a.range || 0; const d = Math.min(n.l, r || 0);
    const aim = { dx, dy, tx: r ? c.x + dx * d : c.x, ty: r ? c.y + dy * d : c.y, d };
    if (a.shape === 'dash' || a.shape === 'line') { aim.tx = c.x + dx * r; aim.ty = c.y + dy * r; }
    if (c.recast[q.slot] > 0 && a.recast) { a.recast(s, c, aim); c.recast[q.slot] = 0; c.fx = dx; c.fy = dy; return; }
    if (c.cd[q.slot] > 0) return;
    if (a.cast(s, c, aim) === false) return;
    const cdr = 1 - c.up.haste * .08;
    c.cd[q.slot] = q.slot === 1 && c.champ === 'kade' ? a.cd : a.cd * cdr;
    c.stats.casts++; c.fx = dx; c.fy = dy; c.spin = 1;
    if (c.chan && c.chan.recall) c.chan = null;
  }

  function stepChamp(s, c) {
    c.px = c.x; c.py = c.y;
    if (!c.alive) {
      c.respawn -= DT;
      if (c.respawn <= 0) {
        c.alive = true; c.hp = c.maxHp; const f = s.fountains[c.team]; c.x = c.px = f.x + (c.team ? -50 : 50); c.y = c.py = f.y + (c.slot - 1.5) * 40; c.q.length = 0; c.stunT = c.slowT = c.markT = 0; s.ev.push({ e: 'spawn', u: c.id });
      }
      return;
    }
    for (const k of ['stunT', 'slowT', 'markT', 'parryT', 'drT', 'buffT', 'empowerT', 'revealT', 'lock']) if (c[k] > 0) c[k] -= DT;
    for (let i = 0; i < 3; i++) { if (c.cd[i] > 0) c.cd[i] -= DT; if (c.recast[i] > 0) c.recast[i] -= DT; }
    if (c.atkCd > 0) c.atkCd -= DT;
    if (c.reap) { c.reap.t -= DT; if (c.reap.t <= 0) c.reap = null; }
    if (c.charge) { c.charge.t += DT * (c.stunT > 0 ? 0 : 1); if (c.charge.t > 4 || c.stunT > 0) c.charge = null; }

    while (c.q.length) {
      const q = c.q.shift();
      if (q.t === 'cast') tryCast(s, c, q);
      else if (q.t === 'charge') { if (c.cd[q.slot] <= 0 && c.stunT <= 0 && !c.chan && !c.air) { c.charge = { slot: q.slot, t: 0, dx: c.fx, dy: c.fy }; c.stats.casts += 0; } }
      else if (q.t === 'aim') { if (c.charge) { const n = norm(q.tx - c.x, q.ty - c.y); c.charge.dx = n.x; c.charge.dy = n.y; c.fx = n.x; c.fy = n.y; } }
      else if (q.t === 'cancel') c.charge = null;
      else if (q.t === 'recall') { if (!c.chan && c.stunT <= 0) c.chan = { t: 4, total: 4, recall: true, fn(s, c) { const f = s.fountains[c.team]; s.ev.push({ e: 'blink', x: c.x, y: c.y }); c.x = f.x + (c.team ? -60 : 60); c.y = f.y; s.ev.push({ e: 'blink', x: c.x, y: c.y }); } }; }
      else if (q.t === 'forge') forge(s, c, q.track);
    }

    // leap
    if (c.leap) {
      const L = c.leap; L.t += DT; const f = Math.min(1, L.t / L.total);
      c.x = L.sx + (L.tx - L.sx) * f; c.y = L.sy + (L.ty - L.sy) * f; c.z = Math.sin(f * Math.PI) * 150; c.air = Math.max(0, L.total - L.t + .001);
      if (f >= 1) { c.leap = null; c.air = 0; c.z = 0; pushOut(s.map, c); L.fn(s, c); }
    } else if (c.dash) {
      const D = c.dash; const step = Math.min(DT, D.t); c.x += D.vx * step; c.y += D.vy * step; D.t -= DT;
      if (D.onHit) {
        const test = t => { if (!c.dash || !t.alive || t.air || t.team === c.team || D.hits.has(t.id)) return; if (Math.hypot(t.x - c.x, t.y - c.y) < c.r + t.r + 22) { D.hits.add(t.id); D.onHit(s, c, t); } };
        s.champs.forEach(test); if (!D.champOnly) { s.minions.forEach(test); s.monsters.forEach(test); }
      }
      if (D.t <= 0) c.dash = null;
      pushOut(s.map, c);
    } else if (c.chan) {
      c.chan.t -= DT;
      if (c.stunT > 0) c.chan = null;
      else if (c.chan.recall && (c.mv.x || c.mv.y)) c.chan = null;
      else if (c.chan.t <= 0) { const ch = c.chan; c.chan = null; ch.fn(s, c); }
    } else if (c.stunT <= 0 && c.lock <= 0) {
      const m = Math.min(1, Math.hypot(c.mv.x, c.mv.y));
      if (m > .05) {
        const n = norm(c.mv.x, c.mv.y); let sp = c.msBase * (c.slowT > 0 ? 1 - c.slowA : 1);
        if (c.charge) sp *= .6; if (c.buffT > 0) sp *= 1.05;
        c.x += n.x * sp * m * DT; c.y += n.y * sp * m * DT;
        if (!c.charge) { c.fx = n.x; c.fy = n.y; }
      }
      pushOut(s.map, c);
    }
    for (const t of s.towers) if (t.alive) { const d = dist(c, t), mn = c.r + t.r - 8; if (d < mn && d > .1) { c.x = t.x + (c.x - t.x) / d * mn; c.y = t.y + (c.y - t.y) / d * mn; } }

    // basic attack
    if (c.atk && c.stunT <= 0 && !c.air && !c.dash && !c.chan && !c.charge && c.atkCd <= 0) {
      const t = autoTarget(s, c);
      if (t) {
        c.atkCd = 1 / c.as; c.lock = .13; const n = norm(t.x - c.x, t.y - c.y); c.fx = n.x; c.fy = n.y; c.revealT = 1;
        let dmg = c.dmgBase * (c.buffT > 0 ? 1.2 : 1); let crit = false;
        if (c.empowerT > 0) { dmg *= 1.6; c.empowerT = 0; crit = true; }
        s.ev.push({ e: 'atk', u: c.id, t: t.id });
        if (KITS[c.champ].melee) hurt(s, c, t, dmg, { crit });
        else homing(s, c, t, dmg, 1100, 'bolt', { crit });
      }
    }

    // fountain
    const f = s.fountains[c.team]; if (dist(c, f) < 300) { c.hp = Math.min(c.maxHp, c.hp + c.maxHp * .14 * DT); }
    const ef = s.fountains[1 - c.team]; if (dist(c, ef) < 340 && !c.air) { hurt(s, null, c, 900 * DT); }
    c.hp = Math.min(c.maxHp, c.hp + (c.maxHp * .004) * DT);

    // brush
    c.inBrush = -1; s.map.brush.forEach((b, i) => { if (Math.hypot(c.x - b.x, c.y - b.y) < b.r) c.inBrush = i; });
    c.vx = (c.x - c.px) / DT; c.vy = (c.y - c.py) / DT;
    c.gold += 2.6 * DT;
  }

  function forge(s, c, track) {
    const n = c.up[track]; if (n === undefined || n >= 3) return false;
    const cost = FORGE_COST[n]; if (c.gold < cost) return false;
    c.gold -= cost; c.up[track]++; applyStats(c, true); if (track === 'guard') c.hp = Math.min(c.maxHp, c.hp + 180);
    s.ev.push({ e: 'forge', u: c.id, track }); return true;
  }

  function stepMinion(s, m) {
    m.px = m.x; m.py = m.y; if (m.delay > 0) { m.delay -= DT; return; }
    if (m.stunT > 0) m.stunT -= DT; if (m.slowT > 0) m.slowT -= DT; if (m.markT > 0) m.markT -= DT; if (m.cd > 0) m.cd -= DT;
    if (m.dash) { const D = m.dash; const st = Math.min(DT, D.t); m.x += D.vx * st; m.y += D.vy * st; D.t -= DT; if (D.t <= 0) m.dash = null; return; }
    if (m.stunT > 0) return;
    let t = null, bd = 340;
    // protect allied champions that are being hit by enemy champions
    for (const e of s.champs) if (e.alive && !e.air && e.team !== m.team && e.recentHit && s.t - e.recentHit < 1.5 && canSee(s, m.team, e)) { const d = dist(m, e); if (d < 420) { t = e; break; } }
    if (!t) for (const e of s.minions) if (e.alive && e.team !== m.team && e.delay <= 0) { const d = dist(m, e) - e.r; if (d < bd) { bd = d; t = e; } }
    if (!t) for (const e of s.towers) if (e.alive && e.team !== m.team && towerOpen(s, e)) { const d = dist(m, e) - e.r; if (d < bd + 40) { bd = d; t = e; } }
    if (!t) for (const e of s.champs) if (e.alive && !e.air && e.team !== m.team && canSee(s, m.team, e)) { const d = dist(m, e) - e.r; if (d < bd * .7) { bd = d; t = e; } }
    const sp = m.ms * (m.slowT > 0 ? 1 - m.slowA : 1);
    if (t) {
      const d = dist(m, t) - t.r;
      if (d > m.range - 6) { const n = norm(t.x - m.x, t.y - m.y); m.x += n.x * sp * DT; m.y += n.y * sp * DT; m.fx = n.x; m.fy = n.y; }
      else if (m.cd <= 0) { m.cd = 1 / m.as; const dmg = t.kind === 'tower' ? m.dmg * 1.1 : m.dmg; s.ev.push({ e: 'matk', u: m.id }); if (m.ranged) homing(s, m, t, dmg, 800, 'mbolt'); else hurt(s, m, t, dmg); }
    } else if (m.wp < m.path.length) {
      const [wx, wy] = m.path[m.wp]; const n = norm(wx - m.x, wy - m.y);
      if (n.l < 40) m.wp++; else { m.x += n.x * sp * DT; m.y += n.y * sp * DT; m.fx = n.x; m.fy = n.y; }
    }
    m.vx = (m.x - m.px) / DT; m.vy = (m.y - m.py) / DT;
  }

  function stepMonster(s, m) {
    m.px = m.x; m.py = m.y; if (m.stunT > 0) { m.stunT -= DT; return; } if (m.slowT > 0) m.slowT -= DT; if (m.markT > 0) m.markT -= DT; if (m.cd > 0) m.cd -= DT;
    let t = m.tgt;
    if (t && (!t.alive || t.air || Math.hypot(t.x - m.hx, t.y - m.hy) > 620)) t = m.tgt = null;
    if (!t) {
      // Monsters wake when hit by anyone standing close.
      const last = s.champs.filter(c => c.alive && dist(c, m) < 300 && s.t - (m.hitAt || -9) < 2)[0];
      if (last) t = m.tgt = last;
    }
    if (m.boss && t) {
      m.slam -= DT;
      if (m.slam <= 0) { m.slam = 4; const fake = { team: 2, id: m.id }; const tx = t.x, ty = t.y; s.zones.push({ id: s.nid++, kind: 'blast', x: tx, y: ty, r: 170, t: 1, total: 1, team: 2, owner: m, fx: 'crash', fn(s, z) { for (const e of s.champs) if (e.alive && !e.air && Math.hypot(e.x - z.x, e.y - z.y) < 170 + e.r) { hurt(s, m, e, 200); slow(e, .35, 1); } s.ev.push({ e: 'boom', x: z.x, y: z.y, r: 170, fx: 'crash' }); } }); }
    }
    if (t) {
      const d = dist(m, t) - t.r; if (d > m.range - 8) { const n = norm(t.x - m.x, t.y - m.y); m.x += n.x * m.ms * DT; m.y += n.y * m.ms * DT; m.fx = n.x; m.fy = n.y; }
      else if (m.cd <= 0) { m.cd = 1 / m.as; hurt(s, m, t, m.dmg); s.ev.push({ e: 'matk', u: m.id }); }
    } else {
      const n = norm(m.hx - m.x, m.hy - m.y); if (n.l > 8) { m.x += n.x * 320 * DT; m.y += n.y * 320 * DT; } else m.hp = Math.min(m.maxHp, m.hp + m.maxHp * .25 * DT);
    }
    m.vx = (m.x - m.px) / DT; m.vy = (m.y - m.py) / DT;
  }

  function stepTower(s, t) {
    if (t.cd > 0) t.cd -= DT; if (t.cd > 0) return;
    let target = null, bd = t.range;
    for (const c of s.champs) if (c.alive && !c.air && c.team !== t.team && c.recentHit && s.t - c.recentHit < 2 && dist(c, t) < t.range) { target = c; break; }
    if (!target) for (const m of s.minions) if (m.alive && m.team !== t.team && m.delay <= 0) { const d = dist(m, t); if (d < bd) { bd = d; target = m; } }
    if (!target) { bd = t.range; for (const c of s.champs) if (c.alive && !c.air && c.team !== t.team) { const d = dist(c, t); if (d < bd) { bd = d; target = c; } } }
    if (!target) { t.last = null; t.stack = 0; return; }
    t.stack = t.last === target.id ? Math.min(4, t.stack + 1) : 0; t.last = target.id; t.cd = 1.1;
    const base = target.kind === 'champ' ? (110 + s.t * .12) * (1 + t.stack * .3) : target.maxHp * .42 * (1 + (target.armor || 0) / 100);
    homing(s, t, target, base, 1000, 'tower');
    s.ev.push({ e: 'tshot', u: t.id });
  }

  function stepProj(s) {
    for (const p of s.proj) {
      p.age += DT; p.px = p.x; p.py = p.y;
      if (p.homing) {
        const t = p.target;
        if (!t.alive || t.air) { p.dead = true; continue; }
        const n = norm(t.x - p.x, t.y - p.y), st = p.speed * DT;
        if (n.l <= st + t.r * .5) {
          p.dead = true;
          const src = p.owner;
          if (src.kind === 'tower' && t.kind === 'champ') { t.revealT = 1; }
          hurt(s, src, t, p.dmg, { crit: p.crit });
          continue;
        }
        p.x += n.x * st; p.y += n.y * st;
      } else {
        p.x += p.vx * DT; p.y += p.vy * DT; p.left -= Math.hypot(p.vx, p.vy) * DT;
        const test = t => {
          if (p.dead || !t.alive || t.air || t === p.owner || p.hits.has(t.id)) return;
          if (p.filter !== 'allchamp' && t.team === p.team) return;
          if (t.kind === 'champ' && t.team !== p.team && !canSee(s, p.team, t) && false) return;
          if (segDist(t.x, t.y, p.px, p.py, p.x, p.y) <= t.r + p.w / 2) {
            p.hits.add(t.id); p.hit(s, p.owner, t, p);
            s.ev.push({ e: 'phit', x: t.x, y: t.y, fx: p.fx });
            if (!p.pierce) p.dead = true;
          }
        };
        s.champs.forEach(test);
        if (p.filter === 'units' || p.filter === 'chainable') { s.minions.forEach(test); if (p.filter === 'units') s.monsters.forEach(test); }
        if (p.left <= 0) p.dead = true;
      }
      if (!p.dead && p.owner.kind !== 'tower') for (const z of s.zones) if (z.kind === 'dome' && z.team !== p.team && Math.hypot(z.x - p.x, z.y - p.y) < z.r) { p.dead = true; s.ev.push({ e: 'phit', x: p.x, y: p.y, fx: 'dome' }); break; }
    }
    s.proj = s.proj.filter(p => !p.dead);
  }

  function stepZones(s) {
    for (const z of s.zones) {
      z.t -= DT;
      if (z.t <= 0) {
        z.dead = true;
        if (z.kind === 'blast') { s.ev.push({ e: 'boom', x: z.x, y: z.y, r: z.r, fx: z.fx }); z.fn(s, z); }
      }
    }
    s.zones = s.zones.filter(z => !z.dead);
  }

  // ---------- bots ----------
  function goTo(s, c, b, x, y) {
    if (los(s.map, c.x, c.y, x, y)) { b.path = null; const n = norm(x - c.x, y - c.y); c.mv.x = n.l > 14 ? n.x : 0; c.mv.y = n.l > 14 ? n.y : 0; return; }
    if (!b.path || s.t > b.pt || Math.hypot(b.goal.x - x, b.goal.y - y) > 180) { b.path = findPath(s.map, c.x, c.y, x, y); b.pi = 0; b.pt = s.t + .9; b.goal = { x, y }; }
    while (b.pi < b.path.length - 1 && Math.hypot(b.path[b.pi].x - c.x, b.path[b.pi].y - c.y) < 40) b.pi++;
    const w = b.path[b.pi]; const n = norm(w.x - c.x, w.y - c.y); c.mv.x = n.x; c.mv.y = n.y;
  }
  const stop = c => { c.mv.x = 0; c.mv.y = 0; };

  function laneFront(s, c, lane) {
    let best = null, score = -1;
    for (const m of s.minions) if (m.alive && m.team === c.team && m.lane === lane && m.delay <= 0) { const v = m.wp * 1000 + (m.team ? W - m.x : m.x); if (v > score) { score = v; best = m; } }
    return best;
  }
  function firstTower(s, team, lane) { const a = s.towers.filter(t => t.alive && t.team === team && t.lane === lane).sort((x, y) => x.tier - y.tier); return a[0] || s.towers.find(t => t.team === team && t.sub === 'core'); }
  function enemyTowerNear(s, c, r) { for (const t of s.towers) if (t.alive && t.team !== c.team && dist(c, t) < t.range + r) return t; return null; }
  function alliesTanking(s, c, t) { let n = 0; for (const m of s.minions) if (m.alive && m.team === c.team && dist(m, t) < t.range - 20) n++; return n; }

  function botThink(s, c, b) {
    if (!c.alive) return;
    if (c.stunT > 0) return;
    // spend gold at once
    for (const tr of KITS[c.champ].forge) if (c.up[tr] < 3 && c.gold >= FORGE_COST[c.up[tr]]) { forge(s, c, tr); break; }

    const f = c.hp / c.maxHp;
    let tgt = null, score = 1e9, pw = 1 + c.lvl * .1, dg = 0; pw *= f + .25;
    b.threat = false;
    for (const e of s.champs) {
      if (!e.alive || e.team === c.team) { continue; }
      const d = dist(e, c);
      if (!canSee(s, c.team, e)) continue;
      if (d < 950) { dg += (1 + e.lvl * .1) * (e.hp / e.maxHp + .25); }
      if (d < 980) { const sc = d - (1 - e.hp / e.maxHp) * 420 + (e.air ? 500 : 0); if (sc < score) { score = sc; tgt = e; } }
    }
    for (const e of s.champs) if (e !== c && e.alive && e.team === c.team && dist(e, c) < 800) pw += (1 + e.lvl * .1) * (e.hp / e.maxHp + .25);
    b.power = pw; b.danger = dg;

    // incoming projectile and zone awareness
    let dodge = null;
    for (const p of s.proj) {
      if (p.homing || p.team === c.team || p.age < b.sk.react * .4) continue;
      const n = norm(p.vx, p.vy), rx = c.x - p.x, ry = c.y - p.y, along = rx * n.x + ry * n.y;
      if (along < -30 || along > 560) continue;
      const side = rx * -n.y + ry * n.x;
      if (Math.abs(side) < p.w / 2 + c.r + 20) { b.threat = true; if (s.rand() < b.sk.dodge) dodge = { x: -n.y * (side >= 0 ? 1 : -1), y: n.x * (side >= 0 ? 1 : -1) }; }
    }
    for (const z of s.zones) if (z.kind === 'blast' && z.team !== c.team && Math.hypot(c.x - z.x, c.y - z.y) < z.r + c.r + 10 && s.rand() < b.sk.dodge + .2) { const n = norm(c.x - z.x, c.y - z.y); dodge = { x: n.x, y: n.y }; b.threat = true; }
    for (const e of s.champs) if (e.team !== c.team && e.alive && e.chan && !e.chan.recall && e.chan.kind === 'line') { const sd = segDist(c.x, c.y, e.x, e.y, e.x + e.chan.dx * e.chan.len, e.y + e.chan.dy * e.chan.len); if (sd < e.chan.w / 2 + c.r + 16 && s.rand() < b.sk.dodge) { dodge = { x: -e.chan.dy, y: e.chan.dx }; if (dodge.x * (c.x - e.x) + dodge.y * (c.y - e.y) < 0) { dodge.x *= -1; dodge.y *= -1; } b.threat = true; } }
    if (tgt && dist(c, tgt) < 170 && tgt.atkCd > .55) b.threat = b.threat || s.rand() < b.sk.dodge * .5;
    if (dodge) { b.dodgeT = .32; b.dx = dodge.x; b.dy = dodge.y; }

    // release a charged shot
    if (c.charge) {
      if (s.t >= b.chargeT) {
        if (tgt) { const p = lead(s, c, b, tgt, 1600); c.q.push({ t: 'cast', slot: 0, tx: p.tx, ty: p.ty }); } else c.q.push({ t: 'cancel' });
        b.chargeT = 0;
      } else if (tgt) c.q.push({ t: 'aim', tx: tgt.x, ty: tgt.y });
    } else b.chargeT = 0;

    if (c.chan && c.chan.recall) { if (tgt && dist(c, tgt) < 600) c.chan = null; else { stop(c); return; } }

    // retreat
    const home = s.fountains[c.team];
    const homeD = dist(c, home);
    if (b.state === 'heal') { if (f > .9) b.state = 'lane'; }
    if ((f < .28 || (f < .45 && dg > pw * 1.5)) && homeD > 280) b.state = 'heal';
    if (b.state === 'heal' && homeD < 300) { c.atk = !!autoTarget(s, c); stop(c); return; }

    c.atk = true;
    { const nt = enemyTowerNear(s, c, 40); c.preferTower = !!nt && alliesTanking(s, c, nt) >= 1; }
    const fight = tgt && dist(c, tgt) < 760 && (b.state !== 'heal') && (pw * b.sk.aggr >= dg * .8 || tgt.hp / tgt.maxHp < .22);
    const tt = tgt && enemyTowerNear(s, tgt, -60);
    const towerSafe = !tt || alliesTanking(s, c, tt) >= 2 || tgt.hp / tgt.maxHp < .2;
    let engaged = false;

    if (tgt && s.t >= b.castAt && b.state !== 'heal' || (tgt && s.t >= b.castAt && dg > 0)) {
      const d = dist(c, tgt);
      const order = [2, 0, 1];
      for (const i of order) {
        const a = c.kit[i];
        if (i === 2 && c.lvl < 3) continue;
        const ready = c.cd[i] <= 0 || (c.recast[i] > 0 && a.recast);
        if (!ready || !a.ai) continue;
        if (b.state === 'heal' && a.shape !== 'dash' && a.shape !== 'self') continue;
        if ((a.shape === 'dash' && c.champ === 'kade' || i === 2) && !towerSafe) continue;
        if (c.charge) break;
        if (c.recast[i] > 0 && a.recast && c.champ === 'kade') { c.q.push({ t: 'cast', slot: 0, tx: tgt.x, ty: tgt.y }); b.castAt = s.t + b.sk.gap; break; }
        if (a.ai(s, c, b, tgt, d)) { b.castAt = s.t + b.sk.gap * (.7 + s.rand() * .6); break; }
      }
    } else if (!tgt && c.champ === 'solenne' && c.cd[0] <= 0 && s.t >= b.castAt) {
      const ally = lowAlly(s, c, 740); if (ally) { const p = lead(s, c, b, ally, 1150); c.q.push({ t: 'cast', slot: 0, tx: p.tx, ty: p.ty }); b.castAt = s.t + b.sk.gap; }
    }

    // keep off enemy towers without a wave
    const et = enemyTowerNear(s, c, 10);

    if (b.dodgeT > 0) { b.dodgeT -= .15; c.mv.x = b.dx; c.mv.y = b.dy; return; }
    if (b.state === 'heal') {
      if (homeD > 1200 && !tgt && !c.chan) { c.q.push({ t: 'recall' }); stop(c); return; }
      goTo(s, c, b, home.x, home.y); return;
    }
    if (fight && towerSafe) {
      engaged = true; const k = KITS[c.champ], d = dist(c, tgt), want = k.pref; b.wig += .4;
      if (d > want + 30) goTo(s, c, b, tgt.x, tgt.y);
      else if (d < want * .68 && !k.melee) { const n = norm(c.x - tgt.x, c.y - tgt.y); c.mv.x = n.x; c.mv.y = n.y; }
      else { const n = norm(tgt.x - c.x, tgt.y - c.y), sg = Math.sin(b.wig) > 0 ? 1 : -1; c.mv.x = -n.y * sg; c.mv.y = n.x * sg; }
      return;
    }
    if (et && alliesTanking(s, c, et) < 2) {
      const n = norm(c.x - et.x, c.y - et.y); c.mv.x = n.x; c.mv.y = n.y; return;
    }

    // macro
    const late = s.t > 330;
    if (b.duty === 'jungle') {
      if (s.bossUp && s.monsters.some(m => m.boss && m.alive) && s.t > s.bossAt + 15) { const boss = s.monsters.find(m => m.boss && m.alive); return bossFight(s, c, b, boss); }
      if (!late || s.camps.some(x => x.alive && x.side === c.team)) {
        let best = null, bd = 1e9;
        for (const x of s.camps) { if (!x.alive) continue; let d = Math.hypot(x.x - c.x, x.y - c.y) + (x.side === c.team ? 0 : 500); if (d < bd) { bd = d; best = x; } }
        if (best) return campFight(s, c, b, best);
      }
    }
    if (s.bossUp && c.slot <= 1 && s.t > s.bossAt + 40) { const boss = s.monsters.find(m => m.boss && m.alive); if (boss) return bossFight(s, c, b, boss); }
    const lane = late ? pushLane(s, c) : b.lane;
    const front = laneFront(s, c, lane);
    const enemyT = firstTower(s, 1 - c.team, lane), ownT = firstTower(s, c.team, lane);
    if (front) {
      const bk = c.team ? 1 : -1;
      const path = front.path, wp = Math.min(front.wp, path.length - 1), prev = path[Math.max(0, wp - 1)], n = norm(prev[0] - front.x, prev[1] - front.y);
      const off = KITS[c.champ].melee ? 40 : 120;
      goTo(s, c, b, front.x + n.x * off + Math.sin(b.wig + c.slot) * 30, front.y + n.y * off + Math.cos(b.wig + c.slot) * 30); b.wig += .05;
      return;
    }
    if (ownT) goTo(s, c, b, ownT.x, ownT.y + (lane ? -60 : 60));
  }
  function pushLane(s, c) { const left = [0, 1].map(l => s.towers.filter(t => t.alive && t.team !== c.team && t.lane === l).length); return left[0] < left[1] ? 0 : left[1] < left[0] ? 1 : (c.team === 0 ? 0 : 1); }
  function campFight(s, c, b, camp) {
    const m = s.monsters.find(x => x.alive && x.camp === camp.id);
    if (!m) { goTo(s, c, b, camp.x, camp.y); return; }
    const d = dist(c, m), want = KITS[c.champ].pref * .85;
    if (d > want) goTo(s, c, b, m.x, m.y); else stop(c);
    if (s.t >= b.castAt && d < 260) { for (const i of [0, 1]) if (c.cd[i] <= 0 && c.kit[i].shape !== 'dash' && !c.kit[i].charge && i === 0 && c.champ !== 'solenne') { c.q.push({ t: 'cast', slot: i, tx: m.x, ty: m.y }); b.castAt = s.t + 1; break; } }
  }
  function bossFight(s, c, b, m) { const d = dist(c, m), want = KITS[c.champ].pref; if (d > want) goTo(s, c, b, m.x, m.y); else stop(c); }

  // ---------- step ----------
  function step(s) {
    if (s.over) return;
    s.t += DT; s.tick++;
    for (const c of s.champs) if (c.bot && c.alive) { c.bot.next -= DT; if (c.bot.next <= 0) { c.bot.next = .15; botThink(s, c, c.bot); }  }
    if (s.t >= s.nextWave) { spawnWave(s); s.nextWave += 26; }
    for (const camp of s.camps) if (!camp.alive && s.t >= camp.at) spawnCamp(s, camp);
    if (s.t >= s.bossAt && !s.monsters.some(m => m.boss && m.alive)) { spawnBoss(s); s.bossAt = s.t; }
    if (s.bossUp && !s.monsters.some(m => m.boss && m.alive)) s.bossUp = false;
    for (const c of s.champs) stepChamp(s, c);
    for (const m of s.minions) if (m.alive) stepMinion(s, m);
    for (let i = 0; i < s.minions.length; i++) { const a = s.minions[i]; if (!a.alive || a.delay > 0) continue; for (let j = i + 1; j < s.minions.length; j++) { const b = s.minions[j]; if (!b.alive || b.delay > 0 || a.team !== b.team) continue; const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy), mn = a.r + b.r; if (d < mn && d > .01) { const p = (mn - d) * .25 / d; a.x += dx * p; a.y += dy * p; b.x -= dx * p; b.y -= dy * p; } } }
    for (const m of s.monsters) if (m.alive) stepMonster(s, m);
    for (const t of s.towers) if (t.alive) stepTower(s, t);
    stepProj(s); stepZones(s);
    s.minions = s.minions.filter(m => m.alive); s.monsters = s.monsters.filter(m => m.alive);
  }

  function masteryGain(st, won) {
    const acc = st.casts ? Math.min(1, st.skillHits / st.casts) : 0;
    return Math.round(st.skillHits * 6 * (.6 + acc) + st.parries * 25 + (st.kills + st.assists * .5) * 20 + (won ? 60 : 20));
  }
  function tierOf(p) { let t = 0; TIERS.forEach((x, i) => { if (p >= x.at) t = i; }); return t; }

  return { W, H, TICK, DT, KITS, TIERS, TEAM_NAMES, FORGE_COST, createMatch, step, canSee, autoTarget, masteryGain, tierOf, towerOpen, xpNeed };
})();
if (typeof module !== 'undefined') module.exports = Sim;
