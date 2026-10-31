import { PacksList, type PackRow } from "@/components/PacksList";
import { TopBar } from "@/components/TopBar";
import { InboxIcon } from "@/components/ui/icons";
import { Card, PageBand, cn, wrap } from "@/components/ui/primitives";
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
      <TopBar current="packs" mock={isMock()} notice={storageNotice()} />
      <main id="main">
        <PageBand eyebrow="● Library" title="All packs">
          <p className="m-0">Every pack, newest first. Archived packs are hidden until you filter for them.</p>
        </PageBand>
        <div className={cn(wrap, "py-8")}>
          <Card title="Packs" description="Search by topic, filter by review state, archive what's done." icon={<InboxIcon />}>
            <PacksList rows={rows} />
          </Card>
        </div>
      </main>
    </>
  );
}
