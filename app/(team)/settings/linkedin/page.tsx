import { AlertTriangle, Link2, Trash2 } from "lucide-react";
import { disconnectLiOrg, setActiveLiOrg } from "@/app/actions";
import { LinkedInGlyph } from "@/components/icons/BrandGlyphs";
import { linkedinOAuthConfigured } from "@/lib/env";
import { getActiveLiOrg, listLiConnections, type LiConnection } from "@/lib/linkedinOrgs";

export const dynamic = "force-dynamic";

/** Human date for token expiry, plus whether it's within the "reconnect soon" window. */
function expiryInfo(unixSeconds: number): { label: string; soon: boolean } {
  const days = Math.round((unixSeconds * 1000 - Date.now()) / (24 * 60 * 60 * 1000));
  const label =
    days < 0
      ? `expired ${Math.abs(days)}d ago`
      : days === 0
        ? "expires today"
        : `expires in ${days}d`;
  return { label, soon: days <= 7 };
}

export default async function LinkedInSettingsPage() {
  let connections: LiConnection[] = [];
  let activeUrn = "";
  let loadError: string | null = null;

  try {
    connections = await listLiConnections();
    activeUrn = (await getActiveLiOrg())?.orgUrn ?? "";
  } catch (e) {
    loadError = e instanceof Error ? e.message : "Could not load LinkedIn connections.";
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display flex items-center gap-2 text-2xl font-bold">
        <LinkedInGlyph className="h-6 w-6" /> LinkedIn
      </h1>
      <p className="mt-1 text-sm text-muted">
        Connect a client&apos;s LinkedIn Page to post and schedule to it from Compose.
      </p>

      {/* SCAFFOLD notice — remove once Community Management API access is
          approved and this has been exercised against real credentials. */}
      <div className="mt-5 rounded-lg border border-amber/40 bg-gold/10 px-4 py-3 text-sm text-fg">
        <p className="font-semibold">This integration is a scaffold</p>
        <p className="mt-1 text-muted">
          Posting/scheduling code is written against LinkedIn&apos;s documented API shapes but
          hasn&apos;t been exercised against a real, approved app yet — Community Management API
          access is pending LinkedIn&apos;s review. Connecting will fail until that access clears
          and LINKEDIN_CLIENT_ID/SECRET/REDIRECT_URI are set in .env.
        </p>
      </div>

      {!linkedinOAuthConfigured() && (
        <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          LinkedIn isn&apos;t configured — set LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, and
          LINKEDIN_REDIRECT_URI in .env (see README).
        </p>
      )}

      {loadError && (
        <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {loadError}
        </p>
      )}

      <a
        href="/api/linkedin/connect"
        className="mt-5 flex w-fit items-center gap-1.5 rounded-md bg-gold px-4 py-2 text-sm font-semibold text-navy hover:bg-amber hover:text-white"
      >
        <Link2 className="h-4 w-4" />
        Connect a LinkedIn Page
      </a>
      <p className="mt-2 font-mono text-[10px] text-muted">
        Send this link to a super-admin of the client&apos;s LinkedIn Page — they complete the
        consent screen themselves; there&apos;s no way to do this on their behalf.
      </p>

      {connections.length > 0 && (
        <ul className="mt-6 flex flex-col gap-3">
          {connections.map((c) => {
            const expiry = expiryInfo(c.accessTokenExpiresAt);
            const isActive = c.orgUrn === activeUrn;
            return (
              <li
                key={c.$id}
                className="rounded-lg border border-edge bg-card p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{c.orgName}</p>
                    <p className="font-mono text-[10px] text-muted">{c.orgUrn}</p>
                  </div>
                  {isActive ? (
                    <span className="rounded-full bg-gold/15 px-3 py-1 font-mono text-[10px] tracking-wider text-amber uppercase">
                      Active
                    </span>
                  ) : (
                    <form action={setActiveLiOrg.bind(null, c.orgUrn)}>
                      <button className="rounded-full border border-edge px-3 py-1 font-mono text-[10px] tracking-wider text-muted uppercase hover:border-gold hover:text-fg">
                        Make active
                      </button>
                    </form>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <span
                    className={`flex items-center gap-1 font-mono text-[10px] ${
                      expiry.soon ? "text-red-600 dark:text-red-400" : "text-muted"
                    }`}
                  >
                    {expiry.soon && <AlertTriangle className="h-3 w-3" />}
                    {expiry.label}
                    {!c.refreshToken && " (no auto-refresh — Standard tier)"}
                  </span>
                </div>
                {expiry.soon && (
                  <p className="mt-2 rounded-md bg-red-50 px-3 py-2 font-mono text-[11px] text-red-700 dark:bg-red-950/40 dark:text-red-300">
                    Reconnect soon via &quot;Connect a LinkedIn Page&quot; above, or posts to
                    this organization will start failing.
                  </p>
                )}
                <form action={disconnectLiOrg} className="mt-3 border-t border-edge pt-3">
                  <input type="hidden" name="id" value={c.$id} />
                  <button className="flex items-center gap-1 font-mono text-[11px] text-red-600 underline hover:text-red-700">
                    <Trash2 className="h-3 w-3" />
                    Disconnect
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}

      {connections.length === 0 && !loadError && (
        <div className="mt-8 rounded-lg border border-dashed border-edge bg-card/60 p-10 text-center">
          <p className="text-sm text-muted">No LinkedIn Pages connected yet.</p>
        </div>
      )}
    </div>
  );
}
