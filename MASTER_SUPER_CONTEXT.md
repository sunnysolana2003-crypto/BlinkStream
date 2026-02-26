# MASTER SUPER CONTEXT: BlinkStream Full-Stack Code Understanding

This file is the authoritative context map for any LLM working on this codebase.

## 1) System mission

BlinkStream is a real-time Solana signal + execution assistant:

- Ingest chain activity from OrbitFlare gRPC
- Detect large swaps
- Detect surges
- Generate Action Blinks with measured latency
- Broadcast events to frontend via Socket.IO
- Support deterministic demo mode

The frontend is a trading console UI that consumes backend APIs and socket events.

---

## 2) Top-level structure

```text
blinkstream-unified-backend/
├── src/                                  # Backend runtime
├── blinkstream-trader (Frontend)/        # Frontend runtime
├── .env.example                          # Backend env template
├── UNIFIED_CODEBASE_GUIDE.md             # Backend architecture write-up
├── MASTER_SUPER_CONTEXT.md               # This file
└── README.md
```

---

## 3) Backend architecture (authoritative)

## 3.1 Core layers

- `config/`: singleton infra clients + constants
- `db/`: optional Supabase client
- `middleware/`: auth + error middleware
- `routes/`: HTTP API layer only
- `services/`: business logic only
- `jobs/`: orchestration loops only
- `sockets/`: one socket instance wrapper
- `utils/`: shared logger

## 3.2 Backend file map and ownership

- `src/server.js`
  - process bootstrap
  - socket init
  - job startup
  - graceful shutdown
- `src/app.js`
  - Express app composition
  - CORS
  - rate-limiter bindings
  - route mounting
- `src/config/rpc.config.js`
  - `getConnection()` singleton
  - `getHermesClient()` singleton
- `src/config/grpc.config.js`
  - OrbitFlare gRPC client creation
  - gRPC metadata
  - stream subscription request builder
- `src/config/constants.js`
  - runtime constants + demo payload
- `src/jobs/stream.job.js`
  - stream subscribe/consume/reconnect loop
  - signature dedupe and cleanup
  - stream status state
- `src/jobs/autonomous.job.js`
  - 5s polling orchestration
  - surge-to-blink pipeline execution
  - anti-spam safeguard (60s)
- `src/services/price.service.js`
  - Hermes pricing (or demo pricing)
- `src/services/surgeEngine.service.js`
  - surge threshold/cooldown state machine
- `src/services/jupiter.service.js`
  - quote retrieval + timeout guard
- `src/services/simulation.service.js`
  - simulation + timeout guard
- `src/services/blink.service.js`
  - blink generation and latency packaging
  - token-to-mint resolution (`TOKEN_MINT_MAP`) for multi-token trading pairs
- `src/services/txParser.service.js`
  - transaction instruction parsing
- `src/services/swapDetector.service.js`
  - `$10k+` swap threshold logic
- `src/services/telemetry.service.js`
  - event normalization
  - metrics retrieval
  - optional event persistence
- `src/routes/health.routes.js`
  - health snapshot + stream status
- `src/routes/auth.routes.js`
  - register/login + validation
- `src/routes/blink.routes.js`
  - auth header + payload validation
  - blink generation endpoint
- `src/routes/demo.routes.js`
  - demo trigger endpoint
- `src/sockets/socket.js`
  - singleton socket + emit wrapper
- `src/utils/logger.js`
  - structured logging wrapper

---

## 4) Frontend architecture (authoritative)

Frontend root:

- `blinkstream-trader (Frontend)/`

## 4.1 Frontend integration files

- `src/lib/api.ts`
  - axios client
  - centralized API base URL config
- `src/lib/socket.ts`
  - socket.io-client instance
- `src/types/backend.ts`
  - shared event/metrics/blink types
- `src/App.tsx`
  - API polling
  - socket subscriptions
  - demo trigger wiring
  - centralized error handling UI
- `src/components/TradingPanel.tsx`
  - receives live price/metrics/blink props
- `src/components/BlinkForm.tsx`
  - calls backend blink generate
  - displays latency + URL
- `src/components/EventStream.tsx`
  - shows live `surge`/`large-swap` feed
  - triggers demo surge action
- `src/components/SurgeAlert.tsx`
  - animated surge alert
  - latency bar animation per stage
- `src/components/LatencyMetrics.tsx`
  - renders rpc latency, blink total, slot/network
- `src/components/TopBar.tsx`
  - network/rpc/demo badge/logout display

---

## 5) Runtime data flow

## 5.1 Stream pipeline

1. `stream.job` opens OrbitFlare stream
2. `txParser.service` parses instructions
3. `swapDetector.service` evaluates USD threshold
4. `telemetry.service.buildStandardEvent` normalizes
5. socket emits `large-swap`
6. frontend `EventStream` prepends event to feed

## 5.2 Autonomous pipeline

1. `autonomous.job` polls every 5s
2. `price.service` fetches price for each configured token (`AUTONOMOUS_TOKENS`)
3. `surgeEngine.service` decides surge/no-surge per token (token-scoped state)
4. on surge for a token:
   - `jupiter.service` quote
   - `simulation.service` simulate
   - `blink.service` build blink payload + stage latency
5. `telemetry.service.buildStandardEvent` normalizes
6. optional DB persist
7. socket emits `surge`
8. frontend:
   - feed updates
   - surge alert animates
   - blink latency and URL update

## 5.3 Demo pipeline

1. frontend clicks SIM SURGE
2. frontend calls `POST /api/demo/trigger`
3. backend emits deterministic surge event
4. frontend consumes event same as real mode

---

## 6) Contract invariants

These invariants must stay true unless intentionally versioned:

1. Event contract shape is unified and normalized by `telemetry.service.buildStandardEvent`
2. Singletons remain singleton:
   - RPC connection
   - Hermes client
   - Socket.IO instance
3. Services must not import Express
4. Jobs must orchestrate; business logic remains in services
5. Demo mode must not perform real external quote/simulation operations
6. Stream reconnect loop must not terminate process on stream failures

---

## 7) Backend endpoint truth table

- `GET /api/metrics`
- `GET /api/metrics/surge-settings`
- `PUT /api/metrics/surge-settings`
- `GET /api/price?token=SOL`
- `GET /api/price/supported?limit=20`
- `POST /api/blinks`
- `POST /api/blinks/generate`
- `POST /api/demo/trigger`
- `GET /api/health`

Note:

- Frontend currently attempts `/api/blinks` first and falls back to `/api/blinks/generate` for compatibility.
- `GET /api/health` includes `quotePath` counters to show Jupiter quote utilization.

---

## 8) Socket event truth table

Event names:

- `surge`
- `large-swap`

Payload shape:

```json
{
  "type": "SURGE" | "LARGE_SWAP",
  "token": "SOL",
  "changePercent": 3.2,
  "usdValue": 12000,
  "blink": {
    "blinkUrl": "...",
    "latency": {
      "quoteLatency": 14,
      "simulationLatency": 20,
      "blinkLatency": 4,
      "total": 38
    }
  },
  "slot": 123456,
  "timestamp": 123456789
}
```

---

## 9) Security/hardening currently active

- structured logger abstraction
- route rate limiting on auth/blink/demo
- CORS allow-list via `ALLOWED_ORIGINS`
- auth + blink payload validation
- stream signature dedupe + timed cleanup
- stream reconnect exponential backoff
- external timeout guards (Jupiter/simulation)
- anti-spam blink guard in autonomous job
- graceful shutdown hooks
- health endpoint with stream telemetry

---

## 10) Environment variables

## Backend (`.env` from `.env.example`)

Critical:

- `PORT`
- `DEMO_MODE`
- `ALLOWED_ORIGINS`
- `ORBITFLARE_RPC_URL`
- `ORBITFLARE_GRPC_URL`
- `ORBITFLARE_API_KEY`
- `PYTH_HERMES_URL`
- `JUPITER_API_URL`

Optional:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## Frontend (`blinkstream-trader (Frontend)/.env`)

- `VITE_API_URL=http://localhost:3000/api`
- `VITE_SOCKET_URL=http://localhost:3000`

---

## 11) Known caveats

- In this local environment, `@kdt-sol/solana-grpc-client` may fail under Node `v24.x` with `Metadata` import/runtime issues.
- Recommended: run backend on Node LTS (20 or 22) for stable real stream behavior.

---

## 12) Safe edit playbook for future LLMs

When asked to change behavior:

1. Preserve architecture boundaries (routes/jobs/services)
2. Update shared types first when payload contract changes
3. Keep `telemetry.service` as single source of event shape
4. Keep stream status exposed for `/api/health`
5. Avoid introducing second socket/RPC/Hermes instances
6. Validate with:
   - backend syntax check (`node --check`)
   - frontend typecheck (`npm run lint` in frontend)
   - no circular deps (`madge --circular src` in backend)

When asked to add UI features:

1. Avoid rewriting existing visual style/motion system unless explicitly requested
2. Prefer passing new data through props from `App.tsx`
3. Keep backend integration logic centralized in `App.tsx` + `src/lib/*`

---

## 13) Quick start commands

Backend:

```bash
cd blinkstream-unified-backend
npm install
cp .env.example .env
npm run dev
```

Frontend:

```bash
cd "blinkstream-trader (Frontend)"
npm install
cp .env.example .env
npm run dev -- --port 5173
```
