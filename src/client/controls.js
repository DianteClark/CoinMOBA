// Touch controls. Abilities fire on release so the player always has a chance to cancel.
const { Ctl, applyInput, aimDir } = (() => {
  const Ctl = {
    p: new Map(), stick: null, aim: null, atk: null, atkMode: 'champ', ping: null, mapHold: null, look: null, ev: null, lockId: 0,
    reset() { if (this.talking) { this.talking = false; Voice.talk(false); } this.p.clear(); this.stick = null; this.aim = null; this.atk = null; this.atkMode = 'champ'; this.ping = null; this.mapHold = null; this.look = null; this.ev = null; this.lockId = 0; if (G) G.look = null; },
    pt(e) { return rotated ? { x: e.clientY - stageX, y: physW - e.clientX } : { x: e.clientX - stageX, y: e.clientY }; },
  };
  const near = (b, p, pad) => Math.hypot(p.x - b.x, p.y - b.y) < b.r + pad;
  // 13.0: a shorter throw. The pad is smaller and full speed arrives at about two thirds of it (31 px of thumb travel).
  const STICK = 46, STICK_FULL = .68, MOVE_PX = 16, FULL_PX = 96, HOLD_MS = 240, RADIAL_DEAD = 20, EVADE_PX = 14;
  Ctl.STICK = STICK;
  // Higher sensitivity: a shorter drag starts the aim and reaches full range.
  const sens = () => Math.max(.5, Math.min(2, save.aimSens || 1));

  // Distance a straight shot from the caster travels along (dx, dy) before a wall stops it.
  const wallAt = (me, dx, dy, len) => Sim.rayWall ? Sim.rayWall(me.x, me.y, dx, dy, len) : len;
  // Abilities flagged `over` (a leap or a blink) ignore walls.
  const crossesWalls = (me, i) => !!me.kit[i].over;
  const clearShot = (me, u, d, free) => free || d < 1 || wallAt(me, (u.x - me.x) / d, (u.y - me.y) / d, d) >= d - (u.r || 0);

  // Tap-to-fire. Enemy players first, lowest health first (by value or by percentage, from Settings).
  // With no player in reach it goes by where you stand: in a lane, minions and then towers; in the jungle, monsters.
  const wantsPct = () => save.targetPref === 'pct';
  const hpScore = u => wantsPct() ? u.hp / (u.maxHp || 1) : u.hp;
  const LANE_R = 240;
  function standingInLane(x, y) {
    if (Sim.inLane) return !!Sim.inLane(x, y, G.s);
    const lanes = G.s.map && G.s.map.lanes; if (!lanes) return true;
    for (const L of lanes) for (let i = 1; i < L.length; i++) {
      const ax = L[i - 1][0], ay = L[i - 1][1], bx = L[i][0] - ax, by = L[i][1] - ay, t = Math.max(0, Math.min(1, ((x - ax) * bx + (y - ay) * by) / (bx * bx + by * by || 1)));
      if (Math.hypot(x - ax - bx * t, y - ay - by * t) < LANE_R) return true;
    }
    return false;
  }
  function quickTarget(me, a, free) {
    const r = (a.range || 600) + 80, s = G.s, ok = (u, d) => u.alive && !u.air && u.team !== me.team && !(u.delay > 0) && d < r && Sim.canSee(s, me.team, u) && clearShot(me, u, d, free);
    // The champion your attack is locked onto comes first, when the shot can reach it.
    const L = lockedUnit(); if (L && ok(L, Math.hypot(L.x - me.x, L.y - me.y))) return L;
    const lowest = list => { let best = null, top = Infinity; for (const u of list) { const d = Math.hypot(u.x - me.x, u.y - me.y); if (!ok(u, d)) continue; const v = hpScore(u); if (v < top) { top = v; best = u; } } return best; };
    const tower = () => { let best = null, bd = Infinity; for (const t of s.towers) { const d = Math.hypot(t.x - me.x, t.y - me.y); if (!ok(t, d) || d >= bd || !Sim.towerOpen(s, t)) continue; bd = d; best = t; } return best; };
    const foe = lowest(s.champs); if (foe) return foe;
    if (standingInLane(me.x, me.y)) return lowest(s.minions) || tower() || lowest(s.monsters);
    return lowest(s.monsters) || lowest(s.minions) || tower();
  }

  // Where the current aim points. tx, ty is the exact point a release would send.
  // reach is how far the shot really goes, stopped by the first wall; blocked says a wall cut it short.
  function aimDir() {
    const me = G.me, A = Ctl.aim;
    if (!A) return { dx: me.fx, dy: me.fy, target: null, tx: me.x, ty: me.y, k: 1, reach: 0, blocked: false };
    const a = me.kit[A.slot], range = a.range || 0, circle = a.shape === 'circle';
    let dx = me.fx, dy = me.fy, target = null, k = 1;
    if (a.shape === 'self') return { dx, dy, target, tx: me.x, ty: me.y, k, reach: 0, blocked: false };
    const free = crossesWalls(me, A.slot);
    if (A.moved) {
      const wy = A.dy / TILT, l = Math.hypot(A.dx, wy) || 1;
      dx = A.dx / l; dy = wy / l;
      if (circle) k = Math.min(1, Math.hypot(A.dx, A.dy) * sens() / FULL_PX);
    } else {
      target = quickTarget(me, a, free);
      if (target) {
        const tdx = target.x - me.x, tdy = target.y - me.y, l = Math.hypot(tdx, tdy) || 1;
        dx = tdx / l; dy = tdy / l;
        if (circle) k = Math.min(1, l / (range || 1));
      } else if (circle) k = .7;
    }
    const want = range * k, reach = free ? want : Math.min(want, wallAt(me, dx, dy, want)), blocked = reach < want - .5;
    // A ground circle lands at the last visible point. A line keeps its full aim point, so a shot fired flush against a wall still has a direction.
    const send = circle ? reach : want;
    return { dx, dy, target, tx: me.x + dx * send, ty: me.y + dy * send, k, reach, blocked };
  }

  function cancelAim() {
    if (!Ctl.aim) return;
    Ctl.aim = null;
    if (G) G.me.q.push({ t: 'cancel' });
    Sound.play('cancel');
  }

  function pressAbility(i, id, p) {
    const me = G.me, a = me.kit[i];
    if (!me.alive) return;
    Hud.press(i);
    if (a.windup && me.chan && me.chan.slot === i) { me.q.push({ t: 'cancel' }); Sound.play('cancel'); Hud.flash(i); return; }
    if (i === 2 && me.lvl < 3) { Hud.toast('Ultimate unlocks at level 3'); Hud.deny(i); Sound.play('cancel'); return; }
    const recast = me.recast[i] > 0 && a.recast;
    if (me.cd[i] > 0 && !recast) { Hud.deny(i); return; }
    if (a.instant || (recast && a.recastInstant)) { me.q.push({ t: 'cast', slot: i, tx: me.x, ty: me.y }); Hud.flash(i); return; }
    if (Ctl.aim) return;
    if (a.charge && !recast) me.q.push({ t: 'charge', slot: i });
    Ctl.aim = { slot: i, id, sx: p.x, sy: p.y, dx: 0, dy: 0, moved: false, cancelHot: false, backHot: false, left: false };
    Ctl.p.set(id, { role: 'aim' });
    Sound.play('tap');
  }

  // ---------- 13.0: attack lock ----------
  // Tapping an enemy coin locks your attack (and your tapped abilities) onto it. The sim keeps the real lock; this mirrors it for the HUD and smart cast.
  function lockedUnit() {
    const me = G && G.me; if (!me) return null;
    // The sim's c.lockId is the truth once it exists; the local mirror only covers the tick between a tap and the sim taking it.
    if (me.lockId !== undefined && me.lockId !== Ctl.lockId && performance.now() - (Ctl.lockAt || 0) > 250) { Ctl.lockId = me.lockId || 0; G.lockId = Ctl.lockId; }
    const id = Ctl.lockId; if (!id) return null;
    const u = G.s.champs.find(c => c.id === id);
    if (!u || !u.alive || u.team === me.team || !Sim.canSee(G.s, me.team, u)) { if (Ctl.lockId === id) { Ctl.lockId = 0; G.lockId = 0; } return null; }
    return u;
  }
  // The enemy champion under a screen point, generous enough for a thumb.
  function enemyAt(p) {
    const me = G.me, s = G.s; let best = null, bd = Infinity;
    for (const u of s.champs) {
      if (!u.alive || u.team === me.team || !Sim.canSee(s, me.team, u)) continue;
      const X = sx(u.x), Y = sy(u.y), rr = Math.max(30, (u.r || 30) * Z * 1.25 + 14);
      // The coin stands on its spot, so the hit area reaches up a little as well.
      const d = Math.min(Math.hypot(p.x - X, p.y - Y), Math.hypot(p.x - X, p.y - (Y - (u.r || 30) * Z)));
      if (d < rr && d < bd) { bd = d; best = u; }
    }
    return best;
  }
  function setLock(u) {
    if (!u || !G.me.alive) return false;
    const fresh = Ctl.lockId !== u.id; Ctl.lockId = u.id; G.lockId = u.id; Ctl.lockAt = performance.now();
    G.me.q.push({ t: 'lock', id: u.id });
    Hud.locked(u, fresh);
    if (fresh) Sound.play('lockOn');
    return true;
  }

  // ---------- 13.0: evade ----------
  // A tap dodges the way you are moving (or facing); a drag picks the way. While you are already steering, it goes on the press, no wait.
  const evadeCd = me => Math.max(0, me.evadeCd !== undefined ? me.evadeCd : me.evCd !== undefined ? me.evCd : 0);
  function sendEvade(dx, dy) {
    const me = G.me, l = Math.hypot(dx, dy); if (!l) { dx = me.fx || 1; dy = me.fy || 0; } else { dx /= l; dy /= l; }
    me.q.push({ t: 'evade', dx, dy }); Hud.evaded(); Sound.play('evade');
  }
  function pressEvade(id, p) {
    const me = G.me;
    if (!me.alive) return;
    if (evadeCd(me) > 0 || me.stunT > 0) { Hud.evadeDeny(); Sound.play('cancel'); return; }
    if (Ctl.stick && (me.mv.x || me.mv.y)) { sendEvade(me.mv.x, me.mv.y); Ctl.p.set(id, { role: 'none' }); return; }
    Ctl.ev = { id, sx: p.x, sy: p.y, dx: 0, dy: 0 };
    Ctl.p.set(id, { role: 'evade' });
    Hud.evadePress();
  }
  function releaseEvade(lost) {
    const E = Ctl.ev; Ctl.ev = null; if (!E || lost || !G.me.alive) return;
    if (Math.hypot(E.dx, E.dy) > EVADE_PX) sendEvade(E.dx, E.dy / TILT);
    else { const me = G.me; sendEvade(me.mv.x || me.fx, me.mv.y || me.fy); }
  }

  // ---------- 13.0: minimap look ----------
  // Hold the minimap to look anywhere; slide to pan. Let go and the camera snaps back to you.
  function mapPoint(p) { const M = Hud.ui.map; return { x: Math.max(0, Math.min(Sim.W, (p.x - M.x) / M.w * Sim.W)), y: Math.max(0, Math.min(Sim.H, (p.y - M.y) / M.h * Sim.H)) }; }
  function lookAt(p) { const w = mapPoint(p); Ctl.look.x = w.x; Ctl.look.y = w.y; G.look = { x: w.x, y: w.y }; }
  function endLook() { Ctl.look = null; if (G) G.look = null; }

  // ---------- pings ----------
  const RADIAL = [['attack', 0, -1], ['omw', 1, 0], ['help', 0, 1], ['retreat', -1, 0]];
  function radialPick(dx, dy) {
    if (Math.hypot(dx, dy) < RADIAL_DEAD) return null;
    let best = null, top = -2;
    for (const [k, ox, oy] of RADIAL) { const d = (dx * ox + dy * oy) / Math.hypot(dx, dy); if (d > top) { top = d; best = k; } }
    return best;
  }
  function openRadial(id, press, at, sticky) {
    const R = Hud.radialR() + 30, cx = Math.max(R + 44, Math.min(VW - R - 44, press.x)), cy = Math.max(R + 4, Math.min(VH - R - 4, press.y));
    Ctl.ping = { id, cx, cy, sx: press.x, sy: press.y, x: at.x, y: at.y, sel: null, sticky: !!sticky, age: 0 };
    Hud.radialOpen();
  }
  function sendPing(kind, x, y) {
    if (!G) return;
    if (!Hud.ping(kind, x, y)) return;
    G.me.q.push({ t: 'ping', kind, x, y });
  }
  function closeRadial(send) {
    const P = Ctl.ping; if (!P) return;
    Ctl.ping = null;
    if (send && P.sel) sendPing(P.sel, P.x, P.y);
  }
  // The held minimap opens the radial once the finger has stayed for a moment.
  function mapHoldTick() {
    const H_ = Ctl.mapHold; if (!H_ || Ctl.ping) return;
    if (performance.now() - H_.t0 < HOLD_MS) return;
    Ctl.mapHold = null;
    openRadial(H_.id, { x: H_.sx, y: H_.sy }, { x: H_.wx, y: H_.wy }, false);
    Ctl.p.set(H_.id, { role: 'ping' });
    Sound.play('tap');
  }

  // Taps resolve to the closest control, so packed buttons never steal each other's touches.
  function closest(p, list, pad) {
    let best = null, top = Infinity;
    for (const [key, b] of list) { const d = Math.hypot(p.x - b.x, p.y - b.y) - b.r; if (d < pad && d < top) { top = d; best = key; } }
    return best;
  }
  const atkList = U => [['champ', U.atk], ['minion', U.atkM], ['tower', U.atkT]];
  function clusterList(U) { return [...atkList(U), ['ab0', U.ab[0]], ['ab1', U.ab[1]], ['ab2', U.ab[2]], ['ev', U.evade]]; }
  function setAtk(id, mode) {
    Ctl.p.set(id, { role: 'atk' }); Ctl.atk = id; Ctl.atkMode = mode;
    Hud.atkPressed(mode); Sound.play(mode === 'minion' ? 'atkMinion' : mode === 'tower' ? 'atkTower' : 'atkChamp');
    if (G) G.me.atkMode = mode;
  }

  view.addEventListener('pointerdown', e => {
    e.preventDefault(); Sound.init();
    if (!G || G.ended || paused) return;
    try { view.setPointerCapture(e.pointerId); } catch (_) { }
    const p = Ctl.pt(e), U = Hud.ui, me = G.me;
    if (G.intro <= 0 && !G.outro) {
      if (Ctl.ping && Ctl.ping.sticky) {
        const P = Ctl.ping, R = Hud.radialR(), d = Math.hypot(p.x - P.cx, p.y - P.cy);
        if (d < R + 30) { P.sel = radialPick(p.x - P.cx, p.y - P.cy); closeRadial(true); return; }
        closeRadial(false);
      }
      if (Hud.shopOpen() && me.alive && !near(U.shop, p, 8)) Hud.closeShop();
      if (Hud.qcOpen() && !near(U.chat, p, 8)) Hud.qcClose();
      if (Ctl.aim && near(U.cancel, p, 6)) { cancelAim(); return; }
      if (near(U.pause, p, 10)) { Hud.squash('pause'); Hud.openPause(); return; }
      if (G.spectator) return; // a spectator's only control here is the menu
      if (Hud.pttShown() && near(U.ptt, p, 8)) { Hud.squash('ptt'); Ctl.p.set(e.pointerId, { role: 'ptt' }); Ctl.talking = true; Voice.talk(true); Sound.play('tap'); return; }
      if (near(U.shop, p, 8)) { Hud.squash('shop'); Hud.toggleShop(); return; }
      if (near(U.recall, p, 8)) { Hud.squash('recall'); if (me.alive) { me.q.push({ t: 'recall' }); Sound.play('recall'); } return; }
      if (near(U.chat, p, 8)) { Hud.squash('chat'); Hud.qcToggle(); return; }
      if (near(U.ping, p, 8)) { Hud.squash('ping'); openRadial(e.pointerId, p, Ctl.look ? { x: Ctl.look.x, y: Ctl.look.y } : { x: me.x, y: me.y }, false); Ctl.p.set(e.pointerId, { role: 'ping', fromBtn: true }); Sound.play('tap'); return; }
      if (Hud.qbuyShown() && near(U.qbuy, p, 8)) { Hud.squash('qbuy'); Hud.quickBuy(); return; }
      const hit = closest(p, clusterList(U), 11);
      if (hit === 'champ' || hit === 'minion' || hit === 'tower') { setAtk(e.pointerId, hit); return; }
      if (hit === 'ev') { pressEvade(e.pointerId, p); return; }
      if (hit) { pressAbility(+hit[2], e.pointerId, p); return; }
      const M = U.map;
      if (p.x > M.x - 8 && p.x < M.x + M.w + 8 && p.y > M.y - 8 && p.y < M.y + M.h + 10) {
        if (Ctl.look) Ctl.p.delete(Ctl.look.id);
        Ctl.look = { id: e.pointerId, x: 0, y: 0 }; lookAt(p);
        Ctl.p.set(e.pointerId, { role: 'map' });
        Sound.play('tick');
        return;
      }
    }
    // A tap on an enemy coin, away from the movement thumb, switches your lock to it.
    const zone0 = Hud.left() ? p.x > VW * .45 : p.x < VW * .55;
    if (!zone0 && G.intro <= 0 && !G.spectator) { const u = enemyAt(p); if (u) { setLock(u); Hud.touchMark(p.x, p.y, true); return; } Hud.touchMark(p.x, p.y, false); }
    const zone = Hud.left() ? p.x > VW * .45 : p.x < VW * .55;
    // A new thumb on the movement side always takes over: iOS can lose the lift of an old touch near the screen edge, which left the stick stuck.
    if (zone) { if (Ctl.stick) Ctl.p.delete(Ctl.stick.id); Ctl.stick = { id: e.pointerId, sx: p.x, sy: p.y, x: p.x, y: p.y, t0: performance.now(), far: 0 }; Ctl.p.set(e.pointerId, { role: 'stick' }); }
  });

  view.addEventListener('pointermove', e => {
    if (!G) return; e.preventDefault();
    const st = Ctl.stick, A = Ctl.aim, r = Ctl.p.get(e.pointerId);
    if (st && st.id === e.pointerId) { const p = Ctl.pt(e); st.x = p.x; st.y = p.y; st.far = Math.max(st.far, Math.hypot(p.x - st.sx, p.y - st.sy)); }
    if (r && r.role === 'evade' && Ctl.ev && Ctl.ev.id === e.pointerId) { const p = Ctl.pt(e); Ctl.ev.dx = p.x - Ctl.ev.sx; Ctl.ev.dy = p.y - Ctl.ev.sy; }
    if (r && r.role === 'atk' && Ctl.atk === e.pointerId) {
      // Slide between the three attack buttons without lifting.
      const hit = closest(Ctl.pt(e), atkList(Hud.ui), 3);
      if (hit && hit !== Ctl.atkMode) { Ctl.atkMode = hit; G.me.atkMode = hit; Hud.atkPressed(hit); Sound.play(hit === 'minion' ? 'atkMinion' : hit === 'tower' ? 'atkTower' : 'atkChamp'); }
    }
    if (r && r.role === 'map' && Ctl.look && Ctl.look.id === e.pointerId) lookAt(Ctl.pt(e));
    if (r && r.role === 'ping' && Ctl.ping && Ctl.ping.id === e.pointerId) {
      const p = Ctl.pt(e), P = Ctl.ping, sel = radialPick(p.x - P.sx, p.y - P.sy);
      if (sel !== P.sel) { P.sel = sel; if (sel) Sound.play('tick'); }
    }
    if (A && A.id === e.pointerId) {
      const p = Ctl.pt(e), U = Hud.ui, B = U.ab[A.slot], gate = MOVE_PX / sens();
      A.dx = p.x - A.sx; A.dy = p.y - A.sy;
      if (Math.hypot(A.dx, A.dy) > gate) A.moved = true;
      if (!near(B, p, 8)) A.left = true;
      A.backHot = (A.left && near(B, p, 2)) || (A.moved && Math.hypot(A.dx, A.dy) < gate);
      const hot = A.backHot || near(U.cancel, p, 10);
      if (hot && !A.cancelHot) Sound.play('tap');
      A.cancelHot = hot;
    }
  });

  function endPointer(e, lost) {
    Sound.init();
    if (!G) return;
    const r = Ctl.p.get(e.pointerId); if (!r) return;
    Ctl.p.delete(e.pointerId);
    if (r.role === 'stick') {
      const st = Ctl.stick; Ctl.stick = null;
      // A quick tap that never steered, landing on an enemy coin, locks onto it even on the movement side.
      if (st && !lost && st.far < 10 && performance.now() - st.t0 < 260 && G.intro <= 0 && !G.spectator) { const u = enemyAt({ x: st.sx, y: st.sy }); if (u) { setLock(u); Hud.touchMark(st.sx, st.sy, true); } }
    }
    else if (r.role === 'evade') releaseEvade(lost);
    else if (r.role === 'ptt') { Ctl.talking = false; Voice.talk(false); }
    else if (r.role === 'atk') { Ctl.atk = null; Ctl.atkMode = 'champ'; G.me.atkMode = 'champ'; }
    else if (r.role === 'map') { if (Ctl.look && Ctl.look.id === e.pointerId) endLook(); }
    else if (r.role === 'ping') {
      const P = Ctl.ping; if (!P || P.id !== e.pointerId) return;
      if (lost) { closeRadial(false); return; }
      // A plain tap on the ping button leaves the wheel open for a second tap.
      if (!P.sel && r.fromBtn) { P.sticky = true; return; }
      closeRadial(true);
    }
    else if (r.role === 'aim' && Ctl.aim && Ctl.aim.id === e.pointerId) {
      if (lost || Ctl.aim.cancelHot) { cancelAim(); return; }
      const me = G.me, A = Ctl.aim, d = aimDir();
      Ctl.aim = null;
      if (me.alive) me.q.push({ t: 'cast', slot: A.slot, tx: d.tx, ty: d.ty });
    }
  }
  view.addEventListener('pointerup', e => endPointer(e, false));
  view.addEventListener('pointercancel', e => endPointer(e, true));
  view.addEventListener('lostpointercapture', e => endPointer(e, true));
  // iOS sometimes never reports a finger leaving near the edge of the screen. The touch list is the truth.
  const dropStaleStick = e => {
    const st = Ctl.stick; if (!st || !G) return;
    let near = false; for (const t of e.touches) { const p = Ctl.pt(t); if (Math.hypot(p.x - st.x, p.y - st.y) < 130) near = true; }
    if (!near) endPointer({ pointerId: st.id }, true);
  };
  document.addEventListener('touchend', dropStaleStick, { passive: true });
  document.addEventListener('touchcancel', dropStaleStick, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden && G) { for (const id of [...Ctl.p.keys()]) endPointer({ pointerId: id }, true); } });

  function applyInput() {
    const me = G.me, st = Ctl.stick;
    if (st) {
      let dx = st.x - st.sx, dy = st.y - st.sy;
      const l = Math.hypot(dx, dy);
      if (l > STICK) { st.sx += dx * (1 - STICK / l); st.sy += dy * (1 - STICK / l); dx = st.x - st.sx; dy = st.y - st.sy; }
      const m = Math.hypot(dx, dy) / STICK;
      if (m > .09) { const wy = dy / TILT, n = Math.hypot(dx, wy) || 1, f = Math.min(1, m / STICK_FULL); me.mv.x = dx / n * f; me.mv.y = wy / n * f; }
      else me.mv.x = me.mv.y = 0;
    } else me.mv.x = me.mv.y = 0;
    me.atk = Ctl.atk !== null;
    me.atkMode = Ctl.atk !== null ? Ctl.atkMode : 'champ';
    mapHoldTick();
    if (!me.alive) { if (Ctl.aim) Ctl.aim = null; if (Ctl.ev) Ctl.ev = null; }
    lockedUnit();
    if (Ctl.aim && me.charge && me.charge.slot === Ctl.aim.slot) {
      const d = aimDir(), far = me.kit[Ctl.aim.slot].range || 600;
      me.q.push({ t: 'aim', tx: me.x + d.dx * far, ty: me.y + d.dy * far });
    }
  }
  Ctl.radial = RADIAL;
  Ctl.lockedUnit = lockedUnit; Ctl.evadeCd = evadeCd; Ctl.enemyAt = enemyAt;

  return { Ctl, applyInput, aimDir };
})();

// ---------- kinetic scrolling ----------
// One scroller for every list in the game, because native scrolling cannot be trusted inside the rotated stage.
// Mark a list with .scroll (vertical) or .scroll.sx (sideways). Fingers are read in stage space, so both orientations behave the same.
const Kin = (() => {
  const SLOP = 7, TAU_MS = 340, MAX_V = 5, K_SPRING = .00024, C_SPRING = .031, STOP_V = .012, SAMPLE_MS = 90, RUBBER = .5, FLICK_KEEP = 450, HOLD_MS = 130; // a dropped frame can delay the last move by 100ms; a real pause is longer
  const states = new WeakMap(), active = new Set();
  let track = null, swallow = false, swallowT = 0, raf = 0, last = 0;

  const isX = el => el.classList.contains('sx');
  function st(el) {
    let s = states.get(el);
    if (!s) { s = { el, x: isX(el), pos: 0, v: 0, mode: 'idle', over: 0, bar: null, barT: 0, at: 0, flickV: 0, flickT: 0, target: 0 }; states.set(el, s); }
    s.x = isX(el);
    return s;
  }
  // Held steady during a drag or fling: the rubber-band transform can inflate scrollHeight, and a limit that moves makes the list jerk at its end.
  const limit = s => s.lock > 0 ? s.lock : (s.x ? s.el.scrollWidth - s.el.clientWidth : s.el.scrollHeight - s.el.clientHeight);
  const read = s => s.x ? s.el.scrollLeft : s.el.scrollTop;
  const size = s => s.x ? s.el.clientWidth : s.el.clientHeight;
  // Soft resistance past the ends: the further you pull, the less it follows.
  const rubber = (d, h) => { const a = Math.abs(d), v = (1 - 1 / (a * RUBBER / h + 1)) * h; return d < 0 ? -v : v; };

  function bar(s) {
    const el = s.el, host = el.offsetParent; if (!host) return null;
    if (!s.bar || s.bar.parentNode !== host) {
      if (s.bar) s.bar.remove();
      s.bar = document.createElement('i'); s.bar.className = 'kbar' + (s.x ? ' x' : ''); s.bar.setAttribute('aria-hidden', 'true'); host.append(s.bar);
    }
    return s.bar;
  }
  function paintBar(s) {
    const max = limit(s), b = bar(s); if (!b) return;
    if (max < 2) { b.classList.remove('on'); return; }
    const el = s.el, view = size(s), track_ = view - 8, len = Math.max(26, track_ * view / (view + max)) - Math.abs(s.over) * .6, f = Math.max(0, Math.min(1, read(s) / max)), at = 4 + (track_ - len) * f + (s.over > 0 ? Math.max(0, s.over) * .4 : 0);
    if (s.x) { b.style.left = el.offsetLeft + 'px'; b.style.top = el.offsetTop + el.offsetHeight - 3 + 'px'; b.style.width = len + 'px'; b.style.transform = `translate3d(${at}px,0,0)`; }
    else { b.style.left = el.offsetLeft + el.offsetWidth - 4 + 'px'; b.style.top = el.offsetTop + 'px'; b.style.height = len + 'px'; b.style.transform = `translate3d(0,${at}px,0)`; }
    b.classList.add('on'); s.barT = performance.now();
  }
  function write(s, quiet) {
    const max = Math.max(0, limit(s)), p = Math.max(0, Math.min(max, s.pos));
    if (s.x) s.el.scrollLeft = p; else s.el.scrollTop = p;
    const over = s.pos < 0 ? s.pos : s.pos > max ? s.pos - max : 0;
    if (over !== s.over || over) {
      s.over = over;
      if (over) { s.el.style.setProperty('--ko', `${-over}px`); s.el.classList.add('kov'); }
      else { s.el.classList.remove('kov'); s.el.style.removeProperty('--ko'); }
    }
    if (!quiet) paintBar(s);
  }
  function wake(s) { active.add(s); if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } }
  function settle(s, keepBar) { s.lock = 0; s.mode = 'idle'; s.v = 0; if (s.over) { s.over = 0; s.el.classList.remove('kov'); s.el.style.removeProperty('--ko'); } if (!keepBar) active.delete(s); }
  function tick(now) {
    raf = 0;
    const dt = Math.min(34, now - last || 16); last = now;
    for (const s of active) {
      if (!s.el.isConnected) { active.delete(s); continue; }
      if (s.mode === 'fling') {
        const max = Math.max(0, limit(s)), d = s.pos < 0 ? s.pos : s.pos > max ? s.pos - max : 0;
        if (d) {
          // Past an end: a stiff spring brings it back without a wobble.
          s.v += (-K_SPRING * d - C_SPRING * s.v) * dt; s.pos += s.v * dt;
          const edge = s.pos < 0 ? 0 : s.pos > max ? max : (d < 0 ? 0 : max);
          if (Math.abs(s.pos - edge) < .4 && Math.abs(s.v) < .03) { s.pos = edge; write(s); settle(s, true); continue; }
          if ((d < 0 && s.pos >= 0) || (d > 0 && s.pos <= max)) { s.pos = edge; write(s); settle(s, true); continue; }
        } else {
          s.v *= Math.exp(-dt / TAU_MS); s.pos += s.v * dt;
          if (Math.abs(s.v) < STOP_V) { write(s); settle(s, true); continue; }
          if (s.pos < 0 || s.pos > max) s.v = Math.max(-1.1, Math.min(1.1, s.v));
        }
        write(s);
      } else if (s.mode === 'glide') {
        s.pos += (s.target - s.pos) * (1 - Math.exp(-dt / 70));
        if (Math.abs(s.target - s.pos) < .5) { s.pos = s.target; write(s); settle(s, true); continue; }
        write(s);
      } else if (s.mode === 'idle' && now - s.barT > 620) { if (s.bar) s.bar.classList.remove('on'); active.delete(s); }
    }
    if (active.size) raf = requestAnimationFrame(tick);
  }
  function chainOf(t) { const out = []; for (let e = t && t.closest ? t.closest('.scroll') : null; e; e = e.parentElement && e.parentElement.closest('.scroll')) out.push(e); return out; }

  // ---------- fast taps ----------
  // Buttons fire on touch-up, from here, instead of waiting for the browser's click. iOS can hold a click back
  // (double-tap detection, hover emulation, a busy frame); this path does not. The native click that follows is eaten.
  const TAP_SLOP = 12, TAP_MAX_MS = 900;
  let tap = null, fastAt = -1e9, fastEl = null;
  const tappable = t => { const b = t && t.closest ? t.closest('button,[role=button]') : null; return b && !b.disabled && !b.closest('canvas#view') && !b.classList.contains('hk') ? b : null; };
  document.addEventListener('pointerdown', e => {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) { tap = null; return; }
    const b = tappable(e.target); tap = b ? { id: e.pointerId, b, p: Ctl.pt(e), t: e.timeStamp } : null;
    if (!G) window.__inputAt = performance.now();
  }, true);
  document.addEventListener('pointermove', e => { if (tap && tap.id === e.pointerId) { const p = Ctl.pt(e); if (Math.hypot(p.x - tap.p.x, p.y - tap.p.y) > TAP_SLOP) tap = null; } }, true);
  document.addEventListener('pointercancel', e => { if (tap && tap.id === e.pointerId) tap = null; }, true);
  document.addEventListener('pointerup', e => {
    const T = tap; tap = null; if (!G) window.__inputAt = performance.now();
    if (!T || T.id !== e.pointerId || swallow || e.timeStamp - T.t > TAP_MAX_MS) return;
    // Still over the same button when the finger lifts (the target of a touch pointerup is where it lifted, without capture).
    const under = document.elementFromPoint(e.clientX, e.clientY);
    if (under && !T.b.contains(under) && under !== T.b) return;
    if (!T.b.isConnected || T.b.disabled) return;
    fastAt = performance.now(); fastEl = T.b;
    T.b.click();
  }, true);

  document.addEventListener('pointerdown', e => {
    clearTimeout(swallowT); swallow = false;
    if (track && track.id !== e.pointerId) return; // a second finger never disturbs the first
    const chain = chainOf(e.target);
    // A touch on a moving list only stops it. It is not also a tap on whatever slid under the finger.
    for (const el of chain) { const s = st(el); if (s.mode === 'fling' || s.mode === 'glide') { if (Math.abs(s.v) > .08 || s.mode === 'glide') swallow = true; settle(s, true); wake(s); } }
    track = chain.length ? { id: e.pointerId, p0: Ctl.pt(e), p: Ctl.pt(e), chain, owner: null, btn: e.target.closest && e.target.closest('button'), last: null, samples: [] } : null;
  }, true);

  document.addEventListener('pointermove', e => {
    if (!track || track.id !== e.pointerId) return;
    const p = Ctl.pt(e);
    if (!track.owner) {
      const dx = p.x - track.p0.x, dy = p.y - track.p0.y;
      if (Math.hypot(dx, dy) < SLOP) return;
      const wantX = Math.abs(dx) > Math.abs(dy), el = track.chain.find(c => isX(c) === wantX && limit(st(c)) > 1);
      if (!el) { track = null; return; }
      const s = st(el); s.lock = 0; s.lock = limit(s); s.pos = s.raw = read(s); s.v = 0; s.mode = 'drag'; track.owner = s; track.p = p; swallow = true;
      if (track.btn) track.btn.classList.remove('down');
      active.add(s);
      track.samples = [[e.timeStamp, s.pos]];
      return;
    }
    const s = track.owner, delta = s.x ? p.x - track.p.x : p.y - track.p.y;
    track.p = p;
    if (!s.el.isConnected) { track = null; return; }
    const max = Math.max(0, limit(s));
    // Inside the ends the list follows the finger exactly; past them, the raw distance feeds the rubber band.
    s.raw -= delta;
    const h = size(s) * .32;
    s.pos = s.raw < 0 ? (calm ? 0 : rubber(s.raw, h)) : s.raw > max ? max + (calm ? 0 : rubber(s.raw - max, h)) : s.raw;
    write(s);
    const t = e.timeStamp, sam = track.samples; sam.push([t, s.pos]);
    while (sam.length > 2 && t - sam[0][0] > SAMPLE_MS) sam.shift();
  }, true);

  function release(e, lost) {
    if (!track || track.id !== e.pointerId) return;
    const s = track.owner, sam = track.samples; track = null;
    if (!s) return;
    clearTimeout(swallowT); swallowT = setTimeout(() => { swallow = false; }, 380);
    let v = 0;
    if (!lost && sam.length > 1 && !calm) {
      const t1 = e.timeStamp, a = sam[0], b = sam[sam.length - 1], span = Math.max(8, b[0] - a[0]);
      // A held finger leaves no momentum. Event times, not the clock now: a busy frame must not read as a pause.
      if (t1 - b[0] < HOLD_MS) v = (b[1] - a[1]) / span;
    }
    // Repeated flicks the same way stack, the way a long list wants to be thrown.
    const now = performance.now();
    if (s.flickV && now - s.flickT < FLICK_KEEP && Math.sign(s.flickV) === Math.sign(v) && Math.abs(v) > .25) v += s.flickV * .6;
    v = Math.max(-MAX_V, Math.min(MAX_V, v));
    s.flickV = v; s.flickT = now;
    s.v = v; s.mode = 'fling'; wake(s);
  }
  document.addEventListener('pointerup', e => release(e, false), true);
  document.addEventListener('pointercancel', e => release(e, true), true);
  // Anything that was a scroll is not also a tap.
  document.addEventListener('click', e => {
    // The browser's own click after a fast tap already handled: drop it (synthetic clicks are not trusted, so ours pass).
    if (e.isTrusted && fastEl && performance.now() - fastAt < 800) { const b = tappable(e.target); if (!b || b === fastEl || fastEl.contains(b) || !fastEl.isConnected || performance.now() - fastAt < 450) { e.stopPropagation(); e.preventDefault(); if (b === fastEl) fastEl = null; return; } }
    if (swallow && e.isTrusted) { swallow = false; e.stopPropagation(); e.preventDefault(); }
  }, true);
  // Older Safari will still try to pan the page unless the touch is claimed here.
  document.addEventListener('touchmove', e => { if (track && track.owner) e.preventDefault(); }, { passive: false });

  return {
    // Put a list back without a stale fling carrying over into new content.
    stop(el) { const s = states.get(el); if (s) { settle(s, false); s.pos = read(s); } },
    // Slide a child into view, centred, for tab strips and the like.
    reveal(el, child, snap) {
      const s = st(el), max = Math.max(0, limit(s)); if (!max) return;
      const at = s.x ? child.offsetLeft - el.offsetLeft : child.offsetTop - el.offsetTop, len = s.x ? child.offsetWidth : child.offsetHeight;
      s.target = Math.max(0, Math.min(max, at - (size(s) - len) / 2)); s.pos = read(s);
      if (snap || calm) { s.pos = s.target; write(s, true); return; }
      s.mode = 'glide'; wake(s);
    },
  };
})();
