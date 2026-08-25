import type {
  ActivityItem,
  AIConfig,
  ConfirmationStatus,
  Conversation,
  EventData,
  EventItem,
  Guest,
} from "./types";

let seed = 42;
function rnd() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)]!;
}
function int(min: number, max: number) {
  return min + Math.floor(rnd() * (max - min + 1));
}

export const events: EventItem[] = [
  {
    id: "andrea-carlos",
    name: "Boda Andrea & Carlos",
    shortName: "A&C",
    type: "Boda",
    hosts: "Andrea Rivas & Carlos Medina",
    date: "2026-11-15",
    time: "18:00",
    venue: "Hacienda San José",
    address: "Carretera Mérida–Motul Km 12, Yucatán",
    estimatedGuests: 250,
    cover: "linear-gradient(135deg, var(--gold-soft), var(--rose))",
    status: "activo",
  },
  {
    id: "mariana-diego",
    name: "Boda Mariana & Diego",
    shortName: "M&D",
    type: "Boda",
    hosts: "Mariana Solís & Diego Ferrer",
    date: "2026-09-26",
    time: "17:30",
    venue: "Viñedo Santa Elena",
    address: "Ruta del Vino s/n, Valle de Guadalupe, BC",
    estimatedGuests: 180,
    cover: "linear-gradient(135deg, var(--success-soft), var(--gold-soft))",
    status: "activo",
  },
  {
    id: "xv-sofia",
    name: "XV Años Sofía",
    shortName: "XV S",
    type: "XV Años",
    hosts: "Familia Guzmán Torres",
    date: "2026-10-03",
    time: "20:00",
    venue: "Salón Versalles",
    address: "Av. Constituyentes 455, CDMX",
    estimatedGuests: 140,
    cover: "linear-gradient(135deg, var(--rose), var(--info-soft))",
    status: "activo",
  },
  {
    id: "fernanda-luis",
    name: "Boda Fernanda & Luis",
    shortName: "F&L",
    type: "Boda",
    hosts: "Fernanda Lara & Luis Cantú",
    date: "2027-02-20",
    time: "19:00",
    venue: "Casa Bosque",
    address: "Camino Real 210, San Pedro Garza García, NL",
    estimatedGuests: 200,
    cover: "linear-gradient(135deg, var(--info-soft), var(--gold-soft))",
    status: "borrador",
  },
];

const firstNames = [
  "María","Juan","Alejandra","Roberto","Paulina","Emilio","Regina","Santiago","Valeria","Héctor",
  "Ximena","Gerardo","Daniela","Ricardo","Camila","Andrés","Renata","Mauricio","Lucía","Fernando",
  "Isabela","Rodrigo","Carolina","Sergio","Mónica","Iván","Adriana","Pablo","Natalia","Óscar",
];
const lastNames = [
  "González","Pérez","Ramírez","Herrera","Vázquez","Cantú","Solís","Escobedo","Navarro","Zamora",
  "Peña","Aguilar","Cervantes","Domínguez","Fuentes","Lozano","Miranda","Ortega","Quintero","Salazar",
];
const guestTypes = ["Familia", "Amigos", "Trabajo", "Padrinos", "Familia política"];
const tags = ["VIP", "Hospedaje", "Foráneo", "Mesa principal", "Sin etiqueta"];

const statusPool: ConfirmationStatus[] = [
  "confirmado","confirmado","confirmado","confirmado","parcial","no_asistira",
  "sin_respuesta","en_conversacion","enviado","entregado","respondio","seguimiento","sin_contactar",
];

const replies: Record<string, string[]> = {
  confirmado: ["Sí, ahí estaremos todos. ¡Gracias!", "Confirmados, contamos los días 🥂", "Claro que sí, asistimos completos."],
  parcial: ["Sí vamos, solamente seremos tres personas.", "Vamos dos nada más, mi hijo no podrá.", "Asistimos, pero seríamos uno menos."],
  no_asistira: ["Lamentablemente no podremos asistir.", "Gracias por la invitación, esa fecha estaremos fuera.", "No alcanzamos a llegar, mil disculpas."],
  respondio: ["Hola, sí recibí la invitación.", "Gracias, en un momento te confirmo."],
  en_conversacion: ["¿Los niños pueden asistir?", "¿A qué hora es la ceremonia?"],
  seguimiento: ["Todavía no sabemos, te aviso la próxima semana.", "Déjame confirmar con mi esposo."],
};

function phone(i: number) {
  return `+52 999 ${String(100 + (i % 800)).padStart(3, "0")} ${String(1000 + ((i * 37) % 8999))}`;
}

function makeGuest(eventId: string, i: number): Guest {
  const rep = `${pick(firstNames)} ${pick(lastNames)}`;
  let status = statusPool[i % statusPool.length]!;
  if (eventId === "fernanda-luis") status = pick(["sin_contactar", "sin_contactar", "enviado", "entregado"]);
  const invited = int(1, 6);
  let confirmed = 0;
  if (status === "confirmado") confirmed = invited;
  else if (status === "parcial") confirmed = Math.max(1, invited - int(1, 2));
  const pool = replies[status] ?? [];
  const reply = pool.length ? pool[i % pool.length]! : "";
  const day = int(1, 28);
  return {
    id: `${eventId}-g${i}`,
    eventId,
    rep,
    phone: phone(i * 7 + eventId.length),
    invited,
    confirmed,
    table: `Mesa ${int(1, 22)}`,
    family: rep.split(" ")[1] ?? rep,
    guestType: pick(guestTypes),
    tag: pick(tags),
    notes: rnd() > 0.7 ? "Requiere menú vegetariano." : "",
    status,
    whatsapp:
      status === "sin_contactar"
        ? "pendiente"
        : status === "enviado"
          ? "enviado"
          : status === "entregado" || status === "sin_respuesta"
            ? "entregado"
            : "respondido",
    lastMessage: status === "sin_contactar" ? "" : `Mensaje inicial · ${day}/07`,
    lastReply: reply,
    lastReplyAt: reply ? `${day}/07 · ${int(9, 21)}:${String(int(10, 59))}` : "",
    followUp:
      status === "seguimiento" || status === "sin_respuesta" ? `${int(1, 28)}/08/2026` : "",
  };
}

export function buildGuests(): Guest[] {
  const counts: Record<string, number> = {
    "andrea-carlos": 26,
    "mariana-diego": 20,
    "xv-sofia": 18,
    "fernanda-luis": 16,
  };
  const all: Guest[] = [];
  for (const ev of events) {
    for (let i = 0; i < (counts[ev.id] ?? 0); i++) all.push(makeGuest(ev.id, i));
  }
  // Caso destacado del brief
  const hero = all.find((g) => g.eventId === "andrea-carlos");
  if (hero) {
    hero.rep = "María González";
    hero.phone = "+52 999 123 4567";
    hero.invited = 4;
    hero.confirmed = 3;
    hero.status = "parcial";
    hero.whatsapp = "respondido";
    hero.lastReply = "Sí vamos, solamente seremos tres personas.";
    hero.family = "González";
    hero.table = "Mesa 4";
  }
  return all;
}

const aiOpening = (assistant: string, hosts: string) =>
  `Hola {{nombre}} 👋\n\nSoy ${assistant}, asistente del equipo de ${hosts}.\n\nEstamos confirmando los invitados para {{evento}} del próximo {{fecha}} en {{lugar}}.\n\nTenemos registrada una invitación para {{numero_invitados}} personas.\n\n¿Nos podrías confirmar si podrán acompañarnos?`;

function defaultAI(assistant: string, hosts: string): AIConfig {
  return {
    assistantName: assistant,
    tone: "Elegante",
    formality: 60,
    emojis: "algunos",
    length: "normales",
    openingMessage: aiOpening(assistant, hosts),
    prompt: `Eres ${assistant}, asistente del equipo de ${hosts}. Confirmas asistencia por WhatsApp. Nunca digas que eres una IA.`,
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

const baseTemplates = (hosts: string) => [
  { id: "t1", category: "Primer contacto", title: "Invitación inicial", body: `Hola {{nombre}}, soy el equipo de ${hosts}. Estamos confirmando asistencia para {{evento}} el {{fecha}}. ¿Podrán acompañarnos?` },
  { id: "t2", category: "Recordatorio", title: "Recordatorio amable", body: "Hola {{nombre}}, ¿pudiste revisar la invitación? Nos encantaría contar contigo el {{fecha}} ✨" },
  { id: "t3", category: "Confirmación", title: "Cierre de confirmación", body: "Perfecto {{nombre}}, entonces confirmamos {{numero_confirmados}} asistentes. ¡Nos vemos el {{fecha}}!" },
  { id: "t4", category: "Rechazo", title: "Respuesta a rechazo", body: "Gracias por avisarnos, {{nombre}}. Te vamos a extrañar, mandamos un abrazo grande." },
  { id: "t5", category: "Información del evento", title: "Detalles generales", body: "La celebración es el {{fecha}} a las {{hora}} en {{lugar}}. Recomendamos llegar 30 minutos antes." },
  { id: "t6", category: "Ubicación", title: "Cómo llegar", body: "Te comparto la ubicación de {{lugar}}. Habrá valet parking disponible desde las {{hora}}." },
  { id: "t7", category: "Dress code", title: "Código de vestimenta", body: "El código de vestimenta es formal. Sugerimos calzado cómodo para jardín." },
  { id: "t8", category: "Agradecimiento", title: "Gracias por confirmar", body: "¡Gracias {{nombre}}! Quedó registrada tu confirmación. Cualquier cambio, avísanos por aquí." },
];

const baseFaqs = (venue: string) => [
  { id: "q1", q: "¿Dónde es la boda?", a: `${venue}.` },
  { id: "q2", q: "¿Pueden ir niños?", a: "El evento está planeado únicamente para adultos." },
  { id: "q3", q: "¿Cuál es el código de vestimenta?", a: "Formal." },
  { id: "q4", q: "¿Hay estacionamiento?", a: "Sí, contamos con valet parking sin costo." },
];

export function buildEventData(): Record<string, EventData> {
  const names = ["Sofía", "Renata", "Valentina", "Camila"];
  const data: Record<string, EventData> = {};
  events.forEach((ev, i) => {
    data[ev.id] = {
      ai: defaultAI(names[i] ?? "Sofía", ev.hosts),
      templates: baseTemplates(ev.hosts),
      faqs: baseFaqs(ev.venue),
    };
  });
  return data;
}

export function buildConversations(guests: Guest[]): Conversation[] {
  const talking = guests.filter((g) => g.whatsapp === "respondido").slice(0, 22);
  return talking.map((g, i) => {
    const msgs = [
      {
        id: `${g.id}-m1`,
        from: "ai" as const,
        text: `Hola ${(g.rep.split(" ")[0] ?? g.rep)} 👋 Soy Sofía, del equipo de los anfitriones. Estamos confirmando invitados y tenemos registrada una invitación para ${g.invited} personas. ¿Podrán acompañarnos?`,
        at: "10:12",
      },
      { id: `${g.id}-m2`, from: "guest" as const, text: g.lastReply || "Hola, sí recibimos la invitación.", at: "10:31" },
    ];
    if (g.status === "confirmado") {
      msgs.push({ id: `${g.id}-m3`, from: "ai", text: `¡Perfecto ${(g.rep.split(" ")[0] ?? g.rep)}! Entonces confirmamos ${g.invited} asistentes. Les esperamos con mucho gusto ✨`, at: "10:32" });
    } else if (g.status === "parcial") {
      msgs.push({ id: `${g.id}-m3`, from: "ai", text: `Gracias por avisar. Entonces confirmamos ${g.confirmed} asistentes de los ${g.invited} lugares reservados. ¿Es correcto?`, at: "10:33" });
      msgs.push({ id: `${g.id}-m4`, from: "guest", text: "Sí, así es 🙂", at: "10:40" });
    } else if (g.status === "no_asistira") {
      msgs.push({ id: `${g.id}-m3`, from: "ai", text: "Gracias por avisarnos, quedamos atentos por si algo cambia. ¡Un abrazo!", at: "11:02" });
    } else if (g.status === "seguimiento") {
      msgs.push({ id: `${g.id}-m3`, from: "ai", text: "Claro que sí, sin prisa. Te escribo de nuevo en unos días para confirmar 😊", at: "11:15" });
    } else if (g.status === "en_conversacion") {
      msgs.push({ id: `${g.id}-m3`, from: "ai", text: "Con gusto te comparto los detalles. ¿Hay algo más en lo que pueda ayudarte?", at: "11:20" });
    }
    return {
      id: `conv-${g.id}`,
      eventId: g.eventId,
      guestId: g.id,
      aiPaused: i === 3,
      unread: g.status === "en_conversacion" ? 1 : 0,
      messages: msgs,
    };
  });
}

export const activity: ActivityItem[] = [
  { id: "a1", eventId: "andrea-carlos", text: "María González confirmó 3 de 4 lugares", at: "hace 4 min", kind: "confirm" },
  { id: "a2", eventId: "andrea-carlos", text: "Sofía envió 18 recordatorios automáticos", at: "hace 26 min", kind: "message" },
  { id: "a3", eventId: "mariana-diego", text: "Familia Herrera no podrá asistir", at: "hace 1 h", kind: "reject" },
  { id: "a4", eventId: "xv-sofia", text: "Se importaron 18 invitaciones desde Excel", at: "hace 3 h", kind: "system" },
  { id: "a5", eventId: "mariana-diego", text: "Renata confirmó 2 asistentes", at: "hace 5 h", kind: "confirm" },
  { id: "a6", eventId: "andrea-carlos", text: "Conversación con Pablo Ortega escalada al equipo", at: "ayer", kind: "system" },
  { id: "a7", eventId: "xv-sofia", text: "Se programó seguimiento para 6 invitaciones", at: "ayer", kind: "message" },
];
