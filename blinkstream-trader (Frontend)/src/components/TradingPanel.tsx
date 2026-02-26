import React, { useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { BlinkForm } from "./BlinkForm";
import { LatencyMetrics } from "./LatencyMetrics";
import { AnimatedCounter } from "./AnimatedCounter";
import { BlinkLatency, GenerateBlinkInput, MetricsPayload } from "../types/backend";
import { getTokenDisplayName } from "../lib/tokenNames";

const TIMEFRAMES = ["1m", "5m", "15m", "1H", "4H"];
const TIMEFRAME_TO_WINDOW_MS: Record<string, number> = {
  "1m": 60 * 1000,
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "1H": 60 * 60 * 1000,
  "4H": 4 * 60 * 60 * 1000
};
const DEFAULT_BAR_COUNT = 40;

interface PricePoint {
  timestamp: number;
  price: number;
}

function getTimeframeWindowMs(timeframe: string) {
  return TIMEFRAME_TO_WINDOW_MS[timeframe] || TIMEFRAME_TO_WINDOW_MS["5m"];
}

function getWindowPrices(priceHistory: PricePoint[], timeframe: string) {
  const windowMs = getTimeframeWindowMs(timeframe);
  const now = Date.now();
  const recent = priceHistory.filter(
    (point) =>
      Number.isFinite(point.price) &&
      point.price > 0 &&
      Number.isFinite(point.timestamp) &&
      now - point.timestamp <= windowMs
  );

  if (recent.length >= 2) {
    return recent;
  }

  return priceHistory
    .filter((point) => Number.isFinite(point.price) && point.price > 0 && Number.isFinite(point.timestamp))
    .slice(-Math.max(DEFAULT_BAR_COUNT, 2));
}

function sampleSeries(points: PricePoint[], count = DEFAULT_BAR_COUNT) {
  if (!points.length) {
    return [];
  }

  const sampled: number[] = [];

  for (let index = 0; index < count; index += 1) {
    const ratio = count <= 1 ? 1 : index / (count - 1);
    const pointIndex = Math.round(ratio * (points.length - 1));
    sampled.push(points[pointIndex].price);
  }

  return sampled;
}

function buildPriceBars(priceHistory: PricePoint[], timeframe: string) {
  const windowPrices = getWindowPrices(priceHistory, timeframe);
  const sampled = sampleSeries(windowPrices);

  if (!sampled.length) {
    return Array.from({ length: DEFAULT_BAR_COUNT }, () => ({ height: 50, isUp: true }));
  }

  const minPrice = Math.min(...sampled);
  const maxPrice = Math.max(...sampled);
  const range = Math.max(maxPrice - minPrice, 0.000001);

  return sampled.map((value, index) => {
    const normalized = (value - minPrice) / range;
    const height = Math.round(22 + normalized * 73);
    const previous = index > 0 ? sampled[index - 1] : value;

    return {
      height,
      isUp: value >= previous
    };
  });
}

function calculateChangePercent(priceHistory: PricePoint[], timeframe: string) {
  const windowPrices = getWindowPrices(priceHistory, timeframe);
  if (windowPrices.length < 2) {
    return 0;
  }

  const first = windowPrices[0].price;
  const last = windowPrices[windowPrices.length - 1].price;

  if (!Number.isFinite(first) || first <= 0 || !Number.isFinite(last)) {
    return 0;
  }

  return ((last - first) / first) * 100;
}

interface TradingPanelProps {
  token: string;
  supportedTokens: string[];
  tokenDisplayNames: Record<string, string>;
  onTokenChange: (token: string) => void;
  onAddWatchToken: (token: string) => void | Promise<void>;
  addingWatchToken: boolean;
  price: number;
  priceHistory: PricePoint[];
  metrics: MetricsPayload;
  blinkUrl: string;
  blinkLatency: BlinkLatency;
  generatingBlink: boolean;
  onGenerateBlink: (input: GenerateBlinkInput) => Promise<string | null>;
}

export function TradingPanel({
  token,
  supportedTokens,
  tokenDisplayNames,
  onTokenChange,
  onAddWatchToken,
  addingWatchToken,
  price,
  priceHistory,
  metrics,
  blinkUrl,
  blinkLatency,
  generatingBlink,
  onGenerateBlink
}: TradingPanelProps) {
  const [timeframe, setTimeframe] = useState("5m");
  const [customTokenInput, setCustomTokenInput] = useState("");
  const displayName = tokenDisplayNames[token] || getTokenDisplayName(token);

  const bars = useMemo(() => buildPriceBars(priceHistory, timeframe), [priceHistory, timeframe]);
  const changePercent = useMemo(
    () => calculateChangePercent(priceHistory, timeframe),
    [priceHistory, timeframe]
  );
  const isPositive = changePercent >= 0;
  const formattedChangePercent = `${isPositive ? "+" : ""}${changePercent.toFixed(2)}%`;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-6">
        <div className="glass-panel rounded-2xl p-6 relative overflow-hidden group">
          <motion.div
            animate={{
              backgroundPosition: ["0% 0%", "100% 100%", "0% 0%"],
              opacity: [0.3, 0.5, 0.3]
            }}
            transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
            className="absolute top-0 right-0 w-[200%] h-[200%] bg-[radial-gradient(circle_at_center,rgba(0,243,255,0.1)_0%,transparent_50%)] -translate-y-1/2 translate-x-1/4 pointer-events-none"
          />

          <div className="flex justify-between items-start mb-8 relative z-10">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-2xl font-bold tracking-tight">{displayName}/USDC</h2>
                <select
                  value={token}
                  onChange={(event) => onTokenChange(event.target.value)}
                  className="bg-black/60 border border-white/20 rounded px-2 py-1 text-xs font-mono text-white outline-none"
                >
                  {supportedTokens.map((symbol) => (
                    <option key={symbol} value={symbol}>
                      {tokenDisplayNames[symbol] || getTokenDisplayName(symbol)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  value={customTokenInput}
                  onChange={(event) => setCustomTokenInput(event.target.value)}
                  placeholder="Add symbol or mint (surge + blink)"
                  className="min-w-[15rem] flex-1 max-w-[24rem] bg-black/60 border border-white/20 rounded px-2 py-1 text-[11px] font-mono text-white outline-none focus:border-[#00f3ff]/60"
                />
                <button
                  onClick={async () => {
                    await onAddWatchToken(customTokenInput);
                    setCustomTokenInput("");
                  }}
                  disabled={!customTokenInput.trim() || addingWatchToken}
                  className="bg-[#00f3ff]/10 border border-[#00f3ff]/40 rounded px-3 py-1 text-[11px] font-bold tracking-widest text-[#8cf8ff] hover:bg-[#00f3ff]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {addingWatchToken ? "ADDING..." : "ADD WATCH TOKEN"}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-mono neon-text-cyan flex items-center">
                  $<AnimatedCounter value={price || 0} format={true} decimals={2} />
                </span>
                <span
                  className={`flex items-center text-sm font-mono px-2 py-1 rounded ${isPositive ? "text-[#00f3ff] bg-[#00f3ff]/10" : "text-[#ff7db9] bg-[#ff007f]/10"
                    }`}
                >
                  {isPositive ? (
                    <ArrowUpRight className="w-4 h-4 mr-1" />
                  ) : (
                    <ArrowDownRight className="w-4 h-4 mr-1" />
                  )}
                  {formattedChangePercent}
                </span>
              </div>
            </div>

            <div className="flex gap-2">
              {TIMEFRAMES.map((timeFrame) => (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  key={timeFrame}
                  onClick={() => setTimeframe(timeFrame)}
                  className={`px-3 py-1 rounded text-xs font-mono transition-colors ${timeframe === timeFrame
                      ? "bg-[#00f3ff]/20 text-[#00f3ff] border border-[#00f3ff]/30 shadow-[0_0_10px_rgba(0,243,255,0.2)]"
                      : "bg-black/40 text-gray-400 hover:text-white border border-transparent"
                    }`}
                >
                  {timeFrame}
                </motion.button>
              ))}
            </div>
          </div>

          <div className="h-64 relative w-full flex items-end gap-1 z-10">
            {bars.map((bar, index) => (
              <motion.div
                key={`${timeframe}-${index}`}
                initial={{ height: 0 }}
                animate={{ height: `${bar.height}%` }}
                transition={{ duration: 1, delay: index * 0.02, type: "spring" }}
                whileHover={{ opacity: 1, filter: "brightness(1.5)" }}
                className={`flex-1 rounded-t-sm opacity-80 cursor-crosshair transition-all ${bar.isUp
                    ? "bg-gradient-to-t from-[#00f3ff]/10 to-[#00f3ff] shadow-[0_0_10px_rgba(0,243,255,0.5)]"
                    : "bg-gradient-to-t from-[#ff007f]/10 to-[#ff007f] shadow-[0_0_10px_rgba(255,0,127,0.5)]"
                  }`}
              />
            ))}

            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
              {[1, 2, 3, 4].map((row) => (
                <div key={row} className="w-full h-px bg-[#00f3ff] border-dashed" />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <BlinkForm
          onGenerate={onGenerateBlink}
          generating={generatingBlink}
          blinkUrl={blinkUrl}
          latency={blinkLatency}
          defaultToken={token}
          supportedTokens={supportedTokens}
        />
        <LatencyMetrics metrics={metrics} blinkLatency={blinkLatency} />
      </div>
    </div>
  );
}
