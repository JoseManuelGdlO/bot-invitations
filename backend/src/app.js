import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { router } from "./routes/index.js";
import { webhook as stripeWebhook } from "./controllers/billing.controller.js";
import { requestLogger } from "./middleware/logger.middleware.js";

export function createApp() {
  const app = express();
  app.use(
    cors({
      origin(origin, next) {
        if (!origin || env.corsOrigins.includes(origin)) return next(null, true);
        return next(null, false);
      },
      credentials: true,
    }),
  );
  app.use(cookieParser());
  app.post("/api/billing/webhook", express.raw({ type: "application/json" }), stripeWebhook);
  app.use(express.json({ limit: "8mb" }));
  app.use(express.urlencoded({ extended: true}));
  app.use(requestLogger);
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api", router);
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || "Error interno" });
  });
  return app;
}
