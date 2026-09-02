import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(root, ".env") });

function parseOrigins(...values) {
  return [
    ...new Set(
      values
        .flatMap((value) => String(value || "").split(","))
        .map((item) => item.trim().replace(/\/$/, ""))
        .filter(Boolean),
    ),
  ];
}

function parseBotInboundDebounceMs() {
  if (process.env.JEST_WORKER_ID) return 0;
  const raw = process.env.BOT_INBOUND_DEBOUNCE_MS;
  if (raw != null && String(raw).trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return 2000;
}

function parseWaMaxInitialConversations() {
  const DEFAULT_MAX = 1000;
  const raw = process.env.WA_MAX_INITIAL_CONVERSATIONS_24H;
  if (raw == null || String(raw).trim() === "") return DEFAULT_MAX;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_MAX;
  return Math.floor(n);
}

const LOG_LEVELS = new Set(["error", "warn", "info", "debug"]);

function parseLogLevel(nodeEnv) {
  const raw = String(process.env.LOG_LEVEL || "").trim().toLowerCase();
  if (LOG_LEVELS.has(raw)) return raw;
  return nodeEnv === "production" ? "info" : "debug";
}

const nodeEnv = process.env.NODE_ENV || "development";

export const env = {
  port: Number(process.env.PORT || 4000),
  nodeEnv,
  logLevel: parseLogLevel(nodeEnv),
  clientUrl: (process.env.CLIENT_URL || "http://localhost:8080").replace(/\/$/, ""),
  corsOrigins: parseOrigins(
    process.env.CLIENT_URL,
    process.env.CORS_ORIGIN,
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:8080",
    "https://alannaconfirmaciones.com.mx",
    "https://www.alannaconfirmaciones.com.mx",
  ),
  db: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    name: process.env.DB_NAME || "alanna",
    user: process.env.DB_USER || "alanna",
    password: process.env.DB_PASSWORD || "alanna",
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpires: process.env.JWT_ACCESS_EXPIRES || "8h",
    refreshDays: Number(process.env.JWT_REFRESH_EXPIRES_DAYS || 7),
    rememberDays: Number(process.env.JWT_REFRESH_REMEMBER_DAYS || 30),
  },
  resetUrl:
    process.env.FRONTEND_RESET_URL ||
    `${(process.env.CLIENT_URL || "http://localhost:8080").replace(/\/$/, "")}/restablecer-contrasena`,
  workerIntervalMs: Number(process.env.WORKER_INTERVAL_MS || 5000),
  waSend: { maxInitialPer24h: parseWaMaxInitialConversations() },
  stripe: {
    secret: process.env.STRIPE_SECRET_KEY || "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  },
  smtp: {
    host: process.env.SMTP_HOST || "smtp.hostinger.com",
    port: Number(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE === "true" || Number(process.env.SMTP_PORT || 465) === 465,
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || process.env.SMTP_USER || "",
  },
  frontendUrl: (process.env.APP_FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:8080").replace(
    /\/$/,
    "",
  ),
  credentialsEncryptionKey: process.env.CREDENTIALS_ENCRYPTION_KEY || "",
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
  },
  botDevEnabled: process.env.BOT_DEV_PLAYGROUND === "true",
  botInboundDebounceMs: parseBotInboundDebounceMs(),
  wc: {
    apiUrl: (process.env.WC_API_URL || "").replace(/\/$/, ""),
    serviceJwt: process.env.WC_SERVICE_JWT || "",
    timeoutMs: Number(process.env.WC_TIMEOUT_MS || 8000),
    webhookEnabled: (process.env.WC_WEBHOOK_ENABLED || "true") === "true",
    webhookMaxSkewMs: Number(process.env.WC_WEBHOOK_MAX_SKEW_MS || 300000),
    webhookDebug: (process.env.WC_WEBHOOK_DEBUG || "false") === "true",
  },
  uploadsDir: process.env.UPLOADS_DIR || path.join(root, "uploads"),
  bundledOpeningDocsDir:
    process.env.BUNDLED_OPENING_DOCS_DIR || path.join(root, "bundled-opening-docs"),
  meta: {
    webhookVerifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || "",
    templateName: process.env.META_TEMPLATE_NAME || "",
    templateNameDocument: process.env.META_TEMPLATE_NAME_DOCUMENT || "rg_eventos",
    templateLanguage: process.env.META_TEMPLATE_LANGUAGE || "es_MX",
    graphVersion: (process.env.META_GRAPH_VERSION || "v21.0").replace(/^\//, ""),
    timeoutMs: Number(process.env.META_TIMEOUT_MS || 8000),
    mediaTimeoutMs: Number(process.env.META_MEDIA_TIMEOUT_MS || 60000),
  },
};
