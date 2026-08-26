import { createFileRoute } from "@tanstack/react-router";
import { pageHead, buildFaqJsonLd, buildBreadcrumbJsonLd, jsonLdScripts } from "@/lib/seo";
import { SeoLanding, SeoSection } from "@/components/seo-landing";

const faqs = [
  {
    q: "¿Alanna reemplaza mi Excel de invitados?",
    a: "Reemplaza el copiado de respuestas en celdas. Sigues pudiendo importar Excel o CSV y exportar la lista final para seating y banquetes.",
  },
  {
    q: "¿Cuánto cuesta el software RSVP?",
    a: "El plan Esencial parte de 500 pesos mexicanos al mes, con límite de eventos e invitados. Hay planes Estudio y Atelier si tu temporada es más grande.",
  },
  {
    q: "¿Sirve solo para bodas?",
    a: "El flujo es el mismo para XV años y otros eventos: lista, WhatsApp, estados y lista final. Cada fecha se gestiona aparte.",
  },
];

export const Route = createFileRoute("/software-rsvp-bodas")({
  head: () => ({
    ...pageHead({
      title: "Software RSVP para bodas · Alanna Confirmaciones",
      description:
        "Software RSVP para bodas: deja de confirmar en Excel a mano. Alanna importa tu lista, confirma por WhatsApp y entrega la lista final a tu estudio.",
      path: "/software-rsvp-bodas",
    }),
    scripts: jsonLdScripts(
      buildFaqJsonLd(faqs),
      buildBreadcrumbJsonLd([
        { name: "Inicio", path: "/" },
        { name: "Software RSVP para bodas", path: "/software-rsvp-bodas" },
      ]),
    ),
  }),
  component: SoftwareRsvpBodas,
});

function SoftwareRsvpBodas() {
  return (
    <SeoLanding
      kicker="Software RSVP"
      title="Software RSVP para bodas: deja Excel y confirma en automático"
      intro="El Excel es un buen inventario. Es un mal chat. Alanna Confirmaciones toma tu lista, confirma asistencia por WhatsApp y te devuelve quién va —para que el RSVP deje de ser un segundo trabajo."
      faqs={faqs}
      related={[
        { href: "/para-wedding-planners", label: "Para wedding planners" },
        { href: "/confirmacion-invitados-whatsapp", label: "Confirmación de invitados por WhatsApp" },
        { href: "/blog/plantilla-lista-invitados-boda", label: "Plantilla de lista de invitados" },
      ]}
    >
      <SeoSection title="Qué debe hacer un RSVP de verdad">
        <p>
          Importar nombres sin reescribirlos. Hablar con el invitado en el canal que ya usa. Guardar un estado por
          invitación: pendiente, confirmado, rechazado, y cuántos lugares ocupa. Exportar para el proveedor. Si falta
          una de esas piezas, sigues haciendo el trabajo a mano.
        </p>
        <p>
          Alanna cubre ese ciclo. No es un editor de invitaciones digitales ni un timeline de proveedores. Es el
          copiloto de confirmaciones del wedding planner.
        </p>
      </SeoSection>
      <SeoSection title="De la hoja de cálculo al tablero">
        <p>
          Subes Excel o CSV, mapeas columnas (responsable, teléfono, lugares) y lanzas el primer lote. El asistente
          conversa; tú miras KPIs y la bandeja cuando un caso se sale del guion.
        </p>
        <p>
          La lista deja de tener cinco colores y tres copias en Drive. Hay una versión por evento. Si estás armando el
          archivo, usa la{" "}
          <a href="/blog/plantilla-lista-invitados-boda" className="text-foreground underline-offset-4 hover:underline">
            guía de plantilla de invitados
          </a>
          .
        </p>
      </SeoSection>
      <SeoSection title="Cuándo vale la pena cambiarse">
        <p>
          Si todavía confirmas 40 invitados por chat personal, puedes aguantar. Si tu estudio lleva varias fechas, 150
          personas o más, o un cliente que pide avance cada dos días, el copiado en Excel ya te está costando horas
          que no facturas. Los planes de Alanna empiezan en $500 MXN al mes.
        </p>
      </SeoSection>
    </SeoLanding>
  );
}
