import { Campaign, sequelize } from "../models/index.js";

export async function recordCampaignSendResult(campaignId) {
  const id = String(campaignId || "").trim();
  if (!id) return;
  await Campaign.update(
    {
      processed: sequelize.literal("processed + 1"),
      status: sequelize.literal("IF(processed + 1 >= `total` AND `total` > 0, 'done', status)"),
    },
    { where: { id } },
  );
}
