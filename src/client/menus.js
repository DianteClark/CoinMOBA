// Title, main menu, how to play, online room and join, the coin flip, lobby, seat setup, versus splash, end screen and the coin wipe between them.
const { initMenus, animMenus, showEnd } = (() => {
  const ids = Object.keys(Sim.KITS), TIERS = Sim.TIERS;
  const BOT_NAMES = ['Penny', 'Florin', 'Ducat', 'Groat', 'Thaler', 'Guinea', 'Tanner', 'Sovereign', 'Bezant', 'Kopek'];
  const STATS = {
    vesper: { Damage: 5, Tough: 1, Speed: 2, Skill: 4 },
    kade: { Damage: 4, Tough: 3, Speed: 4, Skill: 5 },
    ione: { Damage: 4, Tough: 2, Speed: 2, Skill: 3 },
    solenne: { Damage: 2, Tough: 2, Speed: 3, Skill: 2 },
    sable: { Damage: 5, Tough: 1, Speed: 5, Skill: 5 },
    gravel: { Damage: 2, Tough: 5, Speed: 2, Skill: 2 },
  };
  const L = { seats: null, team: 0, slot: 0, sheet: null };
  // Online session. mode is 'host', 'guest' or null for a match against bots.
  const N = { mode: null, code: '', peer: false, joining: false, input: '', pairing: 'same', diff: 'normal', ready: { h: false, g: false }, seq: 0, ack: 0, lobby: false, side: 0, timer: 0, wasReady: false };
  const myWho = () => N.mode === 'host' ? 'h' : N.mode === 'guest' ? 'g' : null;
  const isMe = s => N.mode ? s.who === myWho() : !!s.human;
  const isFriend = s => !!N.mode && !!s.who && s.who !== myWho();
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const show = id => $(id).classList.remove('hide'), hide = id => $(id).classList.add('hide'), hidden = id => $(id).classList.contains('hide');
  const mine = () => L.seats[L.team][L.slot];
  const pipsHtml = n => `<span class="pips" role="img" aria-label="Fit ${n} of 3">${[0, 1, 2].map(i => `<i${i < n ? ' class="on"' : ''}></i>`).join('')}</span>`;
  const icons = {};
  const iconOf = (c, i) => icons[c + i + L.team] || (icons[c + i + L.team] = Art.iconURL(c, i, L.team));
  const seatTier = s => isMe(s) ? Sim.tierOf(pts(s.champ)) : s.tier;
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
      return pool.map((champ, i) => ({ champ, role: roles[i], tier: Math.min(5, Math.floor(Math.random() * Math.random() * 6)), human: false, name: names[n++], who: null }));
    });
    const me = mine(); me.human = true; me.name = 'You';
  }
  function setChamp(team, i, id) {
    const row = L.seats[team], s = row[i], other = row.find(o => o !== s && o.champ === id);
    if (other) other.champ = s.champ;
    s.champ = id;
    if (isMe(s)) { save.last = id; persist(); flipT = 1; }
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
  const friendSeat = () => { for (const row of L.seats) for (const s of row) if (isFriend(s)) return s; return null; };
  // On your own team the friend's champion and role are off limits.
  const friendHolds = (key, val) => !!N.mode && L.seats[L.team].some(o => isFriend(o) && o[key] === val);
  const buildCfg = () => ({ teams: L.seats.map(row => row.map(s => ({ champ: s.champ, role: s.role, tier: seatTier(s), human: s.human, name: s.name }))), diff: save.diff });
  const netCfg = () => ({ seed: (Date.now() ^ (Math.random() * 1e9)) & 0xffffff, diff: N.diff, teams: L.seats.map(row => row.map(s => ({ champ: s.champ, role: s.role, tier: seatTier(s), human: !!s.who, remote: s.who === 'g', name: s.name }))) });

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
      const taken = friendHolds('champ', cid);
      if (taken) { b.classList.add('taken'); b.setAttribute('aria-label', `${charName(L.team, cid)}, taken by your friend`); }
      b.onclick = () => { if (cid === id) return; if (taken) { Sound.play('cancel'); return; } setChamp(L.team, L.slot, cid); Sound.play('coin'); netPicked(); renderLobby(); };
      pk.append(b);
    });
    [0, 1].forEach(team => {
      const el = $('s' + team); el.textContent = '';
      L.seats[team].forEach((s, i) => {
        const me_ = isMe(s), fr = isFriend(s), d = document.createElement('div'); d.className = 'seat' + (me_ ? ' me' : '');
        const b = document.createElement('button'); b.className = 'seatc';
        b.setAttribute('aria-label', `${me_ ? 'Your seat' : fr ? 'Your friend' : s.name}, ${charName(team, s.champ)}, ${roleName(s.role)}`);
        b.append(coinCanvas(Art.champCoin(s.champ, team, seatTier(s), 46), 96));
        b.insertAdjacentHTML('beforeend', pipsHtml(Sim.KITS[s.champ].fit[s.role]));
        b.onclick = () => { if (N.mode && !me_) { Sound.play('tick'); return; } Sound.play('tap'); openSheet(team, i); };
        const chip = document.createElement('span'); chip.className = 'chip'; chip.textContent = roleName(s.role);
        d.append(b, chip);
        if (me_) { const y = document.createElement('span'); y.className = 'you'; y.textContent = 'You'; d.append(y); }
        else if (fr) { const y = document.createElement('span'), rd = friendReady(); y.className = 'you fr' + (rd ? ' yes' : '') + (rd && !N.wasReady ? ' pop' : ''); y.textContent = rd ? 'Ready!' : 'Friend'; d.append(y); }
        else if (team === L.team && !N.mode) { const sit = document.createElement('button'); sit.className = 'sit'; sit.textContent = 'Sit here'; sit.setAttribute('aria-label', `Sit in ${s.name}'s seat`); sit.onclick = () => { moveMe(i); renderLobby(); }; d.append(sit); }
        el.append(d);
      });
    });
    document.querySelectorAll('#diff [data-d]').forEach(b => b.setAttribute('aria-pressed', b.dataset.d === save.diff));
    lobbyNet();
  }
  const myReady = () => !!N.ready[myWho()];
  const friendReady = () => !!N.ready[N.mode === 'host' ? 'g' : 'h'];
  // The parts of the lobby that change when a friend is in it.
  function lobbyNet() {
    const net = !!N.mode, st = $('start');
    $('diff').classList.toggle('hide', net); $('lnet').classList.toggle('hide', !net); $('auto').classList.toggle('hide', net);
    if (!net) { st.textContent = 'Start match'; st.classList.remove('off', 'hot'); return; }
    const f = friendSeat(), rd = friendReady(), box = $('lnet'); box.textContent = '';
    if (f) {
      const t = L.seats.findIndex(r => r.includes(f));
      box.append(coinCanvas(Art.champCoin(f.champ, t, f.tier || 0, 30), 68));
      const nm = document.createElement('span'); nm.textContent = `Friend: ${charName(t, f.champ)}`;
      const tag = document.createElement('em'); tag.textContent = rd ? 'Ready!' : 'Picking'; if (rd && !N.wasReady) tag.className = 'yes'; else if (rd) { tag.className = 'yes'; tag.style.animation = 'none'; }
      const bots = document.createElement('span'); bots.textContent = `Bots: ${N.diff[0].toUpperCase()}${N.diff.slice(1)}`; bots.style.marginLeft = '6px';
      box.append(nm, tag, bots);
    }
    if (rd && !N.wasReady) Sound.play('clink');
    N.wasReady = rd;
    const mine_ = myReady(), both = mine_ && rd, hostGo = both && N.mode === 'host';
    st.textContent = hostGo ? 'Start match' : !mine_ ? "I'm ready" : both ? 'Waiting for host' : 'Waiting for friend';
    st.classList.toggle('off', mine_ && !hostGo); st.classList.toggle('hot', hostGo || !mine_);
  }
  function lobbyEnter() {
    const l = $('lobby'); l.classList.remove('enter'); void l.offsetWidth; l.classList.add('enter');
    setTimeout(() => l.classList.remove('enter'), 900);
  }

  // ---------- seat sheet ----------
  function openSheet(team, i) { L.sheet = { team, i }; renderSheet(); show('sheet'); }
  function renderSheet() {
    const { team, i } = L.sheet, s = L.seats[team][i];
    $('shT').innerHTML = `${isMe(s) ? 'Your seat' : s.name}<small>${Sim.TEAM_NAMES[team]}, ${charName(team, s.champ)}</small>`;
    $('shSit').classList.toggle('hide', isMe(s) || team !== L.team || !!N.mode);
    const c = $('shC'); c.textContent = '';
    ids.forEach(id => {
      const k = Sim.KITS[id], nm = charName(team, id), b = document.createElement('button'); b.className = 'schamp'; b.setAttribute('aria-pressed', id === s.champ);
      b.setAttribute('aria-label', `${nm}, fit ${k.fit[s.role]} of 3 for ${roleName(s.role)}`);
      b.append(coinCanvas(Art.champCoin(id, team, isMe(s) ? Sim.tierOf(pts(id)) : s.tier, 46), 100));
      b.insertAdjacentHTML('beforeend', `<span>${nm}</span>${pipsHtml(k.fit[s.role])}`);
      const taken = friendHolds('champ', id);
      if (taken) { b.classList.add('taken'); b.style.opacity = .45; }
      b.onclick = () => { if (taken) { Sound.play('cancel'); return; } setChamp(team, i, id); Sound.play('coin'); netPicked(); renderSheet(); renderLobby(); };
      c.append(b);
    });
    const r = $('shR'); r.textContent = '';
    Sim.ROLES.forEach(role => {
      const info = Sim.ROLE_INFO[role], fit = Sim.KITS[s.champ].fit[role], b = document.createElement('button'); b.setAttribute('aria-pressed', role === s.role);
      const holder = L.seats[team].find(o => o !== s && o.role === role);
      const taken = !!holder && isFriend(holder);
      if (taken) b.style.opacity = .45;
      b.setAttribute('aria-label', `${info.name}, fit ${fit} of 3${taken ? ', your friend has this role' : holder ? `, swaps with ${holder.name}` : ''}`);
      b.innerHTML = `<span><b>${info.name}</b><small>${info.blurb}</small></span>${pipsHtml(fit)}`;
      b.onclick = () => { if (taken) { Sound.play('cancel'); return; } setRole(team, i, role); Sound.play('tap'); netPicked(); renderSheet(); renderLobby(); };
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
  const T = { t: 0, face: 0, p: -1, shown: -1, sparks: null, hold: 1.25 };
  function titleStep(dt) {
    const onTitle = !hidden('title'), onMenu = !onTitle && !hidden('menu');
    if (!onTitle && !onMenu) return;
    if (onTitle) fitTitle();
    const c = $(onTitle ? 'tcan' : 'mcan'), k = Math.min(devicePixelRatio || 1, 2), w = Math.round(VW * k), h = Math.round(VH * k);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = c.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0); g.clearRect(0, 0, VW, VH);
    const cx = onTitle ? VW * .29 : VW * .235, cy = VH * .5, R = onTitle ? Math.min(VH * .4, VW * .23) : Math.min(VH * .37, VW * .185), HOLD = T.hold, DUR = .7;
    if (!T.sparks) T.sparks = Array.from({ length: 7 }, (_, i) => ({ a: i * 1.05, d: 1.25 + (i % 3) * .14, p: i * .9 }));
    if (!calm) T.t += dt;
    let ang = T.face * Math.PI, hop = 0, sq = 1;
    if (!calm) {
      if (T.t > HOLD + DUR) { T.t = 0; T.face = (T.face + 3) % 2; ang = T.face * Math.PI; }
      else if (T.t > HOLD) { const p = (T.t - HOLD) / DUR, e = 1 - Math.pow(1 - p, 3); ang = (T.face + 3 * e) * Math.PI; hop = Math.sin(p * Math.PI) * R * .3; sq = 1 + Math.sin(p * Math.PI) * .12; }
      else if (T.t < .14) sq = 1 + (1 - T.t / .14) * .08;
    }
    const shown = Math.cos(ang) >= 0 ? 0 : 1;
    if (shown !== T.shown) { T.shown = shown; for (const id of ['title', 'menu']) { $(id).classList.toggle('s0', !shown); $(id).classList.toggle('s1', !!shown); } }
    // burst behind the coin
    g.save(); g.translate(cx, cy - hop); g.rotate(T.t * .25 + T.face * .2); Comic.starPath(g, 18, R * 1.25 * sq, R * 1.04); g.fillStyle = Comic.INK; g.fill(); Comic.starPath(g, 18, R * 1.19 * sq, R * .98); g.fillStyle = shown ? Comic.TOXIC : Comic.SUN; g.fill(); g.restore();
    Comic.flip(g, cx, cy - hop, R * sq, ang, 230);
    if (onMenu) { const m = $('mplay').getContext('2d'); m.setTransform(1, 0, 0, 1, 0, 0); m.clearRect(0, 0, 160, 160); Comic.flip(m, 80, 80, 66, ang + Math.PI, 120, -.12); }
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
    Sound.play('flipSpin');
    flipDraw(0);
  }
  function flipImpact() {
    F.slam = 1;
    Sound.play('flipSlam'); Sound.play('flipReveal', F.side);
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
      if (Math.floor(e * turns) !== F.tick) { F.tick = Math.floor(e * turns); }
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
  const V = { on: false, t0: 0, stage: 0, after: 0, outAt: 0, cfg: null };
  function renderVs() {
    [0, 1].forEach(team => {
      const el = $('vs' + team); el.textContent = '';
      L.seats[team].forEach((s, i) => {
        const d = document.createElement('div'); d.className = 'vcell'; d.style.setProperty('--i', i);
        const cv = document.createElement('canvas'); cv.width = cv.height = 168;
        Hud.coinTo(cv, Art.champCoin(s.champ, team, seatTier(s), 80));
        const b = document.createElement('b'); b.textContent = charName(team, s.champ);
        d.append(cv, b);
        if (isMe(s)) { const y = document.createElement('i'); y.textContent = 'You'; d.append(y); }
        else if (isFriend(s)) { const y = document.createElement('i'); y.textContent = 'Friend'; d.append(y); }
        el.append(d);
      });
    });
  }
  function versus(cfg) {
    renderVs(); $('vs').classList.remove('out'); show('vs');
    V.cfg = cfg || null;
    Object.assign(V, { on: true, t0: performance.now(), stage: 0, after: 0, outAt: 0 });
    Sound.play('whoosh');
  }
  function vsStep() {
    if (!V.on) return;
    const now = performance.now(), t = (now - V.t0) / 1000;
    if (V.stage === 0 && t > .42) { V.stage = 1; Sound.play('versus'); }
    // The halves are closed by now, so the slow map paint happens out of sight.
    if (V.stage === 1 && t > .66) {
      V.stage = 2; hide('lobby'); hide('end'); hide('title'); hide('flip'); hide('sheet');
      if (N.mode) startMatch(V.cfg, { role: N.mode }); else startMatch(buildCfg());
      Sound.setMode('match');
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
    const st = Object.assign({ kills: 0, deaths: 0, assists: 0, skillHits: 0, casts: 0, parries: 0 }, r.me.stats), tier = Sim.tierOf(r.before);
    hide('forge'); hide('pause'); Ctl.reset();
    L.team = r.me.team; applySide();
    $('again').textContent = N.mode ? 'Back to room' : 'Play again';
    $('again').classList.toggle('hide', N.mode === 'guest' && !N.peer);
    $('end').classList.toggle('win', r.won); $('end').classList.toggle('lose', !r.won);
    $('endT').textContent = r.won ? 'Victory!' : 'Defeat';
    $('endT').style.color = '';
    $('endW').textContent = r.s.over.winner === 0 ? 'City saved' : 'City fallen';
    const pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    $('endS').textContent = `${pl(st.kills, 'takedown')}, ${pl(st.deaths, 'death')}, ${pl(st.assists, 'assist')}. ${st.skillHits} of ${pl(st.casts, 'ability').replace('abilitys', 'abilities').replace(/^\d+ /, '')} landed${st.parries ? `, ${pl(st.parries, 'hit')} parried` : ''}.`;
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
  function begin(reroll) {
    if (V.on || F.on || W.on) return false;
    if (N.mode) { const cfg = netCfg(); Net.send('lobby', stateMsg()); Net.start(cfg); versus(cfg); return true; }
    if (!reroll) { versus(); return true; }
    // Play again: the flip decides the new side, then straight to the versus splash.
    rollSide(); applySide();
    flipStart(L.team, () => versus(), true);
    hide('end');
    return true;
  }

  // ---------- screens ----------
  let curScr = null;
  function scr(id) {
    if (curScr === id) return;
    const out = curScr; curScr = id;
    if (out) { const o = $(out); o.classList.remove('in'); o.classList.add('out'); setTimeout(() => { if (curScr !== out) o.classList.add('hide'); o.classList.remove('out'); }, 170); }
    if (id) { const e = $(id); e.classList.remove('hide', 'out', 'in'); void e.offsetWidth; e.classList.add('in'); }
  }
  function shake(el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); setTimeout(() => el.classList.remove('shake'), 320); }
  function flash(btn, text) { if (!btn.dataset.t0) btn.dataset.t0 = btn.textContent; btn.textContent = text; clearTimeout(btn._t); btn._t = setTimeout(() => { btn.textContent = btn.dataset.t0; delete btn.dataset.t0; }, 1500); }
  // Some exits lose a game for a friend, so they ask for a second tap.
  function twoTap(btn, warn, needed, fn) {
    const label = btn.innerHTML;
    btn.onclick = () => {
      Sound.play('tap');
      if (!needed() || btn.classList.contains('warn')) { clearTimeout(btn._w); btn.classList.remove('warn'); btn.innerHTML = label; fn(); return; }
      btn.classList.add('warn'); btn.textContent = warn;
      btn._w = setTimeout(() => { btn.classList.remove('warn'); btn.innerHTML = label; }, 2400);
    };
  }
  function notice(title, msg, btn, fn) {
    $('nT').textContent = title; $('nM').textContent = msg;
    const b = $('nB'); b.textContent = btn || 'Back to menu';
    b.onclick = () => { Sound.play('tap'); hide('notice'); (fn || toMenu)(); };
    show('notice'); Sound.play('cancel');
  }
  function clearAll() {
    for (const id of ['lobby', 'end', 'pause', 'forge', 'sheet', 'settings', 'notice', 'flip', 'vs']) hide(id);
    $('flip').classList.remove('out'); $('vs').classList.remove('out');
    V.on = false; F.on = false; F.done = null; L.sheet = null;
  }
  function toMenu() {
    const go = () => { netDrop(); paused = false; G = null; Ctl.reset(); clearAll(); scr('menu'); Sound.setMode('menu'); };
    if (!wipe(go)) go();
  }

  // ---------- online: connection ----------
  const hasNet = () => typeof Net !== 'undefined' && !!Net && typeof Net.on === 'function';
  function noNet() { notice('Online play is off', "This copy of the game can't reach the internet. Bots are always up for a match."); }
  function netDrop() {
    clearTimeout(N.timer);
    const was = N.mode;
    N.mode = null; N.peer = false; N.joining = false; N.lobby = false; N.seq = 0; N.ack = 0; N.wasReady = false; N.ready = { h: false, g: false };
    if (was && hasNet()) { try { Net.leave(); } catch (e) { } }
  }
  const inviteUrl = () => location.href.split('#')[0] + '#' + N.code;
  const roomMsg = () => ({ k: 'room', pairing: N.pairing, diff: N.diff });
  function say(obj) { if (N.mode && hasNet()) { try { Net.send('lobby', obj); } catch (e) { } } }
  function wireNet() {
    if (!hasNet()) return;
    Net.on('open', code => {
      if (N.mode === 'host') { N.code = code || Net.code || ''; renderRoom(); return; }
      if (N.mode === 'guest' && N.joining && Net.connected) guestIn();
    });
    Net.on('peer', () => {
      if (N.mode === 'host') { N.peer = true; N.left = false; if (N.lobby || !hidden('end')) return; renderRoom(); say(roomMsg()); Sound.play('friendJoin'); }
      else if (N.mode === 'guest') guestIn();
    });
    Net.on('lost', reason => {
      if (!N.mode) return;
      N.peer = false; N.ready = { h: false, g: false };
      if (G && !G.ended) {
        if (N.mode === 'host') { Hud.banner('Your friend left', { pri: 7, sub: 'A bot took over their seat', hot: true, dur: 3 }); return; }
        notice('The host left', "The match can't go on without them.");
        return;
      }
      if (!hidden('end')) { if (N.mode === 'guest') $('again').classList.add('hide'); return; }
      // The host's room stays open, so a friend can drop back in with the same code.
      if (N.mode === 'host') {
        N.left = true;
        if (curScr === 'room' && !N.lobby) { renderRoom(); Sound.play('friendLeave'); return; }
        notice('Your friend left', 'Your room is still open. They can rejoin with the same code.', 'Back to room', backToRoom);
        return;
      }
      notice('The host left', reason && !/match is over/.test(reason) ? reason : 'The room has closed. Ask your friend for a new code.');
    });
    Net.on('error', msg => {
      if (N.joining) { joinFail(msg); return; }
      if (!N.mode) return;
      notice('Connection trouble', msg || 'Something went wrong with the connection.');
    });
    Net.on('lobby', onLobby);
    Net.on('stall', v => { if (G && !G.ended && v) Hud.banner('Waiting for the host', { pri: 3, sub: 'Weak connection', dur: 1.6 }); });
    Net.on('away', v => { if (G && !G.ended) Hud.banner(v ? 'Your friend stepped away' : 'Your friend is back', { pri: 3, sub: v ? 'A bot is filling in' : '', dur: 1.8 }); });
    Net.on('flip', o => {
      if (N.mode !== 'guest') return;
      N.side = o.side;
      L.team = N.pairing === 'same' ? o.side : 1 - o.side;
      playNetFlip();
    });
    Net.on('start', cfg => {
      if (N.mode !== 'guest') return;
      N.lobby = false;
      L.seats = cfg.teams.map(row => row.map(s => Object.assign({}, s, { who: s.human ? (s.remote ? 'g' : 'h') : null })));
      L.seats.forEach((r, t) => r.forEach((s, i) => { if (s.who === 'g') { L.team = t; L.slot = i; } }));
      applySide(); hide('sheet'); L.sheet = null; hide('settings');
      versus(cfg);
    });
  }
  function onLobby(o) {
    if (!o || !N.mode) return;
    if (o.k === 'hello' && N.mode === 'host') { say(roomMsg()); }
    else if (o.k === 'room' && N.mode === 'guest') { N.pairing = o.pairing; N.diff = o.diff; if (curScr === 'room') renderRoom(); }
    else if (o.k === 'state' && N.mode === 'guest') applyState(o);
    else if (o.k === 'pick' && N.mode === 'host') hostPick(o);
  }

  // ---------- online: seats ----------
  // The best role spread for the bots around whatever the humans picked.
  function refitBots(team) {
    const row = L.seats[team], bots = row.filter(s => !s.who), free = Sim.ROLES.filter(r => !row.some(s => s.who && s.role === r));
    let best = null, top = -1;
    (function rec(i, left, picked, sc) {
      if (i === bots.length) { if (sc > top) { top = sc; best = picked.slice(); } return; }
      left.forEach((r, n) => { picked.push(r); rec(i + 1, left.filter((_, m) => m !== n), picked, sc + Sim.KITS[bots[i].champ].fit[r]); picked.pop(); });
    })(0, free, [], 0);
    if (best) bots.forEach((s, i) => { s.role = best[i]; });
  }
  function rollNetSeats(side) {
    const names = shuffle(BOT_NAMES.slice()), gTeam = N.pairing === 'same' ? side : 1 - side, want = ids.includes(save.last) ? save.last : ids[0];
    let n = 0;
    L.seats = [0, 1].map(team => {
      const pool = shuffle(ids.slice()).slice(0, 4), humans = [];
      if (team === side) { humans.push('h'); const at = pool.indexOf(want); if (at >= 0) [pool[at], pool[0]] = [pool[0], pool[at]]; else pool[0] = want; }
      if (team === gTeam) humans.push('g');
      const roles = Sim.autoRoles(pool);
      return pool.map((champ, i) => {
        const who = humans[i] || null;
        return { champ, role: roles[i], tier: who ? 0 : Math.min(5, Math.floor(Math.random() * Math.random() * 6)), human: !!who, name: who === 'h' ? 'Host' : who === 'g' ? 'Guest' : names[n++], who };
      });
    });
    L.team = side; L.slot = 0;
  }
  function stateMsg() {
    for (const row of L.seats) for (const s of row) if (isMe(s)) s.tier = seatTier(s);
    return { k: 'state', seats: L.seats, ready: N.ready, pairing: N.pairing, diff: N.diff, side: N.side, ack: N.ack };
  }
  // A change on this phone: the host refits the bots and tells the guest, the guest tells the host.
  function netPicked() {
    if (!N.mode) return;
    if (N.mode === 'host') { N.ready.h = false; refitBots(L.team); say(stateMsg()); }
    else { N.ready.g = false; sendPick(); }
  }
  function sendPick() { const m = mine(); N.seq++; say({ k: 'pick', seq: N.seq, champ: m.champ, role: m.role, tier: seatTier(m), ready: N.ready.g }); }
  function hostPick(o) {
    N.ack = o.seq;
    let team = -1, i = -1;
    L.seats.forEach((r, t) => r.forEach((s, x) => { if (s.who === 'g') { team = t; i = x; } }));
    if (team < 0) return;
    const row = L.seats[team], g = row[i], blocked = (key, v) => row.some(o2 => o2 !== g && o2.who && o2[key] === v);
    if (ids.includes(o.champ) && !blocked('champ', o.champ)) setChamp(team, i, o.champ);
    if (Sim.ROLES.includes(o.role) && !blocked('role', o.role)) setRole(team, i, o.role);
    g.tier = Math.max(0, Math.min(5, o.tier | 0));
    refitBots(team);
    N.ready.g = !!o.ready;
    say(stateMsg());
    if (N.lobby) { renderLobby(); if (L.sheet) renderSheet(); }
  }
  function applyState(o) {
    const had = L.seats && N.lobby ? mine() : null, keep = had && o.ack < N.seq ? { champ: had.champ, role: had.role, ready: N.ready.g } : null;
    L.seats = o.seats; N.ready = o.ready; N.pairing = o.pairing; N.diff = o.diff; N.side = o.side;
    L.seats.forEach((r, t) => r.forEach((s, i) => { if (s.who === 'g') { L.team = t; L.slot = i; } }));
    if (keep) { const m = mine(); m.champ = keep.champ; m.role = keep.role; N.ready.g = keep.ready; }
    applySide();
    if (N.lobby) { renderLobby(); if (L.sheet) renderSheet(); }
  }
  function playNetFlip() {
    N.lobby = false; N.wasReady = false; N.ready = { h: false, g: false };
    hide('sheet'); hide('settings'); hide('end'); L.sheet = null;
    applySide();
    flipStart(L.team, () => {
      scr(null); N.lobby = true; renderLobby(); show('lobby'); lobbyEnter();
      if (N.mode === 'guest') {
        const m = mine(), want = save.last;
        if (ids.includes(want) && want !== m.champ && !friendHolds('champ', want)) { setChamp(L.team, L.slot, want); renderLobby(); }
        sendPick();
      }
    });
  }
  function hostFlip() {
    if (!N.peer) { shake($('rFlip')); Sound.play('cancel'); return; }
    if (F.on || W.on) return;
    N.side = Math.random() < .5 ? 0 : 1;
    rollNetSeats(N.side);
    N.ready = { h: false, g: false };
    say(roomMsg()); say(stateMsg());
    Net.flip(N.side);
    playNetFlip();
  }
  function lobbyStartTap() {
    if (!N.mode) { Sound.play('tap'); begin(false); return; }
    if (N.mode === 'host' && myReady() && friendReady()) { Sound.play('confirm'); begin(false); return; }
    const k = myWho(); N.ready[k] = !N.ready[k];
    Sound.play(N.ready[k] ? 'clink' : 'tap');
    if (N.mode === 'host') say(stateMsg()); else sendPick();
    renderLobby();
    if (N.ready[k]) { const b = $('start'); b.style.animation = 'none'; void b.offsetWidth; b.style.animation = 'pop .3s ease-out'; setTimeout(() => { b.style.animation = ''; }, 320); }
  }

  // ---------- online: room ----------
  const DOTS = '<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>';
  function roomCoin(host, side, title, sub, joined) {
    host.textContent = ''; host.classList.toggle('joined', !!joined);
    if (side === null) { const q = document.createElement('div'); q.className = 'rq'; q.textContent = '?'; host.append(q); }
    else { const c = document.createElement('canvas'); c.width = c.height = 120; Hud.coinTo(c, Comic.face(side, 120)); host.append(c); }
    const t = document.createElement('div'), b = document.createElement('b'), sm = document.createElement('small');
    b.textContent = title; sm.textContent = sub; t.append(b, sm); host.append(t);
  }
  let peerShown = false;
  function renderRoom() {
    const isHost = N.mode === 'host';
    $('rH').textContent = isHost ? 'Your room' : "Friend's room";
    $('rCode').textContent = N.code || '- - - - -';
    $('rLink').textContent = N.code ? inviteUrl().replace(/^[a-z]+:\/+/, '') : '';
    for (const id of ['rCopy', 'rShare', 'rLink']) $(id).classList.toggle('hide', !isHost);
    $('rCopy').disabled = $('rShare').disabled = !N.code;
    const peerNew = N.peer && !peerShown; peerShown = N.peer;
    roomCoin($('rMe'), isHost ? 0 : 1, 'You', isHost ? 'Host' : 'Joined');
    if (N.peer) roomCoin($('rFr'), isHost ? 1 : 0, isHost ? 'Friend' : 'Host', 'Connected', peerNew);
    else roomCoin($('rFr'), null, 'Friend', 'Not here yet');
    $('rStat').innerHTML = !isHost ? `Connected! Waiting for the host to flip${DOTS}`
      : !N.code ? `Opening your room${DOTS}`
        : !N.peer ? `Send the code to a friend. Waiting for them${DOTS}`
          : 'Your friend is here. Pick teams, then flip!';
    if (isHost && N.code && !N.peer && N.left) $('rStat').innerHTML = `Your friend left. They can rejoin with this code${DOTS}`;
    document.querySelectorAll('#rTeam [data-t]').forEach(b => b.setAttribute('aria-pressed', b.dataset.t === N.pairing));
    document.querySelectorAll('#rDiff [data-d]').forEach(b => b.setAttribute('aria-pressed', b.dataset.d === N.diff));
    $('rTeam').classList.toggle('ro', !isHost); $('rDiff').classList.toggle('ro', !isHost);
    $('rWith').textContent = N.pairing === 'same' ? '+' : 'vs';
    const f = $('rFlip');
    f.textContent = !isHost ? 'Host flips the coin' : N.peer ? 'Flip for sides' : 'Waiting for friend';
    f.classList.toggle('off', !isHost || !N.peer); f.classList.toggle('hot', isHost && N.peer);
  }
  function openRoom() {
    N.lobby = false; N.ready = { h: false, g: false }; N.wasReady = false; peerShown = false;
    stage.classList.toggle('s0', L.team === 0); stage.classList.toggle('s1', L.team === 1);
    renderRoom(); scr('room');
  }
  function startHost() {
    if (!hasNet()) { noNet(); return; }
    netDrop();
    N.mode = 'host'; N.code = ''; N.peer = false; N.left = false; N.pairing = 'same'; N.diff = save.diff;
    openRoom();
    try { Net.host(); } catch (e) { notice('Connection trouble', "We couldn't open a room just now. Try again in a moment."); }
  }
  function backToRoom() {
    const go = () => { paused = false; G = null; Ctl.reset(); clearAll(); Sound.setMode('menu'); openRoom(); };
    if (!wipe(go)) go();
  }
  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch (e) { }
    try {
      const a = document.createElement('textarea'); a.value = t; a.style.cssText = 'position:fixed;opacity:0;-webkit-user-select:text;user-select:text';
      document.body.append(a); a.select(); const ok = document.execCommand('copy'); a.remove(); return ok;
    } catch (e) { return false; }
  }
  async function copyBtn(btn, text, done) {
    const ok = await copyText(text);
    Sound.play(ok ? 'coin' : 'cancel'); flash(btn, ok ? done : 'Copy failed');
  }

  // ---------- online: join ----------
  const CODE_RE = /^[2-9A-HJKMNP-TV-Z]{5}$/;
  const clean = t => t.toUpperCase().replace(/[^2-9A-HJKMNP-TV-Z]/g, '');
  function codeIn(text) {
    const t = String(text || '').trim(), h = t.match(/#([A-Za-z0-9]{5})\b/);
    if (h && CODE_RE.test(h[1].toUpperCase())) return h[1].toUpperCase();
    const c = clean(t);
    return t.length <= 8 && c.length === 5 ? c : '';
  }
  function hashCode() { const h = location.hash.slice(1).toUpperCase(); return CODE_RE.test(h) ? h : ''; }
  function eatHash() { try { history.replaceState(null, '', location.href.split('#')[0]); } catch (e) { } }
  function setJoin(msg, bad, busy) { const m = $('jMsg'); m.className = 'jmsg' + (bad ? ' bad' : ''); m.innerHTML = msg + (busy ? DOTS : ''); }
  function renderJoin(popped) {
    const box = $('jSlots'); box.textContent = '';
    for (let i = 0; i < 5; i++) { const c = document.createElement('i'); c.textContent = N.input[i] || ''; if (i === N.input.length && !N.joining) c.className = 'cur'; if (popped && i === N.input.length - 1) c.className = 'pop'; box.append(c); }
    box.setAttribute('aria-label', `Code: ${N.input.split('').join(' ') || 'empty'}`);
    const go = $('jGo'); go.classList.toggle('off', N.input.length < 5 || N.joining); go.classList.toggle('hot', N.input.length === 5 && !N.joining);
    go.textContent = N.joining ? 'Joining' : 'Join';
  }
  function openJoin(code) {
    N.input = code || ''; N.joining = false;
    setJoin(code ? 'Invite found. Tap Join!' : 'Type the 5-character code your friend sent you');
    renderJoin(); clearAll(); scr('joinS');
  }
  function press(ch) { if (N.joining || N.input.length >= 5) return; N.input += ch; Sound.play('tap'); setJoin(N.input.length === 5 ? 'Ready when you are' : ''); renderJoin(true); }
  function rub() { if (N.joining || !N.input) return; N.input = N.input.slice(0, -1); Sound.play('tick'); setJoin(''); renderJoin(); }
  function fillCode(text) {
    const c = codeIn(text);
    if (c) { N.input = c; Sound.play('coin'); setJoin('Got it. Tap Join!'); renderJoin(true); }
    else { setJoin("That doesn't look like a room code", true); Sound.play('cancel'); }
  }
  async function pasteTap() {
    Sound.play('tap');
    try { fillCode(await navigator.clipboard.readText()); }
    catch (e) { setJoin("Your browser blocked paste. Tap the letters instead.", true); }
  }
  function joinGo() {
    if (N.joining) return;
    if (N.input.length < 5) { shake($('jSlots')); Sound.play('cancel'); return; }
    if (!hasNet()) { noNet(); return; }
    netDrop();
    Sound.play('whoosh');
    N.mode = 'guest'; N.code = N.input; N.joining = true; N.peer = false;
    setJoin('Connecting to your friend', false, true); renderJoin();
    clearTimeout(N.timer);
    N.timer = setTimeout(() => { if (N.joining) joinFail("We couldn't reach that room. Check the code and try again."); }, 20000);
    try { Net.join(N.input); } catch (e) { joinFail("We couldn't start the connection. Try again."); }
  }
  function joinFail(msg) {
    netDrop();
    setJoin(msg || "We couldn't reach that room. Check the code and try again.", true);
    renderJoin(); shake($('jSlots')); Sound.play('cancel');
  }
  function guestIn() {
    if (N.mode !== 'guest' || !N.joining) return;
    clearTimeout(N.timer);
    N.joining = false; N.peer = true;
    N.pairing = 'same'; N.diff = 'normal';
    openRoom(); Sound.play('friendJoin');
    say({ k: 'hello' });
  }
  function buildKeypad() {
    const kb = $('kb');
    for (const row of ['23456789', 'QWERTYP', 'ASDFGHJK', 'ZXCVBNM']) {
      const r = document.createElement('div'); r.className = 'kr';
      for (const ch of row) { const b = document.createElement('button'); b.textContent = ch; b.onclick = () => press(ch); r.append(b); }
      if (row[0] === 'Z') {
        const b = document.createElement('button'); b.className = 'wide'; b.setAttribute('aria-label', 'Delete');
        b.innerHTML = '<svg viewBox="0 0 34 24" aria-hidden="true"><path d="M11 2h20a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H11L2 12z" fill="none" stroke="#14102a" stroke-width="3" stroke-linejoin="round"/><path d="m16 8 9 8m0-8-9 8" stroke="#14102a" stroke-width="3" stroke-linecap="round"/></svg>';
        b.onclick = rub; r.append(b);
      }
      kb.append(r);
    }
    addEventListener('keydown', e => {
      if (curScr !== 'joinS' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Backspace') { e.preventDefault(); rub(); }
      else if (e.key === 'Enter') { e.preventDefault(); joinGo(); }
      else if (e.key.length === 1 && clean(e.key)) press(e.key.toUpperCase());
    });
    addEventListener('paste', e => { if (curScr === 'joinS') { e.preventDefault(); fillCode(e.clipboardData.getData('text')); } });
  }

  // ---------- how to play: five little comic panels ----------
  let howDone = false;
  function buildHow() {
    if (howDone) return; howDone = true;
    const { INK, PAPER, SUN, ULTRA, ULTRA2, VIOLET, TOXIC, BLOOD } = Comic, W_ = 360, H_ = 380, OY = 58;
    const blitS = (g, spr, x, y, r) => { const h = spr.S * r / spr.R; g.drawImage(spr.c, x - h / 2, y - h / 2, h, h); };
    // Each panel shouts its sound effect across the top, then the 360 by 270 scene below.
    const page = (id, fill, word, wc, draw) => {
      const c = $(id), g = c.getContext('2d');
      g.fillStyle = fill; g.fillRect(0, 0, W_, H_);
      g.fillStyle = 'rgba(20,16,42,.13)'; for (let y = 0, j = 0; y < H_; y += 13, j++) for (let x = j % 2 ? 6 : 0; x < W_; x += 13) { const f = y / H_; g.beginPath(); g.arc(x, y, 4.4 * f, 0, TAU); g.fill(); }
      g.lineJoin = 'round'; g.lineCap = 'round'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.save(); g.translate(W_ / 2, 44); g.rotate(-.05);
      g.font = Comic.disp(58); g.fillStyle = INK; g.fillText(word, 4, 5); g.lineWidth = 11; g.strokeStyle = INK; g.strokeText(word, 0, 0); g.fillStyle = wc; g.fillText(word, 0, 0);
      g.restore();
      g.translate(0, OY + 26);
      draw(g);
    };
    const coinShadow = (g, x, y, r) => { g.fillStyle = 'rgba(20,16,42,.3)'; g.beginPath(); g.ellipse(x, y + r * .95, r * .9, r * .28, 0, 0, TAU); g.fill(); };
    const lines = (g, pts_, w = 7) => { g.strokeStyle = INK; g.lineWidth = w; g.beginPath(); for (const [x0, y0, x1, y1] of pts_) { g.moveTo(x0, y0); g.lineTo(x1, y1); } g.stroke(); };
    const arrow = (g, x0, y0, x1, y1, col) => {
      const a = Math.atan2(y1 - y0, x1 - x0), L_ = 34, w = 19, tip = (o, stroke) => { g.beginPath(); g.moveTo(x1 + o, y1 + o); g.lineTo(x1 + o - Math.cos(a - .55) * L_, y1 + o - Math.sin(a - .55) * L_); g.lineTo(x1 + o - Math.cos(a + .55) * L_, y1 + o - Math.sin(a + .55) * L_); g.closePath(); g.fillStyle = stroke; g.fill(); };
      g.strokeStyle = INK; g.lineWidth = 15; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 - Math.cos(a) * 18, y1 - Math.sin(a) * 18); g.stroke();
      g.strokeStyle = col; g.lineWidth = 8; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 - Math.cos(a) * 18, y1 - Math.sin(a) * 18); g.stroke();
      tip(4, INK); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 - Math.cos(a - .55) * L_, y1 - Math.sin(a - .55) * L_); g.lineTo(x1 - Math.cos(a + .55) * L_, y1 - Math.sin(a + .55) * L_); g.closePath(); g.fillStyle = col; g.fill(); g.strokeStyle = INK; g.lineWidth = 5; g.stroke();
    };
    const thumb = (g, x, y, ang) => { g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = '#ffd0a0'; g.strokeStyle = INK; g.lineWidth = 7; g.beginPath(); g.moveTo(-34, 150); g.lineTo(-34, 16); g.quadraticCurveTo(-34, -26, 0, -26); g.quadraticCurveTo(34, -26, 34, 16); g.lineTo(34, 150); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#fff3e4'; g.beginPath(); g.ellipse(0, -8, 17, 13, 0, 0, TAU); g.fill(); g.lineWidth = 3.5; g.stroke(); g.restore(); };

    page('h1', '#a8dcff', 'ZOOM!', '#fff', g => {
      coinShadow(g, 250, 104, 56);
      lines(g, [[120, 66, 168, 66], [100, 104, 160, 104], [120, 142, 168, 142]], 8);
      blitS(g, Art.champCoin('kade', 0, 2, 60), 250, 104, 58);
      g.fillStyle = 'rgba(20,16,42,.3)'; g.beginPath(); g.arc(112, 200, 58, 0, TAU); g.fill();
      g.strokeStyle = INK; g.lineWidth = 8; g.beginPath(); g.arc(112, 200, 58, 0, TAU); g.stroke();
      g.strokeStyle = '#fff'; g.lineWidth = 3.5; g.beginPath(); g.arc(112, 200, 58, 0, TAU); g.stroke();
      g.fillStyle = SUN; g.strokeStyle = INK; g.lineWidth = 6; g.beginPath(); g.arc(148, 186, 26, 0, TAU); g.fill(); g.stroke();
      thumb(g, 153, 196, .35);
    });
    page('h2', '#ffc9a8', 'POW!', SUN, g => {
      coinShadow(g, 110, 84, 48);
      blitS(g, Art.champCoin('gravel', 1, 2, 50), 106, 82, 50);
      g.save(); g.translate(180, 112); Comic.starPath(g, 9, 46, 21, .2); g.fillStyle = INK; g.translate(3, 4); g.fill(); g.translate(-3, -4); Comic.starPath(g, 9, 42, 19, .2); g.fillStyle = BLOOD; g.fill(); g.strokeStyle = INK; g.lineWidth = 4; g.stroke(); g.restore();
      g.fillStyle = INK; g.beginPath(); g.arc(268, 186, 70, 0, TAU); g.fill();
      blitS(g, Art.champCoin('kade', 0, 2, 66), 265, 182, 66);
      g.strokeStyle = SUN; g.lineWidth = 6; g.beginPath(); g.arc(265, 182, 78, -2.5, -.3); g.stroke();
      thumb(g, 292, 214, -.28);
    });
    page('h3', '#cdb6ff', 'FWIP!', '#fff', g => {
      g.setLineDash([20, 15]); g.strokeStyle = INK; g.lineWidth = 11; g.beginPath(); g.moveTo(236, 196); g.lineTo(84, 88); g.stroke();
      g.strokeStyle = '#fff'; g.lineWidth = 5.5; g.stroke(); g.setLineDash([]);
      g.save(); g.translate(72, 80); g.strokeStyle = INK; g.lineWidth = 15; g.beginPath(); g.moveTo(-22, -22); g.lineTo(22, 22); g.moveTo(22, -22); g.lineTo(-22, 22); g.stroke(); g.strokeStyle = BLOOD; g.lineWidth = 7; g.stroke(); g.restore();
      const abil = Art.abilityCoin('kade', 0, true, 40), d = 112; g.fillStyle = INK; g.beginPath(); g.arc(255, 213, 54, 0, TAU); g.fill();
      g.drawImage(abil, 252 - d / 2 * 1.04, 210 - d / 2 * 1.04, d * 1.04, d * 1.04);
      g.save(); g.translate(286, 64); g.rotate(-.1); Comic.starPath(g, 13, 68, 56, .12); g.fillStyle = INK; g.translate(3, 4); g.fill(); g.translate(-3, -4); Comic.starPath(g, 13, 64, 53, .12); g.fillStyle = '#ffe9d6'; g.fill(); g.strokeStyle = INK; g.lineWidth = 4; g.stroke(); g.font = Comic.disp(23); g.fillStyle = INK; g.fillText('CANCEL', 0, 1); g.restore();
      arrow(g, 216, 122, 246, 88, BLOOD);
      thumb(g, 148, 138, -.72);
    });
    page('h4', '#ffe37a', 'HOORAY!', ULTRA, g => {
      const bx = 34, bw = 292, by = 32, bh = 22;
      g.fillStyle = INK; g.fillRect(bx - 6, by - 6, bw + 12, bh + 12);
      g.fillStyle = ULTRA; g.fillRect(bx, by, bw * .68, bh); g.fillStyle = VIOLET; g.fillRect(bx + bw * .68, by, bw * .32, bh);
      Comic.flip(g, bx + bw * .68, by + bh / 2, 26, 0, 120, 0);
      g.strokeStyle = INK; g.lineWidth = 6; g.setLineDash([18, 13]); g.beginPath(); g.ellipse(180, 176, 150, 70, 0, 0, TAU); g.stroke(); g.setLineDash([]);
      coinShadow(g, 100, 163, 42);
      blitS(g, Art.champCoin('ione', 0, 3, 44), 100, 160, 42);
      for (const [x, y, face] of [[186, 136, 0], [252, 158, 1], [204, 204, 2], [282, 216, 0]]) {
        g.fillStyle = 'rgba(20,16,42,.3)'; g.beginPath(); g.ellipse(x, y + 26, 22, 7, 0, 0, TAU); g.fill();
        g.fillStyle = ['#ffe9c8', '#ffd18a', '#ffc4b0'][face]; g.strokeStyle = INK; g.lineWidth = 6; g.beginPath(); g.arc(x, y, 25, 0, TAU); g.fill(); g.stroke();
        g.fillStyle = INK; g.beginPath(); g.arc(x - 9, y - 5, 3.6, 0, TAU); g.arc(x + 9, y - 5, 3.6, 0, TAU); g.fill();
        g.lineWidth = 3.6; g.beginPath(); g.arc(x, y + 3, 11, .2, Math.PI - .2); g.stroke();
      }
    });
    page('h5', '#b8f28a', 'TEAM UP!', '#fff', g => {
      const cells = [['top', 'gravel', 96, 66], ['jungle', 'sable', 264, 66], ['bottom', 'vesper', 96, 186], ['support', 'solenne', 264, 186]];
      for (const [role, kit, x, y] of cells) {
        blitS(g, Art.champCoin(kit, 0, 2, 44), x, y - 8, 44);
        const nm = Sim.ROLE_INFO[role].name.toUpperCase(); g.font = Comic.disp(29); const tw = g.measureText(nm).width + 22;
        g.fillStyle = INK; g.fillRect(x - tw / 2 + 3, y + 28, tw, 34); g.fillStyle = PAPER; g.fillRect(x - tw / 2, y + 25, tw, 34); g.strokeStyle = INK; g.lineWidth = 4; g.strokeRect(x - tw / 2, y + 25, tw, 34);
        g.fillStyle = ULTRA2; g.fillText(nm, x, y + 43);
      }
    });
  }

  // ---------- wiring ----------
  function playBots() {
    if (F.on || W.on || V.on) return;
    netDrop(); L.slot = 0; L.team = 0; rollSeats();
    Sound.play('tap');
    scr(null);
    enterLobby();
  }
  function initMenus() {
    rollSeats(); applySide(); renderLobby(); syncToggles(); buildKeypad(); wireNet();
    stage.style.setProperty('--star', cssStar(16, .72));
    Hud.syncToggles = syncToggles;
    addEventListener('pointerdown', () => { Sound.init(); Sound.setMode(G ? 'match' : 'menu'); }, { once: true });
    $('title').onclick = () => {
      Sound.init(); Sound.play('title'); Sound.setMode('menu');
      const go = () => { hide('title'); scr('menu'); };
      if (!wipe(go)) go();
    };
    const openCode = hashCode();
    if (openCode) { hide('title'); eatHash(); openJoin(openCode); }
    addEventListener('hashchange', () => { const c = hashCode(); if (c && !G && !N.mode) { hide('title'); eatHash(); openJoin(c); } });

    // main menu
    $('mBots').onclick = playBots;
    $('mHost').onclick = () => { Sound.play('coin'); startHost(); };
    $('mJoin').onclick = () => { Sound.play('coin'); openJoin(''); };
    $('mHow').onclick = () => { Sound.play('menuOpen'); buildHow(); scr('how'); };
    $('mSet').onclick = () => { Sound.play('menuOpen'); syncToggles(); show('settings'); };
    // The coin is a toy: flip it and it has opinions.
    const QUIPS = [['Heads, we save the day!', 'Nice flip, hero!', 'Stand tall!', 'The people are counting on us!'], ['Tails, you lose!', 'Mwa-ha-ha!', 'The city is mine!', 'Flip me again. I dare you.']];
    let quip = 0, quipT = 0;
    $('mcoin').onclick = () => {
      T.t = T.hold + .001; Sound.play('coin');
      const next = T.face ? 0 : 1, b = $('mbub'); // three half-turns land on the other face
      b.textContent = QUIPS[next][quip++ % QUIPS[next].length];
      b.classList.add('hide'); void b.offsetWidth; b.classList.remove('hide');
      clearTimeout(quipT); quipT = setTimeout(() => b.classList.add('hide'), 1550);
    };
    $('hBack').onclick = () => { Sound.play('menuBack'); scr('menu'); };

    // room and join
    twoTap($('rBack'), 'Leave?', () => N.peer, () => { netDrop(); scr('menu'); });
    $('jBack').onclick = () => { Sound.play('menuBack'); netDrop(); scr('menu'); };
    $('jGo').onclick = () => joinGo();
    $('jPaste').onclick = () => pasteTap();
    $('rCopy').onclick = () => copyBtn($('rCopy'), N.code, 'Copied!');
    $('rShare').onclick = () => {
      const url = inviteUrl();
      if (navigator.share) { navigator.share({ title: 'Flipside', text: `Play Flipside with me! Room code ${N.code}`, url }).catch(() => { }); Sound.play('tap'); }
      else copyBtn($('rShare'), url, 'Link copied!');
    };
    document.querySelectorAll('#rTeam [data-t]').forEach(b => { b.onclick = () => { if (N.mode !== 'host') return; N.pairing = b.dataset.t; Sound.play('tap'); say(roomMsg()); renderRoom(); }; });
    document.querySelectorAll('#rDiff [data-d]').forEach(b => { b.onclick = () => { if (N.mode !== 'host') return; N.diff = b.dataset.d; Sound.play('tap'); say(roomMsg()); renderRoom(); }; });
    $('rFlip').onclick = () => { if (N.mode === 'host') hostFlip(); else { shake($('rFlip')); Sound.play('tick'); } };

    // lobby and overlays
    $('flip').onclick = () => flipSkip();
    $('flip').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flipSkip(); } };
    document.querySelectorAll('#diff [data-d]').forEach(b => { b.onclick = () => { save.diff = b.dataset.d; persist(); Sound.play('tap'); renderLobby(); }; });
    $('openSet').onclick = () => { Sound.play('tap'); syncToggles(); show('settings'); };
    $('setDone').onclick = () => { Sound.play('tap'); hide('settings'); };
    $('sMusic').onclick = $('pMusic').onclick = () => toggle('music');
    $('sSfx').onclick = $('pSfx').onclick = () => toggle('sfx');
    document.querySelectorAll('#gfx [data-g]').forEach(b => { b.onclick = () => { save.gfx = b.dataset.g; persist(); if (save.gfx === 'auto') quality = 2; applyQuality(); Sound.play('tap'); syncToggles(); }; });
    $('auto').onclick = () => { autoFill(); Sound.play('coin'); renderLobby(); };
    $('start').onclick = lobbyStartTap;
    $('shDone').onclick = () => { Sound.play('tap'); hide('sheet'); L.sheet = null; };
    $('shSit').onclick = () => { if (!L.sheet) return; moveMe(L.sheet.i); hide('sheet'); L.sheet = null; renderLobby(); };
    twoTap($('lBack'), 'Leave?', () => !!N.mode, () => { if (N.mode) toMenu(); else { const go = () => { hide('lobby'); hide('sheet'); scr('menu'); }; if (!wipe(go)) go(); } });
    $('resume').onclick = () => { paused = false; hide('pause'); Sound.play('tap'); };
    twoTap($('leave'), 'Tap again to leave', () => Hud.isLive(), () => toMenu());
    $('again').onclick = () => { Sound.play('tap'); if (N.mode) backToRoom(); else begin(true); };
    $('tolobby').onclick = () => { Sound.play('tap'); toMenu(); };
  }

  function animMenus(dt) { wipeStep(dt); flipStep(dt); vsStep(); titleStep(dt); heroStep(dt); endStep(dt); if (N.joining && hasNet() && Net.connected) guestIn(); }

  return { initMenus, animMenus, showEnd };
})();
