const {
  DEMO_MODE,
  DEMO_PAYLOAD,
  AUTONOMOUS_POLL_MS,
  SOL_TOKEN
} = require("../config/constants");

const MINT_ADDRESS_REGEX_ACTIVE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SYMBOL_REGEX_ACTIVE = /^[A-Za-z0-9._-]{2,24}$/;

// The single token currently being surge-monitored (mirrors dashboard selection).
let activeToken = SOL_TOKEN;
const { getConnection } = require("../config/rpc.config");
const { getPrice, getDeterministicDemoSurge } = require("../services/price.service");
const { evaluatePriceSurge } = require("../services/surgeEngine.service");
const { generateBlink } = require("../services/blink.service");
const { buildStandardEvent, persistEvent } = require("../services/telemetry.service");
const { emitEvent } = require("../sockets/socket");
const logger = require("../utils/logger");

let intervalRef = null;
let lastBlinkTimestamp = 0;
let cycleRunning = false;

function normalizeAutonomousToken(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  if (MINT_ADDRESS_REGEX_ACTIVE.test(raw)) {
    return raw;
  }

  if (!SYMBOL_REGEX_ACTIVE.test(raw)) {
    return "";
  }

  return raw.toUpperCase();
}

/**
 * Set the single token that the autonomous surge monitor watches.
 * Called by the frontend whenever the dashboard dropdown changes.
 */
function setActiveToken(token) {
  const normalized = normalizeAutonomousToken(token);
  if (!normalized) {
    const error = new Error("Invalid token. Use symbol (e.g., SOL) or valid mint address");
    error.statusCode = 400;
    throw error;
  }

  activeToken = normalized;
  return activeToken;
}

function getActiveToken() {
  return activeToken;
}

function parseTokenList(value, fallback) {
  const parsed = String(value || "")
    .split(",")
    .map((token) => normalizeAutonomousToken(token))
    .filter(Boolean);

  if (parsed.length) {
    return [...new Set(parsed)];
  }

  return fallback;
}

// Known/supported token list (for the dropdown). Surge only runs on activeToken.
const autonomousTokenSet = new Set(
  parseTokenList(process.env.AUTONOMOUS_TOKENS, [SOL_TOKEN])
);

// Seed activeToken from the env list (first entry).
(function seedActiveToken() {
  const first = Array.from(autonomousTokenSet)[0];
  if (first) {
    activeToken = first;
  }
}());

function getAutonomousTokens() {
  return Array.from(autonomousTokenSet.values());
}

function addAutonomousToken(token) {
  const normalized = normalizeAutonomousToken(token);
  if (!normalized) {
    const error = new Error("Invalid token. Use symbol (e.g., SOL) or valid mint address");
    error.statusCode = 400;
    throw error;
  }

  autonomousTokenSet.add(normalized);
  return getAutonomousTokens();
}

function removeAutonomousToken(token) {
  const normalized = normalizeAutonomousToken(token);
  if (!normalized) {
    const error = new Error("Invalid token. Use symbol (e.g., SOL) or valid mint address");
    error.statusCode = 400;
    throw error;
  }

  if (autonomousTokenSet.size === 1 && autonomousTokenSet.has(normalized)) {
    const error = new Error("At least one autonomous token must remain");
    error.statusCode = 400;
    throw error;
  }

  autonomousTokenSet.delete(normalized);
  return getAutonomousTokens();
}

async function buildAndDispatchSurgeEvent({ token, changePercent, usdValue, slot, timestamp }) {
  if (lastBlinkTimestamp && Date.now() - lastBlinkTimestamp < 60000) {
    logger.warn("Blink generation skipped by anti-spam safeguard");
    return null;
  }

  const blink = await generateBlink({
    token,
    actionType: "buy"
  });

  const event = buildStandardEvent({
    type: "SURGE",
    token,
    changePercent,
    usdValue,
    blink,
    slot,
    timestamp
  });

  try {
    await persistEvent(event);
  } catch (error) {
    logger.warn("Event persistence failed:", error.message);
  }

  emitEvent("surge", event);
  lastBlinkTimestamp = Date.now();

  return event;
}

async function runAutonomousCycle(forceDemo = false) {
  try {
    if (cycleRunning) {
      logger.debug("Autonomous cycle skipped because previous cycle is still running");
      return null;
    }
    cycleRunning = true;

    if (DEMO_MODE && forceDemo) {
      const mock = await getDeterministicDemoSurge();
      return buildAndDispatchSurgeEvent({
        token: mock.token,
        changePercent: mock.changePercent,
        usdValue: mock.usdValue,
        slot: mock.slot,
        timestamp: mock.timestamp
      });
    }

    if (DEMO_MODE && !forceDemo) {
      return buildAndDispatchSurgeEvent({
        token: DEMO_PAYLOAD.token,
        changePercent: DEMO_PAYLOAD.changePercent,
        usdValue: DEMO_PAYLOAD.usdValue,
        slot: DEMO_PAYLOAD.slot,
        timestamp: Date.now()
      });
    }

    // Only poll the single token that the dashboard is currently watching.
    const token = getActiveToken();
    const price = await getPrice(token);
    const surge = evaluatePriceSurge(price.price, token, Date.now());

    if (surge) {
      const usdValue = Number((Math.abs(surge.changePercent) * 4000).toFixed(2));
      const slot = await getConnection().getSlot();

      return buildAndDispatchSurgeEvent({
        token,
        changePercent: surge.changePercent,
        usdValue,
        slot,
        timestamp: surge.timestamp
      });
    }

    return null;
  } catch (error) {
    logger.error("Autonomous cycle error:", error.message);
    return null;
  } finally {
    cycleRunning = false;
  }
}

function startAutonomousJob() {
  if (intervalRef) {
    return;
  }

  intervalRef = setInterval(async () => {
    try {
      await runAutonomousCycle(false);
    } catch (error) {
      logger.error("Autonomous interval error:", error.message);
    }
  }, AUTONOMOUS_POLL_MS);
}

function stopAutonomousJob() {
  if (!intervalRef) {
    return;
  }

  clearInterval(intervalRef);
  intervalRef = null;
}

async function triggerDemoEvent() {
  if (!DEMO_MODE) {
    throw new Error("DEMO_MODE is disabled");
  }

  return runAutonomousCycle(true);
}

module.exports = {
  startAutonomousJob,
  stopAutonomousJob,
  triggerDemoEvent,
  runAutonomousCycle,
  getAutonomousTokens,
  addAutonomousToken,
  removeAutonomousToken,
  getActiveToken,
  setActiveToken
};
