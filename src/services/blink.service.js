const {
  DEMO_MODE,
  DEMO_PAYLOAD,
  DEFAULT_SWAP_AMOUNT,
  DEFAULT_INPUT_MINT,
  DEFAULT_OUTPUT_MINT
} = require("../config/constants");
const { PublicKey } = require("@solana/web3.js");
const { getQuote, getSwapTransaction } = require("./jupiter.service");
const { simulateSwap } = require("./simulation.service");
const logger = require("../utils/logger");

const ALLOWED_ACTION_TYPES = new Set(["buy", "sell", "swap", "mint", "donate", "trade"]);
const localBlinkStore = [];
const DEFAULT_INPUT_DECIMALS = Number(process.env.DEFAULT_INPUT_DECIMALS || 9);
const DEFAULT_ACTION_PATH = "/api/blinks/action";
const DEFAULT_TOKEN_MINTS = Object.freeze({
  SOL: "So11111111111111111111111111111111111111112",
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
  JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"
});
const DEFAULT_TOKEN_DECIMALS = Object.freeze({
  SOL: 9,
  USDC: 6,
  BONK: 5,
  JUP: 6
});

function parseTokenMintMap(raw) {
  const map = { ...DEFAULT_TOKEN_MINTS };
  const input = String(raw || "").trim();

  if (!input) {
    return map;
  }

  const entries = input
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const entry of entries) {
    const [symbol, mint] = entry.split(":").map((value) => value?.trim());
    if (!symbol || !mint) {
      continue;
    }

    map[symbol.toUpperCase()] = mint;
  }

  return map;
}

const TOKEN_MINT_MAP = parseTokenMintMap(process.env.TOKEN_MINT_MAP);

function parseTokenDecimalsMap(raw) {
  const map = { ...DEFAULT_TOKEN_DECIMALS };
  const input = String(raw || "").trim();

  if (!input) {
    return map;
  }

  const entries = input
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const entry of entries) {
    const [symbol, decimalsRaw] = entry.split(":").map((value) => value?.trim());
    const decimals = Number(decimalsRaw);

    if (!symbol || !Number.isFinite(decimals) || decimals < 0 || decimals > 18) {
      continue;
    }

    map[symbol.toUpperCase()] = Math.floor(decimals);
  }

  return map;
}

const TOKEN_DECIMALS_MAP = parseTokenDecimalsMap(process.env.TOKEN_DECIMALS_MAP);

function normalizeBaseUrl(baseUrl) {
  const normalized = String(baseUrl || "").trim();
  return normalized.replace(/\/+$/, "");
}

function resolveActionEndpoint(baseUrl) {
  const configuredActionUrl = String(process.env.BLINK_ACTION_URL || "").trim();
  if (configuredActionUrl) {
    try {
      return new URL(configuredActionUrl);
    } catch (error) {
      logger.warn("Invalid BLINK_ACTION_URL, falling back to runtime host");
    }
  }

  const runtimeBase = normalizeBaseUrl(baseUrl);
  if (runtimeBase) {
    return new URL(DEFAULT_ACTION_PATH, `${runtimeBase}/`);
  }

  const fallbackPort = Number(process.env.PORT || 3000);
  return new URL(DEFAULT_ACTION_PATH, `http://localhost:${fallbackPort}`);
}

function createActionBlinkUrl({ token, actionType, amount, inputMint, outputMint, baseUrl }) {
  const actionLink = resolveActionEndpoint(baseUrl);
  actionLink.searchParams.set("token", token);
  actionLink.searchParams.set("actionType", actionType.toLowerCase());
  actionLink.searchParams.set("amount", String(amount));
  actionLink.searchParams.set("inputMint", inputMint);
  actionLink.searchParams.set("outputMint", outputMint);
  actionLink.searchParams.set("network", process.env.SOLANA_NETWORK || "mainnet-beta");
  // Force JSON response for wallet/Blink clients even if Accept includes text/html.
  actionLink.searchParams.set("format", "json");

  if (actionLink.protocol !== "https:") {
    return actionLink.toString();
  }

  const wrapperUrl = String(process.env.BLINK_WRAPPER_URL || "https://dial.to").trim();
  if (!wrapperUrl) {
    return actionLink.toString();
  }

  let wrapperBase;
  try {
    wrapperBase = new URL(wrapperUrl);
  } catch (error) {
    logger.warn("Invalid BLINK_WRAPPER_URL, returning raw action URL");
    return actionLink.toString();
  }

  // Keep single URL-encoding layer by letting URLSearchParams encode the full value.
  const payload = `solana-action:${actionLink.toString()}`;
  wrapperBase.searchParams.set("action", payload);
  return wrapperBase.toString();
}

function normalizeActionType(actionType) {
  const normalized = String(actionType || "swap").toLowerCase();

  if (!ALLOWED_ACTION_TYPES.has(normalized)) {
    throw new Error("Invalid action type");
  }

  return normalized === "trade" ? "swap" : normalized;
}

function isValidMintAddress(value) {
  const candidate = String(value || "").trim();
  if (!candidate) {
    return null;
  }

  try {
    return new PublicKey(candidate).toBase58();
  } catch (error) {
    return null;
  }
}

function toRawAmount(amount, token, rawAmount = false) {
  if (amount === undefined || amount === null || amount === "") {
    return DEFAULT_SWAP_AMOUNT;
  }

  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return DEFAULT_SWAP_AMOUNT;
  }

  if (rawAmount) {
    return Math.floor(numeric);
  }

  const configured = Number(TOKEN_DECIMALS_MAP[String(token || "").toUpperCase()]);
  const decimals = Number.isFinite(configured)
    ? configured
    : Number.isFinite(DEFAULT_INPUT_DECIMALS)
      ? DEFAULT_INPUT_DECIMALS
      : 9;
  const multiplier = Math.pow(10, decimals);
  return Math.floor(numeric * multiplier);
}

function resolveInputMint(token, providedMint) {
  if (providedMint && typeof providedMint === "string") {
    return providedMint.trim();
  }

  const mint = isValidMintAddress(token);
  if (mint) {
    return mint;
  }

  return TOKEN_MINT_MAP[token] || DEFAULT_INPUT_MINT;
}

function resolveOutputMint(inputMint, providedOutputMint) {
  if (providedOutputMint && typeof providedOutputMint === "string") {
    return providedOutputMint;
  }

  if (inputMint === DEFAULT_OUTPUT_MINT) {
    return DEFAULT_INPUT_MINT;
  }

  return DEFAULT_OUTPUT_MINT;
}

function resolveBlinkTradeParams(options = {}) {
  const rawToken = String(options.token || "SOL").trim();
  const customMint = isValidMintAddress(rawToken);
  const token = customMint || rawToken.toUpperCase() || "SOL";
  const normalizedActionType = normalizeActionType(options.actionType || "swap");
  const actionType = normalizedActionType.toUpperCase();
  const amount = toRawAmount(options.amount, token, Boolean(options.rawAmount));
  const inputMint = resolveInputMint(token, options.inputMint);
  const outputMint = resolveOutputMint(inputMint, options.outputMint);

  return {
    token,
    actionType,
    amount,
    inputMint,
    outputMint
  };
}

async function generateBlink(options = {}) {
  const {
    token,
    actionType,
    amount,
    inputMint,
    outputMint
  } = resolveBlinkTradeParams(options);
  const userPublicKey = typeof options.userPublicKey === "string" && options.userPublicKey.trim()
    ? options.userPublicKey.trim()
    : undefined;
  const totalStart = Date.now();

  let quoteLatency;
  let simulationLatency;

  const quoteResult = await getQuote({ inputMint, outputMint, amount });
  const swapResult = await getSwapTransaction({
    quote: quoteResult.quote,
    quoteUrl: quoteResult.quoteUrl,
    userPublicKey
  });
  quoteLatency = quoteResult.latency + swapResult.latency;

  const simulationInput = swapResult.success
    ? { swapTransaction: swapResult.swapTransaction }
    : quoteResult.quote;
  const simulationResult = await simulateSwap(simulationInput);
  simulationLatency = simulationResult.latency;

  const blinkStart = Date.now();
  let blinkUrl;

  if (DEMO_MODE) {
    blinkUrl = DEMO_PAYLOAD.blinkUrl;
  } else {
    try {
      blinkUrl = createActionBlinkUrl({
        token,
        actionType,
        amount,
        inputMint,
        outputMint,
        baseUrl: options.baseUrl
      });
    } catch (error) {
      logger.error("Blink URL creation failed:", error.message);
      blinkUrl = "";
    }
  }

  const blinkLatency = DEMO_MODE
    ? DEMO_PAYLOAD.latency.blinkLatency
    : Date.now() - blinkStart;

  const total = DEMO_MODE
    ? DEMO_PAYLOAD.latency.total
    : Date.now() - totalStart;

  return {
    blinkUrl,
    latency: {
      quoteLatency,
      simulationLatency,
      blinkLatency,
      total
    }
  };
}

async function storeBlinkForUser(payload) {
  const actionType = normalizeActionType(payload.actionType || "swap");

  const row = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    user_id: payload.userId,
    token: String(payload.token || "SOL").toUpperCase(),
    action_type: actionType,
    blink_url: String(payload.blink?.blinkUrl || ""),
    change_percent: payload.changePercent ?? null,
    usd_value: payload.usdValue ?? null,
    latency: payload.blink?.latency || null,
    slot: payload.slot ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  localBlinkStore.unshift(row);

  return { stored: true, blink: row };
}

async function getBlinksForUser(userId, limit = 50) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  return localBlinkStore
    .filter((item) => item.user_id === userId)
    .slice(0, safeLimit);
}

module.exports = {
  generateBlink,
  normalizeActionType,
  resolveBlinkTradeParams,
  storeBlinkForUser,
  getBlinksForUser
};
