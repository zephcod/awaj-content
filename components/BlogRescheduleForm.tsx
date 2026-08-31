"use client";

import { Clock } from "lucide-react";
import { useActionState, useState } from "react";
import { rescheduleBlogPostAction } from "@/app/blogActions";

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function BlogRescheduleForm({
  postId,
  currentIso,
}: {
  postId: string;
  currentIso?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(rescheduleBlogPostAction, null);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 font-mono text-[11px] text-muted underline hover:text-amber"
      >
        <Clock className="h-3 w-3" />
        Reschedule
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={postId} />
      <input
        type="datetime-local"
        name="when"
        required
        defaultValue={toLocalInputValue(currentIso ? new Date(currentIso) : new Date())}
        className="rounded-md border border-edge bg-input px-2 py-1.5 text-xs focus:outline-2 focus:outline-gold"
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
        className="font-mono text-[11px] text-muted underline"
      >
        Cancel
      </button>
      {state && !state.ok && (
        <span className="w-full font-mono text-[11px] text-red-700">{state.message}</span>
      )}
    </form>
  );
}
