const params = new URLSearchParams(window.location.search);
const roomCode = params.get("room");

let gameKey = params.get("game");
let numPlayers = parseInt(params.get("players"), 10);
let auctionType = params.get("auction");
let startingBudget = parseInt(params.get("budget"), 10);
let slotsParam = parseInt(params.get("slots"), 10);

const rawCode = params.get("code");
let gameCode = null;
if (rawCode && typeof decodeGameCode === "function") {
  const decoded = decodeGameCode(rawCode);
  if (decoded) {
    gameKey = decoded.game;
    numPlayers = decoded.players;
    auctionType = decoded.auction;
    startingBudget = decoded.budget;
    slotsParam = decoded.slots;
    gameCode = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  }
}

const errorView = document.getElementById("error-view");
const lobbyView = document.getElementById("lobby-view");
const gameView = document.getElementById("game-view");
const resultsView = document.getElementById("results-view");

function showError() {
  errorView.classList.remove("hidden");
  lobbyView.classList.add("hidden");
  gameView.classList.add("hidden");
}

if (roomCode) {
  runRoomGame(roomCode.trim().toUpperCase());
} else if (
  !gameKey || typeof gamePools === "undefined" || !gamePools[gameKey] ||
  !Number.isInteger(numPlayers) || numPlayers < 2 || numPlayers > 8 ||
  (auctionType !== "blind" && auctionType !== "open") ||
  !Number.isInteger(startingBudget) || startingBudget < 1 ||
  !Number.isInteger(slotsParam) || slotsParam < 1
) {
  showError();
} else {
  runGame();
}

function clone(obj) {
  return obj ? JSON.parse(JSON.stringify(obj)) : obj;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function runGame() {
  document.getElementById("game-title").textContent = gameKey;
  document.getElementById("game-subtitle").textContent =
    `${numPlayers} players · $${startingBudget} budget · ${auctionType === "blind" ? "Blind Bid" : "Open Bid"}`;
  lobbyView.classList.remove("hidden");

  if (!gameCode && typeof encodeGameCode === "function") {
    gameCode = encodeGameCode({ game: gameKey, players: numPlayers, auction: auctionType, budget: startingBudget, slots: slotsParam });
  }
  if (gameCode) {
    const badge = document.getElementById("code-badge");
    document.getElementById("code-value").textContent = gameCode;
    badge.classList.remove("hidden");
    document.getElementById("copy-code-btn").addEventListener("click", () => {
      const link = `${window.location.href.split("?")[0]}?code=${gameCode}`;
      const btn = document.getElementById("copy-code-btn");
      const done = () => {
        const original = "Copy invite link";
        btn.textContent = "Copied!";
        setTimeout(() => { btn.textContent = original; }, 1500);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(done).catch(done);
      } else {
        done();
      }
    });
  }

  const rawPool = gamePools[gameKey];
  const isPositional = typeof rawPool[0] === "object";
  const pool = rawPool.map((item) =>
    isPositional ? { name: item.name, position: item.position } : { name: item, position: null }
  );

  const slotRequirement = (typeof gameSlots !== "undefined" && gameSlots[gameKey]) || null;
  const caps = (typeof categoryCaps !== "undefined" && categoryCaps[gameKey]) || null;
  const totalSlotsPerPlayer = slotRequirement
    ? Object.values(slotRequirement).reduce((a, b) => a + b, 0)
    : slotsParam;

  const players = [];
  for (let i = 0; i < numPlayers; i++) {
    players.push({
      id: i,
      name: `Player ${i + 1}`,
      budget: startingBudget,
      roster: [],
      spent: 0,
      needs: clone(slotRequirement),
      capsRemaining: clone(caps),
    });
  }

  const auctionQueue = shuffle(pool);

  let turnPointer = 0;

  // One shared "skip" for the whole auction. If a skip offer is declined
  // (someone takes the item free instead of agreeing), the skip isn't used
  // up — it just becomes restricted to whoever took the free item.
  const skipState = { available: true, restrictedTo: null };

  function rotateStart(biddersArr) {
    let startIdx = biddersArr.findIndex((p) => p.id >= turnPointer);
    if (startIdx === -1) startIdx = 0;
    return biddersArr.slice(startIdx).concat(biddersArr.slice(0, startIdx));
  }

  function rosterFull(p) {
    return p.roster.length >= totalSlotsPerPlayer;
  }

  function eligible(p, item) {
    if (p.budget < 1) return false;
    if (rosterFull(p)) return false;
    if (item.position && p.needs) {
      if (!(item.position in p.needs) || p.needs[item.position] <= 0) return false;
    }
    if (item.position && p.capsRemaining && item.position in p.capsRemaining) {
      if (p.capsRemaining[item.position] <= 0) return false;
    }
    return true;
  }

  function awardItem(item, winner, price) {
    winner.budget -= price;
    winner.spent += price;
    winner.roster.push({ name: item.name, position: item.position, price });
    if (item.position && winner.needs && item.position in winner.needs) {
      winner.needs[item.position]--;
    }
    if (item.position && winner.capsRemaining && item.position in winner.capsRemaining) {
      winner.capsRemaining[item.position]--;
    }
  }

  function logLine(html) {
    const log = document.getElementById("log");
    const div = document.createElement("div");
    div.innerHTML = html;
    log.prepend(div);
  }

  function renderScoreboard(activePlayerId) {
    const board = document.getElementById("scoreboard");
    board.innerHTML = "";
    players.forEach((p) => {
      const chip = document.createElement("div");
      chip.className = "player-chip" + (p.id === activePlayerId ? " active" : "");
      chip.innerHTML = `
        <div class="name">${p.name}</div>
        <div class="budget">$${p.budget}</div>
        <div class="roster-count">${p.roster.length}/${totalSlotsPerPlayer} picked</div>
      `;
      board.appendChild(chip);
    });
  }

  function renderRosters() {
    const el = document.getElementById("rosters");
    el.innerHTML = "";
    players.forEach((p) => {
      const card = document.createElement("div");
      card.className = "roster-card";
      const items = p.roster
        .map((r) => `<li>${r.name}${r.position ? `<span class="pos">${r.position} · $${r.price}</span>` : `<span class="pos">$${r.price}</span>`}</li>`)
        .join("");
      card.innerHTML = `<h3>${p.name}</h3><div class="spent">$${p.spent} spent</div><ul>${items || "<li style=\"color:#6b6484;\">No picks yet</li>"}</ul>`;
      el.appendChild(card);
    });
  }

  function renderFinalRosters() {
    const el = document.getElementById("final-rosters");
    el.innerHTML = "";
    players.forEach((p) => {
      const card = document.createElement("div");
      card.className = "roster-card";
      const items = p.roster
        .map((r) => `<li>${r.name}${r.position ? `<span class="pos">${r.position} · $${r.price}</span>` : `<span class="pos">$${r.price}</span>`}</li>`)
        .join("");
      card.innerHTML = `<h3>${p.name}</h3><div class="spent">$${p.spent} spent · $${p.budget} left</div><ul>${items || "<li style=\"color:#6b6484;\">No picks</li>"}</ul>`;
      el.appendChild(card);
    });
  }

  function endGame() {
    gameView.classList.add("hidden");
    resultsView.classList.remove("hidden");
    renderFinalRosters();
  }

  function allRostersFull() {
    return players.every((p) => rosterFull(p));
  }

  function eligibleIgnoreBudget(p, item) {
    if (rosterFull(p)) return false;
    if (item.position && p.needs) {
      if (!(item.position in p.needs) || p.needs[item.position] <= 0) return false;
    }
    if (item.position && p.capsRemaining && item.position in p.capsRemaining) {
      if (p.capsRemaining[item.position] <= 0) return false;
    }
    return true;
  }

  function autoCompleteRemaining(player, fromIndex) {
    for (let i = fromIndex; i < auctionQueue.length; i++) {
      if (rosterFull(player)) break;
      const item = auctionQueue[i];
      if (eligibleIgnoreBudget(player, item)) {
        const price = player.budget >= 1 ? 1 : 0;
        awardItem(item, player, price);
        logLine(`<strong>${player.name}</strong> auto-won <strong>${item.name}</strong> for ${price > 0 ? `$${price}` : "free"} — squad completed`);
      }
    }
  }

  function nextItem(queueIndex) {
    if (allRostersFull()) {
      endGame();
      return;
    }
    if (queueIndex >= auctionQueue.length) {
      endGame();
      return;
    }

    const notFull = players.filter((p) => !rosterFull(p));
    if (notFull.length === 1) {
      autoCompleteRemaining(notFull[0], queueIndex);
      renderScoreboard(null);
      renderRosters();
      endGame();
      return;
    }

    const item = auctionQueue[queueIndex];
    const eligibleBidders = players.filter((p) => eligible(p, item));

    if (eligibleBidders.length === 0) {
      nextItem(queueIndex + 1);
      return;
    }

    const bidders = rotateStart(eligibleBidders);

    renderScoreboard(null);
    renderRosters();
    document.getElementById("item-name").textContent = item.name;
    document.getElementById("item-position").textContent = item.position || "";

    if (auctionType === "open") {
      runOpenAuction(item, bidders, queueIndex);
    } else {
      runBlindAuction(item, bidders, queueIndex);
    }
  }

  function resolveItem(item, winner, price, queueIndex) {
    if (winner) {
      awardItem(item, winner, price);
      logLine(`<strong>${winner.name}</strong> won <strong>${item.name}</strong> for ${price > 0 ? `$${price}` : "free"}`);
    } else {
      logLine(`${item.name} went unsold — nobody bid`);
    }
    turnPointer = (turnPointer + 1) % numPlayers;
    renderScoreboard(null);
    renderRosters();
    setTimeout(() => nextItem(queueIndex + 1), 250);
  }

  // ---------- OPEN (ascending) AUCTION ----------
  function runOpenAuction(item, bidders, queueIndex) {
    document.getElementById("open-bid-area").classList.remove("hidden");
    document.getElementById("pass-screen").classList.add("hidden");
    document.getElementById("round-label").textContent = "Up for bid — Open Auction";

    let active = bidders.slice();
    let currentBid = 0;
    let currentLeader = null;
    let turn = 0;
    let pendingSkip = null; // { offeredBy, responderQueue: [players] }

    const bidInput = document.getElementById("bid-input");
    const placeBidBtn = document.getElementById("place-bid-btn");
    const passBtn = document.getElementById("pass-btn");
    const skipBtn = document.getElementById("skip-btn");

    function canOfferSkip() {
      return active.length > 1 && skipState.available &&
        (skipState.restrictedTo === null || skipState.restrictedTo === active[turn % active.length].id);
    }

    function updateUI() {
      if (pendingSkip) {
        const responder = pendingSkip.responderQueue[0];
        renderScoreboard(responder.id);
        document.getElementById("current-bid-amount").textContent = `$${currentBid}`;
        document.getElementById("current-bid-leader").textContent = currentLeader ? `(${currentLeader.name})` : "";
        document.getElementById("turn-prompt").textContent = `${pendingSkip.offeredBy.name} wants to skip this item — ${responder.name}, agree or take it free?`;
        bidInput.classList.add("hidden");
        passBtn.classList.add("hidden");
        skipBtn.classList.remove("hidden");
        placeBidBtn.textContent = "Agree to Skip";
        skipBtn.textContent = "Take It (Free)";
        return;
      }
      bidInput.classList.remove("hidden");
      const canPass = currentBid > 0;
      passBtn.classList.toggle("hidden", !canPass);
      placeBidBtn.textContent = "Place Bid";
      passBtn.textContent = "Pass";
      renderScoreboard(active[turn % active.length].id);
      document.getElementById("current-bid-amount").textContent = `$${currentBid}`;
      document.getElementById("current-bid-leader").textContent = currentLeader ? `(${currentLeader.name})` : "";
      const current = active[turn % active.length];
      const offerable = canOfferSkip();
      const options = [canPass ? "pass" : null, offerable ? "offer a skip" : null].filter(Boolean).join(" or ");
      document.getElementById("turn-prompt").textContent = `${current.name}'s turn to bid${options ? `, ${options}` : ""}`;
      bidInput.value = currentBid + 1;
      bidInput.min = currentBid + 1;
      bidInput.max = current.budget;
      skipBtn.classList.toggle("hidden", !offerable);
      skipBtn.textContent = "Skip";
    }

    function step() {
      if (active.length === 0) {
        cleanup();
        resolveItem(item, null, 0, queueIndex);
        return;
      }
      if (active.length === 1 && currentBid > 0) {
        const winner = active[0];
        cleanup();
        resolveItem(item, winner, currentBid, queueIndex);
        return;
      }
      updateUI();
    }

    function onBid() {
      const current = active[turn % active.length];
      const val = parseInt(bidInput.value, 10);
      if (!Number.isInteger(val) || val <= currentBid || val > current.budget) return;
      currentBid = val;
      currentLeader = current;
      active = active.filter((p) => p.budget >= currentBid + 1 || p.id === current.id);
      turn = (active.indexOf(current) + 1) % active.length;
      step();
    }

    function onPass() {
      if (currentBid <= 0) return;
      const current = active[turn % active.length];
      active = active.filter((p) => p.id !== current.id);
      if (active.length > 0) turn = turn % active.length;
      step();
    }

    function onOfferSkip() {
      if (pendingSkip || !canOfferSkip()) return;
      const current = active[turn % active.length];
      pendingSkip = { offeredBy: current, responderQueue: active.filter((p) => p.id !== current.id) };
      updateUI();
    }

    function onAgreeSkip() {
      if (!pendingSkip) return;
      pendingSkip.responderQueue.shift();
      if (pendingSkip.responderQueue.length === 0) {
        skipState.available = false;
        skipState.restrictedTo = null;
        cleanup();
        resolveItem(item, null, 0, queueIndex);
      } else {
        updateUI();
      }
    }

    function onTakeFree() {
      if (!pendingSkip) return;
      const responder = pendingSkip.responderQueue[0];
      skipState.available = true;
      skipState.restrictedTo = responder.id;
      cleanup();
      resolveItem(item, responder, 0, queueIndex);
    }

    function onPrimaryClick() {
      if (pendingSkip) onAgreeSkip();
      else onBid();
    }

    function onSkipClick() {
      if (pendingSkip) onTakeFree();
      else onOfferSkip();
    }

    function cleanup() {
      placeBidBtn.removeEventListener("click", onPrimaryClick);
      passBtn.removeEventListener("click", onPass);
      skipBtn.removeEventListener("click", onSkipClick);
    }

    placeBidBtn.addEventListener("click", onPrimaryClick);
    passBtn.addEventListener("click", onPass);
    skipBtn.addEventListener("click", onSkipClick);
    step();
  }

  // ---------- BLIND AUCTION ----------
  function runBlindAuction(item, bidders, queueIndex) {
    document.getElementById("open-bid-area").classList.add("hidden");
    document.getElementById("pass-screen").classList.remove("hidden");
    document.getElementById("round-label").textContent = "Up for bid — Blind Auction";

    const bids = [];
    let idx = 0;

    const nameEl = document.getElementById("pass-player-name");
    const input = document.getElementById("blind-bid-input");
    const btn = document.getElementById("submit-blind-bid-btn");

    function prompt() {
      const p = bidders[idx];
      nameEl.textContent = p.name;
      input.value = 0;
      input.max = p.budget;
      renderScoreboard(p.id);
    }

    function onSubmit() {
      const p = bidders[idx];
      const val = parseInt(input.value, 10);
      const safeVal = Number.isInteger(val) && val >= 0 && val <= p.budget ? val : 0;
      bids.push({ player: p, amount: safeVal });
      idx++;
      if (idx >= bidders.length) {
        btn.removeEventListener("click", onSubmit);
        reveal();
      } else {
        prompt();
      }
    }

    function reveal() {
      let winningBid = null;
      bids.forEach((b) => {
        if (b.amount > 0 && (!winningBid || b.amount > winningBid.amount)) winningBid = b;
      });
      if (winningBid) {
        const bidLines = bids.map((b) => `${b.player.name}: $${b.amount}`).join(", ");
        logLine(`Bids — ${bidLines}`);
        resolveItem(item, winningBid.player, winningBid.amount, queueIndex);
      } else {
        resolveItem(item, null, 0, queueIndex);
      }
    }

    btn.addEventListener("click", onSubmit);
    prompt();
  }

  document.getElementById("lobby-start-btn").addEventListener("click", () => {
    lobbyView.classList.add("hidden");
    gameView.classList.remove("hidden");
    nextItem(0);
  }, { once: true });
}
