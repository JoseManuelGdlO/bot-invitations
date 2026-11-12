# Sidebar toggle via brand click — Design

Date: 2026-11-12  
Scope: `front/src/routes/eventos.tsx` (AppShell only; admin out of scope)

## Goal

Clicking the **Alanna Confirmaciones** brand toggles the left sidebar open/closed on both mobile and desktop.

## Behavior

### State

- Local `sidebarOpen` state in `AppShell`.
- Defaults:
  - Desktop (`md+`): open
  - Mobile (`< md`): closed (icon-only rail)
- No cookie / localStorage persistence in this iteration.

### Toggle trigger

- Clickable brand control (logo + “Alanna” / “Confirmaciones”) in:
  - The sidebar header (when the full sidebar is visible)
  - The top header brand (when needed to re-open on desktop after full hide, and on mobile)
- Uses a button-like control with `aria-expanded` and `aria-controls` pointing at the sidebar.

### Desktop (`md` and up)

- **Open:** current full sidebar (labels + icons), same layout as today.
- **Closed:** sidebar fully hidden; main content uses full width.
- Brand in the main header (or a compact header shown when closed) toggles it back open.

### Mobile (`< md`)

- **Closed (default):** narrow left rail with **icons only** (no nav labels, no “Confirmaciones” subtitle text in the rail items). Brand/logo remains the toggle.
- **Open:** full sidebar overlay (icons + labels), with semi-transparent backdrop.
- Navigating via a nav link, or tapping the backdrop, returns to icon-only (closed).

### Out of scope

- Admin shell (`/admin`)
- Migrating to shadcn `SidebarProvider`
- Icon-collapsed mode on desktop
- Persisting open/closed across reloads

## Implementation sketch

1. Add `sidebarOpen` + `toggleSidebar` / `closeSidebar` in `AppShell`.
2. Detect mobile vs desktop with an existing breakpoint helper or a simple `matchMedia('(min-width: 768px)')` effect for the default and layout branching.
3. Restyle the existing `<aside>`:
   - Mobile closed: fixed/sticky narrow width, hide text nodes with CSS (`sr-only` or conditional render).
   - Mobile open: wider overlay + backdrop.
   - Desktop closed: do not render in flow (`hidden` / width 0).
4. Make the brand a toggle control; keep `NotificationBell` outside the toggle hit target so it still works independently.
5. On mobile nav `Link` click / backdrop click → `closeSidebar()`.

## Testing

- Manual: resize between mobile and desktop; toggle brand; confirm desktop hide/show and mobile icon-rail ↔ full overlay.
- Confirm notification bell and logout still work when sidebar is open or icon-only.
- Confirm navigating to a route from mobile full menu collapses back to icons.
