import type { Run } from "@/lib/content/types";

/** What the home page's "Recent packs" list needs, without loading whole packs. */
export type RunSummary = Pick<Run, "id" | "createdAt" | "input" | "findings" | "review" | "usage" | "models"> & {
  hadImage: boolean;
};

/**
 * Where runs and their images live. The file store is for one machine; the
 * SQL store is for anything hosted (several server instances share it, and
 * updateRun locks the row in the database instead of in memory).
 */
export interface RunStore {
  readonly kind: "file" | "postgres";
  saveRun(run: Run): Promise<void>;
  loadRun(id: string): Promise<Run | null>;
  /**
   * Load, change and save a run with no other update to the same run in
   * between. Edits, approvals, rewrites and new images all save the whole run,
   * so without this a slow rewrite could overwrite an approval made meanwhile.
   * `change` gets the latest saved run; return the run to save.
   */
  updateRun(id: string, change: (latest: Run) => Run | Promise<Run>): Promise<Run | null>;
  listRuns(limit: number): Promise<RunSummary[]>;
  saveImage(runId: string, bytes: Uint8Array, mediaType: string): Promise<string>;
  readImage(file: string): Promise<Buffer | null>;
  /**
   * Record a run start for `key` (a hashed client address) if fewer than
   * `limit` were recorded in the last `windowMs`. False means over the limit.
   */
  takeRunSlot(key: string, limit: number, windowMs: number): Promise<boolean>;
}

export const SAFE_RUN_ID = /^[a-z0-9-]{6,64}$/;
export const SAFE_IMAGE_FILE = /^[a-z0-9-]+\.(png|jpg|webp|svg)$/;

export function imageFileName(runId: string, mediaType: string): string {
  const ext = mediaType.includes("svg") ? "svg" : mediaType.includes("jpeg") ? "jpg" : mediaType.includes("webp") ? "webp" : "png";
  return `${runId}-${Date.now().toString(36)}.${ext}`;
}
