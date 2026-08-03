/**
 * Instagram scheduling queue, backed by Appwrite (same instance as the
 * leadgen app). Facebook holds its own schedule natively; Instagram
 * can't, so queued IG posts live here until due and are published by
 * `processDueIgPosts()` — driven by the in-process worker
 * (instrumentation.ts) and/or the cron route (/api/cron/ig).
 *
 * All media (image, carousel photos, Reel video, Reel cover) is staged
 * in the shared Appwrite bucket (lib/storage.ts) at compose time —
 * `mediaRefs` is always Appwrite file ids, never a Facebook photo id
 * (an earlier version borrowed FB's unpublished-page-photo mechanism
 * instead; that was fragile — see lib/instagram.ts's header comment).
 */

import { Client, Databases, ID, Query } from "node-appwrite";
import { env, igQueueConfigured } from "./env";
import {
  publishCarouselToIg,
  publishImageToIg,
  publishReelToIg,
  publishStoryToIg,
} from "./instagram";
import { listPages } from "./pages";
import { deleteIgMedia, mediaUrl } from "./storage";

export const IG_QUEUE_COLLECTION = "ig_queue";

export type IgMediaType =
  | "image"
  | "carousel"
  | "reel"
  | "storyImage"
  | "storyVideo";

export type IgQueueItem = {
  $id: string;
  pageId: string;
  igUserId: string;
  igUsername?: string;
  /** Ignored for storyImage/storyVideo — Stories don't take a caption via the API. */
  caption: string;
  /** First media ref (kept for schema compat; see mediaRefs). */
  fbPhotoId: string;
  /** "image" (default for legacy rows) | "carousel" | "reel" | "storyImage" | "storyVideo" */
  mediaType?: IgMediaType;
  /** JSON array of Appwrite file ids: photo(s) for image/carousel, single file for reel/story. */
  mediaRefs?: string;
  /** Appwrite file id of a custom Reel cover image, if one was provided. */
  thumbRef?: string;
  scheduledAt: number; // unix seconds
  status: "pending" | "approved" | "publishing" | "published" | "failed";
  error?: string;
  igMediaId?: string;
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

// ── Queue CRUD ────────────────────────────────────────────────────

export async function enqueueIgPost(item: {
  pageId: string;
  igUserId: string;
  igUsername?: string;
  caption: string;
  mediaType: IgMediaType;
  /** Appwrite file ids: photo(s) for image/carousel, video for reel. */
  mediaRefs: string[];
  /** Appwrite file id of a custom Reel cover image (reel only, optional). */
  thumbRef?: string;
  scheduledAt: number;
}): Promise<void> {
  const { mediaRefs, ...rest } = item;
  await db().createDocument(DB(), IG_QUEUE_COLLECTION, ID.unique(), {
    ...rest,
    caption: item.caption.slice(0, 2200),
    fbPhotoId: mediaRefs[0], // satisfies the original required attribute
    mediaRefs: JSON.stringify(mediaRefs),
    status: "pending",
  });
}

/** Pending + failed items for one page, soonest first. */
export async function listIgQueue(pageId: string): Promise<IgQueueItem[]> {
  const res = await db().listDocuments(DB(), IG_QUEUE_COLLECTION, [
    Query.equal("pageId", pageId),
    Query.notEqual("status", "published"),
    Query.orderAsc("scheduledAt"),
    Query.limit(100),
  ]);
  return res.documents as unknown as IgQueueItem[];
}

export async function rescheduleIgItem(
  id: string,
  scheduledAt: number
): Promise<void> {
  await db().updateDocument(DB(), IG_QUEUE_COLLECTION, id, {
    scheduledAt,
    status: "pending",
    error: null,
  });
}

/**
 * Edit a queued post's caption and/or media before it publishes.
 * Always resets status to "pending" (and clears any error), so an
 * edited item — including one that previously failed — becomes
 * eligible to publish again on the next due-post pass. Doesn't delete
 * old staged media itself; callers that replace mediaRefs own cleaning
 * up the files those old refs pointed to (see app/actions.ts's
 * editIgQueued, which deletes them only after the new refs are saved).
 */
export async function editIgItem(
  id: string,
  updates: {
    caption?: string;
    mediaRefs?: string[];
    mediaType?: IgMediaType;
  }
): Promise<void> {
  const patch: Record<string, unknown> = { status: "pending", error: null };
  if (updates.caption !== undefined) patch.caption = updates.caption.slice(0, 2200);
  if (updates.mediaRefs !== undefined) {
    patch.mediaRefs = JSON.stringify(updates.mediaRefs);
    patch.fbPhotoId = updates.mediaRefs[0]; // keep legacy-compat field in sync
  }
  if (updates.mediaType !== undefined) patch.mediaType = updates.mediaType;
  await db().updateDocument(DB(), IG_QUEUE_COLLECTION, id, patch);
}

/**
 * Directly set an item's status — an escape hatch for the /scheduled UI
 * (e.g. resetting a stuck "publishing" item to "pending" without
 * waiting for the 45-min auto-reclaim, or manually marking something
 * "published"/"failed" when it was actually handled outside the app).
 * Does not touch staged media or trigger a real publish attempt.
 */
export async function setIgItemStatus(
  id: string,
  status: IgQueueItem["status"]
): Promise<void> {
  await db().updateDocument(DB(), IG_QUEUE_COLLECTION, id, { status });
}

export async function deleteIgItem(id: string): Promise<void> {
  const doc = (await db().getDocument(
    DB(),
    IG_QUEUE_COLLECTION,
    id
  )) as unknown as IgQueueItem;
  await db().deleteDocument(DB(), IG_QUEUE_COLLECTION, id);
  const refs: string[] = doc.mediaRefs ? JSON.parse(doc.mediaRefs) : [];
  for (const ref of refs) await deleteIgMedia(ref);
  if (doc.thumbRef) await deleteIgMedia(doc.thumbRef);
}

// ── Publisher ─────────────────────────────────────────────────────

async function publishItem(item: IgQueueItem): Promise<void> {
  // Claim it (best-effort lock against double-publish)
  await db().updateDocument(DB(), IG_QUEUE_COLLECTION, item.$id, {
    status: "publishing",
  });
  try {
    const page = (await listPages()).find((p) => p.id === item.pageId);
    if (!page) throw new Error(`Page ${item.pageId} is not configured.`);

    const type: IgMediaType = item.mediaType ?? "image";
    const refs: string[] = item.mediaRefs
      ? JSON.parse(item.mediaRefs)
      : [item.fbPhotoId];

    let res: { id: string };
    if (type === "carousel") {
      res = await publishCarouselToIg(page, item.igUserId, {
        caption: item.caption,
        imageUrls: refs.map(mediaUrl),
      });
    } else if (type === "reel") {
      res = await publishReelToIg(page, item.igUserId, {
        caption: item.caption,
        videoUrl: mediaUrl(refs[0]),
        coverUrl: item.thumbRef ? mediaUrl(item.thumbRef) : undefined,
      });
    } else if (type === "storyImage") {
      res = await publishStoryToIg(page, item.igUserId, {
        imageUrl: mediaUrl(refs[0]),
      });
    } else if (type === "storyVideo") {
      res = await publishStoryToIg(page, item.igUserId, {
        videoUrl: mediaUrl(refs[0]),
      });
    } else {
      res = await publishImageToIg(page, item.igUserId, {
        caption: item.caption,
        imageUrl: mediaUrl(refs[0]),
      });
    }

    await db().updateDocument(DB(), IG_QUEUE_COLLECTION, item.$id, {
      status: "published",
      igMediaId: res.id,
      error: null,
    });
    // Hosting no longer needed once IG has fetched and processed it.
    for (const ref of refs) await deleteIgMedia(ref);
    if (item.thumbRef) await deleteIgMedia(item.thumbRef);
  } catch (e) {
    await db().updateDocument(DB(), IG_QUEUE_COLLECTION, item.$id, {
      status: "failed",
      error: String(e instanceof Error ? e.message : e).slice(0, 500),
    });
  }
}

/** Publish one specific item immediately (used by "Publish now"). */
export async function publishIgItemNow(id: string): Promise<void> {
  const doc = (await db().getDocument(
    DB(),
    IG_QUEUE_COLLECTION,
    id
  )) as unknown as IgQueueItem;
  await publishItem(doc);
}

/**
 * Items stuck at "publishing" longer than this are reclaimed and
 * retried. A publish attempt claims an item (status → "publishing")
 * before doing any real work; if the process running it gets killed
 * mid-flight — e.g. the hosting platform's own execution-time limit
 * cutting off a hung Graph API call — the item never reaches
 * "published" or "failed" and, without this, sits invisible to every
 * future run forever (due-post queries only ever looked at "pending").
 * This is exactly what silently ate a scheduled Instagram post once;
 * see lib/facebook.ts's graph() for the other half of this fix (a
 * request timeout, so hangs fail fast instead of getting killed by
 * the platform).
 *
 * Tradeoff worth knowing: if a claimed item's publish actually
 * succeeded on Instagram but the process died before writing
 * "published" back to Appwrite, reclaiming it will retry and post a
 * duplicate. That's judged rarer and cheaper than a post silently
 * never going out, but it's not risk-free — the grace period is kept
 * generous (45 min, well past what a real publish should ever take)
 * to keep false reclaims rare.
 */
const STUCK_RECLAIM_MS = 45 * 60_000;

/**
 * Publish everything that's due (plus any "publishing" items stuck
 * past STUCK_RECLAIM_MS). Returns a summary. Safe to call from both
 * the in-process worker and the cron route.
 */
export async function processDueIgPosts(): Promise<{
  processed: number;
}> {
  if (!igQueueConfigured()) return { processed: 0 };
  const now = Math.floor(Date.now() / 1000);
  const staleBefore = new Date(Date.now() - STUCK_RECLAIM_MS).toISOString();

  const [dueRes, stuckRes] = await Promise.all([
    db().listDocuments(DB(), IG_QUEUE_COLLECTION, [
      Query.equal("status", ["pending", "approved"]),
      Query.lessThanEqual("scheduledAt", now),
      Query.orderAsc("scheduledAt"),
      Query.limit(10),
    ]),
    db().listDocuments(DB(), IG_QUEUE_COLLECTION, [
      Query.equal("status", "publishing"),
      Query.lessThan("$updatedAt", staleBefore),
      Query.orderAsc("$updatedAt"),
      Query.limit(10),
    ]),
  ]);
  const due = [
    ...dueRes.documents,
    ...stuckRes.documents,
  ] as unknown as IgQueueItem[];
  for (const item of due) await publishItem(item);
  return { processed: due.length };
}
