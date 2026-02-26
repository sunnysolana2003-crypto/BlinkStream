const logger = require("../utils/logger");

module.exports = function errorMiddleware(err, req, res, next) {
  logger.error(err?.message || "Unhandled error");

  if (res.headersSent) {
    return next(err);
  }

  const statusCode = Number(err?.statusCode || err?.status || 500);
  const safeStatusCode = Number.isFinite(statusCode) && statusCode >= 400 && statusCode < 600
    ? statusCode
    : 500;

  return res.status(safeStatusCode).json({ error: err.message || "Internal Server Error" });
};
