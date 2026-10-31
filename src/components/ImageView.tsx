"use client";

import { useState } from "react";
import type { ImageBrief } from "@/lib/content/schemas";

const FIELDS: { key: keyof ImageBrief; label: string }[] = [
  { key: "concept", label: "Idea" },
  { key: "scene", label: "Scene" },
  { key: "composition", label: "Framing" },
  { key: "lighting", label: "Light" },
  { key: "palette", label: "Colour" },
  { key: "altText", label: "Alt text" },
];

/** The image brief the writer produced, the picture the image model made, and a way to try again. */
export function ImageView({
  brief,
  imageUrl,
  prompt,
  error,
  busy,
  onRegenerate,
}: {
  brief: ImageBrief;
  imageUrl?: string;
  prompt?: string;
  error?: string;
  busy: boolean;
  onRegenerate: (brief: ImageBrief) => void;
}) {
  const [draft, setDraft] = useState(brief);
  const [editing, setEditing] = useState(false);
  const changed = JSON.stringify(draft) !== JSON.stringify(brief);

  return (
    <div className="sheet" style={{ display: "grid", gap: 16 }}>
      <div className="image-frame">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={brief.altText} />
        ) : (
          <div className="media media--empty" style={{ aspectRatio: "16 / 10" }}>
            {busy ? "Generating…" : "No image yet."}
          </div>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <section className="paper">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Image brief</h2>
          <span className="stage__sub">
            {brief.aspectRatio} for {brief.channel}
          </span>
        </div>
        <dl className="brief-sheet">
          {FIELDS.map(({ key, label }) => (
            <div key={key} style={{ display: "contents" }}>
              <dt>{label}</dt>
              <dd>
                {editing ? (
                  <textarea
                    rows={key === "scene" ? 4 : 2}
                    value={String(draft[key])}
                    onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                    aria-label={label}
                  />
                ) : (
                  String(brief[key])
                )}
              </dd>
            </div>
          ))}
          <dt>Avoid</dt>
          <dd>{brief.avoid.join("; ")}</dd>
        </dl>
        <div className="decision" style={{ margin: "18px 0 0" }}>
          {editing ? (
            <>
              <button className="btn btn--primary" disabled={busy} onClick={() => onRegenerate(draft)}>
                {busy ? "Generating…" : changed ? "Generate from edited brief" : "Generate again"}
              </button>
              <button
                className="btn btn--quiet"
                onClick={() => {
                  setDraft(brief);
                  setEditing(false);
                }}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button className="btn" onClick={() => setEditing(true)}>
                Edit brief
              </button>
              <button className="btn" disabled={busy} onClick={() => onRegenerate(brief)}>
                {busy ? "Generating…" : "Generate again"}
              </button>
              {imageUrl && (
                <a className="btn btn--quiet" href={`${imageUrl}${imageUrl.includes("?") ? "&" : "?"}download=1`} download>
                  Download image
                </a>
              )}
            </>
          )}
        </div>
      </section>

      {prompt && (
        <details className="paper">
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Prompt sent to the image model</summary>
          <pre className="prompt-box" style={{ marginTop: 12 }}>
            {prompt}
          </pre>
        </details>
      )}
    </div>
  );
}
