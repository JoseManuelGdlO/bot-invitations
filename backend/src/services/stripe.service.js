import Stripe from "stripe";
import { Plan, User } from "../models/index.js";
import { env } from "../config/env.js";

let client = null;

export function stripeEnabled() {
  return Boolean(env.stripe.secret);
}

export function getStripe() {
  if (!env.stripe.secret) return null;
  if (!client) client = new Stripe(env.stripe.secret);
  return client;
}

export async function ensureStripePrice(plan, { rotate = false } = {}) {
  const stripe = getStripe();
  if (!stripe || !plan) return plan;
  if (!plan.stripeProductId) {
    const product = await stripe.products.create({
      name: `Alanna ${plan.name}`,
      description: plan.tagline,
      metadata: { planId: plan.id, slug: plan.slug },
    });
    plan.stripeProductId = product.id;
  } else {
    await stripe.products.update(plan.stripeProductId, {
      name: `Alanna ${plan.name}`,
      description: plan.tagline,
    });
  }
  if (!plan.stripePriceId || rotate) {
    const price = await stripe.prices.create({
      product: plan.stripeProductId,
      currency: "mxn",
      unit_amount: Number(plan.priceMxn) * 100,
      recurring: { interval: "month" },
      metadata: { planId: plan.id, slug: plan.slug },
    });
    if (plan.stripePriceId) {
      await stripe.prices.update(plan.stripePriceId, { active: false }).catch(() => undefined);
    }
    plan.stripePriceId = price.id;
  }
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
  if (user.stripeCustomerId) return user.stripeCustomerId;
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

export async function applySubscription({ userId, planId, customerId, subscriptionId, status }) {
  const user = userId ? await User.findByPk(userId) : await User.findOne({ where: { stripeCustomerId: customerId } });
  if (!user) return null;
  if (planId) user.planId = planId;
  if (customerId) user.stripeCustomerId = customerId;
  if (subscriptionId) user.stripeSubscriptionId = subscriptionId;
  if (status) user.subscriptionStatus = mapStripeStatus(status);
  await user.save();
  return user;
}

export async function startCheckout(user, plan, { successPath, cancelPath } = {}) {
  const stripe = getStripe();
  if (!stripe) {
    const err = new Error("Stripe no está configurado. Agrega STRIPE_SECRET_KEY.");
    err.status = 503;
    throw err;
  }
  await ensureStripePrice(plan);
  const customerId = await ensureCustomer(user);

  if (user.stripeSubscriptionId && user.subscriptionStatus === "active") {
    const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
    const item = subscription.items.data[0];
    if (item) {
      await stripe.subscriptions.update(user.stripeSubscriptionId, {
        items: [{ id: item.id, price: plan.stripePriceId }],
        metadata: { userId: user.id, planId: plan.id },
        proration_behavior: "create_prorations",
      });
    }
    user.planId = plan.id;
    await user.save();
    return { checkoutUrl: null, updated: true };
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    locale: "es",
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    success_url: `${env.clientUrl}${successPath || "/registro/exito"}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.clientUrl}${cancelPath || "/registro?pago=cancelado"}`,
    metadata: { userId: user.id, planId: plan.id },
    subscription_data: { metadata: { userId: user.id, planId: plan.id } },
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
  });
  return session;
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
    });
    return;
  }
  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted" ||
    event.type === "customer.subscription.created"
  ) {
    const priceId = object.items?.data?.[0]?.price?.id;
    const plan = priceId ? await Plan.findOne({ where: { stripePriceId: priceId } }) : null;
    await applySubscription({
      userId: object.metadata?.userId,
      planId: object.metadata?.planId || plan?.id,
      customerId: object.customer,
      subscriptionId: object.id,
      status: object.status,
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
