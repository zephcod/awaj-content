import { cookies } from "next/headers";
import { ClientMobileNav, ClientSidebar } from "@/components/ClientNav";
import { CLIENT_COOKIE, verifyClientToken } from "@/lib/clientsession";

/**
 * Read-only client portal shell — same sidebar treatment as the team
 * app, but with a fixed nav (Posts / Calendar / Insights), the client's
 * company name instead of a page switcher, and no team routes.
 */
export default async function ClientLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const token = (await cookies()).get(CLIENT_COOKIE)?.value;
  const session = token ? await verifyClientToken(token) : null;
  const companyName = session?.name ?? "Client";

  return (
    <>
      <ClientMobileNav companyName={companyName} />
      <div className="flex min-h-screen">
        <ClientSidebar companyName={companyName} />
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 lg:px-12 lg:py-8">
          <div className="mx-auto max-w-4xl">{children}</div>
        </main>
      </div>
    </>
  );
}
