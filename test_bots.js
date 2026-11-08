// Bot audit: runs headless matches and reports stuck time, tower dives, ability use and pacing.
// node test_bots.js [games] [diff]
const Sim = require('./src/sim.js');
const N = +process.argv[2] || 6, [diff0, mixB] = (process.argv[3] || 'normal').split('-'), diff = diff0, mixA = mixB ? diff0 : null, ids = Object.keys(Sim.KITS);
const hist = () => ({}); const bump = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
const total = { games: 0, secs: 0, wins0: 0, kills: 0, stuck: 0, idle: 0, alive: 0, deathsBy: hist(), towerDeaths: 0, towerDeathsHope: 0, dives: 0, cast: {}, hit: {}, slot: {}, gold: 0, goldN: 0, recalls: 0, capt: 0, fights: 0, hopeHi: 0, hopeLo: 0, hopeMid: 0, hopeSum: 0, hopeN: 0, bossN: 0, towers: 0, gankWins: 0, fightKills: 0, shortest: 1e9, longest: 0, lens: [] };
const stuckByRole = {}, fountainTime = {}, metrics = { dumbIdle: 0, dither: 0, leadChanges: 0, comebacks: 0, comebackGames: 0, ultPerMin: {}, ultSlot: {}, feedStreaks: 0, gold0: [] };
for (let g = 0; g < N; g++) {
  let seed = g * 131 + 17, r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const sh = () => { const list = ids.slice().sort(() => r() - .5).slice(0, 4), roles = Sim.autoRoles(list); return list.map((c, i) => ({ champ: c, role: roles[i], name: 'b' + i, tier: 0 })); };
  const s = Sim.createMatch({ seed: g + 200, diff, teams: [sh(), sh()] });
  const prevPos = new Map(), lastSec = -1;
  if (mixA) s.champs.forEach(c => { if (c.bot) c.bot.sk = Sim.DIFF[c.team ? mixB : mixA]; });
  let fightOn = false, leadSign = 0, behindAt6 = -1; const trail = new Map(), recentDeaths = new Map();
  while (!s.over && s.t < 2400) {
    Sim.step(s);
    for (const e of s.ev) {
      if (e.e === 'die' && e.kind === 'champ') {
        const killer = s.champs.find(c => c.id === e.by) || s.towers.find(t => t.id === e.by) || s.monsters.find(m => m.id === e.by);
        const by = !killer ? 'none' : killer.kind === 'tower' ? 'tower' : killer.kind === 'monster' ? 'monster' : killer.kind === 'minion' ? 'minion' : 'champ';
        bump(total.deathsBy, by);
        const u = s.champs.find(c => c.id === e.u), tw = s.towers.find(t => t.alive && t.team !== u.team && Math.hypot(t.x - u.x, t.y - u.y) < t.range + 20);
        if (tw) total.towerDeaths++;
      }
      if (e.e === 'die' && e.kind === 'champ') { const u = s.champs.find(c => c.id === e.u), l = recentDeaths.get(e.u) || []; l.push(s.t); recentDeaths.set(e.u, l.filter(x => s.t - x < 90)); if (l.length >= 3) { metrics.feedStreaks++; recentDeaths.set(e.u, []); } }
      if (e.e === 'civ') total.capt++;
      if (e.e === 'boss') total.bossN++;
      if (e.e === 'tower') total.towers++;
    }
    s.ev.length = 0;
    if (s.tick % 30 === 0) {
      let f0 = 0, f1 = 0; const cx = [0, 1].map(t => s.champs.filter(c => c.team === t && c.alive));
      for (const a of cx[0]) { if (cx[1].some(b => Math.hypot(a.x - b.x, a.y - b.y) < 500)) f0++; }
      for (const a of cx[1]) { if (cx[0].some(b => Math.hypot(a.x - b.x, a.y - b.y) < 500)) f1++; }
      const fight = f0 >= 3 && f1 >= 3; if (fight && !fightOn) total.fights++; fightOn = fight;
      const gold = [0, 0]; for (const c of s.champs) gold[c.team] += c.stats.dmg * .1 + c.lvl * 300 + c.up.edge * 300; const lead = Math.sign(gold[0] - gold[1]);
      if (lead && lead !== leadSign) { if (leadSign) metrics.leadChanges++; leadSign = lead; }
      if (behindAt6 < 0 && s.t >= 360) behindAt6 = lead > 0 ? 1 : 0;
      if (s.hope >= 70) total.hopeHi++; else if (s.hope <= 30) total.hopeLo++; else total.hopeMid++;
      total.hopeSum += s.hope; total.hopeN++;
      for (const c of s.champs) {
        const p = prevPos.get(c.id), moved = p ? Math.hypot(c.x - p.x, c.y - p.y) : 999; prevPos.set(c.id, { x: c.x, y: c.y });
        if (!c.alive) continue;
        total.alive++;
        const mv = Math.hypot(c.mv.x, c.mv.y), still = c.bot && c.bot.still;
        if (mv > .15 && moved < 25 && !c.chan && !c.charge && c.stunT <= 0 && !still) { total.stuck++; bump(stuckByRole, c.role); }
        if (mv < .05) total.idle++;
        const nearE = s.champs.some(e => e.team !== c.team && e.alive && Math.hypot(e.x - c.x, e.y - c.y) < 1000), atHome = Math.hypot(c.x - s.fountains[c.team].x, c.y - s.fountains[c.team].y) < 330;
        if (!c.chan && !nearE && !atHome && mv < .05 && !s.minions.some(m => m.team !== c.team && Math.hypot(m.x - c.x, m.y - c.y) < 600) && !s.monsters.some(m => Math.hypot(m.x - c.x, m.y - c.y) < 400) && c.stunT <= 0) metrics.dumbIdle++;
        const tr = trail.get(c.id) || [], cut = s.t - 6; tr.push({ t: s.t, x: c.x, y: c.y }); while (tr[0].t < cut) tr.shift(); trail.set(c.id, tr);
        if (tr.length >= 6 && !nearE && mv > .15 && Math.hypot(tr[0].x - c.x, tr[0].y - c.y) < 70) metrics.dither++;
        const home = s.fountains[c.team]; if (Math.hypot(c.x - home.x, c.y - home.y) < 320) bump(fountainTime, c.role);
        total.gold += c.gold; total.goldN++;
        const t = s.towers.find(t => t.alive && t.team !== c.team && Math.hypot(t.x - c.x, t.y - c.y) < t.range);
        if (t && !s.minions.some(m => m.alive && m.team === c.team && Math.hypot(m.x - t.x, m.y - t.y) < t.range - 20)) total.dives++;
      }
    }
  }
  if (!s.over) { console.log('unfinished', g); continue; }
  total.games++; total.secs += s.t; total.lens.push(s.t / 60); if (s.over.winner === 0) total.wins0++; total.kills += s.kills[0] + s.kills[1]; total.shortest = Math.min(total.shortest, s.t); total.longest = Math.max(total.longest, s.t);
  if (behindAt6 >= 0) { metrics.comebackGames++; if ((behindAt6 ? 0 : 1) === s.over.winner) metrics.comebacks++; }
  for (const c of s.champs) { const k = c.champ; total.cast[k] = (total.cast[k] || 0) + c.stats.casts; total.hit[k] = (total.hit[k] || 0) + c.stats.skillHits; bump(total.slot, k, 1); }
}
const T = total, g = T.games || 1, mins = T.secs / 60, nb = T.alive || 1;
console.log(`${mixA ? mixA + ' vs ' + mixB : diff}: ${T.games} games, avg ${(mins / g).toFixed(1)}m (${(T.shortest / 60).toFixed(1)}-${(T.longest / 60).toFixed(1)}), blue wins ${T.wins0}/${T.games}, kills/game ${(T.kills / g).toFixed(1)}`);
console.log(`stuck ${(T.stuck / nb * 100).toFixed(2)}% of alive seconds, idle ${(T.idle / nb * 100).toFixed(1)}%, in-fountain-area by role`, Object.fromEntries(Object.entries(fountainTime).map(([k, v]) => [k, (v / T.alive * 100 * 8).toFixed(1) + '%'])));
console.log('deaths by', T.deathsBy, `towerDeaths ${T.towerDeaths} (${(T.towerDeaths / Math.max(1, Object.values(T.deathsBy).reduce((a, b) => a + b, 0)) * 100).toFixed(0)}% of deaths), dive-seconds/min/bot ${(T.dives / mins / 8).toFixed(1)}`);
console.log('casts/game-min per champ:', Object.keys(T.cast).map(k => `${k} ${(T.cast[k] / (T.slot[k] * (mins / g))).toFixed(2)} (hit ${(T.hit[k] / (T.cast[k] || 1) * 100).toFixed(0)}%)`).join(', '));
console.log(`avg gold held ${(T.gold / (T.goldN || 1)).toFixed(0)}, sites captured/game ${(T.capt / g).toFixed(1)}, teamfights/game ${(T.fights / g).toFixed(1)}, towers/game ${(T.towers / g).toFixed(1)}, boss/game ${(T.bossN / g).toFixed(2)}`);
console.log('lengths', T.lens.map(x => x.toFixed(1)).join(' '));
console.log(`hope: time >=70 ${(T.hopeHi / T.hopeN * 100).toFixed(0)}%, <=30 ${(T.hopeLo / T.hopeN * 100).toFixed(0)}%, avg ${(T.hopeSum / T.hopeN).toFixed(0)}`);
console.log(`dumb idle ${(metrics.dumbIdle / nb * 100).toFixed(2)}% of alive seconds, dither ${(metrics.dither / nb * 100).toFixed(2)}%, feeding streaks (3 deaths in 90s) per game ${(metrics.feedStreaks / g).toFixed(2)}, gold-lead changes per game ${(metrics.leadChanges / g).toFixed(1)}, comebacks (behind at 6m, won) ${metrics.comebacks}/${metrics.comebackGames}`);
