import { CancellationRequest, Plan, User } from "../models/index.js";
import { asyncHandler } from "../utils/async.js";
import {
  decideCancellation,
  getLatestCancellation,
  requestCancellation,
  serializeCancellation,
  withdrawCancellation,
} from "../services/cancellation.service.js";

export const getMine = asyncHandler(async (req, res) => {
  const row = await getLatestCancellation(req.user.id);
  res.json({ cancellation: row ? serializeCancellation(row) : null });
});

export const createMine = asyncHandler(async (req, res) => {
  const row = await requestCancellation(req.user, req.body?.reason);
  res.status(201).json({ cancellation: serializeCancellation(row) });
});

export const withdrawMine = asyncHandler(async (req, res) => {
  const row = await withdrawCancellation(req.user);
  res.json({ cancellation: serializeCancellation(row) });
});

export const listAll = asyncHandler(async (req, res) => {
  const status = String(req.query.status || "pending").trim();
  const where = {};
  if (status && status !== "all") where.status = status;
  const rows = await CancellationRequest.findAll({
    where,
    include: [{ model: User, as: "user", include: [{ model: Plan, as: "plan" }] }],
    order: [["createdAt", "DESC"]],
  });
  res.json(rows.map(serializeCancellation));
});

export const unread = asyncHandler(async (_req, res) => {
  const count = await CancellationRequest.count({ where: { status: "pending" } });
  res.json({ count });
});

export const approve = asyncHandler(async (req, res) => {
  const row = await CancellationRequest.findByPk(req.params.requestId);
  if (!row) return res.status(404).json({ error: "Solicitud no encontrada." });
  const updated = await decideCancellation(row, req.user, { approve: true, note: req.body?.note });
  res.json({ cancellation: serializeCancellation(updated) });
});

export const reject = asyncHandler(async (req, res) => {
  const row = await CancellationRequest.findByPk(req.params.requestId);
  if (!row) return res.status(404).json({ error: "Solicitud no encontrada." });
  const updated = await decideCancellation(row, req.user, { approve: false, note: req.body?.note });
  res.json({ cancellation: serializeCancellation(updated) });
});
