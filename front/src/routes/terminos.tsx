import { Link, createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/legal-page";
import { LEGAL_COMPANY, LEGAL_CONTACT_EMAIL } from "@/lib/legal";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/terminos")({
  head: () =>
    pageHead({
      title: `Condiciones del servicio · ${LEGAL_COMPANY}`,
      description:
        "Términos de uso de Alanna Confirmaciones: cuentas, suscripción, WhatsApp y responsabilidades del wedding planner.",
      path: "/terminos",
    }),
  component: TerminosPage,
});

function TerminosPage() {
  return (
    <LegalPage
      kicker="Legal"
      title="Condiciones del servicio"
      intro={`Estas condiciones regulan el uso de ${LEGAL_COMPANY}. Al crear una cuenta o usar la plataforma, aceptas este documento y la Política de privacidad.`}
    >
      <LegalSection title="1. El servicio">
        <p>
          Alanna es un software SaaS para que wedding planners y
          organizadores de eventos gestionen confirmaciones de invitados
          mediante WhatsApp y un asistente de IA. El servicio incluye
          tablero, importación de listas, campañas, conversaciones y
          reportes, según el plan contratado.
        </p>
      </LegalSection>

      <LegalSection title="2. Cuenta y elegibilidad">
        <p>
          Debes ser mayor de edad y usar la plataforma en nombre de un
          negocio o estudio. Eres responsable de la veracidad de tus datos,
          de proteger tu contraseña y de la actividad que ocurra en tu
          cuenta y en la de tu equipo.
        </p>
      </LegalSection>

      <LegalSection title="3. Planes y pagos">
        <p>
          Los planes (límites de eventos e invitados) y precios se muestran
          en el sitio. El cobro se procesa a través de Stripe. Puedes
          cancelar desde tu panel; la cancelación aplica al final del
          periodo pagado, salvo que se indique otra cosa en el flujo de
          facturación.
        </p>
      </LegalSection>

      <LegalSection title="4. WhatsApp y Meta">
        <p>
          Tú conectas tu propio número o cuenta de WhatsApp Business. Debes
          cumplir las políticas de WhatsApp/Meta, incluyendo plantillas,
          consentimiento de los destinatarios y uso aceptable. Alanna no es
          Meta y no garantiza que Meta apruebe un número, una plantilla o
          un volumen de envío.
        </p>
        <p>
          Queda prohibido usar la plataforma para spam, phishing, acoso o
          cualquier fin ilegal. Podemos suspender cuentas que pongan en
          riesgo a invitados, a otros clientes o a la integración con Meta.
        </p>
      </LegalSection>

      <LegalSection title="5. Contenido y datos que subes">
        <p>
          Conservas la titularidad de tus listas, mensajes y configuración.
          Nos otorgas una licencia limitada para tratarlos solo con el fin
          de prestar el servicio. Garantizas que tienes base legal para
          contactar a los invitados (relación con el evento,
          consentimiento u otra base aplicable).
        </p>
      </LegalSection>

      <LegalSection title="6. Disponibilidad e IA">
        <p>
          El asistente interpreta respuestas y puede equivocarse. Debes
          revisar confirmaciones críticas. El servicio puede interrumpirse
          por mantenimiento, fallas de WhatsApp, Meta, OpenAI, Stripe o el
          hosting. No prometemos disponibilidad ininterrumpida.
        </p>
      </LegalSection>

      <LegalSection title="7. Limitación de responsabilidad">
        <p>
          En la medida permitida por la ley mexicana, Alanna no responde
          por daños indirectos, lucro cesante o decisiones tomadas con base
          en una interpretación automática de un mensaje. Nuestra
          responsabilidad total, si la hubiera, no excederá lo pagado por
          el servicio en los tres meses anteriores al reclamo.
        </p>
      </LegalSection>

      <LegalSection title="8. Terminación">
        <p>
          Puedes dejar de usar el servicio y solicitar la eliminación de
          tus datos según las{" "}
          <Link
            to="/eliminar-datos"
            className="text-foreground underline underline-offset-4"
          >
            instrucciones de eliminación
          </Link>
          . Podemos cerrar o restringir cuentas por impago, abuso o
          incumplimiento de estas condiciones.
        </p>
      </LegalSection>

      <LegalSection title="9. Contacto y ley aplicable">
        <p>
          Contacto:{" "}
          <a
            href={`mailto:${LEGAL_CONTACT_EMAIL}`}
            className="text-foreground underline underline-offset-4"
          >
            {LEGAL_CONTACT_EMAIL}
          </a>
          . Estas condiciones se interpretan conforme a las leyes de los
          Estados Unidos Mexicanos. Ver también la{" "}
          <Link
            to="/privacidad"
            className="text-foreground underline underline-offset-4"
          >
            Política de privacidad
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
