import { CancellationRequest, Plan, User } from "../models/index.js";
import { cancelStripeSubscription } from "./stripe.service.js";

export function serializeCancellation(row) {
  return {
    id: row.id,
    reason: row.reason,
    status: row.status,
    adminNote: row.adminNote || "",
    createdAt: row.createdAt,
    decidedAt: row.decidedAt,
    user: row.user
      ? {
          id: row.user.id,
          name: row.user.name,
          email: row.user.email,
          businessName: row.user.businessName || "",
          phone: row.user.phone || "",
          subscriptionStatus: row.user.subscriptionStatus,
          plan: row.user.plan
            ? { id: row.user.plan.id, name: row.user.plan.name, slug: row.user.plan.slug }
            : null,
        }
      : null,
  };
}

export async function getLatestCancellation(userId) {
  return CancellationRequest.findOne({
    where: { userId },
    order: [["createdAt", "DESC"]],
  });
}

export async function getPendingCancellation(userId) {
  return CancellationRequest.findOne({
    where: { userId, status: "pending" },
    order: [["createdAt", "DESC"]],
  });
}

export async function requestCancellation(user, reason) {
  const text = String(reason || "").trim();
  if (text.length < 8) {
    const err = new Error("Cuéntanos un poco más el motivo de la cancelación.");
    err.status = 400;
    throw err;
  }
  if (user.subscriptionStatus === "canceled") {
    const err = new Error("Esta cuenta ya no tiene una suscripción activa.");
    err.status = 400;
    throw err;
  }
  const pending = await getPendingCancellation(user.id);
  if (pending) {
    const err = new Error("Ya tienes una solicitud en revisión. El administrador debe aceptarla para cancelar.");
    err.status = 409;
    throw err;
  }
  return CancellationRequest.create({
    userId: user.id,
    reason: text.slice(0, 2000),
    status: "pending",
  });
}

export async function withdrawCancellation(user) {
  const pending = await getPendingCancellation(user.id);
  if (!pending) {
    const err = new Error("No hay una solicitud pendiente para retirar.");
    err.status = 404;
    throw err;
  }
  pending.status = "withdrawn";
  pending.decidedAt = new Date();
  await pending.save();
  return pending;
}

export async function decideCancellation(row, admin, { approve, note }) {
  if (row.status !== "pending") {
    const err = new Error("Esta solicitud ya fue resuelta.");
    err.status = 400;
    throw err;
  }
  const user = await User.findByPk(row.userId, { include: [{ model: Plan, as: "plan" }] });
  if (!user) {
    const err = new Error("Cliente no encontrado.");
    err.status = 404;
    throw err;
  }
  if (approve) {
    await cancelStripeSubscription(user);
    user.subscriptionStatus = "canceled";
    await user.save();
    row.status = "approved";
  } else {
    row.status = "rejected";
  }
  row.adminId = admin.id;
  row.adminNote = String(note || "").trim().slice(0, 2000) || null;
  row.decidedAt = new Date();
  await row.save();
  await row.reload({
    include: [
      { model: User, as: "user", include: [{ model: Plan, as: "plan" }] },
    ],
  });
  return row;
}
