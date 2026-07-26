/**
 * Facebook connection diagnostics.
 * Run from the project root:  node scripts/diagnose.mjs
 *
 * Supports both configurations:
 *  - Multi-page:  FB_SYSTEM_USER_TOKEN + FB_PAGE_IDS (comma-separated)
 *  - Single-page: FB_PAGE_ID + FB_PAGE_ACCESS_TOKEN
 *
 * For each page it verifies the token, derives the Page token
 * (system-user path: GET /{page-id}?fields=access_token) and checks
 * that scheduled posts are readable (permission probe).
 */

import { readFileSync } from "node:fs";

// ── Load .env (no deps) ───────────────────────────────────────────
let raw;
try {
  raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
} catch {
  fail("No .env file found in the project root. Copy .env.example to .env first.");
}
const env = {};
for (const line of raw.split("\n")) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}

const V = env.FB_GRAPH_VERSION || "v23.0";
const SYS = env.FB_SYSTEM_USER_TOKEN || "";
const IDS = (env.FB_PAGE_IDS || env.FB_PAGE_ID || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const LEGACY_TOKEN = env.FB_PAGE_ACCESS_TOKEN || "";

function ok(msg) { console.log(`  ✅ ${msg}`); }
function warn(msg) { console.log(`  ⚠️  ${msg}`); }
function fail(msg) { console.log(`\n  ❌ ${msg}\n`); process.exit(1); }
function note(msg) { console.log(`  ➜  ${msg}`); }

async function graph(token, path, params = {}) {
  const url = new URL(`https://graph.facebook.com/${V}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("access_token", token);
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function probePage(label, token, pageId, requireDerived = false) {
  // Derive/confirm the page token directly from the page.
  const direct = await graph(token, pageId, {
    fields: "id,name,access_token",
  });
  if (direct.json.error) {
    const e = direct.json.error;
    fail(
      `[${label}] Could not fetch page ${pageId} (code ${e.code}):\n` +
      `     "${e.message}"\n` +
      `     Check: page assigned to the system user as an asset; the Meta app\n` +
      `     added to the Business portfolio; FB_PAGE_ID correct (open\n` +
      `     facebook.com/${pageId} to verify).`
    );
  }
  if (requireDerived && !direct.json.access_token) {
    fail(
      `[${label}] "${direct.json.name}" is visible but returned NO page token.\n` +
      `     The token in FB_SYSTEM_USER_TOKEN cannot derive tokens for this\n` +
      `     page. Either the page isn't assigned to the system user as an\n` +
      `     asset, or FB_SYSTEM_USER_TOKEN isn't actually a system-user token.`
    );
  }
  const pageToken = direct.json.access_token || token;
  ok(`[${label}] "${direct.json.name}" (id ${direct.json.id}) — token OK`);

  const sched = await graph(pageToken, `${direct.json.id}/scheduled_posts`, {
    limit: "1",
  });
  if (sched.json.error) {
    const e = sched.json.error;
    fail(
      `[${label}] Page reachable but cannot read scheduled posts\n` +
      `     (code ${e.code}): "${e.message}"\n` +
      `     The token likely lacks pages_read_engagement / pages_manage_posts\n` +
      `     for this page — regenerate the system-user token with those\n` +
      `     permissions and the page assigned.`
    );
  }
  ok(`[${label}] Can read scheduled posts — FB permissions verified`);

  // ── Instagram probe (non-fatal: FB-only pages are fine) ──
  const igLookup = await graph(pageToken, direct.json.id, {
    fields: "instagram_business_account{id,username}",
  });
  const igAcct = igLookup.json.instagram_business_account;
  if (!igAcct) {
    warn(
      `[${label}] No Instagram professional account linked — IG posting\n` +
      `     unavailable for this page (link one in Business Suite →\n` +
      `     Settings → Linked accounts if you want it).`
    );
    return;
  }
  ok(`[${label}] Instagram linked: @${igAcct.username ?? igAcct.id}`);

  // content_publishing_limit requires instagram_content_publish — the
  // exact permission IG posting needs, so it's the perfect probe.
  const igProbe = await graph(
    pageToken,
    `${igAcct.id}/content_publishing_limit`
  );
  if (igProbe.json.error) {
    const e = igProbe.json.error;
    warn(
      `[${label}] IG account found but PUBLISHING WILL FAIL\n` +
      `     (code ${e.code}): "${e.message}"\n` +
      `     The token lacks instagram_basic / instagram_content_publish.\n` +
      `     Fix: regenerate the system-user token with BOTH checked\n` +
      `     (they only appear if the Meta app has Instagram permissions\n` +
      `     available — App Dashboard → use cases / products).`
    );
    return;
  }
  const used = igProbe.json.data?.[0]?.quota_usage;
  ok(
    `[${label}] IG publishing permission verified` +
    (used !== undefined ? ` (${used}/25 posts used in last 24h)` : "")
  );
}

console.log("\nFB Scheduler — connection diagnostics\n");

// ── Multi-page mode ───────────────────────────────────────────────
if (SYS) {
  if (!IDS.length) {
    fail("FB_SYSTEM_USER_TOKEN is set but FB_PAGE_IDS (or FB_PAGE_ID) is empty.");
  }
  ok(`.env loaded — multi-page mode (${IDS.length} page id(s), API ${V})`);

  const me = await graph(SYS, "me", { fields: "id,name" });
  if (me.json.error) {
    const e = me.json.error;
    fail(
      `System-user token invalid (code ${e.code}): "${e.message}"\n` +
      `     Regenerate it in Business settings → Users → System users →\n` +
      `     Generate token (never expire, with pages_show_list,\n` +
      `     pages_manage_posts, pages_read_engagement).`
    );
  }
  if (IDS.includes(me.json.id)) {
    fail(
      `FB_SYSTEM_USER_TOKEN identifies as PAGE "${me.json.name}" (${me.json.id})\n` +
      `     — that's a Page token, not a system-user token. A system-user\n` +
      `     token identifies as the system user itself. Generate one in\n` +
      `     Business settings → Users → System users → Generate token\n` +
      `     (never expire; pages_show_list, pages_manage_posts,\n` +
      `     pages_read_engagement) and paste THAT here.`
    );
  }
  ok(`System-user token valid — "${me.json.name}" (id ${me.json.id})`);

  for (const id of IDS) await probePage(`page ${id}`, SYS, id, true);

  console.log(
    `\n  🎉 All ${IDS.length} page(s) check out. Restart 'npm run dev' if it\n` +
    `     was running, and use the page switcher in the sidebar.\n`
  );
  process.exit(0);
}

// ── Legacy single-page mode ───────────────────────────────────────
if (!IDS.length) fail("FB_PAGE_ID / FB_PAGE_IDS is missing from .env");
if (!LEGACY_TOKEN) {
  fail(
    "No token found. Set FB_SYSTEM_USER_TOKEN (multi-page, recommended)\n" +
    "     or FB_PAGE_ACCESS_TOKEN (single-page)."
  );
}
if (/\s/.test(LEGACY_TOKEN)) {
  fail("FB_PAGE_ACCESS_TOKEN contains whitespace — re-paste it as one unbroken line.");
}
const PAGE_ID = IDS[0];
ok(`.env loaded — single-page mode (page ${PAGE_ID}, token ${LEGACY_TOKEN.length} chars, API ${V})`);

const me = await graph(LEGACY_TOKEN, "me", { fields: "id,name" });
if (me.json.error) {
  const e = me.json.error;
  if (e.code === 190) {
    fail(
      `Token is invalid or expired (code 190): "${e.message}"\n` +
      `     Short-lived Graph Explorer tokens die in ~1-2 hours. Use a\n` +
      `     system-user token (README → Setup) — it never expires.`
    );
  }
  fail(`Token check failed (code ${e.code}): "${e.message}"`);
}
ok(`Token is valid — belongs to: "${me.json.name}" (id ${me.json.id})`);

if (me.json.id !== PAGE_ID) {
  warn(`Token identity (${me.json.id}) ≠ FB_PAGE_ID (${PAGE_ID})`);
  // Show granted permissions to aid debugging.
  const perms = await graph(LEGACY_TOKEN, "me/permissions");
  if (perms.json.data?.length) {
    console.log(`\n  Permissions on this token:\n`);
    for (const p of perms.json.data) {
      console.log(`     ${p.status === "granted" ? "✅" : "❌"} ${p.permission} (${p.status})`);
    }
  }
  // Not a page token for this page — it may still be a user/system-user
  // token that can derive the page token. Probe directly:
  console.log(`\n  Trying direct page-token retrieval…\n`);
  await probePage("direct", LEGACY_TOKEN, PAGE_ID);
  note(
    `This token works as a *system-user/user* token. Recommended .env:\n\n` +
    `FB_SYSTEM_USER_TOKEN="${LEGACY_TOKEN}"\n` +
    `FB_PAGE_IDS="${PAGE_ID}"\n\n` +
    `  (remove FB_PAGE_ACCESS_TOKEN, keep or remove FB_PAGE_ID)\n`
  );
  process.exit(0);
}
ok("Token is a PAGE token for the configured page");

await probePage("page", LEGACY_TOKEN, PAGE_ID);
console.log(
  `\n  🎉 Everything checks out. If the app still shows an error, restart\n` +
  `     'npm run dev' so it picks up the current .env, and hard-refresh.\n`
);
