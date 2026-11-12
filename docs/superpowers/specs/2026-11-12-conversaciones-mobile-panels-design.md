# Conversaciones mobile 3-panel swipe — Design

Date: 2026-11-12  
Scope: `front/src/routes/eventos.$eventId.conversaciones.tsx`

## Goal

On mobile, access lista, chat y detalle by swiping horizontally; each panel scrolls vertically.

## Behavior

- Below `lg`: horizontal scroll-snap across 3 full-width panels (lista → chat → detalle).
- Vertical scroll stays inside each panel.
- Selecting a guest from the list scrolls to the chat panel.
- Chat header: back control returns to lista; tapping guest name/open profile goes to detalle.
- At `lg+`: unchanged 3-column grid (no snap carousel).

## Out of scope

- Redesign of panel contents
- Changing desktop layout
