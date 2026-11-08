// Touch controls. Abilities fire on release so the player always has a chance to cancel.
const { Ctl, applyInput, aimDir } = (() => {
  const Ctl = {
    p: new Map(), stick: null, aim: null, atk: null,
    reset() { this.p.clear(); this.stick = null; this.aim = null; this.atk = null; },
    pt(e) { return rotated ? { x: e.clientY, y: innerWidth - e.clientX } : { x: e.clientX, y: e.clientY }; },
  };
  const near = (b, p, pad) => Math.hypot(p.x - b.x, p.y - b.y) < b.r + pad;
  const STICK = 58, MOVE_PX = 16, FULL_PX = 96;

  // Nearest visible enemy champion in range, otherwise the nearest unit.
  function quickTarget(me, a) {
    const r = (a.range || 600) + 80; let best = null, bd = r;
    for (const e of G.s.champs) {
      if (!e.alive || e.team === me.team || !Sim.canSee(G.s, me.team, e)) continue;
      const d = Math.hypot(e.x - me.x, e.y - me.y); if (d < bd) { bd = d; best = e; }
    }
    if (best) return best;
    const scan = list => { for (const m of list) { if (!m.alive || m.team === me.team || m.delay > 0) continue; const d = Math.hypot(m.x - me.x, m.y - me.y); if (d < bd) { bd = d; best = m; } } };
    scan(G.s.minions); scan(G.s.monsters);
    return best;
  }

  // Where the current aim points. tx, ty is the exact point a release would send.
  function aimDir() {
    const me = G.me, A = Ctl.aim;
    if (!A) return { dx: me.fx, dy: me.fy, target: null, tx: me.x, ty: me.y, k: 1, reach: 0 };
    const a = me.kit[A.slot], range = a.range || 0, circle = a.shape === 'circle';
    let dx = me.fx, dy = me.fy, target = null, k = 1;
    if (a.shape === 'self') return { dx, dy, target, tx: me.x, ty: me.y, k, reach: 0 };
    if (A.moved) {
      const wy = A.dy / TILT, l = Math.hypot(A.dx, wy) || 1;
      dx = A.dx / l; dy = wy / l;
      if (circle) k = Math.min(1, Math.hypot(A.dx, A.dy) / FULL_PX);
    } else {
      target = quickTarget(me, a);
      if (target) {
        const tdx = target.x - me.x, tdy = target.y - me.y, l = Math.hypot(tdx, tdy) || 1;
        dx = tdx / l; dy = tdy / l;
        if (circle) k = Math.min(1, l / (range || 1));
      } else if (circle) k = .7;
    }
    const reach = range * k;
    return { dx, dy, target, tx: me.x + dx * reach, ty: me.y + dy * reach, k, reach };
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
    if (a.windup && me.chan && me.chan.slot === i) { me.q.push({ t: 'cancel' }); Sound.play('cancel'); Hud.flash(i); return; }
    if (i === 2 && me.lvl < 3) { Hud.toast('Ultimate unlocks at level 3'); Hud.deny(i); Sound.play('cancel'); return; }
    const recast = me.recast[i] > 0 && a.recast;
    if (me.cd[i] > 0 && !recast) { Hud.deny(i); return; }
    if (a.instant || (recast && me.champ === 'sable')) { me.q.push({ t: 'cast', slot: i, tx: me.x, ty: me.y }); Hud.flash(i); return; }
    if (Ctl.aim) return;
    if (a.charge && !recast) me.q.push({ t: 'charge', slot: i });
    Ctl.aim = { slot: i, id, sx: p.x, sy: p.y, dx: 0, dy: 0, moved: false, cancelHot: false, backHot: false, left: false };
    Ctl.p.set(id, { role: 'aim' });
    Sound.play('tap');
  }

  view.addEventListener('pointerdown', e => {
    e.preventDefault(); Sound.init();
    if (!G || G.ended || paused) return;
    try { view.setPointerCapture(e.pointerId); } catch (_) { }
    const p = Ctl.pt(e), U = Hud.ui, me = G.me;
    if (G.intro <= 0 && !G.outro) {
      if (Ctl.aim && near(U.cancel, p, 6)) { cancelAim(); return; }
      if (near(U.pause, p, 10)) { Hud.openPause(); return; }
      if (near(U.forge, p, 8)) { Hud.toggleForge(); return; }
      if (near(U.recall, p, 8)) { if (me.alive) { me.q.push({ t: 'recall' }); Sound.play('recall'); } return; }
      if (near(U.atk, p, 14)) { Ctl.p.set(e.pointerId, { role: 'atk' }); Ctl.atk = e.pointerId; Sound.play('tap'); return; }
      for (let i = 0; i < 3; i++) if (near(U.ab[i], p, 9)) { pressAbility(i, e.pointerId, p); return; }
    }
    if (p.x < VW * .55 && !Ctl.stick) { Ctl.stick = { id: e.pointerId, sx: p.x, sy: p.y, x: p.x, y: p.y }; Ctl.p.set(e.pointerId, { role: 'stick' }); }
  });

  view.addEventListener('pointermove', e => {
    if (!G) return; e.preventDefault();
    const st = Ctl.stick, A = Ctl.aim;
    if (st && st.id === e.pointerId) { const p = Ctl.pt(e); st.x = p.x; st.y = p.y; }
    if (A && A.id === e.pointerId) {
      const p = Ctl.pt(e), U = Hud.ui, B = U.ab[A.slot];
      A.dx = p.x - A.sx; A.dy = p.y - A.sy;
      if (Math.hypot(A.dx, A.dy) > MOVE_PX) A.moved = true;
      if (!near(B, p, 8)) A.left = true;
      A.backHot = (A.left && near(B, p, 2)) || (A.moved && Math.hypot(A.dx, A.dy) < MOVE_PX);
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
    else if (r.role === 'atk') Ctl.atk = null;
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
    if (Ctl.aim && !me.alive) Ctl.aim = null;
    if (Ctl.aim && me.charge && me.charge.slot === Ctl.aim.slot) {
      const d = aimDir(), far = me.kit[Ctl.aim.slot].range || 600;
      me.q.push({ t: 'aim', tx: me.x + d.dx * far, ty: me.y + d.dy * far });
    }
  }

  return { Ctl, applyInput, aimDir };
})();
