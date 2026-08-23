import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { router } from "./routes/index.js";

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
  app.use(express.json({ limit: "8mb" }));
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api", router);
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || "Error interno" });
  });
  return app;
}
