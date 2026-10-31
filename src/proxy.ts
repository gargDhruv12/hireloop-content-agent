import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { REVIEWER_HEADER, VERIFIED_HEADER } from "@/lib/auth/reviewer";

/**
 * Optional sign-in (HTTP Basic auth) on every page and API route. Without it,
 * anyone who can reach a deployed URL could start paid runs or approve content.
 *
 * - APP_USERS="Asha:secret1,Ravi:sha256:<hex>": named reviewers, each with
 *   their own password (plain, or the SHA-256 hex of it). Approvals record
 *   the verified name.
 * - APP_PASSWORD: one shared password, any user name. Approvals record the
 *   name as typed, marked unverified.
 *
 * Leave both empty for local development.
 */
interface User {
  name: string;
  secret: string;
}

export function parseUsers(raw: string | undefined): User[] {
  return (raw ?? "")
    .split(",")
    .map((entry) => {
      const at = entry.indexOf(":");
      return at > 0 ? { name: entry.slice(0, at).trim(), secret: entry.slice(at + 1).trim() } : null;
    })
    .filter((u): u is User => !!u && !!u.name && !!u.secret);
}

export function proxy(req: NextRequest) {
  const users = parseUsers(process.env.APP_USERS);
  const shared = process.env.APP_PASSWORD;
  // The reviewer name is only ever set here: never trust one sent from outside.
  const headers = new Headers(req.headers);
  headers.delete(REVIEWER_HEADER);
  headers.delete(VERIFIED_HEADER);
  const pass = () => NextResponse.next({ request: { headers } });

  if (!users.length && !shared) return pass();

  const cred = basicCredentials(req.headers.get("authorization"));
  if (cred) {
    const user = users.find((u) => u.name.toLowerCase() === cred.name.trim().toLowerCase());
    if (user) {
      if (secretMatches(cred.password, user.secret)) {
        headers.set(REVIEWER_HEADER, encodeURIComponent(user.name));
        headers.set(VERIFIED_HEADER, "1");
        return pass();
      }
    } else if (shared && safeEqual(cred.password, shared)) {
      const typed = cred.name.trim().slice(0, 60);
      if (typed) headers.set(REVIEWER_HEADER, encodeURIComponent(typed));
      return pass();
    }
  }
  return new NextResponse("Sign in to the HireLoop content desk.", {
    status: 401,
    headers: { "www-authenticate": 'Basic realm="HireLoop content desk", charset="UTF-8"' },
  });
}

function basicCredentials(header: string | null): { name: string; password: string } | null {
  const [scheme, encoded] = (header ?? "").split(" ");
  if (scheme !== "Basic" || !encoded) return null;
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const at = decoded.indexOf(":");
  return at < 0 ? null : { name: decoded.slice(0, at), password: decoded.slice(at + 1) };
}

/** A user's secret is the password itself, or "sha256:" and the hex digest of it. */
function secretMatches(given: string, secret: string): boolean {
  if (secret.startsWith("sha256:")) {
    return safeEqual(createHash("sha256").update(given).digest("hex"), secret.slice(7).toLowerCase());
  }
  return safeEqual(given, secret);
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
