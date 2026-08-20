// Encodes/decodes a BidOff game config into a short shareable code.
// No backend: the code just packs the game settings (which pool, player
// count, auction type, budget, slots) so a friend's device can start the
// same configured game. It is NOT a live shared session — everyone still
// plays pass-the-device on whichever screen opens the code.

function encodeGameCode(cfg) {
  if (typeof gamePools === "undefined") return null;
  const keys = Object.keys(gamePools);
  const gameIndex = keys.indexOf(cfg.game);
  if (gameIndex < 0) return null;

  const auctionChar = cfg.auction === "open" ? "O" : "B";

  return (
    gameIndex.toString(36).toUpperCase().padStart(2, "0") +
    auctionChar +
    Number(cfg.players).toString(36).toUpperCase() +
    Number(cfg.budget).toString(36).toUpperCase().padStart(2, "0") +
    Number(cfg.slots).toString(36).toUpperCase()
  );
}

function decodeGameCode(rawCode) {
  if (typeof gamePools === "undefined") return null;
  const code = String(rawCode || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 7) return null;

  const keys = Object.keys(gamePools);
  const gameIndex = parseInt(code.slice(0, 2), 36);
  const auctionChar = code[2];
  const players = parseInt(code[3], 36);
  const budget = parseInt(code.slice(4, 6), 36);
  const slots = parseInt(code[6], 36);

  if (!Number.isInteger(gameIndex) || gameIndex < 0 || gameIndex >= keys.length) return null;
  const auction = auctionChar === "O" ? "open" : auctionChar === "B" ? "blind" : null;
  if (!auction) return null;
  if (!Number.isInteger(players) || players < 2 || players > 8) return null;
  if (!Number.isInteger(budget) || budget < 1) return null;
  if (!Number.isInteger(slots) || slots < 1) return null;

  return { game: keys[gameIndex], players, auction, budget, slots };
}
