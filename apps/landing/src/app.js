/* Basera landing page — interactions */
(function () {
  "use strict";

  // ---------- year ----------
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ---------- nav: shadow on scroll ----------
  var nav = document.getElementById("nav");
  function onScroll() {
    if (!nav) return;
    nav.classList.toggle("scrolled", window.scrollY > 8);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // ---------- mobile drawer ----------
  var drawer = document.getElementById("drawer");
  var toggle = document.getElementById("navToggle");
  var closeBtn = document.getElementById("drawerClose");

  function openDrawer() {
    if (!drawer) return;
    drawer.classList.add("open");
    if (toggle) toggle.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  }
  function closeDrawer() {
    if (!drawer) return;
    drawer.classList.remove("open");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }
  if (toggle) toggle.addEventListener("click", openDrawer);
  if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
  if (drawer) {
    drawer.addEventListener("click", function (e) {
      if (e.target === drawer) closeDrawer();
    });
    drawer.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", closeDrawer);
    });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeDrawer();
  });

  // ---------- cost calculator ----------
  var slider = document.getElementById("calcSlider");
  var resOut = document.getElementById("calcResidents");
  var costOut = document.getElementById("calcCost");
  var perDayOut = document.getElementById("calcPerDay");
  var RATE = 10; // ₹ per occupied bed / month

  function fmt(n) {
    return n.toLocaleString("en-IN");
  }
  function updateCalc() {
    if (!slider) return;
    var residents = parseInt(slider.value, 10);
    var monthly = residents * RATE;
    var perDay = Math.round(monthly / 30);
    if (resOut) resOut.textContent = fmt(residents);
    if (costOut) costOut.textContent = fmt(monthly);
    if (perDayOut) perDayOut.textContent = "₹" + fmt(perDay);
    slider.setAttribute("aria-valuenow", String(residents));
    slider.setAttribute("aria-valuetext", fmt(residents) + " residents, ₹" + fmt(monthly) + " per month");
    // fill the track
    var pct = ((residents - slider.min) / (slider.max - slider.min)) * 100;
    slider.style.setProperty("--fill", pct + "%");
  }
  if (slider) {
    slider.addEventListener("input", updateCalc);
    updateCalc();
  }

  // ---------- reveal on scroll ----------
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && reveals.length) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            en.target.classList.add("in");
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    reveals.forEach(function (el) { io.observe(el); });
    // failsafe: reveal everything after a moment in case the observer never fires
    setTimeout(function () {
      reveals.forEach(function (el) { el.classList.add("in"); });
    }, 1600);
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }
})();
