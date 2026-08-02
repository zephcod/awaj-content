/**
 * Facebook scheduling queue, backed by Appwrite (same instance as the
 * IG and LinkedIn queues). Facebook posts no longer use Facebook's own
 * `scheduled_publish_time` — that path silently throttles once a Page
 * has ~30 pending scheduled posts, with no useful error. Instead, every
 * scheduled Facebook post lives here as `pending` and is only sent to
 * Graph — as a real, immediately-published post — at the moment it's
 * actually due, via `processDueFbPosts()`, driven by the in-process
 * worker (instrumentation.ts) and/or the cron route (/api/cron/fb).
 *
 * Structurally this is lib/liqueue.ts with the platform swapped — same
 * claim/publish/fail lifecycle, same due-post polling shape. Media is
 * staged in Appwrite at compose time (lib/storage.ts's uploadFbMedia,
 * sharing the same bucket as IG Reel hosting) and re-uploaded to Graph
 * fresh at publish time, mirroring how the IG/LI queues stage media.
 */

import { Client, Databases, ID, Query } from "node-appwrite";
import { env, fbQueueConfigured } from "./env";
import {
  createFeedPostWithMedia,
  createTextPost,
  createVideoPost,
  uploadUnpublishedPhoto,
  type PageAuth,
} from "./facebook";
import { listPages } from "./pages";
import { deleteFbMedia, downloadFbMedia } from "./storage";

export const FB_QUEUE_COLLECTION = "fb_queue";

export type FbMediaType = "text" | "image" | "multiImage" | "video";

export type FbQueueItem = {
  $id: string;
  pageId: string;
  caption: string;
  /** Only meaningful for mediaType "text" — Facebook's link preview card. */
  link?: string;
  mediaType: FbMediaType;
  /** JSON array of Appwrite file ids staged via lib/storage.ts's uploadFbMedia. */
  mediaRefs?: string;
  /** MIME type of the staged file(s) — Appwrite doesn't preserve this itself. */
  mediaContentType?: string;
  scheduledAt: number; // unix seconds
  status: "pending" | "approved" | "publishing" | "published" | "failed";
  error?: string;
  fbPostId?: string;
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

export async function enqueueFbPost(item: {
  pageId: string;
  caption: string;
  link?: string;
  mediaType: FbMediaType;
  mediaRefs?: string[];
  mediaContentType?: string;
  scheduledAt: number;
}): Promise<void> {
  const { mediaRefs, ...rest } = item;
  await db().createDocument(DB(), FB_QUEUE_COLLECTION, ID.unique(), {
    ...rest,
    caption: item.caption.slice(0, 63000),
    mediaRefs: mediaRefs ? JSON.stringify(mediaRefs) : undefined,
    status: "pending",
  });
}

/** Pending + failed items for one page, soonest first. */
export async function listFbQueue(pageId: string): Promise<FbQueueItem[]> {
  const res = await db().listDocuments(DB(), FB_QUEUE_COLLECTION, [
    Query.equal("pageId", pageId),
    Query.notEqual("status", "published"),
    Query.orderAsc("scheduledAt"),
    Query.limit(100),
  ]);
  return res.documents as unknown as FbQueueItem[];
}

export async function rescheduleFbItem(id: string, scheduledAt: number): Promise<void> {
  await db().updateDocument(DB(), FB_QUEUE_COLLECTION, id, {
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
 * editFbQueued, which deletes them only after the new refs are saved).
 */
export async function editFbItem(
  id: string,
  updates: {
    caption?: string;
    mediaRefs?: string[];
    mediaContentType?: string;
    mediaType?: FbMediaType;
  }
): Promise<void> {
  const patch: Record<string, unknown> = { status: "pending", error: null };
  if (updates.caption !== undefined) patch.caption = updates.caption.slice(0, 63000);
  if (updates.mediaRefs !== undefined) patch.mediaRefs = JSON.stringify(updates.mediaRefs);
  if (updates.mediaContentType !== undefined) patch.mediaContentType = updates.mediaContentType;
  if (updates.mediaType !== undefined) patch.mediaType = updates.mediaType;
  await db().updateDocument(DB(), FB_QUEUE_COLLECTION, id, patch);
}

/**
 * Directly set an item's status — an escape hatch for the /scheduled UI
 * (e.g. resetting a stuck "publishing" item to "pending" without
 * waiting for the 45-min auto-reclaim, or manually marking something
 * "published"/"failed" when it was actually handled outside the app).
 * Does not touch staged media or trigger a real publish attempt.
 */
export async function setFbItemStatus(
  id: string,
  status: FbQueueItem["status"]
): Promise<void> {
  await db().updateDocument(DB(), FB_QUEUE_COLLECTION, id, { status });
}

export async function deleteFbItem(id: string): Promise<void> {
  const doc = (await db().getDocument(DB(), FB_QUEUE_COLLECTION, id)) as unknown as FbQueueItem;
  await db().deleteDocument(DB(), FB_QUEUE_COLLECTION, id);
  for (const ref of doc.mediaRefs ? (JSON.parse(doc.mediaRefs) as string[]) : []) {
    await deleteFbMedia(ref);
  }
}

// ── Publisher ─────────────────────────────────────────────────────

async function publishItem(item: FbQueueItem): Promise<void> {
  // Claim it (best-effort lock against double-publish)
  await db().updateDocument(DB(), FB_QUEUE_COLLECTION, item.$id, {
    status: "publishing",
  });
  try {
    const page = (await listPages()).find((p) => p.id === item.pageId);
    if (!page) throw new Error(`Page ${item.pageId} is not configured.`);

    const refs: string[] = item.mediaRefs ? JSON.parse(item.mediaRefs) : [];
    const contentType = item.mediaContentType ?? "image/jpeg";

    let res: { id: string };
    if (item.mediaType === "image" || item.mediaType === "multiImage") {
      const mediaFbids: string[] = [];
      for (let i = 0; i < refs.length; i++) {
        const file = await downloadFbMedia(refs[i], contentType, `photo-${i}.jpg`);
        mediaFbids.push((await uploadUnpublishedPhoto(page as PageAuth, file)).id);
      }
      res = await createFeedPostWithMedia(page as PageAuth, {
        caption: item.caption,
        mediaFbids,
      });
    } else if (item.mediaType === "video") {
      const file = await downloadFbMedia(refs[0], contentType, "video.mp4");
      res = await createVideoPost(page as PageAuth, {
        description: item.caption,
        video: file,
      });
    } else {
      res = await createTextPost(page as PageAuth, {
        message: item.caption,
        link: item.link || undefined,
      });
    }

    await db().updateDocument(DB(), FB_QUEUE_COLLECTION, item.$id, {
      status: "published",
      fbPostId: res.id,
      error: null,
    });
    for (const ref of refs) await deleteFbMedia(ref); // hosting no longer needed
  } catch (e) {
    await db().updateDocument(DB(), FB_QUEUE_COLLECTION, item.$id, {
      status: "failed",
      error: String(e instanceof Error ? e.message : e).slice(0, 500),
    });
  }
}

/** Publish one specific item immediately (used by "Publish now"). */
export async function publishFbItemNow(id: string): Promise<void> {
  const doc = (await db().getDocument(
    DB(),
    FB_QUEUE_COLLECTION,
    id
  )) as unknown as FbQueueItem;
  await publishItem(doc);
}

/**
 * Items stuck at "publishing" longer than this are reclaimed and
 * retried (see processDueFbPosts). A publish attempt claims an item
 * (status → "publishing") before doing any real work; if the process
 * running it gets killed mid-flight — e.g. the hosting platform's own
 * execution-time limit cutting off a hung Graph API call — the item
 * never reaches "published" or "failed" and, without this, would sit
 * invisible to every future run forever (due-post queries only ever
 * looked at "pending"). This is exactly what silently ate a scheduled
 * Instagram post once; see lib/facebook.ts's graph() for the other
 * half of this fix (a request timeout, so hangs fail fast instead of
 * getting killed by the platform).
 *
 * Tradeoff worth knowing: if a claimed item's publish actually
 * succeeded on the platform but the process died before writing
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
export async function processDueFbPosts(): Promise<{ processed: number }> {
  if (!fbQueueConfigured()) return { processed: 0 };
  const now = Math.floor(Date.now() / 1000);
  const staleBefore = new Date(Date.now() - STUCK_RECLAIM_MS).toISOString();

  const [dueRes, stuckRes] = await Promise.all([
    db().listDocuments(DB(), FB_QUEUE_COLLECTION, [
      Query.equal("status", "pending"),
      Query.lessThanEqual("scheduledAt", now),
      Query.orderAsc("scheduledAt"),
      Query.limit(10),
    ]),
    db().listDocuments(DB(), FB_QUEUE_COLLECTION, [
      Query.equal("status", "publishing"),
      Query.lessThan("$updatedAt", staleBefore),
      Query.orderAsc("$updatedAt"),
      Query.limit(10),
    ]),
  ]);
  const due = [
    ...dueRes.documents,
    ...stuckRes.documents,
  ] as unknown as FbQueueItem[];
  for (const item of due) await publishItem(item);
  return { processed: due.length };
}
