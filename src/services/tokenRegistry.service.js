const axios = require("axios");
const logger = require("../utils/logger");

const MINT_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const JUPITER_TOKEN_API = "https://tokens.jup.ag/token";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Well-known tokens for instant resolution without API calls
const WELL_KNOWN_TOKENS = new Map([
    ["So11111111111111111111111111111111111111112", { symbol: "SOL", name: "Solana" }],
    ["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", { symbol: "USDC", name: "USD Coin" }],
    ["Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", { symbol: "USDT", name: "Tether USD" }],
    ["DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", { symbol: "BONK", name: "Bonk" }],
    ["JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", { symbol: "JUP", name: "Jupiter" }],
    ["HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3", { symbol: "PYTH", name: "Pyth Network" }],
    ["4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", { symbol: "RAY", name: "Raydium" }],
    ["mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So", { symbol: "mSOL", name: "Marinade Staked SOL" }],
    ["7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs", { symbol: "ETH", name: "Ether (Wormhole)" }],
    ["orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE", { symbol: "ORCA", name: "Orca" }],
    ["RLBxxFkseAZ4RgJH3Sqn8jXxhmGoz9jWxDNJMh8pL7a", { symbol: "RLB", name: "Rollbit Coin" }],
    ["7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj", { symbol: "stSOL", name: "Lido Staked SOL" }],
    ["SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt", { symbol: "SRM", name: "Serum" }],
    ["MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5", { symbol: "MEW", name: "cat in a dogs world" }],
    ["WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p91oHk", { symbol: "WEN", name: "Wen" }],
]);

// Dynamic cache for tokens fetched from Jupiter API
const dynamicCache = new Map();

function isMintAddress(token) {
    return MINT_ADDRESS_REGEX.test(String(token || "").trim());
}

async function fetchTokenFromJupiter(mintAddress) {
    try {
        const response = await axios.get(`${JUPITER_TOKEN_API}/${mintAddress}`, {
            timeout: 5000
        });

        const data = response.data;
        if (data && data.symbol) {
            return {
                symbol: data.symbol,
                name: data.name || data.symbol
            };
        }

        return null;
    } catch (error) {
        logger.warn(`Jupiter token lookup failed for ${mintAddress}: ${error.message}`);
        return null;
    }
}

async function resolveToken(tokenOrMint) {
    const raw = String(tokenOrMint || "").trim();
    if (!raw) {
        return { token: raw, symbol: raw, name: raw, isMint: false };
    }

    // If it's not a mint address, return as-is (it's already a symbol)
    if (!isMintAddress(raw)) {
        return { token: raw, symbol: raw.toUpperCase(), name: raw.toUpperCase(), isMint: false };
    }

    // Check well-known tokens first
    const wellKnown = WELL_KNOWN_TOKENS.get(raw);
    if (wellKnown) {
        return { token: raw, symbol: wellKnown.symbol, name: wellKnown.name, isMint: true };
    }

    // Check dynamic cache
    const cached = dynamicCache.get(raw);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return { token: raw, symbol: cached.symbol, name: cached.name, isMint: true };
    }

    // Fetch from Jupiter
    const resolved = await fetchTokenFromJupiter(raw);
    if (resolved) {
        dynamicCache.set(raw, { ...resolved, fetchedAt: Date.now() });
        return { token: raw, symbol: resolved.symbol, name: resolved.name, isMint: true };
    }

    // Fallback: shortened address
    const shortened = `${raw.slice(0, 4)}...${raw.slice(-4)}`;
    return { token: raw, symbol: shortened, name: shortened, isMint: true };
}

function resolveTokenSync(tokenOrMint) {
    const raw = String(tokenOrMint || "").trim();
    if (!raw) {
        return raw;
    }

    if (!isMintAddress(raw)) {
        return raw.toUpperCase();
    }

    const wellKnown = WELL_KNOWN_TOKENS.get(raw);
    if (wellKnown) {
        return wellKnown.symbol;
    }

    const cached = dynamicCache.get(raw);
    if (cached) {
        return cached.symbol;
    }

    return `${raw.slice(0, 4)}...${raw.slice(-4)}`;
}

module.exports = {
    resolveToken,
    resolveTokenSync,
    isMintAddress
};
