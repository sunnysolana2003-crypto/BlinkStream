import React, { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle, Zap, X, Activity } from "lucide-react";
import { AnimatedCounter } from "./AnimatedCounter";
import { BlinkLatency } from "../types/backend";
import { openBlinkInWallet } from "../lib/wallet";

export interface SurgeAlertProps {
  token: string;
  percentChange: number;
  latency: BlinkLatency;
  blinkUrl: string;
  usdValue: number;
  displayName?: string;
  onClose: () => void;
}

function toBarWidth(value: number, max: number) {
  if (max <= 0) {
    return "5%";
  }

  const width = Math.max(5, Math.min(100, Math.round((value / max) * 100)));
  return `${width}%`;
}

export function SurgeAlert({ token, percentChange, latency, blinkUrl, usdValue, displayName, onClose }: SurgeAlertProps) {
  const [isGlitching, setIsGlitching] = useState(true);
  const canTrade = Boolean(blinkUrl);

  useEffect(() => {
    const timeout = setTimeout(() => setIsGlitching(false), 800);
    return () => clearTimeout(timeout);
  }, []);

  const absChange = Math.abs(percentChange);
  const maxLatency = useMemo(
    () => Math.max(latency.quoteLatency, latency.simulationLatency, latency.blinkLatency, latency.total),
    [latency]
  );

  return (
    <motion.div
      initial={{ x: "120%", opacity: 0, skewX: -10 }}
      animate={{ x: 0, opacity: 1, skewX: 0 }}
      exit={{ x: "120%", opacity: 0, skewX: 10 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className="fixed top-24 right-6 z-50 w-80 lg:w-96"
    >
      <motion.div
        animate={{
          boxShadow: [
            "0 0 10px rgba(255,106,0,0.3), inset 0 0 10px rgba(255,106,0,0.1)",
            "0 0 40px rgba(255,106,0,0.8), inset 0 0 20px rgba(255,106,0,0.4)",
            "0 0 10px rgba(255,106,0,0.3), inset 0 0 10px rgba(255,106,0,0.1)"
          ],
          borderColor: ["rgba(255,106,0,0.4)", "rgba(255,106,0,1)", "rgba(255,106,0,0.4)"]
        }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        className="relative bg-[#0B0F1A]/95 backdrop-blur-2xl border-2 rounded-2xl p-6 overflow-hidden"
      >
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] opacity-20 z-10" />

        <AnimatePresence>
          {isGlitching && (
            <motion.div
              initial={{ opacity: 0.8 }}
              animate={{ opacity: [0.8, 0, 0.5, 0], x: [-5, 5, -2, 2, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="absolute inset-0 bg-[#ff6a00]/20 mix-blend-overlay z-20 pointer-events-none"
            />
          )}
        </AnimatePresence>

        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white z-30 transition-colors">
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-4 relative z-20">
          <motion.div animate={{ opacity: [1, 0.5, 1] }} transition={{ duration: 0.8, repeat: Infinity }}>
            <AlertTriangle className="w-5 h-5 text-[#ff6a00]" />
          </motion.div>
          <span className="text-xs font-bold tracking-widest text-[#ff6a00] uppercase">Surge Detected</span>
        </div>

        <div className="flex justify-between items-end mb-4 relative z-20">
          <div>
            <div className="text-4xl font-black tracking-tighter text-white mb-1 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
              {displayName || token}
            </div>
            <div className="flex items-center gap-2 text-[#ff6a00]">
              <Activity className="w-4 h-4" />
              <span className="text-2xl font-mono font-bold">
                {percentChange >= 0 ? "+" : "-"}
                <AnimatedCounter value={absChange} format={true} decimals={2} />%
              </span>
            </div>
            <div className="text-xs text-gray-400 mt-1 font-mono">USD VALUE: ${usdValue.toLocaleString()}</div>
          </div>
        </div>

        <div className="bg-black/50 border border-[#ff6a00]/20 rounded-xl p-3 mb-6 relative z-20">
          <div className="flex justify-between items-center text-xs mb-2">
            <span className="text-gray-400">EXECUTION LATENCY</span>
            <span className="text-[#00f3ff] font-mono">{latency.total}ms</span>
          </div>

          {[
            { key: "Quote", value: latency.quoteLatency },
            { key: "Simulation", value: latency.simulationLatency },
            { key: "Blink", value: latency.blinkLatency },
            { key: "Total", value: latency.total }
          ].map((metric) => (
            <div key={metric.key} className="mb-2 last:mb-0">
              <div className="flex justify-between text-[10px] text-gray-500 mb-1 font-mono">
                <span>{metric.key.toUpperCase()}</span>
                <span>{metric.value}ms</span>
              </div>
              <div className="h-1 w-full bg-black/80 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: toBarWidth(metric.value, maxLatency) }}
                  transition={{ duration: 0.7 }}
                  className="h-full bg-[#00f3ff] shadow-[0_0_8px_#00f3ff]"
                />
              </div>
            </div>
          ))}
        </div>

        <motion.button
          type="button"
          onClick={(event) => {
            if (!canTrade) {
              event.preventDefault();
              return;
            }

            openBlinkInWallet(blinkUrl);
          }}
          whileHover={{ scale: 1.02, boxShadow: "0 0 30px rgba(255,106,0,0.6)" }}
          whileTap={{ scale: 0.98 }}
          className={`w-full py-4 rounded-xl text-black font-black tracking-widest transition-colors shadow-[0_0_20px_rgba(255,106,0,0.4)] relative overflow-hidden group flex items-center justify-center gap-2 z-20 ${canTrade ? "bg-[#ff6a00] hover:bg-white" : "bg-[#ff6a00]/50 cursor-not-allowed"
            }`}
        >
          <Zap className="w-5 h-5" />
          <span className="relative z-10">INSTANT TRADE</span>
          <div className="absolute inset-0 bg-white translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out z-0" />
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
