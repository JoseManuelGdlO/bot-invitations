import { useState } from "react";
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
import { ApiError } from "@/lib/api/client";
import { useStore } from "@/lib/mock/store";
import type { Guest } from "@/lib/mock/types";
import { toast } from "sonner";

export function SendGuestInvitationDialog({
  guest,
  onClose,
  onSent,
}: {
  guest: Guest | null;
  onClose: () => void;
  onSent?: () => Promise<void> | void;
}) {
  const { remindGuest } = useStore();
  const [sending, setSending] = useState(false);
  const isOpening = guest?.status === "sin_contactar";

  return (
    <AlertDialog
      open={!!guest}
      onOpenChange={(open) => !open && !sending && onClose()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isOpening
              ? `¿Enviar invitación a ${guest?.rep}?`
              : `¿Enviar recordatorio a ${guest?.rep}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isOpening
              ? "Se enviará la invitación inicial (primer contacto) por WhatsApp."
              : "Se enviará un recordatorio por WhatsApp. Solo confirma si quieres reenviar el mensaje."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={sending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={sending}
            onClick={async (e) => {
              e.preventDefault();
              if (!guest) return;
              setSending(true);
              try {
                await remindGuest(guest.id);
                await onSent?.();
                toast.success(
                  isOpening
                    ? `Invitación enviada a ${guest.rep}`
                    : `Recordatorio enviado a ${guest.rep}`,
                );
                onClose();
              } catch (err) {
                toast.error(
                  err instanceof ApiError
                    ? err.message
                    : "No se pudo enviar el mensaje",
                );
              } finally {
                setSending(false);
              }
            }}
          >
            {sending ? "Enviando…" : "Enviar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
