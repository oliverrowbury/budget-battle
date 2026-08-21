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

// Retriggers a CSS animation by toggling the class off then back on.
function rpPulseClass(el, className) {
  if (!el) return;
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
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
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
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
      tx.update(ref, { status: "finished", queueIndex: room.queue.length, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
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
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
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
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
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
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
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
    tx.update(ref, { round: { ...r, activeIds: newActiveIds, turnIndex: newTurnIndex }, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
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
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
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
    tx.update(ref, { round: { ...r, pendingSkip: { ...r.pendingSkip, responderQueue: newQueue } }, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
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
      tx.update(ref, { round: { ...r, bids: newBids }, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
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

    // Don't jump straight to the next item - hold on the reveal (everyone's
    // bids + the winner) for a beat first, otherwise the result flashes by
    // and it's unclear who actually won. rpAdvanceBlindReveal does the
    // actual transition after a client-side delay.
    tx.update(ref, {
      round: { ...r, bids: newBids, resolved: { winnerId, winnerAmount, bidLines, logText } },
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  });
}

// Performs the actual transition to the next round after a blind bid's
// reveal has been showing for a bit. Safe to call from multiple devices at
// once - once the first call advances the round away from this resolved
// blind round, every later call sees that and no-ops.
async function rpAdvanceBlindReveal(code) {
  const ref = db.collection("rooms").doc(code);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const room = snap.data();
    const r = room.round;
    if (!r || r.type !== "blind" || !r.resolved) return;
    const { winnerId, winnerAmount, logText } = r.resolved;
    tx.update(ref, rpComputeResolveUpdate(room, winnerId, winnerAmount, logText));
  });
}

// A left game can't continue — there's no rejoin flow, so leaving a
// two-player (or any) room would otherwise strand everyone else staring at
// a turn that will never come. Ending it for the whole room, clearly, is
// better than a silent hang.
async function rpLeaveGame(code, deviceId) {
  const ref = db.collection("rooms").doc(code);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const room = snap.data();
    if (room.status !== "lobby" && room.status !== "playing") return;
    const me = room.players.find((p) => p.deviceId === deviceId);
    const name = me ? me.name : "A player";
    const log = [`${name} left — the BidOff has been ended for everyone.`, ...(room.log || [])].slice(0, 40);
    tx.update(ref, { status: "aborted", round: null, log, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
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

// ---------- profanity filter ----------
// Chat messages are auto-censored client-side before being sent/stored.

const PROFANITY_WORDS = [
  "fuck", "shit", "bitch", "cunt", "bastard", "dick", "dickhead", "piss", "cock", "pussy",
  "nigger", "nigga", "faggot", "fag", "retard", "whore", "slut", "twat", "wanker", "bollocks",
  "motherfucker", "asshole", "dumbass", "jackass", "smartass", "rapist",
  "paki", "chink", "spic", "kike", "tranny", "coon",
];

const PROFANITY_REGEX = new RegExp("\\b(" + PROFANITY_WORDS.join("|") + ")\\w*\\b", "gi");

function censorProfanity(text) {
  return String(text).replace(PROFANITY_REGEX, (match) => match[0] + "*".repeat(match.length - 1));
}

// ---------- live chat ----------

function rpEscapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// How many chat messages this device has actually seen. Used to badge the
// toggle button with an unread count — the panel is closed by default and
// toggled the same way on every screen size.
let chatSeenCount = 0;
let chatLatestCount = 0;

function initChat(code, deviceId) {
  const toggleBtn = document.getElementById("chat-toggle-btn");
  const panel = document.getElementById("chat-panel");
  const closeBtn = document.getElementById("chat-close-btn");
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("chat-send-btn");
  const badge = document.getElementById("chat-badge");

  toggleBtn.classList.remove("hidden");
  panel.classList.remove("hidden");

  function markSeen() {
    chatSeenCount = chatLatestCount;
    if (badge) badge.classList.add("hidden");
  }

  // The floating toggle button sits top-right, same corner as the panel's
  // own close button once it's open - without hiding the toggle button
  // while open, it visually overlaps and swallows clicks meant for close.
  function setChatOpen(isOpen) {
    panel.classList.toggle("open", isOpen);
    toggleBtn.classList.toggle("hidden", isOpen);
    if (isOpen) markSeen();
  }

  toggleBtn.addEventListener("click", () => setChatOpen(!panel.classList.contains("open")));
  closeBtn.addEventListener("click", () => setChatOpen(false));

  function send() {
    const text = censorProfanity(input.value.trim().slice(0, 300));
    if (!text) return;
    input.value = "";
    const ref = db.collection("rooms").doc(code);
    db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const room = snap.data();
      const me = room.players.find((p) => p.deviceId === deviceId);
      const name = me ? me.name : "Spectator";
      // Capped, not just appended forever — an unbounded chat array would
      // eventually push the room document toward Firestore's 1MiB limit on
      // a long, chatty game and start silently failing every write to it.
      const newChat = [...(room.chat || []), { name, text, ts: Date.now(), senderId: me ? me.id : null }].slice(-200);
      tx.update(ref, { chat: newChat });
    });
  }

  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") send();
  });
}

function renderChat(room, myPlayer) {
  const el = document.getElementById("chat-messages");
  const panel = document.getElementById("chat-panel");
  const badge = document.getElementById("chat-badge");
  const chat = room.chat || [];
  chatLatestCount = chat.length;

  if (el) {
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    el.innerHTML = chat
      .map((m) => {
        const mine = myPlayer != null && m.senderId != null && m.senderId === myPlayer.id;
        // Your own messages are green, everyone else's are red - simple and
        // instant to tell apart, no need to track a color per person.
        const style = mine ? "" : ` style="color:#ff4757"`;
        const label = mine ? "You" : rpEscapeHtml(m.name);
        return `<div class="chat-msg${mine ? " mine" : ""}"><span class="who"${style}>${label}</span>${rpEscapeHtml(m.text)}</div>`;
      })
      .join("");
    if (atBottom) el.scrollTop = el.scrollHeight;
  }

  if (badge) {
    const panelOpen = panel && panel.classList.contains("open");
    if (panelOpen) chatSeenCount = chat.length;
    const unread = chat.length - chatSeenCount;
    if (!panelOpen && unread > 0) {
      badge.textContent = unread > 9 ? "9+" : String(unread);
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }
  }
}

// ---------- rendering ----------

function runRoomGame(code, isSpectator) {
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
  let blindRevealTimer = null;
  let finishedWired = false;
  let lastCurrentBid = null;
  let lastBidItemIndex = null;
  let lastLogFirst = null;
  let lastRenderedItemIndex = null;

  document.getElementById("room-name-field").classList.remove("hidden");
  document.getElementById("room-player-list").classList.remove("hidden");
  document.getElementById("lobby-copy-hint").textContent = "Share this room code so friends can join on their own phone — or just hit Start and pass this device around for anyone who isn't on their own device.";

  initChat(code, deviceId);

  const backLink = document.querySelector("a.back");
  if (backLink) {
    backLink.addEventListener("click", (e) => {
      const room = latestRoom;
      if (!room || (room.status !== "lobby" && room.status !== "playing")) return; // nothing live to end
      const iAmPlayer = room.players.some((p) => p.deviceId === deviceId);
      if (!iAmPlayer) return; // spectating - just navigate normally, nothing to end
      e.preventDefault();
      e.stopImmediatePropagation();
      const href = backLink.getAttribute("href");
      const goBack = () => {
        if (typeof window.bidoffNavigate === "function") window.bidoffNavigate(href);
        else window.location.href = href;
      };
      if (room.players.length <= 1) {
        // Nobody else in the room yet — leaving doesn't strand anyone.
        rpLeaveGame(code, deviceId).catch(() => {}).then(goBack);
        return;
      }
      if (!confirm("Leaving now ends this BidOff for everyone still in it — they won't be able to continue. Leave anyway?")) return;
      rpLeaveGame(code, deviceId).catch(() => {}).then(goBack);
    });
  }

  if (isSpectator) {
    document.getElementById("room-name-field").classList.add("hidden");
  }

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
      if (!isSpectator && !myPlayer && !joined && room.status === "lobby" && room.players.length < room.numPlayers) {
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
    renderChat(room, myPlayer);
    document.getElementById("game-title").textContent = room.gameKey;
    document.getElementById("game-subtitle").textContent =
      `${room.numPlayers} players · $${room.budget} budget · ${room.auctionType === "blind" ? "Blind Bid" : "Open Bid"}`;

    document.getElementById("code-badge").classList.remove("hidden");
    document.getElementById("code-value").textContent = code;
    document.getElementById("invite-links-row").classList.remove("hidden");
    document.getElementById("spectator-badge").classList.toggle("hidden", !isSpectator);
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
    if (!document.getElementById("copy-spectator-btn").dataset.wired) {
      document.getElementById("copy-spectator-btn").dataset.wired = "1";
      document.getElementById("copy-spectator-btn").addEventListener("click", () => {
        const link = `${window.location.href.split("?")[0]}?room=${code}&spectate=1`;
        const btn = document.getElementById("copy-spectator-btn");
        const done = () => { btn.textContent = "Copied!"; setTimeout(() => { btn.textContent = "👀 Copy spectator link"; }, 1500); };
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

      // Nothing actionable to show (the sole remaining player is broke, or
      // momentarily has nothing left they can bid on) — whichever device is
      // actually open paces through the remaining picks one at a time. Not
      // gated to the host: the host is often the player who just finished
      // their roster and has put their phone away, so relying on only their
      // tab to drive this forward left the other player stuck staring at a
      // frozen screen. The transaction inside rpAutoCompleteStep makes it
      // safe for multiple devices to attempt this at once.
      if (!room.round && !autoStepTimer) {
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
    } else if (room.status === "aborted") {
      lobbyView.classList.add("hidden");
      gameView.classList.add("hidden");
      resultsView.classList.add("hidden");
      const abortedView = document.getElementById("aborted-view");
      abortedView.classList.remove("hidden");
      document.getElementById("aborted-msg").textContent = room.log[0] || "This BidOff was ended early — a player left.";
    }
  }

  function renderLobby(room, myPlayer) {
    errorView.classList.add("hidden");
    lobbyView.classList.remove("hidden");
    gameView.classList.add("hidden");
    resultsView.classList.add("hidden");

    const list = document.getElementById("room-player-list");
    list.innerHTML = room.players
      .map((p) => `<div style="padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.06);">${rpEscapeHtml(p.name)}${p.deviceId === deviceId ? " (you)" : ""}</div>`)
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
    board.innerHTML = room.players.map((p) => {
      const pct = Math.min(100, Math.round((p.roster.length / room.totalSlotsPerPlayer) * 100));
      return `
      <div class="player-chip${p.id === activeId ? " active" : ""}">
        <div class="avatar">${rpEscapeHtml(p.name.trim().charAt(0).toUpperCase() || "?")}</div>
        <div class="name">${rpEscapeHtml(p.name)}${p.deviceId === deviceId ? " (you)" : ""}</div>
        <div class="budget">${p.budget}</div>
        <div class="roster-bar"><div class="roster-bar-fill" style="width:${pct}%"></div></div>
        <div class="roster-count">${p.roster.length}/${room.totalSlotsPerPlayer} picked</div>
      </div>
    `;
    }).join("");
  }

  function rosterItemsHtml(p, room) {
    const items = p.roster
      .map((r) => `<li>${r.name}${r.position ? `<span class="pos">${r.position} · $${r.price}</span>` : `<span class="pos">$${r.price}</span>`}</li>`)
      .join("");
    const emptyCount = Math.max(0, room.totalSlotsPerPlayer - p.roster.length);
    const empties = Array.from({ length: emptyCount }, () => `<li class="empty-slot">Empty slot</li>`).join("");
    return items + empties;
  }

  function renderRosters(room) {
    document.getElementById("rosters").innerHTML = room.players.map((p) => `
      <div class="roster-card">
        <h3>${rpEscapeHtml(p.name)}</h3>
        <div class="spent">$${p.spent} spent</div>
        <ul>${rosterItemsHtml(p, room)}</ul>
      </div>
    `).join("");
  }

  function renderFinalRosters(room) {
    document.getElementById("final-rosters").innerHTML = room.players.map((p) => `
      <div class="roster-card">
        <h3>${rpEscapeHtml(p.name)}</h3>
        <div class="spent">$${p.spent} spent · $${p.budget} left</div>
        <ul>${rosterItemsHtml(p, room)}</ul>
      </div>
    `).join("");
  }

  function renderRound(room, myPlayer) {
    const log = document.getElementById("log");
    log.innerHTML = room.log.map((line) => `<div>${rpEscapeHtml(line)}</div>`).join("");

    if (room.log[0] && room.log[0] !== lastLogFirst) {
      if (lastLogFirst !== null) rpPulseClass(document.getElementById("auction-card"), "win-flash");
      lastLogFirst = room.log[0];
    }

    const r = room.round;
    document.getElementById("wrapping-up-msg").classList.toggle("hidden", !!r);
    if (!r) {
      document.getElementById("open-bid-area").classList.add("hidden");
      document.getElementById("pass-screen").classList.add("hidden");
      return;
    }

    document.getElementById("item-name").textContent = r.item.name;
    document.getElementById("item-position").textContent = r.item.position || "";
    if (r.itemIndex !== lastRenderedItemIndex) {
      if (lastRenderedItemIndex !== null) rpPulseClass(document.querySelector(".up-for-bid"), "item-swap");
      lastRenderedItemIndex = r.itemIndex;
    }

    const myControlled = rpControlledIds(room, deviceId);

    if (r.type === "open") {
      document.getElementById("round-label").textContent = "Up for bid — Open Auction";
      document.getElementById("open-bid-area").classList.remove("hidden");
      document.getElementById("pass-screen").classList.add("hidden");

      const bidInput = document.getElementById("bid-input");
      const placeBidBtn = document.getElementById("place-bid-btn");
      const passBtn = document.getElementById("pass-btn");
      const skipBtn = document.getElementById("skip-btn");

      if (r.itemIndex === lastBidItemIndex && r.currentBid !== lastCurrentBid) {
        rpPulseClass(document.getElementById("current-bid-amount"), "bid-pulse");
      }
      lastBidItemIndex = r.itemIndex;
      lastCurrentBid = r.currentBid;

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

      const blindControls = document.getElementById("blind-bid-controls");
      const waitMsg = document.getElementById("blind-wait-msg");
      const blindInput = document.getElementById("blind-bid-input");
      const submitBtn = document.getElementById("submit-blind-bid-btn");
      const revealList = document.getElementById("blind-reveal-list");

      if (r.resolved) {
        // Hold on the reveal instead of cutting straight to the next item -
        // everyone gets to see who bid what and who actually won.
        const { winnerId, winnerAmount } = r.resolved;
        const winner = winnerId != null ? room.players.find((p) => p.id === winnerId) : null;

        document.getElementById("pass-screen-label").textContent = "Bids revealed!";
        document.getElementById("pass-player-name").textContent = "";
        document.getElementById("pass-screen-hint").textContent = winner
          ? `${winner.name} wins ${r.item.name} for $${winnerAmount}!`
          : `${r.item.name} goes unsold — nobody bid.`;

        revealList.classList.remove("hidden");
        revealList.innerHTML = r.bidderIds.map((id) => {
          const p = room.players.find((pp) => pp.id === id);
          const amt = r.bids[id];
          const isWinner = id === winnerId;
          return `<li style="display:flex; justify-content:space-between; padding:8px 12px; border-radius:10px; background:${isWinner ? "rgba(240,180,41,0.14)" : "rgba(255,255,255,0.04)"}; ${isWinner ? "border:1px solid rgba(240,180,41,0.4);" : ""}">
            <span style="color:${isWinner ? "#f0b429" : "#c9c4dd"}; font-weight:${isWinner ? "700" : "500"};">${rpEscapeHtml(p ? p.name : "?")}${isWinner ? " 🏆" : ""}</span>
            <span style="color:${isWinner ? "#f0b429" : "#c9c4dd"}; font-weight:${isWinner ? "700" : "500"};">$${amt}</span>
          </li>`;
        }).join("");

        blindControls.classList.add("hidden");
        waitMsg.classList.add("hidden");

        if (!blindRevealTimer) {
          blindRevealTimer = setTimeout(() => {
            blindRevealTimer = null;
            rpAdvanceBlindReveal(code);
          }, 2600);
        }
      } else {
        revealList.classList.add("hidden");
        revealList.innerHTML = "";

        const myPendingIds = r.bidderIds.filter((id) => myControlled.includes(id) && (r.bids[id] === null || r.bids[id] === undefined));
        const actingId = myPendingIds.length > 0 ? myPendingIds[0] : null;
        const actingPlayer = actingId != null ? room.players.find((p) => p.id === actingId) : null;
        const iAmBidder = actingId != null;
        const iHaveSubmitted = !iAmBidder;
        const submittedCount = r.bidderIds.filter((id) => r.bids[id] !== null && r.bids[id] !== undefined).length;
        // Once someone's filled a position's quota (or gone broke, or filled their
        // roster) they drop out of bidderIds for items only they were excluded
        // from — leaving a genuine solo round with nobody to bid against. Real,
        // not a bug, but "0/1 locked in" alone reads as broken, so spell it out.
        const soloRound = r.bidderIds.length === 1;

        document.getElementById("pass-screen-label").textContent = actingPlayer && actingPlayer.deviceId !== deviceId ? "Pass the device to" : "Your secret bid";
        document.getElementById("pass-player-name").textContent = actingPlayer ? actingPlayer.name : "";
        document.getElementById("pass-screen-hint").textContent = soloRound
          ? "Nobody else can use this one right now (position filled, roster full, or broke) — no competition, just set your price."
          : `${submittedCount}/${r.bidderIds.length} players have locked in a bid.`;

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
          waitMsg.textContent = soloRound
            ? `Only ${actingPlayer ? actingPlayer.name : "the other player"} can use this one — nothing to do here, it'll move on automatically.`
            : haveLockedIn
              ? "Your bid is locked in — waiting for everyone else…"
              : "Waiting for bidders to lock in their bids…";
        }
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
