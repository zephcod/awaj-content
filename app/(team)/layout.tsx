import { NavShell } from "@/components/NavShell";
import PageSwitcher, { type SwitcherPage } from "@/components/PageSwitcher";
import { NAV } from "@/components/nav";
import { getActivePage, listPages } from "@/lib/pages";

/** Team shell: drawer/sidebar nav with the page switcher. */
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
    <NavShell
      items={[...NAV]}
      subtitle="Platform Management"
      homeHref="/"
      extra={<PageSwitcher pages={pages} activeId={activeId} />}
    >
      {children}
    </NavShell>
  );
}
