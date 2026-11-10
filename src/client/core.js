// Shared client state and the main loop. All files in src/client share one closure (see build.py).
const $ = id => document.getElementById(id);
const { TILT, TAU, TEAM } = Art, DT = Sim.DT;
const stage = $('stage'), view = $('view'), ctx = view.getContext('2d', { alpha: false });
// An animation ending can compute a tiny negative radius, which would otherwise throw and drop the whole frame.
for (const m of ['arc', 'ellipse']) { const f = ctx[m]; ctx[m] = m === 'arc' ? function (x, y, r, ...a) { return f.call(this, x, y, Math.max(0, r), ...a); } : function (x, y, rx, ry, ...a) { return f.call(this, x, y, Math.max(0, rx), Math.max(0, ry), ...a); }; }
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
let VW = 800, VH = 400, rotated = false, dpr = 2, quality = 2, ZB = 1, Z = 1;
let G = null, paused = false;

const KEY = 'mintfall.v1';
let save = { m: {}, music: true, sfx: true, diff: 'normal', hints: 0, gfx: 'auto', rank: 1000 };
try { const raw = localStorage.getItem(KEY); if (raw) save = Object.assign(save, JSON.parse(raw)); } catch (e) { }
if (!isFinite(save.rank)) save.rank = 1000;
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { } };
const pts = id => save.m[id] || 0;
Sound.setOn(save.music, save.sfx);

function applyQuality() { quality = save.gfx === 'low' ? 0 : save.gfx === 'high' ? 2 : quality; resize(); }
// Assigning canvas size reallocates and blanks it, even with the same number, so only do it when the size really changes.
function resize() { dpr = Math.min(devicePixelRatio || 1, quality >= 2 ? 2 : quality === 1 ? 1.5 : 1); const w = Math.floor(VW * dpr), h = Math.floor(VH * dpr); if (view.width !== w) view.width = w; if (view.height !== h) view.height = h; }
// How far the stage starts from the physical screen edge, and the physical width used for touch mapping.
let stageX = 0, physW = 0;
const safeProbe = (() => { const d = document.createElement('div'); d.id = 'safeProbe'; d.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'; document.documentElement.appendChild(d); return d; })();
function safeInsets() { const s = getComputedStyle(safeProbe), n = v => parseFloat(v) || 0; return { t: n(s.paddingTop), r: n(s.paddingRight), b: n(s.paddingBottom), l: n(s.paddingLeft) }; }
const IOS = /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// The UI already keeps this much clear at each side of the stage.
const UI_MARGIN = 44;
function layout() {
  let w = innerWidth, h = innerHeight;
  rotated = h > w; physW = w;
  const ins = safeInsets();
  // If the page runs under the status bar, iOS keeps taps there and just below it, so that edge needs a little extra.
  const topNeed = IOS && rotated && ins.t > 0 ? ins.t + 14 : ins.t;
  const needA = rotated ? topNeed : ins.l, needB = rotated ? ins.b : ins.r;
  const shiftA = Math.ceil(Math.max(0, needA - UI_MARGIN)), shiftB = Math.ceil(Math.max(0, needB - UI_MARGIN));
  stageX = shiftA;
  VW = (rotated ? h : w) - shiftA - shiftB; VH = rotated ? w : h;
  stage.style.width = VW + 'px'; stage.style.height = VH + 'px';
  stage.style.transform = rotated ? `translate(${w}px,${shiftA}px) rotate(90deg)` : `translateX(${shiftA}px)`;
  resize(); ZB = VW / 1340; Z = ZB; hud();
}
addEventListener('resize', layout); addEventListener('orientationchange', () => setTimeout(layout, 120)); addEventListener('pageshow', () => setTimeout(layout, 60)); setTimeout(() => { if (typeof hud === 'function') layout(); }, 400);
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('touchmove', e => { if (!e.target.closest('.scroll')) e.preventDefault(); }, { passive: false });

const lerp = (a, b, t) => a + (b - a) * t;
const pct = (a, b) => Math.max(0, Math.min(1, a / b));
const pos = (u, a) => ({ x: lerp(u.px, u.x, a), y: lerp(u.py, u.y, a) });
function spriteOf(u) { if (u.kind === 'champ') return Art.champCoin(u.champ, u.team, u.tier, undefined, u.finish); if (u.kind === 'minion') return Art.minionCoin(u.team, u.ranged); if (u.kind === 'monster') return Art.monsterCoin(u.big, u.boss); return null; }
const drawR = u => u.kind === 'champ' ? 27 : u.kind === 'minion' ? (u.ranged ? 13 : 16) : u.boss ? 60 : u.big ? 34 : 19;
const unitById = id => { const s = G.s; return s.champs.find(c => c.id === id) || s.minions.find(c => c.id === id) || s.monsters.find(c => c.id === id) || s.towers.find(c => c.id === id); };

// cfg: { teams: [[{champ, role, tier, human, remote, name}, ...4], [...4]], diff, seed }
// net: { role: 'host' | 'guest' } for an online match, otherwise leave it out.
function startMatch(cfg, net) {
  const seed = cfg.seed === undefined ? Date.now() & 0xffffff : cfg.seed;
  const s = Sim.createMatch({ seed, diff: cfg.diff, teams: cfg.teams, practice: cfg.practice, mode: cfg.mode, custom: cfg.custom, levels: cfg.levels });
  // Online seats carry a player id; the guest finds its own coin by it.
  cfg.teams.flat().forEach((p, i) => { if (p.pid !== undefined) s.champs[i].pid = p.pid; });
  const spectator = !!(net && net.role === 'guest' && Net.spectator);
  const me = spectator ? s.champs[0] : net && net.role === 'guest' ? (s.champs.find(c => c.pid !== undefined && c.pid === Net.pid) || s.champs.find(c => c.remote)) : (s.champs.find(c => c.human && !c.remote) || s.champs.find(c => c.human));
  G = { s, me, cfg, cam: { x: me.x, y: me.y }, acc: 0, t: 0, frames: 0, ms: 0, ended: false, intro: 2.6, outro: null, timeScale: 1, slowT: 0, stop: 0, shake: 0, punch: 0, flash: 0, hpq: [], net: net ? { role: net.role } : null };
  G.spectator = spectator;
  initWorld(G); initHud(G); initSound(G);
  Replay.reset(G);
  if (net) Net.attach();
  save.hints++; persist(); paused = false;
}
function finishMatch() {
  if (G.spectator) { const m = G.me; G.ended = true; showEnd({ spectator: true, won: G.s.over.winner === m.team, gain: 0, before: pts(m.champ), after: pts(m.champ), me: m, s: G.s, rankBefore: save.rank, rankAfter: save.rank, rankDelta: 0, marks: 0 }); return; }
  const s = G.s, me = G.me, won = s.over.winner === me.team, gain = Sim.masteryGain(me.stats, won), before = pts(me.champ);
  save.m[me.champ] = before + gain;
  // Rating: scored against the average skill of the bots on the other team.
  const rankBefore = save.rank === undefined ? 1000 : save.rank, foes = G.cfg.teams[1 - me.team].filter(p => !p.human && p.skill !== undefined);
  const avg = foes.length ? foes.reduce((a, p) => a + p.skill, 0) / foes.length : .5;
  const rankDelta = Sim.rankDelta && !s.custom && !G.cfg.custom ? Sim.rankDelta(rankBefore, won, me.stats, avg) : 0, // a Custom Match never moves rank
    rankAfter = Math.max(0, Math.round(rankBefore + rankDelta));
  const marks = Sim.marksEarned(won, me.stats);
  save.rank = rankAfter; save.marks = (save.marks || 0) + marks; persist();
  G.ended = true; showEnd({ won, gain, before, after: before + gain, me, s, rankBefore, rankAfter, rankDelta: rankAfter - rankBefore, marks });
}
// Called by effects code: pause the simulation for a beat, or run it in slow motion.
// Both are local-only moods, so an online match never uses them.
function hitStop(sec) { if (!calm && !G.net) G.stop = Math.max(G.stop, sec); }
function slowMo(sec, scale = .35) { if (!calm && !G.net) { G.slowT = Math.max(G.slowT, sec); G.timeScale = scale; } }

// Runs the simulation for dt seconds and plays its events. A hidden online host still drives this from a worker.
function stepMatch(dt) {
  const net = G.net, cap = net ? 8 : 4, hidden = net && document.hidden;
  G.acc += dt * G.timeScale; let n = 0;
  while (G.acc >= DT && n++ < cap) {
    if (net) Net.hostBefore();
    applyInput(); tickInput(G.me); Sim.step(G.s); G.acc -= DT;
    if (net) Net.hostAfter();
    Replay.tick(G.s);
    for (const e of G.s.ev) { if (!hidden) { fxEvent(e); soundEvent(e); } uiEvent(e); }
    G.s.ev.length = 0;
    // A surrender ends the match with the core still standing: the camera goes to the losing team's core.
    if (G.s.over) { const core = G.s.towers.find(t => t.sub === 'core' && !t.alive) || G.s.towers.find(t => t.sub === 'core' && t.team !== G.s.over.winner); G.outro = { t: 0, x: core.x, y: core.y }; outroStart(); break; }
  }
  if (n >= cap) G.acc = 0;
  accInput();
}

// ---------- 13.0 zero-delay own coin ----------
// The simulation ticks at 30 Hz. Rather than draw your coin between its last two ticks (one to two ticks late), the stick is
// read every frame and integrated over the current tick (mvAcc). Each tick walks with that tick's average input, and between
// ticks your coin is drawn at the tick's position plus the walk integrated so far (Sim.walkAhead). Drawing and simulation
// therefore agree exactly: the coin starts, stops and turns on the frame you move the stick, with nothing to correct
// afterwards. Host, offline and guest share this (the guest sends the same averaged input it predicts with). Anything the
// simulation does differently (a wall, a slow, a server correction) is absorbed into a short-lived offset (ownV.ex/ey).
const mvAcc = { x: 0, y: 0, t: 0 }, mvNow = { x: 0, y: 0 };
function sampleInput() { if (!G || !G.me) return; try { applyInput(); } catch (e) { } mvNow.x = G.me.mv.x; mvNow.y = G.me.mv.y; }
// Called once per tick, after applyInput: this tick walks with the average stick over its interval.
function tickInput(me) {
  const rest = Math.max(0, DT - mvAcc.t);
  me.mv.x = (mvAcc.x + mvNow.x * rest) / DT; me.mv.y = (mvAcc.y + mvNow.y * rest) / DT;
  if (Math.hypot(me.mv.x, me.mv.y) < .06) me.mv.x = me.mv.y = 0;
  mvAcc.x = mvAcc.y = mvAcc.t = 0;
}
// Called after a frame's ticks: carry the rest of the frame into the next tick's integral.
function accInput() { const t = Math.max(0, Math.min(DT, G.acc || 0)), d = t - mvAcc.t; if (d > 0) { mvAcc.x += mvNow.x * d; mvAcc.y += mvNow.y * d; } mvAcc.t = t; }
const ownV = { on: false, x: 0, y: 0, tx: 0, ty: 0, ex: 0, ey: 0 };
const OWN_SNAP = 90, OWN_EASE = 24;
function ownFree(me) {
  if (!me || !me.alive || G.spectator || G.replay || G.outro || G.intro > 0 || G.ended) return false;
  if (me.stunT > 0 || me.rootT > 0 || me.air || me.dash || me.pdash || me.chan || me.leap || me.cuts || me.polyT > 0) return false;
  return !(G.net && G.net.role === 'guest' && Net.ownDriven && Net.ownDriven());
}
function ownView(dt) {
  const me = G && G.me;
  if (!me || !ownFree(me)) { if (ownV.on) { ownV.on = false; ownV.ex = ownV.ey = 0; } return; }
  const w = Sim.walkAhead(G.s, me, 1, { x: mvAcc.x / DT, y: mvAcc.y / DT }), nx = w.x, ny = w.y;
  if (!ownV.on) { // taking over from the interpolated drawing: start from where it was drawn
    const f = Math.max(0, Math.min(1, (G.acc || 0) / DT)), px = me.px === undefined ? me.x : me.px, py = me.py === undefined ? me.y : me.py;
    ownV.ex = px + (me.x - px) * f - nx; ownV.ey = py + (me.y - py) * f - ny; if (Math.hypot(ownV.ex, ownV.ey) > OWN_SNAP) ownV.ex = ownV.ey = 0;
  } else {
    // More movement than walking could explain this frame is a correction: absorb the excess, or snap if it is a teleport.
    const dx = nx - ownV.tx, dy = ny - ownV.ty, d = Math.hypot(dx, dy), lim = (me.msBase || 400) * 1.8 * Math.max(dt, DT) + 2;
    if (d > OWN_SNAP) ownV.ex = ownV.ey = 0; else if (d > lim) { const k = 1 - lim / d; ownV.ex -= dx * k; ownV.ey -= dy * k; }
  }
  const k = Math.exp(-dt * OWN_EASE); ownV.ex *= k; ownV.ey *= k;
  if (Math.abs(ownV.ex) < .05 && Math.abs(ownV.ey) < .05) ownV.ex = ownV.ey = 0;
  ownV.tx = nx; ownV.ty = ny; ownV.x = nx + ownV.ex; ownV.y = ny + ownV.ey; ownV.on = true;
}
// Wrap world.js's posNow: the local player's coin is drawn from ownView while it is on. Everything that asks where your
// coin is this frame (camera, rings, aim, lock line) then agrees with what is drawn.
{ const base = posNow; const OWNP = { x: 0, y: 0 }; posNow = function (u, a) { if (ownV.on && G && u === G.me) { OWNP.x = ownV.x; OWNP.y = ownV.y; return OWNP; } return base(u, a); }; }

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000, dt = Math.min(.05, raw); last = now;
  animMenus(dt);
  if (!G) return;
  G.t += dt;
  if (!G.ended && !G.outro) sampleInput();
  if (G.replay) { Replay.frame(Math.min(.25, raw)); soundFrame(dt); if (!window.__skipRender) render(dt); return; }
  // Pause never holds back an online match. Before the intro ends, `paused` is the versus splash.
  const held = paused && !(G.net && !G.net.dead && G.intro <= 0);
  // A hidden tab has no rAF anyway; this keeps a hidden online host from double-stepping if one sneaks through.
  if (!held && !G.ended && !(G.net && document.hidden)) {
    if (G.intro > 0) { G.intro -= dt; introTick(dt); }
    else if (G.outro) { G.outro.t += dt; outroTick(dt); if (G.outro.t > 2.6) finishMatch(); }
    else if (G.net && G.net.role === 'guest') Net.guestFrame(Math.min(.25, raw), now);
    else {
      if (G.slowT > 0) { G.slowT -= dt; if (G.slowT <= 0) G.timeScale = 1; }
      if (G.stop > 0) G.stop -= dt;
      else stepMatch(G.net ? Math.min(.25, raw) : dt);
    }
  }
  soundFrame(held ? 0 : dt);
  ownView(held ? 0 : dt);
  if (!window.__skipRender) render(held ? 0 : dt); // the skip flag is for many-browser network tests on one machine
  // Auto graphics: each step down visibly changes the picture, so only sustained slowness in live play counts, not the map paint during the intro.
  if (save.gfx === 'auto' && !held && G.intro <= 0 && !G.ended) { const f = ++G.frames; G.ms += dt * 1000; if (f % 120 === 0) { const avg = G.ms / 120; G.ms = 0; G.slow = avg > 26 ? (G.slow || 0) + 1 : 0; if (G.slow >= 2 && quality > 0) { G.slow = 0; quality--; resize(); } } }
}
