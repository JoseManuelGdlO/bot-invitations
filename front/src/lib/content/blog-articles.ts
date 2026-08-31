export type BlogArticle = {
  slug: string;
  title: string;
  description: string;
  datePublished: string;
  kicker: string;
  intro: string;
  sections: Array<{ heading: string; paragraphs: string[] }>;
};

export const blogArticles: BlogArticle[] = [
  {
    slug: "como-confirmar-invitados-boda-200",
    title:
      "Cómo confirmar invitados de una boda de 200 personas sin perseguir a nadie",
    description:
      "Guía práctica para wedding planners: cómo organizar la lista, cuándo enviar el RSVP por WhatsApp y cómo cerrar una boda de 200 invitados a tiempo.",
    datePublished: "2026-08-26",
    kicker: "Operación de bodas",
    intro:
      "Una boda de 200 personas no se confirma con un Excel abierto a las 11 de la noche. Se confirma con un proceso: lista limpia, primer mensaje claro, seguimiento automático y un corte de fecha que tu pareja (o tu cliente) pueda defender.",
    sections: [
      {
        heading: "Empieza por la lista, no por el mensaje",
        paragraphs: [
          "Antes de escribir a nadie, cada fila debe tener un responsable de la invitación, un teléfono con lada y el número de lugares asignados. Si mezclas tíos, niños y plus-ones en la misma celda, el RSVP se vuelve un caos.",
          "Agrupa por mesa o por familia solo después. Para confirmar, lo que importa es quién responde y por cuántas personas habla. Un wedding planner que limpia esa columna ahorra días de ida y vuelta.",
        ],
      },
      {
        heading: "El primer WhatsApp tiene que caber en una captura",
        paragraphs: [
          "El invitado está en el súper, no en su escritorio. El mensaje inicial debe decir quién escribe (el estudio o los novios), la fecha del evento, cuántos lugares tiene y qué tiene que contestar: sí, no, y con cuántas personas.",
          "Evita formularios eternos en el primer toque. Pregunta lo mínimo para asentar el número. Menú, canción o alergias pueden ir en un segundo mensaje cuando ya confirmó.",
        ],
      },
      {
        heading: "Tres oleadas, no un recordatorio infinito",
        paragraphs: [
          "Para 200 invitados funciona un calendario corto: envío inicial 6 a 8 semanas antes, primer recordatorio a quienes no contestaron, segundo recordatorio una semana después y corte. Después del corte, solo excepciones que autorice el cliente.",
          "Si persigues uno por uno en el chat personal del planner, el estudio se vuelve un call center. Un asistente como Alanna Confirmaciones manda esas oleadas, entiende la respuesta y deja el tablero listo para la lista final.",
        ],
      },
      {
        heading: "Cierra con un número, no con una sensación",
        paragraphs: [
          "El proveedor de banquetes no quiere ‘más o menos 180’. Quiere confirmados, pendientes y rechazos. Exporta esa lista final con nombre, lugares y estado. Ahí termina el RSVP y empieza el seating.",
        ],
      },
    ],
  },
  {
    slug: "plantilla-lista-invitados-boda",
    title:
      "Plantilla de lista de invitados para bodas: qué columnas sí importan",
    description:
      "Qué debe llevar un Excel de invitados para confirmar asistencia: responsable, teléfono, lugares, mesa y notas. Evita el archivo que nadie puede importar.",
    datePublished: "2026-08-26",
    kicker: "Listas y Excel",
    intro:
      "La lista de invitados es el contrato silencioso de la boda. Si el archivo está mal, el WhatsApp, el seating y el menú salen mal. Esta es la estructura que un wedding planner puede pedir desde el primer kickoff.",
    sections: [
      {
        heading: "Columnas mínimas que sí se importan",
        paragraphs: [
          "Nombre del responsable de la invitación, teléfono (con código de país), lugares asignados y, si ya existe, mesa o grupo. Con eso se puede confirmar. El resto es contexto.",
          "Opcional pero útil: parentesco, lado (novia/novio), ciudad, menú o alergias, y una nota corta (‘viene con abuela’). No metas párrafos en una sola celda: el archivo deja de ser una tabla.",
        ],
      },
      {
        heading: "Un teléfono por invitación",
        paragraphs: [
          "Confirmar a papá y a mamá en el mismo chat está bien si uno es el responsable. Confirmar a 12 primos con el mismo número no. Si hay dos adultos que deciden por separado, son dos filas.",
          "Pide el número en formato internacional (+52…). Los 10 dígitos locales se rompen cuando el envío sale de WhatsApp Business.",
        ],
      },
      {
        heading: "Cómo entregar el archivo al estudio",
        paragraphs: [
          "Una hoja, encabezados en la primera fila, sin celdas combinadas ni colores como único criterio. CSV o Excel. Si el cliente manda capturas de WhatsApp, transcríbelas una vez y no vuelvas a esa foto.",
          "En Alanna Confirmaciones subes ese Excel, mapeas columnas y el asistente usa el teléfono y los lugares para conversar. La plantilla no es un trámite: es lo que permite dejar de copiar nombres a mano.",
        ],
      },
    ],
  },
  {
    slug: "rsvp-whatsapp-vs-excel",
    title: "RSVP por WhatsApp vs Excel: qué conviene en una boda en México",
    description:
      "Compara confirmar invitados por WhatsApp, por formulario o persiguiendo el Excel. Cuándo cada canal funciona para un wedding planner en México.",
    datePublished: "2026-08-26",
    kicker: "RSVP",
    intro:
      "En México el invitado ya vive en WhatsApp. El Excel sigue siendo la fuente de verdad del estudio. El error es usar uno para hacer el trabajo del otro.",
    sections: [
      {
        heading: "Excel es inventario, no conversación",
        paragraphs: [
          "El archivo sirve para saber a quién invitaron y cuántos lugares hay. No sirve para preguntar, interpretar ‘vamos los 3 si mi hermana puede’ y actualizar 200 filas a las 1 a.m.",
          "Cuando el planner confirma pegando respuestas en celdas, el RSVP se vuelve un trabajo de copiado. Se pierde el hilo, se duplican nombres y nadie sabe cuál es la última versión.",
        ],
      },
      {
        heading: "El formulario web llega tarde al bolsillo",
        paragraphs: [
          "Un link bonito funciona con invitados muy digitales. En bodas familiares, muchos no lo abren o lo dejan a medias. WhatsApp no pide app nueva ni recordar una contraseña.",
          "El punto medio sano: WhatsApp para confirmar asistencia y, si hace falta, un segundo paso para menú o canción cuando ya dijeron que sí.",
        ],
      },
      {
        heading: "WhatsApp sin tablero también se rompe",
        paragraphs: [
          "Confirmar desde el celular personal del planner o de la novia mezcla la vida privada con el evento. Se pierden chats, se confunde el tono y no hay KPI.",
          "La combinación que escala es: lista en el sistema, primer mensaje y seguimientos por WhatsApp, y el Excel (o la lista final) como exportación para banquetes y seating. Eso es lo que hace Alanna Confirmaciones.",
        ],
      },
    ],
  },
  {
    slug: "software-para-wedding-planners",
    title:
      "Software para wedding planners: qué sí necesitas para confirmar invitados",
    description:
      "Qué debe tener una herramienta para wedding planners además del timeline: lista, WhatsApp, estados de RSVP y lista final. Sin humo de ‘app para todo’.",
    datePublished: "2026-08-26",
    kicker: "Herramientas",
    intro:
      "Hay software de timelines, de moodboards y de contratos. Pocas herramientas resuelven el trabajo sucio: saber quién va, con cuántas personas y quién sigue sin contestar.",
    sections: [
      {
        heading: "El hueco que el timeline no cubre",
        paragraphs: [
          "Un Gantt de proveedores no confirma tíos. El wedding planner termina usando WhatsApp personal, Drive y un Excel con cinco colores. Eso no es un proceso; es supervivencia.",
          "El software útil para confirmaciones hace tres cosas: importa la lista, conversa o registra la respuesta, y muestra el avance por evento. Si no exporta lista final, no cierra el ciclo.",
        ],
      },
      {
        heading: "Qué pedir en una demo",
        paragraphs: [
          "¿Puedo tener varios eventos separados? ¿El asistente habla con el tono de mi estudio? ¿Veo conversaciones sin entrar a 200 chats? ¿Hay límite de invitados que se ajuste a mi temporada?",
          "Alanna Confirmaciones está hecha para ese hueco: copiloto de RSVP por WhatsApp, no un ERP de todo el wedding. Si ya tienes contrato y moodboard en otra app, no hace falta cambiarlo. Hace falta dejar de perseguir confirmaciones a mano.",
        ],
      },
      {
        heading: "Empieza por un evento, no por ‘transformar el estudio’",
        paragraphs: [
          "Elige una boda de tamaño medio, limpia la lista y manda el primer lote. Mide cuántos contestan en 48 horas. Si el tablero te ahorra una tarde, ya pagó el mes.",
        ],
      },
    ],
  },
  {
    slug: "dejar-de-perseguir-confirmaciones",
    title:
      "Cómo dejar de perseguir confirmaciones de invitados (sin ser grosero)",
    description:
      "Tono, timing y corte de fecha para el RSVP de una boda. Cómo un wedding planner puede hacer seguimiento por WhatsApp sin desgastar a los novios.",
    datePublished: "2026-08-26",
    kicker: "Seguimiento",
    intro:
      "Perseguir no es el problema. El problema es perseguir sin regla: mensajes distintos, horarios raros y la novia preguntando ‘¿ya contestó mi madrina?’ cada tarde.",
    sections: [
      {
        heading: "Define el corte con el cliente el día uno",
        paragraphs: [
          "La fecha límite no se improvisa a dos semanas del evento. Se acuerda con banquetes y se comunica en el primer WhatsApp. Quien no confirma a tiempo pasa a lista de espera o se libera el lugar, según lo que el cliente elija.",
          "Cuando el corte es público, el recordatorio deja de sentirse como presión personal del planner.",
        ],
      },
      {
        heading: "Un tono, tres mensajes",
        paragraphs: [
          "El primer mensaje invita. El segundo recuerda con la fecha encima. El tercero avisa que se cierra el RSVP. Después, silencio operativo salvo excepciones.",
          "Copia el mismo tono en todos los eventos del estudio. Si un sábado es formal y el siguiente es ‘hola bb’, la marca se diluye y los invitados no saben si el chat es oficial.",
        ],
      },
      {
        heading: "Saca al planner del ping-pong",
        paragraphs: [
          "El asistente de Alanna Confirmaciones registra sí, no y número de personas. Tú ves pendientes en el tablero en lugar de rebuscar en el teléfono. El cliente puede mirar el avance sin pedirte un pantallazo.",
          "Dejar de perseguir no es dejar de insistir. Es insistir en un canal, con un guion y con un cierre.",
        ],
      },
    ],
  },
  {
    slug: "confirmacion-asistencia-xv-anos",
    title: "Confirmación de asistencia para XV años y eventos (no solo bodas)",
    description:
      "Cómo adaptar el RSVP por WhatsApp a XV años, eventos corporativos y celebraciones grandes: lista, lugares y tono distinto al de una boda.",
    datePublished: "2026-08-26",
    kicker: "Otros eventos",
    intro:
      "Alanna Confirmaciones nació para wedding planners, pero el trabajo de confirmar es el mismo en un XV, una renovación de votos o un evento de empresa: lista, mensaje, respuesta, número final.",
    sections: [
      {
        heading: "Qué cambia respecto a una boda",
        paragraphs: [
          "En XV años hay más adolescentes, más familias que responden por varios y a veces un padrino que paga parte de la lista. El responsable de la invitación sigue siendo un adulto con teléfono, no el cumpleañero.",
          "En eventos de empresa el tono es más corto y el corte más duro: el menú se cierra en una fecha y punto. El WhatsApp sigue siendo el canal con más respuesta en México.",
        ],
      },
      {
        heading: "Misma operación, otro guion",
        paragraphs: [
          "No recicles el mensaje de boda. Di el nombre del festejado, el recinto y cuántos lugares hay. Pregunta asistencia y número de personas. Si hay dress code o mesa de regalos, un segundo mensaje basta.",
          "Separa eventos en el tablero. Mezclar la boda de octubre con el XV de noviembre es la forma más rápida de mandar el saludo equivocado.",
        ],
      },
      {
        heading: "Un estudio, varios tipos de fecha",
        paragraphs: [
          "Si tu temporada mezcla bodas y sociales, elige un plan por volumen de eventos e invitados, no por ‘tipo de fiesta’. La herramienta es la misma: importar, confirmar por WhatsApp y exportar lista final.",
        ],
      },
    ],
  },
];

export function getArticle(slug: string) {
  return blogArticles.find((article) => article.slug === slug);
}
