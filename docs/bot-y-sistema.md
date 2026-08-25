# Alanna Confirmaciones — bot y sistema

Producto para wedding planners: lista de invitados, confirmación de asistencia por WhatsApp y un asistente de IA por evento. Stack: **Express + Sequelize/MySQL** (`backend/`) y **React + TanStack Router** (`front/`). El worker de salida y el scheduler de follow-ups viven **en el mismo proceso** que el API (`node src/server.js`).

Hay **dos IAs distintas**:

| Bot | Para quién | Cómo funciona |
|-----|------------|----------------|
| **Asistente de confirmaciones** | Invitados por WhatsApp | OpenAI Responses API + tools + plantillas |
| **Ayuda in-app** | El planner en la UI | FAQ por palabras clave, sin OpenAI (`help-bot.service.js`) |

El resto de este documento es el asistente de confirmaciones, salvo donde se indique.

---

## 1. Cómo opera (visión general)

```
Planner (web)
  → crea evento, invitados, plantillas, personalidad
  → “Iniciar confirmaciones”
  → texto determinista (plantilla Primer contacto)
  → cola outbound_jobs → WhatsApp Connect

Invitado (WhatsApp)
  → webhook → resuelve guest por teléfono
  → processGuestMessage → OpenAI + tools
  → reply (plantilla literal o texto del modelo)
  → cola outbound_jobs → WhatsApp

Scheduler (cada ~5 s)
  → followUps activos vencidos
  → plantilla Recordatorio
```

Núcleo de un turno: `processGuestMessage` en `backend/src/services/bot/bot.service.js`.

---

## 2. Piezas de datos

### Evento

Nombre, anfitriones, fecha, hora, venue, **dirección**, tipo, estado (`activo | borrador | finalizado`). Dueño = `ownerId` (la integración de WhatsApp es **por cuenta**, no por evento).

### Invitado (`guests`)

Dos ejes de estado:

**Confirmación (`status`)**

| Valor | Significado |
|-------|-------------|
| `sin_contactar` | Nunca se le escribió (único que toca la campaña masiva) |
| `enviado` | Campaña o recordatorio salió |
| `entregado` | Enum; el worker no lo escribe hoy |
| `respondio` | Enum; poco usado en código vivo |
| `en_conversacion` | Respondió y aún no hay RSVP ni seguimiento |
| `confirmado` / `parcial` / `no_asistira` | RSVP cerrado (tool) |
| `sin_respuesta` | Enum; el drip sí lo considera |
| `seguimiento` | Respuesta ambigua (`marcar_seguimiento`) |

**Canal (`whatsapp`)**: `pendiente | enviado | entregado | leido | respondido`.

Otros campos relevantes: `rep` (nombre), `phone`, `invited` (cupo), `confirmed`, `table`, `notes`, `followUp` (fecha DD/MM/YYYY para la UI), `followUpsSent` (ids de reglas ya disparadas), `contactedAt`, `confirmedAt`, `lastMessage`, `lastReply`.

### Conversación

Una por invitado (`guestId` unique). `aiPaused`: si el planner pausa la IA, el inbound se guarda y **el bot no responde**.

### Mensajes

`from`: `ai | guest | planner`.

### AiConfig (1:1 con evento)

Personalidad (`assistantName`, `tone`, `formality`, `emojis`, `length`), `openingMessage` (fallback de campaña), `prompt` (cerebro), `rules[]`, `followUps[]` `{ id, label, when, active }`.

Follow-ups por defecto:

| id | label | when | active |
|----|-------|------|--------|
| f1 | Primer contacto | 30 días antes del evento | sí (UI; **no** auto-lanza campaña) |
| f2 | Primer recordatorio | 7 días después del primer contacto | sí |
| f3 | Segundo recordatorio | 14 días después del primer contacto | sí |
| f4 | Último intento | 7 días antes del evento | no |

### Plantillas

`category`, `title`, `body` con `{{vars}}`. Categorías canónicas:

Primer contacto · Recordatorio · Confirmación · Rechazo · Información del evento · Ubicación · Dress code · Agradecimiento.

### Sesión del bot (`bot_sessions`)

Historial OpenAI por `(eventId, guestId, userId)`. Live: `userId` = dígitos del teléfono. Playground: `playground_{eventId}_{guestId}`. Lock 180 s.

### Jobs (`outbound_jobs`)

Único tipo implementado: `whatsapp.send`. Estados: `queued | processing | done | failed | skipped`.

---

## 3. Flujo de un mensaje del invitado

1. WhatsApp Connect POST `/api/webhooks/whatsapp-connect/events` (body raw, HMAC, anti-replay).
2. Se resuelve la integración por `deviceId`.
3. `handleInboundWhatsapp`: ignora grupos; si no es texto, avisa “solo texto”; busca invitado por teléfono en **todos** los eventos del owner (últimos 10 dígitos). Si hay varios, usa la conversación más reciente; si no, evento `activo` y fecha.
4. `processGuestMessage`:
   - Persiste mensaje `guest`.
   - `markGuestReplied`: `whatsapp = respondido`; si venía de `sin_contactar|enviado|entregado|sin_respuesta|respondio` → `en_conversacion`. **No pisa** `seguimiento` ni RSVP cerrado.
   - Si `aiPaused` → no llama al modelo.
   - Lock de sesión; si está locked → “Por favor espera…”.
   - Carga contexto: prompt, hechos del evento/invitado, catálogo de plantillas (body con `{{vars}}`), FAQs.
   - `processTurn` (OpenAI, modelo `OPENAI_MODEL` o `gpt-4o-mini`, JSON `{ reply }`, hasta 3 vueltas de tools).
   - Orden de tools: `actualizar_confirmacion` → `marcar_seguimiento` → `usar_plantilla`.
   - Si `usar_plantilla` trae `useAsReply`, **ese string es el reply** (el modelo no lo reescribe).
   - Persiste mensaje `ai` y encola `whatsapp.send` (salvo `dryRun`).

Playground: `dryRun=true`, `persistConversation=false` → no WhatsApp ni historial de Conversaciones, **pero las tools sí mutan el Guest real**.

Simular invitado: persiste chat, `dryRun` (no WhatsApp).

---

## 4. Tools del asistente

Definidas en `backend/src/services/bot/tools.js`. Schema estricto OpenAI (`strict: true`).

### `actualizar_confirmacion`

Cuándo: confirma, asiste con menos gente o decline **con claridad**.

| Arg | Tipo | Notas |
|-----|------|--------|
| `status` | `confirmado \| parcial \| no_asistira` | |
| `confirmed` | number \| null | Null si no asisten |

Efectos: escribe RSVP, clampa al cupo (`invited`), `whatsapp = respondido`, `confirmedAt`, log `confirm`/`reject`. Pide al modelo llamar `usar_plantilla` Confirmación o Rechazo.

### `marcar_seguimiento`

Cuándo: ambigüedad (“luego te digo”, “creo que sí”, “lo hablo con…”).

| Arg | Tipo | Notas |
|-----|------|--------|
| `reason` | string \| null | |
| `followUpDate` | string \| null | ISO o DD/MM/YYYY; si null, se calcula con `followUps` activos |

Efectos: `status = seguimiento`, `followUp` visible en Invitados. Rechaza si el RSVP ya está cerrado.

### `usar_plantilla`

Cuándo: hay que mandar texto de la biblioteca.

| Arg | Tipo | Notas |
|-----|------|--------|
| `category` | string \| null | p. ej. `Ubicación` |
| `id` | string \| null | UUID de la fila |

Resuelve la plantilla, interpola y el sistema **envía ese texto tal cual**.

No hay tools de mesa, notas, escalamiento ni “pausar”.

El prompt inyectado (además del cerebro) exige aislamiento por evento, lista el catálogo y las reglas de tools. Archivo: `backend/src/services/bot/prompt.service.js`.

---

## 5. Plantillas y variables

Interpolación: `{{clave}}` → `eventGuestVars` en `backend/src/utils/defaults.js`. Si falta la clave, queda el placeholder.

| Variable | Origen |
|----------|--------|
| `nombre` | Primera palabra de `guest.rep` |
| `nombre_completo` | `guest.rep` |
| `numero_invitados` | Cupo (`invited`) |
| `numero_confirmados` / `confirmados` | `guest.confirmed` |
| `mesa` | `guest.table` |
| `evento` | `event.name` |
| `fecha` | `event.date` (DATEONLY crudo en backend) |
| `lugar` | `event.venue` |
| `direccion` | `event.address` |
| `hora` | `event.time` |
| `planner` | Nombre del owner / sesión |

**Campaña (determinista, sin modelo):** categoría `Primer contacto` → si no hay, `ai.openingMessage` → si no, `"Hola {{nombre}}, ¿podrán acompañarnos?"`.

**Recordatorio (manual y scheduler):** categoría `Recordatorio`.

El PUT de plantillas **borra y recrea** todas las del evento.

---

## 6. Campaña, recordatorio y follow-ups

### Lanzar campaña

`POST /api/events/:eventId/campaigns/launch` — UI: Resumen → “Iniciar confirmaciones”.

- Solo `status = sin_contactar`.
- Exige WhatsApp activo + `deviceId` **si hay alguien que contactar**.
- Por cada uno: interpola, marca `enviado`, `contactedAt`, conversación + mensaje `ai`, job `kind: "campaign"`.
- Job fallido + aún sin `lastReply` → rollback a `sin_contactar`.

El modelo `Campaign` existe en BD y **no se usa**.

### Recordatorio 1 a 1

`POST /api/guests/:guestId/remind` — Invitados. Misma plantilla Recordatorio + preflight WhatsApp. Si estaba `sin_contactar`, pasa a `enviado`.

### Scheduler

`backend/src/services/follow-up.scheduler.js`, intervalo `WORKER_INTERVAL_MS` (default 5 s).

- Eventos `activo`, WhatsApp resoluble.
- Reglas `active` **excepto** label ~ “Primer contacto”.
- Parsea `when` en español: `N días después del primer contacto` | `N días antes del evento`.
- Destinatarios: `enviado | entregado | respondio | en_conversacion | seguimiento | sin_respuesta`. Nunca `sin_contactar` ni RSVP cerrado. Salta `aiPaused`.
- Dedup: `followUpsSent`. Máx. 5 envíos por tick.

Salida compartida: `deliverAiMessage` en `backend/src/services/guest-message.service.js` (mensaje + job + historial de sesión).

---

## 7. WhatsApp

Proveedor: **WhatsApp Connect** (cuenta del planner).

- Conexión: `/eventos/whatsapp` — QR, device, test.
- Envío: worker → `WhatsAppConnectProvider.sendMessage` → `POST {WC_API_URL}/devices/{deviceId}/messages/send`.
- Inbound: webhook firmado, enrutado por `deviceId`.
- No hay receipts de entregado/leído hacia `guest.whatsapp` (salvo `enviado`/`respondido` que sí escribe el producto).

Productores de `whatsapp.send`: campaña, recordatorio, follow-up, reply del bot, aviso no-texto, mensaje del planner en Conversaciones.

---

## 8. Superficies del front (evento)

| Ruta | Qué hace respecto al bot |
|------|---------------------------|
| `/eventos/$eventId/resumen` | Lanza campaña; toast de error si no hay WA |
| `/eventos/$eventId/invitados` | Lista, PATCH, recordatorio 1 a 1, columna Seguimiento |
| `/eventos/$eventId/conversaciones` | Chat planner; pausar IA; simular invitado (dev) |
| `/eventos/$eventId/automatizacion` | Personalidad, prompt, mensaje inicial (fallback), reglas, switches de followUps, playground |
| `/eventos/$eventId/mensajes` | Biblioteca + FAQs |
| `/eventos/whatsapp` | Número conectado |

Otras rutas de producto: importar, lista final, estadísticas, configuración, suscripción, soporte, admin.

---

## 9. API (prefijo `/api`)

Auth: JWT en `Authorization` salvo las públicas y los webhooks.

### Públicas / infra

- `GET /health`
- `GET /plans`
- `POST /auth/register|login|refresh|logout|forgot-password|reset-password`
- `GET /billing/session/:sessionId`
- `POST /billing/webhook` (Stripe, raw)
- `POST /webhooks/whatsapp-connect/events` (raw, HMAC)

### Autenticadas — bot / invitaciones

- `POST /events/:eventId/campaigns/launch`
- `GET /events/:eventId/conversations` · `PATCH /conversations/:id` · `POST .../messages`
- `POST /guests/:guestId/remind`
- `GET|PATCH /events/:eventId/ai-config` · `POST .../regenerate-prompt`
- `PUT /events/:eventId/templates` · `PUT .../faqs`
- Integraciones + `POST /internal/whatsapp/qr-link` · `GET .../device-status` · `POST .../send-test`

### Dev (si `BOT_DEV_PLAYGROUND === "true"`; el código actual deja las rutas montadas de forma laxa)

- `GET /dev/bot/status`
- `GET|POST /dev/events/:eventId/bot/playground`
- `POST /dev/conversations/:id/simulate-guest`

### Resto (producto)

Eventos, invitados, import/export, equipo, analytics, billing, support, admin (overview, clients, plans, finance, cancellations).

`GET /help/suggestions` y `POST /help/chat` = bot de ayuda del planner, no el de WhatsApp.

---

## 10. Archivos clave

| Archivo | Rol |
|---------|-----|
| `backend/src/services/bot/bot.service.js` | Orquestación del turno |
| `backend/src/services/bot/openai.service.js` | Responses API, loops, reply forzado |
| `backend/src/services/bot/tools.js` | Las 3 tools |
| `backend/src/services/bot/prompt.service.js` | Cerebro + instrucciones |
| `backend/src/services/bot/session.service.js` | Historial y lock |
| `backend/src/services/templates.service.js` | Resolver/render plantillas |
| `backend/src/services/guest-message.service.js` | Envío determinista |
| `backend/src/services/follow-up.service.js` | Parseo de `when` |
| `backend/src/services/follow-up.scheduler.js` | Drip Recordatorio |
| `backend/src/services/outbound.worker.js` | Cola + sync/rollback WA |
| `backend/src/controllers/bot.controller.js` | Inbound WhatsApp |
| `backend/src/controllers/conversations.controller.js` | Campaña y chat planner |
| `front/src/lib/api/bot.ts` | Cliente playground |

---

## 11. Variables de entorno (bot / WA)

- `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-4o-mini`)
- `WORKER_INTERVAL_MS` (default 5000)
- `BOT_DEV_PLAYGROUND`
- `WC_API_URL`, `WC_SERVICE_JWT`, `WC_WEBHOOK_ENABLED`, `WC_WEBHOOK_MAX_SKEW_MS`
- `CREDENTIALS_ENCRYPTION_KEY` (deviceId / webhookSecret cifrados)

---

## 12. Transiciones típicas

```
sin_contactar --campaña/remind--> enviado
enviado --inbound--> en_conversacion
en_conversacion --actualizar_confirmacion--> confirmado | parcial | no_asistira
en_conversacion --marcar_seguimiento--> seguimiento
seguimiento --scheduler Recordatorio--> (sigue seguimiento u otro abierto)
seguimiento --actualizar_confirmacion--> RSVP cerrado
```

`markGuestReplied` no saca a alguien de `seguimiento` ni de un RSVP cerrado.

---

## 13. Matices útiles

- El **primer contacto masivo no usa el modelo**; el chat posterior sí.
- `openingMessage` es **fallback**, no la fuente principal de la campaña.
- `followUps[0]` “Primer contacto” es copy de calendario; el botón de Resumen lanza la campaña.
- Playground **confirma invitados de verdad** si el modelo llama tools.
- El worker **no** pone `entregado`/`leido` desde receipts.
- `assertCanSendInvitations` está vacío (siempre deja enviar).
- Eventos ya creados pueden seguir con plantilla de Confirmación en `{{numero_invitados}}` hasta que se editen; eventos nuevos usan `{{numero_confirmados}}`.
