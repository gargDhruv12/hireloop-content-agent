import type { Run } from "@/lib/content/types";
import { createFileStore } from "./file-store";
import { createSqlStore, type SqlClient } from "./sql-store";
import { vercelBlobs, withBlobImages } from "./blob-images";
import type { RunStore, RunSummary } from "./types";

/**
 * The run store the app uses. With DATABASE_URL set, runs and images go to
 * Postgres, which every server instance shares. Without it they go to local
 * files in .data/, which is right for a laptop and wrong for a host like
 * Vercel, where the disk is temporary and not shared (see storageNotice).
 */
let store: RunStore | null = null;

function getStore(): RunStore {
  if (store) return store;
  const url = process.env.DATABASE_URL;
  // DATA_DIR moves the file store (the browser tests use a throwaway folder).
  // On Neon, DATABASE_URL is the pooled connection (PgBouncer, transaction mode) for the
  // app's queries; DATABASE_URL_UNPOOLED is the direct one, used only to create the tables.
  const direct = process.env.DATABASE_URL_UNPOOLED;
  store = url
    ? createSqlStore(postgresClient(url), direct && direct !== url ? postgresClient(direct, 1) : undefined)
    : createFileStore(process.env.DATA_DIR || undefined);
  // BLOB_READ_WRITE_TOKEN: images go to Vercel Blob (private) instead of the database.
  if (process.env.BLOB_READ_WRITE_TOKEN) store = withBlobImages(store, vercelBlobs());
  if (!url && process.env.VERCEL) {
    console.warn("[store] Running on Vercel without DATABASE_URL: runs are saved to temporary disk and will be lost.");
  }
  return store;
}

/** Swap the store (tests use a PGlite-backed SQL store). */
export function setStore(next: RunStore | null): void {
  store = next;
}

/** A warning for the UI when runs won't survive on this host, or null when storage is fine. */
export function storageNotice(): string | null {
  if (process.env.DATABASE_URL || !process.env.VERCEL) return null;
  return "Packs are saved to this server's temporary disk and will disappear. Set DATABASE_URL to keep them.";
}

/** Connects lazily, so local file mode never loads the driver. */
function postgresClient(url: string, max = Number(process.env.DATABASE_POOL_MAX) || 5): SqlClient {
  type Sql = import("postgres").Sql;
  let sql: Promise<Sql> | null = null;
  const connect = () =>
    (sql ??= import("postgres").then(({ default: postgres }) =>
      // Small pool: serverless functions each open their own connections.
      // DATABASE_POOL_MAX lowers it further (some hosts cap connections per database).
      // prepare: false because PgBouncer's transaction mode can't keep prepared statements.
      // onnotice: "table already exists, skipping" on every cold start is not worth a log line.
      postgres(url, { max, idle_timeout: 20, prepare: false, onnotice: () => {} }),
    ));
  const wrap = (run: (text: string, params: unknown[]) => Promise<unknown>): SqlClient => ({
    query: async (text, params = []) => (await run(text, params)) as never,
    transaction: async (fn) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (await connect()).begin((tx) => fn(wrap((t, p) => tx.unsafe(t, p as any[])))) as never,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return wrap(async (text, params) => (await connect()).unsafe(text, params as any[]));
}

export function newRunId(topic: string): string {
  const slug = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32)
    .replace(/-$/, "");
  const stamp = Date.now().toString(36);
  return `${slug || "run"}-${stamp}`;
}

export const saveRun = (run: Run) => getStore().saveRun(run);
export const loadRun = (id: string) => getStore().loadRun(id);
export const updateRun = (id: string, change: (latest: Run) => Run | Promise<Run>) => getStore().updateRun(id, change);
export const listRuns = (limit = 20): Promise<RunSummary[]> => getStore().listRuns(limit);
export const saveImage = (runId: string, bytes: Uint8Array, mediaType: string) => getStore().saveImage(runId, bytes, mediaType);
export const readImage = (file: string) => getStore().readImage(file);
export const takeRunSlot = (key: string, limit: number, windowMs: number) => getStore().takeRunSlot(key, limit, windowMs);
