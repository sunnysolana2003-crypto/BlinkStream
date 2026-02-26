const axios = require("axios");
const { VersionedTransaction } = require("@solana/web3.js");
const { getConnection } = require("../config/rpc.config");
const { DEMO_MODE, TOKEN_PROGRAM_ID } = require("../config/constants");
const logger = require("../utils/logger");

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const DEFAULT_TIMEOUT_MS = 4000;
const DEFAULT_REPLAY_LIMIT = 10;
const MAX_REPLAY_LIMIT = 25;
const DEFAULT_SIGNATURE_LIMIT = 8;
const DEFAULT_WEBSOCKET_LISTEN_MS = 3000;
const DEFAULT_TX_CONFIRM_TIMEOUT_MS = 20000;

const methodStats = new Map();
let lastProbe = null;
let lastAdvancedProbe = null;
let lastWebsocketProbe = null;
let lastSubmission = null;
const websocketStats = {
  probeCount: 0,
  successCount: 0,
  failureCount: 0,
  lastProbeAt: null,
  lastError: null
};
const submissionStats = {
  total: 0,
  success: 0,
  failure: 0,
  lastSubmittedAt: null,
  lastError: null
};

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Timeout")), timeoutMs);
    })
  ]);
}

function getRpcBaseUrl() {
  const raw = String(process.env.ORBITFLARE_RPC_URL || "").trim();
  if (!raw) {
    throw new Error("ORBITFLARE_RPC_URL is required");
  }

  return raw.replace(/\/+$/, "");
}

function sanitizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("api_key");
    return parsed.toString();
  } catch (error) {
    return url;
  }
}

function trackMethod(method, payload) {
  const key = String(method || "unknown");
  const previous = methodStats.get(key) || {
    method: key,
    totalCalls: 0,
    successCalls: 0,
    failedCalls: 0,
    lastLatencyMs: null,
    lastError: null,
    lastCalledAt: null
  };

  const next = {
    ...previous,
    totalCalls: previous.totalCalls + 1,
    successCalls: previous.successCalls + (payload.success ? 1 : 0),
    failedCalls: previous.failedCalls + (payload.success ? 0 : 1),
    lastLatencyMs: payload.latencyMs,
    lastError: payload.success ? null : payload.error || "Unknown RPC error",
    lastCalledAt: Date.now()
  };

  methodStats.set(key, next);
}

function normalizeRpcError(error) {
  if (!error) {
    return "Unknown RPC error";
  }

  if (typeof error === "string") {
    return error;
  }

  if (typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }

  try {
    return JSON.stringify(error);
  } catch (stringifyError) {
    return "Unknown RPC error";
  }
}

async function rpcRequest(method, params = [], options = {}) {
  const timeoutMs = Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS;
  const startedAt = Date.now();

  try {
    const response = await withTimeout(getConnection()._rpcRequest(method, params), timeoutMs);
    if (response?.error) {
      throw new Error(response.error.message || `${method} returned an error`);
    }

    const latencyMs = Date.now() - startedAt;
    trackMethod(method, { success: true, latencyMs });

    return {
      success: true,
      method,
      latencyMs,
      result: response?.result ?? null
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const normalizedError = normalizeRpcError(error);
    trackMethod(method, { success: false, latencyMs, error: normalizedError });

    return {
      success: false,
      method,
      latencyMs,
      error: normalizedError,
      result: null
    };
  }
}

async function rpcBatch(requests, options = {}) {
  if (!Array.isArray(requests) || requests.length === 0) {
    return [];
  }

  const timeoutMs = Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS;
  const connection = getConnection();

  if (typeof connection._rpcBatchRequest !== "function") {
    return Promise.all(
      requests.map((request) => rpcRequest(request.method, request.params || [], { timeoutMs }))
    );
  }

  const startedAt = Date.now();
  try {
    const payload = requests.map((request) => ({
      methodName: request.method,
      args: Array.isArray(request.params) ? request.params : []
    }));
    const rawResults = await withTimeout(connection._rpcBatchRequest(payload), timeoutMs);
    const elapsedMs = Date.now() - startedAt;

    return requests.map((request, index) => {
      const raw = rawResults?.[index];
      if (raw?.error) {
        const normalizedError = raw.error.message || `${request.method} returned an error`;
        trackMethod(request.method, {
          success: false,
          latencyMs: elapsedMs,
          error: normalizedError
        });
        return {
          success: false,
          method: request.method,
          latencyMs: elapsedMs,
          error: normalizedError,
          result: null
        };
      }

      trackMethod(request.method, {
        success: true,
        latencyMs: elapsedMs
      });
      return {
        success: true,
        method: request.method,
        latencyMs: elapsedMs,
        error: null,
        result: raw?.result ?? null
      };
    });
  } catch (error) {
    logger.warn("RPC batch failed, falling back to sequential requests:", normalizeRpcError(error));
    return Promise.all(
      requests.map((request) => rpcRequest(request.method, request.params || [], { timeoutMs }))
    );
  }
}

function toUsageSnapshot() {
  let rpcBaseUrl = null;
  try {
    rpcBaseUrl = sanitizeUrl(getRpcBaseUrl());
  } catch (error) {
    rpcBaseUrl = null;
  }

  const methods = Array.from(methodStats.values()).sort((left, right) =>
    left.method.localeCompare(right.method)
  );
  const totalCalls = methods.reduce((acc, item) => acc + item.totalCalls, 0);
  const successCalls = methods.reduce((acc, item) => acc + item.successCalls, 0);
  const failedCalls = methods.reduce((acc, item) => acc + item.failedCalls, 0);
  const successRate = totalCalls > 0 ? Number(((successCalls / totalCalls) * 100).toFixed(2)) : null;

  return {
    provider: "orbitflare-rpc-http",
    rpcBaseUrl,
    totalCalls,
    successCalls,
    failedCalls,
    successRate,
    methods,
    websocket: {
      ...websocketStats,
      lastProbe: lastWebsocketProbe
    },
    submissions: {
      ...submissionStats,
      lastSubmission
    },
    lastProbe,
    lastAdvancedProbe
  };
}

function pickResult(probeResults, method) {
  return probeResults.find((item) => item.method === method)?.result;
}

function toRpcCallMeta(response) {
  if (!response || typeof response !== "object") {
    return {
      method: "unknown",
      success: false,
      latencyMs: null,
      error: "Unknown RPC response"
    };
  }

  return {
    method: String(response.method || "unknown"),
    success: Boolean(response.success),
    latencyMs: Number.isFinite(Number(response.latencyMs)) ? Number(response.latencyMs) : null,
    error: response.success ? null : String(response.error || "RPC error")
  };
}

function clamp(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(Math.floor(parsed), max));
}

function calculateMedian(numbers) {
  if (!Array.isArray(numbers) || !numbers.length) {
    return null;
  }

  const sorted = [...numbers].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(2));
  }
  return Number(sorted[middle].toFixed(2));
}

function chunkArray(items, chunkSize) {
  const chunks = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function compactEvent(event) {
  try {
    const serialized = JSON.stringify(event);
    if (serialized.length > 280) {
      return `${serialized.slice(0, 280)}...`;
    }
    return serialized;
  } catch (error) {
    return String(event || "");
  }
}

async function runWebsocketChannelProbe({ channel, register, remove, listenMs }) {
  const startedAt = Date.now();
  let settled = false;
  let subscriptionId = null;
  let firstEventAt = null;
  let eventCount = 0;
  let eventPreview = null;
  let trackRecorded = false;

  const finalize = async (payload) => {
    if (settled) {
      return payload;
    }
    settled = true;

    if (subscriptionId !== null && Number.isFinite(Number(subscriptionId))) {
      try {
        await remove(subscriptionId);
      } catch (removeError) {
        logger.warn(`Failed to remove ${channel} websocket listener:`, normalizeRpcError(removeError));
      }
    }

    return payload;
  };

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      void finalize({
        channel,
        success: true,
        subscribed: true,
        timedOut: true,
        eventReceived: eventCount > 0,
        eventCount,
        latencyMs: Date.now() - startedAt,
        firstEventLatencyMs: firstEventAt ? firstEventAt - startedAt : null,
        subscriptionId,
        eventPreview,
        error: null
      }).then(resolve);
    }, listenMs);

    Promise.resolve(
      register((event) => {
        eventCount += 1;

        if (!firstEventAt) {
          firstEventAt = Date.now();
        }

        if (!eventPreview) {
          eventPreview = compactEvent(event);
        }

        void finalize({
          channel,
          success: true,
          subscribed: true,
          timedOut: false,
          eventReceived: true,
          eventCount,
          latencyMs: Date.now() - startedAt,
          firstEventLatencyMs: firstEventAt - startedAt,
          subscriptionId,
          eventPreview,
          error: null
        }).then((payload) => {
          clearTimeout(timer);
          resolve(payload);
        });
      })
    )
      .then(async (id) => {
        subscriptionId = id;
        if (settled) {
          try {
            await remove(id);
          } catch (removeError) {
            logger.warn(`Failed to remove settled ${channel} websocket listener:`, normalizeRpcError(removeError));
          }
          return;
        }

        if (!trackRecorded) {
          trackRecorded = true;
          trackMethod(`${channel}Subscribe`, {
            success: true,
            latencyMs: Date.now() - startedAt
          });
        }
      })
      .catch((error) => {
        if (!trackRecorded) {
          trackMethod(`${channel}Subscribe`, {
            success: false,
            latencyMs: Date.now() - startedAt,
            error: normalizeRpcError(error)
          });
          trackRecorded = true;
        }

        clearTimeout(timer);
        void finalize({
          channel,
          success: false,
          subscribed: false,
          timedOut: false,
          eventReceived: false,
          eventCount: 0,
          latencyMs: Date.now() - startedAt,
          firstEventLatencyMs: null,
          subscriptionId: null,
          eventPreview: null,
          error: normalizeRpcError(error)
        }).then(resolve);
      });
  });
}

function decodeSignedTransactionBase64(signedTransaction) {
  const raw = String(signedTransaction || "").trim();
  if (!raw) {
    throw new Error("signedTransaction is required");
  }

  if (!/^[A-Za-z0-9+/_=\-\s]+$/.test(raw)) {
    throw new Error("signedTransaction must be base64 encoded");
  }

  const payload = Buffer.from(raw, "base64");
  if (!payload.length) {
    throw new Error("signedTransaction payload is empty");
  }

  return payload;
}

function detectTransactionEncoding(payload) {
  try {
    VersionedTransaction.deserialize(payload);
    return "versioned";
  } catch (versionedError) {
    return "legacy-or-unknown";
  }
}

function buildExplorerTxUrl(signature) {
  const cluster = String(process.env.SOLANA_NETWORK || "mainnet-beta").trim();
  const validSignature = String(signature || "").trim();
  if (!validSignature) {
    return null;
  }

  if (cluster === "mainnet-beta" || cluster === "mainnet") {
    return `https://solscan.io/tx/${validSignature}`;
  }

  return `https://solscan.io/tx/${validSignature}?cluster=${encodeURIComponent(cluster)}`;
}

function parseTokenAccount(account) {
  const info = account?.account?.data?.parsed?.info || {};
  const tokenAmount = info?.tokenAmount || {};
  const uiAmount = Number(tokenAmount.uiAmount ?? tokenAmount.uiAmountString ?? 0);
  const decimals = Number(tokenAmount.decimals ?? 0);

  return {
    pubkey: String(account?.pubkey || ""),
    mint: String(info?.mint || ""),
    owner: String(info?.owner || ""),
    state: String(info?.state || ""),
    amountRaw: String(tokenAmount.amount || "0"),
    decimals: Number.isFinite(decimals) ? decimals : 0,
    uiAmount: Number.isFinite(uiAmount) ? uiAmount : 0
  };
}

function parseSignatureEntry(entry) {
  return {
    signature: String(entry?.signature || ""),
    slot: Number(entry?.slot || 0),
    blockTime: Number.isFinite(Number(entry?.blockTime)) ? Number(entry?.blockTime) : null,
    confirmationStatus: entry?.confirmationStatus ? String(entry.confirmationStatus) : null,
    success: !entry?.err
  };
}

function extractAccountKeysFromTransaction(transaction) {
  const keys = transaction?.transaction?.message?.accountKeys;
  if (!Array.isArray(keys)) {
    return [];
  }

  return keys.map((key) => {
    if (typeof key === "string") {
      return key;
    }

    if (key && typeof key === "object") {
      if (typeof key.pubkey === "string") {
        return key.pubkey;
      }

      if (typeof key.toString === "function") {
        return key.toString();
      }
    }

    return "";
  });
}

function parseTxReplayItem({ signatureEntry, statusEntry, txResponse, ownerAddress }) {
  const signature = String(signatureEntry?.signature || "");
  const tx = txResponse?.result || null;
  const meta = tx?.meta || null;
  const accountKeys = extractAccountKeysFromTransaction(tx);
  const payer = accountKeys[0] || null;
  const preBalances = Array.isArray(meta?.preBalances) ? meta.preBalances : [];
  const postBalances = Array.isArray(meta?.postBalances) ? meta.postBalances : [];

  let balanceDeltaLamports = null;
  if (
    payer &&
    ownerAddress &&
    payer === ownerAddress &&
    preBalances.length > 0 &&
    postBalances.length > 0
  ) {
    const delta = Number(postBalances[0]) - Number(preBalances[0]);
    if (Number.isFinite(delta)) {
      balanceDeltaLamports = delta;
    }
  }

  const status = statusEntry || {};
  const err = meta?.err ?? status?.err ?? signatureEntry?.err ?? null;
  const confirmationStatus =
    signatureEntry?.confirmationStatus ||
    status?.confirmationStatus ||
    null;

  return {
    signature,
    slot: Number(signatureEntry?.slot || tx?.slot || 0),
    blockTime: Number.isFinite(Number(signatureEntry?.blockTime))
      ? Number(signatureEntry?.blockTime)
      : Number.isFinite(Number(tx?.blockTime))
        ? Number(tx?.blockTime)
        : null,
    confirmationStatus: confirmationStatus ? String(confirmationStatus) : null,
    success: err === null,
    error: err ? JSON.stringify(err) : null,
    feeLamports: Number.isFinite(Number(meta?.fee)) ? Number(meta?.fee) : null,
    instructions: Array.isArray(tx?.transaction?.message?.instructions)
      ? tx.transaction.message.instructions.length
      : null,
    accounts: accountKeys.length,
    balanceDeltaLamports
  };
}

async function runOrbitFlareProbe(options = {}) {
  const timeoutMs = Number(options.timeoutMs) || DEFAULT_TIMEOUT_MS;
  const startedAt = Date.now();

  const batchA = await rpcBatch(
    [
      { method: "getSlot", params: [{ commitment: "confirmed" }] },
      { method: "getBlockHeight", params: [{ commitment: "confirmed" }] },
      { method: "getVersion", params: [] },
      { method: "getEpochInfo", params: [{ commitment: "confirmed" }] },
      { method: "getLatestBlockhash", params: [{ commitment: "confirmed" }] },
      { method: "getTransactionCount", params: [{ commitment: "confirmed" }] },
      { method: "getRecentPrioritizationFees", params: [] },
      { method: "getVoteAccounts", params: [] },
      { method: "getIdentity", params: [] }
    ],
    { timeoutMs }
  );

  const results = [...batchA];
  const slot = Number(pickResult(batchA, "getSlot") || 0);
  const probeSlot = Number.isFinite(slot) && slot > 2 ? slot - 1 : null;

  if (probeSlot) {
    results.push(
      await rpcRequest("getBlock", [probeSlot, { maxSupportedTransactionVersion: 0 }], { timeoutMs })
    );
    results.push(await rpcRequest("getBlockProduction", [{ commitment: "confirmed" }], { timeoutMs }));
    results.push(await rpcRequest("getLeaderSchedule", [probeSlot], { timeoutMs }));
  }

  results.push(
    await rpcRequest(
      "getAccountInfo",
      [TOKEN_PROGRAM_ID, { encoding: "base64", commitment: "confirmed" }],
      { timeoutMs }
    )
  );
  results.push(
    await rpcRequest(
      "getMultipleAccounts",
      [[TOKEN_PROGRAM_ID, SOL_MINT], { encoding: "base64", commitment: "confirmed" }],
      { timeoutMs }
    )
  );
  results.push(
    await rpcRequest(
      "getTokenSupply",
      [USDC_MINT, { commitment: "confirmed" }],
      { timeoutMs }
    )
  );
  results.push(
    await rpcRequest(
      "getTokenLargestAccounts",
      [USDC_MINT, { commitment: "confirmed" }],
      { timeoutMs }
    )
  );

  const signaturesResult = await rpcRequest(
    "getSignaturesForAddress",
    [USDC_MINT, { limit: 1, commitment: "confirmed" }],
    { timeoutMs }
  );
  results.push(signaturesResult);

  const signature = signaturesResult?.result?.[0]?.signature;
  if (signature) {
    results.push(
      await rpcRequest(
        "getSignatureStatuses",
        [[signature], { searchTransactionHistory: true }],
        { timeoutMs }
      )
    );
    results.push(
      await rpcRequest(
        "getTransaction",
        [signature, { encoding: "json", maxSupportedTransactionVersion: 0 }],
        { timeoutMs }
      )
    );
  }

  let healthStatus = {
    success: false,
    statusCode: null,
    latencyMs: null,
    error: null,
    endpoint: `${sanitizeUrl(getRpcBaseUrl())}/health`
  };

  const healthStartedAt = Date.now();
  try {
    const healthResponse = await withTimeout(
      axios.get(`${getRpcBaseUrl()}/health`, {
        headers: process.env.ORBITFLARE_API_KEY
          ? { "x-api-key": process.env.ORBITFLARE_API_KEY }
          : {}
      }),
      timeoutMs
    );
    healthStatus = {
      success: true,
      statusCode: Number(healthResponse.status),
      latencyMs: Date.now() - healthStartedAt,
      error: null,
      endpoint: `${sanitizeUrl(getRpcBaseUrl())}/health`
    };
  } catch (error) {
    healthStatus = {
      success: false,
      statusCode: Number(error?.response?.status || 0) || null,
      latencyMs: Date.now() - healthStartedAt,
      error: normalizeRpcError(error),
      endpoint: `${sanitizeUrl(getRpcBaseUrl())}/health`
    };
  }

  const successCount = results.filter((item) => item.success).length;
  const failureCount = results.length - successCount;

  lastProbe = {
    startedAt,
    finishedAt: Date.now(),
    durationMs: Date.now() - startedAt,
    successCount,
    failureCount,
    health: healthStatus
  };

  return {
    startedAt,
    finishedAt: lastProbe.finishedAt,
    durationMs: lastProbe.durationMs,
    health: healthStatus,
    successCount,
    failureCount,
    results
  };
}

async function getOrbitFlareWalletSnapshot(options = {}) {
  const address = String(options.address || "").trim();
  const tokenLimit = clamp(options.tokenLimit, 1, 200, 50);
  const signatureLimit = clamp(options.signatureLimit, 1, 20, DEFAULT_SIGNATURE_LIMIT);
  const timeoutMs = clamp(options.timeoutMs, 1000, 10000, DEFAULT_TIMEOUT_MS);

  const responses = await rpcBatch(
    [
      {
        method: "getAccountInfo",
        params: [address, { encoding: "base64", commitment: "confirmed" }]
      },
      {
        method: "getBalance",
        params: [address, { commitment: "confirmed" }]
      },
      {
        method: "getTokenAccountsByOwner",
        params: [
          address,
          { programId: TOKEN_PROGRAM_ID },
          { encoding: "jsonParsed", commitment: "confirmed" }
        ]
      },
      {
        method: "getSignaturesForAddress",
        params: [address, { limit: signatureLimit, commitment: "confirmed" }]
      }
    ],
    { timeoutMs }
  );

  const [accountInfoResponse, balanceResponse, tokenAccountsResponse, signaturesResponse] = responses;
  const tokenAccounts = Array.isArray(tokenAccountsResponse?.result?.value)
    ? tokenAccountsResponse.result.value.map(parseTokenAccount)
    : [];
  const nonZeroTokenAccounts = tokenAccounts.filter((account) => account.uiAmount > 0);
  const sortedTokenAccounts = [...nonZeroTokenAccounts].sort((left, right) => right.uiAmount - left.uiAmount);
  const signatures = Array.isArray(signaturesResponse?.result)
    ? signaturesResponse.result.map(parseSignatureEntry)
    : [];

  const lamports = Number(balanceResponse?.result?.value || 0);
  const solBalanceLamports = Number.isFinite(lamports) ? lamports : 0;

  return {
    address,
    ownerAccountExists: Boolean(accountInfoResponse?.result?.value),
    solBalanceLamports,
    solBalance: Number((solBalanceLamports / 1_000_000_000).toFixed(6)),
    tokenAccountCount: tokenAccounts.length,
    nonZeroTokenCount: nonZeroTokenAccounts.length,
    tokenAccounts: sortedTokenAccounts.slice(0, tokenLimit),
    recentSignatures: signatures,
    rpcCalls: responses.map(toRpcCallMeta)
  };
}

async function getOrbitFlareChainPulse(options = {}) {
  const timeoutMs = clamp(options.timeoutMs, 1000, 10000, DEFAULT_TIMEOUT_MS);

  const baseResponses = await rpcBatch(
    [
      { method: "getSlot", params: [{ commitment: "confirmed" }] },
      { method: "getBlockHeight", params: [{ commitment: "confirmed" }] },
      { method: "getEpochInfo", params: [{ commitment: "confirmed" }] },
      { method: "getRecentPrioritizationFees", params: [] },
      { method: "getVoteAccounts", params: [] },
      { method: "getBlockProduction", params: [{ commitment: "confirmed" }] }
    ],
    { timeoutMs }
  );

  const slot = Number(baseResponses[0]?.result || 0);
  const probeSlot = Number.isFinite(slot) && slot > 2 ? slot - 1 : null;

  let blockResponse = null;
  let leaderScheduleResponse = null;
  if (probeSlot) {
    [blockResponse, leaderScheduleResponse] = await rpcBatch(
      [
        {
          method: "getBlock",
          params: [probeSlot, { maxSupportedTransactionVersion: 0 }]
        },
        {
          method: "getLeaderSchedule",
          params: [probeSlot]
        }
      ],
      { timeoutMs }
    );
  }

  const prioritizationFeeItems = Array.isArray(baseResponses[3]?.result)
    ? baseResponses[3].result
    : [];
  const fees = prioritizationFeeItems
    .map((item) => Number(item?.prioritizationFee))
    .filter((value) => Number.isFinite(value));

  const voteAccounts = baseResponses[4]?.result || {};
  const block = blockResponse?.result || null;
  const leaderSchedule = leaderScheduleResponse?.result || {};

  const topLeaders = Object.entries(leaderSchedule || {})
    .map(([identity, slots]) => ({
      identity,
      slots: Array.isArray(slots) ? slots.length : 0
    }))
    .sort((left, right) => right.slots - left.slots)
    .slice(0, 8);

  const rpcCalls = [
    ...baseResponses.map(toRpcCallMeta),
    ...(blockResponse ? [toRpcCallMeta(blockResponse)] : []),
    ...(leaderScheduleResponse ? [toRpcCallMeta(leaderScheduleResponse)] : [])
  ];

  return {
    slot: Number.isFinite(slot) ? slot : null,
    blockHeight: Number(baseResponses[1]?.result || 0) || null,
    epoch: Number(baseResponses[2]?.result?.epoch || 0) || null,
    slotIndex: Number(baseResponses[2]?.result?.slotIndex || 0) || null,
    slotsInEpoch: Number(baseResponses[2]?.result?.slotsInEpoch || 0) || null,
    blockTxCount: Array.isArray(block?.transactions) ? block.transactions.length : null,
    blockTime: Number.isFinite(Number(block?.blockTime)) ? Number(block.blockTime) : null,
    voteAccounts: {
      current: Array.isArray(voteAccounts?.current) ? voteAccounts.current.length : 0,
      delinquent: Array.isArray(voteAccounts?.delinquent) ? voteAccounts.delinquent.length : 0
    },
    prioritizationFees: {
      sampleCount: fees.length,
      min: fees.length ? Math.min(...fees) : null,
      max: fees.length ? Math.max(...fees) : null,
      avg: fees.length ? Number((fees.reduce((acc, value) => acc + value, 0) / fees.length).toFixed(2)) : null,
      median: calculateMedian(fees)
    },
    topLeaders,
    rpcCalls
  };
}

async function getOrbitFlareTxReplay(options = {}) {
  const address = String(options.address || "").trim();
  const limit = clamp(options.limit, 1, MAX_REPLAY_LIMIT, DEFAULT_REPLAY_LIMIT);
  const timeoutMs = clamp(options.timeoutMs, 1000, 10000, DEFAULT_TIMEOUT_MS);
  const before = String(options.before || "").trim();
  const until = String(options.until || "").trim();

  const signatureOptions = { limit, commitment: "confirmed" };
  if (before) {
    signatureOptions.before = before;
  }
  if (until) {
    signatureOptions.until = until;
  }

  const signaturesResponse = await rpcRequest(
    "getSignaturesForAddress",
    [address, signatureOptions],
    { timeoutMs }
  );

  const signatures = Array.isArray(signaturesResponse?.result)
    ? signaturesResponse.result.filter((entry) => entry?.signature)
    : [];
  const signatureValues = signatures.map((entry) => String(entry.signature));

  let statusesResponse = null;
  if (signatureValues.length) {
    statusesResponse = await rpcRequest(
      "getSignatureStatuses",
      [signatureValues, { searchTransactionHistory: true }],
      { timeoutMs }
    );
  }

  const txResponsesBySignature = new Map();
  const signatureChunks = chunkArray(signatureValues, 8);
  for (const signatureChunk of signatureChunks) {
    const chunkResponses = await rpcBatch(
      signatureChunk.map((signature) => ({
        method: "getTransaction",
        params: [signature, { encoding: "json", commitment: "confirmed", maxSupportedTransactionVersion: 0 }]
      })),
      { timeoutMs }
    );

    for (let index = 0; index < signatureChunk.length; index += 1) {
      txResponsesBySignature.set(signatureChunk[index], chunkResponses[index]);
    }
  }

  const statusValues = Array.isArray(statusesResponse?.result?.value)
    ? statusesResponse.result.value
    : [];
  const items = signatures.map((signatureEntry, index) =>
    parseTxReplayItem({
      signatureEntry,
      statusEntry: statusValues[index] || null,
      txResponse: txResponsesBySignature.get(signatureEntry.signature),
      ownerAddress: address
    })
  );

  const txResponses = Array.from(txResponsesBySignature.values()).filter(Boolean);
  const rpcCalls = [
    toRpcCallMeta(signaturesResponse),
    ...(statusesResponse ? [toRpcCallMeta(statusesResponse)] : []),
    ...txResponses.map(toRpcCallMeta)
  ];

  return {
    address,
    count: items.length,
    items,
    rpcCalls
  };
}

async function runOrbitFlareAdvancedProbe(options = {}) {
  const timeoutMs = clamp(options.timeoutMs, 1000, 12000, DEFAULT_TIMEOUT_MS);
  const startedAt = Date.now();

  if (DEMO_MODE) {
    lastAdvancedProbe = {
      timestamp: startedAt,
      durationMs: 1,
      successCount: 7,
      failureCount: 0,
      summary: {
        genesisHash: "demo-genesis-hash",
        firstAvailableBlock: 0,
        highestSnapshotSlot: {
          full: 257382900,
          incremental: 257382950
        },
        epochSchedule: {
          slotsPerEpoch: 432000,
          warmup: false
        },
        supply: {
          total: 0,
          circulating: 0,
          nonCirculating: 0
        },
        inflationRate: {
          total: 0,
          validator: 0,
          foundation: 0,
          epoch: 0
        },
        clusterNodes: {
          count: 0
        },
        performanceSamples: {
          sampleCount: 0,
          latestTransactions: 0,
          latestSlots: 0
        }
      },
      rpcCalls: []
    };

    return lastAdvancedProbe;
  }

  const responses = await rpcBatch(
    [
      { method: "getGenesisHash", params: [] },
      { method: "getFirstAvailableBlock", params: [] },
      { method: "getHighestSnapshotSlot", params: [] },
      { method: "getEpochSchedule", params: [] },
      { method: "getSupply", params: [{ commitment: "confirmed" }] },
      { method: "getInflationRate", params: [] },
      { method: "getClusterNodes", params: [] },
      { method: "getRecentPerformanceSamples", params: [5] }
    ],
    { timeoutMs }
  );

  const successCount = responses.filter((response) => response.success).length;
  const failureCount = responses.length - successCount;

  const getByMethod = (method) => responses.find((item) => item.method === method)?.result || null;
  const supplyValue = getByMethod("getSupply")?.value || null;
  const inflationRate = getByMethod("getInflationRate") || null;
  const performanceSamples = Array.isArray(getByMethod("getRecentPerformanceSamples"))
    ? getByMethod("getRecentPerformanceSamples")
    : [];
  const latestPerformance = performanceSamples[0] || null;
  const clusterNodes = Array.isArray(getByMethod("getClusterNodes")) ? getByMethod("getClusterNodes") : [];

  lastAdvancedProbe = {
    timestamp: startedAt,
    durationMs: Date.now() - startedAt,
    successCount,
    failureCount,
    summary: {
      genesisHash: getByMethod("getGenesisHash"),
      firstAvailableBlock: getByMethod("getFirstAvailableBlock"),
      highestSnapshotSlot: getByMethod("getHighestSnapshotSlot"),
      epochSchedule: getByMethod("getEpochSchedule")
        ? {
            slotsPerEpoch: Number(getByMethod("getEpochSchedule")?.slotsPerEpoch || 0) || null,
            warmup: Boolean(getByMethod("getEpochSchedule")?.warmup)
          }
        : null,
      supply: supplyValue
        ? {
            total: Number(supplyValue.total || 0) || null,
            circulating: Number(supplyValue.circulating || 0) || null,
            nonCirculating: Number(supplyValue.nonCirculating || 0) || null
          }
        : null,
      inflationRate: inflationRate
        ? {
            total: Number(inflationRate.total || 0),
            validator: Number(inflationRate.validator || 0),
            foundation: Number(inflationRate.foundation || 0),
            epoch: Number(inflationRate.epoch || 0)
          }
        : null,
      clusterNodes: {
        count: clusterNodes.length
      },
      performanceSamples: {
        sampleCount: performanceSamples.length,
        latestTransactions: Number(latestPerformance?.numTransactions || 0) || 0,
        latestSlots: Number(latestPerformance?.numSlots || 0) || 0
      }
    },
    rpcCalls: responses.map(toRpcCallMeta)
  };

  return lastAdvancedProbe;
}

async function runOrbitFlareWebsocketProbe(options = {}) {
  const listenMs = clamp(options.listenMs, 1000, 10000, DEFAULT_WEBSOCKET_LISTEN_MS);
  const startedAt = Date.now();

  websocketStats.probeCount += 1;
  websocketStats.lastProbeAt = startedAt;

  if (DEMO_MODE) {
    websocketStats.successCount += 1;
    websocketStats.lastError = null;
    lastWebsocketProbe = {
      timestamp: startedAt,
      durationMs: 1,
      listenMs,
      overallSuccess: true,
      channels: [
        {
          channel: "slot",
          success: true,
          subscribed: true,
          timedOut: false,
          eventReceived: true,
          eventCount: 1,
          latencyMs: 1,
          firstEventLatencyMs: 1,
          subscriptionId: 1,
          eventPreview: "{\"slot\":257382992}",
          error: null
        }
      ]
    };
    return lastWebsocketProbe;
  }

  const connection = getConnection();
  const channels = await Promise.all([
    runWebsocketChannelProbe({
      channel: "slot",
      listenMs,
      register: (handler) => connection.onSlotChange(handler),
      remove: (id) => connection.removeSlotChangeListener(id)
    }),
    runWebsocketChannelProbe({
      channel: "logs",
      listenMs,
      register: (handler) =>
        connection.onLogs(
          "all",
          (logEvent) =>
            handler({
              signature: logEvent?.signature || null,
              err: logEvent?.err || null,
              logs: Array.isArray(logEvent?.logs) ? logEvent.logs.length : 0
            }),
          "confirmed"
        ),
      remove: (id) => connection.removeOnLogsListener(id)
    }),
    runWebsocketChannelProbe({
      channel: "program",
      listenMs,
      register: (handler) =>
        connection.onProgramAccountChange(
          TOKEN_PROGRAM_ID,
          (programEvent, context) =>
            handler({
              slot: Number(context?.slot || 0),
              accountId: typeof programEvent?.accountId?.toBase58 === "function"
                ? programEvent.accountId.toBase58()
                : null
            }),
          "confirmed"
        ),
      remove: (id) => connection.removeProgramAccountChangeListener(id)
    })
  ]);

  const failureCount = channels.filter((channel) => !channel.success).length;
  const overallSuccess = failureCount === 0;

  if (overallSuccess) {
    websocketStats.successCount += 1;
    websocketStats.lastError = null;
  } else {
    websocketStats.failureCount += 1;
    websocketStats.lastError = channels
      .filter((channel) => !channel.success)
      .map((channel) => `${channel.channel}:${channel.error}`)
      .join(", ");
  }

  lastWebsocketProbe = {
    timestamp: startedAt,
    durationMs: Date.now() - startedAt,
    listenMs,
    overallSuccess,
    channels
  };

  return lastWebsocketProbe;
}

function getOrbitFlareWebsocketSnapshot() {
  return {
    ...websocketStats,
    lastProbe: lastWebsocketProbe
  };
}

async function submitOrbitFlareSignedTransaction(options = {}) {
  const startedAt = Date.now();
  const confirmTimeoutMs = clamp(options.confirmTimeoutMs, 2000, 120000, DEFAULT_TX_CONFIRM_TIMEOUT_MS);
  const sendTimeoutMs = clamp(options.sendTimeoutMs, 1000, 30000, DEFAULT_TIMEOUT_MS);
  const statusTimeoutMs = clamp(options.statusTimeoutMs, 1000, 20000, DEFAULT_TIMEOUT_MS);
  const skipPreflight = Boolean(options.skipPreflight);
  const maxRetries = clamp(options.maxRetries, 0, 20, 3);
  const preflightCommitment = String(options.preflightCommitment || "confirmed");

  submissionStats.total += 1;
  submissionStats.lastSubmittedAt = startedAt;

  if (DEMO_MODE) {
    const demoResult = {
      success: true,
      signature: "demo-signature",
      txVersion: "demo",
      submittedAt: startedAt,
      completedAt: Date.now(),
      sendLatencyMs: 1,
      confirmLatencyMs: 1,
      latencyMs: 2,
      confirmationStatus: "confirmed",
      error: null,
      explorerUrl: null,
      rpcCalls: []
    };

    submissionStats.success += 1;
    submissionStats.lastError = null;
    lastSubmission = demoResult;
    return demoResult;
  }

  try {
    const payload = decodeSignedTransactionBase64(
      options.signedTransaction || options.signedTxBase64 || options.transaction
    );
    const txVersion = detectTransactionEncoding(payload);
    const connection = getConnection();

    const sendStartedAt = Date.now();
    const signature = await withTimeout(
      connection.sendRawTransaction(payload, {
        skipPreflight,
        preflightCommitment,
        maxRetries
      }),
      sendTimeoutMs
    );
    const sendLatencyMs = Date.now() - sendStartedAt;
    trackMethod("sendTransaction", {
      success: true,
      latencyMs: sendLatencyMs
    });

    const confirmStartedAt = Date.now();
    let confirmationError = null;
    try {
      await withTimeout(connection.confirmTransaction(signature, "confirmed"), confirmTimeoutMs);
      trackMethod("confirmTransaction", {
        success: true,
        latencyMs: Date.now() - confirmStartedAt
      });
    } catch (confirmError) {
      confirmationError = normalizeRpcError(confirmError);
      trackMethod("confirmTransaction", {
        success: false,
        latencyMs: Date.now() - confirmStartedAt,
        error: confirmationError
      });
    }

    const statusesResponse = await rpcRequest(
      "getSignatureStatuses",
      [[signature], { searchTransactionHistory: true }],
      { timeoutMs: statusTimeoutMs }
    );
    const status = statusesResponse?.result?.value?.[0] || null;
    const statusError = status?.err || null;
    const confirmationStatus = status?.confirmationStatus
      ? String(status.confirmationStatus)
      : confirmationError
        ? "timeout"
        : "confirmed";

    const success = !statusError && confirmationStatus !== "timeout";
    const result = {
      success,
      signature,
      txVersion,
      submittedAt: startedAt,
      completedAt: Date.now(),
      sendLatencyMs,
      confirmLatencyMs: Date.now() - confirmStartedAt,
      latencyMs: Date.now() - startedAt,
      confirmationStatus,
      error: statusError ? JSON.stringify(statusError) : confirmationError,
      explorerUrl: buildExplorerTxUrl(signature),
      rpcCalls: [toRpcCallMeta(statusesResponse)]
    };

    if (success) {
      submissionStats.success += 1;
      submissionStats.lastError = null;
    } else {
      submissionStats.failure += 1;
      submissionStats.lastError = result.error || "Unknown submission failure";
    }

    lastSubmission = result;
    return result;
  } catch (error) {
    const normalizedError = normalizeRpcError(error);
    trackMethod("sendTransaction", {
      success: false,
      latencyMs: Date.now() - startedAt,
      error: normalizedError
    });
    submissionStats.failure += 1;
    submissionStats.lastError = normalizedError;

    lastSubmission = {
      success: false,
      signature: null,
      txVersion: null,
      submittedAt: startedAt,
      completedAt: Date.now(),
      sendLatencyMs: null,
      confirmLatencyMs: null,
      latencyMs: Date.now() - startedAt,
      confirmationStatus: null,
      error: normalizedError,
      explorerUrl: null,
      rpcCalls: []
    };

    return lastSubmission;
  }
}

module.exports = {
  rpcRequest,
  rpcBatch,
  runOrbitFlareProbe,
  runOrbitFlareAdvancedProbe,
  runOrbitFlareWebsocketProbe,
  submitOrbitFlareSignedTransaction,
  getOrbitFlareUsageSnapshot: toUsageSnapshot,
  getOrbitFlareWebsocketSnapshot,
  getOrbitFlareWalletSnapshot,
  getOrbitFlareChainPulse,
  getOrbitFlareTxReplay
};
