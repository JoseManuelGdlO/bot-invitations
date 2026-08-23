import { Payment, Plan, User } from "../models/index.js";
import { yearlyPriceMxn } from "./plans.service.js";
import { getStripe, stripeEnabled } from "./stripe.service.js";

function monthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  const [year, month] = key.split("-").map(Number);
  const label = new Date(year, month - 1, 1).toLocaleDateString("es-MX", {
    month: "short",
    year: "numeric",
  });
  return label.replace(".", "");
}

function startOfMonth(offset = 0) {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  d.setMonth(d.getMonth() + offset);
  return d;
}

function amountFromStripe(invoice) {
  const cents = Number(invoice.amount_paid ?? invoice.amount_due ?? 0);
  return Math.round((cents / 100) * 100) / 100;
}

export async function recordPaidInvoice(invoice, extras = {}) {
  if (!invoice?.id) return null;
  const amountMxn = amountFromStripe(invoice);
  if (amountMxn <= 0 && invoice.status !== "paid") return null;
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  const user =
    extras.user ||
    (invoice.metadata?.userId
      ? await User.findByPk(invoice.metadata.userId)
      : null) ||
    (customerId ? await User.findOne({ where: { stripeCustomerId: customerId } }) : null) ||
    (invoice.subscription
      ? await User.findOne({ where: { stripeSubscriptionId: invoice.subscription } })
      : null);
  const interval =
    extras.interval ||
    invoice.lines?.data?.[0]?.price?.recurring?.interval ||
    invoice.lines?.data?.[0]?.plan?.interval ||
    user?.billingInterval ||
    null;
  const paidAt = invoice.status_transitions?.paid_at
    ? new Date(invoice.status_transitions.paid_at * 1000)
    : invoice.created
      ? new Date(invoice.created * 1000)
      : new Date();
  const [row] = await Payment.findOrCreate({
    where: { stripeInvoiceId: invoice.id },
    defaults: {
      userId: user?.id || null,
      planId: extras.planId || invoice.metadata?.planId || user?.planId || null,
      stripeInvoiceId: invoice.id,
      stripeCustomerId: customerId || user?.stripeCustomerId || null,
      amountMxn,
      currency: (invoice.currency || "mxn").toLowerCase(),
      interval,
      customerEmail: invoice.customer_email || user?.email || null,
      customerName: invoice.customer_name || user?.name || null,
      paidAt,
      status: invoice.status || "paid",
    },
  });
  return row;
}

async function syncStripeInvoices() {
  const stripe = getStripe();
  if (!stripe) return { availableMxn: 0, pendingMxn: 0, synced: 0 };
  const since = Math.floor(Date.now() / 1000) - 400 * 24 * 3600;
  let startingAfter;
  let synced = 0;
  for (let page = 0; page < 8; page += 1) {
    const list = await stripe.invoices.list({
      status: "paid",
      limit: 100,
      created: { gte: since },
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    for (const invoice of list.data) {
      await recordPaidInvoice(invoice);
      synced += 1;
    }
    if (!list.has_more || !list.data.length) break;
    startingAfter = list.data[list.data.length - 1].id;
  }
  let availableMxn = 0;
  let pendingMxn = 0;
  try {
    const balance = await stripe.balance.retrieve();
    const pick = (buckets) =>
      (buckets || [])
        .filter((item) => (item.currency || "").toLowerCase() === "mxn")
        .reduce((sum, item) => sum + Number(item.amount || 0) / 100, 0);
    availableMxn = pick(balance.available);
    pendingMxn = pick(balance.pending);
  } catch {
    /* balance is optional */
  }
  return { availableMxn, pendingMxn, synced };
}

export async function getFinanceSnapshot() {
  const plans = await Plan.findAll({ order: [["sortOrder", "ASC"]] });
  const users = await User.findAll({
    where: { isAdmin: false },
    include: [{ model: Plan, as: "plan" }],
  });
  const active = users.filter((user) => user.subscriptionStatus === "active");
  const pending = users.filter((user) => user.subscriptionStatus === "pending");
  const canceled = users.filter((user) => user.subscriptionStatus === "canceled");
  const monthly = active.filter((user) => user.billingInterval !== "year");
  const yearly = active.filter((user) => user.billingInterval === "year");

  const byPlanMap = Object.fromEntries(
    plans.map((plan) => [
      plan.id,
      {
        id: plan.id,
        name: plan.name,
        slug: plan.slug,
        priceMxn: plan.priceMxn,
        subscribers: 0,
        monthlySubscribers: 0,
        yearlySubscribers: 0,
        mrrMxn: 0,
      },
    ]),
  );
  let estimatedMrrMxn = 0;
  for (const user of active) {
    const plan = user.plan;
    if (!plan) continue;
    const monthlyValue =
      user.billingInterval === "year" ? yearlyPriceMxn(plan) / 12 : Number(plan.priceMxn || 0);
    estimatedMrrMxn += monthlyValue;
    const row = byPlanMap[plan.id];
    if (!row) continue;
    row.subscribers += 1;
    if (user.billingInterval === "year") row.yearlySubscribers += 1;
    else row.monthlySubscribers += 1;
    row.mrrMxn += monthlyValue;
  }

  let stripe = { available: false, availableMxn: 0, pendingMxn: 0 };
  if (stripeEnabled()) {
    try {
      const synced = await syncStripeInvoices();
      stripe = {
        available: true,
        availableMxn: synced.availableMxn,
        pendingMxn: synced.pendingMxn,
      };
    } catch (err) {
      console.error("[finance] stripe", err.message);
      stripe = { available: false, availableMxn: 0, pendingMxn: 0, error: err.message };
    }
  }

  const payments = await Payment.findAll({
    include: [
      { model: User, as: "user", attributes: ["id", "name", "email", "businessName"] },
      { model: Plan, as: "plan", attributes: ["id", "name", "slug"] },
    ],
    order: [["paidAt", "DESC"]],
    limit: 400,
  });

  const thisMonthStart = startOfMonth(0);
  const lastMonthStart = startOfMonth(-1);
  const collectedThisMonthMxn = payments
    .filter((row) => row.paidAt >= thisMonthStart)
    .reduce((sum, row) => sum + Number(row.amountMxn || 0), 0);
  const collectedLastMonthMxn = payments
    .filter((row) => row.paidAt >= lastMonthStart && row.paidAt < thisMonthStart)
    .reduce((sum, row) => sum + Number(row.amountMxn || 0), 0);
  const yearAgo = startOfMonth(-11);
  const collectedLast12MonthsMxn = payments
    .filter((row) => row.paidAt >= yearAgo)
    .reduce((sum, row) => sum + Number(row.amountMxn || 0), 0);

  const monthKeys = [];
  for (let i = 11; i >= 0; i -= 1) monthKeys.push(monthKey(startOfMonth(-i)));
  const totals = Object.fromEntries(monthKeys.map((key) => [key, { collectedMxn: 0, invoices: 0 }]));
  for (const row of payments) {
    const key = monthKey(row.paidAt);
    if (!totals[key]) continue;
    totals[key].collectedMxn += Number(row.amountMxn || 0);
    totals[key].invoices += 1;
  }

  return {
    stripe,
    estimatedMrrMxn: Math.round(estimatedMrrMxn),
    estimatedArrMxn: Math.round(estimatedMrrMxn * 12),
    collectedThisMonthMxn: Math.round(collectedThisMonthMxn * 100) / 100,
    collectedLastMonthMxn: Math.round(collectedLastMonthMxn * 100) / 100,
    collectedLast12MonthsMxn: Math.round(collectedLast12MonthsMxn * 100) / 100,
    subscribers: {
      active: active.length,
      pending: pending.length,
      canceled: canceled.length,
      monthly: monthly.length,
      yearly: yearly.length,
      clients: users.length,
    },
    byPlan: Object.values(byPlanMap).map((row) => ({
      ...row,
      mrrMxn: Math.round(row.mrrMxn),
    })),
    months: monthKeys.map((key) => ({
      key,
      label: monthLabel(key),
      collectedMxn: Math.round(totals[key].collectedMxn * 100) / 100,
      invoices: totals[key].invoices,
    })),
    recentPayments: payments.slice(0, 25).map((row) => ({
      id: row.id,
      amountMxn: Number(row.amountMxn || 0),
      currency: row.currency,
      interval: row.interval,
      paidAt: row.paidAt,
      customerEmail: row.customerEmail || row.user?.email || "",
      customerName: row.customerName || row.user?.name || "Cliente",
      businessName: row.user?.businessName || "",
      planName: row.plan?.name || "",
      status: row.status,
    })),
  };
}
