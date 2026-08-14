"use client";

import { motion } from "framer-motion";

const GRADE_STYLES: Record<string, { ring: string; text: string; glow: string }> = {
  Excellent: { ring: "#33cb98", text: "text-besc-300", glow: "shadow-glow" },
  Strong: { ring: "#7c5cff", text: "text-signal", glow: "shadow-glow-lg" },
  Decent: { ring: "#c8ff4d", text: "text-volt", glow: "" },
  Weak: { ring: "#ffb547", text: "text-warn", glow: "" },
  "High Risk": { ring: "#ff5c7c", text: "text-danger", glow: "" },
};

export default function ScoreGauge({
  score,
  grade,
}: {
  score: number;
  grade: string;
}) {
  const style = GRADE_STYLES[grade] ?? GRADE_STYLES.Decent;
  const radius = 88;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, score)) / 100;

  return (
    <div className="relative flex flex-col items-center">
      <div className={`relative h-56 w-56 ${style.glow}`}>
        <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="12"
          />
          <motion.circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke={style.ring}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference * (1 - pct) }}
            transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            key={score}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="font-display text-6xl font-bold tabular-nums tracking-tight"
          >
            {score}
          </motion.span>
          <span className="mt-1 text-xs font-medium uppercase tracking-[0.2em] text-white/40">
            BESC Score
          </span>
        </div>
        <div className="absolute -inset-2 -z-10 animate-pulse-ring rounded-full border border-current opacity-0" style={{ color: style.ring }} />
      </div>
      <div
        className={`mt-4 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-sm font-semibold ${style.text}`}
      >
        {grade}
      </div>
    </div>
  );
}
