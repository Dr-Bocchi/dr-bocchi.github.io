/* ==========================================================================
   Hero banner: Dyson's eigenvalue flow.

   The eigenvalues of a slowly evolving random symmetric matrix, traced over
   time. They repel each other and never cross (level repulsion), fanning out
   from a single point, then weaving on forever. On the right, the current
   spectrum is drawn as a column of spectral lines; the curves are its trail.

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

  function resize() {
    var r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var narrow = W < 640;
    Lay = narrow
      ? { x0: 0, x1: W - 40, cy: H - 90, amp: 64, specW: 26, fadeFrom: 0, fadeTo: W * 0.45 }
      : { x0: W * 0.50, x1: W - 52, cy: H * 0.5, amp: H * 0.36, specW: 34, fadeFrom: W * 0.53, fadeTo: W * 0.86 };
    cap = Math.ceil((Lay.x1 - Lay.x0) / STEP) + 2;
    while (hist.length > cap) hist.shift();
  }

  /* ---------------- drawing ---------------- */
  function Y(l) { return Lay.cy - l / 2 * Lay.amp; }

  function draw(frac) {
    ctx.clearRect(0, 0, W, H);
    var n = hist.length;
    if (n < 2) return;
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

    // the current spectrum: one short spectral line per eigenvalue
    var last = hist[n - 1], xs = xHead + 4, y;
    ctx.lineCap = "round";
    for (k = 0; k < N; k++) {
      y = Math.round(Y(last[k])) + 0.5;
      ctx.strokeStyle = k === top ? colors.hot : colors.fg;
      ctx.globalAlpha = k === top ? 1 : 0.62;
      ctx.lineWidth = k === top ? 2 : 1.3;
      ctx.beginPath(); ctx.moveTo(xs, y); ctx.lineTo(xs + Lay.specW, y); ctx.stroke();
    }
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
