import { jest } from "@jest/globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createModelsBundle, createStripeClientMock } from "./models.js";

const backendRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

export function srcPath(rel) {
  return path.join(backendRoot, rel);
}

export async function loadWithMocks(moduleRel, options = {}) {
  const {
    models = createModelsBundle(),
    extraMocks = {},
    mockStripePackage = true,
    stripeClient = createStripeClientMock(),
  } = options;

  jest.resetModules();

  // Mock de Sequelize y Base de Datos
  await jest.unstable_mockModule("../../src/models/index.js", () => ({
    ...models,
  }));

  await jest.unstable_mockModule("../../src/config/database.js", () => ({
    sequelize: models.sequelize,
  }));

  // Mock del paquete 'stripe' de npm
  if (mockStripePackage) {
    await jest.unstable_mockModule("stripe", () => ({
      default: jest.fn(() => stripeClient),
    }));
  }

  // Mock automático de stripe.service.js (solo si NO se está testeando stripe.service.js y no se pasó en extraMocks)
  const isStripeServiceItself = moduleRel.includes("stripe.service");
  const hasCustomStripeMock = extraMocks["src/services/stripe.service.js"] || extraMocks["../../src/services/stripe.service.js"];

  if (!isStripeServiceItself && !hasCustomStripeMock) {
    await jest.unstable_mockModule("../../src/services/stripe.service.js", () => ({
      createCheckoutSession: jest.fn(),
      createCustomerPortalSession: jest.fn(),
      createPortalSession: jest.fn(),
      startCheckout: jest.fn(),
      handleStripeEvent: jest.fn(),
      scheduleCancelAtPeriodEnd: jest.fn().mockResolvedValue({ scheduled: true, status: "active" }),
      getStripe: jest.fn(() => stripeClient),
      stripeEnabled: jest.fn(() => true),
      syncStripePlans: jest.fn(),
      confirmCheckoutSession: jest.fn(),
    }));
  }

  // Mocks adicionales pasados por cada test
  for (const [modPath, factory] of Object.entries(extraMocks)) {
    const specifier = modPath.startsWith("src/") ? `../../${modPath}` : modPath;
    await jest.unstable_mockModule(specifier, factory);
  }

  const mod = await import(`../../${moduleRel}`);
  return { mod, models, stripeClient };
}

export function fakePlan(overrides = {}) {
  return {
    id: "plan_1",
    slug: "estudio",
    name: "Estudio",
    tagline: "El ritmo de un estudio",
    priceMxn: 1200,
    eventLimit: 6,
    guestLimit: 1000,
    highlighted: true,
    sortOrder: 2,
    annualDiscountPercent: 20,
    stripeProductId: "prod_1",
    stripePriceId: "price_month",
    stripeYearlyPriceId: "price_year",
    save: jest.fn(async function save() {
      return this;
    }),
    ...overrides,
  };
}

export function fakeUser(overrides = {}) {
  const user = {
    id: "usr_test_1",
    name: "Ana Test",
    email: "ana@test.com",
    role: "Wedding Planner",
    businessName: "Studio Ana",
    phone: "5512345678",
    state: "CDMX",
    planId: "plan_1",
    isAdmin: false,
    subscriptionStatus: "active",
    billingInterval: "month",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    passwordHash: "hash",
    tokenVersion: 0,
    createdAt: new Date("2026-01-01"),
    save: jest.fn(async function save() {
      return this;
    }),
    reload: jest.fn(async function reload() {
      return this;
    }),
    ...overrides,
  };
  user.save.mockImplementation(async () => user);
  user.reload.mockImplementation(async () => user);
  return user;
}

export function fakeEvent(overrides = {}) {
  const event = {
    id: "evt_1",
    ownerId: "usr_test_1",
    slug: "boda-ana",
    name: "Boda Ana",
    shortName: "A&C",
    type: "Boda",
    hosts: "Ana y Carlos",
    date: "2027-01-01",
    time: "18:00",
    timezone: "America/Mexico_City",
    venue: "Hacienda",
    address: "",
    estimatedGuests: 100,
    cover: "linear-gradient(135deg, var(--gold-soft), var(--rose))",
    status: "borrador",
    save: jest.fn(async function save() {
      return this;
    }),
    ...overrides,
  };
  event.save.mockImplementation(async () => event);
  return event;
}

export function fakeGuest(overrides = {}) {
  const guest = {
    id: "gst_1",
    eventId: "evt_1",
    rep: "Luis Pérez",
    phone: "5598765432",
    invited: 2,
    confirmed: 0,
    table: "",
    family: "",
    guestType: "",
    notes: "",
    tag: "Sin etiqueta",
    customData: {},
    status: "sin_contactar",
    whatsapp: "pendiente",
    lastMessage: "",
    lastReply: "",
    lastReplyAt: "",
    followUp: "",
    followUpsSent: [],
    confirmedAt: null,
    contactedAt: null,
    save: jest.fn(async function save() {
      return this;
    }),
    reload: jest.fn(async function reload() {
      return this;
    }),
    changed: jest.fn(),
    ...overrides,
  };
  guest.save.mockImplementation(async () => guest);
  guest.reload.mockImplementation(async () => guest);
  return guest;
}