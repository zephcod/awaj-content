import CalendarView from "@/components/CalendarView";
import { fbConfigured } from "@/lib/env";
import { getActivePage, type ManagedPage } from "@/lib/pages";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;

  let page: ManagedPage | null = null;
  let error: string | null = null;

  if (!fbConfigured()) {
    error = "Facebook is not connected — add credentials to .env first.";
  } else {
    try {
      page = await getActivePage();
      if (!page) error = "No pages resolved from credentials.";
    } catch (e) {
      error = e instanceof Error ? e.message : "Could not load calendar.";
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-2">
        <h1 className="text-2xl font-bold">Calendar</h1>
        <p className="mt-1 text-sm text-warmgray">
          {page && (
            <span className="font-semibold text-charcoal">{page.name} · </span>
          )}
          Scheduled and published posts, Ethiopia time (EAT).
        </p>
      </div>
      <CalendarView
        page={page}
        error={error}
        monthParam={m}
        basePath="/calendar"
      />
    </div>
  );
}
