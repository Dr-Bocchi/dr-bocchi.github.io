/* ==========================================================================
   Hero banner: a live spiked Wigner matrix and its BBP transition.

   M = W + θ u uᵀ, with W an N×N GOE matrix (semicircle on [-2, 2]).
   W is sampled directly in tridiagonal form (Dumitriu–Edelman): diagonal
   N(0, 2/N), off-diagonals χ_{N-1}/√N, …, χ_1/√N. The Householder reduction
   that produces it fixes e₁, so taking u = e₁ the spike only shifts T[0][0].
   Each frame the underlying Gaussians take an Ornstein–Uhlenbeck step and we
   diagonalise T with implicit QL, tracking only the first row of the
   eigenvector matrix: that gives every eigenvalue λ_k and its overlap
   ⟨v_k, u⟩² with the planted direction, in O(N²).

   Drawn: time-averaged eigenvalue histogram vs the semicircle (top),
   overlaps ⟨v_k, u⟩² as amber stems (bottom), the top eigenvalue λ₁, and an
   inset tracking the measured overlap against the theory 1 − 1/θ².
   ========================================================================== */
(function () {
  "use strict";
  var canvas = document.getElementById("spectrum");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- model ---------------- */
  var N = 100;
  var gd = new Float64Array(N);            // diagonal Gaussians
  var offStart = new Int32Array(N);        // off-diagonal i uses N-1-i Gaussians
  var total = 0;
  for (var i = 0; i < N - 1; i++) { offStart[i] = total; total += N - 1 - i; }
  offStart[N - 1] = total;
  var go = new Float64Array(total);

  function randn() {
    var u = 1 - Math.random(), v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307179586 * v);
  }
  for (i = 0; i < N; i++) gd[i] = randn();
  for (i = 0; i < total; i++) go[i] = randn();

  function evolve(rho) {
    var s = Math.sqrt(1 - rho * rho), k;
    for (k = 0; k < N; k++) gd[k] = rho * gd[k] + s * randn();
    for (k = 0; k < total; k++) go[k] = rho * go[k] + s * randn();
  }

  var d = new Float64Array(N), e = new Float64Array(N), z = new Float64Array(N);

  // Implicit QL for a symmetric tridiagonal matrix (Numerical Recipes "tqli"),
  // updating only row 0 of the eigenvector matrix. e[i] couples i and i+1.
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
            f = z[k + 1]; z[k + 1] = s * z[k] + c * f; z[k] = c * z[k] - s * f;
          }
          if (r === 0 && k >= l) continue;
          d[l] -= p; e[l] = g; e[m] = 0;
        }
      } while (m !== l);
    }
  }

  var top = 0; // index of the largest eigenvalue after diagonalise()
  function diagonalise(theta) {
    var sd = Math.sqrt(2 / N), so = 1 / Math.sqrt(N), k, j, s;
    for (k = 0; k < N; k++) d[k] = sd * gd[k];
    d[0] += theta;
    for (k = 0; k < N - 1; k++) {
      s = 0;
      for (j = offStart[k]; j < offStart[k + 1]; j++) s += go[j] * go[j];
      e[k] = so * Math.sqrt(s);
    }
    e[N - 1] = 0;
    z.fill(0); z[0] = 1;
    tqli(N);
    top = 0;
    for (k = 1; k < N; k++) if (d[k] > d[top]) top = k;
  }

  /* ---------------- layout & colours ---------------- */
  var W = 0, H = 0, dpr = 1, L = null, colors = {}, lastColorCheck = -1e9;
  var LMIN = -2.3, LMAX = 3.2, HMIN = -2.3, HMAX = 2.4;
  var hist = null, B = 0;

  function readColors() {
    var cs = getComputedStyle(document.body);
    colors.fg = cs.getPropertyValue("--fg").trim() || "#1c1c1f";
    colors.muted = cs.getPropertyValue("--muted").trim() || "#6b6b76";
    colors.faint = cs.getPropertyValue("--faint").trim() || "#a1a1aa";
    colors.hot = cs.getPropertyValue("--c-milestone").trim() || "#f59e0b";
  }

  function X(l) { return L.xL + (l - LMIN) / (LMAX - LMIN) * (L.xR - L.xL); }

  function resize() {
    var r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var narrow = W < 640;
    L = narrow
      ? { xL: 6, xR: W - 6, base: H - 50, hMax: 74, sMax: 34, pitch: 6, insetTop: H - 226, insetH: 44, insetL: 1.45 }
      : { xL: W * 0.5, xR: W - 4, base: H - 56, hMax: 112, sMax: 44, pitch: 6.5, insetTop: 30, insetH: 62, insetL: 1.3 };
    var nb = Math.max(10, Math.floor((X(HMAX) - X(HMIN)) / L.pitch));
    if (nb !== B) { B = nb; hist = null; }
  }

  function accumulate(alpha) {
    if (!hist) hist = new Float64Array(B);
    var counts = new Float64Array(B), w = (HMAX - HMIN) / B, k, b;
    for (k = 0; k < N; k++) {
      b = Math.floor((d[k] - HMIN) / w);
      if (b >= 0 && b < B) counts[b]++;
    }
    for (b = 0; b < B; b++) hist[b] += alpha * (counts[b] - hist[b]);
  }

  /* ---------------- state ---------------- */
  var theta = 1.0, target = null, visible = true, lastT = null;
  var trail = [];

  function warmUp(th) {
    hist = null;
    for (var k = 0; k < 40; k++) { evolve(0.6); diagonalise(th); accumulate(k === 0 ? 1 : 0.08); }
  }

  /* ---------------- drawing ---------------- */
  function draw() {
    var k, x, y, n, b, pitch = L.pitch, base = L.base;
    var dens2px = Math.PI * L.hMax;               // semicircle peak 1/π ↦ hMax
    ctx.clearRect(0, 0, W, H);

    // histogram (stippled) of the time-averaged spectrum
    var w = (HMAX - HMIN) / B;
    ctx.fillStyle = colors.fg;
    for (b = 0; b < B; b++) {
      var dens = hist[b] / (N * w);
      n = Math.round(dens * dens2px / pitch);
      x = X(HMIN + (b + 0.5) * w);
      for (k = 0; k < n; k++) {
        ctx.globalAlpha = 0.14 + 0.24 * (1 - k / (L.hMax / pitch + 3));
        ctx.beginPath(); ctx.arc(x, base - k * pitch, 1.3, 0, 6.2832); ctx.fill();
      }
    }

    // theory: semicircle ρ(λ) = √(4-λ²)/2π
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = colors.muted;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (k = 0; k <= 80; k++) {
      var l = -2 + 4 * k / 80;
      y = base - Math.sqrt(Math.max(0, 4 - l * l)) / (2 * Math.PI) * dens2px;
      if (k === 0) ctx.moveTo(X(l), y); else ctx.lineTo(X(l), y);
    }
    ctx.stroke();

    // axis + eigenvalue ticks
    var axisY = base + 6;
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = colors.faint;
    ctx.beginPath(); ctx.moveTo(X(LMIN), axisY); ctx.lineTo(X(LMAX) - 2, axisY); ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = colors.fg;
    ctx.beginPath();
    for (k = 0; k < N; k++) {
      if (k === top) continue;
      x = Math.round(X(d[k])) + 0.5;
      ctx.moveTo(x, axisY - 4); ctx.lineTo(x, axisY);
    }
    ctx.stroke();

    // overlaps ⟨v_k, u⟩² as stems below the axis (√ scale so the bulk is visible)
    ctx.strokeStyle = colors.hot;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    for (k = 0; k < N; k++) {
      var h = L.sMax * z[k] * z[k];
      if (h < 1) continue;
      x = Math.round(X(d[k])) + 0.5;
      ctx.globalAlpha = k === top ? 0.95 : 0.6;
      ctx.beginPath(); ctx.moveTo(x, axisY + 3); ctx.lineTo(x, axisY + 3 + h); ctx.stroke();
    }

    // λ₁
    var lam1 = d[top], ov = z[top] * z[top], xo = X(lam1);
    var out = lam1 > 2.06;
    ctx.fillStyle = colors.hot;
    ctx.globalAlpha = out ? 0.2 : 0.1;
    ctx.beginPath(); ctx.arc(xo, axisY - 2, 9, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(xo, axisY - 2, 3.2, 0, 6.2832); ctx.fill();
    ctx.font = 'italic 500 12px Inter, system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.globalAlpha = out ? 0.95 : 0.55;
    ctx.fillText("λ₁", xo, axisY - 16);

    // footer label
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = colors.faint;
    ctx.textAlign = "left";
    ctx.font = '400 10px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText("spiked Wigner matrix · N = " + N + (W < 640 ? " · drag to tune" : " · hover to tune the signal"), X(LMIN), H - 4);

    drawInset(ov, lam1);
    ctx.globalAlpha = 1;
  }

  function drawInset(ov, lam1) {
    var x0 = X(L.insetL), x1 = X(LMAX) - 4, y0 = L.insetTop, y1 = L.insetTop + L.insetH;
    var TH = 2.4;
    var px = function (t) { return x0 + Math.min(t, TH) / TH * (x1 - x0); };
    var py = function (o) { return y1 - o * (y1 - y0); };

    ctx.lineWidth = 1;
    ctx.strokeStyle = colors.faint;
    ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); ctx.lineTo(x1, y1); ctx.stroke();

    // θ_c = 1
    ctx.setLineDash([2, 3]);
    ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(px(1), y0); ctx.lineTo(px(1), y1); ctx.stroke();
    ctx.setLineDash([]);

    // theory 1 − 1/θ²
    ctx.strokeStyle = colors.muted;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(px(0), py(0)); ctx.lineTo(px(1), py(0));
    for (var k = 1; k <= 60; k++) { var t = 1 + (TH - 1) * k / 60; ctx.lineTo(px(t), py(1 - 1 / (t * t))); }
    ctx.stroke();

    // measured trail
    ctx.fillStyle = colors.hot;
    for (k = 0; k < trail.length; k++) {
      ctx.globalAlpha = 0.5 * (k + 1) / trail.length;
      ctx.beginPath(); ctx.arc(px(trail[k][0]), py(trail[k][1]), 1.3, 0, 6.2832); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(px(theta), py(ov), 3, 0, 6.2832); ctx.fill();

    // labels
    ctx.font = 'italic 400 11px Inter, system-ui, sans-serif';
    ctx.fillStyle = colors.faint;
    ctx.textAlign = "left";
    ctx.fillText("⟨v₁, u⟩²", x0 + 5, y0 + 8);
    ctx.textAlign = "center";
    ctx.fillText("1", px(1), y1 + 13);
    ctx.textAlign = "right";
    ctx.fillText("θ", x1, y1 + 13);
    ctx.fillStyle = colors.muted;
    ctx.font = '400 11px Inter, system-ui, sans-serif';
    ctx.fillText("θ = " + theta.toFixed(2) + "   λ₁ = " + lam1.toFixed(2) + "   overlap² = " + ov.toFixed(2), x1, y1 + 30);
  }

  /* ---------------- loop ---------------- */
  var raf = null;
  function step(t) {
    raf = null;
    if (!visible || document.hidden) { lastT = null; return; }
    if (t - lastColorCheck > 600) { readColors(); lastColorCheck = t; }
    var dt = lastT == null ? 16 : Math.min(50, t - lastT);
    lastT = t;

    var auto = 1.2 + 1.0 * Math.sin(t * 0.00042);
    var goal = target != null ? target : (reduceMotion ? 1.6 : auto);
    theta += (goal - theta) * (target != null ? 0.15 : 1);

    evolve(Math.exp(-dt / 900));
    diagonalise(theta);
    accumulate(0.035);
    trail.push([theta, z[top] * z[top]]);
    if (trail.length > 70) trail.shift();

    draw();
    if (!reduceMotion || target != null) raf = requestAnimationFrame(step);
  }
  function kick() { if (raf == null) raf = requestAnimationFrame(step); }

  canvas.addEventListener("pointermove", function (ev) {
    var r = canvas.getBoundingClientRect();
    var f = (ev.clientX - r.left - X(-1.5)) / (X(LMAX) - X(-1.5));
    target = 0.2 + Math.max(0, Math.min(1, f)) * 2.1;
    kick();
  });
  canvas.addEventListener("pointerleave", function () { target = null; kick(); });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) kick(); }).observe(canvas);
  }
  document.addEventListener("visibilitychange", kick);
  window.addEventListener("resize", function () { resize(); if (!hist) warmUp(theta); kick(); });
  new MutationObserver(function () { lastColorCheck = -1e9; kick(); })
    .observe(document.body, { attributes: true, attributeFilter: ["class"] });

  resize();
  readColors();
  theta = reduceMotion ? 1.6 : 1.2;
  warmUp(theta);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(kick);
  kick();
})();
