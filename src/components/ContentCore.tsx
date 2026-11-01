import type { CSSProperties } from "react";

const CHANNELS = [
  { label: "Blog post", mark: "B", color: "#7c5cff" },
  { label: "LinkedIn", mark: "in", color: "#0a66c2" },
  { label: "X thread", mark: "X", color: "#3b3b46" },
  { label: "Instagram", mark: "Ig", color: "#d6249f" },
  { label: "Meta ads", mark: "M", color: "#0866ff" },
  { label: "Google ads", mark: "G", color: "#1a8f4e" },
  { label: "Image", mark: "◐", color: "#e0761f" },
];

/**
 * The hero's 3D picture: one researched brief (the cube) with every channel it
 * becomes orbiting around it. Pure CSS; it holds still under reduced motion.
 */
export function ContentCore() {
  return (
    <div className="core" role="img" aria-label="One researched brief at the centre, with the seven channels it becomes circling it">
      <div className="core__scene">
        <div className="core__glow" />
        <div className="core__ring" />
        <div className="core__cube">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className="core__face" />
          ))}
        </div>
        <div className="core__orbit">
          {CHANNELS.map((c, i) => (
            <span key={c.label} className="core__card" style={{ "--i": i, "--n": CHANNELS.length, "--c": c.color } as CSSProperties}>
              <i>{c.mark}</i>
              {c.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
