// Match HUD, drawn on the canvas, plus the upgrade panel and pause overlay.
const Hud = {
  ui: {
    atk: { x: 0, y: 0, r: 46 },
    ab: [{ x: 0, y: 0, r: 33 }, { x: 0, y: 0, r: 33 }, { x: 0, y: 0, r: 37 }],
    cancel: { x: 0, y: 70, r: 34 }, pause: { x: 0, y: 24, r: 16 },
    forge: { x: 68, y: 92, r: 20 }, recall: { x: 124, y: 92, r: 20 },
    map: { x: 0, y: 8, w: 156, h: 93 },
    stripX: 400, miniR: 13, miniGap: 30, midHalf: 44, hpW: 130, compact: false,
  },
};

const { hud, initHud, hudDraw, uiEvent } = (() => {
  const U = Hud.ui, HPI = Math.PI / 2, UIFONT = '"Barlow Semi Condensed",sans-serif', DISP = 'Forum,Georgia,serif';
  const BRASS = '#e0b552', PARCH = '#f1e8d0', INK = 'rgba(8,24,22,.86)', HP_X = 110, GOLD_X = 118, GOLD_Y = 52;
  const TRACKS = [['edge', 'Edge', 'More damage from everything'], ['guard', 'Guard', 'More health and armour'], ['haste', 'Haste', 'Shorter cooldowns, faster feet']];
  const fcache = {}, dcache = {};
  const fw = (w, s) => fcache[w * 1000 + s] || (fcache[w * 1000 + s] = `${w} ${s}px ${UIFONT}`);
  const fd = s => dcache[s] || (dcache[s] = `${s}px ${DISP}`);
  const NUM = Array.from({ length: 240 }, (_, i) => String(i));
  const TENTH = Array.from({ length: 31 }, (_, i) => (i / 10).toFixed(1));
  const num = n => n >= 0 && n < 240 ? NUM[n] : String(n);
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const outBack = t => { const k = 1.9; t -= 1; return 1 + (k + 1) * t * t * t + k * t * t; };

  let H = null;

  // ---------- shared drawing ----------
  function blit(spr, x, y, r) { const h = spr.S * r / spr.R; ctx.drawImage(spr.c, x - h / 2, y - h / 2, h, h); }
  function disc(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
  function arcLine(x, y, r, a, b, col, w) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(x, y, r, a, b); ctx.stroke(); }
  function label(s, x, y, col, w = 3) { ctx.lineWidth = w; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); ctx.fillStyle = col; ctx.fillText(s, x, y); }
  function rounded(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function offset(dx, dy) { ctx.setTransform(dpr, 0, 0, dpr, dx * dpr, dy * dpr); }

  // Engraved metal plates, cached by size.
  const plates = new Map();
  function plate(w, h, r = 12) {
    w = Math.ceil(w); h = Math.ceil(h);
    const id = w * 10000 + h; let c = plates.get(id);
    if (c) return c;
    c = Art.cv(w * 2, h * 2); const g = c.getContext('2d'); g.scale(2, 2);
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(26,74,64,.93)'); gr.addColorStop(1, 'rgba(11,38,33,.93)');
    rounded(g, .75, .75, w - 1.5, h - 1.5, r); g.fillStyle = gr; g.fill(); g.strokeStyle = 'rgba(224,181,82,.62)'; g.lineWidth = 1.2; g.stroke();
    rounded(g, 3, 3, w - 6, h - 6, Math.max(2, r - 2.5)); g.strokeStyle = 'rgba(224,181,82,.16)'; g.lineWidth = 1; g.stroke();
    plates.set(id, c); return c;
  }

  let edgeC = null;
  function redEdge() {
    if (edgeC) return edgeC;
    const c = Art.cv(160, 80), g = c.getContext('2d'), gr = g.createRadialGradient(80, 40, 26, 80, 40, 88);
    gr.addColorStop(0, 'rgba(228,67,50,0)'); gr.addColorStop(.62, 'rgba(228,67,50,.12)'); gr.addColorStop(1, 'rgba(228,67,50,.95)');
    g.fillStyle = gr; g.fillRect(0, 0, 160, 80); return edgeC = c;
  }

  // ---------- layout ----------
  function hud() {
    U.compact = VW < 760 || VH < 350;
    stage.classList.toggle('sm', U.compact);
    const bx = VW - 92, by = VH - 80, off = [[-104, 18], [-78, -78], [4, -112]];
    U.atk.x = bx; U.atk.y = by;
    off.forEach((o, i) => { U.ab[i].x = bx + o[0]; U.ab[i].y = by + o[1]; });
    U.cancel.x = VW - 250;
    const M = U.map; M.w = U.compact ? 120 : 156; M.h = Math.round(M.w * Sim.H / Sim.W); M.x = VW - 44 - M.w;
    U.pause.x = M.x - 24;
    U.stripX = VW / 2; U.miniR = U.compact ? 9 : 13; U.miniGap = U.compact ? 20 : 30; U.midHalf = U.compact ? 36 : 44;
    const left = U.stripX - U.midHalf - U.miniGap * 4;
    U.hpW = Math.max(70, Math.min(130, Math.floor(left - 10 - HP_X)));
    if (H) H.mapC = null;
  }

  // ---------- match setup ----------
  function initHud(g) {
    const me = g.me, s = g.s;
    Ctl.reset();
    $('forge').classList.add('hide');
    const byId = new Map(), mini = new Map();
    for (const c of s.champs) { byId.set(c.id, c); mini.set(c.id, Art.champCoin(c.champ, c.team, c.tier, 26)); }
    for (const t of s.towers) byId.set(t.id, t);
    H = {
      t: 0, enter: 0, byId, mini, hope: s.hope, hopeFlash: 0, announced: false,
      portrait: spriteOf(me), goldCoin: Art.coin('hudgold', 18, 'boss', Art.METAL.boss, -1, -1, .5),
      abOn: me.kit.map((_, i) => Art.abilityCoin(me.champ, i, true, 40)), abOff: me.kit.map((_, i) => Art.abilityCoin(me.champ, i, false, 40)),
      rng: me.kit.map(a => a.range ? `Range ${a.range}` : 'Self'),
      hpTrail: me.hp, hpHold: 0, goldShow: me.gold, goldStr: String(Math.floor(me.gold)),
      prev: [0, 0, 0], cdMax: [1, 1, 1], recPrev: [0, 0, 0], recMax: [1, 1, 1], pop: [0, 0, 0], press: [0, 0, 0], deny: [0, 0, 0], flash: [0, 0, 0],
      atkPress: 0, atkMax: 1, atkPrev: 0, cancelIn: 0,
      feed: [], banner: null, queue: [], pings: [], pingAt: {}, towerAt: -99, mapC: null,
      clockSec: -1, clockStr: '0:00', hoardKey: -2, hoardStr: '', frame: 0, forgeKey: -1,
      hint: save.hints < 3 ? { i: 0, t: 0 } : null,
    };
    g.goldBump = 0; g.goldAnchor = { x: GOLD_X, y: GOLD_Y };
    hud();
  }

  // ---------- banners ----------
  function banner(s, o = {}) {
    if (!H) return;
    const b = { s, sub: o.sub || '', pri: o.pri || 1, spr: o.spr || null, col: o.col || BRASS, t: 0, max: o.dur || 2.1, w: 0 };
    if (H.banner && H.banner.s === s) { H.banner.t = Math.min(H.banner.t, .3); return; }
    if (H.banner && b.pri > H.banner.pri) { H.banner = b; return; }
    if (!H.banner) { H.banner = b; return; }
    H.queue.push(b); H.queue.sort((p, q) => q.pri - p.pri);
    if (H.queue.length > 3) H.queue.length = 3;
  }

  function drawBanner(dt) {
    let b = H.banner;
    if (!b) return;
    b.t += dt;
    if (b.t >= b.max) { H.banner = H.queue.shift() || null; b = H.banner; if (!b) return; }
    const big = b.pri >= 2, size = big ? 29 : 21, h = (big ? 46 : 36) + (b.sub ? 16 : 0);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = fd(size);
    if (!b.w) { b.w = ctx.measureText(b.s).width + (b.spr ? 72 : 52); if (b.sub) { ctx.font = fw(600, 14); b.w = Math.max(b.w, ctx.measureText(b.sub).width + 52); ctx.font = fd(size); } }
    const inT = clamp01(b.t / .3), outT = clamp01((b.t - (b.max - .24)) / .24);
    const scale = calm ? 1 : outBack(inT) * (1 - outT * .2), W = b.w, cy = Math.max(136, VH * .34);
    ctx.globalAlpha = calm ? Math.min(inT * 2, 1 - outT) : Math.min(1, inT * 3) * (1 - outT);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, VW / 2 * dpr, cy * dpr);
    const hw = W / 2, hh = h / 2;
    ctx.fillStyle = 'rgba(9,32,28,.94)';
    ctx.beginPath(); ctx.moveTo(-hw - 20, -hh + 6); ctx.lineTo(-hw + 8, -hh + 6); ctx.lineTo(-hw + 8, hh + 6); ctx.lineTo(-hw - 20, hh + 6); ctx.lineTo(-hw - 10, 6); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(hw + 20, -hh + 6); ctx.lineTo(hw - 8, -hh + 6); ctx.lineTo(hw - 8, hh + 6); ctx.lineTo(hw + 20, hh + 6); ctx.lineTo(hw + 10, 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = b.col; ctx.globalAlpha *= .85;
    ctx.beginPath(); ctx.moveTo(-hw - 20, -hh + 6); ctx.lineTo(-hw + 8, -hh + 6); ctx.lineTo(-hw + 8, -hh + 8.5); ctx.lineTo(-hw - 18, -hh + 8.5); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(hw + 20, -hh + 6); ctx.lineTo(hw - 8, -hh + 6); ctx.lineTo(hw - 8, -hh + 8.5); ctx.lineTo(hw + 18, -hh + 8.5); ctx.closePath(); ctx.fill();
    ctx.globalAlpha /= .85;
    rounded(ctx, -hw, -hh, W, h, 5); ctx.fillStyle = '#15463c'; ctx.fill();
    ctx.strokeStyle = b.col; ctx.lineWidth = 1.8; ctx.stroke();
    rounded(ctx, -hw + 3.5, -hh + 3.5, W - 7, h - 7, 3); ctx.strokeStyle = 'rgba(224,181,82,.28)'; ctx.lineWidth = 1; ctx.stroke();
    const tx = b.spr ? 18 : 0, ty = b.sub ? -8 : 1;
    if (b.spr) blit(b.spr, -hw + 28, 0, Math.min(19, hh - 3));
    ctx.font = fd(size); ctx.fillStyle = PARCH; ctx.fillText(b.s, tx, ty);
    if (b.sub) { ctx.font = fw(600, 14); ctx.fillStyle = '#cde4d9'; ctx.fillText(b.sub, tx, ty + 21); }
    ctx.globalAlpha = 1; offset(0, 0);
  }

  // ---------- sim events ----------
  function uiEvent(e) {
    if (!H || !G) return;
    const me = G.me, k = e.e;
    if (k === 'hit') {
      const u = H.byId.get(e.u); if (!u || u.team !== me.team) return;
      const now = G.s.t;
      if (u.kind === 'tower') { if (now - H.towerAt > 25) { H.towerAt = now; banner('Your tower is under attack', { pri: 2, col: '#e4573f', dur: 2 }); } }
      else if (u !== me && now - (H.pingAt[u.id] || -9) > 2.5) { H.pingAt[u.id] = now; if (H.pings.length < 6) H.pings.push({ x: u.x, y: u.y, t: 0 }); }
    } else if (k === 'gold') { if (e.u === me.id) G.goldBump = Math.max(G.goldBump, .55); }
    else if (k === 'feed') {
      const a = H.byId.get(e.a) || null, b = H.byId.get(e.b) || null;
      H.feed.unshift({ aS: a && a.kind === 'champ' ? H.mini.get(a.id) : null, bS: b ? H.mini.get(b.id) : null, t: 5, aT: a ? a.team : -1 });
      if (H.feed.length > 4) H.feed.length = 4;
      const spr = a && a.kind === 'champ' ? H.mini.get(a.id) : null, col = a ? TEAM[a.team] : BRASS;
      if (e.first) banner('First strike', { pri: 6, spr, col, dur: 2.2 });
      else if (e.multi >= 2) banner(e.multi === 2 ? 'Double take' : e.multi === 3 ? 'Triple take' : 'Quadra take', { pri: 4 + Math.min(4, e.multi), spr, col, dur: 2.3 });
    } else if (k === 'level') {
      if (e.u === me.id) { if (me.lvl === 3) banner('Ultimate unlocked', { pri: 3, dur: 2 }); else banner(`Level ${me.lvl}`, { pri: 1, dur: 1.3 }); }
    } else if (k === 'tower') {
      banner(e.team === me.team ? 'Your team lost a tower' : `${Sim.TEAM_NAMES[e.team]} lost a tower`, { pri: 3, col: TEAM[e.team], dur: 2.4 });
    } else if (k === 'bossup') banner('The Colossus is up', { pri: 4, sub: 'It waits at the centre', dur: 2.6 });
    else if (k === 'boss') banner(`${Sim.TEAM_NAMES[e.team]} took the Colossus`, { pri: 5, sub: 'Stronger strikes for 90 seconds', col: TEAM[e.team], dur: 2.8 });
    else if (k === 'forge') { if (e.u === me.id) forgeSync(true); }
    else if (k === 'civ') { H.hopeFlash = 1; if (e.team === G.me.team) banner(e.team === 0 ? 'Rescued' : 'Seized', { pri: 1, col: TEAM[e.team], dur: 1.3 }); }
    else if (k === 'hope') {
      if (e.on) banner(e.team === 0 ? 'The people rally' : 'The city cowers', { pri: 3, sub: `${Sim.TEAM_NAMES[e.team]} hit harder`, col: TEAM[e.team], dur: 2.4 });
      else banner(`${Sim.TEAM_NAMES[e.team]} lost their edge`, { pri: 1, col: TEAM[e.team], dur: 1.6 });
    }
  }

  // ---------- player frame ----------
  function drawFrame(dt, me) {
    const hpw = U.hpW, f = clamp01(me.hp / me.maxHp);
    ctx.drawImage(plate(HP_X - 44 + hpw + 12, 62, 14), 44, 6, HP_X - 44 + hpw + 12, 62);
    blit(H.portrait, 74, 37, 27);
    disc(95, 57, 10); ctx.fillStyle = PARCH; ctx.fill(); ctx.strokeStyle = BRASS; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = fw(700, 13); ctx.fillStyle = '#10302b'; ctx.fillText(num(me.lvl), 95, 57.5);
    if (me.hp < H.hpTrail) { H.hpHold += dt; if (H.hpHold > .32) H.hpTrail = Math.max(me.hp, H.hpTrail - (me.maxHp * .9 + H.hpTrail - me.hp) * dt); } else { H.hpTrail = me.hp; H.hpHold = 0; }
    const x = HP_X, y = 13, h = 14, tr = clamp01(H.hpTrail / me.maxHp);
    ctx.fillStyle = 'rgba(4,16,14,.82)'; ctx.fillRect(x - 1, y - 1, hpw + 2, h + 2);
    if (tr > f) { ctx.fillStyle = '#fffaf0'; ctx.fillRect(x + hpw * f, y, hpw * (tr - f), h); }
    ctx.fillStyle = f < .3 ? '#e4573f' : '#7fcf6e'; ctx.fillRect(x, y, hpw * f, h);
    ctx.fillStyle = 'rgba(255,255,255,.26)'; ctx.fillRect(x, y, hpw * f, 4);
    const step = me.maxHp > 1500 ? 250 : 100, seg = hpw * step / me.maxHp;
    ctx.fillStyle = 'rgba(6,24,20,.6)';
    for (let tx = x + seg; tx < x + hpw - .5; tx += seg) ctx.fillRect(tx, y, 1, h);
    ctx.font = fw(700, 12.5); ctx.textAlign = 'center';
    label(num(Math.ceil(me.hp)), x + hpw / 2, y + h / 2 + .5, '#fff6e2', 2.5);
    const need = Sim.xpNeed(me.lvl), xf = me.lvl >= 10 ? 1 : clamp01(me.xp / need);
    ctx.fillStyle = 'rgba(4,16,14,.82)'; ctx.fillRect(x - 1, 31, hpw + 2, 7);
    ctx.fillStyle = BRASS; ctx.fillRect(x, 32, hpw * xf, 5);
    // gold rolls toward the real value
    G.goldBump = Math.max(0, (G.goldBump || 0) - dt * 4.5);
    const diff = me.gold - H.goldShow;
    H.goldShow = Math.abs(diff) < 1 ? me.gold : H.goldShow + diff * Math.min(1, dt * 9);
    const shown = Math.floor(H.goldShow); if (shown !== H.gv) { H.gv = shown; H.goldStr = String(shown); }
    const bump = 1 + (calm ? 0 : G.goldBump) * .28;
    G.goldAnchor.x = GOLD_X; G.goldAnchor.y = GOLD_Y;
    blit(H.goldCoin, GOLD_X, GOLD_Y, 8.5 * bump);
    ctx.font = fw(700, Math.round(19 * bump * 2) / 2); ctx.textAlign = 'left';
    label(H.goldStr, GOLD_X + 13, GOLD_Y + .5, '#ffd777', 3);
    // Upgrade coin
    let afford = 0;
    if (me.alive) for (let i = 0; i < 3; i++) { const n = me.up[TRACKS[i][0]]; if (n < 3 && me.gold >= Sim.FORGE_COST[n]) afford++; }
    smallCoin(U.forge, afford > 0, 'Upgrade', drawHammer);
    if (afford > 0) {
      const p = (Math.sin(H.t * 5) + 1) / 2;
      if (!calm) { arcLine(U.forge.x, U.forge.y, U.forge.r + 3 + p * 4, 0, TAU, `rgba(255,226,140,${.75 - p * .55})`, 2); }
      disc(U.forge.x + 15, U.forge.y - 15, 8.5); ctx.fillStyle = '#e4573f'; ctx.fill();
      ctx.font = fw(700, 12); ctx.textAlign = 'center'; ctx.fillStyle = '#fff6e2'; ctx.fillText(num(afford), U.forge.x + 15, U.forge.y - 14.5);
    }
    const chan = me.chan && me.chan.recall ? me.chan : null;
    smallCoin(U.recall, false, 'Recall', drawGate);
    if (chan) arcLine(U.recall.x, U.recall.y, U.recall.r + 2, -HPI, -HPI + TAU * (1 - chan.t / chan.total), TEAM[me.team], 4);
  }

  function smallCoin(B, hot, name, icon) {
    disc(B.x, B.y + 2, B.r); ctx.fillStyle = 'rgba(4,16,14,.5)'; ctx.fill();
    disc(B.x, B.y, B.r); ctx.fillStyle = hot ? '#e0b552' : '#1a4a41'; ctx.fill();
    ctx.strokeStyle = hot ? '#fff0bd' : 'rgba(224,181,82,.75)'; ctx.lineWidth = 2; ctx.stroke();
    disc(B.x, B.y, B.r - 3.5); ctx.strokeStyle = hot ? 'rgba(90,58,10,.5)' : 'rgba(224,181,82,.22)'; ctx.lineWidth = 1; ctx.stroke();
    icon(B.x, B.y, hot ? '#2a1c06' : PARCH);
    ctx.font = fw(600, 11.5); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    label(name, B.x, B.y + B.r + 7.5, PARCH, 2.5);
  }
  function drawHammer(x, y, col) {
    ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(x - 6, y + 8); ctx.lineTo(x + 3, y - 2); ctx.stroke();
    ctx.save(); ctx.translate(x + 4, y - 4); ctx.rotate(-Math.PI / 4); ctx.fillRect(-8, -3.6, 16, 7.2); ctx.restore();
  }
  function drawGate(x, y, col) {
    ctx.strokeStyle = col; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - 7, y + 8); ctx.lineTo(x - 7, y - 1); ctx.arc(x, y - 1, 7, Math.PI, 0); ctx.lineTo(x + 7, y + 8); ctx.moveTo(x - 10, y + 8); ctx.lineTo(x + 10, y + 8); ctx.stroke();
    disc(x, y + 1, 2.4); ctx.fillStyle = col; ctx.fill();
  }

  // ---------- top strip ----------
  function drawStrip(s, me) {
    const cx = U.stripX, r = U.miniR, gap = U.miniGap, mid = U.midHalf, half = mid + gap * 4 + 4;
    ctx.drawImage(plate(half * 2, 40, 13), cx - half, 4, half * 2, 40);
    ctx.textBaseline = 'middle';
    ctx.font = fw(700, U.compact ? 18 : 22);
    ctx.textAlign = 'right'; ctx.fillStyle = '#9fd0f6'; ctx.fillText(num(s.kills[0]), cx - mid + (U.compact ? 11 : 15), 20);
    ctx.textAlign = 'left'; ctx.fillStyle = '#f7a08e'; ctx.fillText(num(s.kills[1]), cx + mid - (U.compact ? 11 : 15), 20);
    const sec = Math.floor(s.t);
    if (sec !== H.clockSec) { H.clockSec = sec; H.clockStr = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }
    ctx.textAlign = 'center'; ctx.font = fw(600, U.compact ? 14 : 16); ctx.fillStyle = PARCH; ctx.fillText(H.clockStr, cx, 20);
    const left = s.bossUp ? -1 : Math.max(0, Math.ceil(s.bossAt - s.t));
    if (left !== H.hoardKey) { H.hoardKey = left; H.hoardStr = left < 0 ? 'Colossus up' : `Colossus ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; }
    ctx.font = fw(600, 12.5); label(H.hoardStr, cx, 36, s.bossUp ? '#ffd777' : '#bcd8cc', 2.5);
    for (const c of s.champs) {
      const dir = c.team ? 1 : -1, x = cx + dir * (mid + gap * (c.slot + .5)), y = 21, spr = H.mini.get(c.id);
      ctx.globalAlpha = c.alive ? 1 : .34; blit(spr, x, y, r); ctx.globalAlpha = 1;
      if (c === me) { disc(x, y, r + 1.5); ctx.strokeStyle = '#fff4cf'; ctx.lineWidth = 1.6; ctx.stroke(); }
      if (!c.alive) { ctx.font = fw(700, U.compact ? 12 : 14); ctx.textAlign = 'center'; label(num(Math.ceil(c.respawn)), x, y + .5, '#fff6e2', 2.5); }
      else if (c.role && !U.compact) {
        const n = Sim.ROLE_INFO[c.role].name[0];
        disc(x + r * .72, y + r * .72, 5.5); ctx.fillStyle = 'rgba(8,28,25,.92)'; ctx.fill();
        ctx.font = fw(700, 9); ctx.textAlign = 'center'; ctx.fillStyle = PARCH; ctx.fillText(n, x + r * .72, y + r * .72 + .5);
      }
    }
    const P = U.pause;
    disc(P.x, P.y, P.r); ctx.fillStyle = 'rgba(16,48,43,.9)'; ctx.fill(); ctx.strokeStyle = 'rgba(224,181,82,.75)'; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.fillStyle = PARCH; ctx.fillRect(P.x - 5, P.y - 6.5, 3.6, 13); ctx.fillRect(P.x + 1.4, P.y - 6.5, 3.6, 13);
  }

  // ---------- the people ----------
  function drawPeople(dt, s) {
    const cx = U.stripX, bw = U.compact ? 130 : 190, x = cx - bw / 2, y = 49, h = 12, low = s.hope <= 30, high = s.hope >= 70;
    H.hope += (s.hope - H.hope) * Math.min(1, dt * 5);
    H.hopeFlash = Math.max(0, H.hopeFlash - dt * 2.5);
    const f = clamp01(H.hope / 100), glow = calm ? .9 : .7 + Math.sin(H.t * 6) * .25;
    ctx.drawImage(plate(bw + 16, 20, 10), x - 8, y - 4, bw + 16, 20);
    ctx.fillStyle = 'rgba(4,16,14,.82)'; ctx.fillRect(x, y, bw, h);
    ctx.globalAlpha = low ? glow : .3; ctx.fillStyle = TEAM[1]; ctx.fillRect(x, y, bw * .3, h);
    ctx.globalAlpha = high ? glow : .3; ctx.fillStyle = TEAM[0]; ctx.fillRect(x + bw * .7, y, bw * .3, h);
    ctx.globalAlpha = 1; ctx.fillStyle = BRASS; ctx.fillRect(x, y + 4, bw * f, h - 8);
    ctx.fillStyle = PARCH; ctx.fillRect(x + bw * .3 - .75, y, 1.5, h); ctx.fillRect(x + bw * .7 - .75, y, 1.5, h);
    ctx.font = fw(700, 11.5); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    blit(H.goldCoin, x + bw * f, y + h / 2, 7 * (1 + (calm ? 0 : H.hopeFlash) * .45));
    label('The people', cx, y + h / 2 + .5, PARCH, 2.5);
  }

  // ---------- minimap ----------
  function bakeMap(s) {
    const M = U.map, c = Art.cv(M.w * 2, M.h * 2), g = c.getContext('2d'), kx = M.w * 2 / Sim.W, ky = M.h * 2 / Sim.H;
    g.fillStyle = '#17463d'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(8,28,25,.75)'; for (const w of s.map.walls) if (w.big) g.fillRect(w.x * kx, w.y * ky, w.w * kx, w.h * ky);
    g.fillStyle = 'rgba(111,183,162,.5)'; for (const w of s.map.walls) if (!w.big) g.fillRect(w.x * kx, w.y * ky, w.w * kx, w.h * ky);
    g.strokeStyle = 'rgba(241,232,208,.42)'; g.lineWidth = 5; g.lineJoin = 'round';
    for (const L of s.map.lanes) { g.beginPath(); L.forEach(([x, y], i) => g[i ? 'lineTo' : 'moveTo'](x * kx, y * ky)); g.stroke(); }
    return c;
  }
  function drawMap(dt, s, me) {
    const M = U.map, kx = M.w / Sim.W, ky = M.h / Sim.H;
    if (!H.mapC) H.mapC = bakeMap(s);
    ctx.drawImage(plate(M.w + 8, M.h + 8, 9), M.x - 4, M.y - 4, M.w + 8, M.h + 8);
    ctx.drawImage(H.mapC, M.x, M.y, M.w, M.h);
    ctx.save(); ctx.beginPath(); ctx.rect(M.x, M.y, M.w, M.h); ctx.clip();
    for (const t of s.towers) if (t.alive) { ctx.fillStyle = TEAM[t.team]; const r = t.sub === 'core' ? 3.8 : 2.5; ctx.fillRect(M.x + t.x * kx - r, M.y + t.y * ky - r, 2 * r, 2 * r); }
    ctx.fillStyle = PARCH; for (const c of s.sites) if (c.alive) { disc(M.x + c.x * kx, M.y + c.y * ky, 1.8); ctx.fill(); }
    if (s.bossUp) { disc(M.x + 1600 * kx, M.y + 950 * ky, 4); ctx.fillStyle = '#ffd777'; ctx.fill(); }
    const vw = VW / Z * kx, vh = VH / (Z * TILT) * ky;
    ctx.strokeStyle = 'rgba(241,232,208,.72)'; ctx.lineWidth = 1; ctx.strokeRect(M.x + G.cam.x * kx - vw / 2, M.y + G.cam.y * ky - vh / 2, vw, vh);
    for (let i = H.pings.length - 1; i >= 0; i--) {
      const p = H.pings[i]; p.t += dt;
      if (p.t >= 1) { H.pings[i] = H.pings[H.pings.length - 1]; H.pings.pop(); continue; }
      disc(M.x + p.x * kx, M.y + p.y * ky, 3 + p.t * 12); ctx.strokeStyle = `rgba(255,120,96,${1 - p.t})`; ctx.lineWidth = 1.6; ctx.stroke();
    }
    for (const c of s.champs) {
      if (!c.alive || !Sim.canSee(s, me.team, c)) continue;
      const mine = c === me, X = M.x + c.x * kx, Y = M.y + c.y * ky;
      disc(X, Y, mine ? 4.6 : 3.4); ctx.fillStyle = mine ? '#fff4cf' : TEAM[c.team]; ctx.fill(); ctx.strokeStyle = 'rgba(4,16,14,.8)'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- right cluster ----------
  function drawAttack(dt, me) {
    const A = U.atk, held = Ctl.atk !== null;
    H.atkPress += ((held ? 1 : 0) - H.atkPress) * Math.min(1, dt * 24);
    const r = A.r * (1 - H.atkPress * .08);
    disc(A.x, A.y + 4, A.r); ctx.fillStyle = 'rgba(4,16,14,.42)'; ctx.fill();
    blit(H.portrait, A.x, A.y + H.atkPress * 2, r);
    if (held) arcLine(A.x, A.y, A.r + 3, 0, TAU, '#fff4cf', 3);
    if (me.atkCd > H.atkPrev + .001) H.atkMax = me.atkCd;
    H.atkPrev = Math.max(0, me.atkCd);
    if (me.atkCd > 0) arcLine(A.x, A.y, A.r + 3, -HPI, -HPI + TAU * clamp01(1 - me.atkCd / H.atkMax), 'rgba(255,226,140,.8)', 2.2);
  }

  function drawAbility(i, dt, me) {
    const a = me.kit[i], B = U.ab[i], locked = i === 2 && me.lvl < 3, cd = Math.max(0, me.cd[i]), rec = Math.max(0, me.recast[i]);
    const recast = rec > 0 && !!a.recast, onCd = cd > 0 && !recast, charge = me.charge && me.charge.slot === i ? me.charge : null;
    const held = Ctl.aim !== null && Ctl.aim.slot === i, winding = !!a.windup && !!me.chan && me.chan.slot === i;
    if (cd > H.prev[i] + .001) H.cdMax[i] = cd;
    if (cd <= 0 && H.prev[i] > 0 && !locked) { H.pop[i] = 1; Sound.play('ready'); }
    H.prev[i] = cd;
    if (rec > H.recPrev[i] + .001) H.recMax[i] = rec;
    H.recPrev[i] = rec;
    H.press[i] += ((held ? 1 : 0) - H.press[i]) * Math.min(1, dt * 26);
    H.pop[i] = Math.max(0, H.pop[i] - dt * 2.4); H.deny[i] = Math.max(0, H.deny[i] - dt * 5); H.flash[i] = Math.max(0, H.flash[i] - dt * 4);
    const pop = H.pop[i], shake = calm ? 0 : Math.sin(H.deny[i] * 22) * 3.2 * H.deny[i];
    const scale = 1 - Math.max(H.press[i], H.flash[i]) * .1 + (calm ? 0 : Math.sin(pop * Math.PI) * .13);
    const x = B.x + shake, y = B.y + H.press[i] * 1.5, r = B.r * scale, size = (r * 86) / 40, half = size / 2;
    disc(B.x, B.y + 3, B.r); ctx.fillStyle = 'rgba(4,16,14,.42)'; ctx.fill();
    if (recast && !calm) { const g = .5 + Math.sin(H.t * 7) * .22; ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = g; ctx.drawImage(Art.glow('#ffe69a'), x - r * 1.7, y - r * 1.7, r * 3.4, r * 3.4); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
    if (onCd || locked) {
      ctx.drawImage(H.abOff[i], x - half, y - half, size, size);
      if (onCd) {
        const f = clamp01(cd / H.cdMax[i]), hand = -HPI + TAU * (1 - f);
        ctx.save(); ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r + 4, -HPI, hand); ctx.closePath(); ctx.clip();
        ctx.drawImage(H.abOn[i], x - half, y - half, size, size); ctx.restore();
        ctx.strokeStyle = '#fff3c4'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(hand) * (r - 1), y + Math.sin(hand) * (r - 1)); ctx.stroke();
        disc(x, y, r * .5); ctx.fillStyle = 'rgba(6,22,19,.52)'; ctx.fill();
        ctx.font = fw(700, 18); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        label(cd > 3 ? num(Math.ceil(cd)) : TENTH[Math.min(30, Math.ceil(cd * 10))], x, y + .5, '#fff', 3);
      }
    } else ctx.drawImage(H.abOn[i], x - half, y - half, size, size);
    if (recast) { arcLine(x, y, r + 3, 0, TAU, 'rgba(255,230,154,.35)', 3.5); arcLine(x, y, r + 3, -HPI, -HPI + TAU * clamp01(rec / H.recMax[i]), '#ffe69a', 3.5); }
    if (pop > 0) { const R = B.r + (1 - pop) * 20; arcLine(B.x, B.y, R, 0, TAU, `rgba(255,236,170,${pop})`, 2 + pop * 3); }
    if (held) arcLine(x, y, r + 4, 0, TAU, Ctl.aim.cancelHot ? '#ff8b78' : '#fff4cf', 3);
    if (charge) { const f = Math.min(1, charge.t / (a.charge || 1.1)); arcLine(x, y, r + 9, -HPI, -HPI + TAU * f, f >= 1 ? '#ffe06a' : '#b8a9ff', 5); }
    if (winding) { const w = (Math.sin(H.t * 12) + 1) / 2; arcLine(x, y, r + 5, 0, TAU, `rgba(228,87,63,${.55 + w * .45})`, 3.5); ctx.font = fw(700, 13); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; label('Tap to cancel', B.x, B.y - B.r - 15, '#ff9f8d', 3); }
    if (locked) { rounded(ctx, B.x - 17, B.y + B.r - 12, 34, 17, 8.5); ctx.fillStyle = '#10302b'; ctx.fill(); ctx.strokeStyle = BRASS; ctx.lineWidth = 1.4; ctx.stroke(); ctx.font = fw(700, 12); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = PARCH; ctx.fillText('Lv 3', B.x, B.y + B.r - 3); }
  }

  function drawCancel(dt) {
    const A = Ctl.aim;
    H.cancelIn += ((A ? 1 : 0) - H.cancelIn) * Math.min(1, dt * 18);
    if (H.cancelIn < .02) return;
    const C = U.cancel, hot = A && A.cancelHot && !A.backHot, r = C.r * H.cancelIn * (hot ? 1.14 : 1);
    ctx.globalAlpha = Math.min(1, H.cancelIn * 1.5);
    disc(C.x, C.y + 3, r); ctx.fillStyle = 'rgba(4,16,14,.5)'; ctx.fill();
    disc(C.x, C.y, r); ctx.fillStyle = hot ? '#e4573f' : '#35211b'; ctx.fill();
    ctx.strokeStyle = hot ? '#ffd2c6' : '#c56a52'; ctx.lineWidth = 3; ctx.stroke();
    disc(C.x, C.y, r - 5); ctx.strokeStyle = 'rgba(255,190,170,.32)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = fw(700, 15); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff1ea'; ctx.fillText('Cancel', C.x, C.y + .5);
    ctx.globalAlpha = 1;
  }

  function drawAimCard(me) {
    const A = Ctl.aim; if (!A) return;
    const a = me.kit[A.slot], rng = H.rng[A.slot];
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.font = fd(19); const nw = ctx.measureText(a.name).width;
    ctx.font = fw(600, 13.5); const rw = ctx.measureText(rng).width, dw = ctx.measureText(a.d).width;
    const w = Math.ceil(Math.max(nw + rw + 22, dw) + 26) & ~7, h = 44, x = VW / 2 - w / 2, y = 68;
    ctx.drawImage(plate(w, h, 9), x, y, w, h);
    ctx.font = fd(19); ctx.fillStyle = PARCH; ctx.fillText(a.name, x + 13, y + 15);
    ctx.font = fw(600, 13.5); ctx.textAlign = 'right'; ctx.fillStyle = BRASS; ctx.fillText(rng, x + w - 13, y + 15);
    ctx.textAlign = 'left'; ctx.fillStyle = '#cde4d9'; ctx.fillText(a.d, x + 13, y + 32);
    if (A.backHot) { const B = U.ab[A.slot]; ctx.font = fw(700, 13.5); ctx.textAlign = 'center'; label('Release to cancel', B.x, B.y - B.r - 15, '#ff9f8d', 3); }
  }

  function drawStick(s) {
    const st = Ctl.stick;
    if (st) {
      disc(st.sx, st.sy, 58); ctx.strokeStyle = 'rgba(241,232,208,.5)'; ctx.lineWidth = 2.5; ctx.stroke();
      const dx = st.x - st.sx, dy = st.y - st.sy, l = Math.min(58, Math.hypot(dx, dy)), an = Math.atan2(dy, dx), nx = st.sx + Math.cos(an) * l, ny = st.sy + Math.sin(an) * l;
      disc(nx, ny, 25); ctx.fillStyle = 'rgba(224,181,82,.52)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,240,190,.75)'; ctx.lineWidth = 1.5; ctx.stroke();
    } else if (s.t < 30) { disc(122, VH - 86, 56); ctx.strokeStyle = 'rgba(241,232,208,.2)'; ctx.lineWidth = 2; ctx.stroke(); }
  }

  function drawFeed(dt) {
    let y = 136;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < H.feed.length; i++) {
      const f = H.feed[i]; f.t -= dt;
      if (f.t <= 0) { H.feed.splice(i--, 1); continue; }
      ctx.globalAlpha = Math.min(1, f.t * 2);
      ctx.drawImage(plate(90, 26, 13), 44, y - 13, 90, 26);
      if (f.aS) blit(f.aS, 60, y, 10); else { disc(60, y, 7); ctx.fillStyle = '#d9c9a0'; ctx.fill(); }
      ctx.font = fw(600, 12.5); ctx.fillStyle = PARCH; ctx.fillText('took', 89, y + .5);
      if (f.bS) blit(f.bS, 118, y, 10);
      y += 28;
    }
    ctx.globalAlpha = 1;
  }

  const HINTS = ['Left thumb moves', 'Hold the big coin to attack', 'Drag an ability to aim, or tap to fire'];
  function drawHint(dt, me) {
    const h = H.hint; if (!h || !me.alive || Ctl.aim) return;
    h.t += dt;
    if ((h.i === 0 && Ctl.stick && h.t > .8) || (h.i === 1 && Ctl.atk !== null && h.t > .5) || (h.i === 2 && (me.stats.casts > 0 || h.t > 9)) || h.t > 10) { h.i++; h.t = 0; }
    if (h.i >= HINTS.length) { H.hint = null; return; }
    const s = HINTS[h.i]; ctx.font = fw(600, 16); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = Math.ceil(ctx.measureText(s).width + 32) & ~7, y = VH - 42;
    ctx.globalAlpha = Math.min(1, h.t * 4);
    ctx.drawImage(plate(w, 30, 15), VW / 2 - w / 2, y, w, 30);
    ctx.fillStyle = PARCH; ctx.fillText(s, VW / 2, y + 15.5); ctx.globalAlpha = 1;
  }

  function drawDeath(me) {
    ctx.fillStyle = 'rgba(8,24,22,.42)'; ctx.fillRect(0, 0, VW, VH);
    const cx = VW / 2, cy = VH / 2 - 34, R = 40, ang = calm ? 0 : H.t * 1.25, c = Math.cos(ang), ab = Math.abs(c);
    ctx.fillStyle = '#7d5a26'; ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(R * ab, 3) + (1 - ab) * 5, R, 0, 0, TAU); ctx.fill();
    if (ab > .05) { const h = H.portrait.S * R / H.portrait.R; ctx.drawImage(H.portrait.c, cx - h * ab / 2, cy - h / 2, h * ab, h); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = fd(38);
    label(`Back in ${Math.ceil(me.respawn)}`, cx, cy + R + 28, PARCH, 4);
  }

  // ---------- frame ----------
  function hudDraw(dt) {
    if (!H || !G) return;
    const me = G.me, s = G.s, want = G.intro > 0 || G.outro || G.ended ? 0 : 1;
    H.t += dt;
    H.enter = clamp01(H.enter + (want ? dt * 3.2 : -dt * 4));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.textBaseline = 'middle';
    if (H.enter <= 0) return;
    if (want && !H.announced) { H.announced = true; banner(me.team ? 'Terrorize the city' : 'Save the people', { pri: 3, sub: me.team ? 'You are a villain' : 'You are a hero', col: TEAM[me.team], dur: 2.6 }); }
    const e = calm ? 1 : H.enter * H.enter * (3 - 2 * H.enter), away = 1 - e;
    if (me.hp / me.maxHp < .3 && me.alive) {
      const p = calm ? .5 : (Math.sin(H.t * 7) + 1) / 2;
      ctx.globalAlpha = (.34 + p * .42) * e; ctx.drawImage(redEdge(), 0, 0, VW, VH); ctx.globalAlpha = 1;
    }
    drawStick(s);
    offset(-300 * away, 0); drawFrame(dt, me); drawFeed(dt);
    offset(0, -90 * away); drawStrip(s, me); drawPeople(dt, s);
    offset(300 * away, 0); drawMap(dt, s, me); drawCancel(dt);
    offset(320 * away, 0); drawAttack(dt, me); for (let i = 0; i < 3; i++) drawAbility(i, dt, me);
    offset(0, 0);
    if (!me.alive) drawDeath(me);
    drawAimCard(me); drawHint(dt, me); drawBanner(dt);
    if (forgeOpen() && (H.frame++ % 10 === 0)) forgeSync(false);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ---------- upgrade panel ----------
  const forgeOpen = () => !$('forge').classList.contains('hide');
  function forgeBuild() {
    const f = $('forge'), me = G.me; f.textContent = '';
    for (const [k, name, desc] of TRACKS) {
      const b = document.createElement('button'); b.dataset.k = k;
      b.innerHTML = `<b>${name}</b><span class="pips"><i></i><i></i><i></i></span><small>${desc}</small><span class="c"><i class="gc"></i><span></span></span>`;
      b.onclick = () => { if (!G || G.me.gold < Sim.FORGE_COST[G.me.up[k]]) return; G.me.q.push({ t: 'forge', track: k }); Sound.play('tap'); };
      f.append(b);
    }
    H.forgeKey = -1; forgeSync(true);
  }
  function forgeSync(force) {
    if (!H || !G || !forgeOpen()) return;
    const me = G.me, btns = $('forge').children;
    let key = me.alive ? 1 : 0;
    TRACKS.forEach(([k], i) => { const n = me.up[k]; key = key * 8 + n * 2 + (n < 3 && me.gold >= Sim.FORGE_COST[n] ? 1 : 0); });
    if (!force && key === H.forgeKey) return;
    H.forgeKey = key;
    TRACKS.forEach(([k], i) => {
      const b = btns[i], n = me.up[k], cost = Sim.FORGE_COST[n], pips = b.querySelectorAll('.pips i'), c = b.querySelector('.c'), full = n >= 3;
      pips.forEach((p, j) => p.classList.toggle('on', j < n));
      c.querySelector('.gc').classList.toggle('hide', full);
      c.querySelector('span').textContent = full ? 'Full' : cost;
      b.disabled = full || !me.alive || me.gold < cost;
      b.setAttribute('aria-label', `${TRACKS[i][1]}, ${n} of 3, ${full ? 'full' : `costs ${cost}`}`);
    });
  }
  Hud.toggleForge = () => {
    const f = $('forge'); f.classList.toggle('hide');
    if (!f.classList.contains('hide')) forgeBuild();
    Sound.play('tap');
  };

  // ---------- small helpers for the controls ----------
  Hud.deny = i => { if (H) H.deny[i] = 1; };
  Hud.flash = i => { if (H) H.flash[i] = 1; };
  Hud.toast = s => banner(s, { pri: 2, dur: 1.4 });

  // ---------- scoreboard, shared with the end screen ----------
  Hud.coinTo = (cv, spr, sx = 1) => {
    const g = cv.getContext('2d'), k = cv.width / spr.S;
    g.clearRect(0, 0, cv.width, cv.height); g.save(); g.translate(cv.width / 2, cv.height / 2); g.scale(sx, 1);
    g.drawImage(spr.c, -spr.S * k / 2, -spr.S * k / 2, spr.S * k, spr.S * k); g.restore();
  };
  Hud.scoreTable = (host, s, me) => {
    host.textContent = '';
    const t = document.createElement('table'); t.className = 'score';
    t.innerHTML = '<thead><tr><th></th><th>Name</th><th>Role</th><th class="n">K/D/A</th><th class="n">Gold</th></tr></thead>';
    [0, 1].forEach(team => {
      const body = document.createElement('tbody'); body.className = 't' + team;
      for (const c of s.champs) {
        if (c.team !== team) continue;
        const tr = document.createElement('tr'); if (c === me) tr.className = 'me';
        const st = c.stats, role = c.role ? Sim.ROLE_INFO[c.role].name : '';
        tr.innerHTML = `<td><canvas width="48" height="48"></canvas></td><td>${Sim.charOf(c.team, c.champ).name}<small>${c.pname}</small></td><td>${role}</td><td class="n">${st.kills}/${st.deaths}/${st.assists}</td><td class="n">${Math.floor(c.gold)}</td>`;
        Hud.coinTo(tr.querySelector('canvas'), Art.champCoin(c.champ, c.team, c.tier, 26));
        body.append(tr);
      }
      t.append(body);
    });
    host.append(t);
  };

  Hud.openPause = () => {
    if (!G) return;
    if (Ctl.aim) G.me.q.push({ t: 'cancel' });
    Ctl.reset(); G.me.atk = false; G.me.mv.x = G.me.mv.y = 0;
    paused = true;
    Hud.scoreTable($('pBoard'), G.s, G.me);
    if (Hud.syncToggles) Hud.syncToggles();
    $('pause').classList.remove('hide');
    Sound.play('tap');
  };

  return { hud, initHud, hudDraw, uiEvent };
})();
