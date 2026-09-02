import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Copy, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConstructorOpeningEditor } from "@/components/constructor-opening-editor";
import { TemplateBodyEditor } from "@/components/template-body-editor";
import { TemplatePreview } from "@/components/template-preview";
import { useEvent, useStore } from "@/lib/mock/store";
import type { EventItem, Guest, Template } from "@/lib/mock/types";
import {
  composeConstructorTemplate,
  extraTemplateKeys,
  normalizeGreetingVar,
} from "@/lib/template-vars";
import { toast } from "sonner";

export const Route = createFileRoute("/eventos/$eventId/mensajes")({
  head: () => ({
    meta: [
      { title: "Centro de mensajes · Alanna Confirmaciones" },
      {
        name: "description",
        content: "Biblioteca de plantillas y respuestas frecuentes del evento.",
      },
      {
        property: "og:title",
        content: "Centro de mensajes · Alanna Confirmaciones",
      },
      {
        property: "og:description",
        content: "Plantillas por categoría y respuestas frecuentes.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Mensajes,
});

const categories = [
  {
    id: "Primer contacto",
    hint: "Campaña inicial de WhatsApp. El saludo es fijo; tú eliges la variable y el texto de «Nos comunicamos de».",
  },
  {
    id: "Recordatorio",
    hint: "Recordatorio automático. El envío masivo está desactivado; el texto queda listo por si se reactiva.",
  },
  {
    id: "Seguimiento",
    hint: "Recontacto a indecisos, según las reglas de seguimiento.",
  },
] as const;

function TemplateCategory({
  eventId,
  category,
  hint,
  template,
  templates,
  guests,
  event,
  plannerName,
  setTemplates,
}: {
  eventId: string;
  category: string;
  hint: string;
  template: Template | undefined;
  templates: Template[];
  guests: Guest[];
  event: EventItem | undefined;
  plannerName: string;
  setTemplates: (eventId: string, t: Template[]) => void;
}) {
  const isConstructor = category === "Primer contacto";
  const [draft, setDraft] = useState(template?.body ?? "");
  const [draftGreeting, setDraftGreeting] = useState(
    normalizeGreetingVar(template?.greetingVar),
  );

  useEffect(() => {
    setDraft(template?.body ?? "");
    setDraftGreeting(normalizeGreetingVar(template?.greetingVar));
  }, [template?.id, template?.body, template?.greetingVar]);

  const previewBody = isConstructor
    ? composeConstructorTemplate(draftGreeting, draft)
    : draft;
  const copyText = isConstructor
    ? composeConstructorTemplate(draftGreeting, draft)
    : draft;
  const extraVariables = extraTemplateKeys(guests);

  return (
    <section>
      <h2 className="font-display text-2xl">{category}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      {template ? (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="mb-3 flex items-start justify-between gap-2">
              <p className="font-medium">{template.title}</p>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(copyText);
                  toast.success("Plantilla copiada");
                }}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary"
              >
                <Copy className="size-4" />
              </button>
            </div>
            {isConstructor ? (
              <ConstructorOpeningEditor
                greetingVar={draftGreeting}
                body={draft}
                extraVariables={extraVariables}
                onGreetingVarChange={setDraftGreeting}
                onChange={setDraft}
                onSave={({ body, greetingVar }) => {
                  setDraft(body);
                  setDraftGreeting(greetingVar);
                  setTemplates(
                    eventId,
                    templates.map((x) =>
                      x.id === template.id
                        ? { ...x, body, greetingVar }
                        : x,
                    ),
                  );
                  toast.success("Plantilla guardada");
                }}
              />
            ) : (
              <TemplateBodyEditor
                value={template.body}
                onChange={setDraft}
                extraVariables={extraVariables}
                onSave={(body) => {
                  setTemplates(
                    eventId,
                    templates.map((x) =>
                      x.id === template.id ? { ...x, body } : x,
                    ),
                  );
                  toast.success("Plantilla guardada");
                }}
              />
            )}
          </div>
          <TemplatePreview
            body={previewBody}
            guests={guests}
            event={event}
            plannerName={plannerName}
          />
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          No hay plantilla para esta categoría.
        </p>
      )}
    </section>
  );
}

function Mensajes() {
  const { eventId } = Route.useParams();
  const { data, event, guests } = useEvent(eventId);
  const { setTemplates, setFaqs, session } = useStore();
  const [q, setQ] = useState("");
  const [a, setA] = useState("");
  const plannerName = session?.name.split(" ")[0] ?? "Planner";

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 md:px-8">
      <Tabs defaultValue="plantillas">
        <TabsList>
          <TabsTrigger value="plantillas">Biblioteca de mensajes</TabsTrigger>
          <TabsTrigger value="faq">Respuestas frecuentes</TabsTrigger>
        </TabsList>

        <TabsContent value="plantillas" className="mt-6 space-y-8">
          {categories.map((cat) => (
            <TemplateCategory
              key={cat.id}
              eventId={eventId}
              category={cat.id}
              hint={cat.hint}
              template={data.templates.find((t) => t.category === cat.id)}
              templates={data.templates}
              guests={guests}
              event={event}
              plannerName={plannerName}
              setTemplates={setTemplates}
            />
          ))}
        </TabsContent>

        <TabsContent value="faq" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div className="space-y-3">
              {data.faqs.map((f) => (
                <div
                  key={f.id}
                  className="rounded-2xl border border-border bg-card p-5 shadow-soft"
                >
                  <p className="font-medium">{f.q}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{f.a}</p>
                  <button
                    onClick={() =>
                      setFaqs(
                        eventId,
                        data.faqs.filter((x) => x.id !== f.id),
                      )
                    }
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
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="¿Hay estacionamiento?"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Respuesta</Label>
                  <Textarea
                    value={a}
                    onChange={(e) => setA(e.target.value)}
                    rows={3}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={() => {
                    if (!q.trim()) return;
                    setFaqs(eventId, [
                      ...data.faqs,
                      { id: `q-${Date.now()}`, q, a },
                    ]);
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
