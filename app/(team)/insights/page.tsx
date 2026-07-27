import InsightsView from "@/components/InsightsView";
import { fbConfigured } from "@/lib/env";
import { getActivePage, type ManagedPage } from "@/lib/pages";

export const dynamic = "force-dynamic";

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const { d } = await searchParams;
  const days = d === "7" ? 7 : 28;

  let page: ManagedPage | null = null;
  let error: string | null = null;

  if (!fbConfigured()) {
    error = "Facebook is not connected — add credentials to .env first.";
  } else {
    try {
      page = await getActivePage();
      if (!page) error = "No pages resolved from credentials.";
    } catch (e) {
      error = e instanceof Error ? e.message : "Could not load insights.";
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-2">
        <h1 className="font-display text-2xl font-bold">Insights</h1>
        <p className="mt-1 text-sm text-muted">
          {page && (
            <span className="font-semibold text-fg">{page.name} · </span>
          )}
          Reach and engagement across Facebook and Instagram.
        </p>
      </div>
      <InsightsView page={page} error={error} days={days} basePath="/insights" />
    </div>
  );
}
