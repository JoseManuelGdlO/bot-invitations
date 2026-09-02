export type WhatsAppMark = "text" | "strong" | "em" | "s" | "code";

export type WhatsAppSegment = {
  type: WhatsAppMark;
  value: string;
};

const MARKERS: Array<{ left: string; right: string; type: Exclude<WhatsAppMark, "text"> }> = [
  { left: "```", right: "```", type: "code" },
  { left: "*", right: "*", type: "strong" },
  { left: "_", right: "_", type: "em" },
  { left: "~", right: "~", type: "s" },
];

function clampRange(text: string, start: number, end: number) {
  const from = Math.max(0, Math.min(start, end, text.length));
  const to = Math.max(from, Math.min(Math.max(start, end), text.length));
  return { from, to };
}

export function wrapSelection(
  text: string,
  start: number,
  end: number,
  left: string,
  right: string = left,
) {
  const { from, to } = clampRange(text, start, end);
  const selected = text.slice(from, to);
  const next = `${text.slice(0, from)}${left}${selected}${right}${text.slice(to)}`;
  const innerStart = from + left.length;
  return {
    text: next,
    selectionStart: innerStart,
    selectionEnd: innerStart + selected.length,
  };
}

export function insertAtCursor(text: string, start: number, end: number, insert: string) {
  const { from, to } = clampRange(text, start, end);
  const next = `${text.slice(0, from)}${insert}${text.slice(to)}`;
  const pos = from + insert.length;
  return { text: next, selectionStart: pos, selectionEnd: pos };
}

function findNextMark(text: string) {
  let best: { index: number; length: number; type: Exclude<WhatsAppMark, "text">; inner: string } | null =
    null;
  for (const marker of MARKERS) {
    const index = text.indexOf(marker.left);
    if (index < 0) continue;
    const innerStart = index + marker.left.length;
    const closeAt = text.indexOf(marker.right, innerStart);
    if (closeAt < 0) continue;
    if (marker.type !== "code" && text.slice(innerStart, closeAt).includes("\n")) continue;
    if (closeAt === innerStart) continue;
    if (!best || index < best.index) {
      best = {
        index,
        length: closeAt + marker.right.length - index,
        type: marker.type,
        inner: text.slice(innerStart, closeAt),
      };
    }
  }
  return best;
}

export function parseWhatsAppMarkup(text: string): WhatsAppSegment[] {
  const segments: WhatsAppSegment[] = [];
  let remaining = String(text || "");
  while (remaining.length) {
    const mark = findNextMark(remaining);
    if (!mark) {
      segments.push({ type: "text", value: remaining });
      break;
    }
    if (mark.index > 0) {
      segments.push({ type: "text", value: remaining.slice(0, mark.index) });
    }
    segments.push({ type: mark.type, value: mark.inner });
    remaining = remaining.slice(mark.index + mark.length);
  }
  return segments;
}
