import assert from "node:assert/strict";
import { test } from "node:test";
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
  isCampaignLaunchBlocked,
  isEventTemplateCardReady,
  isWizardCardReady,
  mergeEventSlotMappings,
  metaTemplateBodyErrors,
  shouldShowEventTemplateCards,
  statusBadgeLabel,
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
  return {
    slot: 1,
    headerType: "none",
    body: OK_BODY,
    isCampaign: true,
    headerFile: null,
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

test("metaTemplateBodyErrors rechaza Hola {{1}} por final y secuencia", () => {
  const errors = metaTemplateBodyErrors("Hola {{1}}");
  assert.ok(errors.includes(ERROR_END));
  assert.ok(errors.includes(ERROR_SEQUENCE));
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
  assert.equal(wizardBodyError("hola"), ERROR_SEQUENCE);
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

test("canSubmitWizard exige que todas las tarjetas visibles estén listas", () => {
  assert.equal(canSubmitWizard([draft({ body: "hola" })]), false);
  assert.equal(canSubmitWizard([draft()]), true);
  assert.equal(canSubmitWizard([draft(), draft({ slot: 2, body: "" })]), false);
  assert.equal(
    canSubmitWizard([draft(), draft({ slot: 2, isCampaign: false })]),
    true,
  );
});

test("buildWizardFormData manda payload JSON y header_1", () => {
  const file = new File(["pdf"], "invitacion.pdf", { type: "application/pdf" });
  const form = buildWizardFormData([
    draft({ headerType: "document", headerFile: file }),
  ]);
  assert.equal(form instanceof FormData, true);
  assert.equal(
    form.get("payload"),
    JSON.stringify({
      templates: [
        {
          slot: 1,
          headerType: "document",
          body: OK_BODY,
          isCampaign: true,
        },
      ],
    }),
  );
  assert.equal(form.get("header_1"), file);
  assert.equal(form.get("header_2"), null);
});

test("buildWizardFormData fuerza campaña con una sola tarjeta válida", () => {
  const form = buildWizardFormData([draft({ isCampaign: false })]);
  const payload = JSON.parse(String(form.get("payload")));
  assert.equal(payload.templates.length, 1);
  assert.equal(payload.templates[0].isCampaign, true);
  assert.equal(payload.templates[0].slot, 1);
});

test("buildWizardFormData incluye todas las tarjetas visibles listas", () => {
  const form = buildWizardFormData([
    draft({ isCampaign: true }),
    draft({ slot: 2, isCampaign: false }),
  ]);
  const payload = JSON.parse(String(form.get("payload")));
  assert.equal(payload.templates.length, 2);
  assert.equal(payload.templates[0].slot, 1);
  assert.equal(payload.templates[1].slot, 2);
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
