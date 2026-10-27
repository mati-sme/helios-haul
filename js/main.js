/* Helios Haul — boot, UI wiring, main loop */
(function () {
  'use strict';
  var HH = window.HH;
  var Save = HH.Save, Meta = HH.Meta, Game = HH.Game, Audio = HH.Audio, Render = HH.Render, Input = HH.Input;

  function $(id) { return document.getElementById(id); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function mmss(sec) {
    sec = Math.max(0, Math.ceil(sec));
    return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2);
  }

  var trees = {}, treeInit = {}, sheet = null, activeTab = 'home';

  /* ---------- toast ---------- */
  var toastT = 0;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }

  function confirmBox(title, text, yesLabel, onYes) {
    $('cf-title').textContent = title;
    $('cf-text').textContent = text;
    $('cf-yes').textContent = yesLabel || 'Confirm';
    $('confirm').hidden = false;
    $('cf-yes').onclick = function () { $('confirm').hidden = true; onYes(); };
    $('cf-no').onclick = function () { $('confirm').hidden = true; };
  }

  /* ---------- settings ---------- */
  function applySettings() {
    var st = Save.data.settings;
    Audio.setMuted(st.mute);
    Audio.setMusic(st.music);
    Audio.setVolume(st.vol);
    Input.setSide(st.joySide);
    $('btn-mute').textContent = st.mute ? '🔇' : '🔊';
    $('hud').style.setProperty('--hud', HH.HUDS[Meta.hud()].c);
    $('set-kids').checked = st.kids;
    $('set-sound').checked = !st.mute;
    $('set-music').checked = st.music;
    $('set-vol').value = Math.round(st.vol * 100);
    $$('#set-side button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === st.joySide); });
  }

  /* ---------- home ---------- */
  function renderHome() {
    var s = Save.data, st = s.settings;
    $('mode-line').textContent = (st.kids ? 'Kids Mode' : 'Standard run') + ' · ' + mmss(Meta.runDuration());

    var lr = s.lastRun;
    $('last-run').textContent = lr ? 'Last run: ' + HH.fmt(lr.scrap) + ' scrap → ' + HH.fmt(lr.credits) + ' credits' : 'Your first run is waiting.';

    // goal
    var g = Meta.currentGoal(), body = $('goal-body');
    if (!g) {
      body.innerHTML = '<div class="goal-name">All goals complete ✦</div><p class="muted">Keep climbing the Prestige map. Those late stars take hours.</p>';
    } else {
      var cur = Meta.goalProgress(g), ready = Meta.goalReady(g);
      var rw = g.reward.credits ? HH.fmt(g.reward.credits) + ' ◆ credits' : g.reward.marks + ' ☀ Solar Marks';
      body.innerHTML = '<div class="goal-name">' + esc(g.name) + '</div><div class="muted">' + esc(g.desc) + '</div>' +
        '<div class="meter"><i style="width:' + (cur / g.target * 100) + '%"></i></div>' +
        '<div class="goal-meta"><span>' + HH.fmt(cur) + ' / ' + HH.fmt(g.target) + '</span><span>Reward: ' + rw + '</span></div>' +
        (ready ? '<button id="btn-claim" class="btn gold" style="width:100%;margin-top:10px">CLAIM REWARD</button>' : '');
      var cb = $('btn-claim');
      if (cb) cb.onclick = function () {
        var done = Meta.claimGoal();
        if (done) { Audio.buy(); toast('Goal complete: ' + done.name); refreshAll(); }
      };
    }

    // loadout chips
    var S = Meta.stats();
    function chips(id, defs, list, cur, key, label) {
      var host = $(id); host.innerHTML = '';
      Object.keys(defs).forEach(function (k) {
        var own = list.indexOf(k) >= 0;
        var b = document.createElement('button');
        b.className = 'cchip' + (cur === k ? ' on' : '') + (own ? '' : ' lock');
        b.textContent = (own ? '' : '🔒 ') + (defs[k].name);
        b.onclick = function () {
          if (!own) { Audio.deny(); toast('Unlock this in the Prestige map.'); return; }
          Save.data.settings[key] = k; Save.save(); Audio.click(); applySettings(); renderHome();
        };
        host.appendChild(b);
      });
    }
    chips('lo-weapon', HH.WEAPONS, S.lists.weaponMode, Meta.weapon(), 'weapon');
    chips('lo-trail', HH.TRAILS, S.lists.trail, Meta.trail(), 'trail');
    chips('lo-hud', HH.HUDS, S.lists.hud, Meta.hud(), 'hud');

    // stats
    var rows = [
      ['Best run', HH.fmt(s.bestScrap)], ['Runs flown', s.runs],
      ['Lifetime scrap', HH.fmt(s.lifetimeScrap)], ['Targets destroyed', HH.fmt(s.stats.kills)],
      ['Mini-bosses', s.stats.bosses], ['Ascensions', s.ascensions]
    ];
    $('stats-grid').innerHTML = rows.map(function (r) { return '<div class="stat"><small>' + r[0] + '</small><b>' + r[1] + '</b></div>'; }).join('');
  }

  function renderWallet() {
    $('w-credits').textContent = HH.fmt(Save.data.credits);
    $('w-marks').textContent = HH.fmt(Save.data.marks);
  }

  /* ---------- trees ---------- */
  function makeTrees() {
    var ub = HH.UPG_BRANCHES;
    trees.upg = new HH.TreeView($('upg-tree'), {
      world: HH.UPG_WORLD, nodes: HH.UPGRADES, hub: { x: 50, y: 50, label: 'HELIOS<br>HANGAR' }, hubId: '__hub',
      colorOf: function (n) { return ub[n.branch].color; },
      glyphOf: function (n) { return ub[n.branch].glyph; },
      state: function (n) { return Meta.nodeState('upg', n); },
      onSelect: function (n) { openSheet('upg', n); }
    });
    var pb = {};
    HH.PRE_BRANCHES.forEach(function (b) { pb[b.id] = b; });
    var labels = HH.PRE_BRANCHES.map(function (b) {
      var root = Meta.preById[b.id + '1'];
      return { text: b.name, x: root.x, y: 7.2, color: b.color };
    });
    trees.pre = new HH.TreeView($('pre-tree'), {
      world: HH.PRE_WORLD, nodes: HH.PRESTIGE, labels: labels,
      colorOf: function (n) { return n.branch === 'core' ? '#ffd45e' : pb[n.branch].color; },
      glyphOf: function (n) { return n.branch === 'core' ? '☀' : pb[n.branch].glyph; },
      state: function (n) { return Meta.nodeState('pre', n); },
      onSelect: function (n) { openSheet('pre', n); }
    });
  }

  function homeTree(which) {
    var t = trees[which], r = t.host.getBoundingClientRect();
    if (which === 'upg') {
      var fit = Math.min(r.width / (HH.UPG_WORLD.w * 0.62), r.height / (HH.UPG_WORLD.h * 0.62));
      t.centerOn({ x: 50, y: 50 }, Math.max(0.55, Math.min(0.8, fit)));
    } else {
      t.centerOn({ x: 50, y: 20 }, Math.min(0.55, Math.max(0.32, r.width / 1500)));
    }
  }

  function openSheet(kind, n) {
    sheet = { kind: kind, node: n };
    trees[kind === 'upg' ? 'upg' : 'pre'].select(n.id);
    Audio.click();
    fillSheet();
    $('sheet').hidden = false;
  }
  function closeSheet() {
    $('sheet').hidden = true;
    if (sheet) trees[sheet.kind === 'upg' ? 'upg' : 'pre'].select(null);
    sheet = null;
  }

  function fillSheet() {
    if (!sheet) return;
    var kind = sheet.kind, n = sheet.node, st = Meta.nodeState(kind, n);
    var col = kind === 'upg' ? HH.UPG_BRANCHES[n.branch].color : (n.branch === 'core' ? '#ffd45e' : HH.PRE_BRANCHES.filter(function (b) { return b.id === n.branch; })[0].color);
    var glyph = kind === 'upg' ? HH.UPG_BRANCHES[n.branch].glyph : (n.branch === 'core' ? '☀' : HH.PRE_BRANCHES.filter(function (b) { return b.id === n.branch; })[0].glyph);
    var bname = kind === 'upg' ? HH.UPG_BRANCHES[n.branch].name : (n.branch === 'core' ? 'Core' : HH.PRE_BRANCHES.filter(function (b) { return b.id === n.branch; })[0].name);
    var cur = kind === 'upg' ? '◆' : '☀';
    $('sh-glyph').style.setProperty('--c', col);
    $('sh-glyph').textContent = glyph;
    $('sh-branch').textContent = bname + (n.max > 1 ? ' · Level ' + st.level + '/' + n.max : '');
    $('sh-name').textContent = n.name;
    $('sh-desc').textContent = n.desc;
    $('sh-fx').innerHTML = HH.fxLines(n.fx).map(function (l) { return '<li>' + esc(l) + (n.max > 1 ? ' <small class="muted">per level</small>' : '') + '</li>'; }).join('');
    var table = kind === 'upg' ? Meta.upgById : Meta.preById;
    var miss = n.req.filter(function (r) { return Meta.level(kind, r) <= 0; }).map(function (r) { return table[r].name; });
    $('sh-req').textContent = miss.length ? 'Requires: ' + miss.join(', ') : '';
    var btn = $('sh-buy');
    btn.classList.remove('off');
    if (st.status === 'maxed') { btn.textContent = n.max > 1 ? 'Maxed' : 'Owned ✓'; btn.classList.add('off'); }
    else if (st.status === 'locked') { btn.textContent = 'Locked'; btn.classList.add('off'); }
    else if (st.status === 'afford') btn.textContent = 'Buy · ' + HH.fmt(st.cost) + ' ' + cur;
    else { btn.textContent = HH.fmt(st.cost) + ' ' + cur + ' · need ' + HH.fmt(st.cost - Meta.funds(kind)) + ' more'; btn.classList.add('off'); }
  }

  function buySheet() {
    if (!sheet) return;
    var res = Meta.buy(sheet.kind, sheet.node.id);
    if (res.ok) { Audio.buy(); toast(res.msg); } else { Audio.deny(); toast(res.msg); }
    refreshAll();
  }

  /* ---------- prestige panel ---------- */
  function renderAscend() {
    var s = Save.data, txt = $('asc-text'), btn = $('btn-ascend');
    if (!Meta.anchorBuilt()) {
      txt.innerHTML = 'Build the <b>Solar Anchor</b> in Upgrades to ascend. You can already browse the map.';
      btn.classList.add('off'); btn.textContent = 'LOCKED';
      return;
    }
    var gain = Meta.marksPreview();
    txt.innerHTML = 'Ascend now for <b style="color:var(--gold)">+' + HH.fmt(gain) + ' ☀</b>. Resets upgrades &amp; credits; keeps prestige &amp; pets.';
    btn.textContent = 'ASCEND';
    btn.classList.toggle('off', gain < 1);
  }

  /* ---------- pets ---------- */
  function petSource(id) {
    var found = null;
    HH.UPGRADES.forEach(function (n) { if (!found && n.fx.pet === id) found = 'Upgrades: ' + n.name; });
    HH.PRESTIGE.forEach(function (n) { if (!found && n.fx.pet === id) found = 'Prestige: ' + n.name; });
    return found || 'Unknown';
  }

  function renderPets() {
    var s = Save.data, S = Meta.stats(), slots = Math.floor(S.petSlots);
    s.petsEquipped = s.petsEquipped.filter(function (p) { return s.petsOwned.indexOf(p) >= 0; }).slice(0, slots);
    $('pet-slots').textContent = 'Slots in use: ' + s.petsEquipped.length + ' / ' + slots;
    var host = $('pet-list'); host.innerHTML = '';
    Object.keys(HH.PETS).forEach(function (id) {
      var d = HH.PETS[id], own = s.petsOwned.indexOf(id) >= 0, eq = s.petsEquipped.indexOf(id) >= 0;
      var el = document.createElement('div');
      el.className = 'pet' + (own ? '' : ' locked');
      el.style.setProperty('--c', d.color);
      el.innerHTML = '<div class="orb">' + (own ? '✦' : '🔒') + '</div><div class="info"><b>' + esc(d.name) + '</b><small>' +
        esc(own ? d.desc : petSource(id)) + '</small>' +
        (own ? '<small>Aura: +' + Math.round(d.aura.magnet * 100) + '% magnet, +' + Math.round(d.aura.luck * 100) + '% luck</small>' : '') + '</div>';
      if (own) {
        var b = document.createElement('button');
        b.className = 'btn' + (eq ? ' primary' : '');
        b.textContent = eq ? 'Equipped' : 'Equip';
        b.onclick = function () {
          if (eq) s.petsEquipped.splice(s.petsEquipped.indexOf(id), 1);
          else if (s.petsEquipped.length >= slots) { Audio.deny(); toast(slots ? 'All pet slots are full.' : 'Unlock a pet slot first.'); return; }
          else s.petsEquipped.push(id);
          Audio.click(); Save.save(); renderPets();
        };
        el.appendChild(b);
      }
      host.appendChild(el);
    });
  }

  /* ---------- refresh ---------- */
  function refreshAll() {
    renderWallet();
    renderHome();
    renderAscend();
    renderPets();
    if (trees.upg) { trees.upg.refresh(); trees.pre.refresh(); }
    fillSheet();
    applySettings();
  }

  function showTab(name) {
    activeTab = name;
    $$('.tab').forEach(function (t) { t.classList.toggle('active', t.dataset.tab === name); });
    $$('#tabbar button').forEach(function (b) { b.classList.toggle('on', b.dataset.go === name); });
    closeSheet();
    if (name === 'upgrades' || name === 'prestige') {
      var key = name === 'upgrades' ? 'upg' : 'pre';
      trees[key].refresh();
      if (!treeInit[key]) { treeInit[key] = true; homeTree(key); }
    }
    refreshAll();
  }

  /* ---------- run flow ---------- */
  var hudCache = {}, hintT = 0, bannerT = 0;

  function startRun() {
    Audio.unlock();
    closeSheet();
    Game.start();
    $('app').hidden = true;
    $('hud').hidden = false;
    $('pause').hidden = true;
    $('summary').hidden = true;
    hudCache = {};
    $('hint').classList.remove('gone');
    hintT = 7;
    $('bar-shield').classList.toggle('none', Game.G.D.shield <= 0);
    $('hud').style.setProperty('--hud', HH.HUDS[Meta.hud()].c);
  }

  function setPaused(p) {
    if (Game.state !== 'run') return;
    Game.paused = p;
    $('pause').hidden = !p;
    if (p) Input.enable(false); else Input.enable(true, Save.data.settings.joySide);
  }

  function showSummary(sum) {
    $('hud').hidden = true;
    var title = sum.reason === 'breach' ? 'Hull breached' : sum.reason === 'quit' ? 'Cashed out' : 'Run complete';
    $('sum-reason').textContent = sum.reason === 'time' ? 'Time is up' : sum.reason === 'breach' ? 'Emergency cash-out' : 'Left early';
    $('sum-title').textContent = title;
    var rows = [
      ['Scrap hauled', HH.fmt(sum.scrap)], ['Cash-out ×', sum.mult.toFixed(2)],
      ['Targets', sum.kills], ['Crates', sum.crates], ['Drones', sum.drones], ['Mini-bosses', sum.bosses]
    ];
    $('sum-grid').innerHTML = rows.map(function (r) { return '<div class="stat"><small>' + r[0] + '</small><b>' + r[1] + '</b></div>'; }).join('');
    $('sum-credits').textContent = '+' + HH.fmt(sum.credits);
    var notes = [];
    if (sum.best) notes.push('New best haul!');
    if (Meta.goalReady(Meta.currentGoal())) notes.push('A goal is ready to claim in the Hangar.');
    $('sum-note').textContent = notes.join(' ');
    $('summary').hidden = false;
    renderWallet();
  }

  function toHangar() {
    Game.toHangar();
    $('summary').hidden = true;
    $('pause').hidden = true;
    $('hud').hidden = true;
    $('app').hidden = false;
    showTab(activeTab);
  }

  function updateHud(G) {
    var s = G.ship, scrap = HH.fmt(G.scrap), left = Math.max(0, G.dur - G.t);
    var t = mmss(left);
    if (hudCache.scrap !== scrap) { $('hud-scrap').lastChild.textContent = scrap; hudCache.scrap = scrap; }
    if (hudCache.t !== t) {
      $('hud-time').firstChild.textContent = t; hudCache.t = t;
      $('hud-time').classList.toggle('low', left <= 10);
    }
    var hp = Math.ceil(s.hp), hf = Math.max(0, s.hp / s.mhp);
    if (hudCache.hp !== hp) {
      hudCache.hp = hp;
      $('bar-hull').firstChild.style.transform = 'scaleX(' + hf + ')';
      $('bar-hull').lastChild.textContent = 'HULL ' + hp + '/' + Math.round(s.mhp);
      $('bar-hull').classList.toggle('low', hf < 0.3);
    }
    if (s.msh > 0) {
      var sh = Math.ceil(s.sh);
      if (hudCache.sh !== sh) {
        hudCache.sh = sh;
        $('bar-shield').firstChild.style.transform = 'scaleX(' + (s.sh / s.msh) + ')';
        $('bar-shield').lastChild.textContent = 'SHIELD ' + sh + '/' + Math.round(s.msh);
      }
    }
  }

  function showBanner(msg) {
    var b = $('banner');
    b.textContent = msg;
    b.classList.add('show');
    clearTimeout(bannerT);
    bannerT = setTimeout(function () { b.classList.remove('show'); }, 2600);
  }

  /* ---------- save panel ---------- */
  function download(name, text) {
    var blob = new Blob([text], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function doImport(text) {
    var res = Save.importJSON(text);
    toast(res.msg);
    if (res.ok) { Meta.dirty(); Meta.stats(); $('save-text').value = ''; refreshAll(); }
  }

  /* ---------- wiring ---------- */
  function bind() {
    $$('#tabbar button').forEach(function (b) { b.onclick = function () { Audio.unlock(); Audio.click(); showTab(b.dataset.go); }; });
    $('btn-launch').onclick = startRun;
    $('sum-again').onclick = function () { $('summary').hidden = true; startRun(); };
    $('sum-hangar').onclick = toHangar;
    $('btn-pause').onclick = function () { setPaused(true); };
    $('pause-resume').onclick = function () { setPaused(false); };
    $('pause-quit').onclick = function () { setPaused(false); Game.finish('quit'); };
    $('btn-mute').onclick = function () {
      Save.data.settings.mute = !Save.data.settings.mute; Save.save(); applySettings(); Audio.unlock();
    };
    $('sh-close').onclick = closeSheet;
    $('sh-buy').onclick = buySheet;
    $('sheet').addEventListener('pointerdown', function (e) { if (e.target === $('sheet')) closeSheet(); });

    $('btn-ascend').onclick = function () {
      if (!Meta.anchorBuilt()) { Audio.deny(); toast('Build the Solar Anchor first.'); return; }
      var gain = Meta.marksPreview();
      if (gain < 1) { Audio.deny(); toast('Earn a bit more before ascending.'); return; }
      confirmBox('Ascend?', 'Gain ' + HH.fmt(gain) + ' Solar Marks. Upgrades and credits reset (minus what your prestige nodes keep). Prestige nodes and pets stay.', 'Ascend', function () {
        var g = Meta.ascend();
        Audio.ascend(); toast('Ascended! +' + HH.fmt(g) + ' Solar Marks');
        refreshAll();
      });
    };

    $$('.tree-tools button').forEach(function (b) {
      b.onclick = function () {
        var key = activeTab === 'upgrades' ? 'upg' : 'pre', t = trees[key];
        if (b.dataset.zoom === 'in') t.zoomBy(1.25);
        else if (b.dataset.zoom === 'out') t.zoomBy(0.8);
        else homeTree(key);
      };
    });

    var st = function () { return Save.data.settings; };
    $('set-kids').onchange = function () { st().kids = this.checked; Save.save(); Audio.click(); refreshAll(); };
    $('set-sound').onchange = function () { st().mute = !this.checked; Save.save(); applySettings(); Audio.unlock(); Audio.click(); };
    $('set-music').onchange = function () { st().music = this.checked; Save.save(); applySettings(); Audio.unlock(); };
    $('set-vol').oninput = function () { st().vol = this.value / 100; Audio.setVolume(st().vol); };
    $('set-vol').onchange = function () { Save.save(); Audio.unlock(); Audio.click(); };
    $$('#set-side button').forEach(function (b) { b.onclick = function () { st().joySide = b.dataset.v; Save.save(); Audio.click(); applySettings(); }; });

    $('btn-export').onclick = function () {
      var text = Save.exportJSON();
      $('save-text').value = text;
      download('helios-haul-save.json', text);
      toast('Save exported.');
    };
    $('btn-copy').onclick = function () {
      var text = Save.exportJSON(), ta = $('save-text');
      ta.value = text;
      var done = function () { toast('Save JSON copied.'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { ta.select(); toast('Select and copy the text.'); });
      else { ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Select and copy the text.'); } }
    };
    $('btn-import-file').onclick = function () { $('file-import').click(); };
    $('file-import').onchange = function () {
      var f = this.files && this.files[0], input = this;
      if (!f) return;
      var r = new FileReader();
      r.onload = function () { confirmBox('Import save?', 'This replaces your current progress.', 'Import', function () { doImport(String(r.result)); }); input.value = ''; };
      r.readAsText(f);
    };
    $('btn-import-text').onclick = function () {
      var text = $('save-text').value.trim();
      if (!text) { toast('Paste exported JSON first.'); return; }
      confirmBox('Import save?', 'This replaces your current progress.', 'Import', function () { doImport(text); });
    };
    $('btn-reset').onclick = function () {
      confirmBox('Erase save?', 'This deletes all progress on this device. Export a backup first if unsure.', 'Erase', function () {
        Save.reset(); Meta.dirty(); Meta.stats(); toast('Save erased.'); refreshAll();
      });
    };

    document.addEventListener('visibilitychange', function () { if (document.hidden && Game.state === 'run') setPaused(true); });
    window.addEventListener('resize', function () { Render.resize(); });
    window.addEventListener('orientationchange', function () { setTimeout(Render.resize, 200); });
    window.addEventListener('keydown', function (e) {
      if ((e.key === 'Escape' || e.key === 'p') && Game.state === 'run') setPaused(!Game.paused);
    });
    // first user gesture unlocks audio
    window.addEventListener('pointerdown', function () { Audio.unlock(); }, { once: true });

    Game.onEnd = showSummary;
    Game.onAlert = showBanner;
  }

  /* ---------- loop ---------- */
  var last = 0, clock = 0;
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now; clock += dt;
    if (Game.state === 'run' && Game.G) {
      Game.update(dt);
      var G = Game.G;
      if (G) {
        Render.run(G, clock);
        if (!G.ended) updateHud(G);
        if (hintT > 0) { hintT -= dt; if (hintT <= 0) $('hint').classList.add('gone'); }
      }
    } else {
      Render.hangar(clock);
    }
    requestAnimationFrame(frame);
  }

  /* ---------- boot ---------- */
  function boot() {
    Save.load();
    Meta.dirty();
    Meta.stats();
    $('ver').textContent = HH.VERSION;
    Render.init($('stage'));
    Input.attach($('stage'));
    makeTrees();
    bind();
    applySettings();
    showTab('home');
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline cache is optional */ });
    }
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
