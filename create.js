const startButton = document.querySelector(".start");

document.querySelectorAll(".option").forEach((button) => {
  button.addEventListener("click", () => {
    const group = button.closest(".options");
    group.querySelectorAll(".option").forEach((b) => b.classList.remove("selected"));
    button.classList.add("selected");

    if (button.classList.contains("category-button")) {
      document.querySelectorAll(".game-options").forEach((panel) => {
        panel.classList.remove("visible");
        panel.querySelectorAll(".option").forEach((o) => o.classList.remove("selected"));
      });

      const target = document.getElementById(button.dataset.target);
      if (target) target.classList.add("visible");
    }

    updateStartButton();
  });
});

function updateStartButton() {
  const allSelected = Array.from(document.querySelectorAll(".section")).every((section) => {
    if (section.querySelector(".category-button")) {
      const categorySelected = section.querySelector(".category-button.selected");
      const gameSelected = section.querySelector(".game-options.visible .option.selected");
      return categorySelected && gameSelected;
    }

    return section.querySelector(".option.selected");
  });

  startButton.disabled = !allSelected;
}

updateStartButton();
