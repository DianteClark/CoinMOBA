// Title, lobby, seat setup, end screen and the coin wipe between them.
const { initMenus, animMenus, showEnd } = (() => {
  const ids = Object.keys(Sim.KITS), TIERS = Sim.TIERS;
  const BOT_NAMES = ['Penny', 'Florin', 'Ducat', 'Groat', 'Thaler', 'Guinea', 'Tanner', 'Sovereign', 'Bezant', 'Kopek'];
  const STATS = {
    vesper: { Damage: 5, Toughness: 1, Mobility: 2, Difficulty: 4 },
    kade: { Damage: 4, Toughness: 3, Mobility: 4, Difficulty: 5 },
    ione: { Damage: 4, Toughness: 2, Mobility: 2, Difficulty: 3 },
    solenne: { Damage: 2, Toughness: 2, Mobility: 3, Difficulty: 2 },
    sable: { Damage: 5, Toughness: 1, Mobility: 5, Difficulty: 5 },
    gravel: { Damage: 2, Toughness: 5, Mobility: 2, Difficulty: 2 },
  };
  const L = { seats: null, team: 0, slot: 0, sheet: null };
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const show = id => $(id).classList.remove('hide'), hide = id => $(id).classList.add('hide'), hidden = id => $(id).classList.contains('hide');
  const mine = () => L.seats[L.team][L.slot];
  const pipsHtml = n => `<span class="pips" role="img" aria-label="Fit ${n} of 3">${[0, 1, 2].map(i => `<i${i < n ? ' class="on"' : ''}></i>`).join('')}</span>`;
  const icons = {};
  const iconOf = (c, i) => icons[c + i] || (icons[c + i] = Art.iconURL(c, i));
  const seatTier = (s) => s.human ? Sim.tierOf(pts(s.champ)) : s.tier;
  const roleName = r => Sim.ROLE_INFO[r].name;
  const charName = (team, id) => Sim.charOf(team, id).name;
  const MISSION = ['Save the people', 'Terrorize the city'];
  function coinCanvas(spr, size) { const c = document.createElement('canvas'); c.width = c.height = size; Hud.coinTo(c, spr); return c; }

  // ---------- seats ----------
  function rollSeats() {
    const names = shuffle(BOT_NAMES.slice()); let n = 0;
    const want = ids.includes(save.last) ? save.last : ids[0];
    L.seats = [0, 1].map(team => {
      const pool = shuffle(ids.slice()).slice(0, 4);
      if (team === L.team) { const at = pool.indexOf(want); if (at >= 0) [pool[at], pool[L.slot]] = [pool[L.slot], pool[at]]; else pool[L.slot] = want; }
      const roles = Sim.autoRoles(pool);
      return pool.map((champ, i) => ({ champ, role: roles[i], tier: Math.min(5, Math.floor(Math.random() * Math.random() * 6)), human: false, name: names[n++] }));
    });
    const me = mine(); me.human = true; me.name = 'You';
  }
  function setChamp(team, i, id) {
    const row = L.seats[team], s = row[i], other = row.find(o => o !== s && o.champ === id);
    if (other) other.champ = s.champ;
    s.champ = id;
    if (s.human) { save.last = id; persist(); flipT = 1; }
  }
  function setRole(team, i, role) {
    const row = L.seats[team], s = row[i], other = row.find(o => o !== s && o.role === role);
    if (other) other.role = s.role;
    s.role = role;
  }
  function moveMe(slot) {
    const a = mine(), b = L.seats[L.team][slot];
    if (a === b) return;
    for (const k of ['champ', 'tier', 'human', 'name']) [a[k], b[k]] = [b[k], a[k]];
    L.slot = slot;
    Sound.play('coin');
  }
  // The side is random. The player's seat setup travels with them.
  function rollSide() {
    const side = Math.random() < .5 ? 0 : 1;
    if (side !== L.team) { L.seats.reverse(); L.team = side; }
  }
  function autoFill() { L.seats.forEach(row => { const r = Sim.autoRoles(row.map(s => s.champ)); row.forEach((s, i) => { s.role = r[i]; }); }); }
  const buildCfg = () => ({ teams: L.seats.map(row => row.map(s => ({ champ: s.champ, role: s.role, tier: seatTier(s), human: s.human, name: s.name }))), diff: save.diff });

  // ---------- lobby ----------
  function renderLobby() {
    const seat = mine(), id = seat.champ, k = Sim.KITS[id], p = pts(id), tier = Sim.tierOf(p), next = TIERS[tier + 1], base = TIERS[tier].at, prog = next ? (p - base) / (next.at - base) : 1;
    const who = Sim.charOf(L.team, id);
    $('wN').textContent = who.name;
    $('mission').className = 'mission t' + L.team; $('mission').innerHTML = `<b>${Sim.TEAM_NAMES[L.team]}</b>${MISSION[L.team]}`;
    $('wT').innerHTML = `<span>${k.role}</span><span>${roleName(seat.role)}</span>`;
    $('wB').textContent = `${who.title}. ${k.blurb}`;
    $('wA').innerHTML = k.kit.map((a, i) => `<div><img src="${iconOf(id, i)}" alt=""><span><em>${a.name}</em>${a.d}</span><u>${a.range ? `Range ${a.range}` : 'Self'}</u></div>`).join('');
    $('wS').innerHTML = Object.entries(STATS[id]).map(([n, v]) => `<span>${n}</span><i><b style="width:${v * 20}%"></b></i>`).join('');
    $('wR').textContent = `Attack range ${k.range}`;
    const lad = $('ladder'); lad.textContent = '';
    TIERS.forEach((t, i) => {
      const r = document.createElement('div'); r.className = 'rung' + (i < tier ? ' done' : i === tier ? ' now' : ''); r.title = t.name;
      if (i === tier) r.style.setProperty('--p', Math.round(prog * 100));
      r.append(coinCanvas(Art.champCoin(id, L.team, i, 20), 56)); lad.append(r);
    });
    $('wTier').textContent = next ? `${TIERS[tier].name}, ${next.at - p} to ${next.name}` : `${TIERS[tier].name}, the highest border`;
    const pk = $('picks'); pk.textContent = '';
    ids.forEach(cid => {
      const b = document.createElement('button'); b.className = 'pick'; b.setAttribute('aria-label', charName(L.team, cid)); b.setAttribute('aria-pressed', cid === id);
      b.append(coinCanvas(Art.champCoin(cid, L.team, Sim.tierOf(pts(cid)), 54), 112));
      b.insertAdjacentHTML('beforeend', pipsHtml(Sim.KITS[cid].fit[seat.role]));
      b.onclick = () => { if (cid === id) return; setChamp(L.team, L.slot, cid); Sound.play('coin'); renderLobby(); };
      pk.append(b);
    });
    [0, 1].forEach(team => {
      const el = $('s' + team); el.textContent = '';
      L.seats[team].forEach((s, i) => {
        const d = document.createElement('div'); d.className = 'seat' + (s.human ? ' me' : '');
        const b = document.createElement('button'); b.className = 'seatc';
        b.setAttribute('aria-label', `${s.human ? 'Your seat' : s.name}, ${charName(team, s.champ)}, ${roleName(s.role)}`);
        b.append(coinCanvas(Art.champCoin(s.champ, team, seatTier(s), 46), 96));
        b.insertAdjacentHTML('beforeend', pipsHtml(Sim.KITS[s.champ].fit[s.role]));
        b.onclick = () => { Sound.play('tap'); openSheet(team, i); };
        const chip = document.createElement('span'); chip.className = 'chip'; chip.textContent = roleName(s.role);
        d.append(b, chip);
        if (s.human) { const y = document.createElement('span'); y.className = 'you'; y.textContent = 'You'; d.append(y); }
        else if (team === L.team) { const sit = document.createElement('button'); sit.className = 'sit'; sit.textContent = 'Sit here'; sit.setAttribute('aria-label', `Sit in ${s.name}'s seat`); sit.onclick = () => { moveMe(i); renderLobby(); }; d.append(sit); }
        el.append(d);
      });
    });
    document.querySelectorAll('#diff [data-d]').forEach(b => b.setAttribute('aria-pressed', b.dataset.d === save.diff));
  }

  // ---------- seat sheet ----------
  function openSheet(team, i) { L.sheet = { team, i }; renderSheet(); show('sheet'); }
  function renderSheet() {
    const { team, i } = L.sheet, s = L.seats[team][i];
    $('shT').innerHTML = `${s.human ? 'Your seat' : s.name}<small>${Sim.TEAM_NAMES[team]}, ${charName(team, s.champ)}</small>`;
    $('shSit').classList.toggle('hide', s.human || team !== L.team);
    const c = $('shC'); c.textContent = '';
    ids.forEach(id => {
      const k = Sim.KITS[id], nm = charName(team, id), b = document.createElement('button'); b.className = 'schamp'; b.setAttribute('aria-pressed', id === s.champ);
      b.setAttribute('aria-label', `${nm}, fit ${k.fit[s.role]} of 3 for ${roleName(s.role)}`);
      b.append(coinCanvas(Art.champCoin(id, team, s.human ? Sim.tierOf(pts(id)) : s.tier, 46), 100));
      b.insertAdjacentHTML('beforeend', `<span>${nm}</span>${pipsHtml(k.fit[s.role])}`);
      b.onclick = () => { setChamp(team, i, id); Sound.play('coin'); renderSheet(); renderLobby(); };
      c.append(b);
    });
    const r = $('shR'); r.textContent = '';
    Sim.ROLES.forEach(role => {
      const info = Sim.ROLE_INFO[role], fit = Sim.KITS[s.champ].fit[role], b = document.createElement('button'); b.setAttribute('aria-pressed', role === s.role);
      const holder = L.seats[team].find(o => o !== s && o.role === role);
      b.setAttribute('aria-label', `${info.name}, fit ${fit} of 3${holder ? `, swaps with ${holder.name}` : ''}`);
      b.innerHTML = `<span><b>${info.name}</b><small>${info.blurb}</small></span>${pipsHtml(fit)}`;
      b.onclick = () => { setRole(team, i, role); Sound.play('tap'); renderSheet(); renderLobby(); };
      r.append(b);
    });
  }

  // ---------- settings ----------
  function syncToggles() {
    for (const id of ['pMusic', 'sMusic']) $(id).setAttribute('aria-pressed', !!save.music);
    for (const id of ['pSfx', 'sSfx']) $(id).setAttribute('aria-pressed', !!save.sfx);
    document.querySelectorAll('#gfx [data-g]').forEach(b => b.setAttribute('aria-pressed', b.dataset.g === save.gfx));
  }
  function toggle(key) { save[key] = !save[key]; persist(); Sound.setOn(save.music, save.sfx); Sound.play('tap'); syncToggles(); }

  // ---------- coin drawing ----------
  function spinCoin(g, spr, cx, cy, R, ang, shadow = true) {
    const c = Math.cos(ang), ab = Math.abs(c), T = R * .1 * Math.sqrt(1 - c * c), dir = c >= 0 ? 1 : -1, w = R * ab;
    if (shadow) { g.globalAlpha = .34; g.fillStyle = '#04100e'; g.beginPath(); g.ellipse(cx + R * .06, cy + R * .09, Math.max(w, R * .1) + T, R, 0, 0, TAU); g.fill(); g.globalAlpha = 1; }
    const step = Math.max(1.5, T / 14);
    for (let i = T, n = 0; i > 0; i -= step, n++) { g.fillStyle = n % 2 ? '#7d5a26' : '#b5883e'; g.beginPath(); g.ellipse(cx - dir * i, cy, w, R, 0, 0, TAU); g.fill(); }
    if (ab > .02) { const h = spr.S * R / spr.R; g.drawImage(spr.c, cx - h * ab / 2, cy - h / 2, h * ab, h); }
  }
  function sweepCoin(g, cx, cy, R, ang, f) {
    const ab = Math.abs(Math.cos(ang)), frames = Art.sheen();
    if (ab < .05 || f < 0 || f >= 1) return;
    const d = R * 2.18;
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = .6;
    g.drawImage(frames[Math.floor(f * frames.length)], cx - d * ab / 2, cy - d / 2, d * ab, d);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  }
  const eased = a => a - .45 * Math.sin(2 * a);

  // ---------- wipe ----------
  const W = { on: false, phase: 0, t: 0, mid: null };
  function wipe(mid) {
    if (W.on) return false;
    W.on = true; W.phase = 0; W.t = 0; W.mid = mid;
    const c = $('wipe'); c.width = VW; c.height = VH; c.classList.remove('hide');
    Sound.play('whoosh');
    return true;
  }
  function wipeCover(g, R) {
    const spr = Art.coin('wipe', 230, 'boss', Art.METAL.boss, -1, 3), h = spr.S * R / spr.R;
    g.fillStyle = '#c8912e'; g.fillRect(0, 0, VW, VH);
    g.drawImage(spr.c, VW / 2 - h / 2, VH / 2 - h / 2, h, h);
  }
  function wipeStep(dt) {
    if (!W.on) return;
    const c = $('wipe'), g = c.getContext('2d'), D = Math.hypot(VW, VH) / 2 + 12, R = D * 1.25;
    if (W.phase === 0) {
      W.t += dt;
      const p = calm ? 1 : Math.min(1, W.t / .36);
      if (p < 1) {
        g.clearRect(0, 0, VW, VH);
        const spr = Art.coin('wipe', 230, 'boss', Art.METAL.boss, -1, 3), r = R * p * p, sx = Math.abs(Math.cos((1 - p) * Math.PI * 1.5));
        spinCoin(g, spr, VW / 2, VH / 2, Math.max(1, r), Math.acos(Math.max(.05, sx)), false);
      } else { wipeCover(g, R); W.phase = 1; }
      return;
    }
    // The covered frame has now been shown, so the heavy work is hidden.
    if (W.phase === 1) { const fn = W.mid; W.mid = null; if (fn) fn(); W.phase = 2; W.t = 0; return; }
    W.t += dt;
    const dur = calm ? .22 : .46, p = Math.min(1, W.t / dur);
    if (p >= 1) { W.on = false; c.classList.add('hide'); return; }
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
    if (calm) { g.clearRect(0, 0, VW, VH); g.globalAlpha = 1 - p; g.fillStyle = '#c8912e'; g.fillRect(0, 0, VW, VH); g.globalAlpha = 1; return; }
    wipeCover(g, R);
    const hole = D * 1.04 * p * p * (3 - 2 * p);
    g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(VW / 2, VH / 2, hole, 0, TAU); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = '#fff0bd'; g.lineWidth = 7 * (1 - p) + 1; g.beginPath(); g.arc(VW / 2, VH / 2, hole, 0, TAU); g.stroke();
  }

  // ---------- title ----------
  const T = { a: .4, dust: null, sweep: 0 };
  function titleStep(dt) {
    if (hidden('title')) return;
    const c = $('tcan'), k = Math.min(devicePixelRatio || 1, 2), w = Math.round(VW * k), h = Math.round(VH * k);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = c.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0); g.clearRect(0, 0, VW, VH);
    const cx = VW * .3, cy = VH * .5, R = Math.min(VH * .42, VW * .22), spr = Art.coin('title', 230, 'boss', Art.METAL.boss, -1, 3);
    if (!T.dust) T.dust = Array.from({ length: 56 }, () => ({ x: Math.random(), y: Math.random(), v: .02 + Math.random() * .05, p: Math.random() * 7, s: 1.5 + Math.random() * 3.4 }));
    if (!calm) { T.a += dt * 1.15; T.sweep = (T.sweep + dt / 3.2) % 1; }
    const ang = calm ? 0 : eased(T.a);
    spinCoin(g, spr, cx, cy, R, ang);
    sweepCoin(g, cx, cy, R, ang, T.sweep * 3.2 < 1 ? T.sweep * 3.2 : -1);
    const gl = Art.glow('#ffe08a');
    g.globalCompositeOperation = 'lighter';
    for (const d of T.dust) {
      if (!calm) { d.y -= d.v * dt; if (d.y < -.05) { d.y = 1.05; d.x = Math.random(); } d.p += dt * 2.2; }
      const r = d.s * (1.4 + Math.sin(d.p)), X = d.x * VW + Math.sin(d.p * .6) * 12, Y = d.y * VH;
      g.globalAlpha = .28 + (Math.sin(d.p * 1.7) + 1) * .24;
      g.drawImage(gl, X - r, Y - r, 2 * r, 2 * r);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  // ---------- lobby hero ----------
  let flipT = 0, heroA = .3, heroSweep = 0;
  function heroStep(dt) {
    if (hidden('lobby') || !L.seats) return;
    const c = $('big'), g = c.getContext('2d'), id = mine().champ, spr = Art.champCoin(id, L.team, Sim.tierOf(pts(id)), 230);
    if (!calm) { heroA += dt * .85; heroSweep = (heroSweep + dt / 4) % 1; }
    if (flipT > 0) flipT = Math.max(0, flipT - dt * 2.4);
    const ang = calm ? 0 : eased(heroA) + flipT * TAU;
    g.clearRect(0, 0, 520, 520);
    spinCoin(g, spr, 260, 258, 232, ang);
    sweepCoin(g, 260, 258, 232, ang, heroSweep * 4 < 1 ? heroSweep * 4 : -1);
  }

  // ---------- end screen ----------
  let E = null;
  function showEnd(r) {
    const st = r.me.stats, tier = Sim.tierOf(r.before);
    hide('forge'); Ctl.reset();
    $('endT').textContent = r.won ? 'Victory' : 'Defeat';
    $('endT').style.color = r.won ? '#ffe08a' : '#f59a86';
    $('endW').textContent = r.s.over.winner === 0 ? 'City saved' : 'City fallen';
    $('endS').textContent = `${st.kills} takedowns, ${st.deaths} deaths, ${st.assists} assists. You landed ${st.skillHits} of ${st.casts} abilities${st.parries ? ` and parried ${st.parries} hits` : ''}.`;
    Hud.scoreTable($('eBoard'), r.s, r.me);
    E = { t: 0, r, name: charName(r.me.team, r.me.champ), tier, draw: tier, flip: 0, shine: -1, p: r.before, ang: 0 };
    endText(); $('endBar').style.width = endFrac(r.before) * 100 + '%';
    show('end');
  }
  function endFrac(p) { const t = Sim.tierOf(p), n = TIERS[t + 1]; return n ? (p - TIERS[t].at) / (n.at - TIERS[t].at) : 1; }
  function endText() {
    const r = E.r, t = Sim.tierOf(E.p), n = TIERS[t + 1], risen = t > Sim.tierOf(r.before);
    const lead = risen ? `Your ${E.name} coin is now ${TIERS[t].name}. ` : '';
    $('endM').textContent = `${lead}+${r.gain} proficiency${n ? `, ${Math.ceil(n.at - E.p)} to ${n.name}` : ''}`;
  }
  function endStep(dt) {
    if (!E || hidden('end')) return;
    const r = E.r; E.t += dt;
    const f = calm ? 1 : Math.min(1, Math.max(0, (E.t - .5) / 1.5)), ease = 1 - Math.pow(1 - f, 3), p = r.before + r.gain * ease;
    if (p !== E.p) {
      E.p = p; $('endBar').style.width = endFrac(p) * 100 + '%'; endText();
      const t = Sim.tierOf(p);
      if (t > E.tier) { E.tier = t; E.flip = 1; E.shine = -1; Sound.play('level'); }
    }
    if (E.flip > 0) { E.flip = Math.max(0, E.flip - dt * 1.05); if (E.flip <= 0) E.shine = 0; }
    if (E.flip < .75) E.draw = E.tier;
    E.ang = calm ? 0 : E.flip * TAU * 2 + Math.sin(E.t * .7) * .3;
    const id = r.me.champ, spr = Art.champCoin(id, r.me.team, E.draw, 130), g = $('endcoin').getContext('2d');
    g.clearRect(0, 0, 300, 300);
    spinCoin(g, spr, 150, 148, 130, E.ang);
    if (E.shine >= 0 && E.shine < 1) { E.shine += dt * 1.3; sweepCoin(g, 150, 148, 130, E.ang, Math.min(.99, E.shine)); }
  }
  // A new lobby rolls a side and says so once the wipe has cleared.
  function enterLobby() {
    rollSide(); renderLobby(); show('lobby');
    $('callT').textContent = L.team ? 'You are a villain' : 'You are a hero';
    $('callM').textContent = MISSION[L.team];
    callT = -1;
  }
  function backToLobby() {
    return wipe(() => { paused = false; G = null; Ctl.reset(); hide('end'); hide('pause'); hide('forge'); enterLobby(); Sound.setMode('menu'); });
  }
  function begin(reroll) {
    return wipe(() => { if (reroll) rollSide(); hide('lobby'); hide('end'); hide('title'); paused = false; startMatch(buildCfg()); Sound.setMode('match'); });
  }
  let callT = 0;
  function callStep(dt) {
    if (callT === -1) { if (W.on) return; callT = 2.2; show('call'); Sound.play('level'); return; }
    if (callT > 0) { callT -= dt; if (callT <= 0 || hidden('lobby')) { callT = 0; hide('call'); } }
  }

  // ---------- wiring ----------
  function initMenus() {
    rollSeats(); renderLobby(); syncToggles();
    Hud.syncToggles = syncToggles;
    $('title').onclick = () => {
      Sound.init(); Sound.play('title'); Sound.setMode('menu');
      wipe(() => { hide('title'); enterLobby(); });
    };
    document.querySelectorAll('#diff [data-d]').forEach(b => { b.onclick = () => { save.diff = b.dataset.d; persist(); Sound.play('tap'); renderLobby(); }; });
    $('openSet').onclick = () => { Sound.play('tap'); syncToggles(); show('settings'); };
    $('setDone').onclick = () => { Sound.play('tap'); hide('settings'); };
    $('sMusic').onclick = $('pMusic').onclick = () => toggle('music');
    $('sSfx').onclick = $('pSfx').onclick = () => toggle('sfx');
    document.querySelectorAll('#gfx [data-g]').forEach(b => { b.onclick = () => { save.gfx = b.dataset.g; persist(); if (save.gfx === 'auto') quality = 2; applyQuality(); Sound.play('tap'); syncToggles(); }; });
    $('auto').onclick = () => { autoFill(); Sound.play('coin'); renderLobby(); };
    $('start').onclick = () => { Sound.play('tap'); hide('call'); callT = 0; begin(false); };
    $('shDone').onclick = () => { Sound.play('tap'); hide('sheet'); L.sheet = null; };
    $('shSit').onclick = () => { if (!L.sheet) return; moveMe(L.sheet.i); hide('sheet'); L.sheet = null; renderLobby(); };
    $('resume').onclick = () => { paused = false; hide('pause'); Sound.play('tap'); };
    $('leave').onclick = () => { Sound.play('tap'); backToLobby(); };
    $('again').onclick = () => { Sound.play('tap'); begin(true); };
    $('tolobby').onclick = () => { Sound.play('tap'); backToLobby(); };
  }

  function animMenus(dt) { wipeStep(dt); callStep(dt); titleStep(dt); heroStep(dt); endStep(dt); }

  return { initMenus, animMenus, showEnd };
})();
