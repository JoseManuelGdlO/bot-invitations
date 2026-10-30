import type { SessionUser } from "./mock/types.ts";

export const SUBSCRIPTION_REQUIRED_WHATSAPP =
  "Necesitas un plan activo para conectar WhatsApp y enviar invitaciones.";

export function sessionCanUseWhatsApp(session: SessionUser | null | undefined): boolean {
  if (!session) return false;
  if (session.isAdmin) return true;
  if (session.usage && session.usage.canSendInvitations === false) return false;
  return session.subscriptionStatus === "active";
}
