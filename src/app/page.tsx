import { hireloop } from "@/clients/hireloop";
import { BriefForm } from "@/components/BriefForm";
import { TopBar } from "@/components/TopBar";
import { isMock } from "@/lib/ai/models";
import { listRuns, storageNotice } from "@/lib/store/runs";

export const dynamic = "force-dynamic";

export default async function Home() {
  const runs = await listRuns(8);
  return (
    <>
      <TopBar mock={isMock()} notice={storageNotice()} />
      <div className="start">
        <div>
          <h1 className="start__lead">What should HireLoop talk about this week?</h1>
          <p className="start__sub">
            Give the agent a topic or a news link. It researches, drafts a blog post, a LinkedIn post, an X thread, an Instagram
            caption, 3 Meta ads, 3 Google ads and an image, checks every claim against HireLoop&apos;s facts, and hands it all to you
            for review.
          </p>
          <BriefForm audiences={hireloop.audiences} />
        </div>

        <aside>
          <section className="recent">
            <h2>Recent packs</h2>
            {runs.length === 0 ? (
              <p className="recent__empty">Your packs will show up here after the first run.</p>
            ) : (
              <ul>
                {runs.map((r) => {
                  const approved = Object.values(r.review).filter((s) => s === "approved").length;
                  const blocking = r.findings.filter((f) => f.severity === "block").length;
                  return (
                    <li key={r.id}>
                      <a href={`/runs/${r.id}`}>
                        <span className="recent__topic">{r.input.topic}</span>
                        <span className="recent__meta">
                          {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, {approved} of 11
                          approved{blocking ? `, ${blocking} blocking` : ""}
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="how">
            <b>How a pack is made</b>
            <ol>
              <li>Research: facts from the link and the client site, each with an id</li>
              <li>Plan: one audience, one angle</li>
              <li>Write: every channel in one go</li>
              <li>Check: code rules and a separate AI reviewer</li>
              <li>Revise: one automatic fix for anything blocking</li>
              <li>Image: brief, then picture</li>
              <li>You review, edit and approve</li>
            </ol>
          </section>
        </aside>
      </div>
    </>
  );
}
