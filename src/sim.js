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
//   Comebacks: feed.bounty includes a shutdown bonus when the killer's side is behind. Sim.sensiblePool(team, wantKit, rand) = four kits covering the four roles, for bot fill.
//   New event: strike{u,x,y} (Kill Strike lands). c.pstack carries passive stacks for Mirage, Tidecaller, Paragon and Cataclysm; c.pready for Voltaic and Ravager.
// 11.0 additions (names final):
//   Sim.scoreMatch(s) = {list:[{id,champ,name,team,role,score,parts}] best first, mvp, svp} (champion ids, 0 = none; Raid has an MVP and no SVP). Uses only synced stats, rounded, so host and guests agree.
//   Sim.MEDALS, Sim.MEDAL_CATS {cat: name}, Sim.newCareer(), Sim.medalValue(career, medal), Sim.matchStats(s, c), Sim.medalProgress(career, matchStats) = {career, earned:[{id,name,tier,tierName,need}]}; career.tiers[id] = tiers held, 0..3.
//   Sim.marksEarned(won, stats, {potg,mvp,svp,medals:earned}); Sim.MARK_BONUS = {potg,mvp,svp,medal:[bronze,silver,gold]}.
//   c.stats gains Sim.EXTRA_STATS: multi3 multi4 multi5 (chains reaching that size), bestStreak, clutch, saves, steals, colossi, trailed (largest gold deficit). Guests need these added to the slow state for full medal credit.
//   Highlights: event hl{kind,u,x,y,n,v,b}. kind: multi (n size), ult (n caught), steal (b boss), boss, ace, clutch, shutdown (n bounty), save, core. v = worth.
//   Modes: cfg.mode classic|duel|brawl|gold|raid, Sim.MODES = [{id,name,d,teamSize?,coop?}]; s.mode, s.oneLane, s.lanes = [0] or [0,1]. createMatch shapes cfg.teams in place (Sim.normalizeTeams): Duel keeps one seat a side, Raid moves up to 4 humans to one side and empties the other.
//   Raid: s.raid = {team, enemy, surge}. Enemy base is sealed; killing the Colossus (at 8:00) wins, losing your core loses. Event raid{phase} when it calls a surge (1, 2).
// ==== end NET STATE ====
const Sim = (() => {
  // c.stats fields added in 11.0 that the slow state has yet to carry to guests.
  const EXTRA_STATS = ['multi3', 'multi4', 'multi5', 'bestStreak', 'clutch', 'saves', 'steals', 'colossi', 'trailed'];
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
  function dashDir(c, dx, dy, d, speed, o = {}) { if (o.forced && c.champ === 'gravel' && c.hp > c.maxHp * .4) return; const len = Math.max(0, Math.min(d, rayWall(c.x, c.y, dx, dy, d + c.r) - c.r)); c.dash = Object.assign({ vx: dx * speed, vy: dy * speed, t: len / speed, hits: new Set(), abil: curAbil }, o); }
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

    // ---------- Flipside 5.0 content: 12 kits, passives, builds, evolves, items. Concatenated into the Sim closure at /*CONTENT*/.
  // Numbers live on the ability so builds and evolves can change them with plain data (see applyMods).
  const CHARS = {
    hero: {
      vesper: { name: 'Longshot', title: 'The watchful marksman' }, kade: { name: 'Captain Riposte', title: 'Master of the counter' },
      ione: { name: 'Starling', title: 'Caller of falling stars' }, solenne: { name: 'Dawnbringer', title: 'Healer of the first light' },
      sable: { name: 'Nightfall', title: 'Quiet hand of justice' }, gravel: { name: 'Bulwark', title: 'The wall that walks' },
      voltaic: { name: 'Voltaic', title: 'First at every scene' }, tidecaller: { name: 'Tidecaller', title: 'The harbour keeps her promises' }, paragon: { name: 'Paragon', title: 'The sky is not the limit' }, mirage: { name: 'Mirage', title: 'Three of her, none of her' },
    },
    villain: {
      deadbolt: { name: 'Deadbolt', title: 'Locks on and waits' }, duelist: { name: 'The Duelist', title: 'Never dropped a grudge' },
      hex: { name: 'Madame Hex', title: 'Curses by appointment' }, plague: { name: 'The Plague Doctor', title: 'Prescribes only trouble' },
      shiv: { name: 'Shiv', title: 'Gone before you look' }, ironjaw: { name: 'Ironjaw', title: 'Bites through bank vaults' },
      cinder: { name: 'Cinder', title: 'Burns her bridges, and yours' }, ravager: { name: 'Ravager', title: 'Something got out of the zoo' }, cataclysm: { name: 'Cataclysm', title: 'The end of the block' }, puppeteer: { name: 'The Puppeteer', title: 'Pulls every string in town' },
    },
  };
  const ROSTER = [['vesper', 'kade', 'ione', 'solenne', 'sable', 'gravel', 'voltaic', 'tidecaller', 'paragon', 'mirage'], ['deadbolt', 'duelist', 'hex', 'plague', 'shiv', 'ironjaw', 'cinder', 'ravager', 'cataclysm', 'puppeteer']];
  const charOf = (team, kit) => CHARS.hero[kit] || CHARS.villain[kit] || CHARS[team ? 'villain' : 'hero'][ROSTER[team ? 1 : 0][0]];
  // Every tower must out-range every basic attack by 70, so nothing can plink a tower from outside its reach.
  const TOWER_RANGE = 430, CORE_RANGE = 470, MAX_ATTACK_RANGE = TOWER_RANGE - 70;

  // ---------- shared status helpers ----------
  const shield = (s, t, amt, dur) => { t.shieldHp = Math.max(t.shieldHp > 0 && t.shieldT > 0 ? t.shieldHp : 0, 0) + amt; t.shieldT = Math.max(t.shieldT || 0, dur); s.ev.push({ e: 'shield', u: t.id, a: Math.round(amt) }); };
  const haste = (t, a, d) => { t.hasteA = Math.max(t.hasteT > 0 ? t.hasteA : 0, a); t.hasteT = Math.max(t.hasteT || 0, d); };
  const root = (s, t, d) => { if (t.kind === 'tower' || t.boss) return; t.rootT = Math.max(t.rootT || 0, d); if (t.dash && !t.dash.unstop && !t.dash.forced) t.dash = null; if (t.charge) t.charge = null; s.ev.push({ e: 'root', u: t.id }); };
  const knock = (s, t, d) => { if (t.kind === 'tower' || t.boss) return; if (t.champ === 'gravel' && t.hp > t.maxHp * .4) { stun(s, t, d * .5); return; } stun(s, t, d); t.knockT = t.knockMax = Math.max(t.knockT || 0, d); s.ev.push({ e: 'knock', u: t.id }); };
  const poly = (s, t, d) => { if (t.kind === 'tower' || t.boss) return; stun(s, t, d); t.polyT = Math.max(t.polyT || 0, d); s.ev.push({ e: 'poly', u: t.id }); };
  const poison = (s, c, t, dps, d) => { if (t.kind === 'tower') return; t.poisonT = Math.max(t.poisonT || 0, d); t.poisonDps = Math.max(t.poisonT > 0 ? t.poisonDps || 0 : 0, dps); t.poisonBy = c; t.poisonAbil = curAbil; };
  const bleed = (s, c, t, dps, d) => { if (t.kind === 'tower') return; t.bleedDps = t.bleedT > 0 ? Math.max(t.bleedDps, dps) : dps; t.bleedT = Math.max(t.bleedT || 0, d); t.bleedBy = c; t.bleedAbil = curAbil; };
  const hpow = c => pow(c) * (1 + c.st.healPow) * (c.prof === 'guardian' ? 1.2 : 1);
  const curseCap = c => c.f && c.f.cursebinder ? 5 : 3;
  const curse = (s, c, t, n) => { t.curseN = Math.min(curseCap(c), (t.curseT > 0 ? t.curseN || 0 : 0) + n); t.curseT = c.f.cursebinder ? 9 : 6; t.curseBy = c; s.ev.push({ e: 'curse', u: t.id, n: t.curseN }); };
  const stealth = (s, c, d) => { c.stealthT = Math.max(c.stealthT || 0, d); c.revealT = 0; s.ev.push({ e: 'stealth', u: c.id, on: true }); };
  const breakStealth = (s, c) => { if (c.stealthT > 0) { c.stealthT = 0; if (c.champ === 'shiv') c.opener = 1.2; s.ev.push({ e: 'stealth', u: c.id, on: false }); } };
  // Line and timed zones. kind names are the art contract: tripline lockdown coven miasma quarantine ring tether orbit fissure decoy.
  function field(s, c, kind, o) { const z = Object.assign({ id: s.nid++, kind, team: c.team, owner: c, t: o.dur, total: o.dur, counted: false, fx: kind, abil: curAbil }, o); s.zones.push(z); return z; }
  function lineZone(o, x1, y1, x2, y2) { o.x1 = x1; o.y1 = y1; o.x2 = x2; o.y2 = y2; o.x = (x1 + x2) / 2; o.y = (y1 + y2) / 2; o.line = true; return o; }
  // Enemies inside a circle, each passed once; never through a wall when `los` is set.
  const enemiesIn = (s, c, x, y, r, los) => { const out = []; eachEnemy(s, c, x, y, r, t => { if (!los || hasLOS(x, y, t.x, t.y)) out.push(t); }); return out; };
  const alliesIn = (s, team, x, y, r) => s.champs.filter(a => a.alive && a.team === team && Math.hypot(a.x - x, a.y - y) < r);
  const lowestAlly = (s, c, r, incl) => { let b = null, f = 2; for (const a of alliesIn(s, c.team, c.x, c.y, r)) { if (!incl && a === c) continue; const v = a.hp / a.maxHp; if (v < f) { f = v; b = a; } } return b; };
  const cone = (s, c, a, reach, dot, fn) => { let n = 0; eachEnemy(s, c, c.x, c.y, reach, t => { const v = norm(t.x - c.x, t.y - c.y); if (v.x * a.dx + v.y * a.dy >= dot && hasLOS(c.x, c.y, t.x, t.y)) { fn(t); n += t.kind === 'champ' ? 1 : 0; } }); return n; };
  // Faces the nearest visible enemy champion in reach, for tap-to-fire abilities on a phone.
  const autoFace = (s, c, reach) => { const t = nearChamp(s, c, c.x, c.y, reach); if (t && hasLOS(c.x, c.y, t.x, t.y)) { const n = norm(t.x - c.x, t.y - c.y); c.fx = n.x; c.fy = n.y; return { dx: n.x, dy: n.y, t }; } return { dx: c.fx || 1, dy: c.fy || 0, t: null }; };

  // ---------- 10.0 kit helpers ----------
  function arcBolt(s, c, from, dmg, n, name) { const list = enemiesIn(s, c, from.x, from.y, 260, true).filter(e => e !== from).sort((a, b) => (b.kind === 'champ') - (a.kind === 'champ')).slice(0, n); const was = curAbil; curAbil = name; for (const e of list) { hurt(s, c, e, dmg, { skill: 1 }); s.ev.push({ e: 'phit', x: e.x, y: e.y, fx: 'thunder' }); } curAbil = was; }
  function tideTick(s, c) { c.tideN = (c.tideN || 0) + 1; c.pstack = c.tideN % 3; if (c.tideN % 3) return; s.ev.push({ e: 'boom', x: c.x, y: c.y, r: 180, fx: 'riptide' }); for (const a of alliesIn(s, c.team, c.x, c.y, c.f.wellspring ? 420 : 300)) heal(s, c, a, a.maxHp * .05); }
  function skyLand(s, c, r, dmg, slowA, stunT, fx) { s.ev.push({ e: 'boom', x: c.x, y: c.y, r, fx }); let hit = false; eachEnemy(s, c, c.x, c.y, r, t => { hurt(s, c, t, dmg, { skill: 1 }); if (t.kind === 'champ') { hit = true; if (stunT) stun(s, t, stunT); else if (slowA) slow(t, slowA, 1.2); } }); if (hit) c.stats.skillHits++; c.altN = 3; if (c.f.freeflight) heal(s, c, c, c.maxHp * .1); }
  function kindle(s, c, t, n) { if (t.kind === 'tower') return; const had = t.kindleT > 0 ? t.kindleN || 0 : 0, v = had + n; t.kindleT = 5; if (v < 3) { t.kindleN = v; return; } t.kindleN = 0; hurt(s, c, t, 62 * pow(c) * (c.f.pyre ? 1.25 : 1), { skill: 1, crit: 1 }); s.ev.push({ e: 'boom', x: t.x, y: t.y, r: 80, fx: 'ignite' }); if (t.alive) bleed(s, c, t, 26 * pow(c) * (c.f.pyre ? 1.4 : 1), 2.5); if (c.f.wildfire) for (const o of enemiesIn(s, c, t.x, t.y, 220, true)) if (o !== t) kindle(s, c, o, 1); }
  function string(s, c, t) { t.stringT = 3; t.stringK = c.f.cutstrings ? 1.12 : 1.08; t.stringBy = c.team; }

  const KITS = {
    // ---------- Heroes ----------
    vesper: {
      name: 'Vesper', role: 'Marksman', blurb: 'Charge your shot while they try to read it.',
      sight: 950, hp: 540, hpG: 72, dmg: 60, dmgG: 7, armor: 16, armG: 3, range: 360, as: 1.0, ms: 305, pref: 325, fit: { top: 1, jungle: 0, bottom: 3, support: 0 },
      passive: { name: 'Steady Hand', d: 'Stand still for a moment and your next basic attack hits 30% harder. Long Shot deals 25% more to targets over 480 away.' },
      builds: [
        { id: 'marksman', name: 'Marksman', tag: 'Long range', d: 'Long Shot reaches farther and full charges hit far harder, but Smoke Step comes back slowly.', mods: { 0: { range_add: 135, dmgF_add: 60, d: 'Hold to charge. Reaches very far; a full charge pierces and hits hard.' }, 1: { cd_add: 3 } } },
        { id: 'skirmisher', name: 'Skirmisher', tag: 'Kiting', d: 'Hit a champion with your empowered attack to refund most of Smoke Step. Long Shot charges fast but stays short.', stats: { as: 1.12 }, mods: { 0: { charge: .55, range_add: -135, dmgF_add: -50, d: 'Quick charge, shorter reach.' }, 1: { cd_add: -2, d: 'Dash. Your next attack hits harder; landing it on a champion refunds most of the cooldown.' } } },
        { id: 'spotter', name: 'Spotter', tag: 'Vision', d: 'Long Shot reveals who it hits for your whole team. Deadeye scans every enemy champion when fired.', mods: { 0: { d: 'Hold to charge. Hits reveal the target to your team.' }, 2: { cd_add: -8, dmg_add: -60, d: 'The longest shot in the game. Firing reveals all enemy champions for 2 seconds.' } } },
        { id: 'executioner', name: 'Executioner', tag: 'Finisher', d: 'Deadeye comes up far more often and finishes low targets. Long Shot hits hurt targets harder.', mods: { 0: { d: 'Hold to charge. Targets under half health take more.' }, 2: { cd: 32, dmg_add: -70, d: 'Deadeye adds 45% of the target\'s missing health. A kill refunds most of the cooldown.' } } },
      ],
      evolves: [
        [{ id: 'swiftdraw', name: 'Swift Draw', d: 'Long Shot charges 25% faster.', mods: { 0: { charge_mul: .75 } } }, { id: 'smokescreen', name: 'Smokescreen', d: 'Smoke Step leaves a cloud that slows enemies by 35%.' }],
        [{ id: 'overpen', name: 'Overpenetration', d: 'Deadeye passes through champions, losing a quarter of its power each time.' }, { id: 'stillness', name: 'Absolute Stillness', d: 'Steady Hand arms twice as fast and also crits.' }],
      ],
      kit: [
        { name: 'Long Shot', d: 'Hold to charge. A full charge pierces.', fx: 'snipe', cd: 6, range: 600, minRange: 375, shape: 'line', w: 34, charge: 1.1, dmg: 70, dmgF: 120,
          cast(s, c, a, A) {
            const f = c.charge ? clamp(c.charge.t / A.charge, 0, 1) : 0, ox = c.x, oy = c.y; c.charge = null;
            fire(s, c, a, { speed: 1600, range: A.minRange + (A.range - A.minRange) * f, w: 28 + 8 * f, fx: f >= 1 ? 'snipeFull' : 'snipe', pierce: f >= 1, filter: 'units',
              hit(s, c, t, p) { hurt(s, c, t, (A.dmg + A.dmgF * f) * pow(c) * (c.f.executioner && t.hp < t.maxHp * .5 ? 1.3 : 1) * (Math.hypot(t.x - ox, t.y - oy) > 480 ? 1.25 : 1), { skill: 1 }); if (t.kind === 'champ') { skillHit(c, p); if (c.f.spotter) t.revealT = Math.max(t.revealT || 0, 4); } } });
          },
        },
        { name: 'Smoke Step', d: 'Dash. Your next basic attack hits harder.', fx: 'dash', cd: 9, range: 200, shape: 'dash', w: 60, pd: [200, 1200],
          cast(s, c, a, A) { dashDir(c, a.dx, a.dy, A.range, 1200); c.empowerT = 3; if (c.f.smokescreen) field(s, c, 'miasma', { x: c.x, y: c.y, r: 130, dur: 2.4, fx: 'smoke', step(s, z) { if (s.tick % 6 === 0) for (const t of enemiesIn(s, c, z.x, z.y, z.r)) slow(t, .35, .4); } }); if (c.f.skirmisher) c.stillT = 2; },
        },
        { name: 'Deadeye', d: 'The longest shot in the game. Everyone sees it coming.', fx: 'deadeye', cd: 50, range: 800, shape: 'line', w: 50, windup: true, dmg: 260,
          cast(s, c, a, A) {
            if (c.f.spotter) for (const e of s.champs) if (e.alive && e.team !== c.team) e.revealT = Math.max(e.revealT || 0, 2);
            c.chan = { t: .7, total: .7, kind: 'line', slot: 2, dx: a.dx, dy: a.dy, len: rayWall(c.x, c.y, a.dx, a.dy, A.range), w: 50, fn(s, c) {
              s.ev.push({ e: 'fire', u: c.id, fx: 'deadeye', dx: a.dx, dy: a.dy });
              let pw = 1;
              fire(s, c, a, { speed: 2600, range: A.range, w: 50, fx: 'deadeye', filter: 'champ', pierce: !!c.f.overpen, hit(s, c, t, p) {
                const x = (A.dmg * pow(c) + (c.f.executioner ? (t.maxHp - t.hp) * .45 : 0)) * pw;
                const dead = hurt(s, c, t, x, { skill: 1, crit: c.f.executioner && t.hp < t.maxHp * .35 ? 1 : 0 }) && !t.alive; skillHit(c, p); if (c.f.executioner && dead) c.cd[2] = Math.min(c.cd[2], 10);
                if (c.f.overpen) pw *= .75; else p.left = 0;
              } });
            } };
          },
        },
      ],
      tick(s, c) { const need = c.f.stillness ? .6 : 1.2; if (Math.hypot(c.mv.x, c.mv.y) < .05 && !c.dash) c.stillT = (c.stillT || 0) + DT; else if (!c.f.skirmisher || (c.stillT || 0) < 1.9) c.stillT = 0; c.pready = c.stillT >= need ? 1 : 0; },
      onBasic(s, c, t, o) { if (c.pready) { o.dmg *= c.f.stillness ? 1.5 : 1.3; o.crit = c.f.stillness ? true : o.crit; c.stillT = 0; c.pready = 0; } if (c.f.skirmisher && o.empowered && t.kind === 'champ') c.cd[1] *= .3; },
    },
    kade: {
      name: 'Kade', role: 'Duelist', blurb: 'Time the parry and the fight is yours.',
      sight: 720, hp: 640, hpG: 95, dmg: 64, dmgG: 8, armor: 28, armG: 4, range: 140, as: .95, ms: 325, pref: 105, melee: true, fit: { top: 3, jungle: 2, bottom: 0, support: 0 },
      passive: { name: 'Riposte', d: 'After a successful Parry, or Lunging into a champion, your next attack hits 60% harder and slows. A parried champion takes back 60% of the blow.' },
      builds: [
        { id: 'parrymaster', name: 'Parrymaster', tag: 'Counter', d: 'Parry comes up fast, holds longer and stuns longer. Lunge comes back slower.', mods: { 1: { cd: 7, parry: .7, stunT: 1.25, d: 'Near-constant block. Catching a hit stuns the attacker longer.' }, 0: { cd_add: 2 } } },
        { id: 'blitz', name: 'Blitz', tag: 'Engage', d: 'Lunge reaches farther and refunds on champions. Crash leaps far more often, but Parry is a sliver of a window.', mods: { 0: { range: 255, pd: [255, 1200], pdr: [225, 1200], d: 'Long dash. Hit a champion and you can dash again.' }, 2: { cd: 30, range: 465 }, 1: { parry: .32 } } },
        { id: 'vanguard', name: 'Vanguard', tag: 'Frontline', d: 'Parries shield nearby allies. Crash shields everyone you land beside. Sturdy, lighter hits.', stats: { hp: 1.1, dmg: .9 }, mods: { 1: { d: 'Half a second of perfect block. A catch also shields nearby allies.' }, 2: { d: 'Leap, untouchable, and land with a stun. Shields nearby allies.' } } },
        { id: 'breaker', name: 'Breaker', tag: 'Split push', d: 'Basic attacks and Lunge shred towers. Lunge chews through waves. Weak in long team fights.', stats: { dmg: 1.05, hp: .95 }, mods: { 0: { dmg_add: 18, d: 'Dash through a line. Strong against minions and towers.' } } },
      ],
      evolves: [
        [{ id: 'longlunge', name: 'Long Lunge', d: 'Lunge reaches 45 farther.', mods: { 0: { range_add: 45 } } }, { id: 'reflex', name: 'Quick Reflexes', d: 'Parry cooldown is 2 seconds shorter.', mods: { 1: { cd_add: -2 } } }],
        [{ id: 'aftershock', name: 'Aftershock', d: 'Crash leaves shaking ground that slows for 2.5 seconds.' }, { id: 'heroicfall', name: 'Heroic Fall', d: 'Crash cooldown 10 shorter, and landing heals you for 15%.', mods: { 2: { cd_add: -10 } } }],
      ],
      kit: [
        { name: 'Lunge', d: 'Dash through a line. Hit a champion and you can dash again.', fx: 'dash', cd: 7, range: 220, shape: 'dash', w: 80, pd: [220, 1100], pdr: [195, 1100], dmg: 74,
          cast(s, c, a, A) { const car = {}; dashDir(c, a.dx, a.dy, A.range, 1100, { onHit(s, c, t) { hurt(s, c, t, A.dmg * pow(c) * (c.f.breaker && t.kind !== 'champ' ? 1.6 : 1), { skill: 1 }); if (t.kind === 'champ') { skillHit(c, car); c.recast[0] = 2.5; c.ripT = 3.5; if (c.f.blitz) c.cd[0] *= .6; } } }); },
          recast(s, c, a, A) { dashDir(c, a.dx, a.dy, Math.min(A.range, 195), 1100, { onHit(s, c, t) { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); } }); },
        },
        { name: 'Parry', d: 'Half a second of perfect block. Catch a hit to stun the attacker.', fx: 'parry', cd: 11, range: 0, shape: 'self', instant: true, noCdr: true, parry: .5, stunT: .9,
          cast(s, c, a, A) { c.parryT = A.parry; c.parryStun = A.stunT; },
        },
        { name: 'Crash', d: 'Leap, untouchable, and land with a stun at the centre.', fx: 'crash', cd: 45, range: 390, shape: 'circle', r: 165, over: true, dmg: 185,
          cast(s, c, a, A) {
            c.air = .45; c.leap = { sx: c.x, sy: c.y, tx: a.tx, ty: a.ty, t: 0, total: .45, fn(s, c) {
              s.ev.push({ e: 'boom', x: c.x, y: c.y, r: A.r, fx: 'crash' });
              let hit = false;
              eachEnemy(s, c, c.x, c.y, A.r, t => { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.kind === 'champ') { hit = true; if (Math.hypot(t.x - c.x, t.y - c.y) < 95 + t.r) stun(s, t, 1); else slow(t, .4, 1.5); } });
              if (hit) c.stats.skillHits++;
              if (c.f.heroicfall) heal(s, c, c, c.maxHp * .15);
              if (c.f.vanguard) for (const al of alliesIn(s, c.team, c.x, c.y, 300)) shield(s, al, 120 * hpow(c), 4);
              if (c.f.aftershock) field(s, c, 'miasma', { x: c.x, y: c.y, r: A.r, dur: 2.5, fx: 'crash', step(s, z) { if (s.tick % 6 === 0) for (const t of enemiesIn(s, c, z.x, z.y, z.r)) slow(t, .35, .4); } });
            } };
          },
        },
      ],
      onBasic(s, c, t, o) { if (c.ripT > 0) { c.ripT = 0; o.dmg *= 1.6; o.crit = true; slow(t, .3, 1.2); } if (c.f.breaker && t.kind === 'tower') o.dmg *= 1.35; },
      tick(s, c) { c.pready = c.ripT > 0 ? 1 : 0; },
    },
    ione: {
      name: 'Ione', role: 'Mage', blurb: 'Mark them, then break the mark.',
      sight: 850, hp: 500, hpG: 68, dmg: 50, dmgG: 5, armor: 14, armG: 3, range: 320, as: .85, ms: 300, pref: 290, fit: { top: 1, jungle: 0, bottom: 2, support: 2 },
      passive: { name: 'Stardust', d: 'Breaking a mark refunds 2 seconds of Sigil Orb, restores a little health and throws a new mark onto the nearest enemy.' },
      builds: [
        { id: 'constellation', name: 'Constellation', tag: 'Burst', d: 'Marks linger, Sigil Orb is quick, and Rupture hits marked targets far harder and unmarked ones barely.', mods: { 0: { cd: 3.2, markT: 7 }, 1: { dmg_add: -40, dmgM_add: 75, d: 'Ground blast. Barely hurts unmarked targets; marked targets take massive damage and a stun.' } } },
        { id: 'meteor', name: 'Meteor', tag: 'Zone', d: 'Rupture falls slow and huge. Hit where they must stand.', mods: { 1: { cd_add: 2, r: 150, delay: .9, dmg_add: 75, dmgM_add: 75, d: 'A slow, wide ground blast.' }, 2: { d: 'Three slow meteors walk forward. Each one marks.', delay_add: .35, dmg_add: 40 } } },
        { id: 'comet', name: 'Comet', tag: 'Poke', d: 'Sigil Orb flies far and fast through minions. Rupture is a small quick snap.', mods: { 0: { range: 645, speed: 1400, cd_add: .8, passThrough: true, d: 'Long, fast and passes through minions. Marks the first champion hit.' }, 1: { r: 75, delay: .24, cd_add: -1.5, dmg_add: -15, d: 'A small, near-instant blast.' } } },
        { id: 'stellar', name: 'Guiding Star', tag: 'Support', d: 'Sigil Orb flies through allies and shields them. Cascade hastens allies it passes.', mods: { 0: { d: 'Passes through allies, shielding them. Marks the first enemy hit.' }, 2: { d: 'Three blasts walk forward. Each marks enemies and hastens allies.' } } },
      ],
      evolves: [
        [{ id: 'swiftsigil', name: 'Swift Sigil', d: 'Sigil Orb cooldown 0.8 shorter.', mods: { 0: { cd_add: -.8 } } }, { id: 'widerupture', name: 'Wide Rupture', d: 'Rupture radius 20 larger.', mods: { 1: { r_add: 20 } } }],
        [{ id: 'longcascade', name: 'Long Cascade', d: 'Cascade adds a fourth blast.' }, { id: 'starsurge', name: 'Star Surge', d: 'Cascade\'s last blast stuns champions for 0.8.' }],
      ],
      kit: [
        { name: 'Sigil Orb', d: 'Marks the first enemy it hits.', fx: 'orb', cd: 4, range: 480, shape: 'line', w: 42, speed: 950, dmg: 92, markT: 4,
          cast(s, c, a, A) { fire(s, c, a, { speed: A.speed, range: A.range, w: A.w, fx: 'orb', filter: c.f.stellar ? "allunits" : A.passThrough ? "champ" : "units", hit(s, c, t, p) {
            if (t.team === c.team) { shield(s, t, 90 * hpow(c), 3); p.pass = 1; return; }
            hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); t.markT = A.markT; s.ev.push({ e: 'mark', u: t.id }); if (t.kind === 'champ') skillHit(c, p); p.left = 0; } }); },
        },
        { name: 'Rupture', d: 'Ground blast. Breaks marks for double damage and a stun.', fx: 'rupture', cd: 6.5, range: 405, shape: 'circle', r: 100, delay: .42, dmg: 85, dmgM: 180,
          cast(s, c, a, A) { const car = {}; blast(s, c, a.tx, a.ty, A.r, A.delay, (s, z) => { eachEnemy(s, c, z.x, z.y, A.r, t => { const m = t.markT > 0; hurt(s, c, t, (m ? A.dmgM : A.dmg) * pow(c), { skill: 1 }); if (m) { t.markT = 0; if (t.kind === 'champ') { stun(s, t, 1); c.cd[0] = Math.max(0, c.cd[0] - 2); heal(s, c, c, c.maxHp * .03); const nx = enemiesIn(s, c, t.x, t.y, 320, true).find(e => e !== t && e.kind === 'champ'); if (nx) { nx.markT = 4; s.ev.push({ e: 'mark', u: nx.id }); } } s.ev.push({ e: 'boom', x: t.x, y: t.y, r: 60, fx: 'break' }); } if (t.kind === 'champ') skillHit(c, car); }); }, 'rupture'); },
        },
        { name: 'Cascade', d: 'Three blasts walk forward. Each one marks.', fx: 'rupture', cd: 46, range: 480, shape: 'line', w: 170, delay: 0, dmg: 115,
          cast(s, c, a, A) { const reach = rayWall(c.x, c.y, a.dx, a.dy, A.range), n = c.f.longcascade ? 4 : 3; for (let i = 0; i < n; i++) { const dl = .32 + i * .28 + A.delay, k = 165 + i * 150, car = {}, last = i === n - 1; if (k > reach + 60) continue; blast(s, c, c.x + a.dx * k, c.y + a.dy * k, 118, dl, (s, z) => { eachEnemy(s, c, z.x, z.y, 118, t => { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); t.markT = 4; if (t.kind === 'champ') { skillHit(c, car); if (c.f.starsurge && last) stun(s, t, .8); } }); if (c.f.stellar) for (const al of alliesIn(s, c.team, z.x, z.y, 170)) haste(al, .2, 2.5); }, 'rupture'); } },
        },
      ],
    },
    solenne: {
      name: 'Solenne', role: 'Support', blurb: 'Every heal is a shot you can miss.',
      sight: 850, hp: 540, hpG: 76, dmg: 46, dmgG: 5, armor: 20, armG: 3.5, range: 300, as: .85, ms: 310, pref: 270, support: true, fit: { top: 0, jungle: 0, bottom: 1, support: 3 },
      passive: { name: 'First Light', d: 'Your heals give 15% move speed for 2 seconds, and healing past full health becomes a shield.' },
      builds: [
        { id: 'lifebringer', name: 'Lifebringer', tag: 'Healer', d: 'Mending Ray pierces allies and heals more, and Daybreak heals enormously. Your burn is weak.', stats: { dmg: .9 }, mods: { 0: { heal_add: 40, dmg_add: -20, cd_add: -.5, d: 'Heals every ally it passes. Burns the first enemy, weakly.' }, 2: { heal_add: 120 } } },
        { id: 'protector', name: 'Protector', tag: 'Shields', d: 'Aegis is wider, lasts longer and refreshes faster. Allies inside are shielded.', mods: { 1: { cd: 9.5, r_add: 30, dur: 3.6, d: 'A wide dome that destroys projectiles and shields allies inside.' } } },
        { id: 'sunlance', name: 'Sunlance', tag: 'Damage', d: 'Mending Ray burns hard and sets targets alight. Weaker heals. Viable bottom.', stats: { dmg: 1.12 }, mods: { 0: { dmg_add: 42, heal_add: -35, d: 'Burns the first enemy hard, leaving them alight. Heals weakly.' } } },
        { id: 'radiant', name: 'Radiant', tag: 'Aura', d: 'Mending Ray hops from an ally to another nearby. Nearby allies slowly regenerate.', mods: { 0: { d: 'Heals the first ally it hits, then hops to another nearby ally for 60%.' } } },
      ],
      evolves: [
        [{ id: 'quickray', name: 'Quick Ray', d: 'Mending Ray cooldown 1 shorter.', mods: { 0: { cd_add: -1 } } }, { id: 'longray', name: 'Long Ray', d: 'Mending Ray reaches 90 farther.', mods: { 0: { range_add: 90 } } }],
        [{ id: 'sundome', name: 'Sun Dome', d: 'Aegis heals allies inside it.' }, { id: 'solaris', name: 'Solaris', d: 'Daybreak also hastens allies and its cooldown is 10 shorter.', mods: { 2: { cd_add: -10 } } }],
      ],
      kit: [
        { name: 'Mending Ray', d: 'Heals the first ally it hits, or burns the first enemy.', fx: 'ray', cd: 5, range: 510, shape: 'line', w: 46, heal: 132, dmg: 82,
          cast(s, c, a, A) { fire(s, c, a, { speed: 1150, range: A.range, w: 46, fx: 'ray', filter: 'allchamp', hit(s, c, t, p) {
            if (t.team === c.team) { heal(s, c, t, A.heal * pow(c)); haste(t, .15, 2); skillHit(c, p); if (c.f.lifebringer) { p.pass = 1; return; } if (c.f.radiant && !p.hopped) { p.hopped = 1; const o = s.champs.find(x => x !== t && x !== c && x.alive && x.team === c.team && Math.hypot(x.x - t.x, x.y - t.y) < 280 && hasLOS(t.x, t.y, x.x, x.y)); if (o) heal(s, c, o, A.heal * .6 * pow(c)); } }
            else { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); slow(t, .3, 1.5); if (c.f.sunlance) bleed(s, c, t, 20 * pow(c), 2.5); skillHit(c, p); }
            p.left = 0; } }); },
        },
        { name: 'Aegis', d: 'Place a dome that destroys enemy projectiles.', fx: 'dome', cd: 12, range: 345, shape: 'circle', r: 120, dur: 2.6,
          cast(s, c, a, A) {
            const z = field(s, c, 'dome', { x: a.tx, y: a.ty, r: A.r, dur: A.dur, fx: 'dome' });
            z.step = c.f.protector || c.f.sundome ? (s, z) => { if (s.tick % 15 === 0) for (const al of alliesIn(s, c.team, z.x, z.y, z.r)) { if (c.f.protector && !z.sh) shield(s, al, 70 * hpow(c), 2); if (c.f.sundome) heal(s, c, al, 28 * pow(c)); } z.sh = 1; } : null;
          },
        },
        { name: 'Daybreak', d: 'Heals allies around you, cleanses stuns and throws enemies back.', fx: 'heal', cd: 52, range: 0, shape: 'self', r: 270, heal: 230,
          cast(s, c, a, A) { blast(s, c, c.x, c.y, A.r, .3, (s, z) => {
            for (const e of s.champs) if (e.alive && Math.hypot(e.x - z.x, e.y - z.y) < A.r) {
              if (e.team === c.team) { heal(s, c, e, A.heal * pow(c)); e.stunT = 0; e.slowT = 0; e.rootT = 0; if (c.f.solaris) haste(e, .25, 3); }
              else { const n = norm(e.x - z.x, e.y - z.y); hurt(s, c, e, 90 * pow(c), { skill: 1 }); dashDir(e, n.x, n.y, 160, 800, { forced: true }); }
            }
            c.stats.skillHits++;
          }, 'heal'); },
        },
      ],
      tick(s, c) { if (c.f.radiant && s.tick % 30 === 0) for (const al of alliesIn(s, c.team, c.x, c.y, 260)) if (al !== c) heal(s, c, al, 12 * pow(c)); },
    },
    sable: {
      name: 'Sable', role: 'Assassin', blurb: 'Strike from behind, then be somewhere else.',
      sight: 720, hp: 510, hpG: 74, dmg: 66, dmgG: 8, armor: 18, armG: 3, range: 125, as: 1.05, ms: 335, pref: 92, melee: true, fit: { top: 2, jungle: 3, bottom: 0, support: 0 },
      passive: { name: 'Nightstalker', d: 'Move 15% faster whenever no enemy can see you. For 1.5 seconds after any blink, Rend always counts as from behind.' },
      builds: [
        { id: 'ghost', name: 'Ghost', tag: 'Evasive', d: 'Echo comes back quickly and waits longer. Snapping back heals you.', mods: { 1: { cd: 6.5, window: 5.5, d: 'Blink away and leave an echo. Snap back within 5 seconds to heal.' } } },
        { id: 'reaper', name: 'Reaper', tag: 'Execute', d: 'Reap comes up far more often, executes harder, and any champion takedown resets it.', mods: { 2: { cd: 26, missing: .5, d: 'Blink behind a champion. Massive execute. A takedown resets it.' } } },
        { id: 'hunter', name: 'Hunter', tag: 'Jungle', d: 'Rend tears through monsters. Enemies under 30% health in fog are shown to you.', mods: { 0: { d: 'Short slash. Far stronger against monsters.' } } },
        { id: 'twin', name: 'Twin', tag: 'Trickster', d: 'While your echo stands, Rend also strikes from the echo.', mods: { 0: { d: 'Short slash. While your echo stands, it slashes too.' } } },
      ],
      evolves: [
        [{ id: 'sharperend', name: 'Sharper Rend', d: 'Rend cooldown 0.7 shorter.', mods: { 0: { cd_add: -.7 } } }, { id: 'wideblade', name: 'Wide Blade', d: 'Rend reaches 30 farther and sweeps wider.', mods: { 0: { range_add: 30, dot: .5 } } }],
        [{ id: 'phantom', name: 'Phantom', d: 'Snapping back with Echo stuns the enemies around you for 0.6.' }, { id: 'deathmark', name: 'Death Mark', d: 'A target hit by Reap takes 15% more from you for 4 seconds.' }],
      ],
      kit: [
        { name: 'Rend', d: 'Short slash. Hits half again as hard from behind.', fx: 'slash', cd: 3.5, range: 180, shape: 'cone', w: 150, dmg: 92, dot: .72,
          cast(s, c, a, A) { const hitF = (px, py, dx, dy, mul) => { let hit = 0; eachEnemy(s, c, px, py, A.range, t => { const n = norm(t.x - px, t.y - py); if (n.x * dx + n.y * dy < A.dot || !hasLOS(px, py, t.x, t.y)) return; const back = c.behindT > 0 || (t.fx || 0) * -n.x + (t.fy || 0) * -n.y < -.25; let d = A.dmg * pow(c) * (back ? 1.5 : 1) * mul; if (c.f.hunter && t.kind === 'monster') d *= 1.8; hurt(s, c, t, d, { skill: 1, crit: back }); if (t.kind === 'champ') hit = 1; }); return hit; };
            let hit = hitF(c.x, c.y, a.dx, a.dy, 1); if (c.f.twin && c.echo) hit |= hitF(c.echo.x, c.echo.y, a.dx, a.dy, .7);
            if (hit) c.stats.skillHits++; },
        },
        { name: 'Echo', d: 'Blink away and leave an echo. Cast again to snap back.', fx: 'blink', cd: 10, range: 240, shape: 'dash', w: 60, over: true, recastInstant: true, armsRecast: true, window: 3.5,
          cast(s, c, a, A) { c.behindT = 1.5; c.echo = { x: c.x, y: c.y }; const f = nearestFree(s.map, a.tx, a.ty); s.ev.push({ e: 'blink', x: c.x, y: c.y }); c.x = f.x; c.y = f.y; c.recast[1] = A.window; s.ev.push({ e: 'blink', x: c.x, y: c.y }); },
          recast(s, c, a, A) { if (!c.echo) return; c.behindT = 1.5; s.ev.push({ e: 'blink', x: c.x, y: c.y }); c.x = c.echo.x; c.y = c.echo.y; c.echo = null; s.ev.push({ e: 'blink', x: c.x, y: c.y }); if (c.f.ghost) heal(s, c, c, c.maxHp * .1); if (c.f.phantom) for (const t of enemiesIn(s, c, c.x, c.y, 150)) if (t.kind === 'champ') stun(s, t, .6); },
        },
        { name: 'Reap', d: 'Blink behind a champion. Execute damage. A kill resets it.', fx: 'blink', cd: 40, range: 360, shape: 'circle', r: 90, over: true, target: true, dmg: 125, missing: .35,
          cast(s, c, a, A) { const t = nearChamp(s, c, a.tx, a.ty, 180); if (!t || dist(c, t) > A.range + 45) return false; const n = { x: t.fx || 1, y: t.fy || 0 }; s.ev.push({ e: 'blink', x: c.x, y: c.y }); const f = nearestFree(s.map, t.x - n.x * 90, t.y - n.y * 90); c.x = f.x; c.y = f.y; c.fx = n.x; c.fy = n.y; c.behindT = 1.5; c.reap = { id: t.id, t: 2 }; hurt(s, c, t, (A.dmg * pow(c)) + (t.maxHp - t.hp) * A.missing, { skill: 1, crit: 1 }); c.stats.skillHits++; if (c.f.deathmark) { t.markedBy = c.id; t.dmarkT = 4; } s.ev.push({ e: 'blink', x: c.x, y: c.y }); },
        },
      ],
      tick(s, c) { const seen = canSee(s, 1 - c.team, c); if (!seen) haste(c, .15, .1); if (c.f.hunter && s.tick % 15 === 0) for (const e of s.champs) if (e.alive && e.team !== c.team && e.hp / e.maxHp < .3) e.revealT = Math.max(e.revealT || 0, .6); },
    },
    gravel: {
      name: 'Gravel', role: 'Tank', blurb: 'One good hook moves the whole fight.',
      sight: 680, hp: 720, hpG: 112, dmg: 54, dmgG: 6, armor: 34, armG: 5, range: 150, as: .8, ms: 305, pref: 120, melee: true, fit: { top: 2, jungle: 2, bottom: 0, support: 3 },
      passive: { name: 'Immovable', d: 'Above 40% health nothing can push, drag or lift you. Dropping below it hardens you for 3 seconds, once every 30 seconds.' },
      builds: [
        { id: 'anchor', name: 'Anchor', tag: 'Catch', d: 'Chain reaches farther and stuns longer, but takes longer to come back.', mods: { 0: { range: 555, stun: .5, cd_add: 2, d: 'Long reach. Drags the first enemy to you and holds them a moment.' } } },
        { id: 'juggernaut', name: 'Juggernaut', tag: 'Bruiser', d: 'Avalanche comes up far more often. Stomp is wider and hits harder. Lighter hook.', mods: { 0: { dmg_add: -20 }, 1: { r_add: 35, dmg_add: 30, d: 'Wide, strong stomp. Slow everyone around you and harden.' }, 2: { cd: 30 } } },
        { id: 'warden', name: 'Warden', tag: 'Protect', d: 'Chain hooks allies to safety. Stomp shields allies beside you.', mods: { 0: { filter: 'allchamp', d: 'Hook the first champion it hits: drags an enemy to you, or pulls an ally to safety.' }, 1: { d: 'Slow everyone around you, harden, and shield nearby allies.' } } },
        { id: 'seismic', name: 'Seismic', tag: 'Zone', d: 'Stomp sends an aftershock a moment later and slows much harder.', mods: { 1: { slowA: .55, d: 'Slow everyone around you hard; a second pulse follows.' } } },
      ],
      evolves: [
        [{ id: 'longchain', name: 'Long Chain', d: 'Chain reaches 60 farther.', mods: { 0: { range_add: 60 } } }, { id: 'hardstomp', name: 'Hard Stomp', d: 'Stomp radius 30 larger.', mods: { 1: { r_add: 30 } } }],
        [{ id: 'lastwall', name: 'Last Wall', d: 'Avalanche stuns 0.4 longer.' }, { id: 'unbroken', name: 'Unbroken', d: 'Stomp hardens you for a full 4 seconds.' }],
      ],
      kit: [
        { name: 'Chain', d: 'Hook the first enemy it hits and drag them to you.', fx: 'chain', cd: 9, range: 465, shape: 'line', w: 50, dmg: 64, stun: .15, filter: 'chainable',
          cast(s, c, a, A) { fire(s, c, a, { speed: 1050, range: A.range, w: 50, fx: 'chain', filter: A.filter === 'allchamp' ? 'allchainable' : A.filter, hit(s, c, t, p) {
            if (t.team === c.team) { const n = norm(c.x - t.x, c.y - t.y), l = Math.max(0, n.l - 90); dashDir(t, n.x, n.y, l, 1200, { forced: true }); shield(s, t, 90 * hpow(c), 3); skillHit(c, p); p.left = 0; return; }
            hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); const n = norm(c.x - t.x, c.y - t.y), l = Math.max(0, n.l - 90); dashDir(t, n.x, n.y, l, 1300, { forced: true }); t.stunT = Math.max(t.stunT || 0, l / 1300 + A.stun); if (t.kind === 'champ') skillHit(c, p); p.left = 0; } }); },
        },
        { name: 'Stomp', d: 'Slow everyone around you and harden for a moment.', fx: 'stomp', cd: 8, range: 0, shape: 'self', r: 180, dmg: 62, slowA: .4,
          cast(s, c, a, A) { const go = () => { let hit = false; s.ev.push({ e: 'boom', x: c.x, y: c.y, r: A.r, fx: 'stomp' }); eachEnemy(s, c, c.x, c.y, A.r, t => { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); slow(t, A.slowA, 1.5); if (t.kind === 'champ') hit = true; }); return hit; }; const hit = go(); c.drT = c.f.unbroken ? 4 : 2.5; if (c.f.warden) for (const al of alliesIn(s, c.team, c.x, c.y, A.r + 45)) shield(s, al, 80 * hpow(c), 3); if (c.f.seismic) blast(s, c, c.x, c.y, A.r, .55, () => { go(); }, 'stomp'); if (hit) c.stats.skillHits++; },
        },
        { name: 'Avalanche', d: 'Unstoppable charge. Stuns around the first champion you hit.', fx: 'dash', cd: 48, range: 480, shape: 'line', w: 110, pd: [480, 1000], dmg: 165,
          cast(s, c, a, A) { dashDir(c, a.dx, a.dy, A.range, 1000, { unstop: true, champOnly: true, onHit(s, c, t) { c.dash = null; s.ev.push({ e: 'boom', x: c.x, y: c.y, r: 155, fx: 'crash' }); eachEnemy(s, c, c.x, c.y, 155, e => { hurt(s, c, e, A.dmg * pow(c), { skill: 1 }); if (e.kind === 'champ') stun(s, e, 1.25 + (c.f.lastwall ? .4 : 0)); }, true); c.stats.skillHits++; } }); },
        },
      ],
      tick(s, c) { if (c.pcdT > 0) c.pcdT -= DT; if (c.hp < c.maxHp * .4 && !(c.pcdT > 0) && c.alive) { c.pcdT = 30; c.drT = Math.max(c.drT, 3); s.ev.push({ e: 'boom', x: c.x, y: c.y, r: 90, fx: 'stomp' }); } c.pready = c.pcdT > 0 ? 0 : 1; },
    },

    // ---------- Villains ----------
    deadbolt: {
      name: 'Deadbolt', role: 'Marksman', blurb: 'Lay the wire, then finish what it caught.',
      sight: 950, hp: 505, hpG: 70, dmg: 58, dmgG: 7, armor: 15, armG: 3, range: 360, as: 1.0, ms: 305, pref: 325, fit: { top: 1, jungle: 0, bottom: 3, support: 0 },
      passive: { name: 'Deadlock', d: 'Basic attacks against rooted or slowed targets crit for 50% more. A wire that catches a champion refunds 3 seconds of Ricochet.' },
      builds: [
        { id: 'trapper', name: 'Trapper', tag: 'Traps', d: 'Up to three wires, longer lasting and tighter. Your bullets stay modest.', stats: { dmg: .93 }, mods: { 0: { cd: 6.5, dur: 22, maxWires: 3, rootT: 1.5, d: 'Lay up to three wires. Each roots the first enemy to cross it.' } } },
        { id: 'deadeyed', name: 'Dead Aim', tag: 'Poke', d: 'Ricochet flies far and hits very hard but never bounces.', mods: { 1: { range: 690, dmg_add: 75, bounces: 0, cd_add: 1.5, d: 'A long, heavy shot. No bounce.' } } },
        { id: 'gunslinger', name: 'Gunslinger', tag: 'Attack speed', d: 'Ricochet bounces three times. Every fourth basic attack also crits.', stats: { as: 1.14, dmg: .94 }, mods: { 1: { bounces: 3, bdmg: .7, d: 'A shot that bounces between up to four targets.' } } },
        { id: 'jailer', name: 'Jailer', tag: 'Control', d: 'Lockdown comes up more, is wider and slows much harder, but its shots are gentle.', mods: { 2: { cd: 38, r_add: 45, slowA: .45, shot: 28, d: 'Marks a wide zone that reveals, slows hard and fires light shots.' } } },
      ],
      evolves: [
        [{ id: 'taut', name: 'Taut Wire', d: 'Tripwire roots 0.3 longer.', mods: { 0: { rootT_add: .3 } } }, { id: 'hairtrigger', name: 'Hair Trigger', d: 'Ricochet cooldown 1.5 shorter.', mods: { 1: { cd_add: -1.5 } } }],
        [{ id: 'crossfire', name: 'Crossfire', d: 'Lockdown fires twice as fast.' }, { id: 'killbox', name: 'Kill Box', d: 'Lockdown is 45 wider and roots enemies inside it when it starts.', mods: { 2: { r_add: 45 } } }],
      ],
      kit: [
        { name: 'Tripwire', d: 'Lay a wire across a path. The first enemy to cross it is rooted.', fx: 'tripwire', cd: 9, range: 465, shape: 'circle', r: 130, wire: true, dur: 13, maxWires: 2, rootT: 1.25, dmg: 62,
          cast(s, c, a, A) {
            const nx = -a.dy, ny = a.dx, w1 = rayWall(a.tx, a.ty, nx, ny, A.r), w2 = rayWall(a.tx, a.ty, -nx, -ny, A.r);
            const mine = s.zones.filter(z => z.kind === 'tripline' && z.owner === c); if (mine.length >= A.maxWires) mine[0].dead = true;
            const z = field(s, c, 'tripline', lineZone({ r: A.r, dur: A.dur, arm: .25 }, a.tx + nx * w1, a.ty + ny * w1, a.tx - nx * w2, a.ty - ny * w2));
            z.step = (s, z) => { if (z.arm > 0) { z.arm -= DT; return; } for (const t of s.champs) if (t.alive && !t.air && t.team !== c.team && segDist(t.x, t.y, z.x1, z.y1, z.x2, z.y2) < t.r + 12) { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); root(s, t, A.rootT); c.cd[1] = Math.max(0, c.cd[1] - 3); z.t = 0; s.ev.push({ e: 'boom', x: t.x, y: t.y, r: 70, fx: 'tripwire' }); c.stats.skillHits++; return; } };
          },
        },
        { name: 'Ricochet', d: 'A shot that bounces to a second target.', fx: 'ricochet', cd: 6, range: 495, shape: 'line', w: 36, dmg: 80, bounces: 1, bdmg: .7,
          cast(s, c, a, A) { fire(s, c, a, { speed: 1500, range: A.range, w: A.w, fx: 'ricochet', filter: 'units', hit(s, c, t, p) {
            hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.kind === 'champ') skillHit(c, p); p.left = 0;
            ricochetNext(s, c, A, t, new Set([t.id]), A.bounces, A.bdmg);
          } }); },
        },
        { name: 'Lockdown', d: 'Marks a zone that reveals and slows and fires at those inside.', fx: 'lockdown', cd: 55, range: 675, shape: 'circle', r: 215, dur: 4.5, slowA: .25, shot: 56,
          cast(s, c, a, A) {
            const every = c.f.crossfire ? 11 : 21;
            const z = field(s, c, 'lockdown', { x: a.tx, y: a.ty, r: A.r, dur: A.dur, n: 0 });
            if (c.f.killbox) for (const t of enemiesIn(s, c, a.tx, a.ty, A.r)) if (t.kind === 'champ') root(s, t, .9);
            z.step = (s, z) => {
              if (s.tick % 6 === 0) for (const t of s.champs) if (t.alive && t.team !== c.team && Math.hypot(t.x - z.x, t.y - z.y) < z.r + t.r) { t.revealT = Math.max(t.revealT || 0, .4); slow(t, A.slowA, .35); if (t.stealthT > 0) breakStealth(s, t); }
              if (++z.n >= every) { z.n = 0; const list = s.champs.filter(t => t.alive && !t.air && t.team !== c.team && Math.hypot(t.x - z.x, t.y - z.y) < z.r + t.r); if (list.length) { const t = list[s.rand() * list.length | 0]; blast(s, c, t.x + (t.vx || 0) * .2, t.y + (t.vy || 0) * .2, 70, .28, (s, b) => { for (const e of enemiesIn(s, c, b.x, b.y, 70)) if (e.kind === 'champ') { hurt(s, c, e, A.shot * pow(c), { skill: 1 }); if (!z.counted) { z.counted = true; c.stats.skillHits++; } } }, 'lockdown'); } }
            };
          },
        },
      ],
      onBasic(s, c, t, o) { if (t.rootT > 0 || t.slowT > 0) { o.dmg *= 1.5; o.crit = true; } if (c.f.gunslinger) { c.pstack = ((c.pstack || 0) + 1) % 4; if (!c.pstack) { o.dmg *= 1.5; o.crit = true; } } },
    },
    duelist: {
      name: 'Duelist', role: 'Fighter', blurb: 'Circle them, cut them, salute them.',
      sight: 720, hp: 600, hpG: 90, dmg: 62, dmgG: 8, armor: 26, armG: 4, range: 140, as: .98, ms: 330, pref: 105, melee: true, fit: { top: 3, jungle: 2, bottom: 0, support: 0 },
      passive: { name: 'Flurry of Angles', d: 'Hitting a target from a new angle builds up to 5 stacks, each adding 5% damage. Stacks fade after 3 seconds. The third cut of Flourish takes 4 seconds off Feint.' },
      builds: [
        { id: 'fencer', name: 'Fencer', tag: 'Combo', d: 'Flourish refreshes on a clean finish. Longer window, and the third cut stuns longer.', mods: { 0: { cd: 6, window: 2.4, knockT: .9, d: 'Three quick cuts. Land the third on a champion to refund half the cooldown.' } } },
        { id: 'masquerade', name: 'Masquerade', tag: 'Trickster', d: 'Feint is quick and long. The decoy bursts when it ends and damages nearby enemies.', mods: { 1: { cd: 7.5, stealth: 1.9, d: 'A decoy steps away and bursts, while you vanish longer.' } } },
        { id: 'honorbound', name: 'Honorbound', tag: 'Duel', d: 'Final Salute comes up much sooner and you hit far harder inside the ring. Win a duel to reset it.', mods: { 2: { cd: 30, dur: 4, dmgBoost: 1.3, d: 'Binds one enemy into a ring. You hit 30% harder inside. A kill resets it.' } } },
        { id: 'bladestorm', name: 'Bladestorm', tag: 'Waves', d: 'The third cut of Flourish spins around you. Stacks of Flurry also grant speed.', mods: { 0: { dmg1_add: 14, dmg2_add: 30, d: 'Three quick cuts. The third is a whirl that hits everything around you.' } } },
      ],
      evolves: [
        [{ id: 'lunging', name: 'Lunging Cut', d: 'The second cut of Flourish reaches 40 farther.', mods: { 0: { reach1_add: 40 } } }, { id: 'pirouette', name: 'Pirouette', d: 'Feint also dashes you the opposite way.' }],
        [{ id: 'coupdegrace', name: 'Coup de Grace', d: 'The third cut adds 12% of the target\'s missing health.' }, { id: 'lastbow', name: 'Last Bow', d: 'Final Salute stuns the target for 0.5 when it starts.' }],
      ],
      kit: [
        { name: 'Flourish', d: 'Three quick cuts, each within a window. The third knocks up.', fx: 'flourish', cd: 8, range: 0, shape: 'self', instant: true, armsRecast: true, chain: 2, window: 1.8, knockT: .6, reach0: 160, reach1: 190, reach2: 175, dmg0: 48, dmg1: 56, dmg2: 82,
          cast(s, c, a, A) { flourish(s, c, A, 0); c.fstep = 1; c.recast[0] = A.window; },
          recast(s, c, a, A) { const n = c.fstep || 1; flourish(s, c, A, n); if (n < 2) { c.fstep = n + 1; c.recast[0] = A.window; } else { c.fstep = 0; c.recast[0] = 0; } },
        },
        { name: 'Feint', d: 'A decoy steps away while you briefly vanish.', fx: 'feint', cd: 12, range: 255, shape: 'dash', w: 60, stealth: 1.3, keepStealth: true,
          cast(s, c, a, A) {
            const z = field(s, c, 'decoy', { x: c.x, y: c.y, r: 26, dur: 1.5, x0: c.x, vx: a.dx * 300, vy: a.dy * 300 });
            z.step = (s, z) => { z.x += z.vx * DT; z.y += z.vy * DT; if (rayWall(z.x, z.y, a.dx, a.dy, 8) < 8) z.vx = z.vy = 0; };
            z.end = (s, z) => { s.ev.push({ e: 'boom', x: z.x, y: z.y, r: 120, fx: 'feint' }); if (c.f.masquerade) for (const t of enemiesIn(s, c, z.x, z.y, 145, true)) hurt(s, c, t, 150 * pow(c), { skill: 1 }); };
            stealth(s, c, A.stealth); if (c.f.pirouette) dashDir(c, -a.dx, -a.dy, 150, 1000);
          },
        },
        { name: 'Final Salute', d: 'Binds one enemy into a short duel ring neither can leave.', fx: 'salute', cd: 50, range: 315, shape: 'circle', r: 110, target: true, dur: 3.2, dmgBoost: 1.12,
          cast(s, c, a, A) {
            const t = nearChamp(s, c, a.tx, a.ty, 180); if (!t || dist(c, t) > A.range + 45 || !hasLOS(c.x, c.y, t.x, t.y)) return false;
            const z = field(s, c, 'ring', { x: (c.x + t.x) / 2, y: (c.y + t.y) / 2, r: 200, dur: A.dur, a: c, b: t, boost: A.dmgBoost, tgt: t.id });
            c.duelZ = z; t.duelZ = z; c.stats.skillHits++; if (c.f.lastbow) stun(s, t, .5);
            z.step = (s, z) => { if (!z.a.alive || !z.b.alive) { z.t = 0; if (c.f.honorbound && !z.b.alive && z.a.alive) c.cd[2] = Math.min(c.cd[2], 6); } };
            z.end = (s, z) => { z.a.duelZ = z.b.duelZ = null; };
          },
        },
      ],
      onBasic(s, c, t, o) {
        const n = norm(t.x - c.x, t.y - c.y), id = t.id, last = c.anglesOn === id ? c.angleL : null;
        if (last === null || last.x * n.x + last.y * n.y < .82) { c.pstack = Math.min(5, (c.pstack || 0) + 1); c.anglesOn = id; c.angleL = { x: n.x, y: n.y }; if (c.f.bladestorm) haste(c, .03 * c.pstack, 2); }
        o.dmg *= 1 + .05 * (c.pstack || 0); c.ptime = 3;
      },
      tick(s, c) { if (c.ptime > 0) { c.ptime -= DT; if (c.ptime <= 0) c.pstack = 0; } },
    },
    hex: {
      name: 'Hex', role: 'Curse mage', blurb: 'Stack the curses, then call them in.',
      sight: 850, hp: 495, hpG: 66, dmg: 50, dmgG: 5, armor: 14, armG: 3, range: 320, as: .85, ms: 300, pref: 290, fit: { top: 1, jungle: 0, bottom: 3, support: 2 },
      passive: { name: 'Contagion', d: 'When a cursed enemy dies, their curses spread to enemies nearby. Each curse strips 6 magic resist.' },
      builds: [
        { id: 'cursebinder', name: 'Cursebinder', tag: 'Stacks', d: 'Curses stack to five and linger. Hex Bolt is faster, and full stacks detonate far harder.', mods: { 0: { cd: 2.6, d: 'Stacks curses up to five. At five, the next hit detonates them.' } } },
        { id: 'transmuter', name: 'Transmuter', tag: 'Control', d: 'Polymorph comes up fast and turns targets into very fragile coins.', mods: { 1: { cd: 8.5, w_add: 10, d: 'Turns a target into a spinning coin that takes 25% more damage.' } } },
        { id: 'ritualist', name: 'Ritualist', tag: 'Team fight', d: 'Coven comes up sooner, drags harder and detonates wider.', mods: { 2: { cd: 38, r_add: 45, pull_add: 70 } } },
        { id: 'jinx', name: 'Jinx', tag: 'Support', d: 'Curses slow, and allies who hit a cursed enemy heal a little.', mods: { 0: { d: 'Stacks curses that slow. Allies heal by hitting cursed enemies.' } } },
      ],
      evolves: [
        [{ id: 'swiftbolt', name: 'Swift Bolt', d: 'Hex Bolt cooldown 0.6 shorter.', mods: { 0: { cd_add: -.6 } } }, { id: 'bigpoly', name: 'Long Change', d: 'Polymorph lasts 0.3 longer and is a little wider.', mods: { 1: { dur_add: .3, w_add: 12 } } }],
        [{ id: 'covenant', name: 'Covenant', d: 'Coven is 30 wider and drags harder.', mods: { 2: { r_add: 30, pull_add: 50 } } }, { id: 'hexburst', name: 'Hex Burst', d: 'Detonations also curse enemies around the target.' }],
      ],
      kit: [
        { name: 'Hex Bolt', d: 'Stacks curses. At full stacks the next hit detonates them.', fx: 'hexbolt', cd: 3.5, range: 495, shape: 'line', w: 40, dmg: 76,
          cast(s, c, a, A) { fire(s, c, a, { speed: 1100, range: A.range, w: A.w, fx: 'hexbolt', filter: 'units', hit(s, c, t, p) {
            hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.kind === 'champ') skillHit(c, p); p.left = 0;
            if (t.alive) { if ((t.curseT > 0 ? t.curseN : 0) >= curseCap(c)) detonate(s, c, t, 1); else curse(s, c, t, 1); if (c.f.jinx && t.curseN) slow(t, .08 * t.curseN, 1.5); }
          } }); },
        },
        { name: 'Polymorph', d: 'Skillshot. Turns a target into a harmless spinning coin for a moment.', fx: 'polymorph', cd: 13, range: 450, shape: 'line', w: 36, dur: 1.25,
          cast(s, c, a, A) { fire(s, c, a, { speed: 1250, range: A.range, w: A.w, fx: 'polymorph', filter: 'champ', hit(s, c, t, p) { if (t.team === c.team) return; poly(s, t, A.dur); if (c.f.transmuter) t.vulnT = A.dur; skillHit(c, p); p.left = 0; } }); },
        },
        { name: 'Coven', d: 'A zone that drags enemies to its centre and detonates curses.', fx: 'coven', cd: 50, range: 480, shape: 'circle', r: 240, dur: 1.9, pull: 150, dmg: 120,
          cast(s, c, a, A) {
            const z = field(s, c, 'coven', { x: a.tx, y: a.ty, r: A.r, dur: A.dur });
            z.step = (s, z) => { for (const t of s.champs) if (t.alive && !t.air && t.team !== c.team && Math.hypot(t.x - z.x, t.y - z.y) < z.r + t.r && !(t.dash && t.dash.unstop)) { const n = norm(z.x - t.x, z.y - t.y); if (n.l > 30) { t.x += n.x * A.pull * DT; t.y += n.y * A.pull * DT; pushOut(s.map, t); } } };
            z.end = (s, z) => { s.ev.push({ e: 'boom', x: z.x, y: z.y, r: z.r, fx: 'coven' }); let hit = false; for (const t of enemiesIn(s, c, z.x, z.y, z.r)) { if (t.kind === 'champ') hit = true; hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.alive && (t.curseT > 0 ? t.curseN : 0) > 0) detonate(s, c, t, 1.4); } if (hit) c.stats.skillHits++; };
          },
        },
      ],
    },
    plague: {
      name: 'Plague Doctor', role: 'Attrition support', blurb: 'Nobody leaves the ward healthy.',
      sight: 850, hp: 520, hpG: 76, dmg: 46, dmgG: 5, armor: 20, armG: 3.5, range: 300, as: .85, ms: 310, pref: 270, support: true, fit: { top: 2, jungle: 0, bottom: 1, support: 3 },
      passive: { name: 'Vile Recovery', d: 'Poisoned enemies nearby slowly heal you, and everything they deal is 10% weaker.' },
      builds: [
        { id: 'apothecary', name: 'Apothecary', tag: 'Support', d: 'Leech feeds allies for much more and comes back faster. Weak poison.', mods: { 1: { cd: 7, heal: 1.15, d: 'Tether an enemy, draining them and feeding your lowest ally for much more.' }, 0: { dps_add: -8 } } },
        { id: 'pestilence', name: 'Pestilence', tag: 'Damage over time', d: 'Miasma is wider, longer and far deadlier.', mods: { 0: { r_add: 35, dur: 7.5, dps_add: 9 }, 1: { heal: .3 } } },
        { id: 'bloodletter', name: 'Bloodletter', tag: 'Bruiser', d: 'Leech feeds only you, drains hard, and your attacks land sturdily. A top laner who will not die.', stats: { hp: 1.15, dmg: 1.1 }, mods: { 1: { dps_add: 24, heal: .8, d: 'Tether an enemy and drain them. Feeds only you.' } } },
        { id: 'ward', name: 'The Ward', tag: 'Zone', d: 'Quarantine comes up far sooner and slows harder.', mods: { 2: { cd: 32, slowA: .42, r_add: 30 } } },
      ],
      evolves: [
        [{ id: 'thickfog', name: 'Thick Fog', d: 'Miasma radius 25 larger.', mods: { 0: { r_add: 25 } } }, { id: 'fastdraw', name: 'Quick Draw', d: 'Leech cooldown 2 shorter.', mods: { 1: { cd_add: -2 } } }],
        [{ id: 'lockward', name: 'Locked Ward', d: 'Quarantine reveals enemies inside.' }, { id: 'blacktide', name: 'Black Tide', d: 'Miasma also slows by 25%.' }],
      ],
      kit: [
        { name: 'Miasma', d: 'A lingering poison cloud.', fx: 'miasma', cd: 8, range: 420, shape: 'circle', r: 145, dur: 5, dps: 23,
          cast(s, c, a, A) {
            const z = field(s, c, 'miasma', { x: a.tx, y: a.ty, r: A.r, dur: A.dur, n: 0 });
            z.step = (s, z) => { if (s.tick % 9) return; for (const t of enemiesIn(s, c, z.x, z.y, z.r)) { poison(s, c, t, A.dps * pow(c), 2); if (c.f.blacktide) slow(t, .25, .4); if (t.kind === 'champ' && !z.counted) { z.counted = true; c.stats.skillHits++; } } };
          },
        },
        { name: 'Leech', d: 'A tether draining an enemy and feeding an ally.', fx: 'leech', cd: 10, range: 405, shape: 'circle', r: 120, target: true, dur: 3, dps: 44, heal: .6,
          cast(s, c, a, A) {
            const t = nearChamp(s, c, a.tx, a.ty, 180); if (!t || dist(c, t) > A.range + 45 || !hasLOS(c.x, c.y, t.x, t.y)) return false;
            c.stats.skillHits++;
            const z = field(s, c, 'tether', { x: c.x, y: c.y, r: 20, dur: A.dur, tgt: t.id, n: 0 });
            z.step = (s, z) => { z.x = c.x; z.y = c.y; if (!c.alive || !t.alive || t.air || dist(c, t) > A.range + 150 || !hasLOS(c.x, c.y, t.x, t.y)) { z.t = 0; return; } if (s.tick % 6 === 0) { const a2 = hurt(s, c, t, A.dps * .2 * pow(c), { skill: 1, dot: 1 }); const to = c.f.bloodletter ? c : lowestAlly(s, c, 480, true) || c; heal(s, c, to, (a2 || 0) * A.heal); } };
          },
        },
        { name: 'Quarantine', d: 'A zone that blocks healing and slows.', fx: 'quarantine', cd: 52, range: 480, shape: 'circle', r: 250, dur: 5, slowA: .28,
          cast(s, c, a, A) {
            const z = field(s, c, 'quarantine', { x: a.tx, y: a.ty, r: A.r, dur: A.dur });
            z.step = (s, z) => { if (s.tick % 5) return; for (const t of s.champs) if (t.alive && t.team !== c.team && Math.hypot(t.x - z.x, t.y - z.y) < z.r + t.r) { t.noHealT = .3; slow(t, A.slowA, .3); if (c.f.lockward) t.revealT = Math.max(t.revealT || 0, .3); if (!z.counted) { z.counted = true; c.stats.skillHits++; } } };
          },
        },
      ],
      tick(s, c) { if (s.tick % 15) return; let n = 0; for (const t of s.champs) if (t.alive && t.team !== c.team && t.poisonT > 0 && Math.hypot(t.x - c.x, t.y - c.y) < 420) n++; if (n && c.hp < c.maxHp) heal(s, c, c, c.maxHp * .004 * n); },
    },
    shiv: {
      name: 'Shiv', role: 'Stealth assassin', blurb: 'If you can see her, she missed.',
      sight: 720, hp: 500, hpG: 72, dmg: 68, dmgG: 8, armor: 18, armG: 3, range: 125, as: 1.05, ms: 335, pref: 92, melee: true, fit: { top: 2, jungle: 3, bottom: 0, support: 0 },
      passive: { name: 'Opening Cut', d: 'The first strike out of stealth crits for 60% more and cripples the target, slowing them by half for a second.' },
      builds: [
        { id: 'cutthroat', name: 'Cutthroat', tag: 'Burst', d: 'Shank bleeds harder and refreshes on any bleeding kill.', mods: { 0: { dps_add: 16, d: 'Dash through. Deep bleed. A kill on a bleeding enemy resets it.' } } },
        { id: 'nightblade', name: 'Nightblade', tag: 'Stealth', d: 'Vanish comes up fast and lasts longer, and you move faster inside it.', mods: { 1: { cd: 8.5, dur: 3.1, ms: .32, d: 'Long stealth with a big speed boost. Fades on attack.' } } },
        { id: 'butcher', name: 'Butcher', tag: 'Team fight', d: 'Thousand Cuts cleaves everything around the target and comes up sooner.', mods: { 2: { cd: 32, d: 'Rapid untargetable strikes that also cleave around the target.' } } },
        { id: 'venomous', name: 'Venomous', tag: 'Attrition', d: 'Attacks poison, and Shank has a shorter cooldown but less bite. Nothing about this is quick, just inevitable.', mods: { 0: { cd: 4.8, dmg_add: -18, d: 'Quick dash through. Light bleed that slows.' } } },
      ],
      evolves: [
        [{ id: 'longshank', name: 'Long Shank', d: 'Shank reaches 50 farther.', mods: { 0: { range_add: 50 } } }, { id: 'deepcut', name: 'Deep Cut', d: 'Shank bleeds for 25% more.', mods: { 0: { dps_mul: 1.25 } } }],
        [{ id: 'fadeaway', name: 'Fade Away', d: 'Starting Vanish cleanses slows and roots and heals you 8%.' }, { id: 'finishing', name: 'Finishing Stroke', d: 'The last strike of Thousand Cuts adds 15% of missing health.' }],
      ],
      kit: [
        { name: 'Shank', d: 'Dash through with a bleed.', fx: 'shank', cd: 7, range: 240, shape: 'dash', w: 70, pd: [240, 1250], dmg: 58, dps: 22,
          cast(s, c, a, A) { const car = {}; dashDir(c, a.dx, a.dy, A.range, 1250, { onHit(s, c, t) { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.alive) { bleed(s, c, t, A.dps * pow(c), 3); if (c.f.venomous) slow(t, .22, 2); } if (t.kind === 'champ') { skillHit(c, car); } } }); },
        },
        { name: 'Vanish', d: 'Short stealth, hidden even with vision. Fades on attack.', fx: 'vanish', cd: 13, range: 0, shape: 'self', instant: true, keepStealth: true, dur: 2.2, ms: .2,
          cast(s, c, a, A) { stealth(s, c, A.dur); haste(c, A.ms, A.dur); if (c.f.fadeaway) { c.slowT = 0; c.rootT = 0; heal(s, c, c, c.maxHp * .08); } },
        },
        { name: 'Thousand Cuts', d: 'Rapid untargetable strikes on one target.', fx: 'cuts', cd: 42, range: 320, shape: 'circle', r: 100, target: true, over: true, strikes: 6, dmg: 36,
          cast(s, c, a, A) { const t = nearChamp(s, c, a.tx, a.ty, 180); if (!t || dist(c, t) > A.range + 45) return false; c.stats.skillHits++; c.cuts = { id: t.id, n: A.strikes, next: 0, A }; c.air = 1; s.ev.push({ e: 'blink', x: c.x, y: c.y }); },
        },
      ],
      onBasic(s, c, t, o) { if (c.f.venomous) poison(s, c, t, 14 * pow(c), 2); },
      tick(s, c) { c.pready = c.stealthT > 0 || c.opener > 0 ? 1 : 0; },
    },
    ironjaw: {
      name: 'Ironjaw', role: 'Brawler tank', blurb: 'Hit him. It only makes it worse.',
      sight: 680, hp: 655, hpG: 100, dmg: 54, dmgG: 6, armor: 30, armG: 4, range: 150, as: .82, ms: 305, pref: 120, melee: true, fit: { top: 3, jungle: 2, bottom: 0, support: 3 },
      passive: { name: 'Rage', d: 'Taking damage builds rage. Rage makes your basic attacks up to 50% stronger and Grab hold up to 60% longer, spending half of it.' },
      builds: [
        { id: 'brawler', name: 'Brawler', tag: 'Brawl', d: 'Attacking builds rage too, and full rage reaches further.', stats: { as: 1.08 }, mods: {} },
        { id: 'wrecker', name: 'Wrecker', tag: 'Area', d: 'Wrecking Ball orbits longer, wider and comes up sooner.', mods: { 0: { cd: 7, dur: 4.2, orbit_add: 30, dmg_add: 10 } } },
        { id: 'bouncer', name: 'Bouncer', tag: 'Catch', d: 'Grab reaches far and hurls enemies straight at your nearest ally or tower.', mods: { 1: { range: 240, stunT: 1.25, d: 'Seize an enemy from farther and hurl them at your nearest ally or tower.' } } },
        { id: 'fortress', name: 'Fortress', tag: 'Tank', d: 'Rage hardens into a shield. Demolish comes up sooner, lighter hits.', stats: { hp: 1.12, dmg: .88 }, mods: { 2: { cd: 34 } } },
      ],
      evolves: [
        [{ id: 'heavyball', name: 'Heavy Ball', d: 'Wrecking Ball slows on contact.' }, { id: 'longreach', name: 'Long Reach', d: 'Grab reaches 45 farther.', mods: { 1: { range_add: 45 } } }],
        [{ id: 'aftermath', name: 'Aftermath', d: 'Demolish leaves a slowing rift for 2 seconds.' }, { id: 'bloodlust', name: 'Blood Lust', d: 'Rage also adds 12% attack speed at full.' }],
      ],
      kit: [
        { name: 'Wrecking Ball', d: 'A ball orbits you briefly, hitting anything it touches.', fx: 'wrecking', cd: 9, range: 0, shape: 'self', instant: true, dur: 3, orbit: 140, dmg: 46,
          cast(s, c, a, A) {
            const z = field(s, c, 'orbit', { x: c.x, y: c.y, r: 34, dur: A.dur, ang: Math.atan2(c.fy, c.fx), orbit: A.orbit, hits: {} });
            z.step = (s, z) => { z.ang += 7.5 * DT; z.x = c.x + Math.cos(z.ang) * z.orbit; z.y = c.y + Math.sin(z.ang) * z.orbit; if (!c.alive) { z.t = 0; return; } eachEnemy(s, c, z.x, z.y, z.r, t => { if ((z.hits[t.id] || 0) > s.t) return; z.hits[t.id] = s.t + .85; hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (c.f.heavyball) slow(t, .3, 1); if (t.kind === 'champ' && !z.counted) { z.counted = true; c.stats.skillHits++; } }); };
          },
        },
        { name: 'Grab', d: 'Seize a nearby enemy and hurl them behind you.', fx: 'grab', cd: 10, range: 190, shape: 'cone', w: 130, dmg: 70, stunT: .7,
          cast(s, c, a, A) {
            let t = null, bd = A.range + 26; for (const e of [...s.champs, ...s.minions, ...s.monsters]) { if (!e.alive || e.air || e.boss || e.team === c.team || (e.kind === 'champ' && !canSee(s, c.team, e))) continue; const n = norm(e.x - c.x, e.y - c.y), v = n.l - e.r; if (n.x * a.dx + n.y * a.dy > .55 && hasLOS(c.x, c.y, e.x, e.y) && (v < bd || (t && t.kind !== 'champ' && e.kind === 'champ'))) { if (e.kind === 'champ' || !t || t.kind !== 'champ') { bd = v; t = e; } } }
            if (!t) return false;
            let hx = c.x - a.dx * 190, hy = c.y - a.dy * 190;
            if (c.f.bouncer) { let b = null, bb = 900; for (const o of [...s.champs.filter(x => x.alive && x.team === c.team && x !== c), ...s.towers.filter(x => x.alive && x.team === c.team)]) { const d2 = dist(o, c); if (d2 < bb) { bb = d2; b = o; } } if (b) { const n = norm(b.x - t.x, b.y - t.y); hx = b.x - n.x * 60; hy = b.y - n.y * 60; } }
            const n = norm(hx - t.x, hy - t.y); dashDir(t, n.x, n.y, Math.min(n.l, c.f.bouncer ? 420 : 340), 1500, { forced: true });
            stun(s, t, Math.min(n.l, 420) / 1500 + A.stunT * (1 + .6 * (c.rage || 0) / 100)); c.rage = (c.rage || 0) / 2; hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.kind === 'champ') c.stats.skillHits++;
          },
        },
        { name: 'Demolish', d: 'A ground fissure line that knocks up all along it.', fx: 'demolish', cd: 48, range: 495, shape: 'line', w: 130, delay: .42, dmg: 165, knockT: 1,
          cast(s, c, a, A) {
            const len = rayWall(c.x, c.y, a.dx, a.dy, A.range);
            const z = field(s, c, 'fissure', lineZone({ r: A.w / 2, dur: A.delay }, c.x, c.y, c.x + a.dx * len, c.y + a.dy * len));
            z.fn = (s, z) => { s.ev.push({ e: 'boom', x: z.x, y: z.y, r: z.r, fx: 'demolish', x2: z.x2, y2: z.y2 }); let hit = false; const test = t => { if (t.alive && !t.air && t.team !== c.team && segDist(t.x, t.y, z.x1, z.y1, z.x2, z.y2) < A.w / 2 + t.r) { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.alive) knock(s, t, A.knockT); if (t.kind === 'champ') hit = true; } }; s.champs.forEach(test); s.minions.forEach(test); s.monsters.forEach(test); if (hit) c.stats.skillHits++;
              if (c.f.aftermath) field(s, c, 'miasma', lineZone({ r: A.w / 2, dur: 2, fx: 'demolish', step(s, y) { if (s.tick % 6 === 0) { const test = t => { if (t.alive && t.team !== c.team && segDist(t.x, t.y, y.x1, y.y1, y.x2, y.y2) < y.r + t.r) slow(t, .35, .4); }; s.champs.forEach(test); s.minions.forEach(test); } } }, z.x1, z.y1, z.x2, z.y2)); };
          },
        },
      ],
      onBasic(s, c, t, o) { o.dmg *= 1 + (c.f.brawler ? .7 : .5) * (c.rage || 0) / 100; if (c.f.brawler) c.rage = Math.min(100, (c.rage || 0) + 4); },
      onDamaged(s, c, a) { c.rage = Math.min(100, (c.rage || 0) + a / c.maxHp * 220); c.rageAt = s.t; },
      tick(s, c) { if (c.rage > 0 && s.t - (c.rageAt || 0) > 5) c.rage = Math.max(0, c.rage - 8 * DT); c.pstack = Math.round((c.rage || 0) / 20); if (c.f.fortress && c.rage >= 20 && s.tick % 30 === 0) { shield(s, c, c.maxHp * .03 * c.rage / 20, 2.5); c.rage -= 8; } if (c.f.bloodlust) c.asBonus = .12 * (c.rage || 0) / 100; },
    },

    // ---------- 10.0 Heroes ----------
    voltaic: {
      name: 'Voltaic', role: 'Lightning speedster', blurb: 'Run fast, hit first, arrive as weather.', dtype: 'phys', arch: 'assassin',
      sight: 760, hp: 520, hpG: 76, dmg: 62, dmgG: 8, armor: 18, armG: 3, range: 130, as: 1.08, ms: 345, pref: 98, melee: true, fit: { top: 1, jungle: 3, bottom: 0, support: 0 },
      passive: { name: 'Static Charge', d: 'Moving builds charge. At full charge your next basic attack arcs lightning into two nearby enemies.' },
      builds: [
        { id: 'stormchaser', name: 'Stormchaser', tag: 'Jungle', d: 'Arc Dash tears through monsters and charges you faster off them.', mods: { 0: { d: 'Dash through a line. Far stronger against monsters.' } } },
        { id: 'surge', name: 'Surge', tag: 'Duration', d: 'Overload lasts much longer and comes back sooner.', mods: { 1: { cd: 10, dur: 4.6 } } },
        { id: 'conductor', name: 'Conductor', tag: 'Chains', d: 'Charge fills twice as fast and arcs jump to four enemies. Lighter dash.', mods: { 0: { dmg_add: -16 } } },
        { id: 'thunderhead', name: 'Thunderhead', tag: 'Engage', d: 'Ride the Lightning comes up far more often, with a lighter stun.', mods: { 2: { cd: 30, stun: .55 } } },
      ],
      evolves: [
        [{ id: 'quicksilver', name: 'Quicksilver', d: 'Arc Dash cooldown 1.2 shorter.', mods: { 0: { cd_add: -1.2 } } }, { id: 'groundfault', name: 'Ground Fault', d: 'Arc Dash slows champions it hits by 30%.' }],
        [{ id: 'skybreak', name: 'Skybreak', d: 'The Ride the Lightning trail is 40 wider.', mods: { 2: { w_add: 40 } } }, { id: 'afterimage', name: 'Afterimage', d: 'Ride the Lightning fully charges Static Charge.' }],
      ],
      kit: [
        { name: 'Arc Dash', d: 'Dash through a line of enemies. Hitting a champion adds charge.', fx: 'arcdash', cd: 6.5, range: 270, shape: 'dash', w: 80, pd: [270, 1500], dmg: 66,
          cast(s, c, a, A) { const car = {}; dashDir(c, a.dx, a.dy, A.range, 1500, { onHit(s, c, t) { hurt(s, c, t, A.dmg * pow(c) * (c.f.stormchaser && t.kind === 'monster' ? 1.7 : 1), { skill: 1 }); if (t.kind === 'champ') { skillHit(c, car); c.volt = Math.min(100, (c.volt || 0) + 35); if (c.f.groundfault) slow(t, .3, 1.2); } else if (c.f.stormchaser) c.volt = Math.min(100, (c.volt || 0) + 20); } }); },
        },
        { name: 'Overload', d: 'Burn hot: faster attacks and speed, and every basic attack arcs.', fx: 'overload', cd: 13, range: 0, shape: 'self', instant: true, dur: 3,
          cast(s, c, a, A) { c.overT = A.dur; haste(c, .22, A.dur); },
        },
        { name: 'Ride the Lightning', d: 'Become a bolt along a line. The trail detonates a moment later and stuns.', fx: 'thunder', cd: 46, range: 520, shape: 'line', w: 120, delay: .55, dmg: 170, stun: .95,
          cast(s, c, a, A) {
            const len = Math.max(0, rayWall(c.x, c.y, a.dx, a.dy, A.range + c.r) - c.r), x0 = c.x, y0 = c.y; dashDir(c, a.dx, a.dy, A.range, 1900, { unstop: true }); if (c.f.afterimage) c.volt = 100;
            const z = field(s, c, 'fissure', lineZone({ r: A.w / 2, dur: A.delay, fx: 'thunder' }, x0, y0, x0 + a.dx * len, y0 + a.dy * len));
            z.fn = (s, z) => { s.ev.push({ e: 'boom', x: z.x, y: z.y, r: z.r, fx: 'thunder', x2: z.x2, y2: z.y2 }); let hit = false; const test = t => { if (t.alive && !t.air && t.team !== c.team && segDist(t.x, t.y, z.x1, z.y1, z.x2, z.y2) < A.w / 2 + t.r) { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.alive) stun(s, t, A.stun); if (t.kind === 'champ') hit = true; } }; s.champs.forEach(test); s.minions.forEach(test); s.monsters.forEach(test); if (hit) c.stats.skillHits++; };
          },
        },
      ],
      tick(s, c) { const v = Math.hypot(c.vx || 0, c.vy || 0); if (v > 40) c.volt = Math.min(100, (c.volt || 0) + (c.f.conductor ? .36 : .18) * v * DT * .1 * 3); c.pready = (c.volt || 0) >= 100 ? 1 : 0; if (c.overT > 0) c.overT -= DT; c.asBonus = c.overT > 0 ? .45 : 0; },
      onBasic(s, c, t, o) { if (c.pready || c.overT > 0) { if (c.pready) c.volt = 0; arcBolt(s, c, t, 44 * pow(c), c.f.conductor ? 4 : 2, 'Static Charge'); o.crit = true; } },
    },
    tidecaller: {
      name: 'Tidecaller', role: 'Water controller', blurb: 'The tide does not ask.', dtype: 'magic', arch: 'support',
      sight: 850, hp: 530, hpG: 76, dmg: 46, dmgG: 5, armor: 20, armG: 3.5, range: 300, as: .85, ms: 310, pref: 270, support: true, fit: { top: 0, jungle: 0, bottom: 1, support: 3 },
      passive: { name: 'High Tide', d: 'Every third ability you cast restores 5% health to allies around you.' },
      builds: [
        { id: 'wellspring', name: 'Wellspring', tag: 'Healer', d: 'Riptide heals far more, High Tide reaches farther. Softer pushes.', mods: { 0: { heal_add: 45, push: 50 } } },
        { id: 'undertow', name: 'Undertow', tag: 'Displace', d: 'Riptide drags enemies toward you instead of away and hits harder.', mods: { 0: { dmg_add: 22, heal_add: -30, d: 'A wave that drags enemies toward you and heals allies.' } } },
        { id: 'deluge', name: 'Deluge', tag: 'Team fight', d: 'Tsunami comes up sooner and is wider.', mods: { 2: { cd: 34, w_add: 60 } } },
        { id: 'abyss', name: 'Abyss', tag: 'Control', d: 'Bubble holds enemies longer but shields allies less.', mods: { 1: { stunT: 1.45, shield_add: -50, cd_add: 1.5 } } },
      ],
      evolves: [
        [{ id: 'swiftcurrent', name: 'Swift Current', d: 'Riptide cooldown 1 shorter.', mods: { 0: { cd_add: -1 } } }, { id: 'deepbubble', name: 'Deep Bubble', d: 'Bubble reaches 75 farther.', mods: { 1: { range_add: 75 } } }],
        [{ id: 'rogue', name: 'Rogue Wave', d: 'Tsunami stuns enemies for 0.6 as it strikes them.' }, { id: 'stillwater', name: 'Still Water', d: 'Tsunami heals allies twice as much and hastens them.' }],
      ],
      kit: [
        { name: 'Riptide', d: 'A wave that pushes enemies away and heals every ally it passes.', fx: 'riptide', cd: 6, range: 480, shape: 'line', w: 66, heal: 92, dmg: 70, push: 110,
          cast(s, c, a, A) { tideTick(s, c); const car = {}; fire(s, c, a, { speed: 1050, range: A.range, w: A.w, fx: 'riptide', pierce: true, filter: 'allchamp', hit(s, c, t, p) {
            if (t.team === c.team) { heal(s, c, t, A.heal * pow(c)); skillHit(c, car); return; }
            hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); skillHit(c, car); if (t.alive) { slow(t, .3, 1.2); const dir = c.f.undertow ? -1 : 1, l = Math.min(A.push, c.f.undertow ? Math.max(0, dist(c, t) - 90) : A.push); dashDir(t, a.dx * dir, a.dy * dir, l, 900, { forced: true }); }
          } }); },
        },
        { name: 'Bubble', d: 'Encase a champion: an ally is shielded and cleansed, an enemy is held.', fx: 'bubble', cd: 12, range: 405, shape: 'circle', r: 100, target: true, shield: 150, stunT: 1,
          cast(s, c, a, A) {
            let t = null, bd = 180; for (const e of s.champs) { if (!e.alive || e.air || (e !== c && e.team !== c.team && !canSee(s, c.team, e))) continue; const d = Math.hypot(e.x - a.tx, e.y - a.ty); if (d < bd) { bd = d; t = e; } }
            if (!t || dist(c, t) > A.range + 45 || !hasLOS(c.x, c.y, t.x, t.y)) return false; tideTick(s, c); c.stats.skillHits++;
            s.ev.push({ e: 'boom', x: t.x, y: t.y, r: 70, fx: 'bubble' });
            if (t.team === c.team) { shield(s, t, A.shield * hpow(c), 3); t.stunT = t.rootT = t.slowT = 0; } else { stun(s, t, A.stunT); t.revealT = Math.max(t.revealT || 0, A.stunT); }
          },
        },
        { name: 'Tsunami', d: 'A great wave rolls forward, sweeping enemies back and lifting allies.', fx: 'tsunami', cd: 52, range: 700, shape: 'line', w: 280, dmg: 150, heal: 150,
          cast(s, c, a, A) { tideTick(s, c);
            const z = field(s, c, 'tidewave', { x: c.x, y: c.y, r: A.w / 2, dur: 1.35, fx: 'tsunami', dx: a.dx, dy: a.dy, hits: {}, stop: rayWall(c.x, c.y, a.dx, a.dy, A.range) / 1.35 });
            z.step = (s, z) => { z.x += z.dx * z.stop * DT; z.y += z.dy * z.stop * DT; for (const t of s.champs) { if (!t.alive || t.air || z.hits[t.id] || Math.hypot(t.x - z.x, t.y - z.y) > z.r + t.r) continue; z.hits[t.id] = 1;
              if (t.team === c.team) { heal(s, c, t, A.heal * pow(c) * (c.f.stillwater ? 2 : 1)); if (c.f.stillwater) haste(t, .25, 2.5); }
              else { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.alive) { slow(t, .35, 1.5); dashDir(t, z.dx, z.dy, 170, 900, { forced: true }); if (c.f.rogue) stun(s, t, .6); } if (!z.counted) { z.counted = true; c.stats.skillHits++; } } } };
          },
        },
      ],
    },
    paragon: {
      name: 'Paragon', role: 'Sky bruiser', blurb: 'Comes down harder than he goes up.', dtype: 'phys', arch: 'bruiser',
      sight: 740, hp: 630, hpG: 96, dmg: 63, dmgG: 8, armor: 27, armG: 4, range: 145, as: .92, ms: 320, pref: 108, melee: true, fit: { top: 3, jungle: 2, bottom: 0, support: 1 },
      passive: { name: 'Altitude', d: 'Landing from any leap makes your next three basic attacks hit 25% harder.' },
      builds: [
        { id: 'skyknight', name: 'Skyknight', tag: 'Mobile', d: 'Skyward comes back fast and lands lighter.', mods: { 0: { cd: 6.2, dmg_add: -18 } } },
        { id: 'sunstriker', name: 'Sunstriker', tag: 'Damage', d: 'Solar Fist hits much harder and reaches farther, but shields less.', mods: { 1: { dmg_add: 34, range_add: 35, shield: .05 } } },
        { id: 'titanwing', name: 'Titanwing', tag: 'Global', d: 'Meteor Drop comes up far more often, with a smaller impact.', mods: { 2: { cd: 34, r_add: -40, dmg_add: -30 } } },
        { id: 'aegisborn', name: 'Aegisborn', tag: 'Tank', d: 'Solar Fist shields far more. Sturdy, lighter hits.', stats: { hp: 1.12, dmg: .9 }, mods: { 1: { shield: .18 } } },
      ],
      evolves: [
        [{ id: 'updraft', name: 'Updraft', d: 'Skyward reaches 70 farther.', mods: { 0: { range_add: 70 } } }, { id: 'radiantfist', name: 'Radiant Fist', d: 'Solar Fist cooldown 1.5 shorter.', mods: { 1: { cd_add: -1.5 } } }],
        [{ id: 'shockfall', name: 'Shockfall', d: 'Meteor Drop leaves shaking ground that slows.' }, { id: 'freeflight', name: 'Free Flight', d: 'Landing restores 10% of your health.' }],
      ],
      kit: [
        { name: 'Skyward', d: 'Leap to a point and land with a slowing shock.', fx: 'skyward', cd: 9, range: 330, shape: 'circle', r: 120, over: true, dmg: 76,
          cast(s, c, a, A) { c.air = .4; c.leap = { sx: c.x, sy: c.y, tx: a.tx, ty: a.ty, t: 0, total: .4, fn(s, c) { skyLand(s, c, A.r, A.dmg * pow(c), .8, 0, 'skyward'); } }; },
        },
        { name: 'Solar Fist', d: 'A punch that drives champions back and shields you for each one struck.', fx: 'solarfist', cd: 7, range: 190, shape: 'cone', w: 140, dmg: 78, shield: .08,
          cast(s, c, a, A) { const n = cone(s, c, a, A.range, .45, t => { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.alive && t.kind === 'champ') dashDir(t, a.dx, a.dy, 120, 1000, { forced: true }); }); if (n) { c.stats.skillHits++; shield(s, c, c.maxHp * A.shield * n, 3); } },
        },
        { name: 'Meteor Drop', d: 'Rise out of reach, then fall anywhere nearby with a stunning impact.', fx: 'meteordrop', cd: 58, range: 760, shape: 'circle', r: 210, over: true, dmg: 190,
          cast(s, c, a, A) { c.air = 1.05; c.leap = { sx: c.x, sy: c.y, tx: a.tx, ty: a.ty, t: 0, total: 1.05, fn(s, c) { skyLand(s, c, A.r, A.dmg * pow(c), 0, .85, 'meteordrop'); if (c.f.shockfall) field(s, c, 'miasma', { x: c.x, y: c.y, r: A.r, dur: 2.5, fx: 'meteordrop', step(s, z) { if (s.tick % 6 === 0) for (const t of enemiesIn(s, c, z.x, z.y, z.r)) slow(t, .35, .4); } }); } }; },
        },
      ],
      onBasic(s, c, t, o) { if (c.altN > 0) { c.altN--; o.dmg *= 1.25; o.crit = true; } },
      tick(s, c) { c.pstack = c.altN || 0; c.pready = c.altN > 0 ? 1 : 0; },
    },
    mirage: {
      name: 'Mirage', role: 'Illusion marksman', blurb: 'Aim at the one that is not there.', dtype: 'phys', arch: 'marksman',
      sight: 930, hp: 515, hpG: 70, dmg: 58, dmgG: 7, armor: 15, armG: 3, range: 350, as: 1.0, ms: 308, pref: 318, fit: { top: 1, jungle: 0, bottom: 3, support: 0 },
      passive: { name: 'Double Image', d: 'Every fourth basic attack fires a twin bolt for 60% damage.' },
      builds: [
        { id: 'twinshot', name: 'Twinshot', tag: 'Attack speed', d: 'The twin fires every third attack.', stats: { as: 1.06 }, mods: {} },
        { id: 'shade', name: 'Shade', tag: 'Evasive', d: 'Phantom Step hides you longer and comes back faster.', mods: { 1: { cd: 7.5, stealth: 1.5 } } },
        { id: 'kaleidoscope', name: 'Kaleidoscope', tag: 'Team fight', d: 'Hall of Mirrors is wider and comes up sooner, its shards lighter.', mods: { 2: { cd: 34, r_add: 50, shot: 34 } } },
        { id: 'hollow', name: 'Hollow', tag: 'Trap', d: 'Your decoy bursts when it fades, slowing and striking enemies near it.', mods: { 1: { d: 'Dash, vanish, and leave a decoy that bursts.' } } },
      ],
      evolves: [
        [{ id: 'splinter', name: 'Splinter', d: 'Split Shot cooldown 1 shorter.', mods: { 0: { cd_add: -1 } } }, { id: 'farstep', name: 'Far Step', d: 'Phantom Step reaches 50 farther.', mods: { 1: { range_add: 50 } } }],
        [{ id: 'infinite', name: 'Infinite Regress', d: 'Hall of Mirrors lasts a second longer.', mods: { 2: { dur_add: 1 } } }, { id: 'crackedglass', name: 'Cracked Glass', d: 'Hall of Mirrors slows those inside by 30%.' }],
      ],
      kit: [
        { name: 'Split Shot', d: 'Three bolts in a narrow fan. Extra bolts on one target hit for less.', fx: 'splitshot', cd: 6, range: 510, shape: 'line', w: 30, dmg: 88,
          cast(s, c, a, A) { const seen = {}, car = {}; for (const r of [-.17, 0, .17]) { const co = Math.cos(r), si = Math.sin(r), dx = a.dx * co - a.dy * si, dy = a.dx * si + a.dy * co; fire(s, c, { dx, dy }, { speed: 1500, range: A.range, w: A.w, fx: 'splitshot', filter: 'units', hit(s, c, t, p) { const k = seen[t.id] ? .4 : 1; seen[t.id] = 1; hurt(s, c, t, A.dmg * k * pow(c), { skill: 1 }); if (t.kind === 'champ') skillHit(c, car); p.left = 0; } }); } },
        },
        { name: 'Phantom Step', d: 'Dash away and vanish for a moment, leaving your double behind.', fx: 'phantom', cd: 11, range: 230, shape: 'dash', w: 60, stealth: .8, keepStealth: true, pd: [230, 1300],
          cast(s, c, a, A) { const x = c.x, y = c.y, z = field(s, c, 'decoy', { x, y, r: 26, dur: 2.2, x0: x, vx: 0, vy: 0 }); z.end = (s, z) => { s.ev.push({ e: 'boom', x: z.x, y: z.y, r: 120, fx: 'phantom' }); if (c.f.hollow) for (const t of enemiesIn(s, c, z.x, z.y, 150, true)) { hurt(s, c, t, 110 * pow(c), { skill: 1 }); slow(t, .4, 1.5); } }; dashDir(c, a.dx, a.dy, A.range, 1300); stealth(s, c, A.stealth); },
        },
        { name: 'Hall of Mirrors', d: 'Illusions ring a zone and fire shards at everyone inside.', fx: 'mirrors', cd: 50, range: 600, shape: 'circle', r: 240, dur: 3, shot: 46,
          cast(s, c, a, A) { const z = field(s, c, 'mirrors', { x: a.tx, y: a.ty, r: A.r, dur: A.dur }); z.step = (s, z) => { if (s.tick % 9) return; for (const t of s.champs) if (t.alive && !t.air && t.team !== c.team && Math.hypot(t.x - z.x, t.y - z.y) < z.r + t.r) { hurt(s, c, t, A.shot * pow(c), { skill: 1 }); if (c.f.crackedglass) slow(t, .3, .5); s.ev.push({ e: 'phit', x: t.x, y: t.y, fx: 'mirrors' }); if (!z.counted) { z.counted = true; c.stats.skillHits++; } } }; },
        },
      ],
      onBasic(s, c, t, o) { c.pstack = ((c.pstack || 0) + 1) % (c.f.twinshot ? 3 : 4); if (!c.pstack) homing(s, c, t, o.dmg * .6, 1100, 'bolt', { basic: 1 }); },
    },

    // ---------- 10.0 Villains ----------
    cinder: {
      name: 'Cinder', role: 'Pyromancer', blurb: 'She only wanted to warm up the city.', dtype: 'magic', arch: 'mage',
      sight: 860, hp: 495, hpG: 66, dmg: 50, dmgG: 5, armor: 14, armG: 3, range: 320, as: .85, ms: 302, pref: 290, fit: { top: 1, jungle: 0, bottom: 3, support: 1 },
      passive: { name: 'Kindling', d: 'Your abilities stack kindling on enemies. The third stack ignites them in a small blast.' },
      builds: [
        { id: 'pyre', name: 'Pyre', tag: 'Burn', d: 'Everything you ignite burns harder and longer.', mods: { 0: { dmg_add: -8 } } },
        { id: 'ashwalker', name: 'Ashwalker', tag: 'Mobile', d: 'Scorched Earth is quicker to return and you run much faster on it.', mods: { 1: { cd: 6.6, dur: 3 } } },
        { id: 'wildfire', name: 'Wildfire', tag: 'Spread', d: 'Ignition throws kindling onto nearby enemies.', mods: {} },
        { id: 'firestorm', name: 'Firestorm', tag: 'Ultimate', d: 'Inferno comes up far sooner and lands quicker, with a smaller blast.', mods: { 2: { cd: 32, delay: .7, r_add: -45 } } },
      ],
      evolves: [
        [{ id: 'kindlebolt', name: 'Quick Fuse', d: 'Firebolt cooldown 0.7 shorter.', mods: { 0: { cd_add: -.7 } } }, { id: 'widescorch', name: 'Wide Scorch', d: 'Scorched Earth is 30 wider.', mods: { 1: { r_add: 30 } } }],
        [{ id: 'blackash', name: 'Black Ash', d: 'Inferno also blocks healing for 2 seconds.' }, { id: 'afterburn', name: 'Afterburn', d: 'Inferno leaves flames twice as long.' }],
      ],
      kit: [
        { name: 'Firebolt', d: 'A quick bolt that sets kindling on the first enemy.', fx: 'firebolt', cd: 3.6, range: 495, shape: 'line', w: 40, dmg: 76,
          cast(s, c, a, A) { fire(s, c, a, { speed: 1150, range: A.range, w: A.w, fx: 'firebolt', filter: 'units', hit(s, c, t, p) { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.kind === 'champ') skillHit(c, p); p.left = 0; if (t.alive) kindle(s, c, t, 1); } }); },
        },
        { name: 'Scorched Earth', d: 'Set the ground alight. Enemies burn, and you run faster on it.', fx: 'scorch', cd: 9, range: 420, shape: 'circle', r: 135, dur: 3.5, dps: 44,
          cast(s, c, a, A) { const z = field(s, c, 'miasma', { x: a.tx, y: a.ty, r: A.r, dur: A.dur, fx: 'scorch', n: 0 }); z.step = (s, z) => { if (dist(c, z) < z.r) haste(c, c.f.ashwalker ? .32 : .15, .2); if (s.tick % 9) return; for (const t of enemiesIn(s, c, z.x, z.y, z.r)) { bleed(s, c, t, A.dps * pow(c) * (c.f.pyre ? 1.35 : 1), 2); if (s.tick % 27 === 0) kindle(s, c, t, 1); if (t.kind === 'champ' && !z.counted) { z.counted = true; c.stats.skillHits++; } } }; },
        },
        { name: 'Inferno', d: 'A long fuse, then a huge explosion that leaves the ground burning.', fx: 'inferno', cd: 50, range: 520, shape: 'circle', r: 235, delay: 1, dmg: 215,
          cast(s, c, a, A) { blast(s, c, a.tx, a.ty, A.r, A.delay, (s, z) => { let hit = false; for (const t of enemiesIn(s, c, z.x, z.y, A.r)) { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.alive) kindle(s, c, t, 2); if (t.kind === 'champ') { hit = true; if (c.f.blackash) t.noHealT = Math.max(t.noHealT || 0, 2); } } if (hit) c.stats.skillHits++; const f = field(s, c, 'miasma', { x: z.x, y: z.y, r: A.r * .8, dur: c.f.afterburn ? 5 : 2.5, fx: 'scorch' }); f.step = (s, y) => { if (s.tick % 15) return; for (const t of enemiesIn(s, c, y.x, y.y, y.r)) bleed(s, c, t, 34 * pow(c), 1); }; }, 'inferno'); },
        },
      ],
    },
    ravager: {
      name: 'Ravager', role: 'Feral beast', blurb: 'It smelled you three blocks ago.', dtype: 'phys', arch: 'bruiser',
      sight: 740, hp: 575, hpG: 88, dmg: 66, dmgG: 8, armor: 22, armG: 3.5, range: 135, as: .98, ms: 335, pref: 100, melee: true, fit: { top: 2, jungle: 3, bottom: 0, support: 0 },
      passive: { name: 'Bloodscent', d: 'Enemies below half health nearby are revealed to you, and you run faster toward them.' },
      builds: [
        { id: 'alpha', name: 'Alpha', tag: 'Jungle', d: 'Maul shreds monsters and heals much more from them.', mods: { 0: { d: 'Cleave in front. Far stronger against monsters.' } } },
        { id: 'savage', name: 'Savage', tag: 'Cleave', d: 'Maul sweeps wider and reaches farther.', mods: { 0: { dot: .2, range_add: 40 } } },
        { id: 'packleader', name: 'Pack Leader', tag: 'Team', d: 'Frenzy also hastens allies around you.', mods: {} },
        { id: 'hemorrhage', name: 'Hemorrhage', tag: 'Bleed', d: 'Maul opens a deep bleed. Lighter strike.', mods: { 0: { dmg_add: -18, dps: 34 } } },
      ],
      evolves: [
        [{ id: 'quickmaul', name: 'Quick Maul', d: 'Maul cooldown 0.8 shorter.', mods: { 0: { cd_add: -.8 } } }, { id: 'longpounce', name: 'Long Pounce', d: 'Pounce reaches 70 farther.', mods: { 1: { range_add: 70 } } }],
        [{ id: 'unending', name: 'Unending', d: 'Frenzy lasts 2 seconds longer.', mods: { 2: { dur_add: 2 } } }, { id: 'goreroot', name: 'Pinning Claws', d: 'Pounce pins for 0.4 longer.', mods: { 1: { rootT_add: .4 } } }],
      ],
      kit: [
        { name: 'Maul', d: 'Cleave in front, healing for part of the damage.', fx: 'maul', cd: 4.2, range: 190, shape: 'cone', w: 150, dmg: 84, dot: .5,
          cast(s, c, a, A) { let got = 0; const n = cone(s, c, a, A.range, A.dot, t => { const m = c.f.alpha && t.kind === 'monster' ? 1.7 : 1, v = hurt(s, c, t, A.dmg * pow(c) * m, { skill: 1 }); got += (v || 0) * (m > 1 ? .3 : .16); if (A.dps && t.alive) bleed(s, c, t, A.dps * pow(c), 3); }); if (got) heal(s, c, c, got); if (n) c.stats.skillHits++; },
        },
        { name: 'Pounce', d: 'Leap onto an enemy and pin them. With no target, leap to the point.', fx: 'pounce', cd: 10, range: 340, shape: 'circle', r: 90, over: true, dmg: 78, rootT: .7,
          cast(s, c, a, A) { const t = nearChamp(s, c, a.tx, a.ty, 180), g = t && dist(c, t) <= A.range + 45 ? t : null; c.air = .32; c.leap = { sx: c.x, sy: c.y, tx: g ? g.x : a.tx, ty: g ? g.y : a.ty, t: 0, total: .32, fn(s, c) { s.ev.push({ e: 'boom', x: c.x, y: c.y, r: 90, fx: 'pounce' }); const hit = g && g.alive && !g.air && dist(c, g) < 140 ? g : null; if (hit) { hurt(s, c, hit, A.dmg * pow(c), { skill: 1 }); root(s, hit, A.rootT); c.stats.skillHits++; } } }; },
        },
        { name: 'Frenzy', d: 'Lose yourself: much faster attacks, speed and lifesteal.', fx: 'frenzy', cd: 48, range: 0, shape: 'self', instant: true, dur: 6,
          cast(s, c, a, A) { c.frenzyT = A.dur; haste(c, .22, A.dur); if (c.f.packleader) for (const al of alliesIn(s, c.team, c.x, c.y, 420)) if (al !== c) haste(al, .2, 4); },
        },
      ],
      tick(s, c) { if (c.frenzyT > 0) c.frenzyT -= DT; c.asBonus = c.frenzyT > 0 ? .5 : 0; c.lsBonus = c.frenzyT > 0 ? .25 : 0; c.pready = c.frenzyT > 0 ? 1 : 0; if (s.tick % 15 === 0) for (const e of s.champs) if (e.alive && e.team !== c.team && e.hp / e.maxHp < .5 && dist(e, c) < 950) { e.revealT = Math.max(e.revealT || 0, .6); haste(c, .1, .55); } },
    },
    cataclysm: {
      name: 'Cataclysm', role: 'Siege brute', blurb: 'Walks up to the wall. The wall reconsiders.', dtype: 'phys', arch: 'tank',
      sight: 700, hp: 690, hpG: 106, dmg: 56, dmgG: 7, armor: 32, armG: 4.5, range: 150, as: .78, ms: 300, pref: 120, melee: true, fit: { top: 3, jungle: 1, bottom: 0, support: 1 },
      passive: { name: 'Siege Engine', d: 'Every fifth basic attack splashes around the target. Your attacks hit structures 25% harder.' },
      builds: [
        { id: 'bastille', name: 'Bastille', tag: 'Tank', d: 'Entrench hardens you longer and comes back sooner. Lighter hits.', stats: { hp: 1.12, dmg: .9 }, mods: { 1: { cd: 9, dur: 2.8 } } },
        { id: 'artillery', name: 'Artillery', tag: 'Poke', d: 'Bombard reaches much farther and lands wider.', mods: { 0: { range_add: 110, r_add: 25, cd_add: 1 } } },
        { id: 'wreckingcrew', name: 'Wrecking Crew', tag: 'Split push', d: 'Everything hits structures far harder. Weaker in long fights.', stats: { hp: .95 }, mods: {} },
        { id: 'moonquake', name: 'Moonquake', tag: 'Ultimate', d: 'Earthbreaker comes up far more often and lifts for less time.', mods: { 2: { cd: 32, knockT: .6 } } },
      ],
      evolves: [
        [{ id: 'shrapnel', name: 'Shrapnel', d: 'Bombard slows those it hits by 35%.' }, { id: 'digin', name: 'Dig In', d: 'Entrench cooldown 2 shorter.', mods: { 1: { cd_add: -2 } } }],
        [{ id: 'fault', name: 'Fault Line', d: 'Earthbreaker reaches 90 farther.', mods: { 2: { range_add: 90 } } }, { id: 'tremor', name: 'Tremor', d: 'The Entrench shockwave stuns for 0.6.' }],
      ],
      kit: [
        { name: 'Bombard', d: 'Lob a shell onto the ground. It hits hard, slowly.', fx: 'bombard', cd: 7, range: 495, shape: 'circle', r: 130, delay: .75, dmg: 118,
          cast(s, c, a, A) { const car = {}; blast(s, c, a.tx, a.ty, A.r, A.delay, (s, z) => { eachEnemy(s, c, z.x, z.y, A.r, t => { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (c.f.shrapnel) slow(t, .35, 1.2); if (t.kind === 'champ') skillHit(c, car); }); }, 'bombard'); },
        },
        { name: 'Entrench', d: 'Plant yourself and take far less damage, then release a shockwave.', fx: 'entrench', cd: 12, range: 0, shape: 'self', instant: true, dur: 2, dmg: 88,
          cast(s, c, a, A) { c.drT = Math.max(c.drT, A.dur); slow(c, .35, A.dur); const z = field(s, c, 'miasma', { x: c.x, y: c.y, r: 190, dur: A.dur, fx: 'entrench' }); z.step = (s, z) => { z.x = c.x; z.y = c.y; if (!c.alive) z.t = 0; }; z.end = (s, z) => { if (!c.alive) return; s.ev.push({ e: 'boom', x: c.x, y: c.y, r: 190, fx: 'entrench' }); let hit = false; eachEnemy(s, c, c.x, c.y, 190, t => { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.kind === 'champ') { hit = true; if (c.f.tremor) stun(s, t, .6); } }); if (hit) c.stats.skillHits++; }; },
        },
        { name: 'Earthbreaker', d: 'Split the ground in a long line, lifting enemies and cracking structures.', fx: 'earthbreak', cd: 50, range: 540, shape: 'line', w: 150, delay: .6, dmg: 172, knockT: .9,
          cast(s, c, a, A) { const len = rayWall(c.x, c.y, a.dx, a.dy, A.range), z = field(s, c, 'fissure', lineZone({ r: A.w / 2, dur: A.delay, fx: 'earthbreak' }, c.x, c.y, c.x + a.dx * len, c.y + a.dy * len)); z.fn = (s, z) => { s.ev.push({ e: 'boom', x: z.x, y: z.y, r: z.r, fx: 'earthbreak', x2: z.x2, y2: z.y2 }); let hit = false; const test = t => { if (t.alive && !t.air && t.team !== c.team && segDist(t.x, t.y, z.x1, z.y1, z.x2, z.y2) < A.w / 2 + t.r) { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.alive) knock(s, t, A.knockT); if (t.kind === 'champ') hit = true; } }; s.champs.forEach(test); s.minions.forEach(test); s.monsters.forEach(test); for (const t of s.towers) if (t.alive && t.team !== c.team && segDist(t.x, t.y, z.x1, z.y1, z.x2, z.y2) < A.w / 2 + t.r) hurt(s, c, t, A.dmg * pow(c) * 2.5, { skill: 1 }); if (hit) c.stats.skillHits++; }; },
        },
      ],
      onBasic(s, c, t, o) { c.pstack = ((c.pstack || 0) + 1) % 5; if (t.kind === 'tower') o.dmg *= c.f.wreckingcrew ? 1.6 : 1.25; if (!c.pstack) { o.crit = true; for (const e of enemiesIn(s, c, t.x, t.y, 150)) if (e !== t) hurt(s, c, e, o.dmg * .5, { skill: 1 }); s.ev.push({ e: 'boom', x: t.x, y: t.y, r: 150, fx: 'bombard' }); } },
    },
    puppeteer: {
      name: 'The Puppeteer', role: 'Controller', blurb: 'Everyone dances eventually.', dtype: 'magic', arch: 'support',
      sight: 860, hp: 515, hpG: 74, dmg: 46, dmgG: 5, armor: 18, armG: 3.2, range: 300, as: .85, ms: 310, pref: 270, support: true, fit: { top: 0, jungle: 0, bottom: 1, support: 3 },
      passive: { name: 'Strings', d: 'Enemies hit by your abilities are strung for 3 seconds and take 8% more damage from your whole team.' },
      builds: [
        { id: 'marionettist', name: 'Marionettist', tag: 'Roots', d: 'Thread holds longer and comes back sooner.', mods: { 0: { cd: 7, rootT: 1.2 } } },
        { id: 'troupe', name: 'The Troupe', tag: 'Summons', d: 'Two puppets can stand at once, each shooting faster.', mods: { 1: { cd: 8, max: 2, every: 14 } } },
        { id: 'maestro', name: 'Maestro', tag: 'Ultimate', d: 'Dance of Strings also seizes a second enemy nearby.', mods: { 2: { cd_add: 4 } } },
        { id: 'ventriloquist', name: 'Ventriloquist', tag: 'Support', d: 'Puppets also heal the lowest ally near them.', mods: { 1: { shot_add: -8 } } },
      ],
      evolves: [
        [{ id: 'silkthread', name: 'Silk Thread', d: 'Thread reaches 70 farther.', mods: { 0: { range_add: 70 } } }, { id: 'tougherwood', name: 'Hardwood', d: 'Puppets last 1.5 seconds longer.', mods: { 1: { dur_add: 1.5 } } }],
        [{ id: 'cutstrings', name: 'Cut Strings', d: 'Strung enemies take 12% more instead of 8%.' }, { id: 'encore', name: 'Encore', d: 'Dance of Strings holds for 0.4 longer.', mods: { 2: { dur_add: .4 } } }],
      ],
      kit: [
        { name: 'Thread', d: 'A fine line that roots the first champion it catches.', fx: 'thread', cd: 9, range: 480, shape: 'line', w: 40, dmg: 66, rootT: .9,
          cast(s, c, a, A) { fire(s, c, a, { speed: 1250, range: A.range, w: A.w, fx: 'thread', filter: 'champ', hit(s, c, t, p) { if (t.team === c.team) return; hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.alive) { root(s, t, A.rootT); string(s, c, t); } skillHit(c, p); p.left = 0; } }); },
        },
        { name: 'Puppet Guard', d: 'Place a puppet that shoots enemies near it.', fx: 'puppet', cd: 11, range: 420, shape: 'circle', r: 120, dur: 4, shot: 34, every: 18, max: 1,
          cast(s, c, a, A) { const mine = s.zones.filter(z => z.kind === 'puppet' && z.owner === c); if (mine.length >= A.max) mine[0].t = .01; const z = field(s, c, 'puppet', { x: a.tx, y: a.ty, r: 26, dur: A.dur, n: 0 }); z.step = (s, z) => { if (++z.n < A.every) return; z.n = 0; let t = null, bd = 380; for (const e of s.champs) { if (!e.alive || e.air || e.team === c.team || !canSee(s, c.team, e)) continue; const d = Math.hypot(e.x - z.x, e.y - z.y); if (d < bd && hasLOS(z.x, z.y, e.x, e.y)) { bd = d; t = e; } } if (t) { homing(s, z, t, A.shot * pow(c), 1000, 'bolt', { team: c.team, owner: c, skill: 1, abil: 'Puppet Guard' }); string(s, c, t); if (!z.counted) { z.counted = true; c.stats.skillHits++; } } if (c.f.ventriloquist) { let al = null, f = .9; for (const b of alliesIn(s, c.team, z.x, z.y, 380)) { const v = b.hp / b.maxHp; if (v < f) { f = v; al = b; } } if (al) heal(s, c, al, 30 * pow(c)); } }; },
        },
        { name: 'Dance of Strings', d: 'Seize an enemy: they stagger toward you, helpless, then stumble free.', fx: 'dance', cd: 50, range: 420, shape: 'circle', r: 120, target: true, dur: 1.4, dmg: 120,
          cast(s, c, a, A) { const t = nearChamp(s, c, a.tx, a.ty, 180); if (!t || dist(c, t) > A.range + 45 || !hasLOS(c.x, c.y, t.x, t.y)) return false; const go = u => { hurt(s, c, u, A.dmg * pow(c), { skill: 1 }); if (!u.alive) return; const n = norm(c.x - u.x, c.y - u.y); stun(s, u, A.dur); dashDir(u, n.x, n.y, Math.max(0, n.l - 110), 300, { forced: true }); string(s, c, u); s.ev.push({ e: 'boom', x: u.x, y: u.y, r: 70, fx: 'dance' }); }; go(t); if (c.f.maestro) { const o = enemiesIn(s, c, t.x, t.y, 330, true).find(e => e !== t && e.kind === 'champ'); if (o) go(o); } c.stats.skillHits++; },
        },
      ],
    },
  };

  // ---------- balance table ----------
  // Sweep-driven tuning lives here, multiplying the base numbers above, so a balance pass is a table edit.
  // Kit: hp, dmg (basic attack), as, ms (added), abil (ability damage and healing). Build: pw (ability power), hp, dmg, as.
  const TUNE = {
    kits: {cataclysm: { hp: 0.919, dmg: 0.919, abil: 0.919 }, cinder: { hp: 1.128, dmg: 1.128, abil: 1.128 }, deadbolt: { hp: 1.074, dmg: 1.074, abil: 1.074 }, duelist: { hp: 0.909, dmg: 0.909, abil: 0.909 }, gravel: { hp: 0.83, dmg: 0.83, abil: 0.83 }, hex: { hp: 1.115, dmg: 1.115, abil: 1.115 }, ione: { hp: 1.122, dmg: 1.122, abil: 1.122 }, ironjaw: { hp: 0.861, dmg: 0.861, abil: 0.861 }, kade: { hp: 0.833, dmg: 0.833, abil: 0.833 }, mirage: { hp: 0.954, dmg: 0.954, abil: 0.954 }, paragon: { hp: 0.852, dmg: 0.852, abil: 0.852 }, plague: { hp: 1.163, dmg: 1.163, abil: 1.163 }, puppeteer: { hp: 1.06, dmg: 1.06, abil: 1.06 }, ravager: { hp: 0.937, dmg: 0.937, abil: 0.937 }, sable: { hp: 1.168, dmg: 1.168, abil: 1.168 }, shiv: { hp: 1.119, dmg: 1.119, abil: 1.119 }, solenne: { hp: 0.924, dmg: 0.924, abil: 0.924 }, tidecaller: { hp: 0.883, dmg: 0.883, abil: 0.883 }, vesper: { hp: 1.007, dmg: 1.007, abil: 1.007 }, voltaic: { hp: 1.193, dmg: 1.193, abil: 1.193 }},
    builds: {abyss: { pw: 0.994 }, aegisborn: { pw: 1.073 }, alpha: { pw: 1.126 }, anchor: { pw: 0.932 }, apothecary: { pw: 1.137 }, artillery: { pw: 0.932 }, ashwalker: { pw: 0.932 }, bastille: { pw: 0.932, hp: 0.96 }, bladestorm: { pw: 0.936 }, blitz: { pw: 1.073 }, bloodletter: { pw: 1.058 }, bouncer: { pw: 0.932 }, brawler: { pw: 1.068 }, breaker: { pw: 1.06 }, butcher: { pw: 1.039 }, comet: { pw: 1.073 }, conductor: { pw: 0.932 }, constellation: { pw: 0.907 }, cursebinder: { pw: 1.137 }, cutthroat: { pw: 0.932 }, deluge: { pw: 1.038 }, executioner: { pw: 1.073 }, fencer: { pw: 0.984 }, firestorm: { pw: 0.993 }, fortress: { pw: 0.904 }, ghost: { pw: 0.932 }, gunslinger: { pw: 0.932 }, hemorrhage: { pw: 0.951 }, hollow: { pw: 0.971 }, honorbound: { pw: 0.867 }, hunter: { pw: 1.111 }, jailer: { pw: 1.121 }, jinx: { pw: 0.982 }, juggernaut: { pw: 0.88 }, kaleidoscope: { pw: 0.951 }, lifebringer: { pw: 0.932 }, maestro: { pw: 0.994 }, marionettist: { pw: 1.021 }, marksman: { pw: 0.932 }, masquerade: { pw: 1.223 }, meteor: { pw: 1.031 }, moonquake: { pw: 1.073 }, nightblade: { pw: 1.137 }, packleader: { pw: 0.932 }, parrymaster: { pw: 0.932 }, pestilence: { pw: 0.99 }, protector: { pw: 1.031 }, pyre: { pw: 1.126 }, radiant: { pw: 0.896 }, reaper: { pw: 1.107 }, ritualist: { pw: 0.904 }, savage: { pw: 0.895 }, seismic: { pw: 1.051 }, shade: { pw: 1.04 }, skirmisher: { pw: 0.932 }, spotter: { pw: 1.126 }, stellar: { pw: 1.046 }, stormchaser: { pw: 1.007 }, sunlance: { pw: 1.008 }, sunstriker: { pw: 0.886 }, surge: { pw: 1.158 }, thunderhead: { pw: 1.073 }, titanwing: { pw: 0.96 }, transmuter: { pw: 0.945 }, trapper: { pw: 1.037 }, troupe: { pw: 1.055 }, twin: { pw: 1.073 }, twinshot: { pw: 1.045, dmg: 0.95 }, undertow: { pw: 1.073 }, vanguard: { pw: 0.932 }, venomous: { pw: 1.086 }, ventriloquist: { pw: 0.945 }, ward: { pw: 0.932 }, warden: { pw: 1.073 }, wellspring: { pw: 0.932 }, wildfire: { pw: 1.03 }, wrecker: { pw: 1.073 }, wreckingcrew: { pw: 1.073 }},
  };
  const ABIL_KEYS = ['dmg', 'dmgF', 'dmgM', 'dmg0', 'dmg1', 'dmg2', 'dps', 'heal', 'shot'];
  // Damage types. A kit's dtype is the default for its abilities; an ability's own `mag` overrides it. Basic attacks are physical.
  const KIT_TYPE = { vesper: ['phys', 'marksman'], kade: ['phys', 'bruiser'], ione: ['magic', 'mage'], solenne: ['magic', 'support'], sable: ['phys', 'assassin'], gravel: ['phys', 'tank'], deadbolt: ['phys', 'marksman'], duelist: ['phys', 'bruiser'], hex: ['magic', 'mage'], plague: ['magic', 'support'], shiv: ['phys', 'assassin'], ironjaw: ['phys', 'tank'] };
  const MAG_OVERRIDE = { Stomp: true, Avalanche: true, Demolish: true, Lockdown: true, 'Wrecking Ball': true, Deadeye: false };
  const MAG_ABIL = {};
  for (const id in KITS) {
    const k = KITS[id], ty = KIT_TYPE[id]; if (ty) { k.dtype = ty[0]; k.arch = ty[1]; }
    if (k.mr === undefined) k.mr = Math.round(k.armor * .7 + 8); if (k.mrG === undefined) k.mrG = Math.round(k.armG * 7) / 10;
    for (const a of k.kit) { if (MAG_OVERRIDE[a.name] !== undefined) a.mag = MAG_OVERRIDE[a.name]; a.dtype = (a.mag === undefined ? k.dtype === 'magic' : a.mag) ? 'magic' : 'phys'; MAG_ABIL[a.name] = a.dtype === 'magic'; }
  }
  for (const id in KITS) {
    const k = KITS[id], t = TUNE.kits[id] || {};
    if (t.hp) { k.hp = Math.round(k.hp * t.hp); k.hpG = Math.round(k.hpG * t.hp * 10) / 10; }
    if (t.dmg) { k.dmg = Math.round(k.dmg * t.dmg * 10) / 10; k.dmgG = Math.round(k.dmgG * t.dmg * 100) / 100; }
    if (t.as) k.as = Math.round(k.as * t.as * 1000) / 1000;
    if (t.ms) k.ms += t.ms;
    if (t.abil) for (const a of k.kit) for (const key of ABIL_KEYS) if (typeof a[key] === 'number') a[key] = Math.round(a[key] * t.abil * 100) / 100;
    for (const b of k.builds) {
      const u = TUNE.builds[b.id] || {};
      if (u.pw) b.pw = u.pw;
      if (u.hp || u.dmg || u.as) { b.stats = Object.assign({}, b.stats || {}); if (u.hp) b.stats.hp = (b.stats.hp || 1) * u.hp; if (u.dmg) b.stats.dmg = (b.stats.dmg || 1) * u.dmg; if (u.as) b.stats.as = (b.stats.as || 1) * u.as; }
    }
  }

  // A ricochet is a straight shot aimed at launch, leading the next target once. It never steers.
  function ricochetNext(s, c, A, from, seen, left, pw) {
    if (left <= 0) return;
    let n = null, bd = 285;
    const tryIt = e => { if (!e.alive || e.air || e.team === c.team || seen.has(e.id) || !canSee(s, c.team, e)) return; const d = dist(from, e); if (d < bd && hasLOS(from.x, from.y, e.x, e.y)) { bd = d; n = e; } };
    s.champs.forEach(tryIt); if (!n) { s.minions.forEach(tryIt); s.monsters.forEach(tryIt); } if (!n) return;
    const hits = new Set(seen); seen.add(n.id);
    const fly = bd / 1500, aim = norm(n.x + (n.vx || 0) * fly - from.x, n.y + (n.vy || 0) * fly - from.y), reach = rayWall(from.x, from.y, aim.x, aim.y, bd * 1.3 + 60);
    s.proj.push({ id: s.nid++, x: from.x, y: from.y, px: from.x, py: from.y, vx: aim.x * 1500, vy: aim.y * 1500, left: reach, w: 30, team: c.team, owner: c, fx: 'ricochet', pierce: false, hits, filter: 'units', skill: true, counted: false, age: 0, abil: curAbil,
      hit(s, c, t, p) { hurt(s, c, t, A.dmg * pow(c) * pw, { skill: 1 }); if (t.kind === 'champ') skillHit(c, p); p.left = 0; ricochetNext(s, c, A, t, seen, left - 1, pw * A.bdmg); } });
  }
  // Flourish cut n (0, 1, 2). Auto-faces for phones. Lands in the direction of the nearest visible champion.
  function flourish(s, c, A, n) {
    const reach = A['reach' + n], f = autoFace(s, c, reach + 80), a = { dx: f.dx, dy: f.dy };
    if (n === 1) dashDir(c, a.dx, a.dy, 75 + (c.f.lunging ? 40 : 0), 1100);
    let hit = 0; const spin = n === 2 && c.f.bladestorm;
    eachEnemy(s, c, c.x, c.y, reach, t => { const v = norm(t.x - c.x, t.y - c.y); if (!spin && v.x * a.dx + v.y * a.dy < .35) return; if (!hasLOS(c.x, c.y, t.x, t.y)) return;
      let d = A['dmg' + n] * pow(c); if (n === 2 && c.f.coupdegrace) d += (t.maxHp - t.hp) * .12; if (t.kind === 'champ') { hit = 1; c.pstack = Math.min(5, (c.pstack || 0) + 1); c.ptime = 3; }
      hurt(s, c, t, d, { skill: 1, crit: n === 2 ? 1 : 0 }); if (n === 2 && t.alive && t.kind === 'champ') knock(s, t, A.knockT); });
    if (hit) c.stats.skillHits++;
    if (hit && n === 2) c.cd[1] = Math.max(0, c.cd[1] - 4);
    if (hit && n === 2 && c.f.fencer) c.cd[0] *= .5;
  }
  function detonate(s, c, t, mul) {
    const n = t.curseN, cap = curseCap(c); t.curseN = 0; t.curseT = 0;
    hurt(s, c, t, (36 + 31 * n * (c.f.cursebinder && n >= cap ? 1.3 : 1)) * pow(c) * mul, { skill: 1, crit: n >= cap ? 1 : 0 });
    s.ev.push({ e: 'boom', x: t.x, y: t.y, r: 70, fx: 'break' });
    if (t.alive && t.kind === 'champ' && n >= 3) stun(s, t, .5 + (n - 3) * .1);
    if (c.f.hexburst) for (const o of enemiesIn(s, c, t.x, t.y, 170)) if (o !== t) curse(s, c, o, 1);
  }
  function spreadCurses(s, t) { const c = t.curseBy; if (!c || !c.alive) return; const n = t.curseN; for (const o of enemiesIn(s, c, t.x, t.y, 280, true)) if (o !== t) curse(s, c, o, Math.max(1, n - 1)); }

  // Items. ad = attack power (basics and physical abilities), ap = ability power (magic abilities), both as percentages.
  // armor against physical, mr against magic; pen and mpen ignore a fraction of them. cost is the price of this step from its upgradesFrom.
  const ITEMS = [
    // Attack
    { id: 'whetstone', name: 'Whetstone', d: '+9% attack power.', cost: 350, tier: 1, tags: ['attack'], ad: .09 },
    { id: 'serrated', name: 'Serrated Edge', d: '+18% attack power. Basic attacks on champions add a light bleed.', cost: 550, tier: 2, tags: ['attack'], upgradesFrom: 'whetstone', ad: .18, u: 'bleed' },
    { id: 'trigger', name: 'Hair Trigger', d: '+9% attack power and 22% attack speed.', cost: 550, tier: 2, tags: ['attack', 'mobility'], upgradesFrom: 'whetstone', ad: .09, as: .22 },
    { id: 'headsman', name: 'Headsman', d: '+30% attack power. Targets under 35% health take 15% more.', cost: 800, tier: 3, tags: ['attack'], upgradesFrom: 'serrated', ad: .3, u: 'headsman' },
    { id: 'bloodfang', name: 'Bloodfang', d: '+20% attack power and 15% lifesteal.', cost: 800, tier: 3, tags: ['attack', 'sustain', 'bruiser'], upgradesFrom: 'serrated', ad: .2, lifesteal: .15 },
    { id: 'stormlash', name: 'Stormlash', d: '+15% attack power and 40% attack speed. Every third attack arcs to one more enemy.', cost: 850, tier: 3, tags: ['attack'], upgradesFrom: 'trigger', ad: .15, as: .4, u: 'storm' },
    { id: 'guillotine', name: 'Guillotine', d: '+44% attack power. Unique: targets under 35% health take 28% more.', cost: 1250, tier: 4, tags: ['attack'], upgradesFrom: 'headsman', ad: .44, u: 'guillotine', legendary: true },
    { id: 'gorefang', name: 'Sanguine Fang', d: '+32% attack power and 24% lifesteal.', cost: 1250, tier: 4, tags: ['attack', 'sustain', 'bruiser'], upgradesFrom: 'bloodfang', ad: .32, lifesteal: .24, legendary: true },
    { id: 'tempest', name: 'Tempest', d: '+26% attack power and 60% attack speed. Unique: every third attack arcs on; attacks mark targets.', cost: 1250, tier: 4, tags: ['attack'], upgradesFrom: 'stormlash', ad: .26, as: .6, u: ['storm', 'tempest'], legendary: true },
    // Marksman
    { id: 'sightglass', name: 'Sightglass', d: '+7% attack power and 8% attack speed.', cost: 350, tier: 1, tags: ['attack', 'marksman'], ad: .07, as: .08 },
    { id: 'hairscope', name: 'Hairline Scope', d: '+14% attack power and 15% attack speed.', cost: 550, tier: 2, tags: ['attack', 'marksman'], upgradesFrom: 'sightglass', ad: .14, as: .15 },
    { id: 'railpiece', name: 'Railpiece', d: '+24% attack power, 22% attack speed and 12% armour piercing.', cost: 850, tier: 3, tags: ['attack', 'marksman'], upgradesFrom: 'hairscope', ad: .24, as: .22, pen: .12 },
    { id: 'quickdraw', name: 'Quickdraw Rig', d: '+12% attack power, 34% attack speed and +18 move speed.', cost: 800, tier: 3, tags: ['attack', 'marksman', 'mobility'], upgradesFrom: 'hairscope', ad: .12, as: .34, ms: 18 },
    { id: 'deadshot', name: 'Deadshot', d: '+34% attack power, 28% attack speed, 18% armour piercing. Unique: basic attacks on healthy targets (over 70%) hit 22% harder.', cost: 1250, tier: 4, tags: ['attack', 'marksman'], upgradesFrom: 'railpiece', ad: .34, as: .28, pen: .18, u: 'deadshot', legendary: true },
    { id: 'gunrunner', name: 'Gunrunner', d: '+18% attack power, 48% attack speed, +30 move speed. Unique: basic attacks on champions grant a burst of speed.', cost: 1200, tier: 4, tags: ['attack', 'marksman', 'mobility'], upgradesFrom: 'quickdraw', ad: .18, as: .48, ms: 30, u: 'gunrunner', legendary: true },
    // Assassin
    { id: 'dirk', name: 'Thin Dirk', d: '+7% attack power and 8% armour piercing.', cost: 350, tier: 1, tags: ['attack', 'assassin'], ad: .07, pen: .08 },
    { id: 'stiletto', name: 'Stiletto', d: '+14% attack power and 15% armour piercing.', cost: 550, tier: 2, tags: ['attack', 'assassin'], upgradesFrom: 'dirk', ad: .14, pen: .15 },
    { id: 'nightedge', name: 'Night Edge', d: '+24% attack power, 22% armour piercing. Unique: your first hit on a champion after 6 quiet seconds deals 25% more.', cost: 850, tier: 3, tags: ['attack', 'assassin'], upgradesFrom: 'stiletto', ad: .24, pen: .22, u: 'ambush' },
    { id: 'bonesaw', name: 'Bonesaw', d: '+20% attack power, 15% armour piercing and 15% shorter cooldowns.', cost: 850, tier: 3, tags: ['attack', 'assassin', 'ability'], upgradesFrom: 'stiletto', ad: .2, pen: .15, cdr: .15 },
    { id: 'widowmaker', name: 'Widowmaker', d: '+34% attack power, 30% armour piercing. Unique: an opening hit deals 40% more, and a takedown bursts you with speed.', cost: 1250, tier: 4, tags: ['attack', 'assassin'], upgradesFrom: 'nightedge', ad: .34, pen: .3, u: ['ambush', 'widow'], legendary: true },
    { id: 'eclipse', name: 'Eclipse', d: '+30% attack power, 20% armour piercing, 22% shorter cooldowns. Unique: three hits on a champion within 2 seconds burn for 7% of their max health.', cost: 1250, tier: 4, tags: ['attack', 'assassin', 'ability'], upgradesFrom: 'bonesaw', ad: .3, pen: .2, cdr: .22, u: 'eclipse', legendary: true },
    // Bruiser
    { id: 'cudgel', name: 'Cudgel', d: '+6% attack power and +100 health.', cost: 350, tier: 1, tags: ['attack', 'bruiser'], ad: .06, hp: 100 },
    { id: 'warhammer', name: 'Warhammer', d: '+12% attack power, +220 health and 8 armour.', cost: 550, tier: 2, tags: ['attack', 'bruiser'], upgradesFrom: 'cudgel', ad: .12, hp: 220, armor: 8 },
    { id: 'ironmaul', name: 'Iron Maul', d: '+20% attack power, +380 health and 16 armour.', cost: 850, tier: 3, tags: ['attack', 'bruiser', 'tank'], upgradesFrom: 'warhammer', ad: .2, hp: 380, armor: 16 },
    { id: 'ragebrand', name: 'Ragebrand', d: '+22% attack power, +260 health, 10% lifesteal and 10% shorter cooldowns.', cost: 850, tier: 3, tags: ['attack', 'bruiser', 'sustain'], upgradesFrom: 'warhammer', ad: .22, hp: 260, lifesteal: .1, cdr: .1 },
    { id: 'kingsmaul', name: 'Kingsmaul', d: '+28% attack power, +620 health, 26 armour, 14 magic resist. Unique: basic attacks splash 25% around the target.', cost: 1250, tier: 4, tags: ['attack', 'bruiser', 'tank'], upgradesFrom: 'ironmaul', ad: .28, hp: 620, armor: 26, mr: 14, u: 'cleave', legendary: true },
    { id: 'warbringer', name: 'Warbringer', d: '+32% attack power, +400 health, 16% lifesteal, 15% shorter cooldowns. Unique: below 40% health you deal 18% more.', cost: 1250, tier: 4, tags: ['attack', 'bruiser', 'sustain'], upgradesFrom: 'ragebrand', ad: .32, hp: 400, lifesteal: .16, cdr: .15, u: 'warbringer', legendary: true },
    // Magic
    { id: 'lens', name: 'Focus Lens', d: '+6% ability power and 8% shorter cooldowns.', cost: 400, tier: 1, tags: ['magic', 'ability'], ap: .06, cdr: .08 },
    { id: 'capacitor', name: 'Capacitor', d: '16% shorter cooldowns and +14% ability power.', cost: 550, tier: 2, tags: ['magic', 'ability'], upgradesFrom: 'lens', cdr: .16, ap: .14 },
    { id: 'overclock', name: 'Overclock', d: '28% shorter cooldowns and +26% ability power.', cost: 850, tier: 3, tags: ['magic', 'ability'], upgradesFrom: 'capacitor', cdr: .28, ap: .26 },
    { id: 'singularity', name: 'Singularity', d: '38% shorter cooldowns and +38% ability power.', cost: 1250, tier: 4, tags: ['magic', 'ability'], upgradesFrom: 'overclock', cdr: .38, ap: .38, legendary: true },
    { id: 'ember', name: 'Ember Shard', d: '+11% ability power.', cost: 350, tier: 1, tags: ['magic'], ap: .11 },
    { id: 'focuscrystal', name: 'Focus Crystal', d: '+22% ability power.', cost: 550, tier: 2, tags: ['magic'], upgradesFrom: 'ember', ap: .22 },
    { id: 'stormglass', name: 'Stormglass', d: '+36% ability power and 20% magic piercing.', cost: 850, tier: 3, tags: ['magic'], upgradesFrom: 'focuscrystal', ap: .36, mpen: .2 },
    { id: 'ashwand', name: 'Ash Wand', d: '+32% ability power and 12% ability lifesteal.', cost: 850, tier: 3, tags: ['magic', 'sustain'], upgradesFrom: 'focuscrystal', ap: .32, vamp: .12 },
    { id: 'voidheart', name: 'Voidheart', d: '+52% ability power and 32% magic piercing. Unique: abilities hit targets over 60% health 12% harder.', cost: 1250, tier: 4, tags: ['magic'], upgradesFrom: 'stormglass', ap: .52, mpen: .32, u: 'voidheart', legendary: true },
    { id: 'worldburn', name: 'Worldburn', d: '+46% ability power and 18% ability lifesteal. Unique: abilities that hit champions burn them for 3 seconds.', cost: 1250, tier: 4, tags: ['magic', 'sustain'], upgradesFrom: 'ashwand', ap: .46, vamp: .18, u: 'worldburn', legendary: true },
    { id: 'hexband', name: 'Hexed Band', d: '+14% ability power, +180 health.', cost: 550, tier: 2, tags: ['magic', 'bruiser'], upgradesFrom: 'ember', ap: .14, hp: 180 },
    { id: 'soulcage', name: 'Soul Cage', d: '+26% ability power, +340 health and 12 magic resist.', cost: 850, tier: 3, tags: ['magic', 'bruiser'], upgradesFrom: 'hexband', ap: .26, hp: 340, mr: 12 },
    { id: 'archlich', name: 'Archlich Crown', d: '+38% ability power, +560 health, 24 magic resist. Unique: once every 45 seconds a killing blow leaves you at 15% health instead.', cost: 1250, tier: 4, tags: ['magic', 'bruiser', 'tank'], upgradesFrom: 'soulcage', ap: .38, hp: 560, mr: 24, u: 'archlich', legendary: true },
    // Tank
    { id: 'vest', name: 'Padded Vest', d: '+150 health and 10 armour.', cost: 350, tier: 1, tags: ['tank'], hp: 150, armor: 10 },
    { id: 'plate', name: 'Riot Plate', d: '+300 health and 22 armour.', cost: 550, tier: 2, tags: ['tank'], upgradesFrom: 'vest', hp: 300, armor: 22 },
    { id: 'bastion', name: 'Bastion', d: '+550 health, 40 armour. Grants a shield when you fall below half health, once every 30 seconds.', cost: 850, tier: 3, tags: ['tank'], upgradesFrom: 'plate', hp: 550, armor: 40, u: 'bastion' },
    { id: 'spikeguard', name: 'Spikeguard', d: '+420 health, 50 armour. Melee attackers take 25% of the damage back.', cost: 800, tier: 3, tags: ['tank'], upgradesFrom: 'plate', hp: 420, armor: 50, u: 'thorns' },
    { id: 'citadel', name: 'Citadel', d: '+800 health, 60 armour, 20 magic resist. Unique: a bigger shield below half health, every 20 seconds.', cost: 1250, tier: 4, tags: ['tank'], upgradesFrom: 'bastion', hp: 800, armor: 60, mr: 20, u: ['bastion', 'citadel'], legendary: true },
    { id: 'thornwall', name: 'Thornwall', d: '+620 health, 72 armour, 16 magic resist. Unique: melee attackers take 40% back.', cost: 1250, tier: 4, tags: ['tank'], upgradesFrom: 'spikeguard', hp: 620, armor: 72, mr: 16, u: ['thorns', 'thornwall'], legendary: true },
    { id: 'cloak', name: 'Warded Cloak', d: '+80 health and 14 magic resist.', cost: 350, tier: 1, tags: ['tank', 'resist'], hp: 80, mr: 14 },
    { id: 'nullweave', name: 'Nullweave', d: '+200 health and 28 magic resist.', cost: 550, tier: 2, tags: ['tank', 'resist'], upgradesFrom: 'cloak', hp: 200, mr: 28 },
    { id: 'wardmail', name: 'Wardmail', d: '+420 health and 48 magic resist.', cost: 850, tier: 3, tags: ['tank', 'resist'], upgradesFrom: 'nullweave', hp: 420, mr: 48 },
    { id: 'spellbreaker', name: 'Spellbreaker', d: '+300 health, 36 magic resist, +22 move speed.', cost: 800, tier: 3, tags: ['tank', 'resist', 'mobility'], upgradesFrom: 'nullweave', hp: 300, mr: 36, ms: 22 },
    { id: 'aegisprime', name: 'Prime Aegis', d: '+700 health, 76 magic resist, 18 armour. Unique: the first ability that hits you every 20 seconds is halved.', cost: 1250, tier: 4, tags: ['tank', 'resist'], upgradesFrom: 'wardmail', hp: 700, mr: 76, armor: 18, u: 'aegisprime', legendary: true },
    { id: 'girdle', name: 'Iron Girdle', d: '+220 health.', cost: 350, tier: 1, tags: ['tank'], hp: 220 },
    { id: 'titanbelt', name: 'Titan Belt', d: '+460 health and a little regeneration.', cost: 550, tier: 2, tags: ['tank'], upgradesFrom: 'girdle', hp: 460, regen: .003 },
    { id: 'titanheart', name: 'Titan Heart', d: '+800 health, 16 armour, 16 magic resist, more regeneration.', cost: 850, tier: 3, tags: ['tank'], upgradesFrom: 'titanbelt', hp: 800, armor: 16, mr: 16, regen: .006 },
    { id: 'worldtree', name: 'Worldtree', d: '+1250 health, 30 armour, 30 magic resist. Unique: out of combat for 5 seconds you heal 4% a second.', cost: 1250, tier: 4, tags: ['tank'], upgradesFrom: 'titanheart', hp: 1250, armor: 30, mr: 30, regen: .008, u: 'worldtree', legendary: true },
    // Support
    { id: 'satchel', name: 'Field Satchel', d: '+15% healing and shields. Small health regeneration.', cost: 350, tier: 1, tags: ['support'], healPow: .15, regen: .002, hp: 40 },
    { id: 'medkit', name: 'Medkit', d: '+30% healing and shields, and more regeneration.', cost: 500, tier: 2, tags: ['support'], upgradesFrom: 'satchel', healPow: .3, regen: .004, hp: 100 },
    { id: 'sanctum', name: 'Sanctum', d: '+55% healing and shields, regeneration, and allies near you take 8% less damage.', cost: 800, tier: 3, tags: ['support'], upgradesFrom: 'medkit', healPow: .55, regen: .006, hp: 220, u: 'sanctum' },
    { id: 'sanctuary', name: 'Sanctuary', d: '+85% healing and shields, more regeneration. Unique: allies near you take 15% less damage.', cost: 1200, tier: 4, tags: ['support'], upgradesFrom: 'sanctum', healPow: .85, regen: .009, hp: 360, u: ['sanctum', 'sanctuary'], legendary: true },
    { id: 'censer', name: 'Censer', d: '+24% healing and shields, +8% ability power.', cost: 500, tier: 2, tags: ['support', 'magic'], upgradesFrom: 'satchel', healPow: .24, ap: .08, hp: 60 },
    { id: 'lifewarden', name: 'Lifewarden', d: '+42% healing and shields, +16% ability power, 12% shorter cooldowns.', cost: 800, tier: 3, tags: ['support', 'magic', 'ability'], upgradesFrom: 'censer', healPow: .42, ap: .16, cdr: .12, hp: 140 },
    { id: 'saintsbell', name: "Saint's Bell", d: '+66% healing and shields, +26% ability power, 20% shorter cooldowns. Unique: your heals also grant 8% damage for 3 seconds.', cost: 1200, tier: 4, tags: ['support', 'magic', 'ability'], upgradesFrom: 'lifewarden', healPow: .66, ap: .26, cdr: .2, hp: 240, u: 'saintsbell', legendary: true },
    { id: 'banner', name: 'Field Banner', d: '+100 health, +8 move speed.', cost: 350, tier: 1, tags: ['support', 'mobility'], hp: 100, ms: 8 },
    { id: 'warbanner', name: 'War Banner', d: '+240 health, +14 move speed, 10 armour, 10 magic resist.', cost: 550, tier: 2, tags: ['support', 'tank'], upgradesFrom: 'banner', hp: 240, ms: 14, armor: 10, mr: 10 },
    { id: 'rallystandard', name: 'Rally Standard', d: '+400 health, 18 armour, 18 magic resist. Unique: allies near you deal 6% more.', cost: 850, tier: 3, tags: ['support', 'tank'], upgradesFrom: 'warbanner', hp: 400, armor: 18, mr: 18, u: 'rally' },
    { id: 'highbanner', name: 'High Banner', d: '+620 health, 30 armour, 30 magic resist. Unique: allies near you deal 12% more.', cost: 1200, tier: 4, tags: ['support', 'tank'], upgradesFrom: 'rallystandard', hp: 620, armor: 30, mr: 30, u: ['rally', 'highbanner'], legendary: true },
    // Mobility
    { id: 'boots', name: 'Quick Boots', d: '+20 move speed.', cost: 300, tier: 1, tags: ['mobility'], ms: 20 },
    { id: 'spurs', name: 'Chase Spurs', d: '+34 move speed.', cost: 450, tier: 2, tags: ['mobility'], upgradesFrom: 'boots', ms: 34 },
    { id: 'phase', name: 'Phase Treads', d: '+48 move speed and 8% shorter cooldowns. Speed burst after any ability.', cost: 750, tier: 3, tags: ['mobility', 'ability'], upgradesFrom: 'spurs', ms: 48, cdr: .08, u: 'phase' },
    { id: 'ghoststep', name: 'Ghoststep', d: '+64 move speed, 12% shorter cooldowns. Unique: a bigger burst after any ability.', cost: 1200, tier: 4, tags: ['mobility', 'ability'], upgradesFrom: 'phase', ms: 64, cdr: .12, u: ['phase', 'ghoststep'], legendary: true },
    { id: 'stridegreaves', name: 'Stride Greaves', d: '+44 move speed, 14 armour and 14 magic resist.', cost: 750, tier: 3, tags: ['mobility', 'tank'], upgradesFrom: 'spurs', ms: 44, armor: 14, mr: 14 },
    { id: 'stormgreaves', name: 'Storm Greaves', d: '+60 move speed, 24 armour and 24 magic resist. Unique: being stunned or rooted grants a burst of speed when it ends.', cost: 1200, tier: 4, tags: ['mobility', 'tank'], upgradesFrom: 'stridegreaves', ms: 60, armor: 24, mr: 24, u: 'stormgreaves', legendary: true },
    // Jungle
    { id: 'machete', name: 'Machete', d: '+25% damage to monsters, +5% attack power.', cost: 350, tier: 1, tags: ['jungle', 'attack'], mon: .25, ad: .05 },
    { id: 'trailblade', name: 'Trail Blade', d: '+40% damage to monsters, +12% attack power. Monster kills heal you.', cost: 550, tier: 2, tags: ['jungle', 'attack'], upgradesFrom: 'machete', mon: .4, ad: .12, u: 'forager' },
    { id: 'apexfang', name: 'Apex Fang', d: '+55% damage to monsters, +24% attack power, 8% lifesteal. Monster kills heal you.', cost: 850, tier: 3, tags: ['jungle', 'attack', 'sustain'], upgradesFrom: 'trailblade', mon: .55, ad: .24, lifesteal: .08, u: 'forager' },
    { id: 'sovereign', name: 'Jungle Sovereign', d: '+70% damage to monsters, +34% attack power, 12% lifesteal. Unique: +25% damage to bosses.', cost: 1250, tier: 4, tags: ['jungle', 'attack', 'sustain'], upgradesFrom: 'apexfang', mon: .7, ad: .34, lifesteal: .12, u: ['forager', 'sovereign'], legendary: true },
    { id: 'spiritmoss', name: 'Spirit Moss', d: '+25% damage to monsters, +7% ability power.', cost: 350, tier: 1, tags: ['jungle', 'magic'], mon: .25, ap: .07 },
    { id: 'wildbloom', name: 'Wild Bloom', d: '+42% damage to monsters, +18% ability power. Monster kills heal you.', cost: 550, tier: 2, tags: ['jungle', 'magic'], upgradesFrom: 'spiritmoss', mon: .42, ap: .18, u: 'forager' },
    { id: 'stormroot', name: 'Stormroot', d: '+58% damage to monsters, +32% ability power, +20 move speed. Monster kills heal you.', cost: 850, tier: 3, tags: ['jungle', 'magic', 'mobility'], upgradesFrom: 'wildbloom', mon: .58, ap: .32, ms: 20, u: 'forager' },
    { id: 'skyrender', name: 'Skyrender', d: '+72% damage to monsters, +46% ability power, +34 move speed. Unique: +25% damage to bosses.', cost: 1250, tier: 4, tags: ['jungle', 'magic', 'mobility'], upgradesFrom: 'stormroot', mon: .72, ap: .46, ms: 34, u: ['forager', 'sovereign'], legendary: true },
    // Consumables: bought and used in one tap, no slot.
    { id: 'potion', name: 'Health Potion', d: 'Restores 40% of max health over 8 seconds.', cost: 110, tier: 1, tags: ['consumable'], consumable: true },
    { id: 'cleanse', name: 'Cleanse', d: 'Clears stuns, roots, slows, poison and curses at once. 25 second cooldown.', cost: 170, tier: 1, tags: ['consumable'], consumable: true },
    { id: 'tonic', name: 'Speed Tonic', d: '+20% move speed for 8 seconds.', cost: 120, tier: 1, tags: ['consumable'], consumable: true },
    { id: 'elixir', name: 'War Elixir', d: '+15% damage for 90 seconds.', cost: 280, tier: 1, tags: ['consumable'], consumable: true },
    { id: 'beaconkit', name: 'Beacon Kit', d: 'One extra vision beacon, right now.', cost: 90, tier: 1, tags: ['consumable'], consumable: true },
  ];
  const ITEM_SLOTS = 5, CONSUMABLES = ['potion', 'cleanse', 'tonic', 'elixir', 'beaconkit'];
  const ITEM_BY = {}; ITEMS.forEach((it, i) => { ITEM_BY[it.id] = it; it.i = i; });
  const itemPath = id => { const out = []; for (let it = ITEM_BY[id]; it; it = ITEM_BY[it.upgradesFrom]) out.unshift(it.id); return out; };
  // The full cost of a step: from an owned ancestor if there is one, otherwise the whole chain.
  function itemPrice(c, id) {
    const it = ITEM_BY[id]; if (!it) return null;
    if (c.items.includes(id)) return null;
    const path = itemPath(id); let own = -1, slot = -1;
    for (let i = path.length - 2; i >= 0 && slot < 0; i--) { const k = c.items.indexOf(path[i]); if (k >= 0) { own = i; slot = k; } }
    if (slot < 0 && !c.items.some(x => !x)) return null;
    let cost = 0; for (let i = own + 1; i < path.length; i++) cost += ITEM_BY[path[i]].cost;
    return cost;
  }
  // Final items a build wants, in buying order. Bots buy down each chain; the shop highlights them.
  const REC = {
    marksman: ['headsman', 'overclock', 'phase'], skirmisher: ['stormlash', 'phase', 'bloodfang'], spotter: ['headsman', 'phase', 'overclock'], executioner: ['headsman', 'bloodfang', 'phase'],
    parrymaster: ['bastion', 'bloodfang', 'phase'], blitz: ['phase', 'bloodfang', 'spikeguard'], vanguard: ['bastion', 'spikeguard', 'phase'], breaker: ['stormlash', 'bloodfang', 'phase'],
    constellation: ['overclock', 'phase', 'headsman'], meteor: ['overclock', 'headsman', 'phase'], comet: ['headsman', 'overclock', 'phase'], stellar: ['sanctum', 'overclock', 'phase'],
    lifebringer: ['sanctum', 'overclock', 'phase'], protector: ['sanctum', 'bastion', 'phase'], sunlance: ['overclock', 'headsman', 'phase'], radiant: ['sanctum', 'phase', 'overclock'],
    ghost: ['bloodfang', 'phase', 'headsman'], reaper: ['headsman', 'phase', 'bloodfang'], hunter: ['stormlash', 'phase', 'bloodfang'], twin: ['headsman', 'overclock', 'phase'],
    anchor: ['bastion', 'phase', 'spikeguard'], juggernaut: ['bastion', 'bloodfang', 'phase'], warden: ['bastion', 'sanctum', 'phase'], seismic: ['spikeguard', 'bastion', 'overclock'],
    trapper: ['overclock', 'headsman', 'phase'], deadeyed: ['headsman', 'overclock', 'phase'], gunslinger: ['stormlash', 'bloodfang', 'phase'], jailer: ['overclock', 'phase', 'bastion'],
    fencer: ['bloodfang', 'phase', 'bastion'], masquerade: ['headsman', 'phase', 'bloodfang'], honorbound: ['bloodfang', 'bastion', 'phase'], bladestorm: ['stormlash', 'bloodfang', 'phase'],
    cursebinder: ['overclock', 'headsman', 'phase'], transmuter: ['overclock', 'phase', 'sanctum'], ritualist: ['overclock', 'bastion', 'phase'], jinx: ['sanctum', 'overclock', 'phase'],
    apothecary: ['sanctum', 'overclock', 'phase'], pestilence: ['overclock', 'headsman', 'phase'], bloodletter: ['bloodfang', 'bastion', 'phase'], ward: ['overclock', 'bastion', 'phase'],
    cutthroat: ['headsman', 'phase', 'bloodfang'], nightblade: ['headsman', 'bloodfang', 'phase'], butcher: ['bloodfang', 'headsman', 'phase'], venomous: ['stormlash', 'bloodfang', 'phase'],
    brawler: ['bloodfang', 'bastion', 'phase'], wrecker: ['overclock', 'bastion', 'phase'], bouncer: ['bastion', 'phase', 'spikeguard'], fortress: ['bastion', 'spikeguard', 'sanctum'],
  };
  REC.stormchaser = ['apexfang', 'phase', 'ragebrand']; REC.surge = ['stormroot', 'phase', 'stormglass']; REC.conductor = ['stormroot', 'overclock', 'phase']; REC.thunderhead = ['stormglass', 'phase', 'soulcage'];
  REC.wellspring = ['sanctum', 'overclock', 'phase']; REC.undertow = ['lifewarden', 'overclock', 'phase']; REC.deluge = ['lifewarden', 'sanctum', 'phase']; REC.abyss = ['overclock', 'stridegreaves', 'sanctum'];
  REC.skyknight = ['ragebrand', 'phase', 'ironmaul']; REC.sunstriker = ['headsman', 'phase', 'ironmaul']; REC.titanwing = ['ragebrand', 'phase', 'bastion']; REC.aegisborn = ['ironmaul', 'wardmail', 'phase'];
  REC.twinshot = ['stormlash', 'railpiece', 'phase']; REC.shade = ['railpiece', 'phase', 'headsman']; REC.kaleidoscope = ['headsman', 'railpiece', 'phase']; REC.hollow = ['quickdraw', 'headsman', 'phase'];
  REC.pyre = ['stormglass', 'overclock', 'phase']; REC.ashwalker = ['ashwand', 'phase', 'overclock']; REC.wildfire = ['stormglass', 'ashwand', 'phase']; REC.firestorm = ['overclock', 'stormglass', 'phase'];
  REC.alpha = ['apexfang', 'phase', 'ragebrand']; REC.savage = ['ragebrand', 'ironmaul', 'phase']; REC.packleader = ['ragebrand', 'rallystandard', 'phase']; REC.hemorrhage = ['nightedge', 'bloodfang', 'phase'];
  REC.bastille = ['bastion', 'wardmail', 'phase']; REC.artillery = ['ironmaul', 'overclock', 'phase']; REC.wreckingcrew = ['ironmaul', 'stormlash', 'phase']; REC.moonquake = ['ironmaul', 'bastion', 'phase'];
  REC.marionettist = ['lifewarden', 'overclock', 'phase']; REC.troupe = ['overclock', 'lifewarden', 'phase']; REC.maestro = ['overclock', 'sanctum', 'phase']; REC.ventriloquist = ['sanctum', 'lifewarden', 'phase'];
  // Other genuine routes per archetype, on top of each build's signature route (path 0).
  const ARCH_PATHS = {
    marksman: [['Rapid', ['quickdraw', 'stormlash', 'railpiece', 'phase', 'bloodfang']], ['Heavy', ['railpiece', 'headsman', 'bloodfang', 'phase', 'spellbreaker']]],
    mage: [['Burst', ['stormglass', 'overclock', 'phase', 'ashwand', 'soulcage']], ['Battle', ['soulcage', 'ashwand', 'overclock', 'phase', 'wardmail']]],
    support: [['Devoted', ['sanctum', 'lifewarden', 'phase', 'rallystandard', 'wardmail']], ['Warmaster', ['rallystandard', 'lifewarden', 'stridegreaves', 'bastion', 'wardmail']]],
    assassin: [['Night', ['nightedge', 'phase', 'bonesaw', 'bloodfang', 'wardmail']], ['Ambush', ['bonesaw', 'nightedge', 'headsman', 'phase', 'spellbreaker']]],
    bruiser: [['Unkillable', ['ironmaul', 'ragebrand', 'stridegreaves', 'wardmail', 'bastion']], ['Reaver', ['ragebrand', 'bloodfang', 'phase', 'ironmaul', 'wardmail']]],
    tank: [['Wall', ['bastion', 'wardmail', 'titanheart', 'stridegreaves', 'spikeguard']], ['Crusher', ['ironmaul', 'wardmail', 'stridegreaves', 'bastion', 'titanheart']]],
  };
  const MAGIC_SWAP = { headsman: 'stormglass', bloodfang: 'ashwand', stormlash: 'soulcage', spikeguard: 'wardmail', ironmaul: 'soulcage', ragebrand: 'soulcage', nightedge: 'stormglass', bonesaw: 'overclock', apexfang: 'stormroot', railpiece: 'stormglass', quickdraw: 'ashwand' }, PHYS_SWAP = { overclock: 'bonesaw', stormglass: 'headsman', ashwand: 'bloodfang', soulcage: 'ironmaul', stormroot: 'apexfang' };
  // Filler for the last two slots per kit class, after the build's three core items.
  const REC_FILL = { back: ['bloodfang', 'wardmail'], front: ['wardmail', 'bastion'], flank: ['bloodfang', 'wardmail'], peel: ['wardmail', 'overclock'] };
  const LEGEND = { headsman: 'guillotine', bloodfang: 'gorefang', stormlash: 'tempest', bastion: 'citadel', spikeguard: 'thornwall', phase: 'ghoststep', overclock: 'singularity', sanctum: 'sanctuary', railpiece: 'deadshot', quickdraw: 'gunrunner', nightedge: 'widowmaker', bonesaw: 'eclipse', ironmaul: 'kingsmaul', ragebrand: 'warbringer', stormglass: 'voidheart', ashwand: 'worldburn', soulcage: 'archlich', wardmail: 'aegisprime', titanheart: 'worldtree', lifewarden: 'saintsbell', rallystandard: 'highbanner', stridegreaves: 'stormgreaves', apexfang: 'sovereign', stormroot: 'skyrender' };
  const swapFor = (k, id) => k.dtype === 'magic' ? (MAGIC_SWAP[id] || id) : (PHYS_SWAP[id] || id);
  // Every genuine item route for a build: [{name, items}]. Path 0 is the build's signature route.
  function itemPaths(champ, build) {
    const k = KITS[champ]; if (!k) return []; const b = build || k.builds[0].id, core = [...new Set((REC[b] || REC[k.builds[0].id]).map(i => swapFor(k, i)))];
    for (const f of [...REC_FILL[CLASS[champ] || 'front'], 'wardmail', 'bastion', 'phase', 'stridegreaves', k.dtype === 'magic' ? 'overclock' : 'bloodfang', 'titanheart']) { const g = swapFor(k, f); if (core.length < 5 && !core.includes(g)) core.push(g); }
    const out = [{ name: 'Signature', items: core }];
    for (const [name, items] of ARCH_PATHS[k.arch] || []) { const u = [...new Set(items.map(i => swapFor(k, i)))]; for (const f of ['wardmail', 'bastion', 'phase', 'stridegreaves', 'titanheart', 'lifewarden', k.dtype === 'magic' ? 'overclock' : 'bloodfang']) { const g = swapFor(k, f); if (u.length < 5 && !u.includes(g)) u.push(g); } out.push({ name, items: u }); }
    return out;
  }
  function recommended(champ, build, path) { const p = itemPaths(champ, build); return p.length ? (p[path || 0] || p[0]).items : []; }
  // Default build per kit and role, for bots and for a seat with none chosen.
  function defaultBuild(champ, role, roll) {
    const k = KITS[champ], ids = k.builds.map(x => x.id), avoid = BOT_BUILD_AVOID[champ] || {}, pool = ids.filter(b => !(avoid[b] || []).includes(role));
    return (pool.length ? pool : ids)[Math.floor((roll || 0) * (pool.length ? pool.length : ids.length)) % (pool.length || ids.length)];
  }
  // Build fits: which build does not suit a given role (bot defaults only; players are free).
  const BOT_BUILD_AVOID = {
    tidecaller: { undertow: ['bottom'] }, puppeteer: { ventriloquist: ['bottom'] }, voltaic: { stormchaser: ['top'] }, ravager: { alpha: ['top'] }, cataclysm: { bastille: [] },
    solenne: { sunlance: ['support'], lifebringer: ['bottom', 'top'], protector: ['bottom', 'top'], radiant: ['bottom', 'top'] },
    plague: { apothecary: ['top', 'bottom'], bloodletter: ['support', 'bottom'], ward: ['top'] },
    ione: { stellar: ['top', 'bottom'] }, hex: { jinx: ['top', 'bottom'] },
    kade: { vanguard: ['jungle'], breaker: ['jungle'] }, gravel: { warden: ['top', 'jungle'] }, ironjaw: { bouncer: ['jungle'] },
  };

  // Lane proficiencies: picked per seat before the match (seat.prof), independent of the champion.
  const PROFS = {
    top: [
      { id: 'challenger', name: 'Challenger', d: '+10% damage to champions while no ally is near you.' },
      { id: 'ironclad', name: 'Ironclad', d: 'Take 18% less damage under your own towers.' },
      { id: 'demolisher', name: 'Demolisher', d: 'Your attacks and abilities hit structures 35% harder.' },
    ],
    jungle: [
      { id: 'predator', name: 'Predator', d: '+25% damage to monsters and +15% to bosses.' },
      { id: 'killstrike', name: 'Kill Strike', d: 'A monster that falls under 10% health is finished instantly and heals you 8%. 10 seconds to recharge, 30 after a boss.' },
      { id: 'tracker', name: 'Tracker', d: '+12% move speed in the jungle and +25% gold from camps.' },
    ],
    bottom: [
      { id: 'harvester', name: 'Harvester', d: '+30% gold from minion last hits.' },
      { id: 'tempo', name: 'Tempo', d: 'Basic attacks on champions build attack speed: up to five stacks of 6% that fade after 3 seconds.' },
      { id: 'longsight', name: 'Long Sight', d: '+120 sight. Your first hit on a champion after 4 quiet seconds deals 25% more.' },
    ],
    support: [
      { id: 'guardian', name: 'Guardian', d: '+20% healing and shields.' },
      { id: 'pathfinder', name: 'Pathfinder', d: 'Hold a third beacon, recharge beacons twice as fast and see farther from them.' },
      { id: 'patron', name: 'Patron', d: 'Assists pay 40% more, and you earn passive gold 60% faster.' },
    ],
  };
  const PROF_IDS = {}; for (const r in PROFS) for (const p of PROFS[r]) PROF_IDS[p.id] = r;

  // Marks earned at the end of a match.
  // ---------- 11.0 career medals ----------
  // kind: 'sum' adds a match stat to the career, 'max' keeps the best single match, the rest are read from career tallies.
  const medal = (id, name, cat, kind, key, need, d, line) => ({ id, name, cat, kind, key, d, tiers: ['Bronze', 'Silver', 'Gold'].map((t, i) => ({ name: t, need: need[i], d: line(need[i].toLocaleString('en-US')) })) });
  const MEDAL_CATS = { multi: 'Multi-kills', deathless: 'Deathless', mastery: 'Champion mastery', rescue: 'Rescues', objective: 'Objectives', clutch: 'Clutch comebacks', role: 'Role mastery' };
  const MEDALS = [
    medal('hat_trick', 'Hat Trick', 'multi', 'sum', 'multi3', [10, 60, 240], 'Triple kills across your career.', n => `Land ${n} triple kills.`),
    medal('clean_sweep', 'Clean Sweep', 'multi', 'sum', 'multi4', [3, 20, 80], 'Quadruple kills across your career.', n => `Land ${n} quadruple kills.`),
    medal('rampage', 'Rampage', 'multi', 'sum', 'multi5', [1, 8, 30], 'Chains of five kills or more.', n => `Chain five kills or more, ${n} times.`),
    medal('body_count', 'Body Count', 'multi', 'max', 'kills', [15, 22, 30], 'Most kills in a single match.', n => `Take ${n} kills in one match.`),
    medal('untouchable', 'Untouchable', 'deathless', 'sum', 'deathless', [10, 60, 240], 'Wins without dying once, with at least 5 takedowns.', n => `Win ${n} matches without dying.`),
    medal('ghost_run', 'Ghost Run', 'deathless', 'max', 'deathlessTD', [12, 20, 30], 'Takedowns in a single deathless win.', n => `Score ${n} takedowns in one deathless win.`),
    medal('long_life', 'Long Life', 'deathless', 'max', 'bestStreak', [8, 13, 20], 'Longest kill streak in a single life.', n => `Reach a streak of ${n} kills without dying.`),
    medal('specialist', 'Specialist', 'mastery', 'champWins', '', [25, 100, 400], 'Wins on your single best champion.', n => `Win ${n} matches on one champion.`),
    medal('repertoire', 'Repertoire', 'mastery', 'champsAt', '', [4, 10, 20], 'Champions with at least 10 wins each.', n => `Reach 10 wins on ${n} different champions.`),
    medal('grand_master', 'Grand Master', 'mastery', 'sum', 'mastery', [30000, 200000, 800000], 'Mastery earned across every champion.', n => `Earn ${n} mastery.`),
    medal('shepherd', 'Shepherd', 'rescue', 'sum', 'rescues', [60, 400, 1600], 'Civilians brought to safety across your career.', n => `Rescue ${n} civilians.`),
    medal('safe_passage', 'Safe Passage', 'rescue', 'max', 'rescues', [6, 10, 15], 'Most civilian rescues in a single match.', n => `Make ${n} rescues in one match.`),
    medal('lifeline', 'Lifeline', 'rescue', 'sum', 'saves', [40, 250, 1000], 'Heals that pull an ally back from under a quarter health.', n => `Save allies from the brink ${n} times.`),
    medal('demolition', 'Demolition', 'objective', 'sum', 'towers', [80, 500, 2000], 'Towers felled with you at the scene.', n => `Be present for ${n} tower kills.`),
    medal('big_game', 'Big Game', 'objective', 'sum', 'objectives', [80, 500, 2000], 'Bosses slain and map events won.', n => `Secure ${n} objectives.`),
    medal('colossus_slayer', 'Colossus Slayer', 'objective', 'sum', 'colossi', [10, 60, 240], 'Colossus kills you took part in.', n => `Bring down the Colossus ${n} times.`),
    medal('grand_theft', 'Grand Theft', 'objective', 'sum', 'steals', [2, 15, 60], 'Last hits on a boss the other team had nearly finished.', n => `Steal ${n} bosses.`),
    medal('never_over', 'Never Over', 'clutch', 'sum', 'comebacks', [8, 50, 200], 'Wins after trailing by 3,000 gold or more.', n => `Win ${n} matches from far behind.`),
    medal('long_way_back', 'The Long Way Back', 'clutch', 'max', 'deficit', [5000, 9000, 14000], 'The largest deficit you have ever overturned.', n => `Win after trailing by ${n} gold.`),
    medal('last_breath', 'Last Breath', 'clutch', 'sum', 'clutch', [25, 150, 600], 'Kills made at 15% health or less.', n => `Land ${n} kills at 15% health or less.`),
    medal('warden', 'Warden of the High Road', 'role', 'role', 'top', [25, 120, 500], 'Wins in the top lane.', n => `Win ${n} matches as top.`),
    medal('stalker', 'Wild Stalker', 'role', 'role', 'jungle', [25, 120, 500], 'Wins in the jungle.', n => `Win ${n} matches as jungle.`),
    medal('keeper', 'Keeper of the Low Road', 'role', 'role', 'bottom', [25, 120, 500], 'Wins in the bottom lane.', n => `Win ${n} matches as bottom.`),
    medal('steadfast', 'Steadfast', 'role', 'role', 'support', [25, 120, 500], 'Wins as support.', n => `Win ${n} matches as support.`),
  ];
  const newCareer = () => ({ v: 1, games: 0, wins: 0, sum: {}, max: {}, champ: {}, role: {}, tiers: {} });
  // A career's current number for one medal, which is also what a progress bar shows.
  function medalValue(career, m) {
    if (!career) return 0;
    if (m.kind === 'sum') return (career.sum || {})[m.key] || 0;
    if (m.kind === 'max') return (career.max || {})[m.key] || 0;
    if (m.kind === 'role') return ((career.role || {})[m.key] || 0);
    const wins = Object.values(career.champ || {}).map(c => c.w || 0);
    return m.kind === 'champWins' ? wins.reduce((a, b) => Math.max(a, b), 0) : wins.filter(w => w >= 10).length;
  }
  const medalTier = (m, v) => m.tiers.reduce((n, t) => v >= t.need ? n + 1 : n, 0);
  // Folds one finished match (from Sim.matchStats) into the career. Returns the tiers this match earned.
  function medalProgress(career, st) {
    const C = Object.assign(newCareer(), career || {}), earned = [];
    for (const k of ['sum', 'max', 'champ', 'role', 'tiers']) if (career && !career[k]) C[k] = {};
    if (career) Object.assign(career, C);
    const out = career || C;
    if (!st || st.practice) return { career: out, earned };
    const full = st.full !== false, pvp = st.mode !== 'raid', td = (st.kills || 0) + (st.assists || 0);
    const clean = full && pvp && st.won && !st.deaths && td >= 5, back = full && pvp && st.won && (st.trailed || 0) >= 3000;
    const inc = (k, v) => { if (v) out.sum[k] = (out.sum[k] || 0) + v; }, top = (k, v) => { if (v > (out.max[k] || 0)) out.max[k] = v; };
    out.games++; if (st.won) out.wins++;
    for (const k of ['multi3', 'multi4', 'multi5', 'mastery', 'rescues', 'saves', 'towers', 'objectives', 'colossi', 'steals', 'clutch']) inc(k, st[k] || 0);
    inc('deathless', clean ? 1 : 0); inc('comebacks', back ? 1 : 0);
    if (full && pvp) { top('kills', st.kills || 0); top('bestStreak', st.bestStreak || 0); }
    top('rescues', st.rescues || 0); if (clean) top('deathlessTD', td); if (back) top('deficit', st.trailed);
    if (st.champ) { const c = out.champ[st.champ] || (out.champ[st.champ] = { g: 0, w: 0 }); c.g++; if (st.won) c.w++; }
    if (st.won && st.role && full && pvp && st.mode !== 'duel') out.role[st.role] = (out.role[st.role] || 0) + 1;
    for (const m of MEDALS) {
      const was = out.tiers[m.id] || 0, now = Math.max(was, medalTier(m, medalValue(out, m)));
      for (let i = was; i < now; i++) earned.push({ id: m.id, name: m.name, tier: i, tierName: m.tiers[i].name, need: m.tiers[i].need });
      if (now) out.tiers[m.id] = now;
    }
    return { career: out, earned };
  }
  const MARK_BONUS = { potg: 25, mvp: 30, svp: 15, medal: [40, 100, 300] };
  // bonus = { potg, mvp, svp, medals: earned list from medalProgress }, all optional.
  function marksEarned(won, st, bonus) {
    st = st || {}; const b = bonus || {};
    const base = 30 + (won ? 45 : 0) + Math.min(30, (st.kills || 0) * 3 + (st.assists || 0) * 1.5) + Math.min(10, (st.skillHits || 0) * .1);
    return Math.round(base + (b.potg ? MARK_BONUS.potg : 0) + (b.mvp ? MARK_BONUS.mvp : 0) + (b.svp ? MARK_BONUS.svp : 0) + (b.medals || []).reduce((a, m) => a + (MARK_BONUS.medal[m.tier] || 0), 0));
  }


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
  // Four kits that can actually cover the four roles, for bot-filled teams. `want` is a kit that must be included.
  function sensiblePool(team, want, rand = Math.random) {
    const roster = ROSTER[team], out = [], roles = ROLES.slice();
    if (want) { const f = KITS[want].fit; roles.sort((a, b) => (f[b] || 0) - (f[a] || 0)); roles.shift(); out.push(want); }
    for (let i = roles.length - 1; i > 0; i--) { const j = rand() * (i + 1) | 0; [roles[i], roles[j]] = [roles[j], roles[i]]; }
    for (const r of roles) { const opts = roster.filter(k => !out.includes(k) && (KITS[k].fit[r] || 0) >= 2), any = roster.filter(k => !out.includes(k)), list = opts.length ? opts : any; out.push(list[rand() * list.length | 0]); }
    return out;
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
      const k = roleK(c, 'support') * .5; if (k) { pay(s, c, gold * k); giveXp(s, c, xp * k); }
    }
  }

  // ---------- match ----------
  // Hands a seat to a bot or back to a person, mid-match. Used when a networked friend drops or returns.
  function setBot(s, c, on) {
    c.q.length = 0; c.mv.x = c.mv.y = 0; c.atk = false; c.atkPref = 0; c.preferTower = false;
    if (on) { if (!c.bot) c.bot = makeBot(s, c); c.human = false; }
    else { c.bot = undefined; c.human = true; }
  }

  // ---------- 11.0 match modes ----------
  const MODES = [
    { id: 'classic', name: 'Classic', d: 'Two lanes, four a side, every objective in play.' },
    { id: 'duel', name: 'Duel', d: 'One on one in a single lane.', teamSize: 1 },
    { id: 'brawl', name: 'Brawl', d: 'Four a side, all in one lane.' },
    { id: 'gold', name: 'Gold Rush', d: 'Classic with double gold.' },
    { id: 'raid', name: 'Raid', d: 'Co-op against the Colossus and its waves.', coop: true },
  ];
  const RAID_COLOSSUS_AT = 480, RAID_COLOSSUS_HP = 2.6, RAID_COLOSSUS_DMG = 1.25, RAID_TOWER_K = .28;
  const modeOf = cfg => MODES.some(m => m.id === cfg.mode) ? cfg.mode : 'classic';
  // Shapes cfg.teams in place for the mode, so the seat order stays s.champs order for host and guests. Safe to run twice.
  function normalizeTeams(cfg) {
    const mode = modeOf(cfg), T = cfg.teams;
    if (mode === 'duel') for (const list of T) { const keep = list.find(p => p.human) || list[0]; list.length = 0; if (keep) { keep.role = 'top'; list.push(keep); } }
    if (mode === 'raid') {
      const side = Math.max(0, T.findIndex(l => l.some(p => p.human))), other = T[1 - side], own = T[side], humans = [...own.filter(p => p.human), ...other.filter(p => p.human)].slice(0, 4), bots = own.filter(p => !p.human);
      const rand = rng((cfg.seed || 7) + 991), used = humans.map(p => sideKit(side, p.champ)), fill = bots.slice(0, 4 - humans.length);
      if (humans.length + fill.length < 4) for (const champ of sensiblePool(side, null, rand)) if (humans.length + fill.length < 4 && !used.includes(champ) && !fill.some(p => p.champ === champ)) fill.push({ champ, name: KITS[champ].name, tier: 0, skill: .6 });
      own.length = 0; own.push(...humans, ...fill); other.length = 0;
    }
    return mode;
  }
  function createMatch(cfg) {
    const mode = normalizeTeams(cfg), oneLane = mode === 'duel' || mode === 'brawl', raidSide = Math.max(0, cfg.teams.findIndex(l => l.length));
    const s = {
      mode, oneLane, lanes: oneLane ? [0] : [0, 1], raid: mode === 'raid' ? { team: raidSide, enemy: 1 - raidSide, surge: 0 } : null,
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
      for (const lane of s.lanes) { const f = y => lane ? H - y : y; mk(S(1500), f(S(345)), 'tower', lane, 0); mk(S(800), f(S(640)), 'tower', lane, 1); }
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
    if (mode === 'duel') { for (const B of s.bosses) B.at = 1e9; s.bossAt = 1e9; s.eventAt = 1e9; }
    if (mode === 'raid') { const B = s.bosses.find(b => b.kind === 'colossus'); B.at = RAID_COLOSSUS_AT; s.bossAt = RAID_COLOSSUS_AT; s.eventAt = 1e9; }
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
        oneLane, x: mir(S(180), team), y: H / 2 + (i - 1.5) * 46, r: 26, sight: k.sight + (prof === 'longsight' ? 120 : 0), lvl: 1, xp: 0, gold: 300 * goldK(s), up: { edge: 0, guard: 0, haste: 0 },
        hp: k.hp, maxHp: k.hp, armor: k.armor, mr: k.mr, dmgBase: k.dmg, range: k.range, msBase: k.ms, as: k.as, kit: k.kit, f: { [build]: 1 }, evolved: [-1, -1], items: Array(ITEM_SLOTS).fill(null), atkMode: 'champ', beacons: prof === 'pathfinder' ? 3 : 2, beaconT: 0, st: blankStats(),
        alive: true, respawn: 0, atkCd: 0, lock: 0, fx: team ? -1 : 1, fy: 0, cd: [0, 0, 0], recast: [0, 0, 0], q: [], mv: { x: 0, y: 0 }, atk: false,
        stunT: 0, slowT: 0, slowA: 0, markT: 0, parryT: 0, drT: 0, air: 0, buffT: 0, empowerT: 0, revealT: 0, rootT: 0, polyT: 0, knockT: 0, knockMax: 0, stealthT: 0, noHealT: 0, hasteT: 0, hasteA: 0, shieldHp: 0, shieldT: 0, vulnT: 0, dmarkT: 0, opener: 0, ripT: 0, curseN: 0, curseT: 0, poisonT: 0, poisonDps: 0, bleedT: 0, bleedDps: 0, pstack: 0, pready: 0, rage: 0, streak: 0, bounty: 0, potT: 0, elixT: 0, tonicT: 0, sentT: 0, dropT: 0, buybackCd: 0, fundCd: 0, cleanseCd: 0, dlog: [],
        vx: 0, vy: 0, assist: {}, charge: null, chan: null, dash: null, leap: null, cuts: null, duelZ: null, inBrush: -1, recentHit: 0,
        stats: { casts: 0, skillHits: 0, parries: 0, kills: 0, deaths: 0, assists: 0, dmg: 0, dealt: 0, taken: 0, healing: 0, gold: 0, towers: 0, objectives: 0, rescues: 0, multi3: 0, multi4: 0, multi5: 0, bestStreak: 0, clutch: 0, saves: 0, steals: 0, colossi: 0, trailed: 0 },
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
    if (s.raid && t.team === s.raid.enemy) return false; // Raid: the enemy base is out of reach, the Colossus is the goal
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

  function heal(s, src, t, amt) { if (t.noHealT > 0) return; amt *= (1 + .15 * roleK(src, 'support')) * (1 + (src.st ? src.st.healPow : 0)) * (src.prof === 'guardian' ? 1.2 : 1); if (src.st && src.st.u.saintsbell && t !== src) t.bellT = 3; const a = Math.min(amt, t.maxHp - t.hp); if (src.stats && t !== src && t.kind === 'champ' && t.hp < t.maxHp * .25 && a >= t.maxHp * .08 && s.t - (t.lastHurt || -99) < 3 && !(t.savedAt > s.t)) { t.savedAt = s.t + 10; src.stats.saves++; highlight(s, 'save', src, t.x, t.y, 1, 35); } t.hp += a; if (src.stats) src.stats.healing += a; if (src.champ === 'solenne' && amt - a > 1 && t.kind === 'champ') { t.shieldHp = Math.min(t.maxHp * .25, (t.shieldT > 0 ? t.shieldHp : 0) + (amt - a) * .5); t.shieldT = Math.max(t.shieldT || 0, 3); } if (a > 1) s.ev.push({ e: 'heal', u: t.id, a: Math.round(amt) }); }

  function hurt(s, src, t, amt, o = {}) {
    if (!t.alive || t.air) return 0;
    if (t.kind === 'beacon') { if (!o.basic) return 0; t.hp--; s.ev.push({ e: 'bhit', x: t.x, y: t.y, team: t.team }); if (t.hp <= 0) { t.alive = false; if (src && src.kind === 'champ') earn(s, src, 25); } return 1; }
    if (t.kind === 'tower' && !towerOpen(s, t)) return 0;
    if (t.parryT > 0) {
      t.parryT = 0; t.stats.parries++; t.cd[1] = Math.min(t.cd[1], 2); t.ripT = 3.5;
      s.ev.push({ e: 'parry', u: t.id }); if (src && src.kind !== 'tower' && src.alive && !src.boss) stun(s, src, t.parryStun || .9);
      if (t.f.vanguard) for (const a of alliesIn(s, t.team, t.x, t.y, 300)) if (a !== t) shield(s, a, 100 * hpow(t), 3);
      if (src && src.kind === 'champ' && !o.dot && t.champ === 'kade') hurt(s, t, src, amt * .6, { dot: 1 });
      return 0;
    }
    const champSrc = src && src.kind === 'champ', magic = champSrc && !o.basic && isMag(src);
    let res = magic ? (t.mr !== undefined ? t.mr : t.armor || 0) : (t.armor || 0);
    if (magic && t.curseN > 0 && t.curseT > 0) res = Math.max(0, res - t.curseN * 6);
    if (champSrc) res *= 1 - (magic ? src.st.mpen : src.st.pen);
    let a = amt * 100 / (100 + res);
    if (champSrc) {
      if (src.opener > 0 && t.kind === 'champ' && !o.dot) { a *= 1.6; o.crit = 1; src.opener = 0; if (src.champ === 'shiv') slow(t, .5, 1); }
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
    if (champSrc && src.poisonT > 0 && src.poisonBy && src.poisonBy.champ === 'plague') a *= .9;
    if (t.kind === 'champ') {
      if (t.prof === 'ironclad' && s.towers.some(o2 => o2.alive && o2.team === t.team && dist(o2, t) < o2.range)) a *= .82;
      if (t.st.u.aegisprime && !o.basic && !o.dot && champSrc && !(t.aegAt > s.t)) { a *= .5; t.aegAt = s.t + 20; }
    }
    if (t.shellT > 0) a *= .55;
    for (const z of s.zones) if (z.kind === 'dome' && z.team === t.team && Math.hypot(z.x - t.x, z.y - t.y) < z.r) { a *= 1 - .25 * (1 + .15 * roleK(z.owner, 'support')); break; }
    if (t.kind === 'champ') for (const al of s.champs) if (al.team === t.team && al.alive && al.st.u.sanctum && al !== t && dist(al, t) < 350) { a *= al.st.u.sanctuary ? .85 : .92; break; }
    // Structures weaken late so a match always reaches an ending.
    if (t.kind === 'tower') a *= structureK(s) * (1 - .2 * (s.catchup[t.team] || 0));
    if (t.kind === 'tower' && src && src.kind === 'minion') a *= src.towerK || 1;
    if (t.kind === 'tower' && s.raid) a *= RAID_TOWER_K;
    if (s.practice && t.kind === 'tower') { s.ev.push({ e: 'hit', u: t.id, a: Math.round(a), sk: o.skill ? 1 : 0, crit: 0, by: src ? src.id : 0 }); return a; }
    if (t.kind === 'monster' && champSrc) {
      t.hitAt = s.t; if (!t.tgt) t.tgt = src; a *= (1 + .35 * roleK(src, 'jungle')) * (1 + src.st.mon) * (src.prof === 'predator' ? (t.boss ? 1.15 : 1.25) : 1) * (t.boss && src.st.u.sovereign ? 1.25 : 1);
      // Kill Strike: a monster dropping under 10% is finished on the spot.
      if (src.prof === 'killstrike' && !(src.strikeAt > s.t) && t.hp - a < t.maxHp * .1) { a = Math.max(a, t.hp + 1); src.strikeAt = s.t + (t.boss ? 30 : 10); heal(s, src, src, src.maxHp * .08); s.ev.push({ e: 'strike', u: src.id, x: t.x, y: t.y }); }
      if (t.boss) (t.dmgBy || (t.dmgBy = [0, 0]))[src.team] += a;
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
      src.stats.dmg += a; if (t.kind === 'champ') { src.stats.dealt += a; if (src.ultW && s.t <= src.ultW.t) { src.ultW.dmg += a; if (!src.ultW.ids.includes(t.id)) src.ultW.ids.push(t.id); } }
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
    if (c.lvl >= MAX_LEVEL) return; if (c.solo) xp *= 1 + .2 * roleK(c, 'top'); xp *= 1 + .22 * (s.catchup ? s.catchup[c.team] : 0); if (s.topLvl && c.lvl < s.topLvl[c.team]) xp *= 1 + Math.min(.5, .12 * (s.topLvl[c.team] - c.lvl)); c.xp += xp;
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
  const goldK = s => s.mode === 'gold' ? 2 : 1;
  const earn = (s, c, g) => { g *= goldK(s) * (1 + .34 * (s.catchup ? s.catchup[c.team] : 0)) * (s.boons[c.team].heist > 0 ? 1.25 : 1); c.gold += g; c.stats.gold += g; };
  // Paying a champion without catch-up multipliers: objectives, bounties and refunds already carry their own numbers.
  const pay = (s, c, g) => { g *= goldK(s); c.gold += g; c.stats.gold += g; };
  const teamNear = (s, team, x, y, r) => s.champs.filter(c => c.team === team && c.alive && Math.hypot(c.x - x, c.y - y) < r);

  // Highlights: one event per moment worth replaying. v is a rough score, n the size of it.
  const highlight = (s, kind, u, x, y, n, v, b) => s.ev.push({ e: 'hl', kind, u: u.id, x: Math.round(x), y: Math.round(y), n, v: Math.round(v), b });
  function noteKill(s, src, t, multi, bounty) {
    const st = src.stats;
    if (multi >= 3) st.multi3++; if (multi >= 4) st.multi4++; if (multi >= 5) st.multi5++;
    st.bestStreak = Math.max(st.bestStreak, src.streak);
    if (src.ultW && s.t <= src.ultW.t) src.ultW.kills++;
    if (multi >= 2) highlight(s, 'multi', src, t.x, t.y, multi, 30 * multi * multi);
    if (src.alive && src.hp <= src.maxHp * .15) { st.clutch++; highlight(s, 'clutch', src, t.x, t.y, 1, 45); }
    if (bounty >= 300) highlight(s, 'shutdown', src, t.x, t.y, Math.round(bounty), 30 + bounty / 10);
    const foes = s.champs.filter(c => c.team === t.team);
    if (foes.length >= 2 && foes.every(c => !c.alive)) highlight(s, 'ace', src, t.x, t.y, foes.length, 120);
  }
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
      t.deaths = (t.deaths || 0) + 1; t.stats.deaths++; if (t.bot) t.bot.deaths.push(s.t); t.respawn = 5 + t.lvl * 1.1 + s.t / 120 + Math.max(0, s.t - 780) / 22; t.respawn *= (1 - .22 * s.catchup[t.team]) * (1 + .12 * s.catchup[et]); t.chan = t.dash = t.charge = t.leap = null; t.air = 0; t.stealthT = 0; t.duelZ = null; t.shieldHp = 0;
      // How far ahead the killer's side is, and how far behind: every reward below bends with these.
      const ahead = s.catchup[t.team] || 0, behind = s.catchup[et] || 0, downstreak = t.deathN || 0; t.deathN = downstreak + 1;
      const shutdown = behind > .12 && src && src.kind === 'champ' ? Math.round(80 + 180 * behind) : 0, bounty = (t.bounty || 0) + shutdown; t.streak = 0; t.bounty = 0;
      // Dying over and over pays less each time, and a side already ahead earns less per kill.
      const killPay = Math.round(KILL_GOLD * (1 - .35 * ahead) * Math.max(.45, 1 - .18 * Math.max(0, downstreak - 1))), xpK = lv => clamp(1 + .16 * (t.lvl - lv), .55, 1.7);
      if (s.practice) t.respawn = .6;
      s.kills[et]++;
      let multi = 1;
      if (src && src.kind === 'champ') { multi = s.t - (src.lastKill || -99) < 10 ? (src.multi || 1) + 1 : 1; src.multi = multi; src.lastKill = s.t; }
      const first = !s.firstBlood; s.firstBlood = true;
      if (src && src.kind === 'champ' && src.st.u.widow) haste(src, .35, 2.5);
      if (src && src.kind === 'champ') { src.streak = (src.streak || 0) + 1; src.bounty = bountyFor(src.streak); src.deathN = 0; earn(s, src, killPay + bounty); src.stats.kills++; giveXp(s, src, (120 + 16 * t.lvl) * xpK(src.lvl)); s.ev.push({ e: 'gold', u: src.id, a: killPay + bounty }); noteKill(s, src, t, multi, bounty); }
      // Assists split one pot, so ganging up on someone does not print money.
      const helpers = Object.keys(t.assist).filter(id => s.t - t.assist[id] < 9 && (!src || +id !== src.id)).map(id => s.champs.find(c => c.id === +id)).filter(Boolean), share = helpers.length ? Math.max(ASSIST_MIN, ASSIST_POOL / helpers.length) * (1 - .35 * ahead) : 0;
      for (const a of helpers) { a.deathN = 0; earn(s, a, share * (a.prof === 'patron' ? 1.4 : 1)); a.stats.assists++; giveXp(s, a, 70 * xpK(a.lvl)); }
      supportShare(s, src, t.x, t.y, 90, 70);
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
      s.champs.filter(c => c.team === et).forEach(c => { pay(s, c, 140 * objK(s, et)); giveXp(s, c, 70); if (c.alive && dist(c, t) < 900) c.stats.towers++; });
      rebuildNav(s);
      s.ev.push({ e: 'tower', team: t.team, sub: t.sub });
      if (t.sub === 'core') { s.over = { winner: et, t: s.t }; if (src && src.kind === 'champ') highlight(s, 'core', src, t.x, t.y, 1, 60); }
    }
  }

  function spawnWave(s, surge) {
    if (!surge) s.wave++;
    const scale = 1 + s.wave * .035 + Math.max(0, s.t - 780) / 140;
    const R = s.raid;
    for (const team of [0, 1]) for (const lane of s.lanes) {
      if (surge && team !== R.enemy) continue;
      const foe = R && team === R.enemy, path = team ? [...s.map.lanes[lane]].reverse() : s.map.lanes[lane], reinf = s.reinforceQ[team][lane] > 0; if (reinf) s.reinforceQ[team][lane]--;
      const boonK = (s.boons[team].foreman > 0 ? 1.4 : 1) * (reinf ? 1.35 : 1), n = 4 + (s.wave % 3 === 0 ? 1 : 0) + (reinf ? 2 : 0) + (foe ? (surge ? 2 : (s.wave >= 8 ? 1 : 0) + (s.wave >= 14 && s.wave % 4 === 0 ? 2 : 0)) : 0), raidK = R ? 1 + Math.max(0, s.wave - 8) * .03 : 1;
      for (let i = 0; i < n; i++) {
        // Two melee, two ranged, a heavy every third wave; reinforcements add heavies at the back.
        const type = i < 2 ? 'melee' : i < 4 ? 'ranged' : 'heavy', T = MINION_TYPES[type], x = path[0][0] + (s.rand() - .5) * 30, y = path[0][1] + (s.rand() - .5) * 30 + i * 8;
        const hp = T.hp * scale * boonK * raidK;
        s.minions.push({ id: s.nid++, kind: 'minion', type, heavy: type === 'heavy', team, lane, x, y, px: x, py: y, r: T.r, sight: 500, hp, maxHp: hp, armor: T.armor, dmg: T.dmg * scale * boonK * raidK, towerK: T.towerK, range: T.range, ranged: type === 'ranged', ms: T.ms, as: T.as, alive: true, cd: 0, wp: 1, path, stunT: 0, slowT: 0, slowA: 0, markT: 0, vx: 0, vy: 0, delay: i * .45, fx: team ? -1 : 1, fy: 0 });
      }
    }
  }
  const CAMP_LEASH = 280, BOSS_LEASH = 450, MINION_LEASH = 210;
  const KILL_GOLD = 320, ASSIST_POOL = 230, ASSIST_MIN = 55, bountyFor = streak => streak >= 2 ? Math.min(560, 110 * (streak - 1)) : 0;
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
    const raidBoss = s.raid && B.kind === 'colossus', hp = S2.hp * k * (raidBoss ? RAID_COLOSSUS_HP : 1), x = B.x, y = B.y;
    const m = { id: s.nid++, kind: 'monster', team: 2, boss: true, bossKind: B.kind, x, y, px: x, py: y, hx: x, hy: y, r: S2.r, leash: Math.max(BOSS_LEASH, B.r), hp, maxHp: hp, armor: S2.armor, dmg: S2.dmg * (raidBoss ? RAID_COLOSSUS_DMG : 1), range: S2.range, ms: S2.ms, as: S2.as, alive: true, cd: 0, slam: S2.slamEvery * .7, tgt: null, stunT: 0, slowT: 0, slowA: 0, markT: 0, vx: 0, vy: 0, fx: 1, fy: 0 };
    s.monsters.push(m); B.up = true; B.id = m.id; B.at = 0;
    if (B.kind === 'colossus') s.bossUp = true;
    s.ev.push({ e: 'bossup', kind: B.kind });
  }
  // Objectives pay the side that is behind more, and last less long for the side ahead.
  const objK = (s, team) => 1 + .4 * (s.catchup[team] || 0) - .3 * (s.catchup[1 - team] || 0);
  const boonFor = (s, team) => BOON_T * (1 + .15 * (s.catchup[team] || 0) - .3 * (s.catchup[1 - team] || 0));
  function grantBoon(s, team, kind, secs) { const had = s.boons[team][kind] > 0; s.boons[team][kind] = secs; if (!had) s.ev.push({ e: 'boon', team, kind, on: true }); }
  function bossDown(s, m, src) {
    const team = src && src.team !== 2 ? src.team : 0, B = s.bosses.find(b => b.kind === m.bossKind);
    if (B) { B.up = false; B.id = 0; B.at = s.t + BOSS_RESPAWN[B.kind]; }
    const boonT = boonFor(s, team);
    for (const c of s.champs) if (c.team === team) { pay(s, c, (m.bossKind === 'colossus' ? 200 : 130) * objK(s, team)); giveXp(s, c, m.bossKind === 'colossus' ? 200 : 140); if (Math.hypot(c.x - m.x, c.y - m.y) < 1000) { c.stats.objectives++; if (m.bossKind === 'colossus') c.stats.colossi++; } }
    if (src && src.kind === 'champ') { const by = m.dmgBy || [0, 0], all = by[0] + by[1]; if (all > 0 && by[team] / all < .35) { src.stats.steals++; highlight(s, 'steal', src, m.x, m.y, 1, 160, m.bossKind); } else if (m.bossKind === 'colossus') highlight(s, 'boss', src, m.x, m.y, 1, 55, m.bossKind); }
    grantBoon(s, team, m.bossKind, boonT);
    if (m.bossKind === 'colossus') { s.buff[team] = 1; s.bossAt = s.t + BOSS_RESPAWN.colossus; s.bossUp = false; for (const c of s.champs) if (c.team === team) c.buffT = boonT; }
    if (m.bossKind === 'sentinel') for (const c of s.champs) if (c.team === team) { c.sentT = boonT; applyStats(c, true); if (c.alive) shield(s, c, c.maxHp * .12, 10); }
    s.ev.push({ e: 'boss', team, kind: m.bossKind });
    if (s.raid && m.bossKind === 'colossus') s.over = { winner: s.raid.team, t: s.t };
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
      for (const c of s.champs) if (c.team === team) { pay(s, c, I.gold * objK(s, team)); giveXp(s, c, 110); if (c.alive && Math.hypot(c.x - E.x, c.y - E.y) < E.r + 500) c.stats.objectives++; }
      const boonT = boonFor(s, team); grantBoon(s, team, I.boon, boonT);
      setHope(s, s.hope + (team ? -I.hope : I.hope));
      if (E.kind === 'drop') for (const c of s.champs) if (c.team === team) c.dropT = boonT;
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
    lane = lane && !s.oneLane ? 1 : 0;
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
    // Casting is a way out of a recall, the same as walking.
    if (c.chan && c.chan.recall) c.chan = null;
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
    if (q.slot === 2) c.ultW = { t: s.t + 3, dmg: 0, ids: [], kills: 0 };
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

    // Pressing attack with something to hit cancels a recall too.
    if (c.atk && !c.bot && c.chan && c.chan.recall && c.atkCd <= 0 && autoTarget(s, c)) c.chan = null;
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
  const STATUS_T = ['stunT', 'slowT', 'markT', 'parryT', 'drT', 'buffT', 'empowerT', 'revealT', 'lock', 'rootT', 'polyT', 'knockT', 'stealthT', 'noHealT', 'hasteT', 'shieldT', 'vulnT', 'dmarkT', 'opener', 'ripT', 'curseT', 'poisonT', 'bleedT', 'pingT', 'dropT', 'stringT', 'kindleT', 'bellT', 'tempoT', 'behindT'];
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
    // A lead is judged against the size of the economy: 2000 gold is a lot at minute 5 and little at minute 15.
    const gap = s.raid ? 0 : worth[1] - worth[0], k = clamp(Math.abs(gap) / (900 + .1 * (worth[0] + worth[1])), 0, 1);
    s.catchup[0] = gap > 0 ? k : 0; s.catchup[1] = gap < 0 ? k : 0;
    for (const c of s.champs) { const behind = c.team ? -gap : gap; if (behind > c.stats.trailed) c.stats.trailed = Math.round(behind); }
    s.topLvl = [0, 1].map(team => s.champs.reduce((v, c) => c.team !== team ? Math.max(v, c.lvl) : v, 1));
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
      const n = norm(m.hx - m.x, m.hy - m.y); if (n.l > 8) { m.x += n.x * 320 * DT; m.y += n.y * 320 * DT; pushOut(s.map, m); } else if (!(s.raid && m.bossKind === 'colossus')) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * .25 * DT);
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
    const base = target.kind === 'champ' ? (TOWER_BASE + s.t * TOWER_RAMP) * ramp * (1 + .2 * (s.catchup[t.team] || 0)) : target.maxHp * (target.heavy ? .16 : s.t > 1020 ? .16 : s.t > 900 ? .24 : .42) * (1 + (target.armor || 0) / 100);
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

  const CLASS = { vesper: 'back', ione: 'back', solenne: 'peel', kade: 'front', gravel: 'front', sable: 'flank', deadbolt: 'back', hex: 'back', plague: 'peel', duelist: 'front', ironjaw: 'front', shiv: 'flank', voltaic: 'flank', tidecaller: 'peel', paragon: 'front', mirage: 'back', cinder: 'back', ravager: 'flank', cataclysm: 'front', puppeteer: 'peel' };
  function makeBot(s, c, skill) {
    const i = c.slot, b = {
      skill: 0, sk: null, lane: c.role === 'top' || c.oneLane ? 0 : 1, cls: CLASS[c.champ] || 'front', mask: navMask(c.team), next: i * .05 + .02, foes: [], tid: 0, closest: 1e9, ratio: 1, noise: 0, noiseAt: 0, strafe: i % 2 ? 1 : -1,
      gx: c.x, gy: c.y, ga: 20, hasGoal: false, vx: 0, vy: 0, vecT: 0, ex: 0, ey: 0, evadeT: 0, dodgeAt: 0, dodgeSeen: 0, path: null, pi: 0, pgx: 0, pgy: 0, needPath: false, sx: c.x, sy: c.y, stuck: 0, still: false, diveOk: false,
      et: null, etTanks: 0, castAt: 0, chargeHold: 1.12, threatT: 9, parry: false, low: false, fighting: false, lhSoon: false, lastHome: 0, gank: null, gankCd: 0, deaths: [], siegeT: 0,
      buyPath: 0, potAt: 0, route: null, routeI: 0, cycles: 0, gankReady: false, chase: 0, noChase: 0, tradeT: 0, task: 'spawn', safeUntil: 0,
      setSkill(x) { b.skill = clamp(x, 0, 1); b.sk = skillProfile(b.skill); },
    };
    b.setSkill(skill !== undefined ? skill : c.skill !== undefined ? c.skill : .5);
    b.buyPath = hash01((s.seed || 7) + c.team * 31, c.slot + 77) * itemPaths(c.champ, c.build).length | 0;
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
      if (Math.hypot(x - f1.x, y - f1.y) < 456) b |= NAV_NO0;
      if (Math.hypot(x - f0.x, y - f0.y) < 456) b |= NAV_NO1;
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
    // Stepping over a visible wire is a choice: walk around its end unless a sharper bot has no way past.
    if ((vx || vy) && b.sk.iq > .35) for (const z of s.zones) {
      if (z.kind !== 'tripline' || z.team === c.team) continue;
      const near = segDist(c.x + vx * 70, c.y + vy * 70, z.x1, z.y1, z.x2, z.y2);
      if (near > 44) continue;
      const a = Math.hypot(c.x - z.x1, c.y - z.y1) < Math.hypot(c.x - z.x2, c.y - z.y2) ? { x: z.x1, y: z.y1 } : { x: z.x2, y: z.y2 };
      const n = norm(z.x2 - z.x1, z.y2 - z.y1), out = a.x === z.x1 ? -1 : 1, px = a.x + n.x * out * 54, py = a.y + n.y * out * 54, v = norm(px - c.x, py - c.y);
      if (navOpen(m, b.mask, px, py)) { vx = v.x; vy = v.y; onPath = false; }
      break;
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
  const ensureAi = ai => { if (!ai.mem) { ai.mem = {}; ai.cover = {}; ai.phase = 'lane'; ai.hum = {}; ai.split = 0; ai.pings = []; } };
  const roleLane = c => c.role === 'jungle' ? -1 : c.role === 'top' || c.oneLane ? 0 : 1;

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
  const BURST = { vesper: [190, 0, 260], kade: [124, 0, 185], ione: [82, 165, 345], solenne: [72, 0, 90], sable: [138, 0, 180], gravel: [64, 62, 165], deadbolt: [62, 160, 240], duelist: [220, 0, 150], hex: [100, 0, 240], plague: [120, 170, 0], shiv: [150, 0, 252], ironjaw: [130, 70, 165], voltaic: [120, 90, 190], tidecaller: [80, 60, 170], paragon: [95, 95, 230], mirage: [150, 0, 170], cinder: [110, 80, 280], ravager: [130, 90, 160], cataclysm: [140, 90, 190], puppeteer: [75, 80, 140] };
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
  const CARRY = { vesper: 1, ione: .9, sable: .7, kade: .4, solenne: .3, gravel: 0, deadbolt: 1, hex: .9, shiv: .7, duelist: .4, plague: .3, ironjaw: 0, voltaic: .7, tidecaller: .3, paragon: .4, mirage: 1, cinder: .9, ravager: .4, cataclysm: 0, puppeteer: .3 };

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

  // Next purchase: three core items, then a legendary, weaving the remaining chains with more legendaries.
  function nextBuy(s, c) {
    const rec = recommended(c.champ, c.build, c.bot ? c.bot.buyPath : 0);
    const chain = id => { const path = itemPath(id); let top = -1; for (let i = path.length - 1; i >= 0; i--) if (c.items.includes(path[i])) { top = i; break; } if (top === path.length - 1) return null; const step = path[top + 1], cost = itemPrice(c, step); return cost === null ? null : { id: step, cost }; };
    const legend = id => { const up = LEGEND[id]; if (!up || c.items.includes(up) || !c.items.includes(id)) return null; const cost = itemPrice(c, up); return cost === null ? null : { id: up, cost }; };
    for (const [fn, i] of [[chain, 0], [chain, 1], [chain, 2], [legend, 0], [chain, 3], [legend, 1], [chain, 4], [legend, 2], [legend, 3], [legend, 4]]) { const n = rec[i] && fn(rec[i]); if (n) return n; }
    return null;
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
    if (laning) for (const lane of s.lanes) {
      const seats = s.champs.filter(o => o.team === team && roleLane(o) === lane);
      let held = false;
      for (const o of seats) {
        if (o.bot) { held = held || o.alive; continue; }
        const here = !o.alive || (dist(o, s.fountains[team]) > 620 && laneDist(s, lane, o.x, o.y) < 400);
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

    // Bosses: never during laning. Take the one that is up or nearly due, most valuable first.
    {
      const prevHoard = ai.hoard;
      let pick = null, bv = 0;
      if (!laning) for (const B of s.bosses) {
        const due = B.up ? 1 : B.at - s.t < 14 ? .7 : 0; if (!due) continue;
        let d = 0; for (const c of mine) d += dist(c, B); d = mine.length ? d / mine.length : 1e9;
        const v = due * (B.kind === 'colossus' ? 2.5 : 1) * (prevHoard && prevHoard.kind === B.kind ? 1.35 : 1) / (1 + d / 2000);
        if (v > bv) { bv = v; pick = B; }
      }
      if (!pick) { ai.hoard = null; ai.hoardGo = false; }
      else {
        const B = pick, boss = B.up ? s.monsters.find(m => m.id === B.id && m.alive) : null, home = s.fountains[team], n = norm(home.x - B.x, home.y - B.y);
        let minePow = 0, foePow = 0, close = 0;
        for (const c of mine) minePow += power(c);
        for (const e of foes) if (dist(e, B) < 1380) foePow += power(e, true);
        const size = B.kind === 'colossus' ? 4 : 3, needAlive = B.kind === 'colossus' ? Math.min(3, s.champs.filter(c => c.team === team).length) : 2;
        const enough = mine.length >= needAlive || foesAlive <= 1;
        if (enough && foePow < minePow * .95 && !(call && call.sub === 'core')) {
          const pool = mine.filter(c => c.bot && frac(c) > .4 && !(ai.defend && ai.defend.ids.includes(c.id))).sort((a, z) => dist(a, B) - dist(z, B)).slice(0, size), ids = pool.map(c => c.id);
          for (const c of pool) if (dist(c, B) < 940) close++;
          ai.hoard = { kind: B.kind, x: B.x + n.x * Math.min(560, B.r + 300), y: B.y + n.y * Math.min(560, B.r + 300) + (team ? 40 : -40), ids };
          if (prevHoard && prevHoard.kind === B.kind && ai.hoardGo) ai.hoardGo = true;
          else ai.hoardGo = !!boss && close >= Math.min(needAlive, ids.length) && ids.length > 0;
        } else { ai.hoard = null; ai.hoardGo = false; }
      }
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
    // Map events: a squad contests the spot; laning sends only the roamers.
    ai.ev = {};
    const E = s.event;
    if (E && (E.phase === 'live' || E.t < 8)) {
      const want = laning ? 1 : ai.phase === 'late' ? 3 : 2;
      const pool = mine.filter(c => c.bot && !c.bot.low && frac(c) > .4 && !(ai.defend && ai.defend.ids.includes(c.id)) && !(ai.hoard && ai.hoard.ids.includes(c.id)) && (!laning || c.role === 'jungle' || c.role === 'support')).sort((a, z) => dist(a, E) - dist(z, E));
      for (const c of pool.slice(0, want)) ai.ev[c.id] = E;
    }
    // Later the side groups and pushes one lane, leaving a strong top laner to split the other.
    ai.split = 0;
    const late = ai.phase === 'late', ahead = s.t >= 500 && (s.kills[team] - s.kills[1 - team] >= 6 || foesAlive <= mine.length - 3 || s.champs.some(c => c.team === team && c.buffT > 0));
    if (!s.raid && !laning && mine.length >= foesAlive - 1 && (late || ahead)) {
      if (s.t >= ai.pushUntil || ai.push === null) {
        const left = [0, 1].map(l => s.towers.filter(t => t.alive && t.team !== team && t.lane === l).length);
        const adv = [0, 1].map(l => s.laneInfo[team][l].best);
        ai.push = s.oneLane ? 0 : left[0] !== left[1] ? (left[0] < left[1] ? 0 : 1) : (adv[0] >= adv[1] ? 0 : 1);
        ai.pushUntil = s.t + 35;
      }
      const top = mine.find(c => c.bot && c.role === 'top' && frac(c) > .6);
      if (top && mine.length >= foesAlive && !(s.catchup[team] > .35)) ai.split = top.id;
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
      if (!a.alive || a.team !== c.team || dist(a, c) > 460) continue;
      for (const p of s.proj) if (!p.homing && p.team !== c.team && shotAt(a, p)) return a;
      for (const e of b.foes) if (e.chan && e.chan.kind === 'line' && segDist(a.x, a.y, e.x, e.y, e.x + e.chan.dx * e.chan.len, e.y + e.chan.dy * e.chan.len) < e.chan.w / 2 + a.r + 10) return a;
      if (b.sk.iq > .5 && frac(a) < .5) for (const e of b.foes) if (dist(e, a) < 380) return a;
    }
    return null;
  }
  // An ultimate is worth casting for a kill, a group, or a real fight; a beginner just throws it.
  function ultWorth(s, c, b, t) {
    if (!t) return false;
    if (b.sk.iq < .3) return s.rand() < .5;
    let near = 0; for (const e of b.foes) if (dist(e, t) < 290) near++;
    return t.hp <= burstOn(c, t) || near >= 2 || (b.ratio > .9 && frac(t) < .7 && (b.sk.iq > .5 || s.rand() < .6));
  }

  const COMBO = {
    vesper(s, c, b, t, d, mode) {
      if (!t) return false;
      if (rdy(c, 1) && (mode === 'retreat' || d < 210)) { const a = awayPoint(s, c, t, c.kit[1].range); cast(c, 1, a.x, a.y); return true; }
      if (mode === 'fight' && rdy(c, 2) && d < c.kit[2].range - 30 && losClear(s, c.x, c.y, t.x, t.y)) {
        // Deadeye is the longest, slowest wind-up. Save it for a stunned, slowed or dying target.
        const pinned = t.stunT > 0 || t.slowT > 0 || Math.hypot(t.vx, t.vy) < 200 || t.chan || t.charge;
        if ((pinned || b.sk.iq < .5) && (ultWorth(s, c, b, t) || frac(t) < .5)) { const p = lead(s, c, b, t, 2600, .7); cast(c, 2, p.tx, p.ty); return true; }
      }
      const A = c.kit[0];
      if (mode !== 'retreat' && rdy(c, 0) && d < A.range - 20 && !lineBlocked(s, c, b, t.x, t.y, 34)) {
        c.q.push({ t: 'charge', slot: 0 });
        // Full charge when nothing is close. A beginner lets go at odd moments.
        const full = A.charge * 1.02;
        b.chargeHold = b.sk.iq < .4 ? full * (.3 + s.rand() * .7) : (c.f.skirmisher ? full : (b.closest > 360 && frac(c) > .4 ? full : full * .45));
        return true;
      }
      return false;
    },
    kade(s, c, b, t, d, mode) {
      if (rdy(c, 1) && b.parry) { cast(c, 1, c.x, c.y); return true; }
      if (!t) return false;
      if (c.recast[0] > 0) {
        if (mode === 'retreat') { const a = awayPoint(s, c, t, 195); cast(c, 0, a.x, a.y); return true; }
        if (mode === 'fight' && d < c.kit[0].range) { cast(c, 0, t.x, t.y); return true; }
        return false;
      }
      if (mode === 'retreat') { if (rdy(c, 0) && d < 310) { const a = awayPoint(s, c, t, c.kit[0].range); cast(c, 0, a.x, a.y); return true; } return false; }
      if (mode !== 'fight') return false;
      if (rdy(c, 2) && d > 150 && d < c.kit[2].range && b.ratio >= .9 && ultWorth(s, c, b, t)) { const p = lead(s, c, b, t, 1100); cast(c, 2, p.tx, p.ty); return true; }
      if (rdy(c, 0) && d < c.kit[0].range + 10 && losClear(s, c.x, c.y, t.x, t.y)) { cast(c, 0, t.x, t.y); return true; }
      return false;
    },
    ione(s, c, b, t, d, mode) {
      if (!t || mode === 'retreat') return false;
      const A1 = c.kit[1], A0 = c.kit[0];
      if (mode === 'fight' && rdy(c, 2) && d < c.kit[2].range - 20 && losClear(s, c.x, c.y, t.x, t.y) && (ultWorth(s, c, b, t) || t.stunT > 0)) { cast(c, 2, t.x, t.y); return true; }
      if (t.markT > 0 && rdy(c, 1) && d < A1.range - 20 && losClear(s, c.x, c.y, t.x, t.y)) { const p = lead(s, c, b, t, 0, A1.delay); cast(c, 1, p.tx, p.ty); return true; }
      if (rdy(c, 0) && d < A0.range - 30 && (A0.passThrough || !lineBlocked(s, c, b, t.x, t.y, 42))) { const p = lead(s, c, b, t, A0.speed); cast(c, 0, p.tx, p.ty); return true; }
      // Without a mark coming, Rupture is only worth it on a stunned or careless target.
      if (rdy(c, 1) && d < A1.range - 20 && losClear(s, c.x, c.y, t.x, t.y) && (b.sk.iq < .5 ? s.rand() < .5 : c.cd[0] > 1.5 && (mode === 'fight' || t.stunT > 0 || c.f.meteor))) { const p = lead(s, c, b, t, 0, A1.delay); cast(c, 1, p.tx, p.ty); return true; }
      return false;
    },
    solenne(s, c, b, t, d, mode) {
      if (rdy(c, 1)) { const a = threatenedAlly(s, c, b); if (a && (b.sk.iq > .4 || s.rand() < .3)) { cast(c, 1, a.x, a.y); return true; } }
      if (rdy(c, 2)) {
        let n = 0; for (const a of s.champs) if (a.alive && a.team === c.team && dist(a, c) < c.kit[2].r - 20 && (frac(a) < .55 || a.stunT > 0)) n++;
        if (n >= 1 && b.closest < 700 && (b.sk.iq > .3 || s.rand() < .5)) { cast(c, 2, c.x, c.y); return true; }
      }
      if (rdy(c, 0)) {
        let ally = null, low = .82;
        for (const a of s.champs) if (a !== c && a.alive && a.team === c.team && dist(a, c) < c.kit[0].range - 20 && frac(a) < low && losClear(s, c.x, c.y, a.x, a.y)) { low = frac(a); ally = a; }
        if (ally && !b.foes.some(e => segDist(e.x, e.y, c.x, c.y, ally.x, ally.y) < e.r + 30)) { const p = lead(s, c, b, ally, 1150); cast(c, 0, p.tx, p.ty); return true; }
        if (t && mode !== 'retreat' && d < c.kit[0].range - 20 && !lineBlocked(s, c, b, t.x, t.y, 46)) { const p = lead(s, c, b, t, 1150); cast(c, 0, p.tx, p.ty); return true; }
      }
      return false;
    },
    sable(s, c, b, t, d, mode) {
      if (!t) return false;
      if (rdy(c, 2) && d < c.kit[2].range - 10) {
        const exec = (125 * pow(c) + (t.maxHp - t.hp) * .35) * 100 / (100 + t.armor);
        if (b.sk.iq < .5 ? frac(t) < .45 : t.hp <= exec) { cast(c, 2, t.x, t.y); return true; }
      }
      if (c.recast[1] > 0) { if (mode === 'retreat' || frac(c) < .45 || d > 400) { cast(c, 1, c.x, c.y); return true; } }
      else if (rdy(c, 1)) {
        if (mode === 'retreat') { const a = awayPoint(s, c, t, c.kit[1].range); cast(c, 1, a.x, a.y); return true; }
        // Blink always travels full range, so this lands behind the target.
        if (mode === 'fight' && d > 130 && d < c.kit[1].range - 15) { cast(c, 1, t.x, t.y); return true; }
      }
      if (mode !== 'retreat' && rdy(c, 0) && d < c.kit[0].range - 15 && losClear(s, c.x, c.y, t.x, t.y)) { cast(c, 0, t.x, t.y); return true; }
      return false;
    },
    deadbolt(s, c, b, t, d, mode) {
      if (!t) return false;
      if (mode === 'fight' && rdy(c, 2) && d < c.kit[2].range - 40 && (ultWorth(s, c, b, t) || t.slowT > 0 || t.rootT > 0)) { cast(c, 2, t.x + t.vx * .4, t.y + t.vy * .4); return true; }
      if (mode === 'retreat') { if (rdy(c, 0) && d < c.kit[0].range) { const n = norm(t.x - c.x, t.y - c.y); cast(c, 0, c.x + n.x * 110, c.y + n.y * 110); return true; } return false; }
      if (rdy(c, 0) && d < c.kit[0].range - 10 && losClear(s, c.x, c.y, t.x, t.y) && (c.f.trapper || mode === 'fight' || b.ratio >= 1)) {
        // Lay it across their path, ahead of where they are walking.
        const sp = Math.hypot(t.vx, t.vy), n = norm(t.x - c.x, t.y - c.y), ahead = sp > 80 ? .55 : .25;
        const x = t.x + t.vx * ahead - n.x * 50, y = t.y + t.vy * ahead - n.y * 50;
        if (sp > 30 || d < c.kit[0].range * .8) { cast(c, 0, x, y); return true; }
      }
      if (rdy(c, 1) && d < c.kit[1].range - 20) {
        const clear = !lineBlocked(s, c, b, t.x, t.y, 36), bounceOff = c.kit[1].bounces > 0 && s.minions.some(m => m.alive && m.team !== c.team && dist(m, t) < 340 && segDist(m.x, m.y, c.x, c.y, t.x, t.y) < 60);
        if ((clear || bounceOff) && (mode === 'fight' || b.ratio >= 1)) { const p = lead(s, c, b, t, 1500); cast(c, 1, p.tx, p.ty); return true; }
      }
      return false;
    },
    duelist(s, c, b, t, d, mode) {
      if (c.recast[0] > 0 && t && d < c.kit[0].reach1 + 30) { cast(c, 0, c.x, c.y); return true; }
      if (!t) return false;
      if (rdy(c, 1) && (mode === 'retreat' && d < 350 || (b.parry && frac(c) < .6))) { const a = awayPoint(s, c, t, c.kit[1].range); cast(c, 1, a.x, a.y); return true; }
      if (mode !== 'fight') return false;
      if (rdy(c, 2) && d < c.kit[2].range + 20 && losClear(s, c.x, c.y, t.x, t.y) && (b.ratio >= 1 || (c.f.honorbound && b.ratio >= .9)) && ultWorth(s, c, b, t)) { cast(c, 2, t.x, t.y); return true; }
      // A decoy away, and strike from the dark.
      if (rdy(c, 1) && (c.f.masquerade || b.sk.iq > .5) && d > 140 && d < c.kit[1].range && (s.t < (b.feintUntil || 0) || b.ratio >= 1.2)) { b.feintUntil = s.t + 6; const a = awayPoint(s, c, t, c.kit[1].range * .85); cast(c, 1, a.x, a.y); return true; }
      if (c.stealthT > 0 && d < 130 && rdy(c, 0)) { cast(c, 0, c.x, c.y); return true; }
      if (rdy(c, 0) && d < c.kit[0].reach0 && losClear(s, c.x, c.y, t.x, t.y)) { cast(c, 0, c.x, c.y); return true; }
      return false;
    },
    hex(s, c, b, t, d, mode) {
      if (!t) return false;
      const A2 = c.kit[2], A1 = c.kit[1];
      if (rdy(c, 1) && d < A1.range - 30 && !lineBlocked(s, c, b, t.x, t.y, A1.w)) {
        // Polymorph first on whoever is diving, casting or fleeing; a sharper bot waits for it to matter.
        const rushing = d < 260 && b.ratio < 1.3, caster = t.chan || t.charge || t.dash;
        if (rushing || caster || (mode === 'fight' && (c.f.transmuter || frac(t) < .55) && b.sk.iq >= .3)) { const p = lead(s, c, b, t, 1250); cast(c, 1, p.tx, p.ty); return true; }
      }
      if (mode === 'fight' && rdy(c, 2) && d < A2.range + 80 && losClear(s, c.x, c.y, t.x, t.y)) {
        let near = 0, curses = t.curseN || 0; for (const e of b.foes) if (dist(e, t) < A2.r) { near++; curses += e.curseN || 0; }
        if (near >= 2 || curses >= 3 || ultWorth(s, c, b, t) || t.stunT > 0) { const p = lead(s, c, b, t, 0, A2.dur * .5); cast(c, 2, p.tx, p.ty); return true; }
      }
      if (rdy(c, 0) && d < c.kit[0].range - 30 && !lineBlocked(s, c, b, t.x, t.y, 40) && (mode !== 'retreat' || d < 400)) { const p = lead(s, c, b, t, 1100); cast(c, 0, p.tx, p.ty); return true; }
      return false;
    },
    plague(s, c, b, t, d, mode) {
      const A0 = c.kit[0], A1 = c.kit[1], A2 = c.kit[2];
      if (!t) return false;
      if (rdy(c, 2) && d < A2.range + 100 && losClear(s, c.x, c.y, t.x, t.y) && mode === 'fight') {
        let n = 0; for (const e of b.foes) if (dist(e, t) < A2.r * .9) n++;
        const healing = b.foes.some(e => e.champ === 'solenne') || s.champs.some(a => a.team !== c.team && a.alive && a.champ === 'plague');
        if (n >= 2 || (ultWorth(s, c, b, t) && (healing || frac(t) < .6))) { cast(c, 2, t.x, t.y); return true; }
      }
      if (rdy(c, 1) && d < A1.range + 30 && losClear(s, c.x, c.y, t.x, t.y)) {
        const al = c.f.bloodletter ? (frac(c) < .85 ? c : null) : lowestAlly(s, c, 640, true), needs = al ? frac(al) < .8 : false, offensive = mode === 'fight' || (mode === 'poke' && b.ratio >= 1);
        if (needs ? offensive || mode === 'poke' : (offensive && (b.sk.iq < .5 || frac(t) < .75))) { cast(c, 1, t.x, t.y); return true; }
      }
      if (rdy(c, 0) && d < A0.range + 30 && losClear(s, c.x, c.y, t.x, t.y) && (mode !== 'retreat' || d < 260)) {
        if (mode === 'retreat') { cast(c, 0, c.x, c.y); return true; }
        const p = lead(s, c, b, t, 0, .6); cast(c, 0, p.tx, p.ty); return true;
      }
      return false;
    },
    shiv(s, c, b, t, d, mode) {
      if (!t) return false;
      const A0 = c.kit[0];
      if (mode === 'retreat') {
        if (rdy(c, 1)) { cast(c, 1, c.x, c.y); return true; }
        if (rdy(c, 0) && d < 360 && c.rootT <= 0) { const a = awayPoint(s, c, t, A0.range); cast(c, 0, a.x, a.y); return true; }
        return false;
      }
      if (rdy(c, 2) && d < c.kit[2].range + 30) {
        const A = c.kit[2], burst = A.strikes * A.dmg * pow(c) * 100 / (100 + t.armor);
        if (t.hp <= burst * 1.1 || (mode === 'fight' && b.ratio >= 1 && ultWorth(s, c, b, t))) { cast(c, 2, t.x, t.y); return true; }
      }
      // In the dark: walk in and let the basic attack do the crit. A sharper bot holds its Shank for after.
      if (c.stealthT > 0) return false;
      if (mode === 'fight' && rdy(c, 1) && d > 240 && d < 700 && b.sk.iq > .3 && (b.ratio >= 1 || c.f.nightblade)) { cast(c, 1, c.x, c.y); return true; }
      if (rdy(c, 0) && d < A0.range + 40 && c.rootT <= 0 && losClear(s, c.x, c.y, t.x, t.y) && (mode === 'fight' || (mode === 'poke' && d < 190 && b.ratio >= 1))) { const n = norm(t.x - c.x, t.y - c.y); cast(c, 0, t.x + n.x * 60, t.y + n.y * 60); return true; }
      return false;
    },
    ironjaw(s, c, b, t, d, mode) {
      if (!t) return false;
      const A1 = c.kit[1];
      if (rdy(c, 1) && d < A1.range + 30 && losClear(s, c.x, c.y, t.x, t.y) && (mode !== 'poke' || b.ratio >= 1)) { cast(c, 1, t.x, t.y); return true; }
      if (mode === 'retreat') { if (rdy(c, 0) && d < 230) { cast(c, 0, c.x, c.y); return true; } return false; }
      if (rdy(c, 0) && d < c.kit[0].orbit + 80 && (mode === 'fight' || b.ratio >= 1)) { cast(c, 0, c.x, c.y); return true; }
      if (mode === 'fight' && rdy(c, 2) && d < c.kit[2].range - 40 && b.ratio >= .9 && losClear(s, c.x, c.y, t.x, t.y)) {
        const n = norm(t.x - c.x, t.y - c.y); let line = 0;
        for (const e of b.foes) if (segDist(e.x, e.y, c.x, c.y, c.x + n.x * c.kit[2].range, c.y + n.y * c.kit[2].range) < 90) line++;
        if (line >= 2 || ultWorth(s, c, b, t) || t.stunT > 0) { const p = lead(s, c, b, t, 0, c.kit[2].delay); cast(c, 2, p.tx, p.ty); return true; }
      }
      return false;
    },
    gravel(s, c, b, t, d, mode) {
      if (!t) return false;
      if (rdy(c, 1) && d < c.kit[1].r + 5) { cast(c, 1, c.x, c.y); return true; }
      if (mode === 'retreat') return false;
      if (c.f.warden && rdy(c, 0)) { for (const a of s.champs) if (a !== c && a.alive && a.team === c.team && frac(a) < .4 && dist(a, c) > 170 && dist(a, c) < c.kit[0].range - 40 && losClear(s, c.x, c.y, a.x, a.y) && b.foes.some(e => dist(e, a) < 360) && (b.sk.iq > .35 || s.rand() < .3)) { cast(c, 0, a.x, a.y); return true; } }
      if (rdy(c, 0) && d > 130 && d < c.kit[0].range - 30 && !lineBlocked(s, c, b, t.x, t.y, 50) && (mode === 'fight' || b.ratio >= 1)) { const p = lead(s, c, b, t, 1050); cast(c, 0, p.tx, p.ty); return true; }
      if (mode === 'fight' && rdy(c, 2) && d < c.kit[2].range - 40 && b.ratio >= .9 && losClear(s, c.x, c.y, t.x, t.y) && ultWorth(s, c, b, t)) { const p = lead(s, c, b, t, 1000); cast(c, 2, p.tx, p.ty); return true; }
      return false;
    },
    voltaic(s, c, b, t, d, mode) {
      if (!t) return false;
      const A0 = c.kit[0], A2 = c.kit[2];
      if (mode === 'retreat') { if (rdy(c, 0) && c.rootT <= 0) { const a = awayPoint(s, c, t, A0.range); cast(c, 0, a.x, a.y); return true; } return false; }
      if (mode === 'fight' && rdy(c, 2) && d < A2.range - 40 && losClear(s, c.x, c.y, t.x, t.y) && (ultWorth(s, c, b, t) || t.stunT > 0)) { const p = lead(s, c, b, t, 1900, A2.delay); cast(c, 2, p.tx, p.ty); return true; }
      if (mode === 'fight' && rdy(c, 1) && d < 280) { cast(c, 1, c.x, c.y); return true; }
      if (rdy(c, 0) && d < A0.range + 20 && c.rootT <= 0 && losClear(s, c.x, c.y, t.x, t.y) && (mode === 'fight' || b.ratio >= 1)) { const n = norm(t.x - c.x, t.y - c.y); cast(c, 0, t.x + n.x * 60, t.y + n.y * 60); return true; }
      return false;
    },
    tidecaller(s, c, b, t, d, mode) {
      const A0 = c.kit[0], A1 = c.kit[1], A2 = c.kit[2];
      if (rdy(c, 1)) { const a = threatenedAlly(s, c, b); if (a && dist(a, c) < A1.range && (b.sk.iq > .4 || s.rand() < .3)) { cast(c, 1, a.x, a.y); return true; } }
      if (rdy(c, 2)) { let n = 0; for (const a of s.champs) if (a.alive && a.team === c.team && dist(a, c) < 420 && frac(a) < .6) n++; if ((n >= 1 && b.closest < 620) || (t && mode === 'fight' && ultWorth(s, c, b, t) && d < A2.range - 80)) { const x = t || c; cast(c, 2, x.x, x.y); return true; } }
      if (rdy(c, 0)) { let ally = null, low = .85; for (const a of s.champs) if (a !== c && a.alive && a.team === c.team && dist(a, c) < A0.range - 20 && frac(a) < low && losClear(s, c.x, c.y, a.x, a.y)) { low = frac(a); ally = a; } if (ally) { const p = lead(s, c, b, ally, 1050); cast(c, 0, p.tx, p.ty); return true; } if (t && mode !== 'retreat' && d < A0.range - 20 && losClear(s, c.x, c.y, t.x, t.y)) { const p = lead(s, c, b, t, 1050); cast(c, 0, p.tx, p.ty); return true; } }
      if (t && rdy(c, 1) && d < A1.range && losClear(s, c.x, c.y, t.x, t.y) && (mode === 'fight' || (mode === 'retreat' && d < 260))) { cast(c, 1, t.x, t.y); return true; }
      return false;
    },
    paragon(s, c, b, t, d, mode) {
      if (!t) return false;
      const A0 = c.kit[0], A1 = c.kit[1], A2 = c.kit[2];
      if (mode === 'retreat') { if (rdy(c, 0)) { const a = awayPoint(s, c, t, A0.range); cast(c, 0, a.x, a.y); return true; } return false; }
      if (mode === 'fight' && rdy(c, 2) && d < A2.range - 60 && b.ratio >= .9 && (ultWorth(s, c, b, t) || t.stunT > 0)) { const p = lead(s, c, b, t, 0, 1.05); cast(c, 2, p.tx, p.ty); return true; }
      if (mode === 'fight' && rdy(c, 0) && d > 150 && d < A0.range + 30) { const p = lead(s, c, b, t, 0, .4); cast(c, 0, p.tx, p.ty); return true; }
      if (rdy(c, 1) && d < A1.range && losClear(s, c.x, c.y, t.x, t.y) && (mode === 'fight' || b.ratio >= 1)) { cast(c, 1, t.x, t.y); return true; }
      return false;
    },
    mirage(s, c, b, t, d, mode) {
      if (!t) return false;
      const A0 = c.kit[0], A1 = c.kit[1], A2 = c.kit[2];
      if (rdy(c, 1) && (mode === 'retreat' || d < 200)) { const a = awayPoint(s, c, t, A1.range); cast(c, 1, a.x, a.y); return true; }
      if (mode === 'fight' && rdy(c, 2) && d < A2.range - 30 && losClear(s, c.x, c.y, t.x, t.y) && (ultWorth(s, c, b, t) || t.slowT > 0 || t.stunT > 0)) { cast(c, 2, t.x + t.vx * .3, t.y + t.vy * .3); return true; }
      if (mode !== 'retreat' && rdy(c, 0) && d < A0.range - 20 && !lineBlocked(s, c, b, t.x, t.y, 34)) { const p = lead(s, c, b, t, 1500); cast(c, 0, p.tx, p.ty); return true; }
      return false;
    },
    cinder(s, c, b, t, d, mode) {
      if (!t) return false;
      const A0 = c.kit[0], A1 = c.kit[1], A2 = c.kit[2];
      if (mode === 'retreat') { if (rdy(c, 1) && d < 340) { cast(c, 1, c.x, c.y); return true; } return false; }
      if (mode === 'fight' && rdy(c, 2) && d < A2.range + 60 && losClear(s, c.x, c.y, t.x, t.y)) { let near = 0; for (const e of b.foes) if (dist(e, t) < A2.r) near++; if (near >= 2 || ultWorth(s, c, b, t) || t.stunT > 0 || t.rootT > 0) { const p = lead(s, c, b, t, 0, A2.delay); cast(c, 2, p.tx, p.ty); return true; } }
      if (rdy(c, 0) && d < A0.range - 30 && !lineBlocked(s, c, b, t.x, t.y, 40)) { const p = lead(s, c, b, t, 1150); cast(c, 0, p.tx, p.ty); return true; }
      if (rdy(c, 1) && d < A1.range + 40 && losClear(s, c.x, c.y, t.x, t.y) && (mode === 'fight' || b.ratio >= 1)) { const p = lead(s, c, b, t, 0, .5); cast(c, 1, p.tx, p.ty); return true; }
      return false;
    },
    ravager(s, c, b, t, d, mode) {
      if (!t) return false;
      const A0 = c.kit[0], A1 = c.kit[1];
      if (mode === 'retreat') { if (rdy(c, 1)) { const a = awayPoint(s, c, t, A1.range); cast(c, 1, a.x, a.y); return true; } return false; }
      if (mode === 'fight' && rdy(c, 2) && d < 320 && (b.ratio >= 1 || ultWorth(s, c, b, t))) { cast(c, 2, c.x, c.y); return true; }
      if (mode === 'fight' && rdy(c, 1) && d > 150 && d < A1.range + 30) { cast(c, 1, t.x, t.y); return true; }
      if (rdy(c, 0) && d < A0.range && losClear(s, c.x, c.y, t.x, t.y) && (mode === 'fight' || b.ratio >= 1)) { cast(c, 0, t.x, t.y); return true; }
      return false;
    },
    cataclysm(s, c, b, t, d, mode) {
      if (!t) return false;
      const A0 = c.kit[0], A2 = c.kit[2];
      if (rdy(c, 1) && b.closest < 260 && (mode === 'retreat' || mode === 'fight')) { cast(c, 1, c.x, c.y); return true; }
      if (mode === 'retreat') return false;
      if (mode === 'fight' && rdy(c, 2) && d < A2.range - 40 && b.ratio >= .9 && losClear(s, c.x, c.y, t.x, t.y)) { const n = norm(t.x - c.x, t.y - c.y); let line = 0; for (const e of b.foes) if (segDist(e.x, e.y, c.x, c.y, c.x + n.x * A2.range, c.y + n.y * A2.range) < 95) line++; if (line >= 2 || ultWorth(s, c, b, t) || t.stunT > 0) { const p = lead(s, c, b, t, 0, A2.delay); cast(c, 2, p.tx, p.ty); return true; } }
      if (rdy(c, 0) && d < A0.range && losClear(s, c.x, c.y, t.x, t.y) && (mode === 'fight' || b.ratio >= 1)) { const p = lead(s, c, b, t, 0, A0.delay); cast(c, 0, p.tx, p.ty); return true; }
      return false;
    },
    puppeteer(s, c, b, t, d, mode) {
      if (!t) return false;
      const A0 = c.kit[0], A1 = c.kit[1], A2 = c.kit[2];
      if (rdy(c, 2) && d < A2.range + 20 && losClear(s, c.x, c.y, t.x, t.y) && (mode === 'retreat' ? d < 300 : mode === 'fight' && (ultWorth(s, c, b, t) || frac(t) < .55))) { cast(c, 2, t.x, t.y); return true; }
      if (rdy(c, 0) && d < A0.range - 20 && !lineBlocked(s, c, b, t.x, t.y, 40) && (mode !== 'poke' || b.ratio >= 1)) { const p = lead(s, c, b, t, 1250); cast(c, 0, p.tx, p.ty); return true; }
      if (rdy(c, 1) && d < A1.range + 180 && mode !== 'retreat') { const n = norm(t.x - c.x, t.y - c.y), l = Math.min(A1.range - 20, Math.max(60, d - 120)); cast(c, 1, c.x + n.x * l, c.y + n.y * l); return true; }
      return false;
    },
  };
  function useCombo(s, c, b, t, mode) {
    if (c.charge || c.chan || (s.t < b.castAt && !b.parry && !(c.recast[0] > 0 || c.recast[1] > 0))) return;
    if (COMBO[c.champ](s, c, b, t, t ? dist(c, t) : 1e9, mode)) b.castAt = s.t + b.sk.gap * (.7 + s.rand() * .6);
  }
  const PVE = { vesper: [0], kade: [0], ione: [1, 0], solenne: [], sable: [0], gravel: [1], deadbolt: [1], duelist: [0], hex: [0], plague: [0], shiv: [0], ironjaw: [0, 1], voltaic: [0], tidecaller: [], paragon: [1], mirage: [0], cinder: [0, 1], ravager: [0], cataclysm: [0], puppeteer: [1] };
  function castPve(s, c, b, m, d) {
    if (c.charge || c.chan || s.t < b.castAt) return;
    for (const i of PVE[c.champ]) {
      const a = c.kit[i]; if (!rdy(c, i) || (a.range ? d > a.range - 30 : d > (a.r || 200))) continue;
      cast(c, i, m.x, m.y); b.castAt = s.t + b.sk.gap + .4; return;
    }
  }

  function handleCharge(s, c, b, t, d) {
    const A = c.kit[c.charge.slot];
    if (!t || d > A.range + 30) { c.q.push({ t: 'cancel' }); return; }
    const p = lead(s, c, b, t, 1600); c.q.push({ t: 'aim', tx: p.tx, ty: p.ty });
    const ct = c.charge.t, reach = A.minRange + (A.range - A.minRange) * clamp(ct / A.charge, 0, 1), hurry = b.closest < 300 || b.low;
    if ((ct >= b.chargeHold || hurry) && reach >= d - 20 && losClear(s, c.x, c.y, p.tx, p.ty)) cast(c, c.charge.slot, p.tx, p.ty);
    else if (ct >= A.charge * 1.5) c.q.push({ t: 'cancel' });
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
      if (along < -30 || along > 520) continue;
      const side = rx * -ny + ry * nx;
      if (Math.abs(side) < p.w / 2 + c.r + 18) { const sg = side >= 0 ? 1 : -1; note(along / sp, -ny * sg, nx * sg, p.id); }
    }
    for (const z of s.zones) {
      if (z.team === c.team || z.total - z.t < sk.react * .6) continue;
      if (z.kind === 'blast') { if (Math.hypot(c.x - z.x, c.y - z.y) < z.r + c.r + 12) { const n = norm(c.x - z.x, c.y - z.y); note(z.t, n.x, n.y, z.id); } }
      else if (z.kind === 'fissure') { if (segDist(c.x, c.y, z.x1, z.y1, z.x2, z.y2) < z.r + c.r + 14) { const n = norm(z.x2 - z.x1, z.y2 - z.y1); let x = -n.y, y = n.x; if (x * (c.x - z.x1) + y * (c.y - z.y1) < 0) { x = -x; y = -y; } note(z.t, x, y, z.id); } }
      else if (z.kind === 'coven' || z.kind === 'lockdown' || z.kind === 'miasma' || z.kind === 'quarantine') {
        if (Math.hypot(c.x - z.x, c.y - z.y) < z.r + c.r - 10 && (z.kind !== 'miasma' || !b.fighting || sk.iq > .7)) { const n = norm(c.x - z.x, c.y - z.y); note(z.t, n.x * (n.l < 1 ? 1 : 1), n.y, z.id + (s.t | 0) * 100000); }
      }
    }
    for (const e of b.foes) {
      const ch = e.chan;
      if (ch && ch.kind === 'line' && ch.total - ch.t >= sk.react * .5) {
        const sd = segDist(c.x, c.y, e.x, e.y, e.x + ch.dx * ch.len, e.y + ch.dy * ch.len);
        if (sd < ch.w / 2 + c.r + 16) { let x = -ch.dy, y = ch.dx; if (x * (c.x - e.x) + y * (c.y - e.y) < 0) { x = -x; y = -y; } note(ch.t, x, y, e.id * 7 + (s.t | 0)); }
      }
      if (e.charge && e.charge.t > .7 && sk.iq > .6 && dist(c, e) < 640) {
        const sd = segDist(c.x, c.y, e.x, e.y, e.x + e.charge.dx * 640, e.y + e.charge.dy * 640);
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
      if (e.bounty > 0) v += sk.iq * Math.min(.5, e.bounty / 1200); // a shutdown pays
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
    if (lh && dist(c, lh) - lh.r <= c.range) { c.atk = true; c.atkMode = 'minion'; c.atkPref = lh.id; }
    else if (lh && !carry && !underTw && !towerOver(s, c.team, lh.x, lh.y, 10)) dest = { x: lh.x, y: lh.y, a: c.range + lh.r - 30 };
    else if (siege && dist(c, t) - t.r < c.range + 200) {
      if (dist(c, t) - t.r <= c.range - 4) { c.atk = true; c.atkMode = 'tower'; c.atkPref = t.id; c.preferTower = true; }
      else dest = { x: t.x, y: t.y, a: c.range + t.r - 24 };
    } else if (shove) {
      // Hit the wave, but never a champion from inside tower range: that brings the tower down on us.
      let near = null, nd = c.range + 15;
      for (const m of s.minions) if (m.alive && m.team !== c.team && m.delay <= 0) { const d = dist(c, m) - m.r; if (d < nd) { nd = d; near = m; } }
      if (near) { c.atk = true; c.atkMode = 'minion'; c.atkPref = near.id; } else if (!underTw) c.atk = true;
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
      if (dist(e, c) > 2100 || towerOver(s, c.team, e.x, e.y)) continue;
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
      let soon = b.route[0], st = soon.at;
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
    const boss = s.monsters.find(m => m.bossKind === ai.hoard.kind && m.alive);
    if (!boss) { moveTo(b, ai.hoard.x, ai.hoard.y, 90); return true; } // gather a little before it spawns
    const d = dist(c, boss);
    if (!ai.hoardGo && d > 900) { moveTo(b, ai.hoard.x, ai.hoard.y, 90); return true; }
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
    c.atk = false; c.atkPref = 0; c.atkMode = 'champ'; c.preferTower = false; b.still = false; b.diveOk = false;
    if (s.t >= b.noiseAt) { b.noise = (s.rand() - .5) * 2; b.noiseAt = s.t + 3 + s.rand() * 3; b.strafe = -b.strafe; }

    const foes = b.foes; foes.length = 0; b.closest = 1e9;
    for (const e of s.champs) if (e.team !== c.team && e.alive && !e.air && canSee(s, c.team, e)) { foes.push(e); b.closest = Math.min(b.closest, dist(e, c)); }
    b.et = towerOver(s, c.team, c.x, c.y, 240); b.etTanks = b.et ? alliesTanking(s, c.team, b.et) : 0;
    senseThreats(s, c, b);
    const t = pickTarget(s, c, b, ai), d = t ? dist(c, t) : 1e9; b.tid = t ? t.id : 0;
    if (c.charge) handleCharge(s, c, b, t, d);
    botConsumables(s, c, b, ai, t, d);
    if (c.stunT > 0) { noMove(b); return; }

    if (homeD < 360) { b.lastHome = s.t; if (f > .92) b.low = false; }
    // Forge the moment it's affordable: anyone can press the button from anywhere.
    const nb = nextBuy(s, c), keep = s.t > 720 && sk.iq > .35 ? buybackCost(s, c) * (.5 + .5 * sk.macro) : 0; if (nb && c.gold >= nb.cost + keep) c.q.push({ t: 'buy', id: nb.id });
    botSpend(s, c, b, ai, nb);
    if (c.lvl >= 4 && c.evolved[0] < 0) c.q.push({ t: 'evolve', tier: 0, choice: botEvolve(c, 0) });
    if (c.lvl >= 8 && c.evolved[1] < 0) c.q.push({ t: 'evolve', tier: 1, choice: botEvolve(c, 1) });
    botBeacon(s, c, b, ai);
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
    // A side that is behind picks its fights instead of walking into them one at a time.
    if (s.catchup[c.team] > .25) b.ratio *= 1 - .2 * s.catchup[c.team] * (.4 + .6 * sk.macro);
    if (b.deaths.length > 6) b.deaths.splice(0, b.deaths.length - 6);

    // Too hurt to stay: recall if it is quiet, walk home if it is not.
    if (f < sk.low || (f < sk.low + .15 && b.closest < 600 && b.ratio < .9)) b.low = true;
    if (b.low) {
      b.task = 'low';
      if (homeD < 360) { c.atk = !towerOver(s, c.team, c.x, c.y, 0); noMove(b); return; }
      const hitLately = s.t - (b.hurtAt || -9) < 2.2 || s.monsters.some(m => m.alive && m.tgt === c);
      const quiet = b.closest >= 700 && homeD > 1050 && !hitLately && memThreat(s, c, b, ai, c.x, c.y, 650) < .5 + (1 - sk.iq);
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
      const group = ai.push !== null || (ai.hoard && ai.hoard.ids.includes(c.id));
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

    // Answer pings from the side.
    const pg = pingTask(s, c, b, ai);
    if (pg === 'retreat' && homeD > 700 && !t) { moveTo(b, home.x, home.y, 80); b.task = 'pinged'; c.atk = true; useCombo(s, c, b, null, 'poke'); return; }
    if (pg && pg.x !== undefined) { b.task = 'pinged'; moveTo(b, pg.x, pg.y, 110); c.atk = true; if (t) useCombo(s, c, b, t, 'poke'); return; }
    // An enemy beacon in reach is worth a few swings.
    if (b.sk.iq > .3 && !b.low) for (const x of s.beacons) if (x.alive && x.team !== c.team && canSee(s, c.team, x) && dist(c, x) < c.range + 220 && (!t || d > 560)) { moveTo(b, x.x, x.y, c.range * .6); c.atk = true; c.atkPref = x.id; c.atkMode = 'champ'; b.task = 'beacon'; return; }
    // Team plan first, then the role's normal job.
    if (called) { b.task = 'defend'; moveTo(b, ai.defend.x, ai.defend.y, 60); c.atk = true; }
    else if (ai.help[c.id] && ai.help[c.id].alive && heeds(ai.help[c.id].id + (s.t / 12 | 0))) { b.task = 'help'; const a = ai.help[c.id]; moveTo(b, a.x, a.y, 130); c.atk = true; }
    else if (ai.cover[c.id] !== undefined) { b.task = 'cover'; laneTask(s, c, b, ai.cover[c.id], ai, false); }
    else if (ai.ev && ai.ev[c.id] && s.event && heeds(99 + (s.t / 12 | 0))) { b.task = 'event'; const E = s.event; moveTo(b, E.x, E.y, E.r * .55); c.atk = true; }
    else if (ai.hoard && ai.hoard.ids.includes(c.id) && (hash01(1 + (s.t / 25 | 0), c.id + 7) < .65 + .35 * sk.macro) && hoardTask(s, c, b, ai)) { b.task = 'boss'; }
    else if (ai.sites[c.id] && ai.sites[c.id].alive && heeds(ai.sites[c.id].id + 41 + (s.t / 25 | 0))) { b.task = 'site'; const z = ai.sites[c.id]; moveTo(b, z.x, z.y, 70); c.atk = true; }
    else if (ai.split === c.id && ai.push !== null) { b.task = 'split'; laneTask(s, c, b, ai.push === 0 ? 1 : 0, ai, true); }
    else if (ai.push !== null) { b.task = 'push'; laneTask(s, c, b, ai.push, ai, true); }
    else if (c.role === 'jungle') jungleTask(s, c, b, ai);
    else { b.task = 'lane'; laneTask(s, c, b, b.lane, ai, false); }

    // Poke with whatever is free when standing somewhere safe.
    const safeSpot = !towerOver(s, c.team, c.x, c.y) && b.ratio >= .7 && f > .4;
    if (t ? safeSpot && !(laning && s.t < b.tradeT) : c.champ === 'solenne' || c.champ === 'tidecaller') useCombo(s, c, b, t, 'poke');
  }

  // Build-aware evolve choice, tier 0 and tier 1. Bots can read their own build.
  const BOT_EVOLVE = {
    marksman: [0, 0], skirmisher: [1, 1], spotter: [1, 1], executioner: [0, 0],
    parrymaster: [1, 1], blitz: [0, 1], vanguard: [1, 0], breaker: [0, 1],
    constellation: [0, 1], meteor: [1, 0], comet: [0, 1], stellar: [0, 0],
    lifebringer: [0, 1], protector: [1, 0], sunlance: [0, 1], radiant: [1, 0],
    ghost: [0, 0], reaper: [1, 1], hunter: [0, 1], twin: [1, 0],
    anchor: [0, 0], juggernaut: [1, 1], warden: [0, 1], seismic: [1, 0],
    trapper: [0, 1], deadeyed: [1, 0], gunslinger: [1, 0], jailer: [0, 1],
    fencer: [1, 0], masquerade: [1, 1], honorbound: [0, 1], bladestorm: [0, 0],
    cursebinder: [0, 1], transmuter: [1, 0], ritualist: [1, 0], jinx: [1, 1],
    apothecary: [1, 0], pestilence: [0, 1], bloodletter: [1, 1], ward: [0, 0],
    cutthroat: [1, 0], nightblade: [0, 1], butcher: [1, 1], venomous: [0, 0],
    brawler: [1, 1], wrecker: [0, 1], bouncer: [1, 0], fortress: [0, 0],
    stormchaser: [0, 0], surge: [0, 1], conductor: [1, 1], thunderhead: [1, 1], wellspring: [0, 1], undertow: [1, 0], deluge: [0, 1], abyss: [1, 0],
    skyknight: [0, 1], sunstriker: [1, 0], titanwing: [0, 0], aegisborn: [1, 1], twinshot: [0, 1], shade: [1, 0], kaleidoscope: [1, 1], hollow: [1, 0],
    pyre: [0, 1], ashwalker: [1, 1], wildfire: [0, 0], firestorm: [0, 1], alpha: [1, 0], savage: [0, 0], packleader: [1, 0], hemorrhage: [0, 1],
    bastille: [1, 1], artillery: [0, 0], wreckingcrew: [0, 0], moonquake: [1, 0], marionettist: [0, 1], troupe: [1, 0], maestro: [0, 1], ventriloquist: [1, 0],
  };
  const botEvolve = (c, tier) => { const v = BOT_EVOLVE[c.build]; return v ? v[tier] : 0; };

  // Consumables as reactions: heal in a fight, shrug off a disable, spare gold becomes a war elixir.
  function botConsumables(s, c, b, ai, t, d) {
    const iq = b.sk.iq, f = frac(c), gold = c.gold, buy = id => c.q.push({ t: 'buy', id });
    if (iq > .35 && !(c.potT > 0) && f < .4 && s.t >= b.potAt && gold >= 220 && (b.potAt = s.t + 30 - 12 * iq, true) && (b.fighting || b.closest < 600 || s.t - (b.hurtAt || -9) < 2.5 || b.low) && dist(c, s.fountains[c.team]) > 700 && hash01(c.id, s.t | 0) < .35 + .6 * iq) { buy('potion'); return; }
    if (iq > .5 && (c.stunT > .5 || c.rootT > .5 || c.polyT > .4) && !(c.cleanseCd > 0) && gold >= 170 && b.closest < 700) { buy('cleanse'); return; }
    if (iq > .55 && !(c.elixT > 0) && !(c.tonicT > 0) && b.low && gold >= 120 && dist(c, s.fountains[c.team]) > 1300 && b.closest < 500) { buy('tonic'); return; }
  }
  // Gold beyond the next item: an elixir before an objective, reinforcements for a push, then the people bar.
  function botSpend(s, c, b, ai, nb) {
    if ((s.tick + c.id * 3) % 30 !== 0) return;
    const late = s.t > 720, keep = late ? buybackCost(s, c) * (.5 + .5 * b.sk.macro) : 0, spare = c.gold - keep - (nb && nb.cost < 700 ? nb.cost : 0) - 60;
    if (spare < 100 || hash01(c.id, s.t / 5 | 0) > .3 + .7 * b.sk.macro) return;
    const fightDue = ai.hoard && ai.hoard.ids.includes(c.id) || ai.push !== null || b.fighting;
    if (s.t > 480 && !(c.elixT > 0) && spare > 300 && fightDue) { c.q.push({ t: 'buy', id: 'elixir' }); return; }
    if (s.t > 420 && spare > reinforceCost(s, c) + 60 && s.t >= s.reinforceAt[c.team] && (ai.push !== null || s.t > 660)) {
      const left = [0, 1].map(l => s.towers.filter(t => t.alive && t.team !== c.team && t.lane === l).length), lane = s.oneLane ? 0 : ai.push !== null ? ai.push : (left[0] < left[1] ? 0 : left[1] < left[0] ? 1 : s.laneInfo[c.team][0].n > s.laneInfo[c.team][1].n ? 0 : 1);
      c.q.push({ t: 'reinforce', lane }); return;
    }
    const noBonus = c.team ? s.hope > 34 : s.hope < 66;
    if (s.t > 420 && noBonus && spare > fundCost(s, c.team) + 80 && !(c.fundCd > 0)) { c.q.push({ t: 'fund' }); return; }
    if (c.beacons === 0 && spare > 150 && (c.role === 'support' || c.role === 'jungle')) c.q.push({ t: 'buy', id: 'beaconkit' });
  }
  // Dead bots still shop and decide on buyback.
  function botDead(s, c, b) {
    if ((s.tick + c.id * 7) % 20 !== 0) return;
    const nb = nextBuy(s, c), keep = s.t > 720 && b.sk.iq > .35 ? buybackCost(s, c) : 0; if (nb && c.gold >= nb.cost + keep) c.q.push({ t: 'buy', id: nb.id });
    if (s.practice || c.buybackCd > 0 || c.respawn < 9) return;
    const cost = buybackCost(s, c); if (c.gold < cost) return;
    const core = s.towers.find(t => t.team === c.team && t.sub === 'core'), coreOpen = !core.alive ? false : towerOpen(s, core);
    let danger = 0; if (coreOpen) { for (const e of s.champs) if (e.team !== c.team && e.alive && dist(e, core) < 900) danger++; for (const m of s.minions) if (m.team !== c.team && m.alive && dist(m, core) < 500) danger += .35; }
    const late = s.t > 780, rich = c.gold > cost * 2.2;
    if ((danger >= 1.5 && hash01(c.id, s.t / 5 | 0) < .35 + .6 * b.sk.macro) || (late && (rich || c.respawn > 18) && hash01(c.id, s.t / 8 | 0) < .25 + .35 * b.sk.iq)) c.q.push({ t: 'buyback' });
  }

  // Beacons, by role: supports and junglers light the map; laners watch their own brush.
  function botBeacon(s, c, b, ai) {
    if (c.beacons <= 0 || s.t < 45 || b.closest < 500 || (s.tick + c.id) % 20 !== 0 || hash01(c.id, s.t / 25 | 0) > .25 + .7 * b.sk.macro) return;
    const keep = c.role === 'support' || c.role === 'jungle' ? 0 : 1;
    if (c.beacons <= keep && s.t < LATE_AT) return;
    const has = (x, y) => s.beacons.some(z => z.alive && z.team === c.team && Math.hypot(z.x - x, z.y - y) < 400);
    let best = null, bv = 0;
    const consider = (x, y, v) => { const d = Math.hypot(x - c.x, y - c.y); if (d > BEACON_RANGE + 30 || has(x, y)) return; if (v / (1 + d / 900) > bv) { bv = v / (1 + d / 900); best = { x, y }; } };
    for (const br of s.map.brush) consider(br.x, br.y, c.role === 'support' || c.role === 'jungle' ? 3 : (Math.abs(br.y - (b.lane ? H - 330 : 330)) < 500 ? 2 : .6));
    for (const B of s.bosses) if (!B.up && B.at - s.t < 40) { const n = norm(B.x - c.x, B.y - c.y); consider(B.x - n.x * 280, B.y - n.y * 280, B.kind === 'colossus' ? 4 : 2.5); }
    if (s.event && (s.event.phase === 'warn' || s.event.t > 8)) consider(s.event.x, s.event.y, 3);
    for (const z of s.sites) if (z.alive) consider(z.x, z.y, c.role === 'support' ? 2 : 1);
    if (best) c.q.push({ t: 'beacon', tx: best.x, ty: best.y });
  }
  // What an ally's ping asks of this bot right now: a point to go to, 'retreat', or nothing.
  function pingTask(s, c, b, ai) {
    if (!ai.pings.length) return null;
    let res = null;
    for (let i = ai.pings.length - 1; i >= 0; i--) {
      const p = ai.pings[i], age = s.t - p.t; if (age > 9 || p.by === c.id) continue;
      if (b.pinged === undefined) b.pinged = {};
      const heeds = hash01(c.id + p.by, Math.floor(p.t * 10)) < .4 + .6 * b.sk.macro; if (!heeds) continue;
      const d = Math.hypot(p.x - c.x, p.y - c.y), human = !s.champs.find(a => a.id === p.by).bot;
      if (p.kind === 'retreat' && d < 1100) return 'retreat';
      if (p.kind === 'danger' && d < 520) { const n = norm(c.x - p.x, c.y - p.y); return { x: c.x + n.x * 400, y: c.y + n.y * 400 }; }
      if ((p.kind === 'help' || p.kind === 'attack') && d < (human ? 2400 : 1600) && frac(c) > .45 && !b.low && (ai.phase !== 'lane' || human || c.role === 'jungle') && (d > 260 || p.kind === 'help')) {
        if (!b.pinged[p.t]) { b.pinged[p.t] = 1; if (hash01(c.id, p.t * 7) < .4) c.q.push({ t: 'ping', kind: 'omw', x: p.x, y: p.y }); }
        if (!res || age < res.age) res = { x: p.x, y: p.y, age };
      }
    }
    return res;
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

  // Compact network state. Concatenated into the Sim closure by build.py.
  // ---------- networking: compact state for host-authoritative play ----------
  // Fast state is binary and goes out unreliably about 20 times a second. Slow state is a
  // sparse delta of whole numbers on the reliable channel, so a lost packet can't desync it.
  const FX_CODE = ['snipe', 'snipeFull', 'deadeye', 'orb', 'ray', 'chain', 'bolt', 'mbolt', 'tower', 'rupture', 'crash', 'heal', 'stomp', 'dome', 'break', 'dash', 'parry', 'slash', 'tripwire', 'ricochet', 'lockdown', 'flourish', 'feint', 'salute', 'hexbolt', 'polymorph', 'coven', 'miasma', 'leech', 'quarantine', 'shank', 'vanish', 'cuts', 'wrecking', 'grab', 'demolish', 'smoke', 'blink', 'tether', 'orbit', 'decoy', 'ring', 'fissure', 'tripline', 'arcdash','overload','thunder','riptide','bubble','tsunami','skyward','solarfist','meteordrop','splitshot','phantom','mirrors','firebolt','scorch','inferno','ignite','maul','pounce','frenzy','bombard','entrench','earthbreak','thread','puppet','dance'];
  const ZONE_KINDS = ['blast', 'dome', 'tripline', 'lockdown', 'coven', 'miasma', 'quarantine', 'ring', 'tether', 'orbit', 'fissure', 'decoy', 'tidewave', 'mirrors', 'puppet'];
  const FX_NUM = {}; FX_CODE.forEach((f, i) => { FX_NUM[f] = i; });
  const POS = 12, SNAP_MAGIC = 0xF3, INTEREST = 280; // POS: 16 bits must span the 5184-wide map
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
  // Layout: header, the seat's own timers, then a body that depends only on the seat's team, so a host with 7 guests
  // encodes it twice a tick at most (pass the same `cache` object for all guests of a tick).
  function snapshot(s, seat = -1, ack = 0, cache) {
    wp = 0; w8(SNAP_MAGIC); w8((s.seed || 0) & 255); wb.setUint32(wp, s.tick, true); wp += 4; w16(ack); w8(seat + 1);
    let team = -1;
    if (seat >= 0) {
      const c = s.champs[seat]; team = c.team;
      for (let i = 0; i < 3; i++) w16(Math.max(0, c.cd[i]) * 100);
      for (let i = 0; i < 3; i++) w16(Math.max(0, c.recast[i]) * 100);
      w16(Math.max(0, c.atkCd) * 100); wByte((c.slowT > 0 ? c.slowA : 0) * 100); wByte((c.hasteT > 0 ? c.hasteA : 0) * 100);
    }
    const start = wp;
    if (cache && cache[team + 1]) { new Uint8Array(wb.buffer).set(cache[team + 1], wp); wp += cache[team + 1].length; }
    else { snapBody(s, team); if (cache) cache[team + 1] = new Uint8Array(wb.buffer.slice(start, wp)); }
    return wb.buffer.slice(0, wp);
  }
  // Units far outside a team's sight can't be drawn by that team's guests, so they aren't sent. The margin keeps edges from popping.
  function inInterest(s, team, u) {
    if (team < 0 || u.team === team || u.revealT > 0 || u.markT > 0) return true;
    for (const v of visionSources(s, team)) { const r = v.r + INTEREST, dx = v.x - u.x, dy = v.y - u.y; if (dx * dx + dy * dy < r * r) return true; }
    return false;
  }
  function snapBody(s, team) {
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
    const extraOf = m => (m.curseT > 0 ? Math.min(7, m.curseN || 0) : 0) | (m.poisonT > 0 ? 8 : 0) | (m.bleedT > 0 ? 16 : 0) | (m.polyT > 0 ? 32 : 0) | (m.knockT > 0 ? 64 : 0) | (m.heavy ? 128 : 0);
    const near = list => team < 0 ? list : list.filter(u => inInterest(s, team, u));
    wList(near(s.monsters), 60, m => { const ex = extraOf(m); wPos(m.x); wPos(m.y); w8(hp8(m)); w8((m.big ? 1 : 0) | (m.boss ? 2 : 0) | (m.stunT > 0 ? 4 : 0) | (m.slowT > 0 ? 8 : 0) | (m.markT > 0 ? 16 : 0) | (m.shellT > 0 ? 32 : 0) | (ex ? 128 : 0)); if (ex) w8(ex); });
    wList(near(s.minions), 240, m => { const ex = extraOf(m); wPos(m.x); wPos(m.y); w8(hp8(m)); w8((m.team ? 1 : 0) | (m.ranged ? 2 : 0) | (m.stunT > 0 ? 4 : 0) | (m.slowT > 0 ? 8 : 0) | (m.markT > 0 ? 16 : 0) | (m.delay > 0 ? 32 : 0) | (m.lane ? 64 : 0) | (ex ? 128 : 0)); if (ex) w8(ex); });
    wList(near(s.proj), 160, p => {
      wPos(p.x); wPos(p.y); w8(p.team | (p.homing ? 4 : 0) | (p.pierce ? 8 : 0)); w8(FX_NUM[p.fx] === undefined ? 255 : FX_NUM[p.fx]); wByte(p.w); wVar(p.owner.id);
      if (p.homing) wVar(p.target.id); else { wi16(p.vx / 8); wi16(p.vy / 8); }
    });
    wList(s.zones, 64, z => { const ext = (z.line ? 1 : 0) | (z.tgt ? 2 : 0); wPos(z.x); wPos(z.y); w16(z.r); wByte(z.t * 20); wByte(z.total * 20); w8(z.team | ZONE_KINDS.indexOf(z.kind) << 2); w8(FX_NUM[z.fx] === undefined ? 255 : FX_NUM[z.fx]); wVar(z.owner.id); w8(ext); if (z.line) { wPos(z.x1); wPos(z.y1); wPos(z.x2); wPos(z.y2); } if (z.tgt) wVar(z.tgt); });
    wList(s.beacons, 40, b => { wPos(b.x); wPos(b.y); w8(b.team | (b.hp << 2) | ((b.inBrush + 1) << 4)); wByte(b.t); });
    let mask = 0; s.sites.forEach((z, i) => { if (z.prog[0] > 0 || z.prog[1] > 0) mask |= 1 << i; });
    w8(mask); s.sites.forEach((z, i) => { if (mask & 1 << i) { wByte(z.prog[0] * 40); wByte(z.prog[1] * 40); } });
  }

  function decodeSnapshot(buf) {
    const d = new DataView(buf); let p = 0;
    const r8 = () => d.getUint8(p++), ri8 = () => d.getInt8(p++), r16 = () => { const v = d.getUint16(p, true); p += 2; return v; }, ri16 = () => { const v = d.getInt16(p, true); p += 2; return v; };
    const rPos = () => r16() / POS, rVar = () => { let v = 0, sh = 0, b; do { b = r8(); v |= (b & 127) << sh; sh += 7; } while (b & 128); return v >>> 0; };
    if (r8() !== SNAP_MAGIC) return null;
    const mid = r8(), tick = d.getUint32(p, true); p += 4;
    const ack = r16(), seat = r8() - 1;
    let own = null;
    if (seat >= 0) own = { cd: [r16() / 100, r16() / 100, r16() / 100], recast: [r16() / 100, r16() / 100, r16() / 100], atkCd: r16() / 100, slowA: r8() / 100, hasteA: r8() / 100 };
    const n = r8(), champs = [];
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
      (u, a) => { u.hp = a.hp; u.stunT = a.fl & 4 ? 1 : 0; u.slowT = a.fl & 8 ? 1 : 0; u.markT = a.fl & 16 ? 1 : 0; u.shellT = a.fl & 32 ? 1 : 0; unitExtra(u, a.ex); if (u.boss && !u.bossKind && s.bosses) { const b = s.bosses.find(x => x.id === u.id); if (b) u.bossKind = b.kind; } });
    sync(s.minions, A.min, B && B.min, rx.n, a => ({ id: a.id, kind: 'minion', team: a.fl & 1, ranged: !!(a.fl & 2), lane: a.fl & 64 ? 1 : 0, alive: true, maxHp: 255, r: a.fl & 2 ? 14 : 17, sight: 500, ms: 215, range: a.fl & 2 ? 300 : 95, fx: a.fl & 1 ? -1 : 1, fy: 0 }),
      (u, a) => { u.hp = a.hp; u.stunT = a.fl & 4 ? 1 : 0; u.slowT = a.fl & 8 ? 1 : 0; u.markT = a.fl & 16 ? 1 : 0; u.delay = a.fl & 32 ? 1 : 0; unitExtra(u, a.ex); u.heavy = !!(a.ex & 128); u.type = u.heavy ? 'heavy' : u.ranged ? 'ranged' : 'melee'; });
    sync(s.proj, A.proj, B && B.proj, rx.p, a => ({ id: a.id, team: a.fl & 3, homing: !!(a.fl & 4), pierce: !!(a.fl & 8), fx: FX_CODE[a.fx], w: a.w, age: 0, vx: a.vx, vy: a.vy, seen: s.t }),
      (u, a) => { u.age = s.t - u.seen; u.vx = a.vx; u.vy = a.vy; u.w = a.w; if (!u.owner || u.owner.id !== a.owner) u.owner = unitOf(s, a.owner) || ghostUnit(a.owner, a.x, a.y, a.fl & 3); if (u.homing && (!u.target || u.target.id !== a.target)) u.target = unitOf(s, a.target) || ghostUnit(a.target, a.x, a.y, 2); });
    sync(s.zones, A.zones, B && B.zones, rx.z, a => ({ id: a.id, x: a.x, y: a.y, kind: ZONE_KINDS[a.fl >> 2], fx: FX_CODE[a.fx], r: a.r, team: a.fl & 3, total: a.total, t: a.t, line: !!(a.ext & 1), tgt: a.tgt }),
      (u, a) => { u.t = Math.max(0, a.t - span * f * DT); u.total = a.total; u.r = a.r; if (a.ext & 1) { u.x1 = a.x1; u.y1 = a.y1; u.x2 = a.x2; u.y2 = a.y2; } if (!u.owner) u.owner = unitOf(s, a.owner) || ghostUnit(a.owner, a.x, a.y, a.fl & 3); });
    sync(s.beacons, A.beacons, null, rx.b, a => ({ id: a.id, kind: 'beacon', team: a.fl & 3, x: a.x, y: a.y, px: a.x, py: a.y, r: 16, maxHp: 3, alive: true, sight: 560, inBrush: (a.fl >> 4) - 1 }), (u, a) => { u.hp = (a.fl >> 2) & 3; u.t = a.t; });
    const ev = s.event; if (ev && ev.tx !== undefined) { ev.x += (ev.tx - ev.x) * .12; ev.y += (ev.ty - ev.y) * .12; }
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
  // Slow fields as flat values; a diff of two of these is the delta.
  // Numbers default to 0 so a field gameplay hasn't added yet stays harmless. Section 4 is JSON text per key, for the structured HUD state.
  const num = v => (typeof v === 'number' && isFinite(v) ? v : 0), ceil = v => Math.ceil(num(v)), round = v => Math.round(num(v));
  const JSON_KEYS = ['bosses', 'boons', 'event', 'votes'];
  const r2 = v => Math.round(num(v) * 100) / 100, r1 = v => Math.round(num(v) * 10) / 10;
  function jsonPart(s, key) {
    const v = s[key];
    if (key === 'bosses') return JSON.stringify((v || []).map(b => ({ kind: b.kind, name: b.name, x: round(b.x), y: round(b.y), r: b.r, at: r1(b.at), up: !!b.up, id: b.id || 0 })));
    if (key === 'boons') return JSON.stringify((v || []).map(o => { const out = {}; for (const k in o) if (o[k] > 0) out[k] = Math.ceil(o[k]); return out; }));
    if (key === 'event') return v ? JSON.stringify({ kind: v.kind, phase: v.phase, t: r1(v.t), total: r1(v.total), x: round(v.x), y: round(v.y), r: v.r, prog: (v.prog || [0, 0]).map(r2), hp: round(v.hp), i: v.i || 0, winner: v.winner === undefined ? -1 : v.winner }) : 'null';
    if (key === 'votes') return JSON.stringify((v || []).map(o => o ? { yes: o.yes, no: o.no, t: r1(o.t) } : null));
    return JSON.stringify(v === undefined ? null : v);
  }
  function slowFlat(s) {
    const fund = s.fund || [0, 0], rein = s.reinforceAt || [0, 0], fog = s.fog || [1, 1];
    return [
      [[Math.round(s.hope * 10), s.hopeTeam, s.kills[0], s.kills[1], Math.round(s.bossAt), s.bossUp ? 1 : 0, s.buff[0], s.buff[1], s.wave, s.over ? s.over.winner + 1 : 0, s.over ? Math.round(s.over.t * 10) : 0, s.over && s.over.surrender ? 1 : 0, round(s.eventAt), num(fund[0]), num(fund[1]), Math.ceil(num(rein[0])), Math.ceil(num(rein[1])), Math.round(num(fog[0]) * 100), Math.round(num(fog[1]) * 100)]],
      s.champs.map(c => [c.lvl, Math.round(c.xp), Math.floor(c.gold), Math.round(c.maxHp), Math.round(c.msBase), Math.ceil(c.respawn), itemCode(c.items[0]), itemCode(c.items[1]), itemCode(c.items[2]), itemCode(c.items[3]), itemCode(c.items[4]), c.evolved[0] + 1, c.evolved[1] + 1, c.beacons, Math.ceil(c.beaconT), c.streak, Math.round(c.armor), c.stats.kills, c.stats.deaths, c.stats.assists, c.stats.casts, c.stats.skillHits, c.stats.parries, Math.round(c.stats.dmg), c.as * 1000 | 0, round(c.bounty), ceil(c.buybackCd), ceil(c.potT), ceil(c.elixT), ceil(c.tonicT), ceil(c.sentT), ceil(c.wlT), round(c.stats.dealt), round(c.stats.taken), round(c.stats.healing), round(c.stats.gold), num(c.stats.towers), num(c.stats.objectives), num(c.stats.rescues), ...EXTRA_STATS.map(k => Math.round(c.stats[k] || 0))]),
      s.towers.map(t => [Math.ceil(t.hp), t.alive ? 1 : 0]),
      s.sites.map(z => [z.alive ? 1 : 0]),
      [JSON_KEYS.map(k => jsonPart(s, k))],
    ];
  }
  function slowDiff(prev, cur) {
    const out = [];
    cur.forEach((sec, a) => sec.forEach((row, b) => row.forEach((v, c) => { if (!prev || prev[a][b][c] !== v) out.push(a, b, c, v); })));
    return out;
  }
  const itemCode = id => (id && ITEM_BY[id] ? ITEM_BY[id].i + 1 : 0), setItem = i => (c, v) => { c.items[i] = v ? ITEMS[v - 1].id : null; c.dirtyKit = 1; };
  const G_FIELDS = [(s, v) => { s.hope = v / 10; }, (s, v) => { s.hopeTeam = v; }, (s, v) => { s.kills[0] = v; }, (s, v) => { s.kills[1] = v; }, (s, v) => { s.bossAt = v; }, (s, v) => { s.bossUp = !!v; }, (s, v) => { s.buff[0] = v; }, (s, v) => { s.buff[1] = v; }, (s, v) => { s.wave = v; }, (s, v) => { s.over = v ? Object.assign(s.over || { t: 0 }, { winner: v - 1 }) : null; }, (s, v) => { if (s.over) s.over.t = v / 10; }, (s, v) => { if (s.over) s.over.surrender = !!v; }, (s, v) => { s.eventAt = v; }, (s, v) => { (s.fund || (s.fund = [0, 0]))[0] = v; }, (s, v) => { (s.fund || (s.fund = [0, 0]))[1] = v; }, (s, v) => { (s.reinforceAt || (s.reinforceAt = [0, 0]))[0] = v; }, (s, v) => { (s.reinforceAt || (s.reinforceAt = [0, 0]))[1] = v; }, (s, v) => { (s.fog || (s.fog = [1, 1]))[0] = v / 100; }, (s, v) => { (s.fog || (s.fog = [1, 1]))[1] = v / 100; }];
  const stat = k => (c, v) => { c.stats[k] = v; }, plain = k => (c, v) => { c[k] = v; };
  const C_FIELDS = [plain('lvl'), plain('xp'), plain('gold'), plain('maxHp'), plain('msBase'), plain('respawn'), setItem(0), setItem(1), setItem(2), setItem(3), setItem(4), (c, v) => { c.evolved[0] = v - 1; c.dirtyKit = 1; }, (c, v) => { c.evolved[1] = v - 1; c.dirtyKit = 1; }, plain('beacons'), plain('beaconT'), plain('streak'), plain('armor'), stat('kills'), stat('deaths'), stat('assists'), stat('casts'), stat('skillHits'), stat('parries'), stat('dmg'), (c, v) => { c.as = v / 1000; }, plain('bounty'), plain('buybackCd'), plain('potT'), plain('elixT'), plain('tonicT'), plain('sentT'), plain('wlT'), stat('dealt'), stat('taken'), stat('healing'), stat('gold'), stat('towers'), stat('objectives'), stat('rescues'), ...EXTRA_STATS.map(stat)];
  function applySlow(s, d) {
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i], b = d[i + 1], c = d[i + 2], v = d[i + 3];
      try {
        if (a === 0) G_FIELDS[c](s, v);
        else if (a === 1) C_FIELDS[c](s.champs[b], v);
        else if (a === 2) { if (c === 0) s.towers[b].hp = v; else s.towers[b].alive = !!v; }
        else if (a === 3) s.sites[b].alive = !!v;
        else if (a === 4) {
          const key = JSON_KEYS[c], val = JSON.parse(v);
          if (key === 'event') {
            // Keep a moving event's drawn position smooth between these 5 Hz updates.
            const old = s.event;
            if (val && old && old.kind === val.kind) { val.tx = val.x; val.ty = val.y; val.x = old.x; val.y = old.y; }
            else if (val) { val.tx = val.x; val.ty = val.y; }
          }
          s[key] = val;
        }
      } catch (e) { if (typeof console !== 'undefined') console.error('slow', a, b, c, e); }
    }
    for (const c of s.champs) if (c.dirtyKit) { c.dirtyKit = 0; refreshChamp(c); }
  }

  // Events, as short arrays. Position fields are rounded; everything else is passed as is.
  const EV_KEYS = { strike: ['u', 'x', 'y'], hit: ['u', 'a', 'sk', 'crit', 'by'], heal: ['u', 'a'], die: ['u', 'kind', 'x', 'y', 'by'], gold: ['u', 'a'], boom: ['x', 'y', 'r', 'fx', 'x2', 'y2'], phit: ['x', 'y', 'fx'], blink: ['x', 'y'], parry: ['u'], cast: ['u', 'fx', 'dx', 'dy', 'slot', 'charge'], fire: ['u', 'fx', 'dx', 'dy'], root: ['u'], knock: ['u'], poly: ['u'], curse: ['u', 'n'], shield: ['u', 'a'], stealth: ['u', 'on'], ping: ['u', 'kind', 'x', 'y', 'team'], evolve: ['u', 'tier', 'choice'], buy: ['u', 'id'], sell: ['u', 'id'], beacon: ['u', 'x', 'y', 'team'], bhit: ['x', 'y', 'team'], level: ['u'], tower: ['team', 'sub'], bossup: ['kind'], boss: ['team', 'kind'], feed: ['a', 'b', 'multi', 'first', 'bounty'], spawn: ['u'], tshot: ['u', 't', 'n'], cancelled: ['u'], stun: ['u'], mark: ['u'], forge: ['u', 'track'], atk: ['u', 't'], matk: ['u'], civ: ['team', 'x', 'y', 'id', 'n'], hope: ['team', 'on'], recap: ['u', 'list', 'total'], mapevent: ['kind', 'phase', 'team', 'x', 'y'], fund: ['u', 'team', 'a'], reinforce: ['u', 'team', 'lane'], buyback: ['u'], surrender: ['team', 'phase', 'yes', 'no', 'need'], consume: ['u', 'id'], boon: ['team', 'kind', 'on'], hl: ['kind', 'u', 'x', 'y', 'n', 'v', 'b'] };
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
  // An ultimate is judged once its window closes: several champions caught, a kill, or a huge hit.
  function stepUlts(s) {
    for (const c of s.champs) if (c.ultW && s.t > c.ultW.t) {
      const w = c.ultW; c.ultW = null;
      if (w.ids.length >= 2 || w.kills || w.dmg >= 900) highlight(s, 'ult', c, c.x, c.y, w.ids.length, 25 * w.ids.length + 45 * w.kills + w.dmg / 45);
    }
  }
  // Raid: the Colossus calls extra waves as it weakens, at two thirds and one third health.
  function stepRaid(s) {
    const R = s.raid, B = s.bosses.find(b => b.kind === 'colossus'), m = B.up ? s.monsters.find(x => x.id === B.id && x.alive) : null; if (!m) return;
    const due = m.hp < m.maxHp / 3 ? 2 : m.hp < m.maxHp * 2 / 3 ? 1 : 0;
    if (due > R.surge) { R.surge = due; spawnWave(s, true); s.ev.push({ e: 'raid', phase: due }); }
  }
  function step(s) {
    if (s.over) return;
    if (s.practice) { s.eventAt = 1e9; s.bossAt = 1e9; for (const B of s.bosses) if (!B.up) B.at = 1e9; }
    s.t += DT; s.tick++;
    s.navLeft = 2;
    if (s.hope !== 50) setHope(s, s.hope + (50 - s.hope) * HOPE_DRIFT * DT); // public mood settles back toward even
    refreshLanes(s);
    if (s.tick % 15 === 0) teamThink(s, 0); else if (s.tick % 15 === 7) teamThink(s, 1);
    if (s.raid) stepRaid(s);
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
    stepBoons(s); stepEvent(s); stepFog(s); stepVotes(s); stepUlts(s);
    if (s.tick % 60 === 0) updateCatchup(s);
    s.minions = s.minions.filter(m => m.alive); s.monsters = s.monsters.filter(m => m.alive);
  }

  // Rebuilds what a guest derives from build, evolves and items, without touching health.
  function refreshChamp(c) { for (const k in c.f) delete c.f[k]; c.f[c.build] = 1; applyMods(c); const hp = c.hp, m = c.maxHp; applyStats(c, false); c.hp = hp; c.maxHp = m; }

  function masteryGain(st, won) {
    const acc = st.casts ? Math.min(1, st.skillHits / st.casts) : 0;
    return Math.round(st.skillHits * 6 * (.6 + acc) + st.parries * 25 + (st.kills + st.assists * .5) * 20 + (won ? 60 : 20));
  }
  // End of match scoring. Every input is rounded and comes from the synced slow state, so host and guests name the same MVP.
  const SCORE_WEIGHTS = {
    top: { kda: 26, dmg: 22, taken: 20, towers: 18, objectives: 8, healing: 0, rescues: 6 },
    jungle: { kda: 28, dmg: 16, taken: 10, towers: 8, objectives: 32, healing: 0, rescues: 6 },
    bottom: { kda: 30, dmg: 38, taken: 2, towers: 18, objectives: 6, healing: 0, rescues: 6 },
    support: { kda: 30, dmg: 8, taken: 12, towers: 4, objectives: 10, healing: 28, rescues: 8 },
  };
  function scoreMatch(s) {
    const raid = s.mode === 'raid', pick = c => { const t = c.stats, r = v => Math.round(v || 0); return { kda: (r(t.kills) * 2 + r(t.assists)) / (1 + r(t.deaths) * .5), dmg: r(raid ? t.dmg : t.dealt), taken: r(t.taken), towers: r(t.towers), objectives: r(t.objectives), healing: r(t.healing), rescues: r(t.rescues) }; };
    const rows = s.champs.map(c => ({ c, v: pick(c) })), best = {};
    for (const k of Object.keys(SCORE_WEIGHTS.top)) best[k] = Math.max(1, ...rows.map(r => r.v[k]));
    const list = rows.map(({ c, v }) => { const W2 = SCORE_WEIGHTS[c.role] || SCORE_WEIGHTS.top; let score = 0; for (const k in W2) score += W2[k] * v[k] / best[k]; return { id: c.id, champ: c.champ, name: c.pname, team: c.team, role: c.role, score: Math.round(score * 10) / 10, parts: v }; });
    const top = team => list.filter(r => r.team === team).sort((a, b) => b.score - a.score || b.parts.dmg - a.parts.dmg || a.id - b.id)[0] || null;
    const w = s.over ? s.over.winner : -1, mvp = raid ? top(s.champs.length ? s.champs[0].team : 0) : w < 0 ? null : top(w), svp = raid || w < 0 ? null : top(1 - w);
    return { list: list.sort((a, b) => b.score - a.score || a.id - b.id), mvp: mvp ? mvp.id : 0, svp: svp ? svp.id : 0 };
  }
  // What medalProgress needs from one champion's finished match.
  function matchStats(s, c) {
    const won = !!s.over && s.over.winner === c.team, t = c.stats, n = v => Math.round(v || 0);
    return { won, mode: s.mode || 'classic', practice: !!s.practice, full: s.t >= 360, t: Math.round(s.t), champ: c.champ, role: c.role, mastery: masteryGain(t, won), kills: n(t.kills), deaths: n(t.deaths), assists: n(t.assists), towers: n(t.towers), objectives: n(t.objectives), rescues: n(t.rescues), skillHits: n(t.skillHits), multi3: n(t.multi3), multi4: n(t.multi4), multi5: n(t.multi5), bestStreak: n(t.bestStreak), clutch: n(t.clutch), saves: n(t.saves), steals: n(t.steals), colossi: n(t.colossi), trailed: n(t.trailed) };
  }
  function tierOf(p) { let t = 0; TIERS.forEach((x, i) => { if (p >= x.at) t = i; }); return t; }

  return { MODES, normalizeTeams, MEDALS, MEDAL_CATS, MARK_BONUS, EXTRA_STATS, newCareer, medalValue, medalProgress, scoreMatch, matchStats, sensiblePool, MAX_LEVEL, PROFS, itemPaths, quickTarget, ITEM_SLOTS, CONSUMABLES, buybackCost, reinforceCost, fundCost, sellValue, BOSS_INFO, EVENT_INFO, BOON_INFO, SURRENDER_AT, BEACON_RANGE, ROSTER, ITEMS, ITEM_BY, itemPath, itemPrice, recommended, marksEarned, cdOf, defaultBuild, TOWER_RANGE, MAX_ATTACK_RANGE, refreshChamp, W, H, TICK, DT, KITS, buildMap, rayWall, visionSources, hasLOS, TIERS, TEAM_NAMES, FORGE_COST, createMatch, step, canSee, autoTarget, masteryGain, tierOf, towerOpen, xpNeed, ROLES, ROLE_INFO, autoRoles, CHARS, charOf,
    RANKS, rankOf, rankDelta, botSkills, skillProfile, setBot, snapshot, decodeSnapshot, applySnapshot, applyFrame, applyChampState, slowFlat, slowDiff, applySlow, packEvent, unpackEvent, predict };
})();
if (typeof module !== 'undefined') module.exports = Sim;
