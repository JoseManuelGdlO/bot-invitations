import { createFileRoute } from "@tanstack/react-router";
import {
  pageHead,
  buildFaqJsonLd,
  buildBreadcrumbJsonLd,
  jsonLdScripts,
} from "@/lib/seo";
import { SeoLanding, SeoSection } from "@/components/seo-landing";

const faqs = [
  {
    q: "¿Alanna Confirmaciones es un software para wedding planners?",
    a: "Sí. Está hecha para estudios que confirman invitados de bodas y eventos: importas la lista, el asistente conversa por WhatsApp y tú ves el tablero por cada fecha.",
  },
  {
    q: "¿Sirve si ya tengo timeline y contratos en otra app?",
    a: "Sí. Alanna no sustituye tu moodboard ni tus contratos. Cubre el hueco del RSVP: quién va, con cuántas personas y quién sigue pendiente.",
  },
  {
    q: "¿Puedo gestionar varias bodas a la vez?",
    a: "Cada evento tiene su lista, sus conversaciones y su lista final. El plan se elige según cuántos eventos e invitados tienes en el mes o en el año.",
  },
];

export const Route = createFileRoute("/para-wedding-planners")({
  head: () => ({
    ...pageHead({
      title: "Software para wedding planners · Alanna Confirmaciones",
      description:
        "Herramienta de confirmación de invitados para wedding planners. Alanna importa tu lista, confirma por WhatsApp y te deja el tablero listo por cada boda.",
      path: "/para-wedding-planners",
    }),
    scripts: jsonLdScripts(
      buildFaqJsonLd(faqs),
      buildBreadcrumbJsonLd([
        { name: "Inicio", path: "/" },
        { name: "Para wedding planners", path: "/para-wedding-planners" },
      ]),
    ),
  }),
  component: ParaWeddingPlanners,
});

function ParaWeddingPlanners() {
  return (
    <SeoLanding
      kicker="Para wedding planners"
      title="Software de confirmaciones para wedding planners"
      intro="Alanna Confirmaciones es el copiloto de tu estudio: dejas de perseguir RSVP en el celular personal y pasas a un tablero por boda, con el asistente hablando por WhatsApp."
      faqs={faqs}
      related={[
        {
          href: "/confirmacion-invitados-whatsapp",
          label: "Confirmación de invitados por WhatsApp",
        },
        { href: "/software-rsvp-bodas", label: "Software RSVP para bodas" },
        { href: "/blog", label: "Guías para estudios y listas de invitados" },
      ]}
    >
      <SeoSection title="El trabajo que el timeline no hace">
        <p>
          Un wedding planner ya coordina proveedores, cronograma y familia. Lo
          que se come las tardes es otra cosa: tíos que no contestan, novias que
          reenvían capturas y un Excel con cinco versiones. Eso no se resuelve
          con otro tablero de tareas. Se resuelve con un proceso de
          confirmación.
        </p>
        <p>
          Alanna está pensada para ese hueco. Importas la lista, lanzas las
          confirmaciones y ves quién ya dijo que sí, quién rechazó y a quién hay
          que volver a escribir —sin mezclarlo con tu WhatsApp personal.
        </p>
      </SeoSection>
      <SeoSection title="Cómo entra en el flujo de un estudio">
        <p>
          En el kickoff pides un archivo con responsable, teléfono y lugares. Lo
          subes, mapeas columnas y el asistente usa el tono de tu estudio. Tú
          diseñas el día; el copiloto registra la asistencia.
        </p>
        <p>
          Cuando banquetes pide el número, exportas la lista final. El seating y
          el menú salen de un dato, no de una sensación. Si quieres el detalle
          operativo, lee{" "}
          <a
            href="/blog/como-confirmar-invitados-boda-200"
            className="text-foreground underline-offset-4 hover:underline"
          >
            cómo confirmar una boda de 200 invitados
          </a>
          .
        </p>
      </SeoSection>
      <SeoSection title="Hecho en México, para cómo se confirma aquí">
        <p>
          El invitado de una boda en México vive en WhatsApp, no en un
          formulario inglés. Alanna Confirmaciones asume eso: conversación,
          interpretación de la respuesta y tablero en español, con planes desde
          $500 MXN al mes según volumen de eventos e invitados.
        </p>
      </SeoSection>
    </SeoLanding>
  );
}
