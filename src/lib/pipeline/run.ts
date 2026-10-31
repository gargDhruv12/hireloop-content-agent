/**
 * The workflow, top to bottom. Read this file first.
 *
 *   research → plan → write → check → revise (only if blocked, up to 2 passes) → image
 *
 * Each step is a plain async function in its own file. This orchestrator
 * times them, reports progress, and saves the run for human review.
 * Nothing here publishes or sends anything.
 */
import type { ClientProfile } from "@/clients/types";
import { hireloop } from "@/clients/hireloop";
import { countBlocking, lintPack } from "@/lib/content/lint";
import { withPiece } from "@/lib/content/pieces";
import type { Finding, PieceId, Run, RunEvent, RunInput, StepName } from "@/lib/content/types";
import { trackUsage } from "@/lib/ai/gemini";
import { isMock, models } from "@/lib/ai/models";
import { newRunId, saveRun } from "@/lib/store/runs";
import { assertPublicHttpUrl } from "@/lib/web/fetch-page";
import { aiReview, blockingPieces, checkPack, mergeFindings } from "./check";
import { needsRevision, piecesToRevise } from "@/lib/content/findings";
import { makeImage } from "./image";
import { research } from "./research";
import { makePlan, rewritePiece, writePack } from "./write";

type Emit = (event: RunEvent) => void;

const REVISION_ROUNDS = 2;

export function validateInput(raw: Partial<RunInput>): RunInput {
  const topic = (raw.topic ?? "").trim();
  if (topic.length < 5) throw new Error("Give the agent a topic of at least a few words.");
  if (topic.length > 300) throw new Error("Keep the topic under 300 characters. Put extra context in the notes.");
  const sourceUrl = raw.sourceUrl?.trim() || undefined;
  if (sourceUrl) assertPublicHttpUrl(sourceUrl);
  return {
    topic,
    sourceUrl,
    audience: raw.audience?.trim() || undefined,
    notes: raw.notes?.trim().slice(0, 12000) || undefined,
  };
}

export async function runPipeline(input: RunInput, emit: Emit, client: ClientProfile = hireloop): Promise<Run> {
  const { result: run, usage } = await trackUsage(() => buildRun(input, emit, client));
  run.usage = usage;
  await saveRun(run);
  emit({ type: "done", runId: run.id });
  return run;
}

async function buildRun(input: RunInput, emit: Emit, client: ClientProfile): Promise<Run> {
  const id = newRunId(input.topic);
  const timings: Run["timings"] = {};

  async function step<T>(name: StepName, fn: (log: (d: string) => void) => Promise<T>, doneDetail?: (r: T) => string): Promise<T> {
    emit({ type: "step", step: name, status: "running" });
    const started = Date.now();
    try {
      const result = await fn((detail) => emit({ type: "step", step: name, status: "running", detail }));
      timings[name] = Date.now() - started;
      emit({ type: "step", step: name, status: "done", detail: doneDetail?.(result) });
      return result;
    } catch (err) {
      timings[name] = Date.now() - started;
      emit({ type: "step", step: name, status: "failed", detail: (err as Error).message });
      throw err;
    }
  }

  const found = await step(
    "research",
    (log) => research(input, client, log),
    (r) =>
      `${r.facts.filter((f) => f.relevant).length} relevant facts` +
      (r.pagesRead.length ? `, ${r.pagesRead.filter((p) => p.ok).length} page(s) read` : "") +
      (r.rejectedFacts?.length ? `, ${r.rejectedFacts.length} unsupported fact(s) dropped` : "") +
      (r.clientSite?.status === "failed" ? ", client site couldn't be read" : ""),
  );

  const plan = await step(
    "plan",
    () => makePlan({ client, run: input, topicSummary: found.topicSummary, facts: found.facts, cautions: found.cautions }),
    (p) => p.angle,
  );

  const firstDraft = await step(
    "write",
    () => writePack({ client, run: input, plan, facts: found.facts, cautions: found.cautions }),
    () => "10 pieces and an image brief",
  );

  let findings = await step(
    "check",
    () => checkPack(firstDraft, client, found.facts),
    (f) => `${countBlocking(f)} blocking, ${f.length - countBlocking(f)} to consider`,
  );

  // Self-revision, only for pieces with blocking problems (or a short blog). A second
  // round retries just the pieces the first left blocked: live, a rewrite that fixed one
  // ad line sometimes pushed another a character over.
  let pack = firstDraft;
  let revision: Run["revision"];
  const toFix = piecesToRevise(findings);
  if (toFix.length) {
    const blockingBefore = countBlocking(findings);
    const touched = new Set<PieceId>();
    await step(
      "revise",
      async (log) => {
        let round = toFix;
        for (let pass = 1; pass <= REVISION_ROUNDS && round.length; pass++) {
          // Pieces are independent, so rewrite them at the same time, then put each one into the pack.
          log(pass === 1 ? `Rewriting ${round.join(", ")}` : `Second pass on ${round.join(", ")}`);
          const base = pack;
          const rewritten = await Promise.all(
            round.map((pieceId) =>
              rewritePiece({
                client,
                pack: base,
                pieceId,
                findings: findings.filter((f) => f.pieceId === pieceId && needsRevision(f)),
                facts: found.facts,
              }),
            ),
          );
          pack = round.reduce((acc, pieceId, i) => withPiece(acc, rewritten[i], pieceId), base);
          findings = await recheck(pack, client, found.facts, round, findings);
          round.forEach((p) => touched.add(p));
          round = blockingPieces(findings).filter((p) => round.includes(p));
        }
      },
      () => `${touched.size} piece(s) rewritten, ${countBlocking(findings)} blocking left`,
    );
    revision = { pieces: [...touched], blockingBefore, blockingAfter: countBlocking(findings) };
  } else {
    emit({ type: "step", step: "revise", status: "skipped", detail: "Nothing blocking" });
  }

  // The image is useful but not essential: a failure here keeps the text.
  let image: Run["image"];
  let imageError: string | undefined;
  try {
    image = await step("image", () => makeImage(id, pack.imageBrief), () => pack.imageBrief.aspectRatio);
  } catch (err) {
    imageError = (err as Error).message;
  }

  const run: Run = {
    id,
    createdAt: new Date().toISOString(),
    client: client.name,
    input,
    models: { ...models, mock: isMock() },
    research: found,
    plan,
    pack,
    firstDraft: revision ? firstDraft : undefined,
    findings,
    revision,
    image,
    imageError,
    review: {},
    timings,
  };
  return run;
}

/**
 * After revision: rules run on everything again (free); the AI reviewer only
 * re-reads the rewritten pieces. Its old findings on untouched pieces stay.
 */
async function recheck(
  pack: Run["pack"],
  client: ClientProfile,
  facts: Run["research"]["facts"],
  revised: PieceId[],
  previous: Finding[],
): Promise<Finding[]> {
  const rules = lintPack(pack, { client, facts });
  const freshAi = await aiReview(pack, client, facts, revised);
  const keptAi = previous.filter((f) => f.by === "ai" && !revised.includes(f.pieceId));
  return mergeFindings(rules, [...keptAi, ...freshAi]);
}
