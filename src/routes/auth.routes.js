const express = require("express");

const router = express.Router();

router.post("/register", async (req, res) => {
  return res.status(410).json({
    error: "Authentication is disabled for this deployment"
  });
});

router.post("/login", async (req, res, next) => {
  try {
    return res.status(410).json({
      error: "Authentication is disabled for this deployment"
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
