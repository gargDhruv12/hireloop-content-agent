import type { PieceId } from "@/lib/content/types";

/** Social posts that can go to a scheduler as drafts (ads and the blog don't). */
export const SENDABLE: PieceId[] = ["linkedin", "x", "instagram"];
