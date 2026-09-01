const BULK_KINDS = new Set(["campaign", "follow_up", "reminder", "seguimiento"]);
export const DAY_MS = 24 * 60 * 60 * 1000;

export function isBulkKind(kind) {
  return BULK_KINDS.has(String(kind || ""));
}

export function countInitialConversations(jobs, eventIds, since) {
  const sinceMs = new Date(since).getTime();
  const mine = (Array.isArray(jobs) ? jobs : []).filter((job) => {
    if (!eventIds.has(job.payload?.eventId)) return false;
    if (job.status !== "done") return false;
    if (!job.payload?.result?.conversationStarted) return false;
    const at = new Date(job.updatedAt).getTime();
    return Number.isFinite(at) && at >= sinceMs;
  });
  mine.sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));
  return {
    count: mine.length,
    oldestAt: mine[0]?.updatedAt || null,
  };
}

export function nextInitialRetryAt(oldestAt, now = new Date()) {
  const oldest = oldestAt ? new Date(oldestAt).getTime() : NaN;
  if (!Number.isFinite(oldest)) return new Date(new Date(now).getTime() + DAY_MS);
  return new Date(oldest + DAY_MS);
}
