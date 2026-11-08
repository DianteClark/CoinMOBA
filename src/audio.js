// Music and sound for Mintfall. Everything is synthesised at runtime, so there are no audio files.
// Struck and plucked timbres are rendered once into small buffers (two nodes per note at playback);
// sustained choir and brass voices are live oscillators sharing per-layer filters. Voice counts are capped.
const Sound = (() => {
  let ac = null, master, ducker, mus, musWet, sfx, farBus, revIn, rev, noise, rainG, windG, padA, padB, padF, arpF, timer = null, lean = false, autoLean = false;
  const L = {}, W = {}, B = { pluck: [], mal: [], bell: [], clink: [] }, last = {}, held = [];
  const S = { mode: null, sting: false, step: 0, next: 0, sec: 'intro', bar: 0, nextSec: null, jump: false, pass: {}, key: 0, cycle: 0, sinceBig: 99, chorusRun: 0, intensity: 0, I: 0, music: true, sfx: true, late: 0, night: 0, mixT: 0, hand: 0, stingAt: -99, duckAt: 0, side: null, sideAt: 0, hope: .5 };
  const MUS = .5, SFX = .95, LAYERS = ['pad', 'bass', 'arp', 'lead', 'horn', 'ctr', 'perc', 'taiko'];
  const SEND = { pad: .55, bass: 0, arp: .32, lead: .55, horn: .42, ctr: .32, perc: .05, taiko: .12 };
  const m2f = n => 440 * Math.pow(2, (n - 69) / 12);
  const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
  const gain = (v, to) => { const g = ac.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };
  const filt = (type, fr, q, to) => { const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = fr; f.Q.value = q; if (to) f.connect(to); return f; };
  const panTo = (v, to) => { if (!ac.createStereoPanner) return to; const p = ac.createStereoPanner(); p.pan.value = v; p.connect(to); return p; };
  const pick = a => a[Math.random() * a.length | 0];
  const rp = s => 1 + (Math.random() - .5) * 2 * s;

  // ---------- voice budget ----------
  let musLive = 0, fxLive = 0;
  const musCap = () => lean ? 26 : 42, fxCap = () => lean ? 18 : 28;
  const room = pri => musLive < musCap() * [.62, .85, 1][pri];
  function track(src, fx) { if (fx) fxLive++; else musLive++; src.onended = () => { if (fx) fxLive--; else musLive--; }; return src; }

  // ---------- setup ----------
  function wake() { if (ac && !document.hidden && ac.state !== 'running' && ac.state !== 'closed') { const p = ac.resume(); if (p && p.catch) p.catch(() => { }); } }
  function init() {
    if (ac) { wake(); return; }
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; return; }
    // Older iOS only unlocks once a source has played inside the gesture.
    const un = ac.createBufferSource(); un.buffer = ac.createBuffer(1, 1, 22050); un.connect(ac.destination); un.start(0); wake();
    autoLean = (navigator.deviceMemory || 4) < 3 || (navigator.hardwareConcurrency || 4) < 4; lean = lean || autoLean;

    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -13; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = .004; comp.release.value = .18; comp.connect(ac.destination);
    master = gain(.92, comp); ducker = gain(1, master); mus = gain(S.music ? MUS : 0, ducker);
    sfx = gain(S.sfx ? SFX : 0, master); farBus = filt('lowpass', 2300, .4, sfx);
    rev = ac.createConvolver(); rev.connect(gain(.34, master)); revIn = gain(1, rev); musWet = gain(S.music ? 1 : 0, revIn);
    const nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1; noise = nb;

    for (const k of LAYERS) { L[k] = gain(0, mus); if (SEND[k]) L[k].connect(gain(SEND[k], musWet)); }
    // Pad chain: two panned voice buses, shared filter, a vowel formant, and one modulated delay for chorus.
    const formant = filt('peaking', 820, 1.1, L.pad); formant.gain.value = 5;
    padF = filt('lowpass', 900, .5, formant);
    padA = gain(1, panTo(-.5, padF)); padB = gain(1, panTo(.5, padF));
    const chorus = ac.createDelay(.06); chorus.delayTime.value = .021; const lfo = ac.createOscillator(); lfo.frequency.value = .37; const depth = gain(.0034); lfo.connect(depth); depth.connect(chorus.delayTime); lfo.start();
    formant.connect(chorus); chorus.connect(panTo(.35, gain(.6, L.pad)));
    arpF = filt('lowpass', 2600, .4, L.arp);

    W.ah = wave([1, .95, .62, .42, .3, .2, .15, .1, .08, .05, .04, .03]);
    W.oo = wave([1, .42, .14, .07, .04, .02]);
    W.bass = wave([1, .62, .26, .13, .07, .03]);

    const bed = (fr, q, type) => { const n = ac.createBufferSource(); n.buffer = noise; n.loop = true; const g = gain(0, sfx), f = filt(type, fr, q, g); n.connect(f); n.start(); return g; };
    rainG = bed(3400, .4, 'highpass'); windG = bed(420, .7, 'bandpass');

    // Rendering is spread over timers so the first tap does not hitch.
    const jobs = buildJobs(), pump = () => { const j = jobs.shift(); if (!j) return; try { j(); } catch (e) { } setTimeout(pump, 10); };
    setTimeout(pump, 0);
    timer = setInterval(tick, 40);
    document.addEventListener('visibilitychange', () => { if (!ac) return; if (document.hidden) ac.suspend(); else wake(); });
    // Recovers from iOS interruptions such as phone calls.
    addEventListener('pointerup', wake, { passive: true });
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
    // Effects first, because they are heard first.
    [[2650, 3980, 5620, 7400, 10100], [3100, 4400, 6050, 8200, 11200], [2350, 3620, 5150, 7050, 9600]].forEach(fs => J.push(() => B.clink.push(render(.24, fs.map((f, i) => [f, 1 / (1 + i * .55), .1 / (1 + i * .55)]), .5, .0022, .9))));
    J.push(() => { B.ring = { f: 1318, b: render(1.2, [[1318, 1, .55], [2640, .3, .3], [3637, .42, .26], [7132, .2, .1]]) }; });
    J.push(() => { B.sub = render(.5, [[40, 1, .16, 125, .035], [80, .3, .07, 180, .02]], .35, .008, .3); });
    J.push(() => { B.boom = render(.95, [[33, 1, .34, 95, .06], [56, .45, .16, 130, .04]], .5, .12, .12); });
    // Reverb: exponential noise tail that darkens over time, like a stone hall.
    J.push(() => {
      const sr = ac.sampleRate, len = sr * 1.9 | 0, ir = ac.createBuffer(2, len, sr), dk = Math.pow(.001, 1 / len);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); let e = 1, lp = 0; for (let i = 0; i < len; i++) { lp += (Math.random() * 2 - 1 - lp) * (.78 - .64 * i / len); d[i] = lp * e; e *= dk; } }
      rev.buffer = ir;
    });
    J.push(() => { B.kick = render(.28, [[46, 1, .11, 160, .03]], .15, .006, .6); });
    J.push(() => { B.taiko = render(.9, [[68, 1, .32, 128, .045], [108, .4, .14, 175, .03], [235, .12, .05]], .5, .012, .22); });
    J.push(() => { B.frame = render(.3, [[98, 1, .09, 135, .02], [196, .35, .05], [420, .12, .02]], .6, .01, .35); });
    J.push(() => { B.clack = render(.14, [[420, .5, .02], [980, .25, .012]], 1, .035, .7); });
    J.push(() => { B.shk = render(.07, [[6100, .4, .016], [7900, .3, .012], [10400, .25, .01]], 1, .012, .95); });
    J.push(() => {
      B.crash = render(1.8, [[4200, .12, .7], [5700, .1, .55], [7300, .08, .4]], 1, .6, .92);
      const n = B.crash.length, r = ac.createBuffer(1, n, ac.sampleRate), a = B.crash.getChannelData(0), z = r.getChannelData(0);
      for (let i = 0; i < n; i++) z[i] = a[n - 1 - i]; B.swell = r;
    });
    for (const [n, s, t] of lean ? [[62, .5, 3], [76, .38, 2], [88, .25, 1.3]] : [[57, .5, 3.2], [64, .46, 2.9], [71, .42, 2.5], [78, .35, 2], [85, .28, 1.6], [92, .2, 1.2]]) J.push(() => B.pluck.push(string(n, s, t)));
    for (const n of [60, 72, 84]) mode(B.mal, n, f => render(1.1, [[f, 1, .42], [f * 3.93, .4, .08], [f * 9.2, .15, .025]], .25, .003, .6));
    for (const n of [72, 86]) mode(B.bell, n, f => render(2.2, [[f, 1, .9], [f * 2.01, .4, .5], [f * 2.76, .28, .22], [f * 4.1, .14, .1], [f * 5.4, .1, .06]], .1, .002, .7));
    return J;
  }

  // ---------- players ----------
  function smp(b, t, rate, v, bus, stop = 0, fx = false, pri = 1, send = null) {
    if (!b || (!fx && !room(pri))) return;
    const s = ac.createBufferSource(), g = gain(v, bus); s.buffer = b; s.playbackRate.value = rate; s.connect(g); if (send) g.connect(send);
    if (stop) { g.gain.setValueAtTime(v, t + stop); g.gain.linearRampToValueAtTime(.0001, t + stop + .05); s.start(t); s.stop(t + stop + .06); } else s.start(t);
    track(s, fx);
  }
  function osc(type, f, t, end, cents, bus, fx) {
    const o = ac.createOscillator(); if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type);
    o.frequency.value = f; if (cents) o.detune.value = cents; o.connect(bus); o.start(t); o.stop(end); track(o, fx); return o;
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
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + .012); g.gain.setTargetAtTime(v * .6, t + .03, d * .5); g.gain.setValueAtTime(v * .55, Math.max(t + .04, end - .03)); g.gain.linearRampToValueAtTime(.0001, end + .04);
    osc(W.bass, m2f(n), t, end + .06, 0, g);
  }
  // Choir-like pad: harmonically shaped oscillators, one detuned voice each side of the stereo field.
  function choir(t, ns, dur, v, w = W.ah) {
    if (!room(1)) return;
    const end = t + dur, atk = Math.min(.5, dur * .25), gA = gain(0, padA), gB = gain(0, padB);
    for (const g of [gA, gB]) { g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + atk); g.gain.setValueAtTime(v, Math.max(t + atk, end - .1)); g.gain.linearRampToValueAtTime(.0001, end + .36); }
    held.push(gA, gB); if (held.length > 8) held.splice(0, 2);
    ns.forEach((n, i) => { const f = m2f(n); if (lean) osc(w, f, t, end + .4, 0, i % 2 ? gB : gA); else { osc(w, f, t, end + .4, -7, gA); osc(w, f, t, end + .4, 7, gB); } });
  }
  // Soft brass chord: filtered saws through one shared swelling filter.
  function brass(t, ns, dur, v) {
    if (!room(1)) return;
    const g = gain(0, L.horn), f = filt('lowpass', 400, .7, g), c = 900 + S.I * 1900, end = t + dur;
    f.frequency.setValueAtTime(c * .35, t); f.frequency.exponentialRampToValueAtTime(c, t + .09); f.frequency.setTargetAtTime(c * .55, t + .14, dur * .5);
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + .05); g.gain.setValueAtTime(v, Math.max(t + .06, end - .05)); g.gain.linearRampToValueAtTime(.0001, end + .12);
    for (const n of ns) { const hz = m2f(n); osc('sawtooth', hz, t, end + .14, -5, f); if (!lean) osc('sawtooth', hz, t, end + .14, 6, f); }
  }
  // Horn lead: two saws, a filter that follows pitch, a small scoop into the note, late vibrato on long notes.
  function horn(t, n, dur, v, bus = L.horn) {
    if (!room(2)) return;
    const hz = m2f(n), end = t + dur, c = Math.min(5200, hz * (2.8 + S.I * 3)), g = gain(0, bus), f = filt('lowpass', hz, .6, g);
    f.frequency.setValueAtTime(hz * 1.2, t); f.frequency.exponentialRampToValueAtTime(c, t + .09); f.frequency.setTargetAtTime(c * .6, t + .15, Math.max(.2, dur * .6));
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + .045); g.gain.setValueAtTime(v * .92, Math.max(t + .05, end - .05)); g.gain.linearRampToValueAtTime(.0001, end + .1);
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
  // The Mintfall motif: long, short, short, long, climbing a triad. Everything grows from it.
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
      if ((rich && i >= 8) || vil) horn(H(t), n - 12 + drop, spb * d * .95, .034, L.horn);
    });
    if (rich && b % 4 === 3) mallet(H(t, .012), T[(b >> 2) % 3] + 12, V(.05), L.ctr, 0);
    if (!vil && i === 15 && b >= 8 && b % 2 === 0) pluck(H(t), 76 + (b - 8), V(.07), arpF, .9, 1);
  }

  function matchStep(b, t, spb) {
    const sec = SEC[S.sec], vil = S.side === 'villain', bright = S.side === 'hero' && !sec.minor && mood() >= .3, pr = vil ? sec.pv : bright ? sec.ph : sec.p, bar = S.bar, i = bar % pr.length, name = pr[i], ch = CH[name], I = S.I, K = S.key, a = ACC[b], late = S.late, night = S.night > .55, pass = (S.pass[S.sec] || 1) - 1, h = I + late * .15, atEnd = bar + 1 >= sec.n;
    if (b === 0) {
      if (atEnd && !S.jump) S.nextSec = chooseNext();
      else if (!atEnd && S.sec !== 'chorus' && S.sec !== 'intro' && (bar + 1) % 4 === 0 && h > .76 && S.sinceBig >= 16) { S.jump = true; S.nextSec = 'chorus'; }
    }
    const ending = atEnd || S.jump, T = ch.slice(1).map(n => n + K), root = ((night || vil) && sec.ped ? 38 : ch[0]) + K, tones = [T[0], T[1], T[2], T[0] + 12, T[1] + 12, T[2] + 12];
    const shift = night || vil ? -12 : 0, nv = night ? .72 : 1, dark = night || vil, tr = vil ? .84 : 1, low = vil ? -12 : 0, mine = mood();
    // Under the hero's major chords the minor third of D and G is raised, so one melody serves both moods.
    const fix = n => { if (!bright) return n; const pc = ((n % 12) + 12) % 12; return ((name === 'D' || name === 'D7') && pc === 5) || ((name === 'G' || name === 'G7') && pc === 10) ? n + 1 : n; };
    const brassT = T.map(n => n + low);

    if (b === 0) {
      if (i === 0 || pr[i - 1] !== name) { let run = 1; while (i + run < pr.length && pr[i + run] === name) run++; choir(t, S.sec === 'chorus' ? T.concat(T[0] + 12) : T, spb * 16 * run, .024 + .012 * I, S.sec === 'b' ? W.oo : W.ah); }
      if (ending && (S.nextSec === 'chorus' || S.sec === 'brk') && B.swell) smp(B.swell, t + spb * 16 - B.swell.duration, 1, .13, mus, 0, false, 2);
      if (bar === 0 && S.sec === 'chorus' && B.crash) smp(B.crash, t, 1, .17, mus, 0, false, 2);
    }
    // Rhythm section
    const bc = sec.bs[b];
    if (bc !== '.') bass(H(t, .004), root + (bc === 'o' ? 12 : bc === '5' ? 7 : 0), V((.17 + I * .05) * a, .08), spb * (bc === 'x' ? 3.2 : 1.8));
    if (sec.arp && !(dark && b % 4) && (b % 2 === 0 || (sec.arp > 1 && I > .5) || I > .78)) pluck(H(t, .012), tones[ARP[b]], V((.075 + I * .03) * a), arpF, .5);
    if (sec.k[b] === 'x') smp(B.kick, H(t, .003), 1, V(.44 * a, .08), L.perc, 0, false, 2);
    if (sec.s[b] === 'x') smp(B.clack, H(t), rp(.05), V(.2), L.perc, 0, false, 1);
    if (sec.h[b] === 'x' || (I > .6 && b % 2 === 1 && Math.random() < .5)) smp(B.shk, H(t), rp(.08), V(.11 * a, .3), L.perc, 0, false, 0);
    if (sec.f[b] === 'x') smp(B.frame, H(t), rp(.04), V(.3 * a), L.perc, 0, false, 1);
    if (sec.t[b] === 'x') smp(B.taiko, H(t, .004), rp(.03) * tr, V(.42 * a, .1), L.taiko, 0, false, 2);
    // Late-game drive and section-ending fills
    if ((late > .35 || (vil && mine > .72)) && S.sec !== 'brk' && b % 8 === 4) smp(B.taiko, H(t), .86 * tr, V(.24 + late * .16, .1), L.taiko, 0, false, 1);
    if (late > .7 && S.sec === 'chorus' && b >= 12) smp(B.frame, H(t), 1.1, V(.26), L.perc, 0, false, 0);
    if (ending && b >= 8 && (b >= 12 || b % 2 === 0)) { const c = (b - 7) / 8; smp(B.taiko, H(t, .004), .95 + c * .2, V(.14 + c * .3, .08), L.taiko, 0, false, 2); }
    if (dark && i % 2 === 1 && b === 12) mallet(H(t), 68 + K + 12, .05, L.ctr, 1); // a lone tritone keeps the dark bars uneasy

    // Melody
    const sp = n => fix(n) + K + shift, drop = vil ? 6 : 5, TH = vil ? VTHEME : THEME, TH2 = vil ? VTHEME2 : THEME2, CT = vil ? VCOUNTER : COUNTER;
    switch (S.sec) {
      case 'intro': {
        const k = i >> 1, third = [3, 4, 3, 4][k];
        if (i % 2 === 0) line(mot((vil ? [62, 63, 56, 57] : [62, 58, 55, 57])[k], third, drop), b, (n, d) => horn(H(t), fix(n) + K + low, spb * d * .96, V(.068 + i * .004, .08)));
        else line(mot((vil ? [74, 75, 68, 69] : [74, 70, 67, 69])[k], third, drop), b, (n, d) => { if (d > 2) bell(H(t), fix(n) + K + 12 + low, V(.05)); });
        break;
      }
      case 'verse': {
        const second = bar >= 8, arr = (second && pass % 2 === 0 ? TH2 : TH)[i], side = S.side;
        const useHorn = side ? true : second ? pass % 2 === 0 : pass % 3 === 1, belled = side === 'hero' && (pass % 2 === 0 || second);
        line(arr, b, (n, d) => {
          if (useHorn) horn(H(t), sp(n) - 12, spb * d * .95, V(.075 * nv, .08)); else bell(H(t), sp(n), V(.13 * nv, .1));
          if (belled) bell(H(t), sp(n), V(.1 * nv, .1));
          if (vil && d >= 6) bell(H(t), sp(n) + 12, V(.045));
          if (second) mallet(H(t), sp(n) - 12, V(.07 * nv), L.lead, 1);
        });
        if (side === 'hero' && b === 0) brass(t, T, spb * 14, .018 + I * .012);
        if (vil && (b === 0 || b === 10)) brass(H(t), brassT, spb * 2.6, .03 + I * .012);
        if (second || I > .5) line(CT[i], b, n => pluck(H(t, .012), sp(n), V(.1 * nv), L.ctr, .7, 1));
        break;
      }
      case 'b': {
        if (b === 0) brass(t, brassT.slice(0, 3), spb * 15, .016 + I * .012);
        line((vil ? VBTHEME : BTHEME)[i], b, (n, d) => {
          if (pass % 2) { bell(H(t), sp(n) + 12, V(.09 * nv)); pluck(H(t), sp(n), V(.11 * nv), L.ctr, .9, 2); }
          else horn(H(t), sp(n) - 12, spb * d * .96, V(.07 * nv, .08));
        });
        break;
      }
      case 'brk': {
        const k = i >> 1, m = mot((vil ? [62, 63, 68, 69] : [62, 65, 67, 69])[k], [3, 4, 3, 4][k], drop);
        if (i % 2 === 0) line(m, b, (n, d) => { mallet(H(t), sp(n), V(.11), L.lead, 2); if (i >= 4 && d > 2) bell(H(t), sp(n) + 12, V(.05)); });
        else line(m, (b + 10) % 16, n => pluck(H(t, .012), sp(n) + 12, V(.06), L.ctr, .6, 1));
        break;
      }
      case 'chorus': {
        const arr = (bar >= 8 && pass % 2 === 0 ? TH2 : TH)[i];
        line(arr, b, (n, d) => { horn(H(t), sp(n) - 12, spb * d * .96, V(.1 * nv, .06)); bell(H(t), sp(n) + (bar >= 8 ? 0 : 12), V(.11 * nv, .1)); });
        line(CT[i], b, n => mallet(H(t, .012), sp(n) + 12, V(.09 * nv), L.ctr, 1));
        if (b === 0) brass(H(t), brassT, spb * 9, .03 + late * .01);
        if (b === 10) brass(H(t), brassT, spb * 5.6, .026 + late * .01);
        break;
      }
    }
  }

  // ---------- clock and mix ----------
  const MENU_MIX = [1, .8, .85, .9, .55, .6, 0, 0], STING_MIX = [.95, .85, .9, 1, 1, .6, .4, .9], ZERO_MIX = [0, 0, 0, 0, 0, 0, 0, 0];
  function mixUpdate(tau = .7) {
    const now = ac.currentTime, I = S.I; let cut = 900, art = 2600, tgt = ZERO_MIX;
    if (S.sting) { tgt = STING_MIX; cut = 3200; art = 6000; }
    else if (S.mode === 'menu') { tgt = MENU_MIX; cut = S.side === 'villain' ? 1050 : 1700; art = S.side === 'villain' ? 2100 : 3600; }
    else if (S.mode === 'match') {
      const s = SEC[S.sec]; tgt = s.m.map((v, k) => v + (s.M[k] - v) * I);
      tgt[6] = Math.min(1, tgt[6] + S.late * .15); tgt[7] = Math.min(1, tgt[7] + S.late * .22);
      const open = S.sec === 'brk' ? .55 : S.sec === 'chorus' ? 1.2 : 1;
      const mo = mood(), vil = S.side === 'villain';
      tgt[4] = clamp(tgt[4] + (mo - .5) * .2 + (S.side === 'hero' ? .12 : 0));
      if (vil) { tgt[2] *= .7; tgt[3] *= .7; }
      cut = (640 + I * 2600 * open) * (1 - S.night * .4) * (.85 + mo * .3) * (vil ? .72 : 1.1); art = (1700 + I * 5200 - S.night * 700) * (vil ? .7 : 1);
    }
    LAYERS.forEach((k, i) => L[k].gain.setTargetAtTime(tgt[i], now, tau));
    padF.frequency.setTargetAtTime(cut, now, .8); arpF.frequency.setTargetAtTime(Math.max(600, art), now, .8);
  }
  function tick() {
    if (!ac || ac.state !== 'running') return;
    const now = ac.currentTime, goal = clamp(S.intensity);
    S.I += (goal - S.I) * (goal > S.I ? .022 : .007);
    if (now >= S.mixT) { S.mixT = now + .25; mixUpdate(); }
    if (!S.mode || !S.music) { S.next = now + .12; return; }
    if (S.next < now) S.next = now + .08;
    while (S.next < now + .26) {
      const spb = stepDur(), b = S.step % 16;
      if (S.mode === 'menu') menuStep(b, S.next, spb); else matchStep(b, S.next, spb);
      S.next += spb; S.step++;
      if (S.step % 16 === 0) barEnd();
    }
  }
  function releaseHeld() { const now = ac.currentTime; for (const g of held) { g.gain.cancelScheduledValues(now); g.gain.setTargetAtTime(0, now, .16); } held.length = 0; }
  function setMode(mode, force) {
    if (S.mode === mode && !force) return;
    clearTimeout(S.hand); S.sting = false; S.mode = mode;
    if (mode === 'menu' && S.stingAt > S.sideAt) S.side = null; // back to the neutral, warm menu theme after a match
    if (!ac) return;
    releaseHeld();
    S.step = 0; S.next = ac.currentTime + .14; S.bar = 0; S.jump = false; S.nextSec = null;
    if (mode === 'match') { S.key = 0; S.cycle = 0; S.sinceBig = 99; S.chorusRun = 0; S.pass = {}; S.hope = .5; S.I = Math.min(S.I, .2); enter('intro'); }
    S.mixT = 0;
  }
  // Both stingers finish the theme's unresolved half cadence, then return to the menu theme.
  function stinger(win) {
    if (!ac) { S.mode = 'menu'; return; }
    const stamp = performance.now(); if (stamp - S.stingAt < 8000) return; S.stingAt = stamp;
    setMode(null); S.sting = true; mixUpdate(.12);
    const t = ac.currentTime + .18;
    const horns = (seq, sh = 0, v = .13, b = 0) => seq.forEach(([d, n, l]) => { horn(t + d, n + sh, l, v); if (b) bell(t + d, n + sh + b, .14); });
    const hits = (ds, r, v) => { for (const d of ds) smp(B.taiko, t + d, r, v, L.taiko, 0, false, 2); };
    if (S.side === 'villain' && win) {
      // City fallen: the tritone motif, then a cold D minor with the tritone left ringing above it.
      horns([[0, 62, .7], [.72, 56, .28], [1.02, 62, .3], [1.36, 65, 2]], -12, .15);
      hits([0, .72, 1.36], .8, .55); if (B.crash) smp(B.crash, t + 1.36, .7, .2, mus, 0, false, 2);
      choir(t + 1.36, [50, 57, 62, 65], 3.4, .055); brass(t + 1.36, [38, 45, 50, 53], 2.4, .06); bass(t + 1.36, 38, .26, 3.2);
      [[2.3, 62], [2.75, 68], [3.3, 74], [3.9, 80]].forEach(([d, n], i) => bell(t + d, n, .1 - i * .012));
    } else if (S.side === 'villain') {
      // Thwarted: the motif sinks a semitone at a time and gutters out.
      horns([[0, 62, .8], [.8, 56, .5], [1.3, 55, .5], [1.8, 50, 1.9]], -12, .12);
      hits([0, 1.8], .7, .42); choir(t, [51, 58, 63], 1.8, .04); choir(t + 1.8, [50, 57, 65], 3.2, .042, W.oo);
      bass(t, 39, .2, 1.7); bass(t + 1.8, 38, .22, 3); bell(t + 2, 56, .09); bell(t + 3.1, 50, .09);
    } else if (win) {
      // City saved: the theme's half cadence finally lands on a bright D major.
      horns([[0, 62, .58], [.62, 69, .24], [.88, 74, .28], [1.2, 78, 1.9]], 0, .13, 12);
      hits([0, .62, 1.2], 1, .5);
      if (B.crash) smp(B.crash, t + 1.2, 1, .22, mus, 0, false, 2);
      choir(t + 1.2, [62, 66, 69, 74], 3.2, .05); brass(t + 1.2, [62, 66, 69], 2.4, .05); bass(t + 1.2, 38, .24, 3);
      [62, 66, 69, 74, 78, 81, 86, 90].forEach((n, i) => pluck(t + 1.25 + i * .09, n, .14, arpF, 1.4, 2));
      [[2.3, 86], [2.75, 90], [3.2, 93]].forEach(([d, n]) => bell(t + d, n, .13));
    } else {
      // The hero's defeat: the motif turned downward, a plagal sigh to D minor.
      horns([[0, 74, .85], [.85, 69, .5], [1.35, 65, .55], [1.9, 62, 1.8]], -12, .1);
      hits([0, 1.9], .78, .45);
      choir(t, [58, 65, 70], 1.9, .042); choir(t + 1.9, [57, 62, 65, 69], 3.2, .046, W.oo);
      bass(t, 34, .2, 1.8); bass(t + 1.9, 38, .22, 3); bell(t + 1.9, 74, .1); bell(t + 2.9, 69, .07); bell(t + 3.8, 62, .08);
    }
    S.hand = setTimeout(() => setMode('menu'), win ? 5600 : 6000);
  }

  // ---------- effects ----------
  let fxT = 0, fxOut = null, fxVol = 1, fxSend = null;
  const wet = () => { if (!fxSend) fxSend = fxVol >= .99 ? revIn : gain(fxVol, revIn); return fxSend; };
  function tone(f, d, type = 'sine', v = .08, slide = 1, w = 0, dly = 0) {
    const t = fxT + dly, g = gain(0, fxOut); if (w) g.connect(wet());
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .003); g.gain.exponentialRampToValueAtTime(.0001, t + .003 + d);
    const o = osc(type, f, t, t + d + .05, 0, g, true);
    if (slide !== 1) { o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + d); }
  }
  function hiss(type, fr, q, v, d, w = 0, dly = 0, to = 0) {
    const t = fxT + dly, n = ac.createBufferSource(), g = gain(0, fxOut), f = filt(type, fr, q, g); if (w) g.connect(wet());
    n.buffer = noise; n.playbackRate.value = .85 + Math.random() * .3; n.connect(f);
    if (to) { f.frequency.setValueAtTime(fr, t); f.frequency.exponentialRampToValueAtTime(to, t + d); }
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .004); g.gain.exponentialRampToValueAtTime(.0001, t + .004 + d);
    n.start(t, Math.random() * 1.2); n.stop(t + d + .05); track(n, true);
  }
  const sam = (b, rate, v, w = 0, dly = 0) => smp(b, fxT + dly, rate, v, fxOut, 0, true, 2, w ? wet() : null);
  const chime = (n, v, w = 0, dly = 0) => { if (B.ring) sam(B.ring.b, m2f(n) / B.ring.f, v, w, dly); };
  const metal = (rate, v, w, dly) => sam(pick(B.clink), rate, v, w, dly);
  const shower = (n, base = .9) => { for (let i = 0; i < n; i++) metal(base + Math.random() * .7, .13 * (1 - i / n * .55), 0, .03 + i * .058 + Math.random() * .03); };
  // Slow-swelling voice for the hope and dread cues.
  function bloom(type, f, d, v, dly = 0) {
    const t = fxT + dly, g = gain(0, fxOut); g.connect(wet());
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + d * .45); g.gain.linearRampToValueAtTime(.0001, t + d);
    osc(type, f, t, t + d + .05, 0, g, true);
  }
  const FX = {
    // interface
    clink(p = 1) { metal(p * rp(.05), .22); },
    coin(p = 1) { sam(B.clink[0], 1.35 * p * rp(.02), .2, 1); tone(1760 * p, .09, 'sine', .04, 1.15, 1); },
    tap() { tone(900, .05, 'triangle', .05, 1.4); },
    cancel() { tone(420, .14, 'triangle', .08, .55); sam(B.clink[1], .5, .1); },
    ready() { chime(88, .1, 1); tone(1980, .1, 'sine', .025, 1, 1); },
    // contact
    tick() { metal(.55 * rp(.18), .06); },
    hit() { metal(.8 * rp(.12), .16); tone(210 * rp(.1), .07, 'triangle', .07, .55); hiss('bandpass', 2600, 1, .05, .04); },
    hitHard(p = 1) { metal(.62 * rp(.1) * p, .3); sam(B.sub, 1.6 * rp(.1), .22); hiss('bandpass', 1800, .9, .11, .06); },
    crit() { metal(.5 * rp(.06), .36, 1); chime(93, .12, 1); sam(B.sub, 1.3 * rp(.08), .34); hiss('highpass', 3000, .8, .14, .07); },
    thud() { sam(B.sub, 1.2 * rp(.1), .42); hiss('lowpass', 500, .5, .1, .1); metal(.4, .12); },
    blast() { sam(B.boom, 1.1, .55); hiss('lowpass', 1400, .4, .2, .34, 1); shower(4, .9); },
    // abilities
    snipe() { metal(1.3 * rp(.05), .14); tone(2600 * rp(.05), .12, 'sawtooth', .04, .25); hiss('highpass', 3200, .6, .1, .08); },
    snipeFull() { chime(86, .16, 1); tone(3000, .24, 'sawtooth', .06, .12, 1); hiss('highpass', 2000, .6, .18, .16, 1); sam(B.sub, 1.9, .25); },
    deadeye() { tone(190, .5, 'sawtooth', .075, 7, 1); hiss('highpass', 1400, .6, .22, .38, 1, .02, 8000); chime(93, .15, 1, .42); sam(B.sub, 1.3, .4, 0, .42); tone(2400, .35, 'sawtooth', .05, .1, 1, .42); },
    orb() { tone(440, .28, 'sine', .085, 2.4, 1); tone(880, .2, 'triangle', .03, 2, 1, .02); chime(88, .09, 1); hiss('bandpass', 2000, 2, .05, .18, 0, 0, 900); },
    ray() { tone(880, .24, 'triangle', .06, 1.5, 1); tone(1320, .2, 'sine', .045, 1.5, 1); chime(81, .08, 1); },
    chain() { for (let i = 0; i < 6; i++) metal((.75 + i * .09) * rp(.05), .13 - i * .012, 0, i * .036); },
    bolt() { metal(1.1 * rp(.12), .05); tone(2000 * rp(.08), .04, 'triangle', .018, .6); },
    mbolt() { metal(.7 * rp(.15), .035); },
    tshot() { tone(1500, .12, 'sawtooth', .05, .18); sam(B.sub, 1.7 * rp(.08), .2); hiss('bandpass', 1100, 1, .08, .1); },
    swing() { hiss('bandpass', 1700, 1, .05, .06, 0, 0, 3600); },
    dash() { hiss('bandpass', 700, .8, .16, .22, 1, 0, 2300); tone(280, .16, 'sine', .04, 2.1); metal(1.25, .06, 0, .12); },
    slash() { hiss('highpass', 2600, .8, .17, .12, 0, 0, 6000); metal(1.55 * rp(.08), .08, 1); tone(900, .08, 'sawtooth', .02, .4); },
    dome() { tone(330, .5, 'sine', .075, 1.5, 1); tone(660, .4, 'sine', .04, 1.5, 1); chime(76, .09, 1); chime(83, .07, 1, .08); chime(88, .07, 1, .16); },
    parry() { chime(91, .2, 1); chime(98, .12, 1, .02); sam(B.clink[0], 1.5, .3); hiss('highpass', 5000, .7, .14, .07); },
    heal() { [81, 86, 90, 93].forEach((n, i) => chime(n, .09, 1, i * .055)); tone(440, .4, 'sine', .03, 1.5, 1); },
    rupture() { sam(B.sub, 1.1, .42); tone(260, .3, 'sawtooth', .05, .4, 1); hiss('lowpass', 1700, .5, .18, .26, 1); chime(81, .1, 1); },
    crash() { sam(B.boom, 1, .55); hiss('lowpass', 1300, .4, .24, .4, 1, 0, 300); shower(5, .9); },
    stomp() { sam(B.boom, 1.35, .5); tone(150, .16, 'triangle', .06, .5); metal(.4, .18); },
    break() { [1, 1.35, .8, 1.7, 1.12].forEach((r, i) => metal(r * rp(.05), .2, 1, i * .026)); sam(B.sub, 1.5, .28); },
    blink() { tone(1400, .1, 'sine', .04, .4); hiss('highpass', 4000, .7, .06, .07, 1); },
    stun() { [96, 100, 96].forEach((n, i) => chime(n, .05, 0, i * .05)); },
    mark() { chime(96, .05, 1); },
    // the people
    rescued() { [74, 78, 81, 86, 90, 93].forEach((n, i) => chime(n + 12, .1, 1, i * .06)); for (let i = 0; i < 5; i++) hiss('bandpass', 1200 + i * 450, 1.4, .05, .3, 1, .05 + i * .05, 2400 + i * 500); shower(7, 1.1); },
    seized() { for (const f of [73.4, 103.8, 146.8]) tone(f, .55, 'sawtooth', .085, .94, 1); sam(B.boom, 1.2, .5); chime(56, .2, 1); for (let i = 0; i < 7; i++) { const f = 900 + Math.random() * 900; tone(f, .09, 'triangle', .022, i % 2 ? 1.5 : .7, 1, .14 + i * .075); hiss('bandpass', 1500 + Math.random() * 1400, 3, .04, .07, 0, .14 + i * .08); } },
    hopeSwell() { for (const [f, d] of [[146.8, 0], [220, .1], [293.7, .2], [370, .3], [440, .42]]) bloom(W.ah, f, 2.2, .05, d); [86, 90, 93, 98].forEach((n, i) => chime(n, .1, 1, .55 + i * .13)); },
    dread() { for (const [f, d] of [[73.4, 0], [103.8, .08]]) bloom('sawtooth', f, 2, .07, d); sam(B.boom, .7, .5, 1); chime(56, .16, 1, .2); chime(62, .12, 1, .55); },
    // match events
    kill() { sam(B.boom, 1.6, .32); [86, 81, 86, 89, 93].forEach((n, i) => chime(n, .12, 1, i * .075)); shower(6, .9); },
    death() { tone(330, .7, 'triangle', .1, .25, 1); sam(B.boom, 1.25, .4); chime(62, .14, 1, .05); },
    feed(m = 1) { chime(84 + Math.min(4, m) * 2, .08, 1); },
    level() { [74, 81, 86, 89, 93].forEach((n, i) => chime(n, .12, 1, i * .07)); tone(880, .3, 'triangle', .04, 1, 1); },
    forge() { metal(.45, .35, 1); chime(81, .12, 1, .02); hiss('bandpass', 4200, 3, .18, .08, 1); sam(B.sub, 2.1, .16); },
    bossup() { tone(70, 1.4, 'sawtooth', .1, 1.4, 1); tone(105, 1.4, 'sine', .12, 1.2, 1); sam(B.boom, .8, .4); },
    boss() { sam(B.boom, .9, .7); chime(50, .3, 1); chime(57, .18, 1, .04); shower(12, .8); },
    tower() { sam(B.boom, .85, .7); hiss('lowpass', 900, .4, .28, .8, 1, 0, 240); chime(55, .2, 1); shower(14, .75); },
    towerNews(good) { if (good) { chime(86, .12, 1); chime(93, .12, 1, .12); } else { tone(196, .4, 'triangle', .1, .75, 1); tone(147, .5, 'triangle', .09, .75, 1, .16); } },
    thunder() { hiss('lowpass', 340, .5, .34, 1.9, 1, .02, 90); sam(B.boom, .6, .35, 0, .04); },
    heart() { sam(B.sub, 1.7, .4); sam(B.sub, 1.9, .3, 0, .16); },
    recall() { tone(500, .5, 'sine', .08, 2, 1); chime(81, .07, 1, .1); },
    respawn() { tone(440, .3, 'triangle', .07, 2, 1); chime(86, .1, 1, .12); },
    whoosh() { hiss('bandpass', 500, .8, .22, .4, 1, 0, 1600); },
    title() { [62, 69, 74, 77, 81, 86].forEach((n, i) => { if (B.bell.length) note(B.bell, fxT + i * .095, n, .16, wet(), 0, 2); }); },
  };
  const DUCK = { blast: .4, tower: .55, kill: .4, crash: .45, stomp: .32, rupture: .3, break: .3, boss: .5, bossup: .4, thunder: .25, deadeye: .25, death: .35, seized: .4, hopeSwell: .3, dread: .4 };
  function duck(amount = .4, recover = .7) {
    if (!ac) return; const t = ac.currentTime; if (t - S.duckAt < .12) return; S.duckAt = t;
    ducker.gain.setTargetAtTime(1 - clamp(amount, 0, .85), t, .018); ducker.gain.setTargetAtTime(1, t + .12, recover);
  }
  // opts: { pan: -1..1, vol: 0..1, low: true for sounds that may be dropped when busy }
  function play(name, a, gap = 34, opts) {
    if (!ac || !S.sfx || ac.state !== 'running') return;
    const f = FX[name]; if (!f) return;
    const vol = opts && opts.vol != null ? opts.vol : 1, pan = opts && opts.pan || 0;
    if (vol < .02 || fxLive >= fxCap() * (opts && opts.low ? .6 : 1)) return;
    const now = performance.now(); if (now - (last[name] || 0) < gap) return; last[name] = now;
    fxOut = sfx; fxVol = vol; fxSend = null; fxT = ac.currentTime;
    if (vol < .99 || pan) { const dest = vol < .55 ? farBus : sfx; fxOut = gain(vol, pan ? panTo(pan, dest) : dest); }
    f(a);
    if (DUCK[name]) duck(DUCK[name] * vol);
  }
  function ambience(rain, wind) { if (!ac) return; const t = ac.currentTime; rainG.gain.setTargetAtTime(clamp(rain) * .1, t, .8); windG.gain.setTargetAtTime(clamp(wind) * .05, t, 1.5); }
  function setOn(music, fx) {
    S.music = music; S.sfx = fx; if (!ac) return; const t = ac.currentTime;
    mus.gain.setTargetAtTime(music ? MUS : 0, t, .15); musWet.gain.setTargetAtTime(music ? 1 : 0, t, .15); sfx.gain.setTargetAtTime(fx ? SFX : 0, t, .1);
  }
  return {
    init, play, setMode, stinger, ambience, setOn, duck,
    setSide(v) { S.side = v === 'hero' || v === 'villain' ? v : null; S.sideAt = performance.now(); },
    hope(v) { S.hope = clamp(+v || 0); },
    intensity(v) { S.intensity = clamp(+v || 0); }, late(v) { S.late = clamp(+v || 0); }, night(v) { S.night = clamp(+v || 0); }, lean(v) { lean = autoLean || !!v; },
  };
})();
