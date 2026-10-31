/* Helios Haul — phone smoke test (Playwright, 390x844 @3x, touch). Run: node tests/phone.mjs
   Exits non-zero on any console error / page error / failed check. Screenshots land in tests/shots/. */
import { createRequire } from 'module';
import http from 'http';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import cp from 'child_process';
import { fileURLToPath } from 'url';

const require = createRequire('/workspace/projects/yt-shorts/noop.js');
const { chromium } = require('playwright-core');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = path.join(ROOT, 'tests', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const URL_ = 'http://127.0.0.1:' + server.address().port + '/';

// late-game v1 fixture, built from the real v1 data.js at git HEAD
function lateV1() {
  const src = cp.execSync('git show HEAD:js/data.js', { cwd: ROOT, encoding: 'utf8' });
  const ctx = vm.createContext({});
  vm.runInContext('this.window = this;', ctx); vm.runInContext(src, ctx);
  const V1 = vm.runInContext('window.HH', ctx);
  const upg = {}; V1.UPGRADES.forEach(u => { upg[u.id] = u.max; });
  const pre = {}; V1.PRESTIGE.slice(0, 69).forEach(n => { pre[n.id] = 1; });
  const goals = {}; V1.GOALS.forEach(g => { goals[g.id] = 1; });
  return {
    v: 1, credits: 8500000, marks: 640, lifetimeScrap: 240000000, ascScrap: 4000000, ascSpent: 3000000, ascensions: 26, runs: 900, bestScrap: 610000,
    upg, pre, petsOwned: ['pipflare', 'dustmoth', 'orbitkit'], petsEquipped: ['pipflare'], goalsClaimed: goals,
    stats: { kills: 120000, crates: 2200, drones: 1900, bosses: 400, buys: 4000, runsDone: 800, anchored: 1 },
    settings: { kids: false, mute: true, music: false, vol: 0.7, joySide: 'left', weapon: 'bolts', trail: 'cyan', hud: 'cyan' },
    lastRun: null, seenIntro: true
  };
}

const errors = [], failures = [];
const check = (name, ok, extra) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (ok ? '' : '  ' + (extra || ''))); if (!ok) failures.push(name); };

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('requestfailed', r => errors.push('requestfailed: ' + r.url()));

const shot = n => page.screenshot({ path: path.join(SHOTS, n + '.png') });
const vis = sel => page.evaluate(s => { const e = document.querySelector(s); return !!e && !e.hidden && e.offsetParent !== null || (!!e && getComputedStyle(e).position === 'fixed' && !e.hidden); }, sel);
const overflowX = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);

try {
  // (a) fresh load
  await page.goto(URL_);
  await page.waitForSelector('#btn-launch');
  await page.waitForTimeout(600);
  check('home renders with quests', await page.locator('#quest-list .quest').count() === 3);
  check('no horizontal overflow (home)', !(await overflowX()));
  await shot('home');

  // (b) a run with touch-ish drags
  await page.click('#btn-launch');
  await page.waitForTimeout(500);
  for (let i = 0; i < 4; i++) {
    await page.mouse.move(70, 700); await page.mouse.down();
    await page.mouse.move(70 + (i % 2 ? -50 : 50), 700 - 40 * i, { steps: 6 });
    await page.waitForTimeout(700);
    await page.mouse.move(110, 650, { steps: 4 });
    await page.waitForTimeout(500);
    await page.mouse.up();
  }
  await page.waitForTimeout(1500);
  check('run is active', await page.evaluate(() => HH.Game.state === 'run'));
  await shot('run');
  await page.evaluate(() => HH.Game.finish('quit'));
  await page.waitForTimeout(1600);
  check('summary visible', await vis('#summary'));
  check('summary shows credits count-up result', /^\+\d/.test(await page.textContent('#sum-credits')));
  await shot('summary');

  // (c) upgrades tab + node sheet
  await page.click('#sum-hangar');
  await page.waitForTimeout(300);
  await page.evaluate(() => { HH.Save.data.credits = Math.max(HH.Save.data.credits, 4000); HH.Meta.dirty(); });
  await page.click('#tabbar button[data-go="upgrades"]');
  await page.waitForTimeout(500);
  const box = await page.locator('.tnode[data-id="can1"]').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(400);
  check('node sheet opens', await vis('#sheet'));
  check('sheet shows buy mode toggle', await vis('#sh-mode'));
  await shot('upgrades');
  await page.click('#sh-mode button[data-m="max"]');
  await page.click('#sh-buy');
  await page.waitForTimeout(700);
  check('buying with Max raised the level', await page.evaluate(() => HH.Save.data.upg.can1 >= 1));
  await shot('upgrades-bought');

  // (d) migration from a late-game v1 save
  await page.evaluate(([key, fx]) => { HH.Save.save = () => true; localStorage.setItem(key, fx); }, ['helios-haul-save-v1', JSON.stringify(lateV1())]);
  await page.reload();
  await page.waitForSelector('#btn-launch');
  await page.waitForTimeout(900);
  check('migration popup shown', await vis('#gift'));
  const gc = await page.textContent('#gift-credits');
  check('migration gift has credits', /\+\d/.test(gc), gc);
  check('v1 backup written', await page.evaluate(() => !!localStorage.getItem('helios-haul-save-v1-backup')));
  check('migrated to v2 with progress intact', await page.evaluate(() => HH.Save.data.v === 2 && HH.Save.data.ascensions === 26 && Object.keys(HH.Save.data.pre).length >= 69 && HH.Save.data.marks >= 640));
  await shot('migrated');
  await page.click('#gift-ok');
  await page.waitForTimeout(500);
  check('gift dismissed', !(await vis('#gift')));
  await page.evaluate(() => { HH.Save.save = () => true; });
  await shot('migrated-home');

  // (e) welcome back after 3 hours away
  await page.evaluate(() => {
    const k = 'helios-haul-save-v1';
    const s = JSON.parse(localStorage.getItem(k));
    s.lastSeen = Date.now() - 3 * 3600 * 1000;
    localStorage.setItem(k, JSON.stringify(s));
  });
  await page.reload();
  await page.waitForSelector('#btn-launch');
  await page.waitForTimeout(2200);
  check('welcome-back popup shown', await vis('#away'));
  const amt = await page.textContent('#away-amt');
  check('welcome-back counted up to a positive amount', /\+[1-9]/.test(amt), amt);
  await shot('offline');
  const before = await page.evaluate(() => HH.Save.data.credits);
  await page.click('#away-claim');
  await page.waitForTimeout(500);
  check('claim grants the credits', await page.evaluate(b => HH.Save.data.credits > b && HH.Save.data.pendingOffline === 0, before));
  check('popup closed after claim', !(await vis('#away')));
} catch (e) {
  errors.push('test crashed: ' + (e && e.stack || e));
}

await browser.close();
server.close();
errors.forEach(e => console.log('ERROR  ' + e));
const bad = errors.length + failures.length;
console.log(bad ? '\nFAILED: ' + errors.length + ' error(s), ' + failures.length + ' failed check(s)' : '\nAll phone checks passed, zero console/page errors');
process.exit(bad ? 1 : 0);
