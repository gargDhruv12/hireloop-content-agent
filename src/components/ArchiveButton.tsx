"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Archive or restore a pack. Archiving only hides it; nothing is deleted. */
export function ArchiveButton({ id, archived, className = "btn btn--glass" }: { id: string; archived: boolean; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/runs/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ archived: !archived }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError("Couldn't save. Try again.");
    router.refresh();
  }

  return (
    <>
      <button type="button" className={className} disabled={busy} onClick={toggle}>
        {busy ? "Saving…" : archived ? "Restore" : "Archive"}
      </button>
      {error && (
        <span role="alert" className="packs__error">
          {error}
        </span>
      )}
    </>
  );
}
