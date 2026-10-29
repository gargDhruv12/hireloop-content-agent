export function TopBar({ title, mock, model }: { title?: string; mock: boolean; model: string }) {
  return (
    <header className="topbar">
      <a href="/" className="topbar__home">
        <span className="topbar__ring" aria-hidden />
        HireLoop content desk
      </a>
      <span className="topbar__title">{title}</span>
      <span className="topbar__meta">
        {mock ? (
          <span className="tag tag--offline" title="MOCK_AI=1: no API calls, sample output">
            Offline sample mode
          </span>
        ) : (
          <span className="tag">{model}</span>
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
