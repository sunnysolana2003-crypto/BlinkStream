export interface BlinkLatency {
  quoteLatency: number;
  simulationLatency: number;
  blinkLatency: number;
  total: number;
}

export interface BackendBlink {
  blinkUrl: string;
  latency: BlinkLatency;
}

export interface BackendEvent {
  type: "SURGE" | "LARGE_SWAP";
  token: string;
  changePercent: number;
  usdValue: number;
  blink: BackendBlink;
  slot: number;
  timestamp: number;
}

export interface MetricsPayload {
  rpcLatency: number | null;
  slot: number | null;
  network: string;
}

export interface GenerateBlinkInput {
  token: string;
  actionType: string;
  amount?: number;
  receiver?: string;
}

export interface OrbitflareMethodUsage {
  method: string;
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  lastLatencyMs: number | null;
  lastError: string | null;
  lastCalledAt: number | null;
}

export interface OrbitflareProbeSummary {
  startedAt?: number;
  finishedAt?: number;
  durationMs?: number;
  successCount?: number;
  failureCount?: number;
  health?: {
    success?: boolean;
    statusCode?: number | null;
    latencyMs?: number | null;
    error?: string | null;
    endpoint?: string;
  };
}

export interface OrbitflareUsagePayload {
  provider: string;
  rpcBaseUrl: string | null;
  totalCalls: number;
  successCalls: number;
  failedCalls: number;
  successRate: number | null;
  methods: OrbitflareMethodUsage[];
  websocket?: OrbitflareWebsocketSnapshot;
  submissions?: OrbitflareSubmissionSnapshot;
  lastProbe: OrbitflareProbeSummary | null;
  lastAdvancedProbe?: OrbitflareAdvancedProbe | null;
}

export interface OrbitflareRpcCallMeta {
  method: string;
  success: boolean;
  latencyMs: number | null;
  error: string | null;
}

export interface OrbitflareWalletToken {
  pubkey: string;
  mint: string;
  owner: string;
  state: string;
  amountRaw: string;
  decimals: number;
  uiAmount: number;
}

export interface OrbitflareWalletSnapshot {
  address: string;
  ownerAccountExists: boolean;
  solBalanceLamports: number;
  solBalance: number;
  tokenAccountCount: number;
  nonZeroTokenCount: number;
  tokenAccounts: OrbitflareWalletToken[];
  recentSignatures: Array<{
    signature: string;
    slot: number;
    blockTime: number | null;
    confirmationStatus: string | null;
    success: boolean;
  }>;
  rpcCalls: OrbitflareRpcCallMeta[];
}

export interface OrbitflareChainPulse {
  slot: number | null;
  blockHeight: number | null;
  epoch: number | null;
  slotIndex: number | null;
  slotsInEpoch: number | null;
  blockTxCount: number | null;
  blockTime: number | null;
  voteAccounts: {
    current: number;
    delinquent: number;
  };
  prioritizationFees: {
    sampleCount: number;
    min: number | null;
    max: number | null;
    avg: number | null;
    median: number | null;
  };
  topLeaders: Array<{
    identity: string;
    slots: number;
  }>;
  rpcCalls: OrbitflareRpcCallMeta[];
}

export interface OrbitflareTxReplayItem {
  signature: string;
  slot: number;
  blockTime: number | null;
  confirmationStatus: string | null;
  success: boolean;
  error: string | null;
  feeLamports: number | null;
  instructions: number | null;
  accounts: number;
  balanceDeltaLamports: number | null;
}

export interface OrbitflareTxReplay {
  address: string;
  count: number;
  items: OrbitflareTxReplayItem[];
  rpcCalls: OrbitflareRpcCallMeta[];
}

export interface OrbitflareOpsProbe {
  configured: boolean;
  timestamp: number;
  durationMs: number;
  licenses: {
    total: number;
    activeCount: number;
    expiresSoonCount: number;
    licenses: Array<{
      id: string;
      status: string;
      expiresAt: number | null;
      active: boolean;
    }>;
  };
  whitelist: {
    publicIp: string | null;
    entries: string[];
    whitelisted: boolean;
  };
  calls: Array<{
    name: string;
    success: boolean;
    statusCode: number | null;
    latencyMs: number;
    error: string | null;
    url: string;
  }>;
  guardrails: {
    status: "healthy" | "warning" | "critical";
    warnings: string[];
    failures: string[];
  };
}

export interface OrbitflareOpsSnapshot {
  configured: boolean;
  stats: {
    probeCount: number;
    successCount: number;
    failureCount: number;
    lastProbeAt: number | null;
    lastError: string | null;
  };
  monitor?: {
    running: boolean;
    intervalMs: number;
    timeoutMs: number;
    runCount: number;
    lastRunAt: number | null;
    lastRunSuccess: boolean | null;
    lastRunError: string | null;
    nextRunAt: number | null;
    cycleActive: boolean;
  };
  lastProbe: OrbitflareOpsProbe | null;
}

export interface OrbitflareWebsocketProbeChannel {
  channel: string;
  success: boolean;
  subscribed: boolean;
  timedOut: boolean;
  eventReceived: boolean;
  eventCount: number;
  latencyMs: number;
  firstEventLatencyMs: number | null;
  subscriptionId: number | null;
  eventPreview: string | null;
  error: string | null;
}

export interface OrbitflareWebsocketProbe {
  timestamp: number;
  durationMs: number;
  listenMs: number;
  overallSuccess: boolean;
  channels: OrbitflareWebsocketProbeChannel[];
}

export interface OrbitflareWebsocketSnapshot {
  probeCount: number;
  successCount: number;
  failureCount: number;
  lastProbeAt: number | null;
  lastError: string | null;
  lastProbe: OrbitflareWebsocketProbe | null;
}

export interface OrbitflareAdvancedProbe {
  timestamp: number;
  durationMs: number;
  successCount: number;
  failureCount: number;
  summary: {
    genesisHash: string | null;
    firstAvailableBlock: number | null;
    highestSnapshotSlot: {
      full: number | null;
      incremental: number | null;
    } | null;
    epochSchedule: {
      slotsPerEpoch: number | null;
      warmup: boolean;
    } | null;
    supply: {
      total: number | null;
      circulating: number | null;
      nonCirculating: number | null;
    } | null;
    inflationRate: {
      total: number;
      validator: number;
      foundation: number;
      epoch: number;
    } | null;
    clusterNodes: {
      count: number;
    };
    performanceSamples: {
      sampleCount: number;
      latestTransactions: number;
      latestSlots: number;
    };
  };
  rpcCalls: OrbitflareRpcCallMeta[];
}

export interface OrbitflareSubmissionResult {
  success: boolean;
  signature: string | null;
  txVersion: string | null;
  submittedAt: number;
  completedAt: number;
  sendLatencyMs: number | null;
  confirmLatencyMs: number | null;
  latencyMs: number;
  confirmationStatus: string | null;
  error: string | null;
  explorerUrl: string | null;
  rpcCalls: OrbitflareRpcCallMeta[];
}

export interface OrbitflareSubmissionSnapshot {
  total: number;
  success: number;
  failure: number;
  lastSubmittedAt: number | null;
  lastError: string | null;
  lastSubmission: OrbitflareSubmissionResult | null;
}

export interface OrbitflareScorePayload {
  total: number;
  max: number;
  tier: "A" | "B" | "C" | "D";
  generatedAt: number;
  breakdown: {
    methodCoverage: {
      score: number;
      max: number;
      methodCount: number;
      targetCount: number;
    };
    callVolume: {
      score: number;
      max: number;
      totalCalls: number;
      targetCalls: number;
    };
    successRate: {
      score: number;
      max: number;
      successRate: number | null;
    };
    streamHealth: {
      score: number;
      max: number;
      connected: boolean;
      reconnectCount: number;
    };
    opsReadiness: {
      score: number;
      max: number;
      configured: boolean;
      activeLicenses: number;
      whitelisted: boolean;
    };
  };
}
