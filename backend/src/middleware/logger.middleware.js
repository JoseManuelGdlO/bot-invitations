import { Logger } from "../utils/logger.js";

const httpLog = new Logger("HTTP");
const MUTATING = new Set(["POST", "PUT", "PATCH"]);

function hasKeys(value) {
  return Boolean(value) && typeof value === "object" && Object.keys(value).length > 0;
}

export function requestLogger(req, res, next) {
  const start = Date.now();

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    res.locals.responseBody = body;
    return originalJson(body);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    const { method, originalUrl, params, query, body } = req;
    const statusCode = res.statusCode;
    const message = `${method} ${originalUrl} -> ${statusCode} (${duration}ms)`;

    if (statusCode >= 400) {
      const payload = {
        status: statusCode,
        durationMs: duration,
        ...(hasKeys(params) && { params }),
        ...(hasKeys(query) && { query }),
        ...(hasKeys(body) && { body }),
        ...(res.locals.responseBody && { response: res.locals.responseBody }),
      };
      if (statusCode >= 500) httpLog.error(message, payload);
      else httpLog.warn(message, payload);
      return;
    }

    httpLog.info(message);
    if (MUTATING.has(method) && hasKeys(body)) {
      httpLog.debug(`${method} ${originalUrl} body`, { body });
    }
  });

  next();
}
