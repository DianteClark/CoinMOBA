// The map: painted once to a large canvas in cel-shaded comic style, plus sprites for raised scenery.
const Terrain = (() => {
  const { TILT, TAU, cv, seeded } = Art;
  const INK = '#15112b', SS = 1.6;
  const HERO = { ultra: '#2447ff', deep: '#14298f', sky: '#74b6ff', sun: '#ffd21f', sunDk: '#f0931a', white: '#fffdf2' };
  const VIL = { violet: '#6a2bd9', deep: '#2b1457', night: '#180c30', toxic: '#8dff2a', toxicDk: '#3fb31e', blood: '#ff5a1f' };
  function spline(pts, n = 12) {
    const o = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
      for (let k = 0; k < n; k++) { const t = k / n, t2 = t * t, t3 = t2 * t; o.push([0, 1].map(a => .5 * ((2 * p1[a]) + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3))); }
    }
    o.push(pts[pts.length - 1]); return o;
  }
  const RIVER = [[1540, -80], [1680, 300], [1500, 620], [1600, 950], [1700, 1280], [1520, 1600], [1660, 1980]];
  const HALF = 92;

  // A canvas in world units, supersampled so sprites stay crisp on a 2x phone screen.
  function mk(w, h) { const c = cv(Math.ceil(w * SS), Math.ceil(h * SS)), g = c.getContext('2d'); g.scale(SS, SS); g.lineJoin = 'round'; g.lineCap = 'round'; return { c, g, w, h }; }
  // An organic closed shape, appended to the current path.
  function blob(g, x, y, R, r, sy = 1, n = 11) {
    const p = []; for (let i = 0; i < n; i++) { const a = i / n * TAU, d = R * (.72 + r() * .46); p.push([x + Math.cos(a) * d, y + Math.sin(a) * d * sy]); }
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], s = mid(p[n - 1], p[0]);
    g.moveTo(s[0], s[1]); for (let i = 0; i < n; i++) { const m = mid(p[i], p[(i + 1) % n]); g.quadraticCurveTo(p[i][0], p[i][1], m[0], m[1]); }
    g.closePath();
  }
  // Ben-Day dots that thin out as they leave a shape. `draw` paints the shape onto a tiny mask; everything happens once, at load.
  function halftone(g, W, H, draw, col, step = 11, reach = 3) {
    const k = 1 / 8, mw = Math.ceil(W * k) + 1, mh = Math.ceil(H * k) + 1, m = cv(mw, mh), mg = m.getContext('2d');
    mg.scale(k, k); mg.fillStyle = mg.strokeStyle = '#000'; mg.lineCap = mg.lineJoin = 'round'; draw(mg);
    const d = mg.getImageData(0, 0, mw, mh).data, n = mw * mh, src = new Float32Array(n); for (let i = 0; i < n; i++) src[i] = d[i * 4 + 3] / 255;
    let a = Float32Array.from(src), b = new Float32Array(n);
    const pass = (w, h, sx, sy) => { // one sliding box blur along an axis
      for (let j = 0; j < h; j++) { let sum = 0; const at = i => a[j * sx + Math.max(0, Math.min(w - 1, i)) * sy]; for (let i = -reach; i <= reach; i++) sum += at(i); for (let i = 0; i < w; i++) { b[j * sx + i * sy] = sum / (reach * 2 + 1); sum += at(i + reach + 1) - at(i - reach); } }
      const t = a; a = b; b = t;
    };
    pass(mw, mh, mw, 1); pass(mh, mw, 1, mw); pass(mw, mh, mw, 1); pass(mh, mw, 1, mw);
    g.fillStyle = col; g.beginPath(); let row = 0;
    for (let y = 0; y < H; y += step * .5, row++) for (let x = row % 2 ? step * .5 : 0; x < W; x += step) {
      const i = Math.floor(y * k) * mw + Math.floor(x * k); if (src[i] > .95) continue; const v = a[i]; if (v < .06) continue;
      const R = step * .5 * Math.sqrt(Math.min(1, v * 2.2)); g.moveTo(x + R, y); g.arc(x, y, R, 0, TAU);
    }
    g.fill();
  }

  function paint(map, towers, GS, sites = []) {
    const W = map.W, Ht = Math.ceil(map.H * TILT), c = cv(W * GS, Ht * GS), g = c.getContext('2d'), r = seeded(90210), Y = y => y * TILT;
    g.scale(GS, GS); g.imageSmoothingQuality = 'high'; g.lineCap = 'round'; g.lineJoin = 'round';

    // Meadow: big flat colour shapes with dotted edges, no noise.
    g.fillStyle = '#5aa86c'; g.fillRect(0, 0, W, Ht);
    const shapes = (n, a, b) => { const o = []; for (let i = 0; i < n; i++) o.push([r() * W, r() * Ht, a + r() * (b - a), r() * 1e6 | 0]); return o; };
    const drawShapes = (t, list) => { t.beginPath(); for (const [x, y, R, s] of list) blob(t, x, y, R, seeded(s + 1), TILT); t.fill(); };
    const dark = shapes(26, 180, 380), light = shapes(20, 140, 300);
    g.fillStyle = '#519f65'; drawShapes(g, dark); halftone(g, W, Ht, t => drawShapes(t, dark), '#519f65', 26, 2);
    g.fillStyle = '#62b174'; drawShapes(g, light);

    // Grass ticks, sparse and inked, so the shapes stay clean.
    g.lineWidth = 2; g.strokeStyle = '#4a9460'; g.beginPath();
    for (let i = 0; i < 240; i++) { const x = r() * W, y = r() * Ht, s = 4 + r() * 4; g.moveTo(x - s, y - s * .9); g.lineTo(x - s * .3, y); g.lineTo(x + s * .2, y - s * 1.3); g.lineTo(x + s * .6, y); g.lineTo(x + s * 1.2, y - s * .8); }
    g.stroke();

    // Dark woodland at the edges of the map and around the corner forests.
    const wob = (a, b, seed) => { const q = seeded(seed), o = []; for (let i = 0; i <= 40; i++) o.push(a + q() * (b - a)); return o; };
    const eT = wob(70, 130, 11), eB = wob(70, 130, 12), eL = wob(50, 96, 13), eR = wob(50, 96, 14);
    const edgeShape = t => {
      const strip = (n, fn) => { t.beginPath(); fn(0, 0, true); for (let i = 0; i <= 40; i++) fn(i, n[i], false); fn(40, 0, false); t.closePath(); t.fill(); };
      strip(eT, (i, d, m) => t[m ? 'moveTo' : 'lineTo'](i / 40 * W, d));
      strip(eB, (i, d, m) => t[m ? 'moveTo' : 'lineTo'](i / 40 * W, Ht - d));
      strip(eL, (i, d, m) => t[m ? 'moveTo' : 'lineTo'](d, i / 40 * Ht));
      strip(eR, (i, d, m) => t[m ? 'moveTo' : 'lineTo'](W - d, i / 40 * Ht));
      for (const w of map.walls) if (w.big) { t.beginPath(); blob(t, w.x + w.w / 2, Y(w.y + w.h / 2), 330, seeded(w.x + w.y + 5), 1, 14); t.fill(); }
    };
    g.fillStyle = '#3c8560'; edgeShape(g); halftone(g, W, Ht, edgeShape, '#3c8560', 24, 3);

    const cen = spline(RIVER, 18), path = new Path2D(); cen.forEach(([x, y], i) => path[i ? 'lineTo' : 'moveTo'](x, Y(y)));
    const lanePaths = map.lanes.map(l => { const pts = spline(l, 16), p = new Path2D(); pts.forEach(([x, y], i) => p[i ? 'lineTo' : 'moveTo'](x, Y(y))); return { pts, p }; });
    const PLAZA = { x: 1600, y: 950, r: 268 };
    const circles = [[210, 950, 390], [W - 210, 950, 390], [PLAZA.x, PLAZA.y, PLAZA.r], ...sites.map(s => [s.x, s.y, 116])];
    // One dotted shadow ring around everything laid on the grass.
    halftone(g, W, Ht, t => { t.lineWidth = 224; for (const l of lanePaths) t.stroke(l.p); t.lineWidth = HALF * 2 + 92; t.stroke(path); t.beginPath(); for (const [x, y, R] of circles) { t.moveTo(x + R + 26, Y(y)); t.ellipse(x, Y(y), R + 26, (R + 26) * TILT, 0, 0, TAU); } t.fill(); }, 'rgba(30,92,66,.11)', 22, 3);

    // River: hard turquoise bands inside a bold sandy, inked bank.
    const bankStroke = (w, col) => { g.strokeStyle = col; g.lineWidth = w; g.stroke(path); };
    bankStroke(HALF * 2 + 56, INK); bankStroke(HALF * 2 + 48, '#e4d4a8'); bankStroke(HALF * 2 + 8, INK);
    bankStroke(HALF * 2, '#2f83ad'); bankStroke(HALF * 2 - 44, '#3893b7'); bankStroke(HALF * 2 - 104, '#42a2c0');
    // Current streaks: long lozenges that follow the flow.
    const flow = cen.map(([x, y], i) => { const a = cen[Math.max(0, i - 1)], b = cen[Math.min(cen.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, tx = dx / l, ty = dy / l; return { x, y, tx, ty, nx: -ty, ny: tx, a: Math.atan2(ty * TILT, tx) - Math.PI / 2 }; });
    for (let i = 0; i < 34; i++) { const p = flow[r() * flow.length | 0], o = (r() - .5) * (HALF * 1.6), x = p.x + p.nx * o, y = Y(p.y + p.ny * o), len = 34 + r() * 90, w = 3 + r() * 7; g.fillStyle = r() > .4 ? '#62b4c8' : '#2f88b0'; g.save(); g.translate(x, y); g.rotate(p.a + Math.PI / 2); g.beginPath(); g.moveTo(-len, 0); g.quadraticCurveTo(0, -w, len, 0); g.quadraticCurveTo(0, w, -len, 0); g.fill(); g.restore(); }
    // Bank rocks and reeds, inked and sparse.
    const inkOval = (x, y, rx, ry, col, lw = 2.4) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fillStyle = col; g.fill(); g.strokeStyle = INK; g.lineWidth = lw; g.stroke(); };
    for (let i = 0; i < 16; i++) { const p = flow[r() * flow.length | 0], s = r() > .5 ? 1 : -1, o = s * (HALF + 18 + r() * 12); inkOval(p.x + p.nx * o, Y(p.y + p.ny * o), 6 + r() * 8, 4 + r() * 4, r() > .5 ? '#c9d0e6' : '#9aa6c8'); }
    for (let i = 0; i < 18; i++) { const p = flow[r() * flow.length | 0], s = r() > .5 ? 1 : -1, o = s * (HALF + 34 + r() * 22), x = p.x + p.nx * o, y = Y(p.y + p.ny * o); g.strokeStyle = '#2b5a48'; g.lineWidth = 4.5; g.beginPath(); for (let k = -1; k <= 1; k++) { g.moveTo(x + k * 3, y); g.quadraticCurveTo(x + k * 4, y - 14, x + k * 8, y - 24); } g.stroke(); g.strokeStyle = '#4c9a70'; g.lineWidth = 2.2; g.stroke(); }

    const table = []; for (let y = -80; y <= map.H + 80; y += 20) { let bx = 0, bd = 1e9; for (const [x, yy] of cen) { const d = Math.abs(yy - y); if (d < bd) { bd = d; bx = x; } } table.push(bx); }
    const riverX = y => table[Math.max(0, Math.min(table.length - 1, Math.round((y + 80) / 20)))];

    // Roads: inked kerbs, bright stone, shade on the low side, a few cobble clusters instead of a noisy field.
    for (const { pts, p } of lanePaths) {
      const st = (w, col) => { g.strokeStyle = col; g.lineWidth = w; g.stroke(p); };
      st(206, INK); st(198, '#efe3c4'); st(176, '#c7b48a'); st(172, '#e8d8b0');
      const lo = [], hi = []; pts.forEach((q, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dy = Y(b[1]) - Y(a[1]), l = Math.hypot(dx, dy) || 1; lo.push([q[0] - dy / l * 86, Y(q[1]) + dx / l * 86]); hi.push([q[0] + dy / l * 86, Y(q[1]) - dx / l * 86]); });
      const poly = new Path2D(); lo.forEach(([x, y], i) => poly[i ? 'lineTo' : 'moveTo'](x, y)); hi.reverse().forEach(([x, y]) => poly.lineTo(x, y)); poly.closePath();
      g.save(); g.clip(poly); g.translate(0, 118); g.strokeStyle = '#dfcda2'; g.lineWidth = 172; g.stroke(p); g.restore();
      let along = 0;
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i], d = Math.hypot(bx - ax, Y(by) - Y(ay)), ux = (bx - ax) / (d || 1), uy = (Y(by) - Y(ay)) / (d || 1);
        // kerb stone joints
        for (let s = 0; s < d; s += 8) { if (Math.floor((along + s) / 96) === Math.floor((along + s - 8) / 96)) continue; for (const sd of [-1, 1]) { const x = ax + ux * s - uy * sd * 94, y = Y(ay) + uy * s + ux * sd * 94; g.strokeStyle = '#b8a67e'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - uy * 9, y + ux * 9); g.lineTo(x + uy * 9, y - ux * 9); g.stroke(); } }
        for (let s = 0; s < d; s += 8) {
          if (Math.floor((along + s) / 210) === Math.floor((along + s - 8) / 210)) continue;
          const lat = (r() - .5) * 130, n = 1 + (r() * 2 | 0), x0 = ax + ux * s - uy * lat, y0 = Y(ay) + uy * s + ux * lat;
          for (let k = 0; k < n; k++) { const x = x0 + (r() - .5) * 34, y = y0 + (r() - .5) * 22; g.beginPath(); g.ellipse(x, y, 10 + r() * 5, 6.5 + r() * 3, r(), 0, TAU); g.fillStyle = r() > .5 ? '#e2d2a8' : '#dcc99c'; g.fill(); }
        }
        along += d;
      }
    }
    // Bridges: planks and inked rails where each road meets the water.
    const bridges = lanePaths.map(({ pts }) => { let best = pts[0], bd = 1e9; for (const p of pts) { const d = Math.abs(p[0] - riverX(p[1])); if (d < bd) { bd = d; best = p; } } return { x: best[0], y: best[1], pts }; });
    const ROAD = 90, SPAN = 164;
    for (const b of bridges) {
      const yc = Y(b.y), x0 = b.x - SPAN, w = SPAN * 2;
      g.strokeStyle = 'rgba(21,17,43,.5)'; g.lineWidth = 2.4; g.beginPath(); for (let x = x0 + 12; x < x0 + w; x += 26) { g.moveTo(x, yc - ROAD + 12); g.lineTo(x, yc + ROAD - 12); } g.stroke();
      g.fillStyle = 'rgba(8,60,110,.55)'; g.fillRect(x0, yc + ROAD + 10, w, 18);
      for (const o of [-ROAD, ROAD]) {
        const y = yc + o;
        g.fillStyle = INK; g.fillRect(x0 - 3, y - 12, w + 6, 22); g.fillStyle = '#e9dcb8'; g.fillRect(x0, y - 9, w, 8); g.fillStyle = '#c9ad78'; g.fillRect(x0, y - 1, w, 8);
        for (let x = x0 + 6; x < x0 + w - 8; x += 92) { g.fillStyle = INK; g.fillRect(x - 3, y - 19, 20, 28); g.fillStyle = '#e9dcb8'; g.fillRect(x, y - 16, 14, 22); g.fillStyle = '#c9ad78'; g.fillRect(x + 8, y - 16, 6, 22); }
      }
    }

    // Plazas.
    const ring = (R, col, lw) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.stroke(); };
    const disc = (R, col) => { g.fillStyle = col; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill(); };
    const wedges = (n, r0, r1, a, b) => { for (let i = 0; i < n; i++) { const a0 = i / n * TAU; g.fillStyle = i % 2 ? a : b; g.beginPath(); g.arc(0, 0, r1, a0, a0 + TAU / n); g.arc(0, 0, r0, a0 + TAU / n, a0, true); g.closePath(); g.fill(); } };
    const slabs = (n, R, lw = 2.5) => { g.strokeStyle = INK; g.lineWidth = lw; g.beginPath(); for (let i = 0; i < n; i++) { const a = i / n * TAU; g.moveTo(Math.cos(a) * R, Math.sin(a) * R); g.lineTo(Math.cos(a) * (R - 26), Math.sin(a) * (R - 26)); } g.stroke(); };
    const at = (x, y, fn) => { g.save(); g.translate(x, Y(y)); g.scale(1, TILT); fn(); g.restore(); };
    // Hero HQ: white marble, an ultramarine band, sunshine rays.
    at(210, 950, () => {
      disc(392, INK); disc(384, '#fffdf2'); wedges(48, 354, 384, '#fff0c0', '#fffdf2'); slabs(48, 384); ring(354, INK, 5); disc(351, '#eaf1ff');
      wedges(32, 170, 322, '#e6c872', '#ecd89c'); ring(322, HERO.ultra, 18); ring(332, INK, 4); ring(312, INK, 4); ring(170, INK, 5); disc(168, HERO.ultra); ring(120, HERO.sun, 12);
    });
    // Villain Lair: bruised violet stone split by glowing toxic cracks.
    at(W - 210, 950, () => {
      disc(392, INK); disc(384, '#3d2a70'); wedges(48, 354, 384, '#2f1f5c', '#46317f'); slabs(48, 384); ring(354, INK, 5); disc(351, '#33245f');
      wedges(18, 170, 322, '#3d2a70', '#2a1b52'); ring(322, VIL.blood, 14); ring(330, INK, 4); ring(314, INK, 4); ring(170, INK, 5); disc(168, '#1f1440');
      for (let i = 0; i < 13; i++) { let a = i / 13 * TAU + r() * .2, d = 176; const pts = [[Math.cos(a) * d, Math.sin(a) * d]]; while (d < 346) { d += 26 + r() * 34; a += (r() - .5) * .28; pts.push([Math.cos(a) * Math.min(d, 346), Math.sin(a) * Math.min(d, 346)]); } const trace = () => { g.beginPath(); pts.forEach(([x, y], k) => g[k ? 'lineTo' : 'moveTo'](x, y)); g.stroke(); }; g.strokeStyle = INK; g.lineWidth = 12; trace(); g.strokeStyle = VIL.toxicDk; g.lineWidth = 7; trace(); g.strokeStyle = VIL.toxic; g.lineWidth = 3; trace(); }
      ring(120, VIL.toxic, 10);
    });
    // Centre plaza: sunlit gold.
    at(PLAZA.x, PLAZA.y, () => {
      disc(PLAZA.r + 4, INK); disc(PLAZA.r - 3, '#ebdfbf'); wedges(36, PLAZA.r - 30, PLAZA.r - 3, '#e2cfa0', '#ebdfbf'); slabs(36, PLAZA.r - 3); ring(PLAZA.r - 30, INK, 5);
      wedges(20, 90, 200, '#e2c67e', '#ead9ab'); ring(200, INK, 4); ring(90, INK, 4); disc(88, '#e6d099'); ring(58, '#c49a58', 7);
    });
    // Civilian squares: a warm tiled square with a clear border.
    for (const site of sites) at(site.x, site.y, () => { disc(120, INK); disc(113, '#ebdfc0'); wedges(24, 92, 113, '#e0cca2', '#ebdfc0'); ring(92, INK, 3); disc(90, '#e8d6ae'); ring(62, '#c49a58', 5); });
    // Spawn pads.
    for (const [x, a, b, cc] of [[95, HERO.ultra, HERO.sun, '#fffdf2'], [W - 95, VIL.violet, VIL.toxic, VIL.deep]]) at(x, 950, () => { disc(150, INK); disc(142, a); wedges(16, 84, 134, b, a); ring(134, INK, 4); ring(84, INK, 4); disc(82, cc); ring(50, b, 8); });
    // Tower plinths, ringed in the owner's colour.
    for (const t of towers) { const R = t.sub === 'core' ? 96 : 68, col = t.team ? VIL.blood : HERO.ultra; at(t.x, t.y, () => { disc(R + 6, INK); disc(R - 1, t.team ? '#5a4a8a' : '#fffdf2'); ring(R - 14, col, 8); ring(R - 22, INK, 3); disc(R - 25, t.team ? '#3d2a70' : '#dfe9ff'); }); }
    // Flowers in small, deliberate patches.
    const flowers = ['#e8e6d0', '#d9a3b8', '#e0cd80'];
    for (let i = 0; i < 34; i++) { const cx = r() * W, cy = r() * Ht, col = flowers[r() * 3 | 0]; if (nearRoad(map, cx, cy / TILT) < 150 || Math.abs(cx - 1600) < 260) continue; g.fillStyle = col; g.beginPath(); for (let k = 0; k < 5; k++) { const x = cx + (r() - .5) * 54, y = cy + (r() - .5) * 30; g.moveTo(x + 2.8, y); g.arc(x, y, 2.8, 0, TAU); } g.fill(); }
    // Brush beds.
    map.brush.forEach((b, i) => brushBed(g, b, i % 3 + 1, Y));
    // Cliffs throw a hard shadow, dotted at the edge.
    const castShape = t => { t.beginPath(); for (const w of map.walls) if (!w.big) { const y = Y(w.y + w.h); t.moveTo(w.x - 6, y); t.lineTo(w.x + w.w + 6, y); t.lineTo(w.x + w.w + 20, y + 22); t.lineTo(w.x + 12, y + 22); t.closePath(); } t.fill(); };
    g.fillStyle = 'rgba(16,52,60,.24)'; castShape(g); halftone(g, W, Ht, castShape, 'rgba(16,52,60,.14)', 16, 2);

    // One last pass over the finished map: a notch less saturation and contrast, so everything standing on it wins.
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'saturation';
    if (g.globalCompositeOperation === 'saturation') { g.globalAlpha = .2; g.fillStyle = '#808080'; g.fillRect(0, 0, c.width, c.height); }
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = .1; g.fillStyle = '#6f8f7c'; g.fillRect(0, 0, c.width, c.height); g.globalAlpha = 1; g.setTransform(GS, 0, 0, GS, 0, 0);

    const water = (x, y) => Math.abs(x - riverX(y)) < HALF && Math.hypot(x - PLAZA.x, y - PLAZA.y) > PLAZA.r && !bridges.some(b => Math.abs(y - b.y) < 127);
    return { c, W, H: Ht, scale: GS, riverX, water, flow, plaza: PLAZA, bridges: bridges.map(b => ({ x: b.x, y: b.y })), ROAD };
  }
  function nearRoad(map, x, y) { let b = 1e9; for (const L of map.lanes) for (let i = 1; i < L.length; i++) { const [ax, ay] = L[i - 1], [bx, by] = L[i], dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))); b = Math.min(b, Math.hypot(x - ax - dx * t, y - ay - dy * t)); } return b; }

  const cache = new Map();
  const washed = new WeakSet();
  // Veils a finished sprite (opaque pixels only) so scenery sits a step behind the units.
  function calmed(fn, a) { return (...args) => { const s = fn(...args); if (s && s.c && !washed.has(s.c)) { washed.add(s.c); const g = s.c.getContext('2d'); g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-atop'; g.globalAlpha = a; g.fillStyle = '#7f9a8e'; g.fillRect(0, 0, s.c.width, s.c.height); g.restore(); } return s; }; }
  const once = (id, fn) => { if (!cache.has(id)) cache.set(id, fn()); return cache.get(id); };

  // ---------- cliffs ----------
  function cliff(w) {
    return once(`c${w.w}x${w.h}`, () => {
      const lift = 34, P = 12, tw = w.w + P * 2, th = w.h * TILT, H = th + lift + P * 2 + 8, { c, g } = mk(tw, H), r = seeded((w.w * 31 + w.h * 17) | 1);
      const out = [], step = 42, jit = 5, x0 = P, y0 = P, x1 = P + w.w, y1 = P + th;
      const top = (ax, ay, bx, by) => { const d = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(d / step)); for (let i = 0; i < n; i++) { const t = i / n; out.push([ax + (bx - ax) * t + (r() - .5) * jit, ay + (by - ay) * t + (r() - .5) * jit * .7]); } };
      top(x0, y0, x1, y0); top(x1, y0, x1, y1); top(x1, y1, x0, y1); top(x0, y1, x0, y0);
      const poly = dy => { g.beginPath(); out.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y + dy)); g.closePath(); };
      const front = out.filter(([, y]) => y > y1 - jit - 4).sort((a, b) => a[0] - b[0]);
      // One bold silhouette, a flat two-tone rock face, a flat top. Nothing else.
      g.strokeStyle = INK; g.lineWidth = 6; poly(lift); g.stroke(); poly(0); g.stroke(); g.fillStyle = INK; poly(lift); g.fill();
      g.beginPath(); g.moveTo(front[0][0], front[0][1]); for (const [x, y] of front) g.lineTo(x, y); for (let i = front.length - 1; i >= 0; i--) g.lineTo(front[i][0], front[i][1] + lift); g.closePath(); g.fillStyle = '#5d7088'; g.fill(); g.stroke();
      for (let i = 0; i < front.length - 1; i++) { if (i % 2) continue; const [ax, ay] = front[i], [bx, by] = front[i + 1]; g.fillStyle = '#6c8096'; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(bx, by + lift); g.lineTo(ax, ay + lift); g.closePath(); g.fill(); }
      g.fillStyle = '#6da676'; poly(0); g.fill();
      g.save(); poly(0); g.clip(); g.fillStyle = '#649c6e'; g.beginPath(); for (let i = 0; i < Math.max(1, w.w * w.h / 22000); i++) blob(g, x0 + r() * w.w, y0 + r() * th, 30 + r() * 26, r, .7); g.fill(); g.restore();
      g.strokeStyle = '#8bbb8c'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(front[0][0], front[0][1] - 3); for (const [x, y] of front) g.lineTo(x, y - 3); g.stroke();
      g.strokeStyle = INK; g.lineWidth = 3.5; poly(0); g.stroke();
      return { c, w: tw, h: H, lift, P };
    });
  }

  // ---------- trees and brush ----------
  // Lobes are inked as one silhouette, then filled, then shaded with offset copies for hard cel tones.
  const TREE_COL = [['#2f7f58', '#3f9469', '#67ae7c'], ['#2a7560', '#378a72', '#5fa98c'], ['#28704f', '#368760', '#59a173'], ['#a8743a', '#c2914e', '#d8b474'], ['#a8708a', '#c48ca4', '#dcb6c6'], ['#5a4a8a', '#7464a4', '#94a878']];
  function tree(v) {
    return once('t' + v, () => {
      const shape = v === 2 ? 'pine' : v === 1 ? 'tall' : 'round', R = shape === 'tall' ? 50 : 50 + (v % 3) * 8, W = R * 2 + 24, H = R * (shape === 'round' ? 2.6 : 3.3) + 20, { c, g } = mk(W, H), cx = W / 2, base = H - 16, [lo, mid, hi] = TREE_COL[v], r = seeded(v * 71 + 9);
      g.fillStyle = 'rgba(8,40,40,.42)'; g.beginPath(); g.ellipse(cx + 4, base + 2, R * .86, R * .3, 0, 0, TAU); g.fill();
      g.strokeStyle = INK; g.lineWidth = 3.5; g.fillStyle = '#7a4a24'; g.beginPath(); g.moveTo(cx - 8, base); g.lineTo(cx - 5, base - R * .8); g.lineTo(cx + 5, base - R * .8); g.lineTo(cx + 8, base); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#4e2e16'; g.fillRect(cx + 1, base - R * .75, 4, R * .72);
      if (shape === 'pine') {
        [[0, 1], [.62, .78], [1.2, .56]].forEach(([up, k]) => {
          const y = base - R * .45 - up * R, w = R * k, h = R * 1.05, tri = () => { g.beginPath(); g.moveTo(cx, y - h); g.lineTo(cx + w, y); g.lineTo(cx + w * .55, y - 6); g.lineTo(cx + w * .3, y + 6); g.lineTo(cx, y - 2); g.lineTo(cx - w * .3, y + 6); g.lineTo(cx - w * .55, y - 6); g.lineTo(cx - w, y); g.closePath(); };
          tri(); g.fillStyle = mid; g.strokeStyle = INK; g.lineWidth = 7; g.stroke(); g.fill();
          g.save(); tri(); g.clip(); g.fillStyle = lo; g.fillRect(cx, y - h, w + 2, h + 10); g.fillStyle = hi; g.beginPath(); g.moveTo(cx - 2, y - h + 8); g.lineTo(cx - w * .62, y - 4); g.lineTo(cx - w * .34, y - 4); g.closePath(); g.fill(); g.restore();
          tri(); g.lineWidth = 3.2; g.stroke();
        });
      } else {
        const L = [], tall = shape === 'tall', top = base - R * (tall ? .85 : .95);
        const add = (x, y, rr) => L.push([cx + x * R, top + y * R, rr * R]);
        if (tall) { add(0, -1.5, .5); add(-.2, -1.05, .62); add(.22, -.95, .6); add(0, -.45, .78); add(-.3, -.15, .55); add(.3, -.15, .55); }
        else { add(0, -.72, .62); add(-.52, -.4, .55); add(.52, -.42, .56); add(-.62, .02, .52); add(.62, 0, .52); add(0, -.15, .75); }
        const fill = (col, dx, dy, k) => { g.fillStyle = col; g.beginPath(); for (const [x, y, rr] of L) { g.moveTo(x + dx * rr + rr * k, y + dy * rr); g.arc(x + dx * rr, y + dy * rr, rr * k, 0, TAU); } g.fill(); };
        g.fillStyle = INK; g.beginPath(); for (const [x, y, rr] of L) { g.moveTo(x + rr + 3.5, y); g.arc(x, y, rr + 3.5, 0, TAU); } g.fill();
        fill(lo, 0, 0, 1);
        g.save(); g.beginPath(); for (const [x, y, rr] of L) { g.moveTo(x + rr, y); g.arc(x, y, rr, 0, TAU); } g.clip();
        fill(mid, -.16, -.2, .86); fill(hi, -.4, -.5, .26);

        g.restore();
        g.strokeStyle = INK; g.lineWidth = 2.6; g.beginPath(); for (let i = 0; i < 5; i++) { const [x, y, rr] = L[i * 7 % L.length], a = 1.2 + r() * 1.6; g.moveTo(x + Math.cos(a) * rr * .7, y + Math.sin(a) * rr * .7); g.arc(x, y, rr * .7, a, a + .7); } g.stroke();
      }
      return { c, w: W, h: H, ax: cx, ay: base };
    });
  }
  // A brush zone lies flat on the ground: one scalloped inked edge, two calm tones and a low fringe along the back.
  function brushBed(g, b, seed, Y) {
    const r = seeded(seed * 31 + 3), n = Math.max(14, Math.round(b.r / 7)), cy = Y(b.y), k = TILT;
    const edge = (R, wob) => { g.beginPath(); for (let i = 0; i <= n; i++) { const a0 = (i - 1) / n * TAU, a1 = i / n * TAU, am = (a0 + a1) / 2, x1 = b.x + Math.cos(a1) * R, y1 = cy + Math.sin(a1) * R * k; if (!i) g.moveTo(x1, y1); else g.quadraticCurveTo(b.x + Math.cos(am) * (R + wob), cy + Math.sin(am) * (R + wob) * k, x1, y1); } g.closePath(); };
    g.lineJoin = 'round'; g.strokeStyle = INK; g.lineWidth = 5; edge(b.r, 10); g.stroke();
    g.fillStyle = '#2f7a68'; edge(b.r, 10); g.fill();
    g.fillStyle = '#378872'; edge(b.r * .74, 8); g.fill();
    g.strokeStyle = '#27685a'; g.lineWidth = 2.6; g.beginPath();
    const tufts = Math.round(b.r / 13);
    for (let i = 0; i < tufts; i++) { const a = r() * TAU, d = Math.sqrt(r()) * (b.r - 22), x = b.x + Math.cos(a) * d, y = cy + Math.sin(a) * d * k; g.moveTo(x - 7, y - 5); g.lineTo(x - 2, y + 1); g.lineTo(x + 1, y - 7); g.lineTo(x + 4, y + 1); g.lineTo(x + 9, y - 5); }
    g.stroke();
    // the back rim gets a short fringe: enough height to read as foliage, too low to hide anything
    const blades = Math.round(b.r / 9), hs = []; for (let i = 0; i <= blades; i++) hs.push(7 + r() * 5);
    const path = () => { g.beginPath(); for (let i = 0; i <= blades; i++) { const a = Math.PI + i / blades * Math.PI, x = b.x + Math.cos(a) * b.r * .98, y = cy + Math.sin(a) * b.r * k * .98; g.moveTo(x - 6, y + 2); g.lineTo(x, y - hs[i]); g.lineTo(x + 6, y + 2); } };
    g.strokeStyle = '#3f8d76'; g.lineWidth = 3.4; path(); g.stroke();
  }

  // ---------- street furniture ----------
  function lantern(red = false) {
    return once(red ? 'lanR' : 'lan', () => {
      const { c, g } = mk(44, 100), lit = red ? '#ff6a3c' : '#ffe27a', lit2 = red ? '#ffb48a' : '#fffbd8';
      g.fillStyle = 'rgba(8,40,40,.4)'; g.beginPath(); g.ellipse(22, 92, 15, 6, 0, 0, TAU); g.fill();
      g.strokeStyle = INK; g.lineWidth = 3; const box = (x, y, w, h, f) => { g.fillStyle = f; g.fillRect(x, y, w, h); g.strokeRect(x, y, w, h); };
      box(14, 84, 16, 9, '#7c88b8'); box(18, 40, 8, 46, '#5a668f'); g.fillStyle = '#a4b0d4'; g.fillRect(19.5, 42, 2.5, 42);
      box(11, 20, 22, 22, lit); g.fillStyle = lit2; g.fillRect(14, 23, 8, 16); g.strokeRect(22, 20, .1, 22);
      g.beginPath(); g.moveTo(5, 21); g.lineTo(22, 5); g.lineTo(39, 21); g.closePath(); g.fillStyle = red ? VIL.violet : HERO.ultra; g.fill(); g.stroke();
      g.beginPath(); g.moveTo(22, 5); g.lineTo(39, 21); g.lineTo(22, 21); g.closePath(); g.fillStyle = red ? VIL.deep : HERO.deep; g.fill();
      return { c, w: 44, h: 100, ax: 22, ay: 90, lightY: 64 };
    });
  }
  function pillar() {
    return once('pil', () => {
      const { c, g } = mk(72, 160), xl = 18, xr = 54, top = 34, bot = 142;
      g.fillStyle = 'rgba(8,40,40,.4)'; g.beginPath(); g.ellipse(36, 146, 30, 11, 0, 0, TAU); g.fill();
      g.strokeStyle = INK; g.lineWidth = 3.5; g.fillStyle = '#fff4d4'; g.fillRect(xl, top, xr - xl, bot - top); g.fillStyle = '#e8c88e'; g.fillRect(xl + 22, top, 14, bot - top); g.fillStyle = '#c49a5e'; g.fillRect(xl + 30, top, 6, bot - top);
      g.strokeRect(xl, top, xr - xl, bot - top); g.lineWidth = 2; g.beginPath(); for (const x of [xl + 9, xl + 18, xl + 27]) { g.moveTo(x, top + 6); g.lineTo(x, bot - 6); } g.stroke(); g.lineWidth = 3.5;
      g.beginPath(); g.ellipse(36, bot, 25, 9, 0, 0, Math.PI); g.lineTo(11, bot - 8); g.lineTo(61, bot - 8); g.closePath(); g.fillStyle = '#e8c88e'; g.fill(); g.stroke();
      g.beginPath(); g.ellipse(36, 32, 26, 11, 0, 0, TAU); g.fillStyle = '#ffd98a'; g.fill(); g.stroke(); g.beginPath(); g.ellipse(36, 28, 18, 7, 0, 0, TAU); g.fillStyle = '#fff4d4'; g.fill(); g.stroke();
      return { c, w: 72, h: 160, ax: 36, ay: 146, lightY: 118 };
    });
  }
  // ---------- buildings ----------
  // `L` is an overlay of the window glass, so windows can dim with hope and burn at night.
  const WALLS = [['#fff0d0', '#ffd9a0', '#a8d8ff', '#ffc1a8'], ['#b9a6d8', '#8f86b8', '#a8b0c0', '#7fa090']];
  const ROOFS = [['#e8452f', HERO.ultra, '#f0931a', '#18a0a0'], [VIL.violet, '#3a2a6b', '#b03a7a', '#2e6a58']];
  function house(v, side = 0) {
    return once('h' + v + 's' + side, () => {
      const type = v % 4, W0 = 148, H0 = type === 1 ? 186 : 152, { c, g } = mk(W0, H0), L = mk(W0, H0), l = L.g, base = H0 - 14;
      const wall = WALLS[side][v % 4], roof = ROOFS[side][(v * 3 + 1) % 4], shade = Art.mix(wall, '#3a2a6b', .28), roofDk = Art.mix(roof, INK, .34), glass = side ? '#b6ff5a' : '#ffd86a', pane = '#23305e';
      const w = type === 1 ? 88 : 108, x0 = (W0 - w) / 2, floors = type === 1 ? 2 : 1, h = type === 1 ? 104 : 62, y0 = base - h;
      g.fillStyle = 'rgba(8,40,40,.42)'; g.beginPath(); g.ellipse(W0 / 2 + 6, base + 2, w * .66, 13, 0, 0, TAU); g.fill();
      g.strokeStyle = INK; g.lineWidth = 3.5;
      // chimney behind the roof
      const chX = W0 / 2 + w * .24; g.fillStyle = '#c0604a'; g.fillRect(chX - 8, y0 - 62, 16, 44); g.strokeRect(chX - 8, y0 - 62, 16, 44); g.fillStyle = '#7a3a30'; g.fillRect(chX + 1, y0 - 60, 6, 40); g.fillStyle = '#ffe9c8'; g.fillRect(chX - 11, y0 - 67, 22, 7); g.strokeRect(chX - 11, y0 - 67, 22, 7);
      g.fillStyle = wall; g.fillRect(x0, y0, w, h); g.fillStyle = shade; g.fillRect(x0 + w - 20, y0, 20, h); g.strokeRect(x0, y0, w, h);
      if (type === 3) { g.strokeStyle = 'rgba(21,17,43,.5)'; g.lineWidth = 2; g.beginPath(); for (let y = y0 + 12; y < base; y += 12) { g.moveTo(x0 + 2, y); g.lineTo(x0 + w - 2, y); } g.stroke(); g.strokeStyle = INK; g.lineWidth = 3.5; }
      const win = (x, y, ww = 20, hh = 24) => { g.fillStyle = pane; g.fillRect(x, y, ww, hh); g.strokeRect(x, y, ww, hh); g.lineWidth = 2; g.beginPath(); g.moveTo(x + ww / 2, y); g.lineTo(x + ww / 2, y + hh); g.moveTo(x, y + hh * .5); g.lineTo(x + ww, y + hh * .5); g.stroke(); g.lineWidth = 3.5; l.fillStyle = glass; l.fillRect(x + 1.5, y + 1.5, ww - 3, hh - 3); l.fillStyle = 'rgba(120,70,20,.5)'; l.fillRect(x + ww / 2 - 1, y, 2, hh); l.fillRect(x, y + hh * .5 - 1, ww, 2); };
      // door
      const doorX = x0 + w / 2 - 12; g.fillStyle = side ? '#3a2a6b' : '#b0522e'; g.beginPath(); g.moveTo(doorX, base); g.lineTo(doorX, base - 28); g.arc(doorX + 12, base - 28, 12, Math.PI, 0); g.lineTo(doorX + 24, base); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#ffd21f'; g.beginPath(); g.arc(doorX + 18, base - 18, 2.4, 0, TAU); g.fill();
      if (type === 1) { win(x0 + 12, y0 + 12); win(x0 + w - 32, y0 + 12); win(x0 + 12, y0 + 56, 20, 22); win(x0 + w - 32, y0 + 56, 20, 22); }
      else if (type === 2) {
        // shopfront with a striped awning
        win(x0 + 8, base - 40, 30, 26); win(x0 + w - 38, base - 40, 30, 26);
        const ay = y0 + 8, n = 7, aw = w + 12, ax = x0 - 6; for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? '#fffdf2' : roof; g.fillRect(ax + i * aw / n, ay, aw / n, 16); g.beginPath(); g.arc(ax + (i + .5) * aw / n, ay + 16, aw / n / 2, 0, Math.PI); g.fill(); }
        g.strokeRect(ax, ay, aw, 16); g.beginPath(); for (let i = 0; i < n; i++) g.arc(ax + (i + .5) * aw / n, ay + 16, aw / n / 2, Math.PI, 0, true); g.stroke();
      } else { win(x0 + 12, y0 + 14); win(x0 + w - 32, y0 + 14); }
      // roof: a bold wedge, two hard tones
      const ov = 13, apex = y0 - (type === 2 ? 46 : 56);
      g.beginPath(); g.moveTo(x0 - ov, y0 + 4); g.lineTo(W0 / 2, apex); g.lineTo(x0 + w + ov, y0 + 4); g.closePath(); g.fillStyle = roof; g.fill(); g.lineWidth = 4.5; g.stroke(); g.lineWidth = 3.5;
      g.save(); g.beginPath(); g.moveTo(x0 - ov, y0 + 4); g.lineTo(W0 / 2, apex); g.lineTo(x0 + w + ov, y0 + 4); g.closePath(); g.clip(); g.fillStyle = roofDk; g.beginPath(); g.moveTo(W0 / 2, apex); g.lineTo(x0 + w + ov, y0 + 4); g.lineTo(W0 / 2 + 14, y0 + 4); g.closePath(); g.fill(); g.strokeStyle = 'rgba(21,17,43,.55)'; g.lineWidth = 2.4; for (let i = 1; i < 4; i++) { const t = i / 4, yy = apex + (y0 + 4 - apex) * t, half = (w / 2 + ov) * t; g.beginPath(); g.moveTo(W0 / 2 - half, yy); g.lineTo(W0 / 2 + half, yy); g.stroke(); } g.restore();
      // attic window
      g.strokeStyle = INK; g.lineWidth = 3; g.fillStyle = pane; g.beginPath(); g.arc(W0 / 2, apex + 34, 8.5, 0, TAU); g.fill(); g.stroke(); l.fillStyle = glass; l.beginPath(); l.arc(W0 / 2, apex + 34, 7, 0, TAU); l.fill();
      return { c, L: L.c, w: W0, h: H0, ax: W0 / 2, ay: base, chimX: chX - W0 / 2, chimZ: base - (y0 - 67), shop: type === 2, tall: H0, glass };
    });
  }
  function hq(team) {
    return once('hq' + team, () => {
      const W0 = 320, H0 = 420, { c, g } = mk(W0, H0), L = mk(W0, H0), l = L.g, ax = W0 / 2, ay = H0 - 18;
      g.fillStyle = 'rgba(8,40,40,.42)'; g.beginPath(); g.ellipse(ax + 8, ay + 2, 150, 26, 0, 0, TAU); g.fill();
      g.strokeStyle = INK; g.lineWidth = 4.5;
      const box = (x, y, w, h, f) => { g.fillStyle = f; g.fillRect(x, y, w, h); g.strokeRect(x, y, w, h); };
      const win = (x, y, w, h, col) => { g.fillStyle = '#20306a'; g.fillRect(x, y, w, h); g.strokeRect(x, y, w, h); l.fillStyle = col; l.fillRect(x + 2, y + 2, w - 4, h - 4); };
      if (team === 0) {
        // Rays behind the dome.
        for (let i = 0; i < 13; i++) { const a = Math.PI + (i + .5) / 13 * Math.PI, A = a - .09, B = a + .09; g.fillStyle = i % 2 ? HERO.sun : '#fff0a0'; g.beginPath(); g.moveTo(ax + Math.cos(A) * 74, 122 + Math.sin(A) * 74); g.lineTo(ax + Math.cos(a) * (i % 2 ? 142 : 118), 122 + Math.sin(a) * (i % 2 ? 142 : 118)); g.lineTo(ax + Math.cos(B) * 74, 122 + Math.sin(B) * 74); g.closePath(); g.fill(); g.lineWidth = 3.5; g.stroke(); g.lineWidth = 4.5; }
        // Wings.
        box(26, 250, 268, ay - 250, '#eef4ff'); g.fillStyle = '#b7c8f4'; g.fillRect(244, 252, 48, ay - 254); g.strokeRect(26, 250, 268, ay - 250);
        g.fillStyle = HERO.ultra; g.fillRect(26, 250, 268, 16); g.strokeRect(26, 250, 268, 16);
        for (const x of [42, 88, 192, 240]) { win(x, 282, 32, 34, '#ffe27a'); win(x, 334, 32, 34, '#ffe27a'); }
        // Tower.
        box(100, 124, 120, ay - 124, '#fffdf2'); g.fillStyle = '#c4d4f8'; g.fillRect(186, 126, 32, ay - 128); g.strokeRect(100, 124, 120, ay - 124);
        for (let y = 142; y < 250; y += 36) { win(112, y, 28, 26, '#fff0a0'); win(150, y, 28, 26, '#fff0a0'); win(186, y, 24, 26, '#ffd86a'); }
        // Dome and mast.
        g.fillStyle = HERO.ultra; g.beginPath(); g.arc(ax, 124, 72, Math.PI, 0); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = HERO.deep; g.beginPath(); g.arc(ax, 124, 72, -Math.PI / 2, 0); g.lineTo(ax, 124); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = '#9ec8ff'; g.beginPath(); g.ellipse(ax - 32, 88, 18, 10, -.6, 0, TAU); g.fill();
        box(ax - 5, 28, 10, 30, HERO.sun); g.fillStyle = HERO.sun; g.beginPath(); g.arc(ax, 22, 13, 0, TAU); g.fill(); g.stroke(); g.fillStyle = '#fffdf2'; g.beginPath(); g.arc(ax - 3, 19, 5, 0, TAU); g.fill();
        // Gate and a sun crest (no letters, no borrowed logos).
        g.fillStyle = HERO.deep; g.beginPath(); g.moveTo(ax - 34, ay); g.lineTo(ax - 34, ay - 58); g.arc(ax, ay - 58, 34, Math.PI, 0); g.lineTo(ax + 34, ay); g.closePath(); g.fill(); g.stroke();
        l.fillStyle = '#ffe27a'; l.beginPath(); l.moveTo(ax - 24, ay); l.lineTo(ax - 24, ay - 56); l.arc(ax, ay - 56, 24, Math.PI, 0); l.lineTo(ax + 24, ay); l.closePath(); l.fill();
        g.fillStyle = HERO.sun; for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; g.beginPath(); g.moveTo(ax + Math.cos(a - .24) * 25, 244 + Math.sin(a - .24) * 25); g.lineTo(ax + Math.cos(a) * 42, 244 + Math.sin(a) * 42); g.lineTo(ax + Math.cos(a + .24) * 25, 244 + Math.sin(a + .24) * 25); g.closePath(); g.fill(); g.lineWidth = 3; g.stroke(); g.lineWidth = 4.5; }
        g.fillStyle = HERO.white; g.beginPath(); g.arc(ax, 244, 26, 0, TAU); g.fill(); g.stroke(); g.fillStyle = HERO.ultra; g.beginPath(); g.arc(ax, 244, 15, 0, TAU); g.fill();
        // Gleams.
        g.strokeStyle = '#fff'; g.lineWidth = 5; g.beginPath(); g.moveTo(108, 240); g.lineTo(126, 196); g.moveTo(120, 244); g.lineTo(132, 214); g.stroke();
      } else {
        const fort = [[20, ay], [14, 240], [40, 272], [52, 190], [86, 250], [104, 112], [132, 190], [160, 22], [188, 190], [216, 112], [234, 250], [268, 190], [280, 272], [306, 240], [300, ay]];
        // Toxic glow painted behind the spires.
        g.fillStyle = VIL.toxic; g.beginPath(); g.moveTo(160, 2); for (let i = 0; i < 22; i++) { const a = i / 22 * TAU, d = i % 2 ? 120 : 92; g.lineTo(ax + Math.cos(a) * d, 110 + Math.sin(a) * d * 1.12); } g.closePath(); g.globalAlpha = .14; g.fill(); g.globalAlpha = 1;
        g.beginPath(); fort.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.closePath(); g.fillStyle = '#2b1a52'; g.fill(); g.lineWidth = 6; g.stroke(); g.lineWidth = 4.5;
        // Hard lit facets on the left of each spike.
        g.fillStyle = '#5a3da3'; for (const [a, b, m] of [[[52, 190], [86, 250], 40], [[104, 112], [132, 190], 86], [[160, 22], [188, 190], 132], [[216, 112], [234, 250], 188], [[268, 190], [280, 272], 234]]) { g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(m + 4, b[1] + 36); g.closePath(); g.fill(); g.stroke(); }
        g.fillStyle = '#1b1038'; g.fillRect(24, 300, 272, ay - 300); g.strokeRect(24, 300, 272, ay - 300);
        // Toxic slits and a blood-orange seam.
        const slit = (x, y, h, w = 7) => { g.fillStyle = '#0d1a10'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y + h / 2); g.lineTo(x, y + h); g.lineTo(x - w, y + h / 2); g.closePath(); g.fill(); g.stroke(); l.fillStyle = VIL.toxic; l.beginPath(); l.moveTo(x, y + 2); l.lineTo(x + w - 2, y + h / 2); l.lineTo(x, y + h - 2); l.lineTo(x - w + 2, y + h / 2); l.closePath(); l.fill(); };
        slit(160, 90, 56, 9); slit(104, 158, 44); slit(216, 158, 44); slit(66, 232, 40); slit(254, 232, 40); slit(136, 216, 36); slit(184, 216, 36);
        for (const x of [60, 108, 212, 260]) slit(x, 322, 40, 8);
        g.strokeStyle = VIL.blood; g.lineWidth = 6; g.beginPath(); g.moveTo(24, 306); g.lineTo(296, 306); g.stroke(); g.strokeStyle = INK; g.lineWidth = 4.5;
        // Fanged gate.
        g.fillStyle = '#0f0820'; g.beginPath(); g.moveTo(ax - 44, ay); g.lineTo(ax - 40, ay - 76); g.lineTo(ax, ay - 104); g.lineTo(ax + 40, ay - 76); g.lineTo(ax + 44, ay); g.closePath(); g.fill(); g.stroke();
        l.fillStyle = VIL.toxic; l.beginPath(); l.moveTo(ax - 30, ay); l.lineTo(ax - 28, ay - 70); l.lineTo(ax, ay - 90); l.lineTo(ax + 28, ay - 70); l.lineTo(ax + 30, ay); l.closePath(); l.fill();
        g.fillStyle = '#d7d3ea'; for (let i = 0; i < 6; i++) { const x = ax - 36 + i * 14.4; g.beginPath(); g.moveTo(x, ay - 72 - Math.sin((i + .5) / 6 * Math.PI) * 18); g.lineTo(x + 7, ay - 42); g.lineTo(x + 14, ay - 72 - Math.sin((i + 1) / 6 * Math.PI) * 18); g.closePath(); g.fill(); g.lineWidth = 3; g.stroke(); g.lineWidth = 4.5; }
        // Toxic drips down the wall.
        g.fillStyle = VIL.toxic; for (const [x, y, h] of [[36, 300, 34], [88, 300, 22], [244, 300, 30], [286, 300, 18]]) { g.beginPath(); g.moveTo(x - 6, y); g.lineTo(x + 6, y); g.lineTo(x + 3, y + h); g.arc(x, y + h, 3.2, 0, Math.PI); g.closePath(); g.fill(); g.lineWidth = 2.6; g.stroke(); g.lineWidth = 4.5; }
      }
      return { c, L: L.c, w: W0, h: H0, ax, ay };
    });
  }
  function banner(team) {
    return once('ban' + team, () => {
      const col = team ? VIL.violet : HERO.ultra, trim = team ? VIL.toxic : HERO.sun, dark = team ? VIL.deep : HERO.deep, W0 = 80, H0 = 160, frames = [];
      for (let f = 0; f < 4; f++) {
        const { c, g } = mk(W0, H0), wave = x => Math.sin(x * .13 - f / 4 * TAU) * (x - 20) * .1;
        g.fillStyle = 'rgba(8,40,40,.4)'; g.beginPath(); g.ellipse(18, 150, 15, 6, 0, 0, TAU); g.fill();
        const top = 18, bot = 88, end = 72, flag = () => { g.beginPath(); g.moveTo(20, top); for (let x = 20; x <= end; x += 4) g.lineTo(x, top + wave(x)); g.lineTo(end, bot + wave(end) - 16); g.lineTo(end - 16, bot + wave(end - 16) - 26); for (let x = end - 20; x >= 20; x -= 4) g.lineTo(x, bot + wave(x) * .8); g.closePath(); };
        g.strokeStyle = INK; g.lineWidth = 7; flag(); g.stroke(); g.fillStyle = col; flag(); g.fill();
        g.save(); flag(); g.clip(); for (let x = 20; x < end; x += 12) { if (Math.sin(x * .13 - f / 4 * TAU) > 0) { g.fillStyle = dark; g.fillRect(x, 0, 12, H0); } } g.fillStyle = trim; g.fillRect(20, bot - 18, W0, 4); g.restore();
        g.strokeStyle = INK; g.lineWidth = 3.2; flag(); g.stroke();
        if (team) { g.fillStyle = trim; g.beginPath(); g.moveTo(44, 34 + wave(44)); g.lineTo(53, 54 + wave(44)); g.lineTo(44, 74 + wave(44)); g.lineTo(35, 54 + wave(44)); g.closePath(); g.fill(); g.stroke(); }
        else { g.fillStyle = trim; g.beginPath(); g.arc(44, 54 + wave(44), 14, 0, TAU); g.fill(); g.stroke(); g.fillStyle = HERO.white; g.beginPath(); g.arc(44, 54 + wave(44), 6, 0, TAU); g.fill(); }
        g.fillStyle = '#c99a4a'; g.fillRect(15, 10, 6, 140); g.strokeStyle = INK; g.lineWidth = 3.2; g.strokeRect(15, 10, 6, 140); g.fillStyle = HERO.sun; g.beginPath(); g.arc(18, 8, 7, 0, TAU); g.fill(); g.stroke();
        frames.push(c);
      }
      return { c: frames[0], frames, w: W0, h: H0, ax: 18, ay: 150 };
    });
  }
  // A hanging shop sign; its anchor is the top of the bracket so it swings like a real one.
  function sign(v) {
    return once('sg' + v % 3, () => {
      const { c, g } = mk(56, 70), col = ['#e8452f', '#2447ff', '#f0931a'][v % 3];
      g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.moveTo(18, 2); g.lineTo(18, 16); g.moveTo(38, 2); g.lineTo(38, 16); g.stroke();
      g.fillStyle = col; g.beginPath(); g.rect(6, 16, 44, 34); g.fill(); g.stroke();
      g.fillStyle = '#fffdf2'; g.beginPath(); if (v % 3 === 0) g.arc(28, 33, 9, 0, TAU); else if (v % 3 === 1) { g.rect(19, 25, 18, 16); } else { g.moveTo(28, 23); g.lineTo(38, 42); g.lineTo(18, 42); g.closePath(); } g.fill(); g.lineWidth = 2.4; g.stroke();
      return { c, w: 56, h: 70, ax: 28, ay: 2 };
    });
  }

  // ---------- towers ----------
  // One coin of a stack: a top face over an inked, reeded rim.
  function towerCoin(team, R) {
    return once(`tc${team}R${R}`, () => {
      const T = R * .34, ry = R * .72, W0 = R * 2 + 12, H0 = ry * 2 + T + 12, { c, g } = mk(W0, H0), cx = W0 / 2, cy = ry + 6;
      const rim = team ? '#3a1f78' : HERO.deep, top = team ? VIL.violet : HERO.ultra, trim = team ? VIL.toxic : HERO.sun, seam = team ? '#6a3fc4' : '#4a78ff';
      g.fillStyle = INK; g.beginPath(); g.ellipse(cx, cy + T, R + 4, ry + 4, 0, 0, TAU); g.fill(); g.fillRect(cx - R - 4, cy, R * 2 + 8, T); g.beginPath(); g.ellipse(cx, cy, R + 4, ry + 4, 0, 0, TAU); g.fill();
      g.fillStyle = rim; g.beginPath(); g.ellipse(cx, cy + T, R, ry, 0, 0, TAU); g.fill(); g.fillRect(cx - R, cy, R * 2, T);
      g.fillStyle = seam; g.fillRect(cx - R, cy + T * .1, R * .55, T * .5);
      g.strokeStyle = INK; g.lineWidth = 2.2; g.beginPath(); for (let i = 1; i < 18; i++) { const x = cx - Math.cos(i / 18 * Math.PI) * R, y = cy + Math.sqrt(Math.max(0, 1 - ((x - cx) / R) ** 2)) * ry; g.moveTo(x, y + 1); g.lineTo(x, y + T - 1); } g.stroke();
      g.fillStyle = top; g.beginPath(); g.ellipse(cx, cy, R, ry, 0, 0, TAU); g.fill();
      g.strokeStyle = INK; g.lineWidth = 3; g.beginPath(); g.ellipse(cx, cy, R, ry, 0, 0, TAU); g.stroke();
      g.strokeStyle = trim; g.lineWidth = R * .13; g.beginPath(); g.ellipse(cx, cy, R * .76, ry * .76, 0, 0, TAU); g.stroke();
      g.fillStyle = '#ffffff'; g.globalAlpha = .75; g.beginPath(); g.ellipse(cx - R * .34, cy - ry * .46, R * .24, ry * .15, -.35, 0, TAU); g.fill(); g.globalAlpha = 1;
      return { c, w: W0, h: H0, cx, cy };
    });
  }
  // The crown on top of a stack: Hero beacons hold a sun lens, Villain spires a fanged toxic crystal.
  function towerCrown(team, core) {
    return once(`cr${team}${core ? 'c' : 't'}`, () => {
      const k = core ? 1.32 : 1, W0 = 130 * k, H0 = 130 * k, { c, g } = mk(W0, H0), cx = W0 / 2, base = H0 - 6;
      g.save(); g.translate(cx, base); g.scale(k, k); g.strokeStyle = INK; g.lineWidth = 3.8;
      if (team === 0) {
        for (let i = 0; i < 9; i++) { const a = Math.PI + (i + .5) / 9 * Math.PI; g.fillStyle = HERO.sun; g.beginPath(); g.moveTo(Math.cos(a - .15) * 34, -58 + Math.sin(a - .15) * 34); g.lineTo(Math.cos(a) * (i % 2 ? 62 : 54), -58 + Math.sin(a) * (i % 2 ? 62 : 54)); g.lineTo(Math.cos(a + .15) * 34, -58 + Math.sin(a + .15) * 34); g.closePath(); g.fill(); g.stroke(); }
        g.fillStyle = '#fffdf2'; g.beginPath(); g.moveTo(-38, 0); g.lineTo(-30, -28); g.lineTo(30, -28); g.lineTo(38, 0); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = HERO.ultra; g.beginPath(); g.moveTo(-34, -6); g.lineTo(-29, -20); g.lineTo(29, -20); g.lineTo(34, -6); g.closePath(); g.fill();
        g.fillStyle = HERO.sun; g.beginPath(); g.arc(0, -56, 36, 0, TAU); g.fill(); g.stroke();
        g.fillStyle = HERO.white; g.beginPath(); g.arc(0, -56, 24, 0, TAU); g.fill(); g.lineWidth = 3; g.stroke();
        g.fillStyle = '#9ec8ff'; g.beginPath(); g.arc(0, -56, 14, 0, TAU); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(-6, -62, 5, 0, TAU); g.fill();
      } else {
        g.fillStyle = VIL.deep; g.beginPath(); [[-40, 0], [-44, -40], [-26, -22], [-22, -70], [-8, -36], [0, -102], [8, -36], [22, -70], [26, -22], [44, -40], [40, 0]].forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = VIL.violet; g.beginPath(); [[-22, -70], [-8, -36], [-22, -12]].forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.closePath(); g.fill(); g.beginPath(); [[0, -102], [8, -36], [0, -14], [-8, -36]].forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.closePath(); g.fill();
        g.fillStyle = VIL.toxic; g.beginPath(); g.moveTo(0, -80); g.lineTo(13, -44); g.lineTo(0, -18); g.lineTo(-13, -44); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = '#e9ffb8'; g.beginPath(); g.moveTo(-1, -68); g.lineTo(5, -46); g.lineTo(-4, -36); g.closePath(); g.fill();
        g.strokeStyle = VIL.blood; g.lineWidth = 4; g.beginPath(); g.moveTo(-38, -5); g.lineTo(38, -5); g.stroke();
      }
      g.restore();
      return { c, w: W0, h: H0, ax: cx, ay: base };
    });
  }

  // ---------- small animated props ----------
  function wave(v) {
    return once('wv' + v % 3, () => {
      const len = [58, 44, 74][v % 3], { c, g } = mk(len * 2 + 8, 34), cx = len + 4, y = 22;
      g.beginPath(); g.moveTo(cx - len, y); g.quadraticCurveTo(cx, y - 26, cx + len, y); g.quadraticCurveTo(cx + len * .3, y - 8, cx, y - 6); g.quadraticCurveTo(cx - len * .3, y - 8, cx - len, y); g.closePath(); g.fillStyle = '#ffffff'; g.fill();
      g.beginPath(); g.moveTo(cx - len * .55, y - 7); g.quadraticCurveTo(cx, y - 2, cx + len * .55, y - 7); g.quadraticCurveTo(cx, y + 5, cx - len * .55, y - 7); g.closePath(); g.fillStyle = '#7ef0ea'; g.fill();
      return { c, w: len * 2 + 8, h: 34 };
    });
  }
  function foam(v) {
    return once('fm' + v % 3, () => {
      const r = seeded(v * 13 + 7), { c, g } = mk(64, 30); g.fillStyle = '#ffffff'; g.strokeStyle = '#0b78b8'; g.lineWidth = 2.2; g.beginPath();
      for (let i = 0; i < 5; i++) { const x = 11 + i * 10.5, y = 16 + (r() - .5) * 6, R = 6 + r() * 4; g.moveTo(x + R, y); g.arc(x, y, R, 0, TAU); }
      g.stroke(); g.fill();
      return { c, w: 64, h: 30 };
    });
  }
  function spark() { return once('spk', () => { const { c, g } = mk(32, 32); g.fillStyle = '#ffffff'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, d = i % 2 ? 3 : 15; g[i ? 'lineTo' : 'moveTo'](16 + Math.cos(a) * d, 16 + Math.sin(a) * d); } g.closePath(); g.fill(); return { c, w: 32, h: 32 }; }); }
  function bird(f) {
    return once('bd' + f, () => {
      const { c, g } = mk(36, 28), wing = f ? -11 : 9; g.strokeStyle = INK; g.lineWidth = 3; g.fillStyle = '#fffdf2';
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(18, 15); g.quadraticCurveTo(18 + s * 8, 15 + wing, 18 + s * 16, 13 + wing * .6); g.quadraticCurveTo(18 + s * 8, 18, 18, 18); g.closePath(); g.fill(); g.stroke(); }
      g.beginPath(); g.ellipse(18, 16, 6, 4.5, 0, 0, TAU); g.fill(); g.stroke(); g.fillStyle = '#f0931a'; g.fillRect(16.5, 11, 3, 3);
      return { c, w: 36, h: 28 };
    });
  }
  function smoke(dark) {
    return once('sm' + (dark ? 1 : 0), () => {
      const { c, g } = mk(64, 64), r = seeded(dark ? 41 : 19), fill = dark ? '#3c2f5a' : '#fff7e6', edge = dark ? '#1b1436' : '#bfa98c';
      const cloud = (k, col) => { g.fillStyle = col; g.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, x = 32 + Math.cos(a) * 14, y = 32 + Math.sin(a) * 12, R = (10 + r() * 5) * k; g.moveTo(x + R, y); g.arc(x, y, R, 0, TAU); } g.moveTo(32 + 15 * k, 32); g.arc(32, 32, 15 * k, 0, TAU); g.fill(); };
      cloud(1.2, edge); cloud(1, fill);
      return { c, w: 64, h: 64 };
    });
  }
  function bubble() {
    return once('bub', () => {
      const { c, g } = mk(44, 50); g.strokeStyle = INK; g.lineWidth = 3.2; g.fillStyle = '#fffdf2'; g.beginPath(); g.arc(22, 20, 16, 0, TAU); g.moveTo(16, 34); g.lineTo(22, 46); g.lineTo(28, 34); g.fill(); g.stroke();
      g.fillStyle = '#fffdf2'; g.fillRect(17, 30, 10, 6); g.fillStyle = '#e8452f'; g.beginPath(); g.moveTo(19, 9); g.lineTo(25, 9); g.lineTo(23.6, 24); g.lineTo(20.4, 24); g.closePath(); g.fill(); g.beginPath(); g.arc(22, 29, 2.8, 0, TAU); g.fill();
      return { c, w: 44, h: 50 };
    });
  }
  // A stepped pool of light for the lightmap. Hard rings, softened only by the upscale.
  // Soft on purpose: at lightmap resolution a hard-edged pool shows up as blotches on the road.
  function pool(col) {
    return once('pl' + col, () => {
      const c = cv(96, 96), g = c.getContext('2d'), gr = g.createRadialGradient(48, 48, 0, 48, 48, 48), rgb = [1, 3, 5].map(i => parseInt(col.slice(i, i + 2), 16)).join(',');
      gr.addColorStop(0, `rgba(${rgb},.92)`); gr.addColorStop(.45, `rgba(${rgb},.66)`); gr.addColorStop(.8, `rgba(${rgb},.14)`); gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr; g.fillRect(0, 0, 96, 96);
      return c;
    });
  }
  function cloudShadow(v) {
    return once('cs' + v % 3, () => {
      const W0 = 420, H0 = 210, c = cv(W0, H0), g = c.getContext('2d'), r = seeded(v * 37 + 3), col = 'rgba(16,14,70,1)', s = r() * 1e6 | 0, draw = t => { const q = seeded(s); t.beginPath(); blob(t, 130, 105, 88, q, .62, 9); blob(t, 240, 92, 108, q, .62, 9); blob(t, 318, 116, 72, q, .62, 9); t.fill(); };
      g.fillStyle = col; draw(g); halftone(g, W0, H0, draw, col, 12, 2);
      return { c, w: W0, h: H0 };
    });
  }
  function ramp(stops) {
    return once('rp' + stops.join(), () => {
      const c = cv(4, 64), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 64); stops.forEach((s, i) => gr.addColorStop(i / (stops.length - 1), s)); g.fillStyle = gr; g.fillRect(0, 0, 4, 64); return c;
    });
  }
  return { paint, cliff, tree: calmed(tree, .12), lantern, pillar: calmed(pillar, .16), banner, house: calmed(house, .14), hq: calmed(hq, .06), sign: calmed(sign, .14), towerCoin, towerCrown, wave, foam, spark, bird, smoke, bubble, pool, cloudShadow, ramp, nearRoad, spline, RIVER, HALF, INK };
})();
