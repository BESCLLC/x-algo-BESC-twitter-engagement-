"use client";

import { useEffect, useRef, useState } from "react";
import {
  Image as ImageIcon,
  Film,
  Sticker,
  Ban,
  Link2,
  Users,
  Repeat2,
  Download,
  Loader2,
} from "lucide-react";
import type { AnalyzeRequest, MediaType, ScoreResult, TweetImportResult } from "@/lib/types";

const MEDIA_OPTIONS: { id: MediaType; label: string; icon: typeof ImageIcon }[] = [
  { id: "none", label: "Text only", icon: Ban },
  { id: "photo", label: "Photo", icon: ImageIcon },
  { id: "video", label: "Video", icon: Film },
  { id: "gif", label: "GIF", icon: Sticker },
];

const CHAR_LIMIT = 280;

export default function Composer({
  onResult,
  onLoading,
  onImport,
}: {
  onResult: (r: ScoreResult | null) => void;
  onLoading: (b: boolean) => void;
  onImport?: (r: TweetImportResult | null) => void;
}) {
  const [text, setText] = useState(
    "Just shipped something I've been heads-down on for weeks. What's one thing you'd want it to do next?"
  );
  const [mediaType, setMediaType] = useState<MediaType>("photo");
  const [link, setLink] = useState("");
  const [isReplyToMutual, setIsReplyToMutual] = useState(false);
  const [nsfw, setNsfw] = useState(false);
  const [recentPostsCount, setRecentPostsCount] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  async function importFromUrl() {
    if (!importUrl.trim() || importing) return;
    setImporting(true);
    setImportError(null);
    onImport?.(null);
    try {
      const res = await fetch("/api/fetch-tweet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: importUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Import failed");
      const imported = data as TweetImportResult;
      setText(imported.text);
      setMediaType(imported.mediaType);
      setLink(imported.link);
      setRecentPostsCount(imported.recentPostsCount);
      onImport?.(imported);
    } catch (e) {
      setImportError((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  async function analyze() {
    if (!text.trim()) {
      onResult(null);
      return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    onLoading(true);
    try {
      const payload: AnalyzeRequest = {
        text,
        mediaType,
        link,
        isReplyToMutual,
        recentPostsCount,
        nsfw,
      };
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("analyze failed");
      const data: ScoreResult = await res.json();
      onResult(data);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        onResult(null);
      }
    } finally {
      if (controllerRef.current === controller) onLoading(false);
    }
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(analyze, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, mediaType, link, isReplyToMutual, nsfw, recentPostsCount]);

  const chars = text.length;
  const overLimit = chars > CHAR_LIMIT;

  return (
    <div className="glass-panel p-5 sm:p-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Draft your post</h2>
        <span
          className={`font-mono text-xs tabular-nums ${
            overLimit ? "text-danger" : "text-white/35"
          }`}
        >
          {chars}/{CHAR_LIMIT}
        </span>
      </div>

      <div className="mb-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-3.5 py-2.5">
        <Download className="h-4 w-4 shrink-0 text-white/30" />
        <input
          value={importUrl}
          onChange={(e) => setImportUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && importFromUrl()}
          placeholder="Or paste a live x.com/…/status/… link to score a real post"
          className="w-full bg-transparent text-sm text-white/80 placeholder:text-white/25 focus:outline-none"
        />
        <button
          type="button"
          onClick={importFromUrl}
          disabled={!importUrl.trim() || importing}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-besc-400/40 bg-besc-500/10 px-3 py-1 text-xs font-medium text-besc-200 transition-colors hover:bg-besc-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Import
        </button>
      </div>
      {importError && <p className="mb-4 -mt-2 text-xs text-danger">{importError}</p>}

      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onImport?.(null);
        }}
        placeholder="What's happening?"
        rows={5}
        className="w-full resize-none rounded-2xl border border-white/10 bg-black/30 p-4 text-[15px] leading-relaxed text-white/90 placeholder:text-white/25 focus:border-besc-400/50 focus:outline-none focus:ring-2 focus:ring-besc-400/20"
      />

      <div className="mt-4 flex flex-wrap gap-2">
        {MEDIA_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = mediaType === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setMediaType(opt.id)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "border-besc-400/50 bg-besc-500/15 text-besc-200"
                  : "border-white/10 bg-white/[0.03] text-white/50 hover:text-white/80"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {opt.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-3.5 py-2.5">
        <Link2 className="h-4 w-4 shrink-0 text-white/30" />
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="Optional link you're posting (paste the exact URL)"
          className="w-full bg-transparent text-sm text-white/80 placeholder:text-white/25 focus:outline-none"
        />
      </div>

      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        <label className="flex cursor-pointer items-center justify-between gap-2 rounded-2xl border border-white/10 bg-black/20 px-3.5 py-2.5">
          <span className="flex items-center gap-2 text-sm text-white/70">
            <Users className="h-4 w-4 text-white/35" />
            Reply to a mutual follower
          </span>
          <input
            type="checkbox"
            checked={isReplyToMutual}
            onChange={(e) => setIsReplyToMutual(e.target.checked)}
            className="h-4 w-4 accent-besc-500"
          />
        </label>

        <label className="flex cursor-pointer items-center justify-between gap-2 rounded-2xl border border-white/10 bg-black/20 px-3.5 py-2.5">
          <span className="flex items-center gap-2 text-sm text-white/70">
            <Ban className="h-4 w-4 text-white/35" />
            Contains sensitive media
          </span>
          <input
            type="checkbox"
            checked={nsfw}
            onChange={(e) => setNsfw(e.target.checked)}
            className="h-4 w-4 accent-besc-500"
          />
        </label>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-3.5 py-2.5">
        <span className="flex items-center gap-2 text-sm text-white/70">
          <Repeat2 className="h-4 w-4 text-white/35" />
          Posts already sent in this window
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setRecentPostsCount((c) => Math.max(0, c - 1))}
            className="h-6 w-6 rounded-full border border-white/15 text-white/60 hover:text-white"
          >
            −
          </button>
          <span className="w-4 text-center font-mono text-sm tabular-nums">
            {recentPostsCount}
          </span>
          <button
            type="button"
            onClick={() => setRecentPostsCount((c) => Math.min(10, c + 1))}
            className="h-6 w-6 rounded-full border border-white/15 text-white/60 hover:text-white"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
