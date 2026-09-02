import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Copy, FileUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConstructorOpeningEditor } from "@/components/constructor-opening-editor";
import { TemplateBodyEditor } from "@/components/template-body-editor";
import { TemplatePreview } from "@/components/template-preview";
import { useEvent, useStore } from "@/lib/mock/store";
import type { EventItem, Guest, Template } from "@/lib/mock/types";
import {
  composeConstructorTemplate,
  normalizeGreetingVar,
} from "@/lib/template-vars";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";

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

const OPENING_DOC_MAX_BYTES = 10 * 1024 * 1024;
const OPENING_DOC_ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function formatFileSize(bytes: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isOpeningDocumentFile(file: File) {
  const byExt = /\.(pdf|docx?)$/i.test(file.name);
  const byMime =
    !file.type ||
    file.type === "application/pdf" ||
    file.type === "application/msword" ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return byExt && byMime;
}

function OpeningDocumentAttach({
  eventId,
  template,
  templates,
  setTemplates,
}: {
  eventId: string;
  template: Template;
  templates: Template[];
  setTemplates: (eventId: string, t: Template[]) => void;
}) {
  const { uploadOpeningDocument } = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const attached = Boolean(template.attachDocument);
  const current = template.document;

  const persistAttach = (checked: boolean) => {
    setTemplates(
      eventId,
      templates.map((x) =>
        x.id === template.id ? { ...x, attachDocument: checked } : x,
      ),
    );
  };

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    if (!isOpeningDocumentFile(file)) {
      toast.error("El documento debe ser PDF o Word (doc, docx).");
      return;
    }
    if (file.size > OPENING_DOC_MAX_BYTES) {
      toast.error("El archivo no puede superar 10 MB.");
      return;
    }
    setUploading(true);
    try {
      await uploadOpeningDocument(eventId, file);
      toast.success(current ? "Documento reemplazado" : "Documento adjunto");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo subir el documento",
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-border bg-secondary/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label htmlFor="attach-document" className="font-medium">
            Adjuntar documento
          </Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Si está activo, la invitación inicial usa la plantilla de Meta con
            PDF o Word.
          </p>
        </div>
        <Switch
          id="attach-document"
          checked={attached}
          onCheckedChange={persistAttach}
        />
      </div>
      {attached ? (
        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept={OPENING_DOC_ACCEPT}
            className="sr-only"
            onChange={(e) => void onPick(e.target.files?.[0])}
          />
          {current ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
              <p className="min-w-0 truncate">
                {current.fileName}
                {current.size ? (
                  <span className="ml-2 text-muted-foreground">
                    {formatFileSize(current.size)}
                  </span>
                ) : null}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
              >
                {uploading ? "Subiendo…" : "Reemplazar"}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              <FileUp className="size-4" />
              {uploading ? "Subiendo…" : "Adjuntar documento"}
            </Button>
          )}
          {!current ? (
            <p className="text-xs text-destructive">
              Sin documento la plantilla con adjunto fallará al enviar.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

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
              <>
                <ConstructorOpeningEditor
                  greetingVar={draftGreeting}
                  body={draft}
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
                <OpeningDocumentAttach
                  eventId={eventId}
                  template={template}
                  templates={templates}
                  setTemplates={setTemplates}
                />
              </>
            ) : (
              <TemplateBodyEditor
                value={template.body}
                onChange={setDraft}
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
