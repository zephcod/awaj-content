/**
 * Managed-page resolution + active-page selection.
 *
 * Multi-page mode: FB_SYSTEM_USER_TOKEN + FB_PAGE_IDS. For each page id
 * the Page token is derived via `GET /{page-id}?fields=access_token`
 * (system-user pages don't reliably appear in /me/accounts).
 *
 * Legacy single-page mode: FB_PAGE_ID + FB_PAGE_ACCESS_TOKEN.
 *
 * Results are cached in-process for 10 minutes. The active page is a
 * cookie; it defaults to the first configured page.
 */

import { cookies } from "next/headers";
import { env } from "./env";
import { getPageInfo } from "./facebook";

export type ManagedPage = {
  id: string;
  name: string;
  pictureUrl?: string;
  fanCount?: number;
  /** Page access token — server-side only, never pass to client components. */
  token: string;
};

export const ACTIVE_PAGE_COOKIE = "awaj_fb_active_page";

let cache: { pages: ManagedPage[]; at: number } | null = null;
const TTL_MS = 10 * 60 * 1000;

export async function listPages(): Promise<ManagedPage[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.pages;

  const pages: ManagedPage[] = [];
  const sys = env.systemToken();
  const ids = env.pageIds();

  if (sys && ids.length) {
    // Multi-page: derive each page's token from the system-user token.
    for (const id of ids) {
      const info = await getPageInfo(sys, id, true);
      if (!info.access_token) {
        throw new Error(
          `Page ${id} returned no access token — is it assigned to the system user as an asset?`
        );
      }
      pages.push({
        id: info.id,
        name: info.name,
        pictureUrl: info.picture?.data?.url,
        fanCount: info.fan_count,
        token: info.access_token,
      });
    }
  } else if (env.legacyPageId() && env.legacyPageToken()) {
    // Legacy single-page mode.
    const info = await getPageInfo(env.legacyPageToken(), env.legacyPageId());
    pages.push({
      id: info.id,
      name: info.name,
      pictureUrl: info.picture?.data?.url,
      fanCount: info.fan_count,
      token: env.legacyPageToken(),
    });
  }

  cache = { pages, at: Date.now() };
  return pages;
}

/** The page the user is currently working with (cookie, else first). */
export async function getActivePage(): Promise<ManagedPage | null> {
  const pages = await listPages();
  if (!pages.length) return null;
  const chosen = (await cookies()).get(ACTIVE_PAGE_COOKIE)?.value;
  return pages.find((p) => p.id === chosen) ?? pages[0];
}
