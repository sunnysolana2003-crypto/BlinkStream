const express = require("express");
const { PublicKey } = require("@solana/web3.js");
const { getMetrics } = require("../services/telemetry.service");
const {
  getSurgeSettings,
  updateSurgeSettings
} = require("../services/surgeEngine.service");
const {
  getOrbitFlareChainPulse
} = require("../services/orbitflareRpc.service");
const { getStreamStatus } = require("../jobs/stream.job");
const {
  getAutonomousTokens,
  addAutonomousToken,
  removeAutonomousToken
} = require("../jobs/autonomous.job");
const { getWalletPortfolio } = require("../services/portfolio.service");
const { inspectTransaction } = require("../services/txInspector.service");
const { getWhaleHistory, getWhaleStats } = require("../services/whale.service");
const { getPriorityFeeSnapshot, refreshSnapshot: refreshPriorityFees } = require("../services/priorityFee.service");

const router = express.Router();
const DEFAULT_EXPLORER_ADDRESS = String(
  process.env.ORBITFLARE_EXPLORER_ADDRESS || process.env.HACKATHON_SIM_PUBLIC_KEY || ""
).trim();

function resolveValidatedAddress(candidate) {
  const raw = String(candidate || DEFAULT_EXPLORER_ADDRESS || "").trim();
  if (!raw) {
    const error = new Error("Address is required (query: address)");
    error.statusCode = 400;
    throw error;
  }

  try {
    return new PublicKey(raw).toBase58();
  } catch (validationError) {
    const error = new Error("Invalid Solana address");
    error.statusCode = 400;
    throw error;
  }
}

router.get("/surge-settings", async (req, res, next) => {
  try {
    return res.json(getSurgeSettings());
  } catch (error) {
    return next(error);
  }
});

router.get("/autonomous-tokens", async (req, res, next) => {
  try {
    return res.json({ tokens: getAutonomousTokens() });
  } catch (error) {
    return next(error);
  }
});

router.post("/autonomous-tokens", async (req, res, next) => {
  try {
    const token = String(req.body?.token || req.query?.token || "").trim();
    if (!token) {
      return res.status(400).json({ error: "token is required" });
    }

    const tokens = addAutonomousToken(token);
    return res.json({ success: true, tokens });
  } catch (error) {
    return next(error);
  }
});

router.delete("/autonomous-tokens", async (req, res, next) => {
  try {
    const token = String(req.body?.token || req.query?.token || "").trim();
    if (!token) {
      return res.status(400).json({ error: "token is required" });
    }

    const tokens = removeAutonomousToken(token);
    return res.json({ success: true, tokens });
  } catch (error) {
    return next(error);
  }
});

router.put("/surge-settings", async (req, res, next) => {
  try {
    const { thresholdPercent, cooldownMs } = req.body || {};
    const hasThreshold = thresholdPercent !== undefined;
    const hasCooldown = cooldownMs !== undefined;

    if (!hasThreshold && !hasCooldown) {
      return res.status(400).json({ error: "Provide thresholdPercent and/or cooldownMs" });
    }

    if (hasThreshold) {
      const parsedThreshold = Number(thresholdPercent);
      if (!Number.isFinite(parsedThreshold) || parsedThreshold <= 0) {
        return res.status(400).json({ error: "thresholdPercent must be a positive number" });
      }
    }

    if (hasCooldown) {
      const parsedCooldown = Number(cooldownMs);
      if (!Number.isFinite(parsedCooldown) || parsedCooldown <= 0) {
        return res.status(400).json({ error: "cooldownMs must be a positive number" });
      }
    }

    const settings = updateSurgeSettings({
      ...(hasThreshold ? { thresholdPercent: Number(thresholdPercent) } : {}),
      ...(hasCooldown ? { cooldownMs: Number(cooldownMs) } : {})
    });

    return res.json({ success: true, settings });
  } catch (error) {
    return next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const metrics = await getMetrics();
    return res.json(metrics);
  } catch (error) {
    return next(error);
  }
});

router.get("/wallet/pnl", async (req, res, next) => {
  try {
    const address = resolveValidatedAddress(req.query.address);
    const payload = await getWalletPortfolio(address);
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
});

router.get("/tx/inspect", async (req, res, next) => {
  try {
    const signature = String(req.query.signature || "").trim();
    if (!signature) {
      return res.status(400).json({ error: "signature is required" });
    }
    const payload = await inspectTransaction(signature);
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
});

router.get("/orbitflare/chain-pulse", async (req, res, next) => {
  try {
    const timeoutMs = Number(req.query.timeoutMs || 4000);
    const payload = await getOrbitFlareChainPulse({ timeoutMs });
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
});

router.get("/resolve-token", async (req, res, next) => {
  try {
    const token = String(req.query.token || "").trim();
    if (!token) {
      return res.status(400).json({ error: "token query parameter is required" });
    }

    const { resolveToken } = require("../services/tokenRegistry.service");
    const resolved = await resolveToken(token);
    return res.json(resolved);
  } catch (error) {
    return next(error);
  }
});

// ─── Whale Stream endpoints ───────────────────────────────────────────────
router.get("/whale/history", (req, res) => {
  const limit = Math.min(Number(req.query.limit || 50), 200);
  return res.json({
    alerts: getWhaleHistory(limit),
    stats: getWhaleStats()
  });
});

// ─── Priority Fee endpoints ───────────────────────────────────────────────
router.get("/priority-fees", async (req, res, next) => {
  try {
    const forceRefresh = String(req.query.refresh || "").toLowerCase() === "true";
    if (forceRefresh) await refreshPriorityFees();
    return res.json(getPriorityFeeSnapshot());
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
