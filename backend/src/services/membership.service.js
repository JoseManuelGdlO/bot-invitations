import { EventMember } from "../models/index.js";

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export async function findPendingInvitations(email) {
  const clean = normalizeEmail(email);
  if (!clean) return [];
  return EventMember.findAll({ where: { userId: null, email: clean } });
}

export async function claimPendingInvitations(user) {
  const email = normalizeEmail(user?.email);
  if (!email || !user?.id) return 0;
  const [count] = await EventMember.update({ userId: user.id }, { where: { userId: null, email } });
  return count;
}
