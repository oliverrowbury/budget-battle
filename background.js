// Shared animated background: drifting color blobs, a fading grid, and
// rising glowing particles. Injected via JS so every page gets the exact
// same markup/behavior without duplicating it in each HTML file.

(function () {
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initBackgroundFx);
  } else {
    initBackgroundFx();
  }
})();
