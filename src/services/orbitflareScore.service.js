function normalizeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function scoreMethodCoverage(usage) {
  const methodCount = Array.isArray(usage?.methods) ? usage.methods.length : 0;
  const targetCount = 20;
  const score = methodCount > 0
    ? clamp((methodCount / targetCount) * 35, 0, 35)
    : 0;

  return {
    score: Number(score.toFixed(2)),
    max: 35,
    methodCount,
    targetCount
  };
}

function scoreCallVolume(usage) {
  const totalCalls = normalizeNumber(usage?.totalCalls, 0);
  const targetCalls = 300;
  const score = totalCalls > 0
    ? clamp((totalCalls / targetCalls) * 10, 0, 10)
    : 0;

  return {
    score: Number(score.toFixed(2)),
    max: 10,
    totalCalls,
    targetCalls
  };
}

function scoreSuccessRate(usage) {
  const successRate = usage?.successRate;
  if (!Number.isFinite(successRate)) {
    return {
      score: 0,
      max: 25,
      successRate: null
    };
  }

  const score = clamp((successRate / 100) * 25, 0, 25);
  return {
    score: Number(score.toFixed(2)),
    max: 25,
    successRate: Number(successRate)
  };
}

function scoreStreamHealth(stream) {
  let score = 0;
  const connected = Boolean(stream?.connected);
  const reconnectCount = normalizeNumber(stream?.reconnectCount, 0);
  const lastMessageAt = normalizeNumber(stream?.lastMessageAt, 0);
  const now = Date.now();

  if (connected) {
    score += 8;
  } else {
    score += 2;
  }

  if (lastMessageAt > 0) {
    const ageMs = now - lastMessageAt;
    if (ageMs < 30_000) {
      score += 6;
    } else if (ageMs < 90_000) {
      score += 3;
    }
  }

  if (reconnectCount <= 3) {
    score += 4;
  } else if (reconnectCount <= 8) {
    score += 2;
  }

  const backfill = stream?.backfill || {};
  if (backfill.enabled && normalizeNumber(backfill.runs, 0) > 0) {
    score += 2;
  }

  return {
    score: Number(clamp(score, 0, 20).toFixed(2)),
    max: 20,
    connected,
    reconnectCount
  };
}

function scoreOpsReadiness(opsSnapshot) {
  const configured = Boolean(opsSnapshot?.configured);
  const lastProbe = opsSnapshot?.lastProbe || null;
  const activeLicenses = normalizeNumber(lastProbe?.licenses?.activeCount, 0);
  const whitelisted = Boolean(lastProbe?.whitelist?.whitelisted);

  let score = 0;

  if (configured) {
    score += 2;
  }

  if (activeLicenses > 0) {
    score += 4;
  }

  if (whitelisted) {
    score += 4;
  }

  return {
    score: Number(clamp(score, 0, 10).toFixed(2)),
    max: 10,
    configured,
    activeLicenses,
    whitelisted
  };
}

function toTier(total) {
  if (total >= 85) {
    return "A";
  }
  if (total >= 70) {
    return "B";
  }
  if (total >= 55) {
    return "C";
  }
  return "D";
}

function buildOrbitFlareUtilizationScore({ usage, stream, opsSnapshot }) {
  const coverage = scoreMethodCoverage(usage);
  const volume = scoreCallVolume(usage);
  const success = scoreSuccessRate(usage);
  const streamHealth = scoreStreamHealth(stream);
  const opsReadiness = scoreOpsReadiness(opsSnapshot);

  const total = Number(
    (coverage.score + volume.score + success.score + streamHealth.score + opsReadiness.score).toFixed(2)
  );

  return {
    total,
    max: 100,
    tier: toTier(total),
    breakdown: {
      methodCoverage: coverage,
      callVolume: volume,
      successRate: success,
      streamHealth,
      opsReadiness
    },
    generatedAt: Date.now()
  };
}

module.exports = {
  buildOrbitFlareUtilizationScore
};
