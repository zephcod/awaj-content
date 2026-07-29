/**
 * One-time setup: creates the `fb_queue` collection in Appwrite.
 * Run from the project root:  node scripts/setup-fb-db.mjs
 * Reads APPWRITE_* vars from .env.
 *
 * Unlike ig_queue/li_queue, this doesn't create or need a bucket — the
 * Facebook queue stages media in the same shared "profile" bucket
 * already used for Instagram Reel hosting (see MEDIA_BUCKET in
 * lib/storage.ts). This script just verifies it's reachable.
 */

import { readFileSync } from "node:fs";
import { Client, Databases, Storage } from "node-appwrite";

const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
const env = {};
for (const line of raw.split("\n")) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
}

for (const k of [
  "APPWRITE_ENDPOINT",
  "APPWRITE_PROJECT_ID",
  "APPWRITE_API_KEY",
  "APPWRITE_DATABASE_ID",
]) {
  if (!env[k]) {
    console.error(`❌ Missing ${k} in .env`);
    process.exit(1);
  }
}

const client = new Client()
  .setEndpoint(env.APPWRITE_ENDPOINT)
  .setProject(env.APPWRITE_PROJECT_ID)
  .setKey(env.APPWRITE_API_KEY);
const db = new Databases(client);
const DB = env.APPWRITE_DATABASE_ID;
const COLL = "fb_queue";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await db.createCollection(DB, COLL, "Facebook Queue");
  console.log("✅ Created collection fb_queue");
} catch (e) {
  if (e?.code === 409) console.log("• Collection fb_queue already exists");
  else throw e;
}

const attrs = [
  ["string", "pageId", 64, true],
  ["string", "caption", 63000, false],
  ["string", "link", 2000, false],
  ["string", "mediaType", 16, true], // text | image | multiImage | video
  ["string", "mediaRefs", 2000, false], // JSON array of Appwrite file ids
  ["string", "mediaContentType", 64, false],
  ["integer", "scheduledAt", null, true],
  ["string", "status", 16, true],
  ["string", "error", 500, false],
  ["string", "fbPostId", 128, false],
];

for (const [type, key, size, required] of attrs) {
  try {
    if (type === "string") {
      await db.createStringAttribute(DB, COLL, key, size, required);
    } else {
      await db.createIntegerAttribute(DB, COLL, key, required);
    }
    console.log(`✅ Attribute ${key}`);
  } catch (e) {
    if (e?.code === 409) console.log(`• Attribute ${key} already exists`);
    else throw e;
  }
  await sleep(400);
}

// Index for the due-post query (status + scheduledAt)
try {
  await sleep(1500); // attributes must finish processing first
  await db.createIndex(DB, COLL, "due_idx", "key", ["status", "scheduledAt"]);
  console.log("✅ Index due_idx");
} catch (e) {
  if (e?.code === 409) console.log("• Index due_idx already exists");
  else console.log(`⚠️  Index creation: ${e.message} (create manually if queries are slow)`);
}

// Index for the per-page listing query (pageId + status + scheduledAt)
try {
  await db.createIndex(DB, COLL, "page_idx", "key", ["pageId", "status", "scheduledAt"]);
  console.log("✅ Index page_idx");
} catch (e) {
  if (e?.code === 409) console.log("• Index page_idx already exists");
  else console.log(`⚠️  Index creation: ${e.message} (create manually if queries are slow)`);
}

// ── Verify the shared media bucket (no new bucket — reuses MEDIA_BUCKET) ──
const MEDIA_BUCKET_ID = "658477e7eef2f71d1693";
const storage = new Storage(client);
try {
  const bucket = await storage.getBucket(MEDIA_BUCKET_ID);
  console.log(`✅ Shared bucket ${MEDIA_BUCKET_ID} (${bucket.name}) is reachable`);
} catch (e) {
  console.log(`⚠️  Could not verify bucket ${MEDIA_BUCKET_ID}: ${e.message}`);
}

console.log("\n🎉 fb_queue is ready.\n");
