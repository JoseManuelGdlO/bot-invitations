import { asyncHandler } from "../utils/async.js";
import { answerHelp, helpSuggestions } from "../services/help-bot.service.js";

export const suggestions = asyncHandler(async (_req, res) => {
  res.json({ suggestions: helpSuggestions() });
});

export const chat = asyncHandler(async (req, res) => {
  const message = String(req.body?.message || "").trim();
  if (message.length > 500) {
    return res.status(400).json({ error: "Escribe una pregunta más corta." });
  }
  res.json(answerHelp(message, req.user));
});
