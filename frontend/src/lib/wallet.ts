function safelyDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    return value;
  }
}

type WalletConnectResponse = {
  publicKey?: { toString: () => string } | string | null;
};

type InjectedWalletProvider = {
  connect?: (opts?: { onlyIfTrusted?: boolean }) => Promise<WalletConnectResponse>;
  publicKey?: { toString: () => string } | string | null;
  signAndSendTransaction?: (transaction: unknown, options?: Record<string, unknown>) => Promise<unknown>;
  isPhantom?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
};

type WalletWindow = Window & {
  phantom?: { solana?: InjectedWalletProvider };
  solflare?: InjectedWalletProvider;
  backpack?: { solana?: InjectedWalletProvider };
  solana?: InjectedWalletProvider;
};

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

function withFormatJson(actionUrl: string) {
  try {
    const url = new URL(actionUrl);
    if (!url.searchParams.has("format")) {
      url.searchParams.set("format", "json");
    }
    return url.toString();
  } catch (error) {
    return actionUrl;
  }
}

export function resolveBlinkActionUrl(blinkUrl: string) {
  const normalized = String(blinkUrl || "").trim();
  if (!normalized) {
    return "";
  }

  const fromActionProtocol = extractActionHttpUrl(normalized);
  if (fromActionProtocol) {
    return withFormatJson(fromActionProtocol);
  }

  try {
    const parsed = new URL(normalized);
    const actionParam = parsed.searchParams.get("action");
    if (actionParam) {
      const decoded = decodeRepeatedly(actionParam);
      const nestedActionHttp = extractActionHttpUrl(decoded);
      if (nestedActionHttp) {
        return withFormatJson(nestedActionHttp);
      }
      if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
        return withFormatJson(decoded);
      }
    }

    const isLikelyActionEndpoint =
      parsed.pathname.toLowerCase().includes("/api/blinks/action") ||
      parsed.pathname.toLowerCase().endsWith("/action");
    if (isLikelyActionEndpoint) {
      return withFormatJson(parsed.toString());
    }
  } catch (error) {
    return "";
  }

  return "";
}

function decodeBase64ToBytes(value: string) {
  const normalized = String(value || "")
    .trim()
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  if (!normalized) {
    throw new Error("Empty transaction payload");
  }

  const padLength = normalized.length % 4;
  const padded = padLength === 0 ? normalized : normalized + "=".repeat(4 - padLength);
  const binary = window.atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function getWalletCandidates(win: WalletWindow) {
  const raw = [
    { name: "Solflare", provider: win.solflare },
    { name: "Solflare", provider: win.solana?.isSolflare ? win.solana : undefined },
    { name: "Phantom", provider: win.phantom?.solana },
    { name: "Phantom", provider: win.solana?.isPhantom ? win.solana : undefined },
    { name: "Backpack", provider: win.backpack?.solana },
    { name: "Solana Wallet", provider: win.solana }
  ];

  const seen = new Set<InjectedWalletProvider>();
  const candidates: Array<{ name: string; provider: InjectedWalletProvider }> = [];

  for (const entry of raw) {
    if (!entry.provider || typeof entry.provider.connect !== "function") {
      continue;
    }
    if (seen.has(entry.provider)) {
      continue;
    }
    seen.add(entry.provider);
    candidates.push({ name: entry.name, provider: entry.provider });
  }

  return candidates;
}

function resolveConnectedAddress(provider: InjectedWalletProvider, response: WalletConnectResponse | null) {
  const responseKey = response?.publicKey;
  if (responseKey && typeof responseKey === "object" && typeof responseKey.toString === "function") {
    return responseKey.toString();
  }
  if (typeof responseKey === "string" && responseKey.trim()) {
    return responseKey.trim();
  }

  const providerKey = provider.publicKey;
  if (providerKey && typeof providerKey === "object" && typeof providerKey.toString === "function") {
    return providerKey.toString();
  }
  if (typeof providerKey === "string" && providerKey.trim()) {
    return providerKey.trim();
  }

  return "";
}

async function fetchActionTransaction(actionUrl: string, account: string) {
  const response = await window.fetch(actionUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json"
    },
    body: JSON.stringify({ account })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = String(payload?.message || payload?.error || "Action transaction request failed");
    throw new Error(message);
  }

  const transaction = String(payload?.transaction || "").trim();
  if (!transaction) {
    throw new Error("Action response missing transaction");
  }

  return transaction;
}

async function signAndSendSerializedTransaction(
  provider: InjectedWalletProvider,
  serializedTransactionBase64: string
) {
  if (typeof provider.signAndSendTransaction !== "function") {
    throw new Error("Wallet provider does not support signAndSendTransaction");
  }

  const { Transaction, VersionedTransaction } = await import("@solana/web3.js");
  const bytes = decodeBase64ToBytes(serializedTransactionBase64);
  let transaction;

  try {
    transaction = VersionedTransaction.deserialize(bytes);
  } catch (versionedError) {
    transaction = Transaction.from(bytes);
  }

  const response = await provider.signAndSendTransaction(transaction, {
    skipPreflight: false
  });

  if (typeof response === "string") {
    return response;
  }

  if (response && typeof (response as { signature?: unknown }).signature === "string") {
    return (response as { signature: string }).signature;
  }

  return "";
}

export async function executeBlinkWithExtension(blinkUrl: string) {
  if (typeof window === "undefined") {
    return { success: false, error: "window_unavailable" };
  }

  const actionUrl = resolveBlinkActionUrl(blinkUrl);
  if (!actionUrl) {
    return { success: false, error: "action_url_unresolved" };
  }

  const candidates = getWalletCandidates(window as WalletWindow);
  if (!candidates.length) {
    return { success: false, error: "wallet_provider_not_found" };
  }

  let lastError = "wallet_execution_failed";

  for (const candidate of candidates) {
    try {
      const response = await candidate.provider.connect?.({ onlyIfTrusted: false });
      const account = resolveConnectedAddress(candidate.provider, response || null);
      if (!account) {
        lastError = "wallet_address_unavailable";
        continue;
      }

      const serializedTx = await fetchActionTransaction(actionUrl, account);
      const signature = await signAndSendSerializedTransaction(candidate.provider, serializedTx);

      return {
        success: true,
        signature,
        account,
        wallet: candidate.name
      };
    } catch (error) {
      const code = (error as { code?: number })?.code;
      const message = String((error as { message?: string })?.message || "");

      if (code === 4001 || code === 4100 || /rejected|cancelled|canceled/i.test(message)) {
        lastError = `${candidate.name}_rejected`;
        continue;
      }

      if (code === -32002 || /already processing|pending/i.test(message)) {
        return { success: false, error: `${candidate.name}_pending_approval` };
      }

      lastError = message || `${candidate.name}_execution_failed`;
    }
  }

  return { success: false, error: lastError };
}

export function buildSolflareBrowseUrl(targetUrl: string) {
  const normalizedTargetUrl = String(targetUrl || "").trim();
  if (!normalizedTargetUrl) {
    return "";
  }

  const resolvedActionUrl = resolveBlinkActionUrl(normalizedTargetUrl);
  const actionHttpUrl = extractActionHttpUrl(normalizedTargetUrl);
  const browseTarget = resolvedActionUrl || actionHttpUrl || normalizedTargetUrl;

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
