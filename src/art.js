// Coin art. Everything is generated in code and cached to offscreen canvases.
// Style: dark deco. Machined metal badges on near-black fields, flat angular emblems, one light source, no faces.
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
  function mix(a, b, t) { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; }
  const hx2 = c => '#' + c.match(/\d+/g).map(v => (+v).toString(16).padStart(2, '0')).join('');
  const mixH = (a, b, t) => hx2(mix(a, b, t));
  function seeded(s) { return () => (s = (s * 16807) % 2147483647) / 2147483647; }
  const cache = new Map();
  const TILT = .74;

  // ---------- the machining kit. Tones are [lit, base, shade] ----------
  const polyT = p => g => { p.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.closePath(); };
  // Regular polygon helpers, for facets instead of curves.
  const ngon = (cx, cy, r, n, rot = -HALF / 2) => { const o = []; for (let i = 0; i < n; i++) { const a = rot + i / n * TAU; o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return o; };
  const arcPts = (cx, cy, r, a0, a1, n) => { const o = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return o; };
  // A flat shape with a chiselled look: a hard split down one axis, then a lit and a shaded sliver at the edge.
  function emboss(g, trace, tone, o = {}) {
    const bev = o.bev === undefined ? .05 : o.bev, rule = o.rule || 'nonzero', ang = o.axis === undefined ? 1.05 : o.axis, cx = o.cx || 0, cy = o.cy || 0;
    if (o.cast !== 0) { g.save(); g.translate(bev * .8, bev); g.beginPath(); trace(g); g.fillStyle = 'rgba(0,0,0,.72)'; g.fill(rule); g.restore(); }
    g.save(); g.beginPath(); trace(g); g.fillStyle = tone[1]; g.fill(rule); g.clip(rule);
    if (o.split !== 0) { g.save(); g.translate(cx, cy); g.rotate(ang); g.fillStyle = tone[2]; g.globalAlpha = o.split === undefined ? .55 : o.split; g.fillRect(0, -4, 4, 8); g.restore(); }
    if (bev > 0) {
      g.save(); g.translate(bev, bev * 1.1); g.beginPath(); g.rect(-4, -4, 8, 8); trace(g); g.fillStyle = tone[0]; g.fill('evenodd'); g.restore();
      g.save(); g.translate(-bev * .8, -bev); g.beginPath(); g.rect(-4, -4, 8, 8); trace(g); g.fillStyle = tone[2]; g.fill('evenodd'); g.restore();
    }
    g.restore();
  }
  const pl = (g, p, tone, o) => emboss(g, polyT(p), tone, o);
  // Mirrors a right-hand polygon through x=0 and returns it as a second polygon.
  const mx = p => p.map(([x, y]) => [-x, y]);
  const rot = (p, a, ox = 0, oy = 0) => { const c = Math.cos(a), s = Math.sin(a); return p.map(([x, y]) => [ox + x * c - y * s, oy + x * s + y * c]); };
  const move = (p, dx, dy) => p.map(([x, y]) => [x + dx, y + dy]);

  // Tones. a = the emblem metal, b = the secondary, f = field [base, light shaft], h = hairline.
  const T_HERO = { f: ['#0c1626', '#15253f'], h: '#b39a63', a: ['#fff4d2', '#ecd9a6', '#94742f'], b: ['#dfe7f1', '#a3b2c6', '#4d5c72'], spec: '#fffdf2' };
  const T_CRIM = { f: ['#0c0d11', '#1b1c22'], h: '#7c1a28', a: ['#ff8a94', '#e0293f', '#7a0f20'], b: ['#b8bdc7', '#71767f', '#30333a'], spec: '#ffd9dc' };
  const T_ACID = { f: ['#0c0d11', '#1b1c22'], h: '#5e7a18', a: ['#efffa8', '#b9ee3a', '#5c8710'], b: ['#b8bdc7', '#71767f', '#30333a'], spec: '#f2ffcc' };
  const T_NEUT = { f: ['#131110', '#241f1a'], h: '#7a6030', a: ['#ffe6b0', '#d8a658', '#7a5420'], b: ['#b6a78e', '#7a6c54', '#3a3226'], spec: '#fff2d0' };
  const T_CIV = { f: ['#b6b1a6', '#c9c4b8'], h: '#7f786a', a: ['#3a3f4a', '#2a2e38', '#14161c'], b: ['#6a6f7a', '#4a4f5a', '#24272e'], spec: '#ffffff' };

  // ---------- twelve emblems, drawn in a -1..1 box. Each is meant to read at about 24px across ----------
  const EMB = {
    hero: {
      // Longshot: a scope's four corner brackets around one rising lozenge.
      vesper(g, t) { const b = [[-.86, -.26], [-.86, -.86], [-.26, -.86], [-.26, -.62], [-.62, -.62], [-.62, -.26]]; for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) pl(g, b.map(([x, y]) => [x * sx, y * sy]), t.b); pl(g, [[0, -.5], [.24, 0], [0, .5], [-.24, 0]], t.a, { axis: 0 }); },
      // Captain Riposte: one upright blade over a swept guard.
      kade(g, t) { pl(g, [[0, -1], [.16, -.5], [.15, .26], [-.15, .26], [-.16, -.5]], t.a, { axis: 0 }); pl(g, [[-.74, .02], [0, .36], [.74, .02], [.54, .42], [0, .64], [-.54, .42]], t.b); pl(g, [[0, .66], [.15, .84], [0, 1], [-.15, .84]], t.a, { axis: 0 }); },
      // Starling: a four-point star falling, three clean streaks behind it.
      ione(g, t) { const u = [.707, -.707], bar = (ox, oy, l, w) => [[ox - u[1] * w, oy + u[0] * w], [ox + u[0] * l - u[1] * w * .45, oy + u[1] * l + u[0] * w * .45], [ox + u[0] * l + u[1] * w * .45, oy + u[1] * l - u[0] * w * .45], [ox + u[1] * w, oy - u[0] * w]]; pl(g, bar(-.02, -.1, .86, .1), t.b); pl(g, bar(.22, .14, .68, .085), t.b); pl(g, bar(-.26, -.34, .54, .085), t.b); const cx = -.34, cy = .36, R = .62, r = .15; pl(g, [[cx, cy - R], [cx + r, cy - r], [cx + R, cy], [cx + r, cy + r], [cx, cy + R], [cx - r, cy + r], [cx - R, cy], [cx - r, cy - r]], t.a, { axis: .78, cx, cy }); },
      // Dawnbringer: a half sun clearing a level horizon, five blades of light.
      solenne(g, t) { pl(g, [[-.92, .4], [.92, .4], [.74, .6], [-.74, .6]], t.b); pl(g, [[-.5, .7], [.5, .7], [.36, .86], [-.36, .86]], t.b); const c = [0, .34]; pl(g, [...arcPts(c[0], c[1], .42, HALF, TAU, 8)], t.a, { axis: 0, cy: .1 }); for (let i = 0; i < 5; i++) { const a = HALF + (i + .5) / 5 * HALF, w = .13; pl(g, [[c[0] + Math.cos(a - w) * .56, c[1] + Math.sin(a - w) * .56], [c[0] + Math.cos(a) * (i % 2 ? .94 : 1.12), c[1] + Math.sin(a) * (i % 2 ? .94 : 1.12)], [c[0] + Math.cos(a + w) * .56, c[1] + Math.sin(a + w) * .56]], t.a, { bev: .03, split: 0 }); } },
      // Nightfall: a faceted crescent holding a falling blade.
      sable(g, t) { pl(g, [...arcPts(.02, 0, .92, 1.02, TAU - 1.02, 11), ...arcPts(.56, 0, .76, TAU - 1.62, 1.62, 9)], t.a, { axis: HALF / 2, cx: -.42 }); pl(g, [[.42, -.74], [.6, -.08], [.42, .74], [.24, -.08]], t.b, { axis: 0, cx: .42 }); },
      // Bulwark: a walled keep with a chevron gate.
      gravel(g, t) { pl(g, [[-.76, -.8], [-.42, -.8], [-.42, -.54], [-.17, -.54], [-.17, -.8], [.17, -.8], [.17, -.54], [.42, -.54], [.42, -.8], [.76, -.8], [.76, -.14], [.6, .34], [0, .94], [-.6, .34], [-.76, -.14]], t.a, { axis: 0 }); pl(g, [[-.42, -.2], [0, .1], [.42, -.2], [.42, .08], [0, .46], [-.42, .08]], [mixH(t.a[2], '#000000', .3), mixH(t.a[2], '#000000', .55), '#0a0806'], { axis: 0, bev: .03, cast: 0 }); },
    },
    villain: {
      // Deadbolt: a keyhole with two bolts shot home.
      vesper(g, t) { for (const s of [1, -1]) pl(g, [[s * .94, -.15], [s * .56, -.15], [s * .48, 0], [s * .56, .15], [s * .94, .15]], t.b); pl(g, [...arcPts(0, -.24, .42, 1.99, 7.43, 14), [.3, .8], [-.3, .8]], t.a, { axis: 0 }); },
      // The Duelist: a sabre turned point-down and snapped.
      kade(g, t) { pl(g, [[0, -1], [.15, -.84], [0, -.66], [-.15, -.84]], t.b, { axis: 0 }); pl(g, [[-.76, -.66], [0, -.34], [.76, -.66], [.5, -.26], [0, -.04], [-.5, -.26]], t.b); pl(g, [[-.22, -.02], [.22, -.02], [.21, .32], [.02, .44], [.14, .54], [-.21, .5]], t.a, { axis: 0 }); pl(g, [[-.16, .62], [.05, .58], [.15, .7], [0, 1], [-.16, .74]], t.a, { axis: 0 }); },
      // Madame Hex: six cut plates around a slit of light.
      ione(g, t) { const R = .96, r = .66, gap = .085; for (let i = 0; i < 6; i++) { const a = -HALF / 2 + i / 6 * TAU, b = a + TAU / 6; pl(g, [[Math.cos(a + gap) * R, Math.sin(a + gap) * R], [Math.cos(b - gap) * R, Math.sin(b - gap) * R], [Math.cos(b - gap * 1.4) * r, Math.sin(b - gap * 1.4) * r], [Math.cos(a + gap * 1.4) * r, Math.sin(a + gap * 1.4) * r]], t.b, { bev: .035 }); } pl(g, [[0, -.5], [.2, 0], [0, .5], [-.2, 0]], t.a, { axis: 0 }); },
      // The Plague Doctor: a tall alembic with a bright measure inside.
      solenne(g, t) { pl(g, [[-.28, -1], [.28, -1], [.28, -.84], [-.28, -.84]], t.b, { bev: .03 }); pl(g, [[-.17, -.82], [.17, -.82], [.17, -.36], [.78, .74], [.64, .94], [-.64, .94], [-.78, .74], [-.17, -.36]], t.b, { axis: 0 }); pl(g, [[-.34, .08], [.34, .08], [.6, .7], [.5, .82], [-.5, .82], [-.6, .7]], t.a, { axis: 0, bev: .035 }); },
      // Shiv: a narrow knife on the diagonal and the two cuts it leaves.
      sable(g, t) { const R = p => rot(p, .72, -.04, .08); pl(g, R([[-.62, -.66], [-.5, -.66], [-.5, .5], [-.62, .5]]), t.b, { bev: .025, split: 0 }); pl(g, R([[.5, -.5], [.62, -.5], [.62, .66], [.5, .66]]), t.b, { bev: .025, split: 0 }); pl(g, R([[0, -1.04], [.22, -.18], [.14, .32], [-.14, .32], [-.22, -.18]]), t.a, { axis: .72 }); pl(g, R([[-.36, .32], [.36, .32], [.3, .46], [-.3, .46]]), t.b, { bev: .03 }); pl(g, R([[-.11, .46], [.11, .46], [.07, .9], [-.07, .9]]), t.b, { bev: .03 }); },
      // Ironjaw: a closed trap of offset steel teeth.
      gravel(g, t) { pl(g, [[-.9, -.78], [.9, -.78], [.9, -.26], [.64, .06], [.46, -.2], [.23, .1], [0, -.2], [-.23, .1], [-.46, -.2], [-.64, .06], [-.9, -.26]], t.a, { axis: 0 }); pl(g, [[-.9, .78], [.9, .78], [.9, .42], [.64, .16], [.46, .4], [.23, .14], [0, .4], [-.23, .14], [-.46, .4], [-.64, .16], [-.9, .42]], t.b, { axis: 0 }); },
    },
  };
  const CHAR_T = { hero: { vesper: T_HERO, kade: T_HERO, ione: T_HERO, solenne: T_HERO, sable: T_HERO, gravel: T_HERO }, villain: { vesper: T_ACID, kade: T_CRIM, ione: T_ACID, solenne: T_ACID, sable: T_CRIM, gravel: T_CRIM } };

  // ---------- mastery rims. Each tier adds machining; the metal gets finer as it climbs ----------
  const RIM = [
    { l: '#e2a47c', b: '#a8653c', d: '#552c16' },
    { l: '#d3ae74', b: '#8a6a3a', d: '#3f2c12' },
    { l: '#f4f7fb', b: '#aeb9c7', d: '#4e5a6a' },
    { l: '#fff3c8', b: '#dcb860', d: '#70521a' },
    { l: '#f4ffff', b: '#c4dde4', d: '#517684' },
    { l: '#efe9ff', b: '#54468a', d: '#17102e' },
  ];
  const SPECTRAL = ['#7a5cff', '#3fa8ff', '#42e0d0', '#d9e46a', '#ff9a5a', '#e04fb0'];
  // Outline of the coin as [angle, radius] pairs. Heroes are turned true round; villains are cut with facets.
  function edge(tier, villain) {
    const out = [];
    if (villain) {
      const n = tier >= 4 ? 16 : 12, R = .985, notch = tier >= 3 ? .05 : 0;
      for (let i = 0; i < n; i++) { const a = (i + .5) / n * TAU - HALF / 2, st = TAU / n; out.push([a - st * .46, R]); if (notch) { out.push([a - st * .1, R - notch]); out.push([a + st * .1, R - notch]); } out.push([a + st * .46, R]); }
      return out;
    }
    const n = tier >= 4 ? 8 : 0;
    if (!n) { for (let i = 0; i < 96; i++) out.push([i / 96 * TAU, .985]); return out; }
    // eight stepped shoulders, as on a deco medallion
    for (let i = 0; i < n; i++) { const a = i / n * TAU - HALF / 2, st = TAU / n; for (let k = 0; k <= 8; k++) out.push([a + st * .14 + st * .72 * k / 8, .955]); out.push([a + st * .86, 1.03]); out.push([a + st * 1.14 - .0, 1.03]); }
    return out;
  }
  const edgeT = e => g => { e.forEach(([a, r], i) => g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r)); g.closePath(); };
  function drawRim(g, tier, villain, rInner) {
    const m = RIM[tier], e = edge(tier, villain), T = edgeT(e), ringT = g2 => { T(g2); g2.moveTo(rInner, 0); g2.arc(0, 0, rInner, 0, TAU, true); g2.closePath(); };
    emboss(g, ringT, [m.l, m.b, m.d], { bev: .04, rule: 'evenodd', axis: .8, split: .9 });
    const each = (n, f, off = 0) => { for (let i = 0; i < n; i++) { g.save(); g.rotate((i + off) / n * TAU); f(i); g.restore(); } };
    const mid = (rInner + .97) / 2;
    if (tier >= 1) { g.beginPath(); g.arc(0, 0, mid + .03, 0, TAU); g.strokeStyle = m.d; g.lineWidth = .016; g.stroke(); }
    if (tier === 2) each(4, () => { g.fillStyle = m.d; g.fillRect(-.09, -mid - .045, .18, .03); g.fillRect(-.06, -mid + .012, .12, .02); }, .125);
    if (tier === 3) each(12, () => { g.fillStyle = m.d; g.fillRect(-.01, -mid - .05, .02, .1); });
    if (tier === 4) each(8, () => { g.beginPath(); g.moveTo(0, -mid - .055); g.lineTo(.05, -mid); g.lineTo(0, -mid + .055); g.lineTo(-.05, -mid); g.closePath(); g.fillStyle = '#6fe0f2'; g.fill(); g.strokeStyle = m.d; g.lineWidth = .012; g.stroke(); }, .5);
    if (tier === 5) { for (let i = 0; i < 48; i++) { const a = i / 48 * TAU; g.beginPath(); g.arc(0, 0, mid, a, a + TAU / 48 + .01); g.strokeStyle = SPECTRAL[(i / 8 | 0) % 6]; g.lineWidth = .055; g.stroke(); } each(8, () => { g.beginPath(); g.moveTo(0, -mid - .07); g.lineTo(.04, -mid); g.lineTo(0, -mid + .07); g.lineTo(-.04, -mid); g.closePath(); g.fillStyle = '#ffffff'; g.fill(); }, .5); }
  }
  // Recessed field: one angled shaft of light, a hairline, and the emblem cut above it.
  function field(g, r, t) {
    g.save(); g.beginPath(); g.arc(0, 0, r, 0, TAU); g.clip();
    g.fillStyle = t.f[0]; g.fillRect(-1.1, -1.1, 2.2, 2.2);
    g.fillStyle = t.f[1]; g.beginPath(); g.moveTo(-1.1, .2); g.lineTo(.35, -1.1); g.lineTo(1.1, -1.1); g.lineTo(-1.1, .95); g.closePath(); g.fill();
    g.restore();
    g.beginPath(); g.arc(0, 0, r - .012, 0, TAU); g.strokeStyle = 'rgba(0,0,0,.85)'; g.lineWidth = .05; g.stroke();
    g.beginPath(); g.arc(0, 0, r - .05, 0, TAU); g.strokeStyle = t.h; g.lineWidth = .018; g.stroke();
  }
  function specular(g, col) {
    g.beginPath(); g.arc(0, 0, .935, HALF * 1.16, HALF * 1.46); g.arc(0, 0, .9, HALF * 1.42, HALF * 1.2, true); g.closePath(); g.fillStyle = col; g.globalAlpha = .95; g.fill(); g.globalAlpha = 1;
  }

  // A complete badge. key: cache id; tier -1 means no mastery rim.
  function badge(key, R0, tier, tone, villain, paint, o = {}) {
    const id = `${key}|${R0}|${tier}`; if (cache.has(id)) return cache.get(id);
    const ss = R0 < 60 ? 2 : R0 < 130 ? 1.5 : 1, R = Math.round(R0 * ss), P = Math.ceil(R * .12) + 2, S = R * 2 + P * 2, c = cv(S, S), g = c.getContext('2d');
    g.translate(S / 2, S / 2); g.scale(R, R); g.lineJoin = 'miter'; g.miterLimit = 6;
    const rIn = o.rIn || .8;
    if (tier >= 0) drawRim(g, tier, villain, rIn);
    else { const m = o.metal || { l: '#c7d0dc', b: '#6d7a8c', d: '#2a313c' }; emboss(g, gg => { edgeT(edge(0, villain))(gg); gg.moveTo(rIn, 0); gg.arc(0, 0, rIn, 0, TAU, true); gg.closePath(); }, [m.l, m.b, m.d], { bev: .05, rule: 'evenodd', axis: .8, split: .9 }); }
    field(g, rIn, tone);
    const k = (o.k || .74) * rIn / .8; g.save(); g.scale(k, k); paint(g, tone); g.restore();
    specular(g, tone.spec);
    const out = { c, R, P, S }; cache.set(id, out); return out;
  }

  function champCoin(id, team, tier, R = 52) {
    const side = team === 1 ? 'villain' : 'hero', t = CHAR_T[side][id] || T_HERO;
    return badge(`cc${side}${id}`, R, tier, t, team === 1, EMB[side][id]);
  }

  // Footsoldiers: a single bold rank mark.
  const RANK = {
    melee(g, t) { pl(g, [[0, -.86], [.78, -.1], [.78, .3], [0, -.34], [-.78, .3], [-.78, -.1]], t.a, { axis: 0, bev: .07 }); pl(g, [[0, .1], [.56, .56], [.56, .9], [0, .52], [-.56, .9], [-.56, .56]], t.b, { axis: 0, bev: .06 }); },
    ranged(g, t) { pl(g, [[0, -.92], [.82, 0], [0, .92], [-.82, 0]], t.a, { axis: 0, bev: .08 }); pl(g, [[0, -.4], [.36, 0], [0, .4], [-.36, 0]], [t.f[1], t.f[0], '#000000'], { axis: 0, bev: .03, cast: 0, split: 0 }); },
  };
  const T_DEP = { ...T_HERO, a: ['#eef3fa', '#b4c6dc', '#4d6484'], b: ['#d9c79a', '#a58f5c', '#5e4e2a'] };
  const T_GOON = { ...T_CRIM, a: ['#f26a78', '#b81f33', '#5c0c1a'], b: ['#9ea3ad', '#60646c', '#26282e'] };
  function minionCoin(team, ranged, R = 18) { const hero = team === 0; return badge(`mn${team}${ranged ? 'r' : 'm'}`, R, -1, hero ? T_DEP : T_GOON, !hero, RANK[ranged ? 'ranged' : 'melee'], { rIn: .84, k: .82, metal: hero ? { l: '#c6d6ea', b: '#5a7296', d: '#1e2b40' } : { l: '#c26a74', b: '#5e1a26', d: '#1a080c' } }); }
  // Civilians are plain pale tokens with a person pictogram: no features, an everyday colour on the shoulders.
  const CIV_COL = ['#c7884a', '#6c9a78', '#b4667a', '#5f86b4'];
  function civCoin(v, R = 20) {
    v = v % 4; const col = CIV_COL[v];
    return badge('civ' + v, R, -1, T_CIV, false, (g, t) => { pl(g, ngon(0, -.42, .42, 8), t.a, { axis: 0, bev: .05, cast: 0 }); pl(g, [[-.74, .9], [-.74, .36], [-.4, .06], [.4, .06], [.74, .36], [.74, .9]], [mixH(col, '#ffffff', .4), col, mixH(col, '#000000', .5)], { axis: 0, bev: .05, cast: 0 }); }, { rIn: .86, k: .8, metal: { l: '#f2eee4', b: '#a39c8c', d: '#4a4438' } });
  }
  // Neutrals are bronze: gouges, a horned wedge, and for the Colossus a burning monolith.
  const BEAST = {
    mon(g, t) { for (const i of [-1, 0, 1]) pl(g, [[i * .42 + .28, -.92 + Math.abs(i) * .1], [i * .42 + .1, -.82], [i * .42 - .3, .92 - Math.abs(i) * .1], [i * .42 - .06, .34]], t.a, { axis: 0, bev: .04, split: .4 }); },
    big(g, t) { for (const s of [1, -1]) pl(g, [[s * .14, -.2], [s * .46, -.46], [s * .98, -1], [s * .94, -.32], [s * .62, .12], [s * .22, .22]], t.a, { axis: s > 0 ? 1.05 : -1.05 + TAU / 2 }); pl(g, [[-.36, .22], [.36, .22], [.26, .62], [0, .98], [-.26, .62]], t.b, { axis: 0 }); },
    boss(g, t) { pl(g, [[-.96, .96], [-.84, -.2], [-.5, .02], [-.42, -.7], [-.16, -.36], [0, -1.04], [.16, -.36], [.42, -.7], [.5, .02], [.84, -.2], [.96, .96]], t.b, { axis: 0, bev: .035 }); pl(g, [[-.05, -.66], [.14, -.14], [.03, .1], [.17, .46], [0, .96], [-.14, .46], [-.03, .1], [-.16, -.14]], t.a, { axis: 0, bev: .03 }); },
  };
  const T_BOSS = { ...T_NEUT, f: ['#0e0a09', '#201410'], h: '#a0481c', a: ['#fff0b8', '#ff9a3c', '#a03a10'], b: ['#6a6058', '#3a3430', '#141110'] };
  const monsterCoin = (big, boss) => boss
    ? badge('boss', 96, -1, T_BOSS, true, BEAST.boss, { rIn: .82, k: .68, metal: { l: '#e0b06a', b: '#5a3f22', d: '#140c06' } })
    : big ? badge('big', 44, -1, T_NEUT, true, BEAST.big, { rIn: .82, k: .68, metal: { l: '#d8b07c', b: '#7a5a34', d: '#2a1c0e' } })
      : badge('mon', 28, -1, T_NEUT, true, BEAST.mon, { rIn: .82, k: .78, metal: { l: '#c4b890', b: '#6a6248', d: '#26221a' } });

  // Older simple glyphs, still used for generic struck pieces.
  const star = (g, r1, r2, n, rot0 = 0) => { g.beginPath(); for (let i = 0; i < n * 2; i++) { const r = i % 2 ? r2 : r1, a = rot0 + i / (n * 2) * TAU; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); };
  const poly = (g, p) => { g.beginPath(); p.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.closePath(); g.fill(); };
  void star;
  const EMBLEM = {
    boss(g) { poly(g, [[-.92, .55], [-.98, -.5], [-.46, -.05], [0, -.92], [.46, -.05], [.98, -.5], [.92, .55]]); poly(g, [[-.82, .68], [.82, .68], [.8, .9], [-.8, .9]]); },
    minionMelee(g) { poly(g, [[0, -.9], [.72, -.1], [.72, .34], [0, -.34], [-.72, .34], [-.72, -.1]]); poly(g, [[0, .1], [.5, .58], [.5, .9], [0, .5], [-.5, .9], [-.5, .58]]); },
    minionRanged(g) { poly(g, [[0, -.9], [.8, 0], [0, .9], [-.8, 0]]); },
    monster(g) { poly(g, [[-.5, -.9], [-.1, -.8], [.5, .9], [.1, .8]]); },
    big(g) { poly(g, [[0, -.98], [.8, 0], [0, .98], [-.8, 0]]); },
    vesper(g) { poly(g, [[0, -.9], [.3, 0], [0, .9], [-.3, 0]]); }, kade(g) { poly(g, [[0, -1], [.14, .5], [-.14, .5]]); }, ione(g) { poly(g, [[0, -.9], [.2, -.2], [.9, 0], [.2, .2], [0, .9], [-.2, .2], [-.9, 0], [-.2, -.2]]); },
    solenne(g) { poly(g, [[-.8, .4], [.8, .4], [0, -.7]]); }, sable(g) { poly(g, [[.2, -1], [.5, 0], [.2, 1], [-.5, 0]]); }, gravel(g) { poly(g, [[-.8, -.8], [.8, -.8], [.8, .1], [0, .9], [-.8, .1]]); },
  };

  // Generic struck piece: gold pickups, core tops, projectiles and the title coins.
  function coin(key, R0, emblem, metal, team, tier = -1, emblemScale = .56) {
    const id = `${key}|${R0}|${team}|${tier}`; if (cache.has(id)) return cache.get(id);
    const R = R0, P = 3 + Math.ceil(R * .14), S = R * 2 + P * 2, c = cv(S, S), g = c.getContext('2d');
    g.translate(S / 2, S / 2); g.scale(R, R);
    const bright = metal[0], deep = metal[1], tone = [mixH(bright, '#ffffff', .5), bright, deep], inner = tier >= 0 ? .8 : .97;
    if (tier >= 0) drawRim(g, tier, false, inner);
    emboss(g, gg => { gg.moveTo(inner, 0); gg.arc(0, 0, inner, 0, TAU); gg.closePath(); }, tone, { bev: .07, axis: .8, split: .55 });
    const E = emblem && EMBLEM[emblem];
    if (E) { g.save(); g.scale(emblemScale, emblemScale); g.fillStyle = mixH(deep, INK, .6); g.strokeStyle = g.fillStyle; E(g); g.restore(); }
    specular(g, '#ffffff');
    const out = { c, R, P, S }; cache.set(id, out); return out;
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
  function drawEmblemIcon(g, name, x, y, r, col) { g.save(); g.translate(x, y); g.scale(r, r); g.fillStyle = col; g.strokeStyle = col; EMBLEM[name](g); g.restore(); }

  // ---------- ability icons: one clean white glyph per ability ----------
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
  function abilityCoin(champ, slot, on, R0 = 40, team = 0) {
    const id = `ab${champ}${slot}${on}${R0}${team}`; if (cache.has(id)) return cache.get(id);
    const R = R0 * 2, P = Math.round(R * .075), S = R * 2 + P * 2, c = cv(S, S), g = c.getContext('2d'), ult = slot === 2, villain = team === 1;
    const t = !on ? { f: ['#14161b', '#1d2027'], h: '#3a3f4a' } : villain ? (CHAR_T.villain[champ] || T_CRIM) : T_HERO;
    g.translate(S / 2, S / 2); g.scale(R, R); g.lineJoin = 'miter';
    const m = !on ? { l: '#7c828e', b: '#3f444e', d: '#17191e' } : ult ? (villain ? { l: t.a[0], b: t.a[1], d: t.a[2] } : RIM[3]) : { l: '#dbe2ec', b: '#7f8b9c', d: '#2c333e' };
    const ringT = gg => { edgeT(edge(ult && on ? 4 : 0, false))(gg); gg.moveTo(.84, 0); gg.arc(0, 0, .84, 0, TAU, true); gg.closePath(); };
    emboss(g, ringT, [m.l, m.b, m.d], { bev: .04, rule: 'evenodd', axis: .8, split: .9 });
    field(g, .84, t);
    g.save(); g.scale(.56, .56); const glyph = on ? (villain ? t.a[0] : '#fff6dc') : '#7f8590';
    // a cast shadow first, so the glyph sits proud of the field
    for (const [dx, dy, col] of [[.06, .08, 'rgba(0,0,0,.75)'], [0, 0, glyph]]) { g.save(); g.translate(dx, dy); g.fillStyle = g.strokeStyle = col; g.lineWidth = .17; g.lineCap = 'butt'; g.lineJoin = 'miter'; ICON[champ][slot](g); g.restore(); }
    g.restore();
    if (on) specular(g, '#ffffff');
    cache.set(id, c); return c;
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
  function dustCel(dark, v = 0) {
    const id = `dc${dark ? 1 : 0}${v % 3}`; if (cache.has(id)) return cache.get(id);
    const S = 96, c = cv(S, S), g = c.getContext('2d'), r = seeded(v * 37 + (dark ? 91 : 13)), P_ = [];
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU, d = 28 + r() * 16; P_.push([48 + Math.cos(a) * d, 48 + Math.sin(a) * d * .7]); }
    g.fillStyle = dark ? 'rgba(10,12,20,.55)' : 'rgba(120,132,150,.3)'; polyT(P_)(g); g.fill();
    g.fillStyle = dark ? 'rgba(40,44,58,.5)' : 'rgba(176,186,200,.28)'; g.save(); g.beginPath(); P_.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](48 + (x - 48) * .62 - 6, 48 + (y - 48) * .62 - 5)); g.closePath(); g.fill(); g.restore();
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

  return { TEAM, TEAM_DARK, METAL, TILT, TAU, INK, champCoin, minionCoin, monsterCoin, civCoin, coin, glow, shadow, drawEmblemIcon, abilityCoin, iconURL, sheen, vignette, seeded, mix, mixH, cv, reed, puff, leaf, shardsOf, impact, speedLines, sparkSp, dustCel, chip, glint, pillar, hazard, koCoin };
})();
