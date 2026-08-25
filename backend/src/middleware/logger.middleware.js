import { Logger } from "../utils/logger.js";

const httpLog = new Logger("HTTP");

export function requestLogger(req, res, next) {
  const start = Date.now();

  // Guarda la respuesta res.json sin alterar su envío
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    res.locals.responseBody = body;
    return originalJson(body);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    const { method, originalUrl, params, query, body } = req;
    const statusCode = res.statusCode;

    const payload = {
      status: statusCode,
      durationMs: duration,
      ...(Object.keys(params || {}).length > 0 && { params }),
      ...(Object.keys(query || {}).length > 0 && { query }),
      ...(body && Object.keys(body).length > 0 && { body }),
      ...(res.locals.responseBody && { response: res.locals.responseBody }),
    };

    const message = `${method} ${originalUrl} -> ${statusCode} (${duration}ms)`;

    if (statusCode >= 500) {
      httpLog.error(message, payload);
    } else if (statusCode >= 400) {
      httpLog.warn(message, payload);
    } else {
      httpLog.info(message, payload);
    }
  });

  next();
}