/**
 * Minimal shared-password auth. Edge-safe (no Node-only imports) so it
 * can be used from both middleware and server actions.
 *
 * The session cookie holds a SHA-256 token derived from AUTH_SECRET +
 * APP_PASSWORD. Without knowing both, the token can't be forged.
 * Rotating either env var invalidates all sessions.
 */

export const AUTH_COOKIE = "awaj_fb_auth";
export const AUTH_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function expectedToken(): Promise<string> {
  const secret = process.env.AUTH_SECRET;
  const password = process.env.APP_PASSWORD;
  if (!secret || !password) {
    throw new Error("Missing AUTH_SECRET or APP_PASSWORD env var");
  }
  const data = new TextEncoder().encode(`${secret}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
