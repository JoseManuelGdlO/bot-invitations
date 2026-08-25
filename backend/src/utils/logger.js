import { env } from "../config/env.js";

const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  info: "\x1b[36m",    // Cyan
  warn: "\x1b[33m",    // Amarillo
  error: "\x1b[31m",   // Rojo
  debug: "\x1b[35m",   // Magenta
};

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordhash",
  "token",
  "refreshtoken",
  "accesstoken",
  "authorization",
  "secret",
  "signature",
]);

function sanitize(data) {
  if (!data || typeof data !== "object") return data;
  if (Array.isArray(data)) return data.map(sanitize);

  const clean = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      clean[key] = "[REDACTADO]";
    } else if (typeof value === "object" && value !== null) {
      clean[key] = sanitize(value);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

export class Logger {
  constructor(context = "App") {
    this.context = context;
  }

  _format(level, message, meta = null) {
    const timestamp = new Date().toISOString();
    const color = COLORS[level] || COLORS.reset;
    const prefix = `${COLORS.dim}[${timestamp}]${COLORS.reset} ${color}[${level.toUpperCase()}]${COLORS.reset} [${this.context}]: ${message}`;

    if (meta && Object.keys(meta).length > 0) {
      const cleanMeta = sanitize(meta);
      return `${prefix}\n${JSON.stringify(cleanMeta, null, 2)}`;
    }
    return prefix;
  }

  info(message, meta) {
    console.log(this._format("info", message, meta));
  }

  warn(message, meta) {
    console.warn(this._format("warn", message, meta));
  }

  error(message, meta) {
    console.error(this._format("error", message, meta));
  }

  debug(message, meta) {
    if (env.nodeEnv !== "production") {
      console.log(this._format("debug", message, meta));
    }
  }
}