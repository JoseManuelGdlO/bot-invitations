import { AiConfig, Faq, Template } from "../models/index.js";
import { saveOpeningDocument, getOpeningDocumentFile } from "../services/opening-document.service.js";
import { asyncHandler } from "../utils/async.js";
import { requireEvent, requirePermission, PERMS } from "../services/access.service.js";
import { serializeAi, serializeFaq, serializeTemplate } from "../utils/serialize.js";
import { defaultPrompt } from "../services/bot/prompt.service.js";
import { resetPlaygroundSessions } from "../services/bot/session.service.js";
import { ensureAiConfig } from "../services/event-setup.service.js";
import { normalizeFollowUps } from "../services/follow-up.service.js";
import {
  aiConfigDefaultsSnapshot,
  DEFAULT_AI_TONE,
  defaultConversationRules,
  mergeConversationRules,
  normalizeGreetingVar,
} from "../utils/defaults.js";

export const getAi = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  const ai = await AiConfig.findOne({ where: { eventId: event.id } });
  res.json(ai ? serializeAi(ai) : null);
});

export const getAiDefaults = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  if (!(await requirePermission(req, res, event, PERMS.CONFIG_AI))) return;
  res.json(aiConfigDefaultsSnapshot());
});

export const updateAi = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  if (!(await requirePermission(req, res, event, PERMS.CONFIG_AI))) return;
  const ai = await ensureAiConfig(event);
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
  if (req.body?.followUps !== undefined) {
    const followUps = normalizeFollowUps(req.body.followUps);
    if (!followUps) return res.status(400).json({ error: "Se esperaba un arreglo de reglas de seguimiento." });
    req.body.followUps = followUps;
  }
  if (req.body?.rules !== undefined) {
    if (!Array.isArray(req.body.rules)) {
      return res.status(400).json({ error: "Se esperaba un arreglo de reglas de conversación." });
    }
    req.body.rules = mergeConversationRules(req.body.rules);
  }
  const personalityKeys = ["assistantName", "tone", "formality", "emojis", "length", "rules"];
  const personalityChanged = personalityKeys.some((key) => {
    if (req.body?.[key] === undefined) return false;
    if (key === "rules") return JSON.stringify(req.body.rules ?? []) !== JSON.stringify(ai.rules ?? []);
    return String(req.body[key]) !== String(ai[key] ?? "");
  });
  for (const key of allowed) {
    if (req.body?.[key] !== undefined) ai[key] = req.body[key];
  }
  await ai.save();
  if (promptChanged || personalityChanged) {
    await resetPlaygroundSessions(event.id);
  }
  res.json(serializeAi(ai));
});

export const resetAi = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  if (!(await requirePermission(req, res, event, PERMS.CONFIG_AI))) return;
  const ai = await ensureAiConfig(event);
  ai.tone = DEFAULT_AI_TONE.tone;
  ai.formality = DEFAULT_AI_TONE.formality;
  ai.emojis = DEFAULT_AI_TONE.emojis;
  ai.length = DEFAULT_AI_TONE.length;
  ai.rules = defaultConversationRules();
  ai.prompt = "";
  await ai.save();
  await resetPlaygroundSessions(event.id);
  res.json(serializeAi(ai));
});

export const regeneratePrompt = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  const ai = await ensureAiConfig(event);
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
  const existing = await Template.findAll({ where: { eventId: event.id } });
  const existingByCategory = new Map(existing.map((row) => [row.category, row]));
  await Template.destroy({ where: { eventId: event.id } });
  const created = await Template.bulkCreate(
    incoming.map((t) => {
      const category = t.category;
      const isOpening = category === "Primer contacto";
      const prev = existingByCategory.get(category);
      return {
        id: t.id && String(t.id).length === 36 ? t.id : undefined,
        eventId: event.id,
        category,
        title: t.title,
        body: t.body,
        greetingVar: isOpening ? normalizeGreetingVar(t.greetingVar) : "nombre",
        attachDocument: isOpening ? Boolean(t.attachDocument) : false,
        documentPath: isOpening ? prev?.documentPath || null : null,
        documentFileName: isOpening ? prev?.documentFileName || null : null,
        documentMime: isOpening ? prev?.documentMime || null : null,
        documentSize: isOpening ? prev?.documentSize ?? null : null,
      };
    }),
  );
  res.json(created.map(serializeTemplate));
});

export const uploadOpeningDocument = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  if (!(await requirePermission(req, res, event, PERMS.CONFIG_AI))) return;
  res.json(await saveOpeningDocument(event, req.file));
});

export const downloadOpeningDocument = asyncHandler(async (req, res) => {
  const event = await requireEvent(req, res);
  if (!event) return;
  if (!(await requirePermission(req, res, event, PERMS.CONFIG_AI))) return;
  const stored = await getOpeningDocumentFile(event);
  res.setHeader("Content-Type", stored.mime);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename*=UTF-8''${encodeURIComponent(stored.fileName)}`,
  );
  res.sendFile(stored.absolutePath);
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
