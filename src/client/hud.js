// Deco kit shared by the HUD and the menus: palette, display type, the two-faced Flipside coin and the painted city backdrop.
const Deco = (() => {
  const INK = '#07080d', PAPER = '#e9edf4', MUTE = '#94a1b5', GOLD = '#e6d29a', GOLD2 = '#b89c5e', STEEL = '#8fa5c2', BLUE = '#6ea4ee', NAVY = '#10264c', NAVY2 = '#091630', GUN = '#1b1d23', GUN2 = '#0d0e12', CRIM = '#ec3a52', CRIM2 = '#8d1425', ACID = '#b8e23c';
  const TAU = Math.PI * 2, FALLBACK = '"Arial Narrow","Avenir Next Condensed","Roboto Condensed","sans-serif-condensed","DejaVu Sans Condensed",Impact,sans-serif', FACE = '"Big Shoulders Display"', cache = {};
  const disp = (s, w = 800) => cache[w * 1000 + s] || (cache[w * 1000 + s] = `${w} ${s}px ${FACE},${FALLBACK}`);
  const fontsReady = () => { try { return document.fonts.check(`700 40px ${FACE}`); } catch (e) { return true; } };
  // Display text with a thin cast shadow, so it stays legible over a busy map.
  function text(g, s, x, y, size, fill, shadow = 2) {
    g.font = disp(size);
    if (shadow) { g.fillStyle = 'rgba(4,5,9,.9)'; g.fillText(s, x + shadow * .5, y + shadow); }
    g.fillStyle = fill; g.fillText(s, x, y);
  }
  function glint(g, x, y, r, col = '#fff') { g.fillStyle = col; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, d = i % 2 ? r * .07 : (i % 4 ? r * .55 : r); g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * d, y + Math.sin(a) * d); } g.closePath(); g.fill(); }
  const poly = (g, pts) => { pts.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.closePath(); };

  // Hero emblem, the Ascendant: an upward lance between three rising blades.
  function ascendant(g) {
    poly(g, [[0, -1], [.135, -.2], [.06, .62], [0, .96], [-.06, .62], [-.135, -.2]]);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const y = .34 - i * .31, out = .98 - i * .2, lift = .44 + i * .03;
      poly(g, [[s * .19, y], [s * (.19 + out * .34), y - lift * .3], [s * out, y - lift], [s * (out - .1), y - lift + .25], [s * .19, y + .21]]);
    }
    for (const s of [-1, 1]) poly(g, [[s * .1, .5], [s * .5, .5], [s * .26, .74], [s * .1, .74]]);
  }
  // Villain emblem, the Predator's Eye: two hooked blades closing round a slit pupil.
  function predator(g) {
    for (const s of [-1, 1]) poly(g, [[s * .03, -1], [s * .62, -.66], [s * .95, -.02], [s * .58, .6], [s * .05, 1], [s * .3, .42], [s * .55, -.02], [s * .36, -.44], [s * .03, -.68]]);
  }
  function pupil(g) { poly(g, [[0, -.5], [.15, -.02], [0, .62], [-.15, -.02]]); }

  function paintFace(g, side) {
    const hero = !side, rim = g.createLinearGradient(-.8, -.8, .8, .8);
    rim.addColorStop(0, hero ? '#dfe5ee' : '#5f636e'); rim.addColorStop(.48, hero ? '#8ea0b8' : '#34363e'); rim.addColorStop(.52, hero ? '#59698a' : '#1f2026'); rim.addColorStop(1, hero ? '#33415e' : '#101116');
    g.fillStyle = rim; g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill();
    g.fillStyle = 'rgba(5,7,12,.5)'; for (let i = 0; i < 72; i++) { g.save(); g.rotate(i / 72 * TAU); g.fillRect(-.009, -.985, .018, .05); g.restore(); }
    g.save(); g.beginPath(); g.arc(0, 0, .885, 0, TAU); g.clip();
    g.fillStyle = hero ? NAVY2 : '#08090c'; g.fillRect(-1, -1, 2, 2);
    g.fillStyle = hero ? '#17345f' : '#212329'; g.beginPath(); poly(g, [[-1, -1], [.62, -1], [-.62, 1], [-1, 1]]); g.fill();
    g.restore();
    g.strokeStyle = hero ? GOLD : CRIM; g.lineWidth = .016; g.beginPath(); g.arc(0, 0, .885, 0, TAU); g.stroke();
    g.lineWidth = .007; g.globalAlpha = .55; g.beginPath(); g.arc(0, 0, .845, 0, TAU); g.stroke(); g.globalAlpha = 1;
    // Lit from the upper left: the emblem splits into a bright half and a shadow half.
    g.save(); g.scale(.66, .66);
    const shape = hero ? ascendant : predator;
    g.beginPath(); shape(g); g.fillStyle = hero ? '#f4e8c4' : '#f0485e'; g.fill();
    g.save(); g.beginPath(); g.rect(0, -1.2, 1.4, 2.4); g.clip(); g.beginPath(); shape(g); g.fillStyle = hero ? GOLD2 : CRIM2; g.fill(); g.restore();
    if (!hero) { g.beginPath(); pupil(g); g.fillStyle = ACID; g.fill(); g.save(); g.beginPath(); g.rect(0, -1, 1, 2); g.clip(); g.beginPath(); pupil(g); g.fillStyle = '#6f8f1c'; g.fill(); g.restore(); }
    g.restore();
  }
  // side 0 = hero, 1 = villain. Sprites match the {c, S, R} shape used elsewhere.
  const faces = new Map();
  function face(side, R = 230) {
    const key = side * 10000 + R; if (faces.has(key)) return faces.get(key);
    const P = Math.ceil(R * .03) + 1, S = (R + P) * 2, c = Art.cv(S, S), g = c.getContext('2d');
    g.translate(S / 2, S / 2); g.scale(R, R); paintFace(g, side);
    const spr = { c, S, R }; faces.set(key, spr); return spr;
  }
  const EDGE = [['#c2a766', '#6e5c34'], ['#8d1425', '#2a2c33']];
  // Draw the coin flipping about its horizontal axis. Returns which face is showing.
  function flip(g, cx, cy, R, ang, faceR = 230, tilt = -.12) {
    const c = Math.cos(ang), ab = Math.abs(c), side = c >= 0 ? 0 : 1, T = R * .11 * Math.sqrt(1 - c * c), edge = EDGE[side], dir = Math.sin(ang) >= 0 ? -1 : 1;
    g.save(); g.translate(cx, cy); g.rotate(tilt);
    if (T > .5) { const n = Math.min(10, Math.ceil(T / 2)); for (let i = n; i > 0; i--) { g.fillStyle = i % 2 ? edge[0] : edge[1]; g.beginPath(); g.ellipse(0, dir * T * i / n, R, Math.max(R * ab, .5), 0, 0, TAU); g.fill(); } }
    const spr = face(side, faceR), h = spr.S * R / spr.R;
    if (ab > .015) { g.scale(1, ab); g.drawImage(spr.c, -h / 2, -h / 2, h, h); }
    else { g.fillStyle = edge[0]; g.fillRect(-R, -1.5, 2 * R, 3); }
    g.restore();
    return side;
  }

  // A deco skyline at dusk, painted once per side. Everything else in the menus sits on it.
  const skies = [];
  function backdrop(side) {
    if (skies[side]) return skies[side];
    const w = 1100, h = 520, c = Art.cv(w, h), g = c.getContext('2d'), rnd = Art.seeded(side ? 7741 : 3307), hero = !side;
    const sky = g.createLinearGradient(0, 0, 0, h);
    if (hero) { sky.addColorStop(0, '#04070e'); sky.addColorStop(.42, '#0a1a38'); sky.addColorStop(.72, '#1c3a68'); sky.addColorStop(.9, '#6b6f70'); sky.addColorStop(1, '#d9bf85'); }
    else { sky.addColorStop(0, '#040405'); sky.addColorStop(.46, '#121216'); sky.addColorStop(.74, '#37101b'); sky.addColorStop(.92, '#8a1526'); sky.addColorStop(1, '#d9273f'); }
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    // searchlights raking the sky
    g.globalCompositeOperation = 'lighter';
    for (const [bx, lean, wide, a] of [[.1, .5, 80, .2], [.42, -.34, 120, .26], [.74, .3, 90, .16], [.96, -.5, 70, .14]]) {
      const x0 = bx * w, y0 = h * .9, x1 = x0 + lean * h, grad = g.createLinearGradient(x0, y0, x1, 0);
      const col = hero ? '230,214,170' : '236,58,82';
      grad.addColorStop(0, `rgba(${col},${a})`); grad.addColorStop(.75, `rgba(${col},${a * .28})`); grad.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = grad; g.beginPath(); g.moveTo(x0 - 3, y0); g.lineTo(x1 - wide, 0); g.lineTo(x1 + wide, 0); g.lineTo(x0 + 3, y0); g.closePath(); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    const tower = (x, tw, ht, base, col, lit) => {
      g.fillStyle = col;
      g.fillRect(x, base - ht, tw, ht + 2);
      const st = 1 + Math.floor(rnd() * 3); let top = base - ht, ww = tw;
      for (let i = 0; i < st; i++) { const nw = ww * (.62 + rnd() * .14), nh = 12 + rnd() * 28; g.fillRect(x + (tw - nw) / 2, top - nh, nw, nh + 2); top -= nh; ww = nw; }
      if (rnd() < .55) { const sh = 26 + rnd() * 54; g.beginPath(); g.moveTo(x + tw / 2 - ww * .16, top + 1); g.lineTo(x + tw / 2, top - sh); g.lineTo(x + tw / 2 + ww * .16, top + 1); g.closePath(); g.fill(); }
      if (lit) for (let wy = base - ht + 8; wy < h - 6; wy += 10) for (let wx = x + 5; wx < x + tw - 6; wx += 8) {
        if (rnd() < .86) continue;
        g.fillStyle = hero ? `rgba(230,210,154,${.35 + rnd() * .5})` : (rnd() < .18 ? 'rgba(184,226,60,.6)' : `rgba(236,58,82,${.35 + rnd() * .45})`);
        g.fillRect(wx, wy, 3, 5);
      }
    };
    for (let x = -30; x < w;) { const tw = 40 + rnd() * 62; tower(x, tw, h * (.14 + rnd() * .34), h * .96, hero ? '#0e2142' : '#1a1116', false); x += tw * (.7 + rnd() * .5); }
    for (let x = -20; x < w;) { const tw = 46 + rnd() * 78; tower(x, tw, h * (.05 + rnd() * .22), h, hero ? '#060b18' : '#07070a', true); x += tw + 2 + rnd() * 16; }
    const vig = g.createRadialGradient(w / 2, h * .55, h * .35, w / 2, h * .55, w * .72);
    vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,.72)');
    g.fillStyle = vig; g.fillRect(0, 0, w, h);
    return skies[side] = c;
  }
  // Draw the backdrop so it covers a w by h area.
  function cover(g, side, w, h, x = 0, y = 0) { const c = backdrop(side), k = Math.max(w / c.width, h / c.height), dw = c.width * k, dh = c.height * k; g.drawImage(c, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); }

  // A soft cone of light, origin at the bottom centre.
  const beams = {};
  function beam(col) {
    if (beams[col]) return beams[col];
    const c = Art.cv(240, 600), g = c.getContext('2d'), gr = g.createLinearGradient(0, 600, 0, 0);
    gr.addColorStop(0, `rgba(${col},.5)`); gr.addColorStop(.7, `rgba(${col},.12)`); gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr; g.beginPath(); g.moveTo(112, 600); g.lineTo(0, 0); g.lineTo(240, 0); g.lineTo(128, 600); g.closePath(); g.fill();
    return beams[col] = c;
  }
  // A long horizontal lens streak.
  const streaks = {};
  function streak(col) {
    if (streaks[col]) return streaks[col];
    const c = Art.cv(600, 40), g = c.getContext('2d'), gr = g.createRadialGradient(300, 20, 0, 300, 20, 300);
    gr.addColorStop(0, `rgba(${col},1)`); gr.addColorStop(.3, `rgba(${col},.5)`); gr.addColorStop(1, `rgba(${col},0)`);
    g.setTransform(1, 0, 0, .066, 0, 18.7); g.fillStyle = gr; g.fillRect(0, -300, 600, 640);
    return streaks[col] = c;
  }
  return { INK, PAPER, MUTE, GOLD, GOLD2, STEEL, BLUE, NAVY, NAVY2, GUN, GUN2, CRIM, CRIM2, ACID, TAU, disp, text, glint, face, flip, backdrop, cover, beam, streak, fontsReady };
})();

// Match HUD, drawn on the canvas, plus the upgrade panel and pause overlay.
const Hud = {
  ui: {
    atk: { x: 0, y: 0, r: 46 },
    ab: [{ x: 0, y: 0, r: 33 }, { x: 0, y: 0, r: 33 }, { x: 0, y: 0, r: 37 }],
    cancel: { x: 0, y: 70, r: 34 }, pause: { x: 0, y: 20, r: 14 },
    forge: { x: 63, y: 76, r: 17 }, recall: { x: 106, y: 76, r: 17 },
    map: { x: 0, y: 6, w: 140, h: 84 },
    stripX: 400, miniR: 8, miniGap: 20, midHalf: 40, hpW: 104, compact: false,
  },
};

const { hud, initHud, hudDraw, uiEvent } = (() => {
  const U = Hud.ui, HPI = Math.PI / 2, UIFONT = '"Barlow Semi Condensed","Arial Narrow","Roboto Condensed","DejaVu Sans Condensed",sans-serif';
  const { INK, PAPER, MUTE, GOLD, STEEL, BLUE, NAVY, GUN, CRIM, ACID } = Deco;
  const WHITE = '#ffffff', GLASS = 'rgba(8,10,16,.86)', HAIR = 'rgba(148,167,194,.34)', WELL = 'rgba(148,167,194,.2)', PX = 65, PY = 27, PR = 21, HP_X = 92, GOLD_X = 101, GOLD_Y = 44;
  const TRACKS = [['edge', 'Edge', 'More damage from everything'], ['guard', 'Guard', 'More health and armour'], ['haste', 'Haste', 'Shorter cooldowns, faster feet']];
  const fcache = {};
  const fw = (w, s) => fcache[w * 1000 + s] || (fcache[w * 1000 + s] = `${w} ${s}px ${UIFONT}`);
  const fd = s => Deco.disp(s, 700);
  const NUM = Array.from({ length: 240 }, (_, i) => String(i));
  const TENTH = Array.from({ length: 31 }, (_, i) => (i / 10).toFixed(1));
  const num = n => n >= 0 && n < 240 ? NUM[n] : String(n);
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const outBack = t => { const k = 1.9; t -= 1; return 1 + (k + 1) * t * t * t + k * t * t; };
  const SIDE_ACC = [GOLD, CRIM], TEAM_DOT = [BLUE, CRIM];

  let H = null;

  // ---------- shared drawing ----------
  function blit(spr, x, y, r) { const h = spr.S * r / spr.R; ctx.drawImage(spr.c, x - h / 2, y - h / 2, h, h); }
  function disc(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
  function arcLine(x, y, r, a, b, col, w) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(x, y, r, a, b); ctx.stroke(); }
  function label(s, x, y, col, w = 2.4) { ctx.lineWidth = w; ctx.strokeStyle = 'rgba(5,6,10,.85)'; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); ctx.fillStyle = col; ctx.fillText(s, x, y); }
  function offset(dx, dy) { ctx.setTransform(dpr, 0, 0, dpr, dx * dpr, dy * dpr); }

  // Cut-corner glass panels, cached by size and colour.
  const panels = new Map();
  function panel(w, h, cut = 5, fill = GLASS, line = HAIR) {
    w = Math.ceil(w); h = Math.ceil(h);
    const id = `${w}|${h}|${cut}|${fill}|${line}`; let c = panels.get(id);
    if (c) return c;
    c = Art.cv(w * 2, h * 2); const g = c.getContext('2d'); g.scale(2, 2);
    g.beginPath(); g.moveTo(cut + .5, .5); g.lineTo(w - .5, .5); g.lineTo(w - .5, h - cut - .5); g.lineTo(w - cut - .5, h - .5); g.lineTo(.5, h - .5); g.lineTo(.5, cut + .5); g.closePath();
    g.fillStyle = fill; g.fill();
    if (line) { g.strokeStyle = line; g.lineWidth = 1; g.stroke(); }
    panels.set(id, c); return c;
  }
  const put = (c, x, y) => ctx.drawImage(c, x, y, c.width / 2, c.height / 2);
  const diamond = (x, y, r) => { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); };

  let edgeC = null;
  function redEdge() {
    if (edgeC) return edgeC;
    const c = Art.cv(160, 80), g = c.getContext('2d'), gr = g.createRadialGradient(80, 40, 26, 80, 40, 88);
    gr.addColorStop(0, 'rgba(217,39,63,0)'); gr.addColorStop(.62, 'rgba(217,39,63,.1)'); gr.addColorStop(1, 'rgba(160,20,40,.9)');
    g.fillStyle = gr; g.fillRect(0, 0, 160, 80); return edgeC = c;
  }

  // ---------- layout ----------
  function hud() {
    U.compact = VW < 760 || VH < 350;
    stage.classList.toggle('sm', U.compact);
    const bx = VW - 92, by = VH - 80, off = [[-104, 18], [-78, -78], [4, -112]];
    U.atk.x = bx; U.atk.y = by;
    off.forEach((o, i) => { U.ab[i].x = bx + o[0]; U.ab[i].y = by + o[1]; });
    U.cancel.x = VW - 250; U.cancel.y = U.compact ? 118 : 70;
    const M = U.map; M.w = U.compact ? 88 : 112; M.h = Math.round(M.w * Sim.H / Sim.W); M.x = VW - 44 - M.w; M.y = 6;
    U.pause.x = M.x - 21; U.pause.y = 20;
    U.stripX = VW / 2; U.miniR = U.compact ? 7 : 8; U.miniGap = U.compact ? 17 : 20; U.midHalf = U.compact ? 33 : 40;
    U.hpW = U.compact ? 84 : 104;
    if (H) H.mapC = H.fogC = null;
  }

  // ---------- match setup ----------
  function initHud(g) {
    const me = g.me, s = g.s;
    Ctl.reset();
    $('forge').classList.add('hide'); $('forge').classList.remove('dead');
    const byId = new Map(), mini = new Map();
    for (const c of s.champs) { byId.set(c.id, c); mini.set(c.id, Art.champCoin(c.champ, c.team, c.tier, 26)); }
    for (const t of s.towers) byId.set(t.id, t);
    H = {
      t: 0, enter: 0, byId, mini, hope: s.hope, hopeFlash: 0, announced: false, hopeAng: s.hope >= 50 ? 0 : Math.PI, hopeSide: s.hope >= 50 ? 0 : 1,
      portrait: spriteOf(me), fogC: null, fogT: 0, wasDead: false, forgeAuto: false,
      abOn: me.kit.map((_, i) => Art.abilityCoin(me.champ, i, true, 40, me.team)), abOff: me.kit.map((_, i) => Art.abilityCoin(me.champ, i, false, 40, me.team)),
      rng: me.kit.map(a => a.range ? `Range ${a.range}` : 'Self'),
      hpTrail: me.hp, hpHold: 0, hurt: 0, hpPrev: me.hp, goldShow: me.gold, goldStr: String(Math.floor(me.gold)), goldGain: 0, goldGainT: 0, goldGainStr: '', lvlFx: 0, first: save.hints < 1, guide: save.hints < 2, netStr: '', netKey: -2,
      prev: [0, 0, 0], cdMax: [1, 1, 1], recPrev: [0, 0, 0], recMax: [1, 1, 1], pop: [0, 0, 0], press: [0, 0, 0], deny: [0, 0, 0], flash: [0, 0, 0], spark: [.4, 1.2, 2.0],
      atkPress: 0, atkMax: 1, atkPrev: 0, cancelIn: 0,
      feed: [], banner: null, queue: [], pings: [], pingAt: {}, towerAt: -99, mapC: null, kills: [s.kills[0], s.kills[1]], killBump: [0, 0], lvl: me.lvl, lvlBump: 0, sq: { forge: 0, recall: 0, pause: 0 },
      clockSec: -1, clockStr: '0:00', hoardKey: -2, hoardStr: '', frame: 0, forgeKey: -1,
      hint: save.hints < 2 ? { i: 0, t: 0, n: 0 } : null,
    };
    g.goldBump = 0; g.goldAnchor = { x: GOLD_X, y: GOLD_Y };
    hud();
  }

  // ---------- banners: a thin title card near the top, clear of the action ----------
  function banner(s, o = {}) {
    if (!H) return;
    const b = { s: s.toUpperCase(), sub: o.sub || '', pri: o.pri || 1, spr: o.spr || null, team: o.team === 0 || o.team === 1 ? o.team : -1, t: 0, max: o.dur || 1.7, w: 0, hot: !!o.hot, at: H.t };
    if (H.banner && H.banner.s === b.s) { H.banner.t = Math.min(H.banner.t, .3); return; }
    if (!H.banner || b.pri > H.banner.pri) { H.banner = b; return; }
    // One on screen and at most one waiting; only objectives are worth the wait.
    if (b.pri >= 3 && (!H.queue[0] || b.pri >= H.queue[0].pri)) H.queue[0] = b;
  }

  function drawBanner(dt) {
    let b = H.banner;
    if (!b) return;
    b.t += dt;
    if (b.t >= b.max) { const n = H.queue.shift(); H.banner = n && H.t - n.at < 4 ? n : null; b = H.banner; if (!b) return; }
    const big = b.pri >= 3, size = U.compact ? (big ? 19 : 16) : (big ? 22 : 18), h = (big ? 28 : 24) + (b.sub ? 13 : 0);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (!b.w) { ctx.font = fd(size); b.w = ctx.measureText(b.s).width + (b.spr ? 54 : 34); if (b.sub) { ctx.font = fw(500, 12); b.w = Math.max(b.w, ctx.measureText(b.sub).width + 34); } }
    const IN = .16, inT = clamp01(b.t / IN), outT = clamp01((b.t - (b.max - .2)) / .2), open = calm ? 1 : 1 - (1 - inT) * (1 - inT);
    const W = Math.min(b.w, VW - 300), cy = Ctl.aim ? (U.compact ? VH - 22 : Math.min(128, VH * .36)) : (U.compact ? 58 : 62), cxB = Ctl.aim && U.compact ? VW / 2 - 44 : VW / 2, lift = outT * outT * -8;
    const hw = W / 2, hh = h / 2, acc = b.team === 0 ? GOLD : b.team === 1 ? CRIM : b.hot ? CRIM : PAPER, y0 = cy + lift;
    ctx.globalAlpha = Math.min(1, inT * 2) * (1 - outT);
    ctx.save(); ctx.beginPath(); ctx.rect(cxB - (hw + 12) * open, y0 - hh - 2, (hw + 12) * 2 * open, h + 4); ctx.clip();
    ctx.fillStyle = 'rgba(7,9,14,.9)'; ctx.beginPath(); ctx.moveTo(cxB - hw - 9, y0 - hh); ctx.lineTo(cxB + hw + 3, y0 - hh); ctx.lineTo(cxB + hw + 9, y0 + hh); ctx.lineTo(cxB - hw - 3, y0 + hh); ctx.closePath(); ctx.fill();
    ctx.fillStyle = acc; ctx.fillRect(cxB - hw - 9, y0 + hh - 1, W + 18, 1); ctx.fillRect(cxB - hw - 9, y0 - hh, 26, 1);
    const tx = cxB + (b.spr ? 12 : 0), ty = y0 + (b.sub ? -6.5 : 1);
    if (b.spr) blit(b.spr, cxB - hw + 15, y0, Math.min(13, hh - 2));
    ctx.font = fd(size); ctx.fillStyle = acc; ctx.fillText(b.s, tx, ty);
    if (b.sub) { ctx.font = fw(500, 12); ctx.fillStyle = MUTE; ctx.fillText(b.sub, tx, ty + 16); }
    ctx.restore();
    ctx.globalAlpha = 1; offset(0, 0);
  }

  // ---------- sim events ----------
  function uiEvent(e) {
    if (!H || !G) return;
    const me = G.me, k = e.e;
    if (k === 'hit') {
      const u = H.byId.get(e.u); if (!u || u.team !== me.team) return;
      const now = G.s.t;
      if (u.kind === 'tower') { if (now - H.towerAt > 25) { H.towerAt = now; banner('Tower under attack', { pri: 3, hot: true, dur: 1.8 }); } }
      else if (u !== me && now - (H.pingAt[u.id] || -9) > 2.5) { H.pingAt[u.id] = now; if (H.pings.length < 6) H.pings.push({ x: u.x, y: u.y, t: 0 }); }
    } else if (k === 'gold') {
      if (e.u === me.id) {
        G.goldBump = Math.max(G.goldBump, .55);
        if (e.a >= 1) { H.goldGain = H.goldGainT > 0 ? H.goldGain + e.a : e.a; H.goldGainT = 1; H.goldGainStr = '+' + Math.round(H.goldGain); }
      }
    } else if (k === 'feed') {
      const a = H.byId.get(e.a) || null, b = H.byId.get(e.b) || null, mine = e.a === me.id || e.b === me.id;
      H.feed.unshift({ aS: a && a.kind === 'champ' ? H.mini.get(a.id) : null, bS: b ? H.mini.get(b.id) : null, t: mine ? 3.2 : 1.3, aT: a ? a.team : -1, age: 0, mine });
      if (H.feed.length > 2) H.feed.length = 2;
      if (e.a === me.id) {
        const spr = H.mini.get(me.id), team = me.team;
        if (e.first) banner('First takedown', { pri: 6, spr, team, dur: 1.9 });
        else if (e.multi >= 2) banner(e.multi === 2 ? 'Double takedown' : e.multi === 3 ? 'Triple takedown' : 'Four takedowns', { pri: 4 + Math.min(4, e.multi), spr, team, dur: 2 });
        else banner('Takedown', { pri: 2, spr, team, dur: 1.2 });
      }
    } else if (k === 'level') {
      if (e.u === me.id) { H.lvlBump = 1; H.lvlFx = 1; if (me.lvl === 3) banner('Ultimate unlocked', { pri: 4, dur: 1.9 }); }
    } else if (k === 'tower') {
      banner(e.team === me.team ? 'We lost a tower' : 'Enemy tower down', { pri: 3, team: e.team === me.team ? -1 : me.team, hot: e.team === me.team, dur: 2 });
    } else if (k === 'bossup') banner('The Colossus is up', { pri: 4, sub: 'At the centre of the map', dur: 2.2 });
    else if (k === 'boss') banner(`${Sim.TEAM_NAMES[e.team]} took the Colossus`, { pri: 5, sub: 'Stronger hits for 90 seconds', team: e.team, dur: 2.4 });
    else if (k === 'forge') { if (e.u === me.id) forgeSync(true); }
    else if (k === 'civ') H.hopeFlash = 1;
    else if (k === 'hope') { if (e.on) banner(e.team === 0 ? 'The people rally' : 'The city cowers', { pri: 3, sub: `${Sim.TEAM_NAMES[e.team]} hit harder`, team: e.team, dur: 2 }); }
  }

  // ---------- player frame ----------
  function drawFrame(dt, me) {
    const hpw = U.hpW, f = clamp01(me.hp / me.maxHp), side = me.team;
    if (me.hp < H.hpPrev - .5) H.hurt = 1;
    H.hpPrev = me.hp; H.hurt = Math.max(0, H.hurt - dt * 4.5); H.lvlBump = Math.max(0, H.lvlBump - dt * 3.2); H.lvlFx = Math.max(0, H.lvlFx - dt * 1.5);
    const jolt = calm ? 0 : Math.sin(H.t * 60) * H.hurt * 2;
    if (jolt) offset(jolt, 0);
    // Level-up: a thin ring opening out from the portrait.
    if (H.lvlFx > 0 && !calm) { const q = 1 - H.lvlFx; ctx.globalAlpha = Math.min(1, H.lvlFx * 2.4); arcLine(PX, PY, PR + 3 + outBack(Math.min(1, q * 2.4)) * 16, 0, TAU, SIDE_ACC[side], 1.5); ctx.globalAlpha = 1; }
    blit(H.portrait, PX, PY, PR);
    const lb = 1 + (calm ? 0 : H.lvlBump) * .65, bx = PX + PR * .78, by = PY + PR * .78;
    diamond(bx, by, 10 * lb); ctx.fillStyle = INK; ctx.fill(); ctx.strokeStyle = SIDE_ACC[side]; ctx.lineWidth = 1; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = fw(600, Math.round(11.5 * lb)); ctx.fillStyle = PAPER; ctx.fillText(num(me.lvl), bx, by + .5);
    if (me.hp < H.hpTrail) { H.hpHold += dt; if (H.hpHold > .32) H.hpTrail = Math.max(me.hp, H.hpTrail - (me.maxHp * .9 + H.hpTrail - me.hp) * dt); } else { H.hpTrail = me.hp; H.hpHold = 0; }
    const x = HP_X, y = 11, h = 12, tr = clamp01(H.hpTrail / me.maxHp), low = f < .3;
    ctx.fillStyle = GLASS; ctx.fillRect(x - 1, y - 1, hpw + 2, h + 7);
    ctx.fillStyle = WELL; ctx.fillRect(x, y, hpw, h);
    if (tr > f) { ctx.fillStyle = PAPER; ctx.fillRect(x + hpw * f, y, hpw * (tr - f), h); }
    ctx.fillStyle = low ? CRIM : '#3fbf78'; ctx.fillRect(x, y, hpw * f, h);
    ctx.fillStyle = low ? '#ff7f90' : '#86e5ae'; ctx.fillRect(x, y, hpw * f, 2);
    ctx.font = fw(600, 11.5); ctx.textAlign = 'center';
    label(num(Math.ceil(me.hp)), x + hpw / 2, y + h / 2 + .5, WHITE, 2.2);
    const need = Sim.xpNeed(me.lvl), xf = me.lvl >= 10 ? 1 : clamp01(me.xp / need);
    ctx.fillStyle = WELL; ctx.fillRect(x, y + h + 2, hpw, 3);
    ctx.fillStyle = SIDE_ACC[side]; ctx.fillRect(x, y + h + 2, hpw * xf, 3);
    if (jolt) offset(0, 0);
    // gold rolls toward the real value
    G.goldBump = Math.max(0, (G.goldBump || 0) - dt * 4.5);
    const diff = me.gold - H.goldShow;
    H.goldShow = Math.abs(diff) < 1 ? me.gold : H.goldShow + diff * Math.min(1, dt * 9);
    const shown = Math.floor(H.goldShow); if (shown !== H.gv) { H.gv = shown; H.goldStr = String(shown); }
    const gb = calm ? 0 : G.goldBump, bump = 1 + gb * .3;
    G.goldAnchor.x = GOLD_X; G.goldAnchor.y = GOLD_Y;
    ctx.font = fw(600, Math.round(14 * bump * 2) / 2); ctx.textAlign = 'left';
    const gw = ctx.measureText(H.goldStr).width;
    put(panel(26 + Math.ceil(gw), 18, 4, GLASS, null), GOLD_X - 11, GOLD_Y - 9);
    diamond(GOLD_X, GOLD_Y, 5 * bump); ctx.fillStyle = GOLD; ctx.fill();
    ctx.fillStyle = gb > .3 ? WHITE : GOLD; ctx.fillText(H.goldStr, GOLD_X + 10, GOLD_Y + .5);
    if (H.goldGainT > 0) {
      H.goldGainT = Math.max(0, H.goldGainT - dt * 1.4);
      const q = 1 - H.goldGainT; ctx.font = fw(600, 12.5); ctx.globalAlpha = Math.min(1, H.goldGainT * 3);
      label(H.goldGainStr, GOLD_X + 20 + gw, GOLD_Y - (calm ? 0 : q * 7) + .5, GOLD); ctx.globalAlpha = 1;
    }
    // Upgrade only draws the eye when something can be bought.
    let afford = false;
    for (let i = 0; i < 3; i++) { const n = me.up[TRACKS[i][0]]; if (n < 3 && me.gold >= Sim.FORGE_COST[n]) afford = true; }
    const open = forgeOpen(), hot = afford && !open;
    smallCoin(U.forge, hot || open, 'Upgrade', drawUpgrade, H.sq.forge, dt, 'forge');
    if (hot) {
      if (!calm) { const p = (Math.sin(H.t * 3.6) + 1) / 2; arcLine(U.forge.x, U.forge.y, U.forge.r + 2 + p * 3, 0, TAU, SIDE_ACC[side], 1.2); }
      diamond(U.forge.x + 12, U.forge.y - 12, 4.5); ctx.fillStyle = SIDE_ACC[side]; ctx.fill();
    }
    const chan = me.chan && me.chan.recall ? me.chan : null;
    smallCoin(U.recall, !!chan, 'Recall', drawGate, H.sq.recall, dt, 'recall');
    if (chan) arcLine(U.recall.x, U.recall.y, U.recall.r + 2, -HPI, -HPI + TAU * (1 - chan.t / chan.total), SIDE_ACC[side], 2.5);
  }

  function smallCoin(B, hot, name, icon, sq, dt, key) {
    H.sq[key] = Math.max(0, H.sq[key] - dt * 7);
    const s = 1 - sq * .16, r = B.r * s;
    // Quiet until it matters.
    const acc = SIDE_ACC[G.me.team];
    disc(B.x, B.y, r); ctx.fillStyle = GLASS; ctx.fill();
    ctx.strokeStyle = hot ? acc : HAIR; ctx.lineWidth = 1.2; ctx.stroke();
    icon(B.x, B.y, hot ? acc : PAPER);
    if (H.first) { ctx.font = fw(500, 10); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; label(name, B.x, B.y + B.r + 7.5, WHITE); }
  }
  function drawUpgrade(x, y, col) {
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
    ctx.beginPath(); ctx.moveTo(x - 7, y + 1); ctx.lineTo(x, y - 6); ctx.lineTo(x + 7, y + 1); ctx.moveTo(x - 7, y + 7); ctx.lineTo(x, y); ctx.lineTo(x + 7, y + 7); ctx.stroke();
  }
  function drawGate(x, y, col) {
    ctx.strokeStyle = col; ctx.lineWidth = 1.7; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(x - 7, y + 8); ctx.lineTo(x - 7, y - 1); ctx.arc(x, y - 1, 7, Math.PI, 0); ctx.lineTo(x + 7, y + 8); ctx.moveTo(x - 10, y + 8); ctx.lineTo(x + 10, y + 8); ctx.stroke();
    disc(x, y + 1, 2.4); ctx.fillStyle = col; ctx.fill();
  }

  // ---------- top strip ----------
  let stripC = null, stripK = '';
  function bakeStrip(w, h, mid) {
    const c = Art.cv((w + 3) * 2, (h + 3) * 2), g = c.getContext('2d'); g.scale(2, 2);
    const m = w / 2;
    g.fillStyle = 'rgba(13,32,68,.86)'; g.beginPath(); g.moveTo(6, 1); g.lineTo(m, 1); g.lineTo(m, h - 1); g.lineTo(1, h - 1); g.lineTo(1, 6); g.closePath(); g.fill();
    g.fillStyle = 'rgba(24,25,31,.9)'; g.beginPath(); g.moveTo(m, 1); g.lineTo(w - 1, 1); g.lineTo(w - 1, h - 6); g.lineTo(w - 6, h - 1); g.lineTo(m, h - 1); g.closePath(); g.fill();
    g.fillStyle = '#05060a'; g.beginPath(); g.moveTo(m - mid + 6, 0); g.lineTo(m + mid + 6, 0); g.lineTo(m + mid - 6, h); g.lineTo(m - mid - 6, h); g.closePath(); g.fill();
    return c;
  }
  function drawStrip(dt, s, me) {
    const cx = U.stripX, r = U.miniR, gap = U.miniGap, mid = U.midHalf, half = mid + gap * 4 + 4, Y = 3, h = 21, cy = Y + h / 2;
    const key = `${half}|${mid}`; if (key !== stripK) { stripK = key; stripC = bakeStrip(half * 2, h, mid); }
    ctx.drawImage(stripC, cx - half, Y, stripC.width / 2, stripC.height / 2);
    for (const t of [0, 1]) { if (s.kills[t] !== H.kills[t]) { H.kills[t] = s.kills[t]; H.killBump[t] = 1; } H.killBump[t] = Math.max(0, H.killBump[t] - dt * 3.6); }
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    const big = U.compact ? 15 : 17, sc0 = calm ? 1 : 1 + H.killBump[0] * .35, sc1 = calm ? 1 : 1 + H.killBump[1] * .35, kx = mid - (U.compact ? 9 : 11);
    ctx.font = fd(Math.round(big * sc0)); ctx.fillStyle = GOLD; ctx.fillText(num(s.kills[0]), cx - kx, cy + .5);
    ctx.font = fd(Math.round(big * sc1)); ctx.fillStyle = CRIM; ctx.fillText(num(s.kills[1]), cx + kx, cy + .5);
    const sec = Math.floor(s.t);
    if (sec !== H.clockSec) { H.clockSec = sec; H.clockStr = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }
    ctx.font = fw(600, U.compact ? 11.5 : 13); ctx.fillStyle = PAPER; ctx.fillText(H.clockStr, cx, cy + .5);
    for (const c of s.champs) {
      const dir = c.team ? 1 : -1, x = cx + dir * (mid + gap * (c.slot + .5)), y = cy, spr = H.mini.get(c.id);
      ctx.globalAlpha = c.alive ? 1 : .32; blit(spr, x, y, r); ctx.globalAlpha = 1;
      if (c === me) { disc(x, y, r + 1); ctx.strokeStyle = GOLD; ctx.lineWidth = 1.3; ctx.stroke(); }
      if (!c.alive) { ctx.font = fw(600, 11); ctx.textAlign = 'center'; label(num(Math.ceil(c.respawn)), x, y + .5, WHITE); }
    }
    const P = U.pause, sq = H.sq.pause; H.sq.pause = Math.max(0, sq - dt * 7);
    const pr = P.r * (1 - sq * .15);
    disc(P.x, P.y, pr); ctx.fillStyle = GLASS; ctx.fill(); ctx.strokeStyle = HAIR; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = PAPER; ctx.fillRect(P.x - 3.6, P.y - 5, 2, 10); ctx.fillRect(P.x + 1.6, P.y - 5, 2, 10);
  }

  // ---------- the people: a slim tug-of-war tucked under the strip ----------
  function drawPeople(dt, s) {
    const cx = U.stripX, half = U.midHalf + U.miniGap * 4, x = cx - half, bw = half * 2, y = 26, h = 4, low = s.hope <= 30, high = s.hope >= 70;
    H.hope += (s.hope - H.hope) * Math.min(1, dt * 5);
    H.hopeFlash = Math.max(0, H.hopeFlash - dt * 2.2);
    const f = clamp01(H.hope / 100), mx = x + bw * f, pulse = calm ? 1 : .7 + Math.sin(H.t * 5) * .3;
    ctx.fillStyle = GLASS; ctx.fillRect(x - 1, y - 1, bw + 2, h + 2);
    ctx.fillStyle = high ? GOLD : '#2f5a9e'; ctx.fillRect(x, y, mx - x, h);
    ctx.fillStyle = low ? CRIM : '#7d1626'; ctx.fillRect(mx, y, x + bw - mx, h);
    if (high || low) { ctx.globalAlpha = pulse * .4; ctx.fillStyle = '#fff'; ctx.fillRect(high ? x : mx, y, high ? mx - x : x + bw - mx, h); ctx.globalAlpha = 1; }
    ctx.fillStyle = INK; ctx.fillRect(x + bw * .3 - .5, y, 1, h); ctx.fillRect(x + bw * .7 - .5, y, 1, h);
    // The marker coin flips as the balance tips.
    const want = s.hope >= 50 ? 0 : 1;
    if (want !== H.hopeSide) { H.hopeSide = want; H.hopeFlash = Math.max(H.hopeFlash, .8); }
    H.hopeAng += ((want ? Math.PI : 0) - H.hopeAng) * Math.min(1, dt * 7);
    const m = 1 + (calm ? 0 : H.hopeFlash) * .45;
    Deco.flip(ctx, mx, y + h / 2, 7 * m, H.hopeAng, 24, 0);
    const left = s.bossUp ? -1 : Math.max(0, Math.ceil(s.bossAt - s.t));
    if (left !== H.hoardKey) { H.hoardKey = left; H.hoardStr = left > 0 ? `Colossus in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : ''; }
    ctx.font = fw(500, 11); ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    if (left > 0 && left <= 30) label(H.hoardStr, cx, y + h + 10, GOLD);
    else if (H.first && s.t < 40 && !H.banner) label('The people', cx, y + h + 10, WHITE);
  }

  // ---------- minimap ----------
  function bakeMap(s) {
    const M = U.map, c = Art.cv(M.w * 2, M.h * 2), g = c.getContext('2d'), kx = M.w * 2 / Sim.W, ky = M.h * 2 / Sim.H;
    g.fillStyle = '#121a2a'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#05070c'; for (const w of s.map.walls) if (w.big) g.fillRect(w.x * kx, w.y * ky, w.w * kx, w.h * ky);
    g.fillStyle = '#2a3448'; for (const w of s.map.walls) if (!w.big) g.fillRect(w.x * kx, w.y * ky, w.w * kx, w.h * ky);
    g.strokeStyle = 'rgba(148,167,194,.5)'; g.lineWidth = 2.5; g.lineJoin = 'miter'; g.lineCap = 'butt';
    for (const L of s.map.lanes) { g.beginPath(); L.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x * kx, y * ky)); g.stroke(); }
    return c;
  }
  function drawMap(dt, s, me) {
    const M = U.map, kx = M.w / Sim.W, ky = M.h / Sim.H;
    if (!H.mapC) H.mapC = bakeMap(s);
    put(panel(M.w + 4, M.h + 4, 5, '#07080d', HAIR), M.x - 2, M.y - 2);
    ctx.drawImage(H.mapC, M.x, M.y, M.w, M.h);
    drawFog(dt, s, me, M, kx, ky);
    ctx.save(); ctx.beginPath(); ctx.rect(M.x, M.y, M.w, M.h); ctx.clip();
    for (const t of s.towers) if (t.alive) { const r = t.sub === 'core' ? 3.4 : 2.4; ctx.fillStyle = INK; ctx.fillRect(M.x + t.x * kx - r - .8, M.y + t.y * ky - r - .8, 2 * r + 1.6, 2 * r + 1.6); ctx.fillStyle = TEAM_DOT[t.team ? 1 : 0]; ctx.fillRect(M.x + t.x * kx - r, M.y + t.y * ky - r, 2 * r, 2 * r); }
    ctx.fillStyle = 'rgba(233,237,244,.7)'; for (const c of s.sites) if (c.alive) { disc(M.x + c.x * kx, M.y + c.y * ky, 1.6); ctx.fill(); }
    if (s.bossUp) { const mc = s.map.center || { x: Sim.W / 2, y: Sim.H / 2 }; diamond(M.x + mc.x * kx, M.y + mc.y * ky, 4.5); ctx.fillStyle = GOLD; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke(); }
    const vw = VW / Z * kx, vh = VH / (Z * TILT) * ky;
    ctx.strokeStyle = 'rgba(233,237,244,.65)'; ctx.lineWidth = 1; ctx.strokeRect(M.x + G.cam.x * kx - vw / 2, M.y + G.cam.y * ky - vh / 2, vw, vh);
    for (let i = H.pings.length - 1; i >= 0; i--) {
      const p = H.pings[i]; p.t += dt;
      if (p.t >= 1) { H.pings[i] = H.pings[H.pings.length - 1]; H.pings.pop(); continue; }
      disc(M.x + p.x * kx, M.y + p.y * ky, 3 + p.t * 12); ctx.strokeStyle = `rgba(236,58,82,${1 - p.t})`; ctx.lineWidth = 1.5; ctx.stroke();
    }
    for (const c of s.champs) {
      if (!c.alive || !Sim.canSee(s, me.team, c)) continue;
      const mine = c === me, X = M.x + c.x * kx, Y = M.y + c.y * ky;
      disc(X, Y, mine ? 4.2 : 3.2); ctx.fillStyle = mine ? PAPER : TEAM_DOT[c.team]; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
    if (Hud.isLive()) drawNetDot(M);
  }
  // Vision fog: a tiny layer, refreshed a few times a second and scaled up.
  function drawFog(dt, s, me, M, kx, ky) {
    if (!Sim.visionSources) return;
    if (!H.fogC) { H.fogC = Art.cv(M.w, M.h); H.fogT = 0; }
    H.fogT -= dt;
    if (H.fogT <= 0) {
      H.fogT = .25;
      const g = H.fogC.getContext('2d'), k = H.fogC.width / M.w;
      g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, M.w, M.h); g.fillStyle = 'rgba(4,5,9,.68)'; g.fillRect(0, 0, M.w, M.h);
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.beginPath();
      for (const v of Sim.visionSources(s, me.team)) { const x = v.x * kx * k, y = v.y * ky * k; g.moveTo(x + v.r * kx * k, y); g.ellipse(x, y, v.r * kx * k, v.r * ky * k, 0, 0, TAU); }
      g.fill();
    }
    ctx.drawImage(H.fogC, M.x, M.y, M.w, M.h);
  }
  function drawNetDot(M) {
    const ok = typeof Net !== 'undefined' && !!Net.connected && !Net.stalled, ping = ok ? Math.round(Net.ping || 0) : -1;
    if (ping !== H.netKey) { H.netKey = ping; H.netStr = ping < 0 ? 'Reconnecting' : ping ? `${ping} ms` : 'Online'; }
    const col = ping < 0 || ping >= 180 ? CRIM : ping >= 90 ? GOLD : '#3fbf78', x = M.x + M.w, y = M.y + M.h + 12;
    ctx.font = fw(500, 11); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    label(H.netStr, x, y + .5, WHITE);
    disc(x - ctx.measureText(H.netStr).width - 7, y, 3); ctx.fillStyle = col; ctx.fill();
  }

  // ---------- right cluster ----------
  function inkRing(x, y, r) { disc(x, y, r); ctx.strokeStyle = 'rgba(5,6,10,.9)'; ctx.lineWidth = 1.5; ctx.stroke(); }
  function drawAttack(dt, me) {
    const A = U.atk, held = Ctl.atk !== null;
    H.atkPress += ((held ? 1 : 0) - H.atkPress) * Math.min(1, dt * 24);
    const r = A.r * (1 - H.atkPress * .06);
    blit(H.portrait, A.x, A.y, r);
    if (held) arcLine(A.x, A.y, A.r + 4, 0, TAU, SIDE_ACC[me.team], 2);
    if (me.atkCd > H.atkPrev + .001) H.atkMax = me.atkCd;
    H.atkPrev = Math.max(0, me.atkCd);
    if (me.atkCd > 0) arcLine(A.x, A.y, A.r + 4, -HPI, -HPI + TAU * clamp01(1 - me.atkCd / H.atkMax), PAPER, 2);
  }

  function drawAbility(i, dt, me) {
    const a = me.kit[i], B = U.ab[i], locked = i === 2 && me.lvl < 3, cd = Math.max(0, me.cd[i]), rec = Math.max(0, me.recast[i]);
    const recast = rec > 0 && !!a.recast, onCd = cd > 0 && !recast, charge = me.charge && me.charge.slot === i ? me.charge : null, ready = !onCd && !locked;
    const held = Ctl.aim !== null && Ctl.aim.slot === i, winding = !!a.windup && !!me.chan && me.chan.slot === i, acc = SIDE_ACC[me.team];
    if (cd > H.prev[i] + .001) H.cdMax[i] = cd;
    if (cd <= 0 && H.prev[i] > 0 && !locked) { H.pop[i] = 1; H.spark[i] = 0; Sound.play('ready'); }
    H.prev[i] = cd;
    if (rec > H.recPrev[i] + .001) H.recMax[i] = rec;
    H.recPrev[i] = rec;
    H.press[i] += ((held ? 1 : 0) - H.press[i]) * Math.min(1, dt * 26);
    H.pop[i] = Math.max(0, H.pop[i] - dt * 2.4); H.deny[i] = Math.max(0, H.deny[i] - dt * 5); H.flash[i] = Math.max(0, H.flash[i] - dt * 4);
    const pop = H.pop[i], shake = calm ? 0 : Math.sin(H.deny[i] * 22) * 3.2 * H.deny[i];
    const scale = 1 - Math.max(H.press[i], H.flash[i]) * .1 + (calm ? 0 : Math.sin(pop * Math.PI) * .1);
    const x = B.x + shake, y = B.y, r = B.r * scale, size = (r * 86) / 40, half = size / 2;
    if (onCd || locked) {
      ctx.drawImage(H.abOff[i], x - half, y - half, size, size);
      if (onCd) {
        const f = clamp01(cd / H.cdMax[i]), hand = -HPI + TAU * (1 - f);
        // Colour returns as the sweep closes; the waiting part stays dark and grey.
        ctx.save(); ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r + 4, -HPI, hand); ctx.closePath(); ctx.clip();
        ctx.drawImage(H.abOn[i], x - half, y - half, size, size); ctx.restore();
        ctx.fillStyle = 'rgba(6,7,11,.66)'; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, hand, -HPI + TAU); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = acc; ctx.lineWidth = 1.5; ctx.lineCap = 'butt';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(hand) * (r - 1), y + Math.sin(hand) * (r - 1)); ctx.stroke();
        const n = cd > 3 ? num(Math.ceil(cd)) : TENTH[Math.min(30, Math.ceil(cd * 10))], soon = cd <= 1 && !calm, sz = cd > 3 ? 30 : 26;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = fd(sz); ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(5,6,10,.85)'; ctx.strokeText(n, x, y + 1); ctx.fillStyle = soon ? acc : WHITE; ctx.fillText(n, x, y + 1);
      }
      inkRing(x, y, r);
    } else {
      // Ready reads at a glance: full colour, a bright rim and a bead of sparkle.
      ctx.drawImage(H.abOn[i], x - half, y - half, size, size);
      arcLine(x, y, r + 1.5, 0, TAU, 'rgba(5,6,10,.8)', 3.5);
      arcLine(x, y, r + 1.5, 0, TAU, recast ? (calm ? ACID : `rgba(184,226,60,${.75 + Math.sin(H.t * 8) * .25})`) : acc, 1.6);
    }
    if (recast) { arcLine(x, y, r + 5, 0, TAU, 'rgba(184,226,60,.3)', 2); arcLine(x, y, r + 5, -HPI, -HPI + TAU * clamp01(rec / H.recMax[i]), ACID, 2); }
    if (pop > 0) {
      ctx.globalAlpha = pop; arcLine(B.x, B.y, B.r + 2 + (1 - pop) * 16, 0, TAU, acc, 1.5); ctx.globalAlpha = 1;
      if (pop > .25 && i === 2) { ctx.font = fd(18); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.globalAlpha = Math.min(1, pop * 2.4); label('READY', B.x, B.y - B.r - 9 - (1 - pop) * 4, acc); ctx.globalAlpha = 1; }
    }
    if (held) arcLine(x, y, r + 5, 0, TAU, Ctl.aim.cancelHot ? CRIM : PAPER, 2);
    if (charge) { const f = Math.min(1, charge.t / (a.charge || 1.1)); arcLine(x, y, r + 8, -HPI, -HPI + TAU * f, f >= 1 ? GOLD : STEEL, 3); }
    if (winding) { const w = (Math.sin(H.t * 12) + 1) / 2; arcLine(x, y, r + 6, 0, TAU, `rgba(236,58,82,${.55 + w * .45})`, 2); ctx.font = fw(500, 13); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; label('Tap to cancel', B.x, B.y - B.r - 15, '#ff8a9a'); }
    if (locked) { put(panel(38, 17, 4, '#07080d', HAIR), B.x - 19, B.y + B.r - 12); ctx.font = fw(600, 12); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = PAPER; ctx.fillText('Lv 3', B.x, B.y + B.r - 3.5); }
  }

  function drawCancel(dt) {
    const A = Ctl.aim;
    H.cancelIn += ((A ? 1 : 0) - H.cancelIn) * Math.min(1, dt * 18);
    if (H.cancelIn < .02) return;
    const C = U.cancel, hot = A && A.cancelHot && !A.backHot, r = C.r * H.cancelIn * (hot ? 1.14 : 1);
    ctx.globalAlpha = Math.min(1, H.cancelIn * 1.5);
    disc(C.x, C.y, r); ctx.fillStyle = hot ? CRIM : GLASS; ctx.fill(); ctx.strokeStyle = hot ? '#ff8a9a' : HAIR; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = fd(17); ctx.fillStyle = hot ? WHITE : PAPER; ctx.fillText('CANCEL', C.x, C.y + 1);
    ctx.globalAlpha = 1;
  }

  function drawAimCard(me) {
    const A = Ctl.aim; if (!A) return;
    const a = me.kit[A.slot], rng = H.rng[A.slot], acc = SIDE_ACC[me.team], title = a.name.toUpperCase(), more = H.first;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.font = fd(17); const nw = ctx.measureText(title).width;
    ctx.font = fw(500, 11.5); const rw = ctx.measureText(rng).width;
    let dw = 0; if (more) { ctx.font = fw(500, 12); dw = ctx.measureText(a.d).width; }
    const h = more ? 38 : 25, w = Math.min(VW - 330, Math.ceil(Math.max(nw + rw + 22, dw) + 20)) & ~1, x = Math.round(VW / 2 - w / 2), y = U.compact ? 36 : 39;
    put(panel(w, h, 5), x, y);
    ctx.font = fd(17); ctx.fillStyle = acc; ctx.fillText(title, x + 9, y + 12.5);
    ctx.font = fw(500, 11.5); ctx.textAlign = 'right'; ctx.fillStyle = MUTE; ctx.fillText(rng, x + w - 10, y + 12.5);
    if (more) { ctx.textAlign = 'left'; ctx.font = fw(500, 12); ctx.fillStyle = PAPER; ctx.fillText(a.d, x + 9, y + 27, w - 18); }
    if (A.backHot) { const B = U.ab[A.slot]; ctx.font = fw(500, 13); ctx.textAlign = 'center'; label('Release to cancel', B.x, B.y - B.r - 13, '#ff8a9a'); }
  }

  function drawStick(s) {
    const st = Ctl.stick;
    if (st) {
      disc(st.sx, st.sy, 58); ctx.fillStyle = 'rgba(6,7,11,.3)'; ctx.fill(); ctx.strokeStyle = 'rgba(233,237,244,.4)'; ctx.lineWidth = 1.2; ctx.stroke();
      const dx = st.x - st.sx, dy = st.y - st.sy, l = Math.min(58, Math.hypot(dx, dy)), an = Math.atan2(dy, dx), nx = st.sx + Math.cos(an) * l, ny = st.sy + Math.sin(an) * l;
      disc(nx, ny, 23); ctx.fillStyle = 'rgba(233,237,244,.82)'; ctx.fill();
    } else if (H.guide && s.t < 20) { disc(122, VH - 86, 52); ctx.strokeStyle = 'rgba(233,237,244,.22)'; ctx.lineWidth = 1.2; ctx.stroke(); }
  }

  function drawFeed(dt) {
    let y = U.forge.y + U.forge.r + (H.first ? 26 : 19);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < H.feed.length; i++) {
      const f = H.feed[i]; f.t -= dt; f.age += dt;
      if (f.t <= 0) { H.feed.splice(i--, 1); continue; }
      ctx.globalAlpha = Math.min(1, f.t * 3) * (f.mine ? 1 : .72);
      const ax = 44 - Math.max(0, 1 - f.age / .14) * 60, mark = f.aT === 0 ? GOLD : f.aT === 1 ? CRIM : PAPER;
      put(panel(66, 19, 4, GLASS, f.mine ? mark : null), ax, y - 9.5);
      if (f.aS) blit(f.aS, ax + 13, y, 7.5); else { diamond(ax + 13, y, 5); ctx.fillStyle = MUTE; ctx.fill(); }
      ctx.strokeStyle = mark; ctx.lineWidth = 1.6; ctx.lineCap = 'butt'; ctx.lineJoin = 'miter'; ctx.beginPath(); ctx.moveTo(ax + 29, y - 4); ctx.lineTo(ax + 34, y); ctx.lineTo(ax + 29, y + 4); ctx.stroke();
      if (f.bS) blit(f.bS, ax + 51, y, 7.5);
      y += 21;
    }
    ctx.globalAlpha = 1;
  }

  const HINTS = ['Left thumb: move', 'Hold the big coin: attack', 'Drag an ability to aim'];
  function drawHint(dt, me) {
    const h = H.hint; if (!h || !me.alive || Ctl.aim || H.banner) return;
    h.t += dt;
    if ((h.i === 0 && Ctl.stick && h.t > .8) || (h.i === 1 && Ctl.atk !== null && h.t > .5) || (h.i === 2 && (me.stats.casts > 0 || h.t > 7)) || h.t > 8) { h.i++; h.t = 0; }
    if (h.i >= HINTS.length) { H.hint = null; return; }
    const s = HINTS[h.i]; ctx.font = fw(500, 14); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = Math.ceil(ctx.measureText(s).width + 24) & ~1, x = Math.round(VW / 2 - w / 2), y = VH - 34;
    ctx.globalAlpha = Math.min(1, h.t * 4) * .94;
    put(panel(w, 24, 5), x, y);
    ctx.fillStyle = PAPER; ctx.fillText(s, VW / 2, y + 12.5); ctx.globalAlpha = 1;
  }

  // Death is the shopping window: the upgrade panel opens below the timer on its own.
  function drawDeath(me) {
    ctx.fillStyle = 'rgba(5,6,10,.5)'; ctx.fillRect(0, 0, VW, VH);
    const cx = VW / 2, R = U.compact ? 24 : 30, cy = Math.round(VH * .3), ang = calm ? 0 : H.t * 1.1, ab = Math.abs(Math.cos(ang));
    if (ab > .05) { const h = H.portrait.S * R / H.portrait.R; ctx.drawImage(H.portrait.c, cx - h * ab / 2, cy - h / 2, h * ab, h); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    Deco.text(ctx, `BACK IN ${Math.ceil(me.respawn)}`, cx, cy + R + 21, U.compact ? 30 : 36, SIDE_ACC[me.team], 2);
  }
  function deathForge(me) {
    if (me.alive === !H.wasDead) return;
    H.wasDead = !me.alive;
    const f = $('forge');
    if (H.wasDead) { if (G.outro || G.ended) return; H.forgeAuto = true; f.classList.add('dead'); f.classList.remove('hide'); forgeBuild(); }
    else { f.classList.remove('dead'); if (H.forgeAuto) f.classList.add('hide'); H.forgeAuto = false; }
  }

  // ---------- frame ----------
  function hudDraw(dt) {
    if (!H || !G) return;
    const me = G.me, s = G.s, want = G.intro > 0 || G.outro || G.ended ? 0 : 1;
    H.t += dt;
    H.enter = clamp01(H.enter + (want ? dt * 3.2 : -dt * 4));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.textBaseline = 'middle';
    if (H.enter <= 0) return;
    if (want && !H.announced) { H.announced = true; banner(me.team ? 'Terrorize the city' : 'Save the people', { pri: 3, team: me.team, dur: 2 }); }
    const e = calm ? 1 : H.enter * H.enter * (3 - 2 * H.enter), away = 1 - e;
    if (me.hp / me.maxHp < .25 && me.alive) {
      const p = calm ? .5 : (Math.sin(H.t * 3.4) + 1) / 2;
      ctx.globalAlpha = (.2 + p * .16) * e; ctx.drawImage(redEdge(), 0, 0, VW, VH); ctx.globalAlpha = 1;
    }
    drawStick(s);
    offset(-300 * away, 0); drawFrame(dt, me); drawFeed(dt);
    offset(0, -90 * away); drawStrip(dt, s, me); drawPeople(dt, s);
    offset(300 * away, 0); drawMap(dt, s, me); drawCancel(dt);
    offset(320 * away, 0); drawAttack(dt, me); for (let i = 0; i < 3; i++) drawAbility(i, dt, me);
    offset(0, 0);
    deathForge(me);
    if (!me.alive) drawDeath(me);
    drawHint(dt, me); drawAimCard(me); drawBanner(dt);
    if (forgeOpen() && (H.frame++ % 10 === 0)) forgeSync(false);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---------- upgrade panel ----------
  const forgeOpen = () => !$('forge').classList.contains('hide');
  function forgeBuild() {
    const f = $('forge'), me = G.me; f.textContent = '';
    for (const [k, name, desc] of TRACKS) {
      const b = document.createElement('button'); b.dataset.k = k;
      b.innerHTML = `<b>${name}</b><span class="pips"><i></i><i></i><i></i></span><small>${desc}</small><span class="c"><i class="gc"></i><span></span></span>`;
      b.onclick = () => { if (!G || G.me.gold < Sim.FORGE_COST[G.me.up[k]]) return; G.me.q.push({ t: 'forge', track: k }); Sound.play('tap'); };
      f.append(b);
    }
    H.forgeKey = -1; forgeSync(true);
  }
  function forgeSync(force) {
    if (!H || !G || !forgeOpen()) return;
    const me = G.me, btns = $('forge').children;
    let key = 0;
    TRACKS.forEach(([k], i) => { const n = me.up[k]; key = key * 8 + n * 2 + (n < 3 && me.gold >= Sim.FORGE_COST[n] ? 1 : 0); });
    if (!force && key === H.forgeKey) return;
    H.forgeKey = key;
    TRACKS.forEach(([k], i) => {
      const b = btns[i], n = me.up[k], cost = Sim.FORGE_COST[n], pips = b.querySelectorAll('.pips i'), c = b.querySelector('.c'), full = n >= 3;
      pips.forEach((p, j) => p.classList.toggle('on', j < n));
      c.querySelector('.gc').classList.toggle('hide', full);
      c.querySelector('span').textContent = full ? 'Full' : cost;
      b.disabled = full || me.gold < cost;
      b.setAttribute('aria-label', `${TRACKS[i][1]}, ${n} of 3, ${full ? 'full' : `costs ${cost}`}`);
    });
  }
  Hud.forgeOpen = forgeOpen;
  Hud.closeForge = () => $('forge').classList.add('hide');
  Hud.toggleForge = () => {
    const f = $('forge'); f.classList.toggle('hide'); f.classList.toggle('dead', !!G && !G.me.alive);
    H.forgeAuto = false;
    if (!f.classList.contains('hide')) forgeBuild();
    Sound.play('tap');
  };

  // ---------- small helpers for the controls ----------
  Hud.deny = i => { if (H) H.deny[i] = 1; };
  Hud.flash = i => { if (H) H.flash[i] = 1; };
  Hud.toast = s => banner(s, { pri: 2, dur: 1.3 });
  Hud.banner = banner;
  Hud.isLive = () => !!(G && G.net && !G.net.dead);
  Hud.squash = k => { if (H && k in H.sq) H.sq[k] = 1; };

  // ---------- scoreboard, shared with the end screen ----------
  Hud.coinTo = (cv, spr, sx = 1) => {
    const g = cv.getContext('2d'), k = cv.width / spr.S;
    g.clearRect(0, 0, cv.width, cv.height); g.save(); g.translate(cv.width / 2, cv.height / 2); g.scale(sx, 1);
    g.drawImage(spr.c, -spr.S * k / 2, -spr.S * k / 2, spr.S * k, spr.S * k); g.restore();
  };
  Hud.scoreTable = (host, s, me) => {
    host.textContent = '';
    const t = document.createElement('table'); t.className = 'score';
    t.innerHTML = '<thead><tr><th></th><th>Name</th><th>Role</th><th class="n">K/D/A</th><th class="n">Gold</th></tr></thead>';
    [0, 1].forEach(team => {
      const body = document.createElement('tbody'); body.className = 't' + team;
      for (const c of s.champs) {
        if (c.team !== team) continue;
        const tr = document.createElement('tr'); if (c === me) tr.className = 'me';
        const st = c.stats || { kills: 0, deaths: 0, assists: 0 }, role = c.role ? Sim.ROLE_INFO[c.role].name : '';
        tr.innerHTML = `<td><canvas width="48" height="48"></canvas></td><td>${Sim.charOf(c.team, c.champ).name}<small>${c.pname || ''}</small></td><td>${role}</td><td class="n">${st.kills}/${st.deaths}/${st.assists}</td><td class="n">${Math.floor(c.gold || 0)}</td>`;
        Hud.coinTo(tr.querySelector('canvas'), Art.champCoin(c.champ, c.team, c.tier, 26));
        body.append(tr);
      }
      t.append(body);
    });
    host.append(t);
  };

  Hud.openPause = () => {
    if (!G) return;
    if (Ctl.aim) G.me.q.push({ t: 'cancel' });
    Ctl.reset(); G.me.atk = false; G.me.mv.x = G.me.mv.y = 0;
    const net = Hud.isLive();
    if (!net) paused = true;
    $('pT').textContent = net ? 'Menu' : 'Paused';
    $('pNote').classList.toggle('hide', !net);
    Hud.closeForge();
    Hud.scoreTable($('pBoard'), G.s, G.me);
    if (Hud.syncToggles) Hud.syncToggles();
    $('pause').classList.remove('hide');
    Sound.play('tap');
  };

  return { hud, initHud, hudDraw, uiEvent };
})();
