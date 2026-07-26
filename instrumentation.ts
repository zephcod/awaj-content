/**
 * In-process worker: while the app is running (dev or self-hosted
 * `next start`), check the Instagram queue every 60s and publish due
 * posts. On serverless deploys use the cron route (/api/cron/ig)
 * instead — this interval won't survive there, which is fine.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Guard against duplicate intervals across dev HMR reloads.
  const g = globalThis as unknown as { __igWorkerStarted?: boolean };
  if (g.__igWorkerStarted) return;
  g.__igWorkerStarted = true;

  const { igQueueConfigured } = await import("./lib/env");
  if (!igQueueConfigured()) return;

  const { processDueIgPosts } = await import("./lib/igqueue");
  setInterval(async () => {
    try {
      const { processed } = await processDueIgPosts();
      if (processed > 0) {
        console.log(`[ig-worker] published ${processed} due IG post(s)`);
      }
    } catch (e) {
      console.error("[ig-worker] error:", e);
    }
  }, 60_000);
  console.log("[ig-worker] Instagram queue worker started (60s interval)");
}
