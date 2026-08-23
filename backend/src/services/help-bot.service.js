function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s?¿]/g, " ")
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
    id: "campana",
    title: "Enviar las invitaciones",
    keywords: ["enviar", "campana", "lanzar", "whatsapp", "mensaje inicial", "invitar", "empezar envio"],
    answer: `Para mandar las confirmaciones:

1. Abre el evento y entra a Conversaciones o Automatización.
2. Revisa el mensaje de apertura (puedes editarlo).
3. Lanza la campaña: se envía a los invitados en “sin contactar”.
4. Las respuestas llegan en Conversaciones.

Si tu plan se venció o se canceló, los envíos de ese evento no se detienen. Lo que no podrás es crear otro evento o agregar más gente.`,
  },
  {
    id: "conversaciones",
    title: "Ver y responder conversaciones",
    keywords: ["conversacion", "chat", "responder", "mensajes invitados", "whatsapp chat"],
    answer: `En el evento, entra a Conversaciones:

- Ahí ves cada chat con el invitado.
- Puedes dejar que el asistente conteste o pausarlo y escribir tú.
- Los recordatorios se mandan desde Invitados.

Si un invitado ya respondió, no lo vuelvas a meter en la campaña inicial: sigue el hilo en Conversaciones.`,
  },
  {
    id: "invitados",
    title: "Gestionar la lista de invitados",
    keywords: ["invitado", "lista", "mesa", "confirmar", "estatus", "recordatorio"],
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
4. Definir reglas y seguimientos.

Ese asistente habla con los invitados por WhatsApp. No es este chat de ayuda: este chat soy yo, para explicarte cómo usar Alanna.`,
  },
  {
    id: "plantillas",
    title: "Plantillas y respuestas frecuentes",
    keywords: ["plantilla", "faq", "mensajes", "biblioteca", "dress code", "ubicacion"],
    answer: `En el evento, entra a Mensajes:

- Biblioteca: textos listos (primer contacto, recordatorio, ubicación, dress code).
- Respuestas frecuentes: preguntas que el asistente puede usar con los invitados.

Cópialas o edítalas antes de lanzar la campaña.`,
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
    keywords: ["plan", "limite", "esencial", "estudio", "atelier", "cuantos eventos", "precio"],
    answer: `Los planes definen cuántos eventos e invitados puedes tener al mes:

- Esencial: 2 eventos / 300 invitados
- Estudio: 6 eventos / 1,000 invitados
- Atelier: 15 eventos / 3,000 invitados

Si llegas al tope, Alanna te pide mejorar el plan. Elige mensual o anual (el anual tiene descuento).`,
  },
  {
    id: "pago",
    title: "Pagar o reactivar la suscripción",
    href: "/eventos/suscripcion",
    keywords: ["pagar", "pago", "stripe", "reactivar", "renovar", "cobro", "tarjeta", "pendiente de pago"],
    answer: `Para pagar o cambiar la tarjeta:

1. Entra a Suscripción.
2. Usa “Actualizar método de pago” para la tarjeta.
3. Si tu cuenta no está activa, el botón de pagar te lleva a Stripe.

Si no se renovó, sigues viendo tus eventos y los envíos no se paran. Para crear otro evento o agregar invitados, hay que volver a pagar.`,
  },
  {
    id: "cancelar",
    title: "Cancelar la suscripción",
    href: "/eventos/suscripcion",
    keywords: ["cancelar", "cancelo", "cancelas", "cancele", "baja", "cancelacion", "ya no quiero", "terminar plan"],
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

const SUGGESTIONS = [
  "¿Cómo creo un evento?",
  "¿Cómo importo mi Excel?",
  "¿Cómo envío las invitaciones?",
  "¿Cómo cancelo mi plan?",
  "Quiero abrir un ticket",
];

function scoreTopic(query, topic) {
  let score = 0;
  for (const key of topic.keywords) {
    if (query.includes(key)) score += key.split(" ").length + 2;
  }
  for (const word of normalize(topic.title).split(" ")) {
    if (word.length > 3 && query.includes(word)) score += 1;
  }
  return score;
}

function greetingReply(name) {
  const who = name ? `, ${name.split(" ")[0]}` : "";
  return {
    reply: `Hola${who}. Soy el asistente de Alanna. Pregúntame cómo hacer las cosas en la plataforma: crear un evento, importar invitados, enviar confirmaciones, pagar o cancelar.\n\nElige una duda o escríbela con tus palabras.`,
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
      suggestions: SUGGESTIONS.slice(0, 3),
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
    suggestions: SUGGESTIONS.filter((item) => normalize(item) !== query).slice(0, 4),
  };
}
