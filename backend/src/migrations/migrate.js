import { AiConfig, Plan, User, sequelize, syncModels } from "../models/index.js";
import { ensurePlans } from "../services/plans.service.js";
import { ensureAdmin } from "../controllers/admin.controller.js";
import { syncStripePlans } from "../services/stripe.service.js";
import { defaultPrompt } from "../services/bot/prompt.service.js";

const force = process.argv.includes("--force");
const alter = process.argv.includes("--alter") || !force;

async function backfillAiPrompts() {
  const rows = await AiConfig.findAll();
  let filled = 0;
  for (const ai of rows) {
    if (String(ai.prompt || "").trim()) continue;
    ai.prompt = defaultPrompt(ai);
    await ai.save();
    filled += 1;
  }
  if (filled) console.log(`[migrate] prompts de ai_configs rellenados: ${filled}`);
}

try {
  await sequelize.authenticate();
  await syncModels({ force, alter: force ? false : alter });
  await backfillAiPrompts();
  await ensurePlans();
  await ensureAdmin();
  await syncStripePlans();
  const atelier = await Plan.findOne({ where: { slug: "atelier" } });
  const seedUser = await User.findOne({ where: { email: "hola@planner.mx" } });
  if (atelier && seedUser && !seedUser.planId) {
    seedUser.planId = atelier.id;
    await seedUser.save();
  }
  console.log(`[migrate] listo (force=${force}, alter=${alter})`);
  process.exit(0);
} catch (err) {
  console.error("[migrate] error", err);
  process.exit(1);
}
