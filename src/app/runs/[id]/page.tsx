import { notFound } from "next/navigation";
import { clientById } from "@/clients";
import { Desk, type View } from "@/components/Desk";
import { PIECE_ORDER } from "@/lib/content/pieces";
import { TopBar } from "@/components/TopBar";
import { loadRun, storageNotice } from "@/lib/store/runs";
import { runCost } from "@/lib/ai/pricing";
import { schedulerConfig } from "@/lib/scheduler";
import { ArchiveButton } from "@/components/ArchiveButton";
import { cn, wrap } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default async function RunPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id } = await params;
  // ?view=linkedin opens straight onto a piece (handy for sharing a link in the team chat).
  const requested = (await searchParams).view;
  const views: string[] = ["research", "image", ...PIECE_ORDER];
  const initialView = (requested && views.includes(requested) ? requested : "research") as View;
  const run = await loadRun(id).catch(() => null);
  if (!run) notFound();
  return (
    <>
      <TopBar mock={run.models.mock} notice={storageNotice()} />
      <main id="main">
        {run.archived && (
          <div role="status" className="border-b border-warn/30 bg-warn-soft">
            <div className={cn(wrap, "flex flex-wrap items-center justify-between gap-3 py-3 text-sm font-semibold text-warn")}>
              <span>This pack is archived. It&apos;s hidden from the home page and the pack list.</span>
              <ArchiveButton id={run.id} archived />
            </div>
          </div>
        )}
        <Desk
          initialRun={run}
          initialView={initialView}
          client={(({ name, bannedPhrases, brand, ctaPattern, primaryCta }) => ({ name, bannedPhrases, brand, ctaPattern, primaryCta }))(
            clientById(run.input.clientId),
          )}
          cost={runCost(run)}
          scheduler={schedulerConfig()?.name ?? null}
        />
      </main>
    </>
  );
}
