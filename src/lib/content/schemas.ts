import { z } from "zod";

/**
 * The shapes the model must return. Length limits are NOT enforced here on
 * purpose: if a Google headline comes back at 34 characters we want the
 * linter to flag it for the reviewer, not crash the whole run.
 */

const factIds = z
  .array(z.string())
  .describe("Ids of the facts this piece relies on, e.g. [\"C4\", \"S2\"]. Every number or claim must trace to one of these.");

// ── Research ──────────────────────────────────────────────────────────
export const ResearchSchema = z.object({
  topicSummary: z
    .string()
    .describe("2–3 plain sentences: what the topic or article is about and why it matters to HireLoop's audience."),
  sourceFacts: z
    .array(
      z.object({
        text: z.string().describe("One fact from the article, in plain words. Keep numbers exactly as written."),
        quote: z.string().describe("The shortest exact phrase from the article that supports the fact (under 15 words)."),
      }),
    )
    .describe("Up to 8 facts taken from the supplied article. Empty if no article was supplied."),
  clientWebFacts: z
    .array(
      z.object({
        text: z.string(),
        quote: z.string().describe("Shortest exact supporting phrase from the client's page (under 15 words)."),
        url: z.string().describe("The client page it came from."),
      }),
    )
    .describe("Facts from the client's live web pages that are NOT already in the client fact list. Empty if no pages were read."),
  relevantClientFactIds: z
    .array(z.string())
    .describe("Ids of HireLoop facts (C1…) that genuinely connect to this topic, most relevant first."),
  cautions: z
    .array(z.string())
    .describe("Things the writer must be careful about, e.g. 'The 40% figure is about the whole industry, not HireLoop'."),
});

// ── Plan ──────────────────────────────────────────────────────────────
export const PlanSchema = z.object({
  audience: z.string().describe("The one reader this pack is written for."),
  angle: z.string().describe("The single angle that connects the topic to HireLoop, in one sentence."),
  keyMessage: z.string().describe("The one thing the reader should remember, under 20 words."),
  factIds: z.array(z.string()).describe("2–5 fact ids the pack will lean on."),
  cta: z.string().describe("The call to action, usually the sample AI interview."),
});

// ── Content pack ──────────────────────────────────────────────────────
export const BlogSchema = z.object({
  title: z.string(),
  metaDescription: z.string().describe("Under 155 characters."),
  body: z
    .string()
    .describe("Markdown, 700–900 words: an 80–120 word intro, 4–5 ## sections of 130–180 words each, then a closing paragraph with the call to action."),
  factIds,
});

export const LinkedInSchema = z.object({
  body: z.string().describe("Under 1,300 characters. The first line is the hook and must work on its own."),
  factIds,
});

export const XThreadSchema = z.object({
  posts: z.array(z.string()).describe("4–6 posts. Each post is at most 280 characters. No hashtags except in the last post."),
  factIds,
});

export const InstagramSchema = z.object({
  caption: z.string().describe("Under 600 characters. The first 125 characters carry the message."),
  hashtags: z.array(z.string()).describe("3–6 hashtags, without the # sign."),
  factIds,
});

export const MetaAdSchema = z.object({
  primaryText: z.string().describe("Ideally under 125 characters."),
  headline: z.string().describe("Ideally under 40 characters."),
  description: z.string().describe("Ideally under 30 characters."),
  cta: z.enum(["Learn more", "Sign up", "Book now", "Contact us", "Get quote"]),
  factIds,
});

export const GoogleAdSchema = z.object({
  headlines: z.array(z.string()).describe("Exactly 3 headlines, each at most 30 characters."),
  descriptions: z.array(z.string()).describe("Exactly 2 descriptions, each at most 90 characters."),
  path1: z.string().describe("Display URL path, at most 15 characters, no spaces."),
  path2: z.string().describe("Display URL path, at most 15 characters, no spaces."),
  factIds,
});

export const ImageBriefSchema = z.object({
  concept: z.string().describe("One sentence: the idea of the picture and why it fits the message."),
  scene: z.string().describe("What is in the frame: people, place, action, time of day."),
  composition: z.string().describe("Framing, camera angle, where the empty space is."),
  lighting: z.string(),
  palette: z.string().describe("How HireLoop's colours appear, naturally, in the scene."),
  avoid: z.array(z.string()),
  aspectRatio: z.enum(["1:1", "4:5", "16:9"]).describe("1:1 for Instagram and Meta, 16:9 for blog and LinkedIn."),
  channel: z.string().describe("The channel this image is mainly for."),
  altText: z.string().describe("Alt text for accessibility, under 125 characters."),
});

export const ContentPackSchema = z.object({
  blog: BlogSchema,
  linkedin: LinkedInSchema,
  xThread: XThreadSchema,
  instagram: InstagramSchema,
  metaAds: z.array(MetaAdSchema).describe("Exactly 3 Meta ads, each with a different angle."),
  googleAds: z.array(GoogleAdSchema).describe("Exactly 3 Google responsive search ads."),
  imageBrief: ImageBriefSchema,
});

// ── AI checker ────────────────────────────────────────────────────────
export const CheckSchema = z.object({
  findings: z.array(
    z.object({
      pieceId: z.string().describe("Which piece, e.g. blog, linkedin, x, instagram, meta-1, google-2."),
      excerpt: z.string().describe("The exact words from the draft that have the problem, copied character for character."),
      kind: z.enum(["unsupported_claim", "off_brand", "misleading", "tone"]),
      severity: z.enum(["block", "warn"]),
      message: z.string().describe("Plain words: what is wrong, for the reviewer."),
      suggestion: z.string().describe("A safer rewrite of the excerpt."),
    }),
  ),
});

export type Research = z.infer<typeof ResearchSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type ContentPack = z.infer<typeof ContentPackSchema>;
export type ImageBrief = z.infer<typeof ImageBriefSchema>;
export type MetaAd = z.infer<typeof MetaAdSchema>;
export type GoogleAd = z.infer<typeof GoogleAdSchema>;
export type CheckOutput = z.infer<typeof CheckSchema>;
