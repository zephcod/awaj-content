export const env = {
  /** System-user token (multi-page mode). Empty string when unset. */
  systemToken: () => process.env.FB_SYSTEM_USER_TOKEN ?? "",

  /** Page ids to manage: FB_PAGE_IDS (comma-separated) or legacy FB_PAGE_ID. */
  pageIds: (): string[] => {
    const raw = process.env.FB_PAGE_IDS ?? process.env.FB_PAGE_ID ?? "";
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  },

  /** Legacy single-page mode. */
  legacyPageId: () => process.env.FB_PAGE_ID ?? "",
  legacyPageToken: () => process.env.FB_PAGE_ACCESS_TOKEN ?? "",

  graphVersion: () => process.env.FB_GRAPH_VERSION ?? "v23.0",

  // ── Appwrite (Instagram scheduling queue) ──
  appwriteEndpoint: () => process.env.APPWRITE_ENDPOINT ?? "",
  appwriteProjectId: () => process.env.APPWRITE_PROJECT_ID ?? "",
  appwriteApiKey: () => process.env.APPWRITE_API_KEY ?? "",
  appwriteDatabaseId: () => process.env.APPWRITE_DATABASE_ID ?? "",

  cronSecret: () => process.env.CRON_SECRET ?? "",
};

/** True when the Appwrite queue (IG scheduling) is configured. */
export function igQueueConfigured(): boolean {
  return Boolean(
    env.appwriteEndpoint() &&
      env.appwriteProjectId() &&
      env.appwriteApiKey() &&
      env.appwriteDatabaseId()
  );
}

/**
 * True when Facebook credentials are present, in either mode:
 *  - multi-page:  FB_SYSTEM_USER_TOKEN + FB_PAGE_IDS (or FB_PAGE_ID)
 *  - single-page: FB_PAGE_ID + FB_PAGE_ACCESS_TOKEN
 */
export function fbConfigured(): boolean {
  const multi = Boolean(env.systemToken()) && env.pageIds().length > 0;
  const legacy = Boolean(env.legacyPageId() && env.legacyPageToken());
  return multi || legacy;
}
