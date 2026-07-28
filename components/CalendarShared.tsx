/**
 * Types/styles/icon shared between CalendarView (a Server Component that
 * pulls in server-only data libs — Appwrite, next/headers via lib/pages.ts)
 * and DayMorePopover ("use client"). This file must stay free of any
 * server-only imports: a client component importing anything — even just
 * a type — from a module that itself imports next/headers pulls that
 * whole module graph into the client bundle and breaks the build. Keeping
 * these pieces here, with only pure icon-component imports, is what makes
 * it safe for both to import from.
 */

import { FacebookGlyph, InstagramGlyph, LinkedInGlyph } from "@/components/icons/BrandGlyphs";

export type CalEvent = {
  time: string; // HH:MM (EAT)
  platform: "fb" | "ig" | "li";
  kind: "scheduled" | "published" | "failed" | "publishing";
  label: string;
  href?: string;
};

export const KIND_STYLE: Record<CalEvent["kind"], string> = {
  // Light sky-blue tint — reads as "upcoming/informational" and sits
  // clearly apart from the gold "in progress" and red "failed" states,
  // instead of the previous solid navy chip blending into the (also navy)
  // dark-mode canvas and looking closer to an error/disabled state than
  // an upcoming one. Mirrors the same fix in portal-app's CalendarView.
  scheduled: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  publishing: "bg-gold/20 text-amber",
  published: "border border-edge bg-card text-muted",
  failed: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
};

/** Small platform mark used in the legend, each event chip, and the "+N more" popover. */
export function PlatformIcon({
  platform,
  className = "h-3 w-3",
}: {
  platform: "fb" | "ig" | "li";
  className?: string;
}) {
  if (platform === "fb") return <FacebookGlyph className={`inline-block shrink-0 align-[-1px] ${className}`} />;
  if (platform === "ig") return <InstagramGlyph className={`inline-block shrink-0 align-[-1px] ${className}`} />;
  return <LinkedInGlyph className={`inline-block shrink-0 align-[-1px] ${className}`} />;
}

/** "Wed, 12 Aug" for the "+N more" popover's heading. */
export function fmtDayLabel(ymd: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${ymd}T00:00:00Z`));
}
