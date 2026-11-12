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
  assert.equal(sidebarNeedsHeaderBrand("mobile-icons"), true);
  assert.equal(sidebarNeedsHeaderBrand("mobile-full"), true);
});
