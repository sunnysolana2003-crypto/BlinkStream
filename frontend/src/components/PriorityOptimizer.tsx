import React, { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
    Activity,
    AlertTriangle,
    BarChart3,
    CheckCircle2,
    Cpu,
    RefreshCw,
    Rocket,
    Shield,
    TrendingUp,
    Zap
} from "lucide-react";
import api from "../lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────
interface FeeRec {
    priorityFeeLamports: number;
    jitoTipLamports: number;
    label: string;
    recommended: boolean;
}

interface Recommendations {
    safe: FeeRec;
    standard: FeeRec;
    turbo: FeeRec;
}

interface RpcFees {
    min: number;
    p25: number;
    median: number;
    p75: number;
    p90: number;
    max: number;
    sampleCount: number;
}

interface JitoTips {
    p25: number;
    p50: number;
    p75: number;
    p95: number;
}

interface Congestion {
    score: number;   // 0-100
    label: string;
}

interface FeeSnapshot {
    timestamp: number | null;
    rpcFees: RpcFees | null;
    jitoTips: JitoTips | null;
    congestion: Congestion;
    recommendations: Recommendations;
    totalPolls: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtL(v: number) {
    // Convert lamports to microlamports-style display
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
    return String(v);
}
function lamportsToSol(v: number) { return (v / 1e9).toFixed(6); }
function totalCost(rec: FeeRec) {
    return rec.priorityFeeLamports + rec.jitoTipLamports;
}

const CONGESTION_COLORS: Record<string, { bar: string; text: string; bg: string }> = {
    IDLE: { bar: "bg-green-400", text: "text-green-400", bg: "bg-green-400/10" },
    CALM: { bar: "bg-cyan-400", text: "text-cyan-400", bg: "bg-cyan-400/10" },
    ACTIVE: { bar: "bg-yellow-400", text: "text-yellow-400", bg: "bg-yellow-400/10" },
    BUSY: { bar: "bg-orange-400", text: "text-orange-400", bg: "bg-orange-400/10" },
    CONGESTED: { bar: "bg-red-500", text: "text-red-400", bg: "bg-red-500/10" },
    LOADING: { bar: "bg-gray-500", text: "text-gray-400", bg: "bg-gray-500/10" },
    UNKNOWN: { bar: "bg-gray-500", text: "text-gray-400", bg: "bg-gray-500/10" }
};

const TIER_CONFIG = [
    { key: "safe" as const, icon: Shield, label: "SAFE", color: "border-green-400/30  text-green-400", glow: "shadow-[0_0_24px_rgba(74,222,128,0.15)]" },
    { key: "standard" as const, icon: CheckCircle2, label: "STANDARD", color: "border-cyan-400/50  text-cyan-400", glow: "shadow-[0_0_24px_rgba(0,243,255,0.2)]" },
    { key: "turbo" as const, icon: Rocket, label: "TURBO ⚡", color: "border-purple-500/50 text-purple-300", glow: "shadow-[0_0_24px_rgba(168,85,247,0.25)]" }
] as const;

// ─── Component ───────────────────────────────────────────────────────────────
export function PriorityOptimizer() {
    const [snapshot, setSnapshot] = useState<FeeSnapshot | null>(null);
    const [loading, setLoading] = useState(false);
    const [lastRefreshed, setLastRefreshed] = useState<number | null>(null);

    const fetch = useCallback(async (force = false) => {
        setLoading(true);
        try {
            const url = force ? "/metrics/priority-fees?refresh=true" : "/metrics/priority-fees";
            const res = await api.get(url);
            setSnapshot(res.data);
            setLastRefreshed(Date.now());
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetch();
        const interval = setInterval(() => fetch(), 6000);
        return () => clearInterval(interval);
    }, [fetch]);

    const cong = snapshot?.congestion ?? { score: 50, label: "LOADING" };
    const theme = CONGESTION_COLORS[cong.label] ?? CONGESTION_COLORS.UNKNOWN;
    const rec = snapshot?.recommendations;

    return (
        <div className="flex flex-col gap-6">
            {/* ── Header card ── */}
            <div className={`glass-panel rounded-3xl p-6 border-[#00f3ff]/10 bg-gradient-to-br from-orange-500/5 to-purple-500/5`}>
                <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <div className="absolute inset-0 rounded-2xl bg-orange-500/30 blur-lg" />
                            <div className="relative p-3 rounded-2xl bg-orange-500/10 border border-orange-400/30">
                                <Zap className="w-5 h-5 text-orange-400" />
                            </div>
                        </div>
                        <div>
                            <h2 className="text-sm font-bold tracking-widest text-white">PRIORITY OPTIMIZER</h2>
                            <p className="text-[10px] text-gray-500 font-mono">REAL-TIME SOLANA FEE ANALYSIS + JITO TIP FLOOR</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-600 font-mono">
                            {lastRefreshed ? `Refreshed ${Math.round((Date.now() - lastRefreshed) / 1000)}s ago` : "Loading…"}
                        </span>
                        <button
                            onClick={() => fetch(true)}
                            className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
                        >
                            <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? "animate-spin" : ""}`} />
                        </button>
                    </div>
                </div>

                {/* ── Congestion Meter ── */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">NETWORK CONGESTION</span>
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold border border-current/30 ${theme.text} ${theme.bg}`}>
                            {cong.label}
                        </span>
                    </div>
                    <div className="h-3 w-full bg-black/40 rounded-full overflow-hidden border border-white/5">
                        <motion.div
                            className={`h-full ${theme.bar} rounded-full`}
                            initial={{ width: 0 }}
                            animate={{ width: `${cong.score}%` }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                        />
                    </div>
                    <div className="flex justify-between text-[9px] font-mono text-gray-600">
                        <span>IDLE</span><span>CALM</span><span>ACTIVE</span><span>BUSY</span><span>CONGESTED</span>
                    </div>
                </div>

                {/* ── Raw RPC percentiles ── */}
                {snapshot?.rpcFees && (
                    <div className="mt-5 grid grid-cols-5 gap-3 text-center">
                        {(["min", "p25", "median", "p75", "p90"] as const).map(k => (
                            <div key={k} className="p-3 rounded-2xl bg-black/40 border border-white/5">
                                <div className="text-[8px] text-gray-600 uppercase font-bold mb-1">
                                    {k === "median" ? "P50" : k.toUpperCase()}
                                </div>
                                <div className="text-xs font-mono font-bold text-white">
                                    {fmtL(snapshot.rpcFees![k])}
                                </div>
                                <div className="text-[8px] text-gray-700 font-mono">µL</div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Jito Tip Floor ── */}
            {snapshot?.jitoTips && (
                <div className="glass-panel rounded-3xl p-6 bg-gradient-to-br from-purple-500/5 to-transparent">
                    <h3 className="text-[10px] font-bold tracking-widest text-purple-400 mb-4 flex items-center gap-2">
                        <Rocket className="w-3.5 h-3.5" />
                        JITO TIP FLOOR (BLOCK ENGINE)
                    </h3>
                    <div className="grid grid-cols-4 gap-3">
                        {(["p25", "p50", "p75", "p95"] as const).map(k => (
                            <div key={k} className="p-4 rounded-2xl bg-black/40 border border-purple-500/10 text-center">
                                <div className="text-[9px] text-gray-500 uppercase font-bold mb-1">{k.toUpperCase()}</div>
                                <div className="text-sm font-mono font-bold text-purple-300">{fmtL(snapshot!.jitoTips![k])}</div>
                                <div className="text-[8px] text-gray-600 mt-1">lamports</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Tier Recommendations ── */}
            {rec && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {TIER_CONFIG.map(({ key, icon: Icon, label, color, glow }) => {
                        const r = rec[key];
                        const isRec = r.recommended;
                        return (
                            <div
                                key={key}
                                className={`glass-panel rounded-3xl p-6 border ${color.split(" ")[0]} ${glow} relative transition-all hover:brightness-110`}
                            >
                                {isRec && (
                                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-cyan-400/20 border border-cyan-400/30 text-[9px] font-bold text-cyan-400 tracking-widest">
                                        ★ RECOMMENDED
                                    </div>
                                )}
                                <div className="flex items-center gap-2 mb-4">
                                    <Icon className={`w-4 h-4 ${color.split(" ")[1]}`} />
                                    <h4 className={`text-xs font-bold tracking-widest ${color.split(" ")[1]}`}>{label}</h4>
                                </div>

                                <div className="space-y-3">
                                    <div>
                                        <div className="text-[9px] text-gray-500 uppercase font-bold mb-1">Priority Fee</div>
                                        <div className="text-lg font-mono font-bold text-white">{fmtL(r.priorityFeeLamports)} <span className="text-xs text-gray-500">µL</span></div>
                                    </div>
                                    {r.jitoTipLamports > 0 && (
                                        <div>
                                            <div className="text-[9px] text-gray-500 uppercase font-bold mb-1">Jito Tip</div>
                                            <div className="text-base font-mono font-bold text-purple-300">{fmtL(r.jitoTipLamports)} <span className="text-xs text-gray-600">µL</span></div>
                                        </div>
                                    )}
                                    <div className="pt-3 border-t border-white/5">
                                        <div className="text-[9px] text-gray-500 uppercase font-bold mb-1">Total Cost</div>
                                        <div className="text-xs font-mono text-gray-300">{lamportsToSol(totalCost(r))} SOL</div>
                                    </div>
                                </div>

                                <p className="mt-4 text-[10px] text-gray-600 font-mono leading-relaxed">{r.label}</p>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="text-[10px] text-gray-700 font-mono text-center">
                Polls `getRecentPrioritizationFees` via OrbitFlare RPC + Jito Bundle API · {snapshot?.totalPolls ?? 0} total polls
            </div>
        </div>
    );
}
