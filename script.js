const categories = document.querySelectorAll(".category-header");

categories.forEach((header) => {
  header.addEventListener("click", () => {
    const category = header.parentElement;

    category.classList.toggle("open");
  });
});

function goTo(url) {
  if (typeof window.bidoffNavigate === "function") window.bidoffNavigate(url);
  else window.location.href = url;
}

document.querySelector(".play").addEventListener("click", () => {
  goTo("join.html");
});

document.querySelector(".secondary").addEventListener("click", () => {
  goTo("create.html");
});

const categoryToCreateKey = {
  "Sports": "sports-games",
  "Film & TV": "film-games",
  "Music": "entertainment-games",
};

document.querySelectorAll(".game").forEach((game) => {
  game.addEventListener("click", () => {
    let topCategory = game.closest(".category");
    while (topCategory.parentElement.closest(".category")) {
      topCategory = topCategory.parentElement.closest(".category");
    }

    const nameEl = topCategory.querySelector(".category-name");
    const name = nameEl
      ? nameEl.textContent.trim()
      : topCategory.querySelector(".category-header span").textContent.trim().replace(/^\S+\s*/, "");
    const target = categoryToCreateKey[name];

    goTo(target ? `create.html?category=${target}` : "create.html");
  });
});
