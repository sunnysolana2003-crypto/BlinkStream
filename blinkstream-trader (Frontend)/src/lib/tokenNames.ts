import api from "./api";

const MINT_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// Well-known tokens for instant frontend resolution (no API call needed)
const WELL_KNOWN: Record<string, string> = {
    So11111111111111111111111111111111111111112: "SOL",
    EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
    Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
    DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: "BONK",
    JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: "JUP",
    HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3: "PYTH",
    "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": "RAY",
    mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: "mSOL",
    "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs": "ETH",
    orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE: "ORCA",
    MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5: "MEW",
};

// Dynamic cache populated from backend API
const resolvedCache: Record<string, string> = {};

// Pending fetches to avoid duplicate requests
const pendingFetches = new Set<string>();

export function isMintAddress(token: string): boolean {
    return MINT_ADDRESS_REGEX.test(String(token || "").trim());
}

export function getTokenDisplayName(token: string): string {
    if (!token) return "";
    if (!isMintAddress(token)) return token;

    // Check well-known first
    if (WELL_KNOWN[token]) return WELL_KNOWN[token];

    // Check dynamic cache
    if (resolvedCache[token]) return resolvedCache[token];

    // Return shortened address as fallback
    return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

export async function resolveTokenName(
    token: string,
    onResolved?: (token: string, symbol: string) => void
): Promise<string> {
    if (!token || !isMintAddress(token)) return token;

    // Check caches
    if (WELL_KNOWN[token]) return WELL_KNOWN[token];
    if (resolvedCache[token]) return resolvedCache[token];

    // Avoid duplicate fetches
    if (pendingFetches.has(token)) {
        return getTokenDisplayName(token);
    }

    pendingFetches.add(token);

    try {
        const response = await api.get(`/metrics/resolve-token?token=${encodeURIComponent(token)}`);
        const symbol = response.data?.symbol;

        if (symbol && symbol !== token) {
            resolvedCache[token] = symbol;
            onResolved?.(token, symbol);
            return symbol;
        }
    } catch {
        // Silently fail, use shortened address
    } finally {
        pendingFetches.delete(token);
    }

    return getTokenDisplayName(token);
}

/**
 * Given a list of tokens, build a display name map.
 * Returns a Record<rawToken, displayName>.
 */
export function buildDisplayNameMap(tokens: string[]): Record<string, string> {
    const map: Record<string, string> = {};
    for (const token of tokens) {
        map[token] = getTokenDisplayName(token);
    }
    return map;
}
