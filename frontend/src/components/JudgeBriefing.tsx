import React, { useMemo } from "react";
import { motion } from "motion/react";
import {
  Activity,
  Boxes,
  Database,
  Layers,
  Network,
  PlugZap,
  Radar,
  Radio,
  Send,
  Server,
  ShieldCheck,
  Workflow
} from "lucide-react";
import {
  BackendEvent,
  BlinkLatency,
  MetricsPayload
} from "../types/backend";

interface JudgeBriefingProps {
  isDemoMode: boolean;
  metrics: MetricsPayload;
  events: BackendEvent[];
  latestBlinkLatency: BlinkLatency;
  price: number;
  token: string;
  healthSnapshot: Record<string, unknown> | null;
}

function formatTimestamp(timestamp: number) {
  const normalized = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
  return new Date(normalized).toLocaleString();
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function JudgeBriefing({
  isDemoMode,
  metrics,
  events,
  latestBlinkLatency,
  price,
  token,
  healthSnapshot
}: JudgeBriefingProps) {
  const latestEvent = events[0] || null;

  const eventHeadline = useMemo(() => {
    if (!latestEvent) {
      return "Waiting for live chain signal";
    }

    return `${latestEvent.type} on ${latestEvent.token} at slot ${latestEvent.slot}`;
  }, [latestEvent]);

  const streamSnapshot = useMemo(() => {
    const stream =
      healthSnapshot && typeof healthSnapshot.stream === "object" && healthSnapshot.stream
        ? (healthSnapshot.stream as Record<string, unknown>)
        : null;
    const backfill =
      stream && typeof stream.backfill === "object" && stream.backfill
        ? (stream.backfill as Record<string, unknown>)
        : null;

    return {
      filterMode: String(stream?.filterMode || "unknown"),
      reconnectCount: toNumber(stream?.reconnectCount, 0),
      lastMessageAt: toNumber(stream?.lastMessageAt, 0),
      backfillRecovered: toNumber(backfill?.lastRecoveredCount, 0),
      backfillRuns: toNumber(backfill?.runs, 0),
      backfillError: String(backfill?.lastError || "")
    };
  }, [healthSnapshot]);
  const opsSnapshot = useMemo(() => {
    const orbitflareOps =
      healthSnapshot && typeof healthSnapshot.orbitflareOps === "object" && healthSnapshot.orbitflareOps
        ? (healthSnapshot.orbitflareOps as Record<string, unknown>)
        : null;
    const monitor =
      orbitflareOps && typeof orbitflareOps.monitor === "object" && orbitflareOps.monitor
        ? (orbitflareOps.monitor as Record<string, unknown>)
        : null;

    return {
      configured: Boolean(orbitflareOps?.configured),
      monitorRunning: Boolean(monitor?.running),
      monitorRuns: toNumber(monitor?.runCount, 0)
    };
  }, [healthSnapshot]);

  const scoreSnapshot =
    healthSnapshot && typeof healthSnapshot.orbitflareScore === "object"
      ? (healthSnapshot.orbitflareScore as Record<string, unknown>)
      : null;
  const scoreTotal = toNumber(scoreSnapshot?.total, 0);
  const scoreTier = String(scoreSnapshot?.tier || "N/A");

  return (
    <div className="flex flex-col gap-6">
      <div className="glass-panel rounded-2xl p-6 relative overflow-hidden">
        <motion.div
          animate={{ opacity: [0.15, 0.3, 0.15] }}
          transition={{ duration: 5, repeat: Infinity }}
          className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,243,255,0.2),transparent_45%)] pointer-events-none"
        />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="text-xs font-bold tracking-widest text-[#00f3ff] mb-2 flex items-center gap-2">
              <Radar className="w-4 h-4" />
              JUDGE MODE BRIEFING
            </div>
            <h2 className="text-2xl font-bold tracking-tight mb-1">BlinkStream: Real-Time Solana Signal-to-Action Engine</h2>
            <p className="text-sm text-gray-300 max-w-3xl">
              We monitor Solana in real time, detect high-signal events (surges + large swaps),
              generate executable Blink actions, and stream insights to this dashboard with low-latency telemetry.
            </p>
          </div>

          <div className="flex flex-col items-start lg:items-end gap-2">
            <span className="px-3 py-1 rounded border border-[#00f3ff]/40 text-[#00f3ff] text-xs font-mono">
              MODE: {isDemoMode ? "DEMO" : "REAL"}
            </span>
            <span className="text-xs text-gray-400 font-mono">{eventHeadline}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          {
            label: `${token} Price`,
            value: `$${price.toFixed(2)}`,
            icon: Activity,
            accent: "text-[#00f3ff]"
          },
          {
            label: "RPC Latency",
            value: `${metrics.rpcLatency ?? 0} ms`,
            icon: Server,
            accent: "text-[#bc13fe]"
          },
          {
            label: "Latest Blink Total",
            value: `${latestBlinkLatency.total} ms`,
            icon: PlugZap,
            accent: "text-[#ff6a00]"
          },
          {
            label: "Signals Observed",
            value: `${events.length}`,
            icon: Radar,
            accent: "text-[#ff007f]"
          },
          {
            label: "OrbitFlare Score",
            value: `${scoreTotal.toFixed(1)}/100`,
            icon: Radar,
            accent: "text-[#8cf8ff]"
          },
          {
            label: "OrbitFlare Tier",
            value: scoreTier,
            icon: Radar,
            accent: "text-[#ffb37d]"
          },
          {
            label: "Ops Monitor",
            value: opsSnapshot.monitorRunning ? "RUNNING" : "STOPPED",
            icon: ShieldCheck,
            accent: opsSnapshot.monitorRunning ? "text-[#00f3ff]" : "text-[#ff7db9]"
          }
        ].map((card) => (
          <div key={card.label} className="glass-panel rounded-xl p-4 border border-white/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-gray-400 tracking-widest">{card.label}</span>
              <card.icon className={`w-4 h-4 ${card.accent}`} />
            </div>
            <div className="text-xl font-mono font-bold text-white">{card.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="glass-panel rounded-2xl p-6">
          <h3 className="text-sm font-bold tracking-widest text-gray-300 mb-4 flex items-center gap-2">
            <Network className="w-4 h-4 text-[#00f3ff]" />
            HOW WE LEVERAGE ORBITFLARE
          </h3>
          <div className="space-y-3 text-sm text-gray-300">
            <div className="rounded-lg border border-[#00f3ff]/20 bg-black/30 p-3">
              <div className="text-[#00f3ff] font-mono text-xs mb-1">gRPC Yellowstone Stream</div>
              <p>
                OrbitFlare gRPC is used as the low-latency ingestion layer for live Solana transaction data.
                We run resilient stream ingestion with reconnect + backfill and real-time large-swap detection.
              </p>
            </div>
            <div className="rounded-lg border border-[#bc13fe]/20 bg-black/30 p-3">
              <div className="text-[#bc13fe] font-mono text-xs mb-1">HTTP RPC + Advanced Methods</div>
              <p>
                OrbitFlare RPC powers price telemetry, simulation, wallet/tx replay explorer, and advanced chain probes.
              </p>
            </div>
            <div className="rounded-lg border border-[#ff6a00]/20 bg-black/30 p-3">
              <div className="text-[#ff6a00] font-mono text-xs mb-1">WebSocket + Transaction Relay</div>
              <p>
                We validate `slot/logs/program` websocket channels and relay signed transactions through OrbitFlare RPC.
              </p>
            </div>
            <div className="rounded-lg border border-[#ff007f]/20 bg-black/30 p-3">
              <div className="text-[#ff007f] font-mono text-xs mb-1">Ops Guardrails + Custom Tokens</div>
              <p>
                Ops monitor checks license/IP guardrails continuously, and users can add any symbol or mint for surge + Blink flows.
              </p>
            </div>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-6">
          <h3 className="text-sm font-bold tracking-widest text-gray-300 mb-4 flex items-center gap-2">
            <Workflow className="w-4 h-4 text-[#ff6a00]" />
            ORBITFLARE LIVE UTILIZATION
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono mb-4">
            <div className="rounded-lg border border-white/10 bg-black/30 p-3">
              <div className="text-gray-400 mb-1">STREAM FILTER MODE</div>
              <div className="text-[#ffb37d] text-base">{streamSnapshot.filterMode.toUpperCase()}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/30 p-3">
              <div className="text-gray-400 mb-1">RECONNECT COUNT</div>
              <div className="text-[#ffb37d] text-base">{streamSnapshot.reconnectCount}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/30 p-3">
              <div className="text-gray-400 mb-1">BACKFILL RUNS</div>
              <div className="text-[#bc13fe] text-base">{streamSnapshot.backfillRuns}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/30 p-3">
              <div className="text-gray-400 mb-1">RECOVERED EVENTS</div>
              <div className="text-[#bc13fe] text-base">{streamSnapshot.backfillRecovered}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/30 p-3">
              <div className="text-gray-400 mb-1">OPS MONITOR RUNS</div>
              <div className="text-[#00f3ff] text-base">{opsSnapshot.monitorRuns}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="glass-panel rounded-2xl p-6 xl:col-span-2">
          <h3 className="text-sm font-bold tracking-widest text-gray-300 mb-4 flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#bc13fe]" />
            ARCHITECTURE + CODE ORGANIZATION
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-300">
            <div className="rounded-lg border border-white/10 bg-black/30 p-4">
              <div className="text-xs font-mono text-[#00f3ff] mb-2">BACKEND (Node.js)</div>
              <ul className="space-y-1 list-disc list-inside">
                <li>Routes: HTTP contracts</li>
                <li>Services: business logic</li>
                <li>Jobs: orchestration loops</li>
                <li>Sockets: event emission</li>
                <li>Config: singleton OrbitFlare clients</li>
                <li>Runtime watchlist: symbol or mint tokens</li>
              </ul>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/30 p-4">
              <div className="text-xs font-mono text-[#ff6a00] mb-2">FRONTEND (React 19 + Vite)</div>
              <ul className="space-y-1 list-disc list-inside">
                <li>Open-access dashboard flow</li>
                <li>Socket event listeners</li>
                <li>Metrics + price polling</li>
                <li>Blink generation for symbol/mint</li>
                <li>OrbitFlare Explorer + relay tools</li>
                <li>Judge briefing mode</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-6">
          <h3 className="text-sm font-bold tracking-widest text-gray-300 mb-4 flex items-center gap-2">
            <Boxes className="w-4 h-4 text-[#00f3ff]" />
            TECH STACK
          </h3>
          <div className="flex flex-wrap gap-2 text-xs font-mono">
            {[
              "Node.js",
              "Express",
              "Socket.IO",
              "OrbitFlare gRPC",
              "OrbitFlare RPC",
              "OrbitFlare WS RPC",
              "OrbitFlare Customer API",
              "Supabase",
              "Pyth Hermes",
              "Jupiter",
              "React 19",
              "Vite",
              "TypeScript",
              "Motion"
            ].map((item) => (
              <span key={item} className="px-2 py-1 rounded border border-white/20 bg-black/40 text-gray-200">
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="glass-panel rounded-2xl p-6">
          <h3 className="text-sm font-bold tracking-widest text-gray-300 mb-4 flex items-center gap-2">
            <Database className="w-4 h-4 text-[#00f3ff]" />
            APIs + EVENTS
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
            <div className="rounded-lg border border-white/10 bg-black/30 p-3">
              <div className="text-[#00f3ff] mb-2">HTTP Endpoints</div>
              <div className="space-y-1 text-gray-300">
                <div>GET /api/metrics</div>
                <div>GET /api/metrics/surge-settings</div>
                <div>GET /api/metrics/autonomous-tokens</div>
                <div>POST /api/metrics/autonomous-tokens</div>
                <div>GET /api/metrics/whale/history</div>
                <div>GET /api/metrics/priority-fees</div>
                <div>GET /api/price?token=&lt;symbol|mint&gt;</div>
                <div>POST /api/blinks</div>
                <div>GET /api/blinks</div>
                <div>POST /api/demo/trigger</div>
                <div>GET /api/health</div>
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/30 p-3">
              <div className="text-[#ff6a00] mb-2">Socket Events</div>
              <div className="space-y-1 text-gray-300">
                <div>surge</div>
                <div>large-swap</div>
                <div className="pt-2 text-gray-500">Unified payload + latency envelope</div>
              </div>
            </div>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-6">
          <h3 className="text-sm font-bold tracking-widest text-gray-300 mb-4 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#ff007f]" />
            PRODUCTION HARDENING
          </h3>
          <ul className="space-y-2 text-sm text-gray-300 list-disc list-inside">
            <li>Stream auto-reconnect with exponential backoff</li>
            <li>Signature deduplication + cleanup</li>
            <li>Rate limiting on critical routes</li>
            <li>Input validation and payload guards</li>
            <li>Timeout guards for external calls</li>
            <li>Continuous ops monitor for license/IP guardrails</li>
            <li>WebSocket probe + signed transaction relay diagnostics</li>
            <li>Structured logs and graceful shutdown</li>
          </ul>

          <div className="mt-4 rounded-lg border border-white/10 bg-black/30 p-3 text-xs font-mono text-gray-300">
            Latest Signal: {latestEvent ? `${latestEvent.type} | ${formatTimestamp(latestEvent.timestamp)}` : "No event yet"}
          </div>
          {streamSnapshot.lastMessageAt > 0 && (
            <div className="mt-3 rounded-lg border border-white/10 bg-black/30 p-3 text-xs font-mono text-gray-300">
              Last Stream Message: {formatTimestamp(streamSnapshot.lastMessageAt)}
            </div>
          )}
          {streamSnapshot.backfillError && streamSnapshot.backfillError !== "null" && (
            <div className="mt-3 rounded-lg border border-[#ff007f]/30 bg-[#ff007f]/10 p-3 text-xs font-mono text-[#ff7db9]">
              Backfill Warning: {streamSnapshot.backfillError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
