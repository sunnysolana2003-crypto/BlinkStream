/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import axios from "axios";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { TradingPanel } from "./components/TradingPanel";
import { EventStream } from "./components/EventStream";
import { Particles } from "./components/Particles";
import { SurgeAlert, SurgeAlertProps } from "./components/SurgeAlert";
import { JudgeBriefing } from "./components/JudgeBriefing";
import { OrbitflareExplorer } from "./components/OrbitflareExplorer";
import { RugCheck } from "./components/RugCheck";
import api from "./lib/api";
import socket from "./lib/socket";
import { getTokenDisplayName, resolveTokenName, isMintAddress } from "./lib/tokenNames";
import {
  BackendEvent,
  BlinkLatency,
  GenerateBlinkInput,
  MetricsPayload,
  OrbitflareUsagePayload
} from "./types/backend";

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 300, damping: 24 }
  }
};

const ZERO_LATENCY: BlinkLatency = {
  quoteLatency: 0,
  simulationLatency: 0,
  blinkLatency: 0,
  total: 0
};
const MAX_PRICE_HISTORY_POINTS = 3600;
const MINT_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type WalletConnectResponse = {
  publicKey?: { toString: () => string } | string | null;
};

type GenericWalletProvider = {
  connect?: (opts?: { onlyIfTrusted?: boolean }) => Promise<WalletConnectResponse>;
  publicKey?: { toString: () => string } | string | null;
  isPhantom?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
};

type WalletWindow = Window & {
  phantom?: { solana?: GenericWalletProvider };
  solflare?: GenericWalletProvider;
  backpack?: { solana?: GenericWalletProvider };
  solana?: GenericWalletProvider;
};

function extractWalletAddress(provider: GenericWalletProvider, response: WalletConnectResponse | null) {
  const responseKey = response?.publicKey;
  if (responseKey && typeof responseKey === "object" && typeof responseKey.toString === "function") {
    return responseKey.toString();
  }
  if (typeof responseKey === "string" && responseKey.trim()) {
    return responseKey.trim();
  }

  const providerKey = provider?.publicKey;
  if (providerKey && typeof providerKey === "object" && typeof providerKey.toString === "function") {
    return providerKey.toString();
  }
  if (typeof providerKey === "string" && providerKey.trim()) {
    return providerKey.trim();
  }

  return "";
}

function getWalletProviderCandidates(win: WalletWindow) {
  const byPreference: Array<{ name: string; provider: GenericWalletProvider | undefined }> = [
    // Solflare-first to avoid Phantom-first dead-ends when user expects Solflare popup.
    { name: "Solflare", provider: win.solflare },
    { name: "Solflare", provider: win.solana?.isSolflare ? win.solana : undefined },
    { name: "Phantom", provider: win.phantom?.solana },
    { name: "Phantom", provider: win.solana?.isPhantom ? win.solana : undefined },
    { name: "Backpack", provider: win.backpack?.solana },
    { name: "Solana Wallet", provider: win.solana }
  ];

  const seen = new Set<GenericWalletProvider>();
  const candidates: Array<{ name: string; provider: GenericWalletProvider }> = [];

  for (const candidate of byPreference) {
    if (!candidate.provider || typeof candidate.provider.connect !== "function") {
      continue;
    }

    if (seen.has(candidate.provider)) {
      continue;
    }

    seen.add(candidate.provider);
    candidates.push({ name: candidate.name, provider: candidate.provider });
  }

  return candidates;
}

async function connectProvider(provider: GenericWalletProvider) {
  if (typeof provider.connect !== "function") {
    return null;
  }

  try {
    return await provider.connect();
  } catch (error) {
    const message = String((error as { message?: string })?.message || "");
    // Some providers accept options-only signatures; retry once with explicit options.
    if (/argument|options|onlyiftrusted/i.test(message)) {
      return provider.connect({ onlyIfTrusted: false });
    }
    throw error;
  }
}

function normalizeUserTokenInput(value: string) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }

  if (MINT_ADDRESS_REGEX.test(raw)) {
    return raw;
  }

  return raw.toUpperCase();
}

function normalizeLatency(payload: unknown): BlinkLatency {
  const source = typeof payload === "object" && payload ? (payload as Record<string, unknown>) : {};

  return {
    quoteLatency: Number(source.quoteLatency || 0),
    simulationLatency: Number(source.simulationLatency || 0),
    blinkLatency: Number(source.blinkLatency || 0),
    total: Number(source.total || 0)
  };
}

function normalizeEvent(payload: unknown): BackendEvent {
  const source = typeof payload === "object" && payload ? (payload as Record<string, unknown>) : {};
  const rawType = String(source.type || "SURGE").toUpperCase();
  const type: BackendEvent["type"] = rawType === "LARGE_SWAP" ? "LARGE_SWAP" : "SURGE";
  const blinkPayload = typeof source.blink === "object" && source.blink ? (source.blink as Record<string, unknown>) : {};

  return {
    type,
    token: String(source.token || "SOL"),
    changePercent: Number(source.changePercent || 0),
    usdValue: Number(source.usdValue || 0),
    blink: {
      blinkUrl: String(blinkPayload.blinkUrl || ""),
      latency: normalizeLatency(blinkPayload.latency)
    },
    slot: Number(source.slot || 0),
    timestamp: Number(source.timestamp || Date.now())
  };
}

function normalizeMetrics(payload: unknown): MetricsPayload {
  const source = typeof payload === "object" && payload ? (payload as Record<string, unknown>) : {};

  return {
    rpcLatency: source.rpcLatency === null || source.rpcLatency === undefined ? null : Number(source.rpcLatency),
    slot: source.slot === null || source.slot === undefined ? null : Number(source.slot),
    network: String(source.network || "mainnet-beta")
  };
}

interface SurgeSettingsState {
  thresholdPercent: number;
  cooldownMs: number;
}

function normalizeSurgeSettings(payload: unknown): SurgeSettingsState {
  const source = typeof payload === "object" && payload ? (payload as Record<string, unknown>) : {};
  const threshold = Number(source.thresholdPercent);
  const cooldown = Number(source.cooldownMs);

  return {
    thresholdPercent: Number.isFinite(threshold) ? threshold : 3,
    cooldownMs: Number.isFinite(cooldown) ? cooldown : 30000
  };
}

export default function App() {
  const [surge, setSurge] = useState<Omit<SurgeAlertProps, "onClose"> | null>(null);
  const [events, setEvents] = useState<BackendEvent[]>([]);

  const [selectedToken, setSelectedToken] = useState("SOL");
  const [supportedTokens, setSupportedTokens] = useState<string[]>(["SOL"]);
  const [price, setPrice] = useState(0);
  const [priceHistoryByToken, setPriceHistoryByToken] = useState<Record<string, Array<{ timestamp: number; price: number }>>>({});
  const [metrics, setMetrics] = useState<MetricsPayload>({
    rpcLatency: null,
    slot: null,
    network: "mainnet-beta"
  });

  const [isDemoMode, setIsDemoMode] = useState(false);
  const [judgeMode, setJudgeMode] = useState(false);
  const [activeSection, setActiveSection] = useState("dashboard");
  const [healthSnapshot, setHealthSnapshot] = useState<Record<string, unknown> | null>(null);
  const [orbitflareUsage, setOrbitflareUsage] = useState<OrbitflareUsagePayload | null>(null);
  const [surgeThresholdInput, setSurgeThresholdInput] = useState("3");
  const [surgeCooldownInput, setSurgeCooldownInput] = useState("30000");
  const [savingSurgeSettings, setSavingSurgeSettings] = useState(false);
  const [surgeSettingsSaved, setSurgeSettingsSaved] = useState(false);
  const [runningOrbitflareProbe, setRunningOrbitflareProbe] = useState(false);
  const [addingWatchToken, setAddingWatchToken] = useState(false);
  const [watchTokenSaved, setWatchTokenSaved] = useState<string | null>(null);
  const [tokenDisplayNames, setTokenDisplayNames] = useState<Record<string, string>>({});
  const [connectedWallet, setConnectedWallet] = useState<string | null>(null);

  const [blinkUrl, setBlinkUrl] = useState("");
  const [blinkLatency, setBlinkLatency] = useState<BlinkLatency | null>(null);
  const [generatingBlink, setGeneratingBlink] = useState(false);

  const [glitchError, setGlitchError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);

  const showGlitchError = useCallback((message: string) => {
    setGlitchError(message);
    window.setTimeout(() => {
      setGlitchError(null);
    }, 2500);
  }, []);

  const showRateLimitToast = useCallback(() => {
    setRateLimited(true);
    window.setTimeout(() => {
      setRateLimited(false);
    }, 2500);
  }, []);

  const handleApiError = useCallback(
    (error: unknown) => {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;

        if (status === 429) {
          showRateLimitToast();
        }

        const responseData = error.response?.data as { error?: string } | undefined;
        showGlitchError(responseData?.error || error.message || "Request failed");
        return;
      }

      showGlitchError("Unexpected client error");
    },
    [showGlitchError, showRateLimitToast]
  );

  const addEventToFeed = useCallback((payload: unknown) => {
    const normalizedEvent = normalizeEvent(payload);

    setEvents((previous) => [normalizedEvent, ...previous.slice(0, 99)]);

    return normalizedEvent;
  }, []);

  const triggerSurgeAlert = useCallback((event: BackendEvent) => {
    setSurge({
      token: event.token,
      percentChange: event.changePercent,
      latency: event.blink.latency,
      blinkUrl: event.blink.blinkUrl,
      usdValue: event.usdValue
    });

    if (event.blink.blinkUrl) {
      setBlinkUrl(event.blink.blinkUrl);
      setBlinkLatency(event.blink.latency);
    }
  }, []);

  useEffect(() => {
    if (!socket.connected) {
      socket.connect();
    }

    const handleSurge = (payload: unknown) => {
      const event = addEventToFeed(payload);
      triggerSurgeAlert(event);
    };

    const handleLargeSwap = (payload: unknown) => {
      addEventToFeed(payload);
    };

    socket.on("surge", handleSurge);
    socket.on("large-swap", handleLargeSwap);

    return () => {
      socket.off("surge", handleSurge);
      socket.off("large-swap", handleLargeSwap);
    };
  }, [addEventToFeed, triggerSurgeAlert]);

  useEffect(() => {
    let cancelled = false;

    const fetchMetrics = async () => {
      try {
        const response = await api.get("/metrics");
        if (!cancelled) {
          setMetrics(normalizeMetrics(response.data));
        }
      } catch (error) {
        handleApiError(error);
      }
    };

    void fetchMetrics();
    const interval = window.setInterval(fetchMetrics, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [handleApiError]);

  useEffect(() => {
    let cancelled = false;

    const fetchSupportedTokens = async () => {
      try {
        const response = await api.get("/price/supported?limit=120");
        const tokens = Array.isArray(response.data?.tokens)
          ? response.data.tokens
            .map((token: unknown) => normalizeUserTokenInput(String(token || "")))
            .filter(Boolean)
          : [];

        if (!cancelled && tokens.length) {
          setSupportedTokens(tokens);
          setSelectedToken((current) => (tokens.includes(current) ? current : tokens[0]));
        }
      } catch (error) {
        handleApiError(error);
      }
    };

    void fetchSupportedTokens();

    return () => {
      cancelled = true;
    };
  }, [handleApiError]);

  useEffect(() => {
    let cancelled = false;

    const fetchPrice = async () => {
      try {
        const response = await api.get(`/price?token=${encodeURIComponent(selectedToken)}`);
        if (!cancelled) {
          const nextPrice = Number(response.data?.price || 0);
          setPrice(nextPrice);

          if (Number.isFinite(nextPrice) && nextPrice > 0) {
            const timestamp = Date.now();
            const tokenKey = selectedToken;

            setPriceHistoryByToken((previous) => {
              const existing = previous[tokenKey] || [];
              const nextHistory = [...existing, { timestamp, price: nextPrice }].slice(-MAX_PRICE_HISTORY_POINTS);

              return {
                ...previous,
                [tokenKey]: nextHistory
              };
            });
          }
        }
      } catch (error) {
        handleApiError(error);
      }
    };

    void fetchPrice();
    const interval = window.setInterval(fetchPrice, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [handleApiError, selectedToken]);

  const refreshHealth = useCallback(async () => {
    try {
      const response = await api.get("/health");
      setIsDemoMode(response.data?.mode === "demo");
      setHealthSnapshot(
        typeof response.data === "object" && response.data ? (response.data as Record<string, unknown>) : null
      );
    } catch (error) {
      handleApiError(error);
    }
  }, [handleApiError]);

  const refreshSurgeSettings = useCallback(async () => {
    try {
      const response = await api.get("/metrics/surge-settings");
      const settings = normalizeSurgeSettings(response.data);
      setSurgeThresholdInput(String(settings.thresholdPercent));
      setSurgeCooldownInput(String(settings.cooldownMs));
    } catch (error) {
      handleApiError(error);
    }
  }, [handleApiError]);

  const refreshOrbitflareUsage = useCallback(async () => {
    try {
      const response = await api.get("/metrics/orbitflare/usage");
      if (typeof response.data === "object" && response.data) {
        setOrbitflareUsage(response.data as OrbitflareUsagePayload);
      }
    } catch (error) {
      handleApiError(error);
    }
  }, [handleApiError]);

  const refreshAutonomousTokens = useCallback(async () => {
    try {
      const response = await api.get("/metrics/autonomous-tokens");
      const tokens = Array.isArray(response.data?.tokens)
        ? response.data.tokens
          .map((token: unknown) => normalizeUserTokenInput(String(token || "")))
          .filter(Boolean)
        : [];

      if (!tokens.length) {
        return;
      }

      setSupportedTokens((previous) => {
        const merged = [...previous];
        for (const token of tokens) {
          if (!merged.includes(token)) {
            merged.push(token);
          }
        }
        return merged;
      });
    } catch (error) {
      handleApiError(error);
    }
  }, [handleApiError]);

  const registerAutonomousToken = useCallback(
    async (rawToken: string) => {
      const token = normalizeUserTokenInput(rawToken);
      if (!token) {
        showGlitchError("Enter a token symbol or mint address");
        return;
      }

      if (supportedTokens.includes(token)) {
        setSelectedToken(token);
        setWatchTokenSaved(token);
        window.setTimeout(() => {
          setWatchTokenSaved(null);
        }, 2200);
        return;
      }

      setAddingWatchToken(true);
      try {
        const response = await api.post("/metrics/autonomous-tokens", { token });
        const returnedTokens = Array.isArray(response.data?.tokens)
          ? response.data.tokens
            .map((value: unknown) => normalizeUserTokenInput(String(value || "")))
            .filter(Boolean)
          : [token];

        setSupportedTokens((previous) => {
          const merged = [...previous];
          for (const value of returnedTokens) {
            if (!merged.includes(value)) {
              merged.push(value);
            }
          }
          return merged;
        });
        setSelectedToken(token);
        setWatchTokenSaved(token);
        window.setTimeout(() => {
          setWatchTokenSaved(null);
        }, 2200);
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          showGlitchError("Backend restart required to enable custom watch-token endpoint");
          return;
        }
        handleApiError(error);
      } finally {
        setAddingWatchToken(false);
      }
    },
    [handleApiError, showGlitchError, supportedTokens]
  );

  useEffect(() => {
    void refreshHealth();
    const interval = window.setInterval(refreshHealth, 10000);

    return () => {
      window.clearInterval(interval);
    };
  }, [refreshHealth]);

  useEffect(() => {
    void refreshSurgeSettings();
  }, [refreshSurgeSettings]);

  useEffect(() => {
    void refreshOrbitflareUsage();
    const interval = window.setInterval(refreshOrbitflareUsage, 10000);

    return () => {
      window.clearInterval(interval);
    };
  }, [refreshOrbitflareUsage]);

  useEffect(() => {
    void refreshAutonomousTokens();
  }, [refreshAutonomousTokens]);

  // Resolve mint addresses to display names
  useEffect(() => {
    const mints = supportedTokens.filter((t) => isMintAddress(t) && !tokenDisplayNames[t]);
    for (const mint of mints) {
      void resolveTokenName(mint, (rawToken, symbol) => {
        setTokenDisplayNames((prev) => ({ ...prev, [rawToken]: symbol }));
      });
    }
  }, [supportedTokens, tokenDisplayNames]);

  const handleGenerateBlink = useCallback(
    async ({ token, actionType, amount }: GenerateBlinkInput) => {
      setGeneratingBlink(true);

      try {
        const payload: Record<string, unknown> = {
          token,
          actionType
        };

        if (amount !== undefined) {
          payload.amount = amount;
        }

        if (connectedWallet) {
          payload.userPublicKey = connectedWallet;
        }

        let response;

        try {
          response = await api.post("/blinks", payload);
        } catch (error) {
          if (axios.isAxiosError(error) && error.response?.status === 404) {
            response = await api.post("/blinks/generate", payload);
          } else {
            throw error;
          }
        }

        const blinkPayload = response.data?.blink || response.data;
        const nextBlinkUrl = String(blinkPayload?.blinkUrl || "");
        const nextBlinkLatency = normalizeLatency(blinkPayload?.latency || ZERO_LATENCY);

        setBlinkUrl(nextBlinkUrl);
        setBlinkLatency(nextBlinkLatency);
        return nextBlinkUrl || null;
      } catch (error) {
        handleApiError(error);
        return null;
      } finally {
        setGeneratingBlink(false);
      }
    },
    [handleApiError, connectedWallet]
  );

  const handleConnectWallet = useCallback(async () => {
    if (connectedWallet) {
      setConnectedWallet(null);
      return;
    }
    try {
      const win = window as WalletWindow;
      const candidates = getWalletProviderCandidates(win);
      if (!candidates.length) {
        showGlitchError("No Solana wallet found — install Phantom or Solflare");
        return;
      }

      let lastErrorMessage = "";
      for (const candidate of candidates) {
        try {
          const response = await connectProvider(candidate.provider);
          const address = extractWalletAddress(candidate.provider, response || null);

          if (!address) {
            lastErrorMessage = `${candidate.name} connected but no wallet address was returned`;
            continue;
          }

          setConnectedWallet(address);
          return;
        } catch (error) {
          const code = (error as { code?: number })?.code;
          const message = String((error as { message?: string })?.message || "");

          if (code === -32002 || /already processing|pending/i.test(message)) {
            showGlitchError(`${candidate.name} approval is pending. Check wallet popup/extension`);
            return;
          }

          if (code === 4001 || code === 4100 || /rejected|cancelled|canceled/i.test(message)) {
            // User may have rejected one wallet; try next detected provider.
            lastErrorMessage = `${candidate.name} request was rejected`;
            continue;
          }

          lastErrorMessage = message || `${candidate.name} connection failed`;
        }
      }

      showGlitchError(
        lastErrorMessage
          ? `Could not connect wallet: ${lastErrorMessage}`
          : "Could not connect wallet — unlock extension and approve the request"
      );
    } catch (error) {
      showGlitchError("Could not connect wallet — unlock extension and approve the request");
    }
  }, [connectedWallet, showGlitchError]);

  const triggerDemoSurge = useCallback(async () => {
    try {
      await api.post("/demo/trigger");
    } catch (error) {
      handleApiError(error);
    }
  }, [handleApiError]);

  const clearEventFeed = useCallback(() => {
    setEvents([]);
  }, []);

  const clearBlinkOutput = useCallback(() => {
    setBlinkUrl("");
    setBlinkLatency(null);
    setSurge(null);
  }, []);

  const handleResetView = useCallback(() => {
    clearEventFeed();
    clearBlinkOutput();
  }, [clearBlinkOutput, clearEventFeed]);

  const saveSurgeSettings = useCallback(async () => {
    const thresholdPercent = Number(surgeThresholdInput);
    const cooldownMs = Number(surgeCooldownInput);

    if (!Number.isFinite(thresholdPercent) || thresholdPercent < 0.1 || thresholdPercent > 100) {
      showGlitchError("Surge threshold must be between 0.1 and 100");
      return;
    }

    if (!Number.isFinite(cooldownMs) || cooldownMs < 1000 || cooldownMs > 3600000) {
      showGlitchError("Cooldown must be between 1000 and 3600000 ms");
      return;
    }

    setSavingSurgeSettings(true);

    try {
      const response = await api.put("/metrics/surge-settings", {
        thresholdPercent,
        cooldownMs
      });
      const settings = normalizeSurgeSettings(response.data?.settings || response.data);
      setSurgeThresholdInput(String(settings.thresholdPercent));
      setSurgeCooldownInput(String(settings.cooldownMs));
      setSurgeSettingsSaved(true);
      window.setTimeout(() => {
        setSurgeSettingsSaved(false);
      }, 2000);
    } catch (error) {
      handleApiError(error);
    } finally {
      setSavingSurgeSettings(false);
    }
  }, [handleApiError, showGlitchError, surgeCooldownInput, surgeThresholdInput]);

  const runOrbitflareProbe = useCallback(async () => {
    setRunningOrbitflareProbe(true);

    try {
      await api.post("/metrics/orbitflare/probe", { timeoutMs: 4500 });
      await Promise.all([refreshOrbitflareUsage(), refreshHealth()]);
    } catch (error) {
      handleApiError(error);
    } finally {
      setRunningOrbitflareProbe(false);
    }
  }, [handleApiError, refreshHealth, refreshOrbitflareUsage]);

  const latestLatency = useMemo(() => blinkLatency || ZERO_LATENCY, [blinkLatency]);

  return (
    <div className="flex h-screen w-full overflow-hidden text-white selection:bg-cyan-500/30">
      <div className="cyber-grid" />
      <Particles />

      <Sidebar active={activeSection} onSelect={setActiveSection} />

      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        <TopBar
          rpcLatency={metrics.rpcLatency}
          network={metrics.network}
          isDemoMode={isDemoMode}
          judgeMode={judgeMode}
          signalCount={events.length}
          connectedWallet={connectedWallet}
          onToggleJudgeMode={() => setJudgeMode((previous) => !previous)}
          onResetView={handleResetView}
          onConnectWallet={() => void handleConnectWallet()}
        />

        <motion.main
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="flex-1 flex gap-6 p-6 overflow-hidden"
        >
          {activeSection === "history" ? (
            <motion.div variants={itemVariants} className="flex-1 min-w-0 overflow-y-auto pr-2">
              <EventStream events={events} onSimSurge={triggerDemoSurge} isDemoMode={isDemoMode} />
            </motion.div>
          ) : activeSection === "terminal" ? (
            <motion.div variants={itemVariants} className="flex-1 min-w-0 overflow-y-auto pr-2">
              <OrbitflareExplorer
                onApiError={handleApiError}
                isDemoMode={isDemoMode}
                surgeThresholdInput={surgeThresholdInput}
                setSurgeThresholdInput={setSurgeThresholdInput}
                surgeCooldownInput={surgeCooldownInput}
                setSurgeCooldownInput={setSurgeCooldownInput}
                onSaveSurgeSettings={saveSurgeSettings}
                savingSurgeSettings={savingSurgeSettings}
                onRefreshSurgeSettings={refreshSurgeSettings}
                supportedTokens={supportedTokens}
                onRegisterAutonomousToken={registerAutonomousToken}
                addingWatchToken={addingWatchToken}
                latestLatency={latestLatency}
                events={events}
                connectedWallet={connectedWallet}
              />
            </motion.div>
          ) : activeSection === "rugcheck" ? (
            <motion.div variants={itemVariants} className="flex-1 min-w-0 overflow-y-auto pr-2">
              <RugCheck />
            </motion.div>
          ) : activeSection === "settings" ? (
            <motion.div variants={itemVariants} className="flex-1 min-w-0 overflow-y-auto pr-2">
              <div className="glass-panel rounded-2xl p-6 flex flex-col gap-4">
                <h3 className="text-sm font-bold tracking-widest text-gray-300">SYSTEM CONTROLS</h3>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-white/15 bg-black/30 p-4">
                    <div className="text-xs font-bold tracking-widest text-[#00f3ff] mb-3">SURGE DETECTION SETTINGS</div>
                    <div className="space-y-3">
                      <label className="block">
                        <div className="text-[11px] text-gray-400 mb-1">THRESHOLD (%)</div>
                        <input
                          type="number"
                          min="0.1"
                          max="100"
                          step="0.1"
                          value={surgeThresholdInput}
                          onChange={(event) => setSurgeThresholdInput(event.target.value)}
                          className="w-full rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-sm font-mono text-white outline-none focus:border-[#00f3ff]/60"
                        />
                      </label>

                      <label className="block">
                        <div className="text-[11px] text-gray-400 mb-1">COOLDOWN (MS)</div>
                        <input
                          type="number"
                          min="1000"
                          max="3600000"
                          step="1000"
                          value={surgeCooldownInput}
                          onChange={(event) => setSurgeCooldownInput(event.target.value)}
                          className="w-full rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-sm font-mono text-white outline-none focus:border-[#00f3ff]/60"
                        />
                      </label>

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => void saveSurgeSettings()}
                          disabled={savingSurgeSettings}
                          className="rounded-lg border border-[#00f3ff]/50 bg-[#00f3ff]/10 px-4 py-2 text-xs font-bold tracking-widest text-[#00f3ff] hover:bg-[#00f3ff]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {savingSurgeSettings ? "SAVING..." : "SAVE SURGE SETTINGS"}
                        </button>
                        <button
                          onClick={() => void refreshSurgeSettings()}
                          className="rounded-lg border border-white/20 bg-black/40 px-4 py-2 text-xs font-bold tracking-widest text-gray-200 hover:border-white/40"
                        >
                          REFRESH
                        </button>
                      </div>
                      <div className="text-[11px] font-mono text-gray-500">
                        Valid range: threshold `0.1 - 100`, cooldown `1000 - 3600000` ms
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/15 bg-black/30 p-4">
                    <div className="text-xs font-bold tracking-widest text-[#bc13fe] mb-3">UI CONTROLS</div>
                    <div className="grid grid-cols-1 gap-3">
                      <button
                        onClick={clearEventFeed}
                        className="rounded-xl border border-white/20 bg-black/40 px-4 py-3 text-sm font-bold tracking-widest hover:border-[#00f3ff]/50 hover:text-[#00f3ff] transition-colors"
                      >
                        CLEAR EVENT FEED
                      </button>
                      <button
                        onClick={clearBlinkOutput}
                        className="rounded-xl border border-white/20 bg-black/40 px-4 py-3 text-sm font-bold tracking-widest hover:border-[#00f3ff]/50 hover:text-[#00f3ff] transition-colors"
                      >
                        CLEAR BLINK OUTPUT
                      </button>
                      <button
                        onClick={() => setJudgeMode((previous) => !previous)}
                        className="rounded-xl border border-white/20 bg-black/40 px-4 py-3 text-sm font-bold tracking-widest hover:border-[#bc13fe]/50 hover:text-[#bc13fe] transition-colors"
                      >
                        {judgeMode ? "DISABLE JUDGE MODE" : "ENABLE JUDGE MODE"}
                      </button>
                      <button
                        onClick={() => void refreshHealth()}
                        className="rounded-xl border border-white/20 bg-black/40 px-4 py-3 text-sm font-bold tracking-widest hover:border-[#ff6a00]/50 hover:text-[#ff6a00] transition-colors"
                      >
                        REFRESH HEALTH
                      </button>
                      <button
                        onClick={() => void runOrbitflareProbe()}
                        disabled={runningOrbitflareProbe}
                        className="rounded-xl border border-[#00f3ff]/40 bg-[#00f3ff]/10 px-4 py-3 text-sm font-bold tracking-widest text-[#8cf8ff] hover:bg-[#00f3ff]/20 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                      >
                        {runningOrbitflareProbe ? "RUNNING ORBITFLARE PROBE..." : "RUN ORBITFLARE PROBE"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ) : activeSection === "nodes" || (activeSection === "dashboard" && judgeMode) ? (
            <motion.div variants={itemVariants} className="flex-1 overflow-y-auto pr-2">
              <JudgeBriefing
                isDemoMode={isDemoMode}
                metrics={metrics}
                events={events}
                latestBlinkLatency={latestLatency}
                price={price}
                token={selectedToken}
                healthSnapshot={healthSnapshot}
                orbitflareUsage={orbitflareUsage}
              />
            </motion.div>
          ) : (
            <motion.div variants={itemVariants} className="flex-1 min-w-0 overflow-hidden">
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_24rem] gap-6 h-full">
                <div className="min-w-0 overflow-y-auto pr-2">
                  <TradingPanel
                    token={selectedToken}
                    supportedTokens={supportedTokens}
                    tokenDisplayNames={tokenDisplayNames}
                    onTokenChange={setSelectedToken}
                    onAddWatchToken={registerAutonomousToken}
                    addingWatchToken={addingWatchToken}
                    price={price}
                    priceHistory={priceHistoryByToken[selectedToken] || []}
                    metrics={metrics}
                    blinkUrl={blinkUrl}
                    blinkLatency={latestLatency}
                    generatingBlink={generatingBlink}
                    onGenerateBlink={handleGenerateBlink}
                  />
                </div>
                <div className="min-w-0 overflow-y-auto pr-2">
                  <EventStream events={events} onSimSurge={triggerDemoSurge} isDemoMode={isDemoMode} tokenDisplayNames={tokenDisplayNames} />
                </div>
              </div>
            </motion.div>
          )}
        </motion.main>
      </div>

      <AnimatePresence>
        {surge && <SurgeAlert {...surge} displayName={tokenDisplayNames[surge.token] || getTokenDisplayName(surge.token)} onClose={() => setSurge(null)} />}
      </AnimatePresence>

      <AnimatePresence>
        {glitchError && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] rounded-lg border border-[#ff007f]/40 bg-[#0B0F1A]/95 px-4 py-2 text-xs font-mono text-[#ff7db9]"
          >
            {glitchError}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {rateLimited && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="fixed bottom-6 right-6 z-[60] rounded-lg border border-[#ff6a00]/40 bg-[#0B0F1A]/95 px-4 py-2 text-xs font-mono text-[#ffb37d]"
          >
            RATE LIMIT REACHED. RETRY SHORTLY.
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {surgeSettingsSaved && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="fixed bottom-20 right-6 z-[60] rounded-lg border border-[#00f3ff]/40 bg-[#0B0F1A]/95 px-4 py-2 text-xs font-mono text-[#8cf8ff]"
          >
            SURGE SETTINGS SAVED
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {watchTokenSaved && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            className="fixed bottom-32 right-6 z-[60] rounded-lg border border-[#00f3ff]/40 bg-[#0B0F1A]/95 px-4 py-2 text-xs font-mono text-[#8cf8ff]"
          >
            WATCH TOKEN ADDED: {watchTokenSaved}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
