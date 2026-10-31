/* Helios Haul — meta economy (HH.Meta) and the timed-run state machine (HH.Game) */
(function () {
  'use strict';
  var HH = window.HH = window.HH || {};
  var Save = HH.Save, Audio = HH.Audio, Input = HH.Input;

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function wrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

  /* =====================================================================
   * Meta: costs, purchases, derived stats, prestige, goals
   * ===================================================================== */
  var NUM_KEYS = ['damage', 'fireRate', 'multishot', 'pierce', 'hull', 'shield', 'shieldRegen', 'regen', 'thrust',
    'magnet', 'luck', 'scrapValue', 'oreChance', 'runTime', 'creditMult', 'scrapMult', 'droneValue', 'bossValue',
    'oreMult', 'tierValue', 'petSlots', 'petAura', 'spawn', 'droneRate', 'crateRate', 'bossChance', 'startCredits',
    'keepCredits', 'marksMult', 'kidsBonus', 'compass', 'scanner', 'anchor', 'salvage', 'idleMult', 'offlineHours'];
  var LIST_KEYS = ['weaponMode', 'trail', 'hud', 'pet', 'unlock'];

  var upgById = {}, preById = {};
  HH.UPGRADES.forEach(function (n) { upgById[n.id] = n; });
  HH.PRESTIGE.forEach(function (n) { preById[n.id] = n; });
  var E = HH.ECON;
  // milestone doubling only applies to scalable effects on nodes that can actually reach Lv 10
  HH.UPGRADES.forEach(function (n) {
    n.ms = n.max >= 10 && Object.keys(n.fx).some(function (k) { return HH.MS_KEYS.indexOf(k) >= 0; });
  });
  function msMult(n, lv) { return n.ms ? Math.pow(2, HH.msCount(lv)) : 1; }

  var cache = null;

  var Meta = HH.Meta = {
    upgById: upgById,
    preById: preById,

    dirty: function () { cache = null; },

    stats: function () {
      if (cache) return cache;
      var s = Save.data, S = {}, L = {}, k;
      NUM_KEYS.forEach(function (key) { S[key] = 0; });
      L.weaponMode = ['bolts']; L.trail = ['cyan']; L.hud = ['cyan']; L.pet = []; L.unlock = [];
      function add(fx, m) {
        for (k in fx) {
          if (typeof fx[k] === 'number') S[k] = (S[k] || 0) + fx[k] * m;
          else if (L[k] && L[k].indexOf(fx[k]) < 0) L[k].push(fx[k]);
        }
      }
      HH.UPGRADES.forEach(function (n) { var lv = s.upg[n.id] || 0; if (lv) add(n.fx, lv * msMult(n, lv)); });
      HH.PRESTIGE.forEach(function (n) { if (s.pre[n.id]) add(n.fx, 1); });
      S.lists = L;
      L.pet.forEach(function (p) { if (s.petsOwned.indexOf(p) < 0) s.petsOwned.push(p); });
      S.levels = Meta.totalLevels();
      ['scrapValue', 'scrapMult', 'creditMult', 'tierValue', 'oreMult', 'droneValue', 'bossValue', 'idleMult'].forEach(function (k) { S[k] *= E.fxK; });
      S.rank = Math.floor(S.levels / E.rankStep);
      S.rankBonusEach = E.rankBonus;
      S.rankMult = 1 + E.rankBonus * S.rank;
      S.markMult = Meta.markMultFor(s.marksLifetime);
      // scrap value, scrap collected and cash-out bonuses pool into ONE additive bonus (keeps income growth tame)
      S.pool = 1 + S.scrapValue + S.scrapMult + S.creditMult;
      S.vscale = Math.pow(1 + s.ascSpent / E.valS0, E.valGamma);
      // income proxy for this ascension (no marks/rank): upgrade prices follow it so pacing stays steady at any scale
      S.W = S.vscale * S.pool * Math.pow(S.markMult, E.costMarks);
      S.incomeMult = S.rankMult * S.markMult;
      cache = S;
      return S;
    },

    msMult: msMult,
    markMultFor: function (m) { return 1 + E.markBonus * Math.pow(Math.max(0, m), E.markExp); },

    totalLevels: function () {
      var n = 0, id, s = Save.data;
      for (id in s.upg) if (upgById[id]) n += s.upg[id];
      return n;
    },

    unlocked: function (list, id) { return Meta.stats().lists[list].indexOf(id) >= 0; },

    level: function (kind, id) {
      var s = Save.data;
      return kind === 'upg' ? (s.upg[id] || 0) : (s.pre[id] ? 1 : 0);
    },

    cost: function (kind, n) {
      var lv = Meta.level(kind, n.id);
      return Meta.costAt(kind, n, lv);
    },

    // price of the level after `lv` (kind 'upg' only grows; prestige nodes are one-offs)
    costAt: function (kind, n, lv) {
      if (kind !== 'upg') return n.cost;
      if (n.max === 1) return Math.round(n.cost * E.oneOffK);      // one-off unlocks keep a flat price (the anchor must stay reachable)
      var m = 1 + (n.costMul - 1) * (n.max >= HH.UNCAPPED ? E.costK : 1);
      var infl = Math.pow(Meta.stats().W, E.costW);
      return Math.round(n.cost * E.costBase * Math.pow(m, lv) * infl);
    },

    // cost of buying `count` more levels from the current level
    costN: function (kind, n, count) {
      var lv = Meta.level(kind, n.id), tot = 0, i;
      for (i = 0; i < count; i++) tot += Meta.costAt(kind, n, lv + i);
      return tot;
    },

    // how many levels (<= want) the wallet affords right now
    affordCount: function (kind, n, want) {
      var lv = Meta.level(kind, n.id), left = Meta.funds(kind), c = 0, cost;
      want = Math.min(want, n.max - lv);
      while (c < want) {
        cost = Meta.costAt(kind, n, lv + c);
        if (cost > left) break;
        left -= cost; c++;
      }
      return c;
    },

    reqMet: function (kind, n) {
      return n.req.every(function (r) { return Meta.level(kind, r) > 0; });
    },

    funds: function (kind) { return kind === 'upg' ? Save.data.credits : Save.data.marks; },

    // {level,max,status,cost,reqMissing}
    nodeState: function (kind, n) {
      var lv = Meta.level(kind, n.id), max = n.max;
      var cost = Meta.cost(kind, n), status;
      if (!Meta.reqMet(kind, n) && lv <= 0) status = 'locked';
      else if (lv >= max) status = 'maxed';
      else if (Meta.funds(kind) >= cost) status = 'afford';
      else status = lv > 0 ? 'owned' : 'ready';
      return { level: lv, max: max, status: status, cost: cost };
    },

    // buy `count` levels (default 1; Infinity = max). Returns {ok, msg, bought, spent, milestone, rankUp, unlocked}
    buy: function (kind, id, count) {
      var s = Save.data, n = (kind === 'upg' ? upgById : preById)[id];
      if (!n) return { ok: false, msg: 'Unknown node.' };
      var st = Meta.nodeState(kind, n);
      if (st.status === 'locked') return { ok: false, msg: 'Locked: buy the connected node first.' };
      if (st.status === 'maxed') return { ok: false, msg: 'Already maxed.' };
      if (st.status !== 'afford') return { ok: false, msg: 'Not enough ' + (kind === 'upg' ? 'Credits.' : 'Solar Marks.') };
      var c = kind === 'upg' ? Math.max(1, Meta.affordCount(kind, n, count || 1)) : 1;
      var spent = Meta.costN(kind, n, c), before = Meta.stats().rank, lvBefore = st.level, wasOpen = {};
      if (kind === 'upg') HH.UPGRADES.forEach(function (o) { wasOpen[o.id] = Meta.reqMet('upg', o); });
      if (kind === 'upg') {
        s.credits -= spent;
        s.ascSpent += spent;
        s.upg[id] = st.level + c;
        s.stats.buys += c;
        if (id === 'anchor') s.stats.anchored = 1;
      } else {
        s.marks -= spent;
        s.pre[id] = 1;
      }
      Meta.dirty();
      var S = Meta.stats(), res = { ok: true, bought: c, spent: spent, milestone: 0, rankUp: 0, unlocked: [] };
      if (kind === 'upg') {
        var m = HH.msCount(st.level + c) - HH.msCount(lvBefore);
        if (n.ms && m > 0) res.milestone = HH.MILESTONES[HH.msCount(st.level + c) - 1];
        if (S.rank > before) res.rankUp = S.rank;
        HH.UPGRADES.forEach(function (o) { if (!wasOpen[o.id] && Meta.reqMet('upg', o) && !s.upg[o.id]) res.unlocked.push(o.name); });
        if (Meta.questEvent) Meta.questEvent('buy', c);
      }
      res.msg = n.name + (n.max > 1 ? ' → Lv ' + (st.level + c) : ' acquired') + '!';
      Save.save();
      return res;
    },

    anchorBuilt: function () { return Meta.stats().anchor > 0; },

    marksPreview: function () {
      var s = Save.data, S = Meta.stats();
      return Math.floor(Math.pow(Math.max(0, s.ascEarned) / E.markDiv, E.markPow) * (1 + S.marksMult));
    },

    canAscend: function () { return Meta.anchorBuilt() && Meta.marksPreview() >= 1; },

    // "Next ascension: +N ☀ → +X% income" and whether the game recommends doing it now
    ascendAdvice: function () {
      var s = Save.data, gain = Meta.marksPreview(), life = s.marksLifetime;
      var cur = Meta.markMultFor(life), nxt = Meta.markMultFor(life + gain);
      return {
        gain: gain, can: Meta.canAscend(), incomePct: Math.round((nxt / cur - 1) * 100),
        bonusPct: Math.round((cur - 1) * 100), newBonusPct: Math.round((nxt - 1) * 100),
        recommended: Meta.canAscend() && (life <= 0 || gain >= 0.5 * life)
      };
    },

    ascend: function () {
      if (!Meta.canAscend()) return null;
      var s = Save.data, S = Meta.stats(), gain = Meta.marksPreview();
      var start = Math.floor(s.credits * Math.min(1, S.keepCredits) + s.ascEarned * E.carryFrac + S.startCredits * Math.max(1, s.ascEarned / 2000));
      s.marks += gain;
      s.marksLifetime += gain;
      s.ascensions++;
      s.prevAscEarned = s.ascEarned;
      s.upg = {};
      s.credits = start;
      s.ascScrap = 0;
      s.ascSpent = 0;
      s.ascEarned = 0;
      s.rankSeen = 0;
      Meta.dirty();
      Meta.stats();
      // drop equipped pets the player no longer has slots for
      s.petsEquipped = s.petsEquipped.filter(function (p, i) { return i < Meta.stats().petSlots && s.petsOwned.indexOf(p) >= 0; });
      Save.save();
      return gain;
    },

    /* goals */
    currentGoal: function () {
      var s = Save.data, i;
      for (i = 0; i < HH.GOALS.length; i++) if (!s.goalsClaimed[HH.GOALS[i].id]) return HH.GOALS[i];
      return null;
    },
    goalProgress: function (g) { return Math.min(g.target, Math.floor(g.prog(Save.data))); },
    goalReady: function (g) { return g && g.prog(Save.data) >= g.target; },
    // resolved reward: {credits, marks}; reward.runs = that many runs' worth of credits
    goalReward: function (g) {
      var r = g.reward, out = { credits: r.credits || 0, marks: r.marks || 0 };
      if (r.runs) out.credits += Math.floor(r.runs * Meta.runWorth());
      return out;
    },
    claimGoal: function () {
      var g = Meta.currentGoal();
      if (!g || !Meta.goalReady(g)) return null;
      var s = Save.data;
      s.goalsClaimed[g.id] = 1;
      var rw = Meta.goalReward(g);
      if (rw.credits) s.credits += rw.credits;
      if (rw.marks) { s.marks += rw.marks; s.marksLifetime += rw.marks; }
      Save.save();
      return g;
    },

    /* settings-driven choices, validated against unlocks */
    weapon: function () {
      var w = Save.data.settings.weapon;
      return Meta.unlocked('weaponMode', w) ? w : 'bolts';
    },
    trail: function () {
      var t = Save.data.settings.trail;
      return Meta.unlocked('trail', t) ? t : 'cyan';
    },
    hud: function () {
      var t = Save.data.settings.hud;
      return Meta.unlocked('hud', t) ? t : 'cyan';
    },

    runDuration: function () {
      var S = Meta.stats(), kids = Save.data.settings.kids;
      // diminishing returns keep runs (and so the reward cadence) under ~3:00 however many timer nodes exist
      return (kids ? 180 + S.kidsBonus : 120) + Math.round(E.timerCap * (1 - Math.exp(-S.runTime / E.timerCap)));
    }
  };

  /* =====================================================================
   * Game: the run
   * ===================================================================== */
  var TIERS = [
    { n: 'rock',     hp: 18,  val: 3,  r: [20, 30] },
    { n: 'iron',     hp: 40,  val: 7,  r: [24, 34] },
    { n: 'crystal',  hp: 80,  val: 16, r: [26, 36] },
    { n: 'obsidian', hp: 160, val: 36, r: [30, 42] }
  ];
  HH.TIERS = TIERS;

  var Game = HH.Game = {
    state: 'hangar',      // hangar | run | summary
    G: null,
    paused: false,
    view: { w: 400, h: 800, scale: 1, rv: 600 },
    onEnd: null,
    onAlert: null,

    setView: function (w, h) {
      var v = Game.view;
      v.w = w; v.h = h;
      v.scale = clamp(Math.min(w, h) / 520, 0.62, 1.45);
      v.rv = Math.hypot(w, h) / 2 / v.scale;
    },

    derive: function () {
      var S = Meta.stats(), kids = Save.data.settings.kids, L = S.levels;
      // enemy HP follows spending only gently (levels, never prestige); value of targets climbs faster, so every
      // purchase raises income while damage always outgrows HP.
      var hpScale = Math.pow(1 + E.hpLin * L, E.hpPow);
      var valueScale = S.vscale;
      var rate = 2.4 * (1 + S.fireRate);
      if (rate > 10) rate = 10 + 6 * Math.log(rate / 10);
      return {
        S: S, kids: kids, pow: hpScale, hpScale: hpScale, valueScale: valueScale,
        damage: 10 * (1 + S.damage),
        rate: rate,
        multi: Math.min(8, Math.floor(S.multishot)),
        pierce: Math.min(8, Math.floor(S.pierce)),
        hull: 90 + S.hull,
        shield: S.shield,
        maxSpeed: 235 * (1 + Math.min(S.thrust, 2.2) * 0.55),
        accel: 3.8 * (1 + Math.min(S.thrust, 4) * 0.25),
        drag: 1.4,
        magnet: Math.min(620, 130 * (1 + S.magnet)) * (kids ? 1.5 : 1),
        crit: Math.min(0.5, 0.05 + S.luck * 0.4),
        bulletSpeed: 560,
        range: 410,
        dur: Meta.runDuration()
      };
    },

    start: function () {
      var D = Game.derive(), v = Game.view;
      var G = {
        D: D, S: D.S, kids: D.kids, weapon: Meta.weapon(),
        t: 0, dur: D.dur, id: 1,
        ship: { x: 0, y: 0, vx: 0, vy: 0, a: -Math.PI / 2, hp: D.hull, mhp: D.hull, sh: D.shield, msh: D.shield, inv: 0, sinceHit: 9, flash: 0, flashC: '#f66', thr: 0 },
        cam: { x: 0, y: 0 },
        bullets: [], eshots: [], ents: [], pick: [], parts: [], texts: [], rings: [], pets: [],
        scrap: 0, kills: 0, crates: 0, drones: 0, bosses: 0, gems: 0,
        shake: 0, fireCd: 0.25, novaCd: 1, spawnT: 0, bossN: 0, boss2: false,
        aimA: -Math.PI / 2, lock: null, pend: 0, pendT: 0, lastTick: -1, ended: false, bossAlive: null,
        gain: 0, comboT: 0, combo: 0
      };
      Game.G = G;
      Game.paused = false;
      Game.state = 'run';

      // pets that wander the field
      var eq = Save.data.petsEquipped.slice(0, Math.floor(D.S.petSlots));
      eq.forEach(function (sp) {
        if (!HH.PETS[sp] || Save.data.petsOwned.indexOf(sp) < 0) return;
        var a = rnd(0, 6.28), d = rnd(110, 230);
        G.pets.push({ sp: sp, x: Math.cos(a) * d, y: Math.sin(a) * d, ang: rnd(0, 6.28), turn: 0, pause: 0, t: rnd(0, 9), vx: 0, vy: 0 });
      });

      // seed the field
      var n = Game.targetCount(G), i;
      for (i = 0; i < n; i++) Game.spawn(G, 'ast', rnd(150, v.rv + 260));
      for (i = 0; i < 2; i++) Game.spawn(G, 'crate', rnd(200, v.rv + 200));
      Input.enable(true, Save.data.settings.joySide);
      Audio.launch();
    },

    targetCount: function (G) {
      var v = Game.view, p = G.t / G.dur, R = v.rv + 280;
      var n = Math.PI * R * R / 90000 * (1 + 0.3 * p) * (1 + G.S.spawn);
      return clamp(Math.round(n), 14, 110);
    },

    spawnPos: function (G, dist) {
      var s = G.ship, a, sp = Math.hypot(s.vx, s.vy);
      if (sp > 40 && Math.random() < 0.6) a = Math.atan2(s.vy, s.vx) + rnd(-1.2, 1.2);
      else a = rnd(0, 6.283);
      return { x: s.x + Math.cos(a) * dist, y: s.y + Math.sin(a) * dist };
    },

    pickTier: function (G) {
      var p = G.t / G.dur, L = G.S.lists.unlock;
      var w = [60 - 30 * p, 25 + 15 * p, L.indexOf('crystal') >= 0 ? 12 + 6 * p : 0, L.indexOf('obsidian') >= 0 ? 4 + 8 * p : 0];
      var tot = w[0] + w[1] + w[2] + w[3], r = Math.random() * tot, i;
      for (i = 0; i < 4; i++) { r -= w[i]; if (r <= 0) return i; }
      return 0;
    },

    spawn: function (G, kind, dist) {
      var p = Game.spawnPos(G, dist), D = G.D, prog = G.t / G.dur, e;
      var sx = G.ship.x - p.x, sy = G.ship.y - p.y;
      if (Math.hypot(sx, sy) < 130) return null;
      e = { id: G.id++, k: kind, x: p.x, y: p.y, vx: 0, vy: 0, rot: rnd(0, 6.28), rv: rnd(-0.8, 0.8), flash: 0 };
      if (kind === 'ast') {
        var ti = Game.pickTier(G), T = TIERS[ti];
        e.tier = ti;
        e.r = rnd(T.r[0], T.r[1]);
        e.ore = ti < 2 && Math.random() < 0.05 + G.S.oreChance;
        e.mhp = T.hp * (1 + 0.7 * prog) * D.hpScale * (e.ore ? 1.3 : 1) * (e.r / 28);
        e.val = T.val * D.valueScale * (1 + 0.3 * prog) * (e.r / 28);
        var sp = rnd(8, 34), a = rnd(0, 6.28);
        e.vx = Math.cos(a) * sp; e.vy = Math.sin(a) * sp;
        e.verts = Game.makeVerts(e.r);
      } else if (kind === 'crate') {
        e.r = 20; e.mhp = 14 * (1 + 0.7 * prog) * D.hpScale; e.val = 20 * D.valueScale;
        var a2 = rnd(0, 6.28); e.vx = Math.cos(a2) * 18; e.vy = Math.sin(a2) * 18;
      } else if (kind === 'drone') {
        e.r = 17; e.mhp = 30 * (1 + 0.7 * prog) * D.hpScale; e.val = 14 * D.valueScale;
        e.fire = rnd(1.5, 3); e.orb = Math.random() < 0.5 ? 1 : -1; e.rv = 0;
      } else if (kind === 'boss') {
        e.r = 64; e.mhp = 520 * (1 + 0.5 * prog) * D.hpScale; e.val = 150 * D.valueScale;
        e.ring = 3.5; e.rv = 0.25; e.verts = Game.makeVerts(64);
      }
      e.hp = e.mhp;
      G.ents.push(e);
      return e;
    },

    makeVerts: function (r) {
      var n = 10 + Math.floor(Math.random() * 3), out = [], i;
      for (i = 0; i < n; i++) {
        var a = i / n * 6.283, k = rnd(0.8, 1.14);
        out.push([Math.cos(a) * r * k, Math.sin(a) * r * k]);
      }
      return out;
    },

    /* ---------- effects ---------- */
    burst: function (G, x, y, col, n, spd, size, add) {
      var i;
      for (i = 0; i < n && G.parts.length < 420; i++) {
        var a = rnd(0, 6.283), sp = rnd(0.3, 1) * spd;
        G.parts.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(0.3, 0.8), max: 0.8, size: rnd(0.6, 1) * size, col: col, add: add !== false });
      }
    },
    text: function (G, x, y, txt, col, size) {
      if (G.texts.length > 24) G.texts.shift();
      G.texts.push({ x: x, y: y, t: 0, txt: txt, col: col || '#fff', size: size || 15 });
    },

    hurtShip: function (G, dmg) {
      var s = G.ship;
      if (s.inv > 0 || G.ended) return;
      if (G.kids) dmg *= 0.7;
      s.sinceHit = 0; s.inv = 0.85;
      if (s.sh > 0) {
        var a = Math.min(s.sh, dmg);
        s.sh -= a; dmg -= a;
        s.flash = 0.2; s.flashC = '#6aa8ff';
        Audio.shield();
      }
      if (dmg > 0) {
        s.hp -= dmg;
        s.flash = 0.3; s.flashC = '#ff5a5a';
        G.shake = Math.max(G.shake, 9);
        Audio.hurt();
        Game.text(G, s.x, s.y - 26, '-' + Math.ceil(dmg), '#ff8a8a', 16);
      }
      Game.burst(G, s.x, s.y, s.flashC, 8, 120, 3);
      if (s.hp <= 0) { s.hp = 0; Game.finish('breach'); }
    },

    hurtEnt: function (G, e, dmg, crit) {
      e.hp -= dmg;
      e.flash = 0.08;
      Game.burst(G, e.x, e.y, crit ? '#ffe27a' : '#ffd0a0', crit ? 5 : 2, 90, 2.2);
      if (crit) Game.text(G, e.x, e.y - e.r, Math.ceil(dmg) + '!', '#ffe27a', 15);
      if (e.hp <= 0) Game.kill(G, e);
      else Audio.hit();
    },

    drop: function (G, x, y, total, type, n) {
      var i, per = total / n;
      for (i = 0; i < n; i++) {
        var a = rnd(0, 6.283), sp = rnd(30, 120);
        G.pick.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, v: per, type: type, age: 0, ph: rnd(0, 6) });
      }
    },

    kill: function (G, e) {
      if (e.dead) return;
      e.dead = true;
      var S = G.S, mult = S.pool, n;
      var big = e.k === 'boss' || e.r > 32;
      if (e.k === 'ast') {
        if (e.ore) mult *= 6 * (1 + S.oreMult);
        if (e.tier >= 2) mult *= 1 + S.tierValue;
        n = clamp(Math.round(Math.sqrt(e.val * mult) / 1.4), 1, 10);
      } else if (e.k === 'drone') {
        mult *= 1 + S.droneValue; n = 4; G.drones++;
      } else if (e.k === 'crate') {
        mult *= 1; n = 6 + Math.floor(Math.random() * 3); G.crates++;
      } else {
        mult *= 1 + S.bossValue; n = 14; G.bosses++; G.bossAlive = null;
      }
      Game.drop(G, e.x, e.y, e.val * mult, 'scrap', n);
      // luck: bonus gem / repair nanites
      var luck = S.luck + (G.petLuck || 0);
      if (Math.random() < 0.04 + luck * 0.5 || e.k === 'boss') {
        Game.drop(G, e.x, e.y, e.val * mult * 3, 'gem', 1);
      }
      if (G.ship.hp < G.ship.mhp && (Math.random() < 0.035 + luck * 0.2 || e.k === 'boss')) {
        Game.drop(G, e.x, e.y, 0, 'heal', 1);
      }
      G.kills++;
      G.combo = (G.comboT > 0 ? G.combo : 0) + 1; G.comboT = 1.6;
      if (G.combo % 8 === 0) { Game.text(G, G.ship.x, G.ship.y - 52, 'x' + G.combo + ' STREAK!', '#7fe8ff', 17); Audio.gem(); }
      var col = e.k === 'ast' ? ['#b8a58f', '#9fb4c8', '#7fe8ff', '#b79cff'][e.tier] : e.k === 'drone' ? '#ff8f6a' : e.k === 'crate' ? '#ffd45e' : '#ffb066';
      if (e.ore) col = '#ffd45e';
      Game.burst(G, e.x, e.y, col, big ? 34 : 16, big ? 260 : 170, big ? 5 : 3.4);
      Game.burst(G, e.x, e.y, '#fff', 6, 120, 2.4);
      G.rings.push({ x: e.x, y: e.y, r: e.r * 0.4, max: e.r * (big ? 3.2 : 2.2), t: 0, life: 0.4, col: col });
      G.shake = Math.max(G.shake, big ? 12 : 3);
      Audio.boom(big);
      if (e.k === 'boss') Game.alert('Mini-boss down! Grab the haul!');
    },

    alert: function (msg) { if (Game.onAlert) Game.onAlert(msg); },

    /* ---------- aim assist ---------- */
    pickTarget: function (G) {
      var s = G.ship, sp = Math.hypot(s.vx, s.vy), hx, hy, best = null, bs = 1e9, i, e;
      if (sp > 25) { hx = s.vx / sp; hy = s.vy / sp; } else { hx = Math.cos(s.a); hy = Math.sin(s.a); }
      var range = G.D.range;
      for (i = 0; i < G.ents.length; i++) {
        e = G.ents[i];
        if (e.dead) continue;
        var dx = e.x - s.x, dy = e.y - s.y, d = Math.hypot(dx, dy) - e.r * 0.5;
        if (d > range) continue;
        var ang = Math.acos(clamp((dx * hx + dy * hy) / (Math.hypot(dx, dy) || 1), -1, 1));
        var score = Math.max(d, 30) * (1 + ang * 1.1);
        if (ang < 1.3) score *= 0.6;           // prefer the forward cone
        else if (d > 160) score *= 1.5;        // far behind = low priority
        if (e.k === 'drone') score *= 0.8;
        if (e.id === G.lock) score *= 0.72;    // hysteresis: no target flicker
        if (score < bs) { bs = score; best = e; }
      }
      return best;
    },

    makeBullet: function (G, x, y, a, spd, dmgMul, life, pierce, rail) {
      var D = G.D, crit = Math.random() < D.crit;
      var dmg = D.damage * dmgMul * (crit ? 2 : 1);
      G.bullets.push({ x: x, y: y, px: x, py: y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, dmg: dmg, crit: crit, life: life, pierce: pierce, rail: !!rail, hit: [], r: rail ? 6 : 4 });
    },

    fire: function (G, target) {
      var D = G.D, s = G.ship, A = G.aimA, m = D.multi, w = G.weapon, i;
      var nx = s.x + Math.cos(A) * 16, ny = s.y + Math.sin(A) * 16, spd = D.bulletSpeed;
      if (w === 'bolts' || w === 'nova') {
        var n = 1 + m, step = 0.11, mul = w === 'nova' ? 0.6 : 1;
        for (i = 0; i < n; i++) Game.makeBullet(G, nx, ny, A + (i - (n - 1) / 2) * step, spd, mul, 0.8, D.pierce);
      } else if (w === 'twin') {
        var nt = 2 + m, px = -Math.sin(A), py = Math.cos(A);
        for (i = 0; i < nt; i++) {
          var off = (i - (nt - 1) / 2) * 9;
          Game.makeBullet(G, nx + px * off, ny + py * off, A, spd, 0.8, 0.8, D.pierce);
        }
      } else if (w === 'spread') {
        var ns = 3 + m, arc = 0.5 + 0.06 * m;
        for (i = 0; i < ns; i++) Game.makeBullet(G, nx, ny, A + (i / (ns - 1) - 0.5) * arc, spd * 0.95, 0.7, 0.6, D.pierce);
      } else if (w === 'rail') {
        var nr = 1 + Math.floor(m / 2), pxr = -Math.sin(A), pyr = Math.cos(A);
        for (i = 0; i < nr; i++) {
          var o2 = (i - (nr - 1) / 2) * 12;
          Game.makeBullet(G, nx + pxr * o2, ny + pyr * o2, A, 920, 2.8, 0.62, 4 + D.pierce, true);
        }
      }
      Audio.shoot();
      Game.burst(G, nx, ny, '#bff6ff', 1, 40, 2);
    },

    novaPulse: function (G) {
      var s = G.ship, R = 150 + G.S.magnet * 20, i, e;
      G.rings.push({ x: s.x, y: s.y, r: 10, max: R, t: 0, life: 0.45, col: '#7fe8ff', nova: true });
      for (i = 0; i < G.ents.length; i++) {
        e = G.ents[i];
        if (e.dead) continue;
        if (Math.hypot(e.x - s.x, e.y - s.y) < R + e.r) Game.hurtEnt(G, e, G.D.damage * 1.4, false);
      }
      Audio.shield();
    },

    /* ---------- the frame ---------- */
    update: function (dt) {
      var G = Game.G;
      if (Game.state !== 'run' || !G || G.ended || Game.paused) return;
      dt = Math.min(dt, 0.05);
      var D = G.D, s = G.ship, v = Game.view, i, e, b;

      G.t += dt;
      s.inv = Math.max(0, s.inv - dt);
      s.flash = Math.max(0, s.flash - dt);
      s.sinceHit += dt;
      G.shake = Math.max(0, G.shake - dt * 30);
      if (G.comboT > 0) G.comboT -= dt;

      // --- ship movement (mild momentum) ---
      var inp = Input.vec();
      var k = inp.mag > 0 ? D.accel : D.drag, f = 1 - Math.exp(-k * dt);
      s.vx += (inp.x * inp.mag * D.maxSpeed - s.vx) * f;
      s.vy += (inp.y * inp.mag * D.maxSpeed - s.vy) * f;
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.thr += (inp.mag - s.thr) * (1 - Math.exp(-8 * dt));

      // regen
      if (D.S.regen > 0 && s.hp < s.mhp) s.hp = Math.min(s.mhp, s.hp + D.S.regen * dt);
      if (s.sh < s.msh && s.sinceHit > 3) s.sh = Math.min(s.msh, s.sh + (4 + D.S.shieldRegen) * dt);

      // camera follows with a little look-ahead
      var lx = s.x + s.vx * 0.22, ly = s.y + s.vy * 0.22;
      G.cam.x += (lx - G.cam.x) * (1 - Math.exp(-6 * dt));
      G.cam.y += (ly - G.cam.y) * (1 - Math.exp(-6 * dt));

      // engine trail particles
      var sp = Math.hypot(s.vx, s.vy);
      if (sp > 30 && G.parts.length < 400 && Math.random() < 0.9) {
        var ta = Math.atan2(s.vy, s.vx) + Math.PI + rnd(-0.25, 0.25);
        var tc = HH.TRAILS[Meta.trail()].c;
        G.parts.push({ x: s.x - s.vx * 0.03, y: s.y - s.vy * 0.03, vx: Math.cos(ta) * 40 + s.vx * 0.05, vy: Math.sin(ta) * 40 + s.vy * 0.05, life: 0.5, max: 0.5, size: rnd(2.5, 4.5), col: Math.random() < 0.5 ? tc[0] : tc[1], add: true, trail: true });
      }

      // --- pets (random wander, never follow) ---
      var aura = 0, petLuck = 0;
      for (i = 0; i < G.pets.length; i++) {
        var p = G.pets[i], def = HH.PETS[p.sp];
        p.t += dt;
        if (p.pause > 0) p.pause -= dt;
        else if (Math.random() < dt * 0.15) p.pause = rnd(0.5, 1.6);
        p.turn = clamp(p.turn + (Math.random() - 0.5) * 7 * dt, -1.3, 1.3);
        p.ang += p.turn * dt;
        var ps = (p.pause > 0 ? 6 : 30 + Math.sin(p.t * 0.8) * 10);
        p.x += Math.cos(p.ang) * ps * dt; p.y += Math.sin(p.ang) * ps * dt;
        var pd = Math.hypot(p.x - s.x, p.y - s.y);
        if (pd > 780) {
          var ra = rnd(0, 6.283), rd = rnd(320, 520);
          p.x = s.x + Math.cos(ra) * rd; p.y = s.y + Math.sin(ra) * rd; p.ang = rnd(0, 6.283);
        }
        if (pd < 170) {
          aura += def.aura.magnet * (1 + D.S.petAura);
          petLuck += def.aura.luck * (1 + D.S.petAura);
        }
      }
      G.petLuck = petLuck;
      G.magnet = D.magnet * (1 + aura);

      // --- targeting & facing ---
      var tgt = Game.pickTarget(G);
      G.lock = tgt ? tgt.id : null;
      var aimA;
      if (tgt) {
        var dx = tgt.x - s.x, dy = tgt.y - s.y, dist = Math.hypot(dx, dy);
        var tt = dist / D.bulletSpeed;
        aimA = Math.atan2(dy + (tgt.vy || 0) * tt, dx + (tgt.vx || 0) * tt);
      } else if (sp > 25) aimA = Math.atan2(s.vy, s.vx);
      else aimA = s.a;
      G.aimA = aimA;
      G.target = tgt;
      s.a += wrap(aimA - s.a) * (1 - Math.exp(-14 * dt));

      // --- fire ---
      var rateMul = G.weapon === 'rail' ? 0.5 : G.weapon === 'spread' ? 0.95 : 1;
      var period = 1 / (D.rate * rateMul);
      G.fireCd -= dt;
      var guard = 0;
      while (G.fireCd <= 0 && guard++ < 3) { Game.fire(G, tgt); G.fireCd += period; }
      if (G.fireCd < -0.1) G.fireCd = 0;
      if (G.weapon === 'nova') {
        G.novaCd -= dt;
        if (G.novaCd <= 0) { Game.novaPulse(G); G.novaCd = 1 / (D.rate * 0.4); }
      }

      // --- bullets ---
      for (i = G.bullets.length - 1; i >= 0; i--) {
        b = G.bullets[i];
        b.px = b.x; b.py = b.y;
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.life -= dt;
        var gone = b.life <= 0;
        for (var j = 0; j < G.ents.length && !gone; j++) {
          e = G.ents[j];
          if (e.dead || b.hit.indexOf(e.id) >= 0) continue;
          var hr = e.r + b.r;
          if ((e.x - b.x) * (e.x - b.x) + (e.y - b.y) * (e.y - b.y) < hr * hr) {
            b.hit.push(e.id);
            Game.hurtEnt(G, e, b.dmg, b.crit);
            if (b.pierce <= 0) gone = true; else b.pierce--;
          }
        }
        if (gone) G.bullets.splice(i, 1);
      }

      // --- targets ---
      var despawn = v.rv + 520;
      for (i = 0; i < G.ents.length; i++) {
        e = G.ents[i];
        if (e.dead) continue;
        e.flash = Math.max(0, e.flash - dt);
        e.rot += e.rv * dt;
        var ex = s.x - e.x, ey = s.y - e.y, ed = Math.hypot(ex, ey) || 1;
        if (e.k === 'drone') {
          var want, tx, ty;
          if (ed > 270) { tx = ex / ed; ty = ey / ed; want = 88; }
          else if (ed < 190) { tx = -ex / ed; ty = -ey / ed; want = 70; }
          else { tx = -ey / ed * e.orb; ty = ex / ed * e.orb; want = 58; }
          e.vx += (tx * want - e.vx) * (1 - Math.exp(-2 * dt));
          e.vy += (ty * want - e.vy) * (1 - Math.exp(-2 * dt));
          e.rot = Math.atan2(ey, ex);
          e.fire -= dt;
          if (e.fire <= 0 && ed < 430) {
            var ba = Math.atan2(ey, ex) + rnd(-0.12, 0.12), bs = G.kids ? 105 : 150;
            G.eshots.push({ x: e.x, y: e.y, vx: Math.cos(ba) * bs, vy: Math.sin(ba) * bs, life: 4, r: 7, dmg: 6 });
            e.fire = (2.6 + Math.random()) * (G.kids ? 1.45 : 1);
            Audio.drone();
          }
        } else if (e.k === 'boss') {
          if (ed > 280) { e.vx += (ex / ed * 36 - e.vx) * (1 - Math.exp(-1 * dt)); e.vy += (ey / ed * 36 - e.vy) * (1 - Math.exp(-1 * dt)); }
          e.ring -= dt;
          if (e.ring <= 0 && ed < 640) {
            var nn = 8, off = rnd(0, 6.283), bs2 = G.kids ? 80 : 115;
            for (var q = 0; q < nn; q++) {
              var qa = off + q / nn * 6.283;
              G.eshots.push({ x: e.x, y: e.y, vx: Math.cos(qa) * bs2, vy: Math.sin(qa) * bs2, life: 4.5, r: 8, dmg: 8 });
            }
            e.ring = G.kids ? 7 : 5;
            Audio.drone();
          }
        }
        e.x += e.vx * dt; e.y += e.vy * dt;

        // ram the ship
        var cr = e.r + 11;
        if (ed < cr) {
          var nx = -ex / ed, ny = -ey / ed;   // from ship toward target
          s.vx -= nx * 220; s.vy -= ny * 220;
          e.vx += nx * 60; e.vy += ny * 60;
          var cd = e.k === 'boss' ? 14 : e.k === 'ast' ? 4 + e.tier * 2.5 : 5;
          Game.hurtShip(G, cd);
          Game.hurtEnt(G, e, D.damage * 1.5, false);
          s.x -= nx * (cr - ed) * 0.6; s.y -= ny * (cr - ed) * 0.6;
        }
        if (ed > despawn && e.k !== 'boss') e.dead = true;
      }
      G.ents = G.ents.filter(function (en) { return !en.dead; });
      if (G.bossAlive && G.bossAlive.dead) G.bossAlive = null;

      // --- enemy soft bolts ---
      for (i = G.eshots.length - 1; i >= 0; i--) {
        b = G.eshots[i];
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        var hd = Math.hypot(b.x - s.x, b.y - s.y);
        if (hd < b.r + 12) { Game.hurtShip(G, b.dmg); b.life = 0; }
        if (b.life <= 0) G.eshots.splice(i, 1);
      }

      // --- pickups ---
      var mr = G.magnet;
      for (i = G.pick.length - 1; i >= 0; i--) {
        var pk = G.pick[i];
        pk.age += dt;
        var pdx = s.x - pk.x, pdy = s.y - pk.y, pdist = Math.hypot(pdx, pdy) || 1;
        if (pdist < mr && pk.age > 0.25) {
          var pull = 240 + (mr - pdist) * 6;
          pk.vx += (pdx / pdist * pull - pk.vx) * (1 - Math.exp(-6 * dt));
          pk.vy += (pdy / pdist * pull - pk.vy) * (1 - Math.exp(-6 * dt));
        } else if (pdist < mr * 2.4 && pk.age > 0.5) {
          // passive players still collect: loose scrap slowly drifts toward the ship
          pk.vx += (pdx / pdist * 42 - pk.vx) * (1 - Math.exp(-2 * dt));
          pk.vy += (pdy / pdist * 42 - pk.vy) * (1 - Math.exp(-2 * dt));
        } else {
          pk.vx *= Math.exp(-2 * dt); pk.vy *= Math.exp(-2 * dt);
        }
        pk.x += pk.vx * dt; pk.y += pk.vy * dt;
        if (pdist < 20 && pk.age > 0.12) {
          if (pk.type === 'heal') {
            s.hp = Math.min(s.mhp, s.hp + s.mhp * 0.15);
            Game.text(G, s.x, s.y - 28, '+HULL', '#7dffb2', 15);
            Audio.heal();
          } else {
            G.scrap += pk.v; G.pend += pk.v; G.pendT = 0.45;
            if (pk.type === 'gem') { G.gems++; Audio.gem(); Game.burst(G, s.x, s.y, '#7fe8ff', 10, 120, 3); }
            else Audio.pickup();
          }
          G.pick.splice(i, 1);
        } else if (pk.age > 16) G.pick.splice(i, 1);
      }
      if (G.pend > 0) {
        G.pendT -= dt;
        if (G.pendT <= 0) { Game.text(G, s.x, s.y - 30, '+' + HH.fmt(G.pend), '#ffe27a', 16); G.pend = 0; }
      }

      // --- spawning ---
      G.spawnT -= dt;
      if (G.spawnT <= 0) {
        G.spawnT = 0.16;
        var want2 = Game.targetCount(G), cnt = 0, drones = 0, crates = 0;
        G.ents.forEach(function (en) { if (en.k === 'ast') cnt++; else if (en.k === 'drone') drones++; else if (en.k === 'crate') crates++; });
        var pr = G.t / G.dur;
        if (cnt < want2) {
          var made = 0;
          while (cnt < want2 && made < 3) {
            if (Game.spawn(G, 'ast', rnd(v.rv + 40, v.rv + 280))) { cnt++; } made++;
          }
        }
        var droneWant = G.t > 10 ? Math.floor((1 + pr * 3) * (1 + D.S.droneRate)) : 0;
        if (drones < droneWant && Math.random() < 0.25) Game.spawn(G, 'drone', v.rv + rnd(60, 220));
        var crateWant = Math.round((1 + pr * 2) * (1 + D.S.crateRate));
        if (crates < crateWant && Math.random() < 0.15) Game.spawn(G, 'crate', v.rv + rnd(40, 260));
        if (G.bossN === 0 && pr >= 0.42) {
          G.bossN = 1; G.bossAlive = Game.spawn(G, 'boss', v.rv + 120);
          Game.alert('Mini-boss asteroid inbound!'); Audio.alert();
        } else if (!G.boss2 && pr >= 0.76) {
          G.boss2 = true;
          if (Math.random() < 0.35 + D.S.bossChance) {
            G.bossAlive = Game.spawn(G, 'boss', v.rv + 120);
            Game.alert('Another mini-boss!'); Audio.alert();
          }
        }
      }

      // --- rings / particles / texts ---
      for (i = G.rings.length - 1; i >= 0; i--) { G.rings[i].t += dt; if (G.rings[i].t >= G.rings[i].life) G.rings.splice(i, 1); }
      for (i = G.parts.length - 1; i >= 0; i--) {
        var pa = G.parts[i];
        pa.life -= dt; pa.x += pa.vx * dt; pa.y += pa.vy * dt;
        pa.vx *= Math.exp(-2.4 * dt); pa.vy *= Math.exp(-2.4 * dt);
        if (pa.life <= 0) G.parts.splice(i, 1);
      }
      for (i = G.texts.length - 1; i >= 0; i--) { G.texts[i].t += dt; if (G.texts[i].t > 0.9) G.texts.splice(i, 1); }

      // --- clock ---
      var left = Math.ceil(G.dur - G.t);
      if (left <= 10 && left !== G.lastTick && left > 0) { G.lastTick = left; Audio.tick(); }
      if (G.t >= G.dur) Game.finish('time');
    },

    finish: function (reason) {
      var G = Game.G;
      if (!G || G.ended) return;
      G.ended = true;
      var s = Save.data, S = G.S;
      var credits = Math.floor(G.scrap * S.incomeMult);
      var scrap = Math.floor(G.scrap);
      var best = scrap > s.bestScrap, prev = s.lastRun ? s.lastRun.credits : 0;
      s.credits += credits;
      s.ascEarned += credits;
      s.lifetimeScrap += scrap;
      s.ascScrap += scrap;
      s.runs++;
      if (best) s.bestScrap = scrap;
      s.stats.kills += G.kills;
      s.stats.crates += G.crates;
      s.stats.drones += G.drones;
      s.stats.bosses += G.bosses;
      if (reason === 'time') s.stats.runsDone++;
      // salvage tracks the best of the last few runs (normalised to credits per minute)
      s.recentCpm.push(credits / (Math.max(G.t, 30) / 60));
      if (s.recentCpm.length > 5) s.recentCpm.shift();
      s.avgKills = s.avgKills ? s.avgKills * 0.7 + G.kills * 0.3 : G.kills;
      var sum = {
        reason: reason, scrap: scrap, credits: credits, mult: S.incomeMult, kills: G.kills,
        crates: G.crates, drones: G.drones, bosses: G.bosses, gems: G.gems, best: best,
        vsLast: prev > 0 ? credits / prev - 1 : null,
        time: Math.min(G.t, G.dur), kids: G.kids
      };
      if (Meta.questEvent) Meta.questEvent('run', sum);
      s.lastRun = sum;
      Save.save();
      Input.enable(false);
      Game.state = 'summary';
      if (reason === 'breach') Audio.hurt(); else Audio.win();
      if (Game.onEnd) Game.onEnd(sum);
    },

    toHangar: function () {
      Game.state = 'hangar';
      Game.G = null;
      Game.paused = false;
      Input.enable(false);
    }
  };
})();
