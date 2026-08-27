import OpenAI from "openai";
import { env } from "../../config/env.js";
import { httpError } from "../../utils/http-error.js";
import { botLog, botWarn } from "./bot-logger.js";
import { BOT_TOOLS, INTENT_LABELS, RESPONSE_SCHEMA, sortFunctionCalls } from "./tools.js";

const MAX_HISTORY_ITEMS = 40;
const MAX_TOOL_LOOPS = 3;

let client = null;

function getClient() {
  if (!env.openai.apiKey) {
    throw httpError(503, "OPENAI_API_KEY no está configurada.");
  }
  if (!client) {
    client = new OpenAI({ apiKey: env.openai.apiKey });
  }
  return client;
}

export function dropIncompleteToolCalls(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return Array.isArray(items) ? items : [];
  }
  const callIdsWithOutput = new Set();
  for (const item of items) {
    if (item?.type === "function_call_output" && item.call_id) {
      callIdsWithOutput.add(item.call_id);
    }
  }
  return items.filter((item) => {
    if (item?.type === "function_call" && item.call_id && !callIdsWithOutput.has(item.call_id)) {
      return false;
    }
    return true;
  });
}

export function trimHistoryItems(items, maxItems = MAX_HISTORY_ITEMS) {
  if (!Array.isArray(items) || items.length <= maxItems) {
    return Array.isArray(items) ? items : [];
  }
  let start = items.length - maxItems;
  while (start > 0 && items[start]?.type === "function_call_output") {
    start -= 1;
  }
  while (start < items.length && items[start]?.type === "function_call_output") {
    start += 1;
  }
  return items.slice(start);
}

export function extractMessageText(item) {
  if (!item) return "";
  if (typeof item.content === "string") return item.content;
  if (!Array.isArray(item.content)) return "";
  return item.content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part?.type === "output_text" || part?.type === "text") return part.text || "";
      return "";
    })
    .join("")
    .trim();
}

/** Extrae `reply` del json_schema del modelo (el WhatsApp real no debe llevar el envoltorio). */
export function unwrapReplyText(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.reply === "string") return parsed.reply.trim();
  } catch {
    /* texto plano */
  }
  return text;
}

export function parseStructuredReply(raw) {
  const text = String(raw || "").trim();
  if (!text) return { reply: null, intent: null };
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") return { reply: text, intent: null };
    return {
      reply: typeof parsed.reply === "string" ? parsed.reply.trim() : null,
      intent: typeof parsed.intent === "string" ? parsed.intent.trim() : null,
    };
  } catch {
    return { reply: text, intent: null };
  }
}

export function inferIntentFromTools(tools = []) {
  for (const tool of tools) {
    if (tool?.name === "marcar_seguimiento") return "seguimiento";
    if (tool?.name === "actualizar_confirmacion") {
      return tool?.arguments?.status === "no_asistira" ? "no_asistira" : "asistira";
    }
  }
  return null;
}

/** Logs legibles para el playground de desarrollo. */
export function buildPlaygroundLogs({ intent = null, tools = [] } = {}) {
  const logs = [];
  const resolved = intent || inferIntentFromTools(tools);
  if (resolved) {
    logs.push({
      kind: "intent",
      label: INTENT_LABELS[resolved] || resolved,
      value: resolved,
      detail: "",
    });
  }
  if (resolved === "faq") {
    logs.push({
      kind: "faq",
      label: "Respondió FAQ / info del evento",
      value: "faq",
      detail: "Sin tool: texto libre según FAQs/plantillas de información",
    });
  }
  for (const tool of tools) {
    if (!tool?.name) continue;
    if (tool.name === "actualizar_confirmacion") {
      const status = tool.arguments?.status || tool.result?.status || "";
      const confirmed = tool.arguments?.confirmed ?? tool.result?.confirmed;
      logs.push({
        kind: "tool",
        label: "actualizar_confirmacion",
        value: status,
        detail: [status, confirmed != null ? `${confirmed} personas` : null].filter(Boolean).join(" · "),
      });
      continue;
    }
    if (tool.name === "marcar_seguimiento") {
      logs.push({
        kind: "tool",
        label: "marcar_seguimiento",
        value: "seguimiento",
        detail: tool.arguments?.reason || tool.result?.followUp || "recontacto de seguimiento",
      });
      continue;
    }
    if (tool.name === "usar_plantilla") {
      const category = tool.result?.category || tool.arguments?.category || "plantilla";
      logs.push({
        kind: "template",
        label: `Plantilla · ${category}`,
        value: category,
        detail: tool.result?.title || "",
      });
    }
  }
  return logs;
}

export function serializeOutputItem(item) {
  if (!item || !item.type) return null;
  if (item.type === "function_call") {
    return {
      type: "function_call",
      call_id: item.call_id,
      name: item.name,
      arguments: item.arguments,
    };
  }
  if (item.type === "message") {
    return {
      type: "message",
      role: item.role || "assistant",
      content: extractMessageText(item),
    };
  }
  return null;
}

export function itemsToChat(items) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item?.type === "message")
    .map((item) => ({
      role: item.role === "user" ? "user" : "assistant",
      text: typeof item.content === "string" ? item.content : extractMessageText(item),
    }))
    .filter((row) => row.text);
}

function extractResponseText(response) {
  if (!response) return "";
  return (
    response.output_text ||
    (response.output || [])
      .filter((item) => item.type === "message")
      .map((item) => extractMessageText(item))
      .join("")
      .trim()
  );
}

export function extraReplyFromResponse(response) {
  return unwrapReplyText(extractResponseText(response));
}

export function combineTemplateReply(template, extra) {
  const base = String(template || "").trim();
  const more = String(extra || "").trim();
  if (!base) return more;
  if (!more || more === base) return base;
  return `${base}\n\n${more}`;
}

function parseReply(response) {
  const raw = extractResponseText(response);
  if (!raw) {
    return "Lo siento, no pude generar una respuesta. ¿Puedes intentar de nuevo?";
  }
  return unwrapReplyText(raw);
}

function parseIntent(response) {
  return parseStructuredReply(extractResponseText(response)).intent;
}

function makeJsonSchemaNullable(schema) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return { type: ["string", "null"] };
  }
  const next = { ...schema };
  if (Array.isArray(next.type)) {
    if (!next.type.includes("null")) next.type = [...next.type, "null"];
  } else if (typeof next.type === "string") {
    next.type = [next.type, "null"];
  } else {
    next.type = ["string", "null"];
  }
  return next;
}

function normalizeToolsForResponses(tools) {
  if (!Array.isArray(tools)) return [];
  return tools.map((tool) => {
    if (!tool || tool.type !== "function" || !tool.parameters || typeof tool.parameters !== "object") {
      return tool;
    }
    if (tool.strict !== true) return tool;
    const properties =
      tool.parameters.properties && typeof tool.parameters.properties === "object"
        ? { ...tool.parameters.properties }
        : {};
    const required = Array.isArray(tool.parameters.required) ? [...tool.parameters.required] : [];
    for (const key of Object.keys(properties)) {
      if (required.includes(key)) continue;
      required.push(key);
      properties[key] = makeJsonSchemaNullable(properties[key]);
    }
    return {
      ...tool,
      parameters: {
        ...tool.parameters,
        properties,
        required,
        additionalProperties:
          tool.parameters.additionalProperties === undefined ? false : tool.parameters.additionalProperties,
      },
    };
  });
}

function buildResponsesRequest({ instructions, items, tools, toolChoice = null }) {
  const request = {
    model: env.openai.model,
    instructions,
    input: items,
    store: false,
    tools: tools && tools.length ? tools : undefined,
    text: {
      format: {
        type: "json_schema",
        name: "whatsapp_reply",
        strict: true,
        schema: RESPONSE_SCHEMA,
      },
    },
  };
  if (toolChoice && tools && tools.length) {
    request.tool_choice = toolChoice;
  }
  return request;
}

export async function processTurn({ instructions, items, executeTool, refreshLock, context = {} }) {
  const openai = getClient();
  const tools = normalizeToolsForResponses(BOT_TOOLS);
  let loops = 0;
  let finalResponse = null;
  let forcedReply = null;
  let forcedExtra = "";
  const toolTrace = [];
  const nextItems = Array.isArray(items) ? [...items] : [];

  while (loops < MAX_TOOL_LOOPS) {
    loops += 1;
    if (typeof refreshLock === "function") await refreshLock();
    const lockTools = loops >= MAX_TOOL_LOOPS;
    botLog("modelo llamada", {
      loop: loops,
      maxLoops: MAX_TOOL_LOOPS,
      toolsLocked: lockTools,
      historyItems: nextItems.length,
      eventId: context.event?.id,
      guestId: context.guest?.id,
    });
    const response = await openai.responses.create(
      buildResponsesRequest({
        instructions,
        items: nextItems,
        tools: lockTools ? [] : tools,
      }),
    );
    finalResponse = response;
    const output = Array.isArray(response.output) ? response.output : [];
    const functionCalls = output.filter((item) => item.type === "function_call");
    const raw = extractResponseText(response);
    const structured = parseStructuredReply(raw);
    if (structured.intent || structured.reply) {
      botLog("modelo respuesta", {
        loop: loops,
        intent: structured.intent,
        intentLabel: structured.intent ? INTENT_LABELS[structured.intent] || structured.intent : null,
        raw: raw.slice(0, 400),
        toolCalls: functionCalls.map((c) => c.name),
      });
    }
    for (const item of output) {
      const serialized = serializeOutputItem(item);
      if (serialized) nextItems.push(serialized);
    }
    if (!functionCalls.length) break;
    for (const call of sortFunctionCalls(functionCalls)) {
      const result = await executeTool(call);
      let args = {};
      try {
        args = JSON.parse(call.arguments || "{}");
      } catch {
        args = {};
      }
      toolTrace.push({ name: call.name, arguments: args, result });
      botLog("tool ejecutada", {
        name: call.name,
        arguments: args,
        success: result?.success !== false,
        useAsReply: Boolean(result?.useAsReply),
        category: result?.category || null,
      });
      nextItems.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result),
      });
      if (result?.useAsReply && result?.text) {
        forcedReply = String(result.text);
        forcedExtra = extraReplyFromResponse(response);
      }
    }
    if (forcedReply) break;
  }

  if (forcedReply) {
    const combined = combineTemplateReply(forcedReply, forcedExtra);
    nextItems.push({ type: "message", role: "assistant", content: combined });
    const intent = parseIntent(finalResponse) || inferIntentFromTools(toolTrace);
    const logs = buildPlaygroundLogs({ intent, tools: toolTrace });
    botLog("respuesta forzada por plantilla", {
      intent,
      intentLabel: intent ? INTENT_LABELS[intent] || intent : null,
      templatePreview: forcedReply.slice(0, 180),
      faqExtra: forcedExtra ? forcedExtra.slice(0, 180) : null,
      logs: logs.map((l) => `${l.kind}:${l.value || l.label}`),
    });
    return {
      reply: combined,
      intent,
      logs,
      items: nextItems,
      tools: toolTrace,
    };
  }

  if (finalResponse && !extractResponseText(finalResponse)) {
    botWarn("modelo sin texto; pidiendo cierre sin tools", {
      eventId: context.event?.id,
      guestId: context.guest?.id,
    });
    try {
      if (typeof refreshLock === "function") await refreshLock();
      const closing = await openai.responses.create(
        buildResponsesRequest({
          instructions,
          items: nextItems,
          tools: [],
        }),
      );
      if (extractResponseText(closing)) {
        finalResponse = closing;
        for (const item of closing.output || []) {
          const serialized = serializeOutputItem(item);
          if (serialized) nextItems.push(serialized);
        }
        const closingStructured = parseStructuredReply(extractResponseText(closing));
        botLog("cierre sin tools", {
          intent: closingStructured.intent,
          raw: extractResponseText(closing).slice(0, 400),
        });
      }
    } catch (err) {
      botWarn("cierre sin tools falló", { error: err.message });
    }
  }

  const reply = finalResponse
    ? parseReply(finalResponse)
    : "Hubo un error procesando tu mensaje. Intenta de nuevo.";
  const intent = (finalResponse && parseIntent(finalResponse)) || inferIntentFromTools(toolTrace);
  const logs = buildPlaygroundLogs({ intent, tools: toolTrace });
  if (intent === "faq") {
    botLog("FAQ respondida sin tool", {
      intent,
      replyPreview: reply.slice(0, 180),
    });
  }
  return {
    reply,
    intent,
    logs,
    items: nextItems,
    tools: toolTrace,
  };
}
