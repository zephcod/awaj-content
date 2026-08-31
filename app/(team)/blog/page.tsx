import { Plus } from "lucide-react";
import Link from "next/link";
import BlogList from "@/components/BlogList";
import { blogConfigured, env } from "@/lib/env";
import { listBlogPosts, type BlogPost } from "@/lib/blog";

export const dynamic = "force-dynamic";

export default async function BlogPage() {
  let posts: BlogPost[] = [];
  let error: string | null = null;

  if (!blogConfigured()) {
    error = "Appwrite is not connected — add APPWRITE_* credentials to .env first.";
  } else {
    try {
      posts = await listBlogPosts();
    } catch (e) {
      error = e instanceof Error ? e.message : "Could not load blog posts.";
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Blog</h1>
          <p className="mt-1 text-sm text-muted">
            Write, schedule and publish posts with Awaj Blog CMS.
          </p>
        </div>
        <Link
          href="/blog/new"
          className="flex items-center gap-1.5 rounded-md bg-gold px-4 py-2 text-sm font-semibold text-navy hover:bg-amber hover:text-white"
        >
          <Plus className="h-4 w-4" />
          New
        </Link>
      </div>

      {error && (
        <p className="mt-6 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {!error && posts.length === 0 && (
        <div className="mt-10 rounded-lg border border-dashed border-edge bg-card/60 p-10 text-center">
          <p className="text-sm text-muted">
            No posts yet. Start one and either save it as a draft or schedule
            it to go live.
          </p>
        </div>
      )}

      {!error && posts.length > 0 && <BlogList posts={posts} siteUrl={env.blogSiteUrl()} />}
    </div>
  );
}
