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
// A finished match's ground is about 65 MB of canvas. Phones collect canvases late, so hand the memory back now
// rather than let two maps sit in memory together while the next one paints (iOS reloads a page that grows too far).
function releaseMatch(g) {
  if (!g || g.released) return; g.released = true;
  const gd = g.ground || { tiles: [] };
  const free = c => { if (c && c.width) { c.width = 0; c.height = 0; } };
  try { for (const t of gd.tiles || []) free(t.c); free(gd.mask); free(gd.refl); } catch (e) { }
  g.ground = null;
  try { Art.dropTurntables(); } catch (e) { }
}
function startMatch(cfg, net, restored) {
  if (G) releaseMatch(G);
  const seed = cfg.seed === undefined ? Date.now() & 0xffffff : cfg.seed;
  if (!net && !restored) cfg.seed = seed; // a solo match keeps its seed, so a resumed one is the same match
  const s = restored || Sim.createMatch({ seed, diff: cfg.diff, teams: cfg.teams, practice: cfg.practice, mode: cfg.mode, custom: cfg.custom, levels: cfg.levels });
  // Online seats carry a player id; the guest finds its own coin by it.
  cfg.teams.flat().forEach((p, i) => { if (p.pid !== undefined) s.champs[i].pid = p.pid; });
  const spectator = !!(net && net.role === 'guest' && Net.spectator);
  const me = restored && cfg.meId ? s.champs.find(c => c.id === cfg.meId) || s.champs[0] : spectator ? s.champs[0] : net && net.role === 'guest' ? (s.champs.find(c => c.pid !== undefined && c.pid === Net.pid) || s.champs.find(c => c.remote)) : (s.champs.find(c => c.human && !c.remote) || s.champs.find(c => c.human));
  G = { s, me, cfg, cam: { x: me.x, y: me.y }, acc: 0, t: 0, frames: 0, ms: 0, ended: false, intro: 2.6, outro: null, timeScale: 1, slowT: 0, stop: 0, shake: 0, punch: 0, flash: 0, hpq: [], net: net ? { role: net.role } : null };
  G.spectator = spectator;
  initWorld(G); initHud(G); initSound(G);
  Replay.reset(G);
  if (net) Net.attach();
  save.hints++; persist(); paused = false;
  Resume.began(restored);
}
function finishMatch() {
  Resume.clear();
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
    applyInput(); tickInput(G.me);
    try { Sim.step(G.s); Guard.simOk(); }
    catch (e) { G.acc = 0; G.s.ev.length = 0; Guard.report('sim', e); Guard.simFailed(); break; }
    G.acc -= DT;
    if (net) Net.hostAfter();
    try { Replay.tick(G.s); } catch (e) { Guard.report('replay', e); }
    // One bad effect or HUD line must not stop the rest of the tick's events, or leave them to play again next frame.
    for (const e of G.s.ev) { if (!hidden) { try { fxEvent(e); } catch (x) { Guard.report('fx ' + e.e, x); } try { soundEvent(e); } catch (x) { Guard.report('sound ' + e.e, x); } } try { uiEvent(e); } catch (x) { Guard.report('ui ' + e.e, x); } }
    G.s.ev.length = 0;
    // A surrender ends the match with the core still standing: the camera goes to the losing team's core.
    if (G.s.over) { const core = G.s.towers.find(t => t.sub === 'core' && !t.alive) || G.s.towers.find(t => t.sub === 'core' && t.team !== G.s.over.winner) || G.me; G.outro = { t: 0, x: core.x, y: core.y }; try { outroStart(); } catch (e) { Guard.report('outro', e); } Resume.clear(); break; }
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

// ---------- guard: one bad frame is logged and skipped, never fatal ----------
// Errors go to the console and to a short log kept in localStorage ('mintfall.errlog'), so a phone report can be read back.
const Guard = (() => {
  const LOG = 'mintfall.errlog', seen = new Map(); let simBad = 0, n = 0;
  function report(where, e) {
    const msg = String(e && e.message || e), key = where + '|' + msg;
    const k = (seen.get(key) || 0) + 1; seen.set(key, k); n++;
    if (k > 3) return; // the same failure every frame says nothing new
    try { console.error('[guard] ' + where, e); } catch (x) { }
    try {
      const list = JSON.parse(localStorage.getItem(LOG) || '[]');
      list.push({ at: new Date().toISOString(), where, msg: msg.slice(0, 200), stack: String(e && e.stack || '').slice(0, 600), t: G && G.s ? Math.round(G.s.t) : -1, mode: G && G.s ? G.s.mode : '' });
      localStorage.setItem(LOG, JSON.stringify(list.slice(-20)));
    } catch (x) { }
  }
  // The simulation failing tick after tick means its state is broken: go back to the last good save of this match.
  function simFailed() { if (++simBad >= 20) { simBad = 0; if (!Resume.rewind()) report('sim', new Error('sim keeps failing, no save to rewind to')); } }
  function simOk() { simBad = 0; }
  addEventListener('error', e => report('window', e.error || e.message));
  addEventListener('unhandledrejection', e => report('promise', e.reason));
  return { report, simFailed, simOk, get count() { return n; } };
})();

// ---------- resume: a solo match survives the page being reloaded ----------
// iOS can throw a backgrounded (or memory-pressed) page away and reload it, which used to drop the player on the title
// screen. A solo match is saved every few seconds and whenever the page is hidden; the menus offer to carry on.
const Resume = (() => {
  const KEY = 'mintfall.resume', EVERY = 6, MAX_AGE = 30 * 60 * 1000;
  let lastAt = -99, good = null;
  const eligible = () => G && !G.net && !G.replay && !G.spectator && !G.ended && !G.outro && G.s && !G.s.over && G.intro <= 0 && G.me;
  function write() {
    if (!eligible()) return false;
    try {
      const cfg = Object.assign({}, G.cfg, { meId: G.me.id }), data = Sim.saveMatch(G.s), json = JSON.stringify({ at: Date.now(), cfg, data });
      good = json; lastAt = G.s.t;
      localStorage.setItem(KEY, json); return true;
    } catch (e) { Guard.report('resume save', e); try { localStorage.removeItem(KEY); } catch (x) { } return false; }
  }
  function tick() { if (eligible() && G.s.t - lastAt >= EVERY) write(); }
  function clear() { good = null; lastAt = -99; try { localStorage.removeItem(KEY); } catch (e) { } }
  function began(restored) { lastAt = restored ? G.s.t : -99; good = null; }
  function pending() {
    try {
      const raw = localStorage.getItem(KEY); if (!raw) return null;
      const r = JSON.parse(raw);
      if (!r || !r.data || !r.cfg || Date.now() - r.at > MAX_AGE) { clear(); return null; }
      return r;
    } catch (e) { clear(); return null; }
  }
  function load(r) {
    const s = Sim.loadMatch(r.data);
    startMatch(r.cfg, null, s);
    G.intro = 0; // straight back into play, from the pause menu
    return true;
  }
  function rewind() {
    if (!good || !G || G.net) return false;
    try { const r = JSON.parse(good), s = Sim.loadMatch(r.data), keep = G; startMatch(r.cfg, null, s); G.intro = 0; G.t = keep.t; return true; } catch (e) { Guard.report('rewind', e); return false; }
  }
  // Hidden is the last moment a page is sure to run: save then.
  document.addEventListener('visibilitychange', () => { if (document.hidden) write(); });
  addEventListener('pagehide', () => write());
  return { tick, clear, began, pending, load, rewind, write };
})();

// Coming back from the background, the first frames hitch while the phone restores the page. They say nothing about how
// fast the game runs, so they must not step the graphics down (each step re-bakes every sprite at a new size).
document.addEventListener('visibilitychange', () => { if (!document.hidden) { last = performance.now(); if (G) { G.frames = 0; G.ms = 0; G.slow = 0; G.calmUntil = G.t + 4; } } });
addEventListener('pageshow', () => { last = performance.now(); if (G) { G.frames = 0; G.ms = 0; G.slow = 0; G.calmUntil = G.t + 4; } });

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  try { frameBody(now); }
  catch (e) {
    Guard.report('frame', e);
    // Whatever was half drawn, the next frame starts from a clean canvas state.
    try { for (let i = 0; i < 64; i++) ctx.restore(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter && (ctx.filter = 'none'); } catch (x) { }
  }
}
function frameBody(now) {
  const raw = (now - last) / 1000, dt = Math.min(.05, raw); last = now;
  try { animMenus(dt); } catch (e) { Guard.report('menus', e); }
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
  if (!G) return;
  Resume.tick();
  try { soundFrame(held ? 0 : dt); } catch (e) { Guard.report('soundFrame', e); }
  try { ownView(held ? 0 : dt); } catch (e) { Guard.report('ownView', e); ownV.on = false; }
  if (!window.__skipRender) render(held ? 0 : dt); // the skip flag is for many-browser network tests on one machine
  // Auto graphics: each step down visibly changes the picture, so only sustained slowness in live play counts, not the map paint during the intro.
  if (save.gfx === 'auto' && !held && G.intro <= 0 && !G.ended && !(G.t < (G.calmUntil || 0))) { const f = ++G.frames; G.ms += dt * 1000; if (f % 120 === 0) { const avg = G.ms / 120; G.ms = 0; G.slow = avg > 26 ? (G.slow || 0) + 1 : 0; if (G.slow >= 2 && quality > 0) { G.slow = 0; quality--; resize(); } } }
}
