import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
    Activity,
    AlertCircle,
    ArrowUpRight,
    ExternalLink,
    Filter,
    Radio,
    RefreshCw,
    TrendingUp,
    Waves,
    Zap
} from "lucide-react";
import api from "../lib/api";
import socket from "../lib/socket";

// ─── Types ──────────────────────────────────────────────────────────────────
interface WhaleAlert {
    id: string;
    signature: string;
    slot: number;
    timestamp: number;
    direction: string;   // "🐋 MEGA" | "🔴 LARGE" | "🟠 BIG"
    symbol: string;
    mint: string;
    amount: number;
    usdValue: number;
    from: string;
    to: string;
    explorerUrl: string;
}

interface WhaleStats {
    detectedCount: number;
    uptimeSec: number;
    solThreshold: number;
    usdThreshold: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtUsd(v: number) {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
    return `$${v.toFixed(0)}`;
}
function fmtShort(s: string, l = 6, r = 4) {
    return s.length > l + r + 3 ? `${s.slice(0, l)}…${s.slice(-r)}` : s;
}
function fmtAge(ts: number) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
}

function tierColor(dir: string) {
    if (dir.includes("MEGA")) return { border: "border-purple-500/50", badge: "bg-purple-500/10 text-purple-300", dot: "bg-purple-400" };
    if (dir.includes("LARGE")) return { border: "border-red-500/40", badge: "bg-red-500/10 text-red-300", dot: "bg-red-400" };
    return { border: "border-orange-400/40", badge: "bg-orange-500/10 text-orange-300", dot: "bg-orange-400" };
}

// ─── Component ───────────────────────────────────────────────────────────────
export function WhaleStream() {
    const [alerts, setAlerts] = useState<WhaleAlert[]>([]);
    const [stats, setStats] = useState<WhaleStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [liveCount, setLiveCount] = useState(0);
    const [filterMin, setFilterMin] = useState(0); // filter by min USD
    const feedRef = useRef<HTMLDivElement>(null);

    const fetchHistory = useCallback(async () => {
        setLoading(true);
        try {
            const res = await api.get("/metrics/whale/history?limit=80");
            setAlerts(res.data.alerts || []);
            setStats(res.data.stats || null);
        } finally {
            setLoading(false);
        }
    }, []);

    // Subscribe to live WebSocket whale-alert events
    useEffect(() => {
        fetchHistory();

        const handleWhale = (alert: WhaleAlert) => {
            setLiveCount(c => c + 1);
            setAlerts(prev => {
                const next = [alert, ...prev];
                return next.slice(0, 200);
            });
            // scroll feed to top on new alert
            if (feedRef.current) feedRef.current.scrollTop = 0;
        };

        socket.on("whale-alert", handleWhale);
        return () => { socket.off("whale-alert", handleWhale); };
    }, [fetchHistory]);

    const filtered = filterMin > 0
        ? alerts.filter(a => a.usdValue >= filterMin)
        : alerts;

    return (
        <div className="flex flex-col gap-6 h-full">
            {/* ── Header ── */}
            <div className="glass-panel rounded-3xl p-6 bg-gradient-to-br from-purple-500/5 to-cyan-500/5">
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <div className="absolute inset-0 rounded-2xl bg-purple-500/30 blur-lg" />
                            <div className="relative p-3 rounded-2xl bg-purple-500/10 border border-purple-500/30">
                                <Waves className="w-5 h-5 text-purple-300" />
                            </div>
                        </div>
                        <div>
                            <h2 className="text-sm font-bold tracking-widest text-white">WHALE STREAM</h2>
                            <p className="text-[10px] text-gray-500 font-mono">ORBITFLARE GRPC — REAL-TIME LARGE MOVE DETECTION</p>
                        </div>
                    </div>

                    {/* Live badge */}
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-400/10 border border-green-400/20">
                            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                            <span className="text-[10px] font-bold text-green-400 tracking-widest">LIVE</span>
                        </div>
                        <button onClick={fetchHistory} className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all">
                            <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? "animate-spin" : ""}`} />
                        </button>
                    </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
                    {[
                        { label: "DETECTED THIS SESSION", value: stats?.detectedCount ?? 0, color: "text-purple-300" },
                        { label: "ALERTS TONIGHT (LIVE)", value: liveCount, color: "text-cyan-400" },
                        { label: "SOL THRESHOLD", value: `≥ ${stats?.solThreshold ?? 100} SOL`, color: "text-orange-400" },
                        { label: "USD THRESHOLD", value: fmtUsd(stats?.usdThreshold ?? 25000), color: "text-red-400" }
                    ].map(s => (
                        <div key={s.label} className="p-3 rounded-2xl bg-black/40 border border-white/5">
                            <div className="text-[9px] text-gray-500 font-bold uppercase tracking-tighter mb-1">{s.label}</div>
                            <div className={`text-base font-mono font-bold ${s.color}`}>{s.value}</div>
                        </div>
                    ))}
                </div>

                {/* Filter bar */}
                <div className="flex items-center gap-3 mt-4">
                    <Filter className="w-3.5 h-3.5 text-gray-500" />
                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">MIN USD:</span>
                    {[0, 25000, 50000, 100000, 250000].map(v => (
                        <button
                            key={v}
                            onClick={() => setFilterMin(v)}
                            className={`px-3 py-1 rounded-lg text-[10px] font-bold tracking-wider border transition-all ${filterMin === v
                                ? "bg-purple-500/20 border-purple-500/50 text-purple-300"
                                : "bg-white/5 border-white/10 text-gray-500 hover:text-white"
                                }`}
                        >
                            {v === 0 ? "ALL" : fmtUsd(v)}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Feed ── */}
            <div
                ref={feedRef}
                className="flex-1 overflow-y-auto space-y-2 pr-1"
                style={{ maxHeight: "calc(100vh - 340px)" }}
            >
                {filtered.length === 0 ? (
                    <div className="glass-panel rounded-3xl p-12 text-center flex flex-col items-center gap-4">
                        <Waves className="w-10 h-10 text-gray-700" />
                        <p className="text-xs font-mono text-gray-600 uppercase tracking-wider">
                            {loading ? "Loading whale history…" : "Waiting for whales…"}
                        </p>
                        <p className="text-[10px] text-gray-700">Alerts {">"} {fmtUsd(filterMin)} will appear here in real-time via gRPC stream</p>
                    </div>
                ) : (
                    <AnimatePresence initial={false}>
                        {filtered.map(alert => {
                            const tc = tierColor(alert.direction);
                            return (
                                <motion.div
                                    key={alert.id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                    className={`glass-panel rounded-2xl p-4 border ${tc.border} hover:brightness-110 transition-all`}
                                >
                                    <div className="flex items-center justify-between gap-3 flex-wrap">
                                        <div className="flex items-center gap-3">
                                            {/* Tier dot */}
                                            <div className={`w-2 h-2 rounded-full shadow-[0_0_12px] ${tc.dot}`} />

                                            {/* Direction badge */}
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${tc.badge} border border-current/20`}>
                                                {alert.direction}
                                            </span>

                                            {/* Symbol + Amount */}
                                            <div>
                                                <span className="text-sm font-mono font-bold text-white">{alert.amount.toLocaleString()} </span>
                                                <span className="text-sm font-mono font-bold text-cyan-400">{alert.symbol}</span>
                                                <span className="ml-2 text-[10px] font-mono text-gray-500">≈ {fmtUsd(alert.usdValue)}</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <span className="text-[10px] font-mono text-gray-600">{fmtAge(alert.timestamp)}</span>
                                            <a
                                                href={alert.explorerUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-500 hover:text-cyan-400 transition-colors"
                                            >
                                                <ExternalLink className="w-3.5 h-3.5" />
                                            </a>
                                        </div>
                                    </div>

                                    {/* Addresses */}
                                    <div className="flex items-center gap-4 mt-2 text-[10px] font-mono text-gray-600">
                                        <span>FROM <span className="text-gray-400">{fmtShort(alert.from)}</span></span>
                                        <ArrowUpRight className="w-3 h-3 text-purple-500" />
                                        <span>TO <span className="text-gray-400">{fmtShort(alert.to)}</span></span>
                                        <span className="ml-auto text-gray-700">SLOT {alert.slot}</span>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                )}
            </div>
        </div>
    );
}
