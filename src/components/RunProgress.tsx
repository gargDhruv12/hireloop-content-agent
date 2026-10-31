"use client";

import { useEffect, useRef, useState } from "react";
import type { StepName } from "@/lib/content/types";

export type StepState = { status: "waiting" | "running" | "done" | "skipped" | "failed"; detail?: string };
/** Recent progress lines, newest first ("Reading en.wikipedia.org", "Dropped 1 fact…"). */
export type FeedLine = { id: number; step: string; text: string };

export const STEPS: { name: StepName; label: string; what: string }[] = [
  { name: "research", label: "Research", what: "Reads the link or searches the web, reads the client site, pulls out facts" },
  { name: "plan", label: "Plan", what: "Picks one audience, angle and the facts to lean on" },
  { name: "write", label: "Write", what: "Drafts the blog, social posts, ads and an image brief" },
  { name: "check", label: "Check", what: "Code rules plus a separate AI reviewer" },
  { name: "revise", label: "Revise", what: "Fixes anything blocking, automatically" },
  { name: "image", label: "Image", what: "Turns the brief into a picture" },
];

/**
 * The minute while a pack is written: the six steps as connected cards, the
 * live detail from the server, elapsed time, and the error in place with a
 * way back. Shown over the brief form, which keeps its values underneath.
 */
export function RunProgress({
  topic,
  steps,
  feed,
  error,
  done,
  onRetry,
  onEdit,
}: {
  topic: string;
  steps: Record<StepName, StepState>;
  feed: FeedLine[];
  error: string | null;
  done: boolean;
  onRetry: () => void;
  onEdit: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const started = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const finished = done || !!error;

  // Move focus into the dialog so keyboard and screen-reader users land on it.
  useEffect(() => panel.current?.focus(), []);

  useEffect(() => {
    if (finished) return;
    started.current ??= Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - (started.current ?? Date.now())) / 1000)), 1000);
    return () => clearInterval(t);
  }, [finished]);


  const completed = STEPS.filter((s) => ["done", "skipped"].includes(steps[s.name].status)).length;
  const pct = done ? 100 : Math.round((completed / STEPS.length) * 100);
  const mmss = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <div className="runprog" role="dialog" aria-modal="true" aria-labelledby="runprog-title">
      <div className="runprog__panel" ref={panel} tabIndex={-1} data-state={error ? "failed" : done ? "done" : "running"}>
        <div className="runprog__head">
          <span className="chip">{error ? "Stopped" : done ? "Ready" : "Writing your pack"}</span>
          <h2 id="runprog-title">{topic}</h2>
          <div className="runprog__meta" aria-hidden={!finished}>
            <span className="runprog__time">{mmss}</span>
            <span>{error ? "The run stopped." : done ? "Opening the pack…" : elapsed < 75 ? "Usually about a minute" : "Taking longer than usual; still working"}</span>
          </div>
          <div className="runprog__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progress">
            <span style={{ width: `${Math.max(pct, 4)}%` }} />
          </div>
        </div>

        <ol className="runprog__steps" aria-live="polite">
          {STEPS.map((s, i) => {
            const st = steps[s.name];
            return (
              <li key={s.name} className="runstep" data-status={st.status} style={{ "--i": i } as React.CSSProperties}>
                <span className="runstep__mark" aria-hidden>
                  {st.status === "done" ? "✓" : st.status === "failed" ? "!" : st.status === "skipped" ? "–" : i + 1}
                </span>
                <div className="runstep__body">
                  <b>{s.label}</b>
                  <span key={st.detail ?? s.what} className="runstep__detail">
                    {st.status === "skipped" ? `Skipped: ${st.detail ?? ""}` : (st.detail ?? s.what)}
                  </span>
                </div>
                <span className="visually-hidden">{st.status}</span>
              </li>
            );
          })}
        </ol>

        {feed.length > 0 && !error && (
          <ul className="runprog__feed" aria-hidden>
            {feed.map((f) => (
              <li key={f.id}>
                <b>{f.step}</b> {f.text}
              </li>
            ))}
          </ul>
        )}

        {error && (
          <div className="runprog__error" role="alert">
            <p>{error}</p>
            <div>
              <button type="button" className="btn btn--primary" onClick={onRetry}>
                Try again
              </button>
              <button type="button" className="btn btn--glass" onClick={onEdit}>
                Edit the brief
              </button>
            </div>
          </div>
        )}
        {!error && <p className="runprog__note">Nothing is posted anywhere. You review and approve every piece next.</p>}
      </div>
    </div>
  );
}
