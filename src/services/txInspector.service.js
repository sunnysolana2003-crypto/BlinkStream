const { getConnection } = require("../config/rpc.config");
const { resolveToken } = require("./tokenRegistry.service");
const logger = require("../utils/logger");

async function inspectTransaction(signature) {
    const start = Date.now();
    const connection = getConnection();

    try {
        const tx = await connection.getParsedTransaction(signature, {
            maxSupportedTransactionVersion: 0,
            commitment: "confirmed"
        });

        if (!tx) {
            throw new Error("Transaction not found");
        }

        const { meta, transaction } = tx;
        const { message } = transaction;

        // Extract basic info
        const slot = tx.slot;
        const blockTime = tx.blockTime;
        const fee = meta.fee / 1e9;
        const status = meta.err ? "FAILED" : "SUCCESS";

        // Extract instructions to find the "primary" action (e.g. Swap)
        const instructions = message.instructions;
        const logMessages = meta.logMessages || [];

        // Simple heuristic for platform detection
        let platform = "Solana";
        if (logMessages.some(l => l.includes("Jupiter"))) platform = "Jupiter";
        else if (logMessages.some(l => l.includes("Raydium"))) platform = "Raydium";
        else if (logMessages.some(l => l.includes("Orca"))) platform = "Orca";
        else if (logMessages.some(l => l.includes("Pump.fun"))) platform = "Pump.fun";

        // Extract inner instructions for token balances
        const preBalances = meta.preTokenBalances || [];
        const postBalances = meta.postTokenBalances || [];

        const changes = [];

        // Map account owner to symbol if possible
        // For now we'll just look at balance deltas
        const balanceDeltas = new Map();

        preBalances.forEach(p => {
            const key = `${p.accountIndex}_${p.mint}`;
            balanceDeltas.set(key, { pre: p.uiTokenAmount.uiAmount, post: 0, mint: p.mint, owner: p.owner });
        });

        postBalances.forEach(p => {
            const key = `${p.accountIndex}_${p.mint}`;
            const entry = balanceDeltas.get(key) || { pre: 0, post: 0, mint: p.mint, owner: p.owner };
            entry.post = p.uiTokenAmount.uiAmount;
            balanceDeltas.set(key, entry);
        });

        for (const [key, delta] of balanceDeltas) {
            const diff = delta.post - delta.pre;
            if (Math.abs(diff) > 0.00000001) {
                const registry = await resolveToken(delta.mint).catch(() => ({ symbol: "Unknown" }));
                changes.push({
                    mint: delta.mint,
                    symbol: registry.symbol || "Unknown",
                    owner: delta.owner,
                    amount: diff,
                    type: diff > 0 ? "RECEIVED" : "SENT"
                });
            }
        }

        return {
            signature,
            slot,
            timestamp: blockTime * 1000,
            fee,
            status,
            platform,
            changes,
            latencyMs: Date.now() - start
        };
    } catch (err) {
        logger.error(`Error inspecting transaction ${signature}: ${err.message}`);
        throw err;
    }
}

module.exports = { inspectTransaction };
