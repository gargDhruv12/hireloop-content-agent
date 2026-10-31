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

/**
 * The pack is written in four calls that run at the same time. One call for
 * the whole pack was the step most likely to fail: in live runs it was the
 * one that hit "model overloaded" on every model, and a dropped call lost all
 * the work. Smaller calls finish sooner and each gets its full output budget,
 * so the blog isn't squeezed by nine other pieces. The shared plan keeps one
 * angle across them.
 */
const WRITE_GROUPS: (keyof ContentPack)[][] = [["blog"], ["linkedin", "xThread", "instagram"], ["metaAds", "googleAds"], ["imageBrief"]];

/** Step 3 · Writer: every piece from the same plan, audience, angle and facts. */
export async function writePack(args: {
  client: ClientProfile;
  run: RunInput;
  plan: Plan;
  facts: Fact[];
  cautions: string[];
}): Promise<ContentPack> {
  const { system, prompt } = writePrompt(args);
  const parts = await Promise.all(
    WRITE_GROUPS.map((keys) =>
      generateStructured({
        task: "write",
        schema: ContentPackSchema.pick(Object.fromEntries(keys.map((k) => [k, true])) as { [K in keyof ContentPack]?: true }),
        system,
        prompt: `${prompt}\n\nWrite ONLY these parts of the pack now: ${keys.join(", ")}. The other parts are written at the same time from the same plan, so stay on its angle and key message.`,
        role: "writer",
      }),
    ),
  );
  // Take each group's own keys (the offline sample returns the whole pack for every call).
  const merged = Object.fromEntries(WRITE_GROUPS.flatMap((keys, i) => keys.map((k) => [k, (parts[i] as Partial<ContentPack>)[k]])));
  return normalisePack(ContentPackSchema.parse(merged));
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
