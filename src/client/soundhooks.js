// Connects the simulation to Sound: decides what deserves to be heard, then per-frame music, weather and heartbeat control.
// Mix tiers: the player's own actions and hits on the player are full level; nearby champions and objectives sit below that;
// routine minion fights are nearly silent and rate-limited. Everything tolerates partial data, because a guest's state is rebuilt from snapshots.
const SND = { level: 0, dmg: 0, send: 0, slow: 0, heart: 0, bolt: 0, coin: 0, coinT: 0, over: false, quiet: false, t: 0, paused: false, shots: [], zones: new Set(), chans: new Set(), danger: 0, keys: new Map() };
const SND_LADDER = [1, 1.125, 1.25, 1.335, 1.5];
let SND_SEEN = new WeakSet();

function initSound(g) {
  Object.assign(SND, { level: 0, dmg: 0, send: 0, slow: 0, heart: 0, bolt: 0, coin: 0, coinT: 0, over: false, quiet: false, t: 0, paused: false, shots: [], danger: 0 });
  SND.zones.clear(); SND.chans.clear(); SND.keys.clear(); SND_SEEN = new WeakSet();
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
const sndScaled = (o, k, low) => Object.assign(o, { vol: o.vol * k, low: !!low });

// True for an event already handled. The same object is never played twice, and a guest also compares content over a
// short window, so an event resent after a hiccup in the connection is not heard again.
function soundDup(e) {
  if (SND_SEEN.has(e)) return true; SND_SEEN.add(e);
  if (!G.net || G.net.role !== 'guest') return false;
  const now = performance.now(), k = [e.e, e.u, e.a, e.fx, e.by, e.t, e.team, sndNum(e.x) ? Math.round(e.x) : '', sndNum(e.y) ? Math.round(e.y) : ''].join('|');
  if (now - (SND.keys.get(k) || -1e9) < 200) return true;
  SND.keys.set(k, now);
  if (SND.keys.size > 240) for (const [key, at] of SND.keys) { if (now - at > 400) SND.keys.delete(key); }
  return false;
}

const SND_CAST = { snipe: 'snipe', snipeFull: 'snipeFull', deadeye: 'deadeye', orb: 'orb', ray: 'ray', chain: 'chain', bolt: 'bolt', mbolt: 'mbolt', tower: 'tshot', dash: 'dash', parry: 'parry', slash: 'slash', dome: 'dome', crash: 'whoosh', heal: 'heal', rupture: 'orb', stomp: 'stomp', break: 'break' };
const SND_BOOM = { crash: 'crash', stomp: 'stomp', rupture: 'rupture', heal: 'heal', break: 'break', dome: 'dome', deadeye: 'blast', snipeFull: 'blast' };
// Seconds until a shot of the player's can no longer connect; if nothing has been hit by then, it missed.
const SND_SHOT = { snipe: .62, snipeFull: .72, deadeye: .6, orb: .85, ray: .8, chain: .78, slash: .22 };

function soundHit(e, me) {
  const u = soundUnit(e.u), by = e.by ? soundUnit(e.by) : null; if (!u) return;
  const a = sndNum(e.a) ? e.a : 0, onMe = u.id === me.id, byMe = !!by && by.id === me.id, champTarget = u.kind === 'champ';
  if (onMe) SND.dmg = Math.min(1, SND.dmg + a / Math.max(1, me.maxHp || 1) * 2.4);
  // Scaled by the size of the hit, so a minion's chip damage does not thump like a champion's combo.
  if (onMe) { Sound.play('thud', undefined, 130, { vol: Math.min(1, .38 + a / Math.max(1, me.maxHp || 1) * 7) }); return; }
  const o = soundAt(u.x, u.y);
  if (byMe) {
    if (e.sk) SND.shots.shift();
    if (!o) return;
    // Matches the comic words in fx.js: a word shows on a skill, a crit, or 70+ damage, and it is the big size from 110.
    const word = (e.sk || e.crit || a >= 70) && u.kind !== 'tower', heavy = a >= 110 || e.crit, pan = { pan: o.pan };
    if (word) Sound.play(heavy ? 'bam' : 'pow', undefined, 60, champTarget ? pan : { pan: o.pan, vol: .7 });
    else Sound.play('hit', undefined, 55, { pan: o.pan, vol: champTarget ? 1 : .75 });
    if (e.sk) Sound.play('hitConfirm', champTarget ? 1 : .94, 80, { vol: champTarget ? 1 : .6 });
    return;
  }
  if (!o) return;
  const champFight = champTarget || (by && by.kind === 'champ');
  if (champFight && o.d < 1.5) {
    if (e.sk) Sound.play('hitHard', undefined, 90, sndScaled(o, .5));
    else Sound.play('hit', undefined, 110, sndScaled(o, .34, true));
  } else if (o.d < .7) Sound.play('tick', undefined, 300, sndScaled(o, .1, true));
}

function soundEv(e, me) {
  const at = u => u ? soundAt(u.x, u.y) : null, mine = id => id === me.id;
  switch (e.e) {
    case 'cast': {
      const u = soundUnit(e.u), name = SND_CAST[e.fx]; if (!u || !name) return;
      if (mine(u.id)) {
        Sound.play(name, undefined, 30);
        if (SND_SHOT[e.fx]) { SND.shots.push(G.t + SND_SHOT[e.fx]); if (SND.shots.length > 4) SND.shots.shift(); }
        return;
      }
      const o = at(u); if (o && o.d < 1.4) Sound.play(name, undefined, 70, sndScaled(o, u.team === me.team ? .4 : .62, u.team === me.team));
      return;
    }
    case 'boom': { const name = SND_BOOM[e.fx] || 'blast', o = soundAt(e.x, e.y); if (o) Sound.play(name, undefined, 90, sndScaled(o, o.d < 1 ? .75 : .45)); return; }
    case 'phit': { if (e.fx === 'dome') { const o = soundAt(e.x, e.y); if (o && o.d < 1.2) Sound.play('clink', 1.15, 90, sndScaled(o, .6)); } return; }
    case 'blink': { const o = soundAt(e.x, e.y); if (o && o.d < 1.3) Sound.play('blink', undefined, 70, sndScaled(o, .8)); return; }
    case 'hit': soundHit(e, me); return;
    case 'die': {
      if (e.kind === 'champ') {
        if (mine(e.u)) { Sound.play('death', undefined, 300); return; }
        const o = soundAt(e.x, e.y, mine(e.by) ? .95 : .28); if (o) Sound.play('kill', undefined, 120, o);
      } else if (e.kind === 'tower') { const o = soundAt(e.x, e.y, .35); if (o) Sound.play('tower', undefined, 200, o); }
      return;
    }
    case 'gold': {
      if (!mine(e.u)) return;
      const small = sndNum(e.a) && e.a < 15;
      if (!small) { SND.coin = G.t - SND.coinT < 1.4 ? Math.min(SND_LADDER.length - 1, SND.coin + 1) : 0; SND.coinT = G.t; }
      Sound.play('coin', SND_LADDER[SND.coin], small ? 160 : 60, { vol: small ? .35 : .8 }); return;
    }
    case 'parry': { const u = soundUnit(e.u); if (u && mine(u.id)) Sound.play('parry', undefined, 60); else { const o = at(u); if (o) Sound.play('parry', undefined, 80, sndScaled(o, .6)); } return; }
    case 'level': { if (mine(e.u)) Sound.play('level', undefined, 200); return; }
    case 'boss': Sound.play('boss', undefined, 400, { vol: .85 }); return;
    case 'bossup': Sound.play('bossup', undefined, 400, { vol: .85 }); return;
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
      const kit = Sim.KITS && Sim.KITS[u.champ], name = kit && kit.melee ? 'swing' : 'bolt';
      if (mine(u.id)) Sound.play(name, undefined, 40, { vol: .85 });
      else { const o = at(u); if (o && o.d < 1) Sound.play(name, undefined, 130, sndScaled(o, .3, true)); }
      return;
    }
    case 'heal': { if (mine(e.u) && sndNum(e.a) && e.a >= 40) Sound.play('mark', undefined, 350, { vol: .7 }); return; }
    case 'stun': { const u = soundUnit(e.u); if (u && mine(u.id)) Sound.play('stun', undefined, 150); else { const o = at(u); if (o && o.d < 1.2) Sound.play('stun', undefined, 200, sndScaled(o, .5)); } return; }
    case 'mark': { const u = soundUnit(e.u), o = at(u); if (o && o.d < 1.2) Sound.play('mark', undefined, 150, sndScaled(o, .6)); return; }
    case 'civ': { const o = soundAt(e.x, e.y, .3); if (o) Sound.play(e.team === 0 ? 'rescued' : 'seized', undefined, 300, sndScaled(o, .8)); return; }
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
function soundFrame(dt) { try { soundTick(dt); } catch (err) { } }
