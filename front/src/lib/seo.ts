export const siteOrigin = (
  (import.meta.env.VITE_SITE_URL as string | undefined) || "https://alannaconfirmaciones.com.mx"
).replace(/\/$/, "");

export function pageHead(opts: {
  title: string;
  description: string;
  path?: string;
  noindex?: boolean;
  canonical?: string;
}) {
  const canonical = opts.canonical ?? (opts.path ? `${siteOrigin}${opts.path}` : undefined);
  const meta: Array<Record<string, string>> = [
    { title: opts.title },
    { name: "description", content: opts.description },
    { property: "og:title", content: opts.title },
    { property: "og:description", content: opts.description },
    { property: "og:type", content: "website" },
    { property: "og:url", content: canonical || siteOrigin },
    { property: "og:image", content: `${siteOrigin}/og-image.png` },
    { property: "og:locale", content: "es_MX" },
    { property: "og:site_name", content: "Alanna Confirmaciones" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: opts.title },
    { name: "twitter:description", content: opts.description },
    { name: "twitter:image", content: `${siteOrigin}/og-image.png` },
  ];
  if (opts.noindex) meta.push({ name: "robots", content: "noindex, nofollow" });
  const links = canonical ? [{ rel: "canonical", href: canonical }] : [];
  return { meta, links };
}

export const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "¿Qué es Alanna Confirmaciones?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Alanna es una plataforma para wedding planners que confirma invitados de bodas y eventos con conversaciones asistidas por IA.",
      },
    },
    {
      "@type": "Question",
      name: "¿Cómo confirman los invitados su asistencia?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "El asistente envía mensajes por WhatsApp, interpreta la respuesta y registra cuántas personas asistirán.",
      },
    },
    {
      "@type": "Question",
      name: "¿Puedo importar mi lista de invitados?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Sí. Puedes cargar un archivo Excel o CSV, mapear columnas y empezar las confirmaciones.",
      },
    },
    {
      "@type": "Question",
      name: "¿Cuánto cuesta Alanna?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "El plan Esencial cuesta 500 pesos mexicanos al mes e incluye 2 eventos y 300 invitados. También hay planes Estudio y Atelier con más volumen.",
      },
    },
  ],
};

export const businessJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Alanna Confirmaciones",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description: "Copiloto inteligente para confirmar invitados de bodas y eventos.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "MXN" },
  publisher: {
    "@type": "Organization",
    name: "Alanna",
    url: siteOrigin,
  },
};
