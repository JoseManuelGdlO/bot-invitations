import OpenAI from "openai";
import { env } from "../../config/env.js";
import { httpError } from "../../utils/http-error.js";
import { BOT_TOOLS, RESPONSE_SCHEMA, sortFunctionCalls } from "./tools.js";

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

function parseReply(response) {
  const raw = extractResponseText(response);
  if (!raw) {
    return "Lo siento, no pude generar una respuesta. ¿Puedes intentar de nuevo?";
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.reply === "string") return parsed.reply;
  } catch {
    /* texto plano */
  }
  return raw;
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

export async function processTurn({ instructions, items, executeTool, refreshLock }) {
  const openai = getClient();
  const tools = normalizeToolsForResponses(BOT_TOOLS);
  let loops = 0;
  let finalResponse = null;
  let forcedReply = null;
  const toolTrace = [];
  const nextItems = Array.isArray(items) ? [...items] : [];

  while (loops < MAX_TOOL_LOOPS) {
    loops += 1;
    if (typeof refreshLock === "function") await refreshLock();
    const lockTools = loops >= MAX_TOOL_LOOPS;
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
      nextItems.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result),
      });
      if (result?.useAsReply && result?.text) {
        forcedReply = String(result.text);
      }
    }
    if (forcedReply) break;
  }

  if (forcedReply) {
    nextItems.push({ type: "message", role: "assistant", content: forcedReply });
    return { reply: forcedReply, items: nextItems, tools: toolTrace };
  }

  if (finalResponse && !extractResponseText(finalResponse)) {
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
      }
    } catch (err) {
      console.error("[bot] cierre sin tools:", err.message);
    }
  }

  const reply = finalResponse
    ? parseReply(finalResponse)
    : "Hubo un error procesando tu mensaje. Intenta de nuevo.";
  return { reply, items: nextItems, tools: toolTrace };
}
