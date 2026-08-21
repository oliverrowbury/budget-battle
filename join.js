const codeInput = document.getElementById("code");
const joinButton = document.querySelector(".join");
const errorEl = document.getElementById("join-error");

codeInput.addEventListener("input", () => {
  codeInput.value = codeInput.value.toUpperCase();
  errorEl.classList.add("hidden");
  joinButton.disabled = codeInput.value.trim().length < 4;
});

joinButton.addEventListener("click", async () => {
  if (joinButton.disabled) return;
  const code = codeInput.value.trim().toUpperCase();

  joinButton.disabled = true;
  joinButton.textContent = "JOINING…";
  errorEl.classList.add("hidden");

  try {
    await joinRoom(code);
    window.location.href = `play.html?room=${code}`;
  } catch (e) {
    joinButton.disabled = false;
    joinButton.textContent = "JOIN BIDOFF →";
    const messages = {
      NOT_FOUND: "No game found with that code — double check it and try again.",
      FULL: "That game's already full.",
      ALREADY_STARTED: "That game has already started.",
    };
    errorEl.textContent = messages[e.message] || "Couldn't join — check your connection and try again.";
    errorEl.classList.remove("hidden");
  }
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
    btn.className = "option category-button";
    btn.innerHTML = `<span class="icon-badge">${def.icon}</span><span>${catName}</span>`;
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

// ---------- Find a public game ----------
const publicCategoryChips = document.getElementById("public-category-chips");
const publicGamesList = document.getElementById("public-games-list");
let selectedPublicCategory = "All";
let latestPublicRooms = [];

function poolLabelPublic(key) {
  return key.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\s*/u, "");
}

function buildPublicCategoryChips() {
  const names = ["All", ...Object.keys(bidoffCategories)];
  names.forEach((catName) => {
    const chip = document.createElement("button");
    chip.className = "chip" + (catName === "All" ? " selected" : "");
    chip.textContent = catName === "All" ? "All" : `${bidoffCategories[catName].icon} ${catName}`;
    chip.addEventListener("click", () => {
      selectedPublicCategory = catName;
      publicCategoryChips.querySelectorAll(".chip").forEach((c) => c.classList.remove("selected"));
      chip.classList.add("selected");
      renderPublicGames();
    });
    publicCategoryChips.appendChild(chip);
  });
}

async function joinPublicRoom(code, btnEl) {
  btnEl.disabled = true;
  btnEl.textContent = "JOINING…";
  try {
    await joinRoom(code);
    window.location.href = `play.html?room=${code}`;
  } catch (e) {
    btnEl.disabled = false;
    btnEl.textContent = "JOIN";
    alert("Couldn't join that game — it may have just filled up or started.");
  }
}

function renderPublicGames() {
  const rooms = latestPublicRooms
    .filter((r) => selectedPublicCategory === "All" || r.category === selectedPublicCategory)
    .sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0))
    .slice(0, 30);

  publicGamesList.innerHTML = "";

  if (!rooms.length) {
    publicGamesList.innerHTML = `<div class="public-games-empty">No public games right now — create one and it'll show up here for others.</div>`;
    return;
  }

  rooms.forEach((r) => {
    const row = document.createElement("div");
    row.className = "public-game-row";

    const waiting = r.status === "lobby" && r.players.length < r.numPlayers;
    const badgeHtml = waiting
      ? `<span class="status-badge waiting">Waiting for player</span>`
      : `<span class="status-badge live">Live</span>`;

    const info = document.createElement("div");
    info.className = "public-game-info";
    info.innerHTML =
      `<div class="public-game-name">${poolLabelPublic(r.gameKey)}</div>` +
      `<div class="public-game-meta">${badgeHtml}<span>${r.players.length}/${r.numPlayers} players</span></div>`;
    row.appendChild(info);

    const btn = document.createElement("button");
    btn.className = "join-row-btn";
    if (waiting) {
      btn.textContent = "JOIN";
      btn.addEventListener("click", () => joinPublicRoom(r.code, btn));
    } else {
      btn.textContent = "IN PROGRESS";
      btn.disabled = true;
    }
    row.appendChild(btn);

    publicGamesList.appendChild(row);
  });
}

function watchPublicGames() {
  db.collection("rooms")
    .where("isPublic", "==", true)
    .where("status", "in", ["lobby", "playing"])
    .onSnapshot(
      (snap) => {
        latestPublicRooms = snap.docs.map((doc) => {
          const data = doc.data();
          return {
            code: doc.id,
            gameKey: data.gameKey,
            category: data.category,
            status: data.status,
            players: data.players || [],
            numPlayers: data.numPlayers,
            updatedAtMs: data.updatedAt && data.updatedAt.toMillis ? data.updatedAt.toMillis() : 0,
          };
        });
        renderPublicGames();
      },
      () => {
        publicGamesList.innerHTML = `<div class="public-games-empty">Couldn't load public games — check your connection.</div>`;
      }
    );
}

buildPublicCategoryChips();
watchPublicGames();
