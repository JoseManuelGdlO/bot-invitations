import assert from "node:assert/strict";
import { test } from "node:test";
import { wizardPresetById } from "./whatsapp-template-presets.ts";
import {
  buildEventTemplateFormData,
  buildWizardFormData,
  campaignTemplateStatus,
  canSubmitWizard,
  eventTemplateBodyError,
  extraPlaceholderIds,
  extraSlotOptionLabel,
  extraSlotOptions,
  extractBodyPlaceholders,
  insertWizardVariable,
  isCampaignLaunchBlocked,
  isEventTemplateCardReady,
  isWizardCardReady,
  mergeEventSlotMappings,
  metaTemplateBodyErrors,
  shouldShowEventTemplateCards,
  statusBadgeLabel,
  unmappedExtraNotices,
  wizardBodyError,
  type WizardTemplateDraft,
} from "./whatsapp-templates.ts";

const ERROR_EMPTY = "El cuerpo no puede estar vacío.";
const ERROR_START = "Las variables no pueden ir al principio del mensaje.";
const ERROR_END = "Las variables no pueden ir al final del mensaje.";
const ERROR_ADJACENT =
  "No pongas dos variables seguidas. Separa {{1}} y {{2}} con texto.";
const ERROR_DENSITY =
  "Esta plantilla tiene demasiadas variables en relación con su longitud. Reduce el número de variables o aumenta la longitud del mensaje.";
const ERROR_REQUIRED =
  "Incluye {{1}} (nombre) y {{2}} (número de pases). Las dos son obligatorias.";
const ERROR_SEQUENCE =
  "Usa {{1}}, {{2}}, {{3}}… en orden, sin saltos. {{1}} es el nombre y {{2}} el número de pases.";
const ERROR_LENGTH = "El cuerpo no puede superar 1024 caracteres.";

const OK_BODY =
  "Hola {{1}}, tienes {{2}} pases reservados. Confirma por este chat, por favor.";
const PRESET_FORMAL =
  "Hola {{1}}, te escribimos para invitarte con mucho gusto a nuestra celebración. Reservamos {{2}} pases a tu nombre. Confírmanos tu asistencia por este chat cuando puedas, por favor.";
const PRESET_CERCANO =
  "¡Hola {{1}}! Qué gusto saludarte. Guardamos {{2}} lugares para ti en nuestra celebración. Responde a este mensaje para confirmar si nos acompañas, por favor.";
const PRESET_EVENTO =
  "Hola {{1}}, te invitamos a {{3}}. Reservamos {{2}} pases a tu nombre. Te esperamos el {{4}} en {{5}}. Confirma tu asistencia respondiendo este mensaje, por favor.";
const EXTRA_OK =
  "Hola {{1}}, tienes {{2}} pases reservados para {{3}}. Confirma por este chat cuando puedas, por favor.";
const SEQUENCE_GAP =
  "Hola {{1}}, te invitamos con mucho gusto a confirmar el {{3}} por este chat cuando puedas, por favor.";

function draft(
  overrides: Partial<WizardTemplateDraft> = {},
): WizardTemplateDraft {
  const body = overrides.body ?? OK_BODY;
  return {
    displayName: "Invitación formal",
    headerType: "none",
    body,
    headerFile: null,
    headerFileName: null,
    slotMappings: mergeEventSlotMappings(body, {}),
    ...overrides,
  };
}

test("metaTemplateBodyErrors acepta el cuerpo ok de §5.2", () => {
  assert.deepEqual(metaTemplateBodyErrors(OK_BODY), []);
});

test("metaTemplateBodyErrors rechaza variable al inicio", () => {
  const errors = metaTemplateBodyErrors("{{1}} te invitamos… pases {{2}}.");
  assert.ok(errors.includes(ERROR_START));
});

test("metaTemplateBodyErrors rechaza variable al final", () => {
  const errors = metaTemplateBodyErrors("Hola {{1}}, pases {{2}}");
  assert.ok(errors.includes(ERROR_END));
});

test("metaTemplateBodyErrors rechaza placeholders adyacentes", () => {
  const errors = metaTemplateBodyErrors("Hola {{1}}{{2}} confirma por favor.");
  assert.ok(errors.includes(ERROR_ADJACENT));
});

test("metaTemplateBodyErrors rechaza el cuerpo corto con {{1}} {{3}} {{2}}", () => {
  const errors = metaTemplateBodyErrors("Hola {{1}}, {{3}} y {{2}} listo.");
  assert.ok(errors.includes(ERROR_DENSITY));
});

test("metaTemplateBodyErrors rechaza densidad baja", () => {
  assert.deepEqual(
    metaTemplateBodyErrors("Hola {{1}} y {{2}} y {{3}} y {{4}} ok."),
    [ERROR_DENSITY],
  );
});

test("metaTemplateBodyErrors acepta cuerpos cortos ya aprobados por Meta", () => {
  const approved = "Hola {{1}} tienes {{2}} pases de invitado.";
  const withExtra =
    "Hola {{1}} tienes {{2}} pases de invitado. {{3}} texto extra.";
  assert.deepEqual(metaTemplateBodyErrors(approved), []);
  assert.deepEqual(metaTemplateBodyErrors(withExtra), []);
});

test("metaTemplateBodyErrors rechaza Hola {{1}} por final y variables incompletas", () => {
  const errors = metaTemplateBodyErrors("Hola {{1}}");
  assert.ok(errors.includes(ERROR_END));
  assert.ok(errors.includes(ERROR_REQUIRED));
});

test("metaTemplateBodyErrors acepta presets Formal / Cercano / Con evento", () => {
  assert.deepEqual(metaTemplateBodyErrors(PRESET_FORMAL), []);
  assert.deepEqual(metaTemplateBodyErrors(PRESET_CERCANO), []);
  assert.deepEqual(metaTemplateBodyErrors(PRESET_EVENTO), []);
});

test("metaTemplateBodyErrors rechaza vacío, hueco y longitud", () => {
  assert.deepEqual(metaTemplateBodyErrors(""), [ERROR_EMPTY]);
  assert.deepEqual(metaTemplateBodyErrors("   \n"), [ERROR_EMPTY]);
  assert.deepEqual(metaTemplateBodyErrors(SEQUENCE_GAP), [ERROR_SEQUENCE]);
  const padded = OK_BODY + "x".repeat(1025 - OK_BODY.length);
  assert.equal(padded.length, 1025);
  assert.deepEqual(metaTemplateBodyErrors(padded), [ERROR_LENGTH]);
  assert.deepEqual(
    metaTemplateBodyErrors(OK_BODY + "x".repeat(1024 - OK_BODY.length)),
    [],
  );
});

test("wizardBodyError exige {{1}} y {{2}}", () => {
  assert.equal(typeof wizardBodyError("hola"), "string");
  assert.equal(wizardBodyError("hola"), ERROR_REQUIRED);
  assert.equal(wizardBodyError(OK_BODY), null);
});

test("wizardBodyError acepta extras {{3}} si hay texto suficiente y no están al filo", () => {
  assert.equal(wizardBodyError("Hola {{1}}"), ERROR_END);
  assert.equal(wizardBodyError(EXTRA_OK), null);
  assert.equal(eventTemplateBodyError(EXTRA_OK), null);
  assert.equal(eventTemplateBodyError("Hola {{1}}"), ERROR_END);
});

test("extractBodyPlaceholders ordena y deduplica", () => {
  assert.deepEqual(extractBodyPlaceholders("{{2}} hola {{1}} {{1}}"), [
    "1",
    "2",
  ]);
});

test("statusBadgeLabel PENDING", () => {
  assert.equal(statusBadgeLabel("PENDING"), "En revisión");
  assert.equal(statusBadgeLabel("APPROVED"), "Aprobada");
});

test("statusBadgeLabel REJECTED", () => {
  assert.equal(statusBadgeLabel("REJECTED"), "Rechazada");
});

test("extraSlotOptions añade la opción literal al final", () => {
  assert.deepEqual(extraSlotOptions(["fecha", "lugar"]), [
    "fecha",
    "lugar",
    "__literal__",
  ]);
  assert.deepEqual(extraSlotOptions([]), ["__literal__"]);
});

test("statusBadgeLabel cubre el resto de estados Meta", () => {
  assert.equal(statusBadgeLabel("DRAFT"), "Borrador");
  assert.equal(statusBadgeLabel("REJECTED"), "Rechazada");
  assert.equal(statusBadgeLabel("PAUSED"), "Pausada");
  assert.equal(statusBadgeLabel("DISABLED"), "Pausada");
});

test("isWizardCardReady exige archivo si el encabezado no es texto", () => {
  assert.equal(isWizardCardReady(draft()), true);
  assert.equal(
    isWizardCardReady(draft({ headerType: "document", headerFile: null })),
    false,
  );
  assert.equal(
    isWizardCardReady(
      draft({
        headerType: "image",
        headerFile: new File(["x"], "foto.png", { type: "image/png" }),
      }),
    ),
    true,
  );
});

test("canSubmitWizard exige un draft listo y deshabilita con variable al final", () => {
  assert.equal(canSubmitWizard(draft({ body: "hola" })), false);
  assert.equal(canSubmitWizard(draft()), true);
  const trailing = `${OK_BODY} {{3}}`;
  assert.ok(metaTemplateBodyErrors(trailing).includes(ERROR_END));
  assert.equal(canSubmitWizard(draft({ body: trailing })), false);
  const formal = wizardPresetById("formal");
  assert.equal(
    canSubmitWizard(
      draft({
        displayName: formal.displayName,
        body: `${formal.body} {{3}}`,
        slotMappings: {
          ...formal.slotMappings,
          "3": { type: "field", key: "lugar" },
        },
      }),
    ),
    false,
  );
});

test("isWizardCardReady exige mappings extra completos", () => {
  assert.equal(
    isWizardCardReady(
      draft({
        body: EXTRA_OK,
        slotMappings: mergeEventSlotMappings(EXTRA_OK, {}),
      }),
    ),
    false,
  );
  assert.equal(
    isWizardCardReady(
      draft({
        body: EXTRA_OK,
        slotMappings: mergeEventSlotMappings(EXTRA_OK, {
          "3": { type: "field", key: "lugar" },
        }),
      }),
    ),
    true,
  );
  assert.equal(
    isWizardCardReady(
      draft({
        headerType: "document",
        headerFile: null,
        headerFileName: "invitacion.pdf",
      }),
    ),
    true,
  );
});

test("buildWizardFormData manda payload plano y header_1", () => {
  const file = new File(["pdf"], "invitacion.pdf", { type: "application/pdf" });
  const form = buildWizardFormData(
    draft({ headerType: "document", headerFile: file }),
  );
  assert.equal(form instanceof FormData, true);
  assert.equal(
    form.get("payload"),
    JSON.stringify({
      displayName: "Invitación formal",
      headerType: "document",
      body: OK_BODY,
      slotMappings: {
        "1": { type: "field", key: "nombre" },
        "2": { type: "field", key: "numero_invitados" },
      },
    }),
  );
  assert.equal(form.get("header_1"), file);
  assert.equal(form.get("header_2"), null);
  const payload = JSON.parse(String(form.get("payload")));
  assert.equal(payload.templates, undefined);
});

test("buildWizardFormData incluye extras del preset con fecha y lugar", () => {
  const evento = wizardPresetById("evento");
  const form = buildWizardFormData(
    draft({
      displayName: evento.displayName,
      body: evento.body,
      slotMappings: evento.slotMappings,
    }),
  );
  const payload = JSON.parse(String(form.get("payload")));
  assert.deepEqual(payload, {
    displayName: "Invitación con fecha y lugar",
    headerType: "none",
    body: evento.body,
    slotMappings: evento.slotMappings,
  });
  assert.equal(form.get("header_1"), null);
});

test("extraPlaceholderIds ignora {{1}} y {{2}}", () => {
  assert.deepEqual(
    extraPlaceholderIds("Hola {{1}}, pases {{2}} extra {{3}} y {{4}}"),
    ["3", "4"],
  );
  assert.deepEqual(extraPlaceholderIds("Hola {{1}}, pases {{2}}"), []);
});

test("extraSlotOptionLabel muestra texto fijo", () => {
  assert.equal(extraSlotOptionLabel("__literal__"), "Texto fijo");
  assert.equal(extraSlotOptionLabel("fecha"), "fecha");
});

test("mergeEventSlotMappings bloquea 1 y 2 y conserva extras", () => {
  const mappings = mergeEventSlotMappings("Hola {{1}}, pases {{2}} el {{3}}", {
    "1": { type: "field", key: "evento" },
    "3": { type: "field", key: "fecha" },
  });
  assert.deepEqual(mappings["1"], { type: "field", key: "nombre" });
  assert.deepEqual(mappings["2"], { type: "field", key: "numero_invitados" });
  assert.deepEqual(mappings["3"], { type: "field", key: "fecha" });
});

test("unmappedExtraNotices pide elegir el significado de cada extra", () => {
  assert.deepEqual(
    unmappedExtraNotices(EXTRA_OK, mergeEventSlotMappings(EXTRA_OK, {})),
    ["Elige qué significa {{3}}."],
  );
  assert.deepEqual(
    unmappedExtraNotices(
      EXTRA_OK,
      mergeEventSlotMappings(EXTRA_OK, {
        "3": { type: "field", key: "lugar" },
      }),
    ),
    [],
  );
  const twoExtras =
    "Hola {{1}}, tienes {{2}} pases reservados para {{3}} el {{4}}. Confirma por este chat cuando puedas, por favor.";
  assert.deepEqual(
    unmappedExtraNotices(twoExtras, mergeEventSlotMappings(twoExtras, {})),
    ["Elige qué significa {{3}}.", "Elige qué significa {{4}}."],
  );
  assert.deepEqual(
    unmappedExtraNotices(
      twoExtras,
      mergeEventSlotMappings(twoExtras, {
        "3": { type: "field", key: "lugar" },
        "4": { type: "literal", value: "   " },
      }),
    ),
    ["Elige qué significa {{4}}."],
  );
  assert.deepEqual(unmappedExtraNotices(OK_BODY, mergeEventSlotMappings(OK_BODY, {})), []);
});

test("isEventTemplateCardReady exige mapeo de extras y archivo si aplica", () => {
  const body = EXTRA_OK;
  assert.equal(
    isEventTemplateCardReady({
      body,
      headerType: "none",
      slotMappings: mergeEventSlotMappings(body, {}),
    }),
    false,
  );
  assert.equal(
    isEventTemplateCardReady({
      body,
      headerType: "none",
      slotMappings: mergeEventSlotMappings(body, {
        "3": { type: "field", key: "fecha" },
      }),
    }),
    true,
  );
  assert.equal(
    isEventTemplateCardReady({
      body: OK_BODY,
      headerType: "document",
      headerFile: null,
      headerFileName: null,
      slotMappings: mergeEventSlotMappings(OK_BODY, {}),
    }),
    false,
  );
  assert.equal(
    isEventTemplateCardReady({
      body: OK_BODY,
      headerType: "document",
      headerFileName: "invitacion.pdf",
      slotMappings: mergeEventSlotMappings(OK_BODY, {}),
    }),
    true,
  );
});

test("isEventTemplateCardReady usa la misma puerta que el wizard", () => {
  const withMetaErrors = {
    body: "Hola {{1}}",
    headerType: "none" as const,
    slotMappings: mergeEventSlotMappings("Hola {{1}}", {}),
  };
  assert.ok(metaTemplateBodyErrors(withMetaErrors.body).length > 1);
  assert.equal(isEventTemplateCardReady(withMetaErrors), false);
  assert.equal(isWizardCardReady(withMetaErrors), false);
  assert.equal(
    isEventTemplateCardReady(draft({ body: EXTRA_OK })),
    isWizardCardReady(draft({ body: EXTRA_OK })),
  );
});

test("buildEventTemplateFormData manda payload JSON y header", () => {
  const file = new File(["pdf"], "invitacion.pdf", { type: "application/pdf" });
  const form = buildEventTemplateFormData({
    body: "Hola {{1}}, pases {{2}} el {{3}}",
    headerType: "document",
    isCampaign: true,
    slotMappings: {
      "1": { type: "field", key: "nombre" },
      "2": { type: "field", key: "numero_invitados" },
      "3": { type: "literal", value: "sábado" },
    },
    headerFile: file,
  });
  assert.equal(
    form.get("payload"),
    JSON.stringify({
      body: "Hola {{1}}, pases {{2}} el {{3}}",
      headerType: "document",
      slotMappings: {
        "1": { type: "field", key: "nombre" },
        "2": { type: "field", key: "numero_invitados" },
        "3": { type: "literal", value: "sábado" },
      },
      isCampaign: true,
    }),
  );
  assert.equal(form.get("header"), file);
});

test("buildEventTemplateFormData incluye displayName en el payload", () => {
  const form = buildEventTemplateFormData({
    displayName: "  Invitación con mesa  ",
    body: OK_BODY,
    headerType: "none",
    isCampaign: false,
    slotMappings: mergeEventSlotMappings(OK_BODY, {}),
  });
  const payload = JSON.parse(String(form.get("payload")));
  assert.equal(payload.displayName, "  Invitación con mesa  ");
});

test("campaignTemplateStatus usa la fila isCampaign", () => {
  assert.equal(
    campaignTemplateStatus([
      {
        isCampaign: false,
        template: { status: "APPROVED" },
      },
      {
        isCampaign: true,
        template: { status: "PENDING" },
      },
    ]),
    "PENDING",
  );
  assert.equal(campaignTemplateStatus([]), null);
});

test("isCampaignLaunchBlocked solo si el GET llegó y no está APPROVED", () => {
  assert.equal(isCampaignLaunchBlocked("APPROVED", false), false);
  assert.equal(isCampaignLaunchBlocked("PENDING", false), true);
  assert.equal(isCampaignLaunchBlocked("REJECTED", false), true);
  assert.equal(isCampaignLaunchBlocked(null, false), true);
  assert.equal(isCampaignLaunchBlocked("APPROVED", true), false);
  assert.equal(isCampaignLaunchBlocked("PENDING", true), false);
  assert.equal(isCampaignLaunchBlocked(null, true), false);
});

test("shouldShowEventTemplateCards oculta el editor si el GET falló", () => {
  assert.equal(shouldShowEventTemplateCards(true, false), false);
  assert.equal(shouldShowEventTemplateCards(false, true), false);
  assert.equal(shouldShowEventTemplateCards(true, true), false);
  assert.equal(shouldShowEventTemplateCards(false, false), true);
});

test("insertWizardVariable aplica preset si el cuerpo está vacío", () => {
  const formal = wizardPresetById("formal");
  const result = insertWizardVariable({
    body: "",
    cursorStart: 0,
    cursorEnd: 0,
    fieldKey: "lugar",
    slotMappings: {},
    emptyFallback: {
      body: formal.body,
      slotMappings: formal.slotMappings,
      displayName: formal.displayName,
    },
  });
  assert.equal(result.body, formal.body);
  assert.equal(result.usedFallback, true);
  assert.equal(result.error, null);
  assert.deepEqual(result.slotMappings, formal.slotMappings);
});

test("insertWizardVariable al final inserta antes del cierre y no duplica nombre", () => {
  const approved = "Hola {{1}} tienes {{2}} pases de invitado.";
  const atEnd = insertWizardVariable({
    body: approved,
    cursorStart: approved.length,
    cursorEnd: approved.length,
    fieldKey: "lugar",
    slotMappings: mergeEventSlotMappings(approved, {}),
  });
  assert.equal(atEnd.error, null);
  assert.ok(atEnd.body.includes("{{3}}"));
  assert.ok(!/^\{\{\d+\}\}/.test(atEnd.body.trim()));
  assert.ok(!/\{\{\d+\}\}$/.test(atEnd.body.trim()));
  assert.deepEqual(atEnd.slotMappings["3"], { type: "field", key: "lugar" });
  assert.deepEqual(metaTemplateBodyErrors(atEnd.body), []);

  const formal = wizardPresetById("formal");
  const dup = insertWizardVariable({
    body: formal.body,
    cursorStart: 20,
    cursorEnd: 20,
    fieldKey: "nombre",
    slotMappings: formal.slotMappings,
  });
  assert.equal(dup.body, formal.body);
  assert.equal(dup.alreadyPresent, true);
  assert.ok(dup.body.includes("{{1}}"));
});

test("insertWizardVariable al inicio inserta en un hueco interior válido", () => {
  const approved = "Hola {{1}} tienes {{2}} pases de invitado.";
  const atStart = insertWizardVariable({
    body: approved,
    cursorStart: 0,
    cursorEnd: 0,
    fieldKey: "fecha",
    slotMappings: mergeEventSlotMappings(approved, {}),
  });
  assert.equal(atStart.error, null);
  assert.ok(atStart.body.includes("{{3}}"));
  assert.ok(!/^\{\{\d+\}\}/.test(atStart.body.trim()));
  assert.ok(!/\{\{\d+\}\}$/.test(atStart.body.trim()));
  assert.deepEqual(atStart.slotMappings["3"], { type: "field", key: "fecha" });
});

test("insertWizardVariable inserta {{3}} lugar en medio del preset Formal", () => {
  const formal = wizardPresetById("formal");
  const at = formal.body.indexOf("nuestra celebración");
  assert.ok(at > 0);
  const result = insertWizardVariable({
    body: formal.body,
    cursorStart: at,
    cursorEnd: at,
    fieldKey: "lugar",
    slotMappings: formal.slotMappings,
  });
  assert.equal(result.error, null);
  assert.equal(result.usedFallback, false);
  assert.ok(result.body.includes("{{3}}"));
  assert.ok(!result.body.includes("{{lugar}}"));
  assert.deepEqual(result.slotMappings["3"], { type: "field", key: "lugar" });
  assert.deepEqual(metaTemplateBodyErrors(result.body), []);
  assert.equal(
    canSubmitWizard(
      draft({
        displayName: formal.displayName,
        body: result.body,
        slotMappings: result.slotMappings,
      }),
    ),
    true,
  );
});
