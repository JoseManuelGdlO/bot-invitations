import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bot, Plus, RefreshCw, Save, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEvent, useStore } from "@/lib/mock/store";
import { formatDate } from "@/lib/mock/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { botApi } from "@/lib/api/bot";
import { BotPlayground } from "@/components/bot-playground";
import type { AIConfig } from "@/lib/mock/types";

export const Route = createFileRoute("/eventos/$eventId/automatizacion")({
  head: () => ({
    meta: [
      { title: "Asistente de Confirmaciones · Alanna" },
      { name: "description", content: "Configura la personalidad, el mensaje inicial y las reglas del asistente." },
      { property: "og:title", content: "Asistente de Confirmaciones · Alanna" },
      { property: "og:description", content: "Personalidad, mensaje inicial y reglas de seguimiento." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Automatizacion,
});

const variables = [
  "nombre",
  "nombre_completo",
  "numero_invitados",
  "numero_confirmados",
  "mesa",
  "evento",
  "fecha",
  "lugar",
  "direccion",
  "hora",
  "planner",
];
const tones = ["Elegante", "Casual", "Amable", "Cercano", "Formal", "Divertido"];

function Automatizacion() {
  const { eventId } = Route.useParams();
  const { data, event, guests } = useEvent(eventId);
  const { updateAI, session } = useStore();
  const ai = data.ai;
  const [message, setMessage] = useState(ai.openingMessage);
  const [prompt, setPrompt] = useState(ai.prompt || "");
  const [newRule, setNewRule] = useState("");
  const [devBot, setDevBot] = useState(false);

  useEffect(() => {
    setPrompt(ai.prompt || "");
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

  const insert = (v: string) => setMessage((m) => `${m} {{${v}}}`);

  const preview = (guestIndex: number, greeting: string) => {
    const g = guests[guestIndex];
    if (!g || !event) return "";
    return `${greeting}\n\n${message}`
      .replace(/{{nombre_completo}}/g, g.rep)
      .replace(/{{nombre}}/g, g.rep.split(" ")[0] ?? g.rep)
      .replace(/{{numero_invitados}}/g, String(g.invited))
      .replace(/{{numero_confirmados}}/g, String(g.confirmed))
      .replace(/{{confirmados}}/g, String(g.confirmed))
      .replace(/{{mesa}}/g, g.table || "")
      .replace(/{{evento}}/g, event.name)
      .replace(/{{fecha}}/g, formatDate(event.date))
      .replace(/{{lugar}}/g, event.venue)
      .replace(/{{direccion}}/g, event.address || "")
      .replace(/{{hora}}/g, event.time)
      .replace(/{{planner}}/g, session?.name.split(" ")[0] ?? "Planner");
  };

  return (
    <main className="mx-auto grid w-full max-w-7xl flex-1 gap-6 px-5 py-8 md:px-8 lg:grid-cols-[1.35fr_1fr]">
      <div className="space-y-6">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="flex items-center gap-2">
            <Bot className="size-5 text-gold" />
            <h2 className="font-display text-2xl">Personalidad del asistente</h2>
          </div>
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
          <h2 className="font-display text-2xl">Prompt del bot</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Este texto es el cerebro de este evento. Las plantillas y FAQs se inyectan solas en cada turno.
          </p>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={12}
            className="mt-4 font-sans text-sm leading-relaxed"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={() => {
                updateAI(eventId, { prompt });
                toast.success("Prompt guardado");
              }}
            >
              <Save className="size-4" /> Guardar prompt
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                if (!window.confirm("¿Regenerar el prompt desde la personalidad? Se pierde el texto actual.")) return;
                try {
                  const saved = (await botApi.regeneratePrompt(eventId)) as AIConfig;
                  const next = saved?.prompt ?? "";
                  setPrompt(next);
                  updateAI(eventId, { prompt: next });
                  toast.success("Prompt regenerado desde la personalidad");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "No se pudo regenerar");
                }
              }}
            >
              <RefreshCw className="size-4" /> Regenerar desde personalidad
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <h2 className="font-display text-2xl">Mensaje inicial</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            La campaña usa la plantilla «Primer contacto» de Mensajes. Este texto es el respaldo si no hay plantilla.
          </p>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={10}
            className="mt-4 font-sans text-sm leading-relaxed"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {variables.map((v) => (
              <button
                key={v}
                onClick={() => insert(v)}
                className="rounded-full border border-border bg-secondary px-2.5 py-1 text-[11px] transition-colors hover:bg-gold-soft"
              >
                {`{{${v}}}`}
              </button>
            ))}
          </div>
          <Button
            className="mt-4"
            onClick={() => {
              updateAI(eventId, { openingMessage: message });
              toast.success("Mensaje inicial guardado");
            }}
          >
            <Save className="size-4" /> Guardar mensaje
          </Button>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <h2 className="font-display text-2xl">Reglas de conversación</h2>
          <ul className="mt-4 space-y-2">
            {ai.rules.map((r, i) => (
              <li key={r} className="flex items-center gap-3 rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm">
                <span className="text-gold">•</span>
                <span className="flex-1">{r}</span>
                <button
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
      </div>

      <aside className="space-y-4">
        <div className="sticky top-6 space-y-4">
          {devBot ? (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <div className="flex items-center gap-2">
                <Bot className="size-4 text-gold" />
                <h3 className="font-display text-xl">Probar bot</h3>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Solo en desarrollo. Usa el prompt y las plantillas de este evento, sin WhatsApp.
              </p>
              <div className="mt-4">
                <BotPlayground eventId={eventId} guests={guests} />
              </div>
            </div>
          ) : null}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-gold" />
              <h3 className="font-display text-xl">Personalización automática</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Cada invitado recibe una variación distinta del mismo mensaje.
            </p>
            <div className="mt-4 space-y-3">
              {[
                [0, "Hola María, ¿cómo estás? 😊"],
                [1, "Hola Juan, esperamos que estés teniendo un excelente día."],
              ].map(([idx, greeting]) => (
                <div key={String(idx)} className={cn("chat-canvas rounded-xl p-3")}>
                  <div className="rounded-2xl rounded-br-sm bg-success-soft p-3 text-xs leading-relaxed shadow-soft">
                    <p className="whitespace-pre-line">{preview(Number(idx), String(greeting))}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <h3 className="font-display text-xl">Flujo de confirmación</h3>
            <ol className="mt-3 space-y-3 text-sm">
              {[
                "Mensaje inicial enviado",
                "El invitado responde",
                "El asistente interpreta la respuesta",
                "Identifica el número de asistentes",
                "Confirma el total con el invitado",
                "El estado cambia a CONFIRMADO",
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
              Respuestas ambiguas → Pendiente + seguimiento
            </Badge>
          </div>
        </div>
      </aside>
    </main>
  );
}
