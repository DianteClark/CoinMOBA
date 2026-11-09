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

// Match HUD, drawn on the canvas, plus the item shop, the evolve choice and the pause overlay.
const Hud = {
  ui: {
    atk: { x: 0, y: 0, r: 46 },
    ab: [{ x: 0, y: 0, r: 33 }, { x: 0, y: 0, r: 33 }, { x: 0, y: 0, r: 37 }],
    atkM: { x: 0, y: 0, r: 19 }, atkT: { x: 0, y: 0, r: 19 }, beacon: { x: 0, y: 0, r: 20 },
    cancel: { x: 0, y: 70, r: 34 }, pause: { x: 0, y: 20, r: 14 },
    shop: { x: 63, y: 76, r: 17 }, recall: { x: 106, y: 76, r: 17 }, ping: { x: 149, y: 76, r: 17 },
    map: { x: 0, y: 6, w: 140, h: 84 },
    stripX: 400, miniR: 8, miniGap: 20, midHalf: 40, hpW: 104, compact: false,
  },
};

const { hud, initHud, hudDraw, uiEvent } = (() => {
  const U = Hud.ui, HPI = Math.PI / 2, UIFONT = '"Barlow Semi Condensed","Arial Narrow","Roboto Condensed","DejaVu Sans Condensed",sans-serif';
  const { INK, PAPER, MUTE, GOLD, STEEL, BLUE, NAVY, GUN, CRIM, ACID } = Deco;
  const WHITE = '#ffffff', GLASS = 'rgba(8,10,16,.86)', HAIR = 'rgba(148,167,194,.34)', WELL = 'rgba(148,167,194,.2)', PX = 65, PY = 27, PR = 21, HP_X = 92, GOLD_X = 101, GOLD_Y = 44;
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
  // Every movable control, with its default offset from the attack coin (or its fixed spot) at full size.
  const CLUSTER = { atk: [0, 0, 46], atkM: [-66, -20, 19], atkT: [-26, -64, 19], ab0: [-106, 20, 33], ab1: [-82, -76, 33], ab2: [2, -114, 37], beacon: [-162, -52, 20] };
  const CORNER = { shop: [63, 76, 17], recall: [106, 76, 17], ping: [149, 76, 17] };
  const LABELS = { atk: 'Attack', atkM: 'Minion', atkT: 'Tower', ab0: 'Ability 1', ab1: 'Ability 2', ab2: 'Ultimate', beacon: 'Beacon', shop: 'Shop', recall: 'Recall', ping: 'Ping' };
  const hudOf = () => save.hud || (save.hud = { left: false, pos: {} });
  const left = () => !!hudOf().left;
  // Default position of a control for this screen and handedness, before the player's own offset.
  function basePos(key) {
    const k = U.compact ? .88 : 1;
    if (CORNER[key]) { const [x, y, r] = CORNER[key]; return { x, y, r }; }
    const [ox, oy, r0] = CLUSTER[key], R = 46 * k, ax = VW - 46 - R, ay = VH - (U.compact ? 70 : 78), x = ax + ox * k, y = ay + oy * k;
    return { x: left() ? VW - x : x, y, r: r0 * k };
  }
  function placed(key) {
    const b = basePos(key), o = hudOf().pos[key];
    if (o) { b.x += o[0]; b.y += o[1]; }
    const m = Math.min(b.r + 2, 40);
    b.x = Math.max(m, Math.min(VW - m, b.x)); b.y = Math.max(m, Math.min(VH - m, b.y));
    return b;
  }
  const put2 = (t, key) => { const b = placed(key); t.x = b.x; t.y = b.y; t.r = b.r; };
  function hud() {
    U.compact = VW < 760 || VH < 350;
    stage.classList.toggle('sm', U.compact);
    stage.classList.toggle('lh', left());
    put2(U.atk, 'atk'); put2(U.atkM, 'atkM'); put2(U.atkT, 'atkT'); put2(U.beacon, 'beacon');
    put2(U.ab[0], 'ab0'); put2(U.ab[1], 'ab1'); put2(U.ab[2], 'ab2');
    put2(U.shop, 'shop'); put2(U.recall, 'recall'); put2(U.ping, 'ping');
    const cx = VW - 250; U.cancel.x = left() ? VW - cx : cx; U.cancel.y = 122;
    const M = U.map; M.w = U.compact ? 88 : 112; M.h = Math.round(M.w * Sim.H / Sim.W); M.x = VW - 44 - M.w; M.y = 6;
    U.pause.x = M.x - 21; U.pause.y = 20;
    U.stripX = VW / 2; U.miniR = U.compact ? 7 : 8; U.miniGap = U.compact ? 17 : 20; U.midHalf = U.compact ? 33 : 40;
    U.hpW = U.compact ? 84 : 104;
    if (H) H.mapC = H.fogC = null;
  }
  Hud.left = left;
  Hud.layoutKeys = Object.keys(LABELS).map(k => [k, LABELS[k]]);
  Hud.basePos = basePos;
  Hud.placed = placed;

  // ---------- match setup ----------
  function initHud(g) {
    const me = g.me, s = g.s;
    Ctl.reset();
    const shopEl = $('shop'); shopEl.classList.add('hide'); shopEl.classList.remove('dead');
    $('evo').classList.add('hide'); $('evo').textContent = '';
    const byId = new Map(), mini = new Map();
    for (const c of s.champs) { byId.set(c.id, c); mini.set(c.id, Art.champCoin(c.champ, c.team, c.tier, 26, c.finish)); }
    for (const t of s.towers) byId.set(t.id, t);
    H = {
      t: 0, enter: 0, byId, mini, hope: s.hope, hopeFlash: 0, announced: false, hopeAng: s.hope >= 50 ? 0 : Math.PI, hopeSide: s.hope >= 50 ? 0 : 1,
      portrait: Art.champCoin(me.champ, me.team, me.tier, 52, me.finish), fogC: null, fogT: 0, wasDead: false, shopAuto: false, shopKey: '', shopSel: null, shopHot: false, shopHotT: 0, sold: -1,
      rip: [], chat: [], wpings: [], pingLog: [], echoAt: -9, radial: 0, lastSeen: new Map(), lastHitHot: 0, lastHitT: 0, atkPop: { champ: 0, minion: 0, tower: 0 }, atkHeld: { champ: 0, minion: 0, tower: 0 }, sheen: [-1, -1, -1], bcnMax: 0, bcnPrev: 0, hpEase: me.hp / me.maxHp, xpEase: 0, evoKey: '', evoT: 0, evoDone: [false, false], evoShut: false, tips: g.cfg && g.cfg.practice ? { i: 0, t: 0 } : null,
      abOn: me.kit.map((_, i) => Art.abilityCoin(me.champ, i, true, 40, me.team)), abOff: me.kit.map((_, i) => Art.abilityCoin(me.champ, i, false, 40, me.team)),
      rng: me.kit.map(a => a.range ? `Range ${a.range}` : 'Self'),
      hpTrail: me.hp, hpHold: 0, hurt: 0, hpPrev: me.hp, goldShow: me.gold, goldStr: String(Math.floor(me.gold)), goldGain: 0, goldGainT: 0, goldGainStr: '', lvlFx: 0, first: save.hints < 1, guide: save.hints < 2, netStr: '', netKey: -2,
      prev: [0, 0, 0], cdMax: [1, 1, 1], recPrev: [0, 0, 0], recMax: [1, 1, 1], pop: [0, 0, 0], press: [0, 0, 0], deny: [0, 0, 0], flash: [0, 0, 0], spark: [.4, 1.2, 2.0],
      atkPress: 0, atkMax: 1, atkPrev: 0, cancelIn: 0,
      feed: [], banner: null, queue: [], pings: [], pingAt: {}, towerAt: -99, mapC: null, kills: [s.kills[0], s.kills[1]], killBump: [0, 0], lvl: me.lvl, lvlBump: 0, sq: { shop: 0, recall: 0, pause: 0, ping: 0, beacon: 0 },
      clockSec: -1, clockStr: '0:00', hoardKey: -2, hoardStr: '', frame: 0,
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
    else if (k === 'ping') { if (e.team === undefined || e.team === G.me.team) onPing(e); }
    else if (k === 'buy' || k === 'sell') { if (e.u === me.id) shopSync(true); }
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
    H.hpEase += (f - H.hpEase) * Math.min(1, dt * 22);
    const hf = calm ? f : H.hpEase;
    ctx.fillStyle = low ? CRIM : '#3fbf78'; ctx.fillRect(x, y, hpw * hf, h);
    ctx.fillStyle = low ? '#ff7f90' : '#86e5ae'; ctx.fillRect(x, y, hpw * hf, 2);
    // A slow glint along the bar keeps it feeling like polished metal.
    if (!calm && quality > 0) { const g0 = (H.t * .22) % 1, gx = x + hpw * hf * g0; if (g0 < .94 && hf > .08) { ctx.globalAlpha = .28; ctx.fillStyle = '#fff'; ctx.fillRect(gx, y, Math.min(14, hpw * hf * (1 - g0)), h); ctx.globalAlpha = 1; } }
    ctx.font = fw(600, 11.5); ctx.textAlign = 'center';
    label(num(Math.ceil(me.hp)), x + hpw / 2, y + h / 2 + .5, WHITE, 2.2);
    const need = Sim.xpNeed(me.lvl), xf = me.lvl >= 10 ? 1 : clamp01(me.xp / need);
    // Xp rises smoothly, and drops straight back to the bottom on a level-up.
    H.xpEase = xf < H.xpEase - .25 ? xf : H.xpEase + (xf - H.xpEase) * Math.min(1, dt * 10);
    ctx.fillStyle = WELL; ctx.fillRect(x, y + h + 2, hpw, 3);
    ctx.fillStyle = H.lvlFx > 0 ? PAPER : SIDE_ACC[side]; ctx.fillRect(x, y + h + 2, hpw * (calm ? xf : H.xpEase), 3);
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
    // The shop only draws the eye when something can be bought.
    if ((H.shopHotT -= dt) <= 0) { H.shopHotT = .25; H.shopHot = canAfford(me); }
    const open = shopOpen(), hot = H.shopHot && !open;
    smallCoin(U.shop, hot || open, 'Shop', drawUpgrade, H.sq.shop, dt, 'shop');
    if (hot) {
      if (!calm) { const p = (Math.sin(H.t * 3.6) + 1) / 2; arcLine(U.shop.x, U.shop.y, U.shop.r + 2 + p * 3, 0, TAU, SIDE_ACC[side], 1.2); }
      diamond(U.shop.x + 12, U.shop.y - 12, 4.5); ctx.fillStyle = SIDE_ACC[side]; ctx.fill();
    }
    const chan = me.chan && me.chan.recall ? me.chan : null;
    smallCoin(U.recall, !!chan, 'Recall', drawGate, H.sq.recall, dt, 'recall');
    if (chan) arcLine(U.recall.x, U.recall.y, U.recall.r + 2, -HPI, -HPI + TAU * (1 - chan.t / chan.total), SIDE_ACC[side], 2.5);
    smallCoin(U.ping, !!Ctl.ping, 'Ping', drawFlag, H.sq.ping, dt, 'ping');
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
  function drawFlag(x, y, col) {
    ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
    ctx.beginPath(); ctx.moveTo(x - 6, y + 9); ctx.lineTo(x - 6, y - 8); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x - 6, y - 8); ctx.lineTo(x + 8, y - 4); ctx.lineTo(x - 6, y + 1); ctx.closePath(); ctx.fill();
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
    drawMapPings(M, kx, ky);
    for (const c of s.champs) {
      if (!c.alive || !Sim.canSee(s, me.team, c)) continue;
      const mine = c === me, X = M.x + c.x * kx, Y = M.y + c.y * ky;
      if (c.team !== me.team) H.lastSeen.set(c.id, { x: c.x, y: c.y, t: s.t });
      disc(X, Y, mine ? 4.2 : 3.2); ctx.fillStyle = mine ? PAPER : TEAM_DOT[c.team]; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
    }
    drawMapAim(s, me, M, kx, ky);
    ctx.restore();
    if (Hud.isLive()) drawNetDot(M);
  }
  // The ultimate's reach on the minimap. Targets the team can see are ringed; enemies that slipped
  // into the fog only ever show where they were last seen, dimmed, and the aim point dims in fog too.
  function pointSeen(s, me, x, y) {
    if (!Sim.visionSources) return true;
    for (const v of Sim.visionSources(s, me.team)) if ((x - v.x) * (x - v.x) + (y - v.y) * (y - v.y) <= v.r * v.r) return true;
    return false;
  }
  function drawMapAim(s, me, M, kx, ky) {
    const A = Ctl.aim; if (!A || A.slot !== 2) return;
    const a = me.kit[2], range = a.range || 0; if (!range) return;
    const X = M.x + me.x * kx, Y = M.y + me.y * ky, acc = SIDE_ACC[me.team], d = aimDir(), hot = !A.cancelHot;
    ctx.beginPath(); ctx.ellipse(X, Y, range * kx, range * ky, 0, 0, TAU);
    ctx.fillStyle = 'rgba(233,237,244,.1)'; ctx.fill(); ctx.strokeStyle = hot ? acc : CRIM; ctx.lineWidth = 1.4; ctx.stroke();
    const tx = M.x + d.tx * kx, ty = M.y + d.ty * ky, seen = pointSeen(s, me, d.tx, d.ty);
    ctx.globalAlpha = seen ? 1 : .42;
    ctx.strokeStyle = acc; ctx.fillStyle = acc; ctx.lineWidth = 1.6; ctx.lineCap = 'butt';
    if (a.shape === 'circle') {
      if (!seen) ctx.setLineDash([2.5, 2.5]);
      ctx.beginPath(); ctx.ellipse(tx, ty, Math.max(3, (a.r || 80) * kx), Math.max(3, (a.r || 80) * ky), 0, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      disc(tx, ty, 1.5); ctx.fill();
    } else if (a.shape !== 'self') {
      const reach = d.reach || range, ex = X + d.dx * reach * kx, ey = Y + d.dy * reach * ky;
      if (!seen) ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.setLineDash([]);
      const an = Math.atan2(ey - Y, ex - X), h = 4;
      ctx.beginPath(); ctx.moveTo(ex + Math.cos(an) * h, ey + Math.sin(an) * h); ctx.lineTo(ex + Math.cos(an + 2.4) * h, ey + Math.sin(an + 2.4) * h); ctx.lineTo(ex + Math.cos(an - 2.4) * h, ey + Math.sin(an - 2.4) * h); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const c of s.champs) {
      if (c.team === me.team || !c.alive) continue;
      const vis = Sim.canSee(s, me.team, c), L0 = vis ? c : H.lastSeen.get(c.id);
      if (!L0 || (!vis && s.t - L0.t > 8)) continue;
      if ((L0.x - me.x) * (L0.x - me.x) + (L0.y - me.y) * (L0.y - me.y) > range * range) continue;
      const cx0 = M.x + L0.x * kx, cy0 = M.y + L0.y * ky;
      if (vis) { disc(cx0, cy0, 5.6); ctx.strokeStyle = WHITE; ctx.lineWidth = 1.2; ctx.stroke(); }
      else { ctx.globalAlpha = .4; disc(cx0, cy0, 3); ctx.fillStyle = TEAM_DOT[c.team]; ctx.fill(); ctx.globalAlpha = 1; }
    }
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
  // Glints and rings, baked once so nothing allocates a gradient per frame.
  let bandC = null;
  function band() {
    if (bandC) return bandC;
    const c = Art.cv(64, 64), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 64, 64);
    gr.addColorStop(.32, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,.9)'); gr.addColorStop(.68, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return bandC = c;
  }
  function sweep(x, y, r, f) {
    const d = r * 2.6, o = (f * 2 - 1) * r * 1.8;
    ctx.save(); disc(x, y, r); ctx.clip(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .7; ctx.drawImage(band(), x - d / 2 + o, y - d / 2 + o, d, d); ctx.restore();
  }
  function ripple(x, y, r, col) { if (calm) return; if (H.rip.length >= 8) H.rip.shift(); H.rip.push({ x, y, r, col, t: 0 }); }
  function drawRipples(dt) {
    for (let i = H.rip.length - 1; i >= 0; i--) {
      const p = H.rip[i]; p.t += dt * 3.6;
      if (p.t >= 1) { H.rip.splice(i, 1); continue; }
      const e = 1 - (1 - p.t) * (1 - p.t); ctx.globalAlpha = (1 - p.t) * .8; arcLine(p.x, p.y, p.r + 2 + e * 15, 0, TAU, p.col, 1.6); ctx.globalAlpha = 1;
    }
  }
  const pressStep = (v, on, dt) => on ? 1 : Math.max(0, v - dt * 9);

  function drawAttack(dt, me) {
    const A = U.atk, held = Ctl.atk !== null && Ctl.atkMode === 'champ';
    H.atkPress = pressStep(H.atkPress, held, dt);
    H.atkPop.champ = Math.max(0, H.atkPop.champ - dt * 6);
    const r = A.r * (1 - H.atkPress * .075 + (calm ? 0 : Math.sin(H.atkPop.champ * Math.PI) * .03));
    blit(H.portrait, A.x, A.y, r);
    if (held) arcLine(A.x, A.y, A.r + 4, 0, TAU, SIDE_ACC[me.team], 2);
    if (me.atkCd > H.atkPrev + .001) H.atkMax = me.atkCd;
    H.atkPrev = Math.max(0, me.atkCd);
    if (me.atkCd > 0) arcLine(A.x, A.y, A.r + 4, -HPI, -HPI + TAU * clamp01(1 - me.atkCd / H.atkMax), PAPER, 2);
    modeBtn(dt, me, U.atkM, 'minion', drawMinionGlyph, H.lastHitHot > 0);
    modeBtn(dt, me, U.atkT, 'tower', drawTowerGlyph, false);
  }
  function modeBtn(dt, me, B, mode, glyph, cue) {
    const held = Ctl.atk !== null && Ctl.atkMode === mode, acc = SIDE_ACC[me.team];
    H.atkHeld[mode] = pressStep(H.atkHeld[mode], held, dt);
    H.atkPop[mode] = Math.max(0, H.atkPop[mode] - dt * 6);
    const p = H.atkHeld[mode], r = B.r * (1 - p * .1);
    disc(B.x, B.y, r); ctx.fillStyle = held ? acc : GLASS; ctx.fill();
    ctx.strokeStyle = cue ? acc : held ? WHITE : HAIR; ctx.lineWidth = cue ? 2 : 1.2; ctx.stroke();
    glyph(B.x, B.y, B.r / 19, held ? INK : PAPER);
    if (cue && !calm) { const q = (Math.sin(H.t * 9) + 1) / 2; arcLine(B.x, B.y, B.r + 2 + q * 2, 0, TAU, acc, 1); }
  }
  function drawMinionGlyph(x, y, k, col) {
    // A single small coin, with one notch: the last hit.
    ctx.strokeStyle = col; ctx.lineWidth = 1.8 * k; disc(x, y, 7.6 * k); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y - 3.6 * k); ctx.lineTo(x + 3 * k, y); ctx.lineTo(x, y + 3.6 * k); ctx.lineTo(x - 3 * k, y); ctx.closePath(); ctx.fill();
  }
  function drawTowerGlyph(x, y, k, col) {
    ctx.fillStyle = col; ctx.beginPath();
    ctx.moveTo(x - 7 * k, y + 8 * k); ctx.lineTo(x - 5 * k, y - 3 * k); ctx.lineTo(x - 7.4 * k, y - 3 * k); ctx.lineTo(x - 7.4 * k, y - 8 * k); ctx.lineTo(x - 3.6 * k, y - 8 * k); ctx.lineTo(x - 3.6 * k, y - 5.4 * k); ctx.lineTo(x - 1.2 * k, y - 5.4 * k); ctx.lineTo(x - 1.2 * k, y - 8 * k); ctx.lineTo(x + 1.2 * k, y - 8 * k); ctx.lineTo(x + 1.2 * k, y - 5.4 * k); ctx.lineTo(x + 3.6 * k, y - 5.4 * k); ctx.lineTo(x + 3.6 * k, y - 8 * k); ctx.lineTo(x + 7.4 * k, y - 8 * k); ctx.lineTo(x + 7.4 * k, y - 3 * k); ctx.lineTo(x + 5 * k, y - 3 * k); ctx.lineTo(x + 7 * k, y + 8 * k); ctx.closePath(); ctx.fill();
  }
  // Tells the last-hit button when a minion in reach is one attack from falling.
  function lastHitTick(dt, me, s) {
    H.lastHitT -= dt; if (H.lastHitT > 0) return;
    H.lastHitT = .12; H.lastHitHot = 0;
    if (!me.alive) return;
    const R = me.range || (me.kit && me.kit.range) || 400, dmg = me.dmg || 55, r2 = (R + 40) * (R + 40);
    for (const u of s.minions) { if (!u.alive || u.team === me.team || u.hp > dmg) continue; const dx = u.x - me.x, dy = u.y - me.y; if (dx * dx + dy * dy < r2 && Sim.canSee(s, me.team, u)) { H.lastHitHot = 1; return; } }
  }

  // ---------- beacons ----------
  const BEACON_R = () => Sim.BEACON_RANGE || 460;
  const beaconLeft = me => me.beacons === undefined ? 2 : me.beacons;
  const beaconMax = () => Sim.BEACON_MAX || 2;
  const beaconWait = me => me.beaconT || 0;
  function drawBeacon(dt, me) {
    const B = U.beacon, n = beaconLeft(me), max = beaconMax(), wait = beaconWait(me), acc = SIDE_ACC[me.team], held = !!Ctl.beacon, hot = n > 0;
    H.sq.beacon = Math.max(0, H.sq.beacon - dt * 7);
    if (wait > H.bcnPrev + .01) H.bcnMax = wait;
    H.bcnPrev = wait;
    const r = B.r * (1 - H.sq.beacon * .14), k = B.r / 20;
    ctx.globalAlpha = hot ? 1 : .55;
    disc(B.x, B.y, r); ctx.fillStyle = held ? acc : GLASS; ctx.fill(); ctx.strokeStyle = held ? WHITE : HAIR; ctx.lineWidth = 1.2; ctx.stroke();
    const col = held ? INK : hot ? PAPER : MUTE;
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(B.x, B.y - 7 * k); ctx.lineTo(B.x + 4.6 * k, B.y); ctx.lineTo(B.x, B.y + 7 * k); ctx.lineTo(B.x - 4.6 * k, B.y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 1.4 * k; ctx.beginPath(); ctx.arc(B.x, B.y, 10.5 * k, -2.5, -.64); ctx.moveTo(B.x + Math.cos(.64) * 10.5 * k, B.y + Math.sin(.64) * 10.5 * k); ctx.arc(B.x, B.y, 10.5 * k, .64, 2.5); ctx.stroke();
    ctx.globalAlpha = 1;
    if (wait > 0 && H.bcnMax > 0 && n < max) arcLine(B.x, B.y, B.r + 3, -HPI, -HPI + TAU * clamp01(1 - wait / H.bcnMax), acc, 2);
    for (let i = 0; i < max; i++) { diamond(B.x - (max - 1) * 4.4 + i * 8.8, B.y + B.r + 7, 2.6); ctx.fillStyle = i < n ? acc : 'rgba(148,167,194,.32)'; ctx.fill(); }
    if (H.first) { ctx.font = fw(500, 10); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; label('Beacon', B.x, B.y - B.r - 8, WHITE); }
  }
  function drawBeaconAim(me) {
    const B = Ctl.beacon; if (!B || !me.alive) return;
    const X = sx(me.x), Y = sy(me.y), R = BEACON_R() * Z, pt = Ctl.beaconPoint(), PX_ = sx(pt.x), PY_ = sy(pt.y), acc = B.cancelHot ? CRIM : SIDE_ACC[me.team];
    ctx.beginPath(); ctx.ellipse(X, Y, R, R * TILT, 0, 0, TAU); ctx.strokeStyle = 'rgba(233,237,244,.35)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(PX_, PY_); ctx.strokeStyle = acc; ctx.lineWidth = 1.6; ctx.stroke(); ctx.setLineDash([]);
    diamond(PX_, PY_ - 3, 7); ctx.fillStyle = acc; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(PX_, PY_, 26, 26 * TILT, 0, 0, TAU); ctx.strokeStyle = acc; ctx.lineWidth = 1.4; ctx.stroke();
  }

  // ---------- pings ----------
  const PING = { danger: ['Danger', CRIM], attack: ['Attack', '#ff8a4c'], retreat: ['Retreat', GOLD], omw: ['On my way', BLUE], help: ['Help', '#3fbf78'] };
  const radialR = () => U.compact ? 62 : 72;
  function pingGlyph(kind, x, y, k, col) {
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2.2 * k; ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
    ctx.beginPath();
    if (kind === 'danger') { ctx.moveTo(x, y - 8 * k); ctx.lineTo(x + 8 * k, y + 6.5 * k); ctx.lineTo(x - 8 * k, y + 6.5 * k); ctx.closePath(); ctx.stroke(); ctx.fillRect(x - 1 * k, y - 3 * k, 2 * k, 5 * k); ctx.fillRect(x - 1 * k, y + 3 * k, 2 * k, 2 * k); }
    else if (kind === 'attack') { ctx.moveTo(x - 7 * k, y - 7 * k); ctx.lineTo(x + 7 * k, y + 7 * k); ctx.moveTo(x + 7 * k, y - 7 * k); ctx.lineTo(x - 7 * k, y + 7 * k); ctx.stroke(); }
    else if (kind === 'retreat') { ctx.moveTo(x + 2 * k, y - 8 * k); ctx.lineTo(x - 6 * k, y); ctx.lineTo(x + 2 * k, y + 8 * k); ctx.moveTo(x + 8 * k, y - 8 * k); ctx.lineTo(x, y); ctx.lineTo(x + 8 * k, y + 8 * k); ctx.stroke(); }
    else if (kind === 'omw') { ctx.moveTo(x - 7 * k, y); ctx.lineTo(x + 6 * k, y); ctx.moveTo(x, y - 6.5 * k); ctx.lineTo(x + 7 * k, y); ctx.lineTo(x, y + 6.5 * k); ctx.stroke(); }
    else { ctx.moveTo(x, y - 8 * k); ctx.lineTo(x, y + 8 * k); ctx.moveTo(x - 8 * k, y); ctx.lineTo(x + 8 * k, y); ctx.stroke(); }
  }
  function addPing(kind, x, y, who) {
    if (H.wpings.length >= 5) H.wpings.shift();
    H.wpings.push({ kind, x, y, t: 0 });
    const P = PING[kind] || PING.danger;
    H.chat.unshift({ s: who ? `${who}: ${P[0]}` : P[0], col: P[1], t: 3.4 });
    if (H.chat.length > 2) H.chat.length = 2;
  }
  // A local echo shows up the moment the finger lifts; the same ping coming back from the host is skipped.
  function localPing(kind, x, y) {
    if (!H || !G) return false;
    const now = H.t; H.pingLog = H.pingLog.filter(t => now - t < 5);
    if (H.pingLog.length >= 4) { banner('Slow down a little', { pri: 1, dur: .9 }); Sound.play('cancel'); return false; }
    H.pingLog.push(now); H.echoAt = now;
    addPing(kind, x, y, 'You');
    Sound.play('tick');
    return true;
  }
  function onPing(e) {
    const u = H.byId.get(e.u), me = G.me;
    if (!u || u.team !== me.team) return;
    if (e.u === me.id && H.t - H.echoAt < 1.2) return;
    addPing(e.kind, e.x, e.y, e.u === me.id ? 'You' : Sim.charOf(u.team, u.champ).name);
    Sound.play('tick');
  }
  function drawMapPings(M, kx, ky) {
    for (const p of H.wpings) {
      const q = Math.min(1, p.t / 1), X = M.x + p.x * kx, Y = M.y + p.y * ky, col = (PING[p.kind] || PING.danger)[1];
      ctx.globalAlpha = 1 - q * .6; disc(X, Y, 3 + q * 9); ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.stroke(); ctx.globalAlpha = 1;
      diamond(X, Y, 3.2); ctx.fillStyle = col; ctx.fill();
    }
  }
  function drawWorldPings(dt, s, me) {
    for (let i = H.wpings.length - 1; i >= 0; i--) {
      const p = H.wpings[i]; p.t += dt;
      if (p.t >= 3.2) { H.wpings.splice(i, 1); continue; }
      const P = PING[p.kind] || PING.danger, col = P[1], X = sx(p.x), Y = sy(p.y), fade = Math.min(1, (3.2 - p.t) * 2.5), inn = U.compact ? 34 : 40, onS = X > 44 + 4 && X < VW - 44 - 4 && Y > 34 && Y < VH - 18;
      ctx.globalAlpha = fade;
      if (onS) {
        const q = (p.t % .8) / .8;
        if (!calm) { ctx.beginPath(); ctx.ellipse(X, Y, 18 + q * 30, (18 + q * 30) * TILT, 0, 0, TAU); ctx.strokeStyle = col; ctx.lineWidth = 2 * (1 - q) + .5; ctx.stroke(); }
        const drop = calm ? 0 : Math.pow(Math.max(0, 1 - p.t / .2), 2) * 26;
        disc(X, Y - 18 - drop, 13); ctx.fillStyle = INK; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.stroke();
        pingGlyph(p.kind, X, Y - 18 - drop, .68, col);
      } else {
        const cx = VW / 2, cy = VH / 2, dx = X - cx, dy = Y - cy, kxx = dx ? (VW / 2 - inn - 10) / Math.abs(dx) : 1e9, kyy = dy ? (VH / 2 - inn) / Math.abs(dy) : 1e9, kk = Math.min(kxx, kyy), ax = cx + dx * kk, ay = cy + dy * kk, an = Math.atan2(dy, dx);
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(ax + Math.cos(an) * 19, ay + Math.sin(an) * 19); ctx.lineTo(ax + Math.cos(an + 1.9) * 10, ay + Math.sin(an + 1.9) * 10); ctx.lineTo(ax + Math.cos(an - 1.9) * 10, ay + Math.sin(an - 1.9) * 10); ctx.closePath(); ctx.fill();
        disc(ax, ay, 12); ctx.fillStyle = INK; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke();
        pingGlyph(p.kind, ax, ay, .6, col);
      }
      ctx.globalAlpha = 1;
    }
  }
  function drawChat(dt) {
    let y = U.shop.y + U.shop.r + (H.first ? 26 : 19) + H.feed.length * 21 + 8;
    const lh = left();
    ctx.font = fw(600, 13); ctx.textAlign = lh ? 'right' : 'left'; ctx.textBaseline = 'middle';
    for (let i = 0; i < H.chat.length; i++) {
      const c = H.chat[i]; c.t -= dt;
      if (c.t <= 0) { H.chat.splice(i--, 1); continue; }
      ctx.globalAlpha = Math.min(1, c.t * 3);
      label(c.s, lh ? VW - 46 : 46, y, c.col, 3);
      y += 16;
    }
    ctx.globalAlpha = 1;
  }
  function drawRadial(dt) {
    const P = Ctl.ping;
    H.radial += ((P ? 1 : 0) - H.radial) * Math.min(1, dt * 26);
    if (!P) { H.radial = 0; return; }
    const R = radialR(), e = calm ? 1 : outBack(H.radial), cx = P.cx, cy = P.cy, rO = R * e;
    disc(cx, cy, rO + 30); ctx.fillStyle = 'rgba(7,9,14,.8)'; ctx.fill(); ctx.strokeStyle = HAIR; ctx.lineWidth = 1; ctx.stroke();
    ctx.strokeStyle = 'rgba(148,167,194,.22)'; ctx.lineWidth = 1; ctx.beginPath();
    for (const a of [.25, .75, 1.25, 1.75]) { const an = a * Math.PI; ctx.moveTo(cx + Math.cos(an) * 20, cy + Math.sin(an) * 20); ctx.lineTo(cx + Math.cos(an) * (rO + 28), cy + Math.sin(an) * (rO + 28)); }
    ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [k, ox, oy] of Ctl.radial) {
      const [name, col] = PING[k], on = P.sel === k, x = cx + ox * rO, y = cy + oy * rO, sc = on ? 1.16 : 1;
      if (on) { disc(x, y - 4, 18); ctx.fillStyle = col; ctx.fill(); }
      pingGlyph(k, x, y - 4, .8 * sc, on ? INK : col);
      ctx.font = fw(600, 12); label(name, x, y + 16, on ? col : PAPER, 3);
    }
    disc(cx, cy, 15); ctx.fillStyle = INK; ctx.fill(); ctx.strokeStyle = HAIR; ctx.stroke();
    if (!P.sel) { ctx.font = fw(500, 10.5); ctx.fillStyle = MUTE; ctx.fillText('Slide', cx, cy + .5, 28); }
  }

  function drawAbility(i, dt, me) {
    const a = me.kit[i], B = U.ab[i], locked = i === 2 && me.lvl < 3, cd = Math.max(0, me.cd[i]), rec = Math.max(0, me.recast[i]);
    const recast = rec > 0 && !!a.recast, onCd = cd > 0 && !recast, charge = me.charge && me.charge.slot === i ? me.charge : null, ready = !onCd && !locked;
    const held = Ctl.aim !== null && Ctl.aim.slot === i, winding = !!a.windup && !!me.chan && me.chan.slot === i, acc = SIDE_ACC[me.team];
    if (cd > H.prev[i] + .001) H.cdMax[i] = cd;
    if (cd <= 0 && H.prev[i] > 0 && !locked) { H.pop[i] = 1; H.spark[i] = 0; H.sheen[i] = 0; Sound.play('ready'); }
    H.prev[i] = cd;
    if (rec > H.recPrev[i] + .001) H.recMax[i] = rec;
    H.recPrev[i] = rec;
    H.press[i] = pressStep(H.press[i], held, dt);
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
      if (!calm && H.sheen[i] >= 0) { H.sheen[i] += dt * 2.6; if (H.sheen[i] >= 1) H.sheen[i] = -1; else sweep(x, y, r, H.sheen[i]); }
      else if (!calm && i === 2 && quality > 0 && (H.t % 5) < .4) sweep(x, y, r, (H.t % 5) / .4);
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
    } else if (H.guide && s.t < 20) { disc(left() ? VW - 122 : 122, VH - 86, 52); ctx.strokeStyle = 'rgba(233,237,244,.22)'; ctx.lineWidth = 1.2; ctx.stroke(); }
  }

  function drawFeed(dt) {
    let y = U.shop.y + U.shop.r + (H.first ? 26 : 19);
    const lh = left();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < H.feed.length; i++) {
      const f = H.feed[i]; f.t -= dt; f.age += dt;
      if (f.t <= 0) { H.feed.splice(i--, 1); continue; }
      ctx.globalAlpha = Math.min(1, f.t * 3) * (f.mine ? 1 : .72);
      const slide = Math.max(0, 1 - f.age / .14) * 60, ax = lh ? VW - 44 - 66 + slide : 44 - slide, mark = f.aT === 0 ? GOLD : f.aT === 1 ? CRIM : PAPER;
      put(panel(66, 19, 4, GLASS, f.mine ? mark : null), ax, y - 9.5);
      if (f.aS) blit(f.aS, ax + 13, y, 7.5); else { diamond(ax + 13, y, 5); ctx.fillStyle = MUTE; ctx.fill(); }
      ctx.strokeStyle = mark; ctx.lineWidth = 1.6; ctx.lineCap = 'butt'; ctx.lineJoin = 'miter'; ctx.beginPath(); ctx.moveTo(ax + 29, y - 4); ctx.lineTo(ax + 34, y); ctx.lineTo(ax + 29, y + 4); ctx.stroke();
      if (f.bS) blit(f.bS, ax + 51, y, 7.5);
      y += 21;
    }
    ctx.globalAlpha = 1;
  }

  const HINTS = () => [`${left() ? 'Right' : 'Left'} thumb: move`, 'Hold the big coin: attack', 'Drag an ability to aim'];
  function drawHint(dt, me) {
    const h = H.hint; if (!h || !me.alive || Ctl.aim || H.banner) return;
    h.t += dt;
    if ((h.i === 0 && Ctl.stick && h.t > .8) || (h.i === 1 && Ctl.atk !== null && h.t > .5) || (h.i === 2 && (me.stats.casts > 0 || h.t > 7)) || h.t > 8) { h.i++; h.t = 0; }
    if (h.i >= 3) { H.hint = null; return; }
    const s = HINTS()[h.i]; ctx.font = fw(500, 14); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = Math.ceil(ctx.measureText(s).width + 24) & ~1, x = Math.round(VW / 2 - w / 2), y = VH - 34;
    ctx.globalAlpha = Math.min(1, h.t * 4) * .94;
    put(panel(w, 24, 5), x, y);
    ctx.fillStyle = PAPER; ctx.fillText(s, VW / 2, y + 12.5); ctx.globalAlpha = 1;
  }

  // Practice walks through the controls one step at a time, each cleared by actually doing it.
  const TIPS = [
    { s: () => `Move with your ${left() ? 'right' : 'left'} thumb`, done: () => !!Ctl.stick, hold: .7 },
    { s: () => 'Hold the big coin to attack', done: () => Ctl.atk !== null && Ctl.atkMode === 'champ', hold: .5 },
    { s: () => 'Hold the small coin to hit only minions, for last hits', done: () => Ctl.atk !== null && Ctl.atkMode === 'minion', hold: .3 },
    { s: () => 'Hold the tower button to hit towers', done: () => Ctl.atk !== null && Ctl.atkMode === 'tower', hold: .3 },
    { s: () => 'Drag an ability to aim, then let go', done: me => me.stats.casts > 0, hold: 0 },
    { s: () => 'Tap the shop to buy items', done: () => shopOpen(), hold: 0 },
    { s: () => 'Hold the flag and slide to ping your team', done: () => H.pingLog.length > 0, hold: 0 },
    { s: () => 'Drag from Beacon to light up the fog', done: me => Hud.beaconLeft(me) < beaconMax(), hold: 0 },
    { s: () => 'All set. Stay as long as you like', done: () => false, hold: 0, end: 4 },
  ];
  function drawTips(dt, me) {
    const T0 = H.tips; if (!T0 || T0.i >= TIPS.length || !me.alive || H.banner) return;
    const tip = TIPS[T0.i]; T0.t += dt;
    if (tip.end ? T0.t > tip.end : tip.done(me) && (T0.held = (T0.held || 0) + dt) >= tip.hold) { T0.i++; T0.t = 0; T0.held = 0; Sound.play('coin'); return; }
    const s = tip.s(); ctx.font = fw(600, U.compact ? 13.5 : 15); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = Math.ceil(ctx.measureText(s).width + 66) & ~1, x = Math.round(VW / 2 - w / 2), y = U.compact ? 36 : 40, a = Math.min(1, T0.t * 5);
    ctx.globalAlpha = a; put(panel(w, 26, 5, GLASS, SIDE_ACC[me.team]), x, y - (1 - a) * 6);
    diamond(x + 14, y + 13, 3.6); ctx.fillStyle = SIDE_ACC[me.team]; ctx.fill();
    ctx.fillStyle = PAPER; ctx.fillText(s, VW / 2, y + 13.5); ctx.globalAlpha = 1;
    ctx.font = fw(500, 10.5); ctx.textAlign = 'right'; label(`${T0.i + 1}/${TIPS.length}`, x + w - 8, y + 13.5, MUTE, 0);
  }

  // Death is the shopping window: the shop opens below the timer on its own.
  function drawDeath(me) {
    ctx.fillStyle = 'rgba(5,6,10,.5)'; ctx.fillRect(0, 0, VW, VH);
    const cx = VW / 2, y = U.compact ? 48 : 58, R = U.compact ? 12 : 15, ang = calm ? 0 : H.t * 1.8, ab = Math.abs(Math.cos(ang)), str = `BACK IN ${Math.ceil(me.respawn)}`, sz = U.compact ? 25 : 31;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = Deco.disp(sz);
    const w = ctx.measureText(str).width, x0 = cx - (w + R * 2 + 10) / 2;
    if (ab > .05) { const h = H.portrait.S * R / H.portrait.R; ctx.drawImage(H.portrait.c, x0 + R - h * ab / 2, y - h / 2, h * ab, h); }
    Deco.text(ctx, str, x0 + R * 2 + 10, y, sz, SIDE_ACC[me.team], 2);
    ctx.textAlign = 'center';
  }
  function deathShop(me) {
    if (me.alive === !H.wasDead) return;
    H.wasDead = !me.alive;
    const f = $('shop');
    if (H.wasDead) { if (G.outro || G.ended) return; H.shopAuto = true; f.classList.add('dead'); f.classList.remove('hide'); shopBuild(); }
    else { f.classList.remove('dead'); if (H.shopAuto) f.classList.add('hide'); H.shopAuto = false; }
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
    offset((left() ? -320 : 320) * away, 0); lastHitTick(dt, me, s); drawAttack(dt, me); for (let i = 0; i < 3; i++) drawAbility(i, dt, me); drawBeacon(dt, me); drawRipples(dt);
    offset(0, 0);
    if (want) drawWorldPings(dt, s, me);
    drawBeaconAim(me);
    deathShop(me);
    if (!me.alive) drawDeath(me);
    drawChat(dt); drawHint(dt, me); drawTips(dt, me); drawAimCard(me); drawBanner(dt); drawRadial(dt);
    H.frame++;
    if (shopOpen() && H.frame % 10 === 0) shopSync(false);
    if (H.frame % 12 === 0) evoSync(me, s);
    if (H.tips && H.frame % 6 === 0) practiceSync(s, me);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---------- item shop ----------
  const shopOpen = () => !$('shop').classList.contains('hide');
  const itemDb = () => Sim.ITEMS || [];
  const itemBy = id => itemDb().find(i => i.id === id) || null;
  // Slots are three entries of ids (or empties); tolerate either a full or a packed array.
  function slotsOf(me) { const v = (me.items || []).map(i => i && i.id ? i.id : i || null); while (v.length < 3) v.push(null); return v.slice(0, 3); }
  const costOf = (me, it) => Sim.itemPrice ? Sim.itemPrice(me, it.id) : it.cost;
  function canBuy(me, it) { const p = costOf(me, it); return p !== null && me.gold >= p; }
  const canAfford = me => itemDb().some(it => canBuy(me, it));
  const recommendedOf = me => Sim.recommended ? (Sim.recommended(me.champ, me.build) || []) : [];
  const TAG_ICON = {
    damage: '<path d="M12 2 19 9l-7 13L5 9Z"/>', attack: '<path d="M12 2 19 9l-7 13L5 9Z"/>', ability: '<path d="m12 2 3 7 7 1-5 5 1.5 7L12 18l-6.5 4L7 15l-5-5 7-1Z"/>', magic: '<path d="m12 2 3 7 7 1-5 5 1.5 7L12 18l-6.5 4L7 15l-5-5 7-1Z"/>',
    armor: '<path d="M12 2 21 5v7c0 5-4 8-9 10-5-2-9-5-9-10V5Z"/>', armour: '<path d="M12 2 21 5v7c0 5-4 8-9 10-5-2-9-5-9-10V5Z"/>', tank: '<path d="M12 2 21 5v7c0 5-4 8-9 10-5-2-9-5-9-10V5Z"/>', guard: '<path d="M12 2 21 5v7c0 5-4 8-9 10-5-2-9-5-9-10V5Z"/>',
    mobility: '<path d="M3 4h5l7 8-7 8H3l7-8Zm9 0h5l7 8-7 8h-5l7-8Z"/>', support: '<path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7Z"/>', health: '<path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7Z"/>', heal: '<path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7Z"/>', sustain: '<path d="M12 2c4 6 7 9 7 13a7 7 0 0 1-14 0c0-4 3-7 7-13Z"/>', lifesteal: '<path d="M12 2c4 6 7 9 7 13a7 7 0 0 1-14 0c0-4 3-7 7-13Z"/>',
    speed: '<path d="M3 4h5l7 8-7 8H3l7-8Zm9 0h5l7 8-7 8h-5l7-8Z"/>', move: '<path d="M3 4h5l7 8-7 8H3l7-8Zm9 0h5l7 8-7 8h-5l7-8Z"/>', haste: '<path d="M13 2 5 13h6l-1 9 9-12h-6Z"/>', cooldown: '<path d="M13 2 5 13h6l-1 9 9-12h-6Z"/>',
    crit: '<path d="M11 2h2v7h-2zm0 13h2v7h-2zM2 11h7v2H2zm13 0h7v2h-7z"/><circle cx="12" cy="12" r="2.4"/>', vision: '<path d="M1 12c4-6 8-8 11-8s7 2 11 8c-4 6-8 8-11 8S5 18 1 12Zm11 4a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" fill-rule="evenodd"/>',
  };
  function itemIcon(it) {
    for (const t of (it.tags || [])) if (TAG_ICON[t]) return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">${TAG_ICON[t]}</svg>`;
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M12 2 20 7v10l-8 5-8-5V7Z"/></svg>`;
  }
  function itemBtn(it, rec) {
    const b = document.createElement('button');
    b.className = `it t${it.tier || 1}`; b.dataset.id = it.id;
    b.innerHTML = `<span class="ic">${itemIcon(it)}</span><span class="tx"><b>${it.name}</b><span class="c"><i class="gc"></i><span class="p">${it.cost}</span></span></span>${rec ? '<u class="rec" aria-hidden="true"></u>' : ''}`;
    b.setAttribute('aria-label', `${it.name}, ${it.cost} gold${rec ? ', recommended' : ''}`);
    b.onpointerdown = () => { H.shopSel = { item: it.id }; Sound.play('tick'); shopFoot(); };
    return b;
  }
  function shopBuild() {
    const me = G.me, list = $('shList');
    list.textContent = '';
    const db = itemDb();
    if (!db.length) { list.innerHTML = '<p class="shnone">The shop is stocking its shelves.</p>'; $('shSlots').textContent = ''; $('shFoot').textContent = ''; return; }
    const rec = [...new Set(recommendedOf(me))].slice(0, 6).map(itemBy).filter(Boolean), head = t => { const h = document.createElement('h4'); h.textContent = t; return h; }, grid = () => { const g = document.createElement('div'); g.className = 'items'; return g; };
    if (rec.length) { list.append(head('Recommended for your build')); const g = grid(); rec.forEach(it => g.append(itemBtn(it, true))); list.append(g); }
    const tiers = [...new Set(db.map(i => i.tier || 1))].sort((a, b) => a - b);
    tiers.forEach((t, n) => { list.append(head(tiers.length > 1 ? `Tier ${t}` : 'All items')); const g = grid(); db.filter(i => (i.tier || 1) === t).forEach(it => g.append(itemBtn(it, false))); list.append(g); });
    const slots = $('shSlots'); slots.textContent = '';
    for (let i = 0; i < 3; i++) { const b = document.createElement('button'); b.className = 'slot'; b.dataset.i = i; b.onpointerdown = () => { const id = slotsOf(G.me)[i]; if (id) { H.shopSel = { slot: i }; Sound.play('tick'); shopFoot(); } }; slots.append(b); }
    H.shopSel = H.shopSel && (H.shopSel.item ? itemBy(H.shopSel.item) : slotsOf(me)[H.shopSel.slot]) ? H.shopSel : null;
    H.shopKey = ''; shopSync(true);
  }
  function nextRec(me) { for (const id of recommendedOf(me)) { const it = itemBy(id); if (it && costOf(me, it) !== null) return it; } return null; }
  function shopFoot() {
    if (!H || !G) return;
    const me = G.me, foot = $('shFoot'), sel = H.shopSel, slots = slotsOf(me);
    let it = sel && sel.item ? itemBy(sel.item) : sel && slots[sel.slot] ? itemBy(slots[sel.slot]) : null;
    const slotMode = !!(sel && sel.slot !== undefined && it);
    if (!it) it = nextRec(me);
    document.querySelectorAll('#shList .it').forEach(b => b.classList.toggle('sel', !!it && !slotMode && b.dataset.id === it.id));
    document.querySelectorAll('#shSlots .slot').forEach((b, i) => b.classList.toggle('sel', slotMode && sel.slot === i));
    if (!it) { foot.innerHTML = '<p class="shd"><b>All set</b>Your three slots are full of what this build wants.</p>'; return; }
    const from = it.upgradesFrom && itemBy(it.upgradesFrom), info = `<p class="shd"><b>${it.name}</b>${it.d}${from ? `<em>Upgrades ${from.name}</em>` : ''}</p>`;
    if (slotMode) {
      foot.innerHTML = info + `<button class="go" id="shAct">Sell</button>`;
      const b = $('shAct'); b.onpointerdown = () => { G.me.q.push({ t: 'sell', slot: sel.slot }); H.shopSel = null; Sound.play('coin'); setTimeout(() => shopSync(true), 40); };
      return;
    }
    const cost = costOf(me, it), own = slots.includes(it.id), can = canBuy(me, it);
    foot.innerHTML = info + `<button class="go${can ? ' hot' : ' off'}" id="shAct">${own ? 'Owned' : cost === null ? 'No slot free' : `Buy <span class="c"><i class="gc"></i>${cost}</span>`}</button>`;
    const b = $('shAct');
    b.onpointerdown = () => { if (!canBuy(G.me, it)) { Sound.play('cancel'); return; } G.me.q.push({ t: 'buy', id: it.id }); H.shopSel = null; Sound.play('coin'); const cell = document.querySelector(`#shList .it[data-id="${it.id}"]`); if (cell) { cell.classList.remove('bought'); void cell.offsetWidth; cell.classList.add('bought'); } setTimeout(() => shopSync(true), 40); };
  }
  function shopSync(force) {
    if (!H || !G || !shopOpen() || !itemDb().length) return;
    const me = G.me, slots = slotsOf(me), g = Math.floor(me.gold), key = slots.join() + '|' + Math.floor(g / 5) + '|' + (H.shopSel ? JSON.stringify(H.shopSel) : '');
    $('shGold').textContent = g;
    if (!force && key === H.shopKey) return;
    H.shopKey = key;
    document.querySelectorAll('#shList .it').forEach(b => { const it = itemBy(b.dataset.id); b.classList.toggle('can', canBuy(me, it)); b.classList.toggle('own', slots.includes(it.id)); const pr = costOf(me, it), el = b.querySelector('.p'); if (el && pr !== null) el.textContent = pr; });
    document.querySelectorAll('#shSlots .slot').forEach((b, i) => {
      const it = itemBy(slots[i]); b.classList.toggle('full', !!it);
      b.innerHTML = it ? itemIcon(it) : '<i></i>';
      b.setAttribute('aria-label', it ? `${it.name}, tap to sell` : 'Empty slot');
    });
    shopFoot();
  }
  Hud.shopOpen = shopOpen;
  Hud.closeShop = () => $('shop').classList.add('hide');
  Hud.toggleShop = () => {
    const f = $('shop'); f.classList.toggle('hide'); f.classList.toggle('dead', !!G && !G.me.alive);
    H.shopAuto = false;
    if (!f.classList.contains('hide')) { shopBuild(); H.tipShop = true; Sound.play('shopOpen'); } else Sound.play('shopClose');
  };

  // ---------- evolve: two taps' worth of choice, never in the way ----------
  const EVOLVE_AT = [4, 8];
  function evoPending(me) {
    const ev = Sim.KITS[me.champ] && Sim.KITS[me.champ].evolves;
    if (!ev || !me.evolved) return -1;
    for (let t = 0; t < 2; t++) if (me.lvl >= EVOLVE_AT[t] && me.evolved[t] === -1 && !H.evoDone[t] && ev[t]) return t;
    return -1;
  }
  function evoSync(me, s) {
    const t = me.alive && !shopOpen() && !paused ? evoPending(me) : -1, box = $('evo');
    if (t !== H.evoLast) { H.evoLast = t; H.evoT = H.t; H.evoShut = false; H.evoKey = ''; }
    if (t >= 0 && !H.evoShut && H.t - H.evoT > 8) H.evoShut = true;
    if (t < 0) { H.evoKey = ''; box.classList.add('hide'); box.textContent = ''; return; }
    const key = `${t}|${H.evoShut ? 1 : 0}`;
    if (key === H.evoKey) return;
    H.evoKey = key; box.textContent = '';
    box.classList.remove('hide');
    box.classList.toggle('shut', H.evoShut);
    if (H.evoShut) {
      const pill = document.createElement('button'); pill.className = 'evpill'; pill.textContent = 'Evolve';
      pill.onpointerdown = () => { H.evoShut = false; H.evoT = H.t; H.evoKey = ''; Sound.play('tap'); evoSync(G.me, G.s); };
      box.append(pill);
      return;
    }
    const opts = Sim.KITS[me.champ].evolves[t];
    opts.forEach((o, i) => {
      const b = document.createElement('button'); b.className = 'ev'; b.style.setProperty('--i', i);
      b.innerHTML = `<b>${o.name}</b><small>${o.d}</small>`;
      b.setAttribute('aria-label', `Evolve: ${o.name}. ${o.d}`);
      b.onpointerdown = e => { e.stopPropagation(); if (!G) return; G.me.q.push({ t: 'evolve', tier: t, choice: i }); H.evoDone[t] = true; H.evoKey = 'x'; box.classList.add('hide'); box.textContent = ''; H.lvlFx = 1; Sound.play('level'); banner(o.name, { pri: 4, sub: 'Evolved', team: G.me.team, dur: 1.6 }); };
      box.append(b);
    });
  }

  // ---------- practice ----------
  function practiceSync() {
    const bar = $('prac'), on = !!H.tips && !shopOpen() && !paused;
    if ((on ? 1 : 0) === (+bar.dataset.on || 0)) return;
    bar.dataset.on = on ? 1 : 0; bar.classList.toggle('hide', !on);
  }
  Hud.practice = op => { if (!G) return; G.me.q.push({ t: 'practice', op }); Sound.play('coin'); };

  Hud.radialR = radialR; Hud.radialOpen = () => { if (H) H.radial = .15; };
  Hud.ping = localPing;
  Hud.beaconLeft = beaconLeft;
  Hud.beaconPlaced = pt => { if (H) ripple(U.beacon.x, U.beacon.y, U.beacon.r, SIDE_ACC[G.me.team]); Sound.play('clink'); };
  Hud.atkPressed = mode => { if (!H) return; const B = mode === 'minion' ? U.atkM : mode === 'tower' ? U.atkT : U.atk; if (mode === 'champ') H.atkPress = 1; else H.atkHeld[mode] = 1; H.atkPop[mode] = 1; ripple(B.x, B.y, B.r, SIDE_ACC[G.me.team]); };

  // ---------- small helpers for the controls ----------
  Hud.deny = i => { if (H) H.deny[i] = 1; };
  Hud.flash = i => { if (H) H.flash[i] = 1; };
  Hud.press = i => { if (H) { H.press[i] = 1; ripple(U.ab[i].x, U.ab[i].y, U.ab[i].r, SIDE_ACC[G.me.team]); } };
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
        Hud.coinTo(tr.querySelector('canvas'), Art.champCoin(c.champ, c.team, c.tier, 26, c.finish));
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
    Hud.closeShop();
    Hud.scoreTable($('pBoard'), G.s, G.me);
    if (Hud.syncToggles) Hud.syncToggles();
    $('pause').classList.remove('hide');
    Sound.play('tap');
  };

  return { hud, initHud, hudDraw, uiEvent };
})();
