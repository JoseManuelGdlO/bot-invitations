import bcrypt from "bcryptjs";
import { PasswordReset, Plan, RefreshToken, User } from "../models/index.js";
import { claimPendingInvitations, displayTeamRole, findInvitationsByEmail, findPendingInvitations, normalizeEmail } from "../services/membership.service.js";
import { env } from "../config/env.js";
import {
  hashToken,
  randomToken,
  serializeUser,
  signAccessToken,
  signRefreshToken,
  verifyRefresh,
} from "../utils/tokens.js";
import { loadUserState } from "../services/state.service.js";
import { asyncHandler } from "../utils/async.js";
import { getPlanUsage, serializePlan, settleExpiredSubscription } from "../services/plans.service.js";
import { startCheckout, stripeEnabled } from "../services/stripe.service.js";
import { getLatestCancellation, serializeCancellation } from "../services/cancellation.service.js";

async function userWithPlan(user) {
  await settleExpiredSubscription(user);
  const plan = user.planId ? await Plan.findByPk(user.planId) : null;
  const usage = await getPlanUsage(user);
  const cancellation = await getLatestCancellation(user.id);
  const serialized = serializeUser(user, plan, usage, {
    cancellation: cancellation ? serializeCancellation(cancellation) : null,
  });
  if (!plan) {
    const teamRole = await displayTeamRole(user.id);
    if (teamRole) serialized.role = teamRole;
  }
  return serialized;
}

function cookieOpts(days) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: env.nodeEnv === "production",
    maxAge: days * 24 * 60 * 60 * 1000,
    path: "/",
  };
}

async function issueTokens(res, user, rememberMe = false) {
  const days = rememberMe ? env.jwt.rememberDays : env.jwt.refreshDays;
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user, days);
  await RefreshToken.create({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + days * 86400000),
  });
  res.cookie("refreshToken", refreshToken, cookieOpts(days));
  return { accessToken, user: await userWithPlan(user) };
}

export const listPlans = asyncHandler(async (_req, res) => {
  const plans = await Plan.findAll({ order: [["sortOrder", "ASC"]] });
  res.json(plans.map(serializePlan));
});

export const register = asyncHandler(async (req, res) => {
  const { name, email, password, planId, phone, state, businessName, interval } = req.body || {};
  const billingInterval = interval === "year" ? "year" : "month";
  if (!name?.trim() || !email?.trim() || !password || String(password).length < 6) {
    return res.status(400).json({ error: "Nombre, correo y contraseña (mín. 6) son requeridos." });
  }
  if (!businessName?.trim() || !phone?.trim() || !state?.trim()) {
    return res.status(400).json({ error: "Nombre del negocio, teléfono y estado son requeridos." });
  }
  if (!planId) return res.status(400).json({ error: "Selecciona un plan para continuar." });
  const plan = await Plan.findByPk(planId);
  if (!plan) return res.status(400).json({ error: "El plan seleccionado no existe." });
  const exists = await User.findOne({ where: { email: email.trim().toLowerCase() } });
  if (exists) return res.status(409).json({ error: "Ese correo ya está registrado." });
  const user = await User.create({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    passwordHash: await bcrypt.hash(password, 10),
    role: "Wedding Planner",
    businessName: businessName.trim(),
    phone: phone.trim(),
    state: state.trim(),
    planId: plan.id,
    billingInterval,
    subscriptionStatus: stripeEnabled() ? "pending" : "active",
  });
  await claimPendingInvitations(user);
  const tokens = await issueTokens(res, user, false);
  let checkoutUrl = null;
  if (stripeEnabled()) {
    const checkout = await startCheckout(user, plan, { interval: billingInterval });
    checkoutUrl = checkout.checkoutUrl;
    if (!checkoutUrl) {
      return res.status(502).json({
        ...tokens,
        error: "No se pudo abrir Stripe Checkout. Revisa las llaves y el webhook.",
      });
    }
  }
  res.status(201).json({ ...tokens, checkoutUrl });
});

export const invitationStatus = asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.query?.email);
  if (!email) return res.json({ status: "none" });
  const user = await User.findOne({ where: { email } });
  const invites = await findInvitationsByEmail(email);
  if (!invites.length) return res.json({ status: "none" });
  if (user) return res.json({ status: "registered" });
  return res.json({ status: "pending" });
});

export const registerInvite = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name?.trim() || !email?.trim() || !password || String(password).length < 6) {
    return res.status(400).json({ error: "Nombre, correo y contraseña (mín. 6) son requeridos." });
  }
  const cleanEmail = normalizeEmail(email);
  const exists = await User.findOne({ where: { email: cleanEmail } });
  if (exists) {
    await claimPendingInvitations(exists);
    return res.status(409).json({ error: "Ya tienes cuenta. Inicia sesión con este correo para ver el evento." });
  }
  const pending = await findPendingInvitations(cleanEmail);
  if (!pending.length) {
    return res.status(403).json({ error: "No hay una invitación pendiente para este correo." });
  }
  const user = await User.create({
    name: name.trim(),
    email: cleanEmail,
    passwordHash: await bcrypt.hash(password, 10),
    role: pending[0].role || "Wedding Planner",
    businessName: null,
    phone: null,
    state: null,
    planId: null,
    billingInterval: "month",
    subscriptionStatus: "active",
  });
  await claimPendingInvitations(user);
  const tokens = await issueTokens(res, user, false);
  res.status(201).json({ ...tokens, checkoutUrl: null });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password, rememberMe } = req.body || {};
  const user = await User.findOne({ where: { email: String(email || "").trim().toLowerCase() } });
  if (!user || !(await bcrypt.compare(String(password || ""), user.passwordHash))) {
    return res.status(401).json({ error: "Correo o contraseña incorrectos." });
  }
  await claimPendingInvitations(user);
  const tokens = await issueTokens(res, user, !!rememberMe);
  res.json(tokens);
});

export const me = asyncHandler(async (req, res) => {
  res.json({ user: await userWithPlan(req.user) });
});

export const dashboard = asyncHandler(async (req, res) => {
  const state = await loadUserState(req.user.id);
  res.json({ session: await userWithPlan(req.user), ...state });
});

export const refresh = asyncHandler(async (req, res) => {
  const token = req.body?.refreshToken || req.cookies?.refreshToken;
  if (!token) return res.status(401).json({ error: "Sin refresh token" });
  let payload;
  try {
    payload = verifyRefresh(token);
  } catch {
    return res.status(401).json({ error: "Refresh inválido" });
  }
  const row = await RefreshToken.findOne({
    where: { tokenHash: hashToken(token), userId: payload.sub, revokedAt: null },
  });
  if (!row || row.expiresAt < new Date()) return res.status(401).json({ error: "Refresh expirado" });
  const user = await User.findByPk(payload.sub);
  if (!user) return res.status(401).json({ error: "Usuario no encontrado" });
  const accessToken = signAccessToken(user);
  res.json({ accessToken, user: await userWithPlan(user) });
});

export const logout = asyncHandler(async (req, res) => {
  const token = req.body?.refreshToken || req.cookies?.refreshToken;
  if (token) {
    await RefreshToken.update({ revokedAt: new Date() }, { where: { tokenHash: hashToken(token) } });
  }
  res.clearCookie("refreshToken", { path: "/" });
  res.json({ ok: true });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const user = await User.findOne({ where: { email } });
  if (user) {
    const raw = randomToken();
    await PasswordReset.create({
      userId: user.id,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const link = `${env.resetUrl}?token=${raw}`;
    console.log(`[auth] reset password for ${email}: ${link}`);
  }
  res.json({ ok: true, message: "Si el correo existe, enviamos un enlace de recuperación." });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password || String(password).length < 6) {
    return res.status(400).json({ error: "Token y contraseña (mín. 6) son requeridos." });
  }
  const row = await PasswordReset.findOne({ where: { tokenHash: hashToken(token), usedAt: null } });
  if (!row || row.expiresAt < new Date()) return res.status(400).json({ error: "El enlace ya no es válido." });
  const user = await User.findByPk(row.userId);
  if (!user) return res.status(400).json({ error: "Usuario no encontrado." });
  user.passwordHash = await bcrypt.hash(password, 10);
  await user.save();
  row.usedAt = new Date();
  await row.save();
  res.json({ ok: true });
});
