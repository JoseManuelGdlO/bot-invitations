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
  editorBodyFromStored,
  editorNotice,
  extractBodyPlaceholders,
  insertWizardVariable,
  storedBodyFromEditor,
  templateHeaderPreviewState,
  CAMPAIGN_LAUNCH_TEMPLATE_NOT_APPROVED,
  CAMPAIGN_LAUNCH_TEMPLATES_UNAVAILABLE,
  eventTemplatesLoadUi,
  isCampaignLaunchBlocked,
  isEventTemplateCardReady,
  isMetaTemplateInReview,
  isWhatsAppUnconfiguredError,
  isWizardCardReady,
  META_TEMPLATE_PENDING_EDIT_HINT,
  mergeEventSlotMappings,
  metaTemplateBodyErrors,
  metaTemplateStatusHint,
  shouldShowEventTemplateCards,
  secondaryCampaignLaunchNotice,
  statusBadgeLabel,
  WHATSAPP_CONNECTED_NEXT_STEP,
  WHATSAPP_SETUP_CTA_DESCRIPTION,
  WHATSAPP_SETUP_CTA_LABEL,
  unapprovedSecondaryCampaignPurposes,
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

test("metaTemplateStatusHint explica el impacto en envíos", () => {
  assert.match(metaTemplateStatusHint("PENDING"), /No se puede usar en envíos/);
  assert.match(metaTemplateStatusHint("APPROVED"), /Lista para envíos/);
  assert.match(metaTemplateStatusHint("REJECTED"), /rechazó/);
  assert.match(metaTemplateStatusHint("PAUSED"), /Pausada/);
  assert.equal(
    metaTemplateStatusHint("DISABLED"),
    metaTemplateStatusHint("PAUSED"),
  );
  assert.equal(metaTemplateStatusHint(""), "");
  assert.equal(metaTemplateStatusHint(null), "");
});

test("templateHeaderPreviewState oculta el encabezado si es solo texto", () => {
  assert.deepEqual(templateHeaderPreviewState(draft()), { kind: "none" });
});

test("templateHeaderPreviewState usa placeholder si falta el archivo", () => {
  assert.deepEqual(templateHeaderPreviewState(draft({ headerType: "image" })), {
    kind: "empty",
    headerType: "image",
  });
  assert.deepEqual(
    templateHeaderPreviewState(draft({ headerType: "document" })),
    { kind: "empty", headerType: "document" },
  );
});

test("templateHeaderPreviewState previsualiza la imagen o el PDF cargado", () => {
  const image = new File(["x"], "portada.png", { type: "image/png" });
  const pdf = new File(["%PDF"], "invitacion.pdf", { type: "application/pdf" });
  const word = new File(["x"], "invitacion.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  assert.deepEqual(
    templateHeaderPreviewState(
      draft({ headerType: "image", headerFile: image }),
    ),
    { kind: "image", source: "file", fileName: "portada.png" },
  );
  assert.deepEqual(
    templateHeaderPreviewState(
      draft({ headerType: "document", headerFile: pdf }),
    ),
    {
      kind: "document",
      source: "file",
      fileName: "invitacion.pdf",
      previewablePdf: true,
    },
  );
  assert.deepEqual(
    templateHeaderPreviewState(
      draft({ headerType: "document", headerFile: word }),
    ),
    {
      kind: "document",
      source: "file",
      fileName: "invitacion.docx",
      previewablePdf: false,
    },
  );
});

test("templateHeaderPreviewState muestra el archivo guardado sin tratarlo como vacío", () => {
  assert.deepEqual(
    templateHeaderPreviewState(
      draft({ headerType: "image", headerFileName: "portada.jpg" }),
    ),
    { kind: "image", source: "saved", fileName: "portada.jpg" },
  );
  assert.deepEqual(
    templateHeaderPreviewState(
      draft({ headerType: "document", headerFileName: "existente" }),
    ),
    {
      kind: "document",
      source: "saved",
      fileName: "Archivo actual",
      previewablePdf: false,
    },
  );
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

test("isMetaTemplateInReview bloquea edición si está PENDING", () => {
  assert.equal(isMetaTemplateInReview("PENDING"), true);
  assert.equal(isMetaTemplateInReview("APPROVED"), false);
  assert.equal(isMetaTemplateInReview("REJECTED"), false);
  assert.equal(isMetaTemplateInReview("DRAFT"), false);
  assert.equal(isMetaTemplateInReview(null), false);
  assert.equal(
    META_TEMPLATE_PENDING_EDIT_HINT,
    "No se puede editar una plantilla en revisión",
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

test("campaignTemplateStatus ignora reminder isCampaign y usa la invitación", () => {
  assert.equal(
    campaignTemplateStatus([
      {
        isCampaign: true,
        template: { status: "PENDING", purpose: "reminder" },
      },
      {
        isCampaign: true,
        template: { status: "APPROVED", purpose: "invitation" },
      },
    ]),
    "APPROVED",
  );
});

test("unapprovedSecondaryCampaignPurposes lista reminder y followup no APPROVED", () => {
  assert.deepEqual(
    unapprovedSecondaryCampaignPurposes([
      {
        isCampaign: true,
        template: { status: "APPROVED", purpose: "invitation" },
      },
      {
        isCampaign: true,
        template: { status: "PENDING", purpose: "reminder" },
      },
      {
        isCampaign: true,
        template: { status: "REJECTED", purpose: "followup" },
      },
    ]),
    ["reminder", "followup"],
  );
  assert.deepEqual(
    unapprovedSecondaryCampaignPurposes([
      {
        isCampaign: true,
        template: { status: "PENDING", purpose: "invitation" },
      },
      {
        isCampaign: true,
        template: { status: "APPROVED", purpose: "reminder" },
      },
    ]),
    [],
  );
  assert.deepEqual(
    unapprovedSecondaryCampaignPurposes([
      {
        isCampaign: false,
        template: { status: "PENDING", purpose: "reminder" },
      },
    ]),
    [],
  );
});

test("secondaryCampaignLaunchNotice nombra Recordatorio y Seguimiento", () => {
  assert.match(
    secondaryCampaignLaunchNotice(["reminder"]),
    /La plantilla de Recordatorio aún no está aprobada/,
  );
  assert.match(
    secondaryCampaignLaunchNotice(["reminder", "followup"]),
    /Las plantillas de Recordatorio y Seguimiento aún no están aprobadas/,
  );
  assert.equal(secondaryCampaignLaunchNotice([]), "");
});

test("isCampaignLaunchBlocked si el GET llegó y no está APPROVED", () => {
  assert.equal(isCampaignLaunchBlocked("APPROVED", false), false);
  assert.equal(isCampaignLaunchBlocked("PENDING", false), true);
  assert.equal(isCampaignLaunchBlocked("REJECTED", false), true);
  assert.equal(isCampaignLaunchBlocked(null, false), true);
});

test("isCampaignLaunchBlocked si no se pudieron comprobar las plantillas", () => {
  assert.equal(isCampaignLaunchBlocked("APPROVED", true), true);
  assert.equal(isCampaignLaunchBlocked("PENDING", true), true);
  assert.equal(isCampaignLaunchBlocked(null, true), true);
  assert.equal(isCampaignLaunchBlocked("APPROVED", true, true), true);
});

test("isCampaignLaunchBlocked si WhatsApp no está configurado aunque el GET falle", () => {
  assert.equal(isCampaignLaunchBlocked("APPROVED", false, false), true);
  assert.equal(isCampaignLaunchBlocked("PENDING", true, false), true);
  assert.equal(isCampaignLaunchBlocked("APPROVED", true, false), true);
  assert.equal(isCampaignLaunchBlocked("APPROVED", false, true), false);
});

test("shouldShowEventTemplateCards oculta el editor si el GET falló", () => {
  assert.equal(shouldShowEventTemplateCards(true, false), false);
  assert.equal(shouldShowEventTemplateCards(false, true), false);
  assert.equal(shouldShowEventTemplateCards(true, true), false);
  assert.equal(shouldShowEventTemplateCards(false, false), true);
});

test("shouldShowEventTemplateCards oculta si WhatsApp no está configurado", () => {
  assert.equal(shouldShowEventTemplateCards(false, false, false), false);
  assert.equal(shouldShowEventTemplateCards(false, false, true), true);
  assert.equal(shouldShowEventTemplateCards(false, true, true), false);
});

test("copy de CTA WhatsApp y plantilla de campaña no aprobada", () => {
  assert.match(
    WHATSAPP_SETUP_CTA_DESCRIPTION,
    /configurar tu cuenta de WhatsApp/,
  );
  assert.equal(WHATSAPP_SETUP_CTA_LABEL, "Conectar WhatsApp");
  assert.match(CAMPAIGN_LAUNCH_TEMPLATE_NOT_APPROVED, /Aprobada/);
  assert.match(CAMPAIGN_LAUNCH_TEMPLATE_NOT_APPROVED, /Mensajes/);
  assert.match(CAMPAIGN_LAUNCH_TEMPLATES_UNAVAILABLE, /comprobar tus plantillas/);
  assert.match(WHATSAPP_CONNECTED_NEXT_STEP, /apruebe/);
});

test("isWhatsAppUnconfiguredError detecta el 400 de Meta sin WhatsApp", () => {
  const unconfigured = Object.assign(
    new Error("WhatsApp (Meta) no está configurado."),
    { status: 400 },
  );
  assert.equal(isWhatsAppUnconfiguredError(unconfigured), true);
  assert.equal(
    isWhatsAppUnconfiguredError("WhatsApp (Meta) no está configurado."),
    true,
  );
  assert.equal(
    isWhatsAppUnconfiguredError(new Error("No se pudieron cargar las plantillas de Meta.")),
    false,
  );
  assert.equal(
    isWhatsAppUnconfiguredError(
      Object.assign(new Error("Error de red"), { status: 500 }),
    ),
    false,
  );
});

test("eventTemplatesLoadUi no borra WhatsApp OK si solo falla el listado", () => {
  const ui = eventTemplatesLoadUi({
    statusConfigured: true,
    listError: new Error("Error de red"),
  });
  assert.equal(ui.whatsappConfigured, true);
  assert.equal(ui.showWhatsAppSetupCta, false);
  assert.match(ui.error, /Error de red/);
});

test("eventTemplatesLoadUi muestra CTA si el error es WhatsApp no configurado", () => {
  const ui = eventTemplatesLoadUi({
    statusConfigured: null,
    listError: Object.assign(new Error("WhatsApp (Meta) no está configurado."), {
      status: 400,
    }),
  });
  assert.equal(ui.whatsappConfigured, false);
  assert.equal(ui.showWhatsAppSetupCta, true);
});

test("eventTemplatesLoadUi no inventa desconectado si el status falló", () => {
  const ui = eventTemplatesLoadUi({
    statusConfigured: null,
    listError: new Error("Error de red"),
  });
  assert.equal(ui.showWhatsAppSetupCta, false);
  assert.match(ui.error, /Error de red/);
});

test("eventTemplatesLoadUi conserva el listado si el status falló pero las plantillas llegaron", () => {
  const ui = eventTemplatesLoadUi({ statusConfigured: null });
  assert.equal(ui.whatsappConfigured, true);
  assert.equal(ui.showWhatsAppSetupCta, false);
  assert.equal(ui.error, "");
});

test("eventTemplatesLoadUi muestra CTA si el status dice que no hay WhatsApp", () => {
  const ui = eventTemplatesLoadUi({ statusConfigured: false });
  assert.equal(ui.whatsappConfigured, false);
  assert.equal(ui.showWhatsAppSetupCta, true);
  assert.equal(ui.error, "");
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

test("el editor muestra {{nombre}} y al guardar vuelve a {{1}}", () => {
  const stored = storedBodyFromEditor(
    "Hola {{nombre}}, tienes {{numero_invitados}} pases para {{fecha}}.",
  );
  assert.equal(
    stored.body,
    "Hola {{1}}, tienes {{2}} pases para {{3}}.",
  );
  assert.deepEqual(stored.slotMappings["3"], { type: "field", key: "fecha" });
  const editor = editorBodyFromStored(stored.body, stored.slotMappings);
  assert.equal(
    editor.text,
    "Hola {{nombre}}, tienes {{numero_invitados}} pases para {{fecha}}.",
  );
  assert.equal(
    editorNotice(
      "Incluye {{1}} (nombre) y {{2}} (número de pases). Las dos son obligatorias.",
      stored.slotMappings,
    ),
    "Incluye {{nombre}} (nombre) y {{numero_invitados}} (número de pases). Las dos son obligatorias.",
  );
});
