const {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID
} = require("../config/constants");
const { PublicKey } = require("@solana/web3.js");

const TOKEN_PROGRAM_IDS = new Set([TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]);

function toInstructionList(message) {
  return (
    message?.transaction?.transaction?.message?.instructions ||
    message?.transaction?.message?.instructions ||
    message?.message?.instructions ||
    []
  );
}

function toAccountKeys(message) {
  return (
    message?.transaction?.transaction?.message?.accountKeys ||
    message?.transaction?.message?.accountKeys ||
    message?.message?.accountKeys ||
    []
  );
}

function toBuffer(value) {
  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (value?.type === "Buffer" && Array.isArray(value.data)) {
    return Buffer.from(value.data);
  }

  if (Array.isArray(value)) {
    return Buffer.from(value);
  }

  if (typeof value === "string") {
    try {
      return Buffer.from(value, "base64");
    } catch (error) {
      return null;
    }
  }

  return null;
}

function toBase58Pubkey(value) {
  const buffer = toBuffer(value);

  if (!buffer || !buffer.length) {
    return null;
  }

  try {
    return new PublicKey(buffer).toBase58();
  } catch (error) {
    return null;
  }
}

function toSignature(message) {
  const direct =
    message?.signature ||
    message?.transaction?.signature ||
    message?.transaction?.transaction?.signature;

  if (typeof direct === "string" && direct.length > 0) {
    return direct;
  }

  if (Buffer.isBuffer(direct)) {
    return direct.toString("base64");
  }

  const first =
    message?.transaction?.transaction?.signatures?.[0] ||
    message?.transaction?.signatures?.[0];

  if (typeof first === "string") {
    return first;
  }

  if (Buffer.isBuffer(first)) {
    return first.toString("base64");
  }

  return "";
}

function toSlot(message) {
  const slot =
    message?.slot ||
    message?.transaction?.slot ||
    message?.transaction?.transaction?.slot ||
    0;

  if (typeof slot === "bigint") {
    return Number(slot);
  }

  const parsed = Number(slot);
  return Number.isFinite(parsed) ? parsed : 0;
}

function extractParsedTransfer(parsedInfo) {
  const rawAmount =
    parsedInfo?.amount ||
    parsedInfo?.tokenAmount?.amount ||
    parsedInfo?.uiTokenAmount?.amount;

  const amountRaw = Number(rawAmount);
  if (!Number.isFinite(amountRaw) || amountRaw <= 0) {
    return null;
  }

  let decimals = Number(parsedInfo?.tokenAmount?.decimals);
  if (!Number.isFinite(decimals)) {
    decimals = Number(parsedInfo?.uiTokenAmount?.decimals);
  }

  if (!Number.isFinite(decimals)) {
    decimals = 9;
  }

  return { amountRaw, decimals };
}

function readU64LE(data) {
  if (!data || data.length < 9) {
    return null;
  }

  try {
    const amountRaw = Number(data.readBigUInt64LE(1));
    return Number.isFinite(amountRaw) && amountRaw > 0 ? amountRaw : null;
  } catch (error) {
    return null;
  }
}

function buildTokenBalanceIndex(message) {
  const preTokenBalances =
    message?.transaction?.transaction?.meta?.preTokenBalances ||
    message?.transaction?.meta?.preTokenBalances ||
    [];

  const postTokenBalances =
    message?.transaction?.transaction?.meta?.postTokenBalances ||
    message?.transaction?.meta?.postTokenBalances ||
    [];

  const index = new Map();

  for (const entry of [...preTokenBalances, ...postTokenBalances]) {
    const accountIndex = Number(entry?.accountIndex);
    const decimals = Number(entry?.uiTokenAmount?.decimals);

    if (!Number.isFinite(accountIndex) || !Number.isFinite(decimals)) {
      continue;
    }

    if (!index.has(accountIndex)) {
      index.set(accountIndex, decimals);
    }
  }

  return index;
}

function parseCompiledTransfer(instruction, accountKeys, tokenBalanceIndex) {
  const programIdIndex = Number(instruction?.programIdIndex);
  if (!Number.isFinite(programIdIndex)) {
    return null;
  }

  const programId = toBase58Pubkey(accountKeys[programIdIndex]);
  if (!programId || !TOKEN_PROGRAM_IDS.has(programId)) {
    return null;
  }

  const data = toBuffer(instruction?.data);
  const amountRaw = readU64LE(data);
  if (!data || amountRaw === null) {
    return null;
  }

  const opcode = data[0];
  if (opcode !== 3 && opcode !== 12) {
    return null;
  }

  const accountIndexes = Array.from(toBuffer(instruction?.accounts) || []);
  if (accountIndexes.length < 2) {
    return null;
  }

  const sourceIndex = accountIndexes[0];
  const destinationIndex = opcode === 12 ? accountIndexes[2] : accountIndexes[1];
  const mintIndex = opcode === 12 ? accountIndexes[1] : null;

  let decimals = opcode === 12 && data.length >= 10 ? data[9] : null;
  if (!Number.isFinite(decimals)) {
    decimals = tokenBalanceIndex.get(sourceIndex) || tokenBalanceIndex.get(destinationIndex) || 9;
  }

  return {
    amountRaw,
    decimals,
    source: toBase58Pubkey(accountKeys[sourceIndex]),
    destination: toBase58Pubkey(accountKeys[destinationIndex]),
    mint: mintIndex === null ? null : toBase58Pubkey(accountKeys[mintIndex])
  };
}

async function parseTransaction(message) {
  const instructions = toInstructionList(message);
  const accountKeys = toAccountKeys(message);
  const tokenBalanceIndex = buildTokenBalanceIndex(message);

  if (!instructions.length) {
    return null;
  }

  const signature = toSignature(message);
  const slot = toSlot(message);
  const transfers = [];

  for (const instruction of instructions) {
    const parsed = instruction?.parsed;
    const parsedType = parsed?.type;
    const programId = instruction?.programId || instruction?.program;

    if (!parsed || !parsedType) {
      const compiledTransfer = parseCompiledTransfer(instruction, accountKeys, tokenBalanceIndex);
      if (compiledTransfer) {
        transfers.push(compiledTransfer);
      }
      continue;
    }

    if (parsedType !== "transfer" && parsedType !== "transferChecked") {
      continue;
    }

    if (programId && !TOKEN_PROGRAM_IDS.has(programId)) {
      continue;
    }

    const parsedTransfer = extractParsedTransfer(parsed.info);

    if (!parsedTransfer) {
      continue;
    }

    transfers.push({
      amountRaw: parsedTransfer.amountRaw,
      decimals: parsedTransfer.decimals,
      source: parsed.info?.source || null,
      destination: parsed.info?.destination || null,
      mint: parsed.info?.mint || null
    });
  }

  if (!transfers.length) {
    return null;
  }

  return {
    signature,
    slot,
    transfers
  };
}

module.exports = { parseTransaction };
