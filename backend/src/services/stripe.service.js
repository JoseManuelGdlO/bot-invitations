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

function periodEndFrom(object) {
  const ts = object?.current_period_end || object?.items?.data?.[0]?.current_period_end;
  return ts ? new Date(Number(ts) * 1000) : null;
}

export async function applySubscription({
  userId,
  planId,
  customerId,
  subscriptionId,
  status,
  interval,
  cancelAtPeriodEnd,
  currentPeriodEnd,
}) {
  const user = userId ? await User.findByPk(userId) : await User.findOne({ where: { stripeCustomerId: customerId } });
  if (!user) return null;
  if (planId) user.planId = planId;
  if (customerId) user.stripeCustomerId = customerId;
  if (subscriptionId) user.stripeSubscriptionId = subscriptionId;
  if (status) user.subscriptionStatus = mapStripeStatus(status);
  if (interval) user.billingInterval = normalizeInterval(interval);
  if (typeof cancelAtPeriodEnd === "boolean") user.cancelAtPeriodEnd = cancelAtPeriodEnd;
  if (currentPeriodEnd) user.currentPeriodEnd = currentPeriodEnd;
  if (user.subscriptionStatus === "canceled") user.cancelAtPeriodEnd = true;
  if (user.subscriptionStatus === "active" && cancelAtPeriodEnd === false) user.cancelAtPeriodEnd = false;
  await user.save();
  if (user.cancelAtPeriodEnd || user.subscriptionStatus === "canceled") {
    const { markOpenCancellationsFromStripe } = await import("./cancellation.service.js");
    await markOpenCancellationsFromStripe(user.id);
  }
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
        cancel_at_period_end: false,
      });
    }
    user.planId = plan.id;
    user.billingInterval = billingInterval;
    user.cancelAtPeriodEnd = false;
    user.subscriptionStatus = "active";
    await user.save();
    return { checkoutUrl: null, updated: true };
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    locale: "es",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${env.clientUrl}${successPath || "/pago/exito"}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.clientUrl}${cancelPath || "/registro?pago=cancelado"}`,
    metadata: { userId: user.id, planId: plan.id, interval: billingInterval },
    subscription_data: { metadata: { userId: user.id, planId: plan.id, interval: billingInterval } },
    allow_promotion_codes: true,
  });
  return { checkoutUrl: session.url, updated: false };
}

let portalConfigId = null;

async function portalConfigWithoutSelfCancel(stripe) {
  if (portalConfigId) return portalConfigId;
  const list = await stripe.billingPortal.configurations.list({ limit: 20 });
  const existing = list.data.find((item) => item.metadata?.alanna === "no-self-cancel");
  if (existing) {
    portalConfigId = existing.id;
    return portalConfigId;
  }
  const created = await stripe.billingPortal.configurations.create({
    business_profile: { headline: "Actualiza tu método de pago de Alanna" },
    features: {
      customer_update: { enabled: true, allowed_updates: ["email", "name", "address", "phone"] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: false },
      subscription_update: { enabled: false },
    },
    metadata: { alanna: "no-self-cancel" },
  });
  portalConfigId = created.id;
  return portalConfigId;
}

export async function createPortalSession(user) {
  const stripe = getStripe();
  if (!stripe || !user.stripeCustomerId) {
    const err = new Error("Aún no hay una suscripción de Stripe para gestionar.");
    err.status = 400;
    throw err;
  }
  const configuration = await portalConfigWithoutSelfCancel(stripe);
  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${env.clientUrl}/eventos`,
    configuration,
  });
  return session.url;
}

export async function scheduleCancelAtPeriodEnd(user) {
  const stripe = getStripe();
  const fallback = () => {
    const date = new Date();
    const days = user.billingInterval === "year" ? 365 : 30;
    date.setDate(date.getDate() + days);
    return date;
  };
  if (!stripe || !user.stripeSubscriptionId) {
    user.cancelAtPeriodEnd = true;
    user.currentPeriodEnd = user.currentPeriodEnd || fallback();
    await user.save();
    return { scheduled: false, periodEnd: user.currentPeriodEnd };
  }
  try {
    const subscription = await stripe.subscriptions.update(user.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
    user.cancelAtPeriodEnd = true;
    user.currentPeriodEnd = periodEndFrom(subscription) || user.currentPeriodEnd || fallback();
    await user.save();
    return { scheduled: true, periodEnd: user.currentPeriodEnd };
  } catch (err) {
    if (!isMissing(err)) throw err;
    user.cancelAtPeriodEnd = true;
    user.currentPeriodEnd = user.currentPeriodEnd || fallback();
    await user.save();
    return { scheduled: false, periodEnd: user.currentPeriodEnd };
  }
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
    cancelAtPeriodEnd: false,
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
      cancelAtPeriodEnd: false,
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
      cancelAtPeriodEnd: Boolean(object.cancel_at_period_end) || object.status === "canceled",
      currentPeriodEnd: periodEndFrom(object),
    });
    return;
  }
  if (event.type === "invoice.paid") {
    const subscriptionId = object.subscription;
    const user = subscriptionId
      ? await User.findOne({ where: { stripeSubscriptionId: subscriptionId } })
      : null;
    if (user) {
      user.subscriptionStatus = "active";
      await user.save();
    }
    const { recordPaidInvoice } = await import("./finance.service.js");
    await recordPaidInvoice(object, { user });
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
