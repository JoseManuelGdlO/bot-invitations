import { Op } from "sequelize";
import bcrypt from "bcryptjs";
import { Event, Guest, Plan, User } from "../models/index.js";
import { asyncHandler } from "../utils/async.js";
import { serializePlan } from "../services/plans.service.js";

export async function ensureAdmin() {
  const email = String(process.env.ADMIN_EMAIL || "admin@alannaconfirmaciones.com.mx")
    .trim()
    .toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "admin1234";
  let user = await User.findOne({ where: { email } });
  if (!user) {
    user = await User.create({
      name: "Administrador Alanna",
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role: "Admin",
      isAdmin: true,
      subscriptionStatus: "active",
    });
    console.log(`[admin] cuenta lista: ${email}`);
    return user;
  }
  if (!user.isAdmin) {
    user.isAdmin = true;
    await user.save();
  }
  return user;
}

function serializeClient(user, extras = {}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    businessName: user.businessName || "",
    phone: user.phone || "",
    state: user.state || "",
    role: user.role,
    isAdmin: !!user.isAdmin,
    subscriptionStatus: user.subscriptionStatus,
    createdAt: user.createdAt,
    plan: user.plan ? serializePlan(user.plan) : null,
    eventCount: extras.eventCount ?? 0,
    guestCount: extras.guestCount ?? 0,
  };
}

export const overview = asyncHandler(async (_req, res) => {
  const [clients, events, guests, active, plans] = await Promise.all([
    User.count({ where: { isAdmin: false } }),
    Event.count(),
    Guest.count(),
    User.count({ where: { isAdmin: false, subscriptionStatus: "active" } }),
    Plan.findAll({ order: [["sortOrder", "ASC"]] }),
  ]);
  const users = await User.findAll({
    where: { isAdmin: false, subscriptionStatus: "active" },
    attributes: ["planId"],
  });
  const priceByPlan = Object.fromEntries(plans.map((plan) => [plan.id, plan.priceMxn]));
  const monthlyMxn = users.reduce((sum, user) => sum + (priceByPlan[user.planId] || 0), 0);
  res.json({
    clients,
    activeSubscriptions: active,
    events,
    guests,
    monthlyMxn,
    plans: plans.map(serializePlan),
  });
});

export const listClients = asyncHandler(async (req, res) => {
  const q = String(req.query.search || "").trim();
  const where = { isAdmin: false };
  if (q) {
    where[Op.or] = [
      { name: { [Op.like]: `%${q}%` } },
      { email: { [Op.like]: `%${q}%` } },
      { businessName: { [Op.like]: `%${q}%` } },
      { phone: { [Op.like]: `%${q}%` } },
      { state: { [Op.like]: `%${q}%` } },
    ];
  }
  const users = await User.findAll({
    where,
    include: [{ model: Plan, as: "plan" }],
    order: [["createdAt", "DESC"]],
  });
  const ids = users.map((user) => user.id);
  const events = ids.length
    ? await Event.findAll({ where: { ownerId: ids }, attributes: ["id", "ownerId"] })
    : [];
  const eventIds = events.map((event) => event.id);
  const guests = eventIds.length
    ? await Guest.findAll({ where: { eventId: eventIds }, attributes: ["eventId", "invited"] })
    : [];
  const eventsByOwner = Object.fromEntries(ids.map((id) => [id, 0]));
  const eventOwner = {};
  for (const event of events) {
    eventsByOwner[event.ownerId] = (eventsByOwner[event.ownerId] || 0) + 1;
    eventOwner[event.id] = event.ownerId;
  }
  const guestsByOwner = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const guest of guests) {
    const ownerId = eventOwner[guest.eventId];
    if (ownerId) guestsByOwner[ownerId] = (guestsByOwner[ownerId] || 0) + Number(guest.invited || 1);
  }
  res.json(
    users.map((user) =>
      serializeClient(user, {
        eventCount: eventsByOwner[user.id] || 0,
        guestCount: guestsByOwner[user.id] || 0,
      }),
    ),
  );
});

export const updateClient = asyncHandler(async (req, res) => {
  const user = await User.findByPk(req.params.userId, { include: [{ model: Plan, as: "plan" }] });
  if (!user || user.isAdmin) return res.status(404).json({ error: "Cliente no encontrado." });
  const { planId, subscriptionStatus } = req.body || {};
  if (planId) {
    const plan = await Plan.findByPk(planId);
    if (!plan) return res.status(400).json({ error: "El plan no existe." });
    user.planId = plan.id;
  }
  if (subscriptionStatus && ["pending", "active", "canceled"].includes(subscriptionStatus)) {
    user.subscriptionStatus = subscriptionStatus;
  }
  await user.save();
  await user.reload({ include: [{ model: Plan, as: "plan" }] });
  const eventCount = await Event.count({ where: { ownerId: user.id } });
  const owned = await Event.findAll({ where: { ownerId: user.id }, attributes: ["id"] });
  const guestCount = owned.length
    ? Number((await Guest.sum("invited", { where: { eventId: owned.map((event) => event.id) } })) || 0)
    : 0;
  res.json(serializeClient(user, { eventCount, guestCount }));
});

export const listPlans = asyncHandler(async (_req, res) => {
  const plans = await Plan.findAll({ order: [["sortOrder", "ASC"]] });
  res.json(plans.map(serializePlan));
});

export const updatePlan = asyncHandler(async (req, res) => {
  const plan = await Plan.findByPk(req.params.planId);
  if (!plan) return res.status(404).json({ error: "Plan no encontrado." });
  const previousPrice = plan.priceMxn;
  const previousDiscount = plan.annualDiscountPercent;
  const allowed = ["name", "tagline", "priceMxn", "eventLimit", "guestLimit", "highlighted", "annualDiscountPercent"];
  for (const key of allowed) {
    if (req.body?.[key] !== undefined) plan[key] = req.body[key];
  }
  const priceChanged =
    (req.body?.priceMxn !== undefined && Number(req.body.priceMxn) !== Number(previousPrice)) ||
    (req.body?.annualDiscountPercent !== undefined &&
      Number(req.body.annualDiscountPercent) !== Number(previousDiscount));
  await plan.save();
  const { ensureStripePrice, stripeEnabled } = await import("../services/stripe.service.js");
  if (stripeEnabled()) {
    await ensureStripePrice(plan, { rotate: priceChanged });
  }
  res.json(serializePlan(plan));
});
