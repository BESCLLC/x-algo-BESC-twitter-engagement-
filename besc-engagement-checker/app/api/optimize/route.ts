import { NextRequest, NextResponse } from "next/server";
import { optimizePost } from "@/lib/optimize";
import { parseAnalyzeRequest } from "@/lib/request";
import { analyzePost, getCharLimit } from "@/lib/scoring";
import { generateRewriteCandidates, ollamaConfigured } from "@/lib/ollama";
import type { AICandidate, AIStatus, AnalyzeRequest } from "@/lib/types";

export async function POST(req: NextRequest) {
  let body: Partial<AnalyzeRequest>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseAnalyzeRequest(body);
  if (!parsed) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const result = optimizePost(parsed);

  if (!ollamaConfigured()) {
    return NextResponse.json({ ...result, aiStatus: "disabled" satisfies AIStatus });
  }

  try {
    const candidates = await generateRewriteCandidates(
      result.optimizedText,
      2,
      getCharLimit(parsed.isVerified)
    );
    const scored: AICandidate[] = candidates
      .map((text) => ({ text, score: analyzePost({ ...parsed, text }).score }))
      .filter((c) => c.score > result.after.score)
      .sort((a, b) => b.score - a.score);

    if (scored.length > 0) {
      return NextResponse.json({
        ...result,
        aiStatus: "found" satisfies AIStatus,
        aiCandidates: scored,
      });
    }
    return NextResponse.json({ ...result, aiStatus: "no_improvement" satisfies AIStatus });
  } catch (err) {
    // The AI rewrite is a bonus layer on top of the always-available
    // deterministic optimizer — a failure here should never break the
    // response, just fall through and return the mechanical result with an
    // honest status instead of silently pretending AI wasn't attempted.
    console.error("[optimize] Ollama rewrite failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ...result, aiStatus: "error" satisfies AIStatus });
  }
}
