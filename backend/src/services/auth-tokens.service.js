import { randomUUID } from "node:crypto";
import { RefreshToken, User } from "../models/index.js";
import { env } from "../config/env.js";
import { hashToken, randomToken, signAccessToken, signRefreshToken, verifyAccess, verifyRefresh } from "../utils/tokens.js";

export function cookieOpts(days) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: env.nodeEnv === "production",
    maxAge: days * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

export function clearRefreshCookie(res) {
  res.clearCookie("refreshToken", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: env.nodeEnv === "production",
  });
}

export async function bumpTokenVersion(user) {
  user.tokenVersion = Number(user.tokenVersion || 0) + 1;
  await user.save();
  return user.tokenVersion;
}

export async function revokeRefreshFamily(familyId) {
  if (!familyId) return;
  await RefreshToken.update({ revokedAt: new Date() }, { where: { familyId, revokedAt: null } });
}

export async function revokeAllUserRefresh(userId) {
  await RefreshToken.update({ revokedAt: new Date() }, { where: { userId, revokedAt: null } });
}

export async function issueTokens(res, user, { rememberMe = false, familyId, days } = {}) {
  const refreshDays = Number.isFinite(days) && days > 0 ? days : rememberMe ? env.jwt.rememberDays : env.jwt.refreshDays;
  const fam = familyId || randomUUID();
  const jti = randomToken();
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user, refreshDays, { jti, familyId: fam });
  await RefreshToken.create({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    familyId: fam,
    jti,
    expiresAt: new Date(Date.now() + refreshDays * 86400000),
  });
  res.cookie("refreshToken", refreshToken, cookieOpts(refreshDays));
  return { accessToken, refreshDays, familyId: fam };
}

function remainingRefreshDays(payload, row) {
  if (payload?.exp) {
    const ms = payload.exp * 1000 - Date.now();
    return Math.max(1, Math.ceil(ms / 86400000));
  }
  if (row?.expiresAt) {
    const ms = new Date(row.expiresAt).getTime() - Date.now();
    return Math.max(1, Math.ceil(ms / 86400000));
  }
  return env.jwt.refreshDays;
}

export async function rotateRefreshToken(res, rawToken) {
  let payload;
  try {
    payload = verifyRefresh(rawToken);
  } catch {
    return { error: "Refresh inválido", status: 401 };
  }
  if (payload.typ && payload.typ !== "refresh") {
    return { error: "Refresh inválido", status: 401 };
  }

  const tokenHash = hashToken(rawToken);
  let row = await RefreshToken.findOne({ where: { tokenHash } });
  if (!row && payload.jti) {
    row = await RefreshToken.findOne({ where: { jti: payload.jti } });
  }

  if (!row) {
    if (payload.fam) await revokeRefreshFamily(payload.fam);
    return { error: "Refresh expirado", status: 401 };
  }

  const expired = row.expiresAt && new Date(row.expiresAt) < new Date();
  if (row.revokedAt || expired) {
    const familyId = row.familyId || payload.fam;
    if (familyId) {
      await revokeRefreshFamily(familyId);
      const user = await User.findByPk(row.userId);
      if (user) await bumpTokenVersion(user);
    }
    return { error: "Refresh expirado", status: 401 };
  }

  if (row.userId !== payload.sub) {
    return { error: "Refresh inválido", status: 401 };
  }

  const user = await User.findByPk(payload.sub);
  if (!user) return { error: "Usuario no encontrado", status: 401 };

  const familyId = row.familyId || payload.fam || randomUUID();
  await row.update({ revokedAt: new Date(), familyId });
  const issued = await issueTokens(res, user, { familyId, days: remainingRefreshDays(payload, row) });
  return { user, accessToken: issued.accessToken };
}

function bearerFromReq(req) {
  const header = req.headers?.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  return req.cookies?.accessToken || "";
}

export async function logoutSession(req, res) {
  const rawRefresh = req.body?.refreshToken || req.cookies?.refreshToken;
  let userId = null;
  let familyId = null;

  if (rawRefresh) {
    const tokenHash = hashToken(rawRefresh);
    let row = await RefreshToken.findOne({ where: { tokenHash } });
    if (!row) {
      try {
        const payload = verifyRefresh(rawRefresh);
        if (payload.jti) row = await RefreshToken.findOne({ where: { jti: payload.jti } });
        familyId = familyId || payload.fam || null;
        userId = userId || payload.sub || null;
      } catch {
        /* cookie inválida: igual se limpia */
      }
    }
    if (row) {
      userId = row.userId;
      familyId = row.familyId || familyId;
      if (familyId) await revokeRefreshFamily(familyId);
      else await RefreshToken.update({ revokedAt: new Date() }, { where: { tokenHash } });
    }
  }

  const access = bearerFromReq(req);
  if (access) {
    try {
      const payload = verifyAccess(access);
      userId = userId || payload.sub;
    } catch {
      /* access ya inválido */
    }
  }

  if (userId) {
    const user = await User.findByPk(userId);
    if (user) await bumpTokenVersion(user);
  }

  clearRefreshCookie(res);
}
