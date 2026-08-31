import BlogComposer from "@/components/BlogComposer";
import { blogConfigured } from "@/lib/env";
import { listBlogCategories, type BlogCategory } from "@/lib/blog";

export const dynamic = "force-dynamic";

export default async function NewBlogPostPage() {
  let categories: BlogCategory[] = [];
  let error: string | null = null;

  if (!blogConfigured()) {
    error = "Appwrite is not connected — add APPWRITE_* credentials to .env first.";
  } else {
    try {
      categories = await listBlogCategories();
    } catch (e) {
      error = e instanceof Error ? e.message : "Could not load categories.";
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl font-bold">New blog post</h1>
      <p className="mt-1 text-sm text-muted">
        Save as a draft, or set Publish and pick a time to schedule it.
      </p>

      {error && (
        <p className="mt-6 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {!error && (
        <div className="mt-6">
          <BlogComposer categories={categories} />
        </div>
      )}
    </div>
  );
}
