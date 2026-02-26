import React from "react";
import { motion } from "motion/react";
import {
  Activity,
  Zap,
  Layers,
  History,
  Settings,
  TerminalSquare,
} from "lucide-react";

const navItems = [
  { id: "dashboard", icon: Activity, label: "Command Center" },
  { id: "blinks", icon: Zap, label: "Blink Gen" },
  { id: "nodes", icon: Layers, label: "Node Topology" },
  { id: "history", icon: History, label: "Event Log" },
  { id: "terminal", icon: TerminalSquare, label: "Trader Hub" },
  { id: "settings", icon: Settings, label: "System Config" },
];

interface SidebarProps {
  active: string;
  onSelect: (section: string) => void;
}

export function Sidebar({ active, onSelect }: SidebarProps) {

  return (
    <nav className="w-20 lg:w-64 flex-shrink-0 glass-panel border-r border-t-0 border-b-0 border-l-0 flex flex-col items-center lg:items-stretch py-6 z-20">
      <div className="flex items-center justify-center lg:justify-start lg:px-6 mb-12">
        <div className="relative">
          <Zap className="w-8 h-8 text-[#00f3ff]" />
          <div className="absolute inset-0 bg-[#00f3ff] blur-md opacity-50 rounded-full" />
        </div>
        <span className="hidden lg:block ml-3 font-bold text-xl tracking-wider neon-text-cyan">
          BLINK<span className="text-white">STREAM</span>
        </span>
      </div>

      <div className="flex flex-col gap-4 px-3 lg:px-4 flex-1">
        {navItems.map((item) => {
          const isActive = active === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`relative flex items-center p-3 lg:px-4 rounded-xl transition-all duration-300 group ${isActive ? "text-[#00f3ff]" : "text-gray-400 hover:text-white"
                }`}
            >
              {isActive && (
                <motion.div
                  layoutId="active-nav"
                  className="absolute inset-0 bg-[#00f3ff]/10 border border-[#00f3ff]/30 rounded-xl"
                  initial={false}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                >
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-[#00f3ff] rounded-r-full shadow-[0_0_10px_#00f3ff]" />
                </motion.div>
              )}

              <Icon
                className={`w-6 h-6 relative z-10 ${isActive ? "drop-shadow-[0_0_8px_rgba(0,243,255,0.8)]" : ""}`}
              />
              <span className="hidden lg:block ml-4 font-medium text-sm tracking-wide relative z-10">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-auto px-4 pb-4 hidden lg:block">
        <div className="p-4 rounded-xl bg-black/40 border border-[#bc13fe]/20 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#bc13fe] to-transparent opacity-50" />
          <div className="text-xs text-gray-400 mb-1">SOLANA MAINNET-BETA</div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#00f3ff] animate-pulse shadow-[0_0_8px_#00f3ff]" />
            <span className="text-sm font-mono text-[#00f3ff]">SYNCED</span>
          </div>
        </div>
      </div>
    </nav>
  );
}
