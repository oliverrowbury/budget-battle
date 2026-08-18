const categories = document.querySelectorAll(".category-header");

categories.forEach((header) => {
  header.addEventListener("click", () => {
    const category = header.parentElement;

    category.classList.toggle("open");
  });
});
