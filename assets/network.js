/* ==========================================================================
   Collaborators graph: me → papers → co-authors.

   Data: window.NET_PAPERS (data/papers.yml) and window.NET_PEOPLE
   (data/people.yml). Layout: a small deterministic force simulation (links
   pull papers towards me and people towards their papers, nodes repel,
   no overlaps), so research groups form their own clusters. Edges are soft
   curves with colour gradients; the whole network drifts gently.
   Pure SVG, no dependencies.
   ========================================================================== */
(function () {
  "use strict";
  var host = document.getElementById("network");
  if (!host || !window.NET_PAPERS || !window.NET_PEOPLE) return;

  var ME = "Dario Bocchi";
  var NS = "http://www.w3.org/2000/svg";
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var tip = document.getElementById("net-tip");
  var TAU = Math.PI * 2;

  /* ---------------- data ---------------- */
  var meta = {};
  window.NET_PEOPLE.forEach(function (p) { meta[p.name] = p; });
  var papers = window.NET_PAPERS.map(function (p, i) {
    return {
      type: "paper", i: i, title: p.title, year: p.year, kind: p.kind, venue: p.venue, badge: p.badge, url: p.url,
      authors: String(p.authors).split(",").map(function (s) { return s.trim(); }).filter(function (a) { return a && a !== ME; })
    };
  });
  var people = [], byName = {};
  papers.forEach(function (p) {
    p.authors.forEach(function (a) {
      if (!byName[a]) { byName[a] = { type: "person", name: a, papers: [], meta: meta[a] || {} }; people.push(byName[a]); }
      byName[a].papers.push(p.i);
    });
  });
  var me = { type: "me", name: ME, x: 0, y: 0, fixed: true };

  /* ---------------- deterministic randomness ---------------- */
  var seed = 7;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function hash(str) { var h = 0; for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return h; }

  /* ---------------- force layout ---------------- */
  function layout(G) {
    seed = 7;
    var nodes = [me].concat(papers, people), links = [];
    var P = papers.length, N = people.length;
    // initial guess: papers on a ring, people near the mean of their papers
    papers.forEach(function (p, k) {
      var a = -Math.PI / 2 + TAU * k / P;
      p.x = G.R1 * G.ax * Math.cos(a); p.y = G.R1 * Math.sin(a);
      p.r = G.dot + 8;
      links.push({ a: me, b: p, len: G.R1, k: 0.3 });
    });
    people.forEach(function (q) {
      var sx = 0, sy = 0;
      q.papers.forEach(function (pi) { sx += papers[pi].x; sy += papers[pi].y; });
      var n = q.papers.length, ang = Math.atan2(sy, sx) + (rnd() - 0.5) * 0.6;
      var rad = G.R1 + G.L * (1.25 - 0.18 * Math.min(n, 4));
      q.x = rad * G.ax * Math.cos(ang); q.y = rad * Math.sin(ang);
      q.r = G.pr + (G.labels ? 30 * G.fs : 8);
      q.papers.forEach(function (pi) { links.push({ a: papers[pi], b: q, len: G.L * (n > 1 ? 0.9 : 1), k: 0.05 }); });
    });
    // co-authors of the same paper attract each other -> project clusters
    papers.forEach(function (p) {
      for (var u = 0; u < p.authors.length; u++) for (var v = u + 1; v < p.authors.length; v++)
        links.push({ a: byName[p.authors[u]], b: byName[p.authors[v]], len: 2 * G.pr + 46, k: 0.007 });
    });
    me.r = G.cr + 26;
    nodes.forEach(function (n) { n.vx = 0; n.vy = 0; });
    // people with more shared papers want to sit closer to me
    people.forEach(function (q) { q.target = G.R1 + G.L * (1.25 - 0.2 * Math.min(q.papers.length - 1, 3)); });

    for (var it = 0; it < 900; it++) {
      var alpha = 1 - it / 900;
      // links
      links.forEach(function (l) {
        var dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        var f = (d - l.len) * l.k * alpha, fx = dx / d * f, fy = dy / d * f;
        if (!l.a.fixed) { l.a.vx += fx * 0.5; l.a.vy += fy * 0.5; }
        if (!l.b.fixed) { l.b.vx -= fx; l.b.vy -= fy; }
      });
      // repulsion + collisions
      for (var i = 0; i < nodes.length; i++) for (var j = i + 1; j < nodes.length; j++) {
        var a = nodes[i], b = nodes[j], dx2 = b.x - a.x, dy2 = b.y - a.y, d2 = dx2 * dx2 + dy2 * dy2 || 1, d = Math.sqrt(d2);
        var charge = (a.type === "person" && b.type === "person") ? 7500 : (a.type === "paper" && b.type === "paper") ? 14000 : 3000;
        var rep = charge * alpha / d2;
        var min = a.r + b.r + 14;
        if (d < min) rep += (min - d) * 0.5;
        var ux = dx2 / d, uy = dy2 / d;
        if (!a.fixed) { a.vx -= ux * rep; a.vy -= uy * rep; }
        if (!b.fixed) { b.vx += ux * rep; b.vy += uy * rep; }
      }
      // radial preference for people
      people.forEach(function (q) {
        var ex = q.x / G.ax, d = Math.sqrt(ex * ex + q.y * q.y) || 1, f = (d - q.target) * (G.wall ? 0.006 : 0.02) * alpha;
        q.vx -= ex / d * f * G.ax; q.vy -= q.y / d * f;
      });
      // gentle pull to the centre keeps it compact
      nodes.forEach(function (n) {
        if (n.fixed) return;
        n.vx -= n.x * 0.004 * alpha / (G.ax * G.ax); n.vy -= n.y * G.yPull * alpha;
        n.x += n.vx; n.y += n.vy; n.vx *= 0.55; n.vy *= 0.55;
        if (G.wall) { var lim = G.wall - (n.type === "person" ? G.pr + 6 : 14); if (n.x > lim) { n.x = lim; n.vx = 0; } if (n.x < -lim) { n.x = -lim; n.vx = 0; } }
      });
    }
    // squash slightly to the container's aspect ratio
    nodes.forEach(function (n) { n.x *= G.sx; n.bx = n.x; n.by = n.y; n.ph = (hash(n.name || n.title || "me") % 1000) / 1000 * TAU; });
    // place each name (below / above / left / right of the photo) where it
    // collides least with photos, paper dots, other names and lines
    people.forEach(function (q) { q.labelPos = "down"; });
    if (G.labels) {
      var ov = function (a, b) { return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]; };
      var labelRect = function (q, pos) {
        var w = Math.max.apply(null, splitName(q.name).map(function (t) { return t.length; })) * 7.6 * G.fs + 10, h = 40 * G.fs, r = G.pr;
        if (pos === "up") return [q.x - w / 2, q.y - r - h - 6, q.x + w / 2, q.y - r - 6];
        if (pos === "left") return [q.x - r - 12 - w, q.y - h / 2, q.x - r - 8, q.y + h / 2];
        if (pos === "right") return [q.x + r + 8, q.y - h / 2, q.x + r + 12 + w, q.y + h / 2];
        return [q.x - w / 2, q.y + r + 4, q.x + w / 2, q.y + r + h + 6];
      };
      var discs = people.map(function (q) { return [q.x - G.pr - 5, q.y - G.pr - 5, q.x + G.pr + 5, q.y + G.pr + 5]; })
        .concat(papers.map(function (p) { return [p.x - G.dot - 8, p.y - G.dot - 8, p.x + G.dot + 8, p.y + G.dot + 8]; }))
        .concat([[-G.cr - 8, -G.cr - 8, G.cr + 8, G.cr + 8]]);
      // sample points along every edge (same curves as drawn)
      var samples = [];
      var sampleCurve = function (a, b, bend) {
        var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, cx = mx - dy * bend, cy = my + dx * bend;
        for (var t = 0.02; t < 1; t += 0.02) { var u = 1 - t; samples.push([u * u * a.x + 2 * u * t * cx + t * t * b.x, u * u * a.y + 2 * u * t * cy + t * t * b.y]); }
      };
      papers.forEach(function (p, k) { sampleCurve(me, p, ((k % 2) ? 1 : -1) * 0.08); });
      people.forEach(function (q) { q.papers.forEach(function (pi) { sampleCurve(papers[pi], q, ((hash(q.name + pi) & 1) ? 1 : -1) * (0.12 + ((hash(q.name) >>> 3) % 10) / 100)); }); });
      var rects = [], bias = { down: 0, up: 0.5, left: 3, right: 3 };
      var cost = function (r, pos) {
        var c = bias[pos], m = 4, rr = [r[0] - m, r[1] - m, r[2] + m, r[3] + m];
        discs.forEach(function (o) { if (ov(rr, o)) c += 100; });
        rects.forEach(function (o) { if (ov(rr, o)) c += 100; });
        samples.forEach(function (pt) { if (pt[0] > rr[0] && pt[0] < rr[2] && pt[1] > rr[1] && pt[1] < rr[3]) c += 1; });
        return c;
      };
      people.concat([me]).sort(function (a, b) { return a.y - b.y; }).forEach(function (q) {
        var best = null;
        (G.narrow ? ["down", "up"] : ["down", "up", "left", "right"]).forEach(function (pos) {
          var r = labelRect(q, pos), c = cost(r, pos);
          if (!best || c < best.c) best = { c: c, pos: pos, r: r };
        });
        q.labelPos = best.pos; q.labelBox = best.r; rects.push(best.r);
      });
    }
    // bounding box (with labels above or below photos)
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    nodes.forEach(function (n) {
      var r = n.type === "me" ? G.cr + 12 : (n.type === "paper" ? G.dot + 14 : G.pr + 6);
      minX = Math.min(minX, n.x - r); maxX = Math.max(maxX, n.x + r);
      minY = Math.min(minY, n.y - r); maxY = Math.max(maxY, n.y + r);
      if (n.labelBox) { var lb = n.labelBox; minX = Math.min(minX, lb[0]); maxX = Math.max(maxX, lb[2]); minY = Math.min(minY, lb[1]); maxY = Math.max(maxY, lb[3]); }
    });
    var pad = 6;
    return [minX - pad, minY - pad, maxX - minX + 2 * pad, maxY - minY + 2 * pad];
  }

  /* ---------------- drawing ---------------- */
  var svg, geo = null, current = null, edges = [], meEdges = [];

  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function splitName(n) {
    var w = n.split(" ");
    if (w.length < 2) return [n, ""];
    var cut = w.length - 1;
    if (cut > 1 && /^(del|de|di|da|van|von|la|le)$/i.test(w[cut - 1])) cut--;
    return [w.slice(0, cut).join(" "), w.slice(cut).join(" ")];
  }
  function addLabel(g, q, r) {
    var G = geo, lines = splitName(q.name);
    var lp = q.labelPos, tx = 0, ty = r + 6 + 14 * G.fs, anchor = "middle";
    if (lp === "up") ty = -(r + 12 + 16 * G.fs);
    if (lp === "left") { tx = -(r + 10); ty = -3 * G.fs; anchor = "end"; }
    if (lp === "right") { tx = r + 10; ty = -3 * G.fs; anchor = "start"; }
    var t = el("text", { x: tx, y: ty, "text-anchor": anchor, class: "net-name" }, g);
    el("tspan", { x: tx, dy: 0 }, t).textContent = lines[0];
    if (lines[1]) el("tspan", { x: tx, dy: 16 * G.fs, class: "net-surname" }, t).textContent = lines[1];
    var bb = t.getBBox();
    g.insertBefore(el("rect", { x: bb.x - 5, y: bb.y - 2, width: bb.width + 10, height: bb.height + 4, rx: 7, class: "net-name-bg" }), t);
  }

  function curve(a, b, bend) {
    var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y;
    var cx = mx - dy * bend, cy = my + dx * bend;
    return "M" + a.x.toFixed(1) + "," + a.y.toFixed(1) + " Q" + cx.toFixed(1) + "," + cy.toFixed(1) + " " + b.x.toFixed(1) + "," + b.y.toFixed(1);
  }

  function render() {
    var narrow = host.clientWidth < 640;
    var G = narrow
      ? { R1: 150, L: 160, pr: 40, cr: 40, dot: 10, labels: false, fs: 1, sx: 1.0, ax: 0.8, narrow: true, wall: 0, yPull: 0.004 }
      : { R1: 175, L: 185, pr: 34, cr: 34, dot: 8, labels: true, fs: 1, sx: 1.18, ax: 1, narrow: false, wall: 0, yPull: 0.004 };
    if (geo && geo.narrow === G.narrow && svg) return;
    geo = G;
    var vb = layout(G);
    G.vb = vb;
    if (svg) svg.remove();
    svg = el("svg", { viewBox: vb.map(function (v) { return v.toFixed(0); }).join(" "), class: "net-svg" + (G.narrow ? " net-mobile" : ""), "aria-hidden": "true" });
    host.insertBefore(svg, tip);
    fit();
    var defs = el("defs", {}, svg);
    var cp = el("clipPath", { id: "net-clip", clipPathUnits: "objectBoundingBox" }, defs);
    el("circle", { cx: ".5", cy: ".5", r: ".5" }, cp);

    var gE = el("g", { class: "net-edges" }, svg), gP = el("g", {}, svg), gN = el("g", {}, svg);
    edges = []; meEdges = [];

    // me → paper
    papers.forEach(function (p, k) {
      var gid = "g-me-" + k;
      var lg = el("linearGradient", { id: gid, gradientUnits: "userSpaceOnUse" }, defs);
      el("stop", { offset: "0%", class: "net-stop-me" }, lg);
      el("stop", { offset: "100%", class: "net-stop k-" + p.kind }, lg);
      var path = el("path", { class: "net-el net-edge net-edge-c", stroke: "url(#" + gid + ")" }, gE);
      var e = { a: me, b: p, path: path, grad: lg, bend: ((k % 2) ? 1 : -1) * 0.08 };
      p.edge = path; meEdges.push(e);
    });
    // paper → person
    people.forEach(function (q) {
      q.edges = q.papers.map(function (pi) {
        var p = papers[pi], gid = "g-" + pi + "-" + hash(q.name);
        var lg = el("linearGradient", { id: gid, gradientUnits: "userSpaceOnUse" }, defs);
        el("stop", { offset: "0%", class: "net-stop k-" + p.kind }, lg);
        el("stop", { offset: "100%", class: "net-stop-end" }, lg);
        var path = el("path", { class: "net-el net-edge net-edge-p", stroke: "url(#" + gid + ")" }, gE);
        path._paper = pi;
        var bend = ((hash(q.name + pi) & 1) ? 1 : -1) * (0.12 + ((hash(q.name) >>> 3) % 10) / 100);
        edges.push({ a: p, b: q, path: path, grad: lg, bend: bend });
        return path;
      });
    });

    // papers
    papers.forEach(function (p) {
      var g = el("g", { class: "net-el net-node net-paper k-" + p.kind, tabindex: "0" }, gP);
      el("circle", { r: G.dot + 12, class: "net-hit" }, g);
      el("circle", { r: G.dot + 3.5, class: "net-pring" }, g);
      el("circle", { r: G.dot - 1.5, class: "net-dot" }, g);
      p.node = g; bind(g, p);
    });

    // people
    people.forEach(function (q) {
      var g = el("g", { class: "net-el net-node net-person", tabindex: "0" }, gN);
      var r = G.pr;
      el("circle", { r: r + 3.5, class: "net-ring" }, g);
      if (q.meta.photo) {
        el("image", { href: q.meta.photo, x: -r, y: -r, width: 2 * r, height: 2 * r, "clip-path": "url(#net-clip)", preserveAspectRatio: "xMidYMid slice" }, g);
      } else {
        el("circle", { r: r, class: "net-anon-bg" }, g);
        el("circle", { cx: 0, cy: -r * 0.22, r: r * 0.34, class: "net-anon" }, g);
        el("path", { d: "M" + (-r * 0.62) + "," + (r * 0.72) + " a" + (r * 0.62) + "," + (r * 0.55) + " 0 0 1 " + (r * 1.24) + ",0 z", class: "net-anon" }, g);
      }
      if (G.labels) addLabel(g, q, r);
      q.node = g; bind(g, q);
    });

    // me
    var mg = el("g", { class: "net-el net-node net-me" }, gN);
    el("circle", { r: G.cr + 3.5, class: "net-ring" }, mg);
    el("image", { href: "images/people/dario-bocchi.jpg", x: -G.cr, y: -G.cr, width: 2 * G.cr, height: 2 * G.cr, "clip-path": "url(#net-clip)", preserveAspectRatio: "xMidYMid slice" }, mg);
    if (G.labels) addLabel(mg, me, G.cr);
    me.node = mg;

    place(0);
    if (!reduceMotion) { animateIn(); startDrift(); }
  }

  // position nodes and edges for time t (gentle drift around the layout)
  function place(t) {
    var amp = reduceMotion ? 0 : 3.2;
    papers.concat(people).forEach(function (n) {
      n.x = n.bx + amp * Math.sin(t * 0.00045 + n.ph);
      n.y = n.by + amp * Math.cos(t * 0.00038 + n.ph * 1.3);
      n.node.setAttribute("transform", "translate(" + n.x.toFixed(2) + "," + n.y.toFixed(2) + ")");
    });
    me.node.setAttribute("transform", "translate(0,0)");
    meEdges.concat(edges).forEach(function (e) {
      e.path.setAttribute("d", curve(e.a, e.b, e.bend));
      e.grad.setAttribute("x1", e.a.x.toFixed(1)); e.grad.setAttribute("y1", e.a.y.toFixed(1));
      e.grad.setAttribute("x2", e.b.x.toFixed(1)); e.grad.setAttribute("y2", e.b.y.toFixed(1));
    });
  }

  var raf = null, visible = true;
  function startDrift() {
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; if (visible) loop(); }).observe(host);
    }
    loop();
  }
  function loop() {
    if (raf) return;
    raf = requestAnimationFrame(function step(t) {
      raf = null;
      if (!visible || document.hidden) return;
      place(t);
      raf = requestAnimationFrame(step);
    });
  }
  document.addEventListener("visibilitychange", function () { if (!document.hidden && !reduceMotion) loop(); });

  function animateIn() {
    svg.classList.add("net-pre");
    var all = svg.querySelectorAll(".net-edge");
    all.forEach(function (e) { var len = e.getTotalLength(); e.style.strokeDasharray = len; e.style.strokeDashoffset = len; });
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        svg.classList.remove("net-pre");
        svg.querySelectorAll(".net-edge-c").forEach(function (e, i) { e.style.transition = "stroke-dashoffset .8s ease " + (i * 70) + "ms"; e.style.strokeDashoffset = 0; });
        svg.querySelectorAll(".net-edge-p").forEach(function (e, i) { e.style.transition = "stroke-dashoffset 1.2s ease " + (550 + i * 22) + "ms"; e.style.strokeDashoffset = 0; });
        svg.querySelectorAll(".net-paper").forEach(function (n, i) { n.style.transitionDelay = (250 + i * 70) + "ms"; });
        svg.querySelectorAll(".net-person").forEach(function (n, i) { n.style.transitionDelay = (900 + i * 40) + "ms"; });
        setTimeout(function () {
          svg.querySelectorAll(".net-edge").forEach(function (e) { e.style.strokeDasharray = ""; e.style.strokeDashoffset = ""; e.style.transition = ""; });
          svg.querySelectorAll(".net-node").forEach(function (n) { n.style.transitionDelay = ""; });
        }, 3300);
      });
    });
  }

  /* ---------------- interaction ---------------- */
  function focusOn(node) {
    current = node;
    host.classList.add("focus");
    svg.querySelectorAll(".on").forEach(function (e) { e.classList.remove("on"); });
    var mark = function (e) { if (e) e.classList.add("on"); };
    if (node.type === "person") {
      mark(node.node); node.edges.forEach(mark);
      node.papers.forEach(function (pi) { mark(papers[pi].node); mark(papers[pi].edge); });
      showTip("<strong>" + esc(node.name) + "</strong>", node);
    } else {
      mark(node.node); mark(node.edge);
      node.authors.forEach(function (a) {
        var q = byName[a]; mark(q.node);
        q.edges.forEach(function (e) { if (e._paper === node.i) mark(e); });
      });
      showTip("<strong>" + esc(node.title) + "</strong><span>" + esc(node.venue) + (node.badge ? " · " + esc(node.badge) : "") + " · " + node.year + "</span>", node);
    }
    mark(me.node);
  }
  function clearFocus() {
    current = null;
    host.classList.remove("focus");
    svg.querySelectorAll(".on").forEach(function (e) { e.classList.remove("on"); });
    tip.classList.remove("show");
  }
  function showTip(html, node) {
    tip.innerHTML = html;
    var box = svg.getBoundingClientRect(), hb = host.getBoundingClientRect(), vb = geo.vb;
    var s = box.width / vb[2];
    var x = (node.bx - vb[0]) * s + (box.left - hb.left), y = (node.by - vb[1]) * s + (box.top - hb.top);
    tip.classList.add("show");
    var tw = tip.offsetWidth, th = tip.offsetHeight, rr = (node.type === "person" ? geo.pr : geo.dot + 4) * s;
    tip.style.left = Math.min(Math.max(8, x - tw / 2), hb.width - tw - 8) + "px";
    var labelBelow = node.type === "person" && geo.labels && node.labelPos === "down", labelAbove = node.type === "person" && geo.labels && node.labelPos === "up";
    var up = labelBelow ? true : (labelAbove ? false : node.by > 0);
    tip.style.top = (up ? y - th - rr - 12 : y + rr + 14) + "px";
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function open(node) {
    var url = node.type === "person" ? node.meta.url : node.url;
    if (url) window.open(url, "_blank", "noopener");
  }
  var lastPointer = "mouse";
  function bind(g, node) {
    g.addEventListener("pointerdown", function (e) { lastPointer = e.pointerType; });
    g.addEventListener("pointerenter", function (e) { if (e.pointerType === "mouse") focusOn(node); });
    g.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") clearFocus(); });
    g.addEventListener("click", function (e) {
      e.stopPropagation();
      if (lastPointer !== "mouse" && current !== node) { focusOn(node); return; } // touch: first tap highlights
      open(node);
    });
    g.addEventListener("focus", function () { focusOn(node); });
    g.addEventListener("blur", clearFocus);
    g.addEventListener("keydown", function (e) { if (e.key === "Enter") open(node); });
  }
  host.addEventListener("click", function () { if (current) clearFocus(); });

  render();
  var rt;
  // desktop: scale the graph so it fits in the window below its title
  function fit() {
    if (!svg || !geo) return;
    if (geo.narrow) { svg.style.width = ""; return; }
    // the graph itself (not the title above it) should fit one screen below the navbar
    var nav = document.querySelector("#quarto-header");
    var avail = Math.max(480, window.innerHeight - (nav ? nav.offsetHeight : 66) - 16);
    var w = Math.min(host.clientWidth, avail * geo.vb[2] / geo.vb[3]);
    svg.style.width = Math.round(w) + "px";
    svg.style.margin = "0 auto";
  }
  window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { render(); fit(); }, 150); });

  // text alternative for screen readers
  var list = document.createElement("ul");
  list.className = "visually-hidden";
  people.slice().sort(function (a, b) { return b.papers.length - a.papers.length; }).forEach(function (p) {
    var li = document.createElement("li");
    li.textContent = p.name + ": " + p.papers.map(function (pi) { return papers[pi].title; }).join("; ");
    list.appendChild(li);
  });
  host.appendChild(list);
})();
