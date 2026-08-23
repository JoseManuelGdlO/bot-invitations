import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, ImageIcon, PartyPopper, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStore } from "@/lib/mock/store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";

export const Route = createFileRoute("/eventos/nuevo")({
  head: () => ({
    meta: [
      { title: "Crear evento · Alanna Confirmaciones" },
      { name: "description", content: "Crea un nuevo evento y configura su lista de invitados." },
      { property: "og:title", content: "Crear evento · Alanna Confirmaciones" },
      { property: "og:description", content: "Wizard para crear un evento y su lista de invitados." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: NewEvent,
});

const covers = [
  "linear-gradient(135deg, var(--gold-soft), var(--rose))",
  "linear-gradient(135deg, var(--success-soft), var(--gold-soft))",
  "linear-gradient(135deg, var(--rose), var(--info-soft))",
  "linear-gradient(135deg, var(--info-soft), var(--secondary))",
];

const steps = ["Información del evento", "Configuración visual", "Lista de invitados"];

function NewEvent() {
  const { addEvent } = useStore();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: "",
    type: "Boda",
    hosts: "",
    date: "",
    time: "18:00",
    venue: "",
    address: "",
    estimatedGuests: "150",
    shortName: "",
    cover: covers[0]!,
  });

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const finish = async (withList: boolean) => {
    const id =
      form.name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || `evento-${Date.now()}`;
    try {
      const created = await addEvent({
        id,
        name: form.name || "Nuevo evento",
        shortName: form.shortName || form.name.slice(0, 3).toUpperCase(),
        type: form.type,
        hosts: form.hosts || "Anfitriones",
        date: form.date || "2027-01-01",
        time: form.time,
        venue: form.venue || "Por definir",
        address: form.address,
        estimatedGuests: Number(form.estimatedGuests) || 0,
        cover: form.cover,
        status: "borrador",
      });
      toast.success("Evento creado", { description: "Ya puedes configurar su asistente." });
      navigate({
        to: withList ? "/eventos/$eventId/importar" : "/eventos/$eventId/resumen",
        params: { eventId: created.id },
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo crear el evento");
    }
  };

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold">Nuevo evento</p>
      <h1 className="mt-1 font-display text-4xl">Crear evento</h1>

      <ol className="mt-8 flex items-center gap-3">
        {steps.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-3">
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                i < step
                  ? "border-transparent bg-success text-success-foreground"
                  : i === step
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground",
              )}
            >
              {i < step ? <Check className="size-4" /> : i + 1}
            </span>
            <span className={cn("hidden text-xs sm:block", i === step ? "font-medium" : "text-muted-foreground")}>
              {s}
            </span>
            {i < steps.length - 1 ? <span className="h-px flex-1 bg-border" /> : null}
          </li>
        ))}
      </ol>

      <div className="mt-8 rounded-2xl border border-border bg-card p-6 shadow-soft">
        {step === 0 ? (
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Nombre del evento</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Boda Andrea & Carlos" />
            </div>
            <div className="space-y-2">
              <Label>Tipo de evento</Label>
              <Select value={form.type} onValueChange={(v) => set("type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Boda", "XV Años", "Aniversario", "Corporativo", "Cumpleaños"].map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nombre de los anfitriones</Label>
              <Input value={form.hosts} onChange={(e) => set("hosts", e.target.value)} placeholder="Andrea & Carlos" />
            </div>
            <div className="space-y-2">
              <Label>Fecha</Label>
              <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Hora</Label>
              <Input type="time" value={form.time} onChange={(e) => set("time", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Lugar</Label>
              <Input value={form.venue} onChange={(e) => set("venue", e.target.value)} placeholder="Hacienda San José" />
            </div>
            <div className="space-y-2">
              <Label>Número estimado de invitados</Label>
              <Input type="number" value={form.estimatedGuests} onChange={(e) => set("estimatedGuests", e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Dirección</Label>
              <Textarea value={form.address} onChange={(e) => set("address", e.target.value)} rows={2} />
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-6">
            <div>
              <Label className="mb-3 block">Imagen de portada</Label>
              <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border" style={{ background: form.cover }}>
                <div className="text-center text-sm text-muted-foreground">
                  <ImageIcon className="mx-auto mb-2 size-5" />
                  Arrastra una imagen o selecciona una paleta
                </div>
              </div>
            </div>
            <div>
              <Label className="mb-3 block">Colores</Label>
              <div className="flex gap-3">
                {covers.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => set("cover", c)}
                    className={cn(
                      "size-12 rounded-xl border-2 transition-transform hover:scale-105",
                      form.cover === c ? "border-gold" : "border-transparent",
                    )}
                    style={{ background: c }}
                    aria-label="Seleccionar paleta"
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2 max-w-xs">
              <Label>Nombre corto</Label>
              <Input value={form.shortName} onChange={(e) => set("shortName", e.target.value)} placeholder="A&C" />
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-dashed border-border bg-secondary/40 p-10 text-center">
              <Upload className="mx-auto mb-3 size-6 text-gold" />
              <p className="font-medium">Sube tu lista de invitados</p>
              <p className="mt-1 text-xs text-muted-foreground">Formatos aceptados: .xlsx, .xls, .csv</p>
              <Button className="mt-4" onClick={() => finish(true)}>
                Ir a importar Excel
              </Button>
            </div>
            <button
              onClick={() => finish(false)}
              className="w-full rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground transition-colors hover:bg-secondary"
            >
              Cargar la lista después
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={() => (step === 0 ? navigate({ to: "/eventos" }) : setStep(step - 1))}>
          <ArrowLeft className="size-4" /> Atrás
        </Button>
        {step < 2 ? (
          <Button onClick={() => setStep(step + 1)}>
            Continuar <ArrowRight className="size-4" />
          </Button>
        ) : (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <PartyPopper className="size-4 text-gold" /> Último paso
          </span>
        )}
      </div>
    </main>
  );
}
