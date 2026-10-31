"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ClientProfile } from "@/clients/types";
import type { ContentPack, ImageBrief } from "@/lib/content/schemas";
import type { Finding, PieceId, ReviewLogEntry, ReviewStatus, Run, SendLogEntry } from "@/lib/content/types";
import { getPieces, setField, withPiece } from "@/lib/content/pieces";
import { refreshAfterEdit } from "@/lib/content/findings";
import { formatInr, type Cost } from "@/lib/ai/pricing";
import { SENDABLE } from "@/lib/scheduler-pieces";
import { Changes } from "./Changes";
import { Proof } from "./Proof";
import { Margin } from "./Margin";
import { Editor } from "./Editor";
import { ResearchView } from "./ResearchView";
import { ImageView } from "./ImageView";
import type { Mark } from "./Marked";
import { ArchiveButton } from "./ArchiveButton";
import { Badge, PageBand, cn, wrap } from "./ui/primitives";

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
  cost = null,
  scheduler = null,
}: {
  initialRun: Run;
  client: Pick<ClientProfile, "bannedPhrases" | "name" | "brand" | "ctaPattern" | "primaryCta">;
  /** Worked out on the server, where the rupee rate is configured. */
  cost?: Cost | null;
  /** The scheduler's name when SCHEDULER_WEBHOOK_URL is set; null hides "Send … as a draft". */
  scheduler?: string | null;
  initialView?: View;
}) {
  const [run, setRun] = useState(initialRun);
  const [pack, setPack] = useState<ContentPack>(initialRun.pack);
  const [findings, setFindings] = useState<Finding[]>(initialRun.findings);
  const [view, setView] = useState<View>(initialView);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "save" | "rewrite" | "image" | "decide" | "download" | "send">(null);
  const [note, setNote] = useState("");
  const [showRewrite, setShowRewrite] = useState(false);
  // The piece as it was before the last "Ask the agent to rewrite", until kept or undone.
  const [before, setBefore] = useState<{ view: View; pack: ContentPack } | null>(null);
  const [showFirstDraft, setShowFirstDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const pieces = useMemo(() => getPieces(pack), [pack]);
  const piece = pieces.find((p) => p.id === view);
  const pieceFindings = useMemo(() => findings.filter((f) => f.pieceId === view), [findings, view]);
  // Pieces the agent rewrote during self-revision can be compared with the first draft.
  const firstDraftPiece =
    piece && run.firstDraft && run.revision?.pieces.includes(piece.id) ? getPieces(run.firstDraft).find((p) => p.id === piece.id) : undefined;
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
    if (next === view) return;
    if (dirty && !confirm("You have unsaved edits. Leave them?")) return;
    if (dirty) {
      setPack(run.pack);
      setFindings(run.findings);
      setDirty(false);
    }
    setView(next);
    window.history.replaceState(null, "", `?view=${next}`);
    // A new piece starts at its top, not wherever the last one was scrolled to.
    if (window.scrollY > 0) window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    setEditing(false);
    setShowRewrite(false);
    setShowFirstDraft(false);
    setBefore(null);
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
    // Kept so the reviewer can see what changed, and go back.
    const previous = run.pack;
    const out = await api(`/api/runs/${run.id}/pieces/${view}`, "POST", { note }, "Rewrite failed.");
    setBusy(null);
    if ("error" in out) return setError(out.error);
    const data = out.run;
    setRun(data);
    setPack(data.pack);
    setFindings(data.findings);
    setNote("");
    setShowRewrite(false);
    setBefore({ view, pack: previous });
    setToast("Rewritten and re-checked");
  }

  /** Send the approved post to the team's scheduler as a draft. Failed attempts are recorded too. */
  async function sendToScheduler() {
    setBusy("send");
    setError(null);
    const res = await fetch(`/api/runs/${run.id}/pieces/${view}/send`, { method: "POST" }).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;
    setBusy(null);
    const updated = (res?.ok ? data : data?.run) as Run | undefined;
    if (updated?.id) setRun(updated);
    if (!res?.ok) return setError(data?.error ?? "Couldn't reach the server to send.");
    setToast(`Sent to ${scheduler} as a draft`);
  }

  /** Put the version from before the last rewrite back, re-checked and pending review. */
  async function undoRewrite() {
    if (!before || before.view !== view) return;
    setBusy("save");
    const saved = await patch({ pack: withPiece(run.pack, before.pack, view as PieceId), review: { [view]: "pending" } });
    setBusy(null);
    if (!saved) return;
    setPack(saved.pack);
    setFindings(saved.findings);
    setBefore(null);
    setToast("Back to the previous version");
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

  const total = pieces.length + 1;
  // Ads show as "Ad 1" under a "Meta" or "Google" label; their spoken names say which.
  const tab = (p: (typeof pieces)[number], label = p.label): Tab => ({ id: p.id, label, name: p.label, status: run.review[p.id], counts: counts(p.id) });
  const ads = (prefix: string) => pieces.filter((p) => p.id.startsWith(prefix)).map((p) => tab(p, p.label.replace(/^\w+ ad/, "Ad")));
  const groups: TabGroup[] = [
    { label: "Overview", tabs: [{ id: "research", label: "Research & plan", name: "Research & plan" }] },
    { label: "Drafts", tabs: pieces.filter((p) => !/^(meta|google)-/.test(p.id)).map((p) => tab(p)) },
    { label: "Meta", tabs: ads("meta-"), showLabel: true },
    { label: "Google", tabs: ads("google-"), showLabel: true },
    { label: "Visual", tabs: [{ id: "image", label: "Image", name: "Image", status: run.review.image }] },
  ];

  const meta = [
    new Date(run.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
    run.input.audience,
    cost ? `${formatInr(cost.inr)} to make` : null,
  ].filter(Boolean);

  return (
    <>
      <PageBand
        eyebrow={<>● Content pack · {client.name.replace(/ \(sample\)$/, "")}</>}
        title={run.input.topic}
        titleAs="p"
        actions={
          <>
            <button
              className="btn btn--primary"
              disabled={approvedCount === 0 || busy === "download"}
              title={approvedCount === 0 ? "Approve at least one piece first" : "Approved pieces as Markdown, plus the image if it's approved (.zip)"}
              onClick={downloadApproved}
            >
              {busy === "download" ? "Preparing…" : "Download approved"}
            </button>
            {run.image && (
              <a className="btn" href={`/api/runs/${run.id}/image?download=1&v=${run.image.file}`} download={run.image.file}>
                Download image
              </a>
            )}
            <button className="btn" onClick={() => download(`${run.id}.json`, new Blob([JSON.stringify(run, null, 2)], { type: "application/json" }))}>
              Full run (JSON)
            </button>
            {!run.archived && <ArchiveButton id={run.id} archived={false} className="btn btn--quiet" />}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <span className="text-muted">{meta.join(" · ")}</span>
          <span className="inline-flex items-center gap-2.5">
            <span className="text-ink">
              <b>
                {approvedCount} of {total}
              </b>{" "}
              approved
            </span>
            <span
              className="h-1.5 w-32 overflow-hidden rounded-full bg-lilac"
              role="progressbar"
              aria-label="Pieces approved"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={approvedCount}
            >
              <span className="block h-full rounded-full bg-ok transition-[width] duration-300" style={{ width: `${(approvedCount / total) * 100}%` }} />
            </span>
          </span>
        </div>
      </PageBand>

      <div className={cn(wrap, "py-6")}>
        <section aria-label="Content pack" className="rounded-[14px] border border-line bg-bg shadow-card">
          <PieceTabs groups={groups} view={view} onGo={go} />

          <div className="grid grid-cols-1 gap-6 p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="stage min-w-0">
              {error && (
                <div role="alert" className="mb-4 flex items-start gap-3 rounded-xl border border-bad/30 bg-bad-soft px-4 py-3 text-sm text-bad">
                  <span className="flex-1 font-semibold">{error}</span>
                  <button className="btn btn--quiet" onClick={() => setError(null)}>
                    Dismiss
                  </button>
                </div>
              )}

              {view === "research" && (
                <>
                  <StageHead title="Research and plan">
                    <span className="text-sm text-muted">Check this before the drafts: everything below is built on it.</span>
                  </StageHead>
                  <ResearchView run={run} cost={cost} />
                </>
              )}

              {view === "image" && (
                <>
                  <StageHead title="Image">
                    <StatusLabel status={run.review.image} entry={lastDecision(run, "image")} />
                  </StageHead>
                  <ImageView
                    key={JSON.stringify(pack.imageBrief)}
                    brief={pack.imageBrief}
                    imageUrl={imageUrl}
                    prompt={run.image?.prompt}
                    error={run.imageError}
                    busy={busy === "image"}
                    onRegenerate={regenerateImage}
                  />
                  <ReviewBar label="Image">
                    <button className="btn" disabled={busy === "decide"} onClick={() => decide("changes")}>
                      Needs changes
                    </button>
                    <button
                      className="btn btn--approve"
                      disabled={!run.image || run.review.image === "approved" || busy === "decide"}
                      onClick={() => decide("approved")}
                    >
                      {run.review.image === "approved" ? "Approved" : "Approve image"}
                    </button>
                  </ReviewBar>
                </>
              )}

              {piece && (
                <>
                  <StageHead title={piece.label}>
                    <StatusLabel status={run.review[piece.id]} entry={lastDecision(run, piece.id)} />
                  </StageHead>

                  {!editing && before?.view === piece.id && (
                    <div className="sheet">
                      <Changes
                        title="What the rewrite changed"
                        before={getPieces(before.pack).find((p) => p.id === piece.id)?.fields ?? []}
                        after={piece.fields}
                        actions={
                          <>
                            <button className="btn btn--primary" onClick={() => setBefore(null)}>
                              Keep the rewrite
                            </button>
                            <button className="btn btn--glass" disabled={busy === "save"} onClick={undoRewrite}>
                              {busy === "save" ? "Going back…" : "Go back to the previous version"}
                            </button>
                          </>
                        }
                      />
                    </div>
                  )}

                  {!editing && before?.view !== piece.id && firstDraftPiece && (
                    <div className="sheet">
                      <button className="btn btn--quiet changes__toggle" aria-expanded={showFirstDraft} onClick={() => setShowFirstDraft((s) => !s)}>
                        {showFirstDraft ? "Hide the first draft" : "The agent fixed this piece itself. Compare with the first draft"}
                      </button>
                      {showFirstDraft && <Changes title="What self-revision changed" before={firstDraftPiece.fields} after={piece.fields} />}
                    </div>
                  )}

                  <div className="sheet">
                    {editing ? (
                      <Editor piece={piece} onChange={edit} />
                    ) : (
                      <Proof
                        brand={{ ...client.brand, name: client.name.replace(/ \(sample\)$/, "") }}
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

                  <ReviewBar label={piece.label}>
                    {editing ? (
                      <>
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
                        <button className="btn btn--primary" disabled={!dirty || busy === "save"} onClick={saveEdits}>
                          {busy === "save" ? "Saving…" : "Save edits"}
                        </button>
                      </>
                    ) : (
                      <>
                        {run.review[piece.id] !== "changes" && (
                          <button className="btn btn--quiet" onClick={() => decide("changes")}>
                            Needs changes
                          </button>
                        )}
                        <button className="btn" onClick={() => setShowRewrite((s) => !s)} aria-expanded={showRewrite}>
                          Ask the agent to rewrite
                        </button>
                        <button className="btn" onClick={() => setEditing(true)}>
                          Edit
                        </button>
                        {scheduler && SENDABLE.includes(piece.id) && run.review[piece.id] === "approved" && (
                          <button className="btn btn--glass" disabled={busy === "send"} onClick={sendToScheduler}>
                            {busy === "send" ? "Sending…" : `Send to ${scheduler} as a draft`}
                          </button>
                        )}
                        <button
                          className="btn btn--approve"
                          disabled={blocking > 0 || run.review[piece.id] === "approved" || busy === "decide"}
                          onClick={() => decide("approved")}
                        >
                          {run.review[piece.id] === "approved" ? "Approved" : "Approve"}
                        </button>
                      </>
                    )}
                  </ReviewBar>

                  {!editing && lastSend(run, piece.id) && <SendStatus entry={lastSend(run, piece.id)!} />}

                  {!editing && blocking > 0 && (
                    <div className="sheet mt-2 flex flex-wrap items-center justify-end gap-2">
                      <span className="text-[13px] font-semibold text-bad">
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
            </div>

            {piece ? (
              <Margin
                key={`margin-${view}`}
                findings={pieceFindings}
                factIds={piece.factIds}
                facts={run.research.facts}
                activeId={active}
                onSelect={setActive}
              />
            ) : (
              <aside className="margin self-start" aria-label="About this run" tabIndex={0} key={`margin-${view}`}>
                <section>
                  <h3>Brief</h3>
                  <p className="m-0 font-serif text-[17px] leading-snug text-ink">{run.input.topic}</p>
                  {run.input.sourceUrl && (
                    <p className="text-[13px] [overflow-wrap:anywhere]">
                      <a href={run.input.sourceUrl} target="_blank" rel="noreferrer">
                        {run.input.sourceUrl}
                      </a>
                    </p>
                  )}
                  {run.input.notes && <p className="text-[13.5px] text-muted">{run.input.notes}</p>}
                </section>
                <section>
                  <h3>Checks across the pack</h3>
                  <p className="m-0 text-[13.5px]">
                    {findings.filter((f) => f.severity === "block").length} blocking and {findings.filter((f) => f.severity === "warn").length} to
                    consider. Open a draft to see its notes.
                  </p>
                </section>
              </aside>
            )}
          </div>
        </section>
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}

interface Tab {
  id: View;
  label: string;
  /** Spoken name; starts with the visible label. */
  name: string;
  status?: ReviewStatus;
  counts?: { block: number; warn: number };
}

interface TabGroup {
  label: string;
  tabs: Tab[];
  /** Shown before the tabs, for groups whose tabs are only numbered. */
  showLabel?: boolean;
}

/** The open piece's name, with its review status beside it. */
function StageHead({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line pb-4">
      <h1 className="m-0 text-[22px] font-extrabold tracking-[-0.01em] text-ink">{title}</h1>
      {children}
    </div>
  );
}

/** Content Studio's review bar: what you're deciding on, then the actions. */
function ReviewBar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      role="group"
      aria-label={`Human review for ${label}`}
      className="sheet mt-5 flex flex-col gap-3 rounded-[14px] border border-line bg-panel p-3.5 sm:flex-row sm:items-center sm:justify-between"
    >
      <span className="text-sm font-bold text-ink">Human review</span>
      <div className="flex flex-wrap gap-2 sm:justify-end">{children}</div>
    </div>
  );
}

/**
 * Every piece of the pack as tabs along the top (overview, drafts, visual), with
 * Content Studio's underline. Arrow keys move between pieces.
 */
function PieceTabs({ groups, view, onGo }: { groups: TabGroup[]; view: View; onGo: (v: View) => void }) {
  const tabs = useRef(new Map<View, HTMLButtonElement>());
  const order = groups.flatMap((g) => g.tabs.map((t) => t.id));

  // The strip scrolls sideways when it doesn't fit: keep the open piece in view.
  useEffect(() => {
    tabs.current.get(view)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [view]);

  function onKeyDown(e: React.KeyboardEvent) {
    const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0;
    const jump = e.key === "Home" ? order[0] : e.key === "End" ? order[order.length - 1] : null;
    const next = jump ?? (step ? order[(order.indexOf(view) + step + order.length) % order.length] : null);
    if (!next) return;
    e.preventDefault();
    onGo(next);
    tabs.current.get(next)?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Pieces"
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className="flex items-stretch overflow-x-auto overflow-y-hidden border-b border-line px-2 [scrollbar-width:thin] sm:px-3"
    >
      {groups.map((g, gi) => (
        <div key={g.label} className="flex items-stretch">
          {gi > 0 && <span aria-hidden className="mx-1.5 my-3.5 w-px shrink-0 bg-line" />}
          {g.showLabel && (
            <span aria-hidden className="self-center pr-1 pl-1 text-[11px] font-extrabold tracking-[.06em] text-muted uppercase">
              {g.label}
            </span>
          )}
          {g.tabs.map((t) => {
            const selected = view === t.id;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  if (el) tabs.current.set(t.id, el);
                  else tabs.current.delete(t.id);
                }}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-label={tabName(t)}
                tabIndex={selected ? 0 : -1}
                onClick={() => onGo(t.id)}
                className={cn(
                  "-mb-px flex shrink-0 cursor-pointer items-center gap-1.5 border-0 border-b-2 border-solid bg-transparent px-2.5 py-3.5 text-[13px] font-bold whitespace-nowrap transition-colors",
                  selected ? "border-brand text-brand-text" : "border-transparent text-muted hover:text-ink",
                )}
              >
                {t.id !== "research" && <span className="status-dot" data-status={t.status ?? "pending"} aria-hidden />}
                {t.label}
                {t.counts && (t.counts.block > 0 || t.counts.warn > 0) && (
                  <span className="counts" aria-hidden>
                    {/* Numbers drawn by CSS, not text: the visible label stays the label; the spoken name has the counts. */}
                    {t.counts.block > 0 && <span className="count count--block" data-n={t.counts.block} title={`${t.counts.block} blocking`} />}
                    {t.counts.warn > 0 && <span className="count count--warn" data-n={t.counts.warn} title={`${t.counts.warn} to consider`} />}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** The tab's full spoken name; its dot and badges are hidden from screen readers because this says it all. */
function tabName(t: Tab): string {
  const parts = [t.name];
  if (t.id !== "research") parts.push(t.status === "approved" ? "approved" : t.status === "changes" ? "needs changes" : "waiting for review");
  if (t.counts?.block) parts.push(`${t.counts.block} blocking`);
  if (t.counts?.warn) parts.push(`${t.counts.warn} to consider`);
  return parts.join(", ");
}

/** The latest recorded decision on a piece, for "Approved by …". */
function lastDecision(run: Run, piece: PieceId | "image"): ReviewLogEntry | undefined {
  return run.reviewLog?.filter((e) => e.piece === piece).at(-1);
}

function StatusLabel({ status, entry }: { status?: ReviewStatus; entry?: ReviewLogEntry }) {
  const base = status === "approved" ? "Approved" : status === "changes" ? "Needs changes" : "Waiting for review";
  // Only when the log's latest decision is this status; names typed with the shared password say so.
  const by = entry?.by && entry.status === status && status !== "pending" ? ` by ${entry.by}${entry.byVerified ? "" : " (unverified)"}` : "";
  const text = base + by;
  return (
    <Badge tone={status === "approved" ? "success" : status === "changes" ? "danger" : "warning"}>
      <span key={status} className="status-dot" data-status={status ?? "pending"} aria-hidden />
      {text}
    </Badge>
  );
}

function lastSend(run: Run, piece: PieceId): SendLogEntry | undefined {
  return run.sendLog?.filter((e) => e.piece === piece).at(-1);
}

function SendStatus({ entry }: { entry: SendLogEntry }) {
  const when = new Date(entry.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const by = entry.by ? ` by ${entry.by}${entry.byVerified ? "" : " (unverified)"}` : "";
  return (
    <p className="sheet send-status mt-3 text-[13px]" data-ok={entry.ok}>
      {entry.ok ? `Sent to ${entry.to} as a draft, ${when}${by}.` : `Sending to ${entry.to} failed, ${when}: ${entry.error ?? "unknown error"}`}
    </p>
  );
}
