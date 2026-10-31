"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

/** The theme in effect: the saved choice on <html>, or else the system setting. */
function current(): Theme {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribe(onChange: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onChange);
  window.addEventListener("themechange", onChange);
  return () => {
    mq.removeEventListener("change", onChange);
    window.removeEventListener("themechange", onChange);
  };
}

/** Switches light and dark, and remembers the choice in this browser. */
export function ThemeToggle() {
  // null on the server: the saved choice is only known in the browser.
  const theme = useSyncExternalStore(subscribe, current, () => null);
  const next: Theme = theme === "dark" ? "light" : "dark";

  function toggle() {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* private mode: the choice lasts for this page only */
    }
    window.dispatchEvent(new Event("themechange"));
  }

  return (
    <button
      type="button"
      className="btn btn--glass theme-toggle"
      onClick={toggle}
      aria-label={theme ? `Switch to ${next} mode` : "Switch colour theme"}
      title={theme ? `Switch to ${next} mode` : undefined}
    >
      <span aria-hidden>{theme === "dark" ? "☀" : theme === "light" ? "☾" : ""}</span>
    </button>
  );
}
