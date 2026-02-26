const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { ACTIONS_CORS_HEADERS } = require("@solana/actions");

const metricsRoutes = require("./routes/metrics.routes");
const priceRoutes = require("./routes/price.routes");
const blinkRoutes = require("./routes/blink.routes");
const demoRoutes = require("./routes/demo.routes");
const healthRoutes = require("./routes/health.routes");
const errorMiddleware = require("./middleware/error.middleware");

const app = express();

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false
});

app.use((req, res, next) => {
  if (req.path === "/api/blinks/action") {
    res.set(ACTIONS_CORS_HEADERS);
    if (req.method === "OPTIONS") {
      return res.status(204).send();
    }
  }

  return next();
});

app.set("trust proxy", 1);
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());

app.use("/api/metrics", metricsRoutes);
app.use("/api/price", priceRoutes);
app.use("/api/health", healthRoutes);
app.use("/api/blinks", apiLimiter, blinkRoutes);
app.use("/api/demo", apiLimiter, demoRoutes);

app.use(errorMiddleware);

module.exports = app;
