const codeInput = document.getElementById("code");
const joinButton = document.querySelector(".join");
const errorEl = document.getElementById("join-error");

codeInput.addEventListener("input", () => {
  codeInput.value = codeInput.value.toUpperCase();
  errorEl.classList.add("hidden");
  joinButton.disabled = codeInput.value.trim().length < 4;
});

joinButton.addEventListener("click", () => {
  const decoded = decodeGameCode(codeInput.value);
  if (!decoded) {
    errorEl.textContent = "That code doesn't look right — double check it and try again.";
    errorEl.classList.remove("hidden");
    return;
  }

  const params = new URLSearchParams({ code: codeInput.value.trim().toUpperCase() });
  window.location.href = `play.html?${params.toString()}`;
});

// ---------- Browse & play a random game ----------
const browseCategories = document.getElementById("browse-categories");
const browseSubcategories = document.getElementById("browse-subcategories");
const randomBtn = document.getElementById("random-btn");
let randomPool = null;

function buildBrowseCategories() {
  Object.keys(bidoffCategories).forEach((catName) => {
    const def = bidoffCategories[catName];
    const btn = document.createElement("button");
    btn.className = "option";
    btn.textContent = `${def.icon} ${catName}`;
    btn.addEventListener("click", () => selectBrowseCategory(catName, btn));
    browseCategories.appendChild(btn);
  });
}

function selectBrowseCategory(catName, btnEl) {
  browseCategories.querySelectorAll(".option").forEach((b) => b.classList.remove("selected"));
  btnEl.classList.add("selected");

  browseSubcategories.innerHTML = "";
  randomPool = null;
  randomBtn.classList.add("hidden");

  const def = bidoffCategories[catName];
  if (def.subcategories) {
    browseSubcategories.classList.remove("hidden");
    Object.keys(def.subcategories).forEach((subName) => {
      const subBtn = document.createElement("button");
      subBtn.className = "option sub-category-button";
      subBtn.textContent = subName;
      subBtn.addEventListener("click", () => {
        browseSubcategories.querySelectorAll(".option").forEach((b) => b.classList.remove("selected"));
        subBtn.classList.add("selected");
        randomPool = def.subcategories[subName];
        randomBtn.classList.remove("hidden");
      });
      browseSubcategories.appendChild(subBtn);
    });
  } else {
    browseSubcategories.classList.add("hidden");
    randomPool = def.games;
    randomBtn.classList.remove("hidden");
  }
}

randomBtn.addEventListener("click", () => {
  if (!randomPool || !randomPool.length) return;
  const gameKey = randomPool[Math.floor(Math.random() * randomPool.length)];
  const cfg = { game: gameKey, players: 2, auction: "open", budget: 20, slots: 5 };
  const code = encodeGameCode(cfg);
  const params = new URLSearchParams({
    game: cfg.game,
    players: cfg.players,
    auction: cfg.auction,
    budget: cfg.budget,
    slots: cfg.slots,
  });
  if (code) params.set("code", code);
  window.location.href = `play.html?${params.toString()}`;
});

buildBrowseCategories();
