import { callVee3Tool } from "./vee3";
import type { AuthorLookupResult, MediaType, TweetImportResult } from "./types";

const RECENT_WINDOW_MS = 3 * 60 * 60 * 1000;

export function parseTweetId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d{5,25}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/(?:twitter|x)\.com\/[^/]+\/status(?:es)?\/(\d+)/i);
  return match ? match[1] : null;
}

type Raw = Record<string, any>;

// Vee3's exact response shape isn't published; this reads several plausible
// key spellings per field so minor API differences don't hard-fail the import.
function pick<T>(obj: Raw | undefined | null, paths: string[], fallback: T): T {
  for (const path of paths) {
    const value = path
      .split(".")
      .reduce<any>((acc, key) => (acc == null ? undefined : acc[key]), obj);
    if (value !== undefined && value !== null) return value as T;
  }
  return fallback;
}

function detectMediaType(raw: Raw): MediaType {
  const media = pick<any[]>(
    raw,
    ["media", "extended_entities.media", "attachments.media", "entities.media"],
    []
  );
  if (!Array.isArray(media) || media.length === 0) return "none";
  const type = String(pick<string>(media[0], ["type", "media_type"], "photo")).toLowerCase();
  if (type.includes("video")) return "video";
  if (type.includes("gif") || type.includes("animated")) return "gif";
  return "photo";
}

// Twitter/X API tweet objects mark a reply via in_reply_to_status_id (legacy
// v1.1 shape, null/absent when not a reply) or a "replied_to" entry in
// referenced_tweets (v2 shape). Checking both since Vee3's exact shape isn't
// published — see the module comment above pick().
export function detectIsReply(raw: Raw): boolean {
  const directId = pick<string | number | null>(
    raw,
    ["in_reply_to_status_id", "in_reply_to_status_id_str", "legacy.in_reply_to_status_id_str"],
    null
  );
  if (directId !== null && directId !== undefined && directId !== "") return true;

  const referenced = pick<any[]>(raw, ["referenced_tweets"], []);
  return Array.isArray(referenced) && referenced.some((r) => pick<string>(r, ["type"], "") === "replied_to");
}

export function detectSensitive(raw: Raw): boolean {
  return Boolean(
    pick<boolean>(raw, ["possibly_sensitive", "possibly_sensitive_editable", "legacy.possibly_sensitive"], false)
  );
}

function firstExternalLink(raw: Raw): string {
  const urls = pick<any[]>(raw, ["entities.urls", "urls"], []);
  if (!Array.isArray(urls) || urls.length === 0) return "";
  return pick<string>(urls[0], ["expanded_url", "url"], "");
}

function hoursSincePosted(raw: Raw): number {
  const createdAt = pick<string>(raw, ["created_at", "createdAt", "timestamp"], "");
  if (!createdAt) return 0;
  const ts = new Date(createdAt).getTime();
  if (Number.isNaN(ts)) return 0;
  return Math.max(0, (Date.now() - ts) / (60 * 60 * 1000));
}

async function countRecentPosts(authorHandle: string, authorRestId: string): Promise<number> {
  if (!authorHandle && !authorRestId) return 0;
  try {
    const args = authorHandle ? { user_name: authorHandle } : { rest_id: authorRestId };
    const timeline = await callVee3Tool<Raw>("x-twitter_user_timeline", args);
    const entries = pick<any[]>(timeline, ["entries", "tweets", "timeline", "posts"], []);
    const cutoff = Date.now() - RECENT_WINDOW_MS;
    const count = entries.filter((entry) => {
      const createdAt = pick<string>(entry, ["created_at", "createdAt"], "");
      const ts = createdAt ? new Date(createdAt).getTime() : NaN;
      return !Number.isNaN(ts) && ts >= cutoff;
    }).length;
    return Math.min(10, count);
  } catch {
    return 0;
  }
}

async function fetchRawTweet(url: string): Promise<{ id: string; raw: Raw }> {
  const id = parseTweetId(url);
  if (!id) {
    throw new Error("Couldn't find a tweet id in that link. Paste a full x.com/…/status/… URL.");
  }
  const raw = await callVee3Tool<Raw>("x-twitter_tweet_info", { id });
  return { id, raw };
}

function buildResult(raw: Raw, recentPostsCount: number): TweetImportResult {
  const text = pick<string>(raw, ["text", "full_text"], "");
  if (!text) {
    throw new Error("Vee3 didn't return any post text for that link.");
  }

  const author = pick<Raw>(raw, ["author", "user"], {});

  return {
    text,
    mediaType: detectMediaType(raw),
    link: firstExternalLink(raw),
    isReply: detectIsReply(raw),
    nsfw: detectSensitive(raw),
    authorHandle: pick<string>(author, ["user_name", "screen_name", "username"], ""),
    authorName: pick<string>(author, ["name", "display_name"], ""),
    authorFollowers: Number(pick<number>(author, ["followers_count", "followers", "sub_count"], 0)) || 0,
    authorVerified: Boolean(pick<boolean>(author, ["is_blue_verified", "blue_verified", "verified"], false)),
    recentPostsCount,
    postedHoursAgo: hoursSincePosted(raw),
    realMetrics: {
      views: Number(pick<number | string>(raw, ["views", "view_count", "public_metrics.impression_count"], 0)) || 0,
      likes:
        Number(
          pick<number>(
            raw,
            ["like_count", "favorite_count", "likes", "public_metrics.like_count", "stats.like_count", "legacy.favorite_count"],
            0
          )
        ) || 0,
      retweets:
        Number(
          pick<number>(
            raw,
            ["retweet_count", "retweets", "public_metrics.retweet_count", "stats.retweet_count", "legacy.retweet_count"],
            0
          )
        ) || 0,
      replies:
        Number(
          pick<number>(
            raw,
            ["reply_count", "replies", "public_metrics.reply_count", "stats.reply_count", "legacy.reply_count"],
            0
          )
        ) || 0,
      quotes:
        Number(
          pick<number>(
            raw,
            ["quote_count", "quotes", "public_metrics.quote_count", "stats.quote_count", "legacy.quote_count"],
            0
          )
        ) || 0,
      bookmarks:
        Number(
          pick<number>(
            raw,
            ["bookmark_count", "bookmarks", "public_metrics.bookmark_count", "stats.bookmark_count", "legacy.bookmark_count"],
            0
          )
        ) || 0,
    },
  };
}

export function parseHandle(input: string): string | null {
  const trimmed = input.trim().replace(/^@/, "");
  if (/^[A-Za-z0-9_]{1,15}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/(?:twitter|x)\.com\/([A-Za-z0-9_]{1,15})\/?$/i);
  return match ? match[1] : null;
}

export async function lookupAuthor(handleInput: string): Promise<AuthorLookupResult> {
  const handle = parseHandle(handleInput);
  if (!handle) {
    throw new Error("That doesn't look like a valid @handle.");
  }

  const raw = await callVee3Tool<Raw>("x-twitter_user_info", { user_name: handle });
  // The account object may come back nested (user/data/result) or flat,
  // depending on the exact shape Vee3 returns for this tool. Confirmed flat
  // against a real response, with the handle under "profile" (not
  // user_name/screen_name/username like the tweet-info author object uses).
  const user = pick<Raw>(raw, ["user", "data", "result"], raw);

  const authorHandle = pick<string>(user, ["profile", "user_name", "screen_name", "username"], "");
  if (!authorHandle) {
    throw new Error("Vee3 didn't return account info for that handle.");
  }

  return {
    authorHandle,
    authorName: pick<string>(user, ["name", "display_name"], ""),
    authorFollowers: Number(pick<number>(user, ["followers_count", "followers", "sub_count"], 0)) || 0,
    authorVerified: Boolean(pick<boolean>(user, ["is_blue_verified", "blue_verified", "verified"], false)),
  };
}

export async function importTweet(url: string): Promise<TweetImportResult> {
  const { raw } = await fetchRawTweet(url);

  const author = pick<Raw>(raw, ["author", "user"], {});
  const authorHandle = pick<string>(author, ["user_name", "screen_name", "username"], "");
  const authorRestId = pick<string>(author, ["rest_id", "id"], "");
  const recentPostsCount = await countRecentPosts(authorHandle, authorRestId);

  return buildResult(raw, recentPostsCount);
}
