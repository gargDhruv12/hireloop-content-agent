export default function NotFound() {
  return (
    <div className="start" style={{ display: "block", maxWidth: 640 }}>
      <h1 className="start__lead">That pack isn&apos;t here.</h1>
      <p className="start__sub">
        Runs are saved in the <code>.data</code> folder of the machine that made them. If you deployed or cleared that folder, the run
        is gone. Start a new one instead.
      </p>
      <a className="btn btn--primary" href="/">
        Start a new pack
      </a>
    </div>
  );
}
