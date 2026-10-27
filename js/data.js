/* Helios Haul — static data: upgrades, prestige nodes, pets, goals */
(function () {
  'use strict';
  var HH = window.HH = window.HH || {};

  HH.VERSION = '1.0.0';
  HH.SAVE_KEY = 'helios-haul-save-v1';

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
    unlock:       function (v) { return 'Opens ' + v + ' sector'; }
  };
  HH.fxLines = function (fx, mult) {
    var out = [], k, v;
    mult = mult || 1;
    for (k in fx) {
      if (!Object.prototype.hasOwnProperty.call(fx, k) || !FX_LABEL[k]) continue;
      v = fx[k];
      if (typeof v === 'number') v = Math.round(v * mult * 1000) / 1000;
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
    pets:     { name: 'Pets',        color: '#ff8fd1', glyph: '❖' },
    qol:      { name: 'Systems',     color: '#e6f1ff', glyph: '⚙' }
  };
  HH.UPG_BRANCHES = UBR;

  // id, name, branch, [angle, step], cost, max, costMul, fx, req, desc
  var U = [
    ['hull1', 'Plating', 'hull', [-90, 0], 20, 5, 1.55, { hull: 25 }, [], 'Bolt-on plates to shrug off bumps.'],
    ['hull2', 'Reinforced Ribs', 'hull', [-90, 1], 220, 4, 1.7, { hull: 40 }, ['hull1'], 'Cross-braced frame, tougher hull.'],
    ['hull3', 'Ceramic Weave', 'hull', [-90, 2], 1800, 3, 2.0, { hull: 80 }, ['hull2'], 'Layered ceramic skin.'],
    ['hull4', 'Bulwark Core', 'hull', [-90, 3], 15000, 2, 3.0, { hull: 150 }, ['hull3'], 'A reactor-grade armor core.'],

    ['thr1', 'Ion Nozzles', 'thrust', [-57, 0], 25, 5, 1.5, { thrust: 0.08 }, [], 'Cleaner burn, snappier ship.'],
    ['thr2', 'Vector Fins', 'thrust', [-57, 1], 300, 4, 1.65, { thrust: 0.10 }, ['thr1'], 'Steer harder into the turn.'],
    ['thr3', 'Afterburner Coils', 'thrust', [-57, 2], 2500, 3, 1.9, { thrust: 0.15 }, ['thr2'], 'Burst of extra push.'],
    ['thr4', 'Inertial Dampers', 'thrust', [-57, 3], 18000, 2, 3.0, { thrust: 0.22 }, ['thr3'], 'Fly fast, stop faster.'],

    ['can1', 'Focused Bolts', 'cannon', [-24, 0], 15, 8, 1.5, { damage: 0.12 }, [], 'Tighter beams hit harder.'],
    ['can2', 'Rapid Coils', 'cannon', [-24, 1], 40, 8, 1.55, { fireRate: 0.10 }, ['can1'], 'Cycle the cannons faster.'],
    ['can5', 'Overcharged Cells', 'cannon', [-24, 2], 3500, 6, 1.7, { damage: 0.20 }, ['can3'], 'More punch per shot.'],
    ['can6', 'Overclock Gate', 'cannon', [-24, 3], 6000, 5, 1.7, { fireRate: 0.15 }, ['can4'], 'Run the cannons hot.'],
    ['can8', 'Singularity Rounds', 'cannon', [-24, 4], 60000, 3, 2.6, { damage: 0.30 }, ['can7'], 'Rounds that fold space.'],
    ['can3', 'Twin Emitter', 'cannon', [8, 1], 600, 3, 3.0, { multishot: 1 }, ['can2'], 'One more bolt per volley.'],
    ['can4', 'Piercing Lens', 'cannon', [-6, 2], 900, 2, 3.0, { pierce: 1 }, ['can2'], 'Shots slice through a target.'],
    ['can7', 'Triple Array', 'cannon', [8, 3], 25000, 2, 3.5, { multishot: 1 }, ['can5'], 'Another emitter online.'],

    ['mag1', 'Scoop Field', 'magnet', [42, 0], 18, 6, 1.5, { magnet: 0.20 }, [], 'Pull scrap in from further away.'],
    ['mag2', 'Grav Lens', 'magnet', [42, 1], 350, 5, 1.6, { magnet: 0.25 }, ['mag1'], 'Focused gravity.'],
    ['mag3', 'Tractor Spine', 'magnet', [42, 2], 4000, 3, 1.9, { magnet: 0.40 }, ['mag2'], 'A long reach tractor.'],
    ['mag4', 'Event Horizon', 'magnet', [42, 3], 40000, 2, 3.0, { magnet: 0.60 }, ['mag3'], 'Nothing escapes.'],

    ['luk1', 'Lucky Charm', 'luck', [75, 0], 60, 5, 1.7, { luck: 0.05 }, [], 'More gems and crits.'],
    ['luk2', "Prospector's Eye", 'luck', [75, 1], 500, 5, 1.7, { oreChance: 0.04 }, ['luk1'], 'Spot rare ore veins.'],
    ['luk3', 'Stardust Sense', 'luck', [75, 2], 5000, 4, 1.9, { luck: 0.08 }, ['luk2'], 'Fortune follows the bold.'],
    ['luk4', 'Fortune Engine', 'luck', [75, 3], 50000, 3, 2.4, { luck: 0.12, oreChance: 0.03 }, ['luk3'], 'Probability, tuned.'],

    ['shd1', 'Deflector', 'shield', [108, 0], 90, 5, 1.6, { shield: 20 }, [], 'A shield that recharges when safe.'],
    ['shd2', 'Capacitor Bank', 'shield', [108, 1], 900, 4, 1.7, { shield: 30, shieldRegen: 0.5 }, ['shd1'], 'Bigger buffer, faster recharge.'],
    ['shd3', 'Phase Mantle', 'shield', [108, 2], 9000, 3, 2.0, { shield: 60 }, ['shd2'], 'Phase-shifted barrier.'],
    ['shd4', 'Aegis Matrix', 'shield', [108, 3], 60000, 2, 3.0, { shield: 100, shieldRegen: 1 }, ['shd3'], 'Legendary shield lattice.'],

    ['val1', 'Sharper Assay', 'value', [141, 0], 30, 8, 1.55, { scrapValue: 0.12 }, [], 'Rocks drop richer scrap.'],
    ['val2', 'Smelter Link', 'value', [141, 1], 700, 6, 1.6, { scrapValue: 0.15 }, ['val1'], 'Better refining on the fly.'],
    ['val5', 'Refinery Contracts', 'value', [141, 2], 8000, 5, 1.8, { scrapValue: 0.20 }, ['val2'], 'Long-term buyer deals.'],
    ['val3', 'Drone Bounty', 'value', [158, 1], 1200, 4, 1.8, { droneValue: 0.25 }, ['val1'], 'Scavengers carry a reward.'],
    ['val4', 'Boss Bounty', 'value', [160, 2], 2000, 4, 1.9, { bossValue: 0.30 }, ['val3'], 'Big rocks, big payouts.'],

    ['tim1', 'Fuel Tanks', 'timer', [174, 0], 120, 5, 1.8, { runTime: 6 }, [], 'Stay out in the field longer.'],
    ['tim2', 'Hot Swap Cells', 'timer', [174, 1], 1500, 4, 2.0, { runTime: 8 }, ['tim1'], 'Swap batteries mid-flight.'],
    ['tim3', 'Chrono Lens', 'timer', [174, 2], 14000, 3, 2.6, { runTime: 10 }, ['tim2'], 'Stretch the final minutes.'],

    ['pet1', 'Pet Bay', 'pets', [207, 0], 400, 1, 1, { petSlots: 1, pet: 'pipflare' }, [], 'Adopt Pipflare, who wanders on its own.'],
    ['pet2', 'Dustmoth Cage', 'pets', [207, 1], 3000, 1, 1, { pet: 'dustmoth' }, ['pet1'], 'A moth that loves stardust.'],
    ['pet3', 'Second Perch', 'pets', [207, 2], 9000, 1, 1, { petSlots: 1 }, ['pet2'], 'Room for another escort.'],

    ['qol1', 'Repair Kit', 'qol', [240, 0], 150, 5, 1.7, { regen: 0.4 }, [], 'Slow hull regeneration.'],
    ['qol2', 'Compass', 'qol', [240, 1], 800, 1, 1, { compass: 1 }, ['qol1'], 'Arrow toward bosses and rare ore.'],
    ['qol3', 'Cargo Scanner', 'qol', [222, 2], 1800, 1, 1, { scanner: 1 }, ['qol2'], 'Rare ore glints on your map.'],
    ['anchor', 'Solar Anchor', 'qol', [255, 4], 12000, 1, 1, { anchor: 1 }, ['can5', 'val2'], 'Moor your fleet to the sun. Unlocks Ascension.']
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
          cost: n[2], max: 1, costMul: 1, fx: n[3], req: req
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
    if (n < 10000) return String(n);
    var u = ['', 'K', 'M', 'B', 'T', 'Qa'], i = 0, v = n;
    while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
    var s = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
    if (s.indexOf('.') >= 0) s = s.replace(/\.?0+$/, '');
    return s + u[i];
  };
})();
