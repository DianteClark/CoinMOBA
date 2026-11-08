// The map: painted once to a large canvas, plus sprites for raised scenery.
const Terrain = (() => {
  const { TILT, TAU, cv, seeded } = Art;
  function spline(pts, n = 12) {
    const o = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
      for (let k = 0; k < n; k++) { const t = k / n, t2 = t * t, t3 = t2 * t; o.push([0, 1].map(a => .5 * ((2 * p1[a]) + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3))); }
    }
    o.push(pts[pts.length - 1]); return o;
  }
  function noise(w, h, r, col, max) { const c = cv(w, h), g = c.getContext('2d'), im = g.createImageData(w, h); for (let i = 0; i < w * h; i++) { const k = i * 4, v = r(); im.data[k] = col[0]; im.data[k + 1] = col[1]; im.data[k + 2] = col[2]; im.data[k + 3] = v * v * max * 255; } g.putImageData(im, 0, 0); return c; }
  const RIVER = [[1540, -80], [1680, 300], [1500, 620], [1600, 950], [1700, 1280], [1520, 1600], [1660, 1980]];
  const HALF = 92;

  function paint(map, towers, GS, sites = []) {
    const W = map.W, Ht = Math.ceil(map.H * TILT), c = cv(W * GS, Ht * GS), g = c.getContext('2d'), r = seeded(90210), Y = y => y * TILT;
    g.scale(GS, GS); g.imageSmoothingQuality = 'high'; g.lineCap = 'round'; g.lineJoin = 'round';
    // meadow
    const bg = g.createLinearGradient(0, 0, 0, Ht); bg.addColorStop(0, '#2b6a4c'); bg.addColorStop(.5, '#39805a'); bg.addColorStop(1, '#2b6a4c'); g.fillStyle = bg; g.fillRect(0, 0, W, Ht);
    g.drawImage(noise(34, 16, r, [150, 190, 90], .55), 0, 0, W, Ht);
    g.drawImage(noise(130, 58, r, [190, 214, 110], .22), 0, 0, W, Ht);
    g.drawImage(noise(30, 14, r, [12, 56, 54], .7), 0, 0, W, Ht);
    g.drawImage(noise(150, 66, r, [10, 44, 40], .22), 0, 0, W, Ht);
    for (let i = 0; i < 12000; i++) { const x = r() * W, y = r() * Ht, l = 4 + r() * 8, v = r(); g.strokeStyle = v > .55 ? `rgba(170,214,130,${.14 + r() * .2})` : v > .2 ? `rgba(120,178,110,${.14 + r() * .16})` : 'rgba(16,58,48,.28)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + (r() - .5) * 3, y - l * .6, x + (r() - .5) * 7, y - l); g.stroke(); }

    // river
    const cen = spline(RIVER, 18), path = new Path2D(); cen.forEach(([x, y], i) => path[i ? 'lineTo' : 'moveTo'](x, Y(y)));
    const bankStroke = (w, col) => { g.strokeStyle = col; g.lineWidth = w; g.stroke(path); };
    bankStroke(262, 'rgba(34,92,68,.7)'); bankStroke(234, '#8c8a64'); bankStroke(212, '#6e7a5e'); bankStroke(196, '#2c6f7a');
    for (let i = 0; i < 9; i++) bankStroke(HALF * 2 - 6 - i * 19, Art.mix('#176274', '#44b6c6', i / 8));
    // river bank pebbles and reeds
    for (const [x, y] of cen) for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const px = x + s * (104 + r() * 20) + (r() - .5) * 20, py = Y(y) + (r() - .5) * 24; g.fillStyle = r() > .5 ? 'rgba(198,190,150,.8)' : 'rgba(92,96,80,.8)'; g.beginPath(); g.ellipse(px, py, 3 + r() * 7, 2 + r() * 4, 0, 0, TAU); g.fill(); }
    for (let i = 0; i < 230; i++) { const [x, y] = cen[r() * cen.length | 0], s = r() > .5 ? 1 : -1, px = x + s * (HALF + 6 + r() * 16), py = Y(y) + (r() - .5) * 30; g.strokeStyle = r() > .5 ? '#6ea468' : '#4d8a5a'; g.lineWidth = 2; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(px + k * 2, py); g.quadraticCurveTo(px + k * 3, py - 14, px + k * 6, py - 24 - r() * 8); g.stroke(); } }

    const riverClip = new Path2D(), L = [], Rr = [];
    cen.forEach(([x, y], i) => { const a = cen[Math.max(0, i - 1)], b = cen[Math.min(cen.length - 1, i + 1)], dx = b[0] - a[0], dy = Y(b[1]) - Y(a[1]), l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l; L.push([x + nx * HALF, Y(y) + ny * HALF]); Rr.push([x - nx * HALF, Y(y) - ny * HALF]); });
    L.forEach(([x, y], i) => riverClip[i ? 'lineTo' : 'moveTo'](x, y)); Rr.reverse().forEach(([x, y]) => riverClip.lineTo(x, y)); riverClip.closePath();
    const edges = new Path2D(); L.forEach(([x, y], i) => edges[i ? 'lineTo' : 'moveTo'](x, y)); Rr.forEach(([x, y], i) => edges[i ? 'lineTo' : 'moveTo'](x, y));
    const table = []; for (let y = -80; y <= map.H + 80; y += 20) { let bx = 0, bd = 1e9; for (const [x, yy] of cen) { const d = Math.abs(yy - y); if (d < bd) { bd = d; bx = x; } } table.push(bx); }

    // cobbled roads, drawn over the river as bridges
    for (const lane of map.lanes) {
      const pts = spline(lane, 16), p = new Path2D(); pts.forEach(([x, y], i) => p[i ? 'lineTo' : 'moveTo'](x, Y(y)));
      const st = (w, col) => { g.strokeStyle = col; g.lineWidth = w; g.stroke(p); };
      st(214, 'rgba(26,74,56,.55)'); st(188, '#5f5843'); st(176, '#a79a79');
      let along = 0;
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i], d = Math.hypot(bx - ax, Y(by) - Y(ay)), ux = (bx - ax) / (d || 1), uy = (Y(by) - Y(ay)) / (d || 1);
        for (let s = 0; s < d; s += 19) {
          const row = Math.round((along + s) / 19);
          for (let lat = -76; lat <= 76; lat += 19) {
            const off = row % 2 ? 9.5 : 0, q = lat + off; if (Math.abs(q) > 80) continue; const v = r();
            const x = ax + ux * s - uy * q + (r() - .5) * 3, y = Y(ay) + uy * s + ux * q * .92 + (r() - .5) * 2;
            g.fillStyle = v > .7 ? '#bcae8b' : v > .3 ? '#b0a281' : '#9f9273'; g.beginPath(); g.ellipse(x, y, 8.5, 6.6, 0, 0, TAU); g.fill();
            g.fillStyle = 'rgba(255,246,214,.2)'; g.beginPath(); g.ellipse(x - 1, y - 1.8, 5, 2.6, 0, 0, TAU); g.fill();
          }
        }
        along += d;
      }
      st(70, 'rgba(240,226,186,.08)');
      // grass spilling over the road edge
      for (let i = 0; i < pts.length; i += 1) for (const sd of [-1, 1]) for (let k = 0; k < 2; k++) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dy = Y(b[1]) - Y(a[1]), l = Math.hypot(dx, dy) || 1, x = pts[i][0] - dy / l * sd * (86 + r() * 10) + (r() - .5) * 20, y = Y(pts[i][1]) + dx / l * sd * (82 + r() * 10); if (x > 1440 && x < 1760) continue; g.strokeStyle = r() > .5 ? '#5c9a62' : '#3f7f58'; g.lineWidth = 2; for (let j = -2; j <= 2; j++) { g.beginPath(); g.moveTo(x + j * 2, y); g.quadraticCurveTo(x + j * 3, y - 9, x + j * 5, y - 15 - r() * 6); g.stroke(); } }
    }
    // bridges: found where each road actually crosses the river, so rails, water and foam agree
    const bridges = map.lanes.map(lane => { const pts = spline(lane, 16); let best = pts[0], bd = 1e9; for (const p of pts) { const d = Math.abs(p[0] - table[Math.max(0, Math.min(table.length - 1, Math.round((p[1] + 80) / 20)))]); if (d < bd) { bd = d; best = p; } } return { x: best[0], y: best[1], pts }; });
    const ROAD = 90, SPAN = 164;
    for (const b of bridges) for (const o of [-ROAD, ROAD]) {
      const y = Y(b.y) + o, x0 = b.x - SPAN, w = SPAN * 2;
      g.fillStyle = 'rgba(8,30,34,.4)'; g.fillRect(x0, y + 7, w, 8); g.fillStyle = '#6d6650'; g.fillRect(x0, y - 6, w, 13); g.fillStyle = '#cfc29c'; g.fillRect(x0, y - 8, w, 5);
      for (let x = x0 + 4; x < x0 + w - 8; x += 42) { g.fillStyle = '#857b60'; g.fillRect(x, y - 12, 14, 18); g.fillStyle = '#dccfa8'; g.fillRect(x, y - 14, 14, 5); }
    }

    // struck plazas
    const plaza = (x, y, R, tint) => {
      g.save(); g.translate(x, Y(y)); g.scale(1, TILT);
      g.fillStyle = 'rgba(14,42,34,.45)'; g.beginPath(); g.arc(0, 8, R + 16, 0, TAU); g.fill();
      g.fillStyle = '#6a6350'; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
      g.fillStyle = '#c1b491'; g.beginPath(); g.arc(0, 0, R * .965, 0, TAU); g.fill();
      for (let ring = .94; ring > .1; ring -= .1) { const n = Math.round(ring * R / 3.4); for (let i = 0; i < n; i++) { const a = i / n * TAU + ring * 3, xx = Math.cos(a) * R * ring, yy = Math.sin(a) * R * ring, v = r(); g.fillStyle = v > .66 ? '#c9bc99' : v > .33 ? '#b7aa88' : '#a99c7b'; g.save(); g.translate(xx, yy); g.rotate(a); g.fillRect(-R * .04, -R * .018, R * .08, R * .036 + 8); g.restore(); } }
      for (let i = 0; i < 120; i++) { g.save(); g.rotate(i / 120 * TAU); g.fillStyle = 'rgba(44,34,20,.5)'; g.fillRect(-1.5, -R, 3, R * .035); g.restore(); }
      g.strokeStyle = tint; g.lineWidth = 7; for (const k of [.76, .36]) { g.beginPath(); g.arc(0, 0, R * k, 0, TAU); g.stroke(); }
      for (let i = 0; i < 16; i++) { g.save(); g.rotate(i / 16 * TAU); g.fillStyle = tint; g.beginPath(); g.moveTo(0, -R * .74); g.lineTo(9, -R * .56); g.lineTo(0, -R * .48); g.lineTo(-9, -R * .56); g.closePath(); g.fill(); g.restore(); }
      g.restore();
    };
    plaza(210, 950, 390, '#58a6e6'); plaza(W - 210, 950, 390, '#e4573f'); plaza(1600, 950, 268, '#e7bd5c');
    // Hero HQ: a bright sunburst inlay. Villain Lair: scorched stone split by glowing cracks.
    g.save(); g.translate(210, Y(950)); g.scale(1, TILT);
    for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; g.fillStyle = i % 2 ? 'rgba(255,214,120,.5)' : 'rgba(88,166,230,.42)'; g.beginPath(); g.moveTo(Math.cos(a) * 156, Math.sin(a) * 156); g.arc(0, 0, 370, a, a + TAU / 24); g.closePath(); g.fill(); }
    g.restore();
    g.save(); g.translate(W - 210, Y(950)); g.scale(1, TILT);
    g.fillStyle = 'rgba(22,14,20,.62)'; g.beginPath(); g.arc(0, 0, 380, 0, TAU); g.fill();
    for (let i = 0; i < 15; i++) { let a = i / 15 * TAU + r() * .2, d = 150; const crack = () => { g.beginPath(); g.moveTo(Math.cos(a) * d, Math.sin(a) * d); let aa = a, dd = d; while (dd < 372) { dd += 26 + r() * 34; aa += (r() - .5) * .22; g.lineTo(Math.cos(aa) * Math.min(dd, 372), Math.sin(aa) * Math.min(dd, 372)); } g.stroke(); }; g.strokeStyle = '#2a0d0a'; g.lineWidth = 11; crack(); g.strokeStyle = '#ff5a2e'; g.lineWidth = 3.4; a = i / 15 * TAU + .1; crack(); }
    g.restore();
    // town squares where the civilians wait
    for (const site of sites) { g.save(); g.translate(site.x, Y(site.y)); g.scale(1, TILT); g.fillStyle = 'rgba(14,42,34,.4)'; g.beginPath(); g.arc(0, 6, 124, 0, TAU); g.fill(); g.fillStyle = '#6a6350'; g.beginPath(); g.arc(0, 0, 116, 0, TAU); g.fill(); g.fillStyle = '#bcae8d'; g.beginPath(); g.arc(0, 0, 110, 0, TAU); g.fill(); for (let i = 0; i < 70; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 104; g.fillStyle = r() > .5 ? 'rgba(255,246,214,.22)' : 'rgba(70,58,38,.2)'; g.beginPath(); g.ellipse(Math.cos(a) * d, Math.sin(a) * d, 7, 5, a, 0, TAU); g.fill(); } g.strokeStyle = '#e7bd5c'; g.lineWidth = 5; g.beginPath(); g.arc(0, 0, 66, 0, TAU); g.stroke(); g.restore(); }
    for (const [x, col] of [[95, '#58a6e6'], [W - 95, '#e4573f']]) {
      g.save(); g.translate(x, Y(950)); g.scale(1, TILT); g.fillStyle = '#4b4636'; g.beginPath(); g.arc(0, 0, 148, 0, TAU); g.fill();
      const gl = g.createRadialGradient(0, 0, 8, 0, 0, 136); gl.addColorStop(0, '#fff6d8'); gl.addColorStop(.3, col); gl.addColorStop(1, Art.mix(col, '#07211f', .55)); g.fillStyle = gl; g.beginPath(); g.arc(0, 0, 134, 0, TAU); g.fill(); g.restore();
    }
    // tower plinths
    for (const t of towers) { const R = t.sub === 'core' ? 96 : 68; g.save(); g.translate(t.x, Y(t.y)); g.scale(1, TILT); g.fillStyle = 'rgba(10,30,26,.4)'; g.beginPath(); g.arc(0, 7, R + 8, 0, TAU); g.fill(); g.fillStyle = '#5d5746'; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill(); g.fillStyle = '#b4a784'; g.beginPath(); g.arc(0, -3, R * .93, 0, TAU); g.fill(); for (let i = 0; i < 20; i++) { g.save(); g.rotate(i / 20 * TAU); g.fillStyle = 'rgba(60,48,30,.4)'; g.fillRect(-1.2, -R * .93, 2.4, R * .32); g.restore(); } g.restore(); }
    // meadow flowers, kept off the roads by colour contrast
    const flowers = ['#f7e8b0', '#f4b7c6', '#cfe0ff', '#ffd46a'];
    for (let i = 0; i < 160; i++) { const cx = r() * W, cy = r() * Ht, col = flowers[r() * 4 | 0]; if (nearRoad(map, cx, cy / TILT) < 130 || Math.abs(cx - 1600) < 200) continue; g.fillStyle = col; for (let k = 0; k < 12; k++) { g.beginPath(); g.arc(cx + (r() - .5) * 70, cy + (r() - .5) * 42, 1.6 + r() * 1.4, 0, TAU); g.fill(); } }
    // brush beds
    for (const b of map.brush) { g.fillStyle = 'rgba(9,44,34,.55)'; g.beginPath(); g.ellipse(b.x, Y(b.y), b.r * 1.08, b.r * 1.08 * TILT, 0, 0, TAU); g.fill(); }
    // wall contact shadows and forest edge
    for (const w of map.walls) if (!w.big) { const sh = g.createLinearGradient(0, Y(w.y + w.h) + 2, 0, Y(w.y + w.h) + 40); sh.addColorStop(0, 'rgba(6,24,20,.6)'); sh.addColorStop(1, 'rgba(6,24,20,0)'); g.fillStyle = sh; g.fillRect(w.x - 12, Y(w.y + w.h) + 2, w.w + 24, 38); }
    const edge = (x0, y0, x1, y1, X, Yy, ww, hh) => { const e = g.createLinearGradient(x0, y0, x1, y1); e.addColorStop(0, 'rgba(6,28,24,.82)'); e.addColorStop(1, 'rgba(6,28,24,0)'); g.fillStyle = e; g.fillRect(X, Yy, ww, hh); };
    edge(0, 0, 0, 150, 0, 0, W, 150); edge(0, Ht, 0, Ht - 150, 0, Ht - 150, W, 150); edge(0, 0, 120, 0, 0, 0, 120, Ht); edge(W, 0, W - 120, 0, W - 120, 0, 120, Ht);
    for (const w of map.walls) if (w.big) { const cx = w.x + w.w / 2, cy = Y(w.y + w.h / 2), gr = g.createRadialGradient(cx, cy, 80, cx, cy, 340); gr.addColorStop(0, 'rgba(6,28,24,.95)'); gr.addColorStop(1, 'rgba(6,28,24,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(cx, cy, 340, 340, 0, 0, TAU); g.fill(); }
    // Roads and the centre plaza are painted over the river, so animated water must stay off them.
    // Clip with river first, then dry (even-odd: everything except bridge decks and the plaza).
    const PLAZA = { x: 1600, y: 950, r: 268 }, dry = new Path2D();
    dry.rect(-400, -400, W + 800, Ht + 800);
    dry.ellipse(PLAZA.x, Y(PLAZA.y), PLAZA.r, PLAZA.r * TILT, 0, 0, TAU);
    const deck = (b, sgn) => b.pts.filter(p => Math.abs(p[0] - b.x) < 340).map((p, i, a) => { const q = a[Math.min(a.length - 1, i + 1)], o = a[Math.max(0, i - 1)], dx = q[0] - o[0], dy = Y(q[1]) - Y(o[1]), l = Math.hypot(dx, dy) || 1; return [p[0] - dy / l * sgn * 94, Y(p[1]) + dx / l * sgn * 94]; });
    for (const b of bridges) {
      const hi = deck(b, -1), lo = deck(b, 1);
      hi.forEach(([x, y], i) => dry[i ? 'lineTo' : 'moveTo'](x, y)); lo.reverse().forEach(([x, y]) => dry.lineTo(x, y)); dry.closePath();
      for (const e of [hi, lo]) e.forEach(([x, y], i) => edges[i ? 'lineTo' : 'moveTo'](x, y));
    }
    edges.moveTo(PLAZA.x + PLAZA.r + 2, Y(PLAZA.y)); edges.ellipse(PLAZA.x, Y(PLAZA.y), PLAZA.r + 2, (PLAZA.r + 2) * TILT, 0, 0, TAU);
    const riverX = y => table[Math.max(0, Math.min(table.length - 1, Math.round((y + 80) / 20)))];
    const water = (x, y) => Math.abs(x - riverX(y)) < HALF && Math.hypot(x - PLAZA.x, y - PLAZA.y) > PLAZA.r && !bridges.some(b => Math.abs(y - b.y) < 127);
    return { c, W, H: Ht, scale: GS, river: riverClip, dry, edges, riverX, water, bridges: bridges.map(b => ({ x: b.x, y: b.y })) };
  }
  function nearRoad(map, x, y) { let b = 1e9; for (const L of map.lanes) for (let i = 1; i < L.length; i++) { const [ax, ay] = L[i - 1], [bx, by] = L[i], dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))); b = Math.min(b, Math.hypot(x - ax - dx * t, y - ay - dy * t)); } return b; }

  const cache = new Map();
  function cliff(w, seed) {
    const id = `c${w.w}x${w.h}`; if (cache.has(id)) return cache.get(id);
    const lift = 66, P = 16, tw = w.w + P * 2, th = w.h * TILT, c = cv(tw, th + lift + P * 2 + 14), g = c.getContext('2d'), r = seeded((w.w * 31 + w.h * 17) | 1);
    const out = []; const step = 26, jit = 7;
    const top = (x0, y0, x1, y1) => { const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(d / step)); for (let i = 0; i < n; i++) { const t = i / n; out.push([x0 + (x1 - x0) * t + (r() - .5) * jit, y0 + (y1 - y0) * t + (r() - .5) * jit * .7]); } };
    const x0 = P, y0 = P, x1 = P + w.w, y1 = P + th;
    top(x0, y0, x1, y0); top(x1, y0, x1, y1); top(x1, y1, x0, y1); top(x0, y1, x0, y0);
    const poly = (dy) => { g.beginPath(); out.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y + dy)); g.closePath(); };
    // rock face, facet by facet along the front
    const front = out.filter(([, y]) => y > y1 - jit - 4);
    g.fillStyle = '#2c3a35'; poly(lift); g.fill();
    g.beginPath(); front.sort((a, b) => a[0] - b[0]); g.moveTo(front[0][0], front[0][1]); for (const [x, y] of front) g.lineTo(x, y); for (let i = front.length - 1; i >= 0; i--) g.lineTo(front[i][0], front[i][1] + lift); g.closePath();
    const fc = g.createLinearGradient(0, y1, 0, y1 + lift); fc.addColorStop(0, '#7a7a68'); fc.addColorStop(.55, '#55594c'); fc.addColorStop(1, '#2f3a33'); g.fillStyle = fc; g.fill();
    for (let i = 0; i < front.length - 1; i++) { const [ax, ay] = front[i], [bx, by] = front[i + 1], sh = r(); g.fillStyle = sh > .6 ? 'rgba(255,244,214,.09)' : sh > .3 ? 'rgba(10,18,16,.14)' : 'rgba(10,18,16,.26)'; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo(bx - (r() - .5) * 8, by + lift * (.7 + r() * .3)); g.lineTo(ax + (r() - .5) * 8, ay + lift * (.7 + r() * .3)); g.closePath(); g.fill(); }
    g.strokeStyle = 'rgba(8,18,14,.28)'; g.lineWidth = 1.6; for (let k = 1; k < 4; k++) { g.beginPath(); front.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y + lift * k / 4 + (r() - .5) * 3)); g.stroke(); }
    // turf top
    const tp = g.createLinearGradient(0, y0, 0, y1); tp.addColorStop(0, '#4f9068'); tp.addColorStop(1, '#3b7a58'); g.fillStyle = tp; poly(0); g.fill();
    g.save(); poly(0); g.clip();
    for (let i = 0; i < tw * th / 34; i++) { const x = r() * tw, y = r() * (th + P * 2), v = r(); g.strokeStyle = v > .5 ? 'rgba(170,214,130,.42)' : 'rgba(16,58,48,.32)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - .5) * 4, y - 4 - r() * 6); g.stroke(); }
    g.restore();
    g.strokeStyle = 'rgba(205,232,170,.5)'; g.lineWidth = 2.2; g.beginPath(); front.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y - 1)); g.stroke();
    // grass tongues over the lip
    for (const [x, y] of front) for (let k = 0; k < 3; k++) { const px = x + (r() - .5) * 26; g.fillStyle = r() > .5 ? '#46865f' : '#3b7a58'; g.beginPath(); g.moveTo(px - 5, y - 2); g.lineTo(px + 5, y - 2); g.lineTo(px + (r() - .5) * 3, y + 7 + r() * 11); g.closePath(); g.fill(); }
    // small boulders on top
    for (let i = 0; i < (w.w * w.h) / 5200; i++) { const x = x0 + 14 + r() * (w.w - 28), y = y0 + 10 + r() * (th - 18), R = 7 + r() * 10; g.fillStyle = '#3a4a40'; g.beginPath(); g.ellipse(x, y + 3, R, R * .72, 0, 0, TAU); g.fill(); g.fillStyle = '#8c9484'; g.beginPath(); g.ellipse(x - 1, y, R * .94, R * .64, 0, 0, TAU); g.fill(); }
    const res = { c, lift, P }; cache.set(id, res); return res;
  }

  function tree(v) {
    const id = 't' + v; if (cache.has(id)) return cache.get(id);
    const R = 46 + (v % 3) * 12, c = cv(R * 2 + 8, R * 2.7 + 8), g = c.getContext('2d'), cx = c.width / 2, autumn = v === 3;
    const ramp = autumn ? [['#7a4f1e', '#4f3012', '#b98a3a'], ['#a06f24', '#6b4716', '#e0b24c'], ['#c8922e', '#8a5e1b', '#f5d07a']] : [['#1b4638', '#0f2f28', '#2f6a55'], ['#26594a', '#173f34', '#4b9378'], ['#33775f', '#1f4e3f', '#74b890']];
    const base = c.height - R * .75 - 4;
    g.fillStyle = '#3a2c20'; g.fillRect(cx - 5, base - 14, 10, 26);
    [[1, 0], [.76, .62], [.5, 1.16]].forEach(([k, up], i) => {
      const y = base - R * up - 8, rx = R * k, ry = rx * .72, [a, b, hi] = ramp[i];
      g.fillStyle = b; g.beginPath(); g.ellipse(cx, y + 10, rx, ry, 0, 0, TAU); g.fill();
      const f = g.createRadialGradient(cx - rx * .35, y - ry * .5, 2, cx, y, rx); f.addColorStop(0, hi); f.addColorStop(1, a); g.fillStyle = f; g.beginPath(); g.ellipse(cx, y, rx, ry, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,255,220,.14)'; g.lineWidth = 2; g.beginPath(); g.ellipse(cx, y, rx * .86, ry * .86, 0, Math.PI * 1.05, Math.PI * 1.7); g.stroke();
    });
    const out = { c, ax: cx, ay: base + R * .5 }; cache.set(id, out); return out;
  }
  function lantern(red = false) {
    const lid = red ? 'lanR' : 'lan'; if (cache.has(lid)) return cache.get(lid); const c = cv(40, 96), g = c.getContext('2d');
    g.fillStyle = 'rgba(6,20,18,.3)'; g.beginPath(); g.ellipse(20, 88, 15, 6, 0, 0, TAU); g.fill();
    g.fillStyle = '#655e4b'; g.fillRect(12, 80, 16, 8); g.fillStyle = '#7e7660'; g.fillRect(16, 38, 8, 44); g.fillStyle = '#a79c7d'; g.fillRect(16, 38, 3, 44);
    g.fillStyle = red ? '#ff6a48' : '#ffe4a2'; g.fillRect(11, 18, 18, 22); g.fillStyle = '#4c4636'; g.fillRect(11, 18, 3, 22); g.fillRect(26, 18, 3, 22);
    g.fillStyle = '#5d5645'; g.beginPath(); g.moveTo(5, 18); g.lineTo(20, 4); g.lineTo(35, 18); g.closePath(); g.fill(); g.fillRect(9, 38, 22, 4);
    const o = { c, ax: 20, ay: 86, lightY: 62 }; cache.set(lid, o); return o;
  }
  function pillar() {
    if (cache.has('pil')) return cache.get('pil'); const c = cv(64, 150), g = c.getContext('2d');
    g.fillStyle = 'rgba(6,20,18,.3)'; g.beginPath(); g.ellipse(32, 138, 27, 10, 0, 0, TAU); g.fill();
    const f = g.createLinearGradient(12, 0, 52, 0); f.addColorStop(0, '#d8cca8'); f.addColorStop(.6, '#a89c7c'); f.addColorStop(1, '#6e6650'); g.fillStyle = f; g.fillRect(14, 34, 36, 104);
    g.fillStyle = 'rgba(50,40,24,.3)'; for (let x = 18; x < 50; x += 8) g.fillRect(x, 40, 2, 92);
    g.fillStyle = '#8b8064'; g.beginPath(); g.ellipse(32, 138, 24, 9, 0, 0, Math.PI); g.fill(); g.fillStyle = '#e4d9b5'; g.beginPath(); g.ellipse(32, 34, 25, 10, 0, 0, TAU); g.fill();
    g.fillStyle = '#4a4333'; g.beginPath(); g.ellipse(32, 30, 18, 6, 0, 0, TAU); g.fill();
    const o = { c, ax: 32, ay: 136, lightY: 112 }; cache.set('pil', o); return o;
  }
  // A town house. `lit` is a separate overlay of the window glass so windows can dim with hope.
  function house(v) {
    const id = 'h' + v; if (cache.has(id)) return cache.get(id);
    const W0 = 120, H0 = 132, c = cv(W0, H0), g = c.getContext('2d'), L = cv(W0, H0), l = L.getContext('2d');
    const wall = ['#d8c6a0', '#b98f6a', '#c9b49a', '#a8a08c'][v % 4], roof = ['#a4553c', '#5c6d7a', '#7c4a3a', '#4f6a58'][v % 4], x0 = 16, y0 = 62, w = 88, h = 54;
    g.fillStyle = 'rgba(6,20,18,.32)'; g.beginPath(); g.ellipse(60, 118, 54, 12, 0, 0, TAU); g.fill();
    g.fillStyle = wall; g.fillRect(x0, y0, w, h); g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(x0 + w - 16, y0, 16, h); g.strokeStyle = '#3a2c20'; g.lineWidth = 2.4; g.strokeRect(x0, y0, w, h);
    g.fillStyle = '#6a5a44'; g.fillRect(x0 + 64 - 16, 16, 12, 30); g.strokeRect(x0 + 64 - 16, 16, 12, 30);
    g.fillStyle = roof; g.beginPath(); g.moveTo(6, y0 + 2); g.lineTo(60, 14); g.lineTo(114, y0 + 2); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 1.5; for (let i = 1; i < 5; i++) { const t = i / 5; g.beginPath(); g.moveTo(60 - 54 * t, 14 + (y0 - 12) * t); g.lineTo(60 + 54 * t, 14 + (y0 - 12) * t); g.stroke(); }
    g.fillStyle = '#4c3626'; g.fillRect(x0 + 36, y0 + 22, 18, 32); g.strokeStyle = '#2a1c12'; g.lineWidth = 2; g.strokeRect(x0 + 36, y0 + 22, 18, 32); g.fillStyle = '#e0b552'; g.beginPath(); g.arc(x0 + 50, y0 + 40, 2, 0, TAU); g.fill();
    for (const wx of [x0 + 10, x0 + 62]) { g.fillStyle = '#2b3a44'; g.fillRect(wx, y0 + 12, 18, 20); g.strokeStyle = '#3a2c20'; g.lineWidth = 2.2; g.strokeRect(wx, y0 + 12, 18, 20); l.fillStyle = '#ffd98a'; l.fillRect(wx + 1, y0 + 13, 16, 18); l.fillStyle = 'rgba(120,70,20,.55)'; l.fillRect(wx + 8, y0 + 13, 2, 18); l.fillRect(wx + 1, y0 + 21, 16, 2); }
    g.fillStyle = '#2b3a44'; g.beginPath(); g.arc(60, y0 - 16, 7, 0, TAU); g.fill(); g.strokeStyle = '#3a2c20'; g.stroke(); l.fillStyle = '#ffd98a'; l.beginPath(); l.arc(60, y0 - 16, 6, 0, TAU); l.fill();
    const o = { c, L, ax: 60, ay: 118, chimX: x0 + 54 - 60, chimY: 118 - 14 }; cache.set(id, o); return o;
  }
  // Hero HQ: a bright tower with a sun dome. Villain Lair: a jagged keep with glowing slits.
  function hq(team) {
    const id = 'hq' + team; if (cache.has(id)) return cache.get(id);
    const c = cv(260, 300), g = c.getContext('2d'), ax = 130, ay = 284; g.lineJoin = 'round';
    g.fillStyle = 'rgba(6,20,18,.34)'; g.beginPath(); g.ellipse(ax, ay, 116, 24, 0, 0, TAU); g.fill();
    g.strokeStyle = '#14100e'; g.lineWidth = 4;
    const box = (x, y, w, h, f) => { g.fillStyle = f; g.fillRect(x, y, w, h); g.strokeRect(x, y, w, h); };
    if (team === 0) {
      box(30, 170, 200, 114, '#e7ddc4'); box(80, 74, 100, 210, '#f4ecd6'); g.fillStyle = 'rgba(0,0,0,.1)'; g.fillRect(150, 76, 28, 206);
      for (let i = 0; i < 9; i++) { const a = Math.PI + i / 8 * Math.PI; g.fillStyle = '#ffc23c'; g.beginPath(); g.moveTo(130 + Math.cos(a - .12) * 52, 74 + Math.sin(a - .12) * 52); g.lineTo(130 + Math.cos(a) * 88, 74 + Math.sin(a) * 88); g.lineTo(130 + Math.cos(a + .12) * 52, 74 + Math.sin(a + .12) * 52); g.closePath(); g.fill(); g.stroke(); }
      g.fillStyle = '#58a6e6'; g.beginPath(); g.arc(130, 74, 52, Math.PI, 0); g.closePath(); g.fill(); g.stroke();
      for (const [x, y] of [[96, 100], [146, 100], [96, 144], [146, 144], [46, 200], [186, 200]]) { box(x, y, 22, 28, '#ffe39a'); }
      box(108, 218, 44, 66, '#2f6fae'); g.fillStyle = '#e0b552'; g.beginPath(); g.arc(130, 200, 16, 0, TAU); g.fill(); g.stroke();
    } else {
      g.fillStyle = '#262029'; g.beginPath(); [[22, 284], [22, 170], [44, 150], [62, 176], [78, 96], [104, 132], [130, 20], [156, 132], [182, 96], [198, 176], [216, 150], [238, 170], [238, 284]].forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.closePath(); g.fill(); g.stroke();
      g.strokeStyle = '#ff5a2e'; g.lineWidth = 3; for (const [x0, y0, y1] of [[130, 60, 130], [96, 140, 184], [164, 140, 184], [60, 196, 232], [200, 196, 232]]) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0, y1); g.stroke(); }
      g.strokeStyle = '#14100e'; g.lineWidth = 4;
      g.fillStyle = '#ff5a2e'; g.beginPath(); g.moveTo(102, 284); g.lineTo(108, 226); g.lineTo(130, 206); g.lineTo(152, 226); g.lineTo(158, 284); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#17121c'; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(108 + i * 11, 226 - Math.sin((i + .5) / 5 * Math.PI) * 18); g.lineTo(113 + i * 11, 246); g.lineTo(118 + i * 11, 226 - Math.sin((i + 1) / 5 * Math.PI) * 18); g.closePath(); g.fill(); }
    }
    const o = { c, ax, ay }; cache.set(id, o); return o;
  }
  function banner(team) {
    const id = 'ban' + team; if (cache.has(id)) return cache.get(id);
    const c = cv(64, 156), g = c.getContext('2d'), col = Art.TEAM[team], dark = Art.TEAM_DARK[team];
    g.fillStyle = 'rgba(6,20,18,.3)'; g.beginPath(); g.ellipse(18, 148, 15, 6, 0, 0, TAU); g.fill();
    g.fillStyle = '#6a5a3c'; g.fillRect(15, 10, 6, 138); g.fillStyle = '#a8946a'; g.fillRect(15, 10, 2, 138);
    g.fillStyle = '#e0b552'; g.beginPath(); g.arc(18, 9, 6, 0, TAU); g.fill();
    g.fillStyle = dark; g.beginPath(); g.moveTo(21, 18); g.lineTo(60, 22); g.lineTo(60, 92); g.lineTo(41, 80); g.lineTo(21, 96); g.closePath(); g.fill();
    g.fillStyle = col; g.beginPath(); g.moveTo(21, 18); g.lineTo(56, 22); g.lineTo(56, 84); g.lineTo(41, 73); g.lineTo(21, 88); g.closePath(); g.fill();
    g.strokeStyle = '#f1e8d0'; g.lineWidth = 2.5; g.beginPath(); g.arc(38, 47, 11, 0, TAU); g.stroke(); g.fillStyle = '#f1e8d0'; g.beginPath(); g.arc(38, 47, 4, 0, TAU); g.fill();
    const o = { c, ax: 18, ay: 148 }; cache.set(id, o); return o;
  }
  return { paint, cliff, tree, lantern, pillar, banner, house, hq, nearRoad, spline, RIVER, HALF };
})();
