import React from "react";
import { motion } from "motion/react";
import { Server, Globe } from "lucide-react";
import { AnimatedCounter } from "./AnimatedCounter";
import { BlinkLatency, MetricsPayload } from "../types/backend";

interface LatencyMetricsProps {
  metrics: MetricsPayload;
  blinkLatency: BlinkLatency;
}

export function LatencyMetrics({ metrics, blinkLatency }: LatencyMetricsProps) {
  const rpcLatency = metrics.rpcLatency ?? 0;
  const confirmTime = blinkLatency.total || 0;
  const slotText = metrics.slot ? metrics.slot.toLocaleString() : "-";
  const nodeHealth = Math.max(70, Math.min(100, Number((100 - rpcLatency / 25).toFixed(1))));
  const mempoolCongestion = Math.max(
    5,
    Math.min(99, Math.round((blinkLatency.quoteLatency + blinkLatency.simulationLatency) / 20))
  );

  return (
    <div className="glass-panel rounded-2xl p-6 relative overflow-hidden group">
      <motion.div
        animate={{ opacity: [0.1, 0.2, 0.1], scale: [1, 1.05, 1] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -bottom-10 -right-10 w-40 h-40 bg-[#bc13fe]/20 rounded-full blur-3xl"
      />

      <h3 className="text-sm font-bold tracking-widest text-gray-400 mb-6 flex items-center gap-2 relative z-10">
        <Server className="w-4 h-4" />
        NETWORK TELEMETRY
      </h3>

      <div className="grid grid-cols-2 gap-4 mb-6 relative z-10">
        <motion.div
          whileHover={{ scale: 1.02, borderColor: "rgba(0,243,255,0.4)" }}
          className="bg-black/40 rounded-xl p-4 border border-[#00f3ff]/10 relative overflow-hidden transition-colors"
        >
          <div className="absolute top-0 left-0 w-1 h-full bg-[#00f3ff]" />
          <div className="text-xs text-gray-500 mb-1">RPC LATENCY</div>
          <div className="text-2xl font-mono text-white flex items-baseline gap-1">
            <AnimatedCounter value={rpcLatency} format={false} decimals={0} />
            <span className="text-sm text-[#00f3ff]">ms</span>
          </div>
        </motion.div>

        <motion.div
          whileHover={{ scale: 1.02, borderColor: "rgba(188,19,254,0.4)" }}
          className="bg-black/40 rounded-xl p-4 border border-[#bc13fe]/10 relative overflow-hidden transition-colors"
        >
          <div className="absolute top-0 left-0 w-1 h-full bg-[#bc13fe]" />
          <div className="text-xs text-gray-500 mb-1">BLINK TOTAL</div>
          <div className="text-2xl font-mono text-white flex items-baseline gap-1">
            <AnimatedCounter value={confirmTime} format={false} decimals={0} />
            <span className="text-sm text-[#bc13fe]">ms</span>
          </div>
        </motion.div>
      </div>

      <div className="space-y-4 relative z-10">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-400">NODE HEALTH</span>
            <span className="text-[#00f3ff] font-mono">{nodeHealth}%</span>
          </div>
          <div className="h-1.5 w-full bg-black/50 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-[#00f3ff] shadow-[0_0_10px_#00f3ff]"
              initial={{ width: 0 }}
              animate={{ width: `${nodeHealth}%` }}
              transition={{ duration: 1.5, delay: 0.2 }}
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-400">MEMPOOL CONGESTION</span>
            <span className="text-[#ff007f] font-mono">{mempoolCongestion}%</span>
          </div>
          <div className="h-1.5 w-full bg-black/50 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-[#ff007f] shadow-[0_0_10px_#ff007f]"
              initial={{ width: 0 }}
              animate={{ width: `${mempoolCongestion}%` }}
              transition={{ duration: 1.5, delay: 0.4 }}
            />
          </div>
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Globe className="w-3 h-3" />
          <span>{metrics.network.toUpperCase()}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-[#00f3ff]">SLOT {slotText}</span>
        </div>
      </div>
    </div>
  );
}
