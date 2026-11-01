import Link from "next/link";
import type { CSSProperties } from "react";
import { TopBar } from "@/components/TopBar";
import {
  ChartIcon,
  CheckIcon,
  ClockIcon,
  ImageIcon,
  LayersIcon,
  NoteIcon,
  PenIcon,
  SearchIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UserCheckIcon,
} from "@/components/ui/icons";
import { CountUp, Reveal } from "@/components/ui/motion";
import { Badge, Card, cn, wrap } from "@/components/ui/primitives";
import { isMock } from "@/lib/ai/models";
import { formatInr, runCost } from "@/lib/ai/pricing";
import { PIECE_ORDER } from "@/lib/content/pieces";
import { listRuns, storageNotice } from "@/lib/store/runs";

export const dynamic = "force-dynamic";

// Ten text pieces, plus the image to approve.
const TO_APPROVE = PIECE_ORDER.length + 1;

const STEPS = [
  { n: "01", title: "Brief", text: "A topic or a news link, and who it's for." },
  { n: "02", title: "Draft & check", text: "Ten pieces and an image, every claim checked." },
  { n: "03", title: "Review", text: "Approve, edit or rewrite; download what's approved." },
];

/** The overview: what the desk does, how it's doing, and the way into a new pack. */
export default async function Home() {
  const all = await listRuns(1000);
  // Archived packs stay out of the list and review counts; their cost still counts as spent.
  const active = all.filter((r) => !r.archived);
  const recent = active.slice(0, 6);
  const approvedIn = (r: (typeof all)[number]) => Object.values(r.review).filter((s) => s === "approved").length;
  const approvedTotal = all.reduce((n, r) => n + approvedIn(r), 0);
  const waiting = active.filter((r) => approvedIn(r) < TO_APPROVE).length;
  const blocking = active.reduce((n, r) => n + r.findings.filter((f) => f.severity === "block").length, 0);
  const spend = formatInr(all.reduce((sum, r) => sum + (runCost(r)?.inr ?? 0), 0));
  const latest = active[0];
  // The last eight packs, oldest first, for the hero's glass bars.
  const history = active.slice(0, 8).reverse();
  // Packs written on each of the last ten days, oldest first.
  const days = Array.from({ length: 10 }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (9 - i));
    const next = d.getTime() + 86_400_000;
    const count = all.filter((r) => {
      const t = new Date(r.createdAt).getTime();
      return t >= d.getTime() && t < next;
    }).length;
    return { label: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), count };
  });
  const busiest = Math.max(1, ...days.map((d) => d.count));
  const thisWeek = days.slice(-7).reduce((n, d) => n + d.count, 0);
  const doneShare = active.length ? Math.round(((active.length - waiting) / active.length) * 100) : 0;

  const stats = [
    { label: "Packs written", value: String(all.length) },
    { label: "Pieces approved", value: String(approvedTotal) },
    { label: "Waiting for review", value: String(waiting) },
    { label: "Blocking notes open", value: String(blocking) },
  ];

  return (
    <>
      <TopBar current="home" mock={isMock()} notice={storageNotice()} />
      <main id="main">
        {/* ── Hero ── */}
        <section className="band">
          <div className={cn(wrap, "grid items-center gap-6 pt-12 pb-40 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:pt-16 lg:pb-44")}>
            <div className="min-w-0">
              <span className="glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-bold text-band-accent">
                <SparklesIcon className="size-3.5" /> AI content desk for HireLoop
              </span>
              <h1 className="band-title m-0 mt-5 max-w-[15ch] text-[clamp(36px,5.2vw,64px)] leading-[1.02] font-extrabold tracking-[-0.035em]">
                Grow HireLoop&apos;s reach with reviewed, on-brand content
              </h1>
              <p className="m-0 mt-5 max-w-[52ch] text-[17px] leading-relaxed text-band-muted">
                One topic becomes a blog post, social posts, ads and an image: researched, checked against HireLoop&apos;s facts, and
                approved by your team before anything goes out.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/new" className="btn btn--primary">
                  <SparklesIcon /> Start a brief
                </Link>
                <Link href="/packs" className="btn">
                  <SearchIcon /> Browse packs
                </Link>
              </div>
            </div>
            <GlassScene history={history.map((r) => approvedIn(r))} />
          </div>
        </section>

        {/* ── The dark panel that overlaps the hero ── */}
        <div className={cn(wrap, "relative z-10 -mt-32")}>
          <Reveal>
            <section
              aria-label="This desk"
              className="relative overflow-hidden rounded-[22px] bg-[#120f26] px-5 py-6 text-[#f5f3ff] shadow-[0_40px_80px_-40px_rgb(20_10_60/0.9)] sm:px-8"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute -top-24 left-1/3 size-72 rounded-full bg-[radial-gradient(circle,rgb(124_92_255/0.45),transparent_65%)]"
              />
              <div className="relative grid items-center gap-6 md:grid-cols-[auto_minmax(0,1fr)_auto]">
                <div className="flex items-center gap-4">
                  <span
                    aria-hidden
                    className="grid size-16 shrink-0 place-items-center rounded-full"
                    style={{ background: `conic-gradient(#a593ff ${doneShare * 3.6}deg, rgb(255 255 255 / 0.12) 0)` }}
                  >
                    <span className="grid size-11 place-items-center rounded-full bg-[#120f26] text-xs font-extrabold">{doneShare}%</span>
                  </span>
                  <div>
                    <p className="m-0 text-xs font-bold tracking-[.08em] text-[#c4bdf0] uppercase">This desk</p>
                    <p className="m-0 mt-1 text-sm text-[#c4bdf0]">
                      <span className="sr-only">{doneShare}% </span>of active packs fully approved
                    </p>
                  </div>
                </div>

                <div className="min-w-0 rounded-2xl bg-linear-to-br from-[#6d4dff] to-[#4c32c2] px-4 py-3 shadow-[0_16px_40px_-20px_rgb(109_77_255/0.9)]">
                  <p className="m-0 text-xs font-bold text-[#ece7ff]">Latest pack</p>
                  {latest ? (
                    <Link href={`/runs/${latest.id}`} className="mt-1 block truncate text-sm font-bold text-white no-underline hover:underline">
                      {latest.input.topic}
                    </Link>
                  ) : (
                    <p className="m-0 mt-1 text-sm font-bold text-white">No packs yet: start your first brief</p>
                  )}
                </div>

                <div className="md:text-right">
                  <p className="m-0 text-3xl font-extrabold tracking-tight">
                    <CountUp value={spend} />
                  </p>
                  <p className="m-0 mt-0.5 text-xs text-[#c4bdf0]">spent on AI so far</p>
                </div>
              </div>
            </section>
          </Reveal>

          {/* ── Stat tiles ── */}
          <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {stats.map((s, i) => (
              <Reveal key={s.label} delay={i * 80}>
                <div className="lift flex h-full items-end justify-between gap-3 rounded-[18px] border border-line bg-bg px-5 py-4">
                  <div className="min-w-0">
                    <p className="m-0 text-xs font-bold text-muted">{s.label}</p>
                    <p className="m-0 mt-1 text-[26px] font-extrabold text-ink">
                      <CountUp value={s.value} />
                    </p>
                  </div>
                  <Link
                    href="/packs"
                    className="mb-1 shrink-0 rounded-full bg-brand px-3 py-1 text-xs font-bold text-on-brand no-underline hover:bg-brand/90 max-sm:hidden"
                    aria-label={`View packs (${s.label})`}
                  >
                    View
                  </Link>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        {/* ── Bento: what makes a pack trustworthy ── */}
        <section id="how" aria-labelledby="how-title" className={cn(wrap, "scroll-mt-24 pt-20")}>
          <Reveal>
            <h2 id="how-title" className="m-0 max-w-[22ch] text-[clamp(26px,3.2vw,38px)] leading-tight font-extrabold tracking-[-0.02em] text-ink">
              Every draft is traced, checked and reviewed
            </h2>
          </Reveal>

          <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.6fr)_minmax(0,1fr)]">
            <Reveal className="h-full">
              <article className="lift flex h-full flex-col rounded-[22px] bg-[#120f26] p-6 text-[#f5f3ff]">
                <span className="grid size-10 place-items-center rounded-xl bg-white/10 text-[#c3b5ff]">
                  <ShieldCheckIcon />
                </span>
                <h3 className="m-0 mt-5 text-xl font-extrabold">Traced to the source</h3>
                <p className="m-0 mt-2 flex-1 text-sm leading-relaxed text-[#c4bdf0]">
                  Every claim cites a fact the agent researched, with the page it came from. Numbers that aren&apos;t in the research are
                  flagged.
                </p>
                <Link
                  href="/new"
                  className="mt-6 inline-flex w-fit items-center gap-2 rounded-full bg-[#a593ff] px-4 py-2 text-sm font-bold text-[#120f24] no-underline hover:bg-[#b9aaff]"
                >
                  <PenIcon /> Start a brief
                </Link>
              </article>
            </Reveal>

            <Reveal className="h-full" delay={80}>
              <article className="lift grid h-full gap-6 rounded-[22px] border border-line bg-bg p-6 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)] sm:items-center">
                {/* A miniature of a post as the desk previews it. */}
                <div aria-hidden className="rounded-2xl border border-line bg-panel p-4 shadow-[0_20px_40px_-28px_rgb(40_25_110/0.6)]">
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-9 place-items-center rounded-full bg-linear-to-br from-[#8b6cff] to-[#38bdf8] text-xs font-extrabold text-white">
                      HL
                    </span>
                    <div>
                      <p className="m-0 text-[13px] font-bold text-ink">HireLoop</p>
                      <p className="m-0 text-[11px] text-muted">LinkedIn · Company page</p>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-1.5">
                    <span className="h-2 w-full rounded-full bg-lilac" />
                    <span className="h-2 w-11/12 rounded-full bg-lilac" />
                    <span className="h-2 w-3/4 rounded-full bg-lilac" />
                  </div>
                  <div className="mt-3 aspect-[1.9] rounded-xl bg-linear-to-br from-[#d9cfff] via-[#c4b5fd] to-[#9fdcff]" />
                </div>
                <div>
                  <h3 className="m-0 text-xl font-extrabold text-ink">Previewed as it will post</h3>
                  <p className="m-0 mt-2 text-sm leading-relaxed text-muted">
                    Each draft is shown the way its channel shows it (LinkedIn, X, Instagram, Meta and Google ads) with notes in the
                    margin, so you review what people will actually see.
                  </p>
                  <span className="mt-5 inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs font-bold text-muted">
                    <NoteIcon className="size-3.5" /> Notes beside every draft
                  </span>
                </div>
              </article>
            </Reveal>

            <div className="grid gap-4">
              <Reveal delay={160}>
                <article className="lift rounded-[22px] bg-linear-to-br from-[#6d4dff] to-[#4c32c2] p-5 text-white">
                  <p className="m-0 text-xs font-bold text-[#ece7ff]">Human review</p>
                  <p className="m-0 mt-2 text-3xl font-extrabold">
                    {latest ? approvedIn(latest) : 0}
                    <span className="text-base font-bold text-[#ece7ff]"> / {TO_APPROVE}</span>
                  </p>
                  <p className="m-0 mt-1 text-sm text-[#ece7ff]">approved in the latest pack</p>
                </article>
              </Reveal>
              <Reveal delay={240}>
                <article className="lift flex items-start gap-3 rounded-[22px] border border-line bg-bg p-5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-lilac text-brand-text">
                    <UserCheckIcon />
                  </span>
                  <div>
                    <h3 className="m-0 text-base font-extrabold text-ink">Nothing posts without you</h3>
                    <p className="m-0 mt-1 text-sm text-muted">Approve, edit or ask the agent to rewrite. Every decision is signed.</p>
                  </div>
                </article>
              </Reveal>
            </div>
          </div>

          {/* ── Steps and the chart ── */}
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <Reveal className="h-full">
              <article className="flex h-full flex-col rounded-[22px] border border-line bg-bg p-6">
                <h3 className="m-0 max-w-[24ch] text-2xl leading-tight font-extrabold text-ink">From one topic to a reviewed campaign in three steps</h3>
                <p className="m-0 mt-2 text-sm text-muted">About a minute of agent work, then your review.</p>
                <ol className="m-0 mt-6 grid flex-1 list-none gap-3 p-0 sm:grid-cols-3">
                  {STEPS.map((s, i) => (
                    <li key={s.n} className={cn("lift flex flex-col rounded-2xl border p-4", i === 1 ? "border-brand-2/40 bg-lilac" : "border-line bg-panel")}>
                      <span className="text-xs font-extrabold text-brand-text">{s.n}</span>
                      <span className="mt-2 text-base font-extrabold text-ink">{s.title}</span>
                      <span className="mt-1 flex-1 text-[13px] leading-snug text-muted">{s.text}</span>
                    </li>
                  ))}
                </ol>
              </article>
            </Reveal>

            <Reveal className="h-full" delay={80}>
              <article className="relative flex h-full flex-col overflow-hidden rounded-[22px] bg-[#120f26] p-6 text-[#f5f3ff]">
                <span
                  aria-hidden
                  className="pointer-events-none absolute -right-16 -bottom-20 size-72 rounded-full bg-[radial-gradient(circle,rgb(124_92_255/0.5),transparent_65%)]"
                />
                <div className="relative flex items-start justify-between gap-4">
                  <div>
                    <h3 className="m-0 text-xl font-extrabold">Packs written, day by day</h3>
                    <p className="m-0 mt-1 text-sm text-[#c4bdf0]">The last ten days on this desk.</p>
                  </div>
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-[#c3b5ff]">
                    <ChartIcon />
                  </span>
                </div>
                <div className="relative mt-6 flex h-40 items-end gap-2" role="img" aria-label={chartLabel(days)}>
                  {days.map((d, i) => (
                    <span
                      key={d.label}
                      title={`${d.label}: ${d.count}`}
                      className="chart-bar"
                      style={{ "--h": `${Math.max(6, (d.count / busiest) * 100)}%`, "--d": `${i * 70}ms` } as CSSProperties}
                    />
                  ))}
                </div>
                <div className="relative mt-5 flex items-center justify-between gap-4 rounded-2xl border border-white/15 bg-white/8 px-4 py-3 backdrop-blur">
                  <div>
                    <p className="m-0 text-xs text-[#c4bdf0]">Packs in the last 7 days</p>
                    <p className="m-0 text-2xl font-extrabold">
                      <CountUp value={String(thisWeek)} />
                    </p>
                  </div>
                  <Link
                    href="/packs"
                    className="grid size-10 place-items-center rounded-full bg-[#f5f3ff] text-[#120f24] no-underline"
                    aria-label="Open all packs"
                  >
                    <LayersIcon />
                  </Link>
                </div>
              </article>
            </Reveal>
          </div>
        </section>

        {/* ── Recent packs ── */}
        <section aria-label="Recent packs" className={cn(wrap, "pt-16 pb-16")}>
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
                <p className="m-0 px-5 py-8 text-center text-sm text-muted">
                  Your packs will show up here after the first run.{" "}
                  <Link href="/new" className="font-bold text-brand-text">
                    Start a brief
                  </Link>
                </p>
              ) : (
                <ul className="m-0 list-none divide-y divide-line p-0">
                  {recent.map((r) => {
                    const done = approvedIn(r);
                    const blocks = r.findings.filter((f) => f.severity === "block").length;
                    return (
                      <li key={r.id}>
                        <Link
                          href={`/runs/${r.id}`}
                          className="group flex items-center gap-4 px-4 py-3 text-ink no-underline transition-colors hover:bg-tint sm:px-5"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold group-hover:text-brand-text">{r.input.topic}</span>
                            <span className="mt-0.5 block text-xs text-muted">
                              {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {done} of {TO_APPROVE}{" "}
                              approved
                              {blocks ? ` · ${blocks} blocking` : ""}
                            </span>
                          </span>
                          <span className="hidden h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-lilac sm:block" aria-hidden>
                            <span className="block h-full rounded-full bg-ok" style={{ width: `${(done / TO_APPROVE) * 100}%` }} />
                          </span>
                          {done === TO_APPROVE ? (
                            <Badge tone="success">Approved</Badge>
                          ) : blocks > 0 ? (
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
        </section>
      </main>

      <footer className={cn(wrap, "flex flex-wrap items-center justify-between gap-3 border-t border-line py-6 text-[13px] text-muted")}>
        <span>Content Studio for HireLoop</span>
        <span className="inline-flex items-center gap-1.5">
          <CheckIcon className="size-3.5" /> Drafts only: nothing is published, sent or scheduled without a person.
        </span>
      </footer>
    </>
  );
}

function chartLabel(days: { label: string; count: number }[]): string {
  return `Packs written each day: ${days.map((d) => `${d.label} ${d.count}`).join(", ")}.`;
}

/**
 * The hero's 3D glass objects: channel marks on floating glass tiles, and glass
 * cylinders in a dish showing approvals in the latest packs. Decoration only.
 */
function GlassScene({ history }: { history: number[] }) {
  const bars = (history.length >= 3 ? history.slice(-4) : [4, 7, 5, 9]).map((v) => Math.max(0.3, v / TO_APPROVE));
  const tints = ["139 108 255", "56 189 248", "167 139 250", "99 102 241"];
  return (
    <div className="scene" aria-hidden>
      <span className="tile" style={{ "--s": "116px", left: "20%", top: "2%", "--rot": "-8deg" } as CSSProperties}>
        <PenIcon className="text-[#5b3fd6]" />
      </span>
      <span className="tile" style={{ "--s": "92px", left: "58%", top: "0%", "--rot": "10deg", "--d": "-2s" } as CSSProperties}>
        <ChartIcon className="text-[#0ea5e9]" />
      </span>
      <span className="tile tile--dark" style={{ "--s": "96px", left: "0%", top: "36%", "--rot": "6deg", "--d": "-4s" } as CSSProperties}>
        <LayersIcon className="text-[#c3b5ff]" />
      </span>
      <span className="tile" style={{ "--s": "104px", right: "0%", top: "24%", "--rot": "-6deg", "--d": "-1s" } as CSSProperties}>
        <ImageIcon className="text-[#d6249f]" />
      </span>
      <span className="orb" style={{ "--s": "38px", left: "44%", top: "28%", "--d": "-3s" } as CSSProperties} />
      <span className="orb" style={{ "--s": "26px", right: "12%", bottom: "6%", "--d": "-5s" } as CSSProperties} />

      <div className="dish" />
      <div className="bars">
        {bars.map((h, i) => (
          <span key={i} className="bar" style={{ "--h": `${h * 100}%`, "--tint": tints[i % tints.length], "--d": `${i * 120}ms` } as CSSProperties} />
        ))}
      </div>
    </div>
  );
}
