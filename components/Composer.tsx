"use client";

import { useActionState, useRef, useState } from "react";
import { Video } from "lucide-react";
import { FacebookGlyph, InstagramGlyph, LinkedInGlyph } from "@/components/icons/BrandGlyphs";
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
  liOrgName,
  liQueueReady = false,
  defaultWhen,
}: {
  igLinked?: boolean;
  igUsername?: string;
  igQueueReady?: boolean;
  /** Name of the currently-active connected LinkedIn organization, if any (lib/linkedinOrgs.ts). */
  liOrgName?: string;
  liQueueReady?: boolean;
  /** Prefill for the schedule picker (from the calendar's "+" links). */
  defaultWhen?: string;
}) {
  const liLinked = Boolean(liOrgName);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createPost,
    null
  );
  const [mode, setMode] = useState<"now" | "schedule">("schedule");
  const [toFb, setToFb] = useState(true);
  const [toIg, setToIg] = useState(false);
  const [toLi, setToLi] = useState(false);
  const [igAsStory, setIgAsStory] = useState(false);

  /** Stories are Instagram-only — flipping it on clears the other destinations
   * and the link field (which disappears from the form along with them). */
  function onToggleStory(checked: boolean) {
    setIgAsStory(checked);
    if (checked) {
      setToFb(false);
      setToLi(false);
      setLinkUrl("");
    }
  }

  function onToggleIg(checked: boolean) {
    setToIg(checked);
    if (!checked) setIgAsStory(false); // Story mode needs Instagram on
  }
  const [previews, setPreviews] = useState<string[]>([]);
  const [videoName, setVideoName] = useState<string | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const thumbRef = useRef<HTMLInputElement>(null);

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
    const files = Array.from(e.target.files ?? []).slice(0, igAsStory ? 1 : 10);
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
    else clearThumb(); // no video, no cover
  }

  function clearVideo() {
    if (videoRef.current) videoRef.current.value = "";
    setVideoName(null);
    clearThumb(); // cover only makes sense alongside a video
  }

  function onPickThumb(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (thumbPreview) URL.revokeObjectURL(thumbPreview);
    setThumbPreview(f ? URL.createObjectURL(f) : null);
  }

  function clearThumb() {
    if (thumbRef.current) thumbRef.current.value = "";
    if (thumbPreview) URL.revokeObjectURL(thumbPreview);
    setThumbPreview(null);
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
  // LinkedIn has no native scheduling at all (unlike Facebook) — any
  // scheduled post, or any video (queued the same way IG Reels are,
  // since publish-time processing isn't polled synchronously), needs
  // the queue.
  const liScheduleBlocked =
    toLi && !liQueueReady && (mode === "schedule" || Boolean(videoName));
  const linkConflict = Boolean(linkUrl) && (hasMedia || toIg || toLi);

  return (
    <form
      action={formAction}
      onSubmit={onSubmit}
      className="rounded-lg border border-edge bg-card p-5 shadow-sm"
    >
      <input type="hidden" name="scheduledAt" />

      {/* Destinations */}
      <div>
        <span className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
          Post to
        </span>
        <div className="mt-2 flex flex-wrap gap-2">
          <label
            className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors ${
              igAsStory
                ? "cursor-not-allowed border-edge text-muted/40"
                : toFb
                  ? "cursor-pointer border-amber-400 bg-navy text-gold"
                  : "cursor-pointer border-edge text-muted hover:text-fg"
            }`}
            title={igAsStory ? "Stories are Instagram-only" : undefined}
          >
            <input
              type="checkbox"
              name="dest_fb"
              checked={toFb}
              disabled={igAsStory}
              onChange={(e) => setToFb(e.target.checked)}
              className="hidden"
            />
            <span className="flex items-center gap-1.5">
              <FacebookGlyph className="h-3.5 w-3.5" /> Facebook
            </span>
          </label>
          <label
            className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors ${
              !igLinked
                ? "cursor-not-allowed border-edge text-muted/40"
                : toIg
                  ? "cursor-pointer border-amber-400 bg-navy text-gold"
                  : "cursor-pointer border-edge text-muted hover:text-fg"
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
              onChange={(e) => onToggleIg(e.target.checked)}
              className="hidden"
            />
            <span className="flex items-center gap-1.5">
              <InstagramGlyph className="h-3.5 w-3.5" />
              Instagram{igUsername ? ` · @${igUsername}` : ""}
            </span>
          </label>
          <label
            className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors ${
              !liLinked || igAsStory
                ? "cursor-not-allowed border-edge text-muted/40"
                : toLi
                  ? "cursor-pointer border-amber-400 bg-navy text-gold"
                  : "cursor-pointer border-edge text-muted hover:text-fg"
            }`}
            title={
              igAsStory
                ? "Stories are Instagram-only"
                : liLinked
                  ? undefined
                  : "No LinkedIn organization connected yet"
            }
          >
            <input
              type="checkbox"
              name="dest_li"
              checked={toLi}
              disabled={!liLinked || igAsStory}
              onChange={(e) => setToLi(e.target.checked)}
              className="hidden"
            />
            <span className="flex items-center gap-1.5">
              <LinkedInGlyph className="h-3.5 w-3.5" />
              LinkedIn{liOrgName ? ` · ${liOrgName}` : ""}
            </span>
          </label>
        </div>
        {!igLinked && (
          <p className="mt-2 font-mono text-[10px] text-muted">
            To post to Instagram, link an IG professional account to this
            page in Meta Business Suite → Settings → Linked accounts.
          </p>
        )}
        {!liLinked && (
          <p className="mt-1 font-mono text-[10px] text-muted">
            No LinkedIn Page connected — a super-admin of the client&apos;s
            LinkedIn Page needs to connect it (see /settings/linkedin).
          </p>
        )}
        {toIg && (
          <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              name="ig_story"
              checked={igAsStory}
              onChange={(e) => onToggleStory(e.target.checked)}
              className="h-3.5 w-3.5 accent-gold"
            />
            Post as a Story instead of a feed post
            <span className="font-mono text-[10px] text-muted/70">
              (Instagram-only · one photo or video · no caption)
            </span>
          </label>
        )}
      </div>

      {!igAsStory && (
        <label className="mt-4 block">
          <span className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
            Message
          </span>
          <textarea
            name="message"
            rows={6}
            placeholder="What's happening at Awaj ET?"
            className="mt-2 w-full resize-y rounded-md border border-edge bg-input px-3 py-2.5 text-sm focus:outline-2 focus:outline-gold"
          />
        </label>
      )}

      {igAsStory && (
        <p className="mt-4 rounded-md bg-navy/5 px-3 py-2 font-mono text-[11px] text-muted">
          Instagram Stories don&apos;t support caption text via the API — any
          text needs to already be part of the photo or video itself.
        </p>
      )}

      {/* Link (Facebook only — renders a preview card) */}
      {!igAsStory && (
        <label className="mt-4 block">
          <span className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
            Link (optional, Facebook only)
          </span>
          <input
            type="url"
            name="link"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://awajet.com/offer"
            className="mt-2 w-full rounded-md border border-edge bg-input px-3 py-2.5 text-sm focus:outline-2 focus:outline-gold"
          />
          {linkUrl && (
            <span className="mt-1.5 block font-mono text-[10px] text-muted">
              Facebook shows the link's preview card — uploaded media can't be
              combined with it, and Instagram/LinkedIn don't support link
              posts here (put the URL in the caption text instead).
            </span>
          )}
        </label>
      )}

      {/* Photos (up to 10 → multi-photo on FB, carousel on IG; 1 for a Story) */}
      <div className="mt-4">
        <span className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
          Photos{" "}
          {igAsStory
            ? "(IG Story: exactly 1)"
            : toIg
              ? "(IG: 1 = post, 2–10 = carousel)"
              : "(up to 10, optional)"}
        </span>
        <div className="mt-2 flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            name="photos"
            accept="image/*"
            multiple={!igAsStory}
            onChange={onPickPhotos}
            className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-navy-soft"
          />
          {previews.length > 0 && (
            <button
              type="button"
              onClick={clearPhotos}
              className="font-mono text-[11px] text-muted underline hover:text-amber"
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
                className="h-24 w-24 rounded-md border border-edge object-cover"
              />
            ))}
            {previews.length > 1 && (
              <span className="self-end font-mono text-[10px] text-muted">
                {previews.length} photos
              </span>
            )}
          </div>
        )}
      </div>

      {/* Video (FB video post / IG Reel / IG Story) */}
      <div className="mt-4">
        <span className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
          Video{" "}
          {igAsStory
            ? "(published as a Story)"
            : toIg
              ? "(published as a Reel)"
              : "(optional)"}
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
              className="font-mono text-[11px] text-muted underline hover:text-amber"
            >
              Remove
            </button>
          )}
        </div>
        {videoName && (
          <p className="mt-2 flex items-center gap-1.5 font-mono text-[10px] text-muted">
            <Video className="h-3 w-3 shrink-0" />
            {videoName}
            {toIg &&
              (igAsStory
                ? " — Story videos are queued and publish once Instagram finishes processing (~1–3 min)."
                : " — Reels are queued and publish once Instagram finishes processing (~1–3 min).")}
          </p>
        )}
      </div>

      {/* Reel cover image (Instagram Reels only — Stories don't support a custom cover via the API) */}
      {toIg && videoName && !igAsStory && (
        <div className="mt-4">
          <span className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
            Reel cover (optional)
          </span>
          <div className="mt-2 flex items-center gap-3">
            <input
              ref={thumbRef}
              type="file"
              name="igThumbnail"
              accept="image/*"
              onChange={onPickThumb}
              className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white hover:file:bg-navy-soft"
            />
            {thumbPreview && (
              <button
                type="button"
                onClick={clearThumb}
                className="font-mono text-[11px] text-muted underline hover:text-amber"
              >
                Remove
              </button>
            )}
          </div>
          {thumbPreview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbPreview}
              alt="Reel cover preview"
              className="mt-3 h-24 w-24 rounded-md border border-edge object-cover"
            />
          )}
          <p className="mt-2 font-mono text-[10px] text-muted">
            Custom cover image (recommended 1080×1920, 9:16). Leave blank and
            Instagram picks a frame from the video automatically.
          </p>
        </div>
      )}

      {/* Timing */}
      <div className="mt-5 border-t border-edge pt-4">
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
                  : "border border-edge text-muted hover:text-fg"
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
              className="rounded-md border border-edge bg-input px-3 py-2 text-sm focus:outline-2 focus:outline-gold"
            />
            <p className="mt-2 font-mono text-[10px] text-muted">
              Facebook publishes natively; Instagram and LinkedIn posts are
              queued and published by this app when due. Window: 10 minutes
              to 75 days from now (your local time).
            </p>
          </div>
        )}
      </div>

      {igScheduleBlocked && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 font-mono text-[11px] text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {videoName
            ? "Instagram Reels need the Appwrite queue (APPWRITE_* vars in .env) for video hosting — see README."
            : "Instagram scheduling needs the Appwrite queue (APPWRITE_* vars in .env). Publish to Instagram immediately, or configure the queue — see README."}
        </p>
      )}

      {liScheduleBlocked && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 font-mono text-[11px] text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {videoName
            ? "LinkedIn video needs the queue configured (LI_MEDIA_BUCKET_ID + APPWRITE_* vars in .env) — see README."
            : "LinkedIn scheduling needs the queue configured (LI_MEDIA_BUCKET_ID + APPWRITE_* vars in .env). Publish to LinkedIn immediately, or configure the queue — see README."}
        </p>
      )}

      {state && (
        <p
          className={`mt-4 rounded-md px-3 py-2 font-mono text-[11px] ${
            state.ok ? "bg-gold/15 text-amber" : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
          }`}
        >
          {state.message}
        </p>
      )}

      {linkConflict && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 font-mono text-[11px] text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {toIg
            ? "Link posts are Facebook-only — untick Instagram, or clear the link and put the URL in the caption text instead."
            : "A link post can't include uploaded media — remove the link or the media."}
        </p>
      )}

      <button
        disabled={
          pending ||
          igNeedsPhoto ||
          igScheduleBlocked ||
          liScheduleBlocked ||
          linkConflict
        }
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
