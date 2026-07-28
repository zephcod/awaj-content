/**
 * In-process worker: while the app is running (dev or self-hosted
 * `next start`), check the Instagram + LinkedIn queues every 60s and
 * publish due posts. On serverless deploys use the cron routes
 * (/api/cron/ig, /api/cron/li) instead — these intervals won't survive
 * there, which is fine.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Guard against duplicate intervals across dev HMR reloads.
  const g = globalThis as unknown as {
    __igWorkerStarted?: boolean;
    __liWorkerStarted?: boolean;
  };

  if (!g.__igWorkerStarted) {
    g.__igWorkerStarted = true;
    const { igQueueConfigured } = await import("./lib/env");
    if (igQueueConfigured()) {
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
  }

  if (!g.__liWorkerStarted) {
    g.__liWorkerStarted = true;
    const { liQueueConfigured } = await import("./lib/env");
    if (liQueueConfigured()) {
      const { processDueLiPosts } = await import("./lib/liqueue");
      setInterval(async () => {
        try {
          const { processed } = await processDueLiPosts();
          if (processed > 0) {
            console.log(`[li-worker] published ${processed} due LinkedIn post(s)`);
          }
        } catch (e) {
          console.error("[li-worker] error:", e);
        }
      }, 60_000);
      console.log("[li-worker] LinkedIn queue worker started (60s interval)");
    }
  }
}
