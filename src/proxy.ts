import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { siteConfig } from "@/config/site";

/**
 * Optimistic redirect for signed-out visitors. This only checks that a
 * session cookie EXISTS — it is not a security boundary. Every API route and
 * the admin page re-validate the session (and admin role) server-side.
 */
export function proxy(request: NextRequest) {
  const cookie = getSessionCookie(request, { cookiePrefix: siteConfig.authCookiePrefix });
  if (cookie) return NextResponse.next();
  const url = new URL("/", request.url);
  url.searchParams.set("signin", "1");
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/coach/:path*", "/admin/:path*"],
};
