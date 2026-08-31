import { loadWithMocks } from "../helpers/loadWithMocks.js";

describe("campaign-progress", () => {
  let service;
  let models;

  beforeEach(async () => {
    ({ mod: service, models } = await loadWithMocks("src/services/campaign-progress.js"));
  });

  test("recordCampaignSendResult incrementa processed y puede marcar done", async () => {
    await service.recordCampaignSendResult("cmp_1");
    expect(models.Campaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        processed: expect.anything(),
        status: expect.anything(),
      }),
      { where: { id: "cmp_1" } },
    );
  });

  test("recordCampaignSendResult no hace nada sin id", async () => {
    await service.recordCampaignSendResult("");
    expect(models.Campaign.update).not.toHaveBeenCalled();
  });
});
