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
import { igQueueConfigured } from "@/lib/env";
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
import { ACTIVE_PAGE_COOKIE, getActivePage } from "@/lib/pages";
import { uploadIgVideo } from "@/lib/storage";

export type ActionState = {
  ok: boolean;
  message: string;
} | null;

function errMessage(e: unknown): string {
  if (e instanceof GraphError) return `Facebook: ${e.message}`;
  if (e instanceof Error) return e.message;
  return "Something went wrong.";
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
  const scheduledAtRaw = String(formData.get("scheduledAt") ?? "").trim();
  const scheduledAt = scheduledAtRaw ? Number(scheduledAtRaw) : undefined;
  const toFb = formData.get("dest_fb") === "on";
  const toIg = formData.get("dest_ig") === "on";

  // ── Validation ──
  if (!toFb && !toIg) {
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
    if (toIg) {
      return {
        ok: false,
        message:
          "Instagram doesn't support link posts (URLs in captions aren't clickable). Post the link to Facebook only, or attach media for Instagram and put the link in the caption text.",
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

  try {
    const page = await getActivePage();
    if (!page) return { ok: false, message: "No Facebook page configured." };

    let ig: { id: string; username?: string } | null = null;
    if (toIg) {
      ig = await getIgAccount(page);
      if (!ig) {
        return {
          ok: false,
          message: `No Instagram professional account is linked to "${page.name}". Link one in Meta Business Suite → Settings → Linked accounts.`,
        };
      }
    }

    // Upload photos once; FB attaches them, IG uses their CDN URLs.
    const mediaFbids: string[] = [];
    for (const photo of photos) {
      mediaFbids.push((await uploadUnpublishedPhoto(page, photo)).id);
    }

    const done: string[] = [];

    // ── Facebook ──
    if (toFb) {
      if (video) {
        await createVideoPost(page, {
          description: message,
          video,
          scheduledAt,
        });
        done.push(scheduledAt ? "Facebook video (scheduled)" : "Facebook video");
      } else if (mediaFbids.length > 0) {
        await createFeedPostWithMedia(page, {
          caption: message,
          mediaFbids,
          scheduledAt,
        });
        const label = mediaFbids.length > 1 ? "Facebook (multi-photo)" : "Facebook";
        done.push(scheduledAt ? `${label} (scheduled)` : label);
      } else {
        await createTextPost(page, {
          message,
          link: link || undefined,
          scheduledAt,
        });
        const label = link ? "Facebook link post" : "Facebook";
        done.push(scheduledAt ? `${label} (scheduled)` : label);
      }
    }

    // ── Instagram ──
    if (toIg && ig) {
      if (video) {
        // Reels always go through the queue: processing takes minutes.
        const fileId = await uploadIgVideo(video);
        await enqueueIgPost({
          pageId: page.id,
          igUserId: ig.id,
          igUsername: ig.username,
          caption: message,
          mediaType: "reel",
          mediaRefs: [fileId],
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
          mediaType: mediaFbids.length > 1 ? "carousel" : "image",
          mediaRefs: mediaFbids,
          scheduledAt,
        });
        done.push(
          mediaFbids.length > 1
            ? "Instagram carousel (queued)"
            : "Instagram (queued)"
        );
      } else if (mediaFbids.length > 1) {
        await publishCarouselToIg(page, ig.id, {
          caption: message,
          fbPhotoIds: mediaFbids,
        });
        done.push("Instagram carousel");
      } else {
        await publishImageToIg(page, ig.id, {
          caption: message,
          fbPhotoId: mediaFbids[0],
        });
        done.push("Instagram");
      }
    }

    revalidatePath("/scheduled");
    revalidatePath("/published");
    revalidatePath("/calendar");
    return {
      ok: true,
      message: `Done: ${done.join(" + ")} — page "${page.name}".`,
    };
  } catch (e) {
    return { ok: false, message: errMessage(e) };
  }
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
