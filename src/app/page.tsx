import Link from "next/link";
import { clients } from "@/clients";
import { BriefForm } from "@/components/BriefForm";
import { TopBar } from "@/components/TopBar";
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
    { label: "Blocking notes open", value: String(active.reduce((n, r) => n + r.findings.filter((f) => f.severity === "block").length, 0)) },
    { label: "Spend so far", value: formatInr(all.reduce((sum, r) => sum + (runCost(r)?.inr ?? 0), 0)) },
  ];

  return (
    <>
      <TopBar mock={isMock()} notice={storageNotice()} />
      <div className="start">
        <div>
          <h1 className="start__lead">What should HireLoop talk about this week?</h1>
          <p className="start__sub">
            Give the agent a topic or a news link. It researches, drafts a blog post, a LinkedIn post, an X thread, an Instagram
            caption, 3 Meta ads, 3 Google ads and an image, checks every claim against the client&apos;s facts, and hands it all to you
            for review.
          </p>
          <BriefForm clients={clients().map(({ id, name, audiences }) => ({ id, name, audiences }))} />
        </div>

        <aside className="start__aside">
          <section className="panel recent" id="recent" aria-labelledby="recent-title">
            <div className="panel__head">
              <h2 id="recent-title">Recent packs</h2>
              {all.length > 0 && <Link href="/packs">View all ({all.length})</Link>}
            </div>
            {recent.length === 0 ? (
              <p className="recent__empty">Your packs will show up here after the first run.</p>
            ) : (
              <ul>
                {recent.map((r) => {
                  const done = approvedIn(r);
                  const blocking = r.findings.filter((f) => f.severity === "block").length;
                  return (
                    <li key={r.id}>
                      <Link href={`/runs/${r.id}`}>
                        <span className="recent__topic">{r.input.topic}</span>
                        <span className="recent__meta">
                          {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {done} of {TO_APPROVE}{" "}
                          approved
                          {blocking ? ` · ${blocking} blocking` : ""}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="panel" aria-labelledby="desk-title">
            <h2 id="desk-title">This desk</h2>
            <dl className="kv">
              {summary.map((s) => (
                <div key={s.label}>
                  <dt>{s.label}</dt>
                  <dd>{s.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="panel how" aria-labelledby="how-title">
            <h2 id="how-title">How a pack is made</h2>
            <ol>
              <li>Research: facts from the link (or a web search) and the client site, each with an id</li>
              <li>Plan: one audience, one angle</li>
              <li>Write: every channel</li>
              <li>Check: code rules and a separate AI reviewer</li>
              <li>Revise: automatic fixes for anything blocking</li>
              <li>Image: brief, then picture</li>
              <li>You review, edit and approve</li>
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}
