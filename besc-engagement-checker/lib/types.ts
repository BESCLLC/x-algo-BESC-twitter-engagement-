export type MediaType = "none" | "photo" | "video" | "gif";

export interface AnalyzeRequest {
  text: string;
  mediaType: MediaType;
  link: string;
  /** Is this draft itself a reply to someone else's post (not a quote post)? */
  isReply: boolean;
  /** Does a meaningful share of your followers also follow you back? Only
   * matters when isReply is false — see WEIGHTS.bidirectionalReplyBoost. */
  hasMutualFollowAudience: boolean;
  recentPostsCount: number;
  nsfw: boolean;
  /** Your follower count, if known — drives the cold-start boost check. Omit if unknown. */
  authorFollowers?: number;
  /** Hours since this post went live. Omit/0 for a not-yet-posted draft (posting now). */
  postedHoursAgo?: number;
  /** X Premium / verified checkmark — raises the character limit from 280 to 4,000+. */
  isVerified?: boolean;
}

export interface ActionRow {
  id: string;
  label: string;
  group: "engagement" | "clicks" | "attention" | "author" | "negative";
  weight: number;
  probability: number;
  contribution: number;
  weightSource: string;
}

export type RiskSeverity = "critical" | "warning" | "info";

export interface RiskFlag {
  id: string;
  severity: RiskSeverity;
  title: string;
  detail: string;
  source: string;
  triggered: boolean;
}

export interface Tip {
  id: string;
  title: string;
  detail: string;
  impact: "high" | "medium" | "low";
}

export interface FeatureReport {
  chars: number;
  words: number;
  hashtags: number;
  mentions: number;
  links: number;
  emojis: number;
  allCapsWordRatio: number;
  exclamationBursts: number;
  hasQuestion: number;
  hasReplyCTA: boolean;
  hasShareCTA: boolean;
  hasBoilerplateCTA: boolean;
  hasAiSlopPhrasing: boolean;
  hasNumbers: boolean;
  hasThreadMarker: boolean;
  fillerWords: number;
  passiveVoiceRatio: number;
  hasWeakOpener: boolean;
  urlRisk: boolean;
  urlReason: string | null;
}

export interface AuthorLookupResult {
  authorHandle: string;
  authorName: string;
  authorFollowers: number;
  authorVerified: boolean;
}

export interface TweetImportResult {
  text: string;
  mediaType: MediaType;
  link: string;
  /** Was this tweet itself posted as a reply (in_reply_to_status_id present)? */
  isReply: boolean;
  /** Vee3's possibly_sensitive flag, if present. */
  nsfw: boolean;
  authorHandle: string;
  authorName: string;
  authorFollowers: number;
  authorVerified: boolean;
  recentPostsCount: number;
  postedHoursAgo: number;
  realMetrics: {
    views: number;
    likes: number;
    retweets: number;
    replies: number;
    quotes: number;
    bookmarks: number;
  };
}

export interface OptimizeStep {
  id: string;
  label: string;
  reason: string;
  scoreBefore: number;
  scoreAfter: number;
}

export interface AICandidate {
  text: string;
  score: number;
}

export type AIStatus = "disabled" | "error" | "no_improvement" | "found";

export interface OptimizeResult {
  originalText: string;
  optimizedText: string;
  applied: OptimizeStep[];
  before: ScoreResult;
  after: ScoreResult;
  /** Always present so the UI can show real AI status instead of silently omitting the section. */
  aiStatus: AIStatus;
  /** Populated only when aiStatus is "found" — each candidate scores strictly higher than the deterministic result. */
  aiCandidates?: AICandidate[];
}

export interface ScoreResult {
  score: number;
  grade: string;
  rawScore: number;
  positiveContribution: number;
  negativeContribution: number;
  actions: ActionRow[];
  risks: RiskFlag[];
  tips: Tip[];
  features: FeatureReport;
  authorDiversityMultiplier: number;
  oonWeightFactor: number;
}
