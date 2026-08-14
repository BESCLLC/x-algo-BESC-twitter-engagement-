import { WEIGHTS, BOILERPLATE_PHRASES } from "./scoring";

// Shared between every AI rewrite provider (Ollama, Gemini, ...) so the
// prompt can't quietly drift out of sync between them, and so it stays
// pulled from the real weights in scoring.ts rather than a hand-picked
// subset baked into prose.
export function buildRewritePrompt(text: string, numVariants: number, charLimit: number): string {
  const boilerplateSample = BOILERPLATE_PHRASES.slice(0, 3).join('", "');
  return `Rewrite an X post to score higher on a weighted-action ranking algorithm. Weights (weight x probability, summed):
+${WEIGHTS.shareViaCopyLink} share-via-copy-link (highest weight; needs a concrete hook/stat/story, not vague)
+${WEIGHTS.reply}/+${WEIGHTS.reply + WEIGHTS.bidirectionalReplyBoost} reply (end with a specific question fitting THIS content, not generic "thoughts?")
+${WEIGHTS.quote} quote, +${WEIGHTS.shareViaDm} DM-share, +${WEIGHTS.followAuthor} follow, +${WEIGHTS.share} share, +${WEIGHTS.retweet} repost, +${WEIGHTS.favorite} like (lowest, don't chase)
${WEIGHTS.report} report, ${WEIGHTS.muteAuthor} mute, ${WEIGHTS.notInterested} not-interested, ${WEIGHTS.blockAuthor} block: triggered by ALL-CAPS, !!!/???, >2 hashtags, boilerplate like "${boilerplateSample}", shortened links.
Also avoid filler words (very/just/actually/I think) and passive voice; open with the point, not a wind-up. Max ${charLimit.toLocaleString()} chars. Never invent facts/names/numbers; preserve every claim exactly.

Post:
"""
${text}
"""

Write ${numVariants} tighter rewrites of this SAME post, same voice and facts, each ending with a hook relevant to this content. Output only lines starting "VARIANT: ", nothing else.`;
}

export function parseVariants(raw: string, max: number): string[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^variant:?\s*/i.test(line))
    .map((line) => line.replace(/^variant:?\s*/i, "").trim())
    .filter(Boolean)
    .slice(0, max);
}
