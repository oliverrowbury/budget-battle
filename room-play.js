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
  const queue = rpShuffle(room.pool);
  const players = rpClone(room.players);
  const next = rpFindNextRound(players, queue, 0, room.totalSlotsPerPlayer, 0, room.auctionType);
  await db.collection("rooms").doc(code).update({
    status: next ? "playing" : "finished",
    queue,
    queueIndex: next ? next.queueIndex : queue.length,
    turnPointer: 0,
    round: next ? next.round : null,
  });
}

async function rpResolveAndAdvance(code, room, winnerId, price, logText) {
  const players = rpClone(room.players);
  if (winnerId != null) rpAwardItem(players, winnerId, room.round.item, price);

  const newTurnPointer = (room.turnPointer + 1) % room.numPlayers;
  const next = rpFindNextRound(players, room.queue, room.round.itemIndex + 1, room.totalSlotsPerPlayer, newTurnPointer, room.auctionType);
  const log = [logText, ...room.log].slice(0, 40);

  await db.collection("rooms").doc(code).update({
    players,
    turnPointer: newTurnPointer,
    log,
    status: next ? "playing" : "finished",
    queueIndex: next ? next.queueIndex : room.queue.length,
    round: next ? next.round : null,
  });
}

async function rpSubmitOpenBid(code, room, myId, rawAmount) {
  const r = room.round;
  if (!r || r.type !== "open") return;
  if (r.activeIds[r.turnIndex] !== myId) return;

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
    await rpResolveAndAdvance(code, room, myId, val, `${me.name} won ${r.item.name} for $${val}`);
    return;
  }

  await db.collection("rooms").doc(code).update({
    round: { ...r, activeIds: newActiveIds, currentBid: val, currentLeaderId: myId, turnIndex: newTurnIndex },
  });
}

async function rpSubmitOpenPass(code, room, myId) {
  const r = room.round;
  if (!r || r.type !== "open") return;
  if (r.activeIds[r.turnIndex] !== myId) return;

  const newActiveIds = r.activeIds.filter((id) => id !== myId);

  if (newActiveIds.length === 0) {
    await rpResolveAndAdvance(code, room, null, 0, `${r.item.name} went unsold — nobody bid`);
    return;
  }
  if (newActiveIds.length === 1 && r.currentBid > 0) {
    const winner = room.players.find((p) => p.id === newActiveIds[0]);
    await rpResolveAndAdvance(code, room, winner.id, r.currentBid, `${winner.name} won ${r.item.name} for $${r.currentBid}`);
    return;
  }

  const newTurnIndex = newActiveIds.length > 0 ? r.turnIndex % newActiveIds.length : 0;
  await db.collection("rooms").doc(code).update({
    round: { ...r, activeIds: newActiveIds, turnIndex: newTurnIndex },
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

    const players = rpClone(freshRoom.players);
    const bidLines = r.bidderIds
      .map((id) => `${players.find((p) => p.id === id).name}: $${newBids[id]}`)
      .join(", ");

    let logText;
    if (winnerId != null) {
      rpAwardItem(players, winnerId, r.item, winnerAmount);
      const winner = players.find((p) => p.id === winnerId);
      logText = `Bids — ${bidLines} · ${winner.name} won ${r.item.name} for $${winnerAmount}`;
    } else {
      logText = `Bids — ${bidLines} · ${r.item.name} went unsold`;
    }

    const newTurnPointer = (freshRoom.turnPointer + 1) % freshRoom.numPlayers;
    const next = rpFindNextRound(players, freshRoom.queue, r.itemIndex + 1, freshRoom.totalSlotsPerPlayer, newTurnPointer, freshRoom.auctionType);
    const log = [logText, ...freshRoom.log].slice(0, 40);

    tx.update(ref, {
      players,
      turnPointer: newTurnPointer,
      log,
      status: next ? "playing" : "finished",
      queueIndex: next ? next.queueIndex : freshRoom.queue.length,
      round: next ? next.round : null,
    });
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

  document.getElementById("room-name-field").classList.remove("hidden");
  document.getElementById("room-player-list").classList.remove("hidden");
  document.getElementById("lobby-copy-hint").textContent = "Share this room code — friends who open it join this exact live game.";

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
    } else if (room.status === "finished") {
      lobbyView.classList.add("hidden");
      gameView.classList.add("hidden");
      resultsView.classList.remove("hidden");
      renderFinalRosters(room);
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
      startBtn.disabled = !full;
      startBtn.textContent = full ? "START GAME →" : `WAITING FOR PLAYERS (${room.players.length}/${room.numPlayers})`;
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

    if (r.type === "open") {
      document.getElementById("round-label").textContent = "Up for bid — Open Auction";
      document.getElementById("open-bid-area").classList.remove("hidden");
      document.getElementById("pass-screen").classList.add("hidden");

      const currentId = r.activeIds[r.turnIndex];
      const currentPlayer = room.players.find((p) => p.id === currentId);
      const isMyTurn = myPlayer && currentId === myPlayer.id;

      document.getElementById("current-bid-amount").textContent = `$${r.currentBid}`;
      const leader = r.currentLeaderId != null ? room.players.find((p) => p.id === r.currentLeaderId) : null;
      document.getElementById("current-bid-leader").textContent = leader ? `(${leader.name})` : "";
      document.getElementById("turn-prompt").textContent = isMyTurn
        ? "Your turn to bid or pass"
        : `Waiting for ${currentPlayer ? currentPlayer.name : "…"} to bid or pass`;

      const bidInput = document.getElementById("bid-input");
      const placeBidBtn = document.getElementById("place-bid-btn");
      const passBtn = document.getElementById("pass-btn");

      bidInput.disabled = !isMyTurn;
      placeBidBtn.disabled = !isMyTurn;
      passBtn.disabled = !isMyTurn;

      if (isMyTurn && document.activeElement !== bidInput) {
        bidInput.value = r.currentBid + 1;
        bidInput.min = r.currentBid + 1;
        bidInput.max = currentPlayer.budget;
      }

      if (!openListenersBound) {
        openListenersBound = true;
        placeBidBtn.addEventListener("click", () => {
          if (placeBidBtn.disabled) return;
          placeBidBtn.disabled = true;
          passBtn.disabled = true;
          rpSubmitOpenBid(code, latestRoom, myPlayer.id, bidInput.value);
        });
        passBtn.addEventListener("click", () => {
          if (passBtn.disabled) return;
          placeBidBtn.disabled = true;
          passBtn.disabled = true;
          rpSubmitOpenPass(code, latestRoom, myPlayer.id);
        });
      }
    } else {
      document.getElementById("round-label").textContent = "Up for bid — Blind Auction";
      document.getElementById("open-bid-area").classList.add("hidden");
      document.getElementById("pass-screen").classList.remove("hidden");

      const iAmBidder = myPlayer && r.bidderIds.includes(myPlayer.id);
      const iHaveSubmitted = myPlayer && r.bids[myPlayer.id] !== null && r.bids[myPlayer.id] !== undefined;
      const submittedCount = r.bidderIds.filter((id) => r.bids[id] !== null && r.bids[id] !== undefined).length;

      document.getElementById("pass-screen-label").textContent = "Your secret bid";
      document.getElementById("pass-player-name").textContent = myPlayer ? myPlayer.name : "";
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
          blindInput.max = myPlayer.budget;
        }
        submitBtn.disabled = false;
      } else {
        blindControls.classList.add("hidden");
        waitMsg.classList.remove("hidden");
        waitMsg.textContent = iAmBidder
          ? "Bid locked in — waiting for everyone else…"
          : "Waiting for bidders to lock in their bids…";
      }

      if (!blindListenersBound) {
        blindListenersBound = true;
        submitBtn.addEventListener("click", () => {
          if (submitBtn.disabled) return;
          submitBtn.disabled = true;
          rpSubmitBlindBid(code, latestRoom, myPlayer.id, blindInput.value);
        });
      }
    }
  }
}
