import React, { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Activity,
  BarChart3,
  Cpu,
  Database,
  FlaskConical,
  Gauge,
  Layers,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Settings,
  TrendingUp,
  Wallet,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  History,
  Info,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  Clock,
  Waves,
  Flame,
} from "lucide-react";
import api from "../lib/api";
import { WhaleStream } from "./WhaleStream";
import { PriorityOptimizer } from "./PriorityOptimizer";
import {
  BackendEvent,
  BlinkLatency,
  OrbitflareAdvancedProbe,
  OrbitflareChainPulse,
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
  connectedWallet: string | null;
}

interface PortfolioItem {
  mint: string;
  symbol: string;
  name: string;
  balance: number;
  price: number;
  usdValue: number;
  isNative: boolean;
}

interface PortfolioData {
  address: string;
  portfolio: PortfolioItem[];
  totalUsdValue: number;
  timestamp: number;
}

interface TxInspectResult {
  signature: string;
  slot: number;
  timestamp: number;
  fee: number;
  status: "SUCCESS" | "FAILED";
  platform: string;
  changes: Array<{
    mint: string;
    symbol: string;
    amount: number;
    type: "SENT" | "RECEIVED";
  }>;
}

function formatNumber(value: number | null, fractionDigits = 0) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "N/A";
  return value.toLocaleString(undefined, { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits });
}

function formatShort(value: string, left = 6, right = 4) {
  if (value.length <= left + right + 3) return value;
  return `${value.slice(0, left)}...${value.slice(-right)}`;
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
  events,
  connectedWallet
}: OrbitflareExplorerProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "portfolio" | "whalestream" | "priorityfees" | "inspector" | "settings">("overview");
  const [chainPulse, setChainPulse] = useState<OrbitflareChainPulse | null>(null);
  const [loadingChain, setLoadingChain] = useState(false);

  // Portfolio state
  const [portfolioData, setPortfolioData] = useState<PortfolioData | null>(null);
  const [loadingPnL, setLoadingPnL] = useState(false);

  // Inspector state
  const [txInput, setTxInput] = useState("");
  const [inspectedTx, setInspectedTx] = useState<TxInspectResult | null>(null);
  const [loadingInspect, setLoadingInspect] = useState(false);

  const refreshChainPulse = useCallback(async () => {
    setLoadingChain(true);
    try {
      const res = await api.get("/metrics/orbitflare/chain-pulse");
      setChainPulse(res.data);
    } catch (error) {
      onApiError(error);
    } finally {
      setLoadingChain(false);
    }
  }, [onApiError]);

  const fetchPortfolio = useCallback(async () => {
    if (!connectedWallet) return;
    setLoadingPnL(true);
    try {
      const res = await api.get(`/metrics/wallet/pnl?address=${connectedWallet}`);
      setPortfolioData(res.data);
    } catch (error) {
      onApiError(error);
    } finally {
      setLoadingPnL(false);
    }
  }, [connectedWallet, onApiError]);

  const handleInspect = async () => {
    const sig = txInput.trim();
    if (!sig) return;
    setLoadingInspect(true);
    try {
      const res = await api.get(`/metrics/tx/inspect?signature=${sig}`);
      setInspectedTx(res.data);
    } catch (error) {
      onApiError(error);
    } finally {
      setLoadingInspect(false);
    }
  };

  useEffect(() => {
    refreshChainPulse();
    const interval = setInterval(refreshChainPulse, 10000);
    return () => clearInterval(interval);
  }, [refreshChainPulse]);

  useEffect(() => {
    if (activeTab === "portfolio") fetchPortfolio();
  }, [activeTab, fetchPortfolio]);

  return (
    <div className="flex flex-col gap-6 max-w-6xl mx-auto">
      {/* Header & Hero Stats */}
      <div className="glass-panel rounded-3xl p-6 border-[#00f3ff]/20">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-[#00f3ff]/10 border border-[#00f3ff]/30">
              <Zap className="w-5 h-5 text-[#00f3ff]" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-widest text-white">TRADER HUB</h2>
              <p className="text-[10px] text-gray-500 font-mono">POWERED BY ORBITFLARE HIGH-FIDELITY RPC</p>
            </div>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 no-scrollbar">
            {["overview", "portfolio", "whalestream", "priorityfees", "inspector", "settings"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`px-4 py-2 rounded-xl text-[10px] font-bold tracking-widest transition-all whitespace-nowrap ${activeTab === tab
                  ? "bg-[#00f3ff]/10 border border-[#00f3ff]/40 text-[#00f3ff]"
                  : "bg-white/5 border border-white/5 text-gray-400 hover:text-white"
                  }`}
              >
                {tab.replace("-", " ").toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-black/40 border border-white/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] text-gray-500 font-bold uppercase tracking-tighter">Network TPS</span>
              <Gauge className="w-3.5 h-3.5 text-[#bc13fe]" />
            </div>
            <div className="text-xl font-mono font-bold text-white tracking-tight">
              {formatNumber(chainPulse?.blockTxCount ? chainPulse.blockTxCount / 30 : 2500)} <span className="text-xs text-gray-400">TPS</span>
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-black/40 border border-white/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] text-gray-500 font-bold uppercase tracking-tighter">Median Fee</span>
              <TrendingUp className="w-3.5 h-3.5 text-[#ff6a00]" />
            </div>
            <div className="text-xl font-mono font-bold text-white tracking-tight">
              {formatNumber(chainPulse?.prioritizationFees?.median ?? 4500)} <span className="text-xs text-gray-400">L</span>
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-black/40 border border-white/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] text-gray-500 font-bold uppercase tracking-tighter">Blink Latency</span>
              <Cpu className="w-3.5 h-3.5 text-[#00f3ff]" />
            </div>
            <div className="text-xl font-mono font-bold text-white tracking-tight text-cyan-400">
              {latestLatency.total.toFixed(0)} <span className="text-xs text-gray-400">ms</span>
            </div>
          </div>
          <div className="p-4 rounded-2xl bg-black/40 border border-white/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] text-gray-500 font-bold uppercase tracking-tighter">Fidelity Tier</span>
              <ShieldCheck className="w-3.5 h-3.5 text-[#00f3ff]" />
            </div>
            <div className="text-xl font-mono font-bold text-white tracking-tight">TIER A+</div>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {/* OVERVIEW TAB */}
        {activeTab === "overview" && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-6"
          >
            <div className="glass-panel rounded-3xl p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xs font-bold tracking-widest text-[#bc13fe] flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  AUTONOMOUS WATCHLIST
                </h3>
                <div className="px-3 py-1 rounded-full bg-[#bc13fe]/10 border border-[#bc13fe]/20 text-[10px] font-bold text-[#bc13fe]">
                  {supportedTokens.length} ASSETS TRACKED
                </div>
              </div>

              <div className="relative mb-6">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  disabled={addingWatchToken}
                  placeholder="Scan new token symbol or mint address..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onRegisterAutonomousToken(e.currentTarget.value);
                      e.currentTarget.value = "";
                    }
                  }}
                  className="w-full bg-black/40 border border-white/10 rounded-2xl pl-12 pr-4 py-3 text-sm font-mono text-white outline-none focus:border-[#bc13fe]/50 transition-all"
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {supportedTokens.map(token => (
                  <motion.div
                    key={token}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-4 rounded-2xl bg-white/5 border border-white/5 flex flex-col items-center gap-2 hover:bg-white/10 transition-all cursor-pointer group"
                  >
                    <div className="w-10 h-10 rounded-full bg-black/40 border border-white/10 flex items-center justify-center font-bold text-xs text-white group-hover:text-[#bc13fe]">
                      {token[0]}
                    </div>
                    <span className="text-[10px] font-mono font-bold text-gray-300 uppercase tracking-widest">{token}</span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.6)]" />
                      <span className="text-[8px] font-bold text-green-400/70">ACTIVE</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* PORTFOLIO TAB */}
        {activeTab === "portfolio" && (
          <motion.div
            key="portfolio"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-6"
          >
            {!connectedWallet ? (
              <div className="glass-panel rounded-3xl p-12 text-center flex flex-col items-center gap-4">
                <Wallet className="w-12 h-12 text-gray-600" />
                <p className="text-sm font-mono text-gray-500">Connect your wallet to track portfolio performance and P&L.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="glass-panel rounded-3xl p-6 bg-gradient-to-br from-[#00f3ff]/5 to-transparent">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Total Valuation</p>
                      <h4 className="text-4xl font-mono font-bold text-white">
                        ${loadingPnL ? "..." : formatNumber(portfolioData?.totalUsdValue ?? 0, 2)}
                      </h4>
                    </div>
                    <button
                      onClick={fetchPortfolio}
                      className="p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                    >
                      <RefreshCw className={`w-5 h-5 text-gray-400 ${loadingPnL ? "animate-spin" : ""}`} />
                    </button>
                  </div>
                </div>

                <div className="glass-panel rounded-3xl overflow-hidden border-white/5 shadow-2xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white/5 text-[10px] font-bold tracking-widest text-gray-400 uppercase">
                        <th className="px-6 py-4">Asset</th>
                        <th className="px-6 py-4">Balance</th>
                        <th className="px-6 py-4">Price</th>
                        <th className="px-6 py-4">Value</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm font-mono divide-y divide-white/5">
                      {portfolioData?.portfolio.map((item) => (
                        <tr key={item.mint} className="hover:bg-white/[0.02] transition-colors group">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-black/40 border border-white/10 flex items-center justify-center font-bold text-[10px] text-cyan-400">
                                {item.symbol[0]}
                              </div>
                              <div>
                                <div className="text-white font-bold">{item.symbol}</div>
                                <div className="text-[10px] text-gray-600">{item.name}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-gray-300">
                            {formatNumber(item.balance, 4)}
                          </td>
                          <td className="px-6 py-4 text-gray-400">
                            ${formatNumber(item.price, 2)}
                          </td>
                          <td className="px-6 py-4 text-[#00f3ff] font-bold">
                            ${formatNumber(item.usdValue, 2)}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <a
                              href={`https://solscan.io/token/${item.mint}`}
                              target="_blank"
                              className="p-2 inline-block opacity-0 group-hover:opacity-100 text-gray-500 hover:text-cyan-400 transition-all"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* WHALE STREAM TAB */}
        {activeTab === "whalestream" && (
          <motion.div
            key="whalestream"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="flex-1 min-h-[600px]"
          >
            <WhaleStream />
          </motion.div>
        )}

        {/* PRIORITY FEES TAB */}
        {activeTab === "priorityfees" && (
          <motion.div
            key="priorityfees"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="flex-1 min-h-[600px]"
          >
            <PriorityOptimizer />
          </motion.div>
        )}

        {/* INSPECTOR TAB */}
        {activeTab === "inspector" && (
          <motion.div
            key="inspector"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col gap-6"
          >
            <div className="glass-panel rounded-3xl p-6">
              <h3 className="text-xs font-bold tracking-widest text-[#ff6a00] mb-4 flex items-center gap-2">
                <Search className="w-4 h-4" />
                TRANSACTION DECODER
              </h3>
              <div className="flex gap-3">
                <input
                  value={txInput}
                  onChange={(e) => setTxInput(e.target.value)}
                  placeholder="Paste transaction signature..."
                  className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-white outline-none focus:border-[#ff6a00]/50"
                />
                <button
                  onClick={handleInspect}
                  disabled={loadingInspect || !txInput.trim()}
                  className="px-6 py-3 rounded-xl bg-[#ff6a00]/10 border border-[#ff6a00]/40 text-[#ffb37d] font-bold text-xs tracking-widest hover:bg-[#ff6a00]/20 transition-all disabled:opacity-50"
                >
                  {loadingInspect ? "DECODING..." : "INSPECT"}
                </button>
              </div>
            </div>

            {inspectedTx && (
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="grid grid-cols-1 lg:grid-cols-3 gap-6"
              >
                <div className="lg:col-span-1 glass-panel rounded-3xl p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Status</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${inspectedTx.status === "SUCCESS" ? "bg-green-400/10 text-green-400 border border-green-400/20" : "bg-red-400/10 text-red-400 border border-red-400/20"}`}>
                      {inspectedTx.status}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest block mb-1">Platform</span>
                    <div className="text-xl font-bold text-white flex items-center gap-2">
                      <Cpu className="w-5 h-5 text-purple-400" />
                      {inspectedTx.platform}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5 text-[10px] font-mono">
                    <div>
                      <span className="text-gray-500 block">FEE</span>
                      <span className="text-gray-200">{inspectedTx.fee.toFixed(6)} SOL</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">SLOT</span>
                      <span className="text-gray-200">{inspectedTx.slot}</span>
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-2 glass-panel rounded-3xl p-6">
                  <h4 className="text-[10px] font-bold tracking-widest text-[#00f3ff] mb-4 uppercase">Token Balance Changes</h4>
                  <div className="space-y-3">
                    {inspectedTx.changes.map((change, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                        <div className="flex items-center gap-3">
                          <div className={`p-1.5 rounded-lg ${change.type === 'RECEIVED' ? 'bg-green-400/10 text-green-400' : 'bg-red-400/10 text-red-400'}`}>
                            {change.type === 'RECEIVED' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                          </div>
                          <span className="text-xs font-mono font-bold text-white uppercase">{change.symbol}</span>
                        </div>
                        <div className={`text-sm font-mono font-bold ${change.type === 'RECEIVED' ? 'text-green-400' : 'text-red-400'}`}>
                          {change.type === 'RECEIVED' ? '+' : '-'}{formatNumber(Math.abs(change.amount), 4)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === "settings" && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-6"
          >
            <div className="glass-panel rounded-3xl p-6">
              <h3 className="text-xs font-bold tracking-widest text-[#00f3ff] mb-4 flex items-center gap-2">
                <Settings className="w-4 h-4" />
                SURGE SENSITIVITY
              </h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1.5">Threshold %</label>
                    <input
                      type="number"
                      value={surgeThresholdInput}
                      onChange={(e) => setSurgeThresholdInput(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-mono text-white outline-none focus:border-[#00f3ff]/50"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1.5">Cooldown (ms)</label>
                    <input
                      type="number"
                      value={surgeCooldownInput}
                      onChange={(e) => setSurgeCooldownInput(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-mono text-white outline-none focus:border-[#00f3ff]/50"
                    />
                  </div>
                </div>
                <button
                  onClick={onSaveSurgeSettings}
                  disabled={savingSurgeSettings}
                  className="w-full py-3 rounded-2xl bg-[#00f3ff]/10 border border-[#00f3ff]/40 text-cyan-400 font-bold text-xs tracking-widest hover:bg-[#00f3ff]/20 transition-all uppercase"
                >
                  {savingSurgeSettings ? "Saving..." : "Apply Config"}
                </button>
              </div>
            </div>

            <div className="glass-panel rounded-3xl p-6 bg-black/40">
              <h3 className="text-xs font-bold tracking-widest text-gray-400 mb-4 flex items-center gap-2">
                <Database className="w-4 h-4" />
                INFRASTRUCTURE STATUS
              </h3>
              <div className="space-y-3 font-mono text-[10px]">
                <div className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-gray-500">PROVIDER</span>
                  <span className="text-white font-bold">ORBITFLARE HIGH-SPEED</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-gray-500">SUBSCRIPTION</span>
                  <span className="text-green-400 font-bold">ACTIVE (GRPC)</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-gray-500">CURRENT SLOT</span>
                  <span className="text-white">{formatNumber(chainPulse?.slot ?? 0)}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-500">MODE</span>
                  <span className="text-orange-400 font-bold">{isDemoMode ? "SIMULATION" : "LIVE CHAIN"}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
