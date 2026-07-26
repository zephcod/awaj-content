"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logout } from "@/app/login/actions";

const CLIENT_NAV = [
  { href: "/client", label: "Posts", code: "01" },
  { href: "/client/calendar", label: "Calendar", code: "02" },
  { href: "/client/insights", label: "Insights", code: "03" },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/client" ? pathname === "/client" : pathname.startsWith(href);
}

/** Desktop sidebar for the read-only client portal — same styling as the
 *  team sidebar, fixed nav, no page switcher. */
export function ClientSidebar({ companyName }: { companyName: string }) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col bg-navy text-white lg:flex">
      <div className="px-6 pt-8 pb-4">
        <div className="font-display text-xl font-bold tracking-tight">
          Awaj<span className="text-gold"> ET</span>
        </div>
        <div className="mt-1 font-mono text-[10px] tracking-[0.18em] text-white/40 uppercase">
          Client Portal
        </div>
      </div>

      <div className="px-3 pb-4">
        <div className="rounded-md bg-white/5 px-3 py-2">
          <span className="block truncate text-xs font-semibold text-white/80">
            {companyName}
          </span>
        </div>
      </div>

      <nav className="flex flex-col gap-1 px-3">
        {CLIENT_NAV.map((item) => {
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

/** Mobile top bar + collapsible menu for the client portal. */
export function ClientMobileNav({ companyName }: { companyName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="sticky top-0 z-40 bg-navy text-white lg:hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="font-display text-lg font-bold tracking-tight">
          Awaj<span className="text-gold"> ET</span>
          <span className="ml-2 font-mono text-[9px] tracking-[0.18em] text-white/40 uppercase">
            {companyName}
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
          {CLIENT_NAV.map((item) => {
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
