const axios = require("axios");
const { Keypair, PublicKey } = require("@solana/web3.js");
const {
  DEMO_MODE,
  DEFAULT_INPUT_MINT,
  DEFAULT_OUTPUT_MINT,
  DEFAULT_SWAP_AMOUNT,
  DEMO_PAYLOAD
} = require("../config/constants");
const logger = require("../utils/logger");

const quoteSourceStats = {
  provider: "orbitflare->jupiter",
  orbitflareSuccess: 0,
  orbitflareFailure: 0,
  jupiterSuccess: 0,
  jupiterFailure: 0,
  lastSource: null,
  lastError: null,
  lastQuoteAt: null
};

function resolveSimulationPublicKey() {
  const candidate = String(process.env.HACKATHON_SIM_PUBLIC_KEY || "").trim();
  if (!candidate) {
    return Keypair.generate().publicKey.toBase58();
  }

  try {
    const key = new PublicKey(candidate).toBase58();
    if (key !== "11111111111111111111111111111111") {
      return key;
    }
  } catch (error) {
    logger.warn("Invalid HACKATHON_SIM_PUBLIC_KEY, generating ephemeral key");
  }

  return Keypair.generate().publicKey.toBase58();
}

const SIMULATION_PUBLIC_KEY = resolveSimulationPublicKey();

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Timeout")), ms);
    })
  ]);
}

function normalizeJupiterQuoteEndpoint(url) {
  const cleaned = String(url || "").trim().replace(/\/+$/, "");
  if (!cleaned) {
    return "";
  }

  if (cleaned.endsWith("/quote")) {
    return cleaned;
  }

  if (cleaned.endsWith("/swap/v1")) {
    return `${cleaned}/quote`;
  }

  return cleaned;
}

function getJupiterQuoteUrl() {
  const configured = String(process.env.JUPITER_API_URL || "").trim();
  return normalizeJupiterQuoteEndpoint(configured);
}

function getOrbitFlareQuoteUrl() {
  const configured = String(
    process.env.ORBITFLARE_TRADING_API_URL || process.env.ORBITFLARE_JUPITER_API_URL || ""
  ).trim();
  return normalizeJupiterQuoteEndpoint(configured);
}

function createProviderCandidates() {
  const candidates = [];
  const orbitflareQuoteUrl = getOrbitFlareQuoteUrl();
  const jupiterQuoteUrl = getJupiterQuoteUrl();

  if (orbitflareQuoteUrl) {
    candidates.push({
      provider: "orbitflare",
      quoteUrl: orbitflareQuoteUrl
    });
  }

  if (jupiterQuoteUrl) {
    candidates.push({
      provider: "jupiter-direct",
      quoteUrl: jupiterQuoteUrl
    });
  }

  return candidates;
}

function deriveSwapUrlFromQuoteUrl(quoteUrl) {
  try {
    const parsed = new URL(quoteUrl);

    if (parsed.pathname.endsWith("/quote")) {
      parsed.pathname = parsed.pathname.replace(/\/quote$/, "/swap");
      return parsed.toString();
    }

    if (parsed.pathname.endsWith("/swap/v1")) {
      parsed.pathname = `${parsed.pathname}/swap`;
      return parsed.toString();
    }

    parsed.pathname = `${parsed.pathname.replace(/\/+$/, "")}/swap`;
    return parsed.toString();
  } catch (error) {
    return null;
  }
}

function getSwapUrlCandidates(quoteUrl) {
  const candidates = [];
  const pushCandidate = (url) => {
    const derived = deriveSwapUrlFromQuoteUrl(url);
    if (derived && !candidates.includes(derived)) {
      candidates.push(derived);
    }
  };

  pushCandidate(quoteUrl);
  pushCandidate(getJupiterQuoteUrl());
  pushCandidate(getOrbitFlareQuoteUrl());

  return candidates;
}

async function requestQuote(quoteUrl, params) {
  const headers = {};
  const isOrbitFlareEndpoint = /orbitflare/i.test(String(quoteUrl || ""));
  if (isOrbitFlareEndpoint && process.env.ORBITFLARE_API_KEY) {
    headers["x-api-key"] = process.env.ORBITFLARE_API_KEY;
  }

  const response = await withTimeout(
    axios.get(quoteUrl, {
      params,
      ...(Object.keys(headers).length ? { headers } : {})
    }),
    3000
  );
  return response.data;
}

function markQuoteStat(partial) {
  Object.assign(quoteSourceStats, partial, { lastQuoteAt: Date.now() });
}

function buildQuoteResult(data, latency, source, quoteUrl) {
  markQuoteStat({
    lastSource: source,
    lastError: null
  });

  return {
    quote: data,
    latency,
    success: true,
    source,
    quoteUrl
  };
}

async function getQuote(params = {}) {
  const inputMint = params.inputMint || DEFAULT_INPUT_MINT;
  const outputMint = params.outputMint || DEFAULT_OUTPUT_MINT;
  const amount = Number(params.amount || DEFAULT_SWAP_AMOUNT);
  const start = Date.now();

  if (DEMO_MODE) {
    return {
      quote: {
        inputMint,
        outputMint,
        amount,
        swapTransaction: null,
        routePlan: []
      },
      latency: DEMO_PAYLOAD.latency.quoteLatency,
      success: true,
      source: "demo",
      quoteUrl: null
    };
  }

  const requestParams = {
    inputMint,
    outputMint,
    amount,
    asLegacyTransaction: true
  };

  const providers = createProviderCandidates();
  if (!providers.length) {
    logger.warn("No quote provider configured: set ORBITFLARE_TRADING_API_URL or JUPITER_API_URL");
    markQuoteStat({
      lastSource: "none",
      lastError: "No quote provider configured"
    });
    return {
      quote: null,
      latency: Date.now() - start,
      success: false,
      error: "No quote provider configured",
      source: "none",
      quoteUrl: null
    };
  }

  let lastError = "Unknown quote failure";

  for (const provider of providers) {
    try {
      const data = await requestQuote(provider.quoteUrl, requestParams);
      if (provider.provider === "orbitflare") {
        quoteSourceStats.orbitflareSuccess += 1;
      } else {
        quoteSourceStats.jupiterSuccess += 1;
      }
      return buildQuoteResult(data, Date.now() - start, provider.provider, provider.quoteUrl);
    } catch (error) {
      const message = error?.message || "Quote request failed";
      lastError = message;
      if (provider.provider === "orbitflare") {
        quoteSourceStats.orbitflareFailure += 1;
      } else {
        quoteSourceStats.jupiterFailure += 1;
      }
      markQuoteStat({
        lastSource: provider.provider,
        lastError: message
      });
      logger.warn(`${provider.provider} quote request failed:`, message);
    }
  }

  return {
    quote: null,
    latency: Date.now() - start,
    success: false,
    error: lastError,
    source: "fallback-exhausted",
    quoteUrl: providers[providers.length - 1]?.quoteUrl || null
  };
}

function getQuoteSourceStats() {
  return { ...quoteSourceStats };
}

function extractSwapTransaction(payload) {
  const swapTransaction =
    payload?.swapTransaction ||
    payload?.swap_transaction ||
    payload?.transaction ||
    payload?.tx ||
    payload?.result?.swapTransaction ||
    null;

  return typeof swapTransaction === "string" ? swapTransaction : null;
}

async function getSwapTransaction({ quote, quoteUrl, userPublicKey } = {}) {
  const start = Date.now();

  if (DEMO_MODE) {
    return {
      swapTransaction: null,
      latency: 0,
      success: true,
      source: "demo"
    };
  }

  if (!quote || typeof quote !== "object") {
    return {
      swapTransaction: null,
      latency: Date.now() - start,
      success: false,
      error: "Quote payload is required",
      source: "none"
    };
  }

  if (quote.swapTransaction && typeof quote.swapTransaction === "string") {
    return {
      swapTransaction: quote.swapTransaction,
      latency: Date.now() - start,
      success: true,
      source: "inline-quote"
    };
  }

  const swapUrls = getSwapUrlCandidates(quoteUrl);
  if (!swapUrls.length) {
    return {
      swapTransaction: null,
      latency: Date.now() - start,
      success: false,
      error: "Swap endpoint is not configured",
      source: "none"
    };
  }

  const body = {
    quoteResponse: quote,
    userPublicKey:
      userPublicKey ||
      SIMULATION_PUBLIC_KEY,
    wrapAndUnwrapSol: true,
    dynamicComputeUnitLimit: true,
    asLegacyTransaction: true
  };

  let lastError = "Swap request failed";
  let lastSource = swapUrls[swapUrls.length - 1];

  for (const swapUrl of swapUrls) {
    const headers = {
      "content-type": "application/json"
    };
    if (/orbitflare/i.test(String(swapUrl || "")) && process.env.ORBITFLARE_API_KEY) {
      headers["x-api-key"] = process.env.ORBITFLARE_API_KEY;
    }

    try {
      const response = await withTimeout(
        axios.post(swapUrl, body, {
          headers
        }),
        3000
      );

      const swapTransaction = extractSwapTransaction(response.data);
      if (!swapTransaction) {
        lastError = "Swap response missing swapTransaction";
        lastSource = swapUrl;
        logger.warn(`${swapUrl} returned no swapTransaction, trying next provider`);
        continue;
      }

      return {
        swapTransaction,
        latency: Date.now() - start,
        success: true,
        source: swapUrl
      };
    } catch (error) {
      lastError = error.message || "Swap request failed";
      lastSource = swapUrl;
      logger.warn(`Swap transaction request failed (${swapUrl}):`, lastError);
    }
  }

  return {
    swapTransaction: null,
    latency: Date.now() - start,
    success: false,
    error: lastError,
    source: lastSource
  };
}

module.exports = { getQuote, getSwapTransaction, getQuoteSourceStats };
