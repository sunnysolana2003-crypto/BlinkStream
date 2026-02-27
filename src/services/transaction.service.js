const {
    Connection,
    PublicKey,
    SystemProgram,
    Transaction,
    LAMPORTS_PER_SOL,
} = require("@solana/web3.js");
const {
    getAssociatedTokenAddress,
    createTransferCheckedInstruction,
    getMint,
} = require("@solana/spl-token");
const { getConnection } = require("../config/rpc.config");
const logger = require("../utils/logger");

/**
 * Builds a direct SOL transfer transaction.
 * Used for DONATE action when the inputMint is native SOL.
 * @param {string} senderPubkey - The wallet that will sign and pay.
 * @param {string} receiverPubkey - The destination wallet to receive SOL.
 * @param {number} lamports - Amount in lamports (1 SOL = 1e9 lamports).
 */
async function buildSolTransferTransaction(senderPubkey, receiverPubkey, lamports) {
    const conn = getConnection();
    const sender = new PublicKey(senderPubkey);
    const receiver = new PublicKey(receiverPubkey);

    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");

    const tx = new Transaction({
        recentBlockhash: blockhash,
        feePayer: sender,
    }).add(
        SystemProgram.transfer({
            fromPubkey: sender,
            toPubkey: receiver,
            lamports: Math.floor(lamports),
        })
    );

    // Serialize without requiring signing so that wallet can sign client-side
    const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    return {
        transaction: serialized.toString("base64"),
        lastValidBlockHeight,
        blockhash,
    };
}

/**
 * Builds a direct SPL token transfer transaction.
 * Used for DONATE action when the inputMint is an SPL token (e.g. USDC).
 * @param {string} senderPubkey
 * @param {string} receiverPubkey
 * @param {string} mintAddress - The SPL token mint.
 * @param {number} amount - Token amount in base units (respects decimals).
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

    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");

    const tx = new Transaction({
        recentBlockhash: blockhash,
        feePayer: sender,
    }).add(
        createTransferCheckedInstruction(
            senderAta,
            mint,
            receiverAta,
            sender,
            BigInt(Math.floor(amount)),
            decimals
        )
    );

    const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    return {
        transaction: serialized.toString("base64"),
        lastValidBlockHeight,
        blockhash,
        decimals,
    };
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
 * - For SOL → uses SystemProgram.transfer
 * - For SPL → uses SPL createTransferChecked
 *
 * @param {object} params
 * @param {string} params.senderPubkey - User's wallet address.
 * @param {string} params.receiverPubkey - Target wallet (project, creator, treasury).
 * @param {string} params.inputMint - The token being sent.
 * @param {number} params.amount - Raw amount in base units (lamports for SOL, token units for SPL).
 */
async function buildDirectTransferTransaction({ senderPubkey, receiverPubkey, inputMint, amount }) {
    if (!senderPubkey || !receiverPubkey) {
        throw new Error("Both senderPubkey and receiverPubkey are required for a direct transfer.");
    }

    if (isNativeSol(inputMint)) {
        logger.info(`[Transfer] Building SOL transfer: ${amount} lamports → ${receiverPubkey}`);
        return buildSolTransferTransaction(senderPubkey, receiverPubkey, amount);
    }

    logger.info(`[Transfer] Building SPL transfer: ${amount} units of ${inputMint} → ${receiverPubkey}`);
    return buildSplTransferTransaction(senderPubkey, receiverPubkey, inputMint, amount);
}

module.exports = {
    buildDirectTransferTransaction,
    isNativeSol,
    NATIVE_SOL_MINT,
};
