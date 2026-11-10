// Coin art. Everything is generated in code and cached to offscreen canvases.
// Style: dark deco with real shine. Vector emblems go through a per-pixel relief bake (height map, normals, matcap, circular brushed sheen)
// into cached sprites, once, at load. Coins turn as real 3D objects from baked turntable frames with correct edge thickness.
const Art = (() => {
  const TEAM = ['#58a6e6', '#e4573f'], TEAM_DARK = ['#1f4f7d', '#7e2a1e'];
  const METAL = {
    vesper: ['#c9d2de', '#55637a'], kade: ['#e9d6a0', '#8a6a34'], ione: ['#b7ccd8', '#3f5e72'],
    solenne: ['#f0dfb0', '#9a7a42'], sable: ['#9aa3b2', '#3a4150'], gravel: ['#c6a78a', '#5e4636'],
    minion0: ['#b4c6dc', '#3d5474'], minion1: ['#d8848e', '#7a1c2a'], monster: ['#a89a78', '#4a4230'], big: ['#b58f62', '#4e3620'], boss: ['#ecd9a6', '#94742f'],
  };
  const cv = (w, h) => { const c = document.createElement('canvas'); c.width = Math.ceil(w); c.height = Math.ceil(h); return c; };
  const TAU = Math.PI * 2, HALF = Math.PI;
  const INK = '#07090e';
  function hex(c) { const n = parseInt(c.slice(1), 16); return [n >> 16, n >> 8 & 255, n & 255]; }
  const rgbF = c => hex(c).map(v => v / 255);
  const rgb2hex = t => '#' + t.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
  function mix(a, b, t) { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; }
  const hx2 = c => '#' + c.match(/\d+/g).map(v => (+v).toString(16).padStart(2, '0')).join('');
  const mixH = (a, b, t) => hx2(mix(a, b, t));
  function seeded(s) { return () => (s = (s * 16807) % 2147483647) / 2147483647; }
  const cache = new Map();
  const TILT = .74;
  const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // ---------- geometry helpers ----------
  const polyT = p => g => { p.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.closePath(); };
  const ngon = (cx, cy, r, n, rot0 = -HALF / 2) => { const o = []; for (let i = 0; i < n; i++) { const a = rot0 + i / n * TAU; o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return o; };
  const arcPts = (cx, cy, r, a0, a1, n) => { const o = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return o; };
  const mx = p => p.map(([x, y]) => [-x, y]);
  const rot = (p, a, ox = 0, oy = 0) => { const c = Math.cos(a), s = Math.sin(a); return p.map(([x, y]) => [ox + x * c - y * s, oy + x * s + y * c]); };
  const move = (p, dx, dy) => p.map(([x, y]) => [x + dx, y + dy]);
  // An annular arc as one polygon; its ends are cut square to the radius.
  const band = (cx, cy, r0, r1, a0, a1, n = 18) => [...arcPts(cx, cy, r1, a0, a1, n), ...arcPts(cx, cy, r0, a1, a0, n)];
  const lozenge = (cx, cy, rx, ry) => [[cx, cy - ry], [cx + rx, cy], [cx, cy + ry], [cx - rx, cy]];
  const disc = (cx, cy, r) => g => { g.moveTo(cx + r, cy); g.arc(cx, cy, r, 0, TAU); g.closePath(); };

  // ---------- the emblems: twelve original marks, designed as logos in a -1..1 box ----------
  // L.a / L.b / L.c add a raised plate in the primary metal, secondary metal or glowing accent. L.x cuts straight through to the field.
  // `s` is true when the coin is small on screen and hairline detail must give way to one big silhouette.
  const EMB = {
    // Longshot: a broken sight ring, one long lance through it.
    vesper(L, s) {
      const r0 = s ? .56 : .62;
      for (let i = 0; i < 4; i++) { const a = i * HALF / 2 + HALF / 4; L.b(band(0, 0, r0, .94, a - .5, a + .5, 14), { axis: a }); }
      L.a([[0, -1.02], [.26, -.32], [.1, -.24], [.1, .6], [.3, .98], [0, .8], [-.3, .98], [-.1, .6], [-.1, -.24], [-.26, -.32]], { chisel: .5, axis: 0 });
      L.c(lozenge(0, .16, .07, .13));
    },
    // Captain Riposte: one upright rapier over a swept cup guard.
    kade(L, s) {
      L.b(band(0, -.12, .5, s ? .78 : .72, .32, HALF - .32, 22));
      L.b(lozenge(-.8, .06, s ? .12 : .09, s ? .18 : .14), lozenge(.8, .06, s ? .12 : .09, s ? .18 : .14));
      L.a([[0, -1.1], [.13, -.74], [.105, .3], [0, .4], [-.105, .3], [-.13, -.74]], { chisel: .4, axis: 0 });
      L.a([[-.1, .36], [.1, .36], [.085, .66], [-.085, .66]]);
      L.a(lozenge(0, .84, .17, .18));
    },
    // Starling: a falling star on a comet's arc.
    ione(L, s) {
      L.b([...arcPts(0, -.04, .96, -.32, 2.05, 22), ...arcPts(.14, -.2, .66, 2.05, -.32, 22)], { axis: 2 });
      if (!s) L.b([...arcPts(0, -.04, .56, .2, 1.65, 14), ...arcPts(.08, -.14, .48, 1.65, .2, 14)]);
      const R = .86, r = s ? .2 : .15, cx = .16, cy = -.16;
      L.a([[cx, cy - R * 1.02], [cx + r, cy - r], [cx + R * .86, cy], [cx + r, cy + r], [cx, cy + R * .98], [cx - r, cy + r], [cx - R * .86, cy], [cx - r, cy - r]], { chisel: .55, axis: .78, cx, cy });
      L.c(lozenge(cx, cy, .1, .1));
    },
    // Dawnbringer: a sun clearing a level horizon, seven blades of light.
    solenne(L, s) {
      const cy = .32;
      for (let i = 0; i < 7; i++) { if (s && i % 2) continue; const a = HALF + (i + .5) / 7 * HALF, w = s ? .16 : .11, lg = i % 2 ? .98 : 1.2; L.a([[Math.cos(a - w) * .6, cy + Math.sin(a - w) * .6], [Math.cos(a) * lg, cy + Math.sin(a) * lg], [Math.cos(a + w) * .6, cy + Math.sin(a + w) * .6]], { chisel: .6, split: 0 }); }
      L.c([...arcPts(0, cy, .48, HALF, TAU, 18)], { axis: 0, chisel: .3 });
      L.b([[-1, cy + .08], [1, cy + .08], [.82, cy + .24], [-.82, cy + .24]]);
      L.b([[-.56, cy + .33], [.56, cy + .33], [.4, cy + .47], [-.4, cy + .47]]);
      if (!s) L.b([[-.22, cy + .55], [.22, cy + .55], [.12, cy + .65], [-.12, cy + .65]]);
    },
    // Nightfall: an eclipse with a blade falling through it.
    sable(L, s) {
      L.a(g => { g.moveTo(.86, 0); g.arc(0, 0, .86, 0, TAU); g.closePath(); }, { hole: disc(.2, .16, .7), axis: HALF / 2 });
      for (const a of [.3, .78, 1.26]) { const w = .1; L.c([[Math.cos(a - w) * .9, Math.sin(a - w) * .9], [Math.cos(a) * 1.16, Math.sin(a) * 1.16], [Math.cos(a + w) * .9, Math.sin(a + w) * .9]]); }
      L.b([[0, -.92], [.15, -.3], [.09, .55], [0, .98], [-.09, .55], [-.15, -.3]], { chisel: .45, axis: 0 });
      L.b([[-.32, -.5], [.32, -.5], [.24, -.38], [-.24, -.38]]);
    },
    // Bulwark: a battlemented keep with a chevron gate cut clean through it.
    gravel(L, s) {
      L.a([[-.8, -.86], [-.46, -.86], [-.46, -.58], [-.18, -.58], [-.18, -.86], [.18, -.86], [.18, -.58], [.46, -.58], [.46, -.86], [.8, -.86], [.8, -.1], [.62, .36], [0, 1], [-.62, .36], [-.8, -.1]], { axis: 0, chisel: .24 });
      L.x([[-.46, -.24], [0, .1], [.46, -.24], [.46, .1], [0, .54], [-.46, .1]]);
      L.b([[-.3, -.2], [0, .02], [.3, -.2], [.3, .03], [0, .34], [-.3, .03]], { axis: 0 });
    },
    // Deadbolt: a lock plate, the keyhole punched out, two bolts driven home.
    deadbolt(L, s) {
      for (const k of [1, -1]) L.a([[k * 1.04, -.2], [k * .62, -.2], [k * .52, 0], [k * .62, .2], [k * 1.04, .2]], { axis: 0 });
      L.b(ngon(0, 0, .84, 8), { axis: .8, chisel: .2 });
      L.x(g => { g.moveTo(.32, -.22); g.arc(0, -.22, .32, 0, TAU); g.closePath(); });
      L.x([[-.16, -.14], [.16, -.14], [.36, .62], [-.36, .62]]);
      if (!s) L.c(lozenge(0, -.2, .08, .1));
    },
    // The Duelist: two rapiers crossed, and the blood between them.
    duelist(L, s) {
      for (const a of [-.64, .64]) {
        const P = q => rot(q, a, 0, .1);
        L.a(P([[0, -1.12], [.13, -.8], [.1, .52], [-.1, .52], [-.13, -.8]]), { axis: a, chisel: .4 });
        L.b(P([[-.36, .5], [.36, .5], [.28, .66], [-.28, .66]]), P([[-.08, .66], [.08, .66], [.07, .98], [-.07, .98]]), { axis: a });
      }
      L.x(lozenge(0, .1, .3, .38));
      L.c(lozenge(0, .1, .21, .3), { axis: 0, chisel: .55 });
    },
    // Madame Hex: six cut plates around a slit of cold light.
    hex(L, s) {
      const R = 1.02, r = s ? .6 : .68, gap = .07;
      for (let i = 0; i < 6; i++) { const a = -HALF / 2 + i / 6 * TAU, b = a + TAU / 6, ca = Math.cos, sa = Math.sin; L.b([[ca(a + gap) * R, sa(a + gap) * R], [ca(b - gap) * R, sa(b - gap) * R], [ca(b - gap * 1.4) * r, sa(b - gap * 1.4) * r], [ca(a + gap * 1.4) * r, sa(a + gap * 1.4) * r]], { axis: a + TAU / 12 }); }
      L.c([[0, -.56], [.24, 0], [0, .56], [-.24, 0]], { axis: 0, chisel: .6 });
    },
    // The Plague Doctor: an alembic with a bright measure and two rising bubbles.
    plague(L, s) {
      L.b([[-.3, -1.04], [.3, -1.04], [.3, -.86], [-.3, -.86]], { axis: 0 });
      L.b([[-.2, -.84], [.2, -.84], [.2, -.36], [.84, .74], [.68, .98], [-.68, .98], [-.84, .74], [-.2, -.36]], { axis: 0, chisel: .18 });
      L.c([[-.36, .1], [.36, .1], [.62, .7], [.5, .84], [-.5, .84], [-.62, .7]], { axis: 0, chisel: .3 });
      if (!s) { L.x(disc(-.12, .44, .08), disc(.17, .62, .055)); L.x(disc(.04, .22, .045)); }
    },
    // Shiv: a narrow knife on the diagonal and the two cuts it leaves.
    shiv(L, s) {
      const R = p => rot(p, .72, -.04, .08);
      if (!s) { L.c(R([[-.62, -.66], [-.5, -.66], [-.5, .5], [-.62, .5]]), R([[.5, -.5], [.62, -.5], [.62, .66], [.5, .66]])); }
      else { L.c(R([[-.7, -.5], [-.52, -.5], [-.52, .4], [-.7, .4]]), R([[.52, -.4], [.7, -.4], [.7, .5], [.52, .5]])); }
      L.a(R([[0, -1.1], [.24, -.18], [.16, .32], [-.16, .32], [-.24, -.18]]), { axis: .72, chisel: .5 });
      L.b(R([[-.4, .32], [.4, .32], [.33, .47], [-.33, .47]]));
      L.b(R([[-.12, .47], [.12, .47], [.08, .96], [-.08, .96]]));
    },
    // Ironjaw: a closed trap of offset steel teeth.
    ironjaw(L, s) {
      L.a([[-.66, -.86], [.66, -.86], [.94, -.5], [.94, -.28], [.66, .08], [.46, -.2], [.23, .12], [0, -.2], [-.23, .12], [-.46, -.2], [-.66, .08], [-.94, -.28], [-.94, -.5]], { axis: 0, chisel: .2 });
      L.b([[-.66, .86], [.66, .86], [.94, .62], [.94, .44], [.66, .18], [.46, .44], [.23, .18], [0, .44], [-.23, .18], [-.46, .44], [-.66, .18], [-.94, .44], [-.94, .62]], { axis: 0, chisel: .2 });
      if (!s) for (const x of [-.62, -.31, 0, .31, .62]) L.x(lozenge(x, -.54, .05, .05));
    },
    // Voltaic: one forked bolt, already past you.
    voltaic(L, s) {
      for (const [y, x1] of [[-.66, -.19], [-.36, -.35], [-.06, -.5]]) L.b([[-1, y], [x1, y], [x1 - .08, y + .16], [-.9, y + .16]]);
      for (const [y, x1] of [[.12, .55], [.42, .3]]) L.b([[x1, y], [.98 - (y - .12) * .5, y], [.9 - (y - .12) * .5, y + .16], [x1 - .08, y + .16]]);
      L.a([[.12, -1.04], [.66, -1.04], [.28, -.22], [.68, -.22], [-.34, 1.06], [-.04, .16], [-.48, .16]], { chisel: .3, axis: .5 });
      if (!s) L.c([[.28, -.92], [.46, -.92], [.1, -.1], [.42, -.1], [-.1, .56], [.04, .02], [-.26, .02]]);
    },
    // Tidecaller: a drop that holds the wave, and the swell that answers.
    tidecaller(L, s) {
      L.b(band(0, .14, s ? .72 : .76, .98, -.75, .95, 16), band(0, .14, s ? .72 : .76, .98, HALF - .95, HALF + .75, 16));
      L.a([[0, -1.04], ...arcPts(0, .3, .58, -.62, HALF + .62, 26)], { chisel: .4, axis: 0 });
      L.x([[-.44, .28], [-.22, .1], [0, .28], [.22, .1], [.44, .28], [.4, .48], [.22, .3], [0, .48], [-.22, .3], [-.4, .48]]);
      L.c(lozenge(0, -.3, .1, .26), { chisel: .5, axis: 0 });
    },
    // Paragon: wings at full stretch and one rising spear of light.
    paragon(L, s) {
      for (const k of [1, -1]) for (let i = 0; i < (s ? 3 : 4); i++) { const st = s ? .32 : .25; L.b([[k * .14, -.04 + i * st * .5], [k * (1.04 - st * .62 * i), -.66 + i * st * 1.05], [k * (.94 - st * .62 * i), -.42 + i * st * 1.05 - (s ? 0 : .04)], [k * .14, .15 + i * st * .5]], { axis: 0 }); }
      L.a([[0, -1.06], [.3, -.32], [.2, .36], [0, 1], [-.2, .36], [-.3, -.32]], { chisel: .6, axis: 0 });
      L.c(lozenge(0, -.12, .1, .24), { chisel: .5, axis: 0 });
    },
    // Mirage: one eye, half solid, half the lie it tells.
    mirage(L, s) {
      const lens = (k, sc) => { const o = []; for (let i = 0; i <= 16; i++) { const x = i / 16; o.push([k * x * sc, -.62 * (1 - x * x) * sc]); } for (let i = 16; i >= 0; i--) { const x = i / 16; o.push([k * x * sc, .62 * (1 - x * x) * sc]); } return o; };
      L.a([...lens(-1, 1.04)].reverse(), { axis: 0, chisel: .24 });
      L.b(lens(1, 1.04), { axis: 0, chisel: .24 });
      L.x(lens(1, .72));
      L.x(disc(0, 0, .36));
      L.c(lozenge(0, 0, .2, .3), { chisel: .55, axis: 0 });
      for (const k of [1, -1]) L.b([[-.5, k * .76], [0, k * 1.02], [.5, k * .76], [.4, k * .66], [0, k * .86], [-.4, k * .66]]);
    },
    // Cinder: a crown of flame, burning hotter the deeper you look.
    cinder(L, s) {
      const F = [[0, -1.06], [.2, -.5], [.47, -.8], [.53, -.28], [.8, -.44], [.76, .2], [.52, .68], [0, .98], [-.52, .68], [-.76, .2], [-.8, -.44], [-.53, -.28], [-.47, -.8], [-.2, -.5]], sc = (k, dy) => F.map(([x, y]) => [x * k, y * k + dy]);
      L.a(F, { chisel: .22, axis: 0 });
      L.x(sc(.72, .2));
      L.b(sc(.58, .28), { chisel: .3, axis: 0 });
      L.c(sc(.3, .46), { chisel: .5, axis: 0 });
    },
    // Ravager: the head of the thing that hunts you, eyes open.
    ravager(L, s) {
      L.a([[-.9, -1.02], [-.38, -.56], [.38, -.56], [.9, -1.02], [.86, -.18], [.58, .24], [.32, .54], [.15, 1.02], [-.15, 1.02], [-.32, .54], [-.58, .24], [-.86, -.18]], { axis: 0, chisel: .2 });
      for (const k of [1, -1]) { L.x([[k * .1, -.14], [k * .66, -.46], [k * .56, -.02], [k * .18, .08]]); L.c([[k * .17, -.13], [k * .58, -.36], [k * .5, -.07], [k * .22, .01]]); }
      L.b([[-.2, .2], [.2, .2], [.09, .68], [-.09, .68]], { axis: 0, chisel: .4 });
      if (!s) for (const k of [1, -1]) L.x([[k * .28, -.86 + .46], [k * .34, -.82 + .46], [k * .24, -.68 + .46]]);
    },
    // Cataclysm: the world, split, with the fire showing through.
    cataclysm(L, s) {
      L.c([[-.05, -1], [.07, -1], [.15, -.58], [-.13, -.24], [.19, .14], [-.07, .5], [.07, .98], [-.05, .98], [-.19, .5], [.07, .14], [-.25, -.24], [.03, -.58]], { chisel: .5, axis: 0 });
      L.a([[-.12, -1.02], [-.68, -.78], [-1, -.18], [-.88, .54], [-.42, .98], [-.12, 1], [-.28, .5], [.0, .14], [-.34, -.24], [-.04, -.58]], { chisel: .2, axis: -.6 });
      L.a([[.14, -1.02], [.72, -.76], [1, -.16], [.88, .54], [.44, .98], [.14, 1], [.02, .5], [.27, .14], [-.05, -.24], [.23, -.58]], { chisel: .2, axis: .6 });
      if (!s) { L.x([[-.72, -.3], [-.46, -.2], [-.54, .02], [-.74, -.06]], [[.56, .3], [.78, .2], [.74, .46], [.54, .52]]); }
    },
    // The Puppeteer: the control bar, and whoever hangs from it.
    puppeteer(L, s) {
      const t = s ? .07 : .04;
      for (const [x0, x1] of [[-.72, -.66], [.72, .66]]) L.b([[x0 - t, -.72], [x0 + t, -.72], [x1 + t, .18], [x1 - t, .18]]);
      L.b([[-t, -.5], [t, -.5], [t, -.12], [-t, -.12]]);
      L.a([[-.9, -.86], [.9, -.86], [.8, -.66], [-.8, -.66]], [[-.11, -1.04], [.11, -1.04], [.11, -.42], [-.11, -.42]], [[-.5, -.56], [.5, -.56], [.42, -.4], [-.42, -.4]], { axis: 0, chisel: .3 });
      L.a([[0, -.16], [.4, .22], [.3, .72], [0, 1.02], [-.3, .72], [-.4, .22]], { axis: 0, chisel: .24 });
      for (const k of [1, -1]) { L.x([[k * .07, .2], [k * .28, .14], [k * .24, .36], [k * .09, .38]]); L.c(lozenge(k * .68, .34, .15, .2)); }
      L.c(lozenge(0, .66, .06, .14));
    },
  };
  // Old villain seats used the shared kit ids; keep them drawing the right mark.
  const VILLAIN_OF = { vesper: 'deadbolt', kade: 'duelist', ione: 'hex', solenne: 'plague', sable: 'shiv', gravel: 'ironjaw' };
  const emblemKey = (kit, team) => team === 1 && VILLAIN_OF[kit] ? VILLAIN_OF[kit] : kit;

  // ---------- materials: tints are 0..1. m = how metallic, an = brushed sheen, sp = lacquer gloss ----------
  const M = (col, m = 1, an = .55, sp = .2, em = 0) => ({ t: rgbF(col), m, an, sp, em });
  const FIELD_HERO = M('#0c2250', 0, .4, .22), FIELD_VILL = M('#0d0d13', 0, .45, .2), FIELD_CIV = M('#c8c2b4', 0, .15, .2), FIELD_BEAST = M('#16100c', 0, .3, .24), FIELD_BOSS = M('#1a0d0a', 0, .3, .26);
  const EN = c => M(c, 0, .3, .13);
  const GOLD = M('#ffc95a', 1, .9), SILVER = M('#dfe9f6', 1, .85), GUN = M('#868c9a', 1, .75), BRASS = M('#d9ab55', 1, .8);
  const ACID = M('#a4e01c', .7, .6, .12, .35), CRIM = M('#dd1c32', .7, .6, .12, .3), TOXIC = M('#a8f020', .4, .3, .1, .75), BLOOD = M('#ff3a20', .4, .3, .1, .75), ICE = M('#7fdcff', .35, .4, .1, .7), SUN = M('#ffd77a', .4, .4, .12, .7);
  const STEEL = M('#a8b4c4', 1, .8), DARKIRON = M('#565c68', 1, .6), COPPER = M('#c98a5e', 1, .75), INKM = M('#22242c', .7, .3);
  const SKIN = {
    vesper: { a: GOLD, b: M('#7f94b8', 1, .8), c: M('#ffffff', .3, .3, .3, 1.2), f: EN('#0d2358'), glow: '#ffe6a8' }, kade: { a: M('#eef4ff', 1, .95), b: GOLD, c: M('#ff5a58', .3, .3, .3, 1), f: EN('#123a8a'), glow: '#ffb0a8' },
    ione: { a: M('#fff1c0', 1, .9), b: M('#a8d8ff', 1, .85), c: ICE, f: EN('#0a2b66'), glow: '#bfe8ff' }, solenne: { a: GOLD, b: M('#ffe4a8', 1, .85), c: SUN, f: EN('#16356e'), glow: '#ffe6a8' },
    sable: { a: M('#e4dcff', 1, .95), b: GOLD, c: M('#b49aff', .35, .4, .1, 1.1), f: EN('#1b1658'), glow: '#c8b4ff' }, gravel: { a: GOLD, b: M('#eaf0f8', 1, .85), c: SUN, f: EN('#1c2e50'), glow: '#ffe6a8' },
    voltaic: { a: M('#fff0a0', 1, .85), b: M('#8fe0ff', 1, .8), c: M('#ffffff', .2, .3, .3, 1.5), f: EN('#0b2d7c'), glow: '#9fe8ff' }, tidecaller: { a: M('#b4fff0', 1, .9), b: GOLD, c: M('#ffffff', .2, .3, .3, 1.3), f: EN('#063a5c'), glow: '#7ff0e0' },
    paragon: { a: M('#ffffff', 1, .9), b: GOLD, c: M('#ff6a4a', .3, .3, .3, 1.1), f: EN('#173c9e'), glow: '#fff0c8' }, mirage: { a: M('#e6d8ff', 1, .95), b: M('#ffb4dc', 1, .9), c: M('#ff8ae0', .25, .3, .3, 1.5), f: EN('#261a6a'), glow: '#ff9ae8' },
    deadbolt: { a: ACID, b: GUN, c: TOXIC, f: EN('#0d140e'), glow: '#c8ff4d' }, duelist: { a: M('#e8ecf2', 1, .95), b: CRIM, c: BLOOD, f: EN('#260a10'), glow: '#ff6a58' },
    hex: { a: ACID, b: M('#8a70d8', 1, .85), c: TOXIC, f: EN('#170d2a'), glow: '#c8ff4d' }, plague: { a: M('#b8c0ca', 1, .85), b: M('#9aa2ae', 1, .85), c: TOXIC, f: EN('#10180a'), glow: '#c8ff4d' },
    shiv: { a: STEEL, b: DARKIRON, c: BLOOD, f: EN('#140a0e'), glow: '#ff6a58' }, ironjaw: { a: CRIM, b: M('#b0b6c2', 1, .85), c: BLOOD, f: EN('#1a0e0a'), glow: '#ff6a58' },
    cinder: { a: M('#ff9238', 1, .8), b: M('#ffcf5a', 1, .85), c: M('#fff6d0', .2, .3, .3, 1.8), f: EN('#220a06'), glow: '#ffb050' }, ravager: { a: M('#dcd0ba', 1, .75), b: M('#7a6658', 1, .7), c: M('#ff2a2a', .2, .3, .3, 1.8), f: EN('#180a0e'), glow: '#ff4040' },
    cataclysm: { a: M('#8c7f78', 1, .6), b: M('#6a5f5a', 1, .6), c: M('#ff7a20', .2, .3, .3, 2), f: EN('#160e0c'), glow: '#ff8a30' }, puppeteer: { a: M('#d070d8', 1, .85), b: M('#e6dcd0', 1, .7), c: M('#ff8ae8', .25, .3, .3, 1.6), f: EN('#1c0a26'), glow: '#ff8ae8' },
  };
  const RIMM = [M('#c9834f', 1, .7), M('#b08a4e', 1, .75), M('#d9e2ee', 1, .9), M('#f4cc6a', 1, .95), M('#e2f0f7', 1, 1), M('#a79ee0', 1, 1)];
  const BEZEL = 1.0;

  // ---------- finishes: the coin's own colour story. Picked in the store, seen by everyone ----------
  // fa/fb/fc override the emblem metals, ff the field, fr the rim; film adds a thin-film colour shift, glow is the emissive colour.
  const FINISH = {
    gunmetal: { fa: M('#b4bcc9', 1, .9), fb: M('#6c727e', 1, .8), fc: M('#ff8a3c', .4, .4, .3, .9), ff: M('#121418', 0, .36, .3), fr: M('#7a808c', 1, .9), glow: '#ff8a3c' },
    rosegold: { fa: M('#f2b5a0', 1, .95), fb: M('#e9dacb', 1, .85), fc: M('#ffd0c0', .3, .4, .3, .9), ff: M('#2a141c', 0, .34, .28), fr: M('#e0a088', 1, .95), glow: '#ffc4b0' },
    obsidian: { fa: M('#2d3038', 1, 1), fb: M('#f1cf7c', 1, .9), fc: M('#f1cf7c', .4, .4, .3, 1), ff: M('#060608', 0, .5, .5), fr: M('#26282e', 1, 1), glow: '#f1cf7c', gloss: 1 },
    pearl: { fa: M('#f4f0ea', 1, .6), fb: M('#d8dee8', 1, .6), fc: M('#ffd6f0', .3, .4, .3, .8), ff: M('#e6dfd4', 0, .3, .32), fr: M('#ece6dc', 1, .7), film: .7, glow: '#ffd6f0' },
    verdigris: { fa: M('#7cd0b4', .85, .5), fb: M('#c98a5e', 1, .7), fc: M('#a8ffd8', .3, .4, .3, .9), ff: M('#0f2a24', 0, .3, .2), fr: M('#3f8f78', .8, .55), glow: '#a8ffd8' },
    chrome: { fa: M('#f4f7fa', 1, .4), fb: M('#b6c0cc', 1, .4), fc: M('#9fe8ff', .3, .4, .3, 1), ff: M('#191c22', .9, .35, .5), fr: M('#eef2f6', 1, .4), glow: '#bfe8ff', mirror: 1 },
    neon: { fa: M('#ff2bd0', .1, .3, .1, 1.3), fb: M('#2be8ff', .1, .3, .1, 1.1), fc: M('#ff2bd0', .1, .2, .1, 1.6), ff: M('#0a0b10', 0, .3, .3), fr: M('#2a2d38', 1, .6), glow: '#2be8ff', edge: '#2be8ff' },
    // Mastery exclusives. Each is cut for one tier of devotion.
    gilded: { fa: M('#ffd98a', 1, 1), fb: M('#fff2c8', 1, .9), fc: M('#fff2c8', .3, .4, .3, 1.2), ff: M('#2a1a06', .25, .6, .4), fr: M('#ffcf6a', 1, 1), glow: '#ffe6a8', film: .12 },
    aurora: { fa: M('#d8e8f2', 1, .85), fb: M('#bfd0ff', 1, .8), fc: M('#7dffd8', .2, .4, .3, 1.4), ff: M('#081624', .4, .5, .4), fr: M('#d0e4f0', 1, 1), film: .8, glow: '#7dffd8' },
    aether: { fa: M('#f0e8ff', 1, .95), fb: M('#c8bcff', 1, .9), fc: M('#ffffff', .2, .4, .3, 1.6), ff: M('#140a2c', .5, .7, .55), fr: M('#b8a8ff', 1, 1), film: 1, glow: '#d9b8ff', mirror: 1 },
    // Signature finishes, one per champion, for the fully devoted.
    sig_vesper: { fa: M('#fff4c8', 1, 1), fb: M('#ffb24a', 1, .9), fc: M('#ffffff', .2, .4, .3, 1.4), ff: M('#0a1a3a', .3, .6, .5), fr: M('#f4c060', 1, 1), film: .3, glow: '#ffe6a8' },
    sig_kade: { fa: M('#f8fbff', 1, .95), fb: M('#ffc24a', 1, 1), fc: M('#ffffff', .2, .4, .3, 1.4), ff: M('#04163c', .35, .6, .5), fr: M('#e8eef8', 1, 1), film: .3, glow: '#ffffff' },
    sig_ione: { fa: M('#d0f0ff', 1, 1), fb: M('#a8c8ff', 1, .9), fc: M('#ffffff', .2, .4, .3, 1.6), ff: M('#060a26', .4, .7, .55), fr: M('#a0c4ff', 1, 1), film: .9, glow: '#bfe8ff' },
    sig_solenne: { fa: M('#ffe9b0', 1, 1), fb: M('#fff6e0', 1, .9), fc: M('#ffcf60', .2, .4, .3, 1.6), ff: M('#2a1608', .3, .6, .5), fr: M('#ffd778', 1, 1), film: .4, glow: '#ffcf60' },
    sig_sable: { fa: M('#d8c8ff', 1, 1), fb: M('#fff4d8', 1, .9), fc: M('#b8a0ff', .2, .4, .3, 1.5), ff: M('#090514', .5, .7, .6), fr: M('#8878c8', 1, 1), film: .7, glow: '#c8b8ff' },
    sig_gravel: { fa: M('#ffcf9a', 1, 1), fb: M('#f4f4f8', 1, .9), fc: M('#ff9a4a', .2, .4, .3, 1.5), ff: M('#2a1a10', .3, .6, .5), fr: M('#e8a868', 1, 1), film: .25, glow: '#ffb070' },
    sig_deadbolt: { fa: M('#d4ff60', 1, .9), fb: M('#3a3f48', 1, .9), fc: M('#f4ffb0', .2, .3, .3, 1.8), ff: M('#0a0f06', .3, .6, .5), fr: M('#a8e040', 1, 1), film: .2, glow: '#c8ff4d' },
    sig_duelist: { fa: M('#ff4a5a', .8, .8), fb: M('#f4f0f0', 1, .9), fc: M('#ffd0d0', .2, .3, .3, 1.6), ff: M('#180408', .3, .6, .5), fr: M('#c81f30', 1, 1), film: .2, glow: '#ff6a58' },
    sig_hex: { fa: M('#b8ff70', .8, .7), fb: M('#7a60c8', 1, .9), fc: M('#f4ffb0', .2, .3, .3, 2), ff: M('#10082a', .4, .7, .55), fr: M('#6a50b8', 1, 1), film: .7, glow: '#b8ff70' },
    sig_plague: { fa: M('#dfff70', .7, .7), fb: M('#889098', 1, .85), fc: M('#f4ffb0', .2, .3, .3, 2), ff: M('#0c1408', .3, .6, .5), fr: M('#78a030', 1, 1), film: .3, glow: '#dfff70' },
    sig_shiv: { fa: M('#e8eef8', 1, 1), fb: M('#2a2d36', 1, .9), fc: M('#ff3e4e', .2, .3, .3, 2), ff: M('#0c0408', .3, .7, .6), fr: M('#a01c2c', 1, 1), film: .25, glow: '#ff3e4e' },
    sig_voltaic: { fa: M('#ffffff', 1, 1), fb: M('#ffe060', 1, .9), fc: M('#a8f0ff', .2, .3, .3, 2), ff: M('#061a58', .4, .7, .55), fr: M('#60c8ff', 1, 1), film: .35, glow: '#a8f0ff', pat: 'facets' },
    sig_tidecaller: { fa: M('#d8fff4', 1, 1), fb: M('#7ae8d8', 1, .9), fc: M('#ffffff', .2, .3, .3, 1.8), ff: M('#032838', .4, .7, .55), fr: M('#40c8b8', 1, 1), film: .75, glow: '#7ff0e0', pat: 'waves' },
    sig_paragon: { fa: M('#fff8e0', 1, 1), fb: M('#f6c050', 1, 1), fc: M('#ff5a4a', .2, .3, .3, 1.7), ff: M('#10308c', .5, .7, .55), fr: M('#ffe0a0', 1, 1), film: .2, glow: '#fff0c8' },
    sig_mirage: { fa: M('#f0e0ff', 1, 1), fb: M('#ff9ad0', 1, .95), fc: M('#ffffff', .2, .3, .3, 1.8), ff: M('#180e50', .5, .7, .6), fr: M('#d0a8ff', 1, 1), film: 1, glow: '#ff9ae8', pat: 'guilloche' },
    sig_cinder: { fa: M('#ffb040', 1, 1), fb: M('#fff0a0', 1, .9), fc: M('#ffffff', .2, .3, .3, 2.2), ff: M('#180402', .4, .7, .55), fr: M('#d8501a', 1, 1), film: .2, glow: '#ffb050', pat: 'facets' },
    sig_ravager: { fa: M('#f4e8d0', 1, .9), fb: M('#a02020', .9, .8), fc: M('#ff3030', .2, .3, .3, 2.2), ff: M('#0e0408', .4, .7, .55), fr: M('#7a1a1a', 1, 1), film: .1, glow: '#ff4040' },
    sig_cataclysm: { fa: M('#40383a', 1, 1), fb: M('#2e282a', 1, 1), fc: M('#ffa030', .2, .3, .3, 2.6), ff: M('#0c0604', .4, .7, .55), fr: M('#ff7a20', 1, 1), glow: '#ff8a30', gloss: .5 },
    sig_puppeteer: { fa: M('#f08af0', 1, 1), fb: M('#fff0e0', 1, .85), fc: M('#ffffff', .2, .3, .3, 2), ff: M('#12061c', .4, .7, .6), fr: M('#a040b0', 1, 1), film: .55, glow: '#ff8ae8', pat: 'guilloche' },
    sig_ironjaw: { fa: M('#ffa44a', 1, .9), fb: M('#aab0ba', 1, .9), fc: M('#ffe0b0', .2, .3, .3, 1.8), ff: M('#180c06', .3, .6, .5), fr: M('#c8702a', 1, 1), film: .2, glow: '#ff9a3c' },
  };
  // The store catalog. Mastery items unlock by Sim.TIERS tier on the champion that earns them.
  const SIG_NAME = { vesper: 'Vanishing point', kade: 'Parry of dawn', ione: 'Comet tail', solenne: 'First light', sable: 'Moonless', gravel: 'Last wall', deadbolt: 'Live round', duelist: 'First blood', hex: 'Witch glass', plague: 'Patient zero', shiv: 'Quiet edge', ironjaw: 'Trap of the deep', voltaic: 'Ball lightning', tidecaller: 'Slack tide', paragon: 'Zenith', mirage: 'Second sight', cinder: 'Banked coals', ravager: 'Last meal', cataclysm: 'Fault line', puppeteer: 'Curtain call' };
  const COSMETICS = [
    { id: 'gunmetal', name: 'Gunmetal', kind: 'finish', cost: 300 }, { id: 'rosegold', name: 'Rose gold', kind: 'finish', cost: 450 }, { id: 'verdigris', name: 'Verdigris', kind: 'finish', cost: 450 },
    { id: 'obsidian', name: 'Obsidian', kind: 'finish', cost: 700 }, { id: 'pearl', name: 'Pearl', kind: 'finish', cost: 700 }, { id: 'neon', name: 'Cold neon', kind: 'finish', cost: 900 }, { id: 'chrome', name: 'Mirror chrome', kind: 'finish', cost: 1100 },
    { id: 'gilded', name: 'Gilded', kind: 'finish', mastery: { tier: 3 } }, { id: 'aurora', name: 'Aurora', kind: 'finish', mastery: { tier: 4 } }, { id: 'aether', name: 'Aether', kind: 'finish', mastery: { tier: 5 } },
    ...Object.keys(SIG_NAME).map(k => ({ id: 'sig_' + k, name: SIG_NAME[k], kind: 'finish', mastery: { champ: k, tier: 4 } })),
    { id: 'embers', name: 'Embers', kind: 'trail', cost: 300 }, { id: 'frost', name: 'Frostbite', kind: 'trail', cost: 400 }, { id: 'ticker', name: 'Ticker tape', kind: 'trail', cost: 500 }, { id: 'static', name: 'Static', kind: 'trail', cost: 600 }, { id: 'ink', name: 'Night ink', kind: 'trail', cost: 700 }, { id: 'petals', name: 'Laurel', kind: 'trail', cost: 800 },
    { id: 'halo', name: 'Halo wake', kind: 'trail', mastery: { tier: 3 } }, { id: 'prism', name: 'Prism wake', kind: 'trail', mastery: { tier: 5 } },
    { id: 'lift', name: 'Lift shaft', kind: 'recall', cost: 300 }, { id: 'vault', name: 'Vault door', kind: 'recall', cost: 500 }, { id: 'storm', name: 'Called down', kind: 'recall', cost: 700 }, { id: 'inkwell', name: 'Inkwell', kind: 'recall', cost: 800 },
    { id: 'heraldic', name: 'Heraldic', kind: 'recall', mastery: { tier: 3 } }, { id: 'ascend', name: 'Ascension', kind: 'recall', mastery: { tier: 5 } },
  ];

  // ---------- the relief engine ----------
  // The light rig. One static matcap, indexed by a normal rotated to the camera: a big soft key high left, a strip light, a hard horizon and a cool kicker.
  const MCN = 192; let MC = null, MCC = null;
  function matcap() {
    if (MC) return MC;
    MC = new Float32Array(MCN * MCN); MCC = new Float32Array(MCN * MCN);
    const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const K = [-.5, -.66, .56], Kl = Math.hypot(...K); K[0] /= Kl; K[1] /= Kl; K[2] /= Kl;
    for (let j = 0; j < MCN; j++) for (let i = 0; i < MCN; i++) {
      const nx = (i + .5) / MCN * 2 - 1, ny = (j + .5) / MCN * 2 - 1, r2 = nx * nx + ny * ny, f = r2 > 1 ? 1 / Math.sqrt(r2) : 1, x = nx * f, y = ny * f, z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
      const rx = 2 * z * x, ry = 2 * z * y, rz = 2 * z * z - 1;
      let L = .07 + .2 * Math.max(0, -ry) * Math.max(0, -ry);
      L += .74 * sm(.2, .96, rz) * (.72 + .28 * sm(.2, -.7, ry + rx * .5));          // the card: a flat plate shows its colour
      const c = rx * K[0] + ry * K[1] + rz * K[2];
      L += .5 * sm(.3, .86, c) + 2.5 * sm(.82, .985, c);                             // a soft lobe, then a key that blows out
      L += 1.25 * Math.exp(-Math.pow((ry + .3 + rx * .24) / .045, 2)) * sm(-.6, .1, rz); // strip light: the hard line that says "polished"
      L *= .26 + .74 * sm(.02, .075, Math.abs(ry - .55));                            // the horizon: chrome's dark line
      L += .62 * sm(.25, .9, rx) * sm(.0, .9, ry) * sm(.3, -.4, rz);                 // kicker from below right
      L += .1 * sm(.1, .9, ry);                                                      // floor bounce
      MC[i + j * MCN] = L;
      MCC[i + j * MCN] = .34 * sm(.2, .9, rx) * sm(-.1, .9, ry) + .2 * sm(-.15, -.9, ry) * sm(.5, -.2, rz);  // the cool side of the room
    }
    return MC;
  }
  // Thin-film colour by angle, for pearl and aether.
  const FILMN = 64; let FILM = null;
  function film() { if (FILM) return FILM; FILM = new Float32Array(FILMN * 3); for (let i = 0; i < FILMN; i++) { const p = i / (FILMN - 1) * TAU * 1.8; FILM[i * 3] = .72 + .28 * Math.cos(p); FILM[i * 3 + 1] = .72 + .28 * Math.cos(p - 2.1); FILM[i * 3 + 2] = .72 + .28 * Math.cos(p - 4.2); } return FILM; }

  // Exact Euclidean distance to the nearest outside pixel (Felzenszwalb). inside: Uint8 mask, values 0/1.
  function edt(mask, w, h) {
    // Work only inside the mask's bounding box: emblems are small parts of the coin.
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) if (mask[i]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const out = new Float32Array(w * h); if (x1 < 0) return out;
    x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(w - 1, x1 + 1); y1 = Math.min(h - 1, y1 + 1);
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, n = Math.max(bw, bh), F = new Float64Array(n), D = new Float64Array(n), V = new Int32Array(n), Zv = new Float64Array(n + 1), INF = 1e12, sq = new Float64Array(bw * bh);
    const dt1 = (len) => {
      let k = 0; V[0] = 0; Zv[0] = -INF; Zv[1] = INF;
      for (let q = 1; q < len; q++) { let s; while (true) { const v = V[k]; s = ((F[q] + q * q) - (F[v] + v * v)) / (2 * q - 2 * v); if (s > Zv[k]) break; k--; } k++; V[k] = q; Zv[k] = s; Zv[k + 1] = INF; }
      k = 0; for (let q = 0; q < len; q++) { while (Zv[k + 1] < q) k++; const v = V[k]; D[q] = (q - v) * (q - v) + F[v]; }
    };
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) sq[x + y * bw] = mask[x + x0 + (y + y0) * w] ? INF : 0;
    for (let x = 0; x < bw; x++) { for (let y = 0; y < bh; y++) F[y] = sq[x + y * bw]; dt1(bh); for (let y = 0; y < bh; y++) sq[x + y * bw] = D[y]; }
    for (let y = 0; y < bh; y++) { for (let x = 0; x < bw; x++) F[x] = sq[x + y * bw]; dt1(bw); for (let x = 0; x < bw; x++) out[x + x0 + (y + y0) * w] = Math.sqrt(D[x]); }
    return out;
  }
  // A scratch canvas we read back from. Never shown, so it can live on the CPU.
  const scratchC = new Map();
  function scratch(w) {
    let s = scratchC.get(w); if (!s) { const c = cv(w, w); s = { c, g: c.getContext('2d', { willReadFrequently: true }) }; scratchC.set(w, s); if (scratchC.size > 16) scratchC.delete(scratchC.keys().next().value); }
    return s;
  }
  // Draw into a -1..1 box and read the coverage back.
  function readMask(S, R, pitch, draw) {
    const s = scratch(S), g = s.g; g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, S, S); g.translate(S / 2, S / 2); g.scale(R, R * pitch); g.fillStyle = g.strokeStyle = '#fff'; g.lineJoin = 'miter'; g.miterLimit = 8;
    draw(g);
    const d = g.getImageData(0, 0, S, S).data, a = new Uint8Array(S * S);
    let x0 = S, y0 = S, x1 = -1, y1 = -1; for (let j = 0, i = 0; j < S; j++) for (let k = 0; k < S; k++, i++) { const v = d[i * 4 + 3]; a[i] = v; if (v) { if (k < x0) x0 = k; if (k > x1) x1 = k; if (j < y0) y0 = j; if (j > y1) y1 = j; } }
    a.bx0 = x0; a.by0 = y0; a.bx1 = x1; a.by1 = y1;
    return a;
  }
  const bin = a => { const o = new Uint8Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] > 127 ? 1 : 0; return o; };
  const bev01 = t => t >= 1 ? 1 : t * (2 - t);

  // Coin outline: heroes are turned round, villains are cut with facets; high mastery adds shoulders.
  function edge(tier, villain) {
    const out = [];
    if (villain) {
      const n = tier >= 4 ? 16 : 12, R = .985, notch = tier >= 2 ? .05 : 0, spur = tier >= 4 ? (tier >= 5 ? 1.06 : 1.03) : 0;
      for (let i = 0; i < n; i++) {
        const a = (i + .5) / n * TAU - HALF / 2, st = TAU / n; out.push([a - st * .46, R]);
        if (notch) { out.push([a - st * .12, R - notch]); if (spur && i % 2 === 0) out.push([a, spur]); else out.push([a, R - notch * .35]); out.push([a + st * .12, R - notch]); }
        out.push([a + st * .46, R]);
      }
      return out;
    }
    const n = tier >= 3 ? (tier >= 4 ? 8 : 12) : 0;
    if (!n) { for (let i = 0; i < 96; i++) out.push([i / 96 * TAU, .985]); return out; }
    const lo = tier >= 4 ? .95 : .975, hi = tier >= 5 ? 1.085 : tier >= 4 ? 1.04 : .995, w = tier >= 4 ? .13 : .22;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU - HALF / 2, st = TAU / n;
      for (let k = 0; k <= 8; k++) out.push([a + st * w + st * (1 - 2 * w) * k / 8, lo]);
      if (tier >= 5) { out.push([a + st * (1 - w * .9), hi - .05]); out.push([a + st, hi]); out.push([a + st * (1 + w * .9), hi - .05]); }
      else { out.push([a + st * (1 - w * .55), hi]); out.push([a + st * (1 + w * .55), hi]); }
    }
    return out;
  }
  const edgeT = e => g => { e.forEach(([a, r], i) => g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r)); g.closePath(); };
  // Rim machining per mastery tier, as engraved lines.
  function rimDetail(g, tier, mid, small) {
    const each = (n, f, off = 0) => { for (let i = 0; i < n; i++) { g.save(); g.rotate((i + off) / n * TAU); f(i); g.restore(); } };
    const dia = (r, w, h) => { g.beginPath(); g.moveTo(0, -r - h); g.lineTo(w, -r); g.lineTo(0, -r + h); g.lineTo(-w, -r); g.closePath(); g.fill(); };
    if (tier === 1) { each(small ? 4 : 8, () => dia(mid, .028, .05), .5); }
    if (tier === 2) each(4, () => { g.beginPath(); g.moveTo(-.16, -mid - .04); g.lineTo(0, -mid + .03); g.lineTo(.16, -mid - .04); g.lineTo(.16, -mid); g.lineTo(0, -mid + .07); g.lineTo(-.16, -mid); g.closePath(); g.fill(); }, .125);
    if (tier === 3) each(12, () => { g.fillRect(-.016, -mid - .05, .032, .1); }, .5);
    if (tier >= 4) each(16, i => { if (i % 2) g.fillRect(-.012, -mid - .05, .024, .1); }, .5);
  }
  // Set stones, seated in the rim at the two highest tiers of devotion.
  function rimGems(g, tier, mid) {
    const n = tier >= 5 ? 8 : 4;
    for (let i = 0; i < n; i++) { const a = (i + .5) / 8 * TAU * (tier >= 5 ? 1 : 2) - HALF / 2 + (tier >= 5 ? 0 : TAU / 16 * 0), r = .068; g.beginPath(); g.moveTo(Math.cos(a) * (mid + r), Math.sin(a) * (mid + r)); g.lineTo(Math.cos(a + .1) * mid, Math.sin(a + .1) * mid); g.lineTo(Math.cos(a) * (mid - r), Math.sin(a) * (mid - r)); g.lineTo(Math.cos(a - .1) * mid, Math.sin(a - .1) * mid); g.closePath(); g.fill(); }
  }
  const BUFS = new Map(), NXB = new Map(), NYB = new Map();
  const NX_BUF = n => { let a = NXB.get(n); if (!a) { a = new Float32Array(n); NXB.set(n, a); } return a; }, NY_BUF = n => { let a = NYB.get(n); if (!a) { a = new Float32Array(n); NYB.set(n, a); } return a; };
  // Build the shading buffers for one face.
  // spec: { tier, villain, rIn, k, skin:{a,b,c,f,rim}, emblem(L, small), rimMat, metal, gem (colour of tier-4 stones), flat: skip the rim for plain tokens }
  // Engine-turned patterns cut into the enamel, as height. Heroes get the sunburst, villains the knurl.
  function fieldPat(kind, small) {
    if (kind === 'none') return null;
    const A = small ? .0014 : .0026;
    if (kind === 'sunburst') { const N = small ? 24 : 40; return (u, v) => { const a = Math.atan2(v, u) * N, r = Math.sqrt(u * u + v * v); return (Math.sin(a) > 0 ? A : -A) * Math.min(1, r * 3); }; }
    if (kind === 'knurl') { const f = small ? 15 : 24; return (u, v) => { const p = Math.sin((u + v) * f), q = Math.sin((u - v) * f); return (p * q > 0 ? -A : A) * .4; }; }
    if (kind === 'guilloche') { const f = small ? 16 : 30; return (u, v) => { const r = Math.sqrt(u * u + v * v), a = Math.atan2(v, u); return Math.sin(r * f + Math.sin(a * 8) * 1.6) * A * 1.2; }; }
    if (kind === 'waves') { const f = small ? 9 : 14; return (u, v) => Math.sin((v + Math.sin(u * 5) * .12) * f * 2) * A; }
    if (kind === 'carbon') { const f = small ? 22 : 40; return (u, v) => { const i = Math.floor(u * f) & 1, j = Math.floor(v * f) & 1; return (i ^ j ? A : -A) * .7; }; }
    if (kind === 'facets') { const N = 12; return (u, v) => { const a = Math.atan2(v, u), s = TAU / N, m = ((a % s) + s) % s - s / 2; return Math.abs(m) * Math.sqrt(u * u + v * v) * .09; }; }
    return null;
  }
  function buildFace(spec, R, pitch, ssIn) {
    const ss = ssIn || (R < 60 ? 2 : R < 110 ? 1.3 : 1), Rh = R * ss, Ph = spec.pad === undefined ? Math.ceil(Rh * .14) + 4 : Math.ceil(Rh * spec.pad) + 2, Sh = Math.ceil(Rh * 2 + Ph * 2), small = spec.small === undefined ? R < 46 : spec.small, tiny = Rh < 34;
    const rIn = spec.rIn || (small ? .83 : .79), k = (spec.k || .8) * (small ? 1.06 : 1) * rIn / .8;
    const T = edgeT(edge(Math.max(0, spec.tier), !!spec.villain));
    const aO = readMask(Sh, Rh, pitch, g => { g.beginPath(); T(g); g.fill(); });
    const aF = readMask(Sh, Rh, pitch, g => { g.beginPath(); g.arc(0, 0, rIn, 0, TAU); g.fill(); });
    const nP = Sh * Sh;
    // Rim distance and field distance.
    const rimB = new Uint8Array(nP); for (let i = 0; i < nP; i++) rimB[i] = aO[i] > 127 && aF[i] <= 127 ? 1 : 0;
    const dRim = edt(rimB, Sh, Sh);
    const bwR = Rh * .1, hRim = Rh * .1;
    // Height, material and mask buffers at high resolution.
    // Scratch buffers are pooled by size so a dozen bakes don't churn the garbage collector.
    let PB = BUFS.get(nP); if (!PB) { PB = Array.from({ length: 10 }, () => new Float32Array(nP)); BUFS.set(nP, PB); if (BUFS.size > 8) BUFS.delete(BUFS.keys().next().value); }
    const [H, mR, mG, mB, mM, mA, mS, mE, Hb0, emCov0] = PB;
    const skin = spec.skin, Sq = Sh / 2, pat = tiny || spec.tier < 0 && !spec.pat ? null : fieldPat(spec.pat || (spec.villain ? 'knurl' : 'sunburst'), small);
    // the field: a shallow concave dish, so light rolls across it
    for (let j = 0; j < Sh; j++) for (let i = 0; i < Sh; i++) {
      const idx = i + j * Sh, u = (i + .5 - Sq) / Rh, v = (j + .5 - Sq) / (Rh * pitch), rr = u * u + v * v, a = aF[idx] / 255;
      let fh = (rr * .05 - .05) * Rh;
      if (pat && a > 0) fh += pat(u, v, rr) * Rh;
      H[idx] = fh;
      // Enamel pools darker toward the rim, so the emblem always sits in its own pool of light.
      const f = skin.f, vg = 1.34 - .92 * Math.min(1, rr / (rIn * rIn)); mR[idx] = f.t[0] * vg; mG[idx] = f.t[1] * vg; mB[idx] = f.t[2] * vg; mM[idx] = f.m; mA[idx] = f.an; mS[idx] = f.sp; mE[idx] = f.em || 0;
    }
    // Rim plate.
    const rimM = skin.rim || RIMM[Math.max(0, spec.tier) | 0] || RIMM[0];
    const rimMid = (rIn + .97) / 2, det = spec.tier >= 1 && !tiny ? readMask(Sh, Rh, pitch, g => rimDetail(g, spec.tier, rimMid, small)) : null;
    const gems = spec.tier >= 4 && !tiny ? readMask(Sh, Rh, pitch, g => rimGems(g, spec.tier, rimMid)) : null, millN = tiny || spec.tier < 1 || spec.tier >= 3 ? 0 : small ? 40 : 72, sw = .985 - rIn;
    if (spec.tier >= 0 || spec.metal) {
      for (let i = 0; i < nP; i++) {
        const a = aO[i] > aF[i] ? (aO[i] - aF[i]) / 255 : 0; if (a <= 0) continue;
        const iy = i / Sh | 0, u = ((i - iy * Sh) + .5 - Sq) / Rh, v = (iy + .5 - Sq) / (Rh * pitch), r = Math.sqrt(u * u + v * v), sr = (r - rIn) / sw, t = Math.min(1, dRim[i] / bwR);
        // Two steps and a cut channel: the outer wire, the groove, the inner lip that holds the enamel.
        let h = hRim * bev01(t), dark = 1;
        if (!tiny) { const g0 = (sr - .34) / .13, gg = 1 - g0 * g0; if (gg > 0) { h -= hRim * .62 * gg; dark = 1 - .55 * gg; } if (sr > .42) h += hRim * .24 * Math.min(1, (sr - .42) / .08); }
        if (millN && sr > .66) { const an = Math.atan2(v, u) * millN; if (Math.sin(an) > .3) h -= hRim * .3; }
        if (det) h -= hRim * .55 * det[i] / 255;
        H[i] = H[i] * (1 - a) + h * a; mR[i] += (rimM.t[0] * dark - mR[i]) * a; mG[i] += (rimM.t[1] * dark - mG[i]) * a; mB[i] += (rimM.t[2] * dark - mB[i]) * a; mM[i] += (rimM.m - mM[i]) * a; mA[i] += (rimM.an - mA[i]) * a; mS[i] += (rimM.sp - mS[i]) * a;
        if (gems && gems[i] > 8) { const q = gems[i] / 255, gc = skin.c.t; H[i] += hRim * .5 * q; mR[i] += (gc[0] - mR[i]) * q; mG[i] += (gc[1] - mG[i]) * q; mB[i] += (gc[2] - mB[i]) * q; mM[i] += (.3 - mM[i]) * q; mE[i] += (1.5 - mE[i]) * q; mS[i] += (.5 - mS[i]) * q; }
      }
    }
    // Emblem plates, in the order they were drawn. Cuts reveal the field again.
    const ops = [], push = (kind, list) => { let o = {}; if (list.length && list[list.length - 1] && !Array.isArray(list[list.length - 1]) && typeof list[list.length - 1] !== 'function') o = list.pop(); for (const p of list) ops.push({ kind, tr: typeof p === 'function' ? p : polyT(p), o }); };
    const LL = { a: (...p) => push('a', p), b: (...p) => push('b', p), c: (...p) => push('c', p), x: (...p) => push('x', p), paint: (kind, fn, o) => ops.push({ kind, paint: fn, o: o || {} }) };
    if (spec.emblem) spec.emblem(LL, small);
    const groups = []; let cur = null;
    const oKey = o => o === cur.o || (o.chisel === cur.o.chisel && o.axis === cur.o.axis && o.cx === cur.o.cx && o.cy === cur.o.cy && o.split === cur.o.split && !o.hole && !cur.o.hole);
    for (const op of ops) { if (!cur || cur.kind !== op.kind || !!op.paint !== !!cur.ops[0].paint || !oKey(op.o)) groups.push(cur = { kind: op.kind, o: op.o, ops: [] }); cur.ops.push(op); }
    const emCov = emCov0; emCov.fill(0);
    for (const gr of groups) {
      const mask = readMask(Sh, Rh, pitch, g => { g.save(); g.beginPath(); g.arc(0, 0, rIn - .025, 0, TAU); g.clip(); g.scale(k, k); if (gr.ops[0].paint) { for (const op of gr.ops) op.paint(g); g.restore(); return; } g.beginPath(); for (const op of gr.ops) op.tr(g); g.fill(gr.o.rule || 'nonzero'); if (gr.o.hole) { g.globalCompositeOperation = 'destination-out'; g.beginPath(); gr.o.hole(g); g.fill(); g.globalCompositeOperation = 'source-over'; } g.restore(); });
      if (gr.kind === 'x') {
        const f = skin.f;
        for (let j = mask.by0; j <= mask.by1; j++) for (let i2 = mask.bx0; i2 <= mask.bx1; i2++) { const i = i2 + j * Sh; const a = mask[i] / 255; if (a <= 0) continue; H[i] = H[i] * (1 - a) + (-.07 * Rh) * a; mR[i] += (f.t[0] * .7 - mR[i]) * a; mG[i] += (f.t[1] * .7 - mG[i]) * a; mB[i] += (f.t[2] * .7 - mB[i]) * a; mM[i] += (f.m - mM[i]) * a; mA[i] += (.2 - mA[i]) * a; mS[i] += (f.sp - mS[i]) * a; mE[i] *= 1 - a; emCov[i] *= 1 - a; }
        continue;
      }
      const m = gr.kind === 'a' ? skin.a : gr.kind === 'b' ? skin.b : skin.c, dd = edt(bin(mask), Sh, Sh), chisel = gr.o.chisel;
      const bw = (chisel ? chisel : .085) * Rh * k, top = (gr.kind === 'c' ? .1 : gr.kind === 'b' ? .13 : .18) * Rh, split = gr.o.split !== 0;
      const axis = gr.o.axis, ca = axis === undefined ? 0 : Math.cos(axis), sa = axis === undefined ? 0 : Math.sin(axis), cx = gr.o.cx || 0, cy = gr.o.cy || 0;
      for (let j = mask.by0; j <= mask.by1; j++) for (let i = mask.bx0; i <= mask.bx1; i++) {
        const idx = i + j * Sh, a = mask[idx] / 255; if (a <= 0) continue;
        const d = Math.min(1, dd[idx] / bw); let h = (chisel ? d : bev01(d)) * top * (chisel ? 1.45 : 1) + Math.min(1, dd[idx] / (Rh * .3)) * Rh * .045;
        // a keen facet line along the axis makes each plate read as cut metal
        if (axis !== undefined && split && chisel) { const u = ((i + .5 - Sq) / (Rh * k) - cx), v = ((j + .5 - Sq) / (Rh * pitch * k) - cy), side = u * ca + v * sa; h += Math.max(-.04, Math.min(.04, side)) * Rh * .9; }
        H[idx] = H[idx] * (1 - a) + h * a; mR[idx] += (m.t[0] - mR[idx]) * a; mG[idx] += (m.t[1] - mG[idx]) * a; mB[idx] += (m.t[2] - mB[idx]) * a; mM[idx] += (m.m - mM[idx]) * a; mA[idx] += (m.an - mA[idx]) * a; mS[idx] += (m.sp - mS[idx]) * a; mE[idx] += ((m.em || 0) - mE[idx]) * a; emCov[idx] += (1 - emCov[idx]) * a;
      }
    }
    // The moat: the enamel is cut away around the emblem and falls into shadow. This is what makes the silhouette at thumbnail size.
    if (groups.length && !spec.noMoat) {
      const mw = Rh * (small ? .13 : .1), pad = Math.ceil(mw) + 2; let bx0 = Sh, by0 = Sh, bx1 = -1, by1 = -1;
      for (let j = 0, i = 0; j < Sh; j++) for (let x = 0; x < Sh; x++, i++) if (emCov[i] > .5) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (j < by0) by0 = j; if (j > by1) by1 = j; }
      if (bx1 >= 0) {
        // Only the emblem's own neighbourhood: the far field never reaches the moat.
        bx0 = Math.max(0, bx0 - pad); by0 = Math.max(0, by0 - pad); bx1 = Math.min(Sh - 1, bx1 + pad); by1 = Math.min(Sh - 1, by1 + pad);
        const w2 = bx1 - bx0 + 1, h2 = by1 - by0 + 1, em = new Uint8Array(w2 * h2);
        for (let j = 0; j < h2; j++) for (let x = 0; x < w2; x++) em[x + j * w2] = emCov[x + bx0 + (j + by0) * Sh] > .5 ? 0 : 1;
        const out = edt(em, w2, h2);
        for (let j = 0; j < h2; j++) for (let x = 0; x < w2; x++) { const i = x + bx0 + (j + by0) * Sh; if (emCov[i] > .5 || aF[i] < 8) continue; const t = out[x + j * w2] / mw; if (t >= 1) continue; const q = (1 - t) * (1 - t); H[i] -= q * Rh * .035; const km = 1 - .82 * q; mR[i] *= km; mG[i] *= km; mB[i] *= km; mS[i] *= km; mA[i] *= km; }
      }
    }
    // One light blur takes the staircase out of the distance field, so bevels shade as clean planes.
    const Hb = Hb0;
    for (let j = 1; j < Sh - 1; j++) for (let i = 1; i < Sh - 1; i++) { const q = i + j * Sh; Hb[q] = (H[q] * 4 + (H[q - 1] + H[q + 1] + H[q - Sh] + H[q + Sh]) * 2 + H[q - 1 - Sh] + H[q + 1 - Sh] + H[q - 1 + Sh] + H[q + 1 + Sh]) / 16; }
    // Normals from the height map. The height is in hi-res pixels, so the slope is scale-free.
    const nX = NX_BUF(nP), nY = NY_BUF(nP);
    for (let j = 1; j < Sh - 1; j++) for (let i = 1; i < Sh - 1; i++) {
      const idx = i + j * Sh, dx = (Hb[idx + 1] - Hb[idx - 1]) * .5, dy = (Hb[idx + Sh] - Hb[idx - Sh]) * .5 / pitch, l = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      nX[idx] = -dx * l; nY[idx] = -dy * l;
    }
    // Box-resolve down to the bake resolution.
    const So = Math.ceil(Sh / ss), Po = (So / 2 - R), na = So * So, F = { S: So, R, P: Math.ceil(Po), pitch, nx: new Float32Array(na), ny: new Float32Array(na), r: new Float32Array(na), g: new Float32Array(na), b: new Float32Array(na), m: new Float32Array(na), an: new Float32Array(na), sp: new Float32Array(na), em: new Float32Array(na), a: new Float32Array(na), tx: new Float32Array(na), ty: new Float32Array(na) };
    for (let jo = 0; jo < So; jo++) for (let io = 0; io < So; io++) {
      let aS = 0, nx = 0, ny = 0, r = 0, g = 0, b = 0, m = 0, an = 0, sp = 0, em = 0, cnt = 0;
      const i0 = Math.floor(io * ss), j0 = Math.floor(jo * ss), i1 = Math.min(Sh, Math.ceil((io + 1) * ss)), j1 = Math.min(Sh, Math.ceil((jo + 1) * ss));
      for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) { const idx = i + j * Sh, al = aO[idx] / 255; cnt++; aS += al; nx += nX[idx] * al; ny += nY[idx] * al; r += mR[idx] * al; g += mG[idx] * al; b += mB[idx] * al; m += mM[idx] * al; an += mA[idx] * al; sp += mS[idx] * al; em += mE[idx] * al; }
      const o = io + jo * So;
      if (aS > 0) { const w = 1 / aS; F.nx[o] = nx * w; F.ny[o] = ny * w; F.r[o] = r * w; F.g[o] = g * w; F.b[o] = b * w; F.m[o] = m * w; F.an[o] = an * w; F.sp[o] = sp * w; F.em[o] = em * w; }
      F.a[o] = aS / cnt;
      const u = (io + .5 - So / 2), v = (jo + .5 - So / 2) / pitch, l = Math.hypot(u, v) || 1; F.tx[o] = -v / l; F.ty[o] = u / l;
    }
    return F;
  }

  // ---------- one rendered view of a face ----------
  const LIGHT = [-.45, -.6, .66]; const Ll = Math.hypot(...LIGHT); LIGHT[0] /= Ll; LIGHT[1] /= Ll; LIGHT[2] /= Ll;
  const HALFV = [LIGHT[0], LIGHT[1], LIGHT[2] + 1]; const Hl = Math.hypot(...HALFV); HALFV[0] /= Hl; HALFV[1] /= Hl; HALFV[2] /= Hl;
  // face: buffers from buildFace. yaw: radians about the vertical axis. thick: edge thickness in pixels. out: {ctx, W, x, y, id (ImageData), ...}
  function shade(F, yaw, thick, rimTint, emis, opt, target) {
    const S = F.S, R = F.R, cs = Math.cos(yaw), sn = Math.sin(yaw), MCv = matcap(), MCcv = MCC, FL = film(), sw = opt.sweep ? 1 : 0, bp = sw ? -1.8 + Math.min(1.1, Math.abs(yaw)) * 4.1 : 99, gyaw = sw ? Math.sign(yaw) * Math.min(Math.abs(yaw) * 1.75, .46 + Math.abs(yaw) * .42) : yaw, csg = Math.cos(gyaw), sng = Math.sin(gyaw), filmK = opt.film || 0, ink = opt.ink !== false, data = target, N = MCN, half = S / 2, gloss = opt.gloss || 0, edgeC = opt.edge;
    const rimL = opt.rimL, boost = opt.boost || 1, ca = Math.max(.08, Math.abs(cs)), Rx = R * ca, Hx = HALFV[0] * cs - HALFV[2] * sn, Hy = HALFV[1], d0x = thick * sn, d0y = thick * Math.sqrt(1 - F.pitch * F.pitch), dmag = Math.hypot(d0x, d0y);
    const nx_a = F.nx, ny_a = F.ny, r_a = F.r, g_a = F.g, b_a = F.b, m_a = F.m, an_a = F.an, sp_a = F.sp, em_a = F.em, a_a = F.a, tx_a = F.tx, ty_a = F.ty;
    const px = opt.W || S;
    // Reversed sign keeps the visible edge consistent through a half turn.
    const fcx = half - d0x * .5, fcy = half - d0y * .5;
    const rimR = rimTint[0], rimG = rimTint[1], rimB = rimTint[2], eR = emis[0], eG = emis[1], eB = emis[2];
    let w = 0;
    for (let y = 0; y < px; y++) {
      for (let x = 0; x < px; x++, w += 4) {
        const su = (x + .5 - fcx) / ca + half, sv = y + .5 - fcy + half;
        const iu = su | 0, iv = sv | 0;
        let fA = 0, idx = 0;
        if (su >= 0 && sv >= 0 && iu < S && iv < S) { idx = iu + iv * S; fA = a_a[idx]; }
        let R8 = 0, G8 = 0, B8 = 0, A8 = 0;
        if (fA > .003) {
          const nx0 = nx_a[idx], ny0 = ny_a[idx], nz0 = Math.sqrt(Math.max(.01, 1 - nx0 * nx0 - ny0 * ny0));
          const nx = nx0 * csg + nz0 * sng, nzr = -nx0 * sn + nz0 * cs;
          const ii = (nx * .5 + .5) * N | 0, jj = (ny0 * .5 + .5) * N | 0, mi = (ii < 0 ? 0 : ii >= N ? N - 1 : ii) + (jj < 0 ? 0 : jj >= N ? N - 1 : jj) * N, L0 = MCv[mi], L = gloss ? L0 * (1 + gloss * L0) : L0, cool = MCcv[mi];
          const m = m_a[idx], rr = r_a[idx], gg = g_a[idx], bb = b_a[idx], sp = sp_a[idx] * (m < .6 ? .5 : 1);
          const dot = tx_a[idx] * Hx + ty_a[idx] * Hy; let aa = 1 - dot * dot; if (aa < 0) aa = 0; aa *= aa; aa *= aa; const A = aa * an_a[idx] * .62 * (.6 + L * .55);
          const dif = (1 - m) * (.34 + .16 * L);
          // Metal is tinted by its own reflection: shadows take the colour twice over and go deep and saturated; highlights run pale.
          const sat = L >= 1 ? 0 : (1 - L) * .9 * m, tr = rr * (1 - sat + sat * rr), tg = gg * (1 - sat + sat * gg), tb = bb * (1 - sat + sat * bb);
          let cr = tr * (dif + m * L) + sp * L + A * (rr * .6 + .4), cg = tg * (dif + m * L) + sp * L + A * (gg * .6 + .4), cb = tb * (dif + m * L) + sp * L + A * (bb * .6 + .4);
          if (cool > 0) { cb += cool * (.3 + .5 * m); cg += cool * .22 * m; cr -= cool * .06 * m; }
          // The sweep: a bar of light that travels with the turn. Free at run time, it's in the frames.
          if (bp < 1.6) { const q = ((su - half) * .7 + (sv - half) * .714) / R - bp, b1 = 1 - q * q / .16, q2 = q + .46, b2 = 1 - q2 * q2 / .012; let bb2 = 0; if (b1 > 0) bb2 += b1 * b1; if (b2 > 0) bb2 += b2 * .7; if (bb2 > 0) { const g = bb2 * (.2 + .8 * m) * (.55 + L * .6) * 1.3; cr += g * (rr * .55 + .55); cg += g * (gg * .55 + .55); cb += g * (bb * .55 + .55); } }
          const e = em_a[idx]; if (e > 0) { cr += eR * e * .5; cg += eG * e * .5; cb += eB * e * .5; }
          if (filmK > 0 && m > .3) { const fi = (nzr * .5 + .5) * (FILMN - 1) | 0, ft = filmK * m; cr *= 1 - ft + ft * FL[fi * 3] * 1.05; cg *= 1 - ft + ft * FL[fi * 3 + 1] * 1.05; cb *= 1 - ft + ft * FL[fi * 3 + 2] * 1.05; }
          if (rimL) { const ru = (su - half) / R, rv = (sv - half) / (R * F.pitch), r2 = ru * ru + rv * rv; if (r2 > .6) { let q = (r2 - .6) / .4; if (q > 1) q = 1; q = q * q * (.62 + .38 * Math.max(0, ru * .6 + rv * .8)); cr += rimL[0] * q * .85; cg += rimL[1] * q * .85; cb += rimL[2] * q * .85; } }
          if (boost !== 1) { cr *= boost; cg *= boost; cb *= boost; }
          // Past white, colour bleeds toward white: a highlight that truly blows out.
          const over = Math.max(cr, cg, cb) - 1; if (over > 0) { const q = over * .7; cr += q; cg += q; cb += q; }
          R8 = cr * 255; G8 = cg * 255; B8 = cb * 255; A8 = fA * 255;
        }
        // The edge: march back along the coin's axis looking for the face we would have hit.
        if (A8 < 250 && dmag > .05) {
          const steps = dmag < 2.5 ? 2 : dmag < 6 ? 4 : 6;
          let sA = 0, nsx = 0, nsy = 0;
          for (let k = 1; k <= steps && sA < .98; k++) {
            const t = k / steps, sx2 = (x + .5 - (fcx + d0x * t)) / ca + half, sy2 = y + .5 - (fcy + d0y * t) + half, i2 = sx2 | 0, j2 = sy2 | 0;
            if (sx2 >= 0 && sy2 >= 0 && i2 < S && j2 < S) { const ai = a_a[i2 + j2 * S]; if (ai > sA) { sA = ai; const u = sx2 - half, v = (sy2 - half) / F.pitch, l = Math.hypot(u, v) || 1; nsx = u / l; nsy = v / l; } }
          }
          if (sA > .02) {
            const wx = nsx * cs, nzs = -nsx * sn, ii = (wx * .5 + .5) * N | 0, jj = (nsy * .5 + .5) * N | 0, L = MCv[(ii < 0 ? 0 : ii >= N ? N - 1 : ii) + (jj < 0 ? 0 : jj >= N ? N - 1 : jj) * N];
            // reeded: fine ridges that catch the strip light
            const reed = 1 + .1 * (((nsx * 9 * R / 40) | 0) % 2 === 0 ? 1 : -1);
            const k0 = (.36 + .46 * L * reed) * (nzs > -.2 ? 1 : .7);
            const cr = rimR * k0, cg = rimG * k0, cb = rimB * k0;
            const fa = A8 / 255, sa = sA * (1 - fa);
            const tot = fa + sa; R8 = (R8 * fa + cr * 255 * sa) / tot; G8 = (G8 * fa + cg * 255 * sa) / tot; B8 = (B8 * fa + cb * 255 * sa) / tot; A8 = tot * 255;
          }
        }
        data[w] = R8 > 255 ? 255 : R8; data[w + 1] = G8 > 255 ? 255 : G8; data[w + 2] = B8 > 255 ? 255 : B8; data[w + 3] = A8 > 255 ? 255 : A8;
      }
    }
    // An ink line around the whole shape, baked so it never costs a draw.
    if (ink) {
      for (let y = 1; y < px - 1; y++) for (let x = 1; x < px - 1; x++) {
        const i = (x + y * px) * 4; if (data[i + 3] > 40) continue;
        const on = v => v > 128 && v !== 215; if (on(data[i - 1]) || on(data[i + 7]) || on(data[i + 3 - px * 4]) || on(data[i + 3 + px * 4])) { data[i] = 7; data[i + 1] = 9; data[i + 2] = 14; data[i + 3] = 215; }
      }
    }
    // The halo: a thin spill of team light on the air around the coin, so it lifts off a dark street.
    if (rimL) {
      const hr = Math.min(255, rimL[0] * 255), hg = Math.min(255, rimL[1] * 255), hb = Math.min(255, rimL[2] * 255), PP = F.pitch * R;
      for (let y = 0, i = 0; y < px; y++) for (let x = 0; x < px; x++, i += 4) { if (data[i + 3] > 8) continue; const u = (x + .5 - fcx) / (ca * R), v = (y + .5 - fcy) / PP, r2 = u * u + v * v; if (r2 < .9 || r2 > 1.46) continue; const t = (Math.sqrt(r2) - 1) / .2; if (t >= 1) continue; const q = t < 0 ? 1 : 1 - t; data[i] = hr; data[i + 1] = hg; data[i + 2] = hb; data[i + 3] = q * q * 165; }
    }
  }
  // ---------- sprites built from faces ----------
  const faces = new Map(); // face buffers, held only until the frames are done
  const STAT = { bakeMs: 0, faces: 0, frames: 0, queued: 0, peakQueue: 0 };
  const JOBS = [];
  function skinFor(key, finishId) {
    const base = SKIN[key] || SKIN.vesper, f = finishId ? FINISH[finishId] : null;
    if (!f) return { a: base.a, b: base.b, c: base.c, f: base.f, glow: base.glow };
    return { a: f.fa || base.a, b: f.fb || base.b, c: f.fc || base.c, f: f.ff || base.f, rim: f.fr, glow: f.glow || base.glow, film: f.film, gloss: f.gloss || (f.mirror ? .4 : 0), pat: f.pat };
  }
  const gatherSpec = (kit, team, tier, finishId) => {
    const key = emblemKey(kit, team), skin = skinFor(key, finishId);
    return { key, tier: tier === undefined ? 0 : tier, villain: team === 1, skin, emblem: EMB[key] || EMB.vesper, film: skin.film, gloss: skin.gloss, glow: skin.glow, pat: skin.pat };
  };
  function faceOf(id, spec, R, pitch, ss) { let F = faces.get(id); if (!F) { const t = nowMs(); F = buildFace(spec, R, pitch, ss); STAT.bakeMs += nowMs() - t; STAT.faces++; faces.set(id, F); } return F; }
  const rimTintOf = spec => (spec.skin.rim || (spec.tier >= 0 ? RIMM[spec.tier | 0] : spec.metal || RIMM[0])).t;
  const canvasFrom = (S, draw) => { const c = cv(S, S), g = c.getContext('2d'); const id = g.createImageData(S, S); draw(id.data); g.putImageData(id, 0, 0); return c; };
  // A flat lit face for menus, the HUD and portraits.
  function faceSprite(id, spec, R) {
    if (cache.has(id)) return cache.get(id);
    const ss = R < 44 ? 2 : R < 60 ? 1.5 : 1, F = buildFace(spec, R, 1, ss), t = nowMs();
    const c = canvasFrom(F.S, d => shade(F, -.2, 0, rimTintOf(spec), rgbF(spec.glow || '#ffffff'), { film: spec.film, gloss: spec.gloss, ink: false }, d));
    STAT.bakeMs += nowMs() - t; STAT.faces++;
    const out = { c, R, P: F.S / 2 - R, S: F.S }; cache.set(id, out); return out;
  }
  // The coin in the world: a turntable of pre-lit frames. Frame 0 sits at yaw 0 so the coin is always drawn, and the rest fill in over the next few seconds.
  const WORLD_PITCH = .84;
  function turntable(id, spec, R, N, thick) {
    if (cache.has(id)) return cache.get(id);
    const ss = R < 40 ? 1.6 : 1.3, Sg = Math.ceil(R * ss * 2 + 2 * (Math.ceil(R * ss * .14) + 4)), S = Math.ceil(Sg / ss), T = { N, S, R, F: null, id, spec, ss, f: new Array(N), left: N, thick, rimT: rimTintOf(spec), emis: rgbF(spec.glow || '#ffffff'), mid: N / 2 | 0, ready: false, rimL: rgbF(spec.rimLight || (spec.villain ? '#ff4a3a' : '#5cc0ff')) };
    const out = { c: null, R, P: S / 2 - R, S, T, pitched: true };
    cache.set(id, out);
    JOBS.push({ T, i: -1, k: 0, spr: out });
    for (let k = 0; k <= N / 2; k++) { for (const s of [1, -1]) { const i = (T.mid + s * k + N) % N; JOBS.push({ T, i, k: k + 1, spr: out }); if (k === 0 || k === N / 2) break; } }
    JOBS.sort((a, b) => a.k - b.k); STAT.queued = JOBS.length; STAT.peakQueue = Math.max(STAT.peakQueue, JOBS.length);
    return out;
  }
  // Frames are packed around the resting angle, where the eye is, and spread out through the turn.
  const YAWP = 1.4, QTR = Math.PI / 2, yawOf = (k, N) => Math.sign(k) * Math.pow(Math.abs(k) / (N / 2), YAWP) * QTR;
  function bakeFrame(T, i, spr) {
    if (T.f[i]) return;
    const t = nowMs(), yaw = yawOf(i - T.mid, T.N);
    T.f[i] = canvasFrom(T.S, d => shade(T.F, yaw, T.thick, T.rimT, T.emis, { film: T.spec.film, gloss: T.spec.gloss, sweep: 1, rimL: T.rimL, boost: 1.17 }, d));
    if (i === T.mid && spr) { spr.c = T.f[i]; T.ready = true; }
    T.left--; STAT.bakeMs += nowMs() - t; STAT.frames++;
    if (T.left <= 0) { T.F = null; faces.delete(T.id); } // the face buffers are only needed while frames are still to bake
  }
  // Sprite order within a tier of frames can be advanced by asking for a coin now: the local player's coin goes first.
  function defer(fn, k = 3) { JOBS.push({ run: fn, k }); JOBS.sort((a, b) => a.k - b.k); STAT.queued = JOBS.length; }
  function runJob(j) {
    if (j.run) { j.run(); return; }
    const T = j.T;
    if (j.i === -1) { if (!T.F && !T.ready) T.F = faceOf(T.id, T.spec, T.R, WORLD_PITCH, T.ss); return; }
    if (!T.f[j.i]) { if (!T.F) T.F = faceOf(T.id, T.spec, T.R, WORLD_PITCH, T.ss); bakeFrame(T, j.i, j.spr); }
  }
  // Called every frame with a time budget. Spread over the versus splash and the first seconds of play.
  function pump(ms) {
    if (!JOBS.length) return 0;
    const t0 = nowMs(); let n = 0;
    while (JOBS.length && nowMs() - t0 < ms) { const j = JOBS.shift(); runJob(j); n++; }
    STAT.queued = JOBS.length;
    return n;
  }
  // The nearest finished frame for an angle. Any yaw is fine: the coin's two faces match, so a half turn repeats.
  function frameAt(T, yaw) {
    let y = yaw % Math.PI; if (y > QTR) y -= Math.PI; else if (y < -QTR) y += Math.PI;
    let i = Math.round(Math.pow(Math.abs(y) / QTR, 1 / YAWP) * T.N / 2); if (y < 0) i = -i; i = i + T.mid; i = ((i % T.N) + T.N) % T.N;
    if (T.f[i]) return T.f[i];
    for (let k = 1; k <= T.N / 2; k++) { const a = T.f[(i + k) % T.N], b = T.f[(i - k + T.N) % T.N]; if (a) return a; if (b) return b; }
    return null;
  }
  // Between matches: the world turntables (champions at their in-play size, footsoldiers, beasts) are dropped and their frames
  // handed back, so a long session does not keep every lineup and every quality level it has ever drawn.
  function dropTurntables() {
    let n = 0;
    for (const [k, v] of cache) if (v && v.T && v.pitched) { for (const f of v.T.f) if (f && f.width) { f.width = 0; f.height = 0; } v.T.f.fill(null); v.T.F = null; faces.delete(v.T.id); cache.delete(k); n++; }
    for (let i = JOBS.length - 1; i >= 0; i--) if (JOBS[i].T) JOBS.splice(i, 1);
    STAT.queued = JOBS.length; return n;
  }
  function ensure(spr) { const T = spr.T; if (!T || T.ready) return; if (!T.F) T.F = faceOf(T.id, T.spec, T.R, WORLD_PITCH, T.ss); bakeFrame(T, T.mid, spr); }
  function stats() { return { ...STAT, bakeMs: Math.round(STAT.bakeMs) }; }

  // Warm-up: a coin shown in the lobby quietly prepares the sizes the versus splash and the HUD ask for, so pressing start never hitches.
  const WARM = [], WARMED = new Set(); let warmOn = false;
  function warmPump() { if (typeof window !== 'undefined' && window.__inputAt && performance.now() - window.__inputAt < 450) { setTimeout(warmPump, 150); return; } const j = WARM.shift(); if (!j) { warmOn = false; return; } j(); setTimeout(warmPump, 45); } // UI: menus stamp window.__inputAt on every touch, so a warm-up job never lands under a tap
  function warmUp(fn, key) { if (WARMED.has(key)) return; WARMED.add(key); WARM.push(fn); if (!warmOn && typeof setTimeout !== 'undefined') { warmOn = true; setTimeout(warmPump, 120); } }
  function champCoin(id, team, tier, R = 52, finishId) {
    const side = team === 1 ? 'v' : 'h', spec = gatherSpec(id, team, tier === undefined ? 0 : tier, finishId), key = `cc${side}${spec.key}|`, tk = `${spec.tier}|${finishId || ''}`;
    if (R !== 80 && R !== 26 && R !== 180) { warmUp(() => champCoin(id, team, tier, 80, finishId), key + '80' + tk); warmUp(() => champCoin(id, team, tier, 26, finishId), key + '26' + tk); for (let sl = 0; sl < 3; sl++) warmUp(() => abilityCoin(id, sl, true, 40, team === 1 ? 1 : 0), `ab${id}${sl}${team === 1 ? 1 : 0}`); }
    return faceSprite(`${key}${R}|${tk}`, spec, R);
  }
  // Champion coin for the world, with its turntable. R is in device pixels.
  function champTurn(id, team, tier, R, finishId) {
    const side = team === 1 ? 'v' : 'h', spec = gatherSpec(id, team, tier === undefined ? 0 : tier, finishId), key = `ct${side}${spec.key}|${R}|${spec.tier}|${finishId || ''}`;
    spec.small = true; return turntable(key, spec, R, 20, R * .22);
  }

  // ---------- footsoldiers, civilians and beasts ----------
  const RANK = {
    melee(L) { L.a([[0, -.86], [.78, -.1], [.78, .3], [0, -.34], [-.78, .3], [-.78, -.1]], { axis: 0, chisel: .3 }); L.b([[0, .1], [.56, .56], [.56, .9], [0, .52], [-.56, .9], [-.56, .56]], { axis: 0, chisel: .3 }); },
    ranged(L) { L.a([[0, -.92], [.82, 0], [0, .92], [-.82, 0]], { axis: 0, chisel: .5 }); L.x([[0, -.36], [.32, 0], [0, .36], [-.32, 0]]); },
    // The heavy: a maul head on a short haft, the blunt end of the column.
    heavy(L) { L.a([[-.84, -.78], [.84, -.78], [.84, -.12], [.48, .06], [-.48, .06], [-.84, -.12]], { axis: 0, chisel: .28 }); L.b([[-.2, .06], [.2, .06], [.16, .94], [-.16, .94]], { axis: 0, chisel: .2 }); L.x([[-.5, -.5], [.5, -.5], [.5, -.36], [-.5, -.36]]); },
  };
  const minType = r => r === 'heavy' ? 'heavy' : (r === true || r === 'ranged') ? 'ranged' : 'melee';
  const minSpec = (team, type) => { const hero = team === 0; return { tier: -1, villain: !hero, rIn: type === 'ranged' ? .88 : type === 'heavy' ? .78 : .84, k: .86, skin: hero ? { a: M('#f0f4fa', 1, .8), b: M('#d9c79a', 1, .8), c: SUN, f: M(type === 'heavy' ? '#1f3a66' : '#16294a', 0, .3, .24), rim: M(type === 'heavy' ? '#e6d19c' : '#8aa6cc', 1, .8) } : { a: M('#f26a78', .7, .6, .3, .25), b: M('#a0a4ae', 1, .7), c: BLOOD, f: M(type === 'heavy' ? '#2c1016' : '#180c10', 0, .3, .26), rim: M(type === 'heavy' ? '#d8a040' : '#a83a48', 1, .75) }, metal: M('#8aa6cc'), emblem: RANK[type], glow: hero ? '#ffe6a8' : '#ff6a58' }; };
  // `ranged` may be the old boolean or a type name: 'melee', 'ranged' or 'heavy'.
  function minionCoin(team, ranged, R = 18) { const t = minType(ranged); return faceSprite(`mn${team}${t[0]}|${R}`, minSpec(team, t), R); }
  function minionTurn(team, ranged, R) { const t = minType(ranged); return turntable(`mt${team}${t[0]}|${R}`, minSpec(team, t), R, 10, R * (t === 'heavy' ? .46 : t === 'ranged' ? .16 : .24)); }
  // What a footsoldier carries, in one small sprite so a type reads at a glance even when the emblem can't.
  // Melee a kite blade drawn from the rim toward its target. Heavy a pair of shoulder plates behind the coin. Sized in world units, baked for a 2x screen.
  function minionGear(team, type) {
    const id = `mg${team}${type}`; if (cache.has(id)) return cache.get(id);
    const hero = team === 0, S = 3, a = hero ? '#eef3fa' : '#ff8088', b = hero ? '#8ea6c8' : '#a83040', ink = INK;
    let out;
    if (type === 'heavy') {
      const W = 64, H = 36, c = cv(W * S, H * S), g = c.getContext('2d'); g.scale(S, S); g.lineJoin = 'miter';
      for (const s of [-1, 1]) {
        const P = [[32 + s * 12, 8], [32 + s * 30, 4], [32 + s * 31, 22], [32 + s * 16, 32]];
        g.fillStyle = ink; g.strokeStyle = ink; g.lineWidth = 3.4; g.beginPath(); P.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.closePath(); g.stroke(); g.fill();
        g.fillStyle = s < 0 ? '#c0a264' : '#6e5228'; if (!hero) g.fillStyle = s < 0 ? '#c88a30' : '#7a4a14'; g.beginPath(); P.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,255,255,.34)'; g.beginPath(); g.moveTo(P[0][0], P[0][1]); g.lineTo(P[1][0], P[1][1]); g.lineTo(P[1][0] - s * 3, P[1][1] + 6); g.lineTo(P[0][0], P[0][1] + 5); g.closePath(); g.fill();
      }
      out = { c, w: W, h: H, ax: 32, ay: 18 };
    } else {
      const W = 38, H = 16, c = cv(W * S, H * S), g = c.getContext('2d'); g.scale(S, S); g.lineJoin = 'miter';
      g.fillStyle = ink; g.beginPath(); g.moveTo(1, 8); g.lineTo(14, 2); g.lineTo(37, 8); g.lineTo(14, 14); g.closePath(); g.fill();
      g.fillStyle = a; g.beginPath(); g.moveTo(4, 8); g.lineTo(14, 4); g.lineTo(34, 8); g.lineTo(14, 8); g.closePath(); g.fill();
      g.fillStyle = b; g.beginPath(); g.moveTo(4, 8); g.lineTo(14, 12); g.lineTo(34, 8); g.lineTo(14, 8); g.closePath(); g.fill();
      out = { c, w: W, h: H, ax: 2, ay: 8 };
    }
    cache.set(id, out); return out;
  }
  const CIV_COL = ['#c7884a', '#6c9a78', '#b4667a', '#5f86b4'];
  function civCoin(v, R = 20) {
    v = v % 4; const col = CIV_COL[v], key = 'civ' + v + '|' + R;
    return faceSprite(key, { tier: -1, rIn: .86, k: .86, skin: { a: M('#2a2e38', .6, .5), b: M(col, .5, .4), c: SUN, f: FIELD_CIV, rim: M('#e8e2d4', 1, .6) }, metal: M('#e8e2d4'), emblem(L) { L.a(ngon(0, -.42, .42, 8), { chisel: .5 }); L.b([[-.74, .9], [-.74, .36], [-.4, .06], [.4, .06], [.74, .36], [.74, .9]], { chisel: .25 }); }, glow: '#ffffff' }, R);
  }
  const BEAST = {
    mon(L) { for (const i of [-1, 0, 1]) L.a([[i * .42 + .28, -.92 + Math.abs(i) * .1], [i * .42 + .1, -.82], [i * .42 - .3, .92 - Math.abs(i) * .1], [i * .42 - .06, .34]], { chisel: .4 }); },
    big(L) { for (const s of [1, -1]) L.a([[s * .14, -.2], [s * .46, -.46], [s * .98, -1], [s * .94, -.32], [s * .62, .12], [s * .22, .22]], { chisel: .3, axis: 0 }); L.b([[-.36, .22], [.36, .22], [.26, .62], [0, .98], [-.26, .62]], { axis: 0 }); },
    boss(L) { L.b([[-.96, .96], [-.84, -.2], [-.5, .02], [-.42, -.7], [-.16, -.36], [0, -1.04], [.16, -.36], [.42, -.7], [.5, .02], [.84, -.2], [.96, .96]], { axis: 0, chisel: .2 }); L.c([[-.05, -.66], [.14, -.14], [.03, .1], [.17, .46], [0, .96], [-.14, .46], [-.03, .1], [-.16, -.14]], { axis: 0, chisel: .35 }); },
  };
  const beastSpec = (big, boss) => boss
    ? { tier: -1, villain: true, rIn: .82, k: .8, skin: { a: M('#ffb24a', .7, .6), b: M('#6a6058', 1, .7), c: M('#ffb04a', .3, .3, .3, 1.2), f: FIELD_BOSS, rim: M('#c08a4a', 1, .8) }, metal: M('#c08a4a'), emblem: BEAST.boss, glow: '#ffb04a' }
    : big ? { tier: -1, villain: true, rIn: .82, k: .8, skin: { a: M('#ffd090', 1, .75), b: M('#b6a78e', 1, .7), c: SUN, f: FIELD_BEAST, rim: M('#b08850', 1, .75) }, metal: M('#b08850'), emblem: BEAST.big, glow: '#ffd090' }
      : { tier: -1, villain: true, rIn: .82, k: .86, skin: { a: M('#d8c090', 1, .7), b: M('#b6a78e', 1, .7), c: SUN, f: FIELD_BEAST, rim: M('#9a8c68', 1, .7) }, metal: M('#9a8c68'), emblem: BEAST.mon, glow: '#ffd090' };
  // The named bosses. Each mark is drawn like a logo: one silhouette, one accent. Colossus keeps the old crowned bolt.
  const BOSS_EMB = {
    // Crossed sabres under a spiked helm.
    warlord(L) { for (const s of [-1, 1]) L.a([[s * -.9, .94], [s * -.72, 1], [s * .84, -.1], [s * .94, -.52], [s * .6, -.34]], { chisel: .4 }); L.b([[-.58, -.3], [-.62, -.82], [-.28, -.56], [0, -1.04], [.28, -.56], [.62, -.82], [.58, -.3], [.2, -.1], [-.2, -.1]], { axis: 0, chisel: .3 }); L.c(lozenge(0, .34, .17, .22)); },
    // A gear with a wrench through it.
    foreman(L) { const o = [], n = 10; for (let i = 0; i < n; i++) { const a = i / n * TAU - HALF / 2, w = .17; o.push([Math.cos(a - w) * 1, Math.sin(a - w) * 1], [Math.cos(a + w) * 1, Math.sin(a + w) * 1], [Math.cos(a + w * 1.45) * .74, Math.sin(a + w * 1.45) * .74], [Math.cos(a + TAU / n - w * 1.45) * .74, Math.sin(a + TAU / n - w * 1.45) * .74]); } L.b(o, { chisel: .3, axis: 0 }); L.x(ngon(0, 0, .5, 16)); L.a(rot([[-.17, -.96], [-.38, -.74], [-.3, -.42], [-.16, -.34], [-.16, .72], [0, .94], [.16, .72], [.16, -.34], [.3, -.42], [.38, -.74], [.17, -.96], [.13, -.64], [-.13, -.64]], .78), { chisel: .35, axis: 0 }); },
    // An open eye set in a tall aegis.
    sentinel(L) { L.b([[0, -1.04], [.82, -.72], [.78, .18], [.4, .68], [0, 1.02], [-.4, .68], [-.78, .18], [-.82, -.72]], { axis: 0, chisel: .3 }); L.x([[0, -.76], [.58, -.53], [.55, .1], [.28, .47], [0, .72], [-.28, .47], [-.55, .1], [-.58, -.53]]); L.a([[-.5, -.04], [-.22, -.3], [.22, -.3], [.5, -.04], [.22, .22], [-.22, .22]], { axis: 0, chisel: .4 }); L.c(lozenge(0, -.04, .15, .2)); },
  };
  const BOSS_SKIN = {
    warlord: { a: M('#ff8a4a', .8, .55), b: M('#70727e', 1, .7), c: M('#ff5a3a', .3, .3, .3, 1.2), f: M('#1c0c0a', 0, .3, .24), rim: M('#b05a30', 1, .8), glow: '#ff7a40' },
    foreman: { a: M('#dce2ea', 1, .75), b: M('#f0b23a', .9, .55), c: SUN, f: M('#17140c', 0, .3, .24), rim: M('#c0922e', 1, .8), glow: '#ffc24a' },
    sentinel: { a: M('#d8faff', 1, .8), b: M('#9ab8c8', 1, .75), c: M('#6ae8ff', .3, .3, .3, 1.2), f: M('#08161e', 0, .3, .24), rim: M('#7ac0d8', 1, .8), glow: '#7ae8ff' },
  };
  const bossSpec = kind => { if (!BOSS_SKIN[kind]) return beastSpec(false, true); const k = BOSS_SKIN[kind]; return { tier: -1, villain: true, rIn: .8, k: .8, skin: k, metal: k.rim, emblem: BOSS_EMB[kind], glow: k.glow }; };
  const bossCoin = (kind, R = 96) => faceSprite(`bossF${kind}|${R}`, bossSpec(kind), R);
  function bossTurn(kind, R) { return turntable(`bossT${kind}|${R}`, { ...bossSpec(kind), rimLight: BOSS_COL[kind] || '#ffb060' }, R, 8, R * .3); }
  const BOSS_COL = { warlord: '#ff7a40', foreman: '#ffc24a', sentinel: '#7ae8ff', colossus: '#ffb04a' };
  const monsterCoin = (big, boss) => faceSprite(`bst${boss ? 'b' : big ? 'g' : 'm'}`, beastSpec(big, boss), boss ? 96 : big ? 44 : 28);
  function monsterTurn(big, boss, R) { return turntable(`bt${boss ? 'b' : big ? 'g' : 'm'}|${R}`, { ...beastSpec(big, boss), rimLight: '#ffb060' }, R, boss ? 8 : 10, R * .24); }

  // Plain struck discs: gold pickups, tower bolts, the core coin. `emblem` names a simple glyph.
  const poly = (g, p) => { g.beginPath(); p.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.closePath(); g.fill(); };
  const EMBLEM = {
    boss(g) { poly(g, [[-.92, .55], [-.98, -.5], [-.46, -.05], [0, -.92], [.46, -.05], [.98, -.5], [.92, .55]]); poly(g, [[-.82, .68], [.82, .68], [.8, .9], [-.8, .9]]); },
    minionMelee(g) { poly(g, [[0, -.9], [.72, -.1], [.72, .34], [0, -.34], [-.72, .34], [-.72, -.1]]); poly(g, [[0, .1], [.5, .58], [.5, .9], [0, .5], [-.5, .9], [-.5, .58]]); },
    minionRanged(g) { poly(g, [[0, -.9], [.8, 0], [0, .9], [-.8, 0]]); },
    monster(g) { poly(g, [[-.5, -.9], [-.1, -.8], [.5, .9], [.1, .8]]); },
    big(g) { poly(g, [[0, -.98], [.8, 0], [0, .98], [-.8, 0]]); },
    vesper(g) { poly(g, [[0, -.9], [.3, 0], [0, .9], [-.3, 0]]); }, kade(g) { poly(g, [[0, -1], [.14, .5], [-.14, .5]]); }, ione(g) { poly(g, [[0, -.9], [.2, -.2], [.9, 0], [.2, .2], [0, .9], [-.2, .2], [-.9, 0], [-.2, -.2]]); },
    solenne(g) { poly(g, [[-.8, .4], [.8, .4], [0, -.7]]); }, sable(g) { poly(g, [[.2, -1], [.5, 0], [.2, 1], [-.5, 0]]); }, gravel(g) { poly(g, [[-.8, -.8], [.8, -.8], [.8, .1], [0, .9], [-.8, .1]]); },
  };
  function drawEmblemIcon(g, name, x, y, r, col) { g.save(); g.translate(x, y); g.scale(r, r); g.fillStyle = col; g.strokeStyle = col; EMBLEM[name](g); g.restore(); }
  function coin(key, R0, emblem, metal, team, tier = -1, emblemScale = .56) {
    const id = `${key}|${R0}|${team}|${tier}`; if (cache.has(id)) return cache.get(id);
    const bright = M(mixH(metal[0], '#000000', .22), 1, .8), deep = M(mixH(metal[1], '#000000', .2), 1, .7), E = emblem && EMBLEM[emblem];
    return faceSprite(id, { tier: tier >= 0 ? tier : -1, rIn: tier >= 0 ? .8 : .9, k: emblemScale / .8 * .78, skin: { a: M(mixH(metal[1], '#000000', .55), .8, .3), b: deep, c: SUN, f: bright, rim: bright }, metal: bright, emblem: E ? (L => L.paint('a', g => { g.fillStyle = g.strokeStyle = '#fff'; E(g); }, { chisel: .3 })) : null, glow: '#ffffff' }, R0);
  }

  // A stack disc for towers: relief-lit top, reeded side. R and heights in device pixels at scale 1.
  function reliefStack(team, R) {
    const id = `stk${team}|${R}`; if (cache.has(id)) return cache.get(id);
    const tone = team ? { a: M('#ff5a6c', .5, .5, .3, .4), b: DARKIRON, c: BLOOD, f: M('#17161c', .3, .6, .3), rim: M('#6a2030', 1, .85) } : { a: M('#f0d890', 1, .85), b: SILVER, c: SUN, f: M('#1a2e50', .3, .6, .3), rim: M('#c8a660', 1, .9) };
    const spec = { tier: -1, rIn: .78, k: .72, skin: tone, metal: tone.rim, emblem(L) { for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + HALF / 4; L.b([[Math.cos(a - .09) * .78, Math.sin(a - .09) * .78], [Math.cos(a) * 1.02, Math.sin(a) * 1.02], [Math.cos(a + .09) * .78, Math.sin(a + .09) * .78]]); } if (team) L.a([[0, -.6], [.34, 0], [0, .6], [-.34, 0]], { axis: 0, chisel: .5 }); else L.a(ngon(0, 0, .52, 8), { chisel: .35, axis: 0 }); }, glow: team ? '#ff4a5c' : '#ffdf9e' };
    const F = buildFace(spec, R, .72, 1.5), c = canvasFrom(F.S, d => shade(F, 0, R * .3, tone.rim.t, rgbF(spec.glow), { ink: true }, d));
    STAT.faces++;
    const out = { c, w: F.S, h: F.S, cx: F.S / 2, cy: F.S / 2 };
    cache.set(id, out); return out;
  }

  // ---------- ground sigils: thin, exact, each ability its own geometry ----------
  const cir = (g, r, a0 = 0, a1 = TAU) => { g.beginPath(); g.arc(0, 0, r, a0, a1); g.stroke(); };
  const spokes = (g, n, r0, r1, off = 0) => { g.beginPath(); for (let i = 0; i < n; i++) { const a = off + i / n * TAU; g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); } g.stroke(); };
  const pgon = (g, n, r, off = 0, skip = 1) => { g.beginPath(); for (let i = 0; i <= n; i++) { const a = off + i * skip / n * TAU; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } g.stroke(); };
  const SIGILS = {
    lockdown(g) { g.lineWidth = 0.022; cir(g, .96); cir(g, .72, 0, 1.2); cir(g, .72, TAU / 3, TAU / 3 + 1.2); cir(g, .72, TAU * 2 / 3, TAU * 2 / 3 + 1.2); g.lineWidth = 0.031; spokes(g, 4, .8, 1, HALF / 4); g.lineWidth = 0.012; spokes(g, 24, .9, .96); },
    coven(g) { g.lineWidth = 0.019; cir(g, .97); g.lineWidth = 0.025; for (let k = 0; k < 3; k++) { g.save(); g.rotate(k * TAU / 3); g.beginPath(); for (let i = 0; i <= 40; i++) { const f = i / 40, a = f * 6.2, r = .92 * (1 - f); g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } g.stroke(); g.restore(); } pgon(g, 6, .54, HALF / 6, 2); },
    quarantine(g) { g.lineWidth = 0.031; cir(g, .97); g.lineWidth = 0.062; for (let i = 0; i < 12; i++) { cir(g, .86, i / 12 * TAU, (i + .5) / 12 * TAU); } g.lineWidth = 0.019; cir(g, .7); },
    salute(g) { g.lineWidth = 0.037; cir(g, .96); g.lineWidth = 0.015; cir(g, .86); g.lineWidth = 0.025; spokes(g, 16, .86, .96); for (let i = 0; i < 2; i++) { g.save(); g.rotate(i * HALF / 2 - HALF / 4); g.beginPath(); g.moveTo(0, -.6); g.lineTo(.05, .4); g.lineTo(-.05, .4); g.closePath(); g.fill(); g.restore(); } },
    rupture(g) { g.lineWidth = 0.031; cir(g, .96); g.lineWidth = 0.019; pgon(g, 8, .76, 0, 3); cir(g, .42); spokes(g, 8, .42, .6, HALF / 8); },
    heal(g) { g.lineWidth = 0.031; cir(g, .97); g.lineWidth = 0.019; spokes(g, 24, .78, .97); cir(g, .62); g.lineWidth = 0.037; pgon(g, 12, .62, 0, 5); },
    stomp(g) { g.lineWidth = 0.031; cir(g, .97); g.lineWidth = 0.050; spokes(g, 10, .34, .86, .1); cir(g, .34); },
    crash(g) { g.lineWidth = 0.031; cir(g, .95); g.lineWidth = 0.062; spokes(g, 5, .2, 1, .4); cir(g, .22); },
    hex(g) { g.lineWidth = 0.037; pgon(g, 6, .94, HALF / 6); g.lineWidth = 0.019; pgon(g, 6, .64, HALF / 6); pgon(g, 3, .4, -HALF / 2); },
    mark(g) { g.lineWidth = 0.050; cir(g, .9, .4, 1.2); cir(g, .9, .4 + TAU / 3, 1.2 + TAU / 3); cir(g, .9, .4 + TAU * 2 / 3, 1.2 + TAU * 2 / 3); g.lineWidth = 0.025; pgon(g, 3, .56, -HALF / 2); },
    dome(g) { g.lineWidth = 0.025; for (let r = .32; r < 1; r += .22) pgon(g, 6, r, HALF / 6); g.lineWidth = 0.012; spokes(g, 6, 0, .98, HALF / 6); },
    root(g) { g.lineWidth = 0.050; cir(g, .92); g.lineWidth = 0.062; spokes(g, 3, .55, .92, -HALF / 2); },
    fissure(g) { g.lineWidth = 0.031; g.beginPath(); let x = -1; g.moveTo(x, 0); const r = seeded(7); while (x < 1) { x += .1 + r() * .14; g.lineTo(x, (r() - .5) * .34); } g.stroke(); },
    // 15.0 kit revamp
    star(g) { g.lineWidth = 0.031; cir(g, .96); g.lineWidth = 0.019; cir(g, .5); g.beginPath(); for (let i = 0; i <= 8; i++) { const a = -HALF / 2 + i / 8 * TAU, r = i % 2 ? .3 : .86; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.stroke(); g.lineWidth = 0.012; spokes(g, 16, .9, .96, HALF / 16); },
    target(g) { g.lineWidth = 0.037; cir(g, .96); g.lineWidth = 0.019; cir(g, .62); cir(g, .24); g.lineWidth = 0.05; spokes(g, 4, .7, 1.04, HALF / 4); g.lineWidth = 0.025; spokes(g, 4, .3, .54, HALF / 4); },
    bubble(g) { g.lineWidth = 0.031; cir(g, .95); g.lineWidth = 0.019; cir(g, .8, 3.6, 4.6); cir(g, .66, .5, 1.3); g.lineWidth = 0.012; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + .3; g.beginPath(); g.arc(Math.cos(a) * .52, Math.sin(a) * .52, .09, 0, TAU); g.stroke(); } },
    bulwark(g) { g.lineWidth = 0.037; pgon(g, 8, .96, HALF / 8); g.lineWidth = 0.019; pgon(g, 8, .7, HALF / 8); g.lineWidth = 0.05; spokes(g, 8, .74, .92, 0); g.lineWidth = 0.025; cir(g, .3); },
  };
  function sigil(name, col, S = 256) {
    const id = `sig${name}${col}`; if (cache.has(id)) return cache.get(id);
    const c = cv(S, S), g = c.getContext('2d'); g.translate(S / 2, S / 2); g.scale(S / 2.02, S / 2.02); g.strokeStyle = g.fillStyle = col; g.lineJoin = 'miter'; g.lineCap = 'butt';
    (SIGILS[name] || SIGILS.mark)(g);
    cache.set(id, c); return c;
  }

  // A spiked iron ball, for Ironjaw's Wrecking Ball.
  function spikeBall() {
    if (cache.has('ball')) return cache.get('ball');
    const S = 96, c = cv(S, S), g = c.getContext('2d'); g.translate(48, 48);
    g.fillStyle = INK; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.beginPath(); g.moveTo(Math.cos(a - .32) * 27, Math.sin(a - .32) * 27); g.lineTo(Math.cos(a) * 45, Math.sin(a) * 45); g.lineTo(Math.cos(a + .32) * 27, Math.sin(a + .32) * 27); g.closePath(); g.fill(); }
    g.fillStyle = '#6a707c'; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.beginPath(); g.moveTo(Math.cos(a - .26) * 27, Math.sin(a - .26) * 27); g.lineTo(Math.cos(a) * 41, Math.sin(a) * 41); g.lineTo(Math.cos(a + .26) * 27, Math.sin(a + .26) * 27); g.closePath(); g.fill(); }
    const gr = g.createRadialGradient(-10, -12, 3, 0, 0, 30); gr.addColorStop(0, '#e8ecf2'); gr.addColorStop(.35, '#868c98'); gr.addColorStop(.8, '#343842'); gr.addColorStop(1, '#14161c');
    g.fillStyle = INK; g.beginPath(); g.arc(0, 0, 29, 0, TAU); g.fill(); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 27, 0, TAU); g.fill();
    cache.set('ball', c); return c;
  }
  // ---------- soft sprites ----------
  function glow(color) {
    const id = 'g' + color; if (cache.has(id)) return cache.get(id);
    const c = cv(64, 64), g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, color); r.addColorStop(.3, color); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = .9; g.fillStyle = r; g.fillRect(0, 0, 64, 64); cache.set(id, c); return c;
  }
  let shadowC = null;
  function shadow() { if (shadowC) return shadowC; const c = cv(128, 128), g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 8, 64, 64, 64); r.addColorStop(0, 'rgba(0,0,0,.78)'); r.addColorStop(.62, 'rgba(0,0,0,.5)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); return shadowC = c; }

  // ---------- ability icons: one clean white glyph per ability ----------
  const ln = (g, ...p) => { g.beginPath(); for (let i = 0; i < p.length; i += 2) g[i ? 'lineTo' : 'moveTo'](p[i], p[i + 1]); g.stroke(); };
  const arc = (g, x, y, r, a = 0, b = TAU) => { g.beginPath(); g.arc(x, y, r, a, b); g.stroke(); };
  const dot = (g, x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
  const ICON = {
    deadbolt: [
      g => { ln(g, -.9, -.32, -.9, .55); ln(g, .9, -.32, .9, .55); g.setLineDash([.28, .17]); ln(g, -.9, .12, .9, .12); g.setLineDash([]); poly(g, [[-.32, -.2], [.32, -.2], [0, .2]]); },
      g => { ln(g, -.92, .62, -.08, -.42); ln(g, -.08, -.42, .72, .52); poly(g, [[.95, .78], [.42, .72], [.78, .36]]); g.save(); g.scale(1, .28); arc(g, -.08, -1.7, .24); g.restore(); },
      g => { arc(g, 0, 0, .78); ln(g, 0, -.98, 0, -.48); ln(g, 0, .48, 0, .98); ln(g, -.98, 0, -.48, 0); ln(g, .48, 0, .98, 0); dot(g, 0, 0, .17); },
    ],
    duelist: [
      g => { for (const o of [-.46, 0, .46]) { g.beginPath(); g.arc(o - .56, .3, .8, -1.2, -.15); g.stroke(); } },
      g => { g.setLineDash([.16, .12]); arc(g, -.46, .1, .34); g.setLineDash([]); dot(g, .44, .1, .34); ln(g, -.05, -.62, .55, -.62); poly(g, [[.84, -.62], [.46, -.84], [.46, -.4]]); },
      g => { arc(g, 0, 0, .9); poly(g, [[0, -.74], [.1, .28], [-.1, .28]]); ln(g, -.36, .3, .36, .3); ln(g, 0, .3, 0, .68); },
    ],
    hex: [
      g => { g.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + .52; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * .86, Math.sin(a) * .86); } g.closePath(); g.stroke(); dot(g, 0, 0, .3); },
      g => { g.save(); g.scale(.36, 1); arc(g, 0, 0, .82); g.restore(); for (const s of [1, -1]) poly(g, [[s * .4, -.74], [s * .86, -.4], [s * .5, -.24]]); ln(g, 0, -.52, 0, .52); },
      g => { for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * TAU / 3; arc(g, Math.cos(a) * .58, Math.sin(a) * .58, .26); } g.beginPath(); for (let i = 0; i < 40; i++) { const a = i / 40 * 9, r = .34 * (1 - i / 40); g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } g.stroke(); },
    ],
    plague: [
      g => { dot(g, -.42, .24, .34); dot(g, .08, -.1, .42); dot(g, .52, .28, .3); ln(g, -.78, .66, .78, .66); ln(g, -.48, .9, .48, .9); },
      g => { g.beginPath(); g.moveTo(-.9, .8); g.quadraticCurveTo(-.5, .1, -.2, .2); g.stroke(); g.beginPath(); g.moveTo(.14, -.06); g.quadraticCurveTo(.4, -.1, .85, -.8); g.stroke(); poly(g, [[-.98, .98], [-.62, .94], [-.82, .58]]); poly(g, [[.98, -.98], [.62, -.94], [.82, -.58]]); g.save(); g.lineWidth = .08; ln(g, -.02, .08, -.1, -.3); ln(g, -.02, .08, .3, .36); ln(g, -.02, .08, -.38, .5); g.restore(); },
      g => { arc(g, 0, 0, .86); ln(g, -.56, -.56, .56, .56); ln(g, .56, -.56, -.56, .56); },
    ],
    shiv: [
      g => { poly(g, [[.96, -.9], [.12, .28], [-.2, -.04], [.7, -.92]]); poly(g, [[-.36, .32], [-.1, .56], [-.34, .78], [-.6, .54]]); ln(g, -.84, -.3, -.5, -.3); ln(g, -.6, -.62, -.3, -.62); },
      g => { g.setLineDash([.22, .15]); arc(g, 0, 0, .84); g.setLineDash([]); poly(g, [[0, -.46], [.32, .36], [0, .16], [-.32, .36]]); },
      g => { for (const o of [-.58, 0, .58]) ln(g, o + .3, -.86, o - .3, .86); ln(g, -.98, .08, .98, -.2); },
    ],
    ironjaw: [
      g => { dot(g, .4, -.36, .4); g.save(); g.lineWidth = .1; g.setLineDash([.14, .1]); g.beginPath(); g.arc(-.2, .2, .74, -.4, 2.6); g.stroke(); g.setLineDash([]); ln(g, -.98, -.2, -.3, -.36); ln(g, -.9, -.62, -.24, -.62); g.restore(); poly(g, [[.98, -.98], [.62, -.92], [.92, -.62]]); },
      g => { g.beginPath(); g.arc(.14, -.08, .58, -2.9, 1.2); g.stroke(); poly(g, [[-.52, -.42], [-.94, -.2], [-.58, .05]]); ln(g, .34, .46, .75, .95); },
      g => { poly(g, [[-.95, .72], [-.55, .2], [-.25, .46], [.05, -.32], [.32, .05], [.58, -.76], [.95, .72]]); },
    ],
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
      g => { const st = (x, y, r) => { g.beginPath(); for (let i = 0; i <= 8; i++) { const a = -HALF / 2 + i / 8 * TAU, q = i % 2 ? r * .4 : r; g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * q, y + Math.sin(a) * q); } g.closePath(); g.fill(); }; for (const [x, y, r] of [[-.5, .52, .46], [.18, .3, .34], [.66, -.28, .28]]) { st(x, y, r); g.save(); g.lineWidth = .1; ln(g, x - r * .3, y - r * 1.1, x - r * .9, y - r * 2.6); g.restore(); } },
    ],
    solenne: [
      g => { poly(g, [[-.17, -.7], [.17, -.7], [.17, -.25], [.62, -.25], [.62, .1], [.17, .1], [.17, .55], [-.17, .55], [-.17, .1], [-.62, .1], [-.62, -.25], [-.17, -.25]]); ln(g, -.85, .88, .85, .88); },
      g => { g.beginPath(); g.arc(0, .55, .92, Math.PI, 0); g.stroke(); arc(g, 0, .55, .5, Math.PI, 0); ln(g, -1, .6, 1, .6); },
      g => { g.beginPath(); g.arc(0, .42, .5, Math.PI, 0); g.closePath(); g.fill(); for (let i = 0; i < 7; i++) { const a = Math.PI + i / 6 * Math.PI; ln(g, Math.cos(a) * .68, .42 + Math.sin(a) * .68, Math.cos(a) * .98, .42 + Math.sin(a) * .98); } ln(g, -1, .68, 1, .68); },
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
  Object.assign(ICON, {
    voltaic: [
      g => { poly(g, [[.18, -.95], [.72, -.95], [.34, -.2], [.72, -.2], [-.22, .95], [.02, .1], [-.34, .1]]); ln(g, -.95, -.5, -.3, -.5); ln(g, -.95, -.1, -.5, -.1); },
      g => { dot(g, 0, 0, .3); for (let i = 0; i < 4; i++) { g.save(); g.rotate(i * HALF / 2 + HALF / 4); g.lineWidth = .13; ln(g, .42, 0, .6, -.16, .74, .1, .98, 0); g.restore(); } },
      g => { poly(g, [[-.98, .5], [-.24, -.2], [-.3, .12], [.34, -.5], [.26, -.16], [.62, -.4], [-.04, .36], [.02, .04], [-.62, .62]]); g.save(); g.lineWidth = .13; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; ln(g, .62 + Math.cos(a) * .14, .5 + Math.sin(a) * .14, .62 + Math.cos(a) * .4, .5 + Math.sin(a) * .4); } g.restore(); },
    ],
    tidecaller: [
      g => { g.beginPath(); g.moveTo(-.95, .4); g.bezierCurveTo(-.4, -.7, .3, -.7, .6, -.05); g.bezierCurveTo(.3, -.32, 0, -.2, -.18, .4); g.closePath(); g.fill(); ln(g, -.9, .78, .9, .78); },
      g => { arc(g, .28, .2, .64); g.save(); g.lineWidth = .1; g.beginPath(); g.arc(.08, 0, .32, 3.3, 4.7); g.stroke(); g.setLineDash([.16, .12]); g.beginPath(); g.moveTo(-.98, .9); g.quadraticCurveTo(-.92, -.9, -.24, -.5); g.stroke(); g.restore(); dot(g, .5, .46, .1); },
      g => { for (let i = 0; i < 3; i++) { const y = -.62 + i * .58, x = -.96 + i * .14; g.beginPath(); g.moveTo(x, y + .3); g.quadraticCurveTo(0, y - .55, -x, y + .3); g.quadraticCurveTo(0, y - .12, x, y + .3); g.closePath(); g.fill(); } },
    ],
    paragon: [
      g => { poly(g, [[0, -1], [.42, -.36], [.16, -.36], [.16, .5], [-.16, .5], [-.16, -.36], [-.42, -.36]]); ln(g, -.6, .84, .6, .84); },
      g => { poly(g, [[-.5, -.4], [.24, -.4], [.32, .34], [-.46, .34]]); g.save(); g.lineWidth = .1; ln(g, -.98, -.24, -.66, -.24); ln(g, -.98, .18, -.66, .18); g.restore(); poly(g, [[.62, -.98], [.98, -.98], [.98, .98], [.62, .98]]); g.save(); g.lineWidth = .09; ln(g, .4, -.62, .52, -.3); ln(g, .44, .58, .54, .3); g.restore(); },
      g => { g.save(); g.scale(1, .42); arc(g, -.1, 1.74, .8); g.lineWidth = .1; arc(g, -.1, 1.74, .36); g.restore(); dot(g, .02, -.12, .4); g.save(); g.lineWidth = .12; ln(g, .32, -.42, .86, -.96); ln(g, .44, -.08, .98, -.5); ln(g, -.04, -.56, .4, -.98); g.restore(); },
    ],
    mirage: [
      g => { poly(g, [[.96, 0], [.2, -.26], [.3, 0], [.2, .26]]); ln(g, -.96, -.72, .04, -.1); ln(g, -.96, .72, .04, .1); ln(g, -.98, 0, .1, 0); },
      g => { dot(g, -.5, .2, .34); g.setLineDash([.17, .13]); arc(g, .36, -.3, .34); g.setLineDash([]); g.save(); g.lineWidth = .1; ln(g, .2, .32, .8, .32); g.restore(); poly(g, [[.98, .32], [.74, .16], [.74, .48]]); },
      g => { for (const [x, y] of [[-.62, -.62], [.62, -.62], [-.62, .62], [.62, .62]]) { g.save(); g.lineWidth = .12; g.strokeRect(x - .24, y - .3, .48, .6); g.restore(); } dot(g, 0, 0, .22); },
    ],
    cinder: [
      g => { poly(g, [[-.9, .9], [-.5, .2], [-.34, .46], [.02, -.26], [.14, .04], [.92, -.9], [.5, .1], [.24, -.02], [-.08, .66], [-.28, .34]]); },
      g => { g.save(); g.scale(1, .42); arc(g, 0, 1.2, .9); g.restore(); for (let i = -1; i <= 1; i++) poly(g, [[i * .46, -.6 + Math.abs(i) * .2], [i * .46 + .17, .3], [i * .46 - .17, .3]]); },
      g => { poly(g, [[0, -1], [.22, -.42], [.5, -.68], [.54, -.2], [.82, -.36], [.74, .3], [.42, .86], [0, 1], [-.42, .86], [-.74, .3], [-.82, -.36], [-.54, -.2], [-.5, -.68], [-.22, -.42]]); },
    ],
    ravager: [
      g => { for (const o of [-.54, 0, .54]) poly(g, [[o + .28, -.92], [o + .08, -.92], [o - .3, .92], [o - .1, .92]]); },
      g => { poly(g, [[-.96, .84], [-.34, -.1], [.6, -.86], [.3, -.1], [.92, -.16], [.1, .3], [.24, .84], [-.3, .4]]); },
      g => { g.lineWidth = .15; arc(g, 0, 0, .88, 0, 1.4); arc(g, 0, 0, .88, 2.1, 3.5); arc(g, 0, 0, .88, 4.2, 5.6); poly(g, [[-.36, -.5], [.42, -.5], [.3, .16], [0, .6], [-.3, .16]]); },
    ],
    cataclysm: [
      g => { dot(g, .36, -.36, .34); ln(g, -.84, .84, .02, .04); g.setLineDash([.14, .14]); ln(g, -.96, .34, -.42, -.2); g.setLineDash([]); },
      g => { g.beginPath(); for (const [x, y] of [[-.82, -.7], [.82, -.7], [.74, .14], [0, .92], [-.74, .14]]) g.lineTo(x, y); g.closePath(); g.stroke(); for (let i = 0; i < 3; i++) { const y = -.36 + i * .34, w = .44 - i * .1; poly(g, [[-w, y], [0, y + .2], [w, y], [w, y + .1], [0, y + .3], [-w, y + .1]]); } },
      g => { g.lineWidth = .15; ln(g, -.98, .1, -.44, -.26, -.12, .24, .32, -.34, .98, .08); poly(g, [[-.3, .5], [.14, .5], [.3, .98], [-.5, .98]]); },
    ],
    puppeteer: [
      g => { g.lineWidth = .11; ln(g, -.96, .86, .3, -.26); poly(g, [[-.96, .86], [-.5, .38], [-.3, .58]]); dot(g, .44, -.38, .2); g.lineWidth = .08; g.beginPath(); g.moveTo(.44, -.38); g.quadraticCurveTo(.98, -.3, .74, .4); g.stroke(); dot(g, .74, .5, .17); },
      g => { poly(g, [[-.84, -.92], [.84, -.92], [.76, -.72], [-.76, -.72]]); g.lineWidth = .08; ln(g, -.68, -.72, -.5, .12); ln(g, .68, -.72, .5, .12); poly(g, [[0, -.2], [.44, .3], [.28, .92], [-.28, .92], [-.44, .3]]); },
      g => { poly(g, [[-.5, -.26], [.5, -.26], [.42, -.06], [-.42, -.06]]); g.lineWidth = .1; ln(g, 0, -.98, 0, -.26); ln(g, -.46, -.06, -.8, .6); ln(g, .46, -.06, .8, .6); dot(g, -.8, .7, .17); dot(g, .8, .7, .17); dot(g, 0, .44, .28); },
    ],
  });
  function abilityCoin(champ, slot, on, R0 = 40, team = 0) {
    const id = `ab${champ}${slot}${on}${R0}${team}`; if (cache.has(id)) return cache.get(id).c;
    if (!on) { const src = abilityCoin(champ, slot, true, R0, team), c = cv(src.width, src.height), g = c.getContext('2d'); g.drawImage(src, 0, 0); g.globalCompositeOperation = 'saturation'; g.fillStyle = '#808080'; g.fillRect(0, 0, c.width, c.height); g.globalCompositeOperation = 'destination-in'; g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(8,10,16,.55)'; g.fillRect(0, 0, c.width, c.height); cache.set(id, { c }); return c; }
    const R = R0 * 2, ult = slot === 2, villain = team === 1, key = emblemKey(champ, team), base = SKIN[key] || SKIN.vesper, dim = !on;
    const glyph = dim ? M('#7f8590', 1, .4) : villain ? (key === 'shiv' || key === 'duelist' || key === 'ironjaw' ? M('#ff8a90', .55, .5, .3, .7) : M('#d6ff72', .55, .5, .3, .7)) : M('#fff0c4', 1, .7);
    const rim = dim ? M('#3f444e', 1, .5) : ult ? (villain ? M(mixH(rgb2hex(base.a.t), '#ffffff', .2), 1, .9) : GOLD) : SILVER;
    const icon = ICON[champ] && ICON[champ][slot] || ICON[key] && ICON[key][slot] || ICON.vesper[slot % 3];
    const spr = faceSprite(id, { pat: 'none', tier: ult && on ? 3 : 0, villain: false, rIn: .84, k: .74, pad: .075, skin: { a: glyph, b: glyph, c: glyph, f: dim ? M('#14161b', 0, .3, .2) : base.f, rim }, metal: rim, glow: villain ? base.glow : '#fff0c4',
      emblem(L) { L.paint('a', g => { g.lineWidth = .17; g.lineCap = 'butt'; g.lineJoin = 'miter'; g.fillStyle = g.strokeStyle = '#fff'; icon(g); }, { chisel: .1 }); } }, R);
    cache.set(id, spr); return spr.c;
  }
  function iconURL(champ, slot, team = 0) { return abilityCoin(champ, slot, true, 40, team).toDataURL(); }

  // moving light band that sweeps across a coin
  function sheen() {
    if (cache.has('sheen')) return cache.get('sheen');
    const frames = []; for (let f = 0; f < 12; f++) { const c = cv(96, 96), g = c.getContext('2d'); g.beginPath(); g.arc(48, 48, 44, 0, TAU); g.clip(); const o = -60 + f * 18, gr = g.createLinearGradient(o, o, o + 28, o + 28); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 96, 96); frames.push(c); }
    cache.set('sheen', frames); return frames;
  }
  function vignette(w, h) {
    const id = `v${w}x${h}`; if (cache.has(id)) return cache.get(id);
    const c = cv(w / 2, h / 2), g = c.getContext('2d'), gr = g.createRadialGradient(w / 4, h / 4, h * .32, w / 4, h / 4, w * .36); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(2,3,8,.62)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h); cache.set(id, c); return c;
  }
  // The thin machined side of a coin, seen from a low angle.
  function reed(col = '#3a3f4a') {
    const id = 'reed' + col; if (cache.has(id)) return cache.get(id);
    const R0 = 56, ry = R0 * .84, T = R0 * .16, c = cv(R0 * 2 + 2, ry * 2 + T + 2), g = c.getContext('2d');
    g.translate(R0 + 1, ry + 1); g.fillStyle = col; g.beginPath(); g.ellipse(0, T, R0, ry, 0, 0, TAU); g.fill(); g.fillRect(-R0, 0, R0 * 2, T);
    g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(-R0, 0, R0 * .7, T * .55);
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(R0 * .1, 0, R0, T + ry);
    const out = { c, R0, ry, T }; cache.set(id, out); return out;
  }
  // Soft puff that fades to its own colour, so normal-blend smoke has no dark fringe.
  function puff(r, g0, b, a = 1) {
    const id = `pf${r},${g0},${b},${a}`; if (cache.has(id)) return cache.get(id);
    const c = cv(64, 64), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${r},${g0},${b},${a})`); gr.addColorStop(.45, `rgba(${r},${g0},${b},${a * .55})`); gr.addColorStop(1, `rgba(${r},${g0},${b},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); cache.set(id, c); return c;
  }
  function leaf(col) {
    const id = 'lf' + col; if (cache.has(id)) return cache.get(id);
    const c = cv(16, 10), g = c.getContext('2d'); g.fillStyle = col; g.beginPath(); g.moveTo(1, 5); g.lineTo(8, 1); g.lineTo(15, 5); g.lineTo(8, 9); g.closePath(); g.fill();
    cache.set(id, c); return c;
  }
  // Wedges cut from a real coin sprite, so a broken badge falls apart into its own emblem.
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

  // ---------- impact sprites: thin, bright, angular ----------
  // A needle fading from a white-hot point to nothing.
  const needle = (g, x0, y0, x1, y1, w, col) => { const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l * w, ny = dx / l * w, mx0 = x0 + dx * .3, my0 = y0 + dy * .3; g.fillStyle = col; g.beginPath(); g.moveTo(x0, y0); g.lineTo(mx0 + nx, my0 + ny); g.lineTo(x1, y1); g.lineTo(mx0 - nx, my0 - ny); g.closePath(); g.fill(); };
  // Radial slashes around a hard white flash. col is the outer tone, col2 the inner.
  function impact(col, col2, seed = 1) {
    const id = `imp${col}${col2}${seed}`; if (cache.has(id)) return cache.get(id);
    const S = 256, c = cv(S, S), g = c.getContext('2d'), r = seeded(seed * 53 + 19), C = S / 2, n = 11;
    g.translate(C, C);
    for (let i = 0; i < n; i++) { const a = i / n * TAU + r() * .34, L = (i % 2 ? 70 : 118) * (.75 + r() * .3), in0 = 26 + r() * 14; needle(g, Math.cos(a) * in0, Math.sin(a) * in0, Math.cos(a) * L, Math.sin(a) * L, 2.6 + r() * 1.6, col); needle(g, Math.cos(a) * in0, Math.sin(a) * in0, Math.cos(a) * L * .72, Math.sin(a) * L * .72, 1.1, col2); }
    // the flash: one long and one short needle crossed, a small lozenge at the heart
    for (const [a, L, w] of [[.5, 62, 6.5], [.5 + Math.PI, 62, 6.5], [.5 + Math.PI / 2, 26, 5], [.5 - Math.PI / 2, 26, 5]]) needle(g, 0, 0, Math.cos(a) * L, Math.sin(a) * L, w, '#ffffff');
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(0, -11); g.lineTo(11, 0); g.lineTo(0, 11); g.lineTo(-11, 0); g.closePath(); g.fill();
    cache.set(id, c); return c;
  }
  // Fine radial lines with an open centre, for heavy moments only.
  function speedLines(col, seed = 1) {
    const id = `sl${col}${seed}`; if (cache.has(id)) return cache.get(id);
    const S = 512, c = cv(S, S), g = c.getContext('2d'), r = seeded(seed * 41 + 23), n = 38;
    g.translate(S / 2, S / 2); g.fillStyle = col;
    for (let i = 0; i < n; i++) { if (r() < .3) continue; const a = i / n * TAU + r() * .05, w = .004 + r() * .01, in0 = 150 + r() * 70; g.beginPath(); g.moveTo(Math.cos(a) * in0, Math.sin(a) * in0); g.lineTo(Math.cos(a - w) * 256, Math.sin(a - w) * 256); g.lineTo(Math.cos(a + w) * 256, Math.sin(a + w) * 256); g.closePath(); g.fill(); }
    cache.set(id, c); return c;
  }
  function sparkSp(col) {
    const id = 'sp' + col; if (cache.has(id)) return cache.get(id);
    const c = cv(48, 10), g = c.getContext('2d');
    g.fillStyle = col; g.beginPath(); g.moveTo(0, 5); g.lineTo(34, 2); g.lineTo(48, 5); g.lineTo(34, 8); g.closePath(); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(18, 5); g.lineTo(36, 3.8); g.lineTo(46, 5); g.lineTo(36, 6.2); g.closePath(); g.fill();
    cache.set(id, c); return c;
  }
  // A low, flat scuff of dust: two slabs of pale grey at low alpha.
  // dark: 0 pale dust, 1 black smoke, 2 toxic green haze.
  function dustCel(dark, v = 0) {
    const id = `dc${dark ? dark | 0 : 0}${v % 3}`; if (cache.has(id)) return cache.get(id);
    const S = 96, c = cv(S, S), g = c.getContext('2d'), r = seeded(v * 37 + (dark ? 91 : 13)), P_ = [];
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU, d = 28 + r() * 16; P_.push([48 + Math.cos(a) * d, 48 + Math.sin(a) * d * .7]); }
    g.fillStyle = dark === 2 ? 'rgba(90,130,20,.42)' : dark ? 'rgba(10,12,20,.55)' : 'rgba(120,132,150,.3)'; polyT(P_)(g); g.fill();
    g.fillStyle = dark === 2 ? 'rgba(182,236,58,.32)' : dark ? 'rgba(40,44,58,.5)' : 'rgba(176,186,200,.28)'; g.save(); g.beginPath(); P_.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](48 + (x - 48) * .62 - 6, 48 + (y - 48) * .62 - 5)); g.closePath(); g.fill(); g.restore();
    cache.set(id, c); return c;
  }
  // An angular shard with one lit face.
  function chip(col, v = 0) {
    const id = `ch${col}${v % 3}`; if (cache.has(id)) return cache.get(id);
    const c = cv(24, 24), g = c.getContext('2d'), P_ = [[[2, 4], [22, 8], [8, 22]], [[4, 2], [21, 15], [3, 21]], [[12, 1], [23, 19], [1, 17]]][v % 3];
    polyT(P_)(g); g.fillStyle = col; g.fill();
    g.save(); g.beginPath(); P_.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.closePath(); g.clip(); g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.moveTo(P_[0][0], P_[0][1]); g.lineTo(P_[1][0], P_[1][1]); g.lineTo(12, 12); g.closePath(); g.fill(); g.restore();
    cache.set(id, c); return c;
  }
  // A lens streak, baked once per colour. Long, thin, white at the heart.
  function flare(col) {
    const id = 'flr' + col; if (cache.has(id)) return cache.get(id);
    const W = 256, H = 32, c = cv(W, H), g = c.getContext('2d');
    let gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(.5, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, H / 2); g.quadraticCurveTo(W / 2, -H * .12, W, H / 2); g.quadraticCurveTo(W / 2, H * 1.12, 0, H / 2); g.fill();
    gr = g.createLinearGradient(W * .22, 0, W * .78, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(W * .22, H * .42, W * .56, H * .16);
    cache.set(id, c); return c;
  }
  function glint(col) {
    const id = 'gl' + col; if (cache.has(id)) return cache.get(id);
    const c = cv(48, 48), g = c.getContext('2d'), t = (r, r2, f) => { g.fillStyle = f; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU - Math.PI / 2, l = i % 2 ? r * r2 : r; g[i ? 'lineTo' : 'moveTo'](24 + Math.cos(a) * l, 24 + Math.sin(a) * l); } g.closePath(); g.fill(); };
    t(23, .12, col); t(12, .16, '#ffffff'); cache.set(id, c); return c;
  }
  // A slender column of light, for levelling up.
  function pillar(col, col2) {
    const id = 'pil' + col + col2; if (cache.has(id)) return cache.get(id);
    const c = cv(128, 512), g = c.getContext('2d'), band = (w, f) => { g.fillStyle = f; g.beginPath(); g.moveTo(64 - w, 512); g.lineTo(64 - w * .3, 0); g.lineTo(64 + w * .3, 0); g.lineTo(64 + w, 512); g.closePath(); g.fill(); };
    band(40, col); band(18, col2); band(5, '#ffffff');
    g.globalCompositeOperation = 'destination-out'; const m = g.createLinearGradient(0, 0, 0, 512); m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(.55, 'rgba(0,0,0,.1)'); m.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = m; g.fillRect(0, 0, 128, 512);
    cache.set(id, c); return c;
  }
  // Warning glyph shown when you stand in a blast: a hard triangle, no words.
  function hazard() {
    if (cache.has('hz')) return cache.get('hz');
    const S = 72, c = cv(S, S), g = c.getContext('2d');
    g.beginPath(); g.moveTo(36, 4); g.lineTo(69, 64); g.lineTo(3, 64); g.closePath(); g.fillStyle = '#ff3e1c'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#07090e'; g.stroke();
    g.fillStyle = '#07090e'; g.beginPath(); g.moveTo(31, 24); g.lineTo(41, 24); g.lineTo(38, 46); g.lineTo(34, 46); g.closePath(); g.fill(); g.fillRect(33, 50, 6, 7);
    const out = { c, w: S, h: S }; cache.set('hz', out); return out;
  }
  // Knocked-out copy of a coin: drained of colour and split by a single clean crack.
  function koCoin(spr) {
    if (spr.ko) return spr.ko;
    const S = spr.S, c = cv(S, S), g = c.getContext('2d'), k = spr.R;
    g.drawImage(spr.c, 0, 0);
    g.globalCompositeOperation = 'saturation'; g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = 'destination-in'; g.drawImage(spr.c, 0, 0);
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(6,8,14,.5)'; g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = 'source-over'; g.translate(S / 2, S / 2); g.scale(k, k);
    g.beginPath(); [[-.5, -.92], [-.12, -.42], [-.3, -.08], [.1, .32], [-.06, .94]].forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.strokeStyle = '#ff3e4e'; g.lineWidth = .06; g.lineJoin = 'miter'; g.stroke();
    return spr.ko = { c, S, R: spr.R, P: spr.P };
  }

  // ---------- big-moment sprites ----------
  // A champion's mark as one flat silhouette, for stamping huge at the kill point.
  function seal(kit, col, S = 192) {
    const id = `seal${kit}${col}${S}`; if (cache.has(id)) return cache.get(id);
    const c = cv(S, S), g = c.getContext('2d'); g.translate(S / 2, S / 2); g.scale(S / 2.3, S / 2.3); g.fillStyle = col; g.lineJoin = 'miter';
    const put = (kind, list) => { g.globalCompositeOperation = kind === 'x' ? 'destination-out' : 'source-over'; for (const p of list) { if (typeof p === 'function') { g.beginPath(); p(g); g.fill(); continue; } if (!Array.isArray(p)) continue; g.beginPath(); p.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.closePath(); g.fill(); } g.globalCompositeOperation = 'source-over'; };
    const L = { a: (...p) => put('a', p), b: (...p) => put('b', p), c: (...p) => put('c', p), x: (...p) => put('x', p), paint: (k, fn) => { g.save(); g.strokeStyle = g.fillStyle = col; fn(g); g.restore(); } };
    try { const e = EMB[kit]; if (e) e(L, true); } catch (err) { }
    cache.set(id, c); return c;
  }
  // A shockwave: a bright leading edge and a dust band trailing inside it. Drawn squashed on the ground.
  function shock(col) {
    const id = 'shock' + col; if (cache.has(id)) return cache.get(id);
    const S = 256, c = cv(S, S), g = c.getContext('2d'), rgb = hex(col).join(',');
    const gr = g.createRadialGradient(128, 128, 60, 128, 128, 128);
    gr.addColorStop(0, `rgba(${rgb},0)`); gr.addColorStop(.8, `rgba(${rgb},0)`); gr.addColorStop(.93, `rgba(${rgb},.14)`); gr.addColorStop(.975, `rgba(${rgb},.8)`); gr.addColorStop(.99, 'rgba(255,250,235,.85)'); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    cache.set(id, c); return c;
  }
  // A bounty seal pinned to a coin. Three grades: a gold star, a star on a red ground, a crowned star.
  function bountyMark(grade) {
    const id = 'bty' + grade; if (cache.has(id)) return cache.get(id);
    const S = 3, W = 26, c = cv(W * S, W * S), g = c.getContext('2d'); g.scale(S, S); g.translate(W / 2, W / 2 + (grade === 2 ? 2 : 0)); g.lineJoin = 'miter';
    const star = (R, r) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -HALF / 2 + i / 10 * TAU, d = i % 2 ? r : R; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * d, Math.sin(a) * d); } g.closePath(); };
    if (grade >= 1) { g.fillStyle = INK; g.beginPath(); g.arc(0, 0, 9.5, 0, TAU); g.fill(); g.fillStyle = '#b81e2c'; g.beginPath(); g.arc(0, 0, 8, 0, TAU); g.fill(); }
    star(8.6, 3.8); g.fillStyle = INK; g.strokeStyle = INK; g.lineWidth = 2.4; g.stroke(); g.fill();
    star(7.2, 3.1); g.fillStyle = '#ffd86a'; g.fill();
    g.beginPath(); g.moveTo(0, -7.2); g.lineTo(0, 0); g.lineTo(-6.8, -2.2); g.closePath(); g.fillStyle = '#fff4c8'; g.fill();
    if (grade >= 2) { g.fillStyle = INK; g.beginPath(); g.moveTo(-6, -7); g.lineTo(-6.5, -12.5); g.lineTo(-2.8, -9.8); g.lineTo(0, -13.5); g.lineTo(2.8, -9.8); g.lineTo(6.5, -12.5); g.lineTo(6, -7); g.closePath(); g.fill(); g.fillStyle = '#ffd86a'; g.beginPath(); g.moveTo(-4.6, -8.2); g.lineTo(-5, -11); g.lineTo(-2.6, -9); g.lineTo(0, -11.8); g.lineTo(2.6, -9); g.lineTo(5, -11); g.lineTo(4.6, -8.2); g.closePath(); g.fill(); }
    const out = { c, w: W, h: W }; cache.set(id, out); return out;
  }
  // 13.0 Wanted: a deco plaque with a crosshair, worn high over the coin. Grade 0..3 adds pips and a gold edge.
  function wantedMark(grade, col = '#ff3f3a') {
    const id = 'wanted' + grade + col; if (cache.has(id)) return cache.get(id);
    const S = 3, W = 72, H = 30, c = cv(W * S, H * S), g = c.getContext('2d'); g.scale(S, S); g.lineJoin = 'miter';
    const plate = (i) => { g.beginPath(); g.moveTo(8 + i, 2 + i); g.lineTo(W - 8 - i, 2 + i); g.lineTo(W - 2 - i, 11); g.lineTo(W - 8 - i, 20 - i); g.lineTo(8 + i, 20 - i); g.lineTo(2 + i, 11); g.closePath(); };
    plate(0); g.fillStyle = INK; g.fill();
    plate(1.6); g.fillStyle = grade >= 2 ? '#3a0a10' : '#250a0e'; g.fill(); g.strokeStyle = grade >= 3 ? '#ffd86a' : col; g.lineWidth = 1.4; g.stroke();
    g.font = '800 9.5px "Barlow Semi Condensed",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#ffe9d8'; g.fillText('WANTED', W / 2 + 6, 11.5);
    // crosshair on the left
    g.strokeStyle = col; g.lineWidth = 1.3; g.beginPath(); g.arc(13, 11, 4.2, 0, TAU); g.moveTo(13, 4.8); g.lineTo(13, 8); g.moveTo(13, 14); g.lineTo(13, 17.2); g.moveTo(6.8, 11); g.lineTo(10, 11); g.moveTo(16, 11); g.lineTo(19.2, 11); g.stroke();
    // pips under the plate: one per grade
    for (let i = 0; i <= grade; i++) { const x = W / 2 - grade * 4 + i * 8; g.fillStyle = INK; g.beginPath(); g.moveTo(x, 21); g.lineTo(x + 3.4, 24.6); g.lineTo(x, 28.2); g.lineTo(x - 3.4, 24.6); g.closePath(); g.fill(); g.fillStyle = grade >= 3 ? '#ffd86a' : col; g.beginPath(); g.moveTo(x, 22.4); g.lineTo(x + 2.1, 24.6); g.lineTo(x, 26.8); g.lineTo(x - 2.1, 24.6); g.closePath(); g.fill(); }
    const out = { c, w: W, h: H }; cache.set(id, out); return out;
  }

  // ---------- 11.0 minted medals ----------
  // Art.medal(id, tier, R): tier 0/1/2 (or 'Bronze'/'Silver'/'Gold'), -1 for not yet earned. Returns a canvas that fits a 2R x 2R box, and paints 2R CSS px when placed in the page.
  // Each medal is a real height field (rim, field, emblem, gems) shaded through the same matcap as the coins, so the three tiers differ in silhouette, build and material.
  // Nothing bakes until it is asked for. Baked masters and composites sit in an LRU bounded by bytes; Art.medalInto spreads first-time bakes over frames for long lists.
  const MEDAL_TIERS = ['bronze', 'silver', 'gold'];
  const tierOf = t => typeof t === 'string' ? MEDAL_TIERS.indexOf(t.toLowerCase()) : t === undefined || t === null ? 0 : t | 0;
  const rampLUT = stops => { const o = new Uint8ClampedArray(768), n = stops.length - 1; for (let i = 0; i < 256; i++) { const t = i / 255 * n, k = Math.min(n - 1, t | 0), f = t - k, A = hex(stops[k]), B = hex(stops[k + 1]); for (let c = 0; c < 3; c++) o[i * 3 + c] = A[c] + (B[c] - A[c]) * f; } return o; };
  const lazyRamp = stops => { let l; return () => l || (l = rampLUT(stops)); };
  const MINT_RAMP = {
    bronze: lazyRamp(['#120804', '#3d1d0c', '#7e4620', '#b87638', '#e0a768', '#f8dcb4', '#fff6e6']),
    bronzeDk: lazyRamp(['#0c0503', '#2a140a', '#573018', '#85522a', '#ad7a48', '#d6ae80']),
    silver: lazyRamp(['#070a12', '#2a3346', '#66748c', '#a8b6ca', '#dde6f2', '#f6faff', '#ffffff']),
    silverDk: lazyRamp(['#05070d', '#1c2331', '#454f63', '#7a879c', '#aebacb', '#dde5f0']),
    gold: lazyRamp(['#140800', '#552a02', '#a8680c', '#e8a822', '#ffd257', '#fff0ac', '#fffdf2']),
    goldDk: lazyRamp(['#0e0500', '#3e1d02', '#7e4a08', '#b97e14', '#e2ae3a', '#f6d78a']),
    rose: lazyRamp(['#160603', '#5a2410', '#a85c2a', '#e39a52', '#ffc98a', '#ffeccc', '#fffaf0']),
    iron: lazyRamp(['#05060a', '#14171f', '#262b36', '#3b424f', '#555e6e', '#737d8e']),
    ruby: lazyRamp(['#1e0006', '#5c0414', '#b00c28', '#ee2a44', '#ff7a84', '#ffe4e4', '#ffffff']),
    sapphire: lazyRamp(['#00061e', '#04206a', '#0e50c0', '#3a8cf4', '#9ccaff', '#eef6ff', '#ffffff']),
    diamond: lazyRamp(['#28364e', '#6a86a8', '#b8d2ea', '#eaf6ff', '#ffffff', '#ffffff']),
  };
  // Metal ids index this table; 'e' entries are enamels whose colours come from the medal's category.
  const MINT_MAT = [null,
    { r: 'bronze', g: .95, brush: .2 }, { r: 'bronzeDk', g: .8, brush: .1, patina: 1, grain: .05 },
    { r: 'silver', g: 1, brush: .34 }, { r: 'silverDk', g: .86, brush: .45 },
    { r: 'gold', g: 1.08, brush: .36 }, { r: 'goldDk', g: .9, brush: .5 }, { r: 'rose', g: 1.05, brush: .3 },
    { e: 0 }, { e: 1 }, { r: 'ruby', g: 1.2, gem: 1, brush: 0 }, { r: 'sapphire', g: 1.2, gem: 1, brush: 0 }, { r: 'diamond', g: 1.4, gem: 1, brush: 0 }, { r: 'iron', g: .75, brush: .08, grain: .03 }];
  const BRZ = 1, BRZD = 2, SLV = 3, SLVD = 4, GLD = 5, GLDD = 6, ROSE = 7, ENA = 8, ENB = 9, RUBY = 10, SAPH = 11, DIAM = 12, IRON = 13;
  // Category dress: enamel deep and bright, then a second enamel for the outer ring. Ordered by the sim's cat strings, loosely matched.
  const MEDAL_DRESS = {
    multi: ['#3e020e', '#d61a38', '#0a0a12', '#3a2a30'], deathless: ['#14063c', '#7a42ea', '#0a0a14', '#322a48'], mastery: ['#031a56', '#2a78ec', '#0a0b12', '#26304a'],
    rescue: ['#02302c', '#14b8a0', '#070e10', '#203a3a'], objective: ['#3a1402', '#ec7a14', '#0c0a08', '#40301e'], clutch: ['#063014', '#22c45a', '#070e0a', '#22382a'], role: ['#10163e', '#5a64ea', '#090a12', '#2a2c44'],
  };
  const D2R = Math.PI / 180;
  const rr = (x, y, w, h) => [[x - w, y - h], [x + w, y - h], [x + w, y + h], [x - w, y + h]];
  const SKEL = {
    blade: (a, w = .13, tipY = -1, baseY = .34) => rot([[0, tipY], [w, tipY + .26], [w * .78, baseY], [-w * .78, baseY], [-w, tipY + .26]], a),
    guard: (a, y = .36, w = .36, t = .07) => rot([[-w, y - t], [w, y - t], [w * .8, y + t], [-w * .8, y + t]], a),
    grip: (a, y0 = .42, y1 = .8, w = .07) => rot(rr(0, (y0 + y1) / 2, w, (y1 - y0) / 2), a),
    pommel: (a, y = .9, r = .1) => rot(lozenge(0, y, r, r), a),
    sword(L, a, k = 1) { L.a(rot(this.blade(0, .13 * k), a)); L.b(rot(this.guard(0, .36, .36 * k), a), rot(this.grip(0), a), rot(this.pommel(0), a)); },
    shield: (k = 1, y = 0) => [[0, -.95], [.74, -.68], [.74, .08], [.44, .66], [0, .98], [-.44, .66], [-.74, .08], [-.74, -.68]].map(([p, q]) => [p * k, q * k + y]),
    star(cx, cy, R, r, n = 5, a0 = -HALF / 2) { const o = []; for (let i = 0; i < n * 2; i++) { const a = a0 + i / (n * 2) * TAU, d = i % 2 ? r : R; o.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d]); } return o; },
    heart(cx, cy, k) { const o = []; for (let i = 0; i < 40; i++) { const t = i / 40 * TAU, x = 16 * Math.sin(t) ** 3, y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t); o.push([cx + x / 17 * k, cy - y / 17 * k]); } return o; },
    feather(a, r0, r1, w) { const c = Math.cos(a), s = Math.sin(a), n = [-s, c]; return [[c * r0 + n[0] * w * .3, s * r0 + n[1] * w * .3], [c * (r0 + (r1 - r0) * .7) + n[0] * w, s * (r0 + (r1 - r0) * .7) + n[1] * w], [c * r1, s * r1], [c * (r0 + (r1 - r0) * .7) - n[0] * w * .6, s * (r0 + (r1 - r0) * .7) - n[1] * w * .6], [c * r0 - n[0] * w * .3, s * r0 - n[1] * w * .3]]; },
    skull(L) { L.a(disc(0, -.2, .68), [[-.4, .2], [.4, .2], [.34, .72], [-.34, .72]]); L.x(lozenge(-.26, -.16, .19, .2), lozenge(.26, -.16, .19, .2), [[0, .1], [.09, .3], [-.09, .3]]); for (const x of [-.2, 0, .2]) L.x(rr(x, .6, .03, .12)); },
    pips(L, n, y = .86) { for (let i = 0; i < n; i++) L.c(lozenge((i - (n - 1) / 2) * .2, y, .07, .09)); },
  };
  // Twenty-odd emblems, each drawn once as flat parts that the mint then raises. Same L interface as the champion marks.
  const MEDAL_EMB = {
    double(L) { SKEL.sword(L, -.72); SKEL.sword(L, .72); },
    triple(L) { SKEL.sword(L, -.82, .85); SKEL.sword(L, .82, .85); SKEL.sword(L, 0, 1.1); },
    quad(L) { for (let i = 0; i < 4; i++) L.a(rot(SKEL.blade(0, .16, -1.02, -.2), HALF / 4 + i / 4 * TAU)); L.b(ngon(0, 0, .34, 4, 0)); L.c(lozenge(0, 0, .15, .19)); },
    penta(L) { for (let i = 0; i < 5; i++) L.a(rot(SKEL.blade(0, .15, -1.02, -.2), i / 5 * TAU)); L.b(ngon(0, 0, .36, 5)); L.c(lozenge(0, 0, .15, .19)); },
    reaper(L) { SKEL.skull(L); L.b(rot(rr(0, 0, .06, 1), .85), rot(rr(0, 0, .06, 1), -.85)); },
    streak(L) { for (let i = 0; i < 3; i++) { const y = -.62 + i * .62; L[i === 1 ? 'b' : 'a']([[-.76, y - .24], [-.2, y - .24], [.52, y + .02], [-.2, y + .28], [-.76, y + .28], [-.1, y + .02]]); } L.c(lozenge(.76, 0, .14, .28)); },
    aegis(L) { L.b(SKEL.shield(1)); L.x(SKEL.shield(.8)); L.a(SKEL.shield(.66)); L.x(SKEL.heart(0, -.04, .38)); },
    flawless(L) { L.b(SKEL.shield(1)); L.x(SKEL.shield(.82)); L.a(SKEL.star(0, -.03, .7, .29)); },
    deathward(L) { L.a(disc(0, -.1, .74)); L.x(lozenge(-.3, -.1, .19, .19), lozenge(.3, -.1, .19, .19)); L.a([[-.5, .4], [.5, .4], [.42, .92], [-.42, .92]]); for (const x of [-.24, 0, .24]) L.x(rr(x, .72, .04, .16)); L.b(rot(rr(0, -.06, 1, .09), -.74)); },
    ghost(L) { const body = [...arcPts(0, -.2, .68, Math.PI, TAU, 22), [.68, .86], [.4, .62], [.14, .9], [-.14, .62], [-.4, .9], [-.68, .62]]; L.a(body); L.x(lozenge(-.26, -.22, .14, .19), lozenge(.26, -.22, .14, .19)); L.x(band(0, .08, .1, .18, .3, Math.PI - .3, 12)); },
    crown(L) { L.a([[-.84, .44], [-.98, -.5], [-.46, -.08], [0, -.86], [.46, -.08], [.98, -.5], [.84, .44]]); L.b(rr(0, .66, .86, .14)); L.c(lozenge(0, -.1, .13, .19)); L.c(lozenge(-.56, .16, .09, .12), lozenge(.56, .16, .09, .12)); },
    anvil(L) { L.a([[-1, -.46], [.82, -.46], [.82, -.08], [.34, .04], [.34, .3], [.62, .62], [-.54, .62], [-.26, .3], [-.26, .04], [-.62, -.08]]); L.b(rr(.04, .78, .72, .13)); L.c(SKEL.star(.1, -.86, .22, .08, 4, 0)); },
    legion(L) { for (let i = 0; i < 6; i++) { const a = -HALF + i / 6 * TAU; L.b(disc(Math.cos(a) * .72, Math.sin(a) * .72, .22)); } L.a(SKEL.star(0, 0, .58, .25)); },
    laureate(L) { L.a(SKEL.star(0, -.14, .56, .23)); for (const sd of [-1, 1]) for (let i = 0; i < 6; i++) { const a = HALF / 2 + sd * (.34 + i * .42); L.b(SKEL.feather(a + sd * .9, 0, .3, .09).map(([x, y]) => [x + Math.cos(a) * .76, y + Math.sin(a) * .76])); } },
    hand(L) { L.a([[-.5, .18], [.5, .18], [.42, .92], [-.42, .92]]); for (let i = 0; i < 4; i++) { const x = -.37 + i * .25, t = [-.42, -.72, -.66, -.34][i]; L.a([...arcPts(x, t + .1, .1, Math.PI, TAU, 8), [x + .1, .3], [x - .1, .3]]); } L.a([[.46, .3], [.86, -.14], [.97, -.04], [.54, .6]]); L.x(band(0, .55, .22, .29, Math.PI + .3, TAU - .3, 10)); },
    lantern(L) { L.b(band(0, -.66, .15, .25, Math.PI, TAU, 14), rr(0, -.56, .46, .08), rr(0, .84, .5, .1)); L.a([[-.4, -.46], [.4, -.46], [.54, .74], [-.54, .74]]); L.x([[-.25, -.34], [.25, -.34], [.34, .62], [-.34, .62]]); L.c([[0, -.26], [.2, .22], [.1, .54], [-.1, .54], [-.2, .22]]); },
    chains(L) { const link = (x, y, a) => rot([...arcPts(0, -.24, .3, Math.PI, TAU, 10), ...arcPts(0, .24, .3, 0, Math.PI, 10)], a).map(([p, q]) => [p + x, q + y]), inner = (x, y, a) => rot([...arcPts(0, -.24, .15, Math.PI, TAU, 10), ...arcPts(0, .24, .15, 0, Math.PI, 10)], a).map(([p, q]) => [p + x, q + y]); L.a(link(-.46, .4, -.75), link(.46, -.4, -.75)); L.x(inner(-.46, .4, -.75), inner(.46, -.4, -.75)); L.c([[.08, -.14], [-.2, .02], [-.02, .05], [-.12, .3], [.2, .02], [.02, -.02]]); },
    tower(L) { L.a([[-.5, -.44], [.5, -.44], [.4, .62], [-.4, .62]]); for (let i = 0; i < 3; i++) L.a(rr((i - 1) * .44, -.72, .16, .2)); L.b(rr(0, .78, .62, .13)); L.x([[-.13, .62], [-.13, .22], [0, .06], [.13, .22], [.13, .62]]); L.c(lozenge(0, -.22, .08, .13)); },
    colossus(L) { L.b([[-.5, -.42], [-1, -.98], [-.84, -.2], [-.44, .08]], [[.5, -.42], [1, -.98], [.84, -.2], [.44, .08]]); L.a([[-.62, -.52], [.62, -.52], [.72, .1], [.36, .9], [-.36, .9], [-.72, .1]]); L.x([[-.48, -.2], [-.12, -.02], [-.14, .14], [-.46, .06]], [[.48, -.2], [.12, -.02], [.14, .14], [.46, .06]]); for (const x of [-.2, 0, .2]) L.x(rr(x, .62, .05, .16)); },
    flag(L) { L.b(rr(-.56, 0, .07, 1)); L.a([[-.48, -.94], [.92, -.62], [.42, -.34], [.92, -.06], [-.48, .14]]); L.c(lozenge(-.56, -1, .1, .1)); L.b(rr(-.56, .9, .36, .08)); },
    city(L) { L.a([...arcPts(0, -.06, .54, Math.PI, TAU, 24)]); L.a(rr(0, .36, .72, .36)); for (let i = 0; i < 5; i++) L.x(rr(-.48 + i * .24, .4, .07, .22)); L.b(rr(0, .82, .88, .1), rr(0, -.72, .04, .14)); L.c(lozenge(0, -.94, .09, .11)); },
    phoenix(L) { for (let i = 0; i < 5; i++) { L.a(SKEL.feather(Math.PI + .08 + i * .29, .22, 1.02 - i * .04, .12)); L.a(SKEL.feather(-.08 - i * .29, .22, 1.02 - i * .04, .12)); } L.b([[0, -.52], [.2, -.26], [.14, .3], [0, .96], [-.14, .3], [-.2, -.26]]); L.c(lozenge(0, -.28, .07, .1)); for (const a of [HALF - .45, HALF + .45]) L.b(SKEL.feather(a, .3, .98, .1)); },
    hourglass(L) { L.b(rr(0, -.88, .68, .11), rr(0, .88, .68, .11)); L.a([[-.54, -.72], [.54, -.72], [.08, 0], [.54, .72], [-.54, .72], [-.08, 0]]); L.x([[-.36, -.62], [.36, -.62], [.2, -.36], [-.2, -.36]], [[0, .22], [.36, .62], [-.36, .62]]); L.c([[-.02, .1], [.02, .1], [.02, .5], [-.02, .5]]); },
    comeback(L) { L.b([[-.98, .78], [-.42, .14], [-.14, .42], [.08, .14], [.08, .46], [-.14, .78], [-.42, .5], [-.8, .94]]); L.a([[.08, .46], [.08, -.28], [-.2, -.28], [.34, -.98], [.88, -.28], [.6, -.28], [.6, .78], [.08, .78]]); L.c(SKEL.star(-.62, -.5, .26, .09, 4, 0)); },
    lifeline(L) { L.a(SKEL.heart(0, -.04, .98)); L.x(SKEL.heart(0, -.04, .7)); L.c([[.16, -.56], [-.28, .06], [-.02, .06], [-.14, .6], [.3, -.1], [.04, -.1]]); },
    eye(L) { L.a([...arcPts(0, .56, 1.08, -2.52, -.62, 16), ...arcPts(0, -.56, 1.08, .62, 2.52, 16)]); L.x(disc(0, 0, .42)); L.b(disc(0, 0, .3)); L.c(lozenge(0, 0, .08, .15)); },
    fist(L) { for (let i = 0; i < 4; i++) L.a([[-.62 + i * .32, -.72], [-.34 + i * .32, -.72], [-.3 + i * .32, -.16], [-.66 + i * .32, -.16]]); L.a([[-.68, -.1], [.68, -.1], [.6, .54], [.3, .96], [-.3, .96], [-.6, .54]]); L.b([[-.7, .1], [.12, .1], [.22, .3], [-.5, .34]]); },
    mask(L) { L.a([[-1, -.42], [-.42, -.6], [0, -.36], [.42, -.6], [1, -.42], [.86, .14], [.42, .34], [0, .06], [-.42, .34], [-.86, .14]]); L.x(lozenge(-.44, -.12, .25, .15), lozenge(.44, -.12, .25, .15)); L.b(disc(0, .68, .26)); L.x(disc(0, .68, .13)); L.c(lozenge(0, .68, .06, .08)); },
    highroad(L) { L.a([[-1, .74], [-.44, -.36], [-.16, .1], [.24, -.76], [1, .74]]); L.x([[-.1, .76], [.1, -.1], [.17, -.1], [.3, .76]]); L.b([[.24, -.76], [.44, -.34], [.3, -.4], [.2, -.3], [.1, -.42], [.02, -.3]]); L.c(lozenge(-.72, -.7, .13, .17)); },
    claws(L) { for (const x of [-.56, 0, .56]) L.a([[x - .08, -1], [x + .18, -.92], [x + .13, .16], [x - .24, 1], [x - .13, .14]]); L.c(lozenge(.62, -.56, .08, .12)); },
    anchor(L) { L.a(rr(0, .08, .1, .84)); L.b(rr(0, -.44, .44, .09)); L.a(band(0, .02, .72, .9, .32, Math.PI - .32, 20)); L.b(lozenge(.74, .14, .2, .24), lozenge(-.74, .14, .2, .24)); L.b(band(0, -.86, .1, .2, 0, TAU, 18)); L.c(lozenge(0, .44, .06, .1)); },
    pillar(L) { L.b(rr(0, -.72, .66, .12), rr(0, .84, .66, .12)); L.a(rr(0, .06, .42, .66)); for (const x of [-.22, 0, .22]) L.x(rr(x, .06, .05, .56)); L.c(SKEL.star(0, -.98, .18, .07, 4, 0)); },
    star(L) { L.a(SKEL.star(0, 0, 1.02, .42)); L.c(lozenge(0, 0, .13, .17)); },
  };
  // Reads a medal's meaning from its id, then its category. Unknown ids still get a stable, sensible mark.
  const MEDAL_RULES = [[/penta|quint|five|ace\b|wipe/, 'penta'], [/quad|four/, 'quad'], [/tri(ple)?|three/, 'triple'], [/doub|twin|two/, 'double'], [/reap|slay|execution|butcher/, 'reaper'], [/streak|spree|rampage|unstopp/, 'streak'],
    [/flawless|perfect|immaculate/, 'flawless'], [/ghost|untouch|shadow/, 'ghost'], [/deathless|surviv|immortal|undying/, 'aegis'], [/phoenix|rise|reborn/, 'phoenix'], [/comeback|turn|revers/, 'comeback'], [/clutch|last.?stand|buzzer|hour|nick|late/, 'hourglass'], [/lifeline|heart|heal|medic|mend/, 'lifeline'],
    [/rescue|save|hand|guardian/, 'hand'], [/lantern|beacon|hope|shelter/, 'lantern'], [/chain|free|liberat/, 'chains'], [/city|civic|town|site|ward/, 'city'],
    [/tower|siege|raze|wreck|demoli/, 'tower'], [/boss|colossus|titan|giant|slayer/, 'colossus'], [/steal|flag|capture|objective|claim/, 'flag'],
    [/marks|sniper|longshot/, 'vesper'], [/duel|fighter|blade/, 'kade'], [/mage|arcan|spell/, 'ione'], [/support|solace/, 'solenne'], [/assass/, 'sable'], [/tank|bulwark|wall|iron/, 'gravel'],
    [/crown|king|legend|peer/, 'crown'], [/forge|anvil|smith|grind/, 'anvil'], [/legion|roster|every|all.?champ|versatil|polyglot/, 'legion'], [/master|veteran|laurel/, 'laureate'], [/eye|vision|watch|sight/, 'eye'], [/fist|brawl|bruis/, 'fist']];
  const MEDAL_BY_CAT = { multi: ['double', 'triple', 'quad', 'penta', 'reaper', 'streak'], deathless: ['aegis', 'flawless', 'ghost', 'deathward'], mastery: ['laureate', 'crown', 'anvil', 'legion'], rescue: ['hand', 'lantern', 'chains', 'city'], objective: ['tower', 'colossus', 'flag', 'city'], clutch: ['comeback', 'phoenix', 'hourglass', 'lifeline'], role: ['eye', 'fist', 'star'] };
  const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  function medalMeta(id) {
    let def; try { def = typeof Sim !== 'undefined' && Sim.MEDALS && Sim.MEDALS.find(m => m.id === id); } catch (e) { }
    const key = String(id).toLowerCase(), cat = def ? def.cat : key;
    let emb = null; if (MEDAL_ART[id]) emb = MEDAL_ART[id]; else for (const [re, e] of MEDAL_RULES) if (re.test(key)) { emb = e; break; }
    const c = String(cat || '').toLowerCase(), catKey = /multi|kill|slay|combat/.test(c) ? 'multi' : /death|surviv|flawless/.test(c) ? 'deathless' : /champ|master/.test(c) ? 'mastery' : /rescue|civic|people|save/.test(c) ? 'rescue' : /obj|boss|tower|site/.test(c) ? 'objective' : /clutch|comeback/.test(c) ? 'clutch' : /role/.test(c) ? 'role' : 'mastery';
    if (!emb) { const l = MEDAL_BY_CAT[catKey]; emb = l[hashStr(key) % l.length]; }
    return { emb, dress: MEDAL_DRESS[catKey] };
  }
  // Hand-picked marks for ids whose names do not say enough. Filled from Sim.MEDALS.
  const MEDAL_ART = { hat_trick: 'triple', clean_sweep: 'quad', rampage: 'penta', body_count: 'reaper', untouchable: 'aegis', ghost_run: 'ghost', long_life: 'streak', specialist: 'anvil', repertoire: 'legion', grand_master: 'crown', shepherd: 'hand', safe_passage: 'lantern', lifeline: 'lifeline', demolition: 'tower', big_game: 'flag', colossus_slayer: 'colossus', grand_theft: 'mask', never_over: 'comeback', long_way_back: 'phoenix', last_breath: 'hourglass', warden: 'highroad', stalker: 'claws', keeper: 'anchor', steadfast: 'pillar' };
  function boxBlur(src, W, r) {
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length), n = 2 * r + 1;
    for (let y = 0; y < W; y++) { let a = 0; const o = y * W; for (let x = -r; x <= r; x++) a += src[o + Math.max(0, x)]; for (let x = 0; x < W; x++) { tmp[o + x] = a / n; a += src[o + Math.min(W - 1, x + r + 1)] - src[o + Math.max(0, x - r)]; } }
    for (let x = 0; x < W; x++) { let a = 0; for (let y = -r; y <= r; y++) a += tmp[x + Math.max(0, y) * W]; for (let y = 0; y < W; y++) { out[x + y * W] = a / n; a += tmp[x + Math.min(W - 1, y + r + 1) * W] - tmp[x + Math.max(0, y - r) * W]; } }
    return out;
  }
  function mintMaster(id, tier, W) {
    const t0 = nowMs(), U = W / 2, locked = tier < 0, T = locked ? 0 : Math.min(2, tier), meta = medalMeta(id), fine = W >= 280;
    const H = new Float32Array(W * W), Mt = new Uint8Array(W * W);
    const put = (draw, mat, h, bev, o = {}) => {
      const raw = readMask(W, U, 1, draw); if (raw.bx1 < raw.bx0) return; const m = bin(raw), D = edt(m, W, W), bv = Math.max(1, bev * U), hp = h * U, b0 = (o.base || 0) * U, ch = o.chisel, add = o.add, M = locked && mat ? IRON : mat;
      for (let y = raw.by0; y <= raw.by1; y++) for (let x = raw.bx0, i = x + y * W; x <= raw.bx1; x++, i++) if (m[i]) { const t = Math.min(1, D[i] / bv), p = t >= 1 ? 1 : ch ? t : t * (2 - t); H[i] = (add ? H[i] : b0) + hp * p; if (M) Mt[i] = M; }
    };
    const circle = r => g => { g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill(); };
    const ringD = (r0, r1) => g => { g.beginPath(); g.arc(0, 0, r1, 0, TAU); g.arc(0, 0, r0, 0, TAU, true); g.fill(); };
    const polys = (...L) => g => { for (const p of L) { g.beginPath(); p.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.closePath(); g.fill(); } };
    const around = (n, f, a0 = 0) => g => { for (let i = 0; i < n; i++) { const a = a0 + i / n * TAU, r = f(a, i, g); if (Array.isArray(r)) polys(r)(g); } };
    const dot = (x, y, r) => g => { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
    const emblem = (scale, y, matA, matB, matC, h) => {
      const A = [], B = [], C = [], X = [], L = { a: (...p) => A.push(...p), b: (...p) => B.push(...p), c: (...p) => C.push(...p), x: (...p) => X.push(...p), paint() { } };
      const fn = MEDAL_EMB[meta.emb] || EMB[meta.emb] || MEDAL_EMB.star; try { fn(L, false); } catch (e) { }
      const draw = list => g => { g.save(); g.translate(0, y); g.scale(scale, scale); for (const p of list) { if (typeof p === 'function') { g.beginPath(); p(g); g.fill(); } else if (Array.isArray(p)) { g.beginPath(); p.forEach(([a, b], i) => g[i ? 'lineTo' : 'moveTo'](a, b)); g.closePath(); g.fill(); } } g.restore(); };
      const snapH = X.length ? H.slice() : null, snapM = X.length ? Mt.slice() : null;
      if (B.length) put(draw(B), matB, h * .7, .03 * scale / .44, { add: true });
      if (A.length) put(draw(A), matA, h, .034 * scale / .44, { add: true });
      if (X.length) { const m = bin(readMask(W, U, 1, draw(X))); for (let i = 0; i < W * W; i++) if (m[i]) { H[i] = snapH[i]; Mt[i] = snapM[i]; } }
      if (C.length) put(draw(C), matC, h * 1.2, .045 * scale / .44, { add: true });
    };
    const leaves = (r, n, span, w, len, mat, base, gapBottom = .2) => {
      const ptsAll = [];
      for (const sd of [-1, 1]) for (let i = 0; i < n; i++) { const a = HALF / 2 + sd * (gapBottom + i / (n - 1) * span), a2 = a + sd * (HALF / 2 - (i % 2 ? .62 : .1)); const r1 = r + (i % 2 ? .012 : -.012), x = Math.cos(a) * r1, y = Math.sin(a) * r1, dx = Math.cos(a2), dy = Math.sin(a2), nx = -dy, ny = dx; const flip = i % 2 ? 1 : -1, off = .018 * flip; ptsAll.push([[x + nx * off, y + ny * off], [x + dx * len * .45 + nx * (w + off), y + dy * len * .45 + ny * (w + off)], [x + dx * len, y + dy * len], [x + dx * len * .45 - nx * (w - off), y + dy * len * .45 - ny * (w - off)]]); }
      put(polys(...ptsAll), mat, base, w * .9, { chisel: true, add: true });
    };
    if (T === 0) {
      // Bronze: a plain struck piece. Heavy polished rim, reeded edge, sanded field gone green in the recesses.
      put(circle(.8), BRZ, .1, .06);
      put(around(56, a => band(0, 0, .745, .81, a - .017, a + .017, 2)), BRZD, -.024, .012, { add: true });
      put(circle(.655), BRZD, .05, .012);
      put(g => { const n = fine ? 40 : 28; for (let i = 0; i < n; i++) { const a = i / n * TAU; dot(Math.cos(a) * .617, Math.sin(a) * .617, fine ? .013 : .018)(g); } }, BRZ, .03, .012, { add: true });
      emblem(.42, 0, BRZ, BRZ, BRZ, .13);
    } else if (T === 1) {
      // Silver: a stepped deco badge with an engine-turned enamel field under glass, a raised laurel and a sapphire keystone.
      put(around(16, (a, i) => { const R = i % 2 ? .9 : .97, w = i % 2 ? .13 : .1; return [[Math.cos(a) * R, Math.sin(a) * R], [Math.cos(a + w) * .78, Math.sin(a + w) * .78], [Math.cos(a - w) * .78, Math.sin(a - w) * .78]]; }, -HALF / 2), SLVD, .1, .1, { chisel: true });
      put(circle(.84), SLV, .15, .05);
      put(ringD(.585, .655), SLVD, .1, .02);
      put(ringD(.655, .79), SLVD, .13, .025);
      put(around(48, a => band(0, 0, .768, .79, a - .02, a + .02, 2)), SLV, .03, .01, { add: true });
      leaves(.68, 8, 2.16, .044, .15, SLV, .07, .16);
      put(circle(.575), ENA, .05, .006);
      put(ringD(.56, .59), SLV, .155, .012);
      put(g => { for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + HALF / 12; dot(Math.cos(a) * .625, Math.sin(a) * .625, .013)(g); } }, SLV, .025, .01, { add: true });
      emblem(.4, .01, SLV, SLVD, SAPH, .16);
      put(polys(lozenge(0, -.74, .125, .16)), SLV, .24, .03); put(polys(lozenge(0, -.74, .09, .12)), SAPH, .05, .085, { add: true, chisel: true });
    } else {
      // Gold: an order star. Two ranks of faceted rays, a jewelled black-enamel collar, a sunray enamel heart, a deco crown, rubies and a diamond.
      const ray = (a, R, r, w) => [[Math.cos(a) * R, Math.sin(a) * R], [Math.cos(a + w) * r, Math.sin(a + w) * r], [Math.cos(a - w) * r, Math.sin(a - w) * r]];
      put(around(16, a => ray(a, 1, .62, .185), HALF / 16), GLD, .13, .18, { chisel: true });
      put(around(16, a => ray(a, .91, .62, .15), HALF / 16 + TAU / 32), ROSE, .2, .14, { chisel: true });
      put(circle(.76), GLD, .2, .03);
      put(g => { const n = fine ? 72 : 44; for (let i = 0; i < n; i++) { const a = i / n * TAU; dot(Math.cos(a) * .745, Math.sin(a) * .745, fine ? .016 : .022)(g); } }, GLD, .05, .016, { add: true });
      put(ringD(.585, .715), ENB, .15, .006);
      leaves(.6, 9, 2.25, .05, .17, GLD, .1, .13);
      put(g => { for (const a of [-HALF / 2 + 1.05, -HALF / 2 - 1.05, -HALF / 2 + 2.1, -HALF / 2 - 2.1]) dot(Math.cos(a) * .65, Math.sin(a) * .65, .05)(g); }, GLD, .13, .012, { base: .16 });
      put(g => { for (const a of [-HALF / 2 + 1.05, -HALF / 2 - 1.05, -HALF / 2 + 2.1, -HALF / 2 - 2.1]) dot(Math.cos(a) * .65, Math.sin(a) * .65, .04)(g); }, RUBY, .05, .042, { add: true });
      put(ringD(.555, .6), GLD, .235, .016);
      put(circle(.565), ENA, .06, .006);
      emblem(.42, .02, GLD, ROSE, DIAM, .2);
      const cw = .3, cy = -.83;
      put(polys([[-cw * 1.04, cy + .14], [-cw * 1.28, cy - .17], [-cw * .55, cy - .02], [0, cy - .165], [cw * .55, cy - .02], [cw * 1.28, cy - .17], [cw * 1.04, cy + .14]], rr(0, cy + .17, cw * 1.08, .045)), GLD, .34, .04, { chisel: true });
      put(polys(lozenge(0, cy + .02, .056, .07)), DIAM, .045, .06, { add: true, chisel: true }); put(g => { dot(-cw * .72, cy + .05, .03)(g); dot(cw * .72, cy + .05, .03)(g); }, RUBY, .035, .03, { add: true });
    }
    // A shallow dish so flat plates still read a gradient, then shade.
    for (let y = 0, i = 0; y < W; y++) for (let x = 0; x < W; x++, i++) if (Mt[i]) { const u = (x + .5) / U - 1, v = (y + .5) / U - 1; H[i] += (1 - u * u - v * v) * U * .05; }
    const c = cv(W, W), g = c.getContext('2d'), img = g.createImageData(W, W), d = img.data, MCv = matcap(), N = MCN, blurH = boxBlur(H, W, Math.max(2, Math.round(W * .018))), SH = Math.max(1, W / 360);
    const dr = meta.dress, ramps = MINT_MAT.map(m => m && m.r ? MINT_RAMP[m.r]() : null), E = [[rgbF(dr[0]), rgbF(dr[1])], [rgbF(dr[2]), rgbF(dr[3])]];
    if (locked) for (let k = 0; k < 2; k++) for (let j = 0; j < 2; j++) { const v = (E[k][j][0] + E[k][j][1] + E[k][j][2]) / 3 * .4; E[k][j] = [v, v * 1.02, v * 1.12]; }
    for (let y = 1; y < W - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = x + y * W, m = Mt[i]; if (!m) continue;
      let nx = (H[i - 1] - H[i + 1]) * .5, ny = (H[i - W] - H[i + W]) * .5; const l = 1 / Math.sqrt(1 + nx * nx + ny * ny); nx *= l; ny *= l; const nz = l;
      const mp = MINT_MAT[m], u = (x + .5) / U - 1, v = (y + .5) / U - 1, r = Math.sqrt(u * u + v * v), a = Math.atan2(v, u), cav = blurH[i] - H[i], ao = Math.max(.34, Math.min(1, 1 - cav / U / (T === 0 ? .05 : .08))), ix = Math.min(N - 1, ((nx * .5 + .5) * N) | 0), iy = Math.min(N - 1, ((ny * .5 + .5) * N) | 0);
      let Lv = MCv[ix + iy * N], R, G, B;
      if (mp.e !== undefined) {
        const e = E[mp.e], p = mp.e ? .3 + .25 * (Math.sin(a * 72) > .2 ? 1 : 0) : (T === 2 ? Math.pow(Math.abs(Math.sin(a * 16 + HALF / 32 * 8)), .7) * .75 + .25 * (Math.sin(r * 90) * .5 + .5) : .32 + .36 * (.5 + .5 * Math.sin(a * 44 + 4.2 * Math.sin(r * 42)))), vign = 1.05 - r * (mp.e ? 0 : .7);
        const mixV = i => (e[0][i] + (e[1][i] - e[0][i]) * p) * vign;
        const gl = .34 * Math.exp(-Math.pow((u * .62 + v * .78 + .3) / .04, 2)) + .3 * Math.exp(-Math.pow((u * .62 + v * .78 + .42) / .012, 2)) + Math.max(0, -v - u * .4) * .16 + Math.max(0, Lv - 1.6) * .3;
        R = mixV(0) * ao + gl * .9; G = mixV(1) * ao + gl * .93; B = mixV(2) * ao + gl;
      } else {
        const flat = nz > .985 ? 1 : 0, fan = mp.brush && flat ? Math.pow(Math.abs(Math.cos(2 * (a - .9))), 10) : 0;
        if (flat && mp.brush) { const ring = Math.sin(r * W * .9 + Math.sin(a * 5) * 3) * .5 + .5; Lv += (ring - .5) * .05 * mp.brush; }
        if (mp.grain) { const nn = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; Lv += (nn - Math.floor(nn) - .5) * mp.grain * 2; }
        Lv += mp.gem ? .55 + 1.1 * Math.max(0, nx * .5 + ny * .7) : .22 + 1.5 * Math.max(0, -nx * .62 - ny * .78) + (u * -.1 + v * -.2);
        Lv = (Lv + fan * mp.brush * 1.5) * ao * mp.g * (mp.gem ? 1 : 1);
        const t = 1 - Math.exp(-Lv * .92), k = Math.min(255, Math.max(0, (t * 272) | 0)) * 3, rp = ramps[m]; R = rp[k] / 255; G = rp[k + 1] / 255; B = rp[k + 2] / 255;
        if (mp.patina && !locked) { const pat = Math.min(.75, Math.max(0, cav / U * 22 + (Math.sin(a * 7 + r * 11) * .5 + .5) * .08)); R += (.2 - R) * pat; G += (.46 - G) * pat; B += (.4 - B) * pat; }
      }
      const j = i * 4; d[j] = Math.min(255, R * 255); d[j + 1] = Math.min(255, G * 255); d[j + 2] = Math.min(255, B * 255); d[j + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    STAT_MEDAL.ms += nowMs() - t0; STAT_MEDAL.n++; c.ms = nowMs() - t0;
    return c;
  }
  const STAT_MEDAL = { n: 0, ms: 0 };
  // A small LRU by bytes: phones get no more than ~40 MB of medal pixels.
  const MEDAL_CACHE = new Map(); let medalBytes = 0;
  const MEDAL_MAX = 40 << 20;
  function mcGet(k) { const v = MEDAL_CACHE.get(k); if (v) { MEDAL_CACHE.delete(k); MEDAL_CACHE.set(k, v); } return v; }
  function mcPut(k, v) { MEDAL_CACHE.set(k, v); medalBytes += v.width * v.height * 4; for (const [o, c] of MEDAL_CACHE) { if (medalBytes <= MEDAL_MAX) break; if (o === k) continue; MEDAL_CACHE.delete(o); medalBytes -= c.width * c.height * 4; } return v; }
  const medalDpr = () => Math.min(2, typeof devicePixelRatio === 'number' && devicePixelRatio ? devicePixelRatio : 1);
  const masterW = px => px <= 120 ? 240 : px <= 260 ? 400 : 640;
  const masterOf = (id, t, W) => { const k = `m|${id}|${t}|${W}`; return mcGet(k) || mcPut(k, mintMaster(id, t, W)); };
  function medalStar(g, x, y, r, a = 1, col = '255,244,214') { g.save(); g.translate(x, y); g.globalAlpha = a; g.globalCompositeOperation = 'lighter'; const q = g.createRadialGradient(0, 0, 0, 0, 0, r * .55); q.addColorStop(0, `rgba(${col},.95)`); q.addColorStop(1, `rgba(${col},0)`); g.fillStyle = q; g.beginPath(); g.arc(0, 0, r * .55, 0, TAU); g.fill(); g.fillStyle = `rgba(${col},.95)`; for (let i = 0; i < 4; i++) { g.rotate(HALF / 2); g.beginPath(); g.moveTo(0, -r); g.lineTo(r * .07, 0); g.lineTo(0, r); g.lineTo(-r * .07, 0); g.closePath(); g.fill(); } g.restore(); }
  // Where the light catches, per tier. Unit coordinates.
  const MEDAL_GLINTS = [[], [[-.4, -.62, .15]], [[-.5, -.66, .26], [.68, -.42, .14], [-.2, .78, .1]]];
  function medalPaint(g, m, W, T, lit) {
    g.save(); g.translate(W / 2, W / 2); const U = W / 2;
    if (T === 2) {
      let q = g.createRadialGradient(0, 0, U * .4, 0, 0, U); q.addColorStop(0, 'rgba(255,200,92,.62)'); q.addColorStop(.62, 'rgba(255,160,52,.22)'); q.addColorStop(1, 'rgba(255,140,40,0)'); g.fillStyle = q; g.fillRect(-U, -U, W, W);
    } else if (T === 1) { const q = g.createRadialGradient(0, 0, U * .55, 0, 0, U); q.addColorStop(0, 'rgba(176,206,250,.3)'); q.addColorStop(1, 'rgba(176,206,250,0)'); g.fillStyle = q; g.fillRect(-U, -U, W, W); }
    g.restore();
    g.save(); g.shadowColor = 'rgba(0,0,0,.65)'; g.shadowBlur = U * .05; g.shadowOffsetY = U * .03; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(m, 0, 0, W, W); g.restore();
    if (lit && T > 0) for (const [x, y, r] of MEDAL_GLINTS[T]) medalStar(g, W / 2 + x * U, W / 2 + y * U, r * U, T === 2 ? 1 : .8, T === 2 ? '255,244,214' : '226,238,255');
  }
  function medal(id, tier, R = 48) {
    const t = tierOf(tier), px = Math.max(8, Math.ceil(R * 2 * medalDpr())), k = `c|${id}|${t}|${px}`; let c = mcGet(k); if (c) return c;
    c = cv(px, px); const g = c.getContext('2d'); medalPaint(g, masterOf(id, t, masterW(px)), px, t, true);
    c.style.width = c.style.height = (R * 2) + 'px'; c.R = R; return mcPut(k, c);
  }
  // For long lists: runs one bake per slice, then paints a target canvas or img (or calls back with the medal). Cached medals are immediate.
  const MEDAL_Q = []; let medalQOn = false;
  function medalPump() { const j = MEDAL_Q.shift(); if (!j) { medalQOn = false; return; } j(); setTimeout(medalPump, 16); }
  function medalReady(id, tier, R, cb) { const px = Math.ceil(R * 2 * medalDpr()), k = `c|${id}|${tierOf(tier)}|${px}`; const hit = mcGet(k); if (hit) { cb(hit); return; } MEDAL_Q.push(() => cb(medal(id, tier, R))); if (!medalQOn) { medalQOn = true; setTimeout(medalPump, 0); } }
  function medalInto(el, id, tier, R) { el.dataset.medal = `${id}|${tier}`; medalReady(id, tier, R, c => { if (el.dataset.medal !== `${id}|${tier}`) return; if (el.getContext) { el.width = c.width; el.height = c.height; el.getContext('2d').drawImage(c, 0, 0); } else el.src = c.toDataURL(); }); }
  // Live draw for the moment a medal is won: the cached medal, a sweeping light across it, and for Gold a turning halo and twinkling stars. time in seconds.
  function medalDraw(ctx, id, tier, x, y, R, time = 0) {
    const t = Math.max(0, tierOf(tier)), c = medal(id, tier, R), sweep = ((time * .32) % 1) * 3.2 - 1.1;
    if (t === 2) { const gl = glow('#ffc860'); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(x, y); ctx.rotate(time * .22); ctx.globalAlpha = .34 + .1 * Math.sin(time * 2.4); const B = R * 1.32; for (let i = 0; i < 8; i++) { ctx.rotate(TAU / 8); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(-.1) * B, Math.sin(-.1) * B); ctx.lineTo(Math.cos(.1) * B, Math.sin(.1) * B); ctx.closePath(); const q = ctx.createRadialGradient(0, 0, R * .5, 0, 0, B); q.addColorStop(0, 'rgba(255,220,140,.5)'); q.addColorStop(1, 'rgba(255,220,140,0)'); ctx.fillStyle = q; ctx.fill(); } ctx.restore(); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .35; ctx.drawImage(gl, x - R * 1.5, y - R * 1.5, R * 3, R * 3); ctx.restore(); }
    ctx.drawImage(c, x - R, y - R, R * 2, R * 2);
    if (t > 0) { ctx.save(); ctx.beginPath(); ctx.arc(x, y, R * (t === 2 ? .76 : .84), 0, TAU); ctx.clip(); ctx.globalCompositeOperation = 'lighter'; const X = x + sweep * R, q = ctx.createLinearGradient(X - R * .3, y - R, X + R * .3, y + R); q.addColorStop(0, 'rgba(255,255,255,0)'); q.addColorStop(.5, t === 2 ? 'rgba(255,240,200,.5)' : 'rgba(225,238,255,.36)'); q.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = q; ctx.fillRect(x - R, y - R, R * 2, R * 2); ctx.restore(); }
    if (t === 2) MEDAL_GLINTS[2].forEach(([u, v, r], i) => { const a = Math.pow(Math.max(0, Math.sin(time * 2 + i * 1.7)), 5); if (a > .02) medalStar(ctx, x + u * R, y + v * R, r * R * 1.5, a); });
  }
  const medalURL = (id, tier, R = 48) => { const c = medal(id, tier, R); return c.url || (c.url = c.toDataURL()); };
  // ---------- end medals ----------

  // ---------- 11.0 cards, comics, palette, presentation ----------
  const DISP = '"Big Shoulders Display","Arial Narrow","Avenir Next Condensed","Roboto Condensed","DejaVu Sans Condensed",Impact,sans-serif', UI_F = '"Barlow Semi Condensed","Arial Narrow","Roboto Condensed","DejaVu Sans Condensed",system-ui,sans-serif';
  const fontD = (px, w = 800) => `${w} ${px}px ${DISP}`, fontU = (px, w = 600) => `${w} ${px}px ${UI_F}`;
  const GOLDL = '#e6d29a', GOLDM = '#b89c5e', PAPER = '#e9edf4', MUTE = '#94a1b5';
  const lazyCanvas = (k, make) => mcGet(k) || mcPut(k, make());
  function fitText(g, s, maxW, px, f = fontD) { let p = px; g.font = f(p); while (p > 8 && g.measureText(s).width > maxW) { p -= 1; g.font = f(p); } return p; }
  function wrapLines(g, s, maxW) { const out = []; let l = ''; for (const w of String(s).split(/\s+/)) { const t = l ? l + ' ' + w : w; if (g.measureText(t).width > maxW && l) { out.push(l); l = w; } else l = t; } if (l) out.push(l); return out; }

  // Card and banner grounds: flat deco drawing, no bake, cached per size.
  const CARD_STYLE = {
    plate(g, w, h, p) { const q = g.createLinearGradient(0, 0, w, h); q.addColorStop(0, p[1]); q.addColorStop(1, p[0]); g.fillStyle = q; g.fillRect(0, 0, w, h); g.strokeStyle = p[2]; g.globalAlpha = .16; g.lineWidth = 1; for (let i = -h; i < w; i += h / 7) { g.beginPath(); g.moveTo(i, h); g.lineTo(i + h, 0); g.stroke(); } g.globalAlpha = 1; },
    sunburst(g, w, h, p) { CARD_STYLE.base(g, w, h, p); const cx = w / 2, cy = h * 1.06, R = Math.hypot(w, h) * 1.1; for (let i = 0; i < 26; i++) { if (i % 2) continue; const a0 = Math.PI + i / 26 * Math.PI, a1 = Math.PI + (i + 1) / 26 * Math.PI; g.fillStyle = p[1]; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R); g.lineTo(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R); g.closePath(); g.fill(); } g.strokeStyle = p[2]; g.lineWidth = Math.max(1, h * .012); for (const r of [.3, .46, .62]) { g.beginPath(); g.arc(cx, cy, h * r * 1.5, Math.PI, TAU); g.stroke(); } g.fillStyle = p[2]; g.beginPath(); g.arc(cx, cy, h * .3, Math.PI, TAU); g.fill(); },
    chevron(g, w, h, p) { CARD_STYLE.base(g, w, h, p); const s = h * .34; for (let i = -1, c = 0; i * s < w + h; i++, c++) { g.fillStyle = c % 3 === 0 ? p[2] : p[1]; g.globalAlpha = c % 3 === 0 ? .85 : .6; const x = i * s - h * .3, t = c % 3 === 0 ? s * .16 : s * .5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + t, 0); g.lineTo(x + t + h * .5, h / 2); g.lineTo(x + t, h); g.lineTo(x, h); g.lineTo(x + h * .5, h / 2); g.closePath(); g.fill(); } g.globalAlpha = 1; },
    skyline(g, w, h, p, r) { CARD_STYLE.base(g, w, h, p); for (let i = 0; i < 3; i++) { const q = g.createLinearGradient(0, 0, 0, h); q.addColorStop(0, p[2] + '40'); q.addColorStop(1, p[2] + '00'); g.fillStyle = q; const x = w * (.18 + i * .32); g.beginPath(); g.moveTo(x - h * .05, h); g.lineTo(x - h * .55 + i * h * .5, 0); g.lineTo(x - h * .25 + i * h * .5, 0); g.lineTo(x + h * .05, h); g.closePath(); g.fill(); } for (let lay = 0; lay < 2; lay++) { g.fillStyle = lay ? p[0] : p[1]; let x = -8; while (x < w + 8) { const bw = h * (.08 + r() * .14), bh = h * (lay ? .16 + r() * .36 : .36 + r() * .46), by = h - bh; g.beginPath(); g.moveTo(x, h); g.lineTo(x, by + bw * .4); g.lineTo(x + bw * .25, by + bw * .4); g.lineTo(x + bw * .25, by + bw * .15); g.lineTo(x + bw * .42, by + bw * .15); g.lineTo(x + bw / 2, by - bw * .7); g.lineTo(x + bw * .58, by + bw * .15); g.lineTo(x + bw * .75, by + bw * .15); g.lineTo(x + bw * .75, by + bw * .4); g.lineTo(x + bw, by + bw * .4); g.lineTo(x + bw, h); g.closePath(); g.fill(); x += bw + h * .012; } } },
    fan(g, w, h, p) { CARD_STYLE.base(g, w, h, p); const s = h * .42; g.lineWidth = Math.max(1, h * .012); for (let row = 0, y = -s * .1; y < h + s; row++, y += s * .5) for (let x = (row % 2 ? s / 2 : 0) - s; x < w + s; x += s) { g.fillStyle = row % 2 ? p[1] : p[0]; g.strokeStyle = p[2]; g.beginPath(); g.arc(x, y, s / 2, Math.PI, TAU); g.lineTo(x + s / 2, y); g.closePath(); g.fill(); g.stroke(); for (let i = 1; i < 4; i++) { g.beginPath(); g.arc(x, y, s / 2 * (1 - i / 4), Math.PI, TAU); g.globalAlpha = .55; g.stroke(); g.globalAlpha = 1; } } },
    mint(g, w, h, p) { CARD_STYLE.base(g, w, h, p); const s = h * .4; g.lineWidth = Math.max(1, h * .014); let row = 0; for (let y = 0; y < h + s; y += s * .86, row++) for (let x = row % 2 ? s / 2 : 0; x < w + s; x += s) { g.strokeStyle = p[1]; g.beginPath(); g.arc(x, y, s * .46, 0, TAU); g.stroke(); g.strokeStyle = p[2]; g.globalAlpha = .55; g.beginPath(); g.arc(x, y, s * .32, 0, TAU); g.stroke(); g.globalAlpha = 1; g.fillStyle = p[2]; g.save(); g.translate(x, y); g.rotate(HALF / 4); g.fillRect(-s * .08, -s * .08, s * .16, s * .16); g.restore(); } },
    stripes(g, w, h, p) { CARD_STYLE.base(g, w, h, p); g.save(); g.transform(1, 0, -.6, 1, h * .6, 0); [[.08, .34, p[1]], [.42, .06, p[2]], [.54, .12, p[1]], [.72, .03, p[2]]].forEach(([x, wd, c]) => { g.fillStyle = c; g.fillRect(x * w, 0, wd * w, h); }); g.restore(); },
    storm(g, w, h, p, r) { CARD_STYLE.base(g, w, h, p); g.fillStyle = p[1]; for (let i = 0; i < 7; i++) { g.beginPath(); g.ellipse(r() * w, r() * h * .3, h * (.3 + r() * .4), h * (.1 + r() * .1), 0, 0, TAU); g.fill(); } for (let k = 0; k < 3; k++) { let x = w * (.2 + k * .3), y = 0; g.strokeStyle = p[2]; g.lineWidth = Math.max(1.5, h * (.03 - k * .006)); g.lineJoin = 'miter'; g.beginPath(); g.moveTo(x, y); while (y < h) { y += h * (.12 + r() * .14); x += (r() - .5) * h * .4; g.lineTo(x, y); } g.stroke(); } },
    tide(g, w, h, p) { CARD_STYLE.base(g, w, h, p); for (let i = 0; i < 6; i++) { const y = h * (.25 + i * .15), a = h * .07, l = h * .55; g.fillStyle = i % 2 ? p[1] : p[0]; g.strokeStyle = p[2]; g.lineWidth = Math.max(1, h * .012); g.beginPath(); g.moveTo(-l, h); g.lineTo(-l, y); for (let x = -l + (i % 2 ? l / 2 : 0); x < w + l; x += l) g.quadraticCurveTo(x + l / 4, y - a * 2, x + l / 2, y), g.quadraticCurveTo(x + l * .75, y + a * 2, x + l, y); g.lineTo(w + l, h); g.closePath(); g.fill(); g.stroke(); } },
    crown(g, w, h, p) { CARD_STYLE.sunburst(g, w, h, p); const k = h * .5, cx = w / 2, y = h * .62; g.fillStyle = p[3] || p[2]; g.beginPath(); [[-.9, .4], [-1.05, -.45], [-.5, -.05], [0, -.8], [.5, -.05], [1.05, -.45], [.9, .4]].forEach(([a, b], i) => g[i ? 'lineTo' : 'moveTo'](cx + a * k, y + b * k)); g.closePath(); g.fill(); g.fillRect(cx - k * .92, y + k * .5, k * 1.84, k * .16); },
    laurel(g, w, h, p) { CARD_STYLE.base(g, w, h, p); const cx = w / 2, cy = h * .56, R = h * .36; g.fillStyle = p[2]; for (const sd of [-1, 1]) for (let i = 0; i < 9; i++) { const a = HALF / 2 + sd * (.3 + i * .28), x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R; g.save(); g.translate(x, y); g.rotate(a + sd * 1.1); g.beginPath(); g.ellipse(0, 0, h * .075, h * .027, 0, 0, TAU); g.fill(); g.restore(); } g.strokeStyle = p[1]; g.lineWidth = Math.max(1, h * .01); g.beginPath(); g.moveTo(0, h * .9); g.lineTo(w, h * .9); g.moveTo(0, h * .1); g.lineTo(w, h * .1); g.stroke(); },
    base(g, w, h, p) { g.fillStyle = p[0]; g.fillRect(0, 0, w, h); },
  };
  // id, name, kind, style, [ground, shape, line, extra]; cost = Marks to buy, earn = what the career must show.
  // earn is one of { medals:n } any tier, { silvers:n }, { golds:n } counted at that tier or better, { mastery:tier } on any champion, { wins:n }.
  const CARDS = [
    ['graphite', 'Graphite', 'card', 'plate', ['#0d0f15', '#1d212c', '#39414f'], 0],
    ['nightfall', 'Nightfall', 'card', 'sunburst', ['#0a1630', '#10264c', '#e6d29a'], 250], ['bloodline', 'Bloodline', 'card', 'chevron', ['#16070c', '#5e0f1e', '#ec3a52'], 250],
    ['avenue', 'Avenue', 'card', 'skyline', ['#080b14', '#182440', '#ffd98a'], 400], ['seashell', 'Seashell', 'card', 'fan', ['#06201f', '#0c3a38', '#6fdcc4'], 400],
    ['die_cut', 'Die Cut', 'card', 'mint', ['#101014', '#3d3a36', '#d9ab55'], 600], ['stormfront', 'Stormfront', 'card', 'storm', ['#0b0e1c', '#1e2540', '#a9d8ff'], 750], ['undertow', 'Undertow', 'card', 'tide', ['#04121f', '#0a2a44', '#7fdcff'], 750],
    ['struck', 'Struck in Bronze', 'card', 'mint', ['#170d07', '#5a3218', '#d99a5e'], { medals: 8 }, 'Earn 8 medals of any tier.'],
    ['sterling', 'Sterling', 'card', 'fan', ['#0d121c', '#2a3346', '#dde6f2'], { silvers: 8 }, 'Earn 8 Silver medals.'],
    ['sovereign', 'Sovereign', 'card', 'crown', ['#120a02', '#3e2406', '#ffcf62', '#fff0ac'], { golds: 6 }, 'Earn 6 Gold medals.'],
    ['apex', 'The Apex', 'card', 'crown', ['#0a0612', '#1e1438', '#ffd98a', '#ffffff'], { golds: 16 }, 'Earn 16 Gold medals.'],
    ['bar_plain', 'Plain Bar', 'banner', 'plate', ['#0f1218', '#1d212c', '#39414f'], 0],
    ['bar_chevron', 'Marching Chevron', 'banner', 'chevron', ['#0a1630', '#14305e', '#e6d29a'], 200], ['bar_skyline', 'Skyline', 'banner', 'skyline', ['#090c16', '#1a2640', '#ffd98a'], 300], ['bar_rush', 'Rush', 'banner', 'stripes', ['#14060a', '#7e1426', '#ff6a80'], 300],
    ['bar_tide', 'Rising Tide', 'banner', 'tide', ['#04121f', '#0a2a44', '#7fdcff'], 450], ['bar_shell', 'Shell Court', 'banner', 'fan', ['#120d08', '#3a2a18', '#e6c98a'], 450],
    ['bar_laurel', 'Laurel', 'banner', 'laurel', ['#0d1018', '#34405a', '#dde6f2'], { silvers: 4 }, 'Earn 4 Silver medals.'], ['bar_master', 'Master of the Mint', 'banner', 'mint', ['#100b04', '#4e3410', '#ffcf62'], { mastery: 5 }, 'Reach top mastery with any champion.'],
    ['bar_crown', 'Crowned', 'banner', 'crown', ['#120a02', '#3e2406', '#ffcf62', '#fff0ac'], { golds: 3 }, 'Earn 3 Gold medals.'],
  ].map(([id, name, kind, style, pal, price, d]) => ({ id, name, kind, style, pal, cost: typeof price === 'number' ? price : undefined, earn: typeof price === 'object' ? price : undefined, d: d || (price ? `${price} Marks` : 'Starter') }));
  function cardArt(id, w = 340, h = 150) {
    return lazyCanvas(`card|${id}|${w}|${h}`, () => {
      const def = CARDS.find(c => c.id === id) || CARDS[0], c = cv(w, h), g = c.getContext('2d'), r = seeded(hashStr(def.id) % 2147483646 + 1);
      CARD_STYLE[def.style](g, w, h, def.pal, r);
      const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, 'rgba(4,5,9,.08)'); v.addColorStop(1, 'rgba(4,5,9,.55)'); g.fillStyle = v; g.fillRect(0, 0, w, h);
      g.strokeStyle = def.pal[2]; g.globalAlpha = .75; g.lineWidth = Math.max(1, h * .012); g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth); g.globalAlpha = 1;
      return c;
    });
  }
  function drawSealDisc(g, kit, x, y, r, col, ring) { if (!EMB[kit]) kit = 'vesper'; g.save(); g.fillStyle = INK; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.strokeStyle = ring || col; g.lineWidth = Math.max(1.5, r * .07); g.beginPath(); g.arc(x, y, r - g.lineWidth / 2, 0, TAU); g.stroke(); const S = Math.min(384, Math.ceil(r * 3)); g.drawImage(seal(kit, col, S), x - r * .92, y - r * .92, r * 1.84, r * 1.84); g.restore(); }
  // The player card: name, title, banner, champion and up to three pinned medals. o: { name, title, card, banner, champ, medals:[{id,tier}], stats:[[label,value],...] }
  function playerCard(o = {}, W = 360) {
    const dpr = medalDpr(), w = W * dpr, h = Math.round(W * .54) * dpr, c = cv(w, h), g = c.getContext('2d'); g.scale(dpr, dpr); const H = h / dpr;
    g.drawImage(cardArt(o.card || 'graphite', w, h), 0, 0, W, H);
    const bH = H * .36; g.drawImage(cardArt(o.banner || 'bar_plain', Math.round(W * dpr), Math.round(bH * dpr)), 0, 0, W, bH);
    const R = H * .28, cx = R + W * .04, cy = H * .54; drawSealDisc(g, o.champ, cx, cy, R, GOLDL);
    const tx = cx + R + W * .03; g.fillStyle = PAPER; g.textBaseline = 'alphabetic'; fitText(g, (o.name || 'Player').toUpperCase(), W - tx - W * .03, H * .15); g.shadowColor = 'rgba(0,0,0,.85)'; g.shadowBlur = 5; g.fillText((o.name || 'Player').toUpperCase(), tx, H * .19); g.shadowBlur = 0;
    g.fillStyle = GOLDL; fitText(g, o.title || '', W - tx - W * .03, H * .095, fontU); g.fillText(o.title || '', tx, H * .31); g.shadowBlur = 0;
    const m = (o.medals || []).slice(0, 3), mr = H * .15; m.forEach((e, i) => { const ms = medal(e.id, e.tier, mr); g.drawImage(ms, tx + i * mr * 2.08, H * .4, mr * 2, mr * 2); });
    (o.stats || []).slice(0, 4).forEach(([l, v], i) => { const x = tx + i * (W - tx - W * .02) / Math.min(4, (o.stats || []).length); g.fillStyle = PAPER; g.font = fontD(H * .105); g.fillText(String(v), x, H * .86); g.fillStyle = MUTE; g.font = fontU(H * .06); g.fillText(String(l).toUpperCase(), x, H * .94); });
    c.style.width = W + 'px'; c.style.height = H + 'px'; return c;
  }
  // The share image, 1200 wide. o: { name, title, card, banner, champ, result, line, k, d, a, medals:[{id,tier}], marks, tags:['MVP',...], mode }
  function shareCard(o = {}, W = 1200) {
    const H = Math.round(W * .525), c = cv(W, H), g = c.getContext('2d'), u = W / 1200, win = /vict|win/i.test(o.result || '');
    g.drawImage(cardArt(o.card || 'nightfall', W, H), 0, 0);
    const sh = g.createLinearGradient(0, 0, W, 0); sh.addColorStop(0, 'rgba(5,6,10,.9)'); sh.addColorStop(.62, 'rgba(5,6,10,.7)'); sh.addColorStop(1, 'rgba(5,6,10,.35)'); g.fillStyle = sh; g.fillRect(0, 0, W, H);
    g.drawImage(cardArt(o.banner || 'bar_chevron', W, Math.round(26 * u)), 0, H - 26 * u);
    drawSealDisc(g, o.champ, 168 * u, 200 * u, 124 * u, win ? '#ffd98a' : '#c9d2de', win ? '#ffd98a' : '#8fa5c2');
    g.fillStyle = win ? '#ffd98a' : '#c9d2de'; const res = (o.result || 'Match complete').toUpperCase(); fitText(g, res, 760 * u, 118 * u); g.fillText(res, 332 * u, 158 * u);
    g.fillStyle = PAPER; fitText(g, o.name || 'Player', 560 * u, 54 * u); g.fillText(o.name || 'Player', 332 * u, 222 * u);
    g.fillStyle = GOLDM; g.font = fontU(30 * u); g.fillText(o.title || o.line || '', 332 * u, 264 * u);
    if (o.k !== undefined) { g.fillStyle = PAPER; g.font = fontD(70 * u); g.fillText(`${o.k} / ${o.d} / ${o.a}`, 332 * u, 356 * u); }
    (o.tags || []).slice(0, 3).forEach((t, i) => { const x = 332 * u + i * 186 * u, y = 390 * u; g.fillStyle = i ? 'rgba(230,210,154,.16)' : '#e6d29a'; g.fillRect(x, y, 174 * u, 56 * u); g.fillStyle = i ? GOLDL : INK; fitText(g, t.toUpperCase(), 150 * u, 34 * u); g.fillText(t.toUpperCase(), x + 12 * u, y + 41 * u); });
    (o.medals || []).slice(0, 4).forEach((e, i) => g.drawImage(medal(e.id, e.tier, 56), 880 * u + (i % 2) * 150 * u, 60 * u + (i >> 1) * 150 * u, 140 * u, 140 * u));
    if (o.marks) { g.fillStyle = GOLDL; g.font = fontD(46 * u); g.textAlign = 'right'; g.fillText(`+${o.marks} MARKS`, W - 42 * u, H - 62 * u); g.textAlign = 'left'; }
    g.fillStyle = MUTE; g.font = fontU(22 * u); g.fillText(`FLIPSIDE${o.mode ? '  /  ' + String(o.mode).toUpperCase() : ''}`, 42 * u, H - 54 * u);
    return c;
  }

  // ---------- origin comics: three panels per champion, flat ink and one accent ----------
  const ORIGINS = {
    vesper: [['rooftop', 'wide', 'From the clock tower Longshot counted the streetlights. Each night, fewer came back on.'], ['alley', 'mid', 'She learned why: the Kingpin was buying the dark, one block at a time.'], ['rooftop', 'close', 'So she took a long rifle and a longer view. Nobody buys the dark on her street.']],
    kade: [['stage', 'mid', 'Captain Riposte was a fencing-hall joke: all flourish, no blood.'], ['alley', 'wide', 'Then six men came for the hall’s takings, and every one of them lunged first.'], ['stage', 'close', 'He still bows. The bow is now a warning.']],
    ione: [['nave', 'wide', 'Starling catalogued the sealed archive under the old cathedral. One book read her back.'], ['storm', 'mid', 'It left a mark on her that would pass to anything she touched.'], ['nave', 'close', 'She has since learned which things to touch, and when to let the mark break.']],
    solenne: [['ward', 'wide', 'In the blackout winter, Dawnbringer ran the only lit ward in the Lower Mint.'], ['ward', 'mid', 'She ran out of medicine in a week. She did not run out of patients.'], ['nave', 'close', 'What she found instead has to be aimed. She has never once been allowed to miss.']],
    sable: [['alley', 'mid', 'Nightfall took messages for whoever paid. Then a message named her sister.'], ['rooftop', 'wide', 'She delivered the reply in person, to all eleven addresses.'], ['alley', 'close', 'The Heroes offered her a badge. She took the work and left the badge.']],
    gravel: [['foundry', 'wide', 'Bulwark hauled ingots at the Great Press for thirty years, hook in hand.'], ['foundry', 'mid', 'When the Press came down, he held the gantry until the last shift got out.'], ['rooftop', 'close', 'They say his back never straightened. His hook never needed it to.']],
    deadbolt: [['alley', 'wide', 'Deadbolt fitted locks for people who were afraid. The pay was excellent.'], ['ward', 'mid', 'He noticed fear pays better when you sell it twice.'], ['alley', 'close', 'Now the wire goes up first. The bill comes after.']],
    duelist: [['stage', 'wide', 'The Duelist fought for the amusement of the Villains’ private clubs.'], ['stage', 'mid', 'Ninety-nine salutes. Ninety-nine bodies. The audience asked for more.'], ['alley', 'close', 'He stopped wondering who he was fighting for. Only how well.']],
    hex: [['nave', 'mid', 'Hex was a clerk of debts, and she wrote very neatly.'], ['storm', 'wide', 'One ledger was written in something that was not ink. It balanced anyway.'], ['nave', 'close', 'Every curse is an entry. She collects with interest.']],
    plague: [['ward', 'wide', 'He kept the charity ward clean. He kept excellent notes on who stayed sick.'], ['ward', 'mid', 'A patient who pays forever is better than one who gets well.'], ['alley', 'close', 'The mask is not to keep it out. It is so you cannot see him smile.']],
    shiv: [['alley', 'wide', 'Nobody on Cutter’s Row ever remembered the girl who swept the steps.'], ['alley', 'mid', 'She remembered all of them, and everything they said in front of her.'], ['rooftop', 'close', 'If you see her now, it is because she wants the last thing you see to be a warning for someone else.']],
    ironjaw: [['foundry', 'mid', 'The company fighter took a punch for a living. Then a press took his jaw.'], ['foundry', 'wide', 'They rebuilt it out of what was on the floor, and billed him for the iron.'], ['stage', 'close', 'He has been paying them back since. Every hit he takes goes on the account.']],
    voltaic: [['storm', 'wide', 'A courier on the night run, racing the storm over Ampere Bridge.'], ['storm', 'mid', 'The storm won. Then it found it could not keep up with her.'], ['rooftop', 'close', 'She delivers everywhere now. Usually before the thunder.']],
    tidecaller: [['harbor', 'wide', 'When the seawall failed, the harbormaster’s daughter stayed to ring the bell.'], ['harbor', 'mid', 'The water took the bell. It gave her back with a question.'], ['harbor', 'close', 'She answers for it now. The tide keeps its appointments.']],
    paragon: [['rooftop', 'mid', 'The city’s first hero fell out of favour long before he fell out of the sky.'], ['storm', 'wide', 'He got up from the crater with the street watching and nothing to say.'], ['rooftop', 'close', 'He doesn’t give speeches now. He gives very short notice.']],
    mirage: [['stage', 'wide', 'A sideshow marksman who never once showed the crowd her real hand.'], ['stage', 'mid', 'When the show folded, her reflections did not. They had grown accustomed to the work.'], ['alley', 'close', 'Aim wherever you like. She has already moved, several times.']],
    cinder: [['foundry', 'wide', 'Cinder was cold every day of her childhood in the Soot Quarter.'], ['foundry', 'mid', 'The furnace that killed the shift only warmed her up.'], ['rooftop', 'close', 'The whole city is kindling, and she would so like to be comfortable.']],
    ravager: [['harbor', 'mid', 'Something crawled out of the outflow pipes beneath the Mint, and it was hungry.'], ['alley', 'wide', 'The Villains put a collar on it. The collar is still around here somewhere.'], ['alley', 'close', 'It knows your scent. It learned it three blocks ago.']],
    cataclysm: [['foundry', 'wide', 'The Press Works built a siege engine and forgot to leave anyone in charge.'], ['storm', 'mid', 'It woke to find walls in every direction, and an answer to all of them.'], ['rooftop', 'close', 'No one has yet explained to it that the war is over. No one has volunteered.']],
    puppeteer: [['stage', 'wide', 'A grand theatre, an adoring crowd, and not one of the actors on the payroll.'], ['stage', 'mid', 'He found that people pull their own strings. One only has to hold the other end.'], ['nave', 'close', 'By the last act, everyone is dancing. Applause is mandatory.']],
  };
  const ORIGIN_SIDE = id => ['deadbolt', 'duelist', 'hex', 'plague', 'shiv', 'ironjaw', 'cinder', 'ravager', 'cataclysm', 'puppeteer'].includes(id) ? 1 : 0;
  const shade2 = (g, W, H, y0, col) => { g.fillStyle = col; const s = 9; for (let y = y0, j = 0; y < H + s; y += s, j++) { const r = 1 + (y - y0) / (H - y0) * 3.3; for (let x = j % 2 ? s / 2 : 0; x < W + s; x += s) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); } } };
  const SCENES = {
    rooftop(g, W, H, p, r) { const q = g.createLinearGradient(0, 0, 0, H); q.addColorStop(0, p.sky); q.addColorStop(1, p.far); g.fillStyle = q; g.fillRect(0, 0, W, H); g.fillStyle = p.moon; g.beginPath(); g.arc(W * (.14 + r() * .7), H * .22, H * .11, 0, TAU); g.fill(); CARD_STYLE.skyline(g, W, H * .72, ['rgba(0,0,0,0)', p.far2, p.acc], r); g.fillStyle = INK; g.beginPath(); g.moveTo(0, H); g.lineTo(0, H * .78); for (let x = 0; x <= W; x += W / 14) { g.lineTo(x, H * .78 - (Math.round(x / (W / 14)) % 2 ? 0 : H * .03)); } g.lineTo(W, H); g.closePath(); g.fill(); },
    alley(g, W, H, p, r) { g.fillStyle = p.sky; g.fillRect(0, 0, W, H); g.fillStyle = p.far; g.beginPath(); g.moveTo(W * .36, H * .1); g.lineTo(W * .64, H * .1); g.lineTo(W * .64, H * .7); g.lineTo(W * .36, H * .7); g.closePath(); g.fill(); g.fillStyle = INK; g.beginPath(); g.moveTo(0, 0); g.lineTo(W * .36, H * .1); g.lineTo(W * .36, H * .7); g.lineTo(0, H); g.moveTo(W, 0); g.lineTo(W * .64, H * .1); g.lineTo(W * .64, H * .7); g.lineTo(W, H); g.fill(); g.strokeStyle = p.far2; g.lineWidth = 2; for (let i = 1; i < 6; i++) { const t = i / 6; g.beginPath(); g.moveTo(0, t * H); g.lineTo(W * .36, H * .1 + t * H * .6); g.moveTo(W, t * H); g.lineTo(W * .64, H * .1 + t * H * .6); g.stroke(); } const lx = W * .5; const lg = g.createRadialGradient(lx, H * .22, 2, lx, H * .22, H * .55); lg.addColorStop(0, p.acc + 'cc'); lg.addColorStop(1, p.acc + '00'); g.fillStyle = lg; g.fillRect(0, 0, W, H); g.fillStyle = p.acc; g.fillRect(lx - 7, H * .18, 14, 18); g.fillStyle = '#05060a'; g.fillRect(lx - 1, 0, 2, H * .18); g.fillRect(0, H * .9, W, H * .1); },
    nave(g, W, H, p) { g.fillStyle = p.sky; g.fillRect(0, 0, W, H); for (let i = 0; i < 5; i++) { const cx = W * (.1 + i * .2), bw = W * .075; g.fillStyle = p.far; g.beginPath(); g.moveTo(cx - bw, H); g.lineTo(cx - bw, H * .36); g.quadraticCurveTo(cx - bw, H * .12, cx, H * .05); g.quadraticCurveTo(cx + bw, H * .12, cx + bw, H * .36); g.lineTo(cx + bw, H); g.closePath(); g.fill(); g.fillStyle = INK; g.fillRect(cx + bw, 0, W * .05, H); const q = g.createLinearGradient(cx, H * .1, cx - bw * 1.6, H); q.addColorStop(0, p.acc + '77'); q.addColorStop(1, p.acc + '00'); g.fillStyle = q; g.beginPath(); g.moveTo(cx - bw * .5, H * .12); g.lineTo(cx + bw * .5, H * .12); g.lineTo(cx - bw * .4, H); g.lineTo(cx - bw * 2.4, H); g.closePath(); g.fill(); } g.fillStyle = INK; g.fillRect(0, H * .9, W, H * .1); },
    foundry(g, W, H, p, r) { g.fillStyle = p.sky; g.fillRect(0, 0, W, H); const q = g.createRadialGradient(W * .5, H * .82, 10, W * .5, H * .82, W * .55); q.addColorStop(0, p.acc + 'dd'); q.addColorStop(1, p.acc + '00'); g.fillStyle = q; g.fillRect(0, 0, W, H); g.fillStyle = INK; for (const x of [.04, .25, .69, .9]) { g.fillRect(W * x, H * .1, W * .1, H * .75); for (let y = .15; y < .82; y += .11) { g.fillStyle = p.far2; g.fillRect(W * x + 4, H * y, W * .1 - 8, 3); g.fillStyle = INK; } } g.fillRect(0, H * .06, W, H * .06); g.fillRect(0, H * .86, W, H * .14); g.fillStyle = p.acc; for (let i = 0; i < 26; i++) g.fillRect(W * (.25 + r() * .5), H * (.42 + r() * .44), 2.5, 2.5); },
    ward(g, W, H, p, r) { g.fillStyle = p.sky; g.fillRect(0, 0, W, H); g.fillStyle = p.far; g.fillRect(0, H * .62, W, H * .38); g.strokeStyle = p.far2; g.lineWidth = 1.5; for (let x = -W; x < W * 2; x += W / 8) { g.beginPath(); g.moveTo(W / 2 + (x - W / 2) * .4, H * .62); g.lineTo(x, H); g.stroke(); } for (let i = 0; i < 3; i++) { const cx = W * (.22 + i * .28); const lg = g.createRadialGradient(cx, H * .12, 2, cx, H * .12, H * .5); lg.addColorStop(0, p.acc + '99'); lg.addColorStop(1, p.acc + '00'); g.fillStyle = lg; g.fillRect(cx - H * .5, 0, H, H * .7); g.fillStyle = INK; g.fillRect(cx - 18, H * .58, 36, 10); g.fillRect(cx - W * .1, H * .62, W * .2, H * .05); g.fillRect(cx - W * .1, H * .66, 5, H * .09); g.fillRect(cx + W * .1 - 5, H * .66, 5, H * .09); g.fillStyle = p.acc; g.fillRect(cx - 8, H * .1, 16, 4); g.fillRect(cx - 2, H * .1 - 6, 4, 16); } },
    storm(g, W, H, p, r) { const q = g.createLinearGradient(0, 0, 0, H); q.addColorStop(0, INK); q.addColorStop(1, p.far); g.fillStyle = q; g.fillRect(0, 0, W, H); CARD_STYLE.storm(g, W, H, [p.far, p.far2, p.acc].map((c, i) => i ? c : c), r); g.fillStyle = 'rgba(5,6,10,.45)'; g.fillRect(0, 0, W, H); g.strokeStyle = p.far2; g.lineWidth = 1.4; for (let i = 0; i < 70; i++) { const x = r() * W, y = r() * H; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 7, y + 20); g.stroke(); } g.fillStyle = INK; g.fillRect(0, H * .88, W, H * .12); },
    harbor(g, W, H, p) { const q = g.createLinearGradient(0, 0, 0, H * .6); q.addColorStop(0, p.sky); q.addColorStop(1, p.far); g.fillStyle = q; g.fillRect(0, 0, W, H); g.fillStyle = p.moon; g.beginPath(); g.arc(W * .74, H * .24, H * .13, 0, TAU); g.fill(); g.fillStyle = INK; for (const x of [.1, .36]) { g.fillRect(W * x, H * .24, 9, H * .4); g.beginPath(); g.moveTo(W * x - 26, H * .28); g.lineTo(W * x + W * .17, H * .2); g.lineTo(W * x + W * .17, H * .24); g.lineTo(W * x - 26, H * .32); g.closePath(); g.fill(); } CARD_STYLE.tide({ fillRect() { }, set fillStyle(v) { g.fillStyle = v; }, set strokeStyle(v) { g.strokeStyle = v; }, set lineWidth(v) { g.lineWidth = v; }, beginPath: () => g.beginPath(), moveTo: (a, b) => g.moveTo(a, b + H * .3), lineTo: (a, b) => g.lineTo(a, b + H * .3), quadraticCurveTo: (a, b, c, d) => g.quadraticCurveTo(a, b + H * .3, c, d + H * .3), closePath: () => g.closePath(), fill: () => g.fill(), stroke: () => g.stroke() }, W, H * .7, [p.far, p.far2, p.far2]); },
    stage(g, W, H, p) { g.fillStyle = INK; g.fillRect(0, 0, W, H); const sp = g.createLinearGradient(W / 2, 0, W / 2, H); sp.addColorStop(0, p.acc + 'aa'); sp.addColorStop(1, p.acc + '10'); g.fillStyle = sp; g.beginPath(); g.moveTo(W * .44, 0); g.lineTo(W * .56, 0); g.lineTo(W * .82, H * .9); g.lineTo(W * .18, H * .9); g.closePath(); g.fill(); g.fillStyle = p.far2; for (const sd of [0, 1]) for (let i = 0; i < 5; i++) { const x = sd ? W - W * (.04 + i * .05) : W * (.04 + i * .05), w0 = W * .022; g.beginPath(); g.moveTo(x - w0, 0); g.lineTo(x + w0, 0); g.quadraticCurveTo(x + w0 + (sd ? -10 : 10), H / 2, x + w0, H); g.lineTo(x - w0, H); g.closePath(); g.fill(); g.fillStyle = i % 2 ? p.far2 : p.far; } g.fillStyle = p.far; g.fillRect(0, H * .9, W, H * .1); g.fillStyle = p.acc; g.fillRect(0, H * .9, W, 2.5); },
  };
  function origin(kit, i = 0) {
    const list = ORIGINS[kit], n = list ? ((i % list.length) + list.length) % list.length : 0;
    return lazyCanvas(`origin|${kit}|${n}`, () => {
      const W = 640, H = 400, c = cv(W, H), g = c.getContext('2d'), m = list ? list[n] : ['rooftop', 'wide', ''], side = ORIGIN_SIDE(kit), r = seeded((hashStr(kit) + n * 991) % 2147483646 + 1), metal = METAL[kit] || (side ? ['#ff8a90', '#7a1c2a'] : ['#e6d29a', '#8a6a34']);
      const acc = side ? '#ec3a52' : '#e6d29a', p = side ? { sky: '#180a12', far: '#2a111c', far2: '#4a1a2a', moon: '#c9a8a0', acc } : { sky: '#091630', far: '#132a52', far2: '#233c68', moon: '#ecdcae', acc };
      g.save(); g.beginPath(); g.rect(0, 0, W, H); g.clip();
      (SCENES[m[0]] || SCENES.rooftop)(g, W, H, p, r);
      const shot = m[1];
      const pos = shot === 'close' ? { x: W * (.62 + r() * .1), y: H * .68, R: 196 } : shot === 'mid' ? { x: W * (.3 + r() * .4), y: H * .62, R: 86 } : { x: W * (.2 + r() * .6), y: H * .68, R: 38 };
      g.fillStyle = 'rgba(4,5,9,.46)'; g.beginPath(); g.ellipse(pos.x + pos.R * .1, pos.y + pos.R * .93, pos.R, pos.R * .2, 0, 0, TAU); g.fill();
      if (shot !== 'wide') { const q = g.createRadialGradient(pos.x, pos.y, pos.R, pos.x, pos.y, pos.R * 1.6); q.addColorStop(0, acc + '55'); q.addColorStop(1, acc + '00'); g.fillStyle = q; g.fillRect(0, 0, W, H); }
      drawSealDisc(g, kit, pos.x, pos.y, pos.R, metal[0], acc);
      shade2(g, W, H, H * .7, 'rgba(4,5,9,.32)');
      g.font = fontD(26, 700); const lines = wrapLines(g, m[2], W * .58 - 40), lh = 29, bw = W * .58, bh = lines.length * lh + 26, bx = 18, by = 18;
      g.fillStyle = 'rgba(7,9,14,.92)'; g.fillRect(bx, by, bw, bh); g.strokeStyle = acc; g.lineWidth = 2; g.strokeRect(bx + 4, by + 4, bw - 8, bh - 8);
      g.fillStyle = '#f0ece0'; g.textBaseline = 'alphabetic'; lines.forEach((l, k) => g.fillText(l, bx + 18, by + 34 + k * lh));
      g.restore();
      g.strokeStyle = INK; g.lineWidth = 12; g.strokeRect(0, 0, W, H); g.strokeStyle = acc; g.lineWidth = 2; g.strokeRect(9, 9, W - 18, H - 18);
      return c;
    });
  }
  const originCount = kit => ORIGINS[kit] ? ORIGINS[kit].length : 0;
  const originText = (kit, i) => ORIGINS[kit] && ORIGINS[kit][i] ? ORIGINS[kit][i][2] : '';

  // ---------- colorblind palette: Okabe-Ito based ----------
  // Art.PAL is one live object. setCB rewrites it and TEAM in place, so anyone holding a reference sees the change.
  const PAL_STD = { team: ['#58a6e6', '#e4573f'], teamDark: ['#1f4f7d', '#7e2a1e'], ally: '#6ea4ee', enemy: '#d9273f', danger: { out: '#d81f24', mid: '#ff5a44', core: '#ffe9d8', aim: '255,62,40' }, hp: '#62d26f', hpEnemy: '#e0434f', mana: '#58a6e6', ok: '#7fd6a4', warn: '#ffb24a', accent: '#e6d29a', towerLight: ['#ffdf9e', '#ff4a5c'] };
  const PAL_CB = { team: ['#56b4e9', '#f2b90f'], teamDark: ['#0d4f80', '#8a6300'], ally: '#56b4e9', enemy: '#f2b90f', danger: { out: '#a73f00', mid: '#e0520c', core: '#fff0e0', aim: '224,82,12' }, hp: '#3fa7f0', hpEnemy: '#f2b90f', mana: '#b48fe0', ok: '#56b4e9', warn: '#f2b90f', accent: '#f0e6c4', towerLight: ['#bfe3ff', '#f2b90f'] };
  const PAL = JSON.parse(JSON.stringify(PAL_STD)), CB_HOOKS = []; let cbNow = false;
  const CB_CSS = ':root.cb{--crim:#f2b90f;--crim2:#8a6300;--acid:#56b4e9}:root.cb .s1{--acc:#f2b90f;--acc3:#b88a10;--acc2:#56b4e9;--on:#14100a}';
  function setCB(on) {
    on = !!on; if (on === cbNow) return; cbNow = on; const src = on ? PAL_CB : PAL_STD;
    for (const k in src) if (typeof src[k] !== 'object' || Array.isArray(src[k])) PAL[k] = Array.isArray(src[k]) ? src[k].slice() : src[k]; else Object.assign(PAL[k], src[k]);
    TEAM[0] = src.team[0]; TEAM[1] = src.team[1]; TEAM_DARK[0] = src.teamDark[0]; TEAM_DARK[1] = src.teamDark[1];
    if (typeof document !== 'undefined') { let st = document.getElementById('cbcss'); if (!st) { st = document.createElement('style'); st.id = 'cbcss'; st.textContent = CB_CSS; document.head.appendChild(st); } document.documentElement.classList.toggle('cb', on); }
    for (const f of CB_HOOKS) { try { f(on, PAL); } catch (e) { } }
  }
  const setPalette = setCB;
  const onCB = f => { CB_HOOKS.push(f); if (cbNow) f(true, PAL); };

  // ---------- Play of the Game presentation: a card-wipe in, letterbox, a nameplate, a shutter out ----------
  // Call every frame over the replay. o: { t seconds since start, dur, name, champ, team, label }
  function potg(ctx, W, H, o) {
    const t = o.t || 0, dur = o.dur || 8, inT = Math.min(1, t / .5), outT = Math.max(0, (t - dur + .55) / .55), ease = x => 1 - Math.pow(1 - x, 3), barH = Math.round(H * .105), bars = barH * ease(inT);
    ctx.save(); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, W, bars); ctx.fillRect(0, H - bars, W, bars);
    ctx.fillStyle = '#e6d29a'; ctx.globalAlpha = .9; ctx.fillRect(0, bars, W, 1.5); ctx.fillRect(0, H - bars - 1.5, W, 1.5); ctx.globalAlpha = 1;
    const prog = Math.max(0, Math.min(1, t / dur)); ctx.fillStyle = '#ffd98a'; ctx.fillRect(0, H - 3, W * prog, 3);
    const tag = barH * .5; ctx.font = fontD(tag); ctx.fillStyle = '#e6d29a'; ctx.fillText('PLAY OF THE GAME', 18, bars - barH * .28);
    // The opening slash: a gold blade of light with the title riding it, gone within a second.
    if (t < 1.25) { const k = Math.min(1, t / .34), f = t > .85 ? (1.25 - t) / .4 : 1, cy = H * .46, h0 = H * .2; ctx.save(); ctx.globalAlpha = f; ctx.fillStyle = 'rgba(5,6,10,.82)'; ctx.fillRect(0, cy - h0, W * ease(k), h0 * 2); ctx.fillStyle = '#ffd98a'; ctx.fillRect(0, cy - h0, W * ease(k), 3); ctx.fillRect(W - W * ease(k), cy + h0 - 3, W * ease(k), 3); ctx.beginPath(); ctx.rect(0, cy - h0, W * ease(k), h0 * 2); ctx.clip(); ctx.textAlign = 'center'; const px = fitText(ctx, 'PLAY OF THE GAME', W * .86, H * .19); ctx.fillStyle = '#ffffff'; ctx.fillText('PLAY OF THE GAME', W / 2, cy + px * .34); ctx.restore(); }
    // Nameplate, sliding in after the title and leaving with the shutter.
    const pIn = ease(Math.max(0, Math.min(1, (t - .95) / .35))); if (pIn > 0) { const ph = H * .16, pw = Math.min(W * .54, 380), x = 18 - (1 - pIn) * (pw + 30), y = H - bars - ph - 12, teamCol = TEAM[o.team] || GOLDL; ctx.fillStyle = 'rgba(7,9,14,.92)'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + pw, y); ctx.lineTo(x + pw - ph * .3, y + ph); ctx.lineTo(x, y + ph); ctx.closePath(); ctx.fill(); ctx.fillStyle = teamCol; ctx.fillRect(x, y, 5, ph); drawSealDisc(ctx, o.champ, x + ph * .62, y + ph / 2, ph * .4, GOLDL); const tx = x + ph * 1.14, tw = pw - ph * 1.5; ctx.fillStyle = PAPER; fitText(ctx, String(o.name || '').toUpperCase(), tw, ph * .44); ctx.fillText(String(o.name || '').toUpperCase(), tx, y + ph * .5); ctx.fillStyle = '#e6d29a'; fitText(ctx, String(o.label || ''), tw, ph * .26, fontU); ctx.fillText(String(o.label || ''), tx, y + ph * .84); }
    if (outT > 0) { const h = H / 2 * ease(Math.min(1, outT)); ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, W, h); ctx.fillRect(0, H - h, W, h); }
    ctx.restore();
  }
  // ---------- end 11.0 art ----------

  return { dropTurntables, medal, medalInto, medalReady, medalDraw, medalURL, medalMeta, MEDAL_EMB, CARDS, cardArt, playerCard, shareCard, origin, originCount, originText, ORIGINS, PAL, setCB, onCB, get cb() { return cbNow; }, setPalette, potg, flare, minionGear, bossCoin, bossTurn, BOSS_COL, seal, shock, bountyMark, wantedMark, TEAM, TEAM_DARK, METAL, TILT, TAU, INK, COSMETICS, champCoin, champTurn, minionCoin, minionTurn, monsterCoin, monsterTurn, civCoin, coin, glow, shadow, drawEmblemIcon, abilityCoin, iconURL, sheen, vignette, seeded, mix, mixH, cv, reed, puff, leaf, shardsOf, impact, speedLines, sparkSp, dustCel, chip, glint, pillar, hazard, koCoin, pump, defer, frameAt, ensure, sigil, spikeBall, stats, buildFace, shade, canvasFrom, reliefStack, FINISH };
})();
