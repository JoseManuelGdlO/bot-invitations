import { useRef, useState } from "react";
import { ImageIcon, Loader2 } from "lucide-react";
import { fileToCoverDataUrl, isCoverImage } from "@/lib/cover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function CoverDropzone({
  value,
  onChange,
}: {
  value: string;
  onChange: (cover: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const hasPhoto = isCoverImage(value);

  const applyFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await fileToCoverDataUrl(file));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo subir la imagen");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void applyFile(e.dataTransfer.files[0]);
        }}
        className={cn(
          "relative flex h-44 w-full items-center justify-center overflow-hidden rounded-xl border border-dashed text-left transition-colors",
          dragging ? "border-gold bg-gold-soft/70" : "border-border",
          busy ? "cursor-wait" : "cursor-pointer",
        )}
        style={hasPhoto ? undefined : { background: value }}
      >
        {hasPhoto ? (
          <img src={value} alt="Portada del evento" className="absolute inset-0 size-full object-cover" />
        ) : null}
        <div
          className={cn(
            "relative z-10 text-center text-sm",
            hasPhoto ? "rounded-lg bg-card/85 px-3 py-2 text-foreground backdrop-blur-sm" : "text-muted-foreground",
          )}
        >
          {busy ? (
            <Loader2 className="mx-auto mb-2 size-5 animate-spin text-gold" />
          ) : (
            <ImageIcon className="mx-auto mb-2 size-5" />
          )}
          {busy ? "Procesando imagen…" : hasPhoto ? "Cambiar foto" : "Arrastra una imagen o haz clic para subirla"}
        </div>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          void applyFile(file);
        }}
      />
    </div>
  );
}
