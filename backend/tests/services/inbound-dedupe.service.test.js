import { jest } from "@jest/globals";
import crypto from "node:crypto";
import { loadWithMocks } from "../helpers/loadWithMocks.js";

describe("inbound-dedupe.service", () => {
  test("inboundDedupeKey usa messageId si existe", async () => {
    const { mod } = await loadWithMocks("src/services/inbound-dedupe.service.js");
    expect(mod.inboundDedupeKey({ messageId: "wamid_1", payload: { id: "other" } })).toBe("msg:wamid_1");
  });

  test("inboundDedupeKey hashea el body crudo si no hay messageId", async () => {
    const { mod } = await loadWithMocks("src/services/inbound-dedupe.service.js");
    const rawBody = '{"deviceId":"dev_1","type":"message.inbound"}';
    const expected = `body:${crypto.createHash("sha256").update(rawBody).digest("hex")}`;
    expect(mod.inboundDedupeKey({ rawBody, payload: { id: "" } })).toBe(expected);
  });

  test("claimInboundEvent es duplicate en unique constraint", async () => {
    const { mod, models } = await loadWithMocks("src/services/inbound-dedupe.service.js");
    models.InboundEventDedup.create.mockRejectedValueOnce(
      Object.assign(new Error("dup"), { name: "SequelizeUniqueConstraintError" }),
    );
    await expect(mod.claimInboundEvent({ ownerUserId: "usr_1", dedupeKey: "body:abc" })).resolves.toEqual({
      duplicate: true,
    });
  });

  test("claimInboundEvent crea la fila la primera vez", async () => {
    const { mod, models } = await loadWithMocks("src/services/inbound-dedupe.service.js");
    models.InboundEventDedup.create.mockResolvedValueOnce({});
    await expect(mod.claimInboundEvent({ ownerUserId: "usr_1", dedupeKey: "body:abc" })).resolves.toEqual({
      duplicate: false,
    });
    expect(models.InboundEventDedup.create).toHaveBeenCalledWith({ ownerUserId: "usr_1", dedupeKey: "body:abc" });
  });
});
