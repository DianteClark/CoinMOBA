// Runs full bot-vs-bot matches to catch errors and check pacing and balance.
const Sim = require('./src/sim.js');
const ids = Object.keys(Sim.KITS);
const N = +process.argv[2] || 24;
const wins = {}, picks = {}, kda = {}; ids.forEach(i => { wins[i] = 0; picks[i] = 0; kda[i] = [0, 0, 0, 0, 0]; });
let tot = 0, blue = 0, mx = 0, mn = 1e9, tk = 0, unf = 0, nan = 0;
const t0 = Date.now();
for (let g = 0; g < N; g++) {
  let seed = g * 97 + 5, r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const sh = () => { const list = ids.slice().sort(() => r() - .5).slice(0, 4), roles = Sim.autoRoles(list); return list.map((c, i) => ({ champ: c, role: roles[i], name: 'b' + i, tier: 0 })); };
  const s = Sim.createMatch({ seed: g + 1, teams: [sh(), sh()] });
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

// Map: every free nav cell connects to the fountains, with no dead-end trap cells.
{
  const m = Sim.buildMap(), C = m.cols, R = m.rows, free = (i, j) => i >= 0 && j >= 0 && i < C && j < R && !m.grid[j * C + i];
  const a0 = m.fountains[0].x / 40 | 0, b0 = m.fountains[0].y / 40 | 0, seen = new Uint8Array(C * R), st = [[a0, b0]]; seen[b0 * C + a0] = 1;
  while (st.length) { const [i, j] = st.pop(); for (let d = -1; d <= 1; d++) for (let e = -1; e <= 1; e++) { const a = i + d, b = j + e; if ((!d && !e) || !free(a, b) || seen[b * C + a]) continue; if (d && e && (!free(a, j) || !free(i, b))) continue; seen[b * C + a] = 1; st.push([a, b]); } }
  let cut = 0, trap = 0; for (let j = 0; j < R; j++) for (let i = 0; i < C; i++) if (free(i, j)) { if (!seen[j * C + i]) cut++; let n = 0; for (let d = -1; d <= 1; d++) for (let e = -1; e <= 1; e++) if ((d || e) && free(i + d, j + e)) n++; if (n <= 2) trap++; }
  console.log(cut || trap ? `map FAILED: ${cut} unreachable, ${trap} trap cells` : 'map connected, no trap cells');
}

// Rule checks: walls, fog, forge while dead, fountain, towers, leashes.
{
  const roster = () => ids.slice(0, 4).map((c, i) => ({ champ: c, role: Sim.ROLES[i], name: 'b', tier: 0, human: true }));
  const mk = () => Sim.createMatch({ seed: 9, teams: [roster(), roster()] });
  let fails = 0; const ok = (name, v) => { if (!v) { fails++; console.log('FAIL', name); } };
  const s = mk(), wall = s.map.walls.find(w => !w.big), a = s.champs[0], b = s.champs[4];
  const place = (u, x, y) => { u.x = u.px = x; u.y = u.py = y; };
  ok('rayWall stops at a wall', Math.abs(Sim.rayWall(wall.x + 20, wall.y - 100, 0, 1, 500) - 100) < 1);
  ok('rayWall open line', Sim.rayWall(1000, 1280, 1, 0, 300) === 300);
  ok('LOS blocked', !Sim.hasLOS(wall.x + 20, wall.y - 60, wall.x + 20, wall.y + wall.h + 60));
  // Basic attacks need line of sight.
  place(a, wall.x + 20, wall.y - 40); place(b, wall.x + 20, wall.y + wall.h + 40); b.revealT = 5; a.atkPref = 0;
  a.range = 400; ok('no autoTarget through a wall', Sim.autoTarget(s, a) !== b);
  place(b, wall.x + 20, wall.y - 200); ok('autoTarget in the open', Sim.autoTarget(s, a) === b);
  // Fog: seen near a source, hidden far from all.
  b.revealT = 0; for (const t of s.towers) t.alive = false;
  for (const c of s.champs) if (c !== a && c !== b) c.alive = false;
  place(a, 1000, 1280); place(b, 1000 + a.sight + 200, 1280); b.inBrush = -1; s.tick++;
  ok('fog hides far enemy', !Sim.canSee(s, 0, b)); place(b, 1000 + a.sight - 50, 1280); s.tick++; ok('sight reveals', Sim.canSee(s, 0, b));
  ok('vision has source', Sim.visionSources(s, 0).some(v => v.r === a.sight));
  // Forge while dead.
  const d = mk(), c = d.champs[0]; c.alive = false; c.hp = 0; c.respawn = 30; c.gold = 1000; c.q.push({ t: 'forge', track: 'edge' }); Sim.step(d);
  ok('forge while dead', c.up.edge === 1 && c.gold < 1000 && c.hp === 0);
  // Fountain heals about 45% a second.
  const h = mk(), k = h.champs[0]; h.minions.length = 0; k.hp = k.maxHp * .1; for (let i = 0; i < 30; i++) Sim.step(h);
  ok('fountain heal', k.hp / k.maxHp > .5 && k.hp / k.maxHp < .6);
  // Towers: consecutive shots on one target ramp up 45% each, capped at 4x, and reset on a new target.
  const tw = mk(), tt = tw.towers.find(t => t.team === 1 && t.tier === 0), v = tw.champs[0], w2 = tw.champs[1];
  tw.minions.length = 0; tw.nextWave = 1e9; for (const c of tw.champs) { c.alive = c === v || c === w2; c.respawn = 1e9; } tw.towers.forEach(t => { if (t !== tt) t.alive = false; });
  place(v, tt.x, tt.y + 120); place(w2, tt.x + 3000, tt.y + 700); v.maxHp = v.hp = 1e7; w2.maxHp = w2.hp = 1e7; v.armor = 0; const seen = [];
  for (let i = 0; i < 320 && seen.length < 7; i++) { place(v, tt.x, tt.y + 120); v.hp = v.maxHp; Sim.step(tw); for (const e of tw.ev) if (e.e === 'hit' && e.u === v.id && e.by === tt.id) seen.push(e.a); tw.ev.length = 0; }
  const ratio = seen[1] / seen[0], cap = Math.max(...seen) / seen[0];
  ok('tower ramp ' + seen.join(','), Math.abs(ratio - 1.45) < .08 && cap > 3.7 && cap < 4.2);
  place(v, tt.x + 3000, tt.y + 700); place(w2, tt.x, tt.y + 120); tw.ev.length = 0; let ft = 0;
  for (let i = 0; i < 80 && !ft; i++) { w2.hp = w2.maxHp; Sim.step(tw); place(w2, tt.x, tt.y + 120); for (const e of tw.ev) if (e.e === 'hit' && e.u === w2.id && e.by === tt.id) ft = e.a; tw.ev.length = 0; }
  ok('tower resets on a new target', ft > 0 && ft / seen[0] < 1.25);
  // Monsters stay on their patch: chase past the leash, then give up and head home.
  const ms = mk(), camp = ms.camps[0]; ms.t = camp.at; for (const q of ms.champs) { q.alive = false; q.respawn = 1e9; } ms.towers.forEach(t => { t.alive = false; }); ms.nextWave = 1e9;
  Sim.step(ms); const mon = ms.monsters.find(x => x.camp === camp.id), bait = ms.champs[0]; ok('camp spawned', !!mon);
  bait.alive = true; bait.hp = bait.maxHp = 1e7; place(bait, camp.x + 60, camp.y); bait.q.length = 0; mon.tgt = bait; mon.hitAt = ms.t; let far = 0;
  for (let i = 0; i < 400; i++) { place(bait, camp.x + Math.min(1200, 40 + i * 12), camp.y); Sim.step(ms); ms.ev.length = 0; far = Math.max(far, Math.hypot(mon.x - mon.hx, mon.y - mon.hy)); }
  ok('leash holds, max ' + far.toFixed(0), far <= mon.leash + 1); ok('monster walked home', Math.hypot(mon.x - mon.hx, mon.y - mon.hy) < 60 && !mon.tgt);
  console.log(fails ? 'rule checks FAILED ' + fails : 'rule checks ok');
}

// Network codec check: rebuild a guest world from wire data for a whole match and compare.
if (process.argv.includes('--net')) {
  const ids2 = Object.keys(Sim.KITS), team = t => ids2.slice(0, 4).map((c, i) => ({ champ: c, role: Sim.ROLES[i], name: 'b', tier: 0, human: t === 1 && i === 0, remote: t === 1 && i === 0 }));
  const cfg = { seed: 3, teams: [team(0), team(1)] };
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
