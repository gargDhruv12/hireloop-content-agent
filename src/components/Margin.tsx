import type { Fact, Finding } from "@/lib/content/types";

const KIND_LABEL: Record<Finding["kind"], string> = {
  length: "Length",
  banned_phrase: "Brand rule",
  untraced_number: "Number without a source",
  citation: "Citation",
  missing_cta: "Call to action",
  format: "Format",
  unsupported_claim: "Claim without a source",
  off_brand: "Off brand",
  misleading: "Overstated",
  tone: "Tone",
};

/** The right-hand margin: proof notes for this piece, then the facts it relies on. */
export function Margin({
  findings,
  factIds,
  facts,
  activeId,
  onSelect,
}: {
  findings: Finding[];
  factIds: string[];
  facts: Fact[];
  activeId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const byId = new Map(facts.map((f) => [f.id, f]));
  return (
    <aside className="margin" aria-label="Notes and sources" tabIndex={0}>
      <section>
        <h3>Notes</h3>
        {findings.length === 0 ? (
          <p className="clean">
            <span aria-hidden>✓</span> No problems found by the rules or the reviewer.
          </p>
        ) : (
          <ol className="notes">
            {findings.map((f, i) => (
              <li key={f.id}>
                <button
                  type="button"
                  className="note"
                  data-severity={f.severity}
                  data-active={activeId === f.id}
                  onClick={() => onSelect?.(f.id)}
                >
                  <span className="note__num">{i + 1}</span>
                  <span>
                    <b>{KIND_LABEL[f.kind]}.</b> {f.message}
                    {f.suggestion && <span className="note__fix">{f.suggestion}</span>}
                    <span className="note__by">
                      {f.severity === "block" ? "Blocks approval" : "Your call"} · {f.by === "rules" ? "rules check" : "AI reviewer"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h3>Facts this piece uses</h3>
        {factIds.length === 0 ? (
          <p className="fact__missing" style={{ fontSize: 13.5, margin: 0 }}>
            The writer cited no facts for this piece.
          </p>
        ) : (
          <ul className="facts">
            {factIds.map((id) => {
              const fact = byId.get(id);
              return (
                <li className="fact" key={id}>
                  <span className="fact__id" data-origin={fact?.origin}>
                    {id}
                  </span>
                  {fact ? (
                    <span>
                      {fact.text}
                      <span className="fact__ref">{fact.ref}</span>
                    </span>
                  ) : (
                    <span className="fact__missing">Cited, but no fact has this id. Treat any claim relying on it as unsourced.</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </aside>
  );
}
