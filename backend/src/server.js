import { env } from "./config/env.js";
import { sequelize, ensureEventMemberRemovedAt, ensureInboundEventDedupTable } from "./models/index.js";
import { createApp } from "./app.js";
import { startOutboundWorker } from "./services/outbound.worker.js";
import { startFollowUpScheduler } from "./services/follow-up.scheduler.js";

const app = createApp();

try {
  await sequelize.authenticate();
  await ensureEventMemberRemovedAt();
  await ensureInboundEventDedupTable();
  console.log("[db] conectado a MySQL");
} catch (err) {
  console.error("[db] no se pudo conectar", err.message);
  process.exit(1);
}

startOutboundWorker();
startFollowUpScheduler(env.workerIntervalMs);

app.listen(env.port, "0.0.0.0", () => {
  console.log(`[alanna] backend en http://0.0.0.0:${env.port}`);
});
