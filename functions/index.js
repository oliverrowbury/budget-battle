const functions = require("firebase-functions");
const { defineSecret } = require("firebase-functions/params");

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

exports.judgeSquads = functions
  .runWith({ secrets: [ANTHROPIC_API_KEY] })
  .https.onRequest(async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Methods", "POST");
      res.set("Access-Control-Allow-Headers", "Content-Type");
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    const { gameKey, players } = req.body || {};
    if (!gameKey || !Array.isArray(players) || players.length < 2) {
      res.status(400).json({ error: "Missing gameKey or players" });
      return;
    }

    const squadText = players
      .map((p) => {
        const items = (p.roster || [])
          .map((r) => `  - ${r.name}${r.position ? ` (${r.position})` : ""} — $${r.price}`)
          .join("\n");
        return `${p.name} — $${p.spent} spent:\n${items || "  (empty squad)"}`;
      })
      .join("\n\n");

    const prompt = `You are judging a "BidOff" party game called "${gameKey}". Each player drafted a squad by bidding a shared budget on items from this category. Judge purely on which squad is better/stronger/funnier for this specific category — not on who spent more money.

${squadText}

Reply with ONLY a JSON object, no other text, no markdown fences: {"winner": "<exact player name from above>", "reason": "<one or two punchy sentences explaining why, written like a hype sports commentator>"}`;

    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY.value(),
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 300,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error("Anthropic API error:", resp.status, errText);
        res.status(502).json({ error: "AI judge unavailable" });
        return;
      }

      const data = await resp.json();
      const text = data.content && data.content[0] && data.content[0].text ? data.content[0].text : "";

      let verdict;
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        verdict = JSON.parse(jsonMatch ? jsonMatch[0] : text);
      } catch (e) {
        verdict = { winner: null, reason: text.slice(0, 300) };
      }

      res.status(200).json(verdict);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal error" });
    }
  });
