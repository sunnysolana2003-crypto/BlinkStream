const {
    PublicKey,
    SystemProgram,
    TransactionMessage,
    VersionedTransaction,
} = require("@solana/web3.js");
const {
    getAssociatedTokenAddress,
    createTransferCheckedInstruction,
    getMint,
} = require("@solana/spl-token");
const { getConnection } = require("../config/rpc.config");
const logger = require("../utils/logger");

/**
 * Builds a direct SOL transfer VersionedTransaction (V0).
 * VersionedTransaction is required for Blink/dial.to wallet compatibility.
 * Legacy Transaction serialization causes "signing failed" in modern wallets.
 */
async function buildSolTransferTransaction(senderPubkey, receiverPubkey, lamports) {
    const conn = getConnection();
    const sender = new PublicKey(senderPubkey);
    const receiver = new PublicKey(receiverPubkey);

    const { blockhash } = await conn.getLatestBlockhash("confirmed");

    const message = new TransactionMessage({
        payerKey: sender,
        recentBlockhash: blockhash,
        instructions: [
            SystemProgram.transfer({
                fromPubkey: sender,
                toPubkey: receiver,
                lamports: Math.floor(lamports),
            }),
        ],
    }).compileToV0Message();

    const tx = new VersionedTransaction(message);
    // Wallet will add its signature before submitting
    const serialized = Buffer.from(tx.serialize()).toString("base64");
    return { transaction: serialized };
}

/**
 * Builds a direct SPL token transfer VersionedTransaction (V0).
 */
async function buildSplTransferTransaction(senderPubkey, receiverPubkey, mintAddress, amount) {
    const conn = getConnection();
    const sender = new PublicKey(senderPubkey);
    const receiver = new PublicKey(receiverPubkey);
    const mint = new PublicKey(mintAddress);

    const mintInfo = await getMint(conn, mint);
    const decimals = mintInfo.decimals;

    const senderAta = await getAssociatedTokenAddress(mint, sender);
    const receiverAta = await getAssociatedTokenAddress(mint, receiver);

    const { blockhash } = await conn.getLatestBlockhash("confirmed");

    const message = new TransactionMessage({
        payerKey: sender,
        recentBlockhash: blockhash,
        instructions: [
            createTransferCheckedInstruction(
                senderAta,
                mint,
                receiverAta,
                sender,
                BigInt(Math.floor(amount)),
                decimals
            ),
        ],
    }).compileToV0Message();

    const tx = new VersionedTransaction(message);
    const serialized = Buffer.from(tx.serialize()).toString("base64");
    return { transaction: serialized, decimals };
}

/**
 * Determines whether the given mint is native SOL.
 */
const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";
function isNativeSol(mintAddress) {
    return !mintAddress || mintAddress === NATIVE_SOL_MINT;
}

/**
 * Universal entry point for building a donate/mint transaction.
 * - For SOL → uses SystemProgram.transfer via VersionedTransaction
 * - For SPL → uses SPL createTransferChecked via VersionedTransaction
 */
async function buildDirectTransferTransaction({ senderPubkey, receiverPubkey, inputMint, amount }) {
    if (!senderPubkey || !receiverPubkey) {
        throw new Error("Both senderPubkey and receiverPubkey are required for a direct transfer.");
    }

    if (isNativeSol(inputMint)) {
        logger.info(`[Transfer] Building SOL V0 tx: ${amount} lamports → ${receiverPubkey}`);
        return buildSolTransferTransaction(senderPubkey, receiverPubkey, amount);
    }

    logger.info(`[Transfer] Building SPL V0 tx: ${amount} units of ${inputMint} → ${receiverPubkey}`);
    return buildSplTransferTransaction(senderPubkey, receiverPubkey, inputMint, amount);
}

module.exports = {
    buildDirectTransferTransaction,
    isNativeSol,
    NATIVE_SOL_MINT,
};
