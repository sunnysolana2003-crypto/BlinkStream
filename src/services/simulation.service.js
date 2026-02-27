const { Transaction, VersionedTransaction } = require("@solana/web3.js");
const { DEMO_MODE, DEMO_PAYLOAD } = require("../config/constants");
const { getConnection } = require("../config/rpc.config");
const logger = require("../utils/logger");
let lastExpectedSimulationLogAt = 0;

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Timeout")), ms);
    })
  ]);
}

function normalizeBase64(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  if (!normalized) {
    return "";
  }

  const padLength = normalized.length % 4;
  if (padLength === 0) {
    return normalized;
  }

  return normalized + "=".repeat(4 - padLength);
}

function isExpectedSimulationRuntimeError(simulationError) {
  const raw = JSON.stringify(simulationError || "");
  // Common non-fatal simulation case: token/Jupiter path with insufficient balance/state.
  return raw.includes("\"InstructionError\"") && raw.includes("\"Custom\":1");
}

async function simulateWithRpcRequest(encodedTransaction) {
  const connection = getConnection();

  if (typeof connection._rpcRequest !== "function") {
    return null;
  }

  const rpcResponse = await withTimeout(
    connection._rpcRequest("simulateTransaction", [
      normalizeBase64(encodedTransaction),
      {
        encoding: "base64",
        sigVerify: false,
        replaceRecentBlockhash: true,
        commitment: "processed"
      }
    ]),
    3000
  );

  if (rpcResponse?.error) {
    throw new Error(rpcResponse.error.message || "simulateTransaction RPC error");
  }

  return rpcResponse?.result || null;
}

async function simulateSwap(quote) {
  const start = Date.now();

  if (DEMO_MODE) {
    return {
      simulation: null,
      latency: DEMO_PAYLOAD.latency.simulationLatency,
      skipped: true,
      success: true
    };
  }

  if (!quote?.swapTransaction) {
    return {
      simulation: null,
      latency: Date.now() - start,
      skipped: true,
      success: false,
      error: "No swap transaction to simulate"
    };
  }

  try {
    let simulation = null;
    const serializedBase64 = normalizeBase64(quote.swapTransaction);

    try {
      simulation = await simulateWithRpcRequest(serializedBase64);
    } catch (error) {
      logger.warn("RPC raw simulation failed, falling back to SDK simulation:", error.message);
    }

    if (!simulation) {
      const serialized = Buffer.from(serializedBase64, "base64");
      let tx;

      try {
        tx = VersionedTransaction.deserialize(serialized);
      } catch (error) {
        tx = Transaction.from(serialized);
      }

      simulation = await withTimeout(
        getConnection().simulateTransaction(tx, {
          sigVerify: false,
          replaceRecentBlockhash: true
        }),
        3000
      );
    }

    const simulationError = simulation?.value?.err || null;
    if (simulationError) {
      if (isExpectedSimulationRuntimeError(simulationError)) {
        const now = Date.now();
        if (now - lastExpectedSimulationLogAt > 60000) {
          logger.info(
            "Simulation returned expected runtime error (likely insufficient balance/account state on simulation wallet)"
          );
          lastExpectedSimulationLogAt = now;
        } else {
          logger.debug("Simulation returned expected runtime error:", JSON.stringify(simulationError));
        }
      } else {
        logger.warn("Simulation returned runtime error:", JSON.stringify(simulationError));
      }
    }

    return {
      simulation,
      latency: Date.now() - start,
      skipped: false,
      success: !simulationError,
      error: simulationError ? JSON.stringify(simulationError) : null
    };
  } catch (error) {
    logger.warn("Simulation failed:", error.message);
    return {
      simulation: null,
      latency: Date.now() - start,
      skipped: true,
      success: false,
      error: error.message
    };
  }
}

module.exports = { simulateSwap };
