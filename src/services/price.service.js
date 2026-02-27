const { PublicKey } = require("@solana/web3.js");
const { DEMO_MODE, SOL_PRICE_ID, DEMO_PAYLOAD } = require("../config/constants");
const { getHermesClient, getConnection } = require("../config/rpc.config");
const { getQuote } = require("./jupiter.service");

const STATIC_PRICE_IDS = {
  SOL: SOL_PRICE_ID
};
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_DECIMALS = 6;
const DEFAULT_FALLBACK_DECIMALS = Number(process.env.DEFAULT_INPUT_DECIMALS || 9);

const PRICE_ID_CACHE_TTL_MS = 10 * 60 * 1000;
const priceIdCache = new Map(Object.entries(STATIC_PRICE_IDS));
let cacheRefreshedAt = 0;

function parseTokenList(value, fallback) {
  const parsed = String(value || "")
    .split(",")
    .map((token) => String(token).trim().toUpperCase())
    .filter(Boolean);

  if (parsed.length) {
    return [...new Set(parsed)];
  }

  return fallback;
}

const CURATED_SUPPORTED_TOKENS = parseTokenList(
  process.env.SUPPORTED_TOKENS,
  ["SOL", "BTC", "ETH", "USDC", "BONK", "JUP", "PYTH", "RAY"]
);

function normalizeSymbol(token) {
  return String(token || "")
    .trim()
    .toUpperCase();
}

function normalizeTokenInput(token) {
  return String(token || "").trim();
}

function isValidMintAddress(token) {
  try {
    return new PublicKey(token).toBase58();
  } catch (error) {
    return null;
  }
}

function normalizePriceId(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/^0x/, "");
}

function parseHermesPrice(update, symbol) {
  const rawPrice = update?.price?.price;
  const expo = Number(update?.price?.expo);
  const priceNumber = Number(rawPrice);

  if (!Number.isFinite(priceNumber) || !Number.isFinite(expo)) {
    throw new Error(`Invalid Hermes price payload for ${symbol}`);
  }

  return priceNumber * Math.pow(10, expo);
}

function toFeedSymbol(metadata) {
  const base = String(metadata?.attributes?.base || "").toUpperCase();
  const quote = String(metadata?.attributes?.quote_currency || "").toUpperCase();
  const id = normalizePriceId(metadata?.id);

  if (!base || quote !== "USD" || !id) {
    return null;
  }

  return { symbol: base, id };
}

async function refreshPriceIdCache() {
  const now = Date.now();
  if (now - cacheRefreshedAt < PRICE_ID_CACHE_TTL_MS && priceIdCache.size > 0) {
    return;
  }

  const hermes = getHermesClient();
  const feeds = await hermes.getPriceFeeds({ filter: "crypto" });
  const freshMap = new Map(Object.entries(STATIC_PRICE_IDS).map(([symbol, id]) => [symbol, normalizePriceId(id)]));

  for (const feed of feeds || []) {
    const resolved = toFeedSymbol(feed);
    if (!resolved) {
      continue;
    }

    if (!freshMap.has(resolved.symbol)) {
      freshMap.set(resolved.symbol, resolved.id);
    }
  }

  priceIdCache.clear();
  for (const [symbol, id] of freshMap.entries()) {
    priceIdCache.set(symbol, id);
  }
  cacheRefreshedAt = now;
}

function buildUnsupportedTokenError(token) {
  const error = new Error(`Unsupported token: ${token}`);
  error.statusCode = 400;
  return error;
}

async function resolvePriceId(token) {
  const symbol = normalizeSymbol(token);
  if (!symbol) {
    throw buildUnsupportedTokenError(token);
  }

  if (priceIdCache.has(symbol)) {
    return priceIdCache.get(symbol);
  }

  await refreshPriceIdCache();
  if (priceIdCache.has(symbol)) {
    return priceIdCache.get(symbol);
  }

  const hermes = getHermesClient();
  const feeds = await hermes.getPriceFeeds({ query: `${symbol}/USD`, filter: "crypto" });
  for (const feed of feeds || []) {
    const resolved = toFeedSymbol(feed);
    if (resolved?.symbol === symbol) {
      priceIdCache.set(symbol, resolved.id);
      return resolved.id;
    }
  }

  throw buildUnsupportedTokenError(symbol);
}

function parseQuoteOutAmount(quotePayload) {
  const direct = Number(quotePayload?.outAmount);
  if (Number.isFinite(direct) && direct > 0) {
    return direct;
  }

  const routePlan = Array.isArray(quotePayload?.routePlan) ? quotePayload.routePlan : [];
  for (const leg of routePlan) {
    const legOut = Number(leg?.swapInfo?.outAmount);
    if (Number.isFinite(legOut) && legOut > 0) {
      return legOut;
    }
  }

  return null;
}

async function getMintDecimals(mintAddress) {
  const mint = new PublicKey(mintAddress);
  const connection = getConnection();

  try {
    const parsed = await connection.getParsedAccountInfo(mint, "confirmed");
    const decimals = Number(parsed?.value?.data?.parsed?.info?.decimals);
    if (Number.isFinite(decimals) && decimals >= 0 && decimals <= 18) {
      return Math.floor(decimals);
    }
  } catch (error) {
    // Fallback below.
  }

  try {
    const supply = await connection.getTokenSupply(mint, "confirmed");
    const decimals = Number(supply?.value?.decimals);
    if (Number.isFinite(decimals) && decimals >= 0 && decimals <= 18) {
      return Math.floor(decimals);
    }
  } catch (error) {
    // Fallback below.
  }

  if (Number.isFinite(DEFAULT_FALLBACK_DECIMALS) && DEFAULT_FALLBACK_DECIMALS >= 0) {
    return Math.floor(DEFAULT_FALLBACK_DECIMALS);
  }

  return 9;
}

async function getMintPriceViaJupiter(mintAddress) {
  // 0. Short-circuit for standard tokens to avoid invalid same-mint quotes
  if (mintAddress === USDC_MINT) {
    return 1.0;
  }
  if (mintAddress === "So11111111111111111111111111111111111111112") {
    return await getSolPrice();
  }

  const decimals = await getMintDecimals(mintAddress);
  const exponent = Math.min(decimals, 9);
  const rawAmount = Math.max(1, Math.floor(Math.pow(10, exponent)));
  const tokenUnits = rawAmount / Math.pow(10, decimals);

  const quoteResult = await getQuote({
    inputMint: mintAddress,
    outputMint: USDC_MINT,
    amount: rawAmount
  });

  if (!quoteResult.success || !quoteResult.quote) {
    throw buildUnsupportedTokenError(mintAddress);
  }

  const outAmountRaw = parseQuoteOutAmount(quoteResult.quote);
  if (!Number.isFinite(outAmountRaw) || outAmountRaw <= 0 || !Number.isFinite(tokenUnits) || tokenUnits <= 0) {
    throw buildUnsupportedTokenError(mintAddress);
  }

  const usdOut = outAmountRaw / Math.pow(10, USDC_DECIMALS);
  const unitPrice = usdOut / tokenUnits;
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    throw buildUnsupportedTokenError(mintAddress);
  }

  return unitPrice;
}

async function getPrice(token = "SOL") {
  const rawToken = normalizeTokenInput(token) || "SOL";

  const start = Date.now();

  if (DEMO_MODE) {
    return {
      token: rawToken,
      price: 170,
      latency: 1
    };
  }

  const mintAddress = isValidMintAddress(rawToken);
  if (mintAddress) {
    const price = await getMintPriceViaJupiter(mintAddress);
    const { resolveTokenSync } = require("./tokenRegistry.service");
    const symbol = resolveTokenSync(mintAddress);
    return {
      token: mintAddress,
      symbol,
      price,
      latency: Date.now() - start
    };
  }

  const symbol = normalizeSymbol(rawToken) || "SOL";
  const priceId = await resolvePriceId(symbol);
  const hermes = getHermesClient();
  const response = await hermes.getLatestPriceUpdates([priceId], { parsed: true });
  const parsed = Array.isArray(response?.parsed) ? response.parsed : [];
  const update = parsed.find((item) => normalizePriceId(item?.id) === priceId) || parsed[0];

  if (!update?.price) {
    throw new Error("No price feed returned from Hermes");
  }

  const price = parseHermesPrice(update, symbol);

  return {
    token: symbol,
    price,
    latency: Date.now() - start
  };
}

async function getSupportedTokens() {
  if (DEMO_MODE) {
    return CURATED_SUPPORTED_TOKENS;
  }

  await refreshPriceIdCache();
  const available = new Set(priceIdCache.keys());
  const curatedAvailable = CURATED_SUPPORTED_TOKENS.filter((token) => available.has(token));

  if (curatedAvailable.length) {
    if (!curatedAvailable.includes("SOL") && available.has("SOL")) {
      return ["SOL", ...curatedAvailable];
    }

    return curatedAvailable;
  }

  return Array.from(available).sort((left, right) => left.localeCompare(right));
}

async function getSolPrice() {
  const payload = await getPrice("SOL");
  return payload.price;
}

async function getDeterministicDemoSurge() {
  return {
    token: DEMO_PAYLOAD.token,
    price: 170,
    changePercent: DEMO_PAYLOAD.changePercent,
    usdValue: DEMO_PAYLOAD.usdValue,
    slot: DEMO_PAYLOAD.slot,
    timestamp: DEMO_PAYLOAD.timestamp
  };
}

module.exports = {
  getPrice,
  getSupportedTokens,
  getSolPrice,
  getDeterministicDemoSurge
};
