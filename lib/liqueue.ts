/**
 * LinkedIn scheduling queue, backed by Appwrite (same instance as the IG
 * queue). LinkedIn has no native scheduling — same constraint as
 * Instagram — so queued LinkedIn posts live here until due and are
 * published by `processDueLiPosts()`, driven by the in-process worker
 * (instrumentation.ts) and/or the cron route (/api/cron/li).
 *
 * Structurally this is lib/igqueue.ts with the platform swapped — same
 * claim/publish/fail lifecycle, same due-post polling shape.
 *
 * SCAFFOLD — publish paths call lib/linkedin.ts, itself unverified
 * pending LinkedIn's API approval. Safe to leave configured-off
 * (liQueueConfigured() false) until then; the worker and cron route
 * both no-op in that case, same as the IG queue does today.
 */

import { Client, Databases, ID, Query } from "node-appwrite";
import { env, liQueueConfigured } from "./env";
import { downloadLiMedia, deleteLiMedia } from "./storage";
import { getValidAccessToken } from "./linkedinOrgs";
import {
  publishImagePostToLi,
  publishMultiImagePostToLi,
  publishTextPostToLi,
  publishVideoPostToLi,
  uploadImageToLi,
  uploadVideoToLi,
  type LiAuth,
} from "./linkedin";

export const LI_QUEUE_COLLECTION = "li_queue";

export type LiMediaType = "text" | "image" | "multiImage" | "video";

export type LiQueueItem = {
  $id: string;
  orgUrn: string;
  orgName?: string;
  caption: string;
  mediaType: LiMediaType;
  /** JSON array of Appwrite file ids staged via lib/storage.ts's uploadLiMedia. Empty for text posts. */
  mediaRefs?: string;
  /** MIME type of the (first) staged file — Appwrite doesn't preserve this itself. */
  mediaContentType?: string;
  scheduledAt: number; // unix seconds
  status: "pending" | "approved" | "publishing" | "published" | "failed";
  error?: string;
  liPostId?: string;
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

export async function enqueueLiPost(item: {
  orgUrn: string;
  orgName?: string;
  caption: string;
  mediaType: LiMediaType;
  mediaRefs?: string[];
  mediaContentType?: string;
  scheduledAt: number;
}): Promise<void> {
  const { mediaRefs, ...rest } = item;
  await db().createDocument(DB(), LI_QUEUE_COLLECTION, ID.unique(), {
    ...rest,
    caption: item.caption.slice(0, 3000),
    mediaRefs: mediaRefs ? JSON.stringify(mediaRefs) : undefined,
    status: "pending",
  });
}

/** Pending + failed items for one organization, soonest first. */
export async function listLiQueue(orgUrn: string): Promise<LiQueueItem[]> {
  const res = await db().listDocuments(DB(), LI_QUEUE_COLLECTION, [
    Query.equal("orgUrn", orgUrn),
    Query.notEqual("status", "published"),
    Query.orderAsc("scheduledAt"),
    Query.limit(100),
  ]);
  return res.documents as unknown as LiQueueItem[];
}

export async function rescheduleLiItem(id: string, scheduledAt: number): Promise<void> {
  await db().updateDocument(DB(), LI_QUEUE_COLLECTION, id, {
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
 * editLiQueued, which deletes them only after the new refs are saved).
 */
export async function editLiItem(
  id: string,
  updates: {
    caption?: string;
    mediaRefs?: string[];
    mediaContentType?: string;
    mediaType?: LiMediaType;
  }
): Promise<void> {
  const patch: Record<string, unknown> = { status: "pending", error: null };
  if (updates.caption !== undefined) patch.caption = updates.caption.slice(0, 3000);
  if (updates.mediaRefs !== undefined) patch.mediaRefs = JSON.stringify(updates.mediaRefs);
  if (updates.mediaContentType !== undefined) patch.mediaContentType = updates.mediaContentType;
  if (updates.mediaType !== undefined) patch.mediaType = updates.mediaType;
  await db().updateDocument(DB(), LI_QUEUE_COLLECTION, id, patch);
}

/**
 * Directly set an item's status — an escape hatch for the /scheduled UI
 * (e.g. resetting a stuck "publishing" item to "pending" without
 * waiting for the 45-min auto-reclaim, or manually marking something
 * "published"/"failed" when it was actually handled outside the app).
 * Does not touch staged media or trigger a real publish attempt.
 */
export async function setLiItemStatus(
  id: string,
  status: LiQueueItem["status"]
): Promise<void> {
  await db().updateDocument(DB(), LI_QUEUE_COLLECTION, id, { status });
}

export async function deleteLiItem(id: string): Promise<void> {
  const doc = (await db().getDocument(DB(), LI_QUEUE_COLLECTION, id)) as unknown as LiQueueItem;
  await db().deleteDocument(DB(), LI_QUEUE_COLLECTION, id);
  for (const ref of doc.mediaRefs ? (JSON.parse(doc.mediaRefs) as string[]) : []) {
    await deleteLiMedia(ref);
  }
}

// ── Publisher ─────────────────────────────────────────────────────

async function publishItem(item: LiQueueItem): Promise<void> {
  await db().updateDocument(DB(), LI_QUEUE_COLLECTION, item.$id, { status: "publishing" });
  try {
    const accessToken = await getValidAccessToken(item.orgUrn);
    const auth: LiAuth = { orgUrn: item.orgUrn, accessToken };
    const refs: string[] = item.mediaRefs ? JSON.parse(item.mediaRefs) : [];

    let res: { id: string };
    if (item.mediaType === "image") {
      const media = await downloadLiMedia(refs[0], item.mediaContentType ?? "image/jpeg");
      const assetUrn = await uploadImageToLi(auth, media);
      res = await publishImagePostToLi(auth, { commentary: item.caption, imageAssetUrn: assetUrn });
    } else if (item.mediaType === "multiImage") {
      const assetUrns: string[] = [];
      for (const ref of refs) {
        const media = await downloadLiMedia(ref, item.mediaContentType ?? "image/jpeg");
        assetUrns.push(await uploadImageToLi(auth, media));
      }
      res = await publishMultiImagePostToLi(auth, { commentary: item.caption, imageAssetUrns: assetUrns });
    } else if (item.mediaType === "video") {
      const media = await downloadLiMedia(refs[0], item.mediaContentType ?? "video/mp4");
      const assetUrn = await uploadVideoToLi(auth, media);
      res = await publishVideoPostToLi(auth, { commentary: item.caption, videoAssetUrn: assetUrn });
    } else {
      res = await publishTextPostToLi(auth, { commentary: item.caption });
    }

    await db().updateDocument(DB(), LI_QUEUE_COLLECTION, item.$id, {
      status: "published",
      liPostId: res.id,
      error: null,
    });
    for (const ref of refs) await deleteLiMedia(ref); // hosting no longer needed
  } catch (e) {
    await db().updateDocument(DB(), LI_QUEUE_COLLECTION, item.$id, {
      status: "failed",
      error: String(e instanceof Error ? e.message : e).slice(0, 500),
    });
  }
}

/** Publish one specific item immediately (used by "Publish now"). */
export async function publishLiItemNow(id: string): Promise<void> {
  const doc = (await db().getDocument(DB(), LI_QUEUE_COLLECTION, id)) as unknown as LiQueueItem;
  await publishItem(doc);
}

/**
 * Items stuck at "publishing" longer than this are reclaimed and
 * retried. A publish attempt claims an item (status → "publishing")
 * before doing any real work; if the process running it gets killed
 * mid-flight — e.g. the hosting platform's own execution-time limit
 * cutting off a hung API call — the item never reaches "published" or
 * "failed" and, without this, sits invisible to every future run
 * forever (due-post queries only ever looked at "pending"). This is
 * exactly what silently ate a scheduled Instagram post once; see
 * lib/linkedin.ts's li() for the other half of this fix (a request
 * timeout, so hangs fail fast instead of getting killed by the
 * platform).
 *
 * Tradeoff worth knowing: if a claimed item's publish actually
 * succeeded on LinkedIn but the process died before writing
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
export async function processDueLiPosts(): Promise<{ processed: number }> {
  if (!liQueueConfigured()) return { processed: 0 };
  const now = Math.floor(Date.now() / 1000);
  const staleBefore = new Date(Date.now() - STUCK_RECLAIM_MS).toISOString();

  const [dueRes, stuckRes] = await Promise.all([
    db().listDocuments(DB(), LI_QUEUE_COLLECTION, [
      Query.equal("status", "pending"),
      Query.lessThanEqual("scheduledAt", now),
      Query.orderAsc("scheduledAt"),
      Query.limit(10),
    ]),
    db().listDocuments(DB(), LI_QUEUE_COLLECTION, [
      Query.equal("status", "publishing"),
      Query.lessThan("$updatedAt", staleBefore),
      Query.orderAsc("$updatedAt"),
      Query.limit(10),
    ]),
  ]);
  const due = [
    ...dueRes.documents,
    ...stuckRes.documents,
  ] as unknown as LiQueueItem[];
  for (const item of due) await publishItem(item);
  return { processed: due.length };
}
