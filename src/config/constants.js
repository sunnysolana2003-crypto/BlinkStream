const DEMO_MODE = process.env.DEMO_MODE === "true";

const SOL_TOKEN = "SOL";
const SOL_PRICE_ID = "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM_ID = "TokenzQdBNbLqP5VEhdk8m6r6qT5iH4j9Jz7bcb8M9z";

const LARGE_SWAP_USD_THRESHOLD = Number(process.env.LARGE_SWAP_USD_THRESHOLD || 10000);
const SURGE_THRESHOLD_PERCENT = Number(process.env.SURGE_THRESHOLD_PERCENT || 3);
const SURGE_COOLDOWN_MS = Number(process.env.SURGE_COOLDOWN_MS || 30000);
const AUTONOMOUS_POLL_MS = Number(process.env.AUTONOMOUS_POLL_MS || 5000);
const STREAM_RECONNECT_MS = Number(process.env.STREAM_RECONNECT_MS || 3000);

const DEFAULT_INPUT_MINT = process.env.JUPITER_INPUT_MINT || "So11111111111111111111111111111111111111112";
const DEFAULT_OUTPUT_MINT = process.env.JUPITER_OUTPUT_MINT || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const DEFAULT_SWAP_AMOUNT = Number(process.env.DEFAULT_SWAP_AMOUNT || 100000000);

const DEMO_PAYLOAD = Object.freeze({
  type: "SURGE",
  token: SOL_TOKEN,
  changePercent: 3.2,
  usdValue: 12000,
  slot: 257382992,
  timestamp: 17123456789,
  blinkUrl: "https://blinkstream.local/demo-blink",
  latency: {
    quoteLatency: 14,
    simulationLatency: 20,
    blinkLatency: 4,
    total: 38
  }
});

module.exports = {
  DEMO_MODE,
  SOL_TOKEN,
  SOL_PRICE_ID,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  LARGE_SWAP_USD_THRESHOLD,
  SURGE_THRESHOLD_PERCENT,
  SURGE_COOLDOWN_MS,
  AUTONOMOUS_POLL_MS,
  STREAM_RECONNECT_MS,
  DEFAULT_INPUT_MINT,
  DEFAULT_OUTPUT_MINT,
  DEFAULT_SWAP_AMOUNT,
  DEMO_PAYLOAD
};
