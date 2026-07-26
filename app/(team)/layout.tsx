import MobileNav from "@/components/MobileNav";
import Sidebar from "@/components/Sidebar";
import type { SwitcherPage } from "@/components/PageSwitcher";
import { getActivePage, listPages } from "@/lib/pages";

/** Team shell: sidebar, mobile nav, page switcher. */
export default async function TeamLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Resolve managed pages for the switcher. Strip tokens — only safe,
  // serializable fields may cross into client components.
  let pages: SwitcherPage[] = [];
  let activeId = "";
  try {
    pages = (await listPages()).map(({ id, name, pictureUrl }) => ({
      id,
      name,
      pictureUrl,
    }));
    activeId = (await getActivePage())?.id ?? "";
  } catch {
    // Unconfigured/unreachable — pages render their own guidance.
  }

  return (
    <>
      <MobileNav pages={pages} activeId={activeId} />
      <div className="flex min-h-screen">
        <Sidebar pages={pages} activeId={activeId} />
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 lg:px-12 lg:py-8">
          {children}
        </main>
      </div>
    </>
  );
}
