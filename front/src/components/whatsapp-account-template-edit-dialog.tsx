import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WhatsappTemplateCard } from "@/components/whatsapp-template-card";
import { ApiError } from "@/lib/api/client";
import {
  integrationsApi,
  type AccountWhatsappTemplateDto,
} from "@/lib/api/integrations";
import { customAccountTemplateEditWarning } from "@/lib/whatsapp-account-templates";
import {
  accountTemplateToDraft,
  displayNameOrPreview,
  META_RESUBMIT_TITLE_ACCOUNT,
  META_RESUBMIT_WARNING_ACCOUNT,
  shouldConfirmMetaResubmit,
  type EventTemplateCardDraft,
} from "@/lib/whatsapp-event-templates";
import {
  buildEventTemplateFormData,
  isMetaTemplateInReview,
} from "@/lib/whatsapp-templates";
import { toast } from "sonner";
import type { EventItem, Guest } from "@/lib/mock/types";

export function WhatsappAccountTemplateEditDialog({
  template,
  open,
  onOpenChange,
  extraKeys,
  guests = [],
  event,
  plannerName,
  onSaved,
}: {
  template: AccountWhatsappTemplateDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extraKeys: string[];
  guests?: Guest[];
  event?: EventItem | undefined;
  plannerName?: string | undefined;
  onSaved: () => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<EventTemplateCardDraft | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const eventNames = (template?.usage?.events ?? [])
    .map((item) => item.name)
    .filter(Boolean);

  useEffect(() => {
    if (!open || !template) {
      setDraft(null);
      setConfirmOpen(false);
      return;
    }
    setDraft(accountTemplateToDraft(template));
  }, [open, template]);

  const submit = async () => {
    if (!template?.id || !draft || submitting) return;
    setSubmitting(true);
    try {
      await integrationsApi.putAccountWhatsappTemplate(
        template.id,
        buildEventTemplateFormData({
          displayName: draft.displayName,
          body: draft.body,
          headerType: draft.headerType,
          slotMappings: draft.slotMappings,
          isCampaign: false,
          headerFile: draft.headerFile,
        }),
      );
      toast.success("Plantilla enviada a revisión");
      setConfirmOpen(false);
      onOpenChange(false);
      await onSaved();
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "No se pudo enviar la plantilla a revisión",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const requestSave = () => {
    if (isMetaTemplateInReview(template?.status)) return;
    if (
      shouldConfirmMetaResubmit({
        persisted: true,
        status: template?.status,
      })
    ) {
      setConfirmOpen(true);
      return;
    }
    void submit();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {displayNameOrPreview(template || {}) || "Plantilla"}
            </DialogTitle>
            <DialogDescription>
              {customAccountTemplateEditWarning(
                template?.usage?.eventCount ?? 0,
              )}
              {eventNames.length ? ` La usan: ${eventNames.join(", ")}.` : ""}
            </DialogDescription>
          </DialogHeader>
          {draft ? (
            <WhatsappTemplateCard
              draft={draft}
              extraKeys={extraKeys}
              guests={guests}
              event={event}
              plannerName={plannerName}
              submitting={submitting}
              showCampaignRadio={false}
              onChange={(patch) =>
                setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
              }
              onSave={requestSave}
            />
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{META_RESUBMIT_TITLE_ACCOUNT}</AlertDialogTitle>
            <AlertDialogDescription>
              {META_RESUBMIT_WARNING_ACCOUNT}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              onClick={() => void submit()}
            >
              Enviar a revisión
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
