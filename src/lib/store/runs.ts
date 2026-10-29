import { promises as fs } from "node:fs";
import path from "node:path";
import type { Run } from "@/lib/content/types";

/**
 * Runs are saved as JSON files in .data/runs. Simple, inspectable, and easy
 * to show in a demo ("here's exactly what the agent produced"). Swap this
 * module for a database (Supabase, Vercel Blob/KV) when deploying.
 */
const ROOT = path.join(process.cwd(), ".data");
const RUNS = path.join(ROOT, "runs");
const IMAGES = path.join(ROOT, "images");

const SAFE_ID = /^[a-z0-9-]{6,64}$/;

function runPath(id: string): string {
  if (!SAFE_ID.test(id)) throw new Error("Invalid run id");
  return path.join(RUNS, `${id}.json`);
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

export async function saveRun(run: Run): Promise<void> {
  await fs.mkdir(RUNS, { recursive: true });
  await fs.writeFile(runPath(run.id), JSON.stringify(run, null, 2), "utf8");
}

export async function loadRun(id: string): Promise<Run | null> {
  try {
    return JSON.parse(await fs.readFile(runPath(id), "utf8")) as Run;
  } catch {
    return null;
  }
}

export async function listRuns(limit = 20): Promise<Pick<Run, "id" | "createdAt" | "input" | "findings" | "review">[]> {
  try {
    const files = (await fs.readdir(RUNS)).filter((f) => f.endsWith(".json"));
    const runs = await Promise.all(
      files.map(async (f) => JSON.parse(await fs.readFile(path.join(RUNS, f), "utf8")) as Run),
    );
    return runs
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map(({ id, createdAt, input, findings, review }) => ({ id, createdAt, input, findings, review }));
  } catch {
    return [];
  }
}

export async function saveImage(runId: string, bytes: Uint8Array, mediaType: string): Promise<string> {
  await fs.mkdir(IMAGES, { recursive: true });
  const ext = mediaType.includes("svg") ? "svg" : mediaType.includes("jpeg") ? "jpg" : mediaType.includes("webp") ? "webp" : "png";
  const file = `${runId}-${Date.now().toString(36)}.${ext}`;
  await fs.writeFile(path.join(IMAGES, file), bytes);
  return file;
}

export async function readImage(file: string): Promise<Buffer | null> {
  if (!/^[a-z0-9-]+\.(png|jpg|webp|svg)$/.test(file)) return null;
  try {
    return await fs.readFile(path.join(IMAGES, file));
  } catch {
    return null;
  }
}
