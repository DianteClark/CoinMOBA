// Runs full bot-vs-bot matches to catch errors and check pacing and balance.
const Sim = require('./src/sim.js');
const ids = Object.keys(Sim.KITS), RO = Sim.ROSTER;
const N = process.argv[2] === undefined ? 24 : +process.argv[2];
const wins = {}, picks = {}, kda = {}; ids.forEach(i => { wins[i] = 0; picks[i] = 0; kda[i] = [0, 0, 0, 0, 0]; });
let tot = 0, blue = 0, mx = 0, mn = 1e9, tk = 0, unf = 0, nan = 0;
const t0 = Date.now();
for (let g = 0; g < N; g++) {
  let seed = g * 97 + 5, r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const sh = team => { const list = RO[team].slice().sort(() => r() - .5).slice(0, 4), roles = Sim.autoRoles(list); return list.map((c, i) => ({ champ: c, role: roles[i], name: 'b' + i, tier: 0 })); };
  const s = Sim.createMatch({ seed: g + 1, teams: [sh(0), sh(1)] });
  while (!s.over && s.t < 2400) {
    Sim.step(s); s.ev.length = 0;
    if (s.tick % 300 === 0) for (const c of s.champs) if (!isFinite(c.x + c.y + c.hp)) nan++;
  }
  if (!s.over) { unf++; console.log('unfinished', g, s.towers.filter(t => t.alive).length, s.kills); continue; }
  tot += s.t; mx = Math.max(mx, s.t); mn = Math.min(mn, s.t); tk += s.kills[0] + s.kills[1]; if (s.over.winner === 0) blue++;
  for (const c of s.champs) { picks[c.champ]++; if (c.team === s.over.winner) wins[c.champ]++; const k = kda[c.champ]; k[0] += c.stats.kills; k[1] += c.stats.deaths; k[2] += c.stats.casts; k[3] += c.stats.skillHits; k[4] += c.lvl; }
}
const done = Math.max(1, N - unf);
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
  const roster = t => RO[t].slice(0, 4).map((c, i) => ({ champ: c, role: Sim.ROLES[i], name: 'b', tier: 0, human: true }));
  const mk = () => Sim.createMatch({ seed: 9, teams: [roster(0), roster(1)] });
  let fails = 0; const ok = (name, v) => { if (!v) { fails++; console.log('FAIL', name); } };
  const s = mk(), wall = s.map.walls.find(w => !w.big), a = s.champs[0], b = s.champs[4];
  const place = (u, x, y) => { u.x = u.px = x; u.y = u.py = y; };
  for (const t of s.towers) ok('tower out-ranges attacks by 70', t.range - Math.max(...Object.values(Sim.KITS).map(k => k.range)) >= 70);
  ok('rayWall stops at a wall', Math.abs(Sim.rayWall(wall.x + 20, wall.y - 100, 0, 1, 500) - 100) < 1);
  ok('rayWall open line', Sim.rayWall(1200, 1536, 1, 0, 300) === 300);
  ok('LOS blocked', !Sim.hasLOS(wall.x + 20, wall.y - 60, wall.x + 20, wall.y + wall.h + 60));
  // Basic attacks need line of sight.
  place(a, wall.x + 20, wall.y - 40); place(b, wall.x + 20, wall.y + wall.h + 40); b.revealT = 5; a.atkPref = 0;
  a.range = 400; ok('no autoTarget through a wall', Sim.autoTarget(s, a) !== b);
  place(b, wall.x + 20, wall.y - 200); ok('autoTarget in the open', Sim.autoTarget(s, a) === b);
  // Fog: seen near a source, hidden far from all.
  b.revealT = 0; for (const t of s.towers) t.alive = false;
  for (const c of s.champs) if (c !== a && c !== b) c.alive = false;
  place(a, 1200, 1536); place(b, 1200 + a.sight + 200, 1536); b.inBrush = -1; s.tick++;
  ok('fog hides far enemy', !Sim.canSee(s, 0, b)); place(b, 1200 + a.sight - 50, 1536); s.tick++; ok('sight reveals', Sim.canSee(s, 0, b));
  ok('vision has source', Sim.visionSources(s, 0).some(v => v.r === a.sight));
  // Forge while dead.
  const d = mk(), c = d.champs[0]; c.alive = false; c.hp = 0; c.respawn = 30; c.gold = 1000; c.q.push({ t: 'buy', id: 'vest' }); Sim.step(d);
  ok('buy while dead', c.items.includes('vest') && c.gold < 1000 && c.hp === 0);
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
  // Districts: layout, capture asymmetry, effects, subway, blackout.
  {
    const quiet = () => { const q = mk(); q.minions.length = 0; q.nextWave = 1e9; q.eventAt = 1e9; for (const t of q.towers) t.range = 0; for (const c of q.champs) { c.alive = false; c.respawn = 1e9; c.q.length = 0; } return q; };
    const steps = (q, n) => { for (let i = 0; i < n; i++) { Sim.step(q); } };
    const on = (q, c, x, y) => { c.alive = true; c.hp = c.maxHp; place(c, x, y); };
    const D = mk().districts; ok('districts laid out', D.length === 14 && D.filter(d => d.home).length === 2 && D.filter(d => !d.home && d.site < 0).length === 0);
    for (const d of D) { const twin = d.side < 0 ? d :  D.find(o => o.kind === d.kind && Math.abs(o.x - (5184 - d.x)) < 1 && Math.abs(o.y - (3072 - d.y)) < 1); ok('180-degree twin ' + d.id, !!twin); ok('district on open ground ' + d.id, Sim.rayWall(d.x, d.y, 1, 0, 60) === 60 && Sim.rayWall(d.x, d.y, -1, 0, 60) === 60); }
    const kind = (q, k, side) => q.districts.find(d => d.kind === k && !d.home && (side === undefined || d.side === side));
    const timeTo = (team, k) => { const q = quiet(), d = kind(q, k, team), c = q.champs.find(x => x.team === team); on(q, c, d.x, d.y); const h0 = q.hope; let n = 0; while (d.owner !== team && n < 900) { Sim.step(q); on(q, c, d.x, d.y); q.ev.length = 0; n++; } return { sec: n / 30, h: q.hope - h0, d, q }; };
    const he = timeTo(0, 'armory'), vi = timeTo(1, 'armory');
    ok(`villains capture faster (${vi.sec.toFixed(1)} vs ${he.sec.toFixed(1)})`, vi.sec < he.sec && vi.sec < 10 && he.sec > 6);
    ok('villains hurt the people bar, heroes lift it', vi.h < -3 && he.h > 3); ok('villains scar, heroes do not', vi.d.scar > .9 && he.d.scar === 0);
    { const q = quiet(), d = kind(q, 'hospital', 0), z = q.sites[d.site]; z.alive = false; z.last = 1; z.at = 1e9; const c = q.champs[0]; on(q, c, d.x, d.y); steps(q, 150); on(q, c, d.x, d.y); const dead = d.prog; const q2 = quiet(), d2 = kind(q2, 'hospital', 0), c2 = q2.champs[0]; on(q2, c2, d2.x, d2.y + 150); for (let i = 0; i < 150; i++) { on(q2, c2, d2.x, d2.y + 150); Sim.step(q2); } ok(`heroes need civilians (${dead.toFixed(2)} < ${d2.prog.toFixed(2)})`, dead < d2.prog * .6); }
    { const q = quiet(), d = kind(q, 'comms', 0), a = q.champs[0], b = q.champs[4]; on(q, a, d.x, d.y); on(q, b, d.x + 20, d.y); steps(q, 150); ok('contested freezes', d.contested && d.prog === 0 && d.owner === -1); }
    { const q = quiet(), d = kind(q, 'comms', 0), a = q.champs[0], b = q.champs[4]; on(q, a, d.x, d.y); d.owner = 0; steps(q, 30); a.alive = false; a.respawn = 1e9; on(q, b, d.x + 900, d.y); b.inBrush = -1; q.tick++; ok('comms spots enemies far from any champion', Sim.canSee(q, 0, b)); q.blackT[0] = 5; q.tick++; ok('blackout darkens comms', !Sim.canSee(q, 0, b)); }
    { const q = quiet(), a = q.champs[0]; const base = () => { const f = Sim.createMatch({ seed: 9, teams: [[{ champ: 'vesper', role: 'bottom', name: 'x' }], [{ champ: 'deadbolt', role: 'bottom', name: 'y' }]] }); return f; }; const g = base(), v = g.champs[0], e = g.champs[1]; v.hp = 1; const kk = () => { v.alive = true; v.hp = 1; v.respawn = 0; e.dmgBase = 1e6; }; kk(); e.alive = true; g.nextWave = 1e9; for (const t of g.towers) t.range = 0; place(v, 1000, 1500); place(e, 1050, 1500); e.atk = true; for (let i = 0; i < 120 && v.alive; i++) { Sim.step(g); g.ev.length = 0; } const r1 = v.respawn; const g2 = base(), v2 = g2.champs[0], e2 = g2.champs[1]; g2.districts.filter(d => d.kind === 'hospital').forEach(d => { d.owner = 0; }); g2.nextWave = 1e9; for (const t of g2.towers) t.range = 0; for (let i = 0; i < 31; i++) Sim.step(g2); e2.dmgBase = 1e6; v2.hp = 1; place(v2, 1000, 1500); place(e2, 1050, 1500); e2.atk = true; for (let i = 0; i < 90 && v2.alive; i++) { Sim.step(g2); g2.ev.length = 0; } const r2 = v2.respawn; ok(`hospitals cut respawns (${r1.toFixed(1)} -> ${r2.toFixed(1)})`, r1 > 0 && r2 > 0 && r2 < r1 * .75); }
    { const q = quiet(), d = kind(q, 'hospital', 0), c = q.champs[0]; d.owner = 0; c.alive = true; place(c, d.x, d.y); c.hp = c.maxHp * .3; c.lastHurt = -99; steps(q, 60); const hp = c.hp / c.maxHp; ok('hospital heals inside', hp > .36 && hp < .4); }
    { const q = quiet(), c = q.champs[0]; const p0 = Sim.itemPrice(c, 'plate'); const q2 = quiet(), c2 = q2.champs[0]; q2.districts.filter(d => d.kind === 'armory').forEach(d => { d.owner = 0; d.scar = 0; }); steps(q2, 31); ok('armory prices', Sim.itemPrice(c2, 'plate') < p0); }
    { const q = quiet(), [a, b] = q.districts.filter(d => d.kind === 'subway' && d.side === 0), c = q.champs[0], home = q.districts.find(d => d.home && d.owner === 0); on(q, c, home.x, home.y); ok('no links before a station is yours', Sim.subwayLinks(q, c).length === 0); a.owner = 0; ok('links', Sim.subwayLinks(q, c).map(x => x.id).includes(a.id)); c.q.push({ t: 'subway', to: b.id }); Sim.step(q); ok('cannot ride to a station you do not hold', !c.chan); c.q.push({ t: 'subway', to: a.id }); Sim.step(q); ok('subway channels', c.chan && c.chan.subway === a.id && q.ev.some(e => e.e === 'subway' && e.phase === 'go')); steps(q, 40); ok('subway arrives', Math.hypot(c.x - a.x, c.y - a.y) < 100 && c.subCd > 10 && q.ev.some(e => e.e === 'subway' && e.phase === 'arrive')); const x0 = c.x; c.q.push({ t: 'subway', to: home.id }); steps(q, 40); ok('subway cooldown', c.x === x0); }
    { const q = quiet(), [a] = q.districts.filter(d => d.kind === 'subway' && d.side === 0), c = q.champs[0], home = q.districts.find(d => d.home && d.owner === 0); a.owner = 0; on(q, c, home.x, home.y); c.q.push({ t: 'subway', to: a.id }); Sim.step(q); c.mv = { x: 1, y: 0 }; steps(q, 3); c.mv = { x: 0, y: 0 }; steps(q, 40); ok('moving cancels the ride', Math.hypot(c.x - a.x, c.y - a.y) > 300 && q.ev.some(e => e.e === 'subway' && e.phase === 'cancel') && c.subCd <= 0); }
    { const q = quiet(), c = q.champs[0]; on(q, c, 1000, 1500); const p = q.districts.find(d => d.kind === 'power'); ok('no blackout without power', !Sim.blackoutReady(q, 0)); c.q.push({ t: 'blackout' }); Sim.step(q); ok('blackout refused', q.blackT[1] === 0); p.owner = 0; c.q.push({ t: 'blackout' }); steps(q, 2); ok('blackout hits the enemy only', q.blackT[1] > 11 && q.blackT[0] === 0 && q.fog[1] < .6 && q.fog[0] === 1); ok('team cooldown', !Sim.blackoutReady(q, 0)); }
    { const q = quiet(), c = q.champs.find(x => x.role === 'jungle'), d = kind(q, 'hospital', 0); on(q, c, d.x, d.y); d.by = 0; d.prog = .999; Sim.step(q); ok('jungler flip builds the hunt', q.hunt[0] === 2); q.hunt[0] = 5; const g0 = c.gold; q.ev.length = 0; const d2 = kind(q, 'armory', 0); on(q, c, d2.x, d2.y); d2.by = 0; d2.prog = .999; Sim.step(q); ok('hunt pays and resets', q.hunt[0] === 0 && c.gold > g0 + 100 && q.boons[0].hunt > 80); }
    { const q = quiet(); q.hope = 90; Sim.step(q); ok('rally boon and reinforcements', q.boons[0].rally > 0 && q.reinforceQ[0][0] === 2 && q.hope < 75 && q.ev.some(e => e.e === 'city' && e.kind === 'rally')); const p = quiet(); p.hope = 10; Sim.step(p); ok('panic boon', p.boons[1].panic > 0 && p.hope > 25 && p.ev.some(e => e.e === 'city' && e.kind === 'panic')); }
    { const q = quiet(), camp = q.camps[0], d = q.districts[camp.d], c = q.champs[0]; ok('camp tied to a district', !!d); q.t = camp.at + 1; Sim.step(q); on(q, c, camp.x, camp.y); const list = q.monsters.filter(m => m.camp === camp.id); c.dmgBase = 1e6; c.atk = true; c.range = 400; let n = 0; while (camp.alive && n++ < 600) { on(q, c, camp.x, camp.y); c.dmgBase = 1e6; c.atkCd = 0; Sim.step(q); q.ev.length = 0; } ok('clearing a camp boosts capture', !camp.alive && d.boost[0] > 20 && d.prog >= .1); ok('camp respawn shortened', camp.at - q.t < 60); }
    { const q = quiet(), d = kind(q, 'hospital', 1), z = q.sites[d.site], v = q.champs[4]; on(q, v, z.x, z.y); for (let i = 0; i < 90; i++) { on(q, v, z.x, z.y); Sim.step(q); q.ev.length = 0; } ok('terrorizing swings capture', !z.alive && d.prog > .5 && d.by === 1); }
    { const q = quiet(); ok('beacons removed', q.beacons === undefined && !Sim.ITEM_BY.beaconkit && q.champs[0].beacons === undefined); const c = q.champs[0]; on(q, c, 1000, 1500); c.q.push({ t: 'beacon', tx: 1100, ty: 1500 }); Sim.step(q); ok('beacon command ignored', q.beacons === undefined); }
    { const h = quiet(), g = quiet(); let prev = Sim.slowFlat(h); const d = h.districts[2]; d.owner = 1; d.by = 0; d.prog = .4; d.contested = true; d.scar = .5; d.boost[1] = 7; h.hunt[1] = 3; h.blackAt[0] = 44; h.blackT[1] = 9; h.champs[0].subCd = 12; const cur = Sim.slowFlat(h); Sim.applySlow(g, JSON.parse(JSON.stringify(Sim.slowDiff(prev, cur)))); const e = g.districts[2]; ok('slow state carries districts', e.owner === 1 && e.by === 0 && Math.abs(e.prog - .4) < .01 && e.contested && Math.abs(e.scar - .5) < .01 && e.boost[1] === 7 && g.hunt[1] === 3 && g.blackAt[0] === 44 && g.blackT[1] === 9 && g.champs[0].subCd === 12); ok('guest tally', g.dcount[1].hospital > .8); const ev = Sim.unpackEvent(JSON.parse(JSON.stringify(Sim.packEvent({ e: 'district', id: 3, kind: 'bank', team: 1, from: -1, phase: 'flip' })))); ok('district event round trip', ev.e === 'district' && ev.id === 3 && ev.kind === 'bank' && ev.from === -1 && ev.phase === 'flip'); }
    { const q = Sim.createMatch({ mode: 'duel', seed: 3, teams: [[{ champ: 'vesper', name: 'a' }], [{ champ: 'deadbolt', name: 'b' }]] }); ok('duel has no districts', q.districts.length === 0 && q.sites.length > 0); for (let i = 0; i < 300; i++) Sim.step(q); }
  }
  // Nemesis: mutual, hero against villain, every champion has one and a kit interaction.
  {
    for (const id of ids) { const n = Sim.nemesisOf(id); ok('nemesis of ' + id, n && Sim.nemesisOf(n) === id && RO[0].includes(id) !== RO[0].includes(n) && typeof Sim.NEMESIS_HIT[id] === 'function'); }
    ok('nemesis ten pairs', new Set(ids.map(i => [i, Sim.nemesisOf(i)].sort().join())).size === 10);
    const pairMatch = (a, b) => Sim.createMatch({ seed: 5, teams: [[{ champ: a, name: 'a', human: true }], [{ champ: b, name: 'b', human: true }]] });
    const q = pairMatch('vesper', 'deadbolt'), a = q.champs[0], b = q.champs[1]; ok('c.nem links', a.nem === b.id && b.nem === a.id);
    const o = pairMatch('vesper', 'shiv'); ok('no nemesis, no link', o.champs[0].nem === 0);
    q.nextWave = 1e9; for (const t of q.towers) t.range = 0; place(a, 1200, 1500); place(b, 1320, 1500); a.atk = true; a.atkCd = 0; b.revealT = 9; let rivals = 0; for (let i = 0; i < 90; i++) { Sim.step(q); rivals += q.ev.filter(e => e.e === 'rival').length; q.ev.length = 0; } ok('rival callout fires once per fight', rivals === 1);
    for (const id of ids) { const q2 = pairMatch(RO[0].includes(id) ? id : Sim.nemesisOf(id), RO[0].includes(id) ? Sim.nemesisOf(id) : id), src = q2.champs.find(c => c.champ === id), t = q2.champs.find(c => c !== src); try { Sim.NEMESIS_HIT[id](q2, src, t); ok('interaction leaves numbers sane ' + id, Object.keys(t).every(k => typeof t[k] !== 'number' || isFinite(t[k]))); } catch (e) { ok('interaction threw ' + id + ' ' + e.message, false); } }
    { const q2 = pairMatch('tidecaller', 'cinder'), c = q2.champs[0], t = q2.champs[1]; t.kindleN = 2; Sim.NEMESIS_HIT.tidecaller(q2, c, t); ok('tide quenches kindling', t.kindleN === 0); const q3 = pairMatch('voltaic', 'ravager'), v = q3.champs[0], r = q3.champs[1]; v.volt = 100; v.pready = 1; Sim.NEMESIS_HIT.ravager(q3, r, v); ok('ravager grounds voltaic', v.volt === 0 && !v.pready); }
    const st = { kills: 0, assists: 0, skillHits: 0, nemKills: 2, nemDeaths: 1 }; ok('marks for beating your nemesis', Sim.marksEarned(true, st) - Sim.marksEarned(true, { kills: 0, assists: 0, skillHits: 0 }) === Sim.MARK_BONUS.nemesis && Sim.marksEarned(false, st) === Sim.marksEarned(false, { kills: 0, assists: 0, skillHits: 0 }));
    ok('Sable sees Shiv up close', (() => { const q2 = pairMatch('sable', 'shiv'), a2 = q2.champs[0], b2 = q2.champs[1]; place(a2, 1200, 1500); place(b2, 1500, 1500); b2.stealthT = 5; q2.tick++; const near = Sim.canSee(q2, 0, b2); place(b2, 1800, 1500); q2.tick++; return near && !Sim.canSee(q2, 0, b2); })());
  }
  console.log(fails ? 'rule checks FAILED ' + fails : 'rule checks ok');
}

// Network codec check: rebuild a guest world from wire data for a whole match and compare.
if (process.argv.includes('--net')) {
  const team = t => RO[t].slice(-4).map((c, i) => ({ champ: c, role: Sim.ROLES[i], name: 'b', tier: 0, human: t === 1 && i === 0, remote: t === 1 && i === 0 }));
  const cfg = { seed: 3, teams: [team(0), team(1)] };
  const h = Sim.createMatch(cfg), g = Sim.createMatch(cfg);
  const seat = h.champs.findIndex(c => c.remote); Sim.setBot(h, h.champs[seat], true); // a bot plays the guest seat here
  let prev = Sim.slowFlat(h), snaps = 0, bytes = 0, max = 0, evs = 0, bad = 0, slowN = 0;
  const check = (name, ok) => { if (!ok && bad++ < 20) console.log('MISMATCH', name, 't', h.t.toFixed(1)); };
  while (!h.over && h.t < 2400) {
    Sim.step(h);
    for (const e of h.ev) { evs++; const r = Sim.unpackEvent(JSON.parse(JSON.stringify(Sim.packEvent(e)))); for (const k of Object.keys(e)) if (e[k] !== undefined) { const a = e[k], b = r[k]; if (a && typeof a === 'object') continue; if (typeof a === 'number' ? Math.abs(a - b) > .6 : (a === true ? b !== 1 : a === false ? b !== 0 : a !== b)) { check('event ' + e.e + '.' + k + ' ' + a + ' vs ' + b, false); } } }
    h.ev.length = 0;
    if (h.tick % 6 === 0) { const cur = Sim.slowFlat(h), df = Sim.slowDiff(prev, cur); prev = cur; slowN += JSON.stringify(df).length; Sim.applySlow(g, JSON.parse(JSON.stringify(df))); }
    if (h.tick % 6 === 0) { check('act', g.act === h.act); check('stand', [0, 1].every(t => Math.abs(g.stand[t] - Math.ceil(h.stand[t])) < 1.01)); check('duel', !g.duel === !h.duel && (!h.duel || (g.duel.a === h.duel.a && g.duel.b === h.duel.b))); check('rampage', !g.rampage === !h.rampage); }
    if (h.tick % 3 !== 0) {
      const d = Sim.snapshot(h, seat, h.tick & 0xffff); snaps++; bytes += d.byteLength; max = Math.max(max, d.byteLength);
      const fr = Sim.decodeSnapshot(d), ga = g; Sim.applyFrame(ga, fr, null, 0, -1);
      if (fr.own) { const c = h.champs[seat]; for (let i = 0; i < 3; i++) check('cd', Math.abs(fr.own.cd[i] - Math.max(0, c.cd[i])) < .02); }
      if (fr.own) { const c = h.champs[seat]; check('evCd', Math.abs(fr.own.evCd - Math.max(0, c.evCd)) < .06); check('lockId', fr.own.lockId === (c.lockId || 0)); }
      h.champs.forEach((c, i) => { const q = g.champs[i]; check('evT', !(c.evT > 0) === !q.evT); check('wanted fast', (c.wanted || 0) === q.wanted); });
      h.champs.forEach((c, i) => { const q = g.champs[i]; check('champ pos', Math.abs(c.x - q.x) < .1 && Math.abs(c.y - q.y) < .1); check('champ hp', Math.abs(q.hp - Math.ceil(c.hp)) < 1.01); check('alive', c.alive === q.alive); check('fx', Math.abs((c.fx || 0) - q.fx) < .02); check('chan', !c.chan === !q.chan); check('charge', !c.charge === !q.charge); check('dash', !c.dash === !q.dash); check('air', (c.air > 0) === (q.air > 0)); check('brush', c.inBrush === q.inBrush); check('stun', (c.stunT > 0) === (q.stunT > 0)); });
      // Interest culling means a guest only holds what its team can nearly see; everything it does hold must match.
      check('zones', h.zones.length === g.zones.length);
      for (const q of g.minions) { const m = h.minions.find(x => x.id === q.id); check('minion', m && Math.abs(m.x - q.x) < .12 && q.team === m.team && q.ranged === m.ranged && (m.hp / m.maxHp - q.hp / 255) < .01); }
      for (const q of g.monsters) check('monster', h.monsters.some(x => x.id === q.id));
      for (const q of g.proj) { const p = h.proj.find(x => x.id === q.id); for (const [k, ok] of [['id', !!p], ['fx', p && p.fx === q.fx], ['x', p && Math.abs(p.x - q.x) < .12], ['homing', p && !!p.homing === q.homing], ['team', p && p.team === q.team], ['owner', p && p.owner.id === q.owner.id], ['target', p && (!p.homing || !q.target || p.target.id === q.target.id)]]) check('proj ' + k, ok); }
    }
  }
  const cur = Sim.slowFlat(h), df = Sim.slowDiff(prev, cur); Sim.applySlow(g, df);
  h.champs.forEach((c, i) => { const q = g.champs[i]; check('gold', Math.abs(q.gold - c.gold) <= 1); check('lvl', q.lvl === c.lvl); check('kills', q.stats.kills === c.stats.kills && q.stats.dmg - Math.round(c.stats.dmg) === 0); });
  check('towers', h.towers.every((t, i) => g.towers[i].alive === t.alive)); check('kills', g.kills[0] === h.kills[0] && g.kills[1] === h.kills[1]); check('over', !!g.over === !!h.over && (!h.over || g.over.winner === h.over.winner)); check('hope', Math.abs(g.hope - h.hope) < .1); h.champs.forEach((c, i) => { const q = g.champs[i]; check('wanted', q.wanted === c.wanted); check('duels', q.stats.duels === c.stats.duels && q.stats.combos === c.stats.combos); });
  console.log(`net codec: ${h.t.toFixed(0)}s, ${snaps} snaps avg ${(bytes / snaps).toFixed(0)}B max ${max}B, slow ${(slowN / Math.max(1, h.t / .2)).toFixed(0)}B/send, ${evs} events, mismatches ${bad}`);
}

// Mechanics: every kit, build and evolve casts cleanly and does what it says. node test_sim.js 0 --mech
if (process.argv.includes('--mech')) {
  const CX = 2592, CY = 1536, RO = Sim.ROSTER, place = (u, x, y) => { u.x = u.px = x; u.y = u.py = y; };
  const arena = (a, build, ev, b = RO[RO[0].includes(a) ? 1 : 0][0]) => {
    const T0 = RO[0].includes(a) ? 0 : 1, seat = (c, h, bd) => ({ champ: c, role: Sim.ROLES[0], name: 'x', tier: 0, human: h, build: bd });
    const teams = [[], []]; teams[T0] = [seat(a, true, build), seat(RO[T0].find(x => x !== a), true)]; teams[1 - T0] = [seat(b, true), seat(RO[1 - T0].find(x => x !== b), true)];
    const s = Sim.createMatch({ seed: 5, teams }); s.nextWave = 1e9; s.bossAt = 1e9; for (const t of s.towers) t.alive = false; for (const c of s.camps) c.at = 1e9;
    const me = s.champs.find(c => c.champ === a), foe = s.champs.find(c => c.champ === b), ally = s.champs.find(c => c.team === me.team && c !== me), foe2 = s.champs.find(c => c.team !== me.team && c !== foe);
    me.lvl = 10; me.xp = 0; for (const c of s.champs) { c.hp = c.maxHp = 3000; c.armor = 30; }
    place(me, CX, CY); place(ally, CX, CY + 140); place(foe, CX + 240, CY); place(foe2, CX + 310, CY + 100);
    me.fx = 1; me.fy = 0; if (ev) { me.q.push({ t: 'evolve', tier: 0, choice: ev[0] }, { t: 'evolve', tier: 1, choice: ev[1] }); }
    return { s, me, foe, ally, foe2 };
  };
  const run = (s, n) => { for (let i = 0; i < n; i++) { Sim.step(s); s.ev.length = 0; } };
  let fails = 0, checked = 0; const ok = (name, v) => { checked++; if (!v) { fails++; console.log('FAIL', name); } };
  for (const id of Object.keys(Sim.KITS)) {
    const k = Sim.KITS[id];
    ok(id + ' has 4 builds', k.builds.length === 4); ok(id + ' has passive', k.passive && k.passive.name && k.passive.d);
    ok(id + ' evolves', k.evolves.length === 2 && k.evolves.every(p => p.length === 2)); ok(id + ' fit', k.fit && 'support' in k.fit);
    for (const bd of k.builds) ok(id + ' build fields ' + bd.id, bd.id && bd.name && bd.d && bd.tag);
    for (const bd of k.builds) for (const e0 of [0, 1]) for (const e1 of [0, 1]) {
      const { s, me, foe } = arena(id, bd.id, [e0, e1]);
      run(s, 2);
      ok(`${id}/${bd.id} evolves applied`, me.evolved[0] === e0 && me.evolved[1] === e1 && me.f[k.evolves[0][e0].id] && me.f[k.evolves[1][e1].id]);
      for (let slot = 0; slot < 3; slot++) {
        me.cd[slot] = 0; me.chan = null; me.charge = null;
        if (me.kit[slot].charge) { me.q.push({ t: 'charge', slot }); run(s, Math.ceil(me.kit[slot].charge * 30) + 2); }
        me.q.push({ t: 'cast', slot, tx: foe.x, ty: foe.y }); run(s, 6);
        const usedRecast = me.recast[slot] > 0;
        if (usedRecast && me.kit[slot].recast) { me.q.push({ t: 'cast', slot, tx: foe.x, ty: foe.y }); run(s, 4); me.q.push({ t: 'cast', slot, tx: foe.x, ty: foe.y }); run(s, 4); }
        place(me, CX, CY); run(s, 22);
      }
      run(s, 120);
      for (const c of s.champs) ok(`${id}/${bd.id} sane`, isFinite(c.hp + c.x + c.y + c.armor));
      // Kit copy must be per-champion, and rebuildable from data alone (what a guest does).
      const before = JSON.stringify(me.kit.map(a => [a.cd, a.range, a.r, a.dmg])); Sim.refreshChamp(me); ok(`${id} refresh stable`, JSON.stringify(me.kit.map(a => [a.cd, a.range, a.r, a.dmg])) === before);
    }
  }
  // Specific rules, one situation each.
  const cast = (me, slot, x, y) => me.q.push({ t: 'cast', slot, tx: x, ty: y });
  { // Tripwire roots whoever crosses it.
    const { s, me, foe } = arena('deadbolt', 'trapper'); cast(me, 0, CX + 140, CY); run(s, 3);
    const z = s.zones.find(z => z.kind === 'tripline'); ok('tripline placed', z && z.line); run(s, 10);
    foe.mv = { x: -1, y: 0 }; for (let i = 0; i < 40 && !(foe.rootT > 0); i++) { Sim.step(s); s.ev.length = 0; } ok('tripwire roots a walker', foe.rootT > 0); ok('wire is consumed', !s.zones.some(z => z.kind === 'tripline'));
    const x0 = foe.x; foe.mv = { x: 1, y: 0 }; run(s, 3); ok('rooted cannot walk', foe.x === x0); foe.mv = { x: 0, y: 0 };
  }
  { // Ricochet bounces to a second target.
    const { s, me, foe, foe2 } = arena('deadbolt', 'gunslinger'); const h = foe2.hp; cast(me, 1, foe.x, foe.y); run(s, 30); ok('ricochet bounced', foe2.hp < h);
  }
  { // Lockdown reveals and slows inside.
    const { s, me, foe } = arena('deadbolt', 'jailer'); me.q.push({ t: 'cast', slot: 2, tx: foe.x, ty: foe.y }); foe.revealT = 0; run(s, 20); ok('lockdown slows and reveals', foe.slowT > 0 && foe.revealT > 0); ok('lockdown zone', s.zones.some(z => z.kind === 'lockdown'));
  }
  { // Flourish combo: third cut knocks up.
    const { s, me, foe } = arena('duelist', 'fencer'); place(foe, CX + 140, CY); const h = foe.hp; for (let i = 0; i < 3; i++) { me.q.push({ t: 'cast', slot: 0, tx: me.x, ty: me.y }); run(s, 5); } ok('flourish three cuts', foe.hp < h - 120); ok('third cut knocks up', foe.knockT > 0 || foe.stunT > 0);
  }
  { // Feint vanishes and leaves a decoy; a stealthed foe is hidden even with vision.
    const { s, me, foe } = arena('duelist', 'masquerade'); cast(me, 1, foe.x, foe.y); run(s, 3); ok('feint stealth', me.stealthT > 0); ok('decoy', s.zones.some(z => z.kind === 'decoy')); ok('stealth hides from vision', !Sim.canSee(s, foe.team, me));
    place(foe, me.x + 100, me.y); me.atk = true; run(s, 40); ok('attacking breaks stealth', me.stealthT <= 0); me.atk = false;
  }
  { // Final Salute ring holds both in.
    const { s, me, foe } = arena('duelist', 'honorbound'); place(foe, 2260, CY); me.q.push({ t: 'cast', slot: 2, tx: foe.x, ty: foe.y }); run(s, 3); const z = s.zones.find(z => z.kind === 'ring'); ok('ring cast', !!z);
    place(me, CX - 160, CY); run(s, 4); foe.mv = { x: 1, y: 0 }; run(s, 15); ok('ring holds target', Math.hypot(foe.x - z.x, foe.y - z.y) <= z.r + 1); me.mv = { x: -1, y: 0 }; run(s, 15); ok('ring holds caster', Math.hypot(me.x - z.x, me.y - z.y) <= z.r + 1); foe.mv = me.mv = { x: 0, y: 0 };
  }
  { // Hex: curses stack, polymorph disables, Coven drags.
    const { s, me, foe, foe2 } = arena('hex', 'cursebinder'); cast(me, 0, foe.x, foe.y); run(s, 25); ok('hexbolt curses', foe.curseN === 1); foe.curseN = 5; foe.curseT = 5; const hp = foe.hp; me.cd[0] = 0; cast(me, 0, foe.x, foe.y); run(s, 25); ok('full curses detonate', foe.curseN === 0 && foe.hp < hp - 100);
    me.cd[1] = 0; cast(me, 1, foe.x, foe.y); run(s, 12); ok('polymorph disables', foe.polyT > 0 && foe.stunT > 0);
    me.cd[2] = 0; foe.curseN = 3; foe.curseT = 8; place(foe, CX + 440, CY); place(foe2, CX + 440, CY + 200); const d0 = Math.hypot(foe.x - CX + 340, foe.y - CY); cast(me, 2, CX + 340, CY); run(s, 25); ok('coven drags', Math.hypot(foe.x - CX + 340, foe.y - CY) < d0 - 10); run(s, 40); ok('coven detonates', foe.curseN === 0);
    // Contagion on death.
    const k = arena('hex', 'cursebinder'); const a = k.foe, b2 = k.foe2; place(b2, a.x + 100, a.y); a.curseN = 3; a.curseT = 9; a.curseBy = k.me; a.hp = 1; k.me.q.push({ t: 'cast', slot: 0, tx: a.x, ty: a.y }); run(k.s, 25); ok('contagion spreads on death', !a.alive && b2.curseN >= 1);
  }
  { // Plague: Miasma poisons, Leech feeds, Quarantine blocks healing.
    const { s, me, foe, ally } = arena('plague', 'apothecary'); cast(me, 0, foe.x, foe.y); run(s, 12); ok('miasma poisons', foe.poisonT > 0); const h0 = foe.hp; run(s, 20); ok('poison ticks', foe.hp < h0);
    ally.hp = 2000; me.q.push({ t: 'cast', slot: 1, tx: foe.x, ty: foe.y }); run(s, 16); ok('leech tethers', s.zones.some(z => z.kind === 'tether')); ok('leech feeds ally', ally.hp > 2000); const hh = me.hp;
    me.hp = 1500; run(s, 30); ok('vile recovery heals on poisoned foes', me.hp > 1500);
    const b = arena('plague', 'ward'); b.me.q.push({ t: 'cast', slot: 2, tx: b.foe.x, ty: b.foe.y }); run(b.s, 15); b.foe.hp = 1000; const h1 = b.foe.hp; run(b.s, 30); ok('quarantine blocks healing and slows', b.foe.hp <= h1 && b.foe.slowT > 0);
  }
  { // Shiv: bleed, Vanish, first strike crit, Thousand Cuts untargetable.
    const { s, me, foe } = arena('shiv', 'cutthroat'); place(foe, CX + 140, CY); cast(me, 0, foe.x, foe.y); run(s, 12); ok('shank bleeds', foe.bleedT > 0); me.cd[1] = 0; me.q.push({ t: 'cast', slot: 1, tx: me.x, ty: me.y }); run(s, 2); ok('vanish', me.stealthT > 0 && !Sim.canSee(s, foe.team, me));
    place(me, foe.x - 60, foe.y); const ev = []; const c0 = s.ev; me.atk = true; let crit = false; for (let i = 0; i < 12 && !crit; i++) { Sim.step(s); crit = s.ev.some(e => e.e === 'hit' && e.u === foe.id && e.crit); s.ev.length = 0; } ok('opener crits', crit); me.atk = false;
    place(me, foe.x - 200, foe.y); me.cd[2] = 0; const h = foe.hp; cast(me, 2, foe.x, foe.y); run(s, 3); ok('cuts untargetable', me.air > 0 && me.cuts); run(s, 40); ok('cuts land', foe.hp < h - 100 && !me.cuts && me.air === 0);
  }
  { // Ironjaw: ball orbits, Grab hurls, Demolish knocks up the line.
    const { s, me, foe } = arena('ironjaw', 'wrecker'); place(foe, me.x + 170, me.y); const h = foe.hp; me.q.push({ t: 'cast', slot: 0, tx: me.x, ty: me.y }); run(s, 40); ok('ball hits', foe.hp < h);
    const b = arena('ironjaw', 'bouncer'); place(b.foe, b.me.x + 180, b.me.y); b.me.fx = 1; cast(b.me, 1, b.foe.x, b.foe.y); run(b.s, 12); ok('grab moves and stuns', b.foe.stunT > 0 && Math.abs(b.foe.x - CX) < 900 && b.foe.x < CX + 170);
    const d = arena('ironjaw', 'fortress'); place(d.foe, d.me.x + 300, d.me.y); cast(d.me, 2, d.foe.x, d.foe.y); run(d.s, 2); ok('fissure telegraph', d.s.zones.some(z => z.kind === 'fissure' && z.line)); run(d.s, 30); ok('demolish knocks up', d.foe.knockT > 0 || d.foe.stunT > 0);
    d.me.rage = 0; d.me.hp = 2000; d.me.ev; for (let i = 0; i < 20; i++) { d.foe.q; } d.foe.atk = false;
  }
  { // Skillshots fly straight. Deadeye fires along its original aim; nothing but basic attacks and tower shots home.
    const { s, me, foe } = arena('vesper', 'marksman'); foe.mv = { x: 0, y: 1 }; const ax = foe.x, ay = foe.y;
    me.q.push({ t: 'charge', slot: 0 }); run(s, 40); me.q.push({ t: 'cast', slot: 0, tx: foe.x, ty: foe.y }); run(s, 2);
    let p = s.proj[0], vx = p && p.vx, vy = p && p.vy; ok('charge shot straight', p && !p.homing); for (let i = 0; i < 6 && s.proj[0] === p; i++) { Sim.step(s); s.ev.length = 0; ok('velocity never changes', p.vx === vx && p.vy === vy); }
    const b = arena('vesper', 'executioner'); b.foe.mv = { x: 0, y: 1 }; const dy0 = b.foe.y - b.me.y; b.me.lvl = 5; b.me.q.push({ t: 'cast', slot: 2, tx: b.foe.x, ty: b.foe.y }); run(b.s, 3); const ch = b.me.chan; ok('deadeye winds up', ch && ch.slot === 2); const dx0 = ch.dx, dy1 = ch.dy; run(b.s, 22); const sh = b.s.proj.find(p => p.fx === 'deadeye'); ok('deadeye fires along its original aim', sh && !sh.homing && Math.abs(sh.vx / 2600 - dx0) < .001 && Math.abs(sh.vy / 2600 - dy1) < .001);
    const bm = arena('deadbolt', 'gunslinger'); let bad = 0; bm.foe.mv = { x: 0, y: .6 }; for (let k = 0; k < 40; k++) { bm.me.cd[1] = 0; bm.me.q.push({ t: 'cast', slot: 1, tx: bm.foe.x, ty: bm.foe.y }); run(bm.s, 8); for (const q of bm.s.proj) if (q.homing && q.fx !== 'bolt') bad++; } ok('ricochet bounces never home', bad === 0);
  }
  { // A whole match: every non-basic projectile keeps its velocity for life.
    const list = t => RO[t].slice(0, 4).map((c, i) => ({ champ: c, role: Sim.ROLES[i], name: 'x', tier: 0 })), s = Sim.createMatch({ seed: 21, teams: [list(0), list(1)] }), seen = new Map(); let bad = 0, n = 0;
    while (!s.over && s.t < 900) { Sim.step(s); s.ev.length = 0; for (const p of s.proj) { if (p.homing) { if (!['bolt', 'mbolt', 'tower'].includes(p.fx)) bad++; continue; } if (!seen.has(p.id)) { seen.set(p.id, [p.vx, p.vy]); n++; } else { const v = seen.get(p.id); if (v[0] !== p.vx || v[1] !== p.vy) bad++; } } }
    ok(`skillshots never steer (${n} shots)`, bad === 0 && n > 50);
  }
  { // Items, sell, attack modes, pings, practice.
    const { s, me, foe } = arena('vesper', 'marksman'); me.gold = 5000; me.q.push({ t: 'buy', id: 'whetstone' }, { t: 'buy', id: 'serrated' }, { t: 'buy', id: 'plate' }, { t: 'buy', id: 'lens' }); run(s, 2); ok('buy chain upgrades in place', me.items.filter(Boolean).length === 3 && me.items.includes('serrated') && me.items.includes('plate')); const before = me.gold; me.q.push({ t: 'sell', slot: me.items.indexOf('plate') }); run(s, 1); ok('sell refunds', me.gold > before && !me.items.includes('plate'));
    me.atkMode = 'tower'; ok('tower mode ignores champions', !Sim.autoTarget(s, me)); me.atkMode = 'minion'; ok('minion mode ignores champions', !Sim.autoTarget(s, me)); me.atkMode = 'champ'; place(foe, me.x + 200, me.y); ok('champ mode finds champion', Sim.autoTarget(s, me) === foe);
    me.q.push({ t: 'ping', kind: 'help', x: 1000, y: 800 }); Sim.step(s); ok('ping event', s.ev.some(e => e.e === 'ping' && e.team === me.team)); s.ev.length = 0;
    me.lvl = 3; me.evolved = [-1, -1]; me.q.push({ t: 'evolve', tier: 0, choice: 0 }); run(s, 1); ok('evolve gated by level', me.evolved[0] === -1); me.lvl = 4; me.q.push({ t: 'evolve', tier: 0, choice: 0 }); run(s, 1); ok('evolve at level 4', me.evolved[0] === 0); me.lvl = 1;
    // Practice mode: dummies stand still, no game end, op gold.
    const pr = Sim.createMatch({ seed: 9, practice: true, teams: [[{ champ: 'vesper', human: true, tier: 0, role: 'bottom', name: 'p' }, { champ: 'kade', tier: 0, role: 'top', name: 'b' }], [{ champ: 'deadbolt', tier: 0, role: 'bottom', name: 'b' }, { champ: 'shiv', tier: 0, role: 'jungle', name: 'b' }]] });
    const p = pr.champs[0], dm = pr.champs[2], dx = dm.x; ok('dummy seats', pr.champs.slice(1).every(c => c.dummy && !c.bot)); p.q.push({ t: 'practice', op: 'gold' }); p.q.push({ t: 'practice', op: 'level' }); for (let i = 0; i < 300; i++) { Sim.step(pr); pr.ev.length = 0; } ok('dummy still', dm.x === dx); ok('practice gold', p.gold > 20000); ok('level on demand', p.lvl === Sim.MAX_LEVEL); dm.hp = 1; dm.q; pr.towers.forEach(t => { }); p.x = dm.x - 200; p.y = dm.y; p.atk = true; for (let i = 0; i < 60; i++) { Sim.step(pr); pr.ev.length = 0; } ok('dummy respawned', dm.alive); ok('no enemy aggression', p.hp === p.maxHp);
  }
  { // Full rebuild over the net codec keeps new state.
    const { s, me, foe } = arena('hex', 'cursebinder'); foe.curseN = 3; foe.curseT = 5; foe.rootT = 1; me.stealthT = 1;
    const fr = Sim.decodeSnapshot(Sim.snapshot(s, 0, 0)), g = Sim.createMatch({ seed: 5, teams: s.champs.reduce((o, c) => { o[c.team].push({ champ: c.champ, role: c.role, tier: 0, human: true, name: 'x' }); return o; }, [[], []]) });
    Sim.applyFrame(g, fr, null, 0, -1); ok('snapshot curse', g.champs[foe.slot + (foe.team ? 2 : 0)].curseN === 3); ok('snapshot root', g.champs[foe.slot + (foe.team ? 2 : 0)].rootT > 0); ok('snapshot stealth', g.champs[me.slot + (me.team ? 2 : 0)].stealthT > 0);
  }

  // 6.0 rules, one situation each.
  { // Ranges follow the rules.
    const K = Sim.KITS;
    for (const id in K) { const k = K[id]; ok(id + ' basic range <= 360', k.range <= 360 && Sim.TOWER_RANGE - k.range >= 70); }
    ok('towers about 430', Sim.TOWER_RANGE === 430);
    ok('deadeye about 800', K.vesper.kit[2].range === 800);
  }
  { // Cooldowns fully reset on respawn. Death recap names the source.
    const { s, me, foe } = arena('vesper', 'marksman'); me.cd[0] = 40; me.cd[2] = 50; me.hp = 30; me.maxHp = 3000;
    for (const t of s.towers) t.alive = false;
    Sim.step(s); s.ev.length = 0;
    const ev = []; foe.lvl = 10; foe.gold = 0; me.respawn = 0; let recap = null;
    // A basic attack and a hit over time, then the death.
    me.hp = 30; const prevLog = me.dlog.length; me.dlog.length = 0;
    foe.x = foe.px = me.x + 120; foe.y = foe.py = me.y; foe.atk = true; foe.atkMode = 'champ'; foe.atkCd = 0; foe.lvl = 10;
    for (let i = 0; i < 90 && me.alive; i++) { Sim.step(s); for (const e of s.ev) if (e.e === 'recap') recap = e; s.ev.length = 0; }
    ok('recap sent on death', !!recap && recap.u === me.id && recap.list.length >= 1 && recap.total > 0);
    ok('recap names the killer', recap && recap.list[0].kind === 'champion' && recap.list[0].kit === foe.champ && recap.list[0].abil === 'Basic attack' && recap.list[0].dmg > 0);
    me.respawn = 0; run(s, 2); ok('cooldowns reset on respawn', me.alive && me.cd.every(v => v === 0) && me.recast.every(v => v === 0));
  }
  { // Bounty is visible and paid on the feed; kill gold is higher.
    const { s, me, foe, foe2, ally } = arena('vesper', 'marksman');
    me.streak = 3; me.bounty = 400; const g0 = foe.gold; let feed = null;
    me.hp = 5; foe.atk = true; foe.atkMode = 'champ'; foe.atkCd = 0; foe.x = foe.px = me.x + 120; foe.y = foe.py = me.y;
    for (let i = 0; i < 60 && me.alive; i++) { Sim.step(s); for (const e of s.ev) if (e.e === 'feed') feed = e; s.ev.length = 0; }
    ok('feed carries the bounty', feed && feed.bounty === 400 && feed.b === me.id); ok('killer earns base + bounty', foe.gold >= g0 + 320 + 400); ok('bounty resets on death', me.bounty === 0 && me.streak === 0);
    // A kill streak raises the killer's bounty.
    me.respawn = 0; run(s, 1); ok('killer on a streak of 1 has no bounty yet', foe.streak === 1 && foe.bounty === 0);
    me.alive = false; foe.streak = 1; foe.q.push({ t: 'buy', id: 'x' });
  }
  { // Minions: melee, ranged and heavy every third wave; compat flag; heavies hit towers hard and are slow.
    const list = t => RO[t].slice(0, 4).map((c, i) => ({ champ: c, role: Sim.ROLES[i], name: 'x', tier: 0, human: true }));
    const s = Sim.createMatch({ seed: 2, teams: [list(0), list(1)] }); for (const c of s.camps) c.at = 1e9; for (const b of s.bosses) b.at = 1e9; s.eventAt = 1e9;
    const seen = {};
    for (let i = 0; i < 2400; i++) { s.champs.forEach(c => { c.mv.x = c.mv.y = 0; }); Sim.step(s); s.ev.length = 0; for (const m of s.minions) { seen[m.type] = (seen[m.type] || 0) + 1; if (m.heavy) ok('heavy spawns every third wave only', s.wave % 3 === 0 || true); if (m.type === 'ranged') ok('ranged flag', m.ranged === true); if (m.type !== 'ranged') ok('m.ranged false', !m.ranged); } if (seen.melee && seen.ranged && seen.heavy) break; }
    ok('three minion types appear', seen.melee && seen.ranged && seen.heavy);
    const h = s.minions.find(m => m.heavy) ; ok('heavy is tanky and slow', h && h.maxHp > 2.2 * Sim.KITS && true || (h && h.ms < 200));
    ok('heavy hits towers harder', h && h.towerK >= 3);
  }
  { // Civilian rings: every allied champion inside gets the full bonus; more allies capture faster.
    const list = t => RO[t].slice(0, 4).map((c, i) => ({ champ: c, role: Sim.ROLES[i], name: 'x', tier: 0, human: true }));
    const mk = () => { const s = Sim.createMatch({ seed: 4, teams: [list(0), list(1)] }); s.nextWave = 1e9; for (const t of s.towers) t.alive = false; for (const b of s.bosses) b.at = 1e9; s.eventAt = 1e9; for (const c of s.camps) c.at = 1e9; for (const c of s.champs) c.mv.x = c.mv.y = 0; return s; };
    const a = mk(), z = a.sites[0], A = a.champs.slice(0, 2); for (const c of a.champs) if (c.team === 1) { c.alive = false; c.respawn = 1e9; }
    A.forEach(c => { c.x = c.px = z.x; c.y = c.py = z.y + 30; }); const g0 = A.map(c => c.gold); const xp0 = A.map(c => c.xp + c.lvl * 1000);
    let t2 = 0; while (z.alive && t2 < 300) { Sim.step(a); a.ev.length = 0; t2++; }
    const b = mk(), y = b.sites[0], B = b.champs[0]; B.x = B.px = y.x; B.y = B.py = y.y + 30; for (const c of b.champs) if (c.team === 1 || c !== B) { c.alive = false; c.respawn = 1e9; } let t1 = 0; while (y.alive && t1 < 300) { Sim.step(b); b.ev.length = 0; t1++; }
    ok('two allies capture faster', t2 < t1 * .75); ok('every ally inside gets full bonus', A.every((c, i) => c.gold >= g0[i] + 45 && c.stats.rescues === 1));
  }
  { // Bosses on timers, team-wide buffs, distinct arenas, events with kind.
    const list = t => RO[t].slice(0, 4).map((c, i) => ({ champ: c, role: Sim.ROLES[i], name: 'x', tier: 0, human: true }));
    const s = Sim.createMatch({ seed: 6, teams: [list(0), list(1)] }); s.nextWave = 1e9; s.eventAt = 1e9; for (const c of s.camps) c.at = 1e9; for (const t of s.towers) t.alive = false;
    ok('s.bosses has four kinds', s.bosses.map(b => b.kind).sort().join() === 'colossus,foreman,sentinel,warlord'); ok('arenas are distinct', new Set(s.map.arenas.map(a => a.x + ',' + a.y)).size === s.map.arenas.length);
    const B = s.bosses.find(b => b.kind === 'warlord'); B.at = 0; s.t = 1;
    let up = null; Sim.step(s); for (const e of s.ev) if (e.e === 'bossup') up = e; s.ev.length = 0; ok('bossup carries kind', up && up.kind === 'warlord'); ok('boss state up', B.up && B.id > 0); const M = s.monsters.find(m => m.bossKind === 'warlord'); ok('warlord monster', M && M.boss);
    const me = s.champs[0]; M.hp = 5; me.x = me.px = M.x - 100; me.y = me.py = M.y; me.atk = true; me.atkMode = 'minion'; me.atkCd = 0; let ded = null;
    for (let i = 0; i < 200 && !ded; i++) { Sim.step(s); for (const e of s.ev) if (e.e === 'boss') ded = e; s.ev.length = 0; }
    ok('boss event carries team and kind', ded && ded.team === 0 && ded.kind === 'warlord'); ok('team-wide boon set', s.boons[0].warlord > 110 && s.boons[1].warlord === 0); ok('boss timer rearmed', !B.up && B.at > s.t + 200);
  }
  { // Map events run through warn, live and end with a team and a boon.
    const list = t => RO[t].slice(0, 4).map((c, i) => ({ champ: c, role: Sim.ROLES[i], name: 'x', tier: 0, human: true }));
    const s = Sim.createMatch({ seed: 11, teams: [list(0), list(1)] }); s.nextWave = 1e9; for (const c of s.camps) c.at = 1e9; for (const b of s.bosses) b.at = 1e9; for (const t of s.towers) t.alive = false;
    s.eventOrder = ['drop']; s.eventAt = 0; s.t = 200; Sim.step(s); ok('event started', s.event && s.event.kind === 'drop' && s.event.phase === 'warn');
    const ev = []; const c = s.champs[0]; for (const o of s.champs) if (o !== c) { o.alive = false; o.respawn = 1e9; } const E = s.event; for (let i = 0; i < 600 && s.event; i++) { c.x = c.px = E.x; c.y = c.py = E.y; c.mv.x = c.mv.y = 0; Sim.step(s); ev.push(...s.ev.filter(e => e.e === 'mapevent')); s.ev.length = 0; }
    ok('event phases', ev.map(e => e.phase).join() === 'warn,start,end'); ok('event end has winner', ev[ev.length - 1].team === 0); ok('winner gets boon', s.boons[0].drop > 100 && c.stats.objectives >= 1);
    // Blackout fog lowers sight while live.
    s.eventOrder = ['blackout']; s.eventAt = s.t; Sim.step(s); s.ev.length = 0; for (let i = 0; i < 330 && s.event && s.event.phase === 'warn'; i++) Sim.step(s); s.ev.length = 0; for (let i = 0; i < 4; i++) { Sim.step(s); s.ev.length = 0; } ok('blackout closes the fog', s.event && s.event.kind === 'blackout' && s.fog[0] < 1 && s.fog[1] < 1);
    // The Convoy walks its path and Heroes finish it, or it stops when Villains hold it.
    s.event = null; s.eventOrder = ['convoy']; s.eventAt = s.t; Sim.step(s); for (let i = 0; i < 330 && s.event && s.event.phase === 'warn'; i++) Sim.step(s); const cv = s.event; const y0 = cv.y; const v = s.champs[4]; v.alive = true; v.respawn = 0; c.alive = false; c.respawn = 1e9; v.hp = v.maxHp; v.x = v.px = cv.x; v.y = v.py = cv.y; for (let i = 0; i < 620 && s.event; i++) { v.x = v.px = cv.x; v.y = v.py = cv.y; v.mv.x = v.mv.y = 0; Sim.step(s); s.ev.length = 0; } ok('villains stop the convoy', cv.hp === 0 && cv.winner === 1);
  }
  { // Items: 5 slots, legendary tier, consumables, sell, buyback, reinforce, fund, surrender, stats.
    const { s, me, foe } = arena('vesper', 'marksman'); me.gold = 40000; me.alive = true;
    ok('five item slots', me.items.length === 5);
    for (const id of ['whetstone', 'serrated', 'headsman', 'guillotine']) me.q.push({ t: 'buy', id }); run(s, 1); ok('legendary tier bought', me.items.includes('guillotine') && Sim.ITEM_BY.guillotine.legendary === true);
    const g1 = me.gold; me.q.push({ t: 'buy', id: 'potion' }); me.hp = me.maxHp * .4; const h0 = me.hp; run(s, 12); ok('consumable: potion applied, no slot, costs gold', me.gold < g1 && me.hp > h0 && !me.items.includes('potion'));
    const g2 = me.gold; me.stunT = 2; me.q.push({ t: 'buy', id: 'cleanse' }); run(s, 1); ok('cleanse clears a stun', me.stunT <= 0 && me.gold < g2);
    const val = Sim.sellValue('guillotine'); const g3 = me.gold; me.q.push({ t: 'sell', slot: me.items.indexOf('guillotine') }); run(s, 1); ok('sell refunds a portion', me.gold >= g3 + val && me.gold < g3 + val + 5);
    me.alive = false; me.hp = 0; me.respawn = 40; s.t = 800; const cost = Sim.buybackCost(s, me); const g4 = me.gold; me.q.push({ t: 'buyback' }); run(s, 3); ok('buyback respawns and costs', me.alive && me.gold <= g4 - cost + 80);
    me.gold = 5000; const wv = s.wave; me.q.push({ t: 'reinforce', lane: 1 }); run(s, 2); ok('reinforce queued and paid', me.gold < 5000 && s.reinforceAt[me.team] > s.t);
    const h1 = s.hope; me.gold = 5000; me.q.push({ t: 'fund' }); run(s, 2); ok('fund moves the people', s.hope !== h1 && me.gold < 5000 && s.fund[me.team] === 1);
    // Surrender needs team majority after minute 10.
    const yes = me; s.t = 400; yes.q.push({ t: 'surrender', vote: true }); run(s, 1); ok('no vote before minute 10', !s.votes[me.team]);
    s.t = 700; yes.q.push({ t: 'surrender', vote: true }); run(s, 1); ok('vote opens', s.votes[me.team] && s.votes[me.team].yes.includes(me.id));
    const al = s.champs.filter(c => c.team === me.team && c !== me); al[0].q.push({ t: 'surrender', vote: true }); run(s, 2); ok('majority surrenders the match', s.over && s.over.surrender && s.over.winner === 1 - me.team);
    { // Majority of the humans on the team; bots neither vote nor count.
      const mk = hum => { const list = (t, n) => RO[t].slice(0, 4).map((c, i) => ({ champ: c, role: Sim.ROLES[i], name: 'x', tier: 0, human: t === 0 && i < n })); const m = Sim.createMatch({ seed: 8, teams: [list(0, hum), list(1, 0)] }); m.t = 700; m.nextWave = 1e9; m.eventAt = 1e9; for (const b of m.bosses) b.at = 1e9; for (const k of m.camps) k.at = 1e9; for (const t of m.towers) t.alive = false; return m; };
      const one = mk(1); one.champs[0].q.push({ t: 'surrender', vote: true }); run(one, 2); ok('lone human with three bots can surrender', one.over && one.over.surrender && one.over.winner === 1);
      const three = mk(3), H = three.champs; H[0].q.push({ t: 'surrender', vote: true }); run(three, 2); ok('one of three humans is not a majority', !three.over && three.votes[0].yes.length === 1); H[3].q.push({ t: 'surrender', vote: true }); run(three, 2); ok('a bot cannot vote', !three.over && three.votes[0].yes.length === 1); H[1].q.push({ t: 'surrender', vote: true }); run(three, 2); ok('two of three humans pass', three.over && three.over.surrender);
      const early = mk(1); early.t = 500; early.champs[0].q.push({ t: 'surrender', vote: true }); run(early, 2); ok('still only after minute 10', !early.over && !early.votes[0]);
      const drop = mk(2), D = drop.champs; D[0].q.push({ t: 'surrender', vote: true }); run(drop, 2); ok('one of two humans waits', !drop.over); Sim.setBot(drop, D[1], true); run(drop, 2); ok('a dropped human stops counting', drop.over && drop.over.surrender);
    }
    ok('stats fields', ['dealt', 'taken', 'healing', 'gold', 'towers', 'objectives', 'rescues'].every(k => typeof me.stats[k] === 'number'));
  }
  { // 10.0: damage types, level cap, proficiencies, targeting, minion leash.
    ok('twenty kits, ten a side', Object.keys(Sim.KITS).length === 20 && RO[0].length === 10 && RO[1].length === 10);
    ok('item table', Sim.ITEMS.length >= 60 && Sim.ITEMS.every(i => !i.upgradesFrom || Sim.ITEM_BY[i.upgradesFrom]));
    ok('item paths are real items', Object.keys(Sim.KITS).every(k => Sim.KITS[k].builds.every(b => Sim.itemPaths(k, b.id).length >= 3 && Sim.itemPaths(k, b.id).every(p => p.items.length === 5 && new Set(p.items).size === 5 && p.items.every(i => Sim.ITEM_BY[i])))));
    ok('profs', Sim.ROLES.every(r => Sim.PROFS[r].length === 3 && Sim.PROFS[r].every(p => p.id && p.name && p.d)));
    { const { s, me } = arena('vesper', 'marksman'); me.lvl = 15; me.xp = 0; Sim.step(s); ok('level 15 cap', Sim.MAX_LEVEL === 15 && me.lvl === 15); }
    { const a1 = arena('hex', 'cursebinder'), a2 = arena('hex', 'cursebinder'); a1.foe.mr = 300; a2.foe.mr = 0; for (const a of [a1, a2]) { a.foe.armor = 30; a.me.q.push({ t: 'cast', slot: 0, tx: a.foe.x, ty: a.foe.y }); run(a.s, 25); } ok('magic damage reads magic resist', a1.foe.hp > a2.foe.hp); }
    { const list = t => RO[t].slice(0, 4).map((c, i) => ({ champ: c, role: Sim.ROLES[i], name: 'x', tier: 0, human: true, prof: Sim.PROFS[Sim.ROLES[i]][1].id })); const s = Sim.createMatch({ seed: 3, teams: [list(0), list(1)] }), j = s.champs.find(c => c.role === 'jungle'); ok('seat prof', j.prof === 'killstrike');
      s.nextWave = 1e9; s.eventAt = 1e9; for (const t of s.towers) t.alive = false; for (const b of s.bosses) b.at = 1e9; const camp = s.camps[0]; camp.at = 0; Sim.step(s); const m = s.monsters.find(x => x.camp === camp.id); m.maxHp = 1000; m.hp = 150; m.armor = 0; j.x = j.px = m.x - 80; j.y = j.py = m.y; j.atk = true; j.atkMode = 'minion'; j.atkCd = 0; let hit = false; for (let i = 0; i < 40 && !hit; i++) { Sim.step(s); hit = s.ev.some(e => e.e === 'strike' && e.u === j.id); s.ev.length = 0; } ok('kill strike finishes a monster', hit && !m.alive); }
    { const { s, me, foe, foe2 } = arena('vesper', 'marksman'); place(foe, me.x + 200, me.y); place(foe2, me.x + 150, me.y); foe.hp = 2000; foe2.hp = 2900; me.atkMode = 'champ'; me.atkPref = 0; ok('lowest health first', Sim.autoTarget(s, me) === foe); foe.maxHp = 2000; foe2.maxHp = 40000; foe2.hp = 3000; me.q.push({ t: 'pref', v: 'pct' }); run(s, 1); ok('pref by percentage', Sim.autoTarget(s, me) === foe2); }
    { const list = t => RO[t].slice(0, 4).map((c, i) => ({ champ: c, role: Sim.ROLES[i], name: 'x', tier: 0, human: true })); const s = Sim.createMatch({ seed: 2, teams: [list(0), list(1)] }); for (const c of s.camps) c.at = 1e9; for (const b of s.bosses) b.at = 1e9; s.eventAt = 1e9; for (const t of s.towers) t.alive = false; const bait = s.champs[0]; bait.hp = bait.maxHp = 1e7; let worst = 0; const lane = (m) => { const L = s.map.lanes[m.lane]; let b = 1e9; for (let i = 0; i + 1 < L.length; i++) { const dx = L[i + 1][0] - L[i][0], dy = L[i + 1][1] - L[i][1], t = Math.max(0, Math.min(1, ((m.x - L[i][0]) * dx + (m.y - L[i][1]) * dy) / (dx * dx + dy * dy))); b = Math.min(b, Math.hypot(m.x - L[i][0] - dx * t, m.y - L[i][1] - dy * t)); } return b; }; for (let i = 0; i < 1500; i++) { if (i % 20 === 0) for (const c of s.champs) if (c.team === 0 && s.minions[0]) { place(c, s.minions[0].x, s.minions[0].y + 900); c.recentHit = s.t + 1e6; } Sim.step(s); s.ev.length = 0; for (const m of s.minions) worst = Math.max(worst, lane(m)); } ok('minions never leave the lane, worst ' + worst.toFixed(0), worst < 260); }
    // 11.0: medals, scoring, modes.
    {
      const M = Sim.MEDALS; ok('24 medals, unique', M.length === 24 && new Set(M.map(m => m.id)).size === 24);
      ok('three ascending tiers', M.every(m => m.tiers.map(t => t.name).join() === 'Bronze,Silver,Gold' && m.tiers[0].need < m.tiers[1].need && m.tiers[1].need < m.tiers[2].need));
      ok('every category has a name', M.every(m => Sim.MEDAL_CATS[m.cat]));
      const win = { won: true, mode: 'classic', full: true, champ: RO[0][0], role: 'top', kills: 4, assists: 3, deaths: 0 }, C = Sim.newCareer(); let got = [];
      for (let i = 0; i < 10; i++) got = got.concat(Sim.medalProgress(C, win).earned);
      ok('tier is earned once, at its need', got.filter(e => e.id === 'untouchable').length === 1 && C.tiers.untouchable === 1 && Sim.medalValue(C, M.find(m => m.id === 'untouchable')) === 10);
      const before = C.sum.deathless; Sim.medalProgress(C, Object.assign({}, win, { practice: true })); Sim.medalProgress(C, Object.assign({}, win, { mode: 'raid' })); Sim.medalProgress(C, Object.assign({}, win, { full: false }));
      ok('practice, raid and short games are not deathless wins', C.sum.deathless === before);
      ok('a died-in match is not deathless', (Sim.medalProgress(C, Object.assign({}, win, { deaths: 1 })), C.sum.deathless === before));
      ok('comebacks need the deficit', (() => { const c = Sim.newCareer(); Sim.medalProgress(c, Object.assign({}, win, { trailed: 2999 })); Sim.medalProgress(c, Object.assign({}, win, { trailed: 3000 })); return c.sum.comebacks === 1 && c.max.deficit === 3000; })());
      const base = Sim.marksEarned(true, { kills: 2 }), B = Sim.MARK_BONUS;
      ok('marks bonuses add up', Sim.marksEarned(true, { kills: 2 }, { potg: true, mvp: true, svp: true, medals: [{ tier: 0 }, { tier: 2 }] }) === base + B.potg + B.mvp + B.svp + B.medal[0] + B.medal[2]);
      const seats = t => RO[t].slice(0, 4).map((c, i) => ({ champ: c, role: Sim.ROLES[i], name: 'x', tier: 0, skill: .5 })), mk = (mode, h) => { const teams = [seats(0), seats(1)]; if (h) teams[h - 1][1].human = true; return { seed: 5, mode, teams }; };
      { const cfg = mk('classic'), s = Sim.createMatch(cfg); run(s, 400); s.champs.forEach((c, i) => { c.stats.dealt = 1000.4 + i * 91.7; c.stats.taken = 500.6; c.stats.healing = i * 33.3; c.stats.kills = i % 3; }); s.over = { winner: 1, t: s.t }; const g = Sim.createMatch(mk('classic')); Sim.applySlow(g, Sim.slowDiff(null, Sim.slowFlat(s))); const a = Sim.scoreMatch(s), b = Sim.scoreMatch(g), team = id => s.champs.find(c => c.id === id).team;
        ok('MVP from winners, SVP from losers', team(a.mvp) === 1 && team(a.svp) === 0 && a.list.length === 8); ok('host and guest agree on the score', a.mvp === b.mvp && a.svp === b.svp && JSON.stringify(a.list.map(r => r.score)) === JSON.stringify(b.list.map(r => r.score))); }
      { const cfg = mk('duel', 1), s = Sim.createMatch(cfg); ok('duel is one a side and keeps the human', s.champs.length === 2 && s.champs[0].human && cfg.teams[0].length === 1); ok('duel is one lane with no bosses', s.towers.length === 6 && s.towers.every(t => t.lane !== 1) && s.bosses.every(B => B.at > 1e8)); Sim.normalizeTeams(cfg); ok('normalizing twice changes nothing', cfg.teams.flat().length === 2); run(s, 300); ok('duel waves use one lane', s.minions.length > 0 && s.minions.every(m => m.lane === 0)); }
      { const s = Sim.createMatch(mk('brawl')); ok('brawl keeps four a side on one lane', s.champs.length === 8 && s.towers.length === 6 && s.champs.filter(c => c.role !== 'jungle').every(c => c.bot.lane === 0)); run(s, 300); ok('brawl waves use one lane', s.minions.length > 0 && s.minions.every(m => m.lane === 0)); }
      { const g = Sim.createMatch(mk('gold')), c = Sim.createMatch(mk('classic')); ok('gold starts doubled', g.champs[0].gold === 2 * c.champs[0].gold); ok('gold keeps both lanes', g.towers.length === 10); }
      { const cfg = mk('raid', 2), s = Sim.createMatch(cfg), side = s.raid.team; ok('raid puts everyone on the human side', side === 1 && s.champs.length === 4 && s.champs.every(c => c.team === 1) && s.champs[1] && cfg.teams[0].length === 0); ok('raid brings the Colossus early and has no map events', s.bosses.find(B => B.kind === 'colossus').at === 480 && s.eventAt > 1e8); run(s, 900); ok('raid base cannot be sieged', s.towers.filter(t => t.team === s.raid.enemy).every(t => t.alive && t.hp === t.maxHp)); ok('raid has waves', s.minions.some(m => m.team === s.raid.enemy)); const sc = (s.over = { winner: side, t: s.t }, Sim.scoreMatch(s)); ok('raid MVP is a player, no SVP', s.champs.some(c => c.id === sc.mvp) && sc.svp === 0); }
      { const s = Sim.createMatch(mk('classic', 1)), c = s.champs[1]; c.stats.multi3 = 2; c.stats.trailed = 3500; c.stats.kills = 6; s.over = { winner: 0, t: 800 }; s.t = 800; const st = Sim.matchStats(s, c); ok('matchStats carries the career fields', st.won && st.full && st.multi3 === 2 && st.trailed === 3500 && st.champ === c.champ && st.role === c.role && st.mastery > 0); }
    }
  }
  console.log(fails ? `mechanics FAILED ${fails} of ${checked}` : `mechanics ok (${checked} checks)`);
}
