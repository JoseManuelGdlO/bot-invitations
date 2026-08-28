import { Plan, User, sequelize, syncModels, ensureEventMemberRemovedAt, ensureCampaignColumns } from "../models/index.js";
import { ensurePlans } from "../services/plans.service.js";
import { ensureAdmin } from "../controllers/admin.controller.js";
import { syncStripePlans } from "../services/stripe.service.js";
const force = process.argv.includes("--force");
const alter = process.argv.includes("--alter") || !force;

try {
  await sequelize.authenticate();
  await syncModels({ force, alter: force ? false : alter });
  await ensureEventMemberRemovedAt();
  await ensureCampaignColumns();
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
