/**
 * Every prompt the agent sends lives here, so the team can read and tune
 * them in one place. Prompts are plain functions of their inputs: no hidden
 * state, easy to test and to show in the demo.
 */
import type { ClientProfile } from "@/clients/types";
import type { Plan } from "@/lib/content/schemas";
import type { Fact, Finding, RunInput } from "@/lib/content/types";
import { LIMITS } from "@/lib/content/pieces";
import type { PageText } from "@/lib/web/fetch-page";

export function factSheet(facts: Fact[], onlyRelevant = false): string {
  return facts
    .filter((f) => !onlyRelevant || f.relevant)
    .map((f) => `[${f.id}] ${f.text}`)
    .join("\n");
}

/**
 * Without this, live runs built every pack from the fact sheet alone: the
 * article the team pasted and the client's live site went unused.
 */
function sourceGuidance(facts: Fact[], step: "plan" | "write"): string {
  const article = facts.some((f) => f.id.startsWith("S"));
  const site = facts.some((f) => f.id.startsWith("W"));
  if (!article && !site) return "";
  const lines = ["", "Sources:"];
  if (article) {
    lines.push(
      step === "plan"
        ? "- S facts come from the article the team supplied: it is why this pack exists. Include 1–2 S facts in factIds, and let the angle respond to the article."
        : "- S facts come from the article the team supplied. Use them to set up the problem or the context (the blog cites at least one), then show where the client fits. Attribute them as industry context, never as the client's results.",
    );
  }
  if (site) lines.push("- W facts come from the client's live website and are current; prefer them over an older fact sheet line saying the same thing.");
  return lines.join("\n");
}

function voiceBlock(client: ClientProfile): string {
  return [
    `Voice: ${client.voice.summary}`,
    "Do:",
    ...client.voice.do.map((d) => `- ${d}`),
    "Don't:",
    ...client.voice.dont.map((d) => `- ${d}`),
  ].join("\n");
}

// ── Research ─────────────────────────────────────────────────────────

export function researchPrompt(input: {
  client: ClientProfile;
  run: RunInput;
  source?: PageText;
  clientPages: PageText[];
}): { system: string; prompt: string } {
  const { client, run, source, clientPages } = input;
  return {
    system: `You are the research step of a content agent for ${client.name}. You extract facts; you never invent them. Copy numbers exactly. If the article is about other companies or the whole industry, say so in a caution so the writer doesn't attribute it to ${client.name}.`,
    prompt: [
      `Topic: ${run.topic}`,
      run.notes ? `Notes from the team: ${run.notes}` : "",
      "",
      `## ${client.name} fact sheet (already verified)`,
      client.facts.map((f) => `[${f.id}] ${f.text}`).join("\n"),
      "",
      source
        ? `## Article supplied by the team\nURL: ${source.url}\nTitle: ${source.title}\n\n${source.text.slice(0, 14000)}`
        : "## Article\nNone supplied. sourceFacts must be an empty list.",
      "",
      clientPages.length
        ? `## ${client.name} pages read live\n${clientPages.map((p) => `URL: ${p.url}\n${p.text.slice(0, 5000)}`).join("\n\n---\n\n")}`
        : `## ${client.name} pages read live\nNone. clientWebFacts must be an empty list.`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

// ── Plan ─────────────────────────────────────────────────────────────

export function planPrompt(input: {
  client: ClientProfile;
  run: RunInput;
  topicSummary: string;
  facts: Fact[];
  cautions: string[];
}): { system: string; prompt: string } {
  const { client, run } = input;
  return {
    system: `You are a content strategist for ${client.name}. ${client.oneLiner} Pick one sharp angle that links the topic to ${client.name}. Choose facts from the list only.`,
    prompt: [
      `Topic: ${run.topic}`,
      `Topic summary: ${input.topicSummary}`,
      `Audience: ${run.audience || client.audiences[0]}`,
      run.notes ? `Team notes: ${run.notes}` : "",
      "",
      "Facts you may use:",
      factSheet(input.facts),
      sourceGuidance(input.facts, "plan"),
      input.cautions.length ? `\nCautions:\n${input.cautions.map((c) => `- ${c}`).join("\n")}` : "",
      `\nDefault call to action: ${client.primaryCta.label}. ${client.primaryCta.detail}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

// ── Write ────────────────────────────────────────────────────────────

export const CHANNEL_RULES = `Channel rules (hard limits are enforced by a checker after you write):
- Blog: a full Markdown article of 700–900 words. Structure: an intro of 80–120 words, then 4–5 "## " sections of 150–200 words each (3 paragraphs: the problem, how it plays out, a practical takeaway), then a closing paragraph with the call to action. A per-section budget matters: asked only for a total, models stop near 400 words, and they write sections about a third shorter than asked. Title under ${LIMITS.blogTitle.max} characters. Meta description under ${LIMITS.blogMeta.max} characters. End with the call to action.
- LinkedIn: under 1,300 characters. First line is a hook that works alone. Short paragraphs. No hashtag wall (0–3 hashtags).
- X thread: 4–6 posts, each at most ${LIMITS.xPost.max} characters including spaces and emoji. Post 1 is the hook.
- Instagram: caption under 600 characters, first 125 characters carry the message, 3–6 hashtags without the # sign.
- Meta ads (3): primary text ≤ ${LIMITS.metaPrimaryText.max} characters, headline ≤ ${LIMITS.metaHeadline.max}, description ≤ ${LIMITS.metaDescription.max}. Each ad tests a DIFFERENT angle (e.g. candidate convenience, fairness, speed result).
- Google ads (3): exactly 3 headlines of at most ${LIMITS.googleHeadline.max} characters each and 2 descriptions of at most ${LIMITS.googleDescription.max} characters each. Count characters carefully: "Shortlist Candidates in 48 Hours" is 32 characters and too long. Paths at most ${LIMITS.googlePath.max} characters, lowercase, hyphens not spaces.
- Image brief: describe one photograph-style scene for the main social image. No text in the image.`;

export function writePrompt(input: {
  client: ClientProfile;
  run: RunInput;
  plan: Plan;
  facts: Fact[];
  cautions: string[];
}): { system: string; prompt: string } {
  const { client, plan } = input;
  return {
    system: [
      `You write marketing content for ${client.name}. ${client.oneLiner}`,
      voiceBlock(client),
      "",
      "Truth rules:",
      "- Every number, price, result or product claim must come from the fact list below. Put the ids you used in factIds.",
      "- If a fact isn't in the list, leave it out. Never invent statistics, customers, quotes or awards.",
      "- Describe general industry problems in words, without numbers, unless an article fact gives the number.",
      "",
      CHANNEL_RULES,
    ].join("\n"),
    prompt: [
      `Topic: ${input.run.topic}`,
      `Audience: ${plan.audience}`,
      `Angle: ${plan.angle}`,
      `Key message: ${plan.keyMessage}`,
      `Call to action: ${plan.cta}`,
      input.run.notes ? `Team notes: ${input.run.notes}` : "",
      "",
      "Facts (lead with these ids: " + plan.factIds.join(", ") + "):",
      factSheet(input.facts),
      sourceGuidance(input.facts, "write"),
      input.cautions.length ? `\nCautions:\n${input.cautions.map((c) => `- ${c}`).join("\n")}` : "",
      "",
      `Image style for the brief: ${client.visual.style}`,
      `Brand colours: ${client.visual.palette.map((p) => `${p.name} ${p.hex}`).join(", ")}`,
      `Always avoid in images: ${client.visual.avoid.join("; ")}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

// ── Check ────────────────────────────────────────────────────────────

export function checkPrompt(input: {
  client: ClientProfile;
  facts: Fact[];
  draftText: string;
}): { system: string; prompt: string } {
  const { client } = input;
  return {
    system: [
      `You are a strict editor reviewing ${client.name} marketing drafts before a human sees them. You did not write them.`,
      "Flag only real problems:",
      "- unsupported_claim: a factual claim, number or result not supported by the fact list.",
      "- misleading: technically close to a fact but overstated (e.g. 'removes bias' when the fact says 'helps reduce bias').",
      "- off_brand: breaks a Don't rule below.",
      "- tone: off-voice for the brand, but not false.",
      "Use severity 'block' for unsupported_claim, misleading and off_brand; 'warn' for tone.",
      "The excerpt must be copied EXACTLY from the draft so it can be highlighted. Keep it short (3–12 words).",
      "Character limits, hashtags and banned words are checked by code; don't report them.",
      "If a piece is fine, report nothing for it. An empty list is a good result.",
      "",
      voiceBlock(client),
    ].join("\n"),
    prompt: `Fact list:\n${factSheet(input.facts)}\n\nDrafts:\n${input.draftText}`,
  };
}

// ── Revise one piece ─────────────────────────────────────────────────

export function revisePrompt(input: {
  client: ClientProfile;
  pieceId: string;
  pieceJson: string;
  findings: Finding[];
  facts: Fact[];
  reviewerNote?: string;
}): { system: string; prompt: string } {
  const problems = input.findings
    .map((f) => `- ${f.message}${f.excerpt ? ` (text: "${f.excerpt}")` : ""}${f.suggestion ? ` Suggested: "${f.suggestion}"` : ""}`)
    .join("\n");
  return {
    system: [
      `You revise one piece of ${input.client.name} marketing content. Fix the listed problems and change as little else as possible. Keep the same JSON shape.`,
      voiceBlock(input.client),
      "",
      CHANNEL_RULES,
    ].join("\n"),
    prompt: [
      `PIECE_ID: ${input.pieceId}`,
      "Current version (JSON):",
      input.pieceJson,
      "",
      problems ? `Problems to fix:\n${problems}` : "",
      input.reviewerNote ? `Reviewer's request: ${input.reviewerNote}` : "",
      "",
      "Facts you may use:",
      factSheet(input.facts),
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

// ── Image ────────────────────────────────────────────────────────────

export function imagePrompt(brief: {
  concept: string;
  scene: string;
  composition: string;
  lighting: string;
  palette: string;
  avoid: string[];
  aspectRatio: string;
}): string {
  return [
    `Photograph, ${brief.aspectRatio} aspect ratio. ${brief.scene}`,
    `Idea: ${brief.concept}`,
    `Composition: ${brief.composition}`,
    `Lighting: ${brief.lighting}`,
    `Colour: ${brief.palette}`,
    "Natural, candid and editorial, not staged stock photography. Realistic skin, hands and phones.",
    `Do not include: ${[...brief.avoid, "any text, words, letters, numbers, logos or watermarks"].join("; ")}.`,
  ].join("\n");
}
