// Mintfall simulation. No DOM in this file, so it can run on a phone today
// and inside a Cloudflare Durable Object later without changes.
//
// ===== NET STATE (6.0): everything new that a guest, the HUD or art needs. Names are final. =====
// MAP: 20% larger. Sim.W = 5184, Sim.H = 3072. map.arenas = [{kind, x, y, r, side?}] one per boss
//   (kinds warlord, foreman, colossus; sentinel has two entries, side 0 and 1). map.eventSpots = [{x, y}], convoyPath = [[x,y]...].
// Slow state on s:
//   s.bosses = [{kind:'warlord'|'foreman'|'sentinel'|'colossus', name, x, y, r, at, up, id}]  at = s.t of next spawn (when !up); up = alive; x,y current arena; id = monster id or 0.
//   s.boons = [{warlord,foreman,sentinel,colossus,heist,convoy,blackout,drop}, {...}]  seconds left per team, per boost; 0 = off.
//   s.event = null | {kind:'heist'|'convoy'|'blackout'|'drop', phase:'warn'|'live', t, total, x, y, r, prog:[heroes,villains] (0..1), hp (convoy only, 0..100), i (convoy waypoint), winner:-1}
//   s.eventAt = s.t of the next map event; s.fog = [k0, k1] sight multiplier for each team (1 is normal; a Blackout lowers it).
//   s.fund = [n0, n1] times each team has funded the city; s.reinforceAt = [t0, t1] team's next Reinforcements;
//   s.votes = [null | {yes:[champ ids], no:[champ ids], t}, same] surrender votes (humans only; passes on a majority of that team's humans, after minute 10; bots neither vote nor count); s.over gains {surrender:true} when a vote passes.
// Slow state per champion:
//   c.items is now length 5 (ids or null). c.bounty = extra gold on top of base kill gold (0 unless on a streak of 2+). c.buybackCd = seconds until buyback is usable.
//   c.potT, c.elixT, c.tonicT (consumable timers, seconds). c.sentT = Sentinel buff seconds on this champion (mirrors s.boons).
//   c.stats gains: dealt (damage to champions), taken, healing, gold (total earned), towers, objectives (bosses and event wins), rescues. c.stats.dmg stays total damage dealt.
// Per unit:
//   m.type = 'melee'|'ranged'|'heavy' on minions (m.ranged kept, true only for ranged). m.heavy true for heavy.
//   Monsters: m.boss true for all four bosses; m.bossKind = kind above; m.shellT > 0 while the Sentinel's shell is up.
// Commands (both alive and dead unless noted): {t:'buyback'}, {t:'reinforce',lane}, {t:'fund'}, {t:'surrender',vote:true|false}, {t:'buy',id} also buys consumables (effect is applied at once, needs alive), {t:'sell',slot}.
// Events: recap{u,list:[{name,kind,kit?,abil?,dmg}],total} (kind: champion|tower|minion|monster|other); boss{team,kind}; bossup{kind}; mapevent{kind,phase,team,x,y} (phase warn|start|end; team = winner or -1 on end, else -1);
//   feed gains bounty; fund{u,team,a}; reinforce{u,team,lane}; buyback{u}; surrender{team,phase,yes,no,need} (phase open|pass|fail); consume{u,id}; boon{team,kind,on}; civ gains n (allies inside).
// Exports for UI: Sim.buybackCost(s,c), Sim.reinforceCost(s,c), Sim.fundCost(s,team), Sim.sellValue(id), Sim.CONSUMABLES (id list), Sim.BOSS_INFO[kind] = {name,d,boon}, Sim.EVENT_INFO[kind] = {name,d,boon}, Sim.BOON_INFO[kind] = {name,d}, Sim.ITEM_SLOTS = 5, Sim.SURRENDER_AT = 600.
// Items: tier 1..3 as before, tier 4 is legendary (it.legendary = true); it.consumable = true for consumables (no slot, no sell).
// 10.0 additions (names final):
//   Sim.MAX_LEVEL = 15. Sim.PROFS[role] = [{id,name,d}], three per role; seats take seat.prof; c.prof on champions. Sim.ROSTER is 10 per side.
//   Items: Sim.ITEMS has 85 entries; fields ad, ap, armor, mr, pen, mpen, vamp, mon; tags are categories for the shop (attack marksman assassin bruiser magic ability tank resist support mobility jungle sustain consumable). Sim.itemPaths(champ, build) = [{name, items}]; Sim.recommended(champ, build, path = 0).
//   Damage: physical versus armor, magic versus c.mr. Kit field dtype 'phys'|'magic', arch; each ability a.dtype. c.mr on champions.
//   Targeting: command {t:'pref',v:'hp'|'pct'} sets c.targetPref (seat.targetPref too). Sim.quickTarget(s, c, reach) = the enemy champion a tap should fire at (lowest health in reach), else null. Sim.autoTarget follows players, then the surroundings.
//   New fx: arcdash overload thunder riptide bubble tsunami skyward solarfist meteordrop splitshot phantom mirrors firebolt scorch inferno ignite maul pounce frenzy bombard entrench earthbreak thread puppet dance.
//   New zone kinds: tidewave (moves; r, dx, dy), mirrors (x,y,r), puppet (x,y). Existing kinds carry new fx: fissure 'thunder'|'earthbreak', miasma 'scorch'|'entrench'.
//   New event: strike{u,x,y} (Kill Strike lands). c.pstack carries passive stacks for Mirage, Tidecaller, Paragon and Cataclysm; c.pready for Voltaic and Ravager.
// ==== end NET STATE ====
const Sim = (() => {
  const SCALE = 1.2, W = 5184, H = 3072, TICK = 30, DT = 1 / TICK;
  const S = v => Math.round(v * SCALE);
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
  // 10.0: each lane has a chicane: it climbs to the outer wall around the first towers, then dips to a contested bridge at the river.
  const LANE_TOP = [[340, 1280], [470, 880], [720, 600], [1100, 365], [1500, 270], [1860, 330], [2160, 405], [2460, 330], [2820, 270], [3220, 365], [3600, 600], [3850, 880], [3980, 1280]].map(p => p.map(S));
  const RIVER = [[2240, -80], [2160, 330], [2120, 800], [2160, 1280], [2200, 1760], [2160, 2230], [2080, 2640]].map(p => p.map(S));
  const QUAD_CLIFFS = [
    // North rim of the jungle: three segments, two gank gaps onto the lane.
    [1040, 540, 300, 90], [1560, 540, 210, 90],
    // Inner pillars: they pocket the camps and make two routes through each jungle half.
    [1340, 700, 90, 170], [1810, 730, 90, 180],
    // South rim: gaps to main street near the base, in the middle and by the river.
    [1000, 980, 250, 90], [1470, 980, 190, 90], [1880, 980, 90, 90],
    [780, 880, 90, 230],                          // base rampart, framing the centre gate
    [1320, 1195, 90, 90],                         // main street cover
  ].map(r => r.map(S));
  const QUAD_FOREST = [[0, 0, 440, 470], [0, 470, 210, 260]].map(r => r.map(S));
  const QUAD_BRUSH = [[1450, 590, 95], [1860, 610, 80], [1195, 455, 70], [1570, 1150, 90], [1360, 1040, 75]].map(r => r.map(S));
  const FOUNTAIN_HEAL_R = 432, FOUNTAIN_BURN_R = 408;
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
  // Neutral boss arenas. Sentinel alternates between two mirrored arenas, spawning on the trailing side (a soft comeback lever).
  const ARENAS = [
    { kind: 'colossus', x: W / 2, y: H / 2, r: 440 },
    { kind: 'warlord', x: W / 2, y: 960, r: 260 }, { kind: 'foreman', x: W / 2, y: H - 960, r: 260 },
    { kind: 'sentinel', x: 1300, y: H / 2, r: 240, side: 0 }, { kind: 'sentinel', x: W - 1300, y: H / 2, r: 240, side: 1 },
  ];
  const EVENT_SPOTS = [[1900, H / 2], [W - 1900, H / 2], [W / 2, 700], [W / 2, H - 700]];
  const CONVOY_PATH = [[W / 2 + 60, 300], [W / 2 + 60, 900], [W / 2 + 60, H / 2], [W / 2 + 60, H - 900], [W / 2 + 60, H - 300]];
  function buildMap() {
    const walls = WALLS.map(w => Object.assign({}, w));
    const brush = [];
    for (const [x, y, r] of QUAD_BRUSH) four((mx, my) => brush.push({ x: mx ? W - x : x, y: my ? H - y : y, r }));
    const lanes = [LANE_TOP.map(p => p.slice()), LANE_TOP.map(([x, y]) => [x, H - y])];
    const center = { x: W / 2, y: H / 2 };
    const fountains = [{ x: S(130), y: H / 2 }, { x: W - S(130), y: H / 2 }];
    const plazas = [{ x: S(290), y: H / 2, r: S(500), kind: 'base', team: 0 }, { x: W - S(290), y: H / 2, r: S(500), kind: 'base', team: 1 }, { x: center.x, y: center.y, r: S(370), kind: 'centre', team: -1 }];
    const bridges = [{ x: W / 2, y: S(330) }, { x: W / 2, y: H - S(330) }];
    const cols = Math.ceil(W / 40), rows = Math.ceil(H / 40);
    const grid = new Uint8Array(cols * rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const px = i * 40 + 20, py = j * 40 + 20;
      let b = px < 50 || py < 120 || px > W - 50 || py > H - 120;
      for (const w of walls) if (px > w.x - 34 && px < w.x + w.w + 34 && py > w.y - 34 && py < w.y + w.h + 34) b = true;
      grid[j * cols + i] = b ? 1 : 0;
    }
    // Coarse wall buckets, so collision checks only look at nearby walls (about a tenth of the cost on a phone).
    const wc = 200, wcols = Math.ceil(W / wc), wrows = Math.ceil(H / wc), wbucket = new Array(wcols * wrows).fill(null).map(() => []);
    for (const w of walls) for (let j = Math.max(0, (w.y - 80) / wc | 0); j <= Math.min(wrows - 1, (w.y + w.h + 80) / wc | 0); j++) for (let i = Math.max(0, (w.x - 80) / wc | 0); i <= Math.min(wcols - 1, (w.x + w.w + 80) / wc | 0); i++) wbucket[j * wcols + i].push(w);
    return { wbucket, wcols, W, H, walls, brush, lanes, river: RIVER.map(p => p.slice()), center, fountains, plazas, bridges, arenas: ARENAS.map(a => Object.assign({}, a)), eventSpots: EVENT_SPOTS.map(p => ({ x: p[0], y: p[1] })), convoyPath: CONVOY_PATH.map(p => p.slice()), cols, rows, grid, fountainR: FOUNTAIN_HEAL_R };
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
    const wi = u.x / 200 | 0, wj = u.y / 200 | 0, list = (m.wbucket && wi >= 0 && wj >= 0 && wi < m.wcols) ? (m.wbucket[wj * m.wcols + wi] || m.walls) : m.walls;
    for (const w of list) {
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
  const MAX_LEVEL = 15, LVL_G = .66; // a level is worth a third less than before, so 15 levels stay in the old power band
  const isMag = c => (curAbil && MAG_ABIL[curAbil] !== undefined) ? MAG_ABIL[curAbil] : KITS[c.champ].dtype === 'magic';
  const pow = c => (1 + .09 * LVL_G * (c.lvl - 1)) * (1 + c.st.dmg + (isMag(c) ? c.st.ap : c.st.ad)) * (c.buffT > 0 ? 1.2 : 1) * (c.elixT > 0 ? 1.15 : 1) * (c.dropT > 0 ? 1.1 : 1) * ((c.buildDef && c.buildDef.pw) || 1);
  // Which ability a nested projectile, zone, dash or damage over time belongs to, for the death recap.
  let curAbil = null;

  function fire(s, c, aim, o) {
    s.proj.push({
      id: s.nid++, x: c.x, y: c.y, px: c.x, py: c.y, vx: aim.dx * o.speed, vy: aim.dy * o.speed, left: rayWall(c.x, c.y, aim.dx, aim.dy, o.range), wall: rayWall(c.x, c.y, aim.dx, aim.dy, o.range) < o.range - 1, w: o.w,
      team: c.team, owner: c, fx: o.fx, pierce: o.pierce, hits: new Set(), filter: o.filter || 'units', hit: o.hit, skill: true, counted: false, age: 0, abil: curAbil,
    });
  }
  function dashDir(c, dx, dy, d, speed, o = {}) { const len = Math.max(0, Math.min(d, rayWall(c.x, c.y, dx, dy, d + c.r) - c.r)); c.dash = Object.assign({ vx: dx * speed, vy: dy * speed, t: len / speed, hits: new Set(), abil: curAbil }, o); }
  function blast(s, c, x, y, r, delay, fn, fx) { s.zones.push({ id: s.nid++, kind: 'blast', x, y, r, t: delay, total: delay, team: c.team, owner: c, fn, fx, counted: false, abil: curAbil }); }
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
      const k = roleK(c, 'support') * .5; if (k) { c.gold += gold * k; c.stats.gold += gold * k; giveXp(s, c, xp * k); }
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
      nextWave: 8, wave: 0, bossAt: BOSS_FIRST.colossus, kills: [0, 0], buff: [0, 0], camps: [], gaps: {}, navLeft: 2, hope: 50, hopeTeam: -1, sites: [],
      laneInfo: [[{}, {}], [{}, {}]], beacons: [], practice: !!cfg.practice, catchup: [0, 0], seed: cfg.seed || 7, bosses: [], boons: [blankBoons(), blankBoons()], event: null, eventAt: EVENT_FIRST, eventI: 0, eventOrder: [], fog: [1, 1], fund: [0, 0], reinforceAt: [0, 0], reinforceQ: [[0, 0], [0, 0]], votes: [null, null], voteCd: [0, 0],
      ai: [0, 1].map(() => ({ defend: null, hoard: null, hoardGo: false, push: null, pushUntil: 0, thp: {}, sites: {}, help: {}, focus: 0 })),
    };
    s.fountains = s.map.fountains;
    const mir = (x, team) => team ? W - x : x;
    [0, 1].forEach(team => {
      const mk = (x, y, kind, lane, tier) => {
        const hp = kind === 'core' ? CORE_HP : tier === 0 ? TOWER_HP[0] : TOWER_HP[1];
        s.towers.push({ id: s.nid++, kind: 'tower', sub: kind, team, x: mir(x, team), y, px: mir(x, team), py: y, r: kind === 'core' ? 54 : 36, hp, maxHp: hp, armor: 30, range: kind === 'core' ? CORE_RANGE : TOWER_RANGE, sight: 750, alive: true, cd: 0, lane, tier, stack: 0, last: null, vx: 0, vy: 0 });
      };
      for (const lane of [0, 1]) { const f = y => lane ? H - y : y; mk(S(1500), f(S(345)), 'tower', lane, 0); mk(S(800), f(S(640)), 'tower', lane, 1); }
      mk(S(340), H / 2, 'core', -1, 2);
    });
    // Jungle: four quadrants, each with a small trio and one heavy
    for (const [mx, my] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const px = x => mx ? W - x : x, py = y => my ? H - y : y;
      s.camps.push({ id: s.camps.length, x: px(S(1130)), y: py(S(790)), big: false, at: 30, alive: false, side: mx });
      s.camps.push({ id: s.camps.length, x: px(S(1610)), y: py(S(830)), big: true, at: 45, alive: false, side: mx });
    }
    // Civilian sites: two per quadrant, nudged onto open ground if a position is walled.
    for (const [mx, my] of [[0, 0], [1, 0], [0, 1], [1, 1]]) for (const [x, y] of [[S(1440), S(690)], [S(1960), S(800)]]) {
      const f = nearestFree(s.map, mx ? W - x : x, my ? H - y : y);
      s.sites.push({ id: s.sites.length, x: f.x, y: f.y, alive: true, at: 0, prog: [0, 0], need: 2.5, con: {} });
    }
    initBosses(s);
    rebuildNav(s);
    s.practiceSide = Math.max(0, cfg.teams.findIndex(l => l.some(p => p.human)));
    cfg.teams.forEach((list, team) => {
      const fixed = list.map(p => Object.assign({}, p, { champ: sideKit(team, p.champ) })), roles = teamRoles(fixed);
      fixed.forEach((p, i) => {
      const champ = p.champ, k = KITS[champ], role = roles[i];
      const prof = (PROFS[role] || []).some(x => x.id === p.prof) ? p.prof : !p.human ? (PROFS[role] || [])[(hash01((cfg.seed || 7) + team * 17, i + 301) * 3 | 0)].id : PROFS[role][0].id;
      const build = k.builds.some(b => b.id === p.build) ? p.build : defaultBuild(champ, role, hash01((cfg.seed || 7) + team * 13, i + 101));
      const c = {
        id: s.nid++, kind: 'champ', team, slot: i, role, solo: false, atkPref: 0, champ, pname: p.name, tier: p.tier || 0, human: !!p.human, remote: !!p.remote, skill: p.skill, build, buildDef: k.builds.find(b => b.id === build),
        finish: p.finish, trail: p.trail, recall: p.recall, prof, targetPref: p.targetPref === 'pct' ? 'pct' : 'hp',
        x: mir(S(180), team), y: H / 2 + (i - 1.5) * 46, r: 26, sight: k.sight + (prof === 'longsight' ? 120 : 0), lvl: 1, xp: 0, gold: 300, up: { edge: 0, guard: 0, haste: 0 },
        hp: k.hp, maxHp: k.hp, armor: k.armor, mr: k.mr, dmgBase: k.dmg, range: k.range, msBase: k.ms, as: k.as, kit: k.kit, f: { [build]: 1 }, evolved: [-1, -1], items: Array(ITEM_SLOTS).fill(null), atkMode: 'champ', beacons: prof === 'pathfinder' ? 3 : 2, beaconT: 0, st: blankStats(),
        alive: true, respawn: 0, atkCd: 0, lock: 0, fx: team ? -1 : 1, fy: 0, cd: [0, 0, 0], recast: [0, 0, 0], q: [], mv: { x: 0, y: 0 }, atk: false,
        stunT: 0, slowT: 0, slowA: 0, markT: 0, parryT: 0, drT: 0, air: 0, buffT: 0, empowerT: 0, revealT: 0, rootT: 0, polyT: 0, knockT: 0, knockMax: 0, stealthT: 0, noHealT: 0, hasteT: 0, hasteA: 0, shieldHp: 0, shieldT: 0, vulnT: 0, dmarkT: 0, opener: 0, ripT: 0, curseN: 0, curseT: 0, poisonT: 0, poisonDps: 0, bleedT: 0, bleedDps: 0, pstack: 0, pready: 0, rage: 0, streak: 0, bounty: 0, potT: 0, elixT: 0, tonicT: 0, sentT: 0, dropT: 0, buybackCd: 0, fundCd: 0, cleanseCd: 0, dlog: [],
        vx: 0, vy: 0, assist: {}, charge: null, chan: null, dash: null, leap: null, cuts: null, duelZ: null, inBrush: -1, recentHit: 0,
        stats: { casts: 0, skillHits: 0, parries: 0, kills: 0, deaths: 0, assists: 0, dmg: 0, dealt: 0, taken: 0, healing: 0, gold: 0, towers: 0, objectives: 0, rescues: 0 },
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
  const blankStats = () => ({ dmg: 0, ad: 0, ap: 0, hp: 0, armor: 0, mr: 0, pen: 0, mpen: 0, vamp: 0, mon: 0, as: 0, ms: 0, cdr: 0, lifesteal: 0, healPow: 0, regen: 0, u: {} });
  function itemStats(c) { const st = blankStats(); for (const id of c.items) { if (!id) continue; const it = ITEM_BY[id]; for (const k in st) if (k !== 'u' && it[k]) st[k] += it[k]; if (it.u) for (const u of [].concat(it.u)) st.u[u] = 1; } st.cdr = Math.min(.45, st.cdr); return st; }
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
    const k = s.fog ? s.fog[team] : 1;
    for (const c of s.champs) if (c.team === team && c.alive) out.push({ x: c.x, y: c.y, r: (c.sight || 800) * k });
    for (const t of s.towers) if (t.team === team && t.alive) out.push({ x: t.x, y: t.y, r: (t.sight || 750) * k });
    for (const m of s.minions) if (m.team === team && m.alive && !(m.delay > 0)) out.push({ x: m.x, y: m.y, r: (m.sight || 500) * k });
    for (const b of s.beacons) if (b.team === team && b.alive) out.push({ x: b.x, y: b.y, r: b.sight * k });
    return cache.list[team] = out;
  }
  function canSee(s, team, u) {
    if (u.team === team || u.kind === 'tower' || u.revealT > 0) return true;
    if (u.stealthT > 0) return false;
    if (u.inBrush !== undefined && u.inBrush >= 0 && !s.champs.some(c => c.team === team && c.alive && c.inBrush === u.inBrush) && !s.beacons.some(b => b.alive && b.team === team && b.inBrush === u.inBrush)) return false;
    for (const v of visionSources(s, team)) if ((v.x - u.x) * (v.x - u.x) + (v.y - u.y) * (v.y - u.y) < v.r * v.r) return true;
    return false;
  }

  function heal(s, src, t, amt) { if (t.noHealT > 0) return; amt *= (1 + .15 * roleK(src, 'support')) * (1 + (src.st ? src.st.healPow : 0)) * (src.prof === 'guardian' ? 1.2 : 1); if (src.st && src.st.u.saintsbell && t !== src) t.bellT = 3; const a = Math.min(amt, t.maxHp - t.hp); t.hp += a; if (src.stats) src.stats.healing += a; if (a > 1) s.ev.push({ e: 'heal', u: t.id, a: Math.round(amt) }); }

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
    const champSrc = src && src.kind === 'champ', magic = champSrc && !o.basic && isMag(src);
    let res = magic ? (t.mr !== undefined ? t.mr : t.armor || 0) : (t.armor || 0);
    if (champSrc) res *= 1 - (magic ? src.st.mpen : src.st.pen);
    let a = amt * 100 / (100 + res);
    if (champSrc) {
      if (src.opener > 0 && t.kind === 'champ' && !o.dot) { a *= 1.6; o.crit = 1; src.opener = 0; }
      if (t.hp < t.maxHp * .35) { if (src.st.u.guillotine) a *= 1.28; else if (src.st.u.headsman) a *= 1.15; }
      if (t.dmarkT > 0 && t.markedBy === src.id) a *= 1.15;
      if (src.duelZ && src.duelZ.b === t) a *= src.duelZ.boost;
      if (t.vulnT > 0) a *= 1.25;
      if (src.team === s.hopeTeam) a *= 1.08;
      if (s.boons[src.team].warlord > 0) a *= o.basic ? 1.22 : 1.08;
      if (t.stringT > 0 && t.stringBy === src.team) a *= t.stringK || 1.08;
      if (src.bellT > 0) a *= 1.08;
      a *= uniqueOut(s, src, t, a, o);
    }
    if (t.drT > 0) a *= .7;
    if (t.kind === 'champ') {
      if (t.prof === 'ironclad' && s.towers.some(o2 => o2.alive && o2.team === t.team && dist(o2, t) < o2.range)) a *= .82;
      if (t.st.u.aegisprime && !o.basic && !o.dot && champSrc && !(t.aegAt > s.t)) { a *= .5; t.aegAt = s.t + 20; }
    }
    if (t.shellT > 0) a *= .55;
    for (const z of s.zones) if (z.kind === 'dome' && z.team === t.team && Math.hypot(z.x - t.x, z.y - t.y) < z.r) { a *= 1 - .25 * (1 + .15 * roleK(z.owner, 'support')); break; }
    if (t.kind === 'champ') for (const al of s.champs) if (al.team === t.team && al.alive && al.st.u.sanctum && al !== t && dist(al, t) < 350) { a *= al.st.u.sanctuary ? .85 : .92; break; }
    // Structures weaken late so a match always reaches an ending.
    if (t.kind === 'tower') a *= structureK(s);
    if (t.kind === 'tower' && src && src.kind === 'minion') a *= src.towerK || 1;
    if (s.practice && t.kind === 'tower') { s.ev.push({ e: 'hit', u: t.id, a: Math.round(a), sk: o.skill ? 1 : 0, crit: 0, by: src ? src.id : 0 }); return a; }
    if (t.kind === 'monster' && champSrc) {
      t.hitAt = s.t; if (!t.tgt) t.tgt = src; a *= (1 + .35 * roleK(src, 'jungle')) * (1 + src.st.mon) * (src.prof === 'predator' ? (t.boss ? 1.15 : 1.25) : 1) * (t.boss && src.st.u.sovereign ? 1.25 : 1);
      // Kill Strike: a monster dropping under 10% is finished on the spot.
      if (src.prof === 'killstrike' && !(src.strikeAt > s.t) && t.hp - a < t.maxHp * .1) { a = Math.max(a, t.hp + 1); src.strikeAt = s.t + (t.boss ? 30 : 10); heal(s, src, src, src.maxHp * .08); s.ev.push({ e: 'strike', u: src.id, x: t.x, y: t.y }); }
    }
    if (t.kind === 'tower' && champSrc && src.prof === 'demolisher') a *= 1.35;
    if (t.shieldHp > 0) { const ab = Math.min(t.shieldHp, a); t.shieldHp -= ab; a -= ab; }
    if (t.kind === 'champ' && t.st.u.archlich && a >= t.hp && !(t.lichAt > s.t)) { a = Math.max(0, t.hp - t.maxHp * .15); t.lichAt = s.t + 45; s.ev.push({ e: 'shield', u: t.id, a: Math.round(t.maxHp * .15) }); }
    t.hp -= a; if (t.kind === 'champ') t.lastHurt = s.t;
    if (t.kind === 'champ' && a > 0) { t.stats.taken += a; logDamage(s, src, t, a, o); }
    if (t.chan && t.chan.recall) t.chan = null;
    if (t.kind === 'champ') {
      for (const z of s.sites) if (z.con[t.id]) z.con[t.id] = 0;
      if (t.stealthT > 0) t.revealT = Math.max(t.revealT, .4);
      const K = KITS[t.champ]; if (K.onDamaged) K.onDamaged(s, t, a);
      if (t.st.u.bastion && t.hp < t.maxHp * .5 && t.hp > 0 && !(t.bastAt > s.t)) { t.bastAt = s.t + (t.st.u.citadel ? 20 : 30); shield(s, t, t.maxHp * (t.st.u.citadel ? .34 : .22), 4); }
      if (o.basic && src && src.kind === 'champ' && t.st.u.thorns && KITS[src.champ].melee) hurt(s, t, src, a * (t.st.u.thornwall ? .4 : .25) * (100 + src.armor) / 100, { dot: 1 });
    }
    if (champSrc) {
      src.stats.dmg += a; if (t.kind === 'champ') src.stats.dealt += a;
      if (!o.dot) { src.revealT = 1.2; if (t.kind === 'champ') { t.assist[src.id] = s.t; src.recentHit = s.t; } }
      if (o.basic && t.alive && t.kind === 'champ' && src.st.u.tempest) t.markT = Math.max(t.markT || 0, 1.5);
      if (src.st.lifesteal && !o.dot && (o.basic || !magic) && t.kind !== 'tower') heal(s, src, src, a * src.st.lifesteal * (t.kind === 'champ' ? 1 : .4));
      if (src.st.vamp && !o.dot && magic && t.kind !== 'tower') heal(s, src, src, a * src.st.vamp * (t.kind === 'champ' ? 1 : .4));
      if (src.lsBonus && o.basic && t.kind !== 'tower') heal(s, src, src, a * src.lsBonus);
      if (o.basic && src.st.u.cleave && !o.dot) for (const e of enemiesIn(s, src, t.x, t.y, 140)) if (e !== t) hurt(s, src, e, a * .25, { dot: 1 });
      if (o.basic && src.st.u.gunrunner && t.kind === 'champ') haste(src, .18, 1);
      if (!o.basic && !o.dot && src.st.u.worldburn && t.kind === 'champ' && t.alive) bleed(s, src, t, a * .12, 3);
      if (o.basic && src.prof === 'tempo' && t.kind === 'champ') { src.tempoN = Math.min(5, (src.tempoT > 0 ? src.tempoN || 0 : 0) + 1); src.tempoT = 3; }
      if (o.basic && src.st.u.bleed && t.kind === 'champ' && t.alive) bleed(s, src, t, 10 * pow(src), 2);
      if (t.kind === 'champ' && t.curseN > 0 && t.curseT > 0 && !o.dot && t.curseBy && t.curseBy.team === src.team && t.curseBy.f.jinx) heal(s, t.curseBy, src, a * .08);
    }
    s.ev.push({ e: 'hit', u: t.id, a: Math.round(a), sk: o.skill ? 1 : 0, crit: o.crit ? 1 : 0, by: src ? src.id : 0 });
    if (t.hp <= 0) kill(s, src, t);
    return a;
  }

  // Damage multipliers from legendary uniques and proficiencies, on hits by a champion.
  function uniqueOut(s, src, t, a, o) {
    const U = src.st.u; let k = 1, champ = t.kind === 'champ';
    if (U.deadshot && o.basic && t.hp > t.maxHp * .7) k *= 1.22;
    if (U.voidheart && !o.basic && t.hp > t.maxHp * .6) k *= 1.12;
    if (U.warbringer && src.hp < src.maxHp * .4) k *= 1.18;
    for (const al of s.champs) if (al.alive && al.team === src.team && al !== src && al.st.u.rally && dist(al, src) < 350) { k *= al.st.u.highbanner ? 1.12 : 1.06; break; }
    if (champ && !o.dot) {
      if (U.ambush) { if (s.t - (src.ambAt === undefined ? -99 : src.ambAt) > 6) k *= U.widow ? 1.4 : 1.25; src.ambAt = s.t; }
      if (src.prof === 'longsight') { if (s.t - (src.quietAt === undefined ? -99 : src.quietAt) > 4) k *= 1.25; src.quietAt = s.t; }
      if (src.prof === 'challenger' && src.solo) k *= 1.1;
      if (U.eclipse) { if (src.eclTgt !== t.id || s.t - src.eclAt > 2) { src.eclTgt = t.id; src.eclN = 0; } src.eclAt = s.t; if (++src.eclN >= 3) { src.eclN = 0; t.hp -= Math.min(t.hp - 1, t.maxHp * .07 * 100 / (100 + (t.mr || 0))); s.ev.push({ e: 'boom', x: t.x, y: t.y, r: 70, fx: 'break' }); } }
    }
    return k;
  }

  // Death recap: a rolling 15 second record of what hurt a champion, by source and ability.
  function logDamage(s, src, t, a, o) {
    const L = t.dlog; let name = 'Unknown', kind = 'other', kit, abil;
    if (src && src.kind === 'champ') { kind = 'champion'; kit = src.champ; name = charOf(src.team, src.champ).name; abil = o.basic ? 'Basic attack' : (curAbil || (o.dot ? 'Poison and bleed' : 'Ability')); }
    else if (src && src.kind === 'tower') { kind = 'tower'; name = src.sub === 'core' ? 'Core' : 'Tower'; }
    else if (src && src.kind === 'minion') { kind = 'minion'; name = src.heavy ? 'Heavy minion' : src.type === 'ranged' ? 'Ranged minion' : 'Minion'; }
    else if (src && src.kind === 'monster') { kind = 'monster'; name = src.bossKind ? BOSS_INFO[src.bossKind].name : (src.big ? 'Jungle brute' : 'Jungle pack'); }
    else if (!src) { name = 'Enemy fountain'; }
    L.push({ t: s.t, name, kind, kit, abil, dmg: a });
    if (L.length > 90 || (L.length > 20 && L[0].t < s.t - 15)) { while (L.length && L[0].t < s.t - 15) L.shift(); }
  }
  function sendRecap(s, c) {
    const map = {}; let total = 0;
    for (const e of c.dlog) { if (e.t < s.t - 15) continue; const k = e.name + '|' + (e.abil || '') + '|' + e.kind; if (!map[k]) map[k] = { name: e.name, kind: e.kind, kit: e.kit, abil: e.abil, dmg: 0 }; map[k].dmg += e.dmg; total += e.dmg; }
    const list = Object.values(map).sort((a, b) => b.dmg - a.dmg).slice(0, 8);
    for (const e of list) { e.dmg = Math.round(e.dmg); if (e.kit === undefined) delete e.kit; if (e.abil === undefined) delete e.abil; }
    c.dlog.length = 0;
    s.ev.push({ e: 'recap', u: c.id, list, total: Math.round(total) });
  }

  function giveXp(s, c, xp) {
    if (c.lvl >= MAX_LEVEL) return; if (c.solo) xp *= 1 + .2 * roleK(c, 'top'); xp *= 1 + .22 * (s.catchup ? s.catchup[c.team] : 0); c.xp += xp;
    while (c.lvl < MAX_LEVEL && c.xp >= xpNeed(c.lvl)) { c.xp -= xpNeed(c.lvl); c.lvl++; applyStats(c, true); s.ev.push({ e: 'level', u: c.id }); }
  }
  const xpNeed = l => 150 + 55 * (l - 1);
  function applyStats(c, keepFrac) {
    const k = KITS[c.champ], f = c.hp / c.maxHp, st = itemStats(c), b = (c.buildDef && c.buildDef.stats) || {};
    c.st = st;
    const lg = (c.lvl - 1) * LVL_G; c.maxHp = (k.hp + k.hpG * lg + st.hp) * (b.hp || 1) * (c.solo ? 1 + .08 * roleK(c, 'top') : 1) * (c.sentT > 0 ? 1.1 : 1);
    c.armor = k.armor + k.armG * lg + st.armor + (b.armor || 0); c.mr = k.mr + k.mrG * lg + st.mr + (b.mr || 0);
    c.dmgBase = (k.dmg + k.dmgG * lg) * (1 + st.dmg + st.ad) * (b.dmg || 1) * (c.elixT > 0 ? 1.15 : 1);
    c.msBase = k.ms + st.ms + (b.ms || 0);
    c.as = k.as * (1 + st.as) * (b.as || 1);
    c.range = Math.min(k.range + (b.range || 0), MAX_ATTACK_RANGE);
    if (keepFrac) c.hp = Math.max(1, c.maxHp * f);
  }
  // Catch-up pay for the side that has fallen behind.
  const earn = (s, c, g) => { g *= (1 + .34 * (s.catchup ? s.catchup[c.team] : 0)) * (s.boons[c.team].heist > 0 ? 1.25 : 1); c.gold += g; c.stats.gold += g; };
  // Paying a champion without catch-up multipliers: objectives, bounties and refunds already carry their own numbers.
  const pay = (s, c, g) => { c.gold += g; c.stats.gold += g; };
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
      sendRecap(s, t);
      t.deaths = (t.deaths || 0) + 1; t.stats.deaths++; if (t.bot) t.bot.deaths.push(s.t); t.respawn = 5 + t.lvl * 1.1 + s.t / 120 + Math.max(0, s.t - 780) / 22; t.respawn *= 1 - .22 * s.catchup[t.team]; t.chan = t.dash = t.charge = t.leap = null; t.air = 0; t.stealthT = 0; t.duelZ = null; t.shieldHp = 0;
      const bounty = t.bounty || 0; t.streak = 0; t.bounty = 0;
      if (s.practice) t.respawn = .6;
      s.kills[et]++;
      let multi = 1;
      if (src && src.kind === 'champ') { multi = s.t - (src.lastKill || -99) < 10 ? (src.multi || 1) + 1 : 1; src.multi = multi; src.lastKill = s.t; }
      const first = !s.firstBlood; s.firstBlood = true;
      if (src && src.kind === 'champ' && src.st.u.widow) haste(src, .35, 2.5);
      if (src && src.kind === 'champ') { src.streak = (src.streak || 0) + 1; src.bounty = bountyFor(src.streak); earn(s, src, KILL_GOLD + bounty); src.stats.kills++; giveXp(s, src, 120 + 16 * t.lvl); s.ev.push({ e: 'gold', u: src.id, a: KILL_GOLD + bounty }); }
      for (const id in t.assist) if (s.t - t.assist[id] < 9 && (!src || +id !== src.id)) { const a = s.champs.find(c => c.id === +id); if (a) { earn(s, a, ASSIST_GOLD * (a.prof === 'patron' ? 1.4 : 1)); a.stats.assists++; giveXp(s, a, 70); } }
      supportShare(s, src, t.x, t.y, ASSIST_GOLD, 70);
      t.assist = {};
      s.ev.push({ e: 'feed', a: src ? src.id : 0, b: t.id, multi, first, bounty });
    } else if (t.kind === 'minion') {
      const near = teamNear(s, et, t.x, t.y, 850);
      near.forEach(c => { giveXp(s, c, 42 / Math.max(1, near.length * .7)); if (c !== src) earn(s, c, 7); });
      if (src && src.kind === 'champ') { const g = Math.round((t.heavy ? 48 : t.type === 'ranged' ? 18 : 22) * (1 + .25 * roleK(src, 'bottom')) * (src.prof === 'harvester' ? 1.3 : 1)); earn(s, src, g); s.ev.push({ e: 'gold', u: src.id, a: g }); supportShare(s, src, t.x, t.y, 22, 28); }
    } else if (t.kind === 'monster') {
      if (t.boss) {
        bossDown(s, t, src);
      } else {
        const near = teamNear(s, src ? src.team : 0, t.x, t.y, 700);
        near.forEach(c => { giveXp(s, c, (t.big ? 130 : 44)); earn(s, c, (t.big ? 95 : 32) * (1 + .3 * roleK(c, 'jungle')) * (c.prof === 'tracker' ? 1.25 : 1)); if (c === src && c.st.u.forager) heal(s, c, c, c.maxHp * (t.big ? .1 : .04)); });
        supportShare(s, src, t.x, t.y, t.big ? 95 : 32, t.big ? 130 : 44);
        const camp = s.camps[t.camp]; camp.left--; if (camp.left <= 0) { camp.alive = false; camp.at = s.t + 70; }
      }
    } else if (t.kind === 'tower') {
      s.champs.filter(c => c.team === et).forEach(c => { pay(s, c, 140); giveXp(s, c, 70); if (c.alive && dist(c, t) < 900) c.stats.towers++; });
      rebuildNav(s);
      s.ev.push({ e: 'tower', team: t.team, sub: t.sub });
      if (t.sub === 'core') s.over = { winner: et, t: s.t };
    }
  }

  function spawnWave(s) {
    s.wave++;
    const scale = 1 + s.wave * .035 + Math.max(0, s.t - 780) / 140;
    for (const team of [0, 1]) for (const lane of [0, 1]) {
      const path = team ? [...s.map.lanes[lane]].reverse() : s.map.lanes[lane], reinf = s.reinforceQ[team][lane] > 0; if (reinf) s.reinforceQ[team][lane]--;
      const boonK = (s.boons[team].foreman > 0 ? 1.4 : 1) * (reinf ? 1.35 : 1), n = 4 + (s.wave % 3 === 0 ? 1 : 0) + (reinf ? 2 : 0);
      for (let i = 0; i < n; i++) {
        // Two melee, two ranged, a heavy every third wave; reinforcements add heavies at the back.
        const type = i < 2 ? 'melee' : i < 4 ? 'ranged' : 'heavy', T = MINION_TYPES[type], x = path[0][0] + (s.rand() - .5) * 30, y = path[0][1] + (s.rand() - .5) * 30 + i * 8;
        const hp = T.hp * scale * boonK;
        s.minions.push({ id: s.nid++, kind: 'minion', type, heavy: type === 'heavy', team, lane, x, y, px: x, py: y, r: T.r, sight: 500, hp, maxHp: hp, armor: T.armor, dmg: T.dmg * scale * boonK, towerK: T.towerK, range: T.range, ranged: type === 'ranged', ms: T.ms, as: T.as, alive: true, cd: 0, wp: 1, path, stunT: 0, slowT: 0, slowA: 0, markT: 0, vx: 0, vy: 0, delay: i * .45, fx: team ? -1 : 1, fy: 0 });
      }
    }
  }
  const CAMP_LEASH = 280, BOSS_LEASH = 450, MINION_LEASH = 210;
  const KILL_GOLD = 320, ASSIST_GOLD = 170, bountyFor = streak => streak >= 2 ? Math.min(560, 110 * (streak - 1)) : 0;
  const TOWER_HP = [2050, 2600], CORE_HP = 4700;
  const MINION_TYPES = {
    melee: { hp: 400, dmg: 22, range: 88, ms: 215, as: .9, armor: 10, r: 17, towerK: 1.1 },
    ranged: { hp: 270, dmg: 28, range: 250, ms: 215, as: .9, armor: 10, r: 14, towerK: 1.1 },
    heavy: { hp: 1050, dmg: 40, range: 110, ms: 165, as: .7, armor: 45, r: 25, towerK: 3.4 },
  };
  function spawnCamp(s, camp) {
    camp.alive = true; const n = camp.big ? 1 : 3; camp.left = n;
    for (let i = 0; i < n; i++) {
      const a = i * 2.1, off = camp.big ? 0 : 55, hp = (camp.big ? 1050 : 400) * (1 + s.t / 900);
      const x = camp.x + Math.cos(a) * off, y = camp.y + Math.sin(a) * off;
      s.monsters.push({ id: s.nid++, kind: 'monster', team: 2, camp: camp.id, big: camp.big, x, y, px: x, py: y, hx: x, hy: y, r: camp.big ? 32 : 19, leash: CAMP_LEASH, hp, maxHp: hp, armor: 18, dmg: (camp.big ? 44 : 20) * (1 + s.t / 900), range: 110, ms: 260, as: .9, alive: true, cd: 0, tgt: null, stunT: 0, slowT: 0, slowA: 0, markT: 0, vx: 0, vy: 0, fx: 1, fy: 0 });
    }
  }
  // ---------- bosses ----------
  const BOSS_FIRST = { warlord: 300, foreman: 390, sentinel: 480, colossus: 780 };
  const BOSS_RESPAWN = { warlord: 240, foreman: 260, sentinel: 280, colossus: 330 };
  const BOSS_STATS = {
    warlord: { name: 'The Warlord', hp: 3900, armor: 40, dmg: 120, range: 150, ms: 190, as: .85, r: 46, fxSlam: 'crash', slamEvery: 3.4, slamR: 130, slamDmg: 170, slamDelay: .8 },
    foreman: { name: 'The Foreman', hp: 4400, armor: 45, dmg: 96, range: 175, ms: 170, as: .7, r: 50, fxSlam: 'stomp', slamEvery: 4.5, slamR: 250, slamDmg: 120, slamDelay: 1.1 },
    sentinel: { name: 'The Sentinel', hp: 4800, armor: 55, dmg: 90, range: 170, ms: 160, as: .75, r: 50, fxSlam: 'dome', slamEvery: 6, slamR: 210, slamDmg: 100, slamDelay: .9 },
    colossus: { name: 'The Colossus', hp: 8200, armor: 50, dmg: 150, range: 180, ms: 170, as: .7, r: 58, fxSlam: 'crash', slamEvery: 4, slamR: 170, slamDmg: 200, slamDelay: 1 },
  };
  const BOSS_INFO = {
    warlord: { name: 'The Warlord', d: 'Team-wide bonus attack damage for 2 minutes.', boon: 'warlord' },
    foreman: { name: 'The Foreman', d: 'Your minions spawn stronger for 2 minutes.', boon: 'foreman' },
    sentinel: { name: 'The Sentinel', d: 'Team-wide shield and bonus max health for 2 minutes.', boon: 'sentinel' },
    colossus: { name: 'The Colossus', d: 'Late-game titan. Team-wide damage for 2 minutes and a huge bounty.', boon: 'colossus' },
  };
  const BOON_T = 120, blankBoons = () => ({ warlord: 0, foreman: 0, sentinel: 0, colossus: 0, heist: 0, convoy: 0, blackout: 0, drop: 0 });
  const BOON_INFO = {
    warlord: { name: 'Warlord', d: '+22% basic attack, +8% ability damage.' }, foreman: { name: 'Foreman', d: 'Minions spawn with 40% more health and damage.' }, sentinel: { name: 'Sentinel', d: 'Shield every 20s and 10% more max health.' },
    colossus: { name: 'Colossus', d: '+20% damage, +5% move speed.' }, heist: { name: 'Bank Heist', d: '+25% gold income.' }, convoy: { name: 'Rescue Convoy', d: '+10% move speed.' },
    blackout: { name: 'Lights On', d: 'See farther while the enemy stumbles in the dark.' }, drop: { name: 'Supply Drop', d: '+10% damage.' },
  };
  function initBosses(s) {
    s.bosses = ['warlord', 'foreman', 'sentinel', 'colossus'].map(kind => { const a = s.map.arenas.find(x => x.kind === kind); return { kind, name: BOSS_STATS[kind].name, x: a.x, y: a.y, r: a.r, at: BOSS_FIRST[kind], up: false, id: 0 }; });
  }
  function spawnBoss(s, B) {
    const S2 = BOSS_STATS[B.kind], k = 1 + s.t / 1200;
    if (B.kind === 'sentinel') {
      // The Sentinel rises on the trailing side's half, on an even game it alternates.
      const list = s.map.arenas.filter(x => x.kind === 'sentinel'); let side = (B.flip = (B.flip || 0) + 1) % 2;
      if (s.catchup[0] > .1) side = 0; else if (s.catchup[1] > .1) side = 1;
      const a = list.find(x => x.side === side) || list[0]; B.x = a.x; B.y = a.y;
    }
    const hp = S2.hp * k, x = B.x, y = B.y;
    const m = { id: s.nid++, kind: 'monster', team: 2, boss: true, bossKind: B.kind, x, y, px: x, py: y, hx: x, hy: y, r: S2.r, leash: Math.max(BOSS_LEASH, B.r), hp, maxHp: hp, armor: S2.armor, dmg: S2.dmg, range: S2.range, ms: S2.ms, as: S2.as, alive: true, cd: 0, slam: S2.slamEvery * .7, tgt: null, stunT: 0, slowT: 0, slowA: 0, markT: 0, vx: 0, vy: 0, fx: 1, fy: 0 };
    s.monsters.push(m); B.up = true; B.id = m.id; B.at = 0;
    if (B.kind === 'colossus') s.bossUp = true;
    s.ev.push({ e: 'bossup', kind: B.kind });
  }
  function grantBoon(s, team, kind, secs) { const had = s.boons[team][kind] > 0; s.boons[team][kind] = secs; if (!had) s.ev.push({ e: 'boon', team, kind, on: true }); }
  function bossDown(s, m, src) {
    const team = src && src.team !== 2 ? src.team : 0, B = s.bosses.find(b => b.kind === m.bossKind);
    if (B) { B.up = false; B.id = 0; B.at = s.t + BOSS_RESPAWN[B.kind]; }
    for (const c of s.champs) if (c.team === team) { pay(s, c, m.bossKind === 'colossus' ? 200 : 130); giveXp(s, c, m.bossKind === 'colossus' ? 200 : 140); if (Math.hypot(c.x - m.x, c.y - m.y) < 1000) c.stats.objectives++; }
    grantBoon(s, team, m.bossKind, BOON_T);
    if (m.bossKind === 'colossus') { s.buff[team] = 1; s.bossAt = s.t + BOSS_RESPAWN.colossus; s.bossUp = false; for (const c of s.champs) if (c.team === team) c.buffT = BOON_T; }
    if (m.bossKind === 'sentinel') for (const c of s.champs) if (c.team === team) { c.sentT = BOON_T; applyStats(c, true); if (c.alive) shield(s, c, c.maxHp * .12, 10); }
    s.ev.push({ e: 'boss', team, kind: m.bossKind });
  }
  // Timers: boons run down, Sentinel keeps refreshing its shield, a boon ending is announced.
  function stepBoons(s) {
    for (const team of [0, 1]) { const B = s.boons[team]; for (const k in B) if (B[k] > 0) { B[k] -= DT; if (B[k] <= 0) { B[k] = 0; s.ev.push({ e: 'boon', team, kind: k, on: false }); } } }
    if (s.tick % 600 === 0) for (const c of s.champs) if (c.alive && c.sentT > 0) shield(s, c, c.maxHp * .08, 8);
  }

  // ---------- map events ----------
  const EVENT_FIRST = 180, EVENT_EVERY = 120, EVENT_WARN = 10;
  const EVENT_INFO = {
    heist: { name: 'Bank Heist', d: 'Villains rob the vault while Heroes guard it. Hold it uncontested to fill your bar first.', boon: 'heist', live: 42, need: 1, gold: 130, hope: 6 },
    convoy: { name: 'Rescue Convoy', d: 'Heroes walk the civilians along the river road. Villains stop them.', boon: 'convoy', live: 72, gold: 150, hope: 8 },
    blackout: { name: 'Blackout', d: 'The lights fail. Whoever restarts the generator keeps their sight.', boon: 'blackout', live: 45, need: 1, gold: 100, hope: 4 },
    drop: { name: 'Supply Drop', d: 'A crate is falling. It pays whoever claims it.', boon: 'drop', live: 50, need: 1, gold: 180, hope: 3 },
  };
  function shuffled(s, list) { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = s.rand() * (i + 1) | 0; const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function nextEventKind(s) {
    if (!s.eventOrder.length) { s.eventOrder = shuffled(s, ['heist', 'convoy', 'blackout', 'drop']); }
    return s.eventOrder.shift();
  }
  function startEvent(s) {
    const kind = nextEventKind(s), I = EVENT_INFO[kind], spots = s.map.eventSpots;
    s.eventI++;
    const P = kind === 'convoy' ? { x: s.map.convoyPath[0][0], y: s.map.convoyPath[0][1] } : spots[(s.eventI * 2 + (s.rand() * 2 | 0)) % spots.length];
    s.event = { kind, phase: 'warn', t: EVENT_WARN, total: EVENT_WARN, x: P.x, y: P.y, r: kind === 'convoy' ? 210 : kind === 'heist' ? 190 : 170, prog: [0, 0], hp: kind === 'convoy' ? 100 : 0, i: 1, winner: -1 };
    s.ev.push({ e: 'mapevent', kind, phase: 'warn', team: -1, x: P.x, y: P.y });
  }
  function eventWon(s, team) {
    const E = s.event, I = EVENT_INFO[E.kind]; E.winner = team;
    s.ev.push({ e: 'mapevent', kind: E.kind, phase: 'end', team, x: E.x, y: E.y });
    if (team >= 0) {
      for (const c of s.champs) if (c.team === team) { pay(s, c, I.gold); giveXp(s, c, 110); if (c.alive && Math.hypot(c.x - E.x, c.y - E.y) < E.r + 500) c.stats.objectives++; }
      grantBoon(s, team, I.boon, BOON_T);
      setHope(s, s.hope + (team ? -I.hope : I.hope));
      if (E.kind === 'drop') for (const c of s.champs) if (c.team === team) c.dropT = BOON_T;
      if (E.kind === 'blackout') for (const c of s.champs) if (c.team !== team && c.alive && Math.hypot(c.x - E.x, c.y - E.y) < 1400) c.revealT = Math.max(c.revealT || 0, 3);
    }
    s.event = null;
  }
  function stepEvent(s) {
    const E = s.event;
    if (!E) { if (s.t >= s.eventAt) { s.eventAt += EVENT_EVERY; startEvent(s); } return; }
    E.t -= DT;
    if (E.phase === 'warn') {
      if (E.t <= 0) { E.phase = 'live'; E.t = E.total = EVENT_INFO[E.kind].live; s.ev.push({ e: 'mapevent', kind: E.kind, phase: 'start', team: -1, x: E.x, y: E.y }); }
      return;
    }
    let n0 = 0, n1 = 0;
    for (const c of s.champs) if (c.alive && !c.air && Math.hypot(c.x - E.x, c.y - E.y) < E.r) { if (c.team) n1++; else n0++; }
    const rate = (n, base) => n ? (base * (1 + (n - 1) * .35)) * DT : 0;
    if (E.kind === 'heist') {
      // A race with equal terms: villains fill the vault bar by robbing, heroes fill theirs by guarding uncontested.
      if (n1 && !n0) E.prog[1] += rate(n1, 1 / 14); else if (n0 && !n1) E.prog[0] += rate(n0, 1 / 14);
      if (E.prog[1] >= 1) return eventWon(s, 1);
      if (E.prog[0] >= 1) return eventWon(s, 0);
      if (E.t <= 0) return eventWon(s, E.prog[0] > E.prog[1] ? 0 : E.prog[1] > E.prog[0] ? 1 : -1);
    } else if (E.kind === 'convoy') {
      const path = s.map.convoyPath, wp = path[E.i], n = norm(wp[0] - E.x, wp[1] - E.y), sp = (n0 && !n1 ? 62 : !n1 ? 30 : n1 && !n0 ? 0 : 24) * DT;
      if (n.l <= sp) { E.i++; if (E.i >= path.length) return eventWon(s, 0); } else { E.x += n.x * sp; E.y += n.y * sp; }
      if (n1 && !n0) E.hp = Math.max(0, E.hp - (100 / 16) * (1 + (n1 - 1) * .35) * DT);
      if (E.hp <= 0) return eventWon(s, 1);
      if (E.t <= 0) return eventWon(s, E.i >= 3 ? 0 : 1); // past the midpoint, the people made it far enough
    } else {
      const base = E.kind === 'drop' ? 1 / 5 : 1 / 5.5;
      if (n0 && !n1) E.prog[0] += rate(n0, base); else if (n1 && !n0) E.prog[1] += rate(n1, base);
      if (!n0 && E.prog[0] > 0) E.prog[0] = Math.max(0, E.prog[0] - DT * .2);
      if (!n1 && E.prog[1] > 0) E.prog[1] = Math.max(0, E.prog[1] - DT * .2);
      if (E.prog[0] >= 1) return eventWon(s, 0);
      if (E.prog[1] >= 1) return eventWon(s, 1);
      if (E.t <= 0) return eventWon(s, -1);
    }
  }
  function stepFog(s) {
    const E = s.event, dark = E && E.kind === 'blackout' && E.phase === 'live';
    for (const t of [0, 1]) s.fog[t] = (dark ? .5 : 1) * (s.boons[t].blackout > 0 ? 1.15 : 1);
    if (dark) s.vis && (s.vis.tick = -1);
  }

  // ---------- economy: buyback, reinforcements, fund the city, surrender ----------
  const buybackCost = (s, c) => Math.round(160 + s.t * .55 + (c.stats.kills || 0) * 22);
  const reinforceCost = (s, c) => Math.round(280 + s.t * .22);
  const fundCost = (s, team) => 220 + 80 * s.fund[team];
  const FUND_HOPE = 4, REINFORCE_CD = 45, BUYBACK_CD = 150, VOTE_T = 30, VOTE_CD = 90, SURRENDER_AT = 600;
  function buyback(s, c) {
    if (c.alive || c.buybackCd > 0 || s.practice) return false;
    const cost = buybackCost(s, c); if (c.gold < cost) return false;
    c.gold -= cost; c.buybackCd = BUYBACK_CD; c.respawn = 0; c.bought = true;
    s.ev.push({ e: 'buyback', u: c.id }); return true;
  }
  function reinforce(s, c, lane) {
    lane = lane ? 1 : 0;
    if (s.t < s.reinforceAt[c.team]) return false;
    const cost = reinforceCost(s, c); if (c.gold < cost) return false;
    c.gold -= cost; s.reinforceAt[c.team] = s.t + REINFORCE_CD; s.reinforceQ[c.team][lane]++;
    s.ev.push({ e: 'reinforce', u: c.id, team: c.team, lane }); return true;
  }
  function fund(s, c) {
    if (c.fundCd > 0) return false;
    const cost = fundCost(s, c.team); if (c.gold < cost) return false;
    c.gold -= cost; c.fundCd = 15; s.fund[c.team]++; setHope(s, s.hope + (c.team ? -FUND_HOPE : FUND_HOPE));
    s.ev.push({ e: 'fund', u: c.id, team: c.team, a: FUND_HOPE }); return true;
  }
  // Surrender is decided by the people on a team: a majority of its humans. Bots neither vote nor count.
  const voters = (s, team) => s.champs.filter(o => o.team === team && o.human);
  const votesNeeded = n => Math.floor(n / 2) + 1;
  function surrenderVote(s, c, vote) {
    const team = c.team;
    if (!c.human || s.t < SURRENDER_AT || s.over || s.t < s.voteCd[team]) return false;
    let V = s.votes[team];
    if (!V) { if (!vote) return false; V = s.votes[team] = { yes: [], no: [], t: VOTE_T }; s.ev.push({ e: 'surrender', team, phase: 'open', yes: 0, no: 0, need: votesNeeded(voters(s, team).length) }); }
    if (V.yes.includes(c.id) || V.no.includes(c.id)) return false;
    (vote ? V.yes : V.no).push(c.id);
    checkVote(s, team); return true;
  }
  function checkVote(s, team) {
    const V = s.votes[team]; if (!V) return;
    // Recounted every time, so a player who drops (their seat becomes a bot) stops counting.
    const list = voters(s, team), ids = list.map(o => o.id), n = list.length, need = votesNeeded(n);
    V.yes = V.yes.filter(id => ids.includes(id)); V.no = V.no.filter(id => ids.includes(id));
    if (n && V.yes.length >= need) { s.ev.push({ e: 'surrender', team, phase: 'pass', yes: V.yes.length, no: V.no.length, need }); s.votes[team] = null; s.over = { winner: 1 - team, t: s.t, surrender: true }; }
    else if (!n || V.no.length > n - need || V.t <= 0) { s.ev.push({ e: 'surrender', team, phase: 'fail', yes: V.yes.length, no: V.no.length, need }); s.votes[team] = null; s.voteCd[team] = s.t + VOTE_CD; }
  }
  function stepVotes(s) { for (const team of [0, 1]) { const V = s.votes[team]; if (V) { V.t -= DT; checkVote(s, team); } } }

  // ---------- the people ----------
  const HOPE_DRIFT = .012, SITE_R = 130, SITE_GOLD = 45, SITE_RESPAWN = 60;
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
    z.alive = false; z.at = s.t + SITE_RESPAWN; z.prog[0] = z.prog[1] = 0; z.con = {};
    const inside = s.champs.filter(c => c.team === team && c.alive && Math.hypot(c.x - z.x, c.y - z.y) < SITE_R);
    s.ev.push({ e: 'civ', team, x: z.x, y: z.y, id: z.id, n: inside.length });
    setHope(s, s.hope + (team ? -6 : 6));
    for (const c of s.champs) {
      if (c.team !== team || !c.alive) continue;
      if (inside.includes(c)) { pay(s, c, SITE_GOLD); giveXp(s, c, 60); c.stats.rescues++; s.ev.push({ e: 'gold', u: c.id, a: SITE_GOLD }); }
      else if (Math.hypot(c.x - z.x, c.y - z.y) < 850) { pay(s, c, 15); giveXp(s, c, 20); }
    }
  }
  // Standing in a ring with no enemy in it builds progress. Stepping out drains it,
  // an enemy in the ring freezes it, and taking damage clears that champion's share.
  function stepSites(s) {
    for (const z of s.sites) {
      if (!z.alive) { if (s.t >= z.at) { z.alive = true; z.prog[0] = z.prog[1] = 0; z.con = {}; } continue; }
      let n0 = 0, n1 = 0;
      for (const c of s.champs) if (c.alive && !c.air && Math.hypot(c.x - z.x, c.y - z.y) < SITE_R) { if (c.team) n1++; else n0++; }
      z.prog[0] = z.prog[1] = 0;
      for (const c of s.champs) {
        const here = c.alive && !c.air && Math.hypot(c.x - z.x, c.y - z.y) < SITE_R, foes = c.team ? n0 : n1;
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
    const champ = quickTarget(s, c, r); if (champ) return champ;
    if (c.preferTower) { const t = structure(); if (t) return t; }
    // Then the surroundings: lane minions and towers in a lane, monsters in the jungle.
    const lowest = list => { let b = null, bh = 1e9; for (const m of list) { if (!m.alive || m.air || m.team === c.team || m.delay > 0 || dist(c, m) - m.r >= r || !hasLOS(c.x, c.y, m.x, m.y)) continue; const v = m.hp * 100 / (100 + (m.armor || 0)); if (v < bh) { bh = v; b = m; } } return b; };
    const beacon = () => { let b = null, bd = r; for (const x of s.beacons) if (x.alive && x.team !== c.team && canSee(s, c.team, x)) { const d = dist(c, x) - x.r; if (d < bd && hasLOS(c.x, c.y, x.x, x.y)) { bd = d; b = x; } } return b; };
    if (inJungle(s, c)) return lowest(s.monsters) || lowest(s.minions) || beacon() || structure();
    return lowest(s.minions) || beacon() || structure() || lowest(s.monsters);
  }
  // Which ground a unit stands on, for targeting: within reach of a lane road is lane, otherwise jungle. Bases count as lane.
  const inJungle = (s, u) => laneDist(s, 0, u.x, u.y) > 300 && laneDist(s, 1, u.x, u.y) > 300 && dist(u, s.fountains[0]) > 700 && dist(u, s.fountains[1]) > 700;
  // The enemy champion a tap should go to: lowest health in reach, by value or by share, per c.targetPref.
  function quickTarget(s, c, r) {
    let best = null, bv = 1e12; const pct = c.targetPref === 'pct';
    for (const e of s.champs) { if (!e.alive || e.air || e.team === c.team || !canSee(s, c.team, e) || dist(c, e) - e.r >= r || !hasLOS(c.x, c.y, e.x, e.y)) continue; const v = pct ? e.hp / e.maxHp : e.hp; if (v < bv) { bv = v; best = e; } }
    return best;
  }

  function tryCast(s, c, q) {
    const a = c.kit[q.slot]; if (!a) return;
    // A press landing during a short lockout is held a moment and fires when it clears, so inputs never feel eaten.
    const busy = c.stunT > 0 || c.air || c.chan || (c.dash && (c.dash.forced || !a.recast));
    if (busy) { if (!c.bot && !(c.chan && c.chan.recall)) c.qHold = { q, until: s.t + .22 }; return; }
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
    // Over-the-wall leaps skip the line of sight clamp above, so keep every landing point on the map.
    if (a.shape === 'circle') { aim.tx = clamp(aim.tx, 60, W - 60); aim.ty = clamp(aim.ty, 130, H - 130); }
    // Press time feedback: the cast event always fires on the press, before any wind-up or travel.
    const says = extra => { s.ev.push(Object.assign({ e: 'cast', u: c.id, fx: a.fx, dx, dy, slot: q.slot }, extra)); };
    curAbil = a.name;
    if (c.recast[q.slot] > 0 && a.recast) { c.recast[q.slot] = 0; a.recast(s, c, aim, a); curAbil = null; if (!a.keepStealth) breakStealth(s, c); c.fx = dx; c.fy = dy; says(); return; }
    // A remote player's press can land a hair before the host's cooldown ends. Hold it for that moment rather than drop it.
    if (c.cd[q.slot] > 0) { curAbil = null; if (c.cd[q.slot] < .22 && !c.bot) c.qHold = { q, until: s.t + .3 }; return; }
    if (a.cast(s, c, aim, a) === false) { curAbil = null; return; }
    if (c.leap && !c.leap.abil) c.leap.abil = a.name;
    if (c.cuts && !c.cuts.abil) c.cuts.abil = a.name;
    curAbil = null;
    if (!a.keepStealth) breakStealth(s, c);
    c.cd[q.slot] = Math.max(c.cd[q.slot], cdOf(c, q.slot));
    c.stats.casts++; c.fx = dx; c.fy = dy; c.spin = 1;
    if (c.chan && c.chan.recall) c.chan = null;
    if (c.st.u.phase) haste(c, c.st.u.ghoststep ? .28 : .15, c.st.u.ghoststep ? 2 : 1.5);
    says();
  }

  // One tick of walking from c.mv. Shared with the guest's local prediction, so both agree.
  function walk(s, c) {
    const m = Math.min(1, Math.hypot(c.mv.x, c.mv.y));
    if (m > .05) {
      const n = norm(c.mv.x, c.mv.y); let sp = c.msBase * (c.slowT > 0 ? 1 - c.slowA : 1) * (c.hasteT > 0 ? 1 + c.hasteA : 1);
      if (c.charge) sp *= .6; if (c.buffT > 0) sp *= 1.05; if (c.prof === 'tracker' && inJungle(s, c)) sp *= 1.12; if (s.boons[c.team].convoy > 0) sp *= 1.1;
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
      c.respawn -= DT; if (c.buybackCd > 0) c.buybackCd -= DT; if (c.fundCd > 0) c.fundCd -= DT; if (c.cleanseCd > 0) c.cleanseCd -= DT;
      // Team boosts and elixirs run on real time, matching s.boons.
      if (c.buffT > 0) c.buffT -= DT; if (c.dropT > 0) c.dropT -= DT;
      if (c.sentT > 0) { c.sentT -= DT; if (c.sentT <= 0) applyStats(c, false); }
      if (c.elixT > 0) { c.elixT -= DT; if (c.elixT <= 0) applyStats(c, false); }
      if (c.respawn <= 0) {
        c.alive = true; c.hp = c.maxHp; c.spawnT = s.t; const f = s.fountains[c.team]; c.x = c.px = f.x + (c.team ? -50 : 50); c.y = c.py = f.y + (c.slot - 1.5) * 40; c.q.length = 0; c.stunT = c.slowT = c.markT = c.rootT = c.polyT = c.curseT = c.curseN = c.poisonT = c.bleedT = 0; c.potT = 0; c.overT = c.frenzyT = c.altN = c.tempoT = c.stringT = c.kindleT = 0; c.cd[0] = c.cd[1] = c.cd[2] = 0; c.recast[0] = c.recast[1] = c.recast[2] = 0; c.echo = null;
        if (c.dummy) { c.x = c.px = c.hx; c.y = c.py = c.hy; }
        s.ev.push({ e: 'spawn', u: c.id });
      }
      return;
    }
    for (const k of STATUS_T) if (c[k] > 0) c[k] -= DT;
    if (c.buybackCd > 0) c.buybackCd -= DT; if (c.fundCd > 0) c.fundCd -= DT; if (c.cleanseCd > 0) c.cleanseCd -= DT;
    if (c.potT > 0) { c.potT -= DT; if (!(c.noHealT > 0)) c.hp = Math.min(c.maxHp, c.hp + c.potHps * DT); }
    if (c.elixT > 0) { c.elixT -= DT; if (c.elixT <= 0) applyStats(c, true); }
    if (c.tonicT > 0) { c.tonicT -= DT; haste(c, .2, .1); }
    if (c.sentT > 0) { c.sentT -= DT; if (c.sentT <= 0) applyStats(c, true); }
    if (c.shieldT <= 0) c.shieldHp = 0;
    if (c.curseT <= 0) c.curseN = 0;
    for (let i = 0; i < 3; i++) { if (c.cd[i] > 0) c.cd[i] -= DT; if (c.recast[i] > 0) c.recast[i] -= DT; }
    if (c.atkCd > 0) c.atkCd -= DT;
    if (c.reap) { c.reap.t -= DT; if (c.reap.t <= 0) c.reap = null; }
    if (c.charge) { c.charge.t += DT * (c.stunT > 0 ? 0 : 1); if (c.charge.t > 4 || c.stunT > 0) c.charge = null; }
    { const bm = c.prof === 'pathfinder' ? 3 : 2; if (c.beacons < bm) { c.beaconT -= c.prof === 'pathfinder' ? DT * 2 : DT; if (c.beaconT <= 0) { c.beacons++; c.beaconT = c.beacons < bm ? BEACON_CD : 0; } } }
    const K = KITS[c.champ]; if (K.tick) K.tick(s, c);
    if (c.qHold) { const h = c.qHold; if (s.t > h.until) c.qHold = null; else if (c.cd[h.q.slot] <= 0 && !(c.stunT > 0 || c.air || c.chan || c.dash)) { c.qHold = null; tryCast(s, c, h.q); } }

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
        const t = s.champs.find(e => e.id === C.id); curAbil = C.abil;
        if (!t || !t.alive || C.n <= 0) { c.cuts = null; c.air = 0; pushOut(s.map, c); }
        else {
          const an = s.rand() * 6.28, f = nearestFree(s.map, t.x + Math.cos(an) * 70, t.y + Math.sin(an) * 70);
          s.ev.push({ e: 'blink', x: c.x, y: c.y }); c.x = f.x; c.y = f.y; C.n--; C.next = .15;
          const last = C.n === 0; let d = C.A.dmg * pow(c); if (last && c.f.finishing) d += (t.maxHp - t.hp) * .15;
          const nf = norm(t.x - c.x, t.y - c.y); c.fx = nf.x; c.fy = nf.y;
          const air = c.air; c.air = 0; hurt(s, c, t, d, { skill: 1, crit: last ? 1 : 0 }); if (c.f.butcher) for (const o of enemiesIn(s, c, t.x, t.y, 170)) if (o !== t) hurt(s, c, o, d * .55, { skill: 1 }); c.air = air;
        }
        curAbil = null;
      }
    } else if (c.leap) {
      const L = c.leap; L.t += DT; const f = Math.min(1, L.t / L.total);
      c.x = L.sx + (L.tx - L.sx) * f; c.y = L.sy + (L.ty - L.sy) * f; c.z = Math.sin(f * Math.PI) * 150; c.air = Math.max(0, L.total - L.t + .001);
      if (f >= 1) { c.leap = null; c.air = 0; c.z = 0; pushOut(s.map, c); curAbil = L.abil; L.fn(s, c); curAbil = null; }
    } else if (c.dash) {
      const D = c.dash; const step = Math.min(DT, D.t); c.x += D.vx * step; c.y += D.vy * step; D.t -= DT;
      if (D.onHit) {
        const test = t => { if (!c.dash || !t.alive || t.air || t.team === c.team || D.hits.has(t.id)) return; if (Math.hypot(t.x - c.x, t.y - c.y) < c.r + t.r + 22) { D.hits.add(t.id); curAbil = D.abil; D.onHit(s, c, t); curAbil = null; } };
        s.champs.forEach(test); if (!D.champOnly) { s.minions.forEach(test); s.monsters.forEach(test); }
      }
      if (D.t <= 0) c.dash = null;
      pushOut(s.map, c);
    } else if (c.chan) {
      c.chan.t -= DT;
      if (c.stunT > 0) c.chan = null;
      else if (c.chan.recall && (c.mv.x || c.mv.y)) c.chan = null;
      else if (c.chan.t <= 0) { const ch = c.chan; c.chan = null; curAbil = ch.slot !== undefined ? c.kit[ch.slot].name : null; ch.fn(s, c); curAbil = null; }
    } else if (c.stunT <= 0 && c.lock <= 0 && c.rootT <= 0) walk(s, c);
    towerPush(s, c);
    // A duel ring holds both fighters in.
    if (c.duelZ) { const z = c.duelZ; if (z.dead || z.t <= 0) c.duelZ = null; else { const n = norm(c.x - z.x, c.y - z.y); if (n.l > z.r - c.r) { c.x = z.x + n.x * (z.r - c.r); c.y = z.y + n.y * (z.r - c.r); pushOut(s.map, c); } } }

    // basic attack
    if (c.atk && !(c.polyT > 0) && c.stunT <= 0 && !c.air && !c.dash && !c.chan && !c.charge && c.atkCd <= 0) {
      const t = autoTarget(s, c);
      if (t) {
        c.atkCd = 1 / (c.as * (1 + (c.asBonus || 0) + (c.tempoT > 0 ? (c.tempoN || 0) * .06 : 0))); c.lock = .08; const n = norm(t.x - c.x, t.y - c.y); c.fx = n.x; c.fy = n.y; c.revealT = 1;
        const o = { dmg: c.dmgBase * (c.buffT > 0 ? 1.2 : 1) * (c.dropT > 0 ? 1.1 : 1), crit: false, empowered: c.empowerT > 0 };
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
    earn(s, c, 2.6 * DT * (c.prof === 'patron' ? 1.6 : 1));
    if (c.st.u.worldtree && s.t - (c.lastHurt === undefined ? -9 : c.lastHurt) > 5 && !(c.noHealT > 0)) c.hp = Math.min(c.maxHp, c.hp + c.maxHp * .04 * DT);
    if (c.st.u.stormgreaves) { const cc = c.stunT > 0 || c.rootT > 0; if (c.wasCC && !cc) haste(c, .3, 1.5); c.wasCC = cc; }
  }

  // Commands available alive or dead. Bots use exactly the same ones.
  const STATUS_T = ['stunT', 'slowT', 'markT', 'parryT', 'drT', 'buffT', 'empowerT', 'revealT', 'lock', 'rootT', 'polyT', 'knockT', 'stealthT', 'noHealT', 'hasteT', 'shieldT', 'vulnT', 'dmarkT', 'opener', 'ripT', 'curseT', 'poisonT', 'bleedT', 'pingT', 'dropT', 'stringT', 'kindleT', 'bellT', 'tempoT'];
  const BEACON_CD = 50, BEACON_RANGE = 350, BEACON_SIGHT = 560, BEACON_LIFE = 60;
  function runShared(s, c, q) {
    if (q.t === 'buy') buyItem(s, c, q.id);
    else if (q.t === 'sell') sellItem(s, c, q.slot);
    else if (q.t === 'evolve') chooseEvolve(s, c, q.tier, q.choice);
    else if (q.t === 'beacon') placeBeacon(s, c, q.tx, q.ty);
    else if (q.t === 'ping') pingAt(s, c, q.kind, q.x, q.y);
    else if (q.t === 'practice') practiceOp(s, c, q.op);
    else if (q.t === 'buyback') buyback(s, c);
    else if (q.t === 'reinforce') reinforce(s, c, q.lane);
    else if (q.t === 'fund') fund(s, c);
    else if (q.t === 'surrender') surrenderVote(s, c, q.vote !== false);
    else if (q.t === 'pref') c.targetPref = q.v === 'pct' ? 'pct' : 'hp';
  }
  function buyItem(s, c, id) {
    const it = ITEM_BY[id]; if (!it) return false;
    if (it.consumable) return useConsumable(s, c, it);
    const price = itemPrice(c, id); if (price === null || c.gold < price) return false;
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
    c.gold += sellValue(id); c.items[slot] = null; applyStats(c, true); if (!c.alive) c.hp = 0;
    s.ev.push({ e: 'sell', u: c.id, id }); return true;
  }
  const SELL_RATE = .7, sellValue = id => { let v = 0; for (const p of itemPath(id)) v += ITEM_BY[p].cost; return Math.floor(v * SELL_RATE); };
  // Consumables apply on the spot and need no slot.
  function useConsumable(s, c, it) {
    if (!c.alive || c.gold < it.cost) return false;
    if (it.id === 'cleanse') { if (c.cleanseCd > 0) return false; c.stunT = c.rootT = c.slowT = c.polyT = c.knockT = c.poisonT = c.bleedT = c.curseT = 0; c.curseN = 0; c.cleanseCd = 25; haste(c, .2, 1.5); }
    else if (it.id === 'potion') { c.potT = 8; c.potHps = c.maxHp * .4 / 8; }
    else if (it.id === 'elixir') { c.elixT = 90; applyStats(c, true); }
    else if (it.id === 'tonic') { c.tonicT = 8; }
    else if (it.id === 'beaconkit') { if (c.beacons >= (c.prof === 'pathfinder' ? 3 : 2)) return false; c.beacons++; }
    else return false;
    c.gold -= it.cost; s.ev.push({ e: 'consume', u: c.id, id: it.id }); return true;
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
    const b = { id: s.nid++, kind: 'beacon', team: c.team, x: f.x, y: f.y, px: f.x, py: f.y, r: 16, hp: 3, maxHp: 3, alive: true, t: BEACON_LIFE, sight: BEACON_SIGHT * (c.prof === 'pathfinder' ? 1.3 : 1), inBrush: br, owner: c };
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
    else if (op === 'level') { for (let i = 0; i < 16 && c.lvl < MAX_LEVEL; i++) giveXp(s, c, xpNeed(c.lvl) - c.xp + 1); }
    else if (op === 'reset') { c.cd = [0, 0, 0]; c.recast = [0, 0, 0]; c.hp = c.maxHp; c.beacons = 2; c.beaconT = 0; }
  }
  // Called every couple of seconds: how far behind a side has fallen, 0..1.
  function updateCatchup(s) {
    const worth = [0, 0];
    for (const c of s.champs) { worth[c.team] += c.gold + c.xp * .4; for (const id of c.items) if (id) worth[c.team] += itemPath(id).reduce((v, p) => v + ITEM_BY[p].cost, 0); }
    const gap = worth[1] - worth[0], k = clamp(Math.abs(gap) / 1900, 0, 1);
    s.catchup[0] = gap > 0 ? k : 0; s.catchup[1] = gap < 0 ? k : 0;
  }
  // Poison and bleed, ticking twice a second. Damage over time never reveals or interrupts.
  function stepDots(s) {
    const all = [s.champs, s.minions, s.monsters];
    for (const list of all) for (const u of list) {
      if (!u.alive) continue;
      if (u.kind !== 'champ') { if (u.curseT > 0) { u.curseT -= DT; if (u.curseT <= 0) u.curseN = 0; } if (u.poisonT > 0) u.poisonT -= DT; if (u.bleedT > 0) u.bleedT -= DT; if (u.kindleT > 0) u.kindleT -= DT; if (u.stringT > 0) u.stringT -= DT; }
      if (s.tick % 15 === 0) {
        if (u.poisonT > 0 && u.poisonBy) { curAbil = u.poisonAbil; hurt(s, u.poisonBy, u, u.poisonDps * .5, { skill: 1, dot: 1 }); }
        if (u.alive && u.bleedT > 0 && u.bleedBy) { curAbil = u.bleedAbil; hurt(s, u.bleedBy, u, u.bleedDps * .5, { skill: 1, dot: 1 }); } curAbil = null;
      }
    }
  }

  function stepMinion(s, m) {
    m.px = m.x; m.py = m.y; if (m.delay > 0) { m.delay -= DT; return; }
    if (m.stunT > 0) m.stunT -= DT; if (m.slowT > 0) m.slowT -= DT; if (m.markT > 0) m.markT -= DT; if (m.cd > 0) m.cd -= DT; if (m.knockT > 0) m.knockT -= DT; if (m.polyT > 0) m.polyT -= DT;
    if (m.dash) { const D = m.dash; const st = Math.min(DT, D.t); m.x += D.vx * st; m.y += D.vy * st; D.t -= DT; if (D.t <= 0) m.dash = null; pushOut(s.map, m); return; }
    if (m.stunT > 0) return;
    let t = null, bd = 300;
    // protect allied champions that are being hit by enemy champions
    if (!s.practice) for (const e of s.champs) if (e.alive && !e.air && e.team !== m.team && e.recentHit && s.t - e.recentHit < 1.5 && canSee(s, m.team, e)) { const d = dist(m, e); if (d < 420 && hasLOS(m.x, m.y, e.x, e.y)) { t = e; break; } }
    if (!t) for (const e of s.minions) if (e.alive && e.team !== m.team && e.delay <= 0) { const d = dist(m, e) - e.r; if (d < bd && hasLOS(m.x, m.y, e.x, e.y)) { bd = d; t = e; } }
    if (!t) for (const e of s.towers) if (e.alive && e.team !== m.team && towerOpen(s, e)) { const d = dist(m, e) - e.r; if (d < bd + 40 && hasLOS(m.x, m.y, e.x, e.y)) { bd = d; t = e; } }
    if (!t && !s.practice) for (const e of s.champs) if (e.alive && !e.air && e.team !== m.team && canSee(s, m.team, e)) { const d = dist(m, e) - e.r; if (d < bd * .7 && hasLOS(m.x, m.y, e.x, e.y)) { bd = d; t = e; } }
    if (t && laneDist(s, m.lane, t.x, t.y) > MINION_LEASH + m.range + t.r) t = null; // never chase off the lane
    const sp = m.ms * (m.slowT > 0 ? 1 - m.slowA : 1);
    if (t) {
      const d = dist(m, t) - t.r;
      if (d > m.range - 6) { const n = norm(t.x - m.x, t.y - m.y); m.x += n.x * sp * DT; m.y += n.y * sp * DT; m.fx = n.x; m.fy = n.y; }
      else if (m.cd <= 0) { m.cd = 1 / m.as; s.ev.push({ e: 'matk', u: m.id }); if (m.ranged) homing(s, m, t, m.dmg, 800, 'mbolt'); else hurt(s, m, t, m.dmg); }
    } else if (m.wp < m.path.length) {
      const [wx, wy] = m.path[m.wp]; const n = norm(wx - m.x, wy - m.y);
      if (n.l < 40) m.wp++; else { m.x += n.x * sp * DT; m.y += n.y * sp * DT; m.fx = n.x; m.fy = n.y; }
    }
    pushOut(s.map, m);
    if (t) { const L = laneNearest(s, m.lane, m.x, m.y); if (L.d > MINION_LEASH) { const n = norm(m.x - L.x, m.y - L.y); m.x = L.x + n.x * MINION_LEASH; m.y = L.y + n.y * MINION_LEASH; } }
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
    if (m.boss && t) { m.slam -= DT; if (m.slam <= 0) bossSlam(s, m, t); }
    if (m.shellT > 0) m.shellT -= DT;
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

  // Every boss has its own attack: a single-target cleave, a big ring around itself, and a shell.
  function bossSlam(s, m, t) {
    const B = BOSS_STATS[m.bossKind]; m.slam = B.slamEvery;
    const atSelf = m.bossKind === 'foreman' || m.bossKind === 'sentinel', x = atSelf ? m.x : t.x, y = atSelf ? m.y : t.y;
    if (m.bossKind === 'sentinel') { m.shellT = 3.5; s.ev.push({ e: 'boom', x: m.x, y: m.y, r: 140, fx: 'dome' }); }
    s.zones.push({ id: s.nid++, kind: 'blast', x, y, r: B.slamR, t: B.slamDelay, total: B.slamDelay, team: 2, owner: m, fx: B.fxSlam, fn(s, z) {
      for (const e of s.champs) if (e.alive && !e.air && Math.hypot(e.x - z.x, e.y - z.y) < B.slamR + e.r) { hurt(s, m, e, B.slamDmg); if (m.bossKind === 'colossus' || m.bossKind === 'foreman') slow(e, .35, 1); if (m.bossKind === 'sentinel') e.vulnT = Math.max(e.vulnT || 0, 2); }
      s.ev.push({ e: 'boom', x: z.x, y: z.y, r: B.slamR, fx: B.fxSlam });
    } });
  }

  const TOWER_BASE = 160, TOWER_RAMP = .24;
  // Structures: very resistant early so the base can't fall in a blink, then steadily softer so a match ends by about 18 minutes.
  const structureK = s => s.t < 760 ? .42 : s.t < 980 ? .42 + (s.t - 760) / 220 * .78 : Math.min(14, 1.2 + (s.t - 980) / 58);
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
    const base = target.kind === 'champ' ? (TOWER_BASE + s.t * TOWER_RAMP) * ramp : target.maxHp * (target.heavy ? .16 : s.t > 1020 ? .16 : s.t > 900 ? .24 : .42) * (1 + (target.armor || 0) / 100);
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
          curAbil = p.abil || null; hurt(s, src, t, p.dmg, { crit: p.crit, basic: p.basic, skill: p.skill }); curAbil = null;
          continue;
        }
        p.x += n.x * st; p.y += n.y * st;
      } else {
        const st = Math.hypot(p.vx, p.vy) * DT, k = st > p.left ? p.left / st : 1; p.x += p.vx * DT * k; p.y += p.vy * DT * k; p.left -= st;
        const test = t => {
          if (p.dead || !t.alive || t.air || t === p.owner || p.hits.has(t.id)) return;
          if (t.team === p.team && !(p.filter.startsWith('all') && t.kind === 'champ')) return;
          if (segDist(t.x, t.y, p.px, p.py, p.x, p.y) <= t.r + p.w / 2) {
            p.hits.add(t.id); curAbil = p.abil; p.hit(s, p.owner, t, p); curAbil = null;
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
      curAbil = z.abil;
      if (z.step && z.t > 0) z.step(s, z);
      if (z.t <= 0) {
        z.dead = true;
        if (z.kind === 'blast') { s.ev.push({ e: 'boom', x: z.x, y: z.y, r: z.r, fx: z.fx }); z.fn(s, z); }
        else if (z.fn) z.fn(s, z);
        if (z.end) z.end(s, z);
      }
      curAbil = null;
    }
    s.zones = s.zones.filter(z => !z.dead);
  }

  /*BOTS*/
  /*CODEC*/
  // ---------- step ----------
  function step(s) {
    if (s.over) return;
    if (s.practice) { s.eventAt = 1e9; s.bossAt = 1e9; for (const B of s.bosses) if (!B.up) B.at = 1e9; }
    s.t += DT; s.tick++;
    s.navLeft = 2;
    if (s.hope !== 50) setHope(s, s.hope + (50 - s.hope) * HOPE_DRIFT * DT); // public mood settles back toward even
    refreshLanes(s);
    if (s.tick % 15 === 0) teamThink(s, 0); else if (s.tick % 15 === 7) teamThink(s, 1);
    if (s.tick % 15 === 3) for (const c of s.champs) updateSolo(s, c);
    for (const c of s.champs) if (c.bot) {
      if (!c.alive) { botDead(s, c, c.bot); continue; }
      const b = c.bot; b.next -= DT;
      if (b.next <= 0) { b.next = b.sk.think; botThink(s, c, b); }
      botSteer(s, c, b);
    }
    if (s.t >= s.nextWave) { spawnWave(s); s.nextWave += s.t > 900 ? 17 : 26; }
    for (const camp of s.camps) if (!camp.alive && s.t >= camp.at) spawnCamp(s, camp);
    for (const B of s.bosses) if (!B.up && s.t >= B.at) spawnBoss(s, B);
    for (const c of s.champs) stepChamp(s, c);
    for (const m of s.minions) if (m.alive) stepMinion(s, m);
    { const groups = [[], [], [], []]; for (const m of s.minions) if (m.alive && !(m.delay > 0)) groups[m.team * 2 + m.lane].push(m); for (const g of groups) for (let i = 0; i < g.length; i++) { const a = g[i]; for (let j = i + 1; j < g.length; j++) { const b = g[j], dx = a.x - b.x; if (dx > 60 || dx < -60) continue; const dy = a.y - b.y, d = Math.hypot(dx, dy), mn = a.r + b.r; if (d < mn && d > .01) { const p = (mn - d) * .25 / d; a.x += dx * p; a.y += dy * p; b.x -= dx * p; b.y -= dy * p; } } } }
    for (const m of s.monsters) if (m.alive) stepMonster(s, m);
    for (const t of s.towers) if (t.alive) stepTower(s, t);
    stepProj(s); stepZones(s); stepSites(s); stepDots(s); stepBeacons(s);
    stepBoons(s); stepEvent(s); stepFog(s); stepVotes(s);
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

  return { MAX_LEVEL, PROFS, itemPaths, quickTarget, ITEM_SLOTS, CONSUMABLES, buybackCost, reinforceCost, fundCost, sellValue, BOSS_INFO, EVENT_INFO, BOON_INFO, SURRENDER_AT, BEACON_RANGE, ROSTER, ITEMS, ITEM_BY, itemPath, itemPrice, recommended, marksEarned, cdOf, defaultBuild, TOWER_RANGE, MAX_ATTACK_RANGE, refreshChamp, W, H, TICK, DT, KITS, buildMap, rayWall, visionSources, hasLOS, TIERS, TEAM_NAMES, FORGE_COST, createMatch, step, canSee, autoTarget, masteryGain, tierOf, towerOpen, xpNeed, ROLES, ROLE_INFO, autoRoles, CHARS, charOf,
    RANKS, rankOf, rankDelta, botSkills, skillProfile, setBot, snapshot, decodeSnapshot, applySnapshot, applyFrame, applyChampState, slowFlat, slowDiff, applySlow, packEvent, unpackEvent, predict };
})();
if (typeof module !== 'undefined') module.exports = Sim;
