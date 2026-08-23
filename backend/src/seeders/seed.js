import bcrypt from "bcryptjs";
import { Op } from "sequelize";
import {
  Activity,
  Conversation,
  Event,
  EventMember,
  Guest,
  Message,
  Plan,
  User,
  sequelize,
} from "../models/index.js";
import { seedEventDefaults } from "../services/event-setup.service.js";
import { ensurePlans } from "../services/plans.service.js";

let seed = 42;
function rnd() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
function pick(arr) {
  return arr[Math.floor(rnd() * arr.length)];
}
function int(min, max) {
  return min + Math.floor(rnd() * (max - min + 1));
}

const EVENT_DEFS = [
  {
    slug: "andrea-carlos",
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
    assistant: "Sofía",
    count: 26,
  },
  {
    slug: "mariana-diego",
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
    assistant: "Renata",
    count: 20,
  },
  {
    slug: "xv-sofia",
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
    assistant: "Valentina",
    count: 18,
  },
  {
    slug: "fernanda-luis",
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
    assistant: "Camila",
    count: 16,
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
const statusPool = [
  "confirmado","confirmado","confirmado","confirmado","parcial","no_asistira",
  "sin_respuesta","en_conversacion","enviado","entregado","respondio","seguimiento","sin_contactar",
];
const replies = {
  confirmado: ["Sí, ahí estaremos todos. ¡Gracias!", "Confirmados, contamos los días 🥂", "Claro que sí, asistimos completos."],
  parcial: ["Sí vamos, solamente seremos tres personas.", "Vamos dos nada más, mi hijo no podrá.", "Asistimos, pero seríamos uno menos."],
  no_asistira: ["Lamentablemente no podremos asistir.", "Gracias por la invitación, esa fecha estaremos fuera.", "No alcanzamos a llegar, mil disculpas."],
  respondio: ["Hola, sí recibí la invitación.", "Gracias, en un momento te confirmo."],
  en_conversacion: ["¿Los niños pueden asistir?", "¿A qué hora es la ceremonia?"],
  seguimiento: ["Todavía no sabemos, te aviso la próxima semana.", "Déjame confirmar con mi esposo."],
};

function phone(i) {
  return `+52 999 ${String(100 + (i % 800)).padStart(3, "0")} ${String(1000 + ((i * 37) % 8999))}`;
}

function makeGuestFields(eventSlug, i) {
  const rep = `${pick(firstNames)} ${pick(lastNames)}`;
  let status = statusPool[i % statusPool.length];
  if (eventSlug === "fernanda-luis") status = pick(["sin_contactar", "sin_contactar", "enviado", "entregado"]);
  const invited = int(1, 6);
  let confirmed = 0;
  if (status === "confirmado") confirmed = invited;
  else if (status === "parcial") confirmed = Math.max(1, invited - int(1, 2));
  const pool = replies[status] ?? [];
  const reply = pool.length ? pool[i % pool.length] : "";
  const day = int(1, 28);
  return {
    rep,
    phone: phone(i * 7 + eventSlug.length),
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
    followUp: status === "seguimiento" || status === "sin_respuesta" ? `${int(1, 28)}/08/2026` : "",
    confirmedAt: ["confirmado", "parcial"].includes(status) ? new Date(Date.now() - int(1, 20) * 86400000) : null,
    contactedAt: status === "sin_contactar" ? null : new Date(Date.now() - int(2, 30) * 86400000),
  };
}

async function seedConversations(event, guests) {
  const talking = guests.filter((g) => g.whatsapp === "respondido").slice(0, 22);
  let i = 0;
  for (const g of talking) {
    const conv = await Conversation.create({
      eventId: event.id,
      guestId: g.id,
      aiPaused: i === 3,
      unread: g.status === "en_conversacion" ? 1 : 0,
    });
    const first = g.rep.split(" ")[0] ?? g.rep;
    await Message.create({
      conversationId: conv.id,
      from: "ai",
      text: `Hola ${first} 👋 Soy Sofía, del equipo de los anfitriones. Estamos confirmando invitados y tenemos registrada una invitación para ${g.invited} personas. ¿Podrán acompañarnos?`,
      at: "10:12",
    });
    await Message.create({
      conversationId: conv.id,
      from: "guest",
      text: g.lastReply || "Hola, sí recibimos la invitación.",
      at: "10:31",
    });
    if (g.status === "confirmado") {
      await Message.create({
        conversationId: conv.id,
        from: "ai",
        text: `¡Perfecto ${first}! Entonces confirmamos ${g.invited} asistentes. Les esperamos con mucho gusto ✨`,
        at: "10:32",
      });
    } else if (g.status === "parcial") {
      await Message.create({
        conversationId: conv.id,
        from: "ai",
        text: `Gracias por avisar. Entonces confirmamos ${g.confirmed} asistentes de los ${g.invited} lugares reservados. ¿Es correcto?`,
        at: "10:33",
      });
      await Message.create({
        conversationId: conv.id,
        from: "guest",
        text: "Sí, así es 🙂",
        at: "10:40",
      });
    } else if (g.status === "no_asistira") {
      await Message.create({
        conversationId: conv.id,
        from: "ai",
        text: "Gracias por avisarnos, quedamos atentos por si algo cambia. ¡Un abrazo!",
        at: "11:02",
      });
    } else if (g.status === "seguimiento") {
      await Message.create({
        conversationId: conv.id,
        from: "ai",
        text: "Claro que sí, sin prisa. Te escribo de nuevo en unos días para confirmar 😊",
        at: "11:15",
      });
    } else if (g.status === "en_conversacion") {
      await Message.create({
        conversationId: conv.id,
        from: "ai",
        text: "Con gusto te comparto los detalles. ¿Hay algo más en lo que pueda ayudarte?",
        at: "11:20",
      });
    }
    i += 1;
  }
}

const TEAM = [
  ["Jose Manuel García", "Administrador", "JG", "hola@planner.mx"],
  ["Andrea Peña", "Wedding Planner", "AP", "andrea@planner.mx"],
  ["Luis Torres", "Coordinador", "LT", "luis@planner.mx"],
  ["Sara Ríos", "Asistente", "SR", "sara@planner.mx"],
];

try {
  await sequelize.authenticate();
  await ensurePlans();
  const atelier = await Plan.findOne({ where: { slug: "atelier" } });
  const existing = await User.findOne({ where: { email: "hola@planner.mx" } });
  if (existing) {
    if (atelier && !existing.planId) {
      existing.planId = atelier.id;
      await existing.save();
    }
    console.log("[seed] ya existe hola@planner.mx — no se duplica. Usa npm run db:reset para recrear.");
    process.exit(0);
  }

  const user = await User.create({
    name: "Jose Manuel Garcia",
    email: "hola@planner.mx",
    passwordHash: await bcrypt.hash("demo1234", 10),
    role: "Wedding Planner",
    planId: atelier?.id ?? null,
    subscriptionStatus: "active",
  });

  const createdEvents = [];
  for (const def of EVENT_DEFS) {
    const event = await Event.create({
      ownerId: user.id,
      slug: def.slug,
      name: def.name,
      shortName: def.shortName,
      type: def.type,
      hosts: def.hosts,
      date: def.date,
      time: def.time,
      venue: def.venue,
      address: def.address,
      estimatedGuests: def.estimatedGuests,
      cover: def.cover,
      status: def.status,
    });
    await seedEventDefaults(event, user, def.assistant);
    createdEvents.push({ event, def });
  }

  const andrea = createdEvents[0].event;
  for (const [name, role, initials, email] of TEAM) {
    const already = await EventMember.findOne({
      where: { eventId: andrea.id, [Op.or]: [{ email }, { name }] },
    });
    if (!already) {
      await EventMember.create({
        eventId: andrea.id,
        userId: email === user.email ? user.id : null,
        name,
        email,
        role,
        initials,
      });
    }
  }

  for (const { event, def } of createdEvents) {
    const guests = [];
    for (let i = 0; i < def.count; i++) {
      guests.push(await Guest.create({ eventId: event.id, ...makeGuestFields(def.slug, i) }));
    }
    if (def.slug === "andrea-carlos" && guests[0]) {
      const hero = guests[0];
      hero.rep = "María González";
      hero.phone = "+52 999 123 4567";
      hero.invited = 4;
      hero.confirmed = 3;
      hero.status = "parcial";
      hero.whatsapp = "respondido";
      hero.lastReply = "Sí vamos, solamente seremos tres personas.";
      hero.family = "González";
      hero.table = "Mesa 4";
      hero.confirmedAt = new Date();
      await hero.save();
    }
    await seedConversations(event, guests);
  }

  await Activity.bulkCreate([
    { eventId: andrea.id, text: "María González confirmó 3 de 4 lugares", kind: "confirm" },
    { eventId: andrea.id, text: "Sofía envió 18 recordatorios automáticos", kind: "message" },
    { eventId: createdEvents[1].event.id, text: "Familia Herrera no podrá asistir", kind: "reject" },
    { eventId: createdEvents[2].event.id, text: "Se importaron 18 invitaciones desde Excel", kind: "system" },
    { eventId: createdEvents[1].event.id, text: "Renata confirmó 2 asistentes", kind: "confirm" },
    { eventId: andrea.id, text: "Conversación con Pablo Ortega escalada al equipo", kind: "system" },
    { eventId: createdEvents[2].event.id, text: "Se programó seguimiento para 6 invitaciones", kind: "message" },
  ]);

  console.log("[seed] listo. Usuario: hola@planner.mx / demo1234");
  process.exit(0);
} catch (err) {
  console.error("[seed] error", err);
  process.exit(1);
}
