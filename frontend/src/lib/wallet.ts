function safelyDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
}

function decodeRepeatedly(value: string, maxPasses = 3) {
  let decoded = value;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const next = safelyDecode(decoded);
    if (next === decoded) {
      break;
    }
    decoded = next;
  }
  return decoded;
}

function toActionProtocolUrl(url: string) {
  return `solana-action:${url}`;
}

function extractActionHttpUrl(actionUrl: string) {
  const normalized = String(actionUrl || "").trim();
  if (!normalized.startsWith("solana-action:")) {
    return "";
  }

  const value = normalized.slice("solana-action:".length);
  if (!value) {
    return "";
  }

  const decoded = decodeRepeatedly(value);
  if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
    return decoded;
  }

  return "";
}

function extractActionProtocolUrl(link: string) {
  const normalized = String(link || "").trim();
  if (!normalized) {
    return "";
  }

  if (normalized.startsWith("solana-action:")) {
    return normalized;
  }

  try {
    const parsed = new URL(normalized);
    const actionParam = parsed.searchParams.get("action");
    if (actionParam) {
      const decodedAction = decodeRepeatedly(actionParam);
      if (decodedAction.startsWith("solana-action:")) {
        return decodedAction;
      }

      if (decodedAction.startsWith("http://") || decodedAction.startsWith("https://")) {
        return toActionProtocolUrl(decodedAction);
      }
    }

    const isLikelyActionEndpoint =
      parsed.pathname.toLowerCase().includes("/api/blinks/action") ||
      parsed.pathname.toLowerCase().endsWith("/action");

    if (isLikelyActionEndpoint) {
      return toActionProtocolUrl(normalized);
    }

    return "";
  } catch (error) {
    return "";
  }
}

export function buildSolflareBrowseUrl(targetUrl: string) {
  const normalizedTargetUrl = String(targetUrl || "").trim();
  if (!normalizedTargetUrl) {
    return "";
  }

  const actionHttpUrl = extractActionHttpUrl(normalizedTargetUrl);
  const browseTarget = actionHttpUrl || normalizedTargetUrl;

  const ref =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "https://blinkstream.app";

  const encodedTargetUrl = encodeURIComponent(browseTarget);
  const encodedRef = encodeURIComponent(ref);
  return `https://solflare.com/ul/v1/browse/${encodedTargetUrl}?ref=${encodedRef}`;
}

export function getBlinkOpenUrl(blinkUrl: string) {
  const normalizedBlinkUrl = String(blinkUrl || "").trim();
  if (!normalizedBlinkUrl) {
    return "";
  }

  const actionProtocolUrl = extractActionProtocolUrl(normalizedBlinkUrl);
  const solflareBrowseUrl = buildSolflareBrowseUrl(normalizedBlinkUrl);

  // Prefer Solflare browse URL for both mobile and desktop flows.
  if (solflareBrowseUrl) {
    return solflareBrowseUrl;
  }

  if (actionProtocolUrl) {
    return actionProtocolUrl;
  }

  return normalizedBlinkUrl;
}

export function openBlinkInWallet(blinkUrl: string) {
  const target = getBlinkOpenUrl(blinkUrl);
  if (!target || typeof window === "undefined") {
    return false;
  }

  if (target.startsWith("solana-action:")) {
    window.location.assign(target);
    return true;
  }

  window.open(target, "_blank", "noopener,noreferrer");
  return true;
}
