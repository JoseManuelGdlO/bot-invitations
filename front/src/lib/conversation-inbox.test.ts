import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildConversationInboxRows,
  conversationHasMessages,
} from "./conversation-inbox.ts";
import type { Conversation, Guest } from "./mock/types.ts";

function guest(partial: Partial<Guest> & Pick<Guest, "id" | "rep">): Guest {
  return {
    eventId: "evt",
    phone: "",
    invited: 1,
    confirmed: 0,
    table: "",
    family: "",
    guestType: "",
    notes: "",
    tag: "",
    status: "sin_contactar",
    whatsapp: "pendiente",
    lastMessage: "",
    lastReply: "",
    lastReplyAt: "",
    followUp: "",
    ...partial,
  };
}

function conv(
  partial: Partial<Conversation> & Pick<Conversation, "id" | "guestId">,
): Conversation {
  return {
    eventId: "evt",
    aiPaused: false,
    unread: 0,
    messages: [],
    ...partial,
  };
}

describe("conversationHasMessages", () => {
  test("false sin conversación o sin mensajes", () => {
    assert.equal(conversationHasMessages(null), false);
    assert.equal(conversationHasMessages(conv({ id: "c1", guestId: "g1" })), false);
  });

  test("true con mensajes", () => {
    assert.equal(
      conversationHasMessages(
        conv({
          id: "c1",
          guestId: "g1",
          messages: [
            { id: "m1", from: "ai", text: "hola", at: "10:00" },
          ],
        }),
      ),
      true,
    );
  });
});

describe("buildConversationInboxRows", () => {
  test("incluye invitados sin conversación al final, ordenados por nombre", () => {
    const guests = [
      guest({ id: "g-zoe", rep: "Zoe" }),
      guest({ id: "g-ana", rep: "Ana" }),
      guest({ id: "g-luis", rep: "Luis" }),
    ];
    const conversations = [
      conv({
        id: "c-luis",
        guestId: "g-luis",
        messages: [{ id: "m1", from: "guest", text: "ok", at: "10:00" }],
      }),
    ];
    const rows = buildConversationInboxRows(guests, conversations);
    assert.deepEqual(
      rows.map((r) => r.guest.id),
      ["g-luis", "g-ana", "g-zoe"],
    );
    assert.equal(rows[0]?.conv?.id, "c-luis");
    assert.equal(rows[1]?.conv, null);
    assert.equal(rows[2]?.conv, null);
  });

  test("preserva el orden de hilos con mensajes", () => {
    const guests = [
      guest({ id: "g2", rep: "Bea" }),
      guest({ id: "g1", rep: "Ana" }),
    ];
    const conversations = [
      conv({
        id: "c2",
        guestId: "g2",
        messages: [{ id: "m2", from: "ai", text: "hola", at: "10:00" }],
      }),
      conv({
        id: "c1",
        guestId: "g1",
        messages: [{ id: "m1", from: "ai", text: "hola", at: "10:01" }],
      }),
    ];
    const rows = buildConversationInboxRows(guests, conversations);
    assert.deepEqual(
      rows.map((r) => r.guest.id),
      ["g2", "g1"],
    );
  });

  test("trata conversaciones vacías como pendientes", () => {
    const guests = [guest({ id: "g1", rep: "Ana" })];
    const conversations = [conv({ id: "c1", guestId: "g1", messages: [] })];
    const rows = buildConversationInboxRows(guests, conversations);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.conv?.id, "c1");
    assert.equal(conversationHasMessages(rows[0]?.conv), false);
  });
});
