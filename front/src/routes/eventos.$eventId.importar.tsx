import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { CheckCircle2, FileSpreadsheet, Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useStore } from "@/lib/mock/store";
import { cn } from "@/lib/utils";
import type { Guest } from "@/lib/mock/types";
import { toast } from "sonner";

export const Route = createFileRoute("/eventos/$eventId/importar")({
  head: () => ({
    meta: [
      { title: "Importar Excel · Alanna Confirmaciones" },
      { name: "description", content: "Sube tu lista de invitados y mapea las columnas del archivo." },
      { property: "og:title", content: "Importar Excel · Alanna Confirmaciones" },
      { property: "og:description", content: "Carga y mapeo de columnas de la lista de invitados." },
    ],
  }),
  component: Importar,
});

const excelColumns = ["NOMBRE", "TELÉFONO", "INVITADOS", "MESA", "FAMILIA", "TIPO", "NOTAS"];

const fields = [
  { id: "rep", label: "Nombre del representante" },
  { id: "phone", label: "Número de WhatsApp" },
  { id: "invited", label: "Número de personas invitadas" },
  { id: "table", label: "Mesa asignada" },
  { id: "family", label: "Familia" },
  { id: "guestType", label: "Tipo de invitado" },
  { id: "notes", label: "Notas" },
  { id: "tag", label: "Etiqueta" },
  { id: "ignore", label: "No importar" },
];

const defaultMap: Record<string, string> = {
  "NOMBRE": "rep",
  "TELÉFONO": "phone",
  "INVITADOS": "invited",
  "MESA": "table",
  "FAMILIA": "family",
  "TIPO": "guestType",
  "NOTAS": "notes",
};

const previewRows = [
  ["Laura Escobedo", "+52 999 431 2210", "4", "Mesa 2", "Escobedo", "Familia", "Menú sin gluten"],
  ["Ernesto Villalobos", "+52 811 220 3391", "2", "Mesa 7", "Villalobos", "Amigos", ""],
  ["Paola Arroyo", "+52 555 908 1123", "3", "Mesa 11", "Arroyo", "Trabajo", "Llega tarde"],
  ["Gustavo Rendón", "+52 998 771 5540", "1", "Mesa 5", "Rendón", "Padrinos", ""],
  ["Ana Sofía Bravo", "+52 33 1204 8876", "5", "Mesa 9", "Bravo", "Familia", "Hospedaje reservado"],
];

function Importar() {
  const { eventId } = Route.useParams();
  const { importGuests, logActivity } = useStore();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"upload" | "processing" | "mapping" | "done">("upload");
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [mapping, setMapping] = useState(defaultMap);

  const startProcessing = () => {
    setPhase("processing");
    setProgress(0);
    let p = 0;
    const t = setInterval(() => {
      p += 12;
      setProgress(Math.min(100, p));
      if (p >= 100) {
        clearInterval(t);
        setTimeout(() => setPhase("mapping"), 400);
      }
    }, 180);
  };

  const doImport = () => {
    const rows: Guest[] = previewRows.map((r, i) => ({
      id: `${eventId}-imp${Date.now()}-${i}`,
      eventId,
      rep: r[0]!,
      phone: r[1]!,
      invited: Number(r[2]),
      confirmed: 0,
      table: r[3]!,
      family: r[4]!,
      guestType: r[5]!,
      notes: r[6]!,
      tag: "Sin etiqueta",
      status: "sin_contactar",
      whatsapp: "pendiente",
      lastMessage: "",
      lastReply: "",
      lastReplyAt: "",
      followUp: "",
    }));
    importGuests(eventId, rows);
    logActivity({
      id: `act-${Date.now()}`,
      eventId,
      text: `Se importaron ${rows.length} invitaciones desde Excel`,
      at: "hace un momento",
      kind: "system",
    });
    setPhase("done");
    toast.success(`${rows.length} invitaciones importadas`);
  };

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8 md:px-8">
      {phase === "upload" ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            startProcessing();
          }}
          className={cn(
            "flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-16 text-center transition-all duration-300",
            dragging ? "border-gold bg-gold-soft/60 scale-[1.01]" : "border-border bg-card",
          )}
        >
          <UploadCloud className="size-10 text-gold" />
          <h2 className="mt-4 font-display text-3xl">Sube tu lista de invitados</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Arrastra tu archivo aquí o selecciónalo desde tu equipo
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Formatos aceptados: .xlsx · .xls · .csv</p>
          <Button className="mt-6" onClick={startProcessing}>
            <FileSpreadsheet className="size-4" /> Seleccionar archivo
          </Button>
        </div>
      ) : null}

      {phase === "processing" ? (
        <div className="rounded-2xl border border-border bg-card p-16 text-center shadow-soft">
          <Loader2 className="mx-auto size-8 animate-spin text-gold" />
          <h2 className="mt-4 font-display text-2xl">Procesando archivo…</h2>
          <p className="mt-1 text-sm text-muted-foreground">invitados-boda.xlsx · 24 KB</p>
          <Progress value={progress} className="mx-auto mt-6 h-2 max-w-md" />
          <p className="mt-3 text-xs text-muted-foreground">
            Detectando columnas y validando números de WhatsApp…
          </p>
        </div>
      ) : null}

      {phase === "mapping" ? (
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-success" />
              <h2 className="font-display text-2xl">Archivo procesado</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              invitados-boda.xlsx · 5 filas detectadas · 7 columnas
            </p>
            <div className="mt-5 overflow-x-auto rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>{excelColumns.map((c) => <TableHead key={c}>{c}</TableHead>)}</TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((r, i) => (
                    <TableRow key={i}>
                      {r.map((c, j) => (
                        <TableCell key={j} className="whitespace-nowrap text-muted-foreground">
                          {c || "—"}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
            <h2 className="font-display text-2xl">Mapeo de columnas</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Indica qué representa cada columna de tu archivo.
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {excelColumns.map((c) => (
                <div key={c} className="flex items-center gap-3 rounded-xl border border-border p-3">
                  <div className="w-32 shrink-0">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Columna Excel</p>
                    <p className="text-sm font-medium">{c}</p>
                  </div>
                  <Select
                    value={mapping[c] ?? "ignore"}
                    onValueChange={(v) => setMapping((m) => ({ ...m, [c]: v }))}
                  >
                    <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {fields.map((f) => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="mt-6 flex gap-3">
              <Button onClick={doImport}>Importar invitados</Button>
              <Button variant="ghost" onClick={() => setPhase("upload")}>Cancelar</Button>
            </div>
          </div>
        </div>
      ) : null}

      {phase === "done" ? (
        <div className="rounded-2xl border border-border bg-card p-16 text-center shadow-soft animate-in fade-in zoom-in-95 duration-500">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success-soft">
            <CheckCircle2 className="size-7 text-success" />
          </span>
          <h2 className="mt-4 font-display text-3xl">Invitados importados</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            5 invitaciones nuevas se agregaron a este evento y están listas para contactar.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button onClick={() => navigate({ to: "/eventos/$eventId/invitados", params: { eventId } })}>
              Ver invitados
            </Button>
            <Button variant="outline" onClick={() => setPhase("upload")}>Importar otro archivo</Button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
