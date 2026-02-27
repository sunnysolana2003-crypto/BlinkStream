# MASTER SUPER CONTEXT: BlinkStream Full-Stack Code Understanding

This file is the authoritative context map for any LLM working on this codebase.

---

## 1) System Mission

BlinkStream is a real-time Solana signal + execution assistant:

- Ingest chain activity from OrbitFlare gRPC
- Detect large swaps and price surges
- Generate Action Blinks with measured latency
- Broadcast events to frontend via Socket.IO
- Support deterministic demo mode
- Wallet-connected blink simulation (user's Phantom/Solflare/Backpack wallet)
- On-chain token rug risk analysis

The frontend is a professional trading console UI. The backend and frontend are deployed as a **single unified service on Render** — Express serves the React `dist/` build directly.

---

## 2) Top-Level Structure

```text
blinkstream-unified-backend/
├── src/                    # Backend runtime
├── frontend/               # Frontend runtime (previously "blinkstream-trader (Frontend)")
├── build.sh                # Render build script — runs Vite inside frontend/
├── .env.example            # Backend env template
├── render.yaml             # Render deployment config (single unified web service)
├── MASTER_SUPER_CONTEXT.md # This file
└── README.md
```

> **Critical:** The frontend directory was renamed from `blinkstream-trader (Frontend)` to `frontend/`.
> All path references in `app.js`, `build.sh`, and `render.yaml` use `frontend/`.

---

## 3) Deployment

### Render (Production)

- **Single web service** at `blinkstream-1.onrender.com`
- **Build command** (set in Render dashboard): `npm install --ignore-scripts && bash build.sh`
  - `build.sh` cd's into `frontend/`, runs `npm install --ignore-scripts && npm run build`
  - This creates `frontend/dist/` which Express serves statically
- **Start command**: `npm start` (runs `node src/server.js`)
- **Port**: `10000` (Render's assigned port)
- Express serves React at all non-`/api` routes (catch-all `index.html`)
- `render.yaml` is present but Render was created manually; build command must be set in the dashboard

### Local Development

```bash
# Backend (port 3000)
cd blinkstream-unified-backend
npm install
npm run dev

# Frontend (port 5173)
cd frontend
npm install
npm run dev
```

### Key env vars for Render

| Variable | Value |
|---|---|
| `PORT` | `10000` |
| `NODE_ENV` | `production` |
| `ORBITFLARE_RPC_URL` | `http://fra.rpc.orbitflare.com` |
| `ORBITFLARE_GRPC_URL` | `http://fra.rpc.orbitflare.com:10000` |
| `ORBITFLARE_API_KEY` | your key |
| `HACKATHON_SIM_PUBLIC_KEY` | your Solana wallet pubkey (or left blank → random keypair) |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | Supabase project values |

---

## 4) Backend Architecture

### 4.1 Core Layers

- `config/`: singleton infra clients + constants
- `db/`: optional Supabase client
- `middleware/`: auth + error middleware
- `routes/`: HTTP API layer only
- `services/`: business logic only
- `jobs/`: orchestration loops only
- `sockets/`: one socket instance wrapper
- `utils/`: shared logger

### 4.2 Backend File Map

- `src/server.js` — process bootstrap, socket init, job startup, graceful shutdown
- `src/app.js` — Express composition, CORS, rate-limiter, route mounting, static frontend serving
- `src/config/rpc.config.js` — `getConnection()` and `getHermesClient()` singletons
- `src/config/grpc.config.js` — OrbitFlare gRPC client and stream subscription builder
- `src/config/constants.js` — runtime constants + demo payload
- `src/jobs/stream.job.js` — stream subscribe/consume/reconnect loop, signature dedupe
- `src/jobs/autonomous.job.js` — 5s polling, surge-to-blink pipeline, anti-spam guard (60s)
- `src/services/price.service.js` — Hermes pricing (or demo pricing)
- `src/services/surgeEngine.service.js` — surge threshold/cooldown state machine
- `src/services/jupiter.service.js` — quote retrieval + timeout guard
  - Accepts optional `userPublicKey` for swap simulation against user's wallet
- `src/services/simulation.service.js` — simulation + timeout guard
- `src/services/blink.service.js` — blink generation and latency packaging
  - `generateBlink(options)` now accepts and passes through `userPublicKey`
  - Blink URL uses single-layer encoding (no double-encode)
  - `?format=json` param added to action URLs for wallet clients
- `src/services/txParser.service.js` — transaction instruction parsing
- `src/services/swapDetector.service.js` — $10k+ swap threshold logic
- `src/services/telemetry.service.js` — event normalization, metrics, optional persistence
- `src/services/tokenRegistry.service.js` — mint address → symbol via Jupiter Token List
- `src/services/rugCheck.service.js` (**NEW**) — on-chain SPL token risk analysis
  - Uses OrbitFlare RPC: `getParsedAccountInfo` + `getTokenLargestAccounts`
  - Checks: mint authority, freeze authority, top holder concentration, supply anomalies
  - Returns 0–100 risk score with per-check SAFE/WARN/DANGER labels
- `src/routes/health.routes.js` — health snapshot + stream status
- `src/routes/auth.routes.js` — register/login + validation
- `src/routes/blink.routes.js` — blink generation endpoint; now accepts `userPublicKey` in body
- `src/routes/demo.routes.js` — demo trigger endpoint
- `src/routes/rugCheck.routes.js` (**NEW**) — `GET /api/rug-check?mint=<address>`
- `src/sockets/socket.js` — singleton socket + emit wrapper
- `src/utils/logger.js` — structured logging wrapper

---

## 5) Frontend Architecture

Frontend root: `frontend/` (renamed from `blinkstream-trader (Frontend)/`)

### 5.1 Integration Files

- `src/lib/api.ts` — axios client, base URL defaults to `/api` (relative, works on Render)
- `src/lib/socket.ts` — socket.io-client, URL defaults to `window.location.origin`
- `src/lib/tokenNames.ts` — mint address → symbol resolution
- `src/lib/wallet.ts` — Blink URL utilities (`openBlinkInWallet`, Solflare deep link builder)
- `src/types/backend.ts` — shared TS types

### 5.2 Components

- `src/App.tsx`
  - All API polling, socket subscriptions, centralized error handling
  - `connectedWallet: string | null` state — Phantom/Solflare/Backpack public key
  - `handleConnectWallet()` — multi-wallet provider detection with priority order and fallback loop
  - `handleGenerateBlink()` — passes `userPublicKey` payload when wallet is connected
- `src/components/TopBar.tsx`
  - Added **CONNECT wallet button** (top-right)
  - Shows truncated address when connected; click to disconnect
  - Props: `connectedWallet`, `onConnectWallet` (new)
- `src/components/TradingPanel.tsx`
  - **Price chart replaced**: SVG area chart with smooth bezier curve
  - Features: gradient fill, 5-level price axis with real USD values, dashed grid, animated live dot, vertical cursor at latest price
  - Color: cyan (up) / magenta (down)
- `src/components/RugCheck.tsx` (**NEW**)
  - Sidebar section for on-chain rug risk analysis
  - Input: mint address (with presets for BONK, JUP, USDC)
  - Circular SVG risk gauge (0-100 score)
  - Per-check SAFE/WARN/DANGER cards (mint authority, freeze authority, holder concentration, supply)
  - Animated top-holder bar chart
- `src/components/BlinkForm.tsx` — blink generate UI
- `src/components/EventStream.tsx` — live surge/large-swap feed
- `src/components/SurgeAlert.tsx` — animated surge alert
- `src/components/LatencyMetrics.tsx` — RPC latency, blink total, slot/network
- `src/components/Sidebar.tsx` — navigation; now includes **Rug Checker** section (`rugcheck`)
- `src/components/OrbitflareExplorer.tsx` — Trader Intelligence Hub
- `src/components/JudgeBriefing.tsx` — judge/demo mode view

### 5.3 Wallet Connection Flow

```
User clicks CONNECT →
  resolveWalletProvider(window) candidates:
    1. window.phantom.solana  (Phantom — preferred)
    2. window.solana (if isPhantom)
    3. window.solflare
    4. window.backpack.solana
    5. window.solana (generic fallback)
  → tries each in order, deduped by Set
  → calls connectProvider(provider) — retries with {onlyIfTrusted: false} on argument errors
  → stores publicKey string in connectedWallet state
  → subsequent blink.generate calls include userPublicKey in POST body
```

---

## 6) Backend Endpoint Truth Table

```
GET  /api/health
GET  /api/metrics
GET  /api/metrics/surge-settings
PUT  /api/metrics/surge-settings
GET  /api/metrics/autonomous-tokens
POST /api/metrics/autonomous-tokens
GET  /api/price?token=SOL
GET  /api/price/supported?limit=20
POST /api/blinks              (primary)
POST /api/blinks/generate     (fallback alias)
GET  /api/blinks/action       (Solana Actions query)
POST /api/blinks/action       (Solana Actions execute — accepts `account` = user pubkey)
POST /api/demo/trigger
GET  /api/rug-check?mint=<address>   ← NEW
```

---

## 7) Socket Event Truth Table

Events: `surge`, `large-swap`

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

## 8) Rug Checker Details

**Endpoint:** `GET /api/rug-check?mint=<base58_mint_address>`

**Risk score weights:**
| Flag | Score |
|---|---|
| Mint authority active | 35 |
| Freeze authority active | 20 |
| Top 1 holder >50% | 25 |
| Top 5 holders >80% | 15 |
| Supply >1 quadrillion | 10 |
| No metadata | 5 |
| Zero holders | 10 |

**Response shape:**
```json
{
  "mint": "...",
  "riskScore": 55,
  "risk": "MEDIUM",
  "checks": [{ "id": "...", "label": "...", "status": "SAFE|WARN|DANGER", "detail": "..." }],
  "topHolders": [{ "address": "...", "uiAmount": 1234, "pct": "12.34" }],
  "latencyMs": 340
}
```

---

## 9) Security / Hardening

- Rate limiting on `/api/blinks`, `/api/demo`
- CORS allow-list via `ALLOWED_ORIGINS`
- Auth + payload validation on blink routes
- Stream signature dedupe + timed cleanup
- Stream reconnect exponential backoff
- External timeout guards (Jupiter/simulation)
- Anti-spam blink guard in autonomous job (60s)
- Graceful shutdown hooks
- Frontend build missing → 503 JSON (not raw ENOENT crash)
- `userPublicKey` is validated as non-empty string before use; never trusted for auth

---

## 10) Contract Invariants

1. Event shape is unified by `telemetry.service.buildStandardEvent`
2. Singletons remain singleton (RPC connection, Hermes client, Socket.IO instance)
3. Services must not import Express
4. Jobs orchestrate; business logic stays in services
5. Demo mode must not perform real external quote/simulation operations
6. Stream reconnect loop must not terminate process on stream failures

---

## 11) Safe Edit Playbook for Future LLMs

**Backend changes:**
1. Preserve architecture boundaries (routes/jobs/services)
2. Update shared types first when payload contract changes
3. Keep `telemetry.service` as single source of event shape
4. Keep stream status exposed for `/api/health`
5. Avoid introducing second socket/RPC/Hermes instances

**Frontend changes:**
1. Don't rewrite the visual style/motion system unless explicitly asked
2. Pass new data through props from `App.tsx`
3. Keep backend integration logic in `App.tsx` + `src/lib/*`
4. All wallet connection logic lives in `App.tsx` `handleConnectWallet` + `resolveWalletProvider`

**Deployment:**
- Build command in Render dashboard: `npm install --ignore-scripts && bash build.sh`
- `build.sh` must `cd frontend` (not `cd "blinkstream-trader (Frontend)"`)
- Frontend `package.json` must NOT contain backend-only packages (`better-sqlite3`, `express`, `dotenv`)

---

## 12) Known Caveats

- `@kdt-sol/solana-grpc-client` enforces `pnpm` via `only-allow` preinstall script — use `--ignore-scripts` flag on all `npm install` calls during deployment
- OrbitFlare Starter plan rejects `accountInclude` filter → switches to broad TX feed with local SPL parsing (logged as WARN, not an error)
- `HACKATHON_SIM_PUBLIC_KEY` left blank → random keypair → Jupiter simulation returns `AccountNotFound`. Fixed by: user connecting wallet (preferred) or setting env var.

---

## 13) Quick Start Commands

```bash
# Backend
cd blinkstream-unified-backend
npm install
cp .env.example .env
npm run dev

# Frontend
cd frontend
npm install
npm run dev
```

```bash
# Full production build (same as Render)
bash build.sh
npm start
```
