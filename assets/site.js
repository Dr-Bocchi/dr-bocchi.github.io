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
})();
