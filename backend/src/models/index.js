import { DataTypes } from "sequelize";
import { sequelize } from "../config/database.js";
import { pruneDuplicateIndexes } from "../utils/prune-duplicate-indexes.js";

const uuid = {
  type: DataTypes.CHAR(36),
  primaryKey: true,
  defaultValue: DataTypes.UUIDV4,
};

export const Plan = sequelize.define("plans", {
  id: uuid,
  slug: { type: DataTypes.STRING(40), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(80), allowNull: false },
  tagline: { type: DataTypes.STRING(200), allowNull: false },
  priceMxn: { type: DataTypes.INTEGER, allowNull: false },
  eventLimit: { type: DataTypes.INTEGER, allowNull: false },
  guestLimit: { type: DataTypes.INTEGER, allowNull: false },
  highlighted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  stripeProductId: { type: DataTypes.STRING(80), allowNull: true },
  stripePriceId: { type: DataTypes.STRING(80), allowNull: true },
  stripeYearlyPriceId: { type: DataTypes.STRING(80), allowNull: true },
  annualDiscountPercent: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 20 },
});

export const User = sequelize.define("users", {
  id: uuid,
  name: { type: DataTypes.STRING(160), allowNull: false },
  email: { type: DataTypes.STRING(190), allowNull: false, unique: true },
  passwordHash: { type: DataTypes.STRING(120), allowNull: false },
  role: { type: DataTypes.STRING(80), allowNull: false, defaultValue: "Wedding Planner" },
  businessName: { type: DataTypes.STRING(180), allowNull: true },
  phone: { type: DataTypes.STRING(40), allowNull: true },
  state: { type: DataTypes.STRING(80), allowNull: true },
  planId: { type: DataTypes.CHAR(36), allowNull: true },
  subscriptionStatus: { type: DataTypes.ENUM("pending", "active", "canceled"), allowNull: false, defaultValue: "active" },
  isAdmin: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  stripeCustomerId: { type: DataTypes.STRING(80), allowNull: true },
  stripeSubscriptionId: { type: DataTypes.STRING(80), allowNull: true },
  billingInterval: { type: DataTypes.ENUM("month", "year"), allowNull: false, defaultValue: "month" },
  cancelAtPeriodEnd: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  currentPeriodEnd: { type: DataTypes.DATE, allowNull: true },
  tokenVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
});

export const RefreshToken = sequelize.define(
  "refresh_tokens",
  {
    id: uuid,
    userId: { type: DataTypes.CHAR(36), allowNull: false },
    tokenHash: { type: DataTypes.STRING(64), allowNull: false },
    familyId: { type: DataTypes.CHAR(36), allowNull: true },
    jti: { type: DataTypes.STRING(64), allowNull: true },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    revokedAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    indexes: [
      { unique: true, name: "tokenHash", fields: ["tokenHash"] },
      { unique: true, name: "jti", fields: ["jti"] },
      { name: "userId", fields: ["userId"] },
      { name: "familyId", fields: ["familyId"] },
    ],
  },
);

export const PasswordReset = sequelize.define("password_resets", {
  id: uuid,
  userId: { type: DataTypes.CHAR(36), allowNull: false },
  tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  expiresAt: { type: DataTypes.DATE, allowNull: false },
  usedAt: { type: DataTypes.DATE, allowNull: true },
});

export const Event = sequelize.define("events", {
  id: uuid,
  ownerId: { type: DataTypes.CHAR(36), allowNull: false },
  slug: { type: DataTypes.STRING(180), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(200), allowNull: false },
  shortName: { type: DataTypes.STRING(20), allowNull: false },
  type: { type: DataTypes.STRING(80), allowNull: false, defaultValue: "Boda" },
  hosts: { type: DataTypes.STRING(200), allowNull: false },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  time: { type: DataTypes.STRING(8), allowNull: false, defaultValue: "18:00" },
  venue: { type: DataTypes.STRING(200), allowNull: false },
  address: { type: DataTypes.TEXT, allowNull: true },
  estimatedGuests: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  cover: { type: DataTypes.TEXT("medium"), allowNull: false },
  status: { type: DataTypes.ENUM("activo", "borrador", "finalizado"), allowNull: false, defaultValue: "borrador" },
});

export const EventMember = sequelize.define("event_members", {
  id: uuid,
  eventId: { type: DataTypes.CHAR(36), allowNull: false },
  userId: { type: DataTypes.CHAR(36), allowNull: true },
  name: { type: DataTypes.STRING(160), allowNull: false },
  email: { type: DataTypes.STRING(190), allowNull: true },
  role: { type: DataTypes.STRING(80), allowNull: false },
  initials: { type: DataTypes.STRING(4), allowNull: false },
  removedAt: { type: DataTypes.DATE, allowNull: true },
});

export const EventRolePermission = sequelize.define("event_role_permissions", {
  id: uuid,
  eventId: { type: DataTypes.CHAR(36), allowNull: false },
  role: { type: DataTypes.STRING(80), allowNull: false },
  permission: { type: DataTypes.STRING(120), allowNull: false },
  enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
});

export const Guest = sequelize.define("guests", {
  id: uuid,
  eventId: { type: DataTypes.CHAR(36), allowNull: false },
  rep: { type: DataTypes.STRING(160), allowNull: false },
  phone: { type: DataTypes.STRING(40), allowNull: false },
  whatsappChatId: { type: DataTypes.STRING(120), allowNull: true },
  invited: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  confirmed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  table: { type: DataTypes.STRING(80), allowNull: true, defaultValue: "" },
  family: { type: DataTypes.STRING(120), allowNull: true, defaultValue: "" },
  guestType: { type: DataTypes.STRING(80), allowNull: true, defaultValue: "" },
  notes: { type: DataTypes.TEXT, allowNull: true },
  tag: { type: DataTypes.STRING(80), allowNull: true, defaultValue: "Sin etiqueta" },
  customData: { type: DataTypes.JSON, allowNull: true },
  status: {
    type: DataTypes.ENUM(
      "sin_contactar",
      "enviado",
      "entregado",
      "respondio",
      "en_conversacion",
      "confirmado",
      "parcial",
      "no_asistira",
      "sin_respuesta",
      "seguimiento",
    ),
    allowNull: false,
    defaultValue: "sin_contactar",
  },
  whatsapp: {
    type: DataTypes.ENUM("pendiente", "enviado", "entregado", "leido", "respondido"),
    allowNull: false,
    defaultValue: "pendiente",
  },
  lastMessage: { type: DataTypes.STRING(240), allowNull: true, defaultValue: "" },
  lastReply: { type: DataTypes.TEXT, allowNull: true },
  lastReplyAt: { type: DataTypes.STRING(80), allowNull: true, defaultValue: "" },
  followUp: { type: DataTypes.STRING(80), allowNull: true, defaultValue: "" },
  followUpsSent: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  confirmedAt: { type: DataTypes.DATE, allowNull: true },
  contactedAt: { type: DataTypes.DATE, allowNull: true },
});

export const Conversation = sequelize.define("conversations", {
  id: uuid,
  eventId: { type: DataTypes.CHAR(36), allowNull: false },
  guestId: { type: DataTypes.CHAR(36), allowNull: false, unique: true },
  aiPaused: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  unread: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
});

export const Message = sequelize.define("messages", {
  id: uuid,
  conversationId: { type: DataTypes.CHAR(36), allowNull: false },
  from: { type: DataTypes.ENUM("ai", "guest", "planner"), allowNull: false },
  text: { type: DataTypes.TEXT, allowNull: false },
  at: { type: DataTypes.STRING(20), allowNull: false },
  providerId: { type: DataTypes.STRING(120), allowNull: true, unique: true },
});

export const AiConfig = sequelize.define("ai_configs", {
  id: uuid,
  eventId: { type: DataTypes.CHAR(36), allowNull: false, unique: true },
  assistantName: { type: DataTypes.STRING(80), allowNull: false },
  tone: { type: DataTypes.STRING(40), allowNull: false },
  formality: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 60 },
  emojis: { type: DataTypes.ENUM("ninguno", "algunos", "frecuentes"), allowNull: false, defaultValue: "algunos" },
  length: { type: DataTypes.ENUM("cortos", "normales", "detallados"), allowNull: false, defaultValue: "normales" },
  openingMessage: { type: DataTypes.TEXT, allowNull: false },
  prompt: { type: DataTypes.TEXT, allowNull: true },
  rules: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  followUps: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
});

export const Template = sequelize.define("templates", {
  id: uuid,
  eventId: { type: DataTypes.CHAR(36), allowNull: false },
  category: { type: DataTypes.STRING(80), allowNull: false },
  title: { type: DataTypes.STRING(160), allowNull: false },
  body: { type: DataTypes.TEXT, allowNull: false },
  greetingVar: { type: DataTypes.STRING(40), allowNull: false, defaultValue: "nombre" },
  bodyVars: { type: DataTypes.JSON, allowNull: true },
  attachDocument: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  documentPath: { type: DataTypes.STRING(500), allowNull: true },
  documentFileName: { type: DataTypes.STRING(255), allowNull: true },
  documentMime: { type: DataTypes.STRING(120), allowNull: true },
  documentSize: { type: DataTypes.INTEGER, allowNull: true },
});

export const Faq = sequelize.define("faqs", {
  id: uuid,
  eventId: { type: DataTypes.CHAR(36), allowNull: false },
  q: { type: DataTypes.STRING(240), allowNull: false },
  a: { type: DataTypes.TEXT, allowNull: false },
});

export const Activity = sequelize.define("activities", {
  id: uuid,
  eventId: { type: DataTypes.CHAR(36), allowNull: false },
  text: { type: DataTypes.STRING(400), allowNull: false },
  kind: { type: DataTypes.ENUM("confirm", "reject", "message", "system"), allowNull: false, defaultValue: "system" },
});

export const Campaign = sequelize.define("campaigns", {
  id: uuid,
  eventId: { type: DataTypes.CHAR(36), allowNull: false },
  status: { type: DataTypes.ENUM("queued", "running", "done"), allowNull: false, defaultValue: "queued" },
  scheduledAt: { type: DataTypes.DATEONLY, allowNull: true },
  launchedAt: { type: DataTypes.DATE, allowNull: true },
  total: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  processed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
});

export const Payment = sequelize.define("payments", {
  id: uuid,
  userId: { type: DataTypes.CHAR(36), allowNull: true },
  planId: { type: DataTypes.CHAR(36), allowNull: true },
  stripeInvoiceId: { type: DataTypes.STRING(80), allowNull: false, unique: true },
  stripeCustomerId: { type: DataTypes.STRING(80), allowNull: true },
  amountMxn: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  currency: { type: DataTypes.STRING(8), allowNull: false, defaultValue: "mxn" },
  interval: { type: DataTypes.STRING(12), allowNull: true },
  customerEmail: { type: DataTypes.STRING(190), allowNull: true },
  customerName: { type: DataTypes.STRING(160), allowNull: true },
  paidAt: { type: DataTypes.DATE, allowNull: false },
  status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "paid" },
});

export const SupportTicket = sequelize.define("support_tickets", {
  id: uuid,
  code: { type: DataTypes.STRING(20), allowNull: false, unique: true },
  userId: { type: DataTypes.CHAR(36), allowNull: false },
  subject: { type: DataTypes.STRING(180), allowNull: false },
  category: {
    type: DataTypes.ENUM("facturacion", "cuenta", "eventos", "tecnico", "otro"),
    allowNull: false,
    defaultValue: "otro",
  },
  status: {
    type: DataTypes.ENUM("open", "waiting_admin", "waiting_client", "closed"),
    allowNull: false,
    defaultValue: "waiting_admin",
  },
  priority: {
    type: DataTypes.ENUM("low", "normal", "high"),
    allowNull: false,
    defaultValue: "normal",
  },
  lastMessageAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  lastMessagePreview: { type: DataTypes.STRING(240), allowNull: true, defaultValue: "" },
});

export const SupportMessage = sequelize.define("support_messages", {
  id: uuid,
  ticketId: { type: DataTypes.CHAR(36), allowNull: false },
  authorId: { type: DataTypes.CHAR(36), allowNull: true },
  from: { type: DataTypes.ENUM("client", "admin"), allowNull: false },
  body: { type: DataTypes.TEXT, allowNull: false },
});

export const CancellationRequest = sequelize.define("cancellation_requests", {
  id: uuid,
  userId: { type: DataTypes.CHAR(36), allowNull: false },
  reason: { type: DataTypes.TEXT, allowNull: false },
  status: {
    type: DataTypes.ENUM("pending", "approved", "rejected", "withdrawn"),
    allowNull: false,
    defaultValue: "pending",
  },
  adminId: { type: DataTypes.CHAR(36), allowNull: true },
  adminNote: { type: DataTypes.TEXT, allowNull: true },
  decidedAt: { type: DataTypes.DATE, allowNull: true },
});

export const ChannelIntegration = sequelize.define(
  "channel_integrations",
  {
    id: uuid,
    ownerUserId: { type: DataTypes.CHAR(36), allowNull: false },
    channel: { type: DataTypes.STRING(32), allowNull: false },
    provider: { type: DataTypes.STRING(60), allowNull: false, defaultValue: "whatsapp-connect" },
    displayName: { type: DataTypes.STRING(160), allowNull: true },
    status: {
      type: DataTypes.ENUM("draft", "active", "error", "disabled", "eliminated"),
      allowNull: false,
      defaultValue: "draft",
    },
    webhookUrl: { type: DataTypes.STRING(500), allowNull: true },
    lastHealthcheckAt: { type: DataTypes.DATE, allowNull: true },
    lastError: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    indexes: [
      { fields: ["ownerUserId"] },
      { unique: true, fields: ["ownerUserId", "channel", "provider"] },
    ],
  },
);

export const ChannelCredential = sequelize.define(
  "channel_credentials",
  {
    id: uuid,
    ownerUserId: { type: DataTypes.CHAR(36), allowNull: false },
    channelIntegrationId: { type: DataTypes.CHAR(36), allowNull: false },
    credentialType: { type: DataTypes.STRING(40), allowNull: false, defaultValue: "json_secrets" },
    cipherText: { type: DataTypes.TEXT("long"), allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    indexes: [{ fields: ["ownerUserId"] }, { fields: ["channelIntegrationId"] }],
  },
);

export const WhatsappIntegration = sequelize.define(
  "whatsapp_integrations",
  {
    id: uuid,
    ownerUserId: { type: DataTypes.CHAR(36), allowNull: false, unique: true },
    wabaId: { type: DataTypes.STRING(40), allowNull: false },
    phoneNumberId: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    displayPhoneNumber: { type: DataTypes.STRING(40), allowNull: true },
    status: {
      type: DataTypes.ENUM("draft", "active", "error", "disabled"),
      allowNull: false,
      defaultValue: "draft",
    },
    lastError: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    indexes: [{ fields: ["ownerUserId"] }, { unique: true, fields: ["phoneNumberId"] }],
  },
);

export const WhatsappCredential = sequelize.define(
  "whatsapp_credentials",
  {
    id: uuid,
    ownerUserId: { type: DataTypes.CHAR(36), allowNull: false },
    whatsappIntegrationId: { type: DataTypes.CHAR(36), allowNull: false },
    credentialType: { type: DataTypes.STRING(40), allowNull: false, defaultValue: "meta_system_user_token" },
    cipherText: { type: DataTypes.TEXT("long"), allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    indexes: [{ fields: ["ownerUserId"] }, { fields: ["whatsappIntegrationId"] }],
  },
);

export const BotSession = sequelize.define(
  "bot_sessions",
  {
    id: uuid,
    eventId: { type: DataTypes.CHAR(36), allowNull: false },
    guestId: { type: DataTypes.CHAR(36), allowNull: false },
    userId: { type: DataTypes.STRING(190), allowNull: false },
    items: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    lockedUntil: { type: DataTypes.DATE, allowNull: true },
  },
  {
    indexes: [
      { unique: true, fields: ["eventId", "guestId", "userId"] },
      { fields: ["eventId"] },
      { fields: ["guestId"] },
    ],
  },
);

export const OutboundJob = sequelize.define("outbound_jobs", {
  id: uuid,
  type: { type: DataTypes.STRING(80), allowNull: false },
  payload: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  status: {
    type: DataTypes.ENUM("queued", "processing", "done", "failed", "skipped"),
    allowNull: false,
    defaultValue: "queued",
  },
  scheduledAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  lastError: { type: DataTypes.TEXT, allowNull: true },
});

/** Idempotencia de webhooks inbound (replay dentro de la ventana HMAC). */
export const InboundEventDedup = sequelize.define(
  "inbound_event_dedup",
  {
    id: uuid,
    ownerUserId: { type: DataTypes.CHAR(36), allowNull: false },
    dedupeKey: { type: DataTypes.STRING(191), allowNull: false },
  },
  {
    freezeTableName: true,
    indexes: [{ unique: true, fields: ["ownerUserId", "dedupeKey"] }, { fields: ["ownerUserId"] }],
  },
);

Plan.hasMany(User, { foreignKey: "planId" });
User.belongsTo(Plan, { foreignKey: "planId", as: "plan" });
User.hasMany(Event, { foreignKey: "ownerId" });
Event.belongsTo(User, { foreignKey: "ownerId", as: "owner" });

User.hasMany(RefreshToken, { foreignKey: "userId" });
RefreshToken.belongsTo(User, { foreignKey: "userId" });
User.hasMany(PasswordReset, { foreignKey: "userId" });
PasswordReset.belongsTo(User, { foreignKey: "userId" });

Event.hasMany(EventMember, { foreignKey: "eventId", as: "members" });
EventMember.belongsTo(Event, { foreignKey: "eventId" });
Event.hasMany(EventRolePermission, { foreignKey: "eventId", as: "rolePermissions" });
EventRolePermission.belongsTo(Event, { foreignKey: "eventId" });
Event.hasMany(Guest, { foreignKey: "eventId", as: "guests" });
Guest.belongsTo(Event, { foreignKey: "eventId" });
Event.hasMany(Conversation, { foreignKey: "eventId", as: "conversations" });
Conversation.belongsTo(Event, { foreignKey: "eventId" });
Guest.hasOne(Conversation, { foreignKey: "guestId", as: "conversation" });
Conversation.belongsTo(Guest, { foreignKey: "guestId", as: "guest" });
Conversation.hasMany(Message, { foreignKey: "conversationId", as: "messages" });
Message.belongsTo(Conversation, { foreignKey: "conversationId" });
Event.hasOne(AiConfig, { foreignKey: "eventId", as: "ai" });
AiConfig.belongsTo(Event, { foreignKey: "eventId" });
Event.hasMany(Template, { foreignKey: "eventId", as: "templates" });
Template.belongsTo(Event, { foreignKey: "eventId" });
Event.hasMany(Faq, { foreignKey: "eventId", as: "faqs" });
Faq.belongsTo(Event, { foreignKey: "eventId" });
Event.hasMany(Activity, { foreignKey: "eventId", as: "activities" });
Activity.belongsTo(Event, { foreignKey: "eventId" });
Event.hasMany(Campaign, { foreignKey: "eventId", as: "campaigns" });
Campaign.belongsTo(Event, { foreignKey: "eventId" });
Event.hasMany(BotSession, { foreignKey: "eventId", as: "botSessions" });
BotSession.belongsTo(Event, { foreignKey: "eventId" });
Guest.hasMany(BotSession, { foreignKey: "guestId", as: "botSessions" });
BotSession.belongsTo(Guest, { foreignKey: "guestId" });

User.hasMany(Payment, { foreignKey: "userId" });
Payment.belongsTo(User, { foreignKey: "userId", as: "user" });
Plan.hasMany(Payment, { foreignKey: "planId" });
Payment.belongsTo(Plan, { foreignKey: "planId", as: "plan" });

User.hasMany(CancellationRequest, { foreignKey: "userId" });
CancellationRequest.belongsTo(User, { foreignKey: "userId", as: "user" });
User.hasMany(CancellationRequest, { foreignKey: "adminId", as: "reviewedCancellations" });
CancellationRequest.belongsTo(User, { foreignKey: "adminId", as: "admin" });

User.hasMany(SupportTicket, { foreignKey: "userId" });
SupportTicket.belongsTo(User, { foreignKey: "userId", as: "user" });
SupportTicket.hasMany(SupportMessage, { foreignKey: "ticketId", as: "messages" });
SupportMessage.belongsTo(SupportTicket, { foreignKey: "ticketId" });
User.hasMany(SupportMessage, { foreignKey: "authorId" });
SupportMessage.belongsTo(User, { foreignKey: "authorId", as: "author" });

User.hasMany(ChannelIntegration, { foreignKey: "ownerUserId" });
ChannelIntegration.belongsTo(User, { foreignKey: "ownerUserId" });
ChannelIntegration.hasMany(ChannelCredential, { foreignKey: "channelIntegrationId", as: "credentials" });
ChannelCredential.belongsTo(ChannelIntegration, { foreignKey: "channelIntegrationId" });
User.hasMany(ChannelCredential, { foreignKey: "ownerUserId" });
ChannelCredential.belongsTo(User, { foreignKey: "ownerUserId" });
User.hasMany(WhatsappIntegration, { foreignKey: "ownerUserId" });
WhatsappIntegration.belongsTo(User, { foreignKey: "ownerUserId" });
WhatsappIntegration.hasMany(WhatsappCredential, { foreignKey: "whatsappIntegrationId", as: "credentials" });
WhatsappCredential.belongsTo(WhatsappIntegration, { foreignKey: "whatsappIntegrationId" });
User.hasMany(WhatsappCredential, { foreignKey: "ownerUserId" });
WhatsappCredential.belongsTo(User, { foreignKey: "ownerUserId" });
User.hasMany(InboundEventDedup, { foreignKey: "ownerUserId" });
InboundEventDedup.belongsTo(User, { foreignKey: "ownerUserId" });

export { sequelize };

export async function syncModels({ force = false, alter = false } = {}) {
  // sequelize.sync({ alter }) en MySQL vuelve a emitir CHANGE ... UNIQUE y acumula
  // índices hasta ER_TOO_MANY_KEYS (máx. 64). Se limpian duplicados antes del alter.
  if (alter) await pruneDuplicateIndexes(sequelize);
  await sequelize.sync({ force, alter });
}

export async function ensureEventMemberRemovedAt() {
  const qi = sequelize.getQueryInterface();
  let table;
  try {
    table = await qi.describeTable("event_members");
  } catch {
    return;
  }
  if (table.removedAt) return;
  await qi.addColumn("event_members", "removedAt", {
    type: DataTypes.DATE,
    allowNull: true,
  });
  console.log("[db] columna event_members.removedAt creada");
}

export async function ensureInboundEventDedupTable() {
  await InboundEventDedup.sync();
}

export async function ensureWhatsappMetaTables() {
  await WhatsappIntegration.sync();
  await WhatsappCredential.sync();
}

export async function ensureCampaignColumns() {
  const qi = sequelize.getQueryInterface();
  let table;
  try {
    table = await qi.describeTable("campaigns");
  } catch {
    return;
  }
  if (!table.scheduledAt) {
    await qi.addColumn("campaigns", "scheduledAt", {
      type: DataTypes.DATEONLY,
      allowNull: true,
    });
    console.log("[db] columna campaigns.scheduledAt creada");
  }
  if (!table.total) {
    await qi.addColumn("campaigns", "total", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    console.log("[db] columna campaigns.total creada");
  }
  if (!table.processed) {
    await qi.addColumn("campaigns", "processed", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
    console.log("[db] columna campaigns.processed creada");
  }
  if (table.launchedAt && table.launchedAt.allowNull === false) {
    await qi.changeColumn("campaigns", "launchedAt", {
      type: DataTypes.DATE,
      allowNull: true,
    });
    console.log("[db] columna campaigns.launchedAt ahora admite null");
  }
}

export async function ensureMessageProviderId() {
  const qi = sequelize.getQueryInterface();
  let table;
  try {
    table = await qi.describeTable("messages");
  } catch {
    return;
  }
  if (table.providerId) return;
  await qi.addColumn("messages", "providerId", {
    type: DataTypes.STRING(120),
    allowNull: true,
    unique: true,
  });
  console.log("[db] columna messages.providerId creada");
}

export async function ensureGuestCustomData() {
  const qi = sequelize.getQueryInterface();
  let table;
  try {
    table = await qi.describeTable("guests");
  } catch (err) {
    console.error("[db] no se pudo describir guests para customData", err?.message || err);
    return;
  }
  if (table.customData) return;
  try {
    await qi.addColumn("guests", "customData", {
      type: DataTypes.JSON,
      allowNull: true,
    });
    console.log("[db] columna guests.customData creada");
  } catch (err) {
    console.error("[db] no se pudo crear guests.customData", err?.message || err);
  }
}

export async function ensureTemplateGreetingVar() {
  const qi = sequelize.getQueryInterface();
  let table;
  try {
    table = await qi.describeTable("templates");
  } catch {
    return;
  }
  if (!table.greetingVar) {
    await qi.addColumn("templates", "greetingVar", {
      type: DataTypes.STRING(40),
      allowNull: false,
      defaultValue: "nombre",
    });
    console.log("[db] columna templates.greetingVar creada");
  }
}

export async function ensureTemplateBodyVars() {
  const qi = sequelize.getQueryInterface();
  let table;
  try {
    table = await qi.describeTable("templates");
  } catch {
    return;
  }
  if (!table.bodyVars) {
    await qi.addColumn("templates", "bodyVars", {
      type: DataTypes.JSON,
      allowNull: true,
    });
    console.log("[db] columna templates.bodyVars creada");
  }
}

export async function ensureTemplateDocumentColumns() {
  const qi = sequelize.getQueryInterface();
  let table;
  try {
    table = await qi.describeTable("templates");
  } catch {
    return;
  }
  if (!table.attachDocument) {
    await qi.addColumn("templates", "attachDocument", {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    console.log("[db] columna templates.attachDocument creada");
  }
  if (!table.documentPath) {
    await qi.addColumn("templates", "documentPath", {
      type: DataTypes.STRING(500),
      allowNull: true,
    });
    console.log("[db] columna templates.documentPath creada");
  }
  if (!table.documentFileName) {
    await qi.addColumn("templates", "documentFileName", {
      type: DataTypes.STRING(255),
      allowNull: true,
    });
    console.log("[db] columna templates.documentFileName creada");
  }
  if (!table.documentMime) {
    await qi.addColumn("templates", "documentMime", {
      type: DataTypes.STRING(120),
      allowNull: true,
    });
    console.log("[db] columna templates.documentMime creada");
  }
  if (!table.documentSize) {
    await qi.addColumn("templates", "documentSize", {
      type: DataTypes.INTEGER,
      allowNull: true,
    });
    console.log("[db] columna templates.documentSize creada");
  }
}
