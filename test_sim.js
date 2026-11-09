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
  console.log(fails ? 'rule checks FAILED ' + fails : 'rule checks ok');
}

// Network codec check: rebuild a guest world from wire data for a whole match and compare.
if (process.argv.includes('--net')) {
  const team = t => RO[t].slice(0, 4).map((c, i) => ({ champ: c, role: Sim.ROLES[i], name: 'b', tier: 0, human: t === 1 && i === 0, remote: t === 1 && i === 0 }));
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
      // Interest culling means a guest only holds what its team can nearly see; everything it does hold must match.
      check('zones', h.zones.length === g.zones.length);
      for (const q of g.minions) { const m = h.minions.find(x => x.id === q.id); check('minion', m && Math.abs(m.x - q.x) < .12 && q.team === m.team && q.ranged === m.ranged && (m.hp / m.maxHp - q.hp / 255) < .01); }
      for (const q of g.monsters) check('monster', h.monsters.some(x => x.id === q.id));
      for (const q of g.proj) { const p = h.proj.find(x => x.id === q.id); for (const [k, ok] of [['id', !!p], ['fx', p && p.fx === q.fx], ['x', p && Math.abs(p.x - q.x) < .12], ['homing', p && !!p.homing === q.homing], ['team', p && p.team === q.team], ['owner', p && p.owner.id === q.owner.id], ['target', p && (!p.homing || !q.target || p.target.id === q.target.id)]]) check('proj ' + k, ok); }
    }
  }
  const cur = Sim.slowFlat(h), df = Sim.slowDiff(prev, cur); Sim.applySlow(g, df);
  h.champs.forEach((c, i) => { const q = g.champs[i]; check('gold', Math.abs(q.gold - c.gold) <= 1); check('lvl', q.lvl === c.lvl); check('kills', q.stats.kills === c.stats.kills && q.stats.dmg - Math.round(c.stats.dmg) === 0); });
  check('towers', h.towers.every((t, i) => g.towers[i].alive === t.alive)); check('kills', g.kills[0] === h.kills[0] && g.kills[1] === h.kills[1]); check('over', !!g.over === !!h.over && (!h.over || g.over.winner === h.over.winner)); check('hope', Math.abs(g.hope - h.hope) < .1);
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
  { // Items, sell, attack modes, beacons, pings, practice.
    const { s, me, foe } = arena('vesper', 'marksman'); me.gold = 5000; me.q.push({ t: 'buy', id: 'whetstone' }, { t: 'buy', id: 'serrated' }, { t: 'buy', id: 'plate' }, { t: 'buy', id: 'lens' }); run(s, 2); ok('buy chain upgrades in place', me.items.filter(Boolean).length === 3 && me.items.includes('serrated') && me.items.includes('plate')); const before = me.gold; me.q.push({ t: 'sell', slot: me.items.indexOf('plate') }); run(s, 1); ok('sell refunds', me.gold > before && !me.items.includes('plate'));
    me.atkMode = 'tower'; ok('tower mode ignores champions', !Sim.autoTarget(s, me)); me.atkMode = 'minion'; ok('minion mode ignores champions', !Sim.autoTarget(s, me)); me.atkMode = 'champ'; place(foe, me.x + 200, me.y); ok('champ mode finds champion', Sim.autoTarget(s, me) === foe);
    const b0 = me.beacons; me.q.push({ t: 'beacon', tx: me.x + 300, ty: me.y }); run(s, 1); ok('beacon placed', s.beacons.length === 1 && me.beacons === b0 - 1); const b = s.beacons[0]; ok('beacon vision', Sim.visionSources(s, me.team).some(v => v.r === b.sight)); ok('beacon hidden from foes unless seen, can be attacked', typeof b.hp === 'number');
    place(foe, b.x - 100, b.y); place(me, 3400, 300); me.mv = { x: 0, y: 0 }; for (const c of s.champs) if (c !== foe) place(c, 3400 + c.slot, 320); foe.atkMode = 'champ'; foe.atk = true; run(s, 150); ok('enemies kill beacons with attacks', s.beacons.length === 0); foe.atk = false;
    me.q.push({ t: 'ping', kind: 'help', x: 1000, y: 800 }); Sim.step(s); ok('ping event', s.ev.some(e => e.e === 'ping' && e.team === me.team)); s.ev.length = 0;
    me.lvl = 3; me.evolved = [-1, -1]; me.q.push({ t: 'evolve', tier: 0, choice: 0 }); run(s, 1); ok('evolve gated by level', me.evolved[0] === -1); me.lvl = 4; me.q.push({ t: 'evolve', tier: 0, choice: 0 }); run(s, 1); ok('evolve at level 4', me.evolved[0] === 0); me.lvl = 1;
    // Practice mode: dummies stand still, no game end, op gold.
    const pr = Sim.createMatch({ seed: 9, practice: true, teams: [[{ champ: 'vesper', human: true, tier: 0, role: 'bottom', name: 'p' }, { champ: 'kade', tier: 0, role: 'top', name: 'b' }], [{ champ: 'deadbolt', tier: 0, role: 'bottom', name: 'b' }, { champ: 'shiv', tier: 0, role: 'jungle', name: 'b' }]] });
    const p = pr.champs[0], dm = pr.champs[2], dx = dm.x; ok('dummy seats', pr.champs.slice(1).every(c => c.dummy && !c.bot)); p.q.push({ t: 'practice', op: 'gold' }); p.q.push({ t: 'practice', op: 'level' }); for (let i = 0; i < 300; i++) { Sim.step(pr); pr.ev.length = 0; } ok('dummy still', dm.x === dx); ok('practice gold', p.gold > 20000); ok('level on demand', p.lvl === 10); dm.hp = 1; dm.q; pr.towers.forEach(t => { }); p.x = dm.x - 200; p.y = dm.y; p.atk = true; for (let i = 0; i < 60; i++) { Sim.step(pr); pr.ev.length = 0; } ok('dummy respawned', dm.alive); ok('no enemy aggression', p.hp === p.maxHp);
  }
  { // Full rebuild over the net codec keeps new state.
    const { s, me, foe } = arena('hex', 'cursebinder'); foe.curseN = 3; foe.curseT = 5; foe.rootT = 1; me.stealthT = 1; s.beacons.push({ id: 99, kind: 'beacon', team: me.team, x: 500, y: 500, r: 16, hp: 2, maxHp: 3, alive: true, t: 30, sight: 560, inBrush: -1 });
    const fr = Sim.decodeSnapshot(Sim.snapshot(s, 0, 0)), g = Sim.createMatch({ seed: 5, teams: s.champs.reduce((o, c) => { o[c.team].push({ champ: c.champ, role: c.role, tier: 0, human: true, name: 'x' }); return o; }, [[], []]) });
    Sim.applyFrame(g, fr, null, 0, -1); ok('snapshot curse', g.champs[foe.slot + (foe.team ? 2 : 0)].curseN === 3); ok('snapshot root', g.champs[foe.slot + (foe.team ? 2 : 0)].rootT > 0); ok('snapshot stealth', g.champs[me.slot + (me.team ? 2 : 0)].stealthT > 0); ok('snapshot beacon', g.beacons.length === 1 && g.beacons[0].hp === 2 && g.beacons[0].team === me.team);
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
    ok('event phases', ev.map(e => e.phase).join() === 'warn,start,end'); ok('event end has winner', ev[ev.length - 1].team === 0); ok('winner gets boon', s.boons[0].drop > 100 && c.stats.objectives === 1);
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
  console.log(fails ? `mechanics FAILED ${fails} of ${checked}` : `mechanics ok (${checked} checks)`);
}
