const express = require("express");
const { ACTIONS_CORS_HEADERS } = require("@solana/actions");
const { PublicKey } = require("@solana/web3.js");
const {
  generateBlink,
  normalizeActionType,
  resolveBlinkTradeParams,
  storeBlinkForUser,
  getBlinksForUser
} = require("../services/blink.service");
const { getQuote, getSwapTransaction } = require("../services/jupiter.service");
const logger = require("../utils/logger");

const router = express.Router();
const PUBLIC_USER_ID = process.env.PUBLIC_USER_ID || "public-user";

function setActionCorsHeaders(res) {
  res.set(ACTIONS_CORS_HEADERS);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function getRequestBaseUrl(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const forwardedHost = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const protocol = forwardedProto || req.protocol || "http";
  const host = forwardedHost || req.get("host") || "";

  if (!host) {
    return "";
  }

  return `${protocol}://${host}`;
}

function buildBlinkWrapperUrl(actionUrl) {
  if (!actionUrl || !actionUrl.startsWith("https://")) {
    return "";
  }

  const wrapperUrl = String(process.env.BLINK_WRAPPER_URL || "https://dial.to").trim();
  if (!wrapperUrl) {
    return "";
  }

  try {
    const wrapper = new URL(wrapperUrl);
    wrapper.searchParams.set("action", `solana-action:${encodeURIComponent(actionUrl)}`);
    return wrapper.toString();
  } catch (error) {
    logger.warn("Invalid BLINK_WRAPPER_URL for human page:", error.message);
    return "";
  }
}

function shouldRenderHumanHtml(req) {
  const format = String(req.query.format || "").toLowerCase();
  if (format === "json") {
    return false;
  }

  const accept = String(req.headers.accept || "").toLowerCase();
  const hasActionNegotiationHeader = Boolean(
    req.headers["x-accept-action-version"] ||
    req.headers["x-accept-blockchain-ids"] ||
    req.headers["x-action-version"]
  );

  return accept.includes("text/html") && !hasActionNegotiationHeader;
}

function buildHumanActionPage({ trade, actionUrl, dialLink }) {
  const actionLabel = `${trade.actionType} ${trade.token}`;
  const safeActionUrl = escapeHtml(actionUrl);
  const safeDialLink = escapeHtml(dialLink);
  const canUseDial = Boolean(dialLink);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>BlinkStream Action</title>
  <style>
    body { margin: 0; font-family: ui-sans-serif, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background: #0b1020; color: #eaf2ff; }
    .wrap { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    .card { width: min(720px, 100%); background: #111833; border: 1px solid #24305f; border-radius: 16px; padding: 24px; }
    h1 { margin: 0 0 8px; font-size: 24px; }
    p { margin: 0 0 16px; color: #c2d3ff; line-height: 1.5; }
    .meta { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px; margin-bottom: 16px; }
    .item { background: #0b1329; border: 1px solid #1b2a55; border-radius: 10px; padding: 10px; }
    .label { font-size: 12px; color: #8da9e8; }
    .value { font-size: 14px; margin-top: 4px; word-break: break-word; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
    .btn { appearance: none; border: 1px solid #2f4aa3; background: #1a2f70; color: #ffffff; border-radius: 10px; padding: 10px 14px; font-weight: 600; text-decoration: none; display: inline-block; }
    .btn.secondary { background: #121d3f; border-color: #30437f; }
    .hint { margin-top: 14px; font-size: 12px; color: #8da9e8; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; background: #0a1227; padding: 2px 4px; border-radius: 4px; }
  </style>
</head>
<body>
  <main class="wrap">
    <section class="card">
      <h1>BlinkStream Action Ready</h1>
      <p>This is a human-friendly preview page. Wallet and Blink clients use the same endpoint as machine-readable JSON.</p>
      <div class="meta">
        <div class="item"><div class="label">Action</div><div class="value">${escapeHtml(actionLabel)}</div></div>
        <div class="item"><div class="label">Token</div><div class="value">${escapeHtml(trade.token)}</div></div>
        <div class="item"><div class="label">Input Mint</div><div class="value">${escapeHtml(trade.inputMint)}</div></div>
        <div class="item"><div class="label">Output Mint</div><div class="value">${escapeHtml(trade.outputMint)}</div></div>
      </div>
      <div class="actions">
        ${canUseDial
      ? `<a class="btn" href="${safeDialLink}" target="_blank" rel="noopener noreferrer">Open in Dial</a>`
      : ""
    }
        <a class="btn secondary" href="${safeActionUrl}?format=json" target="_blank" rel="noopener noreferrer">View JSON</a>
        <button class="btn secondary" onclick="navigator.clipboard.writeText('${safeActionUrl}')">Copy Action URL</button>
      </div>
      <div class="hint">Tip: JSON is expected for Action clients. This page is for humans opening links in a normal browser.</div>
      <div class="hint">Action endpoint: <code>${safeActionUrl}</code></div>
    </section>
  </main>
</body>
</html>`;
}

function validateBlinkPayload(req, res, next) {
  const { token = "SOL", amount, actionType = "swap" } = req.body || {};

  if (typeof token !== "string" || !token.trim()) {
    return res.status(400).json({ error: "Token must be a non-empty string" });
  }

  try {
    normalizeActionType(actionType);
  } catch (error) {
    return res.status(400).json({ error: "Invalid actionType. Allowed: buy, sell, swap, mint, donate" });
  }

  if (amount !== undefined) {
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "Amount must be a positive number" });
    }
  }

  return next();
}

async function handleGenerate(req, res, next) {
  try {
    const { token = "SOL", actionType = "swap", amount, userPublicKey } = req.body || {};
    const baseUrl = getRequestBaseUrl(req);

    const blink = await generateBlink({
      token: token.toUpperCase(),
      actionType,
      amount: Number(amount) || undefined,
      baseUrl,
      userPublicKey: typeof userPublicKey === "string" && userPublicKey.trim() ? userPublicKey.trim() : undefined
    });

    const persistence = await storeBlinkForUser({
      userId: PUBLIC_USER_ID,
      token: token.toUpperCase(),
      actionType,
      blink
    });

    return res.json({
      success: true,
      blink,
      blinkUrl: blink.blinkUrl,
      latency: blink.latency,
      record: persistence.blink || null
    });
  } catch (error) {
    return next(error);
  }
}

router.options("/action", (req, res) => {
  setActionCorsHeaders(res);
  return res.status(204).send();
});

router.get("/action", async (req, res, next) => {
  try {
    setActionCorsHeaders(res);
    const baseUrl = getRequestBaseUrl(req);
    const actionUrl = baseUrl ? `${baseUrl}${req.originalUrl}` : req.originalUrl;
    const actionHref = (() => {
      if (!baseUrl) {
        return req.originalUrl;
      }

      const url = new URL(req.originalUrl, `${baseUrl}/`);
      url.searchParams.delete("format");
      return url.toString();
    })();
    const trade = resolveBlinkTradeParams({
      token: req.query.token,
      actionType: req.query.actionType,
      amount: req.query.amount,
      inputMint: req.query.inputMint,
      outputMint: req.query.outputMint,
      rawAmount: true
    });

    if (shouldRenderHumanHtml(req)) {
      const dialLink = buildBlinkWrapperUrl(actionUrl);

      res.type("html");
      return res.send(buildHumanActionPage({ trade, actionUrl, dialLink }));
    }

    const response = {
      icon: process.env.BLINK_ICON_URL || "https://solana.com/src/img/branding/solanaLogoMark.svg",
      title: "BlinkStream Action",
      description: `OrbitFlare-powered ${trade.actionType.toLowerCase()} on ${trade.token}`,
      label: `${trade.actionType} ${trade.token}`,
      links: {
        actions: [
          {
            type: "transaction",
            href: actionHref,
            label: `Execute ${trade.actionType}`
          }
        ]
      }
    };

    return res.json(response);
  } catch (error) {
    return next(error);
  }
});

router.post("/action", async (req, res, next) => {
  try {
    setActionCorsHeaders(res);
    const account = String(req.body?.account || "").trim();
    if (!account) {
      return res.status(400).json({ message: "Missing account in action request body" });
    }

    try {
      new PublicKey(account);
    } catch (error) {
      return res.status(400).json({ message: "Invalid account public key" });
    }

    const trade = resolveBlinkTradeParams({
      token: req.query.token,
      actionType: req.query.actionType,
      amount: req.query.amount,
      inputMint: req.query.inputMint,
      outputMint: req.query.outputMint,
      rawAmount: true
    });

    const quoteResult = await getQuote({
      inputMint: trade.inputMint,
      outputMint: trade.outputMint,
      amount: trade.amount
    });
    if (!quoteResult.success || !quoteResult.quote) {
      return res.status(502).json({
        message: `Quote failed: ${quoteResult.error || "Unavailable"}`
      });
    }

    const swapResult = await getSwapTransaction({
      quote: quoteResult.quote,
      quoteUrl: quoteResult.quoteUrl,
      userPublicKey: account
    });
    if (!swapResult.success || !swapResult.swapTransaction) {
      return res.status(502).json({
        message: `Swap transaction unavailable: ${swapResult.error || "Missing transaction"}`
      });
    }

    return res.json({
      type: "transaction",
      transaction: swapResult.swapTransaction,
      message: `${trade.actionType} ${trade.token} via BlinkStream`
    });
  } catch (error) {
    logger.error("Blink action POST failed:", error.message);
    return next(error);
  }
});

router.post("/", validateBlinkPayload, handleGenerate);
router.post("/generate", validateBlinkPayload, handleGenerate);

router.get("/", async (req, res, next) => {
  try {
    const limit = Number(req.query.limit || 50);
    const blinks = await getBlinksForUser(PUBLIC_USER_ID, limit);
    return res.json({ success: true, blinks });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
