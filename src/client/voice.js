// ============================================================================================
// TEAM VOICE API (agreed with UI; this block is the contract, kept current by Netcode)
//
// A mesh of WebRTC calls among the human teammates in the room (4 at most). Off by default. The microphone is only requested by
// Voice.enable() and is fully released by Voice.disable(). Spectators have no voice. It ends by itself when the room does.
//
//   Voice.enable({mode})         call from a tap. mode 'open'|'ptt' optional. Resolves to the new Voice.state.
//   Voice.disable()
//   Voice.state                  'off'|'asking'|'on'|'denied'|'nomic'|'unsupported'|'unavailable'|'error'
//                                denied: permission refused (they can retry, or allow it in the browser). nomic: no microphone found.
//                                unsupported: this browser/page can't. unavailable: not in a room, or spectating. All leave voice off and the game unharmed.
//   Voice.message                plain sentence to show for a failure state, else ''.
//   Voice.mode                   'open'|'ptt', remembered. Voice.setMode(mode)
//   Voice.talk(bool)             push-to-talk button down/up (only matters in 'ptt').
//   Voice.selfMute(bool), Voice.selfMuted
//   Voice.mute(pid, bool), Voice.muted(pid)  per player, remembered by device id.
//   Voice.speakingSelf           bool: your mic is sending sound right now.
//   Voice.peers()                teammates who have voice on: [{pid, name, connected, muted, speaking}]
//   Voice.isSpeaking(pid)        bool (also for your own pid).
//   Voice.on('state', state) Voice.on('peers', list)  peers fires on any change including speaking. Voice.off(type, fn)
// ============================================================================================
const Voice = (() => {
  const CALL_TIMEOUT = 12000, RETRIES = 3, HOLD = 4000, LEVEL = .018, TAIL = 320;
  const MSG = { denied: 'Microphone access was refused. Allow it in your browser settings to use voice.', nomic: 'No microphone was found on this device.', unsupported: "Voice chat isn't available in this browser.", unavailable: 'Voice is for teammates in a room.', error: "Voice couldn't start. Try again." };
  const api = { state: 'off', message: '', mode: 'open', selfMuted: false, speakingSelf: false, on, off, enable, disable, setMode, talk, selfMute, mute, muted, peers, isSpeaking };
  const listeners = Object.create(null);
  function on(type, fn) { const l = listeners[type] || (listeners[type] = []); if (!l.includes(fn)) l.push(fn); }
  function off(type, fn) { const l = listeners[type]; if (l && l.includes(fn)) l.splice(l.indexOf(fn), 1); }
  function emit(type, ...a) { (listeners[type] || []).slice().forEach(f => { try { f(...a); } catch (e) { console.error(e); } }); }

  let gen = 0, mic = null, pressed = false, roster = [], calls = new Map(), tries = new Map(), held = [], ac = null, selfMeter = null, tickT = 0, syncT = 0, mutedPid = new Set();
  const opts = () => { const v = save.voice; return v && typeof v === 'object' ? v : (save.voice = {}); };
  if (opts().mode === 'ptt') api.mode = 'ptt';
  const idOf = pid => { const c = Net.cardOf(pid); return c && c.id; };

  function setState(st) { api.state = st; api.message = MSG[st] || ''; emit('state', st); emit('peers', peers()); }
  // iOS: a live microphone moves the page to a voice audio session (quieter, possibly earpiece, game audio can stall). Say so up front
  // where Safari lets us, and put it back the moment the mic is released.
  function session(live) {
    try { if (navigator.audioSession) navigator.audioSession.type = live ? 'play-and-record' : 'auto'; } catch (e) { }
    setTimeout(() => { try { if (typeof Sound !== 'undefined') Sound.init(); } catch (e) { } }, 300);
  }

  async function enable(o) {
    if (o && o.mode) setMode(o.mode);
    if (api.state === 'on' || api.state === 'asking') return api.state;
    if (!Net.role || Net.pid < 0 || Net.spectator) { setState('unavailable'); return api.state; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.RTCPeerConnection) { setState('unsupported'); return api.state; }
    const my = ++gen; setState('asking');
    // Created inside the tap, so iOS lets it run.
    try { const AC = window.AudioContext || window.webkitAudioContext; ac = AC ? new AC() : null; if (ac && ac.state === 'suspended') ac.resume().catch(() => { }); } catch (e) { ac = null; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch (e) {
      if (my !== gen) return api.state;
      closeAc(); const n = e && e.name;
      setState(n === 'NotAllowedError' || n === 'SecurityError' ? 'denied' : n === 'NotFoundError' || n === 'OverconstrainedError' || n === 'NotReadableError' ? 'nomic' : 'error');
      return api.state;
    }
    if (my !== gen || !Net.role) { stream.getTracks().forEach(t => t.stop()); closeAc(); if (my === gen) setState('off'); return api.state; }
    mic = stream; session(true); applyMic();
    selfMeter = makeMeter(mic);
    clearInterval(tickT); tickT = setInterval(meterTick, 100); clearInterval(syncT); syncT = setInterval(sync, 3000);
    setState('on');
    Net._voiceSet(true);
    sync();
    return api.state;
  }
  function closeAc() { if (ac) { try { ac.close(); } catch (e) { } ac = null; } }
  function disable() {
    const was = api.state; gen++;
    clearInterval(tickT); clearInterval(syncT); tickT = syncT = 0;
    for (const pid of [...calls.keys()]) closeCall(pid);
    held.forEach(h => { try { h.c.close(); } catch (e) { } }); held = []; tries.clear(); roster = [];
    if (mic) { mic.getTracks().forEach(t => t.stop()); mic = null; session(false); }
    selfMeter = null; closeAc(); api.speakingSelf = false; pressed = false;
    Net._voiceSet(false);
    if (was !== 'off') setState('off');
  }
  function setMode(m) { if (m !== 'open' && m !== 'ptt') return; api.mode = m; opts().mode = m; persist(); applyMic(); }
  function talk(on) { pressed = !!on; applyMic(); }
  function selfMute(on) { api.selfMuted = !!on; applyMic(); emit('peers', peers()); }
  function applyMic() { if (mic) { const live = !api.selfMuted && (api.mode === 'open' || pressed); mic.getAudioTracks().forEach(t => { t.enabled = live; }); } }
  function muted(pid) { if (mutedPid.has(pid)) return true; const d = idOf(pid), m = opts().muted; return !!(d && m && m[d]); }
  function mute(pid, on) {
    on = !!on; if (on) mutedPid.add(pid); else mutedPid.delete(pid);
    const d = idOf(pid); if (d) { const v = opts(); v.muted = v.muted || {}; if (on) v.muted[d] = 1; else delete v.muted[d]; persist(); }
    const c = calls.get(pid); if (c && c.audio) c.audio.muted = on;
    emit('peers', peers());
  }
  function peers() { return roster.filter(r => r.pid !== Net.pid).map(r => { const c = calls.get(r.pid), m = muted(r.pid); return { pid: r.pid, name: r.name, connected: !!(c && c.stream), muted: m, speaking: !!(c && c.speaking && !m) }; }); }
  function isSpeaking(pid) { if (pid === Net.pid) return api.speakingSelf; const c = calls.get(pid); return !!(c && c.speaking && !muted(pid)); }

  // ---------- the mesh ----------
  // The lower pid always places the call, so two teammates never call each other at once.
  function sync() {
    if (!mic) return;
    const me = Net.pid;
    if (!roster.some(r => r.pid === me)) { for (const pid of [...calls.keys()]) closeCall(pid); return; }
    for (const pid of [...calls.keys()]) { const r = roster.find(x => x.pid === pid), c = calls.get(pid); if (!r || r.peer !== c.peer) closeCall(pid); }
    for (const r of roster) {
      if (r.pid === me || calls.has(r.pid) || me > r.pid || Net.reconnecting) continue;
      if ((tries.get(r.pid) || 0) >= RETRIES) continue;
      const c = Net._call(r.peer, mic, { metadata: { pid: me } }); if (!c) continue;
      tries.set(r.pid, (tries.get(r.pid) || 0) + 1);
      wire(c, r);
    }
    held = held.filter(h => { const r = roster.find(x => x.pid === h.pid && x.peer === h.c.peer); if (r) { accept(h.c, r); return false; } if (performance.now() - h.at > HOLD) { try { h.c.close(); } catch (e) { } return false; } return true; });
  }
  function accept(c, r) { if (calls.has(r.pid)) closeCall(r.pid); try { c.answer(mic); } catch (e) { return; } wire(c, r); }
  function wire(c, r) {
    const entry = { c, peer: r.peer, pid: r.pid, stream: null, audio: null, meter: null, speaking: false, quiet: 0, timer: 0 };
    calls.set(r.pid, entry);
    entry.timer = setTimeout(() => { if (calls.get(r.pid) === entry && !entry.stream) closeCall(r.pid); }, CALL_TIMEOUT);
    c.on('stream', s => {
      if (calls.get(r.pid) !== entry || entry.stream === s) return;
      clearTimeout(entry.timer); entry.stream = s; tries.delete(r.pid);
      const el = document.createElement('audio'); el.autoplay = true; el.playsInline = true; el.setAttribute('playsinline', ''); el.style.display = 'none'; el.muted = muted(r.pid); el.srcObject = s;
      document.body.appendChild(el); entry.audio = el;
      const p = el.play(); if (p && p.catch) p.catch(() => { addEventListener('pointerdown', () => { if (entry.audio) entry.audio.play().catch(() => { }); }, { once: true, passive: true }); });
      entry.meter = makeMeter(s);
      emit('peers', peers());
    });
    const gone = () => { if (calls.get(r.pid) === entry) { closeCall(r.pid); emit('peers', peers()); } };
    c.on('close', gone); c.on('error', gone);
  }
  function closeCall(pid) {
    const e = calls.get(pid); if (!e) return; calls.delete(pid); clearTimeout(e.timer);
    try { e.c.close(); } catch (err) { }
    if (e.audio) { e.audio.srcObject = null; e.audio.remove(); e.audio = null; }
    e.meter = null;
  }
  Net.on('_voice', list => { roster = list; for (const pid of [...tries.keys()]) if (!list.some(r => r.pid === pid)) tries.delete(pid); sync(); emit('peers', peers()); });
  Net.on('_call', c => {
    const pid = c.metadata && c.metadata.pid;
    if (!mic || typeof pid !== 'number' || api.state !== 'on') { try { c.close(); } catch (e) { } return; }
    const r = roster.find(x => x.pid === pid && x.peer === c.peer);
    if (r) { if (Net.pid < pid) { try { c.close(); } catch (e) { } return; } accept(c, r); } else held.push({ c, pid, at: performance.now() }); // the host's roster may reach us just after the call
  });
  Net.on('_down', () => disable());
  Net.on('reconnected', () => { if (api.state === 'on') { tries.clear(); setTimeout(sync, 800); } });

  // ---------- who is talking ----------
  function makeMeter(stream) {
    if (!ac) return null;
    try { const an = ac.createAnalyser(); an.fftSize = 512; ac.createMediaStreamSource(stream).connect(an); return { an, buf: new Uint8Array(an.fftSize) }; } catch (e) { return null; }
  }
  function loud(m) { if (!m) return false; m.an.getByteTimeDomainData(m.buf); let sum = 0; for (let i = 0; i < m.buf.length; i += 4) { const v = (m.buf[i] - 128) / 128; sum += v * v; } return Math.sqrt(sum / (m.buf.length / 4)) > LEVEL; }
  let selfQuiet = 0;
  function meterTick() {
    if (ac && ac.state === 'suspended') ac.resume().catch(() => { });
    let change = false;
    const live = !!mic && mic.getAudioTracks().some(t => t.enabled);
    if (live && loud(selfMeter)) selfQuiet = 0; else selfQuiet += 100;
    const me = live && selfQuiet < TAIL; if (me !== api.speakingSelf) { api.speakingSelf = me; change = true; }
    for (const c of calls.values()) { if (!c.meter) continue; if (loud(c.meter)) c.quiet = 0; else c.quiet += 100; const sp = c.quiet < TAIL; if (sp !== c.speaking) { c.speaking = sp; change = true; } }
    if (change) emit('peers', peers());
  }
  return api;
})();
