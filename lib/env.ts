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

  // ── Appwrite (Instagram + LinkedIn scheduling queues) ──
  appwriteEndpoint: () => process.env.APPWRITE_ENDPOINT ?? "",
  appwriteProjectId: () => process.env.APPWRITE_PROJECT_ID ?? "",
  appwriteApiKey: () => process.env.APPWRITE_API_KEY ?? "",
  appwriteDatabaseId: () => process.env.APPWRITE_DATABASE_ID ?? "",

  cronSecret: () => process.env.CRON_SECRET ?? "",

  // ── LinkedIn (Community Management API) ──
  // Standard 3-legged OAuth — unlike Meta there's no system-user token;
  // each connected organization's tokens are stored in Appwrite
  // (lib/linkedinOrgs.ts) after its own Page admin completes consent.
  linkedinClientId: () => process.env.LINKEDIN_CLIENT_ID ?? "",
  linkedinClientSecret: () => process.env.LINKEDIN_CLIENT_SECRET ?? "",
  /** Must exactly match a redirect URL registered on the LinkedIn app. */
  linkedinRedirectUri: () => process.env.LINKEDIN_REDIRECT_URI ?? "",
  /**
   * LinkedIn versions its REST API by month (YYYYMM). Bump this as
   * LinkedIn deprecates older versions — check the Community Management
   * API docs before changing, since request/response shapes can shift
   * between versions.
   */
  linkedinApiVersion: () => process.env.LINKEDIN_API_VERSION ?? "202506",
  /** Appwrite bucket id for staging LinkedIn media until publish time. */
  liMediaBucketId: () => process.env.LI_MEDIA_BUCKET_ID ?? "",

  /**
   * Public URL of the sister blog app (e.g. https://blog.awajet.com), used
   * only to link out to a live post from the /blog list here. Optional —
   * the blog feature works without it, just without the "View live" link.
   */
  blogSiteUrl: () => (process.env.BLOG_SITE_URL ?? "").replace(/\/$/, ""),
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
 * True when the Facebook scheduling queue can be used. Facebook posts
 * no longer use Facebook's own scheduler (see lib/fbqueue.ts) — every
 * scheduled FB post relies on this same Appwrite instance. No separate
 * bucket var needed: staged media shares storage.ts's MEDIA_BUCKET.
 */
export function fbQueueConfigured(): boolean {
  return Boolean(
    env.appwriteEndpoint() &&
      env.appwriteProjectId() &&
      env.appwriteApiKey() &&
      env.appwriteDatabaseId()
  );
}

/**
 * True when the blog-post scheduling feature can be used. Blog posts live
 * in the `blog_posts` collection of the same shared Appwrite database the
 * sister blog-app reads from (see lib/blog.ts) — no separate credentials
 * needed beyond what the IG/FB queues already require.
 */
export function blogConfigured(): boolean {
  return Boolean(
    env.appwriteEndpoint() &&
      env.appwriteProjectId() &&
      env.appwriteApiKey() &&
      env.appwriteDatabaseId()
  );
}

/** True when the LinkedIn OAuth app credentials are present. */
export function linkedinOAuthConfigured(): boolean {
  return Boolean(
    env.linkedinClientId() &&
      env.linkedinClientSecret() &&
      env.linkedinRedirectUri()
  );
}

/**
 * True when the LinkedIn scheduling queue can be used. LinkedIn has no
 * native scheduling (same constraint as Instagram), so every scheduled
 * LinkedIn post — and every post with media, since uploads are staged —
 * relies on this same Appwrite instance plus a dedicated media bucket.
 */
export function liQueueConfigured(): boolean {
  return Boolean(
    env.appwriteEndpoint() &&
      env.appwriteProjectId() &&
      env.appwriteApiKey() &&
      env.appwriteDatabaseId() &&
      env.liMediaBucketId()
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
