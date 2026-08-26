import { Outlet, createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing-shell";

export const Route = createFileRoute("/blog")({
  component: BlogLayout,
});

function BlogLayout() {
  return (
    <MarketingShell>
      <Outlet />
    </MarketingShell>
  );
}
