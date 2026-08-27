import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/eventos/$eventId/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/eventos/$eventId/resumen",
      params: { eventId: params.eventId },
    });
  },
});
