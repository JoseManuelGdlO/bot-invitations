import { Notification } from "../models/index.js";
import { asyncHandler } from "../utils/async.js";
import { serializeNotification } from "../services/notification.service.js";

export const listMine = asyncHandler(async (req, res) => {
  const rows = await Notification.findAll({
    where: { userId: req.user.id },
    order: [["createdAt", "DESC"]],
    limit: 30,
  });
  const unread = await Notification.count({ where: { userId: req.user.id, readAt: null } });
  res.json({ items: rows.map(serializeNotification), unread });
});

export const unreadMine = asyncHandler(async (req, res) => {
  const count = await Notification.count({ where: { userId: req.user.id, readAt: null } });
  res.json({ count });
});

export const markRead = asyncHandler(async (req, res) => {
  const row = await Notification.findOne({ where: { id: req.params.id, userId: req.user.id } });
  if (!row) return res.status(404).json({ error: "Aviso no encontrado." });
  if (!row.readAt) {
    row.readAt = new Date();
    await row.save();
  }
  res.json(serializeNotification(row));
});

export const markAllRead = asyncHandler(async (req, res) => {
  await Notification.update({ readAt: new Date() }, { where: { userId: req.user.id, readAt: null } });
  res.json({ ok: true });
});
