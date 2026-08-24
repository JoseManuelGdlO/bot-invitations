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

export const env = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || "development",
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
    accessSecret: process.env.JWT_ACCESS_SECRET || "dev-access",
    refreshSecret: process.env.JWT_REFRESH_SECRET || "dev-refresh",
    accessExpires: process.env.JWT_ACCESS_EXPIRES || "8h",
    refreshDays: Number(process.env.JWT_REFRESH_EXPIRES_DAYS || 7),
    rememberDays: Number(process.env.JWT_REFRESH_REMEMBER_DAYS || 30),
  },
  resetUrl: process.env.FRONTEND_RESET_URL || "http://localhost:8080/restablecer-contrasena",
  workerIntervalMs: Number(process.env.WORKER_INTERVAL_MS || 5000),
  stripe: {
    secret: process.env.STRIPE_SECRET_KEY || "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  },
  credentialsEncryptionKey: process.env.CREDENTIALS_ENCRYPTION_KEY || "",
  wc: {
    apiUrl: (process.env.WC_API_URL || "").replace(/\/$/, ""),
    serviceJwt: process.env.WC_SERVICE_JWT || "",
    timeoutMs: Number(process.env.WC_TIMEOUT_MS || 8000),
    webhookEnabled: (process.env.WC_WEBHOOK_ENABLED || "true") === "true",
    webhookMaxSkewMs: Number(process.env.WC_WEBHOOK_MAX_SKEW_MS || 300000),
    webhookDebug: (process.env.WC_WEBHOOK_DEBUG || "false") === "true",
  },
};
