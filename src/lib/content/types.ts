import type { ContentPack, Plan } from "./schemas";

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
  cautions: string[];
  pagesRead: { url: string; title: string; chars: number; ok: boolean; error?: string }[];
}

export type FindingKind =
  | "length"
  | "banned_phrase"
  | "untraced_number"
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
  timings: Partial<Record<StepName, number>>;
}

/** Progress events streamed to the browser while a run is in flight (NDJSON). */
export type RunEvent =
  | { type: "step"; step: StepName; status: "running" | "done" | "skipped" | "failed"; detail?: string }
  | { type: "done"; runId: string }
  | { type: "error"; message: string };
