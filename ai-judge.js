// Sends the final squads to the judgeSquads Cloud Function (which holds the
// Anthropic API key server-side) and renders the verdict on the results screen.

function wireAiJudge(gameKey, players) {
  const btn = document.getElementById("ai-judge-btn");
  const resultEl = document.getElementById("ai-judge-result");
  if (!btn || !resultEl) return;

  // Swap in a fresh button so a previous game's click listener can't fire twice.
  const freshBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(freshBtn, btn);

  freshBtn.disabled = false;
  freshBtn.classList.remove("hidden");
  freshBtn.textContent = "🤖 Ask the AI Who Won";
  resultEl.classList.add("hidden");
  resultEl.innerHTML = "";

  freshBtn.addEventListener("click", async () => {
    freshBtn.disabled = true;
    freshBtn.textContent = "Judging…";
    try {
      const resp = await fetch(AI_JUDGE_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          gameKey,
          players: players.map((p) => ({ name: p.name, spent: p.spent, roster: p.roster })),
        }),
      });
      const data = await resp.json();

      if (data.winner) {
        resultEl.innerHTML =
          `<div style="font-family:'Space Grotesk',sans-serif; font-weight:700; font-size:18px; color:#f0b429; margin-bottom:6px;">🏆 ${data.winner}</div>` +
          `<div style="color:#c9c4dd; font-size:14px; line-height:1.5;">${data.reason || ""}</div>`;
      } else {
        resultEl.innerHTML = `<div style="color:#9a94b8;">${data.reason || "The AI couldn't decide — call it a draw."}</div>`;
      }
      resultEl.classList.remove("hidden");
      freshBtn.classList.add("hidden");
    } catch (e) {
      freshBtn.disabled = false;
      freshBtn.textContent = "🤖 Ask the AI Who Won";
      resultEl.textContent = "Couldn't reach the AI judge — check your connection and try again.";
      resultEl.classList.remove("hidden");
    }
  });
}
