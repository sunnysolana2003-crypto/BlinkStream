const { emitEvent } = require("../sockets/socket");
const { resolveToken } = require("./tokenRegistry.service");
const logger = require("../utils/logger");

// ─── Thresholds ────────────────────────────────────────────────────────────
const WHALE_SOL_THRESHOLD = Number(process.env.WHALE_SOL_THRESHOLD || 100);   // ≥ 100 SOL
const WHALE_USD_THRESHOLD = Number(process.env.WHALE_USD_THRESHOLD || 25000); // ≥ $25k USD

// Rolling ring-buffer of the last 200 whale alerts (newest first)
const MAX_WHALE_HISTORY = 200;
const whaleHistory = [];

// Counters
let detectedCount = 0;
let sessStartedAt = Date.now();

// ─── Classify the type of move ─────────────────────────────────────────────
function classifyWhale(transfer, solPrice) {
    const amountRaw = Number(transfer.amountRaw ?? transfer.amount ?? 0);
    const decimals = Number(transfer.decimals ?? 9);

    if (amountRaw <= 0 || !Number.isFinite(amountRaw)) return null;

    const tokenAmount = amountRaw / Math.pow(10, decimals);
    const isSOL = transfer.program === "system" || transfer.symbol === "SOL";
    const usdValue = isSOL
        ? tokenAmount * solPrice
        : tokenAmount * (transfer.priceUsd || 0);

    const passesSOL = isSOL && tokenAmount >= WHALE_SOL_THRESHOLD;
    const passesUSD = usdValue >= WHALE_USD_THRESHOLD;

    if (!passesSOL && !passesUSD) return null;

    return { tokenAmount, usdValue, isSOL };
}

// ─── Core detector called from stream.job.js ───────────────────────────────
async function detectAndEmitWhale(parsedTx, solPrice) {
    if (!parsedTx || !Array.isArray(parsedTx.transfers)) return;

    for (const transfer of parsedTx.transfers) {
        const result = classifyWhale(transfer, solPrice);
        if (!result) continue;

        const { tokenAmount, usdValue, isSOL } = result;

        // Resolve symbol
        let symbol = transfer.symbol || "SOL";
        let mint = transfer.mint || "So11111111111111111111111111111111111111112";
        if (!isSOL && mint && !symbol) {
            try {
                const resolved = await resolveToken(mint);
                symbol = resolved.symbol || "UNK";
            } catch (_) { symbol = "UNK"; }
        }

        // Determine direction tag
        const direction = usdValue > 200000 ? "🐋 MEGA" : usdValue > 75000 ? "🔴 LARGE" : "🟠 BIG";

        const alert = {
            id: parsedTx.signature + "_" + (mint || "sol"),
            signature: parsedTx.signature,
            slot: parsedTx.slot,
            timestamp: Date.now(),
            direction,
            symbol,
            mint,
            amount: Number(tokenAmount.toFixed(4)),
            usdValue: Number(usdValue.toFixed(2)),
            from: parsedTx.accounts?.[0] || "unknown",
            to: parsedTx.accounts?.[1] || "unknown",
            explorerUrl: `https://solscan.io/tx/${parsedTx.signature}`
        };

        // Add to ring buffer
        whaleHistory.unshift(alert);
        if (whaleHistory.length > MAX_WHALE_HISTORY) {
            whaleHistory.length = MAX_WHALE_HISTORY;
        }

        detectedCount += 1;
        logger.info(`🐋 Whale alert: ${direction} ${alert.amount} ${symbol} (~$${alert.usdValue.toLocaleString()})`);
        emitEvent("whale-alert", alert);

        // Only emit the biggest transfer per tx to avoid spam
        break;
    }
}

// ─── Public API ────────────────────────────────────────────────────────────
function getWhaleHistory(limit = 50) {
    return whaleHistory.slice(0, Math.min(limit, MAX_WHALE_HISTORY));
}

function getWhaleStats() {
    return {
        detectedCount,
        sessStartedAt,
        uptimeSec: Math.round((Date.now() - sessStartedAt) / 1000),
        solThreshold: WHALE_SOL_THRESHOLD,
        usdThreshold: WHALE_USD_THRESHOLD,
        historySize: whaleHistory.length
    };
}

module.exports = { detectAndEmitWhale, getWhaleHistory, getWhaleStats };
