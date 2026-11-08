// Title, the coin flip, lobby, seat setup, versus splash, end screen and the coin wipe between them.
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

  // ---------- side ----------
  // Every menu colours itself from these two classes on the stage.
  function applySide() { stage.classList.toggle('s0', L.team === 0); stage.classList.toggle('s1', L.team === 1); }

  // ---------- lobby ----------
  function renderLobby() {
    const seat = mine(), id = seat.champ, k = Sim.KITS[id], p = pts(id), tier = Sim.tierOf(p), next = TIERS[tier + 1], base = TIERS[tier].at, prog = next ? (p - base) / (next.at - base) : 1;
    const who = Sim.charOf(L.team, id), N = $('wN');
    if (N.textContent !== who.name) { N.textContent = who.name; N.classList.toggle('long', who.name.length > 11); N.classList.remove('pop'); void N.offsetWidth; N.classList.add('pop'); }
    $('mission').innerHTML = `<b>${Sim.TEAM_NAMES[L.team]}</b><span>${MISSION[L.team]}</span>`;
    $('wT').innerHTML = `<span>${k.role}</span><span>${roleName(seat.role)}</span>`;
    $('wB').textContent = who.title;
    $('wA').innerHTML = k.kit.map((a, i) => `<div><img src="${iconOf(id, i)}" alt=""><span><em>${a.name}</em><u>${a.range ? `Range ${a.range}` : 'Self'}</u><br>${a.d}</span></div>`).join('');
    $('wS').innerHTML = Object.entries(STATS[id]).map(([n, v]) => `<span>${n}<i><b style="width:${v * 20}%"></b></i></span>`).join('') + `<span>Range<em>${k.range}</em></span>`;
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
  function lobbyEnter() {
    const l = $('lobby'); l.classList.remove('enter'); void l.offsetWidth; l.classList.add('enter');
    setTimeout(() => l.classList.remove('enter'), 900);
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
  const edgeOf = () => L.team ? ['#5cc400', '#2e0a6e'] : ['#f5a800', '#101f9c'];
  function spinCoin(g, spr, cx, cy, R, ang, shadow = true) {
    const c = Math.cos(ang), ab = Math.abs(c), T = R * .1 * Math.sqrt(1 - c * c), dir = c >= 0 ? 1 : -1, w = R * ab, edge = edgeOf();
    if (shadow) { g.fillStyle = Comic.INK; g.beginPath(); g.ellipse(cx + R * .07, cy + R * .09, Math.max(w, R * .1) + T, R, 0, 0, TAU); g.fill(); }
    const step = Math.max(1.5, T / 14);
    for (let i = T, n = 0; i > 0; i -= step, n++) { g.fillStyle = n % 2 ? edge[1] : edge[0]; g.beginPath(); g.ellipse(cx - dir * i, cy, w, R, 0, 0, TAU); g.fill(); }
    if (ab > .02) { const h = spr.S * R / spr.R; g.drawImage(spr.c, cx - h * ab / 2, cy - h / 2, h, h); }
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
  const cssStar = (n, inner) => 'polygon(' + Array.from({ length: n * 2 }, (_, i) => { const a = i / (n * 2) * TAU, r = (i % 2 ? inner : 1) * 50; return `${(50 + Math.cos(a) * r).toFixed(1)}% ${(50 + Math.sin(a) * r).toFixed(1)}%`; }).join(',') + ')';

  // A jagged burst behind the big lobby coin, cached per side.
  const bursts = {};
  function heroBurst(side) {
    if (bursts[side]) return bursts[side];
    const c = Art.cv(560, 560), g = c.getContext('2d');
    g.translate(280, 280); g.save(); g.translate(10, 12); Comic.starPath(g, 20, 278, 206); g.fillStyle = Comic.INK; g.fill(); g.restore();
    Comic.starPath(g, 20, 276, 204); g.fillStyle = side ? Comic.TOXIC : Comic.SUN; g.fill(); g.strokeStyle = Comic.INK; g.lineWidth = 10; g.lineJoin = 'round'; g.stroke();
    Comic.starPath(g, 20, 240, 190, .16); g.fillStyle = '#fff'; g.fill();
    return bursts[side] = c;
  }

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
    const side = L.team, spr = Comic.face(side, 230), h = spr.S * R / spr.R;
    g.fillStyle = side ? Comic.VIOLET2 : Comic.ULTRA2; g.fillRect(0, 0, VW, VH);
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
        const r = R * p * p, sx = Math.abs(Math.cos((1 - p) * Math.PI * 1.5));
        Comic.flip(g, VW / 2, VH / 2, Math.max(1, r), Math.acos(Math.max(.05, sx)) + (L.team ? Math.PI : 0), 230, 0);
      } else { wipeCover(g, R); W.phase = 1; }
      return;
    }
    // The covered frame has now been shown, so the heavy work is hidden.
    if (W.phase === 1) { const fn = W.mid; W.mid = null; if (fn) fn(); W.phase = 2; W.t = 0; return; }
    W.t += dt;
    const dur = calm ? .22 : .46, p = Math.min(1, W.t / dur);
    if (p >= 1) { W.on = false; c.classList.add('hide'); return; }
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
    if (calm) { g.clearRect(0, 0, VW, VH); g.globalAlpha = 1 - p; g.fillStyle = Comic.INK; g.fillRect(0, 0, VW, VH); g.globalAlpha = 1; return; }
    wipeCover(g, R);
    const hole = D * 1.04 * p * p * (3 - 2 * p);
    g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(VW / 2, VH / 2, hole, 0, TAU); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = Comic.INK; g.lineWidth = 9 * (1 - p) + 2; g.beginPath(); g.arc(VW / 2, VH / 2, hole, 0, TAU); g.stroke();
  }

  // ---------- title ----------
  // The wordmark fills its column whichever face ends up loaded.
  let fitKey = '';
  function fitTitle() {
    const key = VW + '|' + Comic.fontsReady(); if (key === fitKey) return; fitKey = key;
    const b = document.querySelector('.tword b'); if (!b) return;
    b.style.fontSize = '100px'; const w = b.offsetWidth, room = VW * .51 - 52;
    b.style.fontSize = Math.max(44, Math.min(116, Math.floor(100 * room / (w || 1)))) + 'px';
  }
  const T = { t: 0, face: 0, p: -1, shown: -1, sparks: null };
  function titleStep(dt) {
    if (hidden('title')) return;
    fitTitle();
    const c = $('tcan'), k = Math.min(devicePixelRatio || 1, 2), w = Math.round(VW * k), h = Math.round(VH * k);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = c.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0); g.clearRect(0, 0, VW, VH);
    const cx = VW * .29, cy = VH * .5, R = Math.min(VH * .4, VW * .23), HOLD = 1.25, DUR = .7;
    if (!T.sparks) T.sparks = Array.from({ length: 7 }, (_, i) => ({ a: i * 1.05, d: 1.25 + (i % 3) * .14, p: i * .9 }));
    if (!calm) T.t += dt;
    let ang = T.face * Math.PI, hop = 0, sq = 1;
    if (!calm) {
      if (T.t > HOLD + DUR) { T.t = 0; T.face = (T.face + 3) % 2; ang = T.face * Math.PI; }
      else if (T.t > HOLD) { const p = (T.t - HOLD) / DUR, e = 1 - Math.pow(1 - p, 3); ang = (T.face + 3 * e) * Math.PI; hop = Math.sin(p * Math.PI) * R * .3; sq = 1 + Math.sin(p * Math.PI) * .12; }
      else if (T.t < .14) sq = 1 + (1 - T.t / .14) * .08;
    }
    const shown = Math.cos(ang) >= 0 ? 0 : 1;
    if (shown !== T.shown) { T.shown = shown; $('title').classList.toggle('s0', !shown); $('title').classList.toggle('s1', !!shown); }
    // burst behind the coin
    g.save(); g.translate(cx, cy - hop); g.rotate(T.t * .25 + T.face * .2); Comic.starPath(g, 18, R * 1.25 * sq, R * 1.04); g.fillStyle = Comic.INK; g.fill(); Comic.starPath(g, 18, R * 1.19 * sq, R * .98); g.fillStyle = shown ? Comic.TOXIC : Comic.SUN; g.fill(); g.restore();
    Comic.flip(g, cx, cy - hop, R * sq, ang, 230);
    for (const s of T.sparks) {
      s.p += dt * 1.1;
      const f = (Math.sin(s.p) + 1) / 2, x = cx + Math.cos(s.a + T.t * .12) * R * s.d, y = cy - hop + Math.sin(s.a + T.t * .12) * R * s.d, r = 3 + f * 11;
      Comic.glint(g, x + 1.5, y + 1.5, r, Comic.INK); Comic.glint(g, x, y, r, '#fff');
    }
  }

  // ---------- the coin flip: who you are this match ----------
  const SPIN = 1.16, HANG = .05, DROP = .08, HOLD = 1.32, EXIT = .24;
  const F = { on: false, t: 0, side: 0, done: null, keep: false, slam: 0, last: -1, tick: 0, seed: [] };
  const flipEnd = () => calm ? .9 : SPIN + HANG + DROP + HOLD;
  function flipStart(side, done, keep) {
    const c = $('fcan'), k = Math.min(devicePixelRatio || 1, 2), w = Math.round(VW * k), h = Math.round(VH * k);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    Object.assign(F, { on: true, t: 0, side, done, keep: !!keep, slam: 0, last: -1, tick: 0, seed: Array.from({ length: 22 }, () => [Math.random() * TAU, .7 + Math.random() * .6]) });
    $('flip').classList.remove('out'); show('flip');
    $('flipT').textContent = '';
    Sound.play('whoosh');
    flipDraw(0);
  }
  function flipImpact() {
    F.slam = 1;
    Sound.play('thud'); Sound.play('stomp'); Sound.play(F.side ? 'dread' : 'hopeSwell');
    Sound.setSide(F.side ? 'villain' : 'hero');
    $('flipT').textContent = F.side ? "You're a Villain. Terrorize the city." : "You're a Hero. Save the people.";
  }
  function flipFinish() {
    if (!F.on) return;
    F.on = false;
    const done = F.done; F.done = null;
    if (F.keep) { if (done) done(); return; }
    if (calm) { hide('flip'); if (done) done(); return; }
    $('flip').classList.add('out');
    if (done) done();
    setTimeout(() => { hide('flip'); $('flip').classList.remove('out'); }, EXIT * 1000);
  }
  function flipDraw(dt) {
    const c = $('fcan'), g = c.getContext('2d'), k = c.width / VW, side = F.side, t = F.t;
    g.setTransform(k, 0, 0, k, 0, 0); g.globalAlpha = 1; g.textBaseline = 'middle'; g.textAlign = 'center';
    const Rf = Math.min(VH * .36, VW * .22), cxF = VW * .28, cyF = VH * .5;
    let slam = t >= SPIN + HANG + DROP;
    if (calm) slam = true;
    // shake after impact
    const since = t - (SPIN + HANG + DROP), amp = !calm && since > 0 && since < .36 ? (1 - since / .36) * 16 : 0;
    if (amp) { g.translate(Math.sin(t * 90) * amp, Math.cos(t * 73) * amp * .7); }
    if (!slam) {
      // Spinning: the screen strobes between the two sides, in time with the coin.
      const p = Math.min(1, t / SPIN), e = 1 - Math.pow(1 - p, 2.7), turns = 12 + side, ang = e * turns * Math.PI, shown = Math.cos(ang) >= 0 ? 0 : 1;
      if (Math.floor(e * turns) !== F.tick) { F.tick = Math.floor(e * turns); Sound.play('tick'); }
      g.drawImage(Comic.burstBg(shown, Math.ceil(VW), Math.ceil(VH), .5, .5), 0, 0, VW, VH);
      const x = cxF + (VW * 1.28 - cxF) * (1 - e), y = cyF - Math.sin(e * Math.PI) * VH * .36 + (1 - e) * VH * .62;
      let R = Rf * (.42 + .98 * Math.min(1, e * 1.25));
      if (t > SPIN + HANG) { const d = Math.min(1, (t - SPIN - HANG) / DROP); R *= 1 - .3 * d * d * d; }
      // speed lines converge on the coin
      g.fillStyle = Comic.INK;
      for (const [a, f] of F.seed) { const r1 = Math.hypot(VW, VH) * .75, r2 = R * (1.4 + f * .4), s = .012 + (1 - e) * .02; g.beginPath(); g.moveTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2); g.lineTo(x + Math.cos(a - s) * r1, y + Math.sin(a - s) * r1); g.lineTo(x + Math.cos(a + s) * r1, y + Math.sin(a + s) * r1); g.closePath(); g.fill(); }
      Comic.flip(g, x, y, R, ang, 230, -.18);
      g.font = '700 14px "Barlow Semi Condensed",sans-serif'; g.textAlign = 'right'; g.fillStyle = '#fff';
      g.lineWidth = 3; g.strokeStyle = Comic.INK; g.lineJoin = 'round'; g.strokeText('Tap to skip', VW - 44, VH - 18); g.fillText('Tap to skip', VW - 44, VH - 18);
      g.setTransform(1, 0, 0, 1, 0, 0);
      return;
    }
    // Slammed: the chosen side fills the page.
    if (!F.slam) flipImpact();
    const s = calm ? 1 : Math.min(1, since / .22), acc = side ? Comic.TOXIC : Comic.SUN, fill2 = side ? Comic.BLOOD : '#fff';
    g.drawImage(Comic.burstBg(side, Math.ceil(VW), Math.ceil(VH), .28, .5), 0, 0, VW, VH);
    // burst star and flying ink lines
    g.save(); g.translate(cxF, cyF); const pop = calm ? 1 : Math.min(1, s * 2) * (1 + Math.sin(Math.min(1, s) * Math.PI) * .18);
    Comic.starPath(g, 20, Rf * 1.62 * pop, Rf * 1.22 * pop, .1); g.fillStyle = Comic.INK; g.fill();
    Comic.starPath(g, 20, Rf * 1.54 * pop, Rf * 1.14 * pop, .1); g.fillStyle = acc; g.fill();
    Comic.starPath(g, 20, Rf * 1.3 * pop, Rf * 1.04 * pop, .26); g.fillStyle = '#fff'; g.fill();
    if (!calm && since < .5) {
      const q = since / .5; g.strokeStyle = Comic.INK; g.lineCap = 'round'; g.lineWidth = 8 * (1 - q); g.beginPath();
      for (let i = 0; i < 24; i++) { const a = i / 24 * TAU + .05, r = Rf * (1.6 + q * 1.5), L = Rf * (.5 + (i % 3) * .2) * (1 - q * .5); g.moveTo(Math.cos(a) * r, Math.sin(a) * r); g.lineTo(Math.cos(a) * (r + L), Math.sin(a) * (r + L)); }
      g.stroke();
    }
    g.restore();
    // the coin, landing on its side
    const squash = calm ? 1 : since < .05 ? 1.1 : since < .14 ? 1.1 - (since - .05) / .09 * .12 : Math.min(1, .98 + (since - .14) * .4);
    g.save(); g.translate(cxF, cyF); g.rotate(-.1); g.scale(squash, 2 - squash);
    Comic.flip(g, 0, 0, Rf, side ? Math.PI : 0, 230, 0);
    g.restore();
    // words slam in beside it
    const headDelay = since - .05, h0 = calm ? 1 : Math.min(1, headDelay / .15), head = side ? "YOU'RE A VILLAIN!" : "YOU'RE A HERO!", sub = side ? 'Terrorize the city' : 'Save the people';
    const textX = VW * .52, textW = VW - 44 - textX + 4, sz0 = 72; g.font = Comic.disp(sz0);
    const mw = g.measureText(head).width, size = Math.min(sz0, Math.floor(sz0 * textW / mw));
    if (headDelay >= 0 || calm) {
      const sc = calm ? 1 : h0 < 1 ? 2.4 - 1.4 * (1 - Math.pow(1 - h0, 2)) : 1 + Math.max(0, .12 - (headDelay - .15) * .7) * Math.sin((headDelay - .15) * 30);
      g.save(); g.translate(textX + textW / 2, VH * .39); g.rotate(-.05); g.scale(sc, sc); g.globalAlpha = Math.min(1, h0 * 2.5);
      Comic.text(g, head, 0, 0, size, acc, 6, 5);
      g.restore();
    }
    const d2 = since - .22, s0 = calm ? 1 : Math.min(1, d2 / .14);
    if (d2 >= 0 || calm) {
      const sc2 = calm ? 1 : s0 < 1 ? 1.8 - .8 * s0 : 1;
      g.save(); g.translate(textX + textW / 2, VH * .62); g.rotate(.03); g.scale(sc2, sc2); g.globalAlpha = Math.min(1, s0 * 2.5);
      const fs = Math.max(20, Math.min(32, Math.floor(size * .55))); g.font = Comic.disp(fs);
      const w = Math.min(textW, g.measureText(sub.toUpperCase()).width + 34), hh = fs * 1.5;
      g.fillStyle = Comic.INK; g.fillRect(-w / 2 + 5, -hh / 2 + 6, w, hh);
      g.fillStyle = fill2; g.fillRect(-w / 2, -hh / 2, w, hh); g.strokeStyle = Comic.INK; g.lineWidth = 3.5; g.strokeRect(-w / 2, -hh / 2, w, hh);
      g.fillStyle = side ? '#fff' : Comic.INK; g.fillText(sub.toUpperCase(), 0, 1);
      if (side) { g.lineWidth = 3; g.strokeStyle = Comic.INK; g.strokeText(sub.toUpperCase(), 0, 1); g.fillText(sub.toUpperCase(), 0, 1); }
      g.restore();
    }
    // white-hot flash at impact
    if (!calm && since < .14) { g.globalAlpha = 1 - since / .14; g.fillStyle = '#fff'; g.fillRect(-20, -20, VW + 40, VH + 40); g.globalAlpha = 1; }
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
  function flipStep(dt) {
    if (!F.on) return;
    if (W.on) return;
    F.t += dt;
    if (F.t >= flipEnd()) { flipDraw(dt); flipFinish(); return; }
    flipDraw(dt);
  }
  function flipSkip() {
    if (!F.on) return;
    if (F.t < SPIN + HANG + DROP) F.t = SPIN + HANG + DROP;
    else flipFinish();
  }

  // ---------- versus splash: it also hides the map paint ----------
  const V = { on: false, t0: 0, stage: 0, after: 0, outAt: 0 };
  function renderVs() {
    [0, 1].forEach(team => {
      const el = $('vs' + team); el.textContent = '';
      L.seats[team].forEach((s, i) => {
        const d = document.createElement('div'); d.className = 'vcell'; d.style.setProperty('--i', i);
        const cv = document.createElement('canvas'); cv.width = cv.height = 168;
        Hud.coinTo(cv, Art.champCoin(s.champ, team, seatTier(s), 80));
        const b = document.createElement('b'); b.textContent = charName(team, s.champ);
        d.append(cv, b);
        if (s.human) { const y = document.createElement('i'); y.textContent = 'You'; d.append(y); }
        el.append(d);
      });
    });
  }
  function versus() {
    renderVs(); $('vs').classList.remove('out'); show('vs');
    Object.assign(V, { on: true, t0: performance.now(), stage: 0, after: 0, outAt: 0 });
    Sound.play('whoosh');
  }
  function vsStep() {
    if (!V.on) return;
    const now = performance.now(), t = (now - V.t0) / 1000;
    if (V.stage === 0 && t > .42) { V.stage = 1; Sound.play('thud'); Sound.play('clink'); }
    // The halves are closed by now, so the slow map paint happens out of sight.
    if (V.stage === 1 && t > .66) {
      V.stage = 2; hide('lobby'); hide('end'); hide('title'); hide('flip');
      startMatch(buildCfg()); Sound.setMode('match');
      paused = true; V.after = performance.now();
    }
    if (V.stage === 2 && now >= Math.max(V.t0 + (calm ? 1200 : 2250), V.after + 320)) {
      V.stage = 3; V.outAt = now; paused = false; Sound.play('whoosh'); $('vs').classList.add('out');
    }
    if (V.stage === 3 && now - V.outAt > 300) { V.on = false; hide('vs'); $('vs').classList.remove('out'); }
  }

  // ---------- lobby hero ----------
  let flipT = 0, heroA = .3, heroSweep = 0, heroBurstA = 0;
  function heroStep(dt) {
    if (hidden('lobby') || !L.seats) return;
    const c = $('big'), g = c.getContext('2d'), id = mine().champ, spr = Art.champCoin(id, L.team, Sim.tierOf(pts(id)), 230);
    if (!calm) { heroA += dt * .9; heroSweep = (heroSweep + dt / 4) % 1; heroBurstA += dt * .12; }
    if (flipT > 0) flipT = Math.max(0, flipT - dt * 2.4);
    const ang = calm ? 0 : Math.sin(heroA) * .34 + flipT * TAU;
    g.clearRect(0, 0, 520, 520);
    g.save(); g.translate(260, 258); g.rotate(heroBurstA); g.drawImage(heroBurst(L.team), -258, -258, 516, 516); g.restore();
    spinCoin(g, spr, 260, 258, 196, ang);
    sweepCoin(g, 260, 258, 196, ang, heroSweep * 4 < 1 ? heroSweep * 4 : -1);
  }

  // ---------- end screen ----------
  let E = null;
  function showEnd(r) {
    const st = r.me.stats, tier = Sim.tierOf(r.before);
    hide('forge'); Ctl.reset();
    L.team = r.me.team; applySide();
    $('end').classList.toggle('win', r.won); $('end').classList.toggle('lose', !r.won);
    $('endT').textContent = r.won ? 'Victory!' : 'Defeat';
    $('endT').style.color = '';
    $('endW').textContent = r.s.over.winner === 0 ? 'City saved' : 'City fallen';
    $('endS').textContent = `${st.kills} takedowns, ${st.deaths} deaths, ${st.assists} assists. You landed ${st.skillHits} of ${st.casts} abilities${st.parries ? ` and parried ${st.parries} hits` : ''}.`;
    Hud.scoreTable($('eBoard'), r.s, r.me);
    E = { t: 0, r, name: charName(r.me.team, r.me.champ), tier, draw: tier, flip: 0, shine: -1, p: r.before, ang: 0 };
    endText(); $('endBar').style.width = endFrac(r.before) * 100 + '%';
    hide('tierup');
    show('end');
    Sound.play('thud');
  }
  function endFrac(p) { const t = Sim.tierOf(p), n = TIERS[t + 1]; return n ? (p - TIERS[t].at) / (n.at - TIERS[t].at) : 1; }
  function endText() {
    const r = E.r, t = Sim.tierOf(E.p), n = TIERS[t + 1], risen = t > Sim.tierOf(r.before);
    const lead = risen ? `Your ${E.name} coin is now ${TIERS[t].name}. ` : '';
    $('endM').textContent = `${lead}+${r.gain} proficiency${n ? `, ${Math.ceil(n.at - E.p)} to ${n.name}` : ''}`;
  }
  function tierUp(t) {
    const x = $('tierup'); x.textContent = `${TIERS[t].name} border!`; hide('tierup'); void x.offsetWidth; show('tierup');
    Sound.play('level');
  }
  function endStep(dt) {
    if (!E || hidden('end')) return;
    const r = E.r; E.t += dt;
    const f = calm ? 1 : Math.min(1, Math.max(0, (E.t - .5) / 1.5)), ease = 1 - Math.pow(1 - f, 3), p = r.before + r.gain * ease;
    if (p !== E.p) {
      E.p = p; $('endBar').style.width = endFrac(p) * 100 + '%'; endText();
      const t = Sim.tierOf(p);
      if (t > E.tier) { E.tier = t; E.flip = 1; E.shine = -1; tierUp(t); }
    }
    if (E.flip > 0) { E.flip = Math.max(0, E.flip - dt * 1.05); if (E.flip <= 0) E.shine = 0; }
    if (E.flip < .75) E.draw = E.tier;
    E.ang = calm ? 0 : E.flip * TAU * 2 + Math.sin(E.t * .7) * .3;
    const id = r.me.champ, spr = Art.champCoin(id, r.me.team, E.draw, 130), g = $('endcoin').getContext('2d');
    g.clearRect(0, 0, 300, 300);
    spinCoin(g, spr, 150, 148, 130, E.ang);
    if (E.shine >= 0 && E.shine < 1) { E.shine += dt * 1.3; sweepCoin(g, 150, 148, 130, E.ang, Math.min(.99, E.shine)); }
  }
  // Rolling a new side always plays the coin flip.
  function enterLobby() {
    rollSide(); applySide(); renderLobby(); show('lobby');
    flipStart(L.team, lobbyEnter);
  }
  function backToLobby() {
    return wipe(() => { paused = false; G = null; Ctl.reset(); hide('end'); hide('pause'); hide('forge'); enterLobby(); Sound.setMode('menu'); });
  }
  function begin(reroll) {
    if (V.on || F.on || W.on) return false;
    if (!reroll) { versus(); return true; }
    // Play again: the flip decides the new side, then straight to the versus splash.
    rollSide(); applySide();
    flipStart(L.team, versus, true);
    hide('end');
    return true;
  }

  // ---------- wiring ----------
  function initMenus() {
    rollSeats(); applySide(); renderLobby(); syncToggles();
    stage.style.setProperty('--star', cssStar(16, .72));
    Hud.syncToggles = syncToggles;
    $('title').onclick = () => {
      Sound.init(); Sound.play('title'); Sound.setMode('menu');
      enterLobby(); hide('title');
    };
    $('flip').onclick = () => flipSkip();
    $('flip').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flipSkip(); } };
    document.querySelectorAll('#diff [data-d]').forEach(b => { b.onclick = () => { save.diff = b.dataset.d; persist(); Sound.play('tap'); renderLobby(); }; });
    $('openSet').onclick = () => { Sound.play('tap'); syncToggles(); show('settings'); };
    $('setDone').onclick = () => { Sound.play('tap'); hide('settings'); };
    $('sMusic').onclick = $('pMusic').onclick = () => toggle('music');
    $('sSfx').onclick = $('pSfx').onclick = () => toggle('sfx');
    document.querySelectorAll('#gfx [data-g]').forEach(b => { b.onclick = () => { save.gfx = b.dataset.g; persist(); if (save.gfx === 'auto') quality = 2; applyQuality(); Sound.play('tap'); syncToggles(); }; });
    $('auto').onclick = () => { autoFill(); Sound.play('coin'); renderLobby(); };
    $('start').onclick = () => { Sound.play('tap'); begin(false); };
    $('shDone').onclick = () => { Sound.play('tap'); hide('sheet'); L.sheet = null; };
    $('shSit').onclick = () => { if (!L.sheet) return; moveMe(L.sheet.i); hide('sheet'); L.sheet = null; renderLobby(); };
    $('resume').onclick = () => { paused = false; hide('pause'); Sound.play('tap'); };
    $('leave').onclick = () => { Sound.play('tap'); backToLobby(); };
    $('again').onclick = () => { Sound.play('tap'); begin(true); };
    $('tolobby').onclick = () => { Sound.play('tap'); backToLobby(); };
  }

  function animMenus(dt) { wipeStep(dt); flipStep(dt); vsStep(); titleStep(dt); heroStep(dt); endStep(dt); }

  return { initMenus, animMenus, showEnd };
})();
