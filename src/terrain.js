// The map: painted once in a dark-deco style (deep shadow shapes, a few rich tones, thin metal inlay), plus sprites for raised scenery.
const Terrain = (() => {
  const { TILT, TAU, cv, seeded, mixH } = Art;
  const INK = '#07090e', SS = 1.5, HALF = 104;
  const HERO = { deep: '#10203a', mid: '#1c3254', steel: '#8fa3bc', gold: '#e6d19c', goldDk: '#8a6f3e', glow: '#ffdf9e', white: '#f6efdc' };
  const VIL = { deep: '#141418', mid: '#23242b', steel: '#6e7380', crim: '#c8243a', crimDk: '#6e1020', glow: '#ff4a5c', acid: '#b6ec3a' };
  function spline(pts, n = 12) {
    const o = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
      for (let k = 0; k < n; k++) { const t = k / n, t2 = t * t, t3 = t2 * t; o.push([0, 1].map(a => .5 * ((2 * p1[a]) + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3))); }
    }
    o.push(pts[pts.length - 1]); return o;
  }
  // A canvas in world units, supersampled so sprites stay crisp on a 2x phone screen.
  function mk(w, h) { const c = cv(Math.ceil(w * SS), Math.ceil(h * SS)), g = c.getContext('2d'); g.scale(SS, SS); g.lineJoin = 'miter'; g.lineCap = 'butt'; return { c, g, w, h }; }
  const poly = (g, p) => { g.beginPath(); p.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.closePath(); };
  const fillP = (g, p, col) => { poly(g, p); g.fillStyle = col; g.fill(); };
  const octa = (R, n = 8, rot = TAU / 16) => { const o = []; for (let i = 0; i < n; i++) { const a = rot + i / n * TAU; o.push([Math.cos(a) * R, Math.sin(a) * R]); } return o; };

  function paint(map, towers, GS, sites = [], mood = 0) {
    const W = map.W, Ht = Math.ceil(map.H * TILT), c = cv(W * GS, Ht * GS), g = c.getContext('2d'), r = seeded(90210), Y = y => y * TILT;
    g.scale(GS, GS); g.imageSmoothingQuality = 'high'; g.lineCap = 'butt'; g.lineJoin = 'miter';
    const center = map.center || { x: W / 2, y: map.H / 2 }, plazas = map.plazas || [], fountains = map.fountains || [];

    // Night ground: near-black slate, cut by long diagonal shafts of shadow and low light.
    g.fillStyle = '#10151d'; g.fillRect(0, 0, W, Ht);
    const shaft = (x, w, col) => { const d = Ht * .62; g.fillStyle = col; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + w, 0); g.lineTo(x + w - d, Ht); g.lineTo(x - d, Ht); g.closePath(); g.fill(); };
    for (let x = -200; x < W + Ht; x += 180 + r() * 340) shaft(x, 120 + r() * 240, r() > .5 ? '#0d1219' : '#131922');
    // Quiet ground texture: long thin scratches and sparse pale flecks, nothing busy.
    g.strokeStyle = 'rgba(160,178,200,.05)'; g.lineWidth = 1.2; g.beginPath();
    for (let i = 0; i < 260; i++) { const x = r() * W, y = r() * Ht, l = 20 + r() * 70; g.moveTo(x, y); g.lineTo(x - l * .62, y + l * .46); } g.stroke();

    // River first, so the roads and bridges lie over it.
    const riverPts = map.river || [[W / 2, -80], [W / 2, map.H + 80]], cen = spline(riverPts, 18), path = new Path2D(); cen.forEach(([x, y], i) => path[i ? 'lineTo' : 'moveTo'](x, Y(y)));
    g.lineCap = 'round'; g.lineJoin = 'round';
    const bank = (w, col) => { g.strokeStyle = col; g.lineWidth = w; g.stroke(path); };
    bank(HALF * 2 + 26, '#050709'); bank(HALF * 2 + 10, '#3a4656'); bank(HALF * 2, '#091624'); bank(HALF * 2 - 56, '#0c1e30'); bank(HALF * 2 - 124, '#102738');
    const flow = cen.map(([x, y], i) => { const a = cen[Math.max(0, i - 1)], b = cen[Math.min(cen.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, tx = dx / l, ty = dy / l; return { x, y, tx, ty, nx: -ty, ny: tx, a: Math.atan2(ty * TILT, tx) - Math.PI / 2 }; });
    // Moonlight on the water: a few long fine strokes along the current.
    for (let i = 0; i < 46; i++) { const p = flow[r() * flow.length | 0], o = (r() - .5) * (HALF * 1.6), x = p.x + p.nx * o, y = Y(p.y + p.ny * o), len = 40 + r() * 110; g.strokeStyle = r() > .6 ? 'rgba(120,180,214,.34)' : 'rgba(70,120,150,.32)'; g.lineWidth = 1.4; g.lineCap = 'butt'; g.beginPath(); g.moveTo(x - p.tx * len, y - p.ty * len * TILT); g.lineTo(x + p.tx * len, y + p.ty * len * TILT); g.stroke(); }
    const table = []; for (let y = -80; y <= map.H + 80; y += 20) { let bx = 0, bd = 1e9; for (const [x, yy] of cen) { const d = Math.abs(yy - y); if (d < bd) { bd = d; bx = x; } } table.push(bx); }
    const riverX = y => table[Math.max(0, Math.min(table.length - 1, Math.round((y + 80) / 20)))];

    // Roads: dark polished stone with a fine metal kerb and a sparse inlay down the middle.
    const roads = map.lanes.map(l => spline(l, 16));
    if (plazas.length >= 2) { const a = plazas[0], b = plazas[1]; roads.push([[a.x, a.y], [b.x, b.y]]); }
    const ROAD = 118, roadPaths = roads.map(pts => { const p = new Path2D(); pts.forEach(([x, y], i) => p[i ? 'lineTo' : 'moveTo'](x, Y(y))); return p; });
    const inlay = mood ? 'rgba(200,60,78,.42)' : 'rgba(214,190,128,.42)';
    roadPaths.forEach((p, ri) => {
      const pts = roads[ri], st = (w, col) => { g.strokeStyle = col; g.lineWidth = w; g.stroke(p); };
      g.lineCap = 'round'; g.lineJoin = 'round';
      st(ROAD * 2 + 22, '#080b10'); st(ROAD * 2 + 8, '#4b5566'); st(ROAD * 2, '#1b212c'); st(ROAD * 2 - 30, '#212835'); st(ROAD * 2 - 118, '#262e3c');
      // inlay marks at a steady stride
      let along = 0; g.lineCap = 'butt';
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i], d = Math.hypot(bx - ax, Y(by) - Y(ay)), ux = (bx - ax) / (d || 1), uy = (Y(by) - Y(ay)) / (d || 1);
        for (let s = 0; s < d; s += 8) {
          if (Math.floor((along + s) / 260) === Math.floor((along + s - 8) / 260)) continue;
          const x = ax + ux * s, y = Y(ay) + uy * s;
          g.strokeStyle = inlay; g.lineWidth = 2; g.beginPath(); g.moveTo(x - uy * 34 - ux * 8, y + ux * 34 - uy * 8); g.lineTo(x + ux * 8, y + uy * 8); g.lineTo(x + uy * 34 - ux * 8, y - ux * 34 - uy * 8); g.stroke();
        }
        along += d;
      }
    });
    // Bridges: a stone deck with thin parapets where each road crosses the water.
    const bridges = (map.bridges && map.bridges.length) ? map.bridges : [];
    for (const b of bridges) {
      const yc = Y(b.y), SPAN = HALF + 28, x0 = b.x - SPAN, w = SPAN * 2, HW = 124;
      g.fillStyle = '#1e2531'; g.fillRect(x0, yc - HW, w, HW * 2);
      g.strokeStyle = 'rgba(8,10,16,.8)'; g.lineWidth = 2; g.beginPath(); for (let x = x0 + 16; x < x0 + w; x += 32) { g.moveTo(x, yc - HW + 8); g.lineTo(x, yc + HW - 8); } g.stroke();
      for (const o of [-HW, HW]) { g.fillStyle = '#05070b'; g.fillRect(x0 - 4, yc + o - 7, w + 8, 16); g.fillStyle = '#5c6778'; g.fillRect(x0 - 2, yc + o - 6, w + 4, 3); for (let x = x0; x <= x0 + w; x += 64) { g.fillStyle = '#6a768a'; g.fillRect(x - 3, yc + o - 12, 6, 16); } }
    }

    const at = (x, y, fn) => { g.save(); g.translate(x, Y(y)); g.scale(1, TILT); g.lineJoin = 'miter'; g.lineCap = 'butt'; fn(); g.restore(); };
    const ring = (R, col, lw, n = 0) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); if (n) { const p = octa(R, n); p.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.closePath(); } else g.arc(0, 0, R, 0, TAU); g.stroke(); };
    const disc = (R, col, n = 0) => { g.fillStyle = col; g.beginPath(); if (n) { const p = octa(R, n); p.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.closePath(); } else g.arc(0, 0, R, 0, TAU); g.fill(); };
    // Fine radial inlay between two radii.
    const flutes = (n, r0, r1, col, lw = 1.6) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); for (let i = 0; i < n; i++) { const a = i / n * TAU + TAU / (n * 2); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); } g.stroke(); };

    // Plazas: octagons of dark stone with a metal inlay. Hero HQ is navy and pale gold, Villain Lair black and crimson.
    for (const p of plazas) {
      const R = p.r;
      if (p.kind === 'base' && p.team === 0) at(p.x, p.y, () => { disc(R + 10, '#05080e', 8); disc(R, '#0f1b2f', 8); ring(R - 8, HERO.steel, 2.5, 8); disc(R - 60, '#132440', 8); ring(R - 60, HERO.goldDk, 2, 8); flutes(48, R - 150, R - 60, 'rgba(230,209,156,.14)'); ring(R - 150, HERO.gold, 3); disc(R - 156, '#16294a'); ring(R - 260, 'rgba(143,163,188,.5)', 2); });
      else if (p.kind === 'base') at(p.x, p.y, () => { disc(R + 10, '#040406', 8); disc(R, '#14131a', 8); ring(R - 8, '#6e1020', 2.5, 8); disc(R - 60, '#191820', 8); ring(R - 60, '#8c1a2c', 2, 8); flutes(36, R - 150, R - 60, 'rgba(200,36,58,.16)'); ring(R - 150, VIL.crim, 3); disc(R - 156, '#1d1a22'); ring(R - 260, 'rgba(200,36,58,.45)', 2); });
      else at(p.x, p.y, () => { disc(R + 8, '#06080c', 8); disc(R, '#1a202b', 8); ring(R - 8, '#5a6678', 2.5, 8); disc(R - 56, '#202733', 8); flutes(40, R - 150, R - 56, 'rgba(180,194,214,.12)'); ring(R - 150, '#70809a', 2.5); disc(R - 156, '#242c3a'); ring(R - 240, 'rgba(230,209,156,.5)', 2); });
    }
    // Fountains: the healing ground, ringed so it reads from the edge of the screen.
    const fR = map.fountainR || 300;
    fountains.forEach((f, i) => at(f.x, f.y, () => { const col = i ? VIL.glow : HERO.glow; ring(fR, i ? 'rgba(255,74,92,.55)' : 'rgba(255,223,158,.55)', 3); g.setLineDash([26, 18]); ring(fR - 14, i ? 'rgba(255,74,92,.28)' : 'rgba(255,223,158,.28)', 2); g.setLineDash([]); disc(150, i ? '#20151c' : '#18284a', 8); ring(150, col, 3, 8); disc(84, i ? '#2c1a22' : '#203860', 8); ring(84, col, 2, 8); }));
    // Civilian squares: small tiled octagons with a pale edge.
    for (const site of sites) at(site.x, site.y, () => { disc(128, '#080a10', 8); disc(120, '#1e2430', 8); ring(120, '#667286', 2, 8); disc(92, '#262e3c', 8); ring(58, 'rgba(230,209,156,.22)', 1.6, 8); });
    // Tower plinths ringed in the owner's colour.
    for (const t of towers) { const R = t.sub === 'core' ? 96 : 66, col = t.team ? VIL.crim : HERO.gold; at(t.x, t.y, () => { disc(R + 8, '#06070c', 8); disc(R, t.team ? '#18161c' : '#16233c', 8); ring(R - 8, col, 3, 8); disc(R - 18, t.team ? '#101014' : '#0f1a2e', 8); }); }

    // Brush: angular thickets, a shade greener and lighter than the ground around them.
    map.brush.forEach((b, i) => brushBed(g, b, i % 3 + 1, Y));
    // Hard cast shadows from the cliffs, all falling the same way as the shafts of light.
    g.fillStyle = 'rgba(2,3,6,.62)';
    for (const w of map.walls) if (!w.big) { const y0 = Y(w.y + w.h), L = 58, dx = -L * .7; g.beginPath(); g.moveTo(w.x, y0); g.lineTo(w.x + w.w, y0); g.lineTo(w.x + w.w + dx, y0 + L); g.lineTo(w.x + dx, y0 + L); g.closePath(); g.fill(); }
    for (const t of towers) { const R = t.sub === 'core' ? 64 : 42; g.beginPath(); g.moveTo(t.x - R * .8, Y(t.y)); g.lineTo(t.x + R * .8, Y(t.y)); g.lineTo(t.x + R * .8 - 150, Y(t.y) + 118); g.lineTo(t.x - R * .8 - 150, Y(t.y) + 118); g.closePath(); g.fill(); }
    // Forests and the outer margin fall into solid black.
    g.fillStyle = '#05070b';
    for (const w of map.walls) if (w.big) { g.beginPath(); g.moveTo(w.x - 10, Y(w.y) - 10); g.lineTo(w.x + w.w + 26, Y(w.y) - 10); g.lineTo(w.x + w.w + 10, Y(w.y + w.h) + 14); g.lineTo(w.x - 10, Y(w.y + w.h) + 22); g.closePath(); g.fill(); }
    g.fillStyle = '#05070b'; g.fillRect(0, 0, W, Y(112)); g.fillRect(0, Ht - Y(112), W, Y(112)); g.fillRect(0, 0, 44, Ht); g.fillRect(W - 44, 0, 44, Ht);
    g.strokeStyle = '#2a3442'; g.lineWidth = 2; g.strokeRect(46, Y(112), W - 92, Ht - Y(224));

    const plaza = plazas.find(p => p.kind === 'centre') || { x: center.x, y: center.y, r: 300 };
    const water = (x, y) => Math.abs(x - riverX(y)) < HALF && Math.hypot(x - plaza.x, y - plaza.y) > plaza.r && !bridges.some(b => Math.abs(y - b.y) < 132 && Math.abs(x - b.x) < 240);

    // Slice into tiles: every phone can hold these as textures, and a frame only touches the few on screen.
    const TILE = 1800, tiles = [], OV = 2;
    for (let py = 0; py < c.height; py += TILE) for (let px = 0; px < c.width; px += TILE) {
      const x0 = Math.max(0, px - OV), y0 = Math.max(0, py - OV), tw = Math.min(c.width - x0, TILE + OV * 2), th = Math.min(c.height - y0, TILE + OV * 2), t = cv(tw, th);
      t.getContext('2d').drawImage(c, x0, y0, tw, th, 0, 0, tw, th);
      tiles.push({ c: t, x: x0 / GS, y: y0 / GS, w: tw / GS, h: th / GS });
    }
    c.width = c.height = 1; // let the big canvas go
    return { tiles, W, H: Ht, scale: GS, riverX, water, flow, plaza, bridges, center };
  }
  // Light pools baked into the ground, so street lights cost nothing per frame.
  function bake(gd, list) {
    for (const t of gd.tiles) {
      const g = t.c.getContext('2d'); g.setTransform(gd.scale, 0, 0, gd.scale, -t.x * gd.scale, -t.y * gd.scale); g.globalCompositeOperation = 'lighter';
      for (const L of list) {
        const R = L.r, X = L.x, Y2 = L.y * TILT; if (X + R < t.x || X - R > t.x + t.w || Y2 + R < t.y || Y2 - R > t.y + t.h) continue;
        g.globalAlpha = L.a; g.drawImage(pool(L.col), X - R, Y2 - R * .74, R * 2, R * 1.48);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.setTransform(1, 0, 0, 1, 0, 0);
    }
  }
  function nearRoad(map, x, y) { let b = 1e9; for (const L of map.lanes) for (let i = 1; i < L.length; i++) { const [ax, ay] = L[i - 1], [bx, by] = L[i], dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))); b = Math.min(b, Math.hypot(x - ax - dx * t, y - ay - dy * t)); } return b; }

  const cache = new Map();
  const once = (id, fn) => { if (!cache.has(id)) cache.set(id, fn()); return cache.get(id); };

  // ---------- cliffs: dark angular masses with one lit edge ----------
  function cliff(w) {
    return once(`c${w.w}x${w.h}`, () => {
      const lift = 58, P = 14, ch = Math.min(22, Math.min(w.w, w.h) * .26), th = w.h * TILT, tw = w.w + P * 2, H = th + lift + P * 2 + 10, { c, g } = mk(tw, H), x0 = P, x1 = P + w.w, y0 = P, y1 = P + th, cy = ch * TILT;
      const top = [[x0 + ch, y0], [x1 - ch, y0], [x1, y0 + cy], [x1, y1 - cy], [x1 - ch, y1], [x0 + ch, y1], [x0, y1 - cy], [x0, y0 + cy]];
      const front = [[x0, y1 - cy], [x0 + ch, y1], [x1 - ch, y1], [x1, y1 - cy], [x1, y1 - cy + lift], [x1 - ch, y1 + lift], [x0 + ch, y1 + lift], [x0, y1 - cy + lift]];
      fillP(g, front, '#0a0d13');
      // the right-hand chamfer sits in shade, the left catches a little light
      fillP(g, [[x0, y1 - cy], [x0 + ch, y1], [x0 + ch, y1 + lift], [x0, y1 - cy + lift]], '#232a36');
      fillP(g, [[x1 - ch, y1], [x1, y1 - cy], [x1, y1 - cy + lift], [x1 - ch, y1 + lift]], '#05070b');
      // vertical flutes down the face
      g.fillStyle = '#141923'; for (let x = x0 + ch + 16; x < x1 - ch - 8; x += 28) g.fillRect(x, y1 + 4, 8, lift - 12);
      fillP(g, top, '#1a212d');
      // a slab shifted toward the light, for a two-tone top
      g.save(); poly(g, top); g.clip(); fillP(g, [[x0 - 4, y0 - 4], [x0 + w.w * .62, y0 - 4], [x0 + w.w * .28, y1 + 4], [x0 - 4, y1 + 4]], '#232b39'); g.restore();
      poly(g, top); g.strokeStyle = '#05070b'; g.lineWidth = 3; g.stroke();
      // the lit edge
      g.strokeStyle = '#8a97ac'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(x0, y1 - cy); g.lineTo(x0, y0 + cy); g.lineTo(x0 + ch, y0); g.lineTo(x1 - ch, y0); g.stroke();
      g.strokeStyle = '#3a4556'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x0 + ch, y1); g.lineTo(x1 - ch, y1); g.stroke();
      return { c, w: tw, h: H, lift, P };
    });
  }

  // ---------- trees: tall black cypress and faceted oaks, one lit side ----------
  function tree(v) {
    return once('t' + (v % 4), () => {
      const type = v % 4, W0 = 92, H0 = type < 2 ? 190 : 150, { c, g } = mk(W0, H0), cx = W0 / 2, base = H0 - 10, r = seeded(v * 71 + 9);
      g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.ellipse(cx - 8, base + 1, 28, 8, 0, 0, TAU); g.fill();
      fillP(g, [[cx - 4, base], [cx + 4, base], [cx + 3, base - 40], [cx - 3, base - 40]], '#0a0c10');
      const col = [['#0f1f20', '#1a3433', '#2c5450'], ['#101c24', '#1a2e38', '#31505e'], ['#141c1a', '#223128', '#3c5442'], ['#121a22', '#1f2c36', '#3a5062']][type];
      if (type < 2) {
        const hw = 26 + r() * 6, top = 8, mid = base - 34, tall = mid - top;
        const body = [[cx, top], [cx + hw * .55, top + tall * .3], [cx + hw, mid - tall * .18], [cx + hw * .6, mid], [cx - hw * .6, mid], [cx - hw, mid - tall * .18], [cx - hw * .55, top + tall * .3]];
        fillP(g, body, col[0]);
        g.save(); poly(g, body); g.clip(); fillP(g, [[cx, top - 4], [cx - hw - 4, top], [cx - hw - 4, mid + 4], [cx - 4, mid + 4]], col[1]);
        g.strokeStyle = col[2]; g.lineWidth = 1.6; g.beginPath(); g.moveTo(cx - 1, top + 6); g.lineTo(cx - hw * .9, mid - tall * .18); g.stroke(); g.restore();
      } else {
        const R = 40, cy = base - 62, n = 9, o = []; for (let i = 0; i < n; i++) { const a = i / n * TAU - .3, d = R * (.78 + r() * .32); o.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * .9]); }
        fillP(g, o, col[0]);
        g.save(); poly(g, o); g.clip(); fillP(g, [[cx - 60, cy - 70], [cx + 16, cy - 70], [cx - 16, cy + 70], [cx - 60, cy + 70]], col[1]); fillP(g, [[cx - 60, cy - 70], [cx - 18, cy - 70], [cx - 36, cy + 2], [cx - 60, cy + 12]], col[2]); g.restore();
      }
      return { c, w: W0, h: H0, ax: cx, ay: base };
    });
  }
  // A brush zone lies flat: an angular edge, two deep greens and a fringe of blades along the back.
  function brushBed(g, b, seed, Y) {
    const r = seeded(seed * 31 + 3), cy = Y(b.y), k = TILT, n = Math.max(12, Math.round(b.r / 9));
    const edge = R => { const o = []; for (let i = 0; i < n; i++) { const a = i / n * TAU, d = R * (i % 2 ? .93 : 1.05); o.push([b.x + Math.cos(a) * d, cy + Math.sin(a) * d * k]); } return o; };
    fillP(g, edge(b.r + 8), '#06100e'); fillP(g, edge(b.r), '#14342b'); fillP(g, edge(b.r * .72), '#1a4235');
    // a fine diagonal hatch, the only detail on the bed
    g.save(); poly(g, edge(b.r * .96)); g.clip(); g.strokeStyle = 'rgba(70,140,110,.18)'; g.lineWidth = 1.2; g.beginPath(); for (let x = b.x - b.r * 1.4; x < b.x + b.r * 1.4; x += 15) { g.moveTo(x, cy - b.r); g.lineTo(x - b.r * .5, cy + b.r); } g.stroke(); g.restore();
    const blades = Math.round(b.r / 8); g.fillStyle = '#245a4a'; g.beginPath();
    for (let i = 0; i <= blades; i++) { const a = Math.PI + i / blades * Math.PI, x = b.x + Math.cos(a) * b.r * .98, y = cy + Math.sin(a) * b.r * k * .98, h = 8 + r() * 7; g.moveTo(x - 5, y + 2); g.lineTo(x + 1, y - h); g.lineTo(x + 4, y + 2); g.closePath(); } g.fill();
  }

  // ---------- street furniture ----------
  function lantern(red = false) {
    return once(red ? 'lanR' : 'lan', () => {
      const { c, g } = mk(40, 110), lit = red ? '#ff5a6a' : '#ffe2a8', hot = red ? '#ffd9dc' : '#fff8e4';
      g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.ellipse(18, 102, 12, 4, 0, 0, TAU); g.fill();
      fillP(g, [[15, 100], [25, 100], [23, 92], [17, 92]], '#3a4250');
      fillP(g, [[18, 92], [22, 92], [22, 40], [18, 40]], '#2a303c'); g.fillStyle = '#5a6678'; g.fillRect(18, 40, 1.4, 52);
      fillP(g, [[10, 26], [30, 26], [26, 40], [14, 40]], '#1a1f28');
      fillP(g, [[12, 8], [20, 2], [28, 8], [28, 24], [12, 24]], lit);
      fillP(g, [[20, 2], [28, 8], [28, 24], [20, 24]], red ? '#c8243a' : '#c9a860');
      fillP(g, [[16, 10], [20, 6], [20, 22], [16, 22]], hot);
      fillP(g, [[9, 8], [20, -2], [31, 8]], '#2a303c');
      return { c, w: 40, h: 110, ax: 20, ay: 100, lightY: 90 };
    });
  }
  function pillar() {
    return once('pil', () => {
      const { c, g } = mk(56, 150), cx = 28, base = 142;
      g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.ellipse(cx - 6, base + 1, 22, 7, 0, 0, TAU); g.fill();
      fillP(g, [[cx - 20, base], [cx + 20, base], [cx + 15, base - 14], [cx - 15, base - 14]], '#242b37');
      fillP(g, [[cx, 6], [cx + 12, 30], [cx + 12, base - 14], [cx - 12, base - 14], [cx - 12, 30]], '#1a212d');
      fillP(g, [[cx, 6], [cx - 12, 30], [cx - 12, base - 14], [cx - 2, base - 14], [cx - 2, 30]], '#333e4e');
      fillP(g, [[cx, 16], [cx + 6, 36], [cx, 56], [cx - 6, 36]], '#ffdf9e');
      return { c, w: 56, h: 150, ax: cx, ay: base, lightY: 110 };
    });
  }
  // ---------- buildings: stepped deco towers. `L` is an overlay of the window glass ----------
  function house(v, side = 0) {
    return once('h' + v + 's' + side, () => {
      const type = v % 4, W0 = 120, H0 = [170, 220, 150, 260][type], { c, g } = mk(W0, H0), L = mk(W0, H0), l = L.g, base = H0 - 10, cx = W0 / 2, glass = side ? (v % 2 ? '#ff5a6a' : '#c8ef5a') : '#ffd98a';
      const body = side ? '#16171d' : '#14233c', lit = side ? '#2c2e38' : '#26416a', shade = side ? '#0a0a0e' : '#0a1422', trim = side ? '#6e1020' : '#8a6f3e', pane = '#05070b', r = seeded(v * 19 + 3 + side * 7);
      g.fillStyle = 'rgba(0,0,0,.6)'; g.beginPath(); g.ellipse(cx - 14, base + 2, 50, 10, 0, 0, TAU); g.fill();
      // up to three setbacks, each one narrower, each split into a lit and a shaded half
      const stages = type === 3 ? [[46, 96], [34, 180], [20, 234]] : type === 1 ? [[44, 112], [30, 196]] : type === 2 ? [[50, 70], [34, 124]] : [[46, 90], [30, 146]];
      let y = base, chimX = 0, chimZ = 0;
      const win = (x, yy, w, h) => { g.fillStyle = pane; g.fillRect(x, yy, w, h); l.fillStyle = glass; if (r() > .22) l.fillRect(x + .6, yy + .6, w - 1.2, h - 1.2); };
      stages.forEach(([hw, top], i) => {
        const yt = base - top; fillP(g, [[cx - hw, y], [cx + hw, y], [cx + hw, yt], [cx - hw, yt]], body);
        fillP(g, [[cx - hw, y], [cx - hw * .25, y], [cx - hw * .25, yt], [cx - hw, yt]], lit);
        fillP(g, [[cx + hw * .55, y], [cx + hw, y], [cx + hw, yt], [cx + hw * .55, yt]], shade);
        g.fillStyle = trim; g.fillRect(cx - hw - 2, yt, hw * 2 + 4, 2.4);
        // tall window piers
        const cols = Math.max(2, Math.floor(hw / 11)); for (let k = 0; k < cols; k++) { const x = cx - hw + 7 + k * ((hw * 2 - 14) / cols); for (let yy = yt + 8; yy < y - 12; yy += 15) win(x, yy, 5, 10); }
        y = yt; chimX = hw * .5; chimZ = base - yt;
      });
      // a spire on the tallest
      const last = stages[stages.length - 1], sw = last[0] * .5;
      fillP(g, [[cx - sw, y], [cx + sw, y], [cx + 2, y - 44], [cx - 2, y - 44]], type === 3 ? '#1f2a3a' : (side ? '#1a1b22' : '#1c2c48')); fillP(g, [[cx - sw, y], [cx - 1, y], [cx - 1, y - 44], [cx - 2, y - 44]], lit);
      if (type !== 2) { g.fillStyle = side ? VIL.crim : HERO.gold; g.fillRect(cx - 1, y - 62, 2, 20); }
      return { c, L: L.c, w: W0, h: H0, ax: cx, ay: base, chimX: chimX, chimZ: chimZ, tall: H0, glass };
    });
  }
  function hq(team) {
    return once('hq' + team, () => {
      const W0 = 300, H0 = 430, { c, g } = mk(W0, H0), L = mk(W0, H0), l = L.g, ax = W0 / 2, ay = H0 - 16;
      g.fillStyle = 'rgba(0,0,0,.65)'; g.beginPath(); g.ellipse(ax - 20, ay + 2, 140, 22, 0, 0, TAU); g.fill();
      const slab = (x0, x1, y0, y1, a, b) => { fillP(g, [[x0, y1], [x1, y1], [x1, y0], [x0, y0]], a); fillP(g, [[x0, y1], [x0 + (x1 - x0) * .36, y1], [x0 + (x1 - x0) * .36, y0], [x0, y0]], b); };
      const win = (x, y, w, h, col) => { g.fillStyle = '#05070b'; g.fillRect(x, y, w, h); l.fillStyle = col; l.fillRect(x + .8, y + .8, w - 1.6, h - 1.6); };
      if (team === 0) {
        // Hero HQ: a stepped tower with gold fins and a beacon.
        const col = '#14233c', litc = '#2c4a78';
        slab(28, 272, ay - 110, ay, col, litc); slab(70, 230, ay - 240, ay - 110, col, litc); slab(106, 194, ay - 340, ay - 240, col, litc);
        g.fillStyle = HERO.gold; for (const [x0, x1, y] of [[24, 276, ay - 112], [66, 234, ay - 242], [102, 198, ay - 342]]) g.fillRect(x0, y, x1 - x0, 3);
        // vertical gold fins up the centre
        g.fillStyle = HERO.goldDk; for (let i = -2; i <= 2; i++) g.fillRect(ax + i * 16 - 1.5, ay - 330, 3, 320);
        for (let x = 44; x < 250; x += 22) if (Math.abs(x - ax) > 40) for (const y of [ay - 96, ay - 66, ay - 36]) win(x, y, 11, 18, '#ffdf9e');
        for (let x = 84; x < 220; x += 22) if (Math.abs(x - ax) > 36) for (let y = ay - 226; y < ay - 124; y += 28) win(x, y, 10, 18, '#ffdf9e');
        for (let y = ay - 326; y < ay - 250; y += 26) { win(116, y, 10, 16, '#fff0c8'); win(174, y, 10, 16, '#fff0c8'); }
        fillP(g, [[ax - 44, ay - 340], [ax + 44, ay - 340], [ax + 10, ay - 396], [ax - 10, ay - 396]], '#1c3254'); fillP(g, [[ax - 44, ay - 340], [ax - 4, ay - 340], [ax - 4, ay - 396], [ax - 10, ay - 396]], '#35568a');
        g.fillStyle = HERO.gold; g.fillRect(ax - 1.5, ay - 410, 3, 16);
        l.fillStyle = '#fff0c8'; l.beginPath(); l.arc(ax, ay - 412, 6, 0, TAU); l.fill();
        // Gate
        fillP(g, [[ax - 30, ay], [ax - 30, ay - 62], [ax, ay - 92], [ax + 30, ay - 62], [ax + 30, ay]], '#080c14');
        l.fillStyle = '#ffdf9e'; poly(l, [[ax - 22, ay], [ax - 22, ay - 56], [ax, ay - 80], [ax + 22, ay - 56], [ax + 22, ay]]); l.fill();
      } else {
        // Villain Lair: a black wedge of spires with crimson slits.
        const fort = [[18, ay], [18, ay - 130], [52, ay - 170], [58, ay - 90], [92, ay - 250], [116, ay - 170], [150, ay - 410], [184, ay - 170], [208, ay - 250], [242, ay - 90], [248, ay - 170], [282, ay - 130], [282, ay]];
        fillP(g, fort, '#121217');
        // lit facets on the left of each spire
        for (const [a, b, c2] of [[[52, ay - 170], [58, ay - 90], [18, ay - 90]], [[92, ay - 250], [116, ay - 170], [70, ay - 120]], [[150, ay - 410], [150, ay - 170], [122, ay - 120]], [[208, ay - 250], [208, ay - 170], [186, ay - 120]], [[248, ay - 170], [248, ay - 90], [230, ay - 90]]]) fillP(g, [a, b, c2], '#2e2f3a');
        g.fillStyle = VIL.crimDk; g.fillRect(16, ay - 96, 268, 3);
        const slit = (x, y, h) => { g.fillStyle = '#050507'; poly(g, [[x, y], [x + 5, y + h * .5], [x, y + h], [x - 5, y + h * .5]]); g.fill(); l.fillStyle = VIL.glow; poly(l, [[x, y + 2], [x + 3.4, y + h * .5], [x, y + h - 2], [x - 3.4, y + h * .5]]); l.fill(); };
        slit(150, ay - 350, 70); slit(150, ay - 262, 56); slit(106, ay - 184, 50); slit(194, ay - 184, 50); for (const x of [60, 96, 204, 240]) slit(x, ay - 78, 54);
        // fanged gate
        fillP(g, [[ax - 36, ay], [ax - 30, ay - 68], [ax, ay - 96], [ax + 30, ay - 68], [ax + 36, ay]], '#060608');
        l.fillStyle = VIL.glow; poly(l, [[ax - 22, ay], [ax - 18, ay - 58], [ax, ay - 76], [ax + 18, ay - 58], [ax + 22, ay]]); l.fill();
      }
      return { c, L: L.c, w: W0, h: H0, ax, ay };
    });
  }
  function banner(team) {
    return once('ban' + team, () => {
      const col = team ? '#1a1218' : '#14233c', trim = team ? VIL.crim : HERO.gold, W0 = 72, H0 = 150, frames = [];
      for (let f = 0; f < 4; f++) {
        const { c, g } = mk(W0, H0), sway = x => Math.sin(x * .1 - f / 4 * TAU) * (x - 16) * .05;
        g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.ellipse(14, 142, 11, 4, 0, 0, TAU); g.fill();
        g.fillStyle = '#3a4250'; g.fillRect(12, 8, 3.5, 134);
        const top = 12, bot = 86, flag = [[16, top + sway(16)], [62, top + sway(62)], [62, bot - 18 + sway(62)], [39, bot + sway(39)], [16, bot - 18 + sway(16)]];
        fillP(g, flag, col);
        g.save(); poly(g, flag); g.clip(); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(40, 0, 40, H0); g.restore();
        poly(g, flag); g.strokeStyle = trim; g.lineWidth = 1.8; g.stroke();
        g.fillStyle = trim; poly(g, team ? [[39, 28 + sway(39)], [48, 48 + sway(39)], [39, 68 + sway(39)], [30, 48 + sway(39)]] : [[30, 30 + sway(39)], [48, 30 + sway(39)], [48, 34 + sway(39)], [30, 34 + sway(39)]]); g.fill();
        if (!team) { poly(g, [[39, 40 + sway(39)], [50, 62 + sway(39)], [39, 72 + sway(39)], [28, 62 + sway(39)]]); g.fill(); }
        frames.push(c);
      }
      return { c: frames[0], frames, w: W0, h: H0, ax: 14, ay: 142 };
    });
  }

  // ---------- towers ----------
  // One disc of a stack: a machined top over a thin dark side.
  function towerCoin(team, R) {
    return once(`tc${team}R${R}`, () => {
      const T = R * .3, ry = R * .72, W0 = R * 2 + 12, H0 = ry * 2 + T + 12, { c, g } = mk(W0, H0), cx = W0 / 2, cy = ry + 6, side = team ? '#0c0c10' : '#0a1426', top = team ? '#1c1d24' : '#16284a', lit = team ? '#3a3b48' : '#30507e', trim = team ? VIL.crim : HERO.gold;
      g.fillStyle = side; g.beginPath(); g.ellipse(cx, cy + T, R, ry, 0, 0, TAU); g.fill(); g.fillRect(cx - R, cy, R * 2, T);
      g.fillStyle = lit; g.fillRect(cx - R, cy + 1, R * .3, T * .9);
      g.fillStyle = top; g.beginPath(); g.ellipse(cx, cy, R, ry, 0, 0, TAU); g.fill();
      g.save(); g.beginPath(); g.ellipse(cx, cy, R, ry, 0, 0, TAU); g.clip(); g.fillStyle = lit; g.beginPath(); g.moveTo(cx - R, cy + ry); g.lineTo(cx + R * .2, cy - ry); g.lineTo(cx - R, cy - ry); g.closePath(); g.fill(); g.restore();
      g.strokeStyle = trim; g.lineWidth = 1.8; g.beginPath(); g.ellipse(cx, cy, R * .78, ry * .78, 0, 0, TAU); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,.8)'; g.lineWidth = 1.6; g.beginPath(); g.ellipse(cx, cy, R, ry, 0, 0, TAU); g.stroke();
      return { c, w: W0, h: H0, cx, cy };
    });
  }
  // The finial on a stack: Hero beacons a slim gold deco spire, Villain towers a black blade with a burning eye-slit.
  function towerCrown(team, core) {
    return once(`cr${team}${core ? 'c' : 't'}`, () => {
      const k = core ? 1.32 : 1, W0 = 96 * k, H0 = 110 * k, { c, g } = mk(W0, H0), cx = W0 / 2, base = H0 - 4;
      g.save(); g.translate(cx, base); g.scale(k, k);
      if (team === 0) {
        fillP(g, [[-26, 0], [26, 0], [20, -16], [-20, -16]], '#16284a'); fillP(g, [[-26, 0], [-8, 0], [-8, -16], [-20, -16]], '#30507e');
        for (const s of [-1, 1]) { fillP(g, [[s * 8, -16], [s * 22, -16], [s * 10, -70], [s * 8, -60]], s < 0 ? '#ecd9a6' : '#94742f'); }
        fillP(g, [[-7, -16], [7, -16], [3, -80], [-3, -80]], '#e6d19c'); fillP(g, [[0, -16], [7, -16], [3, -80], [0, -80]], '#94742f');
        fillP(g, [[0, -100], [6, -86], [0, -72], [-6, -86]], '#fff3cf');
      } else {
        fillP(g, [[-30, 0], [30, 0], [24, -14], [-24, -14]], '#16161c');
        fillP(g, [[-24, -14], [-32, -56], [-10, -30], [-6, -14]], '#2a2b35'); fillP(g, [[24, -14], [32, -56], [10, -30], [6, -14]], '#0e0e12');
        fillP(g, [[-11, -14], [11, -14], [0, -100]], '#1a1a22'); fillP(g, [[-11, -14], [0, -14], [0, -100]], '#34353f');
        fillP(g, [[0, -76], [5, -46], [0, -24], [-5, -46]], '#ff4a5c');
        fillP(g, [[0, -66], [2, -46], [0, -34], [-2, -46]], '#ffd9dc');
      }
      g.restore();
      return { c, w: W0, h: H0, ax: cx, ay: base };
    });
  }

  // ---------- small animated props ----------
  function wave(v) {
    return once('wv' + v % 3, () => {
      const len = [46, 34, 58][v % 3], { c, g } = mk(len * 2 + 8, 8), cy = 4;
      g.fillStyle = '#cfe6f2'; g.beginPath(); g.moveTo(4, cy); g.lineTo(len + 4, cy - 1.4); g.lineTo(len * 2 + 4, cy); g.lineTo(len + 4, cy + 1.4); g.closePath(); g.fill();
      return { c, w: len * 2 + 8, h: 8 };
    });
  }
  function spark() { return once('spk', () => { const { c, g } = mk(32, 32); g.fillStyle = '#ffffff'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, d = i % 2 ? 2.2 : 15; g[i ? 'lineTo' : 'moveTo'](16 + Math.cos(a) * d, 16 + Math.sin(a) * d); } g.closePath(); g.fill(); return { c, w: 32, h: 32 }; }); }
  function smoke(dark) {
    return once('sm' + (dark ? 1 : 0), () => {
      const c = cv(64, 64), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 32), col = dark ? '14,14,18' : '150,160,176';
      gr.addColorStop(0, `rgba(${col},.9)`); gr.addColorStop(.55, `rgba(${col},.42)`); gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      return { c, w: 64, h: 64 };
    });
  }
  // A small pale marker over a site with people waiting.
  function bubble() {
    return once('bub', () => {
      const { c, g } = mk(30, 40), cx = 15;
      fillP(g, [[cx, 2], [26, 16], [cx, 34], [4, 16]], '#07090e');
      fillP(g, [[cx, 6], [23, 16], [cx, 29], [7, 16]], '#f2e7cc');
      fillP(g, [[cx - 2.2, 10], [cx + 2.2, 10], [cx + 1.3, 19], [cx - 1.3, 19]], '#101420'); g.fillStyle = '#101420'; g.fillRect(cx - 1.4, 21, 2.8, 3);
      return { c, w: 30, h: 40 };
    });
  }
  // Soft on purpose: used additively for street light and spot light.
  function pool(col) {
    return once('pl' + col, () => {
      const c = cv(96, 96), g = c.getContext('2d'), gr = g.createRadialGradient(48, 48, 0, 48, 48, 48), rgb = [1, 3, 5].map(i => parseInt(col.slice(i, i + 2), 16)).join(',');
      gr.addColorStop(0, `rgba(${rgb},.9)`); gr.addColorStop(.42, `rgba(${rgb},.55)`); gr.addColorStop(.8, `rgba(${rgb},.1)`); gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr; g.fillRect(0, 0, 96, 96);
      return c;
    });
  }
  return { paint, bake, cliff, tree, lantern, pillar, banner, house, hq, towerCoin, towerCrown, wave, spark, smoke, bubble, pool, nearRoad, spline, HALF, INK };
})();
