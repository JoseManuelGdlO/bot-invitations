export const WHATSAPP_RATE_CARD_META = {
  market: "Mexico",
  currency: "MXN",
  sourceUrl:
    "https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing#rates",
  sourceNote: "CSV rates Meta WhatsApp Business Platform (México)",
  updatedAt: "2026-09-23",
  ratesMxnPerMessage: {
    MARKETING: 0.5614,
    UTILITY: 0.1565,
    AUTHENTICATION: 0.1565,
    AUTHENTICATION_INTERNATIONAL: 0.1565,
    SERVICE: 0,
    REFERRAL_CONVERSION: 0,
  } as Record<string, number>,
};

export const WHATSAPP_RATES_MX_MXN = WHATSAPP_RATE_CARD_META.ratesMxnPerMessage;

export function rateForCategory(category: string): number | null {
  const name = category.trim().toUpperCase();
  if (name.startsWith("FREE_")) return 0;
  if (Object.hasOwn(WHATSAPP_RATES_MX_MXN, name)) {
    return WHATSAPP_RATES_MX_MXN[name];
  }
  return null;
}

export function estimateCostFromCategories(
  byCategory: Array<{ category: string; volume: number }>,
): {
  market: string;
  currency: string;
  sourceUrl: string;
  sourceNote: string;
  updatedAt: string;
  totalEstimatedCost: number;
  totalVolumePriced: number;
  rows: Array<{
    category: string;
    volume: number;
    rate: number | null;
    estimatedCost: number | null;
  }>;
} {
  const rows = byCategory.map(({ category, volume }) => {
    const rate = rateForCategory(category);
    const estimatedCost = rate === null ? null : volume * rate;
    return { category, volume, rate, estimatedCost };
  });

  let totalEstimatedCost = 0;
  let totalVolumePriced = 0;
  for (const row of rows) {
    if (row.rate === null) continue;
    totalVolumePriced += row.volume;
    if (row.estimatedCost !== null) totalEstimatedCost += row.estimatedCost;
  }

  return {
    market: WHATSAPP_RATE_CARD_META.market,
    currency: WHATSAPP_RATE_CARD_META.currency,
    sourceUrl: WHATSAPP_RATE_CARD_META.sourceUrl,
    sourceNote: WHATSAPP_RATE_CARD_META.sourceNote,
    updatedAt: WHATSAPP_RATE_CARD_META.updatedAt,
    totalEstimatedCost,
    totalVolumePriced,
    rows,
  };
}
