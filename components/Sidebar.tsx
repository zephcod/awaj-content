"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/login/actions";
import { isActive, NAV } from "./nav";
import PageSwitcher, { type SwitcherPage } from "./PageSwitcher";

export default function Sidebar({
  pages,
  activeId,
}: {
  pages: SwitcherPage[];
  activeId: string;
}) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col bg-navy text-white lg:flex">
      <div className="px-6 pt-8 pb-4">
        <div className="font-display text-xl font-bold tracking-tight">
          Awaj<span className="text-gold"> ET</span>
        </div>
        <div className="mt-1 font-mono text-[10px] tracking-[0.18em] text-white/40 uppercase">
          Post Scheduler
        </div>
      </div>

      <div className="px-3 pb-4">
        <PageSwitcher pages={pages} activeId={activeId} />
      </div>

      <nav className="flex flex-col gap-1 px-3">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
                active
                  ? "bg-white/10 font-semibold text-gold"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="font-mono text-[10px] text-white/30">
                {item.code}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-6 pb-8">
        <p className="font-mono text-[10px] leading-relaxed tracking-wider text-white/30 uppercase">
          From pitch to profit
          <br />
          let Awaj handle
          <br />
          <span className="text-gold/60">the journey.</span>
        </p>
        <form action={logout} className="mt-5">
          <button className="font-mono text-[10px] tracking-[0.14em] text-white/40 uppercase transition-colors hover:text-amber">
            🔒 Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
