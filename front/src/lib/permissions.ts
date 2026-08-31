export const PERMS = {
  EDIT_ALL: "Editar todo",
  EDIT_EVENT: "Editar evento",
  MANAGE_TEAM: "Gestionar equipo",
  CONFIG_AI: "Configurar asistente",
  REPLY: "Responder conversaciones",
  CONFIRM: "Registrar confirmaciones",
  VIEW_GUESTS: "Ver invitados",
  VIEW_CHATS: "Ver conversaciones",
  EXPORT: "Exportar datos",
} as const;

export type EventAccess = {
  role: string | null;
  permissions: string[];
  isOwner?: boolean;
};

export function hasEventPerm(
  access: EventAccess | undefined,
  permission: string,
) {
  if (!access) return false;
  if (access.permissions.includes(PERMS.EDIT_ALL)) return true;
  return access.permissions.includes(permission);
}

export function eventTabAllowed(access: EventAccess | undefined, tab: string) {
  if (tab === "resumen" || tab === "estadisticas" || tab === "configuracion")
    return true;
  if (tab === "invitados") {
    return (
      hasEventPerm(access, PERMS.VIEW_GUESTS) ||
      hasEventPerm(access, PERMS.CONFIRM)
    );
  }
  if (tab === "conversaciones") {
    return (
      hasEventPerm(access, PERMS.VIEW_CHATS) ||
      hasEventPerm(access, PERMS.REPLY)
    );
  }
  if (tab === "automatizacion" || tab === "mensajes")
    return hasEventPerm(access, PERMS.CONFIG_AI);
  if (tab === "importar") return hasEventPerm(access, PERMS.EDIT_ALL);
  if (tab === "lista-final") return hasEventPerm(access, PERMS.EXPORT);
  return true;
}
