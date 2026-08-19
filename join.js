const codeInput = document.getElementById("code");
const joinButton = document.querySelector(".join");

codeInput.addEventListener("input", () => {
  codeInput.value = codeInput.value.toUpperCase();
  joinButton.disabled = codeInput.value.trim().length < 4;
});
