"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ClientProfile } from "@/clients/types";
import type { ContentPack, ImageBrief } from "@/lib/content/schemas";
import type { Finding, PieceId, ReviewLogEntry, ReviewStatus, Run } from "@/lib/content/types";
import { getPieces, setField, withPiece } from "@/lib/content/pieces";
import { refreshAfterEdit } from "@/lib/content/findings";
import type { Cost } from "@/lib/ai/pricing";
import { Changes } from "./Changes";
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
  cost = null,
}: {
  initialRun: Run;
  client: Pick<ClientProfile, "bannedPhrases" | "name">;
  /** Worked out on the server, where the rupee rate is configured. */
  cost?: Cost | null;
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
  // The piece as it was before the last "Ask the agent to rewrite", until kept or undone.
  const [before, setBefore] = useState<{ view: View; pack: ContentPack } | null>(null);
  const [showFirstDraft, setShowFirstDraft] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Which way the last tab switch went, so the new view slides in from that side.
  const [dir, setDir] = useState<"forward" | "back" | "none">("none");

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
    const order: View[] = ["research", ...pieces.map((p) => p.id), "image"];
    setDir(order.indexOf(next) > order.indexOf(view) ? "forward" : "back");
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
  const groups: TabGroup[] = [
    { label: "Overview", tabs: [{ id: "research", label: "Research & plan", name: "Research & plan" }] },
    ...CHANNEL_GROUPS.map((g) => ({
      label: g.label,
      tabs: pieces
        .filter((p) => g.match(p.id))
        .map((p) => ({
          id: p.id as View,
          label: g.short ? g.short(p.short) : p.short,
          name: p.label,
          status: run.review[p.id],
          counts: counts(p.id),
        })),
    })),
    { label: "Visual", tabs: [{ id: "image", label: "Image", name: "Image", status: run.review.image }] },
  ];

  return (
    <>
      <div className="desk">
        <PackBar
          groups={groups}
          view={view}
          onGo={go}
          approved={approvedCount}
          total={total}
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
                <a
                  className="btn btn--glass"
                  href={`/api/runs/${run.id}/image?download=1&v=${run.image.file}`}
                  download={run.image.file}
                  title="Download the image"
                >
                  Image
                </a>
              )}
              <button
                className="btn btn--glass"
                title="Download the full run as JSON"
                onClick={() => download(`${run.id}.json`, new Blob([JSON.stringify(run, null, 2)], { type: "application/json" }))}
              >
                JSON
              </button>
            </>
          }
        />

        {/* Keyed by view, so each switch replays the entrance animation from the side you moved towards. */}
        <main className="stage" key={`stage-${view}`} data-dir={dir}>
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
              <ResearchView run={run} cost={cost} />
            </>
          )}

          {view === "image" && (
            <>
              <div className="stage__head">
                <h1 className="stage__title">Image</h1>
                <StatusLabel status={run.review.image} entry={lastDecision(run, "image")} />
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
                <StatusLabel status={run.review[piece.id]} entry={lastDecision(run, piece.id)} />
              </div>

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
          <Margin
            key={`margin-${view}`}
            findings={pieceFindings}
            factIds={piece.factIds}
            facts={run.research.facts}
            activeId={active}
            onSelect={setActive}
          />
        ) : (
          <aside className="margin" aria-label="About this run" tabIndex={0} key={`margin-${view}`}>
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

/** How the drafts are grouped in the tab bar, left to right. */
const CHANNEL_GROUPS: { label: string; match: (id: PieceId) => boolean; short?: (s: string) => string }[] = [
  { label: "Long form", match: (id) => id === "blog" },
  { label: "Social", match: (id) => id === "linkedin" || id === "x" || id === "instagram" },
  { label: "Meta ads", match: (id) => id.startsWith("meta-"), short: (s) => s.replace(/^Meta\s*/, "Ad ") },
  { label: "Google ads", match: (id) => id.startsWith("google-"), short: (s) => s.replace(/^Google\s*/, "Ad ") },
];

interface Tab {
  id: View;
  label: string;
  /** Spoken name: "Ad 1" alone doesn't say which channel. */
  name: string;
  status?: ReviewStatus;
  counts?: { block: number; warn: number };
}

interface TabGroup {
  label: string;
  tabs: Tab[];
}

/**
 * The pack's navigation, across the top: approval progress, downloads, and
 * every piece as a tab, grouped by channel. A violet pill glides to the
 * current tab; arrow keys move between tabs.
 */
function PackBar({
  groups,
  view,
  onGo,
  approved,
  total,
  actions,
}: {
  groups: TabGroup[];
  view: View;
  onGo: (v: View) => void;
  approved: number;
  total: number;
  actions: ReactNode;
}) {
  const track = useRef<HTMLDivElement>(null);
  const tabs = useRef(new Map<View, HTMLButtonElement>());
  const [pill, setPill] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  // No glide on the first paint: the pill should start under the current tab, not fly in from the corner.
  const [glide, setGlide] = useState(false);
  const order = groups.flatMap((g) => g.tabs.map((t) => t.id));
  // Tab widths change when a badge appears or goes, so re-measure when they do.
  const shape = groups.map((g) => g.tabs.map((t) => `${t.label}:${t.counts?.block ?? 0}:${t.counts?.warn ?? 0}`).join()).join("|");
  // Once the page scrolls, fold the top row and labels so only the tabs stay pinned.
  // Different thresholds for folding and unfolding stop it flickering at the edge.
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const onScroll = () => setStuck((was) => (was ? window.scrollY > 8 : window.scrollY > 80));
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useLayoutEffect(() => {
    const box = track.current;
    // Measured from the strip itself (not offsetLeft): an animating group would otherwise
    // become the reference box and put the pill under the wrong tab.
    const measure = () => {
      const el = tabs.current.get(view);
      if (!el || !box) return;
      const a = el.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      setPill({ left: a.left - b.left + box.scrollLeft, top: a.top - b.top + box.scrollTop, width: a.width, height: a.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (box) {
      ro.observe(box);
      // The groups slide in on load; measure again once they've landed.
      box.addEventListener("animationend", measure);
    }
    return () => {
      ro.disconnect();
      box?.removeEventListener("animationend", measure);
    };
  }, [view, shape, stuck]);

  useEffect(() => {
    if (!pill || glide) return;
    const id = requestAnimationFrame(() => setGlide(true));
    return () => cancelAnimationFrame(id);
  }, [pill, glide]);

  // On narrow screens the strip scrolls sideways; keep the current tab in view
  // (centred, instantly on first load, smoothly after a switch).
  const firstScroll = useRef(true);
  useEffect(() => {
    const el = tabs.current.get(view);
    const box = track.current;
    if (!el || !box) return;
    const a = el.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    if (a.left < b.left + 8 || a.right > b.right - 8) {
      const centre = a.left - b.left + box.scrollLeft - (b.width - a.width) / 2;
      box.scrollTo({ left: centre, behavior: firstScroll.current ? "auto" : "smooth" });
    }
    firstScroll.current = false;
  }, [view]);

  function onKeyDown(e: React.KeyboardEvent) {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const jump = e.key === "Home" ? order[0] : e.key === "End" ? order[order.length - 1] : null;
    const next = jump ?? (step ? order[(order.indexOf(view) + step + order.length) % order.length] : null);
    if (!next) return;
    e.preventDefault();
    onGo(next);
    tabs.current.get(next)?.focus();
  }

  const r = 20;
  const circ = 2 * Math.PI * r;

  return (
    <nav className="packbar" aria-label="Content pack" data-stuck={stuck}>
      <div className="packbar__fold">
        <div>
          <div className="packbar__top">
            <div className="packbar__progress">
              <svg className="ring" viewBox="0 0 48 48" aria-hidden>
                <circle className="ring__track" cx="24" cy="24" r={r} />
                <circle
                  className="ring__fill"
                  cx="24"
                  cy="24"
                  r={r}
                  strokeDasharray={circ}
                  strokeDashoffset={circ * (1 - approved / total)}
                  style={{ "--circ": circ } as React.CSSProperties}
                />
              </svg>
              <div>
                <b key={approved} className="packbar__count">
                  {approved} of {total}
                </b>
                <span>approved</span>
              </div>
            </div>
            <div className="packbar__actions">{actions}</div>
          </div>
        </div>
      </div>

      <div className="tabs" ref={track} role="tablist" aria-label="Pieces" onKeyDown={onKeyDown}>
        {pill && <span className="tabs__pill" data-glide={glide} style={{ transform: `translate(${pill.left}px, ${pill.top}px)`, width: pill.width, height: pill.height }} aria-hidden />}
        {groups.map((g, gi) => (
          <div className="tabs__group" key={g.label} style={{ "--i": gi } as React.CSSProperties}>
            <span className="tabs__label" aria-hidden>
              {g.label}
            </span>
            <div className="tabs__row">
              {g.tabs.map((t) => (
                <button
                  key={t.id}
                  ref={(el) => {
                    if (el) tabs.current.set(t.id, el);
                    else tabs.current.delete(t.id);
                  }}
                  type="button"
                  role="tab"
                  className="tab"
                  aria-selected={view === t.id}
                  aria-label={tabName(t)}
                  tabIndex={view === t.id ? 0 : -1}
                  onClick={() => onGo(t.id)}
                >
                  {t.id !== "research" && <span key={t.status} className="status-dot" data-status={t.status ?? "pending"} aria-hidden />}
                  <span>{t.label}</span>
                  {/* Badge numbers are drawn by CSS, not text: the tab's label stays "Instagram", and its spoken name says the count. */}
                  {t.counts && t.counts.block > 0 && (
                    <span className="count count--block" data-n={t.counts.block} aria-hidden title={`${t.counts.block} blocking`} />
                  )}
                  {t.counts && t.counts.warn > 0 && (
                    <span className="count count--warn" data-n={t.counts.warn} aria-hidden title={`${t.counts.warn} to consider`} />
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </nav>
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
    <span className="stage__sub" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <span key={status} className="status-dot" data-status={status ?? "pending"} aria-hidden />
      {text}
    </span>
  );
}
