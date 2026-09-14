/* Page interactions: reveal on scroll, scroll progress, active nav link,
   and a 3D tilt on project cards for mouse users. */
(function () {
  "use strict";
  document.documentElement.classList.remove("no-js");
  var reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* Reveal by scroll position rather than IntersectionObserver: anything whose
     top has come into view, or that an anchor jump already scrolled past, is
     shown. Content can never be left invisible by a missed observer callback. */
  var pending = Array.prototype.slice.call(document.querySelectorAll(".reveal:not(.in)"));
  if (reduce) { pending.forEach(function (el) { el.classList.add("in"); }); pending = []; }
  function reveal() {
    if (!pending.length) return;
    /* At the very bottom nothing can scroll further up, so show whatever is left. */
    var atBottom = scrollY + innerHeight >= document.documentElement.scrollHeight - 4;
    var limit = atBottom ? Infinity : innerHeight * 0.92;
    pending = pending.filter(function (el) {
      if (el.getBoundingClientRect().top < limit) { el.classList.add("in"); return false; }
      return true;
    });
  }

  var bar = document.querySelector(".progress");
  var links = Array.prototype.slice.call(document.querySelectorAll("nav a.link[href^='#']"));
  var sections = links.map(function (a) { return document.querySelector(a.getAttribute("href")); });
  var queued = false;
  function update() {
    queued = false;
    reveal();
    var max = document.documentElement.scrollHeight - innerHeight;
    if (bar) bar.style.transform = "scaleX(" + (max > 0 ? Math.min(1, scrollY / max) : 0) + ")";
    var current = -1;
    sections.forEach(function (s, i) { if (s && s.getBoundingClientRect().top < innerHeight * 0.35) current = i; });
    links.forEach(function (a, i) {
      a.classList.toggle("active", i === current);
      if (i === current) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
    });
  }
  addEventListener("scroll", function () { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener("resize", update);
  update();

  if (finePointer && !reduce) {
    document.querySelectorAll(".card").forEach(function (card) {
      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        card.style.setProperty("--mx", (x * 100).toFixed(1) + "%");
        card.style.setProperty("--my", (y * 100).toFixed(1) + "%");
        card.style.transform = "perspective(900px) rotateX(" + ((0.5 - y) * 8).toFixed(2) + "deg) rotateY(" + ((x - 0.5) * 10).toFixed(2) + "deg)";
      });
      card.addEventListener("pointerleave", function () { card.style.transform = ""; });
    });
  }

  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
