function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const TOPICS = [
  {
    id: "crear-evento",
    title: "Crear un evento",
    href: "/eventos/nuevo",
    keywords: ["crear evento", "nuevo evento", "como creo", "hacer evento", "agregar evento", "wizard", "portada"],
    answer: `Para crear un evento:

1. En el menú izquierdo entra a Crear evento.
2. Paso 1: llena nombre, tipo (boda, XV, etc.), anfitriones, fecha, hora y lugar.
3. Paso 2: sube una foto de portada (clic o arrastra) o elige una paleta de color. Pon un nombre corto, por ejemplo A&C.
4. Paso 3: puedes ir a importar el Excel o cargar la lista después.

Cuando lo guardes, el evento aparece en “Mis eventos”.`,
  },
  {
    id: "portada",
    title: "Subir la foto de portada",
    href: "/eventos/nuevo",
    keywords: ["portada", "foto", "imagen", "arrastrar", "subir foto", "cover"],
    answer: `En Crear evento, paso 2 “Configuración visual”:

1. Haz clic en el recuadro o arrastra una imagen JPG, PNG o WEBP.
2. Si no quieres foto, elige solo una paleta de color.
3. La foto se ajusta sola y queda como portada del evento.

Si el recuadro no reacciona, recarga la página e inténtalo otra vez.`,
  },
  {
    id: "importar",
    title: "Importar invitados desde Excel",
    href: "/eventos",
    keywords: ["importar", "excel", "csv", "lista", "subir invitados", "cargar invitados", "xlsx"],
    answer: `Para cargar tu lista:

1. Abre el evento.
2. Entra a Importar Excel.
3. Arrastra un archivo .xlsx, .xls o .csv.
4. Revisa que las columnas coincidan: nombre, teléfono, invitados, mesa, etc.
5. Confirma la importación.

El teléfono debe ir con lada. Si tu plan se llenó, no podrás agregar más hasta mejorar o reactivar la suscripción.`,
  },
  {
    id: "conectar-whatsapp",
    title: "Conectar WhatsApp",
    href: "/eventos/whatsapp",
    keywords: [
      "conectar whatsapp",
      "whatsapp",
      "whatsapp business",
      "waba",
      "facebook",
      "pegar token",
      "desconectar whatsapp",
      "probar envio",
    ],
    answer: `Para conectar WhatsApp:

1. En el menú izquierdo entra a WhatsApp.
2. Pulsa conectar con Facebook y sigue el alta de tu cuenta de WhatsApp Business.
3. Si el alta no termina, puedes pegar el token a mano (WABA y Phone number ID).
4. Crea la plantilla de invitación con el asistente.
5. Espera a que Meta la apruebe. Mientras esté en revisión no podrás lanzar la campaña.

Puedes mandar una prueba a un número de 10 dígitos. Para desconectar, usa el botón de esa misma pantalla.`,
  },
  {
    id: "campana",
    title: "Enviar las invitaciones",
    keywords: [
      "enviar",
      "campana",
      "lanzar",
      "invitar",
      "invitaciones",
      "mensaje inicial",
      "empezar envio",
      "primer contacto",
    ],
    answer: `Antes de lanzar:

1. Conecta WhatsApp.
2. Ten la plantilla de invitación Aprobada por Meta (en Mensajes del evento).
3. Abre el evento → Resumen y lanza o programa la campaña.
4. Se envía a los invitados en “sin contactar”. Las respuestas llegan en Conversaciones.

Si WhatsApp no está conectado o la plantilla sigue en revisión, el lanzamiento queda bloqueado.`,
  },
  {
    id: "plantillas-meta",
    title: "Plantillas de WhatsApp (Meta)",
    href: "/eventos/plantillas",
    keywords: [
      "plantilla",
      "plantillas",
      "meta",
      "hsm",
      "aprobada",
      "en revision",
      "rechazada",
      "primer contacto",
      "recordatorio whatsapp",
    ],
    answer: `Hay dos sitios:

- Plantillas (menú izquierdo): las de tu cuenta en Meta. Ahí ves el estado, editas o borras (borrarlas también las quita en Meta).
- Mensajes del evento: eliges o creas la plantilla de invitación, recordatorio y seguimiento de ese evento.

Meta tiene que aprobar cada una (Borrador → En revisión → Aprobada). Si editas una Aprobada, vuelve a revisión. Una En revisión no se puede guardar otra vez.

En el cuerpo usa {{1}} (nombre) y {{2}} (número de pases). No las pongas al inicio ni al final. Máximo 10 plantillas por evento.

Sin WhatsApp conectado no puedes crear ni enviar plantillas.`,
  },
  {
    id: "conversaciones",
    title: "Ver y responder conversaciones",
    keywords: ["conversacion", "conversaciones", "chat", "responder", "mensajes invitados", "whatsapp chat"],
    answer: `En el evento, entra a Conversaciones:

- Ahí ves cada chat con el invitado.
- Puedes dejar que el asistente conteste o pausarlo y escribir tú.
- Los recordatorios se mandan desde Invitados.

Si un invitado ya respondió, no lo vuelvas a meter en la campaña inicial: sigue el hilo en Conversaciones.`,
  },
  {
    id: "invitados",
    title: "Gestionar la lista de invitados",
    keywords: ["invitado", "invitados", "lista", "mesa", "confirmar", "estatus", "recordatorio"],
    answer: `En el evento, pestaña Invitados:

- Filtra por estado: sin contactar, enviado, confirmado, no asiste.
- Edita nombre, teléfono, lugares e mesa.
- Manda un recordatorio a alguien en particular.
- Exporta la lista o la lista final.

Para agregar gente nueva se cuenta contra el límite de tu plan.`,
  },
  {
    id: "automatizacion",
    title: "Configurar el asistente del evento",
    keywords: ["automatizacion", "asistente", "ia evento", "tono", "sofia", "reglas"],
    answer: `En Automatización IA del evento puedes:

1. Poner el nombre del asistente (Sofía, Renata, etc.).
2. Ajustar tono, formalidad y si usa emojis.
3. Editar el mensaje de apertura.
4. Definir reglas y seguimientos. El recontacto usa la plantilla de seguimiento de Mensajes.

Ese asistente habla con los invitados por WhatsApp. No es este chat de ayuda: este chat soy yo, para explicarte cómo usar Alanna.`,
  },
  {
    id: "faq-evento",
    title: "Respuestas frecuentes del evento",
    keywords: ["faq", "respuestas frecuentes", "dress code", "ubicacion", "ninos", "estacionamiento"],
    answer: `En el evento, pestaña Mensajes → Respuestas frecuentes:

Ahí pones las preguntas que el asistente del evento puede contestar a los invitados (niños, vestimenta, ubicación, estacionamiento).

Eso no es una plantilla de Meta: las plantillas de WhatsApp se gestionan en Plantillas y en la pestaña de plantillas de Mensajes.`,
  },
  {
    id: "estadisticas",
    title: "Ver confirmaciones y estadísticas",
    keywords: ["estadistica", "resumen", "porcentaje", "confirmados", "panel"],
    answer: `En el evento:

- Resumen: números de confirmados, pendientes y rechazos.
- Estadísticas: avance día a día.

En el Panel general ves todos tus eventos juntos.`,
  },
  {
    id: "equipo",
    title: "Invitar a tu equipo",
    keywords: ["equipo", "miembro", "invitar colaborador", "permisos", "rol"],
    answer: `En Configuración del evento puedes agregar miembros del equipo y ajustar permisos por rol.

Así otra planner o coordinadora entra al mismo evento sin usar tu cuenta.`,
  },
  {
    id: "planes",
    title: "Planes y límites",
    href: "/",
    keywords: [
      "plan",
      "planes",
      "limite",
      "limites",
      "esencial",
      "estudio",
      "atelier",
      "cuantos eventos",
      "precio",
      "cuesta",
      "incluye",
      "mensual",
      "anual",
    ],
    answer: `Los planes limitan eventos e invitados al mes. Precios en pesos mexicanos; el anual tiene 20% de descuento:

- Esencial: $500/mes o $4,800/año · 2 eventos · 300 invitados
- Estudio: $1,200/mes o $11,520/año · 6 eventos · 1,000 invitados
- Atelier: $2,400/mes o $23,040/año · 15 eventos · 3,000 invitados

En el menú izquierdo ves cuántos eventos e invitados llevas (por ejemplo 1/2 eventos). Si llegas al tope, Alanna te pide mejorar el plan. Los envíos de WhatsApp de eventos actuales no se cortan.

La tabla completa está en la página de inicio, sección Planes.`,
  },
  {
    id: "cambiar-plan",
    title: "Cambiar de plan",
    href: "/",
    keywords: [
      "cambiar plan",
      "cambiar de plan",
      "cambio mi plan",
      "plan de pago",
      "mejorar plan",
      "upgrade",
      "bajar de plan",
      "otro plan",
    ],
    answer: `Para cambiar de plan (subir, bajar o pasar de mensual a anual):

1. En la página de inicio entra a Planes. Si ya te llenaste el cupo, también aparece “Mejorar plan con Stripe”.
2. Elige Esencial, Estudio o Atelier y si pagas mes o año.
3. Si tu suscripción ya está activa, el cambio se aplica en Stripe y se prorratea: no vuelves a dar de alta la tarjeta.
4. El plan nuevo vale en cuanto Stripe confirma el cobro.

“Actualizar método de pago” en Suscripción solo sirve para la tarjeta y las facturas. Ahí no se cambia el plan ni se cancela.`,
  },
  {
    id: "pago",
    title: "Suscripción, tarjeta y cobros",
    href: "/eventos/suscripcion",
    keywords: [
      "pagar",
      "pago",
      "stripe",
      "reactivar",
      "renovar",
      "cobro",
      "tarjeta",
      "pendiente de pago",
      "suscripcion",
      "factura",
      "metodo de pago",
      "portal",
      "actualizar",
    ],
    answer: `En el menú izquierdo entra a Suscripción. Ahí ves el plan actual, si es mensual o anual, hasta cuándo está vigente y si está activa, pendiente de pago o ya no se renueva.

Para cambiar la tarjeta o ver facturas:

1. En Suscripción pulsa “Actualizar método de pago”.
2. Stripe abre el portal. No canceles desde ahí: en Alanna la baja se pide en esa misma pantalla y la acepta un administrador.

Si el plan no se renovó o ya venció, el botón de pagar te lleva a Stripe. Sigues viendo tus eventos y los envíos no se paran. Para crear otro evento o agregar invitados hay que volver a pagar.`,
  },
  {
    id: "cancelar",
    title: "Cancelar la suscripción",
    href: "/eventos/suscripcion",
    keywords: ["cancelar", "cancelo", "cancelas", "cancele", "baja", "cancelacion", "ya no quiero", "terminar plan", "cancelo mi plan"],
    answer: `La baja no es inmediata:

1. En Suscripción escribe el motivo y envía la solicitud.
2. Un administrador de Alanna debe aceptarla.
3. Si la acepta, terminas el periodo que ya pagaste. No se corta el mismo día.
4. Cuando se vence, ya no puedes crear eventos ni agregar invitados.
5. Los envíos de invitaciones de eventos actuales siguen.

Si cambias de opinión antes de que la acepten, retira la solicitud.`,
  },
  {
    id: "soporte",
    title: "Abrir un ticket de soporte",
    href: "/eventos/soporte",
    keywords: ["soporte", "ticket", "ayuda humana", "problema", "error", "falla"],
    answer: `Si algo no funciona o este chat no te alcanza:

1. Entra a Soporte.
2. Crea un ticket con asunto y detalle.
3. El equipo de Alanna responde en esa misma conversación.

Úsalo para fallas, cobros o algo que no puedas resolver tú.`,
  },
  {
    id: "cuenta",
    title: "Iniciar sesión o recuperar contraseña",
    href: "/recuperar-contrasena",
    keywords: ["login", "contrasena", "olvidé", "entrar", "cuenta", "correo"],
    answer: `Para entrar: Iniciar sesión con el correo de tu cuenta.

Si olvidaste la contraseña: Recuperar contraseña, te llega un enlace para crear una nueva.

El registro pide negocio, teléfono, estado, correo, contraseña y un plan.`,
  },
];

const CHIP_CREAR = "¿Cómo creo un evento?";
const CHIP_WHATSAPP = "¿Cómo conecto WhatsApp?";
const CHIP_PLANTILLAS = "¿Cómo funcionan las plantillas de Meta?";
const CHIP_ENVIAR = "¿Cómo envío las invitaciones?";
const CHIP_TICKET = "Quiero abrir un ticket";
const CHIP_IMPORTAR = "¿Cómo importo mi Excel?";
const CHIP_CONVERSACIONES = "¿Cómo veo las conversaciones?";
const CHIP_FAQ = "¿Qué son las respuestas frecuentes?";
const CHIP_ASISTENTE = "¿Cómo configuro el asistente?";
const CHIP_PLANES = "¿Qué incluye cada plan?";
const CHIP_CAMBIAR = "¿Cómo cambio de plan?";
const CHIP_PAGO = "¿Cómo actualizo mi tarjeta?";
const CHIP_CANCELAR = "¿Cómo cancelo mi plan?";

const SUGGESTIONS = [CHIP_CREAR, CHIP_WHATSAPP, CHIP_PLANTILLAS, CHIP_ENVIAR, CHIP_TICKET];

const FOLLOW_UPS = {
  "crear-evento": [CHIP_IMPORTAR, CHIP_WHATSAPP, CHIP_PLANTILLAS],
  portada: [CHIP_CREAR, CHIP_IMPORTAR],
  importar: [CHIP_ENVIAR, CHIP_WHATSAPP, CHIP_TICKET],
  "conectar-whatsapp": [CHIP_PLANTILLAS, CHIP_ENVIAR, CHIP_TICKET],
  campana: [CHIP_WHATSAPP, CHIP_PLANTILLAS, CHIP_CONVERSACIONES],
  "plantillas-meta": [CHIP_WHATSAPP, CHIP_ENVIAR, CHIP_FAQ],
  conversaciones: [CHIP_ENVIAR, CHIP_ASISTENTE, CHIP_TICKET],
  invitados: [CHIP_IMPORTAR, CHIP_ENVIAR, CHIP_FAQ],
  automatizacion: [CHIP_FAQ, CHIP_PLANTILLAS, CHIP_CONVERSACIONES],
  "faq-evento": [CHIP_PLANTILLAS, CHIP_ASISTENTE, CHIP_ENVIAR],
  estadisticas: [CHIP_ENVIAR, CHIP_TICKET],
  equipo: [CHIP_CREAR, CHIP_TICKET],
  planes: [CHIP_CAMBIAR, CHIP_PAGO, CHIP_CANCELAR],
  "cambiar-plan": [CHIP_PLANES, CHIP_PAGO, CHIP_CANCELAR],
  pago: [CHIP_CAMBIAR, CHIP_PLANES, CHIP_CANCELAR],
  cancelar: [CHIP_PAGO, CHIP_PLANES, CHIP_TICKET],
  soporte: [CHIP_WHATSAPP, CHIP_ENVIAR, CHIP_TICKET],
  cuenta: [CHIP_TICKET],
};

function hasPhrase(words, phrase) {
  const parts = String(phrase || "")
    .split(" ")
    .filter(Boolean);
  if (!parts.length) return false;
  for (let i = 0; i <= words.length - parts.length; i += 1) {
    if (parts.every((part, j) => words[i + j] === part)) return true;
  }
  return false;
}

function scoreTopic(query, topic) {
  const words = query.split(" ").filter(Boolean);
  let score = 0;
  for (const key of topic.keywords) {
    if (hasPhrase(words, key)) score += key.split(" ").length + 2;
  }
  for (const word of normalize(topic.title).split(" ")) {
    if (word.length > 3 && words.includes(word)) score += 1;
  }
  return score;
}

function suggestionsFor(topicId, query) {
  const list = FOLLOW_UPS[topicId] || SUGGESTIONS;
  return list.filter((item) => normalize(item) !== query).slice(0, 4);
}

function greetingReply(name) {
  const who = name ? `, ${name.split(" ")[0]}` : "";
  return {
    reply: `Hola${who}. Soy el asistente de Alanna. Pregúntame cómo crear un evento, conectar WhatsApp, usar las plantillas de Meta o lanzar la campaña.\n\nElige una duda o escríbela con tus palabras.`,
    suggestions: SUGGESTIONS,
  };
}

export function helpSuggestions() {
  return SUGGESTIONS;
}

export function answerHelp(message, user) {
  const query = normalize(message);
  if (!query) {
    return greetingReply(user?.name);
  }
  if (/^(hola|buenas|buenos dias|hey|que tal|hi)\b/.test(query) && query.split(" ").length < 5) {
    return greetingReply(user?.name);
  }
  if (/gracias|perfecto|ok|listo|excelente/.test(query) && query.split(" ").length < 6) {
    return {
      reply: "Cuando quieras, pregúntame otra cosa. Si algo no carga o falla, abre un ticket en Soporte.",
      href: "/eventos/soporte",
      suggestions: SUGGESTIONS.filter((item) => normalize(item) !== query).slice(0, 4),
    };
  }

  const ranked = TOPICS.map((topic) => ({ topic, score: scoreTopic(query, topic) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) {
    return {
      reply: `No tengo una guía exacta para eso. Prueba con algo como “cómo importo el Excel” o “cómo envío las invitaciones”.\n\nSi es un error o un cobro, mejor abre un ticket en Soporte y te responde el equipo.`,
      href: "/eventos/soporte",
      suggestions: SUGGESTIONS,
    };
  }

  const best = ranked[0].topic;
  const extras = ranked
    .slice(1, 3)
    .filter((row) => row.score >= 2)
    .map((row) => row.topic.title);

  return {
    reply: extras.length ? `${best.answer}\n\nTambién te puede servir: ${extras.join("; ")}.` : best.answer,
    title: best.title,
    href: best.href || null,
    suggestions: suggestionsFor(best.id, query),
  };
}
