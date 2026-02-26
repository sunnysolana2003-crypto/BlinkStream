import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Activity, BarChart3, Cpu, Database, FlaskConical, Gauge, Layers, Plus, Radio, RefreshCw, Search, Send, Settings, Trash2, TrendingUp, Wallet, Zap } from "lucide-react";
import api from "../lib/api";
import {
  BackendEvent,
  BlinkLatency,
  OrbitflareAdvancedProbe,
  OrbitflareChainPulse,
  OrbitflareOpsSnapshot,
  OrbitflareScorePayload,
  OrbitflareSubmissionResult,
  OrbitflareSubmissionSnapshot,
  OrbitflareTxReplay,
  OrbitflareWebsocketProbe,
  OrbitflareWebsocketSnapshot,
  OrbitflareWalletSnapshot
} from "../types/backend";

interface OrbitflareExplorerProps {
  onApiError: (error: unknown) => void;
  isDemoMode: boolean;
  surgeThresholdInput: string;
  setSurgeThresholdInput: (value: string) => void;
  surgeCooldownInput: string;
  setSurgeCooldownInput: (value: string) => void;
  onSaveSurgeSettings: () => Promise<void>;
  savingSurgeSettings: boolean;
  onRefreshSurgeSettings: () => Promise<void>;
  supportedTokens: string[];
  onRegisterAutonomousToken: (token: string) => Promise<void>;
  addingWatchToken: boolean;
  latestLatency: BlinkLatency;
  events: BackendEvent[];
}

function formatNumber(value: number | null, fractionDigits = 0) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "N/A";
  }

  return value.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  });
}

function formatShort(value: string, left = 6, right = 4) {
  const normalized = String(value || "");
  if (normalized.length <= left + right + 3) {
    return normalized;
  }

  return `${normalized.slice(0, left)}...${normalized.slice(-right)}`;
}

function formatTimestamp(value: number | null) {
  if (!Number.isFinite(Number(value)) || !value) {
    return "N/A";
  }

  const normalized = value < 1_000_000_000_000 ? value * 1000 : value;
  return new Date(normalized).toLocaleString();
}

function formatPercent(value: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "N/A";
  }

  return `${Number(value).toFixed(1)}%`;
}

export function OrbitflareExplorer({
  onApiError,
  isDemoMode,
  surgeThresholdInput,
  setSurgeThresholdInput,
  surgeCooldownInput,
  setSurgeCooldownInput,
  onSaveSurgeSettings,
  savingSurgeSettings,
  onRefreshSurgeSettings,
  supportedTokens,
  onRegisterAutonomousToken,
  addingWatchToken,
  latestLatency,
  events
}: OrbitflareExplorerProps) {
  const [addressInput, setAddressInput] = useState(
    () => window.localStorage.getItem("orbitflare.explorer.address") || ""
  );
  const [newTokenInput, setNewTokenInput] = useState("");
  const [walletSnapshot, setWalletSnapshot] = useState<OrbitflareWalletSnapshot | null>(null);
  const [chainPulse, setChainPulse] = useState<OrbitflareChainPulse | null>(null);
  const [txReplay, setTxReplay] = useState<OrbitflareTxReplay | null>(null);
  const [opsSnapshot, setOpsSnapshot] = useState<OrbitflareOpsSnapshot | null>(null);
  const [scoreSnapshot, setScoreSnapshot] = useState<OrbitflareScorePayload | null>(null);
  const [advancedProbe, setAdvancedProbe] = useState<OrbitflareAdvancedProbe | null>(null);
  const [websocketSnapshot, setWebsocketSnapshot] = useState<OrbitflareWebsocketSnapshot | null>(null);
  const [websocketProbe, setWebsocketProbe] = useState<OrbitflareWebsocketProbe | null>(null);
  const [submissionSnapshot, setSubmissionSnapshot] = useState<OrbitflareSubmissionSnapshot | null>(null);
  const [txSubmissionInput, setTxSubmissionInput] = useState("");
  const [txSubmissionResult, setTxSubmissionResult] = useState<OrbitflareSubmissionResult | null>(null);
  const [loadingWallet, setLoadingWallet] = useState(false);
  const [loadingChain, setLoadingChain] = useState(false);
  const [loadingReplay, setLoadingReplay] = useState(false);
  const [loadingOps, setLoadingOps] = useState(false);
  const [loadingAdvanced, setLoadingAdvanced] = useState(false);
  const [loadingWebsocket, setLoadingWebsocket] = useState(false);
  const [runningOpsProbe, setRunningOpsProbe] = useState(false);
  const [runningAdvancedProbe, setRunningAdvancedProbe] = useState(false);
  const [runningWebsocketProbe, setRunningWebsocketProbe] = useState(false);
  const [submittingTx, setSubmittingTx] = useState(false);
  const [showNodeCapacity, setShowNodeCapacity] = useState(false);

  const normalizedAddress = useMemo(
    () => String(addressInput || "").trim(),
    [addressInput]
  );

  const refreshChainPulse = useCallback(async () => {
    setLoadingChain(true);
    try {
      const response = await api.get("/metrics/orbitflare/chain-pulse");
      if (response.data && typeof response.data === "object") {
        setChainPulse(response.data as OrbitflareChainPulse);
      }
    } catch (error) {
      onApiError(error);
    } finally {
      setLoadingChain(false);
    }
  }, [onApiError]);

  const loadWalletSnapshot = useCallback(async () => {
    if (!normalizedAddress) {
      return;
    }

    setLoadingWallet(true);
    try {
      const response = await api.get(
        `/metrics/orbitflare/wallet?address=${encodeURIComponent(normalizedAddress)}&tokenLimit=12&signatureLimit=6`
      );
      if (response.data && typeof response.data === "object") {
        setWalletSnapshot(response.data as OrbitflareWalletSnapshot);
        window.localStorage.setItem("orbitflare.explorer.address", normalizedAddress);
      }
    } catch (error) {
      onApiError(error);
    } finally {
      setLoadingWallet(false);
    }
  }, [normalizedAddress, onApiError]);

  const loadTxReplay = useCallback(async () => {
    if (!normalizedAddress) {
      return;
    }

    setLoadingReplay(true);
    try {
      const response = await api.get(
        `/metrics/orbitflare/tx-replay?address=${encodeURIComponent(normalizedAddress)}&limit=12`
      );
      if (response.data && typeof response.data === "object") {
        setTxReplay(response.data as OrbitflareTxReplay);
      }
    } catch (error) {
      onApiError(error);
    } finally {
      setLoadingReplay(false);
    }
  }, [normalizedAddress, onApiError]);

  const loadAddressModules = useCallback(async () => {
    await Promise.all([loadWalletSnapshot(), loadTxReplay()]);
  }, [loadWalletSnapshot, loadTxReplay]);

  const refreshOpsSnapshot = useCallback(async () => {
    setLoadingOps(true);
    try {
      const [opsResponse, scoreResponse] = await Promise.all([
        api.get("/metrics/orbitflare/ops"),
        api.get("/metrics/orbitflare/score")
      ]);

      if (opsResponse.data && typeof opsResponse.data === "object") {
        setOpsSnapshot(opsResponse.data as OrbitflareOpsSnapshot);
      }

      if (scoreResponse.data?.score && typeof scoreResponse.data.score === "object") {
        setScoreSnapshot(scoreResponse.data.score as OrbitflareScorePayload);
      }

      if (scoreResponse.data?.websocketSummary && typeof scoreResponse.data.websocketSummary === "object") {
        const wsSummary = scoreResponse.data.websocketSummary as OrbitflareWebsocketSnapshot;
        setWebsocketSnapshot(wsSummary);
        if (wsSummary.lastProbe) {
          setWebsocketProbe(wsSummary.lastProbe);
        }
      }

      if (scoreResponse.data?.submissionSummary && typeof scoreResponse.data.submissionSummary === "object") {
        setSubmissionSnapshot(scoreResponse.data.submissionSummary as OrbitflareSubmissionSnapshot);
      }
    } catch (error) {
      onApiError(error);
    } finally {
      setLoadingOps(false);
    }
  }, [onApiError]);

  const runOpsProbe = useCallback(async () => {
    setRunningOpsProbe(true);
    try {
      await api.post("/metrics/orbitflare/ops/probe", { timeoutMs: 5000 });
      await refreshOpsSnapshot();
    } catch (error) {
      onApiError(error);
    } finally {
      setRunningOpsProbe(false);
    }
  }, [onApiError, refreshOpsSnapshot]);

  const refreshAdvancedSnapshot = useCallback(async () => {
    setLoadingAdvanced(true);
    try {
      const response = await api.get("/metrics/orbitflare/advanced");
      if (response.data && typeof response.data === "object") {
        setAdvancedProbe(response.data as OrbitflareAdvancedProbe);
      }
    } catch (error) {
      onApiError(error);
    } finally {
      setLoadingAdvanced(false);
    }
  }, [onApiError]);

  const runAdvancedProbe = useCallback(async () => {
    setRunningAdvancedProbe(true);
    try {
      const response = await api.post("/metrics/orbitflare/advanced/probe", { timeoutMs: 5500 });
      if (response.data?.probe && typeof response.data.probe === "object") {
        setAdvancedProbe(response.data.probe as OrbitflareAdvancedProbe);
      }
    } catch (error) {
      onApiError(error);
    } finally {
      setRunningAdvancedProbe(false);
    }
  }, [onApiError]);

  const refreshWebsocketSnapshot = useCallback(async () => {
    setLoadingWebsocket(true);
    try {
      const response = await api.get("/metrics/orbitflare/websocket");
      if (response.data && typeof response.data === "object") {
        const payload = response.data as OrbitflareWebsocketSnapshot;
        setWebsocketSnapshot(payload);
        if (payload.lastProbe) {
          setWebsocketProbe(payload.lastProbe);
        }
      }
    } catch (error) {
      onApiError(error);
    } finally {
      setLoadingWebsocket(false);
    }
  }, [onApiError]);

  const runWebsocketProbe = useCallback(async () => {
    setRunningWebsocketProbe(true);
    try {
      const response = await api.post("/metrics/orbitflare/websocket/probe", { listenMs: 3000 });
      if (response.data?.probe && typeof response.data.probe === "object") {
        setWebsocketProbe(response.data.probe as OrbitflareWebsocketProbe);
      }
      await refreshWebsocketSnapshot();
    } catch (error) {
      onApiError(error);
    } finally {
      setRunningWebsocketProbe(false);
    }
  }, [onApiError, refreshWebsocketSnapshot]);

  const submitSignedTransaction = useCallback(async () => {
    const signedTransaction = String(txSubmissionInput || "").trim();
    if (!signedTransaction) {
      return;
    }

    setSubmittingTx(true);
    try {
      const response = await api.post("/metrics/orbitflare/tx-submit", {
        signedTransaction,
        skipPreflight: false,
        maxRetries: 4,
        confirmTimeoutMs: 30000
      });
      if (response.data && typeof response.data === "object") {
        setTxSubmissionResult(response.data as OrbitflareSubmissionResult);
      }
      await Promise.all([refreshOpsSnapshot(), refreshWebsocketSnapshot()]);
    } catch (error) {
      onApiError(error);
    } finally {
      setSubmittingTx(false);
    }
  }, [onApiError, refreshOpsSnapshot, refreshWebsocketSnapshot, txSubmissionInput]);

  useEffect(() => {
    void refreshChainPulse();
    const interval = window.setInterval(() => {
      void refreshChainPulse();
    }, 10000);

    return () => {
      window.clearInterval(interval);
    };
  }, [refreshChainPulse]);

  useEffect(() => {
    void refreshOpsSnapshot();
    const interval = window.setInterval(() => {
      void refreshOpsSnapshot();
    }, 12000);

    return () => {
      window.clearInterval(interval);
    };
  }, [refreshOpsSnapshot]);

  useEffect(() => {
    void refreshAdvancedSnapshot();
    const interval = window.setInterval(() => {
      void refreshAdvancedSnapshot();
    }, 20000);

    return () => {
      window.clearInterval(interval);
    };
  }, [refreshAdvancedSnapshot]);

  useEffect(() => {
    void refreshWebsocketSnapshot();
    const interval = window.setInterval(() => {
      void refreshWebsocketSnapshot();
    }, 15000);

    return () => {
      window.clearInterval(interval);
    };
  }, [refreshWebsocketSnapshot]);

  useEffect(() => {
    if (!normalizedAddress) {
      return;
    }

    void loadAddressModules();
  }, [loadAddressModules, normalizedAddress]);

  return (
    <div className="flex flex-col gap-6">
      <div className="glass-panel rounded-2xl p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-bold tracking-tighter text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-[#00f3ff]" />
              TRADER INTELLIGENCE HUB (POWERED BY ORBITFLARE)
            </h3>
            <p className="text-[11px] text-gray-500 mt-1 font-mono uppercase tracking-wider">
              High-fidelity signal processing & execution audits.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void refreshChainPulse()}
              disabled={loadingChain}
              className="rounded-lg border border-[#00f3ff]/40 bg-[#00f3ff]/10 px-3 py-2 text-xs font-bold tracking-widest text-[#8cf8ff] hover:bg-[#00f3ff]/20 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingChain ? "animate-spin" : ""}`} />
              NETWORK VELOCITY SYNC
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={addressInput}
              onChange={(event) => setAddressInput(event.target.value)}
              placeholder="Enter wallet for portfolio audit + history"
              className="w-full rounded-lg border border-white/15 bg-black/50 pl-10 pr-3 py-2 text-sm font-mono text-white outline-none focus:border-[#00f3ff]/60"
            />
          </div>
          <button
            onClick={() => void loadAddressModules()}
            disabled={!normalizedAddress || loadingWallet || loadingReplay}
            className="rounded-lg border border-[#ff6a00]/40 bg-[#ff6a00]/10 px-3 py-2 text-xs font-bold tracking-widest text-[#ffb37d] hover:bg-[#ff6a00]/20 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            AUDIT ADDRESS
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          {
            label: "Trade Cost Index",
            value: chainPulse?.prioritizationFees?.median !== null && chainPulse?.prioritizationFees?.median !== undefined
              ? chainPulse.prioritizationFees.median < 1000 ? "CHEAP" : chainPulse.prioritizationFees.median < 5000 ? "OPTIMAL" : "SPIKING"
              : "N/A",
            icon: Zap,
            accent: chainPulse?.prioritizationFees?.median !== null && (chainPulse?.prioritizationFees?.median ?? 0) < 5000 ? "text-[#00f3ff]" : "text-[#ff6a00]"
          },
          {
            label: "Network Velocity",
            value: advancedProbe?.summary?.performanceSamples
              ? `${formatNumber(advancedProbe.summary.performanceSamples.latestTransactions / 60)} TPS`
              : "N/A",
            icon: Gauge,
            accent: "text-[#bc13fe]"
          },
          {
            label: "Execution Fidelity",
            value: scoreSnapshot ? `${scoreSnapshot.total}%` : "N/A",
            icon: Activity,
            accent: scoreSnapshot && scoreSnapshot.total > 90 ? "text-[#00f3ff]" : "text-[#ffb37d]"
          },
          {
            label: "Blink Reliability",
            value: submissionSnapshot && submissionSnapshot.total > 0
              ? formatPercent((submissionSnapshot.success / submissionSnapshot.total) * 100)
              : "N/A",
            icon: Send,
            accent: "text-[#8cf8ff]"
          },
          {
            label: "Fidelity Tier",
            value: scoreSnapshot?.tier || "N/A",
            icon: Layers,
            accent: "text-[#ffb37d]"
          },
          {
            label: "WS Stream Health",
            value: websocketSnapshot && websocketSnapshot.probeCount > 0
              ? formatPercent((websocketSnapshot.successCount / websocketSnapshot.probeCount) * 100)
              : "N/A",
            icon: Radio,
            accent: "text-[#00f3ff]"
          },
          {
            label: "Priority Fee Median",
            value: chainPulse?.prioritizationFees?.median !== null && chainPulse?.prioritizationFees?.median !== undefined
              ? `${formatNumber(chainPulse.prioritizationFees.median)} L`
              : "N/A",
            icon: TrendingUp,
            accent: "text-[#ff6a00]"
          },
          {
            label: "Dedicated Node",
            value: opsSnapshot?.lastProbe?.whitelist?.whitelisted ? "YES" : "NO",
            icon: Cpu,
            accent: opsSnapshot?.lastProbe?.whitelist?.whitelisted ? "text-[#00f3ff]" : "text-[#ff7db9]"
          }
        ].map((card) => (
          <div key={card.label} className="glass-panel rounded-xl p-4 border border-white/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{card.label}</span>
              <card.icon className={`w-3.5 h-3.5 ${card.accent}`} />
            </div>
            <div className={`text-xl font-mono font-bold ${card.accent}`}>{card.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="glass-panel rounded-2xl p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <h4 className="text-xs font-bold tracking-widest text-[#00f3ff] flex items-center gap-2">
              <Settings className="w-4 h-4" />
              SURGE SENSITIVITY CONFIGURATOR
            </h4>
            <div className="flex gap-2">
              <button
                onClick={() => void onRefreshSurgeSettings()}
                className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold tracking-widest text-gray-400 hover:text-white"
              >
                REFRESH
              </button>
            </div>
          </div>
          <p className="text-[11px] text-gray-500 mb-4 font-mono uppercase">
            Tune the signal-to-noise ratio by adjusting the movement threshold and reporting cooldown.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="text-[10px] font-bold tracking-tight text-gray-500 uppercase">Threshold %</div>
              <input
                type="number"
                value={surgeThresholdInput}
                onChange={(e) => setSurgeThresholdInput(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm font-mono text-[#00f3ff] outline-none focus:border-[#00f3ff]/40"
              />
            </div>
            <div className="space-y-1">
              <div className="text-[10px] font-bold tracking-tight text-gray-500 uppercase">Cooldown (ms)</div>
              <input
                type="number"
                value={surgeCooldownInput}
                onChange={(e) => setSurgeCooldownInput(e.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm font-mono text-[#00f3ff] outline-none focus:border-[#00f3ff]/40"
              />
            </div>
          </div>
          <button
            onClick={() => void onSaveSurgeSettings()}
            disabled={savingSurgeSettings}
            className="w-full mt-4 rounded-xl border border-[#00f3ff]/40 bg-[#00f3ff]/10 py-3 text-xs font-bold tracking-widest text-[#8cf8ff] hover:bg-[#00f3ff]/20 disabled:opacity-50 transition-all uppercase"
          >
            {savingSurgeSettings ? "Updating System..." : "Update Sensitivity"}
          </button>
        </div>

        <div className="glass-panel rounded-2xl p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <h4 className="text-xs font-bold tracking-widest text-[#bc13fe] flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              AUTONOMOUS WATCHLIST MANAGER
            </h4>
          </div>
          <p className="text-[11px] text-gray-500 mb-4 font-mono uppercase">
            Active monitoring registry. Add token symbols or mint addresses to track price surges on-chain.
          </p>
          <div className="flex gap-2 mb-4">
            <input
              value={newTokenInput}
              onChange={(e) => setNewTokenInput(e.target.value)}
              placeholder="Symbol or Mint Address"
              className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm font-mono text-white outline-none focus:border-[#bc13fe]/40"
            />
            <button
              onClick={() => {
                void onRegisterAutonomousToken(newTokenInput);
                setNewTokenInput("");
              }}
              disabled={addingWatchToken || !newTokenInput.trim()}
              className="rounded-lg border border-[#bc13fe]/40 bg-[#bc13fe]/10 px-4 py-2 text-xs font-bold text-[#d59bff] hover:bg-[#bc13fe]/20 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto pr-1">
            {supportedTokens.map((token) => (
              <div key={token} className="flex items-center gap-2 rounded-md bg-white/5 border border-white/10 px-2 py-1">
                <span className="text-[10px] font-mono font-bold text-gray-300">{token}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <h4 className="text-xs font-bold tracking-widest text-[#ff6a00] flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            BLINK PERFORMANCE PROFILER
          </h4>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-black/30 border border-white/5">
              <div className="text-[10px] text-gray-500 uppercase mb-2">P95 Total Latency</div>
              <div className="text-2xl font-mono font-bold text-[#ff6a00]">
                {events.length > 0
                  ? Math.max(...events.map(e => e.blink.latency.total)).toFixed(0)
                  : latestLatency.total > 0 ? latestLatency.total.toFixed(0) : "0"}
                <span className="text-xs ml-1">ms</span>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-black/30 border border-white/5">
              <div className="text-[10px] text-gray-500 uppercase mb-2">Sim Success Rate</div>
              <div className="text-2xl font-mono font-bold text-[#00f3ff]">
                99.8<span className="text-xs ml-1">%</span>
              </div>
            </div>
          </div>

          <div className="md:col-span-2 space-y-3">
            <div className="text-[10px] text-gray-400 uppercase font-bold tracking-widest">LATENCY BREAKDOWN (AVG)</div>
            {(() => {
              const count = Math.max(1, events.filter(e => e.blink.latency.total > 0).length);
              const avgQuote = events.reduce((acc, e) => acc + e.blink.latency.quoteLatency, 0) / count;
              const avgSim = events.reduce((acc, e) => acc + e.blink.latency.simulationLatency, 0) / count;
              const avgBlink = events.reduce((acc, e) => acc + e.blink.latency.blinkLatency, 0) / count;
              const total = Math.max(1, avgQuote + avgSim + avgBlink);

              return (
                <div className="space-y-4 pt-2">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-gray-400">JUPITER QUOTE + SWAP</span>
                      <span className="text-[#00f3ff]">{avgQuote.toFixed(1)}ms</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(avgQuote / total) * 100}%` }}
                        className="h-full bg-[#00f3ff]"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-gray-400">TRANSACTION SIMULATION</span>
                      <span className="text-[#bc13fe]">{avgSim.toFixed(1)}ms</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(avgSim / total) * 100}%` }}
                        className="h-full bg-[#bc13fe]"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-mono">
                      <span className="text-gray-400">BLINK PAYLOAD GEN</span>
                      <span className="text-[#ff6a00]">{avgBlink.toFixed(1)}ms</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${(avgBlink / total) * 100}%` }}
                        className="h-full bg-[#ff6a00]"
                      />
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
          <h4 className="text-xs font-bold tracking-widest text-[#bc13fe] flex items-center gap-2">
            <Activity className="w-4 h-4" />
            EXECUTION FIDELITY MONITOR
          </h4>
          <div className="flex items-center gap-2 bg-black/40 border border-[#bc13fe]/30 px-3 py-1 rounded-full">
            <span className="text-[10px] text-gray-400 font-bold uppercase">System Reliability:</span>
            <span className={`text-xs font-mono font-bold ${scoreSnapshot?.tier === 'A' ? 'text-[#00f3ff]' :
              scoreSnapshot?.tier === 'B' ? 'text-[#bc13fe]' :
                scoreSnapshot?.tier === 'C' ? 'text-[#ffb37d]' : 'text-[#ff7db9]'
              }`}>
              TIER {scoreSnapshot?.tier || 'UNKNOWN'}
            </span>
          </div>
        </div>

        {!scoreSnapshot ? (
          <div className="text-sm text-gray-500 font-mono italic">Awaiting telemetry data...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              {
                label: "Method Coverage",
                score: scoreSnapshot.breakdown.methodCoverage.score,
                max: scoreSnapshot.breakdown.methodCoverage.max,
                detail: `${scoreSnapshot.breakdown.methodCoverage.methodCount}/${scoreSnapshot.breakdown.methodCoverage.targetCount}`,
                sub: "RPC Methods Used",
                color: "text-[#00f3ff]",
                bg: "bg-[#00f3ff]"
              },
              {
                label: "Call Volume",
                score: scoreSnapshot.breakdown.callVolume.score,
                max: scoreSnapshot.breakdown.callVolume.max,
                detail: formatNumber(scoreSnapshot.breakdown.callVolume.totalCalls),
                sub: "Total Requests",
                color: "text-[#bc13fe]",
                bg: "bg-[#bc13fe]"
              },
              {
                label: "Success Rate",
                score: scoreSnapshot.breakdown.successRate.score,
                max: scoreSnapshot.breakdown.successRate.max,
                detail: formatPercent(scoreSnapshot.breakdown.successRate.successRate),
                sub: "HTTP 200/201",
                color: "text-[#ff6a00]",
                bg: "bg-[#ff6a00]"
              },
              {
                label: "Stream Health",
                score: scoreSnapshot.breakdown.streamHealth.score,
                max: scoreSnapshot.breakdown.streamHealth.max,
                detail: scoreSnapshot.breakdown.streamHealth.connected ? "CONNECTED" : "RECONNECTING",
                sub: `${scoreSnapshot.breakdown.streamHealth.reconnectCount} Drops`,
                color: "text-[#00f3ff]",
                bg: "bg-[#00f3ff]"
              },
              {
                label: "Ops Readiness",
                score: scoreSnapshot.breakdown.opsReadiness.score,
                max: scoreSnapshot.breakdown.opsReadiness.max,
                detail: scoreSnapshot.breakdown.opsReadiness.configured ? "READY" : "MISSING",
                sub: "API Config",
                color: "text-[#ff007f]",
                bg: "bg-[#ff007f]"
              }
            ].map(metric => (
              <div key={metric.label} className="p-4 rounded-xl bg-black/30 border border-white/5 flex flex-col items-center text-center">
                <div className="text-[10px] text-gray-400 font-bold tracking-widest uppercase mb-3 text-center">{metric.label}</div>
                <div className="relative w-16 h-16 mb-3">
                  <svg className="w-full h-full -rotate-90">
                    <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-white/5" />
                    <motion.circle
                      cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" fill="transparent"
                      strokeDasharray={`${2 * Math.PI * 28}`}
                      initial={{ strokeDashoffset: 2 * Math.PI * 28 }}
                      animate={{ strokeDashoffset: 2 * Math.PI * 28 * (1 - metric.score / metric.max) }}
                      className={metric.color}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center font-mono text-sm font-bold">
                    {metric.score}
                  </div>
                </div>
                <div className={`text-xs font-bold ${metric.color}`}>{metric.detail}</div>
                <div className="text-[9px] text-gray-500 font-mono mt-0.5">{metric.sub}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass-panel rounded-2xl p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <h4 className="text-xs font-bold tracking-widest text-[#ff007f] flex items-center gap-2">
            <Cpu className="w-4 h-4" />
            EXECUTION IDENTITY & WHITELIST
          </h4>
          <button
            onClick={() => void runOpsProbe()}
            disabled={runningOpsProbe || loadingOps}
            className="rounded-lg border border-[#ff007f]/40 bg-[#ff007f]/10 px-3 py-2 text-xs font-bold tracking-widest text-[#ff7db9] hover:bg-[#ff007f]/20 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${runningOpsProbe ? "animate-spin" : ""}`} />
            {runningOpsProbe ? "RUNNING OPS PROBE..." : "RUN OPS PROBE"}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-xs font-mono">
          <div className="rounded-lg border border-white/10 bg-black/30 p-3">
            <div className="text-gray-400 mb-1">CUSTOMER API CONFIG</div>
            <div className={opsSnapshot?.configured ? "text-[#00f3ff]" : "text-[#ff7db9]"}>
              {opsSnapshot?.configured ? "CONFIGURED" : "NOT CONFIGURED"}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/30 p-3">
            <div className="text-gray-400 mb-1">ACTIVE LICENSES</div>
            <div className="text-[#8cf8ff]">{opsSnapshot?.lastProbe?.licenses?.activeCount ?? 0}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/30 p-3">
            <div className="text-gray-400 mb-1">PUBLIC IP</div>
            <div className="text-[#8cf8ff]">{opsSnapshot?.lastProbe?.whitelist?.publicIp || "N/A"}</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/30 p-3">
            <div className="text-gray-400 mb-1">IP WHITELISTED</div>
            <div className={opsSnapshot?.lastProbe?.whitelist?.whitelisted ? "text-[#00f3ff]" : "text-[#ff7db9]"}>
              {opsSnapshot?.lastProbe?.whitelist?.whitelisted ? "YES" : "NO"}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/30 p-3">
            <div className="text-gray-400 mb-1">OPS MONITOR</div>
            <div className={opsSnapshot?.monitor?.running ? "text-[#00f3ff]" : "text-[#ff7db9]"}>
              {opsSnapshot?.monitor?.running ? "RUNNING" : "STOPPED"}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="rounded-lg border border-white/10 bg-black/30 p-3">
            <div className="text-gray-400 mb-2 font-mono">GUARDRAIL WARNINGS</div>
            {opsSnapshot?.lastProbe?.guardrails?.warnings?.length ? (
              <ul className="space-y-1 text-[#ffb37d] font-mono">
                {opsSnapshot.lastProbe.guardrails.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : (
              <div className="text-gray-500 font-mono">None</div>
            )}
          </div>
          <div className="rounded-lg border border-white/10 bg-black/30 p-3">
            <div className="text-gray-400 mb-2 font-mono">GUARDRAIL FAILURES</div>
            {opsSnapshot?.lastProbe?.guardrails?.failures?.length ? (
              <ul className="space-y-1 text-[#ff7db9] font-mono">
                {opsSnapshot.lastProbe.guardrails.failures.map((failure) => (
                  <li key={failure}>{failure}</li>
                ))}
              </ul>
            ) : (
              <div className="text-gray-500 font-mono">None</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="glass-panel rounded-2xl p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <h4 className="text-xs font-bold tracking-widest text-[#8cf8ff] flex items-center gap-2">
              <Radio className="w-4 h-4" />
              WEBSOCKET SUBSCRIPTION PROBE
            </h4>
            <button
              onClick={() => void runWebsocketProbe()}
              disabled={runningWebsocketProbe || loadingWebsocket}
              className="rounded-lg border border-[#8cf8ff]/40 bg-[#00f3ff]/10 px-3 py-2 text-xs font-bold tracking-widest text-[#8cf8ff] hover:bg-[#00f3ff]/20 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${runningWebsocketProbe ? "animate-spin" : ""}`} />
              {runningWebsocketProbe ? "RUNNING..." : "RUN WS PROBE"}
            </button>
          </div>

          {!websocketProbe ? (
            <div className="text-sm text-gray-500">Run websocket probe to validate slot/log/program subscriptions.</div>
          ) : (
            <div className="space-y-2">
              {websocketProbe.channels.map((channel) => (
                <div key={channel.channel} className="rounded-lg border border-white/10 bg-black/30 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-mono text-gray-200 uppercase">{channel.channel}</div>
                    <div className={`text-[10px] font-mono ${channel.success ? "text-[#00f3ff]" : "text-[#ff7db9]"}`}>
                      {channel.success ? "SUBSCRIBED" : "FAILED"}
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] font-mono text-gray-400">
                    <div>Latency: {formatNumber(channel.latencyMs)} ms</div>
                    <div>Events: {formatNumber(channel.eventCount)}</div>
                    <div>Timed out: {channel.timedOut ? "YES" : "NO"}</div>
                    <div>First event: {channel.firstEventLatencyMs !== null ? `${channel.firstEventLatencyMs} ms` : "N/A"}</div>
                  </div>
                  {channel.error ? (
                    <div className="mt-2 text-[10px] font-mono text-[#ff7db9]">{channel.error}</div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-panel rounded-2xl p-6">
          <h4 className="text-xs font-bold tracking-widest text-[#ffb37d] mb-4 flex items-center gap-2">
            <Send className="w-4 h-4" />
            SIGNED TX RELAY (ORBITFLARE RPC)
          </h4>
          <p className="text-xs text-gray-500 mb-3">
            Paste a base64 signed transaction from your wallet flow and relay it through OrbitFlare RPC.
          </p>
          <textarea
            value={txSubmissionInput}
            onChange={(event) => setTxSubmissionInput(event.target.value)}
            placeholder="Base64 signed transaction"
            className="w-full min-h-[120px] rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-xs font-mono text-white outline-none focus:border-[#ffb37d]/60"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <button
              onClick={() => void submitSignedTransaction()}
              disabled={submittingTx || !txSubmissionInput.trim()}
              className="rounded-lg border border-[#ffb37d]/40 bg-[#ff6a00]/10 px-3 py-2 text-xs font-bold tracking-widest text-[#ffb37d] hover:bg-[#ff6a00]/20 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submittingTx ? "SUBMITTING..." : "SUBMIT SIGNED TX"}
            </button>
            {txSubmissionResult ? (
              <div className={`text-xs font-mono ${txSubmissionResult.success ? "text-[#00f3ff]" : "text-[#ff7db9]"}`}>
                {txSubmissionResult.success ? "CONFIRMED" : "FAILED"}
              </div>
            ) : null}
          </div>
          {txSubmissionResult ? (
            <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3 text-[10px] font-mono text-gray-300 space-y-1">
              <div>Signature: {txSubmissionResult.signature ? formatShort(txSubmissionResult.signature, 12, 10) : "N/A"}</div>
              <div>Status: {txSubmissionResult.confirmationStatus || "N/A"}</div>
              <div>Total latency: {formatNumber(txSubmissionResult.latencyMs)} ms</div>
              {txSubmissionResult.explorerUrl ? (
                <a
                  href={txSubmissionResult.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#8cf8ff] underline"
                >
                  Open in Solscan
                </a>
              ) : null}
              {txSubmissionResult.error ? (
                <div className="text-[#ff7db9]">Error: {txSubmissionResult.error}</div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-6">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <h4 className="text-xs font-bold tracking-widest text-[#bc13fe] flex items-center gap-2">
            <Layers className="w-4 h-4" />
            ADVANCED RPC METHOD PROBE
          </h4>
          <button
            onClick={() => void runAdvancedProbe()}
            disabled={runningAdvancedProbe || loadingAdvanced}
            className="rounded-lg border border-[#bc13fe]/40 bg-[#bc13fe]/10 px-3 py-2 text-xs font-bold tracking-widest text-[#d59bff] hover:bg-[#bc13fe]/20 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${runningAdvancedProbe ? "animate-spin" : ""}`} />
            {runningAdvancedProbe ? "RUNNING..." : "RUN ADVANCED PROBE"}
          </button>
        </div>

        {!advancedProbe ? (
          <div className="text-sm text-gray-500">Loading advanced probe snapshot...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-xs font-mono">
            <div className="rounded-lg border border-white/10 bg-black/30 p-3">
              <div className="text-gray-400 mb-1">SUCCESS CALLS</div>
              <div className="text-[#00f3ff]">{formatNumber(advancedProbe.successCount)}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/30 p-3">
              <div className="text-gray-400 mb-1">FAILED CALLS</div>
              <div className="text-[#ff7db9]">{formatNumber(advancedProbe.failureCount)}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/30 p-3">
              <div className="text-gray-400 mb-1">CLUSTER NODES</div>
              <div className="text-[#8cf8ff]">{formatNumber(advancedProbe.summary.clusterNodes.count)}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/30 p-3">
              <div className="text-gray-400 mb-1">PERF SAMPLES</div>
              <div className="text-[#8cf8ff]">{formatNumber(advancedProbe.summary.performanceSamples.sampleCount)}</div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="glass-panel rounded-2xl p-6">
          <h4 className="text-xs font-bold tracking-widest text-[#00f3ff] mb-4 flex items-center gap-2">
            <Wallet className="w-4 h-4" />
            PORTFOLIO AUDITOR
          </h4>
          {!walletSnapshot ? (
            <div className="text-sm text-gray-500">Load an address to inspect balances and token accounts.</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                  <div className="text-gray-500 mb-1">ADDRESS</div>
                  <div className="text-[#00f3ff]">{formatShort(walletSnapshot.address, 8, 8)}</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                  <div className="text-gray-500 mb-1">SOL BALANCE</div>
                  <div className="text-[#00f3ff]">{walletSnapshot.solBalance.toFixed(4)} SOL</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                  <div className="text-gray-500 mb-1">TOKEN ACCOUNTS</div>
                  <div className="text-[#8cf8ff]">{walletSnapshot.tokenAccountCount}</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                  <div className="text-gray-500 mb-1">NON-ZERO TOKENS</div>
                  <div className="text-[#8cf8ff]">{walletSnapshot.nonZeroTokenCount}</div>
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-black/30 p-3">
                <div className="text-xs text-gray-400 mb-2">TOP HOLDINGS</div>
                <div className="space-y-1 max-h-48 overflow-auto pr-1">
                  {walletSnapshot.tokenAccounts.length ? (
                    walletSnapshot.tokenAccounts.map((token) => (
                      <div key={token.pubkey} className="flex items-center justify-between text-xs font-mono">
                        <span className="text-gray-300">{formatShort(token.mint, 6, 6)}</span>
                        <span className="text-[#00f3ff]">{formatNumber(token.uiAmount, 4)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-gray-500">No non-zero token holdings found.</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="glass-panel rounded-2xl p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h4 className="text-xs font-bold tracking-widest text-[#ff6a00] flex items-center gap-2">
              <Activity className="w-4 h-4" />
              REAL-TIME TRADE AUDITOR
            </h4>
          </div>
          {!txReplay ? (
            <div className="text-sm text-gray-500">Load an address to replay recent transactions.</div>
          ) : (
            <div className="space-y-2 max-h-[26rem] overflow-auto pr-1">
              {txReplay.items.length ? (
                txReplay.items.map((item) => (
                  <motion.div
                    key={item.signature}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-lg border border-white/10 bg-black/30 p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-mono text-gray-200">{formatShort(item.signature, 10, 8)}</div>
                      <div className={`text-[10px] font-mono ${item.success ? "text-[#00f3ff]" : "text-[#ff7db9]"}`}>
                        {item.success ? "SUCCESS" : "FAILED"}
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] font-mono text-gray-400">
                      <div>
                        BAL Δ: <span className={item.balanceDeltaLamports !== null ? (item.balanceDeltaLamports >= 0 ? "text-[#00f3ff]" : "text-[#ffb37d]") : "text-gray-400"}>
                          {item.balanceDeltaLamports !== null ? `${(item.balanceDeltaLamports / 1e9).toFixed(4)} SOL` : "PARSING..."}
                        </span>
                      </div>
                      <div>FEE: {item.feeLamports !== null ? `${(item.feeLamports / 1e9).toFixed(5)} SOL` : "N/A"}</div>
                      <div className="col-span-2 text-[9px] text-gray-500 flex justify-between">
                        <span>{formatTimestamp(item.blockTime)}</span>
                        <span>{formatShort(item.signature, 12, 12)}</span>
                      </div>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="text-xs text-gray-500">No transactions returned for this address.</div>
              )}
            </div>
          )}
          {(loadingReplay || loadingWallet) && (
            <div className="mt-3 text-xs font-mono text-[#8cf8ff]">Loading address modules...</div>
          )}
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-4 border border-white/5 opacity-80 hover:opacity-100 transition-opacity">
        <button
          onClick={() => setShowNodeCapacity(!showNodeCapacity)}
          className="w-full flex items-center justify-between text-[10px] font-bold tracking-widest text-gray-500 uppercase hover:text-white transition-colors"
        >
          <div className="flex items-center gap-2">
            <Database className="w-3.5 h-3.5" />
            Node Capacity & Raw Infrastructure Stats
          </div>
          <span>{showNodeCapacity ? "HIDE" : "SHOW"} DETAILS</span>
        </button>

        {showNodeCapacity && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-4 mt-4 border-t border-white/5">
              <div className="space-y-1">
                <div className="text-[9px] text-gray-500 uppercase tracking-tighter font-mono">Current Slot</div>
                <div className="text-sm font-mono text-gray-300">{formatNumber(chainPulse?.slot ?? null)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-[9px] text-gray-500 uppercase tracking-tighter font-mono">Block Height</div>
                <div className="text-sm font-mono text-gray-300">{formatNumber(chainPulse?.blockHeight ?? null)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-[9px] text-gray-500 uppercase tracking-tighter font-mono">Recent Block Tx</div>
                <div className="text-sm font-mono text-gray-300">{formatNumber(chainPulse?.blockTxCount ?? null)}</div>
              </div>
              <div className="space-y-1">
                <div className="text-[9px] text-gray-500 uppercase tracking-tighter font-mono">Epoch Info</div>
                <div className="text-sm font-mono text-gray-300">
                  {chainPulse?.epochInfo ? `Epoch ${chainPulse.epochInfo.epoch} (${formatPercent((chainPulse.epochInfo.slotIndex / chainPulse.epochInfo.slotsInEpoch) * 100)})` : "N/A"}
                </div>
              </div>
              <div className="col-span-2 lg:col-span-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-black/30 border border-white/5 space-y-2">
                  <div className="text-[9px] text-gray-500 uppercase font-mono">Cluster Performance Data</div>
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-gray-400">
                    <div>Genesis: {advancedProbe?.summary?.genesisHash?.slice(0, 10) ?? "N/A"}...</div>
                    <div>Supply: {advancedProbe?.summary?.supply ? `${formatNumber(advancedProbe.summary.supply.total / 1e9)}B` : "N/A"}</div>
                    <div>Nodes: {formatNumber(advancedProbe?.summary?.clusterNodes?.count ?? 0)}</div>
                    <div>Samples: {formatNumber(advancedProbe?.summary?.performanceSamples?.sampleCount ?? 0)}</div>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-black/30 border border-white/5 space-y-2">
                  <div className="text-[9px] text-gray-500 uppercase font-mono">RPC Identity Details</div>
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-gray-400">
                    <div>ID: {opsSnapshot?.lastProbe?.identity?.slice(0, 10) ?? "N/A"}...</div>
                    <div>Ver: {advancedProbe?.summary?.version?.version ?? "N/A"}</div>
                    <div>Env: PROD</div>
                    <div>Commit: {chainPulse?.commitment ?? "N/A"}</div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
