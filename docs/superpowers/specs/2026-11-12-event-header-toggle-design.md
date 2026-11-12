# Event header toggle (short height) — Design

Date: 2026-11-12  
Scope: `front/src/routes/eventos.$eventId.tsx`  
Related: short-height shell design

## Goal

On mobile landscape (short height), clicking the event logo + title toggles the event page header open/closed to free vertical space.

## Behavior

- Only when `useIsShortHeight()` is true (`max-height: 500px`).
- Click target: event cover/logo + event name (`h1`).
- **Collapsed (default in short height):** minimal strip with logo + name only; hide date/venue line, status badge, and tabs nav.
- **Expanded:** full header as today.
- Outside short height: no toggle; full header always; click is inert (not a button).

## Implementation

- Local `headerExpanded` state in `EventLayout`.
- Default: `false` when short height, `true` otherwise (sync on breakpoint change).
- When short height, wrap logo+title in a button with `aria-expanded` / `aria-controls`.

## Out of scope

- App shell (Alanna) header
- Persist preference
- Non-event pages
