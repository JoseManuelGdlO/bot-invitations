import { createFileRoute } from "@tanstack/react-router";
import { pageHead, buildFaqJsonLd, buildBreadcrumbJsonLd, jsonLdScripts } from "@/lib/seo";
import { SeoLanding, SeoSection } from "@/components/seo-landing";

const faqs = [
  {
    q: "¿Los invitados tienen que descargar algo?",
    a: "No. Reciben un WhatsApp, contestan en el mismo chat y Alanna registra si asisten y con cuántas personas.",
  },
  {
    q: "¿Puedo usar el WhatsApp de los novios?",
    a: "El envío sale desde la cuenta conectada al evento, con el tono de tu estudio. Así no se mezcla la vida personal del planner ni el chat de la pareja con 200 hilos.",
  },
  {
    q: "¿Qué pasa si alguien escribe ‘vamos los tres si mi hermana puede’?",
    a: "El asistente interpreta la intención y deja el estado en el tablero. Tú ves la conversación si hay que afinar un caso raro.",
  },
];

export const Route = createFileRoute("/confirmacion-invitados-whatsapp")({
  head: () => ({
    ...pageHead({
      title: "Confirmación de invitados por WhatsApp · Alanna Confirmaciones",
      description:
        "Confirma asistencia de bodas y eventos por WhatsApp. Alanna envía el mensaje, entiende la respuesta y arma la lista final para tu estudio.",
      path: "/confirmacion-invitados-whatsapp",
    }),
    scripts: jsonLdScripts(
      buildFaqJsonLd(faqs),
      buildBreadcrumbJsonLd([
        { name: "Inicio", path: "/" },
        { name: "Confirmación por WhatsApp", path: "/confirmacion-invitados-whatsapp" },
      ]),
    ),
  }),
  component: ConfirmacionWhatsApp,
});

function ConfirmacionWhatsApp() {
  return (
    <SeoLanding
      kicker="RSVP por WhatsApp"
      title="Confirmación de invitados por WhatsApp"
      intro="El invitado ya está en WhatsApp. Alanna Confirmaciones manda el primer mensaje, da seguimiento a quien no contesta y anota sí, no y número de personas —sin que el wedding planner copie celdas a mano."
      faqs={faqs}
      related={[
        { href: "/para-wedding-planners", label: "Software para wedding planners" },
        { href: "/software-rsvp-bodas", label: "Software RSVP para bodas" },
        { href: "/blog/rsvp-whatsapp-vs-excel", label: "RSVP por WhatsApp vs Excel" },
      ]}
    >
      <SeoSection title="Por qué WhatsApp gana al formulario">
        <p>
          Un link de RSVP se pierde entre stories y correos. Un WhatsApp se abre. En bodas familiares en México, la
          tasa de respuesta sube cuando no pides otra app ni una contraseña.
        </p>
        <p>
          El canal, eso sí, no basta. Si confirmas desde tu celular personal, el estudio se vuelve un call center.
          Hace falta un envío con guion, recordatorios y un tablero que no sea tu galería de capturas.
        </p>
      </SeoSection>
      <SeoSection title="Qué pregunta el primer mensaje">
        <p>
          Quién escribe, fecha del evento, lugares asignados y qué contestar: asistencia y número de personas. Menú,
          canción o alergias pueden ir después, cuando ya hay un sí. Un mensaje largo en el primer toque se ignora.
        </p>
        <p>
          Alanna lanza ese primer contacto a partir de tu Excel o CSV. El asistente sigue la conversación y deja cada
          invitación en un estado claro para que banquetes reciba un número, no una estima.
        </p>
      </SeoSection>
      <SeoSection title="Seguimiento sin perseguir a mano">
        <p>
          Tres oleadas suelen bastar: envío, recordatorio a pendientes y aviso de corte. El resto son excepciones que
          autoriza el cliente. El detalle de tono y fechas está en{" "}
          <a href="/blog/dejar-de-perseguir-confirmaciones" className="text-foreground underline-offset-4 hover:underline">
            cómo dejar de perseguir confirmaciones
          </a>
          .
        </p>
      </SeoSection>
    </SeoLanding>
  );
}
