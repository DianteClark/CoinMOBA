// Runs full bot-vs-bot matches to catch errors and check pacing and balance.
const Sim = require('./src/sim.js');
const ids = Object.keys(Sim.KITS);
const N = +process.argv[2] || 24, diff = process.argv[3] || 'normal';
const wins = {}, picks = {}, kda = {}; ids.forEach(i => { wins[i] = 0; picks[i] = 0; kda[i] = [0, 0, 0, 0, 0]; });
let tot = 0, blue = 0, mx = 0, mn = 1e9, tk = 0, unf = 0, nan = 0;
const t0 = Date.now();
for (let g = 0; g < N; g++) {
  let seed = g * 97 + 5, r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const sh = () => { const list = ids.slice().sort(() => r() - .5).slice(0, 4), roles = Sim.autoRoles(list); return list.map((c, i) => ({ champ: c, role: roles[i], name: 'b' + i, tier: 0 })); };
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

// Network codec check: rebuild a guest world from wire data for a whole match and compare.
if (process.argv.includes('--net')) {
  const ids2 = Object.keys(Sim.KITS), team = t => ids2.slice(0, 4).map((c, i) => ({ champ: c, role: Sim.ROLES[i], name: 'b', tier: 0, human: t === 1 && i === 0, remote: t === 1 && i === 0 }));
  const cfg = { seed: 3, diff: 'normal', teams: [team(0), team(1)] };
  const h = Sim.createMatch(cfg), g = Sim.createMatch(cfg);
  const seat = h.champs.findIndex(c => c.remote); Sim.setBot(h, h.champs[seat], true); // a bot plays the guest seat here
  let prev = Sim.slowFlat(h), snaps = 0, bytes = 0, max = 0, evs = 0, bad = 0, slowN = 0;
  const check = (name, ok) => { if (!ok && bad++ < 20) console.log('MISMATCH', name, 't', h.t.toFixed(1)); };
  while (!h.over && h.t < 2400) {
    Sim.step(h);
    for (const e of h.ev) { evs++; const r = Sim.unpackEvent(JSON.parse(JSON.stringify(Sim.packEvent(e)))); for (const k of Object.keys(e)) if (e[k] !== undefined) { const a = e[k], b = r[k]; if (typeof a === 'number' ? Math.abs(a - b) > .6 : (a === true ? b !== 1 : a === false ? b !== 0 : a !== b)) { check('event ' + e.e + '.' + k + ' ' + a + ' vs ' + b, false); } } }
    h.ev.length = 0;
    if (h.tick % 6 === 0) { const cur = Sim.slowFlat(h), df = Sim.slowDiff(prev, cur); prev = cur; slowN += JSON.stringify(df).length; Sim.applySlow(g, JSON.parse(JSON.stringify(df))); }
    if (h.tick % 3 !== 0) {
      const d = Sim.snapshot(h, seat, h.tick & 0xffff); snaps++; bytes += d.byteLength; max = Math.max(max, d.byteLength);
      const fr = Sim.decodeSnapshot(d), ga = g; Sim.applyFrame(ga, fr, null, 0, -1);
      if (fr.own) { const c = h.champs[seat]; for (let i = 0; i < 3; i++) check('cd', Math.abs(fr.own.cd[i] - Math.max(0, c.cd[i])) < .02); }
      h.champs.forEach((c, i) => { const q = g.champs[i]; check('champ pos', Math.abs(c.x - q.x) < .1 && Math.abs(c.y - q.y) < .1); check('champ hp', Math.abs(q.hp - Math.ceil(c.hp)) < 1.01); check('alive', c.alive === q.alive); check('fx', Math.abs((c.fx || 0) - q.fx) < .02); check('chan', !c.chan === !q.chan); check('charge', !c.charge === !q.charge); check('dash', !c.dash === !q.dash); check('air', (c.air > 0) === (q.air > 0)); check('brush', c.inBrush === q.inBrush); check('stun', (c.stunT > 0) === (q.stunT > 0)); });
      check('minion count', h.minions.length === g.minions.length); check('monster count', h.monsters.length === g.monsters.length); check('proj count', h.proj.length === g.proj.length); check('zones', h.zones.length === g.zones.length);
      h.minions.forEach((m, i) => { const q = g.minions[i]; check('minion', q && m.id === q.id && Math.abs(m.x - q.x) < .1 && q.team === m.team && q.ranged === m.ranged && (m.hp / m.maxHp - q.hp / 255) < .01); });
      h.proj.forEach((p, i) => { const q = g.proj[i]; for (const [k, ok] of [['id', q && p.id === q.id], ['fx', q && p.fx === q.fx], ['x', q && Math.abs(p.x - q.x) < .1], ['homing', q && !!p.homing === q.homing], ['team', q && p.team === q.team], ['owner', q && p.owner.id === q.owner.id], ['target', q && (!p.homing || p.target.id === q.target.id)]]) check('proj ' + k, ok); });
    }
  }
  const cur = Sim.slowFlat(h), df = Sim.slowDiff(prev, cur); Sim.applySlow(g, df);
  h.champs.forEach((c, i) => { const q = g.champs[i]; check('gold', Math.abs(q.gold - c.gold) <= 1); check('lvl', q.lvl === c.lvl); check('kills', q.stats.kills === c.stats.kills && q.stats.dmg - Math.round(c.stats.dmg) === 0); });
  check('towers', h.towers.every((t, i) => g.towers[i].alive === t.alive)); check('kills', g.kills[0] === h.kills[0] && g.kills[1] === h.kills[1]); check('over', !!g.over === !!h.over && (!h.over || g.over.winner === h.over.winner)); check('hope', Math.abs(g.hope - h.hope) < .1);
  console.log(`net codec: ${h.t.toFixed(0)}s, ${snaps} snaps avg ${(bytes / snaps).toFixed(0)}B max ${max}B, slow ${(slowN / Math.max(1, h.t / .2)).toFixed(0)}B/send, ${evs} events, mismatches ${bad}`);
}
