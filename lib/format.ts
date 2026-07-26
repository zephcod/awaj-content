/** Display times in Ethiopia time (EAT, UTC+3) regardless of server TZ. */
const TZ = "Africa/Addis_Ababa";

export function fmtDateTime(input: string | number): string {
  const d =
    typeof input === "number" ? new Date(input * 1000) : new Date(input);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function relativeFromNow(unixSeconds: number): string {
  const diffMs = unixSeconds * 1000 - Date.now();
  const abs = Math.abs(diffMs);
  const mins = Math.round(abs / 60000);
  const hours = Math.round(mins / 60);
  const days = Math.round(hours / 24);
  const label =
    mins < 60 ? `${mins} min` : hours < 48 ? `${hours} hr` : `${days} days`;
  return diffMs >= 0 ? `in ${label}` : `${label} ago`;
}
