/**
 * LinkedIn OAuth 2.0 (3-legged) — SCAFFOLD, unverified pending LinkedIn's
 * Community Management API approval (see README's LinkedIn section).
 *
 * This is a fundamentally different auth model from Meta's: there is no
 * system-user token that can be issued once and assigned to many pages.
 * Every LinkedIn organization must be "connected" by a human who is a
 * super-admin of that organization's LinkedIn Page, clicking through the
 * consent screen themselves. That connection's tokens are then stored
 * per-organization in Appwrite (lib/linkedinOrgs.ts), not in an env var.
 *
 * Token lifetimes (Standard developer tier, i.e. not an approved
 * Marketing Developer Platform partner):
 *  - access_token:  60 days
 *  - refresh_token: NOT issued at all on Standard tier — LinkedIn's
 *    OAuth response simply omits `refresh_token`. That means, without
 *    MDP Partner status, someone has to manually reconnect every
 *    connected organization roughly every 60 days. lib/linkedinOrgs.ts
 *    tracks `accessTokenExpiresAt` so the UI can surface "reconnect
 *    needed" before that happens, rather than failing silently.
 *  - If/when MDP Partner status is granted, refresh_token becomes
 *    available (valid ~1 year, itself rotated on each refresh) and
 *    `refreshAccessToken` below starts actually being reachable in
 *    practice — the code path already exists so no rework is needed.
 */

import { env } from "./env";

const AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const API_BASE = "https://api.linkedin.com/rest";

/**
 * Scopes needed to read which organizations a member administers and to
 * post/read on behalf of those organizations. Exact scope names are
 * granted per-product in the LinkedIn Developer Portal (Products tab) —
 * confirm these are still current there before going live; LinkedIn has
 * renamed permissions before (e.g. w_organization_social).
 */
export const LINKEDIN_SCOPES = [
  "r_organization_admin",
  "w_organization_social",
  "r_organization_social",
] as const;

export class LinkedInAuthError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "LinkedInAuthError";
  }
}

/** Build the URL to send a Page admin's browser to for consent. */
export function buildAuthorizationUrl(state: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env.linkedinClientId());
  url.searchParams.set("redirect_uri", env.linkedinRedirectUri());
  url.searchParams.set("scope", LINKEDIN_SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

export type LinkedInTokenResponse = {
  access_token: string;
  expires_in: number; // seconds
  refresh_token?: string; // absent on Standard tier — see module doc
  refresh_token_expires_in?: number;
  scope?: string;
};

async function postForm(body: Record<string, string>): Promise<LinkedInTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as
    | (LinkedInTokenResponse & { error?: string; error_description?: string })
    | null;
  if (!res.ok || !json?.access_token) {
    throw new LinkedInAuthError(
      json?.error_description ?? `LinkedIn token request failed (HTTP ${res.status})`,
      res.status
    );
  }
  return json;
}

/** Exchange the authorization `code` from the callback for tokens. */
export async function exchangeCodeForToken(code: string): Promise<LinkedInTokenResponse> {
  return postForm({
    grant_type: "authorization_code",
    code,
    redirect_uri: env.linkedinRedirectUri(),
    client_id: env.linkedinClientId(),
    client_secret: env.linkedinClientSecret(),
  });
}

/**
 * Refresh an access token. Only reachable if a refresh_token was issued
 * in the first place (MDP Partner tier — see module doc). Calling this
 * on Standard tier is a logic error the caller should have already
 * guarded against by checking for a stored refresh token.
 */
export async function refreshAccessToken(refreshToken: string): Promise<LinkedInTokenResponse> {
  return postForm({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: env.linkedinClientId(),
    client_secret: env.linkedinClientSecret(),
  });
}

export type LinkedInOrgSummary = { urn: string; name: string };

/**
 * Organizations the just-authenticated member administers, via the
 * organizationAcls finder. Used right after OAuth callback to let the
 * connecting admin pick which of their Pages to save (usually one, but
 * a client could conceivably administer more than one Page).
 */
export async function fetchAdminOrganizations(
  accessToken: string
): Promise<LinkedInOrgSummary[]> {
  const url = new URL(`${API_BASE}/organizationAcls`);
  url.searchParams.set("q", "roleAssignee");
  url.searchParams.set("role", "ADMINISTRATOR");
  url.searchParams.set("state", "APPROVED");
  url.searchParams.set("projection", "(elements*(organization~(id,localizedName)))");

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "LinkedIn-Version": env.linkedinApiVersion(),
      "X-Restli-Protocol-Version": "2.0.0",
    },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as {
    elements?: { ["organization~"]?: { id: number; localizedName: string } }[];
    message?: string;
  } | null;
  if (!res.ok) {
    throw new LinkedInAuthError(
      json?.message ?? `Could not list administered organizations (HTTP ${res.status})`,
      res.status
    );
  }
  return (json?.elements ?? [])
    .map((el) => el["organization~"])
    .filter((org): org is { id: number; localizedName: string } => Boolean(org))
    .map((org) => ({ urn: `urn:li:organization:${org.id}`, name: org.localizedName }));
}
