/* Dario Bocchi — site interactions (no dependencies) */
(function () {
  "use strict";
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------------
     Reveal-on-scroll for timeline entries, papers and talks
     ------------------------------------------------------------------ */
  var revealables = document.querySelectorAll(".tl, .pub, .talk, .feat");
  if (!("IntersectionObserver" in window) || reduceMotion) {
    revealables.forEach(function (el) { el.classList.add("in"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    revealables.forEach(function (el, i) {
      el.style.transitionDelay = Math.min(i % 8, 6) * 40 + "ms";
      io.observe(el);
    });
  }

  /* ------------------------------------------------------------------
     Publication filters
     ------------------------------------------------------------------ */
  var chips = document.querySelectorAll(".pub-filters .chip");
  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      var f = chip.getAttribute("data-filter");
      chips.forEach(function (c) {
        var on = c === chip;
        c.classList.toggle("active", on);
        c.setAttribute("aria-pressed", on ? "true" : "false");
      });
      var visibleYears = {};
      document.querySelectorAll(".pub").forEach(function (p) {
        var show = f === "all" || p.getAttribute("data-kind") === f;
        p.hidden = !show;
        if (show) { visibleYears[p.getAttribute("data-year")] = true; p.classList.add("in"); }
      });
      document.querySelectorAll(".pub-year").forEach(function (y) {
        y.hidden = !visibleYears[y.getAttribute("data-year")];
      });
    });
  });

  /* ------------------------------------------------------------------
     Abstract / BibTeX drawers and copy button
     ------------------------------------------------------------------ */
  document.querySelectorAll(".pill-toggle").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var pub = btn.closest(".pub");
      var which = btn.getAttribute("data-toggle");
      pub.querySelectorAll(".pub-drawer").forEach(function (d) {
        var match = d.getAttribute("data-drawer") === which;
        d.hidden = match ? !d.hidden : true;
      });
      pub.querySelectorAll(".pill-toggle").forEach(function (b) {
        var d = pub.querySelector('.pub-drawer[data-drawer="' + b.getAttribute("data-toggle") + '"]');
        b.setAttribute("aria-expanded", d && !d.hidden ? "true" : "false");
      });
    });
  });
  document.querySelectorAll(".copy-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var code = btn.parentElement.querySelector("code").innerText;
      var done = function () {
        btn.innerHTML = '<i class="bi bi-check2"></i> Copied';
        setTimeout(function () { btn.innerHTML = '<i class="bi bi-clipboard"></i> Copy'; }, 1600);
      };
      if (navigator.clipboard) navigator.clipboard.writeText(code).then(done, function () {});
    });
  });

  /* ------------------------------------------------------------------
     Hero banner: the spectrum of a spiked random matrix.
     The bulk follows Wigner's semicircle on [-2, 2]. With spike strength θ,
     the top eigenvalue sits at the edge (λ₁ = 2) for θ ≤ 1 and detaches to
     λ₁ = θ + 1/θ for θ > 1: the BBP transition. Hover to drive θ yourself.
     ------------------------------------------------------------------ */
  var canvas = document.getElementById("spectrum");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");
  var readout = document.getElementById("spectrum-readout");
  var W = 0, H = 0, dpr = 1, colors = {}, lastColorCheck = -1e9;
  var theta = 1.0, target = null, visible = true;

  function readColors() {
    var cs = getComputedStyle(document.body);
    colors.fg = cs.getPropertyValue("--fg").trim() || "#1c1c1f";
    colors.muted = cs.getPropertyValue("--faint").trim() || "#a1a1aa";
    colors.accent = cs.getPropertyValue("--accent").trim() || "#3b4fd8";
    colors.hot = cs.getPropertyValue("--c-milestone").trim() || "#f59e0b";
  }

  function resize() {
    var r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function layout() {
    var narrow = W < 640;
    return narrow
      ? { xL: 8, xR: W - 8, base: H - 34, hMax: 92 }
      : { xL: W * 0.56, xR: W - 6, base: H - 40, hMax: 128 };
  }
  // map λ ∈ [-2.2, 3.1] to x
  var LMIN = -2.2, LMAX = 3.1;
  function X(L, l) { return L.xL + (l - LMIN) / (LMAX - LMIN) * (L.xR - L.xL); }

  function hash(i) { var s = Math.sin(i * 127.1) * 43758.5453; return s - Math.floor(s); }

  function draw(t) {
    if (t - lastColorCheck > 600) { readColors(); lastColorCheck = t; }
    var L = layout();
    ctx.clearRect(0, 0, W, H);

    // baseline
    ctx.strokeStyle = colors.muted;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(X(L, -2.15), L.base + 6.5);
    ctx.lineTo(X(L, LMAX - 0.05), L.base + 6.5);
    ctx.stroke();

    // edge tick
    var xe = X(L, 2);
    ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(xe, L.base + 6.5); ctx.lineTo(xe, L.base - L.hMax * 0.55); ctx.stroke();
    ctx.setLineDash([]);

    // stippled semicircle bulk
    var pitch = W < 640 ? 6 : 7;
    var cols = Math.floor((X(L, 2) - X(L, -2)) / pitch);
    ctx.fillStyle = colors.fg;
    for (var c = 0; c <= cols; c++) {
      var l = -2 + 4 * c / cols;
      var rho = Math.sqrt(Math.max(0, 1 - l * l / 4));
      var wobble = reduceMotion ? 0 : 0.07 * Math.sin(t * 0.0011 + hash(c) * 6.28) * Math.sqrt(rho);
      var n = Math.max(rho > 0.02 ? 1 : 0, Math.round(rho * (1 + wobble) * L.hMax / pitch));
      var x = X(L, l);
      for (var k = 0; k < n; k++) {
        var fade = 1 - k / (L.hMax / pitch + 2);
        ctx.globalAlpha = 0.16 + 0.22 * fade;
        ctx.beginPath();
        ctx.arc(x, L.base - k * pitch, 1.35, 0, 6.2832);
        ctx.fill();
      }
    }

    // spike strength: auto sweep, or follow the pointer
    var auto = 1.15 + 0.95 * Math.sin(t * 0.00055);
    var goal = target != null ? target : (reduceMotion ? 1.8 : auto);
    theta += (goal - theta) * (target != null ? 0.12 : 1);
    var detached = theta > 1;
    var lam = detached ? theta + 1 / theta : 2;
    var xo = X(L, lam);

    // outlier eigenvalue
    ctx.globalAlpha = detached ? 0.18 : 0.08;
    ctx.fillStyle = colors.hot;
    ctx.beginPath(); ctx.arc(xo, L.base, 10, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(xo, L.base, detached ? 3.6 : 3, 0, 6.2832); ctx.fill();

    // label
    ctx.globalAlpha = detached ? 0.95 : 0.5;
    ctx.font = '500 11px "JetBrains Mono", ui-monospace, monospace';
    ctx.textAlign = "center";
    ctx.fillText("λ₁", xo, L.base - 16);
    ctx.globalAlpha = 1;

    if (readout) readout.textContent = "θ = " + theta.toFixed(2) + "  ·  λ₁ = " + lam.toFixed(2);
  }

  var raf = null;
  function loop(t) {
    raf = null;
    if (!visible || document.hidden) return;
    draw(t);
    if (!reduceMotion || target != null) raf = requestAnimationFrame(loop);
  }
  function kick() { if (raf == null) raf = requestAnimationFrame(loop); }

  canvas.addEventListener("pointermove", function (e) {
    var L = layout(), r = canvas.getBoundingClientRect();
    var x = e.clientX - r.left;
    var f = (x - X(L, -1.0)) / (X(L, LMAX) - X(L, -1.0));
    target = 0.3 + Math.max(0, Math.min(1, f)) * 1.9;
    kick();
  });
  canvas.addEventListener("pointerleave", function () { target = null; kick(); });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) kick(); }).observe(canvas);
  }
  document.addEventListener("visibilitychange", kick);
  window.addEventListener("resize", function () { resize(); kick(); });
  // re-read colours when the light/dark toggle is used
  new MutationObserver(function () { lastColorCheck = -1e9; kick(); })
    .observe(document.body, { attributes: true, attributeFilter: ["class"] });

  resize();
  readColors();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(kick);
  kick();
})();
