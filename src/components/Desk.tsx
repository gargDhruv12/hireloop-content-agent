"use client";

import { useEffect, useMemo, useState } from "react";
import type { ClientProfile } from "@/clients/types";
import type { ContentPack, ImageBrief } from "@/lib/content/schemas";
import type { Finding, PieceId, ReviewStatus, Run } from "@/lib/content/types";
import { getPieces, setField } from "@/lib/content/pieces";
import { refreshAfterEdit } from "@/lib/content/findings";
import { Proof } from "./Proof";
import { Margin } from "./Margin";
import { Editor } from "./Editor";
import { ResearchView } from "./ResearchView";
import { ImageView } from "./ImageView";
import type { Mark } from "./Marked";

export type View = PieceId | "research" | "image";

/**
 * The review desk. Everything the agent made is "pending" until a person
 * approves it. Edits are re-checked by the rules as you type; blocking
 * problems disable Approve (with a deliberate override).
 */
export function Desk({
  initialRun,
  client,
  initialView = "research",
}: {
  initialRun: Run;
  client: Pick<ClientProfile, "bannedPhrases" | "name">;
  initialView?: View;
}) {
  const [run, setRun] = useState(initialRun);
  const [pack, setPack] = useState<ContentPack>(initialRun.pack);
  const [findings, setFindings] = useState<Finding[]>(initialRun.findings);
  const [view, setView] = useState<View>(initialView);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "save" | "rewrite" | "image" | "decide" | "download">(null);
  const [note, setNote] = useState("");
  const [showRewrite, setShowRewrite] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const pieces = useMemo(() => getPieces(pack), [pack]);
  const piece = pieces.find((p) => p.id === view);
  const pieceFindings = findings.filter((f) => f.pieceId === view);
  const blocking = pieceFindings.filter((f) => f.severity === "block").length;
  const imageUrl = run.image ? `/api/runs/${run.id}/image?v=${run.image.file}` : undefined;
  const approvedCount = [...pieces.map((p) => p.id), "image" as const].filter((id) => run.review[id] === "approved").length;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // Proof marks: number findings per piece in margin order.
  const marks = useMemo(() => {
    const out: Record<string, Mark[]> = {};
    pieceFindings.forEach((f, i) => {
      if (!f.excerpt || !f.path) return;
      (out[f.path] ??= []).push({ excerpt: f.excerpt, num: i + 1, severity: f.severity, findingId: f.id });
    });
    return out;
  }, [pieceFindings]);

  /**
   * Call the API for an updated run. Never throws: a dropped connection or a
   * server answer that isn't JSON comes back as a readable error.
   */
  async function api(url: string, method: string, body: object, failure: string): Promise<{ run: Run } | { error: string }> {
    let res: Response;
    try {
      res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    } catch {
      return { error: `${failure} The server couldn't be reached. Check that npm run dev is still running.` };
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) return { error: data?.error ?? `${failure} The server answered ${res.status}.` };
    return { run: data as Run };
  }

  async function patch(body: { pack?: ContentPack; review?: Run["review"] }): Promise<Run | null> {
    const out = await api(`/api/runs/${run.id}`, "PATCH", body, "Couldn't save.");
    if ("error" in out) {
      setError(out.error);
      return null;
    }
    setError(null);
    setRun(out.run);
    return out.run;
  }

  function go(next: View) {
    if (dirty && !confirm("You have unsaved edits. Leave them?")) return;
    if (dirty) {
      setPack(run.pack);
      setFindings(run.findings);
      setDirty(false);
    }
    setView(next);
    window.history.replaceState(null, "", `?view=${next}`);
    setEditing(false);
    setShowRewrite(false);
    setActive(null);
    setError(null);
  }

  function edit(path: string, value: string) {
    const next = setField(pack, path, value);
    setPack(next);
    setFindings(refreshAfterEdit(next, findings, client, run.research.facts));
    setDirty(true);
  }

  async function saveEdits() {
    setBusy("save");
    // An edited piece needs a fresh look, so it goes back to pending.
    const saved = await patch({ pack, review: { [view]: "pending" } });
    setBusy(null);
    if (saved) {
      setFindings(saved.findings);
      setDirty(false);
      setEditing(false);
      setToast("Edits saved");
    }
  }

  async function decide(status: ReviewStatus) {
    if (busy) return;
    setBusy("decide");
    // Send only this piece's status, so a stale copy never undoes another approval.
    const saved = await patch({ review: { [view]: status } });
    setBusy(null);
    if (saved) setToast(status === "approved" ? "Approved" : status === "changes" ? "Marked as needing changes" : "Set back to pending");
  }

  async function rewrite() {
    setBusy("rewrite");
    setError(null);
    const out = await api(`/api/runs/${run.id}/pieces/${view}`, "POST", { note }, "Rewrite failed.");
    setBusy(null);
    if ("error" in out) return setError(out.error);
    const data = out.run;
    setRun(data);
    setPack(data.pack);
    setFindings(data.findings);
    setNote("");
    setShowRewrite(false);
    setToast("Rewritten and re-checked");
  }

  async function regenerateImage(brief: ImageBrief) {
    setBusy("image");
    setError(null);
    const out = await api(`/api/runs/${run.id}/image`, "POST", { brief }, "The image couldn't be generated.");
    setBusy(null);
    if ("error" in out) {
      // Shown next to the image, where the person is looking.
      setRun((r) => ({ ...r, imageError: out.error }));
      return;
    }
    const data = out.run;
    setRun(data);
    setPack(data.pack);
    setToast("New image ready");
  }

  function download(name: string, content: Blob) {
    const url = URL.createObjectURL(content);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Some browsers start the download after click() returns; revoke a little later.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  /** The approved Markdown and, if approved, the image, as one .zip built from the saved run. */
  async function downloadApproved() {
    if (dirty && !confirm("You have unsaved edits. They won't be in the download. Download anyway?")) return;
    setBusy("download");
    setError(null);
    try {
      let res: Response;
      try {
        res = await fetch(`/api/runs/${run.id}/export`, { cache: "no-store" });
      } catch {
        throw new Error("the server couldn't be reached.");
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `the server answered ${res.status}.`);
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? `${run.id}-approved.zip`;
      download(name, await res.blob());
      setToast(run.review.image === "approved" ? "Downloaded the approved pieces and image" : "Downloaded the approved pieces");
    } catch (err) {
      setError(`Couldn't download: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  const counts = (id: PieceId) => {
    const fs = findings.filter((f) => f.pieceId === id);
    return { block: fs.filter((f) => f.severity === "block").length, warn: fs.filter((f) => f.severity === "warn").length };
  };

  return (
    <>
      <div className="desk">
        <nav className="rail" aria-label="Content pack">
          <div className="rail__progress">
            {approvedCount} of {pieces.length + 1} approved
            <div className="meter" aria-hidden>
              <span style={{ width: `${(approvedCount / (pieces.length + 1)) * 100}%` }} />
            </div>
          </div>

          <div className="rail__group">
            <div className="rail__list">
              <RailItem label="Research and plan" noStatus current={view === "research"} onClick={() => go("research")} />
            </div>
          </div>

          <div className="rail__group">
            <div className="rail__heading">Drafts</div>
            <div className="rail__list">
              {pieces.map((p) => (
                <RailItem
                  key={p.id}
                  label={p.short}
                  status={run.review[p.id]}
                  counts={counts(p.id)}
                  current={view === p.id}
                  onClick={() => go(p.id)}
                />
              ))}
            </div>
          </div>

          <div className="rail__group">
            <div className="rail__heading">Visual</div>
            <div className="rail__list">
              <RailItem label="Image" status={run.review.image} current={view === "image"} onClick={() => go("image")} />
            </div>
          </div>

          <div className="rail__group" style={{ display: "grid", gap: 8, padding: "0 20px" }}>
            <button
              className="btn btn--primary"
              disabled={approvedCount === 0 || busy === "download"}
              title={approvedCount === 0 ? "Approve at least one piece first" : "Approved pieces as Markdown, plus the image if it's approved (.zip)"}
              onClick={downloadApproved}
            >
              {busy === "download" ? "Preparing…" : "Download approved"}
            </button>
            {run.image && (
              <a className="btn btn--quiet" href={`/api/runs/${run.id}/image?download=1&v=${run.image.file}`} download={run.image.file}>
                Download image
              </a>
            )}
            <button
              className="btn btn--quiet"
              onClick={() => download(`${run.id}.json`, new Blob([JSON.stringify(run, null, 2)], { type: "application/json" }))}
            >
              Download full run (JSON)
            </button>
          </div>
        </nav>

        <main className="stage">
          {error && (
            <p className="error" role="alert" style={{ display: "flex", gap: 12, alignItems: "baseline", marginTop: 0 }}>
              <span style={{ flex: 1 }}>{error}</span>
              <button className="btn btn--quiet" onClick={() => setError(null)}>
                Dismiss
              </button>
            </p>
          )}

          {view === "research" && (
            <>
              <div className="stage__head">
                <h1 className="stage__title">Research and plan</h1>
                <span className="stage__sub">Check this before the drafts: everything below is built on it.</span>
              </div>
              <ResearchView run={run} />
            </>
          )}

          {view === "image" && (
            <>
              <div className="stage__head">
                <h1 className="stage__title">Image</h1>
                <StatusLabel status={run.review.image} />
              </div>
              <ImageView
                key={JSON.stringify(pack.imageBrief)}
                brief={pack.imageBrief}
                imageUrl={imageUrl}
                prompt={run.image?.prompt}
                error={run.imageError}
                busy={busy === "image"}
                onRegenerate={regenerateImage}
              />
              <div className="decision">
                <button
                  className="btn btn--approve"
                  disabled={!run.image || run.review.image === "approved" || busy === "decide"}
                  onClick={() => decide("approved")}
                >
                  {run.review.image === "approved" ? "Approved" : "Approve image"}
                </button>
                <button className="btn" disabled={busy === "decide"} onClick={() => decide("changes")}>
                  Needs changes
                </button>
              </div>
            </>
          )}

          {piece && (
            <>
              <div className="stage__head">
                <h1 className="stage__title">{piece.label}</h1>
                <StatusLabel status={run.review[piece.id]} />
              </div>

              <div className="sheet">
                {editing ? (
                  <Editor piece={piece} onChange={edit} />
                ) : (
                  <Proof
                    piece={piece}
                    pack={pack}
                    marks={marks}
                    imageUrl={imageUrl}
                    imageAlt={pack.imageBrief.altText}
                    activeId={active}
                    onSelect={setActive}
                  />
                )}
              </div>

              <div className="decision">
                {editing ? (
                  <>
                    <button className="btn btn--primary" disabled={!dirty || busy === "save"} onClick={saveEdits}>
                      {busy === "save" ? "Saving…" : "Save edits"}
                    </button>
                    <button
                      className="btn btn--quiet"
                      onClick={() => {
                        setPack(run.pack);
                        setFindings(run.findings);
                        setDirty(false);
                        setEditing(false);
                      }}
                    >
                      Discard edits
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="btn btn--approve"
                      disabled={blocking > 0 || run.review[piece.id] === "approved" || busy === "decide"}
                      onClick={() => decide("approved")}
                    >
                      {run.review[piece.id] === "approved" ? "Approved" : "Approve"}
                    </button>
                    <button className="btn" onClick={() => setEditing(true)}>
                      Edit
                    </button>
                    <button className="btn" onClick={() => setShowRewrite((s) => !s)} aria-expanded={showRewrite}>
                      Ask the agent to rewrite
                    </button>
                    <span className="decision__spacer" />
                    {run.review[piece.id] !== "changes" && (
                      <button className="btn btn--quiet" onClick={() => decide("changes")}>
                        Needs changes
                      </button>
                    )}
                  </>
                )}
              </div>

              {!editing && blocking > 0 && (
                <div className="decision" style={{ marginTop: 8 }}>
                  <span className="decision__hint">
                    {blocking === 1 ? "1 blocking problem" : `${blocking} blocking problems`} to fix before approving.
                  </span>
                  <button
                    className="btn btn--quiet"
                    onClick={() => {
                      if (confirm("Approve with blocking problems? Only do this if you've checked the notes and they're wrong.")) decide("approved");
                    }}
                  >
                    Override and approve
                  </button>
                </div>
              )}

              {showRewrite && !editing && (
                <div className="rewrite">
                  <label className="field__label" htmlFor="rewrite-note">
                    What should change? <span className="field__hint">The agent also fixes every note in the margin.</span>
                  </label>
                  <textarea
                    id="rewrite-note"
                    className="textarea"
                    rows={2}
                    value={note}
                    placeholder="e.g. Lead with the 11 PM interview, and make it warmer"
                    onChange={(e) => setNote(e.target.value)}
                  />
                  <div>
                    <button className="btn btn--primary" disabled={busy === "rewrite"} onClick={rewrite}>
                      {busy === "rewrite" ? "Rewriting…" : "Rewrite this piece"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </main>

        {piece ? (
          <Margin findings={pieceFindings} factIds={piece.factIds} facts={run.research.facts} activeId={active} onSelect={setActive} />
        ) : (
          <aside className="margin" aria-label="About this run">
            <section>
              <h3>Brief</h3>
              <p style={{ fontFamily: "var(--serif)", fontSize: 17, margin: 0 }}>{run.input.topic}</p>
              {run.input.sourceUrl && (
                <p style={{ fontSize: 13, overflowWrap: "anywhere" }}>
                  <a href={run.input.sourceUrl} target="_blank" rel="noreferrer">
                    {run.input.sourceUrl}
                  </a>
                </p>
              )}
              {run.input.notes && <p style={{ fontSize: 13.5, color: "var(--graphite)" }}>{run.input.notes}</p>}
            </section>
            <section>
              <h3>Checks across the pack</h3>
              <p style={{ fontSize: 13.5, margin: 0 }}>
                {findings.filter((f) => f.severity === "block").length} blocking and {findings.filter((f) => f.severity === "warn").length} to
                consider. Open a draft to see its notes.
              </p>
            </section>
          </aside>
        )}
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}

function RailItem({
  label,
  status,
  counts,
  current,
  onClick,
  noStatus = false,
}: {
  noStatus?: boolean;
  label: string;
  status?: ReviewStatus;
  counts?: { block: number; warn: number };
  current: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="rail__item" aria-current={current} onClick={onClick}>
      {noStatus ? <span /> : <span className="status-dot" data-status={status ?? "pending"} aria-label={status ?? "pending"} />}
      <span>{label}</span>
      {counts && (counts.block > 0 || counts.warn > 0) ? (
        <span className="counts">
          {counts.block > 0 && (
            <span className="count count--block" title={`${counts.block} blocking`}>
              {counts.block}
            </span>
          )}
          {counts.warn > 0 && (
            <span className="count count--warn" title={`${counts.warn} to consider`}>
              {counts.warn}
            </span>
          )}
        </span>
      ) : (
        <span />
      )}
    </button>
  );
}

function StatusLabel({ status }: { status?: ReviewStatus }) {
  const text = status === "approved" ? "Approved" : status === "changes" ? "Needs changes" : "Waiting for review";
  return (
    <span className="stage__sub" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <span className="status-dot" data-status={status ?? "pending"} aria-hidden />
      {text}
    </span>
  );
}
