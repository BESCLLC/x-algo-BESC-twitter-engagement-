"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  Loader2,
  RefreshCw,
  Trash2,
  TrendingUp,
  Clock,
  CheckCircle2,
  Brain,
  AtSign,
} from "lucide-react";
import type { CalibrationSide, TrackRecord, TrackSummary, TrackedPost } from "@/lib/types";

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default function TrackRecordPanel({
  handle,
  onHandleChange,
}: {
  handle: string;
  onHandleChange?: (h: string) => void;
}) {
  const [record, setRecord] = useState<TrackRecord & { enabled: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [learning, setLearning] = useState(false);
  const [learnNote, setLearnNote] = useState<string | null>(null);

  async function learnFromHistory() {
    if (!handle.trim() || learning) return;
    setLearning(true);
    setError(null);
    setLearnNote(null);
    try {
      const res = await fetch("/api/track/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: handle.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Couldn't read your history");
      if (data.enabled === false) throw new Error("Tracking isn't set up on this deployment yet.");

      const c = data.calibration;
      if (!c || c.n < c.minimumForFit) {
        setLearnNote(
          `Read ${data.fetched} posts (${data.usable} usable). Need at least ${c?.minimumForFit ?? 40} posts with view counts before the score can be fitted to your results — heuristics are still in use.`
        );
      } else if (!c.actions?.length) {
        setLearnNote(
          `Read ${data.fetched} posts. Nothing generalised out of sample, so the score stays on the heuristics rather than pretending to have learned something.`
        );
      } else {
        const learned = c.actions.map((a: { action: string; cvR2: number }) => `${a.action} (R²${a.cvR2.toFixed(2)})`).join(", ");
        setLearnNote(
          `Learned from ${c.n} of your posts. Now predicting ${learned} from your own results — the score is ${Math.round(c.strength * 100)}% fitted, ${Math.round((1 - c.strength) * 100)}% heuristic.`
        );
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLearning(false);
    }
  }

  const load = useCallback(async () => {
    if (!handle.trim()) {
      setRecord(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/track?handle=${encodeURIComponent(handle.trim())}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Couldn't load your track record");
      setRecord(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [handle]);

  useEffect(() => {
    load();
  }, [load]);

  async function sync() {
    if (!handle.trim() || syncing) return;
    setSyncing(true);
    setError(null);
    setSyncNote(null);
    try {
      const res = await fetch("/api/track/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: handle.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Sync failed");
      setRecord(data);
      setSyncNote(
        data.matched === 0 && data.refreshed === 0
          ? "Nothing new yet — post one of these and check back."
          : `Matched ${data.matched} new post${data.matched === 1 ? "" : "s"}, refreshed ${data.refreshed}.`
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  async function remove(id: number) {
    try {
      const res = await fetch(
        `/api/track?handle=${encodeURIComponent(handle.trim())}&id=${id}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (res.ok) setRecord(data);
    } catch {
      // Non-critical: the row stays listed and can be removed again.
    }
  }

  if (!handle.trim()) {
    return (
      <div className="glass-panel p-6">
        <Header />
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/45">
          This is where the score stops being an average. Give it your handle and it reads
          your published posts and their real numbers, then fits the score to what actually
          works for your account — and checks its own predictions against every post you
          publish from here.
        </p>
        {/* Entered here rather than only in the composer's collapsed context
            panel: this is where someone is standing when they want to
            calibrate, and making them hunt for the field breaks the flow. */}
        {onHandleChange && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const value = new FormData(e.currentTarget).get("handle");
              if (typeof value === "string" && value.trim()) onHandleChange(value.trim());
            }}
            className="mt-4 flex max-w-md items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-3.5 py-2.5"
          >
            <AtSign className="h-4 w-4 shrink-0 text-white/30" />
            <input
              name="handle"
              placeholder="yourhandle"
              autoComplete="off"
              className="w-full min-w-0 bg-transparent text-sm text-white/80 placeholder:text-white/25 focus:outline-none"
            />
            <button
              type="submit"
              className="shrink-0 rounded-full bg-besc-500 px-3.5 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-besc-400"
            >
              Start
            </button>
          </form>
        )}
      </div>
    );
  }

  if (record && !record.enabled) {
    return (
      <div className="glass-panel p-6">
        <Header />
        <p className="mt-3 text-sm leading-relaxed text-white/45">
          Tracking needs a database and none is attached to this deployment. Everything else
          in the app works as normal — add a <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[13px]">DATABASE_URL</code>{" "}
          to turn this on.
        </p>
      </div>
    );
  }

  const posts = record?.posts ?? [];
  const summary = record?.summary;

  return (
    <div className="glass-panel p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Header />
        <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={learnFromHistory}
          disabled={learning}
          title="Read your published posts and their real numbers, then fit the score to your own results"
          className="flex items-center gap-1.5 rounded-full border border-besc-400/40 bg-besc-500/10 px-3.5 py-1.5 text-xs font-medium text-besc-200 transition-colors hover:bg-besc-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {learning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
          {learning ? "Reading your history…" : "Learn from my history"}
        </button>
        <button
          type="button"
          onClick={sync}
          disabled={syncing}
          className="flex items-center gap-1.5 rounded-full border border-besc-400/40 bg-besc-500/10 px-3.5 py-1.5 text-xs font-medium text-besc-200 transition-colors hover:bg-besc-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {syncing ? "Checking X…" : "Check for results"}
        </button>
        </div>
      </div>

      {error && <p className="mt-3 text-xs text-danger">{error}</p>}
      {syncNote && !error && <p className="mt-3 text-xs text-white/40">{syncNote}</p>}
      {learnNote && !error && (
        <p className="mt-3 rounded-xl border border-besc-400/25 bg-besc-500/[0.06] p-3 text-[12.5px] leading-relaxed text-besc-100/80">
          {learnNote}
        </p>
      )}

      {summary && <Summary summary={summary} />}

      {loading && posts.length === 0 ? (
        <p className="mt-4 text-sm text-white/35">Loading…</p>
      ) : posts.length === 0 ? (
        <p className="mt-4 text-sm leading-relaxed text-white/45">
          Nothing tracked yet. Score a draft above, then hit{" "}
          <span className="text-besc-300">Track this post</span> before you publish it.
        </p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {posts.map((post) => (
            <PostRow key={post.id} post={post} onRemove={() => remove(post.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Header() {
  return (
    <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
      <Activity className="h-4.5 w-4.5 text-besc-300" />
      Your track record
    </h2>
  );
}

function Summary({ summary }: { summary: TrackSummary }) {
  const remaining = summary.minimumForInsights - summary.measured;

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap gap-2 text-[11px] text-white/40">
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
          {summary.tracked} tracked
        </span>
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1">
          {summary.measured} with real numbers
        </span>
      </div>

      {!summary.scoreSplit ? (
        <p className="text-[12.5px] leading-relaxed text-white/45">
          {remaining > 0 ? (
            <>
              Need {remaining} more published post{remaining === 1 ? "" : "s"} with real numbers
              before any pattern here means anything. Engagement data is noisy — calling a trend
              on a handful of posts would just be making things up.
            </>
          ) : (
            <>Not enough spread in the data yet to compare.</>
          )}
        </p>
      ) : (
        <div className="rounded-xl border border-besc-400/25 bg-besc-500/[0.06] p-3.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-besc-200">
            <TrendingUp className="h-3.5 w-3.5" />
            Does the score actually predict your reach?
          </p>
          <div className="mt-2.5 grid grid-cols-2 gap-3">
            <SplitCard label="Higher-scoring half" side={summary.scoreSplit.higher} accent />
            <SplitCard label="Lower-scoring half" side={summary.scoreSplit.lower} />
          </div>
          <p className="mt-2.5 text-[11px] leading-relaxed text-white/40">
            Medians, not averages, so one viral post can&apos;t invent a trend. If the two
            columns look the same, the score isn&apos;t predicting anything for your account
            yet — and this panel will keep saying so.
          </p>
        </div>
      )}

      {summary.fixInsights.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-black/25 p-3.5">
          <p className="text-xs font-semibold text-white/70">What actually moved your numbers</p>
          <ul className="mt-2 space-y-1.5">
            {summary.fixInsights.map((insight) => (
              <li key={insight.fixId} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                <span className="text-white/60">{insight.label}</span>
                <span className="shrink-0 font-mono tabular-nums text-white/45">
                  {insight.lift === null ? (
                    <>
                      {compact(insight.medianEngagementsWith)} vs {compact(insight.medianEngagementsWithout)}
                    </>
                  ) : (
                    <span className={insight.lift >= 1.15 ? "text-besc-300" : insight.lift <= 0.85 ? "text-danger" : ""}>
                      {insight.lift.toFixed(2)}×
                    </span>
                  )}
                  <span className="ml-1.5 text-white/25">
                    n={insight.withN}/{insight.withoutN}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SplitCard({
  label,
  side,
  accent,
}: {
  label: string;
  side: CalibrationSide;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-2.5 ${accent ? "border-besc-400/30 bg-besc-500/10" : "border-white/10 bg-white/[0.02]"}`}>
      <p className="text-[10.5px] uppercase tracking-wide text-white/35">{label}</p>
      <p className="mt-1 font-mono text-[13px] tabular-nums text-white/75">
        {compact(side.medianViews)} <span className="text-[10.5px] text-white/35">views</span>
      </p>
      <p className="font-mono text-[13px] tabular-nums text-white/75">
        {compact(side.medianEngagements)} <span className="text-[10.5px] text-white/35">engagements</span>
      </p>
      <p className="mt-1 text-[10.5px] text-white/30">
        score ~{side.medianPredicted.toFixed(0)} · n={side.n}
      </p>
    </div>
  );
}

function PostRow({ post, onRemove }: { post: TrackedPost; onRemove: () => void }) {
  return (
    <li className="rounded-xl border border-white/10 bg-black/25 p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-white/70">
          {post.draftText.length > 160 ? `${post.draftText.slice(0, 160)}…` : post.draftText}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <span className="font-mono text-xs font-semibold tabular-nums text-besc-300">
            {post.predictedScore.toFixed(1)}
          </span>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Stop tracking this post"
            className="text-white/25 transition-colors hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        {!post.tweetId ? (
          <span className="flex items-center gap-1 text-white/30">
            <Clock className="h-3 w-3" /> Waiting for you to publish this
          </span>
        ) : !post.metrics ? (
          <span className="flex items-center gap-1 text-white/40">
            <CheckCircle2 className="h-3 w-3 text-besc-400/70" /> Published — measuring shortly
          </span>
        ) : (
          <>
            <Metric label="views" value={post.metrics.views} />
            <Metric label="likes" value={post.metrics.likes} />
            <Metric label="replies" value={post.metrics.replies} />
            <Metric label="reposts" value={post.metrics.retweets} />
            <Metric label="quotes" value={post.metrics.quotes} />
            <Metric label="bookmarks" value={post.metrics.bookmarks} />
            {post.tweetId && (
              <a
                href={`https://x.com/i/status/${post.tweetId}`}
                target="_blank"
                rel="noreferrer"
                className="text-besc-300/70 hover:text-besc-300"
              >
                open post
              </a>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <span className="font-mono tabular-nums text-white/50">
      {compact(value)} <span className="text-white/25">{label}</span>
    </span>
  );
}
