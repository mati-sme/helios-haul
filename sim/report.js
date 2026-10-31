'use strict';
/* node sim/report.js a.json b.json ... — milestones and stall metrics side by side */
var fs = require('fs');
var path = require('path');

var files = process.argv.slice(2);
if (!files.length) { console.error('usage: node sim/report.js a.json [b.json ...]'); process.exit(1); }
var R = files.map(function (f) { return JSON.parse(fs.readFileSync(f, 'utf8')); });
var names = files.map(function (f) { return path.basename(f, '.json'); });

function dur(sec) {
  if (sec == null) return '—';
  var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = Math.round(sec % 60);
  return h ? h + 'h' + (m < 10 ? '0' : '') + m + 'm' : m + 'm' + (s < 10 ? '0' : '') + s + 's';
}
function fmt(n) {
  if (n == null) return '—';
  if (n >= 1e9) {
    var u = ['B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'], i = 0, v = n / 1e9;
    for (var a = 0; a < 26; a++) for (var b = 0; b < 26; b++) u.push(String.fromCharCode(97 + a, 97 + b));
    while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
    return v.toFixed(2) + u[i];
  }
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1) + 'K';
  return String(Math.round(n * 100) / 100);
}
function table(title, rows) {
  console.log('\n### ' + title + '\n');
  console.log('| metric | ' + names.join(' | ') + ' |');
  console.log('|---|' + names.map(function () { return '---:'; }).join('|') + '|');
  rows.forEach(function (r) { console.log('| ' + r[0] + ' | ' + r.slice(1).join(' | ') + ' |'); });
}
function each(fn) { return R.map(fn); }

var MS = [['first_purchase', 'first purchase'], ['levels_10', '10 levels'], ['levels_25', '25 levels'], ['levels_50', '50 levels'],
  ['levels_100', '100 levels'], ['levels_150', '150 levels'], ['anchor_built', 'Solar Anchor'], ['ascension_1', '1st ascension'],
  ['ascension_2', '2nd ascension'], ['ascension_5', '5th ascension'], ['ascension_10', '10th ascension'], ['scrap_1K', '1K scrap'],
  ['scrap_10K', '10K scrap'], ['scrap_100K', '100K scrap'], ['scrap_1M', '1M scrap'], ['scrap_10M', '10M scrap'],
  ['all_goals', 'all goals claimed'], ['upgrade_tree_maxed', 'upgrade tree maxed']];

table('Run', [
  ['profile / seed / hours'].concat(each(function (r) { return r.config.profile + ' / ' + r.config.seed + ' / ' + r.config.hours; })),
  ['runs'].concat(each(function (r) { return r.final.runs; })),
  ['deaths (breach)'].concat(each(function (r) { return r.final.deaths + ' (' + Math.round(100 * r.final.deaths / Math.max(1, r.final.runs)) + '%)'; })),
  ['lifetime scrap'].concat(each(function (r) { return fmt(r.final.lifetimeScrap); })),
  ['ascensions / marks held'].concat(each(function (r) { return r.final.ascensions + ' / ' + r.final.marks; })),
  ['prestige nodes'].concat(each(function (r) { return r.final.preNodes + '/' + r.final.preTotal; })),
  ['upgrade levels now / max / lifetime buys'].concat(each(function (r) { return r.final.levels + '/' + r.final.maxLevels + ' / ' + r.final.buys; })),
  ['offline earnings'].concat(each(function (r) { return fmt(r.offlineEarnings) + (r.config.offlineApi ? '' : ' (no API)'); }))
]);
table('Milestones (sim time)', MS.map(function (m) { return [m[1]].concat(each(function (r) { return dur(r.milestones[m[0]]); })); }));

var maxH = Math.max.apply(null, R.map(function (r) { return r.stall.gapPerHour.length; }));
var stallRows = [
  ['longest purchase gap'].concat(each(function (r) { return dur(r.stall.longestGap.len) + ' @ ' + dur(r.stall.longestGap.start); })),
  ['gaps > 3 min'].concat(each(function (r) { return r.stall.gapsOver3min.length; })),
  ['gaps > 5 min'].concat(each(function (r) { return r.stall.gapsOver5min.length + (r.stall.gapsOver5min.length ? ' (first @ ' + dur(r.stall.gapsOver5min[0]) + ')' : ''); })),
  ['income regressions (>20% dip)'].concat(each(function (r) { return r.stall.regressions.length + ' (' + r.stall.regressionsNonDeath + ' w/o death)'; })),
  ['time nothing affordable in 2 runs'].concat(each(function (r) { return Math.round(r.stall.fracNothingAffordable2Runs * 100) + '%'; })),
  ['time tree fully maxed'].concat(each(function (r) { return Math.round(r.stall.fracTreeMaxed * 100) + '%'; }))
];
for (var h = 0; h < maxH; h++) {
  stallRows.push(['hour ' + h + '-' + (h + 1) + ': longest gap / cr·min⁻¹ / kills·run⁻¹ / buys'].concat(each(function (r) {
    var tr = r.stall.trend[h];
    return tr ? dur(r.stall.gapPerHour[h]) + ' / ' + fmt(tr.cpm) + ' / ' + tr.kills + ' / ' + tr.buys : '—';
  })));
}
table('Stall metrics', stallRows);
