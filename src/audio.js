// Music and sound for Flipside. Everything is synthesised at runtime, so there are no audio files.
// Struck and plucked timbres are rendered once into small buffers; sustained voices are live oscillators sharing per-layer filters.
// Gain staging, in linear peaks at the compressor input: music sits near .25, routine effects near .15, the player's own big moments near .5.
// The compressor only has to catch stacks of effects, and a soft clipper after it makes digital clipping impossible.
//
// Named effects for the UI: Sound.play(name, arg, gapMs, {vol, pan}).
//   Shop and items: shopOpen shopClose buy buyUp sell denied
//   Choices: evolveReady evolve buildPick
//   Attack-mode buttons: atkChamp atkMinion atkTower
//   Store and progress: storeBuy equip masteryUnlock rankUp rankDown
//   Stingers: stingOk stingBad stingHero stingVillain
//   Shop tabs: shopCat(categoryKey). Lane proficiency: profPick(index). Settings: targetPref accountOpen copyCode importOk importBad resetWarn resetDone.
//   Any element with data-snd="name" plays that effect on press and replaces the generic tap (see soundhooks).
//   Handled by soundhooks from match events, no UI call needed: beaconPlace beaconHit beaconKill pingAttack pingRetreat pingOmw pingHelp pingDanger, every ability, and buy/sell/evolve as a backstop.
// Sound.has(name) says whether an effect exists. Sound.recent(name, ms) says whether it played in the last ms.
const Sound = (() => {
  let ac = null, master, hush, ducker, duckWet, mus, musWet, sfx, farBus, revIn, rev, noise, rainG, windG, padA, padB, padF, arpF, timer = null, lean = false, autoLean = false, fxReady = false, musReady = false, susT = 0;
  const L = {}, W = {}, B = { pluck: [], clink: [], spic: [], cbell: [] }, last = {}, live = [], early = [], mixL = [];
  const S = { mode: null, sting: false, dim: false, step: 0, next: 0, sec: 'intro', bar: 0, nextSec: null, jump: false, pass: {}, key: 0, cycle: 0, sinceBig: 99, chorusRun: 0, intensity: 0, I: 0, music: true, sfx: true, late: 0, night: 0, mixT: 0, hand: 0, stingAt: -99, duckAt: 0, duckAmt: 0, side: null, sideAt: 0, hope: .5, bright: null, darkL: false, flip: null, lowAt: 0, thLast: 0, claim: 0 };
  const OUT_TRIM = 1, MUS = .4, SFX = .85, FX_WET = .38, LOW_GAP = 90, LAYERS = ['pad', 'bass', 'arp', 'lead', 'horn', 'ctr', 'perc', 'taiko'];
  const SEND = { pad: .5, bass: 0, arp: .28, lead: .5, horn: .36, ctr: .28, perc: .04, taiko: .08 };
  const m2f = n => 440 * Math.pow(2, (n - 69) / 12);
  const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
  const gain = (v, to) => { const g = ac.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };
  const filt = (type, fr, q, to) => { const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = fr; f.Q.value = q; if (to) f.connect(to); return f; };
  const panTo = (v, to) => { if (!ac.createStereoPanner) return to; const p = ac.createStereoPanner(); p.pan.value = v; p.connect(to); return p; };
  const pick = a => a[Math.random() * a.length | 0];
  const rp = s => 1 + (Math.random() - .5) * 2 * s;
  const num = v => typeof v === 'number' && isFinite(v);
  // The villains' tone: a lopsided fold, stepped so it sounds crushed. Used per effect, so panning and level still apply.
  const GRIT = new Float32Array(1025); for (let i = 0; i < 1025; i++) { const x = i / 512 - 1, y = Math.tanh(2.2 * x + .25) + .18 * Math.sin(7 * x); GRIT[i] = Math.round(y * 14) / 14 * .9; }

  // ---------- voice budget ----------
  // Voices are counted by their scheduled end time, so notes queued ahead of the clock count as well.
  const musEnds = [], fxEnds = [];
  function count(a) { const now = ac.currentTime; let j = 0; for (let i = 0; i < a.length; i++) if (a[i] > now) a[j++] = a[i]; a.length = j; return j; }
  const musCap = () => lean ? 20 : 32, fxCap = () => lean ? 12 : 18, fxFull = () => count(fxEnds) >= fxCap() + (lean ? 4 : 6);
  const room = (pri, n = 1) => count(musEnds) + n <= musCap() * [.62, .85, 1][pri];
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

    // Output chain: rumble cut, a light trim of the very top, glue compressor, makeup compensation, soft clipper, fade.
    // The compressor adds about 4 dB of automatic makeup gain. OUT_TRIM was set from offline renders: heavy stacks peak near -3 dBFS.
    hush = gain(1, ac.destination);
    const clip = ac.createWaveShaper(), n = 4097, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1) * 2 - 1) * 2, a = Math.abs(x); curve[i] = Math.sign(x) * (a <= .8 ? a : .8 + .19 * Math.tanh((a - .8) / .19)); }
    clip.curve = curve; clip.connect(hush);
    const trim = gain(OUT_TRIM * .5, clip);
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = .002; comp.release.value = .1; comp.connect(trim);
    const shelf = filt('highshelf', 8200, 0, comp); shelf.gain.value = -2;
    const hp = filt('highpass', 55, .7, shelf);
    master = gain(.9, hp); ducker = gain(1, master);
    // Music EQ, voiced for phone speakers: little below 120 Hz, which they cannot play, and a lift where melody and consonants live.
    const mAir = filt('highshelf', 5200, 0, ducker); mAir.gain.value = 3;
    const mPres = filt('peaking', 2700, .8, mAir); mPres.gain.value = 5;
    const mMid = filt('peaking', 1150, .9, mPres); mMid.gain.value = 2;
    const mLow = filt('lowshelf', 170, 0, mMid); mLow.gain.value = -5;
    mus = gain(S.music ? MUS : 0, filt('highpass', 78, .8, mLow));
    sfx = gain(S.sfx ? SFX : 0, master); farBus = filt('lowpass', 1500, .4, sfx);
    rev = ac.createConvolver(); rev.connect(filt('highpass', 220, .7, gain(.2, master))); const pre = ac.createDelay(.05); pre.delayTime.value = .02; pre.connect(rev); revIn = gain(1, pre);
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
    W.bass = wave([.3, .85, .7, .52, .36, .22, .13, .07]);
    W.th = wave([1, .34, .2, .11, .07, .05]);

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
    const g = pk ? .9 / pk : 1, at = sr * .0005 | 0, rl = sr * .012 | 0, n = d.length;
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
    J.push(() => { B.boom = render(.72, [[66, .7, .22, 160, .05], [132, .85, .13, 250, .03], [264, .46, .06, 380, .016], [530, .16, .018]], .55, .07, .2); });
    J.push(() => { B.punch = render(.16, [[150, 1, .05, 460, .014], [300, .55, .024, 600, .009], [640, .2, .01], [1250, .12, .005]], .6, .006, .45); });
    J.push(() => { B.snap = render(.09, [[1250, .5, .012], [2100, .3, .008]], 1, .012, .55); });
    // Reverb: exponential noise tail that darkens over time, like a stone hall.
    J.push(() => {
      const sr = ac.sampleRate, len = sr * (lean ? 1.3 : 2.4) | 0, ir = ac.createBuffer(2, len, sr), dk = Math.pow(.001, 1 / len);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); let e = 1, lp = 0; for (let i = 0; i < len; i++) { lp += (Math.random() * 2 - 1 - lp) * (.6 - .5 * i / len); d[i] = lp * e; e *= dk; } }
      rev.buffer = ir;
    });
    J.push(() => { B.crack = render(.16, [[3300, .5, .012], [1900, .6, .016], [210, .9, .04, 620, .01], [420, .4, .02]], 1.2, .02, .9); });
    J.push(() => { B.flick = render(.28, [[3520, 1, .09], [5180, .6, .055], [7040, .28, .03], [2240, .3, .04]], .25, .002, .8); });
    J.push(() => { B.blade = render(.3, [[2900, .4, .12, 2200, .2], [4300, .3, .1, 3400, .2], [6100, .2, .07]], .9, .09, .75); });
    J.push(() => { B.anvil = render(.8, [[620, 1, .22], [1010, .8, .18], [1730, .65, .12], [2390, .45, .08], [3300, .3, .05]], .8, .01, .7); });
    // A polished glint: close inharmonic partials that beat against each other, high but under the range phones turn piercing.
    J.push(() => { B.shine = render(.9, [[3010, .7, .22], [3070, .7, .2], [4480, .55, .15], [4560, .5, .13], [6240, .32, .09], [7400, .2, .06]], .1, .003, .85); });
    // Noise held in steps, which is what makes it sound dirty rather than airy.
    J.push(() => {
      const sr = ac.sampleRate, n = sr * .7 | 0, b = ac.createBuffer(1, n, sr), d = b.getChannelData(0), k = Math.exp(-1 / (sr * .13)); let e = 1, v = 0, lp = 0;
      for (let i = 0; i < n; i++) { if (i % 9 === 0) v = Math.random() * 2 - 1; lp += (v - lp) * .35; d[i] = (v - lp * .7) * e; e *= k; }
      B.rasp = finish(b, d, sr);
    });
    // A handful of links landing at random moments.
    J.push(() => {
      const sr = ac.sampleRate, n = sr * .55 | 0, b = ac.createBuffer(1, n, sr), d = b.getChannelData(0), w = 2 * Math.PI / sr;
      for (let c = 0; c < 11; c++) { const at = Math.random() * .42 * sr | 0, f = 1300 + Math.random() * 2400, g = .4 + Math.random() * .6, k = Math.exp(-1 / (sr * .018)); let e = g; for (let i = at; i < n && e > .001; i++) { d[i] += Math.sin((i - at) * w * f) * e + Math.sin((i - at) * w * f * 1.73) * e * .4; e *= k; } }
      B.chainL = finish(b, d, sr);
    });
    // Signature material for the newer champions. Every one keeps its energy between 300 Hz and 5 kHz so it survives a phone speaker.
    J.push(() => { // electric arc: gated, jumping square tone
      const sr = ac.sampleRate, n = sr * .42 | 0, b = ac.createBuffer(1, n, sr), d = b.getChannelData(0), k = Math.exp(-1 / (sr * .11)); let e = 1, p = 0, f = 1800, gate = 0, left = 0, lp = 0;
      for (let i = 0; i < n; i++) { if (--left <= 0) { gate = Math.random() < .68 ? 1 : 0; left = (sr * (.002 + Math.random() * .012)) | 0; f = 700 + Math.random() * 3000; } p += f / sr; lp += ((p % 1 < .5 ? 1 : -1) * gate - lp) * .5; d[i] = lp * e; e *= k; }
      B.arc = finish(b, d, sr);
    });
    J.push(() => { // water: rising bubbles
      const sr = ac.sampleRate, n = sr * .42 | 0, b = ac.createBuffer(1, n, sr), d = b.getChannelData(0), w = 2 * Math.PI / sr;
      for (let c = 0; c < 9; c++) { const at = (c === 0 ? 0 : Math.random() * .34 * sr) | 0, f0 = 340 + Math.random() * 620, len = sr * (.03 + Math.random() * .05) | 0, g = .5 + Math.random() * .5; let p = 0; for (let i = 0; i < len && at + i < n; i++) { const x = i / len; p += w * f0 * (1 + x * 1.1); d[at + i] += Math.sin(p) * g * Math.sin(Math.PI * Math.min(1, x * 6)) * (1 - x); } }
      B.bubble = finish(b, d, sr);
    });
    J.push(() => { const s = B.shine, n = s.length, r = ac.createBuffer(1, n, ac.sampleRate), a = s.getChannelData(0), z = r.getChannelData(0); for (let i = 0; i < n; i++) z[i] = a[n - 1 - i]; B.sheen = r; }); // a glint running backwards, for illusions
    J.push(() => { // fire: a soft roar under random snaps
      const sr = ac.sampleRate, n = sr * .62 | 0, b = ac.createBuffer(1, n, sr), d = b.getChannelData(0), k = Math.exp(-1 / (sr * .17)); let e = .4, lp = 0, hp = 0;
      for (let i = 0; i < n; i++) { const x = Math.random() * 2 - 1; lp += (x - lp) * .16; hp += (lp - hp) * .012; d[i] = (lp - hp) * e * 1.7; e *= k; }
      for (let c = 0; c < 34; c++) { const at = Math.pow(Math.random(), 1.6) * .54 * sr | 0, f = 1000 + Math.random() * 2800, g = .25 + Math.random() * .75, q = Math.exp(-1 / (sr * .0035)); let v = g; for (let i = at, p = 0; i < n && v > .002; i++, p += f / sr) { d[i] += (p % 1 < .5 ? v : -v); v *= q; } }
      B.fire = finish(b, d, sr);
    });
    J.push(() => { // beast: a voiced snarl, additive with two formants and a fast flutter
      const sr = ac.sampleRate, n = sr * .56 | 0, b = ac.createBuffer(1, n, sr), d = b.getChannelData(0), f0 = 92, w = 2 * Math.PI * f0 / sr, h = []; for (let k = 1; k <= 26; k++) { const fr = f0 * k; h.push(Math.exp(-Math.pow((fr - 620) / 260, 2)) + .7 * Math.exp(-Math.pow((fr - 1500) / 380, 2)) + .1 / k); }
      for (let i = 0; i < n; i++) { const t = i / sr, fl = .55 + .45 * Math.sin(2 * Math.PI * 27 * t + 3 * Math.sin(2 * Math.PI * 7 * t)), env = Math.min(1, t / .018) * Math.exp(-t / .2); let v = 0; const ph = w * i * (1 - .1 * t); for (let k = 0; k < h.length; k++) v += Math.sin(ph * (k + 1)) * h[k]; d[i] = v * fl * env; }
      B.growl = finish(b, d, sr);
    });
    J.push(() => { // siege engine: three strokes of a heavy piston
      const sr = ac.sampleRate, n = sr * .5 | 0, b = ac.createBuffer(1, n, sr), d = b.getChannelData(0), w = 2 * Math.PI / sr;
      [[0, 1], [.1, .62], [.19, .44]].forEach(([s0, g]) => { const at = s0 * sr | 0; for (const [f, a, dec] of [[176, 1, .07], [352, .8, .05], [737, .5, .03], [1370, .3, .016]]) { const k = Math.exp(-1 / (sr * dec)); let e = a * g; for (let i = at; i < n && e > .001; i++) { d[i] += Math.sin((i - at) * w * f) * e; e *= k; } } let v = g * .7, lp = 0; const q = Math.exp(-1 / (sr * .012)); for (let i = at; i < n && v > .002; i++) { lp += (Math.random() * 2 - 1 - lp) * .5; d[i] += lp * v; v *= q; } });
      B.piston = finish(b, d, sr);
    });
    J.push(() => { B.wire = string(52, .4, .75, .6); }); // a taut puppet string
    J.push(() => { B.mbox = render(.5, [[1568, 1, .16], [4698, .34, .05], [3136, .2, .08]]); }); // music-box tine
    J.push(() => { B.wood = render(.1, [[660, .7, .018], [1180, .35, .01], [1950, .15, .006]], .3, .004, .5); });
    J.fxN = J.length;
    J.push(() => { B.kick = render(.26, [[78, .75, .09, 210, .03], [156, .55, .04, 280, .015]], .14, .005, .5); });
    J.push(() => { B.clack = render(.14, [[420, .5, .02], [980, .25, .012]], 1, .035, .6); });
    J.push(() => { B.shk = render(.06, [[4200, .35, .014], [5600, .25, .01], [7200, .15, .008]], .7, .01, .7); });
    J.push(() => {
      B.crash = render(1.8, [[3100, .1, .6], [4300, .08, .45], [5500, .06, .3]], 1, .55, .55);
      const n = B.crash.length, r = ac.createBuffer(1, n, ac.sampleRate), a = B.crash.getChannelData(0), z = r.getChannelData(0);
      for (let i = 0; i < n; i++) z[i] = a[n - 1 - i]; B.swell = r;
    });
    for (const [n, s, t] of lean ? [[62, .5, 3], [76, .38, 2], [88, .25, 1.3]] : [[57, .5, 3.2], [64, .46, 2.9], [71, .42, 2.5], [78, .35, 2], [85, .28, 1.6], [92, .2, 1.2]]) J.push(() => B.pluck.push(string(n, s, t)));
    // Short bowed strings: harmonics that die off fast, over a little bow noise.
    const saws = (f, n, dec, tilt) => Array.from({ length: n }, (_, k) => [f * (k + 1), 1 / Math.pow(k + 1, tilt), dec / (1 + k * .16)]);
    for (const n of [50, 60, 72]) mode(B.spic, n, f => render(.36, saws(f, 12, .11, .85), .4, .012, .6));
    J.push(() => { B.snr = render(.34, [[195, .55, .06, 240, .012], [330, .3, .035]], 1.1, .11, .85); });
    J.push(() => { B.tom = render(.5, [[98, .55, .2, 180, .03], [196, .8, .12, 310, .02], [392, .38, .05], [610, .16, .02]], .55, .02, .5); }); // taiko: the body is up where phones can play it
    J.push(() => { B.rim = render(.06, [[1700, .6, .012], [2650, .35, .008]], .4, .008, .6); });
    // Timpani sampled at D3, with no real fundamental below it: phones keep the attack, and larger speakers get the rest.
    J.push(() => { B.timp = render(.9, [[146.83, .75, .36, 165, .03], [220.2, .45, .24], [293.7, .34, .16], [381, .16, .08], [73.4, .3, .22, 90, .04]], .28, .012, .4); });
    for (const n of [72, 84, 96]) mode(B.cbell, n, f => render(1.7, [[f, 1, .7], [f * 2.38, .45, .34], [f * 3.91, .3, .17], [f * 5.6, .16, .09], [f * 7.8, .08, .05]], .12, .002, .6));
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
  function bass(t, n, v, d) {
    if (!room(2)) return; const g = gain(0, L.bass), end = t + d;
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + .012); g.gain.linearRampToValueAtTime(v * .62, Math.max(t + .04, end - .01)); g.gain.linearRampToValueAtTime(.0001, end + .05);
    voice([g], t, end + .07); osc(W.bass, m2f(n), t, end + .07, 0, g);
  }
  // Choir-like pad: harmonically shaped oscillators, one detuned voice each side of the stereo field.
  function choir(t, ns, dur, v, w = W.ah) {
    if (!room(1, ns.length)) return;
    const end = t + dur, atk = Math.min(.5, dur * .25), gA = gain(0, padA), gB = gain(0, padB), thin = lean || count(musEnds) > musCap() * .55;
    for (const g of [gA, gB]) { g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + atk); g.gain.setValueAtTime(v, Math.max(t + atk, end - .1)); g.gain.linearRampToValueAtTime(.0001, end + .36); }
    voice([gA, gB], t, end + .4);
    ns.forEach((n, i) => { const f = m2f(n); if (thin) osc(w, f, t, end + .4, 0, i % 2 ? gB : gA); else { osc(w, f, t, end + .4, -7, gA); osc(w, f, t, end + .4, 7, gB); } });
  }
  // Soft brass chord: filtered saws through one shared swelling filter.
  function brass(t, ns, dur, v) {
    if (!room(1, ns.length)) return;
    const g = gain(0, L.horn), f = filt('lowpass', 400, .7, g), c = 1500 + S.I * 2600, end = t + dur;
    f.frequency.setValueAtTime(c * .35, t); f.frequency.exponentialRampToValueAtTime(c, t + .09); f.frequency.setTargetAtTime(c * .55, t + .14, dur * .5);
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + .05); g.gain.setValueAtTime(v, Math.max(t + .06, end - .05)); g.gain.linearRampToValueAtTime(.0001, end + .12);
    voice([g], t, end + .14);
    const thin = lean || count(musEnds) > musCap() * .6;
    for (const n of ns) { const hz = m2f(n); osc('sawtooth', hz, t, end + .14, -5, f); if (!thin) osc('sawtooth', hz, t, end + .14, 6, f); }
  }
  // Horn lead: two saws, a filter that follows pitch, a small scoop into the note, late vibrato on long notes.
  function horn(t, n, dur, v, bus = L.horn) {
    if (!room(2, dur > .5 ? 3 : 2)) return;
    const hz = m2f(n), end = t + dur, c = Math.min(4400, hz * (3.2 + S.I * 2.4)), g = gain(0, bus), f = filt('lowpass', hz, .6, g);
    f.frequency.setValueAtTime(hz * 1.2, t); f.frequency.exponentialRampToValueAtTime(c, t + .09); f.frequency.setTargetAtTime(c * .6, t + .15, Math.max(.2, dur * .6));
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + .045); g.gain.linearRampToValueAtTime(v * .92, Math.max(t + .05, end - .05)); g.gain.linearRampToValueAtTime(.0001, end + .1);
    voice([g], t, end + .12);
    const a = osc('sawtooth', hz, t, end + .12, -4, f), b = lean ? null : osc('sawtooth', hz, t, end + .12, 5, f);
    a.detune.setValueAtTime(-22, t); a.detune.linearRampToValueAtTime(-4, t + .07);
    if (b) { b.detune.setValueAtTime(-16, t); b.detune.linearRampToValueAtTime(5, t + .07); }
    if (dur > .5 && !lean) { const lg = gain(0); osc('sine', 5.2, t + .3, end + .1, 0, lg); lg.gain.setValueAtTime(0, t + .3); lg.gain.linearRampToValueAtTime(7, t + .65); lg.connect(a.detune); if (b) lg.connect(b.detune); }
  }
  const coinbell = (t, n, v, bus = L.lead) => note(B.cbell, t, n, v, bus, 0, 2);
  const spic = (t, n, v) => note(B.spic, t, n, v, arpF, .22, 1);
  // Trumpet lead: two saws, a filter that opens with the attack, a small lip into the note. Muted, it becomes a narrow nasal band that carries on any speaker.
  function trumpet(t, n, dur, v, bus = L.horn, muted = false) {
    if (!room(2, dur > .55 ? 3 : 2)) return;
    const hz = m2f(n), end = t + dur, g = gain(0, bus), c = Math.min(7200, hz * (4.5 + S.I * 3.5)), f = filt(muted ? 'bandpass' : 'lowpass', muted ? 1500 : hz * 2, muted ? 1.3 : .7, g);
    if (!muted) { f.frequency.setValueAtTime(hz * 2, t); f.frequency.exponentialRampToValueAtTime(c, t + .05); f.frequency.setTargetAtTime(c * .68, t + .12, Math.max(.15, dur * .7)); }
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v * 1.25, t + .018); g.gain.linearRampToValueAtTime(v, t + .07); g.gain.linearRampToValueAtTime(v * .9, Math.max(t + .08, end - .05)); g.gain.linearRampToValueAtTime(.0001, end + .08);
    voice([g], t, end + .1);
    const a = osc('sawtooth', hz, t, end + .1, -3, f), b = lean ? null : osc('sawtooth', hz, t, end + .1, 4, f);
    a.detune.setValueAtTime(-28, t); a.detune.linearRampToValueAtTime(-3, t + .05);
    if (dur > .55 && !lean) { const lg = gain(0); osc('sine', 5.4, t + .28, end + .08, 0, lg); lg.gain.setValueAtTime(0, t + .28); lg.gain.linearRampToValueAtTime(9, t + .6); lg.connect(a.detune); if (b) lg.connect(b.detune); }
  }
  // Theremin lead for the villains: slides from the last note, with a wide vibrato that arrives late.
  function theremin(t, n, dur, v) {
    if (!room(2, dur > .4 ? 3 : 2)) return;
    const hz = m2f(n), end = t + dur, from = S.thLast && Math.abs(S.thLast - n) < 14 ? m2f(S.thLast) : hz, g = gain(0, L.lead), f = filt('peaking', 2200, 1, g); f.gain.value = 9;
    S.thLast = n;
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + .04); g.gain.setValueAtTime(v, Math.max(t + .05, end - .06)); g.gain.linearRampToValueAtTime(.0001, end + .1);
    voice([g], t, end + .12);
    const a = osc(W.th, hz, t, end + .12, 0, f);
    a.frequency.setValueAtTime(from, t); a.frequency.exponentialRampToValueAtTime(hz, t + Math.min(.12, dur * .4));
    if (dur > .4 && !lean) { const lg = gain(0); osc('sine', 6.2, t + .1, end + .1, 0, lg); lg.gain.setValueAtTime(0, t + .1); lg.gain.linearRampToValueAtTime(28, t + .45); lg.connect(a.detune); }
  }

  // The trailer hit: open fifths in low brass, a filter that tears open, and a long fall. Harmonics carry it on small speakers.
  function braam(t, ns, dur, v) {
    const thin = lean || count(musEnds) > musCap() * .5;
    if (!room(1, ns.length * (thin ? 1 : 2))) return;
    const g = gain(0, L.horn), f = filt('lowpass', 300, 1.1, g), end = t + dur, pk = 2800 + S.I * 1400;
    f.frequency.setValueAtTime(260, t); f.frequency.exponentialRampToValueAtTime(pk, t + .07); f.frequency.setTargetAtTime(520, t + .12, dur * .34);
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + .03); g.gain.setTargetAtTime(v * .3, t + .12, dur * .4); g.gain.setValueAtTime(v * .3, Math.max(t + .14, end - .06)); g.gain.linearRampToValueAtTime(.0001, end + .16);
    voice([g], t, end + .18);
    for (const n of ns) { const hz = m2f(n); osc('sawtooth', hz, t, end + .18, -7, f); if (!thin) osc('sawtooth', hz, t, end + .18, 8, f); }
  }
  // Long-bow strings for the high lines: a narrow saw pair with late vibrato, dropped first when voices are short.
  function strings(t, n, dur, v, atk = .08) {
    if (lean || !room(1, 2)) return;
    const hz = m2f(n), end = t + dur, g = gain(0, L.ctr), f = filt('lowpass', Math.min(5200, hz * 3.4), .5, g);
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(v, t + atk); g.gain.setValueAtTime(v, Math.max(t + atk, end - .08)); g.gain.linearRampToValueAtTime(.0001, end + .16);
    voice([g], t, end + .18);
    const a = osc('sawtooth', hz, t, end + .18, -6, f), b = osc('sawtooth', hz, t, end + .18, 6, f);
    if (dur > .7) { const lg = gain(0); osc('sine', 5.6, t + .3, end + .16, 0, lg); lg.gain.setValueAtTime(0, t + .3); lg.gain.linearRampToValueAtTime(8, t + .7); lg.connect(a.detune); lg.connect(b.detune); }
  }

  // ---------- score ----------
  // Two themes, one coin. The hero hook climbs: long, neighbour below and back, leap up a third, then the same cell a third higher each bar.
  // The villain hook is its reflection: the neighbour above, then a fall of a tritone, sinking a fourth each bar, in a limping 12/8.
  const CH = {
    Dm: [38, 62, 65, 69], Dm7: [38, 60, 65, 69], D: [38, 62, 66, 69], Bb: [34, 62, 65, 70], Bbma: [34, 62, 65, 69], F: [41, 60, 65, 69], Fa9: [41, 60, 67, 69],
    C: [36, 60, 64, 67], Cs: [36, 60, 65, 67], Gm: [31, 62, 67, 70], Gm7: [31, 62, 65, 70], A: [33, 61, 64, 69], As: [33, 62, 64, 69], Am: [33, 60, 64, 69],
    D7: [38, 60, 66, 69], G: [31, 62, 67, 71], G7: [31, 62, 65, 71], Eb: [39, 63, 67, 70], Ebma: [39, 62, 67, 70], Bbm: [34, 61, 65, 70], Fm: [41, 60, 65, 68], Cm: [36, 60, 63, 67], Gsd: [32, 62, 65, 68],
  };
  const hook = n => [[0, n, 6], [6, n - 2, 2], [8, n, 2], [10, n + 3, 6]];
  const HOOK_END = [[0, 85, 4], [4, 81, 2], [6, 76, 2], [8, 73, 8]];
  const THEME = [
    hook(74),
    [[0, 77, 6], [6, 76, 2], [8, 77, 2], [10, 81, 6]],
    [[0, 82, 6], [6, 81, 2], [8, 82, 2], [10, 86, 6]],
    HOOK_END,
    hook(74),
    [[0, 77, 6], [6, 76, 2], [8, 77, 2], [10, 82, 6]],
    [[0, 86, 4], [4, 89, 8], [12, 86, 2], [14, 84, 2]],
    [[0, 85, 10], [10, 81, 2], [12, 76, 4]],
  ];
  // Moves where the hook holds still, in the horns.
  const COUNTER = [
    [[12, 62, 2], [14, 65, 2]], [[12, 65, 2], [14, 69, 2]], [[12, 70, 2], [14, 74, 2]], [[12, 69, 2], [14, 64, 2]],
    [[12, 62, 2], [14, 65, 2]], [[12, 65, 2], [14, 70, 2]], [[6, 74, 2], [8, 70, 4]], [[12, 69, 2], [14, 73, 2]],
  ];
  // B section: the broad cascade, falling thirds in the relative major.
  const BTHEME = [
    [[0, 84, 8], [8, 81, 4], [12, 77, 4]],
    [[0, 79, 8], [8, 76, 4], [12, 72, 4]],
    [[0, 74, 4], [4, 77, 4], [8, 81, 8]],
    [[0, 82, 4], [4, 86, 4], [8, 84, 8]],
    [[0, 82, 8], [8, 79, 4], [12, 74, 4]],
    [[0, 76, 4], [4, 79, 4], [8, 84, 8]],
    [[0, 86, 6], [6, 84, 2], [8, 82, 2], [10, 81, 6]],
    [[0, 85, 12], [12, 81, 2], [14, 76, 2]],
  ];
  const vhook = n => [[0, n, 5], [5, n + 1, 1], [6, n, 2], [8, n - 6, 4]];
  const VTHEME = [
    vhook(74),
    vhook(70),
    vhook(73),
    [[0, 76, 3], [3, 73, 3], [6, 70, 3], [9, 69, 3]],
    vhook(74),
    vhook(75),
    vhook(80),
    [[0, 81, 6], [6, 80, 2], [8, 77, 2], [10, 73, 2]],
  ];
  // Answers in the low brass, on the off-beats of the limp.
  const VCOUNTER = [
    [[9, 57, 3]], [[9, 58, 3]], [[9, 61, 3]], [[0, 57, 3]],
    [[9, 57, 3]], [[9, 58, 3]], [[9, 59, 3]], [[0, 61, 3], [6, 57, 3]],
  ];
  // B section: chromatic sighs, a slinking cabaret line.
  const VBTHEME = [
    [[0, 80, 3], [3, 79, 3], [6, 77, 6]],
    [[0, 75, 3], [3, 74, 3], [6, 72, 6]],
    [[0, 70, 3], [3, 75, 3], [6, 79, 6]],
    [[0, 82, 3], [3, 81, 3], [6, 77, 6]],
    [[0, 77, 3], [3, 76, 3], [6, 74, 6]],
    [[0, 74, 3], [3, 77, 3], [6, 80, 6]],
    [[0, 82, 2], [2, 80, 2], [4, 79, 2], [6, 75, 6]],
    [[0, 73, 6], [6, 76, 3], [9, 81, 3]],
  ];
  const MENU_P = ['Dm', 'Bbma', 'Gm7', 'A', 'Dm', 'Eb', 'Bbm', 'A', 'F', 'C', 'Dm7', 'Bbma', 'Gm7', 'Eb', 'As', 'A'];
  // The title theme plays both faces of the coin, in sixteen bars: hook, its reflection, then one long line that ends unresolved.
  const MENU_T = [
    hook(74),
    [[0, 77, 6], [6, 76, 2], [8, 77, 2], [10, 81, 6]],
    [[0, 82, 6], [6, 81, 2], [8, 82, 2], [10, 86, 6]],
    HOOK_END,
    [[0, 74, 6], [6, 75, 2], [8, 74, 2], [10, 68, 6]],
    [[0, 70, 6], [6, 71, 2], [8, 70, 2], [10, 64, 6]],
    [[0, 73, 6], [6, 74, 2], [8, 73, 2], [10, 67, 6]],
    [[0, 76, 4], [4, 73, 2], [6, 70, 2], [8, 69, 8]],
    ...BTHEME.slice(0, 5),
    [[0, 79, 4], [4, 82, 4], [8, 86, 8]],
    [[0, 86, 8], [8, 85, 8]],
    [[0, 85, 12], [12, 81, 2], [14, 76, 2]],
  ];
  const MENU_H_P = ['Dm', 'Bbma', 'Gm', 'A', 'Dm', 'Bb', 'Gm7', 'A', 'F', 'C', 'Dm', 'Bbma', 'Gm', 'C', 'Bb', 'A'];
  const MENU_H_T = THEME.concat(BTHEME);
  const MENU_V_P = ['Dm', 'Eb', 'Bbm', 'A', 'Dm', 'Eb', 'Gsd', 'A', 'Fm', 'Cm', 'Eb', 'Bbm', 'Dm', 'Gsd', 'Eb', 'A'];
  const MENU_V_T = VTHEME.concat(VBTHEME);
  const HERO = { Dm: 'D', Dm7: 'D7', Gm: 'G', Gm7: 'G7' };
  const mood = () => S.side === 'villain' ? 1 - S.hope : S.hope;
  const E16 = '................', E12 = '............';
  // mix order: pad bass ost(arp) bell(lead) brass(horn) ctr perc timp. m is the mix at intensity 0, M at intensity 1.
  // Patterns: bs bass, os string ostinato, st brass stab, k kick, s snare, h coin tick, t timpani, f pickup ruff.
  const HSEC = {
    intro: { n: 8, p: ['Dm', 'Dm', 'Bb', 'Bb', 'Gm', 'Gm', 'A', 'A'], m: [.75, .75, .45, .5, .9, 0, .4, .8], M: [.85, .85, .7, .6, 1, 0, .6, 1], bs: 'x.......x.....5.', os: 'x.xx.xx.x.xx.xx.', st: E16, k: E16, s: '....x.......x...', h: E16, t: 'x.........x.....', f: E16 },
    verse: { n: 16, p: ['Dm', 'Bbma', 'Gm', 'A', 'Dm', 'Bb', 'Gm', 'A'], m: [.5, .75, .8, .6, .85, .55, .5, .35], M: [.7, .9, 1, .8, 1, .8, .85, .7], bs: 'x.....x.x.....x.', os: 'x.xx.xx.x.xx.xx.', st: 'x.........x.....', k: 'x.......x.......', s: '....x.......x...', h: '..x...x...x...x.', t: 'x.....x.........', f: '...............x' },
    b: { n: 16, p: ['F', 'C', 'Dm', 'Bbma', 'Gm', 'C', 'Bb', 'A'], m: [.85, .65, .55, .75, .9, .6, .4, .3], M: [.95, .8, .8, .9, 1, .8, .7, .55], bs: 'x.......x.....o.', os: 'x...x.x.x...x.x.', st: E16, k: 'x.......x.......', s: '............x...', h: '....x.......x...', t: 'x...............', f: E16 },
    brk: { n: 8, p: ['Dm', 'Dm', 'Bb', 'Bb', 'Gm', 'Gm', 'A', 'A'], m: [.55, .8, .55, .7, .5, .5, .5, .3], M: [.7, .9, .75, .8, .7, .7, .75, .6], bs: 'x..x..x...x..x..', os: E16, st: E16, k: E16, s: E16, h: 'x...x...x...x...', t: E16, f: E16, minor: 1 },
    chorus: { n: 16, p: ['Dm', 'Bbma', 'Gm', 'A', 'Dm', 'Bb', 'Gm', 'A'], m: [.9, .95, .9, 1, 1, .9, .95, .85], M: [1, 1, 1, 1, 1, 1, 1, 1], bs: 'x.x.o.x.x.x.o.xo', os: 'x.xx.xx.x.xx.xx.', st: 'x.....x...x.....', k: 'x.....x.x.x.....', s: '....x..x....x..x', h: '..x.x.x...x.x.x.', t: 'x..x..x...x.x.x.', f: '.......x.......x' },
  };
  const VSEC = {
    intro: { n: 8, p: ['Dm', 'Dm', 'Eb', 'Eb', 'Gsd', 'Gsd', 'A', 'A'], m: [.75, .8, .3, .5, .85, 0, .55, .85], M: [.85, .9, .55, .6, 1, 0, .7, 1], bs: 'x.....x.....', os: 'x..x.x..x.x.', st: E12, k: E12, s: E12, h: 'x..x..x..x..', t: 'x.....x.....', f: E12 },
    verse: { n: 16, p: ['Dm', 'Eb', 'Bbm', 'A', 'Dm', 'Eb', 'Gsd', 'A'], m: [.55, .8, .7, .55, .85, .55, .6, .4], M: [.75, .95, .95, .75, 1, .8, .85, .75], bs: 'x..x.x..x.x.', os: 'x..x.x..x.x.', st: 'x.....x.....', k: 'x.....x.....', s: '...x.....x..', h: 'x..x..x..x..', t: 'x.....x..x..', f: E12 },
    b: { n: 16, p: ['Fm', 'Cm', 'Eb', 'Bbm', 'Dm', 'Gsd', 'Eb', 'A'], m: [.85, .7, .5, .7, .9, .6, .5, .3], M: [.95, .85, .8, .9, 1, .8, .75, .55], bs: 'x.....x..x..', os: 'x..x..x..x..', st: E12, k: 'x.....x.....', s: '.........x..', h: 'x.....x.....', t: 'x...........', f: E12 },
    brk: { n: 8, p: ['Dm', 'Dm', 'Eb', 'Eb', 'Gsd', 'Gsd', 'A', 'A'], m: [.6, .8, .4, .7, .5, .5, .65, .35], M: [.75, .9, .6, .85, .7, .7, .85, .65], bs: 'x..x..x..x..', os: E12, st: E12, k: E12, s: E12, h: 'x..x..x..x..', t: E12, f: E12, minor: 1 },
    chorus: { n: 16, p: ['Dm', 'Eb', 'Bbm', 'A', 'Dm', 'Eb', 'Gsd', 'A'], m: [.9, 1, .95, 1, 1, .9, .95, .9], M: [1, 1, 1, 1, 1, 1, 1, 1], bs: 'x.xx.xx.xx.o', os: 'x.xx.xx.xx.x', st: 'x..x.x..x.x.', k: 'x..x..x..x..', s: '...x.....x.x', h: 'x.xx.xx.xx.x', t: 'x..x.x..x.x.', f: '...........x' },
  };
  for (const k in HSEC) { const s = HSEC[k]; s.ph = s.minor || k === 'verse' ? s.p : s.p.map(n => HERO[n] || n); }
  const ARP16 = [0, 2, 1, 3, 2, 4, 3, 2, 1, 3, 2, 4, 3, 5, 4, 2], ARP12 = [0, 2, 4, 3, 1, 3, 5, 3, 2, 4, 3, 1];
  const ACC16 = [1, .62, .78, .62, .92, .62, .78, .62, .95, .62, .78, .62, .9, .62, .78, .62], ACC12 = [1, .6, .65, .9, .6, .68, .95, .6, .65, .88, .6, .68];
  const KEYS = [0, 2, -2, 3];
  const H = (t, a = .007) => t + Math.random() * a;
  const V = (v, a = .16) => v * (1 - a + Math.random() * a * 2);
  const vilMeter = () => S.side === 'villain';
  const barLen = () => vilMeter() ? 12 : 16;
  const stepDur = () => { if (S.mode === 'menu') return vilMeter() ? 60 / 72 / 3 : 60 / 76 / 4; return vilMeter() ? 60 / (98 + S.late * 8 - S.night * 3) / 3 : 60 / (120 + S.late * 10 - S.night * 4) / 4; };

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
  const secOf = () => (S.side === 'villain' ? VSEC : HSEC)[S.sec];
  function barEnd() {
    S.bar++; S.sinceBig++;
    if (S.mode === 'menu') { if (S.bar >= 16) { S.bar = 0; S.pass.menu = (S.pass.menu || 0) + 1; } return; }
    if (S.mode === 'match' && (S.jump || S.bar >= secOf().n)) enter(S.nextSec || 'verse');
  }
  function line(arr, b, fn) { if (arr) for (const [s, n, d] of arr) if (s === b) fn(n, d); }
  // Steps until the next bass note, so overlapping notes cannot beat against each other.
  const bassGap = (p, b) => { for (let i = b + 1; i < p.length; i++) if (p[i] !== '.') return i - b; return p.length - b; };

  function menuStep(b, t, spb) {
    const vil = S.side === 'villain', hero = S.side === 'hero', i = S.bar, P = vil ? MENU_V_P : hero ? MENU_H_P : MENU_P, ch = CH[P[i]], pass = S.pass.menu || 0, T = ch.slice(1), rich = pass % 2 === 1, TUNE = (vil ? MENU_V_T : hero ? MENU_H_T : MENU_T)[i], len = barLen();
    if (b === 0) {
      choir(t, T, spb * len, vil ? .03 : .034, W.oo);
      if (rich || hero) choir(t, [T[1] + 12], spb * len, .014, W.ah);
      bass(t, ch[0] + 12, .13, spb * (len - 3));
      pluck(H(t), ch[0] + 24, .13, arpF, 1.1, 1);
      if (i % 4 === 0) smp(B.timp, H(t), rateTo(ch[0]), .12, L.taiko, 0, false, 1);
      if (i % 8 === 0) braam(t, [ch[0] + 12, ch[0] + 19, ch[0] + 24], spb * len * 1.6, vil ? .05 : .042);
      if (rich && i >= 8) strings(H(t), T[2] + 12, spb * len * .96, .022, .3);
    }
    // Harp figure: rolling in the 4/4, limping in the villain's 12/8.
    if (vil ? (b % 3 === 0 || b % 12 === 5) : (b % 2 === 0 && (b || i % 2))) { const tones = [T[0], T[1], T[2], T[0] + 12, T[1] + 12, T[2] + 12]; pluck(H(t, .016), tones[(vil ? ARP12 : ARP16)[vil ? b : b / 2 + (i % 2) * 8]], V(.095 * (vil ? ACC12 : ACC16)[b]), arpF, 1, 1); }
    line(TUNE, b, (n, d) => {
      const lyr = d * spb;
      if (vil) { theremin(H(t), n, lyr * .96, .05); if (d >= 4) coinbell(H(t), n + 12, .04); }
      else if (hero || i < 8 || rich) { trumpet(H(t), n, lyr * .94, .055, L.horn, !hero && i < 8); coinbell(H(t), n + 12, V(.06, .1)); }
      else coinbell(H(t), n, V(.09, .1));
    });
    if (vil && i % 2 === 1 && b === 9) coinbell(H(t), 92, .03);
    if ((rich || hero) && !vil && b % 4 === 3) pluck(H(t, .012), T[(b >> 2) % 3] + 24, V(.05), L.ctr, .7, 0);
    if (vil && b % 3 === 0) smp(B.rim, H(t, .004), 1.1 + (b === 0 ? .2 : 0), V(.05), L.perc, 0, false, 0);
  }
  const rateTo = root => { let d = (root - 38) % 12; if (d < 0) d += 12; if (d > 6) d -= 12; return Math.pow(2, d / 12); };

  function matchStep(b, t, spb) {
    const sec = secOf(), bar0 = S.bar, vil = S.side === 'villain', len = sec.bs.length;
    // Mood is decided at phrase starts, so hope or nightfall cannot change a chord's quality halfway through a bar.
    if (b === 0 && (bar0 % 4 === 0 || S.bright === null)) { S.bright = S.side === 'hero' && mood() >= .6 && S.sec === 'chorus'; S.darkL = S.night > .55; }
    const bright = S.bright && !sec.minor, pr = bright ? sec.ph : sec.p, bar = S.bar, i = bar % pr.length, name = pr[i], ch = CH[name], I = S.I, K = S.key, a = (vil ? ACC12 : ACC16)[b], late = S.late, night = S.darkL, pass = (S.pass[S.sec] || 1) - 1, h = I + late * .15, atEnd = bar + 1 >= sec.n;
    if (b === 0) {
      if (atEnd && !S.jump) S.nextSec = chooseNext();
      else if (!atEnd && S.sec !== 'chorus' && S.sec !== 'intro' && (bar + 1) % 4 === 0 && h > .76 && S.sinceBig >= 16) { S.jump = true; S.nextSec = 'chorus'; }
    }
    const pedal = (night || vil) && S.sec === 'verse' && name !== 'A' && name !== 'Bbm';
    const ending = atEnd || S.jump, T = ch.slice(1).map(n => n + K), root = (pedal ? 38 : ch[0]) + K, tones = [T[0], T[1], T[2], T[0] + 12, T[1] + 12, T[2] + 12];
    const nv = night ? .78 : 1, mine = mood();
    // Under the hero's major chords the minor third of D and G is raised, so one melody serves both moods.
    const fix = n => { if (!bright) return n; const pc = ((n % 12) + 12) % 12; return ((name === 'D' || name === 'D7') && pc === 5) || ((name === 'G' || name === 'G7') && pc === 10) ? n + 1 : n; };
    const up = n => fix(n) + K;

    if (b === 0) {
      if (i === 0 || pr[i - 1] !== name) { let run = 1; while (i + run < pr.length && pr[i + run] === name) run++; choir(t, S.sec === 'chorus' ? T.concat(T[0] + 12) : T, spb * len * run, .024 + .012 * I, S.sec === 'b' ? W.oo : W.ah); }
      if (ending && (S.nextSec === 'chorus' || S.sec === 'brk') && B.swell) smp(B.swell, t + Math.max(0, spb * len - B.swell.duration), 1, .1, mus, 0, false, 2);
      if (bar === 0 && S.sec === 'chorus' && B.crash) smp(B.crash, t, 1, .11, mus, 0, false, 2);
      if (S.sec === 'chorus' && bar % 8 === 0) braam(t, [root + 12, root + 19, root + 24], spb * len, .075 + late * .02 + (bar ? .012 : 0));
      else if (bar === 0 && S.sec === 'verse' && h > .35) braam(t, [root + 12, root + 19], spb * len, .04);
    }
    // Rhythm section. The bass sits an octave higher than written so phones can play it.
    const bc = sec.bs[b];
    if (bc !== '.') bass(H(t, .004), root + 12 + (bc === 'o' ? 12 : bc === '5' ? 7 : 0), V((.15 + I * .045) * a, .08), spb * Math.min(bc === 'x' ? 3.2 : 1.8, bassGap(sec.bs, b)) * .95);
    if (sec.os[b] === 'x' && (S.sec !== 'intro' || bar >= 4 || vil)) {
      const step = vil ? [0, 0, 7, 0, 12, 0, 7, 0, 0, 3, 7, 12][b] : b % 8 === 0 ? 12 : b % 4 === 3 ? 7 : 0;
      spic(H(t, .006), root + 24 + step, V((.19 + I * .06) * a, .1));
      if (vil) smp(B.rim, H(t, .005), 1.45, V(.11 * a, .15), L.perc, 0, false, 0); // col legno, the wood of the bow
    }
    if (sec.st[b] === 'x') brass(H(t), T.map(n => n - 12), spb * (vil ? 1.2 : 1.4), .05 + I * .022 + late * .01);
    if (sec.k[b] === 'x') smp(B.kick, H(t, .003), 1, V(.26 * a, .08), L.perc, 0, false, 2);
    if (sec.s[b] === 'x') smp(vil ? B.clack : B.snr, H(t), vil ? .85 : rp(.03), V(vil ? .22 : .2), L.perc, 0, false, 1);
    if (sec.f[b] === 'x' && !vil) for (let r = 0; r < 3; r++) smp(B.snr, H(t - spb * (2 - r) * .3), 1.2, .05 + r * .025, L.perc, 0, false, 0);
    // Coin ticks are the signature in the kit, and most of the top end.
    if (sec.h[b] === 'x' || (I > .6 && (vil ? b % 3 === 1 : b % 2 === 1) && Math.random() < .5)) smp(pick(B.clink), H(t), rp(.08) * (vil ? .74 : .95), V(.1 * a, .28), L.perc, 0, false, 0);
    if (sec.t[b] === 'x') smp(B.timp, H(t, .004), rateTo(root), V(.36 * a, .1), L.taiko, 0, false, 2);
    // Taiko ensemble under the big sections. Sits above the timpani, so it reads on a phone where the timpani cannot.
    if (S.sec === 'chorus' && B.tom && (vil ? 'x..x..x..x.x' : 'x..x..x.x.x.x..x')[b] === 'x') smp(B.tom, H(t, .005), rateTo(root) * (b === 0 ? .85 : 1), V((.2 + I * .08 + late * .06) * a, .1), L.taiko, 0, false, 1);
    if (S.sec === 'chorus' && I > .55 && sec.os[b] === 'x') { if (count(musEnds) < musCap() * .7) spic(H(t, .006), root + 12, V(.11 * a, .1)); }
    if ((late > .35 || (vil && mine > .72)) && S.sec !== 'brk' && b === (vil ? 3 : 4)) smp(B.timp, H(t), rateTo(root) * .75, V(.13 + late * .08, .1), L.taiko, 0, false, 1);
    if (late > .7 && S.sec === 'chorus' && b >= len - 4) smp(B.snr, H(t), 1.15, V(.09), L.perc, 0, false, 0);
    if (ending && b >= len / 2 && (b >= len * .75 || b % 2 === 0)) { const c = (b - len / 2 + 1) / (len / 2); smp(B.timp, H(t, .004), rateTo(root) * (.95 + c * .2), V(.08 + c * .15, .08), L.taiko, 0, false, 2); }
    if (vil && b % 3 === 0 && (S.sec === 'brk' || S.sec === 'intro')) smp(B.rim, H(t, .004), b === 0 ? 1.25 : 1, V(.07), L.perc, 0, false, 1); // the clock

    const TH = vil ? VTHEME : THEME, CT = vil ? VCOUNTER : COUNTER, BT = vil ? VBTHEME : BTHEME;
    const lead = (n, d, v, muted) => { if (vil) { theremin(H(t), up(n), spb * d * .96, v * .82 * nv); if (d >= 4 || S.sec === 'chorus') coinbell(H(t), up(n) + 12, V(.08 * nv, .1)); } else { trumpet(H(t), up(n), spb * d * .95, v * nv, L.horn, muted); } };
    switch (S.sec) {
      case 'intro': {
        if (i % 2 === 0) line(vil ? vhook([62, 58, 56, 57][i >> 1]) : hook([62, 58, 55, 57][i >> 1]), b, (n, d) => horn(H(t), n + K, spb * d * .96, V(.075 + i * .004, .08)));
        else if (!pass) line(TH[i & 3], b, (n, d) => { if (d > 3) coinbell(H(t), up(n) + 12, V(.05)); });
        break;
      }
      case 'verse': {
        line(TH[i], b, (n, d) => { lead(n, d, V(.06, .08)); if (bar >= 8 && !vil) horn(H(t), up(n) - 12, spb * d * .94, V(.045 * nv, .08)); if (d >= 6 && !vil) coinbell(H(t), up(n) + 12, V(.07 * nv, .1)); if (vil && bar >= 8) horn(H(t), up(n) - 12, spb * d * .9, V(.05 * nv, .08)); });
        if (I > .4 || bar >= 8) line(CT[i], b, (n, d) => horn(H(t), n + K, spb * d * .96, V(.048 * nv, .08)));
        if (b === 0 && !vil) brass(H(t), T, spb * 14, .012 + I * .012);
        break;
      }
      case 'b': {
        if (b === 0) { brass(t, T.slice(0, 3), spb * (len - 1), .018 + I * .012); if (bar >= 4) strings(t, T[2] + 12, spb * (len - 1), .018 + I * .012, .35); }
        line(BT[i], b, (n, d) => { if (vil) { lead(n, d, V(.06, .08)); } else { horn(H(t), up(n) - 12, spb * d * .96, V(.075 * nv, .08)); if (pass % 2 === 0) coinbell(H(t), up(n), V(.1 * nv, .1)); else trumpet(H(t), up(n), spb * d * .95, V(.045 * nv, .08), L.horn);
          if (d >= 8) coinbell(H(t), up(n) + 12, V(.06 * nv, .1)); } });
        break;
      }
      case 'brk': {
        // Stripped down: a walking pizzicato bass and the hook on a muted horn or the theremin, alone.
        const walk = T.map(n => n + 12); if (b % (vil ? 3 : 4) === 0) pluck(H(t, .01), walk[(b >> 2) % 3], V(.09), L.ctr, .5, 1);
        const m = TH[i]; if (i < 6) line(m, b, (n, d) => { if (vil) theremin(H(t), up(n), spb * d * .96, V(.05)); else trumpet(H(t), up(n), spb * d * .92, V(.06), L.horn, true); });
        break;
      }
      case 'chorus': {
        const pk = bar >= 8 ? 1 : 0;
        line(TH[i], b, (n, d) => { lead(n, d, V(.078 + pk * .012, .06)); if (!vil) horn(H(t), up(n) - 12, spb * d * .96, V(.07, .06)); else horn(H(t), up(n), spb * d * .92, V(.055, .06)); coinbell(H(t), up(n) + 12, V(.08 * nv, .1)); });
        line(CT[i], b, (n, d) => pluck(H(t, .012), n + K + 12, V(.08 * nv), L.ctr, .7, 1));
        if (b === 0) brass(H(t), T, spb * (vil ? 7 : 9), .03 + late * .012);
        if (pk || late > .5) line(TH[i], b, (n, d) => { if (d >= 4) strings(H(t), up(n) + 12, spb * d * .96, V(.036 * nv, .06)); });
        if (pk && b === 0 && late > .5) brass(H(t), T.map(n => n + 12), spb * 6, .024);
        break;
      }
    }
  }

  // ---------- clock and mix ----------
  const MENU_MIX = [1, .8, .85, .9, .55, .6, 0, 0], STING_MIX = [.95, .85, .9, 1, 1, .6, .9, .9], ZERO_MIX = [0, 0, 0, 0, 0, 0, 0, 0];
  function mixUpdate(tau = .7) {
    const now = ac.currentTime, I = S.I; let cut = 900, art = 2400, tgt = ZERO_MIX;
    if (S.sting) { tgt = STING_MIX; cut = 3400; art = 5200; }
    else if (S.mode === 'menu') { tgt = MENU_MIX; cut = S.side === 'villain' ? 1500 : 2400; art = S.side === 'villain' ? 2800 : 4200; }
    else if (S.mode === 'match') {
      const s = secOf(); tgt = s.m.map((v, k) => v + (s.M[k] - v) * I);
      tgt[6] = Math.min(1, tgt[6] + S.late * .15); tgt[7] = Math.min(1, tgt[7] + S.late * .22);
      const open = S.sec === 'brk' ? .55 : S.sec === 'chorus' ? 1.2 : 1;
      const mo = mood(), vil = S.side === 'villain';
      tgt[4] = clamp(tgt[4] + (mo - .5) * .2 + (S.side === 'hero' ? .12 : 0));
      cut = (1300 + I * 2200 * open) * (1 - S.night * .3) * (.85 + mo * .3) * (vil ? .8 : 1.1); art = (3000 + I * 3000 - S.night * 700) * (vil ? .8 : 1);
    }
    LAYERS.forEach((k, i) => { if (mixL[i] === undefined || Math.abs(mixL[i] - tgt[i]) > .004 || tau !== .7) { mixL[i] = tgt[i]; L[k].gain.setTargetAtTime(tgt[i], now, tau); } });
    padF.frequency.setTargetAtTime(cut, now, .8); arpF.frequency.setTargetAtTime(Math.max(1800, art * 1.35), now, .8); // brighter arp so it carries on phone speakers
    // As a fight heats up the arrangement gets denser, so the bus comes down to keep effects on top.
    const bus = S.music ? MUS * (S.sting ? 1.25 : 1) * (S.dim ? .45 : 1) * (S.mode === 'match' && !S.sting ? 1 - .22 * I : 1) : 0;
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
      const spb = stepDur(), b = S.step;
      if (S.mode === 'menu') menuStep(b, S.next, spb); else matchStep(b, S.next, spb);
      S.next += spb; S.step++;
      if (S.step >= barLen()) { S.step = 0; barEnd(); }
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
  // Both sides' stingers finish the hook, then return to the menu theme.
  function stinger(win) {
    if (!ac) { S.mode = 'menu'; return; }
    const stamp = performance.now(); if (stamp - S.stingAt < 8000) return; S.stingAt = stamp;
    setMode(null); S.sting = true; S.I = Math.max(S.I, .75); mixUpdate(.12);
    const t = ac.currentTime + .22;
    const horns = (seq, sh = 0, v = .14, b = 0) => seq.forEach(([d, n, l]) => { trumpet(t + d, n + sh, l, v); horn(t + d, n + sh - 12, l, v * .7); if (b) coinbell(t + d, n + sh + b, .1); });
    const hits = (ds, r, v) => { for (const d of ds) smp(B.timp, t + d, r, v, L.taiko, 0, false, 2); };
    const land = (d, v) => { smp(B.snr, t + d, 1, v, L.perc, 0, false, 2); for (let i = 0; i < 9; i++) smp(pick(B.clink), t + d + i * .08, .9 + Math.random() * .35, v * (1 - i * .08), L.perc, 0, false, 2); };
    if (S.side === 'villain' && win) {
      // City fallen: the reflected hook, then a cold D minor with the tritone left ringing above it.
      horns([[0, 74, .7], [.72, 75, .24], [.98, 74, .3], [1.32, 68, 2]], 0, .14, 12);
      hits([0, .72, 1.32], .8, .36); land(1.32, .12); if (B.crash) smp(B.crash, t + 1.32, .7, .15, mus, 0, false, 2);
      choir(t + 1.32, [50, 57, 62, 65], 3.4, .05); brass(t + 1.32, [50, 57, 62, 65], 2.4, .05); bass(t + 1.32, 50, .22, 3.2);
      [[2.3, 74], [2.75, 80], [3.3, 86], [3.9, 92]].forEach(([d, n], i) => coinbell(t + d, n, .09 - i * .01));
    } else if (S.side === 'villain') {
      // Thwarted: the hook sinks a semitone at a time and gutters out.
      horns([[0, 74, .8], [.8, 68, .5], [1.3, 67, .5], [1.8, 62, 1.9]], 0, .12);
      hits([0, 1.8], .7, .3); land(1.8, .1); choir(t, [51, 58, 63], 1.8, .04); choir(t + 1.8, [50, 57, 65], 3.2, .04, W.oo);
      bass(t, 51, .18, 1.7); bass(t + 1.8, 50, .2, 3); coinbell(t + 2, 68, .08); coinbell(t + 3.1, 62, .08);
    } else if (win) {
      // City saved: the hook lands in bright D major at last.
      horns([[0, 74, .58], [.62, 73, .2], [.84, 74, .26], [1.14, 78, 1.9]], 0, .14, 12);
      hits([0, .62, 1.14], 1, .34); land(1.14, .12);
      if (B.crash) smp(B.crash, t + 1.14, 1, .16, mus, 0, false, 2);
      choir(t + 1.14, [62, 66, 69, 74], 3.2, .045); brass(t + 1.14, [62, 66, 69, 74], 2.4, .05); bass(t + 1.14, 50, .22, 3);
      [62, 66, 69, 74, 78, 81, 86, 90].forEach((n, i) => pluck(t + 1.2 + i * .09, n, .12, arpF, 1.4, 2));
      [[2.3, 86], [2.75, 90], [3.2, 90]].forEach(([d, n]) => coinbell(t + d, n + 12, .1));
    } else {
      // The hero's defeat: the hook turned downward, a plagal sigh to D minor.
      horns([[0, 74, .85], [.85, 69, .5], [1.35, 65, .55], [1.9, 62, 1.8]], -12, .12);
      hits([0, 1.9], .78, .3); land(1.9, .1);
      choir(t, [58, 65, 70], 1.9, .04); choir(t + 1.9, [57, 62, 65, 69], 3.2, .042, W.oo);
      bass(t, 46, .18, 1.8); bass(t + 1.9, 50, .2, 3); coinbell(t + 1.9, 74, .09); coinbell(t + 2.9, 69, .07); coinbell(t + 3.8, 62, .08);
    }
    S.hand = setTimeout(() => setMode('menu'), win ? 5600 : 6000);
  }

  // ---------- effects ----------
  let fxT = 0, fxOut = null, fxVol = 1, fxSend = null;
  const wet = () => { if (!fxSend) fxSend = gain(fxVol * FX_WET, revIn); return fxSend; };
  function tone(f, d, type = 'sine', v = .08, slide = 1, w = 0, dly = 0) {
    if (fxFull()) return;
    const t = fxT + dly, g = gain(0, fxOut); if (w) g.connect(wet());
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .0016); g.gain.exponentialRampToValueAtTime(.0001, t + .0016 + d);
    const o = osc(type, f, t, t + d + .05, 0, g, true);
    if (slide !== 1) { o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + d); }
  }
  function hiss(type, fr, q, v, d, w = 0, dly = 0, to = 0) {
    if (fxFull()) return;
    const t = fxT + dly, n = ac.createBufferSource(), g = gain(0, fxOut), f = filt(type, fr, q, g); if (w) g.connect(wet());
    n.buffer = noise; n.playbackRate.value = .85 + Math.random() * .3; n.connect(f);
    if (to) { f.frequency.setValueAtTime(fr, t); f.frequency.exponentialRampToValueAtTime(to, t + d); }
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(v, t + .002); g.gain.exponentialRampToValueAtTime(.0001, t + .002 + d);
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
  // Sharp attack over a body, for the player's own hits and everyone else's big ones. Heroes ring; villains grind.
  function impact(size) {
    const vil = S.side === 'villain';
    sam(B.punch, (1.25 - size * .35) * rp(.06), .32 + size * .2);
    sam(B.snap, (1.1 - size * .2) * rp(.08), .16 + size * .1);
    if (vil) sam(B.rasp, (1.1 - size * .3) * rp(.06), .12 + size * .1); else glint(.05 + size * .06, 0, 1.2);
    tone((520 - size * 140) * rp(.08), .06 + size * .05, 'triangle', .1 + size * .05, .35);
  }
  // Heroes ring in the bright D major pentatonic; villains grind on the tritone.
  function rough(drive, fn) {
    const out = fxOut, sh = ac.createWaveShaper(); sh.curve = GRIT; sh.connect(gain(1 / (1 + drive * .55), out));
    fxOut = gain(drive, sh); try { fn(); } finally { fxOut = out; }
  }
  const glint = (v, dly = 0, r = 1) => sam(B.shine, r * rp(.03), v, 1, dly);
  const flick = (r, v, w = 0, dly = 0) => sam(B.flick, r * rp(.03), v, w, dly);
  const blade = (r, v, w = 0, dly = 0) => sam(B.blade, r * rp(.04), v, w, dly);
  const crack = (r, v, dly = 0) => sam(B.crack, r * rp(.04), v, 0, dly);
  const anvil = (r, v, w = 0, dly = 0) => sam(B.anvil, r * rp(.03), v, w, dly);
  const rasp = (r, v, w = 0, dly = 0) => sam(B.rasp, r * rp(.05), v, w, dly);
  const trail = (notes, v, gap, w = 1, dly = 0) => notes.forEach((n, i) => chime(n, v, w, dly + i * gap));
  const arc = (r, v, w = 0, dly = 0) => sam(B.arc, r * rp(.05), v, w, dly);
  const bubble = (r, v, w = 0, dly = 0) => sam(B.bubble, r * rp(.05), v, w, dly);
  const fire = (r, v, w = 0, dly = 0) => sam(B.fire, r * rp(.05), v, w, dly);
  const growl = (r, v, w = 0, dly = 0) => sam(B.growl, r * rp(.04), v, w, dly);
  const piston = (r, v, w = 0, dly = 0) => sam(B.piston, r * rp(.03), v, w, dly);
  const mbox = (r, v, w = 0, dly = 0) => sam(B.mbox, r, v, w, dly);
  const wood = (r, v, dly = 0) => sam(B.wood, r * rp(.04), v, 0, dly);
  const wire = (r, v, w = 0, dly = 0) => { if (B.wire) sam(B.wire.b, r, v, w, dly); };
  const sheen = (r, v, w = 1, dly = 0) => sam(B.sheen, r, v, w, dly);
  // Basic attacks, one per character. Very short: they repeat for the whole match.
  const ATK = {
    vesper() { crack(1.5, .13); flick(1.5, .06); },
    kade() { hiss('bandpass', 1500, 1, .13, .05, 0, 0, 3400); flick(1.05, .1); tone(1109, .04, 'triangle', .06, 1, 1); },
    ione() { tone(880, .05, 'triangle', .07, 1.5); flick(1.7, .05); },
    solenne() { tone(1175, .06, 'sine', .08, 1.2, 1); glint(.03, 0, 1.3); },
    sable() { hiss('bandpass', 2800, 1.6, .17, .035, 0, 0, 5200); flick(1.9, .08); tone(2090, .03, 'sine', .05, .4); },
    gravel() { sam(B.punch, 1, .16); metal(.5, .06); },
    deadbolt() { crack(1.05, .15); rasp(1.7, .05); },
    duelist() { metal(1.5, .1); tone(1568, .05, 'triangle', .07, .75); rasp(2, .05); },
    hex() { rough(1, () => tone(349, .07, 'sawtooth', .06, .55)); flick(.7, .05); },
    plague() { hiss('bandpass', 1050, 1.1, .15, .07, 0, 0, 1800); metal(1.35, .08); },
    shiv() { blade(1.9, .09); rasp(2.2, .05); },
    ironjaw() { sam(B.punch, .85, .18); anvil(.8, .07); },
    voltaic() { arc(1.7, .13); tone(1760, .03, 'square', .025, .6); },
    tidecaller() { bubble(1.7, .13); tone(660, .05, 'sine', .07, 1.6); },
    paragon() { sam(B.punch, 1.35, .16); tone(988, .05, 'triangle', .07, 1, 1); },
    mirage() { flick(2, .09); tone(1318.5, .04, 'sine', .07, .75, 1); tone(1760, .03, 'sine', .035, .75, 0, .05); },
    cinder() { fire(2, .13); rough(1, () => tone(220, .05, 'sawtooth', .05, .5)); },
    ravager() { blade(1.05, .12); growl(1.5, .1); },
    cataclysm() { piston(1.5, .15); sam(B.punch, 1.1, .16); },
    puppeteer() { wire(2, .13); wood(1.5, .09); },
  };
  // What a champion's ability sounds like when it lands, layered under the shared hit. One or two voices each.
  const CONTACT = {
    vesper() { crack(1.8, .09); }, kade() { blade(1.25, .1); chime(85, .04, 1); }, ione() { chime(84, .05, 1); tone(740, .05, 'triangle', .05, 1.5); }, solenne() { glint(.08, 0, 1.25); tone(1175, .05, 'sine', .05, 1, 1); },
    sable() { blade(1.7, .08); tone(2090, .03, 'sine', .05, .4); }, gravel() { anvil(1.1, .11); }, deadbolt() { crack(1.1, .11); rasp(1.8, .04); }, duelist() { metal(1.4, .1); tone(1568, .04, 'triangle', .05, .75); }, hex() { rasp(1.3, .08); chime(68, .04, 1); },
    plague() { rough(1, () => tone(311, .06, 'sawtooth', .05, .6)); }, shiv() { blade(1, .1); rasp(2, .04); }, ironjaw() { anvil(.8, .13); },
    voltaic() { arc(1.3, .14); }, tidecaller() { bubble(1.3, .13); }, paragon() { anvil(1.25, .1, 1); }, mirage() { glint(.06, 0, 1.4); tone(1568, .05, 'sine', .04, .6, 0, .05); },
    cinder() { fire(1.3, .13); }, ravager() { blade(.85, .12); growl(1.7, .07); }, cataclysm() { piston(1.2, .13); anvil(.9, .06); }, puppeteer() { wood(1.1, .12); wire(1.5, .08); },
  };
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
    shopOpen() { flick(.8, .08); tone(392, .08, 'triangle', .06, 1.5); tone(587.3, .1, 'triangle', .05, 1.1, 1, .05); },
    shopClose() { flick(.65, .06); tone(587.3, .08, 'triangle', .05, .7); },
    buildPick() { sam(B.snap, 1.4, .08); metal(1.1, .1); tone(m2f(81), .1, 'triangle', .06, 1, 1, .03); },
    atkChamp() { flick(1.15, .1); tone(1320, .03, 'triangle', .06, 1.3); },
    atkMinion() { metal(1.3, .08); tone(930, .03, 'triangle', .05, .8); },
    atkTower() { sam(B.punch, 1.8, .12); anvil(1.1, .05); },
    denied() { tone(233, .06, 'square', .05, .85); tone(196, .08, 'square', .05, .85, 0, .08); },
    buy() { flick(1, .13); metal(.9, .11, 0, .05); metal(1.1, .1, 0, .1); sam(B.punch, 2.2, .09, 0, .1); chime(83, .07, 1, .12); chime(88, .06, 1, .18); },
    buyUp() { flick(1.1, .13); metal(.9, .11, 0, .04); metal(1.1, .1, 0, .08); sam(B.punch, 2.2, .09, 0, .08); trail([81, 85, 88, 93], .065, .055, 1, .1); glint(.07, .14); },
    sell() { for (let i = 0; i < 4; i++) metal(1.25 - i * .12, .11 - i * .012, 0, i * .05); tone(698.5, .2, 'triangle', .06, .55, 1, .04); },
    evolveReady() { tone(m2f(69), .12, 'triangle', .07, 1, 1); tone(m2f(76), .16, 'triangle', .07, 1, 1, .09); glint(.03, .1); },
    evolve() { sam(B.sub, 1.6, .2); bloom('triangle', 146.8, .5, .07, 0, 2); trail([62, 69, 74, 81, 86], .08, .05); glint(.12, .22); flick(1, .12, 1, .22); },
    beaconPlace() { sam(B.snap, 1.3, .11); tone(1320, .22, 'sine', .08, 1, 1, .02); tone(1760, .14, 'triangle', .035, 1, 1, .11); flick(1.5, .05, 1, .11); },
    beaconKill() { sam(B.crack, 1.3, .17); for (let i = 0; i < 3; i++) flick(1.5 - i * .25, .09 - i * .018, 0, .02 + i * .045); tone(1320, .2, 'sine', .06, .4, 1, .02); },
    pingAttack() { for (const d of [0, .09]) { crack(1.6, .1, d); tone(880, .07, 'sawtooth', .05, .9, 0, d); tone(1175, .07, 'triangle', .1, .9, 1, d); } },
    pingRetreat() { tone(784, .12, 'triangle', .13, .94, 1); tone(523.3, .17, 'triangle', .13, .94, 1, .11); metal(.7, .06, 0, .11); },
    pingOmw() { [69, 74, 78].forEach((n, i) => { tone(m2f(n), .07, 'triangle', .11, 1, 1, i * .06); }); flick(1.2, .07, 1, .13); },
    pingHelp() { for (const d of [0, .1, .2, .3]) tone(d * 10 % 2 < 1 ? 1109 : 830.6, .08, 'triangle', .12, 1, 1, d); },
    pingDanger() { rough(1.2, () => { for (const [d, f] of [[0, 415.3], [.14, 293.7]]) tone(f, .11, 'sawtooth', .08, 1, 0, d); }); anvil(.9, .12, 1); },
    storeBuy() { sam(B.punch, .95, .3); anvil(1.5, .1); flick(.95, .18, 1, .03); shower(4, 1); glint(.14, .1); trail([74, 78, 81, 86, 90], .08, .06, 1, .08); },
    equip() { sam(B.snap, .85, .15); metal(.72, .12); tone(392, .05, 'triangle', .07, 1.5, 0, .05); metal(1.15, .1, 1, .07); },
    masteryUnlock() { sam(B.boom, 1.7, .22); flick(.9, .16, 1); [[62, 0], [60, .17], [62, .24], [65, .3], [74, .55]].forEach(([n, d]) => chime(n + 12, .1, 1, d)); glint(.16, .55); shower(4, .95); },
    rankUp() {
      sam(B.boom, 1.4, .3); [[62, 0, .18], [60, .18, .08], [62, .26, .08], [66, .34, .55]].forEach(([n, d, l]) => { tone(m2f(n), l, 'sawtooth', .07, 1, 1, d); tone(m2f(n + 12), l, 'triangle', .08, 1, 1, d); });
      trail([78, 81, 86, 90, 93], .09, .06, 1, .36); glint(.2, .36); shower(3, 1); sam(B.punch, 1.3, .22, 0, .34);
    },
    rankDown() { [[62, 0, .2], [58, .16, .2], [55, .32, .36]].forEach(([n, d, l]) => tone(m2f(n), l, 'triangle', .1, 1, 1, d)); anvil(.6, .1, 1, .32); },
    stingOk() { sam(B.punch, 1.8, .12); [[69, 0], [74, .08], [81, .16]].forEach(([n, d]) => tone(m2f(n), .13, 'triangle', .1, 1, 1, d)); chime(86, .07, 1, .18); glint(.06, .16); },
    stingBad() { rough(.9, () => { tone(233, .22, 'sawtooth', .06, .92, 1); tone(207.7, .24, 'sawtooth', .06, .92, 1, .1); }); anvil(.7, .1, 1, .1); },
    stingHero() { sam(B.boom, 1.35, .3); [[62, 0, .2], [60, .2, .08], [62, .28, .08], [65, .36, .5]].forEach(([n, d, l]) => { tone(m2f(n + 12), l, 'sawtooth', .06, 1, 1, d); tone(m2f(n + 24), l, 'triangle', .07, 1, 1, d); }); chime(89, .07, 1, .36); glint(.1, .36); },
    stingVillain() { sam(B.boom, 1.05, .34); rough(1.1, () => [[62, 0, .24], [63, .24, .08], [62, .32, .08], [56, .4, .55]].forEach(([n, d, l]) => { tone(m2f(n), l, 'sawtooth', .075, 1, 1, d); tone(m2f(n + 12), l, 'square', .03, 1, 1, d); })); chime(68, .1, 1, .4); },
    // contact
    tick() { metal(.55 * rp(.18), .05); },
    hit() { metal(.75 * rp(.12), .09); sam(B.punch, 1.5 * rp(.1), .1); tone(190 * rp(.1), .06, 'triangle', .05, .55); },
    hitHard(p = 1) { sam(B.punch, 1.15 * rp(.1) * p, .26); metal(.62 * rp(.1), .12); hiss('bandpass', 1500, .9, .06, .05); },
    crit() { impact(.6); metal(.55 * rp(.06), .13, 1); chime(86, .05, 1); },
    thud() { sam(B.punch, .72 * rp(.08), .42); hiss('lowpass', 480, .5, .1, .1); },
    // The player's ability connected: an unmistakable pair of notes on top of whatever impact plays. Clean for heroes, snarled for villains.
    hitConfirm(p = 1) {
      if (S.side === 'villain') { rough(1.2, () => { tone(622.3 * p, .04, 'sawtooth', .22); tone(880 * p, .08, 'sawtooth', .2, 1, 1, .03); }); sam(B.punch, 1.5, .13); return; }
      tone(987.8 * p, .04, 'triangle', .19); tone(1480 * p, .09, 'triangle', .18, 1, 1, .03); flick(1.1 * p, .08, 1, .03); sam(B.punch, 1.5, .1);
    },
    pow() { impact(0); },
    bam() { impact(1); sam(B.boom, 1.8, .2); },
    whiff() { hiss('lowpass', 760, .6, .09, .13, 0, 0, 280); tone(210, .1, 'triangle', .03, .7); },
    danger() { for (const [d, f] of [[0, 440], [.13, 587.3]]) { tone(f, .1, 'sawtooth', .08, 1, 0, d); tone(f, .11, 'triangle', .18, 1, 0, d); } sam(B.punch, .7, .16); },
    dangerTower() { for (const d of [0, .17]) { sam(B.clink[1], .4, .18, 1, d); tone(293.7, .14, 'triangle', .13, .94, 0, d); } },
    blast() { sam(B.boom, 1.1, .46); hiss('lowpass', 1200, .4, .14, .32, 1); shower(2); },
    atk(k) { const f = ATK[k]; if (f) f(); else metal(.95 * rp(.12), .05); },
    // Heroes. Clean transients, polished metal, bright overtones.
    snipe() { crack(1.15, .32); flick(1.05, .12); glint(.05); tone(1500 * rp(.05), .08, 'triangle', .06, .3); },
    snipeFull() { crack(.95, .42); sam(B.sub, 1.9, .22); flick(.9, .17, 1); glint(.1); chime(84, .08, 1); tone(1800, .2, 'triangle', .07, .2, 1); },
    snipeCharge() { tone(440, .2, 'triangle', .05, 1.8, 1); flick(.9, .05); },
    dayCharge() { tone(293.7, .36, 'sine', .07, 2, 1); hiss('bandpass', 1500, 1, .05, .36, 1, 0, 4200); chime(78, .05, 1); },
    cascadeCast() { tone(247, .4, 'triangle', .07, 3, 1); [76, 81, 86].forEach((n, i) => chime(n, .04, 1, i * .1)); },
    deadeyeCharge() { tone(240, .8, 'triangle', .07, 7, 1); hiss('bandpass', 900, .9, .08, .8, 1, 0, 4400); for (const d of [0, .34, .58, .72, .8]) flick(1 + d * .7, .1, 0, d); },
    deadeye() { crack(.72, .5); sam(B.boom, 1.5, .4); glint(.16); chime(86, .12, 1); tone(2200, .38, 'triangle', .08, .18, 1); hiss('bandpass', 3200, .8, .1, .3, 1, 0, 700); },
    smokeStep() { hiss('bandpass', 1500, .7, .17, .16, 1, 0, 420); flick(.72, .06); tone(760, .07, 'triangle', .05, .6); },
    lunge(a) { const r = a ? 1.28 : 1.05; blade(r, .24); hiss('bandpass', 1100, .9, .17, .11, 0, 0, 3600); chime(a ? 90 : 85, .055, 1, .03); },
    parry() { chime(86, .13, 1); sam(B.clink[0], 1.1, .18); sam(B.punch, 2, .14); glint(.11); anvil(1.7, .1, 1); },
    leap() { hiss('bandpass', 700, .8, .15, .34, 1, 0, 3000); tone(300, .3, 'sine', .06, 2.6, 1); flick(.8, .06, 0, .02); },
    crash() { sam(B.boom, 1, .46); anvil(.92, .22, 1); glint(.1, .02); hiss('lowpass', 1200, .4, .16, .34, 1, 0, 300); shower(3); },
    orb() { tone(523.3, .17, 'sine', .08, 3, 1); tone(1046, .13, 'triangle', .03, 2, 1, .02); flick(1.2, .1, 1); chime(88, .05, 1, .05); },
    ruptureCast() { tone(220, .46, 'triangle', .06, 4, 1); hiss('bandpass', 1400, 1.2, .06, .46, 1, 0, 3400); chime(76, .05, 1); },
    rupture() { sam(B.sub, 1.1, .36); crack(.7, .18); chime(76, .08, 1); tone(260, .26, 'sawtooth', .04, .4, 1); hiss('lowpass', 1500, .5, .13, .24, 1); },
    cascade(i = 0) { sam(B.sub, 1.4 + i * .2, .24); flick(.9 + i * .18, .17, 1); chime([81, 88, 93][i % 3], .1, 1); glint(.1, 0, .8 + i * .14); hiss('bandpass', 2400, .9, .1, .16, 1, 0, 4800); },
    break() { [1.35, 1, 1.65].forEach((r, i) => flick(r, .12, 1, i * .03)); glint(.1, .03); sam(B.sub, 1.5, .24); },
    ray() { tone(880, .18, 'sine', .08, 1.5, 1); tone(1760, .13, 'triangle', .035, 1.5, 1); glint(.07); chime(85, .05, 1, .04); },
    dome() { tone(293.7, .4, 'sine', .08, 1.5, 1); tone(587.3, .34, 'sine', .035, 1.5, 1); anvil(2.4, .07, 1); chime(76, .07, 1); chime(83, .05, 1, .09); glint(.06, .08); },
    domeBlock() { flick(1.2, .13, 1); chime(88, .06, 1); },
    heal() { sam(B.sub, 1.7, .16); [74, 78, 81, 86, 90].forEach((n, i) => chime(n, .08, 1, i * .05)); glint(.16, .14); bloom('triangle', 293.7, .5, .06, 0, 1.5); },
    slash() { hiss('bandpass', 1800, .9, .18, .09, 0, 0, 4200); blade(1.3, .2); flick(1.4, .07, 1, .02); },
    blink() { tone(1600, .09, 'sine', .07, .35); hiss('bandpass', 2600, .8, .05, .07, 1); glint(.05, 0, 1.3); },
    reap() { blade(.72, .32); sam(B.punch, .9, .34); tone(523.3, .26, 'sawtooth', .05, .25, 1); chime(74, .1, 1, .03); glint(.1, .04, .8); },
    chain() { sam(B.chainL, 1.1, .26); crack(1.5, .12); tone(330, .16, 'triangle', .05, 2, 1); },
    chainHit() { anvil(1, .28); sam(B.punch, 1.1, .24); sam(B.chainL, .85, .13, 0, .03); },
    stomp() { sam(B.boom, 1.35, .42); anvil(.7, .18); tone(150, .16, 'triangle', .08, .5); shower(1, .6); },
    avalanche() { hiss('lowpass', 500, .7, .28, .5, 1, 0, 1300); sam(B.boom, 1.9, .24); anvil(.6, .12); for (let i = 0; i < 3; i++) sam(B.punch, .6 + i * .1, .12, 0, .06 + i * .1); },
    avalancheHit() { sam(B.boom, .92, .5); anvil(.58, .28, 1); crack(.6, .22); hiss('lowpass', 900, .4, .17, .34, 1, 0, 240); shower(3, .7); },
    // Villains. Rough edges, low iron, filth in the top end, the tritone.
    tripwire() { rough(1.2, () => { tone(311.1, .18, 'sawtooth', .1, .92); tone(466.2, .16, 'square', .04, .9); }); sam(B.snap, 1.4, .16); metal(.7, .1, 1, .04); },
    tripwireHit() { crack(1.1, .3); anvil(1.9, .24); rough(1.4, () => tone(659.3, .1, 'sawtooth', .09, .33)); },
    ricochet() { crack(.85, .38); rough(1.1, () => tone(3300, .16, 'sawtooth', .05, .33)); rasp(1.3, .1); },
    ricochetHit() { flick(.9, .16); tone(800, .09, 'triangle', .1, 3, 1); crack(1.4, .14); },
    lockdown() { anvil(.5, .32, 1); sam(B.sub, 1.3, .3); rough(1.6, () => [[0, 415.3], [.13, 293.7], [.26, 415.3], [.39, 293.7]].forEach(([d, f]) => { tone(f, .1, 'sawtooth', .075, 1, 0, d); tone(f * 2, .09, 'square', .025, 1, 0, d); })); rasp(.7, .14, 1); },
    lockdownHit() { crack(1.25, .17); rasp(1.6, .07); },
    flourish(i = 0) { const k = Math.max(0, Math.min(2, i)); blade(1 + k * .14, .2 + k * .03); hiss('bandpass', 1300 + k * 500, 1, .13, .08, 0, 0, 3000); if (k === 2) { sam(B.punch, 1.05, .34); anvil(1.3, .16, 1); rough(1.2, () => tone(233, .16, 'sawtooth', .09, 2)); } },
    feint() { hiss('bandpass', 2400, 1, .13, .12, 1, 0, 700); sam(B.snap, .8, .11); tone(740, .1, 'triangle', .05, .5, 1); tone(622.3, .1, 'triangle', .03, .5, 1, .09); rasp(1.8, .05, 1, .08); },
    salute() { sam(B.boom, 1.4, .32); anvil(.74, .3, 1); anvil(.52, .24, 1, .22); rough(1.3, () => { for (const f of [146.8, 207.7]) tone(f, .6, 'sawtooth', .05, .98, 1); }); chime(68, .1, 1, .22); blade(1.1, .14, 1, .03); },
    hexbolt() { rough(1, () => { tone(523.3, .15, 'sawtooth', .08, .4); tone(739.9, .11, 'square', .03, .45); }); rasp(1.15, .11, 1); },
    hexboltHit() { chime(68, .06, 1); rasp(1.5, .13); tone(415.3, .08, 'triangle', .05, .6); },
    polymorph() { rough(.9, () => tone(660, .09, 'sawtooth', .07, 1.6)); tone(880, .1, 'sine', .07, .5, 1); flick(1.25, .07); },
    polymorphHit() { for (let i = 0; i < 7; i++) metal(.8 + i * .13, .09, 0, i * Math.max(.016, .05 - i * .006)); tone(330, .14, 'sine', .08, 3, 1, .1); flick(.75, .19, 1, .22); sam(B.punch, 1.9, .16, 0, .22); },
    coven() { air(1900, 240, 1.2, .16, .55); sam(B.swell, 1.9, .16, 1); for (const [f, d] of [[146.8, 0], [207.7, .07]]) bloom('sawtooth', f, .7, .06, d, .78); rasp(.6, .14, 1); chime(56, .1, 1, .05); },
    covenHit() { sam(B.boom, 1.05, .46); crack(.62, .24); rough(1.5, () => { for (const f of [116.5, 164.8, 233]) tone(f, .36, 'sawtooth', .06, .84, 1); }); anvil(.62, .18, 1); },
    miasma() { hiss('lowpass', 900, .7, .15, .55, 1, 0, 2500); rasp(.5, .09, 1); for (let i = 0; i < 4; i++) tone(300 + Math.random() * 240, .05, 'sine', .08, 1.9, 1, .04 + i * .09); },
    feintPop() { sam(B.snap, .9, .14); hiss('bandpass', 1700, 1, .1, .1, 1, 0, 600); rasp(1.6, .07, 1); },
    curse(n = 0) { chime(68 + Math.min(4, n) * 3, .05, 1); rasp(1.7 + n * .05, .06); },
    rooted() { anvil(1.9, .14); crack(1.6, .1); },
    shieldUp() { tone(698.5, .13, 'sine', .07, 1.5, 1); glint(.06, .02); flick(1.1, .05, 1); },
    stealthBreak() { hiss('bandpass', 1900, 1.2, .08, .09, 0, 0, 3400); rasp(1.3, .07); },
    beaconHit() { flick(1.3, .09); tone(1320, .05, 'triangle', .05, .7); },
    leech() { rough(1.1, () => { tone(110, .4, 'sawtooth', .1, 1.33, 1); tone(164.8, .34, 'sawtooth', .05, .8, 1); }); tone(1174.7, .16, 'sine', .06, .75, 1, .05); hiss('bandpass', 1300, 3, .09, .26, 1, .02, 460); },
    quarantine() { sam(B.punch, .8, .36); anvil(.45, .3, 1); crack(.55, .2); rough(1.3, () => { for (const f of [185, 261.6, 370]) tone(f, .55, 'sawtooth', .04, .96, 1); }); rasp(.75, .13, 1); chime(62, .08, 1, .1); },
    shank() { blade(.88, .3); rasp(1.45, .13); sam(B.punch, 1.4, .22); hiss('bandpass', 2600, 1.1, .1, .07, 0, 0, 900); },
    vanish() { air(2600, 700, 1, .12, .2); tone(700, .18, 'sine', .07, .25, 1); rasp(.8, .08, 1); sam(B.swell, 3, .08); },
    cuts() { for (let i = 0; i < 6; i++) blade(1 + (i % 2) * .22 + i * .05, .17 + i * .012, 0, i * .085); rasp(1.1, .1, 1, .1); sam(B.punch, 1, .38, 0, .5); chime(56, .08, 1, .5); },
    wrecking() { sam(B.chainL, .66, .3); hiss('bandpass', 420, .8, .26, .42, 1, 0, 1100); anvil(.45, .2, 1, .06); tone(98, .36, 'sawtooth', .07, 1.5, 1); },
    wreckingHit() { anvil(.68, .3); sam(B.punch, .92, .36); crack(.7, .16); },
    grab() { sam(B.punch, .95, .4); anvil(1.2, .16); rasp(1, .1); hiss('bandpass', 500, .8, .18, .22, 1, .12, 1900); },
    demolish() { rasp(.55, .2, 1); sam(B.boom, 1.9, .22); crack(.5, .24); for (let i = 0; i < 4; i++) crack(.7 + i * .13, .14 - i * .018, .07 + i * .07); },
    demolishHit() { sam(B.boom, 1.05, .5); anvil(.5, .24, 1); crack(.42, .2, .01); hiss('lowpass', 1000, .4, .16, .4, 1, 0, 260); shower(3, .6); },
    skHit(k) { const f = CONTACT[k]; if (f) f(); },
    // Heroes, 10.0. Slot names: Q is the first ability, W the second, R the ultimate; Hit is a skill landing, Burst a big area going off.
    voltaicQ() { arc(1, .3); hiss('bandpass', 2400, 1, .1, .06, 0, 0, 5200); flick(1.4, .09); chime(90, .05, 1, .03); },
    voltaicW() { tone(440, .16, 'sawtooth', .06, 3, 1); arc(1.4, .2, 0, .02); hiss('bandpass', 1200, .9, .1, .16, 1, 0, 4200); chime(86, .05, 1, .1); },
    voltaicR() { arc(.8, .3, 1); tone(330, .24, 'sawtooth', .07, 4, 1); sam(B.sub, 1.6, .3, 0, .16); crack(.62, .34, .18); arc(1.25, .24, 0, .18); trail([86, 90, 93], .08, .05, 1, .18); glint(.14, .2); },
    voltaicHit() { arc(1.3, .24); crack(1.7, .11); },
    voltaicBurst() { sam(B.boom, 1.25, .42); crack(.7, .3); arc(.85, .3, 1); glint(.12); hiss('bandpass', 3400, .8, .12, .22, 1, 0, 900); },
    tidecallerQ() { air(400, 2200, .7, .2, .22); bubble(1, .24, 1); chime(74, .06, 1, .05); },
    tidecallerW() { bloom('sine', 392, .4, .08, 0, 1.5); bubble(.8, .2, 1); chime(78, .06, 1, .06); chime(85, .05, 1, .14); },
    tidecallerR() { air(260, 1600, .6, .26, .46); sam(B.boom, 1.6, .28, 0, .24); bubble(.7, .24, 1, .16); trail([69, 74, 81, 86], .075, .07, 1, .16); bloom(W.oo, 220, .7, .05); },
    tidecallerHit() { bubble(1.3, .22); tone(330, .1, 'triangle', .07, 2); },
    tidecallerBurst() { sam(B.boom, 1.35, .38); air(1600, 320, .7, .22, .32); bubble(.75, .28, 1); chime(69, .08, 1, .02); },
    paragonW() { sam(B.punch, 1.2, .26); for (const n of [69, 76]) tone(m2f(n), .13, 'sawtooth', .065, 1, 1); hiss('bandpass', 900, .9, .13, .1, 0, 0, 2600); flick(.9, .07, 1, .03); },
    paragonQ() { hiss('bandpass', 500, .8, .2, .3, 1, 0, 2800); tone(293.7, .3, 'sine', .07, 2, 1); flick(.85, .11, 1); chime(81, .05, 1, .16); },
    paragonR() { for (const [n, d] of [[62, 0], [69, .08], [74, .16]]) { tone(m2f(n), .34, 'sawtooth', .065, 1, 1, d); tone(m2f(n + 12), .3, 'triangle', .08, 1, 1, d); } sam(B.boom, 1.1, .48, 0, .2); anvil(.85, .26, 1, .2); glint(.18, .22); chime(86, .1, 1, .24); },
    paragonHit() { sam(B.punch, 1.1, .26); anvil(1.25, .15, 1); tone(587.3, .08, 'triangle', .07, 1, 1); },
    paragonBurst() { sam(B.boom, 1, .48); anvil(.8, .28, 1); trail([74, 81, 86], .085, .05, 1, .03); hiss('lowpass', 1400, .4, .14, .28, 1, 0, 320); },
    mirageQ() { crack(1.4, .26); flick(1.7, .1, 1); crack(1.9, .09, .075); flick(2.1, .05, 1, .075); glint(.05, .02, 1.3); },
    mirageW() { sheen(2.4, .18); tone(1400, .13, 'sine', .07, .5, 1); tone(1050, .13, 'sine', .045, .5, 1, .07); tone(787, .13, 'sine', .03, .5, 1, .14); },
    mirageR() { sheen(1.5, .26); tone(620, .42, 'triangle', .06, 3, 1); crack(.78, .4, .44); sam(B.boom, 1.5, .3, 0, .44); crack(1.2, .14, .55); crack(1.6, .07, .64); glint(.14, .46); chime(90, .08, 1, .46); },
    mirageHit() { glint(.09, 0, 1.4); crack(1.6, .11); tone(1568, .06, 'sine', .05, .6, 0, .05); },
    mirageBurst() { sam(B.boom, 1.4, .36); glint(.16); sheen(3, .14); trail([90, 85, 81], .07, .07, 1, .02); },
    // Villains, 10.0.
    cinderQ() { hiss('bandpass', 700, .8, .18, .18, 1, 0, 2400); fire(1.4, .22, 1); rough(1.1, () => tone(311, .1, 'sawtooth', .07, .6)); },
    cinderW() { fire(.9, .28, 1); rough(1.1, () => tone(138.6, .3, 'sawtooth', .08, 1.4, 1)); hiss('lowpass', 1600, .5, .16, .26, 1, 0, 500); },
    cinderR() { air(300, 2000, .7, .24, .36); fire(.7, .34, 1, .08); sam(B.boom, 1.25, .44, 0, .3); rough(1.4, () => { for (const f of [146.8, 207.7]) tone(f, .5, 'sawtooth', .06, .92, 1, .3); }); },
    cinderHit() { fire(1.3, .24); crack(1.1, .1); rasp(1.7, .05); },
    cinderBurst() { sam(B.boom, 1.1, .48); fire(.8, .34, 1); rough(1.4, () => { for (const f of [116.5, 164.8]) tone(f, .3, 'sawtooth', .06, .86, 1); }); hiss('lowpass', 1500, .4, .14, .26, 1, 0, 320); },
    ravagerQ() { growl(1, .3); blade(.95, .24); rasp(1.3, .11); hiss('bandpass', 1200, .9, .12, .08, 0, 0, 2800); },
    ravagerW() { growl(.76, .36, 1); rough(1.2, () => tone(110, .24, 'sawtooth', .08, 1.5, 1)); rasp(.7, .12, 1, .06); },
    ravagerR() { growl(.6, .4, 1); bloom('sawtooth', 98, .7, .07, 0, 2.1); blade(.8, .32, 1, .22); sam(B.punch, .85, .38, 0, .22); blade(1.1, .24, 0, .32); rasp(.9, .16, 1, .22); },
    ravagerHit() { blade(.85, .26); sam(B.punch, 1.2, .24); growl(1.7, .1); },
    ravagerBurst() { sam(B.boom, 1.3, .42); growl(.7, .28, 1); blade(.7, .22, 1); rasp(.8, .14, 1); },
    cataclysmQ() { piston(1, .34); rough(1.3, () => tone(98, .22, 'sawtooth', .09, .8)); anvil(.55, .18, 1); },
    cataclysmW() { rough(1.4, () => tone(146.8, .36, 'sawtooth', .09, 1.5, 1)); piston(1, .26, 1, .05); anvil(.9, .12, 1); rasp(.7, .14, 1); },
    cataclysmR() { for (let i = 0; i < 3; i++) piston(.9 + i * .22, .18 + i * .05, 0, i * .17); hiss('bandpass', 500, .8, .22, .5, 1, 0, 2600); sam(B.boom, 1, .5, 0, .54); anvil(.6, .34, 1, .54); crack(.6, .3, .54); shower(3, .6); },
    cataclysmHit() { piston(.9, .32); anvil(.7, .22); crack(.6, .13); },
    cataclysmBurst() { sam(B.boom, 1.1, .48); anvil(.62, .32, 1); crack(.62, .28); hiss('lowpass', 1000, .4, .16, .34, 1, 0, 260); shower(3, .55); },
    puppeteerQ() { wire(1.4, .24); wire(1.9, .17, 0, .06); wood(1.3, .12, .02); tone(740, .08, 'triangle', .05, 1.4, 1, .05); },
    puppeteerW() { mbox(1, .2, 1); mbox(1.414, .15, 1, .09); wood(1, .14, .05); wire(.9, .16, 1, .03); },
    puppeteerR() { wire(.7, .34, 1); [1, 1.189, 1.414, 1.682].forEach((r, i) => mbox(r * .75, .16, 1, .1 + i * .09)); rough(1.3, () => { for (const f of [146.8, 207.7]) tone(f, .55, 'sawtooth', .05, .96, 1, .08); }); wood(.7, .22, .42); },
    puppeteerHit() { wood(1.1, .24); wire(1.5, .2); },
    puppeteerBurst() { wire(.6, .34, 1); sam(B.boom, 1.4, .34); mbox(.7, .16, 1, .1); mbox(.5, .14, 1, .2); },
    killStrike() { sam(B.boom, 1.6, .34); blade(1.1, .3); crack(.9, .22); anvil(1.2, .16, 1); hiss('bandpass', 1800, .9, .14, .1, 0, 0, 4400); chime(86, .08, 1, .03); },
    monsterKill() { sam(B.punch, 1.1, .26); metal(.7, .13, 1); chime(79, .06, 1, .03); },
    boon() { sam(B.sub, 1.5, .2); [69, 76, 81].forEach((n, i) => chime(n, .07, 1, i * .07)); glint(.08, .14); },
    levelMax() { sam(B.boom, 1.4, .3); [62, 69, 74, 78, 81, 86, 90].forEach((n, i) => chime(n, .09, 1, i * .055)); for (const n of [62, 69, 74]) tone(m2f(n + 12), .4, 'sawtooth', .05, 1, 1, .2); glint(.18, .3); shower(3, 1); },
    // Shop tabs, lane proficiency, settings and account.
    shopCat(k) {
      const T = { rec: [79, () => glint(.04, 0, 1.2)], attack: [74, () => blade(1.5, .07)], ability: [86, () => chime(93, .04, 1, .02)], tank: [62, () => anvil(1.1, .07)], util: [81, () => flick(1.3, .05)], leg: [90, () => glint(.08)], cons: [76, () => metal(1.2, .07)], city: [69, () => { metal(.9, .07); metal(1.1, .06, 0, .03); }] }[k] || [76, null];
      sam(B.snap, 1.5, .08); tone(m2f(T[0]), .07, 'triangle', .07, 1, 1); if (T[1]) T[1]();
    },
    profPick(i = 0) { const k = Math.abs(i | 0) % 3; sam(B.snap, 1.2, .12); metal(1 + k * .14, .13); tone(m2f([69, 74, 81][k]), .14, 'triangle', .08, 1, 1, .02); chime([81, 86, 90][k], .05, 1, .04); },
    targetPref() { sam(B.snap, 1.6, .1); tone(880, .05, 'triangle', .07, 1.3, 1); },
    accountOpen() { tone(329.6, .09, 'triangle', .07, 1.5, 1); flick(.9, .07, 1, .03); },
    copyCode() { for (let i = 0; i < 3; i++) sam(B.snap, 1.2 + i * .25, .1, 0, i * .05); chime(83, .07, 1, .13); glint(.07, .14); },
    importOk() { sam(B.punch, 1.2, .22); [69, 74, 78, 86].forEach((n, i) => chime(n, .085, 1, i * .07)); shower(3, 1); glint(.12, .2); },
    importBad() { rough(1, () => { tone(233, .14, 'sawtooth', .07, .9, 1); tone(196, .2, 'sawtooth', .07, .85, 1, .12); }); anvil(.7, .12, 1, .12); },
    resetWarn() { for (const d of [0, .14]) tone(466.2, .1, 'sawtooth', .06, 1, 1, d); anvil(.6, .14, 1); },
    resetDone() { sam(B.boom, 1.3, .3); tone(330, .5, 'triangle', .09, .3, 1); shower(4, .7); },
    // Older names kept for other callers.
    bolt() { metal(.95 * rp(.12), .05); tone(1200 * rp(.08), .04, 'triangle', .03, .6); },
    mbolt() { metal(.6 * rp(.15), .03); },
    tshot() { tone(900, .12, 'triangle', .06, .25); sam(B.sub, 1.7 * rp(.08), .18); hiss('bandpass', 1000, 1, .06, .1); },
    swing() { hiss('bandpass', 1300, 1, .11, .06, 0, 0, 2800); },
    dash() { hiss('bandpass', 600, .8, .2, .2, 1, 0, 1900); tone(240, .15, 'sine', .05, 2); },
    mark() { chime(86, .04, 1); },
    stun() { [86, 89, 86].forEach((n, i) => chime(n, .05, 0, i * .05)); },
    // the people
    rescued() { [74, 78, 81, 86, 90].forEach((n, i) => chime(n, .075, 1, i * .06)); hiss('bandpass', 1400, 1.4, .05, .3, 1, .05, 2600); shower(2, 1); glint(.08, .12); },
    seized() { rough(1.2, () => { for (const f of [146.8, 207.6]) tone(f, .5, 'sawtooth', .05, .94, 1); }); sam(B.boom, 1.2, .4); chime(56, .14, 1); for (let i = 0; i < 3; i++) tone(700 + Math.random() * 500, .09, 'triangle', .03, i % 2 ? 1.4 : .7, 1, .14 + i * .09); },
    hopeSwell() { for (const [f, d] of [[146.8, 0], [220, .12], [293.7, .24], [370, .36]]) bloom(W.ah, f, 2.1, .04, d); [81, 86, 90].forEach((n, i) => chime(n, .08, 1, .55 + i * .14)); glint(.08, .55); },
    dread() { for (const [f, d] of [[146.8, 0], [207.7, .1]]) bloom('sawtooth', f, 1.9, .045, d); sam(B.boom, .8, .38, 1); chime(56, .13, 1, .2); chime(62, .1, 1, .55); rasp(.5, .08, 1, .1); },
    // match events
    kill() { sam(B.boom, 1.6, .28); sam(B.punch, 1, .28); if (S.side === 'villain') { rough(1.2, () => [[293.7, 0], [207.7, .09]].forEach(([f, d]) => tone(f, .24, 'sawtooth', .07, 1, 1, d))); chime(68, .1, 1, .09); } else { [81, 86, 89, 93].forEach((n, i) => chime(n - 5, .09, 1, i * .075)); glint(.1, .1); } shower(2); },
    death() { tone(330, .7, 'triangle', .1, .25, 1); sam(B.boom, 1.25, .36); chime(62, .1, 1, .05); },
    feed(m = 1) { chime(80 + Math.min(4, m) * 2, .06, 1); },
    level() { [74, 81, 86, 89].forEach((n, i) => chime(n, .09, 1, i * .07)); tone(440, .3, 'triangle', .04, 1, 1); glint(.07, .16); },
    forge() { metal(.5, .22, 1); chime(81, .09, 1, .02); hiss('bandpass', 2600, 3, .1, .08, 1); sam(B.sub, 2.1, .14); },
    banVote() { tone(180, .3, 'sawtooth', .07, .7, 1); },
    lockIn() { sam(B.punch, 1.7, .16); metal(.8, .11); tone(392, .1, 'triangle', .08, 1, 1); tone(784, .26, 'triangle', .09, 1, 1, .07); chime(86, .06, 1, .09); },
    fundCity() { FX.fund(); },
    buyLegendary() { sam(B.boom, 1.4, .24); anvil(1.3, .14, 1); [523, 784, 1047, 1568].forEach((f, i) => tone(f, .44, 'triangle', .08, 1, 1, i * .06)); glint(.14, .16); shower(3, 1); },
    emote() { tone(880, .12, 'sine', .06, 1.3, 1); },
    medal() { tone(1047, .4, 'triangle', .08, 1, 1); FX.clink(1.1); },
    medalMvp() { [659, 880, 1109, 1319, 1760].forEach((f, i) => tone(f, .44, 'triangle', .08, 1, 1, i * .07)); glint(.12, .24); },
    siren() { for (let i = 0; i < 6; i++) tone(i % 2 ? 560 : 720, .22, 'triangle', .06, 1.06, 1, i * .24); },
    powerDown() { tone(460, 1, 'sawtooth', .06, .1, 1); hiss('lowpass', 700, .5, .12, .5); sam(B.boom, 1.5, .16); },
    dropLand() { sam(B.boom, 1.1, .3); tone(240, .3, 'triangle', .09, .55, 1); },
    cheer() { hiss('bandpass', 1500, .6, .14, 1.1, 1); [659, 784, 988, 1319].forEach((f, i) => tone(f, .3, 'triangle', .07, 1, 1, i * .08)); },
    eventLost() { [392, 349, 262].forEach((f, i) => tone(f, .44, 'sawtooth', .05, .98, 1, i * .15)); },
    buyback() { sam(B.boom, 1.3, .24); [392, 587, 784, 1175].forEach((f, i) => tone(f, .28, 'triangle', .08, 1, 1, i * .05)); },
    fund() { for (let i = 0; i < 6; i++) metal(.9 + i * .12, .12, 0, i * .05); tone(523, .6, 'sine', .06, 1.5, 1); },
    reinforce() { tone(196, .46, 'sawtooth', .08, 1, 1); tone(294, .64, 'sawtooth', .08, 1.02, 1, .16); },
    consume() { tone(600, .16, 'sine', .07, 1.6, 1); },
    surrender() { tone(330, .4, 'triangle', .07, .8, 1); },
    bossup() { tone(140, 1.3, 'sawtooth', .06, 1.4, 1); tone(210, 1.3, 'triangle', .14, 1.2, 1); sam(B.boom, .85, .36); },
    boss() { sam(B.boom, .95, .55); chime(62, .16, 1); chime(69, .12, 1, .05); shower(4, .8); },
    tower() { sam(B.boom, .9, .55); hiss('lowpass', 800, .4, .2, .75, 1, 0, 240); chime(55, .12, 1); shower(4, .75); },
    towerNews(good) { if (good) { chime(84, .1, 1); chime(91, .1, 1, .12); } else { tone(196, .4, 'triangle', .1, .75, 1); tone(147, .5, 'triangle', .09, .75, 1, .16); } },
    towerFall(good) {
      const seq = good ? [[62, 0, .12], [69, .11, .12], [74, .22, .34]] : [[62, 0, .14], [58, .14, .14], [53, .28, .42]];
      for (const [n, d, l] of seq) { tone(m2f(n), l, 'sawtooth', .05, 1, 1, d); tone(m2f(n), l, 'triangle', .1, 1, 1, d); }
      if (good) { chime(86, .09, 1, .22); chime(90, .08, 1, .3); }
    },
    victory(dly = 0) { [86, 90, 93].forEach((n, i) => chime(n - 5, .08, 1, dly + i * .09)); for (let i = 0; i < 5; i++) metal(.9 + i * .07, .08 - i * .008, 0, dly + .04 + i * .075); },
    thunder() { hiss('lowpass', 560, .5, .26, 1.8, 1, .02, 90); sam(B.boom, .65, .24, 0, .04); },
    heart() { sam(B.sub, 1.25, .3); sam(B.sub, 1.45, .22, 0, .16); },
    recall() { tone(500, .5, 'sine', .07, 2, 1); chime(81, .06, 1, .1); },
    respawn() { tone(440, .3, 'triangle', .07, 2, 1); chime(86, .08, 1, .12); },
    whoosh() { hiss('bandpass', 500, .8, .24, .38, 1, 0, 1500); },
    title() { [[74, 0], [72, .19], [74, .25], [77, .33]].forEach(([n, d], i) => { if (B.cbell.length) smp(nearest(B.cbell, n).b, fxT + d, m2f(n) / nearest(B.cbell, n).f, .13 + i * .015, fxOut, 0, true, 2, wet()); }); glint(.08, .33); },
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
      if (vil) { rough(1.1, () => { for (const [f, o] of [[146.8, 0], [207.7, .07]]) { bloom('sawtooth', f, 1.1, .05, d + o); bloom('triangle', f * 2, 1.1, .05, d + o); } }); chime(68, .11, 1, d + .18); chime(62, .11, 1, d + .42); }
      else { [[62, 0], [69, .08], [74, .16], [78, .24]].forEach(([n, o]) => { tone(m2f(n), .5 - o, 'triangle', .1, 1, 1, d + o); tone(m2f(n), .4 - o, 'sawtooth', .03, 1, 1, d + o); }); chime(86, .1, 1, d + .24); chime(90, .09, 1, d + .34); glint(.09, d + .28); }
    },
    versus() { sam(B.boom, 1.25, .42); sam(B.punch, .85, .38); sam(B.snap, .85, .18); metal(.5, .12, 1); for (const f of [146.8, 220, 293.7]) tone(f, .36, 'sawtooth', .04, .98, 1); },
  };
  function nearest(bank, n) { let e = bank[0]; for (const c of bank) if (Math.abs(c.n - n) < Math.abs(e.n - n)) e = c; return e; }
  const DUCK = {
    blast: .35, tower: .5, kill: .4, crash: .4, stomp: .3, rupture: .3, cascade: .28, break: .25, boss: .5, bossup: .4, thunder: .2, deadeye: .3, death: .5, seized: .35, hopeSwell: .3, dread: .4,
    hitConfirm: .22, pow: .25, bam: .4, crit: .28, thud: .3, danger: .45, dangerTower: .4, towerFall: .4, victory: .1, heal: .3, reap: .35, avalanche: .25, avalancheHit: .45, parry: .22, snipeFull: .22,
    lockdown: .35, salute: .4, coven: .3, covenHit: .42, quarantine: .35, cuts: .3, demolish: .45, demolishHit: .35, wrecking: .22, wreckingHit: .3, grab: .28, polymorphHit: .3,
    voltaicR: .35, voltaicBurst: .4, tidecallerR: .32, tidecallerBurst: .35, paragonR: .45, paragonBurst: .42, mirageR: .35, mirageBurst: .32, cinderR: .42, cinderBurst: .42, ravagerR: .4, ravagerBurst: .36, cataclysmR: .5, cataclysmBurst: .46, puppeteerR: .35, puppeteerBurst: .32, killStrike: .4, levelMax: .4, importOk: .25, resetDone: .3,
    flipSlam: .75, flipReveal: .55, versus: .65, friendJoin: .2, friendLeave: .15, evolve: .3, storeBuy: .35, masteryUnlock: .45, rankUp: .6, rankDown: .35, stingHero: .55, stingVillain: .55, stingOk: .2, stingBad: .2, pingDanger: .3, pingHelp: .2,
  };
  function duck(amount = .4, recover = .5) {
    if (!ac) return; if (S.sting) amount *= .4;
    const t = ac.currentTime, a = clamp(amount, 0, .85); if (t - S.duckAt < .1 && a <= S.duckAmt) return; S.duckAt = t; S.duckAmt = a;
    for (const g of [ducker, duckWet]) { g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(1 - a, t, .008); g.gain.setTargetAtTime(1, t + .05 + a * .1, recover); }
  }
  function flush() {
    if (!ac || !fxReady || ac.state !== 'running' || !early.length) return;
    const cut = performance.now() - 1500; for (const p of early.splice(0)) if (p.at > cut) play(p.name, p.a, p.gap, p.opts);
  }
  // opts: { pan: -1..1, vol: 0..1, low: true for routine sounds that are rate-limited and dropped first }
  function play(name, a, gap = 34, opts) {
    if (!ac || !S.sfx) return;
    const f = FX[name]; if (!f) return;
    if ((name === 'tap' || name === 'tick' || name === 'clink' || name === 'menuOpen') && !opts && performance.now() < S.claim) return; // the screen already played something specific for this press
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
    if (DUCK[name]) duck(DUCK[name] * vol, DUCK[name] > .45 ? .42 : .22);
  }
  function ambience(rain, wind) { if (!ac) return; const t = ac.currentTime; rainG.gain.setTargetAtTime(clamp(rain) * .04, t, .8); windG.gain.setTargetAtTime(clamp(wind) * .03, t, 1.2); }
  function setOn(music, fx) {
    S.music = music; S.sfx = fx; if (!ac) return; const t = ac.currentTime;
    if (!music) release(.1);
    S.mixT = 0; mus.gain.setTargetAtTime(music ? MUS : 0, t, .15); musWet.gain.setTargetAtTime(music ? MUS * 1.6 : 0, t, .15); sfx.gain.setTargetAtTime(fx ? SFX : 0, t, .1);
  }
  return {
    init, play, setMode, stinger, ambience, setOn, duck,
    claim(ms) { S.claim = ms ? performance.now() + ms : 0; },
    voices: () => ac ? { mus: count(musEnds), fx: count(fxEnds) } : { mus: 0, fx: 0 },
    has: name => typeof FX[name] === 'function',
    recent: (name, ms = 500) => last[name] !== undefined && performance.now() - last[name] < ms,
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
