// Shared helpers for creating/joining live multiplayer BidOff rooms in Firestore.

function getDeviceId() {
  let id = localStorage.getItem("bidoffDeviceId");
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    localStorage.setItem("bidoffDeviceId", id);
  }
  return id;
}

function randomRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function buildPool(gameKey) {
  const rawPool = gamePools[gameKey];
  const isPositional = typeof rawPool[0] === "object";
  return rawPool.map((item) =>
    isPositional ? { name: item.name, position: item.position } : { name: item, position: null }
  );
}

async function createRoom(cfg) {
  const deviceId = getDeviceId();

  let code = randomRoomCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const snap = await db.collection("rooms").doc(code).get();
    if (!snap.exists) break;
    code = randomRoomCode();
  }

  const pool = buildPool(cfg.game);
  const slotRequirement = (typeof gameSlots !== "undefined" && gameSlots[cfg.game]) || null;
  const caps = (typeof categoryCaps !== "undefined" && categoryCaps[cfg.game]) || null;
  const totalSlotsPerPlayer = slotRequirement
    ? Object.values(slotRequirement).reduce((a, b) => a + b, 0)
    : cfg.slots;

  const room = {
    gameKey: cfg.game,
    auctionType: cfg.auction,
    budget: cfg.budget,
    numPlayers: cfg.players,
    slotRequirement,
    caps,
    totalSlotsPerPlayer,
    pool,
    hostDeviceId: deviceId,
    status: "lobby",
    skipAvailable: true,
    skipRestrictedTo: null,
    players: [
      {
        id: 0,
        deviceId,
        name: "Player 1",
        budget: cfg.budget,
        roster: [],
        spent: 0,
        needs: slotRequirement ? { ...slotRequirement } : null,
        capsRemaining: caps ? { ...caps } : null,
      },
    ],
    queue: null,
    queueIndex: 0,
    turnPointer: 0,
    round: null,
    log: [],
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };

  await db.collection("rooms").doc(code).set(room);
  return code;
}

async function joinRoom(rawCode) {
  const code = String(rawCode || "").trim().toUpperCase();
  const deviceId = getDeviceId();
  const ref = db.collection("rooms").doc(code);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error("NOT_FOUND");
    const room = snap.data();

    if (room.players.some((p) => p.deviceId === deviceId)) return; // already joined, just resume

    if (room.status !== "lobby") throw new Error("ALREADY_STARTED");
    if (room.players.length >= room.numPlayers) throw new Error("FULL");

    const id = room.players.length;
    const newPlayer = {
      id,
      deviceId,
      name: `Player ${id + 1}`,
      budget: room.budget,
      roster: [],
      spent: 0,
      needs: room.slotRequirement ? { ...room.slotRequirement } : null,
      capsRemaining: room.caps ? { ...room.caps } : null,
    };
    tx.update(ref, { players: [...room.players, newPlayer] });
  });

  return code;
}
