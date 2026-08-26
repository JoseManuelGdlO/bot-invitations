import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  pageHead,
  buildArticleJsonLd,
  buildBreadcrumbJsonLd,
  jsonLdScripts,
} from "@/lib/seo";
import { blogArticles, getArticle } from "@/lib/content/blog-articles";

export const Route = createFileRoute("/blog/$slug")({
  loader: ({ params }) => {
    const article = getArticle(params.slug);
    if (!article) throw notFound();
    return { article };
  },
  head: ({ params }) => {
    const article = getArticle(params.slug);
    if (!article) return {};
    const path = `/blog/${article.slug}`;
    return {
      ...pageHead({
        title: `${article.title} · Alanna Confirmaciones`,
        description: article.description,
        path,
        ogType: "article",
      }),
      scripts: jsonLdScripts(
        buildArticleJsonLd({
          title: article.title,
          description: article.description,
          path,
          datePublished: article.datePublished,
        }),
        buildBreadcrumbJsonLd([
          { name: "Inicio", path: "/" },
          { name: "Blog", path: "/blog" },
          { name: article.title, path },
        ]),
      ),
    };
  },
  component: BlogArticlePage,
});

function BlogArticlePage() {
  const { article } = Route.useLoaderData();
  const related = blogArticles.filter((item) => item.slug !== article.slug).slice(0, 3);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12 lg:py-16">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">{article.kicker}</p>
      <h1 className="mt-3 font-display text-4xl leading-[1.1] sm:text-5xl">{article.title}</h1>
      <p className="mt-5 text-base leading-relaxed text-muted-foreground">{article.intro}</p>
      <div className="mt-10 space-y-10">
        {article.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="font-display text-3xl">{section.heading}</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 48)}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="mt-12 rounded-2xl border border-border bg-card p-6">
        <p className="font-display text-2xl">¿Quieres dejar de confirmar a mano?</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Alanna Confirmaciones importa tu lista, conversa por WhatsApp y te entrega la lista final.
        </p>
        <Button className="mt-4" asChild>
          <Link to="/registro">Crear cuenta</Link>
        </Button>
      </div>
      <section className="mt-12">
        <h2 className="font-display text-2xl">Más del blog</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {related.map((item) => (
            <li key={item.slug}>
              <Link
                to="/blog/$slug"
                params={{ slug: item.slug }}
                className="text-foreground underline-offset-4 hover:underline"
              >
                {item.title}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
