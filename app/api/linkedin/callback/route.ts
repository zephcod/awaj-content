/**
 * LinkedIn OAuth callback. Exchanges the authorization code for tokens,
 * looks up which organization(s) the consenting admin manages, and
 * saves a connection for each (see lib/linkedinOrgs.ts).
 *
 * SCAFFOLD — exact response shapes are unverified pending LinkedIn's
 * API approval (see README). This route is intentionally outside the
 * app's own auth middleware (middleware.ts matcher excludes
 * /api/linkedin) since the browser landing here belongs to whichever
 * Page admin just completed LinkedIn's own consent screen, not
 * necessarily a team member logged into this app.
 */

import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken, fetchAdminOrganizations } from "@/lib/linkedinOAuth";
import { upsertLiConnection } from "@/lib/linkedinOrgs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const error = searchParams.get("error");
  if (error) {
    return NextResponse.json(
      { error: searchParams.get("error_description") ?? error },
      { status: 400 }
    );
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const expectedState = req.cookies.get("awaj_li_oauth_state")?.value;
  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.json({ error: "Invalid or expired LinkedIn OAuth state." }, { status: 400 });
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const token = await exchangeCodeForToken(code);
    const orgs = await fetchAdminOrganizations(token.access_token);

    if (orgs.length === 0) {
      return NextResponse.json(
        {
          error:
            "Signed in, but LinkedIn didn't return any organization you administer. " +
            "Make sure you're a super-admin of the Page you're connecting, and that the " +
            "LinkedIn app has been granted the Community Management API product.",
        },
        { status: 422 }
      );
    }

    for (const org of orgs) {
      await upsertLiConnection({
        orgUrn: org.urn,
        orgName: org.name,
        accessToken: token.access_token,
        accessTokenExpiresAt: now + token.expires_in,
        refreshToken: token.refresh_token,
        refreshTokenExpiresAt: token.refresh_token_expires_in
          ? now + token.refresh_token_expires_in
          : undefined,
      });
    }

    // Don't redirect into /settings/linkedin — it sits behind the team
    // password, which a client's Page admin has no reason to have.
    // Confirm success right here instead; the team can verify the new
    // connection from /settings/linkedin themselves afterward.
    const names = orgs.map((o) => o.name).join(", ");
    const html = `<!doctype html><html><body style="font-family:sans-serif;max-width:32rem;margin:3rem auto;text-align:center">
      <h1>LinkedIn connected</h1>
      <p>${names} ${orgs.length > 1 ? "are" : "is"} now connected to Awaj ET's scheduler. You can close this tab.</p>
    </body></html>`;
    const res = new NextResponse(html, { headers: { "Content-Type": "text/html" } });
    res.cookies.delete("awaj_li_oauth_state");
    return res;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "LinkedIn connection failed." },
      { status: 500 }
    );
  }
}
