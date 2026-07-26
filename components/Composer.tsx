"use client";

import { useActionState, useRef, useState } from "react";
import { createPost, type ActionState } from "@/app/actions";

/** datetime-local value for a Date, in the browser's local time. */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function Composer({
  igLinked = false,
  igUsername,
  igQueueReady = false,
  defaultWhen,
}: {
  igLinked?: boolean;
  igUsername?: string;
  igQueueReady?: boolean;
  /** Prefill for the schedule picker (from the calendar's "+" links). */
  defaultWhen?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createPost,
    null
  );
  const [mode, setMode] = useState<"now" | "schedule">("schedule");
  const [toFb, setToFb] = useState(true);
  const [toIg, setToIg] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);
  const [videoName, setVideoName] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  const minTime = toLocalInputValue(new Date(Date.now() + 15 * 60 * 1000));
  const maxTime = toLocalInputValue(
    new Date(Date.now() + 75 * 24 * 60 * 60 * 1000)
  );
  // Use the calendar prefill when it's inside the allowed window.
  const initialWhen =
    defaultWhen && defaultWhen > minTime && defaultWhen < maxTime
      ? defaultWhen
      : minTime;

  function onPickPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, 10);
    previews.forEach((p) => URL.revokeObjectURL(p));
    setPreviews(files.map((f) => URL.createObjectURL(f)));
    if (files.length > 0) clearVideo(); // photos and video are exclusive
  }

  function clearPhotos() {
    if (fileRef.current) fileRef.current.value = "";
    previews.forEach((p) => URL.revokeObjectURL(p));
    setPreviews([]);
  }

  function onPickVideo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setVideoName(f ? f.name : null);
    if (f) clearPhotos(); // photos and video are exclusive
  }

  function clearVideo() {
    if (videoRef.current) videoRef.current.value = "";
    setVideoName(null);
  }

  // Convert the datetime-local value to unix seconds before submit.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    const form = e.currentTarget;
    const dt = form.elements.namedItem("when") as HTMLInputElement | null;
    const hidden = form.elements.namedItem(
      "scheduledAt"
    ) as HTMLInputElement | null;
    if (hidden) {
      hidden.value =
        mode === "schedule" && dt?.value
          ? String(Math.floor(new Date(dt.value).getTime() / 1000))
          : "";
    }
  }

  const hasMedia = previews.length > 0 || Boolean(videoName);
  const igNeedsPhoto = toIg && !hasMedia;
  const igScheduleBlocked =
    toIg && !igQueueReady && (mode === "schedule" || Boolean(videoName));
  const linkConflict = Boolean(linkUrl) && (hasMedia || toIg);

  return (
    <form
      action={formAction}
      onSubmit={onSubmit}
      className="rounded-lg border border-line bg-white p-5 shadow-sm"
    >
      <input type="hidden" name="scheduledAt" />

      {/* Destinations */}
      <div>
        <span className="font-mono text-[11px] tracking-[0.12em] text-warmgray uppercase">
          Post to
        </span>
        <div className="mt-2 flex flex-wrap gap-2">
          <label
            className={`flex cursor-pointer items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors ${
              toFb
                ? "border-navy bg-navy text-gold"
                : "border-line text-warmgray hover:text-charcoal"
            }`}
          >
            <input
              type="checkbox"
              name="dest_fb"
              checked={toFb}
              onChange={(e) => setToFb(e.target.checked)}
              className="hidden"
            />
            ⓕ Facebook
          </label>
          <label
            className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors ${
              !igLinked
                ? "cursor-not-allowed border-line text-warmgray/40"
                : toIg
                  ? "cursor-pointer border-navy bg-navy text-gold"
                  : "cursor-pointer border-line text-warmgray hover:text-charcoal"
            }`}
            title={
              igLinked
                ? undefined
                : "No Instagram professional account linked to this page"
            }
          >
            <input
              type="checkbox"
              name="dest_ig"
              checked={toIg}
              disabled={!igLinked}
              onChange={(e) => setToIg(e.target.checked)}
              className="hidden"
            />
            ⓘ Instagram{igUsername ? ` · @${igUsername}` : ""}
          </label>
        </div>
        {!igLinked && (
          <p className="mt-2 font-mono text-[10px] text-warmgray">
            To post to Instagram, link an IG professional account to this
            page in Meta Business Suite → Settings → Linked accounts.
          </p>
        )}
      </div>

      <label className="mt-4 block">
        <span className="font-mono text-[11px] tracking-[0.12em] text-warmgray uppercase">
          Message
        </span>
        <textarea
          name="message"
          rows={6}
          placeholder="What's happening at Awaj ET?"
          className="mt-2 w-full resize-y rounded-md border border-line bg-mist/40 px-3 py-2.5 text-sm focus:outline-2 focus:outline-gold"
        />
      </label>

      {/* Link (Facebook only — renders a preview card) */}
      <label className="mt-4 block">
        <span className="font-mono text-[11px] tracking-[0.12em] text-warmgray uppercase">
          Link (optional, Facebook only)
        </span>
        <input
          type="url"
          name="link"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          placeholder="https://awajet.com/offer"
          className="mt-2 w-full rounded-md border border-line bg-mist/40 px-3 py-2.5 text-sm focus:outline-2 focus:outline-gold"
        />
        {linkUrl && (
          <span className="mt-1.5 block font-mono text-[10px] text-warmgray">
            Facebook shows the link's preview card — uploaded media can't be
            combined with it, and Instagram doesn't support link posts.
          </span>
        )}
      </label>

      {/* Photos (up to 10 → multi-photo on FB, carousel on IG) */}
      <div className="mt-4">
        <span className="font-mono text-[11px] tracking-[0.12em] text-warmgray uppercase">
          Photos{" "}
          {toIg ? "(IG: 1 = post, 2–10 = carousel)" : "(up to 10, optional)"}
        </span>
        <div className="mt-2 flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            name="photos"
            accept="image/*"
            multiple
            onChange={onPickPhotos}
            className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-navy-soft"
          />
          {previews.length > 0 && (
            <button
              type="button"
              onClick={clearPhotos}
              className="font-mono text-[11px] text-warmgray underline hover:text-amber"
            >
              Remove all
            </button>
          )}
        </div>
        {previews.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {previews.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={src}
                alt={`Preview ${i + 1}`}
                className="h-24 w-24 rounded-md border border-line object-cover"
              />
            ))}
            {previews.length > 1 && (
              <span className="self-end font-mono text-[10px] text-warmgray">
                {previews.length} photos
              </span>
            )}
          </div>
        )}
      </div>

      {/* Video (FB video post / IG Reel) */}
      <div className="mt-4">
        <span className="font-mono text-[11px] tracking-[0.12em] text-warmgray uppercase">
          Video {toIg ? "(published as a Reel)" : "(optional)"}
        </span>
        <div className="mt-2 flex items-center gap-3">
          <input
            ref={videoRef}
            type="file"
            name="video"
            accept="video/mp4,video/quicktime"
            onChange={onPickVideo}
            className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-navy-soft"
          />
          {videoName && (
            <button
              type="button"
              onClick={clearVideo}
              className="font-mono text-[11px] text-warmgray underline hover:text-amber"
            >
              Remove
            </button>
          )}
        </div>
        {videoName && (
          <p className="mt-2 font-mono text-[10px] text-warmgray">
            🎬 {videoName}
            {toIg &&
              " — Reels are queued and publish once Instagram finishes processing (~1–3 min)."}
          </p>
        )}
      </div>

      {/* Timing */}
      <div className="mt-5 border-t border-line pt-4">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["schedule", "Schedule"],
              ["now", "Publish now"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                mode === value
                  ? "bg-navy text-gold"
                  : "border border-line text-warmgray hover:text-charcoal"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "schedule" && (
          <div className="mt-3">
            <input
              type="datetime-local"
              name="when"
              required
              min={minTime}
              max={maxTime}
              defaultValue={initialWhen}
              className="rounded-md border border-line bg-mist/40 px-3 py-2 text-sm focus:outline-2 focus:outline-gold"
            />
            <p className="mt-2 font-mono text-[10px] text-warmgray">
              Facebook publishes natively; Instagram posts are queued and
              published by this app when due. Window: 10 minutes to 75 days
              from now (your local time).
            </p>
          </div>
        )}
      </div>

      {igScheduleBlocked && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 font-mono text-[11px] text-red-700">
          {videoName
            ? "Instagram Reels need the Appwrite queue (APPWRITE_* vars in .env) for video hosting — see README."
            : "Instagram scheduling needs the Appwrite queue (APPWRITE_* vars in .env). Publish to Instagram immediately, or configure the queue — see README."}
        </p>
      )}

      {state && (
        <p
          className={`mt-4 rounded-md px-3 py-2 font-mono text-[11px] ${
            state.ok ? "bg-gold/15 text-amber" : "bg-red-50 text-red-700"
          }`}
        >
          {state.message}
        </p>
      )}

      {linkConflict && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 font-mono text-[11px] text-red-700">
          {toIg
            ? "Link posts are Facebook-only — untick Instagram, or clear the link and put the URL in the caption text instead."
            : "A link post can't include uploaded media — remove the link or the media."}
        </p>
      )}

      <button
        disabled={pending || igNeedsPhoto || igScheduleBlocked || linkConflict}
        className="mt-4 rounded-md bg-gold px-5 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-amber hover:text-white disabled:opacity-50"
        title={
          igNeedsPhoto ? "Instagram posts need a photo or video" : undefined
        }
      >
        {pending
          ? "Sending…"
          : mode === "schedule"
            ? "Schedule post"
            : "Publish now"}
      </button>
    </form>
  );
}
