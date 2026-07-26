import { fbConfigured } from "@/lib/env";
import { listPublishedPosts, type PublishedPost } from "@/lib/facebook";
import { fmtDateTime } from "@/lib/format";
import { getIgAccount, listIgMedia, type IgMedia } from "@/lib/instagram";
import { getActivePage } from "@/lib/pages";

export const dynamic = "force-dynamic";

export default async function PublishedPage() {
  let posts: PublishedPost[] = [];
  let igMedia: IgMedia[] = [];
  let igUsername = "";
  let error: string | null = null;
  let pageName = "";

  if (!fbConfigured()) {
    error = "Facebook is not connected — add credentials to .env first.";
  } else {
    try {
      const page = await getActivePage();
      if (!page) throw new Error("No pages resolved from credentials.");
      pageName = page.name;
      posts = await listPublishedPosts(page);
      try {
        const ig = await getIgAccount(page);
        if (ig) {
          igUsername = ig.username ?? "";
          igMedia = await listIgMedia(page, ig.id);
        }
      } catch {
        // IG section is optional; FB list still renders
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Could not load posts.";
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">Published</h1>
      <p className="mt-1 text-sm text-warmgray">
        {pageName && (
          <span className="font-semibold text-charcoal">{pageName} · </span>
        )}
        The 25 most recent posts on your Page, with engagement.
      </p>

      {error && (
        <p className="mt-6 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {!error && posts.length === 0 && (
        <div className="mt-10 rounded-lg border border-dashed border-line bg-white/60 p-10 text-center">
          <p className="text-sm text-warmgray">No published posts yet.</p>
        </div>
      )}

      {/* ── Instagram recent media ── */}
      {igMedia.length > 0 && (
        <div className="mt-8">
          <h2 className="font-mono text-xs font-semibold tracking-[0.14em] text-warmgray uppercase">
            ⓘ Instagram{igUsername && ` · @${igUsername}`}
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {igMedia.map((m) => (
              <a
                key={m.id}
                href={m.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="group overflow-hidden rounded-lg border border-line bg-white shadow-sm"
              >
                {(m.media_url || m.thumbnail_url) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.thumbnail_url ?? m.media_url}
                    alt=""
                    className="aspect-square w-full object-cover transition-transform group-hover:scale-105"
                  />
                )}
                <div className="flex justify-between px-2 py-1.5 font-mono text-[10px] text-warmgray">
                  <span>♥ {m.like_count ?? 0}</span>
                  <span>💬 {m.comments_count ?? 0}</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* ── Facebook posts ── */}
      {posts.length > 0 && (
        <h2 className="mt-8 font-mono text-xs font-semibold tracking-[0.14em] text-warmgray uppercase">
          ⓕ Facebook
        </h2>
      )}
      <ul className="mt-3 flex flex-col gap-3">
        {posts.map((p) => (
          <li
            key={p.id}
            className="rounded-lg border border-line bg-white p-4 shadow-sm"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-xs text-warmgray">
                {fmtDateTime(p.created_time)} EAT
              </span>
              {p.permalink_url && (
                <a
                  href={p.permalink_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[11px] text-amber underline"
                >
                  View on Facebook ↗
                </a>
              )}
            </div>

            <div className="mt-2 flex gap-4">
              {p.full_picture && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.full_picture}
                  alt=""
                  className="h-20 w-20 shrink-0 rounded-md border border-line object-cover"
                />
              )}
              <p className="text-sm whitespace-pre-wrap">
                {p.message || (
                  <span className="text-warmgray italic">(no text)</span>
                )}
              </p>
            </div>

            <div className="mt-3 flex gap-5 border-t border-line pt-3 font-mono text-[11px] text-warmgray">
              <span>
                ♥ {p.reactions?.summary?.total_count ?? 0} reactions
              </span>
              <span>💬 {p.comments?.summary?.total_count ?? 0} comments</span>
              <span>↻ {p.shares?.count ?? 0} shares</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
