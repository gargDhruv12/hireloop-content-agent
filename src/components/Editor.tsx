"use client";

import type { Piece } from "@/lib/content/pieces";

/** Edit a piece field by field, with live character counts. Checks re-run as you type. */
export function Editor({ piece, onChange }: { piece: Piece; onChange: (path: string, value: string) => void }) {
  return (
    <div className="editor">
      {piece.fields.map((field) => {
        const n = field.value.length;
        const over = field.limit && n > field.limit.max ? (field.limit.hard ? "hard" : "soft") : undefined;
        const id = `edit-${field.path}`;
        return (
          <div className="editor__field" key={field.path}>
            <label className="editor__label" htmlFor={id}>
              <span>{field.label}</span>
              {field.limit && (
                <span className="counter" data-over={over}>
                  {n}/{field.limit.max}
                </span>
              )}
            </label>
            {field.kind === "choice" ? (
              <select id={id} value={field.value} onChange={(e) => onChange(field.path, e.target.value)}>
                {field.options?.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : field.kind === "line" || field.kind === "tags" ? (
              <input id={id} value={field.value} data-over={over} onChange={(e) => onChange(field.path, e.target.value)} />
            ) : (
              <textarea
                id={id}
                value={field.value}
                data-over={over}
                rows={field.kind === "markdown" ? 22 : Math.min(12, Math.max(3, Math.ceil(n / 70) + 1))}
                onChange={(e) => onChange(field.path, e.target.value)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
