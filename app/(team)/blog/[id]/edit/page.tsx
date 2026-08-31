import Link from "next/link";
import BlogComposer from "@/components/BlogComposer";
import { blogConfigured } from "@/lib/env";
import { getBlogPost, listBlogCategories, type BlogCategory, type BlogPost } from "@/lib/blog";

export const dynamic = "force-dynamic";

export default async function EditBlogPostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const { created } = await searchParams;

  let post: BlogPost | null = null;
  let categories: BlogCategory[] = [];
  let error: string | null = null;

  if (!blogConfigured()) {
    error = "Appwrite is not connected — add APPWRITE_* credentials to .env first.";
  } else {
    try {
      [post, categories] = await Promise.all([getBlogPost(id), listBlogCategories()]);
    } catch (e) {
      error = e instanceof Error ? e.message : "Could not load this post.";
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Edit blog post</h1>
        <Link href="/blog" className="font-mono text-[11px] text-muted underline hover:text-amber">
          ← Back to Blog
        </Link>
      </div>

      {created && (
        <p className="mt-4 rounded-md bg-gold/15 px-4 py-3 text-sm text-amber">
          Post created. Keep editing, or head back to the list.
        </p>
      )}

      {error && (
        <p className="mt-6 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {!error && post && (
        <div className="mt-6">
          <BlogComposer post={post} categories={categories} />
        </div>
      )}
    </div>
  );
}
