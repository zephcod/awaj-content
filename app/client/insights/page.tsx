import InsightsView from "@/components/InsightsView";
import { getClientPage } from "@/lib/clientpage";

export const dynamic = "force-dynamic";

export default async function ClientInsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const { d } = await searchParams;
  const days = d === "7" ? 7 : 28;
  const ctx = await getClientPage();

  return (
    <div>
      <h1 className="text-2xl font-bold">Insights</h1>
      <p className="mt-1 text-sm text-warmgray">
        {ctx?.page.name ?? "Your page"} — reach and engagement across
        Facebook and Instagram.
      </p>
      <div className="mt-4">
        <InsightsView
          page={ctx?.page ?? null}
          error={
            ctx
              ? null
              : "Your account isn't linked to a page yet — contact your Awaj ET account manager."
          }
          days={days}
          basePath="/client/insights"
        />
      </div>
    </div>
  );
}
