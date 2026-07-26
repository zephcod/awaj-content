import { igQueueConfigured } from "@/lib/env";
import { getClientPage } from "@/lib/clientpage";
import {
  listPublishedPosts,
  listScheduledPosts,
  type PublishedPost,
  type ScheduledPost,
} from "@/lib/facebook";
import { fmtDateTime, relativeFromNow } from "@/lib/format";
import { listIgQueue, type IgQueueItem } from "@/lib/igqueue";

export const dynamic = "force-dynamic";

export default async function ClientPostsPage() {
  const ctx = await getClientPage();

  let fbScheduled: ScheduledPost[] = [];
  let igQueued: IgQueueItem[] = [];
  let published: PublishedPost[] = [];
  let error: string | null = null;

  if (!ctx) {
    error =
      "Your account isn't linked to a page yet — contact your Awaj ET account manager.";
  } else {
    try {
      [fbScheduled, published] = await Promise.all([
        listScheduledPosts(ctx.page),
        listPublishedPosts(ctx.page),
      ]);
      if (igQueueConfigured()) {
        // Clients see only cleanly pending items — no failure internals.
        igQueued = (await listIgQueue(ctx.page.id)).filter(
          (i) => i.status === "pending" || i.status === "publishing"
        );
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Could not load posts.";
    }
  }

  const upcoming = [
    ...fbScheduled.map((p) => ({
      key: `fb-${p.id}`,
      when: p.scheduled_publish_time,
      platform: "ⓕ Facebook",
      text: p.message || "(photo post)",
      image: p.full_picture,
      badge:
        undefined as string | undefined,
    })),
    ...igQueued.map((i) => ({
      key: `ig-${i.$id}`,
      when: i.scheduledAt,
      platform: "ⓘ Instagram",
      text: i.caption || "(image post)",
      image: undefined as string | undefined,
      badge:
        i.mediaType === "carousel"
          ? "carousel"
          : i.mediaType === "reel"
            ? "reel"
            : undefined,
    })),
  ].sort((a, b) => a.when - b.when);

  return (
    <div>
      <h1 className="text-2xl font-bold">Your content plan</h1>
      <p className="mt-1 text-sm text-warmgray">
        Posts Awaj ET has scheduled and published for{" "}
        {ctx?.page.name ?? "your page"}. Times in Ethiopia time (EAT).
      </p>

      {error && (
        <p className="mt-6 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!error && (
        <>
          <h2 className="mt-8 font-mono text-xs font-semibold tracking-[0.14em] text-warmgray uppercase">
            Upcoming ({upcoming.length})
          </h2>
          {upcoming.length === 0 && (
            <div className="mt-3 rounded-lg border border-dashed border-line bg-white/60 p-8 text-center">
              <p className="text-sm text-warmgray">
                Nothing scheduled right now.
              </p>
            </div>
          )}
          <ul className="mt-3 flex flex-col gap-3">
            {upcoming.map((u) => (
              <li
                key={u.key}
                className="rounded-lg border border-line bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-xs font-semibold text-amber">
                    {fmtDateTime(u.when)} EAT
                  </span>
                  <span className="font-mono text-[10px] text-warmgray">
                    {relativeFromNow(u.when)}
                  </span>
                  <span className="font-mono text-[10px] text-warmgray">
                    {u.platform}
                  </span>
                  {u.badge && (
                    <span className="rounded-full bg-navy/5 px-2 py-0.5 font-mono text-[10px] text-warmgray">
                      {u.badge}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex gap-4">
                  {u.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={u.image}
                      alt=""
                      className="h-20 w-20 shrink-0 rounded-md border border-line object-cover"
                    />
                  )}
                  <p className="text-sm whitespace-pre-wrap">{u.text}</p>
                </div>
              </li>
            ))}
          </ul>

          <h2 className="mt-10 font-mono text-xs font-semibold tracking-[0.14em] text-warmgray uppercase">
            Recently published
          </h2>
          <ul className="mt-3 flex flex-col gap-3">
            {published.slice(0, 10).map((p) => (
              <li
                key={p.id}
                className="rounded-lg border border-line bg-white p-4 shadow-sm"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-mono text-xs text-warmgray">
                    {fmtDateTime(p.created_time)} EAT
                  </span>
                  {p.permalink_url && (
                    <a
                      href={p.permalink_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-[11px] text-amber underline"
                    >
                      View on Facebook ↗
                    </a>
                  )}
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
                      <span className="text-warmgray italic">(photo post)</span>
                    )}
                  </p>
                </div>
                <div className="mt-3 flex gap-5 border-t border-line pt-3 font-mono text-[11px] text-warmgray">
                  <span>♥ {p.reactions?.summary?.total_count ?? 0}</span>
                  <span>💬 {p.comments?.summary?.total_count ?? 0}</span>
                  <span>↻ {p.shares?.count ?? 0}</span>
                </div>
              </li>
            ))}
            {published.length === 0 && (
              <li className="text-sm text-warmgray">No published posts yet.</li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
