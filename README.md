# Helios Haul

A dark sci-fi, mobile-first space incremental. Fly out for a timed run, blast asteroids, scoop scrap, cash out, then spend **Credits** on a pan-able upgrade map and **Solar Marks** on a huge prestige constellation.

**Live:** https://mati-sme.github.io/helios-haul/

## How to play

1. Tap **Launch Run**. Drag an invisible stick in the **bottom-left** to fly (Settings can flip it right).
2. Your ship **auto-fires** toward targets near your heading — move into asteroids and scrap them.
3. When the timer ends (or hull hits zero), scrap cashes out into Credits.
4. Spend Credits on the **Upgrade Map**. Build the **Solar Anchor**, then **Ascend** for Solar Marks.
5. Spend Marks on the deep **Prestige** constellation (76 nodes). Equip wandering companion pets for tiny magnet/luck auras.

**Kids Mode** (Settings) lengthens the run timer. Save lives in `localStorage`; export/import from Settings (v1 and v2 saves both import).

## Economy (v2)

The v1 economy was a treadmill: every purchase (even hull or prestige) multiplied enemy HP, so damage ÷ HP stayed flat and the capped tree ran dry in ~2 h. v2 rebuilt it:

- **No self-cancelling HP.** Enemy HP follows only total upgrade levels (`hpScale`, gentle), never prestige. Target **value** (`valueScale`) follows credits spent this ascension (sub-linear power), so every purchase strictly raises income.
- **Uncapped nodes.** Core damage / fire-rate / value / hull / salvage nodes have no cap (`max >= HH.UNCAPPED` reads as "Lv N"). Real one-offs (compass, scanner, pets, anchor, multishot, pierce) stay capped.
- **Costs follow income.** An upgrade's price is `base × costMul^level × (valueScale × incomeBonus)`, so pacing holds at any scale; one-offs and the Solar Anchor keep flat prices.
- **Milestones.** Each scalable node doubles its effect at Lv 10/25/50/100/150/200/300/… The node sheet shows "Next milestone at Lv N: ×2". All % income bonuses pool into one additive bonus.
- **Fleet Rank.** Every 10 total levels = +3% credits, with a flash and a sound.
- **Prestige.** Marks = `(credits earned this ascension / markDiv) ^ 0.5`; every lifetime mark permanently adds credits (`1 + 5% × marks^0.5`). Ascension hands back a share of that ascension's earnings as starting credits. The hangar chip / Ascension panel always show "Next ascension: +N ☀ → +X% income" and glow when the game recommends it (gain ≥ +50% of the current bonus). Prestige nodes never touch enemy HP.
- **Hangar salvage + offline.** Credits/sec = a share of your best recent credits/min, boosted by the Salvage branch; accrues while the hangar is open and offline (8 h cap, +1 h per Deep Storage level). `Meta.offlineEarnings(sec)` is pure; `Meta.claimOffline(sec)` grants it directly (sim); the app stores a pending payout shown by the Welcome-back popup (`Meta.checkAway` / `Meta.collectOffline`).
- **Quests.** Three rotating quests scaled to 1–3 runs of income (`Meta.quests()`, `Meta.claimQuest(i)`), plus a goal chain that lasts the whole game.
- All tunables live in `HH.ECON` (`js/data.js`).

## Saves

v2 keeps the v1 storage key. A v1 save is copied to `helios-haul-save-v1-backup` first, then migrated in place with nothing lost, plus a one-time "Upgrade bonus" gift. `node sim/migrate-test.js` checks four v1 fixtures (fresh / early / mid / late).

## Sim and tests

`node sim/sim.js --profile engaged|idle --hours 10 --seed 1 --out sim/results/x.json` drives the real game code with a bot (`--econ key=val,...` overrides `HH.ECON`). `node sim/report.js a.json b.json ...` prints side-by-side tables. Baselines: `sim/results/before-*.json`; current: `after-*.json`. `node tests/phone.mjs` is a Playwright smoke test at 390×844 (screenshots in `tests/shots/`).

## Depth

| Layer | Count |
|-------|------:|
| Upgrade nodes | 64 |
| Prestige nodes | 76 |
| Standard run | 120s |
| Kids Mode run | 180s (+ prestige bonuses) |

## Research inspiration (structure only)

Classic *Asteroids* thrust-and-shoot; *Vampire Survivors* / *Brotato* timed runs + meta cash-out; *IdleOn* / *Melvor* / *NGU* deep prestige trees; *FOXFIRE* / *Nova Drift* momentum ships; *Starforged Legacy*-style mothership hub between runs. Original name, art, and writing — no third-party assets or IP.

## Tech

Static PWA for GitHub Pages: Canvas 2D, localStorage, service worker (`helios-haul-v2`; network-first for HTML/JS/CSS so updates reach the phone, cache fallback offline — bump `CACHE` in `sw.js` on every release and add new files to `ASSETS`). No backend, no paid APIs.

## Local

Open `index.html` via any static server, or use GitHub Pages at the live URL above.
