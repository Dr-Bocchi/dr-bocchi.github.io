/* ==========================================================================
   Hero banner: Dyson's eigenvalue flow.

   The eigenvalues of a slowly evolving random symmetric matrix, traced over
   time. They repel each other and never cross (level repulsion), fanning out
   from a single point, then weaving on forever. At the head, the eigenvalues
   pile up into Wigner's semicircle, drawn as a stippled density.

   Implementation: a GOE matrix in tridiagonal (Dumitriu–Edelman) form whose
   underlying Gaussians follow an Ornstein–Uhlenbeck process, started from
   zero. Eigenvalues of a Jacobi matrix are always simple, so the sorted
   eigenvalues trace continuous, non-crossing curves.
   ========================================================================== */
(function () {
  "use strict";
  var canvas = document.getElementById("spectrum");
  if (!canvas) return;
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

  // time-averaged density on the eigenvalue axis (starts at the semicircle,
  // then follows the live spectrum once the flow has left the zero matrix)
  var BINS = 44, BMIN = -2.2, BMAX = 2.2, BW = (BMAX - BMIN) / BINS;
  var dens = new Float64Array(BINS), pushes = 0;
  for (i = 0; i < BINS; i++) {
    var lc = BMIN + (i + 0.5) * BW;
    dens[i] = Math.sqrt(Math.max(0, 4 - lc * lc)) / (2 * Math.PI);
  }

  function push() {
    evolve(RHO);
    var sp = spectrum();
    hist.push(sp);
    if (hist.length > cap) hist.shift();
    if (++pushes > 300) {
      var cnt = new Float64Array(BINS), k, b;
      for (k = 0; k < N; k++) { b = Math.floor((sp[k] - BMIN) / BW); if (b >= 0 && b < BINS) cnt[b]++; }
      for (b = 0; b < BINS; b++) dens[b] += 0.004 * (cnt[b] / (N * BW) - dens[b]);
    }
  }

  /* ---------------- layout & colours ---------------- */
  var W = 0, H = 0, dpr = 1, colors = {}, lastColorCheck = -1e9, Lay;

  function readColors() {
    var cs = getComputedStyle(document.body);
    colors.fg = cs.getPropertyValue("--fg").trim() || "#1c1c1f";
    colors.hot = cs.getPropertyValue("--c-milestone").trim() || "#f59e0b";
  }

  function resize() {
    var r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var narrow = W < 640;
    Lay = narrow
      ? { x0: 0, x1: W - 62, cy: H - 90, amp: 64, semW: 46, fadeFrom: 0, fadeTo: W * 0.45 }
      : { x0: W * 0.50, x1: W - 92, cy: H * 0.5, amp: H * 0.36, semW: 74, fadeFrom: W * 0.53, fadeTo: W * 0.84 };
    cap = Math.ceil((Lay.x1 - Lay.x0) / STEP) + 2;
    while (hist.length > cap) hist.shift();
  }

  /* ---------------- drawing ---------------- */
  function draw(frac) {
    ctx.clearRect(0, 0, W, H);
    var n = hist.length;
    if (n < 2) return;
    var xHead = Lay.x1, k, j, x, y, top = N - 1;

    // worldlines
    ctx.lineJoin = "round";
    for (k = 0; k < N; k++) {
      var edge = k === 0;
      ctx.strokeStyle = k === top ? colors.hot : colors.fg;
      ctx.globalAlpha = k === top ? 0.9 : (edge ? 0.45 : 0.26);
      ctx.lineWidth = k === top ? 1.6 : 1;
      ctx.beginPath();
      for (j = 0; j < n; j++) {
        x = xHead - (n - 1 - j + frac) * STEP;
        y = Lay.cy - hist[j][k] / 2 * Lay.amp;
        if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // current spectrum: a column of dots at the head
    var last = hist[n - 1];
    for (k = 0; k < N; k++) {
      y = Lay.cy - last[k] / 2 * Lay.amp;
      ctx.globalAlpha = k === top ? 1 : 0.7;
      ctx.fillStyle = k === top ? colors.hot : colors.fg;
      ctx.beginPath(); ctx.arc(xHead - frac * STEP, y, k === top ? 2.6 : 1.6, 0, 6.2832); ctx.fill();
    }

    // fade the trail out towards the left
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "destination-in";
    var g = ctx.createLinearGradient(Lay.fadeFrom, 0, Lay.fadeTo, 0);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";

    drawSemicircle(xHead + 9);
  }

  // stippled eigenvalue density at the head, plus a hairline semicircle
  function drawSemicircle(xs) {
    var b, k, y, n;
    var maxDots = Math.floor(Lay.semW / 4.6);
    ctx.fillStyle = colors.fg;
    for (b = 0; b < BINS; b++) {
      y = Lay.cy - (BMIN + (b + 0.5) * BW) / 2 * Lay.amp;
      n = Math.min(maxDots + 2, Math.round(dens[b] * Math.PI * maxDots));
      for (k = 0; k < n; k++) {
        ctx.globalAlpha = 0.5 - 0.32 * k / (maxDots + 1);
        ctx.beginPath(); ctx.arc(xs + k * 4.6, y, 1.25, 0, 6.2832); ctx.fill();
      }
    }
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = colors.fg;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (k = 0; k <= 60; k++) {
      var l = -2 + 4 * k / 60;
      var xx = xs + Math.sqrt(Math.max(0, 4 - l * l)) / 2 * (maxDots - 1) * 4.6;
      y = Lay.cy - l / 2 * Lay.amp;
      if (k === 0) ctx.moveTo(xx, y); else ctx.lineTo(xx, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /* ---------------- loop ---------------- */
  var raf = null, visible = true, acc = 0, lastT = null;
  var SPEED = 22;          // px per second

  function frame(t) {
    raf = null;
    if (!visible || document.hidden) { lastT = null; return; }
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
  window.addEventListener("resize", function () { resize(); draw(0); kick(); });
  new MutationObserver(function () { readColors(); draw(0); })
    .observe(document.body, { attributes: true, attributeFilter: ["class"] });

  resize();
  readColors();
  // pre-fill part of the window so the fan-out from zero is on screen at load
  var pre = Math.floor(cap * (reduceMotion ? 1 : 0.62));
  for (i = 0; i < pre; i++) push();
  draw(0);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { readColors(); draw(0); });
  kick();
})();
