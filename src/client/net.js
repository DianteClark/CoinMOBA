// ============================================================================================
// NET API (agreed with UI; this block is the contract, kept current by Netcode)
//
// Up to 8 humans, star topology through the host. Bots fill the empty seats. pid = player id, host is 0.
//
// Connect
//   Net.profile({name, rank})        set before host()/join(); can be called again later
//   Net.host()                       opens a room. 'open'(code) when ready.
//   Net.join(code)                   'peer'(pid) once in (pid is Net.pid). Errors: 'error'(plain message).
//   Net.leave()                      leaves. If the host leaves, everyone gets 'lost'.
//   Net.resumable()                  code string if this browser has a seat it could reclaim (<60s old), else null.
//                                    Offer "Rejoin", then call Net.join(code). Reloading a guest page counts.
// Read any time
//   Net.role 'host'|'guest'|null, Net.code, Net.pid, Net.connected, Net.ping (ms),
//   Net.phase 'room'|'draft'|'match', Net.stalled, Net.reconnecting (bool),
//   Net.room = {code, phase, heroTeam, max, players:[{pid, name, rank, team(0|1), side, host, online, ping}]}
//     team is the ROOM team (A = 0, B = 1). side is null until the flip, then 0 Heroes / 1 Villains.
//   Net.me() my player row, Net.mySide() 0|1|null
// Room (host only; a no-op for guests)
//   Net.setTeam(pid, team)           move a player (false if that team already has 4)
//   Net.swap(pidA, pidB)             swap two players' teams
//   Net.shuffle()                    random even split
//   Net.flip()                       host: the coin decides which room team is Heroes. Everyone gets
//                                    'flip'({side, heroTeam}); side is that device's own side (0|1). Play the flip.
//   Net.draftStart({ban, pick})      host, after the flip animation: starts pick and ban (seconds, default 20 and 35)
// Pick and ban (Net.draft, also passed to 'draft'(draft) on every change; host runs the clock)
//   Net.draft = {phase:'ban'|'pick'|'done', endsAt (performance.now ms; left = (endsAt - performance.now())/1000),
//                total (s), bans:[[kit,...] by SIDE], votes:{pid:kit}, picks:{pid:{champ,role,build,locked}}}
//     bans[0] are kits removed from the Heroes' roster, bans[1] from the Villains'.
//   Net.ban(kit)                     vote for an ENEMY kit (Sim.ROSTER[1 - mySide]). Each team removes its most
//                                    voted kit when the ban phase ends; ends early once everyone has voted.
//   Net.pick({champ, role, build, prof, tier, finish, trail, recall})  any subset; changeable until locked.
//                                    Host rejects a banned kit or one a teammate holds ('draft' shows the truth).
//   Net.lock()                       lock in. Phase ends when all online humans lock, or at the timer
//                                    (unpicked humans get an available kit; phase becomes 'done').
//   Net.start()                      host, after phase 'done': builds cfg with bots and starts. Everyone gets 'start'(cfg).
//   Net.start(cfg)                   legacy: start with a cfg the UI built. seat {human, remote, pid} marks humans.
//   Net.toRoom()                     host, after a match: everyone back to the room ('room' with phase 'room').
// Events ( Net.on(type, fn) / Net.off )
//   'open'(code) 'peer'(pid) 'error'(msg) 'room'(room) 'flip'({side, heroTeam}) 'draft'(draft) 'start'(cfg)
//   'lost'(reason)                   the HOST is gone or closed the room. Final: match or room is over.
//   'left'(pid, name)                host only: a guest dropped. A bot fills in if in a match; they may rejoin.
//   'notice'({kind, pid, name})      everyone: kind 'away'|'back'|'left'|'seatlost' about another player.
//   'reconnecting'({until})          guest: link lost, retrying (until = performance.now ms). Show a small banner.
//   'reconnected'()                  guest: back in the same seat; match carried on.
//   'stall'(bool)                    guest: no snapshots for a moment.
//   'say'({pid, name, team, ...obj}) chat and emotes from Net.say.
//   'lobby'(obj, pid)                free-form lobby relay (see Net.send).
// In a match
//   startMatch(cfg, {role: Net.role}) on 'start'. G.me is found from seat.pid. cfg.rejoin true means straight back in
//   (skip the flip, draft and versus). Commands go on G.me.q as in solo, including {t:'buyback'}, {t:'reinforce',lane},
//   {t:'fund'}, {t:'surrender',vote}, {t:'ping',...}.
//   Net.say({kind:'emote'|'quick', id, team:true|false})  quick-chat through the host; everyone (or just your team) gets 'say'.
//   Net.send('lobby', obj)           host: to all guests. guest: to host only. Net.sendTo(pid, 'lobby', obj) host: one guest.
// 11.0 additions
// Spectators
//   A joiner who finds all 8 seats taken (any phase) watches: full vision, no seat, no commands. Up to Net.MAX_SPEC (2);
//   after that they get the normal "room is full" error. If a seat frees in the room phase the longest-waiting spectator takes it.
//   Net.spectator (bool, this device). Net.room.spectators = [{pid, name, rank, online}]; they are NOT in room.players.
//   'flip' gets {side:null, heroTeam, spectator:true}. 'draft' arrives read-only (ban/pick/lock do nothing). 'start'(cfg): call startMatch as usual.
//   In their match G.spectator === true and G.me is the champion being watched (camera, HUD and vision team follow G.me; Art/UI draw
//   full vision when G.spectator). No input is read and no rewards are given. finishMatch calls showEnd with {spectator:true}.
//   Net.follow(champIndex)           which of G.s.champs to watch. Net.follow(+1) / Net.follow(-1) with {step:true} as 2nd arg moves through them. 'follow'(champ) after.
// Modes
//   Net.setMode(mode)                host, room phase. 'classic'|'duel'|'brawl'|'gold'|'raid'. false if the room doesn't fit it (duel is 1 a side, raid 4 humans, all on room team A). Further joiners spectate.
//   Net.room.mode, Net.room.teamMax. Net.start() puts mode on the cfg. startMatch passes cfg.mode to Sim.createMatch.
// Player cards (travel over the room connection; everything received is sanitised but is still other people's text: escape it)
//   Net.profile({name, rank, card:{title, banner}, pins:[{id, tier}, ...up to 3], stats:{matches, wins, ...up to 12 numbers}})
//   Net.cardOf(pid)                  {pid, id (device), name, rank, card, pins, stats, code} or null. Works for your own pid and for spectators.
//   Net.cards                        {pid: that object}. 'card'(pid, card) whenever one arrives or changes. Spectators' cards too.
// Recent players (save.recent, on this device, updated at every match start)
//   Net.recent()                     newest first, up to 20: [{id, name, rank, card, pins, stats, code, at (Date.now ms), n (matches together)}].
//   Net.forgetRecent(id)
//   code is the room code that friend's device hosts under: Net.join(r.code) gets you in whenever they have a room open.
//   Net.host() reuses this device's code (save.hostCode) so those stay valid; Net.host({fresh:true}) takes a new one. If the code is busy a new one is used.
// Rematch (end screen)
//   Net.canRematch()                 true after a match while the room is alive. Hide the button otherwise (e.g. after 'lost'); offer Recent players instead.
//   Net.rematch()                    one tap. The host's tap, or every online human's, sends everyone back to the room with the same teams.
//   'rematch'({ready:[pid,...], need, go}) as votes come in; go:true just before 'room' with phase 'room'. Host then calls Net.flip() as usual (no room screen needed).
// Play of the Game: see replay.js. Team voice: see voice.js.
// ============================================================================================
// Online play over WebRTC with PeerJS, star topology through the host. The host runs the Sim; guests rebuild `s` from snapshots.
//   reliable channel (PeerJS, JSON): room, draft, commands, events, slow-state deltas
//   unreliable channel (our own, binary): snapshots, stick input, ping
const Net = (() => {
  const PREFIX = 'flipside3-', PROTOCOL = 4, ALPHA = '23456789ABCDEFGHJKMNPQRSTVWXYZ', CODE_LEN = 5, MAX = 8, TEAM_MAX = 4, MAX_SPEC = 2, MODES = ['classic', 'duel', 'brawl', 'gold', 'raid'], RECENT_MAX = 20, CHUNK = 14000, BACKLOG = 48 * 1024;
  const T = { signal: 12000, connect: 20000, hello: 8000, lost: 20000, away: 4000, stall: 1500, ping: 1000, retry: 5, quietIce: 3500, quietHost: 9000, rejoin: 62000, attempt: 9000, retryGap: 1200, hostMissing: 14000 };
  const MSG = {
    server: "Can't reach the matchmaking server. Check your internet, wait a minute and try again.",
    code: "No game with that code. Check the code, or ask your friend for a new one.",
    badCode: 'That code does not look right. It should be 5 letters and numbers.',
    busy: 'That room is full. Ask your friend to start a new one.',
    started: 'That match has already started.',
    direct: "Couldn't link your devices. Some Wi-Fi and mobile networks block direct connections: try the same Wi-Fi, or one on mobile data.",
    version: 'Your friend is on a different version of the game. Both refresh the page and try again.',
    browser: "This browser can't play online. Try a recent Chrome, Safari or Firefox.",
    room: "Couldn't start a room right now. Please try again.",
    hostLeft: 'The host left, so the match is over.',
    roomClosed: 'The host closed the room.',
    hostLost: 'Lost the host. The match could not continue.',
  };
  const FAST = { label: 'flipside-fast', negotiated: true, id: 42, ordered: false, maxRetransmits: 0 };

  const api = {
    MAX, TEAM_MAX, MAX_SPEC, spectator: false, cards: {}, _voiceOn: false, role: null, code: null, connected: false, ping: 0, stalled: false, away: false, reconnecting: false, pid: -1, phase: 'room', room: null, draft: null, stats: null, _fault: null,
    on, off, profile, host, join, leave, resumable, send, sendTo, say, flip, start, setTeam, swap, shuffle, draftStart, ban, pick, lock, toRoom, me, mySide, follow, setMode, cardOf, recent, forgetRecent, canRematch, rematch, _voiceSet: voiceSet, _call: placeCall, _sendClip: sendClip, attach, hostBefore, hostAfter, guestFrame, hiddenPump,
  };
  const listeners = Object.create(null);
  function on(type, fn) { const l = listeners[type] || (listeners[type] = []); if (!l.includes(fn)) l.push(fn); }
  function off(type, fn) { const l = listeners[type]; if (l && l.includes(fn)) l.splice(l.indexOf(fn), 1); }
  function emit(type, ...a) { (listeners[type] || []).slice().forEach(f => { try { f(...a); } catch (e) { console.error(e); } }); }

  let session = 0, peer = null, phase = 'idle', timer = 0, beat = 0, tries = 0;
  let links = [], up = null, players = [], nextPid = 1, heroTeam = null, myProfile = { name: '', rank: 1000 };
  const later = fn => setTimeout(fn, 0);
  function arm(ms, fn) { clearTimeout(timer); timer = setTimeout(fn, ms); }
  function disarm() { clearTimeout(timer); timer = 0; }
  function freshStats() { return { snapsOut: 0, snapsIn: 0, bytesOut: 0, bytesIn: 0, maxSnap: 0, snapSum: 0, snapSkip: 0, lateDrop: 0, snapErrs: 0, underflow: 0, snapCorr: 0, maxErr: 0, cmdsOut: 0, errN: 0, errSum: 0, err30: 0, cmdsIn: 0, inputsIn: 0, inputGaps: 0, evOut: 0, evIn: 0, evApplied: 0, evDropped: 0, fallbackFast: 0 }; }
  const now_ = () => performance.now();

  function newLink(conn) { return { conn, fast: null, fastUp: false, player: null, linked: false, dead: false, lastHeard: now_(), pingAt: 0, rtt: 0, ack: 0, rxSeq: -1, inq: [], holdDebt: 0, idle: 0, rxAtk: false, rxMode: 'champ', rxAim: null, cmdq: [], away: false, visible: true, hiddenAt: 0, evq: [], sayT: [] }; }
  function killLink(l) {
    if (!l || l.dead) return; l.dead = true; l.linked = false;
    if (l.fast) { try { l.fast.onmessage = l.fast.onopen = l.fast.onclose = l.fast.onerror = null; l.fast.close(); } catch (e) { } }
    if (l.conn) { try { l.conn.close(); } catch (e) { } }
    l.fast = null; l.fastUp = false;
    const i = links.indexOf(l); if (i >= 0) links.splice(i, 1);
    if (api.role === 'host') api.connected = links.some(x => x.linked);
  }

  // ---------- plumbing ----------
  function peerOptions() { try { const raw = localStorage.getItem('flipside.peer'); if (raw) return JSON.parse(raw); } catch (e) { } return {}; }
  function newCode() { let c = ''; const r = new Uint32Array(CODE_LEN); crypto.getRandomValues(r); for (let i = 0; i < CODE_LEN; i++) c += ALPHA[r[i] % ALPHA.length]; return c; }
  function newToken() { const r = new Uint32Array(3); crypto.getRandomValues(r); return [...r].map(v => v.toString(36)).join(''); }
  function teardown() {
    if (peer) emit('_down');
    disarm(); clearInterval(beat); beat = 0; clearInterval(draftTimer); draftTimer = 0; clearTimeout(retry.timer); session++;
    for (const l of links.slice()) killLink(l);
    if (up) { killLink(up); up = null; }
    links = []; players = []; spectators = []; roomMode = 'classic'; rematchVotes = new Set(); hostVLast = ''; api._voiceOn = false; api.spectator = false; api.cards = {}; heroTeam = null; retry = { timer: 0, until: 0, missingSince: 0 };
    if (peer) { try { peer.destroy(); } catch (e) { } }
    peer = null; api.connected = false; api.ping = 0; api.stalled = false; api.away = false; api.reconnecting = false; api.pid = -1; api.phase = 'room'; api.room = null; api.draft = null; phase = 'idle';
  }
  function fail(message) { teardown(); api.role = null; api.code = null; emit('error', message); }
  function leave() {
    if (api.role === 'host') broadcast(['B']); else if (up && up.linked) sendRel(up, ['B']);
    teardown(); stopMatchLinks(); api.role = null; api.code = null;
  }
  function peerError(sid, err) {
    if (sid !== session) return;
    const type = err && err.type;
    if (api.reconnecting) { if (type === 'peer-unavailable') { if (!retry.missingSince) retry.missingSince = now_(); } scheduleRetry(); return; }
    if (api.connected || (api.role === 'host' && api.pid === 0)) return; // the broker is only needed to find each other, so errors there can't hurt a live link
    if (type === 'unavailable-id' && api.role === 'host') { if (++tries < T.retry) { const r = api.role, pr = myProfile; teardown(); api.role = r; myProfile = pr; openRoom(); } else fail(MSG.room); return; }
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
  // The host keeps its signalling socket alive all match: a dropped guest needs it to find the room again.
  function watchSignal(sid, p) {
    p.on('error', e => peerError(sid, e));
    p.on('call', c => { if (sid === session) emit('_call', c); });
    p.on('disconnected', () => { if (sid === session && !p.destroyed && (api.role === 'host' || !api.connected || api._voiceOn)) setTimeout(() => { if (sid === session && p.disconnected && !p.destroyed) try { p.reconnect(); } catch (e) { } }, 1500); });
  }

  function witness(st, b) { let h = st.h || 0; const j = JSON.stringify(b); for (let i = 0; i < j.length; i++) h = Math.imul(h ^ j.charCodeAt(i), 16777619); st.h = h >>> 0; st.hn = (st.hn || 0) + 1; (st.hlog || (st.hlog = {}))[st.hn] = st.h; }

  // ---------- profile and seat memory ----------
  const SEAT_KEY = 'flipside.seat';
  function clean(v, n) { return typeof v === 'string' ? v.slice(0, n) : v === undefined || v === null ? undefined : String(v).slice(0, n); }
  function cleanProfile(o) {
    o = o && typeof o === 'object' ? o : {};
    const out = { name: (clean(o.name, 18) || '').trim(), rank: isFinite(o.rank) ? +o.rank : 1000, id: clean(o.id, 24) || '', code: validCode(o.code) ? o.code : '' };
    const c = o.card && typeof o.card === 'object' ? o.card : {};
    out.card = { title: clean(c.title, 40) || '', banner: clean(c.banner, 40) || '' };
    out.pins = (Array.isArray(o.pins) ? o.pins : []).slice(0, 3).map(q => (q && typeof q === 'object' ? { id: clean(q.id, 40) || '', tier: Math.max(0, Math.min(2, q.tier | 0)) } : null)).filter(q => q && q.id);
    out.stats = {};
    if (o.stats && typeof o.stats === 'object') for (const k of Object.keys(o.stats).slice(0, 12)) { const v = o.stats[k]; if (typeof v === 'number' && isFinite(v)) out.stats[clean(k, 24)] = v; }
    return out;
  }
  const validCode = c => typeof c === 'string' && c.length === CODE_LEN && [...c].every(ch => ALPHA.includes(ch));
  function deviceId() { if (!save.netId) { save.netId = newToken(); persist(); } return save.netId; }
  function hostCode() { if (!validCode(save.hostCode)) { save.hostCode = newCode(); persist(); } return save.hostCode; }
  const wireProfile = () => Object.assign({}, myProfile, { id: deviceId(), code: hostCode() });
  function setCard(pid, prof) { const c = { pid, id: prof.id, name: prof.name, rank: prof.rank, card: prof.card, pins: prof.pins, stats: prof.stats, code: prof.code }; api.cards[pid] = c; emit('card', pid, c); return c; }
  function shareCard(pid, prof) { setCard(pid, prof); broadcast(['C', { [pid]: api.cards[pid] }]); }
  function cardOf(pid) { return api.cards[pid] || null; }
  function profile(o) {
    Object.assign(myProfile, cleanProfile(Object.assign({}, myProfile, o)));
    if (api.role === 'host') { const m = playerOf(0); if (m) { m.name = myProfile.name || 'Host'; m.rank = myProfile.rank; shareCard(0, Object.assign(wireProfile(), { name: m.name })); pushRoom(); } }
    else if (up && up.linked) sendRel(up, ['P', wireProfile()]);
  }
  function seatMemory() { try { const r = JSON.parse(localStorage.getItem(SEAT_KEY) || 'null'); if (r && r.code && r.token) return r; } catch (e) { } return null; }
  function remember(token) { try { localStorage.setItem(SEAT_KEY, JSON.stringify({ code: api.code, token, at: Date.now() })); } catch (e) { } }
  function forgetSeat() { try { localStorage.removeItem(SEAT_KEY); } catch (e) { } }
  function resumable() { const r = seatMemory(); return r && Date.now() - r.at < T.rejoin - 2000 && !api.connected ? r.code : null; }

  // ---------- starting a session ----------
  function host(o) {
    teardown(); api.role = 'host'; tries = 0; api.stats = freshStats();
    if (o && o.fresh) { save.hostCode = newCode(); persist(); }
    openRoom();
  }
  function openRoom() {
    if (tries) { save.hostCode = newCode(); persist(); } // the usual code is busy
    const code = hostCode(), sid = session, p = makePeer(PREFIX + code); if (!p) return;
    peer = p; api.code = code; phase = 'signal'; nextPid = 1;
    arm(T.signal, () => { if (sid === session) fail(MSG.server); });
    watchSignal(sid, p);
    p.on('open', () => {
      if (sid !== session) return; disarm(); phase = 'room';
      players = [{ pid: 0, name: myProfile.name || 'Host', rank: myProfile.rank, team: 0, host: true, online: true, ping: 0, token: null, link: null, seat: -1, lostAt: 0 }];
      api.pid = 0; clearInterval(beat); beat = setInterval(heartbeat, T.ping);
      setCard(0, Object.assign(wireProfile(), { name: players[0].name }));
      refreshRoom(); emit('open', code); emit('room', api.room);
    });
    p.on('connection', c => {
      if (sid !== session) return;
      const l = newLink(c); links.push(l); wireConn(sid, l);
      setTimeout(() => { if (sid === session && !l.linked && !l.dead) killLink(l); }, T.connect);
    });
  }
  function join(raw) {
    const keep = myProfile; teardown(); myProfile = keep; api.stats = freshStats();
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
      connectUp(sid, p);
    });
  }
  function connectUp(sid, p) {
    const c = p.connect(PREFIX + api.code, { reliable: true, serialization: 'json', label: 'flipside' });
    up = newLink(c); wireConn(sid, up);
  }
  function wireConn(sid, l) {
    const c = l.conn;
    c.on('open', () => {
      if (sid !== session || l.dead) return;
      l.lastHeard = now_(); if (api.role === 'guest') phase = 'hello';
      openFast(sid, l);
      if (api.role === 'guest') {
        const mem = seatMemory();
        sendRel(l, ['H', PROTOCOL, mem && mem.code === api.code ? mem.token : '', wireProfile()]);
        arm(T.hello, () => { if (sid === session && !api.connected && !api.reconnecting) fail(MSG.direct); });
      }
    });
    c.on('data', m => { if (sid !== session || l.dead) return; const f = api._fault; if (f && f.black) (f.inq = f.inq || []).push([l, m]); else onReliable(l, m); });
    c.on('close', () => { if (sid === session && !l.dead) linkClosed(l); });
    c.on('error', () => { if (sid === session && !l.dead && !l.linked) { if (api.role === 'guest' && !api.reconnecting) fail(MSG.direct); else if (api.role === 'host') killLink(l); } });
  }
  function openFast(sid, l) {
    try {
      const ch = l.conn.peerConnection.createDataChannel(FAST.label, FAST);
      l.fast = ch; ch.binaryType = 'arraybuffer';
      ch.onopen = () => { if (sid === session && l.fast === ch) l.fastUp = true; };
      ch.onclose = () => { if (sid === session && l.fast === ch) l.fastUp = false; };
      ch.onerror = () => { };
      ch.onmessage = e => { if (sid !== session || l.dead) return; if (!(api._fault && api._fault.black)) onFast(l, e.data); };
    } catch (e) { l.fast = null; }
  }

  // ---------- sending, with fault injection for tests ----------
  // Test-only delay line: FIFO per link so added latency can't reorder the reliable channel.
  function pumpRel(l) { if (l.relBusy || !l.relq || !l.relq.length) return; l.relBusy = true; setTimeout(() => { l.relBusy = false; const now = now_(); while (l.relq.length && l.relq[0].at <= now + 1) { const r = l.relq.shift(); if (r.c.open && !l.dead) try { r.c.send(r.m); } catch (e) { } } pumpRel(l); }, Math.max(0, l.relq[0].at - now_())); }
  function sendRel(l, m) {
    const f = api._fault;
    if (f && f.black) { (f.outq = f.outq || []).push([l, m]); return; }
    if (!l || l.dead || !l.conn || !l.conn.open) return;
    const c = l.conn;
    if (f && f.lat) { const q = l.relq || (l.relq = []); const at = Math.max(l.relClock || 0, now_() + f.lat + Math.random() * (f.jit || 0)); q.push({ m, at, c }); l.relClock = at; pumpRel(l); return; }
    try { c.send(m); } catch (e) { }
  }
  function broadcast(m) { for (const l of links) if (l.linked) sendRel(l, m); }
  function sendFast(l, buf) {
    const f = api._fault, st = api.stats;
    if ((f && f.black) || !l || l.dead) return;
    if (l.fastUp && l.fast && l.fast.readyState === 'open') {
      if (l.fast.bufferedAmount > BACKLOG) { st.snapSkip++; return; }
      st.bytesOut += buf.byteLength;
      if (f) { if (Math.random() < (f.loss || 0)) return; if (f.lat || f.jit) { const ch = l.fast; setTimeout(() => { if (ch.readyState === 'open') try { ch.send(buf); } catch (e) { } }, (f.lat || 0) + Math.random() * (f.jit || 0)); return; } }
      try { l.fast.send(buf); } catch (e) { }
      return;
    }
    // Our channel never opened (rare): carry it on the reliable one rather than fail.
    if (l.linked) { st.fallbackFast++; let bin = ''; new Uint8Array(buf).forEach(b => { bin += String.fromCharCode(b); }); sendRel(l, ['f', btoa(bin)]); }
  }
  function send(type, obj) { if (type !== 'lobby') return; if (api.role === 'host') broadcast(['L', obj]); else if (up) sendRel(up, ['L', obj]); }
  function sendTo(pid, type, obj) { if (type !== 'lobby' || api.role !== 'host') return; const p = playerOf(pid); if (p && p.link) sendRel(p.link, ['L', obj]); }
  api._thaw = () => { const f = api._fault; if (!f) return; f.black = false; const a = f.outq || [], b = f.inq || []; f.outq = f.inq = null; a.forEach(([l, m]) => sendRel(l, m)); b.forEach(([l, m]) => { if (!l.dead) onReliable(l, m); }); };
  api._links = () => (api.role === 'host' ? links : up ? [up] : []);

  // ---------- room ----------
  const playerOf = pid => players.find(p => p.pid === pid);
  function me() { const r = api.room; return r && (r.players.find(p => p.pid === api.pid) || (r.spectators || []).find(p => p.pid === api.pid)) || null; }
  function mySide() { const m = me(); return m ? m.side : null; }
  let spectators = [], roomMode = 'classic', rematchVotes = new Set(), hostVLast = '';
  const teamMax = () => roomMode === 'duel' ? 1 : TEAM_MAX, seatsMax = () => roomMode === 'raid' ? TEAM_MAX : teamMax() * 2, teamFor = () => roomMode === 'raid' ? 0 : teamCount(0) <= teamCount(1) ? 0 : 1;
  // A seat opened up in the room: the longest-waiting spectator takes it.
  function promote() {
    if (api.role !== 'host' || api.phase !== 'room') return;
    while (spectators.length && players.length < seatsMax()) { const p = spectators.shift(); p.spec = false; p.team = teamFor(); p.side = undefined; players.push(p); }
  }
  function setMode(m) {
    if (api.role !== 'host' || api.phase !== 'room' || !MODES.includes(m)) return false;
    const cap = m === 'duel' ? 1 : TEAM_MAX; if (teamCount(0) > cap || teamCount(1) > cap || (m === 'raid' && players.length > TEAM_MAX)) return false;
    roomMode = m; if (m === 'raid') for (const p of players) p.team = 0; // co-op: everyone on one side
    promote(); pushRoom(); return true;
  }
  function follow(i, o) {
    if (!api.spectator || !G || !G.spectator) return;
    const n = G.s.champs.length, cur = G.s.champs.indexOf(G.me), k = o && o.step ? ((cur + i) % n + n) % n : i | 0;
    if (k < 0 || k >= n || !G.s.champs[k]) return;
    G.me = G.s.champs[k]; emit('follow', G.me);
  }
  function sideOf(team) { return heroTeam === null ? null : team === heroTeam ? 0 : 1; }
  function refreshRoom() {
    api.room = { code: api.code, phase: api.phase, heroTeam, max: MAX, mode: roomMode, teamMax: teamMax(), spectators: spectators.map(p => ({ pid: p.pid, name: p.name, rank: p.rank, online: true, spectator: true, team: -1, side: null })), players: players.map(p => ({ pid: p.pid, name: p.name, rank: p.rank, team: p.team, side: sideOf(p.team), host: !!p.host, online: !!p.online, ping: Math.round(p.ping || 0) })) };
    return api.room;
  }
  function pushRoom() { if (api.role !== 'host') return; broadcast(['R', refreshRoom()]); emit('room', api.room); pushVoice(); }
  const teamCount = t => players.filter(p => p.team === t).length;
  function setTeam(pid, team) {
    if (api.role !== 'host' || api.phase !== 'room') return false;
    const p = playerOf(pid); if (!p || (team !== 0 && team !== 1) || (roomMode === 'raid' && team !== 0)) return false;
    if (p.team !== team && teamCount(team) >= teamMax()) return false;
    p.team = team; pushRoom(); return true;
  }
  function swap(a, b) { if (api.role !== 'host' || api.phase !== 'room' || roomMode === 'raid') return false; const p = playerOf(a), q = playerOf(b); if (!p || !q) return false; const t = p.team; p.team = q.team; q.team = t; pushRoom(); return true; }
  function shuffle() {
    if (api.role !== 'host' || api.phase !== 'room' || roomMode === 'raid') return;
    const list = players.slice(); for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    const first = Math.random() < .5 ? 0 : 1; list.forEach((p, i) => { p.team = i % 2 === 0 ? first : 1 - first; }); pushRoom();
  }
  function flip(side) {
    if (api.role !== 'host') return;
    heroTeam = side === 0 || side === 1 ? side : (Math.random() < .5 ? 0 : 1);
    pushRoom();
    broadcast(['F', heroTeam, side === 0 || side === 1 ? 1 : 0]);
    const mine = sideOf(playerOf(0).team), legacy = side === 0 || side === 1;
    later(() => emit('flip', { side: legacy ? side : mine, heroTeam }));
  }
  function toRoom() {
    if (api.role !== 'host') return;
    clearInterval(draftTimer); draftTimer = 0; draft = null; api.draft = null; api.phase = 'room'; heroTeam = null;
    rematchVotes = new Set();
    players = players.filter(p => p.online || p.host); promote();
    for (const p of players) { p.seat = -1; p.lostAt = 0; }
    pushRoom();
  }

  // ---------- pick and ban (host runs the clock) ----------
  let draft = null, draftTimer = 0, draftTimes = { ban: 20, pick: 35 }, lastDraftSync = 0;
  const kitsOf = side => Sim.ROSTER[side];
  function draftWire() { const d = draft; return { phase: d.phase, l: Math.max(0, d.endsAt - now_()), total: d.total, bans: d.bans, votes: d.votes, picks: d.picks }; }
  function pushDraft() { if (!draft) return; broadcast(['d', draftWire()]); api.draft = draft; emit('draft', draft); lastDraftSync = now_(); }
  function draftStart(o = {}) {
    if (api.role !== 'host' || heroTeam === null || api.phase !== 'room') return false;
    draftTimes = { ban: o.ban === undefined ? 20 : o.ban, pick: o.pick === undefined ? 35 : o.pick };
    api.phase = 'draft'; draft = { phase: 'ban', total: draftTimes.ban, endsAt: now_() + draftTimes.ban * 1000, bans: [[], []], votes: {}, voteOrder: 0, picks: {} };
    pushRoom(); pushDraft();
    clearInterval(draftTimer); draftTimer = setInterval(draftTick, 250);
    return true;
  }
  function humans() { return players.filter(p => p.online); }
  function draftTick() {
    if (!draft) return;
    const now = now_();
    if (draft.phase === 'ban') {
      const all = humans().every(p => draft.votes[p.pid]);
      if (all || now >= draft.endsAt) endBans();
      else if (now - lastDraftSync > 2000) pushDraft();
    } else if (draft.phase === 'pick') {
      const all = humans().every(p => draft.picks[p.pid] && draft.picks[p.pid].locked);
      if (all || now >= draft.endsAt) endPicks();
      else if (now - lastDraftSync > 2000) pushDraft();
    }
  }
  function endBans() {
    const d = draft;
    [0, 1].forEach(side => {
      const tally = new Map();
      for (const p of players) if (sideOf(p.team) === side && d.votes[p.pid]) { const k = d.votes[p.pid]; tally.set(k, (tally.get(k) || 0) + 1); }
      let best = null, top = 0; for (const [k, n] of tally) if (n > top) { top = n; best = k; }
      if (best) d.bans[1 - side].push(best);
    });
    d.phase = 'pick'; d.total = draftTimes.pick; d.endsAt = now_() + draftTimes.pick * 1000;
    pushDraft();
  }
  function endPicks() {
    const d = draft; if (d.phase !== 'pick') return;
    for (const p of players) {
      const side = sideOf(p.team), cur = d.picks[p.pid] || (d.picks[p.pid] = {});
      if (!cur.champ) { const free = kitsOf(side).filter(k => !d.bans[side].includes(k) && !heldBy(d, side, k, p.pid)); cur.champ = free[Math.floor(Math.random() * free.length)]; }
      cur.locked = true;
    }
    d.phase = 'done'; d.total = 0; d.endsAt = now_();
    clearInterval(draftTimer); draftTimer = 0;
    pushDraft();
  }
  const heldBy = (d, side, kit, except) => players.some(p => p.pid !== except && sideOf(p.team) === side && d.picks[p.pid] && d.picks[p.pid].champ === kit);
  function draftVote(p, kit) {
    const d = draft; if (!d || d.phase !== 'ban') return;
    const side = sideOf(p.team); if (side === null || !kitsOf(1 - side).includes(kit)) return;
    d.votes[p.pid] = kit; pushDraft(); draftTick();
  }
  function draftPick(p, o) {
    const d = draft; if (!d || d.phase !== 'pick' || !o) return;
    const side = sideOf(p.team), cur = d.picks[p.pid] || (d.picks[p.pid] = {});
    if (cur.locked) return;
    if (o.champ !== undefined && kitsOf(side).includes(o.champ) && !d.bans[side].includes(o.champ) && !heldBy(d, side, o.champ, p.pid)) { if (cur.champ !== o.champ) cur.build = undefined; cur.champ = o.champ; }
    if (o.role !== undefined && Sim.ROLES.includes(o.role) && !players.some(q => q.pid !== p.pid && sideOf(q.team) === side && d.picks[q.pid] && d.picks[q.pid].role === o.role)) cur.role = o.role;
    if (o.build !== undefined && cur.champ && Sim.KITS[cur.champ].builds.some(b => b.id === o.build)) cur.build = o.build;
    if (o.tier !== undefined) cur.tier = Math.max(0, Math.min(5, o.tier | 0));
    for (const k of ['finish', 'trail', 'recall']) if (o[k] !== undefined) cur[k] = clean(o[k], 40);
    if (o.prof !== undefined && cur.role && (Sim.PROFS[cur.role] || []).some(x => x.id === o.prof)) cur.prof = o.prof;
    pushDraft();
  }
  function draftLock(p) { const d = draft; if (!d || d.phase !== 'pick') return; const cur = d.picks[p.pid]; if (!cur || !cur.champ) return; cur.locked = true; pushDraft(); draftTick(); }
  function ban(kit) { if (api.spectator) return; if (api.role === 'host') draftVote(playerOf(0), kit); else if (up) sendRel(up, ['D', 'b', kit]); }
  function pick(o) { if (api.spectator) return; if (api.role === 'host') draftPick(playerOf(0), o); else if (up) sendRel(up, ['D', 'p', o]); }
  function lock() { if (api.spectator) return; if (api.role === 'host') draftLock(playerOf(0)); else if (up) sendRel(up, ['D', 'l']); }
  function onDraftMsg(l, m) {
    if (!l.player || l.player.spec) return;
    if (m[1] === 'b') draftVote(l.player, m[2]); else if (m[1] === 'p') draftPick(l.player, m[2]); else if (m[1] === 'l') draftLock(l.player);
  }
  function applyDraftWire(w) {
    api.draft = { phase: w.phase, endsAt: now_() + w.l, total: w.total, bans: w.bans, votes: w.votes, picks: w.picks };
    emit('draft', api.draft);
  }

  // Seats from the draft: humans first, then bots from what's left of the roster, with the best free roles.
  function buildCfg() {
    const d = draft, seed = Date.now() & 0xffffff, ROLES = Sim.ROLES, BOTS = ['Ace', 'Bolt', 'Cinder', 'Dash', 'Echo', 'Flint', 'Ghost', 'Hawk', 'Ivy', 'Jinx', 'Kilo', 'Lux'];
    const avg = players.reduce((a, p) => a + (p.rank || 1000), 0) / players.length;
    let nameI = Math.floor(Math.random() * BOTS.length);
    const teams = [0, 1].map(side => {
      const seats = players.filter(p => sideOf(p.team) === side).map(p => {
        const q = d.picks[p.pid] || {};
        return { champ: q.champ, role: q.role, tier: q.tier || 0, human: true, remote: p.pid !== 0, pid: p.pid, name: p.name, build: q.build, prof: q.prof, finish: q.finish, trail: q.trail, recall: q.recall };
      });
      const used = new Set(seats.map(x => x.champ)), pool = kitsOf(side).filter(k => !used.has(k) && !d.bans[side].includes(k));
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      // Bots fill the roles people left open with kits that suit them.
      for (const r of ROLES.filter(r => !seats.some(x => x.role === r))) { if (seats.length >= teamMax()) break; let i = pool.findIndex(k => (Sim.KITS[k].fit[r] || 0) >= 2); if (i < 0) i = pool.length - 1; seats.push({ champ: pool.splice(i, 1)[0], role: r, tier: Math.min(5, Math.floor(Math.random() * Math.random() * 6)), human: false, name: BOTS[nameI++ % BOTS.length] }); }
      while (seats.length < teamMax()) seats.push({ champ: pool.pop(), role: undefined, tier: Math.min(5, Math.floor(Math.random() * Math.random() * 6)), human: false, name: BOTS[nameI++ % BOTS.length] });
      // Roles: keep what people chose, then give each remaining seat its best free role.
      const free = ROLES.filter(r => !seats.some(x => x.role === r));
      for (const x of seats) if (!x.role) { let best = free[0], top = -1; for (const r of free) { const f = Sim.KITS[x.champ].fit[r]; if (f > top) { top = f; best = r; } } x.role = best; free.splice(free.indexOf(best), 1); }
      const bots = seats.filter(x => !x.human), skills = Sim.botSkills(avg, bots.length, seed + (side + 1) * 7919);
      bots.forEach((x, i) => { x.skill = skills[i]; });
      return seats;
    });
    return { seed, teams, mode: roomMode };
  }
  function start(cfg) {
    if (api.role !== 'host') return;
    if (!cfg) { if (!draft || draft.phase !== 'done') return; cfg = buildCfg(); }
    if (cfg.seed === undefined) cfg.seed = Date.now() & 0xffffff;
    api.phase = 'match'; matchCfg = cfg; clearInterval(draftTimer); draftTimer = 0; rematchVotes = new Set();
    rememberMatch(cfg);
    pushRoom();
    broadcast(['S', cfg]);
    later(() => emit('start', cfg));
  }
  // ---------- recent players, rematch ----------
  function rememberMatch(cfg) {
    const mine = deviceId(), list = (save.recent || []).slice(), now = Date.now();
    for (const seat of cfg.teams.flat()) {
      if (!seat.human || seat.pid === undefined || seat.pid === api.pid) continue;
      const c = api.cards[seat.pid]; if (!c || !c.id || c.id === mine) continue;
      const i = list.findIndex(r => r.id === c.id), old = i >= 0 ? list.splice(i, 1)[0] : null;
      list.unshift({ id: c.id, name: c.name || seat.name || 'Player', rank: c.rank, card: c.card, pins: c.pins, stats: c.stats, code: c.code || (old && old.code) || '', at: now, n: (old ? old.n : 0) + 1 });
    }
    save.recent = list.slice(0, RECENT_MAX); persist();
  }
  function recent() { return (save.recent || []).slice(); }
  function forgetRecent(id) { save.recent = (save.recent || []).filter(r => r.id !== id); persist(); }
  function canRematch() { return !!api.role && !api.spectator && api.pid >= 0 && api.phase === 'match' && !api.reconnecting && !!G && !!G.net && !G.net.dead && !!G.s.over && (api.role === 'host' || !!(up && up.linked)); }
  function rematch() {
    if (!canRematch()) return false;
    if (api.role === 'host') { rematchVote(0); return true; }
    sendRel(up, ['r']); return true;
  }
  function rematchVote(pid) {
    rematchVotes.add(pid);
    const online = players.filter(p => p.online), ready = online.filter(p => rematchVotes.has(p.pid)).map(p => p.pid), go = pid === 0 || ready.length >= online.length, o = { ready, need: online.length, go };
    broadcast(['r', o]); emit('rematch', o);
    if (go) toRoom();
  }
  function say(o) {
    if (!o || api.spectator) return;
    if (api.role === 'guest') { if (up) sendRel(up, ['y', o]); return; }
    if (api.role === 'host') relaySay(playerOf(0), o);
  }
  function relaySay(p, o) {
    const side = sideOf(p.team), m = { pid: p.pid, name: p.name, team: !!o.team, kind: clean(o.kind, 12), id: clean(o.id, 40) };
    if (G && G.net && G.me) m.u = (G.s.champs[p.seat] || {}).id;
    const out = ['y', m];
    for (const l of links) if (l.linked && l.player && (!o.team || sideOf(l.player.team) === side)) sendRel(l, out);
    if (!o.team || sideOf(playerOf(0).team) === side) emit('say', m);
  }

  // ---------- receiving ----------
  function onReliable(l, m) {
    l.lastHeard = now_();
    if (!Array.isArray(m)) return;
    switch (m[0]) {
      case 'H': if (api.role === 'host' && !l.linked) onHello(l, m); return;
      case 'W': if (api.role === 'guest' && !l.linked) { if (m[1] !== PROTOCOL) { fail(MSG.version); return; } api.spectator = !!m[4]; welcomed(l, m[2], m[3]); } return;
      case 'X': if (!l.linked) { if (api.reconnecting) { hostGone(MSG.hostLost); return; } fail(m[1] === 'full' ? MSG.busy : m[1] === 'started' ? MSG.started : MSG.version); } return;
      case 'P': if (api.role === 'host' && l.player) { const p = cleanProfile(Object.assign({ name: l.player.name, rank: l.player.rank }, m[1])); l.player.name = p.name || l.player.name; l.player.rank = p.rank; shareCard(l.player.pid, Object.assign(p, { name: l.player.name })); pushRoom(); } return;
      case 'C': if (api.role === 'guest' && m[1] && typeof m[1] === 'object') for (const k of Object.keys(m[1])) setCard(+k, cleanProfile(m[1][k])); return;
      case 'L': emit('lobby', m[1], api.role === 'host' && l.player ? l.player.pid : 0); return;
      case 'R': if (api.role === 'guest') { api.room = m[1]; api.phase = m[1].phase; heroTeam = m[1].heroTeam; api.spectator = (m[1].spectators || []).some(p => p.pid === api.pid); emit('room', api.room); } return;
      case 'F': if (api.role === 'guest') { heroTeam = m[1]; if (api.spectator) { emit('flip', { side: null, heroTeam: m[1], spectator: true }); return; } const me_ = players.length ? null : me(); emit('flip', { side: m[2] ? m[1] : (mySide() === null ? (me_ ? me_.side : 0) : mySide()), heroTeam: m[1] }); } return;
      case 'D': if (api.role === 'host') onDraftMsg(l, m); return;
      case 'd': if (api.role === 'guest') applyDraftWire(m[1]); return;
      case 'S': if (api.role === 'guest') onStart(m[1], m[2]); return;
      case 'B': if (api.role === 'guest') { hostGone(api.phase === 'match' && G && G.net && !G.ended ? MSG.hostLeft : MSG.roomClosed); } else if (l.player) dropLink(l, true); return;
      case 'y': if (api.role === 'host') { if (!l.player || l.player.spec) return; const n = now_(); l.sayT = l.sayT.filter(t => n - t < 4000); if (l.sayT.length >= 6) return; l.sayT.push(n); relaySay(l.player, m[1] || {}); } else emit('say', m[1]); return;
      case 'n': emit('notice', m[1]); return;
      case 'v': if (api.role === 'host') { l.visible = !!m[1]; if (!l.visible && !l.hiddenAt) l.hiddenAt = now_(); } return;
      case 'c': if (api.role === 'host' && l.player && !l.player.spec) { api.stats.cmdsIn++; l.cmdq.push(m[1]); } return;
      case 's': if (api.role === 'guest') { if (G && G.net) Sim.applySlow(G.s, m[1]); else earlySlow.push(m[1]); } return;
      case 'e': if (api.role === 'guest') for (let i = 1; i < m.length; i++) { const batch = m[i]; api.stats.evIn += batch.length - 1; if (api._fault) witness(api.stats, batch); for (let j = 1; j < batch.length; j++) { const e = Sim.unpackEvent(batch[j]); pending.push({ t: batch[0], e }); Replay.guestEvent(batch[0], e); } } return;
      case 'V': if (api.role === 'host' && l.player && !l.player.spec) { l.player.voice = m[1] ? l.conn.peer : null; pushVoice(); } return;
      case 'u': if (api.role === 'guest') emit('_voice', Array.isArray(m[1]) ? m[1] : []); return;
      case 'r': if (api.role === 'guest') emit('rematch', m[1]); else if (l.player && !l.player.spec && canRematch()) rematchVote(l.player.pid); return;
      case 'Q': if (api.role === 'guest') Replay.chunk(m[1], m[2], m[3], m[4]); return;
      case 'f': { const bin = atob(m[1]), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); onFast(l, a.buffer); return; }
    }
  }
  function onFast(l, buf) {
    l.lastHeard = now_(); const st = api.stats;
    if (!(buf instanceof ArrayBuffer) || !buf.byteLength) return;
    const type = new Uint8Array(buf)[0];
    st.bytesIn += buf.byteLength;
    if (type === 0xF3) { if (api.role === 'guest' && G && G.net) { let fr; try { fr = Sim.decodeSnapshot(buf); } catch (e) { st.snapErrs++; return; } if (fr) { addFrame(fr); Replay.guestSnap(fr.tick, buf); } } return; }
    if (type === 1) { if (api.role === 'host') onInput(l, buf); return; }
    if (type === 2) { const a = new Uint8Array(buf); a[0] = 3; sendFast(l, a.buffer); return; }
    if (type === 3) { const rtt = now_() - l.pingAt; if (rtt >= 0 && rtt < 5000) { l.rtt = l.rtt ? l.rtt * .7 + rtt * .3 : rtt; if (l.player) l.player.ping = l.rtt; api.ping = api.role === 'host' ? links.reduce((a, x) => a + x.rtt, 0) / Math.max(1, links.length) : l.rtt; } return; }
  }

  // ---------- host: accepting players ----------
  function onHello(l, m) {
    if (m[1] !== PROTOCOL) { sendRel(l, ['X', 'version']); setTimeout(() => killLink(l), 400); return; }
    const token = typeof m[2] === 'string' ? m[2] : '', prof = cleanProfile(m[3]);
    let p = token ? players.find(q => q.token === token && !q.host) : null;
    if (p && p.link && p.link !== l) {
      // Same seat token. Either a fresh connection from a device whose old link is dead, or a second tab in the room.
      if (now_() - p.link.lastHeard < 1200 && api.phase === 'room') p = null;
      else killLink(p.link);
    }
    if (p) {
      p.link = l; l.player = p; p.online = true; p.voice = null; p.name = prof.name || p.name; p.rank = prof.rank;
      l.linked = true; api.connected = true; sendRel(l, ['W', PROTOCOL, p.pid, p.token]);
      sendRel(l, ['C', api.cards]); shareCard(p.pid, Object.assign(prof, { name: p.name }));
      sendRel(l, ['R', refreshRoom()]);
      if (draft && api.phase === 'draft') sendRel(l, ['d', draftWire()]);
      if (api.phase === 'match' && matchCfg && G && G.net && !G.ended) { sendRel(l, ['S', matchCfg, 1]); sendRel(l, ['s', Sim.slowDiff(null, Sim.slowFlat(G.s))]); seatBot(p, false); }
      noticeAll({ kind: 'back', pid: p.pid, name: p.name });
      pushRoom(); emit('peer', p.pid);
      return;
    }
    if (players.length >= (api._seatCap || seatsMax())) { // _seatCap: test-only, to reach the spectator path on small rigs
      if (spectators.length >= MAX_SPEC) { sendRel(l, ['X', 'full']); setTimeout(() => killLink(l), 400); return; }
      addSpectator(l, prof); return;
    }
    if (api.phase !== 'room') { sendRel(l, ['X', 'started']); setTimeout(() => killLink(l), 400); return; }
    const t = teamFor();
    const pid = nextPid++;
    p = { pid, name: prof.name || `Player ${pid + 1}`, rank: prof.rank, team: t, host: false, online: true, ping: 0, token: newToken(), link: l, seat: -1, lostAt: 0 };
    players.push(p); l.player = p; l.linked = true; api.connected = true;
    sendRel(l, ['W', PROTOCOL, pid, p.token]);
    sendRel(l, ['C', api.cards]); shareCard(pid, Object.assign(prof, { name: p.name }));
    pushRoom(); emit('peer', pid);
  }
  function addSpectator(l, prof) {
    const pid = nextPid++, p = { pid, name: prof.name || `Spectator ${pid}`, rank: prof.rank, team: -1, spec: true, host: false, online: true, ping: 0, token: newToken(), link: l, seat: -1, lostAt: 0 };
    spectators.push(p); l.player = p; l.linked = true; api.connected = true;
    sendRel(l, ['W', PROTOCOL, pid, p.token, 1]);
    sendRel(l, ['C', api.cards]); shareCard(pid, Object.assign(prof, { name: p.name }));
    sendRel(l, ['R', refreshRoom()]);
    if (draft && api.phase === 'draft') sendRel(l, ['d', draftWire()]);
    if (api.phase === 'match' && matchCfg && G && G.net && !G.ended) { sendRel(l, ['S', matchCfg, 1]); sendRel(l, ['s', Sim.slowDiff(null, Sim.slowFlat(G.s))]); }
    pushRoom(); emit('peer', pid);
  }
  // ---------- voice roster: the host tells each team who has voice on; the calls themselves are direct (voice.js) ----------
  function voiceSet(on) {
    api._voiceOn = !!on;
    if (api.role === 'host') { const m = playerOf(0); if (m) { m.voice = on && peer ? peer.id : null; pushVoice(); } }
    else if (up && up.linked) sendRel(up, ['V', on ? 1 : 0]);
  }
  function pushVoice() {
    if (api.role !== 'host') return;
    for (const t of [0, 1]) { // raid: everyone is already on team 0
      const list = players.filter(p => p.team === t && p.voice && p.online).map(p => ({ pid: p.pid, peer: p.voice, name: p.name })), j = JSON.stringify(list);
      for (const p of players) {
        if (p.team !== t) continue;
        if (p.host) { if (hostVLast !== j) { hostVLast = j; emit('_voice', list); } }
        else if (p.link && p.link.linked && p.link.vlast !== j) { p.link.vlast = j; sendRel(p.link, ['u', list]); }
      }
    }
  }
  function placeCall(id, stream, opts) { if (!peer || peer.destroyed || !peer.open) return null; try { return peer.call(id, stream, opts); } catch (e) { return null; } }
  // Play of the Game: the host's clip goes out in pieces small enough for any browser's data channel.
  function sendClip(id, json) {
    const n = Math.max(1, Math.ceil(json.length / CHUNK)), sid = session, to = links.filter(l => l.linked);
    let i = 0;
    (function next() { if (sid !== session) return; const m = ['Q', id, i, n, json.slice(i * CHUNK, (i + 1) * CHUNK)]; for (const l of to) if (l.linked) sendRel(l, m); if (++i < n) setTimeout(next, 25); })();
  }
  function noticeAll(n) {
    const pl = playerOf(n.pid), kind = n.kind === 'seatlost' ? 'seatlost' : n.kind === 'left' || n.kind === 'away' ? 'gone' : 'back';
    if (pl && kind !== 'seatlost' && pl.noted === kind) return; // one player, one banner per change
    if (pl) pl.noted = kind;
    broadcast(['n', n]); emit('notice', n);
  }
  function linkClosed(l) {
    if (api.role === 'host') { if (l.player) dropLink(l, false); else killLink(l); return; }
    // Guest: the link to the host died.
    if (!l.linked && !api.reconnecting) { killLink(l); if (l === up) fail(MSG.direct); return; }
    if (api.reconnecting) { killLink(l); scheduleRetry(); return; }
    startReconnect();
  }
  // Host: a guest is gone. In a room they simply leave; in a draft or match they keep their seat for the rejoin window.
  function dropLink(l, said) {
    const p = l.player; killLink(l); if (!p) return;
    if (p.spec) { spectators = spectators.filter(q => q !== p); delete api.cards[p.pid]; pushRoom(); return; }
    p.link = null; p.online = false; p.lostAt = now_(); p.voice = null;
    if (api.phase === 'room') { players = players.filter(q => q !== p); delete api.cards[p.pid]; promote(); }
    else if (api.phase === 'match') seatBot(p, true);
    noticeAll({ kind: 'left', pid: p.pid, name: p.name, said: !!said });
    pushRoom();
    const reason = `${p.name} disconnected.${api.phase === 'match' ? ' A bot took over their seat.' : ''}`;
    if ((listeners.left || []).length) emit('left', p.pid, p.name); else emit('lost', reason);
  }
  function seatBot(p, on) {
    if (!G || !G.net || G.ended || p.seat < 0) return;
    const c = G.s.champs[p.seat]; if (!c || G.s.over) return;
    if (!!c.bot === on) return;
    Sim.setBot(G.s, c, on);
    if (p.link) { p.link.inq = []; p.link.cmdq = []; p.link.away = false; }
  }
  function heartbeat() {
    const now = now_();
    if (api.role === 'host') {
      for (const l of links.slice()) {
        if (!l.linked) continue;
        if (l.fastUp) { l.pingAt = now; const a = new Uint8Array(1); a[0] = 2; sendFast(l, a.buffer); }
        if (now - l.lastHeard > T.lost) { dropLink(l, false); continue; }
        if (G && G.net && api.phase === 'match') syncAway(l, now);
      }
      if (api.phase === 'match') for (const p of players) if (!p.online && p.token && p.lostAt && now - p.lostAt > T.rejoin) { p.token = null; noticeAll({ kind: 'seatlost', pid: p.pid, name: p.name }); }
      if ((now | 0) % 3000 < 1000 && api.phase !== 'match') pushRoomPings();
      return;
    }
    if (!up) return;
    if (api.reconnecting) return;
    if (up.linked) {
      if (up.fastUp) { up.pingAt = now; const a = new Uint8Array(1); a[0] = 2; sendFast(up, a.buffer); }
      const quiet = now - up.lastHeard, ice = (up.conn.peerConnection || {}).iceConnectionState;
      if (quiet > (ice === 'connected' || ice === 'completed' ? T.quietHost : T.quietIce)) { startReconnect(); return; }
      remember(seatToken);
    }
  }
  function pushRoomPings() { refreshRoom(); for (const l of links) if (l.linked) sendRel(l, ['R', api.room]); emit('room', api.room); }
  let seatToken = '';
  function welcomed(l, pid, token) {
    disarm(); l.linked = true; l.lastHeard = now_(); api.connected = true; phase = 'live'; api.pid = pid; seatToken = token; api.code = api.code; remember(token);
    clearInterval(beat); beat = setInterval(heartbeat, T.ping);
    const back = api.reconnecting; api.reconnecting = false;
    if (back) { clearTimeout(retry.timer); retry.until = 0; retry.missingSince = 0; if (G && G.net) guestRelink(); if (api._voiceOn) sendRel(l, ['V', 1]); emit('reconnected'); }
    else { emit('peer', pid); }
  }

  // ---------- guest: rejoining ----------
  let retry = { timer: 0, until: 0, missingSince: 0 };
  function startReconnect() {
    if (api.reconnecting || api.role !== 'guest') return;
    api.reconnecting = true; api.connected = false; retry.until = now_() + T.rejoin - 2000; retry.missingSince = 0;
    if (up) killLink(up); up = null;
    emit('reconnecting', { until: retry.until });
    attemptReconnect();
  }
  function scheduleRetry(ms = T.retryGap) {
    if (!api.reconnecting) return;
    clearTimeout(retry.timer);
    const sid = session; retry.timer = setTimeout(() => { if (sid === session && api.reconnecting) attemptReconnect(); }, ms);
  }
  function attemptReconnect() {
    if (!api.reconnecting) return;
    const now = now_();
    if (now > retry.until || (retry.missingSince && now - retry.missingSince > T.hostMissing)) { hostGone(MSG.hostLost); return; }
    const sid = session;
    if (up) { killLink(up); up = null; }
    const go = () => {
      if (sid !== session || !api.reconnecting) return;
      connectUp(sid, peer);
      clearTimeout(retry.timer); retry.timer = setTimeout(() => { if (sid === session && api.reconnecting && !(up && up.linked)) { if (up) killLink(up); up = null; attemptReconnect(); } }, T.attempt);
    };
    if (peer && !peer.destroyed && peer.open && !peer.disconnected) { go(); return; }
    if (peer) { try { peer.destroy(); } catch (e) { } }
    const p = makePeer(); if (!p) return; peer = p;
    watchSignal(sid, p);
    p.on('open', () => { if (sid === session && p === peer) go(); });
    clearTimeout(retry.timer); retry.timer = setTimeout(() => { if (sid === session && api.reconnecting && !(p.open)) scheduleRetry(0); }, T.attempt);
  }
  function hostGone(reason) {
    if (api.role !== 'guest') return;
    if (G && G.net && !G.ended) G.net.dead = true;
    forgetSeat(); stopMatchLinks();
    const r = api.role, c = api.code; teardown(); api.role = r; api.code = c;
    emit('lost', reason);
  }

  // ---------- visibility and page lifecycle ----------
  // A screen lock can freeze a phone for a moment. Give it time to come back before giving up.
  document.addEventListener('visibilitychange', () => {
    const vis = !document.hidden;
    if (api.role === 'guest' && up && up.linked) {
      sendRel(up, ['v', vis ? 1 : 0]);
      if (vis) { const now = now_(), lim = T.quietHost; if (now - up.lastHeard > lim - 5000) up.lastHeard = now - (lim - 5000); }
    }
    if (api.role === 'guest' && G && G.net && vis) guestResume();
  });
  addEventListener('pagehide', e => { if (e.persisted || !api.role) return; if (api.role === 'host') broadcast(['B']); else if (up && up.linked) sendRel(up, ['B']); });

  // ---------- match links, host side ----------
  const ATK_MODES = ['champ', 'minion', 'tower'];
  let worker = null, hiddenLast = 0, matchCfg = null, prevSlow = null;
  // ---------- match links, guest side ----------
  let seatIdx = -1, short = false, frames = [], clockOff = null, delay = 3.2, pending = [], earlySlow = [], seq = 0, hist = [], ex = 0, ey = 0, srvX = 0, srvY = 0, srvDriven = false, reconcileHold = 0, pendCd = [0, 0, 0], pendRecast = [0, 0, 0], chargeLocal = 0, chargeBlock = 0, lastFrameAt = 0, inHist = [], aimSend = null, overShown = false, reseat = false;
  const minDelay = () => (api.spectator ? 7 : 3.2); // spectators get a slower stream
  const nearer = (a, b) => ((a - b) & 0xffff) < 0x8000 && a !== b;

  function seatChamp(p) { return G && p && p.seat >= 0 ? G.s.champs[p.seat] : null; }
  function stopMatchLinks() {
    if (worker) { try { worker.terminate(); } catch (e) { } worker = null; }
  }
  function attach() {
    const s = G.s, role = G.net.role;
    if (!api.stats) api.stats = freshStats();
    localCast = []; frames = []; clockOff = null; delay = minDelay(); hist = []; ex = ey = 0; seq = 0; srvDriven = false; pendCd = [0, 0, 0]; pendRecast = [0, 0, 0]; chargeLocal = 0; chargeBlock = 0; lastFrameAt = 0; overShown = false;
    if (role === 'guest') {
      seatIdx = api.spectator ? -1 : s.champs.indexOf(G.me); pending = [];
      for (const d of earlySlow) Sim.applySlow(s, d); earlySlow = [];
      reseat = !!G.cfg.rejoin;
      if (G.cfg.rejoin) G.intro = 0;
    }
    if (role === 'host') {
      stopMatchLinks();
      prevSlow = Sim.slowFlat(s);
      matchCfg = G.cfg; api.phase = 'match';
      for (const p of players) p.seat = p.host ? -1 : s.champs.findIndex(c => c.pid === p.pid);
      // A cfg built without player ids (the older two-player lobby) has one remote seat.
      if (!s.champs.some(c => c.pid !== undefined)) { const g = players.find(p => !p.host), i = s.champs.findIndex(c => c.remote); if (g && i >= 0) g.seat = i; }
      for (const l of links) { l.evq = []; l.inq = []; l.cmdq = []; l.rxSeq = -1; l.ack = 0; l.idle = 0; l.rxAtk = false; l.rxAim = null; l.holdDebt = 0; l.away = false; l.visible = true; l.hiddenAt = 0; }
      for (const p of players) if (!p.host && !p.online) seatBot(p, true);
      try { const b = new Blob(['setInterval(()=>postMessage(0),33)'], { type: 'text/javascript' }); worker = new Worker(URL.createObjectURL(b)); worker.onmessage = () => hiddenPump(); }
      catch (e) { worker = null; hiddenTimer(); }
    }
  }
  function hiddenTimer() { setTimeout(() => { if (G && G.net && api.role === 'host') { hiddenPump(); hiddenTimer(); } }, 40); }
  // rAF stops in a hidden tab. Keep the host's simulation running for everyone.
  function hiddenPump() {
    if (!document.hidden || !G || !G.net || api.role !== 'host') { hiddenLast = 0; return; }
    const now = now_(), dt = hiddenLast ? Math.min(.25, (now - hiddenLast) / 1000) : DT; hiddenLast = now;
    if (!paused && G.intro > 0) { G.intro -= dt; return; }
    if (!G.outro && !G.ended && G.intro <= 0) stepMatch(dt);
  }

  function onInput(l, buf) {
    const d = new DataView(buf), st = api.stats;
    st.inputsIn++;
    const newest = d.getUint16(1, true), flags = d.getUint8(3), have = d.getUint8(4);
    l.rxMode = ATK_MODES[(flags >> 2) & 3] || 'champ';
    if (l.rxSeq >= 0 && (newest === l.rxSeq || nearer(l.rxSeq, newest))) return; // late or duplicate
    if (flags & 2) { l.rxAim = { x: d.getInt16(5 + have * 2, true), y: d.getInt16(7 + have * 2, true) }; }
    l.rxAtk = !!(flags & 1);
    for (let i = have - 1; i >= 0; i--) {
      const q = (newest - i) & 0xffff;
      if (l.rxSeq >= 0 && !nearer(q, l.rxSeq)) continue;
      if (l.rxSeq >= 0 && i === have - 1 && q !== ((l.rxSeq + 1) & 0xffff) && nearer(q, (l.rxSeq + 1) & 0xffff)) st.inputGaps++;
      l.inq.push({ seq: q, x: clampMv(d.getInt8(5 + i * 2) / 100), y: clampMv(d.getInt8(6 + i * 2) / 100) });
      l.rxSeq = q;
    }
  }
  const clampMv = v => Math.max(-1, Math.min(1, isFinite(v) ? v : 0));
  // Commands with no position, or only simple fields, travel as [10, t, fields...] and are whitelisted here.
  const SIMPLE = { buyback: [], reinforce: ['lane'], fund: ['amount'], surrender: ['vote'], use: ['slot'], pref: ['v'] };
  function hostBefore() {
    for (const p of players) {
      if (p.host || !p.link || p.seat < 0) continue;
      const l = p.link, c = seatChamp(p);
      if (!c || c.bot || !l.linked) continue;
      if (l.inq.length > 6) l.inq.splice(0, l.inq.length - 2);
      // Hold the last stick through a short gap, then skip one input per held tick when the backlog arrives,
      // so the host walks exactly as many ticks as the guest predicted.
      if (l.inq.length) { if (l.holdDebt && l.inq.length > 1) { l.inq.shift(); l.holdDebt--; } const e = l.inq.shift(); c.mv.x = e.x; c.mv.y = e.y; l.ack = e.seq; l.idle = 0; }
      else if (++l.idle > 8) c.mv.x = c.mv.y = 0;
      else if (l.holdDebt < 5) l.holdDebt++;
      c.atk = l.rxAtk; c.atkMode = l.rxMode;
      if (l.rxAim && c.charge) c.q.push({ t: 'aim', tx: c.x + l.rxAim.x, ty: c.y + l.rxAim.y });
      l.rxAim = null;
      for (const m of l.cmdq) {
        const v = m && m[0], sl = (m && m[1]) | 0, ok = (x, y) => isFinite(x) && isFinite(y) && Math.abs(x) < 8000 && Math.abs(y) < 8000;
        if (v === 0 && sl >= 0 && sl <= 2 && ok(m[2], m[3])) c.q.push({ t: 'cast', slot: sl, tx: c.x + m[2], ty: c.y + m[3] });
        else if (v === 1 && sl >= 0 && sl <= 2) c.q.push({ t: 'charge', slot: sl });
        else if (v === 2) c.q.push({ t: 'cancel' });
        else if (v === 3) c.q.push({ t: 'recall' });
        else if (v === 5 && typeof m[1] === 'string') c.q.push({ t: 'buy', id: m[1] });
        else if (v === 6) c.q.push({ t: 'sell', slot: sl });
        else if (v === 7) c.q.push({ t: 'evolve', tier: sl, choice: m[2] | 0 });
        else if (v === 8 && ok(m[1], m[2])) c.q.push({ t: 'beacon', tx: c.x + m[1], ty: c.y + m[2] });
        else if (v === 9 && ok(m[2], m[3])) c.q.push({ t: 'ping', kind: String(m[1]), x: m[2], y: m[3] });
        else if (v === 10 && SIMPLE[m[1]]) { const q = { t: m[1] }; SIMPLE[m[1]].forEach((k, i) => { const x = m[i + 2]; if (typeof x === 'number' && isFinite(x)) q[k] = x; else if (typeof x === 'boolean' || x === 'hp' || x === 'pct') q[k] = x; }); c.q.push(q); }
      }
      l.cmdq.length = 0;
    }
  }
  function hostAfter() {
    const s = G.s, st = api.stats, live = links.filter(l => l.linked && l.player && l.player.seat >= 0), specs = links.filter(l => l.linked && l.player && l.player.spec);
    if (!live.length && !specs.length) return;
    if (s.ev.length) {
      st.evOut += s.ev.length;
      const byTeam = [null, null];
      for (const l of live) {
        const t = s.champs[l.player.seat].team;
        if (!byTeam[t]) byTeam[t] = packEvents(s, t);
        const b = byTeam[t], extra = packOwnEvents(s, s.champs[l.player.seat].id);
        if (b.length || extra.length) { const row = extra.length ? [s.tick, ...b, ...extra] : [s.tick, ...b]; l.evq.push(row); if (api._fault) witness(st, row); }
      }
      if (specs.length) { const b = packEvents(s, -1); if (b.length) { const row = [s.tick, ...b]; for (const l of specs) l.evq.push(row); } }
    }
    // 7 guests is a lot of upload for a phone, so bigger rooms trade a little update rate for it, staggered across ticks.
    const big = live.length > 3;
    const cache = {};
    live.forEach((l, i) => {
      const due = big ? (s.tick + i) % 2 === 0 : s.tick % 3 !== 0;
      if (!due && !s.over) return;
      if (l.evq.length) { sendRel(l, ['e', ...l.evq]); l.evq = []; }
      const buf = Sim.snapshot(s, l.player.seat, l.ack, cache);
      st.snapsOut++; st.snapSum += buf.byteLength; st.maxSnap = Math.max(st.maxSnap, buf.byteLength);
      sendFast(l, buf);
    });
    // Spectators see everything, at a gentler rate: a full-vision snapshot is the biggest thing the host sends.
    if (s.tick % 3 === 0 || s.over) for (const l of specs) {
      if (l.evq.length) { sendRel(l, ['e', ...l.evq]); l.evq = []; }
      const buf = Sim.snapshot(s, -1, 0, cache);
      st.snapsOut++; st.snapSum += buf.byteLength; st.maxSnap = Math.max(st.maxSnap, buf.byteLength);
      sendFast(l, buf);
    }
    if (s.tick % 6 === 0 || s.over) {
      const cur = Sim.slowFlat(s), d = Sim.slowDiff(prevSlow, cur); prevSlow = cur;
      if (d.length) { const m = ['s', d]; for (const l of live) sendRel(l, m); for (const l of specs) sendRel(l, m); }
    }
  }
  // Per-team event filter: sends only what a team can see, so a big fight across the map costs that team nothing.
  let evMap = null, evMapTick = -1;
  function evUnit(s, id) {
    if (evMapTick !== s.tick) { evMapTick = s.tick; evMap = new Map(); for (const l of [s.champs, s.minions, s.monsters, s.towers]) for (const u of l) evMap.set(u.id, u); }
    return evMap.get(id);
  }
  function evNear(s, team, e) {
    if (team < 0) return true; // spectators
    let x = e.x, y = e.y, u = null;
    if (x === undefined) { u = e.u !== undefined ? evUnit(s, e.u) : null; if (!u) return true; if (u.team === team) return true; x = u.x; y = u.y; }
    for (const v of Sim.visionSources(s, team)) { const r = v.r + 280, dx = v.x - x, dy = v.y - y; if (dx * dx + dy * dy < r * r) return true; }
    return false;
  }
  function packEvents(s, team) {
    const out = [];
    for (const e of s.ev) {
      const k = e.e;
      if (k === 'recap') continue;
      if ((k === 'ping' || k === 'surrender') && e.team !== team) continue;
      if ((COSMETIC.has(k) || (k === 'die' && e.kind !== 'champ')) && !evNear(s, team, e)) continue;
      out.push(Sim.packEvent(e));
    }
    return out;
  }
  // A death recap is only for the player it describes.
  function packOwnEvents(s, id) { const out = []; for (const e of s.ev) if (e.e === 'recap' && e.u === id) out.push(Sim.packEvent(e)); return out; }

  // A guest whose tab is hidden, or who has gone quiet: a bot holds the seat until they're back.
  function syncAway(l, now) {
    const p = l.player; if (!p || p.seat < 0 || !G.s) return;
    if (l.visible) l.hiddenAt = 0;
    if (G.intro > 0) return; // a slow phone still painting the map is not gone
    const shouldAway = now - l.lastHeard > T.away || (l.hiddenAt && now - l.hiddenAt > T.away);
    if (shouldAway !== l.away && !G.s.over) { l.away = shouldAway; seatBot(p, shouldAway); l.away = shouldAway; noticeAll({ kind: shouldAway ? 'away' : 'back', pid: p.pid, name: p.name }); emit('away', shouldAway, p.pid); }
  }

  // ---------- guest ----------
  function addFrame(fr) {
    const st = api.stats, now = performance.now(), ticks = now * .03;
    st.snapsIn++;
    // A leftover packet from the previous match has a huge tick; without this it would shut out every new frame.
    if (fr.mid !== ((G.s.seed || 0) & 255)) return; // a packet from the previous match
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
  function syncTimer(local, srv) { const d = srv - local; if (Math.abs(d) > .3) return srv; const v = local + d * .15; return srv <= 0 && v < .03 ? 0 : v; }
  function ownFrame(fr, now) {
    const s = G.s, me = G.me, a = fr.champs[seatIdx], own = fr.own; if (!a || !own) return;
    const keepFx = me.fx, keepFy = me.fy, pch = me.charge, keepDash = me.dash, wasAlive = me.alive;
    Sim.applyChampState(me, a, true);
    me.fx = keepFx; me.fy = keepFy;
    // Back in the seat, or back from the fountain: start from the host's word on everything, or the old spot and timers linger for a round trip.
    if ((reseat || (!wasAlive && me.alive))) {
      reseat = false;
      me.x = me.px = srvX = a.x; me.y = me.py = srvY = a.y; me.vx = me.vy = 0; hist = []; ex = ey = 0; me.pdash = null; me.dash = null; me.charge = null; chargeLocal = chargeBlock = 0; localCast = []; lastWindup = null;
      pendCd = [0, 0, 0]; pendRecast = [0, 0, 0];
      for (let i = 0; i < 3; i++) { me.cd[i] = own.cd[i]; me.recast[i] = own.recast[i]; }
      me.atkCd = own.atkCd; me.lock = 0; me.slowA = own.slowA; me.hasteA = own.hasteA; srvDriven = false;
      return;
    }
    srvDriven = !!(a.fl & 4) && !me.pdash || !me.alive || !!me.air || !!me.leap;
    if (me.pdash) me.dash = keepDash || { net: true };
    me.slowA = own.slowA; me.hasteA = own.hasteA;
    while (localCast.length && localCast[0].at < now) localCast.shift();
    // Own charge: trust the local one until the host has had time to answer.
    const srvCh = me.charge;
    if (chargeLocal) { if (srvCh) { me.charge = pch || srvCh; chargeLocal = 0; } else if (now < chargeLocal) me.charge = pch; else { chargeLocal = 0; me.charge = null; } }
    else if (srvCh && now < chargeBlock) me.charge = null;
    else if (srvCh && pch) me.charge = pch;
    // Our clock runs on its own between frames. The host's number is old by one-way latency, so ahead-correct it,
    // and only correct small drift gently: a timer that jitters by a few hundredths every frame reads as broken.
    const lag = Math.min(.25, api.ping / 2000);
    for (let i = 0; i < 3; i++) {
      const srv = Math.max(0, own.cd[i] - lag);
      if (pendCd[i]) { if (Math.abs(srv - me.cd[i]) < .6 + lag || now > pendCd[i]) { pendCd[i] = 0; me.cd[i] = syncTimer(me.cd[i], srv); } }
      else me.cd[i] = syncTimer(me.cd[i], srv);
      const rsrv = Math.max(0, own.recast[i] - lag);
      if (pendRecast[i]) { if (now > pendRecast[i]) { pendRecast[i] = 0; me.recast[i] = rsrv; } } else me.recast[i] = syncTimer(me.recast[i], rsrv);
    }
    if (own.atkCd > me.atkCd + .25) me.atkCd = own.atkCd;
    srvX = a.x; srvY = a.y;
    if (wasAlive && !me.alive) { me.pdash = null; pendCd = [0, 0, 0]; pendRecast = [0, 0, 0]; me.charge = null; chargeLocal = 0; localCast = []; }
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
  // A new link to the host, same match: everything about timing starts again, and the first snapshot re-seats the coin.
  function guestRelink() { frames = []; clockOff = null; delay = minDelay(); lastFrameAt = 0; hist = []; ex = ey = 0; inHist = []; aimSend = null; reseat = true; pending = pending.filter(p => !COSMETIC.has(p.e.e)); if (api.stalled) { api.stalled = false; emit('stall', false); } }
  function onStart(cfg, rejoin) {
    api.phase = 'match'; matchCfg = cfg;
    if (rejoin) { if (G && G.net && !G.ended && G.cfg.seed === cfg.seed) { G.net.dead = false; guestRelink(); return; } cfg.rejoin = true; }
    else { rematchVotes = new Set(); rememberMatch(cfg); }
    emit('start', cfg);
  }

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
      if (me.alive) { for (let i = 0; i < 3; i++) { if (me.cd[i] > 0) me.cd[i] -= DT; if (me.recast[i] > 0) me.recast[i] -= DT; } }
      if (me.charge) me.charge.t += DT;
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
    let fl = me.atk ? 1 : 0; if (aimSend) fl |= 2; fl |= Math.max(0, ATK_MODES.indexOf(me.atkMode)) << 2;
    b.setUint8(3, fl); b.setUint8(4, n);
    for (let i = 0; i < n; i++) { b.setInt8(5 + i * 2, inHist[inHist.length - 2 - i * 2]); b.setInt8(6 + i * 2, inHist[inHist.length - 1 - i * 2]); }
    if (aimSend) { b.setInt16(5 + n * 2, aimSend.x, true); b.setInt16(7 + n * 2, aimSend.y, true); aimSend = null; }
    if (up) sendFast(up, b.buffer);
  }
  function sendCmd(c) { api.stats.cmdsOut++; if (up) sendRel(up, ['c', c]); }
  let localCast = [], lastWindup = null, localCharge = 0;
  function canAct(me, a, slot) { return me.alive && me.stunT <= 0 && !me.air && !me.chan && !me.dash && !me.pdash && a && !(slot === 2 && me.lvl < 3) && !(me.rootT > 0 && a.pd); }
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
          if (recast) {
            const more = a.chain && (me.fstepL || 1) < a.chain;
            me.fstepL = more ? (me.fstepL || 1) + 1 : 0; me.recast[q.slot] = more ? a.window : 0; pendRecast[q.slot] = now + wait;
          } else {
            me.cd[q.slot] = Sim.cdOf(me, q.slot); pendCd[q.slot] = now + wait;
            if (a.armsRecast) { me.recast[q.slot] = a.window; me.fstepL = 1; pendRecast[q.slot] = now + wait; }
            if (a.windup) lastWindup = { slot: q.slot, at: now };
          }
          me.fx = ndx; me.fy = ndy;
          localCast.push({ at: now + 1500, slot: q.slot }); playEvent({ e: 'cast', u: me.id, fx: a.fx, dx: ndx, dy: ndy, slot: q.slot });
        }
        sendCmd([0, q.slot, Math.round(dx), Math.round(dy)]);
      } else if (q.t === 'charge') {
        if (me.alive && me.cd[q.slot] <= 0 && me.stunT <= 0 && !me.chan && !me.air) { me.charge = { slot: q.slot, t: 0, dx: me.fx, dy: me.fy }; chargeLocal = now + wait + 200; playEvent({ e: 'cast', u: me.id, fx: me.kit[q.slot].fx, dx: me.fx, dy: me.fy, slot: q.slot, charge: 1 }); localCharge = now + 1500; }
        sendCmd([1, q.slot]);
      } else if (q.t === 'aim') {
        if (me.charge) { const n = Math.hypot(q.tx - me.x, q.ty - me.y) || 1; me.charge.dx = (q.tx - me.x) / n; me.charge.dy = (q.ty - me.y) / n; me.fx = me.charge.dx; me.fy = me.charge.dy; }
        aimSend = { x: Math.max(-30000, Math.min(30000, Math.round(q.tx - me.x))), y: Math.max(-30000, Math.min(30000, Math.round(q.ty - me.y))) };
      } else if (q.t === 'cancel') {
        if (me.charge) { me.charge = null; chargeLocal = 0; chargeBlock = now + wait; }
        // Cancelling a wind-up refunds its cooldown at once, as it will on the host.
        const ws = me.chan && me.chan.slot !== undefined ? me.chan.slot : lastWindup && now - lastWindup.at < 1200 ? lastWindup.slot : -1;
        if (ws >= 0) { me.cd[ws] = 0; pendCd[ws] = 0; lastWindup = null; }
        sendCmd([2]);
      } else if (q.t === 'recall') sendCmd([3]);
      else if (q.t === 'buy') sendCmd([5, String(q.id)]);
      else if (q.t === 'sell') sendCmd([6, q.slot | 0]);
      else if (q.t === 'evolve') sendCmd([7, q.tier | 0, q.choice | 0]);
      else if (q.t === 'beacon') sendCmd([8, Math.round(q.tx - me.x), Math.round(q.ty - me.y)]);
      else if (q.t === 'ping') sendCmd([9, String(q.kind), Math.round(q.x), Math.round(q.y)]);
      else if (SIMPLE[q.t]) sendCmd([10, q.t, ...SIMPLE[q.t].map(k => q[k])]);
    }
  }

  // The event queue is only visible to the player as it plays out, so time it with the interpolated world.
  const COSMETIC = new Set(['hit', 'heal', 'gold', 'phit', 'boom', 'blink', 'parry', 'cast', 'tshot', 'cancelled', 'stun', 'mark', 'atk', 'matk', 'fire', 'root', 'knock', 'poly', 'curse', 'shield', 'stealth']);
  function playEvent(e) { const st = api.stats; st.evApplied++; fxEvent(e); uiEvent(e); soundEvent(e); }
  function releaseEvents(rt) {
    const me = G.me, st = api.stats, now2 = performance.now();
    for (let i = 0; i < pending.length; i++) {
      const p = pending[i], mine = p.e.u === me.id || p.e.by === me.id;
      if (!(mine || p.t <= rt + .5)) continue;
      pending.splice(i, 1); i--;
      if (p.e.e === 'cast' && p.e.u === me.id && p.e.charge && now2 < localCharge) { localCharge = 0; continue; }
      if (p.e.e === 'cast' && p.e.u === me.id && p.e.charge === undefined) { const k = localCast.findIndex(l => l.slot === p.e.slot); if (k >= 0) { localCast.splice(k, 1); continue; } }
      if (rt - p.t > 36 && COSMETIC.has(p.e.e)) { st.evDropped++; continue; }
      playEvent(p.e);
    }
    if (pending.length > 2000) { const before = pending.length; pending = pending.filter(p => !COSMETIC.has(p.e.e)); st.evDropped += before - pending.length; }
  }

  function guestFrame(dt, frameNow) {
    if (!G.net || G.net.dead) return;
    const s = G.s, now = frameNow || performance.now(), st = api.stats;
    if (api.spectator) { G.acc = 0; G.me.q.length = 0; }
    else {
      G.acc += dt; let n = 0;
      while (G.acc >= DT && n++ < 8) { guestTick(); G.acc -= DT; }
      if (n >= 8) G.acc = 0;
    }
    Replay.guestSlow(s);
    if (frames.length) {
      let rt = now * .03 + clockOff - delay, i = frames.length - 1;
      const newest = frames[i].tick;
      if (rt >= newest) { st.underflow++; if (!short) { short = true; delay = Math.min(9, delay + .7); } } else { short = false; delay = Math.max(minDelay(), delay - .008); }
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
      const core = s.towers.find(t => t.sub === 'core' && !t.alive) || s.towers.find(t => t.sub === 'core' && t.team !== s.over.winner) || s.towers.find(t => t.sub === 'core');
      G.outro = { t: 0, x: core.x, y: core.y }; outroStart();
      Replay.guestOver();
    }
  }
  window.__fnet = { Net: api, get Replay() { return Replay; }, get Voice() { return Voice; }, startMatch: (cfg, net) => startMatch(cfg, net), g: () => G, ctl: () => Ctl };
  return api;
})();
