/**
 * Connected LinkedIn organizations, backed by Appwrite (`li_connections`
 * collection — same instance as the IG queue, see scripts/setup-li-db.mjs).
 *
 * Unlike lib/pages.ts (Facebook), there is no token-derivation step from
 * a central system-user token — each row here was written by a Page
 * admin completing OAuth consent (app/api/linkedin/callback/route.ts).
 *
 * SCAFFOLD: written against LinkedIn's documented OAuth/REST shapes but
 * not yet exercised against a real approved app — see README.
 */

import { cookies } from "next/headers";
import { Client, Databases, ID, Query } from "node-appwrite";
import { env } from "./env";
import { refreshAccessToken } from "./linkedinOAuth";

export const LI_CONNECTIONS_COLLECTION = "li_connections";
export const ACTIVE_LI_ORG_COOKIE = "awaj_li_active_org";

export type LiConnection = {
  $id: string;
  /** e.g. "urn:li:organization:12345" */
  orgUrn: string;
  orgName: string;
  accessToken: string;
  accessTokenExpiresAt: number; // unix seconds
  /** Only ever populated under an approved MDP Partner app — see lib/linkedinOAuth.ts. */
  refreshToken?: string;
  refreshTokenExpiresAt?: number;
  connectedByName?: string;
  connectedAt: number;
};

let _db: Databases | null = null;

function db(): Databases {
  if (_db) return _db;
  const client = new Client()
    .setEndpoint(env.appwriteEndpoint())
    .setProject(env.appwriteProjectId())
    .setKey(env.appwriteApiKey());
  _db = new Databases(client);
  return _db;
}

const DB = () => env.appwriteDatabaseId();

export async function listLiConnections(): Promise<LiConnection[]> {
  const res = await db().listDocuments(DB(), LI_CONNECTIONS_COLLECTION, [
    Query.limit(100),
  ]);
  return res.documents as unknown as LiConnection[];
}

export async function getLiConnection(orgUrn: string): Promise<LiConnection | null> {
  const res = await db().listDocuments(DB(), LI_CONNECTIONS_COLLECTION, [
    Query.equal("orgUrn", orgUrn),
    Query.limit(1),
  ]);
  return (res.documents[0] as unknown as LiConnection) ?? null;
}

/** Insert or update the connection for one organization (re-consent updates in place). */
export async function upsertLiConnection(conn: {
  orgUrn: string;
  orgName: string;
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken?: string;
  refreshTokenExpiresAt?: number;
  connectedByName?: string;
}): Promise<void> {
  const existing = await getLiConnection(conn.orgUrn);
  const data = { ...conn, connectedAt: Math.floor(Date.now() / 1000) };
  if (existing) {
    await db().updateDocument(DB(), LI_CONNECTIONS_COLLECTION, existing.$id, data);
  } else {
    await db().createDocument(DB(), LI_CONNECTIONS_COLLECTION, ID.unique(), data);
  }
}

export async function deleteLiConnection(id: string): Promise<void> {
  await db().deleteDocument(DB(), LI_CONNECTIONS_COLLECTION, id);
}

/**
 * A usable access token for this organization, refreshing first if it's
 * near expiry AND a refresh token is on file (MDP Partner tier only —
 * see lib/linkedinOAuth.ts). On Standard tier, an expired token means
 * this throws and the caller should direct someone to reconnect via
 * /api/linkedin/connect; there is nothing to silently refresh.
 */
export async function getValidAccessToken(orgUrn: string): Promise<string> {
  const conn = await getLiConnection(orgUrn);
  if (!conn) throw new Error(`No LinkedIn connection for ${orgUrn}.`);

  const bufferSeconds = 5 * 60; // refresh a bit before real expiry
  const now = Math.floor(Date.now() / 1000);
  if (conn.accessTokenExpiresAt - bufferSeconds > now) {
    return conn.accessToken;
  }

  if (!conn.refreshToken) {
    throw new Error(
      `LinkedIn connection for "${conn.orgName}" has expired and can't be auto-refreshed ` +
        `(no refresh token — Standard-tier apps don't get one). Reconnect via /api/linkedin/connect.`
    );
  }

  const refreshed = await refreshAccessToken(conn.refreshToken);
  const accessTokenExpiresAt = now + refreshed.expires_in;
  const refreshTokenExpiresAt = refreshed.refresh_token_expires_in
    ? now + refreshed.refresh_token_expires_in
    : conn.refreshTokenExpiresAt;
  await upsertLiConnection({
    orgUrn: conn.orgUrn,
    orgName: conn.orgName,
    accessToken: refreshed.access_token,
    accessTokenExpiresAt,
    refreshToken: refreshed.refresh_token ?? conn.refreshToken,
    refreshTokenExpiresAt,
    connectedByName: conn.connectedByName,
  });
  return refreshed.access_token;
}

// ── Active-org selection (mirrors lib/pages.ts's ACTIVE_PAGE_COOKIE) ──

export async function getActiveLiOrg(): Promise<LiConnection | null> {
  const conns = await listLiConnections();
  if (!conns.length) return null;
  const chosen = (await cookies()).get(ACTIVE_LI_ORG_COOKIE)?.value;
  return conns.find((c) => c.orgUrn === chosen) ?? conns[0];
}
