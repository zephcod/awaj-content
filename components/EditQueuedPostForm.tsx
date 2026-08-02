"use client";

import { Pencil } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { editFbQueued, editIgQueued, editLiQueued, type ActionState } from "@/app/actions";

/**
 * Inline "Edit" panel for a queued post — caption text plus an
 * optional media replacement. Toggling it open reveals a small form;
 * saving always resets the item's status to "pending" (see
 * lib/*queue.ts's editXItem), so an edited item — including a
 * previously failed one — becomes eligible to publish again.
 */
export default function EditQueuedPostForm({
  itemId,
  platform,
  currentCaption,
  mediaRefs,
  mediaType,
  hasMedia,
  allowMultiple,
  accept,
}: {
  itemId: string;
  platform: "fb" | "ig" | "li";
  currentCaption: string;
  /** Current staged Appwrite file ids — sent back so the server can clean them up on replace. */
  mediaRefs: string[];
  mediaType: string;
  /** False for text-only posts (e.g. an FB text/link item) — no file input shown. */
  hasMedia: boolean;
  /** True for image/carousel-family types, where more than one file can replace the set. */
  allowMultiple: boolean;
  accept: string;
}) {
  const [open, setOpen] = useState(false);
  const action =
    platform === "fb" ? editFbQueued : platform === "ig" ? editIgQueued : editLiQueued;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, null);

  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 font-mono text-[11px] text-muted underline hover:text-amber"
      >
        <Pencil className="h-3 w-3" />
        Edit
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="mt-3 flex w-full flex-col gap-2 border-t border-edge pt-3"
    >
      <input type="hidden" name="id" value={itemId} />
      <input type="hidden" name="mediaType" value={mediaType} />
      <input type="hidden" name="oldMediaRefs" value={JSON.stringify(mediaRefs)} />
      <textarea
        name="caption"
        defaultValue={currentCaption}
        rows={4}
        className="w-full resize-y rounded-md border border-edge bg-input px-3 py-2 text-sm focus:outline-2 focus:outline-gold"
      />
      {hasMedia && (
        <label className="block">
          <span className="font-mono text-[10px] text-muted uppercase">
            Replace media (optional — leave blank to keep current)
          </span>
          <input
            type="file"
            name="media"
            accept={accept}
            multiple={allowMultiple}
            className="mt-1 block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-navy-soft"
          />
        </label>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={pending}
          className="rounded-md bg-navy px-3 py-1.5 text-xs font-semibold text-gold disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="font-mono text-[11px] text-muted underline disabled:opacity-50"
        >
          Cancel
        </button>
        {state && !state.ok && (
          <span className="w-full font-mono text-[11px] text-red-700">{state.message}</span>
        )}
      </div>
    </form>
  );
}
