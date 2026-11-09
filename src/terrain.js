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

  // Territory colour along a street: pale gold on the hero side, through steel, to crimson on the villain side.
  const terrRGB = t => t < .5 ? [226 - (t * 2) * 60, 194 - (t * 2) * 20, 130 + (t * 2) * 60] : [166 + (t - .5) * 2 * 60, 174 - (t - .5) * 2 * 130, 190 - (t - .5) * 2 * 120];
  const terr = (t, a) => { const [R, G, B] = terrRGB(t); return `rgba(${R | 0},${G | 0},${B | 0},${a})`; };
  // Fine speckle, tiled over the whole map, so no surface reads as a flat vector fill.
  function grain() {
    return once('grain', () => {
      const c = cv(256, 256), g = c.getContext('2d'), d = g.createImageData(256, 256), r = seeded(733);
      for (let i = 0; i < d.data.length; i += 4) { const v = r(), lo = v < .5; d.data[i] = d.data[i + 1] = d.data[i + 2] = lo ? 0 : 150; d.data[i + 3] = (lo ? .5 - v : v - .5) * 30; }
      g.putImageData(d, 0, 0); return c;
    });
  }
  // A soft-edged lobed shape: puddles, ponds, stains.
  const lobes = (x, y, R, k, r, n = 11) => { const o = []; for (let i = 0; i < n; i++) { const a = i / n * TAU, d = R * (.72 + r() * .42); o.push([x + Math.cos(a) * d, y + Math.sin(a) * d * k]); } return o; };
  const smoothP = (g, p) => { g.beginPath(); const n = p.length, m = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], s = m(p[n - 1], p[0]); g.moveTo(s[0], s[1]); for (let i = 0; i < n; i++) { const e = m(p[i], p[(i + 1) % n]); g.quadraticCurveTo(p[i][0], p[i][1], e[0], e[1]); } g.closePath(); };
  // Rain left standing in the road. The sky and the neon are in it, so it reads as a mirror before anything moves.
  function puddle(g, x, y, R, r, tint) {
    const p = lobes(x, y, R, .42, r), gr = g.createLinearGradient(0, y - R * .42, 0, y + R * .42);
    gr.addColorStop(0, tint); gr.addColorStop(.55, 'rgba(50,90,140,.55)'); gr.addColorStop(1, 'rgba(26,44,78,.6)');
    smoothP(g, p); g.fillStyle = gr; g.fill(); g.strokeStyle = 'rgba(150,186,226,.2)'; g.lineWidth = 1; g.stroke();
  }
  // Leaves in three values, lit from the moon's side. The one recipe behind the brush, tree crowns and overgrown walls.
  function clump(g, x, y, R, pal, r, k = 1) {
    g.fillStyle = pal[0]; g.beginPath(); g.ellipse(x, y + R * .14 * k, R, R * k, 0, 0, TAU); g.fill();
    for (let i = 0; i < 5; i++) { const a = r() * TAU, d = R * r() * .62, q = R * (.3 + r() * .26), X = x - R * .16 + Math.cos(a) * d, Y = y - R * .18 * k + Math.sin(a) * d * k; g.fillStyle = pal[1]; g.beginPath(); g.ellipse(X, Y, q, q * k, 0, 0, TAU); g.fill(); g.fillStyle = pal[2]; g.beginPath(); g.ellipse(X - q * .22, Y - q * .26 * k, q * .55, q * .46 * k, 0, 0, TAU); g.fill(); }
  }
  const LEAF = [['#0d4a3a', '#16806a', '#3fd2a0'], ['#123e5c', '#1a7a98', '#4ad0e0'], ['#2a2f7a', '#5148b8', '#a07cf0']];

  function paint(map, towers, GS, sites = [], mood = 0, camps = [], districts = []) {
    // iOS refuses any canvas over 16.7 million pixels, and the paint happens on one before it's cut into tiles.
    const W = map.W, Ht = Math.ceil(map.H * TILT);
    GS = Math.min(GS, Math.sqrt(16e6 / (W * Ht)));
    const c = cv(Math.floor(W * GS), Math.floor(Ht * GS)), g = c.getContext('2d'), r = seeded(90210), Y = y => y * TILT;
    g.scale(GS, GS); g.imageSmoothingQuality = 'high'; g.lineCap = 'butt'; g.lineJoin = 'miter';
    const center = map.center || { x: W / 2, y: map.H / 2 }, plazas = map.plazas || [], fountains = map.fountains || [];
    const blob = (x, y, rx, ry, col, a) => { g.globalAlpha = a; g.drawImage(pool(col), x - rx, y - ry, rx * 2, ry * 2); g.globalAlpha = 1; };

    // Everything off the avenues begins as the Undergrowth: a drowned old park, near-black moss and standing damp.
    g.fillStyle = '#123a33'; g.fillRect(0, 0, W, Ht);
    // All the broad mottling goes on a small canvas and is scaled up once: same soft shapes, a fraction of the paint time.
    const MO = 8, moss = cv(Math.ceil(W / MO), Math.ceil(Ht / MO)), mo = moss.getContext('2d'), MOSS = ['#1f7a60', '#1b6a78', '#32894f', '#2a4f9a'];
    const mblob = (x, y, rx, ry, col, a) => { mo.globalAlpha = a; mo.drawImage(pool(col), (x - rx) / MO, (y - ry) / MO, rx * 2 / MO, ry * 2 / MO); };
    for (let i = 0; i < 620; i++) { const R = 70 + r() * 230; mblob(r() * W, r() * Ht, R, R * .66, MOSS[r() * 4 | 0], .22 + r() * .34); }
    for (let i = 0; i < 190; i++) { const R = 50 + r() * 150; mblob(r() * W, r() * Ht, R, R * .62, '#07201c', .25 + r() * .3); }
    // Patches of living light in the moss: the park's signature colour, cheap because it is on the small canvas.
    mo.globalCompositeOperation = 'lighter'; for (let i = 0; i < 90; i++) { const R = 90 + r() * 200; mblob(r() * W, r() * Ht, R, R * .64, ['#1ed8a8', '#2a8cff', '#b850ff', '#ff4ab0'][r() * 4 | 0], .1 + r() * .14); } mo.globalCompositeOperation = 'source-over';
    g.drawImage(moss, 0, 0, W, Ht); mo.clearRect(0, 0, moss.width, moss.height);
    // Roots and cracks wander through it.
    g.lineCap = 'round'; g.strokeStyle = 'rgba(4,20,16,.42)'; g.lineWidth = 2; g.beginPath();
    for (let i = 0; i < 210; i++) { let x = r() * W, y = r() * Ht, a = r() * TAU; g.moveTo(x, y); for (let k = 0; k < 6; k++) { a += (r() - .5) * 1.3; const l = 16 + r() * 30; x += Math.cos(a) * l; y += Math.sin(a) * l * TILT; g.lineTo(x, y); } } g.stroke();

    const roads = map.lanes.map(l => spline(l, 16));
    if (plazas.length >= 2 && map.lanes.length < 3) { const a = plazas[0], b = plazas[1]; roads.push([[a.x, a.y], [b.x, b.y]]); }
    const roadNear = (x, y, m) => { for (const L of roads) for (let i = 0; i < L.length - 1; i += 2) { const dx = L[i][0] - x, dy = (L[i][1] - y) * TILT; if (dx * dx + dy * dy < m * m) return true; } if (roads[2]) { const L = roads[roads.length - 1]; if (L.length === 2) { const t = Math.max(0, Math.min(1, (x - L[0][0]) / (L[1][0] - L[0][0]))), yy = L[0][1] + (L[1][1] - L[0][1]) * t; if (Math.abs(yy - y) * TILT < m && x > L[0][0] && x < L[1][0]) return true; } } return false; };

    // Old flagstone paths between the clearings: the jungle's own street plan, overgrown and broken.
    const nodes = [...camps.map(n => ({ x: n.x, y: n.y })), ...sites.map(n => ({ x: n.x, y: n.y })), ...(map.arenas || []).filter(a => a.kind !== 'colossus').map(n => ({ x: n.x, y: n.y }))], drawn = new Set();
    const trail = (a, b) => { const mx = (a.x + b.x) / 2 + (r() - .5) * 180, my = (a.y + b.y) / 2 + (r() - .5) * 180, pth = new Path2D(); pth.moveTo(a.x, Y(a.y)); pth.quadraticCurveTo(mx, Y(my), b.x, Y(b.y)); return pth; };
    nodes.forEach((n, i) => {
      nodes.map((o, j) => [Math.hypot(o.x - n.x, o.y - n.y), j]).filter(e => e[1] !== i && e[0] < 1050).sort((p, q) => p[0] - q[0]).slice(0, 2).forEach(([, j]) => {
        const k = Math.min(i, j) + ':' + Math.max(i, j); if (drawn.has(k)) return; drawn.add(k);
        const p = trail(n, nodes[j]); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = 'rgba(110,255,214,.34)'; g.lineWidth = 66; g.stroke(p); g.strokeStyle = '#0d2a26'; g.lineWidth = 56; g.stroke(p);
        g.strokeStyle = '#4f8474'; g.lineWidth = 46; g.setLineDash([30, 7, 44, 6, 22, 9, 36, 7]); g.lineCap = 'butt'; g.stroke(p);
        g.strokeStyle = 'rgba(186,255,232,.8)'; g.lineWidth = 3.4; g.setLineDash([3, 34]); g.lineCap = 'round'; g.stroke(p); g.setLineDash([]);
      });
    });
    // Moss clawing back over the paths, and moonlight coming through the canopy in long slanted bars.
    for (let i = 0; i < 70; i++) { const R = 24 + r() * 56; mblob(r() * W, r() * Ht, R, R * .6, '#1a6a54', .5); } mo.globalAlpha = 1; g.drawImage(moss, 0, 0, W, Ht);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 46; i++) { const x = r() * W, y = r() * Ht, l = 240 + r() * 340, w = 20 + r() * 46; if (roadNear(x, y, 300)) continue; g.fillStyle = 'rgba(120,230,220,.075)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w - l * .5, y + l); g.lineTo(x - l * .5, y + l); g.closePath(); g.fill(); }
    g.globalCompositeOperation = 'source-over';
    // Black ponds holding the sky, and little colonies of glowing fungus. The park's one bit of colour, kept small so coins still win.
    for (let i = 0; i < 90; i++) {
      const x = 240 + r() * (W - 480), y = 220 + r() * (Ht - 440), R = 34 + r() * 46; if (roadNear(x, y / TILT, 210) || plazas.some(p => Math.hypot(x - p.x, y / TILT - p.y) < p.r + 60) || (map.arenas || []).some(a => Math.hypot(x - a.x, y / TILT - a.y) < (a.r || 240) + 40)) continue;
      if (i % 3 === 0) { smoothP(g, lobes(x, y, R + 5, .5, r)); g.fillStyle = '#0a2a26'; g.fill(); const q = lobes(x, y, R, .5, r), gr = g.createLinearGradient(0, y - R * .5, 0, y + R * .5); gr.addColorStop(0, '#5cf0dc'); gr.addColorStop(.55, '#1a9ab4'); gr.addColorStop(1, '#0c4a74'); smoothP(g, q); g.fillStyle = gr; g.fill(); g.strokeStyle = 'rgba(190,255,240,.6)'; g.lineWidth = 1.6; g.stroke(); for (let k = 0; k < 3; k++) { g.fillStyle = '#2a9a64'; g.beginPath(); g.ellipse(x + (r() - .5) * R, y + (r() - .5) * R * .4, 7, 3.6, 0, 0, TAU); g.fill(); } }
      else { const col = ['#58ffc4', '#b2ff5e', '#ff7ae0', '#6aa8ff'][r() * 4 | 0]; g.globalCompositeOperation = 'lighter'; blob(x, y, 62, 40, col, .3); g.globalCompositeOperation = 'source-over'; g.fillStyle = col; g.globalAlpha = .9; for (let k = 0; k < 9; k++) { g.beginPath(); g.arc(x + (r() - .5) * 50, y + (r() - .5) * 26, 1.2 + r() * 1.8, 0, TAU); g.fill(); } g.globalAlpha = 1; }
    }
    // Monster camps are ruined bandstands: a ragged disc of old mosaic the moss hasn't finished eating.
    for (const n of camps) { const R = n.big ? 150 : 118, x = n.x, y = Y(n.y); smoothP(g, lobes(x, y, R + 18, TILT, r, 14)); g.fillStyle = n.big ? 'rgba(180,255,120,.5)' : 'rgba(110,255,214,.42)'; g.fill(); smoothP(g, lobes(x, y, R + 6, TILT, r, 14)); g.fillStyle = '#2f5a4e'; g.fill(); g.save(); g.translate(x, y); g.scale(1, TILT); g.strokeStyle = n.big ? 'rgba(200,255,140,.75)' : 'rgba(150,255,226,.6)'; g.lineWidth = 2.4; g.beginPath(); g.arc(0, 0, R * .72, 0, TAU); g.stroke(); g.lineWidth = 1.4; g.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; g.moveTo(Math.cos(a) * R * .3, Math.sin(a) * R * .3); g.lineTo(Math.cos(a) * R * .7, Math.sin(a) * R * .7); } g.stroke(); g.restore(); for (let i = 0; i < 9; i++) { const a = r() * TAU, d = R * (.7 + r() * .4); blob(x + Math.cos(a) * d, y + Math.sin(a) * d * TILT, 30, 20, '#1b7a5a', .7); } }

    // The canal runs under the avenues: cut stone, a lit coping, black water with the sky lying on it.
    const riverPts = map.river || [[W / 2, -80], [W / 2, map.H + 80]], cen = spline(riverPts, 18), path = new Path2D(); cen.forEach(([x, y], i) => path[i ? 'lineTo' : 'moveTo'](x, Y(y)));
    g.lineCap = 'round'; g.lineJoin = 'round';
    const bank = (w, col) => { g.strokeStyle = col; g.lineWidth = w; g.stroke(path); };
    bank(HALF * 2 + 58, '#05080c'); bank(HALF * 2 + 48, '#2b3442'); bank(HALF * 2 + 34, '#141a24'); bank(HALF * 2 + 8, '#6a7c92'); bank(HALF * 2 + 3, '#0a2036'); bank(HALF * 2 - 8, '#104068'); bank(HALF * 2 - 70, '#165a8c'); bank(HALF * 2 - 136, '#1f76ac');
    const flow = cen.map(([x, y], i) => { const a = cen[Math.max(0, i - 1)], b = cen[Math.min(cen.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, tx = dx / l, ty = dy / l; return { x, y, tx, ty, nx: -ty, ny: tx, a: Math.atan2(ty * TILT, tx) - Math.PI / 2 }; });
    for (let i = 0; i < 70; i++) { const p = flow[r() * flow.length | 0], o = (r() - .5) * (HALF * 1.6), x = p.x + p.nx * o, y = Y(p.y + p.ny * o), len = 40 + r() * 120; g.strokeStyle = r() > .6 ? 'rgba(150,206,240,.34)' : 'rgba(80,134,170,.34)'; g.lineWidth = 1.4; g.lineCap = 'butt'; g.beginPath(); g.moveTo(x - p.tx * len, y - p.ty * len * TILT); g.lineTo(x + p.tx * len, y + p.ty * len * TILT); g.stroke(); }
    const table = []; for (let y = -80; y <= map.H + 80; y += 20) { let bx = 0, bd = 1e9; for (const [x, yy] of cen) { const d = Math.abs(yy - y); if (d < bd) { bd = d; bx = x; } } table.push(bx); }
    const riverX = y => table[Math.max(0, Math.min(table.length - 1, Math.round((y + 80) / 20)))];

    // The avenues: granite pavements, a bright kerb, a wet crowned carriageway, tram rails and a median of territory-coloured deco.
    const ROAD = 118, offs = (pts, o) => pts.map((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dy = Y(b[1]) - Y(a[1]), l = Math.hypot(dx, dy) || 1; return [p[0] - dy / l * o, Y(p[1]) + dx / l * o]; });
    const strokePts = (pts, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); pts.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.stroke(); };
    const denseRoads = roads.map(pts => { if (pts.length > 2) return pts; const o = []; const [a, b] = pts; for (let i = 0; i <= 60; i++) { const t = i / 60; o.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } return o; });
    const roadPaths = denseRoads.map(pts => { const p = new Path2D(); pts.forEach(([x, y], i) => p[i ? 'lineTo' : 'moveTo'](x, Y(y))); return p; });
    // Pavements go down first, for every road, so where avenues meet the carriageways simply merge.
    roadPaths.forEach(p => { g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#0b1016'; g.lineWidth = ROAD * 2 + 168; g.stroke(p); g.strokeStyle = '#3a4456'; g.lineWidth = ROAD * 2 + 156; g.stroke(p); });
    denseRoads.forEach(pts => { g.lineCap = 'butt'; const a = offs(pts, ROAD + 12), b = offs(pts, ROAD + 74), a2 = offs(pts, -ROAD - 12), b2 = offs(pts, -ROAD - 74); g.strokeStyle = 'rgba(14,20,30,.5)'; g.lineWidth = 1.4; g.beginPath(); for (let i = 1; i < pts.length; i += 1) { g.moveTo(a[i][0], a[i][1]); g.lineTo(b[i][0], b[i][1]); g.moveTo(a2[i][0], a2[i][1]); g.lineTo(b2[i][0], b2[i][1]); } g.stroke(); });
    roadPaths.forEach(p => { const st = (w, col) => { g.strokeStyle = col; g.lineWidth = w; g.stroke(p); }; g.lineCap = 'round'; g.lineJoin = 'round'; st(ROAD * 2 + 14, '#07090e'); st(ROAD * 2 + 8, '#90a0b8'); st(ROAD * 2 + 1, '#172032'); st(ROAD * 2 - 18, '#1e2a40'); st(ROAD * 2 - 66, '#26344e'); st(ROAD * 2 - 132, '#2e3e5c'); });
    denseRoads.forEach((pts, ri) => {
      g.lineCap = 'butt'; g.lineJoin = 'round';
      for (const o of [-62, 62]) { const q = offs(pts, o); strokePts(q, 5, 'rgba(8,11,18,.6)'); strokePts(q, 1.6, 'rgba(176,196,222,.46)'); }
      // Neon runs the length of both kerbs in the local side's colour: the avenues are drawn in light.
      for (const o of [-ROAD - 3, ROAD + 3]) { const q = offs(pts, o); g.lineCap = 'round'; for (const [lw, a] of [[13, .2], [3.4, 1]]) { g.lineWidth = lw; for (let i = 1; i < q.length; i++) { g.strokeStyle = terr(q[i][0] / W, a); g.beginPath(); g.moveTo(q[i - 1][0], q[i - 1][1]); g.lineTo(q[i][0], q[i][1]); g.stroke(); } } g.lineCap = 'butt'; }
      for (const o of [-96, 96]) { const q = offs(pts, o); g.setLineDash([58, 42]); strokePts(q, 2, 'rgba(180,194,214,.1)'); g.setLineDash([]); }
      // Everything spaced along the road's real length.
      let along = 0, nextDash = 0, nextMed = 260, nextPud = 90 + r() * 120, nextHole = 340;
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i], d = Math.hypot(bx - ax, Y(by) - Y(ay)), ux = (bx - ax) / (d || 1), uy = (Y(by) - Y(ay)) / (d || 1), t = ax / W;
        while (nextDash < along + d) { const s = nextDash - along, x = ax + ux * s, y = Y(ay) + uy * s; g.strokeStyle = terr(t, .8); g.lineWidth = 2.6; for (const o of [-6, 6]) { g.beginPath(); g.moveTo(x - uy * o, y + ux * o); g.lineTo(x - uy * o + ux * 40, y + ux * o + uy * 40); g.stroke(); } nextDash += 92; }
        while (nextMed < along + d) { const s = nextMed - along, x = ax + ux * s, y = Y(ay) + uy * s; g.save(); g.translate(x, y); g.rotate(Math.atan2(uy, ux)); g.fillStyle = terr(t, .9); poly(g, [[-26, 0], [0, -10], [26, 0], [0, 10]]); g.fill(); g.fillStyle = '#26344e'; poly(g, [[-12, 0], [0, -5], [12, 0], [0, 5]]); g.fill(); g.strokeStyle = terr(t, .6); g.lineWidth = 2; g.beginPath(); g.moveTo(-54, -8); g.lineTo(-30, 0); g.lineTo(-54, 8); g.moveTo(54, -8); g.lineTo(30, 0); g.lineTo(54, 8); g.stroke(); g.restore(); nextMed += 520; }
        while (nextPud < along + d) { const s = nextPud - along, o = (r() > .5 ? 1 : -1) * (40 + r() * 62), x = ax + ux * s - uy * o, y = Y(ay) + uy * s + ux * o; puddle(g, x, y, 24 + r() * 44, r, t < .5 ? 'rgba(120,180,240,.65)' : 'rgba(240,120,170,.6)'); nextPud += 110 + r() * 240; }
        while (nextHole < along + d) { const s = nextHole - along, o = (r() > .5 ? 1 : -1) * 38, x = ax + ux * s - uy * o, y = Y(ay) + uy * s + ux * o; g.fillStyle = '#080b10'; g.beginPath(); g.ellipse(x, y, 16, 11, 0, 0, TAU); g.fill(); g.strokeStyle = 'rgba(150,164,184,.28)'; g.lineWidth = 1.3; g.stroke(); g.beginPath(); g.moveTo(x - 10, y); g.lineTo(x + 10, y); g.moveTo(x, y - 7); g.lineTo(x, y + 7); g.stroke(); nextHole += 640 + r() * 300; }
        along += d;
      }
      // A zebra crossing either side of every tower on this road.
      for (const tw of towers) { let bi = -1, bd = 1e9; for (let i = 0; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - tw.x, pts[i][1] - tw.y); if (d < bd) { bd = d; bi = i; } } if (bd > 170 || bi < 4 || bi > pts.length - 5) continue; for (const k of [-8, 8]) { const j = Math.max(1, Math.min(pts.length - 2, bi + k)), [x, y0] = pts[j], y = Y(y0), [x2, y2] = pts[j + 1], dd = Math.hypot(x2 - x, Y(y2) - y) || 1, ux = (x2 - x) / dd, uy = (Y(y2) - y) / dd; g.fillStyle = 'rgba(196,210,232,.42)'; for (let o = -ROAD + 14; o < ROAD - 10; o += 26) { const X = x - uy * o, Yy = y + ux * o; g.beginPath(); g.moveTo(X - ux * 28, Yy - uy * 28); g.lineTo(X + ux * 28, Yy + uy * 28); g.lineTo(X + ux * 28 - uy * 14, Yy + uy * 28 + ux * 14); g.lineTo(X - ux * 28 - uy * 14, Yy - uy * 28 + ux * 14); g.closePath(); g.fill(); } } }
    });

    // Deco bridges carry the avenues over the canal.
    const bridges = (map.bridges && map.bridges.length) ? map.bridges : [];
    for (const b of bridges) {
      const yc = Y(b.y), SPAN = HALF + 40, x0 = b.x - SPAN, w = SPAN * 2, HW = 126;
      g.fillStyle = '#05070b'; g.fillRect(x0 - 6, yc - HW - 10, w + 12, HW * 2 + 22);
      g.fillStyle = '#26344e'; g.fillRect(x0, yc - HW, w, HW * 2); g.fillStyle = '#34466a'; g.fillRect(x0, yc - 60, w, 120);
      g.strokeStyle = 'rgba(5,7,11,.8)'; g.lineWidth = 2; g.beginPath(); for (let x = x0 + 18; x < x0 + w; x += 36) { g.moveTo(x, yc - HW + 6); g.lineTo(x, yc + HW - 6); } g.stroke();
      for (const o of [-HW, HW]) {
        g.fillStyle = '#04060a'; g.fillRect(x0 - 6, yc + o - 9, w + 12, 18); g.fillStyle = '#7f8ea4'; g.fillRect(x0 - 4, yc + o - 7, w + 8, 3);
        g.fillStyle = 'rgba(214,190,128,.5)'; for (let x = x0 + 12; x < x0 + w - 4; x += 20) g.fillRect(x, yc + o - 2, 10, 4);
        for (const px of [x0 - 6, x0 + w + 6]) { g.fillStyle = '#0a0e15'; g.fillRect(px - 15, yc + o - 15, 30, 30); g.fillStyle = '#4a586c'; g.fillRect(px - 15, yc + o - 15, 30, 3); g.fillStyle = '#ffdf9e'; g.fillRect(px - 5, yc + o - 5, 10, 10); blob(px, yc + o, 52, 36, '#ffdf9e', .35); }
      }
    }

    const at = (x, y, fn) => { g.save(); g.translate(x, Y(y)); g.scale(1, TILT); g.lineJoin = 'miter'; g.lineCap = 'butt'; fn(); g.restore(); };
    const ring = (R, col, lw, n = 0) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); if (n) { const p = octa(R, n); p.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.closePath(); } else g.arc(0, 0, R, 0, TAU); g.stroke(); };
    const disc = (R, col, n = 0) => { g.fillStyle = col; g.beginPath(); if (n) { const p = octa(R, n); p.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.closePath(); } else g.arc(0, 0, R, 0, TAU); g.fill(); };
    const flutes = (n, r0, r1, col, lw = 1.6) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); for (let i = 0; i < n; i++) { const a = i / n * TAU + TAU / (n * 2); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); } g.stroke(); };
    const wedges = (n, r0, r1, A, B) => { for (let i = 0; i < n; i++) { const a0 = i / n * TAU, a1 = (i + 1) / n * TAU; g.fillStyle = i % 2 ? A : B; g.beginPath(); g.arc(0, 0, r1, a0, a1); g.arc(0, 0, r0, a1, a0, true); g.closePath(); g.fill(); } };
    const rad = (R, a, b) => { const gr = g.createRadialGradient(0, 0, 0, 0, 0, R); gr.addColorStop(0, a); gr.addColorStop(1, b); return gr; };

    // The two capitals. Hero Plaza is marble and gold under a sunburst; the Lair's forecourt is split obsidian with poison in the cracks.
    for (const p of plazas) {
      const R = p.r;
      if (p.kind === 'base' && p.team === 0) at(p.x, p.y, () => {
        disc(R + 16, '#03060c', 8); disc(R, '#0c1a32', 8); ring(R - 6, HERO.gold, 3, 8); ring(R - 18, 'rgba(230,209,156,.3)', 1.6, 8);
        disc(R - 48, '#0a1628', 8); wedges(32, R * .34, R - 62, '#10223f', '#0d1b33'); ring(R - 62, HERO.goldDk, 2.5);
        g.strokeStyle = 'rgba(230,209,156,.3)'; g.lineWidth = 2; g.beginPath(); for (let i = 0; i < 32; i++) { const a = i / 32 * TAU; g.moveTo(Math.cos(a) * R * .34, Math.sin(a) * R * .34); g.lineTo(Math.cos(a) * (R - 62), Math.sin(a) * (R - 62)); } g.stroke();
        g.fillStyle = 'rgba(230,209,156,.13)'; for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; g.save(); g.rotate(a); poly(g, [[R * .34, -16], [R * .74, 0], [R * .34, 16]]); g.fill(); g.restore(); }
        disc(R * .34, '#142a4e'); ring(R * .34, HERO.gold, 3.5); disc(R * .28, rad(R * .28, '#28508c', '#142a4e')); ring(R * .2, 'rgba(230,209,156,.6)', 2);
        // The winged star, inlaid in the floor.
        g.fillStyle = HERO.gold; const st = []; for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, d = i % 2 ? R * .055 : R * .13; st.push([Math.cos(a) * d, Math.sin(a) * d]); } poly(g, st); g.fill();
        g.fillStyle = 'rgba(230,209,156,.75)'; for (const s of [-1, 1]) for (let i = 0; i < 3; i++) poly(g, [[s * R * .1, -R * .03 + i * R * .03], [s * R * (.25 - i * .03), -R * .06 + i * R * .03], [s * R * (.22 - i * .03), -R * .025 + i * R * .03], [s * R * .1, R * 0 + i * R * .03]]), g.fill();
      });
      else if (p.kind === 'base') at(p.x, p.y, () => {
        disc(R + 16, '#020203', 8); disc(R, '#100e16', 8); ring(R - 6, VIL.crim, 3, 8); ring(R - 18, 'rgba(200,36,58,.3)', 1.6, 8);
        disc(R - 48, '#0b0a10', 8); wedges(20, R * .34, R - 62, '#17141e', '#100e16'); ring(R - 62, VIL.crimDk, 2.5);
        // Poison in the cracks: jagged seams from the core outward.
        const q = seeded(4411); g.lineJoin = 'bevel'; for (let i = 0; i < 18; i++) { let a = i / 18 * TAU + q() * .3, d = R * .34; const pts = [[Math.cos(a) * d, Math.sin(a) * d]]; while (d < R - 80) { d += 40 + q() * 60; a += (q() - .5) * .34; pts.push([Math.cos(a) * d, Math.sin(a) * d]); } for (const [lw, col] of [[8, 'rgba(182,236,58,.07)'], [3, 'rgba(182,236,58,.3)'], [1.1, 'rgba(232,255,180,.5)']]) { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); pts.forEach(([x, y], k) => g[k ? 'lineTo' : 'moveTo'](x, y)); g.stroke(); } }
        disc(R * .34, '#1b1020'); ring(R * .34, VIL.crim, 3.5); disc(R * .28, rad(R * .28, '#3a1030', '#120a18')); ring(R * .2, 'rgba(182,236,58,.55)', 2);
        // The horned sigil.
        g.fillStyle = VIL.crim; poly(g, [[0, -R * .02], [R * .05, -R * .13], [R * .15, -R * .17], [R * .09, -R * .05], [R * .06, R * .1], [0, R * .15], [-R * .06, R * .1], [-R * .09, -R * .05], [-R * .15, -R * .17], [-R * .05, -R * .13]]); g.fill();
        g.fillStyle = VIL.acid; poly(g, [[0, R * .01], [R * .03, R * .05], [0, R * .1], [-R * .03, R * .05]]); g.fill();
      });
      else at(p.x, p.y, () => { disc(R + 10, '#05070b', 8); disc(R, '#191f2b', 8); ring(R - 8, '#6a7c92', 2.5, 8); wedges(24, R * .3, R - 40, '#1e2531', '#191f2b'); });
    }
    // Fountains: the healing ground, ringed so it reads from the edge of the screen.
    const fR = map.fountainR || 300;
    fountains.forEach((f, i) => at(f.x, f.y, () => { const col = i ? VIL.glow : HERO.glow; ring(fR, i ? 'rgba(255,74,92,.6)' : 'rgba(255,223,158,.6)', 3.5); g.setLineDash([26, 18]); ring(fR - 14, i ? 'rgba(255,74,92,.3)' : 'rgba(255,223,158,.3)', 2); g.setLineDash([]); disc(160, '#04060c', 8); disc(150, i ? '#20151c' : '#16284a', 8); ring(150, col, 3, 8); disc(112, rad(112, i ? '#ff4a5c' : '#7ec8ff', i ? '#35101e' : '#1b4274'), 8); ring(112, col, 1.6, 8); disc(64, i ? '#2c1a22' : '#203860', 8); ring(64, col, 2, 8); }));
    // Civilian squares: little lit pocket parks, warm against the dark, with a rail of old paving.
    for (const site of sites) at(site.x, site.y, () => { disc(136, '#060810', 8); disc(128, '#20262f', 8); ring(128, '#8a97ac', 2, 8); disc(104, '#2a2622', 8); wedges(16, 40, 100, '#2e2a24', '#27231f'); ring(100, 'rgba(230,209,156,.3)', 1.6, 8); disc(38, '#3a3226', 8); ring(38, 'rgba(255,223,158,.5)', 1.6, 8); });
    // Tower plinths ringed in the owner's colour.
    for (const t of towers) { const R = t.sub === 'core' ? 110 : 76, col = t.team ? VIL.crim : HERO.gold; at(t.x, t.y, () => { disc(R + 10, '#04050a', 8); disc(R, t.team ? '#1c1520' : '#14243f', 8); ring(R - 6, col, 3, 8); wedges(16, R * .5, R - 14, t.team ? '#17121b' : '#112038', t.team ? '#120f16' : '#0e1a30'); ring(R * .5, col, 1.6, 8); disc(R * .5, t.team ? '#100c13' : '#0c1628', 8); }); }

    // Boss arenas: each kind gets its own floor, so a jungle clearing is recognisable before anything steps into it.
    for (const a of map.arenas || []) at(a.x, a.y, () => arenaFloor(g, a));
    // Event locations: quiet ground marks that stay after the event moves on.
    for (const e of map.eventSpots || []) at(e.x, e.y, () => { ring(112, 'rgba(230,209,156,.18)', 2, 8); disc(5, 'rgba(230,209,156,.34)'); });
    if (map.convoyPath && map.convoyPath.length > 1) { const pts = spline(map.convoyPath, 12); g.save(); g.setLineDash([16, 30]); g.lineCap = 'butt'; g.lineJoin = 'round'; g.strokeStyle = 'rgba(230,209,156,.14)'; g.lineWidth = 3; g.beginPath(); pts.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, Y(y))); g.stroke(); g.setLineDash([]); g.restore(); }
    map.brush.forEach((b, i) => brushBed(g, b, i % 3 + 1, Y));
    // Hard cast shadows from everything that stands up, all falling the same way as the moonlight.
    g.fillStyle = 'rgba(4,8,14,.42)';
    for (const w of map.walls) if (!w.big) { const y0 = Y(w.y + w.h), L = 38, dx = -L * .7; g.beginPath(); g.moveTo(w.x, y0); g.lineTo(w.x + w.w, y0); g.lineTo(w.x + w.w + dx, y0 + L); g.lineTo(w.x + dx, y0 + L); g.closePath(); g.fill(); }
    for (const t of towers) { const R = t.sub === 'core' ? 64 : 42; g.beginPath(); g.moveTo(t.x - R * .8, Y(t.y)); g.lineTo(t.x + R * .8, Y(t.y)); g.lineTo(t.x + R * .8 - 150, Y(t.y) + 118); g.lineTo(t.x - R * .8 - 150, Y(t.y) + 118); g.closePath(); g.fill(); }
    // The blocks behind the plazas and the outer margin: built-up city, its streets just lines of dark.
    const block = (x, y, w, h) => { g.fillStyle = '#070a10'; g.fillRect(x, y, w, h); g.strokeStyle = 'rgba(92,110,134,.14)'; g.lineWidth = 2; g.beginPath(); for (let i = x + 80; i < x + w; i += 80 + r() * 40) { g.moveTo(i, y); g.lineTo(i, y + h); } for (let j = y + 60; j < y + h; j += 60 + r() * 34) { g.moveTo(x, j); g.lineTo(x + w, j); } g.stroke(); };
    for (const w of map.walls) if (w.big) block(w.x - 10, Y(w.y) - 10, w.w + 26, Y(w.h) + 30);
    block(0, 0, W, Y(112)); block(0, Ht - Y(112), W, Y(112)); block(0, 0, 44, Ht); block(W - 44, 0, 44, Ht);
    g.strokeStyle = '#3a4656'; g.lineWidth = 2; g.strokeRect(46, Y(112), W - 92, Ht - Y(224));
    for (let x = 80; x < W - 60; x += 74) { g.fillStyle = '#4a586c'; g.fillRect(x, Ht - Y(112) - 2, 6, 7); }

    // One overall grade: each side of the city lit by its own sky, and the cast of your side's dusk over the whole picture.
    g.globalCompositeOperation = 'lighter';
    blob(0, Ht / 2, W * .34, Ht * .9, '#2c5cbe', .1); blob(W, Ht / 2, W * .34, Ht * .9, '#be2448', .1);
    g.globalCompositeOperation = 'multiply'; g.fillStyle = mood ? '#fbeef2' : '#eef2fc'; g.fillRect(0, 0, W, Ht); g.globalCompositeOperation = 'source-over';
    // Night holds at the rim of the map; the middle, where people fight, stays lit.
    const edge = (x0, y0, x1, y1, xr, yr, wr, hr) => { const e = g.createLinearGradient(x0, y0, x1, y1); e.addColorStop(0, 'rgba(3,5,12,.82)'); e.addColorStop(1, 'rgba(3,5,12,0)'); g.fillStyle = e; g.fillRect(xr, yr, wr, hr); };
    edge(0, 0, 0, 300, 0, 0, W, 300); edge(0, Ht, 0, Ht - 300, 0, Ht - 300, W, 300); edge(0, 0, 420, 0, 0, 0, 420, Ht); edge(W, 0, W - 420, 0, W - 420, 0, 420, Ht);
    g.fillStyle = g.createPattern(grain(), 'repeat'); g.fillRect(0, 0, W, Ht);

    const plaza = plazas.find(p => p.kind === 'centre') || { x: center.x, y: center.y, r: 300 };
    const water = (x, y) => Math.abs(x - riverX(y)) < HALF && Math.hypot(x - plaza.x, y - plaza.y) > plaza.r && !bridges.some(b => Math.abs(y - b.y) < 132 && Math.abs(x - b.x) < 240);

    // Where the city can be seen in the ground: a tiny map of everything wet, used by the live reflection each frame.
    const MS = .125, mw = Math.ceil(W * MS), mh = Math.ceil(Ht * MS), mask = cv(mw, mh), mg = mask.getContext('2d'), refl = cv(mw, mh);
    mg.scale(MS, MS); mg.lineCap = 'round'; mg.lineJoin = 'round'; mg.strokeStyle = 'rgba(255,255,255,.5)'; mg.lineWidth = HALF * 2 + 30; mg.stroke(path);
    mg.strokeStyle = 'rgba(255,255,255,.5)'; for (const p of roadPaths) { mg.lineWidth = ROAD * 2 + 110; mg.stroke(p); }
    mg.strokeStyle = '#fff'; for (const p of roadPaths) { mg.lineWidth = ROAD * 2; mg.stroke(p); } mg.lineWidth = HALF * 2; mg.stroke(path);
    mg.fillStyle = 'rgba(255,255,255,.4)'; for (const p of plazas) { mg.save(); mg.translate(p.x, Y(p.y)); mg.scale(1, TILT); mg.beginPath(); mg.arc(0, 0, p.r, 0, TAU); mg.fill(); mg.restore(); }

    // District floors are static, so they cost nothing once they're part of the ground. Owner, capture and damage go on top per frame.
    for (const d of districts) { const kind = d.kind, pad = districtPad(kind), R = (d.r || 200) * (pad.w / 2 / pad.R), H = R * TILT; g.drawImage(pad.c, d.x - R, Y(d.y) - H, R * 2, H * 2); }

    // Slice into tiles: every phone can hold these as textures, and a frame only touches the few on screen.
    const TILE = 1800, tiles = [], OV = 2;
    for (let py = 0; py < c.height; py += TILE) for (let px = 0; px < c.width; px += TILE) {
      const x0 = Math.max(0, px - OV), y0 = Math.max(0, py - OV), tw = Math.min(c.width - x0, TILE + OV * 2), th = Math.min(c.height - y0, TILE + OV * 2), t = cv(tw, th);
      t.getContext('2d').drawImage(c, x0, y0, tw, th, 0, 0, tw, th);
      tiles.push({ c: t, x: x0 / GS, y: y0 / GS, w: tw / GS, h: th / GS });
    }
    c.width = c.height = 1; // let the big canvas go
    const wetD = mg.getImageData(0, 0, mw, mh).data, wet = (x, y) => wetD[((Math.max(0, Math.min(mh - 1, y * TILT * MS | 0))) * mw + Math.max(0, Math.min(mw - 1, x * MS | 0))) * 4 + 3] > 90;
    return { tiles, W, H: Ht, scale: GS, riverX, water, flow, plaza, bridges, center, mask, refl, MS, wet };
  }
  // Light pools baked into the ground, so street lights cost nothing per frame. Anything in `mirrors` also goes into the reflection map.
  function bake(gd, list, mirrors = []) {
    for (const t of gd.tiles) {
      const g = t.c.getContext('2d'); g.setTransform(gd.scale, 0, 0, gd.scale, -t.x * gd.scale, -t.y * gd.scale); g.globalCompositeOperation = 'lighter';
      for (const L of list) {
        const R = L.r, X = L.x, Y2 = L.y * TILT; if (X + R < t.x || X - R > t.x + t.w || Y2 + R < t.y || Y2 - R > t.y + t.h) continue;
        g.globalAlpha = L.a; g.drawImage(pool(L.col), X - R, Y2 - R * .74, R * 2, R * 1.48);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (!gd.refl || gd.reflDone) return; gd.reflDone = 1;
    const rg = gd.refl.getContext('2d'), MS = gd.MS; rg.globalCompositeOperation = 'lighter';
    // Every lamp and pool stretches into a long streak on the wet road, the way real lights do.
    for (const L of list) { if (L.r > 400) continue; const R = L.r * MS * .46, X = L.x * MS, Y2 = L.y * TILT * MS; rg.globalAlpha = Math.min(1, L.a * 1.5); rg.drawImage(pool(L.col), X - R, Y2 - R * .4, R * 2, R * 5); }
    // Buildings go in upside down, windows and all; at this size the blur comes free.
    for (const m of mirrors) { const s = m.spr, img = s.L || s.c; for (const [k, a] of [[.7, .75], [1.05, .42]]) { rg.save(); rg.translate(m.x * MS, m.y * TILT * MS); rg.scale(MS, -MS * k); rg.globalAlpha = a * (m.a || 1); rg.drawImage(img, -s.ax, -s.ay, s.w, s.h); rg.restore(); } }
    // Two passes through a half-size copy smear it the way a wet road does.
    const q = cv(gd.refl.width >> 1, gd.refl.height >> 1), qg = q.getContext('2d'); qg.imageSmoothingQuality = 'high'; qg.drawImage(gd.refl, 0, 0, q.width, q.height);
    rg.globalCompositeOperation = 'source-over'; rg.globalAlpha = 1; rg.imageSmoothingQuality = 'high'; rg.clearRect(0, 0, gd.refl.width, gd.refl.height); rg.drawImage(q, 0, 0, gd.refl.width, gd.refl.height); rg.globalAlpha = .55; rg.globalCompositeOperation = 'lighter'; rg.drawImage(q, 0, 1, gd.refl.width, gd.refl.height + 4);
    rg.globalAlpha = 1; rg.globalCompositeOperation = 'source-over';
    // A quiet copy is burned into the ground itself, so every quality setting has a wet city; the live layer only adds movement over it.
    const cp = cv(gd.refl.width, gd.refl.height), cg = cp.getContext('2d'); cg.drawImage(gd.refl, 0, 0); cg.globalCompositeOperation = 'destination-in'; cg.drawImage(gd.mask, 0, 0);
    for (const t of gd.tiles) { const g = t.c.getContext('2d'); g.setTransform(gd.scale, 0, 0, gd.scale, -t.x * gd.scale, -t.y * gd.scale); g.globalCompositeOperation = 'lighter'; g.globalAlpha = .85; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(cp, 0, 0, cp.width / MS, cp.height / MS); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.setTransform(1, 0, 0, 1, 0, 0); }
  }
  function nearRoad(map, x, y) { let b = 1e9; for (const L of map.lanes) for (let i = 1; i < L.length; i++) { const [ax, ay] = L[i - 1], [bx, by] = L[i], dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))); b = Math.min(b, Math.hypot(x - ax - dx * t, y - ay - dy * t)); } return b; }

  const cache = new Map();
  const once = (id, fn) => { if (!cache.has(id)) cache.set(id, fn()); return cache.get(id); };

  // ---------- city blocks: walls stay low so coins own the scale. Street-side ones are one-storey deco blocks with something worth looking at on the roof; park-side ones are glowing hedged terraces ----------
  function cliff(w, style = 0, side = 0) {
    const kind = ((w.x | 0) + (w.y | 0)) % 4;
    return once(`c${w.w}x${w.h}s${style}t${side}k${kind}`, () => {
      const lift = style ? 40 : 30, P = 14, ch = Math.min(18, Math.min(w.w, w.h) * .2), th = w.h * TILT, tw = w.w + P * 2, H = th + lift + P * 2 + 10, { c, g } = mk(tw, H), L = mk(tw, H), l = L.g, x0 = P, x1 = P + w.w, y0 = P, y1 = P + th, cy = ch * TILT, r = seeded(w.w * 13 + w.h * 7 + (w.x | 0) + style), cxm = (x0 + x1) / 2, cym = (y0 + y1) / 2;
      const top = [[x0 + ch, y0], [x1 - ch, y0], [x1, y0 + cy], [x1, y1 - cy], [x1 - ch, y1], [x0 + ch, y1], [x0, y1 - cy], [x0, y0 + cy]];
      const front = [[x0, y1 - cy], [x0 + ch, y1], [x1 - ch, y1], [x1, y1 - cy], [x1, y1 - cy + lift], [x1 - ch, y1 + lift], [x0 + ch, y1 + lift], [x0, y1 - cy + lift]];
      const leftCh = [[x0, y1 - cy], [x0 + ch, y1], [x0 + ch, y1 + lift], [x0, y1 - cy + lift]], rightCh = [[x1 - ch, y1], [x1, y1 - cy], [x1, y1 - cy + lift], [x1 - ch, y1 + lift]];
      const inset = top.map(([x, y]) => [x + (x < cxm ? 9 : -9), y + (y < cym ? 7 : -7)]);
      if (style) {
        const C = side ? { wall: '#3a1f4a', wall2: '#5a2a5c', lit: '#7a4482', roof: '#54346e', roof2: '#3e2656', deck: '#6e5a86', trim: '#ff4a6a', neon: ['#ff4a5c', '#b6ec3a', '#ff8a3c'], glass: '#ffb07a' } : { wall: '#1f3a68', wall2: '#2c5288', lit: '#4a78b4', roof: '#3a6096', roof2: '#2a4878', deck: '#7a93b8', trim: '#ffd98a', neon: ['#ffdf9e', '#6cd2ff', '#ffdf9e'], glass: '#ffe0a0' };
        const neon = C.neon[kind % 3], gr = g.createLinearGradient(0, y1, 0, y1 + lift); gr.addColorStop(0, C.wall); gr.addColorStop(1, C.wall2);
        fillP(g, front, gr); fillP(g, leftCh, C.lit); fillP(g, rightCh, '#0a0d16');
        // Street level: small lit shopfronts under one running awning.
        g.fillStyle = '#06080e'; g.fillRect(x0 + ch, y1 + 11, w.w - ch * 2, lift - 15);
        for (let x = x0 + ch + 4; x < x1 - ch - 10; x += 15) { const sw = 11; if (r() > .2) { l.fillStyle = r() > .6 ? neon : C.glass; l.globalAlpha = .85; l.fillRect(x, y1 + 13, sw, lift - 19); l.globalAlpha = 1; } }
        g.fillStyle = C.trim; g.fillRect(x0 + ch, y1 + 8, w.w - ch * 2, 2.4);
        // The roof, in the block's own colour, with a real feature in the middle of it.
        const rg = g.createLinearGradient(x0, y0, x1, y1); rg.addColorStop(0, C.roof); rg.addColorStop(1, C.roof2); fillP(g, top, rg);
        poly(g, top); g.strokeStyle = '#05070c'; g.lineWidth = 3; g.stroke();
        poly(g, inset); g.fillStyle = 'rgba(8,10,18,.26)'; g.fill();
        const fw = Math.min(w.w - 36, 150), fd = Math.min(th - 24, 74);
        if (fw > 34 && fd > 18) {
          const fx = cxm - fw / 2, fy = cym - fd / 2;
          if (kind === 0) {
            // A helipad: painted ring, landing chevrons, a light at each corner.
            const R = Math.min(fw * .48, fd * .62); g.fillStyle = 'rgba(14,18,30,.8)'; g.beginPath(); g.ellipse(cxm, cym, R + 6, (R + 6) * TILT, 0, 0, TAU); g.fill(); g.strokeStyle = C.deck; g.lineWidth = 3; g.beginPath(); g.ellipse(cxm, cym, R, R * TILT, 0, 0, TAU); g.stroke();
            l.strokeStyle = neon; l.lineWidth = 2; l.beginPath(); l.ellipse(cxm, cym, R * .66, R * .66 * TILT, 0, 0, TAU); l.stroke(); g.fillStyle = C.trim; for (const s of [-1, 1]) poly(g, [[cxm + s * R * .4, cym - 7], [cxm + s * R * .14, cym], [cxm + s * R * .4, cym + 7]]), g.fill();
          } else if (kind === 1) {
            // A glass atrium, ribbed, warm from inside.
            g.fillStyle = '#0a0e18'; g.fillRect(fx - 3, fy - 3, fw + 6, fd + 6); const nx = Math.max(3, fw / 16 | 0), ny = Math.max(2, fd / 14 | 0), px = fw / nx, py = fd / ny;
            for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { g.fillStyle = '#1b2638'; g.fillRect(fx + i * px + 1, fy + j * py + 1, px - 2, py - 2); l.fillStyle = (i + j) % 3 ? C.glass : neon; l.globalAlpha = .5 + r() * .5; l.fillRect(fx + i * px + 1, fy + j * py + 1, px - 2, py - 2); l.globalAlpha = 1; }
          } else if (kind === 2) {
            // A rooftop pool, lit turquoise, the brightest cool note on the street.
            g.fillStyle = C.deck; g.fillRect(fx - 6, fy - 5, fw + 12, fd + 10); const pg = g.createLinearGradient(0, fy, 0, fy + fd); pg.addColorStop(0, '#6ff0e8'); pg.addColorStop(1, '#1a9ec2'); g.fillStyle = pg; g.fillRect(fx, fy, fw, fd);
            g.strokeStyle = 'rgba(220,255,250,.55)'; g.lineWidth = 1.2; g.beginPath(); for (let i = 0; i < 5; i++) { const y = fy + 4 + r() * (fd - 8), x = fx + 4 + r() * (fw - 26); g.moveTo(x, y); g.quadraticCurveTo(x + 9, y - 3, x + 18, y); } g.stroke();
            g.fillStyle = '#f0e4c4'; for (let x = fx + 2; x < fx + fw - 10; x += 22) g.fillRect(x, fy - 4, 12, 3);
          } else {
            // A roof garden strung with lanterns.
            g.fillStyle = '#17503c'; g.fillRect(fx, fy, fw, fd); const pal = LEAF[1]; for (let i = 0; i < fw * fd / 340; i++) clump(g, fx + 7 + r() * (fw - 14), fy + 5 + r() * (fd - 8), 6 + r() * 5, pal, r, .85);
            l.fillStyle = '#ffe0a0'; for (let x = fx + 6; x < fx + fw; x += 14) { const y = fy + 3 + Math.sin(x * .3) * 2; l.beginPath(); l.arc(x, y, 1.9, 0, TAU); l.fill(); }
          }
        }
        // Plant in the corners, then the neon cornice all the way round: a block's outline is what reads from across the screen.
        for (const [x, y] of [[x0 + 16, y0 + 10], [x1 - 30, y1 - 22]]) { if (w.w < 90) break; fillP(g, [[x, y], [x + 16, y], [x + 16, y + 8], [x, y + 8]], '#7a8aa4'); fillP(g, [[x, y + 8], [x + 16, y + 8], [x + 16, y + 14], [x, y + 14]], '#141a26'); }
        poly(l, inset); l.strokeStyle = neon; l.globalAlpha = .3; l.lineWidth = 7; l.stroke(); l.globalAlpha = 1; l.lineWidth = 2; l.stroke();
        g.strokeStyle = '#c6d4e8'; g.lineWidth = 2.2; g.beginPath(); g.moveTo(x0, y1 - cy); g.lineTo(x0, y0 + cy); g.lineTo(x0 + ch, y0); g.lineTo(x1 - ch, y0); g.stroke();
      } else {
        // The hedged terrace: mossy kerb, a dense living roof, blossoms and a thread of light along its edge.
        const gr = g.createLinearGradient(0, y1, 0, y1 + lift); gr.addColorStop(0, '#2c5a4c'); gr.addColorStop(1, '#173a32');
        fillP(g, front, gr); fillP(g, leftCh, '#3e7a66'); fillP(g, rightCh, '#0a1a16');
        g.strokeStyle = 'rgba(6,16,13,.65)'; g.lineWidth = 1.4; g.beginPath(); for (let yy = y1 + 10; yy < y1 + lift; yy += 10) { g.moveTo(x0 + ch, yy); g.lineTo(x1 - ch, yy); } g.stroke();
        fillP(g, top, '#0f3a2e');
        const pal = LEAF[(w.w | 0) % 3], n = Math.max(10, Math.round(w.w * th / 640)), pts = [];
        for (let i = 0; i < w.w / 18; i++) { const x = x0 + 6 + r() * (w.w - 12), len = 8 + r() * 18; g.strokeStyle = pal[1]; g.lineWidth = 5 + r() * 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y1 - 2); g.lineTo(x, y1 + len); g.stroke(); } g.lineCap = 'butt';
        for (let i = 0; i < n; i++) pts.push([x0 + 8 + r() * (w.w - 16), y0 + 4 + r() * (th - 2)]); pts.sort((p, q) => p[1] - q[1]);
        for (const [x, y] of pts) clump(g, x, y, 12 + r() * 11, pal, r, .85);
        const BL = ['#7dffe0', '#ff8ae0', '#c8ff6a']; for (let i = 0; i < w.w * th / 900; i++) { const x = x0 + 8 + r() * (w.w - 16), y = y0 + 6 + r() * (th - 8), col = BL[r() * 3 | 0]; g.fillStyle = col; g.globalAlpha = .22; g.beginPath(); g.arc(x, y, 7, 0, TAU); g.fill(); g.globalAlpha = 1; g.beginPath(); g.arc(x, y, 1.8, 0, TAU); g.fill(); }
        g.strokeStyle = 'rgba(125,255,224,.32)'; g.lineWidth = 6; g.beginPath(); g.moveTo(x0 + ch, y1 + 1); g.lineTo(x1 - ch, y1 + 1); g.stroke(); g.strokeStyle = '#9dffe6'; g.lineWidth = 1.6; g.stroke();
      }
      return { c, L: style ? L.c : null, w: tw, h: H, lift, P, style };
    });
  }

  // ---------- trees: heavy wet crowns built from leaf clumps, moonlit on one side ----------
  function tree(v) {
    return once('t' + (v % 4), () => {
      const type = v % 4, W0 = 132, H0 = type < 2 ? 220 : 180, { c, g } = mk(W0, H0), cx = W0 / 2, base = H0 - 10, r = seeded(v * 71 + 9), pal = LEAF[type % 3];
      g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.ellipse(cx - 12, base + 1, 40, 11, 0, 0, TAU); g.fill();
      fillP(g, [[cx - 7, base], [cx + 7, base], [cx + 4, base - 60], [cx - 4, base - 60]], '#080b0c'); fillP(g, [[cx - 7, base], [cx - 2, base], [cx - 1, base - 60], [cx - 4, base - 60]], '#1a2422');
      if (type === 3) {
        // The weeping kind, with vines nearly to the ground.
        for (let i = 0; i < 10; i++) { const a = (i + .5) / 10 * Math.PI, X = cx - Math.cos(a) * 54, top = base - 110 - Math.sin(a) * 26, len = 72 + r() * 40; g.strokeStyle = pal[0]; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(X, top); g.lineTo(X + (r() - .5) * 8, top + len); g.stroke(); g.strokeStyle = pal[1]; g.lineWidth = 3; g.beginPath(); g.moveTo(X - 1, top); g.lineTo(X - 1, top + len - 8); g.stroke(); } g.lineCap = 'butt';
        for (let i = 0; i < 9; i++) clump(g, cx - 42 + i * 10.5, base - 122 - Math.sin(i / 8 * Math.PI) * 26 + r() * 10, 19 + r() * 7, pal, r, .85);
      } else if (type < 2) {
        // Tall and narrow, a stack of crowns.
        for (let i = 0; i < 8; i++) { const k = i / 7, y = base - 44 - k * 150, hw = (1 - k * .7) * 34; clump(g, cx - hw * .4 + r() * hw * .8, y, 19 + (1 - k) * 16, pal, r, .9); clump(g, cx + hw * .5 - r() * hw, y - 6, 15 + (1 - k) * 13, pal, r, .9); }
      } else {
        for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, d = 20 + r() * 28; clump(g, cx + Math.cos(a) * d * 1.05, base - 92 + Math.sin(a) * d * .78, 22 + r() * 11, pal, r, .85); } clump(g, cx - 8, base - 100, 28, pal, r, .85);
      }
      const K = .68; return { c, w: W0 * K, h: H0 * K, ax: cx * K, ay: base * K };
    });
  }
  // Arena floors. Drawn in the flat ground plane by paint(), one per boss kind, in that boss's colour.
  const ARENA = { warlord: { deep: '#160b08', mid: '#22100b', line: '#a83c1c', hot: '#ff7a40' }, foreman: { deep: '#14110a', mid: '#1f1a0e', line: '#8a6420', hot: '#ffc24a' }, sentinel: { deep: '#07131a', mid: '#0c1d27', line: '#2c7288', hot: '#7ae8ff' }, colossus: { deep: '#151210', mid: '#201a16', line: '#7a6248', hot: '#ffb04a' } };
  function arenaFloor(g, a) {
    const P = ARENA[a.kind] || ARENA.colossus, R = a.r || 240, r = seeded((a.x | 0) * 7 + 3);
    const flat = (r0, n, col) => { g.fillStyle = col; g.beginPath(); octa(r0, n).forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.closePath(); g.fill(); }, line = (r0, n, col, lw) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); octa(r0, n).forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.closePath(); g.stroke(); };
    const rad = (R1, a0, a1, a2) => { const gr = g.createRadialGradient(0, 0, 0, 0, 0, R1); gr.addColorStop(0, a0); gr.addColorStop(.55, a1); gr.addColorStop(1, a2); return gr; };
    flat(R + 16, 16, '#030407'); flat(R + 6, 16, P.line); flat(R, 16, rad(R, P.mid, P.deep, '#06060a'));
    line(R - 10, 16, P.line, 2.5); line(R * .68, 16, P.line, 1.8);
    if (a.kind === 'warlord') {
      // The Forge: iron plates, molten seams running into a glowing pit.
      flat(R * .28, 8, rad(R * .28, '#ffb050', '#a83c1c', '#3a140a')); line(R * .28, 8, P.hot, 3);
      for (let i = 0; i < 10; i++) { let an = i / 10 * TAU + r() * .2, d = R * .28; const pts = [[Math.cos(an) * d, Math.sin(an) * d]]; while (d < R * .88) { d += 34 + r() * 44; an += (r() - .5) * .3; pts.push([Math.cos(an) * d, Math.sin(an) * d]); } for (const [lw, col] of [[11, 'rgba(255,90,30,.13)'], [4.5, 'rgba(255,110,40,.55)'], [1.6, 'rgba(255,214,150,.9)']]) { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); pts.forEach(([x, y], k) => g[k ? 'lineTo' : 'moveTo'](x, y)); g.stroke(); } }
      g.fillStyle = P.line; for (let i = 0; i < 8; i++) { g.save(); g.rotate(i / 8 * TAU + TAU / 16); poly(g, [[R * .74, -13], [R * .96, 0], [R * .74, 13]]); g.fill(); g.restore(); }
    } else if (a.kind === 'foreman') {
      // The Demolition Yard: poured slab, steel plate, and hazard paint nobody has renewed.
      g.save(); g.beginPath(); octa(R * .68, 16).forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x, y)); g.closePath(); g.clip(); g.strokeStyle = 'rgba(5,5,8,.6)'; g.lineWidth = 3; g.beginPath(); for (let i = -R; i < R; i += 64) { g.moveTo(i, -R); g.lineTo(i, R); g.moveTo(-R, i); g.lineTo(R, i); } g.stroke(); g.restore();
      for (let i = 0; i < 36; i++) { g.save(); g.rotate(i / 36 * TAU); g.fillStyle = i % 2 ? '#e0a92e' : '#0a0a0c'; poly(g, [[R * .74, -R * .06], [R * .92, -R * .1], [R * .92, R * .075], [R * .74, R * .05]]); g.fill(); g.restore(); }
      line(R * .74, 16, 'rgba(5,5,8,.8)', 3); line(R * .92, 16, 'rgba(5,5,8,.8)', 3);
      g.strokeStyle = 'rgba(224,169,46,.6)'; g.lineWidth = 8; g.beginPath(); g.arc(0, 0, R * .36, 0, TAU); g.stroke(); g.lineWidth = 6; g.beginPath(); g.moveTo(-R * .22, -R * .22); g.lineTo(R * .22, R * .22); g.moveTo(R * .22, -R * .22); g.lineTo(-R * .22, R * .22); g.stroke();
    } else if (a.kind === 'sentinel') {
      // The Observatory: a star chart in cyan glass, with a great eye at its centre.
      flat(R * .6, 16, rad(R * .6, 'rgba(70,190,230,.3)', 'rgba(20,70,100,.22)', 'rgba(7,19,26,0)'));
      g.strokeStyle = P.hot; g.globalAlpha = .9; g.lineWidth = 3; g.beginPath(); g.moveTo(-R * .54, 0); g.quadraticCurveTo(0, -R * .5, R * .54, 0); g.quadraticCurveTo(0, R * .5, -R * .54, 0); g.closePath(); g.stroke(); g.fillStyle = 'rgba(122,232,255,.35)'; g.beginPath(); g.arc(0, 0, R * .17, 0, TAU); g.fill(); g.fillStyle = P.hot; g.beginPath(); g.arc(0, 0, R * .07, 0, TAU); g.fill(); g.globalAlpha = 1;
      g.strokeStyle = 'rgba(122,232,255,.55)'; g.lineWidth = 1.8; g.beginPath(); for (let i = 0; i < 48; i++) { const an = i / 48 * TAU, l = i % 4 ? .86 : .78; g.moveTo(Math.cos(an) * R * l, Math.sin(an) * R * l); g.lineTo(Math.cos(an) * R * .94, Math.sin(an) * R * .94); } g.stroke();
      g.lineWidth = 1.2; g.strokeStyle = 'rgba(122,232,255,.3)'; g.beginPath(); for (let i = 0; i < 12; i++) { const an = r() * TAU, d = R * (.62 + r() * .1), an2 = an + 1 + r(), d2 = R * (.3 + r() * .4); g.moveTo(Math.cos(an) * d, Math.sin(an) * d); g.lineTo(Math.cos(an2) * d2, Math.sin(an2) * d2); } g.stroke();
    } else {
      // The Titan's Forum: a sunken amphitheatre, tier on tier, its great mosaic sun split by whatever fell here.
      for (let i = 0; i < 4; i++) { const r0 = R * (.96 - i * .09); flat(r0, 16, ['#1a1612', '#221c16', '#2a221a', '#332920'][i]); line(r0, 16, 'rgba(0,0,0,.55)', 3); line(r0 - 4, 16, 'rgba(200,170,120,.2)', 1.4); }
      flat(R * .6, 16, rad(R * .6, '#4a3418', '#2e2214', '#1f170f')); line(R * .6, 16, P.hot, 2.6);
      g.fillStyle = 'rgba(255,176,74,.13)'; for (let i = 0; i < 16; i++) { g.save(); g.rotate(i / 16 * TAU); poly(g, [[R * .16, -R * .05], [R * .56, 0], [R * .16, R * .05]]); g.fill(); g.restore(); }
      g.fillStyle = 'rgba(255,200,120,.5)'; g.beginPath(); g.arc(0, 0, R * .13, 0, TAU); g.fill(); g.fillStyle = '#3a2a18'; g.beginPath(); g.arc(0, 0, R * .08, 0, TAU); g.fill();
      for (let i = 0; i < 5; i++) { let an = r() * TAU, d = R * .1; const pts = [[Math.cos(an) * d, Math.sin(an) * d]]; while (d < R * .9) { d += 40 + r() * 60; an += (r() - .5) * .4; pts.push([Math.cos(an) * d, Math.sin(an) * d]); } g.strokeStyle = 'rgba(6,5,4,.85)'; g.lineWidth = 3.4; g.beginPath(); pts.forEach(([x, y], k) => g[k ? 'lineTo' : 'moveTo'](x, y)); g.stroke(); }
    }
  }
  // A brush zone lies flat: an angular edge, two deep greens and a fringe of blades along the back.
  function brushBed(g, b, seed, Y) {
    const r = seeded(seed * 31 + 3 + (b.x | 0)), cy = Y(b.y), k = TILT, R = b.r, pal = LEAF[seed % 3];
    // A black base, then leaf masses from back to front, then a few pale tips along the crown so the mass looks wet and alive.
    smoothP(g, lobes(b.x, cy, R + 12, k, r, 16)); g.fillStyle = 'rgba(8,48,40,.85)'; g.fill();
    const n = Math.max(16, Math.round(R * R / 480)), pts = [];
    for (let i = 0; i < n; i++) { const a = r() * TAU, d = Math.sqrt(r()) * R * .86; pts.push([b.x + Math.cos(a) * d, cy + Math.sin(a) * d * k]); }
    pts.sort((p, q) => p[1] - q[1]);
    for (const [x, y] of pts) clump(g, x, y, 15 + r() * 15, pal, r, .82);
    g.fillStyle = 'rgba(164,240,206,.5)'; for (let i = 0; i < R / 6; i++) { const a = r() * TAU, d = Math.sqrt(r()) * R * .86; g.beginPath(); g.arc(b.x + Math.cos(a) * d, cy + Math.sin(a) * d * k - 5, .7 + r() * 1.1, 0, TAU); g.fill(); }
  }

  // ---------- street furniture ----------
  function lantern(red = false) {
    return once(red ? 'lanR' : 'lan', () => {
      const { c, g } = mk(64, 130), cx = 32, base = 120, lit = red ? '#ffb08a' : '#ffe2a8', mid = red ? '#d8583a' : '#c9a860', hot = red ? '#ffe9dc' : '#fff8e4', iron = '#1f2530', iron2 = '#56647a';
      g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.ellipse(cx - 6, base + 2, 15, 5, 0, 0, TAU); g.fill();
      fillP(g, [[cx - 8, base], [cx + 8, base], [cx + 4, base - 12], [cx - 4, base - 12]], iron); fillP(g, [[cx - 2.5, base - 12], [cx + 2.5, base - 12], [cx + 2, base - 94], [cx - 2, base - 94]], iron); g.fillStyle = iron2; g.fillRect(cx - 2.5, base - 94, 1.4, 82);
      g.strokeStyle = iron; g.lineWidth = 2.6; g.beginPath(); g.moveTo(cx - 19, base - 92); g.quadraticCurveTo(cx, base - 110, cx + 19, base - 92); g.stroke();
      for (const s of [-1, 1]) { const x = cx + s * 19, y = base - 88; g.fillStyle = iron; g.fillRect(x - 5, y - 7, 10, 3); g.fillStyle = lit; g.beginPath(); g.arc(x, y + 3, 9, 0, TAU); g.fill(); g.fillStyle = mid; g.beginPath(); g.arc(x + 3, y + 5, 7, 0, TAU); g.fill(); g.fillStyle = lit; g.beginPath(); g.arc(x - 1, y + 2, 6, 0, TAU); g.fill(); g.fillStyle = hot; g.beginPath(); g.arc(x - 2, y, 3, 0, TAU); g.fill(); }
      fillP(g, [[cx - 4, base - 100], [cx + 4, base - 100], [cx, base - 114]], iron2);
      return { c, w: 64 * .72, h: 130 * .72, ax: cx * .72, ay: base * .72, lightY: 96 * .72 };
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
  // ---------- buildings: stepped deco towers. `L` is an overlay of the window glass and neon, added on top by the renderer ----------
  function house(v, side = 0) {
    return once('h' + v + 's' + side, () => {
      const type = v % 4, W0 = 156, H0 = [210, 300, 170, 360][type], { c, g } = mk(W0, H0), L = mk(W0, H0), l = L.g, L2 = mk(W0, H0), l2 = L2.g, base = H0 - 10, cx = W0 / 2, r = seeded(v * 19 + 3 + side * 7), alt = v % 2;
      const P2 = side ? { body: '#1b1426', lit: '#3a2748', shade: '#0b0812', sky: '#4a2c50', trim: alt ? '#b6ec3a' : '#c8243a', glass: alt ? '#ffa45a' : '#ff7a6a', neon: alt ? '#b6ec3a' : '#ff4a5c' } : { body: '#122445', lit: '#2a4d80', shade: '#091426', sky: '#3f5f8a', trim: '#e6d19c', glass: alt ? '#a8dcff' : '#ffd98a', neon: alt ? '#6cd2ff' : '#ffdf9e' };
      g.fillStyle = 'rgba(0,0,0,.6)'; g.beginPath(); g.ellipse(cx - 16, base + 2, 66, 13, 0, 0, TAU); g.fill();
      const stages = type === 3 ? [[62, 120], [46, 220], [28, 310]] : type === 1 ? [[60, 130], [42, 230]] : type === 2 ? [[66, 86], [46, 142]] : [[60, 108], [40, 176]];
      let y = base, chimX = 0, chimZ = 0;
      const win = (x, yy, w, h) => { g.fillStyle = '#04060b'; g.fillRect(x, yy, w, h); l.fillStyle = P2.glass; l2.fillStyle = P2.glass; const q = r(); if (q > .24) { l.globalAlpha = .55 + r() * .45; l.fillRect(x + .5, yy + .5, w - 1, h - 1); l.globalAlpha = 1; } if (q > .74) l2.fillRect(x + .5, yy + .5, w - 1, h - 1); };
      stages.forEach(([hw, top], i) => {
        const yt = base - top, gr = g.createLinearGradient(0, yt, 0, y); gr.addColorStop(0, P2.sky); gr.addColorStop(.22, P2.body); gr.addColorStop(1, P2.body);
        fillP(g, [[cx - hw, y], [cx + hw, y], [cx + hw, yt], [cx - hw, yt]], gr);
        const lg = g.createLinearGradient(0, yt, 0, y); lg.addColorStop(0, '#6a84aa'); lg.addColorStop(.3, P2.lit); lg.addColorStop(1, P2.lit);
        fillP(g, [[cx - hw, y], [cx - hw * .3, y], [cx - hw * .3, yt], [cx - hw, yt]], lg);
        fillP(g, [[cx + hw * .5, y], [cx + hw, y], [cx + hw, yt], [cx + hw * .5, yt]], P2.shade);
        const cols = Math.max(3, Math.floor(hw / 9)), step = (hw * 2 - 10) / cols;
        for (let k = 0; k < cols; k++) { const x = cx - hw + 7 + k * step; for (let yy = yt + 12; yy < y - 12; yy += 13) win(x, yy, step * .55, 9); g.fillStyle = 'rgba(170,190,220,.09)'; g.fillRect(x + step * .75, yt + 8, 2, y - yt - 14); }
        // Cornice and a band of the owner's metal at every setback.
        g.fillStyle = '#05070b'; g.fillRect(cx - hw - 3, yt - 1, hw * 2 + 6, 5); g.fillStyle = P2.trim; g.fillRect(cx - hw - 3, yt - 1, hw * 2 + 6, 2.2);
        if (i === 0) { g.fillStyle = '#04060b'; g.fillRect(cx - hw, base - 24, hw * 2, 22); l.fillStyle = P2.neon; for (let x = cx - hw + 6; x < cx + hw - 12; x += 26) { l.globalAlpha = .8; l.fillRect(x, base - 20, 18, 12); } l.globalAlpha = 1; l2.fillStyle = P2.neon; l2.fillRect(cx - 14, base - 20, 28, 12); }
        y = yt; chimX = hw * .5; chimZ = base - yt;
      });
      // A vertical blade sign up the lit corner of the taller blocks.
      if (type === 1 || type === 3) { const hw = stages[0][0], bx = cx - hw - 7, by = base - stages[0][1] + 12, bh = stages[0][1] - 40; g.fillStyle = '#05070b'; g.fillRect(bx - 2, by - 2, 11, bh + 4); l.fillStyle = P2.neon; l.fillRect(bx, by, 7, bh); l2.fillStyle = P2.neon; l2.fillRect(bx, by, 7, bh * .3); g.fillStyle = '#05070b'; for (let yy = by + 16; yy < by + bh; yy += 20) l.clearRect(bx, yy, 7, 3); }
      // Each kind wears a different crown.
      const last = stages[stages.length - 1], sw = last[0] * .62, dark = side ? '#1a1524' : '#1c2c48', lit2 = side ? '#46324f' : '#3a5a90';
      if (type === 3) { fillP(g, [[cx - sw, y], [cx + sw, y], [cx + 2, y - 54], [cx - 2, y - 54]], dark); fillP(g, [[cx - sw, y], [cx - 1, y], [cx - 1, y - 54], [cx - 2, y - 54]], lit2); g.fillStyle = P2.trim; g.fillRect(cx - 1, y - 68, 2, 18); l.fillStyle = '#ff5060'; l.beginPath(); l.arc(cx, y - 70, 3, 0, TAU); l.fill(); }
      else if (type === 1) { for (let i = -3; i <= 3; i++) { const a = i * .3 - Math.PI / 2; fillP(g, [[cx + Math.cos(a) * 14 - 4, y + 2], [cx + Math.cos(a) * 54, y + Math.sin(a) * 46], [cx + Math.cos(a) * 14 + 4, y + 2]], i < 0 ? lit2 : dark); } g.fillStyle = P2.trim; g.fillRect(cx - sw, y - 2, sw * 2, 2); }
      else if (type === 0) { fillP(g, [[cx - sw, y], [cx + sw, y], [cx + sw * .6, y - 12], [cx - sw * .6, y - 12]], dark); fillP(g, [[cx - sw * .6, y - 12], [cx + sw * .6, y - 12], [cx + sw * .3, y - 24], [cx - sw * .3, y - 24]], lit2); fillP(g, [[cx - sw * .1, y - 24], [cx + sw * .1, y - 24], [cx, y - 46]], lit2); }
      else { g.fillStyle = dark; g.beginPath(); g.ellipse(cx, y, sw, 22, 0, Math.PI, TAU); g.fill(); g.fillStyle = lit2; g.beginPath(); g.ellipse(cx - sw * .25, y, sw * .7, 18, 0, Math.PI, TAU); g.fill(); g.fillStyle = P2.trim; g.fillRect(cx - 1.5, y - 30, 3, 10); }
      return { c, L: L.c, L2: L2.c, w: W0, h: H0, ax: cx, ay: base, chimX: chimX, chimZ: chimZ, tall: H0, glass: P2.glass };
    });
  }
  function hq(team) {
    return once('hq' + team, () => {
      const W0 = 420, H0 = 640, { c, g } = mk(W0, H0), L = mk(W0, H0), l = L.g, ax = W0 / 2, ay = H0 - 16;
      g.fillStyle = 'rgba(0,0,0,.65)'; g.beginPath(); g.ellipse(ax - 24, ay + 2, 192, 28, 0, 0, TAU); g.fill();
      const vg = (a, b, y0, y1) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, a); gr.addColorStop(1, b); return gr; };
      const slab = (x0, x1, y0, y1, a, b, shade) => { fillP(g, [[x0, y1], [x1, y1], [x1, y0], [x0, y0]], vg(a, b, y0, y1)); fillP(g, [[x0 + (x1 - x0) * .66, y1], [x1, y1], [x1, y0], [x0 + (x1 - x0) * .66, y0]], shade); };
      const win = (x, y, w, h, col, a = 1) => { g.fillStyle = '#04060b'; g.fillRect(x, y, w, h); l.fillStyle = col; l.globalAlpha = a; l.fillRect(x + .7, y + .7, w - 1.4, h - 1.4); l.globalAlpha = 1; };
      if (team === 0) {
        // Hero HQ: a stepped deco skyscraper with gold fins, a sunburst crown and a searchlight beacon.
        const A = '#35568a', B = '#14233c', S2 = '#0a1426', r = seeded(77);
        slab(30, 390, ay - 130, ay, A, B, S2); slab(70, 350, ay - 300, ay - 130, A, B, S2); slab(120, 300, ay - 440, ay - 300, A, B, S2); slab(156, 264, ay - 520, ay - 440, A, B, S2);
        for (let i = 0; i < 2; i++) { const x = i ? 332 : 20; slab(x, x + 68, ay - 200, ay, A, B, S2); fillP(g, [[x, ay - 200], [x + 34, ay - 244], [x + 68, ay - 200]], i ? '#1b3050' : '#3c5e94'); }
        for (const [x0, x1, y] of [[24, 396, ay - 132], [64, 356, ay - 302], [114, 306, ay - 442], [150, 270, ay - 522]]) { g.fillStyle = '#05070b'; g.fillRect(x0, y - 1, x1 - x0, 6); g.fillStyle = HERO.gold; g.fillRect(x0, y - 1, x1 - x0, 3); }
        for (let x = 52; x < 372; x += 22) if (Math.abs(x + 5 - ax) > 58) for (const y of [ay - 112, ay - 82, ay - 52, ay - 26]) win(x, y, 11, 18, '#ffdf9e', .6 + r() * .4);
        for (let x = 92; x < 332; x += 20) if (Math.abs(x + 5 - ax) > 52) for (let y = ay - 286; y < ay - 148; y += 25) win(x, y, 10, 17, r() > .2 ? '#ffdf9e' : '#a8dcff', .55 + r() * .45);
        for (let x = 134; x < 290; x += 20) if (Math.abs(x + 5 - ax) > 34) for (let y = ay - 428; y < ay - 316; y += 25) win(x, y, 10, 17, '#ffe6b0', .6 + r() * .4);
        // The fins, gold, floor to crown.
        for (let i = -2; i <= 2; i++) { const x = ax + i * 20; g.fillStyle = '#05070b'; g.fillRect(x - 3, ay - 518, 7, 500); g.fillStyle = i < 0 ? HERO.gold : HERO.goldDk; g.fillRect(x - 2, ay - 518, 4, 500); }
        // Sunburst crown.
        for (let i = -6; i <= 6; i++) { const a = i * .22 - Math.PI / 2, len = i % 2 ? 76 : 108; fillP(g, [[ax + Math.cos(a) * 30 - 7, ay - 524], [ax + Math.cos(a) * len, ay - 524 + Math.sin(a) * len], [ax + Math.cos(a) * 30 + 7, ay - 524]], i < 0 ? HERO.gold : HERO.goldDk); }
        g.fillStyle = '#ffe9b0'; g.beginPath(); g.arc(ax, ay - 524, 21, Math.PI, TAU); g.fill(); l.fillStyle = '#fff4d0'; l.beginPath(); l.arc(ax, ay - 526, 15, 0, TAU); l.fill();
        // The winged star over the doors.
        l.fillStyle = HERO.gold; g.fillStyle = HERO.gold; const emY = ay - 224, st = []; for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, d = i % 2 ? 11 : 26; st.push([ax + Math.cos(a) * d, emY + Math.sin(a) * d]); } g.fillStyle = '#05070b'; poly(g, st); g.lineWidth = 6; g.strokeStyle = '#05070b'; g.stroke(); g.fillStyle = HERO.gold; poly(g, st); g.fill(); l.fillStyle = 'rgba(255,240,200,.55)'; poly(l, st); l.fill();
        for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { const q = [[ax + s * 28, emY - 8 + i * 8], [ax + s * (70 - i * 10), emY - 16 + i * 10], [ax + s * (60 - i * 10), emY - 6 + i * 10], [ax + s * 28, emY + i * 8]]; g.fillStyle = HERO.gold; poly(g, q); g.fill(); }
        // The great door.
        fillP(g, [[ax - 44, ay], [ax - 44, ay - 76], [ax, ay - 118], [ax + 44, ay - 76], [ax + 44, ay]], '#070b14');
        poly(l, [[ax - 34, ay], [ax - 34, ay - 70], [ax, ay - 104], [ax + 34, ay - 70], [ax + 34, ay]]); l.fillStyle = '#ffdf9e'; l.fill();
        g.fillStyle = '#20324f'; g.fillRect(ax - 90, ay - 6, 180, 6); g.fillStyle = '#35568a'; g.fillRect(ax - 70, ay - 11, 140, 5);
      } else {
        // Villain Lair: a black cathedral of blades split open on a reactor of poison light.
        const r = seeded(13), fort = [[14, ay], [14, ay - 150], [46, ay - 210], [56, ay - 110], [86, ay - 320], [120, ay - 200], [136, ay - 400], [168, ay - 260], [210, ay - 600], [252, ay - 260], [284, ay - 400], [300, ay - 200], [334, ay - 320], [364, ay - 110], [374, ay - 210], [406, ay - 150], [406, ay]];
        fillP(g, fort, vg('#2c1e36', '#0d0a12', ay - 600, ay));
        for (const f of [[[46, ay - 210], [56, ay - 110], [14, ay - 110]], [[86, ay - 320], [120, ay - 200], [62, ay - 130]], [[136, ay - 400], [168, ay - 260], [122, ay - 200]], [[210, ay - 600], [210, ay - 260], [168, ay - 260]], [[284, ay - 400], [284, ay - 240], [254, ay - 260]], [[334, ay - 320], [334, ay - 180], [304, ay - 200]], [[374, ay - 210], [374, ay - 110], [362, ay - 110]]]) { const m = f[0]; fillP(g, f, vg('#5a4266', '#1f1628', m[1], ay - 90)); }
        g.fillStyle = VIL.crimDk; g.fillRect(12, ay - 112, 396, 3);
        // Blades of red light down every buttress.
        const slit = (x, y, h, col = VIL.glow) => { g.fillStyle = '#040406'; poly(g, [[x, y], [x + 6, y + h * .5], [x, y + h], [x - 6, y + h * .5]]); g.fill(); l.fillStyle = col; poly(l, [[x, y + 2], [x + 4, y + h * .5], [x, y + h - 2], [x - 4, y + h * .5]]); l.fill(); };
        slit(60, ay - 96, 60); slit(100, ay - 200, 86); slit(146, ay - 250, 110); slit(274, ay - 250, 110); slit(320, ay - 200, 86); slit(360, ay - 96, 60); for (const x of [90, 130, 290, 330]) slit(x, ay - 96, 60);
        // The reactor seam up the great spire.
        g.fillStyle = '#040406'; poly(g, [[ax, ay - 572], [ax + 13, ay - 400], [ax + 26, ay - 100], [ax - 26, ay - 100], [ax - 13, ay - 400]]); g.fill();
        l.fillStyle = VIL.acid; poly(l, [[ax, ay - 556], [ax + 8, ay - 400], [ax + 18, ay - 106], [ax - 18, ay - 106], [ax - 8, ay - 400]]); l.fill();
        l.fillStyle = 'rgba(240,255,200,.95)'; poly(l, [[ax, ay - 520], [ax + 3, ay - 400], [ax + 7, ay - 112], [ax - 7, ay - 112], [ax - 3, ay - 400]]); l.fill();
        // Horns on the shoulders, and a sigil of red.
        for (const s of [-1, 1]) { fillP(g, [[ax + s * 40, ay - 340], [ax + s * 70, ay - 470], [ax + s * 104, ay - 520], [ax + s * 84, ay - 440], [ax + s * 80, ay - 340]], s < 0 ? '#4a3656' : '#160f1c'); }
        const emY = ay - 190; g.fillStyle = VIL.crim; poly(g, [[ax - 58, emY - 40], [ax - 26, emY - 28], [ax, emY + 34], [ax + 26, emY - 28], [ax + 58, emY - 40], [ax + 36, emY + 8], [ax, emY + 58], [ax - 36, emY + 8]]); g.fill();
        // Fanged gate.
        fillP(g, [[ax - 50, ay], [ax - 40, ay - 84], [ax, ay - 120], [ax + 40, ay - 84], [ax + 50, ay]], '#050507');
        l.fillStyle = VIL.glow; poly(l, [[ax - 32, ay], [ax - 26, ay - 72], [ax, ay - 96], [ax + 26, ay - 72], [ax + 32, ay]]); l.fill();
        g.fillStyle = '#050507'; for (let x = ax - 30; x < ax + 26; x += 13) poly(g, [[x, ay - 74 + Math.abs(x - ax + 2) * .2], [x + 13, ay - 74 + Math.abs(x - ax + 2) * .2], [x + 6.5, ay - 46 + r() * 6]]), g.fill();
      }
      const K = .72; return { c, L: L.c, w: W0 * K, h: H0 * K, ax: ax * K, ay: ay * K, K };
    });
  }
  // What stands around each boss's ground, so you know whose arena it is from the skyline of it. Two frames, so fires can burn.
  function arenaProp(kind) {
    return once('ap' + kind, () => {
      const W0 = 92, H0 = kind === 'colossus' ? 230 : 190, base = H0 - 10, cx = W0 / 2, frames = [];
      for (let f = 0; f < 2; f++) {
        const { c, g } = mk(W0, H0);
        g.fillStyle = 'rgba(0,0,0,.6)'; g.beginPath(); g.ellipse(cx - 8, base + 1, 30, 9, 0, 0, TAU); g.fill();
        const flame = (x, y, R, col, hot) => { const h = R * (f ? 1.9 : 1.6), sway = f ? 4 : -3, sh = (rr, hh, c2, dx) => { g.fillStyle = c2; g.beginPath(); g.moveTo(x - rr, y); g.bezierCurveTo(x - rr * 1.2, y - hh * .45, x - rr * .3 + dx, y - hh * .6, x + dx * 1.5, y - hh); g.bezierCurveTo(x + rr * .2 + dx, y - hh * .62, x + rr * 1.3, y - hh * .4, x + rr, y); g.closePath(); g.fill(); }; sh(R * 1.05, h, col, sway); sh(R * .72, h * .78, '#ffb648', -sway * .5); sh(R * .42, h * .5, hot, sway * .3); };
        if (kind === 'warlord') {
          fillP(g, [[cx - 20, base], [cx + 20, base], [cx + 8, base - 110], [cx - 8, base - 110]], '#120d0c'); fillP(g, [[cx - 20, base], [cx - 4, base], [cx - 2, base - 110], [cx - 8, base - 110]], '#3a2a24');
          for (const s of [-1, 1]) fillP(g, [[cx + s * 12, base - 40], [cx + s * 34, base - 80], [cx + s * 16, base - 62]], '#3a2a24');
          fillP(g, [[cx - 32, base - 134], [cx + 32, base - 134], [cx + 20, base - 108], [cx - 20, base - 108]], '#241814'); g.fillStyle = '#a83c1c'; g.fillRect(cx - 32, base - 136, 64, 3); flame(cx, base - 134, 24, '#ff7a30', '#ffe09a');
        } else if (kind === 'foreman') {
          // A site lamp on a girder, its stripes in hazard yellow.
          for (const o of [-14, 14]) { g.fillStyle = '#2a2f3a'; g.fillRect(cx + o - 2.5, base - 150, 5, 150); } g.strokeStyle = '#3a4252'; g.lineWidth = 2.2; g.beginPath(); for (let y = base; y > base - 150; y -= 24) { g.moveTo(cx - 14, y); g.lineTo(cx + 14, y - 24); g.moveTo(cx + 14, y); g.lineTo(cx - 14, y - 24); } g.stroke();
          for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? '#e0a92e' : '#101014'; g.fillRect(cx - 20, base - 16 - i * 7, 40, 7); }
          g.fillStyle = '#1d212a'; g.fillRect(cx - 28, base - 168, 56, 20); g.fillStyle = '#ffe9a0'; for (let i = 0; i < 3; i++) g.fillRect(cx - 24 + i * 17, base - 164, 13, 12);
        } else if (kind === 'sentinel') {
          // A pylon of the observatory with a floating lens.
          fillP(g, [[cx - 22, base], [cx + 22, base], [cx + 9, base - 120], [cx - 9, base - 120]], '#0d2230'); fillP(g, [[cx - 22, base], [cx - 4, base], [cx - 3, base - 120], [cx - 9, base - 120]], '#2c7288');
          g.fillStyle = '#7ae8ff'; for (let i = 0; i < 4; i++) g.fillRect(cx - 2, base - 28 - i * 22, 4, 12);
          const y = base - 148 + (f ? -3 : 3); fillP(g, [[cx, y - 30], [cx + 17, y], [cx, y + 30], [cx - 17, y]], '#2c7288'); fillP(g, [[cx, y - 30], [cx - 17, y], [cx, y + 30], [cx - 3, y]], '#7ae8ff'); fillP(g, [[cx, y - 14], [cx + 6, y], [cx, y + 14], [cx - 6, y]], '#eafcff');
        } else {
          // A broken giant's column with a votive fire on it.
          fillP(g, [[cx - 32, base], [cx + 32, base], [cx + 26, base - 22], [cx - 26, base - 22]], '#2a221a');
          fillP(g, [[cx - 24, base - 22], [cx + 24, base - 22], [cx + 20, base - 170], [cx + 6, base - 182], [cx - 20, base - 166]], '#1e1812'); fillP(g, [[cx - 24, base - 22], [cx - 6, base - 22], [cx - 5, base - 176], [cx - 20, base - 166]], '#4a3a2a');
          g.fillStyle = 'rgba(0,0,0,.5)'; for (let x = -14; x < 18; x += 9) g.fillRect(cx + x, base - 164, 2.4, 140);
          flame(cx - 2, base - 176, 20, '#ff9a3c', '#ffe7ac');
        }
        frames.push(c);
      }
      const K = .58; return { c: frames[0], frames, w: W0 * K, h: H0 * K, ax: cx * K, ay: base * K };
    });
  }
  // A sprite with its lit glass burned in, so a building that is simply on costs one draw and no blend change.
  function litOf(spr) { if (spr.lit) return spr.lit; if (!spr.L) return spr.lit = spr.c; const c = cv(spr.c.width, spr.c.height), g = c.getContext('2d'); g.drawImage(spr.c, 0, 0); g.globalCompositeOperation = 'lighter'; g.globalAlpha = .8; g.drawImage(spr.L, 0, 0); return spr.lit = c; }
  // The rear of a building, for extruding it into depth: its silhouette swept straight up by `deep` world units, so one
  // image does the work of a stack of slices. The renderer shears it to follow the screen, which is the parallax.
  function backOf(spr, shade = '#05070c', lit = '#1a2230', deep = 16) {
    if (spr.back) return spr.back;
    const w = spr.c.width, h = spr.c.height, up = Math.ceil(deep * SS), c = cv(w, h + up), g = c.getContext('2d');
    for (let i = 0; i <= up; i += 2) g.drawImage(spr.c, 0, up - i);
    g.globalCompositeOperation = 'source-in'; g.fillStyle = shade; g.fillRect(0, 0, w, h + up);
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = lit; g.fillRect(0, 0, w * .32, h + up);
    const K = spr.K || 1; return spr.back = { c, w: spr.w, h: spr.h + up / SS * K, up: up / SS * K };
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
      // A flat placeholder now; the relief-lit disc arrives from the job queue a moment later, in place.
      const T = R * .3, ry = R * .72, W0 = R * 2 + 12, H0 = ry * 2 + T + 12, { c, g } = mk(W0, H0), cx = W0 / 2, cy = ry + 6, top = team ? '#1c1d24' : '#16284a';
      g.fillStyle = team ? '#0c0c10' : '#0a1426'; g.beginPath(); g.ellipse(cx, cy + T, R, ry, 0, 0, TAU); g.fill(); g.fillRect(cx - R, cy, R * 2, T);
      g.fillStyle = top; g.beginPath(); g.ellipse(cx, cy, R, ry, 0, 0, TAU); g.fill();
      g.strokeStyle = team ? VIL.crim : HERO.gold; g.lineWidth = 1.8; g.beginPath(); g.ellipse(cx, cy, R * .78, ry * .78, 0, 0, TAU); g.stroke();
      const out = { c, w: W0, h: H0, cx, cy };
      Art.defer(() => { const px = Math.ceil(R * SS), d = Art.reliefStack(team, px), S = d.w; out.c = d.c; out.w = S / SS; out.h = S / SS; out.cx = S / SS / 2; out.cy = S / SS / 2 - R * .1; });
      return out;
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
  // ---------- what a fallen tower leaves ----------
  // Flat in the ground plane, scorched and low: nothing here stands up, so nothing reads as cover.
  function rubble(team, core) {
    return once(`rb${team}${core ? 'c' : 't'}`, () => {
      const R = core ? 112 : 82, W0 = Math.ceil(R * 2.9), H0 = Math.ceil(W0 * TILT + 8), { c, g } = mk(W0, H0), cx = W0 / 2, cy = H0 / 2, r = seeded(team * 7 + (core ? 3 : 1) + 11), rim = team ? ['#8a2838', '#3a1016'] : ['#b8a070', '#5a4a26'], top = team ? '#1c1a22' : '#16243c';
      g.save(); g.translate(cx, cy); g.scale(1, TILT);
      // A jagged scorch, hard-edged, and blast lines thrown outward from it.
      const burst = (R0, spread, col) => { g.fillStyle = col; g.beginPath(); const n = 28; for (let i = 0; i < n; i++) { const a = i / n * TAU, d = R0 * (i % 2 ? 1 - spread * r() : 1 + spread * r()); g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * d, Math.sin(a) * d); } g.closePath(); g.fill(); };
      burst(R * 1.04, .2, 'rgba(4,5,8,.7)'); burst(R * .78, .14, '#0b0d13');
      g.strokeStyle = '#05060a'; g.lineWidth = 2.2; g.beginPath(); for (let i = 0; i < 9; i++) { const a = r() * TAU, d0 = R * (.7 + r() * .2), d1 = R * (1.05 + r() * .2); g.moveTo(Math.cos(a) * d0, Math.sin(a) * d0); g.lineTo(Math.cos(a + .05) * d1, Math.sin(a + .05) * d1); } g.stroke();
      // Half the plinth's edge survives as a broken arc.
      g.strokeStyle = rim[1]; g.lineWidth = 5; g.beginPath(); for (let i = 0; i < 5; i++) { const a0 = i / 5 * TAU + r(), a1 = a0 + .3 + r() * .5; g.moveTo(Math.cos(a0) * R * .66, Math.sin(a0) * R * .66); g.arc(0, 0, R * .66, a0, a1); } g.stroke();
      // Flattened coins: little more than discs on the floor, the brightest thing here at low contrast.
      const coin = (x, y, Rc, an) => { g.save(); g.translate(x, y); g.rotate(an); g.scale(1, .62); g.fillStyle = '#05060a'; g.beginPath(); g.ellipse(1.5, 3, Rc + 2, Rc + 2, 0, 0, TAU); g.fill(); g.fillStyle = top; g.beginPath(); g.arc(0, 0, Rc, 0, TAU); g.fill(); g.strokeStyle = rim[0]; g.lineWidth = 1.8; g.beginPath(); g.arc(0, 0, Rc * .82, 0, TAU); g.stroke(); g.fillStyle = 'rgba(255,255,255,.08)'; g.beginPath(); g.moveTo(-Rc, 0); g.arc(0, 0, Rc, Math.PI, 0); g.closePath(); g.fill(); g.restore(); };
      const n = core ? 17 : 12; for (let i = 0; i < n; i++) { const a = r() * TAU, d = Math.sqrt(r()) * R * .8; coin(Math.cos(a) * d, Math.sin(a) * d, (core ? 18 : 14) + r() * 9, r() * TAU); }
      g.restore();
      // A few embers still bright, so the eye knows this just happened.
      for (let i = 0; i < 9; i++) { const a = r() * TAU, d = Math.sqrt(r()) * R * .68; g.fillStyle = r() > .5 ? '#ffb05a' : '#ff7038'; g.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d * TILT, 2, 2); }
      return { c, w: W0, h: H0, cx, cy };
    });
  }

  // ---------- the city's people and machines ----------
  // A row of bystanders behind a low rail. Two frames: arms down and arms up.
  function crowd(v) {
    return once('cw' + v % 3, () => {
      const k = v % 3, W0 = 136, H0 = 42, frames = [], tones = [['#b98a5a', '#6c8a8a', '#a86a78', '#6a80ac', '#d0b070', '#8a7aa8'], ['#7a93ae', '#cfa56a', '#a78a60', '#7aa088', '#b0707a', '#9490a8'], ['#a8785a', '#7c98b0', '#c0a278', '#88a07a', '#a07090', '#7a88b0']][k];
      for (let f = 0; f < 2; f++) {
        const { c, g } = mk(W0, H0), r = seeded(k * 31 + 17), n = 9;
        for (let i = 0; i < n; i++) {
          const x = 10 + i * ((W0 - 20) / (n - 1)) + (r() - .5) * 5, base = 34 - r() * 5, up = (i + f) % 2 === 0, col = tones[i % tones.length], h = 13 + r() * 3;
          g.fillStyle = INK; g.fillRect(x - 5, base - h, 10, h + 2);
          g.fillStyle = col; g.fillRect(x - 3.8, base - h + 1, 7.6, h);
          // arms: raised and waving, or at their sides
          g.strokeStyle = col; g.lineWidth = 1.8; g.beginPath(); if (up) { g.moveTo(x - 4, base - h + 3); g.lineTo(x - 7.5, base - h - 6); g.moveTo(x + 4, base - h + 3); g.lineTo(x + 7, base - h - 6); } else { g.moveTo(x - 4.2, base - h + 3); g.lineTo(x - 6.5, base - h + 9); g.moveTo(x + 4.2, base - h + 3); g.lineTo(x + 6.5, base - h + 9); } g.stroke();
          g.fillStyle = INK; g.beginPath(); g.arc(x, base - h - 4, 5, 0, TAU); g.fill(); g.fillStyle = '#d6c0a4'; if (i % 3 === 1) g.fillStyle = '#a07c58'; g.beginPath(); g.arc(x, base - h - 4, 3.7, 0, TAU); g.fill();
        }
        // the rail
        g.fillStyle = '#0a0d13'; g.fillRect(2, 31, W0 - 4, 7); g.fillStyle = '#6a768a'; g.fillRect(2, 31, W0 - 4, 1.6); g.fillStyle = '#3a4556'; for (let x = 6; x < W0; x += 25) g.fillRect(x, 31, 3, 9);
        frames.push(c);
      }
      return { c: frames[0], frames, w: W0, h: H0, ax: W0 / 2, ay: 38 };
    });
  }

  // The bank: a deco temple of a building. The doorway is left open and dark; a separate door sits in it.
  function bank() {
    return once('bank', () => {
      const W0 = 300, H0 = 270, { c, g } = mk(W0, H0), L = mk(W0, H0), l = L.g, cx = W0 / 2, base = H0 - 12, gold = HERO.gold, dk = HERO.goldDk;
      g.fillStyle = 'rgba(0,0,0,.65)'; g.beginPath(); g.ellipse(cx - 18, base + 3, 138, 18, 0, 0, TAU); g.fill();
      // steps
      for (let i = 0; i < 3; i++) { const hw = 142 - i * 9, y = base - i * 7; fillP(g, [[cx - hw, y], [cx + hw, y], [cx + hw - 4, y - 7], [cx - hw + 4, y - 7]], i % 2 ? '#2f3848' : '#262e3c'); g.fillStyle = '#5a6678'; g.fillRect(cx - hw + 4, y - 7, (hw - 4) * 2, 1.4); }
      const top = base - 21, floor = base - 158;
      // the body behind the columns
      fillP(g, [[cx - 122, top], [cx + 122, top], [cx + 122, floor], [cx - 122, floor]], '#141b28');
      fillP(g, [[cx - 122, top], [cx - 58, top], [cx - 58, floor], [cx - 122, floor]], '#1c2636');
      // columns
      for (let i = -3; i <= 3; i++) { if (i === 0) continue; const x = cx + i * 36; fillP(g, [[x - 11, top], [x + 11, top], [x + 8, floor + 8], [x - 8, floor + 8]], '#2e394b'); fillP(g, [[x - 11, top], [x - 2, top], [x - 2, floor + 8], [x - 8, floor + 8]], '#46546a'); fillP(g, [[x + 4, top], [x + 11, top], [x + 8, floor + 8], [x + 4, floor + 8]], '#1a212d'); g.fillStyle = dk; g.fillRect(x - 12, floor + 6, 24, 3); g.fillRect(x - 13, top - 3, 26, 3); }
      // windows between columns glow
      for (const x of [cx - 90, cx - 54, cx + 54, cx + 90]) { g.fillStyle = '#05070b'; g.fillRect(x - 8, floor + 34, 16, 50); l.fillStyle = '#ffd98a'; l.fillRect(x - 7, floor + 35, 14, 48); }
      // the doorway: a round vault frame set in a dark arch
      g.fillStyle = '#06080d'; g.beginPath(); g.moveTo(cx - 34, top); g.lineTo(cx - 34, top - 68); g.arc(cx, top - 68, 34, Math.PI, 0); g.lineTo(cx + 34, top); g.closePath(); g.fill();
      g.strokeStyle = gold; g.lineWidth = 2.6; g.beginPath(); g.moveTo(cx - 36, top); g.lineTo(cx - 36, top - 68); g.arc(cx, top - 68, 36, Math.PI, 0); g.lineTo(cx + 36, top); g.stroke();
      // entablature and stepped pediment
      fillP(g, [[cx - 130, floor + 8], [cx + 130, floor + 8], [cx + 130, floor - 18], [cx - 130, floor - 18]], '#1f2838'); g.fillStyle = gold; g.fillRect(cx - 132, floor - 20, 264, 3); g.fillStyle = dk; g.fillRect(cx - 130, floor + 6, 260, 2);
      fillP(g, [[cx - 100, floor - 20], [cx + 100, floor - 20], [cx + 72, floor - 44], [cx - 72, floor - 44]], '#18202d');
      fillP(g, [[cx - 100, floor - 20], [cx - 30, floor - 20], [cx - 20, floor - 44], [cx - 72, floor - 44]], '#28344a');
      fillP(g, [[cx - 62, floor - 44], [cx + 62, floor - 44], [cx + 34, floor - 66], [cx - 34, floor - 66]], '#222c3e');
      // a big coin set in the pediment, the only sign the building needs
      const Cy = floor - 34; g.fillStyle = INK; g.beginPath(); g.arc(cx, Cy, 24, 0, TAU); g.fill(); g.fillStyle = gold; g.beginPath(); g.arc(cx, Cy, 21, 0, TAU); g.fill(); g.fillStyle = '#b89a58'; g.beginPath(); g.arc(cx + 2, Cy + 2, 18, 0, TAU); g.fill(); g.fillStyle = '#2a1f0c'; g.beginPath(); g.arc(cx, Cy - 5, 6.5, 0, TAU); g.fill(); g.beginPath(); g.moveTo(cx - 4, Cy - 2); g.lineTo(cx + 4, Cy - 2); g.lineTo(cx + 6.5, Cy + 12); g.lineTo(cx - 6.5, Cy + 12); g.closePath(); g.fill();
      // roof beacons, the siren lights' sockets
      for (const s of [-1, 1]) { g.fillStyle = '#2a303c'; g.fillRect(cx + s * 112 - 3, floor - 34, 6, 15); }
      return { c, L: L.c, w: W0, h: H0, ax: cx, ay: base, doorY: top, sirens: [[-112, 195], [112, 195]] };
    });
  }
  // The vault door that seals the arch: a coin of steel with a wheel.
  function vaultDoor() {
    return once('vault', () => {
      const W0 = 74, H0 = 74, { c, g } = mk(W0, H0), cx = 37, cy = 37;
      g.fillStyle = INK; g.beginPath(); g.arc(cx, cy, 35, 0, TAU); g.fill();
      g.fillStyle = '#7f8a9c'; g.beginPath(); g.arc(cx, cy, 32, 0, TAU); g.fill(); g.fillStyle = '#4a5364'; g.beginPath(); g.arc(cx, cy, 32, -.3, Math.PI - .3); g.fill(); g.fillStyle = '#5e697c'; g.beginPath(); g.arc(cx, cy, 26, 0, TAU); g.fill();
      g.strokeStyle = HERO.gold; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, 28, 0, TAU); g.stroke();
      g.strokeStyle = '#d8dfea'; g.lineWidth = 3.4; g.lineCap = 'round'; for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI + .3; g.beginPath(); g.moveTo(cx - Math.cos(a) * 15, cy - Math.sin(a) * 15); g.lineTo(cx + Math.cos(a) * 15, cy + Math.sin(a) * 15); g.stroke(); } g.lineCap = 'butt';
      g.fillStyle = HERO.gold; g.beginPath(); g.arc(cx, cy, 5.5, 0, TAU); g.fill();
      return { c, w: W0, h: H0, ax: cx, ay: cy };
    });
  }
  // The armoured convoy, drawn from the side. Two frames for the wheels; flipped to travel left.
  function convoy() {
    return once('convoy', () => {
      const W0 = 172, H0 = 88, frames = [], base = 76, cx = W0 / 2;
      for (let f = 0; f < 2; f++) {
        const { c, g } = mk(W0, H0);
        g.fillStyle = 'rgba(0,0,0,.6)'; g.beginPath(); g.ellipse(cx - 2, base + 3, 78, 8, 0, 0, TAU); g.fill();
        // body: a stepped deco van, nose to the right
        const P = [[14, base - 12], [14, base - 54], [26, base - 62], [112, base - 62], [136, base - 44], [158, base - 36], [160, base - 12]];
        g.strokeStyle = INK; g.lineWidth = 4.5; g.lineJoin = 'miter'; g.fillStyle = '#1e3050'; poly(g, P); g.stroke(); g.fill();
        fillP(g, [[14, base - 40], [14, base - 54], [26, base - 62], [112, base - 62], [122, base - 54], [122, base - 40]], '#34507e');
        fillP(g, [[14, base - 16], [160, base - 16], [160, base - 12], [14, base - 12]], '#101827');
        g.fillStyle = HERO.gold; g.fillRect(14, base - 28, 146, 3); g.fillStyle = HERO.goldDk; g.fillRect(14, base - 25, 146, 1.5);
        // windows with people looking out
        const heads = ['#d6c0a4', '#a07c58', '#d0a97a', '#b58a64'];
        for (let i = 0; i < 4; i++) { const x = 28 + i * 24; g.fillStyle = '#05070b'; g.fillRect(x - 8, base - 56, 18, 15); g.fillStyle = '#ffd98a'; g.globalAlpha = .55; g.fillRect(x - 7, base - 55, 16, 13); g.globalAlpha = 1; g.fillStyle = heads[i]; g.beginPath(); g.arc(x + 1 + (f ? .7 : -.7) * (i % 2 ? 1 : -1), base - 46, 4, 0, TAU); g.fill(); g.fillRect(x - 4, base - 42, 10, 3); }
        // windscreen and headlamp
        fillP(g, [[124, base - 54], [137, base - 44], [125, base - 44]], '#c8e4f4'); g.fillStyle = '#fff3cf'; g.fillRect(154, base - 32, 6, 7);
        // a badge on the door
        g.fillStyle = INK; g.beginPath(); g.arc(68, base - 34, 9, 0, TAU); g.fill(); g.fillStyle = HERO.gold; g.beginPath(); g.moveTo(68, base - 41); g.lineTo(74, base - 34); g.lineTo(68, base - 27); g.lineTo(62, base - 34); g.closePath(); g.fill();
        // wheels with a turning spoke
        for (const x of [40, 130]) { g.fillStyle = INK; g.beginPath(); g.arc(x, base - 9, 13, 0, TAU); g.fill(); g.fillStyle = '#4a5364'; g.beginPath(); g.arc(x, base - 9, 7.5, 0, TAU); g.fill(); g.strokeStyle = '#c0c8d4'; g.lineWidth = 2; g.beginPath(); const a = f * Math.PI / 4; g.moveTo(x + Math.cos(a) * 6, base - 9 + Math.sin(a) * 6); g.lineTo(x - Math.cos(a) * 6, base - 9 - Math.sin(a) * 6); g.moveTo(x - Math.sin(a) * 6, base - 9 + Math.cos(a) * 6); g.lineTo(x + Math.sin(a) * 6, base - 9 - Math.cos(a) * 6); g.stroke(); }
        // a lightbar on the roof; the world flashes it
        g.fillStyle = INK; g.fillRect(60, base - 69, 34, 8); g.fillStyle = '#8a2830'; g.fillRect(62, base - 67, 14, 4); g.fillStyle = '#2a4a9a'; g.fillRect(78, base - 67, 14, 4);
        frames.push(c);
      }
      return { c: frames[0], frames, w: W0, h: H0, ax: cx, ay: base, siren: [77, base - 66] };
    });
  }
  // A supply crate in three-quarter view: top, front and side, banded with brass.
  function crate(open) {
    return once('crate' + (open ? 1 : 0), () => {
      const W0 = 92, H0 = 92, { c, g } = mk(W0, H0), cx = 46, cy = 58;
      g.fillStyle = 'rgba(0,0,0,.6)'; g.beginPath(); g.ellipse(cx, cy + 22, 38, 10, 0, 0, TAU); g.fill();
      const lid = [[cx, cy - 40], [cx + 40, cy - 22], [cx, cy - 4], [cx - 40, cy - 22]], left = [[cx - 40, cy - 22], [cx, cy - 4], [cx, cy + 28], [cx - 40, cy + 10]], right = [[cx + 40, cy - 22], [cx, cy - 4], [cx, cy + 28], [cx + 40, cy + 10]];
      poly(g, [[cx, cy - 42], [cx + 42, cy - 22], [cx + 42, cy + 12], [cx, cy + 32], [cx - 42, cy + 12], [cx - 42, cy - 22]]); g.fillStyle = INK; g.fill();
      fillP(g, left, '#2a3a58'); fillP(g, right, '#182440');
      if (open) { fillP(g, lid, '#05070b'); g.fillStyle = '#ffd86a'; for (const [x, y] of [[-14, -22], [8, -24], [-2, -14], [18, -20], [-22, -18]]) { g.beginPath(); g.ellipse(cx + x, cy + y, 7, 4.2, 0, 0, TAU); g.fill(); } }
      else { fillP(g, lid, '#3f5580'); fillP(g, [[cx, cy - 40], [cx, cy - 4], [cx - 40, cy - 22]], '#546e9e'); }
      // brass bands and corner plates
      const band = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      g.strokeStyle = HERO.gold; g.lineWidth = 3; g.beginPath(); for (const t of [.22, .78]) { const p = band(left[0], left[1], t), q = band(left[3], left[2], t); g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); const p2 = band(right[0], right[1], t), q2 = band(right[3], right[2], t); g.moveTo(p2[0], p2[1]); g.lineTo(q2[0], q2[1]); } g.stroke();
      if (!open) { g.strokeStyle = HERO.goldDk; g.lineWidth = 2.4; g.beginPath(); for (const t of [.22, .78]) { const a0 = band(lid[0], lid[1], t), b0 = band(lid[3], lid[2], t); g.moveTo(a0[0], a0[1]); g.lineTo(b0[0], b0[1]); } g.stroke(); g.fillStyle = '#ffd86a'; g.beginPath(); g.ellipse(cx, cy - 22, 12, 7, 0, 0, TAU); g.fill(); g.fillStyle = HERO.goldDk; g.beginPath(); g.ellipse(cx, cy - 22, 7, 4, 0, 0, TAU); g.fill(); }
      return { c, w: W0, h: H0, ax: cx, ay: cy + 24 };
    });
  }
  function parachute() {
    return once('chute', () => {
      const W0 = 124, H0 = 112, { c, g } = mk(W0, H0), cx = 62;
      // canopy in alternating gores
      const gore = (x0, x1, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(x0, 44); g.quadraticCurveTo(x0, 12, cx, 6); g.quadraticCurveTo(x1, 12, x1, 44); g.quadraticCurveTo((x0 + x1) / 2, 34, x0, 44); g.closePath(); g.fill(); };
      g.fillStyle = INK; g.beginPath(); g.moveTo(4, 47); g.quadraticCurveTo(4, 2, cx, 2); g.quadraticCurveTo(W0 - 4, 2, W0 - 4, 47); g.quadraticCurveTo(cx, 32, 4, 47); g.closePath(); g.fill();
      gore(8, 40, '#d9c79a'); gore(40, 62, '#f4ead0'); gore(62, 84, '#d9c79a'); gore(84, 116, '#f4ead0');
      g.strokeStyle = '#d9d2c0'; g.lineWidth = 1; g.beginPath(); for (const x of [10, 40, 84, 114]) { g.moveTo(x, 44); g.lineTo(cx, 108); } g.stroke();
      return { c, w: W0, h: H0, ax: cx, ay: 108 };
    });
  }
  // A helicopter in side view, with two rotor frames. Nose to the right.
  function heli() {
    return once('heli', () => {
      const W0 = 150, H0 = 60, frames = [], cx = 70, cy = 34;
      for (let f = 0; f < 2; f++) {
        const { c, g } = mk(W0, H0);
        g.fillStyle = INK; poly(g, [[6, cy - 8], [66, cy - 4], [66, cy + 3], [14, cy + 1]]); g.fill(); g.fillStyle = '#1b2230'; poly(g, [[10, cy - 6], [64, cy - 3], [64, cy + 1], [16, cy - 1]]); g.fill();
        // tail fin and tail rotor
        g.fillStyle = INK; poly(g, [[6, cy - 18], [16, cy - 18], [20, cy - 2], [8, cy - 2]]); g.fill(); g.fillStyle = '#6a768a'; g.fillRect(4, cy - 14 - (f ? 5 : -2), 3, 12);
        // cabin
        const body = [[58, cy - 12], [100, cy - 14], [124, cy - 2], [128, cy + 6], [112, cy + 12], [66, cy + 12], [58, cy + 4]];
        g.strokeStyle = INK; g.lineWidth = 3; g.lineJoin = 'miter'; g.fillStyle = '#20293a'; poly(g, body); g.stroke(); g.fill();
        fillP(g, [[58, cy - 12], [100, cy - 14], [108, cy - 8], [62, cy - 2]], '#3a485e');
        fillP(g, [[100, cy - 13], [122, cy - 2], [104, cy - 2]], '#b8d4e4');
        g.fillStyle = HERO.gold; g.fillRect(62, cy + 3, 48, 2);
        // skids
        g.strokeStyle = INK; g.lineWidth = 2.6; g.beginPath(); g.moveTo(70, cy + 12); g.lineTo(68, cy + 21); g.moveTo(104, cy + 12); g.lineTo(106, cy + 21); g.moveTo(58, cy + 21); g.lineTo(118, cy + 21); g.stroke();
        // mast and rotor disc: a thin bright streak that flickers between two lengths
        g.fillStyle = INK; g.fillRect(83, cy - 21, 5, 9);
        g.fillStyle = f ? 'rgba(220,226,236,.55)' : 'rgba(220,226,236,.3)'; g.beginPath(); g.ellipse(85, cy - 21, f ? 68 : 54, 2.2, 0, 0, TAU); g.fill();
        g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(85 - (f ? 44 : 26), cy - 22, f ? 88 : 52, 1.2);
        frames.push(c);
      }
      return { c: frames[0], frames, w: W0, h: H0, ax: cx + 16, ay: cy + 22, lampX: 118, lampY: cy + 10 };
    });
  }
  // A searchlight's beam: pale at the source, gone at the far end, soft along both edges. Drawn additively.
  function beam(col) {
    return once('bm' + col, () => {
      const W0 = 64, H0 = 320, c = cv(W0, H0), g = c.getContext('2d'), rgb = [1, 3, 5].map(i => parseInt(col.slice(i, i + 2), 16)).join(','), v = g.createLinearGradient(0, 0, 0, H0);
      v.addColorStop(0, `rgba(${rgb},.75)`); v.addColorStop(.5, `rgba(${rgb},.32)`); v.addColorStop(1, `rgba(${rgb},.07)`);
      g.fillStyle = v; g.beginPath(); g.moveTo(W0 / 2 - 3, 0); g.lineTo(W0 / 2 + 3, 0); g.lineTo(W0 - 1, H0); g.lineTo(1, H0); g.closePath(); g.fill();
      g.globalCompositeOperation = 'destination-in'; const m = g.createLinearGradient(0, 0, W0, 0); m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(.32, 'rgba(0,0,0,1)'); m.addColorStop(.68, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = m; g.fillRect(0, 0, W0, H0);
      return c;
    });
  }
  // The generator a Blackout turns on: a squat cabinet under a coil, with a bright terminal at the top.
  function generator() {
    return once('gen', () => {
      const W0 = 96, H0 = 110, { c, g } = mk(W0, H0), cx = 48, base = 100;
      g.fillStyle = 'rgba(0,0,0,.6)'; g.beginPath(); g.ellipse(cx - 5, base + 2, 38, 8, 0, 0, TAU); g.fill();
      fillP(g, [[cx - 34, base], [cx + 34, base], [cx + 28, base - 42], [cx - 28, base - 42]], '#1b2230'); fillP(g, [[cx - 34, base], [cx - 10, base], [cx - 8, base - 42], [cx - 28, base - 42]], '#3a485e');
      g.fillStyle = '#ffd98a'; for (let i = 0; i < 3; i++) g.fillRect(cx - 18 + i * 13, base - 32, 8, 5); g.fillStyle = '#58a6e6'; g.fillRect(cx - 18, base - 22, 34, 3);
      g.strokeStyle = '#8a97ac'; g.lineWidth = 3; g.beginPath(); for (let i = 0; i < 5; i++) { const y = base - 46 - i * 8; g.moveTo(cx - 15 + i * 2, y); g.lineTo(cx + 15 - i * 2, y); } g.stroke();
      fillP(g, [[cx - 10, base - 80], [cx + 10, base - 80], [cx + 4, base - 94], [cx - 4, base - 94]], '#46546a'); g.fillStyle = '#d8ecff'; g.beginPath(); g.arc(cx, base - 94, 5, 0, TAU); g.fill();
      return { c, w: W0, h: H0, ax: cx, ay: base };
    });
  }
  // ---------- districts (12.0) ----------
  // Every landmark is baked once: a dark neutral body, a white mask of everything that lights up (tinted per owner, once),
  // and a damage layer that villain ownership fades in. A frame only ever blits these.
  const DIST_COL = { hospital: '#6ff0c8', bank: '#ffd98a', power: '#7fd4ff', comms: '#c8a6ff', armory: '#ff9a4a', subway: '#9fe8ff' };
  const block = (g, x0, x1, top, bot, col = '#182030', lit = '#2a3648', trim = HERO.goldDk) => {
    fillP(g, [[x0, bot], [x1, bot], [x1, top], [x0, top]], col);
    const w = x1 - x0; fillP(g, [[x0, bot], [x0 + w * .28, bot], [x0 + w * .28, top], [x0, top]], lit);
    g.fillStyle = 'rgba(0,0,0,.34)'; g.fillRect(x1 - w * .14, top, w * .14, bot - top);
    g.fillStyle = trim; g.fillRect(x0 - 2, top - 2, w + 4, 2.6);
  };
  const panes = (g, l, x0, x1, top, bot, cols, rows, r, on = .72) => {
    const dx = (x1 - x0) / cols, dy = (bot - top) / rows, pw = Math.max(3, dx * .52), ph = Math.max(4, dy * .62);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const x = x0 + dx * (i + .5) - pw / 2, y = top + dy * (j + .5) - ph / 2; g.fillStyle = '#05070b'; g.fillRect(x, y, pw, ph);
      if (r() < on) { l.fillStyle = 'rgba(255,255,255,.9)'; l.fillRect(x + .6, y + .6, pw - 1.2, ph - 1.2); }
    }
  };
  const shade = (g, cx, base, rx) => { g.fillStyle = 'rgba(0,0,0,.62)'; g.beginPath(); g.ellipse(cx - 12, base + 2, rx, rx * .13, 0, 0, TAU); g.fill(); };
  const LAND_ART = {
    // A stepped white-tile clinic under a mint cross in a ring: the one bright, clean shape in the city.
    hospital() {
      const W0 = 250, H0 = 262, a = mk(W0, H0), g = a.g, l = mk(W0, H0).g, cx = W0 / 2, base = H0 - 12, r = seeded(411); shade(g, cx, base, 112);
      block(g, cx - 104, cx + 104, base - 84, base, '#232d3c', '#3c4a5e'); panes(g, l, cx - 96, cx - 36, base - 76, base - 12, 4, 3, r); panes(g, l, cx + 36, cx + 96, base - 76, base - 12, 4, 3, r);
      block(g, cx - 70, cx + 70, base - 150, base - 84, '#262f40', '#414f64'); panes(g, l, cx - 62, cx + 62, base - 144, base - 92, 8, 3, r);
      block(g, cx - 40, cx + 40, base - 188, base - 150, '#2a3446', '#47566c'); panes(g, l, cx - 32, cx + 32, base - 182, base - 156, 5, 2, r);
      // the ambulance bay: a deep canopy over lit doors
      g.fillStyle = '#05070b'; g.fillRect(cx - 28, base - 52, 56, 52); l.fillStyle = 'rgba(255,255,255,.95)'; l.fillRect(cx - 24, base - 48, 22, 48); l.fillRect(cx + 2, base - 48, 22, 48);
      fillP(g, [[cx - 40, base - 52], [cx + 40, base - 52], [cx + 34, base - 64], [cx - 34, base - 64]], '#46566e'); g.fillStyle = HERO.gold; g.fillRect(cx - 40, base - 53, 80, 2);
      // the cross: a ring on a short pylon, brightest thing on the block
      const Cy = base - 222, arm = 19, t = 7; g.fillStyle = '#2b3546'; g.fillRect(cx - 4, base - 198, 8, 12);
      g.fillStyle = INK; g.beginPath(); g.arc(cx, Cy, 32, 0, TAU); g.fill(); g.strokeStyle = '#2fb8a0'; g.lineWidth = 3.4; g.beginPath(); g.arc(cx, Cy, 28, 0, TAU); g.stroke();
      const plus = (c, k = 0) => { c.fillRect(cx - t - k, Cy - arm - k, (t + k) * 2, (arm + k) * 2); c.fillRect(cx - arm - k, Cy - t - k, (arm + k) * 2, (t + k) * 2); };
      g.fillStyle = '#dff8ef'; plus(g); l.fillStyle = '#fff'; plus(l); l.lineWidth = 3; l.strokeStyle = 'rgba(255,255,255,.7)'; l.beginPath(); l.arc(cx, Cy, 28, 0, TAU); l.stroke();
      return { a, l: l.canvas, cx, base, top: 256, flag: [-92, 90], half: 112 };
    },
    bank() { return null; },
    // Two cooling stacks and a turbine hall, with a pair of coils out front that arc whenever the station is live.
    power() {
      const W0 = 300, H0 = 262, a = mk(W0, H0), g = a.g, l = mk(W0, H0).g, cx = W0 / 2, base = H0 - 12, r = seeded(523); shade(g, cx, base, 140);
      const stack = (x, w, h) => {
        const top = base - h, waist = top + h * .34, path = c => { c.beginPath(); c.moveTo(x - w, base); c.quadraticCurveTo(x - w * .46, waist, x - w * .62, top); c.lineTo(x + w * .62, top); c.quadraticCurveTo(x + w * .46, waist, x + w, base); c.closePath(); };
        path(g); g.fillStyle = '#1b2433'; g.fill(); g.save(); path(g); g.clip(); g.fillStyle = '#3a4a60'; g.fillRect(x - w, top, w * .72, h); g.fillStyle = 'rgba(0,0,0,.36)'; g.fillRect(x + w * .4, top, w, h);
        l.save(); path(l); l.clip(); l.fillStyle = 'rgba(255,255,255,.85)'; l.fillRect(x - w, top + 24, w * 2, 4); l.fillRect(x - w, top + 62, w * 2, 2.4); l.restore(); g.restore();
        g.strokeStyle = HERO.goldDk; g.lineWidth = 2.4; g.beginPath(); g.moveTo(x - w * .62, top); g.lineTo(x + w * .62, top); g.stroke();
      };
      stack(cx - 66, 62, 200); stack(cx + 66, 56, 168);
      block(g, cx - 122, cx + 122, base - 66, base, '#171e2b', '#2b374a'); panes(g, l, cx - 112, cx + 112, base - 60, base - 18, 14, 2, r, .85);
      // bus bars feeding the coils
      for (const s of [-1, 1]) {
        const x = cx + s * 128, h = 126; fillP(g, [[x - 12, base], [x + 12, base], [x + 6, base - 18], [x - 6, base - 18]], '#2b3546');
        g.strokeStyle = '#8a97ac'; g.lineWidth = 2.6; g.beginPath(); for (let i = 0; i < 9; i++) { const y = base - 24 - i * 9, k = 8 - i * .3; g.moveTo(x - k, y); g.lineTo(x + k, y); } g.stroke();
        g.fillStyle = '#46546a'; g.fillRect(x - 2, base - h, 4, h - 16); g.fillStyle = '#c8d8ec'; g.beginPath(); g.arc(x, base - h, 9, 0, TAU); g.fill(); l.fillStyle = '#fff'; l.beginPath(); l.arc(x, base - h, 6.5, 0, TAU); l.fill();
      }
      return { a, l: l.canvas, cx, base, top: 214, flag: [66, 172], half: 142, coils: [[-128, 126], [128, 126]] };
    },
    // A thin lattice mast taller than anything nearby, with a dish halfway up: readable from across the screen.
    comms() {
      const W0 = 190, H0 = 340, a = mk(W0, H0), g = a.g, l = mk(W0, H0).g, cx = W0 / 2, base = H0 - 10, r = seeded(617), mh = 300; shade(g, cx, base, 76);
      block(g, cx - 72, cx + 72, base - 54, base, '#171e2b', '#2b374a'); panes(g, l, cx - 62, cx + 62, base - 48, base - 14, 8, 2, r, .6);
      const hw = y => 28 - (base - 54 - y) / (mh - 54) * 24;
      g.lineWidth = 2.4; g.strokeStyle = '#7a889c';
      g.beginPath(); g.moveTo(cx - 28, base - 54); g.lineTo(cx - 4, base - mh); g.moveTo(cx + 28, base - 54); g.lineTo(cx + 4, base - mh); g.stroke();
      g.lineWidth = 1.4; g.strokeStyle = '#566478'; g.beginPath();
      for (let i = 0; i < 11; i++) { const y0 = base - 54 - i * 22, y1 = y0 - 22, a0 = hw(y0), a1 = hw(y1); g.moveTo(cx - a0, y0); g.lineTo(cx + a1, y1); g.moveTo(cx + a0, y0); g.lineTo(cx - a1, y1); g.moveTo(cx - a1, y1); g.lineTo(cx + a1, y1); } g.stroke();
      // platforms and the dish
      for (const k of [.36, .68]) { const y = base - 54 - (mh - 54) * k, w = hw(y) + 14; g.fillStyle = '#2b3546'; g.fillRect(cx - w, y - 3, w * 2, 6); g.fillStyle = HERO.goldDk; g.fillRect(cx - w, y - 4, w * 2, 1.6); l.fillStyle = 'rgba(255,255,255,.8)'; for (let i = -1; i <= 1; i += 2) l.fillRect(cx + i * w - 2, y - 2, 4, 3); }
      const dy = base - 170; g.fillStyle = '#c0ccdc'; g.beginPath(); g.ellipse(cx + 26, dy, 13, 30, -.3, 0, TAU); g.fill(); g.fillStyle = '#3a485e'; g.beginPath(); g.ellipse(cx + 30, dy, 10, 26, -.3, 0, TAU); g.fill(); g.fillStyle = '#8a97ac'; g.fillRect(cx, dy - 1.5, 26, 3);
      l.fillStyle = '#fff'; l.beginPath(); l.arc(cx, base - mh - 2, 6, 0, TAU); l.fill(); g.fillStyle = '#c8d8ec'; g.beginPath(); g.arc(cx, base - mh - 2, 4, 0, TAU); g.fill();
      return { a, l: l.canvas, cx, base, top: mh + 8, flag: [-62, 56], half: 84, tip: mh + 2 };
    },
    // A battered blockhouse with a blast door. Crossed blades on a shield, set where a bank would put its name.
    armory() {
      const W0 = 300, H0 = 216, a = mk(W0, H0), g = a.g, l = mk(W0, H0).g, cx = W0 / 2, base = H0 - 12, r = seeded(709); shade(g, cx, base, 138);
      fillP(g, [[cx - 134, base], [cx + 134, base], [cx + 112, base - 118], [cx - 112, base - 118]], '#1a2130'); fillP(g, [[cx - 134, base], [cx - 72, base], [cx - 56, base - 118], [cx - 112, base - 118]], '#2e3a4c'); fillP(g, [[cx + 96, base], [cx + 134, base], [cx + 112, base - 118], [cx + 86, base - 118]], '#10151f');
      g.fillStyle = HERO.goldDk; g.fillRect(cx - 114, base - 121, 228, 3);
      for (const s of [-1, 1]) {
        const x = cx + s * 112; block(g, x - 30, x + 30, base - 164, base, s < 0 ? '#222b3b' : '#171e2b', s < 0 ? '#3a485c' : '#232d3c');
        for (let i = 0; i < 3; i++) { g.fillStyle = '#10151f'; g.fillRect(x - 28 + i * 21, base - 174, 14, 12); }
        g.fillStyle = '#05070b'; g.fillRect(x - 3, base - 142, 6, 26); l.fillStyle = '#fff'; l.fillRect(x - 2, base - 141, 4, 24);
      }
      // the blast door, hazard stripes along its foot
      g.fillStyle = '#05070b'; g.fillRect(cx - 62, base - 96, 124, 96); g.fillStyle = '#2e3a4c'; g.fillRect(cx - 58, base - 92, 116, 92); g.fillStyle = '#39475c'; g.fillRect(cx - 58, base - 92, 56, 92); g.fillStyle = '#0a0e15'; g.fillRect(cx - 1.2, base - 92, 2.4, 92);
      for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#e0a020' : '#14161c'; fillP(g, [[cx - 58 + i * 14.5, base], [cx - 58 + (i + 1) * 14.5, base], [cx - 58 + (i + 1) * 14.5 + 6, base - 11], [cx - 58 + i * 14.5 + 6, base - 11]], i % 2 ? '#e0a020' : '#14161c'); }
      const Cy = base - 56, sh = [[cx - 24, Cy - 24], [cx + 24, Cy - 24], [cx + 24, Cy + 4], [cx, Cy + 26], [cx - 24, Cy + 4]];
      fillP(g, sh.map(([x, y]) => [cx + (x - cx) * 1.14, Cy + (y - Cy) * 1.12]), INK); fillP(g, sh, '#c8a860'); fillP(g, sh.map(([x, y]) => [cx + (x - cx) * .78, Cy + (y - Cy) * .78]), '#2a2e38');
      g.strokeStyle = '#f0e4c0'; g.lineWidth = 3.4; g.beginPath(); g.moveTo(cx - 13, Cy + 12); g.lineTo(cx + 13, Cy - 16); g.moveTo(cx + 13, Cy + 12); g.lineTo(cx - 13, Cy - 16); g.stroke();
      l.fillStyle = 'rgba(255,255,255,.85)'; l.fillRect(cx - 58, base - 13, 116, 2.4);
      panes(g, l, cx - 106, cx - 70, base - 104, base - 62, 2, 2, r, .9); panes(g, l, cx + 70, cx + 106, base - 104, base - 62, 2, 2, r, .9);
      return { a, l: l.canvas, cx, base, top: 180, flag: [0, 124], half: 144 };
    },
    // A deco kiosk over a stairwell. Low on purpose: stations sit in traffic, and they must never hide a fight.
    subway() {
      const W0 = 170, H0 = 132, a = mk(W0, H0), g = a.g, l = mk(W0, H0).g, cx = W0 / 2, base = H0 - 8; shade(g, cx, base, 74);
      // the arch and sign at the back
      for (const s of [-1, 1]) { const x = cx + s * 54; g.fillStyle = '#2b3546'; g.fillRect(x - 5, base - 94, 10, 66); g.fillStyle = HERO.gold; g.fillRect(x - 6, base - 95, 12, 2.4); }
      fillP(g, [[cx - 70, base - 92], [cx + 70, base - 92], [cx + 58, base - 118], [cx - 58, base - 118]], '#1d2636'); g.fillStyle = HERO.gold; g.fillRect(cx - 72, base - 92, 144, 2.6);
      const Sy = base - 106; fillP(g, [[cx, Sy - 14], [cx + 34, Sy], [cx, Sy + 14], [cx - 34, Sy]], INK); fillP(g, [[cx, Sy - 11], [cx + 28, Sy], [cx, Sy + 11], [cx - 28, Sy]], '#2d3a4e');
      l.fillStyle = '#fff'; l.beginPath(); [[cx, Sy - 10], [cx + 26, Sy], [cx, Sy + 10], [cx - 26, Sy]].forEach(([x, y], i) => l[i ? 'lineTo' : 'moveTo'](x, y)); l.closePath(); l.fill();
      g.fillStyle = '#0a0e15'; g.fillRect(cx - 13, Sy - 5, 26, 8); g.fillRect(cx - 9, Sy + 3, 3, 2.4); g.fillRect(cx + 6, Sy + 3, 3, 2.4); g.fillStyle = '#ecd9a6'; g.fillRect(cx - 10, Sy - 3, 6, 4); g.fillRect(cx + 4, Sy - 3, 6, 4);
      // the stairwell, falling toward the camera: treads narrowing into the dark
      fillP(g, [[cx - 60, base], [cx + 60, base], [cx + 46, base - 42], [cx - 46, base - 42]], '#05070b');
      for (let i = 0; i < 6; i++) { const y = base - 6 - i * 6.6, w = 56 - i * 2.2; g.fillStyle = i % 2 ? '#1e2736' : '#293446'; g.fillRect(cx - w, y, w * 2, 3.4); l.fillStyle = `rgba(255,255,255,${.5 - i * .06})`; l.fillRect(cx - w, y, w * 2, 1.2); }
      for (const s of [-1, 1]) { g.strokeStyle = HERO.gold; g.lineWidth = 2.6; g.beginPath(); g.moveTo(cx + s * 62, base + 1); g.lineTo(cx + s * 48, base - 46); g.stroke(); }
      l.fillStyle = 'rgba(255,255,255,.75)'; l.fillRect(cx - 44, base - 40, 88, 5);
      return { a, l: l.canvas, cx, base, top: 122, half: 76, sign: 106 };
    },
  };
  // Cracks, scorch and broken glass, kept strictly to the building's own silhouette.
  function ruin(c, w, h, seed) {
    const o = cv(w, h), g = o.getContext('2d'), r = seeded(seed);
    for (let i = 0; i < 16; i++) { const x = r() * w, y = h * .08 + r() * h * .84, R = (12 + r() * 30) * w / 240; g.fillStyle = `rgba(4,3,5,${.3 + r() * .5})`; g.beginPath(); g.ellipse(x, y, R, R * (.6 + r() * .6), r() * 3, 0, TAU); g.fill(); }
    g.lineJoin = 'miter';
    for (let i = 0; i < 8; i++) {
      let x = r() * w, y = h * .06 + r() * h * .34; const pts = [[x, y]]; for (let k = 0; k < 6; k++) { x += (r() - .5) * w * .13; y += (.05 + r() * .09) * h; pts.push([x, y]); }
      for (const [col, lw] of [['#050306', 3], ['#b8481e', 1]]) { g.strokeStyle = col; g.lineWidth = lw * w / 240; g.beginPath(); pts.forEach(([a, b], j) => g[j ? 'lineTo' : 'moveTo'](a, b)); g.stroke(); }
    }
    g.globalCompositeOperation = 'destination-in'; g.drawImage(c, 0, 0, w, h);
    return o;
  }
  function landmark(kind) {
    return once('land' + kind, () => {
      if (kind === 'bank') { const b = bank(); return { c: b.c, L: b.L, D: null, src: b, w: b.w, h: b.h, ax: b.ax, ay: b.ay, top: 240, flag: [-112, 196], half: 146, lit: {} }; }
      const o = LAND_ART[kind](), w = o.a.c.width / SS, h = o.a.c.height / SS;
      return { ...o, c: o.a.c, L: o.l, D: null, w, h, ax: o.cx, ay: o.base, lit: {} };
    });
  }
  function landRuin(spr, kind) { return spr.D || (spr.D = ruin(spr.c, Math.ceil(spr.w), Math.ceil(spr.h), 900 + kind.length * 37)); }
  // The lit mask in one owner's colour. Baked at world resolution: glow does not need supersampling.
  function landLit(spr, col) {
    let c = spr.lit[col]; if (c) return c;
    c = cv(Math.ceil(spr.w), Math.ceil(spr.h)); const g = c.getContext('2d');
    g.drawImage(spr.L, 0, 0, c.width, c.height); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
    return spr.lit[col] = c;
  }
  // The precinct floor. Flat, low contrast, and different per kind, so you know where you are with the building off screen.
  const PAD_R = 200;
  function districtPad(kind) {
    return once('pad' + kind, () => {
      const W0 = (PAD_R + 12) * 2, H0 = Math.ceil(W0 * TILT), c = cv(W0, H0), g = c.getContext('2d'), col = DIST_COL[kind] || '#aab8cc', R = PAD_R, sub = kind === 'subway';
      g.translate(W0 / 2, H0 / 2); g.scale(1, TILT);
      const oct = (rr, fill) => { poly(g, octa(rr, 16, 0)); g.fillStyle = fill; g.fill(); }, rim = (rr, s, w) => { g.strokeStyle = s; g.lineWidth = w; g.beginPath(); g.arc(0, 0, rr, 0, TAU); g.stroke(); };
      oct(R + 10, 'rgba(5,7,12,.86)'); oct(R, '#141a24'); rim(R - 7, '#3a4658', 2); rim(R - 16, 'rgba(230,209,156,.26)', 1.4);
      for (let i = 0; i < 24; i++) { const a0 = i / 24 * TAU, a1 = (i + 1) / 24 * TAU; g.fillStyle = i % 2 ? '#19202c' : '#1d2532'; g.beginPath(); g.moveTo(Math.cos(a0) * 64, Math.sin(a0) * 64); g.arc(0, 0, R - 18, a0, a1); g.lineTo(Math.cos(a1) * 64, Math.sin(a1) * 64); g.closePath(); g.fill(); }
      oct(66, '#10151e'); rim(64, col, 2.2);
      g.strokeStyle = col; g.fillStyle = col; g.globalAlpha = .42;
      if (kind === 'hospital') { for (let i = 0; i < 8; i++) { g.save(); g.rotate(i / 8 * TAU); g.fillRect(120, -5, 40, 10); g.fillRect(135, -20, 10, 40); g.restore(); } g.fillRect(-9, -34, 18, 68); g.fillRect(-34, -9, 68, 18); }
      else if (kind === 'bank') { for (let i = 0; i < 40; i++) { g.save(); g.rotate(i / 40 * TAU); g.fillRect(150, -2, i % 5 ? 12 : 26, 4); g.restore(); } g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 40, 0, TAU); g.stroke(); g.beginPath(); g.arc(0, 0, 26, 0, TAU); g.stroke(); }
      else if (kind === 'power') { g.lineWidth = 3; for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + .39, c0 = Math.cos(a), s0 = Math.sin(a); g.beginPath(); g.moveTo(c0 * 72, s0 * 72); g.lineTo(c0 * 164, s0 * 164); g.stroke(); g.fillRect(c0 * 172 - 7, s0 * 172 - 7, 14, 14); } g.beginPath(); g.moveTo(10, -42); g.lineTo(-18, 6); g.lineTo(4, 6); g.lineTo(-10, 42); g.lineTo(20, -8); g.lineTo(-2, -8); g.closePath(); g.fill(); }
      else if (kind === 'comms') { g.lineWidth = 2; for (const rr of [96, 130, 164]) { g.beginPath(); g.arc(0, 0, rr, 0, TAU); g.stroke(); } g.lineWidth = 1.6; g.beginPath(); g.moveTo(-R + 22, 0); g.lineTo(R - 22, 0); g.moveTo(0, -R + 22); g.lineTo(0, R - 22); g.stroke(); g.beginPath(); g.arc(0, 0, 10, 0, TAU); g.fill(); }
      else if (kind === 'armory') { for (let i = 0; i < 8; i++) { g.save(); g.rotate(i / 8 * TAU); g.beginPath(); g.moveTo(118, -22); g.lineTo(150, 0); g.lineTo(118, 22); g.lineTo(130, 0); g.closePath(); g.fill(); g.restore(); } g.lineWidth = 7; g.beginPath(); g.moveTo(-24, 26); g.lineTo(24, -26); g.moveTo(24, 26); g.lineTo(-24, -26); g.stroke(); }
      else if (sub) { g.fillStyle = '#e0a020'; g.globalAlpha = .55; for (let i = -7; i <= 7; i++) g.fillRect(i * 22 - 8, 104, 14, 14); g.fillStyle = col; g.globalAlpha = .42; g.fillRect(-150, -56, 300, 4); g.fillRect(-150, -24, 300, 4); for (let i = -6; i <= 6; i++) g.fillRect(i * 24 - 2, -66, 4, 52); g.beginPath(); g.moveTo(0, -18); g.lineTo(30, 0); g.lineTo(0, 18); g.lineTo(-30, 0); g.closePath(); g.fill(); }
      g.globalAlpha = 1;
      return { c, w: W0, h: H0, R: PAD_R };
    });
  }
  // Damage left on the precinct by a villain takeover: burn, split paving, thrown rubble. One image, faded in.
  function districtScar() {
    return once('dscar', () => {
      const W0 = (PAD_R + 12) * 2, H0 = Math.ceil(W0 * TILT), c = cv(W0, H0), g = c.getContext('2d'), r = seeded(1212);
      g.translate(W0 / 2, H0 / 2); g.scale(1, TILT);
      for (let i = 0; i < 22; i++) { const a = r() * TAU, d = 40 + r() * 140, R = 18 + r() * 44; g.fillStyle = `rgba(3,2,4,${.28 + r() * .34})`; g.beginPath(); g.ellipse(Math.cos(a) * d, Math.sin(a) * d, R, R * .8, r() * 3, 0, TAU); g.fill(); }
      g.lineJoin = 'miter';
      for (let i = 0; i < 12; i++) {
        let a = r() * TAU, d = 50; const pts = [[Math.cos(a) * d, Math.sin(a) * d]]; while (d < 186) { a += (r() - .5) * .5; d += 18 + r() * 24; pts.push([Math.cos(a) * d, Math.sin(a) * d]); }
        for (const [col, lw] of [['#040305', 5], ['#7a2416', 1.3]]) { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); pts.forEach(([x, y], j) => g[j ? 'lineTo' : 'moveTo'](x, y)); g.stroke(); }
      }
      for (let i = 0; i < 30; i++) { const a = r() * TAU, d = 70 + r() * 124, s = 3 + r() * 8; g.fillStyle = i % 3 ? '#2a2e38' : '#3a4250'; g.save(); g.translate(Math.cos(a) * d, Math.sin(a) * d); g.rotate(r() * 3); g.fillRect(-s, -s * .7, s * 2, s * 1.4); g.restore(); }
      return { c, w: W0, h: H0, R: PAD_R };
    });
  }
  // A swallowtail flag on a short pole, two frames.
  function districtFlag(col) {
    return once('dflag' + col, () => {
      const frames = [0, 1].map(fr => { const { c, g } = mk(44, 62); g.fillStyle = '#c8cfdb'; g.fillRect(4, 2, 2.4, 58); const d = fr ? 3 : -3; g.fillStyle = INK; g.beginPath(); g.moveTo(5, 3); g.quadraticCurveTo(22, 3 + d, 42, 6); g.lineTo(32, 16); g.lineTo(42, 27); g.quadraticCurveTo(22, 24 - d, 5, 27); g.closePath(); g.fill(); g.fillStyle = col; g.beginPath(); g.moveTo(6.4, 5); g.quadraticCurveTo(22, 5 + d, 38, 8); g.lineTo(29, 16); g.lineTo(38, 25); g.quadraticCurveTo(22, 22 - d, 6.4, 25); g.closePath(); g.fill(); return c; });
      return { frames, w: 44, h: 62, ax: 5, ay: 60 };
    });
  }
  return { DIST_COL, landmark, landRuin, landLit, districtPad, districtScar, districtFlag, arenaProp, nearRoad, litOf, rubble, crowd, generator, bank, vaultDoor, convoy, crate, parachute, heli, beam, ARENA, paint, bake, cliff, tree, lantern, pillar, banner, house, hq, towerCoin, towerCrown, backOf, wave, spark, smoke, bubble, pool, nearRoad, spline, HALF, INK };
})();
