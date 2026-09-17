import assert from "node:assert/strict";
import { test } from "node:test";
import { WIZARD_EXTRA_FIELDS } from "./whatsapp-template-presets.ts";
import { extraSlotOptions, LITERAL_SLOT_OPTION } from "./whatsapp-templates.ts";
import {
  accountTemplateToDraft,
  buildCreateEventTemplateFormData,
  buildPrimerContactoSelectorOptions,
  canCreateEventCustomTemplate,
  canEditEventExtraMappings,
  CREATE_EVENT_TEMPLATE_SELECTOR_LABEL,
  CREATE_EVENT_TEMPLATE_SELECTOR_VALUE,
  DEFAULT_ACCOUNT_TEMPLATE_BANNER,
  DEFAULT_ACCOUNT_TEMPLATE_SELECTOR_LABEL,
  displayNameOrPreview,
  draftsFromEventTemplates,
  EVENT_TEMPLATE_CAP,
  eventTemplateSlotFromDto,
  eventTemplateVariableKeys,
  extraSlotOptionsForEventTemplate,
  parsePrimerContactoSelectorValue,
  shouldConfirmEventTemplateFork,
  shouldConfirmMetaResubmit,
  shouldShowDefaultTemplateBanner,
  META_RESUBMIT_TITLE_ACCOUNT,
  META_RESUBMIT_TITLE_EVENT,
  META_RESUBMIT_WARNING_ACCOUNT,
  META_RESUBMIT_WARNING_EVENT,
} from "./whatsapp-event-templates.ts";

const OK_BODY =
  "Hola {{1}}, tienes {{2}} pases reservados. Confirma por este chat, por favor.";

function accountTemplate(
  overrides: {
    id?: string | null;
    displayName?: string | null;
    body?: string;
    isWabaDefault?: boolean;
  } = {},
) {
  return {
    id: overrides.id ?? "tpl_default",
    displayName: overrides.displayName ?? "Invitación formal",
    body: overrides.body ?? OK_BODY,
    isWabaDefault: overrides.isWabaDefault ?? true,
  };
}

function linkedTemplate(
  overrides: {
    slot?: number;
    isCampaign?: boolean;
    id?: string | null;
    displayName?: string | null;
    body?: string;
    isWabaDefault?: boolean;
    slotMappings?: Record<string, { type: "field"; key: string }>;
  } = {},
) {
  return {
    id: "link_1",
    slot: overrides.slot ?? 1,
    isCampaign: overrides.isCampaign ?? true,
    slotMappings: overrides.slotMappings ?? {},
    template: {
      id: overrides.id ?? "tpl_default",
      name: "alanna_pc_1",
      metaTemplateId: "meta_1",
      language: "es_MX",
      category: "MARKETING",
      headerType: "none",
      headerFileName: null,
      status: "APPROVED",
      rejectedReason: null,
      body: overrides.body ?? OK_BODY,
      displayName: overrides.displayName ?? "Invitación formal",
      isWabaDefault: overrides.isWabaDefault ?? true,
    },
  };
}

test("displayNameOrPreview usa el alias persistido y si falta recorta el body", () => {
  assert.equal(
    displayNameOrPreview({
      displayName: "  Invitación formal  ",
      body: OK_BODY,
    }),
    "Invitación formal",
  );
  assert.equal(
    displayNameOrPreview({ displayName: null, body: OK_BODY }),
    "Hola, tienes pases reservados. Confirma por este chat, por favor.",
  );
  const preview = displayNameOrPreview({
    displayName: "  ",
    body: `Inicio ${"palabra ".repeat(30)}fin`,
  });
  assert.equal(preview?.length, 80);
  assert.ok(preview?.startsWith("Inicio"));
});

test("tope 10: se puede crear hasta 9 vínculos y no al llegar a 10", () => {
  assert.equal(EVENT_TEMPLATE_CAP, 10);
  assert.equal(canCreateEventCustomTemplate(0), true);
  assert.equal(canCreateEventCustomTemplate(9), true);
  assert.equal(canCreateEventCustomTemplate(10), false);
  assert.equal(canCreateEventCustomTemplate(11), false);
});

test("banner y confirm de fork solo si la plantilla es default de cuenta", () => {
  assert.equal(
    DEFAULT_ACCOUNT_TEMPLATE_BANNER,
    "Esta es la plantilla default de la cuenta. Si la editas y guardas, se crea una copia solo para este evento.",
  );
  assert.equal(
    shouldShowDefaultTemplateBanner({ isWabaDefault: true }),
    true,
  );
  assert.equal(
    shouldShowDefaultTemplateBanner({ isWabaDefault: false }),
    false,
  );
  assert.equal(shouldConfirmEventTemplateFork({ isWabaDefault: true }), true);
  assert.equal(shouldConfirmEventTemplateFork({ isWabaDefault: false }), false);
});

test("shouldConfirmMetaResubmit si la plantilla persistida está APPROVED o REJECTED", () => {
  assert.equal(
    shouldConfirmMetaResubmit({ persisted: true, status: "APPROVED" }),
    true,
  );
  assert.equal(
    shouldConfirmMetaResubmit({ persisted: true, status: "REJECTED" }),
    true,
  );
  assert.equal(
    shouldConfirmMetaResubmit({ persisted: true, status: "PENDING" }),
    false,
  );
  assert.equal(
    shouldConfirmMetaResubmit({ persisted: false, status: "APPROVED" }),
    false,
  );
  assert.equal(shouldConfirmMetaResubmit({ persisted: true, status: null }), false);
  assert.match(META_RESUBMIT_TITLE_EVENT, /revisión de Meta/);
  assert.match(META_RESUBMIT_WARNING_EVENT, /apruebe otra vez/);
  assert.match(META_RESUBMIT_TITLE_ACCOUNT, /mandar esta plantilla a revisión/);
  assert.match(META_RESUBMIT_WARNING_ACCOUNT, /todos los eventos/);
});

test("extras del default se mapean con dropdown de universales; literales y mesa solo en personalizada", () => {
  assert.equal(canEditEventExtraMappings({ isWabaDefault: true }), false);
  assert.equal(canEditEventExtraMappings({ isWabaDefault: false }), true);
  assert.deepEqual(extraSlotOptionsForEventTemplate(true, ["mesa", "vip"]), [
    ...WIZARD_EXTRA_FIELDS,
  ]);
  assert.ok(WIZARD_EXTRA_FIELDS.includes("evento"));
  assert.ok(WIZARD_EXTRA_FIELDS.includes("fecha"));
  assert.ok(!extraSlotOptionsForEventTemplate(true, ["mesa"]).includes("mesa"));
  assert.ok(
    !extraSlotOptionsForEventTemplate(true, ["mesa"]).includes(
      LITERAL_SLOT_OPTION,
    ),
  );
  assert.deepEqual(
    extraSlotOptionsForEventTemplate(false, ["mesa", "vip"]),
    extraSlotOptions(["mesa", "vip"]),
  );
  assert.deepEqual(eventTemplateVariableKeys(true, ["mesa", "vip"]), [
    "nombre",
    "numero_invitados",
    "evento",
    "fecha",
    "lugar",
    "direccion",
    "hora",
    "planner",
    "nombre_completo",
  ]);
  assert.deepEqual(eventTemplateVariableKeys(false, ["mesa", "vip"]), [
    "mesa",
    "vip",
  ]);
});

test("selector: Default de cuenta, personalizadas vinculadas, biblioteca y crear", () => {
  const options = buildPrimerContactoSelectorOptions({
    accountTemplates: [
      accountTemplate(),
      accountTemplate({
        id: "tpl_custom_biblio",
        displayName: "Invitación con mesa",
        isWabaDefault: false,
      }),
    ],
    linkedTemplates: [linkedTemplate()],
  });
  assert.deepEqual(
    options.map((item) => ({ kind: item.kind, label: item.label })),
    [
      { kind: "default", label: DEFAULT_ACCOUNT_TEMPLATE_SELECTOR_LABEL },
      { kind: "library", label: "Invitación con mesa" },
      {
        kind: "create",
        label: CREATE_EVENT_TEMPLATE_SELECTOR_LABEL,
      },
    ],
  );
  assert.equal(options[0]?.value, "linked:1");
  assert.equal(options[1]?.value, "library:tpl_custom_biblio");
  assert.equal(options[2]?.value, CREATE_EVENT_TEMPLATE_SELECTOR_VALUE);
});

test("selector incluye personalizadas ya vinculadas y oculta crear al tope 10", () => {
  const linked = Array.from({ length: 10 }, (_, index) =>
    linkedTemplate({
      slot: index + 1,
      id: index === 0 ? "tpl_default" : `tpl_custom_${index}`,
      displayName: index === 0 ? "Invitación formal" : `Personalizada ${index}`,
      isWabaDefault: index === 0,
      isCampaign: index === 0,
    }),
  );
  const options = buildPrimerContactoSelectorOptions({
    accountTemplates: [
      accountTemplate(),
      accountTemplate({
        id: "tpl_custom_1",
        displayName: "Personalizada 1",
        isWabaDefault: false,
      }),
    ],
    linkedTemplates: linked,
  });
  assert.equal(
    options.some((item) => item.kind === "create"),
    false,
  );
  assert.equal(
    options.filter((item) => item.kind === "linked").length,
    9,
  );
  assert.equal(
    options.find((item) => item.kind === "linked")?.label,
    "Personalizada 1",
  );
  assert.equal(
    options.find((item) => item.value === "linked:2")?.kind,
    "linked",
  );
});

test("selector muestra Default de cuenta desde el vínculo si la biblioteca no cargó", () => {
  const options = buildPrimerContactoSelectorOptions({
    accountTemplates: [],
    linkedTemplates: [linkedTemplate()],
  });
  assert.equal(options[0]?.kind, "default");
  assert.equal(options[0]?.label, DEFAULT_ACCOUNT_TEMPLATE_SELECTOR_LABEL);
  assert.equal(options[0]?.value, "linked:1");
});

test("selector adjunta el default si aún no está vinculado", () => {
  const options = buildPrimerContactoSelectorOptions({
    accountTemplates: [accountTemplate({ id: "tpl_default" })],
    linkedTemplates: [],
  });
  assert.equal(options[0]?.kind, "default");
  assert.equal(options[0]?.value, "library:tpl_default");
  assert.deepEqual(parsePrimerContactoSelectorValue(options[0]!.value), {
    type: "attach",
    templateId: "tpl_default",
  });
});

test("parsePrimerContactoSelectorValue distingue linked, attach y crear", () => {
  assert.deepEqual(parsePrimerContactoSelectorValue("linked:3"), {
    type: "select-linked",
    slot: 3,
  });
  assert.deepEqual(parsePrimerContactoSelectorValue("library:tpl_lib"), {
    type: "attach",
    templateId: "tpl_lib",
  });
  assert.deepEqual(
    parsePrimerContactoSelectorValue(CREATE_EVENT_TEMPLATE_SELECTOR_VALUE),
    { type: "create" },
  );
  assert.equal(parsePrimerContactoSelectorValue("nope"), null);
});

test("eventTemplateSlotFromDto no recorta slots mayores a 2", () => {
  assert.equal(eventTemplateSlotFromDto(1), 1);
  assert.equal(eventTemplateSlotFromDto(2), 2);
  assert.equal(eventTemplateSlotFromDto(10), 10);
  assert.equal(eventTemplateSlotFromDto(0), 1);
  assert.equal(eventTemplateSlotFromDto(1.5), 1);
});

test("draftsFromEventTemplates conserva slot 3 y displayName / isWabaDefault", () => {
  const drafts = draftsFromEventTemplates([
    linkedTemplate({
      slot: 3,
      isCampaign: false,
      id: "tpl_custom",
      displayName: "Con mesa",
      isWabaDefault: false,
    }),
    linkedTemplate({ slot: 1, isCampaign: true }),
  ]);
  assert.equal(drafts.length, 2);
  assert.equal(drafts[0]?.slot, 1);
  assert.equal(drafts[0]?.isWabaDefault, true);
  assert.equal(drafts[0]?.displayName, "Invitación formal");
  assert.equal(drafts[1]?.slot, 3);
  assert.equal(drafts[1]?.isWabaDefault, false);
  assert.equal(drafts[1]?.displayName, "Con mesa");
  assert.equal(drafts.some((draft) => draft.slot === 2), false);
});

test("buildCreateEventTemplateFormData manda source blank o default y header", () => {
  const file = new File(["img"], "portada.png", { type: "image/png" });
  const blank = buildCreateEventTemplateFormData({
    source: "blank",
    displayName: "Invitación con mesa",
    body: OK_BODY,
    headerType: "none",
    slotMappings: {
      "1": { type: "field", key: "nombre" },
      "2": { type: "field", key: "numero_invitados" },
    },
  });
  assert.equal(
    blank.get("payload"),
    JSON.stringify({
      source: "blank",
      displayName: "Invitación con mesa",
      headerType: "none",
      body: OK_BODY,
      slotMappings: {
        "1": { type: "field", key: "nombre" },
        "2": { type: "field", key: "numero_invitados" },
      },
      purpose: "invitation",
    }),
  );
  assert.equal(blank.get("header"), null);

  const fromDefault = buildCreateEventTemplateFormData({
    source: "default",
    displayName: "Copia",
    body: OK_BODY,
    headerType: "image",
    slotMappings: {
      "1": { type: "field", key: "nombre" },
      "2": { type: "field", key: "numero_invitados" },
    },
    headerFile: file,
  });
  const payload = JSON.parse(String(fromDefault.get("payload")));
  assert.equal(payload.source, "default");
  assert.equal(fromDefault.get("header"), file);
});

test("accountTemplateToDraft mapea biblioteca a tarjeta editable", () => {
  const draft = accountTemplateToDraft({
    id: "tpl_custom",
    displayName: "Invitación con mesa",
    name: "alanna_pc_custom",
    status: "APPROVED",
    headerType: "image",
    headerFileName: "portada.jpg",
    body: OK_BODY,
    isWabaDefault: false,
    rejectedReason: null,
    createdAt: "2026-01-02T00:00:00.000Z",
    slotMappings: {
      "1": { type: "field", key: "nombre" },
      "2": { type: "field", key: "numero_invitados" },
      "3": { type: "field", key: "mesa" },
    },
    usage: {
      eventCount: 1,
      campaignEventCount: 1,
      events: [{ id: "evt_1", name: "Boda Ana" }],
    },
  });
  assert.equal(draft.templateId, "tpl_custom");
  assert.equal(draft.displayName, "Invitación con mesa");
  assert.equal(draft.headerType, "image");
  assert.equal(draft.headerFileName, "portada.jpg");
  assert.equal(draft.savedHeaderFileName, "portada.jpg");
  assert.equal(draft.isWabaDefault, false);
  assert.equal(draft.isCampaign, false);
  assert.equal(draft.persisted, true);
  assert.equal(draft.body, OK_BODY);
});

test("draftsFromEventTemplates conserva purpose", () => {
  const drafts = draftsFromEventTemplates([
    {
      id: "link_1",
      slot: 1,
      isCampaign: true,
      slotMappings: {},
      template: {
        id: "tpl_rm",
        name: "alanna_rm_1",
        metaTemplateId: "meta_rm",
        language: "es_MX",
        category: "MARKETING",
        headerType: "none",
        headerFileName: null,
        status: "PENDING",
        rejectedReason: null,
        body: OK_BODY,
        displayName: "Recordatorio amable",
        isWabaDefault: true,
        purpose: "reminder",
      },
    },
  ]);
  assert.equal(drafts[0]?.purpose, "reminder");
});

test("buildCreateEventTemplateFormData incluye purpose", () => {
  const form = buildCreateEventTemplateFormData({
    source: "blank",
    displayName: "Recordatorio amable",
    body: OK_BODY,
    headerType: "none",
    slotMappings: {
      "1": { type: "field", key: "nombre" },
      "2": { type: "field", key: "numero_invitados" },
    },
    purpose: "reminder",
  });
  const payload = JSON.parse(String(form.get("payload")));
  assert.equal(payload.purpose, "reminder");
});
