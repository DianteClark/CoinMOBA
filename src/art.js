// Coin art. Everything is generated in code and cached to offscreen canvases.
const Art = (() => {
  const TEAM = ['#58a6e6', '#e4573f'], TEAM_DARK = ['#1f4f7d', '#7e2a1e'];
  const METAL = {
    vesper: ['#cfcbe8', '#6a6498'], kade: ['#efcd77', '#9a6a2a'], ione: ['#a9e6dd', '#3b8a8a'],
    solenne: ['#f9e4ae', '#cc8d4c'], sable: ['#9ea3b2', '#3f4250'], gravel: ['#d3a583', '#6e4a38'],
    minion0: ['#a9cdea', '#3f6f9c'], minion1: ['#efa694', '#9a4230'], monster: ['#a39a78', '#544c34'], big: ['#b7905f', '#5b3b22'], boss: ['#ffe08a', '#b07a1e'],
  };
  const cv = (w, h) => { const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; };
  const TAU = Math.PI * 2;

  // Emblems are drawn in a -1..1 box using the current fill and stroke.
  const star = (g, r1, r2, n, rot = 0) => { g.beginPath(); for (let i = 0; i < n * 2; i++) { const r = i % 2 ? r2 : r1, a = rot + i / (n * 2) * TAU; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); };
  const poly = (g, p) => { g.beginPath(); p.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.closePath(); g.fill(); };
  const EMBLEM = {
    vesper(g) { g.lineWidth = .13; g.beginPath(); g.arc(0, 0, .62, 0, TAU); g.stroke(); g.lineCap = 'round'; for (let i = 0; i < 4; i++) { const a = i * TAU / 4, c = Math.cos(a), s = Math.sin(a); g.beginPath(); g.moveTo(c * .34, s * .34); g.lineTo(c * .98, s * .98); g.stroke(); } g.beginPath(); g.arc(0, 0, .13, 0, TAU); g.fill(); },
    kade(g) { for (const s of [1, -1]) { g.save(); g.rotate(s * .72); poly(g, [[0, -1.02], [.14, -.72], [.11, .46], [.3, .5], [.3, .6], [.1, .62], [.1, .96], [-.1, .96], [-.1, .62], [-.3, .6], [-.3, .5], [-.11, .46], [-.14, -.72]]); g.restore(); } },
    ione(g) { g.lineWidth = .1; g.beginPath(); g.arc(0, 0, .8, 0, TAU); g.stroke(); for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * TAU / 3; g.save(); g.translate(Math.cos(a) * .46, Math.sin(a) * .46); g.rotate(a + Math.PI / 2); poly(g, [[0, -.3], [.19, 0], [0, .3], [-.19, 0]]); g.restore(); } g.beginPath(); g.arc(0, 0, .12, 0, TAU); g.fill(); },
    solenne(g) { g.beginPath(); g.arc(0, 0, .42, 0, TAU); g.fill(); for (let i = 0; i < 8; i++) { g.save(); g.rotate(i * TAU / 8); poly(g, [[-.11, -.55], [0, i % 2 ? -.86 : -1.04], [.11, -.55]]); g.restore(); } },
    sable(g) { g.beginPath(); g.arc(-.08, 0, .86, -1.25, 1.25); g.arc(-.58, 0, .86, .86, -.86, true); g.closePath(); g.fill(); g.save(); g.rotate(.62); poly(g, [[-.42, -.74], [-.26, -.42], [-.28, .3], [-.14, .34], [-.14, .42], [-.28, .44], [-.28, .72], [-.5, .72], [-.5, .44], [-.64, .42], [-.64, .34], [-.5, .3], [-.52, -.42]]); g.restore(); },
    gravel(g) { poly(g, [[-.95, -.55], [.6, -.55], [.98, -.32], [.5, -.12], [.34, .18], [.5, .5], [.72, .78], [-.56, .78], [-.34, .5], [-.2, .18], [-.26, -.1], [-.7, -.14]]); },
    minionMelee(g) { poly(g, [[0, -.9], [.72, -.1], [.72, .34], [0, -.34], [-.72, .34], [-.72, -.1]]); poly(g, [[0, .1], [.5, .58], [.5, .9], [0, .5], [-.5, .9], [-.5, .58]]); },
    minionRanged(g) { g.lineWidth = .2; g.beginPath(); g.arc(0, 0, .66, 0, TAU); g.stroke(); g.beginPath(); g.arc(0, 0, .22, 0, TAU); g.fill(); },
    monster(g) { for (const s of [-1, 1]) poly(g, [[s * .2, -.9], [s * .86, -.3], [s * .2, .3]]); g.beginPath(); g.arc(0, .46, .22, 0, TAU); g.fill(); },
    big(g) { for (const s of [-1, 1]) poly(g, [[s * .12, -.34], [s * 1, -.98], [s * .8, .1], [s * .3, .4]]); poly(g, [[-.34, .2], [.34, .2], [0, .96]]); },
    boss(g) { poly(g, [[-.92, .55], [-.98, -.5], [-.46, -.05], [0, -.92], [.46, -.05], [.98, -.5], [.92, .55]]); poly(g, [[-.82, .68], [.82, .68], [.8, .9], [-.8, .9]]); },
  };

  function rim(g, R, tier) {
    const seg = (r, w, cols, n = 64) => { g.lineWidth = w; for (let i = 0; i < n; i++) { g.strokeStyle = cols(i / n); g.beginPath(); g.arc(0, 0, r, i / n * TAU - .01, (i + 1) / n * TAU + .01); g.stroke(); } };
    const shine = (a, b) => t => mix(a, b, Math.abs(Math.sin(t * Math.PI * 2 + .8)));
    const w = R * .15, r = R * .925;
    if (tier === 0) { seg(r, w * .72, shine('#7c4a2c', '#c58357')); }
    else if (tier === 1) { seg(r, w, shine('#6f4a1e', '#cf9c52')); for (let i = 0; i < 16; i++) { g.save(); g.rotate(i / 16 * TAU); g.fillStyle = '#4a2f12'; g.fillRect(-R * .02, -R, R * .04, w * .9); g.restore(); } }
    else if (tier === 2) { seg(r, w, shine('#7a8590', '#f0f4f7')); for (let i = 0; i < 60; i++) { g.save(); g.rotate(i / 60 * TAU); g.fillStyle = 'rgba(40,52,64,.55)'; g.fillRect(-R * .007, -R, R * .014, w * .85); g.restore(); } }
    else if (tier === 3) { seg(r, w * 1.05, shine('#a06f12', '#ffe48a')); for (let i = 0; i < 24; i++) { g.save(); g.rotate(i / 24 * TAU); g.fillStyle = '#fff3c0'; g.beginPath(); g.arc(0, -r, R * .036, 0, TAU); g.fill(); g.fillStyle = '#8a5d0c'; g.beginPath(); g.arc(R * .008, -r + R * .012, R * .016, 0, TAU); g.fill(); g.restore(); } }
    else if (tier === 4) { seg(r, w * 1.1, shine('#6f8b99', '#f5fdff')); seg(r - w * .4, R * .015, () => '#30454f'); for (let i = 0; i < 8; i++) { g.save(); g.rotate(i / 8 * TAU); g.fillStyle = '#b6f0ff'; g.beginPath(); g.moveTo(0, -R * 1.0); g.lineTo(R * .07, -r); g.lineTo(0, -R * .84); g.lineTo(-R * .07, -r); g.closePath(); g.fill(); g.restore(); } }
    else { seg(r, w * 1.2, t => `hsl(${t * 360 + 200},90%,${64 + Math.sin(t * 25) * 10}%)`, 96); seg(r + w * .5, R * .012, () => 'rgba(255,255,255,.8)'); for (let i = 0; i < 12; i++) { g.save(); g.rotate(i / 12 * TAU); g.fillStyle = '#fff'; star2(g, 0, -r, R * .085); g.restore(); } }
  }
  function star2(g, x, y, r) { g.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, l = i % 2 ? r * .3 : r; g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * l, y + Math.sin(a) * l); } g.closePath(); g.fill(); }
  function hex(c) { const n = parseInt(c.slice(1), 16); return [n >> 16, n >> 8 & 255, n & 255]; }
  function mix(a, b, t) { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; }

  const cache = new Map();
  function coin(key, R, emblem, metal, team, tier = -1, emblemScale = .56) {
    const id = `${key}|${R}|${team}|${tier}`; if (cache.has(id)) return cache.get(id);
    const P = 3, S = R * 2 + P * 2, c = cv(S, S), g = c.getContext('2d');
    g.translate(S / 2, S / 2);
    // field
    const inner = tier >= 0 ? R * .84 : R * .9;
    if (tier >= 0) rim(g, R, tier);
    else { const e = g.createLinearGradient(-R, -R, R, R); e.addColorStop(0, metal[0]); e.addColorStop(1, metal[1]); g.fillStyle = e; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill(); }
    if (team !== null && team !== undefined && team >= 0) { g.strokeStyle = TEAM[team]; g.lineWidth = R * .085; g.beginPath(); g.arc(0, 0, inner - R * .01, 0, TAU); g.stroke(); }
    const f = g.createRadialGradient(-R * .3, -R * .35, R * .05, 0, 0, inner);
    f.addColorStop(0, metal[0]); f.addColorStop(1, metal[1]);
    g.fillStyle = f; g.beginPath(); g.arc(0, 0, inner - R * .05, 0, TAU); g.fill();
    // minted inner bevel
    g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = R * .03; g.beginPath(); g.arc(R * .01, R * .015, inner - R * .11, 0, TAU); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.28)'; g.beginPath(); g.arc(-R * .01, -R * .015, inner - R * .11, 0, TAU); g.stroke();
    // emblem struck into the metal
    const E = EMBLEM[emblem], sc = R * emblemScale;
    const pass = (dx, dy, col) => { g.save(); g.translate(dx, dy); g.scale(sc, sc); g.fillStyle = col; g.strokeStyle = col; E(g); g.restore(); };
    if (E) { pass(R * .028, R * .035, 'rgba(255,255,255,.5)'); pass(-R * .026, -R * .03, 'rgba(0,0,0,.45)'); pass(0, 0, mix(metal[1], '#14100a', .55)); }
    // sheen
    g.save(); g.beginPath(); g.arc(0, 0, inner - R * .06, 0, TAU); g.clip();
    const sh = g.createLinearGradient(-R, -R, R * .4, R * .4); sh.addColorStop(0, 'rgba(255,255,255,.3)'); sh.addColorStop(.46, 'rgba(255,255,255,.04)'); sh.addColorStop(.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,.14)');
    g.fillStyle = sh; g.fillRect(-R, -R, R * 2, R * 2); g.restore();
    const out = { c, R, P, S }; cache.set(id, out); return out;
  }
  // ---------- comic-book portraits: 12 original characters, drawn in a -1..1 box ----------
  const INK = '#14100e', SKIN = ['#f2c9a0', '#d79b6c', '#a86f47'];
  const ink = (g, trace, fill, lw = .065) => { g.beginPath(); trace(); if (fill) { g.fillStyle = fill; g.fill(); } g.strokeStyle = INK; g.lineWidth = lw; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); };
  const pts = (g, p) => () => { p.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.closePath(); };
  const oval = (g, x, y, rx, ry = rx, rot = 0) => () => g.ellipse(x, y, rx, ry, rot, 0, TAU);
  const flat = (g, trace, fill) => { g.beginPath(); trace(); g.fillStyle = fill; g.fill(); };
  const stroke = (g, trace, col, lw = .06) => { g.beginPath(); trace(); g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); };
  const bust = (g, col, trim) => { ink(g, () => { g.moveTo(-1.05, 1.1); g.quadraticCurveTo(-1, .55, -.42, .46); g.lineTo(.42, .46); g.quadraticCurveTo(1, .55, 1.05, 1.1); g.closePath(); }, col); if (trim) stroke(g, () => { g.moveTo(-.4, .5); g.quadraticCurveTo(0, .78, .4, .5); }, trim, .1); };
  const face = (g, skin = SKIN[0]) => ink(g, oval(g, 0, -.04, .44, .54), skin);
  // eyes in a mask: wide and clear on heroes, narrow and slanted on villains
  const heroEyes = (g, y = -.14, col = '#fff') => { for (const s of [-1, 1]) ink(g, pts(g, [[s * .07, y + .07], [s * .34, y - .07], [s * .38, y + .05], [s * .14, y + .13]]), col, .04); };
  const badEyes = (g, y = -.14, col = '#9dff3c') => { for (const s of [-1, 1]) ink(g, pts(g, [[s * .06, y + .1], [s * .38, y - .1], [s * .32, y + .08], [s * .12, y + .14]]), col, .04); };
  const smile = (g, y = .26) => stroke(g, () => { g.moveTo(-.16, y); g.quadraticCurveTo(0, y + .13, .16, y); }, INK, .05);
  const sneer = (g, y = .3) => stroke(g, () => { g.moveTo(-.18, y + .04); g.lineTo(.04, y); g.lineTo(.2, y - .08); }, INK, .05);

  const FACE = {
    hero: {
      // flying-ace goggles and a long scarf
      vesper(g) { bust(g, '#7a4a26', '#e0b552'); ink(g, () => { g.moveTo(-.34, .42); g.lineTo(.34, .42); g.lineTo(.6, .78); g.lineTo(.12, .62); g.lineTo(-.5, .8); g.closePath(); }, '#d8402c'); face(g); ink(g, () => { g.arc(0, -.12, .52, Math.PI * 1.02, Math.PI * 1.98); g.lineTo(.54, .18); g.lineTo(.36, .2); g.lineTo(.34, -.2); g.lineTo(-.34, -.2); g.lineTo(-.36, .2); g.lineTo(-.54, .18); g.closePath(); }, '#8a5a30'); for (const s of [-1, 1]) { ink(g, oval(g, s * .21, -.14, .2), '#e0b552', .05); ink(g, oval(g, s * .21, -.14, .13), '#7fe3e0', .04); flat(g, oval(g, s * .17, -.19, .045), '#fff'); } stroke(g, () => { g.moveTo(-.03, -.15); g.lineTo(.03, -.15); }, INK, .05); smile(g); },
      // fencing mask with a mesh front and a tall plume
      kade(g) { ink(g, () => { g.moveTo(.1, -.62); g.quadraticCurveTo(.62, -1.1, .88, -.62); g.quadraticCurveTo(.56, -.74, .3, -.42); g.closePath(); }, '#e0392e'); bust(g, '#f3f0e6', '#e0b552'); ink(g, oval(g, 0, -.04, .5, .6), '#cfd6dc'); for (let i = -4; i <= 4; i++) stroke(g, () => { g.moveTo(i * .1, -.54); g.lineTo(i * .1, .46); }, 'rgba(20,16,14,.55)', .025); for (let i = -5; i <= 5; i++) stroke(g, () => { g.moveTo(-.46, -.04 + i * .1); g.lineTo(.46, -.04 + i * .1); }, 'rgba(20,16,14,.55)', .025); ink(g, () => g.rect(-.5, .38, 1, .13), '#e0b552', .05); heroEyes(g, -.12, '#fffbe8'); },
      // speckled feather cowl, small bright bill
      ione(g) { bust(g, '#187d84', '#ffd34d'); for (const s of [-1, 1]) ink(g, pts(g, [[s * .34, -.42], [s * .98, -.82], [s * .84, -.36], [s * .98, -.12], [s * .7, -.02], [s * .78, .24], [s * .4, .2]]), '#1fa3a8'); face(g, SKIN[1]); ink(g, () => { g.arc(0, -.06, .5, Math.PI * .98, Math.PI * 2.02); g.lineTo(.26, -.02); g.lineTo(0, .08); g.lineTo(-.26, -.02); g.closePath(); }, '#1fa3a8'); for (const [x, y] of [[-.26, -.42], [-.06, -.48], [.16, -.44], [.3, -.3], [-.32, -.24], [0, -.3]]) flat(g, oval(g, x, y, .035), '#eafff7'); heroEyes(g, -.17); ink(g, pts(g, [[-.09, -.02], [.09, -.02], [0, .13]]), '#ffc23c', .04); smile(g, .3); },
      // sunrise crown and a pale hood
      solenne(g) { for (let i = 0; i < 9; i++) { const a = Math.PI * (1.06 + i * .11); ink(g, pts(g, [[Math.cos(a - .1) * .58, -.1 + Math.sin(a - .1) * .58], [Math.cos(a) * 1.02, -.1 + Math.sin(a) * 1.02], [Math.cos(a + .1) * .58, -.1 + Math.sin(a + .1) * .58]]), '#ffc23c', .045); } bust(g, '#fff4d6', '#e8912d'); ink(g, oval(g, 0, -.02, .56, .66), '#fff4d6'); face(g, SKIN[2]); ink(g, () => { g.moveTo(-.42, -.3); g.quadraticCurveTo(0, -.52, .42, -.3); g.lineTo(.4, -.22); g.quadraticCurveTo(0, -.42, -.4, -.22); g.closePath(); }, '#ffc23c', .045); flat(g, oval(g, 0, -.38, .07), '#e8491f'); for (const s of [-1, 1]) flat(g, oval(g, s * .19, -.1, .07, .05), INK); smile(g); },
      // indigo hood with a low half-sun on the brow
      sable(g) { bust(g, '#2b2a6e', '#8f7cf2'); ink(g, () => { g.moveTo(-.62, .5); g.quadraticCurveTo(-.74, -.62, 0, -.74); g.quadraticCurveTo(.74, -.62, .62, .5); g.closePath(); }, '#2b2a6e'); ink(g, oval(g, 0, -.02, .4, .48), '#17163f', .05); ink(g, () => { g.moveTo(-.4, .08); g.quadraticCurveTo(0, .02, .4, .08); g.quadraticCurveTo(.34, .46, 0, .5); g.quadraticCurveTo(-.34, .46, -.4, .08); g.closePath(); }, '#8f7cf2', .05); heroEyes(g, -.13); ink(g, () => { g.arc(0, -.5, .13, Math.PI, 0); g.closePath(); }, '#ffb347', .04); stroke(g, () => { g.moveTo(-.22, -.48); g.lineTo(.22, -.48); }, '#ffb347', .035); },
      // castle-topped stone helm and a slit visor
      gravel(g) { bust(g, '#c8622a', '#ffd34d'); ink(g, pts(g, [[-.56, .4], [-.56, -.54], [-.4, -.54], [-.4, -.74], [-.2, -.74], [-.2, -.54], [-.08, -.54], [-.08, -.74], [.08, -.74], [.08, -.54], [.2, -.54], [.2, -.74], [.4, -.74], [.4, -.54], [.56, -.54], [.56, .4]]), '#9aa39a'); ink(g, () => g.rect(-.42, -.2, .84, .17), INK, .04); for (const s of [-1, 1]) flat(g, oval(g, s * .19, -.115, .1, .04), '#7fe3ff'); for (const [x, y] of [[-.42, .12], [.42, .12], [-.42, .3], [.42, .3], [0, .3]]) flat(g, oval(g, x, y, .04), '#5a615a'); stroke(g, () => { g.moveTo(-.3, .14); g.lineTo(.3, .14); }, 'rgba(20,16,14,.5)', .035); },
    },
    villain: {
      // iron face plate with a glowing keyhole
      vesper(g) { bust(g, '#2d2f3a', '#9dff3c'); ink(g, oval(g, 0, -.04, .5, .6), '#6c7080'); for (const [x, y] of [[-.38, -.32], [.38, -.32], [-.42, .16], [.42, .16], [-.24, .44], [.24, .44]]) { ink(g, oval(g, x, y, .055), '#c6c9d2', .03); } ink(g, () => { g.arc(0, -.16, .17, Math.PI * .72, Math.PI * .28); g.lineTo(.15, .3); g.lineTo(-.15, .3); g.closePath(); }, '#9dff3c', .05); badEyes(g, -.38, '#ff6a1f'); },
      // bicorne hat, orange half-mask, waxed moustache
      kade(g) { bust(g, '#3a0f18', '#e0b552'); face(g, SKIN[0]); ink(g, () => { g.moveTo(-.92, -.42); g.quadraticCurveTo(0, -1.2, .92, -.42); g.quadraticCurveTo(0, -.56, -.92, -.42); g.closePath(); }, '#17121c'); stroke(g, () => { g.moveTo(-.7, -.5); g.quadraticCurveTo(0, -1.0, .7, -.5); }, '#e0b552', .035); ink(g, () => { g.moveTo(-.48, -.3); g.quadraticCurveTo(0, -.42, .48, -.3); g.lineTo(.4, .04); g.lineTo(.08, -.02); g.lineTo(0, .06); g.lineTo(-.08, -.02); g.lineTo(-.4, .04); g.closePath(); }, '#ff6a1f', .05); badEyes(g, -.17, '#fff3c0'); ink(g, () => { g.moveTo(0, .22); g.quadraticCurveTo(.3, .1, .46, -.02); g.quadraticCurveTo(.34, .24, 0, .32); g.quadraticCurveTo(-.34, .24, -.46, -.02); g.quadraticCurveTo(-.3, .1, 0, .22); g.closePath(); }, INK, .03); sneer(g, .4); },
      // wide-brimmed witch hat and a hex on the brow
      ione(g) { bust(g, '#2c1548', '#9dff3c'); for (const s of [-1, 1]) ink(g, () => { g.moveTo(s * .34, -.3); g.quadraticCurveTo(s * .82, .1, s * .62, .62); g.lineTo(s * .3, .5); g.closePath(); }, '#5b2a86'); face(g, '#cfe6c2'); ink(g, pts(g, [[-.32, -.36], [.04, -1.12], [.32, -.36]]), '#2c1548'); ink(g, () => g.ellipse(0, -.36, .92, .17, 0, 0, TAU), '#2c1548'); stroke(g, () => g.ellipse(0, -.36, .5, .08, 0, 0, Math.PI), '#9dff3c', .04); const hex = []; for (let i = 0; i < 6; i++) hex.push([Math.cos(i / 6 * TAU) * .1, -.15 + Math.sin(i / 6 * TAU) * .1]); ink(g, pts(g, hex), '#9dff3c', .035); badEyes(g, -.02, '#c98cff'); stroke(g, () => { g.moveTo(-.14, .34); g.quadraticCurveTo(0, .24, .14, .34); }, '#7a1f6e', .06); },
      // long bone beak, green lenses, broad black hat
      solenne(g) { bust(g, '#16201a', '#9dff3c'); ink(g, oval(g, 0, -.1, .46, .46), '#d9cfae'); ink(g, () => { g.moveTo(-.2, .02); g.quadraticCurveTo(.1, .2, .1, .96); g.quadraticCurveTo(-.08, .5, -.28, .22); g.closePath(); }, '#d9cfae'); ink(g, () => { g.moveTo(.22, .02); g.quadraticCurveTo(.3, .3, .1, .96); g.quadraticCurveTo(.08, .4, -.2, .02); g.closePath(); }, '#b5aa86'); for (const s of [-1, 1]) { ink(g, oval(g, s * .22, -.12, .16), '#2d3a22', .05); ink(g, oval(g, s * .22, -.12, .1), '#9dff3c', .03); flat(g, oval(g, s * .19, -.16, .03), '#efffe0'); } ink(g, () => g.ellipse(0, -.46, .96, .17, 0, 0, TAU), '#111614'); ink(g, () => { g.moveTo(-.46, -.5); g.lineTo(-.38, -.94); g.lineTo(.38, -.94); g.lineTo(.46, -.5); g.closePath(); }, '#111614'); stroke(g, () => { g.moveTo(-.44, -.58); g.lineTo(.44, -.58); }, '#9dff3c', .05); },
      // hood and a stitched grin
      sable(g) { bust(g, '#1a1a22', '#ff6a1f'); ink(g, () => { g.moveTo(-.64, .5); g.quadraticCurveTo(-.7, -.5, 0, -.92); g.quadraticCurveTo(.7, -.5, .64, .5); g.closePath(); }, '#24242e'); ink(g, oval(g, 0, 0, .4, .48), '#e9e4d4', .05); badEyes(g, -.14, '#ff6a1f'); stroke(g, () => { g.moveTo(-.28, .2); g.quadraticCurveTo(0, .36, .28, .16); }, INK, .05); for (let i = -3; i <= 3; i++) { const x = i * .08; stroke(g, () => { g.moveTo(x, .2 + (1 - Math.abs(i) / 3) * .08); g.lineTo(x + .012, .34 + (1 - Math.abs(i) / 3) * .06); }, INK, .03); } ink(g, pts(g, [[.46, -.62], [.62, -.98], [.58, -.56]]), '#d4d8e0', .035); },
      // bald brute with a riveted iron jaw
      gravel(g) { bust(g, '#3c2a22', '#ff6a1f'); ink(g, oval(g, 0, -.16, .5, .54), '#b08a6c'); stroke(g, () => { g.moveTo(-.34, -.42); g.lineTo(-.12, -.32); }, INK, .06); stroke(g, () => { g.moveTo(.34, -.42); g.lineTo(.12, -.32); }, INK, .06); ink(g, oval(g, -.2, -.16, .1, .07), '#fff3e0', .04); flat(g, oval(g, -.18, -.15, .04), INK); ink(g, oval(g, .2, -.16, .12, .09), '#ff6a1f', .05); flat(g, oval(g, .2, -.16, .04), '#fff3c0'); ink(g, pts(g, [[-.62, .02], [.62, .02], [.54, .54], [.26, .68], [-.26, .68], [-.54, .54]]), '#7a808c'); stroke(g, () => { g.moveTo(-.42, .3); g.lineTo(.42, .3); }, INK, .05); for (let i = -3; i <= 3; i++) stroke(g, () => { g.moveTo(i * .13, .14); g.lineTo(i * .13, .46); }, INK, .035); for (const [x, y] of [[-.5, .1], [.5, .1], [-.42, .52], [.42, .52]]) ink(g, oval(g, x, y, .05), '#d6dae2', .03); },
    },
  };
  const FIELD = {
    hero: { vesper: ['#ffd34d', '#ffae35'], kade: ['#ff8a5c', '#ffd2a8'], ione: ['#8ef0e3', '#3fc6c6'], solenne: ['#ffe9a0', '#ffc05c'], sable: ['#b4a7ff', '#7f73e8'], gravel: ['#ffc06a', '#f08a3c'] },
    villain: { vesper: '#9dff3c', kade: '#ff6a1f', ione: '#9dff3c', solenne: '#9dff3c', sable: '#ff6a1f', gravel: '#ff6a1f' },
  };
  function sunburst(g, r, a, b) {
    g.fillStyle = a; g.fillRect(-r, -r, r * 2, r * 2); g.fillStyle = b;
    for (let i = 0; i < 14; i++) { const a0 = i / 14 * TAU + .1; g.beginPath(); g.moveTo(0, r * .15); g.lineTo(Math.cos(a0) * r * 1.8, r * .15 + Math.sin(a0) * r * 1.8); g.lineTo(Math.cos(a0 + TAU / 28) * r * 1.8, r * .15 + Math.sin(a0 + TAU / 28) * r * 1.8); g.closePath(); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,.24)'; const st = r * .15; for (let y = -r; y < r; y += st) for (let x = -r + ((y / st | 0) % 2 ? st / 2 : 0); x < r; x += st) { const k = (y + r) / (2 * r); g.beginPath(); g.arc(x, y, st * .3 * (1 - k), 0, TAU); g.fill(); }
  }
  function darkField(g, r, accent) {
    g.fillStyle = '#17121c'; g.fillRect(-r, -r, r * 2, r * 2);
    g.strokeStyle = accent; g.globalAlpha = .28; g.lineWidth = r * .03; g.lineJoin = 'miter';
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + .35; let x = 0, y = 0; g.beginPath(); g.moveTo(Math.cos(a) * r * .3, Math.sin(a) * r * .3); for (let k = 1; k <= 4; k++) { const rr = r * (.3 + k * .22), o = (k % 2 ? .13 : -.13); x = Math.cos(a + o) * rr; y = Math.sin(a + o) * rr; g.lineTo(x, y); } g.stroke(); }
    g.globalAlpha = 1;
    // jagged inner edge
    g.fillStyle = '#0c090f'; g.beginPath(); g.arc(0, 0, r * 1.2, 0, TAU); for (let i = 0; i < 44; i++) { const a = i / 44 * TAU, rr = r * (i % 2 ? .985 : .84); g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fill('evenodd');
    g.strokeStyle = accent; g.lineWidth = r * .028; g.beginPath(); for (let i = 0; i < 44; i++) { const a = i / 44 * TAU, rr = r * (i % 2 ? .985 : .84); g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.stroke();
  }
  function comic(key, R, team, tier, field, draw, rimCol) {
    const id = `${key}|${R}|${team}|${tier}`; if (cache.has(id)) return cache.get(id);
    const P = 3, S = R * 2 + P * 2, c = cv(S, S), g = c.getContext('2d');
    g.translate(S / 2, S / 2);
    const inner = tier >= 0 ? R * .84 : R * .88;
    if (tier >= 0) rim(g, R, tier); else { g.fillStyle = rimCol || '#3a3a3a'; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill(); g.strokeStyle = INK; g.lineWidth = R * .05; g.beginPath(); g.arc(0, 0, R * .97, 0, TAU); g.stroke(); }
    if (team >= 0) { g.strokeStyle = TEAM[team]; g.lineWidth = R * .085; g.beginPath(); g.arc(0, 0, inner - R * .01, 0, TAU); g.stroke(); }
    const r = inner - R * .05;
    g.save(); g.beginPath(); g.arc(0, 0, r, 0, TAU); g.clip();
    field(g, r);
    g.save(); g.scale(r * .98, r * .98); g.translate(0, .06); draw(g); g.restore();
    const sh = g.createLinearGradient(-R, -R, R * .4, R * .4); sh.addColorStop(0, 'rgba(255,255,255,.22)'); sh.addColorStop(.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,.14)'); g.fillStyle = sh; g.fillRect(-R, -R, R * 2, R * 2);
    g.restore();
    g.strokeStyle = INK; g.lineWidth = R * .05; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke();
    const out = { c, R, P, S }; cache.set(id, out); return out;
  }
  function champCoin(id, team, tier, R = 52) {
    const side = team === 1 ? 'villain' : 'hero', f = FIELD[side][id];
    return comic(`hv${side}${id}`, R, team === 1 ? 1 : 0, tier, side === 'hero' ? (g, r) => sunburst(g, r, f[0], f[1]) : (g, r) => darkField(g, r, f), g => FACE[side][id](g));
  }
  const MINION = {
    // Deputies: peaked cap and a round brass badge; the ranged ones carry a whistle
    deputy(g, ranged) { bust(g, '#2f6fae', '#e0b552'); face(g); ink(g, () => { g.moveTo(-.54, -.26); g.quadraticCurveTo(0, -.46, .54, -.26); g.lineTo(.46, -.68); g.quadraticCurveTo(0, -.86, -.46, -.68); g.closePath(); }, '#1f4f7d'); ink(g, () => g.ellipse(0, -.27, .62, .12, 0, 0, Math.PI), '#10304f'); ink(g, oval(g, 0, -.56, .11), '#e0b552', .04); for (const s of [-1, 1]) flat(g, oval(g, s * .19, -.07, .07, .06), INK); smile(g, .24); if (ranged) ink(g, () => g.rect(-.09, .28, .3, .13), '#e0b552', .04); },
    // Goons: flat cap and stubble; the ranged ones wear a bandana
    goon(g, ranged) { bust(g, '#5a2c20', '#ff6a1f'); face(g, '#c9a07c'); ink(g, () => { g.moveTo(-.56, -.2); g.quadraticCurveTo(-.5, -.74, .08, -.72); g.quadraticCurveTo(.62, -.68, .72, -.3); g.quadraticCurveTo(.1, -.42, -.56, -.2); g.closePath(); }, '#3b3128'); badEyes(g, -.08, '#fff0d8'); if (ranged) ink(g, () => { g.moveTo(-.44, .1); g.quadraticCurveTo(0, .02, .44, .1); g.lineTo(.3, .44); g.lineTo(0, .56); g.lineTo(-.3, .44); g.closePath(); }, '#d8402c', .05); else { for (const [x, y] of [[-.2, .26], [-.08, .36], [.08, .36], [.2, .26], [-.28, .12], [.28, .12], [0, .42]]) flat(g, oval(g, x, y, .03), '#5c4632'); sneer(g, .26); } },
  };
  function minionCoin(team, ranged) {
    const hero = team === 0;
    return comic(`mn${team}${ranged ? 'r' : 'm'}`, 30, -1, -1, hero ? (g, r) => sunburst(g, r, '#bfe2fb', '#86c3ee') : (g, r) => { g.fillStyle = '#2a1712'; g.fillRect(-r, -r, r * 2, r * 2); g.fillStyle = '#ff6a1f'; g.globalAlpha = .34; for (let i = 0; i < 7; i++) { g.save(); g.rotate(i / 7 * TAU); g.beginPath(); g.moveTo(-r * .12, 0); g.lineTo(0, -r * 1.2); g.lineTo(r * .12, 0); g.closePath(); g.fill(); g.restore(); } g.globalAlpha = 1; }, g => MINION[hero ? 'deputy' : 'goon'](g, ranged), hero ? '#2f6fae' : '#7e2a1e');
  }
  // Civilians are deliberately plain: a soft disc, a simple face and everyday colours.
  function civCoin(v) {
    const clothes = ['#c9a06a', '#8fb37a', '#c98a8a', '#8aa6c9'][v % 4], skin = SKIN[v % 3];
    return comic('civ' + (v % 4), 20, -1, -1, (g, r) => { g.fillStyle = '#efe6cf'; g.fillRect(-r, -r, r * 2, r * 2); }, g => { bust(g, clothes); face(g, skin); ink(g, () => { g.arc(0, -.12, .47, Math.PI, 0); g.lineTo(.3, -.3); g.lineTo(-.3, -.3); g.closePath(); }, ['#3f2d1e', '#6a4a2a', '#a8a29a', '#8a5a30'][v % 4], .04); for (const s of [-1, 1]) flat(g, oval(g, s * .17, -.08, .05), INK); smile(g, .2); }, '#a8987a');
  }
  const monsterCoin = (big, boss) => boss ? coin('boss', 104, 'boss', METAL.boss, -1, 3, .6) : big ? coin('big', 60, 'big', METAL.big, -1, 1, .58) : coin('mon', 34, 'monster', METAL.monster, -1, -1, .52);

  // soft dot and shadow sprites
  function glow(color) {
    const id = 'g' + color; if (cache.has(id)) return cache.get(id);
    const c = cv(64, 64), g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, color); r.addColorStop(.3, color); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = .9; g.fillStyle = r; g.fillRect(0, 0, 64, 64); cache.set(id, c); return c;
  }
  let shadowC = null;
  function shadow() { if (shadowC) return shadowC; const c = cv(128, 128), g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 8, 64, 64, 64); r.addColorStop(0, 'rgba(4,16,14,.62)'); r.addColorStop(.62, 'rgba(4,16,14,.34)'); r.addColorStop(1, 'rgba(4,16,14,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); return shadowC = c; }

  function drawEmblemIcon(g, name, x, y, r, col) { g.save(); g.translate(x, y); g.scale(r, r); g.fillStyle = col; g.strokeStyle = col; EMBLEM[name](g); g.restore(); }

  const TILT = .74;
  function seeded(s) { return () => (s = (s * 16807) % 2147483647) / 2147483647; }

  // One unique struck icon per ability.
  const ln = (g, ...p) => { g.beginPath(); for (let i = 0; i < p.length; i += 2) g[i ? 'lineTo' : 'moveTo'](p[i], p[i + 1]); g.stroke(); };
  const arc = (g, x, y, r, a = 0, b = TAU) => { g.beginPath(); g.arc(x, y, r, a, b); g.stroke(); };
  const dot = (g, x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
  const ICON = {
    vesper: [
      g => { ln(g, -.8, .8, .1, -.1); poly(g, [[.9, -.9], [.48, -.68], [.22, -.42], [.42, -.22], [.68, -.48]]); ln(g, -.75, .25, -.3, -.2); ln(g, -.25, .75, .2, .3); },
      g => { for (const o of [-.5, .05]) ln(g, o - .2, -.68, o + .45, 0, o - .2, .68); arc(g, -.72, .55, .22); arc(g, -.5, .82, .13); },
      g => { g.beginPath(); g.moveTo(-.95, 0); g.quadraticCurveTo(0, -.85, .95, 0); g.quadraticCurveTo(0, .85, -.95, 0); g.stroke(); dot(g, 0, 0, .28); ln(g, 0, -.95, 0, -.6); ln(g, 0, .6, 0, .95); },
    ],
    kade: [
      g => { poly(g, [[.95, -.6], [.1, .28], [-.2, -.02], [.62, -.92]]); ln(g, -.3, -.3, .3, .3); ln(g, -.55, .05, -.05, .6); ln(g, -.85, .35, -.45, .78); },
      g => poly(g, [[0, -.95], [.78, -.65], [.72, .15], [0, .95], [-.72, .15], [-.78, -.65]]),
      g => { poly(g, [[-.2, -.95], [.2, -.95], [.2, -.2], [.48, -.2], [0, .3], [-.48, -.2], [-.2, -.2]]); g.beginPath(); g.ellipse(0, .55, .9, .3, 0, 0, Math.PI); g.stroke(); ln(g, -.9, .55, -.55, .4); ln(g, .9, .55, .55, .4); },
    ],
    ione: [
      g => { dot(g, 0, 0, .42); g.save(); g.scale(1, .42); arc(g, 0, 0, .9); g.restore(); dot(g, .72, -.3, .1); },
      g => { poly(g, [[0, -.95], [.62, 0], [.08, .02], [.24, .4], [0, .95], [-.62, 0], [-.08, -.02], [-.24, -.4]]); },
      g => { arc(g, -.62, .55, .3); arc(g, 0, 0, .3); arc(g, .62, -.55, .3); dot(g, -.62, .55, .1); dot(g, 0, 0, .1); dot(g, .62, -.55, .1); },
    ],
    solenne: [
      g => { poly(g, [[-.17, -.7], [.17, -.7], [.17, -.25], [.62, -.25], [.62, .1], [.17, .1], [.17, .55], [-.17, .55], [-.17, .1], [-.62, .1], [-.62, -.25], [-.17, -.25]]); ln(g, -.85, .88, .85, .88); },
      g => { g.beginPath(); g.arc(0, .55, .92, Math.PI, 0); g.stroke(); arc(g, 0, .55, .5, Math.PI, 0); ln(g, -1, .6, 1, .6); },
      g => { g.beginPath(); g.arc(0, .42, .5, Math.PI, 0); g.closePath(); g.fill(); for (let i = 0; i < 7; i++) { const a = Math.PI + (i + .0) / 6 * Math.PI; ln(g, Math.cos(a) * .68, .42 + Math.sin(a) * .68, Math.cos(a) * .98, .42 + Math.sin(a) * .98); } ln(g, -1, .68, 1, .68); },
    ],
    sable: [
      g => { g.lineWidth = .24; g.lineCap = 'round'; arc(g, -.65, .65, 1.25, -1.5, -.08); g.lineWidth = .1; arc(g, -.65, .65, .82, -1.4, -.18); },
      g => { dot(g, -.5, .05, .34); arc(g, .5, .05, .34); g.beginPath(); g.arc(0, -.15, .68, 3.5, 5.9); g.stroke(); poly(g, [[.5, -.86], [.82, -.48], [.38, -.42]]); },
      g => { ln(g, -.62, .95, .28, -.72); g.beginPath(); g.moveTo(.28, -.72); g.quadraticCurveTo(-.4, -1, -.98, -.38); g.quadraticCurveTo(-.45, -.62, .08, -.34); g.closePath(); g.fill(); },
    ],
    gravel: [
      g => { ln(g, 0, -.95, 0, .1); g.lineWidth = .22; g.lineCap = 'round'; g.beginPath(); g.arc(-.25, .15, .55, -.25, 2.85); g.stroke(); poly(g, [[-.75, .42], [-.9, -.2], [-.4, .02]]); },
      g => { arc(g, 0, 0, .24); g.save(); g.scale(1, .5); arc(g, 0, 0, .58); arc(g, 0, 0, .98); g.restore(); ln(g, 0, -.85, 0, -.5); },
      g => { poly(g, [[.15, -.72], [.74, -.42], [.86, .2], [.42, .72], [-.25, .66], [-.48, .1], [-.32, -.45]]); ln(g, -.95, -.34, -.58, -.34); ln(g, -1, .08, -.72, .08); ln(g, -.92, .5, -.62, .5); },
    ],
  };
  const OFF = ['#7c8a84', '#39473f'];
  function abilityCoin(champ, slot, on, R = 40) {
    const id = `ab${champ}${slot}${on}${R}`; if (cache.has(id)) return cache.get(id);
    const P = 3, S = R * 2 + P * 2, c = cv(S, S), g = c.getContext('2d'), metal = on ? METAL[champ] : OFF;
    g.translate(S / 2, S / 2);
    const e = g.createLinearGradient(-R, -R, R, R); e.addColorStop(0, on ? '#f8e2a4' : '#8b9791'); e.addColorStop(.5, on ? '#b98a35' : '#55635c'); e.addColorStop(1, on ? '#f0cf80' : '#7c8a84');
    g.fillStyle = e; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
    for (let i = 0; i < 44; i++) { g.save(); g.rotate(i / 44 * TAU); g.fillStyle = 'rgba(40,26,8,.32)'; g.fillRect(-.7, -R, 1.4, R * .09); g.restore(); }
    const f = g.createRadialGradient(-R * .3, -R * .35, R * .05, 0, 0, R * .86); f.addColorStop(0, metal[0]); f.addColorStop(1, metal[1]);
    g.fillStyle = f; g.beginPath(); g.arc(0, 0, R * .85, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = R * .04; g.beginPath(); g.arc(0, 1, R * .78, 0, TAU); g.stroke();
    const k = R * .52, draw = (dx, dy, col) => { g.save(); g.translate(dx, dy); g.scale(k, k); g.fillStyle = col; g.strokeStyle = col; g.lineWidth = .13; g.lineCap = 'round'; g.lineJoin = 'round'; ICON[champ][slot](g); g.restore(); };
    draw(1.1, 1.4, 'rgba(255,255,255,.42)'); draw(-.9, -1.1, 'rgba(0,0,0,.4)'); draw(0, 0, on ? mix(metal[1], '#14100a', .6) : '#1f2b27');
    cache.set(id, c); return c;
  }
  function iconURL(champ, slot) { return abilityCoin(champ, slot, true, 40).toDataURL(); }

  // moving light band that sweeps across a coin
  function sheen() {
    if (cache.has('sheen')) return cache.get('sheen');
    const frames = []; for (let f = 0; f < 12; f++) { const c = cv(96, 96), g = c.getContext('2d'); g.beginPath(); g.arc(48, 48, 44, 0, TAU); g.clip(); const o = -60 + f * 18, gr = g.createLinearGradient(o, o, o + 44, o + 44); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 96, 96); frames.push(c); }
    cache.set('sheen', frames); return frames;
  }
  function caustic() {
    if (cache.has('caustic')) return cache.get('caustic');
    const S = 128, c = cv(S, S), g = c.getContext('2d'), im = g.createImageData(S, S), W = TAU / S;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const v = Math.abs(Math.sin(x * W * 3 + Math.sin(y * W * 2) * 1.5) + Math.sin(y * W * 4 + Math.sin(x * W) * 1.7)), b = Math.pow(Math.max(0, 1 - v * 2), 2), i = (y * S + x) * 4;
      im.data[i] = 190; im.data[i + 1] = 245; im.data[i + 2] = 255; im.data[i + 3] = b * 255;
    }
    g.putImageData(im, 0, 0); cache.set('caustic', c); return c;
  }
  function vignette(w, h) {
    const id = `v${w}x${h}`; if (cache.has(id)) return cache.get(id);
    const c = cv(w / 2, h / 2), g = c.getContext('2d'), gr = g.createRadialGradient(w / 4, h / 4, h * .3, w / 4, h / 4, w * .34); gr.addColorStop(0, 'rgba(4,18,16,0)'); gr.addColorStop(1, 'rgba(4,18,16,.5)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h); cache.set(id, c); return c;
  }
  function shaft() {
    if (cache.has('shaft')) return cache.get('shaft');
    const c = cv(120, 400), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 400); gr.addColorStop(0, 'rgba(255,236,190,.55)'); gr.addColorStop(1, 'rgba(255,236,190,0)'); g.fillStyle = gr; g.fillRect(0, 0, 120, 400);
    g.globalCompositeOperation = 'destination-in'; const m = g.createLinearGradient(0, 0, 120, 0); m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(.5, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = m; g.fillRect(0, 0, 120, 400);
    cache.set('shaft', c); return c;
  }
  function brushSprite(b, seed) {
    const id = 'b' + seed + 'r' + b.r; if (cache.has(id)) return cache.get(id);
    const P = 14, h = 56, w = b.r * 2 + P * 2, ht = b.r * 2 * TILT + h + P, c = cv(w, ht), g = c.getContext('2d'), r = seeded(seed * 31 + 3), cx = w / 2, cy = h + b.r * TILT;
    const items = []; for (let i = 0; i < b.r * 1.8; i++) { const a = r() * TAU, d = Math.sqrt(r()) * b.r; items.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * TILT, 15 + r() * 15, r()]); }
    items.sort((p, q) => p[1] - q[1]);
    g.lineCap = 'round';
    for (const [x, y, l, v] of items) for (let k = -2; k <= 2; k++) { g.strokeStyle = v > .66 ? '#3f8a62' : v > .33 ? '#2e7152' : '#215a44'; g.lineWidth = 3.2; g.beginPath(); g.moveTo(x + k * 2.2, y); g.quadraticCurveTo(x + k * 3, y - l * .6, x + k * 6, y - l); g.stroke(); }
    const out = { c, ax: cx, ay: cy }; cache.set(id, out); return out;
  }

  // Reeded edge drawn under a coin face. Scaled per coin, tinted per metal.
  function reed(col = '#5a4426') {
    const id = 'reed' + col; if (cache.has(id)) return cache.get(id);
    const R0 = 56, ry = R0 * .84, T = R0 * .22, c = cv(R0 * 2 + 2, ry * 2 + T + 2), g = c.getContext('2d');
    g.translate(R0 + 1, ry + 1); g.fillStyle = col; g.beginPath(); g.ellipse(0, T, R0, ry, 0, 0, TAU); g.fill(); g.fillRect(-R0, 0, R0 * 2, T);
    for (let i = 0; i <= 60; i++) { const a = i / 60 * Math.PI, x = Math.cos(a) * R0, y = Math.sin(a) * ry, w = Math.max(.6, 2.4 * Math.sin(a)); g.fillStyle = i % 2 ? 'rgba(255,232,186,.42)' : 'rgba(10,6,2,.34)'; g.fillRect(x - w / 2, y + 1, w, T - 1.5); }
    const sh = g.createLinearGradient(0, 0, 0, ry + T); sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(0,0,0,.3)'); g.globalCompositeOperation = 'source-atop'; g.fillStyle = sh; g.fillRect(-R0, -ry, R0 * 2, ry * 2 + T);
    const out = { c, R0, ry, T }; cache.set(id, out); return out;
  }
  // Soft puff that fades to its own colour, so normal-blend smoke and fog have no dark fringe.
  function puff(r, g0, b, a = 1) {
    const id = `pf${r},${g0},${b},${a}`; if (cache.has(id)) return cache.get(id);
    const c = cv(64, 64), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${r},${g0},${b},${a})`); gr.addColorStop(.45, `rgba(${r},${g0},${b},${a * .55})`); gr.addColorStop(1, `rgba(${r},${g0},${b},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); cache.set(id, c); return c;
  }
  function cloud(v = 0) {
    const id = 'cl' + v; if (cache.has(id)) return cache.get(id);
    const c = cv(256, 128), g = c.getContext('2d'), r = seeded(v * 97 + 11);
    for (let i = 0; i < 9; i++) { const x = 50 + r() * 156, y = 36 + r() * 56, R = 26 + r() * 30, gr = g.createRadialGradient(x, y, 0, x, y, R); gr.addColorStop(0, 'rgba(8,26,34,.55)'); gr.addColorStop(1, 'rgba(8,26,34,0)'); g.fillStyle = gr; g.fillRect(x - R, y - R, R * 2, R * 2); }
    cache.set(id, c); return c;
  }
  function leaf(col) {
    const id = 'lf' + col; if (cache.has(id)) return cache.get(id);
    const c = cv(16, 10), g = c.getContext('2d'); g.fillStyle = col; g.beginPath(); g.moveTo(1, 5); g.quadraticCurveTo(8, -3, 15, 5); g.quadraticCurveTo(8, 13, 1, 5); g.fill(); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(2, 5); g.lineTo(14, 5); g.stroke();
    cache.set(id, c); return c;
  }
  // Wedges cut from a real coin sprite, so a shattered champion breaks into its own face.
  function shardsOf(spr, n = 7) {
    if (spr.shards) return spr.shards;
    const out = [], R = spr.S / 2;
    for (let i = 0; i < n; i++) {
      const c = cv(spr.S, spr.S), g = c.getContext('2d'), a0 = i / n * TAU, a1 = (i + 1) / n * TAU, am = (a0 + a1) / 2;
      g.beginPath(); g.moveTo(R + Math.cos(am) * R * .08, R + Math.sin(am) * R * .08); g.lineTo(R + Math.cos(a0) * R * 1.04, R + Math.sin(a0) * R * 1.04); g.lineTo(R + Math.cos(am) * R * 1.12, R + Math.sin(am) * R * 1.12); g.lineTo(R + Math.cos(a1) * R * 1.04, R + Math.sin(a1) * R * 1.04); g.closePath(); g.clip(); g.drawImage(spr.c, 0, 0);
      out.push({ c, a: am });
    }
    return spr.shards = out;
  }

  function discSprite(team, R) {
    const id = `d${team}${R}`; if (cache.has(id)) return cache.get(id);
    const T = R * .24, c = cv(R * 2 + 4, R * 1.5 + T + 4), g = c.getContext('2d'), cx = R + 2, cy = R * .74 + 2, ry = R * .72;
    const dark = team >= 0 ? TEAM_DARK[team] : '#6e5a2c', mid = team >= 0 ? (team ? '#c7806a' : '#7da6c7') : '#d9b765';
    g.fillStyle = dark; g.beginPath(); g.ellipse(cx, cy + T, R, ry, 0, 0, TAU); g.fill(); g.fillRect(cx - R, cy, R * 2, T);
    for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI; g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(cx + Math.cos(a) * R * .985 - 1, cy + Math.sin(a) * ry + 1, 2, T - 1); }
    const f = g.createLinearGradient(cx - R, cy - ry, cx + R, cy + ry); f.addColorStop(0, '#f2e8cf'); f.addColorStop(.55, mid); f.addColorStop(1, dark);
    g.fillStyle = f; g.beginPath(); g.ellipse(cx, cy, R, ry, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 2; g.beginPath(); g.ellipse(cx, cy, R * .8, ry * .8, 0, 0, TAU); g.stroke();
    const out = { c, cx, cy, T }; cache.set(id, out); return out;
  }

  return { TEAM, TEAM_DARK, METAL, TILT, TAU, champCoin, minionCoin, monsterCoin, coin, glow, shadow, drawEmblemIcon, brushSprite, discSprite, civCoin, abilityCoin, iconURL, sheen, caustic, vignette, shaft, seeded, mix, cv, reed, puff, cloud, leaf, shardsOf };
})();
