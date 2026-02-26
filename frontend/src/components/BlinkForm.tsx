import React, { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { Zap, Link as LinkIcon, Copy, Check, Wallet } from "lucide-react";
import { BlinkLatency, GenerateBlinkInput } from "../types/backend";
import { buildSolflareBrowseUrl, openBlinkInWallet } from "../lib/wallet";

interface BlinkFormProps {
  onGenerate: (input: GenerateBlinkInput) => Promise<string | null>;
  generating: boolean;
  blinkUrl: string;
  latency: BlinkLatency;
  defaultToken: string;
  supportedTokens: string[];
}

const ACTION_TYPES = ["SWAP", "DONATE", "MINT"];
const MINT_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function normalizeTokenValue(value: string) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "SOL";
  }

  if (MINT_ADDRESS_REGEX.test(raw)) {
    return raw;
  }

  return raw.toUpperCase();
}

export function BlinkForm({ onGenerate, generating, blinkUrl, latency, defaultToken, supportedTokens }: BlinkFormProps) {
  const [copied, setCopied] = useState(false);
  const [actionType, setActionType] = useState("TRADE");
  const [token, setToken] = useState(defaultToken || "SOL");
  const [amount, setAmount] = useState("10");

  const hasBlink = useMemo(() => Boolean(blinkUrl), [blinkUrl]);
  const solflareUrl = useMemo(() => buildSolflareBrowseUrl(blinkUrl), [blinkUrl]);

  useEffect(() => {
    if (defaultToken) {
      setToken(normalizeTokenValue(defaultToken));
    }
  }, [defaultToken]);

  async function handleGenerate() {
    const parsedAmount = Number(amount);

    await onGenerate({
      token,
      actionType,
      amount: Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : undefined
    });
  }

  async function handleCopy() {
    if (!blinkUrl) {
      return;
    }

    await navigator.clipboard.writeText(blinkUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="glass-panel rounded-2xl p-6 relative overflow-hidden neon-border-cyan group">
      <motion.div
        animate={{
          backgroundPosition: ["0% 0%", "100% 100%", "0% 0%"],
          opacity: [0.5, 0.8, 0.5]
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
        className="absolute top-0 left-0 w-[200%] h-[200%] bg-[radial-gradient(ellipse_at_top_right,rgba(0,243,255,0.15),transparent_50%)] pointer-events-none"
      />

      <h3 className="text-sm font-bold tracking-widest text-white mb-6 flex items-center gap-2 relative z-10">
        <Zap className="w-4 h-4 text-[#00f3ff]" />
        ACTION BLINK GENERATOR
      </h3>

      <div className="space-y-4 relative z-10">
        <div>
          <label className="text-xs text-gray-400 mb-1 block">ACTION TYPE</label>
          <div className="grid grid-cols-3 gap-2">
            {ACTION_TYPES.map((type) => (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                key={type}
                onClick={() => setActionType(type)}
                className={`py-2 text-xs font-bold rounded-lg border transition-colors ${
                  actionType === type
                    ? "bg-[#00f3ff]/20 border-[#00f3ff]/50 text-[#00f3ff] shadow-[0_0_10px_rgba(0,243,255,0.2)]"
                    : "bg-black/40 border-white/10 text-gray-400 hover:border-white/30 hover:text-white"
                }`}
              >
                {type}
              </motion.button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-400 mb-1 block">TOKEN</label>
          <motion.select
            whileFocus={{ scale: 1.01 }}
            value={token}
            onChange={(event) => setToken(normalizeTokenValue(event.target.value))}
            className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-sm font-mono text-white outline-none focus:border-[#00f3ff]/50 transition-all"
          >
            {supportedTokens.length ? (
              supportedTokens.map((symbol) => (
                <option key={symbol} value={symbol}>
                  {symbol}
                </option>
              ))
            ) : (
              <option value={token}>{token}</option>
            )}
          </motion.select>
        </div>

        <div>
          <label className="text-xs text-gray-400 mb-1 block">DEFAULT AMOUNT (OPTIONAL)</label>
          <div className="relative">
            <motion.input
              whileFocus={{ scale: 1.01, boxShadow: "0 0 15px rgba(0,243,255,0.2)" }}
              type="number"
              min="0"
              step="0.0001"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.00"
              className="w-full bg-black/50 border border-white/10 rounded-lg px-4 py-3 text-sm font-mono text-white outline-none focus:border-[#00f3ff]/50 transition-all"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-500">{token}</span>
          </div>
        </div>

        <motion.button
          whileHover={{ scale: 1.02, boxShadow: "0 0 20px rgba(188,19,254,0.4)" }}
          whileTap={{ scale: 0.98 }}
          onClick={() => void handleGenerate()}
          disabled={generating}
          className="w-full py-3 mt-2 rounded-lg bg-gradient-to-r from-[#00f3ff]/20 to-[#bc13fe]/20 border border-[#00f3ff]/50 text-white font-bold tracking-widest hover:from-[#00f3ff]/30 hover:to-[#bc13fe]/30 transition-all relative overflow-hidden group disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {generating ? (
            <span className="flex items-center justify-center gap-2 font-mono text-[#00f3ff]">
              <div className="w-4 h-4 border-2 border-[#00f3ff] border-t-transparent rounded-full animate-spin" />
              COMPILING...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2 group-hover:text-[#00f3ff] transition-colors">
              <LinkIcon className="w-4 h-4" />
              GENERATE BLINK URL
            </span>
          )}
        </motion.button>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 p-3 bg-black/60 border border-[#00f3ff]/30 rounded-lg flex items-center justify-between group"
        >
          <span className="text-xs font-mono text-[#00f3ff] truncate mr-4">
            {hasBlink ? blinkUrl : "Waiting for backend blink generation..."}
          </span>
          <button
            onClick={() => void handleCopy()}
            className="p-1.5 rounded bg-[#00f3ff]/10 text-[#00f3ff] hover:bg-[#00f3ff]/20 transition-colors shrink-0 disabled:opacity-40"
            disabled={!hasBlink}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <motion.button
            whileHover={{ scale: hasBlink ? 1.02 : 1 }}
            whileTap={{ scale: hasBlink ? 0.98 : 1 }}
            onClick={() => openBlinkInWallet(blinkUrl)}
            disabled={!hasBlink}
            className="rounded-lg border border-[#ff6a00]/40 bg-[#ff6a00]/15 px-3 py-2 text-xs font-bold tracking-widest text-[#ffb37d] hover:bg-[#ff6a00]/25 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Wallet className="w-4 h-4" />
            OPEN IN WALLET
          </motion.button>

          <motion.a
            whileHover={{ scale: hasBlink ? 1.02 : 1 }}
            whileTap={{ scale: hasBlink ? 0.98 : 1 }}
            href={hasBlink ? solflareUrl : undefined}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(event) => {
              if (!hasBlink) {
                event.preventDefault();
              }
            }}
            className={`rounded-lg border px-3 py-2 text-xs font-bold tracking-widest flex items-center justify-center gap-2 ${
              hasBlink
                ? "border-[#00f3ff]/40 bg-[#00f3ff]/10 text-[#8cf8ff] hover:bg-[#00f3ff]/20"
                : "border-[#00f3ff]/20 bg-[#00f3ff]/5 text-[#8cf8ff]/50 cursor-not-allowed"
            }`}
          >
            <LinkIcon className="w-4 h-4" />
            OPEN IN SOLFLARE
          </motion.a>
        </div>

        <div className="text-[11px] font-mono text-gray-500">
          Wallet flow: open Blink with Solflare/compatible wallet, review transaction, then approve/sign.
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-2">
            <div className="text-[10px] text-gray-400">TOTAL</div>
            <div className="text-xs font-mono text-[#00f3ff]">{latency.total}ms</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-2">
            <div className="text-[10px] text-gray-400">QUOTE</div>
            <div className="text-xs font-mono text-[#00f3ff]">{latency.quoteLatency}ms</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-2">
            <div className="text-[10px] text-gray-400">SIMULATION</div>
            <div className="text-xs font-mono text-[#00f3ff]">{latency.simulationLatency}ms</div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-2">
            <div className="text-[10px] text-gray-400">BLINK</div>
            <div className="text-xs font-mono text-[#00f3ff]">{latency.blinkLatency}ms</div>
          </div>
        </div>
      </div>
    </div>
  );
}
