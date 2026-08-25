import { api, ApiError } from "@/lib/api/client";
import type { ChatMessage, Conversation } from "@/lib/mock/types";

export type BotDevStatus = { enabled: boolean };

export type BotPlaygroundMessage = { role: "user" | "assistant"; text: string };

export type BotPlaygroundState = {
  ok: boolean;
  eventId: string;
  guestId: string;
  userId: string;
  items: unknown[];
  messages: BotPlaygroundMessage[];
};

export type BotPlaygroundReply = {
  ok: boolean;
  reply: string | null;
  locked?: boolean;
  skipped?: boolean;
  reason?: string | null;
  tools?: unknown[];
  messages: BotPlaygroundMessage[];
};

export type SimulateGuestReply = {
  ok: boolean;
  reply: string | null;
  skipped?: boolean;
  reason?: string | null;
  locked?: boolean;
  conversation: Conversation;
  lastMessages: ChatMessage[];
};

export const botApi = {
  async status(): Promise<BotDevStatus> {
    try {
      return await api<BotDevStatus>("/dev/bot/status");
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || error.status === 401)) {
        return { enabled: false };
      }
      return { enabled: false };
    }
  },
  getPlayground: (eventId: string, guestId: string) =>
    api<BotPlaygroundState>(`/dev/events/${eventId}/bot/playground?guestId=${encodeURIComponent(guestId)}`),
  chat: (eventId: string, body: { guestId: string; message?: string; reset?: boolean }) =>
    api<BotPlaygroundReply>(`/dev/events/${eventId}/bot/playground`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  simulateGuest: (conversationId: string, text: string) =>
    api<SimulateGuestReply>(`/dev/conversations/${conversationId}/simulate-guest`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  regeneratePrompt: (eventId: string) =>
    api(`/events/${eventId}/ai-config/regenerate-prompt`, { method: "POST" }),
};
