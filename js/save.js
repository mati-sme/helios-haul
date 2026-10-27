/* Helios Haul — localStorage save, export/import */
(function () {
  'use strict';
  var HH = window.HH = window.HH || {};

  function defaults() {
    return {
      v: 1,
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
      stats: { kills: 0, crates: 0, drones: 0, bosses: 0, buys: 0, runsDone: 0, anchored: 0 },
      settings: {
        kids: false, mute: false, music: true, vol: 0.7,
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
    ['credits', 'marks', 'lifetimeScrap', 'ascScrap', 'ascSpent', 'ascensions', 'runs', 'bestScrap'].forEach(function (k) {
      if (!isFinite(s[k]) || s[k] < 0) s[k] = 0;
    });
    s.settings.vol = Math.max(0, Math.min(1, +s.settings.vol || 0));
    return s;
  }

  var Save = HH.Save = {
    data: defaults(),
    ok: true,

    load: function () {
      try {
        var raw = localStorage.getItem(HH.SAVE_KEY);
        if (raw) Save.data = sane(merge(defaults(), JSON.parse(raw)));
      } catch (e) {
        Save.ok = false;
        Save.data = defaults();
      }
      return Save.data;
    },

    save: function () {
      try {
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
      Save.data = sane(merge(defaults(), src));
      Save.save();
      return { ok: true, msg: 'Save imported.' };
    },

    reset: function () {
      Save.data = defaults();
      Save.save();
    }
  };
})();
