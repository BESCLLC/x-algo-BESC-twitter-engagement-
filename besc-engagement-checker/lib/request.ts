import type { AnalyzeRequest, MediaType } from "./types";

// Hard payload cap, not the platform post limit — kept above
// VERIFIED_CHAR_LIMIT (4,000, see scoring.ts) so a legitimate long-form
// verified draft doesn't get silently truncated before it's even scored.
const MAX_CHARS = 6000;
const VALID_MEDIA: MediaType[] = ["none", "photo", "video", "gif"];

export function parseAnalyzeRequest(body: Partial<AnalyzeRequest>): AnalyzeRequest | null {
  const text = typeof body.text === "string" ? body.text.slice(0, MAX_CHARS) : "";
  if (!text.trim()) return null;

  const mediaType: MediaType = VALID_MEDIA.includes(body.mediaType as MediaType)
    ? (body.mediaType as MediaType)
    : "none";
  const link = typeof body.link === "string" ? body.link.slice(0, 500) : "";

  const authorFollowers =
    body.authorFollowers !== undefined && body.authorFollowers !== null
      ? Math.max(0, Number(body.authorFollowers) || 0)
      : undefined;
  const postedHoursAgo =
    body.postedHoursAgo !== undefined && body.postedHoursAgo !== null
      ? Math.max(0, Number(body.postedHoursAgo) || 0)
      : undefined;

  return {
    text,
    mediaType,
    link,
    isReplyToMutual: Boolean(body.isReplyToMutual),
    recentPostsCount: Math.max(0, Math.min(10, Number(body.recentPostsCount) || 0)),
    nsfw: Boolean(body.nsfw),
    authorFollowers,
    postedHoursAgo,
    isVerified: Boolean(body.isVerified),
  };
}
