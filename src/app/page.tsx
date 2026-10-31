import Image from "next/image";
import Link from "next/link";
import { clients } from "@/clients";
import { BriefForm } from "@/components/BriefForm";
import { TopBar } from "@/components/TopBar";
import { isMock } from "@/lib/ai/models";
import { PIECE_ORDER } from "@/lib/content/pieces";
import { listRuns, storageNotice } from "@/lib/store/runs";
import { formatInr, runCost } from "@/lib/ai/pricing";
import candidate from "@/assets/brand/candidate.jpg";
import glassBars from "@/assets/brand/glass-bars.jpg";
import heroGlass from "@/assets/brand/hero-glass.jpg";
import recruiter from "@/assets/brand/recruiter.jpg";

export const dynamic = "force-dynamic";

// Ten text pieces, plus the image to approve.
const PIECES = PIECE_ORDER.length;
const TO_APPROVE = PIECES + 1;

const STEPS = [
  { name: "Research", what: "Facts from the link and HireLoop's live site, each quote checked against the page" },
  { name: "Plan", what: "One audience, one angle, the facts to lean on" },
  { name: "Write", what: "Blog, social and ads in parallel" },
  { name: "Check", what: "Code rules plus a separate AI reviewer" },
  { name: "Revise", what: "Automatic fixes for anything blocking" },
  { name: "Image", what: "A brief, then the picture" },
];

const CHANNELS = [
  { name: "Long form", count: "1", what: "Blog post, 700–900 words, with SEO title and meta" },
  { name: "Social", count: "3", what: "LinkedIn post, X thread, Instagram caption" },
  { name: "Ads", count: "6", what: "3 Meta ads and 3 Google ads, inside platform limits" },
];

export default async function Home() {
  const all = await listRuns(1000);
  // Archived packs stay out of the lists and review counts; their cost still counts as spent.
  const active = all.filter((r) => !r.archived);
  const recent = active.slice(0, 6);
  const approvedIn = (r: (typeof all)[number]) => Object.values(r.review).filter((s) => s === "approved").length;
  const spend = all.reduce((sum, r) => sum + (runCost(r)?.inr ?? 0), 0);
  const stats = [
    { label: "Packs written", value: all.length, hint: "Saved on this desk" },
    { label: "Pieces approved", value: all.reduce((n, r) => n + approvedIn(r), 0), hint: "By a person, and logged" },
    { label: "Waiting for review", value: active.filter((r) => approvedIn(r) < TO_APPROVE).length, hint: "Packs not fully approved" },
    {
      label: "Blocking notes open",
      value: active.reduce((n, r) => n + r.findings.filter((f) => f.severity === "block").length, 0),
      hint: "Left after self-revision",
    },
    { label: "Spend so far", value: formatInr(spend), hint: "Gemini, at listed prices" },
  ];

  return (
    <>
      <TopBar mock={isMock()} notice={storageNotice()} />
      <main className="home">
        <section className="hero">
          <div className="hero__text">
            <span className="chip">
              <span className="chip__dot" aria-hidden /> AI content desk for HireLoop
            </span>
            <h1 className="hero__title">Turn one topic into a week of checked content</h1>
            <p className="hero__sub">
              Give the agent a topic or a news link. It researches, drafts {PIECES} pieces and an image, checks every claim against
              HireLoop&apos;s facts, and hands it all to you for review.
            </p>
            <div className="hero__actions">
              <a className="btn btn--primary btn--lg" href="#brief">
                Start a pack
              </a>
              <a className="btn btn--glass btn--lg" href="#recent">
                See recent packs
              </a>
            </div>
          </div>
          <div className="hero__art">
            <Image src={heroGlass} alt="" priority placeholder="blur" sizes="(max-width: 860px) 90vw, 480px" />
            <span className="float float--a">
              <b>{PIECES}</b> pieces per pack
            </span>
            <span className="float float--b">Every claim traced to a fact</span>
          </div>
        </section>

        <section className="console night" id="how" aria-label="How a pack is made">
          <div className="console__head">
            <span className="console__logo" aria-hidden />
            <div>
              <b>How a pack is made</b>
              <span>About a minute, start to finish. Nothing is posted anywhere.</span>
            </div>
          </div>
          <ol className="console__steps">
            {STEPS.map((s, i) => (
              <li key={s.name}>
                <span className="console__num">{i + 1}</span>
                <b>{s.name}</b>
                <span>{s.what}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="stats" aria-label="Desk activity">
          {stats.map((s) => (
            <div className="stat glass" key={s.label}>
              <span className="stat__label">{s.label}</span>
              <span className="stat__value">{s.value}</span>
              <span className="stat__hint">{s.hint}</span>
            </div>
          ))}
          <span className="orb orb--stats" aria-hidden />
        </section>

        <section className="workspace">
          <div className="workspace__brief glass" id="brief">
            <div className="section-head">
              <span className="chip">New pack</span>
              <h2>What should HireLoop talk about this week?</h2>
            </div>
            <BriefForm clients={clients().map(({ id, name, audiences }) => ({ id, name, audiences }))} />
          </div>

          <aside className="night recent" id="recent">
            <div className="recent__art">
              <Image src={glassBars} alt="" placeholder="blur" sizes="320px" />
            </div>
            <h2>Recent packs</h2>
            {recent.length === 0 ? (
              <p className="recent__empty">Your packs will show up here after the first run.</p>
            ) : (
              <ul>
                {recent.map((r) => {
                  const done = approvedIn(r);
                  const block = r.findings.filter((f) => f.severity === "block").length;
                  return (
                    <li key={r.id}>
                      <Link href={`/runs/${r.id}`}>
                        <span className="recent__topic">{r.input.topic}</span>
                        <span className="recent__bar" aria-hidden>
                          <span style={{ width: `${(done / TO_APPROVE) * 100}%` }} />
                        </span>
                        <span className="recent__meta">
                          {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {done} of{" "}
                          {TO_APPROVE} approved{block ? ` · ${block} blocking` : ""}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {all.length > 0 && (
              <Link href="/packs" className="recent__all">
                Show all packs ({all.length}) →
              </Link>
            )}
          </aside>
        </section>

        <section className="bento">
          <div className="bento__people night">
            <span className="chip chip--night">People decide</span>
            <h3>Nothing goes out without a person</h3>
            <p>
              Every piece waits for approval. Approving over a blocking note is allowed, and it is recorded with the time and a
              fingerprint of the exact text.
            </p>
            <span className="orb orb--people" aria-hidden />
          </div>

          <div className="bento__voice glass">
            <Image className="bento__portrait" src={recruiter} alt="" placeholder="blur" sizes="(max-width: 860px) 40vw, 200px" />
            <div>
              <h3>Written for the people you hire for</h3>
              <p>
                HireLoop&apos;s voice, banned phrases and fact sheet are built in. Drafts are checked for unsupported numbers, platform
                limits and tone before you see them.
              </p>
            </div>
          </div>

          <div className="bento__candidate glass">
            <Image src={candidate} alt="" placeholder="blur" sizes="(max-width: 860px) 90vw, 300px" />
            <p>
              <b>Facts, not filler.</b> A line like &ldquo;interview at 11 PM, in your own language&rdquo; comes from HireLoop&apos;s
              facts, and each piece shows which ones it used.
            </p>
          </div>

          <div className="bento__channels glass">
            <span className="chip">In every pack</span>
            <h3>One brief, every channel</h3>
            <div className="channels">
              {CHANNELS.map((c) => (
                <div className="channel" key={c.name}>
                  <span className="channel__name">{c.name}</span>
                  <span className="channel__count">{c.count}</span>
                  <span className="channel__what">{c.what}</span>
                </div>
              ))}
              <div className="channel channel--accent">
                <span className="channel__name">Visual</span>
                <span className="channel__count">1</span>
                <span className="channel__what">An on-brand image with an editable brief</span>
              </div>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
