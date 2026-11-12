# Invitados table mobile horizontal scroll — Design

Date: 2026-11-12  
Scope: `front/src/routes/eventos.$eventId.invitados.tsx`

## Goal

On mobile, the guests table scrolls horizontally so all columns remain accessible.

## Behavior

- Scroll container uses explicit `overflow-x-auto overflow-y-auto` and touch-friendly pan.
- Remove `[&_.relative]:overflow-visible` override that breaks nested table overflow.
- Keep `min-w-[980px]` on the table.
- Sticky first column (Representante) while scrolling horizontally; sticky header retained vertically.
