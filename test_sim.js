// Runs full bot-vs-bot matches to catch errors and check pacing and balance.
const Sim = require('./src/sim.js');
const ids = Object.keys(Sim.KITS);
const N = +process.argv[2] || 24, diff = process.argv[3] || 'normal';
const wins = {}, picks = {}, kda = {}; ids.forEach(i => { wins[i] = 0; picks[i] = 0; kda[i] = [0, 0, 0, 0, 0]; });
let tot = 0, blue = 0, mx = 0, mn = 1e9, tk = 0, unf = 0, nan = 0;
const t0 = Date.now();
for (let g = 0; g < N; g++) {
  let seed = g * 97 + 5, r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const sh = () => ids.slice().sort(() => r() - .5).slice(0, 4).map((c, i) => ({ champ: c, name: 'b' + i, tier: 0 }));
  const s = Sim.createMatch({ seed: g + 1, diff, teams: [sh(), sh()] });
  while (!s.over && s.t < 2400) {
    Sim.step(s); s.ev.length = 0;
    if (s.tick % 300 === 0) for (const c of s.champs) if (!isFinite(c.x + c.y + c.hp)) nan++;
  }
  if (!s.over) { unf++; console.log('unfinished', g, s.towers.filter(t => t.alive).length, s.kills); continue; }
  tot += s.t; mx = Math.max(mx, s.t); mn = Math.min(mn, s.t); tk += s.kills[0] + s.kills[1]; if (s.over.winner === 0) blue++;
  for (const c of s.champs) { picks[c.champ]++; if (c.team === s.over.winner) wins[c.champ]++; const k = kda[c.champ]; k[0] += c.stats.kills; k[1] += c.stats.deaths; k[2] += c.stats.casts; k[3] += c.stats.skillHits; k[4] += c.lvl; }
}
const done = N - unf;
console.log(`games ${done}/${N} avg ${(tot / done / 60).toFixed(1)}m min ${(mn / 60).toFixed(1)} max ${(mx / 60).toFixed(1)} kills/game ${(tk / done).toFixed(1)} azure wins ${blue} nan ${nan} wall ${Date.now() - t0}ms`);
for (const i of ids) { const p = picks[i] || 1, k = kda[i]; console.log(i.padEnd(8), `win ${(wins[i] / p * 100).toFixed(0)}%`.padEnd(9), `k ${(k[0] / p).toFixed(1)} d ${(k[1] / p).toFixed(1)} hit ${(k[3] / (k[2] || 1) * 100).toFixed(0)}% lvl ${(k[4] / p).toFixed(1)}`); }
