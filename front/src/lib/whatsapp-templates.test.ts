import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildWizardFormData,
  canSubmitWizard,
  extractBodyPlaceholders,
  isWizardCardReady,
  statusBadgeLabel,
  wizardBodyError,
  type WizardTemplateDraft,
} from "./whatsapp-templates.ts";

const WIZARD_BODY_ERROR = "Incluye {{1}} (nombre) y {{2}} (número de pases).";

function draft(
  overrides: Partial<WizardTemplateDraft> = {},
): WizardTemplateDraft {
  return {
    slot: 1,
    headerType: "none",
    body: "Hola {{1}}, pases {{2}}",
    isCampaign: true,
    headerFile: null,
    ...overrides,
  };
}

test("wizardBodyError exige {{1}} y {{2}}", () => {
  assert.equal(typeof wizardBodyError("hola"), "string");
  assert.equal(wizardBodyError("hola"), WIZARD_BODY_ERROR);
  assert.equal(wizardBodyError("Hola {{1}}, pases {{2}}"), null);
});

test("wizardBodyError rechaza huecos y extras del wizard", () => {
  assert.equal(wizardBodyError("Hola {{1}}"), WIZARD_BODY_ERROR);
  assert.equal(
    wizardBodyError("Hola {{1}}, pases {{2}} extra {{3}}"),
    WIZARD_BODY_ERROR,
  );
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
  assert.equal(
    canSubmitWizard([draft(), draft({ slot: 2, body: "" })]),
    false,
  );
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
          body: "Hola {{1}}, pases {{2}}",
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
