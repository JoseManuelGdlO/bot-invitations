import { Logger } from "./logger.js";

const ctrlLog = new Logger("Controller");

export const asyncHandler = (fn) => (req, res, next) => {
  const handlerName = fn.name || "anonymousHandler";
  const start = Date.now();

  return Promise.resolve(fn(req, res, next))
    .then((result) => result)
    .catch((err) => {
      ctrlLog.error(`[FAIL] ${handlerName} falló en ${Date.now() - start}ms -> ${err.message}`, {
        handler: handlerName,
        error: err.message,
        stack: err.stack,
        params: req.params,
        query: req.query,
      });
      next(err);
    });
};
