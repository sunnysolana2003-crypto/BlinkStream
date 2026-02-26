const axios = require("axios");
const logger = require("../utils/logger");

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_PUBLIC_IP_URL = "https://api.ipify.org?format=json";
const DEFAULT_MONITOR_INTERVAL_MS = 60000;

const opsStats = {
  probeCount: 0,
  successCount: 0,
  failureCount: 0,
  lastProbeAt: null,
  lastError: null
};

let lastOpsProbe = null;
let monitorTimer = null;
let monitorCycleActive = false;
const monitorState = {
  running: false,
  intervalMs: DEFAULT_MONITOR_INTERVAL_MS,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  runCount: 0,
  lastRunAt: null,
  lastRunSuccess: null,
  lastRunError: null,
  nextRunAt: null
};

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Timeout")), timeoutMs);
    })
  ]);
}

function clamp(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(Math.floor(parsed), max));
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (value && typeof value === "object") {
    if (Array.isArray(value.data)) {
      return value.data;
    }
    if (Array.isArray(value.items)) {
      return value.items;
    }
    if (Array.isArray(value.result)) {
      return value.result;
    }
    if (Array.isArray(value.licenses)) {
      return value.licenses;
    }
    if (Array.isArray(value.whitelistedIps)) {
      return value.whitelistedIps;
    }
    if (Array.isArray(value.whitelisted_ips)) {
      return value.whitelisted_ips;
    }
  }

  return [];
}

function normalizeError(error) {
  if (!error) {
    return "Unknown error";
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
    return "Unknown error";
  }
}

function buildHeaders() {
  const headers = {
    "content-type": "application/json"
  };

  const apiKey = String(process.env.ORBITFLARE_CUSTOMER_API_KEY || process.env.ORBITFLARE_API_KEY || "").trim();
  const bearer = String(process.env.ORBITFLARE_CUSTOMER_BEARER || "").trim();

  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  if (bearer) {
    headers.authorization = `Bearer ${bearer}`;
  }

  return headers;
}

function resolveCustomerApiConfig() {
  const baseUrl = String(process.env.ORBITFLARE_CUSTOMER_API_BASE_URL || "").trim().replace(/\/+$/, "");
  const licensesPath = String(process.env.ORBITFLARE_CUSTOMER_LICENSES_PATH || "/customer/licenses").trim();
  const whitelistPath = String(
    process.env.ORBITFLARE_CUSTOMER_WHITELIST_PATH || "/customer/whitelisted-ips"
  ).trim();
  const publicIpUrl = String(process.env.ORBITFLARE_PUBLIC_IP_URL || DEFAULT_PUBLIC_IP_URL).trim();

  const hasBase = Boolean(baseUrl);
  const hasAuth = Boolean(
    String(process.env.ORBITFLARE_CUSTOMER_API_KEY || process.env.ORBITFLARE_API_KEY || "").trim() ||
      String(process.env.ORBITFLARE_CUSTOMER_BEARER || "").trim()
  );

  return {
    configured: hasBase && hasAuth,
    baseUrl,
    licensesUrl: hasBase ? `${baseUrl}${licensesPath.startsWith("/") ? licensesPath : `/${licensesPath}`}` : null,
    whitelistUrl: hasBase ? `${baseUrl}${whitelistPath.startsWith("/") ? whitelistPath : `/${whitelistPath}`}` : null,
    publicIpUrl
  };
}

function normalizeIpList(payload) {
  const items = toArray(payload);
  const ips = [];

  for (const item of items) {
    if (typeof item === "string") {
      const normalized = item.trim();
      if (normalized) {
        ips.push(normalized);
      }
      continue;
    }

    if (item && typeof item === "object") {
      const candidates = [item.ip, item.address, item.value, item.ipAddress, item.ip_address];
      for (const candidate of candidates) {
        const normalized = String(candidate || "").trim();
        if (normalized) {
          ips.push(normalized);
          break;
        }
      }
    }
  }

  return [...new Set(ips)];
}

function normalizeLicenses(payload) {
  const now = Date.now();
  const items = toArray(payload);

  const licenses = items.map((item) => {
    const id = String(item?.id || item?.licenseId || item?.license_id || "").trim();
    const status = String(item?.status || item?.state || "").trim().toLowerCase();
    const expiresAtRaw = item?.expiresAt || item?.expires_at || item?.expiry || null;
    const expiresAt = expiresAtRaw ? Date.parse(expiresAtRaw) : null;
    const isActiveByStatus = status.includes("active") || status.includes("enabled");
    const isActiveByTime = Number.isFinite(expiresAt) ? expiresAt > now : false;
    const active = isActiveByStatus || isActiveByTime;

    return {
      id,
      status: status || "unknown",
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : null,
      active
    };
  });

  const activeCount = licenses.filter((item) => item.active).length;
  const expiresSoonCount = licenses.filter((item) => {
    if (!Number.isFinite(item.expiresAt)) {
      return false;
    }
    const remainingMs = item.expiresAt - now;
    return remainingMs > 0 && remainingMs < 3 * 24 * 60 * 60 * 1000;
  }).length;

  return {
    total: licenses.length,
    activeCount,
    expiresSoonCount,
    licenses: licenses.slice(0, 20)
  };
}

function isIpWhitelisted(whitelistedIps, publicIp) {
  if (!publicIp) {
    return false;
  }

  if (!Array.isArray(whitelistedIps) || !whitelistedIps.length) {
    return false;
  }

  return whitelistedIps.includes(publicIp);
}

function buildGuardrails({ configured, licenses, whitelist, publicIp, callErrors }) {
  const warnings = [];
  const failures = [];

  if (!configured) {
    failures.push("customer_api_not_configured");
  }

  if (licenses && licenses.activeCount <= 0) {
    failures.push("no_active_license");
  }

  if (publicIp && whitelist && whitelist.length > 0 && !isIpWhitelisted(whitelist, publicIp)) {
    failures.push("public_ip_not_whitelisted");
  }

  if (licenses && licenses.expiresSoonCount > 0) {
    warnings.push("license_expiring_soon");
  }

  if (!publicIp) {
    warnings.push("public_ip_unavailable");
  }

  if (Array.isArray(callErrors) && callErrors.length) {
    warnings.push("partial_ops_probe_failures");
  }

  const status = failures.length ? "critical" : warnings.length ? "warning" : "healthy";

  return {
    status,
    warnings,
    failures
  };
}

async function requestJson(url, timeoutMs, headers) {
  const startedAt = Date.now();

  try {
    const response = await withTimeout(
      axios.get(url, {
        headers
      }),
      timeoutMs
    );
    return {
      success: true,
      latencyMs: Date.now() - startedAt,
      statusCode: Number(response.status || 0) || null,
      data: response.data,
      error: null,
      url
    };
  } catch (error) {
    return {
      success: false,
      latencyMs: Date.now() - startedAt,
      statusCode: Number(error?.response?.status || 0) || null,
      data: null,
      error: normalizeError(error),
      url
    };
  }
}

async function runOrbitFlareOpsProbe(options = {}) {
  const timeoutMs = clamp(options.timeoutMs, 1000, 15000, DEFAULT_TIMEOUT_MS);
  const config = resolveCustomerApiConfig();
  const headers = buildHeaders();
  const startedAt = Date.now();

  opsStats.probeCount += 1;
  opsStats.lastProbeAt = startedAt;

  if (!config.configured) {
    const guardrails = buildGuardrails({
      configured: false,
      licenses: null,
      whitelist: [],
      publicIp: null,
      callErrors: []
    });

    lastOpsProbe = {
      configured: false,
      timestamp: startedAt,
      durationMs: Date.now() - startedAt,
      licenses: {
        total: 0,
        activeCount: 0,
        expiresSoonCount: 0,
        licenses: []
      },
      whitelist: {
        publicIp: null,
        entries: [],
        whitelisted: false
      },
      calls: [],
      guardrails
    };

    opsStats.failureCount += 1;
    opsStats.lastError = "Customer API is not configured";
    return lastOpsProbe;
  }

  const calls = [];
  const callErrors = [];

  const licensesCall = await requestJson(config.licensesUrl, timeoutMs, headers);
  calls.push({
    name: "licenses",
    ...licensesCall
  });
  if (!licensesCall.success) {
    callErrors.push(`licenses:${licensesCall.error}`);
  }

  const whitelistCall = await requestJson(config.whitelistUrl, timeoutMs, headers);
  calls.push({
    name: "whitelist",
    ...whitelistCall
  });
  if (!whitelistCall.success) {
    callErrors.push(`whitelist:${whitelistCall.error}`);
  }

  const publicIpCall = await requestJson(config.publicIpUrl, timeoutMs, {});
  calls.push({
    name: "public-ip",
    ...publicIpCall
  });
  if (!publicIpCall.success) {
    callErrors.push(`public-ip:${publicIpCall.error}`);
  }

  const licenses = normalizeLicenses(licensesCall.data);
  const whitelistedIps = normalizeIpList(whitelistCall.data);
  const publicIp = String(
    publicIpCall?.data?.ip ||
      publicIpCall?.data?.address ||
      publicIpCall?.data?.origin ||
      ""
  ).trim() || null;
  const whitelisted = isIpWhitelisted(whitelistedIps, publicIp);

  const guardrails = buildGuardrails({
    configured: true,
    licenses,
    whitelist: whitelistedIps,
    publicIp,
    callErrors
  });

  lastOpsProbe = {
    configured: true,
    timestamp: startedAt,
    durationMs: Date.now() - startedAt,
    licenses,
    whitelist: {
      publicIp,
      entries: whitelistedIps,
      whitelisted
    },
    calls: calls.map((call) => ({
      name: call.name,
      success: call.success,
      statusCode: call.statusCode,
      latencyMs: call.latencyMs,
      error: call.error,
      url: call.url
    })),
    guardrails
  };

  if (guardrails.status === "critical") {
    opsStats.failureCount += 1;
    opsStats.lastError = guardrails.failures.join(",");
  } else {
    opsStats.successCount += 1;
    opsStats.lastError = null;
  }

  return lastOpsProbe;
}

async function runMonitorCycle() {
  if (!monitorState.running || monitorCycleActive) {
    return;
  }

  monitorCycleActive = true;
  monitorState.runCount += 1;
  monitorState.lastRunAt = Date.now();

  try {
    await runOrbitFlareOpsProbe({ timeoutMs: monitorState.timeoutMs });
    monitorState.lastRunSuccess = true;
    monitorState.lastRunError = null;
  } catch (error) {
    monitorState.lastRunSuccess = false;
    monitorState.lastRunError = normalizeError(error);
    logger.warn("OrbitFlare ops monitor cycle failed:", monitorState.lastRunError);
  } finally {
    monitorState.nextRunAt = Date.now() + monitorState.intervalMs;
    monitorCycleActive = false;
  }
}

function startOrbitFlareOpsMonitor(options = {}) {
  if (monitorState.running) {
    return getOpsMonitorStatus();
  }

  monitorState.intervalMs = clamp(
    options.intervalMs || process.env.ORBITFLARE_OPS_MONITOR_INTERVAL_MS,
    5000,
    300000,
    DEFAULT_MONITOR_INTERVAL_MS
  );
  monitorState.timeoutMs = clamp(
    options.timeoutMs || process.env.ORBITFLARE_OPS_MONITOR_TIMEOUT_MS,
    1000,
    15000,
    DEFAULT_TIMEOUT_MS
  );
  monitorState.running = true;
  monitorState.nextRunAt = Date.now();

  void runMonitorCycle();

  monitorTimer = setInterval(() => {
    void runMonitorCycle();
  }, monitorState.intervalMs);

  if (typeof monitorTimer.unref === "function") {
    monitorTimer.unref();
  }

  return getOpsMonitorStatus();
}

function stopOrbitFlareOpsMonitor() {
  monitorState.running = false;
  monitorState.nextRunAt = null;

  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }

  return getOpsMonitorStatus();
}

function getOpsMonitorStatus() {
  return {
    ...monitorState,
    cycleActive: monitorCycleActive
  };
}

function getOrbitFlareOpsSnapshot() {
  const config = resolveCustomerApiConfig();
  return {
    configured: config.configured,
    stats: { ...opsStats },
    monitor: getOpsMonitorStatus(),
    lastProbe: lastOpsProbe
  };
}

module.exports = {
  runOrbitFlareOpsProbe,
  getOrbitFlareOpsSnapshot,
  startOrbitFlareOpsMonitor,
  stopOrbitFlareOpsMonitor,
  getOpsMonitorStatus
};
