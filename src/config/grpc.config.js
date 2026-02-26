const { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } = require("./constants");

let grpcModulePromise;

async function getGrpcModule() {
  if (!grpcModulePromise) {
    grpcModulePromise = import("@kdt-sol/solana-grpc-client")
      .then((module) => {
        if (!module?.yellowstone?.YellowstoneGeyserClient) {
          throw new Error("Invalid solana-grpc-client module: missing yellowstone client export");
        }
        return module;
      })
      .catch((error) => {
        grpcModulePromise = null;
        throw error;
      });
  }

  return grpcModulePromise;
}

function normalizeGrpcUrl(rawUrl) {
  const value = String(rawUrl || "").trim();
  if (!value) {
    return value;
  }

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  return `https://${value}`;
}

async function createOrbitFlareClient() {
  if (!process.env.ORBITFLARE_GRPC_URL) {
    throw new Error("ORBITFLARE_GRPC_URL is required");
  }

  const grpcModule = await getGrpcModule();
  const grpcUrl = normalizeGrpcUrl(process.env.ORBITFLARE_GRPC_URL);

  return new grpcModule.yellowstone.YellowstoneGeyserClient(grpcUrl, {
    ...(process.env.ORBITFLARE_API_KEY
      ? {
          token: process.env.ORBITFLARE_API_KEY,
          tokenMetadataKey: "x-api-key"
        }
      : {}),
    "grpc.max_receive_message_length": 1024 * 1024 * 100
  });
}

function envAllowsProgramFilter() {
  return String(process.env.ORBITFLARE_GRPC_USE_PROGRAM_FILTER || "true").toLowerCase() !== "false";
}

function createTransactionFilter({ includePrograms = [] } = {}) {
  const accountInclude = includePrograms.filter(Boolean);

  return {
    vote: false,
    failed: false,
    accountInclude,
    accountExclude: [],
    accountRequired: []
  };
}

function buildSubscribeRequest(options = {}) {
  const filtered = options.filtered !== false;
  const useProgramFilter = filtered && options.useProgramFilter !== false && envAllowsProgramFilter();
  const includePrograms = useProgramFilter
    ? [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID].filter(Boolean)
    : [];

  return {
    accounts: {},
    slots: {},
    transactionsStatus: {},
    blocks: {},
    blocksMeta: {},
    entry: {},
    accountsDataSlice: [],
    commitment: 1,
    transactions: filtered
      ? {
          txFeed: {
            ...createTransactionFilter({ includePrograms })
          }
        }
      : {}
  };
}

function buildFallbackSubscribeRequest() {
  return {
    accounts: {},
    slots: {},
    transactions: {
      all: {
        ...createTransactionFilter({ includePrograms: [] })
      }
    },
    transactionsStatus: {},
    blocks: {},
    blocksMeta: {},
    entry: {},
    accountsDataSlice: [],
    commitment: 1
  };
}

module.exports = {
  createOrbitFlareClient,
  buildSubscribeRequest,
  buildFallbackSubscribeRequest
};
