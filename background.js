// Shared animated background: drifting color blobs, a fading grid, and
// rising glowing particles. Injected via JS so every page gets the exact
// same markup/behavior without duplicating it in each HTML file.

(function () {
  // Set synchronously, before the rest of the page has even parsed, so
  // there's no flash of fully-opaque content before the fade-in below.
  if (document.body) document.body.style.opacity = "0";

  function initBackgroundFx() {
    const fx = document.createElement("div");
    fx.className = "bg-fx";
    fx.innerHTML =
      '<div class="bg-blob bg-blob-a"></div>' +
      '<div class="bg-blob bg-blob-b"></div>' +
      '<div class="bg-blob bg-blob-c"></div>' +
      '<div class="bg-grid"></div>' +
      '<div class="bg-particles"></div>';
    document.body.prepend(fx);

    const particles = fx.querySelector(".bg-particles");
    const count = 28;
    for (let i = 0; i < count; i++) {
      const p = document.createElement("span");
      p.className = "bg-particle";
      const size = 2 + Math.random() * 3;
      const duration = 12 + Math.random() * 16;
      const delay = -Math.random() * duration;
      const drift = Math.round(Math.random() * 70 - 35);
      p.style.left = (Math.random() * 100).toFixed(1) + "%";
      p.style.width = size + "px";
      p.style.height = size + "px";
      p.style.animationDuration = duration.toFixed(1) + "s";
      p.style.animationDelay = delay.toFixed(1) + "s";
      p.style.setProperty("--drift", drift + "px");
      if (i % 5 === 0) p.classList.add("bg-particle-accent");
      particles.appendChild(p);
    }
  }

  // This is a plain multi-page site (each screen is a real navigation, no
  // SPA router), so without this every click is a hard, jarring cut to a
  // blank page while the next one loads. Fades the current page out before
  // navigating and the new one in on arrival, so it reads as one flow
  // instead of a stack of separate pages.
  function initPageTransitions() {
    // Double rAF: the first guarantees the opacity:0 set above has actually
    // been painted at least once before we animate away from it - setting
    // both in the same tick can get coalesced into a no-op transition.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.body.style.opacity = "1";
      });
    });

    function leaveThenGo(url) {
      document.body.style.opacity = "0";
      setTimeout(() => { window.location.href = url; }, 180);
    }

    window.bidoffNavigate = leaveThenGo;

    document.addEventListener("click", (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target.closest("a[href]");
      if (!link || link.target === "_blank") return;
      const href = link.getAttribute("href");
      if (!href || href.startsWith("#") || /^([a-z]+:)?\/\//i.test(href)) return;
      e.preventDefault();
      leaveThenGo(href);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => { initBackgroundFx(); initPageTransitions(); });
  } else {
    initBackgroundFx();
    initPageTransitions();
  }
})();
