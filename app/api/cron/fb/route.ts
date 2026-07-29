/**
 * Cron endpoint for the Facebook queue — for serverless deploys where
 * the in-process worker (instrumentation.ts) doesn't run. Point a cron
 * at GET /api/cron/fb every minute (see vercel.json).
 *
 * If CRON_SECRET is set, requests must carry it as
 * `Authorization: Bearer <secret>` (Vercel cron does this
 * automatically) or `?key=<secret>`.
 */

import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { processDueFbPosts } from "@/lib/fbqueue";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = env.cronSecret();
  if (secret) {
    const header = req.headers.get("authorization") ?? "";
    const key = req.nextUrl.searchParams.get("key") ?? "";
    if (header !== `Bearer ${secret}` && key !== secret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await processDueFbPosts();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
