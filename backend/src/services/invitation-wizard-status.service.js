import { User } from "../models/index.js";

export const INVITATION_WIZARD_PENDING = "pending";
export const INVITATION_WIZARD_COMPLETED = "completed";
export const INVITATION_WIZARD_SKIPPED = "skipped";

export function isInvitationWizardRequired(status) {
  return status === INVITATION_WIZARD_PENDING;
}

export async function markInvitationWizardPending(ownerUserId) {
  const user = await User.findByPk(ownerUserId);
  if (!user) return null;
  if (user.invitationWizardStatus != null) return user.invitationWizardStatus;
  await user.update({ invitationWizardStatus: INVITATION_WIZARD_PENDING });
  return INVITATION_WIZARD_PENDING;
}

export async function markInvitationWizardSkipped(ownerUserId) {
  const user = await User.findByPk(ownerUserId);
  if (!user) return null;
  if (user.invitationWizardStatus !== INVITATION_WIZARD_PENDING) {
    return user.invitationWizardStatus;
  }
  await user.update({ invitationWizardStatus: INVITATION_WIZARD_SKIPPED });
  return INVITATION_WIZARD_SKIPPED;
}

export async function markInvitationWizardCompleted(ownerUserId) {
  const user = await User.findByPk(ownerUserId);
  if (!user) return null;
  await user.update({ invitationWizardStatus: INVITATION_WIZARD_COMPLETED });
  return INVITATION_WIZARD_COMPLETED;
}

export async function getInvitationWizardRequired(ownerUserId) {
  const user = await User.findByPk(ownerUserId);
  return isInvitationWizardRequired(user?.invitationWizardStatus ?? null);
}
