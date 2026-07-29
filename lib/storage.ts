/**
 * Appwrite Storage hosting for Instagram media (photos, carousels,
 * Reels + their cover images), staged media for the Facebook queue,
 * and staged media for the LinkedIn queue.
 *
 * Instagram's Content Publishing API only accepts a PUBLIC URL for any
 * media it's given — it never accepts a direct file upload, and (unlike
 * an early version of this app) it no longer borrows Facebook's own
 * unpublished-page-photo mechanism for that either. That approach was
 * fragile: an unpublished FB photo not attached to a real, still-live
 * post doesn't reliably survive a long wait, which is exactly what
 * broke a scheduled IG post earlier. So ALL Instagram-bound media
 * (image, carousel photos, Reel video, Reel cover image) is staged in
 * this public-read Appwrite bucket (`profile`, id below) and served via
 * its /view URL — good for both immediate posts and the IG queue.
 *
 * The Facebook queue (lib/fbqueue.ts) reuses this SAME bucket to stage
 * photos/videos for scheduled posts — per project decision, one shared
 * bucket rather than a dedicated one. Facebook doesn't need a public
 * URL for these (files are re-uploaded to Graph directly at publish
 * time via multipart), so public read is incidental here, not required.
 *
 * LinkedIn is different again: its upload URLs (from
 * images/videos?action=initializeUpload in lib/linkedin.ts) are
 * pre-signed and meant to be used immediately, not stored — so for
 * SCHEDULED LinkedIn posts we can't register the upload at compose
 * time and use it later like Facebook's photo-id approach. Instead the
 * original file is staged in Appwrite storage (`li_media` bucket, id
 * from LI_MEDIA_BUCKET_ID) and the actual LinkedIn upload happens at
 * publish time, inside lib/liqueue.ts.
 */

import { Client, ID, Storage } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import { env } from "./env";

/** Shared bucket ("profile") for IG media hosting + staged Facebook queue media. */
export const MEDIA_BUCKET = "658477e7eef2f71d1693";

let _storage: Storage | null = null;

function storage(): Storage {
  if (_storage) return _storage;
  const client = new Client()
    .setEndpoint(env.appwriteEndpoint())
    .setProject(env.appwriteProjectId())
    .setKey(env.appwriteApiKey());
  _storage = new Storage(client);
  return _storage;
}

/**
 * Upload one file (photo, video, or Reel cover image) bound for
 * Instagram; returns the Appwrite file id. Appwrite infers the served
 * Content-Type from the filename extension, so callers should pass a
 * real one through `file.name` (falls back to a generic default).
 */
export async function uploadIgMedia(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  const created = await storage().createFile(
    MEDIA_BUCKET,
    ID.unique(),
    InputFile.fromBuffer(buf, file.name || "media")
  );
  return created.$id;
}

/** Public URL for any file in the shared media bucket (public read). */
export function mediaUrl(fileId: string): string {
  return `${env.appwriteEndpoint()}/storage/buckets/${MEDIA_BUCKET}/files/${fileId}/view?project=${env.appwriteProjectId()}`;
}

/** Best-effort cleanup after successful publish. */
export async function deleteIgMedia(fileId: string): Promise<void> {
  try {
    await storage().deleteFile(MEDIA_BUCKET, fileId);
  } catch {
    // leftover files are harmless; ignore
  }
}

// ── Facebook queue media staging ────────────────────────────────────
//
// Scheduled Facebook posts no longer rely on Facebook's own scheduler
// (see lib/fbqueue.ts) — the original file is staged here at compose
// time and the real upload to Graph (uploadUnpublishedPhoto /
// createVideoPost, both in lib/facebook.ts) happens at publish time.
// Shares MEDIA_BUCKET with Instagram Reel hosting.

/** Stage one photo/video for a queued Facebook post; returns the Appwrite file id. */
export async function uploadFbMedia(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  const created = await storage().createFile(
    MEDIA_BUCKET,
    ID.unique(),
    InputFile.fromBuffer(buf, file.name || "media")
  );
  // Content-type isn't preserved by node-appwrite's InputFile.fromBuffer,
  // so it's stored alongside the file id in the queue item instead —
  // same pattern as LinkedIn's mediaContentType (see FbQueueItem).
  return created.$id;
}

/**
 * Fetch a staged file back out as a real File — lib/facebook.ts's
 * upload functions (uploadUnpublishedPhoto, createVideoPost) take a
 * File and only read .name off it, so this satisfies them directly.
 */
export async function downloadFbMedia(
  fileId: string,
  contentType: string,
  filename: string
): Promise<File> {
  const bytes = await storage().getFileDownload(MEDIA_BUCKET, fileId);
  return new File([bytes], filename, { type: contentType });
}

/** Best-effort cleanup after successful publish. */
export async function deleteFbMedia(fileId: string): Promise<void> {
  try {
    await storage().deleteFile(MEDIA_BUCKET, fileId);
  } catch {
    // leftover files are harmless; ignore
  }
}

// ── LinkedIn media staging ──────────────────────────────────────────
//
// LinkedIn's upload URLs (from images/videos?action=initializeUpload)
// are pre-signed and meant to be used right away, so a SCHEDULED
// LinkedIn post can't register the upload at compose time the way an
// immediate post does. Instead the original file is staged here and
// the real LinkedIn upload (lib/linkedin.ts) happens at publish time,
// from lib/liqueue.ts.

/** Stage one image/video for a queued LinkedIn post; returns the Appwrite file id. */
export async function uploadLiMedia(file: File): Promise<string> {
  const bucket = env.liMediaBucketId();
  const buf = Buffer.from(await file.arrayBuffer());
  const created = await storage().createFile(
    bucket,
    ID.unique(),
    InputFile.fromBuffer(buf, file.name || "media")
  );
  // Content-type isn't preserved by node-appwrite's InputFile.fromBuffer,
  // so it's stored alongside the file id in the queue item instead
  // (IgQueueItem-style: see LiQueueItem.mediaContentType in lib/liqueue.ts).
  return created.$id;
}

/**
 * Fetch a staged file's bytes back out, wrapped to satisfy
 * lib/linkedin.ts's `LiMediaInput` (arrayBuffer() + type). `contentType`
 * must be the one stashed at upload time — Appwrite doesn't return it.
 */
export async function downloadLiMedia(
  fileId: string,
  contentType: string
): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; type: string; size: number }> {
  const bytes = await storage().getFileDownload(env.liMediaBucketId(), fileId);
  const buf = Buffer.from(bytes);
  return {
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    type: contentType,
    size: buf.byteLength,
  };
}

/** Best-effort cleanup after successful publish. */
export async function deleteLiMedia(fileId: string): Promise<void> {
  try {
    await storage().deleteFile(env.liMediaBucketId(), fileId);
  } catch {
    // leftover files are harmless; ignore
  }
}
