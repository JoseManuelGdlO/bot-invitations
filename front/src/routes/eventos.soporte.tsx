import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/eventos/soporte")({
  component: () => <Outlet />,
});
