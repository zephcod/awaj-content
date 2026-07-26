"use client";

import { useActionState, useState } from "react";
import { reschedule, rescheduleIg, type ActionState } from "@/app/actions";

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function RescheduleForm({
  postId,
  currentUnix,
  platform = "fb",
}: {
  postId: string;
  currentUnix: number;
  platform?: "fb" | "ig";
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    platform === "ig" ? rescheduleIg : reschedule,
    null
  );

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="font-mono text-[11px] text-warmgray underline hover:text-amber"
      >
        Reschedule
      </button>
    );
  }

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        const form = e.currentTarget;
        const dt = form.elements.namedItem("when") as HTMLInputElement | null;
        const hidden = form.elements.namedItem(
          "scheduledAt"
        ) as HTMLInputElement | null;
        if (hidden && dt?.value) {
          hidden.value = String(
            Math.floor(new Date(dt.value).getTime() / 1000)
          );
        }
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="id" value={postId} />
      <input type="hidden" name="scheduledAt" />
      <input
        type="datetime-local"
        name="when"
        required
        min={toLocalInputValue(new Date(Date.now() + 15 * 60 * 1000))}
        max={toLocalInputValue(new Date(Date.now() + 75 * 24 * 60 * 60 * 1000))}
        defaultValue={toLocalInputValue(new Date(currentUnix * 1000))}
        className="rounded-md border border-line bg-mist/40 px-2 py-1.5 text-xs focus:outline-2 focus:outline-gold"
      />
      <button
        disabled={pending}
        className="rounded-md bg-navy px-3 py-1.5 text-xs font-semibold text-gold disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="font-mono text-[11px] text-warmgray underline"
      >
        Cancel
      </button>
      {state && !state.ok && (
        <span className="w-full font-mono text-[11px] text-red-700">
          {state.message}
        </span>
      )}
    </form>
  );
}
