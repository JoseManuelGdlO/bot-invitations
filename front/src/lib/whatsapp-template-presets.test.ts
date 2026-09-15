import assert from "node:assert/strict";
import { test } from "node:test";
import {
  WIZARD_PRESETS,
  WIZARD_UNIVERSAL_FIELDS,
  isWizardBodyDirty,
  matchWizardPreset,
  wizardPresetById,
} from "./whatsapp-template-presets.ts";
import { metaTemplateBodyErrors } from "./whatsapp-templates.ts";

const FORMAL_BODY =
  "Hola {{1}}, te escribimos para invitarte con mucho gusto a nuestra celebración. Reservamos {{2}} pases a tu nombre. Confírmanos tu asistencia por este chat cuando puedas, por favor.";
const CERCANO_BODY =
  "¡Hola {{1}}! Qué gusto saludarte. Guardamos {{2}} lugares para ti en nuestra celebración. Responde a este mensaje para confirmar si nos acompañas, por favor.";
const EVENTO_BODY =
  "Hola {{1}}, te invitamos a {{3}}. Reservamos {{2}} pases a tu nombre. Te esperamos el {{4}} en {{5}}. Confirma tu asistencia respondiendo este mensaje, por favor.";

test("WIZARD_UNIVERSAL_FIELDS es la lista cerrada del wizard", () => {
  assert.deepEqual(
    [...WIZARD_UNIVERSAL_FIELDS],
    [
      "nombre",
      "numero_invitados",
      "evento",
      "fecha",
      "lugar",
      "direccion",
      "hora",
      "planner",
      "nombre_completo",
    ],
  );
});

test("presets Formal / Cercano / Con evento tienen copy, header y mappings cerrados", () => {
  assert.equal(WIZARD_PRESETS.length, 3);

  const formal = wizardPresetById("formal");
  assert.equal(formal.displayName, "Invitación formal");
  assert.equal(formal.headerType, "none");
  assert.equal(formal.body, FORMAL_BODY);
  assert.deepEqual(formal.slotMappings, {
    "1": { type: "field", key: "nombre" },
    "2": { type: "field", key: "numero_invitados" },
  });

  const cercano = wizardPresetById("cercano");
  assert.equal(cercano.displayName, "Invitación cercana");
  assert.equal(cercano.headerType, "none");
  assert.equal(cercano.body, CERCANO_BODY);
  assert.deepEqual(cercano.slotMappings, {
    "1": { type: "field", key: "nombre" },
    "2": { type: "field", key: "numero_invitados" },
  });

  const evento = wizardPresetById("evento");
  assert.equal(evento.displayName, "Invitación con fecha y lugar");
  assert.equal(evento.headerType, "none");
  assert.equal(evento.body, EVENTO_BODY);
  assert.deepEqual(evento.slotMappings, {
    "1": { type: "field", key: "nombre" },
    "2": { type: "field", key: "numero_invitados" },
    "3": { type: "field", key: "evento" },
    "4": { type: "field", key: "fecha" },
    "5": { type: "field", key: "lugar" },
  });
});

test("cada preset pasa metaTemplateBodyErrors vacío", () => {
  for (const preset of WIZARD_PRESETS) {
    assert.deepEqual(metaTemplateBodyErrors(preset.body), []);
  }
});

test("matchWizardPreset reconoce el cuerpo exacto y isWizardBodyDirty", () => {
  const formal = wizardPresetById("formal");
  assert.equal(matchWizardPreset(FORMAL_BODY)?.id, "formal");
  assert.equal(matchWizardPreset("otro cuerpo"), null);
  assert.equal(isWizardBodyDirty(FORMAL_BODY, formal), false);
  assert.equal(isWizardBodyDirty(FORMAL_BODY + " extra", formal), true);
  assert.equal(isWizardBodyDirty("", null), false);
  assert.equal(isWizardBodyDirty("hola", null), true);
});
