"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/app/actions";
import {
  createBlogPost,
  deleteBlogPost,
  publishBlogPostNow,
  rescheduleBlogPost,
  slugify,
  unpublishBlogPost,
  updateBlogPost,
  type BlogCtaVariant,
  type BlogPostInput,
} from "@/lib/blog";

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

/**
 * Shared by create + update: read the composer form into a BlogPostInput.
 *
 * Mode is just the two values blog-app's own `status` enum supports —
 * "draft" (hidden) or "publish" (live once `publishedAt` arrives). A
 * future `publishedAt` under "publish" is what makes it "scheduled";
 * there's no third state to keep in sync with blog-app's schema.
 */
function readForm(formData: FormData): { input: BlogPostInput; mode: "draft" | "publish" } {
  const title = String(formData.get("title") ?? "").trim();
  const slugRaw = String(formData.get("slug") ?? "").trim();
  const mode = (String(formData.get("mode") ?? "draft") as "draft" | "publish");
  const publishedAtLocal = String(formData.get("publishedAt") ?? "");
  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const status = mode === "draft" ? "draft" : "published";
  const publishedAt =
    mode === "publish"
      ? new Date(publishedAtLocal || Date.now()).toISOString()
      : undefined;

  const input: BlogPostInput = {
    title,
    slug: slugRaw ? slugify(slugRaw) : slugify(title),
    excerpt: String(formData.get("excerpt") ?? "").trim() || undefined,
    body: String(formData.get("body") ?? "").trim() || undefined,
    coverImage: String(formData.get("coverImage") ?? "").trim() || undefined,
    coverAlt: String(formData.get("coverAlt") ?? "").trim() || undefined,
    category: String(formData.get("category") ?? "").trim() || undefined,
    tags,
    author: String(formData.get("author") ?? "").trim() || undefined,
    authorRole: String(formData.get("authorRole") ?? "").trim() || undefined,
    status,
    publishedAt,
    seoTitle: String(formData.get("seoTitle") ?? "").trim() || undefined,
    seoDescription: String(formData.get("seoDescription") ?? "").trim() || undefined,
    ctaVariant: (String(formData.get("ctaVariant") ?? "free-audit") as BlogCtaVariant) || undefined,
    featured: formData.get("featured") === "on",
    funnelStage: String(formData.get("funnelStage") ?? "").trim() || undefined,
    cluster: String(formData.get("cluster") ?? "").trim() || undefined,
  };

  return { input, mode };
}

export async function createBlogPostAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const { input } = readForm(formData);
  if (!input.title) return { ok: false, message: "Title is required." };
  if (!input.slug) return { ok: false, message: "Slug is required." };

  let id: string;
  try {
    id = await createBlogPost(input);
  } catch (e) {
    return { ok: false, message: errMessage(e) };
  }

  revalidatePath("/blog");
  redirect(`/blog/${id}/edit?created=1`);
}

export async function updateBlogPostAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Missing post id." };

  const { input } = readForm(formData);
  if (!input.title) return { ok: false, message: "Title is required." };
  if (!input.slug) return { ok: false, message: "Slug is required." };

  try {
    await updateBlogPost(id, input);
  } catch (e) {
    return { ok: false, message: errMessage(e) };
  }

  revalidatePath("/blog");
  return { ok: true, message: "Saved." };
}

export async function deleteBlogPostAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    await deleteBlogPost(id);
  } catch {
    // list refresh shows current state
  }
  revalidatePath("/blog");
}

export async function publishBlogPostNowAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    await publishBlogPostNow(id);
  } catch {
    // list refresh shows current state
  }
  revalidatePath("/blog");
}

export async function unpublishBlogPostAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  try {
    await unpublishBlogPost(id);
  } catch {
    // list refresh shows current state
  }
  revalidatePath("/blog");
}

export async function rescheduleBlogPostAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  const when = String(formData.get("when") ?? "");
  if (!id || !when) return { ok: false, message: "Pick a date and time." };
  try {
    await rescheduleBlogPost(id, new Date(when).toISOString());
  } catch (e) {
    return { ok: false, message: errMessage(e) };
  }
  revalidatePath("/blog");
  return { ok: true, message: "Rescheduled." };
}
