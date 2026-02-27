const {
  DEMO_MODE,
  SOL_TOKEN,
  DEFAULT_INPUT_MINT,
  DEFAULT_OUTPUT_MINT
} = require("../config/constants");
const {
  createOrbitFlareClient,
  buildSubscribeRequest,
  buildFallbackSubscribeRequest
} = require("../config/grpc.config");
const { parseTransaction } = require("../services/txParser.service");
const { detectLargeSwap } = require("../services/swapDetector.service");
const { detectAndEmitWhale } = require("../services/whale.service");
const { getSolPrice } = require("../services/price.service");
const { buildStandardEvent, persistEvent } = require("../services/telemetry.service");
const { rpcRequest, rpcBatch } = require("../services/orbitflareRpc.service");
const { emitEvent } = require("../sockets/socket");
const logger = require("../utils/logger");

let running = false;
let stopRequested = false;
let activeClient = null;
let activeStream = null;
let signatureCleanupTimer = null;
const defaultProgramFilterEnabled = String(process.env.ORBITFLARE_GRPC_USE_PROGRAM_FILTER || "true").toLowerCase() !== "false";
let useProgramFilter = defaultProgramFilterEnabled;

const recentSignatures = new Map();
const BACKFILL_ENABLED = String(process.env.ORBITFLARE_BACKFILL_ENABLED || "true").toLowerCase() !== "false";
const BACKFILL_LIMIT = Math.max(1, Math.min(Number(process.env.ORBITFLARE_BACKFILL_LIMIT || 25), 100));
const BACKFILL_BATCH_SIZE = Math.max(1, Math.min(Number(process.env.ORBITFLARE_BACKFILL_BATCH_SIZE || 8), 25));
const BACKFILL_ADDRESSES = (() => {
  const configured = String(process.env.ORBITFLARE_BACKFILL_ADDRESSES || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (configured.length) {
    return [...new Set(configured)].slice(0, 5);
  }

  return [DEFAULT_INPUT_MINT, DEFAULT_OUTPUT_MINT].filter(Boolean);
})();
const streamStatus = {
  running: false,
  connected: false,
  lastError: null,
  filterMode: useProgramFilter ? "program" : "broad",
  reconnectBackoffMs: 1000,
  reconnectCount: 0,
  lastConnectedAt: null,
  lastMessageAt: null,
  backfill: {
    enabled: BACKFILL_ENABLED,
    runs: 0,
    processedSignatures: 0,
    emittedEvents: 0,
    lastRunAt: null,
    lastDurationMs: null,
    lastRecoveredCount: 0,
    lastError: null
  }
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDuplicate(signature) {
  if (!signature) {
    return false;
  }

  if (recentSignatures.has(signature)) {
    return true;
  }

  recentSignatures.set(signature, Date.now());
  return false;
}

function startSignatureCleanup() {
  if (signatureCleanupTimer) {
    return;
  }

  signatureCleanupTimer = setInterval(() => {
    const now = Date.now();

    for (const [signature, timestamp] of recentSignatures) {
      if (now - timestamp > 60000) {
        recentSignatures.delete(signature);
      }
    }
  }, 60000);

  if (typeof signatureCleanupTimer.unref === "function") {
    signatureCleanupTimer.unref();
  }
}

function stopSignatureCleanup() {
  if (!signatureCleanupTimer) {
    return;
  }

  clearInterval(signatureCleanupTimer);
  signatureCleanupTimer = null;
}

function isProgramFilterRejected(error) {
  const message = String(error?.message || "").toLowerCase();
  if (!message) {
    return false;
  }

  return (
    message.includes("failed to create filter") ||
    message.includes("in filters is not allowed") ||
    (message.includes("invalid_argument") && message.includes("filter"))
  );
}

async function openStream(client) {
  const stream = await client.subscribe();
  const request = useProgramFilter
    ? buildSubscribeRequest({ filtered: true, useProgramFilter: true })
    : buildFallbackSubscribeRequest();
  await stream.write(request);

  return stream;
}

async function processParsedTransaction(parsedTx, options = {}) {
  if (!parsedTx) {
    return false;
  }

  if (isDuplicate(parsedTx.signature)) {
    logger.debug("Skipped duplicate signature:", parsedTx.signature);
    return false;
  }

  const solPrice = Number.isFinite(options.solPrice) && options.solPrice > 0
    ? options.solPrice
    : await getSolPrice();

  // Whale detection — runs async, does not block the main event flow
  detectAndEmitWhale(parsedTx, solPrice).catch((err) =>
    logger.warn("Whale detection error:", err.message)
  );

  const largeSwap = detectLargeSwap(parsedTx, solPrice);
  if (!largeSwap) {
    return false;
  }

  const event = buildStandardEvent({
    type: "LARGE_SWAP",
    token: SOL_TOKEN,
    changePercent: 0,
    usdValue: largeSwap.usdValue,
    blink: {
      blinkUrl: "",
      latency: {
        quoteLatency: 0,
        simulationLatency: 0,
        blinkLatency: 0,
        total: 0
      }
    },
    slot: largeSwap.slot,
    timestamp: Date.now()
  });

  try {
    await persistEvent(event, { signature: largeSwap.signature });
  } catch (error) {
    logger.warn("Large swap persistence failed:", error.message);
  }

  emitEvent("large-swap", event);
  return true;
}

function buildBackfillSignatureList(entries) {
  const deduped = new Map();

  for (const entry of entries) {
    const signature = String(entry?.signature || "").trim();
    if (!signature) {
      continue;
    }

    const existing = deduped.get(signature);
    if (!existing) {
      deduped.set(signature, entry);
      continue;
    }

    const currentSlot = Number(entry?.slot || 0);
    const existingSlot = Number(existing?.slot || 0);
    if (currentSlot > existingSlot) {
      deduped.set(signature, entry);
    }
  }

  return Array.from(deduped.values())
    .sort((left, right) => {
      const leftSlot = Number(left?.slot || 0);
      const rightSlot = Number(right?.slot || 0);

      if (leftSlot !== rightSlot) {
        return leftSlot - rightSlot;
      }

      const leftTime = Number(left?.blockTime || 0);
      const rightTime = Number(right?.blockTime || 0);
      return leftTime - rightTime;
    })
    .map((entry) => String(entry.signature));
}

async function fetchBackfillSignaturesForAddress(address) {
  const response = await rpcRequest(
    "getSignaturesForAddress",
    [address, { limit: BACKFILL_LIMIT, commitment: "confirmed" }],
    { timeoutMs: 4000 }
  );

  if (!response.success) {
    logger.warn(`Backfill signatures failed for ${address}:`, response.error);
    return [];
  }

  if (!Array.isArray(response.result)) {
    return [];
  }

  return response.result;
}

async function processBackfillTransactionBatch(signatures, solPrice) {
  if (!signatures.length) {
    return 0;
  }

  const requests = signatures.map((signature) => ({
    method: "getTransaction",
    params: [
      signature,
      {
        encoding: "jsonParsed",
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0
      }
    ]
  }));

  const responses = await rpcBatch(requests, { timeoutMs: 5000 });
  let emittedCount = 0;

  for (let index = 0; index < responses.length; index += 1) {
    const signature = signatures[index];
    const response = responses[index];

    if (!response?.success || !response?.result) {
      continue;
    }

    try {
      const parsedTx = await parseTransaction(response.result);
      if (!parsedTx) {
        continue;
      }

      if (!parsedTx.signature) {
        parsedTx.signature = signature;
      }

      const emitted = await processParsedTransaction(parsedTx, { solPrice });
      if (emitted) {
        emittedCount += 1;
      }
    } catch (error) {
      logger.warn(`Backfill tx parse failed for ${signature}:`, error.message);
    }
  }

  return emittedCount;
}

async function runBackfillSweep() {
  if (!BACKFILL_ENABLED || !BACKFILL_ADDRESSES.length) {
    return;
  }

  const startedAt = Date.now();
  streamStatus.backfill.runs += 1;
  streamStatus.backfill.lastRunAt = startedAt;

  try {
    const signatureEntries = [];
    for (const address of BACKFILL_ADDRESSES) {
      const entries = await fetchBackfillSignaturesForAddress(address);
      signatureEntries.push(...entries);
    }

    const signatures = buildBackfillSignatureList(signatureEntries).filter(
      (signature) => !recentSignatures.has(signature)
    );

    if (!signatures.length) {
      streamStatus.backfill.lastRecoveredCount = 0;
      streamStatus.backfill.lastError = null;
      return;
    }

    const solPrice = await getSolPrice();
    let emittedTotal = 0;

    for (let index = 0; index < signatures.length; index += BACKFILL_BATCH_SIZE) {
      const chunk = signatures.slice(index, index + BACKFILL_BATCH_SIZE);
      const emitted = await processBackfillTransactionBatch(chunk, solPrice);
      emittedTotal += emitted;
      streamStatus.backfill.processedSignatures += chunk.length;
    }

    streamStatus.backfill.emittedEvents += emittedTotal;
    streamStatus.backfill.lastRecoveredCount = emittedTotal;
    streamStatus.backfill.lastError = null;
  } catch (error) {
    streamStatus.backfill.lastError = error.message;
    logger.warn("Backfill sweep failed:", error.message);
  } finally {
    streamStatus.backfill.lastDurationMs = Date.now() - startedAt;
  }
}

async function closeActiveSubscription() {
  const stream = activeStream;
  const client = activeClient;
  activeStream = null;
  activeClient = null;

  if (stream) {
    try {
      if (typeof stream.close === "function") {
        await stream.close();
      } else if (typeof stream.cancel === "function") {
        stream.cancel();
      } else if (typeof stream.destroy === "function") {
        stream.destroy();
      } else if (typeof stream.end === "function") {
        stream.end();
      }
    } catch (error) {
      logger.warn("Stream close warning:", error.message);
    }
  }

  if (client && typeof client.close === "function") {
    try {
      client.close();
    } catch (error) {
      logger.warn("Client close warning:", error.message);
    }
  }
}

async function consumeStream(stream) {
  for await (const message of stream) {
    if (stopRequested) {
      break;
    }

    streamStatus.lastMessageAt = Date.now();

    try {
      const parsedTx = await parseTransaction(message);
      await processParsedTransaction(parsedTx);
    } catch (error) {
      logger.error("Stream message processing error:", error.message);
    }
  }
}

async function startSubscription() {
  activeClient = await createOrbitFlareClient();
  activeStream = await openStream(activeClient);

  streamStatus.connected = true;
  streamStatus.lastConnectedAt = Date.now();
  streamStatus.lastError = null;

  if (streamStatus.reconnectCount > 0) {
    await runBackfillSweep();
  }

  await consumeStream(activeStream);

  if (!stopRequested) {
    throw new Error("Stream ended unexpectedly");
  }
}

async function startStreamJob() {
  if (DEMO_MODE || running) {
    return;
  }

  running = true;
  stopRequested = false;
  streamStatus.running = true;
  streamStatus.connected = false;
  streamStatus.lastError = null;
  useProgramFilter = defaultProgramFilterEnabled;
  streamStatus.filterMode = useProgramFilter ? "program" : "broad";
  streamStatus.reconnectCount = 0;
  startSignatureCleanup();

  let backoff = 1000;

  while (!stopRequested) {
    streamStatus.reconnectBackoffMs = backoff;

    try {
      await startSubscription();
      backoff = 1000;
    } catch (error) {
      streamStatus.connected = false;
      streamStatus.lastError = error.message;
      streamStatus.reconnectCount += 1;

      if (stopRequested) {
        break;
      }

      if (useProgramFilter && isProgramFilterRejected(error)) {
        useProgramFilter = false;
        streamStatus.filterMode = "broad";
        logger.warn(
          "OrbitFlare plan rejected accountInclude filter. Switched stream mode to broad tx feed with local SPL parsing."
        );
        continue;
      }

      logger.error("Stream crashed:", error.message);
      await delay(backoff);
      backoff = Math.min(backoff * 2, 15000);
    } finally {
      await closeActiveSubscription();
    }
  }

  running = false;
  streamStatus.running = false;
  streamStatus.connected = false;
  stopSignatureCleanup();
}

async function stopStreamJob() {
  stopRequested = true;
  await closeActiveSubscription();
  stopSignatureCleanup();
}

function getStreamStatus() {
  return {
    ...streamStatus,
    dedupeCacheSize: recentSignatures.size
  };
}

module.exports = {
  startStreamJob,
  stopStreamJob,
  getStreamStatus
};
