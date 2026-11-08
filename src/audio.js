// Music and sound for Flipside. Everything is synthesised at runtime, so there are no audio files.
// Struck and plucked timbres are rendered once into small buffers; sustained voices are live oscillators sharing per-layer filters.
// Gain staging, in linear peaks at the compressor input: music sits near .25, routine effects near .15, the player's own big moments near .5.
// The compressor only has to catch stacks of effects, and a soft clipper after it makes digital clipping impossible.
const Sound = (() => {
  let ac = null, master, hush, ducker, duckWet, mus, musWet, sfx, farBus, revIn, rev, noise, rainG, windG, padA, padB, padF, arpF, timer = null, lean = false, autoLean = false, fxReady = false, musReady = false, susT = 0;
  const L = {}, W = {}, B = { pluck: [], mal: [], bell: [], clink: [] }, last = {}, live = [], early = [], mixL = [];
  const S = { mode: null, sting: false, dim: false, step: 0, next: 0, sec: 'intro', bar: 0, nextSec: null, jump: false, pass: {}, key: 0, cycle: 0, sinceBig: 99, chorusRun: 0, intensity: 0, I: 0, music: true, sfx: true, late: 0, night: 0, mixT: 0, hand: 0, stingAt: -99, duckAt: 0, duckAmt: 0, side: null, sideAt: 0, hope: .5, bright: null, darkL: false, flip: null, lowAt: 0 };
  const OUT_TRIM = 1, MUS = .34, SFX = .85, FX_WET = .45, LOW_GAP = 90, LAYERS = ['pad', 'bass', 'arp', 'lead', 'horn', 'ctr', 'perc', 'taiko'];
  const SEND = { pad: .5, bass: 0, arp: .28, lead: .5, horn: .36, ctr: .28, perc: .04, taiko: .08 };
  const m2f = n => 440 * Math.pow(2, (n - 69) / 12);
  const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
  const gain = (v, to) => { const g = ac.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };
  const filt = (type, fr, q, to) => { const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = fr; f.Q.value = q; if (to) f.connect(to); return f; };
  const panTo = (v, to) => { if (!ac.createStereoPanner) return to; const p = ac.createStereoPanner(); p.pan.value = v; p.connect(to); return p; };
  const pick = a => a[Math.random() * a.length | 0];
  const rp = s => 1 + (Math.random() - .5) * 2 * s;
  const num = v => typeof v === 'number' && isFinite(v);

  // ---------- voice budget ----------
  // Voices are counted by their scheduled end time, so notes queued ahead of the clock count as well.
  const musEnds = [], fxEnds = [];
  function count(a) { const now = ac.currentTime; let j = 0; for (let i = 0; i < a.length; i++) if (a[i] > now) a[j++] = a[i]; a.length = j; return j; }
  const musCap = () => lean ? 20 : 32, fxCap = () => lean ? 12 : 18, fxFull = () => count(fxEnds) >= fxCap() + (lean ? 4 : 6);
  const room = pri => count(musEnds) < musCap() * [.62, .85, 1][pri];
  function track(end, fx) { (fx ? fxEnds : musEnds).push(end); }
  // Every music note registers here so a mode change can release what is sounding and cancel what is queued.
  let group = null;
  function voice(gs, t, end) { group = { gs, t, end, s: [] }; live.push(group); return group; }
  function hold(p, now) { if (p.cancelAndHoldAtTime) p.cancelAndHoldAtTime(now); else { const v = p.value; p.cancelScheduledValues(now); p.setValueAtTime(v, now); } }
  function release(tau = .1) {
    const now = ac.currentTime, off = now + tau * 6;
    for (const v of live) {
      if (v.end <= now) continue;
      const queued = v.t > now + .004;
      for (const g of v.gs) { if (queued) { g.gain.cancelScheduledValues(now); g.gain.setValueAtTime(0, now); } else { hold(g.gain, now); g.gain.setTargetAtTime(0, now, tau); } }
      for (const s of v.s) try { s.stop(queued ? now : off); } catch (e) { }
    }
    live.length = 0; group = null;
    for (let i = 0; i < musEnds.length; i++) musEnds[i] = Math.min(musEnds[i], off);
  }

  // ---------- setup ----------
  function wake() { if (ac && !document.hidden && ac.state !== 'running' && ac.state !== 'closed') { const p = ac.resume(); if (p && p.catch) p.catch(() => { }); } }
  // Suspending mid-waveform clicks, so the output fades first. A throttled timer is harmless: the fade has already silenced it.
  function goQuiet() {
    if (!ac) return; const t = ac.currentTime; hold(hush.gain, t); hush.gain.setTargetAtTime(0, t, .02);
    clearTimeout(susT); susT = setTimeout(() => { if (document.hidden) { const p = ac.suspend(); if (p && p.catch) p.catch(() => { }); } }, 110);
  }
  function comeBack() { if (!ac) return; clearTimeout(susT); wake(); const t = ac.currentTime; hold(hush.gain, t); hush.gain.setTargetAtTime(1, t + .02, .12); }
  function init() {
    if (ac) { wake(); return; }
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; return; }
    // Older iOS only unlocks once a source has played inside the gesture.
    const un = ac.createBufferSource(); un.buffer = ac.createBuffer(1, 1, 22050); un.connect(ac.destination); un.start(0); wake();
    autoLean = (navigator.deviceMemory || 4) < 3 || (navigator.hardwareConcurrency || 4) < 4; lean = lean || autoLean;

    // Output chain: rumble cut, tamed presence and air, glue compressor, makeup compensation, soft clipper, fade.
    // The compressor adds about 4 dB of automatic makeup gain. OUT_TRIM was set from offline renders: heavy stacks peak near -3 dBFS.
    hush = gain(1, ac.destination);
    const clip = ac.createWaveShaper(), n = 4097, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1) * 2 - 1) * 2, a = Math.abs(x); curve[i] = Math.sign(x) * (a <= .8 ? a : .8 + .19 * Math.tanh((a - .8) / .19)); }
    clip.curve = curve; clip.connect(hush);
    const trim = gain(OUT_TRIM * .5, clip);
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = .003; comp.release.value = .16; comp.connect(trim);
    const shelf = filt('highshelf', 6800, 0, comp); shelf.gain.value = -4.5;
    const dip = filt('peaking', 3300, .8, shelf); dip.gain.value = -2;
    const hp = filt('highpass', 42, .7, dip);
    master = gain(.9, hp); ducker = gain(1, master); mus = gain(S.music ? MUS : 0, ducker);
    sfx = gain(S.sfx ? SFX : 0, master); farBus = filt('lowpass', 1500, .4, sfx);
    rev = ac.createConvolver(); rev.connect(gain(.2, master)); revIn = gain(1, rev);
    // Music reverb is ducked with the dry music, so its tail never washes over an effect.
    duckWet = gain(1, revIn); musWet = gain(S.music ? MUS * 1.6 : 0, duckWet);
    const nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1; noise = nb;

    for (const k of LAYERS) { L[k] = gain(0, mus); if (SEND[k]) L[k].connect(gain(SEND[k], musWet)); }
    // Pad chain: two panned voice buses, shared filter, a vowel formant, and one modulated delay for chorus.
    const formant = filt('peaking', 820, 1.1, L.pad); formant.gain.value = 4;
    padF = filt('lowpass', 900, .5, formant);
    padA = gain(1, panTo(-.5, padF)); padB = gain(1, panTo(.5, padF));
    const chorus = ac.createDelay(.06); chorus.delayTime.value = .021; const lfo = ac.createOscillator(); lfo.frequency.value = .37; const depth = gain(.0034); lfo.connect(depth); depth.connect(chorus.delayTime); lfo.start();
    formant.connect(chorus); chorus.connect(panTo(.35, gain(.6, L.pad)));
    arpF = filt('lowpass', 2400, .4, L.arp);

    W.ah = wave([1, .95, .62, .42, .3, .2, .15, .1, .08, .05, .04, .03]);
    W.oo = wave([1, .42, .14, .07, .04, .02]);
    // Strong upper harmonics: a phone speaker cannot play a 50 Hz fundamental, so the ear has to infer it.
    W.bass = wave([.5, .85, .62, .42, .26, .15, .08, .04]);

    const bed = (fr, q, type) => { const s = ac.createBufferSource(); s.buffer = noise; s.loop = true; const g = gain(0, sfx), f = filt(type, fr, q, g); s.connect(f); s.start(); return g; };
    rainG = bed(1500, .5, 'bandpass'); windG = bed(420, .7, 'bandpass');

    // Rendering is spread over timers so the first tap does not hitch. Effects come first; early requests wait in a short queue.
    const jobs = buildJobs(), fxN = jobs.fxN; let done = 0;
    const pump = () => {
      const j = jobs.shift(); if (!j) { musReady = true; return; }
      try { j(); } catch (e) { }
      if (++done === fxN) { fxReady = true; flush(); }
      setTimeout(pump, 6);
    };
    setTimeout(pump, 0);
    timer = setInterval(tick, 40);
    document.addEventListener('visibilitychange', () => { if (document.hidden) goQuiet(); else comeBack(); });
    addEventListener('pagehide', goQuiet);
    // Recovers from iOS interruptions such as phone calls.
    addEventListener('pointerup', wake, { passive: true });
    if (ac.addEventListener) ac.addEventListener('statechange', flush);
    if (S.mode) setMode(S.mode, true);
  }
  function wave(h) { const n = h.length + 1, re = new Float32Array(n), im = new Float32Array(n); h.forEach((a, i) => im[i + 1] = a); return ac.createPeriodicWave(re, im); }

  // ---------- rendered instruments ----------
  // modes: [freq, amp, decaySeconds, startFreq?, sweepSeconds?]
  function render(len, modes, nAmt = 0, nDec = .01, nLp = .5) {
    const sr = ac.sampleRate, n = len * sr | 0, b = ac.createBuffer(1, n, sr), d = b.getChannelData(0), w = 2 * Math.PI / sr;
    for (const [f, a, dec, from = f, sw = .04] of modes) {
      const k = Math.exp(-1 / (sr * dec)), ks = Math.exp(-1 / (sr * sw)); let p = 0, e = a, c = from - f;
      for (let i = 0; i < n && e > .0004; i++) { d[i] += Math.sin(p) * e; e *= k; p += w * (f + c); c *= ks; }
    }
    if (nAmt) { const k = Math.exp(-1 / (sr * nDec)); let e = nAmt, lp = 0; for (let i = 0; i < n && e > .0004; i++) { lp += (Math.random() * 2 - 1 - lp) * nLp; d[i] += lp * e; e *= k; } }
    return finish(b, d, sr);
  }
  function finish(b, d, sr) {
    let pk = 0; for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > pk) pk = a; }
    const g = pk ? .9 / pk : 1, at = sr * .0012 | 0, rl = sr * .012 | 0, n = d.length;
    for (let i = 0; i < n; i++) d[i] *= g;
    for (let i = 0; i < at; i++) d[i] *= i / at;
    for (let i = 0; i < rl; i++) d[n - 1 - i] *= i / rl;
    return b;
  }
  // Karplus-Strong string. Integer delay detunes high notes, so the true pitch is stored and corrected at playback.
  function string(n, s, t60, len = 1.5) {
    const sr = ac.sampleRate, f0 = m2f(n), N = Math.max(4, Math.round(sr / f0 - s)), size = len * sr | 0, b = ac.createBuffer(1, size, sr), d = b.getChannelData(0);
    const fb = Math.pow(.001, 1 / (t60 * f0)), pickAt = Math.max(1, N * .2 | 0); let lp = 0;
    for (let i = 0; i < N; i++) { lp += (Math.random() * 2 - 1 - lp) * .62; d[i] = lp; }
    for (let i = N - 1; i >= pickAt; i--) d[i] -= d[i - pickAt] * .9;
    for (let i = N; i < size; i++) d[i] = (d[i - N] * (1 - s) + d[i - N - 1 < 0 ? 0 : i - N - 1] * s) * fb;
    finish(b, d, sr);
    return { n, b, f: sr / (N + s) };
  }
  function buildJobs() {
    const J = [], mode = (bank, n, fn) => J.push(() => { const f = m2f(n); bank.push({ n, f, b: fn(f) }); });
    // Effects first, because they are heard first. Struck-metal partials stay under about 6 kHz, where a phone speaker is not piercing.
    [[2100, 3150, 4480, 6100], [2480, 3500, 4820, 6600], [1880, 2900, 4120, 5600]].forEach(fs => J.push(() => B.clink.push(render(.2, fs.map((f, i) => [f, 1 / (1 + i * .8), .085 / (1 + i * .6)]), .3, .002, .6))));
    J.push(() => { B.ring = { f: 1318.51, b: render(1, [[1318.51, 1, .5], [2640, .22, .26], [3637, .22, .2]]) }; });
    // Bodies carry energy at 110 to 300 Hz as well as the fundamental, so an impact still has weight on a phone.
    J.push(() => { B.sub = render(.5, [[72, .75, .14, 170, .03], [144, .8, .08, 260, .02], [288, .35, .03]], .25, .006, .3); });
    J.push(() => { B.boom = render(.95, [[66, .7, .3, 150, .06], [132, .85, .18, 230, .04], [264, .42, .08, 340, .02]], .5, .1, .16); });
    J.push(() => { B.punch = render(.2, [[150, 1, .06, 420, .018], [300, .5, .03, 520, .012], [640, .14, .012]], .5, .008, .4); });
    J.push(() => { B.snap = render(.09, [[1250, .5, .012], [2100, .3, .008]], 1, .012, .55); });
    // Reverb: exponential noise tail that darkens over time, like a stone hall.
    J.push(() => {
      const sr = ac.sampleRate, len = sr * (lean ? 1.2 : 1.8) | 0, ir = ac.createBuffer(2, len, sr), dk = Math.pow(.001, 1 / len);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); let e = 1, lp = 0; for (let i = 0; i < len; i++) { lp += (Math.random() * 2 - 1 - lp) * (.6 - .5 * i / len); d[i] = lp * e; e *= dk; } }
      rev.buffer = ir;
    });
    for (const n of [72, 86]) mode(B.bell, n, f => render(2.2, [[f, 1, .9], [f * 2.01, .4, .5], [f * 2.76, .24, .22], [f * 4.1, .1, .1]], .08, .002, .5));
    J.fxN = J.length;
    J.push(() => { B.kick = render(.26, [[78, .75, .09, 210, .03], [156, .55, .04, 280, .015]], .14, .005, .5); });
    J.push(() => { B.taiko = render(.9, [[78, .65, .28, 140, .045], [118, .75, .14, 190, .03], [236, .36, .05]], .5, .012, .22); });
    J.push(() => { B.frame = render(.3, [[98, 1, .09, 135, .02], [196, .35, .05], [420, .12, .02]], .6, .01, .35); });
    J.push(() => { B.clack = render(.14, [[420, .5, .02], [980, .25, .012]], 1, .035, .6); });
    J.push(() => { B.shk = render(.06, [[4200, .35, .014], [5600, .25, .01], [7200, .15, .008]], .7, .01, .7); });
    J.push(() => {
      B.crash = render(1.8, [[3100, .1, .6], [4300, .08, .45], [5500, .06, .3]], 1, .55, .55);
      const n = B.crash.length, r = ac.createBuffer(1, n, ac.sampleRate), a = B.crash.getChannelData(0), z = r.getChannelData(0);
      for (let i = 0; i < n; i++) z[i] = a[n - 1 - i]; B.swell = r;
    });
    for (const [n, s, t] of lean ? [[62, .5, 3], [76, .38, 2], [88, .25, 1.3]] : [[57, .5, 3.2], [64, .46, 2.9], [71, .42, 2.5], [78, .35, 2], [85, .28, 1.6], [92, .2, 1.2]]) J.push(() => B.pluck.push(string(n, s, t)));
    for (const n of [60, 72, 84]) mode(B.mal, n, f => render(1.1, [[f, 1, .42], [f * 3.93, .3, .08], [f * 9.2, .08, .02]], .15, .003, .5));
    return J;
  }

  // ---------- players ----------
  function smp(b, t, rate, v, bus, stop = 0, fx = false, pri = 1, send = null) {
    if (!b || (fx ? fxFull() : !room(pri))) return;
    const s = ac.createBufferSource(), g = gain(v, bus); s.buffer = b; s.playbackRate.value = rate; s.connect(g); if (send) g.connect(send);
    let end = t + b.duration / rate;
    if (stop) { g.gain.setValueAtTime(v, t + stop); g.gain.linearRampToValueAtTime(.0001, t + stop + .05); s.start(t); s.stop(t + stop + .06); end = Math.min(end, t + stop + .06); } else s.start(t);
    track(end, fx); if (!fx) { const r = voice([g], t, end); r.s.push(s); }
  }
  function osc(type, f, t, end, cents, bus, fx) {
    const o = ac.createOscillator(); if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type);
    o.frequency.value = f; if (cents) o.detune.value = cents; o.connect(bus); o.start(t); o.stop(end); track(end, fx); if (!fx && group) group.s.push(o); return o;
  }
  function note(bank, t, n, v, bus, stop, pri = 1) {
    if (!bank.length) return; let e = bank[0];
    for (const c of bank) if (Math.abs(c.n - n) < Math.abs(e.n - n)) e = c;
    smp(e.b, t, m2f(n) / e.f, v, bus, stop, false, pri);
  }
  const pluck = (t, n, v, bus = arpF, stop = .55, pri = 0) => note(B.pluck, t, n, v, bus, stop, pri);
  const mallet = (t, n, v, bus = L.ctr, pri = 1) => note(B.mal, t, n, v, bus, 0, pri);
  const bell = (t, n, v, bus = L.lead) => note(B.bell, t, n, v, bus, 0, 2);
  function bass(t, n, v, d) {
    if (!room(2)) return; const g = gain(0, L.bass), end = t + d;
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + .012); g.gain.linearRampToValueAtTime(v * .62, Math.max(t + .04, end - .01)); g.gain.linearRampToValueAtTime(.0001, end + .05);
    voice([g], t, end + .07); osc(W.bass, m2f(n), t, end + .07, 0, g);
  }
  // Choir-like pad: harmonically shaped oscillators, one detuned voice each side of the stereo field.
  function choir(t, ns, dur, v, w = W.ah) {
    if (!room(1)) return;
    const end = t + dur, atk = Math.min(.5, dur * .25), gA = gain(0, padA), gB = gain(0, padB), thin = lean || count(musEnds) > musCap() * .55;
    for (const g of [gA, gB]) { g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + atk); g.gain.setValueAtTime(v, Math.max(t + atk, end - .1)); g.gain.linearRampToValueAtTime(.0001, end + .36); }
    voice([gA, gB], t, end + .4);
    ns.forEach((n, i) => { const f = m2f(n); if (thin) osc(w, f, t, end + .4, 0, i % 2 ? gB : gA); else { osc(w, f, t, end + .4, -7, gA); osc(w, f, t, end + .4, 7, gB); } });
  }
  // Soft brass chord: filtered saws through one shared swelling filter.
  function brass(t, ns, dur, v) {
    if (!room(1)) return;
    const g = gain(0, L.horn), f = filt('lowpass', 400, .7, g), c = 800 + S.I * 1200, end = t + dur;
    f.frequency.setValueAtTime(c * .35, t); f.frequency.exponentialRampToValueAtTime(c, t + .09); f.frequency.setTargetAtTime(c * .55, t + .14, dur * .5);
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + .05); g.gain.setValueAtTime(v, Math.max(t + .06, end - .05)); g.gain.linearRampToValueAtTime(.0001, end + .12);
    voice([g], t, end + .14);
    const thin = lean || count(musEnds) > musCap() * .6;
    for (const n of ns) { const hz = m2f(n); osc('sawtooth', hz, t, end + .14, -5, f); if (!thin) osc('sawtooth', hz, t, end + .14, 6, f); }
  }
  // Horn lead: two saws, a filter that follows pitch, a small scoop into the note, late vibrato on long notes.
  function horn(t, n, dur, v, bus = L.horn) {
    if (!room(2)) return;
    const hz = m2f(n), end = t + dur, c = Math.min(3200, hz * (2.6 + S.I * 1.9)), g = gain(0, bus), f = filt('lowpass', hz, .6, g);
    f.frequency.setValueAtTime(hz * 1.2, t); f.frequency.exponentialRampToValueAtTime(c, t + .09); f.frequency.setTargetAtTime(c * .6, t + .15, Math.max(.2, dur * .6));
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + .045); g.gain.linearRampToValueAtTime(v * .92, Math.max(t + .05, end - .05)); g.gain.linearRampToValueAtTime(.0001, end + .1);
    voice([g], t, end + .12);
    const a = osc('sawtooth', hz, t, end + .12, -4, f), b = lean ? null : osc('sawtooth', hz, t, end + .12, 5, f);
    a.detune.setValueAtTime(-22, t); a.detune.linearRampToValueAtTime(-4, t + .07);
    if (b) { b.detune.setValueAtTime(-16, t); b.detune.linearRampToValueAtTime(5, t + .07); }
    if (dur > .5 && !lean) { const lg = gain(0); osc('sine', 5.2, t + .3, end + .1, 0, lg); lg.gain.setValueAtTime(0, t + .3); lg.gain.linearRampToValueAtTime(7, t + .65); lg.connect(a.detune); if (b) lg.connect(b.detune); }
  }

  // ---------- score ----------
  const CH = {
    Dm: [38, 62, 65, 69], Dm7: [38, 60, 65, 69], D: [38, 62, 66, 69], Bb: [34, 62, 65, 70], Bbma: [34, 62, 65, 69], F: [41, 60, 65, 69], Fa9: [41, 60, 67, 69],
    C: [36, 60, 64, 67], Cs: [36, 60, 65, 67], Gm: [31, 62, 67, 70], Gm7: [31, 62, 65, 70], A: [33, 61, 64, 69], As: [33, 62, 64, 69], Am: [33, 60, 64, 69],
    D7: [38, 60, 66, 69], G: [31, 62, 67, 71], G7: [31, 62, 65, 71], Eb: [39, 63, 67, 70], Bbm: [34, 61, 65, 70], Fm: [41, 60, 65, 68], Cm: [36, 60, 63, 67], Gsd: [32, 62, 65, 68],
  };
  // The main motif: long, short, short, long, climbing a triad. Everything grows from it.
  const mot = (n, third = 3, drop = 5) => [[0, n, 6], [6, n - drop, 2], [8, n, 2], [10, n + third, 6]];
  const THEME = [
    mot(74),
    [[0, 82, 6], [6, 81, 2], [8, 79, 2], [10, 77, 6]],
    [[0, 81, 4], [4, 77, 2], [6, 81, 2], [8, 84, 8]],
    [[0, 79, 6], [6, 76, 2], [8, 72, 8]],
    mot(74),
    [[0, 82, 6], [6, 81, 2], [8, 82, 2], [10, 86, 6]],
    [[0, 86, 4], [4, 84, 2], [6, 82, 2], [8, 79, 8]],
    [[0, 81, 10], [10, 76, 2], [12, 73, 4]],
  ];
  const THEME2 = [
    mot(77, 4),
    [[0, 86, 6], [6, 84, 2], [8, 82, 2], [10, 81, 6]],
    [[0, 84, 4], [4, 81, 2], [6, 84, 2], [8, 89, 8]],
    [[0, 88, 6], [6, 84, 2], [8, 79, 8]],
    mot(77, 4),
    [[0, 82, 6], [6, 86, 2], [8, 89, 2], [10, 86, 6]],
    [[0, 86, 4], [4, 89, 2], [6, 88, 2], [8, 86, 8]],
    [[0, 85, 10], [10, 81, 2], [12, 76, 4]],
  ];
  // Countermelody moves where the theme holds still.
  const COUNTER = [
    [[2, 62, 2], [4, 65, 2], [12, 69, 2], [14, 72, 2]],
    [[2, 70, 2], [4, 69, 2], [12, 65, 2], [14, 67, 2]],
    [[2, 69, 2], [4, 72, 2], [12, 69, 2], [14, 67, 2]],
    [[2, 64, 2], [4, 67, 2], [10, 72, 2], [12, 76, 2], [14, 79, 2]],
    [[2, 62, 2], [4, 65, 2], [12, 69, 2], [14, 72, 2]],
    [[2, 70, 2], [4, 74, 2], [12, 77, 2], [14, 74, 2]],
    [[2, 67, 2], [4, 70, 2], [12, 74, 2], [14, 72, 2]],
    [[2, 69, 2], [4, 73, 2], [10, 76, 2], [12, 73, 2], [14, 69, 2]],
  ];
  // B section: relative major, pickup-into-long phrasing to contrast the main motif.
  const BTHEME = [
    [[0, 72, 2], [2, 77, 6], [8, 76, 2], [10, 77, 6]],
    [[0, 76, 2], [2, 81, 6], [8, 79, 2], [10, 76, 6]],
    [[0, 74, 2], [2, 77, 6], [8, 79, 2], [10, 82, 6]],
    [[0, 84, 8], [8, 79, 4], [12, 76, 4]],
    [[0, 77, 2], [2, 81, 6], [8, 79, 2], [10, 77, 6]],
    [[0, 74, 2], [2, 82, 6], [8, 81, 2], [10, 79, 6]],
    [[0, 77, 2], [2, 86, 6], [8, 84, 2], [10, 82, 6]],
    [[0, 81, 12], [12, 85, 2], [14, 88, 2]],
  ];
  const MENU_P = ['F', 'C', 'Dm7', 'Bbma', 'F', 'C', 'Bbma', 'Cs', 'Dm', 'Bbma', 'F', 'C', 'Dm7', 'Gm7', 'Bbma', 'A'];
  const MENU_T = [
    mot(77, 4),
    [[0, 79, 6], [6, 76, 2], [8, 72, 8]],
    [[0, 74, 6], [6, 77, 2], [8, 81, 8]],
    [[0, 82, 6], [6, 81, 2], [8, 77, 8]],
    mot(77, 4),
    [[0, 84, 6], [6, 79, 2], [8, 76, 8]],
    [[0, 82, 4], [4, 81, 2], [6, 79, 2], [8, 77, 8]],
    [[0, 79, 12], [12, 76, 2], [14, 74, 2]],
    mot(74),
    [[0, 82, 6], [6, 81, 2], [8, 79, 2], [10, 77, 6]],
    [[0, 81, 4], [4, 77, 2], [6, 81, 2], [8, 84, 8]],
    [[0, 79, 6], [6, 76, 2], [8, 72, 8]],
    [[0, 74, 6], [6, 77, 2], [8, 81, 2], [10, 84, 6]],
    [[0, 82, 6], [6, 79, 2], [8, 74, 8]],
    [[0, 77, 4], [4, 79, 2], [6, 81, 2], [8, 82, 8]],
    [[0, 81, 8], [8, 79, 2], [10, 77, 2], [12, 76, 4]],
  ];
  // The villain score bends the motif: the falling fifth becomes a falling tritone, over Phrygian and diminished harmony.
  const VTHEME = [
    mot(74, 3, 6),
    [[0, 75, 6], [6, 74, 2], [8, 70, 2], [10, 67, 6]],
    [[0, 77, 4], [4, 73, 2], [6, 77, 2], [8, 82, 8]],
    [[0, 76, 6], [6, 73, 2], [8, 69, 8]],
    mot(74, 3, 6),
    [[0, 75, 6], [6, 74, 2], [8, 75, 2], [10, 79, 6]],
    [[0, 80, 4], [4, 77, 2], [6, 74, 2], [8, 71, 8]],
    [[0, 81, 10], [10, 76, 2], [12, 73, 4]],
  ];
  const VTHEME2 = [
    mot(77, 3, 6),
    [[0, 79, 6], [6, 77, 2], [8, 75, 2], [10, 74, 6]],
    [[0, 82, 4], [4, 77, 2], [6, 82, 2], [8, 85, 8]],
    [[0, 85, 6], [6, 81, 2], [8, 76, 8]],
    mot(77, 3, 6),
    [[0, 75, 6], [6, 79, 2], [8, 82, 2], [10, 79, 6]],
    [[0, 83, 4], [4, 80, 2], [6, 77, 2], [8, 74, 8]],
    [[0, 85, 10], [10, 81, 2], [12, 76, 4]],
  ];
  const VCOUNTER = [
    [[2, 62, 2], [4, 63, 2], [12, 65, 2], [14, 68, 2]],
    [[2, 67, 2], [4, 70, 2], [12, 63, 2], [14, 62, 2]],
    [[2, 65, 2], [4, 61, 2], [12, 65, 2], [14, 68, 2]],
    [[2, 64, 2], [4, 61, 2], [12, 64, 2], [14, 67, 2]],
    [[2, 62, 2], [4, 63, 2], [12, 65, 2], [14, 68, 2]],
    [[2, 67, 2], [4, 70, 2], [12, 63, 2], [14, 62, 2]],
    [[2, 68, 2], [4, 71, 2], [12, 74, 2], [14, 77, 2]],
    [[2, 69, 2], [4, 73, 2], [10, 76, 2], [12, 73, 2], [14, 69, 2]],
  ];
  const VBTHEME = [
    [[0, 72, 2], [2, 77, 6], [8, 75, 2], [10, 77, 6]],
    [[0, 75, 2], [2, 79, 6], [8, 77, 2], [10, 75, 6]],
    [[0, 70, 2], [2, 75, 6], [8, 79, 2], [10, 82, 6]],
    [[0, 85, 8], [8, 82, 4], [12, 77, 4]],
    [[0, 77, 2], [2, 81, 6], [8, 80, 2], [10, 77, 6]],
    [[0, 74, 2], [2, 80, 6], [8, 77, 2], [10, 74, 6]],
    [[0, 79, 2], [2, 87, 6], [8, 86, 2], [10, 82, 6]],
    [[0, 81, 12], [12, 85, 2], [14, 88, 2]],
  ];
  const MENU_V_P = ['Dm', 'Eb', 'Bbm', 'A', 'Dm', 'Eb', 'Gsd', 'A', 'Dm', 'Eb', 'Bbm', 'A', 'Dm', 'Eb', 'Gsd', 'A'];
  const MENU_V_T = VTHEME.concat(VTHEME2);
  const HERO = { Dm: 'D', Dm7: 'D7', Gm: 'G', Gm7: 'G7' };
  const mood = () => S.side === 'villain' ? 1 - S.hope : S.hope;
  const E = '................';
  // mix order: pad bass arp lead horn ctr perc taiko. m is the mix at intensity 0, M at intensity 1.
  const SEC = {
    intro: { n: 8, p: ['Dm', 'Dm', 'Bb', 'Bb', 'Gm', 'Gm', 'A', 'A'], m: [.85, .7, .18, .5, .7, 0, .25, .75], M: [.9, .8, .4, .6, .8, 0, .45, .9], bs: 'x.............5.', k: E, s: E, h: '..x...x...x...x.', t: 'x.........x.....', f: E, arp: 0 },
    verse: { n: 16, p: ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm', 'A'], m: [.6, .7, .55, .85, .7, .45, .38, 0], M: [.8, .85, .8, 1, .85, .7, .7, .35], bs: 'x..x..x...x.x..o', k: 'x......x..x.....', s: '....x.......x...', h: '..x...x...x...x.', t: 'x.....x.........', f: '...x.....x.x....', arp: 1, ped: 1 },
    b: { n: 16, p: ['F', 'Am', 'Bb', 'C', 'Dm', 'Gm', 'Bb', 'A'], m: [.75, .6, .7, .7, .75, .5, .25, 0], M: [.9, .8, .85, .9, .95, .7, .55, .3], bs: 'x.......x..o....', k: 'x.......x.......', s: '............x...', h: '....x.......x...', t: E, f: 'x..x.x..x..x.x..', arp: 1 },
    brk: { n: 8, p: ['Dm', 'Dm', 'Bb', 'Bb', 'Gm', 'Gm', 'A', 'A'], m: [.8, .75, .35, .55, .35, .25, .35, .25], M: [.85, .85, .5, .7, .5, .45, .55, .5], bs: 'x.x.x.x.x.x.x.xo', k: E, s: E, h: '..x...x...x...x.', t: 'x...............', f: 'x..x..x.x..x..x.', arp: 0, ped: 1, minor: 1 },
    chorus: { n: 16, p: ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm', 'A'], m: [1, .95, .8, 1, 1, .85, .85, .7], M: [1, 1, .95, 1, 1, 1, 1, 1], bs: 'x.x.o.x.x.x.o.xo', k: 'x.....x.x.x.....', s: '....x.......x..x', h: '..x.x.x...x.x.x.', t: 'x..x..x...x.x.x.', f: '...x.....x.....x', arp: 2 },
  };
  SEC.intro.vp = ['Dm', 'Dm', 'Eb', 'Eb', 'Gsd', 'Gsd', 'A', 'A'];
  SEC.verse.vp = SEC.chorus.vp = ['Dm', 'Eb', 'Bbm', 'A', 'Dm', 'Eb', 'Gsd', 'A'];
  SEC.b.vp = ['Fm', 'Cm', 'Eb', 'Bbm', 'Dm', 'Gsd', 'Eb', 'A'];
  SEC.brk.vp = SEC.intro.vp;
  for (const k in SEC) { const s = SEC[k]; s.ph = s.minor ? s.p : s.p.map(n => HERO[n] || n); s.pv = s.vp || s.p; }
  const ARP = [0, 2, 1, 3, 2, 4, 3, 2, 1, 3, 2, 4, 3, 5, 4, 2];
  const ACC = [1, .62, .78, .62, .92, .62, .78, .62, .95, .62, .78, .62, .9, .62, .78, .62];
  const KEYS = [0, 2, -2, 3];
  const H = (t, a = .007) => t + Math.random() * a;
  const V = (v, a = .16) => v * (1 - a + Math.random() * a * 2);
  const stepDur = () => 60 / (S.mode === 'menu' ? (S.side === 'villain' ? 66 : 72) : 116 + S.late * 10 - S.night * 4 + (S.side === 'hero' ? 2 : S.side === 'villain' ? -6 : 0)) / 4;

  function chooseNext() {
    const h = S.I + S.late * .15;
    switch (S.sec) {
      case 'intro': return 'verse';
      case 'verse': return 'b';
      case 'b': return h > .5 ? 'chorus' : 'brk';
      case 'brk': return h > .42 ? 'chorus' : 'verse';
      default: return h > .72 && S.chorusRun < 1 ? 'chorus' : S.cycle % 2 ? 'brk' : 'b';
    }
  }
  function enter(name) {
    const from = S.sec;
    if (name === 'chorus') { S.chorusRun = from === 'chorus' ? S.chorusRun + 1 : 0; S.sinceBig = 0; }
    if (name === 'verse' && (from === 'brk' || from === 'chorus')) { S.cycle++; S.key = KEYS[S.cycle % KEYS.length] + (S.late > .5 ? 1 : 0); }
    S.sec = name; S.bar = 0; S.jump = false; S.nextSec = null; S.pass[name] = (S.pass[name] || 0) + 1; S.mixT = 0;
  }
  function barEnd() {
    S.bar++; S.sinceBig++;
    if (S.mode === 'menu') { if (S.bar >= 16) { S.bar = 0; S.pass.menu = (S.pass.menu || 0) + 1; } return; }
    if (S.mode === 'match' && (S.jump || S.bar >= SEC[S.sec].n)) enter(S.nextSec || 'verse');
  }
  function line(arr, b, fn) { if (arr) for (const [s, n, d] of arr) if (s === b) fn(n, d); }
  // Steps until the next bass note, so overlapping notes cannot beat against each other.
  const bassGap = (p, b) => { for (let i = b + 1; i < 16; i++) if (p[i] !== '.') return i - b; return 16 - b; };

  function menuStep(b, t, spb) {
    const vil = S.side === 'villain', i = S.bar, ch = CH[(vil ? MENU_V_P : MENU_P)[i]], pass = S.pass.menu || 0, T = ch.slice(1), rich = pass % 2 === 1, a = ACC[b], drop = vil ? -12 : 0;
    if (b === 0) {
      choir(t, T, spb * 16, .03, W.oo);
      if (rich) choir(t, [T[1] + 12], spb * 16, .014, W.ah);
      bass(t, ch[0] + 12, .13, spb * 13);
      pluck(H(t), ch[0] + 24, .12, arpF, 1.1, 1);
    }
    if (b % 2 === 0 && (b || i % 2)) { const tones = [T[0], T[1], T[2], T[0] + 12, T[1] + 12, T[2] + 12]; pluck(H(t, .016), tones[ARP[b / 2 + (i % 2) * 8]], V(.085 * a), arpF, 1, 1); }
    line((vil ? MENU_V_T : MENU_T)[i], b, (n, d) => {
      bell(H(t), n + drop, V(.1, .1));
      if ((rich && i >= 8) || vil) horn(H(t), n - 12 + (vil ? 0 : drop), spb * d * .95, .034, L.horn);
    });
    if (rich && b % 4 === 3) mallet(H(t, .012), T[(b >> 2) % 3] + 12, V(.05), L.ctr, 0);
    if (!vil && i === 15 && b >= 8 && b % 2 === 0) pluck(H(t), 76 + (b - 8), V(.07), arpF, .9, 1);
  }

  function matchStep(b, t, spb) {
    const sec = SEC[S.sec], bar0 = S.bar;
    // Mood is decided at phrase starts, so hope or nightfall cannot change a chord's quality halfway through a bar.
    if (b === 0 && (bar0 % 4 === 0 || S.bright === null)) { S.bright = S.side === 'hero' && mood() >= .3; S.darkL = S.night > .55; }
    const vil = S.side === 'villain', bright = S.bright && !sec.minor, pr = vil ? sec.pv : bright ? sec.ph : sec.p, bar = S.bar, i = bar % pr.length, name = pr[i], ch = CH[name], I = S.I, K = S.key, a = ACC[b], late = S.late, night = S.darkL, pass = (S.pass[S.sec] || 1) - 1, h = I + late * .15, atEnd = bar + 1 >= sec.n;
    if (b === 0) {
      if (atEnd && !S.jump) S.nextSec = chooseNext();
      else if (!atEnd && S.sec !== 'chorus' && S.sec !== 'intro' && (bar + 1) % 4 === 0 && h > .76 && S.sinceBig >= 16) { S.jump = true; S.nextSec = 'chorus'; }
    }
    // The dark pedal holds D under the Phrygian chords, but lets the dominant and Bb minor have true roots so the cadence still lands.
    const pedal = (night || vil) && sec.ped && name !== 'A' && name !== 'Bbm';
    const ending = atEnd || S.jump, T = ch.slice(1).map(n => n + K), root = (pedal ? 38 : ch[0]) + K, tones = [T[0], T[1], T[2], T[0] + 12, T[1] + 12, T[2] + 12];
    const shift = night || vil ? -12 : 0, nv = night ? .72 : 1, dark = night || vil, tr = vil ? .84 : 1, low = vil ? -12 : 0, mine = mood();
    // Under the hero's major chords the minor third of D and G is raised, so one melody serves both moods.
    const fix = n => { if (!bright) return n; const pc = ((n % 12) + 12) % 12; return ((name === 'D' || name === 'D7') && pc === 5) || ((name === 'G' || name === 'G7') && pc === 10) ? n + 1 : n; };
    const brassT = T.map(n => n + low);

    if (b === 0) {
      if (i === 0 || pr[i - 1] !== name) { let run = 1; while (i + run < pr.length && pr[i + run] === name) run++; choir(t, S.sec === 'chorus' ? T.concat(T[0] + 12) : T, spb * 16 * run, .024 + .012 * I, S.sec === 'b' ? W.oo : W.ah); }
      if (ending && (S.nextSec === 'chorus' || S.sec === 'brk') && B.swell) smp(B.swell, t + Math.max(0, spb * 16 - B.swell.duration), 1, .1, mus, 0, false, 2);
      if (bar === 0 && S.sec === 'chorus' && B.crash) smp(B.crash, t, 1, .12, mus, 0, false, 2);
    }
    // Rhythm section
    const bc = sec.bs[b];
    if (bc !== '.') bass(H(t, .004), root + (bc === 'o' ? 12 : bc === '5' ? 7 : 0), V((.17 + I * .05) * a, .08), spb * Math.min(bc === 'x' ? 3.2 : 1.8, bassGap(sec.bs, b)) * .95);
    if (sec.arp && !(dark && b % 4) && (b % 2 === 0 || (sec.arp > 1 && I > .5) || I > .78)) pluck(H(t, .012), tones[ARP[b]], V((.075 + I * .03) * a), arpF, .5);
    if (sec.k[b] === 'x') smp(B.kick, H(t, .003), 1, V(.3 * a, .08), L.perc, 0, false, 2);
    if (sec.s[b] === 'x') smp(B.clack, H(t), rp(.05), V(.15), L.perc, 0, false, 1);
    if (sec.h[b] === 'x' || (I > .6 && b % 2 === 1 && Math.random() < .5)) smp(B.shk, H(t), rp(.08), V(.07 * a, .3), L.perc, 0, false, 0);
    if (sec.f[b] === 'x') smp(B.frame, H(t), rp(.04), V(.22 * a), L.perc, 0, false, 1);
    if (sec.t[b] === 'x') smp(B.taiko, H(t, .004), rp(.03) * tr, V(.27 * a, .1), L.taiko, 0, false, 2);
    // Late-game drive and section-ending fills
    if ((late > .35 || (vil && mine > .72)) && S.sec !== 'brk' && b % 8 === 4) smp(B.taiko, H(t), .86 * tr, V(.15 + late * .1, .1), L.taiko, 0, false, 1);
    if (late > .7 && S.sec === 'chorus' && b >= 12) smp(B.frame, H(t), 1.1, V(.18), L.perc, 0, false, 0);
    if (ending && b >= 8 && (b >= 12 || b % 2 === 0)) { const c = (b - 7) / 8; smp(B.taiko, H(t, .004), .95 + c * .2, V(.09 + c * .18, .08), L.taiko, 0, false, 2); }
    if (dark && i % 2 === 1 && b === 12 && name !== 'A') mallet(H(t), 68 + K + 12, .05, L.ctr, 1); // a lone tritone keeps the dark bars uneasy

    // Melody. Lines sound in one register on every side: the horn an octave below the written note, the bell at it.
    const sp = n => fix(n) + K + shift, top = n => fix(n) + K, hl = n => fix(n) + K - 12, drop = vil ? 6 : 5, TH = vil ? VTHEME : THEME, TH2 = vil ? VTHEME2 : THEME2, CT = vil ? VCOUNTER : COUNTER;
    switch (S.sec) {
      case 'intro': {
        const k = i >> 1, third = [3, 4, 3, 4][k];
        if (i % 2 === 0) line(mot((vil ? [62, 63, 56, 57] : [62, 58, 55, 57])[k], third, drop), b, (n, d) => horn(H(t), fix(n) + K, spb * d * .96, V(.068 + i * .004, .08)));
        else line(mot((vil ? [74, 75, 68, 69] : [74, 70, 67, 69])[k], third, drop), b, (n, d) => { if (d > 2) bell(H(t), fix(n) + K + 12 + low, V(.05)); });
        break;
      }
      case 'verse': {
        const second = bar >= 8, arr = (second && pass % 2 === 0 ? TH2 : TH)[i], side = S.side;
        const useHorn = side ? true : second ? pass % 2 === 0 : pass % 3 === 1, belled = side === 'hero' && (pass % 2 === 0 || second);
        line(arr, b, (n, d) => {
          if (useHorn) horn(H(t), hl(n), spb * d * .95, V(.075 * nv, .08)); else bell(H(t), top(n), V(.13 * nv, .1));
          if (belled) bell(H(t), top(n), V(.09 * nv, .1));
          if (vil && d >= 6) bell(H(t), top(n), V(.045));
          if (second) mallet(H(t), hl(n), V(.07 * nv), L.lead, 1);
        });
        if (side === 'hero' && b === 0) brass(t, T, spb * 14, .018 + I * .012);
        if (vil && (b === 0 || b === 10)) brass(H(t), brassT, spb * 2.6, .03 + I * .012);
        if (second || I > .5) line(CT[i], b, n => pluck(H(t, .012), sp(n), V(.1 * nv), L.ctr, .7, 1));
        break;
      }
      case 'b': {
        if (b === 0) brass(t, brassT.slice(0, 3), spb * 15, .016 + I * .012);
        line((vil ? VBTHEME : BTHEME)[i], b, (n, d) => {
          if (pass % 2) { bell(H(t), top(n), V(.09 * nv)); pluck(H(t), hl(n), V(.11 * nv), L.ctr, .9, 2); }
          else horn(H(t), hl(n), spb * d * .96, V(.07 * nv, .08));
        });
        break;
      }
      case 'brk': {
        const k = i >> 1, m = mot((vil ? [62, 63, 68, 69] : [62, 65, 67, 69])[k], [3, 4, 3, 4][k], drop);
        if (i % 2 === 0) line(m, b, (n, d) => { mallet(H(t), fix(n) + K + 12, V(.11), L.lead, 2); if (i >= 4 && d > 2) bell(H(t), fix(n) + K + 12, V(.05)); });
        else line(m, (b + 10) % 16, n => pluck(H(t, .012), fix(n) + K + 12, V(.06), L.ctr, .6, 1));
        break;
      }
      case 'chorus': {
        const arr = (bar >= 8 && pass % 2 === 0 ? TH2 : TH)[i];
        line(arr, b, (n, d) => { horn(H(t), hl(n), spb * d * .96, V(.1 * nv, .06)); bell(H(t), top(n), V(.1 * nv, .1)); });
        line(CT[i], b, n => mallet(H(t, .012), fix(n) + K + 12, V(.08 * nv), L.ctr, 1));
        if (b === 0) brass(H(t), brassT, spb * 9, .03 + late * .01);
        if (b === 10) brass(H(t), brassT, spb * 5.6, .026 + late * .01);
        break;
      }
    }
  }

  // ---------- clock and mix ----------
  const MENU_MIX = [1, .8, .85, .9, .55, .6, 0, 0], STING_MIX = [.95, .85, .9, 1, 1, .6, .4, .9], ZERO_MIX = [0, 0, 0, 0, 0, 0, 0, 0];
  function mixUpdate(tau = .7) {
    const now = ac.currentTime, I = S.I; let cut = 900, art = 2400, tgt = ZERO_MIX;
    if (S.sting) { tgt = STING_MIX; cut = 2600; art = 4200; }
    else if (S.mode === 'menu') { tgt = MENU_MIX; cut = S.side === 'villain' ? 1050 : 1700; art = S.side === 'villain' ? 2100 : 3200; }
    else if (S.mode === 'match') {
      const s = SEC[S.sec]; tgt = s.m.map((v, k) => v + (s.M[k] - v) * I);
      tgt[6] = Math.min(1, tgt[6] + S.late * .15); tgt[7] = Math.min(1, tgt[7] + S.late * .22);
      const open = S.sec === 'brk' ? .55 : S.sec === 'chorus' ? 1.2 : 1;
      const mo = mood(), vil = S.side === 'villain';
      tgt[4] = clamp(tgt[4] + (mo - .5) * .2 + (S.side === 'hero' ? .12 : 0));
      if (vil) { tgt[2] *= .7; tgt[3] *= .7; }
      cut = (640 + I * 2000 * open) * (1 - S.night * .4) * (.85 + mo * .3) * (vil ? .72 : 1.1); art = (1700 + I * 2800 - S.night * 700) * (vil ? .7 : 1);
    }
    LAYERS.forEach((k, i) => { if (mixL[i] === undefined || Math.abs(mixL[i] - tgt[i]) > .004 || tau !== .7) { mixL[i] = tgt[i]; L[k].gain.setTargetAtTime(tgt[i], now, tau); } });
    padF.frequency.setTargetAtTime(cut, now, .8); arpF.frequency.setTargetAtTime(Math.max(900, art * 1.55), now, .8); // brighter arp so it carries on phone speakers
    // As a fight heats up the arrangement gets denser, so the bus comes down to keep effects on top.
    const bus = S.music ? MUS * (S.sting ? 1.35 : 1) * (S.dim ? .45 : 1) * (S.mode === 'match' && !S.sting ? 1 - .22 * I : 1) : 0;
    mus.gain.setTargetAtTime(bus, now, .3);
    musWet.gain.setTargetAtTime(bus * 1.6, now, .3);
  }
  function tick() {
    if (!ac || ac.state !== 'running') return;
    const now = ac.currentTime, goal = clamp(S.intensity);
    S.I += (goal - S.I) * (goal > S.I ? .022 : .007);
    if (now >= S.mixT) { S.mixT = now + .25; mixUpdate(); }
    if (live.length > 48) { let j = 0; for (let i = 0; i < live.length; i++) if (live[i].end > now) live[j++] = live[i]; live.length = j; }
    // The first bar waits for the instruments, otherwise it would play with half its notes missing.
    if (!S.mode || !S.music || !musReady) { S.next = now + .12; return; }
    if (S.next < now) S.next = now + .08;
    while (S.next < now + .26) {
      const spb = stepDur(), b = S.step % 16;
      if (S.mode === 'menu') menuStep(b, S.next, spb); else matchStep(b, S.next, spb);
      S.next += spb; S.step++;
      if (S.step % 16 === 0) barEnd();
    }
  }
  function setMode(mode, force) {
    if (S.mode === mode && !force) return;
    clearTimeout(S.hand);
    const from = S.mode; S.sting = false; S.mode = mode; S.dim = false; S.bright = null;
    if (mode === 'menu' && (from === 'match' || S.stingAt > S.sideAt)) S.side = null; // back to the neutral, warm menu theme after a match
    if (!ac) return;
    release(.1);
    if (mode === 'menu') ambience(0, 0);
    S.step = 0; S.next = ac.currentTime + .24; S.bar = 0; S.jump = false; S.nextSec = null;
    if (mode === 'match') { S.key = 0; S.cycle = 0; S.sinceBig = 99; S.chorusRun = 0; S.pass = {}; S.hope = .5; S.I = Math.min(S.I, .2); enter('intro'); }
    S.mixT = 0;
  }
  // Both stingers finish the theme's unresolved half cadence, then return to the menu theme.
  function stinger(win) {
    if (!ac) { S.mode = 'menu'; return; }
    const stamp = performance.now(); if (stamp - S.stingAt < 8000) return; S.stingAt = stamp;
    setMode(null); S.sting = true; mixUpdate(.12);
    const t = ac.currentTime + .22;
    const horns = (seq, sh = 0, v = .13, b = 0) => seq.forEach(([d, n, l]) => { horn(t + d, n + sh, l, v); if (b) bell(t + d, n + sh + b, .11); });
    const hits = (ds, r, v) => { for (const d of ds) smp(B.taiko, t + d, r, v, L.taiko, 0, false, 2); };
    if (S.side === 'villain' && win) {
      // City fallen: the tritone motif, then a cold D minor with the tritone left ringing above it.
      horns([[0, 62, .7], [.72, 56, .28], [1.02, 62, .3], [1.36, 65, 2]], 0, .13);
      hits([0, .72, 1.36], .8, .36); if (B.crash) smp(B.crash, t + 1.36, .7, .15, mus, 0, false, 2);
      choir(t + 1.36, [50, 57, 62, 65], 3.4, .05); brass(t + 1.36, [38, 45, 50, 53], 2.4, .05); bass(t + 1.36, 38, .24, 3.2);
      [[2.3, 62], [2.75, 68], [3.3, 74], [3.9, 80]].forEach(([d, n], i) => bell(t + d, n, .09 - i * .01));
    } else if (S.side === 'villain') {
      // Thwarted: the motif sinks a semitone at a time and gutters out.
      horns([[0, 62, .8], [.8, 56, .5], [1.3, 55, .5], [1.8, 50, 1.9]], 0, .11);
      hits([0, 1.8], .7, .3); choir(t, [51, 58, 63], 1.8, .04); choir(t + 1.8, [50, 57, 65], 3.2, .04, W.oo);
      bass(t, 39, .18, 1.7); bass(t + 1.8, 38, .2, 3); bell(t + 2, 56, .08); bell(t + 3.1, 50, .08);
    } else if (win) {
      // City saved: the theme's half cadence finally lands on a bright D major.
      horns([[0, 62, .58], [.62, 69, .24], [.88, 74, .28], [1.2, 78, 1.9]], 0, .12, 12);
      hits([0, .62, 1.2], 1, .34);
      if (B.crash) smp(B.crash, t + 1.2, 1, .16, mus, 0, false, 2);
      choir(t + 1.2, [62, 66, 69, 74], 3.2, .045); brass(t + 1.2, [62, 66, 69], 2.4, .045); bass(t + 1.2, 38, .22, 3);
      [62, 66, 69, 74, 78, 81, 86, 90].forEach((n, i) => pluck(t + 1.25 + i * .09, n, .12, arpF, 1.4, 2));
      [[2.3, 86], [2.75, 90], [3.2, 90]].forEach(([d, n]) => bell(t + d, n, .1));
    } else {
      // The hero's defeat: the motif turned downward, a plagal sigh to D minor.
      horns([[0, 74, .85], [.85, 69, .5], [1.35, 65, .55], [1.9, 62, 1.8]], -12, .1);
      hits([0, 1.9], .78, .3);
      choir(t, [58, 65, 70], 1.9, .04); choir(t + 1.9, [57, 62, 65, 69], 3.2, .042, W.oo);
      bass(t, 34, .18, 1.8); bass(t + 1.9, 38, .2, 3); bell(t + 1.9, 74, .09); bell(t + 2.9, 69, .07); bell(t + 3.8, 62, .08);
    }
    S.hand = setTimeout(() => setMode('menu'), win ? 5600 : 6000);
  }

  // ---------- effects ----------
  let fxT = 0, fxOut = null, fxVol = 1, fxSend = null;
  const wet = () => { if (!fxSend) fxSend = gain(fxVol * FX_WET, revIn); return fxSend; };
  function tone(f, d, type = 'sine', v = .08, slide = 1, w = 0, dly = 0) {
    if (fxFull()) return;
    const t = fxT + dly, g = gain(0, fxOut); if (w) g.connect(wet());
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .003); g.gain.exponentialRampToValueAtTime(.0001, t + .003 + d);
    const o = osc(type, f, t, t + d + .05, 0, g, true);
    if (slide !== 1) { o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + d); }
  }
  function hiss(type, fr, q, v, d, w = 0, dly = 0, to = 0) {
    if (fxFull()) return;
    const t = fxT + dly, n = ac.createBufferSource(), g = gain(0, fxOut), f = filt(type, fr, q, g); if (w) g.connect(wet());
    n.buffer = noise; n.playbackRate.value = .85 + Math.random() * .3; n.connect(f);
    if (to) { f.frequency.setValueAtTime(fr, t); f.frequency.exponentialRampToValueAtTime(to, t + d); }
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .004); g.gain.exponentialRampToValueAtTime(.0001, t + .004 + d);
    n.start(t, Math.random() * 1.2); n.stop(t + d + .05); track(t + d + .05, true);
  }
  const sam = (b, rate, v, w = 0, dly = 0) => smp(b, fxT + dly, rate, v, fxOut, 0, true, 2, w ? wet() : null);
  const chime = (n, v, w = 0, dly = 0) => { if (B.ring) sam(B.ring.b, m2f(n) / B.ring.f, v, w, dly); };
  const metal = (rate, v, w, dly) => sam(pick(B.clink), rate, v, w, dly);
  const shower = (n, base = .85) => { for (let i = 0; i < n; i++) metal(base + Math.random() * .4, .09 * (1 - i / n * .55), 0, .03 + i * .06 + Math.random() * .03); };
  // Slow-swelling voice for the hope and dread cues, and the spin-up of the coin.
  function bloom(type, f, d, v, dly = 0, slide = 1) {
    if (fxFull()) return;
    const t = fxT + dly, g = gain(0, fxOut); g.connect(wet());
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + d * .45); g.gain.linearRampToValueAtTime(.0001, t + d);
    const o = osc(type, f, t, t + d + .05, 0, g, true);
    if (slide !== 1) { o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * slide, t + d); }
  }
  // Noise with a swell rather than a strike: the air of the spinning coin.
  function air(fr, to, q, v, d) {
    if (fxFull()) return;
    const t = fxT, n = ac.createBufferSource(), g = gain(0, fxOut), f = filt('bandpass', fr, q, g);
    n.buffer = noise; n.connect(f); f.frequency.setValueAtTime(fr, t); f.frequency.exponentialRampToValueAtTime(to, t + d);
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + d * .7); g.gain.linearRampToValueAtTime(.0001, t + d + .08);
    n.start(t, Math.random()); n.stop(t + d + .1); track(t + d + .1, true);
  }
  // The comic hit: a pitched "bwop" over a punch with a dry crack on top. Paired with POW-style words on screen.
  function comic(size) {
    sam(B.punch, (1.2 - size * .35) * rp(.06), .3 + size * .2);
    sam(B.snap, (1.05 - size * .2) * rp(.08), .14 + size * .1);
    tone((460 - size * 120) * rp(.08), .07 + size * .05, 'triangle', .1 + size * .05, .3);
  }
  const FX = {
    // interface: short, soft, mid-band
    clink(p = 1) { metal(p * rp(.05), .13); },
    coin(p = 1) { sam(B.clink[0], 1.05 * p * rp(.02), .12, 1); tone(1175 * p, .08, 'sine', .028, 1.1, 1); },
    tap() { tone(640, .035, 'triangle', .07, 1.3); },
    menuOpen() { tone(440, .07, 'triangle', .07, 1.5); tone(659.3, .09, 'triangle', .06, 1.12, 1, .05); hiss('bandpass', 900, .9, .03, .1, 0, 0, 1800); },
    menuBack() { tone(587.3, .07, 'triangle', .06, .72); tone(392, .1, 'triangle', .06, .85, 1, .05); },
    confirm() { sam(B.punch, 2.1, .1); tone(m2f(74), .14, 'triangle', .08, 1, 1); tone(m2f(81), .18, 'triangle', .08, 1, 1, .065); chime(86, .05, 1, .12); },
    cancel() { tone(380, .12, 'triangle', .07, .6); },
    ready() { chime(84, .07, 1); tone(1047, .08, 'sine', .02, 1, 1); },
    friendJoin() { [72, 76, 79, 84].forEach((n, i) => chime(n, .055 + i * .005, 1, i * .085)); tone(261.6, .4, 'sine', .05, 1, 1); },
    friendLeave() { chime(76, .07, 1); chime(71, .07, 1, .16); tone(196, .34, 'triangle', .06, .84, 1, .16); },
    // contact
    tick() { metal(.55 * rp(.18), .05); },
    hit() { metal(.75 * rp(.12), .09); sam(B.punch, 1.5 * rp(.1), .1); tone(190 * rp(.1), .06, 'triangle', .05, .55); },
    hitHard(p = 1) { sam(B.punch, 1.15 * rp(.1) * p, .26); metal(.62 * rp(.1), .12); hiss('bandpass', 1500, .9, .06, .05); },
    crit() { comic(.6); metal(.55 * rp(.06), .13, 1); chime(86, .05, 1); },
    thud() { sam(B.punch, .72 * rp(.08), .42); hiss('lowpass', 480, .5, .1, .1); },
    // The player's ability connected: an unmistakable rising pair, on top of whatever impact plays.
    hitConfirm(p = 1) { tone(987.8 * p, .055, 'triangle', .19); tone(1480 * p, .1, 'triangle', .18, 1, 1, .05); sam(B.punch, 1.5, .1); },
    pow() { comic(0); },
    bam() { comic(1); sam(B.boom, 1.8, .2); },
    // The player's ability hit nothing: dull air falling away, deliberately easy to ignore.
    whiff() { hiss('lowpass', 760, .6, .09, .13, 0, 0, 280); tone(210, .1, 'triangle', .03, .7); },
    // Something heavy is coming at the player: a rising two-pulse alarm, unlike any impact.
    danger() { for (const [d, f] of [[0, 440], [.13, 587.3]]) { tone(f, .1, 'sawtooth', .08, 1, 0, d); tone(f, .11, 'triangle', .18, 1, 0, d); } sam(B.punch, .7, .16); },
    // A tower has picked the player: low iron clangs, a tolling rather than an alarm.
    dangerTower() { for (const d of [0, .17]) { sam(B.clink[1], .4, .18, 1, d); tone(293.7, .14, 'triangle', .13, .94, 0, d); } },
    blast() { sam(B.boom, 1.1, .46); hiss('lowpass', 1200, .4, .14, .32, 1); shower(2); },
    // abilities
    snipe() { metal(1 * rp(.05), .09); tone(1500 * rp(.05), .1, 'triangle', .06, .3); hiss('bandpass', 2400, .8, .06, .07); sam(B.punch, 1.7, .12); },
    snipeFull() { chime(84, .09, 1); tone(1800, .2, 'triangle', .08, .2, 1); hiss('bandpass', 1800, .7, .1, .14, 1); sam(B.sub, 1.9, .24); },
    deadeye() { tone(190, .5, 'sawtooth', .045, 6, 1); hiss('bandpass', 1200, .7, .12, .38, 1, .02, 4200); chime(86, .1, 1, .42); sam(B.sub, 1.3, .38, 0, .42); tone(1400, .3, 'triangle', .07, .2, 1, .42); },
    orb() { tone(440, .28, 'sine', .08, 2.2, 1); tone(880, .2, 'triangle', .03, 2, 1, .02); chime(84, .06, 1); },
    ray() { tone(660, .22, 'triangle', .06, 1.4, 1); tone(990, .18, 'sine', .04, 1.4, 1); chime(81, .06, 1); },
    chain() { for (let i = 0; i < 5; i++) metal((.7 + i * .08) * rp(.05), .09 - i * .012, 0, i * .04); },
    bolt() { metal(.95 * rp(.12), .05); tone(1200 * rp(.08), .04, 'triangle', .03, .6); },
    mbolt() { metal(.6 * rp(.15), .03); },
    tshot() { tone(900, .12, 'triangle', .06, .25); sam(B.sub, 1.7 * rp(.08), .18); hiss('bandpass', 1000, 1, .06, .1); },
    swing() { hiss('bandpass', 1300, 1, .11, .06, 0, 0, 2800); },
    dash() { hiss('bandpass', 600, .8, .2, .2, 1, 0, 1900); tone(240, .15, 'sine', .05, 2); },
    slash() { hiss('bandpass', 1800, .9, .2, .1, 0, 0, 4200); metal(1.15 * rp(.08), .07, 1); },
    dome() { tone(330, .5, 'sine', .07, 1.5, 1); tone(660, .4, 'sine', .035, 1.5, 1); chime(76, .07, 1); chime(83, .05, 1, .1); },
    parry() { chime(86, .13, 1); sam(B.clink[0], 1.1, .18); sam(B.punch, 2, .14); },
    heal() { [76, 81, 85, 88].forEach((n, i) => chime(n, .07, 1, i * .055)); },
    rupture() { sam(B.sub, 1.1, .38); tone(260, .3, 'sawtooth', .04, .4, 1); hiss('lowpass', 1500, .5, .14, .26, 1); chime(76, .07, 1); },
    crash() { sam(B.boom, 1, .48); hiss('lowpass', 1200, .4, .18, .38, 1, 0, 300); shower(3); },
    stomp() { sam(B.boom, 1.35, .42); tone(150, .16, 'triangle', .08, .5); metal(.5, .12); },
    break() { [1, .8, 1.2].forEach((r, i) => metal(r * rp(.05), .14, 1, i * .03)); sam(B.sub, 1.5, .26); },
    blink() { tone(1000, .1, 'sine', .07, .45); hiss('bandpass', 2400, .8, .04, .07, 1); },
    stun() { [86, 89, 86].forEach((n, i) => chime(n, .05, 0, i * .05)); },
    mark() { chime(86, .04, 1); },
    // the people
    rescued() { [74, 78, 81, 86, 90].forEach((n, i) => chime(n, .075, 1, i * .06)); hiss('bandpass', 1400, 1.4, .05, .3, 1, .05, 2600); shower(2, 1); },
    seized() { for (const f of [73.4, 103.8]) tone(f * 2, .5, 'sawtooth', .05, .94, 1); sam(B.boom, 1.2, .4); chime(56, .14, 1); for (let i = 0; i < 3; i++) tone(700 + Math.random() * 500, .09, 'triangle', .03, i % 2 ? 1.4 : .7, 1, .14 + i * .09); },
    hopeSwell() { for (const [f, d] of [[146.8, 0], [220, .12], [293.7, .24], [370, .36]]) bloom(W.ah, f, 2.1, .04, d); [81, 86, 90].forEach((n, i) => chime(n, .08, 1, .55 + i * .14)); },
    dread() { for (const [f, d] of [[146.8, 0], [207.7, .1]]) bloom('sawtooth', f, 1.9, .045, d); sam(B.boom, .8, .38, 1); chime(56, .13, 1, .2); chime(62, .1, 1, .55); },
    // match events
    kill() { sam(B.boom, 1.6, .28); sam(B.punch, 1, .28); [81, 86, 89, 93].forEach((n, i) => chime(n - 5, .09, 1, i * .075)); shower(2); },
    death() { tone(330, .7, 'triangle', .1, .25, 1); sam(B.boom, 1.25, .36); chime(62, .1, 1, .05); },
    feed(m = 1) { chime(80 + Math.min(4, m) * 2, .06, 1); },
    level() { [74, 81, 86, 89].forEach((n, i) => chime(n, .09, 1, i * .07)); tone(440, .3, 'triangle', .04, 1, 1); },
    forge() { metal(.5, .22, 1); chime(81, .09, 1, .02); hiss('bandpass', 2600, 3, .1, .08, 1); sam(B.sub, 2.1, .14); },
    bossup() { tone(140, 1.3, 'sawtooth', .06, 1.4, 1); tone(210, 1.3, 'triangle', .14, 1.2, 1); sam(B.boom, .85, .36); },
    boss() { sam(B.boom, .95, .55); chime(62, .16, 1); chime(69, .12, 1, .05); shower(4, .8); },
    tower() { sam(B.boom, .9, .55); hiss('lowpass', 800, .4, .2, .75, 1, 0, 240); chime(55, .12, 1); shower(4, .75); },
    towerNews(good) { if (good) { chime(84, .1, 1); chime(91, .1, 1, .12); } else { tone(196, .4, 'triangle', .1, .75, 1); tone(147, .5, 'triangle', .09, .75, 1, .16); } },
    // A tower falling reads as news: a short brass-like call, up for the player's side and down against it.
    towerFall(good) {
      const seq = good ? [[62, 0, .12], [69, .11, .12], [74, .22, .34]] : [[62, 0, .14], [58, .14, .14], [53, .28, .42]];
      for (const [n, d, l] of seq) { tone(m2f(n), l, 'sawtooth', .05, 1, 1, d); tone(m2f(n), l, 'triangle', .1, 1, 1, d); }
      if (good) { chime(86, .09, 1, .22); chime(90, .08, 1, .3); }
    },
    // Coin burst over the stinger's landing. The stinger carries the music, so this is only sparkle.
    victory(dly = 0) { [86, 90, 93].forEach((n, i) => chime(n - 5, .08, 1, dly + i * .09)); for (let i = 0; i < 5; i++) metal(.9 + i * .07, .08 - i * .008, 0, dly + .04 + i * .075); },
    thunder() { hiss('lowpass', 560, .5, .26, 1.8, 1, .02, 90); sam(B.boom, .65, .24, 0, .04); },
    heart() { sam(B.sub, 1.25, .3); sam(B.sub, 1.45, .22, 0, .16); },
    recall() { tone(500, .5, 'sine', .07, 2, 1); chime(81, .06, 1, .1); },
    respawn() { tone(440, .3, 'triangle', .07, 2, 1); chime(86, .08, 1, .12); },
    whoosh() { hiss('bandpass', 500, .8, .24, .38, 1, 0, 1500); },
    title() { [62, 69, 74, 77, 81, 86].forEach((n, i) => { if (B.bell.length) smp(pickBell(n).b, fxT + i * .095, m2f(n) / pickBell(n).f, .12, fxOut, 0, true, 2, wet()); }); },
    // The coin flip. flipSpin carries its own slowing ticks, computed from the same easing as the coin on screen.
    flipSpin(dur = 1.16) {
      const bus = S.flip = gain(1, fxOut); fxOut = bus;
      air(420, 1700, .9, .1, dur); bloom('triangle', 150, dur, .06, 0, 2.6);
      for (let k = 3; k <= 12; k++) {
        if (lean && k < 8 && k % 2) continue;
        sam(B.clink[k % 3], .6 + k * .03, .05 + k * .006, 0, dur * (1 - Math.pow(1 - k / 12, 1 / 2.7)));
      }
    },
    flipSlam() {
      if (S.flip) { const t = ac.currentTime; hold(S.flip.gain, t); S.flip.gain.setTargetAtTime(0, t, .012); S.flip = null; }
      sam(B.boom, 1, .46); sam(B.punch, .72, .4); sam(B.snap, .7, .18); metal(.45, .16, 1); hiss('lowpass', 900, .4, .1, .3, 1, 0, 220);
    },
    flipReveal(side) {
      const vil = side === undefined ? S.side === 'villain' : side === 1 || side === 'villain', d = .14;
      if (vil) { for (const [f, o] of [[146.8, 0], [207.7, .07]]) { bloom('sawtooth', f, 1.1, .05, d + o); bloom('triangle', f * 2, 1.1, .05, d + o); } chime(68, .11, 1, d + .18); chime(62, .11, 1, d + .42); }
      else { [[62, 0], [69, .08], [74, .16], [78, .24]].forEach(([n, o]) => { tone(m2f(n), .5 - o, 'triangle', .1, 1, 1, d + o); tone(m2f(n), .4 - o, 'sawtooth', .03, 1, 1, d + o); }); chime(86, .1, 1, d + .24); chime(90, .09, 1, d + .34); }
    },
    versus() { sam(B.boom, 1.25, .42); sam(B.punch, .85, .38); sam(B.snap, .85, .18); metal(.5, .12, 1); for (const f of [146.8, 220, 293.7]) tone(f, .36, 'sawtooth', .04, .98, 1); },
  };
  function pickBell(n) { let e = B.bell[0]; for (const c of B.bell) if (Math.abs(c.n - n) < Math.abs(e.n - n)) e = c; return e; }
  const DUCK = {
    blast: .35, tower: .5, kill: .4, crash: .4, stomp: .3, rupture: .3, break: .25, boss: .5, bossup: .4, thunder: .2, deadeye: .25, death: .5, seized: .35, hopeSwell: .3, dread: .4,
    hitConfirm: .22, pow: .25, bam: .4, crit: .28, thud: .3, danger: .45, dangerTower: .4, towerFall: .4, victory: .1,
    flipSlam: .75, flipReveal: .55, versus: .65, friendJoin: .2, friendLeave: .15,
  };
  function duck(amount = .4, recover = .5) {
    if (!ac) return; if (S.sting) amount *= .4;
    const t = ac.currentTime, a = clamp(amount, 0, .85); if (t - S.duckAt < .1 && a <= S.duckAmt) return; S.duckAt = t; S.duckAmt = a;
    for (const g of [ducker, duckWet]) { g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(1 - a, t, .015); g.gain.setTargetAtTime(1, t + .1 + a * .14, recover); }
  }
  function flush() {
    if (!ac || !fxReady || ac.state !== 'running' || !early.length) return;
    const cut = performance.now() - 1500; for (const p of early.splice(0)) if (p.at > cut) play(p.name, p.a, p.gap, p.opts);
  }
  // opts: { pan: -1..1, vol: 0..1, low: true for routine sounds that are rate-limited and dropped first }
  function play(name, a, gap = 34, opts) {
    if (!ac || !S.sfx) return;
    const f = FX[name]; if (!f) return;
    if (!fxReady || ac.state !== 'running') { if (ac.state !== 'closed' && !document.hidden && early.length < 4) early.push({ name, a, gap, opts, at: performance.now() }); return; }
    const vol = opts && num(opts.vol) ? clamp(opts.vol) : 1, pan = opts && num(opts.pan) ? clamp(opts.pan, -1, 1) : 0, low = !!(opts && opts.low);
    // Prominent sounds may exceed the budget slightly: dropping the player's own hit is worse than one more voice.
    if (vol < .015 || count(fxEnds) >= fxCap() * (low ? .55 : vol < .99 ? .85 : 1.3)) return;
    const now = performance.now(), key = vol < .55 ? name + '~' : name; // a distant copy must not block a close one
    if (now - (last[key] === undefined ? -1e9 : last[key]) < gap) return;
    if (low) { if (now - S.lowAt < LOW_GAP) return; S.lowAt = now; }
    last[key] = now;
    fxOut = sfx; fxVol = vol; fxSend = null; fxT = ac.currentTime;
    if (vol < .99 || pan) { const dest = vol < .4 ? farBus : sfx; fxOut = gain(vol, pan ? panTo(pan, dest) : dest); }
    try { f(a); } catch (e) { }
    if (DUCK[name]) duck(DUCK[name] * vol, DUCK[name] > .45 ? .6 : .35);
  }
  function ambience(rain, wind) { if (!ac) return; const t = ac.currentTime; rainG.gain.setTargetAtTime(clamp(rain) * .04, t, .8); windG.gain.setTargetAtTime(clamp(wind) * .03, t, 1.2); }
  function setOn(music, fx) {
    S.music = music; S.sfx = fx; if (!ac) return; const t = ac.currentTime;
    if (!music) release(.1);
    S.mixT = 0; mus.gain.setTargetAtTime(music ? MUS : 0, t, .15); musWet.gain.setTargetAtTime(music ? MUS * 1.6 : 0, t, .15); sfx.gain.setTargetAtTime(fx ? SFX : 0, t, .1);
  }
  return {
    init, play, setMode, stinger, ambience, setOn, duck,
    setSide(v) {
      const next = v === 'hero' || v === 'villain' ? v : null, changed = next !== S.side;
      S.side = next; S.sideAt = performance.now();
      // In the menu a new side cuts cleanly to its theme, on the coin's impact, instead of clashing with the bar in progress.
      if (changed && ac && S.mode === 'menu') { release(.1); S.step = 0; S.bar = 0; S.pass.menu = 0; S.next = ac.currentTime + .5; }
    },
    hope(v) { S.hope = clamp(+v || 0); },
    intensity(v) { S.intensity = clamp(+v || 0); }, late(v) { S.late = clamp(+v || 0); }, night(v) { S.night = clamp(+v || 0); }, lean(v) { lean = autoLean || !!v; },
    // Softens the music behind a pause menu without stopping it.
    dim(v) { S.dim = !!v; S.mixT = 0; },
  };
})();
