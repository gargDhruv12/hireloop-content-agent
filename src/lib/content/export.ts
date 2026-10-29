import type { ContentPack } from "./schemas";
import type { Run } from "./types";
import { getPieces } from "./pieces";

/** Approved pieces as one Markdown file, ready to paste into a doc or a scheduler. */
export function approvedMarkdown(run: Run, pack: ContentPack): string {
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
    lines.push("## Image", "", `Alt text: ${pack.imageBrief.altText}`, "", `Brief: ${pack.imageBrief.concept}`, "");
  }
  const used = new Set(approved.flatMap((p) => p.factIds));
  const facts = run.research.facts.filter((f) => used.has(f.id));
  if (facts.length) {
    lines.push("## Sources for the claims above", "");
    for (const f of facts) lines.push(`- **${f.id}** ${f.text} (${f.ref})`);
  }
  return lines.filter((l, i, all) => !(l === "" && all[i - 1] === "")).join("\n");
}
