"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "./primitives";

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Fades its content up the first time it scrolls into view. The page is only
 * marked for motion once this runs, so without the script nothing stays hidden.
 */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    document.documentElement.dataset.motion = "";
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        node.dataset.shown = "";
        io.disconnect();
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={el} className={cn("reveal", className)} style={{ "--delay": `${delay}ms` } as CSSProperties}>
      {children}
    </div>
  );
}

/**
 * Counts a stat up from zero when it comes into view ("₹12.40" → animates the 12.40).
 * Screen readers get the final value only.
 */
export function CountUp({ value }: { value: string }) {
  const el = useRef<HTMLSpanElement>(null);
  const match = /^(\D*)([\d,]+(?:\.\d+)?)(.*)$/.exec(value);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const node = el.current;
    if (!node || !match || reduced()) return;
    const [, pre, num, post] = match;
    const target = Number(num.replace(/,/g, ""));
    const decimals = num.includes(".") ? num.split(".")[1].length : 0;
    const format = (n: number) =>
      pre + n.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + post;
    let frame = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / 900);
        setShown(format(target * (1 - Math.pow(1 - t, 3))));
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });
    io.observe(node);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
    // The value is the only input; match is derived from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <>
      <span ref={el} aria-hidden className="tabular-nums">
        {shown}
      </span>
      <span className="sr-only">{value}</span>
    </>
  );
}
