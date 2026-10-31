"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Shown when a page crashes while rendering, instead of a blank screen. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="start" style={{ display: "block", maxWidth: 640 }}>
      <h1 className="start__lead">Something went wrong on this page.</h1>
      <p className="start__sub">
        {error.message || "An unexpected error."} Your saved packs are not affected.
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn--primary" onClick={reset}>
          Try again
        </button>
        <Link className="btn" href="/">
          Back to the start
        </Link>
      </div>
    </div>
  );
}
