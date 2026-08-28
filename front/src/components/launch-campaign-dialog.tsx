import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import { toInputDate } from "@/lib/mock/format";
import type { CampaignSnapshot } from "@/lib/mock/types";

type Mode = "now" | "schedule";

export function LaunchCampaignDialog({
  open,
  onOpenChange,
  campaign,
  eventDate,
  submitting,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: CampaignSnapshot;
  eventDate?: string | undefined;
  submitting: boolean;
  onConfirm: (payload: { mode: Mode; date?: string }) => Promise<void>;
}) {
  const today = toInputDate();
  const maxDate = eventDate ? toInputDate(eventDate) : undefined;
  const scheduled =
    campaign.status === "scheduled" && campaign.scheduledAt
      ? campaign.scheduledAt
      : "";
  const [mode, setMode] = useState<Mode>(scheduled ? "schedule" : "now");
  const [date, setDate] = useState(scheduled || today);

  useEffect(() => {
    if (!open) return;
    const next = campaign.status === "scheduled" && campaign.scheduledAt
      ? campaign.scheduledAt
      : "";
    setMode(next ? "schedule" : "now");
    setDate(next || today);
  }, [open, campaign.status, campaign.scheduledAt, today]);

  const dateError =
    mode === "schedule" && date
      ? date < today
        ? "La fecha no puede ser anterior a hoy."
        : maxDate && date > maxDate
          ? "La fecha no puede ser posterior al evento."
          : ""
      : mode === "schedule" && !date
        ? "Elige un día."
        : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {campaign.status === "scheduled"
              ? "Cambiar el inicio de la campaña"
              : "Iniciar campaña"}
          </DialogTitle>
          <DialogDescription>
            El primer contacto se envía a quienes todavía no han sido
            contactados. Puedes lanzarlo ahora o dejarlo programado.
          </DialogDescription>
        </DialogHeader>
        <RadioGroup
          value={mode}
          onValueChange={(value) => setMode(value as Mode)}
          className="gap-3"
        >
          <label
            htmlFor="campaign-now"
            className={cn(
              "flex cursor-pointer gap-3 rounded-xl border border-border p-3",
              mode === "now" && "border-primary",
            )}
          >
            <RadioGroupItem id="campaign-now" value="now" className="mt-0.5" />
            <div>
              <p className="text-sm font-medium">Iniciar ahora</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Envía el primer contacto de inmediato a todos los invitados sin
                contactar. El envío queda en cola y no se duplica si pulsas dos
                veces.
              </p>
            </div>
          </label>
          <label
            htmlFor="campaign-schedule"
            className={cn(
              "flex cursor-pointer gap-3 rounded-xl border border-border p-3",
              mode === "schedule" && "border-primary",
            )}
          >
            <RadioGroupItem
              id="campaign-schedule"
              value="schedule"
              className="mt-0.5"
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Programar un día</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                El sistema lanza la campaña automáticamente al inicio de ese
                día. Puedes cambiar la fecha o adelantarla a ahora cuando
                quieras.
              </p>
              {mode === "schedule" ? (
                <div className="mt-3 space-y-1.5">
                  <Label htmlFor="campaign-date">Día de inicio</Label>
                  <Input
                    id="campaign-date"
                    type="date"
                    min={today}
                    max={maxDate}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                  {dateError ? (
                    <p className="text-xs text-destructive">{dateError}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </label>
        </RadioGroup>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={submitting || Boolean(dateError)}
            onClick={() =>
              void onConfirm(
                mode === "schedule" ? { mode, date } : { mode: "now" },
              )
            }
          >
            {submitting
              ? "Guardando…"
              : mode === "schedule"
                ? "Programar"
                : "Iniciar ahora"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
