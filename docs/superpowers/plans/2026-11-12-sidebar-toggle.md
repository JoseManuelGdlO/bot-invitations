# Sidebar Brand Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking the Alanna brand toggles the left sidebar on mobile and desktop per the approved design.

**Architecture:** Keep the custom aside in `eventos.tsx`. Extract pure mode helpers into `sidebar-shell.ts` for unit tests. Use existing `useIsMobile` (768px). Mobile closed = icon-only rail; mobile open = full overlay + backdrop; desktop closed = fully hidden with header brand to reopen.

**Tech Stack:** React, TanStack Router, Tailwind, existing `useIsMobile`, node:test for pure helpers.

## Global Constraints

- Scope: `front/src/routes/eventos.tsx` only (admin out of scope).
- Desktop closed: fully hidden (not icon rail).
- Mobile closed: icons only.
- No cookie persistence.
- Do not migrate to shadcn SidebarProvider.

## File map

- Create: `front/src/lib/sidebar-shell.ts` — mode resolution + class helpers
- Create: `front/src/lib/sidebar-shell.test.ts` — unit tests
- Modify: `front/src/routes/eventos.tsx` — wire toggle UI

---

### Task 1: Sidebar mode helpers

**Files:**
- Create: `front/src/lib/sidebar-shell.ts`
- Test: `front/src/lib/sidebar-shell.test.ts`

**Interfaces:**
- Produces: `SidebarMode = "desktop-open" | "desktop-closed" | "mobile-icons" | "mobile-full"`
- Produces: `resolveSidebarMode(isMobile: boolean, open: boolean): SidebarMode`
- Produces: `sidebarShowsLabels(mode: SidebarMode): boolean`
- Produces: `sidebarAsideVisible(mode: SidebarMode): boolean`
- Produces: `sidebarIconOnly(mode: SidebarMode): boolean`
- Produces: `sidebarNeedsBackdrop(mode: SidebarMode): boolean`
- Produces: `sidebarNeedsHeaderBrand(mode: SidebarMode): boolean`

- [ ] **Step 1: Write failing tests**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveSidebarMode,
  sidebarShowsLabels,
  sidebarAsideVisible,
  sidebarIconOnly,
  sidebarNeedsBackdrop,
  sidebarNeedsHeaderBrand,
} from "./sidebar-shell.ts";

test("desktop open/closed modes", () => {
  assert.equal(resolveSidebarMode(false, true), "desktop-open");
  assert.equal(resolveSidebarMode(false, false), "desktop-closed");
  assert.equal(sidebarShowsLabels("desktop-open"), true);
  assert.equal(sidebarAsideVisible("desktop-closed"), false);
  assert.equal(sidebarNeedsHeaderBrand("desktop-closed"), true);
  assert.equal(sidebarNeedsHeaderBrand("desktop-open"), false);
});

test("mobile icons vs full", () => {
  assert.equal(resolveSidebarMode(true, false), "mobile-icons");
  assert.equal(resolveSidebarMode(true, true), "mobile-full");
  assert.equal(sidebarIconOnly("mobile-icons"), true);
  assert.equal(sidebarShowsLabels("mobile-icons"), false);
  assert.equal(sidebarAsideVisible("mobile-icons"), true);
  assert.equal(sidebarNeedsBackdrop("mobile-full"), true);
  assert.equal(sidebarNeedsBackdrop("mobile-icons"), false);
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd front && node --experimental-strip-types --test src/lib/sidebar-shell.test.ts`

- [ ] **Step 3: Implement helpers**

```ts
export type SidebarMode =
  | "desktop-open"
  | "desktop-closed"
  | "mobile-icons"
  | "mobile-full";

export function resolveSidebarMode(isMobile: boolean, open: boolean): SidebarMode {
  if (isMobile) return open ? "mobile-full" : "mobile-icons";
  return open ? "desktop-open" : "desktop-closed";
}

export function sidebarShowsLabels(mode: SidebarMode): boolean {
  return mode === "desktop-open" || mode === "mobile-full";
}

export function sidebarAsideVisible(mode: SidebarMode): boolean {
  return mode !== "desktop-closed";
}

export function sidebarIconOnly(mode: SidebarMode): boolean {
  return mode === "mobile-icons";
}

export function sidebarNeedsBackdrop(mode: SidebarMode): boolean {
  return mode === "mobile-full";
}

export function sidebarNeedsHeaderBrand(mode: SidebarMode): boolean {
  return mode === "desktop-closed" || mode === "mobile-icons" || mode === "mobile-full";
}
```

Note: header brand always useful on mobile (toggle) and when desktop closed. On `desktop-open`, header can stay hidden (`md` pattern).

Actually: on mobile we have icon rail brand — header brand is optional. Spec allows header brand for toggle. Keep `sidebarNeedsHeaderBrand` true for desktop-closed and for all mobile modes so the existing mobile header remains.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add -f front/src/lib/sidebar-shell.ts front/src/lib/sidebar-shell.test.ts
git commit -m "feat: add sidebar shell mode helpers"
```

---

### Task 2: Wire AppShell toggle UI

**Files:**
- Modify: `front/src/routes/eventos.tsx`

**Interfaces:**
- Consumes: helpers from Task 1 + `useIsMobile` from `@/hooks/use-mobile`

- [ ] **Step 1: Add state and mode**

Import `useIsMobile` and sidebar helpers. Add:

```tsx
const isMobile = useIsMobile();
const [sidebarOpen, setSidebarOpen] = useState(true);

useEffect(() => {
  setSidebarOpen(!isMobile);
}, [isMobile]);

const mode = resolveSidebarMode(isMobile, sidebarOpen);
const showLabels = sidebarShowsLabels(mode);
const iconOnly = sidebarIconOnly(mode);
const showAside = sidebarAsideVisible(mode);
const showBackdrop = sidebarNeedsBackdrop(mode);
const showHeaderBrand = sidebarNeedsHeaderBrand(mode);

const toggleSidebar = () => setSidebarOpen((v) => !v);
const closeSidebar = () => setSidebarOpen(false);
```

- [ ] **Step 2: Restyle aside + backdrop + brand button**

- Aside: visible when `showAside`; `w-14` when `iconOnly`; `w-64` when labels; `fixed z-50` when `mobile-full`; `sticky` otherwise; `hidden` when desktop-closed.
- Backdrop button when `showBackdrop` → `closeSidebar`.
- Brand control: `<button type="button" onClick={toggleSidebar} aria-expanded={sidebarOpen} aria-controls="app-sidebar">`.
- Wrap nav text / section titles / user meta in `{showLabels ? ... : null}` or `sr-only`; links get `aria-label` when `iconOnly`.
- Nav links `onClick={() => { if (isMobile) closeSidebar(); }}`.
- Header: show when `showHeaderBrand` (replace `md:hidden`); brand button toggles; keep NotificationBell outside brand hit target.
- Keep NotificationBell in aside header only when `showLabels`.

- [ ] **Step 3: Manual verify**

Resize / toggle: desktop hide/show; mobile icon rail ↔ overlay; nav click closes; bell works.

- [ ] **Step 4: Commit**

```bash
git add front/src/routes/eventos.tsx
git commit -m "feat: toggle eventos sidebar from Alanna brand"
```

---

## Spec coverage self-review

- Brand toggle both viewports → Task 2
- Desktop full hide → `desktop-closed` / Task 1+2
- Mobile icons only → `mobile-icons` / Task 1+2
- Backdrop + nav close on mobile → Task 2
- Admin / shadcn / persistence out of scope → respected
