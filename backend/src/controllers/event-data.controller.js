import { AiConfig, Faq, Template } from "../models/index.js";
import { asyncHandler } from "../utils/async.js";
import { requireEvent, requirePermission, PERMS } from "../services/access.service.js";
import { serializeAi, serializeFaq, serializeTemplate } from "../utils/serialize.js";
import { defaultPrompt } from "../services/bot/prompt.service.js";
import { resetPlaygroundSessions } from "../services/bot/session.service.js";
import { normalizeFollowUps } from "../services/follow-up.service.js";

export const getAi = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  const ai = await AiConfig.findOne({ where: { eventId: event.id } });
  res.json(ai ? serializeAi(ai) : null);
});

export const updateAi = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  if (!(await requirePermission(req, res, event, PERMS.CONFIG_AI))) return;
  const ai = await AiConfig.findOne({ where: { eventId: event.id } });
  if (!ai) return res.status(404).json({ error: "Configuración de IA no encontrada." });
  const allowed = [
    "assistantName",
    "tone",
    "formality",
    "emojis",
    "length",
    "openingMessage",
    "prompt",
    "rules",
    "followUps",
  ];
  const promptChanged = req.body?.prompt !== undefined && String(req.body.prompt) !== String(ai.prompt || "");
  const personalityKeys = ["assistantName", "tone", "formality", "emojis", "length", "rules"];
  const personalityChanged = personalityKeys.some((key) => {
    if (req.body?.[key] === undefined) return false;
    if (key === "rules") return JSON.stringify(req.body.rules ?? []) !== JSON.stringify(ai.rules ?? []);
    return String(req.body[key]) !== String(ai[key] ?? "");
  });
  if (req.body?.followUps !== undefined) {
    const followUps = normalizeFollowUps(req.body.followUps);
    if (!followUps) return res.status(400).json({ error: "Se esperaba un arreglo de reglas de seguimiento." });
    req.body.followUps = followUps;
  }
  for (const key of allowed) {
    if (req.body?.[key] !== undefined) ai[key] = req.body[key];
  }
  await ai.save();
  if (promptChanged || personalityChanged) {
    await resetPlaygroundSessions(event.id);
  }
  res.json(serializeAi(ai));
});

export const regeneratePrompt = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  const ai = await AiConfig.findOne({ where: { eventId: event.id } });
  if (!ai) return res.status(404).json({ error: "Configuración de IA no encontrada." });
  ai.prompt = defaultPrompt(ai);
  await ai.save();
  await resetPlaygroundSessions(event.id);
  res.json(serializeAi(ai));
});

export const setTemplates = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  if (!(await requirePermission(req, res, event, PERMS.CONFIG_AI))) return;
  const incoming = Array.isArray(req.body) ? req.body : req.body?.templates;
  if (!Array.isArray(incoming)) return res.status(400).json({ error: "Se esperaba un arreglo de plantillas." });
  await Template.destroy({ where: { eventId: event.id } });
  const created = await Template.bulkCreate(
    incoming.map((t) => ({
      id: t.id && String(t.id).length === 36 ? t.id : undefined,
      eventId: event.id,
      category: t.category,
      title: t.title,
      body: t.body,
    })),
  );
  res.json(created.map(serializeTemplate));
});

export const setFaqs = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  if (!(await requirePermission(req, res, event, PERMS.CONFIG_AI))) return;
  const incoming = Array.isArray(req.body) ? req.body : req.body?.faqs;
  if (!Array.isArray(incoming)) return res.status(400).json({ error: "Se esperaba un arreglo de FAQs." });
  await Faq.destroy({ where: { eventId: event.id } });
  const created = await Faq.bulkCreate(
    incoming.map((f) => ({
      id: f.id && String(f.id).length === 36 ? f.id : undefined,
      eventId: event.id,
      q: f.q,
      a: f.a,
    })),
  );
  res.json(created.map(serializeFaq));
});
