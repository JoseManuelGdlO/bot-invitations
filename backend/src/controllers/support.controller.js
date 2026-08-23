import { Op } from "sequelize";
import { SupportTicket } from "../models/index.js";
import { asyncHandler } from "../utils/async.js";
import {
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  addMessage,
  loadTicket,
  nextTicketCode,
  serializeTicket,
} from "../services/support.service.js";

function preview(ticket) {
  const data = serializeTicket(ticket);
  delete data.messages;
  return data;
}

export const listMine = asyncHandler(async (req, res) => {
  const tickets = await SupportTicket.findAll({
    where: { userId: req.user.id },
    order: [["lastMessageAt", "DESC"]],
  });
  res.json(tickets.map(preview));
});

export const unreadMine = asyncHandler(async (req, res) => {
  const count = await SupportTicket.count({
    where: { userId: req.user.id, status: "waiting_client" },
  });
  res.json({ count });
});

export const createMine = asyncHandler(async (req, res) => {
  const subject = String(req.body?.subject || "").trim();
  const body = String(req.body?.body || "").trim();
  const category = TICKET_CATEGORIES.includes(req.body?.category) ? req.body.category : "otro";
  const priority = TICKET_PRIORITIES.includes(req.body?.priority) ? req.body.priority : "normal";
  if (subject.length < 4) return res.status(400).json({ error: "Escribe un asunto más claro." });
  if (body.length < 8) return res.status(400).json({ error: "Describe el problema con un poco más de detalle." });
  const ticket = await SupportTicket.create({
    code: await nextTicketCode(),
    userId: req.user.id,
    subject: subject.slice(0, 180),
    category,
    priority,
    status: "waiting_admin",
    lastMessageAt: new Date(),
    lastMessagePreview: body.slice(0, 180),
  });
  await addMessage(ticket, { authorId: req.user.id, from: "client", body });
  const full = await loadTicket(ticket.id, { withMessages: true });
  res.status(201).json(serializeTicket(full));
});

export const getMine = asyncHandler(async (req, res) => {
  const ticket = await loadTicket(req.params.ticketId, { withMessages: true });
  if (!ticket || ticket.userId !== req.user.id) {
    return res.status(404).json({ error: "Ticket no encontrado." });
  }
  res.json(serializeTicket(ticket));
});

export const replyMine = asyncHandler(async (req, res) => {
  const ticket = await loadTicket(req.params.ticketId);
  if (!ticket || ticket.userId !== req.user.id) {
    return res.status(404).json({ error: "Ticket no encontrado." });
  }
  if (ticket.status === "closed") {
    return res.status(400).json({ error: "Este ticket ya está cerrado." });
  }
  await addMessage(ticket, { authorId: req.user.id, from: "client", body: req.body?.body });
  const full = await loadTicket(ticket.id, { withMessages: true });
  res.json(serializeTicket(full));
});

export const closeMine = asyncHandler(async (req, res) => {
  const ticket = await loadTicket(req.params.ticketId, { withMessages: true });
  if (!ticket || ticket.userId !== req.user.id) {
    return res.status(404).json({ error: "Ticket no encontrado." });
  }
  if (req.body?.status !== "closed") {
    return res.status(400).json({ error: "Solo puedes cerrar tu ticket." });
  }
  ticket.status = "closed";
  await ticket.save();
  res.json(serializeTicket(ticket));
});

export const listAll = asyncHandler(async (req, res) => {
  const status = String(req.query.status || "").trim();
  const q = String(req.query.search || "").trim();
  const where = {};
  if (TICKET_STATUSES.includes(status)) where.status = status;
  if (status === "open") where.status = { [Op.in]: ["open", "waiting_admin", "waiting_client"] };
  const tickets = await SupportTicket.findAll({
    where,
    include: [{ association: "user", attributes: ["id", "name", "email", "businessName"] }],
    order: [
      ["status", "ASC"],
      ["lastMessageAt", "DESC"],
    ],
  });
  const filtered = q
    ? tickets.filter((ticket) => {
        const hay = `${ticket.code} ${ticket.subject} ${ticket.user?.name || ""} ${ticket.user?.email || ""} ${ticket.user?.businessName || ""}`.toLowerCase();
        return hay.includes(q.toLowerCase());
      })
    : tickets;
  res.json(filtered.map(preview));
});

export const unreadAll = asyncHandler(async (_req, res) => {
  const count = await SupportTicket.count({
    where: { status: { [Op.in]: ["open", "waiting_admin"] } },
  });
  res.json({ count });
});

export const getAny = asyncHandler(async (req, res) => {
  const ticket = await loadTicket(req.params.ticketId, { withMessages: true });
  if (!ticket) return res.status(404).json({ error: "Ticket no encontrado." });
  res.json(serializeTicket(ticket));
});

export const replyAny = asyncHandler(async (req, res) => {
  const ticket = await loadTicket(req.params.ticketId);
  if (!ticket) return res.status(404).json({ error: "Ticket no encontrado." });
  if (ticket.status === "closed") {
    ticket.status = "waiting_client";
  }
  await addMessage(ticket, { authorId: req.user.id, from: "admin", body: req.body?.body });
  const full = await loadTicket(ticket.id, { withMessages: true });
  res.json(serializeTicket(full));
});

export const updateAny = asyncHandler(async (req, res) => {
  const ticket = await loadTicket(req.params.ticketId, { withMessages: true });
  if (!ticket) return res.status(404).json({ error: "Ticket no encontrado." });
  if (TICKET_STATUSES.includes(req.body?.status)) ticket.status = req.body.status;
  if (TICKET_PRIORITIES.includes(req.body?.priority)) ticket.priority = req.body.priority;
  await ticket.save();
  res.json(serializeTicket(ticket));
});
