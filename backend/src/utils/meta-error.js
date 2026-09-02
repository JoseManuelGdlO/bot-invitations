function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function trimOrNull(value) {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  return text || null;
}

/** Normaliza un error de Graph / webhook de Cloud API (code, details, fbtrace). */
export function summarizeMetaError(errorLike = {}) {
  const nested = asObject(errorLike).error;
  const err = nested && typeof nested === "object" ? nested : asObject(errorLike);
  const errorData = asObject(err.error_data);
  const codeRaw = err.code;
  const code = codeRaw == null || codeRaw === "" ? null : Number.isFinite(Number(codeRaw)) ? Number(codeRaw) : codeRaw;
  return {
    code,
    subcode: err.error_subcode ?? err.subcode ?? null,
    type: trimOrNull(err.type),
    title: trimOrNull(err.title || err.error_user_title),
    message: trimOrNull(err.message || err.error_user_msg),
    details: trimOrNull(errorData.details || err.details),
    fbtraceId: trimOrNull(err.fbtrace_id || err.fbtraceId),
    href: trimOrNull(err.href),
  };
}

export function summarizeMetaErrors(errors = []) {
  if (!Array.isArray(errors)) return [];
  return errors.map((item) => summarizeMetaError(item)).filter((row) =>
    row.code != null || row.message || row.title || row.details,
  );
}
