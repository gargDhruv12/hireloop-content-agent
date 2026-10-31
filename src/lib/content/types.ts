import type { ContentPack, Plan } from "./schemas";
import type { RejectedFact } from "./grounding";

/** A fact the drafts are allowed to use. C = client site, S = source article, W = client page read live. */
export interface Fact {
  id: string;
  text: string;
  origin: "client" | "source" | "client-web";
  /** URL or "Client profile · <section>" */
  ref: string;
  quote?: string;
  /** True when the researcher judged this fact relevant to the topic. */
  relevant: boolean;
}

export interface ResearchResult {
  topicSummary: string;
  facts: Fact[];
  /** Facts the model offered whose quote wasn't in the page read. Never shown to the writer. Optional for older runs. */
  rejectedFacts?: RejectedFact[];
  cautions: string[];
  pagesRead: { url: string; title: string; chars: number; ok: boolean; error?: string }[];
  /** Whether the client's live site was read this run. Optional for older runs. */
  clientSite?: { status: "off" } | { status: "read"; url: string; pages: number } | { status: "failed"; url: string; error: string };
  /** Where the outside sources (S facts) came from. Optional for older runs. */
  sourceKind?: "link" | "pasted" | "search" | "none";
}

export type FindingKind =
  | "length"
  | "banned_phrase"
  | "untraced_number"
  | "citation"
  | "missing_cta"
  | "format"
  | "unsupported_claim"
  | "off_brand"
  | "misleading"
  | "tone";

export interface Finding {
  /** Stable within a run, used to link highlights to margin notes. */
  id: string;
  pieceId: PieceId;
  /** Field path inside the content pack, when known. */
  path?: string;
  /** Exact words the finding is about, used to highlight the draft. */
  excerpt?: string;
  kind: FindingKind;
  severity: "block" | "warn";
  message: string;
  suggestion?: string;
  /** "rules" = deterministic code check, "ai" = model reviewer. */
  by: "rules" | "ai";
}

export type PieceId =
  | "blog"
  | "linkedin"
  | "x"
  | "instagram"
  | "meta-1"
  | "meta-2"
  | "meta-3"
  | "google-1"
  | "google-2"
  | "google-3";

export type ReviewStatus = "pending" | "approved" | "changes";

export type StepName = "research" | "plan" | "write" | "check" | "revise" | "image";

export interface RunInput {
  topic: string;
  /** Which client the pack is for (see src/clients). Missing on older runs, which are HireLoop's. */
  clientId?: string;
  sourceUrl?: string;
  audience?: string;
  notes?: string;
}

export interface Run {
  id: string;
  createdAt: string;
  client: string;
  input: RunInput;
  models: { text: string; writer: string; image: string; mock: boolean };
  research: ResearchResult;
  plan: Plan;
  /** The pack as the agent left it (after at most one self-revision). */
  pack: ContentPack;
  /** The pack before self-revision, if one happened. Kept for the demo/eval. */
  firstDraft?: ContentPack;
  findings: Finding[];
  revision?: { pieces: PieceId[]; blockingBefore: number; blockingAfter: number };
  image?: { file: string; mediaType: string; prompt: string };
  imageError?: string;
  review: Partial<Record<PieceId | "image", ReviewStatus>>;
  /** Every review decision, oldest first. Optional for older runs. */
  reviewLog?: ReviewLogEntry[];
  timings: Partial<Record<StepName, number>>;
  /** Tokens this run used across all model calls (not counting later rewrites). Optional for older runs. */
  usage?: Usage;
  /** Hidden from the home page and the default list; kept, and can be restored. */
  archived?: boolean;
}

/** One review decision, recorded by the server so the export can show who signed off on what. */
export interface ReviewLogEntry {
  /** Who decided, when sign-in is on. `byVerified` is false for a name typed with the shared password. */
  by?: string;
  byVerified?: boolean;
  piece: PieceId | "image";
  status: ReviewStatus;
  at: string;
  /** Blocking findings on the piece when it was approved. Above 0 means the reviewer overrode the checker. */
  blockingAtDecision: number;
  /** SHA-256 of the piece's text at the moment of the decision, so an export can prove it's the reviewed text. */
  textHash: string;
}

/** Progress events streamed to the browser while a run is in flight (NDJSON). */
export type RunEvent =
  | { type: "step"; step: StepName; status: "running" | "done" | "skipped" | "failed"; detail?: string }
  | { type: "done"; runId: string }
  | { type: "error"; message: string };

/** Tokens a run used. Per-model counts and images exist on runs made after #20. */
export interface Usage {
  inputTokens: number;
  outputTokens: number;
  byModel?: Record<string, { inputTokens: number; outputTokens: number }>;
  images?: number;
  /** Google Search calls (topic-only packs). Google bills these separately from tokens. */
  searches?: number;
}
