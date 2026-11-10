// Bot audit: headless matches, measuring discipline, tower respect, feeding, farming, abilities, fights,
// objectives, pacing and the skill gradient. node test_bots.js [games] [mode]. Mode nav: node test_bots.js [games] nav [skill] [seconds] [mode] audits obstacles, jungler idle, districts and subway.
// mode: all (default), even, ladder, human, rank, balance, nav, v13 [skill] [classic|brawl|duel], levels,
//   v14 [skill] [mode] [seedBase] (idle, jitter, conversion, lengths, step cost), ladder14 [seedBase] [pairs] [mode] (adjacent Custom Match levels).
const Sim = require(process.env.SIMJS || './src/sim.js');
const N = +process.argv[2] || 12, MODE = process.argv[3] || 'all', LANE_SECS = 360;
const ids = Object.keys(Sim.KITS);
const laneD = (s, l, x, y) => {
  const L = s.map.lanes[l]; let b = 1e9;
  for (let i = 0; i + 1 < L.length; i++) {
    const dx = L[i + 1][0] - L[i][0], dy = L[i + 1][1] - L[i][1], l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - L[i][0]) * dx + (y - L[i][1]) * dy) / l2));
    b = Math.min(b, Math.hypot(x - L[i][0] - dx * t, y - L[i][1] - dy * t));
  }
  return b;
};
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const pct = (a, b) => b ? (a / b * 100).toFixed(1) + '%' : '-';
const avg = (a, b) => b ? (a / b).toFixed(2) : '-';
const ROLE_LANE = { top: 0, bottom: 1, support: 1 };

// Lane assignment for support-less edge cases is not needed: autoRoles always fills four distinct roles.
function roster(r, team) {
  const list = Sim.ROSTER[team].slice().sort(() => r() - .5).slice(0, 4), roles = Sim.autoRoles(list);
  return list.map((c, i) => ({ champ: c, role: roles[i], name: 'b' + i, tier: 0 }));
}

function play(cfg) {
  // cfg: seed, skill0, skill1 (number, or array of 4), humans: seat-spec for filling seats with a scripted "person"
  let sd = cfg.seed * 131 + 17, r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const sk = v => Array.isArray(v) ? i => v[i] : () => v;
  const a = roster(r, 0), b = roster(r, 1), sk0 = sk(cfg.skill0), sk1 = sk(cfg.skill1);
  if (cfg.human) { const seat = a.find(p => p.role === cfg.human); seat.human = true; }
  a.forEach((p, i) => { p.skill = sk0(i); }); b.forEach((p, i) => { p.skill = sk1(i); });
  const s = Sim.createMatch({ seed: cfg.seed + 200, teams: [a, b] });
  // The seat skill reaches the bot through createMatch once game.js passes it; set it here too so
  // these numbers are right whichever order the concurrent edits land in.
  for (const c of s.champs) if (c.bot && c.bot.setSkill) { const pl = (c.team ? b : a)[c.slot]; c.bot.setSkill(pl.skill); }
  if (cfg.humans) cfg.humans(s);
  const M = cfg.M; let tTotal = 0, tN = 0;
  const lastDeaths = new Map(), lastSeen = {};
  const firstBoss = { spawned: -1, killed: -1 }; let bossSpawn = -1; let bossFirstKill = -1;
  let fight = null;
  const returning = new Map();
  let lastTick = -1;
  while (!s.over && s.t < 2400) {
    const t0 = process.hrtime.bigint();
    Sim.step(s);
    tTotal += Number(process.hrtime.bigint() - t0); tN++;
    for (const e of s.ev) {
      if (e.e === 'die' && e.kind === 'champ') {
        const u = s.champs.find(c => c.id === e.u);
        const killer = s.champs.find(c => c.id === e.by) || s.towers.find(t => t.id === e.by) || s.monsters.find(m => m.id === e.by);
        const by = !killer ? 'none' : killer.kind === 'tower' ? 'tower' : killer.kind === 'monster' ? 'monster' : killer.kind === 'minion' ? 'minion' : 'champ';
        M.deathsBy[by] = (M.deathsBy[by] || 0) + 1; M.deaths++;
        const tw = s.towers.find(t => t.alive && t.team !== u.team && Math.hypot(t.x - u.x, t.y - u.y) < t.range + 20);
        if (tw) M.underTower++;
        const l = lastDeaths.get(e.u) || []; l.push(s.t);
        const keep = l.filter(x => s.t - x < 90); lastDeaths.set(e.u, keep);
        if (keep.length >= 3) { M.feed3in90++; lastDeaths.set(e.u, []); }
      }
      if (e.e === 'die' && e.kind === 'minion') {
        const by = s.champs.find(c => c.id === e.by);
        if (s.t < LANE_SECS) {
          // Attribute each minion death (enemy minions of a lane during laning) to that lane's denominators.
          const lane = (e.y < s.map.H / 2 || e.y < Sim.H / 2) ? 0 : 1;
          M.lhPossible[lane]++; if (by && by.team !== undefined) M.lhBy[lane][by.role] = (M.lhBy[lane][by.role] || 0) + 1;
        }
      }
      if (e.e === 'civ') M.capt++;
      if (e.e === 'boss') { M.bossN++; if (bossFirstKill < 0) bossFirstKill = s.t; if (bossSpawn >= 0) M.bossTimes.push(s.t - bossSpawn); bossSpawn = -1; M.bossBy[e.team]++; }
      if (e.e === 'bossup') { bossSpawn = s.t; if (firstBoss.spawned < 0) firstBoss.spawned = s.t; }
      if (e.e === 'tower') M.towers++;
      if (e.e === 'hit' && s.champs.find(c => c.id === e.by)) { const v = s.champs.find(c => c.id === e.u); if (v) M.champDmg[s.champs.find(c => c.id === e.by).team] += e.a || 0; }
    }
    s.ev.length = 0;
    if (s.tick % 15 === 0) {
      // Fights: 3v3 or better inside 500 units. Whoever gets more kills during it wins.
      const al = [0, 1].map(t => s.champs.filter(c => c.team === t && c.alive));
      let f0 = 0, f1 = 0; for (const x of al[0]) if (al[1].some(y => dist(x, y) < 500)) f0++; for (const x of al[1]) if (al[0].some(y => dist(x, y) < 500)) f1++;
      const fightNow = f0 >= 3 && f1 >= 3;
      // A fight spans gaps of up to 8 seconds; only fights where someone died are counted.
      if (fightNow && !fight) fight = { k0: s.kills[0], k1: s.kills[1], start: s.t, lastOn: s.t };
      if (fightNow) fight.lastOn = s.t;
      if (fight && s.t - fight.lastOn > 8) {
        const d0 = s.kills[0] - fight.k0, d1 = s.kills[1] - fight.k1;
        if (d0 || d1) { M.fights++; if (d0 > d1) M.fightWins[0]++; else if (d1 > d0) M.fightWins[1]++; M.fightLen += fight.lastOn - fight.start; }
        fight = null;
      }
      // Role adherence, sampled twice a second. Seconds in the fountain area are not laning time.
      for (const c of s.champs) {
        if (!c.bot || c.human) continue;
        if (cfg.humanTrack) cfg.humanTrack(s, c);
        const inLane = s.t >= 28 && s.t < LANE_SECS;
        if (inLane) {
          const R = M.role[c.role];
          R.t++;
          if (!c.alive) { R.dead++; continue; }
          const fd = dist(c, s.fountains[c.team]);
          if (fd < 340) { R.base++; returning.set(c.id, s.t); continue; }
          if (returning.has(c.id) && c.role !== 'jungle' && fd > 700) {
            const want = ROLE_LANE[c.role], there = laneD(s, want, c.x, c.y) < 300, other = laneD(s, want ^ 1, c.x, c.y) < 300;
            if (there) { M.returned++; M.returnSec += s.t - returning.get(c.id); returning.delete(c.id); }
            else if (other) { M.wrongReturn++; returning.delete(c.id); }
          }
          R.field++;
          const task = c.bot.task || '?';
          R.tasks[task] = (R.tasks[task] || 0) + 1;
          let inr;
          if (c.role === 'jungle') {
            const nearCamp = s.camps.some(k => dist(k, c) < 500);
            inr = nearCamp || task === 'gank' || task === 'jungle' || task === 'site' || task === 'help' || task === 'defend' || laneD(s, 0, c.x, c.y) > 320 && laneD(s, 1, c.x, c.y) > 320;
            if (task === 'jungle' && nearCamp) R.clear++;
          } else {
            inr = laneD(s, ROLE_LANE[c.role], c.x, c.y) < 280;
            if (c.role === 'support' && inr) { const carry = s.champs.find(a => a.team === c.team && a.role === 'bottom' && a.alive); if (carry && dist(carry, s.fountains[c.team]) > 700 && dist(carry, c) > 900) inr = false; }
            if (laneD(s, ROLE_LANE[c.role] ^ 1, c.x, c.y) < 320) R.wrong++;
          }
          if (inr) R.ok++;
          else { R.why[task] = (R.why[task] || 0) + 1; }
        }
      }
      if (s.t < LANE_SECS && s.t >= 28) {
        for (const tm of [0, 1]) {
          const top = s.champs.filter(c => c.team === tm && c.bot && c.alive && c.role !== 'jungle' && laneD(s, 0, c.x, c.y) < 300).length;
          const bot = s.champs.filter(c => c.team === tm && c.bot && c.alive && c.role !== 'jungle' && laneD(s, 1, c.x, c.y) < 300).length;
          M.laneSamples++; if ((top === 0 && bot >= 3) || (bot === 0 && top >= 2)) M.doubled++;
        }
      }
    }
    if (s.tick % 30 === 0) {
      for (const c of s.champs) {
        if (!c.alive) continue;
        M.alive++;
        if (c.bot) {
          const t = s.towers.find(t => t.alive && t.team !== c.team && dist(t, c) < t.range);
          if (t && !s.minions.some(m => m.alive && m.team === c.team && dist(m, t) < t.range - 20)) M.diveSecs++;
          const mv = Math.hypot(c.mv.x, c.mv.y);
          if (mv < .05 && !c.chan && c.stunT <= 0) M.idle++;
          M.gold += c.gold; M.goldN++;
        }
      }
    }
  }
  const ms = tTotal / 1e6 / tN;
  M.stepMs.push(ms);
  if (!s.over) { M.unfinished++; return s; }
  M.games++; M.secs += s.t; M.lens.push(s.t / 60); M.kills += s.kills[0] + s.kills[1];
  if (s.over.winner === 0) M.wins0++;
  if (cfg.track) cfg.track(s);
  for (const c of s.champs) { const k = c.champ; M.cast[k] = (M.cast[k] || 0) + c.stats.casts; M.hit[k] = (M.hit[k] || 0) + c.stats.skillHits; M.slot[k] = (M.slot[k] || 0) + 1; }
  if (firstBoss.spawned >= 0 && bossFirstKill >= 0) M.firstBossDelay.push(bossFirstKill - firstBoss.spawned);
  if (bossFirstKill >= 0) M.firstBossKill.push(bossFirstKill);
  return s;
}

function blank() {
  const role = () => ({ t: 0, dead: 0, base: 0, field: 0, ok: 0, wrong: 0, clear: 0, why: {}, tasks: {} });
  return { games: 0, unfinished: 0, secs: 0, lens: [], kills: 0, wins0: 0, role: { top: role(), jungle: role(), bottom: role(), support: role() }, deathsBy: {}, deaths: 0, underTower: 0, feed3in90: 0, lhPossible: [0, 0], lhBy: [{}, {}], capt: 0, bossN: 0, bossTimes: [], firstBossDelay: [], firstBossKill: [], bossBy: [0, 0], towers: 0, fights: 0, fightWins: [0, 0], fightLen: 0, champDmg: [0, 0], laneSamples: 0, doubled: 0, returned: 0, returnSec: 0, wrongReturn: 0, alive: 0, diveSecs: 0, idle: 0, gold: 0, goldN: 0, cast: {}, hit: {}, slot: {}, stepMs: [] };
}

function run(games, makeCfg) {
  const M = blank();
  for (let g = 0; g < games; g++) { const cfg = makeCfg(g); cfg.M = M; play(cfg); }
  return M;
}

function report(M, title) {
  const g = M.games || 1, mins = M.secs / 60;
  console.log(`\n=== ${title}: ${M.games} games${M.unfinished ? ' (' + M.unfinished + ' unfinished)' : ''}, avg length ${(mins / g).toFixed(1)}m (${M.lens.map(x => x.toFixed(1)).join(' ')})`);
  console.log(`kills/game ${(M.kills / g).toFixed(1)}, blue wins ${M.wins0}/${g}, deaths by ${JSON.stringify(M.deathsBy)}, under enemy tower ${pct(M.underTower, M.deaths)} of deaths, dive-secs/bot-min ${(M.diveSecs / mins / 8).toFixed(1)}`);
  console.log(`feeding (3 deaths in 90s) per game ${(M.feed3in90 / g).toFixed(1)}, idle ${pct(M.idle, M.alive)}, avg gold held ${(M.gold / (M.goldN || 1)).toFixed(0)}`);
  console.log(`objectives/game: sites ${(M.capt / g).toFixed(1)}, towers ${(M.towers / g).toFixed(1)}, Colossus ${(M.bossN / g).toFixed(2)} (first kill at avg ${avgArr(M.firstBossKill).toFixed(0)}s, first spawn-to-kill avg ${avgArr(M.firstBossDelay).toFixed(0)}s, each spawn-to-kill avg ${avgArr(M.bossTimes).toFixed(0)}s), team fights ${(M.fights / g).toFixed(1)} (won by team 0: ${M.fightWins[0]}, team 1: ${M.fightWins[1]}, draws ${M.fights - M.fightWins[0] - M.fightWins[1]}, avg fight ${M.fights ? (M.fightLen / M.fights).toFixed(1) : 0}s)`);
  const pc = M.lhPossible;
  console.log(`laning farm: last hits per role (share of the lane's minion deaths): top ${pct(M.lhBy[0].top || 0, pc[0])}, bottom ${pct(M.lhBy[1].bottom || 0, pc[1])}, support ${pct(M.lhBy[1].support || 0, pc[1])}`);
  console.log('role adherence, 0:28-6:00 of each game (share of alive, out-of-base seconds):');
  for (const r of ['top', 'jungle', 'bottom', 'support']) {
    const R = M.role[r];
    console.log(`  ${r.padEnd(8)} in role ${pct(R.ok, R.field)}  (of all sampled time: dead ${pct(R.dead, R.t)}, at base ${pct(R.base, R.t)}, in role ${pct(R.ok, R.t)}${r === 'jungle' ? ', clearing camps ' + pct(R.clear, R.t) : ', wrong lane ' + pct(R.wrong, R.t)})  off: ${Object.entries(R.why).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => k + ' ' + pct(v, R.field)).join(', ')}`);
  }
  if (M.role.jungle.field) console.log('  jungle time by task:', Object.entries(M.role.jungle.tasks).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + pct(v, M.role.jungle.field)).join(', '));
  console.log(`  lanes doubled while the other lane sits empty: ${pct(M.doubled, M.laneSamples)} of samples; laners returning from base: ${M.returned} reached their lane, avg ${avg(M.returnSec, M.returned)}s, ${M.wrongReturn} went to the wrong lane first`);
  console.log('ability hit rates:', Object.keys(M.cast).map(k => `${k} ${(M.cast[k] / (M.slot[k] * (mins / g))).toFixed(1)} casts/min (hit ${pct(M.hit[k], M.cast[k])})`).join(', '));
  console.log(`step cost: avg ${avgArr(M.stepMs).toFixed(3)} ms per 33.3 ms tick`);
}
function avgArr(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }

function versus(a, b, games, side = 0) {
  // Team skill a against team skill b, alternating which side holds which skill.
  const M = blank(); let wins = 0, played = 0, ka = 0, kb = 0, kills = 0, under = 0;
  for (let g = 0; g < games; g++) {
    const swap = g % 2, cfg = { seed: 5000 + g * 11 + Math.round(a * 91) + Math.round(b * 7), skill0: swap ? b : a, skill1: swap ? a : b, M, track(s) { played++; const teamA = swap ? 1 : 0; if (s.over.winner === teamA) wins++; ka += s.kills[teamA]; kb += s.kills[1 - teamA]; } };
    play(cfg);
  }
  return { wins, played, ka, kb, M };
}

// Balance sweep: mixed-skill bot matches with varied builds; per-kit, per-build, per-side win rates and pacing.
// node test_bots.js GAMES balance SEEDBASE
function balance(games, base) {
  const lens = [], kit = {}, bld = {}, side = [0, 0], slots = { k: 0, d: 0, n: 0, g: 0, stomp: 0 };
  for (const list of Sim.ROSTER) for (const c of list) { kit[c] = { w: 0, n: 0, k: 0, d: 0, a: 0, dmg: 0, g: 0 }; for (const b of Sim.KITS[c].builds) bld[b.id] = { w: 0, n: 0, kit: c }; }
  for (let g = 0; g < games; g++) {
    let sd = (base + g) * 7919 + 13, r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    const team = t => { const list = Sim.ROSTER[t].slice().sort(() => r() - .5).slice(0, 4), roles = Sim.autoRoles(list); return list.map((c, i) => ({ champ: c, role: roles[i], name: 'b', tier: 0, skill: .3 + r() * .55, build: Sim.KITS[c].builds[r() * 4 | 0].id })); };
    const cfg = { seed: base * 1000 + g + 1, teams: [team(0), team(1)] }, s = Sim.createMatch(cfg);
    while (!s.over && s.t < 2400) { Sim.step(s); s.ev.length = 0; }
    lens.push(s.t / 60); if (s.over) side[s.over.winner]++;
    let k0 = s.kills[0], k1 = s.kills[1]; slots.k += k0 + k1; slots.n++; if (Math.abs(k0 - k1) > 18) slots.stomp++;
    for (const c of s.champs) { const K = kit[c.champ], B = bld[c.build], won = s.over && c.team === s.over.winner ? 1 : 0; K.w += won; K.n++; K.k += c.stats.kills; K.d += c.stats.deaths; K.a += c.stats.assists; K.dmg += c.stats.dmg; K.g += c.gold; B.w += won; B.n++; }
    console.log(`g${g} ${(s.t / 60).toFixed(1)}m ${k0}-${k1} win ${s.over ? s.over.winner : 'none'}`);
  }
  console.log('RESULT ' + JSON.stringify({ lens, side, kit, bld, slots }));
}

// ---------- 12.0: navigation and jungle audit. node test_bots.js [games] nav ----------
// Per tick, per walking bot: how far it actually moved against how far its input should have carried it.
// blocked = under 60% of the expected step while up against something solid (the world stopped it). A touch = pressing into a wall, tower or edge.
// Jungler idle = alive, not walking, no damage dealt in 1.5s, not recalling, not healing at base, not capturing a district.
// stuck = a full second of trying to walk that covered under 40 units. Rates are shares of walking ticks.
function navTouch(s, c) {
  const n = Math.hypot(c.mv.x, c.mv.y) || 1, ux = c.mv.x / n, uy = c.mv.y / n;
  for (const w of s.map.walls) {
    const cx = Math.max(w.x, Math.min(c.x, w.x + w.w)), cy = Math.max(w.y, Math.min(c.y, w.y + w.h)), dx = c.x - cx, dy = c.y - cy, d = Math.hypot(dx, dy);
    if (d <= c.r + 1 && d > .01 && (ux * dx + uy * dy) / d < -.2) return 'wall';
  }
  for (const t of s.towers) if (t.alive) {
    const dx = c.x - t.x, dy = c.y - t.y, d = Math.hypot(dx, dy);
    if (d <= c.r + t.r - 7 && (ux * dx + uy * dy) / d < -.2) return t.sub === 'core' ? 'core' : 'tower';
  }
  if ((c.x <= 41 && ux < -.2) || (c.x >= s.map.W - 41 && ux > .2) || (c.y <= 111 && uy < -.2) || (c.y >= s.map.H - 111 && uy > .2)) return 'edge';
  return null;
}
function navClear(s, c) {
  let b = Math.min(c.x - 40 + c.r, s.map.W - 40 - c.x + c.r, c.y - 110 + c.r, s.map.H - 110 - c.y + c.r);
  for (const w of s.map.walls) { const cx = Math.max(w.x, Math.min(c.x, w.x + w.w)), cy = Math.max(w.y, Math.min(c.y, w.y + w.h)); b = Math.min(b, Math.hypot(c.x - cx, c.y - cy)); }
  for (const t of s.towers) if (t.alive) b = Math.min(b, Math.hypot(c.x - t.x, c.y - t.y) - t.r + 8);
  return b;
}
function audit(games, skill, cap = 1200, mode) {
  const A = { games: 0, mins: 0, walk: 0, blocked: 0, touch: {}, stuck: 0, stuckWall: 0, stuckBy: {}, stuckSpots: {}, hug: 0, byTask: {}, spots: {}, jg: { alive: 0, idle: 0, busy: {}, ganks: 0, firstGank: [], readyAt: [], campsBefore: [], camps: 0, tasks: {} }, lane: { t: 0, ok: 0 }, dist: { n: 0, d: 0, sub: 0 }, nem: 0 };
  for (let g = 0; g < games; g++) {
    let sd = g * 131 + 4243, r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    const a = roster(r, 0), b = roster(r, 1); [...a, ...b].forEach(p => { p.skill = skill; });
    const s = Sim.createMatch({ seed: g + 700, teams: [a, b], mode: mode || 'classic' });
    for (const c of s.champs) if (c.bot && c.bot.setSkill) c.bot.setSkill(skill);
    const st = s.champs.map(() => ({ win: [], stuckUntil: 0, dmg: 0, dmgAt: -9, wasGank: false, camps: 0, gotGank: false }));
    const campUp = s.camps.map(k => k.alive);
    while (!s.over && s.t < cap) {
      Sim.step(s);
      for (const e of s.ev) if (e.e === 'subway' && e.phase === 'arrive') A.dist.sub++;
      s.ev.length = 0;
      s.camps.forEach((k, i) => {
        if (campUp[i] && !k.alive) { const j = s.champs.findIndex(c => c.alive && c.role === 'jungle' && Math.hypot(c.x - k.x, c.y - k.y) < 700); if (j >= 0) { st[j].camps++; A.jg.camps++; } }
        campUp[i] = k.alive;
      });
      s.champs.forEach((c, i) => {
        if (!c.bot) return;
        const S0 = st[i];
        if ((c.stats.dmg || 0) > S0.dmg) { S0.dmg = c.stats.dmg; S0.dmgAt = s.t; }
        if (!c.alive) { S0.win.length = 0; return; }
        const m = Math.min(1, Math.hypot(c.mv.x, c.mv.y)), free = !c.chan && !(c.stunT > 0) && !(c.rootT > 0) && !(c.polyT > 0) && !(c.knockT > 0) && !c.air && !c.dash && !c.duelZ && !c.cuts && !c.leap && !(c.lock > 0);
        const task = c.bot.task || '?';
        if (m > .05 && free) {
          const step = Math.hypot(c.x - c.px, c.y - c.py), want = c.msBase * (c.slowT > 0 ? 1 - c.slowA : 1) * (c.hasteT > 0 ? 1 + c.hasteA : 1) * (c.charge ? .6 : 1) * m / 30;
          A.walk++;
          if (step < want * .6 && navClear(s, c) < c.r + 3) {
            A.blocked++; A.byTask[task] = (A.byTask[task] || 0) + 1;
            const key = (c.x / 200 | 0) * 200 + ',' + (c.y / 200 | 0) * 200; A.spots[key] = (A.spots[key] || 0) + 1;
          }
          const hit = navTouch(s, c); if (hit) A.touch[hit] = (A.touch[hit] || 0) + 1;
          S0.win.push(c.x, c.y); if (S0.win.length > 60) S0.win.splice(0, 2);
          if (S0.win.length === 60 && Math.hypot(c.x - S0.win[0], c.y - S0.win[1]) < 40 && s.t > S0.stuckUntil) {
            A.stuck++; S0.stuckUntil = s.t + 1; const w = navClear(s, c) < c.r + 30; if (w) { A.stuckWall++; const key = (c.x / 200 | 0) * 200 + ',' + (c.y / 200 | 0) * 200; A.stuckSpots[key] = (A.stuckSpots[key] || 0) + 1; A.stuckBy[task] = (A.stuckBy[task] || 0) + 1; }
          }
          if (navClear(s, c) < c.r + 6) A.hug++;
        } else S0.win.length = 0;
        if (c.role === 'jungle') {
          const home = s.fountains[c.team], atHome = Math.hypot(c.x - home.x, c.y - home.y) < 360 && c.hp < c.maxHp * .99, moving = m > .05 && Math.hypot(c.x - c.px, c.y - c.py) > 1, fighting = s.t - S0.dmgAt < 1.5, recall = c.chan && c.chan.recall, capturing = (s.districts || []).some(z => z.owner !== c.team && Math.hypot(c.x - z.x, c.y - z.y) < z.r);
          A.jg.alive++; A.jg.tasks[task] = (A.jg.tasks[task] || 0) + 1;
          if (!moving && !fighting && !recall && !atHome && !capturing && !c.stunT) { A.jg.idle++; A.jg.busy[task] = (A.jg.busy[task] || 0) + 1; }
          if (c.bot.gankReady && !S0.readyAt) S0.readyAt = s.t;
          const gk = task === 'gank';
          if (gk && !S0.wasGank) { if (!S0.gotGank) { S0.gotGank = true; A.jg.firstGank.push(s.t); A.jg.campsBefore.push(S0.camps); A.jg.readyAt.push(S0.readyAt || -1); } }
          S0.wasGank = gk;
        } else if (s.t > 28 && s.t < 360) {
          const home = s.fountains[c.team]; if (Math.hypot(c.x - home.x, c.y - home.y) > 700) { A.lane.t++; if (laneD(s, s.oneLane ? 0 : ROLE_LANE[c.role], c.x, c.y) < 420) A.lane.ok++; }
        }
        if (s.districts && s.districts.some(z => Math.hypot(c.x - z.x, c.y - z.y) < z.r)) A.dist.n++;
        A.dist.d++;
      });
    }
    for (const c of s.champs) if (c.role === 'jungle') A.jg.ganks += c.bot.gankN || 0;
    A.games++; A.mins += s.t / 60;
  }
  return A;
}
function auditReport(A, title) {
  const J = A.jg, mn = l => l.length ? (l.reduce((x, y) => x + y, 0) / l.length).toFixed(1) : '-';
  console.log(`\n=== nav audit ${title}: ${A.games} games, ${A.mins.toFixed(1)} min`);
  console.log(`walking bot-ticks ${A.walk}; blocked ${pct(A.blocked, A.walk)}; pressing into ${Object.entries(A.touch).map(([k, v]) => k + ' ' + pct(v, A.walk)).join(', ') || 'nothing'}; hugging an obstacle (under 6 clear) ${pct(A.hug, A.walk)}; stalls (1s under 40 units) ${A.stuck}, of which next to an obstacle ${A.stuckWall} = ${(A.stuckWall / (A.mins * 8)).toFixed(3)}/bot-min`);
  console.log('stalls next to obstacles by task:', Object.entries(A.stuckBy).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => k + ' ' + v).join(', '), '| spots:', Object.entries(A.stuckSpots).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => k + ' ' + v).join(' | '));
  console.log('blocked by task:', Object.entries(A.byTask).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => k + ' ' + pct(v, A.blocked)).join(', '));
  console.log('blocked hot spots:', Object.entries(A.spots).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => k + ' ' + pct(v, A.blocked)).join(' | '));
  console.log(`jungler idle ${pct(J.idle, J.alive)} (idle by task: ${Object.entries(J.busy).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => k + ' ' + pct(v, J.idle)).join(', ')}); ganks/jungler/game ${(J.ganks / (A.games * 2)).toFixed(1)}, first gank at ${mn(J.firstGank)}s after ${mn(J.campsBefore)} camps (first earned at ${mn(J.readyAt)}s), camps/jungler/game ${(J.camps / (A.games * 2)).toFixed(1)}`);
  console.log('jungler time by task:', Object.entries(J.tasks).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => k + ' ' + pct(v, J.alive)).join(', '));
  console.log(`laners on their lane 0:28-6:00 ${pct(A.lane.ok, A.lane.t)}; bot time inside a district ${pct(A.dist.n, A.dist.d)}; subway rides/game ${(A.dist.sub / A.games).toFixed(1)}`);
}

// ---------- 13.0 audit. node test_bots.js [games] v13 [skill] [mode] ----------
// Boss slams: every champion standing in a boss slam's ring when it is first telegraphed, and how many are still in it (and not invulnerable) as it lands.
// Evade: commands bots issued by reason (dodge, escape, waste), Sim's evade and dodge events. Combos, steals, Wanted, duels, Last Stand, acts from Sim events.
function v13(games, skill, mode) {
  const A = { games: 0, mins: 0, slamSeen: 0, slamCaught: 0, champBlast: 0, champCaught: 0, st: {}, ev: {}, evadeUse: 0, dodge: 0, combos: 0, steals: 0, wantedOn: 0, wantedDown: 0, wantedSecs: [], duels: { start: 0, win: 0, end: 0 }, stand: 0, standWon: 0, act: { 2: [], 3: [] }, actCore: 0, lens: [], kiteRanged: 0, rangedMins: 0, rampage: 0, laneOk: 0, laneT: 0, wins: [0, 0] };
  for (let g = 0; g < games; g++) {
    let sd = g * 977 + 31, r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    const a = roster(r, 0), b = roster(r, 1); [...a, ...b].forEach(p => { p.skill = skill; });
    const s = Sim.createMatch({ seed: g + 900, teams: [a, b], mode: mode || 'classic' });
    for (const c of s.champs) if (c.bot && c.bot.setSkill) c.bot.setSkill(skill);
    const watch = new Map(), wantedAt = {}; let stood = [false, false];
    while (!s.over && s.t < 2400) {
      Sim.step(s);
      for (const e of s.ev) {
        A.ev[e.e] = (A.ev[e.e] || 0) + (['evade', 'dodge', 'combo', 'steal', 'laststand', 'act', 'duel', 'wanted', 'rampage', 'slam', 'bossphase'].includes(e.e) ? 1 : 0);
        if (e.e === 'combo') A.combos++;
        if (e.e === 'steal' || (e.e === 'hl' && e.kind === 'steal')) A.steals++;
        if (e.e === 'laststand') { A.stand++; stood[e.team] = true; }
        if (e.e === 'act' && A.act[e.n]) { A.act[e.n].push(s.t); if (e.why === 'core') A.actCore++; }
        if (e.e === 'duel' && A.duels[e.phase] !== undefined) A.duels[e.phase]++;
        if (e.e === 'wanted') { if (e.n > 0 && wantedAt[e.u] === undefined) { A.wantedOn++; wantedAt[e.u] = s.t; } if (e.n === 0) { A.wantedDown++; if (wantedAt[e.u] !== undefined) { A.wantedSecs.push(s.t - wantedAt[e.u]); delete wantedAt[e.u]; } } }
        if (e.e === 'rampage' && e.phase === 'start') A.rampage++;
      }
      s.ev.length = 0;
      // Telegraphed blasts: who is inside when first seen, who is still inside as it lands.
      for (const z of s.zones) {
        if (z.kind !== 'blast' || !z.owner) continue;
        const boss = !!z.owner.boss;
        if (!watch.has(z.id)) { const ids = s.champs.filter(c => c.alive && c.bot && c.team !== z.team && Math.hypot(c.x - z.x, c.y - z.y) < z.r + c.r).map(c => c.id); watch.set(z.id, ids); if (boss) A.slamSeen += ids.length; else A.champBlast += ids.length; }
        if (z.t <= Sim.DT * 1.01) {
          for (const id of watch.get(z.id)) { const c = s.champs.find(x => x.id === id); if (c && c.alive && !(c.evT > 0) && Math.hypot(c.x - z.x, c.y - z.y) < z.r + c.r) { if (boss) A.slamCaught++; else A.champCaught++; } }
          watch.set(z.id, []);
        }
      }
      if (s.tick % 30 === 0) for (const c of s.champs) if (c.bot && c.alive && !Sim.KITS[c.champ].melee) A.rangedMins += 1 / 60;
      if (s.tick % 15 === 0 && s.t > 28 && s.t < 360) for (const c of s.champs) if (c.bot && c.alive && c.role !== 'jungle' && Math.hypot(c.x - s.fountains[c.team].x, c.y - s.fountains[c.team].y) > 700) { A.laneT++; if (laneD(s, s.oneLane ? 0 : ROLE_LANE[c.role], c.x, c.y) < 420) A.laneOk++; }
    }
    for (const c of s.champs) if (c.bot) { for (const [k, v] of Object.entries(c.bot.st13 || {})) A.st[k] = (A.st[k] || 0) + v; if (!Sim.KITS[c.champ].melee) A.kiteRanged += (c.bot.st13 || {}).kiteSteps || 0; }
    if (s.over) { A.wins[s.over.winner]++; for (const t of [0, 1]) if (stood[t] && s.over.winner === t) A.standWon++; }
    A.games++; A.mins += s.t / 60; A.lens.push((s.t / 60).toFixed(1));
  }
  return A;
}
function v13Report(A, title) {
  const bm = A.mins * 8, mn = l => l.length ? (l.reduce((x, y) => x + y, 0) / l.length).toFixed(0) : '-';
  console.log(`\n=== 13.0 audit ${title}: ${A.games} games, lengths ${A.lens.join(' ')} (wins ${A.wins.join('-')})`);
  console.log(`boss slams: ${A.slamSeen} bot-exposures, caught ${pct(A.slamCaught, A.slamSeen)}; champion blasts: ${A.champBlast} exposures, caught ${pct(A.champCaught, A.champBlast)}`);
  const st = A.st; console.log(`bot Evade commands/bot-min ${((st.ev || 0) / bm).toFixed(2)} (dodge ${st.evDodge || 0}, escape ${st.evEsc || 0}, wasted ${st.evWaste || 0}); Sim events: evade ${A.ev.evade || 0}, dodge ${A.ev.dodge || 0}`);
  console.log(`kite steps per ranged bot-min ${(A.kiteRanged / (A.rangedMins || 1)).toFixed(1)}; bot combo ults ${st.combo || 0}, combo events/game ${(A.combos / A.games).toFixed(2)}; bot steal casts ${st.steal || 0}, steals/game ${(A.steals / A.games).toFixed(2)}`);
  console.log(`wanted: ${A.wantedOn} marked, ${A.wantedDown} brought down (avg ${mn(A.wantedSecs)}s alive while wanted); duels start/win/end ${A.duels.start}/${A.duels.win}/${A.duels.end} (bot duel commits ${st.duel || 0}); Last Stand ${A.stand} (won after ${A.standWon}); rampages ${A.rampage}`);
  console.log(`acts: City War at ${mn(A.act[2])}s, Final Hour at ${mn(A.act[3])}s (${A.actCore} by core); laners on lane 0:28-6:00 ${pct(A.laneOk, A.laneT)}; Sim events seen: ${Object.entries(A.ev).filter(([, v]) => v).map(([k, v]) => k + ' ' + v).join(', ') || 'none of the 13.0 ones yet'}`);
}
// Custom Match ladder: each named level against the one below and against Rookie.
function levels(games) {
  const L = Sim.BOT_LEVELS || [{ id: 'rookie', name: 'Rookie', skill: .15 }, { id: 'regular', name: 'Regular', skill: .35 }, { id: 'veteran', name: 'Veteran', skill: .55 }, { id: 'elite', name: 'Elite', skill: .75 }, { id: 'legend', name: 'Legend', skill: .95 }];
  console.log(`\n=== Custom Match levels (${Sim.BOT_LEVELS ? 'Sim.BOT_LEVELS' : 'fallback table, Sim.BOT_LEVELS not exported yet'}): ${L.map(l => l.name + ' ' + l.skill).join(', ')}`);
  const pairs = []; for (let i = 1; i < L.length; i++) pairs.push([i, i - 1]); pairs.push([L.length - 1, 0]);
  for (const [hi, lo] of pairs) {
    const v = versus(L[hi].skill, L[lo].skill, games + (games % 2));
    console.log(`  ${L[hi].name} v ${L[lo].name}: ${v.wins}/${v.played} wins, kills ${v.ka}-${v.kb}, avg ${(v.M.secs / 60 / (v.M.games || 1)).toFixed(1)}m`);
  }
}

// ---------- 14.0 audit. node test_bots.js [games] v14 [skill] [mode] [seedBase] ----------
// Idle (strict): an alive bot that over the last second neither walked (under 25 units covered), attacked, cast, dealt damage
// nor took any of the legitimate waits: a recall or subway channel, a hard disable, healing in the fountain (below 98%), standing in a
// district or civilian site its side is taking, buying at the fountain. Sampled twice a second, reported per role and by the task it held.
// Jitter: heading flip-flops (a turn of over 135 degrees and back within half a second) per bot-minute while walking. Dodges and kites are turns too,
// so a small number is expected; a bot that dithers between two goals shows a large one.
// Conversion: a fight won by two kills or more (fights as in the main report) is converted when the winners destroy a structure,
// a boss, or flip a district within 50 seconds. Lead: the side ahead in kills at 10:00 (or the end) wins how often.
function v14(games, skill, mode, base) {
  const A = { games: 0, mins: 0, lens: [], wins: [0, 0], idle: {}, alive: {}, idleTask: {}, flips: 0, walkMin: 0, won2: 0, conv: 0, convWhat: {}, towers: 0, bosses: 0, flips2: 0, leadN: 0, leadWin: 0, stepMs: [], kills: 0, unfinished: 0 };
  for (let g = 0; g < games; g++) {
    let sd = (base + g) * 977 + 31, r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    // Rosters as bot fill makes them (Sim.sensiblePool: a kit for each role), not four random picks: a healer jungling with no front line is not a skill test.
    const fill = t => { const list = Sim.sensiblePool(t, null, r), roles = Sim.autoRoles(list); return list.map((c, i) => ({ champ: c, role: roles[i], name: 'b' + i, tier: 0 })); };
    const a = fill(0), b = fill(1), sk = Array.isArray(skill) ? skill : [skill, skill];
    a.forEach(p => { p.skill = sk[0]; }); b.forEach(p => { p.skill = sk[1]; });
    const s = Sim.createMatch({ seed: base + g + 900, teams: [a, b], mode: mode || 'classic' });
    for (const c of s.champs) if (c.bot && c.bot.setSkill) c.bot.setSkill(sk[c.team]);
    const st = s.champs.map(c => ({ hx: [], dmg: 0, act: -9, casts: 0, head: [], })), pend = [];
    let fight = null, tN = 0, tT = 0, lead10 = null;
    while (!s.over && s.t < 2400) {
      const t0 = process.hrtime.bigint(); Sim.step(s); tT += Number(process.hrtime.bigint() - t0); tN++;
      for (const e of s.ev) {
        const what = e.e === 'tower' ? 'tower' : e.e === 'boss' ? 'boss' : e.e === 'district' && e.phase === 'flip' ? 'district' : null;
        if (e.e === 'tower') A.towers++; if (e.e === 'boss') A.bosses++; if (what === 'district') A.flips2++;
        if (what) { const team = e.e === 'tower' ? 1 - e.team : e.team; for (const P of pend) { if (P.team !== team || s.t - P.t > 60) continue; if (!P.done && s.t - P.t < 50) { P.done = true; A.conv++; A.convWhat[what] = (A.convWhat[what] || 0) + 1; } if (what === 'tower' && !P.tw) { P.tw = true; A.convTw = (A.convTw || 0) + 1; } } }
      }
      s.ev.length = 0;
      if (lead10 === null && s.t >= 600) lead10 = s.kills[0] === s.kills[1] ? -1 : s.kills[0] > s.kills[1] ? 0 : 1;
      s.champs.forEach((c, i) => {
        const S0 = st[i]; if (!c.bot) return;
        if ((c.stats.dmg || 0) > S0.dmg || c.stats.casts > S0.casts || c.atkCd > (S0.lastCd || 0) + .01) S0.act = s.t;
        S0.dmg = c.stats.dmg || 0; S0.casts = c.stats.casts; S0.lastCd = c.atkCd;
        if (!c.alive) { S0.hx.length = 0; S0.head.length = 0; return; }
        S0.hx.push(c.x, c.y); if (S0.hx.length > 60) S0.hx.splice(0, 2);
        const mx = c.x - c.px, my = c.y - c.py, sp = Math.hypot(mx, my);
        if (sp > 1.5) { A.walkMin += 1 / 1800; const h = Math.atan2(my, mx); S0.head.push(s.t, h); if (S0.head.length > 40) S0.head.splice(0, 2); const H2 = S0.head, n = H2.length;
          // look for a reversal and back: heading now close to one ~.2-.5s ago, with one in between pointing away from both
          if (n >= 8 && !(S0.flipAt > s.t - .5)) { const ang = (x, y) => Math.abs(((x - y + 9.42478) % 6.28318) - 3.14159); for (let k = n - 4; k >= 0; k -= 2) { if (s.t - H2[k] > .5) break; if (ang(H2[k + 1], h) < .6) { let away = false; for (let j = k + 2; j < n - 2; j += 2) if (ang(H2[j + 1], h) > 2.35) { away = true; break; } if (away) { A.flips++; S0.flipAt = s.t; break; } } } }
        }
        if (s.tick % 15) return;
        const R = c.role; A.alive[R] = (A.alive[R] || 0) + 1;
        const moved = S0.hx.length >= 60 ? Math.hypot(c.x - S0.hx[0], c.y - S0.hx[1]) : 99;
        const home = s.fountains[c.team], atBase = Math.hypot(c.x - home.x, c.y - home.y) < 400;
        const capturing = (s.districts || []).some(z => !z.home && Math.hypot(c.x - z.x, c.y - z.y) < z.r && (z.owner !== c.team || z.by === 1 - c.team)) || s.sites.some(z => z.alive && Math.hypot(c.x - z.x, c.y - z.y) < 130 && z.prog[c.team] < 1);
        const wait = c.chan || c.stunT > 0 || c.rootT > 0 || c.polyT > 0 || c.knockT > 0 || c.air || (atBase && c.hp < c.maxHp * .98) || capturing;
        if (moved < 25 && s.t - S0.act > 1 && !wait && s.t > 5) { A.idle[R] = (A.idle[R] || 0) + 1; const k = R + ':' + (c.bot.task || '?'); A.idleTask[k] = (A.idleTask[k] || 0) + 1; }
      });
      if (s.tick % 15 === 0) {
        const al = [0, 1].map(t => s.champs.filter(c => c.team === t && c.alive));
        let f0 = 0, f1 = 0; for (const x of al[0]) if (al[1].some(y => dist(x, y) < 600)) f0++; for (const x of al[1]) if (al[0].some(y => dist(x, y) < 600)) f1++;
        const on = f0 >= 2 && f1 >= 2;
        if (on && !fight) fight = { k0: s.kills[0], k1: s.kills[1], last: s.t }; if (on) fight.last = s.t;
        if (fight && s.t - fight.last > 6) { const d0 = s.kills[0] - fight.k0, d1 = s.kills[1] - fight.k1; if (Math.abs(d0 - d1) >= 2) { A.won2++; pend.push({ team: d0 > d1 ? 0 : 1, t: s.t, done: false }); } fight = null; }
      }
    }
    A.stepMs.push(tT / 1e6 / tN);
    if (!s.over) A.unfinished++; else { A.wins[s.over.winner]++; const L = lead10 === null ? (s.kills[0] === s.kills[1] ? -1 : s.kills[0] > s.kills[1] ? 0 : 1) : lead10; if (L >= 0) { A.leadN++; if (L === s.over.winner) A.leadWin++; } }
    A.games++; A.mins += s.t / 60; A.lens.push(+(s.t / 60).toFixed(1)); A.kills += s.kills[0] + s.kills[1]; A.k = [(A.k || [0, 0])[0] + s.kills[0], (A.k || [0, 0])[1] + s.kills[1]]; A.tw = [0, 1].map(t => ((A.tw || [0, 0])[t]) + s.towers.filter(x => x.team !== t && !x.alive).length);
  }
  return A;
}
function v14Report(A, title) {
  const roles = ['top', 'jungle', 'bottom', 'support'], g = A.games || 1;
  console.log(`\n=== 14.0 audit ${title}: ${A.games} games${A.unfinished ? ' (' + A.unfinished + ' unfinished)' : ''}, avg ${(A.mins / g).toFixed(1)}m [${A.lens.join(' ')}], wins ${A.wins.join('-')}, kills/game ${(A.kills / g).toFixed(1)}`);
  console.log(`idle (strict): ${roles.map(r => r + ' ' + pct(A.idle[r] || 0, A.alive[r] || 0)).join(', ')}; all ${pct(roles.reduce((n, r) => n + (A.idle[r] || 0), 0), roles.reduce((n, r) => n + (A.alive[r] || 0), 0))}`);
  console.log('  idle by role:task:', Object.entries(A.idleTask).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => k + ' ' + v).join(', '));
  console.log(`jitter: ${(A.flips / Math.max(1, A.walkMin)).toFixed(2)} flip-flops per walking bot-minute; conversion: ${A.won2} fights won by 2+, ${pct(A.conv, A.won2)} converted within 50s (${JSON.stringify(A.convWhat)}), ${pct(A.convTw || 0, A.won2)} followed by a tower within 60s; towers/game ${(A.towers / g).toFixed(1)}, bosses/game ${(A.bosses / g).toFixed(1)}, district flips/game ${(A.flips2 / g).toFixed(1)}; kill leader at 10:00 wins ${pct(A.leadWin, A.leadN)}`);
  console.log(`step cost avg ${avgArr(A.stepMs).toFixed(3)} ms/tick, worst game ${Math.max(...A.stepMs).toFixed(3)}`);
}
// Adjacent Custom Match levels, paired seeds with sides swapped: node test_bots.js [games] ladder14 [seedBase] [pairs e.g. 1,2,3,4]
function ladder14(games, base, pairs) {
  const L = Sim.BOT_LEVELS;
  for (const hi of pairs) {
    const lo = hi - 1; let w = 0, n = 0, ka = 0, kb = 0, ta = 0, tb = 0, mins = 0; const bySide = [[0, 0], [0, 0]];
    for (let g = 0; g < games; g++) {
      const swap = g % 2, sk = swap ? [L[lo].skill, L[hi].skill] : [L[hi].skill, L[lo].skill];
      // Paired: each seed (same rosters, same sides) is played twice with the skills swapped, so kit and side strength cancel.
      const A = v14(1, sk, process.argv[6] || 'classic', base + (g >> 1) * 13 + hi * 1000);
      if (A.games && !A.unfinished) { n++; const win = A.wins[swap ? 1 : 0]; w += win; bySide[swap][0] += win; bySide[swap][1]++; } mins += A.mins;
      const hiT = swap ? 1 : 0; ka += A.k[hiT]; kb += A.k[1 - hiT]; ta += A.tw[hiT]; tb += A.tw[1 - hiT];
    }
    console.log(`  ${L[hi].name} v ${L[lo].name}: ${w}/${n} wins (${pct(w, n)}; as Heroes ${bySide[0][0]}/${bySide[0][1]}, as Villains ${bySide[1][0]}/${bySide[1][1]}), kills ${ka}-${kb}, towers taken ${ta}-${tb}, avg ${(mins / games).toFixed(1)}m`);
  }
}

async function main() {
  await Promise.resolve();
  if (MODE === 'nav') { auditReport(audit(N, +process.argv[4] || .6, +process.argv[5] || 1200, process.argv[6]), 'skill ' + (+process.argv[4] || .6) + (process.argv[6] ? ' ' + process.argv[6] : '')); return; }
  if (MODE === 'balance') { balance(N, +process.argv[4] || 1); return; }
  if (MODE === 'v13') { const sk = +process.argv[4] || .6; v13Report(v13(N, sk, process.argv[5]), 'skill ' + sk + (process.argv[5] ? ' ' + process.argv[5] : '')); return; }
  if (MODE === 'levels') { levels(N); return; }
  if (MODE === 'v14') { const sk = +process.argv[4] || .55; v14Report(v14(N, sk, process.argv[5] || 'classic', +process.argv[6] || 0), 'skill ' + sk + ' ' + (process.argv[5] || 'classic')); return; }
  if (MODE === 'ladder14') { ladder14(N, +process.argv[4] || 0, (process.argv[5] || '1,2,3,4').split(',').map(Number)); return; }
  console.log('Sim exports:', ['RANKS', 'rankOf', 'rankDelta', 'botSkills'].map(k => k + ':' + typeof Sim[k]).join(' '));
  if (MODE === 'all' || MODE === 'even') {
    report(run(N, g => ({ seed: g, skill0: .5, skill1: .5 })), 'even match, skill 0.5 v 0.5');
    report(run(Math.ceil(N / 2), g => ({ seed: g + 1000, skill0: .95, skill1: .95 })), 'even match, skill 0.95 v 0.95');
    report(run(Math.ceil(N / 2), g => ({ seed: g + 2000, skill0: .2, skill1: .2 })), 'even match, skill 0.2 v 0.2');
  }
  if (MODE === 'all' || MODE === 'ladder') {
    console.log('\n=== skill gradient (wins for the first listed team)');
    for (const [a, b] of [[.9, .5], [.5, .2], [.95, .2], [.7, .5], [.5, .5]]) {
      const v = versus(a, b, N + (N % 2)), M = v.M;
      console.log(`  ${a} v ${b}: ${v.wins}/${v.played} wins, kills ${v.ka}-${v.kb}, feed/game ${(M.feed3in90 / (M.games || 1)).toFixed(1)}, under-tower ${pct(M.underTower, M.deaths)}, avg ${(M.secs / 60 / (M.games || 1)).toFixed(1)}m`);
    }
  }
  if (MODE === 'all' || MODE === 'human') {
    console.log('\n=== a human seat idles at base (never plays its lane): do the bots adapt?');
    for (const role of ['top', 'bottom', 'jungle']) {
      const M = blank(); let cover = 0, samples = 0, wander = 0;
      for (let g = 0; g < Math.max(2, Math.ceil(N / 3)); g++) play({ seed: 3000 + g, skill0: .7, skill1: .7, M, human: role, humanTrack(s, c) {
        if (s.t < 50 || s.t >= LANE_SECS || !c.alive || c.team) return;
        samples++;
        if (c.bot.task === 'cover') cover++;
        if (c.role !== 'jungle' && laneD(s, ROLE_LANE[c.role] ^ 1, c.x, c.y) < 300 && laneD(s, ROLE_LANE[c.role], c.x, c.y) > 400) wander++;
      } });
      console.log(`  idle ${role}: bots on team spent ${pct(cover, samples)} of laning samples on cover duty, ${pct(wander, samples)} wandering in the wrong lane, avg length ${(M.secs / 60 / (M.games || 1)).toFixed(1)}m`);
    }
  }
  if (MODE === 'all' || MODE === 'rank') {
    console.log('\n=== rank contract sample');
    if (Sim.botSkills) {
      for (const r of [1000, 1250, 1500, 1800, 2100, 2500]) console.log(`  rank ${r} ${Sim.rankOf(r).name} (tier ${Sim.rankOf(r).tier}, frac ${Sim.rankOf(r).frac.toFixed(2)}): botSkills`, Sim.botSkills(r, 4, 7).map(v => +v.toFixed(2)).join(' '), ' delta win/lose vs avg .5 bots:', Sim.rankDelta(r, true, { kills: 5, deaths: 3, assists: 4 }, .5), Sim.rankDelta(r, false, { kills: 1, deaths: 6, assists: 2 }, .5));
    }
  }
}
main();
