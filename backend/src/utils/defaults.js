export const DEFAULT_ROLES = [
  { role: "Administrador", perms: ["Crear eventos", "Editar todo", "Gestionar equipo", "Exportar datos"] },
  { role: "Wedding Planner", perms: ["Editar evento", "Configurar asistente", "Responder conversaciones", "Exportar datos"] },
  { role: "Coordinador", perms: ["Ver invitados", "Responder conversaciones", "Registrar confirmaciones"] },
  { role: "Asistente", perms: ["Ver invitados", "Ver conversaciones"] },
];

export function defaultAI(assistant, hosts) {
  return {
    assistantName: assistant,
    tone: "Elegante",
    formality: 60,
    emojis: "algunos",
    length: "normales",
    openingMessage: `Hola {{nombre}} 👋\n\nSoy ${assistant}, asistente del equipo de ${hosts}.\n\nEstamos confirmando los invitados para {{evento}} del próximo {{fecha}} en {{lugar}}.\n\nTenemos registrada una invitación para {{numero_invitados}} personas.\n\n¿Nos podrías confirmar si podrán acompañarnos?`,
    rules: [
      "Nunca mencionar que eres una IA.",
      "Siempre ser amable y cálida.",
      "Nunca presionar al invitado.",
      "Preguntar cuántas personas asistirán.",
      "No superar el número máximo de invitados de la invitación.",
      "Confirmar nuevamente el número final antes de cerrar.",
      "Si existe una situación especial, escalar al Wedding Planner.",
    ],
    followUps: [
      { id: "f1", label: "Primer contacto", when: "30 días antes del evento", active: true },
      { id: "f2", label: "Primer recordatorio", when: "7 días después del primer contacto", active: true },
      { id: "f3", label: "Segundo recordatorio", when: "14 días después del primer contacto", active: true },
      { id: "f4", label: "Último intento", when: "7 días antes del evento", active: false },
    ],
  };
}

export function defaultTemplates(hosts) {
  return [
    { category: "Primer contacto", title: "Invitación inicial", body: `Hola {{nombre}}, soy el equipo de ${hosts}. Estamos confirmando asistencia para {{evento}} el {{fecha}}. ¿Podrán acompañarnos?` },
    { category: "Recordatorio", title: "Recordatorio amable", body: "Hola {{nombre}}, ¿pudiste revisar la invitación? Nos encantaría contar contigo el {{fecha}} ✨" },
    { category: "Confirmación", title: "Cierre de confirmación", body: "Perfecto {{nombre}}, entonces confirmamos {{numero_confirmados}} asistentes. ¡Nos vemos el {{fecha}}!" },
    { category: "Rechazo", title: "Respuesta a rechazo", body: "Gracias por avisarnos, {{nombre}}. Te vamos a extrañar, mandamos un abrazo grande." },
    { category: "Información del evento", title: "Detalles generales", body: "La celebración es el {{fecha}} a las {{hora}} en {{lugar}}. Recomendamos llegar 30 minutos antes." },
    { category: "Ubicación", title: "Cómo llegar", body: "Te comparto la ubicación de {{lugar}}. Habrá valet parking disponible desde las {{hora}}." },
    { category: "Dress code", title: "Código de vestimenta", body: "El código de vestimenta es formal. Sugerimos calzado cómodo para jardín." },
    { category: "Agradecimiento", title: "Gracias por confirmar", body: "¡Gracias {{nombre}}! Quedó registrada tu confirmación. Cualquier cambio, avísanos por aquí." },
  ];
}

export function defaultFaqs(venue) {
  return [
    { q: "¿Dónde es la boda?", a: `${venue}.` },
    { q: "¿Pueden ir niños?", a: "El evento está planeado únicamente para adultos." },
    { q: "¿Cuál es el código de vestimenta?", a: "Formal." },
    { q: "¿Hay estacionamiento?", a: "Sí, contamos con valet parking sin costo." },
  ];
}

export function applyTemplate(text, vars) {
  return String(text || "").replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

export function eventGuestVars(event, guest, plannerName = "") {
  const nombreCompleto = String(guest?.rep || "").trim();
  const nombre = nombreCompleto.split(" ")[0] || nombreCompleto;
  const confirmados = String(guest?.confirmed ?? "");
  return {
    nombre,
    nombre_completo: nombreCompleto,
    numero_invitados: String(guest?.invited ?? ""),
    numero_confirmados: confirmados,
    confirmados,
    mesa: String(guest?.table || ""),
    evento: event?.name || "",
    fecha: event?.date || "",
    lugar: event?.venue || "",
    direccion: event?.address || "",
    hora: event?.time || "",
    planner: plannerName || "",
  };
}
