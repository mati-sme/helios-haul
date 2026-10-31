'use strict';
/* node sim/migrate-test.js — v1 saves must load through the v2 Save.load() with nothing lost */
var vm = require('vm');
var cp = require('child_process');
var H = require('./headless');

// the v1 node tables come straight from git HEAD's data.js, so fixtures match the real v1 schema
function loadV1Data() {
  var src = cp.execSync('git show HEAD:js/data.js', { cwd: H.ROOT, encoding: 'utf8' });
  var ctx = vm.createContext({ console: console });
  vm.runInContext('this.window = this;', ctx);
  vm.runInContext(src, ctx);
  return vm.runInContext('window.HH', ctx);
}
var V1 = loadV1Data();

function v1Base() {
  return {
    v: 1, credits: 0, marks: 0, lifetimeScrap: 0, ascScrap: 0, ascSpent: 0, ascensions: 0, runs: 0, bestScrap: 0,
    upg: {}, pre: {}, petsOwned: [], petsEquipped: [], goalsClaimed: {},
    stats: { kills: 0, crates: 0, drones: 0, bosses: 0, buys: 0, runsDone: 0, anchored: 0 },
    settings: { kids: false, mute: false, music: true, vol: 0.7, joySide: 'left', weapon: 'bolts', trail: 'cyan', hud: 'cyan' },
    lastRun: null, seenIntro: false
  };
}
function sumCost(ids) { var t = 0; V1.PRESTIGE.forEach(function (n) { if (ids[n.id]) t += n.cost; }); return t; }

var fixtures = {};
fixtures.fresh = v1Base();

(function () {
  var s = v1Base(), n = 0;
  V1.UPGRADES.forEach(function (u) { if (n < 20 && u.req.every(function (r) { return s.upg[r]; })) { s.upg[u.id] = Math.min(u.max, 3); n += s.upg[u.id]; } });
  s.credits = 420; s.lifetimeScrap = 2600; s.runs = 9; s.bestScrap = 480; s.ascScrap = 2600; s.ascSpent = 900;
  s.stats = { kills: 220, crates: 6, drones: 4, bosses: 0, buys: n, runsDone: 5, anchored: 0 };
  s.goalsClaimed = { g_first: 1, g_scrap: 1, g_buy3: 1, g_run: 1 };
  fixtures.early = s;
})();

(function () {
  var s = v1Base();
  V1.UPGRADES.forEach(function (u) { if (u.branch === 'cannon' || u.branch === 'value' || u.branch === 'qol') s.upg[u.id] = Math.min(u.max, 3); });
  s.upg.anchor = 1;
  ['core', 'fleet1', 'fleet2', 'vault1', 'vault2', 'vault3', 'chronos1', 'pets1', 'sector1', 'cosmetic1'].forEach(function (id) { s.pre[id] = 1; });
  s.petsOwned = ['pipflare']; s.petsEquipped = ['pipflare'];
  s.credits = 15000; s.marks = 7; s.ascensions = 1; s.lifetimeScrap = 400000; s.runs = 60; s.bestScrap = 9000; s.ascScrap = 50000; s.ascSpent = 20000;
  s.stats = { kills: 3000, crates: 40, drones: 30, bosses: 6, buys: 90, runsDone: 40, anchored: 1 };
  s.goalsClaimed = {}; ['g_first', 'g_scrap', 'g_buy3', 'g_run', 'g_crate', 'g_drone', 'g_buy15', 'g_boss', 'g_anchor', 'g_asc'].forEach(function (g) { s.goalsClaimed[g] = 1; });
  fixtures.mid = s;
})();

(function () {
  var s = v1Base(), n = 0, ids = V1.PRESTIGE.map(function (p) { return p.id; });
  V1.UPGRADES.forEach(function (u) { s.upg[u.id] = u.max; n += u.max; });
  ids.slice(0, 69).forEach(function (id) { s.pre[id] = 1; });
  s.petsOwned = ['pipflare', 'dustmoth', 'orbitkit', 'glimnewt']; s.petsEquipped = ['pipflare', 'orbitkit'];
  s.credits = 8.5e6; s.marks = 640; s.ascensions = 26; s.lifetimeScrap = 2.4e8; s.runs = 900; s.bestScrap = 6.1e5;
  s.ascScrap = 4e6; s.ascSpent = 3e6;
  s.stats = { kills: 120000, crates: 2200, drones: 1900, bosses: 400, buys: 4000, runsDone: 800, anchored: 1 };
  s.goalsClaimed = {}; V1.GOALS.forEach(function (g) { s.goalsClaimed[g.id] = 1; });
  s.settings.weapon = 'rail'; s.settings.trail = 'gold'; s.settings.kids = true;
  fixtures.late = s;
})();

var fails = 0;
function check(name, ok, detail) {
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (ok ? '' : '  -> ' + detail));
  if (!ok) fails++;
}
function hasNaN(o, path) {
  if (typeof o === 'number') return isFinite(o) ? null : path;
  if (o && typeof o === 'object') {
    for (var k in o) { var r = hasNaN(o[k], path + '.' + k); if (r) return r; }
  }
  return null;
}

Object.keys(fixtures).forEach(function (name) {
  var old = JSON.parse(JSON.stringify(fixtures[name])), raw = JSON.stringify(old);
  var w = H.createWorld({ seed: 7 });
  vm.runInContext('localStorage.setItem(' + JSON.stringify(w.HH.SAVE_KEY) + ',' + JSON.stringify(raw) + ')', w.ctx);
  var s = w.Save.load(), HHs = w.HH;
  w.Meta.dirty();
  var tag = '[' + name + '] ';

  check(tag + 'version is 2', s.v === 2, 'v=' + s.v);
  check(tag + 'raw v1 backed up', vm.runInContext('localStorage.getItem("helios-haul-save-v1-backup")', w.ctx) === raw, 'backup missing or different');
  var lost = [];
  Object.keys(old.upg).forEach(function (id) { if (!(s.upg[id] >= old.upg[id])) lost.push('upg.' + id); });
  Object.keys(old.pre).forEach(function (id) { if (!s.pre[id]) lost.push('pre.' + id); });
  old.petsOwned.forEach(function (p) { if (s.petsOwned.indexOf(p) < 0) lost.push('pet.' + p); });
  old.petsEquipped.forEach(function (p) { if (s.petsEquipped.indexOf(p) < 0) lost.push('equipped.' + p); });
  Object.keys(old.goalsClaimed).forEach(function (g) { if (!s.goalsClaimed[g]) lost.push('goal.' + g); });
  check(tag + 'no upgrade level / prestige node / pet / goal lost', !lost.length, lost.join(','));
  var dec = [];
  ['credits', 'marks', 'ascensions', 'lifetimeScrap', 'runs', 'bestScrap', 'ascScrap'].forEach(function (k) { if (!(s[k] >= old[k])) dec.push(k); });
  Object.keys(old.stats).forEach(function (k) { if (!(s.stats[k] >= old.stats[k])) dec.push('stats.' + k); });
  check(tag + 'no credit / mark / stat decreased', !dec.length, dec.join(','));
  check(tag + 'settings kept', s.settings.weapon === old.settings.weapon && s.settings.trail === old.settings.trail && s.settings.kids === old.settings.kids, JSON.stringify(s.settings));
  check(tag + 'no NaN / Infinity in save', !hasNaN(s, 'save'), hasNaN(s, 'save'));
  var S = w.Meta.stats();
  check(tag + 'derived stats finite', !hasNaN(S, 'S') && isFinite(w.Game.derive().damage), hasNaN(S, 'S'));
  check(tag + 'upgrade bonus gift recorded', s.gift && s.gift.credits > 0, JSON.stringify(s.gift));
  check(tag + 'lifetime marks cover held + spent', s.marksLifetime >= old.marks, s.marksLifetime);

  // can start a run and cash out
  var ok = true, err = '';
  try {
    w.Game.start();
    for (var i = 0; i < 200; i++) w.Game.update(0.05);
    w.Game.finish('quit');
    w.Game.toHangar();
  } catch (e) { ok = false; err = e.stack; }
  check(tag + 'can start and finish a run', ok && w.Save.data.runs === old.runs + 1, err);

  // can buy something
  w.Save.data.credits += 1e9; w.Meta.dirty();
  var bought = null;
  HHs.UPGRADES.forEach(function (u) {
    if (bought) return;
    var st = w.Meta.nodeState('upg', u);
    if (st.status === 'afford') { var r = w.Meta.buy('upg', u.id); if (r.ok) bought = u.id; }
  });
  check(tag + 'can buy an upgrade', !!bought, 'nothing affordable');
  check(tag + 'save still NaN-free after run and buy', !hasNaN(w.Save.data, 'save'), hasNaN(w.Save.data, 'save'));

  // export/import both versions
  var wi = H.createWorld({ seed: 3 });
  var r1 = wi.Save.importJSON(JSON.stringify({ game: 'helios-haul', save: old }));
  check(tag + 'import accepts v1 export', r1.ok && wi.Save.data.v === 2 && wi.Save.data.marks >= old.marks, JSON.stringify(r1));
  var r2 = wi.Save.importJSON(wi.Save.exportJSON());
  check(tag + 'import accepts v2 export', r2.ok && wi.Save.data.v === 2, JSON.stringify(r2));
});

console.log(fails ? '\n' + fails + ' check(s) FAILED' : '\nAll migration checks passed');
process.exit(fails ? 1 : 0);
