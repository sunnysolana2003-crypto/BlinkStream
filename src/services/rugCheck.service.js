const { PublicKey } = require("@solana/web3.js");
const { getConnection } = require("../config/rpc.config");
const axios = require("axios");
const logger = require("../utils/logger");

const METADATA_PROGRAM_ID = new PublicKey("metaqb7iiNo7366mCcS3eRpk9pSa5124YXMTX4P6sen");
const TOKEN_2022_PROGRAM_ID = new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

const RISK_WEIGHTS = {
    mintAuthorityActive: 35,
    freezeAuthorityActive: 20,
    isMutable: 15,
    lpNotBurned: 30,
    top1HolderOver50pct: 20,
    top5HoldersOver80pct: 15,
    tradingHaltRisk: 40, // Permanent Delegate or Tax loopholes
    supplyAnomaly: 10,
    noMetadata: 5
};

function getConn() {
    return getConnection();
}

/**
 * Expert Risk Scoring
 */
function scoreRisk(flags) {
    let score = 0;
    if (flags.lpNotBurned) score += RISK_WEIGHTS.lpNotBurned;
    if (flags.mintAuthorityActive) score += RISK_WEIGHTS.mintAuthorityActive;
    if (flags.freezeAuthorityActive) score += RISK_WEIGHTS.freezeAuthorityActive;
    if (flags.tradingHaltRisk) score += RISK_WEIGHTS.tradingHaltRisk;
    if (flags.isMutable) score += RISK_WEIGHTS.isMutable;
    if (flags.top1HolderOver50pct) score += RISK_WEIGHTS.top1HolderOver50pct;
    if (flags.top5HoldersOver80pct) score += RISK_WEIGHTS.top5HoldersOver80pct;
    if (flags.supplyAnomaly) score += RISK_WEIGHTS.supplyAnomaly;
    if (flags.noMetadata) score += RISK_WEIGHTS.noMetadata;

    return Math.min(score, 100);
}

function riskLabel(score) {
    if (score >= 75) return "DANGER";
    if (score >= 50) return "HIGH";
    if (score >= 25) return "MEDIUM";
    return "LOW";
}

async function getMetadataStatus(mintAddress) {
    try {
        const mint = new PublicKey(mintAddress);
        const [metadataAddress] = PublicKey.findProgramAddressSync(
            [Buffer.from("metadata"), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
            METADATA_PROGRAM_ID
        );
        const info = await getConn().getAccountInfo(metadataAddress);
        if (!info) return { exists: false, isMutable: true };

        // isMutable is the LAST byte of the metadata V1 account (excluding padding/extensions)
        // For V1 Metadata accounts, isMutable is at offset 1 + 32 + 32 + (string_len*4) ... etc
        // It's safer to check if it's there. Usually offset is 82 + name len + symbol len + uri len
        // However, the account data usually ends with isMutable byte.
        const isMutable = info.data[info.data.length - 1] === 1;
        return { exists: true, isMutable };
    } catch (err) {
        return { exists: false, isMutable: true };
    }
}

async function getLPStatus(mintAddress) {
    try {
        // Discovery via DexScreener (More efficient than program scan)
        const dexRes = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`, { timeout: 3000 });
        const pairs = dexRes.data?.pairs || [];
        const raydiumPair = pairs.find(p => p.dexId === 'raydium');

        if (!raydiumPair) return { found: false, lpBurned: false, liquidity: 0 };

        const lpMint = raydiumPair.lpMint;
        if (!lpMint) return { found: true, lpBurned: false, liquidity: raydiumPair.liquidity?.usd || 0 };

        // Check LP burn on-chain
        const lpKey = new PublicKey(lpMint);
        const supplyRes = await getConn().getTokenSupply(lpKey);
        const burnRes = await getConn().getTokenLargestAccounts(lpKey);

        const totalLP = Number(supplyRes.value.amount);
        const burnedLP = burnRes.value.find(acc => acc.address.toBase58() === '11111111111111111111111111111111');
        const burnedAmount = burnedLP ? Number(burnedLP.amount) : 0;

        const lpBurned = totalLP > 0 && (burnedAmount / totalLP) > 0.95;

        return {
            found: true,
            lpBurned,
            liquidity: raydiumPair.liquidity?.usd || 0,
            pairAddress: raydiumPair.pairAddress,
            lpMint
        };
    } catch (err) {
        logger.warn(`LP check failed for ${mintAddress}: ${err.message}`);
        return { found: false, lpBurned: false, liquidity: 0 };
    }
}

async function runRugCheck(mintAddress) {
    const start = Date.now();
    const pubkey = new PublicKey(mintAddress);

    let info;
    try {
        info = await getConn().getParsedAccountInfo(pubkey);
    } catch (err) {
        logger.error(`Failed to fetch mint info for ${mintAddress}: ${err.message}`);
        throw new Error(`RPC Error: ${err.message}`);
    }

    if (!info?.value?.data || typeof info.value.data !== "object" || !("parsed" in info.value.data)) {
        throw new Error("Not a valid SPL token mint address");
    }

    const parsed = info.value.data.parsed;
    const programId = info.value.owner.toBase58();
    const isToken2022 = programId === TOKEN_2022_PROGRAM_ID.toBase58();

    const {
        mintAuthority,
        freezeAuthority,
        supply,
        decimals,
        extensions = []
    } = parsed.info;

    const rawSupply = Number(supply || 0);
    const humanSupply = rawSupply / Math.pow(10, decimals || 0);

    // Parallel checks for efficiency
    let metadata, lpStatus, largestAccounts;
    try {
        const results = await Promise.allSettled([
            getMetadataStatus(mintAddress),
            getLPStatus(mintAddress),
            getConn().getTokenLargestAccounts(pubkey)
        ]);

        metadata = results[0].status === 'fulfilled' ? results[0].value : { exists: false, isMutable: true };
        lpStatus = results[1].status === 'fulfilled' ? results[1].value : { found: false, lpBurned: false, liquidity: 0 };
        largestAccounts = results[2].status === 'fulfilled' ? results[2].value : { value: [] };
    } catch (err) {
        logger.warn(`Parallel checks partially failed for ${mintAddress}: ${err.message}`);
        metadata = { exists: false, isMutable: true };
        lpStatus = { found: false, lpBurned: false, liquidity: 0 };
        largestAccounts = { value: [] };
    }

    const topHolders = largestAccounts?.value || [];
    const top1Amount = topHolders[0] ? Number(topHolders[0].uiAmount || 0) : 0;
    const top5Amount = topHolders.slice(0, 5).reduce((sum, h) => sum + Number(h.uiAmount || 0), 0);
    const top1Pct = humanSupply > 0 ? (top1Amount / humanSupply) * 100 : 0;
    const top5Pct = humanSupply > 0 ? (top5Amount / humanSupply) * 100 : 0;

    // Token-2022 Loophole Detection
    const permanentDelegateExt = extensions.find(e => e.extension === 'permanentDelegate');
    const transferFeeExt = extensions.find(e => e.extension === 'transferFeeConfig');
    const defaultAccountStateExt = extensions.find(e => e.extension === 'defaultAccountState');

    const flags = {
        mintAuthorityActive: Boolean(mintAuthority),
        freezeAuthorityActive: Boolean(freezeAuthority),
        isMutable: metadata.isMutable,
        lpNotBurned: lpStatus.found && !lpStatus.lpBurned,
        top1HolderOver50pct: top1Pct > 50,
        top5HoldersOver80pct: top5Pct > 80,
        tradingHaltRisk: Boolean(permanentDelegateExt) || (defaultAccountStateExt?.state === 'Frozen'),
        supplyAnomaly: humanSupply > 1e15,
        noMetadata: !metadata.exists
    };

    const riskScore = scoreRisk(flags);
    const risk = riskLabel(riskScore);

    const checks = [
        {
            id: "lpStatus",
            label: "Liquidity Pool",
            status: lpStatus.found ? (lpStatus.lpBurned ? "SAFE" : "DANGER") : "WARN",
            detail: lpStatus.found
                ? (lpStatus.lpBurned ? `Burned/Locked — $${Math.round(lpStatus.liquidity).toLocaleString()} liquidity` : `UNLOCKED — dev can pull $${Math.round(lpStatus.liquidity).toLocaleString()}`)
                : "Market not found — liquidity unknown",
        },
        {
            id: "mintAuthority",
            label: "Mint Authority",
            status: flags.mintAuthorityActive ? "DANGER" : "SAFE",
            detail: flags.mintAuthorityActive ? "Active — dev can print more tokens" : "Renounced — supply is fixed",
        },
        {
            id: "metadata",
            label: "Metadata Status",
            status: flags.isMutable ? "WARN" : "SAFE",
            detail: flags.isMutable ? "Mutable — dev can change name/icon to mimic other tokens" : "Immutable — identity is locked",
        },
        {
            id: "tokenStandard",
            label: "Token Standard",
            status: flags.tradingHaltRisk ? "DANGER" : "SAFE",
            detail: isToken2022
                ? (flags.tradingHaltRisk ? "Token-2022: Permanent Delegate found (CRITICAL)" : "Token-2022: Standard configuration")
                : "Standard SPL",
        },
        {
            id: "concentration",
            label: "Whale Analysis",
            status: flags.top1HolderOver50pct ? "DANGER" : flags.top5HoldersOver80pct ? "WARN" : "SAFE",
            detail: topHolders.length > 0
                ? `Top 1 holds ${top1Pct.toFixed(1)}% | Top 5 hold ${top5Pct.toFixed(1)}%`
                : "Could not fetch holder data (RPC limit)",
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
