"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import {
  createFeedPostWithMedia,
  createTextPost,
  createVideoPost,
  deletePost,
  GraphError,
  publishNow,
  reschedulePost,
  uploadUnpublishedPhoto,
  validateScheduleTime,
} from "@/lib/facebook";
import { fbQueueConfigured, igQueueConfigured, liQueueConfigured } from "@/lib/env";
import {
  deleteFbItem,
  enqueueFbPost,
  publishFbItemNow,
  rescheduleFbItem,
} from "@/lib/fbqueue";
import {
  deleteIgItem,
  enqueueIgPost,
  publishIgItemNow,
  rescheduleIgItem,
} from "@/lib/igqueue";
import {
  getIgAccount,
  publishCarouselToIg,
  publishImageToIg,
} from "@/lib/instagram";
import {
  LinkedInApiError,
  publishImagePostToLi,
  publishMultiImagePostToLi,
  publishTextPostToLi,
  uploadImageToLi,
  type LiAuth,
} from "@/lib/linkedin";
import {
  deleteLiItem,
  enqueueLiPost,
  publishLiItemNow,
  rescheduleLiItem,
} from "@/lib/liqueue";
import {
  ACTIVE_LI_ORG_COOKIE,
  deleteLiConnection,
  getActiveLiOrg,
  getValidAccessToken,
} from "@/lib/linkedinOrgs";
import { ACTIVE_PAGE_COOKIE, getActivePage } from "@/lib/pages";
import { deleteIgMedia, mediaUrl, uploadFbMedia, uploadIgMedia, uploadLiMedia } from "@/lib/storage";

export type ActionState = {
  ok: boolean;
  message: string;
} | null;

function errMessage(e: unknown): string {
  if (e instanceof GraphError) return `Facebook: ${e.message}`;
  if (e instanceof LinkedInApiError) return `LinkedIn: ${e.message}`;
  if (e instanceof Error) return e.message;
  return "Something went wrong.";
}

/** Switch the LinkedIn organization Composer posts to. */
export async function setActiveLiOrg(orgUrn: string): Promise<void> {
  (await cookies()).set(ACTIVE_LI_ORG_COOKIE, orgUrn, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}

/** Disconnect a LinkedIn organization (e.g. a client offboarding). */
export async function disconnectLiOrg(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    await deleteLiConnection(id);
  } catch {
    // refresh shows current state
  }
  revalidatePath("/settings/linkedin");
}

/** Switch the page all views operate on. */
export async function setActivePage(pageId: string): Promise<void> {
  (await cookies()).set(ACTIVE_PAGE_COOKIE, pageId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
}

/**
 * Create a post to Facebook and/or Instagram, immediately or scheduled.
 * Media: up to 10 photos (multi-photo/carousel) OR one video — not both.
 * Fields: message, photos (File[]), video (File), scheduledAt (unix
 * seconds, optional), dest_fb / dest_ig ("on" when selected).
 */
export async function createPost(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const message = String(formData.get("message") ?? "").trim();
  const link = String(formData.get("link") ?? "").trim();
  const photos = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0);
  const videoEntry = formData.get("video");
  const video =
    videoEntry instanceof File && videoEntry.size > 0 ? videoEntry : null;
  // Optional custom Reel cover — Instagram-only, only meaningful with a video.
  const igThumbnailEntry = formData.get("igThumbnail");
  const igThumbnail =
    igThumbnailEntry instanceof File && igThumbnailEntry.size > 0
      ? igThumbnailEntry
      : null;
  const scheduledAtRaw = String(formData.get("scheduledAt") ?? "").trim();
  const scheduledAt = scheduledAtRaw ? Number(scheduledAtRaw) : undefined;
  const toFb = formData.get("dest_fb") === "on";
  const toIg = formData.get("dest_ig") === "on";
  const toLi = formData.get("dest_li") === "on";

  // ── Validation ──
  if (!toFb && !toIg && !toLi) {
    return { ok: false, message: "Pick at least one destination." };
  }
  if (!message && photos.length === 0 && !video && !link) {
    return { ok: false, message: "Write a message or attach media." };
  }
  if (video && photos.length > 0) {
    return { ok: false, message: "Choose photos or a video — not both." };
  }
  if (link) {
    try {
      const u = new URL(link);
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error();
    } catch {
      return { ok: false, message: "The link must be a valid http(s) URL." };
    }
    if (photos.length > 0 || video) {
      return {
        ok: false,
        message:
          "A link post can't include uploaded media — Facebook renders the link's own preview card. Remove the link or the media.",
      };
    }
    if (toIg || toLi) {
      const which = [toIg && "Instagram", toLi && "LinkedIn"].filter(Boolean).join(" and ");
      return {
        ok: false,
        message: `${which} doesn't support link posts (URLs in captions aren't clickable). Post the link to Facebook only, or attach media and put the link in the caption text.`,
      };
    }
  }
  if (photos.length > 10) {
    return { ok: false, message: "Maximum 10 photos per post." };
  }
  if (toIg && photos.length === 0 && !video) {
    return { ok: false, message: "Instagram posts need a photo or video." };
  }
  if (scheduledAt !== undefined) {
    if (!Number.isFinite(scheduledAt)) {
      return { ok: false, message: "Invalid schedule time." };
    }
    const problem = validateScheduleTime(scheduledAt);
    if (problem) return { ok: false, message: problem };
  }
  const igNeedsQueue = toIg && (scheduledAt !== undefined || Boolean(video));
  if (igNeedsQueue && !igQueueConfigured()) {
    return {
      ok: false,
      message: video
        ? "Instagram Reels need the Appwrite queue for video hosting — add APPWRITE_* vars to .env (see README)."
        : "Instagram scheduling needs the Appwrite queue — add APPWRITE_* vars to .env (see README) or publish to Instagram immediately.",
    };
  }
  // LinkedIn has no native scheduling at all (unlike Facebook), so any
  // scheduled LinkedIn post needs the queue — same as any LinkedIn video,
  // since upload/processing status isn't polled synchronously here yet.
  const liNeedsQueue = toLi && (scheduledAt !== undefined || Boolean(video));
  if (liNeedsQueue && !liQueueConfigured()) {
    return {
      ok: false,
      message:
        "LinkedIn scheduling/video needs the queue configured — add LI_MEDIA_BUCKET_ID + APPWRITE_* vars to .env (see README), or publish text/single-image LinkedIn posts immediately.",
    };
  }

  try {
    const page = toFb || toIg ? await getActivePage() : null;
    if ((toFb || toIg) && !page) {
      return { ok: false, message: "No Facebook page configured." };
    }

    let ig: { id: string; username?: string } | null = null;
    if (toIg && page) {
      ig = await getIgAccount(page);
      if (!ig) {
        return {
          ok: false,
          message: `No Instagram professional account is linked to "${page.name}". Link one in Meta Business Suite → Settings → Linked accounts.`,
        };
      }
    }

    let liAuth: LiAuth | null = null;
    let liOrgName: string | undefined;
    if (toLi) {
      const org = await getActiveLiOrg();
      if (!org) {
        return {
          ok: false,
          message: "No LinkedIn organization connected. Visit /settings/linkedin to connect one.",
        };
      }
      liAuth = { orgUrn: org.orgUrn, accessToken: await getValidAccessToken(org.orgUrn) };
      liOrgName = org.orgName;
    }

    // Upload photos to FB once (as unpublished page photos) for an
    // IMMEDIATE Facebook post only. A SCHEDULED Facebook post skips this
    // entirely — see lib/fbqueue.ts below — since an unpublished photo
    // not attached to a real post doesn't reliably survive a long wait.
    const mediaFbids: string[] = [];
    if (toFb && !scheduledAt && page) {
      for (const photo of photos) {
        mediaFbids.push((await uploadUnpublishedPhoto(page, photo)).id);
      }
    }

    // Instagram never touches Facebook's photo storage — every IG-bound
    // photo is staged directly in the shared Appwrite bucket (immediate
    // or queued alike), then served to Graph as a plain public URL.
    const igMediaRefs: string[] = [];
    if (toIg && photos.length > 0) {
      for (const photo of photos) {
        igMediaRefs.push(await uploadIgMedia(photo));
      }
    }

    const done: string[] = [];

    // ── Facebook ──
    // Scheduled posts no longer use Facebook's native scheduler — it
    // silently throttles once a Page has ~30 pending scheduled posts.
    // Instead they go through the Appwrite-backed queue (lib/fbqueue.ts)
    // and are only sent to Graph, fully published, once actually due.
    if (toFb && page) {
      if (scheduledAt) {
        if (video) {
          const fileId = await uploadFbMedia(video);
          await enqueueFbPost({
            pageId: page.id,
            caption: message,
            mediaType: "video",
            mediaRefs: [fileId],
            mediaContentType: video.type,
            scheduledAt,
          });
          done.push("Facebook video (queued)");
        } else if (photos.length > 0) {
          const fileIds: string[] = [];
          for (const photo of photos) fileIds.push(await uploadFbMedia(photo));
          await enqueueFbPost({
            pageId: page.id,
            caption: message,
            mediaType: fileIds.length > 1 ? "multiImage" : "image",
            mediaRefs: fileIds,
            mediaContentType: photos[0]?.type,
            scheduledAt,
          });
          done.push(
            fileIds.length > 1 ? "Facebook (multi-photo, queued)" : "Facebook (queued)"
          );
        } else {
          await enqueueFbPost({
            pageId: page.id,
            caption: message,
            link: link || undefined,
            mediaType: "text",
            scheduledAt,
          });
          done.push(link ? "Facebook link post (queued)" : "Facebook (queued)");
        }
      } else if (video) {
        await createVideoPost(page, { description: message, video });
        done.push("Facebook video");
      } else if (mediaFbids.length > 0) {
        await createFeedPostWithMedia(page, { caption: message, mediaFbids });
        done.push(mediaFbids.length > 1 ? "Facebook (multi-photo)" : "Facebook");
      } else {
        await createTextPost(page, { message, link: link || undefined });
        done.push(link ? "Facebook link post" : "Facebook");
      }
    }

    // ── Instagram ──
    if (toIg && ig && page) {
      if (video) {
        // Reels always go through the queue: processing takes minutes.
        const fileId = await uploadIgMedia(video);
        let thumbRef: string | undefined;
        if (igThumbnail) thumbRef = await uploadIgMedia(igThumbnail);
        await enqueueIgPost({
          pageId: page.id,
          igUserId: ig.id,
          igUsername: ig.username,
          caption: message,
          mediaType: "reel",
          mediaRefs: [fileId],
          thumbRef,
          scheduledAt: scheduledAt ?? Math.floor(Date.now() / 1000),
        });
        done.push(
          scheduledAt
            ? "Instagram Reel (queued)"
            : "Instagram Reel (queued — publishes within ~2 min)"
        );
      } else if (scheduledAt) {
        await enqueueIgPost({
          pageId: page.id,
          igUserId: ig.id,
          igUsername: ig.username,
          caption: message,
          mediaType: igMediaRefs.length > 1 ? "carousel" : "image",
          mediaRefs: igMediaRefs,
          scheduledAt,
        });
        done.push(
          igMediaRefs.length > 1
            ? "Instagram carousel (queued)"
            : "Instagram (queued)"
        );
      } else if (igMediaRefs.length > 1) {
        await publishCarouselToIg(page, ig.id, {
          caption: message,
          imageUrls: igMediaRefs.map(mediaUrl),
        });
        for (const ref of igMediaRefs) await deleteIgMedia(ref);
        done.push("Instagram carousel");
      } else {
        await publishImageToIg(page, ig.id, {
          caption: message,
          imageUrl: mediaUrl(igMediaRefs[0]),
        });
        await deleteIgMedia(igMediaRefs[0]);
        done.push("Instagram");
      }
    }

    // ── LinkedIn ──
    // No native scheduling exists on LinkedIn's API at all (unlike
    // Facebook) — every scheduled post, and every video (processing
    // status isn't polled synchronously here), goes through the queue.
    // Text and single/multi-image posts can publish immediately.
    if (toLi && liAuth) {
      if (video) {
        const fileId = await uploadLiMedia(video);
        await enqueueLiPost({
          orgUrn: liAuth.orgUrn,
          orgName: liOrgName,
          caption: message,
          mediaType: "video",
          mediaRefs: [fileId],
          mediaContentType: video.type,
          scheduledAt: scheduledAt ?? Math.floor(Date.now() / 1000),
        });
        done.push(
          scheduledAt ? "LinkedIn video (queued)" : "LinkedIn video (queued — publishes shortly)"
        );
      } else if (scheduledAt) {
        const fileIds: string[] = [];
        for (const photo of photos) fileIds.push(await uploadLiMedia(photo));
        await enqueueLiPost({
          orgUrn: liAuth.orgUrn,
          orgName: liOrgName,
          caption: message,
          mediaType: fileIds.length > 1 ? "multiImage" : fileIds.length === 1 ? "image" : "text",
          mediaRefs: fileIds,
          mediaContentType: photos[0]?.type,
          scheduledAt,
        });
        done.push(
          fileIds.length > 1 ? "LinkedIn multi-image (queued)" : "LinkedIn (queued)"
        );
      } else if (photos.length > 1) {
        const assetUrns: string[] = [];
        for (const photo of photos) assetUrns.push(await uploadImageToLi(liAuth, photo));
        await publishMultiImagePostToLi(liAuth, { commentary: message, imageAssetUrns: assetUrns });
        done.push("LinkedIn multi-image");
      } else if (photos.length === 1) {
        const assetUrn = await uploadImageToLi(liAuth, photos[0]);
        await publishImagePostToLi(liAuth, { commentary: message, imageAssetUrn: assetUrn });
        done.push("LinkedIn");
      } else {
        await publishTextPostToLi(liAuth, { commentary: message });
        done.push("LinkedIn");
      }
    }

    revalidatePath("/scheduled");
    revalidatePath("/published");
    revalidatePath("/calendar");
    const target = page ? `page "${page.name}"` : liOrgName ? `"${liOrgName}"` : "";
    return {
      ok: true,
      message: `Done: ${done.join(" + ")}${target ? ` — ${target}.` : "."}`,
    };
  } catch (e) {
    return { ok: false, message: errMessage(e) };
  }
}

// ── Facebook queue management ─────────────────────────────────────

export async function cancelFbQueued(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    await deleteFbItem(id);
  } catch {
    // refresh shows current state
  }
  revalidatePath("/scheduled");
}

export async function publishFbQueuedNow(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    await publishFbItemNow(id);
  } catch {
    // item will show as failed with the error message
  }
  revalidatePath("/scheduled");
  revalidatePath("/published");
}

export async function rescheduleFbQueued(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const scheduledAt = Number(formData.get("scheduledAt"));
  if (!id || !Number.isFinite(scheduledAt)) {
    return { ok: false, message: "Invalid reschedule request." };
  }
  const problem = validateScheduleTime(scheduledAt);
  if (problem) return { ok: false, message: problem };
  try {
    await rescheduleFbItem(id, scheduledAt);
  } catch (e) {
    return { ok: false, message: errMessage(e) };
  }
  revalidatePath("/scheduled");
  return { ok: true, message: "Post rescheduled." };
}

// ── Instagram queue management ────────────────────────────────────

export async function cancelIgQueued(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    await deleteIgItem(id);
  } catch {
    // refresh shows current state
  }
  revalidatePath("/scheduled");
}

export async function publishIgQueuedNow(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    await publishIgItemNow(id);
  } catch {
    // item will show as failed with the error message
  }
  revalidatePath("/scheduled");
  revalidatePath("/published");
}

export async function rescheduleIg(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const scheduledAt = Number(formData.get("scheduledAt"));
  if (!id || !Number.isFinite(scheduledAt)) {
    return { ok: false, message: "Invalid reschedule request." };
  }
  const problem = validateScheduleTime(scheduledAt);
  if (problem) return { ok: false, message: problem };
  try {
    await rescheduleIgItem(id, scheduledAt);
  } catch (e) {
    return { ok: false, message: errMessage(e) };
  }
  revalidatePath("/scheduled");
  return { ok: true, message: "Post rescheduled." };
}

// ── LinkedIn queue management ─────────────────────────────────────

export async function cancelLiQueued(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    await deleteLiItem(id);
  } catch {
    // refresh shows current state
  }
  revalidatePath("/scheduled");
}

export async function publishLiQueuedNow(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    await publishLiItemNow(id);
  } catch {
    // item will show as failed with the error message
  }
  revalidatePath("/scheduled");
  revalidatePath("/published");
}

export async function rescheduleLi(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const scheduledAt = Number(formData.get("scheduledAt"));
  if (!id || !Number.isFinite(scheduledAt)) {
    return { ok: false, message: "Invalid reschedule request." };
  }
  const problem = validateScheduleTime(scheduledAt);
  if (problem) return { ok: false, message: problem };
  try {
    await rescheduleLiItem(id, scheduledAt);
  } catch (e) {
    return { ok: false, message: errMessage(e) };
  }
  revalidatePath("/scheduled");
  return { ok: true, message: "Post rescheduled." };
}

export async function cancelScheduled(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    const page = await getActivePage();
    if (page) await deletePost(page, id);
  } catch {
    // Surfaced on refresh; deletion errors are rare (already published/deleted)
  }
  revalidatePath("/scheduled");
}

export async function publishScheduledNow(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    const page = await getActivePage();
    if (page) await publishNow(page, id);
  } catch {
    // ignore — list refresh will show current state
  }
  revalidatePath("/scheduled");
  revalidatePath("/published");
}

export async function reschedule(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const scheduledAt = Number(formData.get("scheduledAt"));
  if (!id || !Number.isFinite(scheduledAt)) {
    return { ok: false, message: "Invalid reschedule request." };
  }
  const problem = validateScheduleTime(scheduledAt);
  if (problem) return { ok: false, message: problem };

  try {
    const page = await getActivePage();
    if (!page) return { ok: false, message: "No Facebook page configured." };
    await reschedulePost(page, id, scheduledAt);
  } catch (e) {
    return { ok: false, message: errMessage(e) };
  }
  revalidatePath("/scheduled");
  return { ok: true, message: "Post rescheduled." };
}
