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
    if (T.left <= 0) T.F = null;
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
  function ensure(spr) { const T = spr.T; if (!T || T.ready) return; if (!T.F) T.F = faceOf(T.id, T.spec, T.R, WORLD_PITCH, T.ss); bakeFrame(T, T.mid, spr); }
  function stats() { return { ...STAT, bakeMs: Math.round(STAT.bakeMs) }; }

  // Warm-up: a coin shown in the lobby quietly prepares the sizes the versus splash and the HUD ask for, so pressing start never hitches.
  const WARM = [], WARMED = new Set(); let warmOn = false;
  function warmPump() { const j = WARM.shift(); if (!j) { warmOn = false; return; } j(); setTimeout(warmPump, 45); }
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
      g => { g.beginPath(); g.moveTo(-.9, .8); g.bezierCurveTo(-.4, -.3, .3, .5, .85, -.8); g.stroke(); poly(g, [[-.98, .98], [-.62, .94], [-.82, .58]]); poly(g, [[.98, -.98], [.62, -.94], [.82, -.58]]); dot(g, -.05, .1, .2); },
      g => { arc(g, 0, 0, .86); ln(g, -.56, -.56, .56, .56); ln(g, .56, -.56, -.56, .56); },
    ],
    shiv: [
      g => { poly(g, [[.96, -.9], [.12, .28], [-.2, -.04], [.7, -.92]]); poly(g, [[-.36, .32], [-.1, .56], [-.34, .78], [-.6, .54]]); ln(g, -.84, -.3, -.5, -.3); ln(g, -.6, -.62, -.3, -.62); },
      g => { g.setLineDash([.22, .15]); arc(g, 0, 0, .84); g.setLineDash([]); poly(g, [[0, -.46], [.32, .36], [0, .16], [-.32, .36]]); },
      g => { for (const o of [-.58, 0, .58]) ln(g, o + .3, -.86, o - .3, .86); ln(g, -.98, .08, .98, -.2); },
    ],
    ironjaw: [
      g => { dot(g, .42, .42, .44); arc(g, -.5, -.5, .14); arc(g, -.2, -.2, .14); ln(g, -.05, -.05, .14, .14); ln(g, -.9, -.9, -.62, -.62); },
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
      g => { arc(g, -.62, .55, .3); arc(g, 0, 0, .3); arc(g, .62, -.55, .3); dot(g, -.62, .55, .1); dot(g, 0, 0, .1); dot(g, .62, -.55, .1); },
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
      g => { poly(g, [[.02, -1], [.38, -1], [.14, -.44], [.4, -.44], [-.14, .34], [0, -.24], [-.24, -.24]]); ln(g, -.98, .62, .98, .62); ln(g, -.62, .92, .62, .92); },
    ],
    tidecaller: [
      g => { g.beginPath(); g.moveTo(-.95, .4); g.bezierCurveTo(-.4, -.7, .3, -.7, .6, -.05); g.bezierCurveTo(.3, -.32, 0, -.2, -.18, .4); g.closePath(); g.fill(); ln(g, -.9, .78, .9, .78); },
      g => { arc(g, 0, 0, .82); g.save(); g.lineWidth = .11; g.beginPath(); g.arc(-.24, -.26, .38, 3.2, 4.8); g.stroke(); g.restore(); dot(g, .32, .32, .12); },
      g => { for (let i = 0; i < 3; i++) { const y = -.62 + i * .58, x = -.96 + i * .14; g.beginPath(); g.moveTo(x, y + .3); g.quadraticCurveTo(0, y - .55, -x, y + .3); g.quadraticCurveTo(0, y - .12, x, y + .3); g.closePath(); g.fill(); } },
    ],
    paragon: [
      g => { poly(g, [[0, -1], [.42, -.36], [.16, -.36], [.16, .5], [-.16, .5], [-.16, -.36], [-.42, -.36]]); ln(g, -.6, .84, .6, .84); },
      g => { g.lineWidth = .14; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + .26; ln(g, Math.cos(a) * .62, Math.sin(a) * .62, Math.cos(a) * .98, Math.sin(a) * .98); } poly(g, [[-.34, -.34], [.34, -.34], [.4, .3], [-.4, .3]]); },
      g => { poly(g, [[.48, -.98], [.86, -.62], [.2, .3], [-.14, .02]]); poly(g, [[-.4, .36], [.18, .66], [-.1, .9], [-.72, .78]]); ln(g, -.98, .4, -.62, .1); },
    ],
    mirage: [
      g => { poly(g, [[.96, 0], [.2, -.26], [.3, 0], [.2, .26]]); ln(g, -.96, -.72, .04, -.1); ln(g, -.96, .72, .04, .1); ln(g, -.98, 0, .1, 0); },
      g => { dot(g, .42, 0, .34); g.setLineDash([.17, .13]); arc(g, -.42, 0, .34); g.setLineDash([]); ln(g, -.05, .72, .4, .72); },
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
      g => { poly(g, [[-.82, -.7], [.82, -.7], [.74, .14], [0, .92], [-.74, .14]]); },
      g => { g.lineWidth = .15; ln(g, -.98, .1, -.44, -.26, -.12, .24, .32, -.34, .98, .08); poly(g, [[-.3, .5], [.14, .5], [.3, .98], [-.5, .98]]); },
    ],
    puppeteer: [
      g => { g.lineWidth = .11; ln(g, -.96, .86, .96, -.86); dot(g, .96, -.86, .2); poly(g, [[-.96, .86], [-.5, .38], [-.3, .58]]); },
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

  return { flare, minionGear, bossCoin, bossTurn, BOSS_COL, seal, shock, bountyMark, TEAM, TEAM_DARK, METAL, TILT, TAU, INK, COSMETICS, champCoin, champTurn, minionCoin, minionTurn, monsterCoin, monsterTurn, civCoin, coin, glow, shadow, drawEmblemIcon, abilityCoin, iconURL, sheen, vignette, seeded, mix, mixH, cv, reed, puff, leaf, shardsOf, impact, speedLines, sparkSp, dustCel, chip, glint, pillar, hazard, koCoin, pump, defer, frameAt, ensure, sigil, spikeBall, stats, buildFace, shade, canvasFrom, reliefStack, FINISH };
})();
