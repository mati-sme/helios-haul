/* Helios Haul — pan/zoom node-map view used by the Upgrade and Prestige trees */
(function () {
  'use strict';
  var HH = window.HH = window.HH || {};

  var NS = 'http://www.w3.org/2000/svg';
  var NODE = 76; // css px diameter of a node at zoom 1

  function TreeView(host, opts) {
    this.host = host;
    this.opts = opts;            // {world:{w,h}, nodes, branches, hub, state(node), onSelect(node)}
    this.nodes = opts.nodes;
    this.byId = {};
    this.els = {};
    this.scale = 0.6;
    this.min = 0.3;
    this.max = 1.6;
    this.tx = 0; this.ty = 0;
    this.ptrs = {};
    this.moved = 0;
    this.build();
    this.bind();
  }

  TreeView.prototype.build = function () {
    var self = this, w = this.opts.world.w, h = this.opts.world.h;
    this.host.innerHTML = '';
    this.host.classList.add('treeview');
    this.world = document.createElement('div');
    this.world.className = 'tree-world';
    this.world.style.width = w + 'px';
    this.world.style.height = h + 'px';
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.setAttribute('width', w);
    this.svg.setAttribute('height', h);
    this.svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    this.world.appendChild(this.svg);
    this.nodes.forEach(function (n) { self.byId[n.id] = n; });

    // optional hub marker in the middle of the radial tree
    if (this.opts.hub) {
      var hub = document.createElement('div');
      hub.className = 'tree-hub';
      hub.style.left = (this.opts.hub.x / 100 * w) + 'px';
      hub.style.top = (this.opts.hub.y / 100 * h) + 'px';
      hub.innerHTML = '<span>' + this.opts.hub.label + '</span>';
      this.world.appendChild(hub);
    }

    // branch labels
    (this.opts.labels || []).forEach(function (l) {
      var d = document.createElement('div');
      d.className = 'tree-label';
      d.textContent = l.text;
      d.style.left = (l.x / 100 * w) + 'px';
      d.style.top = (l.y / 100 * h) + 'px';
      d.style.color = l.color;
      self.world.appendChild(d);
    });

    this.edges = [];
    this.nodes.forEach(function (n) {
      var parents = n.req.length ? n.req : (self.opts.hubId ? [self.opts.hubId] : []);
      parents.forEach(function (pid) {
        var p = self.byId[pid], x1, y1;
        if (p) { x1 = p.x / 100 * w; y1 = p.y / 100 * h; }
        else if (pid === self.opts.hubId && self.opts.hub) { x1 = self.opts.hub.x / 100 * w; y1 = self.opts.hub.y / 100 * h; }
        else return;
        var line = document.createElementNS(NS, 'line');
        line.setAttribute('x1', x1); line.setAttribute('y1', y1);
        line.setAttribute('x2', n.x / 100 * w); line.setAttribute('y2', n.y / 100 * h);
        line.setAttribute('class', 'edge');
        self.svg.appendChild(line);
        self.edges.push({ el: line, from: p || null, to: n });
      });
    });

    this.nodes.forEach(function (n) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tnode';
      b.dataset.id = n.id;
      b.style.left = (n.x / 100 * w) + 'px';
      b.style.top = (n.y / 100 * h) + 'px';
      var col = self.opts.colorOf(n);
      b.style.setProperty('--c', col);
      b.innerHTML = '<span class="g">' + self.opts.glyphOf(n) + '</span><span class="lv"></span><span class="nm">' + n.name + '</span>';
      // keyboard activation only; pointer taps are handled in bind()
      b.addEventListener('click', function (e) { if (e.detail === 0) self.opts.onSelect(n); });
      self.world.appendChild(b);
      self.els[n.id] = b;
    });

    this.host.appendChild(this.world);
    this.applyTransform();
  };

  TreeView.prototype.bind = function () {
    var self = this, host = this.host;

    host.addEventListener('pointerdown', function (e) {
      self.ptrs[e.pointerId] = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY };
      self.moved = 0;
      self.pinch = null;
      try { host.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });

    host.addEventListener('pointermove', function (e) {
      var p = self.ptrs[e.pointerId];
      if (!p) return;
      var ids = Object.keys(self.ptrs);
      if (ids.length >= 2) {
        var a = self.ptrs[ids[0]], b = self.ptrs[ids[1]];
        if (e.pointerId === +ids[0]) { a.x = e.clientX; a.y = e.clientY; } else { b.x = e.clientX; b.y = e.clientY; }
        var d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (self.pinch) self.zoomAt(mx, my, self.scale * d / self.pinch.d);
        self.pinch = { d: d };
        self.moved = 99;
        return;
      }
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      self.moved = Math.max(self.moved, Math.hypot(e.clientX - p.sx, e.clientY - p.sy));
      if (self.moved > 8) {
        self.tx += dx; self.ty += dy;
        self.applyTransform();
        host.classList.add('panning');
      }
    });

    function end(e) {
      var wasTap = self.moved <= 8 && Object.keys(self.ptrs).length === 1 && self.ptrs[e.pointerId];
      delete self.ptrs[e.pointerId];
      self.pinch = null;
      host.classList.remove('panning');
      if (wasTap && e.type === 'pointerup') {
        var t = document.elementFromPoint(e.clientX, e.clientY);
        var btn = t && t.closest ? t.closest('.tnode') : null;
        if (btn && self.host.contains(btn) && self.byId[btn.dataset.id]) self.opts.onSelect(self.byId[btn.dataset.id]);
      }
    }
    host.addEventListener('pointerup', end);
    host.addEventListener('pointercancel', end);

    host.addEventListener('wheel', function (e) {
      e.preventDefault();
      self.zoomAt(e.clientX, e.clientY, self.scale * (e.deltaY < 0 ? 1.12 : 0.89));
    }, { passive: false });

    host.addEventListener('keydown', function (e) {
      if (e.target !== host) return;
      var s = 60;
      if (e.key === 'ArrowLeft') self.tx += s;
      else if (e.key === 'ArrowRight') self.tx -= s;
      else if (e.key === 'ArrowUp') self.ty += s;
      else if (e.key === 'ArrowDown') self.ty -= s;
      else return;
      e.preventDefault();
      self.applyTransform();
    });
  };

  TreeView.prototype.zoomAt = function (cx, cy, ns) {
    ns = Math.max(this.min, Math.min(this.max, ns));
    var r = this.host.getBoundingClientRect();
    var px = cx - r.left, py = cy - r.top;
    var k = ns / this.scale;
    this.tx = px - (px - this.tx) * k;
    this.ty = py - (py - this.ty) * k;
    this.scale = ns;
    this.applyTransform();
  };

  TreeView.prototype.zoomBy = function (f) {
    var r = this.host.getBoundingClientRect();
    this.zoomAt(r.left + r.width / 2, r.top + r.height / 2, this.scale * f);
  };

  TreeView.prototype.applyTransform = function () {
    var r = this.host.getBoundingClientRect();
    var W = this.opts.world.w * this.scale, H = this.opts.world.h * this.scale;
    var vw = r.width || 360, vh = r.height || 500, pad = 120;
    // keep some of the map on screen
    this.tx = Math.min(pad, Math.max(vw - W - pad, this.tx));
    this.ty = Math.min(pad, Math.max(vh - H - pad, this.ty));
    this.world.style.transform = 'translate(' + this.tx + 'px,' + this.ty + 'px) scale(' + this.scale + ')';
    this.world.style.setProperty('--inv', (1 / Math.max(0.55, this.scale)).toFixed(3));
  };

  // center the viewport on a node (or percent point)
  TreeView.prototype.centerOn = function (idOrPt, scale) {
    var r = this.host.getBoundingClientRect();
    var pt = typeof idOrPt === 'string' ? this.byId[idOrPt] : idOrPt;
    if (!pt) return;
    if (scale) this.scale = Math.max(this.min, Math.min(this.max, scale));
    this.tx = r.width / 2 - pt.x / 100 * this.opts.world.w * this.scale;
    this.ty = r.height / 2 - pt.y / 100 * this.opts.world.h * this.scale;
    this.applyTransform();
  };

  // repaint node/edge classes from game state
  TreeView.prototype.refresh = function () {
    var self = this;
    this.nodes.forEach(function (n) {
      var st = self.opts.state(n); // {level, max, status: owned|maxed|ready|afford|locked}
      var el = self.els[n.id];
      el.className = 'tnode s-' + st.status + (self.selected === n.id ? ' sel' : '');
      var lv = el.querySelector('.lv');
      lv.textContent = n.max > 1 ? st.level + '/' + n.max : (st.level ? '✓' : '');
    });
    this.edges.forEach(function (e) {
      var open = !e.from || self.opts.state(e.from).level > 0;
      var got = self.opts.state(e.to).level > 0;
      e.el.setAttribute('class', 'edge' + (got ? ' on' : open ? ' open' : ''));
    });
  };

  TreeView.prototype.select = function (id) {
    this.selected = id;
    this.refresh();
  };

  HH.TreeView = TreeView;
})();
