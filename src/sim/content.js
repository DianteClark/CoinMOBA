  // ---------- Flipside 5.0 content: 12 kits, passives, builds, evolves, items. Concatenated into the Sim closure at /*CONTENT*/.
  // Numbers live on the ability so builds and evolves can change them with plain data (see applyMods).
  const CHARS = {
    hero: {
      vesper: { name: 'Longshot', title: 'The watchful marksman' }, kade: { name: 'Captain Riposte', title: 'Master of the counter' },
      ione: { name: 'Starling', title: 'Caller of falling stars' }, solenne: { name: 'Dawnbringer', title: 'Healer of the first light' },
      sable: { name: 'Nightfall', title: 'Quiet hand of justice' }, gravel: { name: 'Bulwark', title: 'The wall that walks' },
      voltaic: { name: 'Voltaic', title: 'First at every scene' }, tidecaller: { name: 'Tidecaller', title: 'The harbour keeps her promises' }, paragon: { name: 'Paragon', title: 'The sky is not the limit' }, mirage: { name: 'Mirage', title: 'Three of her, none of her' },
    },
    villain: {
      deadbolt: { name: 'Deadbolt', title: 'Locks on and waits' }, duelist: { name: 'The Duelist', title: 'Never dropped a grudge' },
      hex: { name: 'Madame Hex', title: 'Curses by appointment' }, plague: { name: 'The Plague Doctor', title: 'Prescribes only trouble' },
      shiv: { name: 'Shiv', title: 'Gone before you look' }, ironjaw: { name: 'Ironjaw', title: 'Bites through bank vaults' },
      cinder: { name: 'Cinder', title: 'Burns her bridges, and yours' }, ravager: { name: 'Ravager', title: 'Something got out of the zoo' }, cataclysm: { name: 'Cataclysm', title: 'The end of the block' }, puppeteer: { name: 'The Puppeteer', title: 'Pulls every string in town' },
    },
  };
  const ROSTER = [['vesper', 'kade', 'ione', 'solenne', 'sable', 'gravel', 'voltaic', 'tidecaller', 'paragon', 'mirage'], ['deadbolt', 'duelist', 'hex', 'plague', 'shiv', 'ironjaw', 'cinder', 'ravager', 'cataclysm', 'puppeteer']];
  const charOf = (team, kit) => CHARS.hero[kit] || CHARS.villain[kit] || CHARS[team ? 'villain' : 'hero'][ROSTER[team ? 1 : 0][0]];
  // Every tower must out-range every basic attack by 70, so nothing can plink a tower from outside its reach.
  const TOWER_RANGE = 430, CORE_RANGE = 470, MAX_ATTACK_RANGE = TOWER_RANGE - 70;

  // ---------- shared status helpers ----------
  const shield = (s, t, amt, dur) => { t.shieldHp = Math.max(t.shieldHp > 0 && t.shieldT > 0 ? t.shieldHp : 0, 0) + amt; t.shieldT = Math.max(t.shieldT || 0, dur); s.ev.push({ e: 'shield', u: t.id, a: Math.round(amt) }); };
  const haste = (t, a, d) => { t.hasteA = Math.max(t.hasteT > 0 ? t.hasteA : 0, a); t.hasteT = Math.max(t.hasteT || 0, d); };
  const root = (s, t, d) => { if (t.kind === 'tower' || t.boss || t.evT > 0) return; t.rootT = Math.max(t.rootT || 0, d); if (t.dash && !t.dash.unstop && !t.dash.forced) t.dash = null; if (t.charge) t.charge = null; s.ev.push({ e: 'root', u: t.id }); };
  const knock = (s, t, d) => { if (t.kind === 'tower' || t.boss || t.evT > 0) return; if (t.champ === 'gravel' && t.hp > t.maxHp * .4) { stun(s, t, d * .5); return; } stun(s, t, d); t.knockT = t.knockMax = Math.max(t.knockT || 0, d); s.ev.push({ e: 'knock', u: t.id }); };
  const poly = (s, t, d) => { if (t.kind === 'tower' || t.boss) return; stun(s, t, d); t.polyT = Math.max(t.polyT || 0, d); s.ev.push({ e: 'poly', u: t.id }); };
  const poison = (s, c, t, dps, d) => { if (t.kind === 'tower') return; t.poisonT = Math.max(t.poisonT || 0, d); t.poisonDps = Math.max(t.poisonT > 0 ? t.poisonDps || 0 : 0, dps); t.poisonBy = c; t.poisonAbil = curAbil; };
  const bleed = (s, c, t, dps, d) => { if (t.kind === 'tower') return; t.bleedDps = t.bleedT > 0 ? Math.max(t.bleedDps, dps) : dps; t.bleedT = Math.max(t.bleedT || 0, d); t.bleedBy = c; t.bleedAbil = curAbil; };
  const hpow = c => pow(c) * (1 + c.st.healPow) * (c.prof === 'guardian' ? 1.2 : 1);
  const curseCap = c => c.f && c.f.cursebinder ? 5 : 3;
  const curse = (s, c, t, n) => { t.curseN = Math.min(curseCap(c), (t.curseT > 0 ? t.curseN || 0 : 0) + n); t.curseT = c.f.cursebinder ? 9 : 6; t.curseBy = c; s.ev.push({ e: 'curse', u: t.id, n: t.curseN }); };
  const stealth = (s, c, d) => { c.stealthT = Math.max(c.stealthT || 0, d); c.revealT = 0; s.ev.push({ e: 'stealth', u: c.id, on: true }); };
  const breakStealth = (s, c) => { if (c.stealthT > 0) { c.stealthT = 0; if (c.champ === 'shiv') c.opener = 1.2; s.ev.push({ e: 'stealth', u: c.id, on: false }); } };
  // Line and timed zones. kind names are the art contract: tripline lockdown coven miasma quarantine ring tether orbit fissure decoy.
  function field(s, c, kind, o) { const z = Object.assign({ id: s.nid++, kind, team: c.team, owner: c, t: o.dur, total: o.dur, counted: false, fx: kind, abil: curAbil }, o); s.zones.push(z); return z; }
  function lineZone(o, x1, y1, x2, y2) { o.x1 = x1; o.y1 = y1; o.x2 = x2; o.y2 = y2; o.x = (x1 + x2) / 2; o.y = (y1 + y2) / 2; o.line = true; return o; }
  // Enemies inside a circle, each passed once; never through a wall when `los` is set.
  const enemiesIn = (s, c, x, y, r, los) => { const out = []; eachEnemy(s, c, x, y, r, t => { if (!los || hasLOS(x, y, t.x, t.y)) out.push(t); }); return out; };
  const alliesIn = (s, team, x, y, r) => s.champs.filter(a => a.alive && a.team === team && Math.hypot(a.x - x, a.y - y) < r);
  const lowestAlly = (s, c, r, incl) => { let b = null, f = 2; for (const a of alliesIn(s, c.team, c.x, c.y, r)) { if (!incl && a === c) continue; const v = a.hp / a.maxHp; if (v < f) { f = v; b = a; } } return b; };
  const cone = (s, c, a, reach, dot, fn) => { let n = 0; eachEnemy(s, c, c.x, c.y, reach, t => { const v = norm(t.x - c.x, t.y - c.y); if (v.x * a.dx + v.y * a.dy >= dot && hasLOS(c.x, c.y, t.x, t.y)) { fn(t); n += t.kind === 'champ' ? 1 : 0; } }); return n; };
  // Faces the nearest visible enemy champion in reach, for tap-to-fire abilities on a phone.
  const autoFace = (s, c, reach) => { const t = nearChamp(s, c, c.x, c.y, reach); if (t && hasLOS(c.x, c.y, t.x, t.y)) { const n = norm(t.x - c.x, t.y - c.y); c.fx = n.x; c.fy = n.y; return { dx: n.x, dy: n.y, t }; } return { dx: c.fx || 1, dy: c.fy || 0, t: null }; };

  // ---------- 10.0 kit helpers ----------
  function arcBolt(s, c, from, dmg, n, name) { const list = enemiesIn(s, c, from.x, from.y, 260, true).filter(e => e !== from).sort((a, b) => (b.kind === 'champ') - (a.kind === 'champ')).slice(0, n); const was = curAbil; curAbil = name; for (const e of list) { hurt(s, c, e, dmg, { skill: 1 }); s.ev.push({ e: 'phit', x: e.x, y: e.y, fx: 'thunder' }); } curAbil = was; }
  function tideTick(s, c) { c.tideN = (c.tideN || 0) + 1; c.pstack = c.tideN % 3; if (c.tideN % 3) return; s.ev.push({ e: 'boom', x: c.x, y: c.y, r: 180, fx: 'riptide' }); for (const a of alliesIn(s, c.team, c.x, c.y, c.f.wellspring ? 420 : 300)) heal(s, c, a, a.maxHp * .05); }
  function skyLand(s, c, r, dmg, slowA, stunT, fx) { s.ev.push({ e: 'boom', x: c.x, y: c.y, r, fx }); let hit = false; eachEnemy(s, c, c.x, c.y, r, t => { hurt(s, c, t, dmg, { skill: 1 }); if (t.kind === 'champ') { hit = true; if (stunT) stun(s, t, stunT); else if (slowA) slow(t, slowA, 1.2); } }); if (hit) c.stats.skillHits++; c.altN = 3; if (c.f.freeflight) heal(s, c, c, c.maxHp * .1); }
  function kindle(s, c, t, n) { if (t.kind === 'tower') return; const had = t.kindleT > 0 ? t.kindleN || 0 : 0, v = had + n; t.kindleT = 5; if (v < 3) { t.kindleN = v; return; } t.kindleN = 0; hurt(s, c, t, 62 * pow(c) * (c.f.pyre ? 1.25 : 1), { skill: 1, crit: 1 }); s.ev.push({ e: 'boom', x: t.x, y: t.y, r: 80, fx: 'ignite' }); if (t.alive) bleed(s, c, t, 26 * pow(c) * (c.f.pyre ? 1.4 : 1), 2.5); if (c.f.wildfire) for (const o of enemiesIn(s, c, t.x, t.y, 220, true)) if (o !== t) kindle(s, c, o, 1); }
  function string(s, c, t) { t.stringT = 3; t.stringK = c.f.cutstrings ? 1.12 : 1.08; t.stringBy = c.team; }

  const KITS = {
    // ---------- Heroes ----------
    vesper: {
      name: 'Vesper', role: 'Marksman', blurb: 'Charge your shot while they try to read it.',
      sight: 950, hp: 540, hpG: 72, dmg: 60, dmgG: 7, armor: 16, armG: 3, range: 360, as: 1.0, ms: 305, pref: 325, fit: { top: 1, jungle: 0, bottom: 3, support: 0 },
      passive: { name: 'Steady Hand', d: 'Stand still for a moment and your next basic attack hits 30% harder. Long Shot deals 25% more to targets over 480 away.' },
      builds: [
        { id: 'marksman', name: 'Marksman', tag: 'Long range', d: 'Long Shot reaches farther and full charges hit far harder, but Smoke Step comes back slowly.', mods: { 0: { range_add: 135, dmgF_add: 60, d: 'Hold to charge. Reaches very far; a full charge pierces and hits hard.' }, 1: { cd_add: 3 } } },
        { id: 'skirmisher', name: 'Skirmisher', tag: 'Kiting', d: 'Hit a champion with your empowered attack to refund most of Smoke Step. Long Shot charges fast but stays short.', stats: { as: 1.12 }, mods: { 0: { charge: .55, range_add: -135, dmgF_add: -50, d: 'Quick charge, shorter reach.' }, 1: { cd_add: -2, d: 'Dash. Your next attack hits harder; landing it on a champion refunds most of the cooldown.' } } },
        { id: 'spotter', name: 'Spotter', tag: 'Vision', d: 'Long Shot reveals who it hits for your whole team. Deadeye scans every enemy champion when fired.', mods: { 0: { d: 'Hold to charge. Hits reveal the target to your team.' }, 2: { cd_add: -8, dmg_add: -60, d: 'The longest shot in the game. Firing reveals all enemy champions for 2 seconds.' } } },
        { id: 'executioner', name: 'Executioner', tag: 'Finisher', d: 'Deadeye comes up far more often and finishes low targets. Long Shot hits hurt targets harder.', mods: { 0: { d: 'Hold to charge. Targets under half health take more.' }, 2: { cd: 32, dmg_add: -70, d: 'Deadeye adds 45% of the target\'s missing health. A kill refunds most of the cooldown.' } } },
      ],
      evolves: [
        [{ id: 'swiftdraw', name: 'Swift Draw', d: 'Long Shot charges 25% faster.', mods: { 0: { charge_mul: .75 } } }, { id: 'smokescreen', name: 'Smokescreen', d: 'Smoke Step leaves a cloud that slows enemies by 35%.' }],
        [{ id: 'overpen', name: 'Overpenetration', d: 'Deadeye passes through champions, losing a quarter of its power each time.' }, { id: 'stillness', name: 'Absolute Stillness', d: 'Steady Hand arms twice as fast and also crits.' }],
      ],
      kit: [
        { name: 'Long Shot', d: 'Hold to charge. A full charge pierces.', fx: 'snipe', cd: 6, range: 600, minRange: 375, shape: 'line', w: 34, charge: 1.1, dmg: 70, dmgF: 120,
          cast(s, c, a, A) {
            const f = c.charge ? clamp(c.charge.t / A.charge, 0, 1) : 0, ox = c.x, oy = c.y; c.charge = null;
            fire(s, c, a, { speed: 1600, range: A.minRange + (A.range - A.minRange) * f, w: 28 + 8 * f, fx: f >= 1 ? 'snipeFull' : 'snipe', pierce: f >= 1, filter: 'units',
              hit(s, c, t, p) { hurt(s, c, t, (A.dmg + A.dmgF * f) * pow(c) * (c.f.executioner && t.hp < t.maxHp * .5 ? 1.3 : 1) * (Math.hypot(t.x - ox, t.y - oy) > 480 ? 1.25 : 1), { skill: 1 }); if (t.kind === 'champ') { skillHit(c, p); if (c.f.spotter) t.revealT = Math.max(t.revealT || 0, 4); } } });
          },
        },
        { name: 'Smoke Step', d: 'Dash. Your next basic attack hits harder.', fx: 'dash', cd: 9, range: 200, shape: 'dash', w: 60, pd: [200, 1200],
          cast(s, c, a, A) { dashDir(c, a.dx, a.dy, A.range, 1200); c.empowerT = 3; if (c.f.smokescreen) field(s, c, 'miasma', { x: c.x, y: c.y, r: 130, dur: 2.4, fx: 'smoke', step(s, z) { if (s.tick % 6 === 0) for (const t of enemiesIn(s, c, z.x, z.y, z.r)) slow(t, .35, .4); } }); if (c.f.skirmisher) c.stillT = 2; },
        },
        { name: 'Deadeye', d: 'The longest shot in the game. Everyone sees it coming.', fx: 'deadeye', cd: 50, range: 800, shape: 'line', w: 50, windup: true, dmg: 260,
          cast(s, c, a, A) {
            if (c.f.spotter) for (const e of s.champs) if (e.alive && e.team !== c.team) e.revealT = Math.max(e.revealT || 0, 2);
            c.chan = { t: .7, total: .7, kind: 'line', slot: 2, dx: a.dx, dy: a.dy, len: rayWall(c.x, c.y, a.dx, a.dy, A.range), w: 50, fn(s, c) {
              s.ev.push({ e: 'fire', u: c.id, fx: 'deadeye', dx: a.dx, dy: a.dy });
              let pw = 1;
              fire(s, c, a, { speed: 2600, range: A.range, w: 50, fx: 'deadeye', filter: 'champ', pierce: !!c.f.overpen, hit(s, c, t, p) {
                const x = (A.dmg * pow(c) + (c.f.executioner ? (t.maxHp - t.hp) * .45 : 0)) * pw;
                const dead = hurt(s, c, t, x, { skill: 1, crit: c.f.executioner && t.hp < t.maxHp * .35 ? 1 : 0 }) && !t.alive; skillHit(c, p); if (c.f.executioner && dead) c.cd[2] = Math.min(c.cd[2], 10);
                if (c.f.overpen) pw *= .75; else p.left = 0;
              } });
            } };
          },
        },
      ],
      tick(s, c) { const need = c.f.stillness ? .6 : 1.2; if (Math.hypot(c.mv.x, c.mv.y) < .05 && !c.dash) c.stillT = (c.stillT || 0) + DT; else if (!c.f.skirmisher || (c.stillT || 0) < 1.9) c.stillT = 0; c.pready = c.stillT >= need ? 1 : 0; },
      onBasic(s, c, t, o) { if (c.pready) { o.dmg *= c.f.stillness ? 1.5 : 1.3; o.crit = c.f.stillness ? true : o.crit; c.stillT = 0; c.pready = 0; } if (c.f.skirmisher && o.empowered && t.kind === 'champ') c.cd[1] *= .3; },
    },
    kade: {
      name: 'Kade', role: 'Duelist', blurb: 'Time the parry and the fight is yours.',
      sight: 720, hp: 640, hpG: 95, dmg: 64, dmgG: 8, armor: 28, armG: 4, range: 140, as: .95, ms: 325, pref: 105, melee: true, fit: { top: 3, jungle: 2, bottom: 0, support: 0 },
      passive: { name: 'Riposte', d: 'After a successful Parry, or Lunging into a champion, your next attack hits 60% harder and slows. A parried champion takes back 60% of the blow.' },
      builds: [
        { id: 'parrymaster', name: 'Parrymaster', tag: 'Counter', d: 'Parry comes up fast, holds longer and stuns longer. Lunge comes back slower.', mods: { 1: { cd: 7, parry: .7, stunT: 1.25, d: 'Near-constant block. Catching a hit stuns the attacker longer.' }, 0: { cd_add: 2 } } },
        { id: 'blitz', name: 'Blitz', tag: 'Engage', d: 'Lunge reaches farther and refunds on champions. Crash leaps far more often, but Parry is a sliver of a window.', mods: { 0: { range: 255, pd: [255, 1200], pdr: [225, 1200], d: 'Long dash. Hit a champion and you can dash again.' }, 2: { cd: 30, range: 465 }, 1: { parry: .32 } } },
        { id: 'vanguard', name: 'Vanguard', tag: 'Frontline', d: 'Parries shield nearby allies. Crash shields everyone you land beside. Sturdy, lighter hits.', stats: { hp: 1.1, dmg: .9 }, mods: { 1: { d: 'Half a second of perfect block. A catch also shields nearby allies.' }, 2: { d: 'Leap, untouchable, and land with a stun. Shields nearby allies.' } } },
        { id: 'breaker', name: 'Breaker', tag: 'Split push', d: 'Basic attacks and Lunge shred towers. Lunge chews through waves. Weak in long team fights.', stats: { dmg: 1.05, hp: .95 }, mods: { 0: { dmg_add: 18, d: 'Dash through a line. Strong against minions and towers.' } } },
      ],
      evolves: [
        [{ id: 'longlunge', name: 'Long Lunge', d: 'Lunge reaches 45 farther.', mods: { 0: { range_add: 45 } } }, { id: 'reflex', name: 'Quick Reflexes', d: 'Parry cooldown is 2 seconds shorter.', mods: { 1: { cd_add: -2 } } }],
        [{ id: 'aftershock', name: 'Aftershock', d: 'Crash leaves shaking ground that slows for 2.5 seconds.' }, { id: 'heroicfall', name: 'Heroic Fall', d: 'Crash cooldown 10 shorter, and landing heals you for 15%.', mods: { 2: { cd_add: -10 } } }],
      ],
      kit: [
        { name: 'Lunge', d: 'Dash through a line. Hit a champion and you can dash again.', fx: 'dash', cd: 7, range: 220, shape: 'dash', w: 80, pd: [220, 1100], pdr: [195, 1100], dmg: 74,
          cast(s, c, a, A) { const car = {}; dashDir(c, a.dx, a.dy, A.range, 1100, { onHit(s, c, t) { hurt(s, c, t, A.dmg * pow(c) * (c.f.breaker && t.kind !== 'champ' ? 1.6 : 1), { skill: 1 }); if (t.kind === 'champ') { skillHit(c, car); c.recast[0] = 2.5; c.ripT = 3.5; if (c.f.blitz) c.cd[0] *= .6; } } }); },
          recast(s, c, a, A) { dashDir(c, a.dx, a.dy, Math.min(A.range, 195), 1100, { onHit(s, c, t) { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); } }); },
        },
        { name: 'Parry', d: 'Half a second of perfect block. Catch a hit to stun the attacker.', fx: 'parry', cd: 11, range: 0, shape: 'self', instant: true, noCdr: true, parry: .5, stunT: .9,
          cast(s, c, a, A) { c.parryT = A.parry; c.parryStun = A.stunT; },
        },
        { name: 'Crash', d: 'Leap, untouchable, and land with a stun at the centre.', fx: 'crash', cd: 45, range: 390, shape: 'circle', r: 165, over: true, dmg: 185,
          cast(s, c, a, A) {
            c.air = .45; c.leap = { sx: c.x, sy: c.y, tx: a.tx, ty: a.ty, t: 0, total: .45, fn(s, c) {
              s.ev.push({ e: 'boom', x: c.x, y: c.y, r: A.r, fx: 'crash' });
              let hit = false;
              eachEnemy(s, c, c.x, c.y, A.r, t => { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.kind === 'champ') { hit = true; if (Math.hypot(t.x - c.x, t.y - c.y) < 95 + t.r) stun(s, t, 1); else slow(t, .4, 1.5); } });
              if (hit) c.stats.skillHits++;
              if (c.f.heroicfall) heal(s, c, c, c.maxHp * .15);
              if (c.f.vanguard) for (const al of alliesIn(s, c.team, c.x, c.y, 300)) shield(s, al, 120 * hpow(c), 4);
              if (c.f.aftershock) field(s, c, 'miasma', { x: c.x, y: c.y, r: A.r, dur: 2.5, fx: 'crash', step(s, z) { if (s.tick % 6 === 0) for (const t of enemiesIn(s, c, z.x, z.y, z.r)) slow(t, .35, .4); } });
            } };
          },
        },
      ],
      onBasic(s, c, t, o) { if (c.ripT > 0) { c.ripT = 0; o.dmg *= 1.6; o.crit = true; slow(t, .3, 1.2); } if (c.f.breaker && t.kind === 'tower') o.dmg *= 1.35; },
      tick(s, c) { c.pready = c.ripT > 0 ? 1 : 0; },
    },
    ione: {
      name: 'Ione', role: 'Mage', blurb: 'Mark them, then break the mark.',
      sight: 850, hp: 500, hpG: 68, dmg: 50, dmgG: 5, armor: 14, armG: 3, range: 320, as: .85, ms: 300, pref: 290, fit: { top: 1, jungle: 0, bottom: 2, support: 2 },
      passive: { name: 'Stardust', d: 'Breaking a mark refunds 2 seconds of Sigil Orb, restores a little health and throws a new mark onto the nearest enemy.' },
      builds: [
        { id: 'constellation', name: 'Constellation', tag: 'Burst', d: 'Marks linger, Sigil Orb is quick, and Rupture hits marked targets far harder and unmarked ones barely.', mods: { 0: { cd: 3.2, markT: 7 }, 1: { dmg_add: -40, dmgM_add: 75, d: 'Ground blast. Barely hurts unmarked targets; marked targets take massive damage and a stun.' } } },
        { id: 'meteor', name: 'Meteor', tag: 'Zone', d: 'Rupture falls slow and huge. Hit where they must stand.', mods: { 1: { cd_add: 2, r: 150, delay: .9, dmg_add: 75, dmgM_add: 75, d: 'A slow, wide ground blast.' }, 2: { d: 'Three slow meteors walk forward. Each one marks.', delay_add: .35, dmg_add: 40 } } },
        { id: 'comet', name: 'Comet', tag: 'Poke', d: 'Sigil Orb flies far and fast through minions. Rupture is a small quick snap.', mods: { 0: { range: 645, speed: 1400, cd_add: .8, passThrough: true, d: 'Long, fast and passes through minions. Marks the first champion hit.' }, 1: { r: 75, delay: .24, cd_add: -1.5, dmg_add: -15, d: 'A small, near-instant blast.' } } },
        { id: 'stellar', name: 'Guiding Star', tag: 'Support', d: 'Sigil Orb flies through allies and shields them. Cascade hastens allies it passes.', mods: { 0: { d: 'Passes through allies, shielding them. Marks the first enemy hit.' }, 2: { d: 'Three blasts walk forward. Each marks enemies and hastens allies.' } } },
      ],
      evolves: [
        [{ id: 'swiftsigil', name: 'Swift Sigil', d: 'Sigil Orb cooldown 0.8 shorter.', mods: { 0: { cd_add: -.8 } } }, { id: 'widerupture', name: 'Wide Rupture', d: 'Rupture radius 20 larger.', mods: { 1: { r_add: 20 } } }],
        [{ id: 'longcascade', name: 'Long Cascade', d: 'Cascade adds a fourth blast.' }, { id: 'starsurge', name: 'Star Surge', d: 'Cascade\'s last blast stuns champions for 0.8.' }],
      ],
      kit: [
        { name: 'Sigil Orb', d: 'Marks the first enemy it hits.', fx: 'orb', cd: 4, range: 480, shape: 'line', w: 42, speed: 950, dmg: 92, markT: 4,
          cast(s, c, a, A) { fire(s, c, a, { speed: A.speed, range: A.range, w: A.w, fx: 'orb', filter: c.f.stellar ? "allunits" : A.passThrough ? "champ" : "units", hit(s, c, t, p) {
            if (t.team === c.team) { shield(s, t, 90 * hpow(c), 3); p.pass = 1; return; }
            hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); t.markT = A.markT; s.ev.push({ e: 'mark', u: t.id }); if (t.kind === 'champ') skillHit(c, p); p.left = 0; } }); },
        },
        { name: 'Rupture', d: 'Ground blast. Breaks marks for double damage and a stun.', fx: 'rupture', cd: 6.5, range: 405, shape: 'circle', r: 100, delay: .42, dmg: 85, dmgM: 180,
          cast(s, c, a, A) { const car = {}; blast(s, c, a.tx, a.ty, A.r, A.delay, (s, z) => { eachEnemy(s, c, z.x, z.y, A.r, t => { const m = t.markT > 0; hurt(s, c, t, (m ? A.dmgM : A.dmg) * pow(c), { skill: 1 }); if (m) { t.markT = 0; if (t.kind === 'champ') { stun(s, t, 1); c.cd[0] = Math.max(0, c.cd[0] - 2); heal(s, c, c, c.maxHp * .03); const nx = enemiesIn(s, c, t.x, t.y, 320, true).find(e => e !== t && e.kind === 'champ'); if (nx) { nx.markT = 4; s.ev.push({ e: 'mark', u: nx.id }); } } s.ev.push({ e: 'boom', x: t.x, y: t.y, r: 60, fx: 'break' }); } if (t.kind === 'champ') skillHit(c, car); }); }, 'rupture'); },
        },
        { name: 'Cascade', d: 'Three blasts walk forward. Each one marks.', fx: 'rupture', cd: 46, range: 480, shape: 'line', w: 170, delay: 0, dmg: 115,
          cast(s, c, a, A) { const reach = rayWall(c.x, c.y, a.dx, a.dy, A.range), n = c.f.longcascade ? 4 : 3; for (let i = 0; i < n; i++) { const dl = .32 + i * .28 + A.delay, k = 165 + i * 150, car = {}, last = i === n - 1; if (k > reach + 60) continue; blast(s, c, c.x + a.dx * k, c.y + a.dy * k, 118, dl, (s, z) => { eachEnemy(s, c, z.x, z.y, 118, t => { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); t.markT = 4; if (t.kind === 'champ') { skillHit(c, car); if (c.f.starsurge && last) stun(s, t, .8); } }); if (c.f.stellar) for (const al of alliesIn(s, c.team, z.x, z.y, 170)) haste(al, .2, 2.5); }, 'rupture'); } },
        },
      ],
    },
    solenne: {
      name: 'Solenne', role: 'Support', blurb: 'Every heal is a shot you can miss.',
      sight: 850, hp: 540, hpG: 76, dmg: 46, dmgG: 5, armor: 20, armG: 3.5, range: 300, as: .85, ms: 310, pref: 270, support: true, fit: { top: 0, jungle: 0, bottom: 1, support: 3 },
      passive: { name: 'First Light', d: 'Your heals give 15% move speed for 2 seconds, and healing past full health becomes a shield.' },
      builds: [
        { id: 'lifebringer', name: 'Lifebringer', tag: 'Healer', d: 'Mending Ray pierces allies and heals more, and Daybreak heals enormously. Your burn is weak.', stats: { dmg: .9 }, mods: { 0: { heal_add: 40, dmg_add: -20, cd_add: -.5, d: 'Heals every ally it passes. Burns the first enemy, weakly.' }, 2: { heal_add: 120 } } },
        { id: 'protector', name: 'Protector', tag: 'Shields', d: 'Aegis is wider, lasts longer and refreshes faster. Allies inside are shielded.', mods: { 1: { cd: 9.5, r_add: 30, dur: 3.6, d: 'A wide dome that destroys projectiles and shields allies inside.' } } },
        { id: 'sunlance', name: 'Sunlance', tag: 'Damage', d: 'Mending Ray burns hard and sets targets alight. Weaker heals. Viable bottom.', stats: { dmg: 1.12 }, mods: { 0: { dmg_add: 42, heal_add: -35, d: 'Burns the first enemy hard, leaving them alight. Heals weakly.' } } },
        { id: 'radiant', name: 'Radiant', tag: 'Aura', d: 'Mending Ray hops from an ally to another nearby. Nearby allies slowly regenerate.', mods: { 0: { d: 'Heals the first ally it hits, then hops to another nearby ally for 60%.' } } },
      ],
      evolves: [
        [{ id: 'quickray', name: 'Quick Ray', d: 'Mending Ray cooldown 1 shorter.', mods: { 0: { cd_add: -1 } } }, { id: 'longray', name: 'Long Ray', d: 'Mending Ray reaches 90 farther.', mods: { 0: { range_add: 90 } } }],
        [{ id: 'sundome', name: 'Sun Dome', d: 'Aegis heals allies inside it.' }, { id: 'solaris', name: 'Solaris', d: 'Daybreak also hastens allies and its cooldown is 10 shorter.', mods: { 2: { cd_add: -10 } } }],
      ],
      kit: [
        { name: 'Mending Ray', d: 'Heals the first ally it hits, or burns the first enemy.', fx: 'ray', cd: 5, range: 510, shape: 'line', w: 46, heal: 132, dmg: 82,
          cast(s, c, a, A) { fire(s, c, a, { speed: 1150, range: A.range, w: 46, fx: 'ray', filter: 'allchamp', hit(s, c, t, p) {
            if (t.team === c.team) { heal(s, c, t, A.heal * pow(c)); haste(t, .15, 2); skillHit(c, p); if (c.f.lifebringer) { p.pass = 1; return; } if (c.f.radiant && !p.hopped) { p.hopped = 1; const o = s.champs.find(x => x !== t && x !== c && x.alive && x.team === c.team && Math.hypot(x.x - t.x, x.y - t.y) < 280 && hasLOS(t.x, t.y, x.x, x.y)); if (o) heal(s, c, o, A.heal * .6 * pow(c)); } }
            else { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); slow(t, .3, 1.5); if (c.f.sunlance) bleed(s, c, t, 20 * pow(c), 2.5); skillHit(c, p); }
            p.left = 0; } }); },
        },
        { name: 'Aegis', d: 'Place a dome that destroys enemy projectiles.', fx: 'dome', cd: 12, range: 345, shape: 'circle', r: 120, dur: 2.6,
          cast(s, c, a, A) {
            const z = field(s, c, 'dome', { x: a.tx, y: a.ty, r: A.r, dur: A.dur, fx: 'dome' });
            z.step = c.f.protector || c.f.sundome ? (s, z) => { if (s.tick % 15 === 0) for (const al of alliesIn(s, c.team, z.x, z.y, z.r)) { if (c.f.protector && !z.sh) shield(s, al, 70 * hpow(c), 2); if (c.f.sundome) heal(s, c, al, 28 * pow(c)); } z.sh = 1; } : null;
          },
        },
        { name: 'Daybreak', d: 'Heals allies around you, cleanses stuns and throws enemies back.', fx: 'heal', cd: 52, range: 0, shape: 'self', r: 270, heal: 230,
          cast(s, c, a, A) { blast(s, c, c.x, c.y, A.r, .3, (s, z) => {
            for (const e of s.champs) if (e.alive && Math.hypot(e.x - z.x, e.y - z.y) < A.r) {
              if (e.team === c.team) { heal(s, c, e, A.heal * pow(c)); e.stunT = 0; e.slowT = 0; e.rootT = 0; if (c.f.solaris) haste(e, .25, 3); }
              else { const n = norm(e.x - z.x, e.y - z.y); hurt(s, c, e, 90 * pow(c), { skill: 1 }); dashDir(e, n.x, n.y, 160, 800, { forced: true }); }
            }
            c.stats.skillHits++;
          }, 'heal'); },
        },
      ],
      tick(s, c) { if (c.f.radiant && s.tick % 30 === 0) for (const al of alliesIn(s, c.team, c.x, c.y, 260)) if (al !== c) heal(s, c, al, 12 * pow(c)); },
    },
    sable: {
      name: 'Sable', role: 'Assassin', blurb: 'Strike from behind, then be somewhere else.',
      sight: 720, hp: 510, hpG: 74, dmg: 66, dmgG: 8, armor: 18, armG: 3, range: 125, as: 1.05, ms: 335, pref: 92, melee: true, fit: { top: 2, jungle: 3, bottom: 0, support: 0 },
      passive: { name: 'Nightstalker', d: 'Move 15% faster whenever no enemy can see you. For 1.5 seconds after any blink, Rend always counts as from behind.' },
      builds: [
        { id: 'ghost', name: 'Ghost', tag: 'Evasive', d: 'Echo comes back quickly and waits longer. Snapping back heals you.', mods: { 1: { cd: 6.5, window: 5.5, d: 'Blink away and leave an echo. Snap back within 5 seconds to heal.' } } },
        { id: 'reaper', name: 'Reaper', tag: 'Execute', d: 'Reap comes up far more often, executes harder, and any champion takedown resets it.', mods: { 2: { cd: 26, missing: .5, d: 'Blink behind a champion. Massive execute. A takedown resets it.' } } },
        { id: 'hunter', name: 'Hunter', tag: 'Jungle', d: 'Rend tears through monsters. Enemies under 30% health in fog are shown to you.', mods: { 0: { d: 'Short slash. Far stronger against monsters.' } } },
        { id: 'twin', name: 'Twin', tag: 'Trickster', d: 'While your echo stands, Rend also strikes from the echo.', mods: { 0: { d: 'Short slash. While your echo stands, it slashes too.' } } },
      ],
      evolves: [
        [{ id: 'sharperend', name: 'Sharper Rend', d: 'Rend cooldown 0.7 shorter.', mods: { 0: { cd_add: -.7 } } }, { id: 'wideblade', name: 'Wide Blade', d: 'Rend reaches 30 farther and sweeps wider.', mods: { 0: { range_add: 30, dot: .5 } } }],
        [{ id: 'phantom', name: 'Phantom', d: 'Snapping back with Echo stuns the enemies around you for 0.6.' }, { id: 'deathmark', name: 'Death Mark', d: 'A target hit by Reap takes 15% more from you for 4 seconds.' }],
      ],
      kit: [
        { name: 'Rend', d: 'Short slash. Hits half again as hard from behind.', fx: 'slash', cd: 3.5, range: 180, shape: 'cone', w: 150, dmg: 92, dot: .72,
          cast(s, c, a, A) { const hitF = (px, py, dx, dy, mul) => { let hit = 0; eachEnemy(s, c, px, py, A.range, t => { const n = norm(t.x - px, t.y - py); if (n.x * dx + n.y * dy < A.dot || !hasLOS(px, py, t.x, t.y)) return; const back = c.behindT > 0 || (t.fx || 0) * -n.x + (t.fy || 0) * -n.y < -.25; let d = A.dmg * pow(c) * (back ? 1.5 : 1) * mul; if (c.f.hunter && t.kind === 'monster') d *= 1.8; hurt(s, c, t, d, { skill: 1, crit: back }); if (t.kind === 'champ') hit = 1; }); return hit; };
            let hit = hitF(c.x, c.y, a.dx, a.dy, 1); if (c.f.twin && c.echo) hit |= hitF(c.echo.x, c.echo.y, a.dx, a.dy, .7);
            if (hit) c.stats.skillHits++; },
        },
        { name: 'Echo', d: 'Blink away and leave an echo. Cast again to snap back.', fx: 'blink', cd: 10, range: 240, shape: 'dash', w: 60, over: true, recastInstant: true, armsRecast: true, window: 3.5,
          cast(s, c, a, A) { c.behindT = 1.5; c.echo = { x: c.x, y: c.y }; const f = nearestFree(s.map, a.tx, a.ty); s.ev.push({ e: 'blink', x: c.x, y: c.y }); c.x = f.x; c.y = f.y; c.recast[1] = A.window; s.ev.push({ e: 'blink', x: c.x, y: c.y }); },
          recast(s, c, a, A) { if (!c.echo) return; c.behindT = 1.5; s.ev.push({ e: 'blink', x: c.x, y: c.y }); c.x = c.echo.x; c.y = c.echo.y; c.echo = null; s.ev.push({ e: 'blink', x: c.x, y: c.y }); if (c.f.ghost) heal(s, c, c, c.maxHp * .1); if (c.f.phantom) for (const t of enemiesIn(s, c, c.x, c.y, 150)) if (t.kind === 'champ') stun(s, t, .6); },
        },
        { name: 'Reap', d: 'Blink behind a champion. Execute damage. A kill resets it.', fx: 'blink', cd: 40, range: 360, shape: 'circle', r: 90, over: true, target: true, dmg: 125, missing: .35,
          cast(s, c, a, A) { const t = nearChamp(s, c, a.tx, a.ty, 180); if (!t || dist(c, t) > A.range + 45) return false; const n = { x: t.fx || 1, y: t.fy || 0 }; s.ev.push({ e: 'blink', x: c.x, y: c.y }); const f = nearestFree(s.map, t.x - n.x * 90, t.y - n.y * 90); c.x = f.x; c.y = f.y; c.fx = n.x; c.fy = n.y; c.behindT = 1.5; c.reap = { id: t.id, t: 2 }; hurt(s, c, t, (A.dmg * pow(c)) + (t.maxHp - t.hp) * A.missing, { skill: 1, crit: 1 }); c.stats.skillHits++; if (c.f.deathmark) { t.markedBy = c.id; t.dmarkT = 4; } s.ev.push({ e: 'blink', x: c.x, y: c.y }); },
        },
      ],
      tick(s, c) { const seen = canSee(s, 1 - c.team, c); if (!seen) haste(c, .15, .1); if (c.f.hunter && s.tick % 15 === 0) for (const e of s.champs) if (e.alive && e.team !== c.team && e.hp / e.maxHp < .3) e.revealT = Math.max(e.revealT || 0, .6); },
    },
    gravel: {
      name: 'Gravel', role: 'Tank', blurb: 'One good hook moves the whole fight.',
      sight: 680, hp: 720, hpG: 112, dmg: 54, dmgG: 6, armor: 34, armG: 5, range: 150, as: .8, ms: 305, pref: 120, melee: true, fit: { top: 2, jungle: 2, bottom: 0, support: 3 },
      passive: { name: 'Immovable', d: 'Above 40% health nothing can push, drag or lift you. Dropping below it hardens you for 3 seconds, once every 30 seconds.' },
      builds: [
        { id: 'anchor', name: 'Anchor', tag: 'Catch', d: 'Chain reaches farther and stuns longer, but takes longer to come back.', mods: { 0: { range: 555, stun: .5, cd_add: 2, d: 'Long reach. Drags the first enemy to you and holds them a moment.' } } },
        { id: 'juggernaut', name: 'Juggernaut', tag: 'Bruiser', d: 'Avalanche comes up far more often. Stomp is wider and hits harder. Lighter hook.', mods: { 0: { dmg_add: -20 }, 1: { r_add: 35, dmg_add: 30, d: 'Wide, strong stomp. Slow everyone around you and harden.' }, 2: { cd: 30 } } },
        { id: 'warden', name: 'Warden', tag: 'Protect', d: 'Chain hooks allies to safety. Stomp shields allies beside you.', mods: { 0: { filter: 'allchamp', d: 'Hook the first champion it hits: drags an enemy to you, or pulls an ally to safety.' }, 1: { d: 'Slow everyone around you, harden, and shield nearby allies.' } } },
        { id: 'seismic', name: 'Seismic', tag: 'Zone', d: 'Stomp sends an aftershock a moment later and slows much harder.', mods: { 1: { slowA: .55, d: 'Slow everyone around you hard; a second pulse follows.' } } },
      ],
      evolves: [
        [{ id: 'longchain', name: 'Long Chain', d: 'Chain reaches 60 farther.', mods: { 0: { range_add: 60 } } }, { id: 'hardstomp', name: 'Hard Stomp', d: 'Stomp radius 30 larger.', mods: { 1: { r_add: 30 } } }],
        [{ id: 'lastwall', name: 'Last Wall', d: 'Avalanche stuns 0.4 longer.' }, { id: 'unbroken', name: 'Unbroken', d: 'Stomp hardens you for a full 4 seconds.' }],
      ],
      kit: [
        { name: 'Chain', d: 'Hook the first enemy it hits and drag them to you.', fx: 'chain', cd: 9, range: 465, shape: 'line', w: 50, dmg: 64, stun: .15, filter: 'chainable',
          cast(s, c, a, A) { fire(s, c, a, { speed: 1050, range: A.range, w: 50, fx: 'chain', filter: A.filter === 'allchamp' ? 'allchainable' : A.filter, hit(s, c, t, p) {
            if (t.team === c.team) { const n = norm(c.x - t.x, c.y - t.y), l = Math.max(0, n.l - 90); dashDir(t, n.x, n.y, l, 1200, { forced: true }); shield(s, t, 90 * hpow(c), 3); skillHit(c, p); p.left = 0; return; }
            hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); const n = norm(c.x - t.x, c.y - t.y), l = Math.max(0, n.l - 90); dashDir(t, n.x, n.y, l, 1300, { forced: true }); t.stunT = Math.max(t.stunT || 0, l / 1300 + A.stun); if (t.kind === 'champ') skillHit(c, p); p.left = 0; } }); },
        },
        { name: 'Stomp', d: 'Slow everyone around you and harden for a moment.', fx: 'stomp', cd: 8, range: 0, shape: 'self', r: 180, dmg: 62, slowA: .4,
          cast(s, c, a, A) { const go = () => { let hit = false; s.ev.push({ e: 'boom', x: c.x, y: c.y, r: A.r, fx: 'stomp' }); eachEnemy(s, c, c.x, c.y, A.r, t => { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); slow(t, A.slowA, 1.5); if (t.kind === 'champ') hit = true; }); return hit; }; const hit = go(); c.drT = c.f.unbroken ? 4 : 2.5; if (c.f.warden) for (const al of alliesIn(s, c.team, c.x, c.y, A.r + 45)) shield(s, al, 80 * hpow(c), 3); if (c.f.seismic) blast(s, c, c.x, c.y, A.r, .55, () => { go(); }, 'stomp'); if (hit) c.stats.skillHits++; },
        },
        { name: 'Avalanche', d: 'Unstoppable charge. Stuns around the first champion you hit.', fx: 'dash', cd: 48, range: 480, shape: 'line', w: 110, pd: [480, 1000], dmg: 165,
          cast(s, c, a, A) { dashDir(c, a.dx, a.dy, A.range, 1000, { unstop: true, champOnly: true, onHit(s, c, t) { c.dash = null; s.ev.push({ e: 'boom', x: c.x, y: c.y, r: 155, fx: 'crash' }); eachEnemy(s, c, c.x, c.y, 155, e => { hurt(s, c, e, A.dmg * pow(c), { skill: 1 }); if (e.kind === 'champ') stun(s, e, 1.25 + (c.f.lastwall ? .4 : 0)); }, true); c.stats.skillHits++; } }); },
        },
      ],
      tick(s, c) { if (c.pcdT > 0) c.pcdT -= DT; if (c.hp < c.maxHp * .4 && !(c.pcdT > 0) && c.alive) { c.pcdT = 30; c.drT = Math.max(c.drT, 3); s.ev.push({ e: 'boom', x: c.x, y: c.y, r: 90, fx: 'stomp' }); } c.pready = c.pcdT > 0 ? 0 : 1; },
    },

    // ---------- Villains ----------
    deadbolt: {
      name: 'Deadbolt', role: 'Marksman', blurb: 'Lay the wire, then finish what it caught.',
      sight: 950, hp: 505, hpG: 70, dmg: 58, dmgG: 7, armor: 15, armG: 3, range: 360, as: 1.0, ms: 305, pref: 325, fit: { top: 1, jungle: 0, bottom: 3, support: 0 },
      passive: { name: 'Deadlock', d: 'Basic attacks against rooted or slowed targets crit for 50% more. A wire that catches a champion refunds 3 seconds of Ricochet.' },
      builds: [
        { id: 'trapper', name: 'Trapper', tag: 'Traps', d: 'Up to three wires, longer lasting and tighter. Your bullets stay modest.', stats: { dmg: .93 }, mods: { 0: { cd: 6.5, dur: 22, maxWires: 3, rootT: 1.5, d: 'Lay up to three wires. Each roots the first enemy to cross it.' } } },
        { id: 'deadeyed', name: 'Dead Aim', tag: 'Poke', d: 'Ricochet flies far and hits very hard but never bounces.', mods: { 1: { range: 690, dmg_add: 75, bounces: 0, cd_add: 1.5, d: 'A long, heavy shot. No bounce.' } } },
        { id: 'gunslinger', name: 'Gunslinger', tag: 'Attack speed', d: 'Ricochet bounces three times. Every fourth basic attack also crits.', stats: { as: 1.14, dmg: .94 }, mods: { 1: { bounces: 3, bdmg: .7, d: 'A shot that bounces between up to four targets.' } } },
        { id: 'jailer', name: 'Jailer', tag: 'Control', d: 'Lockdown comes up more, is wider and slows much harder, but its shots are gentle.', mods: { 2: { cd: 38, r_add: 45, slowA: .45, shot: 28, d: 'Marks a wide zone that reveals, slows hard and fires light shots.' } } },
      ],
      evolves: [
        [{ id: 'taut', name: 'Taut Wire', d: 'Tripwire roots 0.3 longer.', mods: { 0: { rootT_add: .3 } } }, { id: 'hairtrigger', name: 'Hair Trigger', d: 'Ricochet cooldown 1.5 shorter.', mods: { 1: { cd_add: -1.5 } } }],
        [{ id: 'crossfire', name: 'Crossfire', d: 'Lockdown fires twice as fast.' }, { id: 'killbox', name: 'Kill Box', d: 'Lockdown is 45 wider and roots enemies inside it when it starts.', mods: { 2: { r_add: 45 } } }],
      ],
      kit: [
        { name: 'Tripwire', d: 'Lay a wire across a path. The first enemy to cross it is rooted.', fx: 'tripwire', cd: 9, range: 465, shape: 'circle', r: 130, wire: true, dur: 13, maxWires: 2, rootT: 1.25, dmg: 62,
          cast(s, c, a, A) {
            const nx = -a.dy, ny = a.dx, w1 = rayWall(a.tx, a.ty, nx, ny, A.r), w2 = rayWall(a.tx, a.ty, -nx, -ny, A.r);
            const mine = s.zones.filter(z => z.kind === 'tripline' && z.owner === c); if (mine.length >= A.maxWires) mine[0].dead = true;
            const z = field(s, c, 'tripline', lineZone({ r: A.r, dur: A.dur, arm: .25 }, a.tx + nx * w1, a.ty + ny * w1, a.tx - nx * w2, a.ty - ny * w2));
            z.step = (s, z) => { if (z.arm > 0) { z.arm -= DT; return; } for (const t of s.champs) if (t.alive && !t.air && t.team !== c.team && segDist(t.x, t.y, z.x1, z.y1, z.x2, z.y2) < t.r + 12) { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); root(s, t, A.rootT); c.cd[1] = Math.max(0, c.cd[1] - 3); z.t = 0; s.ev.push({ e: 'boom', x: t.x, y: t.y, r: 70, fx: 'tripwire' }); c.stats.skillHits++; return; } };
          },
        },
        { name: 'Ricochet', d: 'A shot that bounces to a second target.', fx: 'ricochet', cd: 6, range: 495, shape: 'line', w: 36, dmg: 80, bounces: 1, bdmg: .7,
          cast(s, c, a, A) { fire(s, c, a, { speed: 1500, range: A.range, w: A.w, fx: 'ricochet', filter: 'units', hit(s, c, t, p) {
            hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.kind === 'champ') skillHit(c, p); p.left = 0;
            ricochetNext(s, c, A, t, new Set([t.id]), A.bounces, A.bdmg);
          } }); },
        },
        { name: 'Lockdown', d: 'Marks a zone that reveals and slows and fires at those inside.', fx: 'lockdown', cd: 55, range: 675, shape: 'circle', r: 215, dur: 4.5, slowA: .25, shot: 56,
          cast(s, c, a, A) {
            const every = c.f.crossfire ? 11 : 21;
            const z = field(s, c, 'lockdown', { x: a.tx, y: a.ty, r: A.r, dur: A.dur, n: 0 });
            if (c.f.killbox) for (const t of enemiesIn(s, c, a.tx, a.ty, A.r)) if (t.kind === 'champ') root(s, t, .9);
            z.step = (s, z) => {
              if (s.tick % 6 === 0) for (const t of s.champs) if (t.alive && t.team !== c.team && Math.hypot(t.x - z.x, t.y - z.y) < z.r + t.r) { t.revealT = Math.max(t.revealT || 0, .4); slow(t, A.slowA, .35); if (t.stealthT > 0) breakStealth(s, t); }
              if (++z.n >= every) { z.n = 0; const list = s.champs.filter(t => t.alive && !t.air && t.team !== c.team && Math.hypot(t.x - z.x, t.y - z.y) < z.r + t.r); if (list.length) { const t = list[s.rand() * list.length | 0]; blast(s, c, t.x + (t.vx || 0) * .2, t.y + (t.vy || 0) * .2, 70, .28, (s, b) => { for (const e of enemiesIn(s, c, b.x, b.y, 70)) if (e.kind === 'champ') { hurt(s, c, e, A.shot * pow(c), { skill: 1 }); if (!z.counted) { z.counted = true; c.stats.skillHits++; } } }, 'lockdown'); } }
            };
          },
        },
      ],
      onBasic(s, c, t, o) { if (t.rootT > 0 || t.slowT > 0) { o.dmg *= 1.5; o.crit = true; } if (c.f.gunslinger) { c.pstack = ((c.pstack || 0) + 1) % 4; if (!c.pstack) { o.dmg *= 1.5; o.crit = true; } } },
    },
    duelist: {
      name: 'Duelist', role: 'Fighter', blurb: 'Circle them, cut them, salute them.',
      sight: 720, hp: 600, hpG: 90, dmg: 62, dmgG: 8, armor: 26, armG: 4, range: 140, as: .98, ms: 330, pref: 105, melee: true, fit: { top: 3, jungle: 2, bottom: 0, support: 0 },
      passive: { name: 'Flurry of Angles', d: 'Hitting a target from a new angle builds up to 5 stacks, each adding 5% damage. Stacks fade after 3 seconds. The third cut of Flourish takes 4 seconds off Feint.' },
      builds: [
        { id: 'fencer', name: 'Fencer', tag: 'Combo', d: 'Flourish refreshes on a clean finish. Longer window, and the third cut stuns longer.', mods: { 0: { cd: 6, window: 2.4, knockT: .9, d: 'Three quick cuts. Land the third on a champion to refund half the cooldown.' } } },
        { id: 'masquerade', name: 'Masquerade', tag: 'Trickster', d: 'Feint is quick and long. The decoy bursts when it ends and damages nearby enemies.', mods: { 1: { cd: 7.5, stealth: 1.9, d: 'A decoy steps away and bursts, while you vanish longer.' } } },
        { id: 'honorbound', name: 'Honorbound', tag: 'Duel', d: 'Final Salute comes up much sooner and you hit far harder inside the ring. Win a duel to reset it.', mods: { 2: { cd: 30, dur: 4, dmgBoost: 1.3, d: 'Binds one enemy into a ring. You hit 30% harder inside. A kill resets it.' } } },
        { id: 'bladestorm', name: 'Bladestorm', tag: 'Waves', d: 'The third cut of Flourish spins around you. Stacks of Flurry also grant speed.', mods: { 0: { dmg1_add: 14, dmg2_add: 30, d: 'Three quick cuts. The third is a whirl that hits everything around you.' } } },
      ],
      evolves: [
        [{ id: 'lunging', name: 'Lunging Cut', d: 'The second cut of Flourish reaches 40 farther.', mods: { 0: { reach1_add: 40 } } }, { id: 'pirouette', name: 'Pirouette', d: 'Feint also dashes you the opposite way.' }],
        [{ id: 'coupdegrace', name: 'Coup de Grace', d: 'The third cut adds 12% of the target\'s missing health.' }, { id: 'lastbow', name: 'Last Bow', d: 'Final Salute stuns the target for 0.5 when it starts.' }],
      ],
      kit: [
        { name: 'Flourish', d: 'Three quick cuts, each within a window. The third knocks up.', fx: 'flourish', cd: 8, range: 0, shape: 'self', instant: true, armsRecast: true, chain: 2, window: 1.8, knockT: .6, reach0: 160, reach1: 190, reach2: 175, dmg0: 48, dmg1: 56, dmg2: 82,
          cast(s, c, a, A) { flourish(s, c, A, 0); c.fstep = 1; c.recast[0] = A.window; },
          recast(s, c, a, A) { const n = c.fstep || 1; flourish(s, c, A, n); if (n < 2) { c.fstep = n + 1; c.recast[0] = A.window; } else { c.fstep = 0; c.recast[0] = 0; } },
        },
        { name: 'Feint', d: 'A decoy steps away while you briefly vanish.', fx: 'feint', cd: 12, range: 255, shape: 'dash', w: 60, stealth: 1.3, keepStealth: true,
          cast(s, c, a, A) {
            const z = field(s, c, 'decoy', { x: c.x, y: c.y, r: 26, dur: 1.5, x0: c.x, vx: a.dx * 300, vy: a.dy * 300 });
            z.step = (s, z) => { z.x += z.vx * DT; z.y += z.vy * DT; if (rayWall(z.x, z.y, a.dx, a.dy, 8) < 8) z.vx = z.vy = 0; };
            z.end = (s, z) => { s.ev.push({ e: 'boom', x: z.x, y: z.y, r: 120, fx: 'feint' }); if (c.f.masquerade) for (const t of enemiesIn(s, c, z.x, z.y, 145, true)) hurt(s, c, t, 150 * pow(c), { skill: 1 }); };
            stealth(s, c, A.stealth); if (c.f.pirouette) dashDir(c, -a.dx, -a.dy, 150, 1000);
          },
        },
        { name: 'Final Salute', d: 'Binds one enemy into a short duel ring neither can leave.', fx: 'salute', cd: 50, range: 315, shape: 'circle', r: 110, target: true, dur: 3.2, dmgBoost: 1.12,
          cast(s, c, a, A) {
            const t = nearChamp(s, c, a.tx, a.ty, 180); if (!t || dist(c, t) > A.range + 45 || !hasLOS(c.x, c.y, t.x, t.y)) return false;
            const z = field(s, c, 'ring', { x: (c.x + t.x) / 2, y: (c.y + t.y) / 2, r: 200, dur: A.dur, a: c, b: t, boost: A.dmgBoost, tgt: t.id });
            c.duelZ = z; t.duelZ = z; c.stats.skillHits++; if (c.f.lastbow) stun(s, t, .5);
            z.step = (s, z) => { if (!z.a.alive || !z.b.alive) { z.t = 0; if (c.f.honorbound && !z.b.alive && z.a.alive) c.cd[2] = Math.min(c.cd[2], 6); } };
            z.end = (s, z) => { z.a.duelZ = z.b.duelZ = null; };
          },
        },
      ],
      onBasic(s, c, t, o) {
        const n = norm(t.x - c.x, t.y - c.y), id = t.id, last = c.anglesOn === id ? c.angleL : null;
        if (last === null || last.x * n.x + last.y * n.y < .82) { c.pstack = Math.min(5, (c.pstack || 0) + 1); c.anglesOn = id; c.angleL = { x: n.x, y: n.y }; if (c.f.bladestorm) haste(c, .03 * c.pstack, 2); }
        o.dmg *= 1 + .05 * (c.pstack || 0); c.ptime = 3;
      },
      tick(s, c) { if (c.ptime > 0) { c.ptime -= DT; if (c.ptime <= 0) c.pstack = 0; } },
    },
    hex: {
      name: 'Hex', role: 'Curse mage', blurb: 'Stack the curses, then call them in.',
      sight: 850, hp: 495, hpG: 66, dmg: 50, dmgG: 5, armor: 14, armG: 3, range: 320, as: .85, ms: 300, pref: 290, fit: { top: 1, jungle: 0, bottom: 3, support: 2 },
      passive: { name: 'Contagion', d: 'When a cursed enemy dies, their curses spread to enemies nearby. Each curse strips 6 magic resist.' },
      builds: [
        { id: 'cursebinder', name: 'Cursebinder', tag: 'Stacks', d: 'Curses stack to five and linger. Hex Bolt is faster, and full stacks detonate far harder.', mods: { 0: { cd: 2.6, d: 'Stacks curses up to five. At five, the next hit detonates them.' } } },
        { id: 'transmuter', name: 'Transmuter', tag: 'Control', d: 'Polymorph comes up fast and turns targets into very fragile coins.', mods: { 1: { cd: 8.5, w_add: 10, d: 'Turns a target into a spinning coin that takes 25% more damage.' } } },
        { id: 'ritualist', name: 'Ritualist', tag: 'Team fight', d: 'Coven comes up sooner, drags harder and detonates wider.', mods: { 2: { cd: 38, r_add: 45, pull_add: 70 } } },
        { id: 'jinx', name: 'Jinx', tag: 'Support', d: 'Curses slow, and allies who hit a cursed enemy heal a little.', mods: { 0: { d: 'Stacks curses that slow. Allies heal by hitting cursed enemies.' } } },
      ],
      evolves: [
        [{ id: 'swiftbolt', name: 'Swift Bolt', d: 'Hex Bolt cooldown 0.6 shorter.', mods: { 0: { cd_add: -.6 } } }, { id: 'bigpoly', name: 'Long Change', d: 'Polymorph lasts 0.3 longer and is a little wider.', mods: { 1: { dur_add: .3, w_add: 12 } } }],
        [{ id: 'covenant', name: 'Covenant', d: 'Coven is 30 wider and drags harder.', mods: { 2: { r_add: 30, pull_add: 50 } } }, { id: 'hexburst', name: 'Hex Burst', d: 'Detonations also curse enemies around the target.' }],
      ],
      kit: [
        { name: 'Hex Bolt', d: 'Stacks curses. At full stacks the next hit detonates them.', fx: 'hexbolt', cd: 3.5, range: 495, shape: 'line', w: 40, dmg: 76,
          cast(s, c, a, A) { fire(s, c, a, { speed: 1100, range: A.range, w: A.w, fx: 'hexbolt', filter: 'units', hit(s, c, t, p) {
            hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.kind === 'champ') skillHit(c, p); p.left = 0;
            if (t.alive) { if ((t.curseT > 0 ? t.curseN : 0) >= curseCap(c)) detonate(s, c, t, 1); else curse(s, c, t, 1); if (c.f.jinx && t.curseN) slow(t, .08 * t.curseN, 1.5); }
          } }); },
        },
        { name: 'Polymorph', d: 'Skillshot. Turns a target into a harmless spinning coin for a moment.', fx: 'polymorph', cd: 13, range: 450, shape: 'line', w: 36, dur: 1.25,
          cast(s, c, a, A) { fire(s, c, a, { speed: 1250, range: A.range, w: A.w, fx: 'polymorph', filter: 'champ', hit(s, c, t, p) { if (t.team === c.team) return; poly(s, t, A.dur); if (c.f.transmuter) t.vulnT = A.dur; skillHit(c, p); p.left = 0; } }); },
        },
        { name: 'Coven', d: 'A zone that drags enemies to its centre and detonates curses.', fx: 'coven', cd: 50, range: 480, shape: 'circle', r: 240, dur: 1.9, pull: 150, dmg: 120,
          cast(s, c, a, A) {
            const z = field(s, c, 'coven', { x: a.tx, y: a.ty, r: A.r, dur: A.dur });
            z.step = (s, z) => { for (const t of s.champs) if (t.alive && !t.air && t.team !== c.team && Math.hypot(t.x - z.x, t.y - z.y) < z.r + t.r && !(t.dash && t.dash.unstop)) { const n = norm(z.x - t.x, z.y - t.y); if (n.l > 30) { t.x += n.x * A.pull * DT; t.y += n.y * A.pull * DT; pushOut(s.map, t); } } };
            z.end = (s, z) => { s.ev.push({ e: 'boom', x: z.x, y: z.y, r: z.r, fx: 'coven' }); let hit = false; for (const t of enemiesIn(s, c, z.x, z.y, z.r)) { if (t.kind === 'champ') hit = true; hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.alive && (t.curseT > 0 ? t.curseN : 0) > 0) detonate(s, c, t, 1.4); } if (hit) c.stats.skillHits++; };
          },
        },
      ],
    },
    plague: {
      name: 'Plague Doctor', role: 'Attrition support', blurb: 'Nobody leaves the ward healthy.',
      sight: 850, hp: 520, hpG: 76, dmg: 46, dmgG: 5, armor: 20, armG: 3.5, range: 300, as: .85, ms: 310, pref: 270, support: true, fit: { top: 2, jungle: 0, bottom: 1, support: 3 },
      passive: { name: 'Vile Recovery', d: 'Poisoned enemies nearby slowly heal you, and everything they deal is 10% weaker.' },
      builds: [
        { id: 'apothecary', name: 'Apothecary', tag: 'Support', d: 'Leech feeds allies for much more and comes back faster. Weak poison.', mods: { 1: { cd: 7, heal: 1.15, d: 'Tether an enemy, draining them and feeding your lowest ally for much more.' }, 0: { dps_add: -8 } } },
        { id: 'pestilence', name: 'Pestilence', tag: 'Damage over time', d: 'Miasma is wider, longer and far deadlier.', mods: { 0: { r_add: 35, dur: 7.5, dps_add: 9 }, 1: { heal: .3 } } },
        { id: 'bloodletter', name: 'Bloodletter', tag: 'Bruiser', d: 'Leech feeds only you, drains hard, and your attacks land sturdily. A top laner who will not die.', stats: { hp: 1.15, dmg: 1.1 }, mods: { 1: { dps_add: 24, heal: .8, d: 'Tether an enemy and drain them. Feeds only you.' } } },
        { id: 'ward', name: 'The Ward', tag: 'Zone', d: 'Quarantine comes up far sooner and slows harder.', mods: { 2: { cd: 32, slowA: .42, r_add: 30 } } },
      ],
      evolves: [
        [{ id: 'thickfog', name: 'Thick Fog', d: 'Miasma radius 25 larger.', mods: { 0: { r_add: 25 } } }, { id: 'fastdraw', name: 'Quick Draw', d: 'Leech cooldown 2 shorter.', mods: { 1: { cd_add: -2 } } }],
        [{ id: 'lockward', name: 'Locked Ward', d: 'Quarantine reveals enemies inside.' }, { id: 'blacktide', name: 'Black Tide', d: 'Miasma also slows by 25%.' }],
      ],
      kit: [
        { name: 'Miasma', d: 'A lingering poison cloud.', fx: 'miasma', cd: 8, range: 420, shape: 'circle', r: 145, dur: 5, dps: 23,
          cast(s, c, a, A) {
            const z = field(s, c, 'miasma', { x: a.tx, y: a.ty, r: A.r, dur: A.dur, n: 0 });
            z.step = (s, z) => { if (s.tick % 9) return; for (const t of enemiesIn(s, c, z.x, z.y, z.r)) { poison(s, c, t, A.dps * pow(c), 2); if (c.f.blacktide) slow(t, .25, .4); if (t.kind === 'champ' && !z.counted) { z.counted = true; c.stats.skillHits++; } } };
          },
        },
        { name: 'Leech', d: 'A tether draining an enemy and feeding an ally.', fx: 'leech', cd: 10, range: 405, shape: 'circle', r: 120, target: true, dur: 3, dps: 44, heal: .6,
          cast(s, c, a, A) {
            const t = nearChamp(s, c, a.tx, a.ty, 180); if (!t || dist(c, t) > A.range + 45 || !hasLOS(c.x, c.y, t.x, t.y)) return false;
            c.stats.skillHits++;
            const z = field(s, c, 'tether', { x: c.x, y: c.y, r: 20, dur: A.dur, tgt: t.id, n: 0 });
            z.step = (s, z) => { z.x = c.x; z.y = c.y; if (!c.alive || !t.alive || t.air || dist(c, t) > A.range + 150 || !hasLOS(c.x, c.y, t.x, t.y)) { z.t = 0; return; } if (s.tick % 6 === 0) { const a2 = hurt(s, c, t, A.dps * .2 * pow(c), { skill: 1, dot: 1 }); const to = c.f.bloodletter ? c : lowestAlly(s, c, 480, true) || c; heal(s, c, to, (a2 || 0) * A.heal); } };
          },
        },
        { name: 'Quarantine', d: 'A zone that blocks healing and slows.', fx: 'quarantine', cd: 52, range: 480, shape: 'circle', r: 250, dur: 5, slowA: .28,
          cast(s, c, a, A) {
            const z = field(s, c, 'quarantine', { x: a.tx, y: a.ty, r: A.r, dur: A.dur });
            z.step = (s, z) => { if (s.tick % 5) return; for (const t of s.champs) if (t.alive && t.team !== c.team && Math.hypot(t.x - z.x, t.y - z.y) < z.r + t.r) { t.noHealT = .3; slow(t, A.slowA, .3); if (c.f.lockward) t.revealT = Math.max(t.revealT || 0, .3); if (!z.counted) { z.counted = true; c.stats.skillHits++; } } };
          },
        },
      ],
      tick(s, c) { if (s.tick % 15) return; let n = 0; for (const t of s.champs) if (t.alive && t.team !== c.team && t.poisonT > 0 && Math.hypot(t.x - c.x, t.y - c.y) < 420) n++; if (n && c.hp < c.maxHp) heal(s, c, c, c.maxHp * .004 * n); },
    },
    shiv: {
      name: 'Shiv', role: 'Stealth assassin', blurb: 'If you can see her, she missed.',
      sight: 720, hp: 500, hpG: 72, dmg: 68, dmgG: 8, armor: 18, armG: 3, range: 125, as: 1.05, ms: 335, pref: 92, melee: true, fit: { top: 2, jungle: 3, bottom: 0, support: 0 },
      passive: { name: 'Opening Cut', d: 'The first strike out of stealth crits for 60% more and cripples the target, slowing them by half for a second.' },
      builds: [
        { id: 'cutthroat', name: 'Cutthroat', tag: 'Burst', d: 'Shank bleeds harder and refreshes on any bleeding kill.', mods: { 0: { dps_add: 16, d: 'Dash through. Deep bleed. A kill on a bleeding enemy resets it.' } } },
        { id: 'nightblade', name: 'Nightblade', tag: 'Stealth', d: 'Vanish comes up fast and lasts longer, and you move faster inside it.', mods: { 1: { cd: 8.5, dur: 3.1, ms: .32, d: 'Long stealth with a big speed boost. Fades on attack.' } } },
        { id: 'butcher', name: 'Butcher', tag: 'Team fight', d: 'Thousand Cuts cleaves everything around the target and comes up sooner.', mods: { 2: { cd: 32, d: 'Rapid untargetable strikes that also cleave around the target.' } } },
        { id: 'venomous', name: 'Venomous', tag: 'Attrition', d: 'Attacks poison, and Shank has a shorter cooldown but less bite. Nothing about this is quick, just inevitable.', mods: { 0: { cd: 4.8, dmg_add: -18, d: 'Quick dash through. Light bleed that slows.' } } },
      ],
      evolves: [
        [{ id: 'longshank', name: 'Long Shank', d: 'Shank reaches 50 farther.', mods: { 0: { range_add: 50 } } }, { id: 'deepcut', name: 'Deep Cut', d: 'Shank bleeds for 25% more.', mods: { 0: { dps_mul: 1.25 } } }],
        [{ id: 'fadeaway', name: 'Fade Away', d: 'Starting Vanish cleanses slows and roots and heals you 8%.' }, { id: 'finishing', name: 'Finishing Stroke', d: 'The last strike of Thousand Cuts adds 15% of missing health.' }],
      ],
      kit: [
        { name: 'Shank', d: 'Dash through with a bleed.', fx: 'shank', cd: 7, range: 240, shape: 'dash', w: 70, pd: [240, 1250], dmg: 58, dps: 22,
          cast(s, c, a, A) { const car = {}; dashDir(c, a.dx, a.dy, A.range, 1250, { onHit(s, c, t) { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.alive) { bleed(s, c, t, A.dps * pow(c), 3); if (c.f.venomous) slow(t, .22, 2); } if (t.kind === 'champ') { skillHit(c, car); } } }); },
        },
        { name: 'Vanish', d: 'Short stealth, hidden even with vision. Fades on attack.', fx: 'vanish', cd: 13, range: 0, shape: 'self', instant: true, keepStealth: true, dur: 2.2, ms: .2,
          cast(s, c, a, A) { stealth(s, c, A.dur); haste(c, A.ms, A.dur); if (c.f.fadeaway) { c.slowT = 0; c.rootT = 0; heal(s, c, c, c.maxHp * .08); } },
        },
        { name: 'Thousand Cuts', d: 'Rapid untargetable strikes on one target.', fx: 'cuts', cd: 42, range: 320, shape: 'circle', r: 100, target: true, over: true, strikes: 6, dmg: 36,
          cast(s, c, a, A) { const t = nearChamp(s, c, a.tx, a.ty, 180); if (!t || dist(c, t) > A.range + 45) return false; c.stats.skillHits++; c.cuts = { id: t.id, n: A.strikes, next: 0, A }; c.air = 1; s.ev.push({ e: 'blink', x: c.x, y: c.y }); },
        },
      ],
      onBasic(s, c, t, o) { if (c.f.venomous) poison(s, c, t, 14 * pow(c), 2); },
      tick(s, c) { c.pready = c.stealthT > 0 || c.opener > 0 ? 1 : 0; },
    },
    ironjaw: {
      name: 'Ironjaw', role: 'Brawler tank', blurb: 'Hit him. It only makes it worse.',
      sight: 680, hp: 655, hpG: 100, dmg: 54, dmgG: 6, armor: 30, armG: 4, range: 150, as: .82, ms: 305, pref: 120, melee: true, fit: { top: 3, jungle: 2, bottom: 0, support: 3 },
      passive: { name: 'Rage', d: 'Taking damage builds rage. Rage makes your basic attacks up to 50% stronger and Grab hold up to 60% longer, spending half of it.' },
      builds: [
        { id: 'brawler', name: 'Brawler', tag: 'Brawl', d: 'Attacking builds rage too, and full rage reaches further.', stats: { as: 1.08 }, mods: {} },
        { id: 'wrecker', name: 'Wrecker', tag: 'Area', d: 'Wrecking Ball orbits longer, wider and comes up sooner.', mods: { 0: { cd: 7, dur: 4.2, orbit_add: 30, dmg_add: 10 } } },
        { id: 'bouncer', name: 'Bouncer', tag: 'Catch', d: 'Grab reaches far and hurls enemies straight at your nearest ally or tower.', mods: { 1: { range: 240, stunT: 1.25, d: 'Seize an enemy from farther and hurl them at your nearest ally or tower.' } } },
        { id: 'fortress', name: 'Fortress', tag: 'Tank', d: 'Rage hardens into a shield. Demolish comes up sooner, lighter hits.', stats: { hp: 1.12, dmg: .88 }, mods: { 2: { cd: 34 } } },
      ],
      evolves: [
        [{ id: 'heavyball', name: 'Heavy Ball', d: 'Wrecking Ball slows on contact.' }, { id: 'longreach', name: 'Long Reach', d: 'Grab reaches 45 farther.', mods: { 1: { range_add: 45 } } }],
        [{ id: 'aftermath', name: 'Aftermath', d: 'Demolish leaves a slowing rift for 2 seconds.' }, { id: 'bloodlust', name: 'Blood Lust', d: 'Rage also adds 12% attack speed at full.' }],
      ],
      kit: [
        { name: 'Wrecking Ball', d: 'A ball orbits you briefly, hitting anything it touches.', fx: 'wrecking', cd: 9, range: 0, shape: 'self', instant: true, dur: 3, orbit: 140, dmg: 46,
          cast(s, c, a, A) {
            const z = field(s, c, 'orbit', { x: c.x, y: c.y, r: 34, dur: A.dur, ang: Math.atan2(c.fy, c.fx), orbit: A.orbit, hits: {} });
            z.step = (s, z) => { z.ang += 7.5 * DT; z.x = c.x + Math.cos(z.ang) * z.orbit; z.y = c.y + Math.sin(z.ang) * z.orbit; if (!c.alive) { z.t = 0; return; } eachEnemy(s, c, z.x, z.y, z.r, t => { if ((z.hits[t.id] || 0) > s.t) return; z.hits[t.id] = s.t + .85; hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (c.f.heavyball) slow(t, .3, 1); if (t.kind === 'champ' && !z.counted) { z.counted = true; c.stats.skillHits++; } }); };
          },
        },
        { name: 'Grab', d: 'Seize a nearby enemy and hurl them behind you.', fx: 'grab', cd: 10, range: 190, shape: 'cone', w: 130, dmg: 70, stunT: .7,
          cast(s, c, a, A) {
            let t = null, bd = A.range + 26; for (const e of [...s.champs, ...s.minions, ...s.monsters]) { if (!e.alive || e.air || e.boss || e.team === c.team || (e.kind === 'champ' && !canSee(s, c.team, e))) continue; const n = norm(e.x - c.x, e.y - c.y), v = n.l - e.r; if (n.x * a.dx + n.y * a.dy > .55 && hasLOS(c.x, c.y, e.x, e.y) && (v < bd || (t && t.kind !== 'champ' && e.kind === 'champ'))) { if (e.kind === 'champ' || !t || t.kind !== 'champ') { bd = v; t = e; } } }
            if (!t) return false;
            let hx = c.x - a.dx * 190, hy = c.y - a.dy * 190;
            if (c.f.bouncer) { let b = null, bb = 900; for (const o of [...s.champs.filter(x => x.alive && x.team === c.team && x !== c), ...s.towers.filter(x => x.alive && x.team === c.team)]) { const d2 = dist(o, c); if (d2 < bb) { bb = d2; b = o; } } if (b) { const n = norm(b.x - t.x, b.y - t.y); hx = b.x - n.x * 60; hy = b.y - n.y * 60; } }
            const n = norm(hx - t.x, hy - t.y); dashDir(t, n.x, n.y, Math.min(n.l, c.f.bouncer ? 420 : 340), 1500, { forced: true });
            stun(s, t, Math.min(n.l, 420) / 1500 + A.stunT * (1 + .6 * (c.rage || 0) / 100)); c.rage = (c.rage || 0) / 2; hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.kind === 'champ') c.stats.skillHits++;
          },
        },
        { name: 'Demolish', d: 'A ground fissure line that knocks up all along it.', fx: 'demolish', cd: 48, range: 495, shape: 'line', w: 130, delay: .42, dmg: 165, knockT: 1,
          cast(s, c, a, A) {
            const len = rayWall(c.x, c.y, a.dx, a.dy, A.range);
            const z = field(s, c, 'fissure', lineZone({ r: A.w / 2, dur: A.delay }, c.x, c.y, c.x + a.dx * len, c.y + a.dy * len));
            z.fn = (s, z) => { s.ev.push({ e: 'boom', x: z.x, y: z.y, r: z.r, fx: 'demolish', x2: z.x2, y2: z.y2 }); let hit = false; const test = t => { if (t.alive && !t.air && t.team !== c.team && segDist(t.x, t.y, z.x1, z.y1, z.x2, z.y2) < A.w / 2 + t.r) { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.alive) knock(s, t, A.knockT); if (t.kind === 'champ') hit = true; } }; s.champs.forEach(test); s.minions.forEach(test); s.monsters.forEach(test); if (hit) c.stats.skillHits++;
              if (c.f.aftermath) field(s, c, 'miasma', lineZone({ r: A.w / 2, dur: 2, fx: 'demolish', step(s, y) { if (s.tick % 6 === 0) { const test = t => { if (t.alive && t.team !== c.team && segDist(t.x, t.y, y.x1, y.y1, y.x2, y.y2) < y.r + t.r) slow(t, .35, .4); }; s.champs.forEach(test); s.minions.forEach(test); } } }, z.x1, z.y1, z.x2, z.y2)); };
          },
        },
      ],
      onBasic(s, c, t, o) { o.dmg *= 1 + (c.f.brawler ? .7 : .5) * (c.rage || 0) / 100; if (c.f.brawler) c.rage = Math.min(100, (c.rage || 0) + 4); },
      onDamaged(s, c, a) { c.rage = Math.min(100, (c.rage || 0) + a / c.maxHp * 220); c.rageAt = s.t; },
      tick(s, c) { if (c.rage > 0 && s.t - (c.rageAt || 0) > 5) c.rage = Math.max(0, c.rage - 8 * DT); c.pstack = Math.round((c.rage || 0) / 20); if (c.f.fortress && c.rage >= 20 && s.tick % 30 === 0) { shield(s, c, c.maxHp * .03 * c.rage / 20, 2.5); c.rage -= 8; } if (c.f.bloodlust) c.asBonus = .12 * (c.rage || 0) / 100; },
    },

    // ---------- 10.0 Heroes ----------
    voltaic: {
      name: 'Voltaic', role: 'Lightning speedster', blurb: 'Run fast, hit first, arrive as weather.', dtype: 'phys', arch: 'assassin',
      sight: 760, hp: 520, hpG: 76, dmg: 62, dmgG: 8, armor: 18, armG: 3, range: 130, as: 1.08, ms: 345, pref: 98, melee: true, fit: { top: 1, jungle: 3, bottom: 0, support: 0 },
      passive: { name: 'Static Charge', d: 'Moving builds charge. At full charge your next basic attack arcs lightning into two nearby enemies.' },
      builds: [
        { id: 'stormchaser', name: 'Stormchaser', tag: 'Jungle', d: 'Arc Dash tears through monsters and charges you faster off them.', mods: { 0: { d: 'Dash through a line. Far stronger against monsters.' } } },
        { id: 'surge', name: 'Surge', tag: 'Duration', d: 'Overload lasts much longer and comes back sooner.', mods: { 1: { cd: 10, dur: 4.6 } } },
        { id: 'conductor', name: 'Conductor', tag: 'Chains', d: 'Charge fills twice as fast and arcs jump to four enemies. Lighter dash.', mods: { 0: { dmg_add: -16 } } },
        { id: 'thunderhead', name: 'Thunderhead', tag: 'Engage', d: 'Ride the Lightning comes up far more often, with a lighter stun.', mods: { 2: { cd: 30, stun: .55 } } },
      ],
      evolves: [
        [{ id: 'quicksilver', name: 'Quicksilver', d: 'Arc Dash cooldown 1.2 shorter.', mods: { 0: { cd_add: -1.2 } } }, { id: 'groundfault', name: 'Ground Fault', d: 'Arc Dash slows champions it hits by 30%.' }],
        [{ id: 'skybreak', name: 'Skybreak', d: 'The Ride the Lightning trail is 40 wider.', mods: { 2: { w_add: 40 } } }, { id: 'afterimage', name: 'Afterimage', d: 'Ride the Lightning fully charges Static Charge.' }],
      ],
      kit: [
        { name: 'Arc Dash', d: 'Dash through a line of enemies. Hitting a champion adds charge.', fx: 'arcdash', cd: 6.5, range: 270, shape: 'dash', w: 80, pd: [270, 1500], dmg: 66,
          cast(s, c, a, A) { const car = {}; dashDir(c, a.dx, a.dy, A.range, 1500, { onHit(s, c, t) { hurt(s, c, t, A.dmg * pow(c) * (c.f.stormchaser && t.kind === 'monster' ? 1.7 : 1), { skill: 1 }); if (t.kind === 'champ') { skillHit(c, car); c.volt = Math.min(100, (c.volt || 0) + 35); if (c.f.groundfault) slow(t, .3, 1.2); } else if (c.f.stormchaser) c.volt = Math.min(100, (c.volt || 0) + 20); } }); },
        },
        { name: 'Overload', d: 'Burn hot: faster attacks and speed, and every basic attack arcs.', fx: 'overload', cd: 13, range: 0, shape: 'self', instant: true, dur: 3,
          cast(s, c, a, A) { c.overT = A.dur; haste(c, .22, A.dur); },
        },
        { name: 'Ride the Lightning', d: 'Become a bolt along a line. The trail detonates a moment later and stuns.', fx: 'thunder', cd: 46, range: 520, shape: 'line', w: 120, delay: .55, dmg: 170, stun: .95,
          cast(s, c, a, A) {
            const len = Math.max(0, rayWall(c.x, c.y, a.dx, a.dy, A.range + c.r) - c.r), x0 = c.x, y0 = c.y; dashDir(c, a.dx, a.dy, A.range, 1900, { unstop: true }); if (c.f.afterimage) c.volt = 100;
            const z = field(s, c, 'fissure', lineZone({ r: A.w / 2, dur: A.delay, fx: 'thunder' }, x0, y0, x0 + a.dx * len, y0 + a.dy * len));
            z.fn = (s, z) => { s.ev.push({ e: 'boom', x: z.x, y: z.y, r: z.r, fx: 'thunder', x2: z.x2, y2: z.y2 }); let hit = false; const test = t => { if (t.alive && !t.air && t.team !== c.team && segDist(t.x, t.y, z.x1, z.y1, z.x2, z.y2) < A.w / 2 + t.r) { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.alive) stun(s, t, A.stun); if (t.kind === 'champ') hit = true; } }; s.champs.forEach(test); s.minions.forEach(test); s.monsters.forEach(test); if (hit) c.stats.skillHits++; };
          },
        },
      ],
      tick(s, c) { const v = Math.hypot(c.vx || 0, c.vy || 0); if (v > 40) c.volt = Math.min(100, (c.volt || 0) + (c.f.conductor ? .36 : .18) * v * DT * .1 * 3); c.pready = (c.volt || 0) >= 100 ? 1 : 0; if (c.overT > 0) c.overT -= DT; c.asBonus = c.overT > 0 ? .45 : 0; },
      onBasic(s, c, t, o) { if (c.pready || c.overT > 0) { if (c.pready) c.volt = 0; arcBolt(s, c, t, 44 * pow(c), c.f.conductor ? 4 : 2, 'Static Charge'); o.crit = true; } },
    },
    tidecaller: {
      name: 'Tidecaller', role: 'Water controller', blurb: 'The tide does not ask.', dtype: 'magic', arch: 'support',
      sight: 850, hp: 530, hpG: 76, dmg: 46, dmgG: 5, armor: 20, armG: 3.5, range: 300, as: .85, ms: 310, pref: 270, support: true, fit: { top: 0, jungle: 0, bottom: 1, support: 3 },
      passive: { name: 'High Tide', d: 'Every third ability you cast restores 5% health to allies around you.' },
      builds: [
        { id: 'wellspring', name: 'Wellspring', tag: 'Healer', d: 'Riptide heals far more, High Tide reaches farther. Softer pushes.', mods: { 0: { heal_add: 45, push: 50 } } },
        { id: 'undertow', name: 'Undertow', tag: 'Displace', d: 'Riptide drags enemies toward you instead of away and hits harder.', mods: { 0: { dmg_add: 22, heal_add: -30, d: 'A wave that drags enemies toward you and heals allies.' } } },
        { id: 'deluge', name: 'Deluge', tag: 'Team fight', d: 'Tsunami comes up sooner and is wider.', mods: { 2: { cd: 34, w_add: 60 } } },
        { id: 'abyss', name: 'Abyss', tag: 'Control', d: 'Bubble holds enemies longer but shields allies less.', mods: { 1: { stunT: 1.45, shield_add: -50, cd_add: 1.5 } } },
      ],
      evolves: [
        [{ id: 'swiftcurrent', name: 'Swift Current', d: 'Riptide cooldown 1 shorter.', mods: { 0: { cd_add: -1 } } }, { id: 'deepbubble', name: 'Deep Bubble', d: 'Bubble reaches 75 farther.', mods: { 1: { range_add: 75 } } }],
        [{ id: 'rogue', name: 'Rogue Wave', d: 'Tsunami stuns enemies for 0.6 as it strikes them.' }, { id: 'stillwater', name: 'Still Water', d: 'Tsunami heals allies twice as much and hastens them.' }],
      ],
      kit: [
        { name: 'Riptide', d: 'A wave that pushes enemies away and heals every ally it passes.', fx: 'riptide', cd: 6, range: 480, shape: 'line', w: 66, heal: 92, dmg: 70, push: 110,
          cast(s, c, a, A) { tideTick(s, c); const car = {}; fire(s, c, a, { speed: 1050, range: A.range, w: A.w, fx: 'riptide', pierce: true, filter: 'allchamp', hit(s, c, t, p) {
            if (t.team === c.team) { heal(s, c, t, A.heal * pow(c)); skillHit(c, car); return; }
            hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); skillHit(c, car); if (t.alive) { slow(t, .3, 1.2); const dir = c.f.undertow ? -1 : 1, l = Math.min(A.push, c.f.undertow ? Math.max(0, dist(c, t) - 90) : A.push); dashDir(t, a.dx * dir, a.dy * dir, l, 900, { forced: true }); }
          } }); },
        },
        { name: 'Bubble', d: 'Encase a champion: an ally is shielded and cleansed, an enemy is held.', fx: 'bubble', cd: 12, range: 405, shape: 'circle', r: 100, target: true, shield: 150, stunT: 1,
          cast(s, c, a, A) {
            let t = null, bd = 180; for (const e of s.champs) { if (!e.alive || e.air || (e !== c && e.team !== c.team && !canSee(s, c.team, e))) continue; const d = Math.hypot(e.x - a.tx, e.y - a.ty); if (d < bd) { bd = d; t = e; } }
            if (!t || dist(c, t) > A.range + 45 || !hasLOS(c.x, c.y, t.x, t.y)) return false; tideTick(s, c); c.stats.skillHits++;
            s.ev.push({ e: 'boom', x: t.x, y: t.y, r: 70, fx: 'bubble' });
            if (t.team === c.team) { shield(s, t, A.shield * hpow(c), 3); t.stunT = t.rootT = t.slowT = 0; } else { stun(s, t, A.stunT); t.revealT = Math.max(t.revealT || 0, A.stunT); }
          },
        },
        { name: 'Tsunami', d: 'A great wave rolls forward, sweeping enemies back and lifting allies.', fx: 'tsunami', cd: 52, range: 700, shape: 'line', w: 280, dmg: 150, heal: 150,
          cast(s, c, a, A) { tideTick(s, c);
            const z = field(s, c, 'tidewave', { x: c.x, y: c.y, r: A.w / 2, dur: 1.35, fx: 'tsunami', dx: a.dx, dy: a.dy, hits: {}, stop: rayWall(c.x, c.y, a.dx, a.dy, A.range) / 1.35 });
            z.step = (s, z) => { z.x += z.dx * z.stop * DT; z.y += z.dy * z.stop * DT; for (const t of s.champs) { if (!t.alive || t.air || z.hits[t.id] || Math.hypot(t.x - z.x, t.y - z.y) > z.r + t.r) continue; z.hits[t.id] = 1;
              if (t.team === c.team) { heal(s, c, t, A.heal * pow(c) * (c.f.stillwater ? 2 : 1)); if (c.f.stillwater) haste(t, .25, 2.5); }
              else { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.alive) { slow(t, .35, 1.5); dashDir(t, z.dx, z.dy, 170, 900, { forced: true }); if (c.f.rogue) stun(s, t, .6); } if (!z.counted) { z.counted = true; c.stats.skillHits++; } } } };
          },
        },
      ],
    },
    paragon: {
      name: 'Paragon', role: 'Sky bruiser', blurb: 'Comes down harder than he goes up.', dtype: 'phys', arch: 'bruiser',
      sight: 740, hp: 630, hpG: 96, dmg: 63, dmgG: 8, armor: 27, armG: 4, range: 145, as: .92, ms: 320, pref: 108, melee: true, fit: { top: 3, jungle: 2, bottom: 0, support: 1 },
      passive: { name: 'Altitude', d: 'Landing from any leap makes your next three basic attacks hit 25% harder.' },
      builds: [
        { id: 'skyknight', name: 'Skyknight', tag: 'Mobile', d: 'Skyward comes back fast and lands lighter.', mods: { 0: { cd: 6.2, dmg_add: -18 } } },
        { id: 'sunstriker', name: 'Sunstriker', tag: 'Damage', d: 'Solar Fist hits much harder and reaches farther, but shields less.', mods: { 1: { dmg_add: 34, range_add: 35, shield: .05 } } },
        { id: 'titanwing', name: 'Titanwing', tag: 'Global', d: 'Meteor Drop comes up far more often, with a smaller impact.', mods: { 2: { cd: 34, r_add: -40, dmg_add: -30 } } },
        { id: 'aegisborn', name: 'Aegisborn', tag: 'Tank', d: 'Solar Fist shields far more. Sturdy, lighter hits.', stats: { hp: 1.12, dmg: .9 }, mods: { 1: { shield: .18 } } },
      ],
      evolves: [
        [{ id: 'updraft', name: 'Updraft', d: 'Skyward reaches 70 farther.', mods: { 0: { range_add: 70 } } }, { id: 'radiantfist', name: 'Radiant Fist', d: 'Solar Fist cooldown 1.5 shorter.', mods: { 1: { cd_add: -1.5 } } }],
        [{ id: 'shockfall', name: 'Shockfall', d: 'Meteor Drop leaves shaking ground that slows.' }, { id: 'freeflight', name: 'Free Flight', d: 'Landing restores 10% of your health.' }],
      ],
      kit: [
        { name: 'Skyward', d: 'Leap to a point and land with a slowing shock.', fx: 'skyward', cd: 9, range: 330, shape: 'circle', r: 120, over: true, dmg: 76,
          cast(s, c, a, A) { c.air = .4; c.leap = { sx: c.x, sy: c.y, tx: a.tx, ty: a.ty, t: 0, total: .4, fn(s, c) { skyLand(s, c, A.r, A.dmg * pow(c), .8, 0, 'skyward'); } }; },
        },
        { name: 'Solar Fist', d: 'A punch that drives champions back and shields you for each one struck.', fx: 'solarfist', cd: 7, range: 190, shape: 'cone', w: 140, dmg: 78, shield: .08,
          cast(s, c, a, A) { const n = cone(s, c, a, A.range, .45, t => { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.alive && t.kind === 'champ') dashDir(t, a.dx, a.dy, 120, 1000, { forced: true }); }); if (n) { c.stats.skillHits++; shield(s, c, c.maxHp * A.shield * n, 3); } },
        },
        { name: 'Meteor Drop', d: 'Rise out of reach, then fall anywhere nearby with a stunning impact.', fx: 'meteordrop', cd: 58, range: 760, shape: 'circle', r: 210, over: true, dmg: 190,
          cast(s, c, a, A) { c.air = 1.05; c.leap = { sx: c.x, sy: c.y, tx: a.tx, ty: a.ty, t: 0, total: 1.05, fn(s, c) { skyLand(s, c, A.r, A.dmg * pow(c), 0, .85, 'meteordrop'); if (c.f.shockfall) field(s, c, 'miasma', { x: c.x, y: c.y, r: A.r, dur: 2.5, fx: 'meteordrop', step(s, z) { if (s.tick % 6 === 0) for (const t of enemiesIn(s, c, z.x, z.y, z.r)) slow(t, .35, .4); } }); } }; },
        },
      ],
      onBasic(s, c, t, o) { if (c.altN > 0) { c.altN--; o.dmg *= 1.25; o.crit = true; } },
      tick(s, c) { c.pstack = c.altN || 0; c.pready = c.altN > 0 ? 1 : 0; },
    },
    mirage: {
      name: 'Mirage', role: 'Illusion marksman', blurb: 'Aim at the one that is not there.', dtype: 'phys', arch: 'marksman',
      sight: 930, hp: 515, hpG: 70, dmg: 58, dmgG: 7, armor: 15, armG: 3, range: 350, as: 1.0, ms: 308, pref: 318, fit: { top: 1, jungle: 0, bottom: 3, support: 0 },
      passive: { name: 'Double Image', d: 'Every fourth basic attack fires a twin bolt for 60% damage.' },
      builds: [
        { id: 'twinshot', name: 'Twinshot', tag: 'Attack speed', d: 'The twin fires every third attack.', stats: { as: 1.06 }, mods: {} },
        { id: 'shade', name: 'Shade', tag: 'Evasive', d: 'Phantom Step hides you longer and comes back faster.', mods: { 1: { cd: 7.5, stealth: 1.5 } } },
        { id: 'kaleidoscope', name: 'Kaleidoscope', tag: 'Team fight', d: 'Hall of Mirrors is wider and comes up sooner, its shards lighter.', mods: { 2: { cd: 34, r_add: 50, shot: 34 } } },
        { id: 'hollow', name: 'Hollow', tag: 'Trap', d: 'Your decoy bursts when it fades, slowing and striking enemies near it.', mods: { 1: { d: 'Dash, vanish, and leave a decoy that bursts.' } } },
      ],
      evolves: [
        [{ id: 'splinter', name: 'Splinter', d: 'Split Shot cooldown 1 shorter.', mods: { 0: { cd_add: -1 } } }, { id: 'farstep', name: 'Far Step', d: 'Phantom Step reaches 50 farther.', mods: { 1: { range_add: 50 } } }],
        [{ id: 'infinite', name: 'Infinite Regress', d: 'Hall of Mirrors lasts a second longer.', mods: { 2: { dur_add: 1 } } }, { id: 'crackedglass', name: 'Cracked Glass', d: 'Hall of Mirrors slows those inside by 30%.' }],
      ],
      kit: [
        { name: 'Split Shot', d: 'Three bolts in a narrow fan. Extra bolts on one target hit for less.', fx: 'splitshot', cd: 6, range: 510, shape: 'line', w: 30, dmg: 88,
          cast(s, c, a, A) { const seen = {}, car = {}; for (const r of [-.17, 0, .17]) { const co = Math.cos(r), si = Math.sin(r), dx = a.dx * co - a.dy * si, dy = a.dx * si + a.dy * co; fire(s, c, { dx, dy }, { speed: 1500, range: A.range, w: A.w, fx: 'splitshot', filter: 'units', hit(s, c, t, p) { const k = seen[t.id] ? .4 : 1; seen[t.id] = 1; hurt(s, c, t, A.dmg * k * pow(c), { skill: 1 }); if (t.kind === 'champ') skillHit(c, car); p.left = 0; } }); } },
        },
        { name: 'Phantom Step', d: 'Dash away and vanish for a moment, leaving your double behind.', fx: 'phantom', cd: 11, range: 230, shape: 'dash', w: 60, stealth: .8, keepStealth: true, pd: [230, 1300],
          cast(s, c, a, A) { const x = c.x, y = c.y, z = field(s, c, 'decoy', { x, y, r: 26, dur: 2.2, x0: x, vx: 0, vy: 0 }); z.end = (s, z) => { s.ev.push({ e: 'boom', x: z.x, y: z.y, r: 120, fx: 'phantom' }); if (c.f.hollow) for (const t of enemiesIn(s, c, z.x, z.y, 150, true)) { hurt(s, c, t, 110 * pow(c), { skill: 1 }); slow(t, .4, 1.5); } }; dashDir(c, a.dx, a.dy, A.range, 1300); stealth(s, c, A.stealth); },
        },
        { name: 'Hall of Mirrors', d: 'Illusions ring a zone and fire shards at everyone inside.', fx: 'mirrors', cd: 50, range: 600, shape: 'circle', r: 240, dur: 3, shot: 46,
          cast(s, c, a, A) { const z = field(s, c, 'mirrors', { x: a.tx, y: a.ty, r: A.r, dur: A.dur }); z.step = (s, z) => { if (s.tick % 9) return; for (const t of s.champs) if (t.alive && !t.air && t.team !== c.team && Math.hypot(t.x - z.x, t.y - z.y) < z.r + t.r) { hurt(s, c, t, A.shot * pow(c), { skill: 1 }); if (c.f.crackedglass) slow(t, .3, .5); s.ev.push({ e: 'phit', x: t.x, y: t.y, fx: 'mirrors' }); if (!z.counted) { z.counted = true; c.stats.skillHits++; } } }; },
        },
      ],
      onBasic(s, c, t, o) { c.pstack = ((c.pstack || 0) + 1) % (c.f.twinshot ? 3 : 4); if (!c.pstack) homing(s, c, t, o.dmg * .6, 1100, 'bolt', { basic: 1 }); },
    },

    // ---------- 10.0 Villains ----------
    cinder: {
      name: 'Cinder', role: 'Pyromancer', blurb: 'She only wanted to warm up the city.', dtype: 'magic', arch: 'mage',
      sight: 860, hp: 495, hpG: 66, dmg: 50, dmgG: 5, armor: 14, armG: 3, range: 320, as: .85, ms: 302, pref: 290, fit: { top: 1, jungle: 0, bottom: 3, support: 1 },
      passive: { name: 'Kindling', d: 'Your abilities stack kindling on enemies. The third stack ignites them in a small blast.' },
      builds: [
        { id: 'pyre', name: 'Pyre', tag: 'Burn', d: 'Everything you ignite burns harder and longer.', mods: { 0: { dmg_add: -8 } } },
        { id: 'ashwalker', name: 'Ashwalker', tag: 'Mobile', d: 'Scorched Earth is quicker to return and you run much faster on it.', mods: { 1: { cd: 6.6, dur: 3 } } },
        { id: 'wildfire', name: 'Wildfire', tag: 'Spread', d: 'Ignition throws kindling onto nearby enemies.', mods: {} },
        { id: 'firestorm', name: 'Firestorm', tag: 'Ultimate', d: 'Inferno comes up far sooner and lands quicker, with a smaller blast.', mods: { 2: { cd: 32, delay: .7, r_add: -45 } } },
      ],
      evolves: [
        [{ id: 'kindlebolt', name: 'Quick Fuse', d: 'Firebolt cooldown 0.7 shorter.', mods: { 0: { cd_add: -.7 } } }, { id: 'widescorch', name: 'Wide Scorch', d: 'Scorched Earth is 30 wider.', mods: { 1: { r_add: 30 } } }],
        [{ id: 'blackash', name: 'Black Ash', d: 'Inferno also blocks healing for 2 seconds.' }, { id: 'afterburn', name: 'Afterburn', d: 'Inferno leaves flames twice as long.' }],
      ],
      kit: [
        { name: 'Firebolt', d: 'A quick bolt that sets kindling on the first enemy.', fx: 'firebolt', cd: 3.6, range: 495, shape: 'line', w: 40, dmg: 76,
          cast(s, c, a, A) { fire(s, c, a, { speed: 1150, range: A.range, w: A.w, fx: 'firebolt', filter: 'units', hit(s, c, t, p) { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.kind === 'champ') skillHit(c, p); p.left = 0; if (t.alive) kindle(s, c, t, 1); } }); },
        },
        { name: 'Scorched Earth', d: 'Set the ground alight. Enemies burn, and you run faster on it.', fx: 'scorch', cd: 9, range: 420, shape: 'circle', r: 135, dur: 3.5, dps: 44,
          cast(s, c, a, A) { const z = field(s, c, 'miasma', { x: a.tx, y: a.ty, r: A.r, dur: A.dur, fx: 'scorch', n: 0 }); z.step = (s, z) => { if (dist(c, z) < z.r) haste(c, c.f.ashwalker ? .32 : .15, .2); if (s.tick % 9) return; for (const t of enemiesIn(s, c, z.x, z.y, z.r)) { bleed(s, c, t, A.dps * pow(c) * (c.f.pyre ? 1.35 : 1), 2); if (s.tick % 27 === 0) kindle(s, c, t, 1); if (t.kind === 'champ' && !z.counted) { z.counted = true; c.stats.skillHits++; } } }; },
        },
        { name: 'Inferno', d: 'A long fuse, then a huge explosion that leaves the ground burning.', fx: 'inferno', cd: 50, range: 520, shape: 'circle', r: 235, delay: 1, dmg: 215,
          cast(s, c, a, A) { blast(s, c, a.tx, a.ty, A.r, A.delay, (s, z) => { let hit = false; for (const t of enemiesIn(s, c, z.x, z.y, A.r)) { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.alive) kindle(s, c, t, 2); if (t.kind === 'champ') { hit = true; if (c.f.blackash) t.noHealT = Math.max(t.noHealT || 0, 2); } } if (hit) c.stats.skillHits++; const f = field(s, c, 'miasma', { x: z.x, y: z.y, r: A.r * .8, dur: c.f.afterburn ? 5 : 2.5, fx: 'scorch' }); f.step = (s, y) => { if (s.tick % 15) return; for (const t of enemiesIn(s, c, y.x, y.y, y.r)) bleed(s, c, t, 34 * pow(c), 1); }; }, 'inferno'); },
        },
      ],
    },
    ravager: {
      name: 'Ravager', role: 'Feral beast', blurb: 'It smelled you three blocks ago.', dtype: 'phys', arch: 'bruiser',
      sight: 740, hp: 575, hpG: 88, dmg: 66, dmgG: 8, armor: 22, armG: 3.5, range: 135, as: .98, ms: 335, pref: 100, melee: true, fit: { top: 2, jungle: 3, bottom: 0, support: 0 },
      passive: { name: 'Bloodscent', d: 'Enemies below half health nearby are revealed to you, and you run faster toward them.' },
      builds: [
        { id: 'alpha', name: 'Alpha', tag: 'Jungle', d: 'Maul shreds monsters and heals much more from them.', mods: { 0: { d: 'Cleave in front. Far stronger against monsters.' } } },
        { id: 'savage', name: 'Savage', tag: 'Cleave', d: 'Maul sweeps wider and reaches farther.', mods: { 0: { dot: .2, range_add: 40 } } },
        { id: 'packleader', name: 'Pack Leader', tag: 'Team', d: 'Frenzy also hastens allies around you.', mods: {} },
        { id: 'hemorrhage', name: 'Hemorrhage', tag: 'Bleed', d: 'Maul opens a deep bleed. Lighter strike.', mods: { 0: { dmg_add: -18, dps: 34 } } },
      ],
      evolves: [
        [{ id: 'quickmaul', name: 'Quick Maul', d: 'Maul cooldown 0.8 shorter.', mods: { 0: { cd_add: -.8 } } }, { id: 'longpounce', name: 'Long Pounce', d: 'Pounce reaches 70 farther.', mods: { 1: { range_add: 70 } } }],
        [{ id: 'unending', name: 'Unending', d: 'Frenzy lasts 2 seconds longer.', mods: { 2: { dur_add: 2 } } }, { id: 'goreroot', name: 'Pinning Claws', d: 'Pounce pins for 0.4 longer.', mods: { 1: { rootT_add: .4 } } }],
      ],
      kit: [
        { name: 'Maul', d: 'Cleave in front, healing for part of the damage.', fx: 'maul', cd: 4.2, range: 190, shape: 'cone', w: 150, dmg: 84, dot: .5,
          cast(s, c, a, A) { let got = 0; const n = cone(s, c, a, A.range, A.dot, t => { const m = c.f.alpha && t.kind === 'monster' ? 1.7 : 1, v = hurt(s, c, t, A.dmg * pow(c) * m, { skill: 1 }); got += (v || 0) * (m > 1 ? .3 : .16); if (A.dps && t.alive) bleed(s, c, t, A.dps * pow(c), 3); }); if (got) heal(s, c, c, got); if (n) c.stats.skillHits++; },
        },
        { name: 'Pounce', d: 'Leap onto an enemy and pin them. With no target, leap to the point.', fx: 'pounce', cd: 10, range: 340, shape: 'circle', r: 90, over: true, dmg: 78, rootT: .7,
          cast(s, c, a, A) { const t = nearChamp(s, c, a.tx, a.ty, 180), g = t && dist(c, t) <= A.range + 45 ? t : null; c.air = .32; c.leap = { sx: c.x, sy: c.y, tx: g ? g.x : a.tx, ty: g ? g.y : a.ty, t: 0, total: .32, fn(s, c) { s.ev.push({ e: 'boom', x: c.x, y: c.y, r: 90, fx: 'pounce' }); const hit = g && g.alive && !g.air && dist(c, g) < 140 ? g : null; if (hit) { hurt(s, c, hit, A.dmg * pow(c), { skill: 1 }); root(s, hit, A.rootT); c.stats.skillHits++; } } }; },
        },
        { name: 'Frenzy', d: 'Lose yourself: much faster attacks, speed and lifesteal.', fx: 'frenzy', cd: 48, range: 0, shape: 'self', instant: true, dur: 6,
          cast(s, c, a, A) { c.frenzyT = A.dur; haste(c, .22, A.dur); if (c.f.packleader) for (const al of alliesIn(s, c.team, c.x, c.y, 420)) if (al !== c) haste(al, .2, 4); },
        },
      ],
      tick(s, c) { if (c.frenzyT > 0) c.frenzyT -= DT; c.asBonus = c.frenzyT > 0 ? .5 : 0; c.lsBonus = c.frenzyT > 0 ? .25 : 0; c.pready = c.frenzyT > 0 ? 1 : 0; if (s.tick % 15 === 0) for (const e of s.champs) if (e.alive && e.team !== c.team && e.hp / e.maxHp < .5 && dist(e, c) < 950) { e.revealT = Math.max(e.revealT || 0, .6); haste(c, .1, .55); } },
    },
    cataclysm: {
      name: 'Cataclysm', role: 'Siege brute', blurb: 'Walks up to the wall. The wall reconsiders.', dtype: 'phys', arch: 'tank',
      sight: 700, hp: 690, hpG: 106, dmg: 56, dmgG: 7, armor: 32, armG: 4.5, range: 150, as: .78, ms: 300, pref: 120, melee: true, fit: { top: 3, jungle: 1, bottom: 0, support: 1 },
      passive: { name: 'Siege Engine', d: 'Every fifth basic attack splashes around the target. Your attacks hit structures 25% harder.' },
      builds: [
        { id: 'bastille', name: 'Bastille', tag: 'Tank', d: 'Entrench hardens you longer and comes back sooner. Lighter hits.', stats: { hp: 1.12, dmg: .9 }, mods: { 1: { cd: 9, dur: 2.8 } } },
        { id: 'artillery', name: 'Artillery', tag: 'Poke', d: 'Bombard reaches much farther and lands wider.', mods: { 0: { range_add: 110, r_add: 25, cd_add: 1 } } },
        { id: 'wreckingcrew', name: 'Wrecking Crew', tag: 'Split push', d: 'Everything hits structures far harder. Weaker in long fights.', stats: { hp: .95 }, mods: {} },
        { id: 'moonquake', name: 'Moonquake', tag: 'Ultimate', d: 'Earthbreaker comes up far more often and lifts for less time.', mods: { 2: { cd: 32, knockT: .6 } } },
      ],
      evolves: [
        [{ id: 'shrapnel', name: 'Shrapnel', d: 'Bombard slows those it hits by 35%.' }, { id: 'digin', name: 'Dig In', d: 'Entrench cooldown 2 shorter.', mods: { 1: { cd_add: -2 } } }],
        [{ id: 'fault', name: 'Fault Line', d: 'Earthbreaker reaches 90 farther.', mods: { 2: { range_add: 90 } } }, { id: 'tremor', name: 'Tremor', d: 'The Entrench shockwave stuns for 0.6.' }],
      ],
      kit: [
        { name: 'Bombard', d: 'Lob a shell onto the ground. It hits hard, slowly.', fx: 'bombard', cd: 7, range: 495, shape: 'circle', r: 130, delay: .75, dmg: 118,
          cast(s, c, a, A) { const car = {}; blast(s, c, a.tx, a.ty, A.r, A.delay, (s, z) => { eachEnemy(s, c, z.x, z.y, A.r, t => { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (c.f.shrapnel) slow(t, .35, 1.2); if (t.kind === 'champ') skillHit(c, car); }); }, 'bombard'); },
        },
        { name: 'Entrench', d: 'Plant yourself and take far less damage, then release a shockwave.', fx: 'entrench', cd: 12, range: 0, shape: 'self', instant: true, dur: 2, dmg: 88,
          cast(s, c, a, A) { c.drT = Math.max(c.drT, A.dur); slow(c, .35, A.dur); const z = field(s, c, 'miasma', { x: c.x, y: c.y, r: 190, dur: A.dur, fx: 'entrench' }); z.step = (s, z) => { z.x = c.x; z.y = c.y; if (!c.alive) z.t = 0; }; z.end = (s, z) => { if (!c.alive) return; s.ev.push({ e: 'boom', x: c.x, y: c.y, r: 190, fx: 'entrench' }); let hit = false; eachEnemy(s, c, c.x, c.y, 190, t => { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.kind === 'champ') { hit = true; if (c.f.tremor) stun(s, t, .6); } }); if (hit) c.stats.skillHits++; }; },
        },
        { name: 'Earthbreaker', d: 'Split the ground in a long line, lifting enemies and cracking structures.', fx: 'earthbreak', cd: 50, range: 540, shape: 'line', w: 150, delay: .6, dmg: 172, knockT: .9,
          cast(s, c, a, A) { const len = rayWall(c.x, c.y, a.dx, a.dy, A.range), z = field(s, c, 'fissure', lineZone({ r: A.w / 2, dur: A.delay, fx: 'earthbreak' }, c.x, c.y, c.x + a.dx * len, c.y + a.dy * len)); z.fn = (s, z) => { s.ev.push({ e: 'boom', x: z.x, y: z.y, r: z.r, fx: 'earthbreak', x2: z.x2, y2: z.y2 }); let hit = false; const test = t => { if (t.alive && !t.air && t.team !== c.team && segDist(t.x, t.y, z.x1, z.y1, z.x2, z.y2) < A.w / 2 + t.r) { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.alive) knock(s, t, A.knockT); if (t.kind === 'champ') hit = true; } }; s.champs.forEach(test); s.minions.forEach(test); s.monsters.forEach(test); for (const t of s.towers) if (t.alive && t.team !== c.team && segDist(t.x, t.y, z.x1, z.y1, z.x2, z.y2) < A.w / 2 + t.r) hurt(s, c, t, A.dmg * pow(c) * 2.5, { skill: 1 }); if (hit) c.stats.skillHits++; }; },
        },
      ],
      onBasic(s, c, t, o) { c.pstack = ((c.pstack || 0) + 1) % 5; if (t.kind === 'tower') o.dmg *= c.f.wreckingcrew ? 1.6 : 1.25; if (!c.pstack) { o.crit = true; for (const e of enemiesIn(s, c, t.x, t.y, 150)) if (e !== t) hurt(s, c, e, o.dmg * .5, { skill: 1 }); s.ev.push({ e: 'boom', x: t.x, y: t.y, r: 150, fx: 'bombard' }); } },
    },
    puppeteer: {
      name: 'The Puppeteer', role: 'Controller', blurb: 'Everyone dances eventually.', dtype: 'magic', arch: 'support',
      sight: 860, hp: 515, hpG: 74, dmg: 46, dmgG: 5, armor: 18, armG: 3.2, range: 300, as: .85, ms: 310, pref: 270, support: true, fit: { top: 0, jungle: 0, bottom: 1, support: 3 },
      passive: { name: 'Strings', d: 'Enemies hit by your abilities are strung for 3 seconds and take 8% more damage from your whole team.' },
      builds: [
        { id: 'marionettist', name: 'Marionettist', tag: 'Roots', d: 'Thread holds longer and comes back sooner.', mods: { 0: { cd: 7, rootT: 1.2 } } },
        { id: 'troupe', name: 'The Troupe', tag: 'Summons', d: 'Two puppets can stand at once, each shooting faster.', mods: { 1: { cd: 8, max: 2, every: 14 } } },
        { id: 'maestro', name: 'Maestro', tag: 'Ultimate', d: 'Dance of Strings also seizes a second enemy nearby.', mods: { 2: { cd_add: 4 } } },
        { id: 'ventriloquist', name: 'Ventriloquist', tag: 'Support', d: 'Puppets also heal the lowest ally near them.', mods: { 1: { shot_add: -8 } } },
      ],
      evolves: [
        [{ id: 'silkthread', name: 'Silk Thread', d: 'Thread reaches 70 farther.', mods: { 0: { range_add: 70 } } }, { id: 'tougherwood', name: 'Hardwood', d: 'Puppets last 1.5 seconds longer.', mods: { 1: { dur_add: 1.5 } } }],
        [{ id: 'cutstrings', name: 'Cut Strings', d: 'Strung enemies take 12% more instead of 8%.' }, { id: 'encore', name: 'Encore', d: 'Dance of Strings holds for 0.4 longer.', mods: { 2: { dur_add: .4 } } }],
      ],
      kit: [
        { name: 'Thread', d: 'A fine line that roots the first champion it catches.', fx: 'thread', cd: 9, range: 480, shape: 'line', w: 40, dmg: 66, rootT: .9,
          cast(s, c, a, A) { fire(s, c, a, { speed: 1250, range: A.range, w: A.w, fx: 'thread', filter: 'champ', hit(s, c, t, p) { if (t.team === c.team) return; hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.alive) { root(s, t, A.rootT); string(s, c, t); } skillHit(c, p); p.left = 0; } }); },
        },
        { name: 'Puppet Guard', d: 'Place a puppet that shoots enemies near it.', fx: 'puppet', cd: 11, range: 420, shape: 'circle', r: 120, dur: 4, shot: 34, every: 18, max: 1,
          cast(s, c, a, A) { const mine = s.zones.filter(z => z.kind === 'puppet' && z.owner === c); if (mine.length >= A.max) mine[0].t = .01; const z = field(s, c, 'puppet', { x: a.tx, y: a.ty, r: 26, dur: A.dur, n: 0 }); z.step = (s, z) => { if (++z.n < A.every) return; z.n = 0; let t = null, bd = 380; for (const e of s.champs) { if (!e.alive || e.air || e.team === c.team || !canSee(s, c.team, e)) continue; const d = Math.hypot(e.x - z.x, e.y - z.y); if (d < bd && hasLOS(z.x, z.y, e.x, e.y)) { bd = d; t = e; } } if (t) { homing(s, z, t, A.shot * pow(c), 1000, 'bolt', { team: c.team, owner: c, skill: 1, abil: 'Puppet Guard' }); string(s, c, t); if (!z.counted) { z.counted = true; c.stats.skillHits++; } } if (c.f.ventriloquist) { let al = null, f = .9; for (const b of alliesIn(s, c.team, z.x, z.y, 380)) { const v = b.hp / b.maxHp; if (v < f) { f = v; al = b; } } if (al) heal(s, c, al, 30 * pow(c)); } }; },
        },
        { name: 'Dance of Strings', d: 'Seize an enemy: they stagger toward you, helpless, then stumble free.', fx: 'dance', cd: 50, range: 420, shape: 'circle', r: 120, target: true, dur: 1.4, dmg: 120,
          cast(s, c, a, A) { const t = nearChamp(s, c, a.tx, a.ty, 180); if (!t || dist(c, t) > A.range + 45 || !hasLOS(c.x, c.y, t.x, t.y)) return false; const go = u => { hurt(s, c, u, A.dmg * pow(c), { skill: 1 }); if (!u.alive) return; const n = norm(c.x - u.x, c.y - u.y); stun(s, u, A.dur); dashDir(u, n.x, n.y, Math.max(0, n.l - 110), 300, { forced: true }); string(s, c, u); s.ev.push({ e: 'boom', x: u.x, y: u.y, r: 70, fx: 'dance' }); }; go(t); if (c.f.maestro) { const o = enemiesIn(s, c, t.x, t.y, 330, true).find(e => e !== t && e.kind === 'champ'); if (o) go(o); } c.stats.skillHits++; },
        },
      ],
    },
  };

  // ---------- balance table ----------
  // Sweep-driven tuning lives here, multiplying the base numbers above, so a balance pass is a table edit.
  // Kit: hp, dmg (basic attack), as, ms (added), abil (ability damage and healing). Build: pw (ability power), hp, dmg, as.
  const TUNE = {
    kits: {cataclysm: { hp: 0.919, dmg: 0.919, abil: 0.919 }, cinder: { hp: 1.128, dmg: 1.128, abil: 1.128 }, deadbolt: { hp: 1.074, dmg: 1.074, abil: 1.074 }, duelist: { hp: 0.909, dmg: 0.909, abil: 0.909 }, gravel: { hp: 0.83, dmg: 0.83, abil: 0.83 }, hex: { hp: 1.115, dmg: 1.115, abil: 1.115 }, ione: { hp: 1.122, dmg: 1.122, abil: 1.122 }, ironjaw: { hp: 0.861, dmg: 0.861, abil: 0.861 }, kade: { hp: 0.833, dmg: 0.833, abil: 0.833 }, mirage: { hp: 0.954, dmg: 0.954, abil: 0.954 }, paragon: { hp: 0.852, dmg: 0.852, abil: 0.852 }, plague: { hp: 1.163, dmg: 1.163, abil: 1.163 }, puppeteer: { hp: 1.06, dmg: 1.06, abil: 1.06 }, ravager: { hp: 0.937, dmg: 0.937, abil: 0.937 }, sable: { hp: 1.168, dmg: 1.168, abil: 1.168 }, shiv: { hp: 1.119, dmg: 1.119, abil: 1.119 }, solenne: { hp: 0.924, dmg: 0.924, abil: 0.924 }, tidecaller: { hp: 0.883, dmg: 0.883, abil: 0.883 }, vesper: { hp: 1.007, dmg: 1.007, abil: 1.007 }, voltaic: { hp: 1.193, dmg: 1.193, abil: 1.193 }},
    builds: {abyss: { pw: 0.994 }, aegisborn: { pw: 1.073 }, alpha: { pw: 1.126 }, anchor: { pw: 0.932 }, apothecary: { pw: 1.137 }, artillery: { pw: 0.932 }, ashwalker: { pw: 0.932 }, bastille: { pw: 0.932, hp: 0.96 }, bladestorm: { pw: 0.936 }, blitz: { pw: 1.073 }, bloodletter: { pw: 1.058 }, bouncer: { pw: 0.932 }, brawler: { pw: 1.068 }, breaker: { pw: 1.06 }, butcher: { pw: 1.039 }, comet: { pw: 1.073 }, conductor: { pw: 0.932 }, constellation: { pw: 0.907 }, cursebinder: { pw: 1.137 }, cutthroat: { pw: 0.932 }, deluge: { pw: 1.038 }, executioner: { pw: 1.073 }, fencer: { pw: 0.984 }, firestorm: { pw: 0.993 }, fortress: { pw: 0.904 }, ghost: { pw: 0.932 }, gunslinger: { pw: 0.932 }, hemorrhage: { pw: 0.951 }, hollow: { pw: 0.971 }, honorbound: { pw: 0.867 }, hunter: { pw: 1.111 }, jailer: { pw: 1.121 }, jinx: { pw: 0.982 }, juggernaut: { pw: 0.88 }, kaleidoscope: { pw: 0.951 }, lifebringer: { pw: 0.932 }, maestro: { pw: 0.994 }, marionettist: { pw: 1.021 }, marksman: { pw: 0.932 }, masquerade: { pw: 1.223 }, meteor: { pw: 1.031 }, moonquake: { pw: 1.073 }, nightblade: { pw: 1.137 }, packleader: { pw: 0.932 }, parrymaster: { pw: 0.932 }, pestilence: { pw: 0.99 }, protector: { pw: 1.031 }, pyre: { pw: 1.126 }, radiant: { pw: 0.896 }, reaper: { pw: 1.107 }, ritualist: { pw: 0.904 }, savage: { pw: 0.895 }, seismic: { pw: 1.051 }, shade: { pw: 1.04 }, skirmisher: { pw: 0.932 }, spotter: { pw: 1.126 }, stellar: { pw: 1.046 }, stormchaser: { pw: 1.007 }, sunlance: { pw: 1.008 }, sunstriker: { pw: 0.886 }, surge: { pw: 1.158 }, thunderhead: { pw: 1.073 }, titanwing: { pw: 0.96 }, transmuter: { pw: 0.945 }, trapper: { pw: 1.037 }, troupe: { pw: 1.055 }, twin: { pw: 1.073 }, twinshot: { pw: 1.045, dmg: 0.95 }, undertow: { pw: 1.073 }, vanguard: { pw: 0.932 }, venomous: { pw: 1.086 }, ventriloquist: { pw: 0.945 }, ward: { pw: 0.932 }, warden: { pw: 1.073 }, wellspring: { pw: 0.932 }, wildfire: { pw: 1.03 }, wrecker: { pw: 1.073 }, wreckingcrew: { pw: 1.073 }},
  };
  const ABIL_KEYS = ['dmg', 'dmgF', 'dmgM', 'dmg0', 'dmg1', 'dmg2', 'dps', 'heal', 'shot'];
  // Damage types. A kit's dtype is the default for its abilities; an ability's own `mag` overrides it. Basic attacks are physical.
  const KIT_TYPE = { vesper: ['phys', 'marksman'], kade: ['phys', 'bruiser'], ione: ['magic', 'mage'], solenne: ['magic', 'support'], sable: ['phys', 'assassin'], gravel: ['phys', 'tank'], deadbolt: ['phys', 'marksman'], duelist: ['phys', 'bruiser'], hex: ['magic', 'mage'], plague: ['magic', 'support'], shiv: ['phys', 'assassin'], ironjaw: ['phys', 'tank'] };
  const MAG_OVERRIDE = { Stomp: true, Avalanche: true, Demolish: true, Lockdown: true, 'Wrecking Ball': true, Deadeye: false };
  const MAG_ABIL = {};
  for (const id in KITS) {
    const k = KITS[id], ty = KIT_TYPE[id]; if (ty) { k.dtype = ty[0]; k.arch = ty[1]; }
    if (k.mr === undefined) k.mr = Math.round(k.armor * .7 + 8); if (k.mrG === undefined) k.mrG = Math.round(k.armG * 7) / 10;
    for (const a of k.kit) { if (MAG_OVERRIDE[a.name] !== undefined) a.mag = MAG_OVERRIDE[a.name]; a.dtype = (a.mag === undefined ? k.dtype === 'magic' : a.mag) ? 'magic' : 'phys'; MAG_ABIL[a.name] = a.dtype === 'magic'; }
  }
  for (const id in KITS) {
    const k = KITS[id], t = TUNE.kits[id] || {};
    if (t.hp) { k.hp = Math.round(k.hp * t.hp); k.hpG = Math.round(k.hpG * t.hp * 10) / 10; }
    if (t.dmg) { k.dmg = Math.round(k.dmg * t.dmg * 10) / 10; k.dmgG = Math.round(k.dmgG * t.dmg * 100) / 100; }
    if (t.as) k.as = Math.round(k.as * t.as * 1000) / 1000;
    if (t.ms) k.ms += t.ms;
    if (t.abil) for (const a of k.kit) for (const key of ABIL_KEYS) if (typeof a[key] === 'number') a[key] = Math.round(a[key] * t.abil * 100) / 100;
    for (const b of k.builds) {
      const u = TUNE.builds[b.id] || {};
      if (u.pw) b.pw = u.pw;
      if (u.hp || u.dmg || u.as) { b.stats = Object.assign({}, b.stats || {}); if (u.hp) b.stats.hp = (b.stats.hp || 1) * u.hp; if (u.dmg) b.stats.dmg = (b.stats.dmg || 1) * u.dmg; if (u.as) b.stats.as = (b.stats.as || 1) * u.as; }
    }
  }

  // A ricochet is a straight shot aimed at launch, leading the next target once. It never steers.
  function ricochetNext(s, c, A, from, seen, left, pw) {
    if (left <= 0) return;
    let n = null, bd = 285;
    const tryIt = e => { if (!e.alive || e.air || e.team === c.team || seen.has(e.id) || !canSee(s, c.team, e)) return; const d = dist(from, e); if (d < bd && hasLOS(from.x, from.y, e.x, e.y)) { bd = d; n = e; } };
    s.champs.forEach(tryIt); if (!n) { s.minions.forEach(tryIt); s.monsters.forEach(tryIt); } if (!n) return;
    const hits = new Set(seen); seen.add(n.id);
    const fly = bd / 1500, aim = norm(n.x + (n.vx || 0) * fly - from.x, n.y + (n.vy || 0) * fly - from.y), reach = rayWall(from.x, from.y, aim.x, aim.y, bd * 1.3 + 60);
    s.proj.push({ id: s.nid++, x: from.x, y: from.y, px: from.x, py: from.y, vx: aim.x * 1500, vy: aim.y * 1500, left: reach, w: 30, team: c.team, owner: c, fx: 'ricochet', pierce: false, hits, filter: 'units', skill: true, counted: false, age: 0, abil: curAbil,
      hit(s, c, t, p) { hurt(s, c, t, A.dmg * pow(c) * pw, { skill: 1 }); if (t.kind === 'champ') skillHit(c, p); p.left = 0; ricochetNext(s, c, A, t, seen, left - 1, pw * A.bdmg); } });
  }
  // Flourish cut n (0, 1, 2). Auto-faces for phones. Lands in the direction of the nearest visible champion.
  function flourish(s, c, A, n) {
    const reach = A['reach' + n], f = autoFace(s, c, reach + 80), a = { dx: f.dx, dy: f.dy };
    if (n === 1) dashDir(c, a.dx, a.dy, 75 + (c.f.lunging ? 40 : 0), 1100);
    let hit = 0; const spin = n === 2 && c.f.bladestorm;
    eachEnemy(s, c, c.x, c.y, reach, t => { const v = norm(t.x - c.x, t.y - c.y); if (!spin && v.x * a.dx + v.y * a.dy < .35) return; if (!hasLOS(c.x, c.y, t.x, t.y)) return;
      let d = A['dmg' + n] * pow(c); if (n === 2 && c.f.coupdegrace) d += (t.maxHp - t.hp) * .12; if (t.kind === 'champ') { hit = 1; c.pstack = Math.min(5, (c.pstack || 0) + 1); c.ptime = 3; }
      hurt(s, c, t, d, { skill: 1, crit: n === 2 ? 1 : 0 }); if (n === 2 && t.alive && t.kind === 'champ') knock(s, t, A.knockT); });
    if (hit) c.stats.skillHits++;
    if (hit && n === 2) c.cd[1] = Math.max(0, c.cd[1] - 4);
    if (hit && n === 2 && c.f.fencer) c.cd[0] *= .5;
  }
  function detonate(s, c, t, mul) {
    const n = t.curseN, cap = curseCap(c); t.curseN = 0; t.curseT = 0;
    hurt(s, c, t, (36 + 31 * n * (c.f.cursebinder && n >= cap ? 1.3 : 1)) * pow(c) * mul, { skill: 1, crit: n >= cap ? 1 : 0 });
    s.ev.push({ e: 'boom', x: t.x, y: t.y, r: 70, fx: 'break' });
    if (t.alive && t.kind === 'champ' && n >= 3) stun(s, t, .5 + (n - 3) * .1);
    if (c.f.hexburst) for (const o of enemiesIn(s, c, t.x, t.y, 170)) if (o !== t) curse(s, c, o, 1);
  }
  function spreadCurses(s, t) { const c = t.curseBy; if (!c || !c.alive) return; const n = t.curseN; for (const o of enemiesIn(s, c, t.x, t.y, 280, true)) if (o !== t) curse(s, c, o, Math.max(1, n - 1)); }

  // Items. ad = attack power (basics and physical abilities), ap = ability power (magic abilities), both as percentages.
  // armor against physical, mr against magic; pen and mpen ignore a fraction of them. cost is the price of this step from its upgradesFrom.
  const ITEMS = [
    // Attack
    { id: 'whetstone', name: 'Whetstone', d: '+9% attack power.', cost: 350, tier: 1, tags: ['attack'], ad: .09 },
    { id: 'serrated', name: 'Serrated Edge', d: '+18% attack power. Basic attacks on champions add a light bleed.', cost: 550, tier: 2, tags: ['attack'], upgradesFrom: 'whetstone', ad: .18, u: 'bleed' },
    { id: 'trigger', name: 'Hair Trigger', d: '+9% attack power and 22% attack speed.', cost: 550, tier: 2, tags: ['attack', 'mobility'], upgradesFrom: 'whetstone', ad: .09, as: .22 },
    { id: 'headsman', name: 'Headsman', d: '+30% attack power. Targets under 35% health take 15% more.', cost: 800, tier: 3, tags: ['attack'], upgradesFrom: 'serrated', ad: .3, u: 'headsman' },
    { id: 'bloodfang', name: 'Bloodfang', d: '+20% attack power and 15% lifesteal.', cost: 800, tier: 3, tags: ['attack', 'sustain', 'bruiser'], upgradesFrom: 'serrated', ad: .2, lifesteal: .15 },
    { id: 'stormlash', name: 'Stormlash', d: '+15% attack power and 40% attack speed. Every third attack arcs to one more enemy.', cost: 850, tier: 3, tags: ['attack'], upgradesFrom: 'trigger', ad: .15, as: .4, u: 'storm' },
    { id: 'guillotine', name: 'Guillotine', d: '+44% attack power. Unique: targets under 35% health take 28% more.', cost: 1250, tier: 4, tags: ['attack'], upgradesFrom: 'headsman', ad: .44, u: 'guillotine', legendary: true },
    { id: 'gorefang', name: 'Sanguine Fang', d: '+32% attack power and 24% lifesteal.', cost: 1250, tier: 4, tags: ['attack', 'sustain', 'bruiser'], upgradesFrom: 'bloodfang', ad: .32, lifesteal: .24, legendary: true },
    { id: 'tempest', name: 'Tempest', d: '+26% attack power and 60% attack speed. Unique: every third attack arcs on; attacks mark targets.', cost: 1250, tier: 4, tags: ['attack'], upgradesFrom: 'stormlash', ad: .26, as: .6, u: ['storm', 'tempest'], legendary: true },
    // Marksman
    { id: 'sightglass', name: 'Sightglass', d: '+7% attack power and 8% attack speed.', cost: 350, tier: 1, tags: ['attack', 'marksman'], ad: .07, as: .08 },
    { id: 'hairscope', name: 'Hairline Scope', d: '+14% attack power and 15% attack speed.', cost: 550, tier: 2, tags: ['attack', 'marksman'], upgradesFrom: 'sightglass', ad: .14, as: .15 },
    { id: 'railpiece', name: 'Railpiece', d: '+24% attack power, 22% attack speed and 12% armour piercing.', cost: 850, tier: 3, tags: ['attack', 'marksman'], upgradesFrom: 'hairscope', ad: .24, as: .22, pen: .12 },
    { id: 'quickdraw', name: 'Quickdraw Rig', d: '+12% attack power, 34% attack speed and +18 move speed.', cost: 800, tier: 3, tags: ['attack', 'marksman', 'mobility'], upgradesFrom: 'hairscope', ad: .12, as: .34, ms: 18 },
    { id: 'deadshot', name: 'Deadshot', d: '+34% attack power, 28% attack speed, 18% armour piercing. Unique: basic attacks on healthy targets (over 70%) hit 22% harder.', cost: 1250, tier: 4, tags: ['attack', 'marksman'], upgradesFrom: 'railpiece', ad: .34, as: .28, pen: .18, u: 'deadshot', legendary: true },
    { id: 'gunrunner', name: 'Gunrunner', d: '+18% attack power, 48% attack speed, +30 move speed. Unique: basic attacks on champions grant a burst of speed.', cost: 1200, tier: 4, tags: ['attack', 'marksman', 'mobility'], upgradesFrom: 'quickdraw', ad: .18, as: .48, ms: 30, u: 'gunrunner', legendary: true },
    // Assassin
    { id: 'dirk', name: 'Thin Dirk', d: '+7% attack power and 8% armour piercing.', cost: 350, tier: 1, tags: ['attack', 'assassin'], ad: .07, pen: .08 },
    { id: 'stiletto', name: 'Stiletto', d: '+14% attack power and 15% armour piercing.', cost: 550, tier: 2, tags: ['attack', 'assassin'], upgradesFrom: 'dirk', ad: .14, pen: .15 },
    { id: 'nightedge', name: 'Night Edge', d: '+24% attack power, 22% armour piercing. Unique: your first hit on a champion after 6 quiet seconds deals 25% more.', cost: 850, tier: 3, tags: ['attack', 'assassin'], upgradesFrom: 'stiletto', ad: .24, pen: .22, u: 'ambush' },
    { id: 'bonesaw', name: 'Bonesaw', d: '+20% attack power, 15% armour piercing and 15% shorter cooldowns.', cost: 850, tier: 3, tags: ['attack', 'assassin', 'ability'], upgradesFrom: 'stiletto', ad: .2, pen: .15, cdr: .15 },
    { id: 'widowmaker', name: 'Widowmaker', d: '+34% attack power, 30% armour piercing. Unique: an opening hit deals 40% more, and a takedown bursts you with speed.', cost: 1250, tier: 4, tags: ['attack', 'assassin'], upgradesFrom: 'nightedge', ad: .34, pen: .3, u: ['ambush', 'widow'], legendary: true },
    { id: 'eclipse', name: 'Eclipse', d: '+30% attack power, 20% armour piercing, 22% shorter cooldowns. Unique: three hits on a champion within 2 seconds burn for 7% of their max health.', cost: 1250, tier: 4, tags: ['attack', 'assassin', 'ability'], upgradesFrom: 'bonesaw', ad: .3, pen: .2, cdr: .22, u: 'eclipse', legendary: true },
    // Bruiser
    { id: 'cudgel', name: 'Cudgel', d: '+6% attack power and +100 health.', cost: 350, tier: 1, tags: ['attack', 'bruiser'], ad: .06, hp: 100 },
    { id: 'warhammer', name: 'Warhammer', d: '+12% attack power, +220 health and 8 armour.', cost: 550, tier: 2, tags: ['attack', 'bruiser'], upgradesFrom: 'cudgel', ad: .12, hp: 220, armor: 8 },
    { id: 'ironmaul', name: 'Iron Maul', d: '+20% attack power, +380 health and 16 armour.', cost: 850, tier: 3, tags: ['attack', 'bruiser', 'tank'], upgradesFrom: 'warhammer', ad: .2, hp: 380, armor: 16 },
    { id: 'ragebrand', name: 'Ragebrand', d: '+22% attack power, +260 health, 10% lifesteal and 10% shorter cooldowns.', cost: 850, tier: 3, tags: ['attack', 'bruiser', 'sustain'], upgradesFrom: 'warhammer', ad: .22, hp: 260, lifesteal: .1, cdr: .1 },
    { id: 'kingsmaul', name: 'Kingsmaul', d: '+28% attack power, +620 health, 26 armour, 14 magic resist. Unique: basic attacks splash 25% around the target.', cost: 1250, tier: 4, tags: ['attack', 'bruiser', 'tank'], upgradesFrom: 'ironmaul', ad: .28, hp: 620, armor: 26, mr: 14, u: 'cleave', legendary: true },
    { id: 'warbringer', name: 'Warbringer', d: '+32% attack power, +400 health, 16% lifesteal, 15% shorter cooldowns. Unique: below 40% health you deal 18% more.', cost: 1250, tier: 4, tags: ['attack', 'bruiser', 'sustain'], upgradesFrom: 'ragebrand', ad: .32, hp: 400, lifesteal: .16, cdr: .15, u: 'warbringer', legendary: true },
    // Magic
    { id: 'lens', name: 'Focus Lens', d: '+6% ability power and 8% shorter cooldowns.', cost: 400, tier: 1, tags: ['magic', 'ability'], ap: .06, cdr: .08 },
    { id: 'capacitor', name: 'Capacitor', d: '16% shorter cooldowns and +14% ability power.', cost: 550, tier: 2, tags: ['magic', 'ability'], upgradesFrom: 'lens', cdr: .16, ap: .14 },
    { id: 'overclock', name: 'Overclock', d: '28% shorter cooldowns and +26% ability power.', cost: 850, tier: 3, tags: ['magic', 'ability'], upgradesFrom: 'capacitor', cdr: .28, ap: .26 },
    { id: 'singularity', name: 'Singularity', d: '38% shorter cooldowns and +38% ability power.', cost: 1250, tier: 4, tags: ['magic', 'ability'], upgradesFrom: 'overclock', cdr: .38, ap: .38, legendary: true },
    { id: 'ember', name: 'Ember Shard', d: '+11% ability power.', cost: 350, tier: 1, tags: ['magic'], ap: .11 },
    { id: 'focuscrystal', name: 'Focus Crystal', d: '+22% ability power.', cost: 550, tier: 2, tags: ['magic'], upgradesFrom: 'ember', ap: .22 },
    { id: 'stormglass', name: 'Stormglass', d: '+36% ability power and 20% magic piercing.', cost: 850, tier: 3, tags: ['magic'], upgradesFrom: 'focuscrystal', ap: .36, mpen: .2 },
    { id: 'ashwand', name: 'Ash Wand', d: '+32% ability power and 12% ability lifesteal.', cost: 850, tier: 3, tags: ['magic', 'sustain'], upgradesFrom: 'focuscrystal', ap: .32, vamp: .12 },
    { id: 'voidheart', name: 'Voidheart', d: '+52% ability power and 32% magic piercing. Unique: abilities hit targets over 60% health 12% harder.', cost: 1250, tier: 4, tags: ['magic'], upgradesFrom: 'stormglass', ap: .52, mpen: .32, u: 'voidheart', legendary: true },
    { id: 'worldburn', name: 'Worldburn', d: '+46% ability power and 18% ability lifesteal. Unique: abilities that hit champions burn them for 3 seconds.', cost: 1250, tier: 4, tags: ['magic', 'sustain'], upgradesFrom: 'ashwand', ap: .46, vamp: .18, u: 'worldburn', legendary: true },
    { id: 'hexband', name: 'Hexed Band', d: '+14% ability power, +180 health.', cost: 550, tier: 2, tags: ['magic', 'bruiser'], upgradesFrom: 'ember', ap: .14, hp: 180 },
    { id: 'soulcage', name: 'Soul Cage', d: '+26% ability power, +340 health and 12 magic resist.', cost: 850, tier: 3, tags: ['magic', 'bruiser'], upgradesFrom: 'hexband', ap: .26, hp: 340, mr: 12 },
    { id: 'archlich', name: 'Archlich Crown', d: '+38% ability power, +560 health, 24 magic resist. Unique: once every 45 seconds a killing blow leaves you at 15% health instead.', cost: 1250, tier: 4, tags: ['magic', 'bruiser', 'tank'], upgradesFrom: 'soulcage', ap: .38, hp: 560, mr: 24, u: 'archlich', legendary: true },
    // Tank
    { id: 'vest', name: 'Padded Vest', d: '+150 health and 10 armour.', cost: 350, tier: 1, tags: ['tank'], hp: 150, armor: 10 },
    { id: 'plate', name: 'Riot Plate', d: '+300 health and 22 armour.', cost: 550, tier: 2, tags: ['tank'], upgradesFrom: 'vest', hp: 300, armor: 22 },
    { id: 'bastion', name: 'Bastion', d: '+550 health, 40 armour. Grants a shield when you fall below half health, once every 30 seconds.', cost: 850, tier: 3, tags: ['tank'], upgradesFrom: 'plate', hp: 550, armor: 40, u: 'bastion' },
    { id: 'spikeguard', name: 'Spikeguard', d: '+420 health, 50 armour. Melee attackers take 25% of the damage back.', cost: 800, tier: 3, tags: ['tank'], upgradesFrom: 'plate', hp: 420, armor: 50, u: 'thorns' },
    { id: 'citadel', name: 'Citadel', d: '+800 health, 60 armour, 20 magic resist. Unique: a bigger shield below half health, every 20 seconds.', cost: 1250, tier: 4, tags: ['tank'], upgradesFrom: 'bastion', hp: 800, armor: 60, mr: 20, u: ['bastion', 'citadel'], legendary: true },
    { id: 'thornwall', name: 'Thornwall', d: '+620 health, 72 armour, 16 magic resist. Unique: melee attackers take 40% back.', cost: 1250, tier: 4, tags: ['tank'], upgradesFrom: 'spikeguard', hp: 620, armor: 72, mr: 16, u: ['thorns', 'thornwall'], legendary: true },
    { id: 'cloak', name: 'Warded Cloak', d: '+80 health and 14 magic resist.', cost: 350, tier: 1, tags: ['tank', 'resist'], hp: 80, mr: 14 },
    { id: 'nullweave', name: 'Nullweave', d: '+200 health and 28 magic resist.', cost: 550, tier: 2, tags: ['tank', 'resist'], upgradesFrom: 'cloak', hp: 200, mr: 28 },
    { id: 'wardmail', name: 'Wardmail', d: '+420 health and 48 magic resist.', cost: 850, tier: 3, tags: ['tank', 'resist'], upgradesFrom: 'nullweave', hp: 420, mr: 48 },
    { id: 'spellbreaker', name: 'Spellbreaker', d: '+300 health, 36 magic resist, +22 move speed.', cost: 800, tier: 3, tags: ['tank', 'resist', 'mobility'], upgradesFrom: 'nullweave', hp: 300, mr: 36, ms: 22 },
    { id: 'aegisprime', name: 'Prime Aegis', d: '+700 health, 76 magic resist, 18 armour. Unique: the first ability that hits you every 20 seconds is halved.', cost: 1250, tier: 4, tags: ['tank', 'resist'], upgradesFrom: 'wardmail', hp: 700, mr: 76, armor: 18, u: 'aegisprime', legendary: true },
    { id: 'girdle', name: 'Iron Girdle', d: '+220 health.', cost: 350, tier: 1, tags: ['tank'], hp: 220 },
    { id: 'titanbelt', name: 'Titan Belt', d: '+460 health and a little regeneration.', cost: 550, tier: 2, tags: ['tank'], upgradesFrom: 'girdle', hp: 460, regen: .003 },
    { id: 'titanheart', name: 'Titan Heart', d: '+800 health, 16 armour, 16 magic resist, more regeneration.', cost: 850, tier: 3, tags: ['tank'], upgradesFrom: 'titanbelt', hp: 800, armor: 16, mr: 16, regen: .006 },
    { id: 'worldtree', name: 'Worldtree', d: '+1250 health, 30 armour, 30 magic resist. Unique: out of combat for 5 seconds you heal 4% a second.', cost: 1250, tier: 4, tags: ['tank'], upgradesFrom: 'titanheart', hp: 1250, armor: 30, mr: 30, regen: .008, u: 'worldtree', legendary: true },
    // Support
    { id: 'satchel', name: 'Field Satchel', d: '+15% healing and shields. Small health regeneration.', cost: 350, tier: 1, tags: ['support'], healPow: .15, regen: .002, hp: 40 },
    { id: 'medkit', name: 'Medkit', d: '+30% healing and shields, and more regeneration.', cost: 500, tier: 2, tags: ['support'], upgradesFrom: 'satchel', healPow: .3, regen: .004, hp: 100 },
    { id: 'sanctum', name: 'Sanctum', d: '+55% healing and shields, regeneration, and allies near you take 8% less damage.', cost: 800, tier: 3, tags: ['support'], upgradesFrom: 'medkit', healPow: .55, regen: .006, hp: 220, u: 'sanctum' },
    { id: 'sanctuary', name: 'Sanctuary', d: '+85% healing and shields, more regeneration. Unique: allies near you take 15% less damage.', cost: 1200, tier: 4, tags: ['support'], upgradesFrom: 'sanctum', healPow: .85, regen: .009, hp: 360, u: ['sanctum', 'sanctuary'], legendary: true },
    { id: 'censer', name: 'Censer', d: '+24% healing and shields, +8% ability power.', cost: 500, tier: 2, tags: ['support', 'magic'], upgradesFrom: 'satchel', healPow: .24, ap: .08, hp: 60 },
    { id: 'lifewarden', name: 'Lifewarden', d: '+42% healing and shields, +16% ability power, 12% shorter cooldowns.', cost: 800, tier: 3, tags: ['support', 'magic', 'ability'], upgradesFrom: 'censer', healPow: .42, ap: .16, cdr: .12, hp: 140 },
    { id: 'saintsbell', name: "Saint's Bell", d: '+66% healing and shields, +26% ability power, 20% shorter cooldowns. Unique: your heals also grant 8% damage for 3 seconds.', cost: 1200, tier: 4, tags: ['support', 'magic', 'ability'], upgradesFrom: 'lifewarden', healPow: .66, ap: .26, cdr: .2, hp: 240, u: 'saintsbell', legendary: true },
    { id: 'banner', name: 'Field Banner', d: '+100 health, +8 move speed.', cost: 350, tier: 1, tags: ['support', 'mobility'], hp: 100, ms: 8 },
    { id: 'warbanner', name: 'War Banner', d: '+240 health, +14 move speed, 10 armour, 10 magic resist.', cost: 550, tier: 2, tags: ['support', 'tank'], upgradesFrom: 'banner', hp: 240, ms: 14, armor: 10, mr: 10 },
    { id: 'rallystandard', name: 'Rally Standard', d: '+400 health, 18 armour, 18 magic resist. Unique: allies near you deal 6% more.', cost: 850, tier: 3, tags: ['support', 'tank'], upgradesFrom: 'warbanner', hp: 400, armor: 18, mr: 18, u: 'rally' },
    { id: 'highbanner', name: 'High Banner', d: '+620 health, 30 armour, 30 magic resist. Unique: allies near you deal 12% more.', cost: 1200, tier: 4, tags: ['support', 'tank'], upgradesFrom: 'rallystandard', hp: 620, armor: 30, mr: 30, u: ['rally', 'highbanner'], legendary: true },
    // Mobility
    { id: 'boots', name: 'Quick Boots', d: '+20 move speed.', cost: 300, tier: 1, tags: ['mobility'], ms: 20 },
    { id: 'spurs', name: 'Chase Spurs', d: '+34 move speed.', cost: 450, tier: 2, tags: ['mobility'], upgradesFrom: 'boots', ms: 34 },
    { id: 'phase', name: 'Phase Treads', d: '+48 move speed and 8% shorter cooldowns. Speed burst after any ability.', cost: 750, tier: 3, tags: ['mobility', 'ability'], upgradesFrom: 'spurs', ms: 48, cdr: .08, u: 'phase' },
    { id: 'ghoststep', name: 'Ghoststep', d: '+64 move speed, 12% shorter cooldowns. Unique: a bigger burst after any ability.', cost: 1200, tier: 4, tags: ['mobility', 'ability'], upgradesFrom: 'phase', ms: 64, cdr: .12, u: ['phase', 'ghoststep'], legendary: true },
    { id: 'stridegreaves', name: 'Stride Greaves', d: '+44 move speed, 14 armour and 14 magic resist.', cost: 750, tier: 3, tags: ['mobility', 'tank'], upgradesFrom: 'spurs', ms: 44, armor: 14, mr: 14 },
    { id: 'stormgreaves', name: 'Storm Greaves', d: '+60 move speed, 24 armour and 24 magic resist. Unique: being stunned or rooted grants a burst of speed when it ends.', cost: 1200, tier: 4, tags: ['mobility', 'tank'], upgradesFrom: 'stridegreaves', ms: 60, armor: 24, mr: 24, u: 'stormgreaves', legendary: true },
    // Jungle
    { id: 'machete', name: 'Machete', d: '+25% damage to monsters, +5% attack power.', cost: 350, tier: 1, tags: ['jungle', 'attack'], mon: .25, ad: .05 },
    { id: 'trailblade', name: 'Trail Blade', d: '+40% damage to monsters, +12% attack power. Monster kills heal you.', cost: 550, tier: 2, tags: ['jungle', 'attack'], upgradesFrom: 'machete', mon: .4, ad: .12, u: 'forager' },
    { id: 'apexfang', name: 'Apex Fang', d: '+55% damage to monsters, +24% attack power, 8% lifesteal. Monster kills heal you.', cost: 850, tier: 3, tags: ['jungle', 'attack', 'sustain'], upgradesFrom: 'trailblade', mon: .55, ad: .24, lifesteal: .08, u: 'forager' },
    { id: 'sovereign', name: 'Jungle Sovereign', d: '+70% damage to monsters, +34% attack power, 12% lifesteal. Unique: +25% damage to bosses.', cost: 1250, tier: 4, tags: ['jungle', 'attack', 'sustain'], upgradesFrom: 'apexfang', mon: .7, ad: .34, lifesteal: .12, u: ['forager', 'sovereign'], legendary: true },
    { id: 'spiritmoss', name: 'Spirit Moss', d: '+25% damage to monsters, +7% ability power.', cost: 350, tier: 1, tags: ['jungle', 'magic'], mon: .25, ap: .07 },
    { id: 'wildbloom', name: 'Wild Bloom', d: '+42% damage to monsters, +18% ability power. Monster kills heal you.', cost: 550, tier: 2, tags: ['jungle', 'magic'], upgradesFrom: 'spiritmoss', mon: .42, ap: .18, u: 'forager' },
    { id: 'stormroot', name: 'Stormroot', d: '+58% damage to monsters, +32% ability power, +20 move speed. Monster kills heal you.', cost: 850, tier: 3, tags: ['jungle', 'magic', 'mobility'], upgradesFrom: 'wildbloom', mon: .58, ap: .32, ms: 20, u: 'forager' },
    { id: 'skyrender', name: 'Skyrender', d: '+72% damage to monsters, +46% ability power, +34 move speed. Unique: +25% damage to bosses.', cost: 1250, tier: 4, tags: ['jungle', 'magic', 'mobility'], upgradesFrom: 'stormroot', mon: .72, ap: .46, ms: 34, u: ['forager', 'sovereign'], legendary: true },
    // Consumables: bought and used in one tap, no slot.
    { id: 'potion', name: 'Health Potion', d: 'Restores 40% of max health over 8 seconds.', cost: 110, tier: 1, tags: ['consumable'], consumable: true },
    { id: 'cleanse', name: 'Cleanse', d: 'Clears stuns, roots, slows, poison and curses at once. 25 second cooldown.', cost: 170, tier: 1, tags: ['consumable'], consumable: true },
    { id: 'tonic', name: 'Speed Tonic', d: '+20% move speed for 8 seconds.', cost: 120, tier: 1, tags: ['consumable'], consumable: true },
    { id: 'elixir', name: 'War Elixir', d: '+15% damage for 90 seconds.', cost: 280, tier: 1, tags: ['consumable'], consumable: true },
  ];
  // ---------- nemesis: one per champion, mutual, hero against villain ----------
  const NEMESIS_PAIRS = [['vesper', 'deadbolt'], ['kade', 'duelist'], ['ione', 'hex'], ['solenne', 'plague'], ['sable', 'shiv'], ['gravel', 'ironjaw'], ['voltaic', 'ravager'], ['tidecaller', 'cinder'], ['paragon', 'cataclysm'], ['mirage', 'puppeteer']];
  const NEMESIS = {}; for (const [a, b] of NEMESIS_PAIRS) { NEMESIS[a] = b; NEMESIS[b] = a; }
  const nemesisOf = kit => NEMESIS[kit] || null;
  // The small hidden part: damage multiplier against your nemesis. Tuned from matchup sweeps so that a strong champion does not simply farm its rival.
  const NEMESIS_EDGE = { vesper: 1.04, deadbolt: 1.04, kade: 1.04, duelist: 1.04, ione: 1.04, hex: 1.04, solenne: 1.04, plague: 1.04, sable: 1, shiv: 1.08, gravel: 1.1, ironjaw: 1, voltaic: 1.04, ravager: 1.04, tidecaller: 1.04, cinder: 1.04, paragon: 1.04, cataclysm: 1.04, mirage: 1.04, puppeteer: 1.04 };
  // The real part: what each champion's skills do to their nemesis in particular. Runs when a skill lands on them, at most once per NEMESIS_GAP.
  const NEMESIS_GAP = 3;
  const alliesOf = (s, u, r) => s.champs.filter(a => a.team === u.team && a.alive && Math.hypot(a.x - u.x, a.y - u.y) < r);
  const NEMESIS_HIT = {
    vesper(s, c, t) { t.revealT = Math.max(t.revealT || 0, 2); for (const z of s.zones) if (z.kind === 'tripline' && z.owner === t && Math.hypot(z.x - t.x, z.y - t.y) < 520) z.t = 0; }, // a clean shot snaps his wires
    deadbolt(s, c, t) { if (t.rootT > 0) t.rootT += .45; slow(t, .2, 1); }, // the trap holds a sniper longer
    kade(s, c, t) { t.stealthT = 0; t.pstack = 0; }, // a straight lunge cuts through feints and angle stacks
    duelist(s, c, t) { t.parryT = 0; t.cd[1] = Math.max(t.cd[1], 3); }, // angles get under the guard
    ione(s, c, t) { c.cd[0] = Math.max(0, c.cd[0] - 1.5); if (t.markT > 0) for (const a of alliesOf(s, c, 420)) { a.curseN = 0; a.curseT = 0; } }, // breaking a mark on her burns curses off friends
    hex(s, c, t) { t.curseN = Math.min(5, (t.curseN || 0) + 1); t.curseT = Math.max(t.curseT || 0, 4); for (const a of alliesOf(s, c, 520)) a.markT = 0; }, // curses eat sigils
    solenne(s, c, t) { for (const a of alliesOf(s, c, 400)) { if (a.poisonBy === t) a.poisonT = 0; if (a.noHealT > 0) a.noHealT = 0; } }, // light burns the sickness out
    plague(s, c, t) { t.noHealT = Math.max(t.noHealT || 0, 1.2); if (t.shieldHp > 0) t.shieldHp *= .6; }, // and rot starves the healer
    sable(s, c, t) { t.revealT = Math.max(t.revealT || 0, 2.5); t.stealthT = 0; }, // one shadow knows another (she also sees him through Vanish up close, in canSee)
    shiv(s, c, t) { t.echo = null; t.recast[1] = 0; slow(t, .25, 1); }, // a shank cuts the echo loose
    gravel(s, c, t) { t.rage = (t.rage || 0) * .55; }, // nothing to get angry at
    ironjaw(s, c, t) { t.vulnT = Math.max(t.vulnT || 0, .8); c.rage = Math.min(100, (c.rage || 0) + 15); }, // the one thing that dents him
    voltaic(s, c, t) { if (t.frenzyT > 0) t.frenzyT = Math.max(0, t.frenzyT - 1.2); slow(t, .2, .8); }, // the shock breaks the frenzy
    ravager(s, c, t) { t.volt = 0; t.pready = 0; t.pstack = 0; }, // grounded: all that charge, gone
    tidecaller(s, c, t) { t.kindleN = 0; for (const a of alliesOf(s, c, 520)) { a.kindleN = 0; a.kindleT = 0; } for (const z of s.zones) if (z.owner === t && z.fx === 'scorch' && Math.hypot(z.x - c.x, z.y - c.y) < 620) z.t = 0; }, // water on the fire
    cinder(s, c, t) { t.noHealT = Math.max(t.noHealT || 0, 1); }, // steam: the wave cannot mend
    paragon(s, c, t) { t.drT = 0; for (const z of s.zones) if (z.owner === t && z.fx === 'entrench') z.t = 0; slow(t, .3, 1); }, // force from above uproots him
    cataclysm(s, c, t) { slow(t, .3, 1.5); t.cd[0] = Math.max(t.cd[0], 3); }, // and broken ground leaves nowhere to leap from
    mirage(s, c, t) { for (const z of s.zones) if (z.owner === t && z.kind === 'puppet' && Math.hypot(z.x - c.x, z.y - c.y) < 700) z.t = 0; for (const a of alliesOf(s, c, 420)) a.stringT = 0; }, // shatters the strings
    puppeteer(s, c, t) { t.stealthT = 0; t.revealT = Math.max(t.revealT || 0, 2); }, // a thread finds the real one
  };
  function nemesisContact(s, src, t, o) {
    const fresh = !(src.rivalAt > s.t); src.rivalAt = t.rivalAt = s.t + 20;
    if (fresh) { s.ev.push({ e: 'rival', u: src.id, v: t.id, x: Math.round((src.x + t.x) / 2), y: Math.round((src.y + t.y) / 2) }); maybeDuel(s, src, t); }
    if (!o.skill || src.nemAt > s.t) return;
    src.nemAt = s.t + NEMESIS_GAP; const fn = NEMESIS_HIT[src.champ]; if (fn) fn(s, src, t);
  }

  const ITEM_SLOTS = 5, CONSUMABLES = ['potion', 'cleanse', 'tonic', 'elixir'];
  const ITEM_BY = {}; ITEMS.forEach((it, i) => { ITEM_BY[it.id] = it; it.i = i; });
  const itemPath = id => { const out = []; for (let it = ITEM_BY[id]; it; it = ITEM_BY[it.upgradesFrom]) out.unshift(it.id); return out; };
  // The full cost of a step: from an owned ancestor if there is one, otherwise the whole chain.
  function itemPrice(c, id) {
    const it = ITEM_BY[id]; if (!it) return null;
    // One of each item: you can't own it twice, or buy a piece you've already built into something bigger.
    if (c.items.includes(id) || c.items.some(x => x && itemPath(x).includes(id))) return null;
    const path = itemPath(id); let own = -1, slot = -1;
    for (let i = path.length - 2; i >= 0 && slot < 0; i--) { const k = c.items.indexOf(path[i]); if (k >= 0) { own = i; slot = k; } }
    if (slot < 0 && !c.items.some(x => !x)) return null;
    let cost = 0; for (let i = own + 1; i < path.length; i++) cost += ITEM_BY[path[i]].cost;
    return Math.round(cost * (c.armoryK || 1));
  }
  // Final items a build wants, in buying order. Bots buy down each chain; the shop highlights them.
  const REC = {
    marksman: ['headsman', 'overclock', 'phase'], skirmisher: ['stormlash', 'phase', 'bloodfang'], spotter: ['headsman', 'phase', 'overclock'], executioner: ['headsman', 'bloodfang', 'phase'],
    parrymaster: ['bastion', 'bloodfang', 'phase'], blitz: ['phase', 'bloodfang', 'spikeguard'], vanguard: ['bastion', 'spikeguard', 'phase'], breaker: ['stormlash', 'bloodfang', 'phase'],
    constellation: ['overclock', 'phase', 'headsman'], meteor: ['overclock', 'headsman', 'phase'], comet: ['headsman', 'overclock', 'phase'], stellar: ['sanctum', 'overclock', 'phase'],
    lifebringer: ['sanctum', 'overclock', 'phase'], protector: ['sanctum', 'bastion', 'phase'], sunlance: ['overclock', 'headsman', 'phase'], radiant: ['sanctum', 'phase', 'overclock'],
    ghost: ['bloodfang', 'phase', 'headsman'], reaper: ['headsman', 'phase', 'bloodfang'], hunter: ['stormlash', 'phase', 'bloodfang'], twin: ['headsman', 'overclock', 'phase'],
    anchor: ['bastion', 'phase', 'spikeguard'], juggernaut: ['bastion', 'bloodfang', 'phase'], warden: ['bastion', 'sanctum', 'phase'], seismic: ['spikeguard', 'bastion', 'overclock'],
    trapper: ['overclock', 'headsman', 'phase'], deadeyed: ['headsman', 'overclock', 'phase'], gunslinger: ['stormlash', 'bloodfang', 'phase'], jailer: ['overclock', 'phase', 'bastion'],
    fencer: ['bloodfang', 'phase', 'bastion'], masquerade: ['headsman', 'phase', 'bloodfang'], honorbound: ['bloodfang', 'bastion', 'phase'], bladestorm: ['stormlash', 'bloodfang', 'phase'],
    cursebinder: ['overclock', 'headsman', 'phase'], transmuter: ['overclock', 'phase', 'sanctum'], ritualist: ['overclock', 'bastion', 'phase'], jinx: ['sanctum', 'overclock', 'phase'],
    apothecary: ['sanctum', 'overclock', 'phase'], pestilence: ['overclock', 'headsman', 'phase'], bloodletter: ['bloodfang', 'bastion', 'phase'], ward: ['overclock', 'bastion', 'phase'],
    cutthroat: ['headsman', 'phase', 'bloodfang'], nightblade: ['headsman', 'bloodfang', 'phase'], butcher: ['bloodfang', 'headsman', 'phase'], venomous: ['stormlash', 'bloodfang', 'phase'],
    brawler: ['bloodfang', 'bastion', 'phase'], wrecker: ['overclock', 'bastion', 'phase'], bouncer: ['bastion', 'phase', 'spikeguard'], fortress: ['bastion', 'spikeguard', 'sanctum'],
  };
  REC.stormchaser = ['apexfang', 'phase', 'ragebrand']; REC.surge = ['stormroot', 'phase', 'stormglass']; REC.conductor = ['stormroot', 'overclock', 'phase']; REC.thunderhead = ['stormglass', 'phase', 'soulcage'];
  REC.wellspring = ['sanctum', 'overclock', 'phase']; REC.undertow = ['lifewarden', 'overclock', 'phase']; REC.deluge = ['lifewarden', 'sanctum', 'phase']; REC.abyss = ['overclock', 'stridegreaves', 'sanctum'];
  REC.skyknight = ['ragebrand', 'phase', 'ironmaul']; REC.sunstriker = ['headsman', 'phase', 'ironmaul']; REC.titanwing = ['ragebrand', 'phase', 'bastion']; REC.aegisborn = ['ironmaul', 'wardmail', 'phase'];
  REC.twinshot = ['stormlash', 'railpiece', 'phase']; REC.shade = ['railpiece', 'phase', 'headsman']; REC.kaleidoscope = ['headsman', 'railpiece', 'phase']; REC.hollow = ['quickdraw', 'headsman', 'phase'];
  REC.pyre = ['stormglass', 'overclock', 'phase']; REC.ashwalker = ['ashwand', 'phase', 'overclock']; REC.wildfire = ['stormglass', 'ashwand', 'phase']; REC.firestorm = ['overclock', 'stormglass', 'phase'];
  REC.alpha = ['apexfang', 'phase', 'ragebrand']; REC.savage = ['ragebrand', 'ironmaul', 'phase']; REC.packleader = ['ragebrand', 'rallystandard', 'phase']; REC.hemorrhage = ['nightedge', 'bloodfang', 'phase'];
  REC.bastille = ['bastion', 'wardmail', 'phase']; REC.artillery = ['ironmaul', 'overclock', 'phase']; REC.wreckingcrew = ['ironmaul', 'stormlash', 'phase']; REC.moonquake = ['ironmaul', 'bastion', 'phase'];
  REC.marionettist = ['lifewarden', 'overclock', 'phase']; REC.troupe = ['overclock', 'lifewarden', 'phase']; REC.maestro = ['overclock', 'sanctum', 'phase']; REC.ventriloquist = ['sanctum', 'lifewarden', 'phase'];
  // Other genuine routes per archetype, on top of each build's signature route (path 0).
  const ARCH_PATHS = {
    marksman: [['Rapid', ['quickdraw', 'stormlash', 'railpiece', 'phase', 'bloodfang']], ['Heavy', ['railpiece', 'headsman', 'bloodfang', 'phase', 'spellbreaker']]],
    mage: [['Burst', ['stormglass', 'overclock', 'phase', 'ashwand', 'soulcage']], ['Battle', ['soulcage', 'ashwand', 'overclock', 'phase', 'wardmail']]],
    support: [['Devoted', ['sanctum', 'lifewarden', 'phase', 'rallystandard', 'wardmail']], ['Warmaster', ['rallystandard', 'lifewarden', 'stridegreaves', 'bastion', 'wardmail']]],
    assassin: [['Night', ['nightedge', 'phase', 'bonesaw', 'bloodfang', 'wardmail']], ['Ambush', ['bonesaw', 'nightedge', 'headsman', 'phase', 'spellbreaker']]],
    bruiser: [['Unkillable', ['ironmaul', 'ragebrand', 'stridegreaves', 'wardmail', 'bastion']], ['Reaver', ['ragebrand', 'bloodfang', 'phase', 'ironmaul', 'wardmail']]],
    tank: [['Wall', ['bastion', 'wardmail', 'titanheart', 'stridegreaves', 'spikeguard']], ['Crusher', ['ironmaul', 'wardmail', 'stridegreaves', 'bastion', 'titanheart']]],
  };
  const MAGIC_SWAP = { headsman: 'stormglass', bloodfang: 'ashwand', stormlash: 'soulcage', spikeguard: 'wardmail', ironmaul: 'soulcage', ragebrand: 'soulcage', nightedge: 'stormglass', bonesaw: 'overclock', apexfang: 'stormroot', railpiece: 'stormglass', quickdraw: 'ashwand' }, PHYS_SWAP = { overclock: 'bonesaw', stormglass: 'headsman', ashwand: 'bloodfang', soulcage: 'ironmaul', stormroot: 'apexfang' };
  // Filler for the last two slots per kit class, after the build's three core items.
  const REC_FILL = { back: ['bloodfang', 'wardmail'], front: ['wardmail', 'bastion'], flank: ['bloodfang', 'wardmail'], peel: ['wardmail', 'overclock'] };
  const LEGEND = { headsman: 'guillotine', bloodfang: 'gorefang', stormlash: 'tempest', bastion: 'citadel', spikeguard: 'thornwall', phase: 'ghoststep', overclock: 'singularity', sanctum: 'sanctuary', railpiece: 'deadshot', quickdraw: 'gunrunner', nightedge: 'widowmaker', bonesaw: 'eclipse', ironmaul: 'kingsmaul', ragebrand: 'warbringer', stormglass: 'voidheart', ashwand: 'worldburn', soulcage: 'archlich', wardmail: 'aegisprime', titanheart: 'worldtree', lifewarden: 'saintsbell', rallystandard: 'highbanner', stridegreaves: 'stormgreaves', apexfang: 'sovereign', stormroot: 'skyrender' };
  const swapFor = (k, id) => k.dtype === 'magic' ? (MAGIC_SWAP[id] || id) : (PHYS_SWAP[id] || id);
  // Every genuine item route for a build: [{name, items}]. Path 0 is the build's signature route.
  function itemPaths(champ, build) {
    const k = KITS[champ]; if (!k) return []; const b = build || k.builds[0].id, core = [...new Set((REC[b] || REC[k.builds[0].id]).map(i => swapFor(k, i)))];
    for (const f of [...REC_FILL[CLASS[champ] || 'front'], 'wardmail', 'bastion', 'phase', 'stridegreaves', k.dtype === 'magic' ? 'overclock' : 'bloodfang', 'titanheart']) { const g = swapFor(k, f); if (core.length < 5 && !core.includes(g)) core.push(g); }
    const out = [{ name: 'Signature', items: core }];
    for (const [name, items] of ARCH_PATHS[k.arch] || []) { const u = [...new Set(items.map(i => swapFor(k, i)))]; for (const f of ['wardmail', 'bastion', 'phase', 'stridegreaves', 'titanheart', 'lifewarden', k.dtype === 'magic' ? 'overclock' : 'bloodfang']) { const g = swapFor(k, f); if (u.length < 5 && !u.includes(g)) u.push(g); } out.push({ name, items: u }); }
    return out;
  }
  function recommended(champ, build, path) { const p = itemPaths(champ, build); return p.length ? (p[path || 0] || p[0]).items : []; }
  // Default build per kit and role, for bots and for a seat with none chosen.
  function defaultBuild(champ, role, roll) {
    const k = KITS[champ], ids = k.builds.map(x => x.id), avoid = BOT_BUILD_AVOID[champ] || {}, pool = ids.filter(b => !(avoid[b] || []).includes(role));
    return (pool.length ? pool : ids)[Math.floor((roll || 0) * (pool.length ? pool.length : ids.length)) % (pool.length || ids.length)];
  }
  // Build fits: which build does not suit a given role (bot defaults only; players are free).
  const BOT_BUILD_AVOID = {
    tidecaller: { undertow: ['bottom'] }, puppeteer: { ventriloquist: ['bottom'] }, voltaic: { stormchaser: ['top'] }, ravager: { alpha: ['top'] }, cataclysm: { bastille: [] },
    solenne: { sunlance: ['support'], lifebringer: ['bottom', 'top'], protector: ['bottom', 'top'], radiant: ['bottom', 'top'] },
    plague: { apothecary: ['top', 'bottom'], bloodletter: ['support', 'bottom'], ward: ['top'] },
    ione: { stellar: ['top', 'bottom'] }, hex: { jinx: ['top', 'bottom'] },
    kade: { vanguard: ['jungle'], breaker: ['jungle'] }, gravel: { warden: ['top', 'jungle'] }, ironjaw: { bouncer: ['jungle'] },
  };

  // Lane proficiencies: picked per seat before the match (seat.prof), independent of the champion.
  const PROFS = {
    top: [
      { id: 'challenger', name: 'Challenger', d: '+10% damage to champions while no ally is near you.' },
      { id: 'ironclad', name: 'Ironclad', d: 'Take 18% less damage under your own towers.' },
      { id: 'demolisher', name: 'Demolisher', d: 'Your attacks and abilities hit structures 35% harder.' },
    ],
    jungle: [
      { id: 'predator', name: 'Predator', d: '+25% damage to monsters and +15% to bosses.' },
      { id: 'killstrike', name: 'Kill Strike', d: 'A monster that falls under 10% health is finished instantly and heals you 8%. 10 seconds to recharge, 30 after a boss.' },
      { id: 'tracker', name: 'Tracker', d: '+12% move speed in the jungle and +25% gold from camps.' },
    ],
    bottom: [
      { id: 'harvester', name: 'Harvester', d: '+30% gold from minion last hits.' },
      { id: 'tempo', name: 'Tempo', d: 'Basic attacks on champions build attack speed: up to five stacks of 6% that fade after 3 seconds.' },
      { id: 'longsight', name: 'Long Sight', d: '+120 sight. Your first hit on a champion after 4 quiet seconds deals 25% more.' },
    ],
    support: [
      { id: 'guardian', name: 'Guardian', d: '+20% healing and shields.' },
      { id: 'pathfinder', name: 'Pathfinder', d: 'Capture districts 35% faster and ride the subway twice as often.' },
      { id: 'patron', name: 'Patron', d: 'Assists pay 40% more, and you earn passive gold 60% faster.' },
    ],
  };
  const PROF_IDS = {}; for (const r in PROFS) for (const p of PROFS[r]) PROF_IDS[p.id] = r;

  // Marks earned at the end of a match.
  // ---------- 11.0 career medals ----------
  // kind: 'sum' adds a match stat to the career, 'max' keeps the best single match, the rest are read from career tallies.
  const medal = (id, name, cat, kind, key, need, d, line) => ({ id, name, cat, kind, key, d, tiers: ['Bronze', 'Silver', 'Gold'].map((t, i) => ({ name: t, need: need[i], d: line(need[i].toLocaleString('en-US')) })) });
  const MEDAL_CATS = { multi: 'Multi-kills', deathless: 'Deathless', mastery: 'Champion mastery', rescue: 'Rescues', objective: 'Objectives', clutch: 'Clutch comebacks', role: 'Role mastery' };
  const MEDALS = [
    medal('hat_trick', 'Hat Trick', 'multi', 'sum', 'multi3', [10, 60, 240], 'Triple kills across your career.', n => `Land ${n} triple kills.`),
    medal('clean_sweep', 'Clean Sweep', 'multi', 'sum', 'multi4', [3, 20, 80], 'Quadruple kills across your career.', n => `Land ${n} quadruple kills.`),
    medal('rampage', 'Rampage', 'multi', 'sum', 'multi5', [1, 8, 30], 'Chains of five kills or more.', n => `Chain five kills or more, ${n} times.`),
    medal('body_count', 'Body Count', 'multi', 'max', 'kills', [15, 22, 30], 'Most kills in a single match.', n => `Take ${n} kills in one match.`),
    medal('untouchable', 'Untouchable', 'deathless', 'sum', 'deathless', [10, 60, 240], 'Wins without dying once, with at least 5 takedowns.', n => `Win ${n} matches without dying.`),
    medal('ghost_run', 'Ghost Run', 'deathless', 'max', 'deathlessTD', [12, 20, 30], 'Takedowns in a single deathless win.', n => `Score ${n} takedowns in one deathless win.`),
    medal('long_life', 'Long Life', 'deathless', 'max', 'bestStreak', [8, 13, 20], 'Longest kill streak in a single life.', n => `Reach a streak of ${n} kills without dying.`),
    medal('specialist', 'Specialist', 'mastery', 'champWins', '', [25, 100, 400], 'Wins on your single best champion.', n => `Win ${n} matches on one champion.`),
    medal('repertoire', 'Repertoire', 'mastery', 'champsAt', '', [4, 10, 20], 'Champions with at least 10 wins each.', n => `Reach 10 wins on ${n} different champions.`),
    medal('grand_master', 'Grand Master', 'mastery', 'sum', 'mastery', [30000, 200000, 800000], 'Mastery earned across every champion.', n => `Earn ${n} mastery.`),
    medal('shepherd', 'Shepherd', 'rescue', 'sum', 'rescues', [60, 400, 1600], 'Civilians brought to safety across your career.', n => `Rescue ${n} civilians.`),
    medal('safe_passage', 'Safe Passage', 'rescue', 'max', 'rescues', [6, 10, 15], 'Most civilian rescues in a single match.', n => `Make ${n} rescues in one match.`),
    medal('lifeline', 'Lifeline', 'rescue', 'sum', 'saves', [40, 250, 1000], 'Heals that pull an ally back from under a quarter health.', n => `Save allies from the brink ${n} times.`),
    medal('demolition', 'Demolition', 'objective', 'sum', 'towers', [80, 500, 2000], 'Towers felled with you at the scene.', n => `Be present for ${n} tower kills.`),
    medal('big_game', 'Big Game', 'objective', 'sum', 'objectives', [80, 500, 2000], 'Bosses slain and map events won.', n => `Secure ${n} objectives.`),
    medal('colossus_slayer', 'Colossus Slayer', 'objective', 'sum', 'colossi', [10, 60, 240], 'Colossus kills you took part in.', n => `Bring down the Colossus ${n} times.`),
    medal('grand_theft', 'Grand Theft', 'objective', 'sum', 'steals', [2, 15, 60], 'Last hits on a boss the other team had nearly finished.', n => `Steal ${n} bosses.`),
    medal('never_over', 'Never Over', 'clutch', 'sum', 'comebacks', [8, 50, 200], 'Wins after trailing by 3,000 gold or more.', n => `Win ${n} matches from far behind.`),
    medal('long_way_back', 'The Long Way Back', 'clutch', 'max', 'deficit', [5000, 9000, 14000], 'The largest deficit you have ever overturned.', n => `Win after trailing by ${n} gold.`),
    medal('last_breath', 'Last Breath', 'clutch', 'sum', 'clutch', [25, 150, 600], 'Kills made at 15% health or less.', n => `Land ${n} kills at 15% health or less.`),
    medal('warden', 'Warden of the High Road', 'role', 'role', 'top', [25, 120, 500], 'Wins in the top lane.', n => `Win ${n} matches as top.`),
    medal('stalker', 'Wild Stalker', 'role', 'role', 'jungle', [25, 120, 500], 'Wins in the jungle.', n => `Win ${n} matches as jungle.`),
    medal('keeper', 'Keeper of the Low Road', 'role', 'role', 'bottom', [25, 120, 500], 'Wins in the bottom lane.', n => `Win ${n} matches as bottom.`),
    medal('steadfast', 'Steadfast', 'role', 'role', 'support', [25, 120, 500], 'Wins as support.', n => `Win ${n} matches as support.`),
  ];
  const newCareer = () => ({ v: 1, games: 0, wins: 0, sum: {}, max: {}, champ: {}, role: {}, tiers: {} });
  // A career's current number for one medal, which is also what a progress bar shows.
  function medalValue(career, m) {
    if (!career) return 0;
    if (m.kind === 'sum') return (career.sum || {})[m.key] || 0;
    if (m.kind === 'max') return (career.max || {})[m.key] || 0;
    if (m.kind === 'role') return ((career.role || {})[m.key] || 0);
    const wins = Object.values(career.champ || {}).map(c => c.w || 0);
    return m.kind === 'champWins' ? wins.reduce((a, b) => Math.max(a, b), 0) : wins.filter(w => w >= 10).length;
  }
  const medalTier = (m, v) => m.tiers.reduce((n, t) => v >= t.need ? n + 1 : n, 0);
  // Folds one finished match (from Sim.matchStats) into the career. Returns the tiers this match earned.
  function medalProgress(career, st) {
    const C = Object.assign(newCareer(), career || {}), earned = [];
    for (const k of ['sum', 'max', 'champ', 'role', 'tiers']) if (career && !career[k]) C[k] = {};
    if (career) Object.assign(career, C);
    const out = career || C;
    if (!st || st.practice) return { career: out, earned };
    const full = st.full !== false, pvp = st.mode !== 'raid', td = (st.kills || 0) + (st.assists || 0);
    const clean = full && pvp && st.won && !st.deaths && td >= 5, back = full && pvp && st.won && (st.trailed || 0) >= 3000;
    const inc = (k, v) => { if (v) out.sum[k] = (out.sum[k] || 0) + v; }, top = (k, v) => { if (v > (out.max[k] || 0)) out.max[k] = v; };
    out.games++; if (st.won) out.wins++;
    for (const k of ['multi3', 'multi4', 'multi5', 'mastery', 'rescues', 'saves', 'towers', 'objectives', 'colossi', 'steals', 'clutch']) inc(k, st[k] || 0);
    inc('deathless', clean ? 1 : 0); inc('comebacks', back ? 1 : 0);
    if (full && pvp) { top('kills', st.kills || 0); top('bestStreak', st.bestStreak || 0); }
    top('rescues', st.rescues || 0); if (clean) top('deathlessTD', td); if (back) top('deficit', st.trailed);
    if (st.champ) { const c = out.champ[st.champ] || (out.champ[st.champ] = { g: 0, w: 0 }); c.g++; if (st.won) c.w++; }
    if (st.won && st.role && full && pvp && st.mode !== 'duel') out.role[st.role] = (out.role[st.role] || 0) + 1;
    for (const m of MEDALS) {
      const was = out.tiers[m.id] || 0, now = Math.max(was, medalTier(m, medalValue(out, m)));
      for (let i = was; i < now; i++) earned.push({ id: m.id, name: m.name, tier: i, tierName: m.tiers[i].name, need: m.tiers[i].need });
      if (now) out.tiers[m.id] = now;
    }
    return { career: out, earned };
  }
  const MARK_BONUS = { potg: 25, mvp: 30, svp: 15, medal: [40, 100, 300], nemesis: 25 };
  // You beat your nemesis by winning the match having killed them at least as often as they killed you, and at least once.
  const beatNemesis = (won, st) => !!won && (st.nemKills || 0) > 0 && (st.nemKills || 0) >= (st.nemDeaths || 0);
  // bonus = { potg, mvp, svp, medals: earned list from medalProgress }, all optional.
  function marksEarned(won, st, bonus) {
    st = st || {}; const b = bonus || {};
    const base = 30 + (won ? 45 : 0) + Math.min(30, (st.kills || 0) * 3 + (st.assists || 0) * 1.5) + Math.min(10, (st.skillHits || 0) * .1);
    return Math.round(base + (b.potg ? MARK_BONUS.potg : 0) + (b.mvp ? MARK_BONUS.mvp : 0) + (b.svp ? MARK_BONUS.svp : 0) + (beatNemesis(won, st) ? MARK_BONUS.nemesis : 0) + (b.medals || []).reduce((a, m) => a + (MARK_BONUS.medal[m.tier] || 0), 0));
  }
