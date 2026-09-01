import { Link, createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/legal-page";
import { LEGAL_COMPANY, LEGAL_CONTACT_EMAIL } from "@/lib/legal";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/eliminar-datos")({
  head: () =>
    pageHead({
      title: `Eliminación de datos de usuario · ${LEGAL_COMPANY}`,
      description:
        "Instrucciones para solicitar la eliminación de tu cuenta y datos personales en Alanna Confirmaciones, incluyendo WhatsApp y Meta.",
      path: "/eliminar-datos",
    }),
  component: EliminarDatosPage,
});

function EliminarDatosPage() {
  return (
    <LegalPage
      kicker="Legal"
      title="Eliminación de datos de usuario"
      intro="Esta página cumple el requisito de Meta de publicar instrucciones claras para borrar los datos que Alanna trata cuando usas Facebook Login, WhatsApp Business o nuestra plataforma."
    >
      <LegalSection title="1. Quién puede pedir el borrado">
        <p>
          <strong className="text-foreground">Wedding planner o titular de la cuenta:</strong>{" "}
          puedes pedir que eliminemos tu usuario, eventos, invitados,
          conversaciones y la conexión de WhatsApp.
        </p>
        <p>
          <strong className="text-foreground">Invitado o destinatario de WhatsApp:</strong>{" "}
          puedes pedir que borremos tu número, nombre y mensajes
          asociados a un evento. También puedes escribir al planner que te
          contactó.
        </p>
      </LegalSection>

      <LegalSection title="2. Cómo solicitarlo">
        <p>Envía un correo a:</p>
        <p>
          <a
            href={`mailto:${LEGAL_CONTACT_EMAIL}?subject=${encodeURIComponent("Solicitud de eliminación de datos — Alanna Confirmaciones")}`}
            className="text-foreground underline underline-offset-4"
          >
            {LEGAL_CONTACT_EMAIL}
          </a>
        </p>
        <p>Incluye, en la medida de lo posible:</p>
        <p>
          1. Asunto: “Solicitud de eliminación de datos”.<br />
          2. El correo con el que te registraste en Alanna, o el número de
          WhatsApp que recibió mensajes.<br />
          3. Si eres invitado, el nombre del evento o de los novios, si lo
          recuerdas.<br />
          4. Confirmación de que pides el borrado y no solo darte de baja
          de mensajes.
        </p>
        <p>
          Si tienes sesión, también puedes abrir un ticket en{" "}
          <Link
            to="/eventos/soporte"
            className="text-foreground underline underline-offset-4"
          >
            Soporte
          </Link>{" "}
          o solicitar la cancelación de la suscripción en tu panel. Eso no
          sustituye el correo si quieres un borrado completo.
        </p>
      </LegalSection>

      <LegalSection title="3. Qué eliminamos">
        <p>Tras verificar la identidad de quien pide el borrado:</p>
        <p>
          • Cuenta: nombre, correo, negocio, teléfono y miembros del
          equipo.<br />
          • Eventos, listas de invitados, plantillas, FAQs y
          conversaciones.<br />
          • Conexión de WhatsApp (token, WABA, phone number id o device)
          y el historial de mensajes que guardamos.<br />
          • Tickets de soporte asociados, cuando no debamos conservarlos
          por ley.
        </p>
        <p>
          Podemos conservar el tiempo estrictamente necesario: comprobantes
          de pago (Stripe), registros de seguridad o datos que la ley
          mexicana nos obligue a retener. Esos restos no se usan para
          contactarte por WhatsApp.
        </p>
      </LegalSection>

      <LegalSection title="4. Plazo">
        <p>
          Confirmamos la recepción en un máximo de 5 días hábiles y
          completamos el borrado operativo en un máximo de 30 días
          naturales, salvo que una obligación legal impida borrar algún
          dato concreto; en ese caso te lo diremos.
        </p>
      </LegalSection>

      <LegalSection title="5. Si conectaste WhatsApp o Facebook">
        <p>
          Eliminar tu cuenta en Alanna no borra automáticamente tu perfil
          de Facebook ni tu WhatsApp Business en Meta. Si también quieres
          desconectar la app de Meta, usa la configuración de Facebook
          (Configuración → Aplicaciones y sitios web) o WhatsApp Business
          → Cuenta → Plataforma de negocios, según el flujo que hayas
          usado.
        </p>
        <p>
          Esta URL es la instrucción de eliminación de datos de usuario
          que Meta solicita para nuestra aplicación. No es un callback
          automático: el borrado lo ejecutamos nosotros al recibir tu
          solicitud.
        </p>
      </LegalSection>

      <LegalSection title="6. Contacto">
        <p>
          {LEGAL_COMPANY}
          <br />
          Correo:{" "}
          <a
            href={`mailto:${LEGAL_CONTACT_EMAIL}`}
            className="text-foreground underline underline-offset-4"
          >
            {LEGAL_CONTACT_EMAIL}
          </a>
        </p>
        <p>
          <Link
            to="/privacidad"
            className="text-foreground underline underline-offset-4"
          >
            Política de privacidad
          </Link>
          {" · "}
          <Link
            to="/terminos"
            className="text-foreground underline underline-offset-4"
          >
            Condiciones del servicio
          </Link>
        </p>
      </LegalSection>
    </LegalPage>
  );
}
