/**
 * Appwrite Storage hosting for Instagram videos, and staged media for
 * the LinkedIn queue.
 *
 * IG Reels require a PUBLIC video URL — and unlike photos, Facebook's
 * CDN can't reliably serve uploaded page videos as fetchable files. So
 * videos destined for Instagram are stored in a public-read Appwrite
 * bucket (`ig_media`) and served via its /view URL.
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

export const IG_MEDIA_BUCKET = "658477e7eef2f71d1693";

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

/** Upload a video file; returns the Appwrite file id. */
export async function uploadIgVideo(file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer());
  const created = await storage().createFile(
    IG_MEDIA_BUCKET,
    ID.unique(),
    InputFile.fromBuffer(buf, file.name || "video.mp4")
  );
  return created.$id;
}

/** Public URL for a stored video (bucket has public read). */
export function igVideoUrl(fileId: string): string {
  return `${env.appwriteEndpoint()}/storage/buckets/${IG_MEDIA_BUCKET}/files/${fileId}/view?project=${env.appwriteProjectId()}`;
}

/** Best-effort cleanup after successful publish. */
export async function deleteIgVideo(fileId: string): Promise<void> {
  try {
    await storage().deleteFile(IG_MEDIA_BUCKET, fileId);
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
