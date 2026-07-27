import Link from "next/link";
import { Heart, MessageCircle, Repeat2 } from "lucide-react";
import { FacebookGlyph, InstagramGlyph } from "@/components/icons/BrandGlyphs";
import { igQueueConfigured } from "@/lib/env";
import {
  listPublishedPosts,
  listScheduledPosts,
  type PublishedPost,
} from "@/lib/facebook";
import { listIgQueue } from "@/lib/igqueue";
import {
  fbMetricSeries,
  igAccountStats,
  igMetricSeries,
  type MetricSeries,
} from "@/lib/insights";
import { getIgAccount, listIgMedia, type IgMedia } from "@/lib/instagram";
import type { ManagedPage } from "@/lib/pages";

// ── Tiny server-rendered bar chart ──
function BarChart({ series }: { series: MetricSeries }) {
  const max = Math.max(...series.points.map((p) => p.value), 1);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
          {series.title}
        </span>
        <span className="font-display text-lg font-bold">
          {series.total.toLocaleString()}
        </span>
      </div>
      <div className="mt-2 flex h-24 items-end gap-px">
        {series.points.map((p) => (
          <div
            key={p.date}
            title={`${p.date}: ${p.value.toLocaleString()}`}
            className="min-w-0 flex-1 rounded-t-sm bg-gold/70 hover:bg-amber"
            style={{ height: `${Math.max((p.value / max) * 100, 2)}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[9px] text-muted">
        <span>{series.points[0]?.date.slice(5)}</span>
        <span>{series.points.at(-1)?.date.slice(5)}</span>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-edge bg-card px-4 py-3 shadow-sm">
      <p className="font-mono text-[10px] tracking-[0.14em] text-muted uppercase">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-bold">{value}</p>
    </div>
  );
}

const fbEngagement = (p: PublishedPost) =>
  (p.reactions?.summary?.total_count ?? 0) +
  (p.comments?.summary?.total_count ?? 0) +
  (p.shares?.count ?? 0);

const igEngagement = (m: IgMedia) =>
  (m.like_count ?? 0) + (m.comments_count ?? 0);

/**
 * Insights dashboard for one page — stat cards, daily charts, top posts.
 * Server component shared by the team view (/insights) and the client
 * portal (/client/insights). Each metric is fetched independently and
 * silently skipped when Meta no longer serves it.
 */
export default async function InsightsView({
  page,
  error: externalError,
  days,
  basePath,
}: {
  page: ManagedPage | null;
  error?: string | null;
  days: number;
  basePath: string;
}) {
  const until = Math.floor(Date.now() / 1000);
  const since = until - days * 86400;

  let error: string | null = externalError ?? null;
  let fanCount: number | undefined;
  let igFollowers: number | undefined;
  let igUsername = "";
  const fbCharts: MetricSeries[] = [];
  const igCharts: MetricSeries[] = [];
  let topFb: PublishedPost[] = [];
  let topIg: IgMedia[] = [];
  let postsLastWeek = 0;
  let scheduledAhead = 0;

  if (!error && page) {
    try {
      fanCount = page.fanCount;

      // FB metrics — fetched independently; failures skip silently.
      const fbMetricDefs: [string, string][] = [
        ["page_impressions_unique", `Page reach (${days}d)`],
        ["page_impressions", `Page impressions (${days}d)`],
        ["page_post_engagements", `Post engagements (${days}d)`],
        ["page_video_views", `Video views (${days}d)`],
      ];
      const fbResults = await Promise.all(
        fbMetricDefs.map(([m, t]) => fbMetricSeries(page, m, t, since, until))
      );
      fbCharts.push(...fbResults.filter((s): s is MetricSeries => s !== null));

      // Top FB posts by engagement + posting-cadence counts
      const weekAgoMs = Date.now() - 7 * 86400 * 1000;
      const posts = await listPublishedPosts(page);
      topFb = [...posts]
        .sort((a, b) => fbEngagement(b) - fbEngagement(a))
        .slice(0, 5);
      postsLastWeek += posts.filter(
        (p) => new Date(p.created_time).getTime() >= weekAgoMs
      ).length;

      // Scheduled ahead: FB native queue + pending IG queue items
      const fbScheduled = await listScheduledPosts(page);
      scheduledAhead += fbScheduled.length;
      if (igQueueConfigured()) {
        try {
          scheduledAhead += (await listIgQueue(page.id)).filter(
            (i) => i.status === "pending" || i.status === "publishing"
          ).length;
        } catch {
          // queue unreachable — FB count still shown
        }
      }

      // Instagram — optional
      try {
        const ig = await getIgAccount(page);
        if (ig) {
          igUsername = ig.username ?? "";
          const [stats, reach, followerAdds, media] = await Promise.all([
            igAccountStats(page, ig.id),
            igMetricSeries(page, ig.id, "reach", `IG reach (${days}d)`, since, until),
            igMetricSeries(page, ig.id, "follower_count", `New IG followers (${days}d)`, since, until),
            listIgMedia(page, ig.id, 25),
          ]);
          igFollowers = stats?.followers_count;
          if (reach) igCharts.push(reach);
          if (followerAdds) igCharts.push(followerAdds);
          topIg = [...media]
            .sort((a, b) => igEngagement(b) - igEngagement(a))
            .slice(0, 5);
          const weekAgoIgMs = Date.now() - 7 * 86400 * 1000;
          postsLastWeek += media.filter(
            (m) => m.timestamp && new Date(m.timestamp).getTime() >= weekAgoIgMs
          ).length;
        }
      } catch {
        // IG section optional
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Could not load insights.";
    }
  }

  return (
    <div>
      <div className="flex justify-end gap-2">
        {[7, 28].map((n) => (
          <Link
            key={n}
            href={`${basePath}?d=${n}`}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold ${
              days === n
                ? "bg-navy text-gold"
                : "border border-edge text-muted hover:text-fg"
            }`}
          >
            {n} days
          </Link>
        ))}
      </div>

      {error && (
        <p className="mt-6 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {!error && (
        <>
          {/* Stat cards */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {typeof fanCount === "number" && (
              <StatCard label="FB followers" value={fanCount.toLocaleString()} />
            )}
            {typeof igFollowers === "number" && (
              <StatCard label="IG followers" value={igFollowers.toLocaleString()} />
            )}
            {fbCharts[0] && (
              <StatCard
                label={`FB reach (${days}d)`}
                value={fbCharts[0].total.toLocaleString()}
              />
            )}
            {igCharts[0] && (
              <StatCard
                label={`IG reach (${days}d)`}
                value={igCharts[0].total.toLocaleString()}
              />
            )}
            <StatCard
              label="Posts last week"
              value={postsLastWeek.toLocaleString()}
            />
            <StatCard
              label="Scheduled ahead"
              value={scheduledAhead.toLocaleString()}
            />
          </div>

          {/* Charts */}
          {(fbCharts.length > 0 || igCharts.length > 0) && (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {[...fbCharts, ...igCharts].map((s) => (
                <div
                  key={s.metric}
                  className="rounded-lg border border-edge bg-card p-4 shadow-sm"
                >
                  <BarChart series={s} />
                </div>
              ))}
            </div>
          )}
          {fbCharts.length === 0 && (
            <p className="mt-6 font-mono text-[11px] text-muted">
              No Facebook time-series metrics available — Meta periodically
              retires metrics; this page shows whatever the API still serves.
            </p>
          )}

          {/* Top posts */}
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <div>
              <h2 className="flex items-center gap-1.5 font-mono text-xs font-semibold tracking-[0.14em] text-muted uppercase">
                <FacebookGlyph className="h-3.5 w-3.5" /> Top Facebook posts
              </h2>
              <ul className="mt-3 flex flex-col gap-2">
                {topFb.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-lg border border-edge bg-card p-3 shadow-sm"
                  >
                    <a
                      href={p.permalink_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <p className="line-clamp-2 text-sm">
                        {p.message || (
                          <span className="text-muted italic">(photo)</span>
                        )}
                      </p>
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-1 font-mono text-[10px] text-muted">
                        <span className="inline-flex items-center gap-0.5">
                          <Heart className="h-3 w-3" /> {p.reactions?.summary?.total_count ?? 0}
                        </span>
                        ·
                        <span className="inline-flex items-center gap-0.5">
                          <MessageCircle className="h-3 w-3" /> {p.comments?.summary?.total_count ?? 0}
                        </span>
                        ·
                        <span className="inline-flex items-center gap-0.5">
                          <Repeat2 className="h-3 w-3" /> {p.shares?.count ?? 0}
                        </span>
                        · {p.created_time.slice(0, 10)}
                      </p>
                    </a>
                  </li>
                ))}
                {topFb.length === 0 && (
                  <li className="text-sm text-muted">No posts yet.</li>
                )}
              </ul>
            </div>
            <div>
              <h2 className="flex items-center gap-1.5 font-mono text-xs font-semibold tracking-[0.14em] text-muted uppercase">
                <InstagramGlyph className="h-3.5 w-3.5" /> Top Instagram posts{igUsername && ` · @${igUsername}`}
              </h2>
              <ul className="mt-3 flex flex-col gap-2">
                {topIg.map((m) => (
                  <li
                    key={m.id}
                    className="rounded-lg border border-edge bg-card p-3 shadow-sm"
                  >
                    <a
                      href={m.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3"
                    >
                      {(m.thumbnail_url ?? m.media_url) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.thumbnail_url ?? m.media_url}
                          alt=""
                          className="h-12 w-12 shrink-0 rounded-md border border-edge object-cover"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="line-clamp-1 text-sm">
                          {m.caption || (
                            <span className="text-muted italic">(image)</span>
                          )}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-1 font-mono text-[10px] text-muted">
                          <span className="inline-flex items-center gap-0.5">
                            <Heart className="h-3 w-3" /> {m.like_count ?? 0}
                          </span>
                          ·
                          <span className="inline-flex items-center gap-0.5">
                            <MessageCircle className="h-3 w-3" /> {m.comments_count ?? 0}
                          </span>
                          · {(m.timestamp ?? "").slice(0, 10)}
                        </p>
                      </div>
                    </a>
                  </li>
                ))}
                {topIg.length === 0 && (
                  <li className="text-sm text-muted">
                    No Instagram media (or no IG account linked).
                  </li>
                )}
              </ul>
            </div>
          </div>

          <p className="mt-6 font-mono text-[10px] text-muted">
            Top posts ranked by engagement across the 25 most recent posts per
            platform. Charts show daily values; totals are sums over the range.
          </p>
        </>
      )}
    </div>
  );
}
