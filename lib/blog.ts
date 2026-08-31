/**
 * Blog-post authoring + scheduling, backed by the same shared Appwrite
 * database as the fb/ig/li queues (see lib/env.ts's blogConfigured()) —
 * but writing into the `blog_posts` collection the sister blog-app
 * (../blog-app) reads from, not a collection of our own.
 *
 * Unlike the social queues, this needs no publish worker or cron route.
 * The blog-app already treats `status: "published"` + a future
 * `publishedAt` as "hidden until that time" (blog-app/lib/blog.ts's
 * getPublishedPosts filters out anything dated in the future) — so
 * "scheduling" a post here is just writing that document with tomorrow's
 * date; the blog site itself flips it live with no action on our side.
 * The only caveat (inherent to blog-app's ISR revalidate=300, not fixable
 * from here) is that a newly-due post can lag up to ~5 minutes, or longer
 * on a low-traffic day, before the next request regenerates the page.
 */

import { Client, Databases, ID, Query } from "node-appwrite";
import { env } from "./env";

export const BLOG_POSTS_COLLECTION = "blog_posts";
export const BLOG_CATEGORIES_COLLECTION = "blog_categories";

export type BlogPostStatus = "draft" | "published";
export type BlogCtaVariant =
  | "book-call"
  | "free-audit"
  | "all-in-one"
  | "case-study"
  | "none";

/** Derived, UI-facing state — not an Appwrite field (see file header). */
export type BlogPostState = "draft" | "scheduled" | "live";

export type BlogPost = {
  $id: string;
  $createdAt: string;
  $updatedAt: string;
  title: string;
  slug: string;
  excerpt?: string;
  body?: string;
  coverImage?: string;
  coverAlt?: string;
  category?: string;
  tags?: string[];
  author?: string;
  authorRole?: string;
  status: BlogPostStatus;
  /** ISO datetime. Future = scheduled; past/absent = live once status is "published". */
  publishedAt?: string;
  readingMinutes?: number;
  seoTitle?: string;
  seoDescription?: string;
  ctaVariant?: BlogCtaVariant;
  featured?: boolean;
  funnelStage?: string;
  cluster?: string;
};

export type BlogCategory = {
  $id: string;
  name: string;
  slug: string;
};

export type BlogPostInput = {
  title: string;
  slug: string;
  excerpt?: string;
  body?: string;
  coverImage?: string;
  coverAlt?: string;
  category?: string;
  tags?: string[];
  author?: string;
  authorRole?: string;
  status: BlogPostStatus;
  publishedAt?: string;
  readingMinutes?: number;
  seoTitle?: string;
  seoDescription?: string;
  ctaVariant?: BlogCtaVariant;
  featured?: boolean;
  funnelStage?: string;
  cluster?: string;
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

// ── Transient-error retry ────────────────────────────────────────
//
// Appwrite Cloud sits behind a CDN edge that occasionally returns an
// empty body / "first byte timeout" (or 429/5xx) under bursts of
// requests — blog-app's lib/appwrite.ts hits the same thing against
// this same database and works around it the same way. Retry those
// with exponential backoff + jitter rather than surfacing a raw
// SyntaxError from node-appwrite trying to JSON.parse an empty response.

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

function isRetryable(e: unknown): boolean {
  const err = e as { code?: number; message?: string };
  if (typeof err.code === "number" && RETRYABLE.has(err.code)) return true;
  return /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|first byte timeout|unexpected end of json/i.test(
    err.message ?? ""
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let delay = 400;
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts - 1 || !isRetryable(e)) throw e;
      await sleep(delay + Math.random() * 250);
      delay = Math.min(delay * 2, 6000);
    }
  }
}

/** Same estimate blog-app falls back to when readingMinutes is left blank. */
export function estimateReadingMinutes(markdown: string | undefined): number {
  if (!markdown) return 1;
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export function slugify(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ሀ-፿]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

/** draft / scheduled / live, derived from status + publishedAt — see file header. */
export function blogPostState(post: Pick<BlogPost, "status" | "publishedAt">): BlogPostState {
  if (post.status !== "published") return "draft";
  if (post.publishedAt && new Date(post.publishedAt).getTime() > Date.now()) return "scheduled";
  return "live";
}

// ── Reads ─────────────────────────────────────────────────────────

/**
 * Every post (any status), most recently touched first — the admin list
 * needs all of them. Ordered by $updatedAt rather than $createdAt so an
 * edited draft or a just-rescheduled post rises back to the top, not
 * just brand-new ones.
 */
export async function listBlogPosts(): Promise<BlogPost[]> {
  const res = await withRetry(() =>
    db().listDocuments(DB(), BLOG_POSTS_COLLECTION, [
      Query.orderDesc("$updatedAt"),
      Query.limit(200),
    ])
  );
  return res.documents as unknown as BlogPost[];
}

export async function getBlogPost(id: string): Promise<BlogPost> {
  return (await withRetry(() =>
    db().getDocument(DB(), BLOG_POSTS_COLLECTION, id)
  )) as unknown as BlogPost;
}

export async function listBlogCategories(): Promise<BlogCategory[]> {
  const res = await withRetry(() =>
    db().listDocuments(DB(), BLOG_CATEGORIES_COLLECTION, [Query.limit(100)])
  );
  return res.documents as unknown as BlogCategory[];
}

async function slugTaken(slug: string, excludeId?: string): Promise<boolean> {
  const res = await withRetry(() =>
    db().listDocuments(DB(), BLOG_POSTS_COLLECTION, [Query.equal("slug", slug), Query.limit(2)])
  );
  return res.documents.some((d) => d.$id !== excludeId);
}

// ── Writes ────────────────────────────────────────────────────────

function toDoc(input: BlogPostInput) {
  return {
    title: input.title.slice(0, 200),
    slug: input.slug.slice(0, 160),
    excerpt: input.excerpt?.slice(0, 500) || undefined,
    body: input.body?.slice(0, 200000) || undefined,
    coverImage: input.coverImage?.slice(0, 1000) || undefined,
    coverAlt: input.coverAlt?.slice(0, 250) || undefined,
    category: input.category || undefined,
    tags: input.tags?.filter(Boolean).slice(0, 20) ?? [],
    author: input.author?.slice(0, 120) || undefined,
    authorRole: input.authorRole?.slice(0, 140) || undefined,
    status: input.status,
    publishedAt: input.publishedAt || undefined,
    readingMinutes: input.readingMinutes ?? estimateReadingMinutes(input.body),
    seoTitle: input.seoTitle?.slice(0, 200) || undefined,
    seoDescription: input.seoDescription?.slice(0, 320) || undefined,
    ctaVariant: input.ctaVariant || "free-audit",
    featured: Boolean(input.featured),
    funnelStage: input.funnelStage?.slice(0, 40) || undefined,
    cluster: input.cluster?.slice(0, 120) || undefined,
  };
}

export async function createBlogPost(input: BlogPostInput): Promise<string> {
  if (await slugTaken(input.slug)) {
    throw new Error(`Slug "${input.slug}" is already used by another post.`);
  }
  const doc = await withRetry(() =>
    db().createDocument(DB(), BLOG_POSTS_COLLECTION, ID.unique(), toDoc(input))
  );
  return doc.$id;
}

export async function updateBlogPost(id: string, input: BlogPostInput): Promise<void> {
  if (await slugTaken(input.slug, id)) {
    throw new Error(`Slug "${input.slug}" is already used by another post.`);
  }
  await withRetry(() => db().updateDocument(DB(), BLOG_POSTS_COLLECTION, id, toDoc(input)));
}

export async function deleteBlogPost(id: string): Promise<void> {
  await withRetry(() => db().deleteDocument(DB(), BLOG_POSTS_COLLECTION, id));
}

/** Reschedule (or schedule) a post's go-live time without touching its content. */
export async function rescheduleBlogPost(id: string, publishedAt: string): Promise<void> {
  await withRetry(() =>
    db().updateDocument(DB(), BLOG_POSTS_COLLECTION, id, {
      status: "published",
      publishedAt,
    })
  );
}

/** Make a draft/scheduled post go live immediately. */
export async function publishBlogPostNow(id: string): Promise<void> {
  await withRetry(() =>
    db().updateDocument(DB(), BLOG_POSTS_COLLECTION, id, {
      status: "published",
      publishedAt: new Date().toISOString(),
    })
  );
}

/** Pull a scheduled (not-yet-live) or live post back to draft. */
export async function unpublishBlogPost(id: string): Promise<void> {
  await withRetry(() =>
    db().updateDocument(DB(), BLOG_POSTS_COLLECTION, id, { status: "draft" })
  );
}
