import { SupportMessage, SupportTicket, User } from "../models/index.js";

export const TICKET_CATEGORIES = ["facturacion", "cuenta", "eventos", "tecnico", "otro"];
export const TICKET_STATUSES = ["open", "waiting_admin", "waiting_client", "closed"];
export const TICKET_PRIORITIES = ["low", "normal", "high"];

export function serializeUserBrief(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    businessName: user.businessName || "",
  };
}

export function serializeMessage(message) {
  return {
    id: message.id,
    body: message.body,
    from: message.from,
    authorName: message.author?.name || (message.from === "admin" ? "Soporte Alanna" : "Cliente"),
    createdAt: message.createdAt,
  };
}

export function serializeTicket(ticket, extras = {}) {
  return {
    id: ticket.id,
    code: ticket.code,
    subject: ticket.subject,
    category: ticket.category,
    status: ticket.status,
    priority: ticket.priority,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    lastMessageAt: ticket.lastMessageAt,
    lastMessagePreview: ticket.lastMessagePreview || "",
    user: serializeUserBrief(ticket.user) || extras.user || null,
    messages:
      extras.messages ||
      [...(ticket.messages || [])]
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .map(serializeMessage),
  };
}

export async function nextTicketCode() {
  const count = await SupportTicket.count();
  for (let i = 1; i <= 8; i += 1) {
    const code = `T-${String(count + i).padStart(4, "0")}`;
    const exists = await SupportTicket.findOne({ where: { code } });
    if (!exists) return code;
  }
  return `T-${Date.now().toString(36).toUpperCase()}`;
}

export async function addMessage(ticket, { authorId, from, body }) {
  const text = String(body || "").trim();
  if (!text) {
    const err = new Error("Escribe un mensaje.");
    err.status = 400;
    throw err;
  }
  if (text.length > 4000) {
    const err = new Error("El mensaje es demasiado largo.");
    err.status = 400;
    throw err;
  }
  const message = await SupportMessage.create({
    ticketId: ticket.id,
    authorId,
    from,
    body: text,
  });
  ticket.lastMessageAt = new Date();
  ticket.lastMessagePreview = text.slice(0, 180);
  if (ticket.status !== "closed") {
    ticket.status = from === "admin" ? "waiting_client" : "waiting_admin";
  }
  await ticket.save();
  const withAuthor = await SupportMessage.findByPk(message.id, {
    include: [{ model: User, as: "author", attributes: ["id", "name"] }],
  });
  return withAuthor;
}

export async function loadTicket(id, { withMessages = false } = {}) {
  return SupportTicket.findByPk(id, {
    include: [
      { model: User, as: "user", attributes: ["id", "name", "email", "businessName"] },
      ...(withMessages
        ? [
            {
              model: SupportMessage,
              as: "messages",
              include: [{ model: User, as: "author", attributes: ["id", "name"] }],
            },
          ]
        : []),
    ],
  });
}
