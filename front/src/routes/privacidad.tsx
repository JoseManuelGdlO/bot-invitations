import { Link, createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/legal-page";
import { LEGAL_COMPANY, LEGAL_CONTACT_EMAIL } from "@/lib/legal";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/privacidad")({
  head: () =>
    pageHead({
      title: `Política de privacidad · ${LEGAL_COMPANY}`,
      description:
        "Cómo Alanna Confirmaciones recopila, usa y protege los datos de wedding planners e invitados, incluyendo WhatsApp y Meta.",
      path: "/privacidad",
    }),
  component: PrivacidadPage,
});

function PrivacidadPage() {
  return (
    <LegalPage
      kicker="Legal"
      title="Política de privacidad"
      intro={`${LEGAL_COMPANY} (“Alanna”, “nosotros”) opera la plataforma de confirmación de invitados por WhatsApp para wedding planners. Esta política explica qué datos tratamos, para qué y cómo puedes ejercer tus derechos.`}
    >
      <LegalSection title="1. Responsable del tratamiento">
        <p>
          El responsable es {LEGAL_COMPANY}. Para cualquier solicitud de
          privacidad, acceso, corrección o eliminación escribe a{" "}
          <a
            href={`mailto:${LEGAL_CONTACT_EMAIL}`}
            className="text-foreground underline underline-offset-4"
          >
            {LEGAL_CONTACT_EMAIL}
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="2. Qué datos recopilamos">
        <p>Según el uso de la plataforma, podemos tratar:</p>
        <p>
          <strong className="text-foreground">Cuenta del planner:</strong>{" "}
          nombre, correo, contraseña (almacenada como hash), nombre del
          negocio, teléfono, estado de la República, plan y datos de
          facturación/suscripción (Stripe).
        </p>
        <p>
          <strong className="text-foreground">Eventos e invitados:</strong>{" "}
          nombre del evento, fecha, sede, lista de invitados (nombre,
          teléfono, mesa, notas), estado de confirmación y número de
          acompañantes.
        </p>
        <p>
          <strong className="text-foreground">WhatsApp:</strong> número
          conectado, identificadores técnicos de Meta o del proveedor
          (WABA, phone number id, device id), mensajes enviados y recibidos,
          y estados de entrega. El contenido se usa para confirmar
          asistencia con un asistente de IA.
        </p>
        <p>
          <strong className="text-foreground">Uso del sitio:</strong>{" "}
          registros técnicos (IP, fecha, errores) y, si está activo,
          analítica (por ejemplo Google Analytics).
        </p>
      </LegalSection>

      <LegalSection title="3. Para qué usamos los datos">
        <p>
          Prestamos el servicio de confirmación de invitados: enviar y
          recibir mensajes, interpretar respuestas, actualizar el tablero y
          cobrar la suscripción. También usamos los datos para soporte,
          seguridad, prevención de abuso y obligaciones legales.
        </p>
        <p>
          No vendemos listas de invitados ni usamos conversaciones de
          WhatsApp para anuncios a terceros.
        </p>
      </LegalSection>

      <LegalSection title="4. WhatsApp, Meta y otros encargados">
        <p>
          Si conectas WhatsApp Business mediante la API oficial de Meta,
          Meta Platforms, Inc. trata mensajes y números según sus políticas
          de WhatsApp Business Platform. También podemos usar un proveedor
          de conexión tipo WhatsApp Web mientras migramos a Cloud API.
        </p>
        <p>
          Otros encargados habituales: OpenAI (interpretación de mensajes),
          Stripe (pagos), hosting y correo transaccional. Cada uno trata
          solo lo necesario para su función.
        </p>
      </LegalSection>

      <LegalSection title="5. Conservación">
        <p>
          Conservamos la cuenta y los eventos mientras la suscripción esté
          activa y el tiempo adicional necesario para facturación, soporte
          o requisitos legales. Si pides la eliminación, aplicamos el
          proceso descrito en{" "}
          <Link
            to="/eliminar-datos"
            className="text-foreground underline underline-offset-4"
          >
            Eliminación de datos
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="6. Tus derechos">
        <p>
          Puedes solicitar acceso, rectificación, cancelación, oposición o
          limitación del tratamiento, y la portabilidad de tus datos,
          conforme a la legislación mexicana aplicable (incluida la LFPDPPP
          en lo que corresponda). Escríbenos a {LEGAL_CONTACT_EMAIL}.
        </p>
        <p>
          Los invitados que reciban mensajes pueden pedir que dejemos de
          contactarlos o que borremos sus datos; el planner o nosotros
          atenderemos esa solicitud.
        </p>
      </LegalSection>

      <LegalSection title="7. Seguridad y menores">
        <p>
          Ciframos credenciales de WhatsApp en el servidor y no exponemos
          tokens ni secretos de Meta en el navegador. Ningún sistema es
          infalible; si detectamos un incidente relevante, lo atenderemos y
          notificaremos cuando la ley lo requiera.
        </p>
        <p>
          El servicio está dirigido a negocios (wedding planners), no a
          menores de 18 años.
        </p>
      </LegalSection>

      <LegalSection title="8. Cambios">
        <p>
          Si actualizamos esta política, publicaremos la nueva fecha en
          esta página. El uso continuado del servicio después del cambio
          implica que conoces la versión vigente.
        </p>
        <p>
          Consulta también las{" "}
          <Link
            to="/terminos"
            className="text-foreground underline underline-offset-4"
          >
            Condiciones del servicio
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
