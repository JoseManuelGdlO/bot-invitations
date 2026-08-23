import { Event, Guest, Plan, User } from "../models/index.js";
import { userEventIds } from "./access.service.js";

export const PLAN_DEFS = [
  {
    slug: "esencial",
    name: "Esencial",
    tagline: "Para planners que empiezan con bodas íntimas.",
    priceMxn: 500,
    eventLimit: 2,
    guestLimit: 300,
    highlighted: false,
    sortOrder: 1,
  },
  {
    slug: "estudio",
    name: "Estudio",
    tagline: "El ritmo de un estudio con varias fechas al año.",
    priceMxn: 1200,
    eventLimit: 6,
    guestLimit: 1000,
    highlighted: true,
    sortOrder: 2,
  },
  {
    slug: "atelier",
    name: "Atelier",
    tagline: "Para equipos con temporada completa de eventos.",
    priceMxn: 2400,
    eventLimit: 15,
    guestLimit: 3000,
    highlighted: false,
    sortOrder: 3,
  },
];

export function serializePlan(plan) {
  return {
    id: plan.id,
    slug: plan.slug,
    name: plan.name,
    tagline: plan.tagline,
    priceMxn: plan.priceMxn,
    eventLimit: plan.eventLimit,
    guestLimit: plan.guestLimit,
    highlighted: !!plan.highlighted,
  };
}

export async function ensurePlans() {
  for (const def of PLAN_DEFS) {
    const existing = await Plan.findOne({ where: { slug: def.slug } });
    if (existing) await existing.update(def);
    else await Plan.create(def);
  }
  return Plan.findAll({ order: [["sortOrder", "ASC"]] });
}

export async function getUserPlan(user) {
  if (!user?.planId) return null;
  return Plan.findByPk(user.planId);
}

export async function assertCanCreateEvent(user) {
  const plan = await getUserPlan(user);
  if (!plan) return;
  const count = await Event.count({ where: { ownerId: user.id } });
  if (count >= plan.eventLimit) {
    const err = new Error(
      `Tu plan ${plan.name} incluye ${plan.eventLimit} eventos. Mejora tu suscripción para crear otro.`,
    );
    err.status = 402;
    throw err;
  }
}

export async function assertCanAddGuests(user, incomingCount) {
  const plan = await getUserPlan(user);
  if (!plan) return;
  const ids = await userEventIds(user.id);
  const current = ids.length ? await Guest.count({ where: { eventId: ids } }) : 0;
  if (current + incomingCount > plan.guestLimit) {
    const remaining = Math.max(0, plan.guestLimit - current);
    const err = new Error(
      `Tu plan ${plan.name} incluye ${plan.guestLimit} invitados. Te quedan ${remaining} lugares disponibles.`,
    );
    err.status = 402;
    throw err;
  }
}
