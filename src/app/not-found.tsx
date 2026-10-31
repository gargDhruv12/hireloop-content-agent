import Link from "next/link";

export default function NotFound() {
  return (
    <div className="start" style={{ display: "block", maxWidth: 640 }}>
      <h1 className="start__lead">That pack isn&apos;t here.</h1>
      <p className="start__sub">
        Without a database (<code>DATABASE_URL</code>), runs are saved in the <code>.data</code> folder of the machine that made them,
        and a redeploy or a different server instance won&apos;t have them. Start a new one instead.
      </p>
      <Link className="btn btn--primary" href="/">
        Start a new pack
      </Link>
    </div>
  );
}
