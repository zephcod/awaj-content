import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, expectedToken, safeEqual } from "@/lib/auth";
import { CLIENT_COOKIE, verifyClientToken } from "@/lib/clientsession";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Client portal: needs a valid client session ──
  if (pathname.startsWith("/client")) {
    const token = req.cookies.get(CLIENT_COOKIE)?.value;
    if (token && (await verifyClientToken(token))) {
      return NextResponse.next();
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // ── Team app: shared-password session ──
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (token && safeEqual(token, await expectedToken())) {
    return NextResponse.next();
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Protect everything except the login page, the cron endpoint (it has
  // its own CRON_SECRET auth), the LinkedIn OAuth connect/callback
  // routes (reachable by a client's own Page admin, who may not have —
  // and shouldn't need — our team password), and static assets —
  // including anything served straight out of /public (e.g.
  // awaj-mark.svg on the login screen itself, requested before a
  // session cookie exists).
  matcher: [
    "/((?!login|api/cron|api/linkedin|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpe?g|gif|webp|ico)$).*)",
  ],
};
