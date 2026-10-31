"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArchiveButton } from "./ArchiveButton";
import { Badge, buttonClass, cn } from "./ui/primitives";

export interface PackRow {
  id: string;
  topic: string;
  createdAt: string;
  approved: number;
  total: number;
  blocking: number;
  archived: boolean;
  cost: string | null;
}

const FILTERS = [
  { id: "active", label: "All", test: (r: PackRow) => !r.archived },
  { id: "waiting", label: "Waiting for review", test: (r: PackRow) => !r.archived && r.approved < r.total },
  { id: "done", label: "Fully approved", test: (r: PackRow) => !r.archived && r.approved === r.total },
  { id: "blocking", label: "Has blocking notes", test: (r: PackRow) => !r.archived && r.blocking > 0 },
  { id: "archived", label: "Archived", test: (r: PackRow) => r.archived },
] as const;

/** Every pack, searchable by topic, with filters and archive. */
export function PacksList({ rows }: { rows: PackRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("active");

  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const test = FILTERS.find((f) => f.id === filter)!.test;
    return rows.filter((r) => test(r) && words.every((w) => r.topic.toLowerCase().includes(w)));
  }, [rows, query, filter]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="sr-only" htmlFor="pack-search">
          Search packs by topic
        </label>
        <input
          id="pack-search"
          className="block w-full max-w-sm rounded-[10px] border border-line bg-bg px-3.5 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand-2/30"
          type="search"
          placeholder="Search by topic…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter packs">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-colors",
                filter === f.id ? "border-brand bg-brand text-on-brand" : "border-line bg-bg text-muted hover:border-brand-2/60 hover:text-ink",
              )}
            >
              {f.label} <span className="tabular-nums">{rows.filter(f.test).length}</span>
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="m-0 rounded-xl border border-dashed border-line bg-panel px-4 py-10 text-center text-sm text-muted">
          {rows.length === 0 ? "No packs yet. Start one from the home page." : "No packs match."}
        </p>
      ) : (
        <ul className="m-0 list-none divide-y divide-line overflow-hidden rounded-xl border border-line p-0">
          {shown.map((r) => (
            <li key={r.id} className="packrow flex items-center gap-3 bg-bg pr-3 transition-colors hover:bg-tint">
              <Link href={`/runs/${r.id}`} className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3 text-ink no-underline">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{r.topic}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · {r.approved} of{" "}
                    {r.total} approved
                    {r.blocking ? ` · ${r.blocking} blocking` : ""}
                    {r.cost ? ` · ${r.cost}` : ""}
                  </span>
                </span>
                <span className="hidden h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-lilac sm:block" aria-hidden>
                  <span className="block h-full rounded-full bg-ok" style={{ width: `${(r.approved / r.total) * 100}%` }} />
                </span>
                {r.archived ? (
                  <Badge>Archived</Badge>
                ) : r.approved === r.total ? (
                  <Badge tone="success">Approved</Badge>
                ) : r.blocking > 0 ? (
                  <Badge tone="danger">Blocking</Badge>
                ) : (
                  <Badge tone="warning">In review</Badge>
                )}
              </Link>
              <ArchiveButton id={r.id} archived={r.archived} className={buttonClass("ghost", "sm")} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
