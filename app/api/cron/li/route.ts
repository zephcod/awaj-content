/**
 * Cron endpoint for the LinkedIn queue — mirrors /api/cron/ig exactly.
 * Point a cron at GET /api/cron/li every minute (see vercel.json / the
 * GitHub Actions workflow pattern already used for IG in README).
 *
 * If CRON_SECRET is set, requests must carry it as
 * `Authorization: Bearer <secret>` or `?key=<secret>`.
 */

import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { processDueLiPosts } from "@/lib/liqueue";

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
    const result = await processDueLiPosts();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
