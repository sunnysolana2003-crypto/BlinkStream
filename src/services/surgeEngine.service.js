const {
  SOL_TOKEN,
  SURGE_THRESHOLD_PERCENT,
  SURGE_COOLDOWN_MS
} = require("../config/constants");

const MIN_SURGE_THRESHOLD_PERCENT = 0.1;
const MAX_SURGE_THRESHOLD_PERCENT = 100;
const MIN_SURGE_COOLDOWN_MS = 1000;
const MAX_SURGE_COOLDOWN_MS = 60 * 60 * 1000;
const MINT_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function sanitizeThresholdPercent(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(MIN_SURGE_THRESHOLD_PERCENT, Math.min(MAX_SURGE_THRESHOLD_PERCENT, parsed));
}

function sanitizeCooldownMs(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(MIN_SURGE_COOLDOWN_MS, Math.min(MAX_SURGE_COOLDOWN_MS, Math.floor(parsed)));
}

function normalizeTokenKey(token) {
  const raw = String(token || SOL_TOKEN).trim();
  if (!raw) {
    return SOL_TOKEN;
  }

  if (MINT_ADDRESS_REGEX.test(raw)) {
    return raw;
  }

  return raw.toUpperCase();
}

class SurgeEngine {
  constructor(thresholdPercent, cooldownMs) {
    this.thresholdPercent = sanitizeThresholdPercent(
      thresholdPercent,
      sanitizeThresholdPercent(SURGE_THRESHOLD_PERCENT, 3)
    );
    this.cooldownMs = sanitizeCooldownMs(
      cooldownMs,
      sanitizeCooldownMs(SURGE_COOLDOWN_MS, 30000)
    );
    this.stateByToken = new Map();
  }

  getSettings() {
    return {
      thresholdPercent: Number(this.thresholdPercent.toFixed(4)),
      cooldownMs: this.cooldownMs,
      constraints: {
        minThresholdPercent: MIN_SURGE_THRESHOLD_PERCENT,
        maxThresholdPercent: MAX_SURGE_THRESHOLD_PERCENT,
        minCooldownMs: MIN_SURGE_COOLDOWN_MS,
        maxCooldownMs: MAX_SURGE_COOLDOWN_MS
      }
    };
  }

  updateSettings(options = {}) {
    if (Object.prototype.hasOwnProperty.call(options, "thresholdPercent")) {
      this.thresholdPercent = sanitizeThresholdPercent(options.thresholdPercent, this.thresholdPercent);
    }

    if (Object.prototype.hasOwnProperty.call(options, "cooldownMs")) {
      this.cooldownMs = sanitizeCooldownMs(options.cooldownMs, this.cooldownMs);
    }

    return this.getSettings();
  }

  evaluatePrice(currentPrice, token = SOL_TOKEN, now = Date.now()) {
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      return null;
    }

    const normalizedToken = normalizeTokenKey(token);
    const tokenState = this.stateByToken.get(normalizedToken) || {
      lastPrice: null,
      lastSurgeTimestamp: 0
    };

    if (tokenState.lastPrice === null) {
      tokenState.lastPrice = currentPrice;
      this.stateByToken.set(normalizedToken, tokenState);
      return null;
    }

    const previousPrice = tokenState.lastPrice;
    const changePercent = ((currentPrice - previousPrice) / previousPrice) * 100;
    tokenState.lastPrice = currentPrice;
    this.stateByToken.set(normalizedToken, tokenState);

    if (Math.abs(changePercent) < this.thresholdPercent) {
      return null;
    }

    if (now - tokenState.lastSurgeTimestamp < this.cooldownMs) {
      return null;
    }

    tokenState.lastSurgeTimestamp = now;
    this.stateByToken.set(normalizedToken, tokenState);

    return {
      type: "SURGE",
      token: normalizedToken,
      previousPrice,
      currentPrice,
      changePercent: Number(changePercent.toFixed(4)),
      timestamp: now
    };
  }
}

const surgeEngine = new SurgeEngine(SURGE_THRESHOLD_PERCENT, SURGE_COOLDOWN_MS);

function evaluatePriceSurge(currentPrice, token = SOL_TOKEN, now = Date.now()) {
  return surgeEngine.evaluatePrice(currentPrice, token, now);
}

function getSurgeSettings() {
  return surgeEngine.getSettings();
}

function updateSurgeSettings(options = {}) {
  return surgeEngine.updateSettings(options);
}

module.exports = {
  SurgeEngine,
  evaluatePriceSurge,
  getSurgeSettings,
  updateSurgeSettings
};
