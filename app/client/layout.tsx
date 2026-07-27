import { cookies } from "next/headers";
import { NavShell } from "@/components/NavShell";
import { CLIENT_COOKIE, verifyClientToken } from "@/lib/clientsession";

const CLIENT_NAV = [
  { href: "/client", label: "Posts", code: "01" },
  { href: "/client/calendar", label: "Calendar", code: "02" },
  { href: "/client/insights", label: "Insights", code: "03" },
];

/**
 * Read-only client portal shell — same drawer/sidebar nav as the team
 * app, fixed three-item nav, company name instead of a page switcher.
 */
export default async function ClientLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const token = (await cookies()).get(CLIENT_COOKIE)?.value;
  const session = token ? await verifyClientToken(token) : null;
  const companyName = session?.name ?? "Client";

  return (
    <NavShell
      items={CLIENT_NAV}
      subtitle="Client Portal"
      homeHref="/client"
      extra={
        <div className="rounded-md bg-white/5 px-3 py-2">
          <span className="block truncate text-xs font-semibold text-white/80">
            {companyName}
          </span>
        </div>
      }
    >
      <div className="mx-auto max-w-4xl">{children}</div>
    </NavShell>
  );
}
