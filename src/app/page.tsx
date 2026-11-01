import Link from "next/link";
import { clients } from "@/clients";
import { BriefForm } from "@/components/BriefForm";
import { TopBar } from "@/components/TopBar";
import { ContentCore } from "@/components/ContentCore";
import { CheckIcon, ClockIcon } from "@/components/ui/icons";
import { CountUp, Reveal } from "@/components/ui/motion";
import { Badge, Card, cn, wrap } from "@/components/ui/primitives";
import { isMock } from "@/lib/ai/models";
import { formatInr, runCost } from "@/lib/ai/pricing";
import { PIECE_ORDER } from "@/lib/content/pieces";
import { listRuns, storageNotice } from "@/lib/store/runs";

export const dynamic = "force-dynamic";

// Ten text pieces, plus the image to approve.
const TO_APPROVE = PIECE_ORDER.length + 1;

export default async function Home() {
  const all = await listRuns(1000);
  // Archived packs stay out of the list and review counts; their cost still counts as spent.
  const active = all.filter((r) => !r.archived);
  const recent = active.slice(0, 8);
  const approvedIn = (r: (typeof all)[number]) => Object.values(r.review).filter((s) => s === "approved").length;
  const summary = [
    { label: "Packs written", value: String(all.length) },
    { label: "Pieces approved", value: String(all.reduce((n, r) => n + approvedIn(r), 0)) },
    { label: "Waiting for review", value: String(active.filter((r) => approvedIn(r) < TO_APPROVE).length) },
    {
      label: "Blocking notes open",
      value: String(active.reduce((n, r) => n + r.findings.filter((f) => f.severity === "block").length, 0)),
    },
    { label: "Spend so far", value: formatInr(all.reduce((sum, r) => sum + (runCost(r)?.inr ?? 0), 0)) },
  ];

  return (
    <>
      <TopBar current="new" mock={isMock()} notice={storageNotice()} />
      <main id="main">
        <section className="band border-b border-band-line">
          <div
            className={cn(wrap, "grid items-center gap-8 pt-10 pb-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-12 lg:pt-16")}
          >
            <div className="min-w-0">
              <span className="glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-bold text-band-accent">
                ● Research → Plan → Write → Check → Revise → Image → Human review
              </span>
              <h1 className="band-title m-0 mt-5 max-w-[16ch] text-[clamp(34px,5vw,60px)] leading-[1.04] font-extrabold tracking-[-0.03em]">
                What should HireLoop talk about this week?
              </h1>
              <p className="m-0 mt-5 max-w-[58ch] text-[17px] leading-relaxed text-band-muted">
                Give the agent a topic or a news link. It researches, drafts a blog post, a LinkedIn post, an X thread, an Instagram
                caption, 3 Meta ads, 3 Google ads and an image, checks every claim against the client&apos;s facts, and hands it all to you
                for review.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <a href="#brief" className="btn btn--primary">
                  Start a brief
                </a>
                <Link href="/packs" className="btn">
                  See all packs
                </Link>
              </div>
              <ul className="m-0 mt-7 flex list-none flex-wrap gap-x-6 gap-y-2 p-0 text-sm text-band-muted">
                {["Every claim traced to a fact", "An AI reviewer on every draft", "Nothing posts without you"].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <CheckIcon className="size-4 text-band-accent" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <ContentCore />
          </div>

          <div className={cn(wrap, "pb-10")}>
            <dl aria-label="This desk" className="m-0 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {summary.map((s) => (
                <div key={s.label} className="glass lift rounded-2xl px-4 py-4">
                  <dt className="text-xs font-semibold text-band-muted">{s.label}</dt>
                  <dd className="m-0 mt-1 text-2xl font-extrabold text-band-ink">
                    <CountUp value={s.value} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <div className={cn(wrap, "py-8")}>
          <BriefForm clients={clients().map(({ id, name, audiences }) => ({ id, name, audiences }))}>
            <Reveal>
              <Card
                id="recent"
                title="Recent packs"
                description="Open a pack to review, edit and approve it."
                icon={<ClockIcon />}
                bodyClassName="p-0 sm:p-0"
                actions={
                  all.length > 0 && (
                    <Link href="/packs" className="text-sm font-bold text-brand-text no-underline hover:underline">
                      View all ({all.length})
                    </Link>
                  )
                }
              >
                {recent.length === 0 ? (
                  <p className="m-0 px-5 py-8 text-center text-sm text-muted">Your packs will show up here after the first run.</p>
                ) : (
                  <ul className="m-0 list-none divide-y divide-line p-0">
                    {recent.map((r) => {
                      const done = approvedIn(r);
                      const blocking = r.findings.filter((f) => f.severity === "block").length;
                      return (
                        <li key={r.id}>
                          <Link
                            href={`/runs/${r.id}`}
                            className="group flex items-center gap-4 px-4 py-3 text-ink no-underline transition-colors hover:bg-tint sm:px-5"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-bold group-hover:text-brand-text">{r.input.topic}</span>
                              <span className="mt-0.5 block text-xs text-muted">
                                {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {done} of{" "}
                                {TO_APPROVE} approved
                                {blocking ? ` · ${blocking} blocking` : ""}
                              </span>
                            </span>
                            <span className="hidden h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-lilac sm:block" aria-hidden>
                              <span className="block h-full rounded-full bg-ok" style={{ width: `${(done / TO_APPROVE) * 100}%` }} />
                            </span>
                            {done === TO_APPROVE ? (
                              <Badge tone="success">Approved</Badge>
                            ) : blocking > 0 ? (
                              <Badge tone="danger">Blocking</Badge>
                            ) : (
                              <Badge tone="warning">In review</Badge>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            </Reveal>
          </BriefForm>
        </div>
      </main>

      <footer className={cn(wrap, "border-t border-line py-6 text-[13px] text-muted")}>
        Content Studio for HireLoop · Drafts only: nothing is published, sent or scheduled without a person.
      </footer>
    </>
  );
}
