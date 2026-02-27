const express = require("express");
const { PublicKey } = require("@solana/web3.js");
const { runRugCheck } = require("../services/rugCheck.service");
const logger = require("../utils/logger");

const router = express.Router();

function isValidPublicKey(value) {
    try {
        new PublicKey(String(value || "").trim());
        return true;
    } catch {
        return false;
    }
}

// GET /api/rug-check?mint=<address>
router.get("/", async (req, res, next) => {
    const mint = String(req.query.mint || "").trim();

    if (!mint) {
        return res.status(400).json({ error: "Missing 'mint' query parameter" });
    }

    if (!isValidPublicKey(mint)) {
        return res.status(400).json({ error: "Invalid Solana mint address" });
    }

    try {
        logger.info(`Rug check requested for mint: ${mint}`);
        const result = await runRugCheck(mint);
        return res.json(result);
    } catch (error) {
        logger.warn(`Rug check failed for ${mint}: ${error.message}`);
        return next(error);
    }
});

module.exports = router;
