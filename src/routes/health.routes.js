const express = require("express");
const { DEMO_MODE } = require("../config/constants");
const { getMetrics } = require("../services/telemetry.service");
const { getQuoteSourceStats } = require("../services/jupiter.service");
const { getStreamStatus } = require("../jobs/stream.job");
const { getOrbitFlareUsageSnapshot } = require("../services/orbitflareRpc.service");
const { getOrbitFlareOpsSnapshot } = require("../services/orbitflareOps.service");
const { buildOrbitFlareUtilizationScore } = require("../services/orbitflareScore.service");
const logger = require("../utils/logger");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    let rpcLatency = null;

    try {
      const metrics = await getMetrics();
      rpcLatency = metrics.rpcLatency;
    } catch (error) {
      logger.warn("Health metrics probe failed:", error.message);
    }

    const orbitflareUsage = getOrbitFlareUsageSnapshot();
    const streamStatus = getStreamStatus();
    const orbitflareOps = getOrbitFlareOpsSnapshot();
    const orbitflareScore = buildOrbitFlareUtilizationScore({
      usage: orbitflareUsage,
      stream: streamStatus,
      opsSnapshot: orbitflareOps
    });

    return res.json({
      status: "ok",
      mode: DEMO_MODE ? "demo" : "real",
      stream: streamStatus,
      rpcLatency,
      quotePath: getQuoteSourceStats(),
      orbitflareUsage: {
        totalCalls: orbitflareUsage.totalCalls,
        successRate: orbitflareUsage.successRate,
        websocket: orbitflareUsage.websocket || null,
        submissions: orbitflareUsage.submissions || null,
        lastProbe: orbitflareUsage.lastProbe,
        lastAdvancedProbe: orbitflareUsage.lastAdvancedProbe || null
      },
      orbitflareOps: {
        configured: orbitflareOps.configured,
        stats: orbitflareOps.stats,
        lastProbe: orbitflareOps.lastProbe
      },
      orbitflareScore,
      uptime: process.uptime()
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
