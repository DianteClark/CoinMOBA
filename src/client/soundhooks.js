// Connects the simulation to Sound: spatialised event effects and per-frame music, weather and heartbeat control.
const SND = { level: 0, dmg: 0, send: 0, slow: 0, heart: 0, bolt: 0, coin: 0, coinT: 0, over: false, quiet: false, t: 0 };
const SND_LADDER = [1, 1.125, 1.25, 1.5, 1.667, 2];

function initSound(g) {
  Object.assign(SND, { level: 0, dmg: 0, send: 0, slow: 0, heart: 0, bolt: 0, coin: 0, coinT: 0, over: false, quiet: false, t: 0 });
  if (g && g.me) Sound.setSide(g.me.team === 0 ? 'hero' : 'villain');
  Sound.intensity(0); Sound.late(0); Sound.hope(.5);
  Sound.setMode('match');
}

// Volume and pan for a world position, or null when it is too far away to hear.
function soundAt(x, y, floor = 0) {
  if (!G || !G.cam) return null;
  const dx = x - G.cam.x, dy = y - G.cam.y, d = Math.hypot(dx / 510, dy / 350);
  if (d > 1.9 && !floor) return null;
  const v = d < 1 ? 1 - d * .2 : Math.max(0, .8 * (1.9 - d) / .9);
  return { vol: Math.max(v, floor), pan: Math.max(-.85, Math.min(.85, dx / 640)) };
}
function soundUnit(id) { const s = G.s; return s.champs.find(c => c.id === id) || s.minions.find(c => c.id === id) || s.monsters.find(c => c.id === id) || s.towers.find(c => c.id === id); }

const SND_CAST = { snipe: 'snipe', snipeFull: 'snipeFull', deadeye: 'deadeye', orb: 'orb', ray: 'ray', chain: 'chain', bolt: 'bolt', mbolt: 'mbolt', tower: 'tshot', dash: 'dash', parry: 'parry', slash: 'slash', dome: 'dome', crash: 'whoosh', heal: 'heal', rupture: 'orb', stomp: 'stomp', break: 'break' };
const SND_BOOM = { crash: 'crash', stomp: 'stomp', rupture: 'rupture', heal: 'heal', break: 'break', dome: 'dome', deadeye: 'blast', snipeFull: 'blast' };

function soundEvent(e) {
  if (!G || !G.s || !G.me) return;
  const me = G.me, at = (u, floor) => u ? soundAt(u.x, u.y, floor) : null;
  switch (e.e) {
    case 'cast': {
      const u = soundUnit(e.u), name = SND_CAST[e.fx]; if (!u || !name) return;
      if (u === me) { Sound.play(name, undefined, 30); return; }
      const o = at(u); if (o) Sound.play(name, undefined, 50, o);
      return;
    }
    case 'boom': { const name = SND_BOOM[e.fx] || 'blast', o = soundAt(e.x, e.y); if (o) Sound.play(name, undefined, 60, o); return; }
    case 'phit': { if (e.fx === 'dome') { const o = soundAt(e.x, e.y); if (o) Sound.play('clink', 1.3, 50, o); } return; }
    case 'blink': { const o = soundAt(e.x, e.y); if (o) Sound.play('blink', undefined, 60, o); return; }
    case 'hit': {
      const u = soundUnit(e.u), by = e.by ? soundUnit(e.by) : null, o = at(u); if (!u) return;
      const mine = u === me || by === me;
      if (u === me) SND.dmg = Math.min(1, SND.dmg + e.a / Math.max(1, me.maxHp) * 2.4);
      if (!o) return;
      if (mine) {
        const name = u === me ? 'thud' : e.crit ? 'crit' : e.sk ? 'hitHard' : 'hit';
        Sound.play(name, undefined, u === me ? 90 : 45, u === me ? undefined : o);
      } else if (e.sk) Sound.play('hitHard', undefined, 70, Object.assign(o, { vol: o.vol * .7 }));
      else if (u.kind === 'champ' || (by && by.kind === 'champ')) Sound.play('hit', undefined, 70, Object.assign(o, { vol: o.vol * .6, low: true }));
      else Sound.play('tick', undefined, 80, Object.assign(o, { vol: o.vol * .55, low: true }));
      return;
    }
    case 'die': {
      if (e.kind === 'champ') {
        if (e.u === me.id) Sound.play('death');
        const o = soundAt(e.x, e.y, e.by === me.id ? .9 : .35); if (o) Sound.play('kill', undefined, 120, o);
      } else if (e.kind === 'tower') { const o = soundAt(e.x, e.y, .5); if (o) Sound.play('tower', undefined, 200, o); }
      return;
    }
    case 'gold': {
      if (e.u !== me.id) return;
      SND.coin = G.t - SND.coinT < 1.4 ? Math.min(SND_LADDER.length - 1, SND.coin + 1) : 0; SND.coinT = G.t;
      Sound.play('coin', SND_LADDER[SND.coin], 40); return;
    }
    case 'parry': { const u = soundUnit(e.u); if (u === me) Sound.play('parry', undefined, 60); else { const o = at(u); if (o) Sound.play('parry', undefined, 60, o); } return; }
    case 'level': { if (e.u === me.id) Sound.play('level', undefined, 200); return; }
    case 'boss': Sound.play('boss', undefined, 400); return;
    case 'bossup': Sound.play('bossup', undefined, 400); return;
    case 'tower': Sound.play('towerNews', e.team !== me.team, 300, { vol: .75 }); return;
    case 'forge': { if (e.u === me.id) Sound.play('forge', undefined, 120); return; }
    case 'spawn': { if (e.u === me.id) Sound.play('respawn', undefined, 200); return; }
    case 'cancelled': { if (e.u === me.id) Sound.play('cancel', undefined, 80); return; }
    case 'feed': Sound.play('feed', e.multi || 1, 180, { vol: e.first ? 1 : .7 }); return;
    case 'tshot': { const u = soundUnit(e.u), o = at(u); if (o) Sound.play('tshot', undefined, 90, o); return; }
    case 'atk': {
      const u = soundUnit(e.u); if (!u || u.kind !== 'champ') return;
      const melee = Sim.KITS[u.champ] && Sim.KITS[u.champ].melee, name = melee ? 'swing' : 'bolt';
      if (u === me) Sound.play(name, undefined, 40); else { const o = at(u); if (o) Sound.play(name, undefined, 90, Object.assign(o, { vol: o.vol * .6, low: true })); }
      return;
    }
    case 'heal': { if (e.u === me.id && e.a >= 40) Sound.play('mark', undefined, 350, { vol: .7 }); return; }
    case 'stun': { const u = soundUnit(e.u), o = at(u); if (o) Sound.play('stun', undefined, 150, o); return; }
    case 'mark': { const u = soundUnit(e.u), o = at(u); if (o) Sound.play('mark', undefined, 120, o); return; }
    case 'civ': { const o = soundAt(e.x, e.y, .5); if (o) Sound.play(e.team === 0 ? 'rescued' : 'seized', undefined, 300, o); return; }
    case 'hope': { if (e.on) Sound.play(e.team === 0 ? 'hopeSwell' : 'dread', undefined, 1200); return; }
  }
}

function soundFrame(dt) {
  if (!G || !G.s || !G.me) return;
  const s = G.s, me = G.me;
  if (G.ended || s.over) {
    if (s.over && !SND.over) { SND.over = true; Sound.stinger(s.over.winner === me.team); }
    if (!SND.quiet) { SND.quiet = true; Sound.intensity(0); Sound.ambience(0, .1); }
    return;
  }
  if (dt <= 0) return;

  let near = 0;
  for (const c of s.champs) {
    if (c.team === me.team || !c.alive || (Sim.canSee && !Sim.canSee(s, me.team, c))) continue;
    const d = Math.hypot(c.x - me.x, c.y - me.y); if (d < 900) near += 1 - d / 900;
  }
  const hp = me.alive ? me.hp / Math.max(1, me.maxHp) : 1;
  SND.dmg = Math.max(0, SND.dmg - dt * .32);
  const target = me.alive ? Math.min(1, .12 + Math.min(1, near / 1.5) * .6 + SND.dmg * .45 + Math.max(0, .5 - hp) * .6) : .15;
  SND.level += (target - SND.level) * Math.min(1, dt / (target > SND.level ? .6 : 3));

  if (me.alive && hp < .25) {
    SND.heart -= dt;
    if (SND.heart <= 0) { Sound.play('heart', undefined, 0); SND.heart = .6 + .35 * hp / .25; }
  } else SND.heart = 0;

  const b = G.bolt || 0;
  if (b > .9 && SND.bolt <= .9) Sound.play('thunder', undefined, 700);
  SND.bolt = b;

  SND.send -= dt;
  if (SND.send <= 0) {
    SND.send = .2; SND.t += .2;
    Sound.intensity(SND.level);
    Sound.late(Math.max(0, Math.min(1, (s.t - 480) / 360)));
    if (typeof s.hope === 'number') Sound.hope(s.hope / 100);
    const rain = typeof G.rain === 'number' ? G.rain : 0;
    Sound.ambience(rain, Math.min(1, .22 + Math.sin(SND.t * .13) * .1 + rain * .45));
    const p = (s.t / 780 + .12) % 1;
    Sound.night(typeof G.night === 'number' ? G.night : Math.max(0, 1 - Math.abs(p - .86) / .16));
    Sound.lean(typeof quality === 'number' && quality === 0);
  }
}
