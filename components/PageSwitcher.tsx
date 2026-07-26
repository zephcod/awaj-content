"use client";

import { useTransition } from "react";
import { setActivePage } from "@/app/actions";

export type SwitcherPage = { id: string; name: string; pictureUrl?: string };

export default function PageSwitcher({
  pages,
  activeId,
}: {
  pages: SwitcherPage[];
  activeId: string;
}) {
  const [pending, startTransition] = useTransition();

  if (!pages.length) return null;

  const active = pages.find((p) => p.id === activeId) ?? pages[0];

  if (pages.length === 1) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-white/5 px-3 py-2">
        {active.pictureUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={active.pictureUrl}
            alt=""
            className="h-6 w-6 rounded-full"
          />
        )}
        <span className="truncate text-xs font-semibold text-white/80">
          {active.name}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md bg-white/5 px-2 py-1.5">
      {active.pictureUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={active.pictureUrl} alt="" className="h-6 w-6 rounded-full" />
      )}
      <select
        value={active.id}
        disabled={pending}
        onChange={(e) => {
          const id = e.target.value;
          startTransition(() => setActivePage(id));
        }}
        className="w-full cursor-pointer bg-transparent text-xs font-semibold text-white/80 outline-none disabled:opacity-50 [&>option]:text-charcoal"
      >
        {pages.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}
