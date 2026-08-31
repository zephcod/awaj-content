export const NAV = [
  { href: "/", label: "Compose", code: "01" },
  { href: "/calendar", label: "Calendar", code: "02" },
  { href: "/scheduled", label: "Scheduled", code: "03" },
  { href: "/published", label: "Published", code: "04" },
  { href: "/insights", label: "Insights", code: "05" },
  { href: "/blog", label: "Blog", code: "06" },
  { href: "/settings/linkedin", label: "LinkedIn", code: "07" },
] as const;

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
