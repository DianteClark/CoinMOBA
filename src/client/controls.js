// Touch controls. Abilities fire on release so the player always has a chance to cancel.
const { Ctl, applyInput, aimDir } = (() => {
  const Ctl = {
    p: new Map(), stick: null, aim: null, atk: null, atkMode: 'champ', beacon: null, ping: null, mapHold: null,
    reset() { this.p.clear(); this.stick = null; this.aim = null; this.atk = null; this.atkMode = 'champ'; this.beacon = null; this.ping = null; this.mapHold = null; },
    pt(e) { return rotated ? { x: e.clientY, y: innerWidth - e.clientX } : { x: e.clientX, y: e.clientY }; },
  };
  const near = (b, p, pad) => Math.hypot(p.x - b.x, p.y - b.y) < b.r + pad;
  const STICK = 58, MOVE_PX = 16, FULL_PX = 96, HOLD_MS = 240, RADIAL_DEAD = 20;
  // Higher sensitivity: a shorter drag starts the aim and reaches full range.
  const sens = () => Math.max(.5, Math.min(2, save.aimSens || 1));

  // Distance a straight shot from the caster travels along (dx, dy) before a wall stops it.
  const wallAt = (me, dx, dy, len) => Sim.rayWall ? Sim.rayWall(me.x, me.y, dx, dy, len) : len;
  // Abilities flagged `over` (a leap or a blink) ignore walls.
  const crossesWalls = (me, i) => !!me.kit[i].over;
  const clearShot = (me, u, d, free) => free || d < 1 || wallAt(me, (u.x - me.x) / d, (u.y - me.y) / d, d) >= d - (u.r || 0);

  // Nearest enemy champion that can be seen and reached, otherwise the nearest such unit.
  function quickTarget(me, a, free) {
    const r = (a.range || 600) + 80, s = G.s; let best = null, bd = r;
    const scan = list => { for (const u of list) { if (!u.alive || u.team === me.team || u.delay > 0 || !Sim.canSee(s, me.team, u)) continue; const d = Math.hypot(u.x - me.x, u.y - me.y); if (d < bd && clearShot(me, u, d, free)) { bd = d; best = u; } } };
    scan(s.champs); if (best) return best;
    scan(s.minions); scan(s.monsters);
    return best;
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

  // Beacons aim like an ability: tap drops one at your feet, drag throws it out.
  const beaconRange = () => Sim.BEACON_RANGE || 460;
  function beaconPoint() {
    const B = Ctl.beacon, me = G.me;
    if (!B || !B.moved) return { x: me.x, y: me.y };
    const wy = B.dy / TILT, l = Math.hypot(B.dx, wy) || 1, f = Math.min(1, Math.hypot(B.dx, B.dy) * sens() / FULL_PX) * beaconRange();
    return { x: me.x + B.dx / l * f, y: me.y + wy / l * f };
  }
  function pressBeacon(id, p) {
    const me = G.me;
    if (!me.alive) return;
    if (Hud.beaconLeft(me) < 1) { Hud.squash('beacon'); Hud.toast('No beacons ready'); Sound.play('cancel'); return; }
    Ctl.beacon = { id, sx: p.x, sy: p.y, dx: 0, dy: 0, moved: false, cancelHot: false, left: false };
    Ctl.p.set(id, { role: 'beacon' });
    Hud.squash('beacon'); Sound.play('tap');
  }

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
  function clusterList(U) { return [...atkList(U), ['ab0', U.ab[0]], ['ab1', U.ab[1]], ['ab2', U.ab[2]], ['beacon', U.beacon]]; }
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
      if (Ctl.aim && near(U.cancel, p, 6)) { cancelAim(); return; }
      if (near(U.pause, p, 10)) { Hud.squash('pause'); Hud.openPause(); return; }
      if (near(U.shop, p, 8)) { Hud.squash('shop'); Hud.toggleShop(); return; }
      if (near(U.recall, p, 8)) { Hud.squash('recall'); if (me.alive) { me.q.push({ t: 'recall' }); Sound.play('recall'); } return; }
      if (near(U.ping, p, 8)) { Hud.squash('ping'); openRadial(e.pointerId, p, { x: me.x, y: me.y }, false); Ctl.p.set(e.pointerId, { role: 'ping', fromBtn: true }); Sound.play('tap'); return; }
      const hit = closest(p, clusterList(U), 11);
      if (hit === 'champ' || hit === 'minion' || hit === 'tower') { setAtk(e.pointerId, hit); return; }
      if (hit === 'beacon') { pressBeacon(e.pointerId, p); return; }
      if (hit) { pressAbility(+hit[2], e.pointerId, p); return; }
      const M = U.map;
      if (p.x > M.x - 6 && p.x < M.x + M.w + 6 && p.y > M.y - 6 && p.y < M.y + M.h + 8) {
        const wx = Math.max(0, Math.min(Sim.W, (p.x - M.x) / M.w * Sim.W)), wy = Math.max(0, Math.min(Sim.H, (p.y - M.y) / M.h * Sim.H));
        Ctl.mapHold = { id: e.pointerId, sx: p.x, sy: p.y, wx, wy, t0: performance.now() };
        Ctl.p.set(e.pointerId, { role: 'map' });
        return;
      }
    }
    const zone = Hud.left() ? p.x > VW * .45 : p.x < VW * .55;
    if (zone && !Ctl.stick) { Ctl.stick = { id: e.pointerId, sx: p.x, sy: p.y, x: p.x, y: p.y }; Ctl.p.set(e.pointerId, { role: 'stick' }); }
  });

  view.addEventListener('pointermove', e => {
    if (!G) return; e.preventDefault();
    const st = Ctl.stick, A = Ctl.aim, r = Ctl.p.get(e.pointerId);
    if (st && st.id === e.pointerId) { const p = Ctl.pt(e); st.x = p.x; st.y = p.y; }
    if (r && r.role === 'atk' && Ctl.atk === e.pointerId) {
      // Slide between the three attack buttons without lifting.
      const hit = closest(Ctl.pt(e), atkList(Hud.ui), 3);
      if (hit && hit !== Ctl.atkMode) { Ctl.atkMode = hit; G.me.atkMode = hit; Hud.atkPressed(hit); Sound.play(hit === 'minion' ? 'atkMinion' : hit === 'tower' ? 'atkTower' : 'atkChamp'); }
    }
    if (r && r.role === 'map' && Ctl.mapHold && Ctl.mapHold.id === e.pointerId) {
      const p = Ctl.pt(e), H_ = Ctl.mapHold;
      if (Math.hypot(p.x - H_.sx, p.y - H_.sy) > 26) { H_.t0 = -1e9; mapHoldTick(); }
    }
    if (r && r.role === 'ping' && Ctl.ping && Ctl.ping.id === e.pointerId) {
      const p = Ctl.pt(e), P = Ctl.ping, sel = radialPick(p.x - P.sx, p.y - P.sy);
      if (sel !== P.sel) { P.sel = sel; if (sel) Sound.play('tick'); }
    }
    if (r && r.role === 'beacon' && Ctl.beacon && Ctl.beacon.id === e.pointerId) {
      const p = Ctl.pt(e), B = Ctl.beacon, U = Hud.ui;
      B.dx = p.x - B.sx; B.dy = p.y - B.sy;
      if (Math.hypot(B.dx, B.dy) > MOVE_PX / sens()) B.moved = true;
      if (!near(U.beacon, p, 8)) B.left = true;
      B.cancelHot = (B.left && near(U.beacon, p, 2)) || near(U.cancel, p, 10);
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
    if (r.role === 'stick') Ctl.stick = null;
    else if (r.role === 'atk') { Ctl.atk = null; Ctl.atkMode = 'champ'; G.me.atkMode = 'champ'; }
    else if (r.role === 'map') {
      const H_ = Ctl.mapHold;
      if (H_ && H_.id === e.pointerId) { Ctl.mapHold = null; if (!lost) sendPing('danger', H_.wx, H_.wy); }
    }
    else if (r.role === 'ping') {
      const P = Ctl.ping; if (!P || P.id !== e.pointerId) return;
      if (lost) { closeRadial(false); return; }
      // A plain tap on the ping button leaves the wheel open for a second tap.
      if (!P.sel && r.fromBtn) { P.sticky = true; return; }
      closeRadial(true);
    }
    else if (r.role === 'beacon' && Ctl.beacon && Ctl.beacon.id === e.pointerId) {
      const B = Ctl.beacon, pt = beaconPoint(), bad = lost || B.cancelHot;
      Ctl.beacon = null;
      if (bad) { Sound.play('cancel'); return; }
      if (G.me.alive) { G.me.q.push({ t: 'beacon', tx: pt.x, ty: pt.y }); Hud.beaconPlaced(pt); }
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

  function applyInput() {
    const me = G.me, st = Ctl.stick;
    if (st) {
      let dx = st.x - st.sx, dy = st.y - st.sy;
      const l = Math.hypot(dx, dy);
      if (l > STICK) { st.sx += dx * (1 - STICK / l); st.sy += dy * (1 - STICK / l); dx = st.x - st.sx; dy = st.y - st.sy; }
      const m = Math.hypot(dx, dy) / STICK;
      if (m > .1) { const wy = dy / TILT, n = Math.hypot(dx, wy) || 1, f = Math.min(1, m * 1.3); me.mv.x = dx / n * f; me.mv.y = wy / n * f; }
      else me.mv.x = me.mv.y = 0;
    } else me.mv.x = me.mv.y = 0;
    me.atk = Ctl.atk !== null;
    me.atkMode = Ctl.atk !== null ? Ctl.atkMode : 'champ';
    mapHoldTick();
    if (!me.alive) { if (Ctl.aim) Ctl.aim = null; if (Ctl.beacon) Ctl.beacon = null; }
    if (Ctl.aim && me.charge && me.charge.slot === Ctl.aim.slot) {
      const d = aimDir(), far = me.kit[Ctl.aim.slot].range || 600;
      me.q.push({ t: 'aim', tx: me.x + d.dx * far, ty: me.y + d.dy * far });
    }
  }
  Ctl.beaconPoint = beaconPoint;
  Ctl.radial = RADIAL;

  return { Ctl, applyInput, aimDir };
})();
