// Bot audit: headless matches, measuring discipline, tower respect, feeding, farming, abilities, fights,
// objectives, pacing and the skill gradient. node test_bots.js [games] [mode]
// mode: all (default), even, ladder, role.
const Sim = require('./src/sim.js');
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

async function main() {
  await Promise.resolve();
  if (MODE === 'balance') { balance(N, +process.argv[4] || 1); return; }
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
