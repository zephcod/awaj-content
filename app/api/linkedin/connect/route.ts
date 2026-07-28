/**
 * Starts the LinkedIn OAuth consent flow. Deliberately reachable
 * without our app's own login: the real gate is LinkedIn's own consent
 * screen, since only an actual super-admin of a LinkedIn Page can
 * complete it and have it mean anything. Share this URL directly with a
 * client's Page admin to connect their organization — see README.
 *
 * `state` is a short-lived random value round-tripped through LinkedIn
 * and checked in the callback (CSRF guard on the OAuth handshake).
 */

import { NextResponse } from "next/server";
import { linkedinOAuthConfigured } from "@/lib/env";
import { buildAuthorizationUrl } from "@/lib/linkedinOAuth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!linkedinOAuthConfigured()) {
    return NextResponse.json(
      {
        error:
          "LinkedIn isn't configured yet — set LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, and LINKEDIN_REDIRECT_URI in .env (see README).",
      },
      { status: 503 }
    );
  }
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(buildAuthorizationUrl(state));
  // Short-lived, not tied to our own session — just proves this browser
  // is the one that started the handshake.
  res.cookies.set("awaj_li_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  return res;
}
