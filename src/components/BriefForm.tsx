"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RunEvent, StepName } from "@/lib/content/types";
import { RunProgress, STEPS, type FeedLine, type StepState } from "./RunProgress";

const EXAMPLES = [
  "Slow first-round interviews are costing BPOs their best applicants",
  "Why candidates should always be told when they're speaking with an AI",
  "Hiring in Tamil, Telugu and Bengali: first rounds in a candidate's own language",
];


export function BriefForm({ audiences }: { audiences: string[] }) {
  const router = useRouter();
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
        body: JSON.stringify({ topic, sourceUrl, audience, notes }),
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
    <form className="brief" onSubmit={start}>
      <div className="field">
        <label className="field__label" htmlFor="topic">
          Topic
        </label>
        <textarea
          id="topic"
          className="textarea textarea--topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="What should this week's content be about?"
          required
          minLength={5}
          maxLength={300}
          disabled={running}
        />
        <div className="examples">
          <span>Or start from one of these:</span>
          {EXAMPLES.map((ex) => (
            <button type="button" key={ex} onClick={() => setTopic(ex)} disabled={running}>
              {ex}
            </button>
          ))}
        </div>
      </div>

      <div className="brief__row">
        <div className="field">
          <label className="field__label" htmlFor="source">
            News link <span className="field__hint">optional</span>
          </label>
          <input
            id="source"
            className="input"
            type="url"
            inputMode="url"
            placeholder="https://"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            disabled={running}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="audience">
            Write for
          </label>
          <select id="audience" className="select" value={audience} onChange={(e) => setAudience(e.target.value)} disabled={running}>
            {audiences.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="notes">
          Notes for the agent <span className="field__hint">optional. Campaign focus or things to avoid. If a link won&apos;t load, paste the article here and the agent treats it as the source.</span>
        </label>
        <textarea id="notes" className="textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={running} />
      </div>



      <div className="brief__actions">
        <button className="btn btn--primary" type="submit" disabled={running || topic.trim().length < 5}>
          {running ? "Working…" : "Write the content pack"}
        </button>
        <span className="brief__note">Takes about a minute. Nothing is posted anywhere.</span>
      </div>
      {steps && (
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
          }}
        />
      )}
    </form>
  );
}
