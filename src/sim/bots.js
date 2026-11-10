// Bot brains. Concatenated into the Sim closure by build.py at the marker in game.js, so it shares all of Sim's private helpers.
// Flipside 4.0: bots act only through the same inputs a person has. They know only what their
// team can see (Sim.canSee), remember last-seen positions with fading confidence, and every
// decision scales with one continuous skill value 0..1 per bot.
// 14.0 (skill-based matches, no comebacks): sides convert. planSiege groups the healthy bots on the best open structure after a
// won fight, an ace or a real lead, and takes it with the wave (towerCover) or a dive the group can afford (diveSiegeOk); bosses
// come first on a lead; the core is finished whatever stands near it. planClear meets enemy waves out in the lane once
// structures soften. Feet: the stick eases into a moving spot, holds a reached one, turns at a hand's pace, and footwork keeps a
// bot moving around its spot instead of planting. Skill adds stick quality, push discipline, greed (over-chasing), cooldown
// tracking, focus fire and shop timing. Bots call help, danger and attack pings for people; they follow help and attack pings from people.

  // ---------- skill: one number, 0 (beginner) to 1 (superb) ----------
  function skillProfile(v) {
    v = clamp(v === undefined || v === null || isNaN(v) ? .5 : v, 0, 1);
    const L = (a, b) => a + (b - a) * v, P = (a, b, e) => b + (a - b) * Math.pow(1 - v, e);
    return {
      v,
      think: L(.3, .085),            // seconds between decisions
      react: L(.62, .09),            // seconds to notice a telegraph
      err: P(.3, .012, 1.6),         // aim error in radians
      lead: L(.42, 1.05),            // how far ahead of a moving target it leads
      dodge: Math.pow(v, 1.4),       // chance of even trying to dodge a given shot
      wrongWay: (1 - v) * .45,       // chance a dodge goes the wrong way
      gap: L(1.15, .12),             // seconds between abilities
      lh: P(.2, .98, 1.25),          // chance a killable minion is even noticed
      lhErr: P(.32, .008, 1.5),      // last-hit timing error, in fractions of a hit
      judge: L(.55, .03),            // noise on fight judgement
      iq: v,                         // general decision quality
      macro: v,                      // objective, rotation and recall quality
      combo: Math.pow(v, 1.2),       // chance a combo is sequenced properly rather than mashed
      aggr: 1,
      low: L(.2, .36),               // health fraction that sends it home
      see: L(620, 1150),             // tunnel vision: how far away it notices targets
      mem: L(3, 20),                 // seconds a remembered enemy position stays useful
      guard: L(.25, 1),              // how strongly recent deaths make it play safe
      // 13.0
      evade: Math.pow(v, 1.15),      // chance an Evade-worthy threat is answered with one
      evLead: L(.3, .04),            // timing error on an Evade, seconds either side of ideal
      evBar: L(.55, .14),            // how big a hit must be (share of current health) before Evade is spent on it
      waste: Math.max(0, .5 - v) * .05,          // chance per hurt decision a beginner panics and burns Evade on nothing
      kite: Math.pow(v, .9),         // chance it steps between attacks (attack cancel) instead of standing
      steal: L(.1, .95),             // reads a boss low enough to steal and goes for it
      // 14.0
      hand: L(.42, .8),              // share of the gap the stick closes each frame (a beginner's thumb is slower and looser)
      push: Math.pow(v, .8),         // converts a won fight: groups, takes the tower with the wave, ends the game
      greed: L(.5, .04),             // chases a kill or a last minion too far, into fog or a tower
      shuffle: L(.35, .9),           // keeps moving in lane between jobs instead of planting
      track: clamp((v - .4) * 1.75, 0, 1), // remembers enemy cooldowns it saw used (ultimates, Evade)
      focus: v * v,                  // sticks to the side's focus target
    };
  }

  const CLASS = { vesper: 'back', ione: 'back', solenne: 'peel', kade: 'front', gravel: 'front', sable: 'flank', deadbolt: 'back', hex: 'back', plague: 'peel', duelist: 'front', ironjaw: 'front', shiv: 'flank', voltaic: 'flank', tidecaller: 'peel', paragon: 'front', mirage: 'back', cinder: 'back', ravager: 'flank', cataclysm: 'front', puppeteer: 'peel' };
  function makeBot(s, c, skill) {
    const i = c.slot, b = {
      skill: 0, sk: null, lane: c.role === 'top' || c.oneLane ? 0 : 1, cls: CLASS[c.champ] || 'front', mask: navMask(c.team), next: i * .05 + .02, foes: [], tid: 0, closest: 1e9, ratio: 1, noise: 0, noiseAt: 0, strafe: i % 2 ? 1 : -1,
      gx: c.x, gy: c.y, ga: 20, hasGoal: false, vx: 0, vy: 0, vecT: 0, ex: 0, ey: 0, evadeT: 0, dodgeAt: 0, dodgeSeen: 0, path: null, pi: 0, pgx: 0, pgy: 0, needPath: false, sx: c.x, sy: c.y, stuck: 0, still: false, diveOk: false,
      et: null, etTanks: 0, castAt: 0, chargeHold: 1.12, threatT: 9, parry: false, low: false, fighting: false, lhSoon: false, lastHome: 0, gank: null, gankCd: 0, deaths: [], siegeT: 0,
      evAt: 0, evPlan: null, st13: { ev: 0, evDodge: 0, evEsc: 0, evWaste: 0, evKill: 0, kiteSteps: 0, combo: 0, steal: 0, stand: 0, duel: 0 },
      buyPath: 0, potAt: 0, route: null, routeI: 0, cycles: 0, gankReady: false, chase: 0, noChase: 0, tradeT: 0, task: 'spawn', safeUntil: 0,
      setSkill(x) { b.skill = clamp(x, 0, 1); b.sk = skillProfile(b.skill); },
    };
    b.setSkill(skill !== undefined ? skill : c.skill !== undefined ? c.skill : .5);
    b.buyPath = hash01((s.seed || 7) + c.team * 31, c.slot + 77) * itemPaths(c.champ, c.build).length | 0;
    return b;
  }

  // ---------- bots: navigation ----------
  // The nav grid sits beside the collision grid. Each cell holds bits: walls, standing
  // towers, a fountain a team must not enter, and tower range (costly, not forbidden).
  const NAV_WALL = 1, NAV_TOWER = 2, NAV_NO0 = 4, NAV_NO1 = 8, NAV_T0 = 16, NAV_T1 = 32;
  // Search buffers are sized from the first map, whatever its dimensions are.
  let navG = null, navFrom = null, navSeen = null, navDone = null, heapK = null, heapF = null, navCap = 0;
  let navRun = 0;
  function navBuffers(m) {
    const n = m.cols * m.rows; if (n <= navCap) return;
    navCap = n; navG = new Float32Array(n); navFrom = new Int32Array(n); navSeen = new Uint32Array(n); navDone = new Uint32Array(n);
    heapK = new Int32Array(n * 8); heapF = new Float32Array(n * 8);
  }
  const navMask = team => NAV_WALL | NAV_TOWER | (team ? NAV_NO1 : NAV_NO0);

  function rebuildNav(s) {
    const m = s.map, c = m.cols, r = m.rows;
    navBuffers(m);
    const nav = m.nav || (m.nav = new Uint8Array(c * r)), clr = m.clr || (m.clr = new Uint8Array(c * r));
    const [f0, f1] = s.fountains;
    for (let j = 0; j < r; j++) for (let i = 0; i < c; i++) {
      const k = j * c + i, x = i * 40 + 20, y = j * 40 + 20;
      let b = m.grid[k] ? NAV_WALL : 0;
      for (const t of s.towers) {
        if (!t.alive) continue;
        const d = Math.hypot(x - t.x, y - t.y);
        if (d < t.r + 50) b |= NAV_TOWER;
        if (d < t.range + 20) b |= t.team ? NAV_T1 : NAV_T0;
      }
      if (Math.hypot(x - f1.x, y - f1.y) < 456) b |= NAV_NO0;
      if (Math.hypot(x - f0.x, y - f0.y) < 456) b |= NAV_NO1;
      nav[k] = b; clr[k] = b & (NAV_WALL | NAV_TOWER) ? 0 : 9;
    }
    // Distance in cells to the nearest obstacle, capped at 3. Paths pay to hug walls.
    for (let d = 1; d <= 3; d++) for (let j = 0; j < r; j++) for (let i = 0; i < c; i++) {
      const k = j * c + i; if (clr[k] !== 9) continue;
      let near = false;
      for (let y = Math.max(0, j - 1); y <= Math.min(r - 1, j + 1) && !near; y++) for (let x = Math.max(0, i - 1); x <= Math.min(c - 1, i + 1); x++) if (clr[y * c + x] === d - 1) { near = true; break; }
      if (near) clr[k] = d;
    }
    // Cached lane geometry for corridor checks, and a map-derived centre.
    m.laneLen = m.lanes.map(L => { let d = 0; for (let i = 0; i + 1 < L.length; i++) d += Math.hypot(L[i + 1][0] - L[i][0], L[i + 1][1] - L[i][1]); return d; });
  }

  function navCell(m, mask, x, y) {
    const c = m.cols, ci = clamp(x / 40 | 0, 0, c - 1), cj = clamp(y / 40 | 0, 0, m.rows - 1);
    if (!(m.nav[cj * c + ci] & mask)) return cj * c + ci;
    let best = -1, bd = 1e9;
    for (let r = 1; r < 10 && best < 0; r++) for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
      if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || i < 0 || j < 0 || i >= c || j >= m.rows || m.nav[j * c + i] & mask) continue;
      const d = Math.hypot(i * 40 + 20 - x, j * 40 + 20 - y); if (d < bd) { bd = d; best = j * c + i; }
    }
    return best;
  }

  // Line test with body width: the centre line and one line each side must be open.
  function clearLine(m, mask, ax, ay, bx, by, fat = 17) {
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy); if (l < 1) return true;
    const n = Math.ceil(l / 22), ox = -dy / l * fat, oy = dx / l * fat, c = m.cols, r = m.rows, nav = m.nav;
    for (let k = 0; k <= n; k++) {
      const x = ax + dx * k / n, y = ay + dy * k / n;
      for (let o = -1; o <= 1; o++) {
        const i = (x + ox * o) / 40 | 0, j = (y + oy * o) / 40 | 0;
        if (i < 0 || j < 0 || i >= c || j >= r || nav[j * c + i] & mask) return false;
      }
    }
    return true;
  }
  const navOpen = (m, mask, x, y) => { const i = x / 40 | 0, j = y / 40 | 0; return i >= 0 && j >= 0 && i < m.cols && j < m.rows && !(m.nav[j * m.cols + i] & mask); };

  // A* on typed arrays, so a search allocates almost nothing.
  function navPath(m, team, ax, ay, bx, by) {
    const c = m.cols, r = m.rows, nav = m.nav, clr = m.clr, mask = navMask(team), danger = team ? NAV_T0 : NAV_T1, N = c * r;
    const st = navCell(m, mask, ax, ay), en = navCell(m, mask, bx, by);
    if (st < 0 || en < 0) return null;
    const ex = en % c, ey = en / c | 0;
    navRun++;
    let hs = 0, found = st === en, guard = 0;
    const push = (k, f) => {
      if (hs >= heapK.length) return;
      let i = hs++;
      while (i > 0) { const p = (i - 1) >> 1; if (heapF[p] <= f) break; heapK[i] = heapK[p]; heapF[i] = heapF[p]; i = p; }
      heapK[i] = k; heapF[i] = f;
    };
    const pop = () => {
      const top = heapK[0]; hs--;
      if (hs > 0) {
        const lk = heapK[hs], lf = heapF[hs]; let i = 0;
        for (; ;) { const a = 2 * i + 1; if (a >= hs) break; const sm = a + 1 < hs && heapF[a + 1] < heapF[a] ? a + 1 : a; if (heapF[sm] >= lf) break; heapK[i] = heapK[sm]; heapF[i] = heapF[sm]; i = sm; }
        heapK[i] = lk; heapF[i] = lf;
      }
      return top;
    };
    navG[st] = 0; navFrom[st] = -1; navSeen[st] = navRun; push(st, 0);
    while (hs && !found && guard++ < N) {
      const n = pop(); if (navDone[n] === navRun) continue; navDone[n] = navRun;
      if (n === en) { found = true; break; }
      const x = n % c, y = n / c | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= c || ny >= r) continue;
        const k = ny * c + nx; if (nav[k] & mask || navDone[k] === navRun) continue;
        if (dx && dy && (nav[y * c + nx] | nav[ny * c + x]) & mask) continue;
        const g = navG[n] + (dx && dy ? 1.414 : 1) * (1 + (clr[k] === 1 ? 1.4 : clr[k] === 2 ? .35 : 0) + (nav[k] & danger ? 2.5 : 0));
        if (navSeen[k] !== navRun || g < navG[k]) {
          navSeen[k] = navRun; navG[k] = g; navFrom[k] = n;
          const hx = Math.abs(nx - ex), hy = Math.abs(ny - ey);
          push(k, g + hx + hy - .586 * Math.min(hx, hy));
        }
      }
    }
    if (!found) return null;
    const raw = [];
    for (let n = en; n !== -1; n = navFrom[n]) raw.push({ x: n % c * 40 + 20, y: (n / c | 0) * 40 + 20 });
    raw.reverse();
    if (navOpen(m, mask, bx, by)) raw[raw.length - 1] = { x: bx, y: by };
    // String pull forward from each anchor, then round the corners that remain.
    const pts = []; let i = 0;
    while (i < raw.length - 1) {
      let j = i + 1;
      while (j + 1 < raw.length && clearLine(m, mask, raw[i].x, raw[i].y, raw[j + 1].x, raw[j + 1].y)) j++;
      pts.push(raw[j]); i = j;
    }
    if (!pts.length) pts.push(raw[raw.length - 1]);
    return roundCorners(m, mask, pts);
  }

  function roundCorners(m, mask, pts) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], p = pts[i], b = pts[i + 1], u = norm(p.x - a.x, p.y - a.y), v = norm(b.x - p.x, b.y - p.y);
      if (u.x * v.x + u.y * v.y > .92) { out.push(p); continue; }
      const cu = Math.min(46, u.l * .45), cv = Math.min(46, v.l * .45);
      const p1 = { x: p.x - u.x * cu, y: p.y - u.y * cu }, p2 = { x: p.x + v.x * cv, y: p.y + v.y * cv };
      if (clearLine(m, mask, p1.x, p1.y, p2.x, p2.y, 8)) out.push(p1, p2); else out.push(p);
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  // The nearest open point to a goal on the line back to the bot; the goal itself when it is open.
  function openAim(m, mask, ax, ay, gx, gy) {
    const fits = (x, y) => { if (!navOpen(m, mask, x, y)) return false; const g = wallNear(m, x, y, BODY_GAP); return !g; };
    if (fits(gx, gy)) return { x: gx, y: gy };
    const dx = ax - gx, dy = ay - gy, l = Math.hypot(dx, dy), n = Math.ceil(l / 20);
    for (let k = 1; k < n; k++) { const x = gx + dx * k / n, y = gy + dy * k / n; if (fits(x, y)) return { x, y }; }
    return { x: gx, y: gy };
  }
  // The closest wall within reach of a point: its distance and the unit vector from the wall to the point. Null when clear.
  const BODY_GAP = 36;
  function wallNear(m, x, y, reach) {
    const wi = x / 200 | 0, wj = y / 200 | 0, list = wi >= 0 && wj >= 0 && wi < m.wcols ? m.wbucket[wj * m.wcols + wi] : null;
    if (!list) return null;
    let best = null, bd = reach;
    for (const w of list) {
      const cx = clamp(x, w.x, w.x + w.w), cy = clamp(y, w.y, w.y + w.h), dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
      if (d < bd && d > .01) { bd = d; best = { d, nx: dx / d, ny: dy / d }; }
    }
    return best;
  }

  const moveTo = (b, x, y, arrive = 20) => { b.gx = x; b.gy = y; b.ga = arrive; b.hasGoal = true; b.vecT = 0; b.fresh = true; };
  const moveDir = (b, x, y) => { b.hasGoal = false; b.vx = x; b.vy = y; b.vecT = .3; };
  const noMove = b => { b.hasGoal = false; b.vecT = 0; };

  // Finds a walkable heading near (x, y) so a kite or dodge never pushes into a wall.
  function freeDir(s, c, b, x, y) {
    const m = s.map;
    for (const r of [0, .7, -.7, 1.4, -1.4, 2.2, -2.2]) {
      const co = Math.cos(r), si = Math.sin(r), nx = x * co - y * si, ny = x * si + y * co;
      if (navOpen(m, b.mask, c.x + nx * 46, c.y + ny * 46)) return { x: nx, y: ny };
    }
    return null;
  }

  // Runs every tick: follows the path, keeps a gap to allies, respects towers, unsticks.
  function botSteer(s, c, b) {
    if (b.evPlan) stepEvade(s, c, b);
    if (c.stunT > 0 || c.air || c.dash) return;
    if (b.still) { c.mv.x = c.mv.y = 0; return; }
    const m = s.map, every3 = (s.tick + c.id) % 3 === 0;
    let vx = 0, vy = 0, onPath = false;
    if (b.evadeT > 0) {
      b.evadeT -= DT; const f = freeDir(s, c, b, b.ex, b.ey);
      c.mv.x = f ? f.x : 0; c.mv.y = f ? f.y : 0; return;
    }
    // 14.0: a reached spot is held until the goal has really moved on (no stop-start shuffling behind a walking wave).
    const gd = b.hasGoal ? Math.hypot(b.gx - c.x, b.gy - c.y) : 0;
    if (!b.hasGoal || b.vecT > 0) b.held = false;
    else if (b.held && gd > b.ga + 26) b.held = false;
    else if (!b.held && gd <= b.ga) b.held = true;
    let ease = 1;
    if (b.vecT > 0) { b.vecT -= DT; const f = freeDir(s, c, b, b.vx, b.vy); if (f) { vx = f.x; vy = f.y; } }
    else if (b.hasGoal && !b.held) {
      onPath = true;
      // A goal inside a wall or tower is aimed at from its open near edge. Arrival still measures from the real goal.
      const aim = openAim(m, b.mask, c.x, c.y, b.gx, b.gy), gx = aim.x, gy = aim.y;
      if (every3) {
        if (clearLine(m, b.mask, c.x, c.y, gx, gy)) { b.path = null; b.needPath = false; }
        else if (!b.path) b.needPath = true;
      }
      if (b.path && Math.hypot(b.pgx - gx, b.pgy - gy) > 130) b.needPath = true;
      if (b.needPath && s.navLeft > 0) {
        s.navLeft--; b.needPath = false; b.pgx = gx; b.pgy = gy; b.pi = 0;
        b.path = navPath(m, c.team, c.x, c.y, gx, gy);
      }
      let tx = gx, ty = gy;
      if (b.path) {
        const p = b.path;
        while (b.pi < p.length - 1) {
          const w = p[b.pi], nx = p[b.pi + 1];
          if (Math.hypot(w.x - c.x, w.y - c.y) < 34 || (every3 && clearLine(m, b.mask, c.x, c.y, nx.x, nx.y))) b.pi++; else break;
        }
        const w = p[b.pi]; tx = w.x; ty = w.y;
        if (b.pi === p.length - 1 && Math.hypot(w.x - c.x, w.y - c.y) < 34) { b.path = null; tx = gx; ty = gy; }
      }
      // Pushed into a wall's margin with no route yet: step back onto open ground first rather than leaning on the wall.
      if (!b.path && !navOpen(m, b.mask, c.x, c.y)) { const k = navCell(m, b.mask, c.x, c.y); if (k >= 0) { tx = k % m.cols * 40 + 20; ty = (k / m.cols | 0) * 40 + 20; } }
      const n = norm(tx - c.x, ty - c.y); vx = n.x; vy = n.y;
      // The last stretch eases off like a thumb easing on the stick, so following a moving spot settles into its pace.
      if (!b.path && b.ga < 200) ease = clamp((gd - b.ga) / 45 + .38, .38, 1);
    }
    // Keep out of enemy tower range unless two or more of our minions are tanking, or the dive is a sure kill.
    // A tower already shooting this bot (its shots compound) means get out now regardless.
    if (!b.diveOk) for (const t of s.towers) {
      if (!t.alive || t.team === c.team) continue;
      const tanked = t === b.et && b.etTanks >= 1 && t.last !== c.id;
      if (tanked) continue;
      const dx = t.x - c.x, dy = t.y - c.y, d = Math.hypot(dx, dy); if (d > t.range + 36) continue;
      const nx = dx / d, ny = dy / d, inw = vx * nx + vy * ny;
      if (d < t.range - 6) { if (t.last === c.id || inw > -.4 && (vx || vy || b.hasGoal)) { vx = -nx; vy = -ny; onPath = false; } }
      else if (inw > 0) { vx -= nx * inw; vy -= ny * inw; if (Math.hypot(vx, vy) < .15) { vx = vy = 0; onPath = false; } }
    }
    // Stepping over a visible wire is a choice: walk around its end unless a sharper bot has no way past.
    if ((vx || vy) && b.sk.iq > .35) for (const z of s.zones) {
      if (z.kind !== 'tripline' || z.team === c.team) continue;
      const near = segDist(c.x + vx * 70, c.y + vy * 70, z.x1, z.y1, z.x2, z.y2);
      if (near > 44) continue;
      const a = Math.hypot(c.x - z.x1, c.y - z.y1) < Math.hypot(c.x - z.x2, c.y - z.y2) ? { x: z.x1, y: z.y1 } : { x: z.x2, y: z.y2 };
      const n = norm(z.x2 - z.x1, z.y2 - z.y1), out = a.x === z.x1 ? -1 : 1, px = a.x + n.x * out * 54, py = a.y + n.y * out * 54, v = norm(px - c.x, py - c.y);
      if (navOpen(m, b.mask, px, py)) { vx = v.x; vy = v.y; onPath = false; }
      break;
    }
    // Spread out from allies. Dropped if it would push the bot at a wall.
    let sx = 0, sy = 0;
    for (const a of s.champs) {
      if (a === c || a.team !== c.team || !a.alive) continue;
      const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy);
      if (d < 95 && d > .01) { const k = (95 - d) / 95; sx += dx / d * k; sy += dy / d * k; }
    }
    if (sx || sy) {
      const n = norm(vx + sx * .8, vy + sy * .8);
      if (navOpen(m, b.mask, c.x + n.x * 46, c.y + n.y * 46)) {
        if (vx || vy) { vx = n.x; vy = n.y; } else if (sx * sx + sy * sy > .25) { vx = n.x * .45; vy = n.y * .45; }
      }
    }
    // Last word on the heading: never lean on a wall. Slide along it, easing off when touching; a heading with nothing left asks for a route.
    if (vx || vy) {
      const g = wallNear(m, c.x, c.y, c.r + 12), mag = Math.hypot(vx, vy);
      if (g && vx * g.nx + vy * g.ny < 0) {
        const inw = vx * g.nx + vy * g.ny; vx -= g.nx * inw; vy -= g.ny * inw;
        if (g.d < c.r + 4) { vx += g.nx * .3 * mag; vy += g.ny * .3 * mag; }
        const l = Math.hypot(vx, vy);
        if (l > .05) { vx *= mag / l; vy *= mag / l; }
        if (l < .3 && onPath) b.needPath = true;
      }
    }
    // A thumb, not a teleport: the stick turns over a few frames (sharper players snap faster) and lets go at once.
    if (vx || vy) {
      vx *= ease; vy *= ease;
      const k = b.sk.hand, px = c.mv.x, py = c.mv.y;
      if (px || py) { vx = px + (vx - px) * k; vy = py + (vy - py) * k; }
    }
    c.mv.x = vx; c.mv.y = vy;
    // Stuck check: too little ground covered in half a second while trying to walk.
    if ((s.tick + c.id) % 15 === 0) {
      const moved = Math.hypot(c.x - b.sx, c.y - b.sy); b.sx = c.x; b.sy = c.y;
      if (onPath && !c.chan && !c.charge && c.lock <= 0 && moved < 38) {
        if (++b.stuck === 1) { b.needPath = true; b.path = null; }
        else {
          const a = s.rand() * 6.283; b.ex = Math.cos(a); b.ey = Math.sin(a); b.evadeT = .4;
          b.stuck = 0; b.path = null; b.needPath = true;
        }
      } else b.stuck = 0;
    }
  }

  // ---------- bots: shared knowledge ----------
  const LANE_END = 360, LATE_AT = 660; // laning phase, then roaming mid game, then grouped late game
  const hash01 = (a, b) => { let h = Math.imul(a * 73856093 ^ b * 19349663, 0x9E3779B1); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
  const cast = (c, slot, tx, ty) => c.q.push({ t: 'cast', slot, tx, ty });
  const rdy = (c, i) => c.cd[i] <= 0 && (i < 2 || c.lvl >= 3);
  const frac = u => u.hp / u.maxHp;
  const mapCenter = s => s.map.center || { x: W / 2, y: H / 2 };
  const ensureAi = ai => { if (!ai.mem) { ai.mem = {}; ai.cover = {}; ai.phase = 'lane'; ai.hum = {}; ai.split = 0; ai.pings = []; } };
  const roleLane = c => c.role === 'jungle' ? -1 : c.role === 'top' || c.oneLane ? 0 : 1;

  // Distance to, and closest point on, a lane's centre line.
  // ---------- 13.0: acts, Evade, Last Stand, Wanted, combos, duels ----------
  // Everything here reads Sim state defensively, so bots keep working whichever order the Sim pieces land in.
  const B_EVADE_CD = 10;
  // Sim.EVADE = {cd, dist, t, iframe} once it lands: aim the impact at the middle of the invulnerable window.
  const botEvadeInfo = () => (typeof EVADE !== 'undefined' && EVADE) || { cd: B_EVADE_CD, dist: 150, iframe: .25 };
  // The act: Sim's s.act when it has one, else the clock (Laning, City War from 6:00, Final Hour from 12:00).
  const botAct = s => s.act >= 1 ? s.act : s.t < LANE_END ? 1 : s.t < 720 ? 2 : 3;
  // Seconds of Last Stand left for a team (any truthy shape counts as on).
  function botStand(s, team) {
    const v = s.lastStand !== undefined ? s.lastStand : s.stand;
    if (!v) return 0;
    const x = Array.isArray(v) ? v[team] : (v.team === team ? v : 0);
    if (!x) return 0;
    if (typeof x === 'number') return x > 0 && x < 1e8 ? x : 0;
    if (typeof x === 'object') return x.t > 0 ? x.t : x.left > 0 ? x.left : x.on || x.active ? 1 : 0;
    return 1;
  }
  const botWanted = e => !e || !e.wanted ? 0 : typeof e.wanted === 'number' ? Math.max(1, e.wanted) : (e.wanted.bounty || e.wanted.n || 1);
  const botEvadeReady = (s, c, b) => !(c.evadeCd > 0) && !(c.evCd > 0) && s.t >= b.evAt && c.alive && !(c.stunT > 0) && !c.air && !c.dash && !c.leap && !c.cuts && !(c.rootT > 0) && !(c.polyT > 0) && !(c.knockT > 0);
  function botDoEvade(s, c, b, dx, dy, why) {
    const f = freeDir(s, c, b, dx, dy) || (Math.hypot(dx, dy) > .01 ? norm(dx, dy) : null); if (!f) return false;
    c.q.push({ t: 'evade', dx: f.x, dy: f.y });
    // Sim's own cooldown is read when it has one; otherwise the bot keeps its own clock.
    b.evAt = s.t + (c.evadeCd !== undefined || c.evCd !== undefined ? .5 : B_EVADE_CD);
    b.ex = f.x; b.ey = f.y; b.evadeT = .2; b.st13.ev++; b.st13[why] = (b.st13[why] || 0) + 1;
    return true;
  }
  // A nemesis duel in progress between c and e (Sim's spotlight, whichever shape it takes).
  function botDuel(s, c, e) {
    if (!e || c.nem !== e.id) return false;
    if (c.duelWith === e.id || c.rivalId === e.id) return true;
    if (c.duel && (c.duel === e.id || c.duel.id === e.id || c.duel.v === e.id)) return true;
    const D = s.duel || s.duels; if (!D) return false;
    for (const x of Array.isArray(D) ? D : [D]) if (x && ((x.a === c.id && x.b === e.id) || (x.b === c.id && x.a === e.id) || (x.u === c.id && x.v === e.id) || (x.v === c.id && x.u === e.id))) return true;
    return false;
  }
  // An ally's ultimate has just landed on t and the window for a linked finisher is still open.
  function botComboOn(s, c, t) {
    if (!t) return false;
    for (const a of s.champs) if (a !== c && a.team === c.team && a.ultW && s.t < a.ultW.t - .9 && a.ultW.ids.includes(t.id)) return true;
    return false;
  }
  function botComboTarget(s, c, b) {
    for (const a of s.champs) if (a !== c && a.team === c.team && a.ultW && s.t < a.ultW.t - .9) for (const id of a.ultW.ids) { const e = b.foes.find(x => x.id === id); if (e) return e; }
    return null;
  }
  // Big telegraphed things a walk cannot clear in time: plan an Evade for the last moment.
  // A threat is (time to impact, ground still to cover, share of current health it costs, direction out).
  function planEvade(s, c, b) {
    const sk = b.sk;
    if (b.evPlan || !botEvadeReady(s, c, b) || sk.evade < .02 || c.charge || (c.chan && !c.chan.recall)) return;
    const hp = Math.max(1, c.hp + (c.shieldHp || 0)), ms = Math.max(200, c.msBase || 300);
    let best = null;
    const consider = (tti, need, sev, dx, dy, key, big) => {
      if (tti <= 0 || tti > 1.6 || need <= 0) return;
      if (need / ms < tti * .8) return; // a step clears it: save the Evade
      if (sev < sk.evBar * (big ? .5 : 1)) return;
      if (!best || sev > best.sev) best = { tti, dx, dy, key, sev };
    };
    for (const p of s.proj) {
      if (p.team === c.team || p.homing || !p.owner || p.owner.kind !== 'champ' || p.age < sk.react * .4) continue;
      const sp = Math.hypot(p.vx, p.vy) || 1, nx = p.vx / sp, ny = p.vy / sp, rx = c.x - p.x, ry = c.y - p.y, along = rx * nx + ry * ny;
      if (along < -10 || along > sp * 1.2) continue;
      const side = rx * -ny + ry * nx, need = p.w / 2 + c.r + 6 - Math.abs(side); if (need <= 0) continue;
      const sg = side >= 0 ? 1 : -1, ult = p.abil && p.owner.kit && p.owner.kit[2] && p.abil === p.owner.kit[2].name;
      consider(along / sp, need, (p.dmg || 90) / hp + (p.skill ? .12 : 0) + (ult ? .3 : 0), -ny * sg, nx * sg, p.id, ult);
    }
    for (const z of s.zones) {
      if (z.team === c.team || z.total - z.t < sk.react * .5) continue;
      if (z.kind === 'blast') {
        const d = Math.hypot(c.x - z.x, c.y - z.y), need = z.r + c.r + 6 - d; if (need <= 0) continue;
        const boss = z.owner && z.owner.boss, BS = boss ? BOSS_STATS[z.owner.bossKind] : null;
        const ult = !boss && z.owner && z.owner.kit && z.owner.kit[2] && z.abil === z.owner.kit[2].name;
        const sev = boss ? (BS ? BS.slamDmg * (z.owner.phase > 1 ? 1.3 : 1) : 160) / hp + .15 : .28 + (ult ? .4 : 0);
        const n = d > 1 ? norm(c.x - z.x, c.y - z.y) : { x: c.x < z.x ? -1 : 1, y: 0 };
        consider(z.t, need, sev, n.x, n.y, z.id, boss || ult);
      } else if (z.kind === 'fissure') {
        const sd = segDist(c.x, c.y, z.x1, z.y1, z.x2, z.y2), need = z.r + c.r + 6 - sd; if (need <= 0) continue;
        const n = norm(z.x2 - z.x1, z.y2 - z.y1); let x = -n.y, y = n.x; if (x * (c.x - z.x1) + y * (c.y - z.y1) < 0) { x = -x; y = -y; }
        consider(z.t, need, .35, x, y, z.id, false);
      }
    }
    for (const e of b.foes) {
      const ch = e.chan;
      if (ch && ch.kind === 'line' && ch.total - ch.t >= sk.react * .4) {
        const sd = segDist(c.x, c.y, e.x, e.y, e.x + ch.dx * ch.len, e.y + ch.dy * ch.len), need = ch.w / 2 + c.r + 6 - sd; if (need <= 0) continue;
        let x = -ch.dy, y = ch.dx; if (x * (c.x - e.x) + y * (c.y - e.y) < 0) { x = -x; y = -y; }
        const ult = ch.slot === 2; consider(ch.t, need, .35 + (ult ? .4 : 0), x, y, e.id * 7 + 3 + (ch.slot || 0), ult);
      }
    }
    if (!best) return;
    if (hash01(best.key, c.id + 17) > sk.evade) return; // didn't read it
    const flip = hash01(best.key, c.id + 23) < sk.wrongWay * .5 ? -1 : 1;
    const at = s.t + Math.max(0, best.tti - (botEvadeInfo().iframe || .25) * .45 + (hash01(best.key, c.id + 29) - .5) * sk.evLead);
    b.evPlan = { at, dx: best.dx * flip, dy: best.dy * flip, why: 'evDodge', until: s.t + best.tti };
  }
  // Runs every tick so the timing is not at the mercy of the decision rate.
  function stepEvade(s, c, b) {
    const P = b.evPlan; if (!P) return;
    if (s.t > P.until + .05) { b.evPlan = null; return; }
    if (s.t >= P.at) { b.evPlan = null; if (botEvadeReady(s, c, b)) botDoEvade(s, c, b, P.dx, P.dy, P.why); }
  }
  // Evade as an escape: a sharp bot breaks a chase it is losing; a beginner sometimes burns it on nothing.
  function escapeEvade(s, c, b, t) {
    const sk = b.sk;
    if (!t || b.evPlan || !botEvadeReady(s, c, b)) return;
    const d = dist(c, t), f = frac(c);
    if (sk.iq > .45 && f < .3 && d < Math.max(260, (t.range || 150) + 60) && b.threatT > .5 && hash01(c.id, s.t * 2 | 0) < sk.iq) {
      const home = s.fountains[c.team], n = norm(home.x - c.x, home.y - c.y), a = norm(c.x - t.x, c.y - t.y);
      botDoEvade(s, c, b, n.x + a.x, n.y + a.y, 'evEsc');
    }
  }
  function wasteEvade(s, c, b) {
    const sk = b.sk;
    if (sk.waste < .005 || !botEvadeReady(s, c, b) || s.t - (b.hurtAt || -9) > 1 || s.rand() > sk.waste) return;
    const a = s.rand() * 6.283; botDoEvade(s, c, b, Math.cos(a), Math.sin(a), 'evWaste');
  }

  function laneNearest(s, lane, x, y) {
    const L = s.map.lanes[lane] || s.map.lanes[0]; let bd = 1e9, bx = x, by = y; // Brawl has one lane
    for (let i = 0; i + 1 < L.length; i++) {
      const ax = L[i][0], ay = L[i][1], dx = L[i + 1][0] - ax, dy = L[i + 1][1] - ay, l2 = dx * dx + dy * dy || 1;
      const t = clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1), px = ax + dx * t, py = ay + dy * t, d = Math.hypot(x - px, y - py);
      if (d < bd) { bd = d; bx = px; by = py; }
    }
    return { x: bx, y: by, d: bd };
  }
  const laneDist = (s, lane, x, y) => laneNearest(s, lane, x, y).d;

  // Walls block lines, dashes, attacks and casts. Uses the game's own ray test.
  const losClear = (s, ax, ay, bx, by) => hasLOS(ax, ay, bx, by);

  function lead(s, c, b, t, speed, delay = 0) {
    const tt = (speed ? dist(c, t) / speed : 0) + delay, f = b.sk.lead * (.8 + s.rand() * .2);
    const x = t.x + t.vx * tt * f, y = t.y + t.vy * tt * f;
    const a = Math.atan2(y - c.y, x - c.x) + (s.rand() - .5) * b.sk.err * 2, l = Math.hypot(x - c.x, y - c.y);
    return { tx: c.x + Math.cos(a) * l, ty: c.y + Math.sin(a) * l };
  }
  function firstTower(s, team, lane) {
    let best = null;
    for (const t of s.towers) if (t.alive && t.team === team && t.lane === lane && (!best || t.tier < best.tier)) best = t;
    return best || s.towers.find(t => t.team === team && t.sub === 'core');
  }
  function towerOver(s, team, x, y, margin = -20) {
    for (const t of s.towers) if (t.alive && t.team !== team && Math.hypot(x - t.x, y - t.y) < t.range + margin) return t;
    return null;
  }
  function alliesTanking(s, team, t) { let n = 0; for (const m of s.minions) if (m.alive && m.team === team && m.delay <= 0 && dist(m, t) < t.range - 20) n++; return n; }

  function refreshLanes(s) {
    const L = s.laneInfo;
    for (let t = 0; t < 2; t++) for (let l = 0; l < 2; l++) { L[t][l].front = null; L[t][l].best = -1; L[t][l].n = 0; }
    for (const m of s.minions) {
      if (!m.alive || m.delay > 0) continue;
      const i = L[m.team][m.lane], wp = Math.min(m.wp, m.path.length - 1), v = wp * 2000 - Math.hypot(m.path[wp][0] - m.x, m.path[wp][1] - m.y);
      i.n++; if (v > i.best) { i.best = v; i.front = m; }
    }
  }

  // Effective health times damage, square-rooted so a team's power adds up the Lanchester way.
  // A team knows its own cooldowns; enemy cooldowns are assumed up.
  const BURST = { vesper: [190, 0, 260], kade: [124, 0, 185], ione: [82, 165, 345], solenne: [72, 0, 90], sable: [138, 0, 180], gravel: [64, 62, 165], deadbolt: [62, 160, 240], duelist: [220, 0, 150], hex: [100, 0, 240], plague: [120, 170, 0], shiv: [150, 0, 252], ironjaw: [130, 70, 165], voltaic: [120, 90, 190], tidecaller: [80, 60, 170], paragon: [95, 95, 230], mirage: [150, 0, 170], cinder: [110, 80, 280], ravager: [130, 90, 160], cataclysm: [140, 90, 190], puppeteer: [75, 80, 140] };
  // know (14.0): how well the viewer tracks an enemy's cooldowns it has watched go out. 0 assumes everything is up (the old
  // rule, and a beginner's); a sharp player counts a spent ultimate and a burnt Evade.
  function power(u, foe, know = 0) {
    const B = BURST[u.champ], pw = pow(u); let burst = 0;
    for (let i = 0; i < 3; i++) if (i < 2 || u.lvl >= 3) { const up = u.cd[i] <= 1.5 ? 1 : .15, k = foe ? 1 + (up - 1) * know : up; burst += k * B[i] * pw / (u.kit[i].cd || 6); }
    const eh = Math.max(1, u.hp) * (100 + u.armor) / 100; let dps = u.dmgBase * u.as * (u.buffT > 0 ? 1.2 : 1) + burst;
    if (u.stunT > 0) dps *= .6;
    return Math.sqrt(eh * dps);
  }
  function burstOn(c, t) {
    let v = c.dmgBase * 2; const B = BURST[c.champ];
    for (let i = 0; i < 3; i++) if (rdy(c, i)) v += B[i] * pow(c);
    return v * 100 / (100 + t.armor);
  }
  // Who a support looks after. During the laning phase that is simply its bottom laner.
  function carryOf(s, c, ai) {
    const bot = s.champs.find(a => a.team === c.team && a !== c && a.alive && a.role === 'bottom');
    if (ai.phase === 'lane') return bot || null;
    return s.champs.find(a => a.team === c.team && a !== c && !a.bot && a.alive && a.role !== 'support') || bot || s.champs.find(a => a.team === c.team && a !== c && a.alive) || null;
  }
  const CARRY = { vesper: 1, ione: .9, sable: .7, kade: .4, solenne: .3, gravel: 0, deadbolt: 1, hex: .9, shiv: .7, duelist: .4, plague: .3, ironjaw: 0, voltaic: .7, tidecaller: .3, paragon: .4, mirage: 1, cinder: .9, ravager: .4, cataclysm: 0, puppeteer: .3 };

  // Rough tower damage for the next shots at the current time, with compounding.
  const towerShot = (s, stack) => (160 + s.t * .24) * Math.min(4, Math.pow(1.45, stack));

  // Knowledge of enemies no longer in view: confidence fades, and the circle they could be in grows.
  function memThreat(s, c, b, ai, x, y, r) {
    let n = 0;
    for (const e of s.champs) {
      if (e.team === c.team || !e.alive) continue;
      const m = ai.mem[e.id]; if (!m) continue;
      const age = s.t - m.t; if (age < .7) continue; // in view now; counted from sight
      const conf = Math.exp(-age / b.sk.mem); if (conf < .18) continue;
      if (Math.hypot(m.x - x, m.y - y) - e.msBase * age * .45 < r) n += conf;
    }
    return n;
  }

  // Next purchase: three core items, then a legendary, weaving the remaining chains with more legendaries.
  function nextBuy(s, c) {
    const rec = recommended(c.champ, c.build, c.bot ? c.bot.buyPath : 0);
    const chain = id => { const path = itemPath(id); let top = -1; for (let i = path.length - 1; i >= 0; i--) if (c.items.includes(path[i])) { top = i; break; } if (top === path.length - 1) return null; const step = path[top + 1], cost = itemPrice(c, step); return cost === null ? null : { id: step, cost }; };
    const legend = id => { const up = LEGEND[id]; if (!up || c.items.includes(up) || !c.items.includes(id)) return null; const cost = itemPrice(c, up); return cost === null ? null : { id: up, cost }; };
    for (const [fn, i] of [[chain, 0], [chain, 1], [chain, 2], [legend, 0], [chain, 3], [legend, 1], [chain, 4], [legend, 2], [legend, 3], [legend, 4]]) { const n = rec[i] && fn(rec[i]); if (n) return n; }
    return null;
  }

  // ---------- 14.0: converting an advantage ----------
  // A tower is safe to stand under while one of our minions with a shot or two left in it is in its range (it shoots minions
  // before champions who have not hit a champion). Returns that cover, 0 when there is none.
  function towerCover(s, team, t) {
    let n = 0;
    for (const m of s.minions) if (m.alive && m.team === team && !(m.delay > 0) && dist(m, t) < t.range - 15) n += m.hp > m.maxHp * .45 ? 1 : .5;
    return n;
  }
  // Champion damage per second on a structure (basic attacks, tower armour, the champion-on-structure multiplier).
  const towerDps = (s, list) => list.reduce((n, c) => n + c.dmgBase * c.as * (c.buffT > 0 ? 1.2 : 1) * CHAMP_TOWER_K * 100 / 130, 0);
  // Can this group take the tower with nobody tanking but a champion? The tower picks the nearest one and compounds.
  function diveSiegeOk(s, t, group) {
    if (!group.length) return false;
    const ttk = t.hp / Math.max(1, towerDps(s, group)), shots = Math.ceil(ttk / 1.1) + 1;
    let dmg = 0; for (let i = 0; i < shots; i++) dmg += towerShot(s, i) * 100 / (100 + 40);
    const tank = Math.max(...group.map(c => c.hp + (c.shieldHp || 0)));
    return dmg < tank * .8 && ttk < 9;
  }
  // The side's push plan: after a won fight, with enemies dead or a clear lead, everyone healthy groups on the best open
  // structure and takes it with the wave; with the core open, it ends the game. ai.siege = {id, lane, x, y, ids, go, until, why}.
  function planSiege(s, team, ai, mine, foes, foesAlive, laning) {
    const prev = ai.siege; ai.siege = null;
    if (s.raid && s.raid.team === team) return;
    const dead = s.champs.filter(e => e.team !== team && !e.alive), window = dead.length ? Math.min(...dead.map(e => e.respawn)) : 0;
    const total = s.champs.filter(e => e.team !== team).length, edge = mine.length - foesAlive;
    let lvl = 0, n = 0; for (const c of s.champs) { lvl += c.team === team ? c.lvl : -c.lvl; n++; } lvl /= Math.max(1, n / 2);
    const kills = s.kills[team] - s.kills[1 - team];
    // Why push: numbers and time (enemies on their way back), or a lead big enough to force it.
    let why = null;
    if (foesAlive === 0 && mine.length) why = 'ace';
    else if (edge >= 2 && window > 7) why = 'numbers';
    else if (edge >= 1 && window > 11 && !laning) why = 'numbers';
    else if (!laning && edge >= 0 && (lvl >= 1.6 || kills >= 7) && mine.length >= Math.min(3, total)) why = 'lead';
    // Keep a running siege a little longer while the edge holds; drop it when they are back and it is even.
    if (!why && prev && s.t < prev.until && edge >= 0 && mine.length >= 2) why = prev.why;
    if (!why) return;
    // A boss the side can take comes first on a lead (its boon pushes harder than a chip at a tower), and in a numbers window
    // when it is up and nearer than any structure would be.
    const hoardBoss = ai.hoard && s.monsters.find(m => m.bossKind === ai.hoard.kind && m.alive);
    if (ai.hoard && why === 'lead' && !(prev && prev.go)) return;
    // Target: the open structure with the best worth for the time it takes. Structures resist hard early (structureK), so a
    // lead alone chips outer towers and takes the core only once it can fall or when they are down a body; with enemies dead
    // the window decides. Nothing feasible: no siege (bosses, districts and farm turn the lead into more lead instead).
    let cx = 0, cy = 0; for (const c of mine) { cx += c.x; cy += c.y; } cx /= mine.length; cy /= mine.length;
    const K = structureK(s), dps = Math.max(30, towerDps(s, mine) * K * .8), room = why === 'lead' ? 50 : window + 12;
    let best = null, bv = 0;
    for (const t of s.towers) {
      if (!t.alive || t.team === team || !towerOpen(s, t)) continue;
      const core = t.sub === 'core';
      if (core && why === 'lead' && K < 1 && edge < 1) continue;
      if (hoardBoss && dist(hoardBoss, { x: cx, y: cy }) < Math.hypot(t.x - cx, t.y - cy)) continue;
      const lane = t.lane >= 0 ? t.lane : -1, front = lane >= 0 ? s.laneInfo[team][lane].front : null;
      const wave = front && dist(front, t) < 1100 ? 1 : 0, d = Math.hypot(t.x - cx, t.y - cy), ttk = t.hp / dps + d / 380;
      // A lead with every enemy up works with a wave: no wave near it, no siege there yet.
      if (why === 'lead' && !(front && dist(front, t) < 1600) && !(prev && prev.id === t.id && prev.go)) continue;
      if (ttk > room * (prev && prev.id === t.id ? 1.4 : 1)) continue;
      let v = (core ? 3 : 1 + t.tier * .3) / (1 + ttk / 25) + wave * .25 + (prev && prev.id === t.id ? .3 : 0);
      if (laning && !core && t.tier > 0) v *= .5;
      if (v > bv) { bv = v; best = t; }
    }
    if (!best) return;
    // The core can be reached through a fallen inner tower of either lane; walk the open one.
    let lane = best.lane;
    if (best.sub === 'core') { const gone = s.towers.find(o => o.team === best.team && o.sub === 'tower' && o.tier === 1 && !o.alive); lane = gone ? gone.lane : 0; }
    const home = s.fountains[team], nn = norm(home.x - best.x, home.y - best.y), stand = best.range + 70;
    const pool = mine.filter(c => c.bot && frac(c) > (why === 'ace' ? .22 : .32) && !(ai.defend && ai.defend.ids.includes(c.id) && ai.defend.wave === false));
    const ids = pool.map(c => c.id);
    if (!ids.length) return;
    const near = pool.filter(c => dist(c, best) < best.range + 600);
    // A structure a couple of seconds from falling is finished whatever stands around it (the core ends the game).
    const finish = near.length >= 1 && best.hp < towerDps(s, near) * K * (best.sub === 'core' ? 3.5 : 2);
    const cover = towerCover(s, team, best), dive = finish || (foes.every(e => dist(e, best) > 1100) && diveSiegeOk(s, best, near));
    // With every enemy up, a lead siege only goes in together; with bodies down, cover is enough.
    const together = why !== 'lead' || finish || near.length >= Math.min(cover >= 2 ? 2 : 3, pool.length);
    const go = together && (cover >= 1 || dive || (prev && prev.go && prev.id === best.id && near.length >= 2));
    ai.siege = { id: best.id, lane: lane >= 0 ? lane : 0, x: best.x + nn.x * stand, y: best.y + nn.y * stand, ids, go, cover, dive, finish, why, until: prev && prev.id === best.id ? prev.until : s.t + (why === 'lead' ? 40 : Math.max(14, window + 6)) };
    // Say it out loud: the sharpest bot on the side calls the target once (people on the team see the ping too).
    if (!prev || prev.id !== best.id) {
      const caller = pool.slice().sort((a, z) => z.bot.skill - a.bot.skill)[0];
      if (caller && hash01(best.id + (s.t | 0), caller.id) < .3 + .7 * caller.bot.sk.macro) caller.q.push({ t: 'ping', kind: 'attack', x: best.x, y: best.y });
    }
  }
  // Waves walking at our structures (14.0): late on, structures soften and an unanswered wave alone takes a tower or the core.
  // The nearest healthy bot meets the wave out in its lane before it arrives; the core's lane gets two. ai.clear = {botId: lane}.
  function planClear(s, team, ai, mine, foes, laning) {
    ai.clear = {};
    if (laning || (s.raid && s.raid.enemy === team)) return;
    const K = structureK(s);
    for (const lane of s.lanes) {
      const fr = s.laneInfo[1 - team][lane].front, n = s.laneInfo[1 - team][lane].n; if (!fr || n < 2) continue;
      const guard = firstTower(s, team, lane); if (!guard || !guard.alive) continue;
      const d = dist(fr, guard), core = guard.sub === 'core';
      if (d > (core ? 2200 : 1500) * (K > 1 ? 1.3 : 1)) continue;
      if (s.champs.some(a => a.team === team && a.alive && dist(a, fr) < 700)) continue; // someone is on it
      if (foes.filter(e => dist(e, fr) < 900).length >= 2) continue; // their group walks with it: the defend call answers that
      const want = s.raid ? 1 : core || K > 1.5 ? 2 : 1;
      const pool = mine.filter(c => c.bot && frac(c) > .4 && !ai.clear[c.id] && !(ai.siege && ai.siege.go && dist(c, s.towers.find(t => t.id === ai.siege.id) || c) < 900)).sort((a, z) => dist(a, fr) - dist(z, fr));
      for (const c of pool.slice(0, want)) if (dist(c, fr) < 3600 || core) ai.clear[c.id] = lane;
    }
  }
  // Meet an enemy wave out in its lane and wipe it: minions first, abilities on the clump, never under their tower.
  function clearTask(s, c, b, lane) {
    b.task = 'clear';
    const fr = s.laneInfo[1 - c.team][lane].front; if (!fr) { laneTask(s, c, b, lane, s.ai[c.team], true); return; }
    let m = null, md = 1e9;
    for (const x of s.minions) if (x.alive && x.team !== c.team && x.lane === lane && !(x.delay > 0)) { const d = dist(c, x); if (d < md) { md = d; m = x; } }
    m = m || fr;
    const p = towerOver(s, c.team, m.x, m.y, 30) ? openAim(s.map, b.mask, c.x, c.y, m.x, m.y) : m;
    moveTo(b, p.x, p.y, Math.max(40, c.range * .7));
    c.atk = true; c.atkMode = 'minion';
    if (md < c.range + m.r) { c.atkPref = m.id; castPve(s, c, b, m, md); }
  }
  // One bot's part in the siege: gather outside range, clear their wave, stand in with our minions tanking, then hit the structure.
  function siegeTask(s, c, b, ai, S) {
    const t = s.towers.find(x => x.id === S.id); if (!t || !t.alive) return false;
    b.task = 'siege';
    const d = dist(c, t) - t.r, cover = towerCover(s, c.team, t), shot = t.last === c.id;
    const reach = c.range - 6;
    // Under the tower: safe while our minions take the shots, or in a dive the group can afford (not while it is already shooting us).
    const safe = cover >= 1 || (S.dive && !(shot && frac(c) < (S.finish ? .2 : .45)));
    if (safe && S.go) {
      b.diveOk = true;
      if (d > reach) moveTo(b, t.x, t.y, c.range + t.r - 14);
      else noMove(b);
      c.atk = true; c.atkMode = 'tower'; c.atkPref = t.id; c.preferTower = true;
      // An enemy minion that would hit us while we stand there is cleared first (it is what keeps our cover alive).
      return true;
    }
    // Not safe yet: shove the wave toward the tower (laneTask pushes) or wait at the edge for it.
    // A wave on the way is met and walked in (clearing theirs); with none at all, the group holds the edge for the next one.
    const front = s.laneInfo[c.team][S.lane] && s.laneInfo[c.team][S.lane].front;
    if (front) { laneTask(s, c, b, S.lane, ai, true); b.task = 'siege'; return true; }
    moveTo(b, S.x, S.y, 70); c.atk = true;
    return true;
  }

  // ---------- bots: team plan, shared by every bot on a side ----------
  function teamThink(s, team) {
    const ai = s.ai[team]; ensureAi(ai);
    const mine = s.champs.filter(c => c.team === team && c.alive);
    const foes = []; let foesAlive = 0;
    for (const e of s.champs) {
      if (e.team === team || !e.alive) continue;
      foesAlive++;
      if (!e.air && canSee(s, team, e)) { foes.push(e); ai.mem[e.id] = { x: e.x, y: e.y, t: s.t }; }
    }
    // Acts (13.0): Laning, City War, Final Hour. Final Hour can come early when a core opens.
    const act = botAct(s); ai.act = act;
    // Brawl's one street has no laning to protect and its structures soften minutes early: it plays the mid game from 2:30.
    ai.phase = act === 1 && s.t < (s.mode === 'brawl' ? 150 : LANE_END + 120) ? 'lane' : act >= 3 || s.t >= LATE_AT ? 'late' : 'mid';
    ai.stand = botStand(s, team) > 0; ai.foeStand = botStand(s, 1 - team) > 0;
    const laning = ai.phase === 'lane';

    // Which lane each seat holds. A human who has left a lane open gets covered by the jungler only,
    // so a lane is never filled by accident and never by more than one body.
    ai.cover = {};
    if (laning) for (const lane of s.lanes) {
      const seats = s.champs.filter(o => o.team === team && roleLane(o) === lane);
      let held = false;
      for (const o of seats) {
        if (o.bot) { held = held || o.alive; continue; }
        const here = !o.alive || (dist(o, s.fountains[team]) > 620 && laneDist(s, lane, o.x, o.y) < 400);
        if (here) ai.hum[o.id] = s.t;
        if (ai.hum[o.id] === undefined) ai.hum[o.id] = 0;
        if (s.t < 45 || s.t - ai.hum[o.id] < 24) held = true;
      }
      // A dead laner's jungler only comes when its wave is actually threatening the lane's tower.
      const guard = firstTower(s, team, lane);
      if (held || !s.minions.some(m => m.team !== team && m.lane === lane && m.delay <= 0 && dist(m, guard) < guard.range + 500)) continue;
      const jg = mine.find(c => c.bot && c.role === 'jungle' && frac(c) > .4);
      if (jg) ai.cover[jg.id] = lane;
    }

    // Defend the tower that needs it most. During laning only that lane's seats and the jungler answer.
    let call = null, top = 2.4, callWave = false;
    for (const t of s.towers) {
      if (!t.alive || t.team !== team) continue;
      const lost = (ai.thp[t.id] === undefined ? t.hp : ai.thp[t.id]) - t.hp; ai.thp[t.id] = t.hp;
      let champs = 0, wave = 0;
      for (const e of foes) if (dist(e, t) < t.range + 180) champs++;
      for (const m of s.minions) if (m.alive && m.team !== team && dist(m, t) < t.range + 40) wave++;
      let v = (t.sub === 'core' ? 3 : 1 + t.tier * .5) * (champs * 2 + (lost > 0 ? 1.5 : 0));
      // A wave chewing on a tower is urgent: minions alone can take a tower, and a core late on.
      if (wave >= 3 && !champs) v = Math.max(v, (lost > 0 ? 4.5 : 2.6) + (t.sub === 'core' ? 3 : t.tier));
      if (v > top) { top = v; call = t; callWave = !champs; }
    }
    ai.defend = null;
    // Last Stand: the whole side holds the overcharged core while it lasts.
    if (ai.stand) { const core = s.towers.find(t => t.team === team && t.sub === 'core' && t.alive); if (core) { call = core; callWave = false; } }
    if (call) {
      let pool = mine.filter(c => c.bot && frac(c) > .4);
      if (laning && call.sub !== 'core') pool = pool.filter(c => c.role === 'jungle' || roleLane(c) === call.lane);
      const need = ai.stand ? 4 : callWave ? (call.sub === 'core' ? 2 : 1) : call.sub === 'core' ? 4 : 2, ids = pool.sort((a, b) => dist(a, call) - dist(b, call)).slice(0, need).map(c => c.id);
      const n = norm(s.fountains[team].x - call.x, s.fountains[team].y - call.y);
      if (ids.length) ai.defend = { id: call.id, x: call.x + n.x * 110, y: call.y + n.y * 110, ids, wave: callWave, lane: call.lane };
    }

    // Bosses: never during laning. Take the one that is up or nearly due, most valuable first.
    {
      const prevHoard = ai.hoard;
      let pick = null, bv = 0;
      const R = s.rampage;
      if (!laning) for (const B of s.bosses) {
        if (R && B.kind === 'colossus' && R.team !== team) continue; // it is shelling them: leave it be (a steal still happens if they try it)
        const due = B.up ? 1 : B.at - s.t < 14 ? .7 : 0; if (!due) continue;
        let d = 0; for (const c of mine) d += dist(c, B); d = mine.length ? d / mine.length : 1e9;
        const v = due * (B.kind === 'colossus' ? 2.5 : 1) * (prevHoard && prevHoard.kind === B.kind ? 1.35 : 1) * (R && B.kind === 'colossus' ? 3 : 1) / (1 + d / 2000);
        if (v > bv) { bv = v; pick = B; }
      }
      if (!pick) { ai.hoard = null; ai.hoardGo = false; }
      else {
        const B = pick, boss = B.up ? s.monsters.find(m => m.id === B.id && m.alive) : null, home = s.fountains[team], n = norm(home.x - B.x, home.y - B.y);
        let minePow = 0, foePow = 0, close = 0;
        for (const c of mine) minePow += power(c);
        for (const e of foes) if (dist(e, B) < 1380) foePow += power(e, true, .5);
        const size = B.kind === 'colossus' ? 4 : 3, needAlive = B.kind === 'colossus' ? Math.min(3, s.champs.filter(c => c.team === team).length) : 2;
        const enough = mine.length >= needAlive || foesAlive <= 1;
        // Raid: the Colossus is the win condition, so a wave at the core does not call the side off it (one bot clears).
        const raidBoss = s.raid && s.raid.team === team && B.kind === 'colossus';
        if (enough && foePow < minePow * .95 && (!(call && call.sub === 'core') || raidBoss)) {
          const pool = mine.filter(c => c.bot && frac(c) > (raidBoss ? .3 : .4) && (raidBoss || !(ai.defend && ai.defend.ids.includes(c.id)))).sort((a, z) => dist(a, B) - dist(z, B)).slice(0, size), ids = pool.map(c => c.id);
          for (const c of pool) if (dist(c, B) < 940) close++;
          ai.hoard = { kind: B.kind, x: B.x + n.x * Math.min(560, B.r + 300), y: B.y + n.y * Math.min(560, B.r + 300) + (team ? 40 : -40), ids };
          if (prevHoard && prevHoard.kind === B.kind && ai.hoardGo) ai.hoardGo = true;
          else ai.hoardGo = !!boss && (raidBoss || close >= Math.min(needAlive, ids.length)) && ids.length > 0;
        } else { ai.hoard = null; ai.hoardGo = false; }
      }
    }

    planSiege(s, team, ai, mine, foes, foesAlive, laning);
    planClear(s, team, ai, mine, foes, laning);

    // Pick one enemy for the side to pile on: close to several allies, hurt, or already stunned.
    let focus = null, fv = 0;
    for (const e of foes) {
      let n = 0; for (const a of mine) if (dist(a, e) < a.range + 300) n++;
      if (!n) continue;
      const v = n * .9 + (s.champs.some(a => a.team === team && a.alive && a.nem === e.id) ? .2 : 0) + (1 - frac(e)) * 1.5 + (e.stunT > 0 ? .5 : 0) + CARRY[e.champ] * .25 + botWanted(e) * .25 - (towerOver(s, team, e.x, e.y) ? 1.5 : 0);
      if (v > fv) { fv = v; focus = e; }
    }
    ai.focus = focus ? focus.id : 0;
    // Answer an ally who is being beaten on, people first. In laning only the jungler rotates.
    ai.help = {};
    const helpers = mine.filter(c => c.bot && !c.bot.low && frac(c) > .4 && !(ai.defend && ai.defend.ids.includes(c.id)) && (!laning || c.role === 'jungle'));
    const hurtAllies = mine.filter(a => Object.keys(a.assist).some(id => s.t - a.assist[id] < 2.6 && s.champs.some(e => e.id === +id && e.alive))).sort((a, b) => (a.bot ? 1 : 0) - (b.bot ? 1 : 0));
    for (const a of hurtAllies) {
      const person = !a.bot, reach = person ? 1500 : 1000, want = person ? 2 : 1, near = helpers.filter(c => c !== a && dist(c, a) < 520).length;
      if (near >= want) continue;
      let need = want - near;
      for (const c of helpers.slice().sort((x, y) => dist(x, a) - dist(y, a))) {
        if (need <= 0 || c === a || dist(c, a) > reach || ai.help[c.id]) continue;
        if (foes.filter(e => dist(e, a) < 900).length > mine.filter(x => dist(x, a) < 900).length + 2) continue; // not into a lost cause
        ai.help[c.id] = a; need--;
      }
    }
    // Sites: answer an enemy capture first, then roam to open ones. Laners hold their lanes while laning.
    ai.sites = {};
    const open = s.sites.filter(z => z.alive && !towerOver(s, team, z.x, z.y, 0)), taken = new Set();
    const free = mine.filter(c => c.bot && !c.bot.low && frac(c) > .45 && !ai.help[c.id] && (!laning || c.role === 'jungle'));
    const count = (list, z) => { let n = 0; for (const u of list) if (dist(u, z) < 450) n++; return n; };
    for (const z of open) {
      if (z.prog[1 - team] < .3) continue;
      let best = null, bd = 1100;
      for (const c of free) if (!ai.sites[c.id] && dist(c, z) < bd) { bd = dist(c, z); best = c; }
      if (best) { ai.sites[best.id] = z; taken.add(z.id); }
    }
    for (const role of ['support', 'top', 'bottom']) for (const c of free) {
      if (c.role !== role || ai.sites[c.id]) continue;
      const laner = role === 'top' || role === 'bottom';
      if (laner && foes.some(e => dist(e, c) < 700)) continue;
      if (role === 'support') { const carry = carryOf(s, c, ai); if (carry && foes.some(e => dist(e, carry) < 650)) continue; }
      let reach = role === 'support' ? 750 : 420;
      if (ai.push !== null) reach = Math.min(reach, 600);
      let best = null, bd = reach;
      for (const z of open) if (!taken.has(z.id) && dist(c, z) < bd && count(foes, z) <= count(mine, z)) { bd = dist(c, z); best = z; }
      if (best) { ai.sites[c.id] = best; taken.add(best.id); }
    }
    // Districts: answer an attack on ours first, then take what is open by worth over distance.
    // While laning only the jungler plays for them, so the lanes keep their seats.
    ai.dist = {};
    const ds = s.districts.filter(d => !d.home);
    if (ds.length) {
      const WORTH = { bank: 1.2, power: 1.1, hospital: 1, armory: 1, subway: 1, comms: .8 };
      const pool = mine.filter(c => c.bot && !c.bot.low && frac(c) > .45 && !ai.help[c.id] && !(ai.defend && ai.defend.ids.includes(c.id)) && (!laning || c.role === 'jungle'));
      const near = (list, d) => { let n = 0; for (const u of list) if (dist(u, d) < d.r + 200) n++; return n; };
      for (const d of ds) {
        if (d.owner !== team || !(d.by === 1 - team && d.prog > 0 || foes.some(e => dist(e, d) < d.r))) continue;
        let best = null, bd = 1800;
        for (const c of pool) if (!ai.dist[c.id] && dist(c, d) < bd) { bd = dist(c, d); best = c; }
        if (best) ai.dist[best.id] = { d, def: true };
      }
      for (const role of ['jungle', 'support', 'top', 'bottom']) for (const c of pool) {
        if (c.role !== role || ai.dist[c.id]) continue;
        const reach = role === 'jungle' ? 3000 : ai.push !== null ? 500 : 1000;
        if (role !== 'jungle' && foes.some(e => dist(e, c) < 800)) continue;
        let best = null, bv = 0;
        for (const d of ds) {
          if (d.owner === team || d.contested && role !== 'jungle' || dist(c, d) > reach || towerOver(s, team, d.x, d.y, 0)) continue;
          if (Object.values(ai.dist).some(x => x.d === d) && role !== 'jungle') continue;
          if (near(foes, d) > near(mine, d)) continue;
          // Vision (14.0): owned districts are the map's wards. A support with game sense prizes Comms, and anyone the district
          // that lights the next boss before it spawns.
          const sight = (d.kind === 'comms' && role === 'support' ? 1 + .6 * c.bot.sk.macro : 1) * (ai.hoard && !ai.hoardGo && Math.hypot(d.x - ai.hoard.x, d.y - ai.hoard.y) < 1300 ? 1 + .5 * c.bot.sk.macro : 1);
          const v = sight * (WORTH[d.kind] || 1) * (dist(c, d) < d.r ? 1.6 : 1) * (d.owner === 1 - team ? 1.15 : 1) / (1 + dist(c, d) / 1100);
          if (v > bv) { bv = v; best = d; }
        }
        if (best) ai.dist[c.id] = { d: best, def: false };
      }
      // Blackout: spend it when it covers a boss, a push or a fight in the open.
      if (!laning && blackoutReady(s, team) && (ai.hoardGo || ai.push !== null || foes.some(e => mine.some(c => dist(c, e) < 900)))) { const u = mine.find(c => c.bot); if (u) u.q.push({ t: 'blackout' }); }
    }

    // Map events: a squad contests the spot; laning sends only the roamers.
    ai.ev = {};
    const E = s.event;
    if (E && (E.phase === 'live' || E.t < 8)) {
      const want = laning ? 1 : ai.phase === 'late' ? 3 : 2;
      const pool = mine.filter(c => c.bot && !c.bot.low && frac(c) > .4 && !(ai.defend && ai.defend.ids.includes(c.id)) && !(ai.hoard && ai.hoard.ids.includes(c.id)) && (!laning || c.role === 'jungle' || c.role === 'support')).sort((a, z) => dist(a, E) - dist(z, E));
      for (const c of pool.slice(0, want)) ai.ev[c.id] = E;
    }
    // Later the side groups and pushes one lane, leaving a strong top laner to split the other.
    ai.split = 0;
    const late = ai.phase === 'late', ahead = s.t >= 500 && (s.kills[team] - s.kills[1 - team] >= 6 || foesAlive <= mine.length - 3 || s.champs.some(c => c.team === team && c.buffT > 0));
    if (!s.raid && !laning && mine.length >= foesAlive - 1 && (late || ahead)) {
      if (s.t >= ai.pushUntil || ai.push === null) {
        const left = [0, 1].map(l => s.towers.filter(t => t.alive && t.team !== team && t.lane === l).length);
        const adv = [0, 1].map(l => s.laneInfo[team][l].best);
        ai.push = s.oneLane ? 0 : left[0] !== left[1] ? (left[0] < left[1] ? 0 : 1) : (adv[0] >= adv[1] ? 0 : 1);
        ai.pushUntil = s.t + 35;
      }
      // Final Hour rampage on the other side: push the lane whose front structure the Colossus is shelling.
      if (s.rampage && s.rampage.team !== team && !s.oneLane) { const tw = s.towers.filter(t => t.alive && t.team === s.rampage.team && t.lane !== undefined && towerOpen(s, t)).sort((a, z) => a.tier - z.tier)[0]; if (tw && (tw.lane === 0 || tw.lane === 1)) ai.push = tw.lane; }
      const top = mine.find(c => c.bot && c.role === 'top' && frac(c) > .6);
      if (top && mine.length >= foesAlive && !(s.catchup[team] > .35)) ai.split = top.id;
    } else ai.push = null;
  }

  // ---------- bots: abilities, one short script per champion ----------
  function lineBlocked(s, c, b, x, y, w) {
    if (!losClear(s, c.x, c.y, x, y)) return true;
    if (b.sk.iq < .4) return false;
    for (const m of s.minions) if (m.alive && m.team !== c.team && segDist(m.x, m.y, c.x, c.y, x, y) < m.r + w / 2) return true;
    return false;
  }
  function awayPoint(s, c, t, reach) {
    const home = s.fountains[c.team];
    let n = t ? norm(c.x - t.x, c.y - t.y) : norm(home.x - c.x, home.y - c.y);
    if (!navOpen(s.map, navMask(c.team), c.x + n.x * reach, c.y + n.y * reach)) n = norm(home.x - c.x, home.y - c.y);
    return { x: c.x + n.x * reach, y: c.y + n.y * reach };
  }
  const shotAt = (u, p) => {
    const sp = Math.hypot(p.vx, p.vy) || 1, nx = p.vx / sp, ny = p.vy / sp, rx = u.x - p.x, ry = u.y - p.y, along = rx * nx + ry * ny;
    return along > -20 && along < sp * .7 && Math.abs(rx * -ny + ry * nx) < p.w / 2 + u.r + 10;
  };
  function threatenedAlly(s, c, b) {
    for (const a of s.champs) {
      if (!a.alive || a.team !== c.team || dist(a, c) > 460) continue;
      for (const p of s.proj) if (!p.homing && p.team !== c.team && shotAt(a, p)) return a;
      for (const e of b.foes) if (e.chan && e.chan.kind === 'line' && segDist(a.x, a.y, e.x, e.y, e.x + e.chan.dx * e.chan.len, e.y + e.chan.dy * e.chan.len) < e.chan.w / 2 + a.r + 10) return a;
      if (b.sk.iq > .5 && frac(a) < .5) for (const e of b.foes) if (dist(e, a) < 380) return a;
    }
    return null;
  }
  // An ultimate is worth casting for a kill, a group, or a real fight; a beginner just throws it.
  function ultWorth(s, c, b, t) {
    if (!t) return false;
    // Team combo (13.0): an ally's ult on this target in the last moment makes ours a linked finisher.
    if (botComboOn(s, c, t) && hash01(t.id + (s.t * 2 | 0), c.id + 61) < .25 + .75 * b.sk.combo) return true;
    if (b.sk.iq < .3) return s.rand() < .5;
    let near = 0; for (const e of b.foes) if (dist(e, t) < 290) near++;
    return t.hp <= burstOn(c, t) || near >= 2 || (b.ratio > .9 && frac(t) < .7 && (b.sk.iq > .5 || s.rand() < .6));
  }

  const COMBO = {
    vesper(s, c, b, t, d, mode) {
      if (!t) return false;
      if (rdy(c, 1) && (mode === 'retreat' || d < 210)) { const a = awayPoint(s, c, t, c.kit[1].range); cast(c, 1, a.x, a.y); return true; }
      if (mode === 'fight' && rdy(c, 2) && d < c.kit[2].range - 30 && losClear(s, c.x, c.y, t.x, t.y)) {
        // Deadeye is the longest, slowest wind-up. Save it for a stunned, slowed or dying target.
        const pinned = t.stunT > 0 || t.slowT > 0 || Math.hypot(t.vx, t.vy) < 200 || t.chan || t.charge;
        if ((pinned || b.sk.iq < .5) && (ultWorth(s, c, b, t) || frac(t) < .5)) { const p = lead(s, c, b, t, 2600, .7); cast(c, 2, p.tx, p.ty); return true; }
      }
      const A = c.kit[0];
      if (mode !== 'retreat' && rdy(c, 0) && d < A.range - 20 && !lineBlocked(s, c, b, t.x, t.y, 34)) {
        c.q.push({ t: 'charge', slot: 0 });
        // Full charge when nothing is close. A beginner lets go at odd moments.
        const full = A.charge * 1.02;
        b.chargeHold = b.sk.iq < .4 ? full * (.3 + s.rand() * .7) : (c.f.skirmisher ? full : (b.closest > 360 && frac(c) > .4 ? full : full * .45));
        return true;
      }
      return false;
    },
    kade(s, c, b, t, d, mode) {
      if (rdy(c, 1) && b.parry) { cast(c, 1, c.x, c.y); return true; }
      if (!t) return false;
      if (c.recast[0] > 0) {
        if (mode === 'retreat') { const a = awayPoint(s, c, t, 195); cast(c, 0, a.x, a.y); return true; }
        if (mode === 'fight' && d < c.kit[0].range) { cast(c, 0, t.x, t.y); return true; }
        return false;
      }
      if (mode === 'retreat') { if (rdy(c, 0) && d < 310) { const a = awayPoint(s, c, t, c.kit[0].range); cast(c, 0, a.x, a.y); return true; } return false; }
      if (mode !== 'fight') return false;
      if (rdy(c, 2) && d > 150 && d < c.kit[2].range && b.ratio >= .9 && ultWorth(s, c, b, t)) { const p = lead(s, c, b, t, 1100); cast(c, 2, p.tx, p.ty); return true; }
      if (rdy(c, 0) && d < c.kit[0].range + 10 && losClear(s, c.x, c.y, t.x, t.y)) { cast(c, 0, t.x, t.y); return true; }
      return false;
    },
    ione(s, c, b, t, d, mode) {
      if (!t || mode === 'retreat') return false;
      const A1 = c.kit[1], A0 = c.kit[0];
      if (mode === 'fight' && rdy(c, 2) && d < c.kit[2].range - 20 && losClear(s, c.x, c.y, t.x, t.y) && (ultWorth(s, c, b, t) || t.stunT > 0)) { cast(c, 2, t.x, t.y); return true; }
      if (t.markT > 0 && rdy(c, 1) && d < A1.range - 20 && losClear(s, c.x, c.y, t.x, t.y)) { const p = lead(s, c, b, t, 0, A1.delay); cast(c, 1, p.tx, p.ty); return true; }
      if (rdy(c, 0) && d < A0.range - 30 && (A0.passThrough || !lineBlocked(s, c, b, t.x, t.y, 42))) { const p = lead(s, c, b, t, A0.speed); cast(c, 0, p.tx, p.ty); return true; }
      // Without a mark coming, Rupture is only worth it on a stunned or careless target.
      if (rdy(c, 1) && d < A1.range - 20 && losClear(s, c.x, c.y, t.x, t.y) && (b.sk.iq < .5 ? s.rand() < .5 : c.cd[0] > 1.5 && (mode === 'fight' || t.stunT > 0 || c.f.meteor))) { const p = lead(s, c, b, t, 0, A1.delay); cast(c, 1, p.tx, p.ty); return true; }
      return false;
    },
    solenne(s, c, b, t, d, mode) {
      if (rdy(c, 1)) { const a = threatenedAlly(s, c, b); if (a && (b.sk.iq > .4 || s.rand() < .3)) { cast(c, 1, a.x, a.y); return true; } }
      if (rdy(c, 2)) {
        let n = 0; for (const a of s.champs) if (a.alive && a.team === c.team && dist(a, c) < c.kit[2].r - 20 && (frac(a) < .55 || a.stunT > 0)) n++;
        if (n >= 1 && b.closest < 700 && (b.sk.iq > .3 || s.rand() < .5)) { cast(c, 2, c.x, c.y); return true; }
      }
      if (rdy(c, 0)) {
        let ally = null, low = .82;
        for (const a of s.champs) if (a !== c && a.alive && a.team === c.team && dist(a, c) < c.kit[0].range - 20 && frac(a) < low && losClear(s, c.x, c.y, a.x, a.y)) { low = frac(a); ally = a; }
        if (ally && !b.foes.some(e => segDist(e.x, e.y, c.x, c.y, ally.x, ally.y) < e.r + 30)) { const p = lead(s, c, b, ally, 1150); cast(c, 0, p.tx, p.ty); return true; }
        if (t && mode !== 'retreat' && d < c.kit[0].range - 20 && !lineBlocked(s, c, b, t.x, t.y, 46)) { const p = lead(s, c, b, t, 1150); cast(c, 0, p.tx, p.ty); return true; }
      }
      return false;
    },
    sable(s, c, b, t, d, mode) {
      if (!t) return false;
      if (rdy(c, 2) && d < c.kit[2].range - 10) {
        const exec = (125 * pow(c) + (t.maxHp - t.hp) * .35) * 100 / (100 + t.armor);
        if (b.sk.iq < .5 ? frac(t) < .45 : t.hp <= exec) { cast(c, 2, t.x, t.y); return true; }
      }
      if (c.recast[1] > 0) { if (mode === 'retreat' || frac(c) < .45 || d > 400) { cast(c, 1, c.x, c.y); return true; } }
      else if (rdy(c, 1)) {
        if (mode === 'retreat') { const a = awayPoint(s, c, t, c.kit[1].range); cast(c, 1, a.x, a.y); return true; }
        // Blink always travels full range, so this lands behind the target.
        if (mode === 'fight' && d > 130 && d < c.kit[1].range - 15) { cast(c, 1, t.x, t.y); return true; }
      }
      if (mode !== 'retreat' && rdy(c, 0) && d < c.kit[0].range - 15 && losClear(s, c.x, c.y, t.x, t.y)) { cast(c, 0, t.x, t.y); return true; }
      return false;
    },
    deadbolt(s, c, b, t, d, mode) {
      if (!t) return false;
      if (mode === 'fight' && rdy(c, 2) && d < c.kit[2].range - 40 && (ultWorth(s, c, b, t) || t.slowT > 0 || t.rootT > 0)) { cast(c, 2, t.x + t.vx * .4, t.y + t.vy * .4); return true; }
      if (mode === 'retreat') { if (rdy(c, 0) && d < c.kit[0].range) { const n = norm(t.x - c.x, t.y - c.y); cast(c, 0, c.x + n.x * 110, c.y + n.y * 110); return true; } return false; }
      if (rdy(c, 0) && d < c.kit[0].range - 10 && losClear(s, c.x, c.y, t.x, t.y) && (c.f.trapper || mode === 'fight' || b.ratio >= 1)) {
        // Lay it across their path, ahead of where they are walking.
        const sp = Math.hypot(t.vx, t.vy), n = norm(t.x - c.x, t.y - c.y), ahead = sp > 80 ? .55 : .25;
        const x = t.x + t.vx * ahead - n.x * 50, y = t.y + t.vy * ahead - n.y * 50;
        if (sp > 30 || d < c.kit[0].range * .8) { cast(c, 0, x, y); return true; }
      }
      if (rdy(c, 1) && d < c.kit[1].range - 20) {
        const clear = !lineBlocked(s, c, b, t.x, t.y, 36), bounceOff = c.kit[1].bounces > 0 && s.minions.some(m => m.alive && m.team !== c.team && dist(m, t) < 340 && segDist(m.x, m.y, c.x, c.y, t.x, t.y) < 60);
        if ((clear || bounceOff) && (mode === 'fight' || b.ratio >= 1)) { const p = lead(s, c, b, t, 1500); cast(c, 1, p.tx, p.ty); return true; }
      }
      return false;
    },
    duelist(s, c, b, t, d, mode) {
      if (c.recast[0] > 0 && t && d < c.kit[0].reach1 + 30) { cast(c, 0, c.x, c.y); return true; }
      if (!t) return false;
      if (rdy(c, 1) && (mode === 'retreat' && d < 350 || (b.parry && frac(c) < .6))) { const a = awayPoint(s, c, t, c.kit[1].range); cast(c, 1, a.x, a.y); return true; }
      if (mode !== 'fight') return false;
      if (rdy(c, 2) && d < c.kit[2].range + 20 && losClear(s, c.x, c.y, t.x, t.y) && (b.ratio >= 1 || (c.f.honorbound && b.ratio >= .9)) && ultWorth(s, c, b, t)) { cast(c, 2, t.x, t.y); return true; }
      // A decoy away, and strike from the dark.
      if (rdy(c, 1) && (c.f.masquerade || b.sk.iq > .5) && d > 140 && d < c.kit[1].range && (s.t < (b.feintUntil || 0) || b.ratio >= 1.2)) { b.feintUntil = s.t + 6; const a = awayPoint(s, c, t, c.kit[1].range * .85); cast(c, 1, a.x, a.y); return true; }
      if (c.stealthT > 0 && d < 130 && rdy(c, 0)) { cast(c, 0, c.x, c.y); return true; }
      if (rdy(c, 0) && d < c.kit[0].reach0 && losClear(s, c.x, c.y, t.x, t.y)) { cast(c, 0, c.x, c.y); return true; }
      return false;
    },
    hex(s, c, b, t, d, mode) {
      if (!t) return false;
      const A2 = c.kit[2], A1 = c.kit[1];
      if (rdy(c, 1) && d < A1.range - 30 && !lineBlocked(s, c, b, t.x, t.y, A1.w)) {
        // Polymorph first on whoever is diving, casting or fleeing; a sharper bot waits for it to matter.
        const rushing = d < 260 && b.ratio < 1.3, caster = t.chan || t.charge || t.dash;
        if (rushing || caster || (mode === 'fight' && (c.f.transmuter || frac(t) < .55) && b.sk.iq >= .3)) { const p = lead(s, c, b, t, 1250); cast(c, 1, p.tx, p.ty); return true; }
      }
      if (mode === 'fight' && rdy(c, 2) && d < A2.range + 80 && losClear(s, c.x, c.y, t.x, t.y)) {
        let near = 0, curses = t.curseN || 0; for (const e of b.foes) if (dist(e, t) < A2.r) { near++; curses += e.curseN || 0; }
        if (near >= 2 || curses >= 3 || ultWorth(s, c, b, t) || t.stunT > 0) { const p = lead(s, c, b, t, 0, A2.dur * .5); cast(c, 2, p.tx, p.ty); return true; }
      }
      if (rdy(c, 0) && d < c.kit[0].range - 30 && !lineBlocked(s, c, b, t.x, t.y, 40) && (mode !== 'retreat' || d < 400)) { const p = lead(s, c, b, t, 1100); cast(c, 0, p.tx, p.ty); return true; }
      return false;
    },
    plague(s, c, b, t, d, mode) {
      const A0 = c.kit[0], A1 = c.kit[1], A2 = c.kit[2];
      if (!t) return false;
      if (rdy(c, 2) && d < A2.range + 100 && losClear(s, c.x, c.y, t.x, t.y) && mode === 'fight') {
        let n = 0; for (const e of b.foes) if (dist(e, t) < A2.r * .9) n++;
        const healing = b.foes.some(e => e.champ === 'solenne') || s.champs.some(a => a.team !== c.team && a.alive && a.champ === 'plague');
        if (n >= 2 || (ultWorth(s, c, b, t) && (healing || frac(t) < .6))) { cast(c, 2, t.x, t.y); return true; }
      }
      if (rdy(c, 1) && d < A1.range + 30 && losClear(s, c.x, c.y, t.x, t.y)) {
        const al = c.f.bloodletter ? (frac(c) < .85 ? c : null) : lowestAlly(s, c, 640, true), needs = al ? frac(al) < .8 : false, offensive = mode === 'fight' || (mode === 'poke' && b.ratio >= 1);
        if (needs ? offensive || mode === 'poke' : (offensive && (b.sk.iq < .5 || frac(t) < .75))) { cast(c, 1, t.x, t.y); return true; }
      }
      if (rdy(c, 0) && d < A0.range + 30 && losClear(s, c.x, c.y, t.x, t.y) && (mode !== 'retreat' || d < 260)) {
        if (mode === 'retreat') { cast(c, 0, c.x, c.y); return true; }
        const p = lead(s, c, b, t, 0, .6); cast(c, 0, p.tx, p.ty); return true;
      }
      return false;
    },
    shiv(s, c, b, t, d, mode) {
      if (!t) return false;
      const A0 = c.kit[0];
      if (mode === 'retreat') {
        if (rdy(c, 1)) { cast(c, 1, c.x, c.y); return true; }
        if (rdy(c, 0) && d < 360 && c.rootT <= 0) { const a = awayPoint(s, c, t, A0.range); cast(c, 0, a.x, a.y); return true; }
        return false;
      }
      if (rdy(c, 2) && d < c.kit[2].range + 30) {
        const A = c.kit[2], burst = A.strikes * A.dmg * pow(c) * 100 / (100 + t.armor);
        if (t.hp <= burst * 1.1 || (mode === 'fight' && b.ratio >= 1 && ultWorth(s, c, b, t))) { cast(c, 2, t.x, t.y); return true; }
      }
      // In the dark: walk in and let the basic attack do the crit. A sharper bot holds its Shank for after.
      if (c.stealthT > 0) return false;
      if (mode === 'fight' && rdy(c, 1) && d > 240 && d < 700 && b.sk.iq > .3 && (b.ratio >= 1 || c.f.nightblade)) { cast(c, 1, c.x, c.y); return true; }
      if (rdy(c, 0) && d < A0.range + 40 && c.rootT <= 0 && losClear(s, c.x, c.y, t.x, t.y) && (mode === 'fight' || (mode === 'poke' && d < 190 && b.ratio >= 1))) { const n = norm(t.x - c.x, t.y - c.y); cast(c, 0, t.x + n.x * 60, t.y + n.y * 60); return true; }
      return false;
    },
    ironjaw(s, c, b, t, d, mode) {
      if (!t) return false;
      const A1 = c.kit[1];
      if (rdy(c, 1) && d < A1.range + 30 && losClear(s, c.x, c.y, t.x, t.y) && (mode !== 'poke' || b.ratio >= 1)) { cast(c, 1, t.x, t.y); return true; }
      if (mode === 'retreat') { if (rdy(c, 0) && d < 230) { cast(c, 0, c.x, c.y); return true; } return false; }
      if (rdy(c, 0) && d < c.kit[0].orbit + 80 && (mode === 'fight' || b.ratio >= 1)) { cast(c, 0, c.x, c.y); return true; }
      if (mode === 'fight' && rdy(c, 2) && d < c.kit[2].range - 40 && b.ratio >= .9 && losClear(s, c.x, c.y, t.x, t.y)) {
        const n = norm(t.x - c.x, t.y - c.y); let line = 0;
        for (const e of b.foes) if (segDist(e.x, e.y, c.x, c.y, c.x + n.x * c.kit[2].range, c.y + n.y * c.kit[2].range) < 90) line++;
        if (line >= 2 || ultWorth(s, c, b, t) || t.stunT > 0) { const p = lead(s, c, b, t, 0, c.kit[2].delay); cast(c, 2, p.tx, p.ty); return true; }
      }
      return false;
    },
    gravel(s, c, b, t, d, mode) {
      if (!t) return false;
      if (rdy(c, 1) && d < c.kit[1].r + 5) { cast(c, 1, c.x, c.y); return true; }
      if (mode === 'retreat') return false;
      if (c.f.warden && rdy(c, 0)) { for (const a of s.champs) if (a !== c && a.alive && a.team === c.team && frac(a) < .4 && dist(a, c) > 170 && dist(a, c) < c.kit[0].range - 40 && losClear(s, c.x, c.y, a.x, a.y) && b.foes.some(e => dist(e, a) < 360) && (b.sk.iq > .35 || s.rand() < .3)) { cast(c, 0, a.x, a.y); return true; } }
      if (rdy(c, 0) && d > 130 && d < c.kit[0].range - 30 && !lineBlocked(s, c, b, t.x, t.y, 50) && (mode === 'fight' || b.ratio >= 1)) { const p = lead(s, c, b, t, 1050); cast(c, 0, p.tx, p.ty); return true; }
      if (mode === 'fight' && rdy(c, 2) && d < c.kit[2].range - 40 && b.ratio >= .9 && losClear(s, c.x, c.y, t.x, t.y) && ultWorth(s, c, b, t)) { const p = lead(s, c, b, t, 1000); cast(c, 2, p.tx, p.ty); return true; }
      return false;
    },
    voltaic(s, c, b, t, d, mode) {
      if (!t) return false;
      const A0 = c.kit[0], A2 = c.kit[2];
      if (mode === 'retreat') { if (rdy(c, 0) && c.rootT <= 0) { const a = awayPoint(s, c, t, A0.range); cast(c, 0, a.x, a.y); return true; } return false; }
      if (mode === 'fight' && rdy(c, 2) && d < A2.range - 40 && losClear(s, c.x, c.y, t.x, t.y) && (ultWorth(s, c, b, t) || t.stunT > 0)) { const p = lead(s, c, b, t, 1900, A2.delay); cast(c, 2, p.tx, p.ty); return true; }
      if (mode === 'fight' && rdy(c, 1) && d < 280) { cast(c, 1, c.x, c.y); return true; }
      if (rdy(c, 0) && d < A0.range + 20 && c.rootT <= 0 && losClear(s, c.x, c.y, t.x, t.y) && (mode === 'fight' || b.ratio >= 1)) { const n = norm(t.x - c.x, t.y - c.y); cast(c, 0, t.x + n.x * 60, t.y + n.y * 60); return true; }
      return false;
    },
    tidecaller(s, c, b, t, d, mode) {
      const A0 = c.kit[0], A1 = c.kit[1], A2 = c.kit[2];
      if (rdy(c, 1)) { const a = threatenedAlly(s, c, b); if (a && dist(a, c) < A1.range && (b.sk.iq > .4 || s.rand() < .3)) { cast(c, 1, a.x, a.y); return true; } }
      if (rdy(c, 2)) { let n = 0; for (const a of s.champs) if (a.alive && a.team === c.team && dist(a, c) < 420 && frac(a) < .6) n++; if ((n >= 1 && b.closest < 620) || (t && mode === 'fight' && ultWorth(s, c, b, t) && d < A2.range - 80)) { const x = t || c; cast(c, 2, x.x, x.y); return true; } }
      if (rdy(c, 0)) { let ally = null, low = .85; for (const a of s.champs) if (a !== c && a.alive && a.team === c.team && dist(a, c) < A0.range - 20 && frac(a) < low && losClear(s, c.x, c.y, a.x, a.y)) { low = frac(a); ally = a; } if (ally) { const p = lead(s, c, b, ally, 1050); cast(c, 0, p.tx, p.ty); return true; } if (t && mode !== 'retreat' && d < A0.range - 20 && losClear(s, c.x, c.y, t.x, t.y)) { const p = lead(s, c, b, t, 1050); cast(c, 0, p.tx, p.ty); return true; } }
      if (t && rdy(c, 1) && d < A1.range && losClear(s, c.x, c.y, t.x, t.y) && (mode === 'fight' || (mode === 'retreat' && d < 260))) { cast(c, 1, t.x, t.y); return true; }
      return false;
    },
    paragon(s, c, b, t, d, mode) {
      if (!t) return false;
      const A0 = c.kit[0], A1 = c.kit[1], A2 = c.kit[2];
      if (mode === 'retreat') { if (rdy(c, 0)) { const a = awayPoint(s, c, t, A0.range); cast(c, 0, a.x, a.y); return true; } return false; }
      if (mode === 'fight' && rdy(c, 2) && d < A2.range - 60 && b.ratio >= .9 && (ultWorth(s, c, b, t) || t.stunT > 0)) { const p = lead(s, c, b, t, 0, 1.05); cast(c, 2, p.tx, p.ty); return true; }
      if (mode === 'fight' && rdy(c, 0) && d > 150 && d < A0.range + 30) { const p = lead(s, c, b, t, 0, .4); cast(c, 0, p.tx, p.ty); return true; }
      if (rdy(c, 1) && d < A1.range && losClear(s, c.x, c.y, t.x, t.y) && (mode === 'fight' || b.ratio >= 1)) { cast(c, 1, t.x, t.y); return true; }
      return false;
    },
    mirage(s, c, b, t, d, mode) {
      if (!t) return false;
      const A0 = c.kit[0], A1 = c.kit[1], A2 = c.kit[2];
      if (rdy(c, 1) && (mode === 'retreat' || d < 200)) { const a = awayPoint(s, c, t, A1.range); cast(c, 1, a.x, a.y); return true; }
      if (mode === 'fight' && rdy(c, 2) && d < A2.range - 30 && losClear(s, c.x, c.y, t.x, t.y) && (ultWorth(s, c, b, t) || t.slowT > 0 || t.stunT > 0)) { cast(c, 2, t.x + t.vx * .3, t.y + t.vy * .3); return true; }
      if (mode !== 'retreat' && rdy(c, 0) && d < A0.range - 20 && !lineBlocked(s, c, b, t.x, t.y, 34)) { const p = lead(s, c, b, t, 1500); cast(c, 0, p.tx, p.ty); return true; }
      return false;
    },
    cinder(s, c, b, t, d, mode) {
      if (!t) return false;
      const A0 = c.kit[0], A1 = c.kit[1], A2 = c.kit[2];
      if (mode === 'retreat') { if (rdy(c, 1) && d < 340) { cast(c, 1, c.x, c.y); return true; } return false; }
      if (mode === 'fight' && rdy(c, 2) && d < A2.range + 60 && losClear(s, c.x, c.y, t.x, t.y)) { let near = 0; for (const e of b.foes) if (dist(e, t) < A2.r) near++; if (near >= 2 || ultWorth(s, c, b, t) || t.stunT > 0 || t.rootT > 0) { const p = lead(s, c, b, t, 0, A2.delay); cast(c, 2, p.tx, p.ty); return true; } }
      if (rdy(c, 0) && d < A0.range - 30 && !lineBlocked(s, c, b, t.x, t.y, 40)) { const p = lead(s, c, b, t, 1150); cast(c, 0, p.tx, p.ty); return true; }
      if (rdy(c, 1) && d < A1.range + 40 && losClear(s, c.x, c.y, t.x, t.y) && (mode === 'fight' || b.ratio >= 1)) { const p = lead(s, c, b, t, 0, .5); cast(c, 1, p.tx, p.ty); return true; }
      return false;
    },
    ravager(s, c, b, t, d, mode) {
      if (!t) return false;
      const A0 = c.kit[0], A1 = c.kit[1];
      if (mode === 'retreat') { if (rdy(c, 1)) { const a = awayPoint(s, c, t, A1.range); cast(c, 1, a.x, a.y); return true; } return false; }
      if (mode === 'fight' && rdy(c, 2) && d < 320 && (b.ratio >= 1 || ultWorth(s, c, b, t))) { cast(c, 2, c.x, c.y); return true; }
      if (mode === 'fight' && rdy(c, 1) && d > 150 && d < A1.range + 30) { cast(c, 1, t.x, t.y); return true; }
      if (rdy(c, 0) && d < A0.range && losClear(s, c.x, c.y, t.x, t.y) && (mode === 'fight' || b.ratio >= 1)) { cast(c, 0, t.x, t.y); return true; }
      return false;
    },
    cataclysm(s, c, b, t, d, mode) {
      if (!t) return false;
      const A0 = c.kit[0], A2 = c.kit[2];
      if (rdy(c, 1) && b.closest < 260 && (mode === 'retreat' || mode === 'fight')) { cast(c, 1, c.x, c.y); return true; }
      if (mode === 'retreat') return false;
      if (mode === 'fight' && rdy(c, 2) && d < A2.range - 40 && b.ratio >= .9 && losClear(s, c.x, c.y, t.x, t.y)) { const n = norm(t.x - c.x, t.y - c.y); let line = 0; for (const e of b.foes) if (segDist(e.x, e.y, c.x, c.y, c.x + n.x * A2.range, c.y + n.y * A2.range) < 95) line++; if (line >= 2 || ultWorth(s, c, b, t) || t.stunT > 0) { const p = lead(s, c, b, t, 0, A2.delay); cast(c, 2, p.tx, p.ty); return true; } }
      if (rdy(c, 0) && d < A0.range && losClear(s, c.x, c.y, t.x, t.y) && (mode === 'fight' || b.ratio >= 1)) { const p = lead(s, c, b, t, 0, A0.delay); cast(c, 0, p.tx, p.ty); return true; }
      return false;
    },
    puppeteer(s, c, b, t, d, mode) {
      if (!t) return false;
      const A0 = c.kit[0], A1 = c.kit[1], A2 = c.kit[2];
      if (rdy(c, 2) && d < A2.range + 20 && losClear(s, c.x, c.y, t.x, t.y) && (mode === 'retreat' ? d < 300 : mode === 'fight' && (ultWorth(s, c, b, t) || frac(t) < .55))) { cast(c, 2, t.x, t.y); return true; }
      if (rdy(c, 0) && d < A0.range - 20 && !lineBlocked(s, c, b, t.x, t.y, 40) && (mode !== 'poke' || b.ratio >= 1)) { const p = lead(s, c, b, t, 1250); cast(c, 0, p.tx, p.ty); return true; }
      if (rdy(c, 1) && d < A1.range + 180 && mode !== 'retreat') { const n = norm(t.x - c.x, t.y - c.y), l = Math.min(A1.range - 20, Math.max(60, d - 120)); cast(c, 1, c.x + n.x * l, c.y + n.y * l); return true; }
      return false;
    },
  };
  function useCombo(s, c, b, t, mode) {
    if (c.charge || c.chan || (s.t < b.castAt && !b.parry && !(c.recast[0] > 0 || c.recast[1] > 0))) return;
    if (COMBO[c.champ](s, c, b, t, t ? dist(c, t) : 1e9, mode)) {
      b.castAt = s.t + b.sk.gap * (.7 + s.rand() * .6);
      const q = c.q[c.q.length - 1]; if (q && q.slot === 2 && botComboOn(s, c, t)) b.st13.combo++;
    }
  }
  const PVE = { vesper: [0], kade: [0], ione: [1, 0], solenne: [], sable: [0], gravel: [1], deadbolt: [1], duelist: [0], hex: [0], plague: [0], shiv: [0], ironjaw: [0, 1], voltaic: [0], tidecaller: [], paragon: [1], mirage: [0], cinder: [0, 1], ravager: [0], cataclysm: [0], puppeteer: [1] };
  function castPve(s, c, b, m, d) {
    if (c.charge || c.chan || s.t < b.castAt) return;
    for (const i of PVE[c.champ]) {
      const a = c.kit[i]; if (!rdy(c, i) || (a.range ? d > a.range - 30 : d > (a.r || 200))) continue;
      cast(c, i, m.x, m.y); b.castAt = s.t + b.sk.gap + .4; return;
    }
  }

  function handleCharge(s, c, b, t, d) {
    const A = c.kit[c.charge.slot];
    if (!t || d > A.range + 30) { c.q.push({ t: 'cancel' }); return; }
    const p = lead(s, c, b, t, 1600); c.q.push({ t: 'aim', tx: p.tx, ty: p.ty });
    const ct = c.charge.t, reach = A.minRange + (A.range - A.minRange) * clamp(ct / A.charge, 0, 1), hurry = b.closest < 300 || b.low;
    if ((ct >= b.chargeHold || hurry) && reach >= d - 20 && losClear(s, c.x, c.y, p.tx, p.ty)) cast(c, c.charge.slot, p.tx, p.ty);
    else if (ct >= A.charge * 1.5) c.q.push({ t: 'cancel' });
  }

  // ---------- bots: senses ----------
  // Dodging uses only what a player can see: a shot's line, a blast ring, a wind-up. Each shot gets
  // one roll, a reaction delay, and a sidestep away from the line. A beginner often doesn't react
  // and sometimes steps the wrong way.
  function senseThreats(s, c, b) {
    const sk = b.sk; let soon = 9, ex = 0, ey = 0, id = 0, dur = 0;
    const note = (tti, x, y, key, walk) => { if (tti < soon) soon = tti; if (x || y) { ex = x; ey = y; id = key; dur = walk || 0; } };
    for (const p of s.proj) {
      if (p.team === c.team) continue;
      if (p.homing) { if (p.target === c && p.owner.kind === 'champ') note(dist(p, c) / p.speed, 0, 0, 0); continue; }
      if (p.age < sk.react * .5) continue;
      const sp = Math.hypot(p.vx, p.vy) || 1, nx = p.vx / sp, ny = p.vy / sp, rx = c.x - p.x, ry = c.y - p.y, along = rx * nx + ry * ny;
      if (along < -30 || along > 520) continue;
      const side = rx * -ny + ry * nx;
      if (Math.abs(side) < p.w / 2 + c.r + 18) { const sg = side >= 0 ? 1 : -1; note(along / sp, -ny * sg, nx * sg, p.id); }
    }
    for (const z of s.zones) {
      if (z.team === c.team || z.total - z.t < sk.react * .6) continue;
      if (z.kind === 'blast') { const d = Math.hypot(c.x - z.x, c.y - z.y); if (d < z.r + c.r + 12) { const n = norm(c.x - z.x, c.y - z.y); note(z.t, n.x, n.y, z.id, clamp((z.r + c.r + 16 - d) / Math.max(200, c.msBase || 300) + .06, .24, 1.1)); } }
      else if (z.kind === 'fissure') { if (segDist(c.x, c.y, z.x1, z.y1, z.x2, z.y2) < z.r + c.r + 14) { const n = norm(z.x2 - z.x1, z.y2 - z.y1); let x = -n.y, y = n.x; if (x * (c.x - z.x1) + y * (c.y - z.y1) < 0) { x = -x; y = -y; } note(z.t, x, y, z.id); } }
      else if (z.kind === 'coven' || z.kind === 'lockdown' || z.kind === 'miasma' || z.kind === 'quarantine') {
        if (Math.hypot(c.x - z.x, c.y - z.y) < z.r + c.r - 10 && (z.kind !== 'miasma' || !b.fighting || sk.iq > .7)) { const n = norm(c.x - z.x, c.y - z.y); note(z.t, n.x * (n.l < 1 ? 1 : 1), n.y, z.id + (s.t | 0) * 100000); }
      }
    }
    for (const e of b.foes) {
      const ch = e.chan;
      if (ch && ch.kind === 'line' && ch.total - ch.t >= sk.react * .5) {
        const sd = segDist(c.x, c.y, e.x, e.y, e.x + ch.dx * ch.len, e.y + ch.dy * ch.len);
        if (sd < ch.w / 2 + c.r + 16) { let x = -ch.dy, y = ch.dx; if (x * (c.x - e.x) + y * (c.y - e.y) < 0) { x = -x; y = -y; } note(ch.t, x, y, e.id * 7 + (s.t | 0)); }
      }
      if (e.charge && e.charge.t > .7 && sk.iq > .6 && dist(c, e) < 640) {
        const sd = segDist(c.x, c.y, e.x, e.y, e.x + e.charge.dx * 640, e.y + e.charge.dy * 640);
        if (sd < 34 + c.r) { let x = -e.charge.dy, y = e.charge.dx; if (x * (c.x - e.x) + y * (c.y - e.y) < 0) { x = -x; y = -y; } note(.4, x, y, e.id * 11 + (s.t | 0)); }
      }
      if (KITS[e.champ].melee && e.atkCd < .15 && dist(e, c) < e.range + c.r + 6 && sk.iq > .5) note(.15, 0, 0, 0);
    }
    b.threatT = soon;
    if (id && id !== b.dodgeSeen) {
      b.dodgeSeen = id;
      if (hash01(id, c.id) < sk.dodge) {
        const flip = hash01(id, c.id + 5) < sk.wrongWay ? -1 : 1;
        b.pendEx = ex * flip; b.pendEy = ey * flip; b.pendT = s.t + sk.react * (.5 + s.rand() * .8); b.pendDur = dur;
      }
    }
    if (b.pendT && s.t >= b.pendT) { b.pendT = 0; if (b.evadeT <= 0) { b.ex = b.pendEx; b.ey = b.pendEy; b.evadeT = b.pendDur ? b.pendDur * (.85 + .3 * sk.iq) : .24 + s.rand() * .22; } }
    b.parry = soon < .3 && (sk.iq > .4 || s.rand() < .25);
    planEvade(s, c, b);
  }

  function pickTarget(s, c, b, ai) {
    const sk = b.sk, carry = c.role === 'support' ? carryOf(s, c, ai) : null, front = b.cls === 'front';
    let best = null, bv = -1e9;
    for (const e of b.foes) {
      const d = dist(c, e); if (d > sk.see) continue;
      const kill = e.hp <= burstOn(c, e);
      let v = (front ? 1.8 : 1.4) * (1 - d / 1000) + sk.iq * ((1 - frac(e)) * 1.1 + CARRY[e.champ] * (b.cls === 'flank' ? 1.2 : .5) + (kill ? 1.2 : 0));
      if (e.id === b.tid) v += .35;
      if (e.bounty > 0) v += sk.iq * Math.min(.5, e.bounty / 1200); // a shutdown pays
      if (e.id === ai.focus) v += .25 + sk.focus * .9; // focus fire: the top levels all hit the same body
      if (e.id === c.nem) v += .2 + sk.iq * .25 + (botDuel(s, c, e) ? .9 : 0); // the rivalry pays Marks, and a duel pays gold
      if (e.wanted) v += sk.iq * .3 * botWanted(e); // a growing bounty
      if (sk.combo > .2 && botComboOn(s, c, e)) v += .5 + sk.combo * .6; // an ally's ult just landed here
      if (carry && sk.iq > .4 && dist(e, carry) < 380) v += .8;
      if (sk.iq > .4 && !kill) { const tw = towerOver(s, c.team, e.x, e.y); if (tw && alliesTanking(s, c.team, tw) < 2) v -= 1.2; }
      if (sk.iq > .3 && !losClear(s, c.x, c.y, e.x, e.y)) v -= .4;
      if (v > bv) { bv = v; best = e; }
    }
    return best;
  }

  function assess(s, c, b, ai) {
    let mine = power(c), theirs = 0, foeN = 0;
    for (const a of s.champs) if (a !== c && a.alive && a.team === c.team && dist(a, c) < 850) mine += power(a);
    for (const e of b.foes) if (dist(e, c) < 1000) { theirs += power(e, true, b.sk.track) * (e.evCd > 0 ? 1 - .08 * b.sk.track : 1); foeN++; }
    // Enemies last seen nearby still count, at the confidence the bot's memory allows.
    const mem = memThreat(s, c, b, ai, c.x, c.y, 900);
    if (mem > .1 && foeN) theirs += mem * (theirs / foeN) * .7;
    // Being under a friendly tower is worth a lot; under an enemy one worse still unless the wave is tanking.
    for (const t of s.towers) if (t.alive && dist(c, t) < t.range) { if (t.team === c.team) mine *= 1.3; else theirs = (theirs || power(c) * .6) * (t === b.et && b.etTanks >= 1 ? 1.15 : 1.8); }
    let fn = 0, on = 0; for (const m of s.minions) if (m.alive && dist(m, c) < 420) { if (m.team === c.team) on++; else fn++; }
    const waveK = clamp(1 + (on - fn) * .05, .75, 1.25);
    return mine * waveK * b.sk.aggr * (1 + b.noise * b.sk.judge) / Math.max(theirs, .01);
  }

  function findLastHit(s, c, b) {
    const sk = b.sk, hit = c.dmgBase * (c.buffT > 0 ? 1.2 : 1) * 100 / 110, melee = KITS[c.champ].melee;
    let best = null, bh = 1e9; b.lhSoon = false;
    for (const m of s.minions) {
      if (!m.alive || m.team === c.team || m.delay > 0 || m.hp > hit * 2.6) continue;
      const d = dist(c, m) - m.r; if (d > c.range + 200) continue;
      b.lhSoon = true;
      const tt = Math.max(0, c.atkCd) + (melee ? 0 : Math.max(0, d) / 1100); let inc = 0;
      for (const p of s.proj) if (p.homing && p.target === m && dist(p, m) / p.speed <= tt + .05) inc += p.dmg * 100 / 110;
      // Allied melee minions already swinging at it land before a slow shot would.
      if (tt > .4) for (const a of s.minions) if (a.alive && a.team === c.team && !a.ranged && a.cd < tt && dist(a, m) - m.r < a.range) inc += a.dmg * 100 / 110;
      const left = m.hp - inc;
      if (left <= 0 || left > hit * (1 + sk.lhErr * (hash01(m.id, c.id) * 2 - 1)) || hash01(m.id, c.id + 991) > sk.lh) continue;
      if (left < bh) { bh = left; best = m; }
    }
    return best;
  }

  // ---------- bots: jobs ----------
  function fightMove(s, c, b, t, d, ai) {
    const k = KITS[c.champ], iq = b.sk.iq, cls = b.cls;
    // Peel: a support stays close to the carry and never out in front of it.
    if (cls === 'peel') {
      const carry = carryOf(s, c, ai);
      if (carry && dist(carry, c) > 420) { const n = norm(s.fountains[c.team].x - carry.x, s.fountains[c.team].y - carry.y); moveTo(b, carry.x + n.x * 120, carry.y + n.y * 120, 40); return; }
    }
    if (k.melee) {
      if (cls === 'flank' && iq > .45 && d > 260 && d < 800) {
        // Come in from the side or behind, where Rend hits hardest.
        const bx = t.x - (t.fx || 0) * 150, by = t.y - (t.fy || 0) * 150;
        moveTo(b, bx + -(t.fy || 0) * b.strafe * 90, by + (t.fx || 0) * b.strafe * 90, 50); return;
      }
      if (d > k.pref) moveTo(b, t.x + t.vx * .12, t.y + t.vy * .12, k.pref * .7);
      else if (iq > .6) { const n = norm(t.x - c.x, t.y - c.y); moveDir(b, -n.y * b.strafe, n.x * b.strafe); }
      else noMove(b);
      return;
    }
    // Walls block attacks, so a ranged bot with no line of sight must walk until it has one.
    if (d < c.range + t.r && !losClear(s, c.x, c.y, t.x, t.y)) { moveTo(b, t.x, t.y, Math.max(40, k.pref * .6)); return; }
    // Ranged: stay at the edge of range, beyond the target's reach when possible.
    const edge = Math.max(c.range + t.r - 30, (t.range || 0) + 45);
    // Attack cancel (13.0): moving ends the follow-through, so between shots a sharp bot is always stepping:
    // away from anything that can reach it, sideways otherwise. A beginner plants its feet.
    if (c.atkCd > .14 && !(c.lock > 0) && d <= c.range + t.r + 10 && hash01(c.id + 7, s.t * 3 | 0) < b.sk.kite) {
      const n = norm(c.x - t.x, c.y - t.y), reach = KITS[t.champ] && KITS[t.champ].melee || d < (t.range || 0) + 110;
      if (reach) moveDir(b, n.x, n.y); else moveDir(b, -n.y * b.strafe * .9 + n.x * .3, n.x * b.strafe * .9 + n.y * .3);
      b.st13.kiteSteps++; return;
    }
    if (d > c.range + t.r - 15) moveTo(b, t.x, t.y, k.pref);
    else if (d < Math.min(edge, k.pref * .72) || (c.atkCd > .25 && d < t.range + 80)) { const n = norm(c.x - t.x, c.y - t.y); moveDir(b, n.x, n.y); }
    else if (iq > .4) { const n = norm(t.x - c.x, t.y - c.y); moveDir(b, -n.y * b.strafe, n.x * b.strafe); }
    else noMove(b);
  }

  // Where this bot should stand on a lane: behind its own wave, or by its tower when there is none.
  function laneTask(s, c, b, lane, ai, pushing) {
    const k = KITS[c.champ], info = s.laneInfo[c.team][lane], front = info.front, foeFront = s.laneInfo[1 - c.team][lane].front, own = firstTower(s, c.team, lane);
    const wob = Math.sin(c.slot * 2.1), center = mapCenter(s);
    let x, y;
    if (front) {
      const p = front.path, wp = Math.min(front.wp, p.length - 1), prev = p[Math.max(0, wp - 1)], n = norm(prev[0] - front.x, prev[1] - front.y);
      const back = k.melee ? 60 : clamp(c.range * .55, 80, 260);
      x = front.x + n.x * back - n.y * wob * 46; y = front.y + n.y * back + n.x * wob * 46;
    } else if (pushing) {
      const et = firstTower(s, 1 - c.team, lane), n = norm(c.x - et.x, c.y - et.y), n2 = norm(s.fountains[c.team].x - et.x, s.fountains[c.team].y - et.y);
      x = et.x + n2.x * (et.range + 90); y = et.y + n2.y * (et.range + 90);
    } else { const n = norm(center.x - own.x, center.y - own.y); x = own.x + n.x * 130; y = own.y + n.y * 130 + (lane ? -40 : 40); }
    // Never let the standing spot drift off the lane or inside an enemy tower it can't tank.
    const near = laneNearest(s, lane, x, y);
    if (near.d > 200) { const n = norm(x - near.x, y - near.y); x = near.x + n.x * 200; y = near.y + n.y * 200; }
    const tw = towerOver(s, c.team, x, y, 34);
    if (tw && alliesTanking(s, c.team, tw) < 2) { const n = norm(x - tw.x, y - tw.y); x = tw.x + n.x * (tw.range + 50); y = tw.y + n.y * (tw.range + 50); }
    // The support stays with its carry, a little behind.
    const carry = c.role === 'support' ? carryOf(s, c, ai) : null, withCarry = carry && dist(carry, s.fountains[c.team]) > 700;
    if (withCarry) { const n = norm(s.fountains[c.team].x - carry.x, s.fountains[c.team].y - carry.y); x = carry.x + n.x * 130 - n.y * 60; y = carry.y + n.y * 130 + n.x * 60; }
    const lh = withCarry && dist(carry, c) < 800 ? null : findLastHit(s, c, b);
    let dest = { x, y, a: 26 };
    const t = b.et;
    if (t && b.etTanks >= 1 && towerOpen(s, t)) b.siegeT = s.t + .8; // a wave stepping in and out of range must not flip the plan
    const siege = t && s.t < b.siegeT && towerOpen(s, t);
    const underTw = towerOver(s, c.team, c.x, c.y, 10);
    // Wave plan: shove when told to or when the lane is free; otherwise last-hit and let the wave hold.
    const free = b.closest > 1100;
    const shove = pushing || free || (foeFront && dist(foeFront, own) < own.range + 260) || frac(c) < b.sk.low + .2;
    if (lh && dist(c, lh) - lh.r <= c.range) { c.atk = true; c.atkMode = 'minion'; c.atkPref = lh.id; }
    else if (lh && !carry && !underTw && !towerOver(s, c.team, lh.x, lh.y, 10)) dest = { x: lh.x, y: lh.y, a: c.range + lh.r - 30 };
    else if (siege && dist(c, t) - t.r < c.range + 200) {
      if (dist(c, t) - t.r <= c.range - 4) { c.atk = true; c.atkMode = 'tower'; c.atkPref = t.id; c.preferTower = true; }
      else dest = { x: t.x, y: t.y, a: c.range + t.r - 24 };
    } else if (shove) {
      // Hit the wave, but never a champion from inside tower range: that brings the tower down on us.
      let near = null, nd = c.range + 15;
      for (const m of s.minions) if (m.alive && m.team !== c.team && m.delay <= 0) { const d = dist(c, m) - m.r; if (d < nd) { nd = d; near = m; } }
      if (near) { c.atk = true; c.atkMode = 'minion'; c.atkPref = near.id; } else if (!underTw) c.atk = true;
    } else if (b.lhSoon) c.atk = false;
    else {
      const tgt = b.foes.find(e => e.id === b.tid);
      if (tgt && dist(c, tgt) - tgt.r < c.range && !underTw) {
        let n = 0; for (const m of s.minions) if (m.alive && m.team !== c.team && dist(m, c) < 380) n++;
        if (n <= 2) { c.atk = true; c.atkPref = tgt.id; }
      }
    }
    moveTo(b, dest.x, dest.y, dest.a);
  }

  // A gank is earned: only after a full jungle route, and only on a target worth it.
  function pickGank(s, c, b, ai) {
    if (b.gank) {
      const e = b.foes.find(x => x.id === b.gank.id);
      if (e && s.t < b.gank.until && !towerOver(s, c.team, e.x, e.y)) return e;
      b.gank = null; b.gankCd = s.t + 8;
    }
    if (!b.gankReady || s.t < b.gankCd || frac(c) < .6 || c.lvl < 2) return null;
    let best = null, bv = .4;
    for (const e of b.foes) {
      if ((dist(e, c) > 2100 && !rideFor(s, c, e.x, e.y)) || towerOver(s, c.team, e.x, e.y)) continue;
      const deep = c.team ? e.x > W * .52 : e.x < W * .48, hurt = frac(e), mate = s.champs.some(a => a !== c && a.alive && a.team === c.team && dist(a, e) < 700);
      let v = (deep ? .9 : 0) + (hurt < .7 ? .5 : 0) + (hurt < .4 ? .6 : 0) + (mate ? .55 : 0) + (e.id === c.nem ? .25 : 0) + botWanted(e) * .2;
      if (!deep && hurt > .55 && !mate) v -= .8;
      if (memThreat(s, c, b, ai, e.x, e.y, 700) > 1.6) v -= .5;
      v *= .55 + b.sk.iq * .45;
      if (v > bv) { bv = v; best = e; }
    }
    if (best) { b.gank = { id: best.id, until: s.t + 14 }; b.gankReady = false; b.gankCamps = 0; b.gankN = (b.gankN || 0) + 1; }
    return best;
  }

  // Own camps in order: one half of the map, then the other.
  function jungleRoute(s, c, b) {
    const own = s.camps.filter(k => k.side === c.team);
    const upper = own.filter(k => k.y < H / 2), lower = own.filter(k => k.y >= H / 2), firstUp = hash01(c.id + (c.team * 37), 11) < .5;
    const byBig = (a, z) => (a.big ? 1 : 0) - (z.big ? 1 : 0);
    const route = [...(firstUp ? upper : lower).sort(byBig), ...(firstUp ? lower : upper).sort((a, z) => byBig(z, a))];
    b.route = route; b.routeI = 0;
  }

  // The jungler's standing priorities: gank a vulnerable lane, take or defend a district, clear camps, invade.
  // There is always a next thing to do, so it never stands waiting; two or three camps earn a gank.
  function jungleTask(s, c, b, ai) {
    // A map without camps (a single-lane Brawl): the jungler is a fourth body on the lane, a little behind the others.
    if (!s.camps.length) { b.task = 'lane'; laneTask(s, c, b, s.lanes[0] || 0, ai, false); return; }
    b.task = 'jungle';
    if (b.onCamp !== undefined && b.onCamp >= 0 && !s.camps[b.onCamp].alive) {
      b.onCamp = -1; b.campsDone = (b.campsDone || 0) + 1; b.campsTotal = (b.campsTotal || 0) + 1; b.gankCamps = (b.gankCamps || 0) + 1;
      if (b.gankCamps >= 2 + (hash01(c.id, (b.gankN || 0) + 5) < .5 ? 0 : 1)) b.gankReady = true;
    }
    const g = pickGank(s, c, b, ai);
    if (g) { b.task = 'gank'; moveTo(b, g.x, g.y, 60); c.atk = true; return; }
    if (!b.route) jungleRoute(s, c, b);
    const ownUp = b.route.some(k => k.alive || k.at - s.t < 5), dd = ai.dist && ai.dist[c.id];
    // The rhythm: a few camps, a gank if one is on, then a district. Camps never starve while a district is open.
    if (b.distOn !== undefined && b.distOn >= 0) { const k = s.districts.find(d => d.id === b.distOn); if (!k || k.owner === c.team) { b.campsDone = 0; b.distOn = -1; } }
    if (dd && (dd.def || (b.campsDone || 0) >= 2 || !ownUp)) { if (!dd.def) b.distOn = dd.d.id; districtTask(s, c, b, dd.d); return; }
    // Camps: the current one on the route, or the nearest of ours that is up.
    let camp = null;
    for (let i = 0; i < b.route.length; i++) {
      const k = b.route[b.routeI];
      if (k.alive || k.at - s.t < 5) { camp = k; break; }
      b.routeI++; if (b.routeI >= b.route.length) { b.routeI = 0; b.cycles++; }
    }
    if (!camp) {
      // Nothing of ours is up. Invade a free enemy camp after the first clears, else take a district, else go work a lane.
      let enemy = null, bc = 1e9;
      if ((b.campsTotal || 0) >= 2 || ai.phase !== 'lane') for (const k of s.camps) {
        if (!k.alive || k.side === c.team) continue;
        if (memThreat(s, c, b, ai, k.x, k.y, 700) > .7 || b.foes.some(e => dist(e, k) < 900) || towerOver(s, c.team, k.x, k.y, 40)) continue;
        const d = dist(c, k); if (d < bc) { bc = d; enemy = k; }
      }
      camp = enemy;
    }
    if (!camp) {
      if (dd) { districtTask(s, c, b, dd.d); return; }
      // A last resort that still does something: walk to the camp due back first, or push the closer lane.
      let soon = b.route[0]; for (const k of b.route) if (k.at < soon.at) soon = k;
      if (soon && soon.at - s.t < 6) { camp = soon; }
      else { b.task = 'roam'; laneTask(s, c, b, s.lanes.length > 1 && laneDist(s, 1, c.x, c.y) < laneDist(s, 0, c.x, c.y) ? 1 : 0, ai, false); return; }
    }
    let m = null, md = 1e9;
    if (camp.alive) for (const x of s.monsters) if (x.alive && x.camp === camp.id) { const d = dist(c, x); if (d < md) { md = d; m = x; } }
    if (!m) { moveTo(b, camp.x, camp.y, 40); return; }
    b.onCamp = camp.id;
    const low = frac(c);
    if (low < (camp.big ? .42 : .34) && !s.monsters.some(x => x.alive && x.camp === camp.id && x.hp < x.maxHp * .35)) { b.low = true; return; }
    moveTo(b, m.x, m.y, KITS[c.champ].pref * .85);
    if (md - m.r <= c.range) { c.atk = true; c.atkPref = m.id; }
    castPve(s, c, b, m, md);
  }

  // Stand on the district's civilians when they are up (rescue or terrorize), else in the middle, hitting whatever comes.
  function districtTask(s, c, b, d) {
    b.task = 'district';
    const z = d.site >= 0 ? s.sites[d.site] : null, p = z && z.alive ? z : d;
    moveTo(b, p.x, p.y, z && z.alive ? 40 : d.r * .55); c.atk = true;
  }

  // A long trip starts at a friendly station when the ride saves real ground. Returns the stations to use, or null.
  function rideFor(s, c, x, y) {
    if (!s.districts.length || c.subCd > 0) return null;
    const direct = Math.hypot(x - c.x, y - c.y); if (direct < 1200) return null;
    let best = null, top = c.msBase * 1.9;
    for (const a of s.districts) {
      if (a.kind !== 'subway' || a.owner !== c.team) continue;
      const toA = dist(c, a); if (toA > direct) continue;
      for (const z of s.districts) {
        if (z === a || z.kind !== 'subway' || z.owner !== c.team) continue;
        const save = direct - toA - Math.hypot(x - z.x, y - z.y);
        if (save > top) { top = save; best = { a, z, save }; }
      }
    }
    return best;
  }
  function trySubway(s, c, b, ai) {
    if (!b.hasGoal || b.low || b.fighting || c.chan || b.closest < 900) return;
    // Lane discipline: while laning, a laner only rides on the way back from base.
    if (ai.phase === 'lane' && c.role !== 'jungle' && laneDist(s, b.lane, c.x, c.y) < 900) return;
    const r = rideFor(s, c, b.gx, b.gy); if (!r) return;
    if (dist(c, r.a) < r.a.r + 6) { c.q.push({ t: 'subway', to: r.z.id }); b.still = true; noMove(b); b.task = 'subway'; return; }
    moveTo(b, r.a.x, r.a.y, r.a.r * .55);
  }

  // Steals (13.0): when the other side is on a boss and it is within this bot's burst, race in and dump everything on it.
  function stealTask(s, c, b, ai) {
    const sk = b.sk; if (sk.steal < .15 || frac(c) < .25) return false;
    for (const m of s.monsters) {
      if (!m.alive || !m.boss) continue;
      const d = dist(c, m); if (d > 1050) continue;
      let foesOn = 0, mineOn = 0;
      for (const e of b.foes) if (dist(e, m) < m.r + (e.range || 150) + 140) foesOn++;
      for (const a of s.champs) if (a.team === c.team && a.alive && dist(a, m) < m.r + (a.range || 150) + 140) mineOn++;
      if (!foesOn) continue;
      const burst = burstOn(c, m) * (.85 + .4 * sk.iq);
      if (m.hp > burst + (mineOn > foesOn ? 300 : 0) || hash01(m.id + (s.t / 3 | 0), c.id + 13) > sk.steal) continue;
      b.task = 'steal'; c.atk = true; c.atkPref = m.id;
      const reach = Math.max(c.range, 260) + m.r;
      if (d > reach - 20) moveTo(b, m.x, m.y, reach - 40); else if (b.sk.iq > .5) { const a = awayPoint(s, c, m, 120); moveTo(b, a.x, a.y, 20); }
      if (!c.charge && !c.chan) for (const i of [2, 0, 1]) {
        const A = c.kit[i]; if (!rdy(c, i)) continue;
        const rr = (A.range || A.r || 200) + m.r; if (d > rr - 15) continue;
        cast(c, i, m.x, m.y); b.castAt = s.t + .2; b.st13.steal++; break;
      }
      return true;
    }
    return false;
  }
  function hoardTask(s, c, b, ai) {
    const boss = s.monsters.find(m => m.bossKind === ai.hoard.kind && m.alive);
    if (!boss) { moveTo(b, ai.hoard.x, ai.hoard.y, 90); return true; } // gather a little before it spawns
    const d = dist(c, boss);
    if (!ai.hoardGo && d > 900) { moveTo(b, ai.hoard.x, ai.hoard.y, 90); return true; }
    let want = Math.max(KITS[c.champ].pref + boss.r * .3, boss.r + c.r + 10);
    // 13.0 bosses fight back: ranged bots work from the edge of their range, clear of the slams; a hurt non-tank it turns on backs off.
    if (!KITS[c.champ].melee && b.sk.iq > .35) want = Math.max(want, c.range + boss.r - 25);
    if (boss.tgt === c && b.cls !== 'front' && frac(c) < .3 + .1 * (boss.phase || 1) && b.sk.iq > .4) { const a = awayPoint(s, c, boss, 260); moveTo(b, a.x, a.y, 30); c.atk = true; return true; }
    if (d > want) moveTo(b, boss.x, boss.y, want); else noMove(b);
    if (d - boss.r <= c.range) { c.atk = true; c.atkPref = boss.id; }
    castPve(s, c, b, boss, d);
    return true;
  }

  // 14.0: never planted. Having reached its spot with nothing in reach, a bot keeps shifting its feet around it the way players
  // do (it makes it a moving target and keeps the camera honest). Beginners drift wider and lazier; sharp players keep it tight.
  function footwork(s, c, b) {
    if (!b.hasGoal || !b.fresh || b.still || c.chan || b.vecT > 0 || b.ga > 200) return;
    const bx = b.gx, by = b.gy, sk = b.sk;
    // Trading blows with something in reach: hold the spot until the attacks stop.
    if (Math.hypot(bx - c.x, by - c.y) > b.ga + 60 || c.atkCd > .05) return;
    if (!b.shuf || s.t >= b.shuf.until || Math.hypot(b.shuf.bx - bx, b.shuf.by - by) > 90) {
      // A new spot, well clear of the last one, reachable in a straight line and outside enemy tower range.
      const prev = b.shuf, a0 = prev ? Math.atan2(prev.oy, prev.ox) + Math.PI : s.rand() * 6.283;
      let ox = 0, oy = 0;
      for (let k = 0; k < 4; k++) {
        const a = a0 + (s.rand() - .5) * 2.2, r = 36 + s.rand() * (38 + (1 - sk.v) * 45), x = Math.cos(a) * r, y = Math.sin(a) * r;
        if (navOpen(s.map, b.mask, bx + x, by + y) && clearLine(s.map, b.mask, c.x, c.y, bx + x, by + y, 14) && !towerOver(s, c.team, bx + x, by + y, 10)) { ox = x; oy = y; break; }
      }
      b.shuf = { ox, oy, bx, by, until: s.t + 1.6 + s.rand(), at: 0 }; b.held = false;
    }
    // A short beat on arrival, then the next step: a beginner lingers a little longer.
    if (!b.shuf.at && Math.hypot(bx + b.shuf.ox - c.x, by + b.shuf.oy - c.y) < 16) { b.shuf.at = s.t; b.shuf.until = Math.min(b.shuf.until, s.t + .15 + s.rand() * .5 * (1.6 - sk.shuffle)); }
    moveTo(b, bx + b.shuf.ox, by + b.shuf.oy, 12); b.fresh = false;
  }

  // Every decision ends with the feet: whatever the job, a bot that has arrived keeps moving like a player.
  function botThink(s, c, b) { botDecide(s, c, b); footwork(s, c, b); }
  function botDecide(s, c, b) {
    const sk = b.sk, ai = s.ai[c.team]; ensureAi(ai);
    const f = frac(c), home = s.fountains[c.team], homeD = dist(c, home), laning = ai.phase === 'lane', laner = c.role !== 'jungle' && roleLane(c) >= 0;
    c.atk = false; c.atkPref = 0; c.atkMode = 'champ'; c.preferTower = false; b.still = false; b.diveOk = false; b.fresh = false;
    if (s.t >= b.noiseAt) { b.noise = (s.rand() - .5) * 2; b.noiseAt = s.t + 3 + s.rand() * 3; b.strafe = -b.strafe; }

    const foes = b.foes; foes.length = 0; b.closest = 1e9;
    for (const e of s.champs) if (e.team !== c.team && e.alive && !e.air && canSee(s, c.team, e)) { foes.push(e); b.closest = Math.min(b.closest, dist(e, c)); }
    b.et = towerOver(s, c.team, c.x, c.y, 240); b.etTanks = b.et ? towerCover(s, c.team, b.et) : 0;
    senseThreats(s, c, b);
    const t = pickTarget(s, c, b, ai), d = t ? dist(c, t) : 1e9; b.tid = t ? t.id : 0;
    if (c.charge) handleCharge(s, c, b, t, d);
    botConsumables(s, c, b, ai, t, d);
    if (c.stunT > 0) { noMove(b); return; }

    if (homeD < 360) { b.lastHome = s.t; if (f > .92) b.low = false; }
    // Forge the moment it's affordable: anyone can press the button from anywhere.
    // Shopping: a sharp player spends the moment it can; a beginner forgets for a while and plays with gold in its pocket.
    const nb = nextBuy(s, c), keep = s.t > 720 && sk.iq > .35 ? buybackCost(s, c) * (.5 + .5 * sk.macro) : 0;
    if (nb && c.gold >= nb.cost + keep && s.t >= (b.shopAt || 0)) { c.q.push({ t: 'buy', id: nb.id }); b.shopAt = s.t + Math.pow(1 - sk.v, 1.5) * 30 * s.rand(); }
    botSpend(s, c, b, ai, nb);
    if (c.lvl >= 4 && c.evolved[0] < 0) c.q.push({ t: 'evolve', tier: 0, choice: botEvolve(c, 0) });
    if (c.lvl >= 8 && c.evolved[1] < 0) c.q.push({ t: 'evolve', tier: 1, choice: botEvolve(c, 1) });
    if (c.hp < (b.hpWas || c.hp) - .5) b.hurtAt = s.t;
    b.hpWas = c.hp;
    if (c.chan && c.chan.recall) {
      if (b.closest >= 650) { b.task = 'recall'; b.still = true; noMove(b); return; }
      // moving is what cancels a recall, the same as for a player
    }
    b.ratio = t ? assess(s, c, b, ai) : 2;
    if (t && t.id === c.nem) b.ratio *= 1 + .06 * sk.iq;
    // 13.0. A duel is a commitment; a wanted bot guards its bounty; Last Stand swings the local odds.
    const duel = t && botDuel(s, c, t); if (duel) { b.ratio *= 1.15 + .1 * sk.iq; if (!b.duelOn) { b.duelOn = true; b.st13.duel++; } } else b.duelOn = false;
    if (c.wanted) b.ratio *= 1 - .05 * botWanted(c) * sk.iq;
    if (ai.stand) { b.ratio *= 1.2; if (!b.standOn) { b.standOn = true; b.st13.stand++; } } else b.standOn = false;
    if (ai.foeStand && t) { const core = s.towers.find(x => x.team === t.team && x.sub === 'core'); if (core && dist(core, t) < 1300) b.ratio *= 1 - .3 * sk.iq; }
    // Just died, or keeps dying: come back carefully rather than feed the same fight.
    const recent = b.deaths.reduce((n, at) => n + (s.t - at < 120 ? 1 : 0), 0), fresh = c.spawnT !== undefined && s.t - c.spawnT < 16;
    if (recent >= 2) { const last = b.deaths[b.deaths.length - 1] || 0; b.safeUntil = Math.max(b.safeUntil, last + 22 + (recent - 1) * 14); }
    const safeMode = s.t < b.safeUntil;
    if (safeMode) b.ratio *= 1 - .4 * sk.guard;
    if (fresh) b.ratio *= 1 - .1 * sk.guard;
    // A side that is behind picks its fights instead of walking into them one at a time.
    if (s.catchup[c.team] > .25) b.ratio *= 1 - .2 * s.catchup[c.team] * (.4 + .6 * sk.macro);
    if (b.deaths.length > 6) b.deaths.splice(0, b.deaths.length - 6);

    pingCalls(s, c, b, ai, f, laning, laner);
    // Too hurt to stay: recall if it is quiet, walk home if it is not.
    // A duel the bot is winning is not abandoned at the usual health line.
    const duelEdge = duel && f > .12 && frac(t) < f + .08 * sk.iq;
    if (!duelEdge && (f < sk.low || (f < sk.low + .15 && b.closest < 600 && b.ratio < .9))) b.low = true;
    // Recall with intent (14.0): hurt with nothing to stay for, or topping up before the side's boss call. Beginners stay out half-dead.
    else if (!b.low && !c.chan && homeD > 2300 && b.closest > 1300 && s.t - (b.hurtAt || -9) > 4 && !b.fighting && hash01(c.id, s.t / 6 | 0) < sk.macro) {
      const sieging = ai.siege && ai.siege.go && ai.siege.ids.includes(c.id), bossSoon = ai.hoard && ai.hoard.ids.includes(c.id) && !ai.hoardGo;
      if (!sieging && (f < .38 + .17 * sk.macro || (bossSoon && f < .62))) b.low = true;
    }
    if (b.low) {
      b.task = 'low';
      if (homeD < 360) { c.atk = !towerOver(s, c.team, c.x, c.y, 0); noMove(b); return; }
      const hitLately = s.t - (b.hurtAt || -9) < 2.2 || s.monsters.some(m => m.alive && m.tgt === c);
      const quiet = b.closest >= 700 && homeD > 1050 && !hitLately && memThreat(s, c, b, ai, c.x, c.y, 650) < .5 + (1 - sk.iq);
      if (quiet) { if (!c.chan) c.q.push({ t: 'recall' }); b.still = true; noMove(b); return; }
      const hosp = (laning && laner) ? null : s.districts.find(d => d.kind === 'hospital' && d.owner === c.team && dist(d, c) < homeD * .6 && !b.foes.some(e => dist(e, d) < 500));
      if (hosp) { if (dist(c, hosp) < hosp.r * .7 && f > .7) { b.low = false; return; } moveTo(b, hosp.x, hosp.y, hosp.r * .5); c.atk = !towerOver(s, c.team, c.x, c.y, 0); if (t) useCombo(s, c, b, t, 'retreat'); return; }
      moveTo(b, home.x, home.y, 40); c.atk = !towerOver(s, c.team, c.x, c.y, 0); if (t) { useCombo(s, c, b, t, 'retreat'); escapeEvade(s, c, b, t); }
      return;
    }
    const heeds = key => hash01(key, c.id + 3) < .3 + .7 * sk.macro;
    // A boss low enough to burst, with the other side on it: go steal it.
    if (stealTask(s, c, b, ai)) return;
    const called = ai.defend && ai.defend.ids.includes(c.id) && heeds(ai.defend.id + (s.t / 20 | 0)) && !(s.raid && ai.hoardGo && ai.hoard && ai.hoard.ids.includes(c.id) && ai.defend.ids[0] !== c.id);

    if (t) {
      const kill = t.hp <= burstOn(c, t), tw = towerOver(s, c.team, t.x, t.y, 10), tanks = tw ? alliesTanking(s, c.team, tw) : 0;
      // A dive pays for every tower shot it takes, with compounding.
      const shots = 1 + Math.ceil((d / c.msBase + 1) / 1.1); let shotsSum = 0; for (let i = 0; i < shots; i++) shotsSum += towerShot(s, i);
      const sureKill = kill && c.hp > shotsSum;
      const pokeFromOut = tw && d - t.r <= c.range && !towerOver(s, c.team, c.x, c.y, 0);
      const group = ai.push !== null || (ai.hoard && ai.hoard.ids.includes(c.id)) || (ai.siege && ai.siege.ids.includes(c.id));
      let want = (kill && b.ratio > .7) || (b.ratio > 1.4 && (frac(t) < .7 || d < 620)) || (b.ratio > 1.15 && d < c.range + 70)
        || (b.fighting && b.ratio > .78 && d < 900) || (group && b.ratio > .95 && d < 850);
      // A beginner sometimes runs a low target right under its tower (and pays for it); sharp players only for a sure kill.
      const greedDive = kill && frac(t) < .3 && hash01(t.id + (s.t / 4 | 0), c.id + 83) < sk.greed * .45;
      if (tw && !sureKill && !pokeFromOut && !greedDive) want = false;
      if (f < .45 && b.ratio < 1.2 && !kill) want = false;
      const pack = s.champs.reduce((n, e) => n + (e.team !== c.team && e.alive && !e.air && dist(e, c) < 800 && canSee(s, c.team, e) ? 1 : e.team === c.team && e.alive && dist(e, c) < 800 ? -1 : 0), 0), outnumbered = pack >= 2 && !kill;
      if (outnumbered) want = false;
      // Laning leash: laners trade on their lane and don't chase off it.
      if (laning && laner && want) {
        const off = laneDist(s, b.lane, t.x, t.y), up = (rdy(c, 0) ? 1 : 0) + (rdy(c, 1) ? 1 : 0);
        if (off > 340 && !(kill && off < 520)) want = false;
        if (!kill) {
          if (up < 1 && b.ratio < 1.4) want = false;
          if (s.t < b.tradeT) want = false;
        }
      }
      if (laning && c.role === 'jungle' && !b.gank && !ai.help[c.id] && !kill && d > 600) want = false;
      if (safeMode && !kill) want = want && b.ratio > 1.2;
      // No long chases: a beginner gives up late, and a sharper bot sooner when it is losing ground.
      // Chasing (14.0): a sharp player drops a chase it is not closing, kill or not; a beginner keeps running after
      // anything hurt, for longer, into fog and towers.
      if (want && d > c.range + 70 && !duel) {
        const dt = s.t - (b.chaseAt || 0), closing = b.chaseId === t.id && dt > 0 && dt < 1 ? (b.chaseD - d) / dt : 0;
        b.chaseId = t.id; b.chaseD = d; b.chaseAt = s.t; b.chase += sk.think;
        if (closing < -10) b.losing = (b.losing || 0) + sk.think; else b.losing = 0;
        const limit = kill ? 2.4 + sk.greed * 6 : 1.4 + sk.greed * 4, sharpStop = sk.iq > .45 && b.losing > .5 + (1 - sk.iq) * 1.5 && d > c.range + 160;
        if (b.chase > limit || sharpStop) { want = false; b.noChase = s.t + 3; b.chase = 0; b.losing = 0; }
      } else b.chase = 0;
      if (s.t < b.noChase && d > c.range + 40 && (!kill || sk.iq > .45)) want = false;
      if (laning && laner && b.fighting && !want && !kill) b.tradeT = s.t + 3.5;
      b.fighting = !!want;
      if (want) {
        b.task = 'fight';
        b.diveOk = !tw || sureKill;
        fightMove(s, c, b, t, d, ai);
        c.atk = true; if (d - t.r <= c.range) c.atkPref = t.id;
        useCombo(s, c, b, t, 'fight');
        wasteEvade(s, c, b);
        return;
      }
      // Losing the local fight: back off along the lane to the tower, and use what escapes there are.
      if ((b.ratio < .62 || outnumbered) && d < 720) {
        b.task = 'retreat';
        let safe = laning && laner ? firstTower(s, c.team, b.lane) : home, sd = dist(c, safe);
        if (!(laning && laner)) for (const o of s.towers) if (o.alive && o.team === c.team) { const od = dist(c, o); if (od < sd && dist(o, t) > od * .7) { sd = od; safe = o; } }
        moveTo(b, safe.x, safe.y, 120); c.atk = !towerOver(s, c.team, c.x, c.y, 0);
        useCombo(s, c, b, t, 'retreat'); escapeEvade(s, c, b, t);
        return;
      }
    } else b.fighting = false;

    // 14.0: the side is converting. A bot that heeds it (sharper players nearly always do) groups and takes the structure.
    if (ai.siege && ai.siege.ids.includes(c.id) && !called && !(ai.clear && ai.clear[c.id] !== undefined && heeds(7 + (s.t / 15 | 0))) && hash01(ai.siege.id + (s.t / 15 | 0), c.id + 71) < .2 + .8 * sk.push && siegeTask(s, c, b, ai, ai.siege)) return;
    // Answer pings from the side.
    const pg = pingTask(s, c, b, ai);
    if (pg === 'retreat' && homeD > 700 && !t) { moveTo(b, home.x, home.y, 80); b.task = 'pinged'; c.atk = true; useCombo(s, c, b, null, 'poke'); return; }
    if (pg && pg.x !== undefined) { b.task = 'pinged'; moveTo(b, pg.x, pg.y, 110); c.atk = true; if (t) useCombo(s, c, b, t, 'poke'); return; }
    // Team plan first, then the role's normal job.
    if (called) { b.task = 'defend'; moveTo(b, ai.defend.x, ai.defend.y, 60); c.atk = true; }
    else if (ai.clear && ai.clear[c.id] !== undefined && heeds(7 + (s.t / 15 | 0))) clearTask(s, c, b, ai.clear[c.id]);
    else if (ai.help[c.id] && ai.help[c.id].alive && heeds(ai.help[c.id].id + (s.t / 12 | 0))) { b.task = 'help'; const a = ai.help[c.id]; moveTo(b, a.x, a.y, 130); c.atk = true; }
    else if (ai.cover[c.id] !== undefined) { b.task = 'cover'; laneTask(s, c, b, ai.cover[c.id], ai, false); }
    else if (ai.ev && ai.ev[c.id] && s.event && heeds(99 + (s.t / 12 | 0))) { b.task = 'event'; const E = s.event; moveTo(b, E.x, E.y, E.r * .55); c.atk = true; }
    else if (ai.hoard && ai.hoard.ids.includes(c.id) && (hash01(1 + (s.t / 25 | 0), c.id + 7) < (s.raid ? .85 : .65) + .35 * sk.macro) && hoardTask(s, c, b, ai)) { b.task = 'boss'; }
    else if (ai.dist && ai.dist[c.id] && c.role !== 'jungle') districtTask(s, c, b, ai.dist[c.id].d);
    else if (ai.sites[c.id] && ai.sites[c.id].alive && heeds(ai.sites[c.id].id + 41 + (s.t / 25 | 0))) { b.task = 'site'; const z = ai.sites[c.id]; moveTo(b, z.x, z.y, 70); c.atk = true; }
    else if (ai.split === c.id && ai.push !== null) { b.task = 'split'; laneTask(s, c, b, ai.push === 0 ? 1 : 0, ai, true); }
    else if (ai.push !== null) { b.task = 'push'; laneTask(s, c, b, ai.push, ai, true); }
    else if (c.role === 'jungle') jungleTask(s, c, b, ai);
    else { b.task = 'lane'; laneTask(s, c, b, b.lane, ai, false); }
    trySubway(s, c, b, ai);

    // Poke with whatever is free when standing somewhere safe.
    const safeSpot = !towerOver(s, c.team, c.x, c.y) && b.ratio >= .7 && f > .4;
    if (t ? safeSpot && !(laning && s.t < b.tradeT) : c.champ === 'solenne' || c.champ === 'tidecaller') useCombo(s, c, b, t, 'poke');
  }

  // Build-aware evolve choice, tier 0 and tier 1. Bots can read their own build.
  const BOT_EVOLVE = {
    marksman: [0, 0], skirmisher: [1, 1], spotter: [1, 1], executioner: [0, 0],
    parrymaster: [1, 1], blitz: [0, 1], vanguard: [1, 0], breaker: [0, 1],
    constellation: [0, 1], meteor: [1, 0], comet: [0, 1], stellar: [0, 0],
    lifebringer: [0, 1], protector: [1, 0], sunlance: [0, 1], radiant: [1, 0],
    ghost: [0, 0], reaper: [1, 1], hunter: [0, 1], twin: [1, 0],
    anchor: [0, 0], juggernaut: [1, 1], warden: [0, 1], seismic: [1, 0],
    trapper: [0, 1], deadeyed: [1, 0], gunslinger: [1, 0], jailer: [0, 1],
    fencer: [1, 0], masquerade: [1, 1], honorbound: [0, 1], bladestorm: [0, 0],
    cursebinder: [0, 1], transmuter: [1, 0], ritualist: [1, 0], jinx: [1, 1],
    apothecary: [1, 0], pestilence: [0, 1], bloodletter: [1, 1], ward: [0, 0],
    cutthroat: [1, 0], nightblade: [0, 1], butcher: [1, 1], venomous: [0, 0],
    brawler: [1, 1], wrecker: [0, 1], bouncer: [1, 0], fortress: [0, 0],
    stormchaser: [0, 0], surge: [0, 1], conductor: [1, 1], thunderhead: [1, 1], wellspring: [0, 1], undertow: [1, 0], deluge: [0, 1], abyss: [1, 0],
    skyknight: [0, 1], sunstriker: [1, 0], titanwing: [0, 0], aegisborn: [1, 1], twinshot: [0, 1], shade: [1, 0], kaleidoscope: [1, 1], hollow: [1, 0],
    pyre: [0, 1], ashwalker: [1, 1], wildfire: [0, 0], firestorm: [0, 1], alpha: [1, 0], savage: [0, 0], packleader: [1, 0], hemorrhage: [0, 1],
    bastille: [1, 1], artillery: [0, 0], wreckingcrew: [0, 0], moonquake: [1, 0], marionettist: [0, 1], troupe: [1, 0], maestro: [0, 1], ventriloquist: [1, 0],
  };
  const botEvolve = (c, tier) => { const v = BOT_EVOLVE[c.build]; return v ? v[tier] : 0; };

  // Consumables as reactions: heal in a fight, shrug off a disable, spare gold becomes a war elixir.
  function botConsumables(s, c, b, ai, t, d) {
    const iq = b.sk.iq, f = frac(c), gold = c.gold, buy = id => c.q.push({ t: 'buy', id });
    if (iq > .35 && !(c.potT > 0) && f < .4 && s.t >= b.potAt && gold >= 220 && (b.potAt = s.t + 30 - 12 * iq, true) && (b.fighting || b.closest < 600 || s.t - (b.hurtAt || -9) < 2.5 || b.low) && dist(c, s.fountains[c.team]) > 700 && hash01(c.id, s.t | 0) < .35 + .6 * iq) { buy('potion'); return; }
    if (iq > .5 && (c.stunT > .5 || c.rootT > .5 || c.polyT > .4) && !(c.cleanseCd > 0) && gold >= 170 && b.closest < 700) { buy('cleanse'); return; }
    if (iq > .55 && !(c.elixT > 0) && !(c.tonicT > 0) && b.low && gold >= 120 && dist(c, s.fountains[c.team]) > 1300 && b.closest < 500) { buy('tonic'); return; }
  }
  // Gold beyond the next item: an elixir before an objective, reinforcements for a push, then the people bar.
  function botSpend(s, c, b, ai, nb) {
    if ((s.tick + c.id * 3) % 30 !== 0) return;
    const late = s.t > 720, keep = late ? buybackCost(s, c) * (.5 + .5 * b.sk.macro) : 0, spare = c.gold - keep - (nb && nb.cost < 700 ? nb.cost : 0) - 60;
    if (spare < 100 || hash01(c.id, s.t / 5 | 0) > .3 + .7 * b.sk.macro) return;
    const fightDue = ai.hoard && ai.hoard.ids.includes(c.id) || ai.push !== null || b.fighting;
    if (s.t > 480 && !(c.elixT > 0) && spare > 300 && fightDue) { c.q.push({ t: 'buy', id: 'elixir' }); return; }
    if (s.t > 420 && spare > reinforceCost(s, c) + 60 && s.t >= s.reinforceAt[c.team] && (ai.push !== null || s.t > 660)) {
      const left = [0, 1].map(l => s.towers.filter(t => t.alive && t.team !== c.team && t.lane === l).length), lane = s.oneLane ? 0 : ai.push !== null ? ai.push : (left[0] < left[1] ? 0 : left[1] < left[0] ? 1 : s.laneInfo[c.team][0].n > s.laneInfo[c.team][1].n ? 0 : 1);
      c.q.push({ t: 'reinforce', lane }); return;
    }
    const noBonus = c.team ? s.hope > 34 : s.hope < 66;
    if (s.t > 420 && noBonus && spare > fundCost(s, c.team) + 80 && !(c.fundCd > 0)) { c.q.push({ t: 'fund' }); return; }
  }
  // Dead bots still shop and decide on buyback.
  function botDead(s, c, b) {
    if ((s.tick + c.id * 7) % 20 !== 0) return;
    const nb = nextBuy(s, c), keep = s.t > 720 && b.sk.iq > .35 ? buybackCost(s, c) : 0; if (nb && c.gold >= nb.cost + keep) c.q.push({ t: 'buy', id: nb.id });
    if (s.practice || c.buybackCd > 0 || c.respawn < 9) return;
    const cost = buybackCost(s, c); if (c.gold < cost) return;
    const core = s.towers.find(t => t.team === c.team && t.sub === 'core'), coreOpen = !core.alive ? false : towerOpen(s, core);
    let danger = 0; if (coreOpen) { for (const e of s.champs) if (e.team !== c.team && e.alive && dist(e, core) < 900) danger++; for (const m of s.minions) if (m.team !== c.team && m.alive && dist(m, core) < 500) danger += .35; }
    const late = s.t > 780 || botAct(s) >= 3, rich = c.gold > cost * 2.2;
    if ((danger >= 1.5 && hash01(c.id, s.t / 5 | 0) < .35 + .6 * b.sk.macro) || (late && (rich || c.respawn > 18) && hash01(c.id, s.t / 8 | 0) < .25 + .35 * b.sk.iq)) c.q.push({ t: 'buyback' });
  }

  // Calls a bot makes for its side (14.0), rate-limited like a person's: help when collapsed on, and a missing lane opponent
  // during laning (a sharp laner's 'danger' on its own spot, which its lane partner heeds by giving ground).
  function pingCalls(s, c, b, ai, f, laning, laner) {
    if (s.t < (b.pingAt || 0) || c.pingT > 0) return;
    const say = (kind, x, y) => { c.q.push({ t: 'ping', kind, x, y }); b.pingAt = s.t + 18 + s.rand() * 12; };
    let near = 0; for (const e of b.foes) if (dist(e, c) < 750) near++;
    if (near >= 2 && f < .6 && s.t - (b.hurtAt || -9) < 1 && hash01(c.id, s.t | 0) < .3 + .6 * b.sk.macro && s.champs.some(a => a !== c && a.team === c.team && a.alive && dist(a, c) < 1600)) { say('help', c.x, c.y); return; }
    if (laning && laner && b.sk.macro > .5) {
      const opp = s.champs.find(e => e.team !== c.team && e.alive && e.role === c.role), m = opp && ai.mem[opp.id];
      if (m && s.t - m.t > 6 && s.t - m.t < 9 && laneDist(s, b.lane, m.x, m.y) < 600 && hash01(c.id + 3, s.t / 3 | 0) < b.sk.macro) say('danger', c.x, c.y);
    }
  }
  // What an ally's ping asks of this bot right now: a point to go to, 'retreat', or nothing.
  function pingTask(s, c, b, ai) {
    if (!ai.pings.length) return null;
    let res = null;
    for (let i = ai.pings.length - 1; i >= 0; i--) {
      const p = ai.pings[i], age = s.t - p.t; if (age > 9 || p.by === c.id) continue;
      if (b.pinged === undefined) b.pinged = {};
      const heeds = hash01(c.id + p.by, Math.floor(p.t * 10)) < .4 + .6 * b.sk.macro; if (!heeds) continue;
      const d = Math.hypot(p.x - c.x, p.y - c.y), human = !s.champs.find(a => a.id === p.by).bot;
      if (p.kind === 'retreat' && d < 1100) return 'retreat';
      if (p.kind === 'danger' && d < 520) { const n = norm(c.x - p.x, c.y - p.y); return { x: c.x + n.x * 400, y: c.y + n.y * 400 }; }
      // Bots already share the side's plan; a help or attack call is for, and from, people (14.0).
      if ((p.kind === 'help' || p.kind === 'attack') && human && d < 2400 && frac(c) > .45 && !b.low && (ai.phase !== 'lane' || human || c.role === 'jungle') && (d > 260 || p.kind === 'help')) {
        if (!b.pinged[p.t]) { b.pinged[p.t] = 1; if (hash01(c.id, p.t * 7) < .4) c.q.push({ t: 'ping', kind: 'omw', x: p.x, y: p.y }); }
        if (!res || age < res.age) res = { x: p.x, y: p.y, age };
      }
    }
    return res;
  }

  // ---------- bans ----------
  // Bot side bans from the other side's roster: strength first, then the kit that answers our best champion, then what they have shown.
  const BAN_POWER = { vesper: .62, ione: .6, sable: .55, kade: .5, solenne: .55, gravel: .5, deadbolt: .62, hex: .6, shiv: .55, duelist: .5, plague: .55, ironjaw: .5, voltaic: .55, tidecaller: .52, paragon: .58, mirage: .55, cinder: .58, ravager: .52, cataclysm: .55, puppeteer: .52 };
  function botBan(side, info) {
    const o = info || {}, foe = 1 - side, banned = o.banned || [], picks = o.picks || [], rand = o.rand || Math.random;
    const pool = ROSTER[foe].filter(k => !banned.includes(k)); if (!pool.length) return null;
    const power = k => BAN_POWER[k] === undefined ? .5 : BAN_POWER[k];
    let best = pool[0], bv = -1e9;
    for (const k of pool) {
      const n = nemesisOf(k);
      // Removing the kit that counters a strong champion of ours frees that pick.
      let v = power(k) + (n && ROSTER[side].includes(n) ? (power(n) - .5) * .8 : 0) + (picks.includes(k) ? .22 : 0) + rand() * .1;
      if (v > bv) { bv = v; best = k; }
    }
    return best;
  }

  // ---------- rank contract ----------
  const RANKS = [{ name: 'Rookie', at: 0 }, { name: 'Vigilante', at: 1100 }, { name: 'Sentinel', at: 1400 }, { name: 'Guardian', at: 1700 }, { name: 'Champion', at: 2000 }, { name: 'Legend', at: 2350 }];
  function rankOf(r) {
    let i = 0; RANKS.forEach((x, k) => { if (r >= x.at) i = k; });
    const at = RANKS[i].at, next = RANKS[i + 1] ? RANKS[i + 1].at : null;
    return { name: RANKS[i].name, tier: i, next, frac: next === null ? 1 : clamp((r - at) / (next - at), 0, 1) };
  }
  // Rank onto bot skill: the default 1000 is about .3, a Legend about .9.
  const rankSkill = r => clamp(.3 + (r - 1000) * .6 / 1350, .12, .95);
  // The rating change for one match. Beating tougher bots pays more; a good personal game softens a loss.
  function rankDelta(rank, won, stats, teamAvgBotSkill) {
    const st = stats || {}, you = rankSkill(rank), them = teamAvgBotSkill === undefined ? you : teamAvgBotSkill;
    const expected = clamp(.5 + (you - them) * 1.6, .08, .92);
    let d = 34 * ((won ? 1 : 0) - expected);
    const kda = ((st.kills || 0) + (st.assists || 0) * .5) / Math.max(1, st.deaths || 0);
    d += clamp((kda - 1.5) * 2.2, -5, 5);
    return Math.round(clamp(d, -45, 45));
  }
  // n skills around the median mapped from average player rank, with a spread, and at least one very
  // advanced bot in every group of four (one per enemy team when the caller slices seats by four).
  function botSkills(avgPlayerRank, n, seed) {
    const r = rng(seed || 1), med = rankSkill(avgPlayerRank === undefined ? 1000 : avgPlayerRank), out = [];
    for (let i = 0; i < n; i++) out.push(clamp(med + (r() + r() + r() - 1.5) * .22, .05, .98));
    for (let g = 0; g < n; g += 4) {
      const span = Math.min(4, n - g), idx = g + (r() * span | 0);
      if (!out.slice(g, g + span).some(v => v >= .78 || v >= med + .3)) out[idx] = clamp(Math.max(.72, med + .34) + r() * .08, 0, .98);
    }
    return out;
  }
