# Plantillas WhatsApp por evento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tras el Embedded Signup, un wizard crea 1–2 HSM de primer contacto en el WABA del planner; cada evento las hereda o clona; el webhook actualiza el estado; la campaña solo sale si la plantilla marcada está `APPROVED`.

**Architecture:** Tabla `whatsapp_message_templates` (HSM real en Graph) + pivot `event_whatsapp_templates`. CRUD Graph con `META_ACCESS_TOKEN` (fallback: token del planner). Envío con el token de la cuenta y el `name` del pivot. Sin fallback a `META_TEMPLATE_NAME` / `rg_eventos`.

**Tech Stack:** Node ESM, Express, Sequelize/MySQL, Jest (`backend`), TanStack Router + React (`front`), Graph API `META_GRAPH_VERSION`.

**Spec:** `docs/superpowers/specs/2026-09-11-whatsapp-event-templates-design.md`

## Global Constraints

- Wizard **antes** de crear HSM. Copy: Meta tiene que aprobar; sin aprobación no hay campaña.
- Hasta **dos** plantillas de primer contacto; el usuario elige el tipo de **cada una**: `none` | `document` | `image`.
- Wizard: **mínimo una** (marcada para campaña). La segunda puede nacer en Mensajes.
- Primer evento **enlaza**. Evento nuevo / otros existentes **clonan** vía `ensureEventWhatsappTemplates` (idempotente).
- Envío: `{{1}}` = `nombre`, `{{2}}` = `numero_invitados`. Extra: mapeo por slot. `{{1}}`/`{{2}}` no se remapean.
- Token CRUD: `META_ACCESS_TOKEN` o `META_SYSTEM_USER_TOKEN`; si vacío, token del planner. Envío: token de la cuenta. WABA/Phone number ID: cuenta conectada.
- **Sin fallback** a `META_TEMPLATE_NAME` / `META_TEMPLATE_NAME_DOCUMENT`.
- No disparar envíos reales de WhatsApp ni jobs `whatsapp.send` contra números de seed.
- Tests: `cd backend && npm test -- <archivo>`. Front unit: `cd front && npm test -- src/lib/whatsapp-templates.test.ts`.
- Commits en español, un commit por tarea. `docs/` está en `.gitignore`: spec/plan con `git add -f` si hace falta.

---

## File map

**Create**

- `backend/src/services/whatsapp-template-slots.js` — placeholders, mappings, params, ejemplos Graph.
- `backend/src/services/whatsapp-templates.service.js` — wizard, ensure/clone, submit, webhook status, contexto de envío.
- `backend/src/controllers/whatsapp-templates.controller.js` — HTTP wizard + por evento.
- `backend/tests/services/whatsapp-template-slots.test.js`
- `backend/tests/services/whatsapp-templates.service.test.js`
- `backend/tests/services/whatsapp-templates-webhook.test.js`
- `backend/tests/helpers/models-whatsapp-templates.test.js`
- `front/src/lib/whatsapp-templates.ts` — validación BODY + labels de badge.
- `front/src/lib/whatsapp-templates.test.ts`
- `front/src/components/whatsapp-template-wizard-dialog.tsx`
- `front/src/components/whatsapp-template-card.tsx`

**Modify**

- `backend/src/models/index.js` — modelos, associations, `ensureWhatsappTemplateTables`.
- `backend/src/config/env.js` — `accessToken`; quitar `templateName` / `templateNameDocument`.
- `backend/tests/helpers/setupEnv.js`, `backend/tests/helpers/models.js`
- `backend/.env.example`, `.env.example`, `docker-compose.yml`
- `backend/src/server.js`, `backend/src/migrations/migrate.js`
- `backend/src/services/meta-graph.client.js` — create/update/upload resumable.
- `backend/src/services/meta.client.js` — nombre solo del job; header image.
- `backend/src/services/integration-resolver.service.js`
- `backend/src/services/campaign.service.js`, `guest-message.service.js`, `guests.controller.js`, `outbound.worker.js`, `whatsapp.adapter.js`, `opening-document.service.js`
- `backend/src/controllers/meta-webhook.controller.js`
- `backend/src/controllers/events.controller.js` — `ensureEventWhatsappTemplates` en create.
- `backend/src/controllers/whatsapp-meta.controller.js` — `hasTemplate` desde DB.
- `backend/src/routes/index.js`
- Tests que leen `META_TEMPLATE_NAME` / `rg_eventos`.
- `front/src/lib/api/integrations.ts` (o `whatsapp-templates.ts` API)
- `front/src/routes/eventos.whatsapp.tsx`
- `front/src/routes/eventos.$eventId.mensajes.tsx`
- `front/src/routes/eventos.$eventId.resumen.tsx` / `front/src/components/launch-campaign-dialog.tsx`

---

### Task 1: Modelos, env y mocks

**Files:**

- Create: `backend/tests/helpers/models-whatsapp-templates.test.js`
- Modify: `backend/tests/helpers/models.js` (`MODEL_NAMES`)
- Modify: `backend/src/models/index.js`
- Modify: `backend/src/config/env.js`
- Modify: `backend/src/server.js`, `backend/src/migrations/migrate.js`
- Modify: `backend/tests/helpers/setupEnv.js`
- Modify: `backend/.env.example`, `.env.example`, `docker-compose.yml`

**Interfaces:**

- Consumes: `uuid` y `sequelize` existentes en `models/index.js`.
- Produces: modelos `WhatsappMessageTemplate`, `EventWhatsappTemplate`; `ensureWhatsappTemplateTables()`; `env.meta.accessToken`, `env.meta.templateLanguage`, `env.meta.graphVersion`, `env.meta.appId` (sin `templateName` / `templateNameDocument`).

- [ ] **Step 1: Write the failing test**

```js
import { createModelsBundle } from "./models.js";

describe("createModelsBundle whatsapp templates", () => {
  test("incluye WhatsappMessageTemplate y EventWhatsappTemplate", () => {
    const models = createModelsBundle();
    expect(models.WhatsappMessageTemplate.create).toEqual(expect.any(Function));
    expect(models.EventWhatsappTemplate.create).toEqual(expect.any(Function));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- tests/helpers/models-whatsapp-templates.test.js`

Expected: FAIL (`WhatsappMessageTemplate` undefined).

- [ ] **Step 3: Write minimal implementation**

En `MODEL_NAMES` de `backend/tests/helpers/models.js` añadir `"WhatsappMessageTemplate"` y `"EventWhatsappTemplate"`.

En `backend/src/models/index.js`, después de `WhatsappCredential`:

```js
export const WhatsappMessageTemplate = sequelize.define(
  "whatsapp_message_templates",
  {
    id: uuid,
    ownerUserId: { type: DataTypes.CHAR(36), allowNull: false },
    wabaId: { type: DataTypes.STRING(40), allowNull: false },
    metaTemplateId: { type: DataTypes.STRING(40), allowNull: true },
    name: { type: DataTypes.STRING(512), allowNull: false },
    language: { type: DataTypes.STRING(10), allowNull: false, defaultValue: "es_MX" },
    category: { type: DataTypes.STRING(40), allowNull: false, defaultValue: "MARKETING" },
    headerType: {
      type: DataTypes.ENUM("none", "document", "image"),
      allowNull: false,
      defaultValue: "none",
    },
    headerMediaPath: { type: DataTypes.STRING(500), allowNull: true },
    headerFileName: { type: DataTypes.STRING(255), allowNull: true },
    headerMime: { type: DataTypes.STRING(120), allowNull: true },
    headerSize: { type: DataTypes.INTEGER, allowNull: true },
    headerHandle: { type: DataTypes.TEXT, allowNull: true },
    components: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    status: {
      type: DataTypes.ENUM("DRAFT", "PENDING", "APPROVED", "REJECTED", "PAUSED", "DISABLED"),
      allowNull: false,
      defaultValue: "DRAFT",
    },
    rejectedReason: { type: DataTypes.TEXT, allowNull: true },
    isWabaDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    clonedFromId: { type: DataTypes.CHAR(36), allowNull: true },
    lastStatusAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    indexes: [
      { unique: true, fields: ["wabaId", "name"] },
      { fields: ["wabaId", "metaTemplateId"] },
      { fields: ["ownerUserId"] },
    ],
  },
);

export const EventWhatsappTemplate = sequelize.define(
  "event_whatsapp_templates",
  {
    id: uuid,
    eventId: { type: DataTypes.CHAR(36), allowNull: false },
    whatsappMessageTemplateId: { type: DataTypes.CHAR(36), allowNull: false },
    ownerUserId: { type: DataTypes.CHAR(36), allowNull: false },
    slot: { type: DataTypes.TINYINT, allowNull: false },
    isCampaign: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    slotMappings: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  },
  {
    indexes: [
      { unique: true, fields: ["eventId", "slot"] },
      { fields: ["eventId"] },
      { fields: ["whatsappMessageTemplateId"] },
    ],
  },
);
```

Associations junto a las de WhatsApp:

```js
User.hasMany(WhatsappMessageTemplate, { foreignKey: "ownerUserId" });
WhatsappMessageTemplate.belongsTo(User, { foreignKey: "ownerUserId" });
Event.hasMany(EventWhatsappTemplate, { foreignKey: "eventId", as: "whatsappTemplates" });
EventWhatsappTemplate.belongsTo(Event, { foreignKey: "eventId" });
WhatsappMessageTemplate.hasMany(EventWhatsappTemplate, {
  foreignKey: "whatsappMessageTemplateId",
  as: "eventLinks",
});
EventWhatsappTemplate.belongsTo(WhatsappMessageTemplate, {
  foreignKey: "whatsappMessageTemplateId",
  as: "template",
});
```

```js
export async function ensureWhatsappTemplateTables() {
  await WhatsappMessageTemplate.sync();
  await EventWhatsappTemplate.sync();
}
```

Llamar `ensureWhatsappTemplateTables()` en `server.js` y `migrate.js` junto a `ensureWhatsappMetaTables`.

`env.meta`:

```js
accessToken: process.env.META_ACCESS_TOKEN || process.env.META_SYSTEM_USER_TOKEN || "",
templateLanguage: process.env.META_TEMPLATE_LANGUAGE || "es_MX",
graphVersion: (process.env.META_GRAPH_VERSION || "v21.0").replace(/^\/*/, ""),
```

Eliminar `templateName` y `templateNameDocument` de `env.meta`. En `.env.example` (root y backend) y `docker-compose.yml`: quitar `META_TEMPLATE_NAME` / `META_TEMPLATE_NAME_DOCUMENT`; añadir `META_ACCESS_TOKEN`. En `setupEnv.js` quitar esas dos vars; añadir `META_ACCESS_TOKEN=test-meta-access-token`.

No ejecutes la suite completa en esta tarea: `env.meta.templateName` desaparece y otros tests fallarán hasta las tareas 8–14. Solo el test de `createModelsBundle`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- tests/helpers/models-whatsapp-templates.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/models/index.js backend/src/config/env.js backend/src/server.js backend/src/migrations/migrate.js backend/tests/helpers/models.js backend/tests/helpers/setupEnv.js backend/tests/helpers/models-whatsapp-templates.test.js backend/.env.example .env.example docker-compose.yml
git commit -m "$(cat <<'EOF'
feat: tablas pivot de plantillas WhatsApp y token CRUD.

EOF
)"
```

---

### Task 2: Placeholders, mappings y params

**Files:**

- Create: `backend/src/services/whatsapp-template-slots.js`
- Test: `backend/tests/services/whatsapp-template-slots.test.js`

**Interfaces:**

- Consumes: `httpError` (`backend/src/utils/http-error.js`), `eventGuestVars` (solo en `resolveSlotParamValues`).
- Produces:

```js
export const LOCKED_SLOT_MAPPINGS = {
  "1": { type: "field", key: "nombre" },
  "2": { type: "field", key: "numero_invitados" },
};
export function extractBodyPlaceholders(bodyText) // string[] consecutivos "1".."n"
export function assertWizardBody(bodyText) // exige {{1}} y {{2}}, sin huecos
export function defaultSlotMappings(bodyText)
export function mergeSlotMappings(bodyText, incoming)
export function assertSlotMappingsComplete(bodyText, mappings)
export function exampleValuesFromMappings(mappings) // ["María","2", ...]
export function generateTemplateName(slot) // alanna_pc_<8hex>_<slot>
export function buildTemplateComponents({ headerType, headerHandle, bodyText, exampleValues })
export function bodyTextFromComponents(components) // BODY.text | ""
export function resolveSlotParamValues(mappings, vars) // string[] en orden
```

- [ ] **Step 1: Write the failing test**

```js
import {
  assertWizardBody,
  bodyTextFromComponents,
  defaultSlotMappings,
  mergeSlotMappings,
  assertSlotMappingsComplete,
  exampleValuesFromMappings,
  generateTemplateName,
  buildTemplateComponents,
  resolveSlotParamValues,
  LOCKED_SLOT_MAPPINGS,
} from "../../src/services/whatsapp-template-slots.js";

describe("whatsapp-template-slots", () => {
  test("assertWizardBody exige {{1}} y {{2}} consecutivos", () => {
    expect(() => assertWizardBody("Hola")).toThrow(/\{\{1\}\}/);
    expect(() => assertWizardBody("Hola {{1}}")).toThrow(/\{\{2\}\}/);
    expect(() => assertWizardBody("Hola {{1}} pases {{3}}")).toThrow(/hueco|consecutiv/i);
    expect(assertWizardBody("Hola {{1}}, pases {{2}}")).toEqual(["1", "2"]);
  });

  test("defaultSlotMappings fija 1=nombre y 2=pases", () => {
    expect(defaultSlotMappings("Hola {{1}} {{2}} {{3}}")).toEqual({
      "1": LOCKED_SLOT_MAPPINGS["1"],
      "2": LOCKED_SLOT_MAPPINGS["2"],
      "3": null,
    });
  });

  test("mergeSlotMappings rechaza remapear 1 y 2", () => {
    expect(() =>
      mergeSlotMappings("Hola {{1}} {{2}}", {
        "1": { type: "field", key: "fecha" },
        "2": { type: "field", key: "numero_invitados" },
      }),
    ).toThrow(/\{\{1\}\}/);
  });

  test("assertSlotMappingsComplete exige extras mapeados", () => {
    const body = "Hola {{1}} {{2}} el {{3}}";
    const partial = mergeSlotMappings(body, {});
    expect(() => assertSlotMappingsComplete(body, partial)).toThrow(/\{\{3\}\}/);
    const full = mergeSlotMappings(body, { "3": { type: "field", key: "fecha" } });
    expect(assertSlotMappingsComplete(body, full)["3"]).toEqual({ type: "field", key: "fecha" });
  });

  test("exampleValuesFromMappings usa María y 2", () => {
    expect(
      exampleValuesFromMappings({
        "1": LOCKED_SLOT_MAPPINGS["1"],
        "2": LOCKED_SLOT_MAPPINGS["2"],
        "3": { type: "literal", value: "Durango" },
      }),
    ).toEqual(["María", "2", "Durango"]);
  });

  test("generateTemplateName cumple el patrón Meta", () => {
    const name = generateTemplateName(1);
    expect(name).toMatch(/^alanna_pc_[a-f0-9]{8}_1$/);
  });

  test("buildTemplateComponents BODY + header document", () => {
    const components = buildTemplateComponents({
      headerType: "document",
      headerHandle: "4::handle",
      bodyText: "Hola {{1}}, pases {{2}}",
      exampleValues: ["María", "2"],
    });
    expect(components[0]).toMatchObject({
      type: "HEADER",
      format: "DOCUMENT",
      example: { header_handle: ["4::handle"] },
    });
    expect(components[1]).toMatchObject({
      type: "BODY",
      text: "Hola {{1}}, pases {{2}}",
      example: { body_text: [["María", "2"]] },
    });
  });

  test("resolveSlotParamValues usa vars del invitado", () => {
    expect(
      resolveSlotParamValues(
        {
          "1": LOCKED_SLOT_MAPPINGS["1"],
          "2": LOCKED_SLOT_MAPPINGS["2"],
          "3": { type: "literal", value: "Octubre" },
        },
        { nombre: "Luis", numero_invitados: "3", fecha: "2026-11-14" },
      ),
    ).toEqual(["Luis", "3", "Octubre"]);
  });

  test("bodyTextFromComponents lee el BODY del snapshot", () => {
    expect(
      bodyTextFromComponents([
        { type: "HEADER", format: "IMAGE" },
        { type: "BODY", text: "Hola {{1}}, pases {{2}}" },
      ]),
    ).toBe("Hola {{1}}, pases {{2}}");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- tests/services/whatsapp-template-slots.test.js`

Expected: FAIL (módulo no existe).

- [ ] **Step 3: Write minimal implementation**

Implementar `whatsapp-template-slots.js`:

- Regex placeholders: `/\{\{(\d+)\}\}/g`. Ordenar ids numéricos; hueco si falta algún entero entre 1 y max.
- `assertWizardBody`: max >= 2 y sin huecos; si no, `httpError(400, "La plantilla debe incluir {{1}} (nombre) y {{2}} (pases) consecutivos.")`.
- `mergeSlotMappings`: clonar locked 1 y 2; si `incoming["1"]` o `incoming["2"]` difieren, `httpError(400, "{{1}} y {{2}} no se pueden remapear.")`. Extras: `{ type: "field", key }` o `{ type: "literal", value }`. Keys de field: `^\w+$`.
- Extra sin mapear en default: valor `null`. `assertSlotMappingsComplete` tira 400 `"Falta el mapeo de {{n}}."` si algún placeholder es `null` o mapping inválido.
- `exampleValuesFromMappings`: 1 → `"María"`, 2 → `"2"`, field → key como muestra (`fecha` → `"fecha"`) salvo que haya `value`; literal → su value. Orden 1..n.
- `generateTemplateName`: `crypto.randomBytes(4).toString("hex")`.
- `buildTemplateComponents`: si `headerType === "document"` exige `headerHandle` (400 `"La plantilla requiere un archivo de encabezado."`); `image` igual con `format: "IMAGE"`; `none` solo BODY.
- `bodyTextFromComponents`: primer componente `type === "BODY"` (case-insensitive) → `text`; si no hay, `""`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- tests/services/whatsapp-template-slots.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/whatsapp-template-slots.js backend/tests/services/whatsapp-template-slots.test.js
git commit -m "$(cat <<'EOF'
feat: validación de variables HSM {{1}} nombre y {{2}} pases.

EOF
)"
```

---

### Task 3: Graph create / edit / upload resumable

**Files:**

- Modify: `backend/src/services/meta-graph.client.js`
- Modify: `backend/tests/services/meta-graph.client.test.js`

**Interfaces:**

- Consumes: `graphRequest({ method, path, token, query, body, timeoutMs })`, `env.meta.accessToken`, `env.meta.appId`.
- Produces:

```js
export function resolveTemplateCrudToken(plannerAccessToken)
export async function createMessageTemplate({ wabaId, token, payload })
export async function updateMessageTemplate({ templateId, token, payload })
export async function uploadResumableHeader({ token, fileName, fileLength, fileType, buffer })
```

`resolveTemplateCrudToken`: `String(env.meta.accessToken || plannerAccessToken || "").trim()`; si vacío, `httpError(400, "Falta META_ACCESS_TOKEN y la cuenta no tiene token.")`.

`createMessageTemplate`: `POST ${wabaId}/message_templates` body = payload.

`updateMessageTemplate`: `POST ${templateId}` body = payload.

`uploadResumableHeader`:

1. `POST ${appId}/uploads` query `file_name, file_length, file_type, access_token` (o Bearer) → `id` sesión.
2. `POST` binario a `https://graph.facebook.com/${version}/${sessionId}` header `Authorization: OAuth ${token}`, `file_offset: 0`, body = buffer.
3. Devuelve el `h` / `handle` del JSON (`payload.h` o `payload.handle`). Si falta, 502 `"Meta no devolvió header_handle."`.

- [ ] **Step 1: Write the failing test**

Añadir en `meta-graph.client.test.js` (después de resetModules, mock `env.js` con `accessToken: "sys_tok"`, `appId: "app_1"`, `graphVersion: "v21.0"`):

```js
test("resolveTemplateCrudToken prefiere META_ACCESS_TOKEN", async () => {
  await jest.unstable_mockModule("../../src/config/env.js", () => ({
    env: { meta: { accessToken: "sys_tok", appId: "app_1", graphVersion: "v21.0" } },
  }));
  const { resolveTemplateCrudToken } = await import("../../src/services/meta-graph.client.js");
  expect(resolveTemplateCrudToken("planner_tok")).toBe("sys_tok");
});

test("createMessageTemplate POST al WABA", async () => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ id: "111" }),
  }));
  await jest.unstable_mockModule("../../src/config/env.js", () => ({
    env: { meta: { accessToken: "sys_tok", appId: "app_1", graphVersion: "v21.0" } },
  }));
  const { createMessageTemplate } = await import("../../src/services/meta-graph.client.js");
  const out = await createMessageTemplate({
    wabaId: "waba_1",
    token: "sys_tok",
    payload: { name: "alanna_pc_abcd1234_1", language: "es_MX", category: "MARKETING", components: [] },
  });
  expect(out.id).toBe("111");
  const [url, init] = fetch.mock.calls[0];
  expect(url).toContain("/waba_1/message_templates");
  expect(init.method).toBe("POST");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- tests/services/meta-graph.client.test.js`

Expected: FAIL (`resolveTemplateCrudToken` no exportado).

- [ ] **Step 3: Write minimal implementation**

Exportar las tres funciones usando `graphRequest` para create/update. Upload: dos `fetch` (sesión + bytes). Timeout media: `env.meta.mediaTimeoutMs || 60000` si existe; si no, 60000.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- tests/services/meta-graph.client.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/meta-graph.client.js backend/tests/services/meta-graph.client.test.js
git commit -m "$(cat <<'EOF'
feat: Graph API para crear y editar message templates.

EOF
)"
```

---

### Task 4: Servicio wizard (`createWizardTemplates`)

**Files:**

- Create: `backend/src/services/whatsapp-templates.service.js`
- Test: `backend/tests/services/whatsapp-templates.service.test.js`

**Interfaces:**

- Consumes: Task 1 models, Task 2 slots, Task 3 Graph, `Event.findAll`.
- Produces:

```js
export async function createWizardTemplates({
  ownerUserId,
  wabaId,
  plannerAccessToken,
  templates, // [{ slot, headerType, body, isCampaign, headerFile? }]
})
```

`headerFile`: `{ buffer, fileName, mime, size }` o null.

Reglas: `templates.length` 1 o 2; slots 1 y/o 2 únicos; al menos uno `isCampaign`; si uno solo, forzar `isCampaign true`. Cada body `assertWizardBody`. Header document/image exige `headerFile`. Nombre `generateTemplateName(slot)`; si Graph error de duplicado (message/code indica unique/name), un reintento con otro name.

Tras Graph `PENDING`, `WhatsappMessageTemplate.create` con `isWabaDefault: true`. Luego `attachDefaultsToLatestEvent(ownerUserId)`: `Event.findOne({ where: { ownerId }, order: [["createdAt","DESC"]] })`; si hay evento, crear pivots (slot, isCampaign, `defaultSlotMappings` completos solo con 1 y 2 si el body no tiene extras; si hay `{{3}}` en wizard, exigir mapping en el payload o 400). El wizard del spec no mapea extras: **el BODY del wizard puede tener solo {{1}} y {{2}}**; si trae `{{3}}` sin mapping, 400.

Persistir archivo de header en `uploads/template-headers/{ownerUserId}/{templateId}/{fileName}` (`fs.promises.mkdir` recursive, writeFile). Guardar `headerMediaPath` relativo `template-headers/...`.

- [ ] **Step 1: Write the failing test**

Usar `loadWithMocks("src/services/whatsapp-templates.service.js", { extraMocks: { graph, slots if needed }})`.

Patrón:

```js
const { loadWithMocks } = await import("../helpers/loadWithMocks.js");
const { fakeEvent } = await import("../helpers/loadWithMocks.js");

test("wizard crea una HSM PENDING isWabaDefault y attach al evento más reciente", async () => {
  const createMessageTemplate = jest.fn(async () => ({ id: "meta_1" }));
  const event = fakeEvent({ id: "evt_old", ownerId: "usr_1" });
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks: {
      "src/services/meta-graph.client.js": () => ({
        resolveTemplateCrudToken: () => "sys_tok",
        createMessageTemplate,
        updateMessageTemplate: jest.fn(),
        uploadResumableHeader: jest.fn(),
      }),
    },
  });
  models.Event.findOne.mockResolvedValue(event);
  models.WhatsappMessageTemplate.create.mockImplementation(async (row) => ({
    ...row,
    id: "tpl_1",
    update: jest.fn(async function u(p) { Object.assign(this, p); return this; }),
  }));
  models.EventWhatsappTemplate.create.mockImplementation(async (row) => row);
  models.EventWhatsappTemplate.findAll.mockResolvedValue([]);

  const out = await mod.createWizardTemplates({
    ownerUserId: "usr_1",
    wabaId: "waba_1",
    plannerAccessToken: "planner",
    templates: [{
      slot: 1,
      headerType: "none",
      body: "Hola {{1}}, pases {{2}}",
      isCampaign: true,
    }],
  });

  expect(createMessageTemplate).toHaveBeenCalledTimes(1);
  const payload = createMessageTemplate.mock.calls[0][0].payload;
  expect(payload.language).toBe("es_MX");
  expect(payload.category).toBe("MARKETING");
  expect(payload.parameter_format).toBe("POSITIONAL");
  expect(models.WhatsappMessageTemplate.create).toHaveBeenCalledWith(
    expect.objectContaining({
      ownerUserId: "usr_1",
      wabaId: "waba_1",
      metaTemplateId: "meta_1",
      status: "PENDING",
      isWabaDefault: true,
      headerType: "none",
    }),
  );
  expect(models.EventWhatsappTemplate.create).toHaveBeenCalledWith(
    expect.objectContaining({ eventId: "evt_old", slot: 1, isCampaign: true }),
  );
  expect(out).toHaveLength(1);
});

test("wizard sin plantillas válidas 400", async () => {
  const { mod } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks: {
      "src/services/meta-graph.client.js": () => ({
        resolveTemplateCrudToken: () => "sys_tok",
        createMessageTemplate: jest.fn(),
        updateMessageTemplate: jest.fn(),
        uploadResumableHeader: jest.fn(),
      }),
    },
  });
  await expect(mod.createWizardTemplates({
    ownerUserId: "usr_1",
    wabaId: "waba_1",
    plannerAccessToken: "t",
    templates: [],
  })).rejects.toMatchObject({ status: 400 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- tests/services/whatsapp-templates.service.test.js`

Expected: FAIL (módulo no existe).

- [ ] **Step 3: Write minimal implementation**

`createWizardTemplates` como arriba. Sin eventos: no crea pivot. `parameter_format: "POSITIONAL"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- tests/services/whatsapp-templates.service.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/whatsapp-templates.service.js backend/tests/services/whatsapp-templates.service.test.js
git commit -m "$(cat <<'EOF'
feat: wizard crea HSM default del WABA y las engancha al último evento.

EOF
)"
```

---

### Task 5: `ensureEventWhatsappTemplates` attach/clone

**Files:**

- Modify: `backend/src/services/whatsapp-templates.service.js`
- Modify: `backend/tests/services/whatsapp-templates.service.test.js`
- Modify: `backend/src/controllers/events.controller.js`

**Interfaces:**

- Consumes: `createMessageTemplate`, models, `createWizardTemplates` rows.
- Produces:

```js
export async function ensureEventWhatsappTemplates(event)
export async function listEventWhatsappTemplates(eventId)
```

Algoritmo `ensureEventWhatsappTemplates(event)`:

1. Pivots existentes de `event.id` → return `{ attached: false, cloned: false, links }`.
2. Defaults del owner: `WhatsappMessageTemplate.findAll({ where: { ownerUserId: event.ownerId, isWabaDefault: true }, order: [["createdAt","ASC"]] })`.
3. Si no hay defaults, buscar cualquier template del owner con pivot en **otro** evento (tomar el evento más antiguo con pivots como origen).
4. Si esas filas **no** tienen ningún `EventWhatsappTemplate` → **attach** (crear pivots, copiar slot/isCampaign/slotMappings del origen si venía de otro evento; si eran defaults sueltos, slot por orden 1..n, primera `isCampaign true`).
5. Si ya están attached a otro evento → **clone**: por cada origen, `createMessageTemplate` con mismo `components`/language/category, `headerType`, copiar archivo de header si existe, `isWabaDefault: false`, `clonedFromId: origin.id`, status `PENDING`, nuevo `name`. Pivot nuevo.
6. Segunda llamada: no nuevo POST Graph.

`listEventWhatsappTemplates`: `ensure` + `findAll` include template, order slot ASC.

- [ ] **Step 1: Write the failing test**

Añadir tres tests al archivo de Task 4:

1. Primer evento + defaults sin pivot → attach, `createMessageTemplate` **no** llamado.
2. Segundo evento + origen attached → clone, `createMessageTemplate` llamado, `clonedFromId` set.
3. Segunda `ensure` del mismo evento → no otro create Graph.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- tests/services/whatsapp-templates.service.test.js`

Expected: FAIL (`ensureEventWhatsappTemplates` undefined).

- [ ] **Step 3: Write minimal implementation**

Implementar ensure/list. En `createEvent` (tras `seedEventDefaults`, fuera o dentro del transaction post-commit para no mezclar Graph en la TX de MySQL): **después** de commit,

```js
const { ensureEventWhatsappTemplates } = await import("../services/whatsapp-templates.service.js");
await ensureEventWhatsappTemplates(event).catch((err) => {
  // no tumbar el createEvent si Graph falla; log + evento queda sin pivot (GET Mensajes reintenta)
});
```

Preferible **después del transaction** para no rollback del evento. Log `Logger("WhatsAppTemplates")`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- tests/services/whatsapp-templates.service.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/whatsapp-templates.service.js backend/tests/services/whatsapp-templates.service.test.js backend/src/controllers/events.controller.js
git commit -m "$(cat <<'EOF'
feat: heredar o clonar plantillas Meta al crear o abrir un evento.

EOF
)"
```

---

### Task 6: Editar / enviar a revisión (copy-on-write)

**Files:**

- Modify: `backend/src/services/whatsapp-templates.service.js`
- Modify: `backend/tests/services/whatsapp-templates.service.test.js`

**Interfaces:**

```js
export async function submitEventTemplate({
  eventId,
  ownerUserId,
  slot,
  body,
  headerType,
  headerFile, // opcional
  slotMappings,
  isCampaign,
})
export async function setCampaignSlot({ eventId, slot })
```

`submitEventTemplate`:

1. `ensureEventWhatsappTemplates`.
2. `assertWizardBody` + `assertSlotMappingsComplete(mergeSlotMappings(...))`.
3. Header document/image: archivo nuevo o `headerHandle`/`headerMediaPath` existente; si no, 400.
4. Contar pivots de `whatsappMessageTemplateId`. Si `count === 1`: `updateMessageTemplate({ templateId: metaTemplateId, payload: { components, language, category } })`, status `PENDING`, `rejectedReason: null`. Si `count > 1`: create Graph nuevo, retarget pivot, `clonedFromId` viejo.
5. Si `isCampaign === true`, `setCampaignSlot`.
6. Si Graph falla tras tener fila: no borrar; status se mantiene; throw user-facing.

`setCampaignSlot`: `update({ isCampaign: false }, { where: { eventId } })` luego `update({ isCampaign: true }, { where: { eventId, slot } })`.

Crear segunda plantilla: `submitEventTemplate` con slot `2` sin pivot previo → `createMessageTemplate` + pivot (`isWabaDefault: false`).

- [ ] **Step 1: Write the failing test**

- Un pivot → `updateMessageTemplate` llamado, no create.
- Dos pivots mismo template → create + pivot apunta al nuevo id.
- `setCampaignSlot(2)` deja slot 1 `isCampaign false`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- tests/services/whatsapp-templates.service.test.js`

Expected: FAIL (función undefined).

- [ ] **Step 3: Write minimal implementation**

Como las interfaces.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- tests/services/whatsapp-templates.service.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/whatsapp-templates.service.js backend/tests/services/whatsapp-templates.service.test.js
git commit -m "$(cat <<'EOF'
feat: editar HSM del evento y reenviar a revisión de Meta.

EOF
)"
```

---

### Task 7: Webhook `message_template_status_update`

**Files:**

- Modify: `backend/src/controllers/meta-webhook.controller.js`
- Modify: `backend/src/services/whatsapp-templates.service.js`
- Create: `backend/tests/services/whatsapp-templates-webhook.test.js`
- Test webhook controller si ya hay `tests/controllers/meta-webhook.controller.test.js`; si no, test del extractor + `applyTemplateStatusUpdate`.

**Interfaces:**

```js
export function extractTemplateStatusUpdates(body) // [{ wabaId, metaTemplateId, name, language, event, reason }]
export function mapTemplateStatusEvent(event) // FLAGGED → PAUSED; unknown → null (ignorar)
export async function applyTemplateStatusUpdate(update)
```

`applyTemplateStatusUpdate`: findOne `{ metaTemplateId }` o `{ wabaId, name }`; si no hay fila, return `{ processed: true, reason: "unknown_template" }`; si hay, `status`, `rejectedReason` (solo REJECTED), `lastStatusAt: new Date()`.

En `postMetaEvents`, **antes** del loop de messages:

```js
const templateUpdates = extractTemplateStatusUpdates(payload);
for (const update of templateUpdates) {
  results.push(await applyTemplateStatusUpdate(update));
}
```

No exigir `phone_number_id`. Extraer de `entry[].id` + `changes[]` donde `field === "message_template_status_update"`. `value.event`, `value.message_template_id`, `value.message_template_name`, `value.message_template_language`, `value.reason`.

- [ ] **Step 1: Write the failing test**

```js
test("APPROVED actualiza status por metaTemplateId", async () => {
  const row = { id: "tpl_1", status: "PENDING", update: jest.fn(async function u(p){ Object.assign(this,p); return this; }) };
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks: {
      "src/services/meta-graph.client.js": () => ({
        resolveTemplateCrudToken: () => "t",
        createMessageTemplate: jest.fn(),
        updateMessageTemplate: jest.fn(),
        uploadResumableHeader: jest.fn(),
      }),
    },
  });
  models.WhatsappMessageTemplate.findOne.mockResolvedValue(row);
  const result = await mod.applyTemplateStatusUpdate({
    wabaId: "waba_1",
    metaTemplateId: "111",
    name: "alanna_pc_ab_1",
    event: "APPROVED",
    reason: null,
  });
  expect(row.status).toBe("APPROVED");
  expect(result).toMatchObject({ processed: true });
});

test("plantilla desconocida 200 lógico", async () => {
  const { mod, models } = await loadWithMocks("src/services/whatsapp-templates.service.js", {
    extraMocks: {
      "src/services/meta-graph.client.js": () => ({
        resolveTemplateCrudToken: () => "t",
        createMessageTemplate: jest.fn(),
        updateMessageTemplate: jest.fn(),
        uploadResumableHeader: jest.fn(),
      }),
    },
  });
  models.WhatsappMessageTemplate.findOne.mockResolvedValue(null);
  await expect(mod.applyTemplateStatusUpdate({
    wabaId: "waba_x",
    metaTemplateId: "999",
    name: "nope",
    event: "REJECTED",
    reason: "invalid",
  })).resolves.toMatchObject({ processed: true, reason: "unknown_template" });
});
```

Test extractor en el mismo archivo importando `extractTemplateStatusUpdates` desde el controller (exportarla). Payload:

```js
{
  entry: [{
    id: "waba_1",
    changes: [{
      field: "message_template_status_update",
      value: {
        event: "REJECTED",
        message_template_id: "111",
        message_template_name: "alanna_pc_ab_1",
        message_template_language: "es_MX",
        reason: "INVALID_FORMAT",
      },
    }],
  }],
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- tests/services/whatsapp-templates-webhook.test.js`

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Extractor + apply + cablear `postMetaEvents`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- tests/services/whatsapp-templates-webhook.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/meta-webhook.controller.js backend/src/services/whatsapp-templates.service.js backend/tests/services/whatsapp-templates-webhook.test.js
git commit -m "$(cat <<'EOF'
feat: webhook de estado de plantillas Meta actualiza el badge.

EOF
)"
```

---

### Task 8: Gate `assertWhatsappReady` y contexto de campaña

**Files:**

- Modify: `backend/src/services/whatsapp-templates.service.js`
- Modify: `backend/src/services/integration-resolver.service.js`
- Modify: `backend/tests/services/integration-resolver.ready.test.js`
- Modify: `backend/tests/services/whatsapp-templates.service.test.js`

**Interfaces:**

```js
export async function resolveCampaignSendContext(event)
// {
//   template: WhatsappMessageTemplate,
//   link: EventWhatsappTemplate,
//   hsmTemplateName: string,
//   hsmParamsFor(guest, plannerName): Promise<string[]>,
//   hsmHeaderDocument: { relativePath, fileName, mime, eventId } | null,
//   hsmHeaderImage: { relativePath, fileName, mime } | null,
// }
export async function assertCampaignTemplateReady(event)
```

`assertCampaignTemplateReady`:

1. `ensureEventWhatsappTemplates(event)` (si Graph falla, no tragarse el 400 de “no aprobada”).
2. Link `isCampaign: true` include template.
3. Si no hay: `httpError(400, "Crea una plantilla de primer contacto y espera la aprobación de Meta.")`.
4. Si `status !== "APPROVED"`: `httpError(400, "Meta aún no aprueba la plantilla de campaña.")`.
5. Si headerType document|image y falta `headerMediaPath`: `httpError(400, "La plantilla de campaña requiere un archivo de encabezado.")`.

`assertWhatsappReady(event)` en `integration-resolver.service.js`:

```js
export async function assertWhatsappReady(event) {
  if (!event?.ownerId) throw httpError(400, "WhatsApp (Meta) no está configurado.");
  await resolveActiveWhatsappMetaByOwner(event.ownerId);
  const { assertCampaignTemplateReady } = await import("./whatsapp-templates.service.js");
  await assertCampaignTemplateReady(event);
}
```

Quitar lectura de `env.meta.templateName`. El test `"400 si falta el nombre de plantilla"` se reemplaza por `"400 si no hay plantilla de campaña aprobada"` (mock de `assertCampaignTemplateReady` o del servicio).

Mensaje **exacto** de Resumen: `"Meta aún no aprueba la plantilla de campaña."`

- [ ] **Step 1: Write the failing test**

Reescribir `integration-resolver.ready.test.js`:

- Pasa si meta owner ok y `assertCampaignTemplateReady` resolve.
- 400 owner faltante (igual).
- 400 credenciales (igual).
- 400 mensaje `"Meta aún no aprueba la plantilla de campaña."` cuando el mock de templates tira ese error.
- **Nunca** `"Falta META_TEMPLATE_NAME."`.

Test `resolveCampaignSendContext` en service: mappings 1/2/3 → params con `eventGuestVars`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- tests/services/integration-resolver.ready.test.js`

Expected: FAIL (aún menciona META_TEMPLATE_NAME o no llama templates).

- [ ] **Step 3: Write minimal implementation**

Como las interfaces. `hsmParamsFor`: `resolveSlotParamValues(link.slotMappings, eventGuestVars(event, guest, plannerName))`.

Header payload para el job: si `headerType === "document"`, objeto compatible con `openingHeaderDocumentFrom` pero path del template (`headerMediaPath`). Si `image`, `hsmHeaderImage` análogo.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- tests/services/integration-resolver.ready.test.js tests/services/whatsapp-templates.service.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/integration-resolver.service.js backend/src/services/whatsapp-templates.service.js backend/tests/services/integration-resolver.ready.test.js backend/tests/services/whatsapp-templates.service.test.js
git commit -m "$(cat <<'EOF'
feat: bloquear campaña si la plantilla marcada no está aprobada.

EOF
)"
```

---

### Task 9: `meta.client` envía el name del pivot (sin env)

**Files:**

- Modify: `backend/src/services/meta.client.js`
- Modify: `backend/tests/services/meta.client.test.js`
- Modify: `backend/src/services/whatsapp.adapter.js`

**Interfaces:**

- Consumes: `templateName` obligatorio en `sendTemplate` / `getMessageTemplate`.
- Produces: `resolveTemplateName(templateName)` solo del argumento; `sendTemplate` acepta `headerImage: { id }` además de `headerDocument`.

Cambiar:

```js
function resolveTemplateName(templateName) {
  const name = String(templateName || "").trim();
  if (!name) throw httpError(400, "Falta el nombre de la plantilla de WhatsApp.");
  return name;
}
```

`sendTemplate`: `const name = resolveTemplateName(templateName);` — **no** usar header para elegir otro name.

Si `headerImage`: component header `type: "image", image: { id }`.

`getMessageTemplate`: exigir `templateName`; 400 `"Falta el nombre de la plantilla de WhatsApp."` si falta. Quitar rama `document` + `templateNameDocument`.

Tests actuales:

- `"sendTemplate con documento ignora constructor2..."` → el name enviado es el `templateName` del job (`constructor2` o el que se pase), **no** `rg_eventos`.
- `"document=true usa META_TEMPLATE_NAME_DOCUMENT"` → borrar o cambiar a `getMessageTemplate({ templateName: "alanna_pc_x_1" })`.

Adapter: pasar `headerImage` resuelto igual que document (upload media). Extender `uploadDocument` o reutilizarlo para jpeg/png (mismo endpoint media). Si `headerType` image, `meta.uploadDocument` con mime image/jpeg.

- [ ] **Step 1: Write the failing test**

En `meta.client.test.js` (el mock `metaEnv` ya no tiene templateName; dejar `templateLanguage` + `graphVersion`):

```js
test("sendTemplate con documento usa el name del job", async () => {
  fetch.mockResolvedValueOnce(jsonResponse(200, { messages: [{ id: "wamid.1" }] }));
  await metaClient.sendTemplate({
    to: "6183218624",
    bodyParams: ["Luis", "2"],
    templateName: "alanna_pc_deadbeef_1",
    headerDocument: { id: "media_1", filename: "inv.pdf" },
    ...auth,
  });
  const body = JSON.parse(fetch.mock.calls[0][1].body);
  expect(body.template.name).toBe("alanna_pc_deadbeef_1");
  expect(body.template.components[0].parameters[0].type).toBe("document");
});

test("sendTemplate sin name 400", async () => {
  await expect(metaClient.sendTemplate({ to: "6183218624", bodyParams: ["a"], ...auth }))
    .rejects.toMatchObject({ status: 400, message: "Falta el nombre de la plantilla de WhatsApp." });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- tests/services/meta.client.test.js`

Expected: FAIL (todavía sustituye por documentName o pide META_TEMPLATE_NAME).

- [ ] **Step 3: Write minimal implementation**

Parche `resolveTemplateName`, `sendTemplate`, `getMessageTemplate`, adapter header image.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- tests/services/meta.client.test.js tests/services/whatsapp.adapter.test.js`

Expected: PASS (actualizar adapter tests que esperan `rg_eventos` / `constructor2` del env: el name sale del meta del job).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/meta.client.js backend/tests/services/meta.client.test.js backend/src/services/whatsapp.adapter.js backend/tests/services/whatsapp.adapter.test.js
git commit -m "$(cat <<'EOF'
feat: enviar HSM con el nombre de la plantilla del evento.

EOF
)"
```

---

### Task 10: Campaña, remind y worker usan el pivot

**Files:**

- Modify: `backend/src/services/campaign.service.js`
- Modify: `backend/src/controllers/guests.controller.js`
- Modify: `backend/src/services/outbound.worker.js`
- Modify: `backend/src/services/opening-document.service.js` (dejar de exigir `META_TEMPLATE_NAME_DOCUMENT`; `assertOpeningDocumentReady` ya no se usa en campaña)
- Tests: `campaign.service.test.js`, `guests.controller.test.js`, `outbound.worker.test.js`, `opening-document.service.test.js`

**Interfaces:**

- Consumes: `resolveCampaignSendContext`, `assertWhatsappReady`.
- Produces: jobs `whatsapp.send` con `hsmTemplateName`, `hsmParams`, `hsmHeaderDocument` o `hsmHeaderImage` desde el contexto.

`executeCampaignLaunch` / `deliverOpeningInvitation`:

```js
const ctx = await resolveCampaignSendContext(event);
const params = await ctx.hsmParamsFor(guest, plannerName);
await deliverAiMessage({
  event,
  guest,
  text: fillMetaTemplate(bodyTextFromComponents(ctx.template.components), params),
  hsmParams: params,
  hsmTemplateName: ctx.hsmTemplateName,
  ...(ctx.hsmHeaderDocument ? { hsmHeaderDocument: ctx.hsmHeaderDocument } : {}),
  ...(ctx.hsmHeaderImage ? { hsmHeaderImage: ctx.hsmHeaderImage } : {}),
  kind: "campaign",
  ...
});
```

Para `text` del chat: rellenar el BODY snapshot (`ctx.template.components` BODY text) con `fillMetaTemplate` / params. No `composeConstructorMessage`.

Quitar `assertOpeningDocumentReady(opening)` de `planCampaign` y `executeCampaignLaunch`. `planCampaign` sigue llamando `assertWhatsappReady` en modo now.

`resolveCampaignHeader` en worker: **no** pise `hsmTemplateName` con env. Si el payload ya trae name/header, devolverlos. Quitar lookup de `templates.attachDocument` + `document.templateName`.

`opening-document.service.js`: eliminar throw `Falta META_TEMPLATE_NAME_DOCUMENT`. Si algo externo aún llama `assertOpeningDocumentReady`, que solo valide el archivo local; no devuelva `templateName` de env (devolver `templateName: null` o quitar el campo). Actualizar su test.

- [ ] **Step 1: Write the failing test**

En `campaign.service.test.js`: mock `resolveCampaignSendContext` → name `alanna_pc_aa_1`, params `["Luis","2"]`, sin header. Expect `deliverAiMessage` / job payload `hsmTemplateName === "alanna_pc_aa_1"` y **no** `rg_eventos`.

En `outbound.worker.test.js`: job con `hsmTemplateName: "alanna_pc_aa_1"` no se reescribe a `rg_eventos`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- tests/services/campaign.service.test.js tests/services/outbound.worker.test.js`

Expected: FAIL (aún usa opening document env name).

- [ ] **Step 3: Write minimal implementation**

Cablear contexto; limpiar worker header; opening-document sin env name.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- tests/services/campaign.service.test.js tests/services/outbound.worker.test.js tests/controllers/guests.controller.test.js tests/services/opening-document.service.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/campaign.service.js backend/src/controllers/guests.controller.js backend/src/services/outbound.worker.js backend/src/services/opening-document.service.js backend/tests/services/campaign.service.test.js backend/tests/services/outbound.worker.test.js backend/tests/controllers/guests.controller.test.js backend/tests/services/opening-document.service.test.js
git commit -m "$(cat <<'EOF'
feat: campaña e invitación inicial usan la plantilla marcada del evento.

EOF
)"
```

---

### Task 11: HTTP wizard + plantillas del evento

**Files:**

- Create: `backend/src/controllers/whatsapp-templates.controller.js`
- Modify: `backend/src/routes/index.js`
- Create: `backend/tests/controllers/whatsapp-templates.controller.test.js`
- Modify: `backend/src/controllers/whatsapp-meta.controller.js` + su test (`hasTemplate` desde DB)

**Interfaces:**

Rutas (auth):

```
POST /integrations/whatsapp/meta/templates
GET  /events/:eventId/whatsapp-templates
PUT  /events/:eventId/whatsapp-templates/:slot
PATCH /events/:eventId/whatsapp-templates/:slot
```

Multer wizard: `multer.fields([{ name: "header_1", maxCount: 1 }, { name: "header_2", maxCount: 1 }])`.
PUT evento: `multer.fields([{ name: "header", maxCount: 1 }])`.
Si `Content-Type` es JSON, `req.body` es el payload (sin archivo).

`POST templates` (wizard):

```js
export const postWizardTemplates = asyncHandler(async (req, res) => {
  const { resolveActiveWhatsappMetaByOwner } = await import("../services/whatsapp-meta.service.js");
  const resolved = await resolveActiveWhatsappMetaByOwner(req.user.id);
  const payload = parsePayload(req);
  const rows = await createWizardTemplates({
    ownerUserId: req.user.id,
    wabaId: resolved.credentials.wabaId,
    plannerAccessToken: resolved.credentials.accessToken,
    templates: normalizeWizardItems(payload, req.file / req.files),
  });
  res.status(201).json({ templates: rows.map(serializeLink) });
});
```

`GET`: `requireEvent` + `PERMS.CONFIG_AI`; `ensureEventWhatsappTemplates`; json `{ templates: serialize[] }`.

`PUT :slot`: `submitEventTemplate`.

`PATCH :slot`: `{ isCampaign: true }` → `setCampaignSlot`.

Serialize:

```js
{
  id, slot, isCampaign,
  slotMappings,
  template: {
    id, name, metaTemplateId, language, category,
    headerType, headerFileName, status, rejectedReason,
    body, // BODY.text del snapshot components
  }
}
```

`getWhatsappMetaStatus`: `hasTemplate` = `WhatsappMessageTemplate.count({ where: { ownerUserId } }) > 0`. `templateName` = name de la default campaña o null. Quitar `templateStatus()` de env. Test del controller: mock count.

- [ ] **Step 1: Write the failing test**

Controller tests con `loadWithMocks` del controller: POST wizard 201 llama `createWizardTemplates`; GET llama ensure+list; PUT llama submit; PATCH setCampaign; POST sin templates 400.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npm test -- tests/controllers/whatsapp-templates.controller.test.js`

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Controller + routes + status DB.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npm test -- tests/controllers/whatsapp-templates.controller.test.js tests/controllers/whatsapp-meta.controller.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/whatsapp-templates.controller.js backend/src/routes/index.js backend/src/controllers/whatsapp-meta.controller.js backend/tests/controllers/whatsapp-templates.controller.test.js backend/tests/controllers/whatsapp-meta.controller.test.js
git commit -m "$(cat <<'EOF'
feat: API de plantillas WhatsApp del wizard y del evento.

EOF
)"
```

---

### Task 12: Front — validación + wizard post-signup

**Files:**

- Create: `front/src/lib/whatsapp-templates.ts`
- Create: `front/src/lib/whatsapp-templates.test.ts`
- Create: `front/src/components/whatsapp-template-wizard-dialog.tsx`
- Modify: `front/src/lib/api/integrations.ts`
- Modify: `front/src/routes/eventos.whatsapp.tsx`

**Interfaces:**

```ts
export function extractBodyPlaceholders(body: string): string[]
export function wizardBodyError(body: string): string | null
// null si ok; si no: "Incluye {{1}} (nombre) y {{2}} (número de pases)."
export function statusBadgeLabel(status: string): string
// DRAFT Borrador, PENDING En revisión, APPROVED Aprobada, REJECTED Rechazada, PAUSED Pausada, DISABLED Pausada
```

API:

```ts
createWizardTemplates: (form: FormData) =>
  api<{ templates: EventWhatsappTemplateDto[] }>("/integrations/whatsapp/meta/templates", { method: "POST", body: form })
```

No JSON.stringify el FormData. Campo `payload` (JSON string): `{ templates: [{ slot, headerType, body, isCampaign }] }` + archivos `header_1` / `header_2`. En Task 11 el POST wizard usa `multer.fields([{ name: "header_1", maxCount: 1 }, { name: "header_2", maxCount: 1 }])`. PUT del evento usa `fields([{ name: "header", maxCount: 1 }])`.

Wizard UI:

- Título: `Plantillas de invitación`
- Párrafo fijo: `Meta revisa y aprueba cada plantilla. Hasta que el estado sea Aprobada no puedes lanzar la campaña.`
- 1–2 tarjetas: radio texto / documento / imagen; file input; textarea BODY; radio campaña.
- Primary `Guardar y enviar a revisión` disabled sin una tarjeta válida (`wizardBodyError` null y archivo si header).
- Tras `connectMeta` éxito: `setWizardOpen(true)`.
- Si status `configured && !hasTemplate`: CTA persistente que reabre el wizard.

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { wizardBodyError, statusBadgeLabel } from "./whatsapp-templates.ts";

test("wizardBodyError exige {{1}} y {{2}}", () => {
  assert.equal(typeof wizardBodyError("hola"), "string");
  assert.equal(wizardBodyError("Hola {{1}}, pases {{2}}"), null);
});

test("statusBadgeLabel PENDING", () => {
  assert.equal(statusBadgeLabel("PENDING"), "En revisión");
  assert.equal(statusBadgeLabel("APPROVED"), "Aprobada");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd front && npm test -- src/lib/whatsapp-templates.test.ts`

Expected: FAIL (módulo no existe).

- [ ] **Step 3: Write minimal implementation**

Lib + dialog + wire `eventos.whatsapp.tsx` + API.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd front && npm test -- src/lib/whatsapp-templates.test.ts`

Expected: PASS.

Verificación UI (dev server ya en marcha): conectar no se puede en CI; revisar que el diálogo monta (el componente no crashea) y que el CTA aparece cuando `hasTemplate` es false.

- [ ] **Step 5: Commit**

```bash
git add front/src/lib/whatsapp-templates.ts front/src/lib/whatsapp-templates.test.ts front/src/components/whatsapp-template-wizard-dialog.tsx front/src/lib/api/integrations.ts front/src/routes/eventos.whatsapp.tsx
git commit -m "$(cat <<'EOF'
feat: wizard de plantillas justo después de conectar Facebook.

EOF
)"
```

---

### Task 13: Front — Mensajes (dos tarjetas) y Resumen

**Files:**

- Create: `front/src/components/whatsapp-template-card.tsx`
- Modify: `front/src/routes/eventos.$eventId.mensajes.tsx`
- Modify: `front/src/lib/api/integrations.ts` (GET/PUT/PATCH event templates)
- Modify: `front/src/components/launch-campaign-dialog.tsx`
- Modify: `front/src/routes/eventos.$eventId.resumen.tsx` si el error de launch se muestra ahí

**Interfaces:**

```ts
listEventWhatsappTemplates: (eventId) => api(`/events/${eventId}/whatsapp-templates`)
putEventWhatsappTemplate: (eventId, slot, form: FormData) => api PUT
patchEventWhatsappCampaign: (eventId, slot) => api PATCH { isCampaign: true }
```

Tab Primer contacto:

- Dejar de cargar `integrationsApi.getWhatsAppTemplate(attachDocument)` como fuente HSM.
- `useEffect` GET event templates.
- Hasta dos `WhatsappTemplateCard`: badge (`statusBadgeLabel`), tooltip `rejectedReason`, textarea BODY, mapper extras (`availableTemplateKeys` + opción literal), radio campaña, botón `Guardar y enviar a revisión`.
- Slot 2 vacío: botón `Crear segunda plantilla` que muestra card en blanco (`headerType none`).
- Recordatorio / Seguimiento: sin cambio (siguen `PUT /templates` local).

Resumen: `LaunchCampaignDialog` recibe `campaignTemplateStatus: string | null`. Si no es `APPROVED`, el botón confirmar está disabled y `DialogDescription` incluye `Meta aún no aprueba la plantilla de campaña.` El 400 del API se sigue mostrando en `error`.

- [ ] **Step 1: Write the failing test**

Extender `whatsapp-templates.test.ts`:

```ts
test("statusBadgeLabel REJECTED", () => {
  assert.equal(statusBadgeLabel("REJECTED"), "Rechazada");
});
```

No hay test de ruta React. El “fail” de producto es Mensajes aún usando getWhatsAppTemplate — se cubre en implementación + verificación manual.

Añadir test de mapper helper en `whatsapp-templates.ts`:

```ts
export function extraSlotOptions(keys: string[]) // [...keys, "__literal__"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd front && npm test -- src/lib/whatsapp-templates.test.ts`

Expected: FAIL si el helper aún no existe.

- [ ] **Step 3: Write minimal implementation**

Cards + Mensajes + API + copy de Resumen.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd front && npm test -- src/lib/whatsapp-templates.test.ts`

Expected: PASS.

Verificar en el browser (user rule): abrir `/eventos/{id}/mensajes` tab Primer contacto (dos tarjetas / CTA segunda), badge, y Resumen al lanzar con plantilla no aprobada muestra el mensaje de Meta. Desktop. No hace falta mobile salvo que el layout de tarjetas se rompa.

- [ ] **Step 5: Commit**

```bash
git add front/src/components/whatsapp-template-card.tsx front/src/routes/eventos.\$eventId.mensajes.tsx front/src/lib/api/integrations.ts front/src/components/launch-campaign-dialog.tsx front/src/routes/eventos.\$eventId.resumen.tsx front/src/lib/whatsapp-templates.ts front/src/lib/whatsapp-templates.test.ts
git commit -m "$(cat <<'EOF'
feat: badges y edición de plantillas Meta en Mensajes.

EOF
)"
```

---

### Task 14: Barrer restos de env y suite

**Files:** cualquier test o código que aún lea `META_TEMPLATE_NAME`, `templateNameDocument`, `rg_eventos` como gate.

**Interfaces:** ninguna nueva.

- [ ] **Step 1: Write the failing test**

No hay test nuevo. Paso 1 = grep de verificación:

Run: `cd backend && rg "META_TEMPLATE_NAME|templateNameDocument|Falta META_TEMPLATE" src tests`

Expected (después de implementar): solo comentarios de historia o cero hits. Si hay hits, son el “fail”.

- [ ] **Step 2: Run grep to list leftovers**

Documentar hits y parcharlos.

- [ ] **Step 3: Write minimal implementation**

Eliminar usos. `getWhatsappMetaTemplate` interno: si Mensajes ya no lo llama, dejar el endpoint leyendo `templateName` query obligatorio o 400 sin env. No reintroducir fallback.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `cd backend && npm test`

Expected: PASS suite.

Run: `cd front && npm test`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -u backend front
git commit -m "$(cat <<'EOF'
chore: quitar nombres HSM globales de env y tests.

EOF
)"
```

---

## Self-review (spec coverage)

| Spec | Task |
| --- | --- |
| Wizard primero + copy Meta | 12 |
| 1–2 plantillas, tipos mixtos | 4, 12 |
| Mínimo una | 4, 11, 12 |
| Attach primer evento / clone resto / ensure idempotente | 5 |
| Dos tarjetas Mensajes, badge, submit, radio campaña | 6, 13 |
| Gate solo marcada APPROVED | 8, 10, 13 |
| `{{1}}` nombre `{{2}}` pases; extras mapeo | 2, 8, 13 |
| `META_ACCESS_TOKEN` CRUD | 1, 3 |
| Sin fallback env | 8, 9, 10, 14 |
| Webhook status | 7 |
| Header document/image send | 9, 10 |
| `createEvent` ensure | 5 |
| CTA si cierran wizard | 12 |
| Copy-on-write edit | 6 |

Fuera de alcance (no hay tarea): HMAC webhook, borrar HSM al disconnect, HSM recordatorio/seguimiento.
