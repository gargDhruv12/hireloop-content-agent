import type { ClientProfile } from "@/clients/types";
import {
  BlogSchema,
  ContentPackSchema,
  GoogleAdSchema,
  InstagramSchema,
  LinkedInSchema,
  MetaAdSchema,
  PlanSchema,
  XThreadSchema,
  type ContentPack,
  type Plan,
} from "@/lib/content/schemas";
import { pieceLocation } from "@/lib/content/pieces";
import type { Fact, Finding, PieceId, RunInput } from "@/lib/content/types";
import { generateStructured } from "@/lib/ai/gemini";
import { planPrompt, revisePrompt, writePrompt } from "./prompts";

/** Step 2 · Planner: one audience, one angle, a short list of facts. */
export async function makePlan(args: {
  client: ClientProfile;
  run: RunInput;
  topicSummary: string;
  facts: Fact[];
  cautions: string[];
}): Promise<Plan> {
  const { system, prompt } = planPrompt(args);
  return generateStructured({ task: "plan", schema: PlanSchema, system, prompt });
}

/** Step 3 · Writer: the whole pack in one structured call, so the pieces share one angle. */
export async function writePack(args: {
  client: ClientProfile;
  run: RunInput;
  plan: Plan;
  facts: Fact[];
  cautions: string[];
}): Promise<ContentPack> {
  const { system, prompt } = writePrompt(args);
  const pack = await generateStructured({ task: "write", schema: ContentPackSchema, system, prompt, role: "writer" });
  return normalisePack(pack);
}

const PIECE_SCHEMAS = {
  blog: BlogSchema,
  linkedin: LinkedInSchema,
  xThread: XThreadSchema,
  instagram: InstagramSchema,
  metaAds: MetaAdSchema,
  googleAds: GoogleAdSchema,
} as const;

/**
 * Rewrite one piece, either to fix checker findings (self-revision) or
 * because a reviewer pressed "Rewrite" with a note.
 */
export async function rewritePiece(args: {
  client: ClientProfile;
  pack: ContentPack;
  pieceId: PieceId;
  findings: Finding[];
  facts: Fact[];
  reviewerNote?: string;
}): Promise<ContentPack> {
  const loc = pieceLocation(args.pieceId);
  const current = loc.index === undefined ? args.pack[loc.key] : (args.pack[loc.key] as unknown[])[loc.index];
  const { system, prompt } = revisePrompt({
    client: args.client,
    pieceId: args.pieceId,
    pieceJson: JSON.stringify(current, null, 2),
    findings: args.findings,
    facts: args.facts,
    reviewerNote: args.reviewerNote,
  });
  const schema = PIECE_SCHEMAS[loc.key as keyof typeof PIECE_SCHEMAS];
  const revised = await generateStructured({ task: "revise", schema, system, prompt, role: "writer" });

  const next = structuredClone(args.pack);
  if (loc.index === undefined) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (next as any)[loc.key] = revised;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (next as any)[loc.key][loc.index] = revised;
  }
  return normalisePack(next);
}

/**
 * Models sometimes return 2 or 4 ads. Keep exactly 3 of each so the review
 * screen and exports stay predictable; the linter reports short ad copy.
 */
export function normalisePack(pack: ContentPack): ContentPack {
  const next = structuredClone(pack);
  next.metaAds = next.metaAds.slice(0, 3);
  next.googleAds = next.googleAds.slice(0, 3);
  if (next.metaAds.length < 3 || next.googleAds.length < 3) {
    throw new Error(
      `The writer returned ${next.metaAds.length} Meta and ${next.googleAds.length} Google ads instead of 3 each. Run again; if it repeats, try the WRITER_MODEL with more headroom.`,
    );
  }
  next.instagram.hashtags = next.instagram.hashtags.map((t) => t.replace(/^#+/, "").trim()).filter(Boolean);
  next.googleAds.forEach((ad) => {
    ad.path1 = ad.path1.replace(/^\/+/, "");
    ad.path2 = ad.path2.replace(/^\/+/, "");
  });
  return next;
}
