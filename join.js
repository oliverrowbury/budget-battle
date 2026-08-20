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
