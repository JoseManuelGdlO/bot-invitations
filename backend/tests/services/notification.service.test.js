import { jest } from "@jest/globals";
import { loadWithMocks } from "../helpers/loadWithMocks.js";

const sendLaunchNoticeEmail = jest.fn(async () => ({ messageId: "m1" }));

describe("notification.service", () => {
  test("crea el aviso y envía el correo una sola vez", async () => {
    const { mod, models } = await loadWithMocks("src/services/notification.service.js", {
      extraMocks: {
        "src/services/email.service.js": () => ({ sendLaunchNoticeEmail }),
      },
    });
    sendLaunchNoticeEmail.mockClear();
    const notice = {
      userId: "usr_1",
      eventId: "evt_1",
      kind: "campaign",
      title: "Campaña por lanzarse",
      body: "La campaña de «Boda Ana» se lanza mañana.",
      href: "/eventos/boda-ana/resumen",
      dedupeKey: "campaign:c1:2026-09-26",
      scheduledFor: "2026-09-26",
    };
    const row = await mod.deliverNotice(notice, { email: "ana@test.com", name: "Ana" });
    expect(models.Notification.findOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { dedupeKey: notice.dedupeKey } }),
    );
    expect(sendLaunchNoticeEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ana@test.com",
        link: "http://localhost:8080/eventos/boda-ana/resumen",
      }),
    );
    expect(row.emailSentAt).toBeInstanceOf(Date);
    expect(row.save).toHaveBeenCalled();

    sendLaunchNoticeEmail.mockClear();
    models.Notification.findOrCreate.mockResolvedValueOnce([{ ...row, emailSentAt: new Date() }, false]);
    await mod.deliverNotice(notice, { email: "ana@test.com", name: "Ana" });
    expect(sendLaunchNoticeEmail).not.toHaveBeenCalled();
  });
});
