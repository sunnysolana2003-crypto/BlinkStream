const { LARGE_SWAP_USD_THRESHOLD } = require("../config/constants");

function detectLargeSwap(parsedTx, solPrice) {
  if (!parsedTx || !Array.isArray(parsedTx.transfers) || !parsedTx.transfers.length) {
    return null;
  }

  for (const transfer of parsedTx.transfers) {
    const amountRaw = Number(transfer.amountRaw ?? transfer.amount);
    const decimals = Number(transfer.decimals ?? 9);

    if (!Number.isFinite(amountRaw) || amountRaw <= 0 || !Number.isFinite(decimals)) {
      continue;
    }

    const tokenAmount = amountRaw / Math.pow(10, decimals);
    const usdValue = tokenAmount * solPrice;

    if (usdValue >= LARGE_SWAP_USD_THRESHOLD) {
      return {
        signature: parsedTx.signature,
        slot: parsedTx.slot,
        usdValue: Number(usdValue.toFixed(2))
      };
    }
  }

  return null;
}

module.exports = { detectLargeSwap };
