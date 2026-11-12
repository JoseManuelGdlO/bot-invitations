export type SidebarMode =
  | "desktop-open"
  | "desktop-closed"
  | "mobile-icons"
  | "mobile-full";

export function resolveSidebarMode(
  isMobile: boolean,
  open: boolean,
  isShortHeight = false,
): SidebarMode {
  if (isShortHeight || isMobile) return open ? "mobile-full" : "mobile-icons";
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

export function sidebarNeedsHeaderBrand(
  mode: SidebarMode,
  isShortHeight = false,
): boolean {
  if (isShortHeight) return false;
  return mode !== "desktop-open";
}
