export type ConfirmationStatus =
  | "sin_contactar"
  | "enviado"
  | "entregado"
  | "respondio"
  | "en_conversacion"
  | "confirmado"
  | "parcial"
  | "no_asistira"
  | "sin_respuesta"
  | "seguimiento";

export type WhatsappStatus = "pendiente" | "enviado" | "entregado" | "leido" | "respondido";

export interface EventItem {
  id: string;
  name: string;
  shortName: string;
  type: string;
  hosts: string;
  date: string; // ISO
  time: string;
  venue: string;
  address: string;
  estimatedGuests: number;
  cover: string; // gradient css
  status: "activo" | "borrador" | "finalizado";
}

export interface Guest {
  id: string;
  eventId: string;
  rep: string;
  phone: string;
  invited: number;
  confirmed: number;
  table: string;
  family: string;
  guestType: string;
  notes: string;
  tag: string;
  status: ConfirmationStatus;
  whatsapp: WhatsappStatus;
  lastMessage: string;
  lastReply: string;
  lastReplyAt: string;
  followUp: string;
}

export interface ChatMessage {
  id: string;
  from: "ai" | "guest" | "planner";
  text: string;
  at: string;
}

export interface Conversation {
  id: string;
  eventId: string;
  guestId: string;
  aiPaused: boolean;
  unread: number;
  messages: ChatMessage[];
}

export interface AIConfig {
  assistantName: string;
  tone: string;
  formality: number;
  emojis: "ninguno" | "algunos" | "frecuentes";
  length: "cortos" | "normales" | "detallados";
  openingMessage: string;
  rules: string[];
  followUps: { id: string; label: string; when: string; active: boolean }[];
}

export interface Template {
  id: string;
  category: string;
  title: string;
  body: string;
}

export interface Faq {
  id: string;
  q: string;
  a: string;
}

export interface EventData {
  ai: AIConfig;
  templates: Template[];
  faqs: Faq[];
}

export interface ActivityItem {
  id: string;
  eventId: string;
  text: string;
  at: string;
  kind: "confirm" | "reject" | "message" | "system";
}

export interface SubscriptionPlan {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  priceMxn: number;
  eventLimit: number;
  guestLimit: number;
  highlighted: boolean;
}

export interface SessionUser {
  id?: string;
  email: string;
  name: string;
  role: string;
  businessName?: string;
  phone?: string;
  state?: string;
  subscriptionStatus?: string;
  plan?: Pick<SubscriptionPlan, "id" | "slug" | "name" | "priceMxn" | "eventLimit" | "guestLimit"> | null;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  initials: string;
}

export interface RolePermission {
  id: string;
  role: string;
  permission: string;
  enabled: boolean;
}

export interface EventAnalytics {
  dailyConfirmations: { day: string; confirmaciones: number }[];
  timeline: { label: string; value: number; at: string }[];
  averageResponseTime: string;
}

export interface ImportPreview {
  filename: string;
  columns: string[];
  rows: string[][];
  suggestedMapping: Record<string, string>;
}
