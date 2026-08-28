import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Bot, Eye, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEvent, useStore } from "@/lib/mock/store";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api/client";
import { botApi } from "@/lib/api/bot";
import { BotPlayground } from "@/components/bot-playground";
import type { FollowUpRule } from "@/lib/mock/types";

export const Route = createFileRoute("/eventos/$eventId/automatizacion")({
  head: () => ({
    meta: [
      { title: "Asistente de Confirmaciones · Alanna" },
      {
        name: "description",
        content:
          "Configura la personalidad, las reglas y el seguimiento del asistente.",
      },
      { property: "og:title", content: "Asistente de Confirmaciones · Alanna" },
      {
        property: "og:description",
        content: "Personalidad, instrucciones extra y reglas de seguimiento.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Automatizacion,
});

const tones = [
  "Elegante",
  "Casual",
  "Amable",
  "Cercano",
  "Formal",
  "Divertido",
];

type AiRuleDefault = { text: string; technical: boolean };

type AiDefaults = {
  tone: string;
  formality: number;
  emojis: string;
  length: string;
  prompt: string;
  rules: AiRuleDefault[];
};
const FOLLOW_UP_DAYS_MIN = 1;
const FOLLOW_UP_DAYS_MAX = 180;

const FOLLOW_UP_DESCRIPTIONS = {
  f1: "Es la invitación inicial. No se envía sola: la lanzas desde Resumen.",
  f2: "Este solo se manda si el invitado ya recibió el primer contacto y todavía no confirma ni declina.",
  f3: "Se manda si, después del primer recordatorio, el invitado sigue sin confirmar ni declinar.",
  f4: "Último recordatorio automático antes del evento, solo a quien aún no tiene RSVP.",
  indeciso:
    "Cuando el invitado pospone la confirmación (luego te digo), el bot agenda este recontacto. Usa la plantilla Seguimiento.",
} as const;

type FollowUpFrom = "eventDate" | "contactedAt" | "seguimiento";

function isLaunchFollowUpRule(rule: FollowUpRule) {
  return rule.id === "f1" || /primer contacto/i.test(rule.label);
}

function followUpFrom(rule: FollowUpRule): FollowUpFrom {
  const when = String(rule.when || "");
  if (
    rule.id === "indeciso" ||
    /indeciso|recontacto/i.test(rule.label) ||
    /marcar seguimiento|del seguimiento/i.test(when)
  ) {
    return "seguimiento";
  }
  if (
    rule.id === "f2" ||
    rule.id === "f3" ||
    /después del primer contacto/i.test(when)
  )
    return "contactedAt";
  return "eventDate";
}

function followUpAnchor(from: FollowUpFrom) {
  if (from === "contactedAt") return "después del primer contacto";
  if (from === "seguimiento") return "después de marcar seguimiento";
  return "antes del evento";
}

function formatFollowUpWhen(days: number, from: FollowUpFrom) {
  const unit = days === 1 ? "día" : "días";
  return `${days} ${unit} ${followUpAnchor(from)}`;
}

function clampFollowUpDays(raw: string | number) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return FOLLOW_UP_DAYS_MIN;
  return Math.min(FOLLOW_UP_DAYS_MAX, Math.max(FOLLOW_UP_DAYS_MIN, n));
}

function ruleDays(rule: FollowUpRule) {
  if (Number.isFinite(Number(rule.days)))
    return clampFollowUpDays(Number(rule.days));
  const match = String(rule.when || "").match(/(\d+)/);
  return match?.[1] != null ? clampFollowUpDays(match[1]) : FOLLOW_UP_DAYS_MIN;
}

function withFollowUpDays(
  rule: FollowUpRule,
  days = ruleDays(rule),
): FollowUpRule {
  const from = followUpFrom(rule);
  return {
    ...rule,
    description: followUpDescription(rule),
    days,
    when: formatFollowUpWhen(days, from),
  };
}

function followUpDescription(rule: FollowUpRule): string {
  const custom = String(rule.description || "").trim();
  if (custom) return custom;
  if (rule.id in FOLLOW_UP_DESCRIPTIONS) {
    return FOLLOW_UP_DESCRIPTIONS[
      rule.id as keyof typeof FOLLOW_UP_DESCRIPTIONS
    ];
  }
  if (/indeciso|recontacto/i.test(rule.label))
    return FOLLOW_UP_DESCRIPTIONS.indeciso;
  if (/primer contacto/i.test(rule.label)) return FOLLOW_UP_DESCRIPTIONS.f1;
  return "";
}

function indecisoDays(followUps: FollowUpRule[]) {
  const rule = followUps.find(
    (item) => item.id === "indeciso" || /indeciso|recontacto/i.test(item.label),
  );
  return rule ? ruleDays(rule) : 3;
}

function Automatizacion() {
  const { eventId } = Route.useParams();
  const { data, guests } = useEvent(eventId);
  const { updateAI, resetAI } = useStore();
  const ai = data.ai;
  const [extras, setExtras] = useState(ai.prompt || "");
  const [newRule, setNewRule] = useState("");
  const [daysDraft, setDaysDraft] = useState<Record<string, string>>({});
  const [devBot, setDevBot] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [promptGuest, setPromptGuest] = useState("");
  const [promptLoading, setPromptLoading] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [aiDefaults, setAiDefaults] = useState<AiDefaults | null>(null);

  const technicalRules = useMemo(
    () =>
      new Set(
        (aiDefaults?.rules ?? [])
          .filter((rule) => rule.technical)
          .map((rule) => rule.text),
      ),
    [aiDefaults],
  );
  const defaultRules = useMemo(
    () => new Set((aiDefaults?.rules ?? []).map((rule) => rule.text)),
    [aiDefaults],
  );

  const visibleRules = useMemo(
    () =>
      ai.rules
        .map((rule, index) => ({ rule, index }))
        .filter(({ rule }) => !technicalRules.has(rule)),
    [ai.rules, technicalRules],
  );

  useEffect(() => {
    setExtras(ai.prompt || "");
  }, [ai.prompt]);

  useEffect(() => {
    let cancelled = false;
    botApi.status().then((res) => {
      if (!cancelled) setDevBot(Boolean(res.enabled));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<AiDefaults>(`/events/${eventId}/ai-config/defaults`)
      .then((res) => {
        if (!cancelled) setAiDefaults(res);
      })
      .catch(() => {
        if (!cancelled) setAiDefaults(null);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  const openPromptPreview = async () => {
    setPromptLoading(true);
    setPromptOpen(true);
    try {
      const guestId = guests[0]?.id;
      const res = await botApi.getPromptPreview(eventId, guestId);
      setPromptText(res.instructions || "");
      setPromptGuest(res.guestName || "");
    } catch (error) {
      setPromptOpen(false);
      toast.error(
        error instanceof Error ? error.message : "No se pudo cargar el prompt",
      );
    } finally {
      setPromptLoading(false);
    }
  };

  const commitFollowUpDays = (rule: FollowUpRule, raw: string) => {
    const days = clampFollowUpDays(raw);
    setDaysDraft((draft) => {
      const next = { ...draft };
      delete next[rule.id];
      return next;
    });
    const nextRule = withFollowUpDays(rule, days);
    if (
      nextRule.days === ruleDays(rule) &&
      nextRule.when === rule.when &&
      rule.days != null
    )
      return;
    updateAI(eventId, {
      followUps: ai.followUps.map((item) =>
        item.id === rule.id ? nextRule : withFollowUpDays(item),
      ),
    });
  };

  const nudgeDays = indecisoDays(ai.followUps);

  return (
    <main className="mx-auto grid w-full max-w-7xl flex-1 gap-6 px-5 py-8 md:px-8 lg:grid-cols-[1.35fr_1fr]">
      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="flex items-center gap-2">
            <Bot className="size-5 text-gold" />
            <h2 className="font-display text-2xl">
              Personalidad del asistente
            </h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Estos ajustes se aplican en cada conversación.
          </p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Nombre del asistente</Label>
              <Input
                value={ai.assistantName}
                onChange={(e) =>
                  updateAI(eventId, { assistantName: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Tono</Label>
              <Select
                value={ai.tone}
                onValueChange={(v) => updateAI(eventId, { tone: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tones.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3 sm:col-span-2">
              <div className="flex justify-between">
                <Label>Nivel de formalidad</Label>
                <span className="text-xs text-muted-foreground">
                  {ai.formality}%
                </span>
              </div>
              <Slider
                value={[ai.formality]}
                max={100}
                step={5}
                onValueChange={([v]) =>
                  updateAI(eventId, { formality: v ?? 50 })
                }
              />
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Muy cercano</span>
                <span>Muy formal</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Uso de emojis</Label>
              <Select
                value={ai.emojis}
                onValueChange={(v) =>
                  updateAI(eventId, { emojis: v as typeof ai.emojis })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ninguno">Ninguno</SelectItem>
                  <SelectItem value="algunos">Algunos</SelectItem>
                  <SelectItem value="frecuentes">Frecuentes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Longitud de mensajes</Label>
              <Select
                value={ai.length}
                onValueChange={(v) =>
                  updateAI(eventId, { length: v as typeof ai.length })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cortos">Cortos</SelectItem>
                  <SelectItem value="normales">Normales</SelectItem>
                  <SelectItem value="detallados">Detallados</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl">Reglas de conversación</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Puedes añadir instrucciones propias. Las reglas del sistema del
                bot no se muestran ni se pueden borrar.
              </p>
            </div>
          </div>
          <ul className="mt-4 space-y-2">
            {visibleRules.map(({ rule, index }) => {
              const locked = !aiDefaults || defaultRules.has(rule);
              return (
                <li
                  key={`${index}-${rule}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm"
                >
                  <span className="text-gold">•</span>
                  <span className="flex-1">{rule}</span>
                  {locked ? null : (
                    <button
                      type="button"
                      aria-label="Eliminar regla"
                      onClick={() =>
                        updateAI(eventId, {
                          rules: ai.rules.filter((_, j) => j !== index),
                        })
                      }
                      className="text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex gap-2">
            <Input
              value={newRule}
              onChange={(e) => setNewRule(e.target.value)}
              placeholder="Agregar instrucción…"
            />
            <Button
              variant="outline"
              onClick={() => {
                if (!newRule.trim()) return;
                updateAI(eventId, { rules: [...ai.rules, newRule.trim()] });
                setNewRule("");
              }}
            >
              <Plus className="size-4" />
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <h2 className="font-display text-2xl">Reglas de seguimiento</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Recordatorios y el recontacto a indecisos.
          </p>
          <div className="mt-4 space-y-3">
            {ai.followUps.filter((f) => !isLaunchFollowUpRule(f)).map((f) => {
              const from = followUpFrom(f);
              const description = followUpDescription(f);
              return (
                <div
                  key={f.id}
                  className="flex flex-col gap-3 rounded-xl border border-border p-3 sm:flex-row sm:items-center"
                >
                  <div className="flex-1 space-y-2">
                    <div>
                      <p className="text-sm font-medium">{f.label}</p>
                      {description ? (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {description}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={FOLLOW_UP_DAYS_MIN}
                        max={FOLLOW_UP_DAYS_MAX}
                        inputMode="numeric"
                        className="h-8 w-20"
                        aria-label={`Días para ${f.label}`}
                        value={daysDraft[f.id] ?? String(ruleDays(f))}
                        onChange={(e) =>
                          setDaysDraft((draft) => ({
                            ...draft,
                            [f.id]: e.target.value,
                          }))
                        }
                        onBlur={(e) => commitFollowUpDays(f, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter")
                            (e.target as HTMLInputElement).blur();
                        }}
                      />
                      <p className="text-xs text-muted-foreground">
                        {clampFollowUpDays(daysDraft[f.id] ?? ruleDays(f)) === 1
                          ? "día"
                          : "días"}{" "}
                        {followUpAnchor(from)}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={f.active}
                    onCheckedChange={(c) =>
                      updateAI(eventId, {
                        followUps: ai.followUps.map((x) =>
                          x.id === f.id
                            ? { ...withFollowUpDays(x), active: c }
                            : withFollowUpDays(x),
                        ),
                      })
                    }
                  />
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <h2 className="font-display text-2xl">Instrucciones extra</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            El flujo de confirmación no se edita aquí. Añade solo matices de
            este evento; se agregan al final del prompt del sistema.
          </p>
          <Textarea
            value={extras}
            onChange={(e) => setExtras(e.target.value)}
            rows={8}
            placeholder="Ej. Hay valet parking. No hables de la mesa de regalos a menos que pregunten."
            className="mt-4 font-sans text-sm leading-relaxed"
          />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <Button
              onClick={() => {
                updateAI(eventId, { prompt: extras });
                toast.success("Instrucciones extra guardadas");
              }}
            >
              <Save className="size-4" /> Guardar instrucciones
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setResetOpen(true)}
            >
              <RotateCcw className="size-4" /> Restablecer configuración
            </Button>
          </div>        </section>
      </div>

      <aside className="space-y-4">
        <div className="sticky top-6 space-y-4">
          {devBot ? (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <Bot className="size-4 text-gold" />
                    <h3 className="font-display text-xl">Probar bot</h3>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Solo en desarrollo. Arranca con la invitación inicial ya
                    enviada; tú respondes como el invitado. Sin WhatsApp.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={promptLoading}
                  onClick={() => void openPromptPreview()}
                >
                  <Eye className="size-4" /> Ver prompt
                </Button>
              </div>
              <div className="mt-4">
                <BotPlayground eventId={eventId} guests={guests} />
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <h3 className="font-display text-xl">Flujo de confirmación</h3>
            <ol className="mt-3 space-y-3 text-sm">
              {[
                "Mensaje inicial enviado",
                "El invitado responde",
                "El asistente clasifica: FAQ, sí, no, indeciso o desconocido",
                "FAQ: responde con la información cargada o escala",
                "Sí / no: actualiza el RSVP y envía la plantilla",
                "Indeciso: agenda recontacto a " +
                  (nudgeDays === 1 ? "1 día" : `${nudgeDays} días`),
              ].map((s, i) => (
                <li key={s} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold">
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground">{s}</span>
                </li>
              ))}
            </ol>
            <Badge
              variant="outline"
              className="mt-4 rounded-full bg-warning-soft text-warning"
            >
              Indeciso → seguimiento a{" "}
              {nudgeDays === 1 ? "1 día" : `${nudgeDays} días`}
            </Badge>
          </div>
        </div>
      </aside>

      <Dialog open={promptOpen} onOpenChange={setPromptOpen}>
        <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-3 overflow-hidden">
          <DialogHeader>
            <DialogTitle>Prompt final del asistente</DialogTitle>
            <DialogDescription>
              {promptGuest
                ? `Así se arma el cerebro para ${promptGuest} (personalidad, reglas, extras, plantillas y FAQs).`
                : "Así se arma el cerebro en cada turno."}
            </DialogDescription>
          </DialogHeader>
          <pre className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-secondary/40 p-4 font-sans text-xs leading-relaxed whitespace-pre-wrap">
            {promptLoading ? "Cargando…" : promptText || "Sin contenido."}
          </pre>
        </DialogContent>
      </Dialog>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Restablecer configuración del asistente?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se restaurarán el tono, las reglas de conversación y las
              instrucciones extra a los valores por defecto. El nombre del
              asistente y las reglas de seguimiento no cambian.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={resetting}
              onClick={async (e) => {
                e.preventDefault();
                setResetting(true);
                try {
                  await resetAI(eventId);
                  setExtras("");
                  setNewRule("");
                  setResetOpen(false);
                  toast.success("Configuración restablecida");
                } catch (err) {
                  toast.error(
                    err instanceof ApiError
                      ? err.message
                      : "No se pudo restablecer la configuración",
                  );
                } finally {
                  setResetting(false);
                }
              }}
            >
              {resetting ? "Restableciendo…" : "Restablecer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
