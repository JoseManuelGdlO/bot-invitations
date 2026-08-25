import { AiConfig, Faq, Template } from "../models/index.js";
import { asyncHandler } from "../utils/async.js";
import { requireEvent, requirePermission, PERMS } from "../services/access.service.js";
import { serializeAi, serializeFaq, serializeTemplate } from "../utils/serialize.js";

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
    "rules",
    "followUps",
  ];
  for (const key of allowed) {
    if (req.body?.[key] !== undefined) ai[key] = req.body[key];
  }
  await ai.save();
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
