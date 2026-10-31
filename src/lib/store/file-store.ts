import { promises as fs } from "node:fs";
import path from "node:path";
import type { Run } from "@/lib/content/types";
import { SAFE_IMAGE_FILE, SAFE_RUN_ID, imageFileName, type RunStore, type RunSummary } from "./types";

/**
 * Runs as JSON files in .data/runs, images in .data/images. Simple and
 * inspectable for local use and demos. The lock in updateRun only covers this
 * one server process, which is why hosted deployments use the SQL store.
 */
export function createFileStore(root = path.join(process.cwd(), ".data")): RunStore {
  const RUNS = path.join(root, "runs");
  const IMAGES = path.join(root, "images");

  function runPath(id: string): string {
    if (!SAFE_RUN_ID.test(id)) throw new Error("Invalid run id");
    return path.join(RUNS, `${id}.json`);
  }

  async function saveRun(run: Run): Promise<void> {
    await fs.mkdir(RUNS, { recursive: true });
    await fs.writeFile(runPath(run.id), JSON.stringify(run, null, 2), "utf8");
  }

  async function loadRun(id: string): Promise<Run | null> {
    try {
      return JSON.parse(await fs.readFile(runPath(id), "utf8")) as Run;
    } catch {
      return null;
    }
  }

  const locks = new Map<string, Promise<unknown>>();

  async function updateRun(id: string, change: (latest: Run) => Run | Promise<Run>): Promise<Run | null> {
    const previous = locks.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
      const latest = await loadRun(id);
      if (!latest) return null;
      const updated = await change(latest);
      await saveRun(updated);
      return updated;
    });
    locks.set(id, next);
    try {
      return await next;
    } finally {
      if (locks.get(id) === next) locks.delete(id);
    }
  }

  async function listRuns(limit: number): Promise<RunSummary[]> {
    try {
      const files = (await fs.readdir(RUNS)).filter((f) => f.endsWith(".json"));
      const runs = await Promise.all(
        // One unreadable file shouldn't hide every other pack.
        files.map(async (f) => {
          try {
            return JSON.parse(await fs.readFile(path.join(RUNS, f), "utf8")) as Run;
          } catch {
            return null;
          }
        }),
      );
      return runs
        .filter((r): r is Run => !!r && typeof r.createdAt === "string" && !!r.input)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit)
        .map(({ id, createdAt, input, findings, review, usage, models, image, archived }) => ({
          id,
          createdAt,
          input,
          findings,
          review,
          usage,
          models,
          hadImage: !!image,
          archived: !!archived,
        }));
    } catch {
      return [];
    }
  }

  async function saveImage(runId: string, bytes: Uint8Array, mediaType: string): Promise<string> {
    await fs.mkdir(IMAGES, { recursive: true });
    const file = imageFileName(runId, mediaType);
    await fs.writeFile(path.join(IMAGES, file), bytes);
    return file;
  }

  async function readImage(file: string): Promise<Buffer | null> {
    if (!SAFE_IMAGE_FILE.test(file)) return null;
    try {
      return await fs.readFile(path.join(IMAGES, file));
    } catch {
      return null;
    }
  }

  // In memory, like the update lock: one machine, one process.
  const runStarts = new Map<string, number[]>();

  async function takeRunSlot(key: string, limit: number, windowMs: number): Promise<boolean> {
    const since = Date.now() - windowMs;
    const times = (runStarts.get(key) ?? []).filter((t) => t > since);
    if (times.length >= limit) return false;
    runStarts.set(key, [...times, Date.now()]);
    return true;
  }

  return { kind: "file", saveRun, loadRun, updateRun, listRuns, saveImage, readImage, takeRunSlot };
}
