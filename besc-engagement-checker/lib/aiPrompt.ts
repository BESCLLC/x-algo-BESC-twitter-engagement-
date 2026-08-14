import { WEIGHTS, BOILERPLATE_PHRASES, AI_SLOP_PHRASES } from "./scoring";

// Shared between every AI rewrite provider (Ollama, Gemini, ...) so the
// prompt can't quietly drift out of sync between them, and so it stays
// pulled from the real weights in scoring.ts rather than a hand-picked
// subset baked into prose.
export function buildRewritePrompt(text: string, numVariants: number, charLimit: number): string {
  const boilerplateSample = BOILERPLATE_PHRASES.slice(0, 3).join('", "');
  const slopSample = AI_SLOP_PHRASES.slice(0, 4).join('", "');
  return `Rewrite an X post to score higher on a weighted-action ranking algorithm. Weights (weight x probability, summed):
+${WEIGHTS.shareViaCopyLink} share-via-copy-link (highest weight; needs a concrete hook/stat/story, not vague)
+${WEIGHTS.reply}/+${WEIGHTS.reply + WEIGHTS.bidirectionalReplyBoost} reply (end with a specific question fitting THIS content, not generic "thoughts?")
+${WEIGHTS.quote} quote, +${WEIGHTS.shareViaDm} DM-share, +${WEIGHTS.followAuthor} follow, +${WEIGHTS.share} share, +${WEIGHTS.retweet} repost, +${WEIGHTS.favorite} like (lowest, don't chase)
${WEIGHTS.report} report, ${WEIGHTS.muteAuthor} mute, ${WEIGHTS.notInterested} not-interested, ${WEIGHTS.blockAuthor} block: triggered by ALL-CAPS, !!!/???, >2 hashtags, boilerplate like "${boilerplateSample}", shortened links.
Also avoid filler words (very/just/actually/I think), passive voice, and stock AI phrasing like "${slopSample}"; open with the point, not a wind-up. Max ${charLimit.toLocaleString()} chars. Never invent facts/names/numbers; preserve every claim exactly.

Post:
"""
${text}
"""

Write ${numVariants} tighter rewrites of this SAME post, same voice and facts, each ending with a hook relevant to this content. Output only lines starting "VARIANT: ", nothing else.`;
}

// Generation from scratch is a materially different risk than rewriting: a
// rewrite has the user's own words as ground truth to preserve, but loose
// context gives the model room to invent specifics that sound plausible.
// The "only use facts... never invent specifics" instruction is the whole
// defense against that — kept explicit and separate from the rewrite
// prompt's "preserve every claim exactly" framing, which doesn't apply here.
export function buildGeneratePrompt(context: string, numVariants: number, charLimit: number): string {
  const boilerplateSample = BOILERPLATE_PHRASES.slice(0, 3).join('", "');
  const slopSample = AI_SLOP_PHRASES.slice(0, 4).join('", "');
  return `Write an original X post from scratch based on the context below, optimized to score high on a weighted-action ranking algorithm. Weights (weight x probability, summed):
+${WEIGHTS.shareViaCopyLink} share-via-copy-link (highest weight; needs a concrete hook/stat/story, not vague)
+${WEIGHTS.reply}/+${WEIGHTS.reply + WEIGHTS.bidirectionalReplyBoost} reply (end with a specific question fitting THIS content, not generic "thoughts?")
+${WEIGHTS.quote} quote, +${WEIGHTS.shareViaDm} DM-share, +${WEIGHTS.followAuthor} follow, +${WEIGHTS.share} share, +${WEIGHTS.retweet} repost, +${WEIGHTS.favorite} like (lowest, don't chase)
${WEIGHTS.report} report, ${WEIGHTS.muteAuthor} mute, ${WEIGHTS.notInterested} not-interested, ${WEIGHTS.blockAuthor} block: triggered by ALL-CAPS, !!!/???, >2 hashtags, boilerplate like "${boilerplateSample}", shortened links.
Avoid filler words (very/just/actually/I think), passive voice, and stock AI phrasing like "${slopSample}"; open with the point, not a wind-up. Write like a real person who has something specific to say, not marketing copy. Max ${charLimit.toLocaleString()} chars.

CRITICAL: Only use facts, names, and numbers that appear in the context below. Never invent specifics (stats, dates, names, outcomes) that aren't there — if the context is vague on a detail, write around it in general terms instead of making something up to sound concrete.
CRITICAL: Never write a URL or link, not even a placeholder like "https://" or "[link]". Only include a link if the exact URL appears verbatim in the context; otherwise write the post without one — links are attached separately, outside the post text.

Context from the user (a rough idea, not finished text):
"""
${context}
"""

Write ${numVariants} different complete post options based on this context — genuinely different angles or hooks on the same idea, not minor rewordings of each other — each a full standalone post ending with a hook relevant to this content. Output only lines starting "VARIANT: ", nothing else.`;
}

// A flat output-token cap doesn't scale: English runs roughly 4 chars/token,
// so a fixed 250-token budget is already tight for 2-3 short variants and
// can silently truncate the last one — and for a verified account's much
// higher char limit (up to 4,000) it isn't remotely enough for even a
// single full-length variant. Scales with both charLimit and numVariants,
// floored at the old constant so nothing regresses, ceilinged so a verified
// draft times many variants can't blow generation time up unboundedly
// (especially on CPU/Ollama).
export function estimateMaxOutputTokens(charLimit: number, numVariants: number): number {
  const perVariant = Math.ceil(charLimit * 0.35) + 25; // + "VARIANT: " prefix/newline overhead
  return Math.min(2000, Math.max(250, perVariant * numVariants));
}

// A generation that runs out of output tokens mid-URL leaves a fragment like
// "...engagement: https://" — and the deterministic optimizer will then
// happily append a reply hook to it, producing a finished-looking post with
// a dead link buried in the middle (observed in production). A trailing URL
// with no real dotted domain means the model got cut off, not that it wrote
// a short link, so drop the whole variant instead of surfacing the fragment.
function endsWithIncompleteUrl(text: string): boolean {
  const tail = text.match(/(?:https?:\/\/|www\.)\S*$/i);
  if (!tail) return false;
  return !/(?:https?:\/\/|www\.)[^\s/]*[a-z0-9-]\.[a-z]{2,}/i.test(tail[0]);
}

export function parseVariants(raw: string, max: number): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^variant:?\s*/i.test(line))
    .map((line) => line.replace(/^variant:?\s*/i, "").trim())
    .filter(Boolean)
    .filter((line) => !endsWithIncompleteUrl(line))
    .slice(0, max);
}
