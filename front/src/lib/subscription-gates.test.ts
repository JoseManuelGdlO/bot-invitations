import assert from "node:assert/strict";
import test from "node:test";
import {
  sessionCanUseWhatsApp,
  SUBSCRIPTION_REQUIRED_WHATSAPP,
} from "./subscription-gates.ts";
import type { SessionUser } from "./mock/types.ts";

function session(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    email: "ana@test.com",
    name: "Ana",
    role: "Wedding Planner",
    isAdmin: false,
    subscriptionStatus: "active",
    usage: {
      eventCount: 0,
      guestCount: 0,
      eventLimit: 2,
      guestLimit: 300,
      remainingGuests: 300,
      canCreateEvent: true,
      canSendInvitations: true,
    },
    ...overrides,
  };
}

test("admin siempre puede usar WhatsApp", () => {
  assert.equal(
    sessionCanUseWhatsApp(session({ isAdmin: true, subscriptionStatus: "canceled", usage: { ...session().usage!, canSendInvitations: false } })),
    true,
  );
});

test("pending o canceled no pueden usar WhatsApp", () => {
  assert.equal(sessionCanUseWhatsApp(session({ subscriptionStatus: "pending", usage: { ...session().usage!, canSendInvitations: false } })), false);
  assert.equal(sessionCanUseWhatsApp(null), false);
});

test("active con canSendInvitations usa WhatsApp", () => {
  assert.equal(sessionCanUseWhatsApp(session()), true);
});

test("copy de paywall es estable", () => {
  assert.match(SUBSCRIPTION_REQUIRED_WHATSAPP, /plan activo/i);
});
