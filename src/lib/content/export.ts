import type { ContentPack } from "./schemas";
import type { Run } from "./types";
import { getPieces } from "./pieces";

/**
 * Approved pieces as one Markdown file, ready to paste into a doc or a scheduler.
 * `imageFile` is the image's name next to this file in the download, if it's included.
 */
export function approvedMarkdown(run: Run, pack: ContentPack, imageFile?: string): string {
  const approved = getPieces(pack).filter((p) => run.review[p.id] === "approved");
  const lines = [
    `# ${run.client} content pack`,
    "",
    `Topic: ${run.input.topic}`,
    run.input.sourceUrl ? `Source: ${run.input.sourceUrl}` : "",
    `Angle: ${run.plan.angle}`,
    `Generated: ${new Date(run.createdAt).toLocaleString("en-IN")} · approved ${approved.length} of 10 pieces`,
    "",
  ];
  for (const piece of approved) {
    lines.push(`## ${piece.label}`, "");
    if (piece.id === "blog") {
      lines.push(`# ${pack.blog.title}`, "", `> ${pack.blog.metaDescription}`, "", pack.blog.body, "");
    } else {
      for (const f of piece.fields) lines.push(`**${f.label}:** ${f.value}`, "");
    }
    lines.push(`_Facts: ${piece.factIds.join(", ") || "none"}_`, "");
  }
  if (run.review.image === "approved") {
    lines.push("## Image", "");
    if (imageFile) lines.push(`![${pack.imageBrief.altText.replace(/[[\]]/g, "")}](${imageFile})`, "");
    lines.push(`Alt text: ${pack.imageBrief.altText}`, "", `Brief: ${pack.imageBrief.concept}`, "");
  }
  const used = new Set(approved.flatMap((p) => p.factIds));
  const facts = run.research.facts.filter((f) => used.has(f.id));
  if (facts.length) {
    lines.push("## Sources for the claims above", "");
    for (const f of facts) lines.push(`- **${f.id}** ${f.text} (${f.ref})`);
    lines.push("");
  }
  // The latest approval of each exported piece: when, over how many blocking notes, and a hash of the approved text.
  const signoffs = [...(run.reviewLog ?? [])]
    .reverse()
    .filter((e, i, all) => e.status === "approved" && run.review[e.piece] === "approved" && all.findIndex((x) => x.piece === e.piece) === i);
  if (signoffs.length) {
    lines.push("## Review record", "", "| Piece | Approved | Blocking notes overridden | Text SHA-256 |", "|---|---|---|---|");
    for (const e of signoffs.reverse()) {
      lines.push(`| ${e.piece} | ${new Date(e.at).toLocaleString("en-IN")} | ${e.blockingAtDecision || "none"} | \`${e.textHash.slice(0, 12)}\` |`);
    }
  }
  return lines.filter((l, i, all) => !(l === "" && all[i - 1] === "")).join("\n");
}
