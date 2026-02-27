import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Shield, ShieldAlert, ShieldCheck, ShieldX, Search, Loader2, Users, Lock, Flame, BarChart2 } from "lucide-react";
import api from "../lib/api";

interface CheckResult {
    id: string;
    label: string;
    status: "SAFE" | "WARN" | "DANGER";
    detail: string;
    value?: unknown;
}

interface HolderEntry {
    address: string;
    uiAmount: number | null;
    pct: string;
}

interface RugCheckResult {
    mint: string;
    riskScore: number;
    risk: "LOW" | "MEDIUM" | "HIGH";
    checks: CheckResult[];
    topHolders: HolderEntry[];
    latencyMs: number;
    flags: Record<string, boolean>;
}

const STATUS_CONFIG = {
    SAFE: { color: "#00f3ff", bg: "rgba(0,243,255,0.1)", border: "rgba(0,243,255,0.3)", icon: ShieldCheck },
    WARN: { color: "#ff6a00", bg: "rgba(255,106,0,0.1)", border: "rgba(255,106,0,0.3)", icon: ShieldAlert },
    DANGER: { color: "#ff007f", bg: "rgba(255,0,127,0.1)", border: "rgba(255,0,127,0.3)", icon: ShieldX }
};

const RISK_COLOR = {
    LOW: "#00f3ff",
    MEDIUM: "#ff6a00",
    HIGH: "#ff007f"
};

const CHECK_ICONS: Record<string, React.ElementType> = {
    lpStatus: Flame,
    mintAuthority: Lock,
    freezeAuthority: Lock,
    metadata: ShieldAlert,
    tokenStandard: Shield,
    concentration: Users,
    supply: BarChart2
};

function RiskGauge({ score }: { score: number }) {
    const clamp = Math.min(100, Math.max(0, score));
    const color = clamp >= 70 ? "#ff007f" : clamp >= 40 ? "#ff6a00" : "#00f3ff";
    const circumference = 2 * Math.PI * 54;
    const offset = circumference - (clamp / 100) * circumference;

    return (
        <div className="relative flex items-center justify-center" style={{ width: 140, height: 140 }}>
            <svg width="140" height="140" viewBox="0 0 140 140">
                <circle cx="70" cy="70" r="54" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
                <circle
                    cx="70" cy="70" r="54"
                    fill="none"
                    stroke={color}
                    strokeWidth="10"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    style={{ transform: "rotate(-90deg)", transformOrigin: "70px 70px", transition: "stroke-dashoffset 0.8s ease, stroke 0.4s" }}
                    filter={`drop-shadow(0 0 6px ${color})`}
                />
            </svg>
            <div className="absolute flex flex-col items-center">
                <span className="text-3xl font-bold font-mono" style={{ color }}>{clamp}</span>
                <span className="text-[10px] font-mono text-gray-400 tracking-widest">RISK</span>
            </div>
        </div>
    );
}

function CheckCard({ check }: { check: CheckResult, key?: React.Key }) {
    const cfg = STATUS_CONFIG[check.status];
    const Icon = CHECK_ICONS[check.id] || Shield;
    const StatusIcon = cfg.icon;

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border p-4 flex gap-3"
            style={{ background: cfg.bg, borderColor: cfg.border }}
        >
            <Icon className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: cfg.color }} />
            <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold tracking-widest text-white/80">{check.label.toUpperCase()}</span>
                    <span className="flex items-center gap-1 text-[10px] font-bold tracking-widest px-2 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                        <StatusIcon className="w-3 h-3" />
                        {check.status}
                    </span>
                </div>
                <p className="text-xs font-mono text-gray-300 break-all">{check.detail}</p>
            </div>
        </motion.div>
    );
}

export function RugCheck() {
    const [mintInput, setMintInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<RugCheckResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function handleCheck() {
        const mint = mintInput.trim();
        if (!mint) return;

        setLoading(true);
        setError(null);
        setResult(null);

        try {
            const res = await api.get(`/rug-check?mint=${encodeURIComponent(mint)}`);
            setResult(res.data as RugCheckResult);
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error
                ?? (err as { message?: string })?.message
                ?? "Rug check failed";
            setError(msg);
        } finally {
            setLoading(false);
        }
    }

    const riskColor = result ? RISK_COLOR[result.risk] : "#00f3ff";

    return (
        <div className="flex flex-col gap-6 max-w-3xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-[#ff007f]/10 border border-[#ff007f]/30">
                    <Shield className="w-5 h-5 text-[#ff007f]" />
                </div>
                <div>
                    <h2 className="text-sm font-bold tracking-widest text-white">RUG CHECKER</h2>
                    <p className="text-[11px] text-gray-400 font-mono">Expert-grade on-chain analysis with loophole detection</p>
                </div>
            </div>

            {/* Features Description */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
                <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                    <div className="flex items-center gap-2 mb-2">
                        <Flame className="w-3.5 h-3.5 text-[#ff6a00]" />
                        <span className="text-[10px] font-bold text-gray-300 tracking-wider">LP LOCK & BURN</span>
                    </div>
                    <p className="text-[10px] text-gray-500 font-mono leading-relaxed">
                        Detects Raydium pools and verifies if liquidity is permanently burned (1111...) or locked. Prevents pull-exits.
                    </p>
                </div>
                <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                    <div className="flex items-center gap-2 mb-2">
                        <Search className="w-3.5 h-3.5 text-[#00f3ff]" />
                        <span className="text-[10px] font-bold text-gray-300 tracking-wider">METADATA MUTABILITY</span>
                    </div>
                    <p className="text-[10px] text-gray-500 font-mono leading-relaxed">
                        Checks if the creator can change the token's identity (Name/Symbol/URI) post-launch to mimic legitimate projects.
                    </p>
                </div>
                <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                    <div className="flex items-center gap-2 mb-2">
                        <Lock className="w-3.5 h-3.5 text-purple-400" />
                        <span className="text-[10px] font-bold text-gray-300 tracking-wider">TOKEN-2022 AUDIT</span>
                    </div>
                    <p className="text-[10px] text-gray-500 font-mono leading-relaxed">
                        Advanced scanning for "Permanent Delegate" and "Transfer Fee" loopholes that allow balance seizure or massive sell-taxes.
                    </p>
                </div>
                <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5">
                    <div className="flex items-center gap-2 mb-2">
                        <Users className="w-3.5 h-3.5 text-[#ff007f]" />
                        <span className="text-[10px] font-bold text-gray-300 tracking-wider">DEX-FILTERED WHALES</span>
                    </div>
                    <p className="text-[10px] text-gray-500 font-mono leading-relaxed">
                        Filters out DEX liquidity accounts from holder lists to reveal real whale concentration and dump risks.
                    </p>
                </div>
            </div>

            {/* Input */}
            <div className="glass-panel rounded-2xl p-5 flex flex-col gap-3">
                <label className="text-[11px] font-bold tracking-widest text-gray-400">TOKEN MINT ADDRESS</label>
                <div className="flex gap-3">
                    <input
                        value={mintInput}
                        onChange={(e) => setMintInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && void handleCheck()}
                        placeholder="e.g. DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"
                        className="flex-1 bg-black/60 border border-white/15 rounded-xl px-4 py-2.5 text-sm font-mono text-white outline-none focus:border-[#ff007f]/60 placeholder:text-gray-600"
                    />
                    <motion.button
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => void handleCheck()}
                        disabled={loading || !mintInput.trim()}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs tracking-widest bg-[#ff007f]/10 border border-[#ff007f]/40 text-[#ff7db9] hover:bg-[#ff007f]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        {loading ? "SCANNING..." : "SCAN"}
                    </motion.button>
                </div>

                {/* Quick presets */}
                <div className="flex flex-wrap gap-2">
                    {[
                        { label: "BONK", mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263" },
                        { label: "JUP", mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN" },
                        { label: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" }
                    ].map(({ label, mint }) => (
                        <button
                            key={label}
                            onClick={() => { setMintInput(mint); }}
                            className="px-3 py-1 rounded-lg text-[11px] font-mono border border-white/10 bg-black/30 text-gray-400 hover:text-white hover:border-white/30 transition-colors"
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Error */}
            <AnimatePresence>
                {error && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="rounded-xl border border-[#ff007f]/30 bg-[#ff007f]/10 px-4 py-3 text-sm font-mono text-[#ff7db9]"
                    >
                        {error}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Results */}
            <AnimatePresence>
                {result && (
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col gap-4"
                    >
                        {/* Score summary */}
                        <div className="glass-panel rounded-2xl p-6 flex flex-col sm:flex-row gap-6 items-center">
                            <RiskGauge score={result.riskScore} />
                            <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-3">
                                    <span className="text-2xl font-bold tracking-tight" style={{ color: riskColor }}>
                                        {result.risk} RISK
                                    </span>
                                    {result.risk === "HIGH" && <Flame className="w-5 h-5 text-[#ff007f]" />}
                                </div>
                                <p className="text-xs font-mono text-gray-400 max-w-xs">
                                    Score: <span className="font-bold text-white">{result.riskScore}/100</span>
                                    {" · "}Analysed in <span className="font-bold text-white">{result.latencyMs}ms</span>
                                </p>
                                <p className="text-[11px] font-mono break-all text-gray-500">{result.mint}</p>
                            </div>
                        </div>

                        {/* Individual checks */}
                        <div className="grid grid-cols-1 gap-3">
                            {result.checks.map((check) => (
                                <CheckCard key={check.id} check={check} />
                            ))}
                        </div>

                        {/* Top holders */}
                        {result.topHolders.length > 0 && (
                            <div className="glass-panel rounded-2xl p-5">
                                <div className="text-xs font-bold tracking-widest text-[#00f3ff] mb-3">TOP HOLDERS</div>
                                <div className="space-y-2">
                                    {result.topHolders.map((h, i) => (
                                        <div key={i} className="flex items-center gap-3">
                                            <span className="text-[10px] font-mono text-gray-500 w-4">{i + 1}</span>
                                            <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${Math.min(100, Number(h.pct))}%` }}
                                                    transition={{ duration: 0.6, delay: i * 0.05 }}
                                                    className="h-full rounded-full"
                                                    style={{ background: Number(h.pct) > 30 ? "#ff007f" : Number(h.pct) > 10 ? "#ff6a00" : "#00f3ff" }}
                                                />
                                            </div>
                                            <span className="text-[10px] font-mono text-gray-300 w-12 text-right">{h.pct}%</span>
                                            <span className="text-[10px] font-mono text-gray-600 hidden sm:block">{h.address.slice(0, 8)}…</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
