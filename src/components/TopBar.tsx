import Link from "next/link";
import { headers } from "next/headers";
import { reviewerFrom } from "@/lib/auth/reviewer";
import { SparklesIcon } from "./ui/icons";
import { Badge, cn, wrap } from "./ui/primitives";
import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { href: "/", label: "New pack", id: "new" },
  { href: "/packs", label: "All packs", id: "packs" },
] as const;

/** The app bar on every page: product, the two main places, status tags, who's signed in. */
export async function TopBar({
  current,
  mock,
  notice,
}: {
  /** Which nav link is the page you're on. */
  current?: (typeof NAV)[number]["id"];
  mock: boolean;
  notice?: string | null;
}) {
  const reviewer = reviewerFrom(await headers());
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-bg focus:px-3 focus:py-2 focus:text-sm focus:text-ink"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur-[8px]">
        <div className={cn(wrap, "flex h-16 items-center gap-3 sm:gap-6")}>
          <Link href="/" className="flex shrink-0 items-center gap-2.5 text-ink no-underline">
            <span className="grid size-[34px] place-items-center rounded-[10px] bg-brand text-on-brand">
              <SparklesIcon />
            </span>
            <span className="leading-tight">
              <span className="block text-[16px] font-extrabold">Content Studio</span>
              <span className="hidden text-xs text-muted sm:block">HireLoop content agent</span>
            </span>
          </Link>

          <nav aria-label="Main" className="flex items-center gap-1">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={current === n.id ? "page" : undefined}
                className={cn(
                  "rounded-[10px] px-3 py-2 text-sm font-bold whitespace-nowrap no-underline transition-colors",
                  current === n.id ? "bg-lilac text-brand-text" : "text-muted hover:bg-tint hover:text-ink",
                  // The logo already goes home; on phones the space keeps the theme button on screen.
                  n.id === "new" && "max-sm:hidden",
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex min-w-0 items-center gap-2">
            {notice && (
              <span role="status" title={notice} className="max-md:hidden">
                <Badge tone="warning">Packs won&apos;t be kept</Badge>
              </span>
            )}
            {mock && (
              <span title="MOCK_AI=1: no API calls, sample output" className="max-md:hidden">
                <Badge tone="warning">Offline sample mode</Badge>
              </span>
            )}
            <span className="hidden items-center gap-2 rounded-full border border-line bg-bg px-3 py-1.5 text-[13px] font-bold text-brand-text lg:inline-flex">
              <span aria-hidden className="size-2 rounded-full bg-ok" />
              Client: HireLoop
            </span>
            {reviewer && (
              <span
                className="hidden max-w-[16ch] truncate text-sm font-semibold text-muted sm:inline"
                title={reviewer.verified ? "Signed in" : "Signed in with the shared password; the name isn't verified"}
              >
                {reviewer.name}
                {!reviewer.verified && " (unverified)"}
              </span>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>
    </>
  );
}
