import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "../config/env.js";

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessExpires },
  );
}

export function signRefreshToken(user, days) {
  return jwt.sign({ sub: user.id, typ: "refresh", jti: randomToken() }, env.jwt.refreshSecret, {
    expiresIn: `${days}d`,
  });
}

export function verifyAccess(token) {
  return jwt.verify(token, env.jwt.accessSecret);
}

export function verifyRefresh(token) {
  return jwt.verify(token, env.jwt.refreshSecret);
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function randomToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function serializeUser(user, plan = null, usage = null) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isAdmin: !!user.isAdmin,
    businessName: user.businessName || "",
    phone: user.phone || "",
    state: user.state || "",
    subscriptionStatus: user.subscriptionStatus || "active",
    billingInterval: user.billingInterval || "month",
    plan: plan
      ? {
          id: plan.id,
          slug: plan.slug,
          name: plan.name,
          priceMxn: plan.priceMxn,
          eventLimit: plan.eventLimit,
          guestLimit: plan.guestLimit,
        }
      : null,
    usage: usage || {
      eventCount: 0,
      guestCount: 0,
      eventLimit: plan?.eventLimit || 0,
      guestLimit: plan?.guestLimit || 0,
      canCreateEvent: false,
      remainingGuests: 0,
    },
  };
}
