import CalendarView from "@/components/CalendarView";
import { getClientPage } from "@/lib/clientpage";

export const dynamic = "force-dynamic";

export default async function ClientCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;
  const ctx = await getClientPage();

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Content calendar</h1>
      <p className="mt-1 text-sm text-muted">
        {ctx?.page.name ?? "Your page"} — scheduled and published posts,
        Ethiopia time (EAT).
      </p>
      <div className="mt-4">
        <CalendarView
          page={ctx?.page ?? null}
          error={
            ctx
              ? null
              : "Your account isn't linked to a page yet — contact your Awaj ET account manager."
          }
          monthParam={m}
          basePath="/client/calendar"
          readOnly
        />
      </div>
    </div>
  );
}
