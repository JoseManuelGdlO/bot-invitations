import { jest } from "@jest/globals";
import { createMockReq, createMockRes, mockNext } from "../helpers/http.js";
import { loadWithMocks, fakePlan, fakeUser, fakeEvent, fakeGuest } from "../helpers/loadWithMocks.js";

export { createMockReq, createMockRes, mockNext, loadWithMocks, fakePlan, fakeUser, fakeEvent, fakeGuest };

export async function callHandler(handler, { req, res, next } = {}) {
  const request = req ?? createMockReq();
  const response = res ?? createMockRes();
  const nxt = next ?? jest.fn();

  await handler(request, response, nxt);
  
  // En caso de que el handler interno tarde un microtask adicional
  await new Promise((resolve) => setImmediate(resolve));

  return { req: request, res: response, next: nxt };
}