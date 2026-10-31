import { PacksList, type PackRow } from "@/components/PacksList";
import { TopBar } from "@/components/TopBar";
import { isMock } from "@/lib/ai/models";
import { formatInr, runCost } from "@/lib/ai/pricing";
import { PIECE_ORDER } from "@/lib/content/pieces";
import { listRuns, storageNotice } from "@/lib/store/runs";

export const dynamic = "force-dynamic";

export const metadata = { title: "All packs · HireLoop content desk" };

const TO_APPROVE = PIECE_ORDER.length + 1;

export default async function PacksPage() {
  const runs = await listRuns(1000);
  const rows: PackRow[] = runs.map((r) => {
    const cost = runCost(r);
    return {
      id: r.id,
      topic: r.input.topic,
      createdAt: r.createdAt,
      approved: Object.values(r.review).filter((s) => s === "approved").length,
      total: TO_APPROVE,
      blocking: r.findings.filter((f) => f.severity === "block").length,
      archived: !!r.archived,
      cost: cost ? formatInr(cost.inr) : null,
    };
  });

  return (
    <>
      <TopBar mock={isMock()} notice={storageNotice()} />
      <main className="page">
        <div className="page__head">
          <h1>All packs</h1>
          <p>Every pack, newest first. Archived packs are hidden until you filter for them.</p>
        </div>
        <PacksList rows={rows} />
      </main>
    </>
  );
}
