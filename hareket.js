/* hareket.js v1.0 — RTEÜ Nefroloji uygulama ailesi için Apple-stili akışkan etkileşim katmanı.
   Dayanak: Apple "Designing Fluid Interfaces" (WWDC 2018) ilkeleri; emilkowalski/skills apple-design (MIT).
   Kütüphane yok, çevrimdışı çalışır. Hasta verisine dokunmaz; yalnızca görünüm ve hareket.
   İlkeler: basışta anında geri bildirim · yay (spring) animasyonları · kesilebilir geçişler ·
   sürüklemede 1:1 takip + hız devri + momentum izdüşümü · sınırlarda lastik etkisi · azaltılmış hareket desteği. */
(function () {
  'use strict';
  if (window.Hareket) return;
  var mq = function (q) { try { return window.matchMedia(q); } catch (e) { return { matches: false, addEventListener: function () {} }; } };
  var RM = mq('(prefers-reduced-motion: reduce)');
  var reduced = function () { return RM.matches; };

  /* ---------- Yay (spring): Apple parametreleri — damping oranı + response (s) ---------- */
  function spring(o) {
    var x = o.from, v = o.velocity || 0, to = o.to;
    var resp = o.response || 0.4, z = o.damping == null ? 1 : o.damping;
    var k = Math.pow(2 * Math.PI / resp, 2), c = 4 * Math.PI * z / resp;
    var prec = o.precision || 0.5, raf = 0, last = 0, done = false;
    function step(t) {
      if (done) return;
      var dt = last ? Math.min((t - last) / 1000, 0.064) : 1 / 60; last = t;
      var n = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / n;
      for (var i = 0; i < n; i++) { var a = -k * (x - to) - c * v; v += a * h; x += v * h; }
      if (Math.abs(x - to) < prec && Math.abs(v) < prec * 10) { x = to; v = 0; done = true; o.onUpdate && o.onUpdate(x, v); o.onComplete && o.onComplete(); return; }
      o.onUpdate && o.onUpdate(x, v);
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return {
      stop: function () { done = true; cancelAnimationFrame(raf); },
      value: function () { return x; }, velocity: function () { return v; }, isDone: function () { return done; }
    };
  }

  /* Yay eğrisini CSS linear() olarak örnekle (WAAPI için); destek yoksa yumuşak bir bezier */
  var LINEAR_OK = (function () { try { return CSS.supports('animation-timing-function', 'linear(0, 1)'); } catch (e) { return false; } })();
  function springEasing(damping, response) {
    var k = Math.pow(2 * Math.PI / response, 2), c = 4 * Math.PI * damping / response, x = 0, v = 0, h = 1 / 600, t = 0, pts = [0];
    var T = 0; // yerleşme süresi
    var sim = []; while (t < 3) { var a = -k * (x - 1) - c * v; v += a * h; x += v * h; t += h; sim.push(x); if (Math.abs(x - 1) < 0.001 && Math.abs(v) < 0.01) { T = t; break; } }
    if (!T) T = t;
    var N = 36; for (var i = 1; i <= N; i++) { var idx = Math.min(sim.length - 1, Math.round(i / N * (sim.length - 1))); pts.push(+sim[idx].toFixed(4)); }
    pts[pts.length - 1] = 1;
    return { easing: LINEAR_OK ? 'linear(' + pts.join(', ') + ')' : 'cubic-bezier(.2,.8,.2,1)', duration: Math.round(T * 1000) };
  }
  var EASE_UI = springEasing(1, 0.35);      // kritik sönümlü: varsayılan arayüz
  var EASE_PRESS = springEasing(1, 0.25);   // basış dönüşü

  /* Momentum izdüşümü (Apple örnek kodu) ve lastik etkisi */
  function project(v, d) { d = d || 0.998; return (v / 1000) * d / (1 - d); }
  function rubber(over, dim, c) { c = c || 0.55; return (over * dim * c) / (dim + c * Math.abs(over)); }
  function velTracker() {
    var h = [];
    return {
      add: function (p) { var t = performance.now(); h.push({ p: p, t: t }); while (h.length > 2 && t - h[0].t > 100) h.shift(); },
      v: function () { if (h.length < 2) return 0; var a = h[0], b = h[h.length - 1], dt = (b.t - a.t) / 1000; return dt > 0 ? (b.p - a.p) / dt : 0; },
      reset: function () { h = []; }
    };
  }

  /* ---------- 1. Basışta anında geri bildirim (pointer-down) ---------- */
  var PRESS_SEL = 'button, a[href], summary, label.chip, [role="button"], .tile, .hit, .linkcard, .pager a';
  var pressed = null, px = 0, py = 0, pAnim = null;
  function pressOn(el) {
    var big = el.offsetWidth > 260, s = big ? 0.985 : 0.965;
    try {
      pAnim && pAnim.cancel();
      pAnim = el.animate([{ transform: 'scale(1)' }, { transform: 'scale(' + s + ')' }], { duration: 90, easing: 'ease-out', fill: 'forwards', composite: 'add' });
      pAnim._s = s;
    } catch (e) { pAnim = null; }
  }
  function pressOff() {
    if (!pressed) return; var el = pressed; pressed = null;
    var a = pAnim; pAnim = null; if (!a) return;
    try {
      var s = a._s; a.cancel();
      var back = el.animate([{ transform: 'scale(' + s + ')' }, { transform: 'scale(1)' }], { duration: EASE_PRESS.duration, easing: EASE_PRESS.easing, composite: 'add' });
      back.onfinish = function () { back.cancel(); };
    } catch (e) {}
  }
  function initPress() {
    document.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || reduced()) return;
      var el = e.target.closest && e.target.closest(PRESS_SEL);
      if (!el || el.disabled || el.closest('[data-hk-no-press]')) return;
      pressed = el; px = e.clientX; py = e.clientY; pressOn(el);
    }, { passive: true });
    document.addEventListener('pointermove', function (e) { if (pressed && Math.hypot(e.clientX - px, e.clientY - py) > 10) pressOff(); }, { passive: true });
    ['pointerup', 'pointercancel', 'dragstart'].forEach(function (t) { document.addEventListener(t, pressOff, { passive: true }); });
    document.addEventListener('touchstart', function () {}, { passive: true }); // iOS :active için
  }

  /* ---------- 2. <details> açılıp kapanırken yaylı yükseklik (kesilebilir) ---------- */
  function closedHeight(d, sum) {
    var cs = getComputedStyle(d);
    return sum.offsetHeight + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
  }
  function initDetails() {
    document.addEventListener('click', function (e) {
      var sum = e.target.closest && e.target.closest('summary');
      if (!sum || e.defaultPrevented) return;
      var d = sum.parentElement;
      if (!d || d.tagName !== 'DETAILS' || sum !== d.querySelector(':scope > summary') || d.closest('[data-hk-static]')) return;
      var ia = e.target.closest('a, button, input, select, textarea, label');
      if (ia && ia !== sum && sum.contains(ia)) return; // özet içindeki düğme/bağlantıya dokunma
      e.preventDefault();
      var st = d._hk || (d._hk = {});
      var opening = st.closing || !d.open;
      if (reduced()) {
        d.open = opening; st.closing = false;
        if (opening) Array.prototype.forEach.call(d.children, function (c) { if (c !== sum) try { c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 }); } catch (x) {} });
        return;
      }
      var startH = d.getBoundingClientRect().height, vel = st.sp ? st.sp.velocity() : 0;
      st.sp && st.sp.stop();
      d.style.height = startH + 'px'; d.style.overflow = 'hidden'; d.classList.add('hk-anim');
      var closedH = closedHeight(d, sum);
      if (opening) { st.closing = false; d.open = true; } else { st.closing = true; }
      requestAnimationFrame(function () { // açılışta içerik çizilsin (toggle dinleyicileri)
        var endH;
        if (opening) { d.style.height = 'auto'; endH = d.getBoundingClientRect().height; d.style.height = startH + 'px'; }
        else endH = closedH;
        var full = Math.max(1, (opening ? endH : startH) - closedH);
        st.sp = spring({
          from: startH, to: endH, velocity: vel, damping: 1, response: 0.35, precision: 0.5,
          onUpdate: function (h) { d.style.height = h + 'px'; var p = Math.max(0, Math.min(1, (h - closedH) / full)); d.style.setProperty('--hk-p', p.toFixed(3)); },
          onComplete: function () {
            if (st.closing) { d.open = false; st.closing = false; }
            d.style.height = ''; d.style.overflow = ''; d.style.removeProperty('--hk-p'); d.classList.remove('hk-anim'); st.sp = null;
          }
        });
      });
    });
  }

  /* ---------- 3. Bölüm/sekme değişiminde yönlü, yaylı beliriş ---------- */
  var REVEAL = [], lastStep = null;
  function visible(el) { return !el.hidden && !el.classList.contains('stepoff') && el.getClientRects().length > 0; }
  function revealAnim(el, dir) {
    if (reduced()) { try { el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160 }); } catch (e) {} return; }
    var from = dir ? 'translateX(' + (dir > 0 ? 18 : -18) + 'px)' : 'translateY(8px)';
    try { el.animate([{ opacity: 0, transform: from }, { opacity: 1, transform: 'none' }], { duration: EASE_UI.duration, easing: EASE_UI.easing }); } catch (e) {}
  }
  function initReveal(cfg) {
    REVEAL = cfg.reveal || [];
    if (!REVEAL.length && !cfg.revealContainer && !cfg.collapse) return;
    var sel = REVEAL.join(','), seen = new WeakMap(), pending = new Set(), scheduled = false;
    if (sel) document.querySelectorAll(sel).forEach(function (el) { seen.set(el, visible(el)); });
    function flush() {
      scheduled = false; var dir = 0, batch = [];
      pending.forEach(function (el) { var v = visible(el), was = seen.get(el); seen.set(el, v); if (v && was === false) batch.push(el); });
      pending.clear();
      if (!batch.length) return;
      var s = batch[0].dataset ? +batch[0].dataset.step : NaN;
      if (!isNaN(s)) { if (lastStep != null && s !== lastStep) dir = s > lastStep ? 1 : -1; lastStep = s; }
      batch.forEach(function (el) { revealAnim(el, dir); });
    }
    var mo = new MutationObserver(function (list) {
      list.forEach(function (m) {
        var t = m.target;
        if (m.type === 'attributes') {
          if (sel && t.matches && t.matches(sel)) { pending.add(t); }
          if (cfg.collapse && m.attributeName === 'class' && t.matches && t.matches(cfg.collapse) && (m.oldValue || '').indexOf('collapsed') > -1 && !t.classList.contains('collapsed') && !reduced()) {
            Array.prototype.forEach.call(t.children, function (c, i) { if (i > 0) try { c.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: EASE_UI.duration, easing: EASE_UI.easing }); } catch (e) {} });
          }
        } else if (m.type === 'childList' && cfg.revealContainer && t.matches && t.matches(cfg.revealContainer) && m.addedNodes.length) { revealAnim(t, 0); }
      });
      if (pending.size && !scheduled) { scheduled = true; requestAnimationFrame(flush); }
    });
    mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden', 'class'], attributeOldValue: true, childList: !!cfg.revealContainer });
    if (sel) { var cur = document.querySelector(sel + '[data-step]:not(.stepoff)'); if (cur) lastStep = +cur.dataset.step; }
  }

  /* ---------- 4. Kenar çekmecesi: yaylı açılış, sürükleyerek kapatma, kenardan çekip açma ---------- */
  function initDrawer(c) {
    var el = document.querySelector(c.el); if (!el) return;
    var MQ = mq(c.media || 'all'), cls = c.openClass || 'open', dir = c.side === 'right' ? 1 : -1;
    var scrim = document.createElement('div'); scrim.className = 'hk-scrim'; scrim.setAttribute('aria-hidden', 'true');
    document.body.appendChild(scrim);
    var x = 0, sp = null, w = 0, active = false, internal = false;
    function closedX() { return dir * (w * 1.02 + 8); }
    function apply(v) { x = v; el.style.transform = 'translateX(' + v + 'px)'; var p = 1 - Math.min(1, Math.abs(v) / Math.abs(closedX())); scrim.style.opacity = p.toFixed(3); scrim.style.pointerEvents = p > 0.02 ? 'auto' : 'none'; }
    function setup() {
      active = MQ.matches;
      if (!active) { sp && sp.stop(); el.classList.remove('hk-drawer'); el.style.transform = ''; el.style.transition = ''; scrim.style.opacity = 0; scrim.style.pointerEvents = 'none'; return; }
      el.classList.add('hk-drawer'); el.style.transition = 'none'; w = el.offsetWidth || 300;
      scrim.style.zIndex = String((parseInt(getComputedStyle(el).zIndex, 10) || 40) - 1);
      apply(el.classList.contains(cls) ? 0 : closedX());
    }
    function go(open, v, bouncy) {
      sp && sp.stop();
      var to = open ? 0 : closedX();
      if (reduced()) { apply(to); return; }
      sp = spring({ from: x, to: to, velocity: v || 0, damping: bouncy ? 0.8 : 1, response: bouncy ? 0.3 : 0.35, precision: 0.5, onUpdate: apply });
    }
    function setOpen(open) { internal = true; el.classList.toggle(cls, open); internal = false; }
    new MutationObserver(function () { if (!active || internal) return; go(el.classList.contains(cls), sp ? sp.velocity() : 0, false); })
      .observe(el, { attributes: true, attributeFilter: ['class'] });
    scrim.addEventListener('click', function () { setOpen(false); go(false, 0, false); });
    // sürükleme
    var drag = null, vt = velTracker();
    function down(e, fromEdge) {
      if (!active || e.button !== 0) return;
      drag = { sx: e.clientX, sy: e.clientY, x0: x, on: false, edge: fromEdge, id: e.pointerId, tgt: e.currentTarget };
      vt.reset();
    }
    function move(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!drag.on) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }   // dikey: kaydırmaya bırak
        if (Math.abs(dx) < 10) return;                                                  // eşik (histerezis)
        drag.on = true; sp && sp.stop(); drag.x0 = x; drag.sx = e.clientX;
        try { drag.tgt.setPointerCapture(e.pointerId); } catch (er) {}
        if (drag.edge) { w = el.offsetWidth || w; }
      }
      var nx = drag.x0 + (e.clientX - drag.sx);
      if (dir < 0 && nx > 0) nx = rubber(nx, w); else if (dir > 0 && nx < 0) nx = rubber(nx, w);
      apply(nx); vt.add(nx);
    }
    function up(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var was = drag.on; drag = null; if (!was) return;
      var v = vt.v(), proj = x + project(v), open = Math.abs(proj) < Math.abs(closedX()) / 2;
      if (Math.abs(v) > 300) open = dir < 0 ? v > 0 : v < 0;  // yön, hızın işaretinden
      setOpen(open); go(open, v, Math.abs(v) > 300);
    }
    el.addEventListener('pointerdown', function (e) { down(e, false); });
    scrim.addEventListener('pointerdown', function (e) { down(e, false); });
    if (c.edgeOpen) document.addEventListener('pointerdown', function (e) {
      if (!active || el.classList.contains(cls) || e.pointerType === 'mouse') return;
      var edge = dir < 0 ? e.clientX < 18 : e.clientX > innerWidth - 18; if (edge) down(e, true);
    }, { passive: true });
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    MQ.addEventListener ? MQ.addEventListener('change', setup) : MQ.addListener(setup);
    window.addEventListener('resize', function () { if (active) { w = el.offsetWidth || w; if (!el.classList.contains(cls)) apply(closedX()); } });
    setup();
  }

  /* ---------- 5. Alt sayfa (bottom sheet): yaylı giriş/çıkış, tutamaktan sürükleyip kapatma ---------- */
  var sheets = new WeakMap();
  function initSheet(c) {
    var root = document.querySelector(c.el); if (!root) return;
    var panel = root.querySelector(c.panel), handle = root.querySelector(c.handle) || panel;
    if (!panel) return;
    root.classList.add('hk-sheet'); handle.classList.add('hk-handle');
    var st = { y: 0, sp: null, h: 0 }; sheets.set(root, st);
    function apply(y) { st.y = y; panel.style.transform = 'translateY(' + y + 'px)'; root.style.setProperty('--hk-p', Math.max(0, 1 - y / Math.max(1, st.h)).toFixed(3)); }
    function run(to, v, done, bouncy) {
      st.sp && st.sp.stop();
      if (reduced()) { apply(to); try { root.animate([{ opacity: to ? 1 : 0 }, { opacity: to ? 0 : 1 }], { duration: 160 }); } catch (e) {} done && setTimeout(done, to ? 160 : 0); return; }
      st.sp = spring({ from: st.y, to: to, velocity: v || 0, damping: bouncy ? 0.8 : 1, response: bouncy ? 0.3 : 0.35, precision: 0.5, onUpdate: apply, onComplete: done });
    }
    new MutationObserver(function () {
      if (root.hidden || root.dataset.hkClosing) return;
      st.h = panel.offsetHeight || 400; apply(st.h); run(0, 0, null, false);
    }).observe(root, { attributes: true, attributeFilter: ['hidden'] });
    st.out = function (fin) {
      if (root.dataset.hkClosing) return; root.dataset.hkClosing = '1';
      st.h = panel.offsetHeight || st.h || 400;
      var v = st.relVel || 0; st.relVel = 0;
      run(st.h + 24, v, function () { delete root.dataset.hkClosing; fin(); apply(0); }, false);
    };
    var drag = null, vt = velTracker();
    handle.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || e.target.closest('button, a, input')) return;
      drag = { sy: e.clientY, y0: st.y, on: false, id: e.pointerId }; vt.reset();
      try { handle.setPointerCapture(e.pointerId); } catch (er) {}
    });
    handle.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dy = e.clientY - drag.sy;
      if (!drag.on) { if (Math.abs(dy) < 8) return; drag.on = true; st.sp && st.sp.stop(); drag.y0 = st.y; drag.sy = e.clientY; dy = 0; st.h = panel.offsetHeight || st.h; }
      var ny = drag.y0 + dy; if (ny < 0) ny = -rubber(-ny, st.h);
      apply(ny); vt.add(ny);
    });
    function up(e) {
      if (!drag || e.pointerId !== drag.id) return; var was = drag.on; drag = null; if (!was) return;
      var v = vt.v(), proj = st.y + project(v);
      var close = v > 300 || (v > -300 && proj > st.h * 0.4);
      if (close) {
        st.relVel = v;
        try { (c.close || function () { root.hidden = true; })(); } catch (er) {}
        if (!root.dataset.hkClosing && !root.hidden) run(0, 0, null, false); // kapatılamadıysa yerine dön
      } else run(0, v, null, Math.abs(v) > 300);
    }
    handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up);
  }
  function sheetOut(root, fin) {
    if (typeof root === 'string') root = document.querySelector(root);
    var st = root && sheets.get(root);
    if (!st || !st.out) { fin(); return; }
    st.out(fin);
  }

  /* ---------- 6. Yarı saydam başlık/gezinme katmanları (materyal) ---------- */
  function initGlass(list) {
    (list || []).forEach(function (g) {
      document.querySelectorAll(g[0]).forEach(function (el) {
        el.classList.add('hk-glass'); el.style.setProperty('--hk-base', g[1]);
        if (g[2]) el.classList.add('hk-glass-' + g[2]);
      });
    });
  }

  function init(cfg) {
    cfg = cfg || {};
    document.documentElement.classList.add('hk');
    initPress();
    if (cfg.details !== false) initDetails();
    initGlass(cfg.glass);
    initReveal(cfg);
    (cfg.drawers || []).forEach(initDrawer);
    (cfg.sheets || []).forEach(initSheet);
  }

  window.Hareket = { version: '1.0', init: init, spring: spring, project: project, rubber: rubber, sheetOut: sheetOut, easing: EASE_UI };
})();
