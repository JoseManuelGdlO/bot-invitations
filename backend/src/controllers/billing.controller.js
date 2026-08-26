import { Plan } from "../models/index.js";
import { env } from "../config/env.js";
import { asyncHandler } from "../utils/async.js";
import {
  confirmCheckoutSession,
  createPortalSession,
  getStripe,
  handleStripeEvent,
  startCheckout,
  stripeEnabled,
} from "../services/stripe.service.js";

export const webhook = async (req, res) => {
  const stripe = getStripe();
  if (!stripe || !env.stripe.webhookSecret) {
    return res.status(503).json({ error: "Webhook de Stripe no configurado." });
  }
  const signature = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, env.stripe.webhookSecret);
  } catch (err) {
    console.error("[stripe] firma inválida", err.message);
    return res.status(400).json({ error: "Firma de Stripe inválida." });
  }
  try {
    await handleStripeEvent(event);
    res.json({ received: true });
  } catch (err) {
    console.error("[stripe] webhook", err);
    res.status(500).json({ error: "No se pudo procesar el evento." });
  }
};

export const checkout = asyncHandler(async (req, res) => {
  if (!stripeEnabled()) return res.status(503).json({ error: "Stripe no está configurado." });
  const plan = await Plan.findByPk(req.body?.planId);
  if (!plan) return res.status(400).json({ error: "Selecciona un plan válido." });
  const result = await startCheckout(req.user, plan, {
    successPath: "/pago/exito",
    cancelPath: "/eventos",
    interval: req.body?.interval === "year" ? "year" : "month",
  });
  res.json(result);
});

export const portal = asyncHandler(async (req, res) => {
  const url = await createPortalSession(req.user);
  res.json({ portalUrl: url });
});

function sessionPaid(session) {
  return session.payment_status === "paid" || session.status === "complete";
}

export const confirmSession = asyncHandler(async (req, res) => {
  const session = await confirmCheckoutSession(req.query.session_id || req.params.sessionId);
  if (!session) return res.status(404).json({ error: "Sesión no encontrada." });
  const payload = { status: session.status, paymentStatus: session.payment_status };
  if (!sessionPaid(session)) {
    return res.status(409).json({ error: "El pago no se completó.", ...payload });
  }
  res.json({ ok: true, ...payload });
});
