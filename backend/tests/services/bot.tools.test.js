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

  test("actualizar_confirmacion cierra RSVP y pide plantilla Confirmación", async () => {
    const guest = fakeGuest({ status: "enviado", invited: 2, confirmed: 0 });
    const result = await tools.executeActualizarConfirmacion(
      { status: "confirmado", confirmed: 2 },
      { guest, event: fakeEvent(), dryRun: false },
    );
    expect(guest.status).toBe("confirmado");
    expect(guest.confirmed).toBe(2);
    expect(result.instruction).toMatch(/Confirmación/);
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

  test("actualizar_confirmacion de rechazo pide plantilla Rechazo", async () => {
    const guest = fakeGuest({ status: "enviado" });
    const result = await tools.executeActualizarConfirmacion(
      { status: "no_asistira", confirmed: null },
      { guest, event: fakeEvent(), dryRun: false },
    );
    expect(guest.status).toBe("no_asistira");
    expect(guest.confirmed).toBe(0);
    expect(result.instruction).toMatch(/Rechazo/);
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

  test("usar_plantilla Confirmación cierra RSVP si el modelo no llamó actualizar_confirmacion", async () => {
    models.Template.findOne.mockResolvedValue({
      id: "t3",
      category: "Confirmación",
      title: "Cierre",
      body: "Perfecto {{nombre}}, confirmamos {{numero_invitados}}.",
    });
    const guest = fakeGuest({ status: "en_conversacion", invited: 4, confirmed: 0 });
    await tools.executeUsarPlantilla(
      { category: "Confirmación", id: null },
      { guest, event: fakeEvent(), plannerName: "Ana" },
    );
    expect(guest.status).toBe("confirmado");
    expect(guest.confirmed).toBe(4);
    expect(guest.whatsapp).toBe("respondido");
    expect(guest.save).toHaveBeenCalled();
  });

  test("usar_plantilla interpola y marca useAsReply", async () => {
    models.Template.findOne.mockResolvedValue({
      id: "t3",
      category: "Confirmación",
      title: "Cierre",
      body: "Perfecto {{nombre}}, entonces confirmamos {{numero_confirmados}} asistentes.",
    });
    const guest = fakeGuest({ confirmed: 2 });
    const result = await tools.executeUsarPlantilla(
      { category: "Confirmación", id: null },
      { guest, event: fakeEvent(), plannerName: "Ana" },
    );
    expect(result.useAsReply).toBe(true);
    expect(result.text).toBe("Perfecto Luis, entonces confirmamos 2 asistentes.");
    expect(guest.status).toBe("confirmado");
    expect(guest.confirmed).toBe(2);
    expect(guest.whatsapp).toBe("respondido");
    expect(guest.confirmedAt).toBeTruthy();
  });

  test("usar_plantilla Confirmación no pisa un RSVP ya cerrado", async () => {
    models.Template.findOne.mockResolvedValue({
      id: "t3",
      category: "Confirmación",
      title: "Cierre",
      body: "Perfecto {{nombre}}.",
    });
    const guest = fakeGuest({ status: "parcial", confirmed: 1, invited: 4, confirmedAt: new Date("2026-01-01") });
    await tools.executeUsarPlantilla(
      { category: "Confirmación", id: null },
      { guest, event: fakeEvent(), plannerName: "Ana" },
    );
    expect(guest.status).toBe("parcial");
    expect(guest.confirmed).toBe(1);
  });
});
