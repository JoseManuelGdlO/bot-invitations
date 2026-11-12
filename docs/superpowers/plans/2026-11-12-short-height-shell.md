# Short-height shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Recover vertical space on short viewports (phone landscape) by forcing icon-rail chrome and hiding the top header.

**Architecture:** Extend `sidebar-shell` helpers with `isShortHeight`; add `useIsShortHeight` hook (`max-height: 500px`); wire into `eventos.tsx`.

**Tech Stack:** React, matchMedia, Tailwind, node:test

## Global Constraints

- Scope: eventos AppShell only
- Threshold: `max-height: 500px`
- Short height forces `mobile-icons` / `mobile-full` modes regardless of width
- No header when short height; NotificationBell in icon rail

### Task 1: Helpers + hook

- Modify: `front/src/lib/sidebar-shell.ts`, `front/src/lib/sidebar-shell.test.ts`
- Create: `front/src/hooks/use-short-height.tsx`

- [ ] Update `resolveSidebarMode(isMobile, open, isShortHeight = false)` — if short height, return mobile-icons/mobile-full
- [ ] Update `sidebarNeedsHeaderBrand(mode, isShortHeight = false)` — false when short height
- [ ] Tests for short-height cases
- [ ] `useIsShortHeight` mirroring `useIsMobile` with `(max-height: 500px)`
- [ ] Commit

### Task 2: Wire AppShell

- Modify: `front/src/routes/eventos.tsx`
- [ ] Use hook; pass `isShortHeight` into helpers
- [ ] Default `sidebarOpen` closed when mobile OR short height
- [ ] Close on nav when mobile OR short height
- [ ] Bell in rail when `iconOnly && isShortHeight`
- [ ] Tighter aside padding when short height
- [ ] Commit
