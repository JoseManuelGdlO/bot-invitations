import { asyncHandler } from "../utils/async.js";
import { getFinanceSnapshot } from "../services/finance.service.js";

export const snapshot = asyncHandler(async (_req, res) => {
  res.json(await getFinanceSnapshot());
});
