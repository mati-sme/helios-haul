'use strict';
/* node sim/sim.js --profile engaged|idle --hours 10 --seed 1 --out sim/results/x.json [--dt 0.05] [--partCap 0] [--entCap N] */
var fs = require('fs');
var path = require('path');
var H = require('./headless');

var argv = {};
process.argv.slice(2).forEach(function (a, i, arr) {
  if (a.indexOf('--') === 0) argv[a.slice(2)] = arr[i + 1] && arr[i + 1].indexOf('--') !== 0 ? arr[i + 1] : '1';
});
var PROFILE = argv.profile || 'engaged';
var HOURS = +(argv.hours || 10);
var SEED = +(argv.seed || 1);
var DT = +(argv.dt || 0.05);
var OUT = argv.out || path.join(__dirname, 'results', PROFILE + '-' + SEED + '.json');
var OVERHEAD = +(argv.overhead || 12);
var ABSENCE = +(argv.absence || 1200);
var END = HOURS * 3600;

var ECON = {};
(argv.econ || '').split(',').forEach(function (kv) { var p = kv.split('='); if (p[0]) ECON[p[0]] = +p[1]; });
var world = H.createWorld({
  seed: SEED, partCap: argv.partCap == null ? 0 : +argv.partCap,
  entCap: argv.entCap == null ? Infinity : +argv.entCap
});
var Meta = world.Meta, Save = world.Save, HH = world.HH;
Object.keys(ECON).forEach(function (k) { HH.ECON[k] = ECON[k]; });
var prev0 = null;

var INCOME_FX = ['damage', 'fireRate', 'multishot', 'scrapValue', 'creditMult', 'scrapMult', 'magnet', 'runTime', 'tierValue', 'oreMult', 'droneValue', 'bossValue', 'idleMult', 'salvage', 'offlineHours'];
function isIncome(n) {
  if (n.id === 'anchor') return true; // progression gate: a real player buys it the moment it is affordable
  for (var k in n.fx) if (INCOME_FX.indexOf(k) >= 0) return true;
  return false;
}

var t = 0;
var runs = [], purchases = [], ascents = [], gapsAt = [], rewardAt = [], questClaims = 0, rankUps = 0, lastRank = 0;
var lastBuyT = 0;              // last upgrade purchase / ascension (policy clock)
var lastPurchaseT = 0;         // last upgrade or prestige purchase (stall metric clock)
var offlineTotal = 0, offlineApi = null, claimApis = [];
var milestones = {};
var maxLevelsAll = HH.UPGRADES.reduce(function (a, n) { return a + n.max; }, 0);
var preSpent = 0;
var stalledTime = 0, maxedTime = 0, flownTime = 0;
var recentCredits = [];

function mark(name, cond) { if (cond && milestones[name] == null) milestones[name] = Math.round(t); }

function detectApis() {
  // v2 API: Meta.offlineEarnings(sec) is pure, Meta.claimOffline(sec) grants; Meta.quests()/claimQuest(i)
  if (typeof Meta.claimOffline === 'function') { offlineApi = 'claimOffline'; claimApis.push('claimOffline'); }
  else ['offlineEarnings', 'idleRate'].forEach(function (k) { if (typeof Meta[k] === 'function' && !offlineApi) offlineApi = k; });
  if (typeof Meta.claimQuest === 'function') claimApis.push('claimQuest');
}

function checkMilestones() {
  var s = Save.data;
  mark('first_purchase', purchases.length > 0);
  [10, 25, 50, 100, 150].forEach(function (n) { mark('levels_' + n, s.stats.buys >= n); });
  mark('anchor_built', s.stats.anchored > 0 || (s.upg.anchor || 0) > 0);
  [1, 2, 5, 10].forEach(function (n) { mark('ascension_' + n, s.ascensions >= n); });
  [['1K', 1e3], ['10K', 1e4], ['100K', 1e5], ['1M', 1e6], ['10M', 1e7]].forEach(function (p) { mark('scrap_' + p[0], s.lifetimeScrap >= p[1]); });
  mark('all_goals', Meta.currentGoal() === null);
  mark('upgrade_tree_maxed', Meta.totalLevels() >= maxLevelsAll);
}

function recordBuy(kind, id, level, cost) {
  purchases.push({ t: Math.round(t), kind: kind, id: id, level: level, cost: cost });
  gapsAt.push(t);
  rewardAt.push(t);
  var rk = Meta.stats().rank;
  if (rk > lastRank) { rankUps += rk - lastRank; rewardAt.push(t); }
  lastRank = rk;
  lastPurchaseT = t;
  if (kind === 'upg') lastBuyT = t;
  checkMilestones();
}

function claimAll() {
  var did = false, g, n, q;
  while ((g = Meta.claimGoal())) { did = true; rewardAt.push(t); checkMilestones(); }
  if (Meta.quests) {
    for (n = 0; n < 30; n++) {
      var qs = Meta.quests(), idx = -1;
      for (q = 0; q < qs.length; q++) if (qs[q].ready) { idx = q; break; }
      if (idx < 0) break;
      if (Meta.claimQuest(idx)) { questClaims++; rewardAt.push(t); did = true; }
    }
  }
  return did;
}

function affordableUpgrades() {
  var out = [];
  HH.UPGRADES.forEach(function (n) {
    var st = Meta.nodeState('upg', n);
    if (st.status === 'afford') out.push({ n: n, cost: st.cost, level: st.level });
  });
  return out;
}

// a human saves for the Solar Anchor once it is within reach instead of spending every credit on cheaper nodes
function savingForAnchor() {
  if (Meta.anchorBuilt()) return false;
  var a = Meta.upgById.anchor;
  if (!a || !Meta.reqMet('upg', a)) return false;
  return Save.data.credits + 1 * (recentCredits.length ? recentCredits[recentCredits.length - 1] : 0) >= Meta.cost('upg', a);
}

function buyUpgrades() {
  var did = false, list, pick;
  for (;;) {
    list = affordableUpgrades();
    if (savingForAnchor()) list = list.filter(function (x) { return x.n.id === 'anchor'; });
    if (!list.length) break;
    if (PROFILE === 'engaged') {
      list.sort(function (a, b) { return (isIncome(a.n) ? 0 : 1) - (isIncome(b.n) ? 0 : 1) || a.cost - b.cost; });
    } else list.sort(function (a, b) { return a.cost - b.cost; });
    pick = list[0];
    var r = Meta.buy('upg', pick.n.id);
    if (!r.ok) break;
    recordBuy('upg', pick.n.id, pick.level + 1, pick.cost);
    did = true;
  }
  return did;
}

function buyPrestige() {
  var did = false, list;
  for (;;) {
    list = [];
    HH.PRESTIGE.forEach(function (n) {
      var st = Meta.nodeState('pre', n);
      if (st.status === 'afford') list.push({ n: n, cost: st.cost });
    });
    if (!list.length) break;
    list.sort(function (a, b) { return a.cost - b.cost; });
    var r = Meta.buy('pre', list[0].n.id);
    if (!r.ok) break;
    preSpent += list[0].cost;
    recordBuy('pre', list[0].n.id, 1, list[0].cost);
    did = true;
  }
  return did;
}

function maybeAscend() {
  if (!Meta.canAscend()) return false;
  // follow the game's own recommendation (gain >= +50% of the current mark bonus); never ascend for a net loss
  var gain = Meta.marksPreview(), adv = Meta.ascendAdvice ? Meta.ascendAdvice() : { recommended: gain >= 1, incomePct: 1 };
  var go = adv.recommended && gain >= 1 && adv.incomePct >= 1;
  if (!go) return false;
  var peak = 0;
  runs.slice(-3).forEach(function (x) { if (x.cpm > peak) peak = x.cpm; });
  var got = Meta.ascend();
  if (got == null) return false;
  ascents.push({ t: Math.round(t), gain: got, run: runs.length, prevPeak: Math.round(peak * 10) / 10, recoverSecs: null });
  lastBuyT = t;
  checkMilestones();
  return true;
}

function manage() {
  var ascended = false, changed = true, guard = 0;
  while (changed && guard++ < 50) {
    changed = claimAll();
    changed = buyUpgrades() || changed;
    changed = buyPrestige() || changed;
    if (!ascended && maybeAscend()) { ascended = true; changed = true; }
  }
  checkMilestones();
  return ascended;
}

/* time-in-state: can we afford the cheapest remaining upgrade within the next 2 runs? */
function affordWithin2() {
  var cheapest = Infinity, any = false;
  HH.UPGRADES.forEach(function (n) {
    var st = Meta.nodeState('upg', n);
    if (st.status === 'maxed' || st.status === 'locked') return;
    any = true;
    if (st.cost < cheapest) cheapest = st.cost;
  });
  if (!any) return 'maxed';
  var inc = recentCredits.length ? recentCredits.reduce(function (a, b) { return a + b; }, 0) / recentCredits.length : 0;
  return Save.data.credits + 2 * inc >= cheapest ? 'ok' : 'stalled';
}

function progress(h) {
  var s = Save.data;
  process.stderr.write('[' + PROFILE + ' seed ' + SEED + '] hour ' + h + '/' + HOURS + ' | runs ' + runs.length +
    ' | buys ' + s.stats.buys + ' | asc ' + s.ascensions + ' | marks ' + s.marks + ' | lifetime ' + HH.fmt(s.lifetimeScrap) +
    ' | wall ' + ((Date.now() - wall0) / 1000).toFixed(1) + 's\n');
}

/* ---------- main loop ---------- */
detectApis();
var wall0 = Date.now(), nextHour = 1;
var ascJustNow = false;

while (t < END) {
  ascJustNow = ascJustNow || manage();
  var state = affordWithin2();

  var r = H.flyRun(world, PROFILE, DT);
  var S = r.summary;
  t += r.t + OVERHEAD;
  flownTime += r.t;
  if (state === 'stalled') stalledTime += r.t + OVERHEAD; else if (state === 'maxed') maxedTime += r.t + OVERHEAD;
  var s = Save.data;
  var cpm = S.credits / (Math.max(r.t, 1) / 60);
  recentCredits.push(S.credits); if (recentCredits.length > 3) recentCredits.shift();
  runs.push({
    t: Math.round(t), run: runs.length + 1, scrap: S.scrap, credits: S.credits, kills: S.kills,
    death: S.reason === 'breach', secs: Math.round(r.t * 10) / 10, cpm: Math.round(cpm * 10) / 10,
    pow: Math.round(r.pow * 1000) / 1000, damage: Math.round(r.damage * 100) / 100,
    rate: Math.round(r.rate * 100) / 100, levels: Meta.totalLevels(), marks: s.marks, asc: s.ascensions,
    fac: (function () { var S = Meta.stats(); return [S.incomeMult, S.pool, S.tierValue, S.oreMult, S.droneValue, S.damage, S.fireRate].map(function (v) { return +v.toPrecision(3); }); })(),
    htk: Math.round(r.htk * 100) / 100, vscale: Math.round(r.vscale * 100) / 100, ascBefore: ascJustNow
  });
  ascJustNow = false;
  var last = runs[runs.length - 1];
  ascents.forEach(function (a) {
    if (a.recoverSecs == null && a.run < runs.length && last.cpm >= a.prevPeak && last.t > a.t) a.recoverSecs = last.t - a.t;
  });
  checkMilestones();

  // a real player cashes out, spends in the hangar, THEN leaves
  ascJustNow = manage() || ascJustNow;
  if (offlineApi && PROFILE === 'idle') {
    var off = 0;
    try { off = Meta[offlineApi](ABSENCE) || 0; } catch (e) { off = 0; }
    offlineTotal += typeof off === 'number' ? off : 0;
    t += ABSENCE;
    ascJustNow = manage() || ascJustNow;
  }
  while (t >= nextHour * 3600 && nextHour <= HOURS) { progress(nextHour); nextHour++; }
}
manage();
t = Math.min(t, END);

/* ---------- metrics ---------- */
var nb = Math.ceil(HOURS);
var buyTimes = [0].concat(gapsAt).concat([END]);
var rwTimes = [0].concat(rewardAt).concat([END]).sort(function (a, b) { return a - b; });
var longestReward = 0;
for (var ri = 1; ri < rwTimes.length; ri++) longestReward = Math.max(longestReward, rwTimes[ri] - rwTimes[ri - 1]);
var gaps = [];
for (var i = 1; i < buyTimes.length; i++) gaps.push({ start: Math.round(buyTimes[i - 1]), len: Math.round(buyTimes[i] - buyTimes[i - 1]) });
var longest = gaps.reduce(function (a, g) { return g.len > a.len ? g : a; }, { start: 0, len: 0 });
var perHourGap = [];
for (var b = 0; b < nb; b++) {
  var lo = b * 3600, hi = Math.min(END, lo + 3600), mx = 0;
  gaps.forEach(function (g) {
    var ov = Math.min(g.start + g.len, hi) - Math.max(g.start, lo);
    if (ov > mx) mx = ov;
  });
  perHourGap.push(Math.round(mx));
}

var regressions = [], lastAscRun = -1;
runs.forEach(function (rn, idx) {
  if (rn.ascBefore) lastAscRun = idx;
  var win = runs.slice(Math.max(lastAscRun < 0 ? 0 : lastAscRun, idx - 5), idx);
  if (lastAscRun === idx || win.length < 3) return;
  var avg = win.reduce(function (a, x) { return a + x.cpm; }, 0) / win.length;
  if (avg > 0 && rn.cpm < 0.8 * avg) {
    regressions.push({ t: rn.t, run: rn.run, cpm: rn.cpm, avg: Math.round(avg * 10) / 10, death: rn.death, secs: rn.secs });
  }
});

var trend = [];
for (b = 0; b < nb; b++) {
  var rs = runs.filter(function (x) { return x.t >= b * 3600 && x.t < (b + 1) * 3600; });
  var n = rs.length || 1;
  trend.push({
    hour: b, runs: rs.length,
    cpm: Math.round(rs.reduce(function (a, x) { return a + x.cpm; }, 0) / n),
    kills: Math.round(rs.reduce(function (a, x) { return a + x.kills; }, 0) / n * 10) / 10,
    deaths: rs.filter(function (x) { return x.death; }).length,
    buys: purchases.filter(function (p) { return p.t >= b * 3600 && p.t < (b + 1) * 3600; }).length
  });
}

var s2 = Save.data;
var result = {
  config: { profile: PROFILE, hours: HOURS, seed: SEED, dt: DT, overhead: OVERHEAD, offlineApi: offlineApi, claimApis: claimApis, wallSeconds: (Date.now() - wall0) / 1000 },
  milestones: milestones,
  stall: {
    longestGap: longest, longestRewardGap: Math.round(longestReward), questClaims: questClaims, rankUps: rankUps, gapPerHour: perHourGap,
    gapsOver3min: gaps.filter(function (g) { return g.len > 180; }).map(function (g) { return g.start; }),
    gapsOver5min: gaps.filter(function (g) { return g.len > 300; }).map(function (g) { return g.start; }),
    regressions: regressions, regressionsNonDeath: regressions.filter(function (x) { return !x.death; }).length,
    trend: trend,
    fracNothingAffordable2Runs: Math.round(stalledTime / Math.max(1, t) * 1000) / 1000,
    fracTreeMaxed: Math.round(maxedTime / Math.max(1, t) * 1000) / 1000
  },
  offlineEarnings: offlineTotal,
  final: {
    runs: runs.length, credits: s2.credits, marks: s2.marks, ascensions: s2.ascensions, lifetimeScrap: s2.lifetimeScrap,
    buys: s2.stats.buys, levels: Meta.totalLevels(), maxLevels: maxLevelsAll, preNodes: Object.keys(s2.pre).length,
    preTotal: HH.PRESTIGE.length, deaths: runs.filter(function (x) { return x.death; }).length, flownHours: flownTime / 3600
  },
  ascents: ascents,
  ascRecovery: ascents.map(function (a) { return a.recoverSecs; }),
  runs: runs.map(function (x) { delete x.ascBefore; return x; }),
  purchases: purchases
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result));
process.stderr.write('wrote ' + OUT + ' (' + ((Date.now() - wall0) / 1000).toFixed(1) + 's wall)\n');
