import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  estimateCostFromCategories,
  rateForCategory,
  WHATSAPP_RATES_MX_MXN,
} from "./whatsapp-rate-card.ts";

describe("estimateCostFromCategories", () => {
  it("suma volumen × tarifa MXN", () => {
    const out = estimateCostFromCategories([
      { category: "MARKETING", volume: 100 },
      { category: "UTILITY", volume: 200 },
      { category: "SERVICE", volume: 50 },
    ]);
    assert.equal(out.currency, "MXN");
    assert.equal(out.market, "Mexico");
    assert.ok(Math.abs(out.totalEstimatedCost - (100 * 0.5614 + 200 * 0.1565)) < 1e-9);
    assert.equal(out.rows.find((r) => r.category === "SERVICE")?.rate, 0);
  });

  it("trata FREE_* como tarifa 0 y no suma categorías desconocidas", () => {
    const out = estimateCostFromCategories([
      { category: "FREE_CUSTOMER_SERVICE", volume: 10 },
      { category: "UNKNOWN_CAT", volume: 99 },
      { category: "AUTHENTICATION_INTERNATIONAL", volume: 2 },
    ]);
    const freeRow = out.rows.find((r) => r.category === "FREE_CUSTOMER_SERVICE");
    assert.equal(freeRow?.rate, 0);
    assert.equal(freeRow?.estimatedCost, 0);

    const unknownRow = out.rows.find((r) => r.category === "UNKNOWN_CAT");
    assert.equal(unknownRow?.rate, null);
    assert.equal(unknownRow?.estimatedCost, null);

    const intlRow = out.rows.find((r) => r.category === "AUTHENTICATION_INTERNATIONAL");
    assert.equal(intlRow?.rate, 0.1565);
    assert.ok(Math.abs((intlRow?.estimatedCost ?? NaN) - 2 * 0.1565) < 1e-9);

    assert.ok(Math.abs(out.totalEstimatedCost - 2 * 0.1565) < 1e-9);
    assert.equal(out.totalVolumePriced, 12);
  });
});

describe("rateForCategory", () => {
  it("normaliza con trim y mayúsculas", () => {
    assert.equal(rateForCategory(" marketing "), 0.5614);
  });

  it("devuelve 0 para FREE_*", () => {
    assert.equal(rateForCategory("FREE_ENTRY_POINT"), 0);
  });

  it("devuelve 0.1565 para AUTHENTICATION_INTERNATIONAL", () => {
    assert.equal(rateForCategory("AUTHENTICATION_INTERNATIONAL"), 0.1565);
  });

  it("devuelve null para categorías desconocidas", () => {
    assert.equal(rateForCategory("NOT_A_REAL_CATEGORY"), null);
  });
});

describe("WHATSAPP_RATES_MX_MXN", () => {
  it("expone las tarifas MXN por mensaje", () => {
    assert.equal(WHATSAPP_RATES_MX_MXN.MARKETING, 0.5614);
    assert.equal(WHATSAPP_RATES_MX_MXN.UTILITY, 0.1565);
    assert.equal(WHATSAPP_RATES_MX_MXN.SERVICE, 0);
  });
});
