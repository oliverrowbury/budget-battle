const params = new URLSearchParams(window.location.search);
const roomCode = params.get("room");
const isSpectator = params.get("spectate") === "1";
const vsAI = params.get("ai") === "1";

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
  runRoomGame(roomCode.trim().toUpperCase(), isSpectator);
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

// Retriggers a CSS animation by toggling the class off then back on.
function pulseClass(el, className) {
  if (!el) return;
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
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
    const isAI = vsAI && i > 0;
    players.push({
      id: i,
      name: isAI ? `🤖 AI ${i}` : vsAI ? "You" : `Player ${i + 1}`,
      budget: startingBudget,
      roster: [],
      spent: 0,
      needs: clone(slotRequirement),
      capsRemaining: clone(caps),
      isAI,
      // Fixed per-bot personality (set once, not re-rolled every bid) so
      // each AI values items consistently across a game instead of
      // fluctuating turn to turn, and so two AIs facing the same item don't
      // land on near-identical numbers as often.
      aggression: isAI ? 0.8 + Math.random() * 0.5 : 1,
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
      const pct = Math.min(100, Math.round((p.roster.length / totalSlotsPerPlayer) * 100));
      chip.innerHTML = `
        <div class="avatar">${p.name.trim().charAt(0).toUpperCase() || "?"}</div>
        <div class="name">${p.name}</div>
        <div class="budget">${p.budget}</div>
        <div class="roster-bar"><div class="roster-bar-fill" style="width:${pct}%"></div></div>
        <div class="roster-count">${p.roster.length}/${totalSlotsPerPlayer} picked</div>
      `;
      board.appendChild(chip);
    });
  }

  function rosterListHtml(p) {
    const items = p.roster
      .map((r) => `<li>${r.name}${r.position ? `<span class="pos">${r.position} · $${r.price}</span>` : `<span class="pos">$${r.price}</span>`}</li>`)
      .join("");
    const emptyCount = Math.max(0, totalSlotsPerPlayer - p.roster.length);
    const empties = Array.from({ length: emptyCount }, () => `<li class="empty-slot">Empty slot</li>`).join("");
    return items + empties;
  }

  function renderRosters() {
    const el = document.getElementById("rosters");
    el.innerHTML = "";
    players.forEach((p) => {
      const card = document.createElement("div");
      card.className = "roster-card";
      card.innerHTML = `<h3>${p.name}</h3><div class="spent">$${p.spent} spent</div><ul>${rosterListHtml(p)}</ul>`;
      el.appendChild(card);
    });
  }

  function renderFinalRosters() {
    const el = document.getElementById("final-rosters");
    el.innerHTML = "";
    players.forEach((p) => {
      const card = document.createElement("div");
      card.className = "roster-card";
      card.innerHTML = `<h3>${p.name}</h3><div class="spent">$${p.spent} spent · $${p.budget} left</div><ul>${rosterListHtml(p)}</ul>`;
      el.appendChild(card);
    });
  }

  function endGame() {
    gameView.classList.add("hidden");
    resultsView.classList.remove("hidden");
    renderFinalRosters();
    // AI Judge is switched off for now (ai-judge.js/backend still exist,
    // just not wired up from here) - see room-play.js for the matching spot.
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

  function nextItem(queueIndex) {
    if (allRostersFull()) {
      endGame();
      return;
    }
    if (queueIndex >= auctionQueue.length) {
      endGame();
      return;
    }

    const item = auctionQueue[queueIndex];
    const eligibleBidders = players.filter((p) => eligible(p, item));

    if (eligibleBidders.length === 0) {
      // Nobody's truly eligible for this one — but if exactly one player
      // still needs picks and is just broke, hand it to them (visibly, one
      // item at a time) instead of skipping it or dumping everything at once.
      const notFull = players.filter((p) => !rosterFull(p));
      if (notFull.length === 1 && eligibleIgnoreBudget(notFull[0], item)) {
        const player = notFull[0];
        const price = player.budget >= 1 ? 1 : 0;
        awardItem(item, player, price);
        logLine(`<strong>${player.name}</strong> auto-won <strong>${item.name}</strong> for ${price > 0 ? `$${price}` : "free"} — squad completed`);
        renderScoreboard(null);
        renderRosters();
        setTimeout(() => nextItem(queueIndex + 1), 250);
        return;
      }
      nextItem(queueIndex + 1);
      return;
    }

    const bidders = rotateStart(eligibleBidders);

    renderScoreboard(null);
    renderRosters();
    document.getElementById("item-name").textContent = item.name;
    document.getElementById("item-position").textContent = item.position || "";
    pulseClass(document.querySelector(".up-for-bid"), "item-swap");

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
      pulseClass(document.getElementById("auction-card"), "win-flash");
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

    // An AI's max willingness to pay for THIS item, decided once and then
    // held - previously this was re-rolled with fresh randomness on every
    // single turn, so the same bot could happily raise a bid to $40 and
    // then refuse a $41 counter a moment later just because the dice came
    // up differently that turn. Computed lazily (budget/roster don't change
    // for a player mid-item, only at resolution) and cached per player id.
    const aiCeilingCache = {};
    function aiCeilingFor(current) {
      if (aiCeilingCache[current.id] !== undefined) return aiCeilingCache[current.id];
      const tier = typeof aiItemTier === "function" ? aiItemTier(gameKey, item.name) : 3;
      const tierMult = { 1: 2.4, 2: 1.6, 3: 1.0, 4: 0.55 }[tier];
      const slotsLeft = Math.max(1, totalSlotsPerPlayer - current.roster.length);
      // Anchored to the game's overall budget/slots, not just what's left -
      // "budget remaining ÷ slots remaining" balloons to the ENTIRE
      // remaining budget on the last slot, so a tier1-3 item (anything
      // that isn't explicitly low-value) would blow the whole bankroll
      // on whatever's left, good or not. Taking the smaller of the stable
      // baseline and the live figure keeps bids sane late-game while still
      // tightening up for real if the AI is genuinely low on cash.
      const basePerSlot = Math.max(1, Math.floor(startingBudget / totalSlotsPerPlayer));
      const perSlot = Math.min(basePerSlot, Math.max(1, Math.floor(current.budget / slotsLeft)));
      const ceiling = Math.max(1, Math.min(
        current.budget,
        Math.round(perSlot * tierMult * current.aggression * (0.85 + Math.random() * 0.7))
      ));
      aiCeilingCache[current.id] = { ceiling, tier, slotsLeft };
      return aiCeilingCache[current.id];
    }

    const bidInput = document.getElementById("bid-input");
    const placeBidBtn = document.getElementById("place-bid-btn");
    const passBtn = document.getElementById("pass-btn");
    const skipBtn = document.getElementById("skip-btn");

    function canOfferSkip() {
      return active.length > 1 && skipState.available &&
        (skipState.restrictedTo === null || skipState.restrictedTo === active[turn % active.length].id);
    }

    // If everyone else eligible for this item is only excluded because
    // they're flat broke, the sole bidder can hand it to them free instead
    // of being forced to buy every remaining item themselves.
    function giftCandidate() {
      if (active.length !== 1) return null;
      return players.find((p) => p.budget < 1 && eligibleIgnoreBudget(p, item)) || null;
    }

    function hideAllControls() {
      bidInput.classList.add("hidden");
      passBtn.classList.add("hidden");
      skipBtn.classList.add("hidden");
      placeBidBtn.classList.add("hidden");
    }

    function showAllControls() {
      placeBidBtn.classList.remove("hidden");
    }

    function updateUI() {
      if (pendingSkip) {
        const responder = pendingSkip.responderQueue[0];
        renderScoreboard(responder.id);
        document.getElementById("current-bid-amount").textContent = `$${currentBid}`;
        document.getElementById("current-bid-leader").textContent = currentLeader ? `(${currentLeader.name})` : "";

        if (responder.isAI) {
          hideAllControls();
          document.getElementById("turn-prompt").textContent = `${pendingSkip.offeredBy.name} offered a skip — ${responder.name} is deciding…`;
          setTimeout(aiRespondToSkip, 900 + Math.random() * 1200);
          return;
        }

        showAllControls();
        document.getElementById("turn-prompt").textContent = `${pendingSkip.offeredBy.name} wants to skip this item — ${responder.name}, agree or take it free?`;
        bidInput.classList.add("hidden");
        passBtn.classList.add("hidden");
        skipBtn.classList.remove("hidden");
        placeBidBtn.textContent = "Agree to Skip";
        skipBtn.textContent = "Take It (Free)";
        return;
      }

      const current = active[turn % active.length];
      renderScoreboard(current.id);
      document.getElementById("current-bid-amount").textContent = `$${currentBid}`;
      document.getElementById("current-bid-leader").textContent = currentLeader ? `(${currentLeader.name})` : "";

      if (current.isAI) {
        hideAllControls();
        document.getElementById("turn-prompt").textContent = `${current.name} is thinking…`;
        setTimeout(aiTakeOpenTurn, 1100 + Math.random() * 1600);
        return;
      }

      showAllControls();
      bidInput.classList.remove("hidden");
      // Solo bidder can always pass, even before bidding — otherwise once
      // the other player's broke or full, they're stuck buying everything
      // left just because nobody's around to actually bid against.
      const canPass = currentBid > 0 || active.length === 1;
      passBtn.classList.toggle("hidden", !canPass);
      placeBidBtn.textContent = "Place Bid";
      passBtn.textContent = "Pass";
      const offerable = canOfferSkip();
      const gift = giftCandidate();
      const options = [canPass ? "pass" : null, offerable ? "offer a skip" : null, gift ? `give it to ${gift.name}` : null].filter(Boolean).join(" or ");
      document.getElementById("turn-prompt").textContent = `${current.name}'s turn to bid${options ? `, ${options}` : ""}`;
      bidInput.value = currentBid + 1;
      bidInput.min = currentBid + 1;
      bidInput.max = current.budget;
      if (gift) {
        skipBtn.classList.remove("hidden");
        skipBtn.textContent = `Give to ${gift.name} (Free)`;
      } else {
        skipBtn.classList.toggle("hidden", !offerable);
        skipBtn.textContent = "Skip";
      }
    }

    // Budget/slots-aware heuristic, boosted by a real quality signal where
    // one exists (see ai-value-tiers.js — currently NBA Current/All-Time;
    // everything else falls back to tier 3/"average" for every item, i.e.
    // the plain budget/slots behavior). A tier 1 pick gets a much higher
    // spending ceiling and the AI won't proactively bail on it; a tier 4
    // pick gets a lower ceiling and the AI is more willing to let it go.
    function aiTakeOpenTurn() {
      const current = active[turn % active.length];
      if (!current || !current.isAI) return;
      const { ceiling, tier, slotsLeft } = aiCeilingFor(current);
      const budgetDesperate = current.budget <= slotsLeft; // averaging ~$1/slot left — real risk of going bust
      const notWorthFighting = tier >= 3 && current.budget <= slotsLeft * 2 && Math.random() < (tier === 4 ? 0.45 : 0.15);

      if (currentBid === 0) {
        const openBid = Math.max(1, Math.min(current.budget, Math.round(ceiling * (0.2 + Math.random() * 0.4))));
        bidInput.value = openBid;
        onBid();
        return;
      }

      if (currentBid + 1 <= ceiling && currentBid + 1 <= current.budget) {
        bidInput.value = currentBid + 1;
        onBid();
      } else if ((budgetDesperate || notWorthFighting) && canOfferSkip()) {
        onOfferSkip();
      } else {
        onPass();
      }
    }

    function aiRespondToSkip() {
      if (!pendingSkip) return;
      const responder = pendingSkip.responderQueue[0];
      if (!responder || !responder.isAI) return;
      // A free pick toward a slot you still need is essentially always worth it.
      if (Math.random() < 0.9) onTakeFree();
      else onAgreeSkip();
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
      pulseClass(document.getElementById("current-bid-amount"), "bid-pulse");
    }

    function onPass() {
      if (currentBid <= 0 && active.length > 1) return;
      const current = active[turn % active.length];
      active = active.filter((p) => p.id !== current.id);
      if (active.length > 0) turn = turn % active.length;
      step();
    }

    function onOfferSkip() {
      if (pendingSkip) return;
      const gift = giftCandidate();
      if (gift) {
        cleanup();
        resolveItem(item, gift, 0, queueIndex);
        return;
      }
      if (!canOfferSkip()) return;
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

    function submitBid(val) {
      const p = bidders[idx];
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

    function prompt() {
      const p = bidders[idx];
      nameEl.textContent = p.name;
      renderScoreboard(p.id);

      if (p.isAI) {
        document.getElementById("pass-screen-label").textContent = "Now bidding";
        document.getElementById("pass-screen-hint").textContent = `${p.name} is deciding their bid…`;
        document.getElementById("blind-bid-controls").classList.add("hidden");
        setTimeout(() => {
          const tier = typeof aiItemTier === "function" ? aiItemTier(gameKey, item.name) : 3;
          const tierMult = { 1: 2.4, 2: 1.6, 3: 1.0, 4: 0.55 }[tier];
          const slotsLeft = Math.max(1, totalSlotsPerPlayer - p.roster.length);
          // Same fix as the open-bid ceiling: anchor to the game's overall
          // budget/slots rather than budget-left ÷ slots-left, which
          // balloons to the WHOLE remaining budget on the last slot and
          // made the AI go all-in on its final pick regardless of quality.
          const basePerSlot = Math.max(1, Math.floor(startingBudget / totalSlotsPerPlayer));
          const perSlot = Math.min(basePerSlot, Math.max(1, Math.floor(p.budget / slotsLeft)));
          // Most of the spread between two AIs now comes from their fixed
          // per-bot aggression (set once at game start) rather than fresh
          // randomness every bid — before this, two bots with the same
          // budget/roster/tier were drawing from the exact same range and
          // regularly landed on the same dollar figure.
          const val = Math.max(0, Math.min(p.budget, Math.round(perSlot * tierMult * p.aggression * (0.75 + Math.random() * 0.5))));
          submitBid(val);
        }, 1100 + Math.random() * 1600);
        return;
      }

      document.getElementById("pass-screen-label").textContent = "Pass the device to";
      document.getElementById("pass-screen-hint").textContent = bidders.length === 1
        ? "Nobody else can use this one right now (position filled, roster full, or broke) — no competition, so set your price, or enter $0 to skip it and move on."
        : "Everyone else look away — enter your secret bid.";
      document.getElementById("blind-bid-controls").classList.remove("hidden");
      input.value = 0;
      input.max = p.budget;
    }

    function onSubmit() {
      submitBid(parseInt(input.value, 10));
    }

    function reveal() {
      const positiveBids = bids.filter((b) => b.amount > 0);
      let maxAmount = 0;
      positiveBids.forEach((b) => { if (b.amount > maxAmount) maxAmount = b.amount; });
      // Everyone tied at the top - pick randomly among them instead of
      // silently taking whoever happened to be checked first.
      const tied = positiveBids.filter((b) => b.amount === maxAmount);
      const winningBid = tied.length > 0 ? tied[Math.floor(Math.random() * tied.length)] : null;

      const bidLines = bids.map((b) => `${b.player.name}: $${b.amount}`).join(", ");
      if (winningBid) logLine(`Bids — ${bidLines}`);

      // Pause on the reveal instead of cutting straight to the next item -
      // otherwise the bids just vanish and it's unclear who actually won.
      document.getElementById("blind-bid-controls").classList.add("hidden");
      document.getElementById("blind-wait-msg").classList.add("hidden");

      function showReveal() {
        document.getElementById("pass-screen-label").textContent = "Bids revealed!";
        nameEl.textContent = "";
        document.getElementById("pass-screen-hint").textContent = winningBid
          ? `${winningBid.player.name} wins ${item.name} for $${winningBid.amount}!`
          : `${item.name} goes unsold — nobody bid.`;

        const revealList = document.getElementById("blind-reveal-list");
        revealList.classList.remove("hidden");
        revealList.innerHTML = bids.map((b) => {
          const isWinner = winningBid && b.player.id === winningBid.player.id;
          return `<li style="display:flex; justify-content:space-between; padding:8px 12px; border-radius:10px; background:${isWinner ? "rgba(240,180,41,0.14)" : "rgba(255,255,255,0.04)"}; ${isWinner ? "border:1px solid rgba(240,180,41,0.4);" : ""}">
            <span style="color:${isWinner ? "#f0b429" : "#c9c4dd"}; font-weight:${isWinner ? "700" : "500"};">${b.player.name}${isWinner ? " 🏆" : ""}</span>
            <span style="color:${isWinner ? "#f0b429" : "#c9c4dd"}; font-weight:${isWinner ? "700" : "500"};">$${b.amount}</span>
          </li>`;
        }).join("");

        setTimeout(() => {
          revealList.classList.add("hidden");
          if (winningBid) resolveItem(item, winningBid.player, winningBid.amount, queueIndex);
          else resolveItem(item, null, 0, queueIndex);
        }, 2600);
      }

      if (tied.length > 1 && typeof rpSpinWheel === "function") {
        document.getElementById("pass-screen-label").textContent = "It's a tie!";
        nameEl.textContent = "";
        document.getElementById("pass-screen-hint").textContent =
          `Tied at $${maxAmount} between ${tied.map((b) => b.player.name).join(", ")} — spinning to decide…`;
        document.getElementById("blind-reveal-list").classList.add("hidden");
        rpSpinWheel(tied.map((b) => b.player.name), tied.indexOf(winningBid), `${winningBid.player.name} wins the spin — $${winningBid.amount}!`, 4200)
          .then(showReveal);
      } else {
        showReveal();
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
