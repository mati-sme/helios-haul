/* Helios Haul — localStorage save, export/import */
(function () {
  'use strict';
  var HH = window.HH = window.HH || {};

  function defaults() {
    return {
      v: 2,
      credits: 0,
      marks: 0,
      lifetimeScrap: 0,
      ascScrap: 0,
      ascSpent: 0,
      ascensions: 0,
      runs: 0,
      bestScrap: 0,
      upg: {},
      pre: {},
      petsOwned: [],
      petsEquipped: [],
      goalsClaimed: {},
      stats: { kills: 0, crates: 0, drones: 0, bosses: 0, buys: 0, runsDone: 0, anchored: 0, questsDone: 0 },
      marksLifetime: 0,        // every Solar Mark ever earned (spent or not): drives the permanent income bonus
      ascEarned: 0,            // credits earned since the last ascension (drives the marks formula)
      prevAscEarned: 0,
      recentCpm: [],           // credits/min of the last few runs (drives hangar salvage)
      avgKills: 0,
      lastSeen: 0,             // ms timestamp, drives offline salvage
      pendingOffline: 0,       // offline credits waiting behind the Welcome-back popup
      pendingAway: 0,
      quests: [],
      questSeq: 0,
      rankSeen: 0,
      gift: null,              // one-time migration gift shown in a popup
      migrated: 0,
      settings: {
        kids: false, mute: false, music: true, vol: 0.7, haptics: true,
        joySide: 'left', weapon: 'bolts', trail: 'cyan', hud: 'cyan'
      },
      lastRun: null,
      seenIntro: false
    };
  }

  function merge(base, src) {
    var k;
    if (!src || typeof src !== 'object') return base;
    for (k in base) {
      if (!Object.prototype.hasOwnProperty.call(base, k) || !(k in src)) continue;
      if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) && src[k] && typeof src[k] === 'object') {
        base[k] = merge(base[k], src[k]);
      } else if (typeof base[k] === typeof src[k] || base[k] === null) {
        base[k] = src[k];
      }
    }
    // free-form maps keep every key from the source
    ['upg', 'pre', 'goalsClaimed'].forEach(function (m) {
      if (src[m] && typeof src[m] === 'object') base[m] = src[m];
    });
    if (Array.isArray(src.petsOwned)) base.petsOwned = src.petsOwned.slice();
    if (Array.isArray(src.petsEquipped)) base.petsEquipped = src.petsEquipped.slice();
    if (src.lastRun && typeof src.lastRun === 'object') base.lastRun = src.lastRun;
    return base;
  }

  function sane(s) {
    ['credits', 'marks', 'lifetimeScrap', 'ascScrap', 'ascSpent', 'ascensions', 'runs', 'bestScrap', 'marksLifetime',
      'ascEarned', 'prevAscEarned', 'avgKills', 'lastSeen', 'pendingOffline', 'pendingAway', 'questSeq', 'rankSeen'].forEach(function (k) {
      if (!isFinite(s[k]) || s[k] < 0) s[k] = 0;
    });
    s.settings.vol = Math.max(0, Math.min(1, +s.settings.vol || 0));
    if (!Array.isArray(s.quests)) s.quests = [];
    if (!Array.isArray(s.recentCpm)) s.recentCpm = [];
    s.recentCpm = s.recentCpm.filter(function (x) { return isFinite(x) && x >= 0; }).slice(-5);
    return s;
  }

  // v1 -> v2: keep every level/node/pet/goal/stat, then top up generously so the player is not behind the new curve
  function migrate(s) {
    var spent = 0, id, i, node, byId = {};
    HH.PRESTIGE.forEach(function (n) { byId[n.id] = n; });
    for (id in s.pre) if (s.pre[id] && byId[id]) spent += byId[id].cost;
    s.marksLifetime = Math.max(s.marksLifetime, s.marks + spent);
    s.ascEarned = Math.max(s.ascEarned, s.ascScrap);
    s.prevAscEarned = Math.max(s.prevAscEarned, s.ascEarned);
    var gc = Math.floor(2000 + s.lifetimeScrap * 0.03);
    var gm = s.ascensions > 0 ? Math.ceil(s.marksLifetime * 0.3 + s.ascensions * 3) : 0;
    s.credits += gc;
    s.marks += gm;
    s.marksLifetime += gm;
    s.gift = { credits: gc, marks: gm };
    s.migrated = 1;
    s.v = 2;
    return s;
  }

  var Save = HH.Save = {
    data: defaults(),
    ok: true,

    load: function () {
      try {
        var raw = localStorage.getItem(HH.SAVE_KEY);
        if (raw) {
          var obj = JSON.parse(raw);
          if (obj && obj.v !== 2) {
            // never touch the old save without a copy
            try { if (localStorage.getItem(HH.SAVE_BACKUP_KEY) == null) localStorage.setItem(HH.SAVE_BACKUP_KEY, raw); } catch (e2) { /* quota */ }
            Save.data = migrate(sane(merge(defaults(), obj)));
            Save.save();
          } else Save.data = sane(merge(defaults(), obj));
        }
      } catch (e) {
        Save.ok = false;
        Save.data = defaults();
      }
      return Save.data;
    },

    save: function () {
      try {
        Save.data.lastSeen = Date.now();
        localStorage.setItem(HH.SAVE_KEY, JSON.stringify(Save.data));
        return true;
      } catch (e) {
        Save.ok = false;
        return false;
      }
    },

    exportJSON: function () {
      return JSON.stringify({ game: 'helios-haul', exported: new Date().toISOString(), save: Save.data }, null, 1);
    },

    importJSON: function (text) {
      var obj;
      try { obj = JSON.parse(text); } catch (e) { return { ok: false, msg: 'That is not valid JSON.' }; }
      var src = obj && obj.save ? obj.save : obj;
      if (!src || typeof src !== 'object' || typeof src.credits !== 'number' || typeof src.upg !== 'object') {
        return { ok: false, msg: 'This does not look like a Helios Haul save.' };
      }
      var old = src.v !== 2;
      Save.data = sane(merge(defaults(), src));
      if (old) migrate(Save.data);
      Save.save();
      return { ok: true, msg: old ? 'Old save imported and upgraded.' : 'Save imported.' };
    },

    migrate: migrate,

    reset: function () {
      Save.data = defaults();
      Save.save();
    }
  };
})();
