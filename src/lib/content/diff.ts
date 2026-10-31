/**
 * Word-level differences between two versions of a field, for showing what a
 * rewrite changed. Words are compared without their spacing, so a spacing-only
 * change isn't shown as a rewrite; unchanged words carry the new version's
 * spacing. Joining the parts rebuilds the new version exactly.
 */
export type DiffPart = { kind: "same" | "added" | "removed"; text: string };

/** Above this many cells the table gets slow; fall back to "everything changed". */
const MAX_CELLS = 4_000_000;

function tokens(s: string): string[] {
  return s.match(/\S+\s*|\s+/g) ?? [];
}

export function wordDiff(before: string, after: string): DiffPart[] {
  const a = tokens(before);
  const b = tokens(after);
  if (before === after) return before ? [{ kind: "same", text: before }] : [];
  if (a.length * b.length > MAX_CELLS) {
    return [
      ...(before ? [{ kind: "removed" as const, text: before }] : []),
      ...(after ? [{ kind: "added" as const, text: after }] : []),
    ];
  }

  // Longest common subsequence of words, compared without trailing spaces.
  const key = (t: string) => t.trimEnd();
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = key(a[i]) === key(b[j]) ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out: DiffPart[] = [];
  const push = (kind: DiffPart["kind"], text: string) => {
    const last = out[out.length - 1];
    if (last?.kind === kind) last.text += text;
    else out.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (key(a[i]) === key(b[j])) {
      push("same", b[j]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      push("removed", a[i++]);
    } else {
      push("added", b[j++]);
    }
  }
  while (i < a.length) push("removed", a[i++]);
  while (j < b.length) push("added", b[j++]);
  return out;
}

/** True when the two versions differ at all. */
export function changed(parts: DiffPart[]): boolean {
  return parts.some((p) => p.kind !== "same");
}
