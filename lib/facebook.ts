/**
 * Meta Graph API client for Facebook Page post scheduling.
 *
 * Scheduling model: "Facebook native". Posts are created with
 * `published=false` + `scheduled_publish_time` and Facebook itself
 * publishes them at the requested time — no cron needed on our side.
 *
 * Multi-page: every operation takes a `PageAuth` ({ id, token }) so the
 * app can manage any number of pages. Page tokens are resolved from the
 * system-user token in lib/pages.ts.
 *
 * Graph constraints: scheduled_publish_time must be between 10 minutes
 * and 75 days from the time of the API call.
 */

import { env } from "./env";

const GRAPH = "https://graph.facebook.com";

// ── Types ─────────────────────────────────────────────────────────

/** Credentials for one page: its id and a Page access token. */
export type PageAuth = { id: string; token: string };

export type PageInfo = {
  id: string;
  name: string;
  picture?: { data?: { url?: string } };
  fan_count?: number;
  link?: string;
  access_token?: string;
};

export type ScheduledPost = {
  id: string;
  message?: string;
  created_time: string;
  scheduled_publish_time: number; // unix seconds
  full_picture?: string;
};

export type PublishedPost = {
  id: string;
  message?: string;
  created_time: string;
  permalink_url?: string;
  full_picture?: string;
  reactions?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
  shares?: { count?: number };
};

export class GraphError extends Error {
  constructor(message: string, public code?: number) {
    super(message);
    this.name = "GraphError";
  }
}

// ── Scheduling window ─────────────────────────────────────────────

export const MIN_SCHEDULE_MS = 10 * 60 * 1000; // 10 minutes
export const MAX_SCHEDULE_MS = 75 * 24 * 60 * 60 * 1000; // 75 days

export function validateScheduleTime(unixSeconds: number): string | null {
  const delta = unixSeconds * 1000 - Date.now();
  if (delta < MIN_SCHEDULE_MS)
    return "Scheduled time must be at least 10 minutes from now.";
  if (delta > MAX_SCHEDULE_MS)
    return "Scheduled time can be at most 75 days from now.";
  return null;
}

// ── Low-level fetch helper ────────────────────────────────────────

export async function graph<T>(
  token: string,
  path: string,
  init: {
    method?: "GET" | "POST" | "DELETE";
    /** URL query params (token is added automatically). */
    params?: Record<string, string>;
    /** Multipart body for file uploads (token appended automatically). */
    form?: FormData;
  } = {}
): Promise<T> {
  const url = new URL(`${GRAPH}/${env.graphVersion()}/${path}`);
  for (const [k, v] of Object.entries(init.params ?? {})) {
    url.searchParams.set(k, v);
  }

  let body: FormData | undefined;
  if (init.form) {
    init.form.set("access_token", token);
    body = init.form;
  } else {
    url.searchParams.set("access_token", token);
  }

  const res = await fetch(url, {
    method: init.method ?? "GET",
    body,
    cache: "no-store",
  });

  const json = (await res.json().catch(() => null)) as {
    error?: { message?: string; code?: number };
  } | null;

  if (!res.ok || json?.error) {
    throw new GraphError(
      json?.error?.message ?? `Graph API request failed (HTTP ${res.status})`,
      json?.error?.code
    );
  }
  return json as T;
}

// ── Page ──────────────────────────────────────────────────────────

/**
 * Page metadata. With `withToken`, also asks Graph for the page's own
 * access token — this is how page tokens are derived from a system-user
 * token (`GET /{page-id}?fields=access_token`).
 */
export async function getPageInfo(
  token: string,
  pageId: string,
  withToken = false
): Promise<PageInfo> {
  const fields = withToken
    ? "id,name,picture{url},fan_count,link,access_token"
    : "id,name,picture{url},fan_count,link";
  return graph<PageInfo>(token, pageId, { params: { fields } });
}

// ── Create posts ──────────────────────────────────────────────────

/**
 * Text (or link) post to the Page feed. If `scheduledAt` (unix seconds)
 * is given, the post is created unpublished and Facebook publishes it
 * at that time.
 */
export async function createTextPost(
  page: PageAuth,
  opts: { message: string; link?: string; scheduledAt?: number }
): Promise<{ id: string }> {
  const params: Record<string, string> = { message: opts.message };
  if (opts.link) params.link = opts.link;
  if (opts.scheduledAt) {
    params.published = "false";
    params.scheduled_publish_time = String(opts.scheduledAt);
  }
  return graph<{ id: string }>(page.token, `${page.id}/feed`, {
    method: "POST",
    params,
  });
}

/**
 * Upload a photo to the page WITHOUT publishing it. Returns the photo
 * id (media_fbid). Used both for FB feed posts (attached_media) and as
 * CDN hosting for Instagram (IG requires a public image URL).
 */
export async function uploadUnpublishedPhoto(
  page: PageAuth,
  photo: File
): Promise<{ id: string }> {
  const form = new FormData();
  form.set("source", photo, photo.name || "photo.jpg");
  form.set("published", "false");
  return graph<{ id: string }>(page.token, `${page.id}/photos`, {
    method: "POST",
    form,
  });
}

/**
 * Public CDN URL of an uploaded photo (largest rendition). fbcdn URLs
 * carry expiring signatures, so resolve this fresh right before use —
 * don't store the URL long-term, store the photo id.
 */
export async function getPhotoUrl(
  page: PageAuth,
  photoId: string
): Promise<string> {
  const res = await graph<{ images?: { source: string; width: number }[] }>(
    page.token,
    photoId,
    { params: { fields: "images" } }
  );
  const best = (res.images ?? []).sort((a, b) => b.width - a.width)[0];
  if (!best) throw new GraphError(`Photo ${photoId} has no renditions.`);
  return best.source;
}

/**
 * Feed post with one or more already-uploaded photos attached
 * (immediate or scheduled). Multiple ids produce a multi-photo
 * (carousel-style) page post. Creating a real /feed post (rather than
 * scheduling on /photos) makes scheduled photo posts visible in
 * Business Suite's Planner.
 */
export async function createFeedPostWithMedia(
  page: PageAuth,
  opts: { caption: string; mediaFbids: string[]; scheduledAt?: number }
): Promise<{ id: string }> {
  const params: Record<string, string> = {
    attached_media: JSON.stringify(
      opts.mediaFbids.map((id) => ({ media_fbid: id }))
    ),
  };
  if (opts.caption) params.message = opts.caption;
  if (opts.scheduledAt) {
    params.published = "false";
    params.scheduled_publish_time = String(opts.scheduledAt);
  }
  return graph<{ id: string }>(page.token, `${page.id}/feed`, {
    method: "POST",
    params,
  });
}

/**
 * Video post to the page (immediate or scheduled — /videos supports
 * native scheduling like /feed). Uses the graph-video host, which Meta
 * requires for video uploads. Direct multipart upload is good for
 * files up to ~1 GB.
 */
export async function createVideoPost(
  page: PageAuth,
  opts: { description: string; video: File; scheduledAt?: number }
): Promise<{ id: string }> {
  const url = new URL(
    `https://graph-video.facebook.com/${env.graphVersion()}/${page.id}/videos`
  );
  const form = new FormData();
  form.set("access_token", page.token);
  form.set("source", opts.video, opts.video.name || "video.mp4");
  if (opts.description) form.set("description", opts.description);
  if (opts.scheduledAt) {
    form.set("published", "false");
    form.set("scheduled_publish_time", String(opts.scheduledAt));
  }
  const res = await fetch(url, { method: "POST", body: form });
  const json = (await res.json().catch(() => null)) as {
    id?: string;
    error?: { message?: string; code?: number };
  } | null;
  if (!res.ok || json?.error || !json?.id) {
    throw new GraphError(
      json?.error?.message ?? `Video upload failed (HTTP ${res.status})`,
      json?.error?.code
    );
  }
  return { id: json.id };
}

// ── Read posts ────────────────────────────────────────────────────

export async function listScheduledPosts(
  page: PageAuth
): Promise<ScheduledPost[]> {
  const res = await graph<{ data: ScheduledPost[] }>(
    page.token,
    `${page.id}/scheduled_posts`,
    {
      params: {
        fields: "id,message,created_time,scheduled_publish_time,full_picture",
        limit: "100",
      },
    }
  );
  return (res.data ?? []).sort(
    (a, b) => a.scheduled_publish_time - b.scheduled_publish_time
  );
}

export async function listPublishedPosts(
  page: PageAuth
): Promise<PublishedPost[]> {
  const res = await graph<{ data: PublishedPost[] }>(
    page.token,
    `${page.id}/published_posts`,
    {
      params: {
        fields:
          "id,message,created_time,permalink_url,full_picture," +
          "reactions.summary(total_count).limit(0)," +
          "comments.summary(total_count).limit(0),shares",
        limit: "25",
      },
    }
  );
  return res.data ?? [];
}

// ── Manage scheduled posts ────────────────────────────────────────

export async function reschedulePost(
  page: PageAuth,
  postId: string,
  scheduledAt: number
): Promise<void> {
  await graph(page.token, postId, {
    method: "POST",
    params: { scheduled_publish_time: String(scheduledAt) },
  });
}

export async function publishNow(page: PageAuth, postId: string): Promise<void> {
  await graph(page.token, postId, {
    method: "POST",
    params: { is_published: "true" },
  });
}

export async function deletePost(page: PageAuth, postId: string): Promise<void> {
  await graph(page.token, postId, { method: "DELETE" });
}
