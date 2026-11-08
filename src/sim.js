// Mintfall simulation. No DOM in this file, so it can run on a phone today
// and inside a Cloudflare Durable Object later without changes.
const Sim = (() => {
  const W = 3200, H = 1900, TICK = 30, DT = 1 / TICK;
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
  const DIFF = {
    easy: { react: .55, err: .28, dodge: .15, aggr: .8, gap: .9, lead: .55, think: .26, lh: .45, lhErr: .2, judge: .45, iq: .2, low: .22, see: 720 },
    normal: { react: .32, err: .13, dodge: .45, aggr: 1, gap: .5, lead: .85, think: .16, lh: .8, lhErr: .08, judge: .15, iq: .7, low: .3, see: 1000 },
    hard: { react: .16, err: .05, dodge: .8, aggr: 1.15, gap: .25, lead: 1, think: .1, lh: .98, lhErr: .02, judge: .03, iq: 1, low: .36, see: 1000 },
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

  const KITS = {
    vesper: {
      name: 'Vesper', role: 'Sniper', blurb: 'Charge your shot while they try to read it.',
      hp: 520, hpG: 72, dmg: 56, dmgG: 7, armor: 16, armG: 3, range: 520, as: 1.0, ms: 305, forge: ['edge', 'haste', 'guard'], pref: 480, fit: { top: 1, jungle: 0, bottom: 3, support: 0 },
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
            c.chan = { t: .85, total: .85, kind: 'line', slot: 2, dx: a.dx, dy: a.dy, len: 1050, w: 50, fn(s, c) {
              fire(s, c, a, { speed: 2600, range: 1050, w: 50, fx: 'deadeye', filter: 'champ', hit(s, c, t, p) { hurt(s, c, t, 260 * pow(c), { skill: 1 }); skillHit(c, p); p.left = 0; } });
            } };
          },
        },
      ],
    },
    kade: {
      name: 'Kade', role: 'Duelist', blurb: 'Time the parry and the fight is yours.',
      hp: 640, hpG: 95, dmg: 64, dmgG: 8, armor: 28, armG: 4, range: 165, as: .95, ms: 325, forge: ['edge', 'guard', 'haste'], pref: 125, melee: true, fit: { top: 3, jungle: 2, bottom: 0, support: 0 },
      kit: [
        { name: 'Lunge', d: 'Dash through a line. Hit a champion and you can dash again.', cd: 7, range: 290, shape: 'dash', w: 80, pd: [290, 1100], pdr: [260, 1100],
          cast(s, c, a) { const car = {}; dashDir(c, a.dx, a.dy, 290, 1100, { dmg: 62, onHit(s, c, t) { hurt(s, c, t, 62 * pow(c), { skill: 1 }); if (t.kind === 'champ') { skillHit(c, car); c.recast[0] = 2.5; } } }); s.ev.push({ e: 'cast', u: c.id, fx: 'dash' }); },
          recast(s, c, a) { dashDir(c, a.dx, a.dy, 260, 1100, { dmg: 62, onHit(s, c, t) { hurt(s, c, t, 62 * pow(c), { skill: 1 }); } }); s.ev.push({ e: 'cast', u: c.id, fx: 'dash' }); },
        },
        { name: 'Parry', d: 'Half a second of perfect block. Catch a hit to stun the attacker.', cd: 11, range: 0, shape: 'self', instant: true,
          cast(s, c) { c.parryT = .5; s.ev.push({ e: 'cast', u: c.id, fx: 'parry' }); },
        },
        { name: 'Crash', d: 'Leap, untouchable, and land with a stun at the centre.', cd: 45, range: 520, shape: 'circle', r: 190,
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
      hp: 500, hpG: 68, dmg: 50, dmgG: 5, armor: 14, armG: 3, range: 440, as: .85, ms: 300, forge: ['edge', 'haste', 'guard'], pref: 405, fit: { top: 1, jungle: 0, bottom: 2, support: 2 },
      kit: [
        { name: 'Sigil Orb', d: 'Marks the first enemy it hits.', cd: 4, range: 640, shape: 'line', w: 42,
          cast(s, c, a) { fire(s, c, a, { speed: 950, range: 640, w: 42, fx: 'orb', filter: 'units', hit(s, c, t, p) { hurt(s, c, t, 82 * pow(c), { skill: 1 }); t.markT = 4; s.ev.push({ e: 'mark', u: t.id }); if (t.kind === 'champ') skillHit(c, p); p.left = 0; } }); },
        },
        { name: 'Rupture', d: 'Ground blast. Breaks marks for double damage and a stun.', cd: 6.5, range: 540, shape: 'circle', r: 115,
          cast(s, c, a) { const car = {}; blast(s, c, a.tx, a.ty, 115, .55, (s, z) => { eachEnemy(s, c, z.x, z.y, 115, t => { const m = t.markT > 0; hurt(s, c, t, (m ? 165 : 75) * pow(c), { skill: 1 }); if (m) { t.markT = 0; if (t.kind === 'champ') stun(s, t, 1); s.ev.push({ e: 'boom', x: t.x, y: t.y, r: 60, fx: 'break' }); } if (t.kind === 'champ') skillHit(c, car); }); }, 'rupture'); },
        },
        { name: 'Cascade', d: 'Three blasts walk forward. Each one marks.', cd: 46, range: 640, shape: 'line', w: 200,
          cast(s, c, a) { [.42, .72, 1.02].forEach((dl, i) => { const k = 220 + i * 200, car = {}; blast(s, c, c.x + a.dx * k, c.y + a.dy * k, 135, dl, (s, z) => { eachEnemy(s, c, z.x, z.y, 135, t => { hurt(s, c, t, 115 * pow(c), { skill: 1 }); t.markT = 4; if (t.kind === 'champ') skillHit(c, car); }); }, 'rupture'); }); },
        },
      ],
    },
    solenne: {
      name: 'Solenne', role: 'Support', blurb: 'Every heal is a shot you can miss.',
      hp: 540, hpG: 76, dmg: 46, dmgG: 5, armor: 20, armG: 3.5, range: 400, as: .85, ms: 310, forge: ['haste', 'guard', 'edge'], pref: 370, support: true, fit: { top: 0, jungle: 0, bottom: 1, support: 3 },
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
      hp: 510, hpG: 74, dmg: 66, dmgG: 8, armor: 18, armG: 3, range: 135, as: 1.05, ms: 335, forge: ['edge', 'haste', 'guard'], pref: 100, melee: true, fit: { top: 2, jungle: 3, bottom: 0, support: 0 },
      kit: [
        { name: 'Rend', d: 'Short slash. Hits half again as hard from behind.', cd: 3.5, range: 240, shape: 'cone', w: 180,
          cast(s, c, a) { let hit = false; s.ev.push({ e: 'cast', u: c.id, fx: 'slash', dx: a.dx, dy: a.dy });
            eachEnemy(s, c, c.x, c.y, 240, t => { const n = norm(t.x - c.x, t.y - c.y); if (n.x * a.dx + n.y * a.dy < .72) return; const back = (t.fx || 0) * -n.x + (t.fy || 0) * -n.y < -.25; hurt(s, c, t, 92 * pow(c) * (back ? 1.5 : 1), { skill: 1, crit: back }); if (t.kind === 'champ') hit = true; });
            if (hit) c.stats.skillHits++; },
        },
        { name: 'Echo', d: 'Blink away and leave an echo. Cast again to snap back.', cd: 10, range: 320, shape: 'dash', w: 60,
          cast(s, c, a) { c.echo = { x: c.x, y: c.y }; const f = nearestFree(s.map, a.tx, a.ty); s.ev.push({ e: 'blink', x: c.x, y: c.y }); c.x = f.x; c.y = f.y; c.recast[1] = 3.5; s.ev.push({ e: 'blink', x: c.x, y: c.y }); },
          recast(s, c) { if (!c.echo) return; s.ev.push({ e: 'blink', x: c.x, y: c.y }); c.x = c.echo.x; c.y = c.echo.y; c.echo = null; s.ev.push({ e: 'blink', x: c.x, y: c.y }); },
        },
        { name: 'Reap', d: 'Blink behind a champion. Execute damage. A kill resets it.', cd: 40, range: 480, shape: 'circle', r: 90,
          cast(s, c, a) { const t = nearChamp(s, c, a.tx, a.ty, 220); if (!t || dist(c, t) > 540) return false; const n = { x: t.fx || 1, y: t.fy || 0 }; s.ev.push({ e: 'blink', x: c.x, y: c.y }); const f = nearestFree(s.map, t.x - n.x * 90, t.y - n.y * 90); c.x = f.x; c.y = f.y; c.fx = n.x; c.fy = n.y; c.reap = { id: t.id, t: 2 }; hurt(s, c, t, (125 * pow(c)) + (t.maxHp - t.hp) * .35, { skill: 1, crit: 1 }); c.stats.skillHits++; s.ev.push({ e: 'blink', x: c.x, y: c.y }); },
        },
      ],
    },
    gravel: {
      name: 'Gravel', role: 'Tank', blurb: 'One good hook moves the whole fight.',
      hp: 720, hpG: 112, dmg: 54, dmgG: 6, armor: 34, armG: 5, range: 190, as: .8, ms: 305, forge: ['guard', 'haste', 'edge'], pref: 150, melee: true, fit: { top: 2, jungle: 2, bottom: 0, support: 3 },
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
  function makeBot(s, c) {
    const i = c.slot;
    return {
      sk: DIFF[s.diff], mask: navMask(c.team), lane: c.role === 'top' ? 0 : 1, next: i * .05 + .02, foes: [], tid: 0, closest: 1e9, ratio: 1, noise: 0, noiseAt: 0, strafe: i % 2 ? 1 : -1,
      gx: c.x, gy: c.y, ga: 20, hasGoal: false, vx: 0, vy: 0, vecT: 0, ex: 0, ey: 0, evadeT: 0, path: null, pi: 0, pgx: 0, pgy: 0, needPath: false, sx: c.x, sy: c.y, stuck: 0, still: false, diveOk: false,
      et: null, etTanks: 0, castAt: 0, chargeHold: 1.12, threatT: 9, parry: false, low: false, fighting: false, lhSoon: false, lastHome: 0, gank: null, gankCd: 0, deaths: [], siegeT: 0,
    };
  }
  // Hands a seat to a bot or back to a person, mid-match. Used when a networked friend drops or returns.
  function setBot(s, c, on) {
    c.q.length = 0; c.mv.x = c.mv.y = 0; c.atk = false; c.atkPref = 0; c.preferTower = false;
    if (on) { if (!c.bot) c.bot = makeBot(s, c); c.human = false; }
    else { c.bot = undefined; c.human = true; }
  }

  function createMatch(cfg) {
    const s = {
      t: 0, tick: 0, nid: 1, rand: rng(cfg.seed || 7), map: buildMap(), champs: [], minions: [], towers: [], monsters: [], proj: [], zones: [], ev: [], over: null,
      diff: cfg.diff || 'normal', nextWave: 8, wave: 0, bossAt: 240, kills: [0, 0], buff: [0, 0], camps: [], gaps: {}, navLeft: 2, hope: 50, hopeTeam: -1, sites: [],
      laneInfo: [[{}, {}], [{}, {}]],
      ai: [0, 1].map(() => ({ defend: null, hoard: null, hoardGo: false, push: null, pushUntil: 0, thp: {}, sites: {}, help: {}, focus: 0 })),
    };
    const fountains = [{ x: 95, y: 950 }, { x: W - 95, y: 950 }]; s.fountains = fountains;
    const mir = (x, team) => team ? W - x : x;
    [0, 1].forEach(team => {
      const mk = (x, y, kind, lane, tier) => {
        const hp = kind === 'core' ? 3400 : tier === 0 ? 1600 : 2100;
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
    // Civilian sites: two per quadrant, nudged onto open ground if a position is walled.
    for (const [mx, my] of [[0, 0], [1, 0], [0, 1], [1, 1]]) for (const [x, y] of [[1000, 620], [1370, 850]]) {
      const f = nearestFree(s.map, mx ? W - x : x, my ? H - y : y);
      s.sites.push({ id: s.sites.length, x: f.x, y: f.y, alive: true, at: 0, prog: [0, 0], need: 2.5, con: {} });
    }
    rebuildNav(s);
    cfg.teams.forEach((list, team) => { const roles = teamRoles(list); list.forEach((p, i) => {
      const k = KITS[p.champ], role = roles[i];
      const c = {
        id: s.nid++, kind: 'champ', team, slot: i, role, solo: false, atkPref: 0, champ: p.champ, pname: p.name, tier: p.tier || 0, human: !!p.human, remote: !!p.remote,
        x: mir(135, team), y: 880 + i * 46, r: 34, lvl: 1, xp: 0, gold: 300, up: { edge: 0, guard: 0, haste: 0 },
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

  function canSee(s, team, u) {
    if (u.team === team || u.inBrush === undefined || u.inBrush < 0 || u.revealT > 0) return true;
    for (const c of s.champs) if (c.team === team && c.alive && c.inBrush === u.inBrush) return true;
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
    if (t.kind === 'tower') a *= s.t < 480 ? .7 + Math.max(0, s.t - 300) / 600 : 1 + (s.t - 480) / 170;
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
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  function autoTarget(s, c) {
    // Champion first when one is in range, then minions and monsters, then structures.
    const r = c.range;
    if (c.atkPref) {
      const p = [s.minions, s.monsters, s.champs, s.towers].map(l => l.find(u => u.id === c.atkPref)).find(Boolean);
      if (p && p.alive && !p.air && p.team !== c.team && dist(c, p) - p.r < r && (p.kind !== 'tower' || towerOpen(s, p)) && (p.kind !== 'champ' || canSee(s, c.team, p))) return p;
    }
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
    s.ev.push({ e: 'tshot', u: t.id, t: target.id });
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

  // ---------- bots: navigation ----------
  // The nav grid sits beside the collision grid. Each cell holds bits: walls, standing
  // towers, a fountain a team must not enter, and tower range (costly, not forbidden).
  const NAV_WALL = 1, NAV_TOWER = 2, NAV_NO0 = 4, NAV_NO1 = 8, NAV_T0 = 16, NAV_T1 = 32;
  const NAV_N = Math.ceil(W / 40) * Math.ceil(H / 40);
  const navG = new Float32Array(NAV_N), navFrom = new Int32Array(NAV_N), navSeen = new Uint32Array(NAV_N), navDone = new Uint32Array(NAV_N);
  const heapK = new Int32Array(NAV_N * 8), heapF = new Float32Array(NAV_N * 8);
  let navRun = 0;
  const navMask = team => NAV_WALL | NAV_TOWER | (team ? NAV_NO1 : NAV_NO0);

  function rebuildNav(s) {
    const m = s.map, c = m.cols, r = m.rows;
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
    const c = m.cols, r = m.rows, nav = m.nav, clr = m.clr, mask = navMask(team), danger = team ? NAV_T0 : NAV_T1;
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
    while (hs && !found && guard++ < NAV_N) {
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
    // Keep out of enemy tower range unless the wave is tanking or the dive is a safe kill.
    if (!b.diveOk) for (const t of s.towers) {
      if (!t.alive || t.team === c.team || (t === b.et && b.etTanks > 0)) continue;
      const dx = t.x - c.x, dy = t.y - c.y, d = Math.hypot(dx, dy); if (d > t.range + 36) continue;
      const nx = dx / d, ny = dy / d, inw = vx * nx + vy * ny;
      if (d < t.range - 6) { if (inw > -.4 && (vx || vy || b.hasGoal)) { vx = -nx; vy = -ny; onPath = false; } }
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
  const hash01 = (a, b) => { let h = Math.imul(a * 73856093 ^ b * 19349663, 0x9E3779B1); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
  const cast = (c, slot, tx, ty) => c.q.push({ t: 'cast', slot, tx, ty });
  const rdy = (c, i) => c.cd[i] <= 0 && (i < 2 || c.lvl >= 3);
  const frac = u => u.hp / u.maxHp;

  function lead(s, c, b, t, speed, delay = 0) {
    const tt = (speed ? dist(c, t) / speed : 0) + delay, f = b.sk.lead * (.75 + s.rand() * .25);
    const x = t.x + t.vx * tt * f, y = t.y + t.vy * tt * f;
    const a = Math.atan2(y - c.y, x - c.x) + (s.rand() - .5) * b.sk.err, l = Math.hypot(x - c.x, y - c.y);
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

  // Rough worth of a champion in a fight.
  function strength(u) {
    let p = (1 + u.lvl * .13 + (u.up.edge + u.up.guard + u.up.haste) * .1) * (.3 + frac(u) * .7);
    if (u.lvl >= 3 && u.cd[2] <= 0) p *= 1.2;
    if (u.stunT > 0) p *= .7;
    if (u.buffT > 0) p *= 1.15;
    return p;
  }
  // Damage of each ability, used to judge kills. Vesper's assumes a full charge.
  const BURST = { vesper: [190, 0, 260], kade: [124, 0, 185], ione: [82, 165, 345], solenne: [72, 0, 90], sable: [138, 0, 180], gravel: [64, 62, 165] };
  function burstOn(c, t) {
    let v = c.dmgBase * 2; const B = BURST[c.champ];
    for (let i = 0; i < 3; i++) if (rdy(c, i)) v += B[i] * pow(c);
    return v * 100 / (100 + t.armor);
  }
  // Who a support looks after: a person on the team when there is one, otherwise the bottom laner.
  const carryOf = (s, c) => s.champs.find(a => a.team === c.team && a !== c && !a.bot && a.alive && a.role !== 'support') || s.champs.find(a => a.team === c.team && a.role === 'bottom' && a.alive);
  const CARRY = { vesper: 1, ione: .9, sable: .7, kade: .4, solenne: .3, gravel: 0 };

  function nextBuy(c) {
    let best = null, bv = 1e9;
    KITS[c.champ].forge.forEach((track, i) => { const n = c.up[track]; if (n < 3 && n + i * .6 < bv) { bv = n + i * .6; best = track; } });
    return best ? { track: best, cost: FORGE_COST[c.up[best]] } : null;
  }

  // ---------- bots: team plan, shared by every bot on a side ----------
  function teamThink(s, team) {
    const ai = s.ai[team], mine = s.champs.filter(c => c.team === team && c.alive);
    const foes = s.champs.filter(e => e.team !== team && e.alive && canSee(s, team, e));
    const foesAlive = s.champs.filter(e => e.team !== team && e.alive).length;
    // Defend the tower that needs it most.
    let call = null, top = 2.4;
    for (const t of s.towers) {
      if (!t.alive || t.team !== team) continue;
      const lost = (ai.thp[t.id] === undefined ? t.hp : ai.thp[t.id]) - t.hp; ai.thp[t.id] = t.hp;
      let champs = 0, wave = 0;
      for (const e of foes) if (dist(e, t) < t.range + 180) champs++;
      for (const m of s.minions) if (m.alive && m.team !== team && dist(m, t) < t.range + 40) wave++;
      const v = (t.sub === 'core' ? 3 : 1 + t.tier * .5) * (champs * 2 + (lost > 0 ? 1.5 : 0)) + (wave >= 3 && !champs ? .5 : 0);
      if (v > top) { top = v; call = t; }
    }
    ai.defend = null;
    if (call) {
      const need = call.sub === 'core' ? 4 : 2, ids = mine.filter(c => c.bot && frac(c) > .4).sort((a, b) => dist(a, call) - dist(b, call)).slice(0, need).map(c => c.id);
      const n = norm(s.fountains[team].x - call.x, s.fountains[team].y - call.y);
      ai.defend = { id: call.id, x: call.x + n.x * 110, y: call.y + n.y * 110, ids };
    }
    // Group for the Colossus when the local odds are good.
    const boss = s.monsters.find(m => m.boss && m.alive);
    if (!boss) { ai.hoard = null; ai.hoardGo = false; }
    else {
      let minePow = 0, foePow = 0, close = 0;
      for (const c of mine) { minePow += strength(c); if (dist(c, boss) < 780) close++; }
      for (const e of foes) if (dist(e, boss) < 1150) foePow += strength(e);
      const enough = mine.length >= Math.min(3, s.champs.filter(c => c.team === team).length) || foesAlive <= 1;
      if (enough && foePow < minePow * .95 && !(call && call.sub === 'core')) {
        ai.hoard = { x: W / 2 + (team ? 520 : -520), y: H / 2 };
        if (close >= Math.min(3, mine.length)) ai.hoardGo = true;
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
    // Answer an ally who is being beaten on, people first. Nearby bots drop what they're doing.
    ai.help = {};
    const helpers = mine.filter(c => c.bot && !c.bot.low && frac(c) > .4 && !(ai.defend && ai.defend.ids.includes(c.id)));
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
    // Sites: answer an enemy capture first, then jungle and support roam to open ones.
    ai.sites = {};
    const open = s.sites.filter(z => z.alive && !towerOver(s, team, z.x, z.y, 0)), taken = new Set();
    const free = mine.filter(c => c.bot && !c.bot.low && frac(c) > .45 && !ai.help[c.id]);
    const count = (list, z) => { let n = 0; for (const u of list) if (dist(u, z) < 450) n++; return n; };
    for (const z of open) {
      if (z.prog[1 - team] < .3) continue;
      let best = null, bd = 1100;
      for (const c of free) if (!ai.sites[c.id] && dist(c, z) < bd) { bd = dist(c, z); best = c; }
      if (best) { ai.sites[best.id] = z; taken.add(z.id); }
    }
    for (const role of ['jungle', 'support', 'top', 'bottom']) for (const c of free) {
      if (c.role !== role || ai.sites[c.id]) continue;
      const laner = role === 'top' || role === 'bottom';
      if (laner && foes.some(e => dist(e, c) < 700)) continue;
      if (role === 'support') { const carry = carryOf(s, c); if (carry && foes.some(e => dist(e, carry) < 650)) continue; }
      let reach = role === 'jungle' ? 1500 : role === 'support' ? 750 : 420;
      if (ai.push !== null) reach = Math.min(reach, 600);
      let best = null, bd = reach;
      for (const z of open) if (!taken.has(z.id) && dist(c, z) < bd && count(foes, z) <= count(mine, z)) { bd = dist(c, z); best = z; }
      if (best) { ai.sites[c.id] = best; taken.add(best.id); }
    }
    // After about five minutes the side groups up and pushes one lane.
    if (s.t >= 360 && mine.length >= foesAlive - 1) {
      if (s.t >= ai.pushUntil || ai.push === null) {
        const left = [0, 1].map(l => s.towers.filter(t => t.alive && t.team !== team && t.lane === l).length);
        const adv = [0, 1].map(l => s.laneInfo[team][l].best);
        ai.push = left[0] !== left[1] ? (left[0] < left[1] ? 0 : 1) : (adv[0] >= adv[1] ? 0 : 1);
        ai.pushUntil = s.t + 35;
      }
    } else ai.push = null;
  }

  // ---------- bots: abilities, one short script per champion ----------
  function lineBlocked(s, c, b, x, y, w) {
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

  const COMBO = {
    vesper(s, c, b, t, d, mode) {
      if (!t) return false;
      if (rdy(c, 1) && (mode === 'retreat' || d < 260)) { const a = awayPoint(s, c, t, 270); cast(c, 1, a.x, a.y); return true; }
      if (mode === 'fight' && rdy(c, 2) && d < 1000 && (frac(t) < .5 || t.hp <= burstOn(c, t)) && (t.stunT > 0 || Math.hypot(t.vx, t.vy) < 200 || b.sk.iq < .5)) {
        const p = lead(s, c, b, t, 2600, .85); cast(c, 2, p.tx, p.ty); return true;
      }
      if (mode !== 'retreat' && rdy(c, 0) && d < 780 && !lineBlocked(s, c, b, t.x, t.y, 34)) {
        c.q.push({ t: 'charge', slot: 0 });
        // Full charge when nothing is close. Easy bots let go at odd moments.
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
      if (rdy(c, 2) && d > 200 && d < 520 && b.ratio >= .9) { const p = lead(s, c, b, t, 1100); cast(c, 2, p.tx, p.ty); return true; }
      if (rdy(c, 0) && d < 300) { cast(c, 0, t.x, t.y); return true; }
      return false;
    },
    ione(s, c, b, t, d, mode) {
      if (!t || mode === 'retreat') return false;
      if (mode === 'fight' && rdy(c, 2) && d < 620) { cast(c, 2, t.x, t.y); return true; }
      if (t.markT > 0 && rdy(c, 1) && d < 520) { const p = lead(s, c, b, t, 0, .55); cast(c, 1, p.tx, p.ty); return true; }
      if (rdy(c, 0) && d < 610 && !lineBlocked(s, c, b, t.x, t.y, 42)) { const p = lead(s, c, b, t, 950); cast(c, 0, p.tx, p.ty); return true; }
      // Without a mark coming, Rupture is only worth it on a stunned or careless target.
      if (rdy(c, 1) && d < 520 && (b.sk.iq < .5 ? s.rand() < .5 : c.cd[0] > 2.5 && mode === 'fight')) { const p = lead(s, c, b, t, 0, .55); cast(c, 1, p.tx, p.ty); return true; }
      return false;
    },
    solenne(s, c, b, t, d, mode) {
      if (rdy(c, 1)) { const a = threatenedAlly(s, c, b); if (a && (b.sk.iq > .4 || s.rand() < .3)) { cast(c, 1, a.x, a.y); return true; } }
      if (rdy(c, 2)) {
        let n = 0; for (const a of s.champs) if (a.alive && a.team === c.team && dist(a, c) < 320 && (frac(a) < .55 || a.stunT > 0)) n++;
        if (n >= 1 && b.closest < 700) { cast(c, 2, c.x, c.y); return true; }
      }
      if (rdy(c, 0)) {
        let ally = null, low = .82;
        for (const a of s.champs) if (a !== c && a.alive && a.team === c.team && dist(a, c) < 650 && frac(a) < low) { low = frac(a); ally = a; }
        if (ally) { const p = lead(s, c, b, ally, 1150); cast(c, 0, p.tx, p.ty); return true; }
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
      if (mode !== 'retreat' && rdy(c, 0) && d < 225) { cast(c, 0, t.x, t.y); return true; }
      return false;
    },
    gravel(s, c, b, t, d, mode) {
      if (!t) return false;
      if (rdy(c, 1) && d < 225) { cast(c, 1, c.x, c.y); return true; }
      if (mode === 'retreat') return false;
      if (rdy(c, 0) && d > 170 && d < 590 && !lineBlocked(s, c, b, t.x, t.y, 50) && (mode === 'fight' || b.ratio >= 1)) { const p = lead(s, c, b, t, 1050); cast(c, 0, p.tx, p.ty); return true; }
      if (mode === 'fight' && rdy(c, 2) && d < 580 && b.ratio >= .9) { const p = lead(s, c, b, t, 1000); cast(c, 2, p.tx, p.ty); return true; }
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
    if ((ct >= b.chargeHold || hurry) && reach >= d - 20) cast(c, 0, p.tx, p.ty);
    else if (ct >= 1.6) c.q.push({ t: 'cancel' });
  }

  // ---------- bots: senses ----------
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
    // Each shot gets one roll, so a low-skill bot misses it for good.
    if (id && b.evadeT <= 0 && hash01(id, c.id) < sk.dodge) { b.ex = ex; b.ey = ey; b.evadeT = .3; }
    b.parry = soon < .3 && (sk.iq > .4 || s.rand() < .25);
  }

  function pickTarget(s, c, b, ai) {
    const sk = b.sk, carry = c.role === 'support' ? carryOf(s, c) : null;
    let best = null, bv = -1e9;
    for (const e of b.foes) {
      const d = dist(c, e); if (d > sk.see) continue;
      const kill = e.hp <= burstOn(c, e);
      let v = 1.4 * (1 - d / 1000) + sk.iq * ((1 - frac(e)) * 1.1 + CARRY[e.champ] * .5 + (kill ? 1.2 : 0));
      if (e.id === b.tid) v += .35;
      if (e.id === ai.focus) v += .3 + sk.iq * .3;
      if (carry && sk.iq > .4 && dist(e, carry) < 380) v += .8;
      if (sk.iq > .4 && !kill) { const tw = towerOver(s, c.team, e.x, e.y); if (tw && alliesTanking(s, c.team, tw) < 2) v -= 1.2; }
      if (v > bv) { bv = v; best = e; }
    }
    return best;
  }

  function assess(s, c, b) {
    let mine = strength(c), theirs = 0;
    for (const a of s.champs) if (a !== c && a.alive && a.team === c.team && dist(a, c) < 850) mine += strength(a);
    for (const e of b.foes) if (dist(e, c) < 1000) theirs += strength(e);
    for (const t of s.towers) if (t.alive && dist(c, t) < t.range) { if (t.team === c.team) mine += .55; else theirs += t === b.et && b.etTanks ? .2 : .9; }
    return mine * b.sk.aggr * (1 + b.noise * b.sk.judge) / Math.max(theirs, .01);
  }

  function findLastHit(s, c, b) {
    const sk = b.sk, hit = c.dmgBase * (c.buffT > 0 ? 1.2 : 1) * 100 / 110, melee = KITS[c.champ].melee;
    let best = null, bh = 1e9; b.lhSoon = false;
    for (const m of s.minions) {
      if (!m.alive || m.team === c.team || m.delay > 0 || m.hp > hit * 2.6) continue;
      const d = dist(c, m) - m.r; if (d > c.range + 200) continue;
      b.lhSoon = true;
      const tt = melee ? 0 : Math.max(0, d) / 1100; let inc = 0;
      for (const p of s.proj) if (p.homing && p.target === m && dist(p, m) / p.speed <= tt + .05) inc += p.dmg * 100 / 110;
      const left = m.hp - inc;
      if (left <= 0 || left > hit * (1 + sk.lhErr * (hash01(m.id, c.id) * 2 - 1)) || hash01(m.id, c.id + 991) > sk.lh) continue;
      if (left < bh) { bh = left; best = m; }
    }
    return best;
  }

  // ---------- bots: jobs ----------
  function fightMove(s, c, b, t, d) {
    const k = KITS[c.champ];
    if (k.melee) {
      if (d > k.pref) moveTo(b, t.x + t.vx * .12, t.y + t.vy * .12, k.pref * .7);
      else if (b.sk.iq > .6) { const n = norm(t.x - c.x, t.y - c.y); moveDir(b, -n.y * b.strafe, n.x * b.strafe); }
      else noMove(b);
      return;
    }
    if (d > c.range + t.r - 15) moveTo(b, t.x, t.y, k.pref);
    else if (d < k.pref * .72) { const n = norm(c.x - t.x, c.y - t.y); moveDir(b, n.x, n.y); }
    else if (b.sk.iq > .4) { const n = norm(t.x - c.x, t.y - c.y); moveDir(b, -n.y * b.strafe, n.x * b.strafe); }
    else noMove(b);
  }

  function laneTask(s, c, b, lane, ai, pushing) {
    const k = KITS[c.champ], info = s.laneInfo[c.team][lane], front = info.front, foeFront = s.laneInfo[1 - c.team][lane].front, own = firstTower(s, c.team, lane);
    const home = s.fountains[c.team], wob = Math.sin(c.slot * 2.1);
    let x, y;
    if (front) {
      const p = front.path, wp = Math.min(front.wp, p.length - 1), prev = p[Math.max(0, wp - 1)], n = norm(prev[0] - front.x, prev[1] - front.y);
      const back = k.melee ? 60 : clamp(c.range * .5, 60, 240);
      x = front.x + n.x * back - n.y * wob * 46; y = front.y + n.y * back + n.x * wob * 46;
    } else { x = own.x + (c.team ? -130 : 130); y = own.y + (lane ? -40 : 40); }
    // The support stands just behind its carry when the carry is out on the map.
    const carry = c.role === 'support' ? [carryOf(s, c)].find(a => a && dist(a, home) > 800) || null : null;
    if (carry && dist(carry, c) < 1500) { const n = norm(home.x - carry.x, home.y - carry.y); x = carry.x + n.x * 130 - n.y * 60; y = carry.y + n.y * 130 + n.x * 60; }
    const lh = carry && dist(carry, c) < 800 ? null : findLastHit(s, c, b);
    let dest = { x, y, a: 26 };
    const t = b.et;
    if (t && b.etTanks > 0 && towerOpen(s, t)) b.siegeT = s.t + .8; // a wave stepping in and out of range must not flip the plan
    const siege = t && s.t < b.siegeT && towerOpen(s, t);
    if (lh && dist(c, lh) - lh.r <= c.range) { c.atk = true; c.atkPref = lh.id; }
    else if (lh && !carry) dest = { x: lh.x, y: lh.y, a: c.range + lh.r - 30 };
    else if (siege && dist(c, t) - t.r < c.range + 200) {
      if (dist(c, t) - t.r <= c.range - 4) { c.atk = true; c.atkPref = t.id; c.preferTower = true; }
      else dest = { x: t.x, y: t.y, a: c.range + t.r - 24 };
    } else if (pushing || b.closest > 900 || (foeFront && dist(foeFront, own) < own.range)) c.atk = true;
    else if (b.lhSoon) c.atk = false;
    else {
      const tgt = b.foes.find(e => e.id === b.tid);
      if (tgt && dist(c, tgt) - tgt.r < c.range && !towerOver(s, c.team, c.x, c.y)) {
        let near = 0; for (const m of s.minions) if (m.alive && m.team !== c.team && dist(m, c) < 380) near++;
        if (near <= 2) { c.atk = true; c.atkPref = tgt.id; }
      }
    }
    moveTo(b, dest.x, dest.y, dest.a);
  }

  function pickGank(s, c, b) {
    if (b.gank) {
      const e = b.foes.find(x => x.id === b.gank.id);
      if (e && s.t < b.gank.until && !towerOver(s, c.team, e.x, e.y)) return e;
      b.gank = null; b.gankCd = s.t + 8;
    }
    if (s.t < b.gankCd || frac(c) < .55 || c.lvl < 2) return null;
    let best = null, bv = .9;
    for (const e of b.foes) {
      if (dist(e, c) > 1500 || towerOver(s, c.team, e.x, e.y)) continue;
      const deep = c.team ? e.x > W * .52 : e.x < W * .48, hurt = frac(e);
      let v = (deep ? 1 : 0) + (hurt < .5 ? 1 : 0) + (hurt < .3 ? .5 : 0);
      if (hurt > .4 && !s.champs.some(a => a !== c && a.alive && a.team === c.team && dist(a, e) < 700)) v -= .8;
      v *= .5 + b.sk.iq * .5;
      if (v > bv) { bv = v; best = e; }
    }
    if (best) b.gank = { id: best.id, until: s.t + 14 };
    return best;
  }

  function jungleTask(s, c, b, ai) {
    const g = pickGank(s, c, b);
    if (g) { moveTo(b, g.x, g.y, 60); c.atk = true; return; }
    let best = null, bc = 1e9;
    for (const camp of s.camps) {
      const own = camp.side === c.team, wait = camp.alive ? 0 : Math.max(0, camp.at - s.t);
      if (wait > 25 || (!own && b.foes.some(e => dist(e, camp) < 900))) continue;
      const cost = Math.max(dist(c, camp) / c.msBase, wait) - (camp.big ? 3 : 0) + (own ? 0 : 6);
      if (cost < bc) { bc = cost; best = camp; }
    }
    if (!best) { laneTask(s, c, b, c.y < H / 2 ? 0 : 1, ai, false); return; }
    let m = null, md = 1e9;
    if (best.alive) for (const x of s.monsters) if (x.alive && x.camp === best.id) { const d = dist(c, x); if (d < md) { md = d; m = x; } }
    if (!m) { moveTo(b, best.x, best.y, 40); return; }
    moveTo(b, m.x, m.y, KITS[c.champ].pref * .85);
    if (md - m.r <= c.range) { c.atk = true; c.atkPref = m.id; }
    castPve(s, c, b, m, md);
  }

  function hoardTask(s, c, b, ai) {
    const boss = s.monsters.find(m => m.boss && m.alive); if (!boss) return false;
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
    const sk = b.sk, ai = s.ai[c.team], f = frac(c), home = s.fountains[c.team], homeD = dist(c, home);
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
    // Forge the moment it's affordable, wherever the bot stands: a player has the same button.
    const nb = nextBuy(c); if (nb && c.gold >= nb.cost) c.q.push({ t: 'forge', track: nb.track });
    if (c.chan && c.chan.recall) {
      if (b.closest >= 650) { b.still = true; noMove(b); return; }
      // moving is what cancels a recall, the same as for a player
    }
    b.ratio = t ? assess(s, c, b) : 2;
    // Just died, or keeps dying: come back carefully rather than feed the same fight.
    const recent = b.deaths.reduce((n, at) => n + (s.t - at < 120 ? 1 : 0), 0), fresh = c.spawnT !== undefined && s.t - c.spawnT < 16;
    if (recent >= 2 || fresh) b.ratio *= Math.max(.78, 1 - (recent - 1) * .08) * (fresh ? .94 : 1);
    if (b.deaths.length > 6) b.deaths.splice(0, b.deaths.length - 6);

    // Too hurt to stay: recall if it is quiet, walk home if it is not.
    if (f < sk.low || (f < sk.low + .15 && b.closest < 600 && b.ratio < .9)) b.low = true;
    if (b.low) {
      if (homeD < 300) { c.atk = true; noMove(b); return; }
      if (b.closest >= 700 && homeD > 1100) { if (!c.chan) c.q.push({ t: 'recall' }); b.still = true; noMove(b); return; }
      moveTo(b, home.x, home.y, 40); c.atk = true; if (t) useCombo(s, c, b, t, 'retreat');
      return;
    }
    const called = ai.defend && ai.defend.ids.includes(c.id);

    if (t) {
      const kill = t.hp <= burstOn(c, t), tw = towerOver(s, c.team, t.x, t.y);
      const safeKill = kill && c.hp > (110 + s.t * .12) * 2.5, tanks = tw ? alliesTanking(s, c.team, tw) : 0;
      const group = ai.push !== null || ai.hoard;
      let want = (kill && b.ratio > .7) || (b.ratio > 1.4 && (frac(t) < .7 || d < 620)) || (b.ratio > 1.15 && d < c.range + 70)
        || (b.fighting && b.ratio > .78 && d < 900) || (group && b.ratio > .95 && d < 850);
      if (tw && tanks < 2 && !safeKill) want = false;
      if (f < .45 && b.ratio < 1.2 && !kill) want = false;
      const pack = s.champs.reduce((n, e) => n + (e.team !== c.team && e.alive && !e.air && dist(e, c) < 800 && canSee(s, c.team, e) ? 1 : e.team === c.team && e.alive && dist(e, c) < 800 ? -1 : 0), 0), outnumbered = pack >= 2 && !kill;
      if (outnumbered) want = false;
      b.fighting = !!want;
      if (want) {
        b.diveOk = !tw || tanks >= 2 || safeKill;
        fightMove(s, c, b, t, d);
        c.atk = true; if (d - t.r <= c.range) c.atkPref = t.id;
        useCombo(s, c, b, t, 'fight');
        return;
      }
      // Losing the local fight: back off to the nearest tower and use what escapes there are.
      if ((b.ratio < .62 || outnumbered) && d < 720) {
        let safe = home, sd = homeD;
        for (const o of s.towers) if (o.alive && o.team === c.team) { const od = dist(c, o); if (od < sd && dist(o, t) > od * .7) { sd = od; safe = o; } }
        moveTo(b, safe.x, safe.y, 120); c.atk = true;
        useCombo(s, c, b, t, 'retreat');
        return;
      }
    } else b.fighting = false;

    // Team plan first, then the role's normal job.
    if (called) { moveTo(b, ai.defend.x, ai.defend.y, 60); c.atk = true; }
    else if (ai.help[c.id] && ai.help[c.id].alive) { const a = ai.help[c.id]; moveTo(b, a.x, a.y, 130); c.atk = true; }
    else if (ai.hoard && hoardTask(s, c, b, ai)) { /* handled */ }
    else if (ai.sites[c.id] && ai.sites[c.id].alive) { const z = ai.sites[c.id]; moveTo(b, z.x, z.y, 70); c.atk = true; }
    else if (ai.push !== null) laneTask(s, c, b, ai.push, ai, true);
    else if (c.role === 'jungle') jungleTask(s, c, b, ai);
    else laneTask(s, c, b, b.lane, ai, false);

    // Poke with whatever is free when standing somewhere safe.
    const safeSpot = !towerOver(s, c.team, c.x, c.y) && b.ratio >= .7 && f > .4;
    if (t ? safeSpot : c.champ === 'solenne') useCombo(s, c, b, t, 'poke');
  }

  // ---------- networking: compact state for host-authoritative play ----------
  // Fast state is binary and goes out unreliably about 20 times a second. Slow state is a
  // sparse delta of whole numbers on the reliable channel, so a lost packet can't desync it.
  const FX_CODE = ['snipe', 'snipeFull', 'deadeye', 'orb', 'ray', 'chain', 'bolt', 'mbolt', 'tower', 'rupture', 'crash', 'heal', 'stomp', 'dome', 'break', 'dash', 'parry', 'slash'];
  const FX_NUM = {}; FX_CODE.forEach((f, i) => { FX_NUM[f] = i; });
  const POS = 16, SNAP_MAGIC = 0xF3;
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
    sync(s.monsters, A.mon, B && B.mon, rx.m, a => ({ id: a.id, kind: 'monster', team: 2, alive: true, maxHp: 255, big: !!(a.fl & 1), boss: !!(a.fl & 2), r: a.fl & 2 ? 74 : a.fl & 1 ? 42 : 24, ms: a.fl & 2 ? 170 : 260, fx: 1, fy: 0 }),
      (u, a) => { u.hp = a.hp; u.stunT = a.fl & 4 ? 1 : 0; u.slowT = a.fl & 8 ? 1 : 0; u.markT = a.fl & 16 ? 1 : 0; });
    sync(s.minions, A.min, B && B.min, rx.n, a => ({ id: a.id, kind: 'minion', team: a.fl & 1, ranged: !!(a.fl & 2), lane: a.fl & 64 ? 1 : 0, alive: true, maxHp: 255, r: a.fl & 2 ? 18 : 22, ms: 215, range: a.fl & 2 ? 300 : 95, fx: a.fl & 1 ? -1 : 1, fy: 0 }),
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
  const EV_KEYS = { hit: ['u', 'a', 'sk', 'crit', 'by'], heal: ['u', 'a'], die: ['u', 'kind', 'x', 'y', 'by'], gold: ['u', 'a'], boom: ['x', 'y', 'r', 'fx'], phit: ['x', 'y', 'fx'], blink: ['x', 'y'], parry: ['u'], cast: ['u', 'fx', 'dx', 'dy'], level: ['u'], tower: ['team', 'sub'], bossup: [], boss: ['team'], feed: ['a', 'b', 'multi', 'first'], spawn: ['u'], tshot: ['u', 't'], cancelled: ['u'], stun: ['u'], mark: ['u'], forge: ['u', 'track'], atk: ['u', 't'], matk: ['u'], civ: ['team', 'x', 'y', 'id'], hope: ['team', 'on'] };
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

  return { W, H, TICK, DT, KITS, buildMap, TIERS, TEAM_NAMES, FORGE_COST, createMatch, step, canSee, autoTarget, masteryGain, tierOf, towerOpen, xpNeed, ROLES, ROLE_INFO, autoRoles, CHARS, charOf,
    DIFF, setBot, snapshot, decodeSnapshot, applySnapshot, applyFrame, applyChampState, slowFlat, slowDiff, applySlow, packEvent, unpackEvent, predict };
})();
if (typeof module !== 'undefined') module.exports = Sim;
