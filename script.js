const categories = document.querySelectorAll(".category-header");

categories.forEach((header) => {
  header.addEventListener("click", () => {
    const category = header.parentElement;

    category.classList.toggle("open");
  });
});

document.querySelector(".play").addEventListener("click", () => {
  window.location.href = "join.html";
});

document.querySelector(".secondary").addEventListener("click", () => {
  window.location.href = "create.html";
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

    const label = topCategory.querySelector(".category-header span").textContent.trim();
    const name = label.replace(/^\S+\s*/, "");
    const target = categoryToCreateKey[name];

    window.location.href = target ? `create.html?category=${target}` : "create.html";
  });
});
