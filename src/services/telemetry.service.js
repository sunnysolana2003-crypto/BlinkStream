const { DEMO_MODE } = require("../config/constants");
const { getConnection } = require("../config/rpc.config");
const { supabaseAdmin, supabase } = require("../db/supabase.client");
const logger = require("../utils/logger");

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildStandardEvent(payload) {
  const blink = payload?.blink || {};
  const latency = blink.latency || {};

  return {
    type: payload?.type || "SURGE",
    token: payload?.token || "SOL",
    changePercent: toNumber(payload?.changePercent, 0),
    usdValue: toNumber(payload?.usdValue, 0),
    blink: {
      blinkUrl: blink.blinkUrl || "",
      latency: {
        quoteLatency: toNumber(latency.quoteLatency, 0),
        simulationLatency: toNumber(latency.simulationLatency, 0),
        blinkLatency: toNumber(latency.blinkLatency, 0),
        total: toNumber(latency.total, 0)
      }
    },
    slot: toNumber(payload?.slot, 0),
    timestamp: toNumber(payload?.timestamp, Date.now())
  };
}

async function getMetrics() {
  const start = Date.now();

  if (DEMO_MODE) {
    return {
      rpcLatency: 1,
      slot: 257382992,
      network: process.env.SOLANA_NETWORK || "mainnet-beta"
    };
  }

  try {
    // Add a race condition to prevent long hangs on health checks
    const slot = await Promise.race([
      getConnection().getSlot(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("RPC Timeout")), 3000))
    ]);

    return {
      rpcLatency: Date.now() - start,
      slot,
      network: process.env.SOLANA_NETWORK || "mainnet-beta"
    };
  } catch (error) {
    logger.warn("Metrics fetch failed or timed out:", error.message);
    return {
      rpcLatency: null,
      slot: null,
      network: process.env.SOLANA_NETWORK || "mainnet-beta",
      error: error.message
    };
  }
}

async function persistEvent(event, options = {}) {
  const dbClient = supabaseAdmin || supabase;
  if (!dbClient) {
    return { persisted: false, reason: "supabase_not_configured" };
  }

  const signature = typeof options.signature === "string" ? options.signature : null;

  const { error } = await dbClient.from("events").insert({
    type: event.type,
    token: event.token,
    change_percent: event.changePercent,
    usd_value: event.usdValue,
    blink_url: event.blink.blinkUrl,
    latency: event.blink.latency,
    slot: event.slot,
    signature
  });

  if (error) {
    logger.warn("Supabase event insert failed:", error.message);
    throw error;
  }

  return { persisted: true };
}

module.exports = {
  buildStandardEvent,
  getMetrics,
  persistEvent
};
