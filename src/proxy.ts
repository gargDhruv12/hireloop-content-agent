import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Optional team password. When APP_PASSWORD is set, every page and API route
 * asks for it (HTTP Basic auth, any user name). Without it, anyone who can
 * reach a deployed URL could start paid runs or approve content.
 * Leave it empty for local development.
 */
export function proxy(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  const header = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const given = decoded.slice(decoded.indexOf(":") + 1);
    if (safeEqual(given, password)) return NextResponse.next();
  }
  return new NextResponse("Sign in to the HireLoop content desk.", {
    status: 401,
    headers: { "www-authenticate": 'Basic realm="HireLoop content desk", charset="UTF-8"' },
  });
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
