import { Clapperboard, LayoutGrid, Plus, Send, Trash2 } from "lucide-react";
import Link from "next/link";
import {
  cancelIgQueued,
  cancelLiQueued,
  cancelScheduled,
  publishIgQueuedNow,
  publishLiQueuedNow,
  publishScheduledNow,
} from "@/app/actions";
import { FacebookGlyph, InstagramGlyph, LinkedInGlyph } from "@/components/icons/BrandGlyphs";
import RescheduleForm from "@/components/RescheduleForm";
import { fbConfigured, igQueueConfigured, liQueueConfigured } from "@/lib/env";
import { listScheduledPosts, type ScheduledPost } from "@/lib/facebook";
import { fmtDateTime, relativeFromNow } from "@/lib/format";
import { listIgQueue, type IgQueueItem } from "@/lib/igqueue";
import { listLiQueue, type LiQueueItem } from "@/lib/liqueue";
import { getActiveLiOrg } from "@/lib/linkedinOrgs";
import { getActivePage } from "@/lib/pages";

export const dynamic = "force-dynamic";

export default async function ScheduledPage() {
  let posts: ScheduledPost[] = [];
  let igItems: IgQueueItem[] = [];
  let liItems: LiQueueItem[] = [];
  let error: string | null = null;
  let igError: string | null = null;
  let liError: string | null = null;
  let pageName = "";

  if (!fbConfigured()) {
    error = "Facebook is not connected — add credentials to .env first.";
  } else {
    try {
      const page = await getActivePage();
      if (!page) throw new Error("No pages resolved from credentials.");
      pageName = page.name;
      posts = await listScheduledPosts(page);
      if (igQueueConfigured()) {
        try {
          igItems = await listIgQueue(page.id);
        } catch (e) {
          igError =
            e instanceof Error ? e.message : "Could not load the IG queue.";
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Could not load posts.";
    }
  }

  // LinkedIn's connection is independent of Facebook's — load regardless
  // of whether FB is configured, and never let it block the FB view.
  if (liQueueConfigured()) {
    try {
      const liOrg = await getActiveLiOrg();
      if (liOrg) liItems = await listLiQueue(liOrg.orgUrn);
    } catch (e) {
      liError = e instanceof Error ? e.message : "Could not load the LinkedIn queue.";
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Scheduled</h1>
          <p className="mt-1 text-sm text-muted">
            {pageName && (
              <span className="font-semibold text-fg">{pageName} · </span>
            )}
            Queued on Facebook — published automatically at the set time
            (shown in Ethiopia time, EAT).
          </p>
        </div>
        <Link
          href="/"
          className="flex items-center gap-1.5 rounded-md bg-gold px-4 py-2 text-sm font-semibold text-navy hover:bg-amber hover:text-white"
        >
          <Plus className="h-4 w-4" />
          New post
        </Link>
      </div>

      {error && (
        <p className="mt-6 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {!error && posts.length === 0 && igItems.length === 0 && liItems.length === 0 && (
        <div className="mt-10 rounded-lg border border-dashed border-edge bg-card/60 p-10 text-center">
          <p className="text-sm text-muted">
            Nothing in the queue. Compose a post and pick a time.
          </p>
        </div>
      )}

      {/* ── Instagram queue ── */}
      {(igItems.length > 0 || igError) && (
        <div className="mt-8">
          <h2 className="flex items-center gap-1.5 font-mono text-xs font-semibold tracking-[0.14em] text-muted uppercase">
            <InstagramGlyph className="h-3.5 w-3.5" /> Instagram queue
          </h2>
          {igError && (
            <p className="mt-3 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {igError}
            </p>
          )}
          <ul className="mt-3 flex flex-col gap-3">
            {igItems.map((item) => (
              <li
                key={item.$id}
                className="rounded-lg border border-edge bg-card p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-xs font-semibold text-amber">
                    {fmtDateTime(item.scheduledAt)} EAT
                  </span>
                  <span className="font-mono text-[10px] text-muted">
                    {relativeFromNow(item.scheduledAt)}
                  </span>
                  {item.igUsername && (
                    <span className="font-mono text-[10px] text-muted">
                      @{item.igUsername}
                    </span>
                  )}
                  {item.mediaType === "carousel" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-navy/5 px-2 py-0.5 font-mono text-[10px] text-muted">
                      <LayoutGrid className="h-3 w-3" /> carousel
                    </span>
                  )}
                  {item.mediaType === "reel" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-navy/5 px-2 py-0.5 font-mono text-[10px] text-muted">
                      <Clapperboard className="h-3 w-3" /> reel
                    </span>
                  )}
                  {item.status === "failed" && (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 font-mono text-[10px] text-red-700 dark:bg-red-950/40 dark:text-red-300">
                      failed
                    </span>
                  )}
                  {item.status === "publishing" && (
                    <span className="rounded-full bg-gold/15 px-2 py-0.5 font-mono text-[10px] text-amber">
                      publishing…
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm whitespace-pre-wrap">
                  {item.caption || (
                    <span className="text-muted italic">(no caption)</span>
                  )}
                </p>
                {item.status === "failed" && item.error && (
                  <p className="mt-2 rounded-md bg-red-50 px-3 py-2 font-mono text-[11px] text-red-700 dark:bg-red-950/40 dark:text-red-300">
                    {item.error}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-edge pt-3">
                  <RescheduleForm
                    postId={item.$id}
                    currentUnix={item.scheduledAt}
                    platform="ig"
                  />
                  <form action={publishIgQueuedNow}>
                    <input type="hidden" name="id" value={item.$id} />
                    <button className="flex items-center gap-1 font-mono text-[11px] text-muted underline hover:text-amber">
                      <Send className="h-3 w-3" />
                      {item.status === "failed" ? "Retry now" : "Publish now"}
                    </button>
                  </form>
                  <form action={cancelIgQueued}>
                    <input type="hidden" name="id" value={item.$id} />
                    <button className="flex items-center gap-1 font-mono text-[11px] text-red-600 underline hover:text-red-700">
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── LinkedIn queue ── */}
      {(liItems.length > 0 || liError) && (
        <div className="mt-8">
          <h2 className="flex items-center gap-1.5 font-mono text-xs font-semibold tracking-[0.14em] text-muted uppercase">
            <LinkedInGlyph className="h-3.5 w-3.5" /> LinkedIn queue
          </h2>
          {liError && (
            <p className="mt-3 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {liError}
            </p>
          )}
          <ul className="mt-3 flex flex-col gap-3">
            {liItems.map((item) => (
              <li
                key={item.$id}
                className="rounded-lg border border-edge bg-card p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-xs font-semibold text-amber">
                    {fmtDateTime(item.scheduledAt)} EAT
                  </span>
                  <span className="font-mono text-[10px] text-muted">
                    {relativeFromNow(item.scheduledAt)}
                  </span>
                  {item.mediaType === "multiImage" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-navy/5 px-2 py-0.5 font-mono text-[10px] text-muted">
                      <LayoutGrid className="h-3 w-3" /> multi-image
                    </span>
                  )}
                  {item.mediaType === "video" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-navy/5 px-2 py-0.5 font-mono text-[10px] text-muted">
                      <Clapperboard className="h-3 w-3" /> video
                    </span>
                  )}
                  {item.status === "failed" && (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 font-mono text-[10px] text-red-700 dark:bg-red-950/40 dark:text-red-300">
                      failed
                    </span>
                  )}
                  {item.status === "publishing" && (
                    <span className="rounded-full bg-gold/15 px-2 py-0.5 font-mono text-[10px] text-amber">
                      publishing…
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm whitespace-pre-wrap">
                  {item.caption || (
                    <span className="text-muted italic">(no caption)</span>
                  )}
                </p>
                {item.status === "failed" && item.error && (
                  <p className="mt-2 rounded-md bg-red-50 px-3 py-2 font-mono text-[11px] text-red-700 dark:bg-red-950/40 dark:text-red-300">
                    {item.error}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-edge pt-3">
                  <RescheduleForm
                    postId={item.$id}
                    currentUnix={item.scheduledAt}
                    platform="li"
                  />
                  <form action={publishLiQueuedNow}>
                    <input type="hidden" name="id" value={item.$id} />
                    <button className="flex items-center gap-1 font-mono text-[11px] text-muted underline hover:text-amber">
                      <Send className="h-3 w-3" />
                      {item.status === "failed" ? "Retry now" : "Publish now"}
                    </button>
                  </form>
                  <form action={cancelLiQueued}>
                    <input type="hidden" name="id" value={item.$id} />
                    <button className="flex items-center gap-1 font-mono text-[11px] text-red-600 underline hover:text-red-700">
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Facebook scheduled ── */}
      {posts.length > 0 && (
        <h2 className="mt-8 flex items-center gap-1.5 font-mono text-xs font-semibold tracking-[0.14em] text-muted uppercase">
          <FacebookGlyph className="h-3.5 w-3.5" /> Facebook scheduled
        </h2>
      )}
      <ul className="mt-3 flex flex-col gap-3">
        {posts.map((p) => (
          <li
            key={p.id}
            className="rounded-lg border border-edge bg-card p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-xs font-semibold text-amber">
                {fmtDateTime(p.scheduled_publish_time)} EAT
              </span>
              <span className="font-mono text-[10px] text-muted">
                {relativeFromNow(p.scheduled_publish_time)}
              </span>
            </div>

            <div className="mt-2 flex gap-4">
              {p.full_picture && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.full_picture}
                  alt=""
                  className="h-20 w-20 shrink-0 rounded-md border border-edge object-cover"
                />
              )}
              <p className="text-sm whitespace-pre-wrap">
                {p.message || (
                  <span className="text-muted italic">
                    (photo post, no caption)
                  </span>
                )}
              </p>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-edge pt-3">
              <RescheduleForm
                postId={p.id}
                currentUnix={p.scheduled_publish_time}
              />
              <form action={publishScheduledNow}>
                <input type="hidden" name="id" value={p.id} />
                <button className="flex items-center gap-1 font-mono text-[11px] text-muted underline hover:text-amber">
                  <Send className="h-3 w-3" />
                  Publish now
                </button>
              </form>
              <form action={cancelScheduled}>
                <input type="hidden" name="id" value={p.id} />
                <button className="flex items-center gap-1 font-mono text-[11px] text-red-600 underline hover:text-red-700">
                  <Trash2 className="h-3 w-3" />
                  Delete
                </button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
