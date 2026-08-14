import type {
  AnalyzeRequest,
  ActionRow,
  FeatureReport,
  RiskFlag,
  ScoreResult,
  Tip,
} from "./types";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * GROUND TRUTH: home-mixer/params/param.rs (X "For You" algorithm, this repo)
 * RankingScorer combines Phoenix's per-action probabilities as:
 *     Final Score = Σ (weight_i × P(action_i))
 * These are the *actual* production default weights mirrored in param.rs.
 * We reuse them verbatim so the composite score below is arithmetically
 * identical in spirit to how X itself blends predicted actions.
 * ─────────────────────────────────────────────────────────────────────────
 */
export const WEIGHTS = {
  favorite: 0.5,
  reply: 5.0,
  bidirectionalReplyBoost: 15.0, // added to reply weight, mutual-follow + original post only
  retweet: 1.0,
  photoExpand: 0.05,
  videoOpen: 0.05,
  click: 0.4,
  openLink: 0.2,
  vqv: 0.05,
  share: 2.0,
  shareViaDm: 5.0,
  shareViaCopyLink: 20.0,
  quote: 5.0,
  followAuthor: 4.0,
  notInterested: -43.2,
  blockAuthor: -31.2,
  muteAuthor: -58.8,
  report: -234.0,
  notDwelled: -0.02,
} as const;

// home-mixer/scorers/ranking_scorer.rs — diversity_multiplier(decay, floor, k)
export const AUTHOR_DIVERSITY_DECAY = 0.5; // params::AuthorDiversityDecay
export const AUTHOR_DIVERSITY_FLOOR = 0.25; // params::AuthorDiversityFloor
// home-mixer/params/param.rs — OonWeightFactor
export const OON_WEIGHT_FACTOR = 0.75;

// home-mixer/params/param.rs — ColdStartFollowerCap / ColdStartMaxPostAgeSecs / LowImpressionsMaxPositionRatio
export const COLD_START_FOLLOWER_CAP = 1000;
export const COLD_START_MAX_AGE_HOURS = 24; // 86400 secs
export const COLD_START_MAX_POSITION_RATIO = 0.85;

export function authorDiversityMultiplier(k: number): number {
  return (
    (1 - AUTHOR_DIVERSITY_FLOOR) * Math.pow(AUTHOR_DIVERSITY_DECAY, k) +
    AUTHOR_DIVERSITY_FLOOR
  );
}

const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu;

const URL_RE = /(https?:\/\/[^\s]+)|(\bwww\.[^\s]+)/gi;
const MENTION_RE = /(^|\s)@[a-zA-Z0-9_]{1,15}/g;
export const HASHTAG_RE = /(^|\s)#[a-zA-Z0-9_]+/g;

const SHORTENER_HOSTS = [
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "ow.ly",
  "buff.ly",
  "is.gd",
  "cutt.ly",
  "rebrand.ly",
  "shorturl.at",
  "tiny.cc",
];

export const BOILERPLATE_PHRASES = [
  "follow for follow",
  "f4f",
  "follow me for more",
  "like and retweet",
  "rt if you agree",
  "retweet if",
  "link in bio",
  "dm me for",
  "click the link below",
  "check out my link",
  "comment your",
  "tag 3 friends",
  "tag a friend",
];

export const REPLY_CTA_PHRASES = [
  "what do you think",
  "thoughts?",
  "agree or disagree",
  "reply with",
  "reply below",
  "comment below",
  "tell me why",
  "am i wrong",
  "change my mind",
  "unpopular opinion",
];

const SHARE_CTA_PHRASES = [
  "share this",
  "send this to",
  "everyone needs to see this",
  "bookmark this",
  "save this",
];

export function extractFeatures(text: string, link: string): FeatureReport {
  const trimmed = text.trim();
  const words = trimmed.length ? trimmed.split(/\s+/) : [];
  const chars = trimmed.length;

  const hashtags = (trimmed.match(HASHTAG_RE) || []).length;
  const mentions = (trimmed.match(MENTION_RE) || []).length;
  const textLinks = (trimmed.match(URL_RE) || []).length;
  const links = textLinks + (link.trim() ? 1 : 0);
  const emojis = (trimmed.match(EMOJI_RE) || []).length;

  const capsWords = words.filter(
    (w) => w.length >= 3 && w === w.toUpperCase() && /[A-Z]/.test(w)
  );
  const allCapsWordRatio = words.length ? capsWords.length / words.length : 0;

  const exclamationBursts = (trimmed.match(/!{2,}|\?{2,}|!\?|\?!/g) || [])
    .length;
  const hasQuestion = (trimmed.match(/\?/g) || []).length;

  const lower = trimmed.toLowerCase();
  const hasReplyCTA = REPLY_CTA_PHRASES.some((p) => lower.includes(p));
  const hasShareCTA = SHARE_CTA_PHRASES.some((p) => lower.includes(p));
  const hasBoilerplateCTA = BOILERPLATE_PHRASES.some((p) => lower.includes(p));
  const hasNumbers = /\d/.test(trimmed);
  const hasThreadMarker = /🧵|^1\/|^\(1\/|thread\b/i.test(trimmed);

  let urlRisk = false;
  let urlReason: string | null = null;
  const candidateUrl = link.trim() || (trimmed.match(URL_RE) || [])[0] || "";
  if (candidateUrl) {
    const host = candidateUrl
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split(/[/?#]/)[0]
      .toLowerCase();
    if (SHORTENER_HOSTS.includes(host)) {
      urlRisk = true;
      urlReason = `"${host}" is a link-shortener/redirect domain — redirect chains are exactly what scarecrow's URL-verdict rules (e.g. bot 3226, bot 6754) resolve and re-check before trusting a link.`;
    } else if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
      urlRisk = true;
      urlReason =
        "Raw IP-address links have no domain reputation history, so URL-verdict scoring treats them as low quality by default.";
    } else if (/\.(xyz|top|click|country|gq|tk|work)$/i.test(host)) {
      urlRisk = true;
      urlReason = `The "${host.split(".").pop()}" TLD is disproportionately associated with low-quality/BAD URL verdicts in spam-detection datasets.`;
    }
  }

  return {
    chars,
    words: words.length,
    hashtags,
    mentions,
    links,
    emojis,
    allCapsWordRatio,
    exclamationBursts,
    hasQuestion,
    hasReplyCTA,
    hasShareCTA,
    hasBoilerplateCTA,
    hasNumbers,
    hasThreadMarker,
    urlRisk,
    urlReason,
  };
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

interface ActionProbabilities {
  favorite: number;
  reply: number;
  retweet: number;
  photoExpand: number;
  videoOpen: number;
  click: number;
  openLink: number;
  vqv: number;
  share: number;
  shareViaDm: number;
  shareViaCopyLink: number;
  quote: number;
  followAuthor: number;
  notInterested: number;
  blockAuthor: number;
  muteAuthor: number;
  report: number;
  notDwelled: number;
}

/**
 * Heuristic estimator standing in for Phoenix's learned P(action | post, viewer).
 * We don't have Phoenix's weights or a viewer's action-sequence here — instead
 * we approximate propensities from surface-level features that correlate with
 * each action, then blend them with the *real* production weights above. This
 * is a transparent proxy, not a claim that we're running the actual model.
 */
function estimateActionProbabilities(
  f: FeatureReport,
  req: AnalyzeRequest
): ActionProbabilities {
  const lengthScore = clamp01(1 - Math.abs(f.words - 30) / 80); // sweet spot ~ 15-45 words
  const hasMedia = req.mediaType !== "none";
  const spamPenalty = clamp01(
    f.allCapsWordRatio * 0.6 +
      Math.min(f.hashtags, 8) / 8 * 0.35 +
      Math.min(f.exclamationBursts, 4) / 4 * 0.3 +
      (f.hasBoilerplateCTA ? 0.45 : 0) +
      (f.urlRisk ? 0.35 : 0) +
      (f.mentions >= 4 ? 0.2 : 0)
  );

  const favorite = clamp01(
    0.05 +
      lengthScore * 0.15 +
      (hasMedia ? 0.1 : 0) +
      Math.min(f.emojis, 3) * 0.02 +
      (f.hasNumbers ? 0.03 : 0) -
      spamPenalty * 0.15
  );

  const reply = clamp01(
    0.02 +
      (f.hasQuestion > 0 ? 0.18 : 0) +
      (f.hasReplyCTA ? 0.28 : 0) -
      spamPenalty * 0.1
  );

  const retweet = clamp01(
    0.02 +
      (f.hasNumbers ? 0.05 : 0) +
      (f.hasThreadMarker ? 0.06 : 0) +
      lengthScore * 0.06 -
      spamPenalty * 0.12
  );

  const quote = clamp01(0.015 + (f.hasReplyCTA ? 0.05 : 0) + retweet * 0.4);

  const share = clamp01(0.02 + (f.hasShareCTA ? 0.18 : 0) + retweet * 0.5);
  const shareViaDm = clamp01(share * 0.55);
  const shareViaCopyLink = clamp01(share * 0.4);

  const openLink = clamp01(f.links > 0 ? 0.22 - (f.urlRisk ? 0.12 : 0) : 0.0);
  const click = clamp01(0.08 + openLink * 0.5 + (hasMedia ? 0.05 : 0));
  const photoExpand = clamp01(req.mediaType === "photo" ? 0.28 : 0.02);
  const videoOpen = clamp01(req.mediaType === "video" ? 0.3 : 0.02);
  const vqv = clamp01(req.mediaType === "video" ? 0.22 : 0.01);

  const followAuthor = clamp01(
    0.01 + favorite * 0.08 + reply * 0.06 - spamPenalty * 0.08
  );

  const notInterested = clamp01(0.01 + spamPenalty * 0.22);
  const blockAuthor = clamp01(0.002 + spamPenalty * 0.06);
  const muteAuthor = clamp01(0.004 + spamPenalty * 0.1);
  const report = clamp01(
    0.0005 + (f.urlRisk ? 0.01 : 0) + spamPenalty * 0.02
  );
  const notDwelled = clamp01(0.35 - lengthScore * 0.15 + spamPenalty * 0.2);

  return {
    favorite,
    reply,
    retweet,
    photoExpand,
    videoOpen,
    click,
    openLink,
    vqv,
    share,
    shareViaDm,
    shareViaCopyLink,
    quote,
    followAuthor,
    notInterested,
    blockAuthor,
    muteAuthor,
    report,
    notDwelled,
  };
}

function buildActionRows(
  p: ActionProbabilities,
  req: AnalyzeRequest
): ActionRow[] {
  const replyWeight =
    WEIGHTS.reply + (req.isReplyToMutual ? WEIGHTS.bidirectionalReplyBoost : 0);

  const rows: ActionRow[] = [
    {
      id: "reply",
      label: "Reply",
      group: "engagement",
      weight: replyWeight,
      probability: p.reply,
      contribution: replyWeight * p.reply,
      weightSource: req.isReplyToMutual
        ? "ReplyWeight (5.0) + BidirectionalFollowReplyWeightBoost (15.0)"
        : "ReplyWeight = 5.0",
    },
    {
      id: "quote",
      label: "Quote post",
      group: "engagement",
      weight: WEIGHTS.quote,
      probability: p.quote,
      contribution: WEIGHTS.quote * p.quote,
      weightSource: "QuoteWeight = 5.0",
    },
    {
      id: "shareViaCopyLink",
      label: "Share via copy link",
      group: "engagement",
      weight: WEIGHTS.shareViaCopyLink,
      probability: p.shareViaCopyLink,
      contribution: WEIGHTS.shareViaCopyLink * p.shareViaCopyLink,
      weightSource: "ShareViaCopyLinkWeight = 20.0 (highest single weight)",
    },
    {
      id: "shareViaDm",
      label: "Share via DM",
      group: "engagement",
      weight: WEIGHTS.shareViaDm,
      probability: p.shareViaDm,
      contribution: WEIGHTS.shareViaDm * p.shareViaDm,
      weightSource: "ShareViaDmWeight = 5.0",
    },
    {
      id: "share",
      label: "Share (generic)",
      group: "engagement",
      weight: WEIGHTS.share,
      probability: p.share,
      contribution: WEIGHTS.share * p.share,
      weightSource: "ShareWeight = 2.0",
    },
    {
      id: "retweet",
      label: "Repost",
      group: "engagement",
      weight: WEIGHTS.retweet,
      probability: p.retweet,
      contribution: WEIGHTS.retweet * p.retweet,
      weightSource: "RetweetWeight = 1.0",
    },
    {
      id: "favorite",
      label: "Like",
      group: "engagement",
      weight: WEIGHTS.favorite,
      probability: p.favorite,
      contribution: WEIGHTS.favorite * p.favorite,
      weightSource: "FavoriteWeight = 0.5",
    },
    {
      id: "followAuthor",
      label: "Follow you",
      group: "author",
      weight: WEIGHTS.followAuthor,
      probability: p.followAuthor,
      contribution: WEIGHTS.followAuthor * p.followAuthor,
      weightSource: "FollowAuthorWeight = 4.0",
    },
    {
      id: "openLink",
      label: "Open link",
      group: "clicks",
      weight: WEIGHTS.openLink,
      probability: p.openLink,
      contribution: WEIGHTS.openLink * p.openLink,
      weightSource: "OpenLinkWeight = 0.2",
    },
    {
      id: "click",
      label: "Click post",
      group: "clicks",
      weight: WEIGHTS.click,
      probability: p.click,
      contribution: WEIGHTS.click * p.click,
      weightSource: "ClickWeight = 0.4",
    },
    {
      id: "photoExpand",
      label: "Expand photo",
      group: "clicks",
      weight: WEIGHTS.photoExpand,
      probability: p.photoExpand,
      contribution: WEIGHTS.photoExpand * p.photoExpand,
      weightSource: "PhotoExpandWeight = 0.05",
    },
    {
      id: "videoOpen",
      label: "Open video",
      group: "clicks",
      weight: WEIGHTS.videoOpen,
      probability: p.videoOpen,
      contribution: WEIGHTS.videoOpen * p.videoOpen,
      weightSource: "VideoOpenWeight = 0.05",
    },
    {
      id: "vqv",
      label: "Video quality view",
      group: "attention",
      weight: WEIGHTS.vqv,
      probability: p.vqv,
      contribution: WEIGHTS.vqv * p.vqv,
      weightSource: "VqvWeight = 0.05",
    },
    {
      id: "notDwelled",
      label: "Scrolls past without dwelling",
      group: "negative",
      weight: WEIGHTS.notDwelled,
      probability: p.notDwelled,
      contribution: WEIGHTS.notDwelled * p.notDwelled,
      weightSource: "NotDwelledWeight = -0.02",
    },
    {
      id: "notInterested",
      label: '"Not interested"',
      group: "negative",
      weight: WEIGHTS.notInterested,
      probability: p.notInterested,
      contribution: WEIGHTS.notInterested * p.notInterested,
      weightSource: "NotInterestedWeight = -43.2",
    },
    {
      id: "blockAuthor",
      label: "Block",
      group: "negative",
      weight: WEIGHTS.blockAuthor,
      probability: p.blockAuthor,
      contribution: WEIGHTS.blockAuthor * p.blockAuthor,
      weightSource: "BlockAuthorWeight = -31.2",
    },
    {
      id: "muteAuthor",
      label: "Mute",
      group: "negative",
      weight: WEIGHTS.muteAuthor,
      probability: p.muteAuthor,
      contribution: WEIGHTS.muteAuthor * p.muteAuthor,
      weightSource: "MuteAuthorWeight = -58.8",
    },
    {
      id: "report",
      label: "Report",
      group: "negative",
      weight: WEIGHTS.report,
      probability: p.report,
      contribution: WEIGHTS.report * p.report,
      weightSource: "ReportWeight = -234.0 (single largest weight in the model)",
    },
  ];

  return rows.sort((a, b) => b.contribution - a.contribution);
}

function buildRisks(f: FeatureReport, req: AnalyzeRequest): RiskFlag[] {
  const risks: RiskFlag[] = [
    {
      id: "url-verdict",
      severity: "critical",
      title: "Link may resolve to a low-quality / BAD URL verdict",
      detail: f.urlReason
        ? `${f.urlReason} A "LOW_QUALITY" verdict gets downranked — but if re-crawling turns up an actual "UNSAFE" verdict, the consequence is categorically worse: visibility-filtering applies MALICIOUS_URL_DROP/DO_NOT_AMPLIFY_DROP, which is a hard non-distribution drop for every non-author viewer, not a downrank.`
        : "No risky link pattern detected in this draft.",
      source:
        "botmaker-rules/scarecrow/bot/Tweet_Spam_High_Recall_RTF_All_Bad_URL_Sources.bot, LQ_Tweets_With_LQ_URL_Verdict_At_Mention_To_NonFollower_v2.bot, rtf_tweets_on_unsafe_verdict.bot (id 20790); visibility-filtering/rules/tweet_label_drops.rs:113-124",
      triggered: f.urlRisk,
    },
    {
      id: "mention-link-combo",
      severity: "warning",
      title: "@-mentioning non-followers alongside a link amplifies URL risk",
      detail:
        "This post @-mentions people while carrying a link with a shaky reputation. The same URL is treated as riskier when it appears in an @-mention to someone who doesn't follow you.",
      source:
        "botmaker-rules/scarecrow/bot/LQ_Tweets_With_LQ_URL_Verdict_At_Mention_To_NonFollower_v2.bot (id 6754)",
      triggered: f.urlRisk && f.mentions >= 1,
    },
    {
      id: "duplicate-boilerplate",
      severity: "warning",
      title: "Reads like templated / copy-paste boilerplate",
      detail:
        'Phrases like "follow for follow", "link in bio", or "RT if you agree" match the kind of generic, repeated-across-many-posts text that duplicate-text spam detection is built to catch — the same COPYPASTA_SPAM detection runs on reply text too, unigram- and CJK-character-matched, not just original posts.',
      source:
        "botmaker-rules/scarecrow/bot/BBQDuplicateTextProd.bot (id 21711), BBQDuplicateTextRepliesProd.bot (id 21599) — heuristic proxy, not a literal duplicate-corpus match",
      triggered: f.hasBoilerplateCTA,
    },
    {
      id: "all-caps",
      severity: "warning",
      title: "Heavy use of ALL-CAPS reads as spammy / shouty",
      detail:
        "A high ratio of all-caps words correlates with the kind of low-quality, aggressive formatting that pushes up 'not interested', mute, and report propensity — and those three actions carry the three most negative weights in the entire model (-43.2, -58.8, -234).",
      source: "home-mixer/params/param.rs — NotInterestedWeight, MuteAuthorWeight, ReportWeight",
      triggered: f.allCapsWordRatio > 0.25,
    },
    {
      id: "hashtag-stuffing",
      severity: "warning",
      title: "Hashtag stuffing",
      detail:
        "More than a handful of hashtags is a classic low-quality/spam signal and dilutes what the post is actually about.",
      source: "General spam-heuristic best practice, paired with scarecrow's broader spam-label pipeline",
      triggered: f.hashtags > 4,
    },
    {
      id: "nsfw-interstitial",
      severity: "critical",
      title: "Sensitive media will be shown behind a click-through blur",
      detail:
        "Marked as sensitive media: viewers who haven't opted into sensitive content will see this post behind an interstitial instead of the media directly, which suppresses impulse engagement.",
      source:
        "visibility-filtering/rules/nsfw_interstitial.rs — NSFW_HIGH_PRECISION_INTERSTITIAL / NsfwAuthorInterstitialRule",
      triggered: req.nsfw,
    },
    {
      id: "nsfw-account-label",
      severity: "warning",
      title: "Repeated NSFW posts can trip an account-level label",
      detail:
        "This goes beyond a single post's interstitial: if roughly 3 of your last 5 posts (within 60 days) carry an NSFW_HIGH_PRECISION flag, your whole account gets a 7-day NSFW_HIGH_PRECISION label; an unbroken streak of flagged posts can escalate further to a POSSIBLY_NSFW_ACCOUNT label.",
      source: "safety-label-user-agg/postToUserLabelRules.strato:360-428",
      triggered: req.nsfw && req.recentPostsCount >= 2,
    },
    {
      id: "repeat-posting",
      severity: "info",
      title: "Repeat posting in the same window compresses reach",
      detail: `You told us this is post #${
        req.recentPostsCount + 1
      } from you in this window. Author-diversity decay multiplies each additional post from the same author by (1 - 0.25) × 0.5^k + 0.25 — so a 2nd post already scores at ${(
        authorDiversityMultiplier(1) * 100
      ).toFixed(0)}% and it floors at 25% by the 4th+.`,
      source:
        "home-mixer/scorers/ranking_scorer.rs — diversity_multiplier(decay=0.5, floor=0.25)",
      triggered: req.recentPostsCount >= 1,
    },
    {
      id: "oon-discount",
      severity: "info",
      title: "Reach beyond your followers is discounted by 25%",
      detail:
        "Every post is scored at full strength for your own followers. For everyone else (out-of-network recommendation), the final score is multiplied by 0.75 — and that surface also runs extra spam/abuse-only drop rules your followers never see.",
      source: "home-mixer/params/param.rs — OonWeightFactor = 0.75",
      triggered: true,
    },
  ];

  if (req.authorFollowers !== undefined) {
    const ageHours = req.postedHoursAgo ?? 0;
    const eligible =
      req.authorFollowers <= COLD_START_FOLLOWER_CAP && ageHours <= COLD_START_MAX_AGE_HOURS;
    risks.push({
      id: "cold-start-boost",
      severity: "info",
      title: eligible ? "Cold-start boost likely applies" : "Cold-start boost doesn't apply here",
      detail: eligible
        ? `With ${req.authorFollowers.toLocaleString()} followers (≤ ${COLD_START_FOLLOWER_CAP.toLocaleString()} cap) and posted ${
            ageHours < 1 ? "just now" : `${ageHours.toFixed(0)}h ago`
          } (≤ ${COLD_START_MAX_AGE_HOURS}h window), this post is eligible to be force-boosted into a top slot for some viewers — within the top ${(
            COLD_START_MAX_POSITION_RATIO * 100
          ).toFixed(
            0
          )}% of ranked positions — bypassing the normal weighted-score ranking entirely. This is separate from, and on top of, the BESC Score above.`
        : `Cold-start force-boosting only kicks in under ${COLD_START_FOLLOWER_CAP.toLocaleString()} followers and within a ${COLD_START_MAX_AGE_HOURS}h posting window — at ${req.authorFollowers.toLocaleString()} followers${
            ageHours > COLD_START_MAX_AGE_HOURS ? ` and ${ageHours.toFixed(0)}h old` : ""
          }, this post doesn't currently qualify.`,
      source:
        "home-mixer/scorers/author_cold_start.rs:86-91,156-192; home-mixer/params/param.rs:638-655 (ColdStartFollowerCap=1000, ColdStartMaxPostAgeSecs=86400, LowImpressionsMaxPositionRatio=0.85)",
      triggered: eligible,
    });
  }

  return risks;
}

function buildTips(f: FeatureReport, req: AnalyzeRequest, risks: RiskFlag[]): Tip[] {
  const tips: Tip[] = [];

  if (!f.hasReplyCTA && f.hasQuestion === 0) {
    tips.push({
      id: "ask-question",
      title: "Give people a reason to reply, not just like",
      detail:
        "Reply is weighted 5.0–20.0 (with the bidirectional-follow boost), versus 0.5 for a like — 10 to 40× more valuable. End with a genuine question or a clear stance people will want to respond to.",
      impact: "high",
    });
  }

  if (req.mediaType === "none") {
    tips.push({
      id: "add-media",
      title: "Consider attaching a photo or video",
      detail:
        "Media unlocks photo-expand/video-open and video-quality-view weights that a text-only post can never earn, and media posts tend to hold attention longer.",
      impact: "medium",
    });
  }

  if (f.words < 8) {
    tips.push({
      id: "too-short",
      title: "This post may be too thin to hold attention",
      detail:
        "Very short posts tend to score lower on dwell-related signals. Give the reader enough context to want to stop scrolling.",
      impact: "medium",
    });
  }

  if (f.words > 70) {
    tips.push({
      id: "too-long",
      title: "Trim it down",
      detail:
        "Long, dense posts lose skimmers before they reach your point. Aim for a tight ~15-45 words, or restructure as a thread so each post pulls its own weight.",
      impact: "low",
    });
  }

  if (risks.find((r) => r.id === "url-verdict")?.triggered) {
    tips.push({
      id: "fix-link",
      title: "Swap the shortened/redirect link for a direct, reputable URL",
      detail:
        "Post the real destination link directly instead of a shortener. Shortened and redirect-heavy links are exactly what URL-verdict spam checks re-resolve and distrust by default.",
      impact: "high",
    });
  }

  if (risks.find((r) => r.id === "duplicate-boilerplate")?.triggered) {
    tips.push({
      id: "de-boilerplate",
      title: 'Cut the "follow for follow" / "link in bio" style phrasing',
      detail:
        "Rewrite in your own voice. Generic broadcast phrasing is the fingerprint duplicate-text spam detection is built to catch across many accounts posting the same boilerplate.",
      impact: "high",
    });
  }

  if (f.allCapsWordRatio > 0.25 || f.exclamationBursts > 0) {
    tips.push({
      id: "tone-down",
      title: "Dial back the ALL-CAPS / !!! energy",
      detail:
        "Report (-234), Mute (-58.8), and Not-interested (-43.2) are by far the largest weights in the whole model — negative. It takes very little of that reaction to wipe out a lot of likes.",
      impact: "high",
    });
  }

  if (f.hashtags > 4) {
    tips.push({
      id: "cut-hashtags",
      title: "Cut hashtags down to 1-2 relevant ones",
      detail:
        "Beyond a couple of targeted hashtags, more tags read as spam and add nothing — reach comes from the ranking model, not from hashtag volume.",
      impact: "medium",
    });
  }

  if (!f.hasNumbers && !f.hasThreadMarker && f.words > 15) {
    tips.push({
      id: "make-shareable",
      title: "Give it a concrete hook — a stat, a claim, a story beat",
      detail:
        "Share via copy-link is the single highest-weighted action in the model (20.0). Concrete, specific claims are what people actually screenshot or copy-link to send to a friend.",
      impact: "medium",
    });
  }

  if (req.isReplyToMutual) {
    tips.push({
      id: "mutual-reply-bonus",
      title: "Good move: replying inside a mutual-follow thread",
      detail:
        "Original-post replies between two accounts that follow each other get a +15.0 boost on top of the base 5.0 reply weight — the single largest situational boost in the model.",
      impact: "low",
    });
  }

  if (req.recentPostsCount >= 2) {
    tips.push({
      id: "spread-out",
      title: "Space your posts out",
      detail: `At post #${
        req.recentPostsCount + 1
      } in this window, author-diversity decay has already pushed the multiplier toward the 25% floor for repeat viewers. Spread posts across the day instead of stacking them.`,
      impact: "medium",
    });
  }

  return tips;
}

export function analyzePost(req: AnalyzeRequest): ScoreResult {
  const features = extractFeatures(req.text, req.link);
  const probabilities = estimateActionProbabilities(features, req);
  const actions = buildActionRows(probabilities, req);

  const positiveContribution = actions
    .filter((a) => a.contribution > 0)
    .reduce((s, a) => s + a.contribution, 0);
  const negativeContribution = actions
    .filter((a) => a.contribution < 0)
    .reduce((s, a) => s + a.contribution, 0);

  const rawScore = positiveContribution + negativeContribution;

  const diversityMultiplier = authorDiversityMultiplier(req.recentPostsCount);
  const adjustedRaw = rawScore * diversityMultiplier;

  // Squash the unbounded weighted sum into a 0-100 "BESC Score".
  // Calibrated so a strong, clean, high-engagement draft lands ~85-95 and a
  // spam-flagged / low-effort draft lands well under 30.
  const SQUASH_C = 1.9;
  let score: number;
  if (adjustedRaw >= 0) {
    score = 100 * (adjustedRaw / (adjustedRaw + SQUASH_C));
  } else {
    score = Math.max(0, 8 + adjustedRaw); // negative scores compress hard toward 0
  }
  score = Math.round(clamp01(score / 100) * 1000) / 10;

  let grade: string;
  if (score >= 82) grade = "Excellent";
  else if (score >= 58) grade = "Strong";
  else if (score >= 38) grade = "Decent";
  else if (score >= 20) grade = "Weak";
  else grade = "High Risk";

  const risks = buildRisks(features, req);
  const tips = buildTips(features, req, risks);

  return {
    score,
    grade,
    rawScore,
    positiveContribution,
    negativeContribution,
    actions,
    risks,
    tips,
    features,
    authorDiversityMultiplier: diversityMultiplier,
    oonWeightFactor: OON_WEIGHT_FACTOR,
  };
}
