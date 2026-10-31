"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Shown when a page crashes while rendering, instead of a blank screen. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" className="mx-auto grid max-w-[640px] gap-4 px-4 py-16 sm:px-6">
      <h1 className="m-0 text-[clamp(26px,3.4vw,36px)] leading-[1.1] font-extrabold tracking-[-0.02em] text-ink">Something went wrong on this page.</h1>
      <p className="m-0 text-base text-muted">
        {error.message || "An unexpected error."} Your saved packs are not affected.
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn--primary" onClick={reset}>
          Try again
        </button>
        <Link className="btn" href="/">
          Back to the start
        </Link>
      </div>
    </main>
  );
}
