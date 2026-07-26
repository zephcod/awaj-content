/**
 * Instagram content publishing via the Graph API.
 *
 * Constraints that shape this module:
 *  - An IG professional account must be linked to the Facebook Page;
 *    it is discovered via `GET /{page-id}?fields=instagram_business_account`.
 *  - IG only accepts a PUBLIC image URL (no direct upload). We host
 *    images as unpublished Facebook page photos and pass the fbcdn URL,
 *    resolved fresh at publish time (fbcdn signatures expire).
 *  - No native scheduling: publish = create container → poll status →
 *    media_publish. Containers expire in 24h, so scheduled posts live
 *    in our own queue (lib/igqueue.ts) until due.
 *  - Rate limit: ~25 API-published posts per IG account per 24h.
 */

import { getPhotoUrl, graph, GraphError, type PageAuth } from "./facebook";

export type IgAccount = {
  id: string;
  username?: string;
  profile_picture_url?: string;
};

export type IgMedia = {
  id: string;
  caption?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
};

/** IG professional account linked to a page, or null when none. */
export async function getIgAccount(page: PageAuth): Promise<IgAccount | null> {
  const res = await graph<{
    instagram_business_account?: IgAccount;
  }>(page.token, page.id, {
    params: {
      fields:
        "instagram_business_account{id,username,profile_picture_url}",
    },
  });
  return res.instagram_business_account ?? null;
}

/** Recent IG media with engagement counts. */
export async function listIgMedia(
  page: PageAuth,
  igUserId: string,
  limit = 12
): Promise<IgMedia[]> {
  const res = await graph<{ data: IgMedia[] }>(page.token, `${igUserId}/media`, {
    params: {
      fields:
        "id,caption,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
      limit: String(limit),
    },
  });
  return res.data ?? [];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Container helpers ─────────────────────────────────────────────

async function createContainer(
  page: PageAuth,
  igUserId: string,
  params: Record<string, string>
): Promise<string> {
  const res = await graph<{ id: string }>(page.token, `${igUserId}/media`, {
    method: "POST",
    params,
  });
  return res.id;
}

/**
 * Poll a container until FINISHED. Images finish in seconds; video
 * (Reels) processing can take minutes, hence the generous ceiling —
 * video publishes run inside the queue worker, never a form submit.
 */
async function waitForContainer(
  page: PageAuth,
  containerId: string,
  { tries, delayMs }: { tries: number; delayMs: number }
): Promise<void> {
  for (let i = 0; i < tries; i++) {
    const status = await graph<{
      status_code?: string;
      status?: string;
    }>(page.token, containerId, { params: { fields: "status_code,status" } });
    if (status.status_code === "FINISHED") return;
    if (status.status_code === "ERROR") {
      throw new GraphError(
        `Instagram could not process the media${status.status ? `: ${status.status}` : "."}`
      );
    }
    await sleep(delayMs);
  }
  throw new GraphError(
    "Instagram media processing timed out — it may still finish; retry from the queue in a few minutes."
  );
}

async function publishContainer(
  page: PageAuth,
  igUserId: string,
  containerId: string
): Promise<{ id: string }> {
  return graph<{ id: string }>(page.token, `${igUserId}/media_publish`, {
    method: "POST",
    params: { creation_id: containerId },
  });
}

// ── Publish flows ─────────────────────────────────────────────────

/**
 * Publish a single-image post NOW. `fbPhotoId` is an unpublished FB
 * page photo used as CDN hosting; its URL is resolved fresh here.
 */
export async function publishImageToIg(
  page: PageAuth,
  igUserId: string,
  opts: { caption: string; fbPhotoId: string }
): Promise<{ id: string }> {
  const imageUrl = await getPhotoUrl(page, opts.fbPhotoId);
  const container = await createContainer(page, igUserId, {
    image_url: imageUrl,
    caption: opts.caption.slice(0, 2200),
  });
  await waitForContainer(page, container, { tries: 10, delayMs: 2000 });
  return publishContainer(page, igUserId, container);
}

/**
 * Publish a 2–10 image carousel NOW. Each image becomes a child
 * container (is_carousel_item), then a CAROUSEL container ties them
 * together. A carousel counts as ONE post toward IG's ~25/day limit.
 */
export async function publishCarouselToIg(
  page: PageAuth,
  igUserId: string,
  opts: { caption: string; fbPhotoIds: string[] }
): Promise<{ id: string }> {
  if (opts.fbPhotoIds.length < 2 || opts.fbPhotoIds.length > 10) {
    throw new GraphError("Instagram carousels need 2–10 images.");
  }
  const children: string[] = [];
  for (const fbPhotoId of opts.fbPhotoIds) {
    const imageUrl = await getPhotoUrl(page, fbPhotoId);
    const child = await createContainer(page, igUserId, {
      image_url: imageUrl,
      is_carousel_item: "true",
    });
    children.push(child);
  }
  for (const child of children) {
    await waitForContainer(page, child, { tries: 10, delayMs: 2000 });
  }
  const carousel = await createContainer(page, igUserId, {
    media_type: "CAROUSEL",
    children: children.join(","),
    caption: opts.caption.slice(0, 2200),
  });
  await waitForContainer(page, carousel, { tries: 10, delayMs: 2000 });
  return publishContainer(page, igUserId, carousel);
}

/**
 * Publish a video as a Reel NOW (shared to feed). `videoUrl` must be a
 * public URL (Appwrite storage — see lib/storage.ts). Processing takes
 * minutes; call this from the queue worker only.
 */
export async function publishReelToIg(
  page: PageAuth,
  igUserId: string,
  opts: { caption: string; videoUrl: string }
): Promise<{ id: string }> {
  const container = await createContainer(page, igUserId, {
    media_type: "REELS",
    video_url: opts.videoUrl,
    caption: opts.caption.slice(0, 2200),
    share_to_feed: "true",
  });
  await waitForContainer(page, container, { tries: 36, delayMs: 10_000 });
  return publishContainer(page, igUserId, container);
}
