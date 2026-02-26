import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Activity, ArrowRight, Zap } from "lucide-react";
import { BackendEvent } from "../types/backend";
import { openBlinkInWallet } from "../lib/wallet";
import { getTokenDisplayName } from "../lib/tokenNames";

interface EventStreamProps {
  events: BackendEvent[];
  onSimSurge: () => Promise<void>;
  isDemoMode: boolean;
  tokenDisplayNames?: Record<string, string>;
}

function getTypeColor(type: BackendEvent["type"]) {
  switch (type) {
    case "SURGE":
      return "text-[#ff6a00] border-[#ff6a00]/30 bg-[#ff6a00]/10";
    case "LARGE_SWAP":
      return "text-[#00f3ff] border-[#00f3ff]/30 bg-[#00f3ff]/10";
    default:
      return "text-white border-white/30 bg-white/10";
  }
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(value || 0);
}

function formatTimestamp(timestamp: number) {
  const raw = Number(timestamp || Date.now());
  const normalized = raw < 1_000_000_000_000 ? raw * 1000 : raw;

  return new Date(normalized).toLocaleTimeString();
}

export function EventStream({ events, onSimSurge, isDemoMode, tokenDisplayNames = {} }: EventStreamProps) {
  function openBlink(url: string) {
    if (!url) {
      return;
    }

    openBlinkInWallet(url);
  }

  return (
    <div className="glass-panel rounded-2xl p-5 h-full flex flex-col relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#00f3ff] via-[#bc13fe] to-[#ff007f]" />

      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-bold tracking-widest text-white flex items-center gap-2">
          <Activity className="w-4 h-4 text-[#ff007f] animate-pulse" />
          LIVE SURGE STREAM
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void onSimSurge()}
            disabled={!isDemoMode}
            className="px-2 py-1 rounded bg-[#ff6a00]/20 border border-[#ff6a00]/50 text-xs font-bold text-[#ff6a00] hover:bg-[#ff6a00]/40 transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
            title={isDemoMode ? "Trigger deterministic demo surge" : "Available only in DEMO mode"}
          >
            <Zap className="w-3 h-3" />
            SIM SURGE
          </button>
          <div className="px-2 py-1 rounded bg-black/50 border border-white/10 text-xs font-mono text-gray-400">
            MODE: {isDemoMode ? "DEMO" : "LIVE"}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-4 bg-gradient-to-b from-[rgba(11,15,26,0.9)] to-transparent z-10 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-full h-12 bg-gradient-to-t from-[rgba(11,15,26,0.9)] to-transparent z-10 pointer-events-none" />

        <div className="flex flex-col gap-3 h-full overflow-y-auto pb-12 pr-2">
          {events.length === 0 && (
            <div className="text-xs font-mono text-gray-500 border border-white/10 rounded-xl p-4 bg-black/30">
              Waiting for backend stream events...
            </div>
          )}

          <AnimatePresence initial={false}>
            {events.map((event, index) => (
              <motion.div
                key={`${event.type}-${event.slot}-${event.timestamp}-${index}`}
                initial={{ opacity: 0, x: 20, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                whileHover={{ scale: 1.02, boxShadow: "0 0 15px rgba(255,255,255,0.1)" }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                onClick={() => openBlink(event.blink?.blinkUrl || "")}
                className={`bg-black/40 border border-white/5 rounded-xl p-3 hover:border-white/20 transition-colors group relative ${event.blink?.blinkUrl ? "cursor-pointer" : "cursor-default"
                  }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded border ${getTypeColor(event.type)}`}>
                    {event.type}
                  </span>
                  <span className="text-xs font-mono text-gray-500">{formatTimestamp(event.timestamp)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-lg">{formatUsd(event.usdValue)}</span>
                    <span className="text-sm text-gray-400">{tokenDisplayNames[event.token] || getTokenDisplayName(event.token)}</span>
                  </div>
                  <div className="flex items-center text-xs font-mono text-gray-600 group-hover:text-[#00f3ff] transition-colors">
                    SLOT {event.slot}
                    <ArrowRight className="w-3 h-3 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
