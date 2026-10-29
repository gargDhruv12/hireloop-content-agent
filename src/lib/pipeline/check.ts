import type { ClientProfile } from "@/clients/types";
import { CheckSchema, type ContentPack } from "@/lib/content/schemas";
import { mergeFindings } from "@/lib/content/findings";
import { lintPack } from "@/lib/content/lint";
import { PIECE_ORDER, getPieces } from "@/lib/content/pieces";
import type { Fact, Finding, PieceId } from "@/lib/content/types";
import { generateStructured } from "@/lib/ai/gemini";
import { checkPrompt } from "./prompts";

export { blockingPieces, mergeFindings } from "@/lib/content/findings";

/**
 * Step 4 · Checker = rules (code) + reviewer (a separate model call that
 * did not write the drafts). Rules catch what can be measured; the reviewer
 * catches claims that are worded to sound true.
 */
export async function checkPack(pack: ContentPack, client: ClientProfile, facts: Fact[]): Promise<Finding[]> {
  const rules = lintPack(pack, { client, facts });
  const ai = await aiReview(pack, client, facts);
  return mergeFindings(rules, ai);
}

export async function aiReview(pack: ContentPack, client: ClientProfile, facts: Fact[]): Promise<Finding[]> {
  const pieces = getPieces(pack);
  const draftText = pieces
    .map((p) => `### ${p.id}\n${p.fields.map((f) => `${f.label}: ${f.value}`).join("\n")}`)
    .join("\n\n");
  const { system, prompt } = checkPrompt({ client, facts, draftText });
  const out = await generateStructured({ task: "check", schema: CheckSchema, system, prompt });

  return out.findings
    .filter((f) => (PIECE_ORDER as string[]).includes(f.pieceId))
    .map((f, i) => {
      const piece = pieces.find((p) => p.id === f.pieceId)!;
      const field = piece.fields.find((fl) => fl.value.toLowerCase().includes(f.excerpt.toLowerCase()));
      return {
        id: `a${i + 1}`,
        pieceId: f.pieceId as PieceId,
        path: field?.path,
        // Only keep the excerpt if it really is in the draft, so highlights never point at nothing.
        excerpt: field ? f.excerpt : undefined,
        kind: f.kind,
        severity: f.severity,
        message: f.message,
        suggestion: f.suggestion || undefined,
        by: "ai" as const,
      };
    });
}
