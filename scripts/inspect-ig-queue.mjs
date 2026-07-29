/**
 * Diagnostic: list non-published items in the Instagram queue (pending,
 * publishing, failed) with their stored error message, straight from
 * Appwrite. Run from the project root:  node scripts/inspect-ig-queue.mjs
 * Reads APPWRITE_* vars from .env, same pattern as diagnose.mjs.
 *
 * Useful whenever a scheduled IG post shows "failed" on /scheduled —
 * this surfaces the same `error` string that page shows, but from the
 * command line, and lists every non-published item at once rather than
 * one page at a time.
 */
import { readFileSync } from "node:fs";
import { Client, Databases, Query } from "node-appwrite";

const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
const env = {};
for (const line of raw.split("\n")) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}

const client = new Client()
  .setEndpoint(env.APPWRITE_ENDPOINT)
  .setProject(env.APPWRITE_PROJECT_ID)
  .setKey(env.APPWRITE_API_KEY);
const db = new Databases(client);
const DB = env.APPWRITE_DATABASE_ID;

try {
  const res = await db.listDocuments(DB, "ig_queue", [
    Query.notEqual("status", "published"),
    Query.orderDesc("scheduledAt"),
    Query.limit(50),
  ]);
  console.log(`Found ${res.total} non-published item(s):\n`);
  for (const doc of res.documents) {
    console.log(`--- ${doc.$id} ---`);
    console.log(`status:       ${doc.status}`);
    console.log(`pageId:       ${doc.pageId}`);
    console.log(`igUserId:     ${doc.igUserId}`);
    console.log(`igUsername:   ${doc.igUsername ?? "(none)"}`);
    console.log(`mediaType:    ${doc.mediaType ?? "image"}`);
    console.log(`scheduledAt:  ${doc.scheduledAt} (${new Date(doc.scheduledAt * 1000).toISOString()})`);
    console.log(`caption:      ${(doc.caption || "").slice(0, 80)}`);
    if (doc.status === "failed") {
      console.log(`ERROR:        ${doc.error ?? "(no error message stored)"}`);
    }
    console.log("");
  }
} catch (e) {
  console.error("Query failed:", e.message ?? e);
  process.exit(1);
}
