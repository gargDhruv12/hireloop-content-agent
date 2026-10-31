/**
 * Who is reviewing. src/proxy.ts sets these headers after checking the
 * sign-in, and strips any copy sent from outside, so the app can trust them.
 */
export const REVIEWER_HEADER = "x-hl-reviewer";
export const VERIFIED_HEADER = "x-hl-reviewer-verified";

export interface Reviewer {
  name: string;
  /** True with APP_USERS (own password); false with the shared APP_PASSWORD, where the name is as typed. */
  verified: boolean;
}

export function reviewerFrom(headers: Headers): Reviewer | null {
  const raw = headers.get(REVIEWER_HEADER);
  if (!raw) return null;
  try {
    return { name: decodeURIComponent(raw), verified: headers.get(VERIFIED_HEADER) === "1" };
  } catch {
    return null;
  }
}
