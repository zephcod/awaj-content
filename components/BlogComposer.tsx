"use client";

import { useActionState, useState } from "react";
import { createBlogPostAction, updateBlogPostAction } from "@/app/blogActions";
import { estimateReadingMinutes, slugify, type BlogCategory, type BlogPost } from "@/lib/blog";

/** datetime-local value for a Date, in the browser's local time. */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

const CTA_OPTIONS = [
  ["free-audit", "Free audit"],
  ["book-call", "Book a call"],
  ["all-in-one", "All-in-one"],
  ["case-study", "Case study"],
  ["none", "None"],
] as const;

export default function BlogComposer({
  post,
  categories,
}: {
  /** Present when editing an existing post; absent when creating one. */
  post?: BlogPost;
  categories: BlogCategory[];
}) {
  const action = post ? updateBlogPostAction : createBlogPostAction;
  const [state, formAction, pending] = useActionState(action, null);

  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(post));
  const [body, setBody] = useState(post?.body ?? "");
  const [mode, setMode] = useState<"draft" | "publish">(
    post?.status === "published" ? "publish" : "draft"
  );

  const defaultWhen = post?.publishedAt
    ? toLocalInputValue(new Date(post.publishedAt))
    : toLocalInputValue(new Date());

  function onTitleChange(v: string) {
    setTitle(v);
    if (!slugTouched) setSlug(slugify(v));
  }

  const readMinutes = estimateReadingMinutes(body);

  return (
    <form
      action={formAction}
      className="rounded-lg border border-edge bg-card p-5 shadow-sm"
    >
      {post && <input type="hidden" name="id" value={post.$id} />}

      <label className="block">
        <span className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
          Title
        </span>
        <input
          type="text"
          name="title"
          required
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="How Awaj ET helps SMEs grow online"
          className="mt-2 w-full rounded-md border border-edge bg-input px-3 py-2.5 text-sm focus:outline-2 focus:outline-gold"
        />
      </label>

      <label className="mt-4 block">
        <span className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
          Slug
        </span>
        <input
          type="text"
          name="slug"
          required
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(slugify(e.target.value));
          }}
          placeholder="how-awaj-et-helps-smes-grow-online"
          className="mt-2 w-full rounded-md border border-edge bg-input px-3 py-2.5 font-mono text-sm focus:outline-2 focus:outline-gold"
        />
        <span className="mt-1.5 block font-mono text-[10px] text-muted">
          URL: /blog/{slug || "…"}
        </span>
      </label>

      <label className="mt-4 block">
        <span className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
          Excerpt
        </span>
        <textarea
          name="excerpt"
          rows={2}
          defaultValue={post?.excerpt ?? ""}
          placeholder="One or two sentences shown on the blog list and in link previews."
          className="mt-2 w-full resize-y rounded-md border border-edge bg-input px-3 py-2.5 text-sm focus:outline-2 focus:outline-gold"
        />
      </label>

      <label className="mt-4 block">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
            Body (Markdown)
          </span>
          <span className="font-mono text-[10px] text-muted">
            ~{readMinutes} min read
          </span>
        </div>
        <textarea
          name="body"
          rows={16}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="# Heading&#10;&#10;Write the post in Markdown…"
          className="mt-2 w-full resize-y rounded-md border border-edge bg-input px-3 py-2.5 font-mono text-xs leading-relaxed focus:outline-2 focus:outline-gold"
        />
      </label>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
            Cover image URL
          </span>
          <input
            type="url"
            name="coverImage"
            defaultValue={post?.coverImage ?? ""}
            placeholder="https://…"
            className="mt-2 w-full rounded-md border border-edge bg-input px-3 py-2.5 text-sm focus:outline-2 focus:outline-gold"
          />
        </label>
        <label className="block">
          <span className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
            Cover alt text
          </span>
          <input
            type="text"
            name="coverAlt"
            defaultValue={post?.coverAlt ?? ""}
            className="mt-2 w-full rounded-md border border-edge bg-input px-3 py-2.5 text-sm focus:outline-2 focus:outline-gold"
          />
        </label>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
            Category
          </span>
          <select
            name="category"
            defaultValue={post?.category ?? ""}
            className="mt-2 w-full rounded-md border border-edge bg-input px-3 py-2.5 text-sm focus:outline-2 focus:outline-gold"
          >
            <option value="">None</option>
            {categories.map((c) => (
              <option key={c.$id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
            Tags (comma-separated)
          </span>
          <input
            type="text"
            name="tags"
            defaultValue={(post?.tags ?? []).join(", ")}
            placeholder="marketing, SEO, Ethiopia"
            className="mt-2 w-full rounded-md border border-edge bg-input px-3 py-2.5 text-sm focus:outline-2 focus:outline-gold"
          />
        </label>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
            Author
          </span>
          <input
            type="text"
            name="author"
            defaultValue={post?.author ?? ""}
            className="mt-2 w-full rounded-md border border-edge bg-input px-3 py-2.5 text-sm focus:outline-2 focus:outline-gold"
          />
        </label>
        <label className="block">
          <span className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
            Author role
          </span>
          <input
            type="text"
            name="authorRole"
            defaultValue={post?.authorRole ?? ""}
            className="mt-2 w-full rounded-md border border-edge bg-input px-3 py-2.5 text-sm focus:outline-2 focus:outline-gold"
          />
        </label>
      </div>

      <details className="mt-4 rounded-md border border-edge">
        <summary className="cursor-pointer px-3 py-2 font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
          SEO &amp; funnel (optional)
        </summary>
        <div className="grid grid-cols-1 gap-4 border-t border-edge p-3 sm:grid-cols-2">
          <label className="block">
            <span className="font-mono text-[10px] text-muted uppercase">SEO title</span>
            <input
              type="text"
              name="seoTitle"
              defaultValue={post?.seoTitle ?? ""}
              className="mt-1 w-full rounded-md border border-edge bg-input px-3 py-2 text-sm focus:outline-2 focus:outline-gold"
            />
          </label>
          <label className="block">
            <span className="font-mono text-[10px] text-muted uppercase">SEO description</span>
            <input
              type="text"
              name="seoDescription"
              defaultValue={post?.seoDescription ?? ""}
              className="mt-1 w-full rounded-md border border-edge bg-input px-3 py-2 text-sm focus:outline-2 focus:outline-gold"
            />
          </label>
          <label className="block">
            <span className="font-mono text-[10px] text-muted uppercase">CTA</span>
            <select
              name="ctaVariant"
              defaultValue={post?.ctaVariant ?? "free-audit"}
              className="mt-1 w-full rounded-md border border-edge bg-input px-3 py-2 text-sm focus:outline-2 focus:outline-gold"
            >
              {CTA_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="font-mono text-[10px] text-muted uppercase">Funnel stage</span>
            <input
              type="text"
              name="funnelStage"
              defaultValue={post?.funnelStage ?? ""}
              placeholder="TOFU / MOFU / BOFU"
              className="mt-1 w-full rounded-md border border-edge bg-input px-3 py-2 text-sm focus:outline-2 focus:outline-gold"
            />
          </label>
          <label className="block">
            <span className="font-mono text-[10px] text-muted uppercase">Cluster</span>
            <input
              type="text"
              name="cluster"
              defaultValue={post?.cluster ?? ""}
              className="mt-1 w-full rounded-md border border-edge bg-input px-3 py-2 text-sm focus:outline-2 focus:outline-gold"
            />
          </label>
          <label className="mt-1 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="featured"
              defaultChecked={Boolean(post?.featured)}
              className="h-3.5 w-3.5 accent-gold"
            />
            Featured post
          </label>
        </div>
      </details>

      {/* Publish state */}
      <div className="mt-5 border-t border-edge pt-4">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["draft", "Save as draft"],
              ["publish", "Publish / schedule"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                mode === value
                  ? "bg-navy text-gold"
                  : "border border-edge text-muted hover:text-fg"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <input type="hidden" name="mode" value={mode} />

        {mode === "publish" && (
          <div className="mt-3">
            <input
              type="datetime-local"
              name="publishedAt"
              defaultValue={defaultWhen}
              className="rounded-md border border-edge bg-input px-3 py-2 text-sm focus:outline-2 focus:outline-gold"
            />
            <p className="mt-2 font-mono text-[10px] text-muted">
              Leave this at the current time to publish immediately, or pick a
              future date/time to schedule it — the post stays hidden on the
              blog until then, with no extra step needed here.
            </p>
          </div>
        )}
        {mode === "draft" && (
          <p className="mt-3 font-mono text-[10px] text-muted">
            Drafts never appear on the blog until switched to Publish.
          </p>
        )}
      </div>

      {state && (
        <p
          className={`mt-4 rounded-md px-3 py-2 font-mono text-[11px] ${
            state.ok
              ? "bg-gold/15 text-amber"
              : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
          }`}
        >
          {state.message}
        </p>
      )}

      <button
        disabled={pending}
        className="mt-4 rounded-md bg-gold px-5 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-amber hover:text-white disabled:opacity-50"
      >
        {pending ? "Saving…" : post ? "Save changes" : "Create post"}
      </button>
    </form>
  );
}
