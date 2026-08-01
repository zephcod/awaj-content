/**
 * Cron endpoint for the nightly organic-stats sync (lib/organicStats.ts).
 * Point a daily cron at GET /api/cron/organic-stats (see
 * .github/workflows/organic-stats-cron.yml — GitHub Actions rather than
 * Vercel Cron, since Vercel's Hobby plan caps cron at 1/day per project
 * and this project already spends that budget elsewhere).
 *
 * GET /api/cron/organic-stats                — sync all companies, trailing 3 days through yesterday
 * GET /api/cron/organic-stats?company=<id>    — sync one company
 * GET /api/cron/organic-stats?days=90         — override the lookback window (e.g. one-time backfill)
 *
 * Auth: `Authorization: Bearer <CRON_SECRET>` or `?key=<CRON_SECRET>`
 * (same convention as /api/cron/fb and /api/cron/ig).
 */

import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { syncAllOrganicStats, syncOneOrganicStats } from "@/lib/organicStats";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = env.cronSecret();
  if (secret) {
    const header = req.headers.get("authorization") ?? "";
    const key = req.nextUrl.searchParams.get("key") ?? "";
    if (header !== `Bearer ${secret}` && key !== secret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const companyId = req.nextUrl.searchParams.get("company");
  const daysBack = Math.min(Number(req.nextUrl.searchParams.get("days")) || 3, 365);

  try {
    const results = companyId
      ? [await syncOneOrganicStats(companyId, daysBack)]
      : await syncAllOrganicStats(daysBack);
    const ok = results.every((r) => !r.error);
    return NextResponse.json({ ok, results }, { status: ok ? 200 : 207 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
