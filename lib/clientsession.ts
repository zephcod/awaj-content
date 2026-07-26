/**
 * Signed client-session tokens for the read-only client portal —
 * same HMAC scheme as the reports app (edge-safe, crypto.subtle only,
 * so it runs in both middleware and server actions).
 *
 * Token format: base64url(payload) + "." + base64url(hmacSha256(payload))
 * Payload: { cid: companyId, pageId, name, exp: unixSeconds }
 *
 * Rotating AUTH_SECRET invalidates every client session.
 */

export const CLIENT_COOKIE = "awaj_sched_client";
export const CLIENT_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export interface ClientSession {
  cid: string; // company document id
  pageId: string; // the FB page this client may view
  name: string; // company display name
  exp: number;
}

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("Missing AUTH_SECRET env var");
  return s;
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(payload: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );
  return new Uint8Array(sig);
}

function safeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function createClientToken(
  cid: string,
  pageId: string,
  name: string
): Promise<string> {
  const session: ClientSession = {
    cid,
    pageId,
    name,
    exp: Math.floor(Date.now() / 1000) + CLIENT_MAX_AGE,
  };
  const payload = b64url(new TextEncoder().encode(JSON.stringify(session)));
  const sig = b64url(await hmac(payload));
  return `${payload}.${sig}`;
}

export async function verifyClientToken(
  token: string
): Promise<ClientSession | null> {
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  try {
    const expected = await hmac(payload);
    if (!safeEqual(b64urlDecode(sig), expected)) return null;
    const session = JSON.parse(
      new TextDecoder().decode(b64urlDecode(payload))
    ) as ClientSession;
    if (!session.cid || !session.pageId || !session.exp) return null;
    if (session.exp < Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}
