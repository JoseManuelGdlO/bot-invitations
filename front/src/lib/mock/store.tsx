import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  activity as seedActivity,
  buildConversations,
  buildEventData,
  buildGuests,
  events as seedEvents,
} from "./data";
import type {
  ActivityItem,
  ChatMessage,
  ConfirmationStatus,
  Conversation,
  EventData,
  EventItem,
  Guest,
} from "./types";

interface State {
  session: { email: string; name: string; role: string } | null;
  events: EventItem[];
  guests: Guest[];
  conversations: Conversation[];
  data: Record<string, EventData>;
  activity: ActivityItem[];
}

function initialState(): State {
  const guests = buildGuests();
  return {
    session: null,
    events: seedEvents,
    guests,
    conversations: buildConversations(guests),
    data: buildEventData(),
    activity: seedActivity,
  };
}

const KEY = "wp-confirm-store-v1";

interface Ctx extends State {
  hydrated: boolean;
  login: (email: string) => void;
  logout: () => void;
  addEvent: (e: EventItem) => void;
  updateEvent: (id: string, patch: Partial<EventItem>) => void;
  updateGuest: (id: string, patch: Partial<Guest>) => void;
  importGuests: (eventId: string, rows: Guest[]) => void;
  updateAI: (eventId: string, patch: Partial<EventData["ai"]>) => void;
  setTemplates: (eventId: string, t: EventData["templates"]) => void;
  setFaqs: (eventId: string, f: EventData["faqs"]) => void;
  sendMessage: (convId: string, msg: ChatMessage) => void;
  toggleAI: (convId: string, paused: boolean) => void;
  logActivity: (item: ActivityItem) => void;
  launchCampaign: (eventId: string) => void;
}

const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(initialState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setState((s) => ({ ...s, ...(JSON.parse(raw) as State) }));
    } catch {
      /* noop */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* noop */
    }
  }, [state, hydrated]);

  const patch = useCallback((fn: (s: State) => State) => setState(fn), []);

  const value = useMemo<Ctx>(
    () => ({
      ...state,
      hydrated,
      login: (email) =>
        patch((s) => ({
          ...s,
          session: {
            email,
            name: "Jose Manuel Garcia",
            role: "Wedding Planner",
          },
        })),
      logout: () => patch((s) => ({ ...s, session: null })),
      addEvent: (e) => patch((s) => ({ ...s, events: [e, ...s.events], data: { ...s.data, [e.id]: buildEventData()["andrea-carlos"]! } })),
      updateEvent: (id, p) =>
        patch((s) => ({ ...s, events: s.events.map((e) => (e.id === id ? { ...e, ...p } : e)) })),
      updateGuest: (id, p) =>
        patch((s) => ({ ...s, guests: s.guests.map((g) => (g.id === id ? { ...g, ...p } : g)) })),
      importGuests: (eventId, rows) =>
        patch((s) => ({ ...s, guests: [...s.guests.filter((g) => g.eventId !== eventId || true), ...rows] })),
      updateAI: (eventId, p) =>
        patch((s) => ({
          ...s,
          data: { ...s.data, [eventId]: { ...s.data[eventId]!, ai: { ...s.data[eventId]!.ai, ...p } } },
        })),
      setTemplates: (eventId, t) =>
        patch((s) => ({ ...s, data: { ...s.data, [eventId]: { ...s.data[eventId]!, templates: t } } })),
      setFaqs: (eventId, f) =>
        patch((s) => ({ ...s, data: { ...s.data, [eventId]: { ...s.data[eventId]!, faqs: f } } })),
      sendMessage: (convId, msg) =>
        patch((s) => ({
          ...s,
          conversations: s.conversations.map((c) =>
            c.id === convId ? { ...c, unread: 0, messages: [...c.messages, msg] } : c,
          ),
        })),
      toggleAI: (convId, paused) =>
        patch((s) => ({
          ...s,
          conversations: s.conversations.map((c) => (c.id === convId ? { ...c, aiPaused: paused } : c)),
        })),
      logActivity: (item) => patch((s) => ({ ...s, activity: [item, ...s.activity].slice(0, 30) })),
      launchCampaign: (eventId) =>
        patch((s) => ({
          ...s,
          guests: s.guests.map((g) =>
            g.eventId === eventId && g.status === "sin_contactar"
              ? { ...g, status: "enviado" as ConfirmationStatus, whatsapp: "enviado", lastMessage: "Mensaje inicial · hoy" }
              : g,
          ),
        })),
    }),
    [state, patch, hydrated],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore debe usarse dentro de StoreProvider");
  return ctx;
}

export function useEvent(eventId: string) {
  const s = useStore();
  const event = s.events.find((e) => e.id === eventId);
  const guests = useMemo(() => s.guests.filter((g) => g.eventId === eventId), [s.guests, eventId]);
  const conversations = useMemo(
    () => s.conversations.filter((c) => c.eventId === eventId),
    [s.conversations, eventId],
  );
  const data = s.data[eventId] ?? Object.values(s.data)[0]!;
  return { event, guests, conversations, data };
}

export function statsFor(guests: Guest[]) {
  const invitations = guests.length;
  const people = guests.reduce((a, g) => a + g.invited, 0);
  const confirmedPeople = guests.reduce((a, g) => a + g.confirmed, 0);
  const confirmed = guests.filter((g) => g.status === "confirmado").length;
  const partial = guests.filter((g) => g.status === "parcial").length;
  const rejected = guests.filter((g) => g.status === "no_asistira");
  const rejectedPeople = rejected.reduce((a, g) => a + g.invited, 0);
  const noReply = guests.filter((g) => ["sin_respuesta", "enviado", "entregado", "sin_contactar"].includes(g.status));
  const pending = guests.filter((g) => ["seguimiento", "respondio", "en_conversacion"].includes(g.status));
  const active = guests.filter((g) => g.status === "en_conversacion").length;
  const responded = guests.filter((g) => g.whatsapp === "respondido").length;
  return {
    invitations,
    people,
    confirmedPeople,
    confirmed: confirmed + partial,
    partial,
    rejected: rejected.length,
    rejectedPeople,
    noReply: noReply.length,
    pending: pending.length,
    active,
    progress: people ? Math.round((confirmedPeople / people) * 100) : 0,
    responseRate: invitations ? Math.round((responded / invitations) * 100) : 0,
  };
}
