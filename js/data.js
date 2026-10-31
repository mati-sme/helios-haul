/* Helios Haul — static data: upgrades, prestige nodes, pets, goals */
(function () {
  'use strict';
  var HH = window.HH = window.HH || {};

  HH.VERSION = '2.0.0';
  HH.SAVE_KEY = 'helios-haul-save-v1';          // same key as v1: the v2 loader migrates in place
  HH.SAVE_BACKUP_KEY = 'helios-haul-save-v1-backup';
  HH.UNCAPPED = 1000;                            // node.max >= this reads as "no cap" in the UI

  /* ---------- economy tunables (the sim tunes these) ---------- */
  HH.ECON = {
    hpLin: 0.04, hpPow: 0.85,           // hpScale   = (1 + hpLin * levels) ^ hpPow     (enemy HP, levels only)
    valS0: 400, valGamma: 0.3,         // valueScale = (1 + spentThisAscension / valS0) ^ valGamma: sub-linear, so it never runs away or walls
    fxK: 1,                             // scale on the node-sum income effects (scrapValue, creditMult, ...)
    rankStep: 10, rankBonus: 0.03,      // Fleet Rank: every rankStep levels => +rankBonus credits
    markBonus: 0.3, markExp: 0.4,      // credits x (1 + markBonus * lifetimeMarks ^ markExp): every mark always adds, with mild diminishing returns
    markDiv: 100000, markPow: 0.5,        // marks = (ascEarned / markDiv) ^ markPow
    carryFrac: 0.8,                    // share of this ascension's earnings handed back as starting credits
    idleBase: 0.25, idleFloor: 6, idleW: 0.9,     // hangar salvage: min credits/sec, base share of best cpm
    offlineCapH: 8, offlineEff: 0.6,    // base offline cap (hours) and efficiency
    costK: 1, costLin: 0, costExp: 0, costW: 1.0, costBase: 5, oneOffK: 1, costMarks: 0.4,               // cost growth: (costMul-1)*costK, plus a global (1 + costLin*levels)
    timerCap: 45,                       // max seconds the run timer nodes can add (diminishing returns)
    questRunsMin: 1, questRunsMax: 3
  };
  HH.MILESTONES = [10, 25, 50, 100, 150, 200, 300, 400, 500, 700, 1000];
  HH.MS_KEYS = ['damage', 'fireRate', 'hull', 'shield', 'scrapValue', 'creditMult', 'scrapMult', 'droneValue',
    'bossValue', 'oreMult', 'tierValue', 'idleMult'];
  // number of x2 milestones reached at a level
  HH.msCount = function (lv) {
    var n = 0, i, M = HH.MILESTONES;
    for (i = 0; i < M.length && lv >= M[i]; i++) n++;
    return n;
  };
  HH.nextMilestone = function (lv) {
    var i, M = HH.MILESTONES;
    for (i = 0; i < M.length; i++) if (lv < M[i]) return M[i];
    return 0;
  };

  /* ---------- cosmetics & pets ---------- */
  HH.TRAILS = {
    cyan:   { name: 'Ion Cyan',    c: ['#5ff3ff', '#2a7bff'] },
    gold:   { name: 'Gold Wake',   c: ['#ffe27a', '#ff9d2e'] },
    plasma: { name: 'Plasma',      c: ['#ff7bf0', '#7a4dff'] },
    ember:  { name: 'Ember',       c: ['#ffb066', '#ff3d2e'] },
    aurora: { name: 'Aurora',      c: ['#7dffb2', '#3ad0ff'] },
    void:   { name: 'Void',        c: ['#b9a6ff', '#2a1a6a'] }
  };
  HH.HUDS = {
    cyan:    { name: 'Cyan',    c: '#5ff3ff' },
    gold:    { name: 'Gold',    c: '#ffd45e' },
    magenta: { name: 'Magenta', c: '#ff7bf0' },
    lime:    { name: 'Lime',    c: '#b6ff6a' }
  };
  HH.WEAPONS = {
    bolts:  { name: 'Bolts',      desc: 'Reliable single bolts.' },
    twin:   { name: 'Twin',       desc: 'Parallel cannons, steady damage.' },
    spread: { name: 'Spread',     desc: 'Wide fan of lighter shots.' },
    rail:   { name: 'Rail',       desc: 'Slow, huge, piercing slugs.' },
    nova:   { name: 'Nova Pulse', desc: 'Bolts plus a ring blast around the ship.' }
  };
  HH.PETS = {
    pipflare:  { name: 'Pipflare',   desc: 'A tiny flame sprite that bobs about.',    color: '#ffb066', shape: 'flame',  aura: { magnet: 0.05, luck: 0.01 } },
    dustmoth:  { name: 'Dustmoth',   desc: 'Flutters through stardust clouds.',        color: '#d7c4ff', shape: 'moth',   aura: { magnet: 0.06, luck: 0.01 } },
    orbitkit:  { name: 'Orbit Kit',  desc: 'A ringed pup that spins as it roams.',     color: '#5ff3ff', shape: 'ring',   aura: { magnet: 0.04, luck: 0.02 } },
    glimnewt:  { name: 'Glimnewt',   desc: 'Glowing newt that swims through space.',   color: '#7dffb2', shape: 'newt',   aura: { magnet: 0.05, luck: 0.02 } },
    cometcub:  { name: 'Cometcub',   desc: 'A playful comet pup with a long tail.',    color: '#ffe27a', shape: 'comet',  aura: { magnet: 0.07, luck: 0.01 } },
    starwhale: { name: 'Starwhale',  desc: 'A gentle calf drifting between stars.',    color: '#ff8fd1', shape: 'whale',  aura: { magnet: 0.06, luck: 0.03 } }
  };

  /* ---------- fx labelling ---------- */
  function pct(v) { return Math.round(v * 100) + '%'; }
  var FX_LABEL = {
    damage:       function (v) { return '+' + pct(v) + ' cannon damage'; },
    fireRate:     function (v) { return '+' + pct(v) + ' fire rate'; },
    multishot:    function (v) { return '+' + v + ' projectile' + (v > 1 ? 's' : ''); },
    pierce:       function (v) { return '+' + v + ' pierce'; },
    hull:         function (v) { return '+' + v + ' hull'; },
    shield:       function (v) { return '+' + v + ' shield'; },
    shieldRegen:  function (v) { return '+' + v + ' shield/sec'; },
    regen:        function (v) { return '+' + v + ' hull/sec'; },
    thrust:       function (v) { return '+' + pct(v) + ' thrust'; },
    magnet:       function (v) { return '+' + pct(v) + ' magnet radius'; },
    luck:         function (v) { return '+' + pct(v) + ' luck'; },
    scrapValue:   function (v) { return '+' + pct(v) + ' scrap value'; },
    oreChance:    function (v) { return '+' + pct(v) + ' rare ore chance'; },
    runTime:      function (v) { return '+' + v + 's run timer'; },
    creditMult:   function (v) { return '+' + pct(v) + ' credits on cash-out'; },
    scrapMult:    function (v) { return '+' + pct(v) + ' scrap collected'; },
    droneValue:   function (v) { return '+' + pct(v) + ' drone bounty'; },
    bossValue:    function (v) { return '+' + pct(v) + ' boss bounty'; },
    oreMult:      function (v) { return '+' + pct(v) + ' ore value'; },
    tierValue:    function (v) { return '+' + pct(v) + ' crystal/obsidian value'; },
    petSlots:     function (v) { return '+' + v + ' pet slot' + (v > 1 ? 's' : ''); },
    petAura:      function (v) { return '+' + pct(v) + ' pet aura'; },
    spawn:        function (v) { return '+' + pct(v) + ' asteroid density'; },
    droneRate:    function (v) { return '+' + pct(v) + ' drone traffic'; },
    crateRate:    function (v) { return '+' + pct(v) + ' cargo crates'; },
    bossChance:   function (v) { return '+' + pct(v) + ' mini-boss chance'; },
    startCredits: function (v) { return '+' + v + ' starting credits'; },
    keepCredits:  function (v) { return 'Keep ' + pct(v) + ' credits on ascend'; },
    marksMult:    function (v) { return '+' + pct(v) + ' Solar Marks'; },
    kidsBonus:    function (v) { return '+' + v + 's Kids Mode timer'; },
    compass:      function () { return 'Compass arrow to bosses & ore'; },
    scanner:      function () { return 'Ore scanner rings'; },
    anchor:       function () { return 'Unlocks Ascension (prestige)'; },
    weaponMode:   function (v) { return 'Unlocks ' + (HH.WEAPONS[v] ? HH.WEAPONS[v].name : v) + ' weapon'; },
    trail:        function (v) { return 'Unlocks ' + (HH.TRAILS[v] ? HH.TRAILS[v].name : v) + ' trail'; },
    hud:          function (v) { return 'Unlocks ' + (HH.HUDS[v] ? HH.HUDS[v].name : v) + ' HUD tint'; },
    pet:          function (v) { return 'Adopts ' + (HH.PETS[v] ? HH.PETS[v].name : v); },
    unlock:       function (v) { return 'Opens ' + v + ' sector'; },
    salvage:      function (v) { return '+' + pct(v) + ' hangar salvage efficiency'; },
    idleMult:     function (v) { return '+' + pct(v) + ' salvage income'; },
    offlineHours: function (v) { return '+' + v + 'h offline salvage cap'; }
  };
  var INCOME_KEYS = ['scrapValue', 'scrapMult', 'creditMult', 'tierValue', 'oreMult', 'droneValue', 'bossValue', 'idleMult'];
  HH.fxLines = function (fx, mult) {
    var out = [], k, v;
    mult = mult || 1;
    for (k in fx) {
      if (!Object.prototype.hasOwnProperty.call(fx, k) || !FX_LABEL[k]) continue;
      v = fx[k];
      if (typeof v === 'number') v = Math.round(v * mult * (INCOME_KEYS.indexOf(k) >= 0 ? HH.ECON.fxK : 1) * 1000) / 1000;
      out.push(FX_LABEL[k](v));
    }
    return out;
  };

  /* ---------- upgrade tree (Credits) ---------- */
  var UW = 2200, UH = 1600;
  HH.UPG_WORLD = { w: UW, h: UH };

  // [angle(deg), step] -> percent coords on a radial constellation
  function polar(a, s) {
    var r = 13 + s * 7.6, rad = a * Math.PI / 180;
    return { x: 50 + r * Math.cos(rad) * 1.05, y: 50 + r * Math.sin(rad) };
  }

  var UBR = {
    hull:     { name: 'Hull',        color: '#7dffb2', glyph: '⬢' },
    thrust:   { name: 'Thrusters',   color: '#5ff3ff', glyph: '➤' },
    cannon:   { name: 'Cannons',     color: '#ff7a5c', glyph: '✦' },
    magnet:   { name: 'Magnet',      color: '#c79bff', glyph: '◎' },
    luck:     { name: 'Luck',        color: '#ffe27a', glyph: '★' },
    shield:   { name: 'Shield',      color: '#6aa8ff', glyph: '◈' },
    value:    { name: 'Asteroid Value', color: '#ffd45e', glyph: '◆' },
    timer:    { name: 'Run Timer',   color: '#5effc2', glyph: '◷' },
    salvage:  { name: 'Salvage',     color: '#9fe8ff', glyph: '❂' },
    pets:     { name: 'Pets',        color: '#ff8fd1', glyph: '❖' },
    qol:      { name: 'Systems',     color: '#e6f1ff', glyph: '⚙' },
    field:    { name: 'Sector Field', color: '#ffa86a', glyph: '☄' }
  };
  HH.UPG_BRANCHES = UBR;

  var UN = HH.UNCAPPED;
  // id, name, branch, [angle, step], cost, max, costMul, fx, req, desc
  // (v1 ids are all kept; every max is >= its v1 max so old saves stay valid)
  var U = [
    ['hull1', 'Plating', 'hull', [-90, 0], 20, UN, 1.13, { hull: 25 }, [], 'Bolt-on plates to shrug off bumps.'],
    ['hull2', 'Reinforced Ribs', 'hull', [-90, 1], 250, UN, 1.14, { hull: 40 }, ['hull1'], 'Cross-braced frame, tougher hull.'],
    ['hull3', 'Ceramic Weave', 'hull', [-90, 2], 2500, UN, 1.15, { hull: 80 }, ['hull2'], 'Layered ceramic skin.'],
    ['hull4', 'Bulwark Core', 'hull', [-90, 3], 25000, UN, 1.16, { hull: 150 }, ['hull3'], 'A reactor-grade armor core.'],
    ['hull5', 'Graphene Lattice', 'hull', [-90, 4], 350000, UN, 1.17, { hull: 300 }, ['hull4'], 'One-atom-thick, impossibly strong.'],

    ['thr1', 'Ion Nozzles', 'thrust', [-57, 0], 25, 10, 1.3, { thrust: 0.08 }, [], 'Cleaner burn, snappier ship.'],
    ['thr2', 'Vector Fins', 'thrust', [-57, 1], 300, 8, 1.35, { thrust: 0.10 }, ['thr1'], 'Steer harder into the turn.'],
    ['thr3', 'Afterburner Coils', 'thrust', [-57, 2], 2500, 6, 1.4, { thrust: 0.15 }, ['thr2'], 'Burst of extra push.'],
    ['thr4', 'Inertial Dampers', 'thrust', [-57, 3], 18000, 5, 1.5, { thrust: 0.22 }, ['thr3'], 'Fly fast, stop faster.'],
    ['thr5', 'Warp Gimbals', 'thrust', [-57, 4], 250000, 4, 1.6, { thrust: 0.30 }, ['thr4'], 'Vectored thrust, almost no drift.'],

    ['can1', 'Focused Bolts', 'cannon', [-24, 0], 15, UN, 1.11, { damage: 0.12 }, [], 'Tighter beams hit harder.'],
    ['can2', 'Rapid Coils', 'cannon', [-24, 1], 40, UN, 1.12, { fireRate: 0.10 }, ['can1'], 'Cycle the cannons faster.'],
    ['can5', 'Overcharged Cells', 'cannon', [-24, 2], 2500, UN, 1.13, { damage: 0.20 }, ['can3'], 'More punch per shot.'],
    ['can6', 'Overclock Gate', 'cannon', [-24, 3], 6000, UN, 1.14, { fireRate: 0.15 }, ['can4'], 'Run the cannons hot.'],
    ['can8', 'Singularity Rounds', 'cannon', [-24, 4], 60000, UN, 1.15, { damage: 0.30 }, ['can7'], 'Rounds that fold space.'],
    ['can3', 'Twin Emitter', 'cannon', [8, 1], 600, 3, 3.0, { multishot: 1 }, ['can2'], 'One more bolt per volley.'],
    ['can4', 'Piercing Lens', 'cannon', [-6, 2], 900, 2, 3.0, { pierce: 1 }, ['can2'], 'Shots slice through a target.'],
    ['can7', 'Triple Array', 'cannon', [8, 3], 25000, 2, 3.5, { multishot: 1 }, ['can5'], 'Another emitter online.'],
    ['can9', 'Fusion Lances', 'cannon', [-40.5, 3], 150000, UN, 1.15, { damage: 0.45 }, ['can5'], 'Star-core energy down the barrel.'],
    ['can10', 'Quantum Coils', 'cannon', [-40.5, 4], 1800000, UN, 1.16, { fireRate: 0.25 }, ['can9'], 'Fire before the last shot lands.'],
    ['can11', 'Antimatter Core', 'cannon', [-10, 4], 9000000, UN, 1.16, { damage: 0.90 }, ['can8'], 'Annihilation, on demand.'],

    ['mag1', 'Scoop Field', 'magnet', [42, 0], 18, 6, 1.4, { magnet: 0.20 }, [], 'Pull scrap in from further away.'],
    ['mag2', 'Grav Lens', 'magnet', [42, 1], 350, 5, 1.5, { magnet: 0.25 }, ['mag1'], 'Focused gravity.'],
    ['mag3', 'Tractor Spine', 'magnet', [42, 2], 4000, 3, 1.7, { magnet: 0.40 }, ['mag2'], 'A long reach tractor.'],
    ['mag4', 'Event Horizon', 'magnet', [42, 3], 40000, 2, 2.2, { magnet: 0.60 }, ['mag3'], 'Nothing escapes.'],

    ['luk1', 'Lucky Charm', 'luck', [75, 0], 60, 12, 1.3, { luck: 0.05 }, [], 'More gems and crits.'],
    ['luk2', "Prospector's Eye", 'luck', [75, 1], 500, 10, 1.35, { oreChance: 0.04 }, ['luk1'], 'Spot rare ore veins.'],
    ['luk3', 'Stardust Sense', 'luck', [75, 2], 5000, 8, 1.4, { luck: 0.08 }, ['luk2'], 'Fortune follows the bold.'],
    ['luk4', 'Fortune Engine', 'luck', [75, 3], 50000, 6, 1.5, { luck: 0.12, oreChance: 0.03 }, ['luk3'], 'Probability, tuned.'],

    ['shd1', 'Deflector', 'shield', [108, 0], 90, 20, 1.2, { shield: 20 }, [], 'A shield that recharges when safe.'],
    ['shd2', 'Capacitor Bank', 'shield', [108, 1], 900, 15, 1.25, { shield: 30, shieldRegen: 0.5 }, ['shd1'], 'Bigger buffer, faster recharge.'],
    ['shd3', 'Phase Mantle', 'shield', [108, 2], 9000, 10, 1.3, { shield: 60 }, ['shd2'], 'Phase-shifted barrier.'],
    ['shd4', 'Aegis Matrix', 'shield', [108, 3], 60000, 8, 1.4, { shield: 100, shieldRegen: 1 }, ['shd3'], 'Legendary shield lattice.'],

    ['val1', 'Sharper Assay', 'value', [141, 0], 30, UN, 1.11, { scrapValue: 0.12 }, [], 'Rocks drop richer scrap.'],
    ['val2', 'Smelter Link', 'value', [141, 1], 600, UN, 1.12, { scrapValue: 0.15 }, ['val1'], 'Better refining on the fly.'],
    ['val5', 'Refinery Contracts', 'value', [141, 2], 8000, UN, 1.13, { scrapValue: 0.20 }, ['val2'], 'Long-term buyer deals.'],
    ['val8', 'Crystal Futures', 'value', [141, 3], 90000, UN, 1.14, { tierValue: 0.30 }, ['val5'], 'Pre-sell crystal and obsidian hauls.'],
    ['val9', 'Galactic Exchange', 'value', [141, 4], 900000, UN, 1.15, { scrapMult: 0.25 }, ['val8'], 'List your scrap across the arm.'],
    ['val3', 'Drone Bounty', 'value', [158, 1], 1200, UN, 1.13, { droneValue: 0.25 }, ['val1'], 'Scavengers carry a reward.'],
    ['val4', 'Boss Bounty', 'value', [160, 2], 2000, UN, 1.14, { bossValue: 0.30 }, ['val3'], 'Big rocks, big payouts.'],
    ['val11', 'Dyson Brokerage', 'value', [158, 3], 5000000, UN, 1.15, { scrapValue: 0.40 }, ['val4'], 'A swarm of brokers around the sun.'],
    ['val12', 'Stellar Treasury', 'value', [160, 4], 60000000, UN, 1.16, { creditMult: 0.30 }, ['val11'], 'Banking at stellar scale.'],
    ['val6', 'Futures Desk', 'value', [124.5, 2], 3500, UN, 1.13, { creditMult: 0.08 }, ['val2'], 'Better rates on every cash-out.'],
    ['val7', 'Ore Contracts', 'value', [124.5, 3], 35000, UN, 1.14, { oreMult: 0.25 }, ['val6'], 'Rare ore sells high.'],
    ['val10', 'Sun Bonds', 'value', [124.5, 4], 1500000, UN, 1.15, { creditMult: 0.20 }, ['val7'], 'Bonds backed by the sun itself.'],

    ['tim1', 'Fuel Tanks', 'timer', [174, 0], 120, 5, 1.8, { runTime: 6 }, [], 'Stay out in the field longer.'],
    ['tim2', 'Hot Swap Cells', 'timer', [174, 1], 1500, 4, 2.0, { runTime: 8 }, ['tim1'], 'Swap batteries mid-flight.'],
    ['tim3', 'Chrono Lens', 'timer', [174, 2], 14000, 3, 2.6, { runTime: 10 }, ['tim2'], 'Stretch the final minutes.'],
    ['tim4', 'Time Crystal', 'timer', [174, 3], 150000, 3, 3.0, { runTime: 12 }, ['tim3'], 'A second of crystal, a minute of fuel.'],

    ['sal1', 'Salvage Drones', 'salvage', [190.5, 1], 100, 25, 1.22, { salvage: 0.02 }, [], 'Little drones work the hangar while you rest.'],
    ['sal2', 'Auto-Refinery', 'salvage', [190.5, 2], 2000, UN, 1.14, { idleMult: 0.15 }, ['sal1'], 'Hangar salvage pays more.'],
    ['sal3', 'Deep Storage', 'salvage', [190.5, 3], 12000, 16, 1.3, { offlineHours: 1 }, ['sal2'], 'Salvage keeps piling up for longer while away.'],
    ['sal4', 'Orbital Foundry', 'salvage', [190.5, 4], 800000, UN, 1.16, { idleMult: 0.50 }, ['sal3'], 'A foundry in orbit never sleeps.'],

    ['pet1', 'Pet Bay', 'pets', [207, 0], 400, 1, 1, { petSlots: 1, pet: 'pipflare' }, [], 'Adopt Pipflare, who wanders on its own.'],
    ['pet2', 'Dustmoth Cage', 'pets', [207, 1], 3000, 1, 1, { pet: 'dustmoth' }, ['pet1'], 'A moth that loves stardust.'],
    ['pet3', 'Second Perch', 'pets', [207, 2], 9000, 1, 1, { petSlots: 1 }, ['pet2'], 'Room for another escort.'],
    ['pet4', 'Companion Bond', 'pets', [207, 3], 60000, 6, 1.6, { petAura: 0.2 }, ['pet3'], 'Pets glow brighter, auras grow.'],

    ['qol1', 'Repair Kit', 'qol', [240, 0], 150, 12, 1.3, { regen: 0.4 }, [], 'Slow hull regeneration.'],
    ['qol2', 'Compass', 'qol', [240, 1], 800, 1, 1, { compass: 1 }, ['qol1'], 'Arrow toward bosses and rare ore.'],
    ['qol3', 'Cargo Scanner', 'qol', [222, 2], 1800, 1, 1, { scanner: 1 }, ['qol2'], 'Rare ore glints on your map.'],
    ['anchor', 'Solar Anchor', 'qol', [255, 4], 1600000, 1, 1, { anchor: 1 }, [], 'Moor your fleet to the sun. Unlocks Ascension.'],

    ['spn1', 'Dense Field', 'field', [58.5, 2], 5000, 15, 1.3, { spawn: 0.06 }, ['mag2'], 'More asteroids drift into range.'],
    ['spn2', 'Drone Lure', 'field', [58.5, 3], 20000, 10, 1.35, { droneRate: 0.10 }, ['spn1'], 'More scavenger drones to pop.'],
    ['spn3', 'Crate Beacon', 'field', [91.5, 3], 50000, 10, 1.35, { crateRate: 0.10 }, ['luk3'], 'More cargo crates drift by.']
  ];

  HH.UPGRADES = U.map(function (a) {
    var p = polar(a[3][0], a[3][1]);
    return {
      id: a[0], name: a[1], branch: a[2], x: p.x, y: p.y,
      cost: a[4], max: a[5], costMul: a[6], fx: a[7], req: a[8], desc: a[9]
    };
  });

  /* ---------- prestige tree (Solar Marks) ---------- */
  var PW = 3200, PH = 2100;
  HH.PRE_WORLD = { w: PW, h: PH };

  var BRANCH_X = [8, 19.7, 31.4, 43.1, 54.8, 66.5, 78.2, 89.9];
  // diamond-ladder pattern: [dx, row, reqIdx[]]
  var PAT = [
    [0, 0, []], [-3.5, 1, [0]], [3.5, 1, [0]], [0, 2, [1, 2]], [-3.5, 3, [3]], [3.5, 3, [3]],
    [0, 4, [4, 5]], [-3.5, 5, [6]], [3.5, 5, [6]], [0, 6, [7, 8]]
  ];

  // each node: [name, desc, cost, fx, extraReq?]
  var PB = [
    { id: 'fleet', name: 'Fleet Brands', glyph: '✦', color: '#4dd0ff', nodes: [
      ['Vanguard Hull', 'Standard issue plating from Vanguard Yards.', 1, { hull: 20 }],
      ['Spark Foundry', 'Hotter bolts, cooler pilots.', 2, { damage: 0.10 }],
      ['Gale Works', 'Light, quick thrusters.', 3, { thrust: 0.08 }],
      ['Bastion Yards', 'Tough bulkheads.', 6, { hull: 40 }],
      ['Photon Smiths', 'Precision cannon barrels.', 10, { damage: 0.15 }],
      ['Tempest Drives', 'Storm-grade engines.', 16, { thrust: 0.12 }],
      ['Titan Keel', 'A keel built to last.', 40, { hull: 80 }],
      ['Quasar Arms', 'Massive output capacitors.', 90, { damage: 0.25 }],
      ['Aether Racing', 'Race-tuned drives and cannons.', 220, { thrust: 0.20, fireRate: 0.10 }],
      ['Flagship Charter', 'Your fleet is a legend.', 600, { hull: 150, damage: 0.40 }]
    ] },
    { id: 'sector', name: 'Galaxy Sectors', glyph: '☄', color: '#8b7bff', nodes: [
      ['Dust Lanes', 'Denser asteroid traffic.', 1, { spawn: 0.10 }],
      ['Crystal Reach', 'Crystal asteroids appear.', 3, { unlock: 'crystal' }],
      ['Scavenger Alley', 'More scavenger drones to pop.', 5, { droneRate: 0.25 }],
      ['Rich Veins', 'Rare ore shows up more often.', 8, { oreChance: 0.05 }],
      ['Obsidian Belt', 'Obsidian asteroids appear.', 25, { unlock: 'obsidian' }],
      ["Giants' Graveyard", 'Mini-bosses are likelier.', 40, { bossChance: 0.25 }],
      ['Crate Convoys', 'More cargo crates drift by.', 60, { crateRate: 0.30 }],
      ['Prism Storm', 'Even denser fields.', 150, { spawn: 0.20 }],
      ['Heart of Helios', 'Crystal & obsidian pay more.', 400, { tierValue: 0.30 }]
    ] },
    { id: 'vault', name: 'Vault Multipliers', glyph: '◆', color: '#ffd45e', nodes: [
      ['Petty Cash', 'A little extra at cash-out.', 1, { creditMult: 0.10 }],
      ['Scrap Press', 'Squeeze more from scrap.', 3, { scrapMult: 0.10 }],
      ['Seed Capital', 'Start each ascension with credits.', 4, { startCredits: 50 }],
      ['Ore Brokers', 'Rare ore sells high.', 10, { oreMult: 0.50 }],
      ['Credit Syndicate', 'Better exchange rates.', 20, { creditMult: 0.20 }],
      ['Compound Interest', 'Keep some credits when you ascend.', 30, { keepCredits: 0.10 }],
      ['Scrap Reactor', 'Everything yields more.', 60, { scrapMult: 0.25 }],
      ['Merchant Guild', 'Guild discounts on everything.', 140, { creditMult: 0.40 }],
      ['Golden Ledger', 'Ore and scrap both soar.', 350, { scrapMult: 0.40, oreMult: 1.0 }],
      ['Marks Exchange', 'More Solar Marks per ascension.', 800, { marksMult: 0.20 }]
    ] },
    { id: 'arsenal', name: 'Arsenal', glyph: '✹', color: '#ff7a5c', nodes: [
      ['Twin Cannons', 'Unlocks the Twin weapon.', 2, { weaponMode: 'twin' }],
      ['Barrel Tuning', 'Slightly stronger shots.', 4, { damage: 0.08 }],
      ['Spread Shot', 'Unlocks the Spread weapon.', 8, { weaponMode: 'spread' }],
      ['Heavy Slugs', 'Shots pierce one more target.', 14, { pierce: 1 }],
      ['Rail Mount', 'Unlocks the Rail weapon.', 25, { weaponMode: 'rail' }],
      ['Nova Pulse', 'Unlocks the Nova Pulse weapon.', 45, { weaponMode: 'nova' }],
      ['Capacitor Rail', 'Faster cycling.', 80, { fireRate: 0.12 }],
      ['Chain Lens', 'An extra projectile.', 200, { multishot: 1 }],
      ['Supernova Core', 'The ultimate arsenal upgrade.', 500, { damage: 0.30, pierce: 1 }]
    ] },
    { id: 'chronos', name: 'Chronos', glyph: '◷', color: '#5effc2', nodes: [
      ['Extra Fuel', 'A longer run.', 1, { runTime: 10 }],
      ['Cadet Charter', 'Kids Mode runs even longer.', 3, { kidsBonus: 30 }],
      ['Time Dilator', 'Seconds feel stretchy.', 8, { runTime: 10 }],
      ['Safe Harbor', 'A small starting shield.', 10, { shield: 30 }],
      ['Long Haul', 'Longer trips.', 30, { runTime: 15 }],
      ['Pause Field', 'Gentle hull regeneration.', 45, { regen: 1 }],
      ['Chrono Lens', 'More time still.', 100, { runTime: 20 }],
      ['Family Fleet', 'Even longer Kids Mode.', 150, { kidsBonus: 45 }],
      ['Eternal Hour', 'An age of exploring.', 400, { runTime: 30 }]
    ] },
    { id: 'pets', name: 'Companions', glyph: '❖', color: '#ff8fd1', nodes: [
      ['Pet Hatch', 'A pet slot and Pipflare.', 2, { petSlots: 1, pet: 'pipflare' }],
      ['Orbit Kit', 'Adopt the Orbit Kit.', 6, { pet: 'orbitkit' }],
      ['Companion Perch', 'Another pet slot.', 20, { petSlots: 1 }],
      ['Dustmoth Den', 'Adopt Dustmoth.', 14, { pet: 'dustmoth' }],
      ['Glimnewt Pond', 'Adopt Glimnewt.', 35, { pet: 'glimnewt' }],
      ['Pack Bond', 'Pet auras are stronger.', 50, { petAura: 0.5 }],
      ['Cometcub Nest', 'Adopt Cometcub.', 90, { pet: 'cometcub' }],
      ['Third Perch', 'A third pet slot.', 250, { petSlots: 1 }],
      ['Starwhale Calf', 'Adopt the Starwhale calf.', 500, { pet: 'starwhale' }]
    ] },
    { id: 'cosmetic', name: 'Cosmetics', glyph: '✧', color: '#c0f0ff', nodes: [
      ['Gold Wake', 'Gold engine trail.', 1, { trail: 'gold' }],
      ['Gold HUD', 'Warm gold HUD tint.', 2, { hud: 'gold' }],
      ['Plasma Trail', 'Purple plasma trail.', 5, { trail: 'plasma' }],
      ['Magenta HUD', 'Magenta HUD tint.', 6, { hud: 'magenta' }],
      ['Ember Trail', 'Burning ember trail.', 12, { trail: 'ember' }],
      ['Lime HUD', 'Lime HUD tint.', 15, { hud: 'lime' }],
      ['Aurora Trail', 'Shimmering aurora trail.', 40, { trail: 'aurora' }],
      ['Racing Stripes', 'Looks fast, feels lucky.', 80, { luck: 0.03 }],
      ['Void Trail', 'A trail of deep violet.', 200, { trail: 'void' }]
    ] },
    { id: 'deep', name: 'Deep Core', glyph: '✺', color: '#fff2b8', nodes: [
      ['Core Ignition', 'The deep core wakes.', 100, { damage: 0.25 }, ['fleet5', 'vault5']],
      ['Singularity Wells', 'Reach across the void.', 160, { magnet: 0.50 }],
      ['Event Horizon Vault', 'A bottomless ledger.', 300, { creditMult: 0.50 }],
      ['Ascendant Hull', 'Hull and shield, ascended.', 500, { hull: 200, shield: 100 }],
      ['Helios Resonance', 'Scrap sings with the sun.', 900, { scrapMult: 0.50 }],
      ['Stellar Forge', 'Cannons forged in a star.', 1500, { damage: 0.50, fireRate: 0.20 }],
      ['Cosmic Ledger', 'More Solar Marks forever.', 2500, { marksMult: 0.30 }, ['arsenal6']],
      ['Time Weaver', 'Weave the minutes.', 4000, { runTime: 30 }],
      ['Nova Ascension', 'Everything doubles.', 7500, { creditMult: 1.0, scrapMult: 1.0 }],
      ['Heart of the Galaxy', 'The final goal.', 15000, { damage: 1.0, hull: 500, bossValue: 1.0 }, ['chronos7', 'pets6']]
    ] }
  ];
  HH.PRE_BRANCHES = PB.map(function (b) { return { id: b.id, name: b.name, glyph: b.glyph, color: b.color }; });

  // v2 rescale: cheap nodes stay cheap, late nodes grow (cost x cost/28) so the map keeps giving purchases for ~10 h
  function preCost(c) { return Math.round(c * Math.max(1, c / 28)); }

  HH.PRESTIGE = (function () {
    var out = [{
      id: 'core', name: 'Helios Core', branch: 'core', x: 50, y: 3, cost: 1, max: 1, costMul: 1,
      req: [], fx: { hull: 10 }, desc: 'The heart of your fleet. Every branch grows from here.'
    }];
    PB.forEach(function (b, bi) {
      var ids = [];
      b.nodes.forEach(function (n, i) {
        var pat = PAT[i];
        var id = b.id + (i + 1);
        var req = pat[2].length ? pat[2].map(function (j) { return ids[j]; }) : ['core'];
        if (n[4]) req = req.concat(n[4]);
        ids.push(id);
        out.push({
          id: id, name: n[0], desc: n[1], branch: b.id,
          x: Math.min(95, Math.max(5, BRANCH_X[bi] + pat[0])),
          y: 12 + pat[1] * 13,
          cost: preCost(n[2]), max: 1, costMul: 1, fx: n[3], req: req
        });
      });
    });
    return out;
  })();

  /* ---------- goals chain ---------- */
  HH.GOALS = [
    { id: 'g_first', name: 'First Blood', desc: 'Destroy your first target.', target: 1, reward: { credits: 30 }, prog: function (s) { return s.stats.kills; } },
    { id: 'g_scrap', name: 'Pocket Change', desc: 'Collect 150 scrap in total.', target: 150, reward: { credits: 60 }, prog: function (s) { return s.lifetimeScrap; } },
    { id: 'g_buy3', name: 'Tinkerer', desc: 'Buy 3 upgrade levels.', target: 3, reward: { credits: 100 }, prog: function (s) { return s.stats.buys; } },
    { id: 'g_run', name: 'Full Tank', desc: 'Survive a whole run until the timer ends.', target: 1, reward: { credits: 150 }, prog: function (s) { return s.stats.runsDone; } },
    { id: 'g_crate', name: 'Crate Cracker', desc: 'Crack open 5 cargo crates.', target: 5, reward: { credits: 200 }, prog: function (s) { return s.stats.crates; } },
    { id: 'g_drone', name: 'Drone Popper', desc: 'Pop 5 scavenger drones.', target: 5, reward: { credits: 350 }, prog: function (s) { return s.stats.drones; } },
    { id: 'g_buy15', name: 'Hangar Regular', desc: 'Buy 15 upgrade levels.', target: 15, reward: { credits: 600 }, prog: function (s) { return s.stats.buys; } },
    { id: 'g_boss', name: 'Giant Slayer', desc: 'Break a mini-boss asteroid.', target: 1, reward: { credits: 1200 }, prog: function (s) { return s.stats.bosses; } },
    { id: 'g_anchor', name: 'Drop Anchor', desc: 'Build the Solar Anchor.', target: 1, reward: { credits: 3000 }, prog: function (s) { return (s.upg.anchor || 0) + (s.stats.anchored ? 1 : 0) > 0 ? 1 : 0; } },
    { id: 'g_asc', name: 'Ascend', desc: 'Ascend for the first time.', target: 1, reward: { marks: 5 }, prog: function (s) { return s.ascensions; } },
    { id: 'g_pre5', name: 'Starmapper', desc: 'Buy 5 prestige nodes.', target: 5, reward: { marks: 10 }, prog: function (s) { return Object.keys(s.pre).length; } },
    { id: 'g_big', name: 'Hundred Thousand', desc: 'Haul 100,000 scrap in total.', target: 100000, reward: { marks: 40 }, prog: function (s) { return s.lifetimeScrap; } }
  ];

  HH.fmt = function (n) {
    n = Math.floor(n);
    if (!isFinite(n)) return '∞';
    if (n < 10000) return String(n);
    var u = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'], i = 0, v = n;
    for (var a = 0; a < 26; a++) for (var b = 0; b < 26; b++) u.push(String.fromCharCode(97 + a, 97 + b));
    while (v >= 999.5 && i < u.length - 1) { v /= 1000; i++; }
    var s = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
    if (s.indexOf('.') >= 0) s = s.replace(/\.?0+$/, '');
    return s + u[i];
  };

  // goals keep going for the whole game: later rewards are "runs" = that many runs' worth of credits
  (function () {
    var G = HH.GOALS;
    function add(id, name, desc, target, reward, prog) { G.push({ id: id, name: name, desc: desc, target: target, reward: reward, prog: prog }); }
    var buys = function (s) { return s.stats.buys; }, scrap = function (s) { return s.lifetimeScrap; };
    var kills = function (s) { return s.stats.kills; }, runs = function (s) { return s.runs; };
    var pre = function (s) { return Object.keys(s.pre).length; }, asc = function (s) { return s.ascensions; };
    var bosses = function (s) { return s.stats.bosses; }, crates = function (s) { return s.stats.crates; };
    var drones = function (s) { return s.stats.drones; };
    var steps = [
      ['b', 30], ['k', 300], ['s', 1e6], ['r', 15], ['b', 50], ['a', 2], ['c', 40], ['k', 1000], ['b', 80], ['s', 1e7],
      ['p', 10], ['d', 40], ['r', 40], ['b', 120], ['a', 3], ['o', 8], ['k', 3000], ['s', 1e8], ['b', 170], ['p', 18],
      ['a', 5], ['c', 120], ['r', 80], ['b', 230], ['s', 1e9], ['k', 10000], ['d', 120], ['o', 25], ['a', 8], ['b', 300],
      ['p', 30], ['s', 1e10], ['r', 150], ['b', 400], ['k', 30000], ['a', 12], ['c', 400], ['b', 520], ['s', 1e11],
      ['p', 45], ['o', 80], ['a', 20], ['b', 660], ['k', 100000], ['s', 1e12], ['r', 300], ['b', 820], ['p', 60],
      ['a', 30], ['b', 1000], ['s', 1e14], ['k', 1000000]
    ];
    steps.forEach(function (st, i) {
      var k = st[0], n = st[1], id = 'g_x' + i, w = 1.5 + (i % 3) * 0.75;
      if (k === 'b') add(id, 'Upgrade Run ' + n, 'Buy ' + n + ' upgrade levels in total.', n, { runs: w }, buys);
      else if (k === 'k') add(id, 'Rock Breaker ' + HH.fmt(n), 'Destroy ' + HH.fmt(n) + ' targets.', n, { runs: w }, kills);
      else if (k === 's') add(id, 'Hauler ' + HH.fmt(n), 'Haul ' + HH.fmt(n) + ' scrap in total.', n, { runs: w + 1 }, scrap);
      else if (k === 'r') add(id, 'Frequent Flyer ' + n, 'Fly ' + n + ' runs.', n, { runs: w }, runs);
      else if (k === 'p') add(id, 'Star Chart ' + n, 'Own ' + n + ' prestige nodes.', n, { marks: Math.max(5, n) }, pre);
      else if (k === 'a') add(id, 'Ascension ' + n, 'Ascend ' + n + ' times.', n, { marks: n * 5 }, asc);
      else if (k === 'c') add(id, 'Cargo Baron ' + n, 'Crack open ' + n + ' cargo crates.', n, { runs: w }, crates);
      else if (k === 'd') add(id, 'Drone Hunter ' + n, 'Pop ' + n + ' scavenger drones.', n, { runs: w }, drones);
      else add(id, 'Giant Hunter ' + n, 'Break ' + n + ' mini-bosses.', n, { runs: w }, bosses);
    });
  })();

})();
