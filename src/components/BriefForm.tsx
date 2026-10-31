"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import type { RunEvent, StepName } from "@/lib/content/types";
import { PenIcon, SparklesIcon, SpinnerIcon } from "./ui/icons";
import { Button, Card, cn } from "./ui/primitives";
import { RunProgress, STEPS, type FeedLine, type StepState } from "./RunProgress";

const EXAMPLES = [
  "Slow first-round interviews are costing BPOs their best applicants",
  "Why candidates should always be told when they're speaking with an AI",
  "Hiring in Tamil, Telugu and Bengali: first rounds in a candidate's own language",
];

const GUARDRAILS = [
  "Every claim traces back to a researched fact",
  "Numbers not in the research are flagged",
  "A separate AI reviewer checks each draft",
  "A person approves every piece; nothing is posted",
];

const field =
  "block w-full rounded-[10px] border border-line bg-bg px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-2/30 disabled:opacity-60";
const label = "flex items-baseline justify-between gap-2 text-sm font-bold text-ink";

export interface ClientChoice {
  id: string;
  name: string;
  audiences: string[];
}

/**
 * The home page's working area: the brief (and guardrails) on the left, the live
 * workflow on the right, with whatever the page passes in underneath it.
 */
export function BriefForm({ clients, children }: { clients: ClientChoice[]; children?: ReactNode }) {
  const [clientId, setClientId] = useState(clients[0].id);
  const audiences = clients.find((c) => c.id === clientId)?.audiences ?? clients[0].audiences;
  const router = useRouter();
  const topicRef = useRef<HTMLTextAreaElement>(null);
  const [topic, setTopic] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [audience, setAudience] = useState(audiences[0]);
  const [notes, setNotes] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<Record<StepName, StepState> | null>(null);
  const [done, setDone] = useState(false);
  const [feed, setFeed] = useState<FeedLine[]>([]);

  function start(e: React.FormEvent) {
    e.preventDefault();
    void run();
  }

  async function run() {
    setError(null);
    setDone(false);
    setFeed([]);
    let feedId = 0;
    setRunning(true);
    setSteps(Object.fromEntries(STEPS.map((s) => [s.name, { status: "waiting" }])) as Record<StepName, StepState>);

    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic, sourceUrl, audience, notes, clientId }),
      }).catch(() => {
        throw new Error("The server couldn't be reached. Check that npm run dev is still running.");
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `The server answered ${res.status}.`);
      }

      // Read the NDJSON progress stream line by line.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read().catch(() => {
          throw new Error("The connection dropped during the run. It may still finish: check Recent packs in a minute.");
        });
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let event: RunEvent;
          try {
            event = JSON.parse(line) as RunEvent;
          } catch {
            continue; // a garbled progress line shouldn't stop the run
          }
          if (event.type === "step" && event.detail) {
            const text = event.detail;
            const step = STEPS.find((s) => s.name === event.step)?.label ?? event.step;
            setFeed((f) => (f[0]?.text === text ? f : [{ id: ++feedId, step, text }, ...f].slice(0, 4)));
          }
          if (event.type === "step") {
            setSteps((prev) => prev && { ...prev, [event.step]: { status: event.status, detail: event.detail ?? prev[event.step].detail } });
          } else if (event.type === "done") {
            setDone(true);
            router.push(`/runs/${event.runId}`);
            return;
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }
      throw new Error("The run stopped without finishing. Check the server log.");
    } catch (err) {
      setError((err as Error).message);
      setRunning(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
      <aside className="grid grid-cols-1 gap-6 lg:sticky lg:top-24">
        <Card title="Brief" description="One topic or news link becomes a full content pack." icon={<PenIcon />}>
          <form className="grid gap-4" onSubmit={start}>
            <div>
              <label className={label} htmlFor="topic">
                Topic
              </label>
              <textarea
                ref={topicRef}
                id="topic"
                className={cn(field, "mt-1.5 min-h-24 resize-y leading-6")}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="What should this week's content be about?"
                required
                minLength={5}
                maxLength={300}
                disabled={running}
              />
              <div className="mt-2 grid gap-1.5">
                <span className="text-xs text-muted">Or start from one of these:</span>
                {EXAMPLES.map((ex) => (
                  <button
                    type="button"
                    key={ex}
                    onClick={() => setTopic(ex)}
                    disabled={running}
                    className="cursor-pointer rounded-[10px] border border-line bg-panel px-3 py-2 text-left text-xs leading-snug font-semibold text-ink transition-colors hover:border-brand-2/60 hover:bg-lilac disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>

            {clients.length > 1 && (
              <div>
                <label className={label} htmlFor="client">
                  Client
                </label>
                <select
                  id="client"
                  className={cn(field, "mt-1.5")}
                  value={clientId}
                  onChange={(e) => {
                    const next = clients.find((c) => c.id === e.target.value) ?? clients[0];
                    setClientId(next.id);
                    // Each client has its own audiences.
                    setAudience(next.audiences[0]);
                  }}
                  disabled={running}
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className={label} htmlFor="source">
                News link <span className="text-xs font-medium text-muted">optional</span>
              </label>
              <input
                id="source"
                className={cn(field, "mt-1.5")}
                type="url"
                inputMode="url"
                placeholder="https://"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                disabled={running}
              />
            </div>

            <div>
              <label className={label} htmlFor="audience">
                Write for
              </label>
              <select id="audience" className={cn(field, "mt-1.5")} value={audience} onChange={(e) => setAudience(e.target.value)} disabled={running}>
                {audiences.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={label} htmlFor="notes">
                Notes for the agent <span className="text-xs font-medium text-muted">optional</span>
              </label>
              <textarea
                id="notes"
                className={cn(field, "mt-1.5 resize-y leading-6")}
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={running}
                aria-describedby="notes-hint"
              />
              <p id="notes-hint" className="m-0 mt-1 text-xs text-muted">
                Campaign focus or things to avoid. If a link won&apos;t load, paste the article here and the agent treats it as the source.
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={running || topic.trim().length < 5}>
              {running ? <SpinnerIcon /> : <SparklesIcon />}
              {running ? "Working…" : "Write the content pack"}
            </Button>
            <p className="m-0 -mt-1 text-center text-xs text-muted">Takes about a minute. Nothing is posted anywhere.</p>
          </form>
        </Card>

        <section aria-labelledby="guardrails-title" className="rounded-[14px] bg-tint p-5">
          <h2 id="guardrails-title" className="m-0 text-[12px] font-extrabold tracking-[.08em] text-brand-text uppercase">
            Guardrails
          </h2>
          <ul className="m-0 mt-3 grid list-none gap-2 p-0 text-[13.5px] text-ink">
            {GUARDRAILS.map((g) => (
              <li key={g} className="flex gap-2">
                <span aria-hidden className="font-extrabold text-brand-text">
                  ✓
                </span>
                {g}
              </li>
            ))}
          </ul>
        </section>
      </aside>

      <div className="grid min-w-0 grid-cols-1 gap-6">
        <RunProgress
          topic={topic}
          steps={steps}
          feed={feed}
          error={error}
          done={done}
          onRetry={() => void run()}
          onEdit={() => {
            setSteps(null);
            setError(null);
            topicRef.current?.focus();
          }}
        />
        {children}
      </div>
    </div>
  );
}
