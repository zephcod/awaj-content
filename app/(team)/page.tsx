import Composer from "@/components/Composer";
import { fbConfigured, igQueueConfigured } from "@/lib/env";
import { getIgAccount, type IgAccount } from "@/lib/instagram";
import { getActivePage, type ManagedPage } from "@/lib/pages";

export const dynamic = "force-dynamic";

export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<{ when?: string }>;
}) {
  const { when } = await searchParams;
  // Prefill from the calendar's "+" links; only accept a sane format.
  const defaultWhen = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(when ?? "")
    ? when
    : undefined;

  let page: ManagedPage | null = null;
  let ig: IgAccount | null = null;
  let error: string | null = null;

  if (!fbConfigured()) {
    error =
      "Facebook is not connected yet. Add FB_SYSTEM_USER_TOKEN + FB_PAGE_IDS (or FB_PAGE_ID + FB_PAGE_ACCESS_TOKEN) to .env — see .env.example and README.md — then restart the app.";
  } else {
    try {
      page = await getActivePage();
      if (!page) error = "No pages resolved from the configured credentials.";
      if (page) {
        try {
          ig = await getIgAccount(page);
        } catch {
          ig = null; // IG discovery failure shouldn't block FB posting
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Could not reach Facebook.";
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-2xl font-bold">Compose</h1>
      <p className="mt-1 text-sm text-muted">
        Publish or schedule a post to your Facebook Page.
      </p>

      {page && (
        <div className="mt-5 flex items-center gap-3 rounded-lg border border-edge bg-card px-4 py-3 shadow-sm">
          {page.pictureUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={page.pictureUrl}
              alt=""
              className="h-10 w-10 rounded-full"
            />
          )}
          <div>
            <p className="text-sm font-semibold">{page.name}</p>
            <p className="font-mono text-[10px] text-muted">
              Page {page.id}
              {typeof page.fanCount === "number" &&
                ` · ${page.fanCount.toLocaleString()} followers`}
            </p>
          </div>
          <span className="ml-auto flex flex-col items-end gap-1">
            <span className="rounded-full bg-gold/15 px-3 py-1 font-mono text-[10px] tracking-wider text-amber uppercase">
              Active page
            </span>
            {ig?.username && (
              <span className="rounded-full bg-navy/5 px-3 py-1 font-mono text-[10px] tracking-wider text-muted">
                IG @{ig.username}
              </span>
            )}
          </span>
        </div>
      )}

      {error && (
        <div className="mt-5 rounded-lg border border-amber/40 bg-gold/10 px-4 py-3 text-sm text-fg">
          <p className="font-semibold">Facebook connection issue</p>
          <p className="mt-1 text-muted">{error}</p>
        </div>
      )}

      <div className="mt-6">
        <Composer
          igLinked={Boolean(ig)}
          igUsername={ig?.username}
          igQueueReady={igQueueConfigured()}
          defaultWhen={defaultWhen}
        />
      </div>
    </div>
  );
}
