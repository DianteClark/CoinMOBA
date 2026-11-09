// ============================================================================================
// PLAY OF THE GAME API (agreed with UI and Art; this block is the contract, kept current by Netcode)
//
// Every device (solo too) keeps a rolling recording in bounded memory: about 30 s of snapshots plus the best clip so far.
// The host scores the moments and at match end sends its best clip to every guest and spectator, so everyone sees the same play.
// If the clip can't arrive (host vanished) a guest falls back to the best moment it saw itself (info.source 'local').
//
//   Replay.on('ready', info)     fires once per match, after the outro starts. info is null if nothing was worth showing.
//   Replay.ready                 true once there is a clip to play. Replay.info is the same object as the event.
//     info = {name, kit, team, pid (null for a bot), kind:'multi'|'ace'|'ult'|'steal'|'clutch'|'kill', n (kills), label ('Triple kill'), score, dur (seconds), source:'host'|'local'}
//   Replay.play(onDone)          plays it on the game canvas, camera following that champion. onDone runs when it ends or is skipped.
//   Replay.skip()                ends it now. Also ends by itself if the host sends everyone back to the room.
//   Replay.playing               bool.
//   While playing: G.replay = {t, dur, info} (t counts up in seconds). G.s and G.me are the replay's; they go back afterwards. Hide the HUD and
//   end-screen DOM, show the banner and a Skip button. Draw nothing that reads match results from G.s until onDone.
//   Replay.off(type, fn)
// ============================================================================================
const Replay = (() => {
  const RATE = 3, RING = 300, SLOW_EVERY = 30, LEAD = 75, TAIL = 45, MAX_CLIP = 480, CLOSE_AFTER = 330, MAX_SPAN = 600, TRIM = 1200, HOST_WAIT = 7000;
  const SKIP = new Set(['recap', 'ping', 'surrender', 'fund', 'reinforce', 'buy', 'sell', 'consume', 'boon', 'hope', 'gold', 'mapevent', 'buyback', 'evolve', 'warn']);
  const LABEL = ['', 'Takedown', 'Double kill', 'Triple kill', 'Quadra kill', 'Rampage'];
  const api = { ready: false, info: null, playing: false, on, off, play, skip, frame, reset, tick, guestSnap, guestEvent, guestSlow, guestOver, chunk };
  const listeners = Object.create(null);
  function on(type, fn) { const l = listeners[type] || (listeners[type] = []); if (!l.includes(fn)) l.push(fn); }
  function off(type, fn) { const l = listeners[type]; if (l && l.includes(fn)) l.splice(l.indexOf(fn), 1); }
  function emit(type, ...a) { (listeners[type] || []).slice().forEach(f => { try { f(...a); } catch (e) { console.error(e); } }); }

  let g = null, ring = [], evLog = [], moments = new Map(), bestScore = 0, bestClip = null, over = false, lastSnap = -99, lastSlow = -99, hostSeen = false, announced = false, fallback = 0, parts = null, clip = null, onDone = null, P = null;
  const id = () => (g ? (g.s.seed || 0) & 0xffffff : 0);

  function reset(G_) {
    clearTimeout(fallback); if (api.playing) finish();
    g = G_; ring = []; evLog = []; moments = new Map(); bestScore = 0; bestClip = null; over = false; lastSnap = lastSlow = -99; hostSeen = false; announced = false; parts = null; clip = null;
    api.ready = false; api.info = null; api.playing = false;
  }

  // ---------- recording ----------
  function pushSnap(tick, buf) { ring.push({ tick, buf, slow: null }); if (ring.length > RING) ring.shift(); const old = ring[0].tick - 30; if (evLog.length > 4000 || (evLog.length && evLog[0][0] < old - 300)) evLog = evLog.filter(x => x[0] >= old); }
  function takeSlow(s) { if (!ring.length || s.tick - lastSlow < SLOW_EVERY) return; lastSlow = s.tick; try { ring[ring.length - 1].slow = Sim.slowFlat(s); } catch (e) { } }
  function note(tick, e) {
    if (!SKIP.has(e.e)) { evLog.push([tick, Sim.packEvent(e)]); }
    score(tick, e);
  }
  // Host and solo: called every simulation tick, before the events are consumed.
  function tick(s) {
    if (!g) return;
    for (const e of s.ev) note(s.tick, e);
    if (s.tick - lastSnap >= RATE) { lastSnap = s.tick; pushSnap(s.tick, Sim.snapshot(s, -1, 0)); takeSlow(s); }
    sweep(s.tick, s);
    if (s.over && !over) finishHost(s);
  }
  // Guest: what arrived over the wire.
  function guestSnap(t, buf) { if (!g || t - lastSnap < RATE) return; lastSnap = t; pushSnap(t, buf); }
  function guestEvent(t, e) { if (g) { note(t, e); if (g.s) sweep(t, g.s); } }
  function guestSlow(s) { if (g) takeSlow(s); }

  // ---------- scoring ----------
  function moment(u, t) {
    let m = moments.get(u);
    if (!m) { m = { u, start: t, end: t, kills: 0, multi: 1, ult: false, steal: false, ace: false, clutch: false, score: 0 }; moments.set(u, m); }
    m.end = Math.max(m.end, t); return m;
  }
  // Sim's 'hl' events carry what made a moment special and its worth (v); a kill is worth a flat 100 on top.
  function score(t, e) {
    if (e.e === 'feed' && e.a) { const m = moment(e.a, t); m.kills++; m.multi = Math.max(m.multi, e.multi || 1); m.score += 100 + (e.first ? 30 : 0); return; }
    if (e.e !== 'hl' || !e.u) return;
    const m = moment(e.u, t); m.score += e.v || 0;
    if (e.kind === 'multi') m.multi = Math.max(m.multi, e.n || 2);
    else if (e.kind === 'steal') m.steal = true;
    else if (e.kind === 'ult') m.ult = true;
    else if (e.kind === 'ace') m.ace = true;
    else if (e.kind === 'clutch') m.clutch = true;
  }
  function sweep(t, s) { for (const [u, m] of moments) if (t - m.end > CLOSE_AFTER || m.end - m.start > MAX_SPAN) { moments.delete(u); consider(m, s, false); } }
  function consider(m, s) {
    const c = s.champs.find(x => x.id === m.u); if (!c) return;
    const sc = m.score + (c.bot || !c.human ? 0 : 20);
    if (sc <= bestScore || sc < 100) return;
    const to = m.end + TAIL, from = Math.max(m.start - LEAD, to - MAX_CLIP), got = ring.filter(r => r.tick >= from && r.tick <= to);
    if (got.length < 12) return;
    let made; try { made = freeze(m, c, s, got, from, to); } catch (e) { console.error(e); return; }
    bestScore = sc; bestClip = made;
  }

  // ---------- clips: decoded frames as plain arrays, keeping only what is near the action ----------
  const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;
  function near(cx, cy, list, pad = 0) { return list.filter(u => Math.abs(u.x - cx) < TRIM + pad && Math.abs(u.y - cy) < TRIM + pad); }
  function packFrame(fr, focus) {
    const f = fr.champs[focus], cx = f.x, cy = f.y;
    return [fr.tick,
      fr.champs.map(c => [r1(c.x), r1(c.y), c.hp, r2(c.fx), r2(c.fy), c.fl, c.fl2, c.z, c.br, c.chan ? [c.chan.n, c.chan.t, c.chan.total, r2(c.chan.dx), r2(c.chan.dy)] : 0, c.charge ? [c.charge.slot, c.charge.t, r2(c.charge.dx), r2(c.charge.dy)] : 0, c.echo ? [r1(c.echo.x), r1(c.echo.y)] : 0, c.ps]),
      near(cx, cy, fr.mon).map(u => [u.id, r1(u.x), r1(u.y), u.hp, u.fl, u.ex]),
      near(cx, cy, fr.min).map(u => [u.id, r1(u.x), r1(u.y), u.hp, u.fl, u.ex]),
      near(cx, cy, fr.proj).map(p => [p.id, r1(p.x), r1(p.y), p.fl, p.fx, p.w, p.owner, p.target, p.vx, p.vy]),
      near(cx, cy, fr.zones, 400).map(z => [z.id, r1(z.x), r1(z.y), z.r, z.t, z.total, z.fl, z.fx, z.owner, z.ext, z.x1, z.y1, z.x2, z.y2, z.tgt]),
      [],
      fr.prog || 0];
  }
  function unpackFrame(a) {
    const unit = u => ({ id: u[0], x: u[1], y: u[2], hp: u[3], fl: u[4], ex: u[5] });
    return { mid: 0, tick: a[0], ack: 0, seat: -1, own: null, size: 0,
      champs: a[1].map(c => ({ x: c[0], y: c[1], hp: c[2], fx: c[3], fy: c[4], fl: c[5], fl2: c[6], z: c[7], br: c[8], chan: c[9] ? { n: c[9][0], t: c[9][1], total: c[9][2], dx: c[9][3], dy: c[9][4] } : null, charge: c[10] ? { slot: c[10][0], t: c[10][1], dx: c[10][2], dy: c[10][3] } : null, echo: c[11] ? { x: c[11][0], y: c[11][1] } : null, ps: c[12] })),
      mon: a[2].map(unit), min: a[3].map(unit),
      proj: a[4].map(p => ({ id: p[0], x: p[1], y: p[2], fl: p[3], fx: p[4], w: p[5], owner: p[6], target: p[7], vx: p[8], vy: p[9] })),
      zones: a[5].map(z => { const o = { id: z[0], x: z[1], y: z[2], r: z[3], t: z[4], total: z[5], fl: z[6], fx: z[7], owner: z[8], ext: z[9] }; if (o.ext & 1) { o.x1 = z[10]; o.y1 = z[11]; o.x2 = z[12]; o.y2 = z[13]; } if (o.ext & 2) o.tgt = z[14]; return o; }),
      beacons: [],
      prog: a[7] || null };
  }
  function freeze(m, c, s, got, from, to) {
    const focus = s.champs.indexOf(c), frames = got.map(r => packFrame(Sim.decodeSnapshot(r.buf), focus));
    // Towers, levels and items at the start, then what changed once a second.
    let base = null; for (const r of ring) if (r.slow && (r.tick <= from || !base)) base = r;
    const slow = []; let prev = null;
    if (base) { slow.push([from, Sim.slowDiff(null, base.slow)]); prev = base.slow; for (const r of got) if (r.slow && r !== base && r.tick > base.tick) { const d = Sim.slowDiff(prev, r.slow); if (d.length) slow.push([r.tick, d]); prev = r.slow; } }
    const seat = g.cfg.teams.flat()[focus] || {}, kind = m.steal ? 'steal' : m.ace ? 'ace' : m.multi >= 2 || m.kills >= 2 ? 'multi' : m.ult ? 'ult' : m.clutch ? 'clutch' : 'kill', n = Math.max(m.multi, m.kills);
    const label = { steal: 'Boss steal', ace: 'Ace', multi: LABEL[Math.min(5, n)], ult: 'Big ultimate', clutch: 'Clutch', kill: 'Takedown' }[kind];
    const info = { name: seat.name || c.name || '', kit: c.champ, team: c.team, pid: seat.pid === undefined ? null : seat.pid, kind, n, label, score: Math.round(m.score), dur: Math.round((got[got.length - 1].tick - got[0].tick) / 3) / 10 };
    return { v: 1, focus, frames, ev: evLog.filter(x => x[0] >= from && x[0] <= to), slow, info };
  }

  // ---------- end of match ----------
  function closeAll(s) { for (const m of moments.values()) consider(m, s); moments.clear(); }
  function announce(c, source) {
    clip = c;
    if (c) { c.info.source = source; api.ready = true; api.info = c.info; } else { api.ready = false; api.info = null; }
    if (!announced) { announced = true; emit('ready', api.info); }
  }
  function finishHost(s) {
    over = true; closeAll(s); announce(bestClip, 'host');
    if (g && g.net) { try { Net._sendClip(id(), bestClip ? JSON.stringify(bestClip) : ''); } catch (e) { console.error(e); } }
  }
  function guestOver() {
    if (!g || over) return;
    over = true; closeAll(g.s); ring = []; evLog = [];
    if (hostSeen) return;
    const G0 = g; fallback = setTimeout(() => { if (g === G0 && !hostSeen) announce(bestClip, 'local'); }, HOST_WAIT);
  }
  function chunk(cid, i, n, str) {
    if (!g || cid !== id() || typeof str !== 'string' || !(n > 0) || n > 2000 || !(i >= 0 && i < n)) return;
    if (!parts || parts.n !== n) parts = { n, got: 0, a: [] };
    if (parts.a[i] === undefined) { parts.a[i] = str; parts.got++; }
    if (parts.got < n) return;
    const json = parts.a.join(''); parts = null;
    let c = null; if (json) { try { c = JSON.parse(json); } catch (e) { return; } if (!c || c.v !== 1 || !Array.isArray(c.frames) || c.frames.length < 2) return; }
    hostSeen = true; clearTimeout(fallback);
    if (!api.playing) announce(c, 'host');
  }

  // ---------- playback: Sim.applyFrame on a fresh match, exactly as a guest's world is built ----------
  function play(done) {
    if (!clip || !G || api.playing || G !== g) { if (done) done(); return; }
    let rs, frames;
    try {
      const cfg = G.cfg;
      rs = Sim.createMatch({ seed: G.s.seed, diff: cfg.diff, teams: cfg.teams, practice: cfg.practice, mode: cfg.mode });
      cfg.teams.flat().forEach((p, i) => { if (p.pid !== undefined) rs.champs[i].pid = p.pid; });
      frames = clip.frames.map(unpackFrame);
    } catch (e) { console.error(e); if (done) done(); return; }
    onDone = done || null;
    const focus = clip.focus, start = frames[0].tick;
    P = { rs, frames, i: 0, ev: clip.ev.slice(), slow: clip.slow.slice(), start, end: frames[frames.length - 1].tick, saved: { s: G.s, me: G.me, outro: G.outro, intro: G.intro, cam: { x: G.cam.x, y: G.cam.y }, acc: G.acc } };
    for (const row of P.slow.splice(0, 1)) Sim.applySlow(rs, row[1]);
    Sim.applyFrame(rs, frames[0], frames[1] || null, 0, -1);
    G.s = rs; G.me = rs.champs[focus]; G.outro = null; G.intro = 0; G.acc = 0;
    G.cam.x = G.me.x; G.cam.y = G.me.y;
    G.replay = { t: 0, dur: (P.end - start) * DT, info: clip.info };
    api.playing = true;
  }
  function frame(dt) {
    if (!P || !G || !G.replay) return;
    const R = G.replay, F = P.frames; R.t += dt;
    const rt = Math.min(P.end, P.start + R.t / DT);
    while (P.i < F.length - 2 && F[P.i + 1].tick <= rt) P.i++;
    const A = F[P.i], B = F[P.i + 1] || null;
    try { Sim.applyFrame(P.rs, A, B, B ? Math.min(1, (rt - A.tick) / (B.tick - A.tick)) : 0, -1); } catch (e) { console.error(e); finish(); return; }
    while (P.slow.length && P.slow[0][0] <= rt) { try { Sim.applySlow(P.rs, P.slow.shift()[1]); } catch (e) { console.error(e); } }
    while (P.ev.length && P.ev[0][0] <= rt) { const e = Sim.unpackEvent(P.ev.shift()[1]); try { fxEvent(e); soundEvent(e); } catch (err) { console.error(err); } }
    if (rt >= P.end) finish();
  }
  function finish() {
    const p = P, done = onDone; P = null; onDone = null; api.playing = false;
    if (p && G && G.replay) { const b = p.saved; G.s = b.s; G.me = b.me; G.outro = b.outro; G.intro = b.intro; G.cam.x = b.cam.x; G.cam.y = b.cam.y; G.acc = b.acc; G.replay = null; }
    if (done) { try { done(); } catch (e) { console.error(e); } }
  }
  function skip() { if (api.playing) finish(); }
  api._debug = () => ({ ring: ring.length, ev: evLog.length, best: bestClip ? JSON.stringify(bestClip).length : 0, frames: bestClip ? bestClip.frames.length : 0, info: bestClip && bestClip.info });
  Net.on('room', r => { if (r.phase === 'room' && api.playing) finish(); });
  return api;
})();
