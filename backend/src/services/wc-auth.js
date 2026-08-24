import { env } from "../config/env.js";
import { httpError } from "../utils/http-error.js";

export async function getWcToken() {
  const token = String(env.wc.serviceJwt || "").trim();
  if (!token) throw httpError(500, "WC_SERVICE_JWT is required");
  return token;
}

export async function runWithWcToken(callback) {
  const token = await getWcToken();
  return callback(token);
}
