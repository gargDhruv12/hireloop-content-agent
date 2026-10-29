import type { ReactNode } from "react";

export interface Mark {
  excerpt: string;
  num: number;
  severity: "block" | "warn";
  findingId: string;
}

/**
 * Renders plain text with proof marks over the exact words a finding points
 * at. Matching is case-insensitive; each excerpt is marked at its first
 * occurrence in this text.
 */
export function Marked({
  text,
  marks,
  activeId,
  onSelect,
}: {
  text: string;
  marks: Mark[];
  activeId?: string | null;
  onSelect?: (findingId: string) => void;
}) {
  const ranges = findRanges(text, marks);
  if (!ranges.length) return <>{text}</>;

  const out: ReactNode[] = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start > cursor) out.push(text.slice(cursor, r.start));
    out.push(
      <mark
        key={`${r.mark.findingId}-${r.start}`}
        className={`mark mark--${r.mark.severity}`}
        data-active={activeId === r.mark.findingId}
        onClick={() => onSelect?.(r.mark.findingId)}
        title={r.mark.severity === "block" ? "Blocking problem" : "Worth a look"}
      >
        {text.slice(r.start, r.end)}
        <span className="mark__ref" aria-label={`note ${r.mark.num}`}>
          {r.mark.num}
        </span>
      </mark>,
    );
    cursor = r.end;
  }
  if (cursor < text.length) out.push(text.slice(cursor));
  return <>{out}</>;
}

function findRanges(text: string, marks: Mark[]) {
  const lower = text.toLowerCase();
  const ranges: { start: number; end: number; mark: Mark }[] = [];
  for (const mark of marks) {
    if (!mark.excerpt) continue;
    const start = lower.indexOf(mark.excerpt.toLowerCase());
    if (start === -1) continue;
    const end = start + mark.excerpt.length;
    // Skip a mark that overlaps one already placed (the first, more severe one wins).
    if (ranges.some((r) => start < r.end && end > r.start)) continue;
    ranges.push({ start, end, mark });
  }
  return ranges.sort((a, b) => a.start - b.start);
}

/** Minimal Markdown for blog drafts: ## headings, paragraphs, - lists, **bold**. No raw HTML. */
export function MarkdownMarked({
  source,
  marks,
  activeId,
  onSelect,
}: {
  source: string;
  marks: Mark[];
  activeId?: string | null;
  onSelect?: (id: string) => void;
}) {
  const blocks = source.trim().split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, i) => {
        const text = block.trim();
        const m = (t: string) => <Inline text={t} marks={marks} activeId={activeId} onSelect={onSelect} />;
        if (/^#{1,3}\s/.test(text)) {
          return <h2 key={i}>{m(text.replace(/^#{1,3}\s+/, ""))}</h2>;
        }
        if (text.split("\n").every((l) => /^[-*]\s/.test(l.trim()))) {
          return (
            <ul key={i}>
              {text.split("\n").map((l, j) => (
                <li key={j}>{m(l.trim().replace(/^[-*]\s+/, ""))}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{m(text.replace(/\n/g, " "))}</p>;
      })}
    </>
  );
}

function Inline({ text, ...rest }: { text: string; marks: Mark[]; activeId?: string | null; onSelect?: (id: string) => void }) {
  // Bold runs are rendered without the asterisks; marks still apply inside them.
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i}>
            <Marked text={part.slice(2, -2)} {...rest} />
          </strong>
        ) : (
          <Marked key={i} text={part} {...rest} />
        ),
      )}
    </>
  );
}
