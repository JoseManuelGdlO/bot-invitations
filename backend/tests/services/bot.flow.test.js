import { jest } from "@jest/globals";
import { loadWithMocks, fakeEvent, fakeGuest } from "../helpers/loadWithMocks.js";
import { createInstance } from "../helpers/models.js";
import { formatFollowUpDate, defaultIndecisoFollowUpDate } from "../../src/services/follow-up.service.js";

const TEMPLATES = [
  {
    id: "t3",
    category: "Confirmación",
    title: "Cierre",
    body: "Perfecto {{nombre}}, entonces confirmamos {{numero_confirmados}} asistentes. ¡Nos vemos el {{fecha}}!",
  },
  {
    id: "t4",
    category: "Rechazo",
    title: "Rechazo",
    body: "Gracias por avisarnos, {{nombre}}. Te vamos a extrañar, mandamos un abrazo grande.",
  },
  {
    id: "t9",
    category: "Seguimiento",
    title: "Recontacto",
    body: "Hola {{nombre}}, te escribo de nuevo por {{evento}} del {{fecha}}.",
  },
];

describe("flujo RSVP processGuestMessage", () => {
  let service;
  let models;
  let enqueueJob;
  let processTurn;
  let session;
  let conv;

  async function setup(turnImpl) {
    enqueueJob = jest.fn(async () => undefined);
    processTurn = jest.fn(turnImpl);
    session = createInstance({
      id: "ses_1",
      eventId: "evt_1",
      guestId: "gst_1",
      userId: "5511111111",
      items: [],
      lockedUntil: null,
    });
    conv = createInstance({
      id: "c1",
      eventId: "evt_1",
      guestId: "gst_1",
      aiPaused: false,
      unread: 0,
    });

    ({ mod: service, models } = await loadWithMocks("src/services/bot/bot.service.js", {
      extraMocks: {
        "src/services/outbound.worker.js": () => ({ enqueueJob }),
        "src/services/bot/openai.service.js": () => ({ processTurn }),
        "src/services/bot/session.service.js": () => ({
          appendSessionItems: jest.fn(async () => session),
          asItems: (value) => (Array.isArray(value) ? [...value] : []),
          getOrCreateBotSession: jest.fn(async () => session),
          liveUserId: () => "5511111111",
          phonesMatch: () => true,
          refreshBotSessionLock: jest.fn(async () => undefined),
          saveSessionItems: jest.fn(async () => session),
          tryLockBotSession: jest.fn(async () => true),
          unlockBotSession: jest.fn(async () => undefined),
        }),
        "src/services/activity.service.js": () => ({ logActivity: jest.fn(async () => undefined) }),
      },
    }));

    models.Conversation.findOne.mockResolvedValue(conv);
    models.Message.findAll.mockResolvedValue([]);
    models.Message.create.mockResolvedValue({});
    models.AiConfig.findOne.mockResolvedValue({
      assistantName: "Sofía",
      prompt: "",
      rules: [],
    });
    models.Template.findAll.mockResolvedValue(TEMPLATES);
    models.Template.findOne.mockImplementation(async (opts = {}) => {
      const cat = opts.where?.category;
      return TEMPLATES.find((row) => row.category === cat) || null;
    });
    models.Faq.findAll.mockResolvedValue([
      { q: "¿Pueden ir niños?", a: "El evento está planeado únicamente para adultos." },
    ]);
    models.User.findByPk.mockResolvedValue({ name: "Ana" });
  }

  async function runTurn({ text, guest, turnImpl }) {
    await setup(turnImpl);
    const event = fakeEvent({ status: "activo" });
    models.Event.findByPk.mockResolvedValue(event);
    models.Guest.findOne.mockResolvedValue(guest);
    return service.processGuestMessage({
      eventId: event.id,
      guestId: guest.id,
      text,
      dryRun: false,
      persistConversation: true,
    });
  }

  test("FAQ no cierra RSVP y responde con la información cargada", async () => {
    const guest = fakeGuest({ status: "enviado" });
    const result = await runTurn({
      text: "¿Pueden ir niños?",
      guest,
      turnImpl: async () => ({
        reply: "El evento está planeado únicamente para adultos.",
        items: [],
        tools: [],
      }),
    });
    expect(result.reply).toContain("únicamente para adultos");
    expect(guest.status).toBe("en_conversacion");
    expect(enqueueJob).toHaveBeenCalled();
    expect(processTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: expect.stringMatching(/faq \| asistira/),
      }),
    );
  });

  test("FAQ desconocida usa fallback y no cierra RSVP", async () => {
    const guest = fakeGuest({ status: "enviado" });
    const result = await runTurn({
      text: "¿Habrá menú vegano?",
      guest,
      turnImpl: async () => ({
        reply: "No tengo ese dato; lo paso al equipo para confirmarte.",
        items: [],
        tools: [],
      }),
    });
    expect(result.reply).toMatch(/equipo/i);
    expect(guest.status).toBe("en_conversacion");
  });

  test("confirmación actualiza el invitado y usa la plantilla Confirmación", async () => {
    const guest = fakeGuest({ status: "enviado", invited: 2, confirmed: 0 });
    const result = await runTurn({
      text: "Sí, vamos los 2",
      guest,
      turnImpl: async ({ executeTool }) => {
        await executeTool({
          name: "actualizar_confirmacion",
          arguments: JSON.stringify({ status: "confirmado", confirmed: 2 }),
        });
        const plantilla = await executeTool({
          name: "usar_plantilla",
          arguments: JSON.stringify({ category: "Confirmación", id: null }),
        });
        return {
          reply: plantilla.text,
          items: [],
          tools: ["actualizar_confirmacion", "usar_plantilla"],
        };
      },
    });
    expect(guest.status).toBe("confirmado");
    expect(guest.confirmed).toBe(2);
    expect(result.reply).toContain("Perfecto Luis");
    expect(result.reply).toContain("confirmamos 2 asistentes");
    expect(result.reply).not.toMatch(/te escribo de nuevo/i);
  });

  test("rechazo actualiza el invitado y usa la plantilla Rechazo", async () => {
    const guest = fakeGuest({ status: "enviado" });
    const result = await runTurn({
      text: "No podemos asistir",
      guest,
      turnImpl: async ({ executeTool }) => {
        await executeTool({
          name: "actualizar_confirmacion",
          arguments: JSON.stringify({ status: "no_asistira", confirmed: null }),
        });
        const plantilla = await executeTool({
          name: "usar_plantilla",
          arguments: JSON.stringify({ category: "Rechazo", id: null }),
        });
        return { reply: plantilla.text, items: [], tools: ["actualizar_confirmacion", "usar_plantilla"] };
      },
    });
    expect(guest.status).toBe("no_asistira");
    expect(result.reply).toContain("Gracias por avisarnos, Luis");
  });

  test("desconocido deja en conversación sin RSVP ni seguimiento", async () => {
    const guest = fakeGuest({ status: "enviado" });
    const result = await runTurn({
      text: "jajaja qué onda",
      guest,
      turnImpl: async () => ({
        reply: "¡Hola Luis! ¿Me confirmas si podrán acompañarnos el 2027-01-01?",
        items: [],
        tools: [],
      }),
    });
    expect(guest.status).toBe("en_conversacion");
    expect(guest.followUp).toBe("");
    expect(result.reply).toMatch(/confirmas/i);
  });

  test("indeciso marca seguimiento a 3 días sin mandar la plantilla ahora", async () => {
    const guest = fakeGuest({ status: "enviado" });
    const result = await runTurn({
      text: "Luego te digo, lo hablo con mi pareja",
      guest,
      turnImpl: async ({ executeTool }) => {
        const marked = await executeTool({
          name: "marcar_seguimiento",
          arguments: JSON.stringify({ reason: "lo habla con su pareja", followUpDate: null }),
        });
        return {
          reply: "Perfecto, te escribo de nuevo más adelante.",
          items: [],
          tools: [{ name: "marcar_seguimiento", result: marked }],
        };
      },
    });
    expect(guest.status).toBe("seguimiento");
    expect(guest.followUp).toBe(formatFollowUpDate(defaultIndecisoFollowUpDate()));
    expect(result.reply).toMatch(/más adelante/i);
    expect(result.reply).not.toMatch(/te escribo de nuevo por Boda Ana/i);
  });
});
