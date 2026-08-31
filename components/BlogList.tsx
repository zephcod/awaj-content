"use client";

import { ExternalLink, Pencil, Search, Send, Trash2, Undo2, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  deleteBlogPostAction,
  publishBlogPostNowAction,
  unpublishBlogPostAction,
} from "@/app/blogActions";
import BlogRescheduleForm from "@/components/BlogRescheduleForm";
import { blogPostState, type BlogPost, type BlogPostState } from "@/lib/blog";
import { fmtDateTime, relativeFromNow } from "@/lib/format";

const STATE_LABEL: Record<BlogPostState, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  live: "Live",
};

const STATE_CLASS: Record<BlogPostState, string> = {
  draft: "bg-navy/5 text-muted",
  scheduled: "bg-amber-400/15 text-amber",
  live: "bg-green-500/15 text-green-700 dark:text-green-400",
};

const STATE_ORDER = ["scheduled", "draft", "live"] as const;

/** Lowercased blob of everything a search might reasonably match against. */
function haystack(post: BlogPost): string {
  return [post.title, post.slug, post.excerpt, post.category, post.author, ...(post.tags ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export default function BlogList({
  posts,
  siteUrl,
}: {
  /** Already sorted most-recently-updated first (see lib/blog.ts's listBlogPosts). */
  posts: BlogPost[];
  siteUrl: string;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return posts;
    return posts.filter((p) => haystack(p).includes(q));
  }, [posts, query]);

  const groups: Record<BlogPostState, BlogPost[]> = { scheduled: [], draft: [], live: [] };
  for (const p of filtered) groups[blogPostState(p)].push(p);

  return (
    <>
      <div className="relative mt-6">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by title, slug, category, tag, or author…"
          className="w-full rounded-md border border-edge bg-input py-2.5 pr-9 pl-9 text-sm focus:outline-2 focus:outline-gold"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear search"
            className="absolute top-1/2 right-3 -translate-y-1/2 text-muted hover:text-fg"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {query && (
        <p className="mt-2 font-mono text-[11px] text-muted">
          {filtered.length} of {posts.length} post{posts.length === 1 ? "" : "s"} match
        </p>
      )}

      {query && filtered.length === 0 && (
        <div className="mt-10 rounded-lg border border-dashed border-edge bg-card/60 p-10 text-center">
          <p className="text-sm text-muted">No posts match &ldquo;{query}&rdquo;.</p>
        </div>
      )}

      {STATE_ORDER.map((state) =>
        groups[state].length > 0 ? (
          <div key={state} className="mt-8">
            <h2 className="font-mono text-xs font-semibold tracking-[0.14em] text-muted uppercase">
              {STATE_LABEL[state]} ({groups[state].length})
            </h2>
            <ul className="mt-3 flex flex-col gap-3">
              {groups[state].map((post) => {
                const s = blogPostState(post);
                return (
                  <li
                    key={post.$id}
                    className="rounded-lg border border-edge bg-card p-4 shadow-sm"
                  >
                    <div className="flex gap-4">
                      {post.coverImage && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={post.coverImage}
                          alt={post.coverAlt || ""}
                          className="h-20 w-20 shrink-0 rounded-md border border-edge object-cover"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span
                            className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${STATE_CLASS[s]}`}
                          >
                            {STATE_LABEL[s]}
                          </span>
                          {post.publishedAt && (
                            <>
                              <span className="font-mono text-xs font-semibold text-amber">
                                {fmtDateTime(post.publishedAt)} EAT
                              </span>
                              <span className="font-mono text-[10px] text-muted">
                                {relativeFromNow(
                                  Math.floor(new Date(post.publishedAt).getTime() / 1000)
                                )}
                              </span>
                            </>
                          )}
                          {post.category && (
                            <span className="rounded-full bg-navy/5 px-2 py-0.5 font-mono text-[10px] text-muted">
                              {post.category}
                            </span>
                          )}
                        </div>

                        <h3 className="mt-2 font-display text-base font-semibold">
                          {post.title || <span className="text-muted italic">(untitled)</span>}
                        </h3>
                        <p className="mt-0.5 font-mono text-[11px] text-muted">/blog/{post.slug}</p>
                        {post.excerpt && (
                          <p className="mt-2 text-sm text-muted line-clamp-2">{post.excerpt}</p>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-edge pt-3">
                      <Link
                        href={`/blog/${post.$id}/edit`}
                        className="flex items-center gap-1 font-mono text-[11px] text-muted underline hover:text-amber"
                      >
                        <Pencil className="h-3 w-3" />
                        Edit
                      </Link>

                      {s !== "live" && (
                        <form action={publishBlogPostNowAction}>
                          <input type="hidden" name="id" value={post.$id} />
                          <button className="flex items-center gap-1 font-mono text-[11px] text-muted underline hover:text-amber">
                            <Send className="h-3 w-3" />
                            Publish now
                          </button>
                        </form>
                      )}

                      {s === "scheduled" && (
                        <BlogRescheduleForm postId={post.$id} currentIso={post.publishedAt} />
                      )}

                      {s !== "draft" && (
                        <form action={unpublishBlogPostAction}>
                          <input type="hidden" name="id" value={post.$id} />
                          <button className="flex items-center gap-1 font-mono text-[11px] text-muted underline hover:text-amber">
                            <Undo2 className="h-3 w-3" />
                            Back to draft
                          </button>
                        </form>
                      )}

                      {s === "live" && siteUrl && (
                        <a
                          href={`${siteUrl}/blog/${post.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 font-mono text-[11px] text-muted underline hover:text-amber"
                        >
                          <ExternalLink className="h-3 w-3" />
                          View live
                        </a>
                      )}

                      <form action={deleteBlogPostAction}>
                        <input type="hidden" name="id" value={post.$id} />
                        <button className="flex items-center gap-1 font-mono text-[11px] text-red-600 underline hover:text-red-700">
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </button>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null
      )}
    </>
  );
}
