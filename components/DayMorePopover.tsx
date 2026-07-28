"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { KIND_STYLE, PlatformIcon, type CalEvent } from "@/components/CalendarShared";

/**
 * "+N more" trigger for a calendar day that overflows its 4 visible
 * chips. Opens a modal listing every event for that day — simpler and
 * more reliable on mobile than a floating popover anchored to a small
 * grid cell, which can run off-screen.
 */
export function DayMorePopover({
  count,
  dateLabel,
  events,
}: {
  count: number;
  dateLabel: string;
  events: CalEvent[];
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-1.5 text-left font-mono text-[10px] text-muted underline decoration-dotted underline-offset-2 hover:text-amber"
      >
        +{count} more
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Posts on ${dateLabel}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-lg border border-edge bg-card p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-sm font-semibold">{dateLabel}</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="shrink-0 text-muted hover:text-fg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="mt-3 flex flex-col gap-1.5">
              {events.map((ev, i) => {
                const inner = (
                  <span className="flex items-center gap-1.5">
                    <PlatformIcon platform={ev.platform} className="h-3 w-3 shrink-0" />
                    <span className="shrink-0 font-mono text-[10px] text-muted">{ev.time}</span>
                    <span className="truncate text-xs">{ev.label}</span>
                  </span>
                );
                return (
                  <li key={i} className={`rounded px-2 py-1.5 ${KIND_STYLE[ev.kind]}`}>
                    {ev.href ? (
                      <a
                        href={ev.href}
                        target={ev.href.startsWith("http") ? "_blank" : undefined}
                        rel="noopener noreferrer"
                        className="block hover:underline"
                      >
                        {inner}
                      </a>
                    ) : (
                      inner
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
