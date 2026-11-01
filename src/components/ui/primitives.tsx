import type { ButtonHTMLAttributes, ReactNode } from "react";

// Content Studio's building blocks. Colours come from the --cs-* tokens in globals.css,
// so every piece follows light and dark mode. There's no CSS reset, so margins and
// button borders are cleared here explicitly.

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "soft" | "ghost" | "success" | "danger";

export const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-on-brand hover:bg-brand/90 disabled:bg-brand/60",
  soft: "bg-lilac text-brand-text hover:bg-lilac/70",
  ghost: "bg-transparent text-muted hover:bg-tint hover:text-ink",
  success: "bg-ok text-on-ok hover:bg-ok/90",
  danger: "bg-bad-soft text-bad ring-1 ring-inset ring-bad/40 hover:bg-bad-soft/70",
};

export function buttonClass(variant: ButtonVariant = "primary", size: "sm" | "md" = "md", className?: string) {
  return cn(
    "inline-flex cursor-pointer items-center justify-center gap-2 rounded-[10px] border-0 font-bold no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-60",
    size === "md" ? "px-4 py-2.5 text-sm" : "px-3 py-1.5 text-xs",
    buttonVariants[variant],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export type BadgeTone = "neutral" | "brand" | "success" | "warning" | "danger";

const badgeTones: Record<BadgeTone, string> = {
  neutral: "bg-tint text-muted ring-line",
  brand: "bg-lilac text-brand-text ring-brand-2/30",
  success: "bg-ok-soft text-ok ring-ok/25",
  warning: "bg-warn-soft text-warn ring-warn/30",
  danger: "bg-bad-soft text-bad ring-bad/30",
};

export function Badge({ tone = "neutral", children, title }: { tone?: BadgeTone; children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset", badgeTones[tone])}
    >
      {children}
    </span>
  );
}

export function Card({
  title,
  titleId,
  description,
  icon,
  actions,
  children,
  className,
  bodyClassName,
  id,
}: {
  title: string;
  titleId?: string;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section id={id} aria-label={title} className={cn("scroll-mt-24 rounded-[16px] border border-line bg-bg/90 shadow-[0_1px_0_rgb(255_255_255/0.6)_inset,0_24px_48px_-32px_rgb(40_25_110/0.35)] backdrop-blur-sm", className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-start gap-2.5">
          {icon && <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-linear-to-br from-lilac to-tint text-brand-text ring-1 ring-brand-2/20">{icon}</span>}
          <div className="min-w-0">
            <h2 id={titleId} className="m-0 text-[15px] font-extrabold text-ink">
              {title}
            </h2>
            {description && <p className="m-0 mt-0.5 text-xs text-muted">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** The page column every section lines up on. */
export const wrap = "mx-auto w-full max-w-[1320px] px-4 sm:px-6";

/** The dark band under the header that opens each page. */
export function PageBand({
  eyebrow,
  title,
  titleAs: Title = "h1",
  children,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  /** "p" where the page's h1 sits further down (the review desk names the open piece). */
  titleAs?: "h1" | "p";
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="band border-b border-band-line">
      <div className={cn(wrap, "flex flex-wrap items-end justify-between gap-x-8 gap-y-5 pt-9 pb-8")}>
        <div className="min-w-0 max-w-[72ch]">
          {eyebrow && (
            <span className="glass inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-bold text-band-accent">
              {eyebrow}
            </span>
          )}
          <Title className="band-title m-0 mt-4 text-[clamp(26px,3.4vw,40px)] leading-[1.1] font-extrabold tracking-[-0.02em]">{title}</Title>
          {children && <div className="mt-3 text-base text-band-muted">{children}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </section>
  );
}
