import Stripe from "stripe";
import { Op } from "sequelize";
import { Plan, User } from "../models/index.js";
import { env } from "../config/env.js";
import { yearlyPriceMxn } from "./plans.service.js";

let client = null;

export function stripeEnabled() {
  return Boolean(env.stripe.secret);
}

export function getStripe() {
  if (!env.stripe.secret) return null;
  if (!client) client = new Stripe(env.stripe.secret);
  return client;
}

function normalizeInterval(value) {
  return value === "year" ? "year" : "month";
}

function isMissing(err) {
  return err?.code === "resource_missing" || /no such (product|price|customer)/i.test(err?.message || "");
}

async function retrieveOrNull(loader) {
  try {
    return await loader();
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
}

async function upsertRecurringPrice(stripe, plan, { interval, amountMxn, currentId, rotate }) {
  if (currentId && !rotate) {
    const existing = await retrieveOrNull(() => stripe.prices.retrieve(currentId));
    if (existing && existing.active !== false) return currentId;
  }
  const price = await stripe.prices.create({
    product: plan.stripeProductId,
    currency: "mxn",
    unit_amount: Number(amountMxn) * 100,
    recurring: { interval },
    metadata: { planId: plan.id, slug: plan.slug, interval },
  });
  if (currentId) {
    await stripe.prices.update(currentId, { active: false }).catch(() => undefined);
  }
  return price.id;
}

export async function ensureStripePrice(plan, { rotate = false } = {}) {
  const stripe = getStripe();
  if (!stripe || !plan) return plan;
  const existingProduct = plan.stripeProductId
    ? await retrieveOrNull(() => stripe.products.retrieve(plan.stripeProductId))
    : null;
  if (!existingProduct) {
    const product = await stripe.products.create({
      name: `Alanna ${plan.name}`,
      description: plan.tagline,
      metadata: { planId: plan.id, slug: plan.slug },
    });
    plan.stripeProductId = product.id;
    plan.stripePriceId = null;
    plan.stripeYearlyPriceId = null;
    rotate = true;
  } else {
    await stripe.products.update(plan.stripeProductId, {
      name: `Alanna ${plan.name}`,
      description: plan.tagline,
    });
  }
  plan.stripePriceId = await upsertRecurringPrice(stripe, plan, {
    interval: "month",
    amountMxn: plan.priceMxn,
    currentId: plan.stripePriceId,
    rotate,
  });
  plan.stripeYearlyPriceId = await upsertRecurringPrice(stripe, plan, {
    interval: "year",
    amountMxn: yearlyPriceMxn(plan),
    currentId: plan.stripeYearlyPriceId,
    rotate,
  });
  await plan.save();
  return plan;
}

export async function syncStripePlans() {
  if (!stripeEnabled()) return;
  const plans = await Plan.findAll({ order: [["sortOrder", "ASC"]] });
  for (const plan of plans) {
    try {
      await ensureStripePrice(plan);
    } catch (err) {
      console.error(`[stripe] no se pudo sincronizar ${plan.slug}:`, err.message);
    }
  }
}

async function ensureCustomer(user) {
  const stripe = getStripe();
  if (user.stripeCustomerId) {
    const existing = await retrieveOrNull(() => stripe.customers.retrieve(user.stripeCustomerId));
    if (existing && !existing.deleted) return user.stripeCustomerId;
    user.stripeCustomerId = null;
    user.stripeSubscriptionId = null;
  }
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name,
    phone: user.phone || undefined,
    metadata: { userId: user.id },
  });
  user.stripeCustomerId = customer.id;
  await user.save();
  return customer.id;
}

function mapStripeStatus(status) {
  if (["active", "trialing"].includes(status)) return "active";
  if (["canceled", "incomplete_expired", "paused"].includes(status)) return "canceled";
  return "pending";
}

function priceIdFor(plan, interval) {
  return interval === "year" ? plan.stripeYearlyPriceId : plan.stripePriceId;
}

export async function applySubscription({ userId, planId, customerId, subscriptionId, status, interval }) {
  const user = userId ? await User.findByPk(userId) : await User.findOne({ where: { stripeCustomerId: customerId } });
  if (!user) return null;
  if (planId) user.planId = planId;
  if (customerId) user.stripeCustomerId = customerId;
  if (subscriptionId) user.stripeSubscriptionId = subscriptionId;
  if (status) user.subscriptionStatus = mapStripeStatus(status);
  if (interval) user.billingInterval = normalizeInterval(interval);
  await user.save();
  return user;
}

export async function startCheckout(user, plan, { successPath, cancelPath, interval = "month" } = {}) {
  const stripe = getStripe();
  if (!stripe) {
    const err = new Error("Stripe no está configurado. Agrega STRIPE_SECRET_KEY.");
    err.status = 503;
    throw err;
  }
  const billingInterval = normalizeInterval(interval);
  try {
    await ensureStripePrice(plan);
  } catch (err) {
    if (!isMissing(err)) throw err;
    plan.stripeProductId = null;
    plan.stripePriceId = null;
    plan.stripeYearlyPriceId = null;
    await plan.save();
    await ensureStripePrice(plan, { rotate: true });
  }
  const priceId = priceIdFor(plan, billingInterval);
  if (!priceId) {
    const err = new Error("Este plan aún no tiene precio de Stripe.");
    err.status = 503;
    throw err;
  }
  const customerId = await ensureCustomer(user);

  if (user.stripeSubscriptionId && user.subscriptionStatus === "active") {
    const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
    const item = subscription.items.data[0];
    if (item) {
      await stripe.subscriptions.update(user.stripeSubscriptionId, {
        items: [{ id: item.id, price: priceId }],
        metadata: { userId: user.id, planId: plan.id, interval: billingInterval },
        proration_behavior: "create_prorations",
      });
    }
    user.planId = plan.id;
    user.billingInterval = billingInterval;
    await user.save();
    return { checkoutUrl: null, updated: true };
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    locale: "es",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${env.clientUrl}${successPath || "/registro/exito"}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.clientUrl}${cancelPath || "/registro?pago=cancelado"}`,
    metadata: { userId: user.id, planId: plan.id, interval: billingInterval },
    subscription_data: { metadata: { userId: user.id, planId: plan.id, interval: billingInterval } },
    allow_promotion_codes: true,
  });
  return { checkoutUrl: session.url, updated: false };
}

export async function createPortalSession(user) {
  const stripe = getStripe();
  if (!stripe || !user.stripeCustomerId) {
    const err = new Error("Aún no hay una suscripción de Stripe para gestionar.");
    err.status = 400;
    throw err;
  }
  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${env.clientUrl}/eventos`,
  });
  return session.url;
}

export async function confirmCheckoutSession(sessionId) {
  const stripe = getStripe();
  if (!stripe) return null;
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== "paid" && session.status !== "complete") return session;
  await applySubscription({
    userId: session.metadata?.userId,
    planId: session.metadata?.planId,
    customerId: session.customer,
    subscriptionId: session.subscription,
    status: "active",
    interval: session.metadata?.interval,
  });
  return session;
}

async function planByPriceId(priceId) {
  if (!priceId) return null;
  return Plan.findOne({
    where: { [Op.or]: [{ stripePriceId: priceId }, { stripeYearlyPriceId: priceId }] },
  });
}

export async function handleStripeEvent(event) {
  const object = event.data.object;
  if (event.type === "checkout.session.completed") {
    await applySubscription({
      userId: object.metadata?.userId,
      planId: object.metadata?.planId,
      customerId: object.customer,
      subscriptionId: object.subscription,
      status: "active",
      interval: object.metadata?.interval,
    });
    return;
  }
  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted" ||
    event.type === "customer.subscription.created"
  ) {
    const priceId = object.items?.data?.[0]?.price?.id;
    const interval = object.items?.data?.[0]?.price?.recurring?.interval || object.metadata?.interval;
    const plan = await planByPriceId(priceId);
    await applySubscription({
      userId: object.metadata?.userId,
      planId: object.metadata?.planId || plan?.id,
      customerId: object.customer,
      subscriptionId: object.id,
      status: object.status,
      interval,
    });
    return;
  }
  if (event.type === "invoice.paid") {
    const subscriptionId = object.subscription;
    if (!subscriptionId) return;
    const user = await User.findOne({ where: { stripeSubscriptionId: subscriptionId } });
    if (user) {
      user.subscriptionStatus = "active";
      await user.save();
    }
    return;
  }
  if (event.type === "invoice.payment_failed") {
    const user = await User.findOne({ where: { stripeSubscriptionId: object.subscription } });
    if (user) {
      user.subscriptionStatus = "pending";
      await user.save();
    }
  }
}
