/* Helios Haul — canvas renderer: starfield, run view, hangar backdrop */
(function () {
  'use strict';
  var HH = window.HH = window.HH || {};
  var Game = HH.Game, Input = HH.Input;

  var cv, ctx, W = 400, H = 800, dpr = 1, glowCache = {};
  var TAU = Math.PI * 2;

  function hash(ix, iy, s) {
    var h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(s, 2147483647)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function glow(color, size) {
    var key = color + size;
    if (glowCache[key]) return glowCache[key];
    var c = document.createElement('canvas');
    c.width = c.height = size;
    var g = c.getContext('2d'), r = size / 2;
    var grd = g.createRadialGradient(r, r, 0, r, r, r);
    grd.addColorStop(0, color);
    grd.addColorStop(0.35, color.replace(/[\d.]+\)$/, '0.35)'));
    grd.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    g.fillStyle = grd;
    g.fillRect(0, 0, size, size);
    glowCache[key] = c;
    return c;
  }
  // colour -> rgba(…,1) string for the glow cache
  function rgba(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + (a === undefined ? 1 : a) + ')';
  }
  function drawGlow(hex, x, y, r, alpha) {
    var spr = glow(rgba(hex, 1), 64);
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.drawImage(spr, x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }

  /* ---------- backdrop ---------- */
  var LAYERS = [{ f: 0.12, tile: 220, n: 3, s: 0.8, a: 0.45 }, { f: 0.3, tile: 240, n: 3, s: 1.1, a: 0.6 }, { f: 0.65, tile: 280, n: 2, s: 1.7, a: 0.9 }];

  function drawBackdrop(cx, cy, scale, t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#050a18'); g.addColorStop(1, '#0a1226');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // far nebula glows
    var NT = 900, nf = 0.06, nx = cx * scale * nf, ny = cy * scale * nf, ix, iy, i;
    ctx.globalCompositeOperation = 'lighter';
    for (ix = Math.floor((nx - 400) / NT); ix <= Math.floor((nx + W + 400) / NT); ix++) {
      for (iy = Math.floor((ny - 400) / NT); iy <= Math.floor((ny + H + 400) / NT); iy++) {
        if (hash(ix, iy, 91) < 0.55) continue;
        var cols = ['#1f4fff', '#7a2bff', '#00b7d6', '#ff5a2e'], c = cols[Math.floor(hash(ix, iy, 92) * 4)];
        var px = ix * NT + hash(ix, iy, 93) * NT - nx, py = iy * NT + hash(ix, iy, 94) * NT - ny;
        drawGlow(c, px, py, 380 + hash(ix, iy, 95) * 240, 0.10);
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    // parallax star layers
    for (i = 0; i < LAYERS.length; i++) {
      var L = LAYERS[i], ox = cx * scale * L.f, oy = cy * scale * L.f, k;
      for (ix = Math.floor(ox / L.tile); ix <= Math.floor((ox + W) / L.tile); ix++) {
        for (iy = Math.floor(oy / L.tile); iy <= Math.floor((oy + H) / L.tile); iy++) {
          for (k = 0; k < L.n; k++) {
            var sx = ix * L.tile + hash(ix, iy, i * 10 + k) * L.tile - ox;
            var sy = iy * L.tile + hash(ix, iy, i * 10 + k + 5) * L.tile - oy;
            var tw = 0.65 + 0.35 * Math.sin(t * 1.6 + hash(ix, iy, k + 40) * 20);
            ctx.globalAlpha = L.a * tw;
            ctx.fillStyle = hash(ix, iy, k + 70) < 0.2 ? '#ffe7a8' : hash(ix, iy, k + 70) < 0.4 ? '#a8dcff' : '#ffffff';
            ctx.fillRect(sx, sy, L.s * 1.4, L.s * 1.4);
          }
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- entity drawing (world space) ---------- */
  var AST_COL = [
    { f: '#8a7b6c', s: '#c9b9a4' }, { f: '#7d8fa3', s: '#bcd0e6' },
    { f: '#3a8fa8', s: '#9ff0ff' }, { f: '#2a2144', s: '#b79cff' }
  ];

  function polyPath(verts, rot, x, y) {
    var c = Math.cos(rot), s = Math.sin(rot), i;
    ctx.beginPath();
    for (i = 0; i < verts.length; i++) {
      var vx = verts[i][0], vy = verts[i][1];
      var px = x + vx * c - vy * s, py = y + vx * s + vy * c;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath();
  }

  function drawAsteroid(e, G, t, hudC) {
    var C = AST_COL[e.tier];
    if (e.tier >= 2) {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(e.tier === 2 ? '#3ad0ff' : '#8b5bff', e.x, e.y, e.r * 2.2, 0.25);
      ctx.globalCompositeOperation = 'source-over';
    }
    polyPath(e.verts, e.rot, e.x, e.y);
    ctx.fillStyle = e.flash > 0 ? '#ffffff' : e.ore ? '#8a6a2a' : C.f;
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = e.ore ? '#ffd45e' : C.s;
    ctx.stroke();
    // craters / facets
    ctx.save();
    ctx.translate(e.x, e.y); ctx.rotate(e.rot);
    if (e.tier >= 2) {
      ctx.strokeStyle = rgba(C.s, 0.55); ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (var i = 0; i < e.verts.length; i += 2) { ctx.moveTo(0, 0); ctx.lineTo(e.verts[i][0], e.verts[i][1]); }
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath(); ctx.arc(e.r * 0.25, -e.r * 0.2, e.r * 0.22, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(-e.r * 0.3, e.r * 0.25, e.r * 0.15, 0, TAU); ctx.fill();
    }
    if (e.ore) {
      ctx.fillStyle = '#ffe27a';
      for (var k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(Math.cos(k * 1.7) * e.r * 0.4, Math.sin(k * 1.7) * e.r * 0.4, 2.6, 0, TAU); ctx.fill(); }
    }
    ctx.restore();
    if (e.ore) {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow('#ffd45e', e.x, e.y, e.r * (2 + 0.25 * Math.sin(t * 5 + e.id)), 0.45);
      ctx.globalCompositeOperation = 'source-over';
      if (G.S.scanner > 0) {
        ctx.strokeStyle = 'rgba(255,212,94,0.5)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 10 + Math.sin(t * 3) * 2, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    hpBar(e);
  }

  function hpBar(e) {
    if (e.hp >= e.mhp) return;
    var w = Math.max(30, e.r * 1.4), x = e.x - w / 2, y = e.y - e.r - 12;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x - 1, y - 1, w + 2, 5);
    ctx.fillStyle = e.k === 'boss' ? '#ff8a5c' : '#9cf0ff';
    ctx.fillRect(x, y, w * Math.max(0, e.hp / e.mhp), 3);
  }

  function drawDrone(e, t) {
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.rot);
    var charging = e.fire < 0.5;
    ctx.globalCompositeOperation = 'lighter';
    drawGlow('#ff7a4a', 0, 0, 34 + (charging ? 10 * Math.sin(t * 30) : 0), charging ? 0.7 : 0.35);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = e.flash > 0 ? '#fff' : '#3b2a3f';
    ctx.strokeStyle = '#ff8f6a'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (var i = 0; i < 6; i++) { var a = i / 6 * TAU; ctx.lineTo(Math.cos(a) * 17, Math.sin(a) * 14); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = charging ? '#fff2b8' : '#ff6a3a';
    ctx.beginPath(); ctx.arc(7, 0, 4.5, 0, TAU); ctx.fill();
    ctx.restore();
    hpBar(e);
  }

  function drawCrate(e, t) {
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.rot);
    ctx.globalCompositeOperation = 'lighter';
    drawGlow('#ffd45e', 0, 0, 40, 0.28);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = e.flash > 0 ? '#fff' : '#4a3a1c';
    ctx.strokeStyle = '#ffd45e'; ctx.lineWidth = 2.2;
    ctx.fillRect(-15, -15, 30, 30); ctx.strokeRect(-15, -15, 30, 30);
    ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(15, 0); ctx.moveTo(0, -15); ctx.lineTo(0, 15); ctx.stroke();
    ctx.restore();
    hpBar(e);
  }

  function drawBoss(e, t) {
    ctx.globalCompositeOperation = 'lighter';
    drawGlow('#ff5a2e', e.x, e.y, e.r * 2.6, 0.32 + 0.1 * Math.sin(t * 4));
    ctx.globalCompositeOperation = 'source-over';
    polyPath(e.verts, e.rot, e.x, e.y);
    ctx.fillStyle = e.flash > 0 ? '#fff' : '#3a2620';
    ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#ff9a5c'; ctx.stroke();
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.rot);
    ctx.strokeStyle = 'rgba(255,140,60,0.8)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (var i = 0; i < e.verts.length; i += 2) { ctx.moveTo(e.verts[i][0] * 0.2, e.verts[i][1] * 0.2); ctx.lineTo(e.verts[i][0] * 0.85, e.verts[i][1] * 0.85); }
    ctx.stroke();
    ctx.restore();
    ctx.globalCompositeOperation = 'lighter';
    drawGlow('#ffcf7a', e.x, e.y, 26 + 5 * Math.sin(t * 6), 0.9);
    ctx.globalCompositeOperation = 'source-over';
    // wide HP bar
    var w = 120, x = e.x - w / 2, y = e.y - e.r - 18;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - 2, y - 2, w + 4, 9);
    ctx.fillStyle = '#ff8a5c'; ctx.fillRect(x, y, w * Math.max(0, e.hp / e.mhp), 5);
  }

  function drawShip(G, t, hudC) {
    var s = G.ship, tc = HH.TRAILS[HH.Meta.trail()].c;
    if (s.inv > 0 && Math.floor(t * 20) % 2) ctx.globalAlpha = 0.45;
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.a);
    // thruster flame, opposite the velocity
    var sp = Math.hypot(s.vx, s.vy), fl = Math.min(1, sp / 200 + s.thr * 0.4);
    if (fl > 0.05) {
      var fa = (sp > 20 ? Math.atan2(s.vy, s.vx) + Math.PI : s.a + Math.PI) - s.a;
      ctx.save(); ctx.rotate(fa);
      ctx.globalCompositeOperation = 'lighter';
      var len = 14 + 20 * fl + Math.random() * 5;
      var gr = ctx.createLinearGradient(-6, 0, -6 - len, 0);
      gr.addColorStop(0, tc[0]); gr.addColorStop(1, rgba(tc[1], 0));
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.moveTo(-6, -5); ctx.lineTo(-6 - len, 0); ctx.lineTo(-6, 5); ctx.closePath(); ctx.fill();
      ctx.restore();
      drawGlow(tc[0], -8, 0, 22, 0.5 * fl);
      ctx.globalCompositeOperation = 'source-over';
    }
    // hull
    var g = ctx.createLinearGradient(-12, 0, 18, 0);
    g.addColorStop(0, '#2a3f66'); g.addColorStop(1, '#e8f6ff');
    ctx.fillStyle = g;
    ctx.strokeStyle = hudC; ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(18, 0); ctx.lineTo(-8, 12); ctx.lineTo(-4, 4); ctx.lineTo(-10, 0); ctx.lineTo(-4, -4); ctx.lineTo(-8, -12);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#0b1830';
    ctx.beginPath(); ctx.ellipse(3, 0, 5, 2.8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = hudC; ctx.globalAlpha *= 0.85;
    ctx.beginPath(); ctx.ellipse(4, 0, 2.2, 1.3, 0, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
    if (s.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(s.flashC, s.x, s.y, 44, Math.min(1, s.flash * 3));
      ctx.globalCompositeOperation = 'source-over';
    }
    if (s.sh > 0) {
      ctx.strokeStyle = rgba('#6aa8ff', 0.25 + 0.35 * (s.sh / s.msh)); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x, s.y, 24, 0, TAU); ctx.stroke();
    }
  }

  function drawPet(p, t) {
    var def = HH.PETS[p.sp], c = def.color, bob = Math.sin(p.t * 3) * 2;
    ctx.save(); ctx.translate(p.x, p.y + bob);
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(c, 0, 0, 34, 0.5);
    ctx.globalCompositeOperation = 'source-over';
    var face = Math.cos(p.ang) >= 0 ? 1 : -1;
    ctx.scale(face, 1);
    ctx.fillStyle = c; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.4;
    switch (def.shape) {
      case 'flame':
        ctx.beginPath(); ctx.moveTo(0, -12); ctx.quadraticCurveTo(10, -2, 7, 6); ctx.quadraticCurveTo(0, 12, -7, 6); ctx.quadraticCurveTo(-10, -2, 0, -12); ctx.fill(); break;
      case 'moth': {
        var fl = Math.sin(p.t * 14) * 4;
        ctx.beginPath(); ctx.ellipse(-8, -2 - fl * 0.4, 9, 5 + fl * 0.3, -0.5, 0, TAU); ctx.ellipse(-8, 4 + fl * 0.4, 8, 4, 0.5, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(0, 0, 8, 4.5, 0, 0, TAU); ctx.fill(); break;
      }
      case 'ring':
        ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(0, 0, 14, 4.5, p.t * 1.5, 0, TAU); ctx.stroke(); break;
      case 'newt':
        ctx.beginPath(); ctx.ellipse(0, 0, 11, 5, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-9, 0); ctx.quadraticCurveTo(-16, Math.sin(p.t * 6) * 6, -20, 0); ctx.stroke(); break;
      case 'comet':
        ctx.beginPath(); ctx.arc(2, 0, 8, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-5, -6); ctx.lineTo(-22, 0); ctx.lineTo(-5, 6); ctx.fillStyle = rgba(c, 0.55); ctx.fill(); ctx.fillStyle = c; break;
      default:
        ctx.beginPath(); ctx.ellipse(0, 0, 13, 8, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(-19, -7 + Math.sin(p.t * 4) * 2); ctx.lineTo(-18, 5); ctx.closePath(); ctx.fill();
    }
    // tiny eye
    ctx.fillStyle = '#10182c';
    ctx.beginPath(); ctx.arc(def.shape === 'flame' ? 2 : 5, def.shape === 'flame' ? -1 : -1, 1.8, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawPickup(pk, t) {
    var bob = Math.sin(t * 6 + pk.ph);
    if (pk.type === 'gem') {
      ctx.globalCompositeOperation = 'lighter'; drawGlow('#5ff3ff', pk.x, pk.y, 22, 0.7); ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#b8fbff'; ctx.strokeStyle = '#3ad0ff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(pk.x, pk.y - 8); ctx.lineTo(pk.x + 6, pk.y); ctx.lineTo(pk.x, pk.y + 8); ctx.lineTo(pk.x - 6, pk.y); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (pk.type === 'heal') {
      ctx.globalCompositeOperation = 'lighter'; drawGlow('#7dffb2', pk.x, pk.y, 24, 0.7); ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#c6ffe0';
      ctx.fillRect(pk.x - 2.5, pk.y - 7, 5, 14); ctx.fillRect(pk.x - 7, pk.y - 2.5, 14, 5);
    } else {
      var blink = pk.age > 13 && Math.floor(t * 8) % 2;
      if (blink) return;
      ctx.globalCompositeOperation = 'lighter'; drawGlow('#ffcf5a', pk.x, pk.y, 14 + bob, 0.55); ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#ffe27a';
      ctx.beginPath(); ctx.moveTo(pk.x, pk.y - 5); ctx.lineTo(pk.x + 4, pk.y); ctx.lineTo(pk.x, pk.y + 5); ctx.lineTo(pk.x - 4, pk.y); ctx.closePath(); ctx.fill();
    }
  }

  /* ---------- screen-space overlays ---------- */
  function drawJoystick() {
    var J = Input.J;
    if (!J.active) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var dx = J.cx - J.ox, dy = J.cy - J.oy, d = Math.hypot(dx, dy) || 1, m = Math.min(d, J.r);
    ctx.strokeStyle = 'rgba(160,230,255,0.22)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(J.ox, J.oy, J.r, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(160,230,255,0.16)';
    ctx.beginPath(); ctx.arc(J.ox + dx / d * m, J.oy + dy / d * m, 24, 0, TAU); ctx.fill();
  }

  function drawCompass(G, t, hudC) {
    if (!(G.S.compass > 0)) return;
    var s = G.ship, best = null, bd = 1e9, i, e;
    for (i = 0; i < G.ents.length; i++) {
      e = G.ents[i];
      if (e.k !== 'boss' && !e.ore) continue;
      var d = Math.hypot(e.x - s.x, e.y - s.y);
      if (e.k === 'boss') d *= 0.3;
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return;
    var sc = Game.view.scale, sx = (best.x - G.cam.x) * sc + W / 2, sy = (best.y - G.cam.y) * sc + H / 2;
    if (sx > 30 && sx < W - 30 && sy > 110 && sy < H - 30) return; // on screen already
    var a = Math.atan2(best.y - s.y, best.x - s.x), rx = W / 2 - 46, ry = H / 2 - 120;
    var px = W / 2 + Math.cos(a) * Math.min(rx, Math.abs(rx / (Math.cos(a) || 1e-6))), py = H / 2 + 20 + Math.sin(a) * Math.min(ry, Math.abs(ry / (Math.sin(a) || 1e-6)));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save(); ctx.translate(px, py); ctx.rotate(a);
    ctx.fillStyle = best.k === 'boss' ? '#ff8a5c' : '#ffd45e';
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 6);
    ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-8, 8); ctx.lineTo(-4, 0); ctx.lineTo(-8, -8); ctx.closePath(); ctx.fill();
    ctx.restore(); ctx.globalAlpha = 1;
  }

  function drawVignette(G, t) {
    var s = G.ship, low = s.hp / s.mhp;
    if (low > 0.3) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var a = (0.3 - low) / 0.3 * (0.18 + 0.1 * Math.sin(t * 6));
    var g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(255,40,40,0)'); g.addColorStop(1, 'rgba(255,40,40,' + a + ')');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  /* ---------- public ---------- */
  HH.Render = {
    init: function (canvas) {
      cv = canvas; ctx = cv.getContext('2d');
      HH.Render.resize();
    },

    resize: function () {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = window.innerWidth; H = window.innerHeight;
      cv.width = Math.floor(W * dpr); cv.height = Math.floor(H * dpr);
      cv.style.width = W + 'px'; cv.style.height = H + 'px';
      Game.setView(W, H);
    },

    hangar: function (t) {
      var cx = Math.cos(t * 0.05) * 600 + t * 18, cy = Math.sin(t * 0.04) * 500 + t * 6;
      drawBackdrop(cx, cy, 1, t);
      // distant gold sun, upper right
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      drawGlow('#ffb347', W * 0.82, H * 0.1, Math.max(W, H) * 0.5, 0.35);
      drawGlow('#ffe27a', W * 0.82, H * 0.1, Math.max(W, H) * 0.16, 0.8);
      ctx.globalCompositeOperation = 'source-over';
    },

    run: function (G, t) {
      var v = Game.view, sc = v.scale, hudC = HH.HUDS[HH.Meta.hud()].c;
      drawBackdrop(G.cam.x, G.cam.y, sc, t);
      var shx = (Math.random() - 0.5) * G.shake, shy = (Math.random() - 0.5) * G.shake;
      ctx.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * (W / 2 - G.cam.x * sc + shx), dpr * (H / 2 - G.cam.y * sc + shy));
      var i, e, b;

      for (i = 0; i < G.pick.length; i++) drawPickup(G.pick[i], t);

      for (i = 0; i < G.ents.length; i++) {
        e = G.ents[i];
        if (e.k === 'ast') drawAsteroid(e, G, t, hudC);
        else if (e.k === 'drone') drawDrone(e, t);
        else if (e.k === 'crate') drawCrate(e, t);
        else drawBoss(e, t);
      }

      // target reticle
      if (G.target && !G.target.dead) {
        var tg = G.target;
        ctx.strokeStyle = rgba(hudC, 0.55); ctx.lineWidth = 1.6;
        var rr = tg.r + 8 + Math.sin(t * 8) * 1.5;
        for (i = 0; i < 4; i++) {
          var a0 = i * TAU / 4 + t * 1.2;
          ctx.beginPath(); ctx.arc(tg.x, tg.y, rr, a0, a0 + 0.8); ctx.stroke();
        }
      }

      for (i = 0; i < G.pets.length; i++) drawPet(G.pets[i], t);
      drawShip(G, t, hudC);

      // projectiles
      ctx.globalCompositeOperation = 'lighter';
      for (i = 0; i < G.bullets.length; i++) {
        b = G.bullets[i];
        ctx.strokeStyle = b.rail ? '#c9a6ff' : b.crit ? '#ffe27a' : hudC;
        ctx.lineWidth = b.rail ? 5 : 3; ctx.lineCap = 'round';
        var tl = b.rail ? 0.05 : 0.025;
        ctx.beginPath(); ctx.moveTo(b.x - b.vx * tl, b.y - b.vy * tl); ctx.lineTo(b.x, b.y); ctx.stroke();
        drawGlow(b.rail ? '#b28aff' : b.crit ? '#ffe27a' : '#5ff3ff', b.x, b.y, b.rail ? 16 : 11, 0.7);
      }
      for (i = 0; i < G.eshots.length; i++) {
        b = G.eshots[i];
        drawGlow('#ff6a8a', b.x, b.y, 22, 0.8);
        ctx.fillStyle = '#ffd0da'; ctx.beginPath(); ctx.arc(b.x, b.y, 3.5, 0, TAU); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';

      // particles
      for (i = 0; i < G.parts.length; i++) {
        var p = G.parts[i], a = Math.max(0, p.life / p.max);
        if (p.add) ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a;
        ctx.fillStyle = p.col;
        var sz = p.size * (p.trail ? a : 0.6 + 0.4 * a);
        ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
        if (p.add) ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;

      // shock rings
      for (i = 0; i < G.rings.length; i++) {
        var r = G.rings[i], k = r.t / r.life;
        ctx.strokeStyle = r.col; ctx.globalAlpha = (1 - k) * (r.nova ? 0.8 : 0.6);
        ctx.lineWidth = r.nova ? 4 : 2.4;
        ctx.beginPath(); ctx.arc(r.x, r.y, r.r + (r.max - r.r) * Math.sqrt(k), 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // floating text
      ctx.textAlign = 'center';
      for (i = 0; i < G.texts.length; i++) {
        var tx = G.texts[i];
        ctx.globalAlpha = 1 - tx.t / 0.9;
        ctx.font = '800 ' + tx.size + 'px system-ui, sans-serif';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,10,0.7)';
        ctx.strokeText(tx.txt, tx.x, tx.y - tx.t * 38);
        ctx.fillStyle = tx.col; ctx.fillText(tx.txt, tx.x, tx.y - tx.t * 38);
      }
      ctx.globalAlpha = 1;

      drawCompass(G, t, hudC);
      drawVignette(G, t);
      drawJoystick();
    }
  };
})();
