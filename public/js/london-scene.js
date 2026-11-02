/* ==========================================================================
   london-scene.js — procedural London "hyperlapse" renderer (canvas 2D).

   One deterministic, seamlessly looping scene (12 s) drawn in a 1920×1080
   virtual frame: the Thames at dusk with Westminster, the London Eye, the City
   skyline, the Shard, Canary Wharf and Tower Bridge — fast clouds, traffic
   light-trails, river boats, flickering windows and a slowly drifting camera.
   A second scene draws an exhibition-hall interior ("show floor").

   Used by:
     • scripts/render-media.js  → public/video/london-hyperlapse.mp4, poster,
                                  and the still images behind the cards
     • public/js/main.js        → live fallback behind the hero until the
                                  video is playing (or if it cannot load)

   API: LondonScene.draw(ctx, width, height, timeSeconds, {
          scene: 'skyline' | 'hall', camera: 'wide' | 'bridge' | 'westminster'
          | 'eye' | 'city' | 'shard' | 'canary', palette: 'orange' | 'ember'
          | 'night' | 'blue' | 'midnight' | 'ice' | 'mono', seed: number, grain: boolean })
   ========================================================================== */
(function (root) {
  'use strict';

  const W = 1920;
  const H = 1080;
  const T = 12;              // loop length in seconds
  const TAU = Math.PI * 2;
  const WATER = 790;         // waterline (virtual px)

  const PALETTES = {
    orange: { skyTop: '#070508', skyMid: '#38100a', skyLow: '#b93112', horizon: '#ff6a2b', glow: '#ffb45e', sun: '#ffe7bd', sil: '#0a0708', silFar: '#1f0a08', water: '#1a0604', waterDeep: '#050203', light: '#ffcf96', hot: '#fff3df', trailA: '#fff0d8', trailB: '#ff6a2b', cloud: '#200906', cloudRim: '#ff7f45' },
    ember:  { skyTop: '#040305', skyMid: '#1f0806', skyLow: '#7a200c', horizon: '#d8491c', glow: '#ff9a4c', sun: '#ffd9a4', sil: '#070506', silFar: '#170806', water: '#120403', waterDeep: '#030102', light: '#ffc488', hot: '#ffead0', trailA: '#ffe9cf', trailB: '#ff5f24', cloud: '#180605', cloudRim: '#e86a35' },
    night:  { skyTop: '#040407', skyMid: '#120a0e', skyLow: '#36130d', horizon: '#8a2e13', glow: '#cf5a26', sun: '#ffc27a', sil: '#060507', silFar: '#140909', water: '#0d0404', waterDeep: '#030102', light: '#ffc98f', hot: '#fff1dc', trailA: '#ffeedb', trailB: '#ff6a2b', cloud: '#140606', cloudRim: '#b84f26' },
    blue:     { skyTop: '#04060f', skyMid: '#071a4a', skyLow: '#0d3fd1', horizon: '#2b63ff', glow: '#9dbcff', sun: '#f2f6ff', sil: '#05070d', silFar: '#0b1430', water: '#061033', waterDeep: '#02040c', light: '#dfe9ff', hot: '#ffffff', trailA: '#ffffff', trailB: '#7fa5ff', cloud: '#0a1230', cloudRim: '#4d7dff' },
    midnight: { skyTop: '#03040a', skyMid: '#050d2a', skyLow: '#092a8a', horizon: '#1a47ff', glow: '#6f97ff', sun: '#eef3ff', sil: '#04060c', silFar: '#0a1128', water: '#040a24', waterDeep: '#02030a', light: '#d6e2ff', hot: '#ffffff', trailA: '#ffffff', trailB: '#5d86ff', cloud: '#070d26', cloudRim: '#3b6bff' },
    ice:      { day: true, skyTop: '#c9d8ff', skyMid: '#9fb8ff', skyLow: '#5f8cff', horizon: '#2b63ff', glow: '#e8efff', sun: '#ffffff', sil: '#0b1538', silFar: '#2a4092', water: '#1c3a9c', waterDeep: '#0b1f66', light: '#ffffff', hot: '#ffffff', trailA: '#ffffff', trailB: '#bcd0ff', cloud: '#7f9fe8', cloudRim: '#ffffff' },
    mono:   { skyTop: '#050505', skyMid: '#161616', skyLow: '#444444', horizon: '#8a8a8a', glow: '#cfcfcf', sun: '#f4f4f4', sil: '#070707', silFar: '#1b1b1b', water: '#111111', waterDeep: '#030303', light: '#e8e8e8', hot: '#ffffff', trailA: '#ffffff', trailB: '#bdbdbd', cloud: '#161616', cloudRim: '#9a9a9a' },
  };

  const CAMERAS = {
    wide:        { cx: 960,  cy: 600, zoom: 1.08 },
    bridge:      { cx: 1390, cy: 560, zoom: 1.75 },
    westminster: { cx: 560,  cy: 600, zoom: 1.7 },
    eye:         { cx: 790,  cy: 600, zoom: 1.9 },
    city:        { cx: 1280, cy: 560, zoom: 1.6 },
    shard:       { cx: 1500, cy: 540, zoom: 1.9 },
    canary:      { cx: 1720, cy: 640, zoom: 2.1 },
    hall:        { cx: 960,  cy: 540, zoom: 1.06 },
  };

  /* ---------- small helpers ---------- */
  const hexToRgb = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return hex.length === 4
      ? [((n >> 8) & 15) * 17, ((n >> 4) & 15) * 17, (n & 15) * 17]
      : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const rgba = (hex, a) => { const c = hexToRgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(i, j) {
    let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const poly = (ctx, pts) => {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath(); ctx.fill();
  };
  const circle = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };

  // Grid of lit windows. 20% of them flicker, the rest glow steadily.
  function windows(ctx, P, x, y, w, h, cw, ch, pad, seed, prob, t, dim) {
    const cols = Math.max(1, Math.floor((w - pad) / (cw + pad)));
    const rows = Math.max(1, Math.floor((h - pad) / (ch + pad)));
    const ox = x + (w - cols * (cw + pad) + pad) / 2;
    const oy = y + pad;
    const frame = Math.floor(t * 2);
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const k = seed * 7919 + i * 131 + j * 7;
        if (hash(k, 0) > prob) continue;
        const fl = hash(k, 2) < 0.2 ? 0.45 + 0.55 * hash(k, frame) : 0.9;
        ctx.fillStyle = rgba(hash(k, 1) > 0.8 ? P.hot : P.light, fl * (dim || 1));
        ctx.fillRect(ox + i * (cw + pad), oy + j * (ch + pad), cw, ch);
      }
    }
  }

  /* ---------- cached, seeded scene furniture ---------- */
  const cache = {};
  function fillers() {
    if (cache.fillers) return cache.fillers;
    const r = mulberry32(7); const arr = []; let x = -260;
    while (x < W + 260) {
      const w = 30 + r() * 90, h = 40 + r() * 150;
      arr.push({ x, w, h, seed: Math.floor(r() * 1e6) });
      x += w + r() * 24;
    }
    return (cache.fillers = arr);
  }
  function stars() {
    if (cache.stars) return cache.stars;
    const r = mulberry32(3); const arr = [];
    for (let i = 0; i < 150; i++) arr.push({ x: r() * (W + 400) - 200, y: r() * 380, k: 1 + Math.floor(r() * 3), p: r() * TAU, s: 0.8 + r() * 1.4 });
    return (cache.stars = arr);
  }
  function clouds() {
    if (cache.clouds) return cache.clouds;
    const r = mulberry32(21);
    const make = (n, y0, y1, s0, s1) => {
      const arr = [];
      for (let i = 0; i < n; i++) {
        const scale = s0 + r() * (s1 - s0);
        const puffs = [];
        const np = 5 + Math.floor(r() * 4);
        for (let k = 0; k < np; k++) {
          puffs.push({ dx: (r() - 0.5) * 300 * scale, dy: (r() - 0.5) * 26 * scale, rx: (50 + r() * 80) * scale, ry: (10 + r() * 16) * scale });
        }
        arr.push({ x0: r() * 3200, y: y0 + r() * (y1 - y0), scale, puffs });
      }
      return arr;
    };
    return (cache.clouds = { far: make(10, 380, 600, 0.55, 1.0), near: make(5, 300, 520, 1.2, 2.0) });
  }
  function shimmer() {
    if (cache.shimmer) return cache.shimmer;
    const r = mulberry32(5); const arr = [];
    for (let i = 0; i < 80; i++) arr.push({ x0: r() * 2400, y: WATER + 10 + r() * 280, w: 20 + r() * 90, v: (1 + Math.floor(r() * 2)) * 2400 / T, k: 1 + Math.floor(r() * 3), p: r() * TAU });
    return (cache.shimmer = arr);
  }
  function traffic() {
    if (cache.traffic) return cache.traffic;
    const r = mulberry32(9);
    const lane = (n, k, dir, color) => ({ k, dir, color, cars: Array.from({ length: n }, () => ({ x0: r() * 1200, len: 50 + r() * 110, a: 0.45 + r() * 0.55 })) });
    return (cache.traffic = [lane(9, 3, -1, 'trailA'), lane(11, 4, 1, 'trailB')]);
  }

  /* ---------- skyline scene layers ---------- */
  const SUN = { x: 820, y: 722, r: 138 };

  function drawSky(ctx, P, t) {
    const g = ctx.createLinearGradient(0, -100, 0, WATER + 10);
    g.addColorStop(0, P.skyTop); g.addColorStop(0.4, P.skyMid); g.addColorStop(0.68, P.skyLow);
    g.addColorStop(0.9, P.horizon); g.addColorStop(1, P.glow);
    ctx.fillStyle = g; ctx.fillRect(-500, -300, W + 1000, WATER + 310);
    const sg = ctx.createRadialGradient(SUN.x, SUN.y, 10, SUN.x, SUN.y, 640);
    sg.addColorStop(0, rgba(P.glow, 0.95)); sg.addColorStop(0.22, rgba(P.horizon, 0.6)); sg.addColorStop(1, rgba(P.horizon, 0));
    ctx.fillStyle = sg; ctx.fillRect(-500, -300, W + 1000, WATER + 310);
    ctx.fillStyle = P.sun; circle(ctx, SUN.x, SUN.y, SUN.r);
    // stars in the dark upper sky
    const ph = TAU * t / T;
    if (P.day) return;
    for (const s of stars()) {
      const a = 0.25 + 0.55 * Math.max(0, Math.sin(ph * s.k + s.p));
      ctx.fillStyle = rgba(P.hot, a * (1 - s.y / 420));
      ctx.fillRect(s.x, s.y, s.s, s.s);
    }
  }

  function drawPlane(ctx, P, t) {
    const u = (t % T) / T;
    const x = -80 + u * (W + 160), y = 150 - 60 * u;
    ctx.fillStyle = rgba(P.hot, 0.75); circle(ctx, x, y, 1.8);
    if (Math.floor(t * 2.5) % 2 === 0) { ctx.fillStyle = '#ff4a3a'; circle(ctx, x - 7, y + 1, 1.8); }
  }

  function drawClouds(ctx, P, t, layer) {
    const L = layer === 'far'
      ? { speed: (W + 1300) / T, wrap: W + 1300, list: clouds().far, a: 0.78 }
      : { speed: 2 * (W + 1500) / T, wrap: W + 1500, list: clouds().near, a: 0.9 };
    for (const c of L.list) {
      const x = ((c.x0 + L.speed * t) % L.wrap) - 650;
      const lit = Math.max(0, Math.min(1, (c.y - 300) / 300)); // lower clouds catch the sunset
      // lit rim (drawn first, offset down) then the dark body
      ctx.fillStyle = rgba(P.cloudRim, 0.25 + 0.45 * lit);
      for (const p of c.puffs) { ctx.beginPath(); ctx.ellipse(x + p.dx, c.y + p.dy + 5, p.rx, p.ry, 0, 0, TAU); ctx.fill(); }
      ctx.fillStyle = rgba(P.cloud, L.a);
      for (const p of c.puffs) { ctx.beginPath(); ctx.ellipse(x + p.dx, c.y + p.dy, p.rx, p.ry, 0, 0, TAU); ctx.fill(); }
    }
  }

  function drawFar(ctx, P, t) {
    const b = WATER - 4;
    ctx.fillStyle = P.silFar;
    for (const f of fillers()) ctx.fillRect(f.x, b - f.h, f.w, f.h);
    // BT Tower
    ctx.fillRect(128, b - 330, 24, 330); ctx.fillRect(118, b - 250, 44, 34); ctx.fillRect(138, b - 362, 4, 32);
    // St Paul's
    ctx.fillRect(372, b - 90, 156, 90); ctx.fillRect(396, b - 118, 108, 30);
    ctx.beginPath(); ctx.arc(450, b - 118, 56, Math.PI, 0); ctx.fill();
    ctx.fillRect(443, b - 196, 14, 24); ctx.fillRect(449, b - 214, 2, 18);
    ctx.fillRect(366, b - 150, 22, 150); ctx.fillRect(512, b - 150, 22, 150);
    ctx.beginPath(); ctx.arc(377, b - 150, 11, Math.PI, 0); ctx.fill();
    ctx.beginPath(); ctx.arc(523, b - 150, 11, Math.PI, 0); ctx.fill();
    // The City: Tower 42, 22 Bishopsgate, Gherkin, Cheesegrater, Heron Tower, Walkie Talkie
    ctx.fillRect(980, b - 300, 46, 300); ctx.fillRect(988, b - 318, 30, 18); ctx.fillRect(996, b - 332, 14, 14);
    poly(ctx, [[1060, b], [1060, b - 380], [1146, b - 396], [1146, b]]);
    ctx.beginPath(); ctx.moveTo(1150, b);
    ctx.bezierCurveTo(1150, b - 200, 1160, b - 300, 1185, b - 300);
    ctx.bezierCurveTo(1210, b - 300, 1220, b - 200, 1220, b); ctx.closePath(); ctx.fill();
    poly(ctx, [[1240, b], [1320, b - 346], [1320, b]]);
    ctx.fillRect(1340, b - 330, 50, 330); ctx.fillRect(1362, b - 372, 4, 42);
    ctx.beginPath(); ctx.moveTo(1405, b); ctx.lineTo(1392, b - 246);
    ctx.quadraticCurveTo(1440, b - 270, 1488, b - 246); ctx.lineTo(1475, b); ctx.closePath(); ctx.fill();
    // The Shard
    poly(ctx, [[1515, b], [1556, b - 486], [1560, b - 468], [1566, b - 486], [1605, b]]);
    // Canary Wharf
    ctx.fillRect(1725, b - 200, 56, 200); ctx.fillRect(1860, b - 190, 54, 190);
    ctx.fillRect(1790, b - 250, 72, 250); poly(ctx, [[1790, b - 250], [1826, b - 292], [1862, b - 250]]);
    // windows
    for (const f of fillers()) windows(ctx, P, f.x + 2, b - f.h + 4, f.w - 4, f.h - 6, 3, 4, 4, f.seed, 0.3, t, 0.55);
    windows(ctx, P, 1062, b - 372, 82, 364, 4, 6, 4, 11, 0.5, t, 0.8);
    windows(ctx, P, 982, b - 296, 42, 290, 3, 5, 3, 12, 0.45, t, 0.8);
    windows(ctx, P, 1342, b - 326, 46, 320, 3, 5, 3, 13, 0.5, t, 0.8);
    windows(ctx, P, 1792, b - 246, 68, 240, 4, 6, 4, 15, 0.5, t, 0.8);
    windows(ctx, P, 1727, b - 196, 52, 190, 4, 6, 4, 16, 0.4, t, 0.7);
    windows(ctx, P, 1862, b - 186, 50, 180, 4, 6, 4, 17, 0.4, t, 0.7);
    windows(ctx, P, 1410, b - 230, 60, 224, 5, 6, 5, 18, 0.45, t, 0.8);
    windows(ctx, P, 376, b - 86, 148, 80, 5, 10, 8, 19, 0.6, t, 0.8);
    // the Shard's lit edges
    ctx.strokeStyle = rgba(P.light, 0.35); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(1528, b); ctx.lineTo(1558, b - 440); ctx.moveTo(1592, b); ctx.lineTo(1564, b - 440); ctx.stroke();
    // aircraft warning lights
    if (Math.floor(t * 1.5) % 2 === 0) {
      ctx.fillStyle = '#ff3b2f';
      circle(ctx, 1826, b - 294, 3); circle(ctx, 1561, b - 487, 3); circle(ctx, 1364, b - 372, 2.5); circle(ctx, 140, b - 362, 2.5);
    }
  }

  function drawHaze(ctx, P) {
    const g = ctx.createLinearGradient(0, 560, 0, WATER);
    g.addColorStop(0, rgba(P.horizon, 0)); g.addColorStop(1, rgba(P.horizon, 0.32));
    ctx.fillStyle = g; ctx.fillRect(-500, 560, W + 1000, WATER - 560);
  }

  function drawWestminster(ctx, P, t) {
    const b = WATER + 2;
    ctx.fillStyle = P.sil;
    ctx.fillRect(190, b - 108, 412, 108);
    for (let x = 194; x < 600; x += 22) poly(ctx, [[x, b - 108], [x + 5, b - 128], [x + 10, b - 108]]);
    ctx.fillRect(366, b - 180, 30, 180); poly(ctx, [[362, b - 180], [381, b - 232], [400, b - 180]]);
    ctx.fillRect(190, b - 292, 70, 292);
    for (const px of [192, 221, 250]) { ctx.fillRect(px, b - 320, 8, 30); poly(ctx, [[px - 1, b - 320], [px + 4, b - 334], [px + 9, b - 320]]); }
    // Elizabeth Tower (Big Ben)
    ctx.fillRect(556, b - 272, 46, 272);
    ctx.fillRect(551, b - 326, 56, 54);
    poly(ctx, [[551, b - 326], [579, b - 402], [607, b - 326]]);
    ctx.fillRect(577, b - 416, 4, 16);
    ctx.fillStyle = rgba(P.hot, 0.95); circle(ctx, 579, b - 298, 17);
    ctx.strokeStyle = P.sil; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(579, b - 298); ctx.lineTo(579, b - 310); ctx.moveTo(579, b - 298); ctx.lineTo(588, b - 293); ctx.stroke();
    windows(ctx, P, 196, b - 100, 400, 90, 5, 14, 9, 21, 0.75, t, 0.9);
    windows(ctx, P, 196, b - 280, 58, 160, 6, 14, 10, 22, 0.5, t, 0.8);
    windows(ctx, P, 561, b - 262, 36, 226, 5, 12, 11, 23, 0.45, t, 0.8);
  }

  function drawEye(ctx, P, t) {
    const cx = 790, cy = 556, R = 204;
    const rot = (TAU / 32) * 4 * (t / T); // 45° per loop → seamless
    ctx.strokeStyle = P.sil; ctx.lineWidth = 10; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - 96, WATER + 4); ctx.lineTo(cx, cy); ctx.lineTo(cx + 96, WATER + 4); ctx.stroke();
    ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(cx + 150, WATER + 4); ctx.lineTo(cx + 8, cy + 4); ctx.stroke();
    ctx.strokeStyle = rgba(P.light, 0.16); ctx.lineWidth = 18; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
    ctx.strokeStyle = rgba(P.light, 0.9); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke();
    ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, R - 14, 0, TAU); ctx.stroke();
    ctx.strokeStyle = rgba(P.light, 0.5); ctx.lineWidth = 1.2; ctx.beginPath();
    for (let k = 0; k < 32; k++) {
      const a = rot + (k * TAU) / 32;
      ctx.moveTo(cx + Math.cos(a) * 18, cy + Math.sin(a) * 18);
      ctx.lineTo(cx + Math.cos(a) * (R - 14), cy + Math.sin(a) * (R - 14));
    }
    ctx.stroke();
    ctx.fillStyle = P.sil; circle(ctx, cx, cy, 18);
    ctx.strokeStyle = rgba(P.light, 0.9); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 18, 0, TAU); ctx.stroke();
    ctx.fillStyle = rgba(P.hot, 0.92);
    for (let k = 0; k < 32; k++) {
      const a = rot + (k * TAU) / 32 + TAU / 64;
      ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * R, cy + Math.sin(a) * R, 11, 8, 0, 0, TAU); ctx.fill();
    }
  }

  function drawTraffic(ctx, P, t, x0, x1, yA, yB) {
    const span = x1 - x0 + 300;
    const lanes = traffic();
    lanes.forEach((lane, li) => {
      const v = (lane.k * span) / T;
      const y = li === 0 ? yA : yB;
      for (const car of lane.cars) {
        let x = (car.x0 + lane.dir * v * t) % span; if (x < 0) x += span;
        x = x0 - 150 + x;
        const col = P[lane.color];
        ctx.strokeStyle = rgba(col, 0.22 * car.a); ctx.lineWidth = 7; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + car.len, y); ctx.stroke();
        ctx.strokeStyle = rgba(col, 0.9 * car.a); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + car.len, y); ctx.stroke();
      }
    });
  }

  function drawBridge(ctx, P, t) {
    const deckY = 640, L = 1000, Rr = 1760;
    const towers = [1240, 1540];
    const q = (x0, y0, cx, cy, x1, y1, u) => { const v = 1 - u; return [v * v * x0 + 2 * v * u * cx + u * u * x1, v * v * y0 + 2 * v * u * cy + u * u * y1]; };
    ctx.strokeStyle = P.sil; ctx.lineCap = 'butt';
    ctx.lineWidth = 9; ctx.beginPath();
    ctx.moveTo(L, deckY - 10); ctx.quadraticCurveTo(1100, 560, 1204, 470);
    ctx.moveTo(Rr, deckY - 10); ctx.quadraticCurveTo(1660, 560, 1576, 470); ctx.stroke();
    ctx.lineWidth = 2; ctx.beginPath();
    for (let u = 0.08; u < 0.95; u += 0.07) {
      let p = q(L, deckY - 10, 1100, 560, 1204, 470, u); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0], deckY);
      p = q(Rr, deckY - 10, 1660, 560, 1576, 470, u); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0], deckY);
    }
    ctx.stroke();
    ctx.fillStyle = P.sil;
    ctx.fillRect(L - 80, deckY, Rr - L + 160, 22);
    // traffic runs under the towers (through the arches)
    drawTraffic(ctx, P, t, L - 80, Rr + 80, deckY - 3, deckY + 6);
    for (const cx of towers) {
      ctx.fillStyle = P.sil;
      ctx.fillRect(cx - 38, 330, 76, 480);
      [cx - 38, cx + 26].forEach((x) => { ctx.fillRect(x, 292, 12, 44); poly(ctx, [[x - 2, 292], [x + 6, 268], [x + 14, 292]]); });
      poly(ctx, [[cx - 30, 332], [cx, 282], [cx + 30, 332]]);
      ctx.fillRect(cx - 2, 258, 4, 26);
      poly(ctx, [[cx - 92, WATER + 8], [cx + 92, WATER + 8], [cx + 70, WATER + 72], [cx - 70, WATER + 72]]);
      windows(ctx, P, cx - 30, 350, 60, 270, 6, 12, 8, 30 + cx, 0.55, t, 0.9);
    }
    ctx.fillStyle = P.sil;
    ctx.fillRect(towers[0] + 38, 408, towers[1] - towers[0] - 76, 16);
    ctx.fillRect(towers[0] + 38, 450, towers[1] - towers[0] - 76, 16);
    ctx.strokeStyle = P.sil; ctx.lineWidth = 2; ctx.beginPath();
    for (let x = towers[0] + 38; x < towers[1] - 38; x += 24) { ctx.moveTo(x, 424); ctx.lineTo(x + 24, 450); ctx.moveTo(x + 24, 424); ctx.lineTo(x, 450); }
    ctx.stroke();
    ctx.fillStyle = rgba(P.light, 0.85);
    for (let x = towers[0] + 50; x < towers[1] - 44; x += 24) ctx.fillRect(x, 429, 10, 4);
    for (let x = L - 60; x <= Rr + 60; x += 48) {
      ctx.fillStyle = rgba(P.light, 0.22); circle(ctx, x, deckY - 7, 8);
      ctx.fillStyle = rgba(P.hot, 0.95); circle(ctx, x, deckY - 7, 2.6);
    }
  }

  function drawRiver(ctx, P, t) {
    const g = ctx.createLinearGradient(0, WATER, 0, 1080);
    g.addColorStop(0, P.water); g.addColorStop(1, P.waterDeep);
    ctx.fillStyle = g; ctx.fillRect(-500, WATER, W + 1000, 500);
    ctx.save(); ctx.beginPath(); ctx.rect(-500, WATER, W + 1000, 500); ctx.clip();
    const ph = (TAU * t) / T;
    const refl = [
      { x: SUN.x, w: 200, len: 300, c: P.glow, a: 0.55 },
      { x: 790, w: 420, len: 150, c: P.light, a: 0.1 },
      { x: 579, w: 14, len: 130, c: P.hot, a: 0.3 },
      { x: 1240, w: 76, len: 180, c: P.light, a: 0.13 },
      { x: 1540, w: 76, len: 180, c: P.light, a: 0.13 },
      { x: 1380, w: 780, len: 90, c: P.light, a: 0.09 },
      { x: 1300, w: 640, len: 130, c: P.light, a: 0.07 },
      { x: 80, w: 16, len: 120, c: P.glow, a: 0.3 },
      { x: 300, w: 16, len: 110, c: P.glow, a: 0.3 },
      { x: 520, w: 16, len: 100, c: P.glow, a: 0.3 },
    ];
    for (const r of refl) {
      const rows = Math.ceil(r.len / 6);
      for (let i = 0; i < rows; i++) {
        const y = WATER + i * 6, d = i / rows;
        const wob = Math.sin(y * 0.045 + ph * 3 + r.x * 0.01) * 7 * (0.3 + d);
        const a = r.a * (1 - d) * (1 - d) * (0.7 + 0.3 * Math.sin(y * 0.3 + ph * 4 + r.x));
        ctx.fillStyle = rgba(r.c, a); ctx.fillRect(r.x - r.w / 2 + wob, y, r.w, 5);
      }
    }
    for (const s of shimmer()) {
      const x = ((s.x0 + s.v * t) % 2400) - 240;
      const a = Math.max(0, Math.sin(ph * s.k + s.p)) * 0.32 * (1 - (s.y - WATER) / 400);
      if (a <= 0.01) continue;
      ctx.fillStyle = rgba(P.glow, a); ctx.fillRect(x, s.y, s.w, 2);
    }
    ctx.restore();
  }

  function drawBoats(ctx, P, t) {
    const u = (t % T) / T;
    let x = W + 320 - u * (W + 640); const y = 912;
    ctx.fillStyle = rgba(P.light, 0.12); ctx.fillRect(x + 150, y + 13, 140, 2); ctx.fillRect(x + 150, y + 18, 90, 1.5);
    ctx.fillStyle = P.sil; poly(ctx, [[x, y], [x + 150, y], [x + 142, y + 22], [x + 10, y + 22]]); ctx.fillRect(x + 30, y - 16, 96, 16);
    ctx.fillStyle = rgba(P.light, 0.85);
    for (let i = 0; i < 7; i++) ctx.fillRect(x + 36 + i * 13, y - 12, 8, 7);
    ctx.fillStyle = '#ff3b2f'; circle(ctx, x + 6, y - 4, 2.5); ctx.fillStyle = '#5bff8a'; circle(ctx, x + 146, y - 4, 2.5);
    const u2 = ((2 * t) % T) / T; const x2 = -200 + u2 * (W + 400), y2 = 832;
    ctx.fillStyle = P.sil; poly(ctx, [[x2, y2], [x2 + 70, y2], [x2 + 64, y2 + 10], [x2 + 6, y2 + 10]]); ctx.fillRect(x2 + 20, y2 - 9, 30, 9);
    ctx.fillStyle = rgba(P.hot, 0.9); circle(ctx, x2 + 35, y2 - 11, 2);
  }

  function drawEmbankment(ctx, P) {
    ctx.fillStyle = P.sil;
    poly(ctx, [[-500, 884], [560, 884], [604, 902], [604, 1300], [-500, 1300]]);
    ctx.fillRect(-500, 866, 1090, 3);
    for (let x = -490; x < 580; x += 26) ctx.fillRect(x, 866, 3, 18);
    for (const lx of [80, 300, 520]) {
      ctx.fillStyle = P.sil; ctx.fillRect(lx - 3, 740, 6, 146); ctx.fillRect(lx - 10, 736, 20, 6);
      const g = ctx.createRadialGradient(lx, 728, 2, lx, 728, 72);
      g.addColorStop(0, rgba(P.hot, 0.9)); g.addColorStop(0.2, rgba(P.glow, 0.45)); g.addColorStop(1, rgba(P.glow, 0));
      ctx.fillStyle = g; ctx.fillRect(lx - 72, 656, 144, 144);
      ctx.fillStyle = P.hot; circle(ctx, lx, 728, 9);
    }
  }

  /* ---------- exhibition hall scene ---------- */
  function hallFurniture(seed) {
    const key = 'hall' + seed;
    if (cache[key]) return cache[key];
    const r = mulberry32(seed * 97 + 3);
    const banners = [], stands = [], people = [];
    for (let i = 0; i < 7; i++) banners.push({ xw: (r() - 0.5) * 2200, z: 1.6 + r() * 7, w: 160 + r() * 160, h: 260 + r() * 220, tone: r() });
    const zs = [1.25, 1.6, 2.1, 2.8, 3.8, 5.2, 7.2, 10, 14];
    for (const z of zs) {
      stands.push({ side: -1, z, x0: -1500 - r() * 200, x1: -380 - r() * 120, h: 220 + r() * 90, seed: Math.floor(r() * 1e5), lit: r() });
      stands.push({ side: 1, z, x0: 380 + r() * 120, x1: 1500 + r() * 200, h: 220 + r() * 90, seed: Math.floor(r() * 1e5), lit: r() });
    }
    for (let i = 0; i < 70; i++) people.push({ xw: (r() - 0.5) * 1300, k: 1 + Math.floor(r() * 2), p: r(), dir: r() < 0.5 ? 1 : -1, h: 150 + r() * 40, w: 46 + r() * 24 });
    return (cache[key] = { banners, stands, people });
  }

  function drawHall(ctx, P, t, opts) {
    const F = hallFurniture(opts.seed || 1);
    const VP = { x: 960, y: 500 };
    const FLOOR = 580, CEIL = 500;
    const fy = (z) => VP.y + FLOOR / z;
    const cy = (z) => VP.y - CEIL / z;
    const sx = (xw, z) => VP.x + xw / z;
    const ph = (TAU * t) / T;

    const cg = ctx.createLinearGradient(0, -200, 0, VP.y);
    cg.addColorStop(0, P.skyTop); cg.addColorStop(1, P.skyMid);
    ctx.fillStyle = cg; ctx.fillRect(-500, -300, W + 1000, VP.y + 300);
    const fg = ctx.createLinearGradient(0, VP.y, 0, 1080);
    fg.addColorStop(0, P.skyLow); fg.addColorStop(0.25, P.water); fg.addColorStop(1, P.waterDeep);
    ctx.fillStyle = fg; ctx.fillRect(-500, VP.y, W + 1000, 700);
    // far-end glow + LED wall
    const gl = ctx.createRadialGradient(VP.x, VP.y - 20, 10, VP.x, VP.y - 20, 760);
    gl.addColorStop(0, rgba(P.glow, 0.95)); gl.addColorStop(0.18, rgba(P.horizon, 0.55)); gl.addColorStop(1, rgba(P.horizon, 0));
    ctx.fillStyle = gl; ctx.fillRect(-500, -300, W + 1000, 1400);
    ctx.fillStyle = rgba(P.hot, 0.92); ctx.fillRect(VP.x - 150, VP.y - 96, 300, 86);
    ctx.fillStyle = rgba(P.horizon, 0.5);
    for (let i = 0; i < 6; i++) ctx.fillRect(VP.x - 140 + i * 50, VP.y - 86 + 20 * Math.abs(Math.sin(ph + i)), 36, 60);

    // floor: aisle carpet + grid
    const zl = [1, 1.08, 1.18, 1.3, 1.45, 1.65, 1.9, 2.2, 2.6, 3.1, 3.8, 4.7, 6, 8, 11, 16, 26, 60];
    ctx.fillStyle = rgba(P.horizon, 0.07);
    for (let i = 0; i < zl.length - 1; i += 2) {
      const z0 = zl[i], z1 = zl[i + 1];
      poly(ctx, [[sx(-2400, z0), fy(z0)], [sx(2400, z0), fy(z0)], [sx(2400, z1), fy(z1)], [sx(-2400, z1), fy(z1)]]);
    }
    ctx.strokeStyle = rgba(P.light, 0.1); ctx.lineWidth = 1.2; ctx.beginPath();
    for (let xw = -2400; xw <= 2400; xw += 240) { ctx.moveTo(sx(xw, 1), fy(1)); ctx.lineTo(sx(xw, 60), fy(60)); }
    for (const z of zl) { ctx.moveTo(sx(-2400, z), fy(z)); ctx.lineTo(sx(2400, z), fy(z)); }
    ctx.stroke();

    // ceiling trusses + rows of lights
    const czs = [1.05, 1.25, 1.5, 1.85, 2.3, 2.9, 3.7, 4.8, 6.3, 8.5, 12, 18];
    ctx.strokeStyle = P.sil; ctx.lineWidth = 5; ctx.beginPath();
    for (let xw = -1800; xw <= 1800; xw += 300) { ctx.moveTo(sx(xw, 1), cy(1)); ctx.lineTo(sx(xw, 40), cy(40)); }
    ctx.stroke();
    ctx.lineWidth = 3; ctx.beginPath();
    for (const z of czs) { ctx.moveTo(sx(-2400, z), cy(z)); ctx.lineTo(sx(2400, z), cy(z)); ctx.moveTo(sx(-2400, z), cy(z) + 16 / z); ctx.lineTo(sx(2400, z), cy(z) + 16 / z); }
    ctx.stroke();
    for (const z of czs) {
      for (let xw = -1650; xw <= 1650; xw += 300) {
        const x = sx(xw, z), y = cy(z) + 20 / z, w = 60 / z, h = 18 / z;
        const fl = 0.75 + 0.25 * Math.sin(ph * 2 + xw * 0.01 + z);
        const g = ctx.createRadialGradient(x, y, 1, x, y, 90 / z + 10);
        g.addColorStop(0, rgba(P.glow, 0.5 * fl)); g.addColorStop(1, rgba(P.glow, 0));
        ctx.fillStyle = g; ctx.fillRect(x - 100 / z - 10, y - 100 / z - 10, 200 / z + 20, 200 / z + 20);
        ctx.fillStyle = rgba(P.hot, 0.95 * fl); ctx.fillRect(x - w / 2, y, w, h);
      }
    }
    // light beams
    for (let i = 0; i < 6; i++) {
      const z = 1.6 + i * 1.1, xw = (i % 2 ? 1 : -1) * (300 + i * 180);
      const x = sx(xw, z), y = cy(z) + 20 / z;
      const g = ctx.createLinearGradient(0, y, 0, fy(z) + 40);
      g.addColorStop(0, rgba(P.glow, 0.16)); g.addColorStop(1, rgba(P.glow, 0));
      ctx.fillStyle = g; poly(ctx, [[x - 10 / z, y], [x + 10 / z, y], [x + 220 / z, fy(z) + 40], [x - 220 / z, fy(z) + 40]]);
    }

    // stands (far to near)
    const stands = F.stands.slice().sort((a, b) => b.z - a.z);
    for (const s of stands) {
      const z = s.z, z2 = z * 1.3;
      const x1 = sx(s.x0, z), x2 = sx(s.x1, z), yt = fy(z) - s.h / z, yf = fy(z);
      const inner = s.side < 0 ? s.x1 : s.x0;
      const xi = sx(inner, z), xib = sx(inner, z2), ytb = fy(z2) - s.h / z2, yfb = fy(z2);
      ctx.fillStyle = rgba(P.sil, 0.96);
      poly(ctx, [[xi, yt], [xib, ytb], [xib, yfb], [xi, yf]]);
      ctx.fillStyle = P.sil; ctx.fillRect(Math.min(x1, x2), yt, Math.abs(x2 - x1), yf - yt);
      ctx.fillStyle = rgba(P.light, 0.5 + 0.4 * s.lit);
      ctx.fillRect(Math.min(x1, x2), yt, Math.abs(x2 - x1), Math.max(1.5, 7 / z));
      windows(ctx, P, Math.min(x1, x2) + 6 / z, yt + 24 / z, Math.abs(x2 - x1) - 12 / z, (yf - yt) - 40 / z, 44 / z, 60 / z, 18 / z, s.seed, 0.45, t, 0.5);
    }

    // hanging banners
    for (const bn of F.banners.slice().sort((a, b) => b.z - a.z)) {
      const z = bn.z, x = sx(bn.xw, z), top = cy(z) + 60 / z, w = bn.w / z, h = bn.h / z;
      ctx.strokeStyle = P.sil; ctx.lineWidth = Math.max(1, 3 / z);
      ctx.beginPath(); ctx.moveTo(x - w / 2 + 4, cy(z)); ctx.lineTo(x - w / 2 + 4, top); ctx.moveTo(x + w / 2 - 4, cy(z)); ctx.lineTo(x + w / 2 - 4, top); ctx.stroke();
      const g = ctx.createLinearGradient(0, top, 0, top + h);
      g.addColorStop(0, bn.tone > 0.5 ? P.horizon : P.skyLow); g.addColorStop(1, bn.tone > 0.5 ? P.skyLow : P.skyMid);
      ctx.fillStyle = g; ctx.fillRect(x - w / 2, top, w, h);
      ctx.fillStyle = rgba(P.hot, 0.75); ctx.fillRect(x - w / 2, top, w, Math.max(2, 10 / z));
      ctx.fillStyle = rgba(P.sil, 0.55);
      ctx.fillRect(x - w / 2 + w * 0.15, top + h * 0.3, w * 0.7, h * 0.07);
      ctx.fillRect(x - w / 2 + w * 0.15, top + h * 0.42, w * 0.5, h * 0.05);
    }

    // visitors (ghosted, hyperlapse-style)
    for (const p of F.people) {
      const u = ((t * p.k) / T + p.p) % 1;
      const z = 1.15 + 11 * (p.dir > 0 ? u : 1 - u);
      const x = sx(p.xw, z), yf = fy(z), h = p.h / z, w = p.w / z;
      const a = 0.42 * Math.min(1, (z - 1.1) * 3) * Math.min(1, (12.5 - z));
      for (let s = -1; s <= 1; s++) {
        ctx.fillStyle = rgba(P.sil, s === 0 ? a : a * 0.35);
        const ox = s * (6 / z) * p.dir;
        ctx.beginPath(); ctx.ellipse(x + ox, yf - h * 0.88, w * 0.2, w * 0.2, 0, 0, TAU); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + ox - w / 2, yf - h * 0.72); ctx.lineTo(x + ox + w / 2, yf - h * 0.72);
        ctx.lineTo(x + ox + w * 0.35, yf); ctx.lineTo(x + ox - w * 0.35, yf); ctx.closePath(); ctx.fill();
      }
    }
  }

  /* ---------- post: grain + vignette (screen space) ---------- */
  let grainTile = null;
  function grain(ctx, w, h, t) {
    if (!grainTile) {
      const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(256, 256) : (root.document && root.document.createElement('canvas'));
      if (!c) return;
      c.width = 256; c.height = 256;
      const g = c.getContext('2d'); const img = g.createImageData(256, 256); const r = mulberry32(99);
      for (let i = 0; i < img.data.length; i += 4) { const v = 180 + r() * 75; img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = r() * 255; }
      g.putImageData(img, 0, 0); grainTile = c;
    }
    const f = Math.floor(t * 30);
    const ox = Math.floor(hash(f, 1) * 256), oy = Math.floor(hash(f, 2) * 256);
    ctx.save(); ctx.globalAlpha = 0.055; ctx.globalCompositeOperation = 'overlay';
    const pat = ctx.createPattern(grainTile, 'repeat');
    ctx.translate(-ox, -oy); ctx.fillStyle = pat; ctx.fillRect(0, 0, w + 256, h + 256);
    ctx.restore();
  }
  function vignette(ctx, w, h) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  }

  /* ---------- main entry ---------- */
  function draw(ctx, w, h, t, opts) {
    opts = opts || {};
    const P = PALETTES[opts.palette] || PALETTES.blue;
    const scene = opts.scene === 'hall' ? 'hall' : 'skyline';
    const cam = CAMERAS[opts.camera] || (scene === 'hall' ? CAMERAS.hall : CAMERAS.wide);
    const ph = (TAU * t) / T;
    const s = Math.max(w / W, h / H);
    const zoom = cam.zoom * (1 + 0.02 * Math.cos(ph));
    const camX = 40 * Math.sin(ph), camY = 10 * Math.sin(2 * ph);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = P.skyTop; ctx.fillRect(0, 0, w, h);
    ctx.translate(w / 2, h / 2); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2);
    ctx.translate(cam.cx, cam.cy); ctx.scale(zoom, zoom); ctx.translate(-cam.cx, -cam.cy);

    const layer = (depth, fn) => { ctx.save(); ctx.translate(-camX * depth, -camY * depth * 0.5); fn(); ctx.restore(); };

    if (scene === 'hall') {
      layer(0.3, () => drawHall(ctx, P, t, opts));
    } else {
      layer(0.05, () => { drawSky(ctx, P, t); drawPlane(ctx, P, t); });
      layer(0.12, () => drawClouds(ctx, P, t, 'far'));
      layer(0.2, () => { drawFar(ctx, P, t); drawHaze(ctx, P); });
      layer(0.3, () => drawClouds(ctx, P, t, 'near'));
      layer(0.45, () => { drawWestminster(ctx, P, t); drawEye(ctx, P, t); });
      layer(0.5, () => drawRiver(ctx, P, t));
      layer(0.7, () => drawBridge(ctx, P, t));
      layer(0.6, () => drawBoats(ctx, P, t));
      layer(1.1, () => drawEmbankment(ctx, P));
    }
    ctx.restore();

    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (opts.grain !== false) grain(ctx, w, h, t);
    vignette(ctx, w, h);
    ctx.restore();
  }

  const api = { draw, LOOP_SECONDS: T, WIDTH: W, HEIGHT: H, palettes: Object.keys(PALETTES), cameras: Object.keys(CAMERAS) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LondonScene = api;
})(typeof window !== 'undefined' ? window : globalThis);
