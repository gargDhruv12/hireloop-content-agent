import { notFound } from "next/navigation";
import { hireloop } from "@/clients/hireloop";
import { Desk, type View } from "@/components/Desk";
import { PIECE_ORDER } from "@/lib/content/pieces";
import { TopBar } from "@/components/TopBar";
import { loadRun, storageNotice } from "@/lib/store/runs";
import { runCost } from "@/lib/ai/pricing";

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
      <TopBar title={run.input.topic} mock={run.models.mock} notice={storageNotice()} />
      <Desk
        initialRun={run}
        initialView={initialView}
        client={{ name: hireloop.name, bannedPhrases: hireloop.bannedPhrases }}
        cost={runCost(run)}
      />
    </>
  );
}
