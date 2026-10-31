import { createHmac } from "node:crypto";
import type { PieceId, Run } from "@/lib/content/types";

/**
 * Send an approved social post to the team's scheduler as a DRAFT, through an
 * outgoing webhook (Zapier, Make, n8n… then Buffer, LinkedIn or any other
 * tool). Nothing here publishes: every payload says status "draft", and the
 * receiving automation must create a draft, never a live post.
 *
 * SCHEDULER_WEBHOOK_URL   where to POST (unset = the feature is off)
 * SCHEDULER_WEBHOOK_SECRET optional; signs the body (x-hireloop-signature: sha256=<hex>)
 * SCHEDULER_NAME           what the button calls it, e.g. "Buffer" (default "the scheduler")
 */
export { SENDABLE } from "./scheduler-pieces";

export function schedulerConfig(): { url: string; secret?: string; name: string } | null {
  const url = process.env.SCHEDULER_WEBHOOK_URL?.trim();
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return { url, secret: process.env.SCHEDULER_WEBHOOK_SECRET || undefined, name: process.env.SCHEDULER_NAME?.trim() || "the scheduler" };
}

export interface DraftPayload {
  status: "draft";
  channel: "linkedin" | "x" | "instagram";
  client: string;
  runId: string;
  topic: string;
  /** The post as it should be pasted: LinkedIn body, Instagram caption with hashtags. */
  text: string;
  /** X only: each post of the thread, in order. */
  thread?: string[];
  /** Included when the pack's image is approved. */
  image?: { mediaType: string; base64: string; altText: string };
  approvedBy?: string;
  sentAt: string;
}

export function buildDraft(run: Run, piece: PieceId, image?: { bytes: Buffer; mediaType: string }): DraftPayload {
  const { pack } = run;
  const approval = run.reviewLog?.filter((e) => e.piece === piece && e.status === "approved").at(-1);
  const base = {
    status: "draft" as const,
    client: run.client,
    runId: run.id,
    topic: run.input.topic,
    approvedBy: approval?.by,
    sentAt: new Date().toISOString(),
    ...(image ? { image: { mediaType: image.mediaType, base64: image.bytes.toString("base64"), altText: pack.imageBrief.altText } } : {}),
  };
  if (piece === "linkedin") return { ...base, channel: "linkedin", text: pack.linkedin.body };
  if (piece === "x") return { ...base, channel: "x", text: pack.xThread.posts.join("\n\n"), thread: pack.xThread.posts };
  if (piece === "instagram") {
    const tags = pack.instagram.hashtags.map((t) => `#${t.replace(/^#/, "")}`).join(" ");
    return { ...base, channel: "instagram", text: tags ? `${pack.instagram.caption}\n\n${tags}` : pack.instagram.caption };
  }
  throw new Error("Only LinkedIn, X and Instagram posts can be sent to a scheduler.");
}

/** POST the draft; resolves with an error message instead of throwing. */
export async function sendDraft(config: { url: string; secret?: string }, payload: DraftPayload): Promise<{ ok: true } | { ok: false; error: string }> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { "content-type": "application/json", "user-agent": "HireLoopContentDesk/1" };
  if (config.secret) headers["x-hireloop-signature"] = `sha256=${createHmac("sha256", config.secret).update(body).digest("hex")}`;
  try {
    const res = await fetch(config.url, { method: "POST", headers, body, signal: AbortSignal.timeout(15_000) });
    return res.ok ? { ok: true } : { ok: false, error: `The scheduler answered ${res.status}.` };
  } catch (err) {
    const timedOut = (err as Error).name === "TimeoutError";
    return { ok: false, error: timedOut ? "The scheduler didn't answer within 15 seconds." : "The scheduler couldn't be reached." };
  }
}
