import { OAuth2Client } from "google-auth-library";
import { env } from "../config/env.js";
import { httpError } from "./http-error.js";

const client = new OAuth2Client(env.googleClientId);

export async function verifyGoogleIdToken(idToken) {
  if (!env.googleClientId) {
    throw httpError(503, "Google OAuth no está configurado");
  }
  const ticket = await client.verifyIdToken({
    idToken,
    audience: env.googleClientId,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email || !payload.email_verified) {
    throw httpError(401, "La cuenta de Google no tiene un correo verificado.");
  }
  const name =
    [payload.given_name, payload.family_name].filter(Boolean).join(" ").trim() ||
    String(payload.name || "").trim() ||
    "Invitada";
  return {
    googleId: payload.sub,
    email: String(payload.email).toLowerCase(),
    name,
  };
}
