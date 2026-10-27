/* Helios Haul — invisible floating joystick (bottom-left) + keyboard fallback */
(function () {
  'use strict';
  var HH = window.HH = window.HH || {};

  var RADIUS = 62;       // css px of full deflection
  var DEAD = 0.08;
  var keys = {};
  var el = null, enabled = false, side = 'left';
  var pid = null;
  var J = { active: false, ox: 0, oy: 0, cx: 0, cy: 0, r: RADIUS };

  function inZone(x, y) {
    var w = el.clientWidth, h = el.clientHeight;
    if (y < h * 0.22) return false;
    return side === 'left' ? x < w * 0.64 : x > w * 0.36;
  }

  function down(e) {
    if (!enabled || J.active) return;
    var rect = el.getBoundingClientRect();
    var x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (!inZone(x, y)) return;
    pid = e.pointerId;
    J.active = true;
    J.ox = J.cx = x; J.oy = J.cy = y;
    try { el.setPointerCapture(pid); } catch (err) { /* ignore */ }
    e.preventDefault();
  }

  function move(e) {
    if (!J.active || e.pointerId !== pid) return;
    var rect = el.getBoundingClientRect();
    var x = e.clientX - rect.left, y = e.clientY - rect.top;
    var dx = x - J.ox, dy = y - J.oy, d = Math.hypot(dx, dy);
    // dragging far past the ring drags the origin along (floating stick)
    if (d > RADIUS * 1.5) {
      var k = (d - RADIUS * 1.5) / d;
      J.ox += dx * k; J.oy += dy * k;
    }
    J.cx = x; J.cy = y;
    e.preventDefault();
  }

  function up(e) {
    if (e && e.pointerId !== pid) return;
    J.active = false; pid = null;
  }

  function keyVec() {
    var x = 0, y = 0;
    if (keys.ArrowLeft || keys.a || keys.A) x -= 1;
    if (keys.ArrowRight || keys.d || keys.D) x += 1;
    if (keys.ArrowUp || keys.w || keys.W) y -= 1;
    if (keys.ArrowDown || keys.s || keys.S) y += 1;
    var m = Math.hypot(x, y);
    return m ? { x: x / m, y: y / m, mag: 1 } : null;
  }

  HH.Input = {
    J: J,
    attach: function (canvas) {
      el = canvas;
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      window.addEventListener('keydown', function (e) {
        if (!enabled) return;
        keys[e.key] = true;
        if (e.key.indexOf('Arrow') === 0 || e.key === ' ') e.preventDefault();
      });
      window.addEventListener('keyup', function (e) { keys[e.key] = false; });
      window.addEventListener('blur', function () { keys = {}; up(); });
    },
    enable: function (on, joySide) {
      enabled = !!on;
      side = joySide === 'right' ? 'right' : 'left';
      keys = {};
      up();
    },
    setSide: function (s) { side = s === 'right' ? 'right' : 'left'; },
    // current stick vector, y down
    vec: function () {
      if (J.active) {
        var dx = J.cx - J.ox, dy = J.cy - J.oy, d = Math.hypot(dx, dy);
        var m = Math.min(1, d / RADIUS);
        if (m < DEAD) return { x: 0, y: 0, mag: 0 };
        // ease the response so small nudges stay precise
        var mag = Math.pow(m, 0.85);
        return { x: dx / d, y: dy / d, mag: mag };
      }
      return keyVec() || { x: 0, y: 0, mag: 0 };
    }
  };
})();
