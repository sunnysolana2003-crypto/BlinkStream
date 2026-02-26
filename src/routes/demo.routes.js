const express = require("express");
const { DEMO_MODE } = require("../config/constants");
const { triggerDemoEvent } = require("../jobs/autonomous.job");

const router = express.Router();

router.post("/trigger", async (req, res, next) => {
  try {
    if (!DEMO_MODE) {
      return res.status(403).json({ error: "DEMO_MODE is disabled" });
    }

    const event = await triggerDemoEvent();
    return res.json({ success: true, event });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
