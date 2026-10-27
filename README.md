# Helios Haul

A dark sci-fi, mobile-first space incremental. Fly out for a timed run, blast asteroids, scoop scrap, cash out, then spend **Credits** on a pan-able upgrade map and **Solar Marks** on a huge prestige constellation.

**Live:** https://mati-sme.github.io/helios-haul/

## How to play

1. Tap **Launch Run**. Drag an invisible stick in the **bottom-left** to fly (Settings can flip it right).
2. Your ship **auto-fires** toward targets near your heading — move into asteroids and scrap them.
3. When the timer ends (or hull hits zero), scrap cashes out into Credits.
4. Spend Credits on the **Upgrade Map**. Build the **Solar Anchor**, then **Ascend** for Solar Marks.
5. Spend Marks on the deep **Prestige** constellation (76 nodes). Equip wandering companion pets for tiny magnet/luck auras.

**Kids Mode** (Settings) lengthens the run timer. Progress is upgrade-driven — no idle auto-play helpers. Save lives in `localStorage`; export/import from Settings.

## Depth (v1)

| Layer | Count |
|-------|------:|
| Upgrade nodes | 43 |
| Prestige nodes | 76 |
| Standard run | 120s |
| Kids Mode run | 180s (+ prestige bonuses) |

## Research inspiration (structure only)

Classic *Asteroids* thrust-and-shoot; *Vampire Survivors* / *Brotato* timed runs + meta cash-out; *IdleOn* / *Melvor* / *NGU* deep prestige trees; *FOXFIRE* / *Nova Drift* momentum ships; *Starforged Legacy*-style mothership hub between runs. Original name, art, and writing — no third-party assets or IP.

## Tech

Static PWA for GitHub Pages: Canvas 2D, localStorage, service worker (`helios-haul-v1` — bump `CACHE` in `sw.js` on every release). No backend, no paid APIs.

## Local

Open `index.html` via any static server, or use GitHub Pages at the live URL above.
