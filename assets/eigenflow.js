/* ==========================================================================
   Hero banner: Dyson's eigenvalue flow.

   The eigenvalues of a slowly evolving random symmetric matrix, traced over
   time. They repel each other and never cross (level repulsion), fanning out
   from a single point, then weaving on forever. The dots on the right are the
   current spectrum; the curves behind them are its trail.

   Implementation: a GOE matrix in tridiagonal (Dumitriu–Edelman) form whose
   underlying Gaussians follow an Ornstein–Uhlenbeck process, started from
   zero. Eigenvalues of a Jacobi matrix are always simple, so the sorted
   eigenvalues trace continuous, non-crossing curves.
   ========================================================================== */
(function () {
"use strict";
// options (data attributes on the canvas, as fractions of the band width):
//   data-prefill   how much history to simulate before the first frame (0 = start live from t = 0)
//   data-fade-from / data-fade-to   where the left fade-out starts / ends
function Eigenflow(canvas) {
  var ds = canvas.dataset;
  var opt = {
    prefill: ds.prefill != null ? +ds.prefill : 0.62,
    fadeFrom: ds.fadeFrom != null ? +ds.fadeFrom : 0.06,
    fadeTo: ds.fadeTo != null ? +ds.fadeTo : 0.72
  };
  var ctx = canvas.getContext("2d");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- model ---------------- */
  var N = 26;
  var gd = new Float64Array(N), offStart = new Int32Array(N), total = 0, i;
  for (i = 0; i < N - 1; i++) { offStart[i] = total; total += N - 1 - i; }
  offStart[N - 1] = total;
  var go = new Float64Array(total);           // start from the zero matrix
  var d = new Float64Array(N), e = new Float64Array(N);

  function randn() {
    var u = 1 - Math.random(), v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307179586 * v);
  }
  function evolve(rho) {
    var s = Math.sqrt(1 - rho * rho), k;
    for (k = 0; k < N; k++) gd[k] = rho * gd[k] + s * randn();
    for (k = 0; k < total; k++) go[k] = rho * go[k] + s * randn();
  }

  // eigenvalues of a symmetric tridiagonal matrix (implicit QL); e[i] couples i, i+1
  function tqli(n) {
    var m, l, iter, k, s, r, p, g, f, dd, c, b;
    for (l = 0; l < n; l++) {
      iter = 0;
      do {
        for (m = l; m < n - 1; m++) {
          dd = Math.abs(d[m]) + Math.abs(d[m + 1]);
          if (Math.abs(e[m]) <= 1e-14 * dd) break;
        }
        if (m !== l) {
          if (iter++ === 50) break;
          g = (d[l + 1] - d[l]) / (2 * e[l]);
          r = Math.sqrt(g * g + 1);
          g = d[m] - d[l] + e[l] / (g + (g >= 0 ? r : -r));
          s = c = 1; p = 0;
          for (k = m - 1; k >= l; k--) {
            f = s * e[k]; b = c * e[k];
            r = Math.sqrt(f * f + g * g);
            e[k + 1] = r;
            if (r === 0) { d[k + 1] -= p; e[m] = 0; break; }
            s = f / r; c = g / r;
            g = d[k + 1] - p;
            r = (d[k] - g) * s + 2 * c * b;
            p = s * r;
            d[k + 1] = g + p;
            g = c * r - b;
          }
          if (r === 0 && k >= l) continue;
          d[l] -= p; e[l] = g; e[m] = 0;
        }
      } while (m !== l);
    }
  }

  function spectrum() {
    var sd = Math.sqrt(2 / N), so = 1 / Math.sqrt(N), k, j, s;
    for (k = 0; k < N; k++) d[k] = sd * gd[k];
    for (k = 0; k < N - 1; k++) {
      s = 0;
      for (j = offStart[k]; j < offStart[k + 1]; j++) s += go[j] * go[j];
      e[k] = so * Math.sqrt(s) + 1e-9;
    }
    e[N - 1] = 0;
    tqli(N);
    return Array.prototype.slice.call(d).sort(function (a, b) { return a - b; });
  }

  /* ---------------- history of spectra ---------------- */
  var STEP = 2;          // px between samples
  var RHO = 0.9955;         // OU memory per sample
  var hist = [];           // sorted spectra, newest last
  var cap = 0;

  function push() {
    evolve(RHO);
    hist.push(spectrum());
    if (hist.length > cap) hist.shift();
  }

  /* ---------------- layout & colours ---------------- */
  var W = 0, H = 0, dpr = 1, colors = {}, lastColorCheck = -1e9, Lay;

  function readColors() {
    var cs = getComputedStyle(document.body);
    colors.fg = cs.getPropertyValue("--fg").trim() || "#1c1c1f";
    colors.hot = cs.getPropertyValue("--c-milestone").trim() || "#f59e0b";
  }

  var heroText = canvas.parentNode.querySelector(".hero-text");
  function resize() {
    var r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    Lay = null;
    if (W < 10 || H < 10) return;                       // hidden (phones)
    // the band starts to the right of the name, never underneath it
    var textRight = heroText ? heroText.getBoundingClientRect().right - r.left : W * 0.4;
    var x0 = Math.max(W * 0.5, textRight + 40), x1 = W - 16, span = x1 - x0;
    if (span < 180) return;                              // not enough room: draw nothing
    Lay = { x0: x0, x1: x1, cy: H * 0.5, amp: H * 0.36, fadeFrom: x0 + opt.fadeFrom * span, fadeTo: x0 + opt.fadeTo * span };
    cap = Math.ceil(span / STEP) + 2;
    while (hist.length > cap) hist.shift();
    // (re)fill so the fan is on screen when the banner (re)appears
    if (hist.length < 2) restart();
  }
  // t = 0: the zero matrix, all eigenvalues at one point
  function restart() {
    hist = []; gd.fill(0); go.fill(0); acc = 0;
    var pre = Math.max(1, Math.floor(cap * (reduceMotion ? 1 : opt.prefill)));
    for (var k = 0; k < pre; k++) push();
  }

  /* ---------------- drawing ---------------- */
  function Y(l) { return Lay.cy - l / 2 * Lay.amp; }

  function draw(frac) {
    ctx.clearRect(0, 0, W, H);
    if (!Lay) return;
    var n = hist.length;
    if (n < 1) return;
    var xHead = Lay.x1, k, j, x, top = N - 1;

    // trails: the history of each eigenvalue, newest point pinned at the head
    ctx.lineJoin = "round";
    for (k = 0; k < N; k++) {
      ctx.strokeStyle = k === top ? colors.hot : colors.fg;
      ctx.globalAlpha = k === top ? 0.85 : (k === 0 ? 0.42 : 0.24);
      ctx.lineWidth = k === top ? 1.5 : 1;
      ctx.beginPath();
      for (j = 0; j < n; j++) {
        x = j === n - 1 ? xHead : xHead - (n - 1 - j + frac) * STEP;
        if (j === 0) ctx.moveTo(x, Y(hist[j][k])); else ctx.lineTo(x, Y(hist[j][k]));
      }
      ctx.stroke();
    }

    // fade the trails out towards the left
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "destination-in";
    var g = ctx.createLinearGradient(Lay.fadeFrom, 0, Lay.fadeTo, 0);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";

    // the current spectrum: a column of dots at the head of the trails
    var last = hist[n - 1], y;
    for (k = 0; k < N; k++) {
      y = Y(last[k]);
      if (k === top) {
        ctx.fillStyle = colors.hot;
        ctx.globalAlpha = 0.18;
        ctx.beginPath(); ctx.arc(xHead, y, 7, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(xHead, y, 3.2, 0, 6.2832); ctx.fill();
      } else {
        ctx.fillStyle = colors.fg;
        ctx.globalAlpha = 0.78;
        ctx.beginPath(); ctx.arc(xHead, y, 2.1, 0, 6.2832); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------------- loop ---------------- */
  var raf = null, visible = true, acc = 0, lastT = null;
  var SPEED = 22;          // px per second

  function frame(t) {
    raf = null;
    if (!visible || document.hidden || !Lay) { lastT = null; return; }
    if (t - lastColorCheck > 600) { readColors(); lastColorCheck = t; }
    var dt = lastT == null ? 16 : Math.min(60, t - lastT);
    lastT = t;
    acc += dt / 1000 * SPEED / STEP;
    while (acc >= 1) { push(); acc -= 1; }
    draw(acc);
    raf = requestAnimationFrame(frame);
  }
  function kick() { if (raf == null && !reduceMotion) raf = requestAnimationFrame(frame); }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) kick(); }).observe(canvas);
  }
  document.addEventListener("visibilitychange", kick);
  var rz, onResize = function () {
    clearTimeout(rz);
    rz = setTimeout(function () { resize(); draw(0); kick(); }, 60);
  };
  window.addEventListener("resize", onResize);
  // also catches the banner going from hidden (phones) to visible and back
  if ("ResizeObserver" in window) new ResizeObserver(onResize).observe(canvas);
  new MutationObserver(function () { readColors(); draw(0); })
    .observe(document.body, { attributes: true, attributeFilter: ["class"] });

  readColors();
  resize();                     // also pre-fills the fan when the banner is visible
  draw(0);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { readColors(); draw(0); });
  kick();
  canvas.eigenflow = { restart: function () { if (Lay) { restart(); draw(0); kick(); } } };
}
document.querySelectorAll("canvas.eigenflow, #spectrum").forEach(Eigenflow);
})();
