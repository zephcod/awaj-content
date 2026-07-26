/**
 * Appwrite Storage hosting for Instagram videos.
 *
 * IG Reels require a PUBLIC video URL — and unlike photos, Facebook's
 * CDN can't reliably serve uploaded page videos as fetchable files. So
 * videos destined for Instagram are stored in a public-read Appwrite
 * bucket (`ig_media`) and served via its /view URL.
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
