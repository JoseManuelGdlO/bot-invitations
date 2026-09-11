import { env } from "./config/env.js";
import { sequelize, ensureEventMemberRemovedAt, ensureInboundEventDedupTable, ensureCampaignColumns, ensureTemplateGreetingVar, ensureTemplateBodyVars, ensureTemplateDocumentColumns, ensureWhatsappMetaTables, ensureWhatsappTemplateTables, ensureMessageProviderId, ensureMessageKind, ensureGuestCustomData, ensureEventTimezone, ensureChannelIntegrationMetaColumns, ensureAiConfigToggles } from "./models/index.js";
import { createApp } from "./app.js";
import { startOutboundWorker } from "./services/outbound.worker.js";
import { startFollowUpScheduler } from "./services/follow-up.scheduler.js";
import { finalizePastEvents } from "./services/event-status.service.js";

const app = createApp();

try {
  await sequelize.authenticate();
  await ensureEventMemberRemovedAt();
  await ensureInboundEventDedupTable();
  await ensureWhatsappMetaTables();
  await ensureWhatsappTemplateTables();
  await ensureCampaignColumns();
  await ensureTemplateGreetingVar();
  await ensureTemplateBodyVars();
  await ensureTemplateDocumentColumns();
  await ensureMessageProviderId();
  await ensureMessageKind();
  await ensureGuestCustomData();
  await ensureEventTimezone();
  await ensureChannelIntegrationMetaColumns();
  await ensureAiConfigToggles();
  console.log("[db] conectado a MySQL");
} catch (err) {
  console.error("[db] no se pudo conectar", err.message);
  process.exit(1);
}

startOutboundWorker();
startFollowUpScheduler(env.workerIntervalMs);
finalizePastEvents().catch((err) => console.error("[event-status] finalize on boot", err.message));

app.listen(env.port, "0.0.0.0", () => {
  console.log(`[alanna] backend en http://0.0.0.0:${env.port}`);
});
