export type TicketStatus =
  "open" | "waiting_admin" | "waiting_client" | "closed";
export type TicketCategory =
  "facturacion" | "cuenta" | "eventos" | "tecnico" | "otro";
export type TicketPriority = "low" | "normal" | "high";

export interface SupportUser {
  id: string;
  name: string;
  email: string;
  businessName: string;
}

export interface SupportMessage {
  id: string;
  body: string;
  from: "client" | "admin";
  authorName: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  code: string;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  user?: SupportUser | null;
  messages?: SupportMessage[];
}

export const CATEGORY_LABEL: Record<TicketCategory, string> = {
  facturacion: "Facturación y pagos",
  cuenta: "Cuenta",
  eventos: "Eventos e invitados",
  tecnico: "Problema técnico",
  otro: "Otro",
};

export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Abierto",
  waiting_admin: "Esperando a Alanna",
  waiting_client: "Esperando tu respuesta",
  closed: "Cerrado",
};

export const PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: "Baja",
  normal: "Normal",
  high: "Alta",
};

export function statusTone(status: TicketStatus) {
  if (status === "closed") return "secondary" as const;
  if (status === "waiting_admin") return "destructive" as const;
  if (status === "waiting_client") return "default" as const;
  return "outline" as const;
}
