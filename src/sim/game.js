// Mintfall simulation. No DOM in this file, so it can run on a phone today
// and inside a Cloudflare Durable Object later without changes.
const Sim = (() => {
  const W = 4320, H = 2560, TICK = 30, DT = 1 / TICK;
  const TEAM_NAMES = ['Heroes', 'Villains'];
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
  const pow = c => (1 + .09 * (c.lvl - 1)) * (1 + c.st.dmg + c.st.ap) * (c.buffT > 0 ? 1.2 : 1);

  function fire(s, c, aim, o) {
    s.proj.push({
      id: s.nid++, x: c.x, y: c.y, px: c.x, py: c.y, vx: aim.dx * o.speed, vy: aim.dy * o.speed, left: rayWall(c.x, c.y, aim.dx, aim.dy, o.range), wall: rayWall(c.x, c.y, aim.dx, aim.dy, o.range) < o.range - 1, w: o.w,
      team: c.team, owner: c, fx: o.fx, pierce: o.pierce, hits: new Set(), filter: o.filter || 'units', hit: o.hit, skill: true, counted: false, age: 0,
    });
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

  /*CONTENT*/

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
      laneInfo: [[{}, {}], [{}, {}]], beacons: [], practice: !!cfg.practice, catchup: [0, 0], seed: cfg.seed || 7,
      ai: [0, 1].map(() => ({ defend: null, hoard: null, hoardGo: false, push: null, pushUntil: 0, thp: {}, sites: {}, help: {}, focus: 0 })),
    };
    s.fountains = s.map.fountains;
    const mir = (x, team) => team ? W - x : x;
    [0, 1].forEach(team => {
      const mk = (x, y, kind, lane, tier) => {
        const hp = kind === 'core' ? 3000 : tier === 0 ? 1450 : 1850;
        s.towers.push({ id: s.nid++, kind: 'tower', sub: kind, team, x: mir(x, team), y, px: mir(x, team), py: y, r: kind === 'core' ? 54 : 36, hp, maxHp: hp, armor: 30, range: kind === 'core' ? CORE_RANGE : TOWER_RANGE, sight: 750, alive: true, cd: 0, lane, tier, stack: 0, last: null, vx: 0, vy: 0 });
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
    s.practiceSide = Math.max(0, cfg.teams.findIndex(l => l.some(p => p.human)));
    cfg.teams.forEach((list, team) => {
      const fixed = list.map(p => Object.assign({}, p, { champ: sideKit(team, p.champ) })), roles = teamRoles(fixed);
      fixed.forEach((p, i) => {
      const champ = p.champ, k = KITS[champ], role = roles[i];
      const build = k.builds.some(b => b.id === p.build) ? p.build : defaultBuild(champ, role, hash01((cfg.seed || 7) + team * 13, i + 101));
      const c = {
        id: s.nid++, kind: 'champ', team, slot: i, role, solo: false, atkPref: 0, champ, pname: p.name, tier: p.tier || 0, human: !!p.human, remote: !!p.remote, skill: p.skill, build, buildDef: k.builds.find(b => b.id === build),
        finish: p.finish, trail: p.trail, recall: p.recall,
        x: mir(180, team), y: H / 2 + (i - 1.5) * 46, r: 26, sight: k.sight, lvl: 1, xp: 0, gold: 300, up: { edge: 0, guard: 0, haste: 0 },
        hp: k.hp, maxHp: k.hp, armor: k.armor, dmgBase: k.dmg, range: k.range, msBase: k.ms, as: k.as, kit: k.kit, f: { [build]: 1 }, evolved: [-1, -1], items: [null, null, null], atkMode: 'champ', beacons: 2, beaconT: 0, st: blankStats(),
        alive: true, respawn: 0, atkCd: 0, lock: 0, fx: team ? -1 : 1, fy: 0, cd: [0, 0, 0], recast: [0, 0, 0], q: [], mv: { x: 0, y: 0 }, atk: false,
        stunT: 0, slowT: 0, slowA: 0, markT: 0, parryT: 0, drT: 0, air: 0, buffT: 0, empowerT: 0, revealT: 0, rootT: 0, polyT: 0, knockT: 0, knockMax: 0, stealthT: 0, noHealT: 0, hasteT: 0, hasteA: 0, shieldHp: 0, shieldT: 0, vulnT: 0, dmarkT: 0, opener: 0, ripT: 0, curseN: 0, curseT: 0, poisonT: 0, poisonDps: 0, bleedT: 0, bleedDps: 0, pstack: 0, pready: 0, rage: 0, streak: 0,
        vx: 0, vy: 0, assist: {}, charge: null, chan: null, dash: null, leap: null, cuts: null, duelZ: null, inBrush: -1, recentHit: 0,
        stats: { casts: 0, skillHits: 0, parries: 0, kills: 0, deaths: 0, assists: 0, dmg: 0 },
      };
      applyMods(c); applyStats(c, false); c.hp = c.maxHp;
      c.px = c.x; c.py = c.y;
      if (s.practice && !p.human) { c.dummy = true; const side = team === s.practiceSide ? -1 : 1; placeDummy(s, c, side); }
      else if (!p.human) c.bot = makeBot(s, c);
      s.champs.push(c);
    }); });
    if (s.practice) for (const c of s.champs) if (c.human) c.gold = 20000;
    return s;
  }

  // A seat always plays its own side's kit. An id from the other roster maps to the same position.
  const sideKit = (team, id) => ROSTER[team].includes(id) ? id : ROSTER[team][Math.max(0, ROSTER[1 - team].indexOf(id))] || ROSTER[team][0];
  // Build and evolve data applied onto a per-champion copy of the kit, so a guest can rebuild it from slow state alone.
  function applyMods(c) {
    const k = KITS[c.champ], mods = []; if (c.buildDef && c.buildDef.mods) mods.push(c.buildDef.mods);
    (c.evolved || []).forEach((ch, tier) => { if (ch >= 0) { const e = k.evolves[tier][ch]; c.f[e.id] = 1; if (e.mods) mods.push(e.mods); } });
    c.kit = k.kit.map((base, i) => {
      const a = Object.assign({}, base);
      for (const m of mods) if (m[i]) for (const key in m[i]) { const v = m[i][key]; if (key.endsWith('_add')) { const n = key.slice(0, -4); a[n] = (a[n] || 0) + v; } else if (key.endsWith('_mul')) { const n = key.slice(0, -4); a[n] = (a[n] || 0) * v; } else a[key] = v; }
      if (a.pd && a.range !== base.range) a.pd = [a.range, a.pd[1]];
      if (a.cd !== undefined) a.cd = Math.max(1, Math.round(a.cd * 100) / 100);
      return a;
    });
  }
  // Practice: dummies stand still along the middle road. side: -1 near the human's base, +1 further out.
  function placeDummy(s, c, side) { const off = 760 + c.slot * 90 + (side > 0 ? 500 : 0); c.hx = s.practiceSide ? W - off : off; c.hy = H / 2 + (c.slot - 1.5) * 150; c.x = c.px = c.hx; c.y = c.py = c.hy; }
  const blankStats = () => ({ dmg: 0, ad: 0, ap: 0, hp: 0, armor: 0, as: 0, ms: 0, cdr: 0, lifesteal: 0, healPow: 0, regen: 0, u: {} });
  function itemStats(c) { const st = blankStats(); for (const id of c.items) { if (!id) continue; const it = ITEM_BY[id]; for (const k in st) if (k !== 'u' && it[k]) st[k] += it[k]; if (it.u) st.u[it.u] = 1; } st.cdr = Math.min(.45, st.cdr); return st; }
  const cdOf = (c, i) => { const a = c.kit[i]; return a.noCdr ? a.cd : a.cd * (1 - c.st.cdr); };

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
    for (const b of s.beacons) if (b.team === team && b.alive) out.push({ x: b.x, y: b.y, r: b.sight });
    return cache.list[team] = out;
  }
  function canSee(s, team, u) {
    if (u.team === team || u.kind === 'tower' || u.revealT > 0) return true;
    if (u.stealthT > 0) return false;
    if (u.inBrush !== undefined && u.inBrush >= 0 && !s.champs.some(c => c.team === team && c.alive && c.inBrush === u.inBrush) && !s.beacons.some(b => b.alive && b.team === team && b.inBrush === u.inBrush)) return false;
    for (const v of visionSources(s, team)) if ((v.x - u.x) * (v.x - u.x) + (v.y - u.y) * (v.y - u.y) < v.r * v.r) return true;
    return false;
  }

  function heal(s, src, t, amt) { if (t.noHealT > 0) return; amt *= (1 + .15 * roleK(src, 'support')) * (1 + (src.st ? src.st.healPow : 0)); const a = Math.min(amt, t.maxHp - t.hp); t.hp += a; if (a > 1) s.ev.push({ e: 'heal', u: t.id, a: Math.round(amt) }); }

  function hurt(s, src, t, amt, o = {}) {
    if (!t.alive || t.air) return 0;
    if (t.kind === 'beacon') { if (!o.basic) return 0; t.hp--; s.ev.push({ e: 'bhit', x: t.x, y: t.y, team: t.team }); if (t.hp <= 0) { t.alive = false; if (src && src.kind === 'champ') earn(s, src, 25); } return 1; }
    if (t.kind === 'tower' && !towerOpen(s, t)) return 0;
    if (t.parryT > 0) {
      t.parryT = 0; t.stats.parries++; t.cd[1] = Math.min(t.cd[1], 2); t.ripT = 3.5;
      s.ev.push({ e: 'parry', u: t.id }); if (src && src.kind !== 'tower' && src.alive && !src.boss) stun(s, src, t.parryStun || .9);
      if (t.f.vanguard) for (const a of alliesIn(s, t.team, t.x, t.y, 300)) if (a !== t) shield(s, a, 100 * hpow(t), 3);
      return 0;
    }
    let a = amt * 100 / (100 + (t.armor || 0));
    const champSrc = src && src.kind === 'champ';
    if (champSrc) {
      if (src.opener > 0 && t.kind === 'champ' && !o.dot) { a *= 1.6; o.crit = 1; src.opener = 0; }
      if (src.st.u.headsman && t.hp < t.maxHp * .35) a *= 1.15;
      if (t.dmarkT > 0 && t.markedBy === src.id) a *= 1.15;
      if (src.duelZ && src.duelZ.b === t) a *= src.duelZ.boost;
      if (t.vulnT > 0) a *= 1.25;
      if (src.team === s.hopeTeam) a *= 1.08;
    }
    if (t.drT > 0) a *= .7;
    for (const z of s.zones) if (z.kind === 'dome' && z.team === t.team && Math.hypot(z.x - t.x, z.y - t.y) < z.r) { a *= 1 - .25 * (1 + .15 * roleK(z.owner, 'support')); break; }
    if (t.kind === 'champ') for (const al of s.champs) if (al.team === t.team && al.alive && al.st.u.sanctum && al !== t && dist(al, t) < 350) { a *= .92; break; }
    // Structures weaken late so a match always reaches an ending.
    if (t.kind === 'tower') a *= structureK(s);
    if (s.practice && t.kind === 'tower') { s.ev.push({ e: 'hit', u: t.id, a: Math.round(a), sk: o.skill ? 1 : 0, crit: 0, by: src ? src.id : 0 }); return a; }
    if (t.kind === 'monster' && champSrc) { t.hitAt = s.t; if (!t.tgt) t.tgt = src; a *= 1 + .35 * roleK(src, 'jungle'); }
    if (t.shieldHp > 0) { const ab = Math.min(t.shieldHp, a); t.shieldHp -= ab; a -= ab; }
    t.hp -= a;
    if (t.chan && t.chan.recall) t.chan = null;
    if (t.kind === 'champ') {
      for (const z of s.sites) if (z.con[t.id]) z.con[t.id] = 0;
      if (t.stealthT > 0) t.revealT = Math.max(t.revealT, .4);
      const K = KITS[t.champ]; if (K.onDamaged) K.onDamaged(s, t, a);
      if (t.st.u.bastion && t.hp < t.maxHp * .5 && t.hp > 0 && !(t.bastAt > s.t)) { t.bastAt = s.t + 30; shield(s, t, t.maxHp * .22, 4); }
      if (o.basic && src && src.kind === 'champ' && KITS[src.champ].melee && t.st.u.thorns) hurt(s, t, src, a * .25 * (100 + src.armor) / 100, { dot: 1 });
    }
    if (champSrc) {
      src.stats.dmg += a;
      if (!o.dot) { src.revealT = 1.2; if (t.kind === 'champ') { t.assist[src.id] = s.t; src.recentHit = s.t; } }
      if (src.st.lifesteal && !o.dot && (t.kind === 'champ' || t.kind === 'monster' || t.kind === 'minion')) heal(s, src, src, a * src.st.lifesteal * (t.kind === 'champ' ? 1 : .4));
      if (o.basic && src.st.u.bleed && t.kind === 'champ' && t.alive) bleed(s, src, t, 10 * pow(src), 2);
      if (t.kind === 'champ' && t.curseN > 0 && t.curseT > 0 && !o.dot && t.curseBy && t.curseBy.team === src.team && t.curseBy.f.jinx) heal(s, t.curseBy, src, a * .08);
    }
    s.ev.push({ e: 'hit', u: t.id, a: Math.round(a), sk: o.skill ? 1 : 0, crit: o.crit ? 1 : 0, by: src ? src.id : 0 });
    if (t.hp <= 0) kill(s, src, t);
    return a;
  }

  function giveXp(s, c, xp) {
    if (c.lvl >= 10) return; if (c.solo) xp *= 1 + .2 * roleK(c, 'top'); xp *= 1 + .12 * (s.catchup ? s.catchup[c.team] : 0); c.xp += xp;
    while (c.lvl < 10 && c.xp >= xpNeed(c.lvl)) { c.xp -= xpNeed(c.lvl); c.lvl++; applyStats(c, true); s.ev.push({ e: 'level', u: c.id }); }
  }
  const xpNeed = l => 180 + 110 * (l - 1);
  function applyStats(c, keepFrac) {
    const k = KITS[c.champ], f = c.hp / c.maxHp, st = itemStats(c), b = (c.buildDef && c.buildDef.stats) || {};
    c.st = st;
    c.maxHp = (k.hp + k.hpG * (c.lvl - 1) + st.hp) * (b.hp || 1) * (c.solo ? 1 + .08 * roleK(c, 'top') : 1);
    c.armor = k.armor + k.armG * (c.lvl - 1) + st.armor + (b.armor || 0);
    c.dmgBase = (k.dmg + k.dmgG * (c.lvl - 1)) * (1 + st.dmg + st.ad) * (b.dmg || 1);
    c.msBase = k.ms + st.ms + (b.ms || 0);
    c.as = k.as * (1 + st.as) * (b.as || 1);
    c.range = Math.min(k.range + (b.range || 0), MAX_ATTACK_RANGE);
    if (keepFrac) c.hp = Math.max(1, c.maxHp * f);
  }
  // Catch-up pay for the side that has fallen behind.
  const earn = (s, c, g) => { c.gold += g * (1 + .22 * (s.catchup ? s.catchup[c.team] : 0)); };
  const teamNear = (s, team, x, y, r) => s.champs.filter(c => c.team === team && c.alive && Math.hypot(c.x - x, c.y - y) < r);

  function kill(s, src, t) {
    t.alive = false; t.hp = 0;
    if (t.curseN > 0 && t.curseT > 0) spreadCurses(s, t);
    if (t.cuts) { t.cuts = null; t.air = 0; }
    s.ev.push({ e: 'die', u: t.id, kind: t.kind, x: t.x, y: t.y, by: src ? src.id : 0 });
    if (src && src.reap && src.reap.id === t.id && src.reap.t > 0) { src.cd[2] = 0; src.reap = null; }
    if (src && src.kind === 'champ' && t.bleedT > 0 && src.f.cutthroat) src.cd[0] = 0;
    if (t.kind === 'champ' && src && src.kind === 'champ') for (const c of s.champs) if (c.team === src.team && c.f.reaper && (c === src || (t.assist[c.id] !== undefined && s.t - t.assist[c.id] < 9))) c.cd[2] = Math.min(c.cd[2], 1);
    const et = 1 - t.team;
    if (t.kind === 'champ') {
      t.deaths = (t.deaths || 0) + 1; t.stats.deaths++; if (t.bot) t.bot.deaths.push(s.t); t.respawn = 5 + t.lvl * 1.6 + s.t / 120 + Math.max(0, s.t - 780) / 22; t.chan = t.dash = t.charge = t.leap = null; t.air = 0; t.stealthT = 0; t.duelZ = null; t.shieldHp = 0;
      const streak = t.streak || 0, bounty = streak >= 2 ? Math.min(330, 70 * (streak - 1)) : 0; t.streak = 0;
      if (s.practice) t.respawn = .6;
      s.kills[et]++;
      let multi = 1;
      if (src && src.kind === 'champ') { multi = s.t - (src.lastKill || -99) < 10 ? (src.multi || 1) + 1 : 1; src.multi = multi; src.lastKill = s.t; }
      const first = !s.firstBlood; s.firstBlood = true;
      if (src && src.kind === 'champ') { src.streak = (src.streak || 0) + 1; earn(s, src, 260 + bounty); src.stats.kills++; giveXp(s, src, 120 + 16 * t.lvl); s.ev.push({ e: 'gold', u: src.id, a: 260 + bounty }); }
      for (const id in t.assist) if (s.t - t.assist[id] < 9 && (!src || +id !== src.id)) { const a = s.champs.find(c => c.id === +id); if (a) { earn(s, a, 130); a.stats.assists++; giveXp(s, a, 70); } }
      supportShare(s, src, t.x, t.y, 130, 70);
      t.assist = {};
      s.ev.push({ e: 'feed', a: src ? src.id : 0, b: t.id, multi, first, bounty });
    } else if (t.kind === 'minion') {
      const near = teamNear(s, et, t.x, t.y, 850);
      near.forEach(c => { giveXp(s, c, 42 / Math.max(1, near.length * .7)); if (c !== src) earn(s, c, 7); });
      if (src && src.kind === 'champ') { const g = Math.round(22 * (1 + .25 * roleK(src, 'bottom'))); earn(s, src, g); s.ev.push({ e: 'gold', u: src.id, a: g }); supportShare(s, src, t.x, t.y, 22, 28); }
    } else if (t.kind === 'monster') {
      if (t.boss) {
        s.buff[src ? src.team : 0] = 1; const team = src ? src.team : 0;
        s.champs.filter(c => c.team === team).forEach(c => { c.buffT = 90; c.gold += 120; giveXp(s, c, 160); });
        s.bossAt = s.t + 210; s.ev.push({ e: 'boss', team });
      } else {
        const near = teamNear(s, src ? src.team : 0, t.x, t.y, 700);
        near.forEach(c => { giveXp(s, c, (t.big ? 130 : 44)); earn(s, c, (t.big ? 95 : 32) * (1 + .3 * roleK(c, 'jungle'))); });
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
    const scale = 1 + s.wave * .035 + Math.max(0, s.t - 780) / 140;
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
    // champ: champions first, then minions and monsters, then structures. minion: lowest-health minion or monster. tower: structures only.
    const r = c.range, mode = c.atkMode || 'champ';
    if (c.atkPref) {
      const p = [s.minions, s.monsters, s.champs, s.towers, s.beacons].map(l => l.find(u => u.id === c.atkPref)).find(Boolean);
      if (p && p.alive && !p.air && p.team !== c.team && dist(c, p) - p.r < r && (p.kind !== 'tower' || towerOpen(s, p)) && (p.kind !== 'champ' || canSee(s, c.team, p)) && hasLOS(c.x, c.y, p.x, p.y)) return p;
    }
    const structure = () => { let b = null, bd = r; for (const t of s.towers) if (t.alive && t.team !== c.team && towerOpen(s, t)) { const d = dist(c, t) - t.r; if (d < bd && hasLOS(c.x, c.y, t.x, t.y)) { bd = d; b = t; } } return b; };
    if (mode === 'tower') return structure();
    if (mode === 'minion') {
      let b = null, bh = 1e9;
      for (const m of [...s.minions, ...s.monsters]) { if (!m.alive || m.air || m.team === c.team || m.delay > 0 || dist(c, m) - m.r >= r || !hasLOS(c.x, c.y, m.x, m.y)) continue; const v = m.hp * 100 / (100 + (m.armor || 0)); if (v < bh) { bh = v; b = m; } }
      return b;
    }
    const champ = nearestFoe(s, c, r, { champsOnly: true, los: true }); if (champ) return champ;
    if (c.preferTower) { const t = structure(); if (t) return t; }
    const unit = nearestFoe(s, c, r, { noChamps: true, los: true }); if (unit) return unit;
    let b = null, bd = r; for (const x of s.beacons) if (x.alive && x.team !== c.team && canSee(s, c.team, x)) { const d = dist(c, x) - x.r; if (d < bd && hasLOS(c.x, c.y, x.x, x.y)) { bd = d; b = x; } }
    return b || structure();
  }

  function tryCast(s, c, q) {
    const a = c.kit[q.slot]; if (!a || c.stunT > 0 || c.air || c.chan) return;
    if (c.dash && !c.dash.forced && !a.recast) return;
    if (c.dash && c.dash.forced) return;
    if (q.slot === 2 && c.lvl < 3) return;
    if (c.rootT > 0 && a.pd) return;
    const n = norm(q.tx - c.x, q.ty - c.y);
    const hasDir = n.l > 1;
    const dx = hasDir ? n.x : c.fx, dy = hasDir ? n.y : c.fy;
    const r = a.range || 0; const d = Math.min(n.l, r || 0);
    const aim = { dx, dy, tx: r ? c.x + dx * d : c.x, ty: r ? c.y + dy * d : c.y, d };
    if (a.shape === 'dash' || a.shape === 'line') { aim.tx = c.x + dx * r; aim.ty = c.y + dy * r; }
    // Ground-targeted circles need line of sight and land at the last visible point.
    if (a.shape === 'circle' && !a.over && aim.d > 0) { aim.d = rayWall(c.x, c.y, dx, dy, aim.d); aim.tx = c.x + dx * aim.d; aim.ty = c.y + dy * aim.d; }
    // Press time feedback: the cast event always fires on the press, before any wind-up or travel.
    const says = extra => { s.ev.push(Object.assign({ e: 'cast', u: c.id, fx: a.fx, dx, dy, slot: q.slot }, extra)); };
    if (c.recast[q.slot] > 0 && a.recast) { c.recast[q.slot] = 0; a.recast(s, c, aim, a); if (!a.keepStealth) breakStealth(s, c); c.fx = dx; c.fy = dy; says(); return; }
    // A remote player's press can land a hair before the host's cooldown ends. Hold it for that moment rather than drop it.
    if (c.cd[q.slot] > 0) { if (c.cd[q.slot] < .18 && c.remote && !c.bot) c.qHold = { q, until: s.t + .3 }; return; }
    if (a.cast(s, c, aim, a) === false) return;
    if (!a.keepStealth) breakStealth(s, c);
    c.cd[q.slot] = Math.max(c.cd[q.slot], cdOf(c, q.slot));
    c.stats.casts++; c.fx = dx; c.fy = dy; c.spin = 1;
    if (c.chan && c.chan.recall) c.chan = null;
    if (c.st.u.phase) haste(c, .15, 1.5);
    says();
  }

  // One tick of walking from c.mv. Shared with the guest's local prediction, so both agree.
  function walk(s, c) {
    const m = Math.min(1, Math.hypot(c.mv.x, c.mv.y));
    if (m > .05) {
      const n = norm(c.mv.x, c.mv.y); let sp = c.msBase * (c.slowT > 0 ? 1 - c.slowA : 1) * (c.hasteT > 0 ? 1 + c.hasteA : 1);
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
      // A dead champion can still shop, evolve, ping and practise.
      while (c.q.length) { const q = c.q.shift(); runShared(s, c, q); }
      c.respawn -= DT;
      if (c.respawn <= 0) {
        c.alive = true; c.hp = c.maxHp; c.spawnT = s.t; const f = s.fountains[c.team]; c.x = c.px = f.x + (c.team ? -50 : 50); c.y = c.py = f.y + (c.slot - 1.5) * 40; c.q.length = 0; c.stunT = c.slowT = c.markT = c.rootT = c.polyT = c.curseT = c.curseN = c.poisonT = c.bleedT = 0;
        if (c.dummy) { c.x = c.px = c.hx; c.y = c.py = c.hy; }
        s.ev.push({ e: 'spawn', u: c.id });
      }
      return;
    }
    for (const k of STATUS_T) if (c[k] > 0) c[k] -= DT;
    if (c.shieldT <= 0) c.shieldHp = 0;
    if (c.curseT <= 0) c.curseN = 0;
    for (let i = 0; i < 3; i++) { if (c.cd[i] > 0) c.cd[i] -= DT; if (c.recast[i] > 0) c.recast[i] -= DT; }
    if (c.atkCd > 0) c.atkCd -= DT;
    if (c.reap) { c.reap.t -= DT; if (c.reap.t <= 0) c.reap = null; }
    if (c.charge) { c.charge.t += DT * (c.stunT > 0 ? 0 : 1); if (c.charge.t > 4 || c.stunT > 0) c.charge = null; }
    if (c.beacons < 2) { c.beaconT -= DT; if (c.beaconT <= 0) { c.beacons++; c.beaconT = c.beacons < 2 ? BEACON_CD : 0; } }
    const K = KITS[c.champ]; if (K.tick) K.tick(s, c);
    if (c.qHold) { const h = c.qHold; if (s.t > h.until) c.qHold = null; else if (c.cd[h.q.slot] <= 0) { c.qHold = null; tryCast(s, c, h.q); } }

    while (c.q.length) {
      const q = c.q.shift();
      if (q.t === 'cast') tryCast(s, c, q);
      else if (q.t === 'charge') { if (c.cd[q.slot] <= 0 && c.stunT <= 0 && !c.chan && !c.air) { c.charge = { slot: q.slot, t: 0, dx: c.fx, dy: c.fy }; s.ev.push({ e: 'cast', u: c.id, fx: c.kit[q.slot].fx, slot: q.slot, charge: 1 }); } }
      else if (q.t === 'aim') { if (c.charge) { const n = norm(q.tx - c.x, q.ty - c.y); c.charge.dx = n.x; c.charge.dy = n.y; c.fx = n.x; c.fy = n.y; } }
      else if (q.t === 'cancel') { c.charge = null; if (c.chan && c.chan.slot !== undefined) { c.cd[c.chan.slot] = 0; c.chan = null; c.stats.casts--; s.ev.push({ e: 'cancelled', u: c.id }); } }
      else if (q.t === 'recall') { if (!c.chan && c.stunT <= 0) c.chan = { t: 4, total: 4, recall: true, fn(s, c) { const f = s.fountains[c.team]; s.ev.push({ e: 'blink', x: c.x, y: c.y }); c.x = f.x + (c.team ? -60 : 60); c.y = f.y; s.ev.push({ e: 'blink', x: c.x, y: c.y }); } }; }
      else runShared(s, c, q);
    }

    // knock-up arc for the renderer
    if (c.knockT > 0) { const f = c.knockT / (c.knockMax || .6); c.z = Math.sin(f * Math.PI) * 74; } else if (c.knockMax) { c.z = 0; c.knockMax = 0; }
    // Thousand Cuts: blinking from strike to strike, untouchable.
    if (c.cuts) {
      const C = c.cuts; c.air = 1; C.next -= DT;
      if (C.next <= 0) {
        const t = s.champs.find(e => e.id === C.id);
        if (!t || !t.alive || C.n <= 0) { c.cuts = null; c.air = 0; pushOut(s.map, c); }
        else {
          const an = s.rand() * 6.28, f = nearestFree(s.map, t.x + Math.cos(an) * 70, t.y + Math.sin(an) * 70);
          s.ev.push({ e: 'blink', x: c.x, y: c.y }); c.x = f.x; c.y = f.y; C.n--; C.next = .15;
          const last = C.n === 0; let d = C.A.dmg * pow(c); if (last && c.f.finishing) d += (t.maxHp - t.hp) * .15;
          const nf = norm(t.x - c.x, t.y - c.y); c.fx = nf.x; c.fy = nf.y;
          const air = c.air; c.air = 0; hurt(s, c, t, d, { skill: 1, crit: last ? 1 : 0 }); if (c.f.butcher) for (const o of enemiesIn(s, c, t.x, t.y, 200)) if (o !== t) hurt(s, c, o, d * .55, { skill: 1 }); c.air = air;
        }
      }
    } else if (c.leap) {
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
    } else if (c.stunT <= 0 && c.lock <= 0 && c.rootT <= 0) walk(s, c);
    towerPush(s, c);
    // A duel ring holds both fighters in.
    if (c.duelZ) { const z = c.duelZ; if (z.dead || z.t <= 0) c.duelZ = null; else { const n = norm(c.x - z.x, c.y - z.y); if (n.l > z.r - c.r) { c.x = z.x + n.x * (z.r - c.r); c.y = z.y + n.y * (z.r - c.r); pushOut(s.map, c); } } }

    // basic attack
    if (c.atk && c.stunT <= 0 && !c.air && !c.dash && !c.chan && !c.charge && c.atkCd <= 0) {
      const t = autoTarget(s, c);
      if (t) {
        c.atkCd = 1 / (c.as * (1 + (c.asBonus || 0))); c.lock = .13; const n = norm(t.x - c.x, t.y - c.y); c.fx = n.x; c.fy = n.y; c.revealT = 1;
        const o = { dmg: c.dmgBase * (c.buffT > 0 ? 1.2 : 1), crit: false, empowered: c.empowerT > 0 };
        if (c.empowerT > 0) { o.dmg *= 1.6; c.empowerT = 0; o.crit = true; }
        if (c.stealthT > 0) breakStealth(s, c);
        if (K.onBasic) K.onBasic(s, c, t, o);
        if (t.kind === 'beacon') o.dmg = 1;
        if (c.st.u.storm) { c.stormN = (c.stormN || 0) + 1; if (c.stormN >= 3) { c.stormN = 0; o.storm = 1; } }
        s.ev.push({ e: 'atk', u: c.id, t: t.id });
        if (KITS[c.champ].melee) { hurt(s, c, t, o.dmg, { crit: o.crit, basic: 1 }); }
        else homing(s, c, t, o.dmg, 1100, 'bolt', { crit: o.crit, basic: 1 });
        if (o.storm) { const e = nearestFoe(s, { x: t.x, y: t.y, team: c.team }, 260, { los: true }); if (e && e !== t) homing(s, c, e, o.dmg * .6, 1400, 'bolt', { basic: 1 }); }
      }
    }

    // fountain
    const f = s.fountains[c.team]; if (dist(c, f) < FOUNTAIN_HEAL_R) { c.hp = Math.min(c.maxHp, c.hp + c.maxHp * .45 * DT); }
    const ef = s.fountains[1 - c.team]; if (dist(c, ef) < FOUNTAIN_BURN_R && !c.air) { hurt(s, null, c, 900 * DT); }
    if (!(c.noHealT > 0)) c.hp = Math.min(c.maxHp, c.hp + (c.maxHp * (.004 + c.st.regen)) * DT);

    // brush
    c.inBrush = -1; s.map.brush.forEach((b, i) => { if (Math.hypot(c.x - b.x, c.y - b.y) < b.r) c.inBrush = i; });
    c.vx = (c.x - c.px) / DT; c.vy = (c.y - c.py) / DT;
    earn(s, c, 2.6 * DT);
  }

  // Commands available alive or dead. Bots use exactly the same ones.
  const STATUS_T = ['stunT', 'slowT', 'markT', 'parryT', 'drT', 'buffT', 'empowerT', 'revealT', 'lock', 'rootT', 'polyT', 'knockT', 'stealthT', 'noHealT', 'hasteT', 'shieldT', 'vulnT', 'dmarkT', 'opener', 'ripT', 'curseT', 'poisonT', 'bleedT', 'pingT'];
  const BEACON_CD = 50, BEACON_RANGE = 460, BEACON_SIGHT = 560, BEACON_LIFE = 60;
  function runShared(s, c, q) {
    if (q.t === 'buy') buyItem(s, c, q.id);
    else if (q.t === 'sell') sellItem(s, c, q.slot);
    else if (q.t === 'evolve') chooseEvolve(s, c, q.tier, q.choice);
    else if (q.t === 'beacon') placeBeacon(s, c, q.tx, q.ty);
    else if (q.t === 'ping') pingAt(s, c, q.kind, q.x, q.y);
    else if (q.t === 'practice') practiceOp(s, c, q.op);
  }
  function buyItem(s, c, id) {
    const it = ITEM_BY[id]; if (!it) return false; const price = itemPrice(c, id); if (price === null || c.gold < price) return false;
    const path = itemPath(id); let slot = -1;
    for (let i = path.length - 2; i >= 0 && slot < 0; i--) { const k = c.items.indexOf(path[i]); if (k >= 0) slot = k; }
    if (slot < 0) slot = c.items.findIndex(x => !x);
    if (slot < 0) return false;
    c.gold -= price; c.items[slot] = id;
    const hp0 = c.hp; applyStats(c, true); if (!c.alive) c.hp = 0; else c.hp = Math.max(hp0, c.hp);
    s.ev.push({ e: 'buy', u: c.id, id }); return true;
  }
  function sellItem(s, c, slot) {
    const id = c.items[slot]; if (!id) return false;
    let v = 0; for (const p of itemPath(id)) v += ITEM_BY[p].cost;
    c.gold += v * .65; c.items[slot] = null; applyStats(c, true); if (!c.alive) c.hp = 0;
    s.ev.push({ e: 'sell', u: c.id, id }); return true;
  }
  function chooseEvolve(s, c, tier, choice) {
    if ((tier !== 0 && tier !== 1) || (choice !== 0 && choice !== 1) || c.evolved[tier] !== -1 || c.lvl < (tier ? 8 : 4)) return false;
    c.evolved[tier] = choice; applyMods(c); applyStats(c, true); if (!c.alive) c.hp = 0;
    s.ev.push({ e: 'evolve', u: c.id, tier, choice }); return true;
  }
  function placeBeacon(s, c, tx, ty) {
    if (!c.alive || c.beacons <= 0 || !isFinite(tx + ty)) return false;
    const n = norm(tx - c.x, ty - c.y), l = Math.min(n.l, BEACON_RANGE), d = rayWall(c.x, c.y, n.x, n.y, l), f = nearestFree(s.map, c.x + n.x * d, c.y + n.y * d);
    let br = -1; s.map.brush.forEach((b, i) => { if (Math.hypot(f.x - b.x, f.y - b.y) < b.r) br = i; });
    const b = { id: s.nid++, kind: 'beacon', team: c.team, x: f.x, y: f.y, px: f.x, py: f.y, r: 16, hp: 3, maxHp: 3, alive: true, t: BEACON_LIFE, sight: BEACON_SIGHT, inBrush: br, owner: c };
    s.beacons.push(b); c.beacons--; if (c.beaconT <= 0) c.beaconT = BEACON_CD;
    s.ev.push({ e: 'beacon', u: c.id, x: b.x, y: b.y, team: c.team });
    return true;
  }
  function stepBeacons(s) { for (const b of s.beacons) { b.t -= DT; if (b.t <= 0) b.alive = false; } if (s.beacons.some(b => !b.alive)) s.beacons = s.beacons.filter(b => b.alive); }
  const PING_KINDS = ['attack', 'retreat', 'omw', 'help', 'danger'];
  function pingAt(s, c, kind, x, y) {
    if (c.pingT > 0 || !isFinite(x + y)) return false;
    c.pingT = .4;
    const k = PING_KINDS.includes(kind) ? kind : 'danger', px = clamp(x, 0, W), py = clamp(y, 0, H);
    const ai = s.ai[c.team]; ensureAi(ai);
    ai.pings.push({ kind: k, x: px, y: py, t: s.t, by: c.id }); if (ai.pings.length > 8) ai.pings.shift();
    s.ev.push({ e: 'ping', u: c.id, kind: k, x: px, y: py, team: c.team });
    return true;
  }
  function practiceOp(s, c, op) {
    if (!s.practice) return;
    if (op === 'gold') { c.gold += 5000; s.ev.push({ e: 'gold', u: c.id, a: 5000 }); }
    else if (op === 'level') { for (let i = 0; i < 12 && c.lvl < 10; i++) giveXp(s, c, xpNeed(c.lvl) - c.xp + 1); }
    else if (op === 'reset') { c.cd = [0, 0, 0]; c.recast = [0, 0, 0]; c.hp = c.maxHp; c.beacons = 2; c.beaconT = 0; }
  }
  // Called every couple of seconds: how far behind a side has fallen, 0..1.
  function updateCatchup(s) {
    const worth = [0, 0];
    for (const c of s.champs) { worth[c.team] += c.gold + c.xp * .4; for (const id of c.items) if (id) worth[c.team] += itemPath(id).reduce((v, p) => v + ITEM_BY[p].cost, 0); }
    const gap = worth[1] - worth[0], k = clamp(Math.abs(gap) / 2400, 0, 1);
    s.catchup[0] = gap > 0 ? k : 0; s.catchup[1] = gap < 0 ? k : 0;
  }
  // Poison and bleed, ticking twice a second. Damage over time never reveals or interrupts.
  function stepDots(s) {
    const all = [s.champs, s.minions, s.monsters];
    for (const list of all) for (const u of list) {
      if (!u.alive) continue;
      if (u.kind !== 'champ') { if (u.curseT > 0) { u.curseT -= DT; if (u.curseT <= 0) u.curseN = 0; } if (u.poisonT > 0) u.poisonT -= DT; if (u.bleedT > 0) u.bleedT -= DT; }
      if (s.tick % 15 === 0) {
        if (u.poisonT > 0 && u.poisonBy) hurt(s, u.poisonBy, u, u.poisonDps * .5, { skill: 1, dot: 1 });
        if (u.alive && u.bleedT > 0 && u.bleedBy) hurt(s, u.bleedBy, u, u.bleedDps * .5, { skill: 1, dot: 1 });
      }
    }
  }

  function stepMinion(s, m) {
    m.px = m.x; m.py = m.y; if (m.delay > 0) { m.delay -= DT; return; }
    if (m.stunT > 0) m.stunT -= DT; if (m.slowT > 0) m.slowT -= DT; if (m.markT > 0) m.markT -= DT; if (m.cd > 0) m.cd -= DT; if (m.knockT > 0) m.knockT -= DT; if (m.polyT > 0) m.polyT -= DT;
    if (m.dash) { const D = m.dash; const st = Math.min(DT, D.t); m.x += D.vx * st; m.y += D.vy * st; D.t -= DT; if (D.t <= 0) m.dash = null; pushOut(s.map, m); return; }
    if (m.stunT > 0) return;
    let t = null, bd = 340;
    // protect allied champions that are being hit by enemy champions
    if (!s.practice) for (const e of s.champs) if (e.alive && !e.air && e.team !== m.team && e.recentHit && s.t - e.recentHit < 1.5 && canSee(s, m.team, e)) { const d = dist(m, e); if (d < 420 && hasLOS(m.x, m.y, e.x, e.y)) { t = e; break; } }
    if (!t) for (const e of s.minions) if (e.alive && e.team !== m.team && e.delay <= 0) { const d = dist(m, e) - e.r; if (d < bd && hasLOS(m.x, m.y, e.x, e.y)) { bd = d; t = e; } }
    if (!t) for (const e of s.towers) if (e.alive && e.team !== m.team && towerOpen(s, e)) { const d = dist(m, e) - e.r; if (d < bd + 40 && hasLOS(m.x, m.y, e.x, e.y)) { bd = d; t = e; } }
    if (!t && !s.practice) for (const e of s.champs) if (e.alive && !e.air && e.team !== m.team && canSee(s, m.team, e)) { const d = dist(m, e) - e.r; if (d < bd * .7 && hasLOS(m.x, m.y, e.x, e.y)) { bd = d; t = e; } }
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
  // Structures: very resistant early so the base can't fall in a blink, then steadily softer so a match ends by about 18 minutes.
  const structureK = s => s.t < 560 ? .5 : s.t < 760 ? .5 + (s.t - 560) / 200 * .7 : Math.min(14, 1.2 + (s.t - 760) / 58);
  function stepTower(s, t) {
    if (s.practice) return;
    if (t.cd > 0) t.cd -= DT; if (t.cd > 0) return;
    let target = null, bd = t.range;
    for (const c of s.champs) if (c.alive && !c.air && !(c.stealthT > 0) && c.team !== t.team && c.recentHit && s.t - c.recentHit < 2 && dist(c, t) < t.range) { target = c; break; }
    if (!target) for (const m of s.minions) if (m.alive && m.team !== t.team && m.delay <= 0) { const d = dist(m, t); if (d < bd) { bd = d; target = m; } }
    if (!target) { bd = t.range; for (const c of s.champs) if (c.alive && !c.air && !(c.stealthT > 0) && c.team !== t.team) { const d = dist(c, t); if (d < bd) { bd = d; target = c; } } }
    if (!target) { t.last = null; t.stack = 0; return; }
    t.stack = t.last === target.id ? t.stack + 1 : 0; t.last = target.id; t.cd = 1.1;
    // Each consecutive shot on the same target hits 45% harder, compounding, capped at 4x.
    const ramp = Math.min(4, Math.pow(1.45, t.stack));
    const base = target.kind === 'champ' ? (TOWER_BASE + s.t * TOWER_RAMP) * ramp : target.maxHp * (s.t > 1020 ? .16 : s.t > 900 ? .24 : .42) * (1 + (target.armor || 0) / 100);
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
          hurt(s, src, t, p.dmg, { crit: p.crit, basic: p.basic, skill: p.skill });
          continue;
        }
        p.x += n.x * st; p.y += n.y * st;
      } else {
        const st = Math.hypot(p.vx, p.vy) * DT, k = st > p.left ? p.left / st : 1; p.x += p.vx * DT * k; p.y += p.vy * DT * k; p.left -= st;
        const test = t => {
          if (p.dead || !t.alive || t.air || t === p.owner || p.hits.has(t.id)) return;
          if (t.team === p.team && !(p.filter.startsWith('all') && t.kind === 'champ')) return;
          if (segDist(t.x, t.y, p.px, p.py, p.x, p.y) <= t.r + p.w / 2) {
            p.hits.add(t.id); p.hit(s, p.owner, t, p);
            s.ev.push({ e: 'phit', x: t.x, y: t.y, fx: p.fx });
            if (p.pass) p.pass = 0; else if (!p.pierce) p.dead = true;
          }
        };
        s.champs.forEach(test);
        if (p.filter === 'units' || p.filter === 'chainable' || p.filter === 'allunits' || p.filter === 'allchainable') { s.minions.forEach(test); if (p.filter === 'units' || p.filter === 'allunits') s.monsters.forEach(test); }
        if (p.left <= 0) { p.dead = true; if (p.wall) s.ev.push({ e: 'phit', x: p.x, y: p.y, fx: p.fx }); }
      }
      if (!p.dead && p.owner.kind !== 'tower') for (const z of s.zones) if (z.kind === 'dome' && z.team !== p.team && Math.hypot(z.x - p.x, z.y - p.y) < z.r) { p.dead = true; s.ev.push({ e: 'phit', x: p.x, y: p.y, fx: 'dome' }); break; }
    }
    s.proj = s.proj.filter(p => !p.dead);
  }

  function stepZones(s) {
    for (const z of s.zones) {
      if (z.dead) continue;
      z.t -= DT;
      if (z.step && z.t > 0) z.step(s, z);
      if (z.t <= 0) {
        z.dead = true;
        if (z.kind === 'blast') { s.ev.push({ e: 'boom', x: z.x, y: z.y, r: z.r, fx: z.fx }); z.fn(s, z); }
        else if (z.fn) z.fn(s, z);
        if (z.end) z.end(s, z);
      }
    }
    s.zones = s.zones.filter(z => !z.dead);
  }

  /*BOTS*/
  // ---------- networking: compact state for host-authoritative play ----------
  // Fast state is binary and goes out unreliably about 20 times a second. Slow state is a
  // sparse delta of whole numbers on the reliable channel, so a lost packet can't desync it.
  const FX_CODE = ['snipe', 'snipeFull', 'deadeye', 'orb', 'ray', 'chain', 'bolt', 'mbolt', 'tower', 'rupture', 'crash', 'heal', 'stomp', 'dome', 'break', 'dash', 'parry', 'slash', 'tripwire', 'ricochet', 'lockdown', 'flourish', 'feint', 'salute', 'hexbolt', 'polymorph', 'coven', 'miasma', 'leech', 'quarantine', 'shank', 'vanish', 'cuts', 'wrecking', 'grab', 'demolish', 'smoke', 'blink', 'tether', 'orbit', 'decoy', 'ring', 'fissure', 'tripline'];
  const ZONE_KINDS = ['blast', 'dome', 'tripline', 'lockdown', 'coven', 'miasma', 'quarantine', 'ring', 'tether', 'orbit', 'fissure', 'decoy'];
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
    wp = 0; w8(SNAP_MAGIC); w8((s.seed || 0) & 255); wb.setUint32(wp, s.tick, true); wp += 4; w16(ack); w8(seat + 1);
    w8(s.champs.length);
    for (const c of s.champs) {
      const chan = c.chan, ch = c.charge, brush = c.inBrush >= 0, curse = c.curseT > 0 ? c.curseN || 0 : 0, pstack = c.pstack || 0, up = c.air > 0 || c.knockT > 0;
      const fl2 = (c.rootT > 0 ? 1 : 0) | (c.polyT > 0 ? 2 : 0) | (c.knockT > 0 ? 4 : 0) | (c.stealthT > 0 ? 8 : 0) | (c.noHealT > 0 ? 16 : 0) | (c.poisonT > 0 ? 32 : 0) | (c.bleedT > 0 ? 64 : 0) | (c.cuts ? 128 : 0) | (c.shieldHp > 0 ? 256 : 0) | (c.pready ? 512 : 0) | (c.hasteT > 0 ? 1024 : 0) | (Math.min(7, curse) << 11) | (pstack ? 16384 : 0) | (c.duelZ ? 32768 : 0);
      const fl = (c.alive ? 1 : 0) | (c.air > 0 ? 2 : 0) | (c.dash ? 4 : 0) | (c.stunT > 0 ? 8 : 0) | (c.slowT > 0 ? 16 : 0) | (c.markT > 0 ? 32 : 0) | (c.parryT > 0 ? 64 : 0)
        | (c.drT > 0 ? 128 : 0) | (c.buffT > 0 ? 256 : 0) | (c.empowerT > 0 ? 512 : 0) | (c.revealT > 0 ? 1024 : 0) | (chan ? 2048 : 0) | (ch ? 4096 : 0) | (brush ? 8192 : 0) | (c.echo ? 16384 : 0) | (c.leap ? 32768 : 0);
      wPos(c.x); wPos(c.y); w16(Math.ceil(c.hp)); wi8((c.fx || 0) * 127); wi8((c.fy || 0) * 127); wb.setUint16(wp, fl, true); wp += 2; wb.setUint16(wp, fl2, true); wp += 2;
      if (up) wByte((c.z || 0) / 2);
      if (pstack) w8(Math.min(255, pstack));
      if (brush) w8(c.inBrush);
      if (chan) { w8(chan.recall ? 0 : chan.slot + 1); wByte(chan.t * 20); wByte(chan.total * 20); wi8((chan.dx || 0) * 127); wi8((chan.dy || 0) * 127); }
      if (ch) { w8(ch.slot); wByte(ch.t * 50); wi8(ch.dx * 127); wi8(ch.dy * 127); }
      if (c.echo) { wPos(c.echo.x); wPos(c.echo.y); }
    }
    if (seat >= 0) {
      const c = s.champs[seat];
      for (let i = 0; i < 3; i++) w16(Math.max(0, c.cd[i]) * 100);
      for (let i = 0; i < 3; i++) w16(Math.max(0, c.recast[i]) * 100);
      w16(Math.max(0, c.atkCd) * 100); wByte((c.slowT > 0 ? c.slowA : 0) * 100); wByte((c.hasteT > 0 ? c.hasteA : 0) * 100);
    }
    const extraOf = m => (m.curseT > 0 ? Math.min(7, m.curseN || 0) : 0) | (m.poisonT > 0 ? 8 : 0) | (m.bleedT > 0 ? 16 : 0) | (m.polyT > 0 ? 32 : 0) | (m.knockT > 0 ? 64 : 0);
    wList(s.monsters, 60, m => { const ex = extraOf(m); wPos(m.x); wPos(m.y); w8(hp8(m)); w8((m.big ? 1 : 0) | (m.boss ? 2 : 0) | (m.stunT > 0 ? 4 : 0) | (m.slowT > 0 ? 8 : 0) | (m.markT > 0 ? 16 : 0) | (ex ? 128 : 0)); if (ex) w8(ex); });
    wList(s.minions, 240, m => { wPos(m.x); wPos(m.y); w8(hp8(m)); w8((m.team ? 1 : 0) | (m.ranged ? 2 : 0) | (m.stunT > 0 ? 4 : 0) | (m.slowT > 0 ? 8 : 0) | (m.markT > 0 ? 16 : 0) | (m.delay > 0 ? 32 : 0) | (m.lane ? 64 : 0) | (extraOf(m) ? 128 : 0)); if (extraOf(m)) w8(extraOf(m)); });
    wList(s.proj, 160, p => {
      wPos(p.x); wPos(p.y); w8(p.team | (p.homing ? 4 : 0) | (p.pierce ? 8 : 0)); w8(FX_NUM[p.fx] === undefined ? 255 : FX_NUM[p.fx]); wByte(p.w); wVar(p.owner.id);
      if (p.homing) wVar(p.target.id); else { wi16(p.vx / 8); wi16(p.vy / 8); }
    });
    wList(s.zones, 64, z => { const ext = (z.line ? 1 : 0) | (z.tgt ? 2 : 0); wPos(z.x); wPos(z.y); w16(z.r); wByte(z.t * 20); wByte(z.total * 20); w8(z.team | ZONE_KINDS.indexOf(z.kind) << 2); w8(FX_NUM[z.fx] === undefined ? 255 : FX_NUM[z.fx]); wVar(z.owner.id); w8(ext); if (z.line) { wPos(z.x1); wPos(z.y1); wPos(z.x2); wPos(z.y2); } if (z.tgt) wVar(z.tgt); });
    wList(s.beacons, 40, b => { wPos(b.x); wPos(b.y); w8(b.team | (b.hp << 2) | ((b.inBrush + 1) << 4)); wByte(b.t); });
    let mask = 0; s.sites.forEach((z, i) => { if (z.prog[0] > 0 || z.prog[1] > 0) mask |= 1 << i; });
    w8(mask); s.sites.forEach((z, i) => { if (mask & 1 << i) { wByte(z.prog[0] * 40); wByte(z.prog[1] * 40); } });
    return wb.buffer.slice(0, wp);
  }

  function decodeSnapshot(buf) {
    const d = new DataView(buf); let p = 0;
    const r8 = () => d.getUint8(p++), ri8 = () => d.getInt8(p++), r16 = () => { const v = d.getUint16(p, true); p += 2; return v; }, ri16 = () => { const v = d.getInt16(p, true); p += 2; return v; };
    const rPos = () => r16() / POS, rVar = () => { let v = 0, sh = 0, b; do { b = r8(); v |= (b & 127) << sh; sh += 7; } while (b & 128); return v >>> 0; };
    if (r8() !== SNAP_MAGIC) return null;
    const mid = r8(), tick = d.getUint32(p, true); p += 4;
    const ack = r16(), seat = r8() - 1, n = r8(), champs = [];
    for (let i = 0; i < n; i++) {
      const c = { x: rPos(), y: rPos(), hp: r16(), fx: ri8() / 127, fy: ri8() / 127, fl: r16(), fl2: r16(), z: 0, br: -1, chan: null, charge: null, echo: null, ps: 0 };
      if (c.fl & 2 || c.fl2 & 4) c.z = r8() * 2;
      if (c.fl2 & 16384) c.ps = r8();
      if (c.fl & 8192) c.br = r8();
      if (c.fl & 2048) c.chan = { n: r8(), t: r8() / 20, total: r8() / 20, dx: ri8() / 127, dy: ri8() / 127 };
      if (c.fl & 4096) c.charge = { slot: r8(), t: r8() / 50, dx: ri8() / 127, dy: ri8() / 127 };
      if (c.fl & 16384) c.echo = { x: rPos(), y: rPos() };
      champs.push(c);
    }
    let own = null;
    if (seat >= 0) own = { cd: [r16() / 100, r16() / 100, r16() / 100], recast: [r16() / 100, r16() / 100, r16() / 100], atkCd: r16() / 100, slowA: r8() / 100, hasteA: r8() / 100 };
    const list = fn => { const k = rVar(), out = new Array(k); let id = 0; for (let i = 0; i < k; i++) { id += rVar(); out[i] = fn(id); } return out; };
    const unitRow = id => { const o = { id, x: rPos(), y: rPos(), hp: r8(), fl: r8(), ex: 0 }; if (o.fl & 128) o.ex = r8(); return o; };
    const mon = list(unitRow);
    const min = list(unitRow);
    const proj = list(id => { const o = { id, x: rPos(), y: rPos(), fl: r8(), fx: r8(), w: r8(), owner: rVar(), target: 0, vx: 0, vy: 0 }; if (o.fl & 4) o.target = rVar(); else { o.vx = ri16() * 8; o.vy = ri16() * 8; } return o; });
    const zones = list(id => { const o = { id, x: rPos(), y: rPos(), r: r16(), t: r8() / 20, total: r8() / 20, fl: r8(), fx: r8(), owner: rVar(), ext: r8() }; if (o.ext & 1) { o.x1 = rPos(); o.y1 = rPos(); o.x2 = rPos(); o.y2 = rPos(); } if (o.ext & 2) o.tgt = rVar(); return o; });
    const beacons = list(id => ({ id, x: rPos(), y: rPos(), fl: r8(), t: r8() }));
    const mask = r8(); let prog = null;
    if (mask) { prog = {}; for (let i = 0; i < 8; i++) if (mask & 1 << i) prog[i] = [r8() / 40, r8() / 40]; }
    return { mid, tick, ack, seat, champs, own, mon, min, proj, zones, beacons, prog, size: buf.byteLength };
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
    const span = B ? B.tick - A.tick : 0, rx = s.rx || (s.rx = { m: new Map(), n: new Map(), p: new Map(), z: new Map(), b: new Map() });
    s.tick = A.tick; s.t = (A.tick + span * f) * DT;
    A.champs.forEach((a, i) => {
      const c = s.champs[i];
      if (i !== seat) {
        placeUnit(c, a, B && B.champs[i], f, span);
        applyChampState(c, a);
        c.z = B && (B.champs[i].fl & 2 || B.champs[i].fl2 & 4) ? a.z + (B.champs[i].z - a.z) * f : a.z;
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
      (u, a) => { u.hp = a.hp; u.stunT = a.fl & 4 ? 1 : 0; u.slowT = a.fl & 8 ? 1 : 0; u.markT = a.fl & 16 ? 1 : 0; unitExtra(u, a.ex); });
    sync(s.minions, A.min, B && B.min, rx.n, a => ({ id: a.id, kind: 'minion', team: a.fl & 1, ranged: !!(a.fl & 2), lane: a.fl & 64 ? 1 : 0, alive: true, maxHp: 255, r: a.fl & 2 ? 14 : 17, sight: 500, ms: 215, range: a.fl & 2 ? 300 : 95, fx: a.fl & 1 ? -1 : 1, fy: 0 }),
      (u, a) => { u.hp = a.hp; u.stunT = a.fl & 4 ? 1 : 0; u.slowT = a.fl & 8 ? 1 : 0; u.markT = a.fl & 16 ? 1 : 0; u.delay = a.fl & 32 ? 1 : 0; unitExtra(u, a.ex); });
    sync(s.proj, A.proj, B && B.proj, rx.p, a => ({ id: a.id, team: a.fl & 3, homing: !!(a.fl & 4), pierce: !!(a.fl & 8), fx: FX_CODE[a.fx], w: a.w, age: 0, vx: a.vx, vy: a.vy, seen: s.t }),
      (u, a) => { u.age = s.t - u.seen; u.vx = a.vx; u.vy = a.vy; u.w = a.w; if (!u.owner || u.owner.id !== a.owner) u.owner = unitOf(s, a.owner) || ghostUnit(a.owner, a.x, a.y, a.fl & 3); if (u.homing && (!u.target || u.target.id !== a.target)) u.target = unitOf(s, a.target) || ghostUnit(a.target, a.x, a.y, 2); });
    sync(s.zones, A.zones, B && B.zones, rx.z, a => ({ id: a.id, x: a.x, y: a.y, kind: ZONE_KINDS[a.fl >> 2], fx: FX_CODE[a.fx], r: a.r, team: a.fl & 3, total: a.total, t: a.t, line: !!(a.ext & 1), tgt: a.tgt }),
      (u, a) => { u.t = Math.max(0, a.t - span * f * DT); u.total = a.total; u.r = a.r; if (a.ext & 1) { u.x1 = a.x1; u.y1 = a.y1; u.x2 = a.x2; u.y2 = a.y2; } if (!u.owner) u.owner = unitOf(s, a.owner) || ghostUnit(a.owner, a.x, a.y, a.fl & 3); });
    sync(s.beacons, A.beacons, null, rx.b, a => ({ id: a.id, kind: 'beacon', team: a.fl & 3, x: a.x, y: a.y, px: a.x, py: a.y, r: 16, maxHp: 3, alive: true, sight: 560, inBrush: (a.fl >> 4) - 1 }), (u, a) => { u.hp = (a.fl >> 2) & 3; u.t = a.t; });
    for (const z of s.sites) { const p = A.prog && A.prog[z.id]; z.prog[0] = p ? p[0] : 0; z.prog[1] = p ? p[1] : 0; }
  }
  const unitOf = (s, id) => s.champs.find(c => c.id === id) || s.towers.find(c => c.id === id) || (s.rx && (s.rx.n.get(id) || s.rx.m.get(id)));
  function applyChampState(c, a, own) {
    const f = a.fl;
    c.alive = !!(f & 1); c.hp = a.hp; c.fx = a.fx; c.fy = a.fy; c.inBrush = a.br;
    c.air = f & 2 ? 1 : 0; c.dash = f & 4 ? (c.dash || { net: true }) : null; c.stunT = f & 8 ? 1 : 0; c.slowT = f & 16 ? 1 : 0; c.markT = f & 32 ? 1 : 0; c.parryT = f & 64 ? 1 : 0;
    c.drT = f & 128 ? 1 : 0; c.buffT = f & 256 ? 1 : 0; c.empowerT = f & 512 ? 1 : 0; c.revealT = f & 1024 ? 1 : 0; c.leap = f & 32768 ? true : null;
    const g = a.fl2 || 0; c.rootT = g & 1 ? 1 : 0; c.polyT = g & 2 ? 1 : 0; c.knockT = g & 4 ? 1 : 0; c.stealthT = g & 8 ? 1 : 0; c.noHealT = g & 16 ? 1 : 0; c.poisonT = g & 32 ? 1 : 0; c.bleedT = g & 64 ? 1 : 0; c.cuts = g & 128 ? true : null; c.shieldHp = g & 256 ? 1 : 0; c.shieldT = g & 256 ? 1 : 0; c.pready = g & 512 ? 1 : 0; c.hasteT = g & 1024 ? 1 : 0; c.curseN = (g >> 11) & 7; c.curseT = c.curseN ? 1 : 0; c.pstack = a.ps || 0; c.duelZ = g & 32768 ? (c.duelZ || { net: true }) : null;
    if (!(f & 2) && !(g & 4)) c.z = 0;
    if (a.chan) {
      const ch = a.chan, slot = ch.n ? ch.n - 1 : undefined, ab = slot !== undefined ? c.kit[slot] : null;
      c.chan = { t: ch.t, total: ch.total, recall: !ch.n, slot, kind: ab && ab.shape === 'line' ? 'line' : undefined, dx: ch.dx, dy: ch.dy, len: ab ? ab.range : 0, w: ab ? ab.w : 0 };
    } else c.chan = null;
    c.charge = a.charge ? { slot: a.charge.slot, t: a.charge.t, dx: a.charge.dx, dy: a.charge.dy } : null;
    c.echo = a.echo || null; if (!own) c.recast[1] = c.echo ? 1 : 0;
  }
  // Bring every field the guest's own coin needs from the newest snapshot, except where it moves.
  function applySnapshot(s, data, seat = -1) { const fr = typeof data.byteLength === 'number' ? decodeSnapshot(data) : data; if (fr) applyFrame(s, fr, null, 0, seat); return fr; }

  function unitExtra(u, ex) { u.curseN = ex & 7; u.curseT = u.curseN ? 1 : 0; u.poisonT = ex & 8 ? 1 : 0; u.bleedT = ex & 16 ? 1 : 0; u.polyT = ex & 32 ? 1 : 0; u.knockT = ex & 64 ? 1 : 0; }
  // Slow fields as flat whole numbers; a diff of two of these is the delta.
  function slowFlat(s) {
    return [
      [[Math.round(s.hope * 10), s.hopeTeam, s.kills[0], s.kills[1], Math.round(s.bossAt), s.bossUp ? 1 : 0, s.buff[0], s.buff[1], s.wave, s.over ? s.over.winner + 1 : 0, s.over ? Math.round(s.over.t * 10) : 0]],
      s.champs.map(c => [c.lvl, Math.round(c.xp), Math.floor(c.gold), Math.round(c.maxHp), Math.round(c.msBase), Math.ceil(c.respawn), itemCode(c.items[0]), itemCode(c.items[1]), itemCode(c.items[2]), c.evolved[0] + 1, c.evolved[1] + 1, c.beacons, Math.ceil(c.beaconT), c.streak, Math.round(c.armor), c.stats.kills, c.stats.deaths, c.stats.assists, c.stats.casts, c.stats.skillHits, c.stats.parries, Math.round(c.stats.dmg), c.as * 1000 | 0]),
      s.towers.map(t => [Math.ceil(t.hp), t.alive ? 1 : 0]),
      s.sites.map(z => [z.alive ? 1 : 0]),
    ];
  }
  function slowDiff(prev, cur) {
    const out = [];
    cur.forEach((sec, a) => sec.forEach((row, b) => row.forEach((v, c) => { if (!prev || prev[a][b][c] !== v) out.push(a, b, c, v); })));
    return out;
  }
  const itemCode = id => id ? ITEM_BY[id].i + 1 : 0, setItem = i => (c, v) => { c.items[i] = v ? ITEMS[v - 1].id : null; c.dirtyKit = 1; };
  const G_FIELDS = [(s, v) => { s.hope = v / 10; }, (s, v) => { s.hopeTeam = v; }, (s, v) => { s.kills[0] = v; }, (s, v) => { s.kills[1] = v; }, (s, v) => { s.bossAt = v; }, (s, v) => { s.bossUp = !!v; }, (s, v) => { s.buff[0] = v; }, (s, v) => { s.buff[1] = v; }, (s, v) => { s.wave = v; }, (s, v) => { s.over = v ? Object.assign(s.over || { t: 0 }, { winner: v - 1 }) : null; }, (s, v) => { if (s.over) s.over.t = v / 10; }];
  const C_FIELDS = [(c, v) => { c.lvl = v; }, (c, v) => { c.xp = v; }, (c, v) => { c.gold = v; }, (c, v) => { c.maxHp = v; }, (c, v) => { c.msBase = v; }, (c, v) => { c.respawn = v; }, setItem(0), setItem(1), setItem(2), (c, v) => { c.evolved[0] = v - 1; c.dirtyKit = 1; }, (c, v) => { c.evolved[1] = v - 1; c.dirtyKit = 1; }, (c, v) => { c.beacons = v; }, (c, v) => { c.beaconT = v; }, (c, v) => { c.streak = v; }, (c, v) => { c.armor = v; }, (c, v) => { c.stats.kills = v; }, (c, v) => { c.stats.deaths = v; }, (c, v) => { c.stats.assists = v; }, (c, v) => { c.stats.casts = v; }, (c, v) => { c.stats.skillHits = v; }, (c, v) => { c.stats.parries = v; }, (c, v) => { c.stats.dmg = v; }, (c, v) => { c.as = v / 1000; }];
  function applySlow(s, d) {
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i], b = d[i + 1], c = d[i + 2], v = d[i + 3];
      if (a === 0) G_FIELDS[c](s, v);
      else if (a === 1) C_FIELDS[c](s.champs[b], v);
      else if (a === 2) { if (c === 0) s.towers[b].hp = v; else s.towers[b].alive = !!v; }
      else if (a === 3) s.sites[b].alive = !!v;
    }
    for (const c of s.champs) if (c.dirtyKit) { c.dirtyKit = 0; refreshChamp(c); }
  }

  // Events, as short arrays. Position fields are rounded; everything else is passed as is.
  const EV_KEYS = { hit: ['u', 'a', 'sk', 'crit', 'by'], heal: ['u', 'a'], die: ['u', 'kind', 'x', 'y', 'by'], gold: ['u', 'a'], boom: ['x', 'y', 'r', 'fx', 'x2', 'y2'], phit: ['x', 'y', 'fx'], blink: ['x', 'y'], parry: ['u'], cast: ['u', 'fx', 'dx', 'dy', 'slot', 'charge'], fire: ['u', 'fx', 'dx', 'dy'], root: ['u'], knock: ['u'], poly: ['u'], curse: ['u', 'n'], shield: ['u', 'a'], stealth: ['u', 'on'], ping: ['u', 'kind', 'x', 'y', 'team'], evolve: ['u', 'tier', 'choice'], buy: ['u', 'id'], sell: ['u', 'id'], beacon: ['u', 'x', 'y', 'team'], bhit: ['x', 'y', 'team'], level: ['u'], tower: ['team', 'sub'], bossup: [], boss: ['team'], feed: ['a', 'b', 'multi', 'first', 'bounty'], spawn: ['u'], tshot: ['u', 't', 'n'], cancelled: ['u'], stun: ['u'], mark: ['u'], forge: ['u', 'track'], atk: ['u', 't'], matk: ['u'], civ: ['team', 'x', 'y', 'id'], hope: ['team', 'on'] };
  const EV_NAMES = Object.keys(EV_KEYS), EV_IDX = {}; EV_NAMES.forEach((n, i) => { EV_IDX[n] = i; });
  const EV_ROUND = { x: 1, y: 1, x2: 1, y2: 1, dx: 100, dy: 100 };
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
    } else if (c.stunT <= 0 && c.lock <= 0 && c.rootT <= 0 && !c.air && !c.chan && !c.dash) walk(s, c);
    towerPush(s, c);
    if (c.atk && c.stunT <= 0 && !c.air && !c.dash && !c.pdash && !c.chan && !c.charge && c.atkCd <= 0) {
      const t = autoTarget(s, c);
      if (t) { c.atkCd = 1 / (c.as * (1 + (c.asBonus || 0))); c.lock = .13; const n = norm(t.x - c.x, t.y - c.y); c.fx = n.x; c.fy = n.y; }
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
    if (s.t >= s.nextWave) { spawnWave(s); s.nextWave += s.t > 900 ? 17 : 26; }
    for (const camp of s.camps) if (!camp.alive && s.t >= camp.at) spawnCamp(s, camp);
    if (s.t >= s.bossAt && !s.monsters.some(m => m.boss && m.alive)) { spawnBoss(s); s.bossAt = s.t; }
    if (s.bossUp && !s.monsters.some(m => m.boss && m.alive)) s.bossUp = false;
    for (const c of s.champs) stepChamp(s, c);
    for (const m of s.minions) if (m.alive) stepMinion(s, m);
    for (let i = 0; i < s.minions.length; i++) { const a = s.minions[i]; if (!a.alive || a.delay > 0) continue; for (let j = i + 1; j < s.minions.length; j++) { const b = s.minions[j]; if (!b.alive || b.delay > 0 || a.team !== b.team) continue; const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy), mn = a.r + b.r; if (d < mn && d > .01) { const p = (mn - d) * .25 / d; a.x += dx * p; a.y += dy * p; b.x -= dx * p; b.y -= dy * p; } } }
    for (const m of s.monsters) if (m.alive) stepMonster(s, m);
    for (const t of s.towers) if (t.alive) stepTower(s, t);
    stepProj(s); stepZones(s); stepSites(s); stepDots(s); stepBeacons(s);
    if (s.tick % 60 === 0) updateCatchup(s);
    s.minions = s.minions.filter(m => m.alive); s.monsters = s.monsters.filter(m => m.alive);
  }

  // Rebuilds what a guest derives from build, evolves and items, without touching health.
  function refreshChamp(c) { for (const k in c.f) delete c.f[k]; c.f[c.build] = 1; applyMods(c); const hp = c.hp, m = c.maxHp; applyStats(c, false); c.hp = hp; c.maxHp = m; }

  function masteryGain(st, won) {
    const acc = st.casts ? Math.min(1, st.skillHits / st.casts) : 0;
    return Math.round(st.skillHits * 6 * (.6 + acc) + st.parries * 25 + (st.kills + st.assists * .5) * 20 + (won ? 60 : 20));
  }
  function tierOf(p) { let t = 0; TIERS.forEach((x, i) => { if (p >= x.at) t = i; }); return t; }

  return { BEACON_RANGE, ROSTER, ITEMS, ITEM_BY, itemPath, itemPrice, recommended, marksEarned, cdOf, defaultBuild, TOWER_RANGE, MAX_ATTACK_RANGE, refreshChamp, W, H, TICK, DT, KITS, buildMap, rayWall, visionSources, hasLOS, TIERS, TEAM_NAMES, FORGE_COST, createMatch, step, canSee, autoTarget, masteryGain, tierOf, towerOpen, xpNeed, ROLES, ROLE_INFO, autoRoles, CHARS, charOf,
    RANKS, rankOf, rankDelta, botSkills, skillProfile, setBot, snapshot, decodeSnapshot, applySnapshot, applyFrame, applyChampState, slowFlat, slowDiff, applySlow, packEvent, unpackEvent, predict };
})();
if (typeof module !== 'undefined') module.exports = Sim;
