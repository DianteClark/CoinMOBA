  // ---------- Flipside 5.0 content: 12 kits, passives, builds, evolves, items. Concatenated into the Sim closure at /*CONTENT*/.
  // Numbers live on the ability so builds and evolves can change them with plain data (see applyMods).
  const CHARS = {
    hero: {
      vesper: { name: 'Longshot', title: 'The watchful marksman' }, kade: { name: 'Captain Riposte', title: 'Master of the counter' },
      ione: { name: 'Starling', title: 'Caller of falling stars' }, solenne: { name: 'Dawnbringer', title: 'Healer of the first light' },
      sable: { name: 'Nightfall', title: 'Quiet hand of justice' }, gravel: { name: 'Bulwark', title: 'The wall that walks' },
    },
    villain: {
      deadbolt: { name: 'Deadbolt', title: 'Locks on and waits' }, duelist: { name: 'The Duelist', title: 'Never dropped a grudge' },
      hex: { name: 'Madame Hex', title: 'Curses by appointment' }, plague: { name: 'The Plague Doctor', title: 'Prescribes only trouble' },
      shiv: { name: 'Shiv', title: 'Gone before you look' }, ironjaw: { name: 'Ironjaw', title: 'Bites through bank vaults' },
    },
  };
  const ROSTER = [['vesper', 'kade', 'ione', 'solenne', 'sable', 'gravel'], ['deadbolt', 'duelist', 'hex', 'plague', 'shiv', 'ironjaw']];
  const charOf = (team, kit) => CHARS.hero[kit] || CHARS.villain[kit] || CHARS[team ? 'villain' : 'hero'][ROSTER[team ? 1 : 0][0]];
  // Every tower must out-range every basic attack by 80, so nothing can plink a tower from outside its reach.
  const TOWER_RANGE = 550, CORE_RANGE = 590, MAX_ATTACK_RANGE = TOWER_RANGE - 80;

  // ---------- shared status helpers ----------
  const shield = (s, t, amt, dur) => { t.shieldHp = Math.max(t.shieldHp > 0 && t.shieldT > 0 ? t.shieldHp : 0, 0) + amt; t.shieldT = Math.max(t.shieldT || 0, dur); s.ev.push({ e: 'shield', u: t.id, a: Math.round(amt) }); };
  const haste = (t, a, d) => { t.hasteA = Math.max(t.hasteT > 0 ? t.hasteA : 0, a); t.hasteT = Math.max(t.hasteT || 0, d); };
  const root = (s, t, d) => { if (t.kind === 'tower' || t.boss) return; t.rootT = Math.max(t.rootT || 0, d); if (t.dash && !t.dash.unstop && !t.dash.forced) t.dash = null; if (t.charge) t.charge = null; s.ev.push({ e: 'root', u: t.id }); };
  const knock = (s, t, d) => { if (t.kind === 'tower' || t.boss) return; stun(s, t, d); t.knockT = t.knockMax = Math.max(t.knockT || 0, d); s.ev.push({ e: 'knock', u: t.id }); };
  const poly = (s, t, d) => { if (t.kind === 'tower' || t.boss) return; stun(s, t, d); t.polyT = Math.max(t.polyT || 0, d); s.ev.push({ e: 'poly', u: t.id }); };
  const poison = (s, c, t, dps, d) => { if (t.kind === 'tower') return; t.poisonT = Math.max(t.poisonT || 0, d); t.poisonDps = Math.max(t.poisonT > 0 ? t.poisonDps || 0 : 0, dps); t.poisonBy = c; };
  const bleed = (s, c, t, dps, d) => { if (t.kind === 'tower') return; t.bleedDps = t.bleedT > 0 ? Math.max(t.bleedDps, dps) : dps; t.bleedT = Math.max(t.bleedT || 0, d); t.bleedBy = c; };
  const hpow = c => pow(c) * (1 + c.st.healPow);
  const curseCap = c => c.f && c.f.cursebinder ? 5 : 3;
  const curse = (s, c, t, n) => { t.curseN = Math.min(curseCap(c), (t.curseT > 0 ? t.curseN || 0 : 0) + n); t.curseT = c.f.cursebinder ? 9 : 6; t.curseBy = c; s.ev.push({ e: 'curse', u: t.id, n: t.curseN }); };
  const stealth = (s, c, d) => { c.stealthT = Math.max(c.stealthT || 0, d); c.revealT = 0; s.ev.push({ e: 'stealth', u: c.id, on: true }); };
  const breakStealth = (s, c) => { if (c.stealthT > 0) { c.stealthT = 0; if (c.champ === 'shiv') c.opener = 1.2; s.ev.push({ e: 'stealth', u: c.id, on: false }); } };
  // Line and timed zones. kind names are the art contract: tripline lockdown coven miasma quarantine ring tether orbit fissure decoy.
  function field(s, c, kind, o) { const z = Object.assign({ id: s.nid++, kind, team: c.team, owner: c, t: o.dur, total: o.dur, counted: false, fx: kind }, o); s.zones.push(z); return z; }
  function lineZone(o, x1, y1, x2, y2) { o.x1 = x1; o.y1 = y1; o.x2 = x2; o.y2 = y2; o.x = (x1 + x2) / 2; o.y = (y1 + y2) / 2; o.line = true; return o; }
  // Enemies inside a circle, each passed once; never through a wall when `los` is set.
  const enemiesIn = (s, c, x, y, r, los) => { const out = []; eachEnemy(s, c, x, y, r, t => { if (!los || hasLOS(x, y, t.x, t.y)) out.push(t); }); return out; };
  const alliesIn = (s, team, x, y, r) => s.champs.filter(a => a.alive && a.team === team && Math.hypot(a.x - x, a.y - y) < r);
  const lowestAlly = (s, c, r, incl) => { let b = null, f = 2; for (const a of alliesIn(s, c.team, c.x, c.y, r)) { if (!incl && a === c) continue; const v = a.hp / a.maxHp; if (v < f) { f = v; b = a; } } return b; };
  const cone = (s, c, a, reach, dot, fn) => { let n = 0; eachEnemy(s, c, c.x, c.y, reach, t => { const v = norm(t.x - c.x, t.y - c.y); if (v.x * a.dx + v.y * a.dy >= dot && hasLOS(c.x, c.y, t.x, t.y)) { fn(t); n += t.kind === 'champ' ? 1 : 0; } }); return n; };
  // Faces the nearest visible enemy champion in reach, for tap-to-fire abilities on a phone.
  const autoFace = (s, c, reach) => { const t = nearChamp(s, c, c.x, c.y, reach); if (t && hasLOS(c.x, c.y, t.x, t.y)) { const n = norm(t.x - c.x, t.y - c.y); c.fx = n.x; c.fy = n.y; return { dx: n.x, dy: n.y, t }; } return { dx: c.fx || 1, dy: c.fy || 0, t: null }; };

  const KITS = {
    // ---------- Heroes ----------
    vesper: {
      name: 'Vesper', role: 'Marksman', blurb: 'Charge your shot while they try to read it.',
      sight: 950, hp: 540, hpG: 72, dmg: 60, dmgG: 7, armor: 16, armG: 3, range: 470, as: 1.0, ms: 305, pref: 430, fit: { top: 1, jungle: 0, bottom: 3, support: 0 },
      passive: { name: 'Steady Hand', d: 'Stand still for a moment and your next basic attack hits 30% harder.' },
      builds: [
        { id: 'marksman', name: 'Marksman', tag: 'Long range', d: 'Long Shot reaches farther and full charges hit far harder, but Smoke Step comes back slowly.', mods: { 0: { range_add: 180, dmgF_add: 60, d: 'Hold to charge. Reaches very far; a full charge pierces and hits hard.' }, 1: { cd_add: 3 } } },
        { id: 'skirmisher', name: 'Skirmisher', tag: 'Kiting', d: 'Hit a champion with your empowered attack to refund most of Smoke Step. Long Shot charges fast but stays short.', stats: { as: 1.12 }, mods: { 0: { charge: .55, range_add: -180, dmgF_add: -50, d: 'Quick charge, shorter reach.' }, 1: { cd_add: -2, d: 'Dash. Your next attack hits harder; landing it on a champion refunds most of the cooldown.' } } },
        { id: 'spotter', name: 'Spotter', tag: 'Vision', d: 'Long Shot reveals who it hits for your whole team. Deadeye scans every enemy champion when fired.', mods: { 0: { d: 'Hold to charge. Hits reveal the target to your team.' }, 2: { cd_add: -8, dmg_add: -60, d: 'The longest shot in the game. Firing reveals all enemy champions for 2 seconds.' } } },
        { id: 'executioner', name: 'Executioner', tag: 'Finisher', d: 'Deadeye comes up far more often and finishes low targets. Long Shot hits hurt targets harder.', mods: { 0: { d: 'Hold to charge. Targets under half health take more.' }, 2: { cd: 32, dmg_add: -70, d: 'Deadeye adds 45% of the target\'s missing health. A kill refunds most of the cooldown.' } } },
      ],
      evolves: [
        [{ id: 'swiftdraw', name: 'Swift Draw', d: 'Long Shot charges 25% faster.', mods: { 0: { charge_mul: .75 } } }, { id: 'smokescreen', name: 'Smokescreen', d: 'Smoke Step leaves a cloud that slows enemies by 35%.' }],
        [{ id: 'overpen', name: 'Overpenetration', d: 'Deadeye passes through champions, losing a quarter of its power each time.' }, { id: 'stillness', name: 'Absolute Stillness', d: 'Steady Hand arms twice as fast and also crits.' }],
      ],
      kit: [
        { name: 'Long Shot', d: 'Hold to charge. A full charge pierces.', fx: 'snipe', cd: 6, range: 800, minRange: 500, shape: 'line', w: 34, charge: 1.1, dmg: 70, dmgF: 120,
          cast(s, c, a, A) {
            const f = c.charge ? clamp(c.charge.t / A.charge, 0, 1) : 0; c.charge = null;
            fire(s, c, a, { speed: 1600, range: A.minRange + (A.range - A.minRange) * f, w: 28 + 8 * f, fx: f >= 1 ? 'snipeFull' : 'snipe', pierce: f >= 1, filter: 'units',
              hit(s, c, t, p) { hurt(s, c, t, (A.dmg + A.dmgF * f) * pow(c) * (c.f.executioner && t.hp < t.maxHp * .5 ? 1.3 : 1), { skill: 1 }); if (t.kind === 'champ') { skillHit(c, p); if (c.f.spotter) t.revealT = Math.max(t.revealT || 0, 4); } } });
          },
        },
        { name: 'Smoke Step', d: 'Dash. Your next basic attack hits harder.', fx: 'dash', cd: 9, range: 270, shape: 'dash', w: 60, pd: [270, 1200],
          cast(s, c, a, A) { dashDir(c, a.dx, a.dy, 270, 1200); c.empowerT = 3; if (c.f.smokescreen) field(s, c, 'miasma', { x: c.x, y: c.y, r: 130, dur: 2.4, fx: 'smoke', step(s, z) { if (s.tick % 6 === 0) for (const t of enemiesIn(s, c, z.x, z.y, z.r)) slow(t, .35, .4); } }); if (c.f.skirmisher) c.stillT = 2; },
        },
        { name: 'Deadeye', d: 'The longest shot in the game. Everyone sees it coming.', fx: 'deadeye', cd: 50, range: 1050, shape: 'line', w: 50, windup: true, dmg: 260,
          cast(s, c, a, A) {
            if (c.f.spotter) for (const e of s.champs) if (e.alive && e.team !== c.team) e.revealT = Math.max(e.revealT || 0, 2);
            c.chan = { t: .7, total: .7, kind: 'line', slot: 2, dx: a.dx, dy: a.dy, len: rayWall(c.x, c.y, a.dx, a.dy, 1050), w: 50, fn(s, c) {
              s.ev.push({ e: 'fire', u: c.id, fx: 'deadeye', dx: a.dx, dy: a.dy });
              let pw = 1;
              fire(s, c, a, { speed: 2600, range: 1050, w: 50, fx: 'deadeye', filter: 'champ', pierce: !!c.f.overpen, hit(s, c, t, p) {
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
      sight: 720, hp: 640, hpG: 95, dmg: 64, dmgG: 8, armor: 28, armG: 4, range: 165, as: .95, ms: 325, pref: 125, melee: true, fit: { top: 3, jungle: 2, bottom: 0, support: 0 },
      passive: { name: 'Riposte', d: 'After a successful Parry, or Lunging into a champion, your next attack hits 60% harder and slows.' },
      builds: [
        { id: 'parrymaster', name: 'Parrymaster', tag: 'Counter', d: 'Parry comes up fast, holds longer and stuns longer. Lunge comes back slower.', mods: { 1: { cd: 7, parry: .7, stunT: 1.25, d: 'Near-constant block. Catching a hit stuns the attacker longer.' }, 0: { cd_add: 2 } } },
        { id: 'blitz', name: 'Blitz', tag: 'Engage', d: 'Lunge reaches farther and refunds on champions. Crash leaps far more often, but Parry is a sliver of a window.', mods: { 0: { range: 340, pd: [340, 1200], pdr: [300, 1200], d: 'Long dash. Hit a champion and you can dash again.' }, 2: { cd: 30, range: 620 }, 1: { parry: .32 } } },
        { id: 'vanguard', name: 'Vanguard', tag: 'Frontline', d: 'Parries shield nearby allies. Crash shields everyone you land beside. Sturdy, lighter hits.', stats: { hp: 1.1, dmg: .9 }, mods: { 1: { d: 'Half a second of perfect block. A catch also shields nearby allies.' }, 2: { d: 'Leap, untouchable, and land with a stun. Shields nearby allies.' } } },
        { id: 'breaker', name: 'Breaker', tag: 'Split push', d: 'Basic attacks and Lunge shred towers. Lunge chews through waves. Weak in long team fights.', stats: { dmg: 1.05, hp: .95 }, mods: { 0: { dmg_add: 18, d: 'Dash through a line. Strong against minions and towers.' } } },
      ],
      evolves: [
        [{ id: 'longlunge', name: 'Long Lunge', d: 'Lunge reaches 60 farther.', mods: { 0: { range_add: 60 } } }, { id: 'reflex', name: 'Quick Reflexes', d: 'Parry cooldown is 2 seconds shorter.', mods: { 1: { cd_add: -2 } } }],
        [{ id: 'aftershock', name: 'Aftershock', d: 'Crash leaves shaking ground that slows for 2.5 seconds.' }, { id: 'heroicfall', name: 'Heroic Fall', d: 'Crash cooldown 10 shorter, and landing heals you for 15%.', mods: { 2: { cd_add: -10 } } }],
      ],
      kit: [
        { name: 'Lunge', d: 'Dash through a line. Hit a champion and you can dash again.', fx: 'dash', cd: 7, range: 290, shape: 'dash', w: 80, pd: [290, 1100], pdr: [260, 1100], dmg: 74,
          cast(s, c, a, A) { const car = {}; dashDir(c, a.dx, a.dy, A.range, 1100, { onHit(s, c, t) { hurt(s, c, t, A.dmg * pow(c) * (c.f.breaker && t.kind !== 'champ' ? 1.6 : 1), { skill: 1 }); if (t.kind === 'champ') { skillHit(c, car); c.recast[0] = 2.5; c.ripT = 3.5; if (c.f.blitz) c.cd[0] *= .6; } } }); },
          recast(s, c, a, A) { dashDir(c, a.dx, a.dy, Math.min(A.range, 260), 1100, { onHit(s, c, t) { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); } }); },
        },
        { name: 'Parry', d: 'Half a second of perfect block. Catch a hit to stun the attacker.', fx: 'parry', cd: 11, range: 0, shape: 'self', instant: true, noCdr: true, parry: .5, stunT: .9,
          cast(s, c, a, A) { c.parryT = A.parry; c.parryStun = A.stunT; },
        },
        { name: 'Crash', d: 'Leap, untouchable, and land with a stun at the centre.', fx: 'crash', cd: 45, range: 520, shape: 'circle', r: 190, over: true, dmg: 185,
          cast(s, c, a, A) {
            c.air = .45; c.leap = { sx: c.x, sy: c.y, tx: a.tx, ty: a.ty, t: 0, total: .45, fn(s, c) {
              s.ev.push({ e: 'boom', x: c.x, y: c.y, r: 190, fx: 'crash' });
              let hit = false;
              eachEnemy(s, c, c.x, c.y, 190, t => { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.kind === 'champ') { hit = true; if (Math.hypot(t.x - c.x, t.y - c.y) < 110 + t.r) stun(s, t, 1); else slow(t, .4, 1.5); } });
              if (hit) c.stats.skillHits++;
              if (c.f.heroicfall) heal(s, c, c, c.maxHp * .15);
              if (c.f.vanguard) for (const al of alliesIn(s, c.team, c.x, c.y, 300)) shield(s, al, 120 * hpow(c), 4);
              if (c.f.aftershock) field(s, c, 'miasma', { x: c.x, y: c.y, r: 190, dur: 2.5, fx: 'crash', step(s, z) { if (s.tick % 6 === 0) for (const t of enemiesIn(s, c, z.x, z.y, z.r)) slow(t, .35, .4); } });
            } };
          },
        },
      ],
      onBasic(s, c, t, o) { if (c.ripT > 0) { c.ripT = 0; o.dmg *= 1.6; o.crit = true; slow(t, .3, 1.2); } if (c.f.breaker && t.kind === 'tower') o.dmg *= 1.35; },
      tick(s, c) { c.pready = c.ripT > 0 ? 1 : 0; },
    },
    ione: {
      name: 'Ione', role: 'Mage', blurb: 'Mark them, then break the mark.',
      sight: 850, hp: 500, hpG: 68, dmg: 50, dmgG: 5, armor: 14, armG: 3, range: 420, as: .85, ms: 300, pref: 390, fit: { top: 1, jungle: 0, bottom: 2, support: 2 },
      passive: { name: 'Stardust', d: 'Breaking a mark refunds 2 seconds of Sigil Orb and restores a little health.' },
      builds: [
        { id: 'constellation', name: 'Constellation', tag: 'Burst', d: 'Marks linger, Sigil Orb is quick, and Rupture hits marked targets far harder and unmarked ones barely.', mods: { 0: { cd: 3.2, markT: 7 }, 1: { dmg_add: -40, dmgM_add: 75, d: 'Ground blast. Barely hurts unmarked targets; marked targets take massive damage and a stun.' } } },
        { id: 'meteor', name: 'Meteor', tag: 'Zone', d: 'Rupture falls slow and huge. Hit where they must stand.', mods: { 1: { cd_add: 2, r: 165, delay: .9, dmg_add: 75, dmgM_add: 75, d: 'A slow, wide ground blast.' }, 2: { d: 'Three slow meteors walk forward. Each one marks.', delay_add: .35, dmg_add: 40 } } },
        { id: 'comet', name: 'Comet', tag: 'Poke', d: 'Sigil Orb flies far and fast through minions. Rupture is a small quick snap.', mods: { 0: { range: 860, speed: 1400, cd_add: .8, passThrough: true, d: 'Long, fast and passes through minions. Marks the first champion hit.' }, 1: { r: 85, delay: .24, cd_add: -1.5, dmg_add: -15, d: 'A small, near-instant blast.' } } },
        { id: 'stellar', name: 'Guiding Star', tag: 'Support', d: 'Sigil Orb flies through allies and shields them. Cascade hastens allies it passes.', mods: { 0: { d: 'Passes through allies, shielding them. Marks the first enemy hit.' }, 2: { d: 'Three blasts walk forward. Each marks enemies and hastens allies.' } } },
      ],
      evolves: [
        [{ id: 'swiftsigil', name: 'Swift Sigil', d: 'Sigil Orb cooldown 0.8 shorter.', mods: { 0: { cd_add: -.8 } } }, { id: 'widerupture', name: 'Wide Rupture', d: 'Rupture radius 25 larger.', mods: { 1: { r_add: 25 } } }],
        [{ id: 'longcascade', name: 'Long Cascade', d: 'Cascade adds a fourth blast.' }, { id: 'starsurge', name: 'Star Surge', d: 'Cascade\'s last blast stuns champions for 0.8.' }],
      ],
      kit: [
        { name: 'Sigil Orb', d: 'Marks the first enemy it hits.', fx: 'orb', cd: 4, range: 640, shape: 'line', w: 42, speed: 950, dmg: 92, markT: 4,
          cast(s, c, a, A) { fire(s, c, a, { speed: A.speed, range: A.range, w: A.w, fx: 'orb', filter: c.f.stellar ? "allunits" : A.passThrough ? "champ" : "units", hit(s, c, t, p) {
            if (t.team === c.team) { shield(s, t, 90 * hpow(c), 3); p.pass = 1; return; }
            hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); t.markT = A.markT; s.ev.push({ e: 'mark', u: t.id }); if (t.kind === 'champ') skillHit(c, p); p.left = 0; } }); },
        },
        { name: 'Rupture', d: 'Ground blast. Breaks marks for double damage and a stun.', fx: 'rupture', cd: 6.5, range: 540, shape: 'circle', r: 115, delay: .42, dmg: 85, dmgM: 180,
          cast(s, c, a, A) { const car = {}; blast(s, c, a.tx, a.ty, A.r, A.delay, (s, z) => { eachEnemy(s, c, z.x, z.y, A.r, t => { const m = t.markT > 0; hurt(s, c, t, (m ? A.dmgM : A.dmg) * pow(c), { skill: 1 }); if (m) { t.markT = 0; if (t.kind === 'champ') { stun(s, t, 1); c.cd[0] = Math.max(0, c.cd[0] - 2); heal(s, c, c, c.maxHp * .03); } s.ev.push({ e: 'boom', x: t.x, y: t.y, r: 60, fx: 'break' }); } if (t.kind === 'champ') skillHit(c, car); }); }, 'rupture'); },
        },
        { name: 'Cascade', d: 'Three blasts walk forward. Each one marks.', fx: 'rupture', cd: 46, range: 640, shape: 'line', w: 200, delay: 0, dmg: 115,
          cast(s, c, a, A) { const reach = rayWall(c.x, c.y, a.dx, a.dy, 640), n = c.f.longcascade ? 4 : 3; for (let i = 0; i < n; i++) { const dl = .32 + i * .28 + A.delay, k = 220 + i * 200, car = {}, last = i === n - 1; if (k > reach + 60) continue; blast(s, c, c.x + a.dx * k, c.y + a.dy * k, 135, dl, (s, z) => { eachEnemy(s, c, z.x, z.y, 135, t => { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); t.markT = 4; if (t.kind === 'champ') { skillHit(c, car); if (c.f.starsurge && last) stun(s, t, .8); } }); if (c.f.stellar) for (const al of alliesIn(s, c.team, z.x, z.y, 200)) haste(al, .2, 2.5); }, 'rupture'); } },
        },
      ],
    },
    solenne: {
      name: 'Solenne', role: 'Support', blurb: 'Every heal is a shot you can miss.',
      sight: 850, hp: 540, hpG: 76, dmg: 46, dmgG: 5, armor: 20, armG: 3.5, range: 390, as: .85, ms: 310, pref: 360, support: true, fit: { top: 0, jungle: 0, bottom: 1, support: 3 },
      passive: { name: 'First Light', d: 'Whenever you heal an ally they gain 15% move speed for 2 seconds.' },
      builds: [
        { id: 'lifebringer', name: 'Lifebringer', tag: 'Healer', d: 'Mending Ray pierces allies and heals more, and Daybreak heals enormously. Your burn is weak.', stats: { dmg: .9 }, mods: { 0: { heal_add: 40, dmg_add: -20, cd_add: -.5, d: 'Heals every ally it passes. Burns the first enemy, weakly.' }, 2: { heal_add: 120 } } },
        { id: 'protector', name: 'Protector', tag: 'Shields', d: 'Aegis is wider, lasts longer and refreshes faster. Allies inside are shielded.', mods: { 1: { cd: 9.5, r_add: 40, dur: 3.6, d: 'A wide dome that destroys projectiles and shields allies inside.' } } },
        { id: 'sunlance', name: 'Sunlance', tag: 'Damage', d: 'Mending Ray burns hard and sets targets alight. Weaker heals. Viable bottom.', stats: { dmg: 1.12 }, mods: { 0: { dmg_add: 42, heal_add: -35, d: 'Burns the first enemy hard, leaving them alight. Heals weakly.' } } },
        { id: 'radiant', name: 'Radiant', tag: 'Aura', d: 'Mending Ray hops from an ally to another nearby. Nearby allies slowly regenerate.', mods: { 0: { d: 'Heals the first ally it hits, then hops to another nearby ally for 60%.' } } },
      ],
      evolves: [
        [{ id: 'quickray', name: 'Quick Ray', d: 'Mending Ray cooldown 1 shorter.', mods: { 0: { cd_add: -1 } } }, { id: 'longray', name: 'Long Ray', d: 'Mending Ray reaches 120 farther.', mods: { 0: { range_add: 120 } } }],
        [{ id: 'sundome', name: 'Sun Dome', d: 'Aegis heals allies inside it.' }, { id: 'solaris', name: 'Solaris', d: 'Daybreak also hastens allies and its cooldown is 10 shorter.', mods: { 2: { cd_add: -10 } } }],
      ],
      kit: [
        { name: 'Mending Ray', d: 'Heals the first ally it hits, or burns the first enemy.', fx: 'ray', cd: 5, range: 680, shape: 'line', w: 46, heal: 132, dmg: 82,
          cast(s, c, a, A) { fire(s, c, a, { speed: 1150, range: A.range, w: 46, fx: 'ray', filter: 'allchamp', hit(s, c, t, p) {
            if (t.team === c.team) { heal(s, c, t, A.heal * pow(c)); haste(t, .15, 2); skillHit(c, p); if (c.f.lifebringer) { p.pass = 1; return; } if (c.f.radiant && !p.hopped) { p.hopped = 1; const o = s.champs.find(x => x !== t && x !== c && x.alive && x.team === c.team && Math.hypot(x.x - t.x, x.y - t.y) < 360 && hasLOS(t.x, t.y, x.x, x.y)); if (o) heal(s, c, o, A.heal * .6 * pow(c)); } }
            else { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); slow(t, .3, 1.5); if (c.f.sunlance) bleed(s, c, t, 20 * pow(c), 2.5); skillHit(c, p); }
            p.left = 0; } }); },
        },
        { name: 'Aegis', d: 'Place a dome that destroys enemy projectiles.', fx: 'dome', cd: 12, range: 460, shape: 'circle', r: 135, dur: 2.6,
          cast(s, c, a, A) {
            const z = field(s, c, 'dome', { x: a.tx, y: a.ty, r: A.r, dur: A.dur, fx: 'dome' });
            z.step = c.f.protector || c.f.sundome ? (s, z) => { if (s.tick % 15 === 0) for (const al of alliesIn(s, c.team, z.x, z.y, z.r)) { if (c.f.protector && !z.sh) shield(s, al, 70 * hpow(c), 2); if (c.f.sundome) heal(s, c, al, 28 * pow(c)); } z.sh = 1; } : null;
          },
        },
        { name: 'Daybreak', d: 'Heals allies around you, cleanses stuns and throws enemies back.', fx: 'heal', cd: 52, range: 0, shape: 'self', r: 340, heal: 230,
          cast(s, c, a, A) { blast(s, c, c.x, c.y, 340, .3, (s, z) => {
            for (const e of s.champs) if (e.alive && Math.hypot(e.x - z.x, e.y - z.y) < 340) {
              if (e.team === c.team) { heal(s, c, e, A.heal * pow(c)); e.stunT = 0; e.slowT = 0; e.rootT = 0; if (c.f.solaris) haste(e, .25, 3); }
              else { const n = norm(e.x - z.x, e.y - z.y); hurt(s, c, e, 90 * pow(c), { skill: 1 }); dashDir(e, n.x, n.y, 210, 800, { forced: true }); }
            }
            c.stats.skillHits++;
          }, 'heal'); },
        },
      ],
      tick(s, c) { if (c.f.radiant && s.tick % 30 === 0) for (const al of alliesIn(s, c.team, c.x, c.y, 300)) if (al !== c) heal(s, c, al, 12 * pow(c)); },
    },
    sable: {
      name: 'Sable', role: 'Assassin', blurb: 'Strike from behind, then be somewhere else.',
      sight: 720, hp: 510, hpG: 74, dmg: 66, dmgG: 8, armor: 18, armG: 3, range: 135, as: 1.05, ms: 335, pref: 100, melee: true, fit: { top: 2, jungle: 3, bottom: 0, support: 0 },
      passive: { name: 'Nightstalker', d: 'Move 15% faster whenever no enemy can see you.' },
      builds: [
        { id: 'ghost', name: 'Ghost', tag: 'Evasive', d: 'Echo comes back quickly and waits longer. Snapping back heals you.', mods: { 1: { cd: 6.5, window: 5.5, d: 'Blink away and leave an echo. Snap back within 5 seconds to heal.' } } },
        { id: 'reaper', name: 'Reaper', tag: 'Execute', d: 'Reap comes up far more often, executes harder, and any champion takedown resets it.', mods: { 2: { cd: 26, missing: .5, d: 'Blink behind a champion. Massive execute. A takedown resets it.' } } },
        { id: 'hunter', name: 'Hunter', tag: 'Jungle', d: 'Rend tears through monsters. Enemies under 30% health in fog are shown to you.', mods: { 0: { d: 'Short slash. Far stronger against monsters.' } } },
        { id: 'twin', name: 'Twin', tag: 'Trickster', d: 'While your echo stands, Rend also strikes from the echo.', mods: { 0: { d: 'Short slash. While your echo stands, it slashes too.' } } },
      ],
      evolves: [
        [{ id: 'sharperend', name: 'Sharper Rend', d: 'Rend cooldown 0.7 shorter.', mods: { 0: { cd_add: -.7 } } }, { id: 'wideblade', name: 'Wide Blade', d: 'Rend reaches 40 farther and sweeps wider.', mods: { 0: { range_add: 40, dot: .5 } } }],
        [{ id: 'phantom', name: 'Phantom', d: 'Snapping back with Echo stuns the enemies around you for 0.6.' }, { id: 'deathmark', name: 'Death Mark', d: 'A target hit by Reap takes 15% more from you for 4 seconds.' }],
      ],
      kit: [
        { name: 'Rend', d: 'Short slash. Hits half again as hard from behind.', fx: 'slash', cd: 3.5, range: 240, shape: 'cone', w: 180, dmg: 92, dot: .72,
          cast(s, c, a, A) { const hitF = (px, py, dx, dy, mul) => { let hit = 0; eachEnemy(s, c, px, py, A.range, t => { const n = norm(t.x - px, t.y - py); if (n.x * dx + n.y * dy < A.dot || !hasLOS(px, py, t.x, t.y)) return; const back = (t.fx || 0) * -n.x + (t.fy || 0) * -n.y < -.25; let d = A.dmg * pow(c) * (back ? 1.5 : 1) * mul; if (c.f.hunter && t.kind === 'monster') d *= 1.8; hurt(s, c, t, d, { skill: 1, crit: back }); if (t.kind === 'champ') hit = 1; }); return hit; };
            let hit = hitF(c.x, c.y, a.dx, a.dy, 1); if (c.f.twin && c.echo) hit |= hitF(c.echo.x, c.echo.y, a.dx, a.dy, .7);
            if (hit) c.stats.skillHits++; },
        },
        { name: 'Echo', d: 'Blink away and leave an echo. Cast again to snap back.', fx: 'blink', cd: 10, range: 320, shape: 'dash', w: 60, over: true, recastInstant: true, armsRecast: true, window: 3.5,
          cast(s, c, a, A) { c.echo = { x: c.x, y: c.y }; const f = nearestFree(s.map, a.tx, a.ty); s.ev.push({ e: 'blink', x: c.x, y: c.y }); c.x = f.x; c.y = f.y; c.recast[1] = A.window; s.ev.push({ e: 'blink', x: c.x, y: c.y }); },
          recast(s, c, a, A) { if (!c.echo) return; s.ev.push({ e: 'blink', x: c.x, y: c.y }); c.x = c.echo.x; c.y = c.echo.y; c.echo = null; s.ev.push({ e: 'blink', x: c.x, y: c.y }); if (c.f.ghost) heal(s, c, c, c.maxHp * .1); if (c.f.phantom) for (const t of enemiesIn(s, c, c.x, c.y, 180)) if (t.kind === 'champ') stun(s, t, .6); },
        },
        { name: 'Reap', d: 'Blink behind a champion. Execute damage. A kill resets it.', fx: 'blink', cd: 40, range: 480, shape: 'circle', r: 90, over: true, target: true, dmg: 125, missing: .35,
          cast(s, c, a, A) { const t = nearChamp(s, c, a.tx, a.ty, 220); if (!t || dist(c, t) > 540) return false; const n = { x: t.fx || 1, y: t.fy || 0 }; s.ev.push({ e: 'blink', x: c.x, y: c.y }); const f = nearestFree(s.map, t.x - n.x * 90, t.y - n.y * 90); c.x = f.x; c.y = f.y; c.fx = n.x; c.fy = n.y; c.reap = { id: t.id, t: 2 }; hurt(s, c, t, (A.dmg * pow(c)) + (t.maxHp - t.hp) * A.missing, { skill: 1, crit: 1 }); c.stats.skillHits++; if (c.f.deathmark) { t.markedBy = c.id; t.dmarkT = 4; } s.ev.push({ e: 'blink', x: c.x, y: c.y }); },
        },
      ],
      tick(s, c) { const seen = canSee(s, 1 - c.team, c); if (!seen) haste(c, .15, .1); if (c.f.hunter && s.tick % 15 === 0) for (const e of s.champs) if (e.alive && e.team !== c.team && e.hp / e.maxHp < .3) e.revealT = Math.max(e.revealT || 0, .6); },
    },
    gravel: {
      name: 'Gravel', role: 'Tank', blurb: 'One good hook moves the whole fight.',
      sight: 680, hp: 720, hpG: 112, dmg: 54, dmgG: 6, armor: 34, armG: 5, range: 190, as: .8, ms: 305, pref: 150, melee: true, fit: { top: 2, jungle: 2, bottom: 0, support: 3 },
      passive: { name: 'Immovable', d: 'Dropping below 40% health hardens you for 3 seconds. Once every 30 seconds.' },
      builds: [
        { id: 'anchor', name: 'Anchor', tag: 'Catch', d: 'Chain reaches farther and stuns longer, but takes longer to come back.', mods: { 0: { range: 740, stun: .5, cd_add: 2, d: 'Long reach. Drags the first enemy to you and holds them a moment.' } } },
        { id: 'juggernaut', name: 'Juggernaut', tag: 'Bruiser', d: 'Avalanche comes up far more often. Stomp is wider and hits harder. Lighter hook.', mods: { 0: { dmg_add: -20 }, 1: { r_add: 45, dmg_add: 30, d: 'Wide, strong stomp. Slow everyone around you and harden.' }, 2: { cd: 30 } } },
        { id: 'warden', name: 'Warden', tag: 'Protect', d: 'Chain hooks allies to safety. Stomp shields allies beside you.', mods: { 0: { filter: 'allchamp', d: 'Hook the first champion it hits: drags an enemy to you, or pulls an ally to safety.' }, 1: { d: 'Slow everyone around you, harden, and shield nearby allies.' } } },
        { id: 'seismic', name: 'Seismic', tag: 'Zone', d: 'Stomp sends an aftershock a moment later and slows much harder.', mods: { 1: { slowA: .55, d: 'Slow everyone around you hard; a second pulse follows.' } } },
      ],
      evolves: [
        [{ id: 'longchain', name: 'Long Chain', d: 'Chain reaches 80 farther.', mods: { 0: { range_add: 80 } } }, { id: 'hardstomp', name: 'Hard Stomp', d: 'Stomp radius 35 larger.', mods: { 1: { r_add: 35 } } }],
        [{ id: 'lastwall', name: 'Last Wall', d: 'Avalanche stuns 0.4 longer.' }, { id: 'unbroken', name: 'Unbroken', d: 'Stomp hardens you for a full 4 seconds.' }],
      ],
      kit: [
        { name: 'Chain', d: 'Hook the first enemy it hits and drag them to you.', fx: 'chain', cd: 9, range: 620, shape: 'line', w: 50, dmg: 64, stun: .15, filter: 'chainable',
          cast(s, c, a, A) { fire(s, c, a, { speed: 1050, range: A.range, w: 50, fx: 'chain', filter: A.filter === 'allchamp' ? 'allchainable' : A.filter, hit(s, c, t, p) {
            if (t.team === c.team) { const n = norm(c.x - t.x, c.y - t.y), l = Math.max(0, n.l - 90); dashDir(t, n.x, n.y, l, 1200, { forced: true }); shield(s, t, 90 * hpow(c), 3); skillHit(c, p); p.left = 0; return; }
            hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); const n = norm(c.x - t.x, c.y - t.y), l = Math.max(0, n.l - 90); dashDir(t, n.x, n.y, l, 1300, { forced: true }); t.stunT = Math.max(t.stunT || 0, l / 1300 + A.stun); if (t.kind === 'champ') skillHit(c, p); p.left = 0; } }); },
        },
        { name: 'Stomp', d: 'Slow everyone around you and harden for a moment.', fx: 'stomp', cd: 8, range: 0, shape: 'self', r: 215, dmg: 62, slowA: .4,
          cast(s, c, a, A) { const go = () => { let hit = false; s.ev.push({ e: 'boom', x: c.x, y: c.y, r: A.r, fx: 'stomp' }); eachEnemy(s, c, c.x, c.y, A.r, t => { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); slow(t, A.slowA, 1.5); if (t.kind === 'champ') hit = true; }); return hit; }; const hit = go(); c.drT = c.f.unbroken ? 4 : 2.5; if (c.f.warden) for (const al of alliesIn(s, c.team, c.x, c.y, A.r + 60)) shield(s, al, 80 * hpow(c), 3); if (c.f.seismic) blast(s, c, c.x, c.y, A.r, .55, () => { go(); }, 'stomp'); if (hit) c.stats.skillHits++; },
        },
        { name: 'Avalanche', d: 'Unstoppable charge. Stuns around the first champion you hit.', fx: 'dash', cd: 48, range: 640, shape: 'line', w: 110, pd: [640, 1000], dmg: 165,
          cast(s, c, a, A) { dashDir(c, a.dx, a.dy, 640, 1000, { unstop: true, champOnly: true, onHit(s, c, t) { c.dash = null; s.ev.push({ e: 'boom', x: c.x, y: c.y, r: 180, fx: 'crash' }); eachEnemy(s, c, c.x, c.y, 180, e => { hurt(s, c, e, A.dmg * pow(c), { skill: 1 }); if (e.kind === 'champ') stun(s, e, 1.25 + (c.f.lastwall ? .4 : 0)); }, true); c.stats.skillHits++; } }); },
        },
      ],
      tick(s, c) { if (c.pcdT > 0) c.pcdT -= DT; if (c.hp < c.maxHp * .4 && !(c.pcdT > 0) && c.alive) { c.pcdT = 30; c.drT = Math.max(c.drT, 3); s.ev.push({ e: 'boom', x: c.x, y: c.y, r: 90, fx: 'stomp' }); } c.pready = c.pcdT > 0 ? 0 : 1; },
    },

    // ---------- Villains ----------
    deadbolt: {
      name: 'Deadbolt', role: 'Marksman', blurb: 'Lay the wire, then finish what it caught.',
      sight: 950, hp: 505, hpG: 70, dmg: 58, dmgG: 7, armor: 15, armG: 3, range: 470, as: 1.0, ms: 305, pref: 430, fit: { top: 1, jungle: 0, bottom: 3, support: 0 },
      passive: { name: 'Deadlock', d: 'Basic attacks against rooted or slowed targets crit for 50% more.' },
      builds: [
        { id: 'trapper', name: 'Trapper', tag: 'Traps', d: 'Up to three wires, longer lasting and tighter. Your bullets stay modest.', stats: { dmg: .93 }, mods: { 0: { cd: 6.5, dur: 22, maxWires: 3, rootT: 1.5, d: 'Lay up to three wires. Each roots the first enemy to cross it.' } } },
        { id: 'deadeyed', name: 'Dead Aim', tag: 'Poke', d: 'Ricochet flies far and hits very hard but never bounces.', mods: { 1: { range: 920, dmg_add: 75, bounces: 0, cd_add: 1.5, d: 'A long, heavy shot. No bounce.' } } },
        { id: 'gunslinger', name: 'Gunslinger', tag: 'Attack speed', d: 'Ricochet bounces three times. Every fourth basic attack also crits.', stats: { as: 1.14, dmg: .94 }, mods: { 1: { bounces: 3, bdmg: .7, d: 'A shot that bounces between up to four targets.' } } },
        { id: 'jailer', name: 'Jailer', tag: 'Control', d: 'Lockdown comes up more, is wider and slows much harder, but its shots are gentle.', mods: { 2: { cd: 38, r_add: 60, slowA: .45, shot: 28, d: 'Marks a wide zone that reveals, slows hard and fires light shots.' } } },
      ],
      evolves: [
        [{ id: 'taut', name: 'Taut Wire', d: 'Tripwire roots 0.3 longer.', mods: { 0: { rootT_add: .3 } } }, { id: 'hairtrigger', name: 'Hair Trigger', d: 'Ricochet cooldown 1.5 shorter.', mods: { 1: { cd_add: -1.5 } } }],
        [{ id: 'crossfire', name: 'Crossfire', d: 'Lockdown fires twice as fast.' }, { id: 'killbox', name: 'Kill Box', d: 'Lockdown is 60 wider and roots enemies inside it when it starts.', mods: { 2: { r_add: 60 } } }],
      ],
      kit: [
        { name: 'Tripwire', d: 'Lay a wire across a path. The first enemy to cross it is rooted.', fx: 'tripwire', cd: 9, range: 620, shape: 'circle', r: 150, wire: true, dur: 13, maxWires: 2, rootT: 1.25, dmg: 62,
          cast(s, c, a, A) {
            const nx = -a.dy, ny = a.dx, w1 = rayWall(a.tx, a.ty, nx, ny, A.r), w2 = rayWall(a.tx, a.ty, -nx, -ny, A.r);
            const mine = s.zones.filter(z => z.kind === 'tripline' && z.owner === c); if (mine.length >= A.maxWires) mine[0].dead = true;
            const z = field(s, c, 'tripline', lineZone({ r: A.r, dur: A.dur, arm: .25 }, a.tx + nx * w1, a.ty + ny * w1, a.tx - nx * w2, a.ty - ny * w2));
            z.step = (s, z) => { if (z.arm > 0) { z.arm -= DT; return; } for (const t of s.champs) if (t.alive && !t.air && t.team !== c.team && segDist(t.x, t.y, z.x1, z.y1, z.x2, z.y2) < t.r + 12) { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); root(s, t, A.rootT); z.t = 0; s.ev.push({ e: 'boom', x: t.x, y: t.y, r: 70, fx: 'tripwire' }); c.stats.skillHits++; return; } };
          },
        },
        { name: 'Ricochet', d: 'A shot that bounces to a second target.', fx: 'ricochet', cd: 6, range: 660, shape: 'line', w: 36, dmg: 80, bounces: 1, bdmg: .7,
          cast(s, c, a, A) { fire(s, c, a, { speed: 1500, range: A.range, w: A.w, fx: 'ricochet', filter: 'units', hit(s, c, t, p) {
            hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.kind === 'champ') skillHit(c, p); p.left = 0;
            ricochetNext(s, c, A, t, new Set([t.id]), A.bounces, A.bdmg);
          } }); },
        },
        { name: 'Lockdown', d: 'Marks a zone that reveals and slows and fires at those inside.', fx: 'lockdown', cd: 55, range: 900, shape: 'circle', r: 260, dur: 4.5, slowA: .25, shot: 56,
          cast(s, c, a, A) {
            const every = c.f.crossfire ? 11 : 21;
            const z = field(s, c, 'lockdown', { x: a.tx, y: a.ty, r: A.r, dur: A.dur, n: 0 });
            if (c.f.killbox) for (const t of enemiesIn(s, c, a.tx, a.ty, A.r)) if (t.kind === 'champ') root(s, t, .9);
            z.step = (s, z) => {
              if (s.tick % 6 === 0) for (const t of s.champs) if (t.alive && t.team !== c.team && Math.hypot(t.x - z.x, t.y - z.y) < z.r + t.r) { t.revealT = Math.max(t.revealT || 0, .4); slow(t, A.slowA, .35); if (t.stealthT > 0) breakStealth(s, t); }
              if (++z.n >= every) { z.n = 0; const list = s.champs.filter(t => t.alive && !t.air && t.team !== c.team && Math.hypot(t.x - z.x, t.y - z.y) < z.r + t.r); if (list.length) { const t = list[s.rand() * list.length | 0]; blast(s, c, t.x + (t.vx || 0) * .2, t.y + (t.vy || 0) * .2, 78, .28, (s, b) => { for (const e of enemiesIn(s, c, b.x, b.y, 78)) if (e.kind === 'champ') { hurt(s, c, e, A.shot * pow(c), { skill: 1 }); if (!z.counted) { z.counted = true; c.stats.skillHits++; } } }, 'lockdown'); } }
            };
          },
        },
      ],
      onBasic(s, c, t, o) { if (t.rootT > 0 || t.slowT > 0) { o.dmg *= 1.5; o.crit = true; } if (c.f.gunslinger) { c.pstack = ((c.pstack || 0) + 1) % 4; if (!c.pstack) { o.dmg *= 1.5; o.crit = true; } } },
    },
    duelist: {
      name: 'Duelist', role: 'Fighter', blurb: 'Circle them, cut them, salute them.',
      sight: 720, hp: 600, hpG: 90, dmg: 62, dmgG: 8, armor: 26, armG: 4, range: 165, as: .98, ms: 330, pref: 125, melee: true, fit: { top: 3, jungle: 2, bottom: 0, support: 0 },
      passive: { name: 'Flurry of Angles', d: 'Hitting a target from a new angle builds up to 5 stacks, each adding 5% damage. Stacks fade after 3 seconds.' },
      builds: [
        { id: 'fencer', name: 'Fencer', tag: 'Combo', d: 'Flourish refreshes on a clean finish. Longer window, and the third cut stuns longer.', mods: { 0: { cd: 6, window: 2.4, knockT: .9, d: 'Three quick cuts. Land the third on a champion to refund half the cooldown.' } } },
        { id: 'masquerade', name: 'Masquerade', tag: 'Trickster', d: 'Feint is quick and long. The decoy bursts when it ends and damages nearby enemies.', mods: { 1: { cd: 7.5, stealth: 1.9, d: 'A decoy steps away and bursts, while you vanish longer.' } } },
        { id: 'honorbound', name: 'Honorbound', tag: 'Duel', d: 'Final Salute comes up much sooner and you hit far harder inside the ring. Win a duel to reset it.', mods: { 2: { cd: 30, dur: 4, dmgBoost: 1.3, d: 'Binds one enemy into a ring. You hit 30% harder inside. A kill resets it.' } } },
        { id: 'bladestorm', name: 'Bladestorm', tag: 'Waves', d: 'The third cut of Flourish spins around you. Stacks of Flurry also grant speed.', mods: { 0: { dmg1_add: 14, dmg2_add: 30, d: 'Three quick cuts. The third is a whirl that hits everything around you.' } } },
      ],
      evolves: [
        [{ id: 'lunging', name: 'Lunging Cut', d: 'The second cut of Flourish reaches 50 farther.', mods: { 0: { reach1_add: 50 } } }, { id: 'pirouette', name: 'Pirouette', d: 'Feint also dashes you the opposite way.' }],
        [{ id: 'coupdegrace', name: 'Coup de Grace', d: 'The third cut adds 12% of the target\'s missing health.' }, { id: 'lastbow', name: 'Last Bow', d: 'Final Salute stuns the target for 0.5 when it starts.' }],
      ],
      kit: [
        { name: 'Flourish', d: 'Three quick cuts, each within a window. The third knocks up.', fx: 'flourish', cd: 8, range: 0, shape: 'self', instant: true, armsRecast: true, chain: 2, window: 1.8, knockT: .6, reach0: 210, reach1: 250, reach2: 230, dmg0: 48, dmg1: 56, dmg2: 82,
          cast(s, c, a, A) { flourish(s, c, A, 0); c.fstep = 1; c.recast[0] = A.window; },
          recast(s, c, a, A) { const n = c.fstep || 1; flourish(s, c, A, n); if (n < 2) { c.fstep = n + 1; c.recast[0] = A.window; } else { c.fstep = 0; c.recast[0] = 0; } },
        },
        { name: 'Feint', d: 'A decoy steps away while you briefly vanish.', fx: 'feint', cd: 12, range: 340, shape: 'dash', w: 60, stealth: 1.3, keepStealth: true,
          cast(s, c, a, A) {
            const z = field(s, c, 'decoy', { x: c.x, y: c.y, r: 26, dur: 1.5, x0: c.x, vx: a.dx * 300, vy: a.dy * 300 });
            z.step = (s, z) => { z.x += z.vx * DT; z.y += z.vy * DT; if (rayWall(z.x, z.y, a.dx, a.dy, 8) < 8) z.vx = z.vy = 0; };
            z.end = (s, z) => { s.ev.push({ e: 'boom', x: z.x, y: z.y, r: 120, fx: 'feint' }); if (c.f.masquerade) for (const t of enemiesIn(s, c, z.x, z.y, 170, true)) hurt(s, c, t, 150 * pow(c), { skill: 1 }); };
            stealth(s, c, A.stealth); if (c.f.pirouette) dashDir(c, -a.dx, -a.dy, 200, 1000);
          },
        },
        { name: 'Final Salute', d: 'Binds one enemy into a short duel ring neither can leave.', fx: 'salute', cd: 50, range: 420, shape: 'circle', r: 110, target: true, dur: 3.2, dmgBoost: 1.12,
          cast(s, c, a, A) {
            const t = nearChamp(s, c, a.tx, a.ty, 180); if (!t || dist(c, t) > A.range + 60 || !hasLOS(c.x, c.y, t.x, t.y)) return false;
            const z = field(s, c, 'ring', { x: (c.x + t.x) / 2, y: (c.y + t.y) / 2, r: 240, dur: A.dur, a: c, b: t, boost: A.dmgBoost, tgt: t.id });
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
      sight: 850, hp: 495, hpG: 66, dmg: 50, dmgG: 5, armor: 14, armG: 3, range: 420, as: .85, ms: 300, pref: 390, fit: { top: 1, jungle: 0, bottom: 3, support: 2 },
      passive: { name: 'Contagion', d: 'When a cursed enemy dies, their curses spread to enemies nearby.' },
      builds: [
        { id: 'cursebinder', name: 'Cursebinder', tag: 'Stacks', d: 'Curses stack to five and linger. Hex Bolt is faster, and full stacks detonate far harder.', mods: { 0: { cd: 2.6, d: 'Stacks curses up to five. At five, the next hit detonates them.' } } },
        { id: 'transmuter', name: 'Transmuter', tag: 'Control', d: 'Polymorph comes up fast and turns targets into very fragile coins.', mods: { 1: { cd: 8.5, w_add: 10, d: 'Turns a target into a spinning coin that takes 25% more damage.' } } },
        { id: 'ritualist', name: 'Ritualist', tag: 'Team fight', d: 'Coven comes up sooner, drags harder and detonates wider.', mods: { 2: { cd: 38, r_add: 60, pull_add: 70 } } },
        { id: 'jinx', name: 'Jinx', tag: 'Support', d: 'Curses slow, and allies who hit a cursed enemy heal a little.', mods: { 0: { d: 'Stacks curses that slow. Allies heal by hitting cursed enemies.' } } },
      ],
      evolves: [
        [{ id: 'swiftbolt', name: 'Swift Bolt', d: 'Hex Bolt cooldown 0.6 shorter.', mods: { 0: { cd_add: -.6 } } }, { id: 'bigpoly', name: 'Long Change', d: 'Polymorph lasts 0.3 longer and is a little wider.', mods: { 1: { dur_add: .3, w_add: 12 } } }],
        [{ id: 'covenant', name: 'Covenant', d: 'Coven is 40 wider and drags harder.', mods: { 2: { r_add: 40, pull_add: 50 } } }, { id: 'hexburst', name: 'Hex Burst', d: 'Detonations also curse enemies around the target.' }],
      ],
      kit: [
        { name: 'Hex Bolt', d: 'Stacks curses. At full stacks the next hit detonates them.', fx: 'hexbolt', cd: 3.5, range: 660, shape: 'line', w: 40, dmg: 76,
          cast(s, c, a, A) { fire(s, c, a, { speed: 1100, range: A.range, w: A.w, fx: 'hexbolt', filter: 'units', hit(s, c, t, p) {
            hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.kind === 'champ') skillHit(c, p); p.left = 0;
            if (t.alive) { if ((t.curseT > 0 ? t.curseN : 0) >= curseCap(c)) detonate(s, c, t, 1); else curse(s, c, t, 1); if (c.f.jinx && t.curseN) slow(t, .08 * t.curseN, 1.5); }
          } }); },
        },
        { name: 'Polymorph', d: 'Skillshot. Turns a target into a harmless spinning coin for a moment.', fx: 'polymorph', cd: 13, range: 600, shape: 'line', w: 36, dur: 1.25,
          cast(s, c, a, A) { fire(s, c, a, { speed: 1250, range: A.range, w: A.w, fx: 'polymorph', filter: 'champ', hit(s, c, t, p) { if (t.team === c.team) return; poly(s, t, A.dur); if (c.f.transmuter) t.vulnT = A.dur; skillHit(c, p); p.left = 0; } }); },
        },
        { name: 'Coven', d: 'A zone that drags enemies to its centre and detonates curses.', fx: 'coven', cd: 50, range: 640, shape: 'circle', r: 280, dur: 1.9, pull: 150, dmg: 120,
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
      sight: 850, hp: 520, hpG: 76, dmg: 46, dmgG: 5, armor: 20, armG: 3.5, range: 380, as: .85, ms: 310, pref: 350, support: true, fit: { top: 2, jungle: 0, bottom: 1, support: 3 },
      passive: { name: 'Vile Recovery', d: 'Poisoned enemies nearby slowly heal you.' },
      builds: [
        { id: 'apothecary', name: 'Apothecary', tag: 'Support', d: 'Leech feeds allies for much more and comes back faster. Weak poison.', mods: { 1: { cd: 7, heal: .9, d: 'Tether an enemy, draining them and feeding your lowest ally for much more.' }, 0: { dps_add: -8 } } },
        { id: 'pestilence', name: 'Pestilence', tag: 'Damage over time', d: 'Miasma is wider, longer and far deadlier.', mods: { 0: { r_add: 45, dur: 7.5, dps_add: 9 }, 1: { heal: .3 } } },
        { id: 'bloodletter', name: 'Bloodletter', tag: 'Bruiser', d: 'Leech feeds only you, drains hard, and your attacks land sturdily. A top laner who will not die.', stats: { hp: 1.15, dmg: 1.1 }, mods: { 1: { dps_add: 24, heal: .8, d: 'Tether an enemy and drain them. Feeds only you.' } } },
        { id: 'ward', name: 'The Ward', tag: 'Zone', d: 'Quarantine comes up far sooner and slows harder.', mods: { 2: { cd: 32, slowA: .42, r_add: 40 } } },
      ],
      evolves: [
        [{ id: 'thickfog', name: 'Thick Fog', d: 'Miasma radius 30 larger.', mods: { 0: { r_add: 30 } } }, { id: 'fastdraw', name: 'Quick Draw', d: 'Leech cooldown 2 shorter.', mods: { 1: { cd_add: -2 } } }],
        [{ id: 'lockward', name: 'Locked Ward', d: 'Quarantine reveals enemies inside.' }, { id: 'blacktide', name: 'Black Tide', d: 'Miasma also slows by 25%.' }],
      ],
      kit: [
        { name: 'Miasma', d: 'A lingering poison cloud.', fx: 'miasma', cd: 8, range: 560, shape: 'circle', r: 170, dur: 5, dps: 23,
          cast(s, c, a, A) {
            const z = field(s, c, 'miasma', { x: a.tx, y: a.ty, r: A.r, dur: A.dur, n: 0 });
            z.step = (s, z) => { if (s.tick % 9) return; for (const t of enemiesIn(s, c, z.x, z.y, z.r)) { poison(s, c, t, A.dps * pow(c), 2); if (c.f.blacktide) slow(t, .25, .4); if (t.kind === 'champ' && !z.counted) { z.counted = true; c.stats.skillHits++; } } };
          },
        },
        { name: 'Leech', d: 'A tether draining an enemy and feeding an ally.', fx: 'leech', cd: 10, range: 540, shape: 'circle', r: 120, target: true, dur: 3, dps: 44, heal: .6,
          cast(s, c, a, A) {
            const t = nearChamp(s, c, a.tx, a.ty, 200); if (!t || dist(c, t) > A.range + 60 || !hasLOS(c.x, c.y, t.x, t.y)) return false;
            c.stats.skillHits++;
            const z = field(s, c, 'tether', { x: c.x, y: c.y, r: 20, dur: A.dur, tgt: t.id, n: 0 });
            z.step = (s, z) => { z.x = c.x; z.y = c.y; if (!c.alive || !t.alive || t.air || dist(c, t) > A.range + 200 || !hasLOS(c.x, c.y, t.x, t.y)) { z.t = 0; return; } if (s.tick % 6 === 0) { const a2 = hurt(s, c, t, A.dps * .2 * pow(c), { skill: 1, dot: 1 }); const to = c.f.bloodletter ? c : lowestAlly(s, c, 620, true) || c; heal(s, c, to, (a2 || 0) * A.heal); } };
          },
        },
        { name: 'Quarantine', d: 'A zone that blocks healing and slows.', fx: 'quarantine', cd: 52, range: 640, shape: 'circle', r: 300, dur: 5, slowA: .28,
          cast(s, c, a, A) {
            const z = field(s, c, 'quarantine', { x: a.tx, y: a.ty, r: A.r, dur: A.dur });
            z.step = (s, z) => { if (s.tick % 5) return; for (const t of s.champs) if (t.alive && t.team !== c.team && Math.hypot(t.x - z.x, t.y - z.y) < z.r + t.r) { t.noHealT = .3; slow(t, A.slowA, .3); if (c.f.lockward) t.revealT = Math.max(t.revealT || 0, .3); if (!z.counted) { z.counted = true; c.stats.skillHits++; } } };
          },
        },
      ],
      tick(s, c) { if (s.tick % 15) return; let n = 0; for (const t of s.champs) if (t.alive && t.team !== c.team && t.poisonT > 0 && Math.hypot(t.x - c.x, t.y - c.y) < 520) n++; if (n && c.hp < c.maxHp) heal(s, c, c, c.maxHp * .004 * n); },
    },
    shiv: {
      name: 'Shiv', role: 'Stealth assassin', blurb: 'If you can see her, she missed.',
      sight: 720, hp: 500, hpG: 72, dmg: 68, dmgG: 8, armor: 18, armG: 3, range: 135, as: 1.05, ms: 335, pref: 100, melee: true, fit: { top: 2, jungle: 3, bottom: 0, support: 0 },
      passive: { name: 'Opening Cut', d: 'The first strike out of stealth crits for 60% more.' },
      builds: [
        { id: 'cutthroat', name: 'Cutthroat', tag: 'Burst', d: 'Shank bleeds harder and refreshes on any bleeding kill.', mods: { 0: { dps_add: 16, d: 'Dash through. Deep bleed. A kill on a bleeding enemy resets it.' } } },
        { id: 'nightblade', name: 'Nightblade', tag: 'Stealth', d: 'Vanish comes up fast and lasts longer, and you move faster inside it.', mods: { 1: { cd: 8.5, dur: 3.1, ms: .32, d: 'Long stealth with a big speed boost. Fades on attack.' } } },
        { id: 'butcher', name: 'Butcher', tag: 'Team fight', d: 'Thousand Cuts cleaves everything around the target and comes up sooner.', mods: { 2: { cd: 32, d: 'Rapid untargetable strikes that also cleave around the target.' } } },
        { id: 'venomous', name: 'Venomous', tag: 'Attrition', d: 'Attacks poison, and Shank has a shorter cooldown but less bite. Nothing about this is quick, just inevitable.', mods: { 0: { cd: 4.8, dmg_add: -18, d: 'Quick dash through. Light bleed that slows.' } } },
      ],
      evolves: [
        [{ id: 'longshank', name: 'Long Shank', d: 'Shank reaches 70 farther.', mods: { 0: { range_add: 70 } } }, { id: 'deepcut', name: 'Deep Cut', d: 'Shank bleeds for 25% more.', mods: { 0: { dps_mul: 1.25 } } }],
        [{ id: 'fadeaway', name: 'Fade Away', d: 'Starting Vanish cleanses slows and roots and heals you 8%.' }, { id: 'finishing', name: 'Finishing Stroke', d: 'The last strike of Thousand Cuts adds 15% of missing health.' }],
      ],
      kit: [
        { name: 'Shank', d: 'Dash through with a bleed.', fx: 'shank', cd: 7, range: 320, shape: 'dash', w: 70, pd: [320, 1250], dmg: 58, dps: 22,
          cast(s, c, a, A) { const car = {}; dashDir(c, a.dx, a.dy, A.range, 1250, { onHit(s, c, t) { hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.alive) { bleed(s, c, t, A.dps * pow(c), 3); if (c.f.venomous) slow(t, .22, 2); } if (t.kind === 'champ') { skillHit(c, car); } } }); },
        },
        { name: 'Vanish', d: 'Short stealth, hidden even with vision. Fades on attack.', fx: 'vanish', cd: 13, range: 0, shape: 'self', instant: true, keepStealth: true, dur: 2.2, ms: .2,
          cast(s, c, a, A) { stealth(s, c, A.dur); haste(c, A.ms, A.dur); if (c.f.fadeaway) { c.slowT = 0; c.rootT = 0; heal(s, c, c, c.maxHp * .08); } },
        },
        { name: 'Thousand Cuts', d: 'Rapid untargetable strikes on one target.', fx: 'cuts', cd: 42, range: 430, shape: 'circle', r: 100, target: true, over: true, strikes: 6, dmg: 36,
          cast(s, c, a, A) { const t = nearChamp(s, c, a.tx, a.ty, 200); if (!t || dist(c, t) > A.range + 60) return false; c.stats.skillHits++; c.cuts = { id: t.id, n: A.strikes, next: 0, A }; c.air = 1; s.ev.push({ e: 'blink', x: c.x, y: c.y }); },
        },
      ],
      onBasic(s, c, t, o) { if (c.f.venomous) poison(s, c, t, 14 * pow(c), 2); },
      tick(s, c) { c.pready = c.stealthT > 0 || c.opener > 0 ? 1 : 0; },
    },
    ironjaw: {
      name: 'Ironjaw', role: 'Brawler tank', blurb: 'Hit him. It only makes it worse.',
      sight: 680, hp: 655, hpG: 100, dmg: 54, dmgG: 6, armor: 30, armG: 4, range: 190, as: .82, ms: 305, pref: 150, melee: true, fit: { top: 3, jungle: 2, bottom: 0, support: 3 },
      passive: { name: 'Rage', d: 'Taking damage builds rage. Rage makes your basic attacks up to 50% stronger.' },
      builds: [
        { id: 'brawler', name: 'Brawler', tag: 'Brawl', d: 'Attacking builds rage too, and full rage reaches further.', stats: { as: 1.08 }, mods: {} },
        { id: 'wrecker', name: 'Wrecker', tag: 'Area', d: 'Wrecking Ball orbits longer, wider and comes up sooner.', mods: { 0: { cd: 7, dur: 4.2, orbit_add: 40, dmg_add: 10 } } },
        { id: 'bouncer', name: 'Bouncer', tag: 'Catch', d: 'Grab reaches far and hurls enemies straight at your nearest ally or tower.', mods: { 1: { range: 320, stunT: 1.25, d: 'Seize an enemy from farther and hurl them at your nearest ally or tower.' } } },
        { id: 'fortress', name: 'Fortress', tag: 'Tank', d: 'Rage hardens into a shield. Demolish comes up sooner, lighter hits.', stats: { hp: 1.12, dmg: .88 }, mods: { 2: { cd: 34 } } },
      ],
      evolves: [
        [{ id: 'heavyball', name: 'Heavy Ball', d: 'Wrecking Ball slows on contact.' }, { id: 'longreach', name: 'Long Reach', d: 'Grab reaches 60 farther.', mods: { 1: { range_add: 60 } } }],
        [{ id: 'aftermath', name: 'Aftermath', d: 'Demolish leaves a slowing rift for 2 seconds.' }, { id: 'bloodlust', name: 'Blood Lust', d: 'Rage also adds 12% attack speed at full.' }],
      ],
      kit: [
        { name: 'Wrecking Ball', d: 'A ball orbits you briefly, hitting anything it touches.', fx: 'wrecking', cd: 9, range: 0, shape: 'self', instant: true, dur: 3, orbit: 170, dmg: 46,
          cast(s, c, a, A) {
            const z = field(s, c, 'orbit', { x: c.x, y: c.y, r: 34, dur: A.dur, ang: Math.atan2(c.fy, c.fx), orbit: A.orbit, hits: {} });
            z.step = (s, z) => { z.ang += 7.5 * DT; z.x = c.x + Math.cos(z.ang) * z.orbit; z.y = c.y + Math.sin(z.ang) * z.orbit; if (!c.alive) { z.t = 0; return; } eachEnemy(s, c, z.x, z.y, z.r, t => { if ((z.hits[t.id] || 0) > s.t) return; z.hits[t.id] = s.t + .85; hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (c.f.heavyball) slow(t, .3, 1); if (t.kind === 'champ' && !z.counted) { z.counted = true; c.stats.skillHits++; } }); };
          },
        },
        { name: 'Grab', d: 'Seize a nearby enemy and hurl them behind you.', fx: 'grab', cd: 10, range: 250, shape: 'cone', w: 130, dmg: 70, stunT: .7,
          cast(s, c, a, A) {
            let t = null, bd = A.range + 26; for (const e of [...s.champs, ...s.minions, ...s.monsters]) { if (!e.alive || e.air || e.boss || e.team === c.team || (e.kind === 'champ' && !canSee(s, c.team, e))) continue; const n = norm(e.x - c.x, e.y - c.y), v = n.l - e.r; if (n.x * a.dx + n.y * a.dy > .55 && hasLOS(c.x, c.y, e.x, e.y) && (v < bd || (t && t.kind !== 'champ' && e.kind === 'champ'))) { if (e.kind === 'champ' || !t || t.kind !== 'champ') { bd = v; t = e; } } }
            if (!t) return false;
            let hx = c.x - a.dx * 240, hy = c.y - a.dy * 240;
            if (c.f.bouncer) { let b = null, bb = 900; for (const o of [...s.champs.filter(x => x.alive && x.team === c.team && x !== c), ...s.towers.filter(x => x.alive && x.team === c.team)]) { const d2 = dist(o, c); if (d2 < bb) { bb = d2; b = o; } } if (b) { const n = norm(b.x - t.x, b.y - t.y); hx = b.x - n.x * 60; hy = b.y - n.y * 60; } }
            const n = norm(hx - t.x, hy - t.y); dashDir(t, n.x, n.y, Math.min(n.l, c.f.bouncer ? 420 : 340), 1500, { forced: true });
            stun(s, t, Math.min(n.l, 420) / 1500 + A.stunT); hurt(s, c, t, A.dmg * pow(c), { skill: 1 }); if (t.kind === 'champ') c.stats.skillHits++;
          },
        },
        { name: 'Demolish', d: 'A ground fissure line that knocks up all along it.', fx: 'demolish', cd: 48, range: 660, shape: 'line', w: 130, delay: .42, dmg: 165, knockT: 1,
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
  };

  // A ricochet is a straight shot aimed at launch, leading the next target once. It never steers.
  function ricochetNext(s, c, A, from, seen, left, pw) {
    if (left <= 0) return;
    let n = null, bd = 380;
    const tryIt = e => { if (!e.alive || e.air || e.team === c.team || seen.has(e.id) || !canSee(s, c.team, e)) return; const d = dist(from, e); if (d < bd && hasLOS(from.x, from.y, e.x, e.y)) { bd = d; n = e; } };
    s.champs.forEach(tryIt); if (!n) { s.minions.forEach(tryIt); s.monsters.forEach(tryIt); } if (!n) return;
    const hits = new Set(seen); seen.add(n.id);
    const fly = bd / 1500, aim = norm(n.x + (n.vx || 0) * fly - from.x, n.y + (n.vy || 0) * fly - from.y), reach = rayWall(from.x, from.y, aim.x, aim.y, bd * 1.3 + 60);
    s.proj.push({ id: s.nid++, x: from.x, y: from.y, px: from.x, py: from.y, vx: aim.x * 1500, vy: aim.y * 1500, left: reach, w: 30, team: c.team, owner: c, fx: 'ricochet', pierce: false, hits, filter: 'units', skill: true, counted: false, age: 0,
      hit(s, c, t, p) { hurt(s, c, t, A.dmg * pow(c) * pw, { skill: 1 }); if (t.kind === 'champ') skillHit(c, p); p.left = 0; ricochetNext(s, c, A, t, seen, left - 1, pw * A.bdmg); } });
  }
  // Flourish cut n (0, 1, 2). Auto-faces for phones. Lands in the direction of the nearest visible champion.
  function flourish(s, c, A, n) {
    const reach = A['reach' + n], f = autoFace(s, c, reach + 80), a = { dx: f.dx, dy: f.dy };
    if (n === 1) dashDir(c, a.dx, a.dy, 100 + (c.f.lunging ? 50 : 0), 1100);
    let hit = 0; const spin = n === 2 && c.f.bladestorm;
    eachEnemy(s, c, c.x, c.y, reach, t => { const v = norm(t.x - c.x, t.y - c.y); if (!spin && v.x * a.dx + v.y * a.dy < .35) return; if (!hasLOS(c.x, c.y, t.x, t.y)) return;
      let d = A['dmg' + n] * pow(c); if (n === 2 && c.f.coupdegrace) d += (t.maxHp - t.hp) * .12; if (t.kind === 'champ') { hit = 1; c.pstack = Math.min(5, (c.pstack || 0) + 1); c.ptime = 3; }
      hurt(s, c, t, d, { skill: 1, crit: n === 2 ? 1 : 0 }); if (n === 2 && t.alive && t.kind === 'champ') knock(s, t, A.knockT); });
    if (hit) c.stats.skillHits++;
    if (hit && n === 2 && c.f.fencer) c.cd[0] *= .5;
  }
  function detonate(s, c, t, mul) {
    const n = t.curseN, cap = curseCap(c); t.curseN = 0; t.curseT = 0;
    hurt(s, c, t, (36 + 31 * n * (c.f.cursebinder && n >= cap ? 1.3 : 1)) * pow(c) * mul, { skill: 1, crit: n >= cap ? 1 : 0 });
    s.ev.push({ e: 'boom', x: t.x, y: t.y, r: 70, fx: 'break' });
    if (t.alive && t.kind === 'champ' && n >= 3) stun(s, t, .5 + (n - 3) * .1);
    if (c.f.hexburst) for (const o of enemiesIn(s, c, t.x, t.y, 200)) if (o !== t) curse(s, c, o, 1);
  }
  function spreadCurses(s, t) { const c = t.curseBy; if (!c || !c.alive) return; const n = t.curseN; for (const o of enemiesIn(s, c, t.x, t.y, 340, true)) if (o !== t) curse(s, c, o, Math.max(1, n - 1)); }

  // Items: stats add up across the three slots. cost is the price of this step from its upgradesFrom.
  const ITEMS = [
    { id: 'whetstone', name: 'Whetstone', d: '+9% damage.', cost: 350, tier: 1, tags: ['attack'], dmg: .09 },
    { id: 'vest', name: 'Padded Vest', d: '+150 health and 10 armour.', cost: 350, tier: 1, tags: ['tank'], hp: 150, armor: 10 },
    { id: 'boots', name: 'Quick Boots', d: '+20 move speed.', cost: 300, tier: 1, tags: ['mobility'], ms: 20 },
    { id: 'lens', name: 'Focus Lens', d: '8% shorter cooldowns.', cost: 400, tier: 1, tags: ['ability'], cdr: .08 },
    { id: 'satchel', name: 'Field Satchel', d: '+15% healing and shields. Small health regeneration.', cost: 350, tier: 1, tags: ['support'], healPow: .15, regen: .002, hp: 40 },
    { id: 'serrated', name: 'Serrated Edge', d: '+18% damage. Basic attacks on champions add a light bleed.', cost: 550, tier: 2, tags: ['attack'], upgradesFrom: 'whetstone', dmg: .18, u: 'bleed' },
    { id: 'trigger', name: 'Hair Trigger', d: '+9% damage and 22% attack speed.', cost: 550, tier: 2, tags: ['attack', 'mobility'], upgradesFrom: 'whetstone', dmg: .09, as: .22 },
    { id: 'plate', name: 'Riot Plate', d: '+300 health and 22 armour.', cost: 550, tier: 2, tags: ['tank'], upgradesFrom: 'vest', hp: 300, armor: 22 },
    { id: 'spurs', name: 'Chase Spurs', d: '+34 move speed.', cost: 450, tier: 2, tags: ['mobility'], upgradesFrom: 'boots', ms: 34 },
    { id: 'capacitor', name: 'Capacitor', d: '16% shorter cooldowns and +10% ability damage.', cost: 550, tier: 2, tags: ['ability'], upgradesFrom: 'lens', cdr: .16, ap: .1 },
    { id: 'medkit', name: 'Medkit', d: '+30% healing and shields, and more regeneration.', cost: 500, tier: 2, tags: ['support'], upgradesFrom: 'satchel', healPow: .3, regen: .004, hp: 100 },
    { id: 'headsman', name: 'Headsman', d: '+30% damage. Targets under 35% health take 15% more.', cost: 800, tier: 3, tags: ['attack'], upgradesFrom: 'serrated', dmg: .3, u: 'headsman' },
    { id: 'bloodfang', name: 'Bloodfang', d: '+20% damage and 15% lifesteal on basic attacks and abilities.', cost: 800, tier: 3, tags: ['attack', 'sustain'], upgradesFrom: 'serrated', dmg: .2, lifesteal: .15 },
    { id: 'stormlash', name: 'Stormlash', d: '+15% damage and 40% attack speed. Every third attack arcs to one more enemy.', cost: 850, tier: 3, tags: ['attack'], upgradesFrom: 'trigger', dmg: .15, as: .4, u: 'storm' },
    { id: 'bastion', name: 'Bastion', d: '+550 health, 40 armour. Grants a shield when you fall below half health, once every 30 seconds.', cost: 850, tier: 3, tags: ['tank'], upgradesFrom: 'plate', hp: 550, armor: 40, u: 'bastion' },
    { id: 'spikeguard', name: 'Spikeguard', d: '+420 health, 50 armour. Melee attackers take 25% of the damage back.', cost: 800, tier: 3, tags: ['tank'], upgradesFrom: 'plate', hp: 420, armor: 50, u: 'thorns' },
    { id: 'phase', name: 'Phase Treads', d: '+48 move speed and 8% shorter cooldowns. Speed burst after any ability.', cost: 750, tier: 3, tags: ['mobility', 'ability'], upgradesFrom: 'spurs', ms: 48, cdr: .08, u: 'phase' },
    { id: 'overclock', name: 'Overclock', d: '28% shorter cooldowns and +22% ability damage.', cost: 850, tier: 3, tags: ['ability'], upgradesFrom: 'capacitor', cdr: .28, ap: .22 },
    { id: 'sanctum', name: 'Sanctum', d: '+55% healing and shields, regeneration, and allies near you take 8% less damage.', cost: 800, tier: 3, tags: ['support'], upgradesFrom: 'medkit', healPow: .55, regen: .006, hp: 220, u: 'sanctum' },
  ];
  const ITEM_BY = {}; ITEMS.forEach((it, i) => { ITEM_BY[it.id] = it; it.i = i; });
  const itemPath = id => { const out = []; for (let it = ITEM_BY[id]; it; it = ITEM_BY[it.upgradesFrom]) out.unshift(it.id); return out; };
  // The full cost of a step: from an owned ancestor if there is one, otherwise the whole chain.
  function itemPrice(c, id) {
    const it = ITEM_BY[id]; if (!it) return null;
    if (c.items.includes(id)) return null;
    const path = itemPath(id); let own = -1, slot = -1;
    for (let i = path.length - 2; i >= 0 && slot < 0; i--) { const k = c.items.indexOf(path[i]); if (k >= 0) { own = i; slot = k; } }
    if (slot < 0 && !c.items.some(x => !x)) return null;
    let cost = 0; for (let i = own + 1; i < path.length; i++) cost += ITEM_BY[path[i]].cost;
    return cost;
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
  function recommended(champ, build) { const k = KITS[champ]; if (!k) return []; const b = build || k.builds[0].id; return (REC[b] || REC[k.builds[0].id]).slice(); }
  // Default build per kit and role, for bots and for a seat with none chosen.
  function defaultBuild(champ, role, roll) {
    const k = KITS[champ], ids = k.builds.map(x => x.id), avoid = BOT_BUILD_AVOID[champ] || {}, pool = ids.filter(b => !(avoid[b] || []).includes(role));
    return (pool.length ? pool : ids)[Math.floor((roll || 0) * (pool.length ? pool.length : ids.length)) % (pool.length || ids.length)];
  }
  // Build fits: which build does not suit a given role (bot defaults only; players are free).
  const BOT_BUILD_AVOID = {
    solenne: { sunlance: ['support'], lifebringer: ['bottom', 'top'], protector: ['bottom', 'top'], radiant: ['bottom', 'top'] },
    plague: { apothecary: ['top', 'bottom'], bloodletter: ['support', 'bottom'], ward: ['top'] },
    ione: { stellar: ['top', 'bottom'] }, hex: { jinx: ['top', 'bottom'] },
    kade: { vanguard: ['jungle'], breaker: ['jungle'] }, gravel: { warden: ['top', 'jungle'] }, ironjaw: { bouncer: ['jungle'] },
  };

  // Marks earned at the end of a match.
  function marksEarned(won, st) { st = st || {}; return Math.round(30 + (won ? 45 : 0) + Math.min(30, (st.kills || 0) * 3 + (st.assists || 0) * 1.5) + Math.min(10, (st.skillHits || 0) * .1)); }
