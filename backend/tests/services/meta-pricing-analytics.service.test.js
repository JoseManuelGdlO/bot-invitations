import { jest } from "@jest/globals";

describe("meta-pricing-analytics.service", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test("parsePricingRange rechaza valores inválidos y acepta presets", async () => {
    const { parsePricingRange } = await import("../../src/services/meta-pricing-analytics.service.js");
    expect(() => parsePricingRange("1y")).toThrow(/7d, 30d o 90d/);
    const parsed = parsePricingRange("7d");
    expect(parsed.range).toBe("7d");
    expect(parsed.end).toBeGreaterThan(parsed.start);
    expect(parsed.end - parsed.start).toBeGreaterThanOrEqual(6 * 24 * 60 * 60);
    expect(parsed.end - parsed.start).toBeLessThanOrEqual(8 * 24 * 60 * 60);
  });

  test("normalizePricingAnalytics agrega KPIs, series y categorías", async () => {
    const { normalizePricingAnalytics } = await import(
      "../../src/services/meta-pricing-analytics.service.js"
    );
    const out = normalizePricingAnalytics({
      range: "30d",
      start: 1700000000,
      end: 1702592000,
      payload: {
        pricing_analytics: {
          data: [
            {
              data_points: [
                {
                  start: 1700000000,
                  end: 1700086400,
                  volume: 100,
                  cost: 12.5,
                  currency: "USD",
                  pricing_category: "MARKETING",
                  pricing_type: "REGULAR",
                },
                {
                  start: 1700000000,
                  end: 1700086400,
                  volume: 40,
                  cost: 0,
                  currency: "USD",
                  pricing_category: "SERVICE",
                  pricing_type: "FREE",
                },
                {
                  start: 1700086400,
                  end: 1700172800,
                  volume: 20,
                  cost: 3,
                  currency: "USD",
                  pricing_category: "UTILITY",
                  pricing_type: "REGULAR",
                },
              ],
            },
          ],
        },
      },
    });

    expect(out.costAvailable).toBe(true);
    expect(out.currency).toBe("USD");
    expect(out.kpis.totalVolume).toBe(160);
    expect(out.kpis.totalCost).toBeCloseTo(15.5);
    expect(out.kpis.freeVolume).toBe(40);
    expect(out.kpis.paidVolume).toBe(120);
    expect(out.kpis.avgCostPerMessage).toBeCloseTo(15.5 / 160);
    expect(out.series).toHaveLength(2);
    expect(out.series[0].volume).toBe(140);
    expect(out.byCategory.map((r) => r.category)).toEqual(["MARKETING", "SERVICE", "UTILITY"]);
  });

  test("normalizePricingAnalytics marca costAvailable false si no hay cost", async () => {
    const { normalizePricingAnalytics } = await import(
      "../../src/services/meta-pricing-analytics.service.js"
    );
    const out = normalizePricingAnalytics({
      range: "7d",
      start: 1,
      end: 2,
      payload: {
        pricing_analytics: {
          data: [{ data_points: [{ start: 1, volume: 50, pricing_category: "MARKETING" }] }],
        },
      },
    });
    expect(out.costAvailable).toBe(false);
    expect(out.kpis.totalCost).toBeNull();
    expect(out.kpis.avgCostPerMessage).toBeNull();
    expect(out.kpis.totalVolume).toBe(50);
    expect(out.byCategory[0].cost).toBeNull();
  });

  test("getOwnerPricingAnalytics usa credenciales, Graph y cache 5m", async () => {
    const getWabaPricingAnalytics = jest.fn(async () => ({
      pricing_analytics: {
        data: [
          {
            data_points: [
              {
                start: 1700000000,
                volume: 10,
                cost: 2,
                currency: "MXN",
                pricing_category: "MARKETING",
              },
            ],
          },
        ],
      },
    }));
    const resolveActiveWhatsappMetaByOwner = jest.fn(async () => ({
      credentials: { accessToken: "tok", wabaId: "waba_1" },
    }));

    await jest.unstable_mockModule("../../src/services/meta-graph.client.js", () => ({
      getWabaPricingAnalytics,
    }));
    await jest.unstable_mockModule("../../src/services/whatsapp-meta.service.js", () => ({
      resolveActiveWhatsappMetaByOwner,
    }));

    const mod = await import("../../src/services/meta-pricing-analytics.service.js");
    mod.clearPricingAnalyticsCache();

    const first = await mod.getOwnerPricingAnalytics({ ownerUserId: "user_1", range: "30d" });
    expect(first.cached).toBe(false);
    expect(first.kpis.totalCost).toBe(2);
    expect(getWabaPricingAnalytics).toHaveBeenCalledTimes(1);
    expect(getWabaPricingAnalytics.mock.calls[0][0]).toEqual(
      expect.objectContaining({ wabaId: "waba_1", token: "tok", granularity: "DAILY" }),
    );

    const second = await mod.getOwnerPricingAnalytics({ ownerUserId: "user_1", range: "30d" });
    expect(second.cached).toBe(true);
    expect(getWabaPricingAnalytics).toHaveBeenCalledTimes(1);
  });
});
