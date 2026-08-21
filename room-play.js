// Live multiplayer engine + rendering for room-based BidOffs.
// A room's authoritative state lives in Firestore (rooms/{code}); every
// device renders straight from onSnapshot and only ever writes the result
// of ITS OWN player's action. No single "host" process is required —
// whichever action causes a round to end is the one that computes and
// writes the next state. The only genuine race (multiple blind bids
// landing near-simultaneously) is resolved inside a Firestore transaction.

function rpClone(obj) {
  return obj ? JSON.parse(JSON.stringify(obj)) : obj;
}

function rpShuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function rpRosterFull(p, totalSlots) {
  return p.roster.length >= totalSlots;
}

function rpAllRostersFull(players, totalSlots) {
  return players.every((p) => rpRosterFull(p, totalSlots));
}

function rpEligible(p, item, totalSlots) {
  if (p.budget < 1) return false;
  if (rpRosterFull(p, totalSlots)) return false;
  if (item.position && p.needs) {
    if (!(item.position in p.needs) || p.needs[item.position] <= 0) return false;
  }
  if (item.position && p.capsRemaining && item.position in p.capsRemaining) {
    if (p.capsRemaining[item.position] <= 0) return false;
  }
  return true;
}

function rpEligibleIgnoreBudget(p, item, totalSlots) {
  if (rpRosterFull(p, totalSlots)) return false;
  if (item.position && p.needs) {
    if (!(item.position in p.needs) || p.needs[item.position] <= 0) return false;
  }
  if (item.position && p.capsRemaining && item.position in p.capsRemaining) {
    if (p.capsRemaining[item.position] <= 0) return false;
  }
  return true;
}

function rpRotateStart(biddersArr, turnPointer) {
  let startIdx = biddersArr.findIndex((p) => p.id >= turnPointer);
  if (startIdx === -1) startIdx = 0;
  return biddersArr.slice(startIdx).concat(biddersArr.slice(0, startIdx));
}

function rpBuildRound(item, itemIndex, eligibleBidders, turnPointer, auctionType) {
  const ordered = rpRotateStart(eligibleBidders, turnPointer);
  if (auctionType === "open") {
    return {
      itemIndex,
      item,
      type: "open",
      activeIds: ordered.map((p) => p.id),
      currentBid: 0,
      currentLeaderId: null,
      turnIndex: 0,
      pendingSkip: null,
    };
  }
  const bids = {};
  ordered.forEach((p) => { bids[p.id] = null; });
  return { itemIndex, item, type: "blind", bidderIds: ordered.map((p) => p.id), bids };
}

function rpFindNextRound(players, queue, fromIndex, totalSlots, turnPointer, auctionType) {
  if (rpAllRostersFull(players, totalSlots)) return null;
  for (let i = fromIndex; i < queue.length; i++) {
    const item = queue[i];
    const eligibleBidders = players.filter((p) => rpEligible(p, item, totalSlots));
    if (eligibleBidders.length === 0) continue;
    return { queueIndex: i, round: rpBuildRound(item, i, eligibleBidders, turnPointer, auctionType) };
  }
  return null;
}

// Finds the next queue item the given player could use, ignoring budget —
// used once they're the last one left and broke, so items are handed to
// them one at a time (each visibly logged) instead of an instant bulk grant.
function rpFindGiveawayItem(queue, fromIndex, totalSlots, player) {
  for (let i = fromIndex; i < queue.length; i++) {
    if (rpEligibleIgnoreBudget(player, queue[i], totalSlots)) return { item: queue[i], index: i };
  }
  return null;
}

function rpAwardItem(players, winnerId, item, price) {
  const winner = players.find((p) => p.id === winnerId);
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

// ---------- state mutations (each performed by whichever device caused it) ----------

async function rpStartGame(code, room) {
  // Any seats nobody joined from a separate device become local pass-the-device
  // seats — the host controls them on their own phone, exactly like the old
  // single-device mode. deviceId: null marks a seat as unclaimed.
  const players = rpClone(room.players);
  for (let id = players.length; id < room.numPlayers; id++) {
    players.push({
      id,
      deviceId: null,
      name: `Player ${id + 1}`,
      budget: room.budget,
      roster: [],
      spent: 0,
      needs: room.slotRequirement ? { ...room.slotRequirement } : null,
      capsRemaining: room.caps ? { ...room.caps } : null,
    });
  }

  const queue = rpShuffle(room.pool);
  const next = rpFindNextRound(players, queue, 0, room.totalSlotsPerPlayer, 0, room.auctionType);
  await db.collection("rooms").doc(code).update({
    players,
    status: next ? "playing" : "finished",
    queue,
    queueIndex: next ? next.queueIndex : queue.length,
    turnPointer: 0,
    round: next ? next.round : null,
  });
}

// Called on a short client-side delay whenever status is "playing" but
// there's no active round — hands the stuck (broke) player one item, then
// leaves it to the next scheduled call to do the next one, so each pick is
// visible in the log instead of the whole rest of the game vanishing at once.
async function rpAutoCompleteStep(code) {
  const ref = db.collection("rooms").doc(code);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const room = snap.data();
    if (room.status !== "playing" || room.round) return;

    const totalSlots = room.totalSlotsPerPlayer;
    const notFull = room.players.filter((p) => !rpRosterFull(p, totalSlots));
    if (notFull.length !== 1) return;

    const players = rpClone(room.players);
    const target = players.find((p) => p.id === notFull[0].id);
    const found = rpFindGiveawayItem(room.queue, room.queueIndex, totalSlots, target);

    if (!found) {
      tx.update(ref, { status: "finished", queueIndex: room.queue.length });
      return;
    }

    const price = target.budget >= 1 ? 1 : 0;
    rpAwardItem(players, target.id, found.item, price);
    const log = [`${target.name} auto-won ${found.item.name} for ${price > 0 ? `$${price}` : "free"} — squad completed`, ...room.log].slice(0, 40);
    const stillNotFull = !rpRosterFull(target, totalSlots);

    tx.update(ref, {
      players,
      log,
      queueIndex: found.index + 1,
      status: stillNotFull ? "playing" : "finished",
    });
  });
}

// Seats a device may act for: its own claimed seat, plus any unclaimed seat
// if this device is the host (host manually passes their own phone around).
function rpControlledIds(room, deviceId) {
  return room.players
    .filter((p) => p.deviceId === deviceId || (p.deviceId === null && deviceId === room.hostDeviceId))
    .map((p) => p.id);
}

// Pure computation, no I/O — safe to call with a freshly-read room inside a
// transaction so every write is based on the actual current server state,
// never a possibly-stale local snapshot.
function rpComputeResolveUpdate(room, winnerId, price, logText) {
  const players = rpClone(room.players);
  if (winnerId != null) rpAwardItem(players, winnerId, room.round.item, price);

  const newTurnPointer = (room.turnPointer + 1) % room.numPlayers;
  const totalSlots = room.totalSlotsPerPlayer;
  const log = [logText, ...room.log];
  const nextIndex = room.round.itemIndex + 1;

  const notFull = players.filter((p) => !rpRosterFull(p, totalSlots));
  const next = notFull.length > 0
    ? rpFindNextRound(players, room.queue, nextIndex, totalSlots, newTurnPointer, room.auctionType)
    : null;
  // Sole remaining player, but too broke to be "eligible" the normal way —
  // fall into the give-away stepper instead of ending the game outright.
  const stuck = notFull.length === 1 && !next;

  return {
    players,
    turnPointer: newTurnPointer,
    log: log.slice(0, 40),
    status: next || stuck ? "playing" : "finished",
    queueIndex: next ? next.queueIndex : (stuck ? nextIndex : room.queue.length),
    round: next ? next.round : null,
  };
}

async function rpSubmitOpenBid(code, _staleRoom, myId, rawAmount) {
  const ref = db.collection("rooms").doc(code);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const room = snap.data();
    const r = room.round;
    if (!r || r.type !== "open" || r.activeIds[r.turnIndex] !== myId) return;

    const me = room.players.find((p) => p.id === myId);
    const val = parseInt(rawAmount, 10);
    if (!Number.isInteger(val) || val <= r.currentBid || val > me.budget) return;

    const newActiveIds = r.activeIds.filter((id) => {
      if (id === myId) return true;
      const p = room.players.find((pp) => pp.id === id);
      return p.budget >= val + 1;
    });
    const newTurnIndex = (newActiveIds.indexOf(myId) + 1) % newActiveIds.length;

    if (newActiveIds.length === 1) {
      tx.update(ref, rpComputeResolveUpdate(room, myId, val, `${me.name} won ${r.item.name} for $${val}`));
      return;
    }

    tx.update(ref, {
      round: { ...r, activeIds: newActiveIds, currentBid: val, currentLeaderId: myId, turnIndex: newTurnIndex },
    });
  });
}

function rpCanOfferSkip(room, r, myId) {
  return r.activeIds.length > 1 && room.skipAvailable &&
    (room.skipRestrictedTo === null || room.skipRestrictedTo === myId);
}

// Classic, unlimited: you just don't want to outbid the current leader.
// Removes you from this item's bidding — no restriction, no cost, every item.
async function rpSubmitOpenPass(code, _staleRoom, myId) {
  const ref = db.collection("rooms").doc(code);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const room = snap.data();
    const r = room.round;
    if (!r || r.type !== "open" || r.pendingSkip || r.activeIds[r.turnIndex] !== myId) return;
    if (r.currentBid <= 0) return; // nothing to decline outbidding yet

    const newActiveIds = r.activeIds.filter((id) => id !== myId);

    if (newActiveIds.length === 0) {
      tx.update(ref, rpComputeResolveUpdate(room, null, 0, `${r.item.name} went unsold — nobody bid`));
      return;
    }
    if (newActiveIds.length === 1 && r.currentBid > 0) {
      const winner = room.players.find((p) => p.id === newActiveIds[0]);
      tx.update(ref, rpComputeResolveUpdate(room, winner.id, r.currentBid, `${winner.name} won ${r.item.name} for $${r.currentBid}`));
      return;
    }

    const newTurnIndex = r.turnIndex % newActiveIds.length;
    tx.update(ref, { round: { ...r, activeIds: newActiveIds, turnIndex: newTurnIndex } });
  });
}

// The limited, shared skip: proposes abandoning this item entirely.
// If everyone else eligible for this item is only excluded because they're
// flat broke, the sole bidder can hand it to them free instead of being
// forced to buy every remaining item themselves.
function rpGiftCandidate(room, r) {
  if (!r || r.activeIds.length !== 1) return null;
  return room.players.find((p) => p.budget < 1 && rpEligibleIgnoreBudget(p, r.item, room.totalSlotsPerPlayer)) || null;
}

async function rpSubmitOfferSkip(code, _staleRoom, myId) {
  const ref = db.collection("rooms").doc(code);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const room = snap.data();
    const r = room.round;
    if (!r || r.type !== "open" || r.pendingSkip || r.activeIds[r.turnIndex] !== myId) return;

    const me = room.players.find((p) => p.id === myId);
    const gift = rpGiftCandidate(room, r);
    if (gift) {
      tx.update(ref, rpComputeResolveUpdate(room, gift.id, 0, `${me.name} gave ${r.item.name} to ${gift.name} for free`));
      return;
    }

    if (!rpCanOfferSkip(room, r, myId)) return;

    tx.update(ref, {
      round: { ...r, pendingSkip: { offeredBy: myId, responderQueue: r.activeIds.filter((id) => id !== myId) } },
    });
  });
}

// Responder agrees to skip. Once every other active bidder has agreed, the
// item goes unsold and the shared skip is used up for the rest of the game.
async function rpSubmitAgreeSkip(code, _staleRoom, myId) {
  const ref = db.collection("rooms").doc(code);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const room = snap.data();
    const r = room.round;
    if (!r || r.type !== "open" || !r.pendingSkip || r.pendingSkip.responderQueue[0] !== myId) return;

    const newQueue = r.pendingSkip.responderQueue.slice(1);
    if (newQueue.length === 0) {
      const update = rpComputeResolveUpdate(room, null, 0, `${r.item.name} skipped by mutual agreement`);
      tx.update(ref, { ...update, skipAvailable: false, skipRestrictedTo: null });
      return;
    }
    tx.update(ref, { round: { ...r, pendingSkip: { ...r.pendingSkip, responderQueue: newQueue } } });
  });
}

// Responder declines the skip and takes the item free instead. The shared
// skip isn't used up — it becomes restricted to whoever just took it free.
async function rpSubmitTakeFree(code, _staleRoom, myId) {
  const ref = db.collection("rooms").doc(code);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const room = snap.data();
    const r = room.round;
    if (!r || r.type !== "open" || !r.pendingSkip || r.pendingSkip.responderQueue[0] !== myId) return;

    const me = room.players.find((p) => p.id === myId);
    const update = rpComputeResolveUpdate(room, myId, 0, `${me.name} took ${r.item.name} for free`);
    tx.update(ref, { ...update, skipAvailable: true, skipRestrictedTo: myId });
  });
}

async function rpSubmitBlindBid(code, room, myId, rawAmount) {
  const ref = db.collection("rooms").doc(code);
  const me = room.players.find((p) => p.id === myId);
  const v = parseInt(rawAmount, 10);
  const val = Number.isInteger(v) && v >= 0 && v <= me.budget ? v : 0;

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const freshRoom = snap.data();
    const r = freshRoom.round;
    if (!r || r.type !== "blind" || !(myId in r.bids) || r.bids[myId] !== null) return;

    const newBids = { ...r.bids, [myId]: val };
    const allIn = r.bidderIds.every((id) => newBids[id] !== null);

    if (!allIn) {
      tx.update(ref, { round: { ...r, bids: newBids } });
      return;
    }

    let winnerId = null;
    let winnerAmount = 0;
    r.bidderIds.forEach((id) => {
      const amt = newBids[id];
      if (amt > 0 && amt > winnerAmount) { winnerAmount = amt; winnerId = id; }
    });

    const bidLines = r.bidderIds
      .map((id) => `${freshRoom.players.find((p) => p.id === id).name}: $${newBids[id]}`)
      .join(", ");

    const logText = winnerId != null
      ? `Bids — ${bidLines} · ${freshRoom.players.find((p) => p.id === winnerId).name} won ${r.item.name} for $${winnerAmount}`
      : `Bids — ${bidLines} · ${r.item.name} went unsold`;

    tx.update(ref, rpComputeResolveUpdate(freshRoom, winnerId, winnerAmount, logText));
  });
}

async function rpRename(code, myId, newName) {
  const ref = db.collection("rooms").doc(code);
  const trimmed = newName.trim().slice(0, 20) || `Player ${myId + 1}`;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const room = snap.data();
    const players = room.players.map((p) => (p.id === myId ? { ...p, name: trimmed } : p));
    tx.update(ref, { players });
  });
}

// ---------- live chat ----------

function rpEscapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function initChat(code, deviceId) {
  const toggleBtn = document.getElementById("chat-toggle-btn");
  const panel = document.getElementById("chat-panel");
  const closeBtn = document.getElementById("chat-close-btn");
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("chat-send-btn");

  toggleBtn.classList.remove("hidden");
  panel.classList.remove("hidden");

  toggleBtn.addEventListener("click", () => panel.classList.toggle("open"));
  closeBtn.addEventListener("click", () => panel.classList.remove("open"));

  function send() {
    const text = input.value.trim().slice(0, 300);
    if (!text) return;
    input.value = "";
    db.collection("rooms").doc(code).get().then((snap) => {
      const room = snap.data();
      const me = room.players.find((p) => p.deviceId === deviceId);
      const name = me ? me.name : "Spectator";
      db.collection("rooms").doc(code).update({
        chat: firebase.firestore.FieldValue.arrayUnion({ name, text, ts: Date.now() }),
      });
    });
  }

  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") send();
  });
}

function renderChat(room) {
  const el = document.getElementById("chat-messages");
  if (!el) return;
  const chat = room.chat || [];
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  el.innerHTML = chat
    .map((m) => `<div class="chat-msg"><span class="who">${rpEscapeHtml(m.name)}</span>${rpEscapeHtml(m.text)}</div>`)
    .join("");
  if (atBottom) el.scrollTop = el.scrollHeight;
}

// ---------- rendering ----------

function runRoomGame(code) {
  const deviceId = getDeviceId();
  const lobbyView = document.getElementById("lobby-view");
  const gameView = document.getElementById("game-view");
  const resultsView = document.getElementById("results-view");
  const errorView = document.getElementById("error-view");

  let latestRoom = null;
  let joined = false;
  let openListenersBound = false;
  let blindListenersBound = false;
  let autoStepTimer = null;
  let finishedWired = false;

  document.getElementById("room-name-field").classList.remove("hidden");
  document.getElementById("room-player-list").classList.remove("hidden");
  document.getElementById("lobby-copy-hint").textContent = "Share this room code so friends can join on their own phone — or just hit Start and pass this device around for anyone who isn't on their own device.";

  initChat(code, deviceId);

  db.collection("rooms").doc(code).onSnapshot(
    (snap) => {
      if (!snap.exists) {
        errorView.classList.remove("hidden");
        lobbyView.classList.add("hidden");
        gameView.classList.add("hidden");
        return;
      }
      const room = snap.data();
      latestRoom = room;

      const myPlayer = room.players.find((p) => p.deviceId === deviceId) || null;
      if (!myPlayer && !joined && room.status === "lobby" && room.players.length < room.numPlayers) {
        joined = true;
        joinRoom(code).catch(() => { joined = false; });
      }

      render(room, myPlayer);
    },
    () => {
      errorView.classList.remove("hidden");
      lobbyView.classList.add("hidden");
      gameView.classList.add("hidden");
    }
  );

  function render(room, myPlayer) {
    renderChat(room);
    document.getElementById("game-title").textContent = room.gameKey;
    document.getElementById("game-subtitle").textContent =
      `${room.numPlayers} players · $${room.budget} budget · ${room.auctionType === "blind" ? "Blind Bid" : "Open Bid"}`;

    document.getElementById("code-badge").classList.remove("hidden");
    document.getElementById("code-value").textContent = code;
    if (!document.getElementById("copy-code-btn").dataset.wired) {
      document.getElementById("copy-code-btn").dataset.wired = "1";
      document.getElementById("copy-code-btn").addEventListener("click", () => {
        const link = `${window.location.href.split("?")[0]}?room=${code}`;
        const btn = document.getElementById("copy-code-btn");
        const done = () => { btn.textContent = "Copied!"; setTimeout(() => { btn.textContent = "Copy invite link"; }, 1500); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done).catch(done);
        else done();
      });
    }

    if (room.status === "lobby") {
      renderLobby(room, myPlayer);
    } else if (room.status === "playing") {
      lobbyView.classList.add("hidden");
      gameView.classList.remove("hidden");
      resultsView.classList.add("hidden");
      renderScoreboard(room);
      renderRosters(room);
      renderRound(room, myPlayer);

      // Nothing actionable to show (the sole remaining player is broke) —
      // the host's device paces through their remaining picks one at a time.
      if (!room.round && deviceId === room.hostDeviceId && !autoStepTimer) {
        autoStepTimer = setTimeout(() => {
          autoStepTimer = null;
          rpAutoCompleteStep(code);
        }, 700);
      }
    } else if (room.status === "finished") {
      lobbyView.classList.add("hidden");
      gameView.classList.add("hidden");
      resultsView.classList.remove("hidden");
      renderFinalRosters(room);
      if (!finishedWired) {
        finishedWired = true;
        if (typeof wireAiJudge === "function") wireAiJudge(room.gameKey, room.players);
      }
    }
  }

  function renderLobby(room, myPlayer) {
    errorView.classList.add("hidden");
    lobbyView.classList.remove("hidden");
    gameView.classList.add("hidden");
    resultsView.classList.add("hidden");

    const list = document.getElementById("room-player-list");
    list.innerHTML = room.players
      .map((p) => `<div style="padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.06);">${p.name}${p.deviceId === deviceId ? " (you)" : ""}</div>`)
      .join("") +
      Array.from({ length: room.numPlayers - room.players.length }).map(() =>
        `<div style="padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.06); color:#6b6484;">Waiting for a player…</div>`
      ).join("");

    const nameInput = document.getElementById("room-name-input");
    if (myPlayer && document.activeElement !== nameInput) nameInput.value = myPlayer.name;
    if (!nameInput.dataset.wired) {
      nameInput.dataset.wired = "1";
      nameInput.addEventListener("change", () => {
        if (myPlayer) rpRename(code, myPlayer.id, nameInput.value);
      });
    }

    const startBtn = document.getElementById("lobby-start-btn");
    const waitMsg = document.getElementById("room-wait-msg");
    const isHost = myPlayer && room.hostDeviceId === deviceId;
    const full = room.players.length >= room.numPlayers;

    if (isHost) {
      startBtn.classList.remove("hidden");
      startBtn.disabled = false;
      startBtn.textContent = full ? "START GAME →" : `START GAME → (${room.players.length}/${room.numPlayers} joined — rest pass your device)`;
      waitMsg.classList.add("hidden");
      if (!startBtn.dataset.wired) {
        startBtn.dataset.wired = "1";
        startBtn.addEventListener("click", () => {
          if (startBtn.disabled) return;
          startBtn.disabled = true;
          rpStartGame(code, latestRoom);
        });
      }
    } else {
      startBtn.classList.add("hidden");
      waitMsg.classList.remove("hidden");
      waitMsg.textContent = full
        ? "Everyone's in — waiting for the host to start…"
        : `Waiting for players (${room.players.length}/${room.numPlayers})…`;
    }
  }

  function renderScoreboard(room) {
    const board = document.getElementById("scoreboard");
    const activeId = room.round && room.round.type === "open" ? room.round.activeIds[room.round.turnIndex] : null;
    board.innerHTML = room.players.map((p) => `
      <div class="player-chip${p.id === activeId ? " active" : ""}">
        <div class="name">${p.name}${p.deviceId === deviceId ? " (you)" : ""}</div>
        <div class="budget">$${p.budget}</div>
        <div class="roster-count">${p.roster.length}/${room.totalSlotsPerPlayer} picked</div>
      </div>
    `).join("");
  }

  function rosterItemsHtml(p) {
    return p.roster
      .map((r) => `<li>${r.name}${r.position ? `<span class="pos">${r.position} · $${r.price}</span>` : `<span class="pos">$${r.price}</span>`}</li>`)
      .join("") || "<li style=\"color:#6b6484;\">No picks yet</li>";
  }

  function renderRosters(room) {
    document.getElementById("rosters").innerHTML = room.players.map((p) => `
      <div class="roster-card">
        <h3>${p.name}</h3>
        <div class="spent">$${p.spent} spent</div>
        <ul>${rosterItemsHtml(p)}</ul>
      </div>
    `).join("");
  }

  function renderFinalRosters(room) {
    document.getElementById("final-rosters").innerHTML = room.players.map((p) => `
      <div class="roster-card">
        <h3>${p.name}</h3>
        <div class="spent">$${p.spent} spent · $${p.budget} left</div>
        <ul>${rosterItemsHtml(p)}</ul>
      </div>
    `).join("");
  }

  function renderRound(room, myPlayer) {
    const log = document.getElementById("log");
    log.innerHTML = room.log.map((line) => `<div>${line}</div>`).join("");

    const r = room.round;
    if (!r) return;

    document.getElementById("item-name").textContent = r.item.name;
    document.getElementById("item-position").textContent = r.item.position || "";

    const myControlled = rpControlledIds(room, deviceId);

    if (r.type === "open") {
      document.getElementById("round-label").textContent = "Up for bid — Open Auction";
      document.getElementById("open-bid-area").classList.remove("hidden");
      document.getElementById("pass-screen").classList.add("hidden");

      const bidInput = document.getElementById("bid-input");
      const placeBidBtn = document.getElementById("place-bid-btn");
      const passBtn = document.getElementById("pass-btn");
      const skipBtn = document.getElementById("skip-btn");

      if (r.pendingSkip) {
        const offerer = room.players.find((p) => p.id === r.pendingSkip.offeredBy);
        const responderId = r.pendingSkip.responderQueue[0];
        const responder = room.players.find((p) => p.id === responderId);
        const isMyTurn = myControlled.includes(responderId);

        document.getElementById("current-bid-amount").textContent = `$${r.currentBid}`;
        const leader = r.currentLeaderId != null ? room.players.find((p) => p.id === r.currentLeaderId) : null;
        document.getElementById("current-bid-leader").textContent = leader ? `(${leader.name})` : "";
        document.getElementById("turn-prompt").textContent = isMyTurn
          ? `${offerer.name} wants to skip this item — agree, or take it free?`
          : `Waiting for ${responder.name} to agree to skip or take it free…`;

        bidInput.classList.add("hidden");
        passBtn.classList.add("hidden");
        skipBtn.classList.remove("hidden");
        placeBidBtn.textContent = "Agree to Skip";
        skipBtn.textContent = "Take It (Free)";
        placeBidBtn.disabled = !isMyTurn;
        skipBtn.disabled = !isMyTurn;
      } else {
        const currentId = r.activeIds[r.turnIndex];
        const currentPlayer = room.players.find((p) => p.id === currentId);
        const isMyTurn = myControlled.includes(currentId);
        const isOwnDevice = currentPlayer && currentPlayer.deviceId === deviceId;

        const offerable = currentPlayer && rpCanOfferSkip(room, r, currentPlayer.id);
        const gift = rpGiftCandidate(room, r);
        const canPass = r.currentBid > 0;
        const options = [canPass ? "pass" : null, offerable ? "offer a skip" : null, gift ? `give it to ${gift.name}` : null].filter(Boolean).join(" or ");

        document.getElementById("current-bid-amount").textContent = `$${r.currentBid}`;
        const leader = r.currentLeaderId != null ? room.players.find((p) => p.id === r.currentLeaderId) : null;
        document.getElementById("current-bid-leader").textContent = leader ? `(${leader.name})` : "";
        document.getElementById("turn-prompt").textContent = !isMyTurn
          ? `Waiting for ${currentPlayer ? currentPlayer.name : "…"} to bid`
          : isOwnDevice
            ? `Your turn to bid${options ? `, ${options}` : ""}`
            : `${currentPlayer.name}'s turn — pass the device, then bid${options ? `, ${options}` : ""}`;

        bidInput.classList.remove("hidden");
        placeBidBtn.textContent = "Place Bid";
        passBtn.textContent = "Pass";
        bidInput.disabled = !isMyTurn;
        placeBidBtn.disabled = !isMyTurn;
        passBtn.classList.toggle("hidden", !canPass);
        passBtn.disabled = !isMyTurn;
        if (gift) {
          skipBtn.classList.remove("hidden");
          skipBtn.textContent = `Give to ${gift.name} (Free)`;
        } else {
          skipBtn.classList.toggle("hidden", !offerable);
          skipBtn.textContent = "Skip";
        }
        skipBtn.disabled = !isMyTurn;

        if (isMyTurn && document.activeElement !== bidInput) {
          bidInput.value = r.currentBid + 1;
          bidInput.min = r.currentBid + 1;
          bidInput.max = currentPlayer.budget;
        }
      }

      if (!openListenersBound) {
        openListenersBound = true;
        placeBidBtn.addEventListener("click", () => {
          if (placeBidBtn.disabled) return;
          placeBidBtn.disabled = true;
          passBtn.disabled = true;
          skipBtn.disabled = true;
          const rr = latestRoom.round;
          if (rr.pendingSkip) {
            rpSubmitAgreeSkip(code, latestRoom, rr.pendingSkip.responderQueue[0]);
          } else {
            rpSubmitOpenBid(code, latestRoom, rr.activeIds[rr.turnIndex], bidInput.value);
          }
        });
        passBtn.addEventListener("click", () => {
          if (passBtn.disabled) return;
          placeBidBtn.disabled = true;
          passBtn.disabled = true;
          skipBtn.disabled = true;
          const rr = latestRoom.round;
          rpSubmitOpenPass(code, latestRoom, rr.activeIds[rr.turnIndex]);
        });
        skipBtn.addEventListener("click", () => {
          if (skipBtn.disabled) return;
          placeBidBtn.disabled = true;
          passBtn.disabled = true;
          skipBtn.disabled = true;
          const rr = latestRoom.round;
          if (rr.pendingSkip) {
            rpSubmitTakeFree(code, latestRoom, rr.pendingSkip.responderQueue[0]);
          } else {
            rpSubmitOfferSkip(code, latestRoom, rr.activeIds[rr.turnIndex]);
          }
        });
      }
    } else {
      document.getElementById("round-label").textContent = "Up for bid — Blind Auction";
      document.getElementById("open-bid-area").classList.add("hidden");
      document.getElementById("pass-screen").classList.remove("hidden");

      const myPendingIds = r.bidderIds.filter((id) => myControlled.includes(id) && (r.bids[id] === null || r.bids[id] === undefined));
      const actingId = myPendingIds.length > 0 ? myPendingIds[0] : null;
      const actingPlayer = actingId != null ? room.players.find((p) => p.id === actingId) : null;
      const iAmBidder = actingId != null;
      const iHaveSubmitted = !iAmBidder;
      const submittedCount = r.bidderIds.filter((id) => r.bids[id] !== null && r.bids[id] !== undefined).length;

      document.getElementById("pass-screen-label").textContent = actingPlayer && actingPlayer.deviceId !== deviceId ? "Pass the device to" : "Your secret bid";
      document.getElementById("pass-player-name").textContent = actingPlayer ? actingPlayer.name : "";
      document.getElementById("pass-screen-hint").textContent = `${submittedCount}/${r.bidderIds.length} players have locked in a bid.`;

      const blindControls = document.getElementById("blind-bid-controls");
      const waitMsg = document.getElementById("blind-wait-msg");
      const blindInput = document.getElementById("blind-bid-input");
      const submitBtn = document.getElementById("submit-blind-bid-btn");

      if (iAmBidder && !iHaveSubmitted) {
        blindControls.classList.remove("hidden");
        waitMsg.classList.add("hidden");
        if (document.activeElement !== blindInput) {
          blindInput.value = 0;
          blindInput.max = actingPlayer.budget;
        }
        submitBtn.disabled = false;
      } else {
        blindControls.classList.add("hidden");
        waitMsg.classList.remove("hidden");
        const controlledBidders = r.bidderIds.filter((id) => myControlled.includes(id));
        const haveLockedIn = controlledBidders.length > 0;
        waitMsg.textContent = haveLockedIn
          ? "Your bid is locked in — waiting for everyone else…"
          : "Waiting for bidders to lock in their bids…";
      }

      if (!blindListenersBound) {
        blindListenersBound = true;
        submitBtn.addEventListener("click", () => {
          if (submitBtn.disabled) return;
          const rr = latestRoom.round;
          const controlledNow = rpControlledIds(latestRoom, deviceId);
          const pending = rr.bidderIds.filter((id) => controlledNow.includes(id) && (rr.bids[id] === null || rr.bids[id] === undefined));
          if (pending.length === 0) return;
          submitBtn.disabled = true;
          rpSubmitBlindBid(code, latestRoom, pending[0], blindInput.value);
        });
      }
    }
  }
}
