import Link from "next/link";

export function TopBar({ title, mock, notice }: { title?: string; mock: boolean; notice?: string | null }) {
  return (
    <div className="topbar-wrap">
      <header className="topbar">
        <Link href="/" className="topbar__home">
          <span className="topbar__ring" aria-hidden />
          HireLoop <span className="topbar__product">content desk</span>
        </Link>
        {title ? (
          <span className="topbar__title">{title}</span>
        ) : (
          <nav className="topbar__nav" aria-label="Sections">
            <a href="#brief">New pack</a>
            <a href="#recent">Recent packs</a>
            <a href="#how">How it works</a>
          </nav>
        )}
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
          {title ? (
            <Link className="btn btn--night" href="/">
              New pack
            </Link>
          ) : (
            <a className="btn btn--night" href="#brief">
              Start a pack
            </a>
          )}
        </span>
      </header>
    </div>
  );
}
