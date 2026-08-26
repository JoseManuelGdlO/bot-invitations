import { Link, createFileRoute } from "@tanstack/react-router";
import { pageHead, buildBreadcrumbJsonLd, jsonLdScripts } from "@/lib/seo";
import { blogArticles } from "@/lib/content/blog-articles";

export const Route = createFileRoute("/blog/")({
  head: () => ({
    ...pageHead({
      title: "Blog para wedding planners · Alanna Confirmaciones",
      description:
        "Guías de RSVP, listas de invitados y confirmación por WhatsApp para wedding planners. Escritas desde la operación de Alanna Confirmaciones.",
      path: "/blog",
    }),
    scripts: jsonLdScripts(
      buildBreadcrumbJsonLd([
        { name: "Inicio", path: "/" },
        { name: "Blog", path: "/blog" },
      ]),
    ),
  }),
  component: BlogIndex,
});

function BlogIndex() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12 lg:py-16">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">Blog</p>
      <h1 className="mt-3 font-display text-4xl leading-[1.1] sm:text-5xl">Guías para confirmar invitados</h1>
      <p className="mt-5 text-base leading-relaxed text-muted-foreground">
        Listas, WhatsApp y cierre de RSVP para wedding planners. Sin recetas vacías: el proceso que usa un estudio
        cuando la boda ya no cabe en un chat personal.
      </p>
      <ul className="mt-10 space-y-4">
        {blogArticles.map((article) => (
          <li key={article.slug}>
            <article className="rounded-2xl border border-border bg-card p-6 shadow-soft">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gold">{article.kicker}</p>
              <h2 className="mt-2 font-display text-2xl">
                <Link
                  to="/blog/$slug"
                  params={{ slug: article.slug }}
                  className="hover:underline hover:underline-offset-4"
                >
                  {article.title}
                </Link>
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{article.description}</p>
            </article>
          </li>
        ))}
      </ul>
    </main>
  );
}
