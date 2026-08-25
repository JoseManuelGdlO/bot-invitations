import { jest } from "@jest/globals";

export function createSequelizeMock() {
  return {
    transaction: jest.fn(async (cb) => {
      const t = { commit: jest.fn(), rollback: jest.fn() };
      return typeof cb === "function" ? await cb(t) : t;
    }),
    fn: jest.fn((name, ...args) => ({ fn: name, args })),
    col: jest.fn((name) => ({ col: name })),
    literal: jest.fn((value) => ({ literal: value })),
  };
}

export function createModelMock(name = "Model") {
  return {
    name,
    findAll: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
    findByPk: jest.fn(async () => null),
    create: jest.fn(async (data = {}) => createInstance(data)),
    update: jest.fn(async () => [1]),
    destroy: jest.fn(async () => 1),
    count: jest.fn(async () => 0),
    sum: jest.fn(async () => 0),
    bulkCreate: jest.fn(async (rows = []) => rows.map((row) => createInstance(row))),
    findOrCreate: jest.fn(async ({ defaults = {} } = {}) => [createInstance(defaults), true]),
  };
}

export function createInstance(data = {}) {
  const row = {
    ...data,
    save: jest.fn(async function save() {
      return this;
    }),
    reload: jest.fn(async function reload() {
      return this;
    }),
    destroy: jest.fn(async function destroy() {
      return this;
    }),
    update: jest.fn(async function update(patch) {
      Object.assign(this, patch);
      return this;
    }),
  };
  row.save.mockImplementation(async () => row);
  row.reload.mockImplementation(async () => row);
  return row;
}

const MODEL_NAMES = [
  "Plan",
  "User",
  "RefreshToken",
  "PasswordReset",
  "Event",
  "EventMember",
  "EventRolePermission",
  "Guest",
  "Conversation",
  "Message",
  "AiConfig",
  "Template",
  "Faq",
  "Activity",
  "Campaign",
  "Payment",
  "SupportTicket",
  "SupportMessage",
  "CancellationRequest",
  "OutboundJob",
];

export function createModelsBundle() {
  const sequelize = createSequelizeMock();
  const models = { sequelize, syncModels: jest.fn(async () => undefined) };
  for (const name of MODEL_NAMES) {
    models[name] = createModelMock(name);
  }
  return models;
}

export function createStripeClientMock() {
  return {
    webhooks: {
      constructEvent: jest.fn(),
    },
    prices: {
      retrieve: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    products: {
      retrieve: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    customers: {
      retrieve: jest.fn(),
      create: jest.fn(),
    },
    subscriptions: {
      retrieve: jest.fn(),
      update: jest.fn(),
    },
    checkout: {
      sessions: {
        create: jest.fn(),
        retrieve: jest.fn(),
      },
    },
    billingPortal: {
      configurations: {
        list: jest.fn(async () => ({ data: [] })),
        create: jest.fn(),
      },
      sessions: {
        create: jest.fn(),
      },
    },
    invoices: {
      list: jest.fn(async () => ({ data: [], has_more: false })),
    },
    balance: {
      retrieve: jest.fn(async () => ({ available: [], pending: [] })),
    },
  };
}
