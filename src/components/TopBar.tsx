export function TopBar({ title, mock, notice }: { title?: string; mock: boolean; notice?: string | null }) {
  return (
    <header className="topbar">
      <a href="/" className="topbar__home">
        <span className="topbar__ring" aria-hidden />
        HireLoop content desk
      </a>
      <span className="topbar__title">{title}</span>
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
        {title && (
          <a className="btn" href="/">
            New pack
          </a>
        )}
      </span>
    </header>
  );
}
