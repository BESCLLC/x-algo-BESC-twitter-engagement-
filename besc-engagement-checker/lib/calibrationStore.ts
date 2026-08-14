import { query } from "./db";
import { extractFeatures } from "./scoring";
import { fetchUserTimelinePage } from "./twitter-import";
import {
  type CalibrationModel,
  type CalibrationSample,
  featureVector,
  fitCalibration,
} from "./calibration";
import type { MediaType } from "./types";

// Enough pages to build a real training set without hammering the API. Each
// page is one Vee3 call, and timelines return roughly 20-40 posts per page.
const MAX_BACKFILL_PAGES = 12;
const BACKFILL_TARGET_POSTS = 400;

export interface BackfillResult {
  fetched: number;
  inserted: number;
  usable: number;
}

/**
 * Walks a handle's published timeline and stores each post as an
 * already-measured row. This is what makes calibration practical: a user's
 * own history is hundreds of real (post → outcome) pairs that already exist,
 * so the model doesn't have to wait for drafts to be tracked one at a time.
 *
 * Only the author's own original posts are kept — replies live under
 * completely different distribution rules (excluded from out-of-network
 * recommendations entirely), so mixing them in would teach the model that
 * whatever replies happen to look like suppresses reach.
 */
export async function backfillFromTimeline(handle: string): Promise<BackfillResult> {
  const normalized = handle.toLowerCase();
  let cursor: string | undefined;
  let fetched = 0;
  let inserted = 0;
  const seenCursors = new Set<string>();

  for (let page = 0; page < MAX_BACKFILL_PAGES && fetched < BACKFILL_TARGET_POSTS; page++) {
    const { posts, nextCursor } = await fetchUserTimelinePage(normalized, cursor);
    if (posts.length === 0) break;
    fetched += posts.length;

    for (const post of posts) {
      if (post.isReply) continue;
      const metrics = post.metrics;
      // No views means no measurable rate — storing it would look like data
      // while contributing nothing but a zero-denominator row.
      if (!metrics || metrics.views <= 0) continue;

      const postedAt = post.createdAt ? new Date(post.createdAt) : null;
      const rows = await query<{ id: number }>(
        `INSERT INTO tracked_posts
           (author_handle, draft_text, predicted_score, predicted_grade, applied_fix_ids,
            media_type, is_reply, source, tweet_id, matched_at, posted_at,
            metrics_updated_at, views, likes, retweets, replies, quotes, bookmarks)
         VALUES ($1,$2,0,'',$3,$4,FALSE,'backfill',$5,NOW(),$6,NOW(),$7,$8,$9,$10,$11,$12)
         ON CONFLICT (tweet_id) DO NOTHING
         RETURNING id`,
        [
          normalized,
          post.text,
          [],
          post.mediaType ?? "none",
          post.tweetId,
          postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : null,
          metrics.views,
          metrics.likes,
          metrics.retweets,
          metrics.replies,
          metrics.quotes,
          metrics.bookmarks,
        ]
      );
      if (rows.length > 0) inserted++;
    }

    // A missing or repeating cursor means there's no more history to walk;
    // without this guard a self-referential cursor would loop until the page cap.
    if (!nextCursor || seenCursors.has(nextCursor)) break;
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }

  const usable = await countUsableSamples(normalized);
  return { fetched, inserted, usable };
}

async function countUsableSamples(handle: string): Promise<number> {
  const rows = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM tracked_posts
     WHERE author_handle = $1 AND views > 0 AND is_reply = FALSE`,
    [handle.toLowerCase()]
  );
  return Number(rows[0]?.count ?? 0);
}

interface SampleRow {
  draft_text: string;
  media_type: string;
  views: string | number;
  likes: string | number;
  retweets: string | number;
  replies: string | number;
  quotes: string | number;
  bookmarks: string | number;
}

/**
 * Refits from every measured post the handle has and caches the result.
 * Features are re-derived from the stored text rather than persisted, so a
 * change to feature extraction automatically applies to the whole history on
 * the next refit instead of leaving stale vectors behind.
 */
export async function refitCalibration(handle: string): Promise<CalibrationModel> {
  const normalized = handle.toLowerCase();
  const rows = await query<SampleRow>(
    `SELECT draft_text, media_type, views, likes, retweets, replies, quotes, bookmarks
     FROM tracked_posts
     WHERE author_handle = $1 AND views > 0 AND is_reply = FALSE
     ORDER BY created_at DESC LIMIT 1000`,
    [normalized]
  );

  const samples: CalibrationSample[] = rows.map((row) => {
    const features = extractFeatures(row.draft_text, "");
    return {
      features: featureVector(features, row.media_type as MediaType),
      views: Number(row.views),
      counts: {
        favorite: Number(row.likes ?? 0),
        reply: Number(row.replies ?? 0),
        retweet: Number(row.retweets ?? 0),
        quote: Number(row.quotes ?? 0),
        bookmark: Number(row.bookmarks ?? 0),
      },
    };
  });

  const model = fitCalibration(normalized, samples);
  await query(
    `INSERT INTO calibration_models (handle, model, fitted_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (handle) DO UPDATE SET model = EXCLUDED.model, fitted_at = NOW()`,
    [normalized, JSON.stringify(model)]
  );
  return model;
}

// Scoring runs on every keystroke (debounced), so this must not hit the
// database each time. The model only changes on backfill/sync, and a stale
// read for a minute is harmless.
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { model: CalibrationModel | null; at: number }>();

export async function loadCalibration(handle: string): Promise<CalibrationModel | null> {
  const normalized = handle.trim().toLowerCase();
  if (!normalized) return null;

  const cached = cache.get(normalized);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.model;

  try {
    const rows = await query<{ model: CalibrationModel }>(
      `SELECT model FROM calibration_models WHERE handle = $1`,
      [normalized]
    );
    const model = rows[0]?.model ?? null;
    cache.set(normalized, { model, at: Date.now() });
    return model;
  } catch {
    // Calibration is an enhancement; if it can't be read, scoring proceeds on
    // the heuristics exactly as it always has.
    cache.set(normalized, { model: null, at: Date.now() });
    return null;
  }
}

export function invalidateCalibrationCache(handle: string): void {
  cache.delete(handle.trim().toLowerCase());
}
