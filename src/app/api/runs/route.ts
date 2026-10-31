import { runPipeline, validateInput } from "@/lib/pipeline/run";
import { listRuns } from "@/lib/store/runs";
import { assertConfigured, isMock } from "@/lib/ai/models";
import type { RunEvent } from "@/lib/content/types";

export const runtime = "nodejs";
// A full run is several model calls plus an image; give it room on Vercel.
export const maxDuration = 300;

// Each run costs money, so cap how many one address can start per hour (RUNS_PER_HOUR, 0 = no cap).
// Per server process: enough to stop a runaway script, not a substitute for the provider's spend cap.
const recentRuns = new Map<string, number[]>();

function overRunLimit(req: Request): boolean {
  const limit = Number(process.env.RUNS_PER_HOUR ?? 20);
  if (!limit || isMock()) return false;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
  const hourAgo = Date.now() - 3_600_000;
  const times = (recentRuns.get(ip) ?? []).filter((t) => t > hourAgo);
  if (times.length >= limit) return true;
  recentRuns.set(ip, [...times, Date.now()]);
  return false;
}

/** Start a run. Streams progress as newline-delimited JSON, one RunEvent per line. */
export async function POST(req: Request) {
  let input;
  try {
    assertConfigured();
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 503 });
  }
  if (overRunLimit(req)) {
    return Response.json({ error: "Too many packs started from here in the last hour. Try again later." }, { status: 429 });
  }
  try {
    const body = await req.json().catch(() => {
      throw new Error("The request was empty or not JSON.");
    });
    input = validateInput(body ?? {});
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }

  const encoder = new TextEncoder();
  // If the browser tab closes mid-run, keep going and save the run anyway.
  let open = true;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: RunEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        } catch {
          open = false;
        }
      };
      try {
        await runPipeline(input, send);
      } catch (err) {
        console.error("[run] failed:", err);
        send({ type: "error", message: (err as Error).message || "The run failed. Check the server log." });
      } finally {
        if (open) {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      }
    },
    cancel() {
      open = false;
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET() {
  return Response.json({ runs: await listRuns() });
}
