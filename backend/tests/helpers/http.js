import { jest } from "@jest/globals";

const defaultUser = {
  id: "usr_test_1",
  role: "client",
  name: "Ana Test",
  email: "ana@test.com",
  planId: "plan_1",
  isAdmin: false,
  subscriptionStatus: "active",
};

export function createMockReq(overrides = {}) {
  const {
    user,
    params,
    query,
    body,
    headers,
    cookies,
    rawBody,
    file,
    ...rest
  } = overrides;

  return {
    user: user === undefined ? { ...defaultUser } : user,
    params: params ?? {},
    query: query ?? {},
    body: body ?? {},
    headers: headers ?? {},
    cookies: cookies ?? {},
    rawBody,
    file,
    ...rest,
  };
}

export function createMockRes() {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  res.send = jest.fn(() => res);
  res.cookie = jest.fn(() => res);
  res.clearCookie = jest.fn(() => res);
  res.setHeader = jest.fn(() => res);
  return res;
}

export function mockNext() {
  return jest.fn();
}

export { defaultUser };
