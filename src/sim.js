// Mintfall simulation. No DOM in this file, so it can run on a phone today
// and inside a Cloudflare Durable Object later without changes.
const Sim = (() => {
  const W = 4320, H = 2560, TICK = 30, DT = 1 / TICK;
  const TEAM_NAMES = ['Heroes', 'Villains'];
  // Each kit is played by one hero and one villain. Balance is shared.
  const CHARS = {
    hero: {
      vesper: { name: 'Longshot', title: 'The watchful marksman' }, kade: { name: 'Captain Riposte', title: 'Master of the counter' },
      ione: { name: 'Starling', title: 'Caller of falling stars' }, solenne: { name: 'Dawnbringer', title: 'Healer of the first light' },
      sable: { name: 'Nightfall', title: 'Quiet hand of justice' }, gravel: { name: 'Bulwark', title: 'The wall that walks' },
    },
    villain: {
      vesper: { name: 'Deadbolt', title: 'Locks on and waits' }, kade: { name: 'The Duelist', title: 'Never dropped a grudge' },
      ione: { name: 'Madame Hex', title: 'Curses by appointment' }, solenne: { name: 'The Plague Doctor', title: 'Prescribes only trouble' },
      sable: { name: 'Shiv', title: 'Gone before you look' }, gravel: { name: 'Ironjaw', title: 'Bites through bank vaults' },
    },
  };
  const charOf = (team, kit) => CHARS[team ? 'villain' : 'hero'][kit];
  const TIERS = [
    { name: 'Copper', at: 0 }, { name: 'Bronze', at: 300 }, { name: 'Silver', at: 900 },
    { name: 'Gold', at: 2000 }, { name: 'Platinum', at: 4000 }, { name: 'Aether', at: 7500 },
  ];
  const FORGE_COST = [250, 450, 700];

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
  // Top-left quadrant is authored; everything is mirrored four ways. Cliffs are at least 200 apart:
  //   top lane corridor  y 120-540 (420 wide)     jungle route   y 630-980 (350 wide)
  //   main street        y 1070-1490 (420 wide)   river corridor x 1950-2370 (420 wide)
  // Entrances into each jungle half: the diagonal lane mouth, the north gap at x 1500-1760 (from the lane),
  // the two south gaps at x 870-1090 and 1320-1620 (from main street), and the river corridor.
  const LANE_TOP = [[340, 1280], [470, 880], [720, 600], [1120, 370], [1640, 330], [2160, 330], [2680, 330], [3200, 370], [3600, 600], [3850, 880], [3980, 1280]];
  const RIVER = [[2240, -80], [2160, 330], [2120, 800], [2160, 1280], [2200, 1760], [2160, 2230], [2080, 2640]];
  const QUAD_CLIFFS = [
    [1130, 540, 370, 90], [1760, 540, 190, 90],   // north side of the jungle: lane wall, with a gank gap between
    [1090, 980, 230, 90], [1620, 980, 320, 90],   // south side of the jungle, leaving gaps to main street
    [780, 880, 90, 230],                          // base rampart, framing the centre gate
    [1430, 1240, 80, 80],                         // main street cover, on the axis
  ];
  const QUAD_FOREST = [[0, 0, 440, 470], [0, 470, 210, 260]];
  const QUAD_BRUSH = [[1300, 465, 75], [1630, 600, 105], [2010, 450, 70], [1490, 1130, 90]];
  const FOUNTAIN_HEAL_R = 360, FOUNTAIN_BURN_R = 340;
  const four = fn => [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([mx, my]) => fn(mx, my));
  const WALLS = (() => {
    const out = [], seen = new Set();
    const add = (r, big) => four((mx, my) => {
      const [x, y, w, h] = r, wx = mx ? W - x - w : x, wy = my ? H - y - h : y, key = [wx, wy, w, h].join();
      if (!seen.has(key)) { seen.add(key); out.push({ x: wx, y: wy, w, h, big }); }
    });
    QUAD_CLIFFS.forEach(r => add(r, false)); QUAD_FOREST.forEach(r => add(r, true));
    return out;
  })();
  function buildMap() {
    const walls = WALLS.map(w => Object.assign({}, w));
    const brush = [];
    for (const [x, y, r] of QUAD_BRUSH) four((mx, my) => brush.push({ x: mx ? W - x : x, y: my ? H - y : y, r }));
    const lanes = [LANE_TOP.map(p => p.slice()), LANE_TOP.map(([x, y]) => [x, H - y])];
    const center = { x: W / 2, y: H / 2 };
    const fountains = [{ x: 130, y: H / 2 }, { x: W - 130, y: H / 2 }];
    const plazas = [{ x: 290, y: H / 2, r: 500, kind: 'base', team: 0 }, { x: W - 290, y: H / 2, r: 500, kind: 'base', team: 1 }, { x: center.x, y: center.y, r: 370, kind: 'centre', team: -1 }];
    const bridges = [{ x: W / 2, y: 330 }, { x: W / 2, y: H - 330 }];
    const cols = Math.ceil(W / 40), rows = Math.ceil(H / 40);
    const grid = new Uint8Array(cols * rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const px = i * 40 + 20, py = j * 40 + 20;
      let b = px < 50 || py < 120 || px > W - 50 || py > H - 120;
      for (const w of walls) if (px > w.x - 34 && px < w.x + w.w + 34 && py > w.y - 34 && py < w.y + w.h + 34) b = true;
      grid[j * cols + i] = b ? 1 : 0;
    }
    return { W, H, walls, brush, lanes, river: RIVER.map(p => p.slice()), center, fountains, plazas, bridges, cols, rows, grid, fountainR: FOUNTAIN_HEAL_R };
  }

  // How far a line from (x, y) along unit vector (dx, dy) can travel, up to len, before a wall or the map's edge.
  function rayWall(x, y, dx, dy, len) {
    let best = len;
    if (dx > 0) best = Math.min(best, (W - 40 - x) / dx); else if (dx < 0) best = Math.min(best, (40 - x) / dx);
    if (dy > 0) best = Math.min(best, (H - 110 - y) / dy); else if (dy < 0) best = Math.min(best, (110 - y) / dy);
    if (best < 0) best = 0;
    for (const w of WALLS) {
      let t0 = 0, t1 = best;
      if (dx === 0) { if (x < w.x || x > w.x + w.w) continue; }
      else { const a = (w.x - x) / dx, b = (w.x + w.w - x) / dx; t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b)); }
      if (dy === 0) { if (y < w.y || y > w.y + w.h) continue; }
      else { const a = (w.y - y) / dy, b = (w.y + w.h - y) / dy; t0 = Math.max(t0, Math.min(a, b)); t1 = Math.min(t1, Math.max(a, b)); }
      if (t0 <= t1 && t0 < best) best = t0;
    }
    return best;
  }
  // True when nothing solid stands on the straight line between two points.
  const hasLOS = (ax, ay, bx, by) => { const n = norm(bx - ax, by - ay); return n.l < 1 || rayWall(ax, ay, n.x, n.y, n.l) >= n.l - .5; };

  function blocked(m, x, y) {
    const i = x / 40 | 0, j = y / 40 | 0;
    if (i < 0 || j < 0 || i >= m.cols || j >= m.rows) return true;
    return !!m.grid[j * m.cols + i];
  }
  function nearestFree(m, x, y) {
    if (!blocked(m, x, y)) return { x, y };
    for (let r = 40; r < 400; r += 40) for (let a = 0; a < 12; a++) {
      const nx = x + Math.cos(a / 12 * 6.283) * r, ny = y + Math.sin(a / 12 * 6.283) * r;
      if (!blocked(m, nx, ny)) return { x: nx, y: ny };
    }
    return { x, y };
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
      id: s.nid++, x: c.x, y: c.y, px: c.x, py: c.y, vx: aim.dx * o.speed, vy: aim.dy * o.speed, left: rayWall(c.x, c.y, aim.dx, aim.dy, o.range), wall: rayWall(c.x, c.y, aim.dx, aim.dy, o.range) < o.range - 1, w: o.w,
      team: c.team, owner: c, fx: o.fx, pierce: o.pierce, hits: new Set(), filter: o.filter || 'units', hit: o.hit, skill: true, counted: false, age: 0,
    });
    s.ev.push({ e: 'cast', u: c.id, fx: o.fx });
  }
  function dashDir(c, dx, dy, d, speed, o = {}) { const len = Math.max(0, Math.min(d, rayWall(c.x, c.y, dx, dy, d + c.r) - c.r)); c.dash = Object.assign({ vx: dx * speed, vy: dy * speed, t: len / speed, hits: new Set() }, o); }
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

  const KITS = {
    vesper: {
      name: 'Vesper', role: 'Sniper', blurb: 'Charge your shot while they try to read it.',
      sight: 950, hp: 520, hpG: 72, dmg: 56, dmgG: 7, armor: 16, armG: 3, range: 520, as: 1.0, ms: 305, forge: ['edge', 'haste', 'guard'], pref: 480, fit: { top: 1, jungle: 0, bottom: 3, support: 0 },
      kit: [
        { name: 'Long Shot', d: 'Hold to charge. A full charge pierces.', cd: 6, range: 800, minRange: 500, shape: 'line', w: 34, charge: 1.1,
          cast(s, c, a) {
            const f = c.charge ? clamp(c.charge.t / 1.1, 0, 1) : 0; c.charge = null;
            fire(s, c, a, { speed: 1600, range: 500 + 300 * f, w: 28 + 8 * f, fx: f >= 1 ? 'snipeFull' : 'snipe', pierce: f >= 1, filter: 'units',
              hit(s, c, t, p) { hurt(s, c, t, (70 + 120 * f) * pow(c), { skill: 1 }); if (t.kind === 'champ') skillHit(c, p); } });
          },
        },
        { name: 'Smoke Step', d: 'Dash. Your next basic attack hits harder.', cd: 9, range: 270, shape: 'dash', w: 60, pd: [270, 1200],
          cast(s, c, a) { dashDir(c, a.dx, a.dy, 270, 1200); c.empowerT = 3; s.ev.push({ e: 'cast', u: c.id, fx: 'dash' }); },
        },
        { name: 'Deadeye', d: 'The longest shot in the game. Everyone sees it coming.', cd: 50, range: 1050, shape: 'line', w: 50, windup: true,
          cast(s, c, a) {
            c.chan = { t: .85, total: .85, kind: 'line', slot: 2, dx: a.dx, dy: a.dy, len: rayWall(c.x, c.y, a.dx, a.dy, 1050), w: 50, fn(s, c) {
              fire(s, c, a, { speed: 2600, range: 1050, w: 50, fx: 'deadeye', filter: 'champ', hit(s, c, t, p) { hurt(s, c, t, 260 * pow(c), { skill: 1 }); skillHit(c, p); p.left = 0; } });
            } };
          },
        },
      ],
    },
    kade: {
      name: 'Kade', role: 'Duelist', blurb: 'Time the parry and the fight is yours.',
      sight: 720, hp: 640, hpG: 95, dmg: 64, dmgG: 8, armor: 28, armG: 4, range: 165, as: .95, ms: 325, forge: ['edge', 'guard', 'haste'], pref: 125, melee: true, fit: { top: 3, jungle: 2, bottom: 0, support: 0 },
      kit: [
        { name: 'Lunge', d: 'Dash through a line. Hit a champion and you can dash again.', cd: 7, range: 290, shape: 'dash', w: 80, pd: [290, 1100], pdr: [260, 1100],
          cast(s, c, a) { const car = {}; dashDir(c, a.dx, a.dy, 290, 1100, { dmg: 62, onHit(s, c, t) { hurt(s, c, t, 62 * pow(c), { skill: 1 }); if (t.kind === 'champ') { skillHit(c, car); c.recast[0] = 2.5; } } }); s.ev.push({ e: 'cast', u: c.id, fx: 'dash' }); },
          recast(s, c, a) { dashDir(c, a.dx, a.dy, 260, 1100, { dmg: 62, onHit(s, c, t) { hurt(s, c, t, 62 * pow(c), { skill: 1 }); } }); s.ev.push({ e: 'cast', u: c.id, fx: 'dash' }); },
        },
        { name: 'Parry', d: 'Half a second of perfect block. Catch a hit to stun the attacker.', cd: 11, range: 0, shape: 'self', instant: true,
          cast(s, c) { c.parryT = .5; s.ev.push({ e: 'cast', u: c.id, fx: 'parry' }); },
        },
        { name: 'Crash', d: 'Leap, untouchable, and land with a stun at the centre.', cd: 45, range: 520, shape: 'circle', r: 190, over: true,
          cast(s, c, a) {
            c.air = .55; c.leap = { sx: c.x, sy: c.y, tx: a.tx, ty: a.ty, t: 0, total: .55, fn(s, c) {
              s.ev.push({ e: 'boom', x: c.x, y: c.y, r: 190, fx: 'crash' });
              let hit = false;
              eachEnemy(s, c, c.x, c.y, 190, t => { hurt(s, c, t, 185 * pow(c), { skill: 1 }); if (t.kind === 'champ') { hit = true; if (Math.hypot(t.x - c.x, t.y - c.y) < 110 + t.r) stun(s, t, 1); else slow(t, .4, 1.5); } });
              if (hit) c.stats.skillHits++;
            } };
          },
        },
      ],
    },
    ione: {
      name: 'Ione', role: 'Mage', blurb: 'Mark them, then break the mark.',
      sight: 850, hp: 500, hpG: 68, dmg: 50, dmgG: 5, armor: 14, armG: 3, range: 440, as: .85, ms: 300, forge: ['edge', 'haste', 'guard'], pref: 405, fit: { top: 1, jungle: 0, bottom: 2, support: 2 },
      kit: [
        { name: 'Sigil Orb', d: 'Marks the first enemy it hits.', cd: 4, range: 640, shape: 'line', w: 42,
          cast(s, c, a) { fire(s, c, a, { speed: 950, range: 640, w: 42, fx: 'orb', filter: 'units', hit(s, c, t, p) { hurt(s, c, t, 82 * pow(c), { skill: 1 }); t.markT = 4; s.ev.push({ e: 'mark', u: t.id }); if (t.kind === 'champ') skillHit(c, p); p.left = 0; } }); },
        },
        { name: 'Rupture', d: 'Ground blast. Breaks marks for double damage and a stun.', cd: 6.5, range: 540, shape: 'circle', r: 115,
          cast(s, c, a) { const car = {}; blast(s, c, a.tx, a.ty, 115, .55, (s, z) => { eachEnemy(s, c, z.x, z.y, 115, t => { const m = t.markT > 0; hurt(s, c, t, (m ? 165 : 75) * pow(c), { skill: 1 }); if (m) { t.markT = 0; if (t.kind === 'champ') stun(s, t, 1); s.ev.push({ e: 'boom', x: t.x, y: t.y, r: 60, fx: 'break' }); } if (t.kind === 'champ') skillHit(c, car); }); }, 'rupture'); },
        },
        { name: 'Cascade', d: 'Three blasts walk forward. Each one marks.', cd: 46, range: 640, shape: 'line', w: 200,
          cast(s, c, a) { const reach = rayWall(c.x, c.y, a.dx, a.dy, 640); [.42, .72, 1.02].forEach((dl, i) => { const k = 220 + i * 200, car = {}; if (k > reach + 60) return; blast(s, c, c.x + a.dx * k, c.y + a.dy * k, 135, dl, (s, z) => { eachEnemy(s, c, z.x, z.y, 135, t => { hurt(s, c, t, 115 * pow(c), { skill: 1 }); t.markT = 4; if (t.kind === 'champ') skillHit(c, car); }); }, 'rupture'); }); },
        },
      ],
    },
    solenne: {
      name: 'Solenne', role: 'Support', blurb: 'Every heal is a shot you can miss.',
      sight: 850, hp: 540, hpG: 76, dmg: 46, dmgG: 5, armor: 20, armG: 3.5, range: 400, as: .85, ms: 310, forge: ['haste', 'guard', 'edge'], pref: 370, support: true, fit: { top: 0, jungle: 0, bottom: 1, support: 3 },
      kit: [
        { name: 'Mending Ray', d: 'Heals the first ally it hits, or burns the first enemy.', cd: 5, range: 680, shape: 'line', w: 46,
          cast(s, c, a) { fire(s, c, a, { speed: 1150, range: 680, w: 46, fx: 'ray', filter: 'allchamp', hit(s, c, t, p) { if (t.team === c.team) { heal(s, c, t, 120 * pow(c)); } else { hurt(s, c, t, 72 * pow(c), { skill: 1 }); slow(t, .3, 1.5); } skillHit(c, p); p.left = 0; } }); },
        },
        { name: 'Aegis', d: 'Place a dome that destroys enemy projectiles.', cd: 12, range: 460, shape: 'circle', r: 135,
          cast(s, c, a) { s.zones.push({ id: s.nid++, kind: 'dome', x: a.tx, y: a.ty, r: 135, t: 2.6, total: 2.6, team: c.team, owner: c }); s.ev.push({ e: 'cast', u: c.id, fx: 'dome' }); },
        },
        { name: 'Daybreak', d: 'Heals allies around you, cleanses stuns and throws enemies back.', cd: 52, range: 0, shape: 'self', r: 340,
          cast(s, c) { blast(s, c, c.x, c.y, 340, .4, (s, z) => {
            for (const e of s.champs) if (e.alive && Math.hypot(e.x - z.x, e.y - z.y) < 340) {
              if (e.team === c.team) { heal(s, c, e, 230 * pow(c)); e.stunT = 0; e.slowT = 0; }
              else { const n = norm(e.x - z.x, e.y - z.y); hurt(s, c, e, 90 * pow(c), { skill: 1 }); dashDir(e, n.x, n.y, 210, 800, { forced: true }); }
            }
            c.stats.skillHits++;
          }, 'heal'); },
        },
      ],
    },
    sable: {
      name: 'Sable', role: 'Assassin', blurb: 'Strike from behind, then be somewhere else.',
      sight: 720, hp: 510, hpG: 74, dmg: 66, dmgG: 8, armor: 18, armG: 3, range: 135, as: 1.05, ms: 335, forge: ['edge', 'haste', 'guard'], pref: 100, melee: true, fit: { top: 2, jungle: 3, bottom: 0, support: 0 },
      kit: [
        { name: 'Rend', d: 'Short slash. Hits half again as hard from behind.', cd: 3.5, range: 240, shape: 'cone', w: 180,
          cast(s, c, a) { let hit = false; s.ev.push({ e: 'cast', u: c.id, fx: 'slash', dx: a.dx, dy: a.dy });
            eachEnemy(s, c, c.x, c.y, 240, t => { const n = norm(t.x - c.x, t.y - c.y); if (n.x * a.dx + n.y * a.dy < .72 || !hasLOS(c.x, c.y, t.x, t.y)) return; const back = (t.fx || 0) * -n.x + (t.fy || 0) * -n.y < -.25; hurt(s, c, t, 92 * pow(c) * (back ? 1.5 : 1), { skill: 1, crit: back }); if (t.kind === 'champ') hit = true; });
            if (hit) c.stats.skillHits++; },
        },
        { name: 'Echo', d: 'Blink away and leave an echo. Cast again to snap back.', cd: 10, range: 320, shape: 'dash', w: 60, over: true,
          cast(s, c, a) { c.echo = { x: c.x, y: c.y }; const f = nearestFree(s.map, a.tx, a.ty); s.ev.push({ e: 'blink', x: c.x, y: c.y }); c.x = f.x; c.y = f.y; c.recast[1] = 3.5; s.ev.push({ e: 'blink', x: c.x, y: c.y }); },
          recast(s, c) { if (!c.echo) return; s.ev.push({ e: 'blink', x: c.x, y: c.y }); c.x = c.echo.x; c.y = c.echo.y; c.echo = null; s.ev.push({ e: 'blink', x: c.x, y: c.y }); },
        },
        { name: 'Reap', d: 'Blink behind a champion. Execute damage. A kill resets it.', cd: 40, range: 480, shape: 'circle', r: 90, over: true,
          cast(s, c, a) { const t = nearChamp(s, c, a.tx, a.ty, 220); if (!t || dist(c, t) > 540) return false; const n = { x: t.fx || 1, y: t.fy || 0 }; s.ev.push({ e: 'blink', x: c.x, y: c.y }); const f = nearestFree(s.map, t.x - n.x * 90, t.y - n.y * 90); c.x = f.x; c.y = f.y; c.fx = n.x; c.fy = n.y; c.reap = { id: t.id, t: 2 }; hurt(s, c, t, (125 * pow(c)) + (t.maxHp - t.hp) * .35, { skill: 1, crit: 1 }); c.stats.skillHits++; s.ev.push({ e: 'blink', x: c.x, y: c.y }); },
        },
      ],
    },
    gravel: {
      name: 'Gravel', role: 'Tank', blurb: 'One good hook moves the whole fight.',
      sight: 680, hp: 720, hpG: 112, dmg: 54, dmgG: 6, armor: 34, armG: 5, range: 190, as: .8, ms: 305, forge: ['guard', 'haste', 'edge'], pref: 150, melee: true, fit: { top: 2, jungle: 2, bottom: 0, support: 3 },
      kit: [
        { name: 'Chain', d: 'Hook the first enemy it hits and drag them to you.', cd: 9, range: 620, shape: 'line', w: 50,
          cast(s, c, a) { fire(s, c, a, { speed: 1050, range: 620, w: 50, fx: 'chain', filter: 'chainable', hit(s, c, t, p) { hurt(s, c, t, 64 * pow(c), { skill: 1 }); const n = norm(c.x - t.x, c.y - t.y), l = Math.max(0, n.l - 90); dashDir(t, n.x, n.y, l, 1300, { forced: true }); t.stunT = Math.max(t.stunT || 0, l / 1300 + .15); if (t.kind === 'champ') skillHit(c, p); p.left = 0; } }); },
        },
        { name: 'Stomp', d: 'Slow everyone around you and harden for a moment.', cd: 8, range: 0, shape: 'self', r: 215,
          cast(s, c) { let hit = false; s.ev.push({ e: 'boom', x: c.x, y: c.y, r: 215, fx: 'stomp' }); eachEnemy(s, c, c.x, c.y, 215, t => { hurt(s, c, t, 62 * pow(c), { skill: 1 }); slow(t, .4, 1.5); if (t.kind === 'champ') hit = true; }); c.drT = 2.5; if (hit) c.stats.skillHits++; },
        },
        { name: 'Avalanche', d: 'Unstoppable charge. Stuns around the first champion you hit.', cd: 48, range: 640, shape: 'line', w: 110, pd: [640, 1000],
          cast(s, c, a) { dashDir(c, a.dx, a.dy, 640, 1000, { unstop: true, champOnly: true, onHit(s, c, t) { c.dash = null; s.ev.push({ e: 'boom', x: c.x, y: c.y, r: 180, fx: 'crash' }); eachEnemy(s, c, c.x, c.y, 180, e => { hurt(s, c, e, 165 * pow(c), { skill: 1 }); if (e.kind === 'champ') stun(s, e, 1.25); }, true); c.stats.skillHits++; } }); s.ev.push({ e: 'cast', u: c.id, fx: 'dash' }); },
        },
      ],
    },
  };

  // ---------- roles ----------
  const ROLES = ['top', 'jungle', 'bottom', 'support'];
  const ROLE_INFO = {
    top: { name: 'Top', blurb: 'Hold the top lane alone. More XP and health while no ally is near.' },
    jungle: { name: 'Jungle', blurb: 'Clear camps, surprise lanes, take the Colossus. Hits monsters harder.' },
    bottom: { name: 'Bottom', blurb: 'Farm the bottom lane. Extra gold from minion last hits.' },
    support: { name: 'Support', blurb: 'Stay with your carry. Share their rewards and heal and shield more.' },
  };
  // A champion's strength in the role it holds, 0 to 1. Every bonus scales with this.
  const roleK = (c, role) => c.role === role ? (KITS[c.champ].fit[role] || 0) / 3 : 0;
  // Best role per champion, each role used once. `taken` lists roles already held.
  function autoRoles(champIds, taken = []) {
    const free = ROLES.filter(r => !taken.includes(r)), n = Math.min(champIds.length, free.length);
    let best = [], top = -1;
    const walk = (i, cur, sum) => {
      if (i === n) { if (sum > top) { top = sum; best = cur.slice(); } return; }
      const fit = KITS[champIds[i]].fit;
      for (const r of free) if (!cur.includes(r)) { cur.push(r); walk(i + 1, cur, sum + (fit[r] || 0) + (fit[r] ? .01 : 0)); cur.pop(); }
    };
    walk(0, [], 0);
    return champIds.map((_, i) => best[i] || ROLES[i % ROLES.length]);
  }
  function teamRoles(list) {
    const taken = [], out = list.map(p => { const ok = ROLES.includes(p.role) && !taken.includes(p.role); if (ok) taken.push(p.role); return ok ? p.role : null; });
    const miss = out.map((r, i) => r ? -1 : i).filter(i => i >= 0), auto = autoRoles(miss.map(i => list[i].champ), taken);
    miss.forEach((i, k) => { out[i] = auto[k]; });
    return out;
  }
  // Top's solo bonus applies while no allied champion is within 900.
  function updateSolo(s, c) {
    if (c.role !== 'top' || !c.alive) return;
    const solo = !s.champs.some(o => o !== c && o.alive && o.team === c.team && dist(o, c) < 900);
    if (solo !== c.solo) { c.solo = solo; applyStats(c, true); }
  }
  // A nearby support gets half of what an ally's kill paid, scaled by fit.
  function supportShare(s, src, x, y, gold, xp) {
    if (!src || src.kind !== 'champ') return;
    for (const c of s.champs) {
      if (c === src || c.team !== src.team || !c.alive || c.role !== 'support' || Math.hypot(c.x - x, c.y - y) > 850) continue;
      const k = roleK(c, 'support') * .5; if (k) { c.gold += gold * k; giveXp(s, c, xp * k); }
    }
  }

  // ---------- match ----------
  // Hands a seat to a bot or back to a person, mid-match. Used when a networked friend drops or returns.
  function setBot(s, c, on) {
    c.q.length = 0; c.mv.x = c.mv.y = 0; c.atk = false; c.atkPref = 0; c.preferTower = false;
    if (on) { if (!c.bot) c.bot = makeBot(s, c); c.human = false; }
    else { c.bot = undefined; c.human = true; }
  }

  function createMatch(cfg) {
    const s = {
      t: 0, tick: 0, nid: 1, rand: rng(cfg.seed || 7), map: buildMap(), champs: [], minions: [], towers: [], monsters: [], proj: [], zones: [], ev: [], over: null,
      nextWave: 8, wave: 0, bossAt: 240, kills: [0, 0], buff: [0, 0], camps: [], gaps: {}, navLeft: 2, hope: 50, hopeTeam: -1, sites: [],
      laneInfo: [[{}, {}], [{}, {}]],
      ai: [0, 1].map(() => ({ defend: null, hoard: null, hoardGo: false, push: null, pushUntil: 0, thp: {}, sites: {}, help: {}, focus: 0 })),
    };
    s.fountains = s.map.fountains;
    const mir = (x, team) => team ? W - x : x;
    [0, 1].forEach(team => {
      const mk = (x, y, kind, lane, tier) => {
        const hp = kind === 'core' ? 3000 : tier === 0 ? 1450 : 1850;
        s.towers.push({ id: s.nid++, kind: 'tower', sub: kind, team, x: mir(x, team), y, px: mir(x, team), py: y, r: kind === 'core' ? 54 : 36, hp, maxHp: hp, armor: 30, range: kind === 'core' ? 420 : 380, sight: 750, alive: true, cd: 0, lane, tier, stack: 0, last: null, vx: 0, vy: 0 });
      };
      for (const lane of [0, 1]) { const f = y => lane ? H - y : y; mk(1480, f(402), 'tower', lane, 0); mk(800, f(640), 'tower', lane, 1); }
      mk(340, H / 2, 'core', -1, 2);
    });
    // Jungle: four quadrants, each with a small trio and one heavy
    for (const [mx, my] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const px = x => mx ? W - x : x, py = y => my ? H - y : y;
      s.camps.push({ id: s.camps.length, x: px(1130), y: py(810), big: false, at: 30, alive: false, side: mx });
      s.camps.push({ id: s.camps.length, x: px(1640), y: py(810), big: true, at: 45, alive: false, side: mx });
    }
    // Civilian sites: two per quadrant, nudged onto open ground if a position is walled.
    for (const [mx, my] of [[0, 0], [1, 0], [0, 1], [1, 1]]) for (const [x, y] of [[1400, 810], [1880, 810]]) {
      const f = nearestFree(s.map, mx ? W - x : x, my ? H - y : y);
      s.sites.push({ id: s.sites.length, x: f.x, y: f.y, alive: true, at: 0, prog: [0, 0], need: 2.5, con: {} });
    }
    rebuildNav(s);
    cfg.teams.forEach((list, team) => { const roles = teamRoles(list); list.forEach((p, i) => {
      const k = KITS[p.champ], role = roles[i];
      const c = {
        id: s.nid++, kind: 'champ', team, slot: i, role, solo: false, atkPref: 0, champ: p.champ, pname: p.name, tier: p.tier || 0, human: !!p.human, remote: !!p.remote, skill: p.skill,
        x: mir(180, team), y: H / 2 + (i - 1.5) * 46, r: 26, sight: k.sight, lvl: 1, xp: 0, gold: 300, up: { edge: 0, guard: 0, haste: 0 },
        hp: k.hp, maxHp: k.hp, armor: k.armor, dmgBase: k.dmg, range: k.range, msBase: k.ms, as: k.as, kit: k.kit,
        alive: true, respawn: 0, atkCd: 0, lock: 0, fx: team ? -1 : 1, fy: 0, cd: [0, 0, 0], recast: [0, 0, 0], q: [], mv: { x: 0, y: 0 }, atk: false,
        stunT: 0, slowT: 0, slowA: 0, markT: 0, parryT: 0, drT: 0, air: 0, buffT: 0, empowerT: 0, revealT: 0, vx: 0, vy: 0, assist: {}, charge: null, chan: null, dash: null, leap: null, inBrush: -1, recentHit: 0,
        stats: { casts: 0, skillHits: 0, parries: 0, kills: 0, deaths: 0, assists: 0, dmg: 0 },
      };
      c.px = c.x; c.py = c.y;
      if (!p.human) c.bot = makeBot(s, c);
      s.champs.push(c);
    }); });
    return s;
  }

  const towerOpen = (s, t) => {
    if (t.sub === 'core') return s.towers.some(o => o.team === t.team && o.sub === 'tower' && o.tier === 1 && !o.alive);
    if (t.tier === 1) return !s.towers.some(o => o.team === t.team && o.lane === t.lane && o.tier === 0 && o.alive);
    return true;
  };

  // Fog of war. Sources are rebuilt once per tick and work the same on a guest's reconstructed state.
  function visionSources(s, team) {
    const cache = s.vis || (s.vis = { tick: -1, list: [null, null] });
    if (cache.tick !== s.tick) { cache.tick = s.tick; cache.list[0] = cache.list[1] = null; }
    if (cache.list[team]) return cache.list[team];
    const out = [];
    for (const c of s.champs) if (c.team === team && c.alive) out.push({ x: c.x, y: c.y, r: c.sight || 800 });
    for (const t of s.towers) if (t.team === team && t.alive) out.push({ x: t.x, y: t.y, r: t.sight || 750 });
    for (const m of s.minions) if (m.team === team && m.alive && !(m.delay > 0)) out.push({ x: m.x, y: m.y, r: m.sight || 500 });
    return cache.list[team] = out;
  }
  function canSee(s, team, u) {
    if (u.team === team || u.kind === 'tower' || u.revealT > 0) return true;
    if (u.inBrush !== undefined && u.inBrush >= 0 && !s.champs.some(c => c.team === team && c.alive && c.inBrush === u.inBrush)) return false;
    for (const v of visionSources(s, team)) if ((v.x - u.x) * (v.x - u.x) + (v.y - u.y) * (v.y - u.y) < v.r * v.r) return true;
    return false;
  }

  function heal(s, src, t, amt) { amt *= 1 + .15 * roleK(src, 'support'); const a = Math.min(amt, t.maxHp - t.hp); t.hp += a; s.ev.push({ e: 'heal', u: t.id, a: Math.round(amt) }); }

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
    for (const z of s.zones) if (z.kind === 'dome' && z.team === t.team && Math.hypot(z.x - t.x, z.y - t.y) < z.r) { a *= 1 - .25 * (1 + .15 * roleK(z.owner, 'support')); break; }
    // Structures weaken late so a match always reaches an ending.
    if (t.kind === 'tower') a *= s.t < 360 ? .8 + Math.max(0, s.t - 240) / 600 : 1 + (s.t - 360) / 130;
    if (src && src.kind === 'champ' && src.team === s.hopeTeam) a *= 1.08;
    if (t.kind === 'monster' && src && src.kind === 'champ') { t.hitAt = s.t; if (!t.tgt) t.tgt = src; a *= 1 + .35 * roleK(src, 'jungle'); }
    t.hp -= a;
    if (t.chan && t.chan.recall) t.chan = null;
    if (t.kind === 'champ') for (const z of s.sites) if (z.con[t.id]) z.con[t.id] = 0;
    if (src && src.kind === 'champ') { src.stats.dmg += a; src.revealT = 1.2; if (t.kind === 'champ') { t.assist[src.id] = s.t; src.recentHit = s.t; } }
    s.ev.push({ e: 'hit', u: t.id, a: Math.round(a), sk: o.skill ? 1 : 0, crit: o.crit ? 1 : 0, by: src ? src.id : 0 });
    if (t.hp <= 0) kill(s, src, t);
    return a;
  }

  function giveXp(s, c, xp) {
    if (c.lvl >= 10) return; if (c.solo) xp *= 1 + .2 * roleK(c, 'top'); c.xp += xp;
    while (c.lvl < 10 && c.xp >= xpNeed(c.lvl)) { c.xp -= xpNeed(c.lvl); c.lvl++; applyStats(c, true); s.ev.push({ e: 'level', u: c.id }); }
  }
  const xpNeed = l => 180 + 110 * (l - 1);
  function applyStats(c, keepFrac) {
    const k = KITS[c.champ], f = c.hp / c.maxHp;
    c.maxHp = (k.hp + k.hpG * (c.lvl - 1) + c.up.guard * 180) * (c.solo ? 1 + .08 * roleK(c, 'top') : 1);
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
      t.deaths = (t.deaths || 0) + 1; t.stats.deaths++; if (t.bot) t.bot.deaths.push(s.t); t.respawn = 5 + t.lvl * 1.6 + s.t / 120; t.chan = t.dash = t.charge = t.leap = null; t.air = 0;
      s.kills[et]++;
      let multi = 1;
      if (src && src.kind === 'champ') { multi = s.t - (src.lastKill || -99) < 10 ? (src.multi || 1) + 1 : 1; src.multi = multi; src.lastKill = s.t; }
      const first = !s.firstBlood; s.firstBlood = true;
      if (src && src.kind === 'champ') { src.gold += 260; src.stats.kills++; giveXp(s, src, 120 + 16 * t.lvl); s.ev.push({ e: 'gold', u: src.id, a: 260 }); }
      for (const id in t.assist) if (s.t - t.assist[id] < 9 && (!src || +id !== src.id)) { const a = s.champs.find(c => c.id === +id); if (a) { a.gold += 130; a.stats.assists++; giveXp(s, a, 70); } }
      supportShare(s, src, t.x, t.y, 130, 70);
      t.assist = {};
      s.ev.push({ e: 'feed', a: src ? src.id : 0, b: t.id, multi, first });
    } else if (t.kind === 'minion') {
      const near = teamNear(s, et, t.x, t.y, 850);
      near.forEach(c => { giveXp(s, c, 42 / Math.max(1, near.length * .7)); if (c !== src) c.gold += 7; });
      if (src && src.kind === 'champ') { const g = Math.round(22 * (1 + .25 * roleK(src, 'bottom'))); src.gold += g; s.ev.push({ e: 'gold', u: src.id, a: g }); supportShare(s, src, t.x, t.y, 22, 28); }
    } else if (t.kind === 'monster') {
      if (t.boss) {
        s.buff[src ? src.team : 0] = 1; const team = src ? src.team : 0;
        s.champs.filter(c => c.team === team).forEach(c => { c.buffT = 90; c.gold += 120; giveXp(s, c, 160); });
        s.bossAt = s.t + 210; s.ev.push({ e: 'boss', team });
      } else {
        const near = teamNear(s, src ? src.team : 0, t.x, t.y, 700);
        near.forEach(c => { giveXp(s, c, (t.big ? 130 : 44)); c.gold += (t.big ? 95 : 32) * (1 + .3 * roleK(c, 'jungle')); });
        supportShare(s, src, t.x, t.y, t.big ? 95 : 32, t.big ? 130 : 44);
        const camp = s.camps[t.camp]; camp.left--; if (camp.left <= 0) { camp.alive = false; camp.at = s.t + 70; }
      }
    } else if (t.kind === 'tower') {
      s.champs.filter(c => c.team === et).forEach(c => { c.gold += 140; giveXp(s, c, 70); });
      rebuildNav(s);
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
      s.minions.push({ id: s.nid++, kind: 'minion', team, lane, x, y, px: x, py: y, r: ranged ? 14 : 17, sight: 500, hp, maxHp: hp, armor: 10, dmg: (ranged ? 28 : 22) * scale, range: ranged ? 300 : 95, ranged, ms: 215, as: .9, alive: true, cd: 0, wp: 1, path, stunT: 0, slowT: 0, slowA: 0, markT: 0, vx: 0, vy: 0, delay: i * .45, fx: team ? -1 : 1, fy: 0 });
    }
  }
  const CAMP_LEASH = 280, BOSS_LEASH = 350;
  function spawnCamp(s, camp) {
    camp.alive = true; const n = camp.big ? 1 : 3; camp.left = n;
    for (let i = 0; i < n; i++) {
      const a = i * 2.1, off = camp.big ? 0 : 55, hp = (camp.big ? 1050 : 400) * (1 + s.t / 900);
      const x = camp.x + Math.cos(a) * off, y = camp.y + Math.sin(a) * off;
      s.monsters.push({ id: s.nid++, kind: 'monster', team: 2, camp: camp.id, big: camp.big, x, y, px: x, py: y, hx: x, hy: y, r: camp.big ? 32 : 19, leash: CAMP_LEASH, hp, maxHp: hp, armor: 18, dmg: (camp.big ? 44 : 20) * (1 + s.t / 900), range: 110, ms: 260, as: .9, alive: true, cd: 0, tgt: null, stunT: 0, slowT: 0, slowA: 0, markT: 0, vx: 0, vy: 0, fx: 1, fy: 0 });
    }
  }
  function spawnBoss(s) {
    const hp = 7000 * (1 + s.t / 1200), x = W / 2, y = H / 2;
    s.monsters.push({ id: s.nid++, kind: 'monster', team: 2, boss: true, x, y, px: x, py: y, hx: x, hy: y, r: 58, leash: BOSS_LEASH, hp, maxHp: hp, armor: 45, dmg: 150, range: 170, ms: 170, as: .7, alive: true, cd: 0, slam: 3, tgt: null, stunT: 0, slowT: 0, slowA: 0, markT: 0, vx: 0, vy: 0, fx: 1, fy: 0 });
    s.bossUp = true; s.ev.push({ e: 'bossup' });
  }

  // ---------- the people ----------
  const HOPE_DRIFT = .012;
  function setHope(s, v) {
    s.hope = clamp(v, 0, 100);
    // A little hysteresis, so slow drift can't flap the bonus on and off around the line.
    const on0 = s.hopeTeam === 0 ? s.hope >= 66 : s.hope >= 70, on1 = s.hopeTeam === 1 ? s.hope <= 34 : s.hope <= 30;
    const now = on0 ? 0 : on1 ? 1 : -1;
    if (now === s.hopeTeam) return;
    if (s.hopeTeam >= 0) s.ev.push({ e: 'hope', team: s.hopeTeam, on: false });
    if (now >= 0) s.ev.push({ e: 'hope', team: now, on: true });
    s.hopeTeam = now;
  }
  function captureSite(s, z, team) {
    let cap = null, top = -1;
    for (const c of s.champs) if (c.team === team && (z.con[c.id] || 0) > top) { top = z.con[c.id] || 0; cap = c; }
    z.alive = false; z.at = s.t + 60; z.prog[0] = z.prog[1] = 0; z.con = {};
    s.ev.push({ e: 'civ', team, x: z.x, y: z.y, id: z.id });
    setHope(s, s.hope + (team ? -6 : 6));
    for (const c of s.champs) {
      if (c.team !== team || !c.alive) continue;
      if (c === cap) { c.gold += 45; giveXp(s, c, 60); s.ev.push({ e: 'gold', u: c.id, a: 45 }); }
      else if (Math.hypot(c.x - z.x, c.y - z.y) < 850) { c.gold += 20; giveXp(s, c, 30); }
    }
  }
  // Standing in a ring with no enemy in it builds progress. Stepping out drains it,
  // an enemy in the ring freezes it, and taking damage clears that champion's share.
  function stepSites(s) {
    for (const z of s.sites) {
      if (!z.alive) { if (s.t >= z.at) { z.alive = true; z.prog[0] = z.prog[1] = 0; z.con = {}; } continue; }
      let n0 = 0, n1 = 0;
      for (const c of s.champs) if (c.alive && !c.air && Math.hypot(c.x - z.x, c.y - z.y) < 130) { if (c.team) n1++; else n0++; }
      z.prog[0] = z.prog[1] = 0;
      for (const c of s.champs) {
        const here = c.alive && !c.air && Math.hypot(c.x - z.x, c.y - z.y) < 130, foes = c.team ? n0 : n1;
        let v = z.con[c.id] || 0;
        if (here && !foes) v += DT; else if (!here) v = Math.max(0, v - DT);
        if (v > 0) z.con[c.id] = v; else delete z.con[c.id];
        z.prog[c.team] += v;
      }
      if (z.prog[0] >= z.need) captureSite(s, z, 0); else if (z.prog[1] >= z.need) captureSite(s, z, 1);
    }
  }

  function homing(s, src, t, dmg, speed, fx, extra) { s.proj.push(Object.assign({ id: s.nid++, x: src.x, y: src.y, px: src.x, py: src.y, target: t, speed, dmg, team: src.team, owner: src, fx, w: 14, homing: true, age: 0 }, extra)); }

  function nearestFoe(s, u, r, opts = {}) {
    let best = null, bd = r;
    const list = opts.champsOnly ? s.champs : (opts.noChamps ? [...s.minions, ...s.monsters] : [...s.champs, ...s.minions, ...s.monsters, ...(opts.towers ? s.towers : [])]);
    for (const e of list) {
      if (!e.alive || e.air || e.team === u.team || (e.kind === 'champ' && !canSee(s, u.team, e))) continue;
      if (e.kind === 'tower' && !towerOpen(s, e)) continue;
      const d = dist(u, e) - e.r;
      if (d < bd && (!opts.los || hasLOS(u.x, u.y, e.x, e.y))) { bd = d; best = e; }
    }
    return best;
  }

  function autoTarget(s, c) {
    // Champion first when one is in range, then minions and monsters, then structures.
    const r = c.range;
    if (c.atkPref) {
      const p = [s.minions, s.monsters, s.champs, s.towers].map(l => l.find(u => u.id === c.atkPref)).find(Boolean);
      if (p && p.alive && !p.air && p.team !== c.team && dist(c, p) - p.r < r && (p.kind !== 'tower' || towerOpen(s, p)) && (p.kind !== 'champ' || canSee(s, c.team, p)) && hasLOS(c.x, c.y, p.x, p.y)) return p;
    }
    const structure = () => { let b = null, bd = r; for (const t of s.towers) if (t.alive && t.team !== c.team && towerOpen(s, t)) { const d = dist(c, t) - t.r; if (d < bd && hasLOS(c.x, c.y, t.x, t.y)) { bd = d; b = t; } } return b; };
    const champ = nearestFoe(s, c, r, { champsOnly: true, los: true }); if (champ) return champ;
    if (c.preferTower) { const t = structure(); if (t) return t; }
    return nearestFoe(s, c, r, { noChamps: true, los: true }) || structure();
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
    // Ground-targeted circles need line of sight and land at the last visible point.
    if (a.shape === 'circle' && !a.over && aim.d > 0) { aim.d = rayWall(c.x, c.y, dx, dy, aim.d); aim.tx = c.x + dx * aim.d; aim.ty = c.y + dy * aim.d; }
    if (c.recast[q.slot] > 0 && a.recast) { a.recast(s, c, aim); c.recast[q.slot] = 0; c.fx = dx; c.fy = dy; return; }
    if (c.cd[q.slot] > 0) return;
    if (a.cast(s, c, aim) === false) return;
    const cdr = 1 - c.up.haste * .08;
    c.cd[q.slot] = q.slot === 1 && c.champ === 'kade' ? a.cd : a.cd * cdr;
    c.stats.casts++; c.fx = dx; c.fy = dy; c.spin = 1;
    if (c.chan && c.chan.recall) c.chan = null;
  }

  // One tick of walking from c.mv. Shared with the guest's local prediction, so both agree.
  function walk(s, c) {
    const m = Math.min(1, Math.hypot(c.mv.x, c.mv.y));
    if (m > .05) {
      const n = norm(c.mv.x, c.mv.y); let sp = c.msBase * (c.slowT > 0 ? 1 - c.slowA : 1);
      if (c.charge) sp *= .6; if (c.buffT > 0) sp *= 1.05;
      c.x += n.x * sp * m * DT; c.y += n.y * sp * m * DT;
      if (!c.charge) { c.fx = n.x; c.fy = n.y; }
    }
    pushOut(s.map, c);
  }
  function towerPush(s, c) { for (const t of s.towers) if (t.alive) { const d = dist(c, t), mn = c.r + t.r - 8; if (d < mn && d > .1) { c.x = t.x + (c.x - t.x) / d * mn; c.y = t.y + (c.y - t.y) / d * mn; } } }

  function stepChamp(s, c) {
    c.px = c.x; c.py = c.y;
    if (!c.alive) {
      // The only command a dead champion can use is the forge.
      while (c.q.length) { const q = c.q.shift(); if (q.t === 'forge') forge(s, c, q.track); }
      c.respawn -= DT;
      if (c.respawn <= 0) {
        c.alive = true; c.hp = c.maxHp; c.spawnT = s.t; const f = s.fountains[c.team]; c.x = c.px = f.x + (c.team ? -50 : 50); c.y = c.py = f.y + (c.slot - 1.5) * 40; c.q.length = 0; c.stunT = c.slowT = c.markT = 0; s.ev.push({ e: 'spawn', u: c.id });
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
      else if (q.t === 'cancel') { c.charge = null; if (c.chan && c.chan.slot !== undefined) { c.cd[c.chan.slot] = 0; c.chan = null; c.stats.casts--; s.ev.push({ e: 'cancelled', u: c.id }); } }
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
    } else if (c.stunT <= 0 && c.lock <= 0) walk(s, c);
    towerPush(s, c);

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
    const f = s.fountains[c.team]; if (dist(c, f) < FOUNTAIN_HEAL_R) { c.hp = Math.min(c.maxHp, c.hp + c.maxHp * .45 * DT); }
    const ef = s.fountains[1 - c.team]; if (dist(c, ef) < FOUNTAIN_BURN_R && !c.air) { hurt(s, null, c, 900 * DT); }
    c.hp = Math.min(c.maxHp, c.hp + (c.maxHp * .004) * DT);

    // brush
    c.inBrush = -1; s.map.brush.forEach((b, i) => { if (Math.hypot(c.x - b.x, c.y - b.y) < b.r) c.inBrush = i; });
    c.vx = (c.x - c.px) / DT; c.vy = (c.y - c.py) / DT;
    c.gold += 2.6 * DT;
  }

  function forge(s, c, track) {
    const n = c.up[track]; if (n === undefined || n >= 3) return false;
    const cost = FORGE_COST[n]; if (c.gold < cost) return false;
    c.gold -= cost; c.up[track]++; applyStats(c, true);
    if (!c.alive) c.hp = 0; else if (track === 'guard') c.hp = Math.min(c.maxHp, c.hp + 180);
    s.ev.push({ e: 'forge', u: c.id, track }); return true;
  }

  function stepMinion(s, m) {
    m.px = m.x; m.py = m.y; if (m.delay > 0) { m.delay -= DT; return; }
    if (m.stunT > 0) m.stunT -= DT; if (m.slowT > 0) m.slowT -= DT; if (m.markT > 0) m.markT -= DT; if (m.cd > 0) m.cd -= DT;
    if (m.dash) { const D = m.dash; const st = Math.min(DT, D.t); m.x += D.vx * st; m.y += D.vy * st; D.t -= DT; if (D.t <= 0) m.dash = null; pushOut(s.map, m); return; }
    if (m.stunT > 0) return;
    let t = null, bd = 340;
    // protect allied champions that are being hit by enemy champions
    for (const e of s.champs) if (e.alive && !e.air && e.team !== m.team && e.recentHit && s.t - e.recentHit < 1.5 && canSee(s, m.team, e)) { const d = dist(m, e); if (d < 420 && hasLOS(m.x, m.y, e.x, e.y)) { t = e; break; } }
    if (!t) for (const e of s.minions) if (e.alive && e.team !== m.team && e.delay <= 0) { const d = dist(m, e) - e.r; if (d < bd && hasLOS(m.x, m.y, e.x, e.y)) { bd = d; t = e; } }
    if (!t) for (const e of s.towers) if (e.alive && e.team !== m.team && towerOpen(s, e)) { const d = dist(m, e) - e.r; if (d < bd + 40 && hasLOS(m.x, m.y, e.x, e.y)) { bd = d; t = e; } }
    if (!t) for (const e of s.champs) if (e.alive && !e.air && e.team !== m.team && canSee(s, m.team, e)) { const d = dist(m, e) - e.r; if (d < bd * .7 && hasLOS(m.x, m.y, e.x, e.y)) { bd = d; t = e; } }
    const sp = m.ms * (m.slowT > 0 ? 1 - m.slowA : 1);
    if (t) {
      const d = dist(m, t) - t.r;
      if (d > m.range - 6) { const n = norm(t.x - m.x, t.y - m.y); m.x += n.x * sp * DT; m.y += n.y * sp * DT; m.fx = n.x; m.fy = n.y; }
      else if (m.cd <= 0) { m.cd = 1 / m.as; const dmg = t.kind === 'tower' ? m.dmg * 1.1 : m.dmg; s.ev.push({ e: 'matk', u: m.id }); if (m.ranged) homing(s, m, t, dmg, 800, 'mbolt'); else hurt(s, m, t, dmg); }
    } else if (m.wp < m.path.length) {
      const [wx, wy] = m.path[m.wp]; const n = norm(wx - m.x, wy - m.y);
      if (n.l < 40) m.wp++; else { m.x += n.x * sp * DT; m.y += n.y * sp * DT; m.fx = n.x; m.fy = n.y; }
    }
    pushOut(s.map, m);
    m.vx = (m.x - m.px) / DT; m.vy = (m.y - m.py) / DT;
  }

  function stepMonster(s, m) {
    m.px = m.x; m.py = m.y; if (m.stunT > 0) { m.stunT -= DT; return; } if (m.slowT > 0) m.slowT -= DT; if (m.markT > 0) m.markT -= DT; if (m.cd > 0) m.cd -= DT;
    // A monster never fights outside its own patch: past the leash it drops its target and walks home.
    const leash = m.leash, homeD = o => Math.hypot(o.x - m.hx, o.y - m.hy);
    let t = m.tgt;
    if (t && (!t.alive || t.air || homeD(t) > leash || homeD(m) > leash)) t = m.tgt = null;
    if (!t && homeD(m) <= leash) {
      // Monsters wake when hit by anyone standing close.
      const last = s.champs.filter(c => c.alive && dist(c, m) < 300 && homeD(c) <= leash && s.t - (m.hitAt || -9) < 2)[0];
      if (last) t = m.tgt = last;
    }
    if (m.boss && t) {
      m.slam -= DT;
      if (m.slam <= 0) { m.slam = 4; const tx = t.x, ty = t.y; s.zones.push({ id: s.nid++, kind: 'blast', x: tx, y: ty, r: 170, t: 1, total: 1, team: 2, owner: m, fx: 'crash', fn(s, z) { for (const e of s.champs) if (e.alive && !e.air && Math.hypot(e.x - z.x, e.y - z.y) < 170 + e.r) { hurt(s, m, e, 200); slow(e, .35, 1); } s.ev.push({ e: 'boom', x: z.x, y: z.y, r: 170, fx: 'crash' }); } }); }
    }
    if (t) {
      const d = dist(m, t) - t.r;
      if (d > m.range - 8 || !hasLOS(m.x, m.y, t.x, t.y)) {
        const n = norm(t.x - m.x, t.y - m.y); m.x += n.x * m.ms * DT; m.y += n.y * m.ms * DT; m.fx = n.x; m.fy = n.y;
        pushOut(s.map, m);
        if (homeD(m) > leash) { const h = norm(m.x - m.hx, m.y - m.hy); m.x = m.hx + h.x * leash; m.y = m.hy + h.y * leash; pushOut(s.map, m); m.tgt = null; }
      } else if (m.cd <= 0) { m.cd = 1 / m.as; hurt(s, m, t, m.dmg); s.ev.push({ e: 'matk', u: m.id }); }
    } else {
      const n = norm(m.hx - m.x, m.hy - m.y); if (n.l > 8) { m.x += n.x * 320 * DT; m.y += n.y * 320 * DT; pushOut(s.map, m); } else m.hp = Math.min(m.maxHp, m.hp + m.maxHp * .25 * DT);
    }
    m.vx = (m.x - m.px) / DT; m.vy = (m.y - m.py) / DT;
  }

  const TOWER_BASE = 160, TOWER_RAMP = .24;
  function stepTower(s, t) {
    if (t.cd > 0) t.cd -= DT; if (t.cd > 0) return;
    let target = null, bd = t.range;
    for (const c of s.champs) if (c.alive && !c.air && c.team !== t.team && c.recentHit && s.t - c.recentHit < 2 && dist(c, t) < t.range) { target = c; break; }
    if (!target) for (const m of s.minions) if (m.alive && m.team !== t.team && m.delay <= 0) { const d = dist(m, t); if (d < bd) { bd = d; target = m; } }
    if (!target) { bd = t.range; for (const c of s.champs) if (c.alive && !c.air && c.team !== t.team) { const d = dist(c, t); if (d < bd) { bd = d; target = c; } } }
    if (!target) { t.last = null; t.stack = 0; return; }
    t.stack = t.last === target.id ? t.stack + 1 : 0; t.last = target.id; t.cd = 1.1;
    // Each consecutive shot on the same target hits 45% harder, compounding, capped at 4x.
    const ramp = Math.min(4, Math.pow(1.45, t.stack));
    const base = target.kind === 'champ' ? (TOWER_BASE + s.t * TOWER_RAMP) * ramp : target.maxHp * .42 * (1 + (target.armor || 0) / 100);
    homing(s, t, target, base, 1000, 'tower');
    s.ev.push({ e: 'tshot', u: t.id, t: target.id, n: t.stack });
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
        const st = Math.hypot(p.vx, p.vy) * DT, k = st > p.left ? p.left / st : 1; p.x += p.vx * DT * k; p.y += p.vy * DT * k; p.left -= st;
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
        if (p.left <= 0) { p.dead = true; if (p.wall) s.ev.push({ e: 'phit', x: p.x, y: p.y, fx: p.fx }); }
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

  // Bot brains. Concatenated into the Sim closure by build.py at the marker in game.js, so it shares all of Sim's private helpers.
// Flipside 4.0: bots act only through the same inputs a person has. They know only what their
// team can see (Sim.canSee), remember last-seen positions with fading confidence, and every
// decision scales with one continuous skill value 0..1 per bot.

  // ---------- skill: one number, 0 (beginner) to 1 (superb) ----------
  function skillProfile(v) {
    v = clamp(v === undefined || v === null || isNaN(v) ? .5 : v, 0, 1);
    const L = (a, b) => a + (b - a) * v, P = (a, b, e) => b + (a - b) * Math.pow(1 - v, e);
    return {
      v,
      think: L(.3, .085),            // seconds between decisions
      react: L(.62, .09),            // seconds to notice a telegraph
      err: P(.3, .012, 1.6),         // aim error in radians
      lead: L(.42, 1.05),            // how far ahead of a moving target it leads
      dodge: Math.pow(v, 1.4),       // chance of even trying to dodge a given shot
      wrongWay: (1 - v) * .45,       // chance a dodge goes the wrong way
      gap: L(1.15, .12),             // seconds between abilities
      lh: P(.2, .98, 1.25),          // chance a killable minion is even noticed
      lhErr: P(.32, .008, 1.5),      // last-hit timing error, in fractions of a hit
      judge: L(.55, .03),            // noise on fight judgement
      iq: v,                         // general decision quality
      macro: v,                      // objective, rotation and recall quality
      combo: Math.pow(v, 1.2),       // chance a combo is sequenced properly rather than mashed
      aggr: 1,
      low: L(.2, .36),               // health fraction that sends it home
      see: L(620, 1150),             // tunnel vision: how far away it notices targets
      mem: L(3, 20),                 // seconds a remembered enemy position stays useful
      guard: L(.25, 1),              // how strongly recent deaths make it play safe
    };
  }

  const CLASS = { vesper: 'back', ione: 'back', solenne: 'peel', kade: 'front', gravel: 'front', sable: 'flank' };
  function makeBot(s, c, skill) {
    const i = c.slot, b = {
      skill: 0, sk: null, lane: c.role === 'top' ? 0 : 1, cls: CLASS[c.champ] || 'front', mask: navMask(c.team), next: i * .05 + .02, foes: [], tid: 0, closest: 1e9, ratio: 1, noise: 0, noiseAt: 0, strafe: i % 2 ? 1 : -1,
      gx: c.x, gy: c.y, ga: 20, hasGoal: false, vx: 0, vy: 0, vecT: 0, ex: 0, ey: 0, evadeT: 0, dodgeAt: 0, dodgeSeen: 0, path: null, pi: 0, pgx: 0, pgy: 0, needPath: false, sx: c.x, sy: c.y, stuck: 0, still: false, diveOk: false,
      et: null, etTanks: 0, castAt: 0, chargeHold: 1.12, threatT: 9, parry: false, low: false, fighting: false, lhSoon: false, lastHome: 0, gank: null, gankCd: 0, deaths: [], siegeT: 0,
      route: null, routeI: 0, cycles: 0, gankReady: false, chase: 0, noChase: 0, tradeT: 0, task: 'spawn', safeUntil: 0,
      setSkill(x) { b.skill = clamp(x, 0, 1); b.sk = skillProfile(b.skill); },
    };
    b.setSkill(skill !== undefined ? skill : c.skill !== undefined ? c.skill : .5);
    return b;
  }

  // ---------- bots: navigation ----------
  // The nav grid sits beside the collision grid. Each cell holds bits: walls, standing
  // towers, a fountain a team must not enter, and tower range (costly, not forbidden).
  const NAV_WALL = 1, NAV_TOWER = 2, NAV_NO0 = 4, NAV_NO1 = 8, NAV_T0 = 16, NAV_T1 = 32;
  // Search buffers are sized from the first map, whatever its dimensions are.
  let navG = null, navFrom = null, navSeen = null, navDone = null, heapK = null, heapF = null, navCap = 0;
  let navRun = 0;
  function navBuffers(m) {
    const n = m.cols * m.rows; if (n <= navCap) return;
    navCap = n; navG = new Float32Array(n); navFrom = new Int32Array(n); navSeen = new Uint32Array(n); navDone = new Uint32Array(n);
    heapK = new Int32Array(n * 8); heapF = new Float32Array(n * 8);
  }
  const navMask = team => NAV_WALL | NAV_TOWER | (team ? NAV_NO1 : NAV_NO0);

  function rebuildNav(s) {
    const m = s.map, c = m.cols, r = m.rows;
    navBuffers(m);
    const nav = m.nav || (m.nav = new Uint8Array(c * r)), clr = m.clr || (m.clr = new Uint8Array(c * r));
    const [f0, f1] = s.fountains;
    for (let j = 0; j < r; j++) for (let i = 0; i < c; i++) {
      const k = j * c + i, x = i * 40 + 20, y = j * 40 + 20;
      let b = m.grid[k] ? NAV_WALL : 0;
      for (const t of s.towers) {
        if (!t.alive) continue;
        const d = Math.hypot(x - t.x, y - t.y);
        if (d < t.r + 50) b |= NAV_TOWER;
        if (d < t.range + 20) b |= t.team ? NAV_T1 : NAV_T0;
      }
      if (Math.hypot(x - f1.x, y - f1.y) < 380) b |= NAV_NO0;
      if (Math.hypot(x - f0.x, y - f0.y) < 380) b |= NAV_NO1;
      nav[k] = b; clr[k] = b & (NAV_WALL | NAV_TOWER) ? 0 : 9;
    }
    // Distance in cells to the nearest obstacle, capped at 3. Paths pay to hug walls.
    for (let d = 1; d <= 3; d++) for (let j = 0; j < r; j++) for (let i = 0; i < c; i++) {
      const k = j * c + i; if (clr[k] !== 9) continue;
      let near = false;
      for (let y = Math.max(0, j - 1); y <= Math.min(r - 1, j + 1) && !near; y++) for (let x = Math.max(0, i - 1); x <= Math.min(c - 1, i + 1); x++) if (clr[y * c + x] === d - 1) { near = true; break; }
      if (near) clr[k] = d;
    }
    // Cached lane geometry for corridor checks, and a map-derived centre.
    m.laneLen = m.lanes.map(L => { let d = 0; for (let i = 0; i + 1 < L.length; i++) d += Math.hypot(L[i + 1][0] - L[i][0], L[i + 1][1] - L[i][1]); return d; });
  }

  function navCell(m, mask, x, y) {
    const c = m.cols, ci = clamp(x / 40 | 0, 0, c - 1), cj = clamp(y / 40 | 0, 0, m.rows - 1);
    if (!(m.nav[cj * c + ci] & mask)) return cj * c + ci;
    let best = -1, bd = 1e9;
    for (let r = 1; r < 10 && best < 0; r++) for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
      if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || i < 0 || j < 0 || i >= c || j >= m.rows || m.nav[j * c + i] & mask) continue;
      const d = Math.hypot(i * 40 + 20 - x, j * 40 + 20 - y); if (d < bd) { bd = d; best = j * c + i; }
    }
    return best;
  }

  // Line test with body width: the centre line and one line each side must be open.
  function clearLine(m, mask, ax, ay, bx, by, fat = 17) {
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy); if (l < 1) return true;
    const n = Math.ceil(l / 22), ox = -dy / l * fat, oy = dx / l * fat, c = m.cols, r = m.rows, nav = m.nav;
    for (let k = 0; k <= n; k++) {
      const x = ax + dx * k / n, y = ay + dy * k / n;
      for (let o = -1; o <= 1; o++) {
        const i = (x + ox * o) / 40 | 0, j = (y + oy * o) / 40 | 0;
        if (i < 0 || j < 0 || i >= c || j >= r || nav[j * c + i] & mask) return false;
      }
    }
    return true;
  }
  const navOpen = (m, mask, x, y) => { const i = x / 40 | 0, j = y / 40 | 0; return i >= 0 && j >= 0 && i < m.cols && j < m.rows && !(m.nav[j * m.cols + i] & mask); };

  // A* on typed arrays, so a search allocates almost nothing.
  function navPath(m, team, ax, ay, bx, by) {
    const c = m.cols, r = m.rows, nav = m.nav, clr = m.clr, mask = navMask(team), danger = team ? NAV_T0 : NAV_T1, N = c * r;
    const st = navCell(m, mask, ax, ay), en = navCell(m, mask, bx, by);
    if (st < 0 || en < 0) return null;
    const ex = en % c, ey = en / c | 0;
    navRun++;
    let hs = 0, found = st === en, guard = 0;
    const push = (k, f) => {
      if (hs >= heapK.length) return;
      let i = hs++;
      while (i > 0) { const p = (i - 1) >> 1; if (heapF[p] <= f) break; heapK[i] = heapK[p]; heapF[i] = heapF[p]; i = p; }
      heapK[i] = k; heapF[i] = f;
    };
    const pop = () => {
      const top = heapK[0]; hs--;
      if (hs > 0) {
        const lk = heapK[hs], lf = heapF[hs]; let i = 0;
        for (; ;) { const a = 2 * i + 1; if (a >= hs) break; const sm = a + 1 < hs && heapF[a + 1] < heapF[a] ? a + 1 : a; if (heapF[sm] >= lf) break; heapK[i] = heapK[sm]; heapF[i] = heapF[sm]; i = sm; }
        heapK[i] = lk; heapF[i] = lf;
      }
      return top;
    };
    navG[st] = 0; navFrom[st] = -1; navSeen[st] = navRun; push(st, 0);
    while (hs && !found && guard++ < N) {
      const n = pop(); if (navDone[n] === navRun) continue; navDone[n] = navRun;
      if (n === en) { found = true; break; }
      const x = n % c, y = n / c | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= c || ny >= r) continue;
        const k = ny * c + nx; if (nav[k] & mask || navDone[k] === navRun) continue;
        if (dx && dy && (nav[y * c + nx] | nav[ny * c + x]) & mask) continue;
        const g = navG[n] + (dx && dy ? 1.414 : 1) * (1 + (clr[k] === 1 ? 1.4 : clr[k] === 2 ? .35 : 0) + (nav[k] & danger ? 2.5 : 0));
        if (navSeen[k] !== navRun || g < navG[k]) {
          navSeen[k] = navRun; navG[k] = g; navFrom[k] = n;
          const hx = Math.abs(nx - ex), hy = Math.abs(ny - ey);
          push(k, g + hx + hy - .586 * Math.min(hx, hy));
        }
      }
    }
    if (!found) return null;
    const raw = [];
    for (let n = en; n !== -1; n = navFrom[n]) raw.push({ x: n % c * 40 + 20, y: (n / c | 0) * 40 + 20 });
    raw.reverse();
    if (navOpen(m, mask, bx, by)) raw[raw.length - 1] = { x: bx, y: by };
    // String pull forward from each anchor, then round the corners that remain.
    const pts = []; let i = 0;
    while (i < raw.length - 1) {
      let j = i + 1;
      while (j + 1 < raw.length && clearLine(m, mask, raw[i].x, raw[i].y, raw[j + 1].x, raw[j + 1].y)) j++;
      pts.push(raw[j]); i = j;
    }
    if (!pts.length) pts.push(raw[raw.length - 1]);
    return roundCorners(m, mask, pts);
  }

  function roundCorners(m, mask, pts) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], p = pts[i], b = pts[i + 1], u = norm(p.x - a.x, p.y - a.y), v = norm(b.x - p.x, b.y - p.y);
      if (u.x * v.x + u.y * v.y > .92) { out.push(p); continue; }
      const cu = Math.min(46, u.l * .45), cv = Math.min(46, v.l * .45);
      const p1 = { x: p.x - u.x * cu, y: p.y - u.y * cu }, p2 = { x: p.x + v.x * cv, y: p.y + v.y * cv };
      if (clearLine(m, mask, p1.x, p1.y, p2.x, p2.y, 8)) out.push(p1, p2); else out.push(p);
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  const moveTo = (b, x, y, arrive = 20) => { b.gx = x; b.gy = y; b.ga = arrive; b.hasGoal = true; b.vecT = 0; };
  const moveDir = (b, x, y) => { b.hasGoal = false; b.vx = x; b.vy = y; b.vecT = .3; };
  const noMove = b => { b.hasGoal = false; b.vecT = 0; };

  // Finds a walkable heading near (x, y) so a kite or dodge never pushes into a wall.
  function freeDir(s, c, b, x, y) {
    const m = s.map;
    for (const r of [0, .7, -.7, 1.4, -1.4, 2.2, -2.2]) {
      const co = Math.cos(r), si = Math.sin(r), nx = x * co - y * si, ny = x * si + y * co;
      if (navOpen(m, b.mask, c.x + nx * 46, c.y + ny * 46)) return { x: nx, y: ny };
    }
    return null;
  }

  // Runs every tick: follows the path, keeps a gap to allies, respects towers, unsticks.
  function botSteer(s, c, b) {
    if (c.stunT > 0 || c.air || c.dash) return;
    if (b.still) { c.mv.x = c.mv.y = 0; return; }
    const m = s.map, every3 = (s.tick + c.id) % 3 === 0;
    let vx = 0, vy = 0, onPath = false;
    if (b.evadeT > 0) {
      b.evadeT -= DT; const f = freeDir(s, c, b, b.ex, b.ey);
      c.mv.x = f ? f.x : 0; c.mv.y = f ? f.y : 0; return;
    }
    if (b.vecT > 0) { b.vecT -= DT; const f = freeDir(s, c, b, b.vx, b.vy); if (f) { vx = f.x; vy = f.y; } }
    else if (b.hasGoal && Math.hypot(b.gx - c.x, b.gy - c.y) > b.ga) {
      onPath = true;
      if (every3) {
        if (clearLine(m, b.mask, c.x, c.y, b.gx, b.gy)) { b.path = null; b.needPath = false; }
        else if (!b.path) b.needPath = true;
      }
      if (b.path && Math.hypot(b.pgx - b.gx, b.pgy - b.gy) > 130) b.needPath = true;
      if (b.needPath && s.navLeft > 0) {
        s.navLeft--; b.needPath = false; b.pgx = b.gx; b.pgy = b.gy; b.pi = 0;
        b.path = navPath(m, c.team, c.x, c.y, b.gx, b.gy);
      }
      let tx = b.gx, ty = b.gy;
      if (b.path) {
        const p = b.path;
        while (b.pi < p.length - 1) {
          const w = p[b.pi], nx = p[b.pi + 1];
          if (Math.hypot(w.x - c.x, w.y - c.y) < 34 || (every3 && clearLine(m, b.mask, c.x, c.y, nx.x, nx.y))) b.pi++; else break;
        }
        const w = p[b.pi]; tx = w.x; ty = w.y;
        if (b.pi === p.length - 1 && Math.hypot(w.x - c.x, w.y - c.y) < 34) { b.path = null; tx = b.gx; ty = b.gy; }
      }
      const n = norm(tx - c.x, ty - c.y); vx = n.x; vy = n.y;
    }
    // Keep out of enemy tower range unless two or more of our minions are tanking, or the dive is a sure kill.
    // A tower already shooting this bot (its shots compound) means get out now regardless.
    if (!b.diveOk) for (const t of s.towers) {
      if (!t.alive || t.team === c.team) continue;
      const tanked = t === b.et && b.etTanks >= 2 && t.last !== c.id;
      if (tanked) continue;
      const dx = t.x - c.x, dy = t.y - c.y, d = Math.hypot(dx, dy); if (d > t.range + 36) continue;
      const nx = dx / d, ny = dy / d, inw = vx * nx + vy * ny;
      if (d < t.range - 6) { if (t.last === c.id || inw > -.4 && (vx || vy || b.hasGoal)) { vx = -nx; vy = -ny; onPath = false; } }
      else if (inw > 0) { vx -= nx * inw; vy -= ny * inw; if (Math.hypot(vx, vy) < .15) { vx = vy = 0; onPath = false; } }
    }
    // Spread out from allies. Dropped if it would push the bot at a wall.
    let sx = 0, sy = 0;
    for (const a of s.champs) {
      if (a === c || a.team !== c.team || !a.alive) continue;
      const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy);
      if (d < 95 && d > .01) { const k = (95 - d) / 95; sx += dx / d * k; sy += dy / d * k; }
    }
    if (sx || sy) {
      const n = norm(vx + sx * .8, vy + sy * .8);
      if (navOpen(m, b.mask, c.x + n.x * 46, c.y + n.y * 46)) {
        if (vx || vy) { vx = n.x; vy = n.y; } else if (sx * sx + sy * sy > .09) { vx = n.x * .5; vy = n.y * .5; }
      }
    }
    c.mv.x = vx; c.mv.y = vy;
    // Stuck check: too little ground covered in half a second while trying to walk.
    if ((s.tick + c.id) % 15 === 0) {
      const moved = Math.hypot(c.x - b.sx, c.y - b.sy); b.sx = c.x; b.sy = c.y;
      if (onPath && !c.chan && !c.charge && c.lock <= 0 && moved < 38) {
        if (++b.stuck === 1) { b.needPath = true; b.path = null; }
        else {
          const a = s.rand() * 6.283; b.ex = Math.cos(a); b.ey = Math.sin(a); b.evadeT = .4;
          b.stuck = 0; b.path = null; b.needPath = true;
        }
      } else b.stuck = 0;
    }
  }

  // ---------- bots: shared knowledge ----------
  const LANE_END = 360, LATE_AT = 660; // laning phase, then roaming mid game, then grouped late game
  const hash01 = (a, b) => { let h = Math.imul(a * 73856093 ^ b * 19349663, 0x9E3779B1); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
  const cast = (c, slot, tx, ty) => c.q.push({ t: 'cast', slot, tx, ty });
  const rdy = (c, i) => c.cd[i] <= 0 && (i < 2 || c.lvl >= 3);
  const frac = u => u.hp / u.maxHp;
  const mapCenter = s => s.map.center || { x: W / 2, y: H / 2 };
  const ensureAi = ai => { if (!ai.mem) { ai.mem = {}; ai.cover = {}; ai.phase = 'lane'; ai.hum = {}; ai.split = 0; } };
  const roleLane = c => c.role === 'top' ? 0 : c.role === 'jungle' ? -1 : 1;

  // Distance to, and closest point on, a lane's centre line.
  function laneNearest(s, lane, x, y) {
    const L = s.map.lanes[lane]; let bd = 1e9, bx = x, by = y;
    for (let i = 0; i + 1 < L.length; i++) {
      const ax = L[i][0], ay = L[i][1], dx = L[i + 1][0] - ax, dy = L[i + 1][1] - ay, l2 = dx * dx + dy * dy || 1;
      const t = clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1), px = ax + dx * t, py = ay + dy * t, d = Math.hypot(x - px, y - py);
      if (d < bd) { bd = d; bx = px; by = py; }
    }
    return { x: bx, y: by, d: bd };
  }
  const laneDist = (s, lane, x, y) => laneNearest(s, lane, x, y).d;

  // Walls block lines, dashes, attacks and casts. Uses the game's own ray test.
  const losClear = (s, ax, ay, bx, by) => hasLOS(ax, ay, bx, by);

  function lead(s, c, b, t, speed, delay = 0) {
    const tt = (speed ? dist(c, t) / speed : 0) + delay, f = b.sk.lead * (.8 + s.rand() * .2);
    const x = t.x + t.vx * tt * f, y = t.y + t.vy * tt * f;
    const a = Math.atan2(y - c.y, x - c.x) + (s.rand() - .5) * b.sk.err * 2, l = Math.hypot(x - c.x, y - c.y);
    return { tx: c.x + Math.cos(a) * l, ty: c.y + Math.sin(a) * l };
  }
  function firstTower(s, team, lane) {
    let best = null;
    for (const t of s.towers) if (t.alive && t.team === team && t.lane === lane && (!best || t.tier < best.tier)) best = t;
    return best || s.towers.find(t => t.team === team && t.sub === 'core');
  }
  function towerOver(s, team, x, y, margin = -20) {
    for (const t of s.towers) if (t.alive && t.team !== team && Math.hypot(x - t.x, y - t.y) < t.range + margin) return t;
    return null;
  }
  function alliesTanking(s, team, t) { let n = 0; for (const m of s.minions) if (m.alive && m.team === team && m.delay <= 0 && dist(m, t) < t.range - 20) n++; return n; }

  function refreshLanes(s) {
    const L = s.laneInfo;
    for (let t = 0; t < 2; t++) for (let l = 0; l < 2; l++) { L[t][l].front = null; L[t][l].best = -1; L[t][l].n = 0; }
    for (const m of s.minions) {
      if (!m.alive || m.delay > 0) continue;
      const i = L[m.team][m.lane], wp = Math.min(m.wp, m.path.length - 1), v = wp * 2000 - Math.hypot(m.path[wp][0] - m.x, m.path[wp][1] - m.y);
      i.n++; if (v > i.best) { i.best = v; i.front = m; }
    }
  }

  // Effective health times damage, square-rooted so a team's power adds up the Lanchester way.
  // A team knows its own cooldowns; enemy cooldowns are assumed up.
  const BURST = { vesper: [190, 0, 260], kade: [124, 0, 185], ione: [82, 165, 345], solenne: [72, 0, 90], sable: [138, 0, 180], gravel: [64, 62, 165] };
  function power(u, foe) {
    const B = BURST[u.champ], pw = pow(u); let burst = 0;
    for (let i = 0; i < 3; i++) if (i < 2 || u.lvl >= 3) burst += (foe || u.cd[i] <= 1.5 ? 1 : .15) * B[i] * pw / (u.kit[i].cd || 6);
    const eh = Math.max(1, u.hp) * (100 + u.armor) / 100; let dps = u.dmgBase * u.as * (u.buffT > 0 ? 1.2 : 1) + burst;
    if (u.stunT > 0) dps *= .6;
    return Math.sqrt(eh * dps);
  }
  function burstOn(c, t) {
    let v = c.dmgBase * 2; const B = BURST[c.champ];
    for (let i = 0; i < 3; i++) if (rdy(c, i)) v += B[i] * pow(c);
    return v * 100 / (100 + t.armor);
  }
  // Who a support looks after. During the laning phase that is simply its bottom laner.
  function carryOf(s, c, ai) {
    const bot = s.champs.find(a => a.team === c.team && a !== c && a.alive && a.role === 'bottom');
    if (ai.phase === 'lane') return bot || null;
    return s.champs.find(a => a.team === c.team && a !== c && !a.bot && a.alive && a.role !== 'support') || bot || s.champs.find(a => a.team === c.team && a !== c && a.alive) || null;
  }
  const CARRY = { vesper: 1, ione: .9, sable: .7, kade: .4, solenne: .3, gravel: 0 };

  // Rough tower damage for the next shots at the current time, with compounding.
  const towerShot = (s, stack) => (160 + s.t * .24) * Math.min(4, Math.pow(1.45, stack));

  // Knowledge of enemies no longer in view: confidence fades, and the circle they could be in grows.
  function memThreat(s, c, b, ai, x, y, r) {
    let n = 0;
    for (const e of s.champs) {
      if (e.team === c.team || !e.alive) continue;
      const m = ai.mem[e.id]; if (!m) continue;
      const age = s.t - m.t; if (age < .7) continue; // in view now; counted from sight
      const conf = Math.exp(-age / b.sk.mem); if (conf < .18) continue;
      if (Math.hypot(m.x - x, m.y - y) - e.msBase * age * .45 < r) n += conf;
    }
    return n;
  }

  function nextBuy(s, c, ai) {
    let best = null, bv = -1e9;
    const cls = CLASS[c.champ], deaths = c.stats.deaths, kills = c.stats.kills;
    for (const track of KITS[c.champ].forge) {
      const n = c.up[track]; if (n >= 3) continue;
      const i = KITS[c.champ].forge.indexOf(track), macro = c.bot.sk.macro;
      // Kit order is the beginner's whole plan; a sharper player also reads the game.
      let v = 3 - n * 1.1 + [2.2, 1, 0][i], sit = 0;
      if (track === 'edge') sit += (cls === 'back' || cls === 'flank' ? 1.5 : 0) + (kills > deaths + 2 ? 1 : 0);
      if (track === 'guard') sit += (cls === 'front' ? 1.8 : 0) + (deaths > kills + 2 ? 1.6 : 0) + (ai.phase !== 'lane' && cls === 'peel' ? 1 : 0);
      if (track === 'haste') sit += (c.role === 'support' ? 1.2 : 0) + (c.role === 'jungle' ? .7 : 0);
      v += sit * macro;
      if (v > bv) { bv = v; best = track; }
    }
    return best ? { track: best, cost: FORGE_COST[c.up[best]] } : null;
  }

  // ---------- bots: team plan, shared by every bot on a side ----------
  function teamThink(s, team) {
    const ai = s.ai[team]; ensureAi(ai);
    const mine = s.champs.filter(c => c.team === team && c.alive);
    const foes = []; let foesAlive = 0;
    for (const e of s.champs) {
      if (e.team === team || !e.alive) continue;
      foesAlive++;
      if (!e.air && canSee(s, team, e)) { foes.push(e); ai.mem[e.id] = { x: e.x, y: e.y, t: s.t }; }
    }
    ai.phase = s.t < LANE_END ? 'lane' : s.t < LATE_AT ? 'mid' : 'late';
    const laning = ai.phase === 'lane';

    // Which lane each seat holds. A human who has left a lane open gets covered by the jungler only,
    // so a lane is never filled by accident and never by more than one body.
    ai.cover = {};
    if (laning) for (const lane of [0, 1]) {
      const seats = s.champs.filter(o => o.team === team && roleLane(o) === lane);
      let held = false;
      for (const o of seats) {
        if (o.bot) { held = held || o.alive; continue; }
        const here = !o.alive || (dist(o, s.fountains[team]) > 520 && laneDist(s, lane, o.x, o.y) < 400);
        if (here) ai.hum[o.id] = s.t;
        if (ai.hum[o.id] === undefined) ai.hum[o.id] = 0;
        if (s.t < 45 || s.t - ai.hum[o.id] < 24) held = true;
      }
      // A dead laner's jungler only comes when its wave is actually threatening the lane's tower.
      const guard = firstTower(s, team, lane);
      if (held || !s.minions.some(m => m.team !== team && m.lane === lane && m.delay <= 0 && dist(m, guard) < guard.range + 500)) continue;
      const jg = mine.find(c => c.bot && c.role === 'jungle' && frac(c) > .4);
      if (jg) ai.cover[jg.id] = lane;
    }

    // Defend the tower that needs it most. During laning only that lane's seats and the jungler answer.
    let call = null, top = 2.4, callWave = false;
    for (const t of s.towers) {
      if (!t.alive || t.team !== team) continue;
      const lost = (ai.thp[t.id] === undefined ? t.hp : ai.thp[t.id]) - t.hp; ai.thp[t.id] = t.hp;
      let champs = 0, wave = 0;
      for (const e of foes) if (dist(e, t) < t.range + 180) champs++;
      for (const m of s.minions) if (m.alive && m.team !== team && dist(m, t) < t.range + 40) wave++;
      let v = (t.sub === 'core' ? 3 : 1 + t.tier * .5) * (champs * 2 + (lost > 0 ? 1.5 : 0));
      // A wave chewing on a tower is urgent: minions alone can take a tower, and a core late on.
      if (wave >= 3 && !champs) v = Math.max(v, (lost > 0 ? 4.5 : 2.6) + (t.sub === 'core' ? 3 : t.tier));
      if (v > top) { top = v; call = t; callWave = !champs; }
    }
    ai.defend = null;
    if (call) {
      let pool = mine.filter(c => c.bot && frac(c) > .4);
      if (laning && call.sub !== 'core') pool = pool.filter(c => c.role === 'jungle' || roleLane(c) === call.lane);
      const need = callWave ? (call.sub === 'core' ? 2 : 1) : call.sub === 'core' ? 4 : 2, ids = pool.sort((a, b) => dist(a, call) - dist(b, call)).slice(0, need).map(c => c.id);
      const n = norm(s.fountains[team].x - call.x, s.fountains[team].y - call.y);
      if (ids.length) ai.defend = { id: call.id, x: call.x + n.x * 110, y: call.y + n.y * 110, ids, wave: callWave, lane: call.lane };
    }

    // The Colossus: never during laning. Gather a little before it is due, take it when the side is able.
    const boss = s.monsters.find(m => m.boss && m.alive), bossSoon = !boss && s.bossAt - s.t < 16;
    if (laning || (!boss && !bossSoon)) { ai.hoard = null; ai.hoardGo = false; }
    else {
      const center = mapCenter(s), home = s.fountains[team], n = norm(home.x - center.x, home.y - center.y);
      let minePow = 0, foePow = 0, close = 0;
      const bossAt = boss || center;
      for (const c of mine) { minePow += power(c); if (dist(c, bossAt) < 780) close++; }
      for (const e of foes) if (dist(e, bossAt) < 1150) foePow += power(e, true);
      const enough = mine.length >= Math.min(3, s.champs.filter(c => c.team === team).length) || foesAlive <= 1;
      if (enough && foePow < minePow * .95 && !(call && call.sub === 'core')) {
        ai.hoard = { x: center.x + n.x * 520, y: center.y + n.y * 120 + (team ? 40 : -40) };
        if (boss && close >= Math.min(3, mine.length)) ai.hoardGo = true;
      } else { ai.hoard = null; ai.hoardGo = false; }
    }

    // Pick one enemy for the side to pile on: close to several allies, hurt, or already stunned.
    let focus = null, fv = 0;
    for (const e of foes) {
      let n = 0; for (const a of mine) if (dist(a, e) < a.range + 300) n++;
      if (!n) continue;
      const v = n * .9 + (1 - frac(e)) * 1.5 + (e.stunT > 0 ? .5 : 0) + CARRY[e.champ] * .25 - (towerOver(s, team, e.x, e.y) ? 1.5 : 0);
      if (v > fv) { fv = v; focus = e; }
    }
    ai.focus = focus ? focus.id : 0;
    // Answer an ally who is being beaten on, people first. In laning only the jungler rotates.
    ai.help = {};
    const helpers = mine.filter(c => c.bot && !c.bot.low && frac(c) > .4 && !(ai.defend && ai.defend.ids.includes(c.id)) && (!laning || c.role === 'jungle'));
    const hurtAllies = mine.filter(a => Object.keys(a.assist).some(id => s.t - a.assist[id] < 2.6 && s.champs.some(e => e.id === +id && e.alive))).sort((a, b) => (a.bot ? 1 : 0) - (b.bot ? 1 : 0));
    for (const a of hurtAllies) {
      const person = !a.bot, reach = person ? 1500 : 1000, want = person ? 2 : 1, near = helpers.filter(c => c !== a && dist(c, a) < 520).length;
      if (near >= want) continue;
      let need = want - near;
      for (const c of helpers.slice().sort((x, y) => dist(x, a) - dist(y, a))) {
        if (need <= 0 || c === a || dist(c, a) > reach || ai.help[c.id]) continue;
        if (foes.filter(e => dist(e, a) < 900).length > mine.filter(x => dist(x, a) < 900).length + 2) continue; // not into a lost cause
        ai.help[c.id] = a; need--;
      }
    }
    // Sites: answer an enemy capture first, then roam to open ones. Laners hold their lanes while laning.
    ai.sites = {};
    const open = s.sites.filter(z => z.alive && !towerOver(s, team, z.x, z.y, 0)), taken = new Set();
    const free = mine.filter(c => c.bot && !c.bot.low && frac(c) > .45 && !ai.help[c.id] && (!laning || c.role === 'jungle'));
    const count = (list, z) => { let n = 0; for (const u of list) if (dist(u, z) < 450) n++; return n; };
    for (const z of open) {
      if (z.prog[1 - team] < .3) continue;
      let best = null, bd = 1100;
      for (const c of free) if (!ai.sites[c.id] && dist(c, z) < bd) { bd = dist(c, z); best = c; }
      if (best) { ai.sites[best.id] = z; taken.add(z.id); }
    }
    const routeBusy = c => { const b = c.bot; if (!b.route) return true; const k = b.route[b.routeI]; return k && (k.alive || k.at - s.t < 8); };
    for (const role of ['jungle', 'support', 'top', 'bottom']) for (const c of free) {
      if (c.role !== role || ai.sites[c.id]) continue;
      if (laning && role === 'jungle' && routeBusy(c)) continue;
      const laner = role === 'top' || role === 'bottom';
      if (laner && foes.some(e => dist(e, c) < 700)) continue;
      if (role === 'support') { const carry = carryOf(s, c, ai); if (carry && foes.some(e => dist(e, carry) < 650)) continue; }
      let reach = role === 'jungle' ? (laning ? 900 : 1500) : role === 'support' ? 750 : 420;
      if (ai.push !== null) reach = Math.min(reach, 600);
      let best = null, bd = reach;
      for (const z of open) if (!taken.has(z.id) && dist(c, z) < bd && count(foes, z) <= count(mine, z)) { bd = dist(c, z); best = z; }
      if (best) { ai.sites[c.id] = best; taken.add(best.id); }
    }
    // Later the side groups and pushes one lane, leaving a strong top laner to split the other.
    ai.split = 0;
    const late = ai.phase === 'late', ahead = s.t >= 500 && (s.kills[team] - s.kills[1 - team] >= 6 || foesAlive <= mine.length - 3 || s.champs.some(c => c.team === team && c.buffT > 0));
    if (!laning && mine.length >= foesAlive - 1 && (late || ahead)) {
      if (s.t >= ai.pushUntil || ai.push === null) {
        const left = [0, 1].map(l => s.towers.filter(t => t.alive && t.team !== team && t.lane === l).length);
        const adv = [0, 1].map(l => s.laneInfo[team][l].best);
        ai.push = left[0] !== left[1] ? (left[0] < left[1] ? 0 : 1) : (adv[0] >= adv[1] ? 0 : 1);
        ai.pushUntil = s.t + 35;
      }
      const top = mine.find(c => c.bot && c.role === 'top' && frac(c) > .6);
      if (top && mine.length >= foesAlive) ai.split = top.id;
    } else ai.push = null;
  }

  // ---------- bots: abilities, one short script per champion ----------
  function lineBlocked(s, c, b, x, y, w) {
    if (!losClear(s, c.x, c.y, x, y)) return true;
    if (b.sk.iq < .4) return false;
    for (const m of s.minions) if (m.alive && m.team !== c.team && segDist(m.x, m.y, c.x, c.y, x, y) < m.r + w / 2) return true;
    return false;
  }
  function awayPoint(s, c, t, reach) {
    const home = s.fountains[c.team];
    let n = t ? norm(c.x - t.x, c.y - t.y) : norm(home.x - c.x, home.y - c.y);
    if (!navOpen(s.map, navMask(c.team), c.x + n.x * reach, c.y + n.y * reach)) n = norm(home.x - c.x, home.y - c.y);
    return { x: c.x + n.x * reach, y: c.y + n.y * reach };
  }
  const shotAt = (u, p) => {
    const sp = Math.hypot(p.vx, p.vy) || 1, nx = p.vx / sp, ny = p.vy / sp, rx = u.x - p.x, ry = u.y - p.y, along = rx * nx + ry * ny;
    return along > -20 && along < sp * .7 && Math.abs(rx * -ny + ry * nx) < p.w / 2 + u.r + 10;
  };
  function threatenedAlly(s, c, b) {
    for (const a of s.champs) {
      if (!a.alive || a.team !== c.team || dist(a, c) > 560) continue;
      for (const p of s.proj) if (!p.homing && p.team !== c.team && shotAt(a, p)) return a;
      for (const e of b.foes) if (e.chan && e.chan.kind === 'line' && segDist(a.x, a.y, e.x, e.y, e.x + e.chan.dx * e.chan.len, e.y + e.chan.dy * e.chan.len) < e.chan.w / 2 + a.r + 10) return a;
      if (b.sk.iq > .5 && frac(a) < .5) for (const e of b.foes) if (dist(e, a) < 480) return a;
    }
    return null;
  }
  // An ultimate is worth casting for a kill, a group, or a real fight; a beginner just throws it.
  function ultWorth(s, c, b, t) {
    if (!t) return false;
    if (b.sk.iq < .3) return s.rand() < .5;
    let near = 0; for (const e of b.foes) if (dist(e, t) < 360) near++;
    return t.hp <= burstOn(c, t) || near >= 2 || (b.ratio > .9 && frac(t) < .7 && (b.sk.iq > .5 || s.rand() < .6));
  }

  const COMBO = {
    vesper(s, c, b, t, d, mode) {
      if (!t) return false;
      if (rdy(c, 1) && (mode === 'retreat' || d < 260)) { const a = awayPoint(s, c, t, 270); cast(c, 1, a.x, a.y); return true; }
      if (mode === 'fight' && rdy(c, 2) && d < 1020 && losClear(s, c.x, c.y, t.x, t.y)) {
        // Deadeye is the longest, slowest wind-up. Save it for a stunned, slowed or dying target.
        const pinned = t.stunT > 0 || t.slowT > 0 || Math.hypot(t.vx, t.vy) < 200 || t.chan || t.charge;
        if ((pinned || b.sk.iq < .5) && (ultWorth(s, c, b, t) || frac(t) < .5)) { const p = lead(s, c, b, t, 2600, .85); cast(c, 2, p.tx, p.ty); return true; }
      }
      if (mode !== 'retreat' && rdy(c, 0) && d < 780 && !lineBlocked(s, c, b, t.x, t.y, 34)) {
        c.q.push({ t: 'charge', slot: 0 });
        // Full charge when nothing is close. A beginner lets go at odd moments.
        b.chargeHold = b.sk.iq < .4 ? .3 + s.rand() * .9 : (b.closest > 360 && frac(c) > .4 ? 1.12 : .5);
        return true;
      }
      return false;
    },
    kade(s, c, b, t, d, mode) {
      if (rdy(c, 1) && b.parry) { cast(c, 1, c.x, c.y); return true; }
      if (!t) return false;
      if (c.recast[0] > 0) {
        if (mode === 'retreat') { const a = awayPoint(s, c, t, 260); cast(c, 0, a.x, a.y); return true; }
        if (mode === 'fight' && d < 290) { cast(c, 0, t.x, t.y); return true; }
        return false;
      }
      if (mode === 'retreat') { if (rdy(c, 0) && d < 400) { const a = awayPoint(s, c, t, 290); cast(c, 0, a.x, a.y); return true; } return false; }
      if (mode !== 'fight') return false;
      if (rdy(c, 2) && d > 200 && d < 520 && b.ratio >= .9 && ultWorth(s, c, b, t)) { const p = lead(s, c, b, t, 1100); cast(c, 2, p.tx, p.ty); return true; }
      if (rdy(c, 0) && d < 300 && losClear(s, c.x, c.y, t.x, t.y)) { cast(c, 0, t.x, t.y); return true; }
      return false;
    },
    ione(s, c, b, t, d, mode) {
      if (!t || mode === 'retreat') return false;
      if (mode === 'fight' && rdy(c, 2) && d < 620 && losClear(s, c.x, c.y, t.x, t.y) && (ultWorth(s, c, b, t) || t.stunT > 0)) { cast(c, 2, t.x, t.y); return true; }
      if (t.markT > 0 && rdy(c, 1) && d < 520 && losClear(s, c.x, c.y, t.x, t.y)) { const p = lead(s, c, b, t, 0, .55); cast(c, 1, p.tx, p.ty); return true; }
      if (rdy(c, 0) && d < 610 && !lineBlocked(s, c, b, t.x, t.y, 42)) { const p = lead(s, c, b, t, 950); cast(c, 0, p.tx, p.ty); return true; }
      // Without a mark coming, Rupture is only worth it on a stunned or careless target.
      if (rdy(c, 1) && d < 520 && losClear(s, c.x, c.y, t.x, t.y) && (b.sk.iq < .5 ? s.rand() < .5 : c.cd[0] > 2.5 && (mode === 'fight' || t.stunT > 0))) { const p = lead(s, c, b, t, 0, .55); cast(c, 1, p.tx, p.ty); return true; }
      return false;
    },
    solenne(s, c, b, t, d, mode) {
      if (rdy(c, 1)) { const a = threatenedAlly(s, c, b); if (a && (b.sk.iq > .4 || s.rand() < .3)) { cast(c, 1, a.x, a.y); return true; } }
      if (rdy(c, 2)) {
        let n = 0; for (const a of s.champs) if (a.alive && a.team === c.team && dist(a, c) < 320 && (frac(a) < .55 || a.stunT > 0)) n++;
        if (n >= 1 && b.closest < 700 && (b.sk.iq > .3 || s.rand() < .5)) { cast(c, 2, c.x, c.y); return true; }
      }
      if (rdy(c, 0)) {
        let ally = null, low = .82;
        for (const a of s.champs) if (a !== c && a.alive && a.team === c.team && dist(a, c) < 650 && frac(a) < low && losClear(s, c.x, c.y, a.x, a.y)) { low = frac(a); ally = a; }
        if (ally && !b.foes.some(e => segDist(e.x, e.y, c.x, c.y, ally.x, ally.y) < e.r + 30)) { const p = lead(s, c, b, ally, 1150); cast(c, 0, p.tx, p.ty); return true; }
        if (t && mode !== 'retreat' && d < 650 && !lineBlocked(s, c, b, t.x, t.y, 46)) { const p = lead(s, c, b, t, 1150); cast(c, 0, p.tx, p.ty); return true; }
      }
      return false;
    },
    sable(s, c, b, t, d, mode) {
      if (!t) return false;
      if (rdy(c, 2) && d < 470) {
        const exec = (125 * pow(c) + (t.maxHp - t.hp) * .35) * 100 / (100 + t.armor);
        if (b.sk.iq < .5 ? frac(t) < .45 : t.hp <= exec) { cast(c, 2, t.x, t.y); return true; }
      }
      if (c.recast[1] > 0) { if (mode === 'retreat' || frac(c) < .45 || d > 500) { cast(c, 1, c.x, c.y); return true; } }
      else if (rdy(c, 1)) {
        if (mode === 'retreat') { const a = awayPoint(s, c, t, 320); cast(c, 1, a.x, a.y); return true; }
        // Blink always travels full range, so this lands behind the target.
        if (mode === 'fight' && d > 170 && d < 300) { cast(c, 1, t.x, t.y); return true; }
      }
      if (mode !== 'retreat' && rdy(c, 0) && d < 225 && losClear(s, c.x, c.y, t.x, t.y)) { cast(c, 0, t.x, t.y); return true; }
      return false;
    },
    gravel(s, c, b, t, d, mode) {
      if (!t) return false;
      if (rdy(c, 1) && d < 225) { cast(c, 1, c.x, c.y); return true; }
      if (mode === 'retreat') return false;
      if (rdy(c, 0) && d > 170 && d < 590 && !lineBlocked(s, c, b, t.x, t.y, 50) && (mode === 'fight' || b.ratio >= 1)) { const p = lead(s, c, b, t, 1050); cast(c, 0, p.tx, p.ty); return true; }
      if (mode === 'fight' && rdy(c, 2) && d < 580 && b.ratio >= .9 && losClear(s, c.x, c.y, t.x, t.y) && ultWorth(s, c, b, t)) { const p = lead(s, c, b, t, 1000); cast(c, 2, p.tx, p.ty); return true; }
      return false;
    },
  };
  function useCombo(s, c, b, t, mode) {
    if (c.charge || c.chan || (s.t < b.castAt && !b.parry)) return;
    if (COMBO[c.champ](s, c, b, t, t ? dist(c, t) : 1e9, mode)) b.castAt = s.t + b.sk.gap * (.7 + s.rand() * .6);
  }
  const PVE = { vesper: [0], kade: [0], ione: [1, 0], solenne: [], sable: [0], gravel: [1] };
  function castPve(s, c, b, m, d) {
    if (c.charge || c.chan || s.t < b.castAt) return;
    for (const i of PVE[c.champ]) {
      const a = c.kit[i]; if (!rdy(c, i) || (a.range ? d > a.range - 30 : d > (a.r || 200))) continue;
      cast(c, i, m.x, m.y); b.castAt = s.t + b.sk.gap + .4; return;
    }
  }

  function handleCharge(s, c, b, t, d) {
    if (!t || d > 830) { c.q.push({ t: 'cancel' }); return; }
    const p = lead(s, c, b, t, 1600); c.q.push({ t: 'aim', tx: p.tx, ty: p.ty });
    const ct = c.charge.t, reach = 500 + 300 * clamp(ct / 1.1, 0, 1), hurry = b.closest < 300 || b.low;
    if ((ct >= b.chargeHold || hurry) && reach >= d - 20 && losClear(s, c.x, c.y, p.tx, p.ty)) cast(c, 0, p.tx, p.ty);
    else if (ct >= 1.6) c.q.push({ t: 'cancel' });
  }

  // ---------- bots: senses ----------
  // Dodging uses only what a player can see: a shot's line, a blast ring, a wind-up. Each shot gets
  // one roll, a reaction delay, and a sidestep away from the line. A beginner often doesn't react
  // and sometimes steps the wrong way.
  function senseThreats(s, c, b) {
    const sk = b.sk; let soon = 9, ex = 0, ey = 0, id = 0;
    const note = (tti, x, y, key) => { if (tti < soon) soon = tti; if (x || y) { ex = x; ey = y; id = key; } };
    for (const p of s.proj) {
      if (p.team === c.team) continue;
      if (p.homing) { if (p.target === c && p.owner.kind === 'champ') note(dist(p, c) / p.speed, 0, 0, 0); continue; }
      if (p.age < sk.react * .5) continue;
      const sp = Math.hypot(p.vx, p.vy) || 1, nx = p.vx / sp, ny = p.vy / sp, rx = c.x - p.x, ry = c.y - p.y, along = rx * nx + ry * ny;
      if (along < -30 || along > 640) continue;
      const side = rx * -ny + ry * nx;
      if (Math.abs(side) < p.w / 2 + c.r + 18) { const sg = side >= 0 ? 1 : -1; note(along / sp, -ny * sg, nx * sg, p.id); }
    }
    for (const z of s.zones) {
      if (z.kind !== 'blast' || z.team === c.team || z.total - z.t < sk.react) continue;
      if (Math.hypot(c.x - z.x, c.y - z.y) < z.r + c.r + 12) { const n = norm(c.x - z.x, c.y - z.y); note(z.t, n.x, n.y, z.id); }
    }
    for (const e of b.foes) {
      const ch = e.chan;
      if (ch && ch.kind === 'line' && ch.total - ch.t >= sk.react * .5) {
        const sd = segDist(c.x, c.y, e.x, e.y, e.x + ch.dx * ch.len, e.y + ch.dy * ch.len);
        if (sd < ch.w / 2 + c.r + 16) { let x = -ch.dy, y = ch.dx; if (x * (c.x - e.x) + y * (c.y - e.y) < 0) { x = -x; y = -y; } note(ch.t, x, y, e.id * 7 + (s.t | 0)); }
      }
      if (e.charge && e.charge.t > .7 && sk.iq > .6 && dist(c, e) < 820) {
        const sd = segDist(c.x, c.y, e.x, e.y, e.x + e.charge.dx * 820, e.y + e.charge.dy * 820);
        if (sd < 34 + c.r) { let x = -e.charge.dy, y = e.charge.dx; if (x * (c.x - e.x) + y * (c.y - e.y) < 0) { x = -x; y = -y; } note(.4, x, y, e.id * 11 + (s.t | 0)); }
      }
      if (KITS[e.champ].melee && e.atkCd < .15 && dist(e, c) < e.range + c.r + 6 && sk.iq > .5) note(.15, 0, 0, 0);
    }
    b.threatT = soon;
    if (id && id !== b.dodgeSeen) {
      b.dodgeSeen = id;
      if (hash01(id, c.id) < sk.dodge) {
        const flip = hash01(id, c.id + 5) < sk.wrongWay ? -1 : 1;
        b.pendEx = ex * flip; b.pendEy = ey * flip; b.pendT = s.t + sk.react * (.5 + s.rand() * .8);
      }
    }
    if (b.pendT && s.t >= b.pendT) { b.pendT = 0; if (b.evadeT <= 0) { b.ex = b.pendEx; b.ey = b.pendEy; b.evadeT = .24 + s.rand() * .22; } }
    b.parry = soon < .3 && (sk.iq > .4 || s.rand() < .25);
  }

  function pickTarget(s, c, b, ai) {
    const sk = b.sk, carry = c.role === 'support' ? carryOf(s, c, ai) : null, front = b.cls === 'front';
    let best = null, bv = -1e9;
    for (const e of b.foes) {
      const d = dist(c, e); if (d > sk.see) continue;
      const kill = e.hp <= burstOn(c, e);
      let v = (front ? 1.8 : 1.4) * (1 - d / 1000) + sk.iq * ((1 - frac(e)) * 1.1 + CARRY[e.champ] * (b.cls === 'flank' ? 1.2 : .5) + (kill ? 1.2 : 0));
      if (e.id === b.tid) v += .35;
      if (e.id === ai.focus) v += .3 + sk.iq * .3;
      if (carry && sk.iq > .4 && dist(e, carry) < 380) v += .8;
      if (sk.iq > .4 && !kill) { const tw = towerOver(s, c.team, e.x, e.y); if (tw && alliesTanking(s, c.team, tw) < 2) v -= 1.2; }
      if (sk.iq > .3 && !losClear(s, c.x, c.y, e.x, e.y)) v -= .4;
      if (v > bv) { bv = v; best = e; }
    }
    return best;
  }

  function assess(s, c, b, ai) {
    let mine = power(c), theirs = 0, foeN = 0;
    for (const a of s.champs) if (a !== c && a.alive && a.team === c.team && dist(a, c) < 850) mine += power(a);
    for (const e of b.foes) if (dist(e, c) < 1000) { theirs += power(e, true); foeN++; }
    // Enemies last seen nearby still count, at the confidence the bot's memory allows.
    const mem = memThreat(s, c, b, ai, c.x, c.y, 900);
    if (mem > .1 && foeN) theirs += mem * (theirs / foeN) * .7;
    // Being under a friendly tower is worth a lot; under an enemy one worse still unless the wave is tanking.
    for (const t of s.towers) if (t.alive && dist(c, t) < t.range) { if (t.team === c.team) mine *= 1.3; else theirs = (theirs || power(c) * .6) * (t === b.et && b.etTanks >= 2 ? 1.15 : 1.8); }
    let fn = 0, on = 0; for (const m of s.minions) if (m.alive && dist(m, c) < 420) { if (m.team === c.team) on++; else fn++; }
    const waveK = clamp(1 + (on - fn) * .05, .75, 1.25);
    return mine * waveK * b.sk.aggr * (1 + b.noise * b.sk.judge) / Math.max(theirs, .01);
  }

  function findLastHit(s, c, b) {
    const sk = b.sk, hit = c.dmgBase * (c.buffT > 0 ? 1.2 : 1) * 100 / 110, melee = KITS[c.champ].melee;
    let best = null, bh = 1e9; b.lhSoon = false;
    for (const m of s.minions) {
      if (!m.alive || m.team === c.team || m.delay > 0 || m.hp > hit * 2.6) continue;
      const d = dist(c, m) - m.r; if (d > c.range + 200) continue;
      b.lhSoon = true;
      const tt = Math.max(0, c.atkCd) + (melee ? 0 : Math.max(0, d) / 1100); let inc = 0;
      for (const p of s.proj) if (p.homing && p.target === m && dist(p, m) / p.speed <= tt + .05) inc += p.dmg * 100 / 110;
      // Allied melee minions already swinging at it land before a slow shot would.
      if (tt > .4) for (const a of s.minions) if (a.alive && a.team === c.team && !a.ranged && a.cd < tt && dist(a, m) - m.r < a.range) inc += a.dmg * 100 / 110;
      const left = m.hp - inc;
      if (left <= 0 || left > hit * (1 + sk.lhErr * (hash01(m.id, c.id) * 2 - 1)) || hash01(m.id, c.id + 991) > sk.lh) continue;
      if (left < bh) { bh = left; best = m; }
    }
    return best;
  }

  // ---------- bots: jobs ----------
  function fightMove(s, c, b, t, d, ai) {
    const k = KITS[c.champ], iq = b.sk.iq, cls = b.cls;
    // Peel: a support stays close to the carry and never out in front of it.
    if (cls === 'peel') {
      const carry = carryOf(s, c, ai);
      if (carry && dist(carry, c) > 420) { const n = norm(s.fountains[c.team].x - carry.x, s.fountains[c.team].y - carry.y); moveTo(b, carry.x + n.x * 120, carry.y + n.y * 120, 40); return; }
    }
    if (k.melee) {
      if (cls === 'flank' && iq > .45 && d > 260 && d < 800) {
        // Come in from the side or behind, where Rend hits hardest.
        const bx = t.x - (t.fx || 0) * 150, by = t.y - (t.fy || 0) * 150;
        moveTo(b, bx + -(t.fy || 0) * b.strafe * 90, by + (t.fx || 0) * b.strafe * 90, 50); return;
      }
      if (d > k.pref) moveTo(b, t.x + t.vx * .12, t.y + t.vy * .12, k.pref * .7);
      else if (iq > .6) { const n = norm(t.x - c.x, t.y - c.y); moveDir(b, -n.y * b.strafe, n.x * b.strafe); }
      else noMove(b);
      return;
    }
    // Walls block attacks, so a ranged bot with no line of sight must walk until it has one.
    if (d < c.range + t.r && !losClear(s, c.x, c.y, t.x, t.y)) { moveTo(b, t.x, t.y, Math.max(40, k.pref * .6)); return; }
    // Ranged: stay at the edge of range, beyond the target's reach when possible.
    const edge = Math.max(c.range + t.r - 30, (t.range || 0) + 45);
    if (d > c.range + t.r - 15) moveTo(b, t.x, t.y, k.pref);
    else if (d < Math.min(edge, k.pref * .72) || (c.atkCd > .25 && d < t.range + 80)) { const n = norm(c.x - t.x, c.y - t.y); moveDir(b, n.x, n.y); }
    else if (iq > .4) { const n = norm(t.x - c.x, t.y - c.y); moveDir(b, -n.y * b.strafe, n.x * b.strafe); }
    else noMove(b);
  }

  // Where this bot should stand on a lane: behind its own wave, or by its tower when there is none.
  function laneTask(s, c, b, lane, ai, pushing) {
    const k = KITS[c.champ], info = s.laneInfo[c.team][lane], front = info.front, foeFront = s.laneInfo[1 - c.team][lane].front, own = firstTower(s, c.team, lane);
    const wob = Math.sin(c.slot * 2.1), center = mapCenter(s);
    let x, y;
    if (front) {
      const p = front.path, wp = Math.min(front.wp, p.length - 1), prev = p[Math.max(0, wp - 1)], n = norm(prev[0] - front.x, prev[1] - front.y);
      const back = k.melee ? 60 : clamp(c.range * .55, 80, 260);
      x = front.x + n.x * back - n.y * wob * 46; y = front.y + n.y * back + n.x * wob * 46;
    } else if (pushing) {
      const et = firstTower(s, 1 - c.team, lane), n = norm(c.x - et.x, c.y - et.y), n2 = norm(s.fountains[c.team].x - et.x, s.fountains[c.team].y - et.y);
      x = et.x + n2.x * (et.range + 90); y = et.y + n2.y * (et.range + 90);
    } else { const n = norm(center.x - own.x, center.y - own.y); x = own.x + n.x * 130; y = own.y + n.y * 130 + (lane ? -40 : 40); }
    // Never let the standing spot drift off the lane or inside an enemy tower it can't tank.
    const near = laneNearest(s, lane, x, y);
    if (near.d > 200) { const n = norm(x - near.x, y - near.y); x = near.x + n.x * 200; y = near.y + n.y * 200; }
    const tw = towerOver(s, c.team, x, y, 34);
    if (tw && alliesTanking(s, c.team, tw) < 2) { const n = norm(x - tw.x, y - tw.y); x = tw.x + n.x * (tw.range + 50); y = tw.y + n.y * (tw.range + 50); }
    // The support stays with its carry, a little behind.
    const carry = c.role === 'support' ? carryOf(s, c, ai) : null, withCarry = carry && dist(carry, s.fountains[c.team]) > 700;
    if (withCarry) { const n = norm(s.fountains[c.team].x - carry.x, s.fountains[c.team].y - carry.y); x = carry.x + n.x * 130 - n.y * 60; y = carry.y + n.y * 130 + n.x * 60; }
    const lh = withCarry && dist(carry, c) < 800 ? null : findLastHit(s, c, b);
    let dest = { x, y, a: 26 };
    const t = b.et;
    if (t && b.etTanks >= 2 && towerOpen(s, t)) b.siegeT = s.t + .8; // a wave stepping in and out of range must not flip the plan
    const siege = t && s.t < b.siegeT && towerOpen(s, t);
    const underTw = towerOver(s, c.team, c.x, c.y, 10);
    // Wave plan: shove when told to or when the lane is free; otherwise last-hit and let the wave hold.
    const free = b.closest > 1100;
    const shove = pushing || free || (foeFront && dist(foeFront, own) < own.range + 260) || frac(c) < b.sk.low + .2;
    if (lh && dist(c, lh) - lh.r <= c.range) { c.atk = true; c.atkPref = lh.id; }
    else if (lh && !carry && !underTw && !towerOver(s, c.team, lh.x, lh.y, 10)) dest = { x: lh.x, y: lh.y, a: c.range + lh.r - 30 };
    else if (siege && dist(c, t) - t.r < c.range + 200) {
      if (dist(c, t) - t.r <= c.range - 4) { c.atk = true; c.atkPref = t.id; c.preferTower = true; }
      else dest = { x: t.x, y: t.y, a: c.range + t.r - 24 };
    } else if (shove) {
      // Hit the wave, but never a champion from inside tower range: that brings the tower down on us.
      let near = null, nd = c.range + 15;
      for (const m of s.minions) if (m.alive && m.team !== c.team && m.delay <= 0) { const d = dist(c, m) - m.r; if (d < nd) { nd = d; near = m; } }
      if (near) { c.atk = true; c.atkPref = near.id; } else if (!underTw) c.atk = true;
    } else if (b.lhSoon) c.atk = false;
    else {
      const tgt = b.foes.find(e => e.id === b.tid);
      if (tgt && dist(c, tgt) - tgt.r < c.range && !underTw) {
        let n = 0; for (const m of s.minions) if (m.alive && m.team !== c.team && dist(m, c) < 380) n++;
        if (n <= 2) { c.atk = true; c.atkPref = tgt.id; }
      }
    }
    moveTo(b, dest.x, dest.y, dest.a);
  }

  // A gank is earned: only after a full jungle route, and only on a target worth it.
  function pickGank(s, c, b, ai) {
    if (b.gank) {
      const e = b.foes.find(x => x.id === b.gank.id);
      if (e && s.t < b.gank.until && !towerOver(s, c.team, e.x, e.y)) return e;
      b.gank = null; b.gankCd = s.t + 8;
    }
    if (!b.gankReady || s.t < b.gankCd || frac(c) < .6 || c.lvl < 2) return null;
    let best = null, bv = .72;
    for (const e of b.foes) {
      if (dist(e, c) > 1800 || towerOver(s, c.team, e.x, e.y)) continue;
      const deep = c.team ? e.x > W * .52 : e.x < W * .48, hurt = frac(e), mate = s.champs.some(a => a !== c && a.alive && a.team === c.team && dist(a, e) < 700);
      let v = (deep ? .9 : 0) + (hurt < .7 ? .5 : 0) + (hurt < .4 ? .6 : 0) + (mate ? .55 : 0);
      if (!deep && hurt > .55 && !mate) v -= .8;
      if (memThreat(s, c, b, ai, e.x, e.y, 700) > 1) v -= .5;
      v *= .55 + b.sk.iq * .45;
      if (v > bv) { bv = v; best = e; }
    }
    if (best) { b.gank = { id: best.id, until: s.t + 14 }; b.gankReady = false; }
    return best;
  }

  // Own camps in order: one half of the map, then the other. A full circuit earns a gank.
  function jungleRoute(s, c, b) {
    const own = s.camps.filter(k => k.side === c.team);
    const upper = own.filter(k => k.y < H / 2), lower = own.filter(k => k.y >= H / 2), firstUp = hash01(c.id + (c.team * 37), 11) < .5;
    const byBig = (a, z) => (a.big ? 1 : 0) - (z.big ? 1 : 0);
    const route = [...(firstUp ? upper : lower).sort(byBig), ...(firstUp ? lower : upper).sort((a, z) => byBig(z, a))];
    b.route = route; b.routeI = 0;
  }

  function jungleTask(s, c, b, ai) {
    b.task = 'jungle';
    const g = pickGank(s, c, b, ai);
    if (g) { b.task = 'gank'; moveTo(b, g.x, g.y, 60); c.atk = true; return; }
    if (!b.route) jungleRoute(s, c, b);
    // Walk the route: the current camp if it is up or nearly up, otherwise the next live one.
    // A camp cleared and not back soon moves the route on; finishing a circuit earns a gank.
    let camp = null;
    for (let i = 0; i < b.route.length; i++) {
      const k = b.route[b.routeI];
      if (k.alive || k.at - s.t < 12) { camp = k; break; }
      b.routeI++; if (b.routeI >= b.route.length) { b.routeI = 0; b.cycles++; b.gankReady = true; }
    }
    if (!camp) {
      // Everything of ours is down. Stand at the camp due back soonest, unless an enemy-side camp is free after laning.
      let soon = null, st = 1e9;
      for (const k of b.route) if (k.at < st) { st = k.at; soon = k; }
      let enemy = null, bc = 1e9;
      if (ai.phase !== 'lane') for (const k of s.camps) {
        if (!k.alive || k.side === c.team) continue;
        if (memThreat(s, c, b, ai, k.x, k.y, 700) > .7 || b.foes.some(e => dist(e, k) < 900)) continue;
        const d = dist(c, k); if (d < bc) { bc = d; enemy = k; }
      }
      camp = enemy || soon;
    }
    let m = null, md = 1e9;
    if (camp.alive) for (const x of s.monsters) if (x.alive && x.camp === camp.id) { const d = dist(c, x); if (d < md) { md = d; m = x; } }
    if (!m) { moveTo(b, camp.x, camp.y, 40); return; }
    const low = frac(c);
    if (low < (camp.big ? .42 : .34) && !s.monsters.some(x => x.alive && x.camp === camp.id && x.hp < x.maxHp * .35)) { b.low = true; return; }
    moveTo(b, m.x, m.y, KITS[c.champ].pref * .85);
    if (md - m.r <= c.range) { c.atk = true; c.atkPref = m.id; }
    castPve(s, c, b, m, md);
  }

  function hoardTask(s, c, b, ai) {
    const boss = s.monsters.find(m => m.boss && m.alive);
    if (!boss) { moveTo(b, ai.hoard.x, ai.hoard.y, 90); return true; } // gather a little before it spawns
    const d = dist(c, boss);
    if (!ai.hoardGo && d > 760) { moveTo(b, ai.hoard.x, ai.hoard.y, 90); return true; }
    const want = Math.max(KITS[c.champ].pref + boss.r * .3, boss.r + c.r + 10);
    if (d > want) moveTo(b, boss.x, boss.y, want); else noMove(b);
    if (d - boss.r <= c.range) { c.atk = true; c.atkPref = boss.id; }
    castPve(s, c, b, boss, d);
    return true;
  }

  // ---------- bots: the decision each bot makes ----------
  function botThink(s, c, b) {
    const sk = b.sk, ai = s.ai[c.team]; ensureAi(ai);
    const f = frac(c), home = s.fountains[c.team], homeD = dist(c, home), laning = ai.phase === 'lane', laner = c.role !== 'jungle' && roleLane(c) >= 0;
    c.atk = false; c.atkPref = 0; c.preferTower = false; b.still = false; b.diveOk = false;
    if (s.t >= b.noiseAt) { b.noise = (s.rand() - .5) * 2; b.noiseAt = s.t + 3 + s.rand() * 3; b.strafe = -b.strafe; }

    const foes = b.foes; foes.length = 0; b.closest = 1e9;
    for (const e of s.champs) if (e.team !== c.team && e.alive && !e.air && canSee(s, c.team, e)) { foes.push(e); b.closest = Math.min(b.closest, dist(e, c)); }
    b.et = towerOver(s, c.team, c.x, c.y, 240); b.etTanks = b.et ? alliesTanking(s, c.team, b.et) : 0;
    senseThreats(s, c, b);
    const t = pickTarget(s, c, b, ai), d = t ? dist(c, t) : 1e9; b.tid = t ? t.id : 0;
    if (c.charge) handleCharge(s, c, b, t, d);
    if (c.stunT > 0) { noMove(b); return; }

    if (homeD < 300) { b.lastHome = s.t; if (f > .92) b.low = false; }
    // Forge the moment it's affordable: anyone can press the button from anywhere.
    const nb = nextBuy(s, c, ai); if (nb && c.gold >= nb.cost) c.q.push({ t: 'forge', track: nb.track });
    if (c.hp < (b.hpWas || c.hp) - .5) b.hurtAt = s.t;
    b.hpWas = c.hp;
    if (c.chan && c.chan.recall) {
      if (b.closest >= 650) { b.task = 'recall'; b.still = true; noMove(b); return; }
      // moving is what cancels a recall, the same as for a player
    }
    b.ratio = t ? assess(s, c, b, ai) : 2;
    // Just died, or keeps dying: come back carefully rather than feed the same fight.
    const recent = b.deaths.reduce((n, at) => n + (s.t - at < 120 ? 1 : 0), 0), fresh = c.spawnT !== undefined && s.t - c.spawnT < 16;
    if (recent >= 2) { const last = b.deaths[b.deaths.length - 1] || 0; b.safeUntil = Math.max(b.safeUntil, last + 22 + (recent - 1) * 14); }
    const safeMode = s.t < b.safeUntil;
    if (safeMode) b.ratio *= 1 - .4 * sk.guard;
    if (fresh) b.ratio *= 1 - .1 * sk.guard;
    if (b.deaths.length > 6) b.deaths.splice(0, b.deaths.length - 6);

    // Too hurt to stay: recall if it is quiet, walk home if it is not.
    if (f < sk.low || (f < sk.low + .15 && b.closest < 600 && b.ratio < .9)) b.low = true;
    if (b.low) {
      b.task = 'low';
      if (homeD < 300) { c.atk = !towerOver(s, c.team, c.x, c.y, 0); noMove(b); return; }
      const hitLately = s.t - (b.hurtAt || -9) < 2.2 || s.monsters.some(m => m.alive && m.tgt === c);
      const quiet = b.closest >= 700 && homeD > 900 && !hitLately && memThreat(s, c, b, ai, c.x, c.y, 650) < .5 + (1 - sk.iq);
      if (quiet) { if (!c.chan) c.q.push({ t: 'recall' }); b.still = true; noMove(b); return; }
      moveTo(b, home.x, home.y, 40); c.atk = !towerOver(s, c.team, c.x, c.y, 0); if (t) useCombo(s, c, b, t, 'retreat');
      return;
    }
    const heeds = key => hash01(key, c.id + 3) < .3 + .7 * sk.macro;
    const called = ai.defend && ai.defend.ids.includes(c.id) && heeds(ai.defend.id + (s.t / 20 | 0));

    if (t) {
      const kill = t.hp <= burstOn(c, t), tw = towerOver(s, c.team, t.x, t.y, 10), tanks = tw ? alliesTanking(s, c.team, tw) : 0;
      // A dive pays for every tower shot it takes, with compounding.
      const shots = 1 + Math.ceil((d / c.msBase + 1) / 1.1); let shotsSum = 0; for (let i = 0; i < shots; i++) shotsSum += towerShot(s, i);
      const sureKill = kill && c.hp > shotsSum;
      const pokeFromOut = tw && d - t.r <= c.range && !towerOver(s, c.team, c.x, c.y, 0);
      const group = ai.push !== null || ai.hoard;
      let want = (kill && b.ratio > .7) || (b.ratio > 1.4 && (frac(t) < .7 || d < 620)) || (b.ratio > 1.15 && d < c.range + 70)
        || (b.fighting && b.ratio > .78 && d < 900) || (group && b.ratio > .95 && d < 850);
      if (tw && !sureKill && !pokeFromOut) want = false;
      if (f < .45 && b.ratio < 1.2 && !kill) want = false;
      const pack = s.champs.reduce((n, e) => n + (e.team !== c.team && e.alive && !e.air && dist(e, c) < 800 && canSee(s, c.team, e) ? 1 : e.team === c.team && e.alive && dist(e, c) < 800 ? -1 : 0), 0), outnumbered = pack >= 2 && !kill;
      if (outnumbered) want = false;
      // Laning leash: laners trade on their lane and don't chase off it.
      if (laning && laner && want) {
        const off = laneDist(s, b.lane, t.x, t.y), up = (rdy(c, 0) ? 1 : 0) + (rdy(c, 1) ? 1 : 0);
        if (off > 340 && !(kill && off < 520)) want = false;
        if (!kill) {
          if (up < 1 && b.ratio < 1.4) want = false;
          if (s.t < b.tradeT) want = false;
        }
      }
      if (laning && c.role === 'jungle' && !b.gank && !ai.help[c.id] && !kill && d > 600) want = false;
      if (safeMode && !kill) want = want && b.ratio > 1.2;
      // No long chases: a beginner gives up late, and a sharper bot sooner when it is losing ground.
      if (want && d > c.range + 90 && !kill) { b.chase += sk.think; if (b.chase > 1.6 + sk.iq * 1.4) { want = false; b.noChase = s.t + 4; b.chase = 0; } } else b.chase = 0;
      if (s.t < b.noChase && !kill) want = false;
      if (laning && laner && b.fighting && !want && !kill) b.tradeT = s.t + 3.5;
      b.fighting = !!want;
      if (want) {
        b.task = 'fight';
        b.diveOk = !tw || sureKill;
        fightMove(s, c, b, t, d, ai);
        c.atk = true; if (d - t.r <= c.range) c.atkPref = t.id;
        useCombo(s, c, b, t, 'fight');
        return;
      }
      // Losing the local fight: back off along the lane to the tower, and use what escapes there are.
      if ((b.ratio < .62 || outnumbered) && d < 720) {
        b.task = 'retreat';
        let safe = laning && laner ? firstTower(s, c.team, b.lane) : home, sd = dist(c, safe);
        if (!(laning && laner)) for (const o of s.towers) if (o.alive && o.team === c.team) { const od = dist(c, o); if (od < sd && dist(o, t) > od * .7) { sd = od; safe = o; } }
        moveTo(b, safe.x, safe.y, 120); c.atk = !towerOver(s, c.team, c.x, c.y, 0);
        useCombo(s, c, b, t, 'retreat');
        return;
      }
    } else b.fighting = false;

    // Team plan first, then the role's normal job.
    if (called) { b.task = 'defend'; moveTo(b, ai.defend.x, ai.defend.y, 60); c.atk = true; }
    else if (ai.help[c.id] && ai.help[c.id].alive && heeds(ai.help[c.id].id + (s.t / 12 | 0))) { b.task = 'help'; const a = ai.help[c.id]; moveTo(b, a.x, a.y, 130); c.atk = true; }
    else if (ai.cover[c.id] !== undefined) { b.task = 'cover'; laneTask(s, c, b, ai.cover[c.id], ai, false); }
    else if (ai.hoard && (hash01(1 + (s.t / 25 | 0), c.id + 7) < .65 + .35 * sk.macro) && hoardTask(s, c, b, ai)) { b.task = 'boss'; }
    else if (ai.sites[c.id] && ai.sites[c.id].alive && heeds(ai.sites[c.id].id + 41 + (s.t / 25 | 0))) { b.task = 'site'; const z = ai.sites[c.id]; moveTo(b, z.x, z.y, 70); c.atk = true; }
    else if (ai.split === c.id && ai.push !== null) { b.task = 'split'; laneTask(s, c, b, ai.push === 0 ? 1 : 0, ai, true); }
    else if (ai.push !== null) { b.task = 'push'; laneTask(s, c, b, ai.push, ai, true); }
    else if (c.role === 'jungle') jungleTask(s, c, b, ai);
    else { b.task = 'lane'; laneTask(s, c, b, b.lane, ai, false); }

    // Poke with whatever is free when standing somewhere safe.
    const safeSpot = !towerOver(s, c.team, c.x, c.y) && b.ratio >= .7 && f > .4;
    if (t ? safeSpot && !(laning && s.t < b.tradeT) : c.champ === 'solenne') useCombo(s, c, b, t, 'poke');
  }

  // ---------- rank contract ----------
  const RANKS = [{ name: 'Rookie', at: 0 }, { name: 'Vigilante', at: 1100 }, { name: 'Sentinel', at: 1400 }, { name: 'Guardian', at: 1700 }, { name: 'Champion', at: 2000 }, { name: 'Legend', at: 2350 }];
  function rankOf(r) {
    let i = 0; RANKS.forEach((x, k) => { if (r >= x.at) i = k; });
    const at = RANKS[i].at, next = RANKS[i + 1] ? RANKS[i + 1].at : null;
    return { name: RANKS[i].name, tier: i, next, frac: next === null ? 1 : clamp((r - at) / (next - at), 0, 1) };
  }
  // Rank onto bot skill: the default 1000 is about .3, a Legend about .9.
  const rankSkill = r => clamp(.3 + (r - 1000) * .6 / 1350, .12, .95);
  // The rating change for one match. Beating tougher bots pays more; a good personal game softens a loss.
  function rankDelta(rank, won, stats, teamAvgBotSkill) {
    const st = stats || {}, you = rankSkill(rank), them = teamAvgBotSkill === undefined ? you : teamAvgBotSkill;
    const expected = clamp(.5 + (you - them) * 1.6, .08, .92);
    let d = 34 * ((won ? 1 : 0) - expected);
    const kda = ((st.kills || 0) + (st.assists || 0) * .5) / Math.max(1, st.deaths || 0);
    d += clamp((kda - 1.5) * 2.2, -5, 5);
    return Math.round(clamp(d, -45, 45));
  }
  // n skills around the median mapped from average player rank, with a spread, and at least one very
  // advanced bot in every group of four (one per enemy team when the caller slices seats by four).
  function botSkills(avgPlayerRank, n, seed) {
    const r = rng(seed || 1), med = rankSkill(avgPlayerRank === undefined ? 1000 : avgPlayerRank), out = [];
    for (let i = 0; i < n; i++) out.push(clamp(med + (r() + r() + r() - 1.5) * .22, .05, .98));
    for (let g = 0; g < n; g += 4) {
      const span = Math.min(4, n - g), idx = g + (r() * span | 0);
      if (!out.slice(g, g + span).some(v => v >= .78 || v >= med + .3)) out[idx] = clamp(Math.max(.72, med + .34) + r() * .08, 0, .98);
    }
    return out;
  }

  // ---------- networking: compact state for host-authoritative play ----------
  // Fast state is binary and goes out unreliably about 20 times a second. Slow state is a
  // sparse delta of whole numbers on the reliable channel, so a lost packet can't desync it.
  const FX_CODE = ['snipe', 'snipeFull', 'deadeye', 'orb', 'ray', 'chain', 'bolt', 'mbolt', 'tower', 'rupture', 'crash', 'heal', 'stomp', 'dome', 'break', 'dash', 'parry', 'slash'];
  const FX_NUM = {}; FX_CODE.forEach((f, i) => { FX_NUM[f] = i; });
  const POS = 14, SNAP_MAGIC = 0xF3;
  const wb = new DataView(new ArrayBuffer(32768)); let wp = 0;
  const w8 = v => { wb.setUint8(wp, v); wp += 1; };
  const wi8 = v => { wb.setInt8(wp, clamp(Math.round(v), -127, 127)); wp += 1; };
  const w16 = v => { wb.setUint16(wp, clamp(Math.round(v), 0, 65535), true); wp += 2; };
  const wi16 = v => { wb.setInt16(wp, clamp(Math.round(v), -32767, 32767), true); wp += 2; };
  const wPos = v => w16(v * POS);
  const wVar = v => { v = v >>> 0; while (v > 127) { w8(v & 127 | 128); v >>>= 7; } w8(v); };
  const wByte = v => w8(clamp(Math.round(v), 0, 255));
  const hp8 = u => clamp(Math.ceil(u.hp / u.maxHp * 255), 1, 255);
  function wList(list, cap, fn) {
    const n = Math.min(list.length, cap); wVar(n); let prev = 0;
    for (let i = 0; i < n; i++) { const u = list[i]; wVar(u.id - prev); prev = u.id; fn(u); }
  }

  // Everything that moves or flickers. `seat` indexes the guest's champion in s.champs.
  function snapshot(s, seat = -1, ack = 0) {
    wp = 0; w8(SNAP_MAGIC); wb.setUint32(wp, s.tick, true); wp += 4; w16(ack); w8(seat + 1);
    w8(s.champs.length);
    for (const c of s.champs) {
      const chan = c.chan, ch = c.charge, brush = c.inBrush >= 0;
      const fl = (c.alive ? 1 : 0) | (c.air > 0 ? 2 : 0) | (c.dash ? 4 : 0) | (c.stunT > 0 ? 8 : 0) | (c.slowT > 0 ? 16 : 0) | (c.markT > 0 ? 32 : 0) | (c.parryT > 0 ? 64 : 0)
        | (c.drT > 0 ? 128 : 0) | (c.buffT > 0 ? 256 : 0) | (c.empowerT > 0 ? 512 : 0) | (c.revealT > 0 ? 1024 : 0) | (chan ? 2048 : 0) | (ch ? 4096 : 0) | (brush ? 8192 : 0) | (c.echo ? 16384 : 0) | (c.leap ? 32768 : 0);
      wPos(c.x); wPos(c.y); w16(Math.ceil(c.hp)); wi8((c.fx || 0) * 127); wi8((c.fy || 0) * 127); wb.setUint16(wp, fl, true); wp += 2;
      if (c.air > 0) wByte((c.z || 0) / 2);
      if (brush) w8(c.inBrush);
      if (chan) { w8(chan.recall ? 0 : chan.slot + 1); wByte(chan.t * 20); wByte(chan.total * 20); wi8((chan.dx || 0) * 127); wi8((chan.dy || 0) * 127); }
      if (ch) { w8(ch.slot); wByte(ch.t * 50); wi8(ch.dx * 127); wi8(ch.dy * 127); }
      if (c.echo) { wPos(c.echo.x); wPos(c.echo.y); }
    }
    if (seat >= 0) {
      const c = s.champs[seat];
      for (let i = 0; i < 3; i++) w16(Math.max(0, c.cd[i]) * 100);
      for (let i = 0; i < 3; i++) w16(Math.max(0, c.recast[i]) * 100);
      w16(Math.max(0, c.atkCd) * 100); wByte((c.slowT > 0 ? c.slowA : 0) * 100);
    }
    wList(s.monsters, 60, m => { wPos(m.x); wPos(m.y); w8(hp8(m)); w8((m.big ? 1 : 0) | (m.boss ? 2 : 0) | (m.stunT > 0 ? 4 : 0) | (m.slowT > 0 ? 8 : 0) | (m.markT > 0 ? 16 : 0)); });
    wList(s.minions, 240, m => { wPos(m.x); wPos(m.y); w8(hp8(m)); w8((m.team ? 1 : 0) | (m.ranged ? 2 : 0) | (m.stunT > 0 ? 4 : 0) | (m.slowT > 0 ? 8 : 0) | (m.markT > 0 ? 16 : 0) | (m.delay > 0 ? 32 : 0) | (m.lane ? 64 : 0)); });
    wList(s.proj, 160, p => {
      wPos(p.x); wPos(p.y); w8(p.team | (p.homing ? 4 : 0) | (p.pierce ? 8 : 0)); w8(FX_NUM[p.fx] === undefined ? 255 : FX_NUM[p.fx]); wByte(p.w); wVar(p.owner.id);
      if (p.homing) wVar(p.target.id); else { wi16(p.vx / 8); wi16(p.vy / 8); }
    });
    wList(s.zones, 40, z => { wPos(z.x); wPos(z.y); w16(z.r); wByte(z.t * 20); wByte(z.total * 20); w8(z.team | (z.kind === 'dome' ? 4 : 0)); w8(FX_NUM[z.fx] === undefined ? 255 : FX_NUM[z.fx]); wVar(z.owner.id); });
    let mask = 0; s.sites.forEach((z, i) => { if (z.prog[0] > 0 || z.prog[1] > 0) mask |= 1 << i; });
    w8(mask); s.sites.forEach((z, i) => { if (mask & 1 << i) { wByte(z.prog[0] * 40); wByte(z.prog[1] * 40); } });
    return wb.buffer.slice(0, wp);
  }

  function decodeSnapshot(buf) {
    const d = new DataView(buf); let p = 0;
    const r8 = () => d.getUint8(p++), ri8 = () => d.getInt8(p++), r16 = () => { const v = d.getUint16(p, true); p += 2; return v; }, ri16 = () => { const v = d.getInt16(p, true); p += 2; return v; };
    const rPos = () => r16() / POS, rVar = () => { let v = 0, sh = 0, b; do { b = r8(); v |= (b & 127) << sh; sh += 7; } while (b & 128); return v >>> 0; };
    if (r8() !== SNAP_MAGIC) return null;
    const tick = d.getUint32(p, true); p += 4;
    const ack = r16(), seat = r8() - 1, n = r8(), champs = [];
    for (let i = 0; i < n; i++) {
      const c = { x: rPos(), y: rPos(), hp: r16(), fx: ri8() / 127, fy: ri8() / 127, fl: r16(), z: 0, br: -1, chan: null, charge: null, echo: null };
      if (c.fl & 2) c.z = r8() * 2;
      if (c.fl & 8192) c.br = r8();
      if (c.fl & 2048) c.chan = { n: r8(), t: r8() / 20, total: r8() / 20, dx: ri8() / 127, dy: ri8() / 127 };
      if (c.fl & 4096) c.charge = { slot: r8(), t: r8() / 50, dx: ri8() / 127, dy: ri8() / 127 };
      if (c.fl & 16384) c.echo = { x: rPos(), y: rPos() };
      champs.push(c);
    }
    let own = null;
    if (seat >= 0) own = { cd: [r16() / 100, r16() / 100, r16() / 100], recast: [r16() / 100, r16() / 100, r16() / 100], atkCd: r16() / 100, slowA: r8() / 100 };
    const list = fn => { const k = rVar(), out = new Array(k); let id = 0; for (let i = 0; i < k; i++) { id += rVar(); out[i] = fn(id); } return out; };
    const mon = list(id => ({ id, x: rPos(), y: rPos(), hp: r8(), fl: r8() }));
    const min = list(id => ({ id, x: rPos(), y: rPos(), hp: r8(), fl: r8() }));
    const proj = list(id => { const o = { id, x: rPos(), y: rPos(), fl: r8(), fx: r8(), w: r8(), owner: rVar(), target: 0, vx: 0, vy: 0 }; if (o.fl & 4) o.target = rVar(); else { o.vx = ri16() * 8; o.vy = ri16() * 8; } return o; });
    const zones = list(id => ({ id, x: rPos(), y: rPos(), r: r16(), t: r8() / 20, total: r8() / 20, fl: r8(), fx: r8(), owner: rVar() }));
    const mask = r8(); let prog = null;
    if (mask) { prog = {}; for (let i = 0; i < 8; i++) if (mask & 1 << i) prog[i] = [r8() / 40, r8() / 40]; }
    return { tick, ack, seat, champs, own, mon, min, proj, zones, prog, size: buf.byteLength };
  }

  // A renderer-shaped stand-in for a unit id the guest can't resolve (its owner already died, say).
  const ghostUnit = (id, x, y, team) => ({ id, x, y, px: x, py: y, team, alive: false, kind: 'ghost' });

  function placeUnit(u, a, b, f, span) {
    let x = a.x, y = a.y, vx = 0, vy = 0;
    if (b && span > 0) {
      const dx = b.x - a.x, dy = b.y - a.y;
      if (Math.hypot(dx, dy) > span * DT * 1500 + 80) { if (f >= .5) { x = b.x; y = b.y; } }
      else { x += dx * f; y += dy * f; vx = dx / (span * DT); vy = dy / (span * DT); }
    }
    u.x = u.px = x; u.y = u.py = y; u.vx = vx; u.vy = vy;
  }
  function byId(list) { const m = new Map(); for (const u of list) m.set(u.id, u); return m; }

  // Rebuilds s between two decoded snapshots. seat is skipped for position: its coin is predicted.
  // f can pass 1 a little, to carry on through a short gap instead of stopping dead.
  function applyFrame(s, A, B, f, seat = -1) {
    const span = B ? B.tick - A.tick : 0, rx = s.rx || (s.rx = { m: new Map(), n: new Map(), p: new Map(), z: new Map() });
    s.tick = A.tick; s.t = (A.tick + span * f) * DT;
    A.champs.forEach((a, i) => {
      const c = s.champs[i];
      if (i !== seat) {
        placeUnit(c, a, B && B.champs[i], f, span);
        applyChampState(c, a);
        c.z = B && B.champs[i].fl & 2 ? a.z + (B.champs[i].z - a.z) * f : a.z;
      }
    });
    const sync = (arr, frameA, frameB, map, make, keep) => {
      const nx = frameB && byId(frameB); arr.length = 0;
      for (const a of frameA) {
        let u = map.get(a.id); if (!u) { u = make(a); map.set(a.id, u); }
        placeUnit(u, a, nx && nx.get(a.id), f, span); keep(u, a); arr.push(u);
      }
      if (map.size > arr.length * 2 + 40) { const live = new Set(frameA.map(a => a.id)); for (const k of map.keys()) if (!live.has(k)) map.delete(k); }
    };
    sync(s.monsters, A.mon, B && B.mon, rx.m, a => ({ id: a.id, kind: 'monster', team: 2, alive: true, maxHp: 255, big: !!(a.fl & 1), boss: !!(a.fl & 2), r: a.fl & 2 ? 58 : a.fl & 1 ? 32 : 19, ms: a.fl & 2 ? 170 : 260, fx: 1, fy: 0 }),
      (u, a) => { u.hp = a.hp; u.stunT = a.fl & 4 ? 1 : 0; u.slowT = a.fl & 8 ? 1 : 0; u.markT = a.fl & 16 ? 1 : 0; });
    sync(s.minions, A.min, B && B.min, rx.n, a => ({ id: a.id, kind: 'minion', team: a.fl & 1, ranged: !!(a.fl & 2), lane: a.fl & 64 ? 1 : 0, alive: true, maxHp: 255, r: a.fl & 2 ? 14 : 17, sight: 500, ms: 215, range: a.fl & 2 ? 300 : 95, fx: a.fl & 1 ? -1 : 1, fy: 0 }),
      (u, a) => { u.hp = a.hp; u.stunT = a.fl & 4 ? 1 : 0; u.slowT = a.fl & 8 ? 1 : 0; u.markT = a.fl & 16 ? 1 : 0; u.delay = a.fl & 32 ? 1 : 0; });
    sync(s.proj, A.proj, B && B.proj, rx.p, a => ({ id: a.id, team: a.fl & 3, homing: !!(a.fl & 4), pierce: !!(a.fl & 8), fx: FX_CODE[a.fx], w: a.w, age: 0, vx: a.vx, vy: a.vy, seen: s.t }),
      (u, a) => { u.age = s.t - u.seen; u.vx = a.vx; u.vy = a.vy; u.w = a.w; if (!u.owner || u.owner.id !== a.owner) u.owner = unitOf(s, a.owner) || ghostUnit(a.owner, a.x, a.y, a.fl & 3); if (u.homing && (!u.target || u.target.id !== a.target)) u.target = unitOf(s, a.target) || ghostUnit(a.target, a.x, a.y, 2); });
    sync(s.zones, A.zones, null, rx.z, a => ({ id: a.id, x: a.x, y: a.y, kind: a.fl & 4 ? 'dome' : 'blast', fx: FX_CODE[a.fx], r: a.r, team: a.fl & 3, total: a.total, t: a.t }),
      (u, a) => { u.t = Math.max(0, a.t - span * f * DT); u.total = a.total; if (!u.owner) u.owner = unitOf(s, a.owner) || ghostUnit(a.owner, a.x, a.y, a.fl & 3); });
    for (const z of s.sites) { const p = A.prog && A.prog[z.id]; z.prog[0] = p ? p[0] : 0; z.prog[1] = p ? p[1] : 0; }
  }
  const unitOf = (s, id) => s.champs.find(c => c.id === id) || s.towers.find(c => c.id === id) || (s.rx && (s.rx.n.get(id) || s.rx.m.get(id)));
  function applyChampState(c, a) {
    const f = a.fl;
    c.alive = !!(f & 1); c.hp = a.hp; c.fx = a.fx; c.fy = a.fy; c.inBrush = a.br;
    c.air = f & 2 ? 1 : 0; c.dash = f & 4 ? (c.dash || { net: true }) : null; c.stunT = f & 8 ? 1 : 0; c.slowT = f & 16 ? 1 : 0; c.markT = f & 32 ? 1 : 0; c.parryT = f & 64 ? 1 : 0;
    c.drT = f & 128 ? 1 : 0; c.buffT = f & 256 ? 1 : 0; c.empowerT = f & 512 ? 1 : 0; c.revealT = f & 1024 ? 1 : 0; c.leap = f & 32768 ? true : null; if (!(f & 2)) c.z = 0;
    if (a.chan) {
      const ch = a.chan, slot = ch.n ? ch.n - 1 : undefined, ab = slot !== undefined ? c.kit[slot] : null;
      c.chan = { t: ch.t, total: ch.total, recall: !ch.n, slot, kind: ab && ab.shape === 'line' ? 'line' : undefined, dx: ch.dx, dy: ch.dy, len: ab ? ab.range : 0, w: ab ? ab.w : 0 };
    } else c.chan = null;
    c.charge = a.charge ? { slot: a.charge.slot, t: a.charge.t, dx: a.charge.dx, dy: a.charge.dy } : null;
    if (a.echo) { c.echo = a.echo; if (!(c.recast[1] > 0)) c.recast[1] = 1; } else { c.echo = null; c.recast[1] = 0; }
  }
  // Bring every field the guest's own coin needs from the newest snapshot, except where it moves.
  function applySnapshot(s, data, seat = -1) { const fr = typeof data.byteLength === 'number' ? decodeSnapshot(data) : data; if (fr) applyFrame(s, fr, null, 0, seat); return fr; }

  // Slow fields as flat whole numbers; a diff of two of these is the delta.
  function slowFlat(s) {
    return [
      [[Math.round(s.hope * 10), s.hopeTeam, s.kills[0], s.kills[1], Math.round(s.bossAt), s.bossUp ? 1 : 0, s.buff[0], s.buff[1], s.wave, s.over ? s.over.winner + 1 : 0, s.over ? Math.round(s.over.t * 10) : 0]],
      s.champs.map(c => [c.lvl, Math.round(c.xp), Math.floor(c.gold), Math.round(c.maxHp), Math.round(c.msBase), Math.ceil(c.respawn), c.up.edge, c.up.guard, c.up.haste, c.stats.kills, c.stats.deaths, c.stats.assists, c.stats.casts, c.stats.skillHits, c.stats.parries, Math.round(c.stats.dmg), c.as * 1000 | 0]),
      s.towers.map(t => [Math.ceil(t.hp), t.alive ? 1 : 0]),
      s.sites.map(z => [z.alive ? 1 : 0]),
    ];
  }
  function slowDiff(prev, cur) {
    const out = [];
    cur.forEach((sec, a) => sec.forEach((row, b) => row.forEach((v, c) => { if (!prev || prev[a][b][c] !== v) out.push(a, b, c, v); })));
    return out;
  }
  const G_FIELDS = [(s, v) => { s.hope = v / 10; }, (s, v) => { s.hopeTeam = v; }, (s, v) => { s.kills[0] = v; }, (s, v) => { s.kills[1] = v; }, (s, v) => { s.bossAt = v; }, (s, v) => { s.bossUp = !!v; }, (s, v) => { s.buff[0] = v; }, (s, v) => { s.buff[1] = v; }, (s, v) => { s.wave = v; }, (s, v) => { s.over = v ? Object.assign(s.over || { t: 0 }, { winner: v - 1 }) : null; }, (s, v) => { if (s.over) s.over.t = v / 10; }];
  const C_FIELDS = [(c, v) => { c.lvl = v; }, (c, v) => { c.xp = v; }, (c, v) => { c.gold = v; }, (c, v) => { c.maxHp = v; }, (c, v) => { c.msBase = v; }, (c, v) => { c.respawn = v; }, (c, v) => { c.up.edge = v; }, (c, v) => { c.up.guard = v; }, (c, v) => { c.up.haste = v; }, (c, v) => { c.stats.kills = v; }, (c, v) => { c.stats.deaths = v; }, (c, v) => { c.stats.assists = v; }, (c, v) => { c.stats.casts = v; }, (c, v) => { c.stats.skillHits = v; }, (c, v) => { c.stats.parries = v; }, (c, v) => { c.stats.dmg = v; }, (c, v) => { c.as = v / 1000; }];
  function applySlow(s, d) {
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i], b = d[i + 1], c = d[i + 2], v = d[i + 3];
      if (a === 0) G_FIELDS[c](s, v);
      else if (a === 1) C_FIELDS[c](s.champs[b], v);
      else if (a === 2) { if (c === 0) s.towers[b].hp = v; else s.towers[b].alive = !!v; }
      else if (a === 3) s.sites[b].alive = !!v;
    }
  }

  // Events, as short arrays. Position fields are rounded; everything else is passed as is.
  const EV_KEYS = { hit: ['u', 'a', 'sk', 'crit', 'by'], heal: ['u', 'a'], die: ['u', 'kind', 'x', 'y', 'by'], gold: ['u', 'a'], boom: ['x', 'y', 'r', 'fx'], phit: ['x', 'y', 'fx'], blink: ['x', 'y'], parry: ['u'], cast: ['u', 'fx', 'dx', 'dy'], level: ['u'], tower: ['team', 'sub'], bossup: [], boss: ['team'], feed: ['a', 'b', 'multi', 'first'], spawn: ['u'], tshot: ['u', 't', 'n'], cancelled: ['u'], stun: ['u'], mark: ['u'], forge: ['u', 'track'], atk: ['u', 't'], matk: ['u'], civ: ['team', 'x', 'y', 'id'], hope: ['team', 'on'] };
  const EV_NAMES = Object.keys(EV_KEYS), EV_IDX = {}; EV_NAMES.forEach((n, i) => { EV_IDX[n] = i; });
  const EV_ROUND = { x: 1, y: 1, dx: 100, dy: 100 };
  function packEvent(e) {
    const i = EV_IDX[e.e]; if (i === undefined) return e;
    const keys = EV_KEYS[e.e], out = [i];
    for (const k of keys) { let v = e[k]; if (v === undefined) v = null; else if (EV_ROUND[k]) v = Math.round(v * EV_ROUND[k]) / EV_ROUND[k]; else if (v === false) v = 0; else if (v === true) v = 1; out.push(v); }
    while (out.length > 1 && out[out.length - 1] === null) out.pop();
    return out;
  }
  function unpackEvent(a) {
    if (!Array.isArray(a)) return a;
    const name = EV_NAMES[a[0]], keys = EV_KEYS[name], e = { e: name };
    keys.forEach((k, j) => { const v = a[j + 1]; if (v !== undefined && v !== null) e[k] = v; });
    return e;
  }

  // One tick of the guest's own coin: the same walking as the host, then predicted basic attacks.
  function predict(s, c) {
    c.px = c.x; c.py = c.y;
    if (!c.alive) return;
    if (c.lock > 0) c.lock -= DT;
    if (c.atkCd > 0) c.atkCd -= DT;
    for (let i = 0; i < 3; i++) { if (c.cd[i] > 0) c.cd[i] -= DT; if (c.recast[i] > 0) c.recast[i] -= DT; }
    if (c.charge) c.charge.t += DT;
    if (c.pdash) {
      const D = c.pdash, st = Math.min(DT, D.t); c.x += D.vx * st; c.y += D.vy * st; D.t -= DT; if (D.t <= 0) c.pdash = null; pushOut(s.map, c);
    } else if (c.stunT <= 0 && c.lock <= 0 && !c.air && !c.chan && !c.dash) walk(s, c);
    towerPush(s, c);
    if (c.atk && c.stunT <= 0 && !c.air && !c.dash && !c.pdash && !c.chan && !c.charge && c.atkCd <= 0) {
      const t = autoTarget(s, c);
      if (t) { c.atkCd = 1 / c.as; c.lock = .13; const n = norm(t.x - c.x, t.y - c.y); c.fx = n.x; c.fy = n.y; }
    }
    c.vx = (c.x - c.px) / DT; c.vy = (c.y - c.py) / DT;
  }

  // ---------- step ----------
  function step(s) {
    if (s.over) return;
    s.t += DT; s.tick++;
    s.navLeft = 2;
    if (s.hope !== 50) setHope(s, s.hope + (50 - s.hope) * HOPE_DRIFT * DT); // public mood settles back toward even
    refreshLanes(s);
    if (s.tick % 15 === 0) teamThink(s, 0); else if (s.tick % 15 === 7) teamThink(s, 1);
    if (s.tick % 15 === 3) for (const c of s.champs) updateSolo(s, c);
    for (const c of s.champs) if (c.bot && c.alive) {
      const b = c.bot; b.next -= DT;
      if (b.next <= 0) { b.next = b.sk.think; botThink(s, c, b); }
      botSteer(s, c, b);
    }
    if (s.t >= s.nextWave) { spawnWave(s); s.nextWave += 26; }
    for (const camp of s.camps) if (!camp.alive && s.t >= camp.at) spawnCamp(s, camp);
    if (s.t >= s.bossAt && !s.monsters.some(m => m.boss && m.alive)) { spawnBoss(s); s.bossAt = s.t; }
    if (s.bossUp && !s.monsters.some(m => m.boss && m.alive)) s.bossUp = false;
    for (const c of s.champs) stepChamp(s, c);
    for (const m of s.minions) if (m.alive) stepMinion(s, m);
    for (let i = 0; i < s.minions.length; i++) { const a = s.minions[i]; if (!a.alive || a.delay > 0) continue; for (let j = i + 1; j < s.minions.length; j++) { const b = s.minions[j]; if (!b.alive || b.delay > 0 || a.team !== b.team) continue; const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy), mn = a.r + b.r; if (d < mn && d > .01) { const p = (mn - d) * .25 / d; a.x += dx * p; a.y += dy * p; b.x -= dx * p; b.y -= dy * p; } } }
    for (const m of s.monsters) if (m.alive) stepMonster(s, m);
    for (const t of s.towers) if (t.alive) stepTower(s, t);
    stepProj(s); stepZones(s); stepSites(s);
    s.minions = s.minions.filter(m => m.alive); s.monsters = s.monsters.filter(m => m.alive);
  }

  function masteryGain(st, won) {
    const acc = st.casts ? Math.min(1, st.skillHits / st.casts) : 0;
    return Math.round(st.skillHits * 6 * (.6 + acc) + st.parries * 25 + (st.kills + st.assists * .5) * 20 + (won ? 60 : 20));
  }
  function tierOf(p) { let t = 0; TIERS.forEach((x, i) => { if (p >= x.at) t = i; }); return t; }

  return { W, H, TICK, DT, KITS, buildMap, rayWall, visionSources, hasLOS, TIERS, TEAM_NAMES, FORGE_COST, createMatch, step, canSee, autoTarget, masteryGain, tierOf, towerOpen, xpNeed, ROLES, ROLE_INFO, autoRoles, CHARS, charOf,
    RANKS, rankOf, rankDelta, botSkills, skillProfile, setBot, snapshot, decodeSnapshot, applySnapshot, applyFrame, applyChampState, slowFlat, slowDiff, applySlow, packEvent, unpackEvent, predict };
})();
if (typeof module !== 'undefined') module.exports = Sim;
