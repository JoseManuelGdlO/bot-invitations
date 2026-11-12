# Short-height shell (mobile landscape) — Design

Date: 2026-11-12  
Scope: `front/src/routes/eventos.tsx` + `front/src/lib/sidebar-shell.ts` (+ tests)  
Related: `2026-11-12-sidebar-toggle-design.md`

## Goal

Recover vertical space when the viewport is short (typical phone landscape) so content stays usable.

## Detection

- `isShortHeight` from `matchMedia('(max-height: 500px)')` (hook or inline listener, same pattern as `useIsMobile`).
- Independent of width: a phone in landscape often exceeds the 768px width breakpoint and would otherwise get the desktop shell.

## Behavior when `isShortHeight`

1. **No top header** — `sidebarNeedsHeaderBrand` is false even if the width-based mode would show it.
2. **Icon rail chrome** — force the aside into icon-only style (narrow `w-14`, no nav labels), even if width ≥ 768. Brand/logo still toggles; when open, show full overlay (or full sticky sidebar) with labels as today.
3. **NotificationBell** moves into the icon rail (below the logo) because the header is gone.
4. **Tighter aside padding** — reduce vertical padding in the brand/footer blocks (e.g. `py-6` → `py-3`).

## Behavior when not short height

Unchanged from the sidebar-toggle design.

## Helpers

Extend `sidebar-shell` so header/rail decisions can take `isShortHeight`:

- `sidebarNeedsHeaderBrand(mode, isShortHeight)` → always `false` if short height.
- `resolveSidebarMode(isMobile, open, isShortHeight?)` → if short height and closed, return `mobile-icons`; if short height and open, return `mobile-full` (reuse existing modes) so landscape-wide phones still get compact chrome.

## Out of scope

- Admin shell
- Per-page content reflow beyond what the shell chrome change enables
- Changing the 768px `useIsMobile` width breakpoint itself

## Testing

- Unit tests for short-height mode resolution and header suppression.
- Manual: DevTools phone landscape (~844×390) — no top header, icon rail, content taller; toggle still works.
