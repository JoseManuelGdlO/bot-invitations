import { EventMember } from "../models/index.js";

export const ACTIVE_MEMBER = { removedAt: null };

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function memberWhere(extra = {}) {
  return { ...ACTIVE_MEMBER, ...extra };
}

export async function findInvitationsByEmail(email) {
  const clean = normalizeEmail(email);
  if (!clean) return [];
  return EventMember.findAll({ where: memberWhere({ email: clean }) });
}

export async function findPendingInvitations(email) {
  const clean = normalizeEmail(email);
  if (!clean) return [];
  return EventMember.findAll({ where: memberWhere({ userId: null, email: clean }) });
}

export async function claimPendingInvitations(user) {
  const email = normalizeEmail(user?.email);
  if (!email || !user?.id) return 0;
  const [count] = await EventMember.update(
    { userId: user.id },
    { where: memberWhere({ userId: null, email }) },
  );
  return count;
}

export async function displayTeamRole(userId) {
  if (!userId) return null;
  const rows = await EventMember.findAll({
    where: memberWhere({ userId }),
    attributes: ["role"],
    order: [["updatedAt", "DESC"]],
  });
  return rows[0]?.role || null;
}
