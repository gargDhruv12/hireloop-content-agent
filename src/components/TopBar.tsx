import Link from "next/link";
import { headers } from "next/headers";
import { reviewerFrom } from "@/lib/auth/reviewer";
import { ThemeToggle } from "./ThemeToggle";

/** The app bar on every page: product, the two main places, status tags, who's signed in. */
export async function TopBar({ title, mock, notice }: { title?: string; mock: boolean; notice?: string | null }) {
  const reviewer = reviewerFrom(await headers());
  return (
    <header className="topbar">
      <Link href="/" className="topbar__home">
        <span className="topbar__ring" aria-hidden />
        HireLoop <span className="topbar__product">Content desk</span>
      </Link>
      <nav className="topbar__nav" aria-label="Main">
        <Link href="/">New pack</Link>
        <Link href="/packs">All packs</Link>
      </nav>
      {title && <span className="topbar__title">{title}</span>}
      <span className="topbar__meta">
        {notice && (
          <span className="tag tag--offline" title={notice} role="status">
            Packs won&apos;t be kept
          </span>
        )}
        {mock && (
          <span className="tag tag--offline" title="MOCK_AI=1: no API calls, sample output">
            Offline sample mode
          </span>
        )}
        {reviewer && (
          <span className="topbar__who" title={reviewer.verified ? "Signed in" : "Signed in with the shared password; the name isn't verified"}>
            {reviewer.name}
            {!reviewer.verified && " (unverified)"}
          </span>
        )}
        <ThemeToggle />
      </span>
    </header>
  );
}
