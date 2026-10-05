const NO_REPLY_STATUSES = new Set(["sin_contactar", "enviado", "entregado", "reagendado"]);

export function normalizePhoneDigits(phone: string | undefined): string {
  return String(phone || "").replace(/\D/g, "");
}

export function matchesConversationFilter(
  row: {
    guest: { status?: string } | null | undefined;
    conv?: { unread?: number; aiPaused?: boolean } | null;
  },
  filter: string,
): boolean {
  const value = filter.trim();
  if (!value || value === "todos") return true;
  if (!row.guest) return false;
  if (value === "sin_contestar") return NO_REPLY_STATUSES.has(row.guest.status ?? "");
  if (value === "sin_leer") return (row.conv?.unread ?? 0) > 0;
  if (value === "tomada") return Boolean(row.conv?.aiPaused);
  return row.guest.status === value;
}

export function matchesConversationSearch(
  guest: { rep?: string; phone?: string } | null | undefined,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (!guest) return false;

  const name = guest.rep?.toLowerCase() ?? "";
  const phone = String(guest.phone || "");
  const queryDigits = normalizePhoneDigits(query);
  const phoneDigits = normalizePhoneDigits(phone);

  return (
    name.includes(needle) ||
    phone.toLowerCase().includes(needle) ||
    (queryDigits.length >= 3 && phoneDigits.includes(queryDigits))
  );
}
