import type { ContentPack } from "./schemas";
import type { PieceId } from "./types";

/**
 * Channel rules in one place. "hard" limits are where the platform cuts or
 * rejects text; "soft" limits are where text gets hidden behind "See more"
 * or stops performing well. Sources are listed in docs/channel-rules.md.
 */
export const LIMITS = {
  googleHeadline: { max: 30, hard: true },
  googleDescription: { max: 90, hard: true },
  googlePath: { max: 15, hard: true },
  metaPrimaryText: { max: 125, hard: false },
  metaHeadline: { max: 40, hard: false },
  metaDescription: { max: 30, hard: false },
  xPost: { max: 280, hard: true },
  linkedinBody: { max: 3000, hard: true },
  linkedinRecommended: { max: 1300, hard: false },
  instagramCaption: { max: 2200, hard: true },
  blogTitle: { max: 70, hard: false },
  blogMeta: { max: 155, hard: false },
} as const;

// The writer is asked for 700–900; this range is when the checker steps in.
export const BLOG_WORDS = { min: 650, max: 1100 };
export const X_POSTS = { min: 3, max: 8 };
export const HASHTAGS = { soft: 6, hard: 30 };
export const META_CTAS = ["Learn more", "Sign up", "Book now", "Contact us", "Get quote"] as const;

export type Channel = "blog" | "linkedin" | "x" | "instagram" | "meta" | "google";

export interface Field {
  /** Dot path inside the content pack, e.g. "googleAds.0.headlines.1". */
  path: string;
  label: string;
  value: string;
  limit?: { max: number; hard: boolean };
  kind: "line" | "text" | "markdown" | "tags" | "choice";
  options?: readonly string[];
}

export interface Piece {
  id: PieceId;
  channel: Channel;
  label: string;
  short: string;
  fields: Field[];
  factIds: string[];
}

export const PIECE_ORDER: PieceId[] = [
  "blog",
  "linkedin",
  "x",
  "instagram",
  "meta-1",
  "meta-2",
  "meta-3",
  "google-1",
  "google-2",
  "google-3",
];

/** Flatten a content pack into reviewable pieces with editable fields. */
export function getPieces(pack: ContentPack): Piece[] {
  const pieces: Piece[] = [
    {
      id: "blog",
      channel: "blog",
      label: "Blog post",
      short: "Blog",
      factIds: pack.blog.factIds,
      fields: [
        { path: "blog.title", label: "Title", value: pack.blog.title, limit: LIMITS.blogTitle, kind: "line" },
        { path: "blog.metaDescription", label: "Meta description", value: pack.blog.metaDescription, limit: LIMITS.blogMeta, kind: "text" },
        { path: "blog.body", label: "Article", value: pack.blog.body, kind: "markdown" },
      ],
    },
    {
      id: "linkedin",
      channel: "linkedin",
      label: "LinkedIn post",
      short: "LinkedIn",
      factIds: pack.linkedin.factIds,
      fields: [{ path: "linkedin.body", label: "Post", value: pack.linkedin.body, limit: LIMITS.linkedinBody, kind: "text" }],
    },
    {
      id: "x",
      channel: "x",
      label: "X thread",
      short: "X thread",
      factIds: pack.xThread.factIds,
      fields: pack.xThread.posts.map((post, i) => ({
        path: `xThread.posts.${i}`,
        label: `Post ${i + 1} of ${pack.xThread.posts.length}`,
        value: post,
        limit: LIMITS.xPost,
        kind: "text" as const,
      })),
    },
    {
      id: "instagram",
      channel: "instagram",
      label: "Instagram caption",
      short: "Instagram",
      factIds: pack.instagram.factIds,
      fields: [
        { path: "instagram.caption", label: "Caption", value: pack.instagram.caption, limit: LIMITS.instagramCaption, kind: "text" },
        { path: "instagram.hashtags", label: "Hashtags", value: formatTags(pack.instagram.hashtags), kind: "tags" },
      ],
    },
  ];

  pack.metaAds.slice(0, 3).forEach((ad, i) => {
    pieces.push({
      id: `meta-${i + 1}` as PieceId,
      channel: "meta",
      label: `Meta ad ${i + 1}`,
      short: `Meta ${i + 1}`,
      factIds: ad.factIds,
      fields: [
        { path: `metaAds.${i}.primaryText`, label: "Primary text", value: ad.primaryText, limit: LIMITS.metaPrimaryText, kind: "text" },
        { path: `metaAds.${i}.headline`, label: "Headline", value: ad.headline, limit: LIMITS.metaHeadline, kind: "line" },
        { path: `metaAds.${i}.description`, label: "Description", value: ad.description, limit: LIMITS.metaDescription, kind: "line" },
        { path: `metaAds.${i}.cta`, label: "Button", value: ad.cta, kind: "choice", options: META_CTAS },
      ],
    });
  });

  pack.googleAds.slice(0, 3).forEach((ad, i) => {
    pieces.push({
      id: `google-${i + 1}` as PieceId,
      channel: "google",
      label: `Google ad ${i + 1}`,
      short: `Google ${i + 1}`,
      factIds: ad.factIds,
      fields: [
        ...ad.headlines.map((h, j) => ({
          path: `googleAds.${i}.headlines.${j}`,
          label: `Headline ${j + 1}`,
          value: h,
          limit: LIMITS.googleHeadline,
          kind: "line" as const,
        })),
        ...ad.descriptions.map((d, j) => ({
          path: `googleAds.${i}.descriptions.${j}`,
          label: `Description ${j + 1}`,
          value: d,
          limit: LIMITS.googleDescription,
          kind: "text" as const,
        })),
        { path: `googleAds.${i}.path1`, label: "Path 1", value: ad.path1, limit: LIMITS.googlePath, kind: "line" },
        { path: `googleAds.${i}.path2`, label: "Path 2", value: ad.path2, limit: LIMITS.googlePath, kind: "line" },
      ],
    });
  });

  return pieces;
}

export function getPiece(pack: ContentPack, id: PieceId): Piece | undefined {
  return getPieces(pack).find((p) => p.id === id);
}

export function formatTags(tags: string[]): string {
  return tags.map((t) => `#${t.replace(/^#+/, "")}`).join(" ");
}

export function parseTags(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((t) => t.replace(/^#+/, "").trim())
    .filter(Boolean);
}

/** Return a copy of the pack with one field changed. */
export function setField(pack: ContentPack, path: string, value: string): ContentPack {
  const next = structuredClone(pack);
  const keys = path.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let node: any = next;
  for (const key of keys.slice(0, -1)) node = node[key];
  const last = keys[keys.length - 1];
  node[last] = path === "instagram.hashtags" ? parseTags(value) : value;
  return next;
}

/** Which part of the pack a piece lives in, for regenerating one piece. */
export function pieceLocation(id: PieceId): { key: keyof ContentPack; index?: number } {
  if (id === "blog") return { key: "blog" };
  if (id === "linkedin") return { key: "linkedin" };
  if (id === "x") return { key: "xThread" };
  if (id === "instagram") return { key: "instagram" };
  const [kind, n] = id.split("-");
  return { key: kind === "meta" ? "metaAds" : "googleAds", index: Number(n) - 1 };
}

/** A copy of `target` with one piece taken from `source`. */
export function withPiece(target: ContentPack, source: ContentPack, piece: PieceId): ContentPack {
  const { key, index } = pieceLocation(piece);
  const next = structuredClone(target);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const from = source as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (index === undefined) (next as any)[key] = structuredClone(from[key]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  else (next as any)[key][index] = structuredClone(from[key][index]);
  return next;
}

/** Plain text of a whole piece, for prompts and exports. */
export function pieceText(piece: Piece): string {
  return piece.fields.map((f) => `${f.label}: ${f.value}`).join("\n");
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
