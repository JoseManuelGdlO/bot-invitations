import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bot, Eye, Plus, Save, Trash2 } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEvent, useStore } from "@/lib/mock/store";
import { toast } from "sonner";
import { botApi } from "@/lib/api/bot";
import { BotPlayground } from "@/components/bot-playground";

export const Route = createFileRoute("/eventos/$eventId/automatizacion")({
  head: () => ({
    meta: [
      { title: "Asistente de Confirmaciones · Alanna" },
      { name: "description", content: "Configura la personalidad, las reglas y el seguimiento del asistente." },
      { property: "og:title", content: "Asistente de Confirmaciones · Alanna" },
      { property: "og:description", content: "Personalidad, instrucciones extra y reglas de seguimiento." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Automatizacion,
});

const tones = ["Elegante", "Casual", "Amable", "Cercano", "Formal", "Divertido"];

function Automatizacion() {
  const { eventId } = Route.useParams();
  const { data, guests } = useEvent(eventId);
  const { updateAI } = useStore();
  const ai = data.ai;
  const [extras, setExtras] = useState(ai.prompt || "");
  const [newRule, setNewRule] = useState("");
  const [devBot, setDevBot] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [promptGuest, setPromptGuest] = useState("");
  const [promptLoading, setPromptLoading] = useState(false);

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
      toast.error(error instanceof Error ? error.message : "No se pudo cargar el prompt");
    } finally {
      setPromptLoading(false);
    }
  };

  return (
    <main className="mx-auto grid w-full max-w-7xl flex-1 gap-6 px-5 py-8 md:px-8 lg:grid-cols-[1.35fr_1fr]">
      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="flex items-center gap-2">
            <Bot className="size-5 text-gold" />
            <h2 className="font-display text-2xl">Personalidad del asistente</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Estos ajustes se aplican en cada conversación.
          </p>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Nombre del asistente</Label>
              <Input
                value={ai.assistantName}
                onChange={(e) => updateAI(eventId, { assistantName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Tono</Label>
              <Select value={ai.tone} onValueChange={(v) => updateAI(eventId, { tone: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {tones.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3 sm:col-span-2">
              <div className="flex justify-between">
                <Label>Nivel de formalidad</Label>
                <span className="text-xs text-muted-foreground">{ai.formality}%</span>
              </div>
              <Slider
                value={[ai.formality]}
                max={100}
                step={5}
                onValueChange={([v]) => updateAI(eventId, { formality: v ?? 50 })}
              />
              <div className="flex justify-between text-[11px] text-muted-foreground">
                <span>Muy cercano</span><span>Muy formal</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Uso de emojis</Label>
              <Select value={ai.emojis} onValueChange={(v) => updateAI(eventId, { emojis: v as typeof ai.emojis })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ninguno">Ninguno</SelectItem>
                  <SelectItem value="algunos">Algunos</SelectItem>
                  <SelectItem value="frecuentes">Frecuentes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Longitud de mensajes</Label>
              <Select value={ai.length} onValueChange={(v) => updateAI(eventId, { length: v as typeof ai.length })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
          <h2 className="font-display text-2xl">Reglas de conversación</h2>
          <ul className="mt-4 space-y-2">
            {ai.rules.map((r, i) => (
              <li key={`${i}-${r}`} className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm">
                <span className="text-gold">•</span>
                <span className="flex-1">{r}</span>
                <button
                  type="button"
                  onClick={() => updateAI(eventId, { rules: ai.rules.filter((_, j) => j !== i) })}
                  className="text-muted-foreground transition-colors hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <Input value={newRule} onChange={(e) => setNewRule(e.target.value)} placeholder="Agregar instrucción…" />
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
          <div className="mt-4 space-y-3">
            {ai.followUps.map((f) => (
              <div key={f.id} className="flex items-center gap-4 rounded-xl border border-border p-3">
                <div className="flex-1">
                  <p className="text-sm font-medium">{f.label}</p>
                  <p className="text-xs text-muted-foreground">{f.when}</p>
                </div>
                <Switch
                  checked={f.active}
                  onCheckedChange={(c) =>
                    updateAI(eventId, {
                      followUps: ai.followUps.map((x) => (x.id === f.id ? { ...x, active: c } : x)),
                    })
                  }
                />
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <h2 className="font-display text-2xl">Instrucciones extra</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            El flujo de confirmación no se edita aquí. Añade solo matices de este evento; se agregan al final del prompt del sistema.
          </p>
          <Textarea
            value={extras}
            onChange={(e) => setExtras(e.target.value)}
            rows={8}
            placeholder="Ej. Hay valet parking. No hables de la mesa de regalos a menos que pregunten."
            className="mt-4 font-sans text-sm leading-relaxed"
          />
          <Button
            className="mt-4"
            onClick={() => {
              updateAI(eventId, { prompt: extras });
              toast.success("Instrucciones extra guardadas");
            }}
          >
            <Save className="size-4" /> Guardar instrucciones
          </Button>
        </section>
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
                    Solo en desarrollo. Usa el prompt y las plantillas de este evento, sin WhatsApp.
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
                "Indeciso: agenda recontacto a 3 días",
              ].map((s, i) => (
                <li key={s} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold">
                    {i + 1}
                  </span>
                  <span className="text-muted-foreground">{s}</span>
                </li>
              ))}
            </ol>
            <Badge variant="outline" className="mt-4 rounded-full bg-warning-soft text-warning">
              Indeciso → seguimiento a 3 días
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
    </main>
  );
}
