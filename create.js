const startButton = document.querySelector(".start");
const categoryOptions = document.querySelector(".category-options");
const gamePanelsContainer = document.querySelector(".game-panels");

let selectedCategory = null;
let selectedGameKey = null;

function poolLabel(key) {
  return key.replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\s*/u, "");
}

function buildCategoryButtons() {
  Object.keys(bidoffCategories).forEach((catName) => {
    const def = bidoffCategories[catName];
    const btn = document.createElement("button");
    btn.className = "option category-button";
    btn.dataset.category = catName;
    btn.textContent = `${def.icon} ${catName}`;
    btn.addEventListener("click", () => selectCategory(catName));
    categoryOptions.appendChild(btn);
  });
}

function buildGamePanels() {
  Object.keys(bidoffCategories).forEach((catName) => {
    const def = bidoffCategories[catName];
    const panel = document.createElement("div");
    panel.className = "game-options";
    panel.id = `panel-${catName.replace(/[^a-z0-9]/gi, "-")}`;

    if (def.subcategories) {
      const title = document.createElement("div");
      title.className = "section-title";
      title.textContent = `Choose your ${catName} BidOff`;
      panel.appendChild(title);

      const subOptions = document.createElement("div");
      subOptions.className = "options sub-options";
      Object.keys(def.subcategories).forEach((subName) => {
        const subBtn = document.createElement("button");
        subBtn.className = "option sub-category-button";
        subBtn.dataset.sub = subName;
        subBtn.textContent = subName;
        subBtn.addEventListener("click", () => selectSubcategory(catName, subName));
        subOptions.appendChild(subBtn);
      });
      panel.appendChild(subOptions);

      const select = document.createElement("select");
      select.className = "game-select";
      select.style.display = "none";
      select.addEventListener("change", () => selectGame(select.value));
      panel.appendChild(select);
    } else {
      const title = document.createElement("div");
      title.className = "section-title";
      title.textContent = `Choose your ${catName} BidOff`;
      panel.appendChild(title);

      const select = document.createElement("select");
      select.className = "game-select";
      def.games.forEach((key) => {
        const opt = document.createElement("option");
        opt.value = key;
        opt.textContent = poolLabel(key);
        select.appendChild(opt);
      });
      select.addEventListener("change", () => selectGame(select.value));
      panel.appendChild(select);
    }

    gamePanelsContainer.appendChild(panel);
  });
}

function selectCategory(catName) {
  selectedCategory = catName;
  selectedGameKey = null;

  document.querySelectorAll(".category-button").forEach((b) => {
    b.classList.toggle("selected", b.dataset.category === catName);
  });

  document.querySelectorAll(".game-options").forEach((panel) => panel.classList.remove("visible"));
  document.querySelectorAll(".sub-category-button").forEach((b) => b.classList.remove("selected"));
  document.querySelectorAll(".game-select").forEach((s) => {
    s.style.display = "none";
    s.selectedIndex = -1;
  });

  const panel = document.getElementById(`panel-${catName.replace(/[^a-z0-9]/gi, "-")}`);
  panel.classList.add("visible");

  const def = bidoffCategories[catName];
  if (!def.subcategories) {
    const select = panel.querySelector(".game-select");
    select.style.display = "block";
    select.selectedIndex = 0;
    selectedGameKey = select.value;
  }

  updateStartButton();
}

function selectSubcategory(catName, subName) {
  const panel = document.getElementById(`panel-${catName.replace(/[^a-z0-9]/gi, "-")}`);
  panel.querySelectorAll(".sub-category-button").forEach((b) => {
    b.classList.toggle("selected", b.dataset.sub === subName);
  });

  const select = panel.querySelector(".game-select");
  select.innerHTML = "";
  bidoffCategories[catName].subcategories[subName].forEach((key) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = poolLabel(key);
    select.appendChild(opt);
  });
  select.style.display = "block";
  select.selectedIndex = 0;
  selectedGameKey = select.value;

  updateStartButton();
}

function selectGame(key) {
  selectedGameKey = key;
  updateStartButton();
}

document.querySelectorAll(".section .options .option").forEach((button) => {
  if (button.classList.contains("category-button")) return;
  button.addEventListener("click", () => {
    const group = button.closest(".options");
    group.querySelectorAll(".option").forEach((b) => b.classList.remove("selected"));
    button.classList.add("selected");
    updateStartButton();
  });
});

function updateStartButton() {
  const playersSelected = document.querySelector('.section[data-key="players"] .option.selected');
  const auctionSelected = document.querySelector('.section[data-key="auction"] .option.selected');
  const budgetSelected = document.querySelector('.section[data-key="budget"] .option.selected');
  const slotsSelected = document.querySelector('.section[data-key="slots"] .option.selected');

  const allSelected = selectedCategory && selectedGameKey && playersSelected && auctionSelected && budgetSelected && slotsSelected;
  startButton.disabled = !allSelected;
}

startButton.addEventListener("click", () => {
  if (startButton.disabled) return;

  const players = document.querySelector('.section[data-key="players"] .option.selected').dataset.value;
  const auction = document.querySelector('.section[data-key="auction"] .option.selected').dataset.value;
  const budget = document.querySelector('.section[data-key="budget"] .option.selected').dataset.value;
  const slots = document.querySelector('.section[data-key="slots"] .option.selected').dataset.value;

  const params = new URLSearchParams({
    game: selectedGameKey,
    players,
    auction,
    budget,
    slots,
  });

  window.location.href = `play.html?${params.toString()}`;
});

buildCategoryButtons();
buildGamePanels();
updateStartButton();

const preselectedKey = new URLSearchParams(window.location.search).get("category");
if (preselectedKey) {
  const categoryNameMap = {
    "sports-games": "Sports",
    "film-games": "Film & TV",
    "entertainment-games": "Music",
  };
  const catName = categoryNameMap[preselectedKey] || preselectedKey;
  const preselectedButton = document.querySelector(`.category-button[data-category="${catName}"]`);
  if (preselectedButton) preselectedButton.click();
}
