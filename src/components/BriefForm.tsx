"use client";

import { useState } from "react";
import type { RunEvent, StepName } from "@/lib/content/types";

const STEPS: { name: StepName; label: string; what: string }[] = [
  { name: "research", label: "Research", what: "Reads the link and the client site, pulls out facts" },
  { name: "plan", label: "Plan", what: "Picks one audience, angle and the facts to lean on" },
  { name: "write", label: "Write", what: "Drafts all 10 pieces and an image brief" },
  { name: "check", label: "Check", what: "Rules check + a separate AI reviewer" },
  { name: "revise", label: "Revise", what: "Rewrites pieces with blocking problems, once" },
  { name: "image", label: "Image", what: "Turns the brief into a picture" },
];

const EXAMPLES = [
  "Slow first-round interviews are costing BPOs their best applicants",
  "Why candidates should always be told when they're speaking with an AI",
  "Hiring in Tamil, Telugu and Bengali: first rounds in a candidate's own language",
];

type StepState = { status: "waiting" | "running" | "done" | "skipped" | "failed"; detail?: string };

export function BriefForm({ audiences }: { audiences: string[] }) {
  const [topic, setTopic] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [audience, setAudience] = useState(audiences[0]);
  const [notes, setNotes] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<Record<StepName, StepState> | null>(null);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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
          if (event.type === "step") {
            setSteps((prev) => prev && { ...prev, [event.step]: { status: event.status, detail: event.detail ?? prev[event.step].detail } });
          } else if (event.type === "done") {
            window.location.href = `/runs/${event.runId}`;
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

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {steps && (
        <ol className="progress" aria-live="polite">
          {STEPS.map((s) => (
            <li key={s.name} data-status={steps[s.name].status}>
              <span className="progress__mark" aria-hidden />
              <span className="progress__name">{s.label}</span>
              <span className="progress__detail">
                {steps[s.name].status === "skipped" ? "Skipped: " : ""}
                {steps[s.name].detail ?? s.what}
              </span>
            </li>
          ))}
        </ol>
      )}

      <div className="brief__actions">
        <button className="btn btn--primary" type="submit" disabled={running || topic.trim().length < 5}>
          {running ? "Working…" : "Write the content pack"}
        </button>
        <span className="brief__note">Takes about a minute. Nothing is posted anywhere.</span>
      </div>
    </form>
  );
}
