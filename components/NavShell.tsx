"use client";

/**
 * Responsive navigation shell shared by the team app and the client
 * portal: fixed sidebar on desktop (lg+), hamburger + slide-in drawer
 * on mobile. Ported from the Awaj ET reports app (components/SideNav)
 * so all Awaj tools feel identical on the phone.
 *
 * `extra` renders below the brand block in both the sidebar and the
 * drawer — the team app puts the PageSwitcher there, the client portal
 * its company name.
 */
import * as Dialog from "@radix-ui/react-dialog";
import { LogOut, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "@/app/login/actions";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AwajMark } from "./icons/AwajMark";

export interface NavItem {
  href: string;
  label: string;
  code: string;
}

/** Longest matching href wins, so "/client" isn't active on "/client/calendar". */
function activeHref(pathname: string, items: NavItem[]): string | undefined {
  return items
    .filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`) || i.href === "/")
    .filter((i) => i.href !== "/" || pathname === "/")
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

function Brand({ subtitle, homeHref }: { subtitle: string; homeHref?: string }) {
  const content = (
    <>
      <div className="flex items-center gap-2">
        <AwajMark className="h-7 w-7 shrink-0" aria-hidden />
        <p className="font-display text-xl font-bold tracking-tight">
          Awaj<span className="text-gold"> ET</span>
        </p>
      </div>
      <p className="mt-1 font-mono text-[10px] tracking-[0.18em] text-white/40 uppercase">
        {subtitle}
      </p>
    </>
  );
  if (homeHref) {
    return (
      <Link
        href={homeHref}
        className="block rounded-md transition-opacity hover:opacity-80"
      >
        {content}
      </Link>
    );
  }
  return <div>{content}</div>;
}

function NavLinks({
  items,
  pathname,
  large = false,
}: {
  items: NavItem[];
  pathname: string;
  large?: boolean;
}) {
  const active = activeHref(pathname, items);
  return (
    <nav className={`flex flex-col gap-1 ${large ? "mt-6" : "px-3"}`}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`flex items-center gap-3 rounded-md px-3 transition-colors ${
            large ? "py-3 text-[15px]" : "py-2.5 text-sm"
          } ${
            item.href === active
              ? "bg-white/10 font-semibold text-gold"
              : "text-white/70 hover:bg-white/5 hover:text-white"
          }`}
        >
          <span className="font-mono text-[10px] text-white/30">{item.code}</span>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function SignOut() {
  return (
    <form action={logout}>
      <button className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] text-white/40 uppercase transition-colors hover:text-amber">
        <LogOut className="h-3 w-3" aria-hidden />
        Sign out
      </button>
    </form>
  );
}

function Tagline() {
  return (
    <p className="font-mono text-[10px] leading-relaxed tracking-wider text-white/30 uppercase">
      From pitch to profit
      <br />
      <span className="text-gold/60">Grow with AwajET.</span>
    </p>
  );
}

export function DesktopSidebar({
  items,
  subtitle,
  homeHref,
  extra,
}: {
  items: NavItem[];
  subtitle: string;
  homeHref?: string;
  extra?: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col bg-navy text-white lg:flex dark:border-r dark:border-white/10 print:!hidden">
      <div className="px-6 pt-8 pb-4">
        <Brand subtitle={subtitle} homeHref={homeHref} />
      </div>
      {extra && <div className="px-3 pb-4">{extra}</div>}
      <NavLinks items={items} pathname={pathname} />
      <div className="mt-auto px-6 pb-8">
        <Tagline />
        <div className="mt-5 flex items-center justify-between">
          <SignOut />
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}

export function DrawerNav({
  items,
  subtitle,
  homeHref,
  extra,
}: {
  items: NavItem[];
  subtitle: string;
  homeHref?: string;
  extra?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer whenever navigation happens.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between bg-navy px-4 py-3 lg:hidden dark:border-b dark:border-white/10 print:!hidden">
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger
          aria-label="Open menu"
          className="rounded-md p-2 text-white/80 hover:bg-white/10 hover:text-white"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </Dialog.Trigger>

        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-navy/60 backdrop-blur-sm" />
          <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-navy p-6 text-white shadow-2xl outline-none">
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <Dialog.Description className="sr-only">
              Main navigation menu
            </Dialog.Description>

            <div className="flex items-center justify-between">
              <Brand subtitle={subtitle} homeHref={homeHref} />
              <Dialog.Close
                aria-label="Close menu"
                className="rounded-md p-2 text-white/60 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" aria-hidden />
              </Dialog.Close>
            </div>

            {extra && <div className="mt-4">{extra}</div>}

            <NavLinks items={items} pathname={pathname} large />

            <div className="mt-auto">
              <Tagline />
              <div className="mt-5 flex items-center justify-between">
                <SignOut />
                <ThemeToggle />
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {homeHref ? (
        <Link
          href={homeHref}
          className="flex items-center gap-1.5 font-display text-lg font-bold text-white transition-opacity hover:opacity-80"
        >
          <AwajMark className="h-6 w-6" aria-hidden />
          Awaj<span className="text-gold"> ET</span>
        </Link>
      ) : (
        <span className="flex items-center gap-1.5 font-display text-lg font-bold text-white">
          <AwajMark className="h-6 w-6" aria-hidden />
          Awaj<span className="text-gold"> ET</span>
        </span>
      )}
    </header>
  );
}

/** Full shell: mobile drawer header + desktop sidebar + content column. */
export function NavShell({
  items,
  subtitle,
  homeHref,
  extra,
  children,
}: {
  items: NavItem[];
  subtitle: string;
  homeHref?: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <DrawerNav items={items} subtitle={subtitle} homeHref={homeHref} extra={extra} />
      <div className="flex min-h-screen">
        <DesktopSidebar
          items={items}
          subtitle={subtitle}
          homeHref={homeHref}
          extra={extra}
        />
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 lg:px-12 lg:py-8 print:p-0">
          {children}
        </main>
      </div>
    </>
  );
}
