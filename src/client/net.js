// Online play over WebRTC with PeerJS. The host runs the Sim; the guest rebuilds `s` from snapshots.
//   reliable channel (PeerJS, JSON): lobby, commands, events, slow-state deltas
//   unreliable channel (our own, binary): 20 Hz snapshots, stick input, ping
const Net = (() => {
  const PREFIX = 'flipside3-', PROTOCOL = 1, ALPHA = '23456789ABCDEFGHJKMNPQRSTVWXYZ', CODE_LEN = 5;
  const T = { signal: 12000, connect: 20000, hello: 8000, lostHost: 20000, lostFriend: 20000, away: 4000, stall: 1500, ping: 1000, retry: 5 };
  const MSG = {
    server: "Can't reach the matchmaking server. Check your internet, wait a minute and try again.",
    code: "No game with that code. Check the code, or ask your friend for a new one.",
    badCode: 'That code does not look right. It should be 5 letters and numbers.',
    busy: "That room is already full. Ask your friend to start a new one.",
    direct: "Couldn't link your two devices. Some Wi-Fi and mobile networks block direct connections: try both on the same Wi-Fi, or one on mobile data.",
    version: 'Your friend is on a different version of the game. Both refresh the page and try again.',
    browser: "This browser can't play online. Try a recent Chrome, Safari or Firefox.",
    room: "Couldn't start a room right now. Please try again.",
  };
  const FAST = { label: 'flipside-fast', negotiated: true, id: 42, ordered: false, maxRetransmits: 0 };

  const api = { role: null, code: null, connected: false, ping: 0, stalled: false, away: false, stats: null, _fault: null, on, off, host, join, leave, send, flip, start, attach, hostBefore, hostAfter, guestFrame, hiddenPump };
  const listeners = Object.create(null);
  function on(type, fn) { const l = listeners[type] || (listeners[type] = []); if (!l.includes(fn)) l.push(fn); }
  function off(type, fn) { const l = listeners[type]; if (l && l.includes(fn)) l.splice(l.indexOf(fn), 1); }
  function emit(type, ...a) { (listeners[type] || []).slice().forEach(f => { try { f(...a); } catch (e) { console.error(e); } }); }

  let session = 0, peer = null, conn = null, fast = null, fastUp = false, phase = 'idle', timer = 0, beat = 0, lastHeard = 0, pingStart = 0, tries = 0;
  const later = fn => setTimeout(fn, 0);
  function arm(ms, fn) { clearTimeout(timer); timer = setTimeout(fn, ms); }
  function disarm() { clearTimeout(timer); timer = 0; }
  function freshStats() { return { snapsOut: 0, snapsIn: 0, bytesOut: 0, bytesIn: 0, maxSnap: 0, lateDrop: 0, snapErrs: 0, underflow: 0, snapCorr: 0, maxErr: 0, cmdsOut: 0, errN: 0, errSum: 0, err30: 0, cmdsIn: 0, inputsIn: 0, inputGaps: 0, evOut: 0, evIn: 0, evApplied: 0, evDropped: 0, fallbackFast: 0 }; }

  // ---------- plumbing ----------
  function peerOptions() { try { const raw = localStorage.getItem('flipside.peer'); if (raw) return JSON.parse(raw); } catch (e) { } return {}; }
  function newCode() { let c = ''; const r = new Uint32Array(CODE_LEN); crypto.getRandomValues(r); for (let i = 0; i < CODE_LEN; i++) c += ALPHA[r[i] % ALPHA.length]; return c; }
  function teardown() {
    disarm(); clearInterval(beat); beat = 0; session++;
    if (fast) { try { fast.onmessage = fast.onopen = fast.onclose = fast.onerror = null; fast.close(); } catch (e) { } }
    if (conn) { try { conn.close(); } catch (e) { } }
    if (peer) { try { peer.destroy(); } catch (e) { } }
    peer = conn = fast = null; fastUp = false; api.connected = false; api.ping = 0; api.stalled = false; api.away = false; phase = 'idle';
  }
  function fail(message) { teardown(); api.role = null; api.code = null; emit('error', message); }
  function leave() { sendRel(['B']); teardown(); stopMatchLinks(); api.role = null; api.code = null; }
  function peerError(sid, err) {
    if (sid !== session) return;
    const type = err && err.type;
    if (api.connected) return; // the broker is only needed to find each other, so errors there can't hurt a live link
    if (type === 'unavailable-id' && api.role === 'host') { if (++tries < T.retry) { const r = api.role; teardown(); api.role = r; openRoom(); } else fail(MSG.room); return; }
    if (type === 'peer-unavailable') { fail(MSG.code); return; }
    if (type === 'browser-incompatible' || type === 'unsupported') { fail(MSG.browser); return; }
    if (phase === 'link' || phase === 'hello') { fail(MSG.direct); return; }
    fail(MSG.server);
  }
  function makePeer(id) {
    if (typeof Peer === 'undefined' || !window.RTCPeerConnection) { later(() => fail(MSG.browser)); return null; }
    try { return id ? new Peer(id, peerOptions()) : new Peer(peerOptions()); }
    catch (e) { later(() => fail(MSG.browser)); return null; }
  }
  // A dropped broker socket doesn't matter once linked; while waiting for a friend, reconnect so the code stays valid.
  function watchSignal(sid, p) {
    p.on('error', e => peerError(sid, e));
    p.on('disconnected', () => { if (sid === session && !api.connected && !p.destroyed && phase === 'room') setTimeout(() => { if (sid === session && p.disconnected && !p.destroyed) try { p.reconnect(); } catch (e) { } }, 1500); });
  }

  function witness(st, b) { let h = st.h || 0; const j = JSON.stringify(b); for (let i = 0; i < j.length; i++) h = Math.imul(h ^ j.charCodeAt(i), 16777619); st.h = h >>> 0; st.hn = (st.hn || 0) + 1; (st.hlog || (st.hlog = {}))[st.hn] = st.h; }

  // ---------- starting a session ----------
  function host() {
    teardown(); api.role = 'host'; tries = 0; api.stats = freshStats(); openRoom();
  }
  function openRoom() {
    const code = newCode(), sid = session, p = makePeer(PREFIX + code); if (!p) return;
    peer = p; api.code = code; phase = 'signal';
    arm(T.signal, () => { if (sid === session) fail(MSG.server); });
    watchSignal(sid, p);
    p.on('open', () => { if (sid !== session) return; disarm(); phase = 'room'; emit('open', code); });
    p.on('connection', c => {
      if (sid !== session) return;
      if ((conn && conn.open) || (G && G.net && !G.ended)) { c.on('open', () => { try { c.send(['X', 'full']); } catch (e) { } setTimeout(() => c.close(), 1800); }); return; }
      conn = c; phase = 'link'; wireConn(sid, c);
      arm(T.connect, () => { if (sid === session && !api.connected) dropGuestAttempt(); });
    });
  }
  // A joiner that never finishes linking must not wedge the room.
  function dropGuestAttempt() { const c = conn; conn = null; phase = 'room'; if (c) try { c.close(); } catch (e) { } if (fast) { try { fast.close(); } catch (e) { } fast = null; fastUp = false; } }
  function join(raw) {
    teardown(); api.stats = freshStats();
    const code = String(raw || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (code.length !== CODE_LEN || [...code].some(ch => !ALPHA.includes(ch))) { later(() => emit('error', MSG.badCode)); return; }
    api.role = 'guest'; api.code = code; phase = 'signal';
    const sid = session, p = makePeer(); if (!p) return; peer = p;
    arm(T.signal, () => { if (sid === session) fail(MSG.server); });
    watchSignal(sid, p);
    p.on('open', () => {
      if (sid !== session) return;
      phase = 'link';
      arm(T.connect, () => { if (sid === session && !api.connected) fail(MSG.direct); });
      const c = p.connect(PREFIX + code, { reliable: true, serialization: 'json', label: 'flipside' }); conn = c; wireConn(sid, c);
    });
  }
  function wireConn(sid, c) {
    c.on('open', () => {
      if (sid !== session || c !== conn) return;
      lastHeard = performance.now(); phase = 'hello';
      openFast(sid, c);
      if (api.role === 'guest') { sendRel(['H', PROTOCOL]); arm(T.hello, () => { if (sid === session && !api.connected) fail(MSG.direct); }); }
      else arm(T.hello, () => { if (sid === session && !api.connected) dropGuestAttempt(); });
    });
    c.on('data', m => { if (sid !== session || c !== conn) return; const f = api._fault; if (f && f.black) (f.inq = f.inq || []).push(m); else onReliable(m); });
    c.on('close', () => { if (sid === session && c === conn) closed(); });
    c.on('error', () => { if (sid === session && c === conn && !api.connected) { if (api.role === 'guest') fail(MSG.direct); else dropGuestAttempt(); } });
  }
  function openFast(sid, c) {
    try {
      fast = c.peerConnection.createDataChannel(FAST.label, FAST);
      fast.binaryType = 'arraybuffer';
      fast.onopen = () => { if (sid === session) fastUp = true; };
      fast.onclose = () => { if (sid === session) fastUp = false; };
      fast.onerror = () => { };
      fast.onmessage = e => { if (sid !== session) return; if (!(api._fault && api._fault.black)) onFast(e.data); };
    } catch (e) { fast = null; }
  }
  function linked() {
    disarm(); api.connected = true; phase = 'live'; lastHeard = performance.now();
    clearInterval(beat); beat = setInterval(heartbeat, T.ping);
    emit('peer');
  }

  // ---------- sending, with fault injection for tests ----------
  let relClock = 0;
  // Test-only delay line: FIFO so added latency can't reorder the reliable channel.
  const relq = []; let relBusy = false;
  function pumpRel() { if (relBusy || !relq.length) return; relBusy = true; setTimeout(() => { relBusy = false; const now = performance.now(); while (relq.length && relq[0].at <= now + 1) { const r = relq.shift(); if (r.c.open && r.c === conn) try { r.c.send(r.m); } catch (e) { } } pumpRel(); }, Math.max(0, relq[0].at - performance.now())); }
  function sendRel(m) {
    const f = api._fault;
    if (f && f.black) { (f.outq = f.outq || []).push(m); return; }
    if (!conn || !conn.open) return;
    const c = conn;
    if (f && f.lat) { relq.push({ m, at: Math.max(relClock, performance.now() + f.lat + Math.random() * (f.jit || 0)), c }); relClock = relq[relq.length - 1].at; pumpRel(); return; }
    try { c.send(m); } catch (e) { }
  }
  function sendFast(buf) {
    const f = api._fault, st = api.stats;
    if (f && f.black) return;
    if (fastUp && fast && fast.readyState === 'open') {
      st.bytesOut += buf.byteLength;
      if (f) { if (Math.random() < (f.loss || 0)) return; if (f.lat || f.jit) { const ch = fast; setTimeout(() => { if (ch.readyState === 'open') try { ch.send(buf); } catch (e) { } }, (f.lat || 0) + Math.random() * (f.jit || 0)); return; } }
      try { fast.send(buf); } catch (e) { }
      return;
    }
    // Our channel never opened (rare): carry it on the reliable one rather than fail.
    if (api.connected) { st.fallbackFast++; let bin = ''; new Uint8Array(buf).forEach(b => { bin += String.fromCharCode(b); }); sendRel(['f', btoa(bin)]); }
  }
  function send(type, obj) { if (type === 'lobby') sendRel(['L', obj]); }
  function flip(side) { if (api.role !== 'host') return; sendRel(['F', side]); later(() => emit('flip', { side })); }
  api._thaw = () => { const f = api._fault; if (!f) return; f.black = false; const a = f.outq || [], b = f.inq || []; f.outq = f.inq = null; a.forEach(sendRel); b.forEach(onReliable); };
  function start(cfg) { if (api.role !== 'host') return; if (cfg.seed === undefined) cfg.seed = Date.now() & 0xffffff; sendRel(['S', cfg]); later(() => emit('start', cfg)); }

  // ---------- receiving ----------
  function onReliable(m) {
    lastHeard = performance.now();
    if (!Array.isArray(m)) return;
    switch (m[0]) {
      case 'H': if (api.role === 'host' && !api.connected) { if (m[1] !== PROTOCOL) { sendRel(['X', 'version']); setTimeout(dropGuestAttempt, 400); return; } sendRel(['W', PROTOCOL]); linked(); } return;
      case 'W': if (api.role === 'guest' && !api.connected) { if (m[1] !== PROTOCOL) { fail(MSG.version); return; } linked(); } return;
      case 'X': if (!api.connected) fail(m[1] === 'full' ? MSG.busy : MSG.version); return;
      case 'L': emit('lobby', m[1]); return;
      case 'F': emit('flip', { side: m[1] }); return;
      case 'S': emit('start', m[1]); return;
      case 'B': closed(); return;
      case 'v': if (api.role === 'host') { guestVisible = !!m[1]; if (!guestVisible && !guestHiddenAt) guestHiddenAt = performance.now(); } return;
      case 'c': if (api.role === 'host') { api.stats.cmdsIn++; cmdq.push(m[1]); } return;
      case 's': if (api.role === 'guest') { if (G && G.net) Sim.applySlow(G.s, m[1]); else earlySlow.push(m[1]); } return;
      case 'e': if (api.role === 'guest') for (let i = 1; i < m.length; i++) { const batch = m[i]; api.stats.evIn += batch.length - 1; if (api._fault) witness(api.stats, batch); for (let j = 1; j < batch.length; j++) pending.push({ t: batch[0], e: Sim.unpackEvent(batch[j]) }); } return;
      case 'f': { const bin = atob(m[1]), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); onFast(a.buffer); return; }
    }
  }
  function onFast(buf) {
    lastHeard = performance.now(); const st = api.stats;
    if (!(buf instanceof ArrayBuffer) || !buf.byteLength) return;
    const type = new Uint8Array(buf)[0];
    st.bytesIn += buf.byteLength;
    if (type === 0xF3) { if (api.role === 'guest' && G && G.net) { let fr; try { fr = Sim.decodeSnapshot(buf); } catch (e) { st.snapErrs++; return; } if (fr) addFrame(fr); } return; }
    if (type === 1) { if (api.role === 'host') onInput(buf); return; }
    if (type === 2) { const a = new Uint8Array(buf); a[0] = 3; sendFast(a.buffer); return; }
    if (type === 3) { const rtt = performance.now() - pingStart; if (rtt >= 0 && rtt < 5000) api.ping = api.ping ? api.ping * .7 + rtt * .3 : rtt; return; }
  }

  function closed() {
    if (!api.connected && phase !== 'hello' && phase !== 'link') return;
    const wasConn = api.connected, role = api.role;
    if (role === 'host' && conn) { const c = conn; conn = null; try { c.close(); } catch (e) { } }
    if (role === 'guest') disarm();
    if (fast) { try { fast.close(); } catch (e) { } } fast = null; fastUp = false; api.connected = false; clearInterval(beat); beat = 0; phase = role === 'host' ? 'room' : 'idle';
    if (!wasConn) { if (role === 'guest') fail(MSG.direct); return; }
    gone(role === 'host' ? 'Your friend disconnected. A bot took over their seat.' : 'The host disconnected. The match is over.');
  }
  function gone(reason) {
    if (G && G.net && !G.ended) {
      if (api.role === 'host') { if (seatChamp()) Sim.setBot(G.s, seatChamp(), true); G.net.dead = true; }
      else { G.net.dead = true; }
    }
    stopMatchLinks();
    emit('lost', reason);
  }
  function heartbeat() {
    const now = performance.now(), st = api.stats;
    if (fastUp) { pingStart = now; const a = new Uint8Array(1); a[0] = 2; sendFast(a.buffer); }
    const quiet = now - lastHeard;
    if (quiet > (api.role === 'host' ? T.lostFriend : T.lostHost)) { closed(); return; }
    if (api.role === 'host' && G && G.net && !G.net.dead) syncAway(now);
  }
  // A screen lock can freeze a phone for a moment. Give it time to come back before giving up.
  document.addEventListener('visibilitychange', () => {
    if (!api.connected) return;
    const vis = !document.hidden;
    sendRel(['v', vis ? 1 : 0]);
    if (vis) { const now = performance.now(), lim = api.role === 'host' ? T.lostFriend : T.lostHost; if (now - lastHeard > lim - 6000) lastHeard = now - (lim - 6000); }
    if (api.role === 'guest' && G && G.net && vis) guestResume();
  });
  addEventListener('pagehide', e => { if (!e.persisted && api.connected) sendRel(['B']); });

  // ---------- match links, host side ----------
  let holdDebt = 0, seatIdx = -1, ack = 0, rxSeq = -1, inq = [], idleTicks = 0, rxAtk = false, rxAim = null, cmdq = [], awayBot = false, guestVisible = true, guestHiddenAt = 0, prevSlow = null, evq = [], worker = null, hiddenLast = 0;
  // ---------- match links, guest side ----------
  let short = false, frames = [], clockOff = null, delay = 3.2, pending = [], earlySlow = [], seq = 0, hist = [], ex = 0, ey = 0, srvX = 0, srvY = 0, srvDriven = false, reconcileHold = 0, pendCd = [0, 0, 0], pendRecast = [0, 0, 0], chargeLocal = 0, chargeBlock = 0, lastFrameAt = 0, inHist = [], aimSend = null, overShown = false;
  const nearer = (a, b) => ((a - b) & 0xffff) < 0x8000 && a !== b;

  function seatChamp() { return G && G.s.champs[seatIdx]; }
  function stopMatchLinks() {
    if (worker) { try { worker.terminate(); } catch (e) { } worker = null; }
  }
  function attach() {
    const s = G.s, role = G.net.role;
    seatIdx = s.champs.findIndex(c => c.remote);
    if (!api.stats) api.stats = freshStats();
    prevSlow = null; evq = []; inq = []; cmdq = []; rxSeq = -1; ack = 0; idleTicks = 0; rxAtk = false; rxAim = null; holdDebt = 0; awayBot = false; guestVisible = true; guestHiddenAt = 0;
    frames = []; clockOff = null; delay = 3.2; hist = []; ex = ey = 0; seq = 0; srvDriven = false; pendCd = [0, 0, 0]; pendRecast = [0, 0, 0]; chargeLocal = 0; chargeBlock = 0; lastFrameAt = 0; overShown = false;
    if (role === 'guest') { pending = []; for (const d of earlySlow) Sim.applySlow(s, d); earlySlow = []; }
    if (role === 'host') {
      prevSlow = Sim.slowFlat(s);
      try { const b = new Blob(['setInterval(()=>postMessage(0),33)'], { type: 'text/javascript' }); worker = new Worker(URL.createObjectURL(b)); worker.onmessage = () => hiddenPump(); }
      catch (e) { worker = null; hiddenTimer(); }
    }
  }
  function hiddenTimer() { setTimeout(() => { if (G && G.net && api.role === 'host') { hiddenPump(); hiddenTimer(); } }, 40); }
  // rAF stops in a hidden tab. Keep the host's simulation running for the friend.
  function hiddenPump() {
    if (!document.hidden || !G || !G.net || api.role !== 'host' || G.net.dead && !api.connected) { hiddenLast = 0; return; }
    const now = performance.now(), dt = hiddenLast ? Math.min(.25, (now - hiddenLast) / 1000) : DT; hiddenLast = now;
    if (!paused && G.intro > 0) { G.intro -= dt; return; }
    if (!G.outro && !G.ended && G.intro <= 0) stepMatch(dt);
  }

  function onInput(buf) {
    const d = new DataView(buf), st = api.stats;
    st.inputsIn++;
    const newest = d.getUint16(1, true), flags = d.getUint8(3), have = d.getUint8(4);
    if (rxSeq >= 0 && (newest === rxSeq || nearer(rxSeq, newest))) return; // late or duplicate
    if (flags & 2) { rxAim = { x: d.getInt16(5 + have * 2, true), y: d.getInt16(7 + have * 2, true) }; }
    rxAtk = !!(flags & 1);
    for (let i = have - 1; i >= 0; i--) {
      const q = (newest - i) & 0xffff;
      if (rxSeq >= 0 && !nearer(q, rxSeq)) continue;
      if (rxSeq >= 0 && i === have - 1 && q !== ((rxSeq + 1) & 0xffff) && nearer(q, (rxSeq + 1) & 0xffff)) st.inputGaps++;
      inq.push({ seq: q, x: clampMv(d.getInt8(5 + i * 2) / 100), y: clampMv(d.getInt8(6 + i * 2) / 100) });
      rxSeq = q;
    }
  }
  const clampMv = v => Math.max(-1, Math.min(1, isFinite(v) ? v : 0));
  function hostBefore() {
    const c = seatChamp(); if (!c || c.bot || !api.connected) return;
    if (inq.length > 6) inq.splice(0, inq.length - 2);
    // Hold the last stick through a short gap, then skip one input per held tick when the backlog arrives,
    // so the host walks exactly as many ticks as the guest predicted.
    if (inq.length) { if (holdDebt && inq.length > 1) { inq.shift(); holdDebt--; } const e = inq.shift(); c.mv.x = e.x; c.mv.y = e.y; ack = e.seq; idleTicks = 0; }
    else if (++idleTicks > 8) c.mv.x = c.mv.y = 0;
    else if (holdDebt < 5) holdDebt++;
    c.atk = rxAtk;
    if (rxAim && c.charge) c.q.push({ t: 'aim', tx: c.x + rxAim.x, ty: c.y + rxAim.y });
    rxAim = null;
    for (const m of cmdq) {
      const v = m && m[0], sl = (m && m[1]) | 0, ok = (x, y) => isFinite(x) && isFinite(y) && Math.abs(x) < 8000 && Math.abs(y) < 8000;
      if (v === 0 && sl >= 0 && sl <= 2 && ok(m[2], m[3])) c.q.push({ t: 'cast', slot: sl, tx: c.x + m[2], ty: c.y + m[3] });
      else if (v === 1 && sl >= 0 && sl <= 2) c.q.push({ t: 'charge', slot: sl });
      else if (v === 2) c.q.push({ t: 'cancel' });
      else if (v === 3) c.q.push({ t: 'recall' });
      else if (v === 4 && ['edge', 'guard', 'haste'].includes(m[1])) c.q.push({ t: 'forge', track: m[1] });
    }
    cmdq.length = 0;
  }
  function hostAfter() {
    const s = G.s, st = api.stats;
    if (!api.connected) return;
    if (s.ev.length) { const b = [s.tick]; for (const e of s.ev) b.push(Sim.packEvent(e)); st.evOut += s.ev.length; evq.push(b); if (api._fault) witness(st, b); }
    if (s.tick % 3 !== 0 || s.over) {
      if (evq.length) { sendRel(['e', ...evq]); evq = []; }
      const buf = Sim.snapshot(s, seatIdx, ack);
      st.snapsOut++; st.maxSnap = Math.max(st.maxSnap, buf.byteLength);
      sendFast(buf);
    }
    if (s.tick % 6 === 0 || s.over) {
      const cur = Sim.slowFlat(s), d = Sim.slowDiff(prevSlow, cur); prevSlow = cur;
      if (d.length) sendRel(['s', d]);
    }
  }
  // Friend's tab is hidden or their phone is locked: a bot holds the seat until they're back.
  function syncAway(now) {
    if (guestVisible) guestHiddenAt = 0;
    if (G.intro > 0) return; // a slow phone still painting the map is not gone
    const shouldAway = now - lastHeard > T.away || (guestHiddenAt && now - guestHiddenAt > T.away);
    const c = seatChamp(); if (!c || c.remote === false || G.s.over) return;
    if (shouldAway !== awayBot) { awayBot = shouldAway; api.away = shouldAway; Sim.setBot(G.s, c, shouldAway); inq = []; cmdq = []; emit('away', shouldAway); }
  }

  // ---------- guest ----------
  function addFrame(fr) {
    const st = api.stats, now = performance.now(), ticks = now * .03;
    st.snapsIn++;
    if (frames.length && fr.tick <= frames[0].tick) { st.lateDrop++; return; }
    let i = frames.length; while (i > 0 && frames[i - 1].tick > fr.tick) i--;
    frames.splice(i, 0, fr);
    while (frames.length > 40) frames.shift();
    const est = fr.tick - ticks;
    if (clockOff === null || Math.abs(est - clockOff) > 36) clockOff = est;
    else clockOff += (est - clockOff) * (est > clockOff ? .12 : .02);
    lastFrameAt = now;
    if (fr === frames[frames.length - 1]) ownFrame(fr, now);
  }
  function ownFrame(fr, now) {
    const s = G.s, me = G.me, a = fr.champs[seatIdx], own = fr.own; if (!a || !own) return;
    const keepFx = me.fx, keepFy = me.fy, pch = me.charge, keepDash = me.dash, wasAlive = me.alive;
    Sim.applyChampState(me, a);
    me.fx = keepFx; me.fy = keepFy;
    srvDriven = !!(a.fl & 4) && !me.pdash || !me.alive || !!me.air || !!me.leap;
    if (me.pdash) me.dash = keepDash || { net: true };
    me.slowA = own.slowA;
    // Own charge: trust the local one until the host has had time to answer.
    const srvCh = me.charge;
    if (chargeLocal) { if (srvCh) { me.charge = pch || srvCh; chargeLocal = 0; } else if (now < chargeLocal) me.charge = pch; else { chargeLocal = 0; me.charge = null; } }
    else if (srvCh && now < chargeBlock) me.charge = null;
    else if (srvCh && pch) me.charge = pch;
    for (let i = 0; i < 3; i++) {
      if (pendCd[i]) { if (own.cd[i] > 0 || now > pendCd[i]) { pendCd[i] = 0; me.cd[i] = own.cd[i]; } } else me.cd[i] = own.cd[i];
      if (pendRecast[i]) { if (now > pendRecast[i]) { pendRecast[i] = 0; me.recast[i] = own.recast[i]; } } else me.recast[i] = own.recast[i];
    }
    if (own.atkCd > me.atkCd + .25) me.atkCd = own.atkCd;
    srvX = a.x; srvY = a.y;
    if (wasAlive && !me.alive) { me.pdash = null; pendCd = [0, 0, 0]; me.charge = null; }
    // Reconcile: compare where we said we were at the tick the host just acknowledged.
    if (!hist.length || !me.alive) { if (!me.alive) { me.x = me.px = a.x; me.y = me.py = a.y; hist = []; } return; }
    if (srvDriven || me.pdash || now < reconcileHold) { while (hist.length && nearer(fr.ack, hist[0].s)) hist.shift(); return; }
    let i = hist.findIndex(h => h.s === fr.ack);
    if (i < 0) { if (hist.length > 90) hist = []; return; }
    hist.splice(0, i);
    const h = hist[0], ex_ = a.x - h.x, ey_ = a.y - h.y, e = Math.hypot(ex_, ey_), st = api.stats;
    st.maxErr = Math.max(st.maxErr, e); st.errN++; st.errSum += e; if (e > 30) st.err30++;
    if (e > 220) { st.snapCorr++; const dx = ex_, dy = ey_; me.x += dx; me.y += dy; me.px = me.x; me.py = me.y; for (const q of hist) { q.x += dx; q.y += dy; } ex = ey = 0; return; }
    if (e < 4) ex = ey = 0; else { ex = ex_; ey = ey_; }
  }
  function guestResume() { hist = []; ex = ey = 0; frames.splice(0, Math.max(0, frames.length - 3)); }

  function guestTick() {
    const s = G.s, me = G.me, now = performance.now();
    applyInput();
    drainQueue(now);
    if (now - lastFrameAt > 500 || !frames.length) { me.mv.x = me.mv.y = 0; me.atk = false; }
    if (srvDriven || !me.alive) {
      me.px = me.x; me.py = me.y;
      if (me.alive || frames.length) { me.x += (srvX - me.x) * (Math.hypot(srvX - me.x, srvY - me.y) > 600 ? 1 : .4); me.y += (srvY - me.y) * (Math.hypot(srvX - me.x, srvY - me.y) > 600 ? 1 : .4); }
      me.vx = (me.x - me.px) / DT; me.vy = (me.y - me.py) / DT;
      // cooldown displays keep counting while the host owns the coin
      for (let i = 0; i < 3; i++) { if (me.cd[i] > 0) me.cd[i] -= DT; if (me.recast[i] > 0) me.recast[i] -= DT; } if (me.charge) me.charge.t += DT;
    } else {
      Sim.predict(s, me);
      if (ex || ey) {
        const e = Math.hypot(ex, ey), k = Math.min(.14, 8 / Math.max(e, 1)), dx = ex * k, dy = ey * k;
        me.x += dx; me.y += dy; ex -= dx; ey -= dy; for (const q of hist) { q.x += dx; q.y += dy; }
        if (Math.hypot(ex, ey) < .5) ex = ey = 0;
      }
    }
    seq = (seq + 1) & 0xffff; hist.push({ s: seq, x: me.x, y: me.y }); if (hist.length > 120) hist.shift();
    inHist.push(Math.round(me.mv.x * 100), Math.round(me.mv.y * 100)); if (inHist.length > 6) inHist.splice(0, inHist.length - 6);
    sendInput(me);
  }
  function sendInput(me) {
    const n = inHist.length / 2, b = new DataView(new ArrayBuffer(9 + n * 2)); b.setUint8(0, 1); b.setUint16(1, seq, true);
    let fl = me.atk ? 1 : 0; if (aimSend) fl |= 2;
    b.setUint8(3, fl); b.setUint8(4, n);
    for (let i = 0; i < n; i++) { b.setInt8(5 + i * 2, inHist[inHist.length - 2 - i * 2]); b.setInt8(6 + i * 2, inHist[inHist.length - 1 - i * 2]); }
    if (aimSend) { b.setInt16(5 + n * 2, aimSend.x, true); b.setInt16(7 + n * 2, aimSend.y, true); aimSend = null; }
    sendFast(b.buffer);
  }
  function sendCmd(c) { api.stats.cmdsOut++; sendRel(['c', c]); }
  function canAct(me, a, slot) { return me.alive && me.stunT <= 0 && !me.air && !me.chan && !me.dash && !me.pdash && a && !(slot === 2 && me.lvl < 3); }
  function drainQueue(now) {
    const me = G.me, wait = api.ping + 350;
    while (me.q.length) {
      const q = me.q.shift();
      if (q.t === 'cast') {
        const a = me.kit[q.slot], dx = q.tx - me.x, dy = q.ty - me.y, recast = a && a.recast && me.recast[q.slot] > 0;
        if (me.charge && me.charge.slot === q.slot) { me.charge = null; chargeLocal = 0; chargeBlock = now + wait; }
        if (a && canAct(me, a, q.slot) && (recast || me.cd[q.slot] <= 0)) {
          const pd = recast ? a.pdr : a.pd, l = Math.hypot(dx, dy) || 1, ndx = l > 1 ? dx / l : me.fx, ndy = l > 1 ? dy / l : me.fy;
          if (pd) { const reach = Math.max(0, Math.min(pd[0], Sim.rayWall(me.x, me.y, ndx, ndy, pd[0] + me.r) - me.r)); me.pdash = { vx: ndx * pd[1], vy: ndy * pd[1], t: reach / pd[1] }; me.dash = me.dash || { net: true }; reconcileHold = now + wait + 250; }
          if (recast) { me.recast[q.slot] = 0; pendRecast[q.slot] = now + wait; }
          else { me.cd[q.slot] = q.slot === 1 && me.champ === 'kade' ? a.cd : a.cd * (1 - me.up.haste * .08); pendCd[q.slot] = now + wait; }
          me.fx = ndx; me.fy = ndy;
        }
        sendCmd([0, q.slot, Math.round(dx), Math.round(dy)]);
      } else if (q.t === 'charge') {
        if (me.alive && me.cd[q.slot] <= 0 && me.stunT <= 0 && !me.chan && !me.air) { me.charge = { slot: q.slot, t: 0, dx: me.fx, dy: me.fy }; chargeLocal = now + wait + 200; }
        sendCmd([1, q.slot]);
      } else if (q.t === 'aim') {
        if (me.charge) { const n = Math.hypot(q.tx - me.x, q.ty - me.y) || 1; me.charge.dx = (q.tx - me.x) / n; me.charge.dy = (q.ty - me.y) / n; me.fx = me.charge.dx; me.fy = me.charge.dy; }
        aimSend = { x: Math.max(-30000, Math.min(30000, Math.round(q.tx - me.x))), y: Math.max(-30000, Math.min(30000, Math.round(q.ty - me.y))) };
      } else if (q.t === 'cancel') {
        if (me.charge) { me.charge = null; chargeLocal = 0; chargeBlock = now + wait; }
        sendCmd([2]);
      } else if (q.t === 'recall') sendCmd([3]);
      else if (q.t === 'forge') sendCmd([4, q.track]);
    }
  }

  // The event queue is only visible to the player as it plays out, so time it with the interpolated world.
  const COSMETIC = new Set(['hit', 'heal', 'gold', 'phit', 'boom', 'blink', 'parry', 'cast', 'tshot', 'cancelled', 'stun', 'mark', 'atk', 'matk']);
  function playEvent(e) { const st = api.stats; st.evApplied++; fxEvent(e); uiEvent(e); soundEvent(e); }
  function releaseEvents(rt) {
    const me = G.me, st = api.stats;
    for (let i = 0; i < pending.length; i++) {
      const p = pending[i], mine = p.e.u === me.id || p.e.by === me.id;
      if (!(mine || p.t <= rt + .5)) continue;
      pending.splice(i, 1); i--;
      if (rt - p.t > 36 && COSMETIC.has(p.e.e)) { st.evDropped++; continue; }
      playEvent(p.e);
    }
    if (pending.length > 2000) { const before = pending.length; pending = pending.filter(p => !COSMETIC.has(p.e.e)); st.evDropped += before - pending.length; }
  }

  function guestFrame(dt, frameNow) {
    if (!G.net || G.net.dead) return;
    const s = G.s, now = frameNow || performance.now(), st = api.stats;
    G.acc += dt; let n = 0;
    while (G.acc >= DT && n++ < 8) { guestTick(); G.acc -= DT; }
    if (n >= 8) G.acc = 0;
    if (frames.length) {
      let rt = now * .03 + clockOff - delay, i = frames.length - 1;
      const newest = frames[i].tick;
      if (rt >= newest) { st.underflow++; if (!short) { short = true; delay = Math.min(9, delay + .7); } } else { short = false; delay = Math.max(3.2, delay - .008); }
      st.delay = delay;
      rt = Math.min(rt, newest + 3);
      while (i > 0 && frames[i].tick > rt) i--;
      const A = frames[i], B = frames[i + 1] || null;
      if (B) {
        Sim.applyFrame(s, A, B, Math.min(1.8, (rt - A.tick) / (B.tick - A.tick)), seatIdx);
      } else if (i > 0) {
        const P = frames[i - 1], span = A.tick - P.tick;
        Sim.applyFrame(s, P, A, 1 + Math.min(.8, (rt - A.tick) / span), seatIdx);
      } else Sim.applyFrame(s, A, null, 0, seatIdx);
      if (i > 2) frames.splice(0, i - 2);
      releaseEvents(rt);
    }
    if (now - lastFrameAt > T.stall && frames.length && !document.hidden) { if (!api.stalled) { api.stalled = true; emit('stall', true); } }
    else if (api.stalled) { api.stalled = false; emit('stall', false); }
    if (s.over && !overShown && !G.outro) {
      overShown = true; G.s.ev.length = 0;
      for (const p of pending.splice(0)) playEvent(p.e);
      const core = s.towers.find(t => t.sub === 'core' && !t.alive) || s.towers.find(t => t.sub === 'core');
      G.outro = { t: 0, x: core.x, y: core.y }; outroStart();
    }
  }
  window.__fnet = { Net: api, startMatch: (cfg, net) => startMatch(cfg, net), g: () => G, ctl: () => Ctl };
  return api;
})();
