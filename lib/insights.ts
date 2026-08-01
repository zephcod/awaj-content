/**
 * Page + Instagram insights via the Graph API (`read_insights`).
 *
 * Meta has deprecated many insights metrics over the years and the
 * surviving set varies by API version. Strategy: fetch each metric in
 * its own request and return null on failure — the UI renders whatever
 * came back and quietly skips the rest.
 */

import { graph, type PageAuth } from "./facebook";

export type SeriesPoint = { date: string; value: number }; // date = YYYY-MM-DD

export type MetricSeries = {
  metric: string;
  title: string;
  points: SeriesPoint[];
  total: number;
};

type InsightValue = { value?: number | Record<string, number>; end_time?: string };
type InsightsResponse = {
  data?: { name: string; values?: InsightValue[] }[];
};

function toSeries(
  metric: string,
  title: string,
  values: InsightValue[]
): MetricSeries {
  const points: SeriesPoint[] = values.map((v) => ({
    date: (v.end_time ?? "").slice(0, 10),
    value: typeof v.value === "number" ? v.value : 0,
  }));
  return {
    metric,
    title,
    points,
    total: points.reduce((s, p) => s + p.value, 0),
  };
}

// ── Facebook page metrics ─────────────────────────────────────────

/** One page metric as a daily series; null when unavailable. */
export async function fbMetricSeries(
  page: PageAuth,
  metric: string,
  title: string,
  since: number,
  until: number
): Promise<MetricSeries | null> {
  try {
    const res = await graph<InsightsResponse>(
      page.token,
      `${page.id}/insights/${metric}`,
      {
        params: {
          period: "day",
          since: String(since),
          until: String(until),
        },
      }
    );
    const values = res.data?.[0]?.values;
    if (!values?.length) return null;
    return toSeries(metric, title, values);
  } catch {
    return null; // deprecated/unavailable metric — skip silently
  }
}

// ── Instagram account metrics ─────────────────────────────────────

export async function igMetricSeries(
  page: PageAuth,
  igUserId: string,
  metric: string,
  title: string,
  since: number,
  until: number
): Promise<MetricSeries | null> {
  try {
    const res = await graph<InsightsResponse>(
      page.token,
      `${igUserId}/insights`,
      {
        params: {
          metric,
          period: "day",
          since: String(since),
          until: String(until),
        },
      }
    );
    const values = res.data?.[0]?.values;
    if (!values?.length) return null;
    return toSeries(metric, title, values);
  } catch {
    return null;
  }
}

/**
 * Some IG insights metrics (e.g. "profile_views") were migrated by Meta
 * to require `metric_type=total_value` — the response is a single
 * aggregate for the whole [since, until) window (`total_value.value`),
 * not a per-day `values` array like `fbMetricSeries`/`igMetricSeries`
 * return. Call once per day (since = day start, until = next day start)
 * to reconstruct a daily series for these metrics.
 */
export async function igTotalValueMetric(
  page: PageAuth,
  igUserId: string,
  metric: string,
  since: number,
  until: number
): Promise<number | null> {
  try {
    const res = await graph<{ data?: { total_value?: { value?: number } }[] }>(
      page.token,
      `${igUserId}/insights`,
      {
        params: {
          metric,
          period: "day",
          metric_type: "total_value",
          since: String(since),
          until: String(until),
        },
      }
    );
    const value = res.data?.[0]?.total_value?.value;
    return typeof value === "number" ? value : null;
  } catch {
    return null;
  }
}

export type IgAccountStats = {
  followers_count?: number;
  media_count?: number;
};

export async function igAccountStats(
  page: PageAuth,
  igUserId: string
): Promise<IgAccountStats | null> {
  try {
    return await graph<IgAccountStats>(page.token, igUserId, {
      params: { fields: "followers_count,media_count" },
    });
  } catch {
    return null;
  }
}
