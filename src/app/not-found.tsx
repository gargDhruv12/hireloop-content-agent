import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto grid max-w-[640px] justify-items-start gap-4 px-4 py-16 sm:px-6">
      <h1 className="m-0 text-[clamp(26px,3.4vw,36px)] leading-[1.1] font-extrabold tracking-[-0.02em] text-ink">That pack isn&apos;t here.</h1>
      <p className="m-0 text-base text-muted">
        Without a database (<code>DATABASE_URL</code>), runs are saved in the <code>.data</code> folder of the machine that made them,
        and a redeploy or a different server instance won&apos;t have them. Start a new one instead.
      </p>
      <Link className="btn btn--primary" href="/">
        Start a new pack
      </Link>
    </main>
  );
}
