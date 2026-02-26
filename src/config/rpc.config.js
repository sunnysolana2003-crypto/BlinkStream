const { Connection } = require("@solana/web3.js");
const { HermesClient } = require("@pythnetwork/hermes-client");

let connectionInstance;
let hermesClientInstance;

function appendApiKey(url, apiKey) {
  const base = String(url || "").trim();
  if (!base) {
    return "";
  }

  if (!apiKey || base.includes("api_key=")) {
    return base;
  }

  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}api_key=${encodeURIComponent(apiKey)}`;
}

function buildRpcUrl() {
  const baseUrl = process.env.ORBITFLARE_RPC_URL || "";
  const apiKey = process.env.ORBITFLARE_API_KEY || "";

  if (!baseUrl) {
    throw new Error("ORBITFLARE_RPC_URL is required");
  }

  return appendApiKey(baseUrl, apiKey);
}

function buildWsUrl() {
  const apiKey = process.env.ORBITFLARE_API_KEY || "";
  const configured = String(process.env.ORBITFLARE_WS_URL || "").trim();
  if (configured) {
    return appendApiKey(configured, apiKey);
  }

  const rpcBase = String(process.env.ORBITFLARE_RPC_URL || "").trim();
  if (!rpcBase) {
    return "";
  }

  if (rpcBase.startsWith("https://")) {
    return appendApiKey(`wss://${rpcBase.slice("https://".length)}`, apiKey);
  }

  if (rpcBase.startsWith("http://")) {
    return appendApiKey(`ws://${rpcBase.slice("http://".length)}`, apiKey);
  }

  return "";
}

function getConnection() {
  if (!connectionInstance) {
    const wsEndpoint = buildWsUrl();
    connectionInstance = new Connection(buildRpcUrl(), {
      commitment: "confirmed",
      ...(wsEndpoint ? { wsEndpoint } : {})
    });
  }

  return connectionInstance;
}

function getHermesClient() {
  if (!hermesClientInstance) {
    if (!process.env.PYTH_HERMES_URL) {
      throw new Error("PYTH_HERMES_URL is required");
    }

    hermesClientInstance = new HermesClient(process.env.PYTH_HERMES_URL);
  }

  return hermesClientInstance;
}

module.exports = { getConnection, getHermesClient };
