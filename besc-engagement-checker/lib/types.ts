export type MediaType = "none" | "photo" | "video" | "gif";

export interface AnalyzeRequest {
  text: string;
  mediaType: MediaType;
  link: string;
  isReplyToMutual: boolean;
  recentPostsCount: number;
  nsfw: boolean;
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
  hasNumbers: boolean;
  hasThreadMarker: boolean;
  urlRisk: boolean;
  urlReason: string | null;
}

export interface TweetImportResult {
  text: string;
  mediaType: MediaType;
  link: string;
  authorHandle: string;
  authorName: string;
  authorFollowers: number;
  authorVerified: boolean;
  recentPostsCount: number;
  realMetrics: {
    likes: number;
    retweets: number;
    replies: number;
    quotes: number;
    bookmarks: number;
  };
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
