import {
  AiConfig,
  EventMember,
  EventRolePermission,
  Faq,
  Template,
} from "../models/index.js";
import { DEFAULT_ROLES, defaultAI, defaultFaqs, defaultTemplates } from "../utils/defaults.js";
import { initialsFromName } from "../utils/slug.js";

export async function seedEventDefaults(event, owner, assistantName = "Sofía") {
  const ai = defaultAI(assistantName, event.hosts);
  await AiConfig.create({ eventId: event.id, ...ai, prompt: "" });
  await Template.bulkCreate(defaultTemplates(event.hosts).map((t) => ({ ...t, eventId: event.id })));
  await Faq.bulkCreate(defaultFaqs(event.venue).map((f) => ({ ...f, eventId: event.id })));
  await EventMember.create({
    eventId: event.id,
    userId: owner.id,
    name: owner.name,
    email: owner.email,
    role: "Administrador",
    initials: initialsFromName(owner.name),
  });
  const perms = DEFAULT_ROLES.flatMap((r) =>
    r.perms.map((permission) => ({
      eventId: event.id,
      role: r.role,
      permission,
      enabled: true,
    })),
  );
  await EventRolePermission.bulkCreate(perms);
}
