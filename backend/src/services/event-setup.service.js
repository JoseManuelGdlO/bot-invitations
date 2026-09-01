import {
  AiConfig,
  EventMember,
  EventRolePermission,
  Faq,
  Template,
} from "../models/index.js";
import { DEFAULT_ROLES, defaultAI, defaultFaqs, defaultTemplates } from "../utils/defaults.js";
import { initialsFromName } from "../utils/slug.js";

export async function ensureAiConfig(event, { transaction } = {}) {
  const ai = defaultAI("Sofía", event.hosts || "Anfitriones");
  const [row] = await AiConfig.findOrCreate({
    where: { eventId: event.id },
    defaults: { eventId: event.id, ...ai, prompt: "" },
    ...(transaction ? { transaction } : {}),
  });
  return row;
}

export async function seedEventDefaults(event, owner, assistantName = "Sofía", { transaction } = {}) {
  const opts = transaction ? { transaction } : {};
  const ai = defaultAI(assistantName, event.hosts);
  await AiConfig.create({ eventId: event.id, ...ai, prompt: "" }, opts);
  await Template.bulkCreate(
    defaultTemplates(event.hosts).map((t) => ({ ...t, eventId: event.id })),
    opts,
  );
  await Faq.bulkCreate(
    defaultFaqs(event.venue).map((f) => ({ ...f, eventId: event.id })),
    opts,
  );
  await EventMember.create(
    {
      eventId: event.id,
      userId: owner.id,
      name: owner.name,
      email: owner.email,
      role: "Administrador",
      initials: initialsFromName(owner.name),
    },
    opts,
  );
  const perms = DEFAULT_ROLES.flatMap((r) =>
    r.perms.map((permission) => ({
      eventId: event.id,
      role: r.role,
      permission,
      enabled: true,
    })),
  );
  await EventRolePermission.bulkCreate(perms, opts);
}
