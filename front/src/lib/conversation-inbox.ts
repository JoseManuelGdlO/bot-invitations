import type { Conversation, Guest } from "@/lib/mock/types";

export type ConversationInboxRow = {
  guest: Guest;
  conv: Conversation | null;
};

export function conversationHasMessages(conv: Conversation | null | undefined) {
  return Boolean(conv?.messages.length);
}

export function buildConversationInboxRows(
  guests: Guest[],
  conversations: Conversation[],
): ConversationInboxRow[] {
  const convByGuest = new Map(conversations.map((c) => [c.guestId, c]));
  const withMessages: ConversationInboxRow[] = [];

  for (const conv of conversations) {
    const guest = guests.find((g) => g.id === conv.guestId);
    if (!guest || !conversationHasMessages(conv)) continue;
    withMessages.push({ guest, conv });
  }

  const inThread = new Set(withMessages.map((row) => row.guest.id));
  const pending = guests
    .filter((guest) => !inThread.has(guest.id))
    .sort((a, b) => a.rep.localeCompare(b.rep, "es"))
    .map((guest) => ({
      guest,
      conv: convByGuest.get(guest.id) ?? null,
    }));

  return [...withMessages, ...pending];
}
