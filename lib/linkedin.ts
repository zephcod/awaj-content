/**
 * LinkedIn content publishing via the Community Management API's Posts
 * and Images/Videos APIs. SCAFFOLD — written against LinkedIn's
 * documented request/response shapes but not yet exercised against a
 * real approved app (Standard-tier access is pending review — see
 * README). Treat every shape here as "best effort from docs," and
 * re-verify against the LinkedIn-Version in lib/env.ts before relying
 * on it in production.
 *
 * Constraints that shape this module (all different from Meta):
 *  - No native scheduling at all. Every post — immediate or scheduled —
 *    is created with lifecycleState "PUBLISHED" the moment we call the
 *    API; there is no "publish later" flag. Scheduled posts wait in our
 *    own queue (lib/liqueue.ts) until due, same idea as Instagram.
 *  - Media upload is a register-then-PUT flow like Instagram's
 *    containers, but simpler: initializeUpload returns a single
 *    (uploadUrl, asset URN) pair; one PUT of the raw bytes completes it.
 *    No polling step for images. Video uses the same two-step shape but
 *    can require multi-part upload for larger files — not implemented
 *    here yet (single PUT only; fine for short clips, will need
 *    chunking for anything multi-GB).
 *  - Posts are authored by an organization URN (urn:li:organization:ID),
 *    not a "page token" — auth is a per-organization OAuth access token
 *    (lib/linkedinOrgs.ts), sent as a Bearer header on every call.
 *  - Caption limit: 3,000 characters (LinkedIn's documented commentary
 *    limit), vs Facebook/Instagram's 2,200.
 */

import { env } from "./env";

const API_BASE = "https://api.linkedin.com/rest";

export type LiAuth = { orgUrn: string; accessToken: string };

export class LinkedInApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "LinkedInApiError";
  }
}

async function li<T>(
  auth: LiAuth,
  path: string,
  init: {
    method?: "GET" | "POST" | "PUT";
    body?: unknown;
    /** Set for the binary upload PUT — bypasses JSON body handling. */
    binary?: { data: ArrayBuffer | Buffer; contentType: string };
    /** Full override URL (upload URLs are pre-signed, outside API_BASE). */
    url?: string;
  } = {}
): Promise<T> {
  const url = init.url ?? `${API_BASE}/${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.accessToken}`,
  };
  let body: BodyInit | undefined;

  if (init.binary) {
    headers["Content-Type"] = init.binary.contentType;
    body = init.binary.data as BodyInit;
  } else {
    headers["Content-Type"] = "application/json";
    headers["LinkedIn-Version"] = env.linkedinApiVersion();
    headers["X-Restli-Protocol-Version"] = "2.0.0";
    if (init.body !== undefined) body = JSON.stringify(init.body);
  }

  const res = await fetch(url, { method: init.method ?? "GET", headers, body, cache: "no-store" });

  if (init.binary) {
    // Upload PUTs return 201 with no useful body.
    if (!res.ok) {
      throw new LinkedInApiError(`LinkedIn media upload failed (HTTP ${res.status})`, res.status);
    }
    return undefined as T;
  }

  const json = (await res.json().catch(() => null)) as
    | (T & { message?: string; status?: number })
    | null;
  if (!res.ok) {
    throw new LinkedInApiError(
      json?.message ?? `LinkedIn API request failed (HTTP ${res.status})`,
      res.status
    );
  }
  return json as T;
}

export const LI_CAPTION_LIMIT = 3000;

// ── Media upload ──────────────────────────────────────────────────

type InitUploadResponse = {
  value: { uploadUrl: string; image?: string; video?: string };
};

/**
 * Anything that can hand over its bytes + MIME type — a browser `File`
 * satisfies this directly; lib/storage.ts's `downloadLiMedia` wraps a
 * file already staged in Appwrite storage into the same shape, so the
 * queue worker (lib/liqueue.ts) can call these without a real `File`.
 */
export type LiMediaInput = { arrayBuffer(): Promise<ArrayBuffer>; type: string; size?: number };

/** Register + upload one image; returns its asset URN (urn:li:image:...). */
export async function uploadImageToLi(auth: LiAuth, file: LiMediaInput): Promise<string> {
  const init = await li<InitUploadResponse>(auth, "images?action=initializeUpload", {
    method: "POST",
    body: { initializeUploadRequest: { owner: auth.orgUrn } },
  });
  const { uploadUrl, image } = init.value;
  if (!image) throw new LinkedInApiError("LinkedIn did not return an image asset URN.");
  await li(auth, "", {
    method: "PUT",
    url: uploadUrl,
    binary: { data: await file.arrayBuffer(), contentType: file.type || "image/jpeg" },
  });
  return image;
}

/**
 * Register + upload one video; returns its asset URN (urn:li:video:...).
 * Single-PUT only — fine for short clips. Files large enough to need
 * LinkedIn's multi-part upload API will need this extended before use.
 */
export async function uploadVideoToLi(auth: LiAuth, file: LiMediaInput): Promise<string> {
  const init = await li<InitUploadResponse>(auth, "videos?action=initializeUpload", {
    method: "POST",
    body: {
      initializeUploadRequest: {
        owner: auth.orgUrn,
        fileSizeBytes: file.size ?? 0,
        uploadCaptions: false,
        uploadThumbnail: false,
      },
    },
  });
  const { uploadUrl, video } = init.value;
  if (!video) throw new LinkedInApiError("LinkedIn did not return a video asset URN.");
  await li(auth, "", {
    method: "PUT",
    url: uploadUrl,
    binary: { data: await file.arrayBuffer(), contentType: file.type || "video/mp4" },
  });
  return video;
}

// ── Posts ─────────────────────────────────────────────────────────

type CreatePostBody = {
  author: string;
  commentary: string;
  visibility: "PUBLIC";
  distribution: {
    feedDistribution: "MAIN_FEED";
    targetEntities: [];
    thirdPartyDistributionChannels: [];
  };
  lifecycleState: "PUBLISHED";
  content?:
    | { media: { id: string; title?: string } }
    | { multiImage: { images: { id: string }[] } };
};

/** The Posts API returns the new post's URN in an `x-restli-id` header, not the body. */
async function createPostRaw(auth: LiAuth, body: CreatePostBody): Promise<{ id: string }> {
  const url = `${API_BASE}/posts`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": env.linkedinApiVersion(),
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const json = await res.json().catch(() => null);
    throw new LinkedInApiError(
      json?.message ?? `LinkedIn post creation failed (HTTP ${res.status})`,
      res.status
    );
  }
  const id = res.headers.get("x-restli-id");
  if (!id) throw new LinkedInApiError("LinkedIn did not return a post id.");
  return { id };
}

export async function publishTextPostToLi(
  auth: LiAuth,
  opts: { commentary: string }
): Promise<{ id: string }> {
  return createPostRaw(auth, {
    author: auth.orgUrn,
    commentary: opts.commentary.slice(0, LI_CAPTION_LIMIT),
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED",
  });
}

export async function publishImagePostToLi(
  auth: LiAuth,
  opts: { commentary: string; imageAssetUrn: string; title?: string }
): Promise<{ id: string }> {
  return createPostRaw(auth, {
    author: auth.orgUrn,
    commentary: opts.commentary.slice(0, LI_CAPTION_LIMIT),
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED",
    content: { media: { id: opts.imageAssetUrn, title: opts.title } },
  });
}

/** 2+ images in one post (LinkedIn's multi-image, roughly IG-carousel-equivalent). */
export async function publishMultiImagePostToLi(
  auth: LiAuth,
  opts: { commentary: string; imageAssetUrns: string[] }
): Promise<{ id: string }> {
  if (opts.imageAssetUrns.length < 2) {
    throw new LinkedInApiError("Multi-image posts need at least 2 images — use publishImagePostToLi for one.");
  }
  return createPostRaw(auth, {
    author: auth.orgUrn,
    commentary: opts.commentary.slice(0, LI_CAPTION_LIMIT),
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED",
    content: { multiImage: { images: opts.imageAssetUrns.map((id) => ({ id })) } },
  });
}

export async function publishVideoPostToLi(
  auth: LiAuth,
  opts: { commentary: string; videoAssetUrn: string; title?: string }
): Promise<{ id: string }> {
  return createPostRaw(auth, {
    author: auth.orgUrn,
    commentary: opts.commentary.slice(0, LI_CAPTION_LIMIT),
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: "PUBLISHED",
    content: { media: { id: opts.videoAssetUrn, title: opts.title } },
  });
}
