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
  status: "pending" | "publishing" | "published" | "failed";
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
 * Publish everything that's due. Returns a summary. Safe to call from
 * both the in-process worker and the cron route.
 */
export async function processDueLiPosts(): Promise<{ processed: number }> {
  if (!liQueueConfigured()) return { processed: 0 };
  const now = Math.floor(Date.now() / 1000);
  const res = await db().listDocuments(DB(), LI_QUEUE_COLLECTION, [
    Query.equal("status", "pending"),
    Query.lessThanEqual("scheduledAt", now),
    Query.orderAsc("scheduledAt"),
    Query.limit(10),
  ]);
  const due = res.documents as unknown as LiQueueItem[];
  for (const item of due) await publishItem(item);
  return { processed: due.length };
}
