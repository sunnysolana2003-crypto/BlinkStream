const { PublicKey } = require("@solana/web3.js");
const { TOKEN_PROGRAM_ID } = require("@solana/spl-token");
const { getConnection } = require("../config/rpc.config");
const { getPrice } = require("./price.service");
const { resolveToken } = require("./tokenRegistry.service");
const logger = require("../utils/logger");

async function getWalletPortfolio(address) {
    const start = Date.now();
    const connection = getConnection();
    const pubkey = new PublicKey(address);

    // 1. Fetch native SOL balance
    const solBalance = await connection.getBalance(pubkey);
    const solPriceData = await getPrice("SOL");

    // 2. Fetch all SPL token accounts
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(pubkey, {
        programId: TOKEN_PROGRAM_ID
    });

    const portfolio = [];

    // Add SOL to portfolio
    portfolio.push({
        mint: "So11111111111111111111111111111111111111112",
        symbol: "SOL",
        name: "Solana",
        balance: solBalance / 1e9,
        price: solPriceData?.price || 0,
        usdValue: (solBalance / 1e9) * (solPriceData?.price || 0),
        isNative: true
    });

    // 3. Process tokens with balances > 0
    const activeTokens = tokenAccounts.value.filter(
        (acc) => acc.account.data.parsed.info.tokenAmount.uiAmount > 0
    );

    // Resolve prices in parallel for tokens
    // We'll limit to top 15 tokens to avoid heavy RPC usage in one go
    const batch = activeTokens.slice(0, 15);

    const tokenPromises = batch.map(async (acc) => {
        const info = acc.account.data.parsed.info;
        const mint = info.mint;
        const balance = info.tokenAmount.uiAmount;

        try {
            // Resolve name/symbol
            const registry = await resolveToken(mint);
            const priceData = await getPrice(registry.symbol || mint);

            return {
                mint,
                symbol: registry.symbol || "Unknown",
                name: registry.name || "Unknown Token",
                balance,
                price: priceData?.price || 0,
                usdValue: balance * (priceData?.price || 0),
                isNative: false
            };
        } catch (err) {
            logger.warn(`Failed to resolve portfolio token ${mint}: ${err.message}`);
            return {
                mint,
                symbol: "UNK",
                name: "Unknown Token",
                balance,
                price: 0,
                usdValue: 0,
                isNative: false
            };
        }
    });

    const resolvedTokens = await Promise.all(tokenPromises);
    portfolio.push(...resolvedTokens);

    // Sort by USD value descending
    portfolio.sort((a, b) => b.usdValue - a.usdValue);

    const totalUsdValue = portfolio.reduce((sum, item) => sum + item.usdValue, 0);

    return {
        address,
        portfolio,
        totalUsdValue,
        latencyMs: Date.now() - start,
        timestamp: Date.now()
    };
}

module.exports = { getWalletPortfolio };
