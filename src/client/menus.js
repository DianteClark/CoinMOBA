// Title, main menu, how to play, online room and join, the coin flip, lobby, seat setup, versus splash, end screen and the coin wipe between them.
const { initMenus, animMenus, showEnd } = (() => {
  const TIERS = Sim.TIERS;
  const rosterOf = team => Sim.ROSTER && Sim.ROSTER[team] ? Sim.ROSTER[team] : Object.keys(Sim.KITS);
  const BOT_NAMES = ['Penny', 'Florin', 'Ducat', 'Groat', 'Thaler', 'Guinea', 'Tanner', 'Sovereign', 'Bezant', 'Kopek'];
  const L = { seats: null, team: 0, slot: 0, sheet: null, tab: 'builds', practice: false };
  // Online session. mode is 'host', 'guest' or null for a match against bots.
  const N = { mode: null, code: '', peer: false, joining: false, input: '', pairing: 'same', ranks: { h: null, g: null }, ready: { h: false, g: false }, seq: 0, ack: 0, lobby: false, side: 0, timer: 0, wasReady: false };
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
  // Names on the small coins lose their honorifics so they stay on one line.
  const shortName = n => n.replace(/^(The|Captain|Madame) /, '');
  const buildsOf = id => (Sim.KITS[id] && Sim.KITS[id].builds) || [];
  const myBuild = id => { const b = buildsOf(id), v = save.builds && save.builds[id]; return b.some(x => x.id === v) ? v : b[0] ? b[0].id : undefined; };
  const botBuild = (id, role) => Sim.defaultBuild ? Sim.defaultBuild(id, role, Math.random()) : undefined;
  const cosmeticIds = kind => (Art.COSMETICS || []).filter(c => c.kind === kind).map(c => c.id);
  const equipOf = () => { const e = save.equip || {}, ok = k => e[k] && isOwned(e[k]) ? e[k] : undefined; return { finish: ok('finish'), trail: ok('trail'), recall: ok('recall') }; };
  const cleanCos = (kind, v) => cosmeticIds(kind).includes(v) ? v : undefined;
  function wearMine(s) { const e = equipOf(); s.finish = e.finish; s.trail = e.trail; s.recall = e.recall; s.build = myBuild(s.champ); }
  // Fit for a role reads as a plain sentence: the best lane, and any other lane it does well in.
  function bestLine(k) {
    const r = Sim.ROLES.slice().sort((a, b) => k.fit[b] - k.fit[a]), first = r[0], also = r.filter((x, i) => i && k.fit[x] >= 2);
    return `Best in: ${roleName(first)}${also.length ? `<span>, also ${also.map(roleName).join(' and ')}</span>` : ''}`;
  }
  const MISSION = ['Save the people', 'Terrorize the city'];
  // ---------- rank ----------
  const myRank = () => save.rank === undefined ? 1000 : save.rank;
  const rankInfo = r => Sim.rankOf(r);
  const RANK_COL = ['#7f8da3', '#a3b5cc', '#d6dee9', '#e6d29a', '#f0bf55', '#fff3d1'];
  // An original insignia: one chevron per tier inside a lozenge.
  function rankBadge(tier, col) {
    let d = '';
    for (let i = 0; i <= tier; i++) { const y = 16 + (i - tier / 2) * 4.3, w = Math.max(3, 9.5 - Math.abs(y - 16) * .62); d += `M${(15 - w).toFixed(1)} ${(y + 2.2).toFixed(1)}L15 ${(y - 2.2).toFixed(1)}L${(15 + w).toFixed(1)} ${(y + 2.2).toFixed(1)}`; }
    return `<svg viewBox="0 0 30 32" aria-hidden="true"><path d="M15 1 29 16 15 31 1 16Z" fill="${tier >= 4 ? col : 'rgba(10,12,18,.6)'}" fill-opacity="${tier >= 4 ? .2 : 1}" stroke="${col}" stroke-width="1"/><path d="${d}" fill="none" stroke="${col}" stroke-width="1.9"/></svg>`;
  }
  function paintRank(el, r, mini) {
    const info = rankInfo(r), col = RANK_COL[Math.min(5, info.tier)], n = Math.round(r);
    el.style.setProperty('--rc', col);
    el.setAttribute('aria-label', `Rank: ${info.name}`);
    el.innerHTML = `${rankBadge(info.tier, col)}<span><b>${info.name}</b>${mini ? '' : `<small>${n}</small>`}</span>${mini ? '' : `<i><u style="width:${Math.round(Math.max(0, Math.min(1, info.frac === undefined ? 1 : info.frac)) * 100)}%"></u></i>`}`;
  }
  const cleanRank = v => { const n = Number(v); return v === null || v === undefined || !isFinite(n) ? null : Math.max(0, Math.min(99999, Math.round(n))); };
  const skillSeed = () => (Date.now() ^ (Math.random() * 1e9)) & 0xffffff;
  // Each team is asked for separately, which is what puts a very advanced bot on every enemy team.
  function withSkills(cfg, avgRank) {
    cfg.teams.forEach((row, t) => {
      const bots = row.filter(p => !p.human), skills = Sim.botSkills(avgRank, bots.length, cfg.seed + (t + 1) * 7919);
      bots.forEach((p, i) => { p.skill = skills[i]; });
    });
    return cfg;
  }
  function coinCanvas(spr, size) { const c = document.createElement('canvas'); c.width = c.height = size; Hud.coinTo(c, spr); return c; }

  // ---------- seats ----------
  const wantFor = team => { const r = rosterOf(team), v = (save.lastBy || {})[team]; return r.includes(v) ? v : r.includes(save.last) ? save.last : r[0]; };
  function rollSeats() {
    const names = shuffle(BOT_NAMES.slice()); let n = 0;
    L.seats = [0, 1].map(team => {
      const pool = shuffle(rosterOf(team).slice()).slice(0, 4);
      if (team === L.team) { const want = wantFor(team), at = pool.indexOf(want); if (at >= 0) [pool[at], pool[L.slot]] = [pool[L.slot], pool[at]]; else pool[L.slot] = want; }
      const roles = Sim.autoRoles(pool);
      return pool.map((champ, i) => ({ champ, role: roles[i], tier: Math.min(5, Math.floor(Math.random() * Math.random() * 6)), human: false, name: names[n++], who: null, build: botBuild(champ, roles[i]) }));
    });
    const me = mine(); me.human = true; me.name = 'You'; wearMine(me);
  }
  function setChamp(team, i, id) {
    const row = L.seats[team], s = row[i], other = row.find(o => o !== s && o.champ === id);
    if (other) other.champ = s.champ;
    s.champ = id;
    if (isMe(s)) { save.last = id; (save.lastBy || (save.lastBy = {}))[team] = id; s.build = myBuild(id); persist(); flipT = 1; }
    else s.build = botBuild(id, s.role);
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
  function rollSide() { L.team = Math.random() < .5 ? 0 : 1; rollSeats(); }
  function autoFill() { L.seats.forEach(row => { const r = Sim.autoRoles(row.map(s => s.champ)); row.forEach((s, i) => { s.role = r[i]; }); }); }
  const friendSeat = () => { for (const row of L.seats) for (const s of row) if (isFriend(s)) return s; return null; };
  // On your own team the friend's champion and role are off limits.
  const friendHolds = (key, val) => !!N.mode && L.seats[L.team].some(o => isFriend(o) && o[key] === val);
  const seatOut = s => ({ champ: s.champ, role: s.role, tier: seatTier(s), name: s.name, build: s.build, finish: s.finish, trail: s.trail, recall: s.recall });
  const buildCfg = () => { wearMine(mine()); return withSkills({ seed: skillSeed(), practice: L.practice || undefined, teams: L.seats.map(row => row.map(s => Object.assign(seatOut(s), { human: s.human }))) }, myRank()); };
  function netCfg() {
    N.ranks[myWho()] = myRank();
    const known = [N.ranks.h, N.ranks.g].filter(v => v !== null), avg = known.reduce((a, b) => a + b, 0) / known.length;
    return withSkills({ seed: skillSeed(), teams: L.seats.map(row => row.map(s => Object.assign(seatOut(s), { human: !!s.who, remote: s.who === 'g' }))) }, avg);
  }

  // ---------- side ----------
  // Every menu colours itself from these two classes on the stage.
  function applySide() { stage.classList.toggle('s0', L.team === 0); stage.classList.toggle('s1', L.team === 1); }

  // ---------- lobby ----------
  function renderLobby() {
    const seat = mine(), id = seat.champ, p = pts(id), tier = Sim.tierOf(p), next = TIERS[tier + 1], base = TIERS[tier].at, prog = next ? (p - base) / (next.at - base) : 1;
    const who = Sim.charOf(L.team, id), nm = $('wN');
    if (nm.textContent !== who.name) { nm.textContent = who.name; nm.classList.toggle('long', who.name.length > 11); nm.classList.remove('pop'); void nm.offsetWidth; nm.classList.add('pop'); }
    $('mission').innerHTML = `<b>${L.practice ? 'Practice' : Sim.TEAM_NAMES[L.team]}</b><span>${L.practice ? `${Sim.TEAM_NAMES[L.team]}, no pressure` : MISSION[L.team]}</span>`;
    $('wB').textContent = who.title;
    renderWho(true);
    const lad = $('ladder'); lad.textContent = '';
    TIERS.forEach((t, i) => {
      const r = document.createElement('div'); r.className = 'rung' + (i < tier ? ' done' : i === tier ? ' now' : ''); r.title = t.name;
      if (i === tier) r.style.setProperty('--p', Math.round(prog * 100));
      r.append(coinCanvas(Art.champCoin(id, L.team, i, 20), 56)); lad.append(r);
    });
    $('wTier').textContent = next ? `${TIERS[tier].name}, ${next.at - p} to ${next.name}` : `${TIERS[tier].name}, the highest border`;
    const pk = $('picks'); pk.textContent = '';
    rosterOf(L.team).forEach(cid => {
      const b = document.createElement('button'), nm0 = charName(L.team, cid); b.className = 'pick'; b.setAttribute('aria-label', nm0); b.setAttribute('aria-pressed', cid === id);
      b.append(coinCanvas(Art.champCoin(cid, L.team, Sim.tierOf(pts(cid)), 54), 112));
      b.insertAdjacentHTML('beforeend', `<span class="pn">${shortName(nm0)}</span>${pipsHtml(Sim.KITS[cid].fit[seat.role])}`);
      const taken = friendHolds('champ', cid);
      if (taken) { b.classList.add('taken'); b.setAttribute('aria-label', `${nm0}, taken by your friend`); }
      b.onclick = () => { if (cid === id) return; if (taken) { Sound.play('cancel'); return; } setChamp(L.team, L.slot, cid); Sound.play('coin'); netPicked(); renderLobby(); };
      pk.append(b);
    });
    [0, 1].forEach(team => {
      const el = $('s' + team); el.textContent = '';
      L.seats[team].forEach((s, i) => {
        const me_ = isMe(s), fr = isFriend(s), d = document.createElement('div'); d.className = 'seat' + (me_ ? ' me' : fr ? ' fr' : '');
        const b = document.createElement('button'); b.className = 'seatc';
        b.setAttribute('aria-label', `${me_ ? 'Your seat' : fr ? 'Your friend' : s.name}, ${charName(team, s.champ)}, ${roleName(s.role)}`);
        b.append(coinCanvas(Art.champCoin(s.champ, team, seatTier(s), 46, s.finish), 96));
        b.insertAdjacentHTML('beforeend', pipsHtml(Sim.KITS[s.champ].fit[s.role]));
        b.onclick = () => { if (N.mode && !me_) { Sound.play('tick'); return; } Sound.play('tap'); openSheet(team, i); };
        const chip = document.createElement('span'); chip.className = 'chip'; chip.textContent = roleName(s.role);
        d.append(b, chip);
        el.append(d);
      });
    });
    const lane = $('lane'), fit = Sim.KITS[id].fit[seat.role];
    lane.innerHTML = `<small>Your lane</small><b>${roleName(seat.role)}</b>${pipsHtml(fit)}`;
    lane.classList.toggle('lo', fit === 0);
    lane.setAttribute('aria-label', `Your lane: ${roleName(seat.role)}. Tap for the next lane.`);
    paintRank($('lRank'), myRank(), true);
    $('pSide').classList.toggle('hide', !L.practice);
    lobbyNet();
  }
  // The part of the lobby that changes with a build or tab tap, redrawn on its own so the coins stay still.
  function renderWho(animate) {
    const seat = mine(), id = seat.champ, k = Sim.KITS[id], builds = buildsOf(id), showKit = L.tab === 'kit' || !builds.length;
    $('wBest').innerHTML = bestLine(k);
    const pass = $('wP');
    pass.classList.toggle('hide', !k.passive);
    if (k.passive) pass.innerHTML = `<b>${k.passive.name}</b>${k.passive.d}`;
    document.querySelectorAll('#wTab [data-t]').forEach(b => b.setAttribute('aria-pressed', (b.dataset.t === 'kit') === showKit));
    $('wTab').classList.toggle('hide', !builds.length);
    const wb = $('wBuilds'), wk = $('wKit');
    wb.classList.toggle('hide', showKit); wk.classList.toggle('hide', !showKit);
    if (showKit) {
      $('wA').innerHTML = k.kit.map((a, i) => `<div><img src="${iconOf(id, i)}" alt=""><span><em>${a.name}</em><u>${a.range ? `Range ${a.range}` : 'Self'}</u><br>${a.d}</span></div>`).join('');
    } else {
      if (!builds.some(b => b.id === seat.build)) seat.build = builds[0].id;
      const g = document.createElement('div'); g.className = 'bgrid';
      builds.slice(0, 4).forEach((bu, i) => {
        const b = document.createElement('button'); b.className = 'bld'; b.style.setProperty('--i', i); b.setAttribute('aria-pressed', bu.id === seat.build);
        b.innerHTML = `<span><b>${bu.name}</b>${bu.tag ? `<em>${bu.tag}</em>` : ''}</span><small>${bu.d}</small>`;
        b.setAttribute('aria-label', `${bu.name} build. ${bu.d}`);
        b.onclick = () => { if (mine().build === bu.id) return; mine().build = bu.id; (save.builds || (save.builds = {}))[id] = bu.id; persist(); Sound.play('clink'); netPicked(); renderWho(); };
        g.append(b);
      });
      wb.textContent = ''; wb.append(g);
      if (animate) { wb.classList.remove('in'); void wb.offsetWidth; wb.classList.add('in'); }
    }
  }
  const myReady = () => !!N.ready[myWho()];
  const friendReady = () => !!N.ready[N.mode === 'host' ? 'g' : 'h'];
  // The parts of the lobby that change when a friend is in it.
  function lobbyNet() {
    const net = !!N.mode, st = $('start');
    $('lnet').classList.toggle('hide', !net); $('auto').classList.toggle('hide', net || L.practice);
    if (!net && !L.practice) { st.textContent = 'Start match'; st.classList.remove('off'); st.classList.add('hot'); return; }
    if (L.practice) { st.textContent = 'Start practice'; st.classList.add('hot'); st.classList.remove('off'); return; }
    const f = friendSeat(), rd = friendReady(), box = $('lnet'); box.textContent = '';
    if (f) {
      const t = L.seats.findIndex(r => r.includes(f));
      box.append(coinCanvas(Art.champCoin(f.champ, t, f.tier || 0, 30, f.finish), 68));
      const fb = buildsOf(f.champ).find(x => x.id === f.build), nm = document.createElement('span'); nm.textContent = `Friend: ${charName(t, f.champ)}${fb ? `, ${fb.name}` : ''}`;
      const tag = document.createElement('em'); tag.textContent = rd ? 'Ready!' : 'Picking'; if (rd && !N.wasReady) tag.className = 'yes'; else if (rd) { tag.className = 'yes'; tag.style.animation = 'none'; }
      box.append(nm, tag);
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
    rosterOf(team).forEach(id => {
      const k = Sim.KITS[id], nm = charName(team, id), b = document.createElement('button'); b.className = 'schamp'; b.setAttribute('aria-pressed', id === s.champ);
      b.setAttribute('aria-label', `${nm}, fit ${k.fit[s.role]} of 3 for ${roleName(s.role)}`);
      b.append(coinCanvas(Art.champCoin(id, team, isMe(s) ? Sim.tierOf(pts(id)) : s.tier, 46, isMe(s) ? s.finish : undefined), 100));
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
    const sens = save.aimSens || 1;
    document.querySelectorAll('#sAim [data-a]').forEach(b => b.setAttribute('aria-pressed', Math.abs(+b.dataset.a - sens) < .01));
    $('sLeft').setAttribute('aria-pressed', !!(save.hud && save.hud.left));
    paintTip();
  }
  // ---------- add to home screen ----------
  let installEvt = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; paintTip(); });
  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  function paintTip() {
    const el = $('sTip'); if (!el) return;
    if (isStandalone()) { el.classList.add('hide'); return; }
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    el.innerHTML = `<b>Add to home screen</b>${ios ? 'Tap Share, then Add to Home Screen, to play fullscreen with no browser bars.' : installEvt ? 'Install Flipside to play fullscreen with no browser bars.' : 'Open your browser menu and choose Add to Home screen to play fullscreen.'}${installEvt ? '<br><button class="tok" id="sInstall">Install</button>' : ''}`;
    const b = $('sInstall'); if (b) b.onclick = async () => { const e = installEvt; installEvt = null; Sound.play('tap'); e.prompt(); try { await e.userChoice; } catch (_) { } paintTip(); };
  }
  // ---------- hud editor ----------
  const hudSave = () => save.hud || (save.hud = { left: false, pos: {} });
  function setLeft(on) {
    const h = hudSave(); if (!!h.left === !!on) return;
    h.left = !!on;
    for (const k of Object.keys(h.pos)) if (!['shop', 'recall', 'ping'].includes(k)) h.pos[k][0] *= -1;
    persist(); hud();
  }
  const edge = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
  function overlaps(key) { const a = Hud.placed(key); return Hud.layoutKeys.some(([k]) => k !== key && edge(a, Hud.placed(k)) < -2); }
  function buildHudEd() {
    const host = $('hedBoard'); host.textContent = '';
    const map = document.createElement('div'); map.className = 'hmap'; map.style.cssText = `left:${Hud.ui.map.x}px;top:${Hud.ui.map.y}px;width:${Hud.ui.map.w}px;height:${Hud.ui.map.h}px`; host.append(map);
    const bar = document.createElement('div'); bar.className = 'hbar'; bar.style.width = Hud.ui.hpW + 'px'; host.append(bar);
    for (const [key, name] of Hud.layoutKeys) {
      const d = document.createElement('div'), b = Hud.placed(key); d.className = 'hk'; d.textContent = name; d.setAttribute('role', 'button'); d.setAttribute('aria-label', `Move ${name}`);
      const set = (x, y) => { d.style.left = (x - b.r) + 'px'; d.style.top = (y - b.r) + 'px'; };
      d.style.width = d.style.height = b.r * 2 + 'px'; set(b.x, b.y);
      if (b.r < 22) d.style.fontSize = '10px';
      let drag = null;
      d.addEventListener('pointerdown', e => { e.preventDefault(); try { d.setPointerCapture(e.pointerId); } catch (_) { } const p = Ctl.pt(e), c = Hud.placed(key), o = hudSave().pos[key]; drag = { dx: c.x - p.x, dy: c.y - p.y, keep: o ? o.slice() : null }; d.classList.add('drag'); Sound.play('tap'); });
      d.addEventListener('pointermove', e => {
        if (!drag) return; e.preventDefault();
        const p = Ctl.pt(e), base = Hud.basePos(key), x = p.x + drag.dx, y = p.y + drag.dy, snap = v => Math.round(v / 4) * 4;
        hudSave().pos[key] = [snap(x - base.x), snap(y - base.y)]; const now = Hud.placed(key); set(now.x, now.y); d.classList.toggle('bad', overlaps(key));
      });
      const up = () => {
        if (!drag) return;
        if (overlaps(key)) { if (drag.keep) hudSave().pos[key] = drag.keep; else delete hudSave().pos[key]; Sound.play('cancel'); const c = Hud.placed(key); set(c.x, c.y); } else Sound.play('clink');
        drag = null; d.classList.remove('drag', 'bad'); persist(); hud();
      };
      d.addEventListener('pointerup', up); d.addEventListener('pointercancel', up);
      host.append(d);
    }
  }
  function openHudEd() { hide('settings'); hud(); buildHudEd(); show('hudEd'); Sound.play('menuOpen'); }

  function toggle(key) { save[key] = !save[key]; persist(); Sound.setOn(save.music, save.sfx); Sound.play('tap'); syncToggles(); }

  // ---------- store ----------
  const St = { tab: 'finish', sel: null, ang: 0, shine: 0 };
  const catalog = () => Art.COSMETICS || [];
  const bestMastery = () => Math.max(0, ...[0, 1].flatMap(t => rosterOf(t).map(id => Sim.tierOf(pts(id)))));
  function masteryMet(c) { const m = c.mastery; return !!m && (m.champ ? Sim.tierOf(pts(m.champ)) >= m.tier : bestMastery() >= m.tier); }
  function isOwned(id) { const c = catalog().find(x => x.id === id); if (!c) return false; return c.mastery ? masteryMet(c) : (save.owned || []).includes(id); }
  function champName(id) { for (const t of [0, 1]) if (rosterOf(t).includes(id)) return charName(t, id); return id; }
  function unlockText(c) { const m = c.mastery, tier = TIERS[m.tier] ? TIERS[m.tier].name : `tier ${m.tier}`; return m.champ ? `Reach ${tier} with ${champName(m.champ)}` : `Reach ${tier} with any champion`; }
  function previewCoin(c, size) {
    // Finishes wear themselves on the coin you play most; trails and recalls show on it too.
    const team = L.team, id = wantFor(team), finish = c && c.kind === 'finish' ? c.id : (save.equip || {}).finish;
    return Art.champCoin(id, team, Sim.tierOf(pts(id)), size, isOwned(finish) || (c && c.id === finish) ? finish : undefined);
  }
  function renderStore() {
    $('stMarks').textContent = save.marks || 0;
    document.querySelectorAll('#stTab [data-k]').forEach(b => b.setAttribute('aria-pressed', b.dataset.k === St.tab));
    const grid = $('stGrid'), list = catalog().filter(c => c.kind === St.tab);
    grid.textContent = '';
    if (!catalog().length) { grid.innerHTML = '<p class="stcmp">The shelves are being stocked.</p>'; paintSel(); return; }
    if (!list.some(c => c.id === St.sel)) St.sel = list.length ? list[0].id : null;
    for (const c of list) {
      const owned = isOwned(c.id), eq = (save.equip || {})[c.kind] === c.id, b = document.createElement('button');
      b.className = 'stc' + (c.id === St.sel ? ' sel' : '') + (eq ? ' eq' : '') + (owned ? '' : ' lockd');
      b.append(coinCanvas(previewCoin(c, 46), 92));
      b.insertAdjacentHTML('beforeend', `<span class="t"><b>${c.name}</b><small${owned ? '' : c.mastery ? ' class="lock"' : ' class="cost"'}>${eq ? 'Equipped' : owned ? 'Owned' : c.mastery ? 'Mastery' : `${c.cost} Marks`}</small></span>`);
      b.onclick = () => { St.sel = c.id; Sound.play('tick'); renderStore(); };
      grid.append(b);
    }
    paintSel();
  }
  function paintSel() {
    const c = catalog().find(x => x.id === St.sel), act = $('stAct');
    if (!c) { $('stN').textContent = ''; $('stD').textContent = ''; act.classList.add('hide'); return; }
    const owned = isOwned(c.id), eq = (save.equip || {})[c.kind] === c.id, price = c.cost || 0, can = !c.mastery && !owned && (save.marks || 0) >= price, kindW = { finish: 'Coin finish', trail: 'A wake behind your coin', recall: 'Plays when you recall' }[c.kind];
    $('stN').textContent = c.name;
    $('stD').textContent = !owned && c.mastery ? unlockText(c) : kindW;
    act.classList.remove('hide');
    act.innerHTML = owned ? (eq ? 'Equipped' : 'Equip') : c.mastery ? 'Locked' : `Buy<span class="mks"><i></i>${price}</span>`;
    act.classList.toggle('off', eq || (!owned && !can)); act.classList.toggle('hot', (owned && !eq) || can);
    act.onclick = () => {
      if (eq) return;
      if (owned) { (save.equip || (save.equip = {}))[c.kind] = c.id; persist(); Sound.play('equip'); St.shine = 0; renderStore(); return; }
      if (!can) { shake(act); Sound.play('cancel'); return; }
      save.marks = (save.marks || 0) - price; (save.owned || (save.owned = [])).push(c.id); (save.equip || (save.equip = {}))[c.kind] = c.id; persist(); Sound.play('storeBuy'); flipT = 1; St.shine = 0; renderStore();
    };
  }
  function storeStep(dt) {
    if (curScr !== 'store') return;
    const g = $('stCoin').getContext('2d'), c = catalog().find(x => x.id === St.sel), spr = previewCoin(c, 200);
    if (!calm) { St.ang += dt * 1.1; St.shine = Math.min(1.2, St.shine + dt * 1.2); }
    g.clearRect(0, 0, 280, 280); g.drawImage(halo(L.team), 0, 0, 280, 280);
    const ang = calm ? 0 : Math.sin(St.ang) * .5;
    spinCoin(g, spr, 140, 140, 104, ang);
    sweepCoin(g, 140, 140, 104, ang, St.shine < 1 ? St.shine : (St.ang % 4) / 4);
  }

  // ---------- coin drawing ----------
  const edgeOf = () => L.team ? ['#8d1425', '#2a2c33'] : ['#c2a766', '#6e5c34'];
  function spinCoin(g, spr, cx, cy, R, ang) {
    const c = Math.cos(ang), ab = Math.abs(c), T = R * .1 * Math.sqrt(1 - c * c), dir = c >= 0 ? 1 : -1, w = R * ab, edge = edgeOf();
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
  // A pool of light behind a coin, with one fine ring, cached per side.
  const halos = {};
  function halo(side) {
    if (halos[side]) return halos[side];
    const c = Art.cv(560, 560), g = c.getContext('2d'), col = side ? '236,58,82' : '230,214,170', gr = g.createRadialGradient(280, 280, 120, 280, 280, 280);
    gr.addColorStop(0, `rgba(${col},.34)`); gr.addColorStop(.55, `rgba(${col},.1)`); gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 560, 560);
    g.strokeStyle = `rgba(${col},.5)`; g.lineWidth = 1.5; g.beginPath(); g.arc(280, 280, 232, 0, TAU); g.stroke();
    return halos[side] = c;
  }
  const accentOf = side => side ? Deco.CRIM : Deco.GOLD;

  // ---------- wipe: two angled shutters close, then part ----------
  const W = { on: false, phase: 0, t: 0, mid: null };
  function wipe(mid) {
    if (W.on) return false;
    W.on = true; W.phase = 0; W.t = 0; W.mid = mid;
    const c = $('wipe'), k = Math.min(devicePixelRatio || 1, 2); c.width = Math.round(VW * k); c.height = Math.round(VH * k); c.classList.remove('hide');
    Sound.play('whoosh');
    return true;
  }
  function shutters(g, e) {
    const lean = VH * .36, top = lerp(-8, VW / 2 + lean / 2, e), bot = top - lean;
    g.fillStyle = Deco.INK;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(top, 0); g.lineTo(bot, VH); g.lineTo(0, VH); g.closePath(); g.fill();
    // the right blade mirrors the left through the centre
    g.beginPath(); g.moveTo(VW, 0); g.lineTo(VW - bot, 0); g.lineTo(VW - top, VH); g.lineTo(VW, VH); g.closePath(); g.fill();
    g.strokeStyle = accentOf(L.team); g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(top, 0); g.lineTo(bot, VH); g.moveTo(VW - bot, 0); g.lineTo(VW - top, VH); g.stroke();
  }
  function wipeCoin(g, a) {
    const spr = Deco.face(L.team, 230), R = VH * .17, h = spr.S * R / spr.R;
    g.globalAlpha = a; g.drawImage(spr.c, VW / 2 - h / 2, VH / 2 - h / 2, h, h); g.globalAlpha = 1;
  }
  function wipeStep(dt) {
    if (!W.on) return;
    const c = $('wipe'), g = c.getContext('2d'), k = c.width / VW;
    g.setTransform(k, 0, 0, k, 0, 0); g.globalAlpha = 1;
    if (W.phase === 0) {
      W.t += dt;
      const p = calm ? 1 : Math.min(1, W.t / .26);
      g.clearRect(0, 0, VW, VH);
      if (p < 1) { shutters(g, 1 - (1 - p) * (1 - p)); return; }
      g.fillStyle = Deco.INK; g.fillRect(0, 0, VW, VH); wipeCoin(g, 1); W.phase = 1;
      return;
    }
    // The covered frame has now been shown, so the heavy work is hidden.
    if (W.phase === 1) { const fn = W.mid; W.mid = null; if (fn) fn(); W.phase = 2; W.t = 0; return; }
    W.t += dt;
    const dur = calm ? .2 : .34, p = Math.min(1, W.t / dur);
    if (p >= 1) { W.on = false; c.classList.add('hide'); return; }
    g.clearRect(0, 0, VW, VH);
    if (calm) { g.globalAlpha = 1 - p; g.fillStyle = Deco.INK; g.fillRect(0, 0, VW, VH); g.globalAlpha = 1; return; }
    shutters(g, 1 - p * p); wipeCoin(g, Math.max(0, 1 - p * 2.4));
  }

  // ---------- title ----------
  // The wordmark fills its column whichever face ends up loaded.
  let fitKey = '';
  function fitTitle() {
    const key = VW + '|' + Deco.fontsReady(); if (key === fitKey) return; fitKey = key;
    const b = document.querySelector('.tword b'); if (!b) return;
    b.style.fontSize = '100px'; const w = b.offsetWidth, room = VW * .49 - 52;
    b.style.fontSize = Math.max(44, Math.min(132, Math.floor(100 * room / (w || 1)))) + 'px';
  }
  const T = { t: 0, clock: 0, face: 0, shown: -1, hold: 2.8 };
  function titleStep(dt) {
    const onTitle = !hidden('title'), onMenu = !onTitle && !hidden('menu');
    if (!onTitle && !onMenu) return;
    if (onTitle) fitTitle();
    const c = $(onTitle ? 'tcan' : 'mcan'), k = Math.min(devicePixelRatio || 1, 2), w = Math.round(VW * k), h = Math.round(VH * k);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = c.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0); g.clearRect(0, 0, VW, VH);
    const cx = onTitle ? VW * .28 : VW * .235, cy = VH * (onTitle ? .47 : .46), R = onTitle ? Math.min(VH * .36, VW * .21) : Math.min(VH * .32, VW * .17), HOLD = T.hold, DUR = 1.05;
    if (!calm) { T.t += dt; T.clock += dt; }
    let ang = T.face * Math.PI, hop = 0, world = T.face, since = -1;
    if (!calm) {
      if (T.t > HOLD + DUR) { T.t = 0; T.face = (T.face + 3) % 2; ang = T.face * Math.PI; world = T.face; since = 0; }
      else if (T.t > HOLD) {
        const p = (T.t - HOLD) / DUR, e = p * p * (3 - 2 * p);
        ang = (T.face + 3 * e) * Math.PI; hop = Math.sin(p * Math.PI) * R * .2;
        // The world changes once, as the coin turns over, rather than strobing with every half-turn.
        if (e > .5) world = (T.face + 1) % 2;
      } else since = T.t;
    }
    if (world !== T.shown) { T.shown = world; for (const id of ['title', 'menu']) { $(id).classList.toggle('s0', !world); $(id).classList.toggle('s1', !!world); } }
    const col = world ? '236,58,82' : '230,214,170', spot = Deco.beam(col);
    g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = .55; g.translate(cx, -10); g.rotate(Math.PI + Math.sin(T.clock * .35) * .16); g.drawImage(spot, -R * 1.5, -VH * 1.05, R * 3, VH * 1.05); g.restore();
    const haloS = R * 2.45; g.drawImage(halo(world), cx - haloS / 2 * 1.2, cy - hop - haloS / 2 * 1.2, haloS * 1.2, haloS * 1.2);
    Deco.flip(g, cx, cy - hop, R, ang, 230);
    if (since >= 0 && since < .5 && !calm) { const f = Math.sin(since / .5 * Math.PI); Deco.glint(g, cx - R * .62, cy - R * .62, R * .55 * f, '#fff'); }
  }

  // ---------- the coin flip: who you are this match ----------
  const SPIN = 1.16, HANG = .05, DROP = .08, HOLD = 1.55, EXIT = .24;
  const F = { on: false, t: 0, side: 0, done: null, keep: false, slam: 0 };
  const flipEnd = () => calm ? .9 : SPIN + HANG + DROP + HOLD;
  function flipStart(side, done, keep) {
    const c = $('fcan'), k = Math.min(devicePixelRatio || 1, 2), w = Math.round(VW * k), h = Math.round(VH * k);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    Object.assign(F, { on: true, t: 0, side, done, keep: !!keep, slam: 0 });
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
  // Black, one spotlight, the coin. On the drop the city of the chosen side is cut in behind it.
  function flipDraw(dt) {
    const c = $('fcan'), g = c.getContext('2d'), k = c.width / VW, side = F.side, t = F.t;
    g.setTransform(k, 0, 0, k, 0, 0); g.globalAlpha = 1; g.textBaseline = 'middle'; g.textAlign = 'center'; g.globalCompositeOperation = 'source-over';
    const Rf = Math.min(VH * .34, VW * .21), cxF = VW * .27, cyF = VH * .5, bar = VH * .09;
    const slam = calm || t >= SPIN + HANG + DROP;
    const since = t - (SPIN + HANG + DROP), amp = !calm && since > 0 && since < .28 ? (1 - since / .28) * 5 : 0;
    g.fillStyle = '#000'; g.fillRect(0, 0, VW, VH);
    if (amp) g.translate(Math.sin(t * 90) * amp, Math.cos(t * 73) * amp * .6);
    if (!slam) {
      const p = Math.min(1, t / SPIN), e = 1 - Math.pow(1 - p, 2.7), turns = 12 + side, ang = e * turns * Math.PI, shown = Math.cos(ang) >= 0 ? 0 : 1;
      g.globalAlpha = .14 + e * .16; Deco.cover(g, shown, VW, VH); g.globalAlpha = 1;
      const x = cxF + (VW * .86 - cxF) * (1 - e), y = cyF - Math.sin(e * Math.PI) * VH * .2 + (1 - e) * VH * .5;
      let R = Rf * (.5 + .82 * Math.min(1, e * 1.2));
      if (t > SPIN + HANG) { const d = Math.min(1, (t - SPIN - HANG) / DROP); R *= 1 - .22 * d * d * d; }
      const col = shown ? '236,58,82' : '230,214,170';
      g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = .75; g.translate(x, -20); g.rotate(Math.PI + (x - VW / 2) / VW * -.5); g.drawImage(Deco.beam(col), -R * 1.7, -VH * 1.2, R * 3.4, VH * 1.2); g.restore();
      Deco.flip(g, x, y, R, ang, 230, -.18);
      g.setTransform(k, 0, 0, k, 0, 0);
      g.fillStyle = '#000'; g.fillRect(0, 0, VW, bar); g.fillRect(0, VH - bar, VW, bar);
      g.font = '500 13px "Barlow Semi Condensed","Arial Narrow",sans-serif'; g.textAlign = 'right'; g.fillStyle = Deco.MUTE; g.fillText('Tap to skip', VW - 44, VH - bar / 2);
      return;
    }
    if (!F.slam) flipImpact();
    const acc = accentOf(side), rgb = side ? '236,58,82' : '230,214,170', hi = side ? '#f4f5f8' : '#fbf6e7', cut = calm ? 1 : Math.min(1, since / .3), front = cut * cut * (3 - 2 * cut), lean = VH * .36, edge = -lean + (VW + lean * 2) * front;
    // The city, cut in on a raking diagonal that starts at the coin.
    g.save(); g.beginPath(); g.moveTo(0, 0); g.lineTo(edge + lean / 2, 0); g.lineTo(edge - lean / 2, VH); g.lineTo(0, VH); g.closePath(); g.clip();
    Deco.cover(g, side, VW, VH); g.fillStyle = 'rgba(5,6,10,.42)'; g.fillRect(0, 0, VW, VH); g.restore();
    if (front < 1) { g.strokeStyle = acc; g.lineWidth = 1.5; g.beginPath(); g.moveTo(edge + lean / 2, 0); g.lineTo(edge - lean / 2, VH); g.stroke(); }
    // the coin, settling
    const settle = calm ? 1 : 1 + .16 * Math.pow(1 - Math.min(1, since / .24), 3), hs = Rf * 3;
    g.drawImage(halo(side), cxF - hs / 2, cyF - hs / 2, hs, hs);
    g.save(); g.translate(cxF, cyF); g.scale(settle, settle); Deco.flip(g, 0, 0, Rf, side ? Math.PI : 0, 230, 0); g.restore();
    if (!calm && since < .9) { const f = Math.sin(Math.min(1, since / .9) * Math.PI); Deco.glint(g, cxF - Rf * .62, cyF - Rf * .62, Rf * .7 * f, '#fff'); }
    // words settle in beside it
    const textX = VW * .5, textW = VW - 44 - textX, word = side ? 'VILLAIN' : 'HERO', sub = side ? 'Terrorize the city' : 'Save the people', sz0 = Math.round(VH * .44);
    g.textAlign = 'left'; g.font = Deco.disp(sz0);
    const mw = g.measureText(word).width, size = Math.min(sz0, Math.floor(sz0 * textW / mw)), wy = VH * .5, reveal = d => calm ? 1 : Math.max(0, Math.min(1, (since - d) / .34));
    g.font = '600 15px "Barlow Semi Condensed","Arial Narrow",sans-serif'; g.fillStyle = Deco.PAPER; g.globalAlpha = reveal(.04); g.fillText('You are a', textX + 2, wy - size * .52 - 13); g.globalAlpha = 1;
    const r0 = reveal(.08), slide = (1 - r0) * (1 - r0) * 26;
    g.font = Deco.disp(size); g.globalAlpha = r0;
    // Two hard tones, split across the middle of the letters.
    g.save(); g.beginPath(); g.rect(0, 0, VW, wy); g.clip(); g.fillStyle = hi; g.fillText(word, textX + slide, wy); g.restore();
    g.save(); g.beginPath(); g.rect(0, wy, VW, VH); g.clip(); g.fillStyle = acc; g.fillText(word, textX + slide, wy); g.restore();
    g.globalAlpha = 1;
    const r1 = reveal(.2), ly = wy + size * .5 + 8, lw = Math.min(textW, g.measureText(word).width) * r1;
    g.fillStyle = acc; g.fillRect(textX + 2, ly, lw, 1);
    g.font = '500 17px "Barlow Semi Condensed","Arial Narrow",sans-serif'; g.fillStyle = Deco.PAPER; g.globalAlpha = r1; g.fillText(sub, textX + 2, ly + 16); g.globalAlpha = 1;
    // The light of the impact: one long streak and a quick flash.
    if (!calm && since < .5) {
      const q = since / .5, sw = VW * (.6 + q * 1.1), sh = 34 * (1 - q) + 4;
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 1 - q; g.drawImage(Deco.streak(rgb), cxF - sw / 2, cyF - sh / 2, sw, sh); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }
    if (!calm && since < .12) { g.globalAlpha = (1 - since / .12) * .75; g.fillStyle = '#fff'; g.fillRect(-20, -20, VW + 40, VH + 40); g.globalAlpha = 1; }
    g.setTransform(k, 0, 0, k, 0, 0);
    g.fillStyle = '#000'; g.fillRect(0, 0, VW, bar * (1 - cut)); g.fillRect(0, VH - bar * (1 - cut), VW, bar * (1 - cut));
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
        Hud.coinTo(cv, Art.champCoin(s.champ, team, seatTier(s), 80, s.finish));
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
  let flipT = 0, heroA = .3, heroSweep = 0;
  function heroStep(dt) {
    if (hidden('lobby') || !L.seats) return;
    const c = $('big'), g = c.getContext('2d'), id = mine().champ, spr = Art.champCoin(id, L.team, Sim.tierOf(pts(id)), 230, mine().finish);
    if (!calm) { heroA += dt * .9; heroSweep = (heroSweep + dt / 4) % 1; }
    if (flipT > 0) flipT = Math.max(0, flipT - dt * 2.4);
    const ang = calm ? 0 : Math.sin(heroA) * .28 + flipT * TAU;
    g.clearRect(0, 0, 520, 520);
    g.drawImage(halo(L.team), 0, 0, 520, 520);
    spinCoin(g, spr, 260, 258, 196, ang);
    sweepCoin(g, 260, 258, 196, ang, heroSweep * 4 < 1 ? heroSweep * 4 : -1);
  }

  // ---------- end screen ----------
  let E = null;
  function showEnd(r) {
    const st = Object.assign({ kills: 0, deaths: 0, assists: 0, skillHits: 0, casts: 0, parries: 0 }, r.me.stats), tier = Sim.tierOf(r.before);
    hide('shop'); hide('evo'); hide('prac'); hide('pause'); Ctl.reset();
    L.team = r.me.team; applySide();
    $('again').textContent = N.mode ? 'Back to room' : 'Play again';
    $('again').classList.toggle('hide', N.mode === 'guest' && !N.peer);
    $('end').classList.toggle('win', r.won); $('end').classList.toggle('lose', !r.won);
    $('endT').textContent = r.won ? 'Victory' : 'Defeat';
    $('endT').style.color = '';
    $('endW').textContent = r.s.over.winner === 0 ? 'City saved' : 'City fallen';
    const pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    $('endS').textContent = `${pl(st.kills, 'takedown')}, ${pl(st.deaths, 'death')}, ${pl(st.assists, 'assist')}. ${st.skillHits} of ${st.casts} abilities landed${st.parries ? `, ${pl(st.parries, 'hit')} parried` : ''}.`;
    Hud.scoreTable($('eBoard'), r.s, r.me);
    const ranked = r.rankBefore !== undefined && r.rankAfter !== undefined;
    E = { t: 0, r, name: charName(r.me.team, r.me.champ), tier, draw: tier, flip: 0, shine: -1, p: r.before, ang: 0, rank: ranked ? { from: r.rankBefore, to: r.rankAfter, tier: rankInfo(r.rankBefore).tier, shown: Math.round(r.rankBefore) } : null };
    endText(); $('endBar').style.width = endFrac(r.before) * 100 + '%';
    $('endRow').classList.toggle('hide', !ranked);
    if (ranked) {
      const d = Math.round(r.rankAfter - r.rankBefore), box = $('rDelta');
      paintRank($('endRank'), r.rankBefore);
      box.textContent = d > 0 ? `+${d}` : d < 0 ? `\u2212${-d}` : '0'; box.classList.toggle('down', d < 0);
    }
    // Marks were banked by finishMatch; this rolls the number up.
    const earned = Math.max(0, Math.round(r.marks || 0));
    E.marks = earned ? { from: 0, to: earned, shown: -1, balance: save.marks } : null;
    $('endMk').classList.toggle('hide', !earned);
    if (earned) { $('endMks').textContent = '+0'; $('endBal').textContent = ''; }
    hide('rankup');
    show('end');
    Sound.play('thud');
  }
  function endFrac(p) { const t = Sim.tierOf(p), n = TIERS[t + 1]; return n ? (p - TIERS[t].at) / (n.at - TIERS[t].at) : 1; }
  function endText() {
    const r = E.r, t = Sim.tierOf(E.p), n = TIERS[t + 1], risen = t > Sim.tierOf(r.before);
    const lead = risen ? `Your ${E.name} coin is now ${TIERS[t].name}. ` : '';
    $('endM').textContent = `${lead}+${r.gain} proficiency${n ? `, ${Math.ceil(n.at - E.p)} to ${n.name}` : ''}`;
  }
  const tierUp = () => Sound.play('masteryUnlock');
  // A new rank gets its own moment over the results, and a tap or two seconds clears it.
  function rankUp(info) {
    Sound.play('rankUp');
    const x = $('rankup'), col = RANK_COL[Math.min(5, info.tier)];
    x.style.setProperty('--rc', col);
    x.innerHTML = `<div class="rkup">${rankBadge(info.tier, col)}<em>New rank</em><b>${info.name}</b></div>`;
    x.classList.remove('out'); show('rankup');
    Sound.play('flipReveal', E.r.me.team);
    const close = () => { clearTimeout(x._t); x.onclick = null; x.classList.add('out'); setTimeout(() => { hide('rankup'); x.classList.remove('out'); }, 220); };
    x.onclick = close; clearTimeout(x._t); x._t = setTimeout(close, 2400);
  }
  function rankStep() {
    const R = E.rank; if (!R) return;
    const f = calm ? 1 : Math.min(1, Math.max(0, (E.t - .7) / 1.4)), v = R.from + (R.to - R.from) * (1 - Math.pow(1 - f, 3)), n = Math.round(v);
    if (n === R.shown) return;
    R.shown = n; paintRank($('endRank'), n);
    const info = rankInfo(n);
    if (info.tier > R.tier) rankUp(info);
    R.tier = info.tier;
  }
  function endStep(dt) {
    if (!E || hidden('end')) return;
    const r = E.r; E.t += dt; rankStep();
    if (E.marks && !E.marks.done) {
      const f = calm ? 1 : Math.min(1, Math.max(0, (E.t - 1.1) / .9)), n = Math.round(E.marks.to * (1 - Math.pow(1 - f, 3)));
      if (n !== E.marks.shown) { E.marks.shown = n; $('endMks').textContent = `+${n}`; if (!calm && f < 1 && n % 3 === 0) Sound.play('tick'); }
      if (f >= 1) { E.marks.done = true; $('endBal').textContent = `${E.marks.balance} total`; Sound.play('coin'); }
    }
    const f = calm ? 1 : Math.min(1, Math.max(0, (E.t - .5) / 1.5)), ease = 1 - Math.pow(1 - f, 3), p = r.before + r.gain * ease;
    if (p !== E.p) {
      E.p = p; $('endBar').style.width = endFrac(p) * 100 + '%'; endText();
      const t = Sim.tierOf(p);
      if (t > E.tier) { E.tier = t; E.flip = 1; E.shine = -1; tierUp(); }
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
    L.practice = L.practice && !reroll;
    if (!reroll) { versus(); return true; }
    // Play again: the flip decides the new side, then straight to the versus splash.
    rollSide(); applySide();
    flipStart(L.team, () => versus(), true);
    hide('end');
    return true;
  }

  // ---------- screens ----------
  let curScr = null, pressed = null;
  function scr(id) {
    if (curScr === id) return;
    const out = curScr; curScr = id;
    if (out) { const o = $(out); o.classList.remove('in'); o.classList.add('out'); setTimeout(() => { if (curScr !== out) o.classList.add('hide'); o.classList.remove('out'); }, 170); }
    if (id === 'menu') { paintRank($('mRank'), myRank()); paintMarks(); }
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
    for (const id of ['lobby', 'end', 'rankup', 'pause', 'shop', 'evo', 'prac', 'sheet', 'settings', 'hudEd', 'notice', 'flip', 'vs']) hide(id);
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
    N.mode = null; N.peer = false; N.joining = false; N.lobby = false; N.ranks = { h: null, g: null }; N.seq = 0; N.ack = 0; N.wasReady = false; N.ready = { h: false, g: false };
    if (was && hasNet()) { try { Net.leave(); } catch (e) { } }
  }
  const inviteUrl = () => location.href.split('#')[0] + '#' + N.code;
  const roomMsg = () => ({ k: 'room', pairing: N.pairing, rank: myRank() });
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
      N.peer = false; N.ready = { h: false, g: false }; N.ranks[N.mode === 'host' ? 'g' : 'h'] = null;
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
    if (o.k === 'hello' && N.mode === 'host') { N.ranks.g = cleanRank(o.rank); say(roomMsg()); if (curScr === 'room') renderRoom(); }
    else if (o.k === 'room' && N.mode === 'guest') { N.pairing = o.pairing; N.ranks.h = cleanRank(o.rank); if (curScr === 'room') renderRoom(); }
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
    const names = shuffle(BOT_NAMES.slice()), gTeam = N.pairing === 'same' ? side : 1 - side;
    let n = 0;
    L.seats = [0, 1].map(team => {
      const ros = rosterOf(team), pool = shuffle(ros.slice()).slice(0, 4), humans = [];
      if (team === side) { humans.push('h'); const want = wantFor(team), at = pool.indexOf(want); if (at >= 0) [pool[at], pool[0]] = [pool[0], pool[at]]; else pool[0] = want; }
      if (team === gTeam) humans.push('g');
      const roles = Sim.autoRoles(pool);
      return pool.map((champ, i) => {
        const who = humans[i] || null;
        return { champ, role: roles[i], tier: who ? 0 : Math.min(5, Math.floor(Math.random() * Math.random() * 6)), human: !!who, name: who === 'h' ? 'Host' : who === 'g' ? 'Guest' : names[n++], who, build: botBuild(champ, roles[i]) };
      });
    });
    L.team = side; L.slot = 0;
    wearMine(L.seats[side][0]);
  }
  function stateMsg() {
    for (const row of L.seats) for (const s of row) if (isMe(s)) s.tier = seatTier(s);
    return { k: 'state', seats: L.seats, ready: N.ready, pairing: N.pairing, side: N.side, ack: N.ack };
  }
  // A change on this phone: the host refits the bots and tells the guest, the guest tells the host.
  function netPicked() {
    if (!N.mode) return;
    if (N.mode === 'host') { N.ready.h = false; refitBots(L.team); say(stateMsg()); }
    else { N.ready.g = false; sendPick(); }
  }
  function sendPick() { const m = mine(); wearMine(m); N.seq++; say({ k: 'pick', seq: N.seq, champ: m.champ, role: m.role, tier: seatTier(m), build: m.build, finish: m.finish, trail: m.trail, recall: m.recall, ready: N.ready.g }); }
  function hostPick(o) {
    N.ack = o.seq;
    let team = -1, i = -1;
    L.seats.forEach((r, t) => r.forEach((s, x) => { if (s.who === 'g') { team = t; i = x; } }));
    if (team < 0) return;
    const row = L.seats[team], g = row[i], blocked = (key, v) => row.some(o2 => o2 !== g && o2.who && o2[key] === v);
    if (rosterOf(team).includes(o.champ) && !blocked('champ', o.champ)) setChamp(team, i, o.champ);
    if (Sim.ROLES.includes(o.role) && !blocked('role', o.role)) setRole(team, i, o.role);
    g.tier = Math.max(0, Math.min(5, o.tier | 0));
    g.build = buildsOf(g.champ).some(b => b.id === o.build) ? o.build : botBuild(g.champ, g.role);
    g.finish = cleanCos('finish', o.finish); g.trail = cleanCos('trail', o.trail); g.recall = cleanCos('recall', o.recall);
    refitBots(team);
    N.ready.g = !!o.ready;
    say(stateMsg());
    if (N.lobby) { renderLobby(); if (L.sheet) renderSheet(); }
  }
  function applyState(o) {
    const had = L.seats && N.lobby ? mine() : null, keep = had && o.ack < N.seq ? { champ: had.champ, role: had.role, build: had.build, ready: N.ready.g } : null;
    L.seats = o.seats; N.ready = o.ready; N.pairing = o.pairing; N.side = o.side;
    L.seats.forEach((r, t) => r.forEach((s, i) => { if (s.who === 'g') { L.team = t; L.slot = i; } }));
    if (keep) { const m = mine(); m.champ = keep.champ; m.role = keep.role; m.build = keep.build; N.ready.g = keep.ready; }
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
        const m = mine(), want = wantFor(L.team);
        if (rosterOf(L.team).includes(want) && want !== m.champ && !friendHolds('champ', want)) { setChamp(L.team, L.slot, want); renderLobby(); }
        wearMine(mine());
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
  function roomCoin(host, side, title, sub, joined, rank) {
    host.textContent = ''; host.classList.toggle('joined', !!joined);
    if (side === null) { const q = document.createElement('div'); q.className = 'rq'; q.textContent = '?'; host.append(q); }
    else { const c = document.createElement('canvas'); c.width = c.height = 120; Hud.coinTo(c, Deco.face(side, 120)); host.append(c); }
    const t = document.createElement('div'), b = document.createElement('b'), sm = document.createElement('small');
    b.textContent = title; sm.textContent = sub;
    if (rank !== null && rank !== undefined) { const e = document.createElement('em'); e.textContent = rankInfo(rank).name + ' '; sm.prepend(e); }
    t.append(b, sm); host.append(t);
  }
  let peerShown = false;
  function renderRoom() {
    const isHost = N.mode === 'host';
    $('rH').textContent = isHost ? 'Your room' : "Friend's room";
    $('rCode').textContent = N.code || '-----';
    $('rLink').textContent = N.code ? inviteUrl().replace(/^[a-z]+:\/+/, '') : '';
    for (const id of ['rCopy', 'rShare', 'rLink']) $(id).classList.toggle('hide', !isHost);
    $('rCopy').disabled = $('rShare').disabled = !N.code;
    const peerNew = N.peer && !peerShown; peerShown = N.peer;
    roomCoin($('rMe'), isHost ? 0 : 1, 'You', isHost ? 'Host' : 'Joined', false, myRank());
    if (N.peer) roomCoin($('rFr'), isHost ? 1 : 0, isHost ? 'Friend' : 'Host', 'Connected', peerNew, N.ranks[isHost ? 'g' : 'h']);
    else roomCoin($('rFr'), null, 'Friend', 'Not here yet');
    $('rStat').innerHTML = !isHost ? `Connected! Waiting for the host to flip${DOTS}`
      : !N.code ? `Opening your room${DOTS}`
        : !N.peer ? `Send the code to a friend. Waiting for them${DOTS}`
          : 'Your friend is here. Pick teams, then flip!';
    if (isHost && N.code && !N.peer && N.left) $('rStat').innerHTML = `Your friend left. They can rejoin with this code${DOTS}`;
    document.querySelectorAll('#rTeam [data-t]').forEach(b => b.setAttribute('aria-pressed', b.dataset.t === N.pairing));
    $('rTeam').classList.toggle('ro', !isHost);
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
    N.mode = 'host'; N.code = ''; N.peer = false; N.left = false; N.pairing = 'same';
    openRoom();
    try { Net.host(); } catch (e) { notice('Connection trouble', "We couldn't open a room just now. Try again in a moment."); }
  }
  function backToRoom() {
    const go = () => { paused = false; G = null; Ctl.reset(); clearAll(); Sound.setMode('menu'); openRoom(); say(N.mode === 'guest' ? { k: 'hello', rank: myRank() } : roomMsg()); };
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
    N.pairing = 'same';
    openRoom(); Sound.play('friendJoin');
    say({ k: 'hello', rank: myRank() });
  }
  function buildKeypad() {
    const kb = $('kb');
    for (const row of ['23456789', 'QWERTYP', 'ASDFGHJK', 'ZXCVBNM']) {
      const r = document.createElement('div'); r.className = 'kr';
      for (const ch of row) { const b = document.createElement('button'); b.textContent = ch; b.onclick = () => press(ch); r.append(b); }
      if (row[0] === 'Z') {
        const b = document.createElement('button'); b.className = 'wide'; b.setAttribute('aria-label', 'Delete');
        b.innerHTML = '<svg viewBox="0 0 34 24" aria-hidden="true"><path d="M11 2h20a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H11L2 12z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m16 8 9 8m0-8-9 8" stroke="currentColor" stroke-width="1.8"/></svg>';
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

  // ---------- how to play: five small lit scenes ----------
  let howDone = false;
  function buildHow() {
    if (howDone) return; howDone = true;
    const { INK, PAPER, MUTE, GOLD, GOLD2, STEEL, NAVY, NAVY2, CRIM, CRIM2 } = Deco, W_ = 360, H_ = 380;
    const blitS = (g, spr, x, y, r) => { const h = spr.S * r / spr.R; g.drawImage(spr.c, x - h / 2, y - h / 2, h, h); };
    const page = (id, side, draw) => {
      const c = $(id), g = c.getContext('2d');
      g.fillStyle = side ? '#0d0e12' : NAVY2; g.fillRect(0, 0, W_, H_);
      g.fillStyle = side ? '#1b1d23' : '#142c56'; g.beginPath(); g.moveTo(0, 0); g.lineTo(W_ * .72, 0); g.lineTo(W_ * .28, H_); g.lineTo(0, H_); g.closePath(); g.fill();
      g.lineJoin = 'miter'; g.lineCap = 'butt'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.translate(0, 56);
      draw(g);
    };
    const lines = (g, pts_, col = STEEL, w = 3) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); for (const [x0, y0, x1, y1] of pts_) { g.moveTo(x0, y0); g.lineTo(x1, y1); } g.stroke(); };
    const arrow = (g, x0, y0, x1, y1, col) => {
      const a = Math.atan2(y1 - y0, x1 - x0), L_ = 22;
      g.strokeStyle = col; g.lineWidth = 3.5; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.moveTo(x1 - Math.cos(a - .5) * L_, y1 - Math.sin(a - .5) * L_); g.lineTo(x1, y1); g.lineTo(x1 - Math.cos(a + .5) * L_, y1 - Math.sin(a + .5) * L_); g.stroke();
    };
    const ring = (g, x, y, r, col, w = 2.5) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); };
    // A plain thumb in silhouette.
    const thumb = (g, x, y, ang) => { g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = '#c4cfdd'; g.beginPath(); g.moveTo(-30, 170); g.lineTo(-30, 12); g.quadraticCurveTo(-30, -26, 0, -26); g.quadraticCurveTo(30, -26, 30, 12); g.lineTo(30, 170); g.closePath(); g.fill(); g.fillStyle = '#8fa0b5'; g.beginPath(); g.moveTo(8, -24); g.quadraticCurveTo(30, -22, 30, 12); g.lineTo(30, 170); g.lineTo(14, 170); g.closePath(); g.fill(); g.restore(); };

    page('h1', 0, g => {
      lines(g, [[120, 66, 168, 66], [100, 104, 160, 104], [120, 142, 168, 142]], STEEL, 2.5);
      blitS(g, Art.champCoin('kade', 0, 2, 60), 250, 104, 58);
      g.fillStyle = 'rgba(6,7,11,.45)'; g.beginPath(); g.arc(112, 212, 58, 0, TAU); g.fill();
      ring(g, 112, 212, 58, 'rgba(233,237,244,.55)', 2);
      g.fillStyle = PAPER; g.beginPath(); g.arc(148, 198, 24, 0, TAU); g.fill();
      thumb(g, 153, 208, .35);
    });
    page('h2', 1, g => {
      blitS(g, Art.champCoin(rosterOf(1)[0], 1, 2, 50), 106, 82, 50);
      Deco.glint(g, 178, 116, 42, CRIM);
      blitS(g, Art.champCoin('kade', 0, 2, 66), 265, 194, 66);
      ring(g, 265, 194, 76, GOLD, 2.5);
      thumb(g, 292, 226, -.28);
    });
    page('h3', 0, g => {
      g.setLineDash([16, 12]); lines(g, [[236, 208, 84, 92]], PAPER, 3); g.setLineDash([]);
      lines(g, [[58, 66, 92, 100], [92, 66, 58, 100]], CRIM, 5);
      const abil = Art.abilityCoin('kade', 0, true, 40), d = 112; g.drawImage(abil, 252 - d / 2 * 1.04, 222 - d / 2 * 1.04, d * 1.04, d * 1.04);
      g.fillStyle = 'rgba(6,7,11,.75)'; g.beginPath(); g.arc(288, 66, 56, 0, TAU); g.fill(); ring(g, 288, 66, 56, CRIM, 2.5);
      g.font = Deco.disp(26); g.fillStyle = PAPER; g.fillText('CANCEL', 288, 68);
      arrow(g, 216, 134, 252, 100, CRIM);
      thumb(g, 148, 150, -.72);
    });
    page('h4', 1, g => {
      const bx = 34, bw = 292, by = 34, bh = 8;
      g.fillStyle = '#2f5a9e'; g.fillRect(bx, by, bw * .68, bh); g.fillStyle = CRIM2; g.fillRect(bx + bw * .68, by, bw * .32, bh);
      Deco.flip(g, bx + bw * .68, by + bh / 2, 24, 0, 120, 0);
      g.setLineDash([14, 11]); g.strokeStyle = 'rgba(233,237,244,.5)'; g.lineWidth = 2.5; g.beginPath(); g.ellipse(180, 178, 150, 72, 0, 0, TAU); g.stroke(); g.setLineDash([]);
      blitS(g, Art.champCoin('ione', 0, 3, 44), 100, 164, 42);
      for (const [x, y] of [[186, 140], [252, 162], [204, 208], [282, 220]]) {
        g.fillStyle = '#c4cfdd'; g.beginPath(); g.arc(x, y, 24, 0, TAU); g.fill();
        g.fillStyle = NAVY; g.beginPath(); g.arc(x, y - 7, 8, 0, TAU); g.fill();
        g.beginPath(); g.moveTo(x - 14, y + 15); g.quadraticCurveTo(x, y - 6, x + 14, y + 15); g.closePath(); g.fill();
      }
    });
    page('h5', 0, g => {
      const cells = [['top', 'gravel', 96, 58], ['jungle', 'sable', 264, 58], ['bottom', 'vesper', 96, 186], ['support', 'solenne', 264, 186]];
      for (const [role, kit, x, y] of cells) {
        blitS(g, Art.champCoin(kit, 0, 2, 44), x, y - 8, 44);
        g.font = Deco.disp(30); g.fillStyle = GOLD; g.fillText(Sim.ROLE_INFO[role].name.toUpperCase(), x, y + 58);
      }
    });
  }

  // ---------- wiring ----------
  function playBots() {
    if (F.on || W.on || V.on) return;
    netDrop(); L.practice = false; L.slot = 0; L.team = 0; rollSeats();
    Sound.play('tap');
    scr(null);
    enterLobby();
  }
  function startPractice() {
    if (F.on || W.on || V.on) return;
    netDrop(); L.practice = true; L.slot = 0; L.team = Math.random() < .5 ? 0 : 1; rollSeats();
    Sound.play('menuOpen');
    const go = () => { scr(null); applySide(); renderLobby(); show('lobby'); lobbyEnter(); };
    if (!wipe(go)) go();
  }
  function paintMarks() { $('mMarks').textContent = save.marks ? `${save.marks}` : ''; }
  function initMenus() {
    save.marks = save.marks || 0; save.owned = save.owned || []; save.equip = save.equip || {};
    rollSeats(); applySide(); renderLobby(); syncToggles(); buildKeypad(); wireNet();
    [0, 1].forEach(side => stage.style.setProperty('--bg' + side, `url(${Deco.backdrop(side).toDataURL('image/webp', .9)})`));
    paintRank($('mRank'), myRank());
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
    // Every press answers on touch-down, before the browser decides it was a click.
    addEventListener('pointerdown', e => { const b = e.target.closest && e.target.closest('button'); if (b) { b.classList.add('down'); pressed = b; } }, true);
    const lift = () => { if (pressed) { pressed.classList.remove('down'); pressed = null; } };
    addEventListener('pointerup', lift, true); addEventListener('pointercancel', lift, true);
    if (isStandalone()) { try { screen.orientation.lock('landscape').catch(() => { }); } catch (e) { } }
    paintMarks();

    $('mBots').onclick = playBots;
    $('mPrac').onclick = startPractice;
    $('mStore').onclick = () => { Sound.play('menuOpen'); renderStore(); scr('store'); };
    $('stBack').onclick = () => { Sound.play('menuBack'); paintMarks(); scr('menu'); };
    document.querySelectorAll('#stTab [data-k]').forEach(b => { b.onclick = () => { St.tab = b.dataset.k; St.sel = null; Sound.play('tap'); renderStore(); }; });
    $('mHost').onclick = () => { Sound.play('coin'); startHost(); };
    $('mJoin').onclick = () => { Sound.play('coin'); openJoin(''); };
    $('mHow').onclick = () => { Sound.play('menuOpen'); buildHow(); scr('how'); };
    $('mSet').onclick = () => { Sound.play('menuOpen'); syncToggles(); show('settings'); };
    // The coin is a toy: flip it and it answers.
    const QUIPS = [['Hold the line', 'The city is watching', 'Someone has to stand up', 'Not tonight'], ['Everyone has a price', 'The city sleeps. We do not', 'Flip it again. I dare you', 'Heads or tails, you lose']];
    let quip = 0, quipT = 0;
    $('shClose').onclick = () => { Hud.closeShop(); Sound.play('tap'); };
    $('prGold').onclick = () => Hud.practice('gold');
    $('prXp').onclick = () => Hud.practice('level');
    $('prCd').onclick = () => Hud.practice('reset');
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
    $('rFlip').onclick = () => { if (N.mode === 'host') hostFlip(); else { shake($('rFlip')); Sound.play('tick'); } };

    // lobby and overlays
    $('flip').onclick = () => flipSkip();
    $('flip').onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flipSkip(); } };
    $('openSet').onclick = () => { Sound.play('tap'); syncToggles(); show('settings'); };
    $('setDone').onclick = () => { Sound.play('tap'); hide('settings'); };
    $('sLeft').onclick = () => { setLeft(!(save.hud && save.hud.left)); Sound.play('tap'); syncToggles(); };
    document.querySelectorAll('#sAim [data-a]').forEach(b => { b.onclick = () => { save.aimSens = +b.dataset.a; persist(); Sound.play('tap'); syncToggles(); }; });
    $('sEdit').onclick = openHudEd;
    $('hDone').onclick = () => { Sound.play('tap'); hide('hudEd'); persist(); hud(); syncToggles(); show('settings'); };
    $('hReset').onclick = () => { hudSave().pos = {}; persist(); hud(); buildHudEd(); Sound.play('coin'); };
    $('hLeft').onclick = () => { setLeft(!hudSave().left); buildHudEd(); Sound.play('tap'); };
    $('pSide').onclick = () => { if (!L.practice) return; L.team = 1 - L.team; rollSeats(); applySide(); Sound.play('flipSpin'); renderLobby(); flipT = 1; };
    document.querySelectorAll('#wTab [data-t]').forEach(b => { b.onclick = () => { L.tab = b.dataset.t; Sound.play('tick'); renderWho(true); }; });
    $('lane').onclick = () => {
      const seat = mine(), rs = Sim.ROLES, at = rs.indexOf(seat.role);
      for (let i = 1; i <= rs.length; i++) { const r = rs[(at + i) % rs.length]; if (friendHolds('role', r)) continue; setRole(L.team, L.slot, r); Sound.play('tap'); netPicked(); renderLobby(); return; }
    };
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

  function animMenus(dt) { wipeStep(dt); flipStep(dt); vsStep(); titleStep(dt); heroStep(dt); endStep(dt); storeStep(dt); if (N.joining && hasNet() && Net.connected) guestIn(); }

  return { initMenus, animMenus, showEnd };
})();
