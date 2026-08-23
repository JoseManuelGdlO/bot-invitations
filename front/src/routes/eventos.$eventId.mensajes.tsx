import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Copy, MessageSquarePlus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEvent, useStore } from "@/lib/mock/store";
import { toast } from "sonner";

export const Route = createFileRoute("/eventos/$eventId/mensajes")({
  head: () => ({
    meta: [
      { title: "Centro de mensajes · Alanna Confirmaciones" },
      { name: "description", content: "Biblioteca de plantillas y respuestas frecuentes del evento." },
      { property: "og:title", content: "Centro de mensajes · Alanna Confirmaciones" },
      { property: "og:description", content: "Plantillas por categoría y respuestas frecuentes." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Mensajes,
});

const categories = [
  "Primer contacto",
  "Recordatorio",
  "Confirmación",
  "Rechazo",
  "Información del evento",
  "Ubicación",
  "Dress code",
  "Agradecimiento",
];

function Mensajes() {
  const { eventId } = Route.useParams();
  const { data } = useEvent(eventId);
  const { setTemplates, setFaqs } = useStore();
  const [q, setQ] = useState("");
  const [a, setA] = useState("");

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 md:px-8">
      <Tabs defaultValue="plantillas">
        <TabsList>
          <TabsTrigger value="plantillas">Biblioteca de mensajes</TabsTrigger>
          <TabsTrigger value="faq">Respuestas frecuentes</TabsTrigger>
        </TabsList>

        <TabsContent value="plantillas" className="mt-6 space-y-8">
          {categories.map((cat) => {
            const items = data.templates.filter((t) => t.category === cat);
            return (
              <section key={cat}>
                <div className="flex items-center gap-3">
                  <h2 className="font-display text-2xl">{cat}</h2>
                  <Badge variant="outline" className="rounded-full text-[11px]">{items.length}</Badge>
                </div>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  {items.map((t) => (
                    <div
                      key={t.id}
                      className="group rounded-2xl border border-border bg-card p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-lift"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium">{t.title}</p>
                        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            onClick={() => {
                              void navigator.clipboard.writeText(t.body);
                              toast.success("Plantilla copiada");
                            }}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary"
                          >
                            <Copy className="size-4" />
                          </button>
                          <button
                            onClick={() => setTemplates(eventId, data.templates.filter((x) => x.id !== t.id))}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>
                      <Textarea
                        defaultValue={t.body}
                        rows={4}
                        className="mt-3 resize-none border-none bg-secondary/50 text-sm"
                        onBlur={(e) =>
                          setTemplates(
                            eventId,
                            data.templates.map((x) => (x.id === t.id ? { ...x, body: e.target.value } : x)),
                          )
                        }
                      />
                    </div>
                  ))}
                  <button
                    onClick={() =>
                      setTemplates(eventId, [
                        ...data.templates,
                        { id: `t-${Date.now()}`, category: cat, title: "Nueva plantilla", body: "Hola {{nombre}}…" },
                      ])
                    }
                    className="flex min-h-32 items-center justify-center gap-2 rounded-2xl border border-dashed border-border text-sm text-muted-foreground transition-colors hover:bg-secondary/60"
                  >
                    <MessageSquarePlus className="size-4" /> Agregar plantilla
                  </button>
                </div>
              </section>
            );
          })}
        </TabsContent>

        <TabsContent value="faq" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div className="space-y-3">
              {data.faqs.map((f) => (
                <div key={f.id} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                  <p className="font-medium">{f.q}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{f.a}</p>
                  <button
                    onClick={() => setFaqs(eventId, data.faqs.filter((x) => x.id !== f.id))}
                    className="mt-3 text-xs text-muted-foreground underline-offset-4 hover:text-destructive hover:underline"
                  >
                    Eliminar
                  </button>
                </div>
              ))}
            </div>
            <div className="h-fit rounded-2xl border border-border bg-card p-5 shadow-soft">
              <h3 className="font-display text-xl">Agregar respuesta</h3>
              <div className="mt-4 space-y-3">
                <div className="space-y-2">
                  <Label>Pregunta</Label>
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="¿Hay estacionamiento?" />
                </div>
                <div className="space-y-2">
                  <Label>Respuesta</Label>
                  <Textarea value={a} onChange={(e) => setA(e.target.value)} rows={3} />
                </div>
                <Button
                  className="w-full"
                  onClick={() => {
                    if (!q.trim()) return;
                    setFaqs(eventId, [...data.faqs, { id: `q-${Date.now()}`, q, a }]);
                    setQ("");
                    setA("");
                    toast.success("Respuesta agregada");
                  }}
                >
                  <Plus className="size-4" /> Agregar
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}
