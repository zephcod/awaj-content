"use client";

import { setFbQueueStatus, setIgQueueStatus, setLiQueueStatus } from "@/app/actions";

const STATUSES = ["pending", "approved", "publishing", "failed", "published"] as const;

/**
 * Manual status override for a queue item — mainly an escape hatch for
 * items stuck at "publishing" (see lib/*queue.ts's stuck-item reclaim)
 * without waiting the full 45 minutes, but works for any status change.
 * Purely a database field edit: it never touches staged media or
 * triggers a real publish/delete, so picking "published" here doesn't
 * post anything — it just tells the queue to leave the item alone.
 */
export default function StatusSelect({
  itemId,
  currentStatus,
  platform,
}: {
  itemId: string;
  currentStatus: string;
  platform: "fb" | "ig" | "li";
}) {
  const action =
    platform === "fb"
      ? setFbQueueStatus
      : platform === "ig"
        ? setIgQueueStatus
        : setLiQueueStatus;

  return (
    <form action={action} className="flex items-center gap-1">
      <input type="hidden" name="id" value={itemId} />
      {/* <label className="font-mono text-[10px] text-muted uppercase">Status</label> */}
      <select
        name="status"
        defaultValue={currentStatus}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-md border border-edge bg-input px-1.5 py-1 font-mono text-[11px] focus:outline-2 focus:outline-gold"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </form>
  );
}
