import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { FacebookGlyph, InstagramGlyph } from "@/components/icons/BrandGlyphs";
import { igQueueConfigured } from "@/lib/env";
import { listPublishedPosts, listScheduledPosts } from "@/lib/facebook";
import { listIgQueue } from "@/lib/igqueue";
import { getIgAccount, listIgMedia } from "@/lib/instagram";
import type { ManagedPage } from "@/lib/pages";

/** Small platform mark used in the legend and on each event chip. */
function PlatformIcon({ platform }: { platform: "fb" | "ig" }) {
  return platform === "fb" ? (
    <FacebookGlyph className="inline-block h-3 w-3 shrink-0 align-[-1px]" />
  ) : (
    <InstagramGlyph className="inline-block h-3 w-3 shrink-0 align-[-1px]" />
  );
}

/** Ethiopia is UTC+3 with no DST — fixed offset is safe. */
const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

function eatYmd(d: Date): string {
  return new Date(d.getTime() + EAT_OFFSET_MS).toISOString().slice(0, 10);
}

function eatTime(d: Date): string {
  return new Date(d.getTime() + EAT_OFFSET_MS).toISOString().slice(11, 16);
}

type CalEvent = {
  time: string; // HH:MM (EAT)
  platform: "fb" | "ig";
  kind: "scheduled" | "published" | "failed" | "publishing";
  label: string;
  href?: string;
};

const KIND_STYLE: Record<CalEvent["kind"], string> = {
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

/**
 * Month-grid calendar of scheduled + published posts for one page.
 * Server component, shared by the team view (/calendar) and the
 * read-only client portal (/client/calendar). In readOnly mode there
 * are no compose links, no internal links, and no failure internals.
 */
export default async function CalendarView({
  page,
  error: externalError,
  monthParam,
  basePath,
  readOnly = false,
}: {
  page: ManagedPage | null;
  error?: string | null;
  monthParam?: string;
  basePath: string;
  readOnly?: boolean;
}) {
  // ── Month being viewed (default: current month in EAT) ──
  const todayYmd = eatYmd(new Date());
  let [year, month] = todayYmd.split("-").map(Number); // month 1-12
  const parsed = /^(\d{4})-(\d{2})$/.exec(monthParam ?? "");
  if (parsed) {
    year = Number(parsed[1]);
    month = Number(parsed[2]);
  }
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstWeekday =
    (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7; // Mon=0

  const prev =
    month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
  const next =
    month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthLabel = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1)));

  // ── Collect events ──
  const events = new Map<string, CalEvent[]>();
  const add = (ymd: string, ev: CalEvent) => {
    if (!ymd.startsWith(monthKey)) return;
    const list = events.get(ymd) ?? [];
    list.push(ev);
    events.set(ymd, list);
  };

  let error: string | null = externalError ?? null;

  if (!error && page) {
    try {
      const [fbScheduled, fbPublished] = await Promise.all([
        listScheduledPosts(page),
        listPublishedPosts(page),
      ]);

      for (const p of fbScheduled) {
        const d = new Date(p.scheduled_publish_time * 1000);
        add(eatYmd(d), {
          time: eatTime(d),
          platform: "fb",
          kind: "scheduled",
          label: p.message || "(photo)",
          href: readOnly ? undefined : "/scheduled",
        });
      }
      for (const p of fbPublished) {
        const d = new Date(p.created_time);
        add(eatYmd(d), {
          time: eatTime(d),
          platform: "fb",
          kind: "published",
          label: p.message || "(photo)",
          href: p.permalink_url,
        });
      }

      // Instagram — optional, never blocks the FB calendar
      try {
        const ig = await getIgAccount(page);
        if (ig) {
          const media = await listIgMedia(page, ig.id, 25);
          for (const mItem of media) {
            if (!mItem.timestamp) continue;
            const d = new Date(mItem.timestamp);
            add(eatYmd(d), {
              time: eatTime(d),
              platform: "ig",
              kind: "published",
              label: mItem.caption || "(image)",
              href: mItem.permalink,
            });
          }
        }
        if (igQueueConfigured()) {
          for (const item of await listIgQueue(page.id)) {
            if (readOnly && item.status === "failed") continue;
            const d = new Date(item.scheduledAt * 1000);
            add(eatYmd(d), {
              time: eatTime(d),
              platform: "ig",
              kind:
                item.status === "failed"
                  ? "failed"
                  : item.status === "publishing"
                    ? "publishing"
                    : "scheduled",
              label: item.caption || "(image)",
              href: readOnly ? undefined : "/scheduled",
            });
          }
        }
      } catch {
        // IG issues are shown elsewhere; keep the calendar rendering
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Could not load calendar.";
    }
  }

  for (const list of events.values()) {
    list.sort((a, b) => a.time.localeCompare(b.time));
  }

  // ── Grid cells (leading blanks + days) ──
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link
          href={`${basePath}?m=${prev}`}
          aria-label="Previous month"
          className="flex items-center rounded-md border border-edge bg-card px-2.5 py-1.5 hover:border-gold"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <span className="min-w-36 text-center font-display text-sm font-semibold">
          {monthLabel}
        </span>
        <Link
          href={`${basePath}?m=${next}`}
          aria-label="Next month"
          className="flex items-center rounded-md border border-edge bg-card px-2.5 py-1.5 hover:border-gold"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
        {monthKey !== todayYmd.slice(0, 7) && (
          <Link
            href={basePath}
            className="rounded-md border border-edge bg-card px-3 py-1.5 font-mono text-[11px] text-muted hover:border-gold"
          >
            Today
          </Link>
        )}
      </div>

      {error && (
        <p className="mt-6 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {/* Legend */}
      <div className="mt-5 flex flex-wrap gap-3 font-mono text-[10px] text-muted">
        <span>
          <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-sky-400 align-middle" />
          scheduled
        </span>
        <span>
          <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm border border-edge bg-card align-middle" />
          published
        </span>
        {!readOnly && (
          <span>
            <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-red-100 align-middle" />
            failed
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <PlatformIcon platform="fb" /> Facebook ·{" "}
          <PlatformIcon platform="ig" /> Instagram
        </span>
      </div>

      {/* Grid */}
      <div className="mt-4 grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-edge bg-line">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div
            key={d}
            className="bg-navy px-2 py-2 text-center font-mono text-[10px] tracking-wider text-white/60 uppercase"
          >
            {d}
          </div>
        ))}

        {cells.map((day, i) => {
          if (day === null) {
            return <div key={`b${i}`} className="min-h-28 bg-app/60" />;
          }
          const ymd = `${monthKey}-${String(day).padStart(2, "0")}`;
          const isToday = ymd === todayYmd;
          const isPast = ymd < todayYmd;
          const dayEvents = events.get(ymd) ?? [];
          return (
            <div
              key={ymd}
              className={`group min-h-28 bg-card p-1.5 ${isPast ? "bg-card/70" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    isToday
                      ? "bg-gold font-bold text-navy"
                      : "font-medium text-muted"
                  }`}
                >
                  {day}
                </span>
                {!readOnly && !isPast && (
                  <Link
                    href={`/?when=${ymd}T09:00`}
                    title="Compose for this day"
                    className="hidden h-5 w-5 items-center justify-center rounded-full bg-app text-muted group-hover:flex hover:bg-gold hover:text-navy"
                  >
                    <Plus className="h-3 w-3" />
                  </Link>
                )}
              </div>
              <div className="mt-1 flex flex-col gap-1">
                {dayEvents.slice(0, 4).map((ev, j) =>
                  ev.href ? (
                    <a
                      key={j}
                      href={ev.href}
                      target={ev.href.startsWith("http") ? "_blank" : undefined}
                      rel="noopener noreferrer"
                      className={`truncate rounded px-1.5 py-1 text-[10px] leading-tight ${KIND_STYLE[ev.kind]}`}
                      title={`${ev.time} EAT — ${ev.label}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        <PlatformIcon platform={ev.platform} /> {ev.time}{" "}
                        {ev.label.slice(0, 30)}
                      </span>
                    </a>
                  ) : (
                    <span
                      key={j}
                      className={`truncate rounded px-1.5 py-1 text-[10px] leading-tight ${KIND_STYLE[ev.kind]}`}
                      title={`${ev.time} EAT — ${ev.label}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        <PlatformIcon platform={ev.platform} /> {ev.time}{" "}
                        {ev.label.slice(0, 30)}
                      </span>
                    </span>
                  )
                )}
                {dayEvents.length > 4 && (
                  <span className="px-1.5 font-mono text-[10px] text-muted">
                    +{dayEvents.length - 4} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 font-mono text-[10px] text-muted">
        Published history shows the 25 most recent posts per platform —
        older days may look empty.
        {!readOnly && " Hover a day and hit + to compose for it."}
      </p>
    </div>
  );
}
