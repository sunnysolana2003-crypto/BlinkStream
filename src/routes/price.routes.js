const express = require("express");
const { getPrice, getSupportedTokens } = require("../services/price.service");

const router = express.Router();

router.get("/supported", async (req, res, next) => {
  try {
    const requestedLimit = Number(req.query.limit || 100);
    const limit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 100, 500));
    const tokens = await getSupportedTokens();
    return res.json({ tokens: tokens.slice(0, limit) });
  } catch (error) {
    return next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const token = String(req.query.token || "SOL").trim();
    const payload = await getPrice(token);
    return res.json(payload);
  } catch (error) {
    if (error?.statusCode === 400) {
      return res.status(400).json({ error: error.message });
    }

    return next(error);
  }
});

module.exports = router;
