import type { Run } from "@/lib/content/types";
import { formatInr, type Cost } from "@/lib/ai/pricing";

const STEP_LABEL: Record<string, string> = {
  research: "Research",
  plan: "Plan",
  write: "Write",
  check: "Check",
  revise: "Revise",
  image: "Image",
};

/** What the agent read, what it decided, and how long each step took. */
export function ResearchView({ run, cost }: { run: Run; cost?: Cost | null }) {
  const { research, plan } = run;
  const relevant = research.facts.filter((f) => f.relevant);
  const other = research.facts.filter((f) => !f.relevant);
  return (
    <div className="sheet">
      <section className="paper">
        <h2>What the agent understood</h2>
        <p className="summary">{research.topicSummary}</p>
      </section>

      <section className="paper">
        <h2>The plan</h2>
        <dl className="plan">
          <dt>Audience</dt>
          <dd>{plan.audience}</dd>
          <dt>Angle</dt>
          <dd>{plan.angle}</dd>
          <dt>Key message</dt>
          <dd>{plan.keyMessage}</dd>
          <dt>Call to action</dt>
          <dd>{plan.cta}</dd>
        </dl>
      </section>

      {research.cautions.length > 0 && (
        <section className="paper">
          <h2>Cautions passed to the writer</h2>
          <ul className="list">
            {research.cautions.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="paper">
        <h2>Facts the drafts may use</h2>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 44 }}>Id</th>
              <th>Fact</th>
              <th style={{ width: 170 }}>Source</th>
            </tr>
          </thead>
          <tbody>
            {[...relevant, ...other].map((f) => (
              <tr key={f.id} data-relevant={f.relevant}>
                <td>
                  <b>{f.id}</b>
                </td>
                <td>
                  {f.text}
                  {f.quote && <div style={{ color: "var(--graphite)", fontStyle: "italic", marginTop: 2 }}>“{f.quote}”</div>}
                </td>
                <td style={{ overflowWrap: "anywhere" }}>{f.ref}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 13, color: "var(--graphite)", margin: "10px 0 0" }}>
          Greyed facts are on the client fact sheet but weren&apos;t picked as relevant to this topic.
        </p>
      </section>

      {research.rejectedFacts && research.rejectedFacts.length > 0 && (
        <section className="paper">
          <h2>Facts dropped by the grounding check</h2>
          <p style={{ fontSize: 13, color: "var(--graphite)", margin: "0 0 10px" }}>
            The researcher offered these, but their quote wasn&apos;t found in the page it read, or the fact added a number the quote
            doesn&apos;t have. The writer never saw them.
          </p>
          <ul className="list">
            {research.rejectedFacts.map((f, i) => (
              <li key={i}>
                {f.text} <span style={{ color: "var(--block)" }}>({f.reason})</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="paper">
        <h2>Pages read</h2>
        {research.clientSite && research.clientSite.status !== "off" && (
          <p style={{ margin: "0 0 10px", color: research.clientSite.status === "read" ? "var(--graphite)" : "var(--block)" }}>
            {research.clientSite.status === "read"
              ? `Client site read live: ${research.clientSite.pages} page(s) from ${research.clientSite.url}.`
              : `The client site couldn't be read (${research.clientSite.error}). This run used the verified fact sheet only.`}
          </p>
        )}
        {research.sourceKind === "search" && (
          <p style={{ margin: "0 0 10px", color: "var(--graphite)" }}>
            No link was given, so the agent searched the web and read the pages below. Their facts (S…) passed the same quote check as
            an article.
          </p>
        )}
        {research.pagesRead.length === 0 ? (
          <p style={{ margin: 0, color: "var(--graphite)" }}>
            None. This run used the topic and the client fact sheet only.
          </p>
        ) : (
          <ul className="list">
            {research.pagesRead.map((p) => (
              <li key={p.url}>
                <a href={p.url} target="_blank" rel="noreferrer">
                  {p.title || p.url}
                </a>{" "}
                {p.ok ? `(${p.chars.toLocaleString("en-IN")} characters)` : <span style={{ color: "var(--block)" }}>{p.error}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="paper">
        <h2>How the run went</h2>
        <table className="table">
          <tbody>
            {Object.entries(run.timings).map(([step, ms]) => (
              <tr key={step}>
                <td style={{ width: 120 }}>{STEP_LABEL[step] ?? step}</td>
                <td>{((ms ?? 0) / 1000).toFixed(1)} s</td>
              </tr>
            ))}
            <tr>
              <td>Models</td>
              <td>
                {run.models.mock ? "Offline sample (no API calls)" : `${run.models.text} · writer ${run.models.writer} · image ${run.models.image}`}
              </td>
            </tr>
            {run.usage && (
              <tr>
                <td>Tokens</td>
                <td>
                  {run.usage.inputTokens.toLocaleString("en-IN")} in · {run.usage.outputTokens.toLocaleString("en-IN")} out
                </td>
              </tr>
            )}
            {cost && (
              <tr>
                <td>Cost</td>
                <td>
                  About {formatInr(cost.inr)} (${cost.usd.toFixed(3)}){cost.estimatedFromTotals ? ", estimated from total tokens" : ""}
                  {cost.unpriced.length > 0 && <>. Not counted: {cost.unpriced.join(", ")} (no price on file)</>}
                  {(run.usage?.searches ?? 0) > 0 && <>. Plus {run.usage!.searches} web search(es), which Google bills separately</>}
                  <span style={{ display: "block", fontSize: 12.5, color: "var(--faint)" }}>
                    Google&apos;s listed prices for the date of this run, at ₹{cost.rate}/$.
                  </span>
                </td>
              </tr>
            )}
            {run.revision && (
              <tr>
                <td>Self-revision</td>
                <td>
                  Rewrote {run.revision.pieces.join(", ")}. Blocking problems went from {run.revision.blockingBefore} to{" "}
                  {run.revision.blockingAfter}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
