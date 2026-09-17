import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ACCOUNT_TEMPLATE_DELETE_META_COPY,
  ACCOUNT_TEMPLATES_EMPTY_NEEDS_SETUP,
  ACCOUNT_TEMPLATES_EMPTY_NONE,
  LAST_WABA_DEFAULT_DELETE_HINT,
  accountTemplateDeleteWarning,
  accountWhatsappTemplatesEmptyCopy,
  canDeleteAccountWhatsappTemplate,
  customAccountTemplateEditWarning,
  isSoleWabaDefault,
} from "./whatsapp-account-templates.ts";

function tpl(overrides: {
  id?: string | null;
  isWabaDefault?: boolean;
  purpose?: string;
} = {}) {
  return {
    id: overrides.id ?? "tpl_1",
    isWabaDefault: overrides.isWabaDefault ?? true,
    purpose: overrides.purpose,
  };
}

test("isSoleWabaDefault es por propósito", () => {
  const invitation = tpl({ id: "tpl_inv", isWabaDefault: true, purpose: "invitation" });
  const reminder = tpl({ id: "tpl_rm", isWabaDefault: true, purpose: "reminder" });
  const list = [invitation, reminder];
  assert.equal(isSoleWabaDefault(invitation, list), true);
  assert.equal(canDeleteAccountWhatsappTemplate(invitation, list), false);
  assert.equal(isSoleWabaDefault(reminder, list), true);
  assert.equal(canDeleteAccountWhatsappTemplate(reminder, list), false);
});

test("isSoleWabaDefault es true si es el único default de la lista", () => {
  const sole = tpl({ id: "tpl_def", isWabaDefault: true });
  const list = [
    sole,
    tpl({ id: "tpl_custom", isWabaDefault: false }),
  ];
  assert.equal(isSoleWabaDefault(sole, list), true);
  assert.equal(canDeleteAccountWhatsappTemplate(sole, list), false);
});

test("isSoleWabaDefault es false si hay otro default", () => {
  const first = tpl({ id: "tpl_a", isWabaDefault: true });
  const list = [
    first,
    tpl({ id: "tpl_b", isWabaDefault: true }),
  ];
  assert.equal(isSoleWabaDefault(first, list), false);
  assert.equal(canDeleteAccountWhatsappTemplate(first, list), true);
});

test("una personalizada se puede borrar aunque sea la única fila", () => {
  const custom = tpl({ id: "tpl_c", isWabaDefault: false });
  assert.equal(isSoleWabaDefault(custom, [custom]), false);
  assert.equal(canDeleteAccountWhatsappTemplate(custom, [custom]), true);
});

test("accountWhatsappTemplatesEmptyCopy distingue wizard vs lista vacía", () => {
  assert.equal(
    accountWhatsappTemplatesEmptyCopy(false),
    "Primero debes configurar tu cuenta de WhatsApp. Sin ella no puedes crear ni enviar plantillas.",
  );
  assert.equal(
    accountWhatsappTemplatesEmptyCopy(true),
    "Aún no hay plantillas",
  );
  assert.equal(
    ACCOUNT_TEMPLATES_EMPTY_NEEDS_SETUP,
    "Primero debes configurar tu cuenta de WhatsApp. Sin ella no puedes crear ni enviar plantillas.",
  );
  assert.equal(
    accountWhatsappTemplatesEmptyCopy(true, "reminder"),
    "Se crean al completar el wizard de invitación.",
  );
});

test("accountTemplateDeleteWarning lista eventos, campaña y Meta", () => {
  const copy = accountTemplateDeleteWarning({
    eventCount: 2,
    campaignEventCount: 1,
    events: [
      { id: "evt_1", name: "Boda Ana" },
      { id: "evt_2", name: "XV de Laura" },
    ],
  });
  assert.match(copy, /Boda Ana/);
  assert.match(copy, /XV de Laura/);
  assert.match(copy, /campaña/);
  assert.match(copy, /Meta/);
  assert.equal(
    ACCOUNT_TEMPLATE_DELETE_META_COPY,
    "Se borra también en Meta y no se puede deshacer.",
  );
  assert.ok(copy.includes(ACCOUNT_TEMPLATE_DELETE_META_COPY));
});

test("customAccountTemplateEditWarning avisa cuando count=1", () => {
  assert.match(customAccountTemplateEditWarning(1), /1 evento/);
  assert.match(customAccountTemplateEditWarning(3), /3 eventos/);
});

test("LAST_WABA_DEFAULT_DELETE_HINT explica el disable del último default", () => {
  assert.match(LAST_WABA_DEFAULT_DELETE_HINT, /default/i);
  assert.match(LAST_WABA_DEFAULT_DELETE_HINT, /categoría/i);
});
