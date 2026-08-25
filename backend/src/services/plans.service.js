import { Event, Guest, Plan, User } from "../models/index.js";

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
    annualDiscountPercent: 20,
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
    annualDiscountPercent: 20,
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
    annualDiscountPercent: 20,
  },
];

export function annualDiscountOf(plan) {
  return Math.min(80, Math.max(0, Number(plan.annualDiscountPercent) || 0));
}

export function yearlyPriceMxn(plan) {
  return Math.max(0, Math.round(Number(plan.priceMxn) * 12 * (1 - annualDiscountOf(plan) / 100)));
}

export function serializePlan(plan) {
  const discount = annualDiscountOf(plan);
  return {
    id: plan.id,
    slug: plan.slug,
    name: plan.name,
    tagline: plan.tagline,
    priceMxn: plan.priceMxn,
    yearlyPriceMxn: yearlyPriceMxn(plan),
    annualDiscountPercent: discount,
    eventLimit: plan.eventLimit,
    guestLimit: plan.guestLimit,
    highlighted: !!plan.highlighted,
  };
}

export async function ensurePlans() {
  for (const def of PLAN_DEFS) {
    const existing = await Plan.findOne({ where: { slug: def.slug } });
    if (!existing) await Plan.create(def);
  }
  return Plan.findAll({ order: [["sortOrder", "ASC"]] });
}

export function planError(message) {
  const err = new Error(message);
  err.status = 402;
  err.upgrade = true;
  return err;
}

export async function getUserPlan(user) {
  if (!user?.planId) return null;
  return Plan.findByPk(user.planId);
}

export async function ownedEventIds(userId) {
  const owned = await Event.findAll({ where: { ownerId: userId }, attributes: ["id"] });
  return owned.map((event) => event.id);
}

export async function countOwnedGuests(userId) {
  const ids = await ownedEventIds(userId);
  if (!ids.length) return 0;
  return Number((await Guest.sum("invited", { where: { eventId: ids } })) || 0);
}

export async function getPlanUsage(user) {
  const plan = user.isAdmin ? null : await getUserPlan(user);
  const eventCount = await Event.count({ where: { ownerId: user.id } });
  const guestCount = await countOwnedGuests(user.id);
  const eventLimit = plan?.eventLimit ?? 0;
  const guestLimit = plan?.guestLimit ?? 0;
  const active = isSubscriptionUsable(user);
  return {
    eventCount,
    guestCount,
    eventLimit,
    guestLimit,
    canCreateEvent: user.isAdmin || (active && !!plan && eventCount < eventLimit),
    remainingGuests: user.isAdmin ? Number.MAX_SAFE_INTEGER : Math.max(0, guestLimit - guestCount),
    canSendInvitations: true,
  };
}

export function assertCanSendInvitations(_user) {
  return;
}

export function isSubscriptionUsable(user) {
  if (user?.isAdmin) return true;
  if (user?.subscriptionStatus !== "active") return false;
  if (user.cancelAtPeriodEnd && user.currentPeriodEnd && new Date(user.currentPeriodEnd) <= new Date()) {
    return false;
  }
  return true;
}

export async function settleExpiredSubscription(user) {
  if (!user || user.isAdmin) return user;
  if (user.subscriptionStatus === "active" && user.cancelAtPeriodEnd && user.currentPeriodEnd && new Date(user.currentPeriodEnd) <= new Date()) {
    user.subscriptionStatus = "canceled";
    await user.save();
  }
  return user;
}

function requireActivePlan(user, plan) {
  if (user.isAdmin) return null;
  if (!isSubscriptionUsable(user)) {
    throw planError("Tu periodo ya terminó o la cuenta no se renovó. Reactiva tu plan para crear eventos o agregar invitados.");
  }
  if (!plan) {
    throw planError("Necesitas un plan activo para usar la plataforma. Elige uno para continuar.");
  }
  return plan;
}

export async function assertCanCreateEvent(user) {
  const plan = requireActivePlan(user, await getUserPlan(user));
  if (!plan) return;
  const count = await Event.count({ where: { ownerId: user.id } });
  if (count >= plan.eventLimit) {
    throw planError(
      `Tu plan ${plan.name} incluye ${plan.eventLimit} eventos. Mejora tu suscripción para crear otro.`,
    );
  }
}

export async function assertCanAddGuests(user, incomingCount) {
  const plan = requireActivePlan(user, await getUserPlan(user));
  if (!plan) return;
  const current = await countOwnedGuests(user.id);
  if (current + incomingCount > plan.guestLimit) {
    const remaining = Math.max(0, plan.guestLimit - current);
    throw planError(
      `Tu plan ${plan.name} incluye ${plan.guestLimit} invitados. Te quedan ${remaining} lugares. Mejora tu suscripción para agregar más.`,
    );
  }
}

export async function assertCanAddGuestsForEvent(actor, event, incomingCount) {
  if (actor?.isAdmin) return;
  const owner =
    event?.ownerId && actor?.id === event.ownerId ? actor : await User.findByPk(event?.ownerId);
  if (!owner) {
    throw planError("No se encontró al dueño del evento.");
  }
  return assertCanAddGuests(owner, incomingCount);
}
