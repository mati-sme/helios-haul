'use strict';
/* Helios Haul — headless harness: loads the REAL game scripts into a vm context and flies a bot pilot. */
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var SKIP = { 'main.js': 1, 'render.js': 1, 'tree.js': 1, 'input.js': 1, 'audio.js': 1 };
var FALLBACK_ORDER = ['data.js', 'save.js', 'game.js'];

function noop() {}

function noopProxy() {
  return new Proxy(function () {}, {
    get: function (t, p) { return p === 'then' || typeof p === 'symbol' ? undefined : noop; },
    apply: noop
  });
}

function scriptList(root) {
  var out = [];
  try {
    var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    var re = /<script[^>]*\ssrc=["']([^"']+)["']/g, m;
    while ((m = re.exec(html))) {
      var src = m[1].split('?')[0];
      if (/^(https?:)?\/\//.test(src) || !/\.js$/.test(src) || src.indexOf('js/') !== 0) continue;
      if (SKIP[path.basename(src)]) continue;
      out.push(src);
    }
  } catch (e) { /* fall through */ }
  if (!out.length) out = FALLBACK_ORDER.map(function (f) { return 'js/' + f; });
  return out;
}

var MULBERRY = '(function(seed){var a=seed>>>0;Math.random=function(){a=(a+0x6D2B79F5)>>>0;var t=a;' +
  't=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};})';

/**
 * createWorld({seed, root, viewW, viewH, partCap, entCap}) -> world
 * partCap: cosmetic arrays (parts/texts/rings) trimmed to this length each frame (default 0 = none kept).
 * entCap: if finite, farthest entities beyond the cap are dropped each frame (default Infinity = game's own cap).
 */
function createWorld(opts) {
  opts = opts || {};
  var root = opts.root || ROOT;
  var store = {};
  var vec = { x: 0, y: 0, mag: 0 };
  var clock = 0;
  var el = function () { return noopProxy(); };
  var sandbox = {
    console: console, setTimeout: noop, clearTimeout: noop, setInterval: noop, clearInterval: noop,
    localStorage: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; },
      clear: function () { store = {}; }
    },
    navigator: {},
    document: {
      getElementById: function () { return null; }, querySelector: function () { return null; },
      querySelectorAll: function () { return []; }, createElement: el, addEventListener: noop,
      body: noopProxy(), documentElement: noopProxy()
    },
    performance: { now: function () { return clock += 16; } },
    requestAnimationFrame: function () { return 0; },
    cancelAnimationFrame: noop,
    addEventListener: noop, removeEventListener: noop
  };
  var ctx = vm.createContext(sandbox);
  vm.runInContext('this.window = this; this.self = this;', ctx);
  vm.runInContext(MULBERRY, ctx)(opts.seed == null ? 1 : opts.seed);
  vm.runInContext('window.HH = window.HH || {};', ctx);
  var HH = vm.runInContext('window.HH', ctx);
  HH.Audio = noopProxy();
  HH.Input = { vec: function () { return vec; }, enable: noop, setSide: noop };
  HH.Tree = HH.Tree || noopProxy();
  HH.Render = HH.Render || noopProxy();

  var loaded = [], errors = [];
  scriptList(root).forEach(function (rel) {
    var file = path.join(root, rel);
    try {
      vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: rel });
      loaded.push(rel);
    } catch (e) { errors.push(rel + ': ' + (e && e.message)); }
  });
  if (errors.length) throw new Error('headless load failed: ' + errors.join('; '));

  var Game = HH.Game;
  Game.setView(opts.viewW || 390, opts.viewH || 844);

  return {
    ctx: ctx, HH: HH, Game: Game, Save: HH.Save, Meta: HH.Meta, vec: vec, loaded: loaded,
    partCap: opts.partCap == null ? 0 : opts.partCap,
    entCap: opts.entCap == null ? Infinity : opts.entCap
  };
}

/* ---------- bot pilot ---------- */
var KIND_W = { ast: 1, crate: 1.4, drone: 1.1, boss: 0.9 };

function pilot(G, vec, profile) {
  if (profile !== 'engaged') { vec.x = 0; vec.y = 0; vec.mag = 0; return; }
  var s = G.ship, i, e, dx, dy, d, hx = 0, hy = 0;

  // 1. pickups within ~250 px, nearest first (heal only when hurt)
  var pk = null, pd = 250, p;
  for (i = 0; i < G.pick.length; i++) {
    p = G.pick[i];
    if (p.type === 'heal' && s.hp > s.mhp * 0.7) continue;
    d = Math.hypot(p.x - s.x, p.y - s.y);
    if (d < pd) { pd = d; pk = p; }
  }
  if (pk) { hx += (pk.x - s.x) / (pd || 1) * 1.5; hy += (pk.y - s.y) / (pd || 1) * 1.5; }

  // 2. best target by value / distance
  var best = null, bs = 0, bd = 0;
  for (i = 0; i < G.ents.length; i++) {
    e = G.ents[i];
    if (e.dead) continue;
    d = Math.hypot(e.x - s.x, e.y - s.y);
    var sc = (e.val || 1) * (KIND_W[e.k] || 1) / (d + 120) / (1 + (e.mhp || 1) / 600);
    if (sc > bs) { bs = sc; best = e; bd = d; }
  }
  if (best && !pk && bd - best.r > 170) {
    hx += (best.x - s.x) / bd; hy += (best.y - s.y) / bd;
  }

  // 3. separation from rocks, standoff from bosses
  for (i = 0; i < G.ents.length; i++) {
    e = G.ents[i];
    if (e.dead) continue;
    dx = s.x - e.x; dy = s.y - e.y; d = Math.hypot(dx, dy) || 1;
    var keep = e.k === 'boss' ? e.r + 240 : e.r + 45;
    if (d < keep) {
      var w = (1 - d / keep) * (e.k === 'boss' ? 3 : 2);
      hx += dx / d * w; hy += dy / d * w;
    }
  }

  // 4. dodge enemy shots predicted to pass close within ~0.6 s
  for (i = 0; i < G.eshots.length; i++) {
    var b = G.eshots[i], rx = b.x - s.x, ry = b.y - s.y, vv = b.vx * b.vx + b.vy * b.vy;
    if (vv < 1) continue;
    var t = -(rx * b.vx + ry * b.vy) / vv;
    if (t <= 0 || t > 0.6) continue;
    var cx = rx + b.vx * t, cy = ry + b.vy * t, cd = Math.hypot(cx, cy);
    if (cd > b.r + 34) continue;
    var vl = Math.sqrt(vv), px = -b.vy / vl, py = b.vx / vl;
    var side = -(px * cx + py * cy);
    if (Math.abs(side) < 1e-3) side = (b.x > s.x) === (b.y > s.y) ? 1 : -1;
    side = side > 0 ? 1 : -1;
    hx += px * side * 3; hy += py * side * 3;
  }

  var m = Math.hypot(hx, hy);
  if (m < 0.05) { vec.x = 0; vec.y = 0; vec.mag = 0; return; }
  vec.x = hx / m; vec.y = hy / m; vec.mag = Math.min(1, m);
}

/**
 * Fly one full run. Returns {t: seconds flown, summary, D, damage, pow}.
 * Leaves the game in 'hangar' state.
 */
function flyRun(world, profile, dt) {
  var Game = world.Game, vec = world.vec, G, guard = 0, trim = world.partCap, cap = world.entCap;
  dt = dt || 0.05;
  Game.start();
  G = Game.G;
  var D = G.D;
  while (Game.state === 'run' && guard++ < 60000) {
    pilot(G, vec, profile);
    Game.update(dt);
    G = Game.G;
    if (!G) break;
    if (G.parts.length > trim) G.parts.length = trim;
    if (G.texts.length > trim) G.texts.length = trim;
    if (G.rings.length > trim) G.rings.length = trim;
    if (G.ents.length > cap) {
      var s = G.ship;
      G.ents.sort(function (a, b) { return Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y); });
      G.ents.length = cap;
    }
  }
  var sum = world.Save.data.lastRun;
  vec.x = vec.y = vec.mag = 0;
  Game.toHangar();
  var T0 = world.HH.TIERS[0];
  return { t: sum.time, summary: sum, pow: D.pow, damage: D.damage, rate: D.rate, dur: D.dur,
    htk: T0.hp * (D.hpScale || D.pow) / D.damage, vscale: D.valueScale || 1 };
}

module.exports = { createWorld: createWorld, pilot: pilot, flyRun: flyRun, scriptList: scriptList, ROOT: ROOT };
