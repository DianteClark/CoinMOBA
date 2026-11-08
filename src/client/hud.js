// Comic kit shared by the HUD and the menus: palette, display font, ink helpers and the two-faced Flipside coin.
const Comic = (() => {
  const INK = '#14102a', PAPER = '#fff7df', SUN = '#ffd51e', ULTRA = '#1c37d8', ULTRA2 = '#101f9c', SKY = '#5f8dff', VIOLET = '#6b1fd6', VIOLET2 = '#2e0a6e', TOXIC = '#8dff2a', BLOOD = '#ff5a1f';
  const TAU = Math.PI * 2;
  // Bangers has one weight, so bold is only asked of the fallback face used before it loads.
  let bangers = false; const cache = {};
  const disp = s => cache[s] || (cache[s] = bangers ? `${s}px Bangers,Impact,sans-serif` : `bold ${s}px Impact,"Arial Narrow",sans-serif`);
  try { document.fonts.load('40px Bangers').then(l => { if (l && l.length) { bangers = true; for (const k in cache) delete cache[k]; } }).catch(() => { }); } catch (e) { }

  // Inked headline text: offset shadow, outline, fill.
  function text(g, s, x, y, size, fill, line = 4, shadow = 3) {
    g.font = disp(size); g.lineJoin = 'round'; g.lineWidth = line; g.strokeStyle = INK;
    if (shadow) { g.fillStyle = INK; g.fillText(s, x + shadow, y + shadow); g.strokeText(s, x + shadow, y + shadow); }
    g.strokeText(s, x, y); g.fillStyle = fill; g.fillText(s, x, y);
  }
  function starPath(g, n, r1, r2, rot = 0) { g.beginPath(); for (let i = 0; i < n * 2; i++) { const r = i % 2 ? r2 : r1, a = rot + i / (n * 2) * TAU; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); }
  function glint(g, x, y, r, col = '#fff') { g.fillStyle = col; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, d = i % 2 ? r * .2 : r; g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * d, y + Math.sin(a) * d); } g.closePath(); g.fill(); }

  const ink = (g, build, fill, lw = .035) => { g.beginPath(); build(); if (fill) { g.fillStyle = fill; g.fill(); } g.strokeStyle = INK; g.lineWidth = lw; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); };
  const flat = (g, build, fill) => { g.beginPath(); build(); g.fillStyle = fill; g.fill(); };
  const circle = (g, r) => () => g.arc(0, 0, r, 0, TAU);
  const halftone = (g, x0, y0, x1, y1, col, gap = .075) => { g.fillStyle = col; for (let y = y0, j = 0; y < y1; y += gap, j++) for (let x = x0 + (j % 2 ? gap / 2 : 0); x < x1; x += gap) { const f = Math.max(0, (y - y0) / (y1 - y0)); g.beginPath(); g.arc(x, y, gap * .42 * f, 0, TAU); g.fill(); } };

  // The heroic face: ultramarine and sunshine. A sunny, open-faced champion with a shock of gold hair and an eye mask.
  function heroFace(g) {
    ink(g, circle(g, 1), SUN, .05);
    for (let i = 0; i < 40; i++) { g.save(); g.rotate(i / 40 * TAU); g.fillStyle = INK; g.fillRect(-.012, -.985, .024, .075); g.restore(); }
    g.save(); g.beginPath(); g.arc(0, 0, .86, 0, TAU); g.clip();
    g.fillStyle = ULTRA; g.fillRect(-1, -1, 2, 2);
    for (let i = 0; i < 14; i++) { g.save(); g.rotate(i / 14 * TAU + .1); flat(g, () => { g.moveTo(0, -.1); g.lineTo(-.1, -1); g.lineTo(.1, -1); g.closePath(); }, '#3f66ff'); g.restore(); }
    halftone(g, -1, .1, 1, 1, ULTRA2);
    g.restore();
    ink(g, circle(g, .86), null, .04);
    // shoulders, with a white cape collar and a yellow chevron
    ink(g, () => { g.moveTo(-.8, .86); g.quadraticCurveTo(-.74, .44, -.34, .42); g.lineTo(.34, .42); g.quadraticCurveTo(.74, .44, .8, .86); g.quadraticCurveTo(0, 1, -.8, .86); }, ULTRA2);
    for (const s of [-1, 1]) ink(g, () => { g.moveTo(s * .1, .46); g.lineTo(s * .58, .3); g.lineTo(s * .6, .64); g.quadraticCurveTo(s * .34, .6, s * .1, .72); g.closePath(); }, '#fff');
    ink(g, () => { g.moveTo(-.2, .44); g.lineTo(0, .8); g.lineTo(.2, .44); g.lineTo(.1, .42); g.lineTo(0, .58); g.lineTo(-.1, .42); g.closePath(); }, SUN);
    // broad, open face
    ink(g, () => { g.moveTo(-.42, -.3); g.quadraticCurveTo(-.48, .08, -.4, .26); g.quadraticCurveTo(-.3, .56, 0, .58); g.quadraticCurveTo(.3, .56, .4, .26); g.quadraticCurveTo(.48, .08, .42, -.3); g.closePath(); }, '#ffd0a0');
    flat(g, () => { g.moveTo(.12, -.3); g.lineTo(.42, -.3); g.quadraticCurveTo(.48, .08, .4, .26); g.quadraticCurveTo(.3, .56, .03, .58); g.quadraticCurveTo(.26, .3, .12, -.3); }, '#efa66a');
    // gold hair, swept up in big comic spikes
    ink(g, () => { g.moveTo(-.46, -.16); g.lineTo(-.6, -.44); g.lineTo(-.42, -.46); g.lineTo(-.52, -.76); g.lineTo(-.22, -.62); g.lineTo(-.16, -.94); g.lineTo(.08, -.68); g.lineTo(.32, -.92); g.lineTo(.36, -.6); g.lineTo(.62, -.66); g.lineTo(.48, -.36); g.lineTo(.46, -.14); g.quadraticCurveTo(.22, -.34, 0, -.3); g.quadraticCurveTo(-.26, -.32, -.46, -.16); g.closePath(); }, SUN);
    flat(g, () => { g.moveTo(-.42, -.3); g.lineTo(-.38, -.52); g.lineTo(-.2, -.48); g.lineTo(-.14, -.74); g.lineTo(-.04, -.5); g.quadraticCurveTo(-.26, -.42, -.42, -.3); }, '#fff2a6');
    // ultramarine eye mask with bright, wide eyes
    ink(g, () => { g.moveTo(-.46, -.16); g.quadraticCurveTo(-.24, -.3, 0, -.17); g.quadraticCurveTo(.24, -.3, .46, -.16); g.lineTo(.42, .03); g.quadraticCurveTo(.22, .12, .06, 0); g.lineTo(0, -.06); g.lineTo(-.06, 0); g.quadraticCurveTo(-.22, .12, -.42, .03); g.closePath(); }, ULTRA);
    for (const s of [-1, 1]) { ink(g, () => g.ellipse(s * .23, -.08, .12, .085, 0, 0, TAU), '#fff', .028); flat(g, () => g.arc(s * .21, -.08, .04, 0, TAU), INK); }
    // nose and a big confident grin
    g.strokeStyle = INK; g.lineWidth = .025; g.lineCap = 'round'; g.beginPath(); g.moveTo(-.02, .06); g.quadraticCurveTo(.08, .18, -.02, .19); g.stroke();
    ink(g, () => { g.moveTo(-.26, .27); g.quadraticCurveTo(0, .34, .26, .27); g.quadraticCurveTo(.16, .49, 0, .49); g.quadraticCurveTo(-.16, .49, -.26, .27); }, '#fff', .03);
    g.strokeStyle = INK; g.lineWidth = .018; g.beginPath(); g.moveTo(-.2, .34); g.lineTo(.2, .34); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = .05; g.lineCap = 'round'; g.beginPath(); g.arc(0, 0, .93, Math.PI * 1.1, Math.PI * 1.42); g.stroke();
  }

  // The villainous face: violet and toxic green, a horned schemer behind a jagged rim.
  function villainFace(g) {
    ink(g, () => { const n = 26; for (let i = 0; i < n * 2; i++) { const r = i % 2 ? .9 : 1.02, a = i / (n * 2) * TAU; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); }, TOXIC, .05);
    g.save(); g.beginPath(); g.arc(0, 0, .83, 0, TAU); g.clip();
    g.fillStyle = VIOLET2; g.fillRect(-1, -1, 2, 2);
    for (let i = 0; i < 10; i++) { g.save(); g.rotate(i / 10 * TAU + .3); flat(g, () => { g.moveTo(-.06, -.1); g.lineTo(-.13, -.5); g.lineTo(-.03, -.48); g.lineTo(-.09, -1); g.lineTo(.13, -.44); g.lineTo(.03, -.46); g.lineTo(.08, -.1); g.closePath(); }, i % 2 ? VIOLET : '#3fbf12'); g.restore(); }
    halftone(g, -1, .1, 1, 1, '#000', .08);
    g.restore();
    ink(g, circle(g, .83), null, .04);
    // horns
    for (const s of [-1, 1]) ink(g, () => { g.moveTo(s * .2, -.44); g.quadraticCurveTo(s * .7, -.5, s * .66, -.92); g.quadraticCurveTo(s * .5, -.68, s * .32, -.7); g.closePath(); }, BLOOD);
    // spiked collar
    ink(g, () => { g.moveTo(-.74, .84); g.lineTo(-.62, .38); g.lineTo(-.42, .56); g.lineTo(-.28, .34); g.lineTo(.28, .34); g.lineTo(.42, .56); g.lineTo(.62, .38); g.lineTo(.74, .84); g.quadraticCurveTo(0, 1, -.74, .84); }, VIOLET);
    // long hollow face
    ink(g, () => { g.moveTo(-.38, -.26); g.lineTo(-.33, .2); g.lineTo(0, .66); g.lineTo(.33, .2); g.lineTo(.38, -.26); g.closePath(); }, '#d6ec9f');
    flat(g, () => { g.moveTo(.1, -.26); g.lineTo(.38, -.26); g.lineTo(.33, .2); g.lineTo(.02, .64); g.quadraticCurveTo(.22, .3, .1, -.26); }, '#9fbd63');
    // hood
    ink(g, () => { g.moveTo(-.44, .12); g.quadraticCurveTo(-.54, -.64, 0, -.68); g.quadraticCurveTo(.54, -.64, .44, .12); g.lineTo(.3, -.1); g.quadraticCurveTo(.16, -.34, 0, -.14); g.quadraticCurveTo(-.16, -.34, -.3, -.1); g.closePath(); }, VIOLET);
    flat(g, () => { g.moveTo(-.4, -.14); g.quadraticCurveTo(-.46, -.54, -.1, -.6); g.quadraticCurveTo(-.3, -.42, -.32, -.14); g.closePath(); }, '#a463ff');
    // burning eyes under a heavy scowl
    for (const s of [-1, 1]) ink(g, () => { g.moveTo(s * .06, -.04); g.lineTo(s * .32, -.22); g.lineTo(s * .3, -.02); g.quadraticCurveTo(s * .16, .06, s * .06, -.04); }, TOXIC, .03);
    for (const s of [-1, 1]) flat(g, () => g.arc(s * .19, -.07, .035, 0, TAU), '#fff');
    // saw-tooth grin
    ink(g, () => { g.moveTo(-.25, .18); g.quadraticCurveTo(0, .3, .25, .18); g.quadraticCurveTo(.14, .46, 0, .47); g.quadraticCurveTo(-.14, .46, -.25, .18); }, INK, .03);
    g.fillStyle = '#fff'; g.beginPath(); for (let i = 0; i < 6; i++) { const x = -.17 + i * .068; g.moveTo(x, .23 + Math.abs(i - 2.5) * -.005); g.lineTo(x + .034, .34); g.lineTo(x + .068, .23); } g.fill();
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = .05; g.lineCap = 'round'; g.beginPath(); g.arc(0, 0, .91, Math.PI * 1.12, Math.PI * 1.4); g.stroke();
  }

  // side 0 = hero, 1 = villain. Sprites match the {c, S, R} shape used elsewhere.
  const faces = new Map();
  function face(side, R = 230) {
    const key = side * 10000 + R; if (faces.has(key)) return faces.get(key);
    const P = Math.ceil(R * .08), S = (R + P) * 2, c = Art.cv(S, S), g = c.getContext('2d');
    g.translate(S / 2, S / 2); g.scale(R, R); (side ? villainFace : heroFace)(g);
    const spr = { c, S, R }; faces.set(key, spr); return spr;
  }
  const EDGE = [['#f5a800', ULTRA2], ['#5cc400', VIOLET2]];
  // Draw the coin flipping about its horizontal axis. Returns which face is showing.
  function flip(g, cx, cy, R, ang, faceR = 230, tilt = -.12) {
    const c = Math.cos(ang), ab = Math.abs(c), side = c >= 0 ? 0 : 1, T = R * .13 * Math.sqrt(1 - c * c), edge = EDGE[side], dir = Math.sin(ang) >= 0 ? -1 : 1;
    g.save(); g.translate(cx, cy); g.rotate(tilt);
    if (T > .5) { const n = Math.min(10, Math.ceil(T / 2)); for (let i = n; i > 0; i--) { g.fillStyle = i === n || i === 1 ? INK : (i % 2 ? edge[0] : edge[1]); g.beginPath(); g.ellipse(0, dir * T * i / n, R, Math.max(R * ab, .5), 0, 0, TAU); g.fill(); } }
    const spr = face(side, faceR), h = spr.S * R / spr.R;
    if (ab > .015) { g.scale(1, ab); g.drawImage(spr.c, -h / 2, -h / 2, h, h); }
    else { g.fillStyle = INK; g.fillRect(-R, -1.5, 2 * R, 3); }
    g.restore();
    return side;
  }
  // Radial comic rays, prerendered per side.
  const rays = new Map();
  function burstBg(side, w, h, cxF, cyF) {
    const key = `${side}|${w}|${h}|${cxF}|${cyF}`; if (rays.has(key)) return rays.get(key);
    const c = Art.cv(w, h), g = c.getContext('2d'), cx = w * cxF, cy = h * cyF, A = side ? VIOLET : ULTRA, B = side ? VIOLET2 : ULTRA2, D = Math.hypot(w, h);
    g.fillStyle = A; g.fillRect(0, 0, w, h); g.fillStyle = B;
    for (let i = 0; i < 20; i++) { const a = i / 20 * TAU, b = a + TAU / 40; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * D, cy + Math.sin(a) * D); g.lineTo(cx + Math.cos(b) * D, cy + Math.sin(b) * D); g.closePath(); g.fill(); }
    g.fillStyle = 'rgba(20,16,42,.28)'; for (let y = 0, j = 0; y < h; y += 7, j++) for (let x = j % 2 ? 3.5 : 0; x < w; x += 7) { const f = Math.max(0, (x / w) * 1.2 - .3); if (f <= 0) continue; g.beginPath(); g.arc(x, y, 2.3 * f, 0, TAU); g.fill(); }
    rays.set(key, c); return c;
  }
  return { INK, PAPER, SUN, ULTRA, ULTRA2, SKY, VIOLET, VIOLET2, TOXIC, BLOOD, TAU, disp, text, starPath, glint, face, flip, burstBg, fontsReady: () => bangers };
})();

// Match HUD, drawn on the canvas, plus the upgrade panel and pause overlay.
const Hud = {
  ui: {
    atk: { x: 0, y: 0, r: 46 },
    ab: [{ x: 0, y: 0, r: 33 }, { x: 0, y: 0, r: 33 }, { x: 0, y: 0, r: 37 }],
    cancel: { x: 0, y: 70, r: 34 }, pause: { x: 0, y: 24, r: 16 },
    forge: { x: 68, y: 86, r: 20 }, recall: { x: 124, y: 86, r: 20 },
    map: { x: 0, y: 6, w: 140, h: 84 },
    stripX: 400, miniR: 11, miniGap: 27, midHalf: 42, hpW: 130, compact: false,
  },
};

const { hud, initHud, hudDraw, uiEvent } = (() => {
  const U = Hud.ui, HPI = Math.PI / 2, UIFONT = '"Barlow Semi Condensed",sans-serif';
  const { INK, PAPER, SUN, ULTRA, ULTRA2, VIOLET, VIOLET2, TOXIC, BLOOD } = Comic;
  const WHITE = '#ffffff', HP_X = 104, GOLD_X = 118, GOLD_Y = 53;
  const TRACKS = [['edge', 'Edge', 'More damage from everything'], ['guard', 'Guard', 'More health and armour'], ['haste', 'Haste', 'Shorter cooldowns, faster feet']];
  const fcache = {};
  const fw = (w, s) => fcache[w * 1000 + s] || (fcache[w * 1000 + s] = `${w} ${s}px ${UIFONT}`);
  const fd = s => Comic.disp(s);
  const NUM = Array.from({ length: 240 }, (_, i) => String(i));
  const TENTH = Array.from({ length: 31 }, (_, i) => (i / 10).toFixed(1));
  const num = n => n >= 0 && n < 240 ? NUM[n] : String(n);
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const outBack = t => { const k = 1.9; t -= 1; return 1 + (k + 1) * t * t * t + k * t * t; };
  const SIDE_FILL = [ULTRA, VIOLET], SIDE_ACC = [SUN, TOXIC];

  let H = null;

  // ---------- shared drawing ----------
  function blit(spr, x, y, r) { const h = spr.S * r / spr.R; ctx.drawImage(spr.c, x - h / 2, y - h / 2, h, h); }
  function disc(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
  function arcLine(x, y, r, a, b, col, w) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(x, y, r, a, b); ctx.stroke(); }
  function label(s, x, y, col, w = 3) { ctx.lineWidth = w; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); ctx.fillStyle = col; ctx.fillText(s, x, y); }
  function rounded(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function offset(dx, dy) { ctx.setTransform(dpr, 0, 0, dpr, dx * dpr, dy * dpr); }

  // Crisp comic panels, cached by size and colour: ink outline, hard offset shadow, flat fill with a lit band.
  const panels = new Map();
  function panel(w, h, r = 5, fill = PAPER, sh = 2.5) {
    w = Math.ceil(w); h = Math.ceil(h);
    const id = `${w}|${h}|${r}|${fill}|${sh}`; let c = panels.get(id);
    if (c) return c;
    c = Art.cv((w + 3) * 2, (h + 3) * 2); const g = c.getContext('2d'); g.scale(2, 2);
    const iw = w - 2.5, ih = h - 2.5;
    rounded(g, 1.25 + sh, 1.25 + sh, iw, ih, r); g.fillStyle = INK; g.fill();
    rounded(g, 1.25, 1.25, iw, ih, r); g.fillStyle = fill; g.fill();
    g.save(); rounded(g, 1.25, 1.25, iw, ih, r); g.clip(); g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(0, 0, w, Math.max(2, h * .34)); g.restore();
    rounded(g, 1.25, 1.25, iw, ih, r); g.strokeStyle = INK; g.lineWidth = 2.5; g.stroke();
    panels.set(id, c); return c;
  }
  const put = (c, x, y, w, h) => ctx.drawImage(c, x, y, c.width / 2, c.height / 2);

  let edgeC = null;
  function redEdge() {
    if (edgeC) return edgeC;
    const c = Art.cv(160, 80), g = c.getContext('2d'), gr = g.createRadialGradient(80, 40, 26, 80, 40, 88);
    gr.addColorStop(0, 'rgba(255,60,20,0)'); gr.addColorStop(.62, 'rgba(255,60,20,.12)'); gr.addColorStop(1, 'rgba(255,50,10,.95)');
    g.fillStyle = gr; g.fillRect(0, 0, 160, 80); return edgeC = c;
  }

  // ---------- layout ----------
  function hud() {
    U.compact = VW < 760 || VH < 350;
    stage.classList.toggle('sm', U.compact);
    const bx = VW - 92, by = VH - 80, off = [[-104, 18], [-78, -78], [4, -112]];
    U.atk.x = bx; U.atk.y = by;
    off.forEach((o, i) => { U.ab[i].x = bx + o[0]; U.ab[i].y = by + o[1]; });
    U.cancel.x = VW - 250;
    const M = U.map; M.w = U.compact ? 108 : 140; M.h = Math.round(M.w * Sim.H / Sim.W); M.x = VW - 44 - M.w; M.y = 6;
    U.pause.x = M.x - 26; U.pause.y = 24;
    U.stripX = VW / 2; U.miniR = U.compact ? 9 : 11; U.miniGap = U.compact ? 20 : 26; U.midHalf = U.compact ? 38 : 44;
    const left = U.stripX - U.midHalf - U.miniGap * 4;
    U.hpW = Math.max(70, Math.min(130, Math.floor(left - 10 - HP_X)));
    if (H) H.mapC = null;
  }

  // ---------- match setup ----------
  function initHud(g) {
    const me = g.me, s = g.s;
    Ctl.reset();
    $('forge').classList.add('hide');
    const byId = new Map(), mini = new Map();
    for (const c of s.champs) { byId.set(c.id, c); mini.set(c.id, Art.champCoin(c.champ, c.team, c.tier, 26)); }
    for (const t of s.towers) byId.set(t.id, t);
    H = {
      t: 0, enter: 0, byId, mini, hope: s.hope, hopeFlash: 0, announced: false, hopeAng: s.hope >= 50 ? 0 : Math.PI, hopeSide: s.hope >= 50 ? 0 : 1,
      portrait: spriteOf(me), goldCoin: Art.coin('hudgold', 18, 'boss', Art.METAL.boss, -1, -1, .5),
      abOn: me.kit.map((_, i) => Art.abilityCoin(me.champ, i, true, 40)), abOff: me.kit.map((_, i) => Art.abilityCoin(me.champ, i, false, 40)),
      rng: me.kit.map(a => a.range ? `Range ${a.range}` : 'Self'),
      hpTrail: me.hp, hpHold: 0, hurt: 0, hpPrev: me.hp, goldShow: me.gold, goldStr: String(Math.floor(me.gold)),
      prev: [0, 0, 0], cdMax: [1, 1, 1], recPrev: [0, 0, 0], recMax: [1, 1, 1], pop: [0, 0, 0], press: [0, 0, 0], deny: [0, 0, 0], flash: [0, 0, 0], spark: [.4, 1.2, 2.0],
      atkPress: 0, atkMax: 1, atkPrev: 0, cancelIn: 0,
      feed: [], banner: null, queue: [], pings: [], pingAt: {}, towerAt: -99, mapC: null, kills: [s.kills[0], s.kills[1]], killBump: [0, 0], lvl: me.lvl, lvlBump: 0, sq: { forge: 0, recall: 0, pause: 0 },
      clockSec: -1, clockStr: '0:00', hoardKey: -2, hoardStr: '', frame: 0, forgeKey: -1,
      hint: save.hints < 3 ? { i: 0, t: 0 } : null,
    };
    g.goldBump = 0; g.goldAnchor = { x: GOLD_X, y: GOLD_Y };
    hud();
  }

  // ---------- banners: comic captions that slam in near the top, clear of the action ----------
  function banner(s, o = {}) {
    if (!H) return;
    const b = { s: s.toUpperCase(), sub: o.sub || '', pri: o.pri || 1, spr: o.spr || null, team: o.team === 0 || o.team === 1 ? o.team : -1, t: 0, max: o.dur || 2.1, w: 0, hot: !!o.hot };
    if (H.banner && H.banner.s === b.s) { H.banner.t = Math.min(H.banner.t, .3); return; }
    if (H.banner && b.pri > H.banner.pri) { H.banner = b; return; }
    if (!H.banner) { H.banner = b; return; }
    H.queue.push(b); H.queue.sort((p, q) => q.pri - p.pri);
    if (H.queue.length > 3) H.queue.length = 3;
  }

  function drawBanner(dt) {
    let b = H.banner;
    if (!b) return;
    b.t += dt;
    if (b.t >= b.max) { H.banner = H.queue.shift() || null; b = H.banner; if (!b) return; }
    const big = b.pri >= 2, size = U.compact ? (big ? 23 : 20) : (big ? 27 : 22), h = (big ? 34 : 30) + (b.sub ? 15 : 0);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (!b.w) { ctx.font = fd(size); b.w = ctx.measureText(b.s).width + (b.spr ? 66 : 42); if (b.sub) { ctx.font = fw(700, 13.5); b.w = Math.max(b.w, ctx.measureText(b.sub).width + 42); } }
    const SLAM = .15, inT = clamp01(b.t / SLAM), outT = clamp01((b.t - (b.max - .2)) / .2);
    const eased = 1 - (1 - inT) * (1 - inT);
    const scale = calm ? 1 : (inT < 1 ? 2.3 - 1.3 * eased : 1 + Math.max(0, .14 - (b.t - SLAM) * .9) * Math.sin((b.t - SLAM) * 26));
    const W = Math.min(b.w, VW - 300), cy = Ctl.aim ? Math.min(136, VH * .36) : (U.compact ? 84 : 90), lift = outT * outT * -34;
    ctx.globalAlpha = calm ? Math.min(inT * 2, 1 - outT) : Math.min(1, inT * 2.5) * (1 - outT);
    const c = Math.cos(-.03), sn = Math.sin(-.03);
    ctx.setTransform(dpr * scale * c, dpr * scale * sn, -dpr * scale * sn, dpr * scale * c, VW / 2 * dpr, (cy + lift) * dpr);
    // impact lines after the slam
    if (!calm && b.t > SLAM && b.t < SLAM + .32) {
      const p = (b.t - SLAM) / .32; ctx.strokeStyle = INK; ctx.lineWidth = 3 * (1 - p); ctx.lineCap = 'round'; ctx.beginPath();
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + .2, rx = W / 2 + 6 + p * 26, ry = h / 2 + 4 + p * 14; ctx.moveTo(Math.cos(a) * rx, Math.sin(a) * ry); ctx.lineTo(Math.cos(a) * (rx + 12), Math.sin(a) * (ry + 12)); }
      ctx.stroke();
    }
    const hw = W / 2, hh = h / 2, fill = b.team === 0 ? ULTRA : b.team === 1 ? VIOLET : b.hot ? BLOOD : SUN, tc = b.team >= 0 || b.hot ? WHITE : INK;
    ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(-hw - 8 + 4, -hh + 5); ctx.lineTo(hw + 4 + 8, -hh + 5); ctx.lineTo(hw + 4 - 2, hh + 5); ctx.lineTo(-hw + 4 - 12, hh + 5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-hw - 8, -hh); ctx.lineTo(hw + 8, -hh); ctx.lineTo(hw - 2, hh); ctx.lineTo(-hw - 12, hh); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke();
    const tx = b.spr ? 15 : 0, ty = b.sub ? -7.5 : 1;
    if (b.spr) blit(b.spr, -hw + 21, 0, Math.min(16, hh - 2));
    ctx.font = fd(size);
    if (tc === WHITE) { ctx.lineWidth = 3.6; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.strokeText(b.s, tx, ty); ctx.fillStyle = b.team === 0 ? SUN : b.team === 1 ? TOXIC : WHITE; ctx.fillText(b.s, tx, ty); }
    else { ctx.fillStyle = INK; ctx.fillText(b.s, tx, ty); }
    if (b.sub) { ctx.font = fw(700, 13.5); ctx.fillStyle = tc; ctx.fillText(b.sub, tx, ty + 19); }
    ctx.globalAlpha = 1; offset(0, 0);
  }

  // ---------- sim events ----------
  function uiEvent(e) {
    if (!H || !G) return;
    const me = G.me, k = e.e;
    if (k === 'hit') {
      const u = H.byId.get(e.u); if (!u || u.team !== me.team) return;
      const now = G.s.t;
      if (u.kind === 'tower') { if (now - H.towerAt > 25) { H.towerAt = now; banner('Your tower is under attack', { pri: 2, hot: true, dur: 2 }); } }
      else if (u !== me && now - (H.pingAt[u.id] || -9) > 2.5) { H.pingAt[u.id] = now; if (H.pings.length < 6) H.pings.push({ x: u.x, y: u.y, t: 0 }); }
    } else if (k === 'gold') { if (e.u === me.id) G.goldBump = Math.max(G.goldBump, .55); }
    else if (k === 'feed') {
      const a = H.byId.get(e.a) || null, b = H.byId.get(e.b) || null;
      H.feed.unshift({ aS: a && a.kind === 'champ' ? H.mini.get(a.id) : null, bS: b ? H.mini.get(b.id) : null, t: 5, aT: a ? a.team : -1, age: 0 });
      if (H.feed.length > 4) H.feed.length = 4;
      const spr = a && a.kind === 'champ' ? H.mini.get(a.id) : null, team = a ? a.team : -1;
      if (e.first) banner('First strike', { pri: 6, spr, team, dur: 2.2 });
      else if (e.multi >= 2) banner(e.multi === 2 ? 'Double take' : e.multi === 3 ? 'Triple take' : 'Quadra take', { pri: 4 + Math.min(4, e.multi), spr, team, dur: 2.3 });
    } else if (k === 'level') {
      if (e.u === me.id) { H.lvlBump = 1; if (me.lvl === 3) banner('Ultimate unlocked', { pri: 3, dur: 2 }); else banner(`Level ${me.lvl}`, { pri: 1, dur: 1.3 }); }
    } else if (k === 'tower') {
      banner(e.team === me.team ? 'Your team lost a tower' : `${Sim.TEAM_NAMES[e.team]} lost a tower`, { pri: 3, team: e.team, dur: 2.4 });
    } else if (k === 'bossup') banner('The Colossus is up', { pri: 4, sub: 'It waits at the centre', dur: 2.6 });
    else if (k === 'boss') banner(`${Sim.TEAM_NAMES[e.team]} took the Colossus`, { pri: 5, sub: 'Stronger strikes for 90 seconds', team: e.team, dur: 2.8 });
    else if (k === 'forge') { if (e.u === me.id) forgeSync(true); }
    else if (k === 'civ') { H.hopeFlash = 1; if (e.team === G.me.team) banner(e.team === 0 ? 'Rescued' : 'Seized', { pri: 1, team: e.team, dur: 1.3 }); }
    else if (k === 'hope') {
      if (e.on) banner(e.team === 0 ? 'The people rally' : 'The city cowers', { pri: 3, sub: `${Sim.TEAM_NAMES[e.team]} hit harder`, team: e.team, dur: 2.4 });
      else banner(`${Sim.TEAM_NAMES[e.team]} lost their edge`, { pri: 1, team: e.team, dur: 1.6 });
    }
  }

  // ---------- player frame ----------
  function drawFrame(dt, me) {
    const hpw = U.hpW, f = clamp01(me.hp / me.maxHp), side = me.team;
    if (me.hp < H.hpPrev - .5) H.hurt = 1;
    H.hpPrev = me.hp; H.hurt = Math.max(0, H.hurt - dt * 4.5); H.lvlBump = Math.max(0, H.lvlBump - dt * 3.2);
    const jolt = calm ? 0 : Math.sin(H.t * 60) * H.hurt * 2.4;
    if (jolt) offset(jolt, 0);
    // A slim panel with the portrait breaking out on the left.
    put(panel(HP_X - 78 + hpw + 12, 38, 6, SIDE_FILL[side]), 78, 7);
    disc(72, 31, 26); ctx.fillStyle = INK; ctx.fill();
    blit(H.portrait, 72, 31, 24);
    const lb = 1 + H.lvlBump * .55;
    disc(92, 48, 9.5 * lb); ctx.fillStyle = SUN; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = fw(700, 13); ctx.fillStyle = INK; ctx.fillText(num(me.lvl), 92, 48.5);
    if (me.hp < H.hpTrail) { H.hpHold += dt; if (H.hpHold > .32) H.hpTrail = Math.max(me.hp, H.hpTrail - (me.maxHp * .9 + H.hpTrail - me.hp) * dt); } else { H.hpTrail = me.hp; H.hpHold = 0; }
    const x = HP_X, y = 12, h = 13, tr = clamp01(H.hpTrail / me.maxHp), low = f < .3;
    ctx.fillStyle = INK; ctx.fillRect(x - 2.5, y - 2.5, hpw + 5, h + 5);
    ctx.fillStyle = '#3a3358'; ctx.fillRect(x, y, hpw, h);
    if (tr > f) { ctx.fillStyle = SUN; ctx.fillRect(x + hpw * f, y, hpw * (tr - f), h); }
    ctx.fillStyle = low ? '#ff3a22' : '#38e04f'; ctx.fillRect(x, y, hpw * f, h);
    ctx.fillStyle = low ? '#ff9a7a' : '#baf79e'; ctx.fillRect(x, y, hpw * f, 4);
    if (low && !calm) { ctx.globalAlpha = .35 + Math.sin(H.t * 9) * .3; ctx.fillStyle = '#fff'; ctx.fillRect(x, y, hpw * f, h); ctx.globalAlpha = 1; }
    const step = me.maxHp > 1500 ? 250 : 100, seg = hpw * step / me.maxHp;
    ctx.fillStyle = INK;
    for (let tx = x + seg; tx < x + hpw - .5; tx += seg) ctx.fillRect(tx - .6, y, 1.2, h);
    ctx.font = fw(700, 12.5); ctx.textAlign = 'center';
    label(num(Math.ceil(me.hp)), x + hpw / 2, y + h / 2 + .5, WHITE, 3);
    const need = Sim.xpNeed(me.lvl), xf = me.lvl >= 10 ? 1 : clamp01(me.xp / need);
    ctx.fillStyle = INK; ctx.fillRect(x - 2.5, 29, hpw + 5, 9);
    ctx.fillStyle = '#3a3358'; ctx.fillRect(x, 31, hpw, 5);
    ctx.fillStyle = SIDE_ACC[side]; ctx.fillRect(x, 31, hpw * xf, 5);
    if (jolt) offset(0, 0);
    // gold rolls toward the real value
    G.goldBump = Math.max(0, (G.goldBump || 0) - dt * 4.5);
    const diff = me.gold - H.goldShow;
    H.goldShow = Math.abs(diff) < 1 ? me.gold : H.goldShow + diff * Math.min(1, dt * 9);
    const shown = Math.floor(H.goldShow); if (shown !== H.gv) { H.gv = shown; H.goldStr = String(shown); }
    const bump = 1 + (calm ? 0 : G.goldBump) * .3;
    G.goldAnchor.x = GOLD_X; G.goldAnchor.y = GOLD_Y;
    ctx.font = fw(700, Math.round(18 * bump * 2) / 2); ctx.textAlign = 'left';
    const gw = ctx.measureText(H.goldStr).width;
    put(panel(32 + gw, 20, 6, INK, 0), GOLD_X - 13, GOLD_Y - 10);
    blit(H.goldCoin, GOLD_X, GOLD_Y, 8 * bump);
    ctx.fillStyle = SUN; ctx.fillText(H.goldStr, GOLD_X + 12, GOLD_Y + .5);
    // Upgrade coin
    let afford = 0;
    if (me.alive) for (let i = 0; i < 3; i++) { const n = me.up[TRACKS[i][0]]; if (n < 3 && me.gold >= Sim.FORGE_COST[n]) afford++; }
    smallCoin(U.forge, afford > 0, 'Upgrade', drawHammer, H.sq.forge, dt, 'forge');
    if (afford > 0) {
      const p = (Math.sin(H.t * 6) + 1) / 2;
      if (!calm) arcLine(U.forge.x, U.forge.y, U.forge.r + 3 + p * 4, 0, TAU, SIDE_ACC[side], 2.5);
      disc(U.forge.x + 15, U.forge.y - 15, 9); ctx.fillStyle = BLOOD; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
      ctx.font = fw(700, 12); ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText(num(afford), U.forge.x + 15, U.forge.y - 14.5);
    }
    const chan = me.chan && me.chan.recall ? me.chan : null;
    smallCoin(U.recall, false, 'Recall', drawGate, H.sq.recall, dt, 'recall');
    if (chan) arcLine(U.recall.x, U.recall.y, U.recall.r + 2, -HPI, -HPI + TAU * (1 - chan.t / chan.total), SIDE_ACC[side], 4);
  }

  function smallCoin(B, hot, name, icon, sq, dt, key) {
    H.sq[key] = Math.max(0, H.sq[key] - dt * 7);
    const s = 1 - sq * .16, r = B.r * s;
    disc(B.x + 2.5, B.y + 3.5, B.r); ctx.fillStyle = INK; ctx.fill();
    disc(B.x + sq * 2.5, B.y + sq * 3.5, r); ctx.fillStyle = hot ? SUN : PAPER; ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2.6; ctx.stroke();
    icon(B.x + sq * 2.5, B.y + sq * 3.5, INK);
    ctx.font = fw(700, 11.5); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    label(name, B.x, B.y + B.r + 8.5, WHITE, 3);
  }
  function drawHammer(x, y, col) {
    ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(x - 6, y + 8); ctx.lineTo(x + 3, y - 2); ctx.stroke();
    ctx.save(); ctx.translate(x + 4, y - 4); ctx.rotate(-Math.PI / 4); ctx.fillRect(-8, -3.6, 16, 7.2); ctx.restore();
  }
  function drawGate(x, y, col) {
    ctx.strokeStyle = col; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - 7, y + 8); ctx.lineTo(x - 7, y - 1); ctx.arc(x, y - 1, 7, Math.PI, 0); ctx.lineTo(x + 7, y + 8); ctx.moveTo(x - 10, y + 8); ctx.lineTo(x + 10, y + 8); ctx.stroke();
    disc(x, y + 1, 2.4); ctx.fillStyle = col; ctx.fill();
  }

  // ---------- top strip ----------
  let stripC = null, stripK = '';
  function bakeStrip(w, h, mid) {
    const c = Art.cv((w + 3) * 2, (h + 3) * 2), g = c.getContext('2d'); g.scale(2, 2);
    const m = w / 2;
    g.fillStyle = INK; rounded(g, 3.5, 3.5, w - 3, h - 3, 6); g.fill();
    g.save(); rounded(g, 1.5, 1.5, w - 3, h - 3, 6); g.clip();
    g.fillStyle = ULTRA; g.fillRect(0, 0, m + 6, h); g.fillStyle = VIOLET; g.beginPath(); g.moveTo(m + 8, 0); g.lineTo(w, 0); g.lineTo(w, h); g.lineTo(m - 8, h); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(0, 0, w, h * .34);
    g.fillStyle = PAPER; g.beginPath(); g.moveTo(m - mid + 8, 0); g.lineTo(m + mid + 8, 0); g.lineTo(m + mid - 8, h); g.lineTo(m - mid - 8, h); g.closePath(); g.fill();
    g.strokeStyle = INK; g.lineWidth = 2.5; g.stroke();
    g.restore();
    rounded(g, 1.5, 1.5, w - 3, h - 3, 6); g.strokeStyle = INK; g.lineWidth = 2.5; g.stroke();
    return c;
  }
  function drawStrip(dt, s, me) {
    const cx = U.stripX, r = U.miniR, gap = U.miniGap, mid = U.midHalf, half = mid + gap * 4 + 6, Y = 4, h = 29;
    const key = `${half}|${mid}`; if (key !== stripK) { stripK = key; stripC = bakeStrip(half * 2, h, mid); }
    ctx.drawImage(stripC, cx - half, Y, stripC.width / 2, stripC.height / 2);
    for (const t of [0, 1]) { if (s.kills[t] !== H.kills[t]) { H.kills[t] = s.kills[t]; H.killBump[t] = 1; } H.killBump[t] = Math.max(0, H.killBump[t] - dt * 3.6); }
    ctx.textBaseline = 'middle';
    const big = U.compact ? 20 : 23, sc0 = calm ? 1 : 1 + H.killBump[0] * .5, sc1 = calm ? 1 : 1 + H.killBump[1] * .5;
    ctx.textAlign = 'center';
    ctx.font = fd(Math.round(big * sc0)); ctx.fillStyle = ULTRA2; ctx.fillText(num(s.kills[0]), cx - mid + (U.compact ? 12 : 16), Y + 15);
    ctx.font = fd(Math.round(big * sc1)); ctx.fillStyle = VIOLET; ctx.fillText(num(s.kills[1]), cx + mid - (U.compact ? 12 : 16), Y + 15);
    const sec = Math.floor(s.t);
    if (sec !== H.clockSec) { H.clockSec = sec; H.clockStr = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }
    ctx.font = fw(700, U.compact ? 13 : 15); ctx.fillStyle = INK; ctx.fillText(H.clockStr, cx, Y + 15.5);
    for (const c of s.champs) {
      const dir = c.team ? 1 : -1, x = cx + dir * (mid + gap * (c.slot + .5)), y = Y + 14.5, spr = H.mini.get(c.id);
      ctx.globalAlpha = c.alive ? 1 : .3; blit(spr, x, y, r); ctx.globalAlpha = 1;
      disc(x, y, r + .5); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke();
      if (c === me) { disc(x, y, r + 2); ctx.strokeStyle = SUN; ctx.lineWidth = 2; ctx.stroke(); }
      if (!c.alive) { ctx.font = fw(700, U.compact ? 12 : 14); ctx.textAlign = 'center'; label(num(Math.ceil(c.respawn)), x, y + .5, WHITE, 3); }
      else if (c.role && !U.compact) {
        const n = Sim.ROLE_INFO[c.role].name[0];
        disc(x + r * .74, y + r * .74, 5); ctx.fillStyle = INK; ctx.fill();
        ctx.font = fw(700, 8.5); ctx.textAlign = 'center'; ctx.fillStyle = WHITE; ctx.fillText(n, x + r * .74, y + r * .74 + .5);
      }
    }
    const P = U.pause, sq = H.sq.pause; H.sq.pause = Math.max(0, sq - dt * 7);
    disc(P.x + 2, P.y + 3, P.r); ctx.fillStyle = INK; ctx.fill();
    disc(P.x + sq * 2, P.y + sq * 2, P.r * (1 - sq * .15)); ctx.fillStyle = PAPER; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.fillStyle = INK; ctx.fillRect(P.x - 5 + sq * 2, P.y - 6.5 + sq * 2, 3.6, 13); ctx.fillRect(P.x + 1.4 + sq * 2, P.y - 6.5 + sq * 2, 3.6, 13);
  }

  // ---------- the people: a tug-of-war between the sides ----------
  function drawPeople(dt, s) {
    const cx = U.stripX, bw = U.compact ? 112 : 186, x = cx - bw / 2, y = 38, h = 12, low = s.hope <= 30, high = s.hope >= 70;
    H.hope += (s.hope - H.hope) * Math.min(1, dt * 5);
    H.hopeFlash = Math.max(0, H.hopeFlash - dt * 2.2);
    const f = clamp01(H.hope / 100), mx = x + bw * f, pulse = calm ? 1 : .75 + Math.sin(H.t * 8) * .25;
    ctx.fillStyle = INK; ctx.fillRect(x - 2.5 + 1.5, y - 2.5 + 2, bw + 5, h + 5);
    ctx.fillStyle = INK; ctx.fillRect(x - 2.5, y - 2.5, bw + 5, h + 5);
    ctx.fillStyle = ULTRA; ctx.fillRect(x, y, mx - x, h);
    ctx.fillStyle = VIOLET; ctx.fillRect(mx, y, x + bw - mx, h);
    ctx.fillStyle = SUN; ctx.fillRect(x, y, mx - x, 4);
    ctx.fillStyle = TOXIC; ctx.fillRect(mx, y, x + bw - mx, 4);
    if (high) { ctx.globalAlpha = pulse; ctx.fillStyle = '#fff'; ctx.fillRect(x, y, bw * .3, h); ctx.globalAlpha = 1; }
    if (low) { ctx.globalAlpha = pulse; ctx.fillStyle = '#fff'; ctx.fillRect(x + bw * .7, y, bw * .3, h); ctx.globalAlpha = 1; }
    ctx.fillStyle = INK; ctx.fillRect(x + bw * .3 - 1, y, 2, h); ctx.fillRect(x + bw * .7 - 1, y, 2, h);
    // End markers show which side each direction favours; the marker coin flips as the balance tips.
    const want = s.hope >= 50 ? 0 : 1;
    if (want !== H.hopeSide) { H.hopeSide = want; H.hopeFlash = Math.max(H.hopeFlash, .8); }
    H.hopeAng += ((want ? Math.PI : 0) - H.hopeAng) * Math.min(1, dt * 7);
    const m = 1 + (calm ? 0 : H.hopeFlash) * .4;
    Comic.flip(ctx, mx, y + h / 2, 10 * m, H.hopeAng, 24, 0);
    ctx.font = fw(700, U.compact ? 11 : 12); ctx.textBaseline = 'middle';
    ctx.textAlign = 'right'; label('The people', x - 9, y + h / 2 + .5, WHITE, 3);
    const left = s.bossUp ? -1 : Math.max(0, Math.ceil(s.bossAt - s.t));
    if (left !== H.hoardKey) { H.hoardKey = left; H.hoardStr = left < 0 ? 'Colossus up' : `Colossus ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; }
    ctx.textAlign = 'left'; label(H.hoardStr, x + bw + 9, y + h / 2 + .5, s.bossUp ? SUN : WHITE, 3);
  }

  // ---------- minimap ----------
  function bakeMap(s) {
    const M = U.map, c = Art.cv(M.w * 2, M.h * 2), g = c.getContext('2d'), kx = M.w * 2 / Sim.W, ky = M.h * 2 / Sim.H;
    g.fillStyle = '#2f9b52'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#0f5a35'; for (const w of s.map.walls) if (w.big) g.fillRect(w.x * kx, w.y * ky, w.w * kx, w.h * ky);
    g.fillStyle = '#7fe08c'; for (const w of s.map.walls) if (!w.big) g.fillRect(w.x * kx, w.y * ky, w.w * kx, w.h * ky);
    g.strokeStyle = '#fff3c0'; g.lineWidth = 5; g.lineJoin = 'round'; g.lineCap = 'round';
    for (const L of s.map.lanes) { g.beginPath(); L.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x * kx, y * ky)); g.stroke(); }
    return c;
  }
  function drawMap(dt, s, me) {
    const M = U.map, kx = M.w / Sim.W, ky = M.h / Sim.H;
    if (!H.mapC) H.mapC = bakeMap(s);
    put(panel(M.w + 8, M.h + 8, 4, INK, 2.5), M.x - 4, M.y - 4);
    ctx.drawImage(H.mapC, M.x, M.y, M.w, M.h);
    ctx.save(); ctx.beginPath(); ctx.rect(M.x, M.y, M.w, M.h); ctx.clip();
    for (const t of s.towers) if (t.alive) { const r = t.sub === 'core' ? 3.8 : 2.8; ctx.fillStyle = INK; ctx.fillRect(M.x + t.x * kx - r - 1, M.y + t.y * ky - r - 1, 2 * r + 2, 2 * r + 2); ctx.fillStyle = t.team ? BLOOD : ULTRA; ctx.fillRect(M.x + t.x * kx - r, M.y + t.y * ky - r, 2 * r, 2 * r); }
    ctx.fillStyle = PAPER; for (const c of s.sites) if (c.alive) { disc(M.x + c.x * kx, M.y + c.y * ky, 2); ctx.fill(); }
    if (s.bossUp) { disc(M.x + 1600 * kx, M.y + 950 * ky, 4.5); ctx.fillStyle = SUN; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.2; ctx.stroke(); }
    const vw = VW / Z * kx, vh = VH / (Z * TILT) * ky;
    ctx.strokeStyle = WHITE; ctx.lineWidth = 1.5; ctx.strokeRect(M.x + G.cam.x * kx - vw / 2, M.y + G.cam.y * ky - vh / 2, vw, vh);
    for (let i = H.pings.length - 1; i >= 0; i--) {
      const p = H.pings[i]; p.t += dt;
      if (p.t >= 1) { H.pings[i] = H.pings[H.pings.length - 1]; H.pings.pop(); continue; }
      disc(M.x + p.x * kx, M.y + p.y * ky, 3 + p.t * 12); ctx.strokeStyle = `rgba(255,70,30,${1 - p.t})`; ctx.lineWidth = 2; ctx.stroke();
    }
    for (const c of s.champs) {
      if (!c.alive || !Sim.canSee(s, me.team, c)) continue;
      const mine = c === me, X = M.x + c.x * kx, Y = M.y + c.y * ky;
      disc(X, Y, mine ? 4.8 : 3.5); ctx.fillStyle = mine ? SUN : c.team ? BLOOD : ULTRA; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.3; ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- right cluster ----------
  function inkRing(x, y, r) { disc(x, y, r); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke(); }
  function drawAttack(dt, me) {
    const A = U.atk, held = Ctl.atk !== null;
    H.atkPress += ((held ? 1 : 0) - H.atkPress) * Math.min(1, dt * 24);
    const r = A.r * (1 - H.atkPress * .08);
    disc(A.x + 3, A.y + 4, A.r); ctx.fillStyle = INK; ctx.fill();
    blit(H.portrait, A.x + H.atkPress * 3, A.y + H.atkPress * 3, r);
    inkRing(A.x + H.atkPress * 3, A.y + H.atkPress * 3, r);
    if (held) arcLine(A.x, A.y, A.r + 4, 0, TAU, SIDE_ACC[me.team], 3.5);
    if (me.atkCd > H.atkPrev + .001) H.atkMax = me.atkCd;
    H.atkPrev = Math.max(0, me.atkCd);
    if (me.atkCd > 0) arcLine(A.x, A.y, A.r + 4, -HPI, -HPI + TAU * clamp01(1 - me.atkCd / H.atkMax), WHITE, 3);
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
    const scale = 1 - Math.max(H.press[i], H.flash[i]) * .12 + (calm ? 0 : Math.sin(pop * Math.PI) * .17);
    const press = H.press[i] * 3, x = B.x + shake + press, y = B.y + press, r = B.r * scale, size = (r * 86) / 40, half = size / 2;
    disc(B.x + 3, B.y + 4, B.r); ctx.fillStyle = INK; ctx.fill();
    if (onCd || locked) {
      ctx.drawImage(H.abOff[i], x - half, y - half, size, size);
      if (onCd) {
        const f = clamp01(cd / H.cdMax[i]), hand = -HPI + TAU * (1 - f);
        // Colour returns as the sweep closes; the waiting part stays dark and grey.
        ctx.save(); ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r + 4, -HPI, hand); ctx.closePath(); ctx.clip();
        ctx.drawImage(H.abOn[i], x - half, y - half, size, size); ctx.restore();
        ctx.fillStyle = 'rgba(20,16,42,.62)'; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, hand, -HPI + TAU); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = acc; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(hand) * (r - 1), y + Math.sin(hand) * (r - 1)); ctx.stroke();
        const n = cd > 3 ? num(Math.ceil(cd)) : TENTH[Math.min(30, Math.ceil(cd * 10))], soon = cd <= 1 && !calm, sz = soon ? Math.round(23 + Math.sin(H.t * 18) * 2) : cd > 3 ? 27 : 23;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = fd(sz); ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.strokeText(n, x, y + 1); ctx.fillStyle = soon ? acc : WHITE; ctx.fillText(n, x, y + 1);
      }
      inkRing(x, y, r);
    } else {
      // Ready reads at a glance: full colour, a bright rim and a bead of sparkle.
      ctx.drawImage(H.abOn[i], x - half, y - half, size, size);
      arcLine(x, y, r + 1.5, 0, TAU, INK, 5.5);
      arcLine(x, y, r + 1.5, 0, TAU, recast ? (calm ? TOXIC : `rgba(141,255,42,${.75 + Math.sin(H.t * 8) * .25})`) : acc, 3);
      if (!calm) {
        H.spark[i] += dt;
        const cyc = 2.1, t = H.spark[i] % cyc;
        if (t < .42) { const p = t / .42, ang = (Math.floor(H.spark[i] / cyc) * 2.3 + i) % TAU, gx = x + Math.cos(ang) * r * .82, gy = y + Math.sin(ang) * r * .82, gr = Math.sin(p * Math.PI) * 9; Comic.glint(ctx, gx + 1, gy + 1, gr, INK); Comic.glint(ctx, gx, gy, gr, WHITE); }
      }
    }
    if (recast) { arcLine(x, y, r + 5, 0, TAU, 'rgba(141,255,42,.35)', 3.5); arcLine(x, y, r + 5, -HPI, -HPI + TAU * clamp01(rec / H.recMax[i]), TOXIC, 3.5); }
    if (pop > 0) {
      const R = B.r + (1 - pop) * 18;
      ctx.strokeStyle = acc; ctx.lineWidth = 2.5 + pop * 2; ctx.lineCap = 'round'; ctx.beginPath();
      for (let k = 0; k < 10; k++) { const an = k / 10 * TAU + .3; ctx.moveTo(B.x + Math.cos(an) * R, B.y + Math.sin(an) * R); ctx.lineTo(B.x + Math.cos(an) * (R + 8), B.y + Math.sin(an) * (R + 8)); }
      ctx.stroke();
      if (pop > .25) { ctx.font = fd(19); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.globalAlpha = Math.min(1, pop * 2.4); ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; const ry = B.y - B.r - 8 - (1 - pop) * 5; ctx.strokeText('READY!', B.x, ry); ctx.fillStyle = acc; ctx.fillText('READY!', B.x, ry); ctx.globalAlpha = 1; }
    }
    if (held) arcLine(x, y, r + 5, 0, TAU, Ctl.aim.cancelHot ? BLOOD : WHITE, 3.5);
    if (charge) { const f = Math.min(1, charge.t / (a.charge || 1.1)); arcLine(x, y, r + 10, -HPI, -HPI + TAU * f, f >= 1 ? SUN : '#c9b6ff', 5); }
    if (winding) { const w = (Math.sin(H.t * 12) + 1) / 2; arcLine(x, y, r + 6, 0, TAU, `rgba(255,90,31,${.55 + w * .45})`, 3.5); ctx.font = fw(700, 13); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; label('Tap to cancel', B.x, B.y - B.r - 15, '#ffb08a', 3); }
    if (locked) { rounded(ctx, B.x - 19, B.y + B.r - 13, 38, 18, 5); ctx.fillStyle = SUN; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2.4; ctx.stroke(); ctx.font = fw(700, 12.5); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = INK; ctx.fillText('Lv 3', B.x, B.y + B.r - 3.5); }
  }

  function drawCancel(dt) {
    const A = Ctl.aim;
    H.cancelIn += ((A ? 1 : 0) - H.cancelIn) * Math.min(1, dt * 18);
    if (H.cancelIn < .02) return;
    const C = U.cancel, hot = A && A.cancelHot && !A.backHot, r = C.r * H.cancelIn * (hot ? 1.14 : 1);
    ctx.save();
    ctx.globalAlpha = Math.min(1, H.cancelIn * 1.5);
    ctx.translate(C.x, C.y); ctx.rotate(hot ? -.12 : -.06);
    ctx.save(); ctx.translate(3, 4); Comic.starPath(ctx, 13, r * 1.16, r * .94, .1); ctx.fillStyle = INK; ctx.fill(); ctx.restore();
    Comic.starPath(ctx, 13, r * 1.1, r * .9, .1); ctx.fillStyle = hot ? BLOOD : '#ffe9d6'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = fd(hot ? 21 : 19);
    if (hot) { ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeText('CANCEL', 0, 1); ctx.fillStyle = '#fff'; ctx.fillText('CANCEL', 0, 1); }
    else { ctx.fillStyle = INK; ctx.fillText('CANCEL', 0, 1); }
    ctx.restore();
  }

  function drawAimCard(me) {
    const A = Ctl.aim; if (!A) return;
    const a = me.kit[A.slot], rng = H.rng[A.slot], acc = SIDE_FILL[me.team], title = a.name.toUpperCase();
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.font = fd(20); const nw = ctx.measureText(title).width;
    ctx.font = fw(700, 12.5); const rw = ctx.measureText(rng).width, dw = ctx.measureText(a.d).width;
    const w = Math.min(VW - 330, Math.ceil(Math.max(nw + rw + 28, dw) + 26)) & ~7, h = 42, x = VW / 2 - w / 2, y = U.compact ? 54 : 58;
    put(panel(w, h, 4, PAPER, 3), x, y);
    ctx.font = fd(20); ctx.fillStyle = acc; ctx.fillText(title, x + 11, y + 14);
    ctx.font = fw(700, 12.5); ctx.textAlign = 'right'; ctx.fillStyle = INK; ctx.fillText(rng, x + w - 11, y + 14);
    ctx.textAlign = 'left'; ctx.font = fw(600, 13); ctx.fillStyle = INK; ctx.fillText(a.d, x + 11, y + 30, w - 22);
    if (A.backHot) { const B = U.ab[A.slot]; ctx.font = fw(700, 13.5); ctx.textAlign = 'center'; label('Release to cancel', B.x, B.y - B.r - 15, '#ffb08a', 3); }
  }

  function drawStick(s) {
    const st = Ctl.stick;
    if (st) {
      disc(st.sx, st.sy, 58); ctx.fillStyle = 'rgba(20,16,42,.28)'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.stroke();
      disc(st.sx, st.sy, 58); ctx.strokeStyle = WHITE; ctx.lineWidth = 2.2; ctx.stroke();
      const dx = st.x - st.sx, dy = st.y - st.sy, l = Math.min(58, Math.hypot(dx, dy)), an = Math.atan2(dy, dx), nx = st.sx + Math.cos(an) * l, ny = st.sy + Math.sin(an) * l;
      disc(nx, ny, 25); ctx.fillStyle = SUN; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    } else if (s.t < 30) { disc(122, VH - 86, 56); ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 2.5; ctx.stroke(); }
  }

  function drawFeed(dt) {
    let y = U.forge.y + U.forge.r + 28;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < H.feed.length; i++) {
      const f = H.feed[i]; f.t -= dt; f.age += dt;
      if (f.t <= 0) { H.feed.splice(i--, 1); continue; }
      ctx.globalAlpha = Math.min(1, f.t * 2);
      const ax = 40 - Math.max(0, 1 - f.age / .16) * 70, fill = f.aT === 0 ? ULTRA : f.aT === 1 ? VIOLET : '#ffe9d6', mark = f.aT === 0 ? SUN : f.aT === 1 ? TOXIC : INK;
      put(panel(82, 23, 4, fill, 2), ax + 4, y - 11.5);
      if (f.aS) blit(f.aS, ax + 18, y, 9.5); else { disc(ax + 18, y, 6.5); ctx.fillStyle = '#d9c9a0'; ctx.fill(); }
      ctx.save(); ctx.translate(ax + 45, y); Comic.starPath(ctx, 6, 8, 3.2, .3); ctx.fillStyle = mark; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore();
      if (f.bS) blit(f.bS, ax + 73, y, 9.5);
      y += 25;
    }
    ctx.globalAlpha = 1;
  }

  const HINTS = ['Left thumb moves', 'Hold the big coin to attack', 'Drag an ability to aim, or tap to fire'];
  function drawHint(dt, me) {
    const h = H.hint; if (!h || !me.alive || Ctl.aim) return;
    h.t += dt;
    if ((h.i === 0 && Ctl.stick && h.t > .8) || (h.i === 1 && Ctl.atk !== null && h.t > .5) || (h.i === 2 && (me.stats.casts > 0 || h.t > 9)) || h.t > 10) { h.i++; h.t = 0; }
    if (h.i >= HINTS.length) { H.hint = null; return; }
    const s = HINTS[h.i]; ctx.font = fw(700, 15.5); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = Math.ceil(ctx.measureText(s).width + 28) & ~7, y = VH - 40;
    ctx.globalAlpha = Math.min(1, h.t * 4);
    put(panel(w, 28, 5, PAPER, 2.5), VW / 2 - w / 2, y);
    ctx.fillStyle = INK; ctx.fillText(s, VW / 2, y + 14.5); ctx.globalAlpha = 1;
  }

  function drawDeath(me) {
    ctx.fillStyle = 'rgba(20,16,42,.5)'; ctx.fillRect(0, 0, VW, VH);
    const cx = VW / 2, cy = VH / 2 - 34, R = 40, ang = calm ? 0 : H.t * 1.25, c = Math.cos(ang), ab = Math.abs(c);
    disc(cx + 3, cy + 4, R); ctx.fillStyle = INK; ctx.fill();
    ctx.fillStyle = '#3a3358'; ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(R * ab, 3) + (1 - ab) * 5, R, 0, 0, TAU); ctx.fill();
    if (ab > .05) { const h = H.portrait.S * R / H.portrait.R; ctx.drawImage(H.portrait.c, cx - h * ab / 2, cy - h / 2, h * ab, h); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    Comic.text(ctx, `BACK IN ${Math.ceil(me.respawn)}`, cx, cy + R + 28, 40, SIDE_ACC[me.team], 5);
  }

  // ---------- frame ----------
  function hudDraw(dt) {
    if (!H || !G) return;
    const me = G.me, s = G.s, want = G.intro > 0 || G.outro || G.ended ? 0 : 1;
    H.t += dt;
    H.enter = clamp01(H.enter + (want ? dt * 3.2 : -dt * 4));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.textBaseline = 'middle';
    if (H.enter <= 0) return;
    if (want && !H.announced) { H.announced = true; banner(me.team ? 'Terrorize the city' : 'Save the people', { pri: 3, sub: me.team ? "You're a Villain" : "You're a Hero", team: me.team, dur: 2.6 }); }
    const e = calm ? 1 : H.enter * H.enter * (3 - 2 * H.enter), away = 1 - e;
    if (me.hp / me.maxHp < .3 && me.alive) {
      const p = calm ? .5 : (Math.sin(H.t * 7) + 1) / 2;
      ctx.globalAlpha = (.34 + p * .42) * e; ctx.drawImage(redEdge(), 0, 0, VW, VH); ctx.globalAlpha = 1;
    }
    drawStick(s);
    offset(-300 * away, 0); drawFrame(dt, me); drawFeed(dt);
    offset(0, -90 * away); drawStrip(dt, s, me); drawPeople(dt, s);
    offset(300 * away, 0); drawMap(dt, s, me); drawCancel(dt);
    offset(320 * away, 0); drawAttack(dt, me); for (let i = 0; i < 3; i++) drawAbility(i, dt, me);
    offset(0, 0);
    if (!me.alive) drawDeath(me);
    drawAimCard(me); drawHint(dt, me); drawBanner(dt);
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
    let key = me.alive ? 1 : 0;
    TRACKS.forEach(([k], i) => { const n = me.up[k]; key = key * 8 + n * 2 + (n < 3 && me.gold >= Sim.FORGE_COST[n] ? 1 : 0); });
    if (!force && key === H.forgeKey) return;
    H.forgeKey = key;
    TRACKS.forEach(([k], i) => {
      const b = btns[i], n = me.up[k], cost = Sim.FORGE_COST[n], pips = b.querySelectorAll('.pips i'), c = b.querySelector('.c'), full = n >= 3;
      pips.forEach((p, j) => p.classList.toggle('on', j < n));
      c.querySelector('.gc').classList.toggle('hide', full);
      c.querySelector('span').textContent = full ? 'Full' : cost;
      b.disabled = full || !me.alive || me.gold < cost;
      b.setAttribute('aria-label', `${TRACKS[i][1]}, ${n} of 3, ${full ? 'full' : `costs ${cost}`}`);
    });
  }
  Hud.toggleForge = () => {
    const f = $('forge'); f.classList.toggle('hide');
    if (!f.classList.contains('hide')) forgeBuild();
    Sound.play('tap');
  };

  // ---------- small helpers for the controls ----------
  Hud.deny = i => { if (H) H.deny[i] = 1; };
  Hud.flash = i => { if (H) H.flash[i] = 1; };
  Hud.toast = s => banner(s, { pri: 2, dur: 1.4 });
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
        const st = c.stats, role = c.role ? Sim.ROLE_INFO[c.role].name : '';
        tr.innerHTML = `<td><canvas width="48" height="48"></canvas></td><td>${Sim.charOf(c.team, c.champ).name}<small>${c.pname}</small></td><td>${role}</td><td class="n">${st.kills}/${st.deaths}/${st.assists}</td><td class="n">${Math.floor(c.gold)}</td>`;
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
    paused = true;
    Hud.scoreTable($('pBoard'), G.s, G.me);
    if (Hud.syncToggles) Hud.syncToggles();
    $('pause').classList.remove('hide');
    Sound.play('tap');
  };

  return { hud, initHud, hudDraw, uiEvent };
})();
