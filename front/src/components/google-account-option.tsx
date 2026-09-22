import { GoogleLogin } from "@react-oauth/google";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const googleClientId =
  String(import.meta.env["VITE_GOOGLE_CLIENT_ID"] || "").trim() || undefined;

export function GoogleAccountOption({
  disabled,
  onCredential,
}: {
  disabled?: boolean;
  onCredential: (idToken: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(400);

  useEffect(() => {
    if (!googleClientId) return;
    const el = wrapRef.current;
    if (!el) return;
    const sync = () => {
      const next = Math.floor(el.getBoundingClientRect().width);
      if (next > 0) setWidth(next);
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        o
        <span className="h-px flex-1 bg-border" />
      </div>
      {googleClientId ? (
        <div
          ref={wrapRef}
          className={`relative ${disabled ? "pointer-events-none opacity-50" : ""}`}
        >
          <Button
            type="button"
            variant="outline"
            className="pointer-events-none w-full"
            tabIndex={-1}
          >
            <GoogleMark />
            Usar mi cuenta de Google
          </Button>
          <div
            aria-hidden
            className="absolute inset-0 overflow-hidden opacity-[0.02] [&_div]:flex [&_div]:h-full [&_div]:w-full [&_iframe]:h-full [&_iframe]:w-full"
          >
            <GoogleLogin
              onSuccess={(res) => {
                if (res.credential) onCredential(res.credential);
              }}
              onError={() => toast.error("No se pudo conectar con Google")}
              text="continue_with"
              width={width}
              theme="outline"
            />
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={disabled}
          onClick={() =>
            toast.error(
              "Falta VITE_GOOGLE_CLIENT_ID en front/.env (y GOOGLE_CLIENT_ID en backend/.env). Reinicia Vite tras guardarlo.",
            )
          }
        >
          <GoogleMark />
          Usar mi cuenta de Google
        </Button>
      )}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.55-5.17 3.55-8.65Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3c-1.08.72-2.47 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.6H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.4l4-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.6 4.59 1.79l3.44-3.44C17.95 1.14 15.23 0 12 0 7.31 0 3.2 2.69 1.27 6.6l4 3.11C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}
