/* Helios Haul — quests, hangar salvage (idle + offline). Extends HH.Meta from game.js. */
(function () {
  'use strict';
  var HH = window.HH = window.HH || {};
  var Save = HH.Save, Meta = HH.Meta, E = HH.ECON;

  /* ---------- run value ---------- */
  // credits a typical full run pays right now (best of the last few runs); rewards are sized in "runs"
  Meta.runWorth = function () {
    var s = Save.data, best = 0, i;
    for (i = 0; i < s.recentCpm.length; i++) if (s.recentCpm[i] > best) best = s.recentCpm[i];
    return Math.max(60, Math.floor(best * Meta.runDuration() / 60));
  };

  /* ---------- quests: 3 rotating short goals ---------- */
  // kind: run quests keep the best single run, the others accumulate
  var QUEST_KINDS = {
    kills:   { run: true,  runs: 1.5, name: function (t) { return 'Destroy ' + t + ' targets in one run'; } },
    credits: { run: true,  runs: 2,   name: function (t) { return 'Earn ' + HH.fmt(t) + ' credits in one run'; } },
    buy:     { run: false, runs: 1.5, name: function (t) { return 'Buy ' + t + ' upgrade levels'; } },
    crates:  { run: false, runs: 1.5, name: function (t) { return 'Crack ' + t + ' cargo crate' + (t > 1 ? 's' : ''); } },
    drones:  { run: false, runs: 1.2, name: function (t) { return t > 1 ? 'Pop ' + t + ' scavenger drones' : 'Pop a scavenger drone'; } },
    bosses:  { run: false, runs: 3,   name: function (t) { return 'Break a mini-boss asteroid'; } }
  };
  var KIND_LIST = Object.keys(QUEST_KINDS);

  function questTarget(kind) {
    var s = Save.data;
    if (kind === 'kills') return Math.max(12, Math.round((s.avgKills || 14) * 1.15));
    if (kind === 'credits') return Math.max(80, Math.floor(Meta.runWorth() * 1.2));
    if (kind === 'buy') return 5;
    if (kind === 'crates') return 3;
    if (kind === 'drones') return 2;
    return 1;
  }

  function newQuest(taken) {
    var s = Save.data, pool = KIND_LIST.filter(function (k) { return taken.indexOf(k) < 0; });
    // boss quests only once the player can plausibly meet a boss (they spawn mid-run)
    if (!pool.length) pool = KIND_LIST;
    var kind = pool[Math.floor(Math.random() * pool.length)];
    return { id: ++s.questSeq, kind: kind, target: questTarget(kind), prog: 0 };
  }

  function fill() {
    var s = Save.data, taken;
    while (s.quests.length < 3) {
      taken = s.quests.map(function (q) { return q.kind; });
      s.quests.push(newQuest(taken));
    }
    s.quests.length = 3;
  }

  function view(q) {
    var def = QUEST_KINDS[q.kind] || QUEST_KINDS.kills;
    return {
      id: q.id, kind: q.kind, name: def.name(q.target), target: q.target, prog: Math.min(q.target, q.prog),
      ready: q.prog >= q.target, reward: Math.floor(def.runs * Meta.runWorth()), runs: def.runs
    };
  }

  Meta.quests = function () { fill(); return Save.data.quests.map(view); };

  Meta.questEvent = function (type, v) {
    Save.data.quests.forEach(function (q) {
      var def = QUEST_KINDS[q.kind];
      if (!def || q.prog >= q.target) return;
      if (type === 'buy' && q.kind === 'buy') q.prog += v;
      else if (type === 'run') {
        if (q.kind === 'kills') q.prog = Math.max(q.prog, v.kills);
        else if (q.kind === 'credits') q.prog = Math.max(q.prog, v.credits);
        else if (q.kind === 'crates') q.prog += v.crates;
        else if (q.kind === 'drones') q.prog += v.drones;
        else if (q.kind === 'bosses') q.prog += v.bosses;
      }
    });
  };

  Meta.questsReady = function () { return Meta.quests().filter(function (q) { return q.ready; }).length; };

  // grants the reward and refills the slot with a fresh quest; returns {credits, name} or null
  Meta.claimQuest = function (i) {
    fill();
    var s = Save.data, q = s.quests[i];
    if (!q || q.prog < q.target) return null;
    var v = view(q), taken = s.quests.filter(function (o, j) { return j !== i; }).map(function (o) { return o.kind; });
    s.credits += v.reward;
    s.stats.questsDone++;
    s.quests[i] = newQuest(taken);
    Save.save();
    return { credits: v.reward, name: v.name };
  };

  /* ---------- hangar salvage ---------- */
  // credits/sec while the hangar is open: a share of your best recent credits/min, boosted by the Salvage branch
  Meta.idleRate = function () {
    var s = Save.data, S = Meta.stats(), cpm = 0, i;
    for (i = 0; i < s.recentCpm.length; i++) if (s.recentCpm[i] > cpm) cpm = s.recentCpm[i];
    var eff = Math.min(1, E.idleBase + S.salvage) * (1 + S.idleMult);
    var floor = E.idleFloor * Math.pow(S.W, E.idleW) * S.markMult * (1 + S.idleMult);
    return Math.max(floor, cpm / 60 * eff);
  };

  Meta.offlineCapSeconds = function () { return (E.offlineCapH + Meta.stats().offlineHours) * 3600; };

  // PURE: credits an absence of `seconds` would pay (capped). Does not change the save.
  Meta.offlineEarnings = function (seconds) {
    seconds = Math.max(0, Math.min(+seconds || 0, Meta.offlineCapSeconds()));
    return Math.floor(Meta.idleRate() * seconds * E.offlineEff);
  };

  // GRANTS an absence directly (used by the sim); returns the credits added
  Meta.claimOffline = function (seconds) {
    var amt = Meta.offlineEarnings(seconds), s = Save.data;
    s.credits += amt;
    s.ascEarned += amt;
    Save.save();
    return amt;
  };

  // app open in the hangar: salvage trickles in
  Meta.tickIdle = function (dt) {
    var s = Save.data, amt = Meta.idleRate() * dt;
    s.credits += amt;
    s.ascEarned += amt;
    return amt;
  };

  // boot: turn the time since lastSeen into a pending Welcome-back payout (computed once, claimed by the popup)
  Meta.checkAway = function (nowMs) {
    var s = Save.data, away = s.lastSeen ? (nowMs - s.lastSeen) / 1000 : 0;
    if (away >= 60 && away < 86400 * 400) {
      s.pendingOffline += Meta.offlineEarnings(away);
      s.pendingAway = Math.min(away, Meta.offlineCapSeconds());
    }
    s.lastSeen = nowMs;
    Save.save();
    return s.pendingOffline;
  };

  // grants the pending payout, returns the credits
  Meta.collectOffline = function () {
    var s = Save.data, amt = Math.floor(s.pendingOffline);
    s.credits += amt;
    s.ascEarned += amt;
    s.pendingOffline = 0;
    s.pendingAway = 0;
    Save.save();
    return amt;
  };
})();
