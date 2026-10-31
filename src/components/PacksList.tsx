"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArchiveButton } from "./ArchiveButton";

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
    <div className="packs glass">
      <div className="packs__tools">
        <label className="visually-hidden" htmlFor="pack-search">
          Search packs by topic
        </label>
        <input
          id="pack-search"
          className="input packs__search"
          type="search"
          placeholder="Search by topic…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="packs__filters" role="group" aria-label="Filter packs">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className="packs__chip" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label} <span>{rows.filter(f.test).length}</span>
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="packs__empty">{rows.length === 0 ? "No packs yet. Start one from the home page." : "No packs match."}</p>
      ) : (
        <ul className="packs__list">
          {shown.map((r, i) => (
            <li key={r.id} className="packrow" style={{ "--i": Math.min(i, 12) } as React.CSSProperties}>
              <Link href={`/runs/${r.id}`} className="packrow__main">
                <span className="packrow__topic">{r.topic}</span>
                <span className="packrow__meta">
                  {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} · {r.approved} of{" "}
                  {r.total} approved
                  {r.blocking ? ` · ${r.blocking} blocking` : ""}
                  {r.cost ? ` · ${r.cost}` : ""}
                </span>
                <span className="packrow__bar" aria-hidden>
                  <span style={{ width: `${(r.approved / r.total) * 100}%` }} />
                </span>
              </Link>
              <ArchiveButton id={r.id} archived={r.archived} className="btn btn--quiet" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
