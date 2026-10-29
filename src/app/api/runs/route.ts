import { runPipeline, validateInput } from "@/lib/pipeline/run";
import { listRuns } from "@/lib/store/runs";
import { assertConfigured } from "@/lib/ai/models";
import type { RunEvent } from "@/lib/content/types";

export const runtime = "nodejs";
// A full run is several model calls plus an image; give it room on Vercel.
export const maxDuration = 300;

/** Start a run. Streams progress as newline-delimited JSON, one RunEvent per line. */
export async function POST(req: Request) {
  let input;
  try {
    assertConfigured();
    input = validateInput(await req.json());
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: RunEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        await runPipeline(input, send);
      } catch (err) {
        send({ type: "error", message: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function GET() {
  return Response.json({ runs: await listRuns() });
}
