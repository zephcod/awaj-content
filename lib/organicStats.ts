/**
 * Nightly Meta → Appwrite organic-stats sync.
 *
 * The portal app's Overview/Organic Insights pages used to call Page +
 * IG Insights live on every page load — several Graph round-trips per
 * request, per date range. This module pre-computes one row per
 * (company, date) into `organic_stats_daily` (same Appwrite database
 * the portal reads from) so those pages become a single fast query.
 *
 * Deliberately stats-only: post lists (`listPublishedPosts`,
 * `listIgMedia`) are fetched here only to derive daily *counts* (posts
 * published, summed IG engagement — Instagram has no daily engagement
 * metric) — nothing content-shaped (captions, images, permalinks) is
 * ever written to this collection.
 *
 * Each sync call re-fetches a whole date window in one shot per metric
 * (the Graph Insights API returns one point per day for a since/until
 * range) and upserts every date in that window. Callers should pass a
 * window that overlaps the last run — Meta can revise a day's insights
 * for up to ~48h after it ends, so re-covering the last few days each
 * night self-heals late corrections instead of locking in an
 * under-counted first read.
 */

import { Client, Databases, ID, Query } from "node-appwrite";
import { env } from "./env";
import { getCompanies, type Company } from "./clients";
import { listPages, type ManagedPage } from "./pages";
import { listPublishedPosts, type PublishedPost } from "./facebook";
import { getIgAccount, listIgMedia, type IgMedia } from "./instagram";
import { fbMetricSeries, igMetricSeries, igAccountStats } from "./insights";

export const ORGANIC_STATS_COLLECTION = "organic_stats_daily";

// Recent-posts fetch limit for deriving daily counts/engagement — high
// enough to cover a normal page's posting volume across a multi-week
// backfill window without over-fetching.
const POST_LOOKBACK_LIMIT = 100;

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

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function datesInRange(sinceISO: string, untilISO: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${sinceISO}T00:00:00Z`);
  const end = new Date(`${untilISO}T00:00:00Z`);
  while (cur <= end) {
    out.push(dateStr(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

const fbEngagementOf = (p: PublishedPost) =>
  (p.reactions?.summary?.total_count ?? 0) +
  (p.comments?.summary?.total_count ?? 0) +
  (p.shares?.count ?? 0);
const igEngagementOf = (m: IgMedia) => (m.like_count ?? 0) + (m.comments_count ?? 0);

/** Index a metric series' daily points by date for quick lookup while building rows. */
function byDate(points: { date: string; value: number }[] | undefined): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of points ?? []) map.set(p.date, p.value);
  return map;
}

export interface OrganicSyncResult {
  companyId: string;
  companyName: string;
  pageId?: string;
  days: number;
  error?: string;
}

async function upsertDay(
  companyId: string,
  date: string,
  fields: Record<string, unknown>
): Promise<void> {
  const existing = await db().listDocuments(DB(), ORGANIC_STATS_COLLECTION, [
    Query.equal("companyId", companyId),
    Query.equal("date", date),
    Query.limit(1),
  ]);
  const payload = { companyId, date, syncedAt: new Date().toISOString(), ...fields };
  if (existing.total > 0) {
    await db().updateDocument(DB(), ORGANIC_STATS_COLLECTION, existing.documents[0].$id, payload);
  } else {
    await db().createDocument(DB(), ORGANIC_STATS_COLLECTION, ID.unique(), payload);
  }
}

/**
 * Sync one company's page for [sinceISO, untilISO] (inclusive, UTC
 * calendar days). Writes one row per date in the window.
 */
export async function syncCompanyOrganicStats(
  company: Company,
  page: ManagedPage,
  sinceISO: string,
  untilISO: string
): Promise<OrganicSyncResult> {
  const result: OrganicSyncResult = {
    companyId: company.$id,
    companyName: company.name,
    pageId: page.id,
    days: 0,
  };
  try {
    const since = Math.floor(new Date(`${sinceISO}T00:00:00Z`).getTime() / 1000);
    // Insights `until` is exclusive-ish in practice — push to the end of the day.
    const until = Math.floor(new Date(`${untilISO}T23:59:59Z`).getTime() / 1000);
    const dates = datesInRange(sinceISO, untilISO);
    const lastDate = dates[dates.length - 1];

    const [fbViews, fbEng, fbFollows, fbUnfollows, fbVideo, posts] = await Promise.all([
      fbMetricSeries(page, "page_views_total", "Page views", since, until),
      fbMetricSeries(page, "page_post_engagements", "Engagement", since, until),
      fbMetricSeries(page, "page_daily_follows_unique", "Follows", since, until),
      fbMetricSeries(page, "page_daily_unfollows_unique", "Unfollows", since, until),
      fbMetricSeries(page, "page_video_views", "Video views", since, until),
      listPublishedPosts(page, POST_LOOKBACK_LIMIT).catch(() => [] as PublishedPost[]),
    ]);

    const fbViewsByDate = byDate(fbViews?.points);
    const fbEngByDate = byDate(fbEng?.points);
    const fbFollowsByDate = byDate(fbFollows?.points);
    const fbUnfollowsByDate = byDate(fbUnfollows?.points);
    const fbVideoByDate = byDate(fbVideo?.points);
    const fbPostsByDate = new Map<string, PublishedPost[]>();
    for (const p of posts) {
      const d = p.created_time?.slice(0, 10);
      if (!d) continue;
      (fbPostsByDate.get(d) ?? fbPostsByDate.set(d, []).get(d)!).push(p);
    }

    let igConnected = false;
    let igViewsByDate = new Map<string, number>();
    let igReachByDate = new Map<string, number>();
    let igFollowerAddsByDate = new Map<string, number>();
    let igMediaByDate = new Map<string, IgMedia[]>();
    let igFollowersCount: number | null = null;
    let igMediaCount: number | null = null;

    try {
      const ig = await getIgAccount(page);
      if (ig) {
        igConnected = true;
        const [views, reach, followerAdds, stats, media] = await Promise.all([
          igMetricSeries(page, ig.id, "profile_views", "Profile views", since, until),
          igMetricSeries(page, ig.id, "reach", "Reach", since, until),
          igMetricSeries(page, ig.id, "follower_count", "Follower adds", since, until),
          igAccountStats(page, ig.id),
          listIgMedia(page, ig.id, POST_LOOKBACK_LIMIT).catch(() => [] as IgMedia[]),
        ]);
        igViewsByDate = byDate(views?.points);
        igReachByDate = byDate(reach?.points);
        igFollowerAddsByDate = byDate(followerAdds?.points);
        igFollowersCount = stats?.followers_count ?? null;
        igMediaCount = stats?.media_count ?? null;
        for (const m of media) {
          const d = m.timestamp?.slice(0, 10);
          if (!d) continue;
          (igMediaByDate.get(d) ?? igMediaByDate.set(d, []).get(d)!).push(m);
        }
      }
    } catch {
      // No IG account resolvable this run — FB-only rows still written.
    }

    for (const date of dates) {
      const fbPostsThatDay = fbPostsByDate.get(date) ?? [];
      const igPostsThatDay = igMediaByDate.get(date) ?? [];
      const igEngagementThatDay = igPostsThatDay.reduce((n, m) => n + igEngagementOf(m), 0);

      await upsertDay(company.$id, date, {
        fbPageViews: fbViewsByDate.get(date) ?? 0,
        fbEngagement: fbEngByDate.get(date) ?? 0,
        fbFollows: fbFollowsByDate.get(date) ?? 0,
        fbUnfollows: fbUnfollowsByDate.get(date) ?? 0,
        fbVideoViews: fbVideoByDate.get(date) ?? 0,
        // Fan/follower/media counts are point-in-time snapshots, not daily
        // deltas — only meaningful as of "now", so only stamped on the
        // most recent date in this window; earlier (backfilled) days are
        // left null rather than guessing a historical value.
        fbFanCount: date === lastDate ? (page.fanCount ?? null) : undefined,
        igConnected,
        igProfileViews: igViewsByDate.get(date) ?? 0,
        igReach: igReachByDate.get(date) ?? 0,
        igEngagement: igEngagementThatDay,
        igFollowerAdds: igFollowerAddsByDate.get(date) ?? 0,
        igFollowersCount: date === lastDate ? igFollowersCount : undefined,
        igMediaCount: date === lastDate ? igMediaCount : undefined,
        postsPublishedCount: fbPostsThatDay.length + igPostsThatDay.length,
      });
      result.days++;
    }
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
  }
  return result;
}

/**
 * Sync every active company that has a page this scheduler manages, for
 * the trailing `daysBack` days through yesterday (UTC) — "today" is
 * intentionally excluded since it's still in progress and the portal
 * only ever reads through yesterday.
 */
export async function syncAllOrganicStats(daysBack = 3): Promise<OrganicSyncResult[]> {
  const [companies, pages] = await Promise.all([getCompanies(), listPages()]);
  const pageById = new Map(pages.map((p) => [p.id, p]));

  const until = new Date();
  until.setUTCDate(until.getUTCDate() - 1);
  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - (daysBack - 1));
  const sinceISO = dateStr(since);
  const untilISO = dateStr(until);

  const results: OrganicSyncResult[] = [];
  for (const company of companies) {
    if (!company.fbPageId) continue;
    const page = pageById.get(company.fbPageId);
    if (!page) {
      results.push({
        companyId: company.$id,
        companyName: company.name,
        days: 0,
        error: `Page ${company.fbPageId} not in this scheduler's managed pages`,
      });
      continue;
    }
    results.push(await syncCompanyOrganicStats(company, page, sinceISO, untilISO));
  }
  return results;
}

export async function syncOneOrganicStats(
  companyId: string,
  daysBack = 3
): Promise<OrganicSyncResult> {
  const [companies, pages] = await Promise.all([getCompanies(), listPages()]);
  const company = companies.find((c) => c.$id === companyId);
  if (!company) {
    return { companyId, companyName: "?", days: 0, error: "Company not found or inactive" };
  }
  if (!company.fbPageId) {
    return { companyId, companyName: company.name, days: 0, error: "No fbPageId configured" };
  }
  const page = pages.find((p) => p.id === company.fbPageId);
  if (!page) {
    return {
      companyId,
      companyName: company.name,
      days: 0,
      error: `Page ${company.fbPageId} not in this scheduler's managed pages`,
    };
  }

  const until = new Date();
  until.setUTCDate(until.getUTCDate() - 1);
  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - (daysBack - 1));
  return syncCompanyOrganicStats(company, page, dateStr(since), dateStr(until));
}
