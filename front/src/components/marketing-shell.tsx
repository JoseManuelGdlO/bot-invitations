import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import logo from "@/assets/alanna-logo.png";
import { Button } from "@/components/ui/button";
import { LEGAL_CONTACT_EMAIL } from "@/lib/legal";
import { useStore } from "@/lib/mock/store";

const footerLinks = [
  { to: "/para-wedding-planners" as const, label: "Para wedding planners" },
  {
    to: "/confirmacion-invitados-whatsapp" as const,
    label: "Confirmación WhatsApp",
  },
  { to: "/software-rsvp-bodas" as const, label: "Software RSVP" },
  { to: "/blog" as const, label: "Blog" },
  { to: "/privacidad" as const, label: "Privacidad" },
  { to: "/terminos" as const, label: "Términos" },
  { to: "/eliminar-datos" as const, label: "Eliminar datos" },
];

export function MarketingShell({ children }: { children: ReactNode }) {
  const { session } = useStore();

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-5">
        <Link to="/" className="flex items-center gap-2.5">
          <img
            src={logo}
            alt="Logotipo de Alanna Confirmaciones"
            width={36}
            height={36}
            className="size-9 rounded-xl bg-primary object-contain p-1.5"
          />
          <div>
            <p className="font-display text-2xl leading-none">Alanna</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-gold">
              Confirmaciones
            </p>
          </div>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            to="/para-wedding-planners"
            className="hidden px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground md:inline"
          >
            Para planners
          </Link>
          <Link
            to="/blog"
            className="hidden px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground sm:inline"
          >
            Blog
          </Link>
          {session ? (
            <Button asChild>
              <Link to="/eventos">Ir al panel</Link>
            </Button>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link to="/iniciar-sesion">Iniciar sesión</Link>
              </Button>
              <Button asChild>
                <Link to="/registro">Registrarse</Link>
              </Button>
            </>
          )}
        </nav>
      </header>
      {children}
      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-display text-lg">Alanna Confirmaciones</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              Software de confirmación de invitados por WhatsApp para wedding
              planners en México. Contacto: {LEGAL_CONTACT_EMAIL}
            </p>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
            {footerLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
            <Link to="/iniciar-sesion" className="hover:text-foreground">
              Iniciar sesión
            </Link>
            <Link to="/registro" className="hover:text-foreground">
              Registrarse
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
