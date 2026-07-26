"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "@/app/login/actions";
import { isActive, NAV } from "./nav";
import PageSwitcher, { type SwitcherPage } from "./PageSwitcher";

export default function MobileNav({
  pages,
  activeId,
}: {
  pages: SwitcherPage[];
  activeId: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="sticky top-0 z-40 bg-navy text-white lg:hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="font-display text-lg font-bold tracking-tight">
          Awaj<span className="text-gold"> ET</span>
          <span className="ml-2 font-mono text-[9px] tracking-[0.18em] text-white/40 uppercase">
            Post Scheduler
          </span>
        </div>
        <button
          aria-label="Menu"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-white/15 px-3 py-1.5 text-sm"
        >
          {open ? "✕" : "☰"}
        </button>
      </div>

      {open && (
        <nav className="border-t border-white/10 px-2 pb-3">
          <div className="px-1 py-2">
            <PageSwitcher pages={pages} activeId={activeId} />
          </div>
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm ${
                  active
                    ? "bg-white/10 font-semibold text-gold"
                    : "text-white/70"
                }`}
              >
                <span className="font-mono text-[10px] text-white/30">
                  {item.code}
                </span>
                {item.label}
              </Link>
            );
          })}
          <form action={logout} className="mt-2 px-3">
            <button className="font-mono text-[10px] tracking-[0.14em] text-white/40 uppercase">
              🔒 Sign out
            </button>
          </form>
        </nav>
      )}
    </div>
  );
}
