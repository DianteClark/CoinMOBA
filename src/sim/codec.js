// Compact network state. Concatenated into the Sim closure by build.py.
  // ---------- networking: compact state for host-authoritative play ----------
  // Fast state is binary and goes out unreliably about 20 times a second. Slow state is a
  // sparse delta of whole numbers on the reliable channel, so a lost packet can't desync it.
  const FX_CODE = ['snipe', 'snipeFull', 'deadeye', 'orb', 'ray', 'chain', 'bolt', 'mbolt', 'tower', 'rupture', 'crash', 'heal', 'stomp', 'dome', 'break', 'dash', 'parry', 'slash', 'tripwire', 'ricochet', 'lockdown', 'flourish', 'feint', 'salute', 'hexbolt', 'polymorph', 'coven', 'miasma', 'leech', 'quarantine', 'shank', 'vanish', 'cuts', 'wrecking', 'grab', 'demolish', 'smoke', 'blink', 'tether', 'orbit', 'decoy', 'ring', 'fissure', 'tripline', 'arcdash','overload','thunder','riptide','bubble','tsunami','skyward','solarfist','meteordrop','splitshot','phantom','mirrors','firebolt','scorch','inferno','ignite','maul','pounce','frenzy','bombard','entrench','earthbreak','thread','puppet','dance'];
  const ZONE_KINDS = ['blast', 'dome', 'tripline', 'lockdown', 'coven', 'miasma', 'quarantine', 'ring', 'tether', 'orbit', 'fissure', 'decoy', 'tidewave', 'mirrors', 'puppet'];
  const FX_NUM = {}; FX_CODE.forEach((f, i) => { FX_NUM[f] = i; });
  const POS = 12, SNAP_MAGIC = 0xF3, INTEREST = 280; // POS: 16 bits must span the 5184-wide map
  const wb = new DataView(new ArrayBuffer(32768)); let wp = 0;
  const w8 = v => { wb.setUint8(wp, v); wp += 1; };
  const wi8 = v => { wb.setInt8(wp, clamp(Math.round(v), -127, 127)); wp += 1; };
  const w16 = v => { wb.setUint16(wp, clamp(Math.round(v), 0, 65535), true); wp += 2; };
  const wi16 = v => { wb.setInt16(wp, clamp(Math.round(v), -32767, 32767), true); wp += 2; };
  const wPos = v => w16(v * POS);
  const wVar = v => { v = v >>> 0; while (v > 127) { w8(v & 127 | 128); v >>>= 7; } w8(v); };
  const wByte = v => w8(clamp(Math.round(v), 0, 255));
  const hp8 = u => clamp(Math.ceil(u.hp / u.maxHp * 255), 1, 255);
  function wList(list, cap, fn) {
    const n = Math.min(list.length, cap); wVar(n); let prev = 0;
    for (let i = 0; i < n; i++) { const u = list[i]; wVar(u.id - prev); prev = u.id; fn(u); }
  }

  // Everything that moves or flickers. `seat` indexes the guest's champion in s.champs.
  // Layout: header, the seat's own timers, then a body that depends only on the seat's team, so a host with 7 guests
  // encodes it twice a tick at most (pass the same `cache` object for all guests of a tick).
  function snapshot(s, seat = -1, ack = 0, cache) {
    wp = 0; w8(SNAP_MAGIC); w8((s.seed || 0) & 255); wb.setUint32(wp, s.tick, true); wp += 4; w16(ack); w8(seat + 1);
    let team = -1;
    if (seat >= 0) {
      const c = s.champs[seat]; team = c.team;
      for (let i = 0; i < 3; i++) w16(Math.max(0, c.cd[i]) * 100);
      for (let i = 0; i < 3; i++) w16(Math.max(0, c.recast[i]) * 100);
      w16(Math.max(0, c.atkCd) * 100); wByte((c.slowT > 0 ? c.slowA : 0) * 100); wByte((c.hasteT > 0 ? c.hasteA : 0) * 100);
    }
    const start = wp;
    if (cache && cache[team + 1]) { new Uint8Array(wb.buffer).set(cache[team + 1], wp); wp += cache[team + 1].length; }
    else { snapBody(s, team); if (cache) cache[team + 1] = new Uint8Array(wb.buffer.slice(start, wp)); }
    return wb.buffer.slice(0, wp);
  }
  // Units far outside a team's sight can't be drawn by that team's guests, so they aren't sent. The margin keeps edges from popping.
  function inInterest(s, team, u) {
    if (team < 0 || u.team === team || u.revealT > 0 || u.markT > 0) return true;
    for (const v of visionSources(s, team)) { const r = v.r + INTEREST, dx = v.x - u.x, dy = v.y - u.y; if (dx * dx + dy * dy < r * r) return true; }
    return false;
  }
  function snapBody(s, team) {
    w8(s.champs.length);
    for (const c of s.champs) {
      const chan = c.chan, ch = c.charge, brush = c.inBrush >= 0, curse = c.curseT > 0 ? c.curseN || 0 : 0, pstack = c.pstack || 0, up = c.air > 0 || c.knockT > 0;
      const fl2 = (c.rootT > 0 ? 1 : 0) | (c.polyT > 0 ? 2 : 0) | (c.knockT > 0 ? 4 : 0) | (c.stealthT > 0 ? 8 : 0) | (c.noHealT > 0 ? 16 : 0) | (c.poisonT > 0 ? 32 : 0) | (c.bleedT > 0 ? 64 : 0) | (c.cuts ? 128 : 0) | (c.shieldHp > 0 ? 256 : 0) | (c.pready ? 512 : 0) | (c.hasteT > 0 ? 1024 : 0) | (Math.min(7, curse) << 11) | (pstack ? 16384 : 0) | (c.duelZ ? 32768 : 0);
      const fl = (c.alive ? 1 : 0) | (c.air > 0 ? 2 : 0) | (c.dash ? 4 : 0) | (c.stunT > 0 ? 8 : 0) | (c.slowT > 0 ? 16 : 0) | (c.markT > 0 ? 32 : 0) | (c.parryT > 0 ? 64 : 0)
        | (c.drT > 0 ? 128 : 0) | (c.buffT > 0 ? 256 : 0) | (c.empowerT > 0 ? 512 : 0) | (c.revealT > 0 ? 1024 : 0) | (chan ? 2048 : 0) | (ch ? 4096 : 0) | (brush ? 8192 : 0) | (c.echo ? 16384 : 0) | (c.leap ? 32768 : 0);
      wPos(c.x); wPos(c.y); w16(Math.ceil(c.hp)); wi8((c.fx || 0) * 127); wi8((c.fy || 0) * 127); wb.setUint16(wp, fl, true); wp += 2; wb.setUint16(wp, fl2, true); wp += 2;
      if (up) wByte((c.z || 0) / 2);
      if (pstack) w8(Math.min(255, pstack));
      if (brush) w8(c.inBrush);
      if (chan) { w8(chan.recall ? 0 : chan.slot + 1); wByte(chan.t * 20); wByte(chan.total * 20); wi8((chan.dx || 0) * 127); wi8((chan.dy || 0) * 127); }
      if (ch) { w8(ch.slot); wByte(ch.t * 50); wi8(ch.dx * 127); wi8(ch.dy * 127); }
      if (c.echo) { wPos(c.echo.x); wPos(c.echo.y); }
    }
    const extraOf = m => (m.curseT > 0 ? Math.min(7, m.curseN || 0) : 0) | (m.poisonT > 0 ? 8 : 0) | (m.bleedT > 0 ? 16 : 0) | (m.polyT > 0 ? 32 : 0) | (m.knockT > 0 ? 64 : 0) | (m.heavy ? 128 : 0);
    const near = list => team < 0 ? list : list.filter(u => inInterest(s, team, u));
    wList(near(s.monsters), 60, m => { const ex = extraOf(m); wPos(m.x); wPos(m.y); w8(hp8(m)); w8((m.big ? 1 : 0) | (m.boss ? 2 : 0) | (m.stunT > 0 ? 4 : 0) | (m.slowT > 0 ? 8 : 0) | (m.markT > 0 ? 16 : 0) | (m.shellT > 0 ? 32 : 0) | (ex ? 128 : 0)); if (ex) w8(ex); });
    wList(near(s.minions), 240, m => { const ex = extraOf(m); wPos(m.x); wPos(m.y); w8(hp8(m)); w8((m.team ? 1 : 0) | (m.ranged ? 2 : 0) | (m.stunT > 0 ? 4 : 0) | (m.slowT > 0 ? 8 : 0) | (m.markT > 0 ? 16 : 0) | (m.delay > 0 ? 32 : 0) | (m.lane ? 64 : 0) | (ex ? 128 : 0)); if (ex) w8(ex); });
    wList(near(s.proj), 160, p => {
      wPos(p.x); wPos(p.y); w8(p.team | (p.homing ? 4 : 0) | (p.pierce ? 8 : 0)); w8(FX_NUM[p.fx] === undefined ? 255 : FX_NUM[p.fx]); wByte(p.w); wVar(p.owner.id);
      if (p.homing) wVar(p.target.id); else { wi16(p.vx / 8); wi16(p.vy / 8); }
    });
    wList(s.zones, 64, z => { const ext = (z.line ? 1 : 0) | (z.tgt ? 2 : 0); wPos(z.x); wPos(z.y); w16(z.r); wByte(z.t * 20); wByte(z.total * 20); w8(z.team | ZONE_KINDS.indexOf(z.kind) << 2); w8(FX_NUM[z.fx] === undefined ? 255 : FX_NUM[z.fx]); wVar(z.owner.id); w8(ext); if (z.line) { wPos(z.x1); wPos(z.y1); wPos(z.x2); wPos(z.y2); } if (z.tgt) wVar(z.tgt); });
    wList(s.beacons, 40, b => { wPos(b.x); wPos(b.y); w8(b.team | (b.hp << 2) | ((b.inBrush + 1) << 4)); wByte(b.t); });
    let mask = 0; s.sites.forEach((z, i) => { if (z.prog[0] > 0 || z.prog[1] > 0) mask |= 1 << i; });
    w8(mask); s.sites.forEach((z, i) => { if (mask & 1 << i) { wByte(z.prog[0] * 40); wByte(z.prog[1] * 40); } });
  }

  function decodeSnapshot(buf) {
    const d = new DataView(buf); let p = 0;
    const r8 = () => d.getUint8(p++), ri8 = () => d.getInt8(p++), r16 = () => { const v = d.getUint16(p, true); p += 2; return v; }, ri16 = () => { const v = d.getInt16(p, true); p += 2; return v; };
    const rPos = () => r16() / POS, rVar = () => { let v = 0, sh = 0, b; do { b = r8(); v |= (b & 127) << sh; sh += 7; } while (b & 128); return v >>> 0; };
    if (r8() !== SNAP_MAGIC) return null;
    const mid = r8(), tick = d.getUint32(p, true); p += 4;
    const ack = r16(), seat = r8() - 1;
    let own = null;
    if (seat >= 0) own = { cd: [r16() / 100, r16() / 100, r16() / 100], recast: [r16() / 100, r16() / 100, r16() / 100], atkCd: r16() / 100, slowA: r8() / 100, hasteA: r8() / 100 };
    const n = r8(), champs = [];
    for (let i = 0; i < n; i++) {
      const c = { x: rPos(), y: rPos(), hp: r16(), fx: ri8() / 127, fy: ri8() / 127, fl: r16(), fl2: r16(), z: 0, br: -1, chan: null, charge: null, echo: null, ps: 0 };
      if (c.fl & 2 || c.fl2 & 4) c.z = r8() * 2;
      if (c.fl2 & 16384) c.ps = r8();
      if (c.fl & 8192) c.br = r8();
      if (c.fl & 2048) c.chan = { n: r8(), t: r8() / 20, total: r8() / 20, dx: ri8() / 127, dy: ri8() / 127 };
      if (c.fl & 4096) c.charge = { slot: r8(), t: r8() / 50, dx: ri8() / 127, dy: ri8() / 127 };
      if (c.fl & 16384) c.echo = { x: rPos(), y: rPos() };
      champs.push(c);
    }
    const list = fn => { const k = rVar(), out = new Array(k); let id = 0; for (let i = 0; i < k; i++) { id += rVar(); out[i] = fn(id); } return out; };
    const unitRow = id => { const o = { id, x: rPos(), y: rPos(), hp: r8(), fl: r8(), ex: 0 }; if (o.fl & 128) o.ex = r8(); return o; };
    const mon = list(unitRow);
    const min = list(unitRow);
    const proj = list(id => { const o = { id, x: rPos(), y: rPos(), fl: r8(), fx: r8(), w: r8(), owner: rVar(), target: 0, vx: 0, vy: 0 }; if (o.fl & 4) o.target = rVar(); else { o.vx = ri16() * 8; o.vy = ri16() * 8; } return o; });
    const zones = list(id => { const o = { id, x: rPos(), y: rPos(), r: r16(), t: r8() / 20, total: r8() / 20, fl: r8(), fx: r8(), owner: rVar(), ext: r8() }; if (o.ext & 1) { o.x1 = rPos(); o.y1 = rPos(); o.x2 = rPos(); o.y2 = rPos(); } if (o.ext & 2) o.tgt = rVar(); return o; });
    const beacons = list(id => ({ id, x: rPos(), y: rPos(), fl: r8(), t: r8() }));
    const mask = r8(); let prog = null;
    if (mask) { prog = {}; for (let i = 0; i < 8; i++) if (mask & 1 << i) prog[i] = [r8() / 40, r8() / 40]; }
    return { mid, tick, ack, seat, champs, own, mon, min, proj, zones, beacons, prog, size: buf.byteLength };
  }

  // A renderer-shaped stand-in for a unit id the guest can't resolve (its owner already died, say).
  const ghostUnit = (id, x, y, team) => ({ id, x, y, px: x, py: y, team, alive: false, kind: 'ghost' });

  function placeUnit(u, a, b, f, span) {
    let x = a.x, y = a.y, vx = 0, vy = 0;
    if (b && span > 0) {
      const dx = b.x - a.x, dy = b.y - a.y;
      if (Math.hypot(dx, dy) > span * DT * 1500 + 80) { if (f >= .5) { x = b.x; y = b.y; } }
      else { x += dx * f; y += dy * f; vx = dx / (span * DT); vy = dy / (span * DT); }
    }
    u.x = u.px = x; u.y = u.py = y; u.vx = vx; u.vy = vy;
  }
  function byId(list) { const m = new Map(); for (const u of list) m.set(u.id, u); return m; }

  // Rebuilds s between two decoded snapshots. seat is skipped for position: its coin is predicted.
  // f can pass 1 a little, to carry on through a short gap instead of stopping dead.
  function applyFrame(s, A, B, f, seat = -1) {
    const span = B ? B.tick - A.tick : 0, rx = s.rx || (s.rx = { m: new Map(), n: new Map(), p: new Map(), z: new Map(), b: new Map() });
    s.tick = A.tick; s.t = (A.tick + span * f) * DT;
    A.champs.forEach((a, i) => {
      const c = s.champs[i];
      if (i !== seat) {
        placeUnit(c, a, B && B.champs[i], f, span);
        applyChampState(c, a);
        c.z = B && (B.champs[i].fl & 2 || B.champs[i].fl2 & 4) ? a.z + (B.champs[i].z - a.z) * f : a.z;
      }
    });
    const sync = (arr, frameA, frameB, map, make, keep) => {
      const nx = frameB && byId(frameB); arr.length = 0;
      for (const a of frameA) {
        let u = map.get(a.id); if (!u) { u = make(a); map.set(a.id, u); }
        placeUnit(u, a, nx && nx.get(a.id), f, span); keep(u, a); arr.push(u);
      }
      if (map.size > arr.length * 2 + 40) { const live = new Set(frameA.map(a => a.id)); for (const k of map.keys()) if (!live.has(k)) map.delete(k); }
    };
    sync(s.monsters, A.mon, B && B.mon, rx.m, a => ({ id: a.id, kind: 'monster', team: 2, alive: true, maxHp: 255, big: !!(a.fl & 1), boss: !!(a.fl & 2), r: a.fl & 2 ? 58 : a.fl & 1 ? 32 : 19, ms: a.fl & 2 ? 170 : 260, fx: 1, fy: 0 }),
      (u, a) => { u.hp = a.hp; u.stunT = a.fl & 4 ? 1 : 0; u.slowT = a.fl & 8 ? 1 : 0; u.markT = a.fl & 16 ? 1 : 0; u.shellT = a.fl & 32 ? 1 : 0; unitExtra(u, a.ex); if (u.boss && !u.bossKind && s.bosses) { const b = s.bosses.find(x => x.id === u.id); if (b) u.bossKind = b.kind; } });
    sync(s.minions, A.min, B && B.min, rx.n, a => ({ id: a.id, kind: 'minion', team: a.fl & 1, ranged: !!(a.fl & 2), lane: a.fl & 64 ? 1 : 0, alive: true, maxHp: 255, r: a.fl & 2 ? 14 : 17, sight: 500, ms: 215, range: a.fl & 2 ? 300 : 95, fx: a.fl & 1 ? -1 : 1, fy: 0 }),
      (u, a) => { u.hp = a.hp; u.stunT = a.fl & 4 ? 1 : 0; u.slowT = a.fl & 8 ? 1 : 0; u.markT = a.fl & 16 ? 1 : 0; u.delay = a.fl & 32 ? 1 : 0; unitExtra(u, a.ex); u.heavy = !!(a.ex & 128); u.type = u.heavy ? 'heavy' : u.ranged ? 'ranged' : 'melee'; });
    sync(s.proj, A.proj, B && B.proj, rx.p, a => ({ id: a.id, team: a.fl & 3, homing: !!(a.fl & 4), pierce: !!(a.fl & 8), fx: FX_CODE[a.fx], w: a.w, age: 0, vx: a.vx, vy: a.vy, seen: s.t }),
      (u, a) => { u.age = s.t - u.seen; u.vx = a.vx; u.vy = a.vy; u.w = a.w; if (!u.owner || u.owner.id !== a.owner) u.owner = unitOf(s, a.owner) || ghostUnit(a.owner, a.x, a.y, a.fl & 3); if (u.homing && (!u.target || u.target.id !== a.target)) u.target = unitOf(s, a.target) || ghostUnit(a.target, a.x, a.y, 2); });
    sync(s.zones, A.zones, B && B.zones, rx.z, a => ({ id: a.id, x: a.x, y: a.y, kind: ZONE_KINDS[a.fl >> 2], fx: FX_CODE[a.fx], r: a.r, team: a.fl & 3, total: a.total, t: a.t, line: !!(a.ext & 1), tgt: a.tgt }),
      (u, a) => { u.t = Math.max(0, a.t - span * f * DT); u.total = a.total; u.r = a.r; if (a.ext & 1) { u.x1 = a.x1; u.y1 = a.y1; u.x2 = a.x2; u.y2 = a.y2; } if (!u.owner) u.owner = unitOf(s, a.owner) || ghostUnit(a.owner, a.x, a.y, a.fl & 3); });
    sync(s.beacons, A.beacons, null, rx.b, a => ({ id: a.id, kind: 'beacon', team: a.fl & 3, x: a.x, y: a.y, px: a.x, py: a.y, r: 16, maxHp: 3, alive: true, sight: 560, inBrush: (a.fl >> 4) - 1 }), (u, a) => { u.hp = (a.fl >> 2) & 3; u.t = a.t; });
    const ev = s.event; if (ev && ev.tx !== undefined) { ev.x += (ev.tx - ev.x) * .12; ev.y += (ev.ty - ev.y) * .12; }
    for (const z of s.sites) { const p = A.prog && A.prog[z.id]; z.prog[0] = p ? p[0] : 0; z.prog[1] = p ? p[1] : 0; }
  }
  const unitOf = (s, id) => s.champs.find(c => c.id === id) || s.towers.find(c => c.id === id) || (s.rx && (s.rx.n.get(id) || s.rx.m.get(id)));
  function applyChampState(c, a, own) {
    const f = a.fl;
    c.alive = !!(f & 1); c.hp = a.hp; c.fx = a.fx; c.fy = a.fy; c.inBrush = a.br;
    c.air = f & 2 ? 1 : 0; c.dash = f & 4 ? (c.dash || { net: true }) : null; c.stunT = f & 8 ? 1 : 0; c.slowT = f & 16 ? 1 : 0; c.markT = f & 32 ? 1 : 0; c.parryT = f & 64 ? 1 : 0;
    c.drT = f & 128 ? 1 : 0; c.buffT = f & 256 ? 1 : 0; c.empowerT = f & 512 ? 1 : 0; c.revealT = f & 1024 ? 1 : 0; c.leap = f & 32768 ? true : null;
    const g = a.fl2 || 0; c.rootT = g & 1 ? 1 : 0; c.polyT = g & 2 ? 1 : 0; c.knockT = g & 4 ? 1 : 0; c.stealthT = g & 8 ? 1 : 0; c.noHealT = g & 16 ? 1 : 0; c.poisonT = g & 32 ? 1 : 0; c.bleedT = g & 64 ? 1 : 0; c.cuts = g & 128 ? true : null; c.shieldHp = g & 256 ? 1 : 0; c.shieldT = g & 256 ? 1 : 0; c.pready = g & 512 ? 1 : 0; c.hasteT = g & 1024 ? 1 : 0; c.curseN = (g >> 11) & 7; c.curseT = c.curseN ? 1 : 0; c.pstack = a.ps || 0; c.duelZ = g & 32768 ? (c.duelZ || { net: true }) : null;
    if (!(f & 2) && !(g & 4)) c.z = 0;
    if (a.chan) {
      const ch = a.chan, slot = ch.n ? ch.n - 1 : undefined, ab = slot !== undefined ? c.kit[slot] : null;
      c.chan = { t: ch.t, total: ch.total, recall: !ch.n, slot, kind: ab && ab.shape === 'line' ? 'line' : undefined, dx: ch.dx, dy: ch.dy, len: ab ? ab.range : 0, w: ab ? ab.w : 0 };
    } else c.chan = null;
    c.charge = a.charge ? { slot: a.charge.slot, t: a.charge.t, dx: a.charge.dx, dy: a.charge.dy } : null;
    c.echo = a.echo || null; if (!own) c.recast[1] = c.echo ? 1 : 0;
  }
  // Bring every field the guest's own coin needs from the newest snapshot, except where it moves.
  function applySnapshot(s, data, seat = -1) { const fr = typeof data.byteLength === 'number' ? decodeSnapshot(data) : data; if (fr) applyFrame(s, fr, null, 0, seat); return fr; }

  function unitExtra(u, ex) { u.curseN = ex & 7; u.curseT = u.curseN ? 1 : 0; u.poisonT = ex & 8 ? 1 : 0; u.bleedT = ex & 16 ? 1 : 0; u.polyT = ex & 32 ? 1 : 0; u.knockT = ex & 64 ? 1 : 0; }
  // Slow fields as flat values; a diff of two of these is the delta.
  // Numbers default to 0 so a field gameplay hasn't added yet stays harmless. Section 4 is JSON text per key, for the structured HUD state.
  const num = v => (typeof v === 'number' && isFinite(v) ? v : 0), ceil = v => Math.ceil(num(v)), round = v => Math.round(num(v));
  const JSON_KEYS = ['bosses', 'boons', 'event', 'votes'];
  const r2 = v => Math.round(num(v) * 100) / 100, r1 = v => Math.round(num(v) * 10) / 10;
  function jsonPart(s, key) {
    const v = s[key];
    if (key === 'bosses') return JSON.stringify((v || []).map(b => ({ kind: b.kind, name: b.name, x: round(b.x), y: round(b.y), r: b.r, at: r1(b.at), up: !!b.up, id: b.id || 0 })));
    if (key === 'boons') return JSON.stringify((v || []).map(o => { const out = {}; for (const k in o) if (o[k] > 0) out[k] = Math.ceil(o[k]); return out; }));
    if (key === 'event') return v ? JSON.stringify({ kind: v.kind, phase: v.phase, t: r1(v.t), total: r1(v.total), x: round(v.x), y: round(v.y), r: v.r, prog: (v.prog || [0, 0]).map(r2), hp: round(v.hp), i: v.i || 0, winner: v.winner === undefined ? -1 : v.winner }) : 'null';
    if (key === 'votes') return JSON.stringify((v || []).map(o => o ? { yes: o.yes, no: o.no, t: r1(o.t) } : null));
    return JSON.stringify(v === undefined ? null : v);
  }
  function slowFlat(s) {
    const fund = s.fund || [0, 0], rein = s.reinforceAt || [0, 0], fog = s.fog || [1, 1];
    return [
      [[Math.round(s.hope * 10), s.hopeTeam, s.kills[0], s.kills[1], Math.round(s.bossAt), s.bossUp ? 1 : 0, s.buff[0], s.buff[1], s.wave, s.over ? s.over.winner + 1 : 0, s.over ? Math.round(s.over.t * 10) : 0, s.over && s.over.surrender ? 1 : 0, round(s.eventAt), num(fund[0]), num(fund[1]), Math.ceil(num(rein[0])), Math.ceil(num(rein[1])), Math.round(num(fog[0]) * 100), Math.round(num(fog[1]) * 100)]],
      s.champs.map(c => [c.lvl, Math.round(c.xp), Math.floor(c.gold), Math.round(c.maxHp), Math.round(c.msBase), Math.ceil(c.respawn), itemCode(c.items[0]), itemCode(c.items[1]), itemCode(c.items[2]), itemCode(c.items[3]), itemCode(c.items[4]), c.evolved[0] + 1, c.evolved[1] + 1, c.beacons, Math.ceil(c.beaconT), c.streak, Math.round(c.armor), c.stats.kills, c.stats.deaths, c.stats.assists, c.stats.casts, c.stats.skillHits, c.stats.parries, Math.round(c.stats.dmg), c.as * 1000 | 0, round(c.bounty), ceil(c.buybackCd), ceil(c.potT), ceil(c.elixT), ceil(c.tonicT), ceil(c.sentT), ceil(c.wlT), round(c.stats.dealt), round(c.stats.taken), round(c.stats.healing), round(c.stats.gold), num(c.stats.towers), num(c.stats.objectives), num(c.stats.rescues), ...EXTRA_STATS.map(k => Math.round(c.stats[k] || 0))]),
      s.towers.map(t => [Math.ceil(t.hp), t.alive ? 1 : 0]),
      s.sites.map(z => [z.alive ? 1 : 0]),
      [JSON_KEYS.map(k => jsonPart(s, k))],
    ];
  }
  function slowDiff(prev, cur) {
    const out = [];
    cur.forEach((sec, a) => sec.forEach((row, b) => row.forEach((v, c) => { if (!prev || prev[a][b][c] !== v) out.push(a, b, c, v); })));
    return out;
  }
  const itemCode = id => (id && ITEM_BY[id] ? ITEM_BY[id].i + 1 : 0), setItem = i => (c, v) => { c.items[i] = v ? ITEMS[v - 1].id : null; c.dirtyKit = 1; };
  const G_FIELDS = [(s, v) => { s.hope = v / 10; }, (s, v) => { s.hopeTeam = v; }, (s, v) => { s.kills[0] = v; }, (s, v) => { s.kills[1] = v; }, (s, v) => { s.bossAt = v; }, (s, v) => { s.bossUp = !!v; }, (s, v) => { s.buff[0] = v; }, (s, v) => { s.buff[1] = v; }, (s, v) => { s.wave = v; }, (s, v) => { s.over = v ? Object.assign(s.over || { t: 0 }, { winner: v - 1 }) : null; }, (s, v) => { if (s.over) s.over.t = v / 10; }, (s, v) => { if (s.over) s.over.surrender = !!v; }, (s, v) => { s.eventAt = v; }, (s, v) => { (s.fund || (s.fund = [0, 0]))[0] = v; }, (s, v) => { (s.fund || (s.fund = [0, 0]))[1] = v; }, (s, v) => { (s.reinforceAt || (s.reinforceAt = [0, 0]))[0] = v; }, (s, v) => { (s.reinforceAt || (s.reinforceAt = [0, 0]))[1] = v; }, (s, v) => { (s.fog || (s.fog = [1, 1]))[0] = v / 100; }, (s, v) => { (s.fog || (s.fog = [1, 1]))[1] = v / 100; }];
  const stat = k => (c, v) => { c.stats[k] = v; }, plain = k => (c, v) => { c[k] = v; };
  const C_FIELDS = [plain('lvl'), plain('xp'), plain('gold'), plain('maxHp'), plain('msBase'), plain('respawn'), setItem(0), setItem(1), setItem(2), setItem(3), setItem(4), (c, v) => { c.evolved[0] = v - 1; c.dirtyKit = 1; }, (c, v) => { c.evolved[1] = v - 1; c.dirtyKit = 1; }, plain('beacons'), plain('beaconT'), plain('streak'), plain('armor'), stat('kills'), stat('deaths'), stat('assists'), stat('casts'), stat('skillHits'), stat('parries'), stat('dmg'), (c, v) => { c.as = v / 1000; }, plain('bounty'), plain('buybackCd'), plain('potT'), plain('elixT'), plain('tonicT'), plain('sentT'), plain('wlT'), stat('dealt'), stat('taken'), stat('healing'), stat('gold'), stat('towers'), stat('objectives'), stat('rescues'), ...EXTRA_STATS.map(stat)];
  function applySlow(s, d) {
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i], b = d[i + 1], c = d[i + 2], v = d[i + 3];
      try {
        if (a === 0) G_FIELDS[c](s, v);
        else if (a === 1) C_FIELDS[c](s.champs[b], v);
        else if (a === 2) { if (c === 0) s.towers[b].hp = v; else s.towers[b].alive = !!v; }
        else if (a === 3) s.sites[b].alive = !!v;
        else if (a === 4) {
          const key = JSON_KEYS[c], val = JSON.parse(v);
          if (key === 'event') {
            // Keep a moving event's drawn position smooth between these 5 Hz updates.
            const old = s.event;
            if (val && old && old.kind === val.kind) { val.tx = val.x; val.ty = val.y; val.x = old.x; val.y = old.y; }
            else if (val) { val.tx = val.x; val.ty = val.y; }
          }
          s[key] = val;
        }
      } catch (e) { if (typeof console !== 'undefined') console.error('slow', a, b, c, e); }
    }
    for (const c of s.champs) if (c.dirtyKit) { c.dirtyKit = 0; refreshChamp(c); }
  }

  // Events, as short arrays. Position fields are rounded; everything else is passed as is.
  const EV_KEYS = { strike: ['u', 'x', 'y'], hit: ['u', 'a', 'sk', 'crit', 'by'], heal: ['u', 'a'], die: ['u', 'kind', 'x', 'y', 'by'], gold: ['u', 'a'], boom: ['x', 'y', 'r', 'fx', 'x2', 'y2'], phit: ['x', 'y', 'fx'], blink: ['x', 'y'], parry: ['u'], cast: ['u', 'fx', 'dx', 'dy', 'slot', 'charge'], fire: ['u', 'fx', 'dx', 'dy'], root: ['u'], knock: ['u'], poly: ['u'], curse: ['u', 'n'], shield: ['u', 'a'], stealth: ['u', 'on'], ping: ['u', 'kind', 'x', 'y', 'team'], evolve: ['u', 'tier', 'choice'], buy: ['u', 'id'], sell: ['u', 'id'], beacon: ['u', 'x', 'y', 'team'], bhit: ['x', 'y', 'team'], level: ['u'], tower: ['team', 'sub'], bossup: ['kind'], boss: ['team', 'kind'], feed: ['a', 'b', 'multi', 'first', 'bounty'], spawn: ['u'], tshot: ['u', 't', 'n'], cancelled: ['u'], stun: ['u'], mark: ['u'], forge: ['u', 'track'], atk: ['u', 't'], matk: ['u'], civ: ['team', 'x', 'y', 'id', 'n'], hope: ['team', 'on'], recap: ['u', 'list', 'total'], mapevent: ['kind', 'phase', 'team', 'x', 'y'], fund: ['u', 'team', 'a'], reinforce: ['u', 'team', 'lane'], buyback: ['u'], surrender: ['team', 'phase', 'yes', 'no', 'need'], consume: ['u', 'id'], boon: ['team', 'kind', 'on'], hl: ['kind', 'u', 'x', 'y', 'n', 'v', 'b'] };
  const EV_NAMES = Object.keys(EV_KEYS), EV_IDX = {}; EV_NAMES.forEach((n, i) => { EV_IDX[n] = i; });
  const EV_ROUND = { x: 1, y: 1, x2: 1, y2: 1, dx: 100, dy: 100 };
  function packEvent(e) {
    const i = EV_IDX[e.e]; if (i === undefined) return e;
    const keys = EV_KEYS[e.e], out = [i];
    for (const k of keys) { let v = e[k]; if (v === undefined) v = null; else if (EV_ROUND[k]) v = Math.round(v * EV_ROUND[k]) / EV_ROUND[k]; else if (v === false) v = 0; else if (v === true) v = 1; out.push(v); }
    while (out.length > 1 && out[out.length - 1] === null) out.pop();
    return out;
  }
  function unpackEvent(a) {
    if (!Array.isArray(a)) return a;
    const name = EV_NAMES[a[0]], keys = EV_KEYS[name], e = { e: name };
    keys.forEach((k, j) => { const v = a[j + 1]; if (v !== undefined && v !== null) e[k] = v; });
    return e;
  }

  // One tick of the guest's own coin: the same walking as the host, then predicted basic attacks.
  function predict(s, c) {
    c.px = c.x; c.py = c.y;
    if (!c.alive) return;
    if (c.lock > 0) c.lock -= DT;
    if (c.atkCd > 0) c.atkCd -= DT;
    for (let i = 0; i < 3; i++) { if (c.cd[i] > 0) c.cd[i] -= DT; if (c.recast[i] > 0) c.recast[i] -= DT; }
    if (c.charge) c.charge.t += DT;
    if (c.pdash) {
      const D = c.pdash, st = Math.min(DT, D.t); c.x += D.vx * st; c.y += D.vy * st; D.t -= DT; if (D.t <= 0) c.pdash = null; pushOut(s.map, c);
    } else if (c.stunT <= 0 && c.lock <= 0 && c.rootT <= 0 && !c.air && !c.chan && !c.dash) walk(s, c);
    towerPush(s, c);
    if (c.atk && c.stunT <= 0 && !c.air && !c.dash && !c.pdash && !c.chan && !c.charge && c.atkCd <= 0) {
      const t = autoTarget(s, c);
      if (t) { c.atkCd = 1 / (c.as * (1 + (c.asBonus || 0))); c.lock = .13; const n = norm(t.x - c.x, t.y - c.y); c.fx = n.x; c.fy = n.y; }
    }
    c.vx = (c.x - c.px) / DT; c.vy = (c.y - c.py) / DT;
  }

