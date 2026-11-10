// Connects the simulation to Sound: decides what deserves to be heard, then per-frame music, weather and heartbeat control.
// Mix tiers: the player's own actions and hits on the player are full level; nearby champions and objectives sit below that;
// routine minion fights are nearly silent and rate-limited. Everything tolerates partial data, because a guest's state is rebuilt from snapshots.
const SND = { level: 0, dmg: 0, send: 0, slow: 0, heart: 0, bolt: 0, coin: 0, coinT: 0, over: false, quiet: false, t: 0, paused: false, shots: [], zones: new Set(), chans: new Set(), danger: 0, keys: new Map(), beacons: null, ruptT: -9, ruptN: 0, combo: new Map(), charging: new Map(), wreck: new Map(), fxKit: new Map(), chain: 0, chainT: -9 };
const SND_LADDER = [1, 1.125, 1.25, 1.335, 1.5];
let SND_SEEN = new WeakSet();

function initSound(g) {
  Object.assign(SND, { level: 0, dmg: 0, send: 0, slow: 0, heart: 0, bolt: 0, coin: 0, coinT: 0, over: false, quiet: false, t: 0, paused: false, shots: [], danger: 0, beacons: null, ruptT: -9, ruptN: 0, chain: 0, chainT: -9 });
  SND.zones.clear(); SND.chans.clear(); SND.keys.clear(); SND.combo.clear(); SND.charging.clear(); SND.wreck.clear(); SND.fxKit.clear(); SND_SEEN = new WeakSet();
  if (g && g.me) Sound.setSide(g.me.team === 0 ? 'hero' : 'villain');
  Sound.intensity(0); Sound.late(0); Sound.hope(.5);
  Sound.setMode('match');
}

const sndNum = v => typeof v === 'number' && isFinite(v);
// Volume and pan for a world position, or null when it is too far away to hear. d is 1 at about the edge of the screen.
function soundAt(x, y, floor = 0) {
  if (!G || !G.cam || !sndNum(x) || !sndNum(y)) return null;
  const dx = x - G.cam.x, dy = y - G.cam.y, d = Math.hypot(dx / 510, dy / 350);
  if (d > 1.9 && !floor) return null;
  const v = d < 1 ? 1 - d * .2 : Math.max(0, .8 * (1.9 - d) / .9);
  return { vol: Math.max(v, floor), pan: Math.max(-.85, Math.min(.85, dx / 640)), d };
}
function soundUnit(id) {
  if (id === undefined || id === null || !G || !G.s) return null;
  const s = G.s, by = a => a ? a.find(c => c && c.id === id) : null;
  return by(s.champs) || by(s.minions) || by(s.monsters) || by(s.towers) || null;
}
// Enemies in the fog must not give themselves away by sound.
function sndSeen(u, me) { if (!u || u.team === me.team || !Sim.canSee) return true; try { return !!Sim.canSee(G.s, me.team, u); } catch (err) { return true; } }
const sndScaled = (o, k, low) => Object.assign(o, { vol: o.vol * k, low: !!low });

// True for an event already handled. The same object is never played twice, and a guest also compares content over a
// short window, so an event resent after a hiccup in the connection is not heard again.
function soundDup(e) {
  if (SND_SEEN.has(e)) return true; SND_SEEN.add(e);
  if (!G.net || G.net.role !== 'guest') return false;
  const now = performance.now(), k = [e.e, e.u, e.a, e.fx, e.by, e.t, e.team, e.kind, e.slot, e.charge, e.id, sndNum(e.x) ? Math.round(e.x) : '', sndNum(e.y) ? Math.round(e.y) : ''].join('|');
  if (now - (SND.keys.get(k) || -1e9) < 200) return true;
  SND.keys.set(k, now);
  if (SND.keys.size > 240) for (const [key, at] of SND.keys) { if (now - at > 400) SND.keys.delete(key); }
  return false;
}

// Which named effect a cast plays. One fx string can serve several kits, so `kit:fx` is checked first.
const SND_CAST = {
  snipe: 'snipe', snipeFull: 'snipeFull', deadeye: 'deadeye', orb: 'orb', ray: 'ray', chain: 'chain', bolt: 'bolt', mbolt: 'mbolt', tower: 'tshot', dash: 'dash', parry: 'parry', slash: 'slash', dome: 'dome', crash: 'leap', heal: 'heal', rupture: 'ruptureCast', stomp: 'stomp', break: 'break',
  tripwire: 'tripwire', ricochet: 'ricochet', lockdown: 'lockdown', flourish: 'flourish', feint: 'feint', salute: 'salute', hexbolt: 'hexbolt', polymorph: 'polymorph', coven: 'coven', miasma: 'miasma', leech: 'leech', quarantine: 'quarantine', shank: 'shank', vanish: 'vanish', cuts: 'cuts', wrecking: 'wrecking', grab: 'grab', demolish: 'demolish',
};
// Cast events carry the slot, so `kit:slot` names the exact ability and this wins over the fx string.
const SND_SLOT = {
  'vesper:1': 'smokeStep', 'vesper:2': 'deadeyeCharge', 'kade:0': 'lunge', 'kade:2': 'leap', 'ione:0': 'orb', 'ione:1': 'ruptureCast', 'ione:2': 'cascadeCast', 'solenne:0': 'ray', 'solenne:2': 'dayCharge',
  'sable:0': 'slash', 'sable:1': 'blink', 'sable:2': 'reap', 'gravel:0': 'chain', 'gravel:2': 'avalanche',
};
const SND_KIT_CAST = { 'vesper:dash': 'smokeStep', 'kade:dash': 'lunge', 'gravel:dash': 'avalanche' };
const SND_NEW = new Set(['voltaic', 'tidecaller', 'paragon', 'mirage', 'cinder', 'ravager', 'cataclysm', 'puppeteer']), SND_SLOT_L = ['Q', 'W', 'R'];
const SND_BOOM = { strike: 'killStrike', killstrike: 'killStrike', crash: 'crash', stomp: 'stomp', rupture: 'rupture', heal: 'heal', break: 'break', dome: 'dome', deadeye: 'blast', snipeFull: 'blast', tripwire: 'tripwireHit', ricochet: 'ricochetHit', lockdown: 'lockdownHit', salute: 'salute', hexbolt: 'hexboltHit', coven: 'covenHit', feint: 'feintPop', miasma: 'miasma', quarantine: 'quarantine', cuts: 'cuts', wrecking: 'wreckingHit', grab: 'grab', demolish: 'demolishHit' };
const SND_PHIT = { chain: 'chainHit', ricochet: 'ricochetHit', hexbolt: 'hexboltHit', tripwire: 'tripwireHit', lockdown: 'lockdownHit', wrecking: 'wreckingHit', dome: 'domeBlock' };
// A wind-up's cast sound plays on the press; the `fire` event is the shot itself, when it finally goes.
const SND_FIRE = { deadeye: 'deadeye', snipeFull: 'snipeFull', snipe: 'snipe' };
const SND_PING = { attack: 'pingAttack', retreat: 'pingRetreat', omw: 'pingOmw', help: 'pingHelp', danger: 'pingDanger' };
// Seconds until a shot of the player's can no longer connect; if nothing has been hit by then, it missed.
const SND_SHOT = { snipe: .62, snipeFull: .72, deadeye: .6, orb: .85, ray: .8, chain: .78, slash: .22, ricochet: .7, hexbolt: .8, shank: .22, polymorph: .85, grab: .3 };
const sndKit = u => (u && typeof u.champ === 'string') ? u.champ : '';
// The kit name an event's position belongs to, for events that carry no unit: the champion standing on the spot.
function sndKitAt(x, y) {
  if (!G || !G.s || !sndNum(x) || !sndNum(y)) return '';
  let best = '', bd = 80; for (const c of G.s.champs || []) { if (!c || !c.alive || !sndNum(c.x)) continue; const d = Math.hypot(c.x - x, c.y - y); if (d < bd) { bd = d; best = sndKit(c); } }
  return best;
}
// The three parts of Flourish step up in pitch and weight, whether or not the sim says which part this is.
function sndComboStep(u, e) {
  if (sndNum(e.n)) return e.n;
  const now = (G && G.t) || 0, c = SND.combo.get(u.id);
  const i = c && now - c.t < 2.4 ? (c.i + 1) % 3 : 0;
  SND.combo.set(u.id, { t: now, i }); return i;
}
function sndBoomName(e) {
  const fx = e.fx, now = G.t || 0;
  if (fx === 'rupture') { SND.ruptN = now - SND.ruptT < .5 ? SND.ruptN + 1 : 0; SND.ruptT = now; return SND.ruptN ? 'cascade' : 'rupture'; }
  if (fx === 'crash' && sndKitAt(e.x, e.y) === 'gravel') return 'avalancheHit';
  const nk = SND.fxKit.get(fx); if (nk) return nk.kit + (nk.slot === 2 ? 'Burst' : 'Hit');
  if (SND_BOOM[fx]) return SND_BOOM[fx];
  return Sound.has && Sound.has(fx + 'Hit') ? fx + 'Hit' : 'blast';
}

function soundHit(e, me) {
  const u = soundUnit(e.u), by = e.by ? soundUnit(e.by) : null; if (!u) return;
  const a = sndNum(e.a) ? e.a : 0, onMe = u.id === me.id, byMe = !!by && by.id === me.id, champTarget = u.kind === 'champ';
  if (e.sk && by && sndKit(by) === 'ironjaw' && (G.t || 0) - (SND.wreck.get(by.id) || -9) < 3.2) { const w = soundAt(u.x, u.y); if (w) Sound.play('wreckingHit', undefined, 160, byMe || onMe ? { pan: w.pan } : sndScaled(w, .6)); }
  if (onMe) SND.dmg = Math.min(1, SND.dmg + a / Math.max(1, me.maxHp || 1) * 2.4);
  // Scaled by the size of the hit, so a minion's chip damage does not thump like a champion's combo.
  if (onMe) { Sound.play('thud', undefined, 130, { vol: Math.min(1, .38 + a / Math.max(1, me.maxHp || 1) * 7) }); if (e.sk && by && by.kind === 'champ') Sound.play('skHit', sndKit(by), 90, { vol: .6 }); return; }
  const o = soundAt(u.x, u.y);
  if (byMe) {
    if (e.sk) SND.shots.shift();
    if (!o) return;
    // Heavy feedback on a skill, a crit, or 70+ damage, the big size from 110.
    const word = (e.sk || e.crit || a >= 70) && u.kind !== 'tower', heavy = a >= 110 || e.crit, pan = { pan: o.pan };
    if (word) Sound.play(heavy ? 'bam' : 'pow', undefined, 60, champTarget ? pan : { pan: o.pan, vol: .7 });
    else Sound.play('hit', undefined, 55, { pan: o.pan, vol: champTarget ? 1 : .75 });
    if (e.sk) {
      // Skills landing in quick succession climb a scale, so a clean combo sounds like one.
      let p = .94; if (champTarget) { const now = G.t || 0; SND.chain = now - SND.chainT < 1.2 ? Math.min(SND_LADDER.length - 1, SND.chain + 1) : 0; SND.chainT = now; p = SND_LADDER[SND.chain]; }
      Sound.play('hitConfirm', p, 80, { vol: champTarget ? 1 : .6 }); Sound.play('skHit', sndKit(me), 70, { pan: o.pan, vol: champTarget ? .9 : .55 });
    }
    return;
  }
  if (!o) return;
  const champFight = champTarget || (by && by.kind === 'champ');
  if (champFight && o.d < 1.5) {
    if (e.sk) { Sound.play('hitHard', undefined, 90, sndScaled(o, .5)); if (by && by.kind === 'champ') Sound.play('skHit', sndKit(by), 110, sndScaled(soundAt(u.x, u.y), .42)); }
    else Sound.play('hit', undefined, 110, sndScaled(o, .34, true));
  } else if (o.d < .7) Sound.play('tick', undefined, 300, sndScaled(o, .1, true));
}

function soundEv(e, me) {
  const at = u => u ? soundAt(u.x, u.y) : null, mine = id => id === me.id;
  switch (e.e) {
    case 'cast': {
      const u = soundUnit(e.u); if (!u) return;
      const kit = sndKit(u), mineNow = mine(u.id), now = G.t || 0;
      // Holding a charge is the player's own feedback only; the shot is what everyone hears.
      if (e.charge) { SND.charging.set(u.id, now); if (mineNow && kit === 'vesper') Sound.play('snipeCharge', undefined, 200); return; }
      const isNew = SND_NEW.has(kit) && sndNum(e.slot) && e.slot >= 0 && e.slot < 3;
      if (e.fx) { if (isNew) SND.fxKit.set(e.fx, { kit, slot: e.slot }); else SND.fxKit.delete(e.fx); }
      let name = (isNew && Sound.has(kit + SND_SLOT_L[e.slot]) ? kit + SND_SLOT_L[e.slot] : null) || SND_SLOT[kit + ':' + e.slot] || SND_KIT_CAST[kit + ':' + e.fx] || SND_CAST[e.fx] || (Sound.has(e.fx) ? e.fx : null);
      if (e.fx === 'snipe' && kit === 'vesper' && SND.charging.has(u.id)) { if (now - SND.charging.get(u.id) >= 1.1) name = 'snipeFull'; SND.charging.delete(u.id); }
      if (!name || !sndSeen(u, me)) return;
      if (kit === 'ironjaw' && e.fx === 'wrecking') SND.wreck.set(u.id, now);
      const arg = name === 'flourish' ? sndComboStep(u, e) : name === 'lunge' ? sndComboStep(u, e) : undefined;
      if (mineNow) {
        Sound.play(name, arg, 30); Sound.duck(.24, .3); // room for the player's own ability
        if (SND_SHOT[e.fx]) { SND.shots.push(G.t + SND_SHOT[e.fx]); if (SND.shots.length > 4) SND.shots.shift(); }
        return;
      }
      const o = at(u); if (o && o.d < 1.4) Sound.play(name, arg, 70, sndScaled(o, u.team === me.team ? .4 : .62, u.team === me.team));
      return;
    }
    case 'fire': {
      const u = soundUnit(e.u), name = SND_FIRE[e.fx]; if (!u || !name || !sndSeen(u, me)) return;
      if (mine(u.id)) { Sound.play(name, undefined, 30); if (SND_SHOT[e.fx]) { SND.shots.push(G.t + SND_SHOT[e.fx]); if (SND.shots.length > 4) SND.shots.shift(); } return; }
      const o = at(u); if (o && o.d < 1.6) Sound.play(name, undefined, 70, sndScaled(o, u.team === me.team ? .45 : .7));
      return;
    }
    case 'poly': { const u = soundUnit(e.u); if (u && mine(u.id)) Sound.play('polymorphHit', undefined, 150); else { const o = at(u); if (o && o.d < 1.3) Sound.play('polymorphHit', undefined, 150, sndScaled(o, .7)); } return; }
    case 'root': { const u = soundUnit(e.u); if (u && mine(u.id)) Sound.play('rooted', undefined, 150); else { const o = at(u); if (o && o.d < 1.2) Sound.play('rooted', undefined, 180, sndScaled(o, .5)); } return; }
    case 'knock': { const u = soundUnit(e.u); if (u && mine(u.id)) Sound.play('thud', undefined, 130, { vol: .9 }); return; }
    case 'curse': { const u = soundUnit(e.u), o = at(u); if (o && o.d < 1.1) Sound.play('curse', sndNum(e.n) ? e.n : 0, 120, sndScaled(o, u.id === me.id ? .9 : .55, true)); return; }
    case 'shield': { const u = soundUnit(e.u); if (u && (mine(u.id) || u.team === me.team)) { const o = at(u); Sound.play('shieldUp', undefined, 200, mine(u.id) ? undefined : (o ? sndScaled(o, .5) : { vol: .3 })); } return; }
    case 'stealth': { const u = soundUnit(e.u); if (u && mine(u.id) && !e.on) Sound.play('stealthBreak', undefined, 160); return; }
    case 'buy': case 'sell': {
      if (!mine(e.u)) return;
      const item = e.e === 'buy' && Sim.ITEMS && Sim.ITEMS.find(i => i.id === e.id), name = e.e === 'sell' ? 'sell' : item && item.upgradesFrom ? 'buyUp' : 'buy';
      if (!Sound.recent(name, 700)) Sound.play(name, undefined, 150);
      return;
    }
    case 'evolve': { if (mine(e.u) && !Sound.recent('evolve', 700)) Sound.play('evolve', undefined, 200); return; }
    case 'beacon': {
      if (e.team !== me.team) return;
      if (mine(e.u)) Sound.play('beaconPlace', undefined, 200);
      else { const o = soundAt(e.x, e.y, .3); if (o) Sound.play('beaconPlace', undefined, 300, sndScaled(o, .55)); }
      return;
    }
    case 'bhit': { const o = soundAt(e.x, e.y); if (o && o.d < 1.3) Sound.play('beaconHit', undefined, 60, sndScaled(o, e.team === me.team ? .75 : .85)); return; }
    case 'boom': { const name = sndBoomName(e), o = soundAt(e.x, e.y); if (o) Sound.play(name, name === 'cascade' ? SND.ruptN : undefined, 90, sndScaled(o, o.d < 1 ? .75 : .45)); return; }
    case 'phit': { const nk = SND.fxKit.get(e.fx), name = nk ? nk.kit + 'Hit' : SND_PHIT[e.fx] || null; if (name) { const o = soundAt(e.x, e.y); if (o && o.d < 1.2) Sound.play(name, undefined, 90, sndScaled(o, .7)); } return; }
    case 'blink': { const o = soundAt(e.x, e.y); if (o && o.d < 1.3) Sound.play('blink', undefined, 70, sndScaled(o, .8)); return; }
    case 'hit': soundHit(e, me); return;
    case 'die': {
      if (e.kind === 'champ') {
        if (mine(e.u)) { Sound.play('death', undefined, 300); return; }
        const o = soundAt(e.x, e.y, mine(e.by) ? .95 : .28); if (o) Sound.play('kill', undefined, 120, o);
      } else if (e.kind === 'tower') { const o = soundAt(e.x, e.y, .35); if (o) Sound.play('tower', undefined, 200, o); }
      else if (e.kind === 'monster' && mine(e.by)) { const o = soundAt(e.x, e.y, .8); if (o) Sound.play('monsterKill', undefined, 120, o); }
      return;
    }
    case 'gold': {
      if (!mine(e.u)) return;
      const small = sndNum(e.a) && e.a < 15;
      if (!small) { SND.coin = G.t - SND.coinT < 1.4 ? Math.min(SND_LADDER.length - 1, SND.coin + 1) : 0; SND.coinT = G.t; }
      Sound.play('coin', SND_LADDER[SND.coin], small ? 160 : 60, { vol: small ? .35 : .8 }); return;
    }
    case 'parry': { const u = soundUnit(e.u); if (u && mine(u.id)) Sound.play('parry', undefined, 60); else { const o = at(u); if (o) Sound.play('parry', undefined, 80, sndScaled(o, .6)); } return; }
    case 'level': { if (mine(e.u)) { const u = soundUnit(e.u); Sound.play(u && u.lvl >= 15 ? 'levelMax' : 'level', undefined, 200); } return; }
    case 'strike': { const o = soundAt(e.x, e.y, mine(e.u) ? .9 : 0); if (o) Sound.play('killStrike', undefined, 120, o); return; }
    case 'boon': { if (e.on && e.team === me.team) Sound.play('boon', undefined, 600, { vol: .7 }); return; }
    case 'boss': Sound.play('boss', undefined, 400, { vol: .85 }); return;
    case 'bossup': Sound.play('bossup', undefined, 400, { vol: .85 }); return;
    case 'district': { if (e.phase === 'flip') Sound.play(e.team === 0 ? 'secure' : 'seize', undefined, 300, { vol: e.team === me.team ? .85 : .55 }); else if (e.phase === 'attack' && e.from === me.team) Sound.play('districtAlarm', undefined, 2500, { vol: .6 }); return; }
    case 'subway': { if (e.u === me.id) { if (e.phase === 'go') Sound.play('subwayGo', undefined, 500, { vol: .8 }); else if (e.phase === 'arrive') Sound.play('subwayArrive', undefined, 500, { vol: .8 }); } return; }
    case 'blackout': Sound.play('blackoutHit', undefined, 800, { vol: .75 }); return;
    case 'city': Sound.play(e.kind === 'rally' ? 'rally' : 'panic', undefined, 2000, { vol: .85 }); return;
    case 'hunt': if (e.team === me.team && e.paid) Sound.play('huntPay', undefined, 500, { vol: .8 }); return;
    case 'rival': if (e.u === me.id || e.v === me.id) Sound.play('rivalClash', undefined, 3000, { vol: .9 }); return;
    case 'evade': if (e.u === me.id) Sound.play('evade', undefined, 120, { vol: .9 }); else { const o = soundAt(e.x, e.y, 0); if (o) Sound.play('evade', undefined, 200, o); } return;
    case 'dodge': if (e.u === me.id) Sound.play('evaded', undefined, 200, { vol: .8 }); return;
    case 'act': Sound.play(e.n === 3 ? 'act3' : 'act2', undefined, 3000, { vol: .9 }); return;
    case 'rampage': if (e.phase === 'start') Sound.play('colossusRampage', undefined, 3000, { vol: .85 }); return;
    case 'laststand': Sound.play('lastStand', undefined, 3000, { vol: e.team === me.team ? .95 : .6 }); return;
    case 'combo': { if (e.a === me.id || e.b === me.id) Sound.play('comboLink', undefined, 400, { vol: .95 }); else { const o = soundAt(e.x, e.y, 0); if (o) Sound.play('comboLink', undefined, 400, o); } return; }
    case 'wanted': if (e.n > 0) Sound.play('wantedOn', undefined, 2000, { vol: e.u === me.id ? .9 : .6 }); else if (e.by === me.id) Sound.play('bountyClaimed', undefined, 800, { vol: .95 }); return;
    case 'slam': { const o = soundAt(e.x, e.y, 0); if (o) Sound.play('slamWindup', undefined, 600, o); return; }
    case 'bossphase': Sound.play('bossPhase', undefined, 1500, { vol: .7 }); return;
    case 'steal': Sound.play('steal', undefined, 800, { vol: e.u === me.id ? 1 : .7 }); return;
    case 'duel': if (e.a === me.id || e.b === me.id) { if (e.phase === 'start') Sound.play('duelStart', undefined, 1500, { vol: .9 }); else if (e.phase === 'win' && e.w === me.id) Sound.play('duelWon', undefined, 1500, { vol: .95 }); } return;
    case 'mapevent': {
      if (e.phase === 'warn' && (e.kind === 'heist' || e.kind === 'convoy')) Sound.play('siren', undefined, 1500, { vol: .6 });
      else if (e.phase === 'start' && e.kind === 'blackout') Sound.play('powerDown', undefined, 800, { vol: .8 });
      else if (e.phase === 'start' && e.kind === 'drop') Sound.play('dropLand', undefined, 800, { vol: .7 });
      else if (e.phase === 'end' && e.team >= 0) Sound.play(e.team === me.team ? 'cheer' : 'eventLost', undefined, 800, { vol: .8 });
      return;
    }
    case 'buyback': if (e.u === me.id) Sound.play('buyback', undefined, 400, { vol: .9 }); return;
    case 'fund': if (e.team === me.team) Sound.play('fund', undefined, 300, { vol: e.u === me.id ? .9 : .5 }); return;
    case 'reinforce': if (e.team === me.team) Sound.play('reinforce', undefined, 500, { vol: .7 }); return;
    case 'consume': if (e.u === me.id) Sound.play('consume', undefined, 120, { vol: .8 }); return;
    case 'surrender': if (e.team === me.team && e.phase !== 'open') Sound.play('surrender', undefined, 400, { vol: .7 }); return;
    case 'tower': { if (e.sub !== 'core') Sound.play('towerFall', e.team !== me.team, 300, { vol: .85 }); return; }
    case 'forge': { if (mine(e.u)) Sound.play('forge', undefined, 120); return; }
    case 'spawn': { if (mine(e.u)) Sound.play('respawn', undefined, 200); return; }
    case 'cancelled': { if (mine(e.u)) Sound.play('cancel', undefined, 80); return; }
    case 'feed': Sound.play('feed', e.multi || 1, 180, { vol: e.first ? .9 : .55 }); return;
    case 'tshot': {
      if (mine(e.t)) { Sound.play('dangerTower', undefined, 2400); Sound.play('tshot', undefined, 90, { vol: .7 }); return; }
      const u = soundUnit(e.u), o = at(u); if (o && o.d < 1) Sound.play('tshot', undefined, 200, sndScaled(o, .4, true));
      return;
    }
    case 'atk': {
      const u = soundUnit(e.u); if (!u || u.kind !== 'champ') return;
      if (mine(u.id)) Sound.play('atk', u.champ, 40, { vol: .85 });
      else if (sndSeen(u, me)) { const o = at(u); if (o && o.d < 1) Sound.play('atk', u.champ, 130, sndScaled(o, .3, true)); }
      return;
    }
    case 'heal': { if (mine(e.u) && sndNum(e.a) && e.a >= 40) Sound.play('mark', undefined, 350, { vol: .7 }); return; }
    case 'stun': { const u = soundUnit(e.u); if (u && mine(u.id)) Sound.play('stun', undefined, 150); else { const o = at(u); if (o && o.d < 1.2) Sound.play('stun', undefined, 200, sndScaled(o, .5)); } return; }
    case 'mark': { const u = soundUnit(e.u), o = at(u); if (o && o.d < 1.2) Sound.play('mark', undefined, 150, sndScaled(o, .6)); return; }
    case 'civ': { const o = soundAt(e.x, e.y, .3); if (o) Sound.play(e.team === 0 ? 'rescued' : 'seized', undefined, 300, sndScaled(o, .8)); return; }
    case 'ping': {
      const name = SND_PING[e.kind] || SND_PING.danger, u = soundUnit(e.u);
      if (u && mine(u.id)) { Sound.play(name, undefined, 120); return; }
      const o = soundAt(e.x, e.y, .75); if (o) Sound.play(name, undefined, 400, Object.assign(o, { vol: Math.min(o.vol, .8) }));
      return;
    }
    case 'hope': { if (e.on) Sound.play(e.team === 0 ? 'hopeSwell' : 'dread', undefined, 1200, { vol: .8 }); return; }
  }
}

// Sound must never take the frame down, so a malformed event only costs its own effect.
function soundEvent(e) {
  try {
    if (!e || !G || !G.s || !G.me || soundDup(e)) return;
    soundEv(e, G.me);
  } catch (err) { }
}

const sndSegDist = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)); return Math.hypot(px - (ax + dx * t), py - (ay + dy * t)); };
// Warns once per threat: an enemy blast zone over the player, or a heavy line wind-up that would pass through them.
function soundDanger(s, me) {
  let hit = false;
  for (const z of s.zones || []) {
    if (!z || z.kind !== 'blast' || z.team === me.team || !sndNum(z.x) || !sndNum(z.y) || SND.zones.has(z.id)) continue;
    if (Math.hypot(z.x - me.x, z.y - me.y) < (z.r || 0) + 36) { SND.zones.add(z.id); hit = true; }
  }
  for (const z of s.zones || []) {
    if (!z || z.kind !== 'fissure' || z.team === me.team || SND.zones.has(z.id) || !sndNum(z.x1) || !sndNum(z.x2)) continue;
    if (sndSegDist(me.x, me.y, z.x1, z.y1, z.x2, z.y2) < (z.r || 40) + 50) { SND.zones.add(z.id); hit = true; }
  }
  if (SND.zones.size > 64) SND.zones.clear();
  for (const c of s.champs || []) {
    if (!c || c.team === me.team) continue;
    const ch = c.chan;
    if (!ch || !c.alive || ch.kind !== 'line' || !sndNum(ch.dx) || !sndNum(ch.dy)) { SND.chans.delete(c.id); continue; }
    if (SND.chans.has(c.id)) continue;
    const len = ch.len || 0;
    if (sndSegDist(me.x, me.y, c.x, c.y, c.x + ch.dx * len, c.y + ch.dy * len) < (ch.w || 0) / 2 + 60) { SND.chans.add(c.id); hit = true; }
  }
  if (hit) Sound.play('danger', undefined, 500);
}

// A beacon's end has no event of its own: gone with health to spare is only out of sight, and a timed-out one fades silently.
function soundBeacons(s, me) {
  if (!Array.isArray(s.beacons)) return;
  const cur = new Map();
  for (const b of s.beacons) { if (b && sndNum(b.x) && sndNum(b.y) && b.alive !== false) cur.set(b.id !== undefined ? b.id : Math.round(b.x) + ':' + Math.round(b.y), b); }
  if (SND.beacons) for (const [id, b] of SND.beacons) {
    if (cur.has(id) || (sndNum(b.t) && b.t < .6) || (sndNum(b.hp) && b.hp > 1)) continue;
    const ally = b.team === me.team, o = soundAt(b.x, b.y, ally ? .5 : 0);
    if (o) Sound.play('beaconKill', undefined, 250, ally ? o : sndScaled(o, .85));
  }
  SND.beacons = new Map([...cur].map(([k, v]) => [k, { x: v.x, y: v.y, hp: v.hp, t: v.t, team: v.team }]));
}

function soundTick(dt) {
  if (!G || !G.s || !G.me) return;
  // `paused` also covers the versus splash, and an online match never really pauses, so only a true pause dims the music.
  const s = G.s, me = G.me, isPaused = !!paused && !(G.intro > 0) && !G.net;
  if (SND.paused !== isPaused) { SND.paused = isPaused; Sound.dim(isPaused); }
  if (G.ended || s.over) {
    if (s.over && !SND.over) {
      SND.over = true; const win = s.over.winner === me.team; Sound.stinger(win);
      if (win) Sound.play('victory', me.team === 0 ? 1.42 : 1.58, 0, { vol: .9 });
    }
    if (!SND.quiet) { SND.quiet = true; Sound.intensity(0); Sound.ambience(0, .1); }
    return;
  }
  if (dt <= 0) return;

  let near = 0;
  for (const c of s.champs || []) {
    if (!c || c.team === me.team || !c.alive) continue;
    let seen = true; try { if (Sim.canSee) seen = Sim.canSee(s, me.team, c); } catch (err) { }
    if (!seen || !sndNum(c.x) || !sndNum(c.y)) continue;
    const d = Math.hypot(c.x - me.x, c.y - me.y); if (d < 900) near += 1 - d / 900;
  }
  const hp = me.alive && me.maxHp ? me.hp / me.maxHp : 1;
  SND.dmg = Math.max(0, SND.dmg - dt * .32);
  const target = me.alive ? Math.min(1, .12 + Math.min(1, near / 1.5) * .6 + SND.dmg * .45 + Math.max(0, .5 - hp) * .6) : .15;
  SND.level += (target - SND.level) * Math.min(1, dt / (target > SND.level ? .6 : 3));

  if (me.alive && hp < .25) {
    SND.heart -= dt;
    if (SND.heart <= 0) { Sound.play('heart', undefined, 0, { vol: .8 }); SND.heart = .6 + .35 * hp / .25; }
  } else SND.heart = 0;

  if (SND.shots.length && G.t >= SND.shots[0]) { SND.shots.shift(); Sound.play('whiff', undefined, 200); }

  const b = G.bolt || 0;
  if (b > .9 && SND.bolt <= .9) Sound.play('thunder', undefined, 700, { vol: .7 });
  SND.bolt = b;

  try { soundBeacons(s, me); } catch (err) { }

  SND.danger -= dt;
  if (SND.danger <= 0 && me.alive && sndNum(me.x) && sndNum(me.y)) { SND.danger = .08; soundDanger(s, me); }

  SND.send -= dt;
  if (SND.send <= 0) {
    SND.send = .2; SND.t += .2;
    const st = sndNum(s.t) ? s.t : 0;
    Sound.intensity(SND.level);
    Sound.late(Math.max(0, Math.min(1, (st - 480) / 360)));
    if (sndNum(s.hope)) Sound.hope(s.hope / 100);
    const rain = sndNum(G.rain) ? G.rain : 0;
    Sound.ambience(rain, Math.min(1, .22 + Math.sin(SND.t * .13) * .1 + rain * .45));
    const p = (st / 780 + .12) % 1;
    Sound.night(sndNum(G.night) ? G.night : Math.max(0, 1 - Math.abs(p - .86) / .16));
    Sound.lean(typeof quality === 'number' && quality === 0);
  }
}
// Screens that have their own voice. Runs before the element's handler, so a specific sound can replace its generic tap.
// data-snd on any element names the effect directly; the rest are recognised from the markup.
const SND_PRESS = { pTgt: 'targetPref', sXfer: 'accountOpen', xCopy: 'copyCode', sReset: 'resetWarn' };
function sndPress(ev) {
  try {
    const el = ev.target && ev.target.closest && ev.target.closest('[data-snd],button,[role=button]');
    let name = null, arg;
    if (el) {
      const pg = el.parentElement;
      if (el.dataset.snd) name = el.dataset.snd;
      else if (pg && pg.id === 'shTabs') { if (el.getAttribute('aria-pressed') !== 'true') { name = 'shopCat'; arg = el.dataset.k; } }
      else if (pg && pg.classList.contains('profs')) { if (el.getAttribute('aria-pressed') !== 'true') { name = 'profPick'; arg = [...pg.children].indexOf(el); } }
      else name = SND_PRESS[el.id] || null;
    }
    Sound.claim(name && Sound.has(name) ? 450 : 0);
    if (name) Sound.play(name, arg, 60);
  } catch (err) { }
}
document.addEventListener('pointerdown', sndPress, { capture: true, passive: true });
function soundFrame(dt) { try { soundTick(dt); } catch (err) { } }
