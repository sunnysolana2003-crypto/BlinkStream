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

function buildChartData(priceHistory: PricePoint[], timeframe: string, svgWidth = 800, svgHeight = 200) {
  const windowPrices = getWindowPrices(priceHistory, timeframe);
  const sampled = sampleSeries(windowPrices, 80);

  if (sampled.length < 2) {
    const dummy = [100, 100, 100, 100];
    return { points: dummy.map((p, i) => ({ x: (i / (dummy.length - 1)) * svgWidth, y: svgHeight / 2, price: p })), minPrice: 99, maxPrice: 101, range: 2 };
  }

  const minPrice = Math.min(...sampled);
  const maxPrice = Math.max(...sampled);
  const pad = (maxPrice - minPrice) * 0.12 || 0.01;
  const lo = minPrice - pad;
  const hi = maxPrice + pad;
  const range = hi - lo;

  const points = sampled.map((price, i) => ({
    x: (i / (sampled.length - 1)) * svgWidth,
    y: svgHeight - ((price - lo) / range) * svgHeight,
    price
  }));

  return { points, minPrice, maxPrice, range: hi - lo, lo, hi };
}

function smoothPath(points: { x: number; y: number }[]) {
  if (points.length < 2) return "";
  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    d += ` C ${cpx},${prev.y} ${cpx},${curr.y} ${curr.x},${curr.y}`;
  }
  return d;
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

  const chartData = useMemo(() => buildChartData(priceHistory, timeframe), [priceHistory, timeframe]);
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

          {/* Professional SVG area chart */}
          {(() => {
            const W = 800, H = 200;
            const { points, lo, hi } = chartData;
            const isUp = points.length >= 2 && points[points.length - 1].price >= points[0].price;
            const lineColor = isUp ? "#00f3ff" : "#ff007f";
            const gradId = isUp ? "grad-up" : "grad-down";
            const linePath = smoothPath(points);
            const areaPath = linePath + ` L ${points[points.length - 1].x},${H} L ${points[0].x},${H} Z`;
            const last = points[points.length - 1];
            const gridRows = 5;

            return (
              <div className="h-56 relative w-full z-10">
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none" style={{ overflow: "visible" }}>
                  <defs>
                    <linearGradient id="grad-up" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00f3ff" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#00f3ff" stopOpacity="0" />
                    </linearGradient>
                    <linearGradient id="grad-down" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ff007f" stopOpacity="0.2" />
                      <stop offset="100%" stopColor="#ff007f" stopOpacity="0" />
                    </linearGradient>
                    <filter id="glow">
                      <feGaussianBlur stdDeviation="2.5" result="blur" />
                      <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                  </defs>

                  {/* Grid lines */}
                  {Array.from({ length: gridRows }).map((_, i) => {
                    const y = (i / (gridRows - 1)) * H;
                    const priceAtRow = hi !== undefined && lo !== undefined ? hi - (i / (gridRows - 1)) * (hi - lo) : 0;
                    return (
                      <g key={i}>
                        <line x1={0} y1={y} x2={W} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="4 6" />
                        <text x={W - 2} y={y - 3} fill="rgba(255,255,255,0.3)" fontSize="10" textAnchor="end" fontFamily="monospace">
                          ${priceAtRow > 1000 ? priceAtRow.toFixed(0) : priceAtRow > 1 ? priceAtRow.toFixed(2) : priceAtRow.toFixed(5)}
                        </text>
                      </g>
                    );
                  })}

                  {/* Area fill */}
                  <path d={areaPath} fill={`url(#${gradId})`} />

                  {/* Glowing price line */}
                  <path d={linePath} fill="none" stroke={lineColor} strokeWidth="1.5" filter="url(#glow)" opacity="0.6" />
                  <path d={linePath} fill="none" stroke={lineColor} strokeWidth="1" />

                  {/* Live dot */}
                  <circle cx={last.x} cy={last.y} r="3" fill={lineColor} filter="url(#glow)">
                    <animate attributeName="r" values="3;5;3" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite" />
                  </circle>

                  {/* Vertical cursor line at last point */}
                  <line x1={last.x} y1={0} x2={last.x} y2={H} stroke={lineColor} strokeWidth="0.5" strokeDasharray="3 4" opacity="0.3" />
                </svg>
              </div>
            );
          })()}
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
