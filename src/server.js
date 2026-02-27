require("dotenv").config();

const http = require("http");
const app = require("./app");
const { DEMO_MODE } = require("./config/constants");
const { initSocket } = require("./sockets/socket");
const { startStreamJob, stopStreamJob } = require("./jobs/stream.job");
const { startAutonomousJob, stopAutonomousJob } = require("./jobs/autonomous.job");
const { startOrbitFlareOpsMonitor, stopOrbitFlareOpsMonitor } = require("./services/orbitflareOps.service");
const { startPriorityFeePoller, stopPriorityFeePoller } = require("./services/priorityFee.service");
const logger = require("./utils/logger");

const PORT = Number(process.env.PORT || 3000);
const server = http.createServer(app);
let isShuttingDown = false;

initSocket(server);

server.listen(PORT, () => {
  logger.info(`BlinkStream Unified Backend listening on ${PORT}`);
  startOrbitFlareOpsMonitor();

  if (!DEMO_MODE) {
    void startStreamJob();
  } else {
    logger.info("DEMO_MODE enabled: gRPC streaming disabled");
  }

  startAutonomousJob();
  startPriorityFeePoller();
});

async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  logger.info(`Shutting down gracefully on ${signal}...`);

  try {
    await stopStreamJob();
    stopAutonomousJob();
    stopOrbitFlareOpsMonitor();
    stopPriorityFeePoller();

    await new Promise((resolve) => {
      server.close(() => resolve());
    });

    logger.info("Graceful shutdown complete");
    process.exit(0);
  } catch (error) {
    logger.error("Graceful shutdown failed:", error.message);
    process.exit(1);
  }
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
