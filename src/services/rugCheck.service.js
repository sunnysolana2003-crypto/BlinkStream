const { Connection, PublicKey } = require("@solana/web3.js");
const logger = require("../utils/logger");

const RPC_URL = process.env.ORBITFLARE_RPC_URL || "https://api.mainnet-beta.solana.com";
const connection = new Connection(RPC_URL, "confirmed");

const RISK_WEIGHTS = {
    mintAuthorityActive: 35,
    freezeAuthorityActive: 20,
    top1HolderOver50pct: 25,
    top5HoldersOver80pct: 15,
    supplyAnomalyQuadrillion: 10,
    noMetadata: 5,
    zeroHolders: 10
};

function scoreRisk(flags) {
    let score = 0;
    for (const [flag, active] of Object.entries(flags)) {
        if (active && RISK_WEIGHTS[flag]) {
            score += RISK_WEIGHTS[flag];
        }
    }
    return Math.min(score, 100);
}

function riskLabel(score) {
    if (score >= 70) return "HIGH";
    if (score >= 40) return "MEDIUM";
    return "LOW";
}

function formatSupply(raw, decimals) {
    return Number(raw) / Math.pow(10, decimals);
}

async function getMintInfo(mintAddress) {
    const pubkey = new PublicKey(mintAddress);
    const info = await connection.getParsedAccountInfo(pubkey);

    if (!info?.value?.data || typeof info.value.data !== "object" || !("parsed" in info.value.data)) {
        throw new Error("Not a valid SPL token mint address");
    }

    const parsed = info.value.data.parsed;
    if (parsed.type !== "mint") {
        throw new Error("Account is not a mint");
    }

    return parsed.info;
}

async function getTopHolders(mintAddress) {
    const pubkey = new PublicKey(mintAddress);
    const result = await connection.getTokenLargestAccounts(pubkey);
    return result?.value || [];
}

async function runRugCheck(mintAddress) {
    const start = Date.now();

    let mintInfo;
    try {
        mintInfo = await getMintInfo(mintAddress);
    } catch (error) {
        throw new Error(`Invalid mint: ${error.message}`);
    }

    const {
        mintAuthority,
        freezeAuthority,
        supply,
        decimals,
        isInitialized
    } = mintInfo;

    const rawSupply = Number(supply || 0);
    const humanSupply = formatSupply(rawSupply, decimals ?? 0);

    // Fetch top holders
    let topHolders = [];
    let holderError = null;
    try {
        topHolders = await getTopHolders(mintAddress);
    } catch (error) {
        holderError = error.message;
        logger.warn(`getTokenLargestAccounts failed for ${mintAddress}: ${error.message}`);
    }

    // Calculate holder concentration
    const top1Amount = topHolders[0] ? Number(topHolders[0].uiAmount || 0) : 0;
    const top5Amount = topHolders.slice(0, 5).reduce((sum, h) => sum + Number(h.uiAmount || 0), 0);
    const top1Pct = humanSupply > 0 ? (top1Amount / humanSupply) * 100 : 0;
    const top5Pct = humanSupply > 0 ? (top5Amount / humanSupply) * 100 : 0;

    // Evaluate flags
    const flags = {
        mintAuthorityActive: Boolean(mintAuthority),
        freezeAuthorityActive: Boolean(freezeAuthority),
        top1HolderOver50pct: top1Pct > 50,
        top5HoldersOver80pct: top5Pct > 80,
        supplyAnomalyQuadrillion: humanSupply > 1e15,
        noMetadata: !isInitialized,
        zeroHolders: topHolders.length === 0 && !holderError
    };

    const riskScore = scoreRisk(flags);
    const risk = riskLabel(riskScore);

    const checks = [
        {
            id: "mintAuthority",
            label: "Mint Authority",
            status: flags.mintAuthorityActive ? "DANGER" : "SAFE",
            detail: flags.mintAuthorityActive
                ? `Active — creator can mint unlimited tokens`
                : "Revoked — supply is fixed",
            value: mintAuthority || null
        },
        {
            id: "freezeAuthority",
            label: "Freeze Authority",
            status: flags.freezeAuthorityActive ? "WARN" : "SAFE",
            detail: flags.freezeAuthorityActive
                ? "Active — creator can freeze token accounts"
                : "Revoked — no freeze risk",
            value: freezeAuthority || null
        },
        {
            id: "holderConcentration",
            label: "Holder Concentration",
            status: flags.top1HolderOver50pct ? "DANGER" : flags.top5HoldersOver80pct ? "WARN" : "SAFE",
            detail: holderError
                ? `Could not fetch holders: ${holderError}`
                : `Top 1: ${top1Pct.toFixed(1)}%  |  Top 5: ${top5Pct.toFixed(1)}%`,
            value: { top1Pct: top1Pct.toFixed(2), top5Pct: top5Pct.toFixed(2), holderCount: topHolders.length }
        },
        {
            id: "supply",
            label: "Token Supply",
            status: flags.supplyAnomalyQuadrillion ? "WARN" : "SAFE",
            detail: flags.supplyAnomalyQuadrillion
                ? `Abnormally large supply: ${humanSupply.toExponential(2)}`
                : `${humanSupply.toLocaleString(undefined, { maximumFractionDigits: 2 })} tokens (${decimals} decimals)`,
            value: { humanSupply, decimals, rawSupply: String(rawSupply) }
        }
    ];

    return {
        mint: mintAddress,
        riskScore,
        risk,
        flags,
        checks,
        topHolders: topHolders.slice(0, 10).map((h) => ({
            address: h.address?.toBase58?.() || String(h.address),
            uiAmount: h.uiAmount,
            pct: humanSupply > 0 ? ((Number(h.uiAmount || 0) / humanSupply) * 100).toFixed(2) : "0.00"
        })),
        latencyMs: Date.now() - start
    };
}

module.exports = { runRugCheck };
