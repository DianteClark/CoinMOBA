// Client: rendering, touch controls, HUD, lobby.
(() => {
  const $ = id => document.getElementById(id);
  const { TILT, TAU, TEAM } = Art, DT = Sim.DT;
  const stage = $('stage'), view = $('view'), ctx = view.getContext('2d', { alpha: false });
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let VW = 800, VH = 400, rotated = false, dpr = 2, quality = 2, Z = 1;

  function layout() {
    const w = innerWidth, h = innerHeight; rotated = h > w;
    VW = rotated ? h : w; VH = rotated ? w : h;
    stage.style.width = VW + 'px'; stage.style.height = VH + 'px';
    stage.style.transform = rotated ? `translate(${w}px,0) rotate(90deg)` : 'none';
    resize(); Z = VW / 1020; hud();
  }
  function resize() { dpr = Math.min(devicePixelRatio || 1, quality >= 2 ? 2 : quality === 1 ? 1.5 : 1); view.width = VW * dpr; view.height = VH * dpr; }
  addEventListener('resize', layout); addEventListener('orientationchange', () => setTimeout(layout, 120));
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('touchmove', e => { if (!e.target.closest('.panel')) e.preventDefault(); }, { passive: false });

  // ---------- saved progress ----------
  const KEY = 'mintfall.v1';
  let save = { m: {}, sound: true, diff: 'normal', hints: 0 };
  try { const raw = localStorage.getItem(KEY); if (raw) save = Object.assign(save, JSON.parse(raw)); } catch (e) { }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { } };
  const pts = id => save.m[id] || 0;

  // ---------- sound ----------
  let ac = null;
  function audio() { if (!ac) try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } if (ac && ac.state === 'suspended') ac.resume(); }
  function tone(f, d, type = 'triangle', v = .06, sl = 1) { if (!ac || !save.sound) return; const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime; o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * sl, t + d); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0008, t + d); o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + d); }
  const clink = () => { tone(2600, .09, 'sine', .035); tone(3900, .06, 'sine', .02); };
  const thud = () => tone(120, .2, 'sine', .14, .5);
  const ping = () => { tone(880, .16, 'triangle', .07); setTimeout(() => tone(1320, .2, 'triangle', .06), 70); };

  // ---------- lobby ----------
  const ids = Object.keys(Sim.KITS);
  const BOT_NAMES = ['Penny', 'Florin', 'Ducat', 'Groat', 'Thaler', 'Guinea', 'Tanner', 'Sovereign', 'Bezant', 'Kopek'];
  const L = { champ: ids[0], team: 0, slot: 0, roster: null };
  function reroll() {
    const pick = (ex) => ids.filter(x => x !== ex).sort(() => Math.random() - .5);
    L.roster = [pick(), pick()].map(a => a.slice(0, 4).map(c => ({ champ: c, tier: Math.min(5, Math.floor(Math.random() * Math.random() * 6)) })));
  }
  reroll();
  function paintCoinTo(cv2, spr, sx = 1) { const g = cv2.getContext('2d'); g.clearRect(0, 0, cv2.width, cv2.height); g.save(); g.translate(cv2.width / 2, cv2.height / 2); g.scale(sx, 1); const k = cv2.width / spr.S; g.drawImage(spr.c, -spr.S * k / 2, -spr.S * k / 2, spr.S * k, spr.S * k); g.restore(); }
  function rosterFor(team) {
    const a = L.roster[team].map(o => ({ ...o }));
    const mine = pts(L.champ), used = new Set();
    if (team === L.team) { const dupe = a.findIndex(o => o.champ === L.champ); if (dupe >= 0 && dupe !== L.slot) { a[dupe].champ = a[L.slot].champ; } a[L.slot] = { champ: L.champ, tier: Sim.tierOf(mine), me: true }; }
    return a;
  }
  function renderLobby() {
    const k = Sim.KITS[L.champ], p = pts(L.champ), tier = Sim.tierOf(p), next = Sim.TIERS[tier + 1], base = Sim.TIERS[tier].at;
    $('wN').textContent = k.name; $('wT').textContent = `${k.role}. ${k.blurb}`;
    $('wTier').textContent = next ? `${Sim.TIERS[tier].name} border` : 'Aether border, the highest';
    $('wBar').style.width = (next ? (p - base) / (next.at - base) * 100 : 100) + '%';
    $('wA').innerHTML = k.kit.map(a => `<div><em>${a.name}</em> ${a.d}</div>`).join('');
    const pk = $('picks'); pk.innerHTML = '';
    ids.forEach(id => { const b = document.createElement('button'); b.setAttribute('aria-label', Sim.KITS[id].name); b.setAttribute('aria-pressed', id === L.champ); const c = document.createElement('canvas'); c.width = c.height = 120; b.append(c); paintCoinTo(c, Art.champCoin(id, L.team, Sim.tierOf(pts(id)), 54)); b.onclick = () => { L.champ = id; flipT = 1; ping2(); renderLobby(); }; pk.append(b); });
    [0, 1].forEach(team => {
      const el = $('s' + team); el.innerHTML = ''; const list = rosterFor(team);
      list.forEach((o, i) => { const b = document.createElement('button'); const me = team === L.team && i === L.slot; b.setAttribute('aria-label', me ? 'Your seat' : 'Take this seat'); if (me) b.setAttribute('aria-current', 'true'); const c = document.createElement('canvas'); c.width = c.height = 100; b.append(c); paintCoinTo(c, Art.champCoin(o.champ, team, o.tier, 46)); b.onclick = () => { L.team = team; L.slot = i; renderLobby(); }; el.append(b); });
    });
    document.querySelectorAll('.seg [data-d]').forEach(b => b.setAttribute('aria-pressed', b.dataset.d === save.diff));
    $('snd').textContent = save.sound ? 'Sound on' : 'Sound off'; $('snd').setAttribute('aria-pressed', save.sound);
  }
  const ping2 = () => { audio(); clink(); };
  document.querySelectorAll('.seg [data-d]').forEach(b => b.onclick = () => { save.diff = b.dataset.d; persist(); renderLobby(); });
  $('snd').onclick = () => { save.sound = !save.sound; persist(); renderLobby(); };
  let flipT = 0, spinA = 0;
  function animLobby(dt) {
    if ($('lobby').classList.contains('hide')) return;
    if (!calm) spinA += dt * .75; if (flipT > 0) flipT = Math.max(0, flipT - dt * 2.4);
    const big = $('big'), spr = Art.coin(L.champ, 230, L.champ, Art.METAL[L.champ], L.team, Sim.tierOf(pts(L.champ))), g = big.getContext('2d');
    const sx = calm ? 1 : Math.cos(Math.sin(spinA) * .62 + flipT * Math.PI * 2);
    g.clearRect(0, 0, 520, 520); g.save(); g.translate(260, 260);
    const R = 236, abs = Math.abs(sx), T = 26 * Math.sqrt(1 - sx * sx);
    g.globalAlpha = .36; g.fillStyle = '#04100e'; g.beginPath(); g.ellipse(14, 20, R * Math.max(abs, .1) + T, R, 0, 0, TAU); g.fill(); g.globalAlpha = 1;
    const dir = sx >= 0 ? 1 : -1;
    for (let i = T; i > 0; i -= 2) { g.fillStyle = i % 8 < 4 ? '#7d5a26' : '#a97e38'; g.beginPath(); g.ellipse(-dir * i, 0, R * abs, R, 0, 0, TAU); g.fill(); }
    g.scale(abs, 1); g.drawImage(spr.c, -spr.S / 2, -spr.S / 2); g.restore();
  }
  $('start').onclick = () => { audio(); startMatch(); };
  $('again').onclick = () => { reroll(); $('end').classList.add('hide'); startMatch(); };
  $('tolobby').onclick = () => { $('end').classList.add('hide'); toLobby(); };
  $('resume').onclick = () => { paused = false; $('pause').classList.add('hide'); };
  $('leave').onclick = () => { paused = false; $('pause').classList.add('hide'); toLobby(); };
  function toLobby() { G = null; reroll(); renderLobby(); $('lobby').classList.remove('hide'); $('forge').classList.add('hide'); }

  // ---------- match ----------
  let G = null, paused = false;
  function startMatch() {
    const teams = [0, 1].map(team => rosterFor(team).map((o, i) => ({ champ: o.champ, tier: o.tier, human: !!o.me, name: o.me ? 'You' : BOT_NAMES[(i + team * 5)] })));
    const s = Sim.createMatch({ seed: Date.now() & 0xffffff, diff: save.diff, teams });
    const me = s.champs.find(c => c.human);
    const ground = Art.paintGround(s.map);
    const r = (() => { let v = 77; return () => (v = (v * 16807) % 2147483647) / 2147483647; })();
    const decor = [];
    const tree = (x, y) => decor.push({ x, y, v: Math.floor(r() * 3) });
    for (const w of s.map.walls) if (w.big) { const cnt = 22; for (let i = 0; i < cnt; i++) tree(w.x + r() * w.w, w.y + r() * w.h); }
    for (let x = 340; x < Sim.W - 300; x += 60 + r() * 50) { tree(x, 30 + r() * 62); tree(x, Sim.H - 34 - r() * 60); }
    for (let y = 330; y < Sim.H - 300; y += 70 + r() * 50) { tree(8 + r() * 26, y); tree(Sim.W - 8 - r() * 26, y); }
    G = {
      s, me, ground, decor, cam: { x: me.x, y: me.y }, acc: 0, t: 0, fx: [], text: [], corpses: [], shake: 0, flash: 0, banner: null, feed: [], vis: new Map(),
      rain: 0, rainNext: 95 + Math.random() * 40, bolt: 0, drops: [], ripples: [], motes: Array.from({ length: 30 }, () => ({ x: Math.random(), y: Math.random(), p: Math.random() * 6 })),
      fog: Array.from({ length: 7 }, (_, i) => ({ x: Math.random() * Sim.W, y: Math.random() * Sim.H, r: 420 + Math.random() * 360, v: 8 + Math.random() * 14 })),
      hintT: save.hints < 3 ? 9 : 0, frames: 0, ms: 0, ended: false, lastHp: me.hp,
    };
    save.hints++; persist();
    Ctl.reset(); hud(); $('lobby').classList.add('hide'); $('forge').classList.add('hide');
  }

  // ---------- controls ----------
  const Ctl = {
    p: new Map(), stick: null, aim: null, atk: null, reset() { this.p.clear(); this.stick = null; this.aim = null; this.atk = null; },
    pt(e) { return rotated ? { x: e.clientY, y: innerWidth - e.clientX } : { x: e.clientX, y: e.clientY }; },
  };
  let UI = {};
  function hud() {
    const bx = VW - 92, by = VH - 80;
    UI = {
      atk: { x: bx, y: by, r: 46 },
      ab: [{ x: bx - 104, y: by + 18, r: 33 }, { x: bx - 78, y: by - 78, r: 33 }, { x: bx + 4, y: by - 112, r: 33 }],
      pause: { x: VW / 2 + 88, y: 22, r: 16 },
      forge: { x: 72, y: 74, w: 96, h: 34 }, recall: { x: 176, y: 74, w: 86, h: 34 },
      map: { x: VW - 44 - 156, y: 8, w: 156, h: 92 },
    };
  }
  const inBtn = (b, p, pad = 10) => Math.hypot(p.x - b.x, p.y - b.y) < b.r + pad;
  const inRect = (b, p) => p.x > b.x - 6 && p.x < b.x + b.w + 6 && p.y > b.y - 6 && p.y < b.y + b.h + 6;

  function quickTarget(me, a) {
    const r = (a.range || 600) + 80; let best = null, bd = r;
    for (const e of G.s.champs) if (e.alive && e.team !== me.team && Sim.canSee(G.s, me.team, e)) { const d = Math.hypot(e.x - me.x, e.y - me.y); if (d < bd) { bd = d; best = e; } }
    if (!best) for (const m of [...G.s.minions, ...G.s.monsters]) if (m.alive && m.team !== me.team) { const d = Math.hypot(m.x - me.x, m.y - me.y); if (d < bd) { bd = d; best = m; } }
    return best;
  }
  function worldFromAim(me, a, dx, dy) {
    const wx = dx / Z, wy = dy / (Z * TILT), l = Math.hypot(wx, wy) || 1;
    const screenLen = Math.hypot(dx, dy), k = Math.min(1, screenLen / 96), reach = a.shape === 'circle' ? (a.range || 0) * k : (a.range || 0);
    return { tx: me.x + wx / l * reach, ty: me.y + wy / l * reach };
  }

  view.addEventListener('pointerdown', e => {
    e.preventDefault(); if (!G || G.ended) return; audio();
    try { view.setPointerCapture(e.pointerId); } catch (_) { }
    const p = Ctl.pt(e), me = G.me;
    if (inBtn(UI.pause, p, 8)) { paused = true; $('pause').classList.remove('hide'); return; }
    if (inRect(UI.forge, p)) { toggleForge(); return; }
    if (inRect(UI.recall, p)) { if (me.alive) { me.q.push({ t: 'recall' }); tone(500, .3, 'sine', .05, 1.6); } return; }
    if (!$('forge').classList.contains('hide') && p.x < VW * .5) { $('forge').classList.add('hide'); }
    if (inBtn(UI.atk, p, 14)) { Ctl.p.set(e.pointerId, { role: 'atk' }); Ctl.atk = e.pointerId; return; }
    for (let i = 0; i < 3; i++) if (inBtn(UI.ab[i], p, 9)) {
      const a = me.kit[i]; if (!me.alive) return;
      const recast = me.recast[i] > 0 && a.recast;
      if (i === 2 && me.lvl < 3) { G.banner = { t: 1.4, s: 'Ultimate unlocks at level 3' }; return; }
      if (a.shape === 'self' && !recast) { me.q.push({ t: 'cast', slot: i, tx: me.x, ty: me.y }); return; }
      if (recast && me.champ === 'sable') { me.q.push({ t: 'cast', slot: i, tx: me.x, ty: me.y }); return; }
      if (me.cd[i] > 0 && !recast) return;
      if (a.charge && !recast) me.q.push({ t: 'charge', slot: i });
      Ctl.aim = { slot: i, id: e.pointerId, sx: p.x, sy: p.y, dx: 0, dy: 0, moved: false, t: performance.now() };
      Ctl.p.set(e.pointerId, { role: 'aim' }); return;
    }
    if (p.x < VW * .55 && !Ctl.stick) { Ctl.stick = { id: e.pointerId, sx: p.x, sy: p.y, x: p.x, y: p.y }; Ctl.p.set(e.pointerId, { role: 'stick' }); }
  });
  view.addEventListener('pointermove', e => {
    if (!G) return; e.preventDefault(); const p = Ctl.pt(e);
    if (Ctl.stick && Ctl.stick.id === e.pointerId) { Ctl.stick.x = p.x; Ctl.stick.y = p.y; }
    if (Ctl.aim && Ctl.aim.id === e.pointerId) { const A = Ctl.aim; A.dx = p.x - A.sx; A.dy = p.y - A.sy; if (Math.hypot(A.dx, A.dy) > 16) A.moved = true; }
  });
  function endPointer(e, cancelled) {
    if (!G) return; const r = Ctl.p.get(e.pointerId); if (!r) return; Ctl.p.delete(e.pointerId); const me = G.me;
    if (r.role === 'stick') Ctl.stick = null;
    if (r.role === 'atk') Ctl.atk = null;
    if (r.role === 'aim' && Ctl.aim) {
      const A = Ctl.aim; Ctl.aim = null; const a = me.kit[A.slot], len = Math.hypot(A.dx, A.dy);
      if (cancelled || (A.moved && len < 16)) { me.q.push({ t: 'cancel' }); return; }
      if (!A.moved) {
        const t = quickTarget(me, a);
        if (t) me.q.push({ t: 'cast', slot: A.slot, tx: t.x, ty: t.y }); else me.q.push({ t: 'cast', slot: A.slot, tx: me.x + me.fx * 500, ty: me.y + me.fy * 500 });
      } else { const w = worldFromAim(me, a, A.dx, A.dy); me.q.push({ t: 'cast', slot: A.slot, tx: w.tx, ty: w.ty }); }
    }
  }
  view.addEventListener('pointerup', e => endPointer(e, false));
  view.addEventListener('pointercancel', e => endPointer(e, true));

  function applyInput() {
    const me = G.me, st = Ctl.stick;
    if (st) { let dx = st.x - st.sx, dy = st.y - st.sy; const l = Math.hypot(dx, dy), mx = 58; if (l > mx) { st.sx += dx * (1 - mx / l); st.sy += dy * (1 - mx / l); dx = st.x - st.sx; dy = st.y - st.sy; } const m = Math.hypot(dx, dy) / mx; if (m > .1) { const wy = dy / TILT, n = Math.hypot(dx, wy) || 1; me.mv.x = dx / n * Math.min(1, m * 1.3); me.mv.y = wy / n * Math.min(1, m * 1.3); } else { me.mv.x = me.mv.y = 0; } }
    else me.mv.x = me.mv.y = 0;
    me.atk = Ctl.atk !== null;
    if (Ctl.aim && me.charge) { const a = me.kit[Ctl.aim.slot], w = worldFromAim(me, a, Ctl.aim.dx || me.fx, Ctl.aim.dy || me.fy); me.q.push({ t: 'aim', tx: w.tx, ty: w.ty }); }
  }

  // ---------- forge ----------
  const FORGE = { edge: ['Edge', 'More damage from everything'], guard: ['Guard', 'More health and armour'], haste: ['Haste', 'Shorter cooldowns, faster feet'] };
  function toggleForge() { const f = $('forge'); f.classList.toggle('hide'); if (!f.classList.contains('hide')) drawForge(); }
  function drawForge() {
    const me = G.me, f = $('forge'); f.innerHTML = '';
    for (const k of ['edge', 'guard', 'haste']) {
      const n = me.up[k], cost = Sim.FORGE_COST[n], b = document.createElement('button'); b.className = 'f';
      b.innerHTML = `<span><b>${FORGE[k][0]} ${'●'.repeat(n)}${'○'.repeat(3 - n)}</b><small>${FORGE[k][1]}</small></span><span class="c">${n < 3 ? cost : 'Full'}</span>`;
      b.disabled = n >= 3 || me.gold < cost;
      b.onclick = () => { me.q.push({ t: 'forge', track: k }); setTimeout(() => { drawForge(); }, 60); ping(); };
      f.append(b);
    }
  }

  // ---------- projection and particles ----------
  const sx = x => (x - G.cam.x) * Z + VW / 2 + shX;
  const sy = y => (y - G.cam.y) * TILT * Z + VH / 2 + shY;
  let shX = 0, shY = 0;
  const lerp = (a, b, t) => a + (b - a) * t;
  function part(o) { if (G.fx.length > (quality >= 2 ? 240 : 110)) G.fx.shift(); G.fx.push(o); }
  function burst(x, y, n, col, sp = 240, life = .45, size = 12) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = sp * (.3 + Math.random() * .7); part({ x, y, z: 16, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: 90 + Math.random() * 180, life, max: life, size: size * (.6 + Math.random() * .6), col, type: 'spark' }); } }
  function coins(x, y, n, col = '#ffd777') { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = 70 + Math.random() * 170; part({ x, y, z: 22, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: 240 + Math.random() * 240, life: .9, max: .9, size: 7 + Math.random() * 4, col, type: 'coin', ph: Math.random() * 6 }); } }
  function ring(x, y, r, col, life = .4) { part({ x, y, z: 0, vx: 0, vy: 0, vz: 0, life, max: life, r, col, type: 'ring' }); }
  const FXCOL = { snipe: '#dcd7ff', snipeFull: '#b8a9ff', deadeye: '#c0afff', orb: '#7ff0df', ray: '#ffe69a', chain: '#d7b593', bolt: '#fff1c4', mbolt: '#d7e6f0', rupture: '#7ff0df', crash: '#ffc06a', heal: '#ffe69a', stomp: '#d7b593', dome: '#b6f0ff', break: '#ff9de2' };

  function handleEvents() {
    const s = G.s, by = id => s.champs.find(c => c.id === id) || s.minions.find(c => c.id === id) || s.monsters.find(c => c.id === id) || s.towers.find(c => c.id === id);
    for (const e of s.ev) {
      if (e.e === 'hit') {
        const u = by(e.u); if (!u) continue; const v = visOf(u); v.flash = 1;
        const onScreen = Math.abs(u.x - G.cam.x) < 640 && Math.abs(u.y - G.cam.y) < 440;
        if (onScreen) { burst(u.x, u.y, e.sk ? 7 : 3, e.crit ? '#ffb45e' : '#fff0c8', e.sk ? 260 : 150, .35, e.sk ? 13 : 9); if (u.kind === 'champ' || e.by === G.me.id) G.text.push({ x: u.x + (Math.random() - .5) * 34, y: u.y, z: 58, s: String(e.a), t: .75, max: .75, col: u.team === G.me.team && u.kind === 'champ' ? '#ff8b78' : e.crit ? '#ffc96a' : '#fff6e2', big: e.crit || e.sk }); if (u === G.me) { G.flash = .5; G.shake = Math.max(G.shake, 5); } else if (e.sk && e.by === G.me.id) { G.shake = Math.max(G.shake, 3); } if (e.sk) clink(); }
      } else if (e.e === 'heal') { const u = by(e.u); if (u) { G.text.push({ x: u.x, y: u.y, z: 62, s: '+' + e.a, t: .9, max: .9, col: '#a7f0a2', big: true }); burst(u.x, u.y, 8, '#b6f5a8', 130, .6, 11); } }
      else if (e.e === 'die') {
        const u = by(e.u);
        if (u) { burst(u.x, u.y, e.kind === 'champ' ? 22 : 7, '#ffe29a', 300, .55, 12); coins(u.x, u.y, e.kind === 'champ' ? 12 : e.kind === 'tower' ? 26 : 3); if (u.kind !== 'tower') G.corpses.push({ u, x: u.x, y: u.y, t: 0, spr: spriteOf(u), R: drawR(u) }); }
        if (e.kind === 'tower') { G.shake = 15; thud(); }
        if (e.kind === 'champ') thud();
      } else if (e.e === 'gold') { const u = by(e.u); if (u === G.me) { G.text.push({ x: u.x + 22, y: u.y - 10, z: 46, s: '+' + e.a, t: .9, max: .9, col: '#ffd777' }); clink(); } }
      else if (e.e === 'boom') { ring(e.x, e.y, e.r, FXCOL[e.fx] || '#fff'); burst(e.x, e.y, e.r > 150 ? 22 : 10, FXCOL[e.fx] || '#fff', e.r * 2.2, .5, 14); if (Math.abs(e.x - G.cam.x) < 600 && Math.abs(e.y - G.cam.y) < 420) { G.shake = Math.max(G.shake, e.r > 150 ? 10 : 4); thud(); } }
      else if (e.e === 'phit') { burst(e.x, e.y, 5, FXCOL[e.fx] || '#fff', 200, .3, 11); }
      else if (e.e === 'blink') { ring(e.x, e.y, 70, '#d9c9ff', .3); burst(e.x, e.y, 10, '#d9c9ff', 220, .4, 11); }
      else if (e.e === 'parry') { const u = by(e.u); if (u) { ring(u.x, u.y, 130, '#fff5c6', .32); burst(u.x, u.y, 18, '#fff5c6', 380, .4, 13); G.shake = Math.max(G.shake, 7); tone(1900, .22, 'square', .05, 1.5); G.text.push({ x: u.x, y: u.y, z: 86, s: 'Parried', t: 1, max: 1, col: '#fff5c6', big: true }); } }
      else if (e.e === 'cast') { const u = by(e.u); if (u) { visOf(u).spin = 1; if (e.fx === 'slash') G.fx.push({ x: u.x, y: u.y, z: 0, vx: 0, vy: 0, vz: 0, life: .2, max: .2, type: 'slash', dx: e.dx, dy: e.dy }); if (e.fx === 'parry') ring(u.x, u.y, 70, '#fff5c6', .5); tone(640 + Math.random() * 160, .09, 'triangle', .03, 1.5); } }
      else if (e.e === 'level') { const u = by(e.u); if (u) { ring(u.x, u.y, 90, '#ffe69a', .55); if (u === G.me) { ping(); G.banner = { t: 1.3, s: u.lvl === 3 ? 'Ultimate unlocked' : `Level ${u.lvl}` }; } } }
      else if (e.e === 'tower') { G.banner = { t: 2.4, s: `${Sim.TEAM_NAMES[e.team]} lost a tower` }; }
      else if (e.e === 'bossup') { G.banner = { t: 2.6, s: 'The Hoard has surfaced at the centre' }; ping(); }
      else if (e.e === 'boss') { G.banner = { t: 2.8, s: `${Sim.TEAM_NAMES[e.team]} took the Hoard. Stronger strikes for 90 seconds` }; }
      else if (e.e === 'feed') { const a = by(e.a), b = by(e.b); G.feed.unshift({ a, b, t: 5 }); G.feed.length = Math.min(G.feed.length, 3); }
      else if (e.e === 'spawn') { const u = by(e.u); if (u) ring(u.x, u.y, 80, TEAM[u.team], .5); }
      else if (e.e === 'tshot') { }
    }
    s.ev.length = 0;
  }
  function visOf(u) { let v = G.vis.get(u.id); if (!v) { v = { flash: 0, spin: 0, hop: Math.random() * 6 }; G.vis.set(u.id, v); } return v; }
  function spriteOf(u) { if (u.kind === 'champ') return Art.champCoin(u.champ, u.team, u.tier); if (u.kind === 'minion') return Art.minionCoin(u.team, u.ranged); if (u.kind === 'monster') return Art.monsterCoin(u.big, u.boss); return null; }
  const drawR = u => u.kind === 'champ' ? 36 : u.kind === 'minion' ? (u.ranged ? 17 : 21) : u.boss ? 78 : u.big ? 44 : 25;

  // ---------- drawing ----------
  function drawCoin(spr, x, y, z, R, opt = {}) {
    const zz = Z, Rp = R * zz, squash = (opt.flip === undefined ? 1 : Math.abs(opt.flip)) * .84, spin = opt.spin === undefined ? 1 : Math.max(.08, Math.abs(opt.spin));
    const T = Rp * .2 * (opt.flip === undefined ? 1 : Math.sqrt(Math.max(.1, 1 - opt.flip * opt.flip * .4)));
    ctx.globalAlpha = (opt.alpha === undefined ? 1 : opt.alpha) * (opt.noshadow ? 0 : 1);
    if (!opt.noshadow) ctx.drawImage(Art.shadow(), x - Rp * 1.25, y - Rp * .78 * .8 + 4, Rp * 2.5, Rp * 1.8 * .78);
    ctx.globalAlpha = opt.alpha === undefined ? 1 : opt.alpha;
    const cy = y - z * zz;
    ctx.fillStyle = opt.edge || '#5a4426';
    ctx.beginPath(); ctx.ellipse(x, cy + T, Rp * spin, Rp * squash, 0, 0, TAU); ctx.fill();
    ctx.fillRect(x - Rp * spin, cy, 2 * Rp * spin, T);
    const k = (spr.S / (spr.R * 2)); ctx.drawImage(spr.c, x - Rp * k * spin, cy - Rp * k * squash, 2 * Rp * k * spin, 2 * Rp * k * squash);
    if (opt.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = opt.flash * .55; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(x, cy, Rp * spin * .96, Rp * squash * .96, 0, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
    ctx.globalAlpha = 1;
    return cy;
  }
  function pos(u, a) { return { x: lerp(u.px, u.x, a), y: lerp(u.py, u.y, a) }; }
  const pct = (a, b) => Math.max(0, Math.min(1, a / b));

  function bar(x, y, w, h, f, col) { ctx.fillStyle = 'rgba(6,20,18,.85)'; ctx.beginPath(); roundR(x - 1, y - 1, w + 2, h + 2, 2.5); ctx.fill(); ctx.fillStyle = col; ctx.fillRect(x, y, w * f, h); }
  function roundR(x, y, w, h, r) { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  const onScreen = (x, y, m = 90) => { const X = sx(x), Y = sy(y); return X > -m && X < VW + m && Y > -m - 40 && Y < VH + m + 60; };

  function drawChamp(c, a, list) {
    const s = G.s; if (!c.alive) return; if (!Sim.canSee(s, G.me.team, c)) return;
    const p = pos(c, a); if (!onScreen(p.x, p.y)) return;
    const moving = Math.hypot(c.vx, c.vy) > 20, v = visOf(c);
    list.push({ y: p.y, f() {
      const X = sx(p.x), Y = sy(p.y);
      v.hop += moving ? .3 : .05;
      v.spin = Math.max(0, v.spin - .06);
      v.flash = Math.max(0, v.flash - .1);
      const z = 14 + Math.abs(Math.sin(v.hop)) * (moving ? 9 : 2) + (c.z || 0);
      const inB = c.inBrush >= 0, alpha = inB ? .62 : 1;
      // team disc on the ground
      ctx.strokeStyle = c === G.me ? '#fff4cf' : TEAM[c.team]; ctx.lineWidth = c === G.me ? 2.6 : 2; ctx.globalAlpha = .9; ctx.beginPath(); ctx.ellipse(X, Y, 42 * Z, 42 * Z * TILT, 0, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
      const spin = v.spin > 0 ? Math.cos(v.spin * Math.PI * 2) : 1;
      if (c.tier >= 3) { const gl = Art.glow(c.tier === 5 ? '#d9b8ff' : c.tier === 4 ? '#c5f4ff' : '#ffe28a'); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .28 + Math.sin(G.t * 3) * .08; ctx.drawImage(gl, X - 62 * Z, Y - z * Z - 62 * Z, 124 * Z, 124 * Z); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
      const top = drawCoin(spriteOf(c), X, Y, z, drawR(c), { spin, flash: v.flash, alpha });
      if (c.parryT > 0) { ctx.strokeStyle = '#fff5c6'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(X, top, 46 * Z, 40 * Z, 0, 0, TAU); ctx.stroke(); }
      if (c.markT > 0) { ctx.save(); ctx.translate(X, top); ctx.rotate(G.t * 2); ctx.strokeStyle = '#ff9de2'; ctx.lineWidth = 3; for (let i = 0; i < 3; i++) { ctx.rotate(TAU / 3); ctx.beginPath(); ctx.arc(0, 0, 44 * Z, 0, 1.1); ctx.stroke(); } ctx.restore(); }
      if (c.stunT > 0) for (let i = 0; i < 3; i++) { const an = G.t * 7 + i * TAU / 3; ctx.fillStyle = '#ffe89e'; ctx.beginPath(); ctx.arc(X + Math.cos(an) * 26 * Z, top - 38 * Z + Math.sin(an) * 7, 3.6, 0, TAU); ctx.fill(); }
      if (c.chan && c.chan.recall) { ctx.strokeStyle = TEAM[c.team]; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(X, top, 46 * Z, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - c.chan.t / c.chan.total)); ctx.stroke(); }
      if (c.echo && c.recast[1] > 0 && c.team === G.me.team) { ctx.globalAlpha = .4; drawCoin(spriteOf(c), sx(c.echo.x), sy(c.echo.y), 14, drawR(c)); ctx.globalAlpha = 1; }
    } });
    G.hpq.push(() => {
      const X = sx(p.x), Y = sy(p.y) - (c.z || 0) * Z; const w = 66 * Z, y = Y - 76 * Z, x = X - w / 2;
      bar(x, y, w, 6.5, pct(c.hp, c.maxHp), c === G.me ? '#8ee07f' : c.team === G.me.team ? '#58a6e6' : '#e4573f');
      ctx.fillStyle = '#fff6e2'; ctx.font = '700 12px "Barlow Semi Condensed",sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(c.lvl, x - 3, y + 3); if (c !== G.me) { ctx.textAlign = 'left'; ctx.font = '600 11.5px "Barlow Semi Condensed",sans-serif'; ctx.fillStyle = 'rgba(255,246,226,.85)'; ctx.fillText(Sim.KITS[c.champ].name, x, y - 7); }
    });
  }

  function drawTower(t, list) {
    if (!t.alive || !onScreen(t.x, t.y, 140)) return;
    const n = t.sub === 'core' ? 11 : 8, R = t.sub === 'core' ? 74 : 50;
    const visible = Math.ceil(n * pct(t.hp, t.maxHp)), open = Sim.towerOpen(G.s, t);
    list.push({ y: t.y, f() {
      const X = sx(t.x), Y = sy(t.y), d = Art.discSprite(t.team, R), k = Z;
      ctx.drawImage(Art.shadow(), X - R * 1.5 * k, Y - R * .8 * k, R * 3 * k, R * 1.6 * k);
      const step = R * .24 * k;
      for (let i = 0; i < visible; i++) { const off = Math.sin(i * 7.3) * 2.5 * k; ctx.drawImage(d.c, X - d.cx * k + off, Y - d.cy * k - i * step, d.c.width * k, d.c.height * k); }
      const topY = Y - visible * step;
      const gl = Art.glow(TEAM[t.team]); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = open ? .65 + Math.sin(G.t * 3) * .15 : .24; ctx.drawImage(gl, X - 44 * k, topY - 60 * k, 88 * k, 88 * k); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      if (t.sub === 'core') drawCoin(Art.coin('corecoin' + t.team, 56, 'boss', Art.METAL['minion' + t.team], t.team, 3), X, Y - visible * step + 0, 40 + Math.sin(G.t * 2) * 4, 40, { spin: Math.cos(G.t * 1.3), noshadow: true });
      else { ctx.fillStyle = TEAM[t.team]; ctx.beginPath(); ctx.moveTo(X, topY - 34 * k); ctx.lineTo(X + 10 * k, topY - 20 * k); ctx.lineTo(X, topY - 6 * k); ctx.lineTo(X - 10 * k, topY - 20 * k); ctx.closePath(); ctx.fill(); }
    } });
    G.hpq.push(() => { const X = sx(t.x), Y = sy(t.y) - (n * R * .24 + 56) * Z; if (t.hp < t.maxHp || open) bar(X - 42 * Z, Y, 84 * Z, 6, pct(t.hp, t.maxHp), open ? (t.team === G.me.team ? '#58a6e6' : '#e4573f') : 'rgba(170,180,175,.7)'); });
  }

  function telegraphs(a) {
    const s = G.s;
    for (const z of s.zones) {
      if (!onScreen(z.x, z.y, z.r + 40)) continue;
      const X = sx(z.x), Y = sy(z.y), R = z.r * Z, friendly = z.team === G.me.team;
      if (z.kind === 'dome') {
        const g = ctx.createRadialGradient(X, Y - 18, R * .3, X, Y, R); g.addColorStop(0, 'rgba(182,240,255,.03)'); g.addColorStop(.86, 'rgba(182,240,255,.2)'); g.addColorStop(1, 'rgba(230,250,255,.65)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(X, Y, R, R * TILT, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = 'rgba(214,247,255,.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(X, Y, R, R * TILT, 0, 0, TAU); ctx.stroke();
      } else {
        const col = z.fx === 'heal' ? '255,230,154' : friendly ? '120,235,220' : '255,100,70', f = 1 - z.t / z.total;
        ctx.fillStyle = `rgba(${col},.14)`; ctx.beginPath(); ctx.ellipse(X, Y, R, R * TILT, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = `rgba(${col},.32)`; ctx.beginPath(); ctx.ellipse(X, Y, R * f, R * f * TILT, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = `rgba(${col},.95)`; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.ellipse(X, Y, R, R * TILT, 0, 0, TAU); ctx.stroke();
      }
    }
    const line = (x, y, dx, dy, len, w, col, alpha, f) => { const ex = x + dx * len, ey = y + dy * len, X = sx(x), Y = sy(y), EX = sx(ex), EY = sy(ey), px = -(EY - Y), py = EX - X, l = Math.hypot(px, py) || 1, hw = w / 2 * Z, nx = px / l * hw, ny = py / l * hw * (Math.abs(dy) > .7 ? 1 : 1); ctx.fillStyle = `rgba(${col},${alpha * .28})`; ctx.beginPath(); ctx.moveTo(X + nx, Y + ny); ctx.lineTo(EX + nx, EY + ny); ctx.lineTo(EX - nx, EY - ny); ctx.lineTo(X - nx, Y - ny); ctx.closePath(); ctx.fill(); ctx.strokeStyle = `rgba(${col},${alpha})`; ctx.lineWidth = 1.8; ctx.stroke(); if (f !== undefined) { ctx.fillStyle = `rgba(${col},${alpha * .4})`; ctx.beginPath(); ctx.moveTo(X + nx, Y + ny); ctx.lineTo(X + (EX - X) * f + nx, Y + (EY - Y) * f + ny); ctx.lineTo(X + (EX - X) * f - nx, Y + (EY - Y) * f - ny); ctx.lineTo(X - nx, Y - ny); ctx.closePath(); ctx.fill(); } };
    for (const c of s.champs) {
      if (!c.alive || !Sim.canSee(s, G.me.team, c)) continue;
      const fr = c.team === G.me.team, col = fr ? '150,210,255' : '255,100,70';
      if (c.chan && c.chan.kind === 'line') line(c.x, c.y, c.chan.dx, c.chan.dy, c.chan.len, c.chan.w, col, .9, 1 - c.chan.t / c.chan.total);
      if (c.charge && (c !== G.me || !Ctl.aim)) { const f = Math.min(1, c.charge.t / 1.1); line(c.x, c.y, c.charge.dx, c.charge.dy, 560 + 340 * f, 30, col, .75); }
    }
    // own aim
    if (Ctl.aim && G.me.alive) {
      const me = G.me, A = Ctl.aim, ab = me.kit[A.slot], dead = A.moved && Math.hypot(A.dx, A.dy) < 16;
      const wx = (A.moved ? A.dx : me.fx) / Z, wy = (A.moved ? A.dy : me.fy * TILT * Z) / (A.moved ? Z * TILT : Z * TILT), l = Math.hypot(wx, wy) || 1, dx = wx / l, dy = wy / l;
      const col = dead ? '255,120,100' : '255,240,190', p = pos(me, a);
      if (ab.shape === 'line' || ab.shape === 'dash') {
        const f = me.charge ? Math.min(1, me.charge.t / 1.1) : 1; const len = ab.charge ? 560 + 340 * f : ab.range; line(p.x, p.y, dx, dy, len, ab.w || 40, col, dead ? .4 : .85);
      } else if (ab.shape === 'circle') {
        const k = A.moved ? Math.min(1, Math.hypot(A.dx, A.dy) / 96) : .7, tx = p.x + dx * ab.range * k, ty = p.y + dy * ab.range * k; ctx.strokeStyle = 'rgba(255,240,190,.3)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(sx(p.x), sy(p.y), ab.range * Z, ab.range * Z * TILT, 0, 0, TAU); ctx.stroke(); ctx.fillStyle = `rgba(${col},.26)`; ctx.strokeStyle = `rgba(${col},.9)`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(sx(tx), sy(ty), ab.r * Z, ab.r * Z * TILT, 0, 0, TAU); ctx.fill(); ctx.stroke();
      } else if (ab.shape === 'cone') {
        ctx.save(); ctx.translate(sx(p.x), sy(p.y)); ctx.scale(1, TILT); ctx.fillStyle = `rgba(${col},.28)`; ctx.strokeStyle = `rgba(${col},.9)`; ctx.lineWidth = 2; const an = Math.atan2(dy, dx); ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, ab.range * Z, an - .76, an + .76); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      }
    }
  }

  function drawProjectiles(a) {
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (const p of G.s.proj) {
      if (p.homing && !onScreen(p.x, p.y)) continue;
      const x = lerp(p.px, p.x, a), y = lerp(p.py, p.y, a), X = sx(x), Y = sy(y) - 22 * Z, col = FXCOL[p.fx] || (p.fx === 'tower' ? TEAM[p.team] : '#fff');
      if (p.homing) { const r = p.fx === 'tower' ? 15 : 8; ctx.drawImage(Art.glow(col), X - r * Z, Y - r * Z, 2 * r * Z, 2 * r * Z); continue; }
      const v = Math.hypot(p.vx, p.vy) || 1, tl = p.fx === 'deadeye' ? .18 : .09, tx = sx(x - p.vx * tl), ty = sy(y - p.vy * tl) - 22 * Z;
      if (p.fx === 'chain') { ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = '#3c2a1e'; ctx.lineWidth = 7 * Z; ctx.beginPath(); ctx.moveTo(sx(p.owner.x), sy(p.owner.y) - 20 * Z); ctx.lineTo(X, Y); ctx.stroke(); ctx.strokeStyle = '#d7b593'; ctx.lineWidth = 3.4 * Z; ctx.setLineDash([9 * Z, 7 * Z]); ctx.beginPath(); ctx.moveTo(sx(p.owner.x), sy(p.owner.y) - 20 * Z); ctx.lineTo(X, Y); ctx.stroke(); ctx.setLineDash([]); ctx.globalCompositeOperation = 'lighter'; }
      else { ctx.strokeStyle = col; ctx.globalAlpha = .55; ctx.lineWidth = p.w * Z * .6; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(X, Y); ctx.stroke(); ctx.globalAlpha = 1; }
      const r = p.w * .95; ctx.drawImage(Art.glow(col), X - r * Z, Y - r * Z, 2 * r * Z, 2 * r * Z);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawParticles(dt) {
    for (const p of G.fx) {
      p.life -= dt; if (p.life <= 0) continue; const f = p.life / p.max;
      if (p.type === 'ring') { const R = p.r * Z * (1.05 - f * .75); ctx.strokeStyle = p.col; ctx.globalAlpha = f; ctx.lineWidth = 2 + f * 5; ctx.beginPath(); ctx.ellipse(sx(p.x), sy(p.y), R, R * TILT, 0, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; continue; }
      if (p.type === 'slash') { ctx.save(); ctx.translate(sx(p.x), sy(p.y) - 16 * Z); ctx.scale(1, TILT); ctx.strokeStyle = '#efe2ff'; ctx.globalAlpha = f; ctx.lineWidth = 16 * f; const an = Math.atan2(p.dy, p.dx); ctx.beginPath(); ctx.arc(0, 0, 150 * Z, an - .7, an + .7); ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= 900 * dt; if (p.z < 2) { p.z = 2; p.vz *= -.45; p.vx *= .7; p.vy *= .7; }
      const X = sx(p.x), Y = sy(p.y) - p.z * Z;
      if (p.type === 'coin') { ctx.fillStyle = p.col; ctx.globalAlpha = Math.min(1, f * 2); p.ph += dt * 14; ctx.beginPath(); ctx.ellipse(X, Y, p.size * Z * Math.max(.2, Math.abs(Math.cos(p.ph))), p.size * Z * .8, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
      else { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = f; const r = p.size * Z; ctx.drawImage(Art.glow(p.col), X - r, Y - r, 2 * r, 2 * r); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
    }
    G.fx = G.fx.filter(p => p.life > 0);
  }

  // Lighting across the match: dawn, day, dusk, night.
  function sky() {
    const p = (G.s.t / 780 + .12) % 1;
    // [time, r,g,b, alpha]
    const K = [[0, 255, 170, 120, .16], [.18, 255, 240, 200, .02], [.5, 255, 225, 170, .03], [.68, 255, 120, 70, .2], [.84, 20, 34, 92, .42], [1, 255, 170, 120, .16]];
    for (let i = 0; i < K.length - 1; i++) if (p <= K[i + 1][0]) { const A = K[i], B = K[i + 1], t = (p - A[0]) / (B[0] - A[0]); return { r: lerp(A[1], B[1], t), g: lerp(A[2], B[2], t), b: lerp(A[3], B[3], t), a: lerp(A[4], B[4], t), night: Math.max(0, 1 - Math.abs(p - .86) / .16) }; }
    return { r: 0, g: 0, b: 0, a: 0, night: 0 };
  }

  function weather(dt, sk) {
    const s = G.s;
    // rain schedule
    G.rainNext -= dt;
    if (G.rainNext <= 0) { G.rainT = 32 + Math.random() * 18; G.rainNext = G.rainT + 90 + Math.random() * 60; }
    if (G.rainT > 0) { G.rainT -= dt; G.rain = Math.min(1, G.rain + dt * .35); } else G.rain = Math.max(0, G.rain - dt * .25);
    if (G.rain > .5 && Math.random() < dt * .05) { G.bolt = 1; setTimeout(() => tone(70, .9, 'sawtooth', .05, .5), 300); }
    G.bolt = Math.max(0, G.bolt - dt * 3.2);

    // river glints
    ctx.globalCompositeOperation = 'lighter';
    if (onScreen(1600, G.cam.y, 400)) for (let i = 0; i < (quality >= 2 ? 34 : 14); i++) {
      const y = G.cam.y - 480 + (i * 37 + G.t * 26) % 960, x = 1600 + Math.sin(y / 170) * 90 + Math.sin(i * 12.7) * 62, al = (Math.sin(G.t * 2.4 + i * 2.1) + 1) * .22;
      ctx.fillStyle = `rgba(190,245,255,${al})`; ctx.beginPath(); ctx.ellipse(sx(x), sy(y), 15 * Z, 2.4 * Z, 0, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // fog banks
    if (quality >= 1) { const fogA = .1 + sk.a * .25 + G.rain * .1, sp = Art.glow('rgba(214,232,226,.9)'); ctx.globalAlpha = fogA; for (const f of G.fog) { f.x += f.v * dt; if (f.x > Sim.W + 500) f.x = -500; if (!onScreen(f.x, f.y, f.r)) continue; const R = f.r * Z; ctx.drawImage(sp, sx(f.x) - R, sy(f.y) - R * .55, R * 2, R * 1.1); } ctx.globalAlpha = 1; }

    // floating motes and fireflies
    ctx.globalCompositeOperation = 'lighter';
    for (const m of G.motes) { m.x = (m.x + dt * .014) % 1; m.p += dt; const X = m.x * VW + Math.sin(m.p) * 14, Y = (m.y * VH + Math.sin(m.p * .6) * 22) % VH, al = (.25 + sk.night * .55) * (.5 + Math.sin(m.p * 2.2) * .5); const col = sk.night > .3 ? '#d9f79e' : '#fff4d0'; ctx.globalAlpha = al; const r = 3.5 + sk.night * 3.5; ctx.drawImage(Art.glow(col), X - r, Y - r, 2 * r, 2 * r); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

    // colour grade
    ctx.fillStyle = `rgba(${sk.r | 0},${sk.g | 0},${sk.b | 0},${sk.a + G.rain * .06})`; ctx.fillRect(0, 0, VW, VH);
    if (G.rain > .01) ctx.fillStyle = `rgba(24,50,72,${G.rain * .22})`, ctx.fillRect(0, 0, VW, VH);

    // lights at dusk and night
    if (sk.night > .03 || sk.a > .15) {
      ctx.globalCompositeOperation = 'lighter'; const L = (x, y, r, col, a) => { if (!onScreen(x, y, r)) return; ctx.globalAlpha = a; const R = r * Z; ctx.drawImage(Art.glow(col), sx(x) - R, sy(y) - R * .8, R * 2, R * 1.6); };
      const n = Math.max(sk.night, sk.a * .9);
      for (const t of s.towers) if (t.alive) L(t.x, t.y, 260, TEAM[t.team], .34 * n);
      for (const c of s.champs) if (c.alive && Sim.canSee(s, G.me.team, c)) L(c.x, c.y, 170, c === G.me ? '#ffe6b0' : TEAM[c.team], .28 * n);
      L(1600, 950, 300, '#ffd27a', .22 * n);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }

    // rain
    if (G.rain > .01) {
      const n = Math.floor((quality >= 2 ? 120 : 55) * G.rain);
      while (G.drops.length < n) G.drops.push({ x: Math.random() * VW * 1.2, y: Math.random() * VH, v: 900 + Math.random() * 400 });
      ctx.strokeStyle = 'rgba(205,228,240,.42)'; ctx.lineWidth = 1.2; ctx.beginPath();
      for (let i = 0; i < n; i++) { const d = G.drops[i]; d.y += d.v * dt; d.x -= d.v * .12 * dt; if (d.y > VH) { d.y = -20; d.x = Math.random() * VW * 1.2; if (Math.random() < .35) G.ripples.push({ x: Math.random() * VW, y: Math.random() * VH, t: .5 }); } ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + 3, d.y - 18); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(205,228,240,.4)'; ctx.lineWidth = 1; for (const r of G.ripples) { r.t -= dt; const R = (.5 - r.t) * 26; ctx.globalAlpha = Math.max(0, r.t * 1.6); ctx.beginPath(); ctx.ellipse(r.x, r.y, R, R * TILT, 0, 0, TAU); ctx.stroke(); } ctx.globalAlpha = 1; G.ripples = G.ripples.filter(r => r.t > 0);
    }
    if (G.bolt > 0) { ctx.fillStyle = `rgba(226,236,255,${G.bolt * .36})`; ctx.fillRect(0, 0, VW, VH); }
  }

  // ---------- HUD ----------
  const font = (w, s) => ctx.font = `${w} ${s}px "Barlow Semi Condensed",sans-serif`;
  function glyph(a, x, y, r, col) {
    ctx.save(); ctx.translate(x, y); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const s = r * .5;
    if (a.shape === 'line') { ctx.beginPath(); ctx.moveTo(-s, s); ctx.lineTo(s, -s); ctx.stroke(); ctx.beginPath(); ctx.moveTo(s - 8, -s); ctx.lineTo(s, -s); ctx.lineTo(s, -s + 8); ctx.stroke(); }
    else if (a.shape === 'circle') { ctx.beginPath(); ctx.arc(0, 0, s, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill(); }
    else if (a.shape === 'dash') { for (const o of [-7, 5]) { ctx.beginPath(); ctx.moveTo(o - 5, -s * .8); ctx.lineTo(o + 5, 0); ctx.lineTo(o - 5, s * .8); ctx.stroke(); } }
    else if (a.shape === 'cone') { ctx.beginPath(); ctx.moveTo(-s, s * .3); ctx.arc(-s, s * .3, s * 2, -1.2, -.2); ctx.closePath(); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(0, 0, s * .55, 0, TAU); ctx.fill(); for (let i = 0; i < 8; i++) { const an = i * TAU / 8; ctx.beginPath(); ctx.moveTo(Math.cos(an) * s * .85, Math.sin(an) * s * .85); ctx.lineTo(Math.cos(an) * s * 1.25, Math.sin(an) * s * 1.25); ctx.stroke(); } }
    ctx.restore();
  }

  function hudDraw() {
    const s = G.s, me = G.me, k = Sim.KITS[me.champ];
    ctx.textBaseline = 'middle';
    // portrait and bars
    const px = 44, py = 8;
    bar(px + 54, py + 14, 150, 13, pct(me.hp, me.maxHp), '#8ee07f');
    font(700, 13); ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,24,22,.85)'; ctx.strokeText(`${Math.ceil(me.hp)}`, px + 129, py + 21); ctx.fillStyle = '#fff6e2'; ctx.fillText(`${Math.ceil(me.hp)}`, px + 129, py + 21);
    bar(px + 54, py + 33, 150, 5, me.lvl >= 10 ? 1 : pct(me.xp, Sim.xpNeed(me.lvl)), '#e0b552');
    drawHudCoin(px + 26, py + 28, 26, spriteOf(me));
    font(700, 14); ctx.fillStyle = '#10302b'; ctx.beginPath(); ctx.arc(px + 48, py + 48, 10, 0, TAU); ctx.fillStyle = '#f1e8d0'; ctx.fill(); ctx.fillStyle = '#10302b'; ctx.textAlign = 'center'; ctx.fillText(me.lvl, px + 48, py + 48.5);
    font(700, 18); ctx.textAlign = 'left'; ctx.fillStyle = '#ffd777'; ctx.fillText(`${Math.floor(me.gold)}`, px + 66, py + 52);
    { const gw = ctx.measureText(`${Math.floor(me.gold)}`).width, gx = px + 66 + gw + 12, gy = py + 52; ctx.fillStyle = '#8a5d0c'; ctx.beginPath(); ctx.arc(gx, gy + 1.5, 7, 0, TAU); ctx.fill(); ctx.fillStyle = '#ffd777'; ctx.beginPath(); ctx.arc(gx, gy, 7, 0, TAU); ctx.fill(); ctx.strokeStyle = '#b8862a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(gx, gy, 4.4, 0, TAU); ctx.stroke(); }

    // forge and recall
    const F = UI.forge, afford = ['edge', 'guard', 'haste'].some(t => me.up[t] < 3 && me.gold >= Sim.FORGE_COST[me.up[t]]);
    pill(F, afford ? 'Upgrade' : 'Upgrade', afford);
    pill(UI.recall, 'Recall', false, me.chan && me.chan.recall ? 1 - me.chan.t / me.chan.total : 0);

    // score and clock
    const m = Math.floor(s.t / 60), sec = String(Math.floor(s.t % 60)).padStart(2, '0');
    font(700, 22); ctx.textAlign = 'right'; ctx.fillStyle = '#9fd0f6'; ctx.fillText(s.kills[0], VW / 2 - 34, 22);
    ctx.textAlign = 'left'; ctx.fillStyle = '#f7a08e'; ctx.fillText(s.kills[1], VW / 2 + 34, 22);
    font(600, 15); ctx.textAlign = 'center'; ctx.fillStyle = '#f1e8d0'; ctx.fillText(`${m}:${sec}`, VW / 2, 22);
    const P = UI.pause; ctx.fillStyle = 'rgba(241,232,208,.8)'; ctx.fillRect(P.x - 5, P.y - 7, 3.5, 14); ctx.fillRect(P.x + 2, P.y - 7, 3.5, 14);

    // feed
    G.feed.forEach((f, i) => { f.t -= 1 / 60; if (f.t <= 0) return; const y = 48 + i * 22, al = Math.min(1, f.t * 2); ctx.globalAlpha = al; const X = VW / 2; if (f.a && f.a.kind === 'champ') drawHudCoin(X - 34, y, 10, spriteOf(f.a)); else { ctx.fillStyle = '#d9c9a0'; ctx.beginPath(); ctx.arc(X - 34, y, 7, 0, TAU); ctx.fill(); } font(700, 13); ctx.fillStyle = '#f1e8d0'; ctx.fillText('took', X, y); if (f.b) drawHudCoin(X + 34, y, 10, spriteOf(f.b)); ctx.globalAlpha = 1; });
    G.feed = G.feed.filter(f => f.t > 0);

    minimap();
    if (G.banner) { G.banner.t -= 1 / 60; if (G.banner.t <= 0) G.banner = null; else { font(600, 19); ctx.textAlign = 'center'; const tw = ctx.measureText(G.banner.s).width + 32; ctx.globalAlpha = Math.min(1, G.banner.t * 3); ctx.fillStyle = 'rgba(10,36,32,.82)'; ctx.beginPath(); roundR(VW / 2 - tw / 2, 110, tw, 32, 15); ctx.fill(); ctx.fillStyle = '#f1e8d0'; ctx.fillText(G.banner.s, VW / 2, 126.5); ctx.globalAlpha = 1; } }

    // buttons
    const A = UI.atk; drawHudCoin(A.x, A.y, A.r, Art.champCoin(me.champ, me.team, me.tier)); if (Ctl.atk !== null) { ctx.strokeStyle = '#fff4cf'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(A.x, A.y, A.r + 3, 0, TAU); ctx.stroke(); }
    me.kit.forEach((a, i) => {
      const B = UI.ab[i], locked = i === 2 && me.lvl < 3, cd = me.cd[i], recast = me.recast[i] > 0 && a.recast, ready = (cd <= 0 && !locked) || recast;
      const held = Ctl.aim && Ctl.aim.slot === i;
      ctx.fillStyle = ready ? '#25584e' : '#13302b'; ctx.beginPath(); ctx.arc(B.x, B.y, B.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = recast ? '#ffe69a' : ready ? '#d7b35e' : '#4e6a60'; ctx.lineWidth = recast ? 4 : 3; ctx.beginPath(); ctx.arc(B.x, B.y, B.r, 0, TAU); ctx.stroke();
      glyph(a, B.x, B.y - 8, B.r * .82, ready ? '#f4e8c8' : '#7d968c');
      { let fs = 11.5; font(600, fs); while (ctx.measureText(a.name).width > B.r * 1.52 && fs > 8.5) { fs -= .5; font(600, fs); } ctx.textAlign = 'center'; ctx.fillStyle = ready ? '#f1e8d0' : '#9ab0a6'; ctx.fillText(a.name, B.x, B.y + B.r * .55); }
      if (cd > 0 && !recast) { const f = cd / a.cd; ctx.fillStyle = 'rgba(4,16,14,.62)'; ctx.beginPath(); ctx.moveTo(B.x, B.y); ctx.arc(B.x, B.y, B.r - 1, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.closePath(); ctx.fill(); font(700, 19); ctx.fillStyle = '#fff'; ctx.fillText(cd > 3 ? Math.ceil(cd) : cd.toFixed(1), B.x, B.y - 2); }
      if (locked) { font(700, 12); ctx.fillStyle = '#f1e8d0'; ctx.fillText('Lv 3', B.x, B.y - 3); }
      if (held) { ctx.strokeStyle = '#fff4cf'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(B.x, B.y, B.r + 4, 0, TAU); ctx.stroke(); }
      if (held && me.charge) { const f = Math.min(1, me.charge.t / 1.1); ctx.strokeStyle = f >= 1 ? '#ffe06a' : '#b8a9ff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(B.x, B.y, B.r + 9, -Math.PI / 2, -Math.PI / 2 + TAU * f); ctx.stroke(); }
    });
    if (Ctl.aim && Ctl.aim.moved && Math.hypot(Ctl.aim.dx, Ctl.aim.dy) < 16) { font(700, 13); ctx.textAlign = 'center'; const B = UI.ab[Ctl.aim.slot]; ctx.fillStyle = '#ff8b78'; ctx.fillText('Release to cancel', B.x, B.y - B.r - 16); }
    // thumb stick
    if (Ctl.stick) { const st = Ctl.stick; ctx.strokeStyle = 'rgba(241,232,208,.5)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(st.sx, st.sy, 58, 0, TAU); ctx.stroke(); const dx = st.x - st.sx, dy = st.y - st.sy, l = Math.min(58, Math.hypot(dx, dy)), a = Math.atan2(dy, dx); ctx.fillStyle = 'rgba(241,232,208,.55)'; ctx.beginPath(); ctx.arc(st.sx + Math.cos(a) * l, st.sy + Math.sin(a) * l, 24, 0, TAU); ctx.fill(); }
    else if (G.s.t < 30) { ctx.strokeStyle = 'rgba(241,232,208,.2)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(120, VH - 86, 56, 0, TAU); ctx.stroke(); }

    if (G.hintT > 0) { G.hintT -= 1 / 60; font(600, 18); ctx.textAlign = 'center'; ctx.globalAlpha = Math.min(1, G.hintT); ctx.fillStyle = 'rgba(10,36,32,.8)'; const t1 = 'Left thumb moves. Hold the big coin to attack. Drag an ability to aim, or tap to fire at the nearest target.'; const tw = ctx.measureText(t1).width + 30, xx = Math.min(tw, VW - 60); ctx.beginPath(); roundR(VW / 2 - xx / 2, VH - 44, xx, 32, 14); ctx.fill(); ctx.fillStyle = '#f1e8d0'; wrapOne(t1, VW / 2, VH - 28, xx - 20); ctx.globalAlpha = 1; }

    if (!me.alive) { ctx.fillStyle = 'rgba(8,24,22,.42)'; ctx.fillRect(0, 0, VW, VH); ctx.fillStyle = '#f1e8d0'; ctx.textAlign = 'center'; ctx.font = '38px Forum,Georgia,serif'; ctx.fillText(`Back in ${Math.ceil(me.respawn)}`, VW / 2, VH / 2 - 10); }
    if (G.flash > 0) { ctx.fillStyle = `rgba(228,67,50,${G.flash * .3})`; ctx.fillRect(0, 0, VW, VH); }
  }
  function wrapOne(t, x, y, mw) { let f = 18; font(600, f); while (ctx.measureText(t).width > mw && f > 11) { f--; font(600, f); } ctx.fillText(t, x, y); }
  function drawHudCoin(x, y, r, spr) { const k = spr.S / (spr.R * 2); ctx.drawImage(spr.c, x - r * k, y - r * k, 2 * r * k, 2 * r * k); }
  function pill(B, t, hot, prog) { ctx.fillStyle = hot ? '#e0b552' : 'rgba(10,36,32,.72)'; ctx.beginPath(); roundR(B.x, B.y, B.w, B.h, 15); ctx.fill(); if (prog) { ctx.save(); ctx.beginPath(); roundR(B.x, B.y, B.w, B.h, 15); ctx.clip(); ctx.fillStyle = 'rgba(88,166,230,.65)'; ctx.fillRect(B.x, B.y, B.w * prog, B.h); ctx.restore(); } font(700, 16); ctx.textAlign = 'center'; ctx.fillStyle = hot ? '#2a1c06' : '#f1e8d0'; ctx.fillText(t, B.x + B.w / 2, B.y + B.h / 2 + 1); }

  function minimap() {
    const M = UI.map, s = G.s, kx = M.w / Sim.W, ky = M.h / Sim.H, X = x => M.x + x * kx, Y = y => M.y + y * ky;
    ctx.fillStyle = 'rgba(10,36,32,.82)'; ctx.beginPath(); roundR(M.x - 3, M.y - 3, M.w + 6, M.h + 6, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(190,180,140,.55)'; ctx.lineWidth = 3; for (const L of s.map.lanes) { ctx.beginPath(); L.forEach(([x, y], i) => ctx[i ? 'lineTo' : 'moveTo'](X(x), Y(y))); ctx.stroke(); }
    ctx.fillStyle = 'rgba(100,130,120,.6)'; for (const w of s.map.walls) if (!w.big) ctx.fillRect(X(w.x), Y(w.y), w.w * kx, w.h * ky);
    for (const t of s.towers) if (t.alive) { ctx.fillStyle = TEAM[t.team]; const r = t.sub === 'core' ? 3.8 : 2.4; ctx.fillRect(X(t.x) - r, Y(t.y) - r, 2 * r, 2 * r); }
    if (s.monsters.some(m => m.boss)) { ctx.fillStyle = '#ffd777'; ctx.beginPath(); ctx.arc(X(1600), Y(950), 4, 0, TAU); ctx.fill(); }
    for (const c of s.champs) { if (!c.alive || !Sim.canSee(s, me0().team, c)) continue; ctx.fillStyle = c === me0() ? '#fff4cf' : TEAM[c.team]; ctx.beginPath(); ctx.arc(X(c.x), Y(c.y), c === me0() ? 4.4 : 3.4, 0, TAU); ctx.fill(); }
  }
  const me0 = () => G.me;

  function endGame() {
    const s = G.s, me = G.me, won = s.over.winner === me.team, gain = Sim.masteryGain(me.stats, won), before = pts(me.champ), t0 = Sim.tierOf(before), t1 = Sim.tierOf(before + gain);
    save.m[me.champ] = before + gain; persist(); G.ended = true; $('forge').classList.add('hide');
    $('endT').textContent = won ? 'Victory' : 'Defeat';
    const st = me.stats; $('endS').textContent = `${st.kills} takedowns, ${st.deaths} deaths, ${st.assists} assists. You landed ${st.skillHits} of ${st.casts} abilities${st.parries ? ` and parried ${st.parries} hits` : ''}.`;
    const next = Sim.TIERS[t1 + 1];
    $('endM').textContent = (t1 > t0 ? `Your ${Sim.KITS[me.champ].name} coin is now ${Sim.TIERS[t1].name}. ` : '') + `+${gain} proficiency` + (next ? `, ${next.at - before - gain} to ${next.name}` : '');
    paintCoinTo($('endcoin'), Art.coin(me.champ, 140, me.champ, Art.METAL[me.champ], me.team, t1));
    $('end').classList.remove('hide');
  }

  // ---------- main loop ----------
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    animLobby(dt);
    if (!G) return;
    G.t += dt;
    if (!paused && !G.ended) {
      G.acc += dt; let n = 0;
      while (G.acc >= DT && n++ < 4) { applyInput(); Sim.step(G.s); G.acc -= DT; handleEvents(); if (G.s.over) { endGame(); break; } }
      if (n >= 4) G.acc = 0;
    }
    render(paused ? 0 : dt);
    const f = G.frames++; G.ms += dt * 1000;
    if (f && f % 120 === 0) { const avg = G.ms / 120; G.ms = 0; if (avg > 26 && quality > 0) { quality--; resize(); } }
  }

  function render(dt) {
    const s = G.s, me = G.me, a = Math.min(1, G.acc / DT);
    // camera follows the coin and leans toward your aim
    const p = pos(me, a); let tx = p.x, ty = p.y;
    if (Ctl.aim && Ctl.aim.moved) { const wx = Ctl.aim.dx, wy = Ctl.aim.dy / TILT, l = Math.hypot(wx, wy) || 1; tx += wx / l * 200; ty += wy / l * 130; }
    G.cam.x = lerp(G.cam.x, tx, .14); G.cam.y = lerp(G.cam.y, ty, .14);
    if (!calm && G.shake > .1) { shX = (Math.random() - .5) * G.shake; shY = (Math.random() - .5) * G.shake; G.shake *= .86; } else shX = shY = 0;
    G.flash = Math.max(0, G.flash - dt * 2.6);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0f3029'; ctx.fillRect(0, 0, VW, VH);
    // ground in one blit
    const gw = VW / Z, gh = VH / Z, gx = G.cam.x - gw / 2 - shX / Z, gy = G.cam.y * TILT - gh / 2 - shY / Z;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(G.ground.c, gx, gy, gw, gh, 0, 0, VW, VH);

    telegraphs(a);

    const list = []; G.hpq = [];
    for (const w of s.map.walls) { if (!onScreen(w.x + w.w / 2, w.y + w.h / 2, Math.max(w.w, w.h) * Z + 120)) continue; if (w.big) continue; list.push({ y: w.y + w.h, f() { const sp = Art.wallSprite(w); ctx.drawImage(sp.c, sx(w.x) - 4 * Z, sy(w.y) - sp.lift * Z - 4 * Z, sp.c.width * Z, sp.c.height * Z); } }); }
    for (const d of G.decor) { if (!onScreen(d.x, d.y, 140)) continue; list.push({ y: d.y, f() { const sp = Art.treeSprite(d.v); ctx.drawImage(sp.c, sx(d.x) - sp.ax * Z, sy(d.y) - sp.ay * Z, sp.c.width * Z, sp.c.height * Z); } }); }
    s.map.brush.forEach((b, i) => { if (!onScreen(b.x, b.y, b.r + 80)) return; list.push({ y: b.y + b.r * .4, f() { const sp = Art.brushSprite(b, i % 3 + 1), sway = Math.sin(G.t * 1.5 + i) * 2.5 * Z; ctx.globalAlpha = me.alive && me.inBrush === i ? .42 : 1; ctx.drawImage(sp.c, sx(b.x) - sp.ax * Z + sway, sy(b.y) - sp.ay * Z, sp.c.width * Z, sp.c.height * Z); ctx.globalAlpha = 1; } }); });
    for (const t of s.towers) drawTower(t, list);
    for (const m of s.minions) {
      if (m.delay > 0) continue; const q = pos(m, a); if (!onScreen(q.x, q.y)) continue; const v = visOf(m);
      list.push({ y: q.y, f() { v.hop += .32; v.flash = Math.max(0, v.flash - .12); const z = 8 + Math.abs(Math.sin(v.hop)) * 6; drawCoin(spriteOf(m), sx(q.x), sy(q.y), z, drawR(m), { flash: v.flash, edge: m.team ? '#6a2c20' : '#2a4f70' }); if (m.hp < m.maxHp) G.hpq.push(() => bar(sx(q.x) - 18 * Z, sy(q.y) - 46 * Z, 36 * Z, 3.5, pct(m.hp, m.maxHp), m.team === me.team ? '#58a6e6' : '#e4573f')); } });
    }
    for (const m of s.monsters) {
      const q = pos(m, a); if (!onScreen(q.x, q.y, 120)) continue; const v = visOf(m);
      list.push({ y: q.y, f() { v.hop += .05; v.flash = Math.max(0, v.flash - .12); const z = m.boss ? 22 + Math.sin(G.t * 1.8) * 5 : 8 + Math.abs(Math.sin(v.hop)) * 4; drawCoin(spriteOf(m), sx(q.x), sy(q.y), z, drawR(m), { flash: v.flash, spin: m.boss ? Math.cos(G.t * .7) : 1, edge: m.boss ? '#8a5d0c' : '#3a2f1c' }); if (m.hp < m.maxHp) G.hpq.push(() => bar(sx(q.x) - drawR(m) * Z, sy(q.y) - (drawR(m) + 34) * Z, drawR(m) * 2 * Z, m.boss ? 7 : 4, pct(m.hp, m.maxHp), '#e0b552')); } });
    }
    for (const c of s.champs) drawChamp(c, a, list);
    // corpses flip and sink
    G.corpses = G.corpses.filter(k => (k.t += dt) < .75);
    for (const k of G.corpses) { if (!onScreen(k.x, k.y)) continue; list.push({ y: k.y, f() { const f = k.t / .75; drawCoin(k.spr, sx(k.x), sy(k.y), 14 + Math.sin(f * Math.PI) * 74, k.R, { flip: Math.cos(f * Math.PI * 3), alpha: 1 - f * f }); } }); }
    list.sort((p, q) => p.y - q.y);
    for (const it of list) it.f();
    drawProjectiles(a);
    drawParticles(dt);
    const sk = sky(); weather(dt, sk);
    for (const f of G.hpq) f();
    // floating numbers
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    G.text = G.text.filter(t => (t.t -= dt) > 0);
    for (const t of G.text) { const f = t.t / t.max; font(700, t.big ? 20 : 15); ctx.globalAlpha = Math.min(1, f * 2.4); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,24,22,.8)'; const X = sx(t.x), Y = sy(t.y) - (t.z + (1 - f) * 46) * Z; ctx.strokeText(t.s, X, Y); ctx.fillStyle = t.col; ctx.fillText(t.s, X, Y); ctx.globalAlpha = 1; }
    hudDraw();
    if (!$('forge').classList.contains('hide') && G.frames % 20 === 0) drawForge();
  }

  layout(); renderLobby(); requestAnimationFrame(frame);
  window.__mintfall = { get G() { return G; }, Ctl, UI: () => UI };
})();
