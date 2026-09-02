export function normalizePhoneDigits(phone: string | undefined): string {
  return String(phone || "").replace(/\D/g, "");
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
