/**
 * Evaluation runner.
 *
 *   npm run eval                 run every case in evals/cases.json
 *   npm run eval -- --only trap  run cases whose name contains "trap"
 *   npm run eval -- --checker    measure how many planted problems the checker catches
 *
 * Writes a Markdown report to evals/results/. Uses real Gemini calls unless
 * MOCK_AI=1, so expect a few rupees per case.
 */
import "../scripts/load-env";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { hireloop } from "../src/clients/hireloop";
import { runPipeline } from "../src/lib/pipeline/run";
import { aiReview } from "../src/lib/pipeline/check";
import { lintPack, extractNumbers, numbersInFacts } from "../src/lib/content/lint";
import { mergeFindings } from "../src/lib/content/findings";
import { getPieces } from "../src/lib/content/pieces";
import { mockFixtures } from "../src/lib/ai/mock";
import { readUsage } from "../src/lib/ai/gemini";
import { isMock, models } from "../src/lib/ai/models";
import type { Run } from "../src/lib/content/types";

interface Case {
  name: string;
  topic: string;
  sourceUrl?: string;
  why: string;
}

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;
const RESULTS = path.join(process.cwd(), "evals", "results");

// ── Metrics for one finished run ─────────────────────────────────────

function score(run: Run) {
  const pieces = getPieces(run.pack);
  const hardFields = pieces.flatMap((p) => p.fields.filter((f) => f.limit?.hard));
  const withinLimits = hardFields.filter((f) => f.value.length <= f.limit!.max).length;

  const allowed = numbersInFacts(run.research.facts);
  const numbers = pieces.flatMap((p) => p.fields.flatMap((f) => extractNumbers(f.value)));
  const traced = numbers.filter((n) => allowed.has(n.value)).length;

  const ids = new Set(run.research.facts.map((f) => f.id));
  const cited = pieces.filter((p) => p.factIds.length > 0 && p.factIds.every((id) => ids.has(id))).length;

  const banned = run.findings.filter((f) => f.kind === "banned_phrase").length;

  return {
    blockingFirstDraft: run.revision?.blockingBefore ?? run.findings.filter((f) => f.severity === "block").length,
    blockingFinal: run.findings.filter((f) => f.severity === "block").length,
    warnings: run.findings.filter((f) => f.severity === "warn").length,
    revised: run.revision?.pieces.join(" ") || "none",
    limitsPass: `${withinLimits}/${hardFields.length}`,
    numbersTraced: numbers.length ? `${traced}/${numbers.length}` : "no numbers",
    piecesCiting: `${cited}/${pieces.length}`,
    bannedFinal: banned,
    image: run.image ? "yes" : `no (${run.imageError?.slice(0, 60)})`,
    seconds: Math.round(Object.values(run.timings).reduce((a, b) => a + (b ?? 0), 0) / 1000),
  };
}

// ── Pipeline eval ────────────────────────────────────────────────────

async function evalCases() {
  const cases = (JSON.parse(readFileSync(path.join(process.cwd(), "evals", "cases.json"), "utf8")) as Case[]).filter(
    (c) => !only || c.name.includes(only),
  );
  const rows: { c: Case; s?: ReturnType<typeof score>; error?: string; runId?: string }[] = [];

  for (const c of cases) {
    if ("sourceUrl" in c && !c.sourceUrl) {
      console.log(`- ${c.name}: skipped (no sourceUrl yet)`);
      continue;
    }
    process.stdout.write(`- ${c.name}: running… `);
    try {
      const run = await runPipeline({ topic: c.topic, sourceUrl: c.sourceUrl || undefined }, () => {});
      const s = score(run);
      rows.push({ c, s, runId: run.id });
      console.log(`done (${s.blockingFirstDraft} → ${s.blockingFinal} blocking)`);
    } catch (err) {
      rows.push({ c, error: (err as Error).message });
      console.log(`failed: ${(err as Error).message}`);
    }
  }

  const usage = readUsage();
  const lines = [
    `# Eval run ${new Date().toISOString()}`,
    "",
    `Models: ${isMock() ? "offline sample (MOCK_AI=1)" : `${models.text} / writer ${models.writer} / image ${models.image}`}`,
    `Tokens: ${usage.inputTokens.toLocaleString()} in, ${usage.outputTokens.toLocaleString()} out`,
    "",
    "| Case | Blocking (first → final) | Revised | Hard limits OK | Numbers traced | Pieces citing facts | Banned phrases left | Warnings | Image | Time |",
    "|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map(({ c, s, error }) =>
      s
        ? `| ${c.name} | ${s.blockingFirstDraft} → ${s.blockingFinal} | ${s.revised} | ${s.limitsPass} | ${s.numbersTraced} | ${s.piecesCiting} | ${s.bannedFinal} | ${s.warnings} | ${s.image} | ${s.seconds}s |`
        : `| ${c.name} | failed: ${error} | | | | | | | | |`,
    ),
    "",
    "## What the columns mean",
    "",
    "- **Blocking (first → final):** problems that stop approval, before and after the agent's one self-revision.",
    "- **Hard limits OK:** fields within platform limits (Google 30/90, X 280…).",
    "- **Numbers traced:** numbers in the drafts that appear in a fact. Anything below 100% was flagged for the reviewer.",
    "- **Pieces citing facts:** pieces whose fact ids all exist. A piece citing nothing can't be traced.",
    "",
    "## Cases",
    "",
    ...rows.map(({ c, runId }) => `- **${c.name}**: ${c.why}${runId ? ` Run: \`/runs/${runId}\`` : ""}`),
  ];
  return lines.join("\n");
}

// ── Checker eval: plant known problems, count what gets caught ───────

async function evalChecker() {
  const planted = [
    { pieceId: "linkedin", what: "Invented statistic (70% drop-off)", match: /70%/ },
    { pieceId: "meta-2", what: "Overclaim (bias-free)", match: /bias-free/i },
    { pieceId: "google-2", what: "Google headline over 30 characters", match: /Headline 2/ },
    { pieceId: "instagram", what: "Off-tone hook (pressure on candidates)", match: /sleep/i },
  ];
  const draft = mockFixtures.draft;
  const rules = lintPack(draft, { client: hireloop, facts: hireloop.facts.map((f) => ({ ...f, origin: "client" as const, ref: "", relevant: true })) });
  const ai = await aiReview(
    draft,
    hireloop,
    hireloop.facts.map((f) => ({ ...f, origin: "client" as const, ref: "", relevant: true })),
  );
  const all = mergeFindings(rules, ai);

  const rows = planted.map((p) => {
    const hit = all.find((f) => f.pieceId === p.pieceId && p.match.test(`${f.excerpt ?? ""} ${f.message}`));
    return { ...p, caughtBy: hit ? hit.by : "missed", severity: hit?.severity ?? "" };
  });
  const extra = all.filter((f) => !rows.some((r) => r.pieceId === f.pieceId));
  const caught = rows.filter((r) => r.caughtBy !== "missed").length;

  return [
    `# Checker eval ${new Date().toISOString()}`,
    "",
    `Reviewer model: ${isMock() ? "offline sample" : models.text}`,
    "",
    `Caught **${caught} of ${planted.length}** planted problems.`,
    "",
    "| Planted problem | Piece | Caught by | Severity |",
    "|---|---|---|---|",
    ...rows.map((r) => `| ${r.what} | ${r.pieceId} | ${r.caughtBy} | ${r.severity} |`),
    "",
    `Other findings on clean pieces (possible false alarms): ${extra.length}`,
    ...extra.map((f) => `- ${f.pieceId} (${f.by}, ${f.severity}): ${f.message}`),
  ].join("\n");
}

async function main() {
  const report = args.includes("--checker") ? await evalChecker() : await evalCases();
  mkdirSync(RESULTS, { recursive: true });
  const file = path.join(RESULTS, `${args.includes("--checker") ? "checker" : "pipeline"}-${Date.now()}.md`);
  writeFileSync(file, report);
  console.log(`\n${report}\n\nSaved to ${path.relative(process.cwd(), file)}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
