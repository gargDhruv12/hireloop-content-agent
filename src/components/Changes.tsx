"use client";

import type { ReactNode } from "react";
import type { Field } from "@/lib/content/pieces";
import { changed, wordDiff } from "@/lib/content/diff";

/**
 * What a rewrite changed, field by field: removed words struck through,
 * added words highlighted. Unchanged fields are listed by name only.
 */
export function Changes({ title, before, after, actions }: { title: string; before: Field[]; after: Field[]; actions?: ReactNode }) {
  const rows = after.map((f) => {
    const old = before.find((b) => b.path === f.path)?.value ?? "";
    return { field: f, parts: wordDiff(old, f.value) };
  });
  const differing = rows.filter((r) => changed(r.parts));
  const same = rows.filter((r) => !changed(r.parts));

  return (
    <section className="changes" aria-label={title}>
      <div className="changes__head">
        <b>{title}</b>
        <span>
          {differing.length === 0 ? "No wording changed." : `${differing.length} of ${rows.length} field${rows.length === 1 ? "" : "s"} changed.`}
          <span className="changes__key">
            <del>removed</del> <ins>added</ins>
          </span>
        </span>
      </div>
      {differing.map(({ field, parts }) => (
        <div className="changes__field" key={field.path}>
          <span className="changes__label">{field.label}</span>
          <p className="changes__text">
            {parts.map((p, i) =>
              p.kind === "same" ? <span key={i}>{p.text}</span> : p.kind === "added" ? <ins key={i}>{p.text}</ins> : <del key={i}>{p.text}</del>,
            )}
          </p>
        </div>
      ))}
      {same.length > 0 && differing.length > 0 && <p className="changes__same">Unchanged: {same.map((r) => r.field.label).join(", ")}</p>}
      {actions && <div className="changes__actions">{actions}</div>}
    </section>
  );
}
