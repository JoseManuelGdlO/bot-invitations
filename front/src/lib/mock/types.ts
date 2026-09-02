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

export type WhatsappStatus =
  "pendiente" | "enviado" | "entregado" | "leido" | "respondido";

export type CampaignStatus = "idle" | "scheduled" | "running" | "done";

export interface CampaignSnapshot {
  status: CampaignStatus;
  scheduledAt: string | null;
  launchedAt: string | null;
  total: number;
  processed: number;
  percent: number;
}

export const IDLE_CAMPAIGN: CampaignSnapshot = {
  status: "idle",
  scheduledAt: null,
  launchedAt: null,
  total: 0,
  processed: 0,
  percent: 0,
};

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
  cover: string;
  status: "activo" | "borrador" | "finalizado";
  campaign?: CampaignSnapshot;
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

export interface FollowUpRule {
  id: string;
  label: string;
  description?: string;
  days?: number;
  when: string;
  active: boolean;
}

export interface AIConfig {
  assistantName: string;
  tone: string;
  formality: number;
  emojis: "ninguno" | "algunos" | "frecuentes";
  length: "cortos" | "normales" | "detallados";
  openingMessage: string;
  prompt: string;
  rules: string[];
  followUps: FollowUpRule[];
}

export interface Template {
  id: string;
  category: string;
  title: string;
  body: string;
  greetingVar?: string;
  attachDocument?: boolean;
  document?: {
    fileName: string;
    mime: string | null;
    size: number;
  } | null;
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

export type BillingInterval = "month" | "year";

export interface SubscriptionPlan {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  priceMxn: number;
  yearlyPriceMxn?: number;
  annualDiscountPercent?: number;
  eventLimit: number;
  guestLimit: number;
  highlighted: boolean;
}

export interface PlanUsage {
  eventCount: number;
  guestCount: number;
  eventLimit: number;
  guestLimit: number;
  canCreateEvent: boolean;
  remainingGuests: number;
  canSendInvitations?: boolean;
}

export interface SessionUser {
  id?: string;
  email: string;
  name: string;
  role: string;
  isAdmin?: boolean;
  businessName?: string;
  phone?: string;
  state?: string;
  subscriptionStatus?: string;
  billingInterval?: BillingInterval;
  cancelAtPeriodEnd?: boolean;
  currentPeriodEnd?: string | null;
  plan?: Pick<
    SubscriptionPlan,
    "id" | "slug" | "name" | "priceMxn" | "eventLimit" | "guestLimit"
  > | null;
  usage?: PlanUsage;
  cancellation?: CancellationRequest | null;
}

export interface CancellationRequest {
  id: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  adminNote: string;
  createdAt: string;
  decidedAt?: string | null;
  user?: {
    id: string;
    name: string;
    email: string;
    businessName: string;
    phone: string;
    subscriptionStatus: string;
    plan: { id: string; name: string; slug: string } | null;
  } | null;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  initials: string;
  isOwner?: boolean;
  emailSent?: boolean;
  emailError?: string | null;
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
