"use client";

import { motion } from "framer-motion";
import type { ActionRow } from "@/lib/types";

const GROUP_LABEL: Record<ActionRow["group"], string> = {
  engagement: "Engagement",
  clicks: "Clicks",
  attention: "Attention",
  author: "Author",
  negative: "Negative",
};

export default function SignalBreakdown({ actions }: { actions: ActionRow[] }) {
  const maxAbs = Math.max(...actions.map((a) => Math.abs(a.contribution)), 0.001);

  return (
    <div className="glass-panel p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold">Signal breakdown</h3>
        <span className="font-mono text-[11px] text-white/40">
          Final Score = Σ (weight × P(action))
        </span>
      </div>
      <div className="space-y-2.5">
        {actions.map((a, i) => {
          const width = Math.min(100, (Math.abs(a.contribution) / maxAbs) * 100);
          const positive = a.contribution >= 0;
          return (
            <div key={a.id} className="group relative">
              <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate font-medium text-white/90">{a.label}</span>
                  <span className="shrink-0 rounded-full bg-white/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white/35">
                    {GROUP_LABEL[a.group]}
                  </span>
                </div>
                <span
                  className={`shrink-0 font-mono text-xs tabular-nums ${
                    positive ? "text-besc-300" : "text-danger"
                  }`}
                >
                  {positive ? "+" : ""}
                  {a.contribution.toFixed(3)}
                </span>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-white/[0.05]">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${width}%` }}
                  transition={{ duration: 0.7, delay: i * 0.02, ease: [0.16, 1, 0.3, 1] }}
                  className={`h-full rounded-full ${
                    positive
                      ? "bg-gradient-to-r from-besc-500 to-besc-300"
                      : "bg-gradient-to-r from-danger to-danger/60"
                  }`}
                />
              </div>
              <div className="pointer-events-none absolute left-0 top-full z-10 mt-1 w-max max-w-xs rounded-lg border border-white/10 bg-panel px-2.5 py-1.5 text-[11px] text-white/60 opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100">
                weight {a.weight.toFixed(2)} × P {(a.probability * 100).toFixed(0)}%
                <br />
                <span className="text-white/40">{a.weightSource}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
