import Link from "next/link";
import {
  cancelIgQueued,
  cancelScheduled,
  publishIgQueuedNow,
  publishScheduledNow,
} from "@/app/actions";
import RescheduleForm from "@/components/RescheduleForm";
import { fbConfigured, igQueueConfigured } from "@/lib/env";
import { listScheduledPosts, type ScheduledPost } from "@/lib/facebook";
import { fmtDateTime, relativeFromNow } from "@/lib/format";
import { listIgQueue, type IgQueueItem } from "@/lib/igqueue";
import { getActivePage } from "@/lib/pages";

export const dynamic = "force-dynamic";

export default async function ScheduledPage() {
  let posts: ScheduledPost[] = [];
  let igItems: IgQueueItem[] = [];
  let error: string | null = null;
  let igError: string | null = null;
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

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">Scheduled</h1>
          <p className="mt-1 text-sm text-warmgray">
            {pageName && (
              <span className="font-semibold text-charcoal">{pageName} · </span>
            )}
            Queued on Facebook — published automatically at the set time
            (shown in Ethiopia time, EAT).
          </p>
        </div>
        <Link
          href="/"
          className="rounded-md bg-gold px-4 py-2 text-sm font-semibold text-navy hover:bg-amber hover:text-white"
        >
          + New post
        </Link>
      </div>

      {error && (
        <p className="mt-6 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!error && posts.length === 0 && igItems.length === 0 && (
        <div className="mt-10 rounded-lg border border-dashed border-line bg-white/60 p-10 text-center">
          <p className="text-sm text-warmgray">
            Nothing in the queue. Compose a post and pick a time.
          </p>
        </div>
      )}

      {/* ── Instagram queue ── */}
      {(igItems.length > 0 || igError) && (
        <div className="mt-8">
          <h2 className="font-mono text-xs font-semibold tracking-[0.14em] text-warmgray uppercase">
            ⓘ Instagram queue
          </h2>
          {igError && (
            <p className="mt-3 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
              {igError}
            </p>
          )}
          <ul className="mt-3 flex flex-col gap-3">
            {igItems.map((item) => (
              <li
                key={item.$id}
                className="rounded-lg border border-line bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-xs font-semibold text-amber">
                    {fmtDateTime(item.scheduledAt)} EAT
                  </span>
                  <span className="font-mono text-[10px] text-warmgray">
                    {relativeFromNow(item.scheduledAt)}
                  </span>
                  {item.igUsername && (
                    <span className="font-mono text-[10px] text-warmgray">
                      @{item.igUsername}
                    </span>
                  )}
                  {item.mediaType === "carousel" && (
                    <span className="rounded-full bg-navy/5 px-2 py-0.5 font-mono text-[10px] text-warmgray">
                      ▣ carousel
                    </span>
                  )}
                  {item.mediaType === "reel" && (
                    <span className="rounded-full bg-navy/5 px-2 py-0.5 font-mono text-[10px] text-warmgray">
                      🎬 reel
                    </span>
                  )}
                  {item.status === "failed" && (
                    <span className="rounded-full bg-red-50 px-2 py-0.5 font-mono text-[10px] text-red-700">
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
                    <span className="text-warmgray italic">(no caption)</span>
                  )}
                </p>
                {item.status === "failed" && item.error && (
                  <p className="mt-2 rounded-md bg-red-50 px-3 py-2 font-mono text-[11px] text-red-700">
                    {item.error}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-line pt-3">
                  <RescheduleForm
                    postId={item.$id}
                    currentUnix={item.scheduledAt}
                    platform="ig"
                  />
                  <form action={publishIgQueuedNow}>
                    <input type="hidden" name="id" value={item.$id} />
                    <button className="font-mono text-[11px] text-warmgray underline hover:text-amber">
                      {item.status === "failed" ? "Retry now" : "Publish now"}
                    </button>
                  </form>
                  <form action={cancelIgQueued}>
                    <input type="hidden" name="id" value={item.$id} />
                    <button className="font-mono text-[11px] text-red-600 underline hover:text-red-700">
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
        <h2 className="mt-8 font-mono text-xs font-semibold tracking-[0.14em] text-warmgray uppercase">
          ⓕ Facebook scheduled
        </h2>
      )}
      <ul className="mt-3 flex flex-col gap-3">
        {posts.map((p) => (
          <li
            key={p.id}
            className="rounded-lg border border-line bg-white p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-xs font-semibold text-amber">
                {fmtDateTime(p.scheduled_publish_time)} EAT
              </span>
              <span className="font-mono text-[10px] text-warmgray">
                {relativeFromNow(p.scheduled_publish_time)}
              </span>
            </div>

            <div className="mt-2 flex gap-4">
              {p.full_picture && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.full_picture}
                  alt=""
                  className="h-20 w-20 shrink-0 rounded-md border border-line object-cover"
                />
              )}
              <p className="text-sm whitespace-pre-wrap">
                {p.message || (
                  <span className="text-warmgray italic">
                    (photo post, no caption)
                  </span>
                )}
              </p>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-line pt-3">
              <RescheduleForm
                postId={p.id}
                currentUnix={p.scheduled_publish_time}
              />
              <form action={publishScheduledNow}>
                <input type="hidden" name="id" value={p.id} />
                <button className="font-mono text-[11px] text-warmgray underline hover:text-amber">
                  Publish now
                </button>
              </form>
              <form action={cancelScheduled}>
                <input type="hidden" name="id" value={p.id} />
                <button className="font-mono text-[11px] text-red-600 underline hover:text-red-700">
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
