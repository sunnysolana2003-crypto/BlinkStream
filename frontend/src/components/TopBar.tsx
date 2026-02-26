import React from "react";
import { motion } from "motion/react";
import { Wifi, RotateCcw, Cpu, Clock, Presentation } from "lucide-react";
import { AnimatedCounter } from "./AnimatedCounter";

interface TopBarProps {
  rpcLatency: number | null;
  network: string;
  isDemoMode: boolean;
  judgeMode: boolean;
  signalCount: number;
  onToggleJudgeMode: () => void;
  onResetView: () => void;
}

export function TopBar({
  rpcLatency,
  network,
  isDemoMode,
  judgeMode,
  signalCount,
  onToggleJudgeMode,
  onResetView
}: TopBarProps) {
  const latency = rpcLatency ?? 0;

  return (
    <header className="h-16 glass-panel border-b border-t-0 border-l-0 border-r-0 flex items-center justify-between px-6 z-20">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-[#ff007f] rounded-full shadow-[0_0_8px_#ff007f] animate-pulse" />
          <span className="text-xs font-mono text-[#ff007f] tracking-widest">LIVE</span>
        </div>
        <div className="h-4 w-px bg-white/10" />
        <div className="flex items-center gap-2 text-gray-400">
          <Clock className="w-4 h-4" />
          <span className="text-sm font-mono">{network.toUpperCase()}</span>
        </div>
        {isDemoMode && (
          <span className="px-2 py-1 rounded bg-[#ff6a00]/20 border border-[#ff6a00]/50 text-xs font-bold text-[#ff6a00]">
            DEMO
          </span>
        )}
      </div>

      <div className="flex items-center gap-6">
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.98 }}
          onClick={onToggleJudgeMode}
          className={`px-3 py-2 rounded-xl border text-xs font-bold tracking-widest transition-colors flex items-center gap-2 ${
            judgeMode
              ? "bg-[#00f3ff]/20 border-[#00f3ff]/50 text-[#00f3ff]"
              : "bg-black/40 border-white/10 text-gray-300 hover:text-white hover:border-white/30"
          }`}
        >
          <Presentation className="w-4 h-4" />
          {judgeMode ? "TRADING VIEW" : "JUDGE MODE"}
        </motion.button>

        <motion.div
          animate={{
            boxShadow: ["0 0 0px rgba(0,243,255,0)", "0 0 15px rgba(0,243,255,0.3)", "0 0 0px rgba(0,243,255,0)"]
          }}
          transition={{ duration: 2, repeat: Infinity }}
          className="flex items-center gap-3 px-4 py-1.5 rounded-full bg-black/40 border border-[#00f3ff]/20"
        >
          <Cpu className="w-4 h-4 text-[#00f3ff]" />
          <span className="text-sm font-mono text-[#00f3ff]">
            SIGNALS: <AnimatedCounter value={signalCount} format={true} decimals={0} />
          </span>
        </motion.div>

        <motion.div
          animate={{
            boxShadow: ["0 0 0px rgba(188,19,254,0)", "0 0 15px rgba(188,19,254,0.3)", "0 0 0px rgba(188,19,254,0)"]
          }}
          transition={{ duration: 2, repeat: Infinity, delay: 1 }}
          className="flex items-center gap-3 px-4 py-1.5 rounded-full bg-black/40 border border-[#bc13fe]/20"
        >
          <Wifi className="w-4 h-4 text-[#bc13fe]" />
          <span className="text-sm font-mono text-[#bc13fe]">
            LATENCY: <AnimatedCounter value={latency} suffix="ms" format={false} decimals={0} />
          </span>
        </motion.div>

        <button
          onClick={onResetView}
          className="p-2 rounded-full bg-[#ff007f]/10 border border-[#ff007f]/30 text-[#ff007f] hover:bg-[#ff007f]/20 transition-colors relative group"
          title="Reset view"
        >
          <RotateCcw className="w-5 h-5" />
          <div className="absolute inset-0 rounded-full shadow-[0_0_15px_#ff007f] opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      </div>
    </header>
  );
}
