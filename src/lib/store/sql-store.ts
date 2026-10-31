import type { Run } from "@/lib/content/types";
import { SAFE_IMAGE_FILE, SAFE_RUN_ID, imageFileName, type RunStore, type RunSummary } from "./types";

/**
 * The few things the store needs from a Postgres driver. Production uses the
 * `postgres` package (Neon, Supabase, Vercel Postgres, RDS…); the tests use
 * PGlite, a real Postgres in WebAssembly, so the SQL below is tested for real.
 */
export interface SqlClient {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T>;
}

const SCHEMA = `
create table if not exists hl_runs (
  id text primary key,
  created_at timestamptz not null,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists hl_runs_created_at on hl_runs (created_at desc);
create table if not exists hl_images (
  file text primary key,
  run_id text not null,
  media_type text not null,
  bytes bytea not null,
  created_at timestamptz not null default now()
);
create index if not exists hl_images_run_id on hl_images (run_id);
create table if not exists hl_run_starts (
  key text not null,
  at timestamptz not null default now()
);
create index if not exists hl_run_starts_key_at on hl_run_starts (key, at);`;

/** Drivers differ on whether jsonb comes back parsed; accept both. */
function json<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

export function createSqlStore(db: SqlClient): RunStore {
  let ready: Promise<void> | null = null;
  const migrate = () =>
    (ready ??= (async () => {
      for (const statement of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) await db.query(statement);
    })().catch((err) => {
      ready = null; // let the next request try again
      throw err;
    }));

  function checkId(id: string) {
    if (!SAFE_RUN_ID.test(id)) throw new Error("Invalid run id");
  }

  async function write(client: SqlClient, run: Run) {
    checkId(run.id);
    await client.query(
      // Sent as text and parsed by Postgres: the `postgres` driver otherwise stores a
      // JSON string *as* a jsonb string, and data->'input' comes back null.
      `insert into hl_runs (id, created_at, data) values ($1, $2, $3::text::jsonb)
       on conflict (id) do update set data = excluded.data, updated_at = now()`,
      [run.id, run.createdAt, JSON.stringify(run)],
    );
  }

  return {
    kind: "postgres",

    async saveRun(run) {
      await migrate();
      await write(db, run);
    },

    async loadRun(id) {
      if (!SAFE_RUN_ID.test(id)) return null;
      await migrate();
      const [row] = await db.query<{ data: unknown }>("select data from hl_runs where id = $1", [id]);
      return row ? json<Run>(row.data) : null;
    },

    // The row lock holds across every server instance, unlike an in-memory lock.
    async updateRun(id, change) {
      if (!SAFE_RUN_ID.test(id)) return null;
      await migrate();
      return db.transaction(async (tx) => {
        const [row] = await tx.query<{ data: unknown }>("select data from hl_runs where id = $1 for update", [id]);
        if (!row) return null;
        const updated = await change(json<Run>(row.data));
        await write(tx, updated);
        return updated;
      });
    },

    // Only the fields the list shows; the drafts themselves stay in the database.
    async listRuns(limit) {
      await migrate();
      const rows = await db.query<{
        id: string;
        created_at: string;
        input: unknown;
        findings: unknown;
        review: unknown;
        usage: unknown;
        models: unknown;
        had_image: boolean;
      }>(
        `select id, data->>'createdAt' as created_at, data->'input' as input, data->'findings' as findings, data->'review' as review,
                data->'usage' as usage, data->'models' as models, (data->'image') is not null and data->'image' <> 'null'::jsonb as had_image
         from hl_runs order by created_at desc limit $1`,
        [limit],
      );
      return rows.map(
        (r): RunSummary => ({
          id: r.id,
          createdAt: r.created_at,
          input: json(r.input),
          findings: json(r.findings) ?? [],
          review: json(r.review) ?? {},
          usage: json(r.usage) ?? undefined,
          models: json(r.models),
          hadImage: !!r.had_image,
        }),
      );
    },

    async saveImage(runId, bytes, mediaType) {
      checkId(runId);
      await migrate();
      const file = imageFileName(runId, mediaType);
      await db.query("insert into hl_images (file, run_id, media_type, bytes) values ($1, $2, $3, $4::bytea)", [
        file,
        runId,
        mediaType,
        Buffer.from(bytes),
      ]);
      return file;
    },

    async readImage(file) {
      if (!SAFE_IMAGE_FILE.test(file)) return null;
      await migrate();
      const [row] = await db.query<{ bytes: Uint8Array }>("select bytes from hl_images where file = $1", [file]);
      return row ? Buffer.from(row.bytes) : null;
    },

    // Shared by every server instance. The advisory lock makes count-then-insert
    // atomic per key, so parallel requests can't all slip under the limit.
    async takeRunSlot(key, limit, windowMs) {
      await migrate();
      return db.transaction(async (tx) => {
        await tx.query("select pg_advisory_xact_lock(hashtext($1))", [key]);
        await tx.query("delete from hl_run_starts where at < now() - make_interval(secs => $1::float8)", [windowMs / 1000]);
        const [row] = await tx.query<{ n: number | string }>("select count(*) as n from hl_run_starts where key = $1", [key]);
        if (Number(row.n) >= limit) return false;
        await tx.query("insert into hl_run_starts (key) values ($1)", [key]);
        return true;
      });
    },
  };
}
