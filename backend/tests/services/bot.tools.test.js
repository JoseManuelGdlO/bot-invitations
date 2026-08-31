import { jest } from "@jest/globals";
import { loadWithMocks, fakeEvent, fakeGuest } from "../helpers/loadWithMocks.js";
import { formatFollowUpDate, defaultIndecisoFollowUpDate } from "../../src/services/follow-up.service.js";

describe("bot tools", () => {
  let tools;
  let models;

  beforeEach(async () => {
    ({ mod: tools, models } = await loadWithMocks("src/services/bot/tools.js", {
      extraMocks: {
        "src/services/activity.service.js": () => ({ logActivity: jest.fn(async () => undefined) }),
      },
    }));
  });

  test("actualizar_confirmacion cierra RSVP y pide cierre conversacional", async () => {
    const guest = fakeGuest({ status: "enviado", invited: 2, confirmed: 0 });
    const result = await tools.executeActualizarConfirmacion(
      { status: "confirmado", confirmed: 2 },
      { guest, event: fakeEvent(), dryRun: false },
    );
    expect(guest.status).toBe("confirmado");
    expect(guest.confirmed).toBe(2);
    expect(result.instruction).toMatch(/cierre breve y natural/);
    expect(result.instruction).not.toMatch(/usar_plantilla con category/);
    expect(guest.save).toHaveBeenCalled();
  });

  test("actualizar_confirmacion recorta confirmed al cupo si piden de más", async () => {
    const guest = fakeGuest({ status: "en_conversacion", invited: 2, confirmed: 0 });
    const result = await tools.executeActualizarConfirmacion(
      { status: "confirmado", confirmed: 8 },
      { guest, event: fakeEvent(), dryRun: false },
    );
    expect(result.success).toBe(true);
    expect(guest.status).toBe("confirmado");
    expect(guest.confirmed).toBe(2);
    expect(result.confirmed).toBe(2);
    expect(result.invited).toBe(2);
  });

  test("actualizar_confirmacion redondea decimales y no guarda NaN si confirmed es basura", async () => {
    const decimalGuest = fakeGuest({ status: "en_conversacion", invited: 5, confirmed: 0 });
    const decimalResult = await tools.executeActualizarConfirmacion(
      { status: "confirmado", confirmed: 2.7 },
      { guest: decimalGuest, event: fakeEvent(), dryRun: false },
    );
    expect(decimalResult.success).toBe(true);
    expect(decimalGuest.confirmed).toBe(3);
    expect(Number.isFinite(decimalGuest.confirmed)).toBe(true);
    expect(decimalGuest.confirmed).toBeLessThanOrEqual(5);

    const garbageGuest = fakeGuest({ status: "en_conversacion", invited: 5, confirmed: 0 });
    const garbageResult = await tools.executeActualizarConfirmacion(
      { status: "confirmado", confirmed: "tres" },
      { guest: garbageGuest, event: fakeEvent(), dryRun: false },
    );
    expect(garbageResult.success).toBe(true);
    expect(garbageGuest.confirmed).toBe(5);
    expect(Number.isNaN(garbageGuest.confirmed)).toBe(false);
    expect(garbageGuest.confirmed).toBeLessThanOrEqual(5);

    const overRoundGuest = fakeGuest({ status: "en_conversacion", invited: 5, confirmed: 0 });
    await tools.executeActualizarConfirmacion(
      { status: "confirmado", confirmed: 5.9 },
      { guest: overRoundGuest, event: fakeEvent(), dryRun: false },
    );
    expect(overRoundGuest.confirmed).toBe(5);
  });

  test("actualizar_confirmacion de rechazo pide cierre conversacional", async () => {
    const guest = fakeGuest({ status: "enviado" });
    const result = await tools.executeActualizarConfirmacion(
      { status: "no_asistira", confirmed: null },
      { guest, event: fakeEvent(), dryRun: false },
    );
    expect(guest.status).toBe("no_asistira");
    expect(guest.confirmed).toBe(0);
    expect(result.instruction).toMatch(/cierre breve y natural/);
    expect(result.instruction).not.toMatch(/usar_plantilla con category/);
  });

  test("marcar_seguimiento agenda a 3 días y limpia el nudge previo", async () => {
    const guest = fakeGuest({
      status: "en_conversacion",
      followUpsSent: ["indeciso", "f2"],
    });
    const result = await tools.executeMarcarSeguimiento(
      { reason: "lo habla con su pareja", followUpDate: null },
      { guest, event: fakeEvent(), dryRun: false },
    );
    expect(guest.status).toBe("seguimiento");
    expect(guest.followUp).toBe(formatFollowUpDate(defaultIndecisoFollowUpDate()));
    expect(guest.followUpsSent).toEqual(["f2"]);
    expect(result.instruction).toMatch(/No uses ahora la plantilla Seguimiento/);
    expect(guest.save).toHaveBeenCalled();
  });

  test("marcar_seguimiento usa los días de ai.followUps", async () => {
    const guest = fakeGuest({ status: "en_conversacion" });
    await tools.executeMarcarSeguimiento(
      { reason: null, followUpDate: null },
      {
        guest,
        event: fakeEvent(),
        ai: {
          followUps: [
            { id: "indeciso", label: "Recontacto a indecisos", days: 5, when: "5 días después de marcar seguimiento", active: true },
          ],
        },
        dryRun: true,
      },
    );
    expect(guest.followUp).toBe(formatFollowUpDate(defaultIndecisoFollowUpDate(new Date(), 5)));
  });

  test("marcar_seguimiento respeta followUpDate explícita", async () => {
    const guest = fakeGuest({ status: "enviado" });
    await tools.executeMarcarSeguimiento(
      { reason: null, followUpDate: "2026-09-01" },
      { guest, event: fakeEvent(), dryRun: true },
    );
    expect(guest.followUp).toBe("01/09/2026");
    expect(guest.save).not.toHaveBeenCalled();
  });

  test("marcar_seguimiento no pisa un RSVP cerrado", async () => {
    const guest = fakeGuest({ status: "confirmado" });
    const result = await tools.executeMarcarSeguimiento(
      { reason: null, followUpDate: null },
      { guest, event: fakeEvent() },
    );
    expect(result.success).toBe(false);
    expect(guest.status).toBe("confirmado");
  });

  test("usar_plantilla sin category ni id falla", async () => {
    const result = await tools.executeUsarPlantilla(
      { category: null, id: null },
      { guest: fakeGuest(), event: fakeEvent(), plannerName: "Ana" },
    );
    expect(result).toEqual({
      success: false,
      error: "Indica category o id de la plantilla.",
    });
    expect(models.Template.findOne).not.toHaveBeenCalled();
  });

  test("usar_plantilla Confirmación no fuerza reply ni cierra RSVP", async () => {
    const guest = fakeGuest({ status: "en_conversacion", invited: 4, confirmed: 0 });
    const result = await tools.executeUsarPlantilla(
      { category: "Confirmación", id: null },
      { guest, event: fakeEvent(), plannerName: "Ana" },
    );
    expect(result).toEqual({
      success: false,
      error: "El cierre de RSVP es conversacional: escribe reply. No uses plantilla de Confirmación ni Rechazo.",
    });
    expect(result.useAsReply).toBeUndefined();
    expect(guest.status).toBe("en_conversacion");
    expect(guest.save).not.toHaveBeenCalled();
    expect(models.Template.findOne).not.toHaveBeenCalled();
  });

  test("usar_plantilla interpola y marca useAsReply", async () => {
    models.Template.findOne.mockResolvedValue({
      id: "t2",
      category: "Ubicación",
      title: "Dónde",
      body: "Hola {{nombre}}, el evento es en {{lugar}}.",
    });
    const guest = fakeGuest({ confirmed: 2 });
    const result = await tools.executeUsarPlantilla(
      { category: "Ubicación", id: null },
      { guest, event: fakeEvent(), plannerName: "Ana" },
    );
    expect(result.useAsReply).toBe(true);
    expect(result.text).toBe("Hola Luis, el evento es en Hacienda.");
    expect(guest.status).toBe("sin_contactar");
  });

  test("usar_plantilla por id de Confirmación no cierra RSVP", async () => {
    models.Template.findOne.mockResolvedValue({
      id: "t3",
      category: "Confirmación",
      title: "Cierre",
      body: "Perfecto {{nombre}}.",
    });
    const guest = fakeGuest({ status: "en_conversacion", confirmed: 0, invited: 4 });
    const result = await tools.executeUsarPlantilla(
      { category: null, id: "t3" },
      { guest, event: fakeEvent(), plannerName: "Ana" },
    );
    expect(result.success).toBe(false);
    expect(result.useAsReply).toBeUndefined();
    expect(guest.status).toBe("en_conversacion");
    expect(guest.save).not.toHaveBeenCalled();
  });
});
