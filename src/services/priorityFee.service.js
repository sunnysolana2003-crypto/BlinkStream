const { rpcRequest } = require("./orbitflareRpc.service");
const logger = require("../utils/logger");

// Jito tip floor endpoint (public API, no auth required)
const JITO_TIP_URL = "https://bundles.jito.wtf/api/v1/bundles/tip_floor";
const POLL_INTERVAL_MS = 5000;

// State
let pollTimer = null;
let lastSnapshot = null;
let totalPolls = 0;

function percentile(sortedArr, pct) {
    if (!sortedArr.length) return 0;
    const index = Math.ceil((pct / 100) * sortedArr.length) - 1;
    return sortedArr[Math.max(0, index)];
}

async function fetchJitoTipFloor() {
    try {
        const { default: fetch } = await import("node-fetch");
        const res = await fetch(JITO_TIP_URL, { timeout: 4000 });
        if (!res.ok) return null;
        const json = await res.json();
        // Response is an array; first element has the tip floor fields
        const data = Array.isArray(json) ? json[0] : json;
        return {
            p25: Math.round((data?.landed_tips_25th_percentile || 0) * 1e9),
            p50: Math.round((data?.landed_tips_50th_percentile || 0) * 1e9),
            p75: Math.round((data?.landed_tips_75th_percentile || 0) * 1e9),
            p95: Math.round((data?.landed_tips_95th_percentile || 0) * 1e9),
            ema: Math.round((data?.ema_landed_tips_50th_percentile || 0) * 1e9)
        };
    } catch (err) {
        logger.warn("Failed to fetch Jito tip floor:", err.message);
        return null;
    }
}

async function fetchRpcFees() {
    const result = await rpcRequest(
        "getRecentPrioritizationFees",
        [[]],                        // empty accounts = slot-global fees
        { timeoutMs: 4000 }
    );

    if (!result.success || !Array.isArray(result.result)) return null;

    const fees = result.result
        .map(x => Number(x?.prioritizationFee || 0))
        .filter(f => Number.isFinite(f) && f >= 0)
        .sort((a, b) => a - b);

    if (!fees.length) return null;

    return {
        min: fees[0],
        p25: percentile(fees, 25),
        median: percentile(fees, 50),
        p75: percentile(fees, 75),
        p90: percentile(fees, 90),
        max: fees[fees.length - 1],
        sampleCount: fees.length
    };
}

function buildCongestionScore(rpcFees) {
    if (!rpcFees) return { score: 50, label: "UNKNOWN" };
    // Use median as the primary signal; 0–5k = low, 5k–50k = medium, 50k+ = high
    const m = rpcFees.median;
    if (m < 1000) return { score: 10, label: "IDLE" };
    if (m < 5000) return { score: 25, label: "CALM" };
    if (m < 15000) return { score: 50, label: "ACTIVE" };
    if (m < 50000) return { score: 75, label: "BUSY" };
    return { score: 95, label: "CONGESTED" };
}

function buildRecommendations(rpcFees, jitoTips) {
    const baseSafe = rpcFees?.p25 || 1000;
    const baseStd = rpcFees?.median || 5000;
    const baseTurbo = rpcFees?.p90 || 50000;
    const jitoTip = jitoTips?.p50 || 0;

    return {
        safe: {
            priorityFeeLamports: baseSafe,
            jitoTipLamports: 0,
            label: "SAFE (next 3-5 blocks)",
            recommended: false
        },
        standard: {
            priorityFeeLamports: baseStd,
            jitoTipLamports: jitoTip > 0 ? Math.round(jitoTip * 0.5) : 0,
            label: "STANDARD (next 1-2 blocks)",
            recommended: true
        },
        turbo: {
            priorityFeeLamports: baseTurbo,
            jitoTipLamports: jitoTip > 0 ? jitoTip : Math.round(baseTurbo * 1.5),
            label: "TURBO by Jito (next block guaranteed)",
            recommended: false
        }
    };
}

async function refreshSnapshot() {
    totalPolls += 1;
    const timestamp = Date.now();

    try {
        const [rpcFees, jitoTips] = await Promise.all([
            fetchRpcFees(),
            fetchJitoTipFloor()
        ]);

        const congestion = buildCongestionScore(rpcFees);
        const recommendations = buildRecommendations(rpcFees, jitoTips);

        lastSnapshot = {
            timestamp,
            rpcFees,
            jitoTips,
            congestion,
            recommendations,
            totalPolls
        };

        logger.debug(`[PriorityFee] refreshed — congestion: ${congestion.label}, median: ${rpcFees?.median ?? "N/A"} µL`);
    } catch (err) {
        logger.warn("Priority fee refresh failed:", err.message);
    }
}

function startPriorityFeePoller() {
    if (pollTimer) return;
    refreshSnapshot(); // immediate first run
    pollTimer = setInterval(refreshSnapshot, POLL_INTERVAL_MS);
    if (typeof pollTimer.unref === "function") pollTimer.unref();
    logger.info(`[PriorityFee] poller started — interval ${POLL_INTERVAL_MS}ms`);
}

function stopPriorityFeePoller() {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

function getPriorityFeeSnapshot() {
    return lastSnapshot || {
        timestamp: null,
        rpcFees: null,
        jitoTips: null,
        congestion: { score: 50, label: "LOADING" },
        recommendations: buildRecommendations(null, null),
        totalPolls
    };
}

module.exports = {
    startPriorityFeePoller,
    stopPriorityFeePoller,
    getPriorityFeeSnapshot,
    refreshSnapshot
};
