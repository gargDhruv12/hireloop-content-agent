"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { StepName } from "@/lib/content/types";
import { AlertIcon, CheckIcon, ImageIcon, LayersIcon, PenIcon, SearchIcon, ShieldCheckIcon, SparklesIcon, SpinnerIcon } from "./ui/icons";
import { Badge, Button, Card, cn } from "./ui/primitives";

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

const ICONS: Record<StepName, ReactNode> = {
  research: <SearchIcon />,
  plan: <LayersIcon />,
  write: <PenIcon />,
  check: <ShieldCheckIcon />,
  revise: <SparklesIcon />,
  image: <ImageIcon />,
};

const STATE_LABEL: Record<StepState["status"], string> = {
  waiting: "Not started",
  running: "In progress",
  done: "Complete",
  skipped: "Skipped",
  failed: "Failed",
};

/**
 * The workflow, beside the brief: the six steps before you review. Idle, it says
 * what each step does; during a run it shows the live detail from the server,
 * elapsed time, and the error in place with a way back.
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
  /** null before the first run. */
  steps: Record<StepName, StepState> | null;
  feed: FeedLine[];
  error: string | null;
  done: boolean;
  onRetry: () => void;
  onEdit: () => void;
}) {
  const card = useRef<HTMLDivElement>(null);
  const started = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const running = !!steps && !done && !error;

  // A new run: bring the steps into view (below the form on phones) and move focus there.
  useEffect(() => {
    if (!running) return;
    card.current?.focus({ preventScroll: true });
    card.current?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [running]);

  useEffect(() => {
    if (!running) return;
    started.current = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - (started.current ?? Date.now())) / 1000)), 1000);
    return () => {
      clearInterval(t);
      setElapsed(0);
    };
  }, [running]);

  const completed = steps ? STEPS.filter((s) => ["done", "skipped"].includes(steps[s.name].status)).length : 0;
  const pct = done ? 100 : Math.round((completed / STEPS.length) * 100);
  const mmss = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;

  return (
    <div ref={card} tabIndex={-1} className="scroll-mt-24 rounded-[14px] focus:outline-none">
      <Card
        title="Workflow"
        description={
          !steps
            ? "What happens after you press Write the content pack. Then you review every piece."
            : error
              ? "The run stopped. Your brief is still filled in."
              : done
                ? "Done. Opening the pack…"
                : elapsed < 75
                  ? `Writing “${topic}”. Usually about a minute.`
                  : `Writing “${topic}”. Taking longer than usual; still working.`
        }
        icon={<LayersIcon />}
        actions={
          steps && (
            <>
              {running && (
                <span className="font-mono text-sm font-semibold text-muted tabular-nums" aria-hidden>
                  {mmss}
                </span>
              )}
              <Badge tone={error ? "danger" : done ? "success" : "brand"}>{error ? "Stopped" : done ? "Ready" : "Running"}</Badge>
            </>
          )
        }
      >
        {steps && (
          <div
            className="mb-4 h-1.5 overflow-hidden rounded-full bg-lilac"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-label="Progress"
          >
            <span className="block h-full rounded-full bg-brand transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${Math.max(pct, 4)}%` }} />
          </div>
        )}

        <ol className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2 xl:grid-cols-3" aria-live="polite">
          {STEPS.map((s, i) => {
            const st = steps?.[s.name] ?? { status: "waiting" as const };
            const detail = st.status === "skipped" ? `Skipped: ${st.detail ?? ""}` : (st.detail ?? s.what);
            return (
              <li
                key={s.name}
                aria-current={st.status === "running" ? "step" : undefined}
                className={cn(
                  "flex items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                  st.status === "waiting" && "border-line",
                  st.status === "running" && "border-brand-2/50 bg-lilac",
                  st.status === "done" && "border-ok/30 bg-ok-soft",
                  st.status === "skipped" && "border-line bg-tint",
                  st.status === "failed" && "border-bad/40 bg-bad-soft",
                )}
              >
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-[10px]",
                    (st.status === "waiting" || st.status === "skipped") && "bg-tint text-muted",
                    st.status === "running" && "bg-brand text-on-brand",
                    st.status === "done" && "bg-ok text-on-ok",
                    st.status === "failed" && "bg-bad-solid text-white",
                  )}
                  aria-hidden
                >
                  {st.status === "done" ? <CheckIcon /> : st.status === "failed" ? <AlertIcon /> : st.status === "running" ? <SpinnerIcon /> : ICONS[s.name]}
                </span>
                <div className="min-w-0">
                  <p className="m-0 text-sm font-bold text-ink">
                    <span className="text-muted">{i + 1}.</span> {s.label}
                    {steps && <span className="sr-only">, {STATE_LABEL[st.status]}</span>}
                  </p>
                  <p className="m-0 mt-0.5 text-xs leading-snug text-muted">{detail}</p>
                </div>
              </li>
            );
          })}
        </ol>

        {feed.length > 0 && !error && (
          <ul className="m-0 mt-4 grid list-none gap-1 border-t border-line p-0 pt-3 font-mono text-xs text-muted" aria-hidden>
            {feed.map((f) => (
              <li key={f.id} className="truncate">
                <b className="text-ink">{f.step}</b> {f.text}
              </li>
            ))}
          </ul>
        )}

        {error && (
          <div role="alert" className="mt-4 rounded-xl border border-bad/30 bg-bad-soft p-4">
            <p className="m-0 text-sm font-semibold text-bad">{error}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={onRetry}>Try again</Button>
              <Button variant="soft" onClick={onEdit}>
                Edit the brief
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
