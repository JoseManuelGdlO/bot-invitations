import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, download, setToken } from "@/lib/api/client";
import type {
  ActivityItem,
  ChatMessage,
  ConfirmationStatus,
  Conversation,
  EventAnalytics,
  EventData,
  EventItem,
  Guest,
  ImportPreview,
  RolePermission,
  SessionUser,
  TeamMember,
} from "./types";

interface State {
  session: SessionUser | null;
  events: EventItem[];
  guests: Guest[];
  conversations: Conversation[];
  data: Record<string, EventData>;
  activity: ActivityItem[];
  members: Record<string, TeamMember[]>;
  rolePermissions: Record<string, RolePermission[]>;
  analytics: Record<string, EventAnalytics>;
}

const emptyState = (): State => ({
  session: null,
  events: [],
  guests: [],
  conversations: [],
  data: {},
  activity: [],
  members: {},
  rolePermissions: {},
  analytics: {},
});

interface DashboardPayload extends State {
  session: SessionUser;
}

interface Ctx extends State {
  hydrated: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<SessionUser>;
  register: (
    payload: {
      name: string;
      email: string;
      password: string;
      planId: string;
      phone: string;
      state: string;
      businessName: string;
      interval?: "month" | "year";
    },
  ) => Promise<{ checkoutUrl?: string | null }>;
  startCheckout: (
    planId: string,
    interval?: "month" | "year",
  ) => Promise<{ checkoutUrl?: string | null; updated?: boolean }>;
  openBillingPortal: () => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (token: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  addEvent: (e: EventItem) => Promise<EventItem>;
  updateEvent: (id: string, patch: Partial<EventItem>) => void;
  updateGuest: (id: string, patch: Partial<Guest>) => void;
  remindGuest: (id: string) => void;
  importGuests: (eventId: string, rows: Guest[]) => void;
  previewImport: (eventId: string, file: File) => Promise<ImportPreview>;
  confirmImport: (
    eventId: string,
    payload: { columns: string[]; rows: string[][]; mapping: Record<string, string> },
  ) => Promise<{ imported: number; skipped: number }>;
  exportGuests: (eventId: string, format: "xlsx" | "csv" | "pdf", kind?: "guests" | "final") => Promise<void>;
  updateAI: (eventId: string, patch: Partial<EventData["ai"]>) => void;
  setTemplates: (eventId: string, t: EventData["templates"]) => void;
  setFaqs: (eventId: string, f: EventData["faqs"]) => void;
  sendMessage: (convId: string, msg: ChatMessage) => void;
  toggleAI: (convId: string, paused: boolean) => void;
  logActivity: (item: ActivityItem) => void;
  launchCampaign: (eventId: string) => void;
  inviteMember: (eventId: string, payload: { name: string; email?: string; role: string }) => void;
  removeMember: (eventId: string, memberId: string) => void;
  updatePermission: (eventId: string, permissionId: string, enabled: boolean) => void;
}

const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(emptyState);
  const [hydrated, setHydrated] = useState(false);

  const applyDashboard = useCallback((payload: DashboardPayload) => {
    setState({
      session: payload.session,
      events: payload.events ?? [],
      guests: payload.guests ?? [],
      conversations: payload.conversations ?? [],
      data: payload.data ?? {},
      activity: payload.activity ?? [],
      members: payload.members ?? {},
      rolePermissions: payload.rolePermissions ?? {},
      analytics: payload.analytics ?? {},
    });
  }, []);

  const refresh = useCallback(async () => {
    const payload = await api<DashboardPayload>("/dashboard");
    applyDashboard(payload);
  }, [applyDashboard]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
      } catch {
        setToken(null);
        if (!cancelled) setState(emptyState());
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const afterAuth = async (res: { accessToken: string; user: SessionUser }) => {
    setToken(res.accessToken);
    await refresh();
  };

  const value = useMemo<Ctx>(
    () => ({
      ...state,
      hydrated,
      refresh,
      login: async (email, password, rememberMe) => {
        const res = await api<{ accessToken: string; user: SessionUser }>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password, rememberMe }),
        });
        await afterAuth(res);
        return res.user;
      },
      register: async (payload) => {
        const res = await api<{ accessToken: string; user: SessionUser; checkoutUrl?: string | null }>(
          "/auth/register",
          {
            method: "POST",
            body: JSON.stringify(payload),
          },
        );
        await afterAuth(res);
        return { checkoutUrl: res.checkoutUrl };
      },
      startCheckout: async (planId, interval = "month") => {
        return api<{ checkoutUrl?: string | null; updated?: boolean }>("/billing/checkout", {
          method: "POST",
          body: JSON.stringify({ planId, interval }),
        });
      },
      openBillingPortal: async () => {
        const res = await api<{ portalUrl: string }>("/billing/portal", { method: "POST" });
        if (res.portalUrl) window.location.href = res.portalUrl;
      },
      forgotPassword: async (email) => {
        await api("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
      },
      resetPassword: async (token, password) => {
        await api("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) });
      },
      logout: async () => {
        try {
          await api("/auth/logout", { method: "POST" });
        } catch {
          /* noop */
        }
        setToken(null);
        setState(emptyState());
      },
      addEvent: async (e) => {
        const created = await api<EventItem>("/events", {
          method: "POST",
          body: JSON.stringify(e),
        });
        await refresh();
        return created;
      },
      updateEvent: (id, patch) => {
        setState((s) => ({
          ...s,
          events: s.events.map((ev) => (ev.id === id ? { ...ev, ...patch } : ev)),
        }));
        api(`/events/${id}`, { method: "PATCH", body: JSON.stringify(patch) }).catch(console.error);
      },
      updateGuest: (id, patch) => {
        setState((s) => ({
          ...s,
          guests: s.guests.map((g) => (g.id === id ? { ...g, ...patch } : g)),
        }));
        api(`/guests/${id}`, { method: "PATCH", body: JSON.stringify(patch) }).catch(console.error);
      },
      remindGuest: (id) => {
        api<Guest>(`/guests/${id}/remind`, { method: "POST" })
          .then((guest) =>
            setState((s) => ({
              ...s,
              guests: s.guests.map((g) => (g.id === guest.id ? guest : g)),
            })),
          )
          .catch(console.error);
      },
      importGuests: (eventId, rows) => {
        setState((s) => ({ ...s, guests: [...s.guests, ...rows] }));
      },
      previewImport: (eventId, file) => {
        const body = new FormData();
        body.append("file", file);
        return api<ImportPreview>(`/events/${eventId}/guests/import/preview`, { method: "POST", body });
      },
      confirmImport: async (eventId, payload) => {
        const res = await api<{ imported: number; skipped: number }>(
          `/events/${eventId}/guests/import/confirm`,
          { method: "POST", body: JSON.stringify(payload) },
        );
        await refresh();
        return res;
      },
      exportGuests: async (eventId, format, kind = "guests") => {
        const path =
          kind === "final"
            ? `/events/${eventId}/final-list/export?format=${format}`
            : `/events/${eventId}/guests/export?format=${format}`;
        const name = kind === "final" ? `lista-final-${eventId}.${format}` : `invitados-${eventId}.${format}`;
        await download(path, name);
      },
      updateAI: (eventId, patch) => {
        setState((s) => ({
          ...s,
          data: {
            ...s.data,
            [eventId]: { ...s.data[eventId]!, ai: { ...s.data[eventId]!.ai, ...patch } },
          },
        }));
        api(`/events/${eventId}/ai-config`, { method: "PATCH", body: JSON.stringify(patch) }).catch(console.error);
      },
      setTemplates: (eventId, t) => {
        setState((s) => ({
          ...s,
          data: { ...s.data, [eventId]: { ...s.data[eventId]!, templates: t } },
        }));
        api(`/events/${eventId}/templates`, { method: "PUT", body: JSON.stringify(t) }).catch(console.error);
      },
      setFaqs: (eventId, f) => {
        setState((s) => ({
          ...s,
          data: { ...s.data, [eventId]: { ...s.data[eventId]!, faqs: f } },
        }));
        api(`/events/${eventId}/faqs`, { method: "PUT", body: JSON.stringify(f) }).catch(console.error);
      },
      sendMessage: (convId, msg) => {
        setState((s) => ({
          ...s,
          conversations: s.conversations.map((c) =>
            c.id === convId ? { ...c, unread: 0, messages: [...c.messages, msg] } : c,
          ),
        }));
        api<ChatMessage>(`/conversations/${convId}/messages`, {
          method: "POST",
          body: JSON.stringify({ text: msg.text, from: msg.from }),
        })
          .then((saved) =>
            setState((s) => ({
              ...s,
              conversations: s.conversations.map((c) =>
                c.id === convId
                  ? { ...c, messages: c.messages.map((m) => (m.id === msg.id ? saved : m)) }
                  : c,
              ),
            })),
          )
          .catch(console.error);
      },
      toggleAI: (convId, paused) => {
        setState((s) => ({
          ...s,
          conversations: s.conversations.map((c) => (c.id === convId ? { ...c, aiPaused: paused } : c)),
        }));
        api(`/conversations/${convId}`, {
          method: "PATCH",
          body: JSON.stringify({ aiPaused: paused }),
        }).catch(console.error);
      },
      logActivity: (item) => setState((s) => ({ ...s, activity: [item, ...s.activity].slice(0, 40) })),
      launchCampaign: (eventId) => {
        api(`/events/${eventId}/campaigns/launch`, { method: "POST" })
          .then(() => refresh())
          .catch(console.error);
      },
      inviteMember: (eventId, payload) => {
        api<TeamMember>(`/events/${eventId}/members`, {
          method: "POST",
          body: JSON.stringify(payload),
        })
          .then((member) =>
            setState((s) => ({
              ...s,
              members: { ...s.members, [eventId]: [...(s.members[eventId] ?? []), member] },
            })),
          )
          .catch(console.error);
      },
      removeMember: (eventId, memberId) => {
        setState((s) => ({
          ...s,
          members: { ...s.members, [eventId]: (s.members[eventId] ?? []).filter((m) => m.id !== memberId) },
        }));
        api(`/events/${eventId}/members/${memberId}`, { method: "DELETE" }).catch(console.error);
      },
      updatePermission: (eventId, permissionId, enabled) => {
        setState((s) => ({
          ...s,
          rolePermissions: {
            ...s.rolePermissions,
            [eventId]: (s.rolePermissions[eventId] ?? []).map((p) =>
              p.id === permissionId ? { ...p, enabled } : p,
            ),
          },
        }));
        api(`/events/${eventId}/role-permissions/${permissionId}`, {
          method: "PATCH",
          body: JSON.stringify({ enabled }),
        }).catch(console.error);
      },
    }),
    [state, hydrated, refresh],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore debe usarse dentro de StoreProvider");
  return ctx;
}

const fallbackData: EventData = {
  ai: {
    assistantName: "Sofía",
    tone: "Elegante",
    formality: 60,
    emojis: "algunos",
    length: "normales",
    openingMessage: "",
    rules: [],
    followUps: [],
  },
  templates: [],
  faqs: [],
};

export function useEvent(eventId: string) {
  const s = useStore();
  const event = s.events.find((e) => e.id === eventId);
  const guests = useMemo(() => s.guests.filter((g) => g.eventId === eventId), [s.guests, eventId]);
  const conversations = useMemo(
    () => s.conversations.filter((c) => c.eventId === eventId),
    [s.conversations, eventId],
  );
  const data = s.data[eventId] ?? fallbackData;
  const members = s.members[eventId] ?? [];
  const rolePermissions = s.rolePermissions[eventId] ?? [];
  const analytics = s.analytics[eventId];
  return { event, guests, conversations, data, members, rolePermissions, analytics };
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

export function initialsFrom(name?: string) {
  return (name || "")
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
